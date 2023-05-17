import { type TaskDefinition } from "../../zod-schema/stage-base/task-definition";

const task_summarizeSubTaskOutputsRecursive: TaskDefinition = {
  isAbstract: true,
  stagePresets: [
    // see: `src/stage/presets`: STAGE_PRESETS
    "summarizeContextRecursive",
  ],
};

export default task_summarizeSubTaskOutputsRecursive;
