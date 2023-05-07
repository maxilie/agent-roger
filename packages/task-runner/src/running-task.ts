import {
  type RedisManager,
  type Json,
  type TaskDefinition,
  db,
  MAX_UNSYNC_TIME,
  type StageData,
  type ResultData,
  schema,
  type JsonObj,
  type TaskBasicData,
  type TaskUpdateData,
  AI_MODELS,
  env,
} from "agent-roger-core";
import { eq } from "drizzle-orm";
import { type WeaviateClient } from "weaviate-ts-client2";
import { type PlanetScaleDatabase } from "drizzle-orm/planetscale-serverless";
import type * as neo4j from "neo4j-driver";
import { stage, type StageFunctionHelpers } from "agent-roger-core";
import { type RateLimiter } from "./rate-limiter";
import {
  Configuration as OpenAIConfiguration,
  OpenAIApi,
  type CreateChatCompletionRequest,
  type ChatCompletionRequestMessage,
  type CreateEmbeddingRequest,
  type CreateEmbeddingResponseDataInner,
} from "openai";

// instead of saving every action to SQL, run for up to 10 seconds
// ...and then save results to SQL if the task wasn't updated (by the dashboard user) in the meantime
const MAX_RUN_SECS = 10;

// type guard for fields which have a particular type expected by each stage function
const isExpectedType = (value: unknown, expectedType: string): boolean => {
  if (value === null) {
    return expectedType === "null";
  }

  switch (expectedType) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number";
    case "boolean":
      return typeof value === "boolean";
    case "object":
      return (
        typeof value === "object" &&
        !Array.isArray(value) &&
        Object.values(value).every((v) => isExpectedType(v, typeof v))
      );
    case "array":
      return (
        Array.isArray(value) && value.every((v) => isExpectedType(v, typeof v))
      );
    default:
      return false;
  }
};

class RunningTask {
  taskID: number;
  redis: RedisManager;
  weaviateClient: WeaviateClient;
  sqlClient: PlanetScaleDatabase;
  neo4jDriver: neo4j.Driver;
  rateLimiter: RateLimiter;
  taskBasicData: TaskBasicData | null;
  loadedStageData: { [stageIdx: number]: StageData };
  localStageIdx: number;
  stageDataIndicesAffected: Set<number>;
  unsavedSubTaskIDs: number[];
  unsavedResultData: ResultData | null;
  unsavedErrors: string[];
  wasPaused: boolean;
  startTime: Date;

  constructor(
    taskID: number,
    connections: {
      redis: RedisManager;
      weaviateClient: WeaviateClient;
      sqlClient: PlanetScaleDatabase;
      neo4jDriver: neo4j.Driver;
    },
    rateLimiter: RateLimiter
  ) {
    this.taskID = taskID;
    this.redis = connections.redis;
    this.weaviateClient = connections.weaviateClient;
    this.sqlClient = connections.sqlClient;
    this.neo4jDriver = connections.neo4jDriver;
    this.rateLimiter = rateLimiter;
    this.unsavedSubTaskIDs = [];
    this.loadedStageData = {};
    this.stageDataIndicesAffected = new Set();
    this.wasPaused = false;
    this.unsavedResultData = null;
    this.unsavedErrors = [];
    this.localStageIdx = -1;
    this.startTime = new Date();
    this.taskBasicData = null;
  }

