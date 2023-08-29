import { z } from "zod";
import type * as neo4j from "neo4j-driver";
import { jsonObjSchema, jsonSchema } from "./stage-base/json";
import {
  subTasksSpawnedSchema,
  taskDefinitionSchema,
  type TaskDefinition,
} from "./stage-base";

// stage data
export const stageDataSchema = z.object({
  ended: z.boolean().default(false),
  subTasksSpawned: subTasksSpawnedSchema,
  fields: jsonObjSchema.default({}),
});
export type StageData = z.infer<typeof stageDataSchema>;

// result data
export const resultDataSchema = z.object({
  failed: z.boolean().default(false),
  taskSummary: z.string().default(""),
  outputFields: jsonObjSchema.default({}),
});
export type ResultData = z.infer<typeof resultDataSchema>;

// runtime errors
export const runtimeErrorsSchema = z.array(z.string()).nullish();
export type RuntimeErrors = z.infer<typeof runtimeErrorsSchema>;

// schema for only the basic data (no stage data) of a row in the tasks table
export const taskBasicDataSchema = z.object({
  taskID: z.number(),
  paused: z.boolean().default(false),
  success: z.boolean().nullable(),
  dead: z.boolean().default(false),
  lastEndedStage: z.number().default(-1),
  lastInteractionMarker: z.string().nullable(),
  isAbstract: z.boolean().default(false),
  parentID: z.number().nullable(),
  taskDefinition: taskDefinitionSchema,
  initialInputFields: jsonObjSchema.nullable(),
  initialContextFields: jsonObjSchema.nullable(),
  initialContextSummary: z.string().nullable(),
  memoryBankID: z.string().nullable(),
  timeCreated: z.date().default(() => new Date()),
  timeLastUpdated: z.date().default(() => new Date()),
  resultData: resultDataSchema.nullable(),
  runtimeErrors: z.array(z.string()).nullable(),
});
export type TaskBasicData = z.infer<typeof taskBasicDataSchema>;

// schema for a complete row in the tasks table
export const taskDataSchema = taskBasicDataSchema.merge(
  z.object({
    stage0Data: stageDataSchema.nullable(),
    stage1Data: stageDataSchema.nullable(),
    stage2Data: stageDataSchema.nullable(),
    stage3Data: stageDataSchema.nullable(),
    stage4Data: stageDataSchema.nullable(),
    stage5Data: stageDataSchema.nullable(),
    stage6Data: stageDataSchema.nullable(),
    stage7Data: stageDataSchema.nullable(),
    stage8Data: stageDataSchema.nullable(),
    stage9Data: stageDataSchema.nullable(),
    stage10Data: stageDataSchema.nullable(),
    stage11Data: stageDataSchema.nullable(),
    stage12Data: stageDataSchema.nullable(),
    stage13Data: stageDataSchema.nullable(),
    stage14Data: stageDataSchema.nullable(),
    stage15Data: stageDataSchema.nullable(),
    stage16Data: stageDataSchema.nullable(),
    stage17Data: stageDataSchema.nullable(),
    stage18Data: stageDataSchema.nullable(),
    stage19Data: stageDataSchema.nullable(),
    stage20Data: stageDataSchema.nullable(),
    stage21Data: stageDataSchema.nullable(),
    stage22Data: stageDataSchema.nullable(),
    stage23Data: stageDataSchema.nullable(),
  })
);

export type TaskData = z.infer<typeof taskDataSchema>;

// schema for a newly created root task
export const newRootTaskSchema = z.object({
  taskDefinition: taskDefinitionSchema,
  initialInputFields: jsonObjSchema.nullable(),
  initialContextFields: jsonObjSchema.nullable(),
  initialContextSummary: z.string().nullable(),
});

// schema for a newly created child task
export const newChildTaskSchema = z.object({
  isAbstract: z.union([z.literal(true), z.literal(false)]),
  parentID: z.number(),
  taskDefinition: taskDefinitionSchema,
  initialInputFields: jsonObjSchema.nullable(),
  initialContextFields: jsonObjSchema.nullable(),
  initialContextSummary: z.string().nullable(),
  memoryBankID: z.string().nullable(),
});

// schema for values that can be used to update a task
export const taskUpdateSchema = z.object({
  paused: z.boolean().optional(),
  success: z.boolean().nullish(),
  dead: z.boolean().optional(),
  lastEndedStage: z.number().optional(),
  taskDefinition: taskDefinitionSchema.nullish(),
  initialInputFields: jsonObjSchema.nullish(),
  initialContextFields: jsonObjSchema.nullish(),
  initialContextSummary: z.string().nullish(),
  memoryBankID: z.string().nullish(),
  resultData: resultDataSchema.nullish(),
  runtimeErrors: runtimeErrorsSchema.nullish(),
  stage0Data: stageDataSchema.nullish(),
  stage1Data: stageDataSchema.nullish(),
  stage2Data: stageDataSchema.nullish(),
  stage3Data: stageDataSchema.nullish(),
  stage4Data: stageDataSchema.nullish(),
  stage5Data: stageDataSchema.nullish(),
  stage6Data: stageDataSchema.nullish(),
  stage7Data: stageDataSchema.nullish(),
  stage8Data: stageDataSchema.nullish(),
  stage9Data: stageDataSchema.nullish(),
  stage10Data: stageDataSchema.nullish(),
  stage11Data: stageDataSchema.nullish(),
  stage12Data: stageDataSchema.nullish(),
  stage13Data: stageDataSchema.nullish(),
  stage14Data: stageDataSchema.nullish(),
  stage15Data: stageDataSchema.nullish(),
  stage16Data: stageDataSchema.nullish(),
  stage17Data: stageDataSchema.nullish(),
  stage18Data: stageDataSchema.nullish(),
  stage19Data: stageDataSchema.nullish(),
  stage20Data: stageDataSchema.nullish(),
  stage21Data: stageDataSchema.nullish(),
  stage22Data: stageDataSchema.nullish(),
  stage23Data: stageDataSchema.nullish(),
});

