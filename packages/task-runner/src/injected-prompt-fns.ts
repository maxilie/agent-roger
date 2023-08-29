import {
  type JsonObj,
  db,
  env,
  schema,
  type InjectedPrompt,
  TextLlmInput,
  getNumTokens,
} from "agent-roger-core";
import { newInjectedPrompts } from "agent-roger-core/dist/db";
import { and, eq, gt } from "drizzle-orm";
import { type WeaviateClient } from "weaviate-ts-client";
import { distance as levDistance } from "fastest-levenshtein";

const batchSizeWeaviate = 50;
const batchSizeSQL = 6;

// types for embedding/storing/fetching injected prompt data...
type WeaviateInjectedPromptDoc = {
  userMessage: string;
  assistantMessage: string;
  numTokens: number;
  _additional: {
    id: string;
  };
};

type WeaviateResponseTypeGET = {
  data: {
    GET: {
      [key: string]: WeaviateInjectedPromptDoc[];
    };
  };
};

type EmbeddingApiResponse = {
  vector: number[] | null;
  errorMessage: string | null;
};

type PromptToEmbed = {
  userMessage: string;
  assistantMessage: string;
  numTokens: number;
  shortenedUserMsg: string;
};

type EmbeddedPromptData = {
  userMessage: string;
  assistantMessage: string;
  numTokens: number;
  vector: number[];
};

/**
 * Simply creates a predictable string to represent/identify an injected prompt.
 */
const _makePromptDataStr = (
  userMessage: string,
  assistantMessage: string
): string => {
  return `userMessage: ${userMessage}\nassistantMessage: ${assistantMessage}`;
};

/**
 * Replaces pieces of the `strToReduce` with ".. " until it's shorter than `maxLen`.
 */
const _reduceString = (strToReduce: string, maxLen: number): string => {
  // validate input
  maxLen = Math.max(maxLen, 20);
  if (strToReduce.length <= maxLen) return strToReduce + "";
  const strBeginning = strToReduce.slice(0, 10);
  strToReduce = strToReduce.slice(10);

  while (strToReduce.length > maxLen) {
    // length of the piece to cut grows smaller at each iteration
    const cutLen = Math.min(
      60,
      Math.max(Math.floor(strToReduce.length / 3), 5)
    );

    // determine the start of the cut ensuring we have room on both sides of the cut
    const cutStart = Math.floor(Math.random() * (strToReduce.length - cutLen));

    // replace the piece to cut with ".. "
    strToReduce = `${strToReduce.slice(0, cutStart)}.. ${strToReduce.slice(
      cutStart + cutLen
    )}`;
  }

  return strBeginning + strToReduce;
};

// Don't include much of these fields in the shortened version of the user message (the string to be embedded)
const _fieldsToTruncate = ["context", "suggested", "example"];

/**
 * Preprocesses an injected prompt user message into a paragraph string.
 */
const _preprocessJson = (input: JsonObj, parentKeys: string[] = []): string => {
  Object.keys(input).forEach((key) => {
    const value = input[key];
    const keyLower = key.toLowerCase();

    if (value && typeof value === "object" && !Array.isArray(value)) {
      _preprocessJson(value as JsonObj, [...parentKeys, keyLower]);
    } else {
      const valueStr = String(value);
      const deleteField =
        keyLower.includes("example") ||
        value === null ||
        valueStr === "" ||
        (Array.isArray(value) && value.length === 0) ||
        (typeof value === "object" && Object.keys(value).length === 0);

      const truncateField =
        parentKeys.some((k) => _fieldsToTruncate.includes(k)) ||
        _fieldsToTruncate.includes(keyLower);

      if (deleteField) {
        delete input[key];
      } else if (truncateField) {
        if (valueStr.length > 15) {
          input[key] = valueStr.slice(0, 13) + "..";
        }
      } else {
        input[key] = _reduceString(valueStr, 70);
      }
    }
  });

  const flattenedReducedJsonStr = JSON.stringify(input)
    .replace(/{|}|\[|\]|,/g, "")
    .replace(/:/g, " ")
    .replace(/\s\s+/g, " ")
    .trim();

  return _reduceString(flattenedReducedJsonStr, 300);
};

/**
 *
 * @returns a list containing a string to represent the JSON object's keys at each level of depth
 */
