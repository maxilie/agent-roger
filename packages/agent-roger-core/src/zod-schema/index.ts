import { z } from "zod";
import type * as neo4j from "neo4j-driver";

// this is the best (and only valid?) way to define JSON in zod
// see: https://zod.dev/?id=json-type
export const literalSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);
export type Literal = z.infer<typeof literalSchema>;
export type Json = Literal | { [key: string]: Json } | Json[];
export const jsonSchema: z.ZodType<Json> = z.lazy(() =>
  z.union([literalSchema, z.array(jsonSchema), z.record(jsonSchema)])
);
export type JsonObj = { [key: string]: Json };
export const jsonObjSchema: z.ZodType<JsonObj> = z.record(jsonSchema);

// task definition
export type TaskDefinition = {
  isAbstract: boolean;
  stagePresets: string[];
};

export const taskDefinitionSchema = z.object({
  isAbstract: z.boolean().default(false),
  stagePresets: z.array(z.string()).min(1).max(24),
});

// stage data
export const stageDataSchema = z.object({
  ended: z.boolean().default(false),
  subTasksSpawned: z
    .array(
      z.object({
        taskID: z.number(),
        localParentTag: z.union([z.string(), z.number()]).nullable(),
      })
    )
    .default([]),
  fields: jsonObjSchema,
});
export type StageData = z.infer<typeof stageDataSchema>;

// result data
export const resultDataSchema = z.object({
  failed: z.boolean().default(false),
  taskSummary: z.string().default(""),
  outputFields: jsonObjSchema.default({}),
});
export type ResultData = z.infer<typeof resultDataSchema>;

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
});

// schema for values that can be used to update a task
export const taskUpdateSchema = z.object({
  paused: z.boolean().default(false),
  success: z.boolean().nullish(),
  dead: z.boolean().default(false),
  lastEndedStage: z.number().default(-1),
  taskDefinition: taskDefinitionSchema.nullish(),
  initialInputFields: jsonObjSchema.nullish(),
  initialContextFields: jsonObjSchema.nullish(),
  initialContextSummary: z.string().nullish(),
  timeLastUpdated: z.date().default(() => new Date()),
  resultData: resultDataSchema.nullish(),
  runtimeErrors: z.array(z.string()).nullish(),
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

export type Neo4JTask = {
  properties: {
    taskID: neo4j.Integer;
    isDead: string;
  };
};
