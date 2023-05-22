import { EXECUTE_SHELL_STAGE_FNS } from "./task-execute-shell/index.js";
import { ABSTRACT_TASK_STAGE_FNS } from "./task-abstract/index.js";
import { SUMMARIZE_TEXT_STAGE_FNS } from "./task-summarize-text/index.js";
import { REDUCE_JSON_STAGE_FNS } from "./task-reduce-json/index.js";
import { INDEX_FILE_STAGE_FNS } from "./task-index-file/index.js";
import { type TaskDefinition } from "../zod-schema/index.js";
import { type StageFunction } from "./stage-function.js";
import { SEARCH_MEMORY_BANK_STAGE_FNS } from "./task-search-memory-bank/index.js";
import { SWITCH_MEMORY_BANK_STAGE_FNS } from "./task-switch-memory-bank/index.js";
import { GENERATE_JSON_STAGE_FNS } from "./task-generate-json/index.js";
import { MODIFY_FILE_STAGE_FNS } from "./task-modify-file/index.js";

/**
 * Register new stage functions here.
 */
const stageFunctionsToRegister: { [key: string]: StageFunction }[] = [
  ABSTRACT_TASK_STAGE_FNS,
  EXECUTE_SHELL_STAGE_FNS,
  SUMMARIZE_TEXT_STAGE_FNS,
  REDUCE_JSON_STAGE_FNS,
  GENERATE_JSON_STAGE_FNS,
  INDEX_FILE_STAGE_FNS,
  MODIFY_FILE_STAGE_FNS,
  SEARCH_MEMORY_BANK_STAGE_FNS,
  SWITCH_MEMORY_BANK_STAGE_FNS,
];

/**
 * Define new tasks here, using the stage function names in `REGISTERED_STAGE_FNS`.
 */
const TASK_PRESETS: { [key: string]: TaskDefinition } = {
  abstract: {
    isAbstract: true,
    stagePresets: [
      // see: /src/stage/task-abstract/index.ts
      "observeTaskHistory",
      "generateStepsAndSuccessCriteria",
      "expandStepInstructions",
      "generateSubTasks",
      "summarizeSubTaskOutputs",
      "validateOutput",
      "decideCorrectiveAction",
    ],
  },
  summarizeText: {
    isAbstract: false,
    stagePresets: [
      // see: /src/stage/task-summarize-text/index.ts
      "getSummarizationInput",
      "splitTextToSummarize",
    ],
  },
  reduceJson: {
    isAbstract: false,
    stagePresets: [
      // see: /src/stage/task-reduce-json/index.ts
      "getJsonToReduce",
      "splitJsonToReduce",
    ],
  },
  executeShell: {
    isAbstract: false,
    stagePresets: [
      // see: /src/stage/task-execute-shell/index.ts
      "execCommand",
      "shortenCommand",
      "shortenShellOutput",
      "shortenErrorMessage",
      "summarizeShellEvent",
    ],
  },
  indexFile: {
    isAbstract: false,
    stagePresets: [
      // see: /src/stage/task-index-file/index.ts
      "clearFileFromMemoryBank",
      "getFileLines",
      "splitFileLinesIntoChunks",
      "summarizeChunksOfIndividualLines",
      "embedChunks",
      "embedChunkFileSegments",
      "generateBroadFileSegments",
      "embedBroadFileSegments",
      "saveNewDocuments",
    ],
  },
  modifyFile: {
    isAbstract: false,
    stagePresets: [
      // see: /src/stage/task-modify-file/index.ts
      "deleteFileIfRequested",
    ],
  },
  switchMemoryBank: {
    isAbstract: false,
    stagePresets: [
      // see: /src/stage/task-switch-memory-bank/index.ts
      "switchMemoryBank",
    ],
  },
  searchMemoryBank: {
    isAbstract: false,
    stagePresets: [
      // see: /src/stage/task-search-memory-bank/index.ts
      "getQueries",
      "generateQueryVariations",
      "generateQueryEmbeddings",
      "getUniqueDocuments",
    ],
  },
  generateJson: {
    isAbstract: false,
    stagePresets: [
      // see: /src/stage/task-generate-json/index.ts
      "generateJson",
    ],
  },
  // TODO [eventually] operate_browser
  // TODO [maybe] task_execute_typescript
};

// check for duplicate stage function names
const REGISTERED_STAGE_FNS: { [key: string]: StageFunction } = {};
for (const stageFunctionsMap of stageFunctionsToRegister) {
  for (const stageFunctionName of Object.keys(stageFunctionsMap)) {
    if (stageFunctionName in REGISTERED_STAGE_FNS) {
      throw new Error(
        `Tried to register multiple stage functions to the same name: ${stageFunctionName}.`
      );
    }
    REGISTERED_STAGE_FNS[stageFunctionName] =
      stageFunctionsMap[stageFunctionName];
  }
}

// check that each task's stage presets are registered
for (const taskName of Object.keys(TASK_PRESETS)) {
  const stagePresets = TASK_PRESETS[taskName].stagePresets;
  for (const stagePreset of stagePresets) {
    if (!(stagePreset in REGISTERED_STAGE_FNS)) {
      throw new Error(
        `TaskDefinition for "${taskName}" task contains an unregistered stage preset: ${stagePreset}.`
      );
    }
  }
}

export { REGISTERED_STAGE_FNS, TASK_PRESETS };