export type TaskUpdateData = z.infer<typeof taskUpdateSchema>;

export const InSchema_getRootTaskIDs = z.object({
  n: z.number().min(1).default(20),
});
export const OutSchema_getRootTaskIDs = z.array(z.number()).nullable();
export type InType_getRootTaskIDs = z.infer<typeof InSchema_getRootTaskIDs>;
export type OutType_getRootTaskIDs = z.infer<typeof OutSchema_getRootTaskIDs>;
export const InSchema_getTaskBasicData = z.object({
  taskID: z.number(),
});
export const OutSchema_getTaskBasicDataPlus = taskBasicDataSchema.merge(
  z.object({
    previousStageData: jsonSchema.nullable(),
    currentStageData: jsonSchema.nullable(),
  })
);
export type InType_getTaskBasicData = z.infer<typeof InSchema_getTaskBasicData>;
export type OutType_getTaskBasicData = z.infer<typeof taskBasicDataSchema>;
export type OutType_getTaskBasicDataPlus = z.infer<
  typeof OutSchema_getTaskBasicDataPlus
>;
export const InSchema_getTaskBasicDatas = z.object({
  taskIDs: z.array(z.number().min(1)),
});
export const OutSchema_getTaskBasicDatas = z.array(taskBasicDataSchema);
export type InType_getTaskBasicDatas = z.infer<
  typeof InSchema_getTaskBasicDatas
>;
export type OutType_getTaskBasicDatas = z.infer<
  typeof OutSchema_getTaskBasicDatas
>;
export const InSchema_getTaskStageNData = z.object({
  taskID: z.number(),
  stageN: z.number().min(0).max(23),
});
export type InType_getTaskStageNData = z.infer<
  typeof InSchema_getTaskStageNData
>;

export const OutSchema_getTaskStageNData = stageDataSchema.nullable();
export type OutType_getStageNData = z.infer<typeof OutSchema_getTaskStageNData>;
export const InSchema_saveTaskData = z.object({
  taskID: z.number().min(1),
  newFields: taskUpdateSchema,
});
export type InType_saveTaskData = z.infer<typeof InSchema_saveTaskData>;
export const InSchema_createRootTask = z.object({
  taskDefinition: jsonSchema,
  initialInputFields: jsonSchema.nullish(),
  initialContextFields: jsonSchema.nullish(),
  initialContextSummary: z.string().nullish(),
});
export const OutSchema_createRootTask = z.number();
export type InType_createRootTask = z.infer<typeof InSchema_createRootTask>;
export type OutType_createRootTask = z.infer<typeof OutSchema_createRootTask>;
export const InSchema_createChildTask = z.object({
  parentID: z.number(),
  taskDefinition: taskDefinitionSchema,
  initialInputFields: jsonObjSchema.nullish(),
  initialContextFields: jsonObjSchema.nullish(),
  initialContextSummary: z.string().nullish(),
  memoryBankID: z.string().nullish(),
});
export const OutSchema_createChildTask = z.number();
export type InType_createChildTask = z.infer<typeof InSchema_createChildTask>;
export type OutType_createChildTask = z.infer<typeof OutSchema_createChildTask>;
export const InSchema_getTaskTreeIDs = z.object({
  rootTaskID: z.number().min(1),
});
export type InType_getTaskTreeIDs = z.infer<typeof InSchema_getTaskTreeIDs>;
export const InSchema_deleteTaskTree = z.object({
  taskID: z.number().min(1),
});
export type InType_deleteTaskTree = z.infer<typeof InSchema_deleteTaskTree>;
export const InSchema_getTaskTree = z.object({
  rootTaskID: z.number().nullish(),
});
export const OutSchema_getTaskTree = z.object({
  taskIDs: z.array(z.number()),
  links: z.array(
    z.object({
      source: z.number(),
      target: z.number(),
    })
  ),
  tasks: z.array(taskBasicDataSchema),
});
export type InType_getTaskTree = z.infer<typeof InSchema_getTaskTree>;
export type OutType_getTaskTree = z.infer<typeof OutSchema_getTaskTree>;

export type Neo4JTask = {
  properties: {
    taskID: neo4j.Integer;
    isDead: string;
  };
};

export type VectorDbDocument = {
  id: string;
  content: string;
  location: string;
};

export const trainingDataExampleSchema = z.object({
  inputMessages: z.array(z.string()),
  outputMessage: z.string(),
  categoryTag: z.string(),
  qualityRating: z.number().min(0).max(5),
});
export type TrainingDataExample = z.infer<typeof trainingDataExampleSchema>;

export const injectedPromptSchema = z.object({
  userMessage: z.string(),
  assistantMessage: z.string(),
  numTokens: z.number().min(1),
});
export type InjectedPrompt = z.infer<typeof injectedPromptSchema>;

export const historicalAiCallSchema = z.object({
  taskID: z.number(),
  systemMessage: z.string(),
  userMessage: z.string(),
  assistantMessage: z.string(),
  timestamp: z.date(),
});
export type HistoricalAiCall = z.infer<typeof historicalAiCallSchema>;

export { taskDefinitionSchema, type TaskDefinition };
