import {
  type StageFunctionHelpers,
  type StageFunction,
} from "../stage-function.js";
import { TASK_PRESETS } from "../presets.js";
import { getTaskBasicData } from "../../db/db-actions.js";
import { assembleTextLlmInput } from "../../model-input/index.js";
import { type Json } from "../../zod-schema/stage-base/json.js";

const maxLlmWords = 1300;
const numChunks = 4;

export const SUMMARIZE_TEXT_STAGE_FNS: { [key: string]: StageFunction } = {
  // eslint-disable-next-line @typescript-eslint/require-await
  getSummarizationInput: async (helpers: StageFunctionHelpers) => {
    // find textToSummarize, maxWords, and guidelines
    let textToSummarize = "";
    let maxWords = 0;
    let guidelines: Json = [];
    for (const inputFieldName of Object.keys(helpers.initialInputFields)) {
      const fieldNameLower = inputFieldName.toLowerCase();
      if (fieldNameLower.includes("text")) {
        textToSummarize = helpers.initialInputFields[inputFieldName] as string;
      } else if (fieldNameLower.includes("max")) {
        maxWords = Math.min(
          maxLlmWords / 7,
          helpers.initialInputFields[inputFieldName] as number
        );
      } else if (fieldNameLower.includes("guide")) {
        guidelines = helpers.initialInputFields[inputFieldName];
      }
    }
    if (!maxWords) maxWords = maxLlmWords / 7;
    if (!guidelines) guidelines = [];
    // pause task if no text to summarize was found
    if (!textToSummarize) {
      helpers.endStage(`Failed to get the input fields required by summarizeText task (textToSummarize, maxWords, guidelines). \
    Looked for a field containing "text" within the following input fields but did not find it: ${Object.keys(
      helpers.initialInputFields
    ).join(", ")}`);
      return;
    }
    helpers.set("textToSummarize", textToSummarize);
    helpers.set("maxWords", maxWords);
    helpers.set("guidelines", guidelines);
    helpers.endStage();
  },
  splitTextToSummarize: async (helpers: StageFunctionHelpers) => {
    const textToSummarize = (await helpers.get("textToSummarize")) as string;
    const maxWords = (await helpers.get("maxWords")) as number;
    const guidelines = await helpers.get("guidelines");
    let textChunks: string[] | null = await helpers.get("textChunks");
    // split text into at most 4 chunks
    if (!textChunks) {
      textChunks = [];
      const wordsToSummarize = textToSummarize.split(" ");
      const increment = Math.max(
        maxLlmWords / 7,
        Math.ceil(wordsToSummarize.length / numChunks)
      );
      let i = 0;
      while (i < wordsToSummarize.length) {
        textChunks.push(wordsToSummarize.slice(i, i + increment).join(" "));
        i += increment;
      }
      helpers.set("textChunks", textChunks);
    }
    // recursively summarize the text chunks that are too long
    let chunkIdxToSubTaskId = await helpers.get("chunkIdxToSubTaskId");
    if (!chunkIdxToSubTaskId) chunkIdxToSubTaskId = {};
    chunkIdxToSubTaskId = chunkIdxToSubTaskId as { [key: number]: string };
    for (let i = 0; i < textChunks.length; i++) {
      if (textChunks[i].split(" ").length <= maxWords) continue;
      let subTaskId = chunkIdxToSubTaskId[i];
      // create sub-task
      if (!subTaskId) {
        const textBefore = i == 0 ? "" : "... " + textChunks[i - 1].slice(-50);
        const textAfter =
          i == textChunks.length - 1
            ? ""
            : textChunks[i + 1].slice(-50) + " ...";
        subTaskId = await helpers.subTask({
          newTaskDefinition: TASK_PRESETS.summarizeText,
          initialInputFields: {
            textToSummarize: textChunks[i],
            maxWords,
            guidelines,
          },
          initialContextFields: {
            textBefore,
            textAfter,
          },
        });
        chunkIdxToSubTaskId[i] = subTaskId;
      }
    }
    helpers.set("chunkIdxToSubTaskId", chunkIdxToSubTaskId);
    // wait for sub-tasks to finish
    const summarizedChunks = [];
    for (let i = 0; i < textChunks.length; i++) {
      if (textChunks[i].split(" ").length > maxWords) {
        const subTaskId = chunkIdxToSubTaskId[i] as number;
        const subTaskData = await getTaskBasicData({
          taskID: subTaskId,
        });
        if (!subTaskData?.success) return;
        if (!subTaskData?.resultData?.outputFields?.textSummary) {
          helpers.endStage(
            `Sub-task ${String(subTaskId)} did not return any result data.`
          );
        }
        summarizedChunks.push(
          subTaskData?.resultData?.outputFields.textSummary as string
        );
      } else {
        summarizedChunks.push(textChunks[i]);
      }
    }
    // summarize the small text chunks together
    const textBefore = (helpers.initialContextFields?.textBefore ??
      "") as string;
    const textAfter = (helpers.initialContextFields?.textAfter ?? "") as string;
    const textSummary = await helpers.textLLM(
      assembleTextLlmInput({
        prompt: {
          instructions: `Summarize the 'textToSummarize' field using no more than ${maxWords} words. If the 'guidelines' field is not \
        empty, then make sure that the summary conforms to the guidelines. Ensure that the summary makes sense given the text before \
        and after it (the 'textBefore' and 'textAfter' fields).`,
          textToSummarize: summarizedChunks.join(" "),
          guidelines: [
            `The summary must not have more than ${maxWords} words.`,
            "Summary must not contain duplicate information, unless it is describing something that happens twice in different \
            contexts. For example, a Python function that calls a save_data() function after each of two different operations.",
            "The summary must contain all of the information present in the original text, except for minor details.",
            "Sentences do not need to be complete or grammatically correct, but they should be understandable.",
            ...(guidelines as string[]),
          ],
          textBefore,
          textAfter,
        },
        expectedOutputFields: {
          textSummary: `A summary of the textToSummarize, containing no more than ${maxWords} words.`,
        },
      })
    );
    helpers.taskResult({
      failed: false,
      taskSummary: "",
      outputFields: { ...textSummary },
    });
  },
};
