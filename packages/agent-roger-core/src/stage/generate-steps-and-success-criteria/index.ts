import {
  type StageFunctionHelpers,
  type StageFunction,
} from "../stage-function.js";

const stageFn_generateStepsAndSuccessCriteria: StageFunction = async (
  helpers: StageFunctionHelpers
  // eslint-disable-next-line @typescript-eslint/require-await
) => {
  /*
  Uses the LLM to populate 3 fields in the task's internalData: steps, stepDependencies: {idx: idx}, and successCriteria.

Steps do not necessarily correspond 1-1 with successCriteria, since criteria are for the
task as a whole.
  */

  // generate steps and success criteria
  //const llmOutput = await helpers.textLLM({ input: llmInput, numInputTokens: llnInputTokens });

  // determine which steps are dependent on which other steps

  helpers.endStage();
};

export default stageFn_generateStepsAndSuccessCriteria;
