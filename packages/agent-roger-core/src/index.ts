import { env as _env } from "./env.mjs";
import {
  createChildTask,
  createRootTask,
  getRootTaskIDs,
  getTaskBasicData,
  getTaskBasicDatas,
  getTaskTree,
  getTaskTreeIDs,
  saveTaskData,
  tasks,
  RedisManager,
  REDIS_TASK_QUEUE,
  withNeo4jDriver,
  withRedis,
  getActiveTaskIDs,
  deleteTaskTree,
  getTaskStageNData,
  getLastInteractionMarker,
  pauseTask,
  pauseTaskTree,
  unpauseTask,
  unpauseTaskTree,
  killDescendents,
  restartTaskTree,
  saveTrainingData,
  saveInjectedPrompt,
  getInjectedPrompt,
  getHistoricalAiCall,
  getTrainingDataExample,
  getBatchHistoricalAiCallIDs,
  getBatchInjectedPromptIDs,
  getBatchRecentTaskIDs,
  getBatchTrainingDataIDs,
  trainingData,
  injectedPrompts,
  newInjectedPrompts,
  sqlClient,
  insertHistoricalAiCall,
  deletePromptHistory,
  isInjectedPromptPresent,
  isTrainingDataExamplePresent,
  deleteTrainingData,
  deleteInjectedPrompt,
} from "./db";
import {
  AI_MODELS,
  AiModel,
  MAX_UNSYNC_TIME,
  TRAINING_DATA_TAGS,
} from "./constants";
import {
  type StageFunction,
  type StageFunctionHelpers,
  REGISTERED_STAGE_FNS,
  TASK_PRESETS,
} from "./stage";
import {
  Neo4JTask,
  ResultData,
  StageData,
  resultDataSchema,
  stageDataSchema,
  taskBasicDataSchema,
  TaskBasicData,
  taskDataSchema,
  TaskData,
  taskUpdateSchema,
  TaskUpdateData,
  newRootTaskSchema,
  newChildTaskSchema,
  InSchema_saveTaskData,
  InSchema_createRootTask,
  InSchema_getRootTaskIDs,
  InSchema_getTaskBasicData,
  InSchema_getTaskBasicDatas,
  InSchema_getTaskStageNData,
  InSchema_getTaskTree,
  InSchema_getTaskTreeIDs,
  InSchema_createChildTask,
  InSchema_deleteTaskTree,
  OutSchema_getTaskTree,
  OutSchema_createRootTask,
  OutSchema_getTaskBasicDataPlus,
  OutSchema_getTaskStageNData,
  OutSchema_createChildTask,
  OutSchema_getRootTaskIDs,
  OutSchema_getTaskBasicDatas,
  runtimeErrorsSchema,
  RuntimeErrors,
  type VectorDbDocument,
  TrainingDataExample,
  InjectedPrompt,
  injectedPromptSchema,
  trainingDataExampleSchema,
  HistoricalAiCall,
  historicalAiCallSchema,
} from "./zod-schema";
import {
  Json,
  JsonObj,
  jsonObjSchema,
  jsonSchema,
} from "./zod-schema/stage-base/json.js";
import { TaskDefinition, taskDefinitionSchema } from "./zod-schema/stage-base";
import { SYSTEM_MESSAGES } from "./constants/prompts.js";

