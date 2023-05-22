import {
  type StageFunctionHelpers,
  type StageFunction,
} from "../stage-function.js";

export const MODIFY_FILE_STAGE_FNS: { [key: string]: StageFunction } = {
  // eslint-disable-next-line @typescript-eslint/require-await
  deleteFileIfRequested: async (helpers: StageFunctionHelpers) => {
    // TODO Delete file in the task-runner
    helpers.taskResult({
      failed: false,
      taskSummary: "Deleted file.",
      outputFields: {},
    });
  },
};