  async runNextStages() {
    try {
      this.startTime = new Date();
      // get task data from SQL
      const task = await db.getTaskBasicData({ taskID: this.taskID });

      // validate task
      if (task == null) {
        this.redis.markTaskFinished(this.taskID);
        return;
      }
      this.taskBasicData = task;

      // get task definition
      const taskDefinition = schema.taskDefinition.parse(task.taskDefinition);
      const finalStageIdx = taskDefinition.stagePresets.length - 1;

      // get stage data
      this.localStageIdx = task.lastEndedStage + 1;
      if (this.localStageIdx <= finalStageIdx) {
        this.loadedStageData[this.localStageIdx] = schema.stageData.parse(
          task.currentStageData
        );
      }
      if (this.localStageIdx > 0) {
        this.loadedStageData[this.localStageIdx - 1] = schema.stageData.parse(
          task.previousStageData
        );
      }

      // for up to 10 seconds...
      while (
        new Date().getTime() - this.startTime.getTime() <
        1000 * MAX_RUN_SECS
      ) {
        // for each stage...
        // ensure local stage data for current stage
        if (!this.loadedStageData[this.localStageIdx]) {
          this.loadedStageData[this.localStageIdx] = schema.stageData.parse({
            ended: false,
            subTasksSpawned: {},
            fields: {},
          });
        }
        try {
          // get stage function
          const stageFunction =
            stage.preset[taskDefinition.stagePresets[this.localStageIdx]];
          const helpers: StageFunctionHelpers = {
            get: (key: string) => this.getHelper(key),
            set: (key: string, val: Json | null) => this.setHelper(key, val),
            textLLM: (data: {
              input: string[];
              numInputTokens: number;
              maxOutputTokens?: number;
            }) => this.textLLMHelper(data),
            embeddingLLM: (data: {
              input: string[];
              numInputTokens: number[];
            }) => this.embeddingLLMHelper(data),
            weaviateClient: this.weaviateClient,
            subTask: (
              input: {
                newTaskDefinition: TaskDefinition;
                initialInputFields?: JsonObj | null;
                initialContextFields?: JsonObj | null;
                initialContextSummary?: string | null;
              },
              localParentTag?: string | number | null
            ) => this.subTaskHelper(input, localParentTag),
            pauseTask: () => this.pauseTaskHelper(),
            endStage: (err: string | object) => this.endStageHelper(err),
            taskResult: (resultData: ResultData) =>
              this.taskResultHelper(resultData),
          };
          // run stage function
          await stageFunction(helpers);
        } catch (err) {
          // mark error and pause task
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          this.endStageHelper(err ?? "Unknown error");
          // save data
          await this.saveOrCleanup();
          // remove from redis queue
          this.redis.markTaskFinished(this.taskID);
          return;
        }

        // move to the next stage
        if (!this.isTaskFinished()) {
          this.localStageIdx += 1;
        } else {
          break;
        }
      }

      // after running stages for up to 10 seconds...
      // save data
      await this.saveOrCleanup();

      // move task back to the waiting queue when the next pipeline runs
      if (!this.isTaskFinished()) {
        this.redis.markTaskWaitingAgain(this.taskID);
      } else {
        this.redis.markTaskFinished(this.taskID);
      }
    } catch (error) {
      console.error(
        "Failed to run next stage(s) of task (id  #",
        this.taskID,
        "): "
      );
      console.error(error);
      await this.cleanup();
    }
  }

  /**
   * @returns true if task was paused, last stage was ended, or resultData was set
   */
  isTaskFinished() {
    if (!this.taskBasicData) return false;
    return (
      this.unsavedResultData != null ||
      this.wasPaused ||
      (this.localStageIdx ==
        this.taskBasicData.taskDefinition.stagePresets.length - 1 &&
        this.loadedStageData[this.localStageIdx].ended)
    );
  }

  /**
   * Undoes any changes we just made.
   */
  async cleanup() {
    try {
      for (const subTaskID of this.unsavedSubTaskIDs) {
        await db.deleteTaskTree({ taskID: subTaskID }, this.neo4jDriver);
      }
    } catch (err) {
      if (this.unsavedSubTaskIDs.length) {
        console.error(
          "FAILED TO CLEAN UP SUB-TASKS FROM A FAILED EXECUTION... The following sub-tasks are out-of-sync with their parent task and must be deleted from SQL and Neo4J: ",
          this.unsavedSubTaskIDs
        );
        console.error(err);
      }
    }
  }

