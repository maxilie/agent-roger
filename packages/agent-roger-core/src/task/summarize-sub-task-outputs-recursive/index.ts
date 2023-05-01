import { type TaskDefinition } from "../..";

const task_summarizeSubTaskOutputsRecursive: TaskDefinition = {
  isAbstract: true,
  stagePresets: [
    // see: `src/stage/presets`: STAGE_PRESETS
    "summarizeContextRecursive",
  ],
};

export default task_summarizeSubTaskOutputsRecursive;
