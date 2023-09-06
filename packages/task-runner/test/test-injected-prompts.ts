console.log("Starting up! Importing dependencies...");

import * as neo4j from "neo4j-driver";
import { type WeaviateClient } from "weaviate-ts-client";

import {
  assembleTextLlmInput,
  db,
  env,
  JsonObj,
  RedisManager,
  prompts,
} from "agent-roger-core";
import {
  _preprocessJson,
  addPromptInjections,
  checkPromptExistsInWeaviate,
  embedAndSaveInjectedPromptToWeaviate,
  fetchLocalEmbeddingResult,
  findAndScoreInjectedPrompts,
} from "../src/injected-prompt-fns.js";

// define testing data
type TestDataPair = {
  userMessage: JsonObj;
  assistantMessage: string;
};
const basePrompt: TestDataPair = {
  userMessage: {
    instructions: [
      "Break down the 'task' into at most 4 specific, descriptive steps. Output each step as an element of an array called 'steps'. Ensure that the steps closely follow the guidelines outlined in 'suggestedApproaches'.",
    ],
    task: {
      taskInstructions:
        "Index the main readme file and the inference readme file, and use the information in them to create or edit the file at '/Users/max/Desktop/mpt-7b-chat/inference-instructions.md', containing detailed instructions on how to inference an array of ChatML messages using HuggingFace on a 3rd party server, not using Mosaic's inference service.",
      mainReadmeFilename: "/Users/max/Desktop/llm-foundry/README.md",
      inferenceReadmeFilename:
        "/Users/max/Desktop/llm-foundry/scripts/inference/README.md",
    },
    suggestedApproaches: [
      {
        scenario:
          "User has specified the directory of a project, file, or files that he wants you to make changes to, but he has not specified particular lines to change in a particular file; or, the user has specified particular lines, but has also requested other changes that require you to further edit more lines or more files.",
        approach:
          "Step 0) If the current memoryBank is null, empty, or unspecified, then the first step is to 'create a new memory bank and change the current memory bank to the new one'. If the user has indicated that he doesn't want you to re-index, or that he wants you to use the global memory bank, then the first step is to 'switch to the global memory bank'. Step 1) Index the directory, file, or files given by the user. Step 2) Determine what general changes to make. If there are more than a handful of changes, then break them down into smaller groups of changes. Step 3) For each broad change or group of changes, create a sub-task to make the changes. Step 4) Verify that the changes were made correctly.",
        exampleOfSomeOutputFields: {},
      },
      {
        scenario:
          "User has specified the directory of a project, file, or files that he wants you to index or add to the memory bank.",
        approach:
          "Step 0) If trying to index a folder, run a shell command to get the filenames and folders in the folder. Step 1) For each file or folder, create a sub-task to index it. If there are too many files/folders, group them into multiple sub-tasks, like '1. Index m,n,o folders. 2. Index a,b,c,d files. 3. Index w,x,y,z files.'",
        exampleOfSomeOutputFields: {},
      },
    ],
    expectedOutputFields: {
      steps:
        "An array of strings, each explaining in plain english a step to take toward completing the task. If a step involves a file,         make sure to include the file name in the step description.",
    },
  },
  assistantMessage: "base prompt",
};
const promptsToCompare: { [key: string]: TestDataPair } = {
  similar1: {
    userMessage: {
      instructions: [
        "Break down the 'task' into at most 4 specific, descriptive steps. Output each step as an element of an array called 'steps'. Ensure that the steps closely follow the guidelines outlined in 'suggestedApproaches'.",
      ],
      task: {
        taskInstructions:
          "Index the project readme, and use them to edit the file at '/Users/johnny/Desktop/123-abc/readme-valid.md', containing detailed instructions on how to inference an array of ChatML messages using HuggingFace on a 3rd party server, not using Mosaic's inference service.",
        projectReadmeFilename: "/Users/johnny/Desktop/123-abc/readme-valid.md",
        otherReadmeFilename:
          "/Users/johnny/Desktop/123-abc/2094ursldfj/readme-valid.md",
      },
      suggestedApproaches: [
        {
          scenario:
            "User has specified the directory of a project, file, or files that he wants you to make changes to, but he has not specified particular lines to change in a particular file; or, the user has specified particular lines, but has also requested other changes that require you to further edit more lines or more files.",
          approach:
            "Step 0) If the current memoryBank is null, empty, or unspecified, then the first step is to 'create a new memory bank and change the current memory bank to the new one'. If the user has indicated that he doesn't want you to re-index, or that he wants you to use the global memory bank, then the first step is to 'switch to the global memory bank'. Step 1) Index the directory, file, or files given by the user. Step 2) Determine what general changes to make. If there are more than a handful of changes, then break them down into smaller groups of changes. Step 3) For each broad change or group of changes, create a sub-task to make the changes. Step 4) Verify that the changes were made correctly.",
          exampleOfSomeOutputFields: {},
        },
        {
          scenario:
            "User has specified the directory of a project, file, or files that he wants you to index or add to the memory bank.",
          approach:
            "Step 0) If trying to index a folder, run a shell command to get the filenames and folders in the folder. Step 1) For each file or folder, create a sub-task to index it. If there are too many files/folders, group them into multiple sub-tasks, like '1. Index m,n,o folders. 2. Index a,b,c,d files. 3. Index w,x,y,z files.'",
          exampleOfSomeOutputFields: {},
        },
      ],
      expectedOutputFields: {
        steps:
          "An array of strings, each explaining in plain english a step to take toward completing the task. If a step involves a file,         make sure to include the file name in the step description.",
      },
    },
    assistantMessage: "1 similar to base prompt",
  },
  similar2: {
    userMessage: {
      instructions: [
        "Break down the 'task' into at most 4 specific, descriptive steps. Output each step as an element of an array called 'steps'. Ensure that the steps closely follow the guidelines outlined in 'suggestedApproaches'.",
      ],
      task: {
        taskInstructions:
          "Index the main readme file and use the information to update the guide at '/Users/sara/Documents/quick-guide.md', focusing on the inference steps.",
        mainReadmeFilename: "/Users/sara/Documents/main-readme.md",
      },
      suggestedApproaches: [
        {
          scenario:
            "User has specified the directory of a project, file, or files that he wants you to index or add to the memory bank.",
        },
      ],
      expectedOutputFields: {
        steps:
          "An array of strings, each explaining in plain english a step to take toward completing the task. If a step involves a file,         make sure to include the file name in the step description.",
      },
    },
    assistantMessage: "2 similar to base prompt",
  },
  similar3: {
    userMessage: {
      instructions: [
        "Break down the 'task' into at most 4 specific, descriptive steps. Output each step as an element of an array called 'steps'. Ensure that the steps closely follow the guidelines outlined in 'suggestedApproaches'.",
      ],
      task: {
        taskInstructions:
          "Index the documentation directory and use it to update the installation instructions on '/Users/bob/Documents/installation-guide.md'.",
        documentationDirectory: "/Users/bob/Documents/documentation",
      },
      suggestedApproaches: [
        {
          scenario:
            "User has specified the directory of a project, file, or files that he wants you to make changes to, but he has not specified particular lines to change in a particular file; or, the user has specified particular lines, but has also requested other changes that require you to further edit more lines or more files.",
          approach:
            "Step 0) If the current memoryBank is null, empty, or unspecified, then the first step is to 'create a new memory bank and change the current memory bank to the new one'. If the user has indicated that he doesn't want you to re-index, or that he wants you to use the global memory bank, then the first step is to 'switch to the global memory bank'. Step 1) Index the directory, file, or files given by the user. Step 2) Determine what general changes to make. If there are more than a handful of changes, then break them down into smaller groups of changes. Step 3) For each broad change or group of changes, create a sub-task to make the changes. Step 4) Verify that the changes were made correctly.",
          exampleOfSomeOutputFields: {},
        },
        {
          scenario:
            "User has specified the directory of a project, file, or files that he wants you to index or add to the memory bank.",
          approach:
            "Step 0) If trying to index a folder, run a shell command to get the filenames and folders in the folder. Step 1) For each file or folder, create a sub-task to index it. If there are too many files/folders, group them into multiple sub-tasks, like '1. Index m,n,o folders. 2. Index a,b,c,d files. 3. Index w,x,y,z files.'",
          exampleOfSomeOutputFields: {},
        },
      ],
    },
    assistantMessage: "3 similar to base prompt",
  },
  unrelated1: {
    userMessage: {
      instructions: [
        "Calculate the total area of the garden based on the dimensions given. Output the result in square meters.",
      ],
      task: {
        length: 10,
        width: 12,
      },
      expectedOutputFields: {
        totalArea: "Total area of the garden in square meters.",
      },
    },
    assistantMessage: "1 unrelated to base prompt",
  },
  unrelated2: {
    userMessage: {
      instructions: [
        "Convert the given list of temperatures from Fahrenheit to Celsius. Output the converted temperatures as an array.",
      ],
      task: {
        temperatures: [32, 45, 67],
      },
      expectedOutputFields: {
        convertedTemperatures: "Array containing temperatures in Celsius.",
      },
    },
    assistantMessage: "2 unrelated to base prompt",
  },
  unrelated3: {
    userMessage: {
      instructions: [
        "Translate the given sentence into French. Output the translated sentence.",
      ],
      task: {
        sentence: "How are you?",
      },
      expectedOutputFields: {
        translatedSentence: "The sentence translated into French.",
      },
      suggestedApproaches: [
        {
          scenario:
            "User has specified the directory of a project, file, or files that he wants you to index or add to the memory bank.",
          approach:
            "Step 0) If trying to index a folder, run a shell command to get the filenames and folders in the folder. Step 1) For each file or folder, create a sub-task to index it. If there are too many files/folders, group them into multiple sub-tasks, like '1. Index m,n,o folders. 2. Index a,b,c,d files. 3. Index w,x,y,z files.'",
          exampleOfSomeOutputFields: {},
        },
      ],
    },
    assistantMessage: "3 unrelated to base prompt",
  },
};

