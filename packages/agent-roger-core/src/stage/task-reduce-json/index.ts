import {
  type StageFunctionHelpers,
  type StageFunction,
} from "../stage-function.js";

export const REDUCE_JSON_STAGE_FNS: { [key: string]: StageFunction } = {
  // eslint-disable-next-line @typescript-eslint/require-await
  splitJson: async (helpers: StageFunctionHelpers) => {
    helpers.endStage();
  },
};