const getShortenedKeys = (jsonInput: JsonObj): string[] => {
  const result: string[] = [];

  function traverse(obj: JsonObj, depth: number) {
    if (typeof obj !== "object" || obj === null) {
      return;
    }

    let keyCombination = "";

    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        keyCombination += key.substring(0, 10);
        const val = obj[key];
        if (
          val == null ||
          typeof val === "string" ||
          typeof val === "number" ||
          typeof val === "boolean" ||
          Array.isArray(val)
        ) {
          continue;
        }
        traverse(val, depth + 1);
      }
    }

    // Add to the result if keys exist at this depth
    if (keyCombination) {
      if (result[depth]) {
        result[depth] += keyCombination;
      } else {
        result[depth] = keyCombination;
      }
    }
  }

  traverse(jsonInput, 0);
  return result;
};

/**
 *
 * @returns a list containing a string to represent the JSON object's values at each level of depth
 */
const getShortenedVals = (jsonInput: JsonObj): string[] => {
  const result: string[] = [];

  function traverse(obj: JsonObj, depth: number) {
    if (typeof obj !== "object" || obj === null) {
      return;
    }

    let valCombination = "";

    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const val = obj[key];
        if (
          typeof val === "string" ||
          typeof val === "number" ||
          typeof val === "boolean"
        ) {
          valCombination += String(val).substring(0, 15);
        } else if (
          Array.isArray(val) &&
          val.every((item) => typeof item === "string")
        ) {
          valCombination += val.join("").substring(0, 15);
        } else if (
          typeof val === "object" &&
          val !== null &&
          !Array.isArray(val)
        ) {
          traverse(val, depth + 1);
        }
      }
    }

    // Add to the result if values exist at this depth
    if (valCombination) {
      if (result[depth]) {
        result[depth] += valCombination;
      } else {
        result[depth] = valCombination;
      }
    }
  }

  traverse(jsonInput, 0);
  return result;
};

/**
 *
 * @returns A semantic embedding vector or an error response from the local embeddings api.
 */
const fetchEmbeddingResult = async (
  shortenedUserMsg: string
): Promise<EmbeddingApiResponse> => {
  try {
    const response = await fetch(
      "http://host.docker.internal:699/embedParagraph/",
      {
        method: "GET",
        headers: {
          Authorization: env.SHORT_EMBEDDINGS_API_KEY,
        },
        body: new URLSearchParams({
          text: shortenedUserMsg,
        }),
      }
    );

    if (!response.ok) {
      return {
        vector: null,
        errorMessage:
          "invalid response from local embeddings api: " +
          String(response.status),
      };
    }

    const data = (await response.json()) as
      | EmbeddingApiResponse
      | object
      | null;
    if (!data) {
      return {
        vector: null,
        errorMessage:
          "invalid response from local embeddings api: " +
          String(response.status),
      };
    }
    return data as EmbeddingApiResponse;
  } catch (error) {
    return {
      vector: null,
      errorMessage:
        "invalid response from local embeddings api: " + String(error),
    };
  }
};

/**
 * Syncs injected prompts in weaviate database with SQL database.
 * Adds to weaviate documents that are missing in SQL, and removes from weaviate documents that are not present in SQL.
 */