// change host name for docker containers from "host.docker.internal" to "localhost"
process.env.WEAVIATE_HOST = (
  process.env.WEAVIATE_HOST || "host.docker.internal:8080"
).replace("host.docker.internal", "localhost");
env.WEAVIATE_HOST = process.env.WEAVIATE_HOST;
process.env.REDIS_HOST = (
  process.env.REDIS_HOST || "host.docker.internal"
).replace("host.docker.internal", "localhost");
env.REDIS_HOST = process.env.REDIS_HOST;
process.env.LOCAL_EMBEDDINGS_URL = (
  process.env.LOCAL_EMBEDDINGS_URL ||
  "http://host.docker.internal:699/embedParagraph/"
).replace("host.docker.internal", "localhost");
env.LOCAL_EMBEDDINGS_URL = process.env.LOCAL_EMBEDDINGS_URL;

// startup db connections
let weaviateClient: WeaviateClient;
let neo4jDriver: neo4j.Driver;
let redis: RedisManager;
const initialize = async () => {
  // connect to weaviate
  weaviateClient = db.weaviateHelp.createWeaviateClient();
  // ensure weaviate schema are created
  if (!(await db.weaviateHelp.isConnectionValid(weaviateClient))) {
    console.error("Could not connect to weaviate");
    process.exit(1);
  }
  console.log("connected to weaviate");

  // connect to neo4j
  neo4jDriver = neo4j.driver(
    env.NEO4J_URI,
    neo4j.auth.basic(env.NEO4J_USER, env.NEO4J_PASS)
  );
  await neo4jDriver.getServerInfo();
  console.log("connected to neo4j");

  // connect to redis & init pipeline
  redis = new RedisManager();
  await redis.redis.ping();
  console.log("connected to redis");
};