export interface DB {
  tasks: typeof tasks;
  trainingData: typeof trainingData;
  injectedPrompts: typeof injectedPrompts;
  newInjectedPrompts: typeof newInjectedPrompts;
  sqlClient: typeof sqlClient;
  withNeo4jDriver: typeof withNeo4jDriver;
  withRedis: typeof withRedis;
  getRootTaskIDs: typeof getRootTaskIDs;
  getActiveTaskIDs: typeof getActiveTaskIDs;
  getTaskBasicData: typeof getTaskBasicData;
  getTaskBasicDatas: typeof getTaskBasicDatas;
  getTaskStageNData: typeof getTaskStageNData;
  saveTaskData: typeof saveTaskData;
  createRootTask: typeof createRootTask;
  createChildTask: typeof createChildTask;
  getTaskTreeIDs: typeof getTaskTreeIDs;
  getTaskTree: typeof getTaskTree;
  deleteTaskTree: typeof deleteTaskTree;
  getLastInteractionMarker: typeof getLastInteractionMarker;
  pauseTask: typeof pauseTask;
  pauseTaskTree: typeof pauseTaskTree;
  unpauseTask: typeof unpauseTask;
  unpauseTaskTree: typeof unpauseTaskTree;
  killDescendents: typeof killDescendents;
  restartTaskTree: typeof restartTaskTree;
  saveTrainingData: typeof saveTrainingData;
  saveInjectedPrompt: typeof saveInjectedPrompt;
  insertHistoricalAiCall: typeof insertHistoricalAiCall;
  getInjectedPrompt: typeof getInjectedPrompt;
  getTrainingDataExample: typeof getTrainingDataExample;
  getHistoricalAiCall: typeof getHistoricalAiCall;
  getBatchHistoricalAiCallIDs: typeof getBatchHistoricalAiCallIDs;
  getBatchInjectedPromptIDs: typeof getBatchInjectedPromptIDs;
  getBatchRecentTaskIDs: typeof getBatchRecentTaskIDs;
  getBatchTrainingDataIDs: typeof getBatchTrainingDataIDs;
  deletePromptHistory: typeof deletePromptHistory;
  isInjectedPromptPresent: typeof isInjectedPromptPresent;
  isTrainingDataExamplePresent: typeof isTrainingDataExamplePresent;
  deleteTrainingData: typeof deleteTrainingData;
  deleteInjectedPrompt: typeof deleteInjectedPrompt;
}

const db: DB = {
  tasks: tasks,
  trainingData: trainingData,
  injectedPrompts: injectedPrompts,
  newInjectedPrompts: newInjectedPrompts,
  sqlClient: sqlClient,
  withNeo4jDriver: withNeo4jDriver,
  withRedis: withRedis,
  getRootTaskIDs: getRootTaskIDs,
  getActiveTaskIDs: getActiveTaskIDs,
  getTaskBasicData: getTaskBasicData,
  getTaskBasicDatas: getTaskBasicDatas,
  getTaskStageNData: getTaskStageNData,
  saveTaskData: saveTaskData,
  createRootTask: createRootTask,
  createChildTask: createChildTask,
  getTaskTreeIDs: getTaskTreeIDs,
  getTaskTree: getTaskTree,
  deleteTaskTree: deleteTaskTree,
  getLastInteractionMarker: getLastInteractionMarker,
  pauseTask: pauseTask,
  pauseTaskTree: pauseTaskTree,
  unpauseTask: unpauseTask,
  unpauseTaskTree: unpauseTaskTree,
  killDescendents: killDescendents,
  restartTaskTree: restartTaskTree,
  saveTrainingData: saveTrainingData,
  saveInjectedPrompt: saveInjectedPrompt,
  insertHistoricalAiCall: insertHistoricalAiCall,
  getInjectedPrompt: getInjectedPrompt,
  getTrainingDataExample: getTrainingDataExample,
  getHistoricalAiCall: getHistoricalAiCall,
  getBatchHistoricalAiCallIDs: getBatchHistoricalAiCallIDs,
  getBatchInjectedPromptIDs: getBatchInjectedPromptIDs,
  getBatchRecentTaskIDs: getBatchRecentTaskIDs,
  getBatchTrainingDataIDs: getBatchTrainingDataIDs,
  deletePromptHistory: deletePromptHistory,
  isInjectedPromptPresent: isInjectedPromptPresent,
  isTrainingDataExamplePresent: isTrainingDataExamplePresent,
  deleteTrainingData: deleteTrainingData,
  deleteInjectedPrompt: deleteInjectedPrompt,
};