export const initInjectedPrompts = async (weaviateClient: WeaviateClient) => {
  const existingWeaviateIds: Set<string> = new Set();
  const existingValidWeaviateIds: Set<string> = new Set();
  const weaviateIdToData = new Map<
    string,
    { userMessage: string; assistantMessage: string }
  >();
  const sqlIDtoWeaviateID = new Map<number, string>();
  const promptDataStrToSqlID = new Map<string, number>();
  const promptDataStrToWeaviateID = new Map<string, string>();
  const promptDataStrsInWeaviate = new Set<string>();

  // check prompts in weaviate database, using batches
  let lastDocID = "";
  while (true) {
    let documents: WeaviateInjectedPromptDoc[];
    try {
      const response = (await weaviateClient.graphql
        .get()
        .withClassName(db.weaviateHelp.INJECTED_PROMPTS_CLASS_NAME)
        .withFields("userMessage assistantMessage _additional { id }")
        .withLimit(batchSizeWeaviate)
        .withAfter(lastDocID)
        .withConsistencyLevel("ONE")
        .do()) as WeaviateResponseTypeGET;
      const className = db.weaviateHelp.INJECTED_PROMPTS_CLASS_NAME;
      documents = Array.isArray(response?.data?.GET?.[className])
        ? response.data.GET[className]
        : [];
      if (!documents.length) break;
    } catch (e) {
      console.error(e);
      throw new Error("Failed to get injected prompts from weaviate");
    }
    lastDocID = documents.at(-1)?._additional.id ?? "";
    if (!lastDocID) break;

    // check that each prompt in weaviate is also in SQL
    const sqlQueryPromises: Promise<{
      sqlID: number;
      weaviateID: string;
      promptDataStr: string;
    } | null>[] = [];
    for (const document of documents) {
      existingWeaviateIds.add(document._additional.id);
      weaviateIdToData.set(document._additional.id, {
        userMessage: document.userMessage,
        assistantMessage: document.assistantMessage,
      });
      const promptDataStr = _makePromptDataStr(
        document.userMessage,
        document.assistantMessage
      );
      promptDataStrToWeaviateID.set(promptDataStr, document._additional.id);
      promptDataStrsInWeaviate.add(promptDataStr);
      const createSqlPromise = async (): Promise<{
        sqlID: number;
        weaviateID: string;
        promptDataStr: string;
      } | null> => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        try {
          const sqlResults = await db.sqlClient
            .select({ id: db.injectedPrompts.id })
            .from(db.injectedPrompts)
            .where(
              and(
                eq(db.injectedPrompts.userMessage, document.userMessage),
                eq(
                  db.injectedPrompts.assistantMessage,
                  document.assistantMessage
                )
              )
            );
          if (!sqlResults || !sqlResults.length) return null;
          return {
            sqlID: sqlResults[0].id,
            weaviateID: document._additional.id,
            promptDataStr,
          };
        } catch (_) {
          return null;
        }
      };
      sqlQueryPromises.push(createSqlPromise());
    }
    let promiseIdx = 0;
    while (promiseIdx < sqlQueryPromises.length) {
      const batchedPromises = sqlQueryPromises.slice(
        promiseIdx,
        promiseIdx + batchSizeSQL
      );
      promiseIdx += batchSizeSQL;
      Promise.allSettled(batchedPromises)
        .then((results) => {
          results.forEach((res) => {
            if (res.status == "fulfilled" && res.value) {
              existingValidWeaviateIds.add(res.value.weaviateID);
              sqlIDtoWeaviateID.set(res.value.sqlID, res.value.weaviateID);
              promptDataStrToSqlID.set(
                res.value.promptDataStr,
                res.value.sqlID
              );
            }
          });
        })
        .catch((err) => {
          console.error(
            "Error getting a batch of injected prompt IDs needed to validate weaviate documents:"
          );
          console.error(err);
        });
    }
  }

  // delete invalid weaviate prompts
  const invalidWeaviateIDs = Array.from(existingWeaviateIds).filter((id) => {
    return !existingValidWeaviateIds.has(id);
  });
  const deleteDocPromises: Promise<void>[] = [];
  invalidWeaviateIDs.forEach((weaviateID) => {
    const createDeletionPromise = async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      await weaviateClient.data
        .deleter()
        .withClassName(db.weaviateHelp.INJECTED_PROMPTS_CLASS_NAME)
        .withId(weaviateID)
        .withConsistencyLevel("ONE")
        .do();
    };
    deleteDocPromises.push(createDeletionPromise());
  });
  let deleteDocIdx = 0;
  while (deleteDocIdx < invalidWeaviateIDs.length) {
    const batchDeletionPromises = invalidWeaviateIDs.slice(
      deleteDocIdx,
      deleteDocIdx + batchSizeWeaviate
    );
    deleteDocIdx += batchSizeWeaviate;
    Promise.allSettled(batchDeletionPromises)
      .then(() => {
        return;
      })
      .catch((err) => {
        console.error(
          "Failed to delete a batch of injected prompt documents from weaviate that are no longer present in the SQL database. \
\nAs a consequence, the AI may be using outdated prompt injections."
        );
        console.error(err);
      });
  }

  // check prompts in sql database, using batches
  const newPromptsToProcess: {
    userMessage: string;
    assistantMessage: string;
    numTokens: number;
  }[] = [];
  const lastRowID = -1;
  let pauses = 0;
  while (true) {
    try {
      const promptInjectionDatas = await db.sqlClient
        .select()
        .from(db.injectedPrompts)
        .where(gt(db.injectedPrompts.id, lastRowID))
        .limit(batchSizeSQL);
      promptInjectionDatas.forEach((promptInjectionData) => {
        const promptDataStr = _makePromptDataStr(
          promptInjectionData.userMessage,
          promptInjectionData.assistantMessage
        );
        promptDataStrToSqlID.set(promptDataStr, promptInjectionData.id);
        const isSynced = promptDataStrsInWeaviate.has(promptDataStr);
        if (!isSynced) {
          newPromptsToProcess.push({
            userMessage: promptInjectionData.userMessage,
            assistantMessage: promptInjectionData.assistantMessage,
            numTokens: promptInjectionData.numTokens,
          });
        }
      });
      if (promptInjectionDatas.length < batchSizeSQL) break;
      if (Math.random() < 0.4 && pauses < 500) {
        await new Promise((resolve) => setTimeout(resolve, 300));
        pauses += 1;
      }
    } catch (err) {
      console.error(
        "Error fetching a batch of rows from SQL table, injectedPrompts, which possibly need to be imported into weaviate. \
The weaviate database may now be out of sync with the SQL database."
      );
      console.error(err);
      break;
    }
  }

  // convert user messages to short paragraphs
  const datasToEmbed: PromptToEmbed[] = newPromptsToProcess
    .map((promptData) => {
      try {
        const userMsgJson = schema.jsonObj.parse(
          JSON.parse(promptData.userMessage)
        );
        return {
          userMessage: promptData.userMessage,
          assistantMessage: promptData.assistantMessage,
          numTokens: promptData.numTokens,
          shortenedUserMsg: _preprocessJson(userMsgJson),
        };
      } catch (_) {
        return undefined;
      }
    })
    .filter(
      (elem): elem is PromptToEmbed => elem !== null && elem !== undefined
    );

  // embed weaviate prompts
  const embeddedDatasToSave: EmbeddedPromptData[] = [];

  const embeddingPromises: Promise<EmbeddedPromptData | null>[] =
    datasToEmbed.map((dataToEmbed) => {
      const embedDataPoint = async (
        dataToEmbed: PromptToEmbed
      ): Promise<EmbeddedPromptData | null> => {
        const response = await fetchEmbeddingResult(
          dataToEmbed.shortenedUserMsg
        );
        if (!response.vector) {
          console.error(
            `Error using local embedding service to embed a short string: ${dataToEmbed.shortenedUserMsg}`
          );
          console.error(
            "Embedding error:",
            response.errorMessage || "empty response"
          );
          return null;
        }
        return {
          userMessage: dataToEmbed.userMessage,
          assistantMessage: dataToEmbed.assistantMessage,
          numTokens: dataToEmbed.numTokens,
          vector: response.vector,
        };
      };
      return embedDataPoint(dataToEmbed);
    });

  const batchSizeLocalEmbeddings = 3;
  for (let i = 0; i < embeddingPromises.length; i += batchSizeLocalEmbeddings) {
    const batchPromises = embeddingPromises.slice(
      i,
      i + batchSizeLocalEmbeddings
    );
    const results = await Promise.allSettled(batchPromises);
    for (const resData of results) {
      if (resData.status == "fulfilled" && resData.value) {
        embeddedDatasToSave.push(resData.value);
      }
    }
  }

  // add prompts not in sql to weaviate
  const newWeaviateObjects = embeddedDatasToSave.map((embeddedPromptData) => {
    return {
      class: db.weaviateHelp.INJECTED_PROMPTS_CLASS_NAME,
      properties: {
        userMessage: embeddedPromptData.userMessage,
        assistantMessage: embeddedPromptData.assistantMessage,
      },
      vector: embeddedPromptData.vector,
    };
  });
  let batcher = weaviateClient.batch.objectsBatcher();
  let objectsInBatch = 0;
  for (let i = 0; i < newWeaviateObjects.length; i++) {
    batcher = batcher.withObject(newWeaviateObjects[i]);
    objectsInBatch += 1;
    if (
      objectsInBatch >= batchSizeWeaviate ||
      i == newWeaviateObjects.length - 1
    ) {
      await batcher.withConsistencyLevel("ONE").do();
      batcher = weaviateClient.batch.objectsBatcher();
    }
  }

  // log results
  console.log(
    `${newWeaviateObjects.length}/${newPromptsToProcess.length} valid new '${db.weaviateHelp.INJECTED_PROMPTS_CLASS_NAME}' documents were imported from SQL db to Weaviate db.`
  );
  console.log(
    `${existingValidWeaviateIds.size} valid '${db.weaviateHelp.INJECTED_PROMPTS_CLASS_NAME}' documents were already present in both databases.`
  );
  console.log(
    `${existingWeaviateIds.size - existingValidWeaviateIds.size} '${
      db.weaviateHelp.INJECTED_PROMPTS_CLASS_NAME
    }' documents could not be found in SQL db, and so were removed from weaviate db`
  );
};