  async getHelper<T extends Json | null>(key: string): Promise<T | null> {
    // look for field in current stage
    if (key in this.loadedStageData[this.localStageIdx].fields) {
      const val = this.loadedStageData[this.localStageIdx].fields[key];
      if (!isExpectedType(val, typeof val)) {
        throw new Error(
          `Expected field ${key} to be ${typeof val}, but it was ${typeof val}`
        );
      } else {
        return val as T;
      }
    }

    // look for field in previous stages
    let prevStage = this.localStageIdx - 1;
    while (prevStage >= 0) {
      // load previous stage
      if (!this.loadedStageData[prevStage]) {
        const prevStageData = await db.getTaskStageNData({
          taskID: this.taskID,
          stageN: prevStage,
        });
        this.loadedStageData[prevStage] =
          prevStageData ||
          schema.stageData.parse({
            ended: true,
            subTasksSpawned: {},
            fields: {},
          });
      }
      // check previous stage data for field
      if (key in this.loadedStageData[prevStage].fields) {
        const val = this.loadedStageData[prevStage].fields[key];
        if (!isExpectedType(val, typeof val)) {
          throw new Error(
            `Expected field ${key} to be ${typeof val}, but it was ${typeof val}`
          );
        } else {
          return val as T;
        }
      }
      prevStage -= 1;
    }
    // return null if field does not exist
    return null;
  }

  setHelper(key: string, val: Json | null) {
    this.loadedStageData[this.localStageIdx].fields[key] = val;
    this.stageDataIndicesAffected.add(this.localStageIdx);
    return "";
  }

  /**
   * If ending stage with an error, the whole task will be paused.
   *
   * NOTE: The stage function must return after calling endStage().
   */
  endStageHelper(error?: string | object) {
    this.stageDataIndicesAffected.add(this.localStageIdx);
    if (error) {
      const strErr =
        typeof error === "string" ? error : JSON.stringify(error, null, 2);
      this.unsavedErrors.push(strErr);
      this.wasPaused = true;
    } else {
      this.loadedStageData[this.localStageIdx].ended = true;
    }
  }

