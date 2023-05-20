import { assembleTextLlmInput } from "../../model-input/index.js";
import {
  type StageFunctionHelpers,
  type StageFunction,
} from "../stage-function.js";

export const GENERATE_JSON_STAGE_FNS: { [key: string]: StageFunction } = {
  generateJson: async (helpers: StageFunctionHelpers) => {
    const llmInput = assembleTextLlmInput({
      prompt: {
        inputFields: helpers.initialInputFields,
        contextFields: helpers.initialContextFields,
      },
      expectedOutputFields: {},
      suggestedApproaches: [
        {
          scenario: "always",
          approach:
            "Decide on the names and content of the output fields based on the 'inputFields'. Use the 'contextFields' to inform your \
          output. If the user has requested specific field names, then include them.",
          exampleOfSomeOutputFields: {},
        },
      ],
    });
    const llmOutput = await helpers.textLLM(llmInput);
    helpers.taskResult({
      failed: false,
      taskSummary: "Generated the requested JSON fields.",
      outputFields: llmOutput,
    });
  },
};
