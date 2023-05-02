import { z } from "zod";
import { jsonSchema } from "../db";

const stageDataSchema = z.object({
  subTasksSpawned: z.array(
    z.object({
      taskID: z.number(),
      localParentTag: z.union([z.string(), z.number()]).nullable(),
    })
  ),
  fields: z.record(jsonSchema),
});
type StageData = z.infer<typeof stageDataSchema>;

export { StageData, stageDataSchema };