  /**
   * @param maxOutputTokens the max number of tokens to generate; if set too high or if unset, defaults to (model_maximum - num_input_tokens)
   * @param input messages for an instruction LLM e.g. [`System: You are a JSON machine.`, `Json: {...}`]
   * @returns the JSON output fields of the LLM. e.g. {someRequestedFieldName: value, someGeneratedFieldName: value}
   */
  async textLLMHelper(data: {
    input: string[];
    numInputTokens: number;
    maxOutputTokens?: number;
  }): Promise<JsonObj> {
    // decide which model to use (20% chance to use GPT-4 when GPT-3.5 would suffice)
    const modelInfo =
      env.GPT4_ENABLED && (data.numInputTokens > 2000 || Math.random() < 0.2)
        ? AI_MODELS.GPT4
        : AI_MODELS.GPT35;
    const modelMaxTokens = modelInfo.maxTokens;
    const maxOutputTokens = data.maxOutputTokens
      ? Math.min(data.maxOutputTokens, modelMaxTokens - data.numInputTokens)
      : modelMaxTokens - data.numInputTokens;

    // validate input length
    if (data.numInputTokens > modelMaxTokens * 0.95) {
      console.error(
        "CANNOT REQUEST AI INFERENCE FOR INPUT CONTAINING ",
        data.numInputTokens,
        " TOKENS! (max combined input & output is ",
        modelMaxTokens,
        " tokens). Returning no data for text LLM inference request with input: ",
        data.input
      );
      return {};
    }

    // wait for rate-limiting
    const maxRetries = 60;
    let retries = 0;
    while (
      retries <= maxRetries &&
      this.rateLimiter.willLimitBeReached(data.numInputTokens, modelInfo)
    ) {
      await new Promise((resolve) =>
        setTimeout(resolve, 2 + Math.random() * 20)
      );
      retries += 1;
    }
    if (retries >= maxRetries) {
      console.error(
        "COULD NOT SEND OPENAI INFERENCE REQUEST BECAUSE OF RATE-LIMITING. Input: ",
        data.input
      );
      return {};
    }

    // format input for OpenAI
    const messages: Array<ChatCompletionRequestMessage> = data.input.map(
      (msg) => {
        const msgParts = msg.split(":");
        const roleStr = msgParts[0].trim().toLowerCase();
        const isSystem = roleStr == "system";
        const isAssistant =
          roleStr == "assistant" || roleStr == "model" || roleStr == "ai";
        return {
          role: isSystem ? "system" : isAssistant ? "assistant" : "user",
          content: msgParts.slice(1).join(":").trim(),
          ...(!isSystem && !isAssistant ? { user: roleStr } : {}),
        };
      }
    );

    // call OpenAI
    const openai = new OpenAIApi(
      new OpenAIConfiguration({ apiKey: env.OPENAI_API_KEY })
    );
    // see CreateChatCompletionRequest: https://github.com/openai/openai-node/blob/master/api.ts
    const requestConfig: CreateChatCompletionRequest = {
      model: modelInfo.id,
      messages,
      max_tokens: maxOutputTokens,
      temperature: 0.7,
    };
    let outputStr: string;
    try {
      // see: https://platform.openai.com/docs/api-reference/chat/create?lang=node.js
      const response = await openai.createChatCompletion(requestConfig);
      if (response.status != 200)
        throw new Error(
          "Error response from OpenAI: " + JSON.stringify(response, null, 2)
        );
      outputStr = response.data.choices[0].message?.content ?? "";
      if (!outputStr || outputStr.length == 0) {
        throw new Error(
          "OpenAI returned an invalid response: " +
            JSON.stringify(response, null, 2)
        );
      }
    } catch (err) {
      console.error(
        "Failed to call OpenAI chat completion endpoint with request: ",
        requestConfig
      );
      console.error("Details: ", err);
      return {};
    }

    // parse JSON string from the LLM
    outputStr = outputStr.trim();

    if (!outputStr.startsWith("{")) {
      if (outputStr.includes("{")) {
        outputStr = outputStr.slice(outputStr.indexOf("{"));
      } else {
        outputStr = "{" + outputStr;
      }
    }
    if (!outputStr.endsWith("}")) {
      if (outputStr.includes("}")) {
        outputStr = outputStr.slice(0, outputStr.lastIndexOf("}") + 1);
      } else {
        outputStr = outputStr + "}";
      }
    }
    try {
      const outputRawJson: unknown = JSON.parse(outputStr);
      const outputJson = schema.jsonObj.parse(outputRawJson);
      return outputJson;
    } catch (error) {
      console.error(
        "Failed to parse JSON string from OpenAI. Will return empty object. \nRequest: ",
        requestConfig,
        "\nOutput string:",
        outputStr,
        "\nDecoding error: ",
        error
      );
      return {};
    }
  }

  /**
   * @param input an array of strings to embed, each with max length of 8k tokens
   *
   * NOTE: total length of all strings must be less than the rate limit for embedding requests (350k tokens/minute)
   */
  async embeddingLLMHelper(data: {
    input: string[];
    numInputTokens: number[];
  }): Promise<number[][] | null> {
    // validate input length
    const modelInfo = AI_MODELS.adaEmbedding;
    if (Math.max(...data.numInputTokens) > modelInfo.maxTokens) {
      console.error(
        "CANNOT REQUEST AI EMBEDDING INFERENCE FOR INPUT CONTAINING ",
        Math.max(...data.numInputTokens),
        " TOKENS! (max individual input is ",
        modelInfo.maxTokens,
        " tokens). Returning null for embedding LLM inference request with input: ",
        data.input
      );
      return null;
    }

    // wait for rate-limiting
    const maxRetries = 60;
    let retries = 0;
    while (
      retries <= maxRetries &&
      this.rateLimiter.willLimitBeReached(
        data.numInputTokens.reduce((a, b) => a + b, 0),
        modelInfo
      )
    ) {
      await new Promise((resolve) =>
        setTimeout(resolve, 2 + Math.random() * 20)
      );
      retries += 1;
    }
    if (retries >= maxRetries) {
      console.error(
        "COULD NOT SEND OPENAI EMBEDDING INFERENCE REQUEST BECAUSE OF RATE-LIMITING. Input: ",
        data.input,
        "\nTotal tokens: ",
        data.numInputTokens.reduce((a, b) => a + b, 0)
      );
      return null;
    }

    // call OpenAI
    const openai = new OpenAIApi(
      new OpenAIConfiguration({ apiKey: env.OPENAI_API_KEY })
    );
    // see CreateChatCompletionRequest: https://github.com/openai/openai-node/blob/master/api.ts
    const requestConfig: CreateEmbeddingRequest = {
      model: modelInfo.id,
      input: data.input,
    };
    try {
      // see: https://platform.openai.com/docs/api-reference/chat/create?lang=node.js
      const response = await openai.createEmbedding(requestConfig);
      if (response.status != 200)
        throw new Error(
          "Error response from OpenAI: " + JSON.stringify(response, null, 2)
        );
      if (response.data.data.length != data.input.length) {
        throw new Error(
          "OpenAI returned an invalid response: " +
            JSON.stringify(response, null, 2)
        );
      }
      const outputVectorsData: CreateEmbeddingResponseDataInner[] =
        response.data.data;
      return outputVectorsData.map((vectorData) => vectorData.embedding);
    } catch (err) {
      console.error(
        "Failed to call OpenAI embedding endpoint with request: ",
        requestConfig
      );
      console.error("Details: ", err);
      return null;
    }
  }

