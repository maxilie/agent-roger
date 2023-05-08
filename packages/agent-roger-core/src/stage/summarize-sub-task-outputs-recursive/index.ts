import {
  type StageFunctionHelpers,
  type StageFunction,
} from "../stage-function.js";

const stageFn_summarizeSubTaskOutputsRecursive: StageFunction = async (
  helpers: StageFunctionHelpers
) => {
  return await new Promise((resolve, reject) => {
    setTimeout(() => {
      resolve();
    }, 1000);
  });
};

export default stageFn_summarizeSubTaskOutputsRecursive;