/**
 * Deletes all injected prompts from weaviate.
 */
const clearInjectedPrompts = async () => {
  await weaviateClient.schema
    .classDeleter()
    .withClassName(db.weaviateHelp.INJECTED_PROMPTS_CLASS_NAME)
    .do();
  await db.weaviateHelp.insertSchema(
    weaviateClient,
    db.weaviateHelp.injectedPromptsClassObj
  );
};

/**
 * Helper function to find test data key that corresponds to a userMessage
 */
const findTestDataKey = (assistantMessage: string) => {
  if (basePrompt.assistantMessage == assistantMessage) {
    return "base prompt";
  }
  for (const [testPromptKey, testPrompt] of Object.entries(promptsToCompare)) {
    if (testPrompt.assistantMessage == assistantMessage) {
      return testPromptKey;
    }
  }
  return "UNKNOWN";
};

/**
 * Searches weaviate for a vector and prints debug messages.
 */
const performVectorSearch = async (userMessage: JsonObj) => {
  //   console.log("Generating search vector for: " + JSON.stringify(userMessage).slice(0, 60) + "...");
  const shortenedJson = _preprocessJson({ ...userMessage });
  //   console.log("JSON condensed to: ");
  console.log(shortenedJson);
  //   console.log("Generating embedding...");
  const embeddedPromptData = await fetchLocalEmbeddingResult(shortenedJson);
  if (!embeddedPromptData.vector) {
    throw new Error(
      `Error generating semantic embedding: ${
        embeddedPromptData.errorMessage ?? "empty error message"
      }`
    );
  }
  const vectorSearchRes = await weaviateClient.graphql
    .get()
    .withClassName(db.weaviateHelp.INJECTED_PROMPTS_CLASS_NAME)
    .withFields(
      "userMessage assistantMessage numTokens _additional {certainty}"
    )
    .withNearVector({
      vector: embeddedPromptData.vector,
      certainty: 0.1,
    })
    // .withConsistencyLevel("ONE")
    .withLimit(7)
    .do();
  //   console.log("Vector search results (top 7):");
  //   console.log(vectorSearchRes.data);
  try {
    const data = vectorSearchRes.data as { Get: { [key: string]: object[] } };
    for (const promptData of data.Get[
      db.weaviateHelp.INJECTED_PROMPTS_CLASS_NAME
    ]) {
      const promptDataTyped = promptData as {
        userMessage: string;
        assistantMessage: string;
        _additional: { certainty: number };
      };
      const dataPointID = findTestDataKey(promptDataTyped.assistantMessage);
      console.log(
        "vector search returned:",
        dataPointID,
        "with vector similarity",
        promptDataTyped._additional.certainty.toFixed(3)
      );
    }
  } catch (_) {}
  console.log("");
};