  /**
   * Creates a sub-task and returns its ID.
   *
   * Stages can "tag" their sub-tasks with a string or number, which can be used to identify the sub-task later.
   *
   * If the parent task is modified externally while task runner is executing, the sub-task will be deleted when cleanup() is called.
   */
  async subTaskHelper(
    input: {
      newTaskDefinition: TaskDefinition;
      initialInputFields?: JsonObj | null;
      initialContextFields?: JsonObj | null;
      initialContextSummary?: string | null;
    },
    localParentTag?: string | number | null
  ): Promise<number> {
    const newTaskID = await db.createChildTask(
      {
        parentID: this.taskID,
        taskDefinition: input.newTaskDefinition,
        initialInputFields: input.initialInputFields,
        initialContextFields: input.initialContextFields,
        initialContextSummary: input.initialContextSummary,
      },
      this.neo4jDriver,
      this.redis
    );
    if (!newTaskID) throw new Error("Failed to create sub-task in SQL");
    this.unsavedSubTaskIDs.push(newTaskID);
    this.loadedStageData[this.localStageIdx].subTasksSpawned.push({
      taskID: newTaskID,
      localParentTag: localParentTag ?? null,
    });
    this.stageDataIndicesAffected.add(this.localStageIdx);
    return newTaskID;
  }

  /**
   * NOTE: The current stage should return after pausing the task.
   */
  pauseTaskHelper() {
    this.wasPaused = true;
  }

  /**
   * Ends the task with the result data. If `resultData.failed` is not set, the task will be marked as successful.
   */
  taskResultHelper(resultData: ResultData) {
    this.unsavedResultData = resultData;
  }

