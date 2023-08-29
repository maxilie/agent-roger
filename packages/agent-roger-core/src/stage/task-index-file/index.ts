import {
  type StageFunctionHelpers,
  type StageFunction,
} from "../stage-function.js";
import { TASK_PRESETS } from "../presets.js";
import { getTaskBasicData } from "../../db/db-actions.js";
import { getNumTokens } from "../../model-input/index.js";
import { weaviateHelp } from "../../db/weaviate-help.js";

/**
 * Indexing a file creates documents with the following weaviate "properties":
 *  - location: the absolute path to the file, including file extension
 *  - content: a string starting with a range of line numbers,
 *          i.e. "1-69: <content of lines 1-69, or a summary of it>"
 */

const maxLlmWords = 800;
const maxLineWords = maxLlmWords / 10;
const maxWordChars = 150;
const chunkSize = maxLlmWords / 6;

type FileSegment = {
  start: number;
  end: number;
  text: string;
};

type DocumentData = {
  documentText: string;
  documentVector: number[];
};

export const INDEX_FILE_STAGE_FNS: { [key: string]: StageFunction } = {
  clearFileFromMemoryBank: async (helpers: StageFunctionHelpers) => {
    // get file name
    let fileName = "";
    for (const fieldName of Object.keys(helpers.initialInputFields || {})) {
      if (fieldName.toLowerCase().includes("file")) {
        fileName = helpers.initialInputFields[fieldName] as string;
        break;
      }
    }
    if (!fileName) {
      helpers.endStage(
        `Failed to find file name to index in initialInputFields: ${JSON.stringify(
          helpers.initialInputFields || {},
          null,
          2
        )}`
      );
      return;
    }
    helpers.set("fileName", fileName);

    // remove file from local memory bank
    await weaviateHelp.batchDeleteFileDocuments(
      helpers.weaviateClient,
      fileName,
      helpers.memoryBankID || "global"
    );

    // remove file from global memory bank
    if (helpers.memoryBankID && helpers.memoryBankID != "global") {
      await weaviateHelp.batchDeleteFileDocuments(
        helpers.weaviateClient,
        fileName,
        "global"
      );
    }
    helpers.endStage();
  },
  getFileLinesToIndex: async (helpers: StageFunctionHelpers) => {
    // read file
    const fileName = (await helpers.get("fileName")) as string;
    const fileContents = await helpers.readOrCreateFile(fileName);
    const fileLines: string[] = [];
    const untrimmedFileLines = fileContents.split("\n");
    for (const line of untrimmedFileLines) {
      // if empty line, combine it with the previous line
      if (!line.trim()) {
        if (fileLines.length) {
          fileLines[-1] = fileLines[-1] + "\n";
        }
        continue;
      }
      // get word count and check if any word is too long
      const untrimmedWords = line.split(" ");
      const wordsInLine: string[] = [];
      for (const word of untrimmedWords) {
        if (word.length > maxWordChars) {
          console.warn(`Found a long word while indexing '${fileName}'. The word will be split into ${maxWordChars}-character words, \
          which could affect results since the AI will see multiple words where there is only one. The problematic word is: ${word}`);
          for (let i = 0; i < word.length; i += maxWordChars) {
            wordsInLine.push(word.slice(i, i + maxWordChars));
          }
          continue;
        }
        wordsInLine.push(word);
      }
      // if word count is short enough, add the whole line
      if (wordsInLine.length <= maxLineWords) {
        fileLines.push(wordsInLine.join(" "));
        continue;
      }
      // if line is too long, split it into multiple lines
      for (let i = 0; i < wordsInLine.length; i += maxLineWords) {
        fileLines.push(wordsInLine.slice(i, i + maxLineWords).join(" "));
      }
    }
    helpers.set("fileLines", fileLines);
    if (!fileLines.length) {
      helpers.taskResult({
        failed: false,
        taskSummary: `Indexed empty file: ${fileName}`,
        outputFields: {},
      });
      return;
    }
    helpers.endStage();
  },
  splitFileToIndexLinesIntoChunks: async (helpers: StageFunctionHelpers) => {
    // group lines into chunks
    const fileLines = (await helpers.get("fileLines")) as string[];
    const chunksOfIndividualLines: string[][] = [];
    let i = 0;
    while (i < fileLines.length) {
      let wordsInChunk = 0;
      const linesInChunk: string[] = [];
      while (wordsInChunk < chunkSize * 0.85 && i < fileLines.length) {
        wordsInChunk += fileLines[i].split(" ").length;
        if (wordsInChunk > chunkSize) break;
        linesInChunk.push(String(i + 1) + ": " + fileLines[i]);
        i++;
      }
      chunksOfIndividualLines.push(linesInChunk);
    }
    // make chunks overlap
    for (let i = 1; i < chunksOfIndividualLines.length - 1; i++) {
      const prevLines = [];
      if (chunksOfIndividualLines[i - 1].length > 1) {
        prevLines.push(chunksOfIndividualLines[i - 1][-2]);
        prevLines.push(chunksOfIndividualLines[i - 1][-1]);
      }
      const nextLines = [];
      if (chunksOfIndividualLines[i + 1].length > 1) {
        nextLines.push(chunksOfIndividualLines[i + 1][0]);
        nextLines.push(chunksOfIndividualLines[i + 1][1]);
      }
      chunksOfIndividualLines[i] = [
        ...prevLines,
        ...chunksOfIndividualLines[i],
        ...nextLines,
      ];
    }
    helpers.set("chunksOfIndividualLines", chunksOfIndividualLines);
    helpers.endStage();
  },
  summarizeChunksOfIndividualLines: async (helpers: StageFunctionHelpers) => {
    const chunksOfIndividualLines = (await helpers.get(
      "chunksOfIndividualLines"
    )) as string[][];
    let chunkIdxToSubTaskID: { [key: number]: number } | null =
      await helpers.get("chunkIdxToSubTaskID");
    if (!chunkIdxToSubTaskID) {
      chunkIdxToSubTaskID = {};
    }
    // for each chunk, create a summary/description
    for (let i = 0; i < chunksOfIndividualLines.length; i++) {
      if (chunkIdxToSubTaskID[i]) {
        continue;
      }
      const subTaskID = await helpers.subTask({
        newTaskDefinition: TASK_PRESETS.generateJson,
        initialInputFields: {
          guidelines: [
            "Summarize the 'linesToSummarize', which contains text taken from a file with line numbers added in the \
            \"{lineNumber}: {lineText}\" format. Put the summary in a field called 'summary'.",
            "Begin the summary with the line numbers of the lines that were summarized, in the following, similar format: \
            '42-97: Summary goes here.' Do not begin every line with a line number, as that would use unnecessary extra characters.",
            "Within the summary you may use line numbers to describe where certain information is located. For example, \"Lines 62-66 \
            save the account data object that was created by 'createUserData(uuid: string)' on line 45\".",
            "If the text is code, do not add extra formatting like code fences or syntax highlighting. Try to strike a balance between \
            using plain English to describe the concepts & functionality of the code; and using code-like syntax and variable names to \
            capture as much useful detail as possible.",
            "The summary must be shorter than or roughly the same length as the text that it summarizes.",
          ],
          linesToSummarize: chunksOfIndividualLines[i].join("\n"),
        },
      });
      chunkIdxToSubTaskID[i] = subTaskID;
    }
    helpers.set("chunkIdxToSubTaskID", chunkIdxToSubTaskID);
    // wait for sub-tasks to finish
    const chunkSummaries: { [key: number]: string } = {};
    for (const chunkIdxStr of Object.keys(chunkIdxToSubTaskID)) {
      const i = Number(chunkIdxStr);
      const subTaskID = chunkIdxToSubTaskID[i];
      const subTaskData = await getTaskBasicData({ taskID: subTaskID });
      if (!subTaskData?.success) return;
      if (!subTaskData?.resultData?.outputFields) {
        helpers.endStage(
          `Expected sub-task #${subTaskID} to generate a summary of a chunk of file lines, but it did not produce any outputFields.`
        );
        return;
      }
      const outputFields = subTaskData.resultData.outputFields;
      if (outputFields.summary) {
        chunkSummaries[i] = outputFields.summary as string;
      }
    }
    helpers.set("chunkSummaries", chunkSummaries);

    // process chunk summaries into FileSegments
    const chunkFileSegments: FileSegment[] = [];
    for (const chunkSummary of Object.values(chunkSummaries)) {
      try {
        const lineNums = chunkSummary.split(":")[0].split("-");
        const start = Number(lineNums[0].trim().replaceAll(".", ""));
        const endStr = Number(lineNums[1].trim().replaceAll(".", ""));
        const summary = chunkSummary.split(":").slice(1).join(":").trim();
        chunkFileSegments.push({ start, end: endStr, text: summary });
      } catch (_) {}
    }
    if (!chunkFileSegments.length) {
      helpers.endStage(
        `Failed to generate any FileSegments from the summaries of chunks of lines. Check the AI output for unexpected formatting.`
      );
      return;
    }
    helpers.set("chunkFileSegments", chunkFileSegments);
    helpers.endStage();
  },
  embedChunks: async (helpers: StageFunctionHelpers) => {
    // create an embedding vector for each chunk
    const documentTexts: string[] = [];
    const chunksOfIndividualLines = (await helpers.get(
      "chunksOfIndividualLines"
    )) as string[][];
    for (const chunk of chunksOfIndividualLines) {
      try {
        const startLineNum = chunk[0].split(":")[0];
        const endLineNum = chunk[-1].split(":")[0];
        const chunksWithoutLineNumbers = chunk.map((text) =>
          text.split(": ").slice(1).join(": ")
        );
        const chunkText = `${startLineNum}-${endLineNum}: ${chunksWithoutLineNumbers.join(
          "\n"
        )}`;
        documentTexts.push(chunkText);
      } catch (_) {}
    }
    const embeddingPromises = [];
    for (const chunkText of documentTexts) {
      embeddingPromises.push(
        helpers.embeddingLLM({
          input: [chunkText],
          numInputTokens: [getNumTokens([chunkText])],
        })
      );
    }
    // wait for llm responses
    const results = await Promise.allSettled(embeddingPromises);
    // create documents
    const chunkDocuments: DocumentData[] = [];
    let i = -1;
    for (const result of results) {
      i += 1;
      if (result.status == "rejected" || !result.value) continue;
      const embeddingVector = result.value[0];
      chunkDocuments.push({
        documentText: documentTexts[i],
        documentVector: embeddingVector,
      });
    }
    helpers.set("chunkDocuments", chunkDocuments);
    helpers.endStage();
  },
  embedChunkFileSegments: async (helpers: StageFunctionHelpers) => {
    // create an embedding vector for each chunk's FileSegment (summary)
    const chunkFileSegments = (await helpers.get(
      "chunkFileSegments"
    )) as FileSegment[];
    const embeddingPromises = [];
    for (const fileSegment of chunkFileSegments) {
      embeddingPromises.push(
        helpers.embeddingLLM({
          input: [fileSegment.text],
          numInputTokens: [getNumTokens([fileSegment.text])],
        })
      );
    }
    // wait for llm responses
    const results = await Promise.allSettled(embeddingPromises);
    // create documents
    const chunkFileSegmentDocuments: DocumentData[] = [];
    let i = -1;
    for (const result of results) {
      i += 1;
      if (result.status == "rejected" || !result.value) continue;
      const embeddingVector = result.value[0];
      const documentText = `${chunkFileSegments[i].start}-${chunkFileSegments[i].end}: ${chunkFileSegments[i].text}`;
      chunkFileSegmentDocuments.push({
        documentText,
        documentVector: embeddingVector,
      });
    }
    helpers.set("chunkFileSegmentDocuments", chunkFileSegmentDocuments);
    helpers.endStage();
  },
  generateBroadFileSegments: async (helpers: StageFunctionHelpers) => {
    // combine chunk LineSegments into broader FileSegments
    const chunkFileSegments = (await helpers.get(
      "chunkFileSegments"
    )) as FileSegment[];
    const fileSegmentsJson: { [key: string]: string } = {};
    for (let i = 0; i < chunkFileSegments.length; i++) {
      fileSegmentsJson[
        String(i)
      ] = `${chunkFileSegments[i].start}-${chunkFileSegments[i].end}: ${chunkFileSegments[i].text}`;
    }
    chunkFileSegments.map(
      (fileSegment) =>
        `${fileSegment.start}-${fileSegment.end}: ${fileSegment.text}`
    );
    let generateBroadFileSegmentsSubTaskID: number | null = await helpers.get(
      "generateBroadFileSegmentsSubTaskID"
    );
    if (!generateBroadFileSegmentsSubTaskID) {
      generateBroadFileSegmentsSubTaskID = await helpers.subTask({
        newTaskDefinition: TASK_PRESETS.reduceJson,
        initialInputFields: {
          guidelines: [
            'Each input field describes a continuous segment of lines in the same file, beginning with a range of line numbers, in \
            the following format: "{startLine}-{endLine}: {description}". The output fields should carefully follow the same format.',
            'Change the line numbers in the output fields to capture where higher-level concepts/sections/functions begin and end. \
            For example, "1-40: someFunction does x and y and returns a string"',
            "The field names are unimportant but must be unique.",
          ],
          ...fileSegmentsJson,
        },
      });
      helpers.set(
        "generateBroadFileSegmentsSubTaskID",
        generateBroadFileSegmentsSubTaskID
      );
    }
    // wait for sub-task
    const subTaskData = await getTaskBasicData({
      taskID: generateBroadFileSegmentsSubTaskID,
    });
    if (!subTaskData?.success) return;
    if (!subTaskData?.resultData?.outputFields) {
      helpers.endStage(
        `Index File task failed. Sub-task responsible for generating broad FileSegments did not return any outputFields. \
        Sub-task id: ${generateBroadFileSegmentsSubTaskID}`
      );
      return;
    }
    // get broadFileSegments from llm output
    const broadFileSegments: FileSegment[] = [];
    const outputFields = subTaskData.resultData.outputFields;
    for (const inputFieldName of Object.keys(outputFields)) {
      const fieldNameLower = inputFieldName.toLowerCase();
      if (fieldNameLower.startsWith("_")) continue;

      const fieldValue = helpers.initialInputFields[inputFieldName];
      if (typeof fieldValue != "string") continue;
      try {
        const lineNums = fieldValue.split(":")[0].split("-");
        const startLineNum = Number(lineNums[0].trim());
        const endLineNum = Number(lineNums[0].trim());
        const description = fieldValue.split(":").slice(1).join(":").trim();
        broadFileSegments.push({
          start: startLineNum,
          end: endLineNum,
          text: description,
        });
      } catch (_) {}
    }
    helpers.set("broadFileSegments", broadFileSegments);
    helpers.endStage();
  },
  embedBroadFileSegments: async (helpers: StageFunctionHelpers) => {
    // create an embedding vector for each broad FileSegment (summary)
    const broadFileSegments = (await helpers.get(
      "broadFileSegments"
    )) as FileSegment[];
    const embeddingPromises = [];
    for (const fileSegment of broadFileSegments) {
      embeddingPromises.push(
        helpers.embeddingLLM({
          input: [fileSegment.text],
          numInputTokens: [getNumTokens([fileSegment.text])],
        })
      );
    }
    // wait for llm responses
    const results = await Promise.allSettled(embeddingPromises);
    // create documents
    const broadFileSegmentDocuments: DocumentData[] = [];
    let i = -1;
    for (const result of results) {
      i += 1;
      if (result.status == "rejected" || !result.value) continue;
      const embeddingVector = result.value[0];
      const documentText = `${broadFileSegments[i].start}-${broadFileSegments[i].end}: ${broadFileSegments[i].text}`;
      broadFileSegmentDocuments.push({
        documentText,
        documentVector: embeddingVector,
      });
    }
    helpers.set("broadFileSegmentDocuments", broadFileSegmentDocuments);
    helpers.endStage();
  },
  saveNewDocuments: async (helpers: StageFunctionHelpers) => {
    // batch save all the new documents
    const batchSize = 5;
    const fileName = (await helpers.get("fileName")) as string;
    const chunkDocuments = (await helpers.get(
      "chunkDocuments"
    )) as DocumentData[];
    const chunkFileSegmentDocuments = (await helpers.get(
      "chunkFileSegmentDocuments"
    )) as DocumentData[];
    const broadFileSegmentDocuments = (await helpers.get(
      "broadFileSegmentDocuments"
    )) as DocumentData[];
    const allDocuments: {
      class: string;
      properties: { location: string; content: string };
      vector: number[];
    }[] = [];
    const documentClass =
      weaviateHelp.MEMORY_BANK_CLASS_PREFIX +
      (helpers.memoryBankID || "global");
    const usingLocalMemoryBank =
      helpers.memoryBankID && helpers.memoryBankID != "global";
    [
      ...chunkDocuments,
      ...chunkFileSegmentDocuments,
      ...broadFileSegmentDocuments,
    ].forEach((document) => {
      // add to local memory bank
      allDocuments.push({
        class: documentClass,
        properties: {
          location: fileName,
          content: document.documentText,
        },
        vector: document.documentVector,
      });
      if (usingLocalMemoryBank) {
        // add to global memory bank
        allDocuments.push({
          class: weaviateHelp.MEMORY_BANK_CLASS_PREFIX + "global",
          properties: {
            location: fileName,
            content: document.documentText,
          },
          vector: document.documentVector,
        });
      }
    });
    let batcher = helpers.weaviateClient.batch.objectsBatcher();
    let objectsInBatch = 0;
    for (let i = 0; i < allDocuments.length; i++) {
      batcher = batcher.withObject(allDocuments[i]);
      objectsInBatch += 1;
      if (objectsInBatch >= batchSize || i == allDocuments.length - 1) {
        await batcher.withConsistencyLevel("ONE").do();
        batcher = helpers.weaviateClient.batch.objectsBatcher();
      }
    }
    helpers.set("finalDocumentsSaved", allDocuments);
    helpers.taskResult({
      failed: false,
      taskSummary: `Indexed file: "${fileName}" into ${allDocuments.length} documents`,
      outputFields: {},
    });
  },
};
