import { type TaskDefinition } from "../..";

const task_abstract: TaskDefinition = {
  isAbstract: true,
  stagePresets: [
    // see: `src/stage/presets`: STAGE_PRESETS
    "generateSemanticContextQueries",
    "generateKeywordContextQueries",
    "generateSemanticQueryEmbeddings",
    "queryRawContext",
    "summarizeContext",
    "generateStepsAndSuccessCriteria",
    "generateStepPersonalization",
    "generateSubTasks",
    "summarizeSubTaskOutputs",
    "validateOutput",
    "decideCorrectiveAction",
  ],
};

const task_abstract2: TaskDefinition = {
  isAbstract: true,
  stagePresets: [
    // You can set custom stages here to define your own abstract task lifecycle.
    // To use your custom abstract task, export it as the default `task_abstract`.
  ],
};

export default task_abstract;
