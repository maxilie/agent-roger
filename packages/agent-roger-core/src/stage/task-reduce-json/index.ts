import { getTaskBasicData } from "../../db/db-actions.js";
import { assembleTextLlmInput } from "../../model-input/text-llm/index.js";
import { type Json, jsonSchema } from "../../zod-schema/stage-base/json.js";
import { TASK_PRESETS } from "../presets.js";
import {
  type StageFunctionHelpers,
  type StageFunction,
} from "../stage-function.js";

const maxLlmWords = 800;
const maxFieldWords = maxLlmWords / 10;
const chunkSize = maxLlmWords / 7;
const numChunks = 3;

export const REDUCE_JSON_STAGE_FNS: { [key: string]: StageFunction } = {
  // eslint-disable-next-line @typescript-eslint/require-await
  getJsonToReduce: async (helpers: StageFunctionHelpers) => {
    // find json fields to reduce, and guidelines
    const jsonToReduce: { [key: string]: string } = {};
    let guidelines: Json = [];
    for (const inputFieldName of Object.keys(helpers.initialInputFields)) {
      const fieldNameLower = inputFieldName.toLowerCase();
      if (fieldNameLower.startsWith("_")) continue;
      if (fieldNameLower.startsWith("guidelines")) {
        guidelines = helpers.initialInputFields[inputFieldName];
      } else {
        let fieldValue = helpers.initialInputFields[inputFieldName];
        if (typeof fieldValue != "string") {
          try {
            fieldValue = JSON.stringify(jsonSchema.parse(fieldValue));
          } catch (_) {
            continue;
          }
        }
        jsonToReduce[inputFieldName] = fieldValue;
      }
    }
    // pause task if no fields to reduce were found
    if (Object.keys(jsonToReduce).length == 0) {
      helpers.endStage(`Failed to get the json fields to reduce from the task's initialInputFields. Looked for fields not \
      beginning with "_" within the following input fields but did not find it: ${Object.keys(
        helpers.initialInputFields
      ).join(", ")}`);
      return;
    }
    helpers.set("jsonToReduce", jsonToReduce);
    helpers.set("guidelines", guidelines);
    helpers.endStage();
  },
  splitJsonToReduce: async (helpers: StageFunctionHelpers) => {
    const jsonToReduce = (await helpers.get("jsonToReduce")) as {
      [key: string]: string;
    };
    const guidelines = await helpers.get("guidelines");

    // shorten any individual field that is too long
    let fieldNameToSubTaskId: { [key: string]: number } | null =
      await helpers.get("fieldNameToSubTaskId");
    if (!fieldNameToSubTaskId) {
      fieldNameToSubTaskId = {};
      for (const fieldName of Object.keys(jsonToReduce)) {
        const fieldValue = jsonToReduce[fieldName];
        if (fieldValue.split(" ").length > maxFieldWords) {
          const subTaskId = await helpers.subTask({
            newTaskDefinition: TASK_PRESETS.summarizeText,
            initialInputFields: {
              textToSummarize: fieldValue,
              maxWords: maxFieldWords,
              guidelines,
            },
          });
          fieldNameToSubTaskId[fieldName] = subTaskId;
        }
      }
      helpers.set("fieldNameToSubTaskId", fieldNameToSubTaskId);
      return;
    }

    // wait for sub-tasks
    let shortenedJsonToReduce: { [key: string]: string } =
      (await helpers.get("shortenedJsonToReduce")) || {};
    if (shortenedJsonToReduce.length != jsonToReduce.length) {
      shortenedJsonToReduce = {};
      for (const fieldName of Object.keys(jsonToReduce)) {
        const fieldValue = jsonToReduce[fieldName];
        if (fieldValue.split(" ").length > maxFieldWords) {
          const subTaskID = fieldNameToSubTaskId[fieldName];
          const subTaskData = await getTaskBasicData({ taskID: subTaskID });
          if (!subTaskData?.success) return;
          if (!subTaskData?.resultData?.outputFields?.textSummary) {
          } else {
            shortenedJsonToReduce[fieldName] = fieldValue;
          }
        }
        helpers.set("shortenedJsonToReduce", shortenedJsonToReduce);
      }
    }

    // split json into at most 3 chunks
    let jsonChunks: { [key: string]: string }[] | null = await helpers.get(
      "jsonChunks"
    );
    if (!jsonChunks) {
      jsonChunks = [];
      let totalWords = 0;
      Object.values(shortenedJsonToReduce).forEach((fieldValue) => {
        totalWords += fieldValue.split(" ").length;
      });
      const increment = Math.max(chunkSize, Math.ceil(totalWords / numChunks));
      let i = 0;
      const jsonKeys = Object.keys(shortenedJsonToReduce);
      while (i < jsonKeys.length) {
        let wordsInChunk = 0;
        const jsonChunk: { [key: string]: string } = {};
        while (wordsInChunk < increment && i < jsonKeys.length) {
          const jsonFieldName = jsonKeys[i];
          const wordsInNextField =
            shortenedJsonToReduce[jsonFieldName].split(" ").length;
          if (wordsInChunk > chunkSize) {
            throw new Error(`JSON fields should have been shortened to less than ${chunkSize} words, but the following field \
            was not shortened: ${jsonFieldName}: ${shortenedJsonToReduce[jsonFieldName]}}`);
          }
          if (wordsInChunk + wordsInNextField > increment) break;
          jsonChunk[jsonFieldName] = shortenedJsonToReduce[i];
          wordsInChunk += wordsInNextField;
          i += 1;
        }
        jsonChunks.push(jsonChunk);
      }
      helpers.set("jsonChunks", jsonChunks);
    }

    // recursively reduce the json chunks that are too long
    let chunkIdxToSubTaskId = await helpers.get("chunkIdxToSubTaskId");
    if (!chunkIdxToSubTaskId) chunkIdxToSubTaskId = {};
    chunkIdxToSubTaskId = chunkIdxToSubTaskId as { [key: number]: string };
    for (let i = 0; i < jsonChunks.length; i++) {
      const wordsInChunk = Object.values(jsonChunks[i]).reduce(
        (acc, curr) => acc + curr.split(" ").length,
        0
      );
      if (wordsInChunk < chunkSize * 1.1) continue;
      let subTaskId = chunkIdxToSubTaskId[i];
      // create sub-task
      if (!subTaskId) {
        subTaskId = await helpers.subTask({
          newTaskDefinition: TASK_PRESETS.reduceJson,
          initialInputFields: {
            jsonToReduce: jsonChunks[i],
            guidelines,
          },
        });
        chunkIdxToSubTaskId[i] = subTaskId;
      }
    }
    helpers.set("chunkIdxToSubTaskId", chunkIdxToSubTaskId);

    // wait for sub-tasks to finish
    const processedFields: { [key: string]: string } = {};
    for (let i = 0; i < jsonChunks.length; i++) {
      const wordsInChunk = Object.values(jsonChunks[i]).reduce(
        (acc, curr) => acc + curr.split(" ").length,
        0
      );
      if (wordsInChunk >= chunkSize * 1.1) {
        const subTaskId = chunkIdxToSubTaskId[i] as number;
        const subTaskData = await getTaskBasicData({
          taskID: subTaskId,
        });
        if (!subTaskData?.success) return;
        if (!subTaskData?.resultData?.outputFields?.reducedJson) {
          helpers.endStage(
            `Sub-task ${String(
              subTaskId
            )} did not return any result data (expected an outputField: 'reducedJson').`
          );
        }
        const reducedJson = subTaskData?.resultData?.outputFields
          .reducedJson as { [key: string]: string };
        Object.keys(reducedJson).forEach((fieldName) => {
          processedFields[fieldName] = reducedJson[fieldName];
        });
      } else {
        // if chunk was small enough to not need a sub-task, then add it directly to the processed fields
        Object.keys(jsonChunks[i]).forEach((fieldName) => {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          processedFields[fieldName] = jsonChunks![i][fieldName];
        });
      }
    }

    // summarize the small json chunks together
    const reducedJson = await helpers.textLLM(
      assembleTextLlmInput({
        prompt: {
          instructions: `Consolidate the 'jsonToReduce' field using no more than ${chunkSize} words. If the 'guidelines' field is not \
        empty, then make sure that the output conforms to the guidelines. Unless stated otherwise in the guidelines, the output field \
        names should be mostly the same as the field names in the 'jsonToReduce' field. Combine multiple fields into one if their \
        content can combined. Shorten fields by summarizing their content and/or referencing longer information contained in other \
        fields.`,
          jsonToReduce: JSON.stringify(processedFields),
          guidelines: [
            ...(guidelines as string[]),
            `The output must not have more than ${chunkSize} words.`,
            "Output must not contain duplicate information, unless it is describing something that happens twice in different \
            contexts. For example, user data for two different users who share the same birthday.",
            "The output fields must contain all of the information present in the input fields, except for minor details.",
            "Content does not need to be complete or grammatically correct, but it should be understandable.",
          ],
        },
        expectedOutputFields: {
          reducedJson: `A json object mapping string keys to string values, containing no more than ${chunkSize} total words.`,
        },
      })
    );
    helpers.taskResult({
      failed: false,
      taskSummary: "",
      outputFields: { ...reducedJson },
    });
  },
};
