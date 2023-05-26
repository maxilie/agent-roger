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
  type TextLlmInput,
  assembleTextLlmInput,
  type TrainingDataExample,
} from "agent-roger-core";
import fs from "fs/promises";
import path from "path";
import * as crypto from "crypto";
const { exec } = await import("child_process");
import { type WeaviateClient } from "weaviate-ts-client";
import type * as neo4j from "neo4j-driver";
import { stage, type StageFunctionHelpers } from "agent-roger-core";
import { type RateLimiter } from "./rate-limiter.js";
import { MIN_TIME_BETWEEN_SAME_STAGE_CALLS } from "./constants.js";
import {
  Configuration as OpenAIConfiguration,
  OpenAIApi,
  type CreateChatCompletionRequest,
  type ChatCompletionRequestMessage,
  type CreateEmbeddingRequest,
  type CreateEmbeddingResponseDataInner,
} from "openai";
import { eq } from "drizzle-orm";

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
  timeStageWasCalled: { [stageIdx: number]: number };
  memoryBankID: "global" | string | null;
  unsavedTrainingData: TrainingDataExample[];
  wasRestartedWhileRunning: boolean;

  constructor(
    taskID: number,
    connections: {
      redis: RedisManager;
      weaviateClient: WeaviateClient;
      neo4jDriver: neo4j.Driver;
    },
    rateLimiter: RateLimiter
  ) {
    this.taskID = taskID;
    this.redis = connections.redis;
    this.weaviateClient = connections.weaviateClient;
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
    this.timeStageWasCalled = {};
    this.memoryBankID = null;
    this.unsavedTrainingData = [];
    this.wasRestartedWhileRunning = false;
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
      this.memoryBankID = task.memoryBankID;

      // get stage data
      this.localStageIdx = task.lastEndedStage + 1;
      if (this.localStageIdx <= finalStageIdx) {
        this.loadedStageData[this.localStageIdx] = schema.stageData.parse(
          task.currentStageData || {
            ended: false,
            subTasksSpawned: [],
            fields: {},
          }
        );
      }
      if (this.localStageIdx > 0) {
        this.loadedStageData[this.localStageIdx - 1] = schema.stageData.parse(
          task.previousStageData || {
            ended: false,
            subTasksSpawned: [],
            fields: {},
          }
        );
      }

      // for up to 10 seconds...
      while (
        !this.isTaskFinished() &&
        new Date().getTime() - this.startTime.getTime() < 1000 * MAX_RUN_SECS
      ) {
        // for each stage...
        if (this.loadedStageData[this.localStageIdx].ended) {
          this.localStageIdx += 1;
        }
        // check to wait before calling the same stage again
        const now = new Date().getTime();
        if (
          this.localStageIdx in this.timeStageWasCalled &&
          now - this.timeStageWasCalled[this.localStageIdx] <
            MIN_TIME_BETWEEN_SAME_STAGE_CALLS
        ) {
          await new Promise((r) =>
            setTimeout(
              r,
              MIN_TIME_BETWEEN_SAME_STAGE_CALLS -
                (now - this.timeStageWasCalled[this.localStageIdx])
            )
          );
        }
        this.timeStageWasCalled[this.localStageIdx] = now;

        // ensure local stage data for current stage
        if (!this.loadedStageData[this.localStageIdx]) {
          this.loadedStageData[this.localStageIdx] = schema.stageData.parse({
            ended: false,
            subTasksSpawned: [],
            fields: {},
          });
        }
        try {
          // get stage function
          const stageFunction =
            stage.preset[taskDefinition.stagePresets[this.localStageIdx]];
          if (!stageFunction || typeof stageFunction !== "function") {
            this.endStageHelper(
              // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
              "ERROR: Invalid stage function, '" +
                taskDefinition.stagePresets[this.localStageIdx] +
                "', does not map to a valid function in 'packages/agent-roger-core/stage/preset.ts'. Instead, the preset mapped to: " +
                stageFunction
            );
            await this.saveOrCleanup();
            return;
          }

          const helpers: StageFunctionHelpers = {
            initialInputFields: task.initialInputFields || {},
            initialContextFields: task.initialContextFields || {},
            initialContextSummary: task.initialContextSummary || "",
            get: (key: string) => this.getHelper(key),
            set: (key: string, val: Json | null) => this.setHelper(key, val),
            // if null or "global", the global memory bank will be used
            memoryBankID: this.memoryBankID,
            switchMemoryBank: (newMemoryBankID: "global" | string | null) =>
              this.switchMemoryBankHelper(newMemoryBankID),
            textLLM: (data: TextLlmInput) => this.textLlmHelper(data),
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
            endStage: (err?: string | object) => this.endStageHelper(err),
            taskResult: (resultData: ResultData) =>
              this.taskResultHelper(resultData),
            restartTaskWhileRunning: (newInput: {
              initialInputFields: JsonObj;
              initialContextFields?: JsonObj | null;
              initialContextSummary?: string | null;
            }) => this.restartTaskWhileRunningHelper(newInput),
            execCmd: (cmd: string) => this.executeCmdHelper(cmd),
            readOrCreateFile: (fileName: string) =>
              this.readOrCreateFileHelper(fileName),
            writeToFile: (fileName: string, content: string) =>
              this.writeFileHelper(fileName, content),
          };
          // run stage function
          await stageFunction(helpers);
        } catch (err) {
          console.error("ERROR IN STAGE FUNCTION: ");
          console.error(err);
          // mark error and pause task
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          this.endStageHelper(
            err ? (err as Error).toString() : "Unknown error"
          );
          // save data
          await this.saveOrCleanup();
          // remove from redis queue
          this.redis.markTaskFinished(this.taskID);
          return;
        }
      }

      // after running stages for up to 10 seconds...
      // save data
      await this.saveOrCleanup();

      // move task back to the waiting queue when the next pipeline runs
      if (!this.isTaskFinished() || this.wasRestartedWhileRunning) {
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
   * @returns true if task was paused, task was restarted, last stage was ended, or resultData was set
   */
  isTaskFinished() {
    if (!this.taskBasicData) return false;
    return (
      this.wasRestartedWhileRunning ||
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
            subTasksSpawned: [],
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
   * Uses the llm to generate the `data.requestedOutputFields` and validates it with another llm.
   */
  async textLlmHelper(data: TextLlmInput): Promise<JsonObj> {
    let firstOutput = "";
    let secondOutput = "";
    let parsedJson: JsonObj = {};
    try {
      // get response or error
      firstOutput = await this.getTextLlmString(data);

      if (!firstOutput) {
        throw new Error("No output received from first llm call");
      }

      // run first output through the llm to fix formatting
      const secondPrompt =
        "System: You are a highly logical, careful, and thorough JSON input/output machine. You can only output properly formatted \
        JSON, and nothing else. Your output is a JSON object, meaning: it is wrapped with curly braces; field names are strings \
        wrapped with double quotes; field values are either string, number, boolean, array, null, or JSON object; there is no added \
        explanation text, comments, or readability formatting (like using ``` ... ``` to 'code fence' blocks of code, or **...** to \
        bold text, or line breaks and indentation between JSON fields).\
        \n Obviously, you are capable of producing readability formatting within your output fields -- if, for example, the field is \
        supposed to generate a string containing markdown or HTML -- but you do not put unexpected formatting in fields that call for \
        code/text/JSON/array/summary/etc., nor do you add formatting between fields.\
        \n Your top priority is to ensure that your output is fully string-escaped and otherwise properly formatted so as to be \
        parseable by the JSON.parse() function. If one were to call JSON.parse(yourOutputString), it should return a valid object, \
        beginning and ending with curly braces.\
        \n Whenever the user gives you a json input, you validate it and return a better formatted version of it, if possible, to make \
        sure it can be parsed by JSON.parse().";
      const secondLlmInput = assembleTextLlmInput({
        prompt: { t: firstOutput },
        expectedOutputFields: {},
        systemMessage: secondPrompt,
      });
      secondLlmInput.chatMlMessages = [secondPrompt, "User: " + firstOutput];
      secondOutput = await this.getTextLlmString(secondLlmInput);

      // parse llm output
      secondOutput = secondOutput.trim();

      if (!secondOutput.startsWith("{")) {
        if (secondOutput.includes("{")) {
          secondOutput = secondOutput.slice(secondOutput.indexOf("{"));
        } else {
          secondOutput = "{" + secondOutput;
        }
      }
      if (!secondOutput.endsWith("}")) {
        if (secondOutput.includes("}")) {
          secondOutput = secondOutput.slice(
            0,
            secondOutput.lastIndexOf("}") + 1
          );
        } else {
          secondOutput = secondOutput + "}";
        }
      }

      // convert to json
      try {
        parsedJson = schema.jsonObj.parse(JSON.parse(secondOutput));
      } catch (error) {
        parsedJson = schema.jsonObj.parse(JSON.parse(firstOutput));
      }

      // add example to list of training data to save later
      this.unsavedTrainingData.push({
        input: data.chatMlMessages,
        output: JSON.stringify(parsedJson),
        qualityRating: 0,
      });

      // check if the AI has requested to pause the task
      if (parsedJson.pauseReason) {
        this.setHelper("pauseReason", parsedJson.pauseReason);
        this.setHelper("failedLlmOutput", JSON.stringify(parsedJson));
      }
      return parsedJson;
    } catch (error) {
      const errMessage = `Failed to generate llm output: ${
        (error as Error).name
      }: ${(error as Error).message}. 
        \n First output: ${firstOutput}
        \n Second output: ${secondOutput}
        \n Parsed JSON: ${JSON.stringify(parsedJson, null, 2)}`;
      this.setHelper("pauseReason", errMessage);
      throw new Error(errMessage);
    }
  }

  // generates llm output
  async getTextLlmString(data: TextLlmInput): Promise<string> {
    // decide which model to use (20% chance to use GPT-4 when GPT-3.5 would suffice)
    const modelInfo =
      env.GPT4_ENABLED && (data.numInputTokens > 2000 || Math.random() < 0.2)
        ? AI_MODELS.gpt4
        : AI_MODELS.gpt35Turbo;
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
        data.chatMlMessages
      );
      return "";
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
        data.chatMlMessages
      );
      return "";
    }

    // format input for OpenAI
    const messages: Array<ChatCompletionRequestMessage> =
      data.chatMlMessages.map((msg) => {
        const msgParts = msg.split(":");
        const roleStr = msgParts[0].trim().toLowerCase();
        const isSystem = roleStr == "system";
        const isAssistant =
          roleStr == "assistant" || roleStr == "model" || roleStr == "ai";
        return {
          role: isSystem ? "system" : isAssistant ? "assistant" : "user",
          content: msgParts.slice(1).join(":").trim(),
          ...(!isSystem && !isAssistant ? { name: roleStr } : {}),
        };
      });

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
      return outputStr;
    } catch (err) {
      console.error(
        "Failed to call OpenAI chat completion endpoint with request: ",
        requestConfig
      );
      console.error("Details: ", err);
      return "";
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
        memoryBankID: this.memoryBankID,
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
   * Switches the memory bank used by the task and any children created after this point.
   */
  async switchMemoryBankHelper(
    newMemoryBankID: "global" | string | null
  ): Promise<void> {
    const memoryBankID = newMemoryBankID || crypto.webcrypto.randomUUID();
    this.memoryBankID = memoryBankID;
    // create schema if it doesn't exist
    const documentClass = "Class-" + memoryBankID;
    try {
      await this.weaviateClient.schema
        .classCreator()
        .withClass({
          class: documentClass,
          vectorizer: "none",
        })
        .do();
    } catch (_) {}
  }

  /**
   * @param {string} command A shell command to execute
   * @return {Promise<string>} A promise that resolve to the output of the shell command, or an error
   */
  async executeCmdHelper(command: string): Promise<string> {
    /**
     * @param {Function} resolve A function that resolves the promise
     * @param {Function} reject A function that fails the promise
     * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise
     */
    return new Promise(function (resolve, reject) {
      /**
       * @param {Error} error An error triggered during the execution of the childProcess.exec command
       * @param {string|Buffer} standardOutput The result of the shell command execution
       * @param {string|Buffer} standardError The error resulting of the shell command execution
       * @see https://nodejs.org/api/child_process.html#child_process_child_process_exec_command_options_callback
       */ exec(command, function (error, standardOutput, standardError) {
        // handle errors
        if (error) {
          reject(
            new Error(
              "Error executing shell command: " +
                error.name +
                ": " +
                error.message
            )
          );
          return;
        }
        if (standardError) {
          reject(new Error(standardError.trim()));
          return;
        }
        // return command line output
        resolve(standardOutput.trim());
      });
    });
  }

  async readOrCreateFileHelper(fileName: string): Promise<string> {
    try {
      // check if the file exists
      await fs.access(fileName);

      // if file exists, return its contents
      const data = await fs.readFile(fileName, "utf8");
      return data;
    } catch (error) {
      // if the error is because the file does not exist, create it
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === "ENOENT") {
        await fs.mkdir(path.dirname(fileName), { recursive: true });
        await fs.writeFile(fileName, "", "utf8");
        return "";
      }

      // if the error is for another reason, throw it
      throw error;
    }
  }

  async writeFileHelper(fileName: string, fileContents: string): Promise<true> {
    try {
      await fs.writeFile(fileName, fileContents, "utf8");
      return true;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Presses "undo" on the task, by marking its sub-tasks as dead and deleting all stage data, and restarts it with new inputs.
   */
  async restartTaskWhileRunningHelper(newInput: {
    initialInputFields: JsonObj;
    initialContextFields?: JsonObj | null;
    initialContextSummary?: string | null;
  }): Promise<void> {
    this.wasRestartedWhileRunning = true;
    // kill descendent tasks
    await db.killDescendents({ taskID: this.taskID }, this.neo4jDriver);
    // update stage data
    await db.sqlClient
      .update(db.tasks)
      .set({
        paused: false,
        success: null,
        dead: false,
        lastEndedStage: -1,
        lastInteractionMarker: crypto.webcrypto.randomUUID(),
        initialInputFields: newInput.initialInputFields,
        initialContextFields: newInput.initialContextFields,
        initialContextSummary: newInput.initialContextSummary,
        resultData: null,
        stage0Data: null,
        stage1Data: null,
        stage2Data: null,
        stage3Data: null,
        stage4Data: null,
        stage5Data: null,
        stage6Data: null,
        stage7Data: null,
        stage8Data: null,
        stage9Data: null,
        stage10Data: null,
        stage11Data: null,
        stage12Data: null,
        stage13Data: null,
        stage14Data: null,
        stage15Data: null,
        stage16Data: null,
        stage17Data: null,
        stage18Data: null,
        stage19Data: null,
        stage20Data: null,
        stage21Data: null,
        stage22Data: null,
        stage23Data: null,
      })
      .where(eq(db.tasks.taskID, this.taskID));
  }

  /**
   * Checks if any stage or task data was changed, and saves the changes to SQL.
   *
   * If more than `MAX_UNSYNC_TIME` seconds elapsed since beginning task execution,
   * and if the task was modified externally, then data is NOT saved and cleanup()
   * is called to delete any newly created sub-tasks.
   */
  async saveOrCleanup() {
    if (this.wasRestartedWhileRunning) return;
    try {
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
        const lastInteractionMarker = await db.getLastInteractionMarker(
          this.taskID
        );
        if (
          lastInteractionMarker != this.taskBasicData?.lastInteractionMarker
        ) {
          console.warn(
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
        memoryBankID: this.memoryBankID,
        paused: this.wasPaused ? true : this.taskBasicData?.paused,
        success: taskSucceeded,
        lastEndedStage,
        ...(this.unsavedErrors.length
          ? { runtimeErrors: this.unsavedErrors }
          : {}),
        ...(this.unsavedResultData
          ? { resultData: this.unsavedResultData }
          : {}),
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

      // save training data
      for (const example of this.unsavedTrainingData) {
        await db.saveTrainingData(example);
      }
    } catch (err) {}
  }
}

export { RunningTask };