  /**
   * Checks if any stage or task data was changed, and saves the changes to SQL.
   *
   * If more than `MAX_UNSYNC_TIME` seconds elapsed since beginning task execution,
   * and if the task was modified externally, then data is NOT saved and cleanup()
   * is called to delete any newly created sub-tasks.
   */
  async saveOrCleanup() {
    // don't save if nothing changed
    if (
      !this.wasPaused &&
      this.unsavedResultData == null &&
      this.stageDataIndicesAffected.size === 0 &&
      this.unsavedErrors.length == 0 &&
      this.unsavedSubTaskIDs.length == 0
    ) {
      return;
    }

    // check if task was modified externally
    if (new Date().getTime() - this.startTime.getTime() > MAX_UNSYNC_TIME) {
      const response = await this.sqlClient
        .select({ lastInteractionMarker: db.tasks.lastInteractionMarker })
        .from(db.tasks)
        .where(eq(db.tasks.taskID, this.taskID));
      if (
        response == null ||
        response.length == 0 ||
        response[0].lastInteractionMarker !=
          this.taskBasicData?.lastInteractionMarker
      ) {
        console.log(
          "Task was modified externally. Task runner's changes will not be saved."
        );
        await this.cleanup();
        return;
      }
    }

    // assemble task data for SQL
    const taskSucceeded =
      this.unsavedResultData == null
        ? this.taskBasicData?.success
        : "failed" in this.unsavedResultData && this.unsavedResultData.failed
        ? false
        : true;
    const lastEndedStage = this.loadedStageData[this.localStageIdx].ended
      ? this.localStageIdx
      : this.localStageIdx - 1;
    const newTaskData: TaskUpdateData = schema.updateTask.parse({
      paused: this.wasPaused ? true : this.taskBasicData?.paused,
      success: taskSucceeded,
      lastEndedStage,
      ...(this.unsavedResultData ? { resultData: this.unsavedResultData } : {}),
      ...(0 in this.stageDataIndicesAffected
        ? { stage0Data: this.loadedStageData[0] }
        : {}),
      ...(1 in this.stageDataIndicesAffected
        ? { stage1Data: this.loadedStageData[1] }
        : {}),
      ...(2 in this.stageDataIndicesAffected
        ? { stage2Data: this.loadedStageData[2] }
        : {}),
      ...(3 in this.stageDataIndicesAffected
        ? { stage3Data: this.loadedStageData[3] }
        : {}),
      ...(4 in this.stageDataIndicesAffected
        ? { stage4Data: this.loadedStageData[4] }
        : {}),
      ...(5 in this.stageDataIndicesAffected
        ? { stage5Data: this.loadedStageData[5] }
        : {}),
      ...(6 in this.stageDataIndicesAffected
        ? { stage6Data: this.loadedStageData[6] }
        : {}),
      ...(7 in this.stageDataIndicesAffected
        ? { stage7Data: this.loadedStageData[7] }
        : {}),
      ...(8 in this.stageDataIndicesAffected
        ? { stage8Data: this.loadedStageData[8] }
        : {}),
      ...(9 in this.stageDataIndicesAffected
        ? { stage9Data: this.loadedStageData[9] }
        : {}),
      ...(10 in this.stageDataIndicesAffected
        ? { stage10Data: this.loadedStageData[10] }
        : {}),
      ...(11 in this.stageDataIndicesAffected
        ? { stage11Data: this.loadedStageData[11] }
        : {}),
      ...(12 in this.stageDataIndicesAffected
        ? { stage12Data: this.loadedStageData[12] }
        : {}),
      ...(13 in this.stageDataIndicesAffected
        ? { stage13Data: this.loadedStageData[13] }
        : {}),
      ...(14 in this.stageDataIndicesAffected
        ? { stage14Data: this.loadedStageData[14] }
        : {}),
      ...(15 in this.stageDataIndicesAffected
        ? { stage15Data: this.loadedStageData[15] }
        : {}),
      ...(16 in this.stageDataIndicesAffected
        ? { stage16Data: this.loadedStageData[16] }
        : {}),
      ...(17 in this.stageDataIndicesAffected
        ? { stage17Data: this.loadedStageData[17] }
        : {}),
      ...(18 in this.stageDataIndicesAffected
        ? { stage18Data: this.loadedStageData[18] }
        : {}),
      ...(19 in this.stageDataIndicesAffected
        ? { stage19Data: this.loadedStageData[19] }
        : {}),
      ...(20 in this.stageDataIndicesAffected
        ? { stage20Data: this.loadedStageData[20] }
        : {}),
      ...(21 in this.stageDataIndicesAffected
        ? { stage21Data: this.loadedStageData[21] }
        : {}),
      ...(22 in this.stageDataIndicesAffected
        ? { stage22Data: this.loadedStageData[22] }
        : {}),
      ...(23 in this.stageDataIndicesAffected
        ? { stage23Data: this.loadedStageData[23] }
        : {}),
    });

    // save task
    await db.saveTaskData(
      { taskID: this.taskID, newFields: newTaskData },
      this.neo4jDriver,
      this.redis
    );
  }
}

export { RunningTask };