/**
 * Prints output of the production method that searches (by vector similarity) and scores (by lev distance) prompts.
 */
const performSearchAndScore = async (
  userMessage: JsonObj,
  minVectorSimilarity: number
) => {
  const res = await findAndScoreInjectedPrompts(
    weaviateClient,
    userMessage,
    minVectorSimilarity
  );
  res.sort((a, b) => b.similarityScore - a.similarityScore);
  for (const data of res) {
    const dataPointID = findTestDataKey(data.assistantMessage);
    console.log(
      "search & score returned:",
      dataPointID,
      "with final similarity score: " +
        data.similarityScore.toFixed(3) +
        ".  keys similarity: " +
        data.keysSimilarity.toFixed(3) +
        ". vals similarity: " +
        data.valsSimilarity.toFixed(3)
    );
  }
  console.log("");
};

/**
 * Clears injected prompts from weaviate. Adds test data. Checks that test data was added.
 */
const importTestData = async () => {
  // clear injected prompts from weaviate
  console.log("clearing injected prompts from weaviate...");
  await clearInjectedPrompts();

  // add test data
  console.log("saving test data to weaviate...");
  await embedAndSaveInjectedPromptToWeaviate(weaviateClient, {
    userMessage: JSON.stringify(basePrompt.userMessage),
    assistantMessage: basePrompt.assistantMessage,
    numTokens: 3000,
  });
  const numDocsSaved = Object.keys(promptsToCompare).length + 1;
  for (const promptData of Object.values(promptsToCompare)) {
    await embedAndSaveInjectedPromptToWeaviate(weaviateClient, {
      userMessage: JSON.stringify(promptData.userMessage),
      assistantMessage: promptData.assistantMessage,
      numTokens: 3000,
    });
  }
  console.log("saved", numDocsSaved, "test documents to weaviate");

  // get all objects from weaviate
  const first3Objects = await weaviateClient.graphql
    .get()
    .withClassName(db.weaviateHelp.INJECTED_PROMPTS_CLASS_NAME)
    .withFields("userMessage")
    .withLimit(3)
    .do();
  console.log("First 3 objects found in weaviate:");
  console.log(first3Objects.data);
  try {
    const data = first3Objects.data as { Get: { [key: string]: object[] } };
    const firstUserMsg =
      data.Get[db.weaviateHelp.INJECTED_PROMPTS_CLASS_NAME][0];
    console.log("First user message found in weaviate:");
    console.log(firstUserMsg);
  } catch (error) {
    console.log(error);
  }

  // do a direct search for the base object
  console.log("");
  console.log("Running direct search for test data in weaviate...");
  if (
    await checkPromptExistsInWeaviate(weaviateClient, {
      userMessage: JSON.stringify(basePrompt.userMessage),
      assistantMessage: basePrompt.assistantMessage,
    })
  ) {
    console.log("Found test data in weaviate (direct search)!");
  } else {
    console.warn("DID NOT FIND TEST DATA IN WEAVIATE (direct search");
  }
  console.log("");
  console.log("base message: " + JSON.stringify(basePrompt.userMessage));
  console.log("");
};

