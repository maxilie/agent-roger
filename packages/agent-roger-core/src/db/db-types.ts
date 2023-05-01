import { z } from "zod";
import type * as neo4j from "neo4j-driver";

// this is the best (and only valid?) way to define JSON in zod
// see: https://zod.dev/?id=json-type
const literalSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
type Literal = z.infer<typeof literalSchema>;
type Json = Literal | { [key: string]: Json } | Json[];
export const jsonSchema: z.ZodType<Json> = z.lazy(() =>
  z.union([literalSchema, z.array(jsonSchema), z.record(jsonSchema)])
);

// schema for only the basic data (no stage data) of a row in the tasks table
export const TASK_BASIC_DATA_SCHEMA = z.object({
  taskID: z.number(),
  paused: z.boolean().default(false),
  success: z.boolean().nullable(),
  dead: z.boolean().default(false),
  lastEndedStage: z.number().default(-1),
  isAbstract: z.boolean().default(false),
  parentID: z.number().nullable(),
  taskDefinition: jsonSchema,
  initialInputFields: jsonSchema.nullable(),
  initialContextFields: jsonSchema.nullable(),
  initialContextSummary: z.string().nullable(),
  timeCreated: z.date().default(() => new Date()),
  timeLastUpdated: z.date().default(() => new Date()),
  resultData: jsonSchema.nullable(),
  runtimeErrors: jsonSchema.nullable(),
});

// schema for a complete row in the tasks table
export const TASK_DATA_SCHEMA = TASK_BASIC_DATA_SCHEMA.merge(
  z.object({
    stage0Data: jsonSchema.nullable(),
    stage1Data: jsonSchema.nullable(),
    stage2Data: jsonSchema.nullable(),
    stage3Data: jsonSchema.nullable(),
    stage4Data: jsonSchema.nullable(),
    stage5Data: jsonSchema.nullable(),
    stage6Data: jsonSchema.nullable(),
    stage7Data: jsonSchema.nullable(),
    stage8Data: jsonSchema.nullable(),
    stage9Data: jsonSchema.nullable(),
    stage10Data: jsonSchema.nullable(),
    stage11Data: jsonSchema.nullable(),
    stage12Data: jsonSchema.nullable(),
    stage13Data: jsonSchema.nullable(),
    stage14Data: jsonSchema.nullable(),
    stage15Data: jsonSchema.nullable(),
    stage16Data: jsonSchema.nullable(),
    stage17Data: jsonSchema.nullable(),
    stage18Data: jsonSchema.nullable(),
    stage19Data: jsonSchema.nullable(),
    stage20Data: jsonSchema.nullable(),
    stage21Data: jsonSchema.nullable(),
    stage22Data: jsonSchema.nullable(),
    stage23Data: jsonSchema.nullable(),
  })
);

// schema for a newly created root task
export const NEW_ROOT_TASK_SCHEMA = z.object({
  taskDefinition: jsonSchema,
  initialInputFields: jsonSchema.nullable(),
  initialContextFields: jsonSchema.nullable(),
  initialContextSummary: z.string().nullable(),
});

// schema for a newly created child task
export const NEW_CHILD_TASK_SCHEMA = z.object({
  isAbstract: z.union([z.literal(true), z.literal(false)]),
  parentID: z.number(),
  taskDefinition: jsonSchema,
  initialInputFields: jsonSchema.nullable(),
  initialContextFields: jsonSchema.nullable(),
  initialContextSummary: z.string().nullable(),
});

// schema for values that can be used to update a task
export const TASK_UPDATE_SCHEMA = z.object({
  paused: z.boolean().nullish(),
  success: z.boolean().nullish(),
  dead: z.boolean().nullish(),
  taskDefinition: jsonSchema.nullish(),
  initialInputFields: jsonSchema.nullish(),
  initialContextFields: jsonSchema.nullish(),
  initialContextSummary: z.string().nullish(),
  timeLastUpdated: z.date().default(() => new Date()),
  resultData: jsonSchema.nullish(),
  runtimeErrors: jsonSchema.nullish(),
  stage0Data: jsonSchema.nullish(),
  stage1Data: jsonSchema.nullish(),
  stage2Data: jsonSchema.nullish(),
  stage3Data: jsonSchema.nullish(),
  stage4Data: jsonSchema.nullish(),
  stage5Data: jsonSchema.nullish(),
  stage6Data: jsonSchema.nullish(),
  stage7Data: jsonSchema.nullish(),
  stage8Data: jsonSchema.nullish(),
  stage9Data: jsonSchema.nullish(),
  stage10Data: jsonSchema.nullish(),
  stage11Data: jsonSchema.nullish(),
  stage12Data: jsonSchema.nullish(),
  stage13Data: jsonSchema.nullish(),
  stage14Data: jsonSchema.nullish(),
  stage15Data: jsonSchema.nullish(),
  stage16Data: jsonSchema.nullish(),
  stage17Data: jsonSchema.nullish(),
  stage18Data: jsonSchema.nullish(),
  stage19Data: jsonSchema.nullish(),
  stage20Data: jsonSchema.nullish(),
  stage21Data: jsonSchema.nullish(),
  stage22Data: jsonSchema.nullish(),
  stage23Data: jsonSchema.nullish(),
});

export type Neo4JTask = {
  properties: {
    taskID: neo4j.Integer;
    isDead: string;
  };
};
