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
  connection,
  RedisManager,
  REDIS_TASK_QUEUE,
  InSchema_saveTaskData,
  InSchema_createRootTask,
  InSchema_getRootTaskIDs,
  InSchema_getTaskBasicData,
  InSchema_getTaskBasicDatas,
  InSchema_getTaskStageNData,
  InSchema_getTaskTree,
  InSchema_getTaskTreeIDs,
  InSchema_createChildTask,
  Neo4JTask,
  withNeo4jDriver,
  withRedis,
  getActiveTaskIDs,
  Json,
  jsonSchema,
  InSchema_deleteTaskTree,
  deleteTaskTree,
} from "./db";
import { MAX_UNSYNC_TIME } from "./constants";
import {
  type StageFunction,
  type StageFunctionHelpers,
  type StageData,
  STAGE_PRESETS,
  stageDataSchema,
} from "./stage";
import { type TaskDefinition, TASK_PRESETS } from "./task";

interface DB {
  tasks: typeof tasks;
  conn: typeof connection;
  withNeo4jDriver: typeof withNeo4jDriver;
  withRedis: typeof withRedis;
  getRootTaskIDs: typeof getRootTaskIDs;
  getActiveTaskIDs: typeof getActiveTaskIDs;
  getTaskBasicData: typeof getTaskBasicData;
  getTaskBasicDatas: typeof getTaskBasicDatas;
  saveTaskData: typeof saveTaskData;
  createRootTask: typeof createRootTask;
  createChildTask: typeof createChildTask;
  getTaskTreeIDs: typeof getTaskTreeIDs;
  getTaskTree: typeof getTaskTree;
  deleteTaskTree: typeof deleteTaskTree;
}

const db: DB = {
  tasks: tasks,
  conn: connection,
  withNeo4jDriver: withNeo4jDriver,
  withRedis: withRedis,
  getRootTaskIDs: getRootTaskIDs,
  getActiveTaskIDs: getActiveTaskIDs,
  getTaskBasicData: getTaskBasicData,
  getTaskBasicDatas: getTaskBasicDatas,
  saveTaskData: saveTaskData,
  createRootTask: createRootTask,
  createChildTask: createChildTask,
  getTaskTreeIDs: getTaskTreeIDs,
  getTaskTree: getTaskTree,
  deleteTaskTree: deleteTaskTree,
};

interface Schema {
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
  json: typeof jsonSchema;
}

const schema: Schema = {
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
  json: jsonSchema,
  // TODO task.TaskDefinition: Schema_TaskDefinition (at least 1 stage, not more than 24)
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
  preset: STAGE_PRESETS,
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
  StageFunctionHelpers,
  StageFunction,
  StageData,
  TaskDefinition,
  schema,
  RedisManager,
  REDIS_TASK_QUEUE,
  Neo4JTask,
  MAX_UNSYNC_TIME,
};
