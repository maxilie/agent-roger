/*
 * WARNING: Only change the schema in this file if you know what you're doing and you are
 * also changing the core code that relies on these schemas.
 *
 * If you want to add schema to use in your own custom stages, add it to a new file in the
 * `stage-base` folder and `export * from ./your-new-file.ts` in `stage-base/index.ts`.
 */

import { z } from "zod";

// task definition
export type TaskDefinition = {
  isAbstract: boolean;
  stagePresets: string[];
};
export const taskDefinitionSchema = z.object({
  isAbstract: z.boolean().default(false),
  stagePresets: z.array(z.string()).min(1).max(24),
});

// schema for generateSubTasks stage
export const subTasksSpawnedSchema = z
  .array(
    z.object({
      taskID: z.number(),
      localParentTag: z.union([z.string(), z.number()]).nullable(),
    })
  )
  .default([]);
export type SubTasksSpawned = z.infer<typeof subTasksSpawnedSchema>;
export const taskStepsDataSchema = z.object({
  stepIdxToDescription: z.record(z.string()).default({}),
  stepIdxToTaskDefinition: z.record(taskDefinitionSchema).default({}),
  stepIdxToSubTaskID: z.record(z.number()).default({}),
  stepIdxToDependentStepIdx: z.record(z.number()).default({}),
});
export type TasksStepsData = z.infer<typeof taskStepsDataSchema>;

export type VectorDbDocument = {
  uuid: string;
  content: string;
  location: string;
  timeString?: string;
};
