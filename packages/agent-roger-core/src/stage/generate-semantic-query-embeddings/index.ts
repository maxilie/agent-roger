import {
  type StageFunctionHelpers,
  type StageFunction,
} from "../stage-function.js";

const stageFn_generateSemanticQueryEmbeddings: StageFunction = async (
  helpers: StageFunctionHelpers
  // eslint-disable-next-line @typescript-eslint/require-await
) => {
  // TODO
  // Uses an embedding AI model to vectorize the semantic context query/queries.
  helpers.endStage();
};

export default stageFn_generateSemanticQueryEmbeddings;