/**
 * Tests vector searching for the base prompt and each other prompt.
 */
const testVectorSearches = async () => {
  // do a vector search for the base object
  console.log("");
  console.log("RUNNING VECTOR SEARCH FOR BASE DATA POINT");
  await performVectorSearch(basePrompt.userMessage);

  // do a vector search for each other object
  for (const [testDataKey, testDataObj] of Object.entries(promptsToCompare)) {
    console.log("");
    console.log("RUNNING VECTOR SEARCH FOR DATA POINT:", testDataKey);
    await performVectorSearch(testDataObj.userMessage);
  }
};

/**
 * Test production code for finding prompt injections for similar prompts.
 */
const testLevenshteinScoring = async () => {
  // search and score prompts for the base object
  const minVectorSimilarity = 0.71;
  console.log("");
  console.log(
    "Min weaviate vector similarity in production is probably 0.71. Testing with",
    minVectorSimilarity
  );
  console.log(
    "Using production code to find & score prompts (by vector similarity and levenshtein distance)..."
  );
  console.log("");
  console.log("RUNNING PRODUCTION SEARCH & SCORE FOR BASE DATA POINT");
  await performSearchAndScore(basePrompt.userMessage, minVectorSimilarity);

  // search and score prompts for each other object
  for (const [testDataKey, testDataObj] of Object.entries(promptsToCompare)) {
    console.log("");
    console.log(
      "RUNNING PRODUCTION SEARCH & SCORE FOR DATA POINT:",
      testDataKey
    );
    await performSearchAndScore(testDataObj.userMessage, minVectorSimilarity);
  }
};

/**
 * Test production code for adding prompt injections to an LLM input.
 */
const testAddPromptInjections = async () => {
  console.log("");
  console.log("Using production code to inject prompt(s) into LLM input...");
  const llmInput = assembleTextLlmInput({
    // names don't matter (will be overwritten) - just the token count
    prompt: { t: basePrompt.userMessage },
    systemMessage: prompts.system.default,
    expectedOutputFields: {},
  });
  llmInput.chatMlMessages = [
    "System: " + prompts.system.default,
    "User: " + JSON.stringify(basePrompt.userMessage),
  ];
  const enhancedLlmInput = await addPromptInjections(llmInput, weaviateClient);
  enhancedLlmInput.chatMlMessages.forEach((msg, idx) =>
    console.log(idx + 1, ": ", msg)
  );
};

// cleanup function
const closeConnections = async (): Promise<void> => {
  try {
    await neo4jDriver?.close();
  } catch (_) {}
  try {
    await redis?.redis.quit();
  } catch (_) {}
};

// entrypoint
const runTest = () => {
  console.log("Running test-injected-prompts...");

  // initialize connections
  initialize()
    .then(async () => {
      try {
        // test saving a few prompts to weaviate and then looking them up
        await importTestData();
        await new Promise((resolve) => setTimeout(resolve, 100));
        await testVectorSearches();
        await testLevenshteinScoring();
        await testAddPromptInjections();
        console.log("Tests succeeded.");
      } catch (error) {
        console.error("Tests failed: ");
        throw error;
      }
    })
    .catch((error) => {
      console.error("Initialization failed: ");
      throw error;
    })
    .finally(() => {
      closeConnections()
        .then(() => {
          process.exit(0);
        })
        .catch((_) => {
          // ignore db closing errors
        });
    });
};
runTest();
