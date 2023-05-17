import {
  type StageFunctionHelpers,
  type StageFunction,
} from "../stage-function.js";

const stageFn_queryRawContext: StageFunction = async (
  helpers: StageFunctionHelpers
  // eslint-disable-next-line @typescript-eslint/require-await
) => {
  // TODO
  // Queries the document database using the semantic context query vector(s) and the keywords queries.
  helpers.endStage();
};

export default stageFn_queryRawContext;
