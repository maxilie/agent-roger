import {
  type StageFunctionHelpers,
  type StageFunction,
} from "../stage-function";

const stageFn_generateSubTasks: StageFunction = async (
  helpers: StageFunctionHelpers
) => {
  return await new Promise((resolve, reject) => {
    setTimeout(() => {
      resolve();
    }, 1000);
  });
};

export default stageFn_generateSubTasks;