/**
 * Merges injected prompts from the newInjectedPrompts SQL table into weaviate.
 */
export const mergeNewInjectedPrompts = async (
  weaviateClient: WeaviateClient
) => {
  // get prompts from newInjectedPrompts table
  const newPromptsToProcess: {
    newInjectedPromptsID: number;
    userMessage: string;
    assistantMessage: string;
    numTokens: number;
  }[] = [];
  const lastRowID = -1;
  let pauses = 0;
  while (true) {
    try {
      const promptInjectionDatas = await db.sqlClient
        .select()
        .from(db.newInjectedPrompts)
        .where(gt(db.newInjectedPrompts.id, lastRowID))
        .limit(batchSizeSQL);
      promptInjectionDatas.forEach((promptInjectionData) => {
        newPromptsToProcess.push({
          newInjectedPromptsID: promptInjectionData.id,
          userMessage: promptInjectionData.userMessage,
          assistantMessage: promptInjectionData.assistantMessage,
          numTokens: promptInjectionData.numTokens,
        });
      });
      if (promptInjectionDatas.length < batchSizeSQL) break;
      if (Math.random() < 0.4 && pauses < 500) {
        await new Promise((resolve) => setTimeout(resolve, 300));
        pauses += 1;
      }
    } catch (err) {
      console.error(
        "Error fetching a batch of rows from SQL table, newInjectedPrompts, which possibly need to be imported into weaviate. \
The weaviate database may now be out of sync with the SQL database."
      );
      console.error(err);
      break;
    }
  }

  // add each prompt to weaviate if not already there...
  for (const promptData of newPromptsToProcess) {
    // check if prompt is in weaviate
    try {
      const response = (await weaviateClient.graphql
        .get()
        .withClassName(db.weaviateHelp.INJECTED_PROMPTS_CLASS_NAME)
        .withFields("userMessage assistantMessage _additional { id }")
        .withWhere({
          operator: "And",
          operands: [
            {
              operator: "Equal",
              path: ["userMessage"],
              valueText: promptData.userMessage,
            },
            {
              operator: "Equal",
              path: ["assistantMessage"],
              valueText: promptData.assistantMessage,
            },
          ],
        })
        .withConsistencyLevel("ONE")
        .do()) as WeaviateResponseTypeGET;

      // if prompt found in weaviate, remove from newInjectedPrompts and continue
      if (
        response.data &&
        response.data.GET &&
        db.weaviateHelp.INJECTED_PROMPTS_CLASS_NAME in response.data.GET
      ) {
        const matchedWeaviateObjects =
          response.data.GET[db.weaviateHelp.INJECTED_PROMPTS_CLASS_NAME];
        if (matchedWeaviateObjects.length == 0) break;
        await db.sqlClient
          .delete(db.newInjectedPrompts)
          .where(eq(newInjectedPrompts.id, promptData.newInjectedPromptsID));
        continue;
      }
    } catch (err) {
      console.error(
        `Error checking whether an injected prompt exists in weaviate:`
      );
      console.error(err);
      continue;
    }

    // embed prompt
    let embeddedPromptData: EmbeddingApiResponse;
    try {
      const userMsgJson = schema.jsonObj.parse(
        JSON.parse(promptData.userMessage)
      );
      embeddedPromptData = await fetchEmbeddingResult(
        _preprocessJson(userMsgJson)
      );
      if (!embeddedPromptData.vector) {
        throw new Error(
          `Error generating semantic embedding: ${
            embeddedPromptData.errorMessage ?? "empty error message"
          }`
        );
      }
    } catch (err) {
      console.error(
        `Error processing & embedding a new injected prompt to store in weaviate:`
      );
      console.error(err);
      continue;
    }

    // save prompt in weaviate
    try {
      await weaviateClient.data
        .creator()
        .withClassName(db.weaviateHelp.INJECTED_PROMPTS_CLASS_NAME)
        .withProperties({
          userMessage: promptData.userMessage,
          assistantMessage: promptData.assistantMessage,
          numTokens: promptData.numTokens,
        })
        .withVector(embeddedPromptData.vector)
        .do();
    } catch (err) {
      console.error(
        "Error creating a new object in weaviate for a new injected prompt:"
      );
      console.error(err);
      continue;
    }

    // remove prompt from sql
    try {
      await db.sqlClient
        .delete(db.newInjectedPrompts)
        .where(eq(newInjectedPrompts.id, promptData.newInjectedPromptsID));
    } catch (err) {
      console.error("Error deleting prompt from newInjectedPrompts table:");
      console.error(err);
    }
  }
};