export interface Schema {
  json: typeof jsonSchema;
  jsonObj: typeof jsonObjSchema;
  trainingDataExample: typeof trainingDataExampleSchema;
  injectedPrompt: typeof injectedPromptSchema;
  historicalAiCall: typeof historicalAiCallSchema;
  input: {
    saveTask: typeof InSchema_saveTaskData;
    createRootTask: typeof InSchema_createRootTask;
    createChildTask: typeof InSchema_createChildTask;
    getRootTaskIDs: typeof InSchema_getRootTaskIDs;
    getTaskBasicData: typeof InSchema_getTaskBasicData;
    getTaskBasicDatas: typeof InSchema_getTaskBasicDatas;
    getTaskStageNData: typeof InSchema_getTaskStageNData;
    getTaskTree: typeof InSchema_getTaskTree;
    getTaskTreeIDs: typeof InSchema_getTaskTreeIDs;
    deleteTaskTree: typeof InSchema_deleteTaskTree;
  };
  output: {
    createRootTask: typeof OutSchema_createRootTask;
    createChildTask: typeof OutSchema_createChildTask;
    getRootTaskIDs: typeof OutSchema_getRootTaskIDs;
    getTaskBasicData: typeof OutSchema_getTaskBasicDataPlus;
    getTaskBasicDatas: typeof OutSchema_getTaskBasicDatas;
    getTaskStageNData: typeof OutSchema_getTaskStageNData;
    getTaskTree: typeof OutSchema_getTaskTree;
  };
  task: {
    taskDefinition: typeof taskDefinitionSchema;
    stageData: typeof stageDataSchema;
    resultData: typeof resultDataSchema;
    runtimeErrors: typeof runtimeErrorsSchema;
    taskBasicData: typeof taskBasicDataSchema;
    taskData: typeof taskDataSchema;
    updateTask: typeof taskUpdateSchema;
    newRootTask: typeof newRootTaskSchema;
    newChildTask: typeof newChildTaskSchema;
  };
}

const schema: Schema = {
  json: jsonSchema,
  jsonObj: jsonObjSchema,
  trainingDataExample: trainingDataExampleSchema,
  injectedPrompt: injectedPromptSchema,
  historicalAiCall: historicalAiCallSchema,
  input: {
    saveTask: InSchema_saveTaskData,
    createRootTask: InSchema_createRootTask,
    createChildTask: InSchema_createChildTask,
    getRootTaskIDs: InSchema_getRootTaskIDs,
    getTaskBasicData: InSchema_getTaskBasicData,
    getTaskBasicDatas: InSchema_getTaskBasicDatas,
    getTaskStageNData: InSchema_getTaskStageNData,
    getTaskTree: InSchema_getTaskTree,
    getTaskTreeIDs: InSchema_getTaskTreeIDs,
    deleteTaskTree: InSchema_deleteTaskTree,
  },
  output: {
    createRootTask: OutSchema_createRootTask,
    createChildTask: OutSchema_createChildTask,
    getRootTaskIDs: OutSchema_getRootTaskIDs,
    getTaskBasicData: OutSchema_getTaskBasicDataPlus,
    getTaskBasicDatas: OutSchema_getTaskBasicDatas,
    getTaskStageNData: OutSchema_getTaskStageNData,
    getTaskTree: OutSchema_getTaskTree,
  },
  task: {
    taskDefinition: taskDefinitionSchema,
    stageData: stageDataSchema,
    resultData: resultDataSchema,
    runtimeErrors: runtimeErrorsSchema,
    taskBasicData: taskBasicDataSchema,
    taskData: taskDataSchema,
    updateTask: taskUpdateSchema,
    newRootTask: newRootTaskSchema,
    newChildTask: newChildTaskSchema,
  },
};

export interface Prompts {
  system: typeof SYSTEM_MESSAGES;
}

export const prompts: Prompts = {
  system: SYSTEM_MESSAGES,
};

/**
 * A task definition is a set of stage presets.
 *
 * Abstract tasks can spawn abstract sub-tasks, but non-abstract tasks can only spawn non-abstract sub-tasks.
 *
 * An abstract task provides stages of an open-ended task lifecycle.
 *  - Its stage functions reduce a complex task into simpler abstract tasks and/or specific actions (non-abstract tasks).
 *
 * A non-abstract task provides stages of a straightforward service.
 * - Its stage functions take input data and use it to perform a requested action or generate some requested content.
 */

type StagePresets = { preset: { [key: string]: StageFunction } };
type TaskPresets = { preset: { [key: string]: TaskDefinition } };

const stage: StagePresets = {
  preset: REGISTERED_STAGE_FNS,
};

const task: TaskPresets = {
  preset: TASK_PRESETS,
};

const env: typeof _env = _env;

export {
  env,
  stage,
  task,
  db,
  Json,
  JsonObj,
  StageFunctionHelpers,
  StageFunction,
  StageData,
  ResultData,
  RuntimeErrors,
  TaskDefinition,
  TaskBasicData,
  TaskData,
  TaskUpdateData,
  schema,
  RedisManager,
  REDIS_TASK_QUEUE,
  Neo4JTask,
  MAX_UNSYNC_TIME,
  AI_MODELS,
  AiModel,
  TrainingDataExample,
  InjectedPrompt,
  HistoricalAiCall,
  VectorDbDocument,
  TRAINING_DATA_TAGS,
};

export * from "./model-input";
