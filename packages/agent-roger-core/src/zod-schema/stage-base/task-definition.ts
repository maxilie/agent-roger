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