/**
 * Gets up to 3 injected prompts that are similar enough to the `queryUserMsg`.
 * Uses both vector search and levenshtein distance to compute text similarity.
 */
export const findSimilarInjectedPrompts = async (
  queryUserMsg: JsonObj,
  weaviateClient: WeaviateClient
): Promise<InjectedPrompt[]> => {
  // process input
  let queryVector: number[];
  const inputKeysByLevel: string[] = [];
  const inputValsByLevel: string[] = [];
  try {
    const queryEmbeddingData = await fetchEmbeddingResult(
      _preprocessJson(queryUserMsg)
    );
    if (!queryEmbeddingData.vector) {
      throw new Error(
        "Failed to embed query: " +
          (queryEmbeddingData.errorMessage || "empty api response")
      );
    }
    queryVector = queryEmbeddingData.vector;
    inputKeysByLevel.push(...getShortenedKeys(queryUserMsg));
    inputValsByLevel.push(...getShortenedVals(queryUserMsg));
  } catch (err) {
    console.error("Error processing input for a search of injected prompts:");
    console.error(err);
    return [];
  }
  if (inputKeysByLevel.length == 0 || inputValsByLevel.length == 0) {
    return [];
  }

  // search weaviate for 10 prompts
  const weaviateResults: InjectedPrompt[] = [];
  try {
    const response = (await weaviateClient.graphql
      .get()
      .withClassName(db.weaviateHelp.INJECTED_PROMPTS_CLASS_NAME)
      .withFields(
        "userMessage assistantMessage numTokens _additional {certainty}"
      )
      .withNearVector({
        vector: queryVector,
        certainty: 0.8,
      })
      .withConsistencyLevel("ONE")
      .withLimit(10)
      .do()) as WeaviateResponseTypeGET;
    if (
      response.data &&
      response.data.GET &&
      db.weaviateHelp.INJECTED_PROMPTS_CLASS_NAME in response.data.GET
    ) {
      for (const weaviateObject of response.data.GET[
        db.weaviateHelp.INJECTED_PROMPTS_CLASS_NAME
      ]) {
        weaviateResults.push({
          userMessage: weaviateObject.userMessage,
          assistantMessage: weaviateObject.assistantMessage,
          numTokens: weaviateObject.numTokens,
        });
      }
    }
  } catch (err) {
    console.error("Error searching weaviate for injected prompts:");
    console.error(err);
    return [];
  }

  if (weaviateResults.length == 0) {
    return [];
  }

  // compute lev distance from input to each result
  type ScoredInjectedPrompt = InjectedPrompt & { similarityScore: number };
  const scoredInjectedPrompts: ScoredInjectedPrompt[] = [];
  for (const injectedPrompt of weaviateResults) {
    // scoring formula: (0.7 * keys_levenshtein_similarity_pct) * (0.3 * vals_levenshtein_similarity_pct)
    let userMsgJson: JsonObj;
    try {
      userMsgJson = schema.jsonObj.parse(
        JSON.parse(injectedPrompt.userMessage)
      );
    } catch (_) {
      continue;
    }
    const keysByLevel = getShortenedKeys(userMsgJson);
    const valsByLevel = getShortenedVals(userMsgJson);
    const keysDepth = Math.min(keysByLevel.length, inputKeysByLevel.length);
    const valsDepth = Math.min(valsByLevel.length, inputValsByLevel.length);
    if (keysDepth == 0 || valsDepth == 0) {
      continue;
    }
    const keysLevDistPctByLevel = keysByLevel
      .map((keyLevelStr, i) => {
        const maxLevDistance = Math.max(
          inputKeysByLevel[i].length,
          keysByLevel[i].length
        );
        const levDistanceAbs = levDistance(inputKeysByLevel[i], keyLevelStr);
        return (maxLevDistance - levDistanceAbs) / maxLevDistance;
      })
      .slice(0, keysDepth);
    const valsLevDistPctByLevel = valsByLevel
      .map((valLevelStr, i) => {
        const maxLevDistance = Math.max(
          inputValsByLevel[i].length,
          valsByLevel[i].length
        );
        const levDistanceAbs = levDistance(inputValsByLevel[i], valLevelStr);
        return (maxLevDistance - levDistanceAbs) / maxLevDistance;
      })
      .slice(0, valsDepth);
    const avgKeysLevDistPct =
      keysLevDistPctByLevel.reduce((sum, current) => sum + current) / keysDepth;
    const avgValsLevDistPct =
      valsLevDistPctByLevel.reduce((sum, current) => sum + current) / valsDepth;
    const similarityScore = 0.7 * avgKeysLevDistPct + 0.3 * avgValsLevDistPct;
    scoredInjectedPrompts.push({
      userMessage: injectedPrompt.userMessage,
      assistantMessage: injectedPrompt.assistantMessage,
      numTokens: injectedPrompt.numTokens,
      similarityScore,
    });
  }

  // return up to 3 results most similar by lev distance
  return scoredInjectedPrompts
    .sort((a, b) => b.similarityScore - a.similarityScore)
    .slice(0, 3)
    .map((scoredInjectedPrompt) => {
      return {
        userMessage: scoredInjectedPrompt.userMessage,
        assistantMessage: scoredInjectedPrompt.assistantMessage,
        numTokens: scoredInjectedPrompt.numTokens,
      };
    });
};

