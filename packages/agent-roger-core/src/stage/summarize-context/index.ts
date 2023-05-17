import {
  type StageFunctionHelpers,
  type StageFunction,
} from "../stage-function.js";

const stageFn_summarizeContext: StageFunction = async (
  helpers: StageFunctionHelpers
  // eslint-disable-next-line @typescript-eslint/require-await
) => {
  // TODO
  /*
  If rawContext length is <1/6th of the token limit, then an EXECUTE_FUNCTION 
task (to summarize the context) is spawned and its output returned.

Otherwise, the context is split into overlapping chunks, recursively summarized 
by new SUMMARIZE_CONTEXT tasks, and the results are merged back into a 
context with length <1/6th of the token limit.

Each sub-task's input chunks can be any size, but it always outputs a single summary
with length <1/6th of the token limit.

Spawned by arbitrary task initially, and then recursively by SUMMARIZE_CONTEXT task.
  */
  helpers.endStage();
};

export default stageFn_summarizeContext;
