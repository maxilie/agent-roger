import { type TaskDefinition } from "../../zod-schema/stage-base/task-definition";

const task_summarizeContextRecursive: TaskDefinition = {
  isAbstract: true,
  stagePresets: [
    // see: `src/stage/presets`: STAGE_PRESETS
    "summarizeContextRecursive",
  ],
};

export default task_summarizeContextRecursive;
