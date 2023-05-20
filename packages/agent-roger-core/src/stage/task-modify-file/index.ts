import {
  type StageFunctionHelpers,
  type StageFunction,
} from "../stage-function.js";

export const MODIFY_FILE_STAGE_FNS: { [key: string]: StageFunction } = {
  // eslint-disable-next-line @typescript-eslint/require-await
  splitText2: async (helpers: StageFunctionHelpers) => {
    helpers.endStage();
  },
};