/**
 * Returns a new TextLlmInput with up to 3 injected prompts, accounting for model context and desired number of output tokens.
 * Only works if input, `data.chatMlMessages` contains a single system message followed by a single JSON user message.
 */
export const addPromptInjections = async (
  data: TextLlmInput,
  weaviateClient: WeaviateClient
): Promise<TextLlmInput> => {
  const originalInput = {
    chatMlMessages: [...data.chatMlMessages],
    numInputTokens: data.numInputTokens,
    maxOutputTokens: data.maxOutputTokens,
  };
  // get json user message
  if (data.chatMlMessages.length != 2) return originalInput;
  let userMsg = data.chatMlMessages[1];
  if (userMsg.slice(0, 5).toLowerCase().trim().startsWith("user:")) {
    userMsg = userMsg.split("ser:").slice(1).join("ser:");
  }
  let userMsgJson: JsonObj;
  try {
    userMsgJson = schema.jsonObj.parse(JSON.parse(userMsg));
  } catch (_) {
    return originalInput;
  }
  // get up to 3 prompt injections
  const similarPrompts = await findSimilarInjectedPrompts(
    userMsgJson,
    weaviateClient
  );
  if (similarPrompts.length == 0) return originalInput;
  // get minimum number of output tokens
  const userMsgTokens = Math.max(1500, getNumTokens([userMsg]));
  const similarPromptsEstOutputTokens = similarPrompts.map(
    (injectedPromptData) =>
      Math.max(1500, injectedPromptData.numTokens - userMsgTokens)
  );
  const avgAssistantMsgLength =
    similarPromptsEstOutputTokens.reduce((sum, next) => sum + next) /
    similarPromptsEstOutputTokens.length;
  const minOutputTokens = Math.max(
    data.maxOutputTokens ?? 1500,
    avgAssistantMsgLength * 1.2
  );
  // get context length of the model
  const modelMaxLength = 1;
  // inject similar prompts while contextLength < inputLength + minOutputLength
  let totalInputTokens = data.numInputTokens;
  const chatMlMessages = [data.chatMlMessages[0]];
  for (const similarPrompt of similarPrompts) {
    if (
      similarPrompt.numTokens >=
      modelMaxLength - totalInputTokens - minOutputTokens
    ) {
      continue;
    }
    chatMlMessages.push(similarPrompt.userMessage);
    chatMlMessages.push(similarPrompt.assistantMessage);
    totalInputTokens += similarPrompt.numTokens;
  }
  chatMlMessages.push(data.chatMlMessages[1]);
  return {
    chatMlMessages,
    numInputTokens: totalInputTokens,
    maxOutputTokens: data.maxOutputTokens,
  };
};
