import weaviate, { type WeaviateClient } from "weaviate-ts-client";
import { env } from "../env.mjs";

const MEMORY_BANK_CLASS_PREFIX = "Memory-Bank-";
const INJECTED_PROMPTS_CLASS_NAME = "Injected-Prompts";

/**
 *
 * @param memoryBankID either "global", or a UUID string
 * @returns a class object to be used with the Weaviate API
 * // For example... await weaviateClient.schema.classCreator().withClass(createMemoryBankClassObj(memoryBankID)).do();
 */
const createMemoryBankClassObj = (memoryBankID: string) => {
  return {
    class: MEMORY_BANK_CLASS_PREFIX + memoryBankID,
    vectorizer: "none",
    properties: [
      {
        dataType: ["text"],
        name: "location",
      },
      {
        dataType: ["text"],
        name: "content",
      },
    ],
  };
};

// A class object to be used with the weaviate API.
// For example... await weaviateClient.schema.classCreator().withClass(injectedPromptsClassObj).do();
const injectedPromptsClassObj = {
  class: INJECTED_PROMPTS_CLASS_NAME,
  vectorizer: "none",
  properties: [
    {
      dataType: ["text"],
      name: "userMessage",
    },
    {
      dataType: ["text"],
      name: "assistantMessage",
    },
    {
      dataType: ["int"],
      name: "numTokens",
    },
  ],
};

const createWeaviateClient = (): WeaviateClient => {
  return weaviate.client({
    scheme: "https",
    host: env.WEAVIATE_HOST,
    apiKey: new weaviate.ApiKey(env.WEAVIATE_KEY),
  });
};

const isConnectionValid = async (weaviateClient: WeaviateClient) => {
  try {
    await weaviateClient.data
      .getter()
      .withClassName(INJECTED_PROMPTS_CLASS_NAME)
      .withLimit(1)
      .do();
  } catch (error) {
    console.error(error);
    return false;
  }
  return true;
};

/**
 * Deletes all weaviate documents for a given file, within a given memory bank (weaviate class).
 */
const batchDeleteFileDocuments = async (
  weaviateClient: WeaviateClient,
  fileName: string,
  memoryBankID: string
) => {
  while (true) {
    const deleteResponse = await weaviateClient.batch
      .objectsBatchDeleter()
      .withClassName(weaviateHelp.MEMORY_BANK_CLASS_PREFIX + memoryBankID)
      .withWhere({
        path: ["location"],
        operator: "Equal",
        valueText: fileName,
      })
      .do();
    if (
      !deleteResponse ||
      !deleteResponse.results?.matches ||
      !deleteResponse.results.limit
    ) {
      break;
    }
    const documentsDeleted = deleteResponse.results.matches ?? 0;
    const maxDeletionsPerCall = deleteResponse.results.limit ?? 1;
    if (documentsDeleted == 0 || documentsDeleted < maxDeletionsPerCall) {
      break;
    }
  }
};

export const weaviateHelp = {
  MEMORY_BANK_CLASS_PREFIX,
  INJECTED_PROMPTS_CLASS_NAME,
  createMemoryBankClassObj,
  injectedPromptsClassObj,
  createWeaviateClient,
  isConnectionValid,
  batchDeleteFileDocuments,
};

// SEE: https://weaviate.io/developers/weaviate/api/rest/schema#create-a-class
// All possible properties of a class:
/*
const exampleClassObj = {
    'class': 'Article',
    'description': 'A written text, for example a news article or blog post',
    'vectorIndexType': 'hnsw',
    'vectorIndexConfig': {
        'distance': 'cosine',
        'efConstruction': 128,
        'maxConnections': 64
    },
    'vectorizer': 'text2vec-contextionary',
    'moduleConfig': {
      'text2vec-contextionary': {
        'vectorizeClassName': true
      }
    },
    'properties': [
        {
            'dataType': [
                'text'
            ],
            'description': 'Title of the article',
            'name': 'title',
            'indexInverted': true,
            'moduleConfig': {
                'text2vec-contextionary': {
                  'skip': false,
                  'vectorizePropertyName': false
                }
              }
        },
        {
            'dataType': [
                'text'
            ],
            'description': 'The content of the article',
            'name': 'content',
            'indexInverted': true,
            'moduleConfig': {
                'text2vec-contextionary': {
                  'skip': false,
                  'vectorizePropertyName': false
                }
              }
        }
    ],
    'shardingConfig': {
      'virtualPerPhysical': 128,
      'desiredCount': 1,
      'desiredVirtualCount': 128,
      'key': '_id',
      'strategy': 'hash',
      'function': 'murmur3'
    },
    'invertedIndexConfig': {
      'stopwords': {
        'preset': 'en',
        'additions': ['star', 'nebula'],
        'removals': ['a', 'the']
      },
      'indexTimestamps': true
    },
    'replicationConfig': {
      'factor': 3
    }
}
*/
