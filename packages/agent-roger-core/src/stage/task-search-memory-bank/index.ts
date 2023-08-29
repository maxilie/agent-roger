import {
  type StageFunctionHelpers,
  type StageFunction,
} from "../stage-function.js";
import { TASK_PRESETS } from "../presets.js";
import { getTaskBasicData } from "../../db/db-actions.js";
import { getNumTokens } from "../../model-input/index.js";
import { type VectorDbDocument } from "../../zod-schema/index.js";
import { weaviateHelp } from "../../db/weaviate-help.js";

export const SEARCH_MEMORY_BANK_STAGE_FNS: { [key: string]: StageFunction } = {
  // eslint-disable-next-line @typescript-eslint/require-await
  getQueries: async (helpers: StageFunctionHelpers) => {
    // get queries from input fields
    const queries: string[] = [];
    for (const query of Object.values(helpers.initialInputFields || {})) {
      if (typeof query != "string") {
        helpers.endStage(`Invalid query provided in initialInputFields. All fields must have string values. initialInputFields: \
        ${JSON.stringify(helpers.initialInputFields || {}, null, 2)}`);
      }
      queries.push(query as string);
    }
    if (!queries.length) {
      helpers.endStage(
        "No initial input data was provided, but this task requires at least one query."
      );
      return;
    }
    helpers.set("queries", queries);
    helpers.endStage();
  },
  generateQueryVariations: async (helpers: StageFunctionHelpers) => {
    const queries = (await helpers.get("queries")) as string[];
    let queryIdxToSubTaskID = await helpers.get("queryIdxToSubTaskID");
    if (!queryIdxToSubTaskID) {
      queryIdxToSubTaskID = {};
    }
    queryIdxToSubTaskID = queryIdxToSubTaskID as { [key: number]: number };
    // for each query, create a sub-task to generate variations
    for (let i = 0; i < queries.length; i++) {
      if (queryIdxToSubTaskID[i]) {
        continue;
      }
      const subTaskID = await helpers.subTask({
        newTaskDefinition: TASK_PRESETS.generateJson,
        initialInputFields: {
          instructions:
            "Generate 4 new variations of the 'query' field. Use both questions and statements. Be creative and take a \
          slightly different angle for each variation. Fill in details that might be missing, even if you have to invent fictional \
          scenarios and context that seem likely to be true. Output each variation in a separate field. There should be exactly \
          4 output strings.",
          query: queries[i],
        },
      });
      queryIdxToSubTaskID[i] = subTaskID;
    }
    helpers.set("queryIdxToSubTaskID", queryIdxToSubTaskID);
    // wait for sub-tasks to finish
    const queryVariations: string[] = [];
    for (let i = 0; i < queries.length; i++) {
      const subTaskID = queryIdxToSubTaskID[i] as number;
      const subTaskData = await getTaskBasicData({ taskID: subTaskID });
      if (!subTaskData?.success) return;
      if (!subTaskData?.resultData?.outputFields) {
        helpers.endStage(
          `Expected sub-task #${subTaskID} to generate query variations, but it did not produce any outputFields.`
        );
        return;
      }
      const outputFields = subTaskData.resultData.outputFields;
      queryVariations.push(queries[i]);
      for (const fieldName of Object.keys(outputFields)) {
        queryVariations.push(outputFields[fieldName] as string);
      }
    }
    helpers.set("queryVariations", queryVariations);
    helpers.endStage();
  },
  generateQueryEmbeddings: async (helpers: StageFunctionHelpers) => {
    const queryVariations = (await helpers.get("queryVariations")) as string[];
    const queryEmbeddings = await helpers.embeddingLLM({
      input: queryVariations,
      numInputTokens: queryVariations.map((query) => {
        return getNumTokens([query]);
      }),
    });
    helpers.set("queryEmbeddings", queryEmbeddings);
    helpers.endStage();
  },
  getUniqueDocuments: async (helpers: StageFunctionHelpers) => {
    const queryEmbeddings = (await helpers.get(
      "queryEmbeddings"
    )) as number[][];
    // create schema if it doesn't exist
    const documentClass =
      weaviateHelp.MEMORY_BANK_CLASS_PREFIX +
      (helpers.memoryBankID || "global");
    // get unique documents
    const uniqueDocuments: VectorDbDocument[] = [];
    const documentUUIDs = new Set<string>();
    type NearVecResult = {
      _additional: {
        id: string;
      };
      content: string;
      location: string;
    };
    type WeaviateResponse = {
      data: {
        GET: { [key: string]: NearVecResult[] };
      };
    };
    try {
      for (let i = 0; i < queryEmbeddings.length; i++) {
        const response = (await helpers.weaviateClient.graphql
          .get()
          .withClassName(documentClass)
          .withFields("content location _additional {id certainty}")
          .withNearVector({ vector: queryEmbeddings[i], certainty: 0.7 })
          .withLimit(15)
          .do()) as WeaviateResponse;
        if (!response?.data?.GET || !(documentClass in response.data.GET))
          continue;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        const documents = response.data.GET[documentClass];
        for (const document of documents) {
          const documentID = document._additional.id;
          if (documentUUIDs.has(documentID)) continue;
          documentUUIDs.add(documentID);
          uniqueDocuments.push({
            id: documentID,
            content: document.content,
            location: document.location,
          });
        }
      }
    } catch (error) {
      helpers.endStage(
        `Failed to query weaviate vector database. ERROR: ${(
          error as Error
        ).toString()}`
      );
      return;
    }
    // return document locations and contents
    helpers.taskResult({
      failed: false,
      taskSummary: "",
      outputFields: {
        searchResults: uniqueDocuments.map((document) => {
          return {
            memoryLocation: document.location,
            memory: document.content,
          };
        }),
      },
    });
  },
};
