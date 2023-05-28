import {
  type StageFunctionHelpers,
  type StageFunction,
} from "../stage-function.js";
import { TASK_PRESETS } from "../presets.js";
import { getTaskBasicData } from "../../db/db-actions.js";

const maxLlmWords = 850;
const maxLineWords = maxLlmWords / 9.8;
const maxWordChars = 180;
const chunkSize = maxLlmWords / 6.5;

type FileSegment = {
  start: number;
  end: number;
  text: string;
};

export const MODIFY_FILE_STAGE_FNS: { [key: string]: StageFunction } = {
  deleteFileIfRequested: async (helpers: StageFunctionHelpers) => {
    // get input fields
    let fileName = "";
    let deleteFile = false;
    let changes: string[] = [];
    for (const fieldName of Object.keys(helpers.initialInputFields || {})) {
      const fieldNameLower = fieldName.toLowerCase();
      if (fieldNameLower.includes("filename")) {
        fileName = (helpers.initialInputFields[fieldName] as string).trim();
      } else if (
        fieldNameLower.includes("delete") &&
        helpers.initialInputFields[fieldName]
      ) {
        deleteFile = true;
      } else if (fieldNameLower.includes("change")) {
        changes = helpers.initialInputFields[fieldName] as string[];
      }
    }
    helpers.set("fileName", fileName);
    helpers.set("deleteFile", deleteFile);
    helpers.set("changes", changes);
    if (!fileName) {
      helpers.endStage(
        `Failed to find file name to modify in initialInputFields: ${JSON.stringify(
          helpers.initialInputFields || {},
          null,
          2
        )}`
      );
      return;
    }
    if (!deleteFile) {
      if (!changes) {
        helpers.endStage(`Could not find array of changes to make to the file, ${fileName}, in the task's initialInputFields: \
        ${JSON.stringify(helpers.initialInputFields, null, 2)}`);
        return;
      }
      helpers.endStage();
      return;
    }

    // delete file from filesystem
    try {
      await helpers.execCmd(`rm ${fileName}`);
    } catch (error) {
      helpers.set("errorDeletingFromFilesystem", (error as Error).toString());
    }

    // remove file from local memory bank
    const documentClass = "Class-" + (helpers.memoryBankID || "global");
    const response = await helpers.weaviateClient.graphql
      .get()
      .withClassName(documentClass)
      .withWhere({
        path: ["location"],
        operator: "Equal",
        valueText: fileName,
      })
      .withFields("_additional {id}")
      .do();
    const documentIdsToDelete: string[] = [];
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (response?.data?.Get && response?.data?.Get[documentClass]) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const documents = response.data.Get[documentClass];
      for (const document of documents) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
        const id = document._additional.id as string;
        documentIdsToDelete.push(id);
      }
      for (const documentID of documentIdsToDelete) {
        await helpers.weaviateClient.data
          .deleter()
          .withClassName(documentClass)
          .withId(documentID)
          .do();
      }
    }

    // remove file from global memory bank
    if (helpers.memoryBankID && helpers.memoryBankID != "global") {
      const response = await helpers.weaviateClient.graphql
        .get()
        .withClassName("Class-global")
        .withWhere({
          path: ["location"],
          operator: "Equal",
          valueText: fileName,
        })
        .withFields("_additional {id}")
        .do();
      const documentIdsToDelete: string[] = [];
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (response?.data?.Get && response?.data?.Get[documentClass]) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        const documents = response.data.Get[documentClass];
        for (const document of documents) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
          const id = document._additional.id as string;
          documentIdsToDelete.push(id);
        }
        for (const documentID of documentIdsToDelete) {
          await helpers.weaviateClient.data
            .deleter()
            .withClassName("Class-global")
            .withId(documentID)
            .do();
        }
      }
    }
    helpers.taskResult({
      failed: false,
      taskSummary: "Deleted file: " + fileName,
      outputFields: {},
    });
  },
  readLinesOfFileToModify: async (helpers: StageFunctionHelpers) => {
    // read or create file
    const fileName = (await helpers.get("fileName")) as string;
    const fileContents = await helpers.readOrCreateFile(fileName);
    helpers.set("fileContents", fileContents);
    helpers.endStage();
  },
  extractOrCreateOldChunks: async (helpers: StageFunctionHelpers) => {
    const fileName = (await helpers.get("fileName")) as string;
    let fileContents: string = (await helpers.get("fileContents")) as string;
    // if file is empty, draft skeleton of the new contents
    if (!fileContents || !fileContents.trim()) {
      const generateInitialSkeletonTaskID: number | null = await helpers.get(
        "generateInitialSkeletonTaskID"
      );
      if (!generateInitialSkeletonTaskID) {
        const changes = (await helpers.get("changes")) as string[];
        const subTaskID = await helpers.subTask({
          newTaskDefinition: TASK_PRESETS.generateJson,
          initialInputFields: {
            instructions:
              "Generate an outline or skeleton of a file that meets the conditions specified in 'textToGenerate'. Write the \
            text to an output field called 'generatedText'.",
            textToGenerate: changes,
          },
        });
        helpers.set("generateInitialSkeletonTaskID", subTaskID);
        return;
      }
      const subTaskData = await getTaskBasicData({
        taskID: generateInitialSkeletonTaskID,
      });
      if (!subTaskData?.success) return;
      const outputFields = subTaskData.resultData?.outputFields;
      if (!outputFields) {
        const fileName = (await helpers.get("fileName")) as string;
        helpers.endStage(`Failed to generate initial skeleton needed to build the file, ${fileName}. No output fields found in \
        sub-task data: ${JSON.stringify(subTaskData, null, 2)}`);
        return;
      }
      let initialSkeleton = "";
      for (const subTaskOutput of Object.values(outputFields)) {
        if (typeof subTaskOutput != "string") continue;
        if (subTaskOutput.length > initialSkeleton.length) {
          initialSkeleton = subTaskOutput;
        }
      }
      if (!initialSkeleton.trim()) {
        helpers.endStage(`Failed to generate initial skeleton needed to build the file, ${fileName}. Invalid output fields found in \
        sub-task data: ${JSON.stringify(outputFields, null, 2)}`);
        return;
      }
      fileContents = initialSkeleton;
      helpers.set("fileContents", fileContents);
    }
    // extract lines from file
    const fileLines: string[] = [];
    const untrimmedFileLines = fileContents.split("\n");
    for (const line of untrimmedFileLines) {
      // if empty line, combine it to the previous line
      if (!line.trim()) {
        if (fileLines.length) {
          fileLines[-1] = fileLines[-1] + "\n";
        }
        continue;
      }
      // ensure each word is short enough
      const wordsInLine: string[] = [];
      for (const word of line.split(" ")) {
        if (word.length > maxWordChars) {
          helpers.endStage(`Found a long word while trying to modify the file: '${fileName}'. The problematic word has ${word.length} \
          characters: ${word}`);
          return;
        }
        wordsInLine.push(word);
      }

      // ensure each line is short enough
      if (wordsInLine.length > maxLineWords) {
        helpers.endStage(`Found a long line while trying to modify the file: '${fileName}'. The problematic line has ${
          wordsInLine.length
        } \
        words: ${wordsInLine.join(" ")}`);
        return;
      }
      fileLines.push(wordsInLine.join(" "));
    }
    helpers.set("fileLines", fileLines);
    // split file into chunks of lines
    const oldFileSegments: FileSegment[] = [];
    let i = 0;
    while (i < fileLines.length) {
      const startLineNum = i + 1;
      let wordsInChunk = 0;
      const linesInChunk: string[] = [];
      while (wordsInChunk < chunkSize * 0.85 && i < fileLines.length) {
        wordsInChunk += fileLines[i].split(" ").length;
        if (wordsInChunk > chunkSize) break;
        linesInChunk.push(fileLines[i]);
        i++;
      }
      oldFileSegments.push({
        start: startLineNum,
        end: i,
        text: linesInChunk.join("\n"),
      });
    }
    helpers.set("oldFileSegments", oldFileSegments);
    helpers.endStage();
  },
  modifyOldFileSegments: async (helpers: StageFunctionHelpers) => {
    const fileName = (await helpers.get("fileName")) as string;
    const changes = (await helpers.get("changes")) as string[];
    const oldFileSegments = (await helpers.get(
      "oldFileSegments"
    )) as FileSegment[];
    const newFileSegments: FileSegment[] =
      (await helpers.get("newFileSegments")) || [];
    const segmentIdxToEditSegmentSubTaskID: { [key: number]: number } =
      (await helpers.get("segmentIdxToEditSegmentSubTaskID")) || {};
    const segmentIdxToEditingInstructions: { [key: number]: string } =
      (await helpers.get("segmentIdxToEditingInstructions")) || {};
    const segmentIdxToEditingInstructionsSubTaskID: { [key: number]: number } =
      (await helpers.get("segmentIdxToGenerateInstructionsSubTaskID")) || {};
    const segmentIdxToIssues: { [key: number]: string } =
      (await helpers.get("segmentIdxToIssues")) || {};
    const segmentIdxToIssuesSubTaskID: { [key: number]: number } =
      (await helpers.get("segmentIdxToIssuesSubTaskID")) || {};
    const segmentIdxToFixedSegment: { [key: number]: FileSegment } =
      (await helpers.get("segmentIdxToFixedSegment")) || {};
    const segmentIdxToFixSegmentSubTaskID: { [key: number]: number } =
      (await helpers.get("segmentIdxToFixSegmentSubTaskID")) || {};
    const segmentIdxToBlueprint: { [key: number]: string } =
      (await helpers.get("segmentIdxToBlueprint")) || {};
    const segmentIdxToBlueprintSubTaskID: { [key: number]: number } =
      (await helpers.get("segmentIdxToBlueprintSubTaskID")) || {};
    // rewrite each segment of the file sequentially
    for (let i = 0; i < oldFileSegments.length; i++) {
      // move to the next segment once this one was been edited and a new blueprint created
      if (segmentIdxToBlueprint[i]) {
        continue;
      }

      // generate instructions for editing the chunk
      if (!segmentIdxToEditingInstructions[i]) {
        if (!segmentIdxToEditingInstructionsSubTaskID[i]) {
          const oldFileSegment = oldFileSegments[i];
          const linesFieldName = `fileContentsLines${oldFileSegment.start}Through${oldFileSegment.end}`;
          let previousFewLines = "";
          if (i > 0) {
            const allPreviousLines =
              segmentIdxToFixedSegment[i - 1].text.split("\n");
            let wordsInPrevLines = 0;
            let j = allPreviousLines.length - 1;
            while (j > 0) {
              wordsInPrevLines += allPreviousLines[j].split(" ").length;
              if (wordsInPrevLines > 80) break;
              j--;
            }
            previousFewLines = "...\n" + allPreviousLines.slice(j).join("\n");
          }
          const blueprint = i == 0 ? "" : segmentIdxToBlueprint[i - 1];
          const blueprintFieldName = `descriptionOfLines1Through${
            oldFileSegment.start - 1
          }`;
          const subTaskID = await helpers.subTask({
            newTaskDefinition: TASK_PRESETS.generateJson,
            initialContextFields: {
              backgroundInformation: `The field 'changesToMakeToFile' contains a list of all the changes that the user wants to make \
              to a certain file. For now, the user only wants to edit or rewrite lines ${oldFileSegment.start} through \
              ${oldFileSegment.end}, so some of the changes might not apply to this part of the file.`,
              ...(previousFewLines
                ? {
                    previousFewLines,
                  }
                : {}),
              ...(blueprint ? { [blueprintFieldName]: blueprint } : {}),
            },
            initialInputFields: {
              instructions: `Write careful and precise instructions for how best to change lines ${oldFileSegment.start} through \
              ${oldFileSegment.end}, given the changes the user wishes to make to the file as a whole. Output the step-by-step \
              instructions in a field called 'editingInstructions'.`,
              changesToMakeToFile: changes,
              [linesFieldName]: oldFileSegments[i].text,
            },
          });
          segmentIdxToEditingInstructionsSubTaskID[i] = subTaskID;
          helpers.set(
            "segmentIdxToEditingInstructionsSubTaskID",
            segmentIdxToEditingInstructionsSubTaskID
          );
          return;
        }
        const subTaskID = segmentIdxToEditingInstructionsSubTaskID[i];
        const subTaskData = await getTaskBasicData({ taskID: subTaskID });
        if (!subTaskData?.success) return;
        const subTaskOutput =
          subTaskData.resultData?.outputFields?.editingInstructions;
        if (!subTaskOutput || typeof subTaskOutput != "string") {
          helpers.endStage(`Failed to generate instructions for editing the next chunk of file, ${fileName}. No output field \
           "editingInstructions" found in sub-task data: ${JSON.stringify(
             subTaskData || {},
             null,
             2
           )}`);
          return;
        }
        segmentIdxToEditingInstructions[i] = subTaskOutput;
        helpers.set(
          "segmentIdxToEditingInstructions",
          segmentIdxToEditingInstructions
        );
      }

      // generate new, edited chunk
      if (newFileSegments.length <= i) {
        if (!segmentIdxToEditSegmentSubTaskID[i]) {
          const oldFileSegment = oldFileSegments[i];
          const linesFieldName = `lines${oldFileSegment.start}Through${oldFileSegment.end}`;
          const prevSegmentFieldName = `aFewLinesBefore${oldFileSegment.start}`;
          const blueprint = i == 0 ? "" : segmentIdxToBlueprint[i - 1];
          const blueprintFieldName = `descriptionOfLines1Through${
            oldFileSegment.start - 1
          }`;
          let prevSegmentStr = "";
          if (i > 0) {
            prevSegmentStr = segmentIdxToFixedSegment[i - 1].text;
          }
          const subTaskID = await helpers.subTask({
            newTaskDefinition: TASK_PRESETS.generateJson,
            initialContextFields: {
              backgroundInformation: `The field 'instructions' contains instructions for how to edit lines \
              ${oldFileSegment.start} through ${oldFileSegment.end} of a file. This portion of the file might need to be completely \
              rewritten from scratch, or it might not need any editing at all, depending on the 'instructions'.`,
              expectedOutput: `The output should contain a string field, 'editedText', with new content for the portion of the file \
              beginning at ${oldFileSegment.start}. Depending on the instructions, the 'editedText' can be any number of line; it does \
              not have to end at line ${oldFileSegment.end} if the instructions call for more lines to be written.`,
              ...(prevSegmentStr
                ? { [prevSegmentFieldName]: prevSegmentStr }
                : {}),
              ...(blueprint ? { [blueprintFieldName]: blueprint } : {}),
            },
            initialInputFields: {
              instructions: segmentIdxToEditingInstructions[i],
              [linesFieldName]: oldFileSegments[i].text,
            },
          });
          segmentIdxToEditSegmentSubTaskID[i] = subTaskID;
          helpers.set(
            "segmentIdxToEditSegmentSubTaskID",
            segmentIdxToEditSegmentSubTaskID
          );
          return;
        }
        const subTaskID = segmentIdxToEditSegmentSubTaskID[i];
        const subTaskData = await getTaskBasicData({ taskID: subTaskID });
        if (!subTaskData?.success) return;
        const subTaskOutput = subTaskData.resultData?.outputFields?.editedText;
        if (!subTaskOutput || typeof subTaskOutput != "string") {
          helpers.endStage(`Failed to generate a new chunk of the file, ${fileName}. No output field "editedText" found in \
          sub-task data: ${JSON.stringify(subTaskData || {}, null, 2)}`);
          return;
        }
        newFileSegments.push({
          start: oldFileSegments[i].start,
          end: oldFileSegments[i].start + subTaskOutput.split("\n").length,
          text: subTaskOutput,
        });
        helpers.set("newFileSegments", newFileSegments);
      }

      // get issues with the new chunk
      if (!(i in Object.keys(segmentIdxToIssues))) {
        if (!segmentIdxToIssuesSubTaskID[i]) {
          const subTaskID = await helpers.subTask({
            newTaskDefinition: TASK_PRESETS.generateJson,
            initialContextFields: {
              backgroundInformation: `The field 'newFileSegment' contains a proposed new version of 'oldFileSegment' that must adhere \
              to the stipulations made in 'conditionsToEnsureAreFulfilled'. The user wants to know whether the 'newFileSegment' meets \
              these stipulations. If it does not, the user wants to know what issues exist with the 'newFileSegment'.`,
              expectedOutput: `The output should contain a single string field, 'problems', which is either empty (""), or else \
              contains a somewhat detailed explanation of why the 'newFileSegment'. does not meet the 'conditionsToEnsureAreFulfilled'.`,
            },
            initialInputFields: {
              instructions:
                "Determine whether the 'newFileSegment' meets the 'conditionsToEnsureAreFulfilled'. If it does, output an empty \
                string field called 'problems', and do not add any extra explanation. If it does not, output a string field called \
                'problems' that describes the issues with the 'newFileSegment'.",
              conditionsToEnsureAreFulfilled:
                segmentIdxToEditingInstructions[i],
              oldFileSegment: oldFileSegments[i],
              newFileSegment: newFileSegments[i],
            },
          });
          segmentIdxToIssuesSubTaskID[i] = subTaskID;
          helpers.set(
            "segmentIdxToIssuesSubTaskID",
            segmentIdxToIssuesSubTaskID
          );
          return;
        }
        const subTaskID = segmentIdxToIssuesSubTaskID[i];
        const subTaskData = await getTaskBasicData({ taskID: subTaskID });
        if (!subTaskData?.success) return;
        const subTaskOutput = subTaskData.resultData?.outputFields?.problems;
        segmentIdxToIssues[i] = "";
        if (
          subTaskOutput &&
          typeof subTaskOutput == "string" &&
          subTaskOutput.length > 20
        ) {
          segmentIdxToIssues[i] = subTaskOutput;
        }
        helpers.set("segmentIdxToIssues", segmentIdxToIssues);
      }

      // fix issues with new chunk
      if (!segmentIdxToFixedSegment[i]) {
        if (!segmentIdxToIssues[i] || segmentIdxToIssues[i].length < 15) {
          // if new chunk does not have any issues...
          segmentIdxToFixedSegment[i] = newFileSegments[i];
          helpers.set("segmentIdxToFixedSegment", segmentIdxToFixedSegment);
        } else {
          // if new chunk has issues that need fixing...
          if (!segmentIdxToFixSegmentSubTaskID[i]) {
            const subTaskID = await helpers.subTask({
              newTaskDefinition: TASK_PRESETS.generateJson,
              initialContextFields: {
                backgroundInformation: `The field 'fileSegmentContent' contains a portion of a file. This part of the file has issues, \
                'issuesWithFileSegment', that need to be fixed.`,
                expectedOutput: `The output should contain a string field, 'fixedContent', with new content that addresses the \
                'issuesWithFileSegment'. There should be no explanation of the problems or their solutions, only the fixed content.`,
              },
              initialInputFields: {
                issuesWithFileSegment: segmentIdxToIssues[i],
                fileSegmentContent: newFileSegments[i].text,
              },
            });
            segmentIdxToFixSegmentSubTaskID[i] = subTaskID;
            helpers.set(
              "segmentIdxToFixSegmentSubTaskID",
              segmentIdxToFixSegmentSubTaskID
            );
            return;
          }
          const subTaskID = segmentIdxToFixSegmentSubTaskID[i];
          const subTaskData = await getTaskBasicData({ taskID: subTaskID });
          if (!subTaskData?.success) return;
          const subTaskOutput =
            subTaskData.resultData?.outputFields?.fixedContent;
          if (!subTaskOutput || typeof subTaskOutput != "string") {
            helpers.endStage(`Failed to generate a fixed version of a segment of the file, ${fileName}. No output field \
          "fixedContent" found in sub-task data: ${JSON.stringify(
            subTaskData || {},
            null,
            2
          )}`);
            return;
          }
          const fixedSegmentText = subTaskOutput;
          segmentIdxToFixedSegment[i] = {
            start: newFileSegments[i].start,
            end: newFileSegments[i].start + fixedSegmentText.split("\n").length,
            text: fixedSegmentText,
          };
          helpers.set("segmentIdxToFixedSegment", segmentIdxToFixedSegment);
        }
      }

      // get new blueprint
      if (!segmentIdxToBlueprint[i]) {
        if (!segmentIdxToBlueprintSubTaskID[i]) {
          const fixedFileSegment = segmentIdxToFixedSegment[i];
          const linesFieldName = `lines${fixedFileSegment.start}Through${fixedFileSegment.end}`;
          const blueprint = i == 0 ? "" : segmentIdxToBlueprint[i - 1];
          const subTaskID = await helpers.subTask({
            newTaskDefinition: TASK_PRESETS.generateJson,
            initialContextFields: {
              backgroundInformation: `The field 'oldBlueprint' contains a blueprint/summary/outline of the first part of a file, or \
              it is empty if the file was previously empty. The user now wants to expand the blueprint to include lines \
              ${fixedFileSegment.start} through ${fixedFileSegment.end}. This new blueprint should be output in a field called \
              'newBlueprint'.`,
              expectedOutput: `The output should contain a string field, 'newBlueprint', with the new blueprint for lines 1 through \
              ${fixedFileSegment.end}. The blueprint must contain no more than 250 words.`,
            },
            initialInputFields: {
              instructions:
                "To make the new blueprint, keep overall structure (start at line 1) by slightly “zooming out” on the file contents, \
                combining and summarizing lines that contribute less to the structure than others. Condense lower line numbers more \
                than the final lines; do this by replacing less important lines with ‘…’; maintain structure of the contents by making \
                sure to note the start & end of sections, functions, code blocks, concepts, etc",
              oldBlueprint: blueprint,
              [linesFieldName]: segmentIdxToFixedSegment[i].text,
            },
          });
          segmentIdxToEditSegmentSubTaskID[i] = subTaskID;
          helpers.set(
            "segmentIdxToEditSegmentSubTaskID",
            segmentIdxToEditSegmentSubTaskID
          );
          return;
        }
        const subTaskID = segmentIdxToBlueprintSubTaskID[i];
        const subTaskData = await getTaskBasicData({ taskID: subTaskID });
        if (!subTaskData?.success) return;
        const subTaskOutput =
          subTaskData.resultData?.outputFields?.newBlueprint;
        if (!subTaskOutput || typeof subTaskOutput != "string") {
          helpers.endStage(`Failed to generate a new chunk of the file, ${fileName}. No output field "newBlueprint" found in \
          sub-task data: ${JSON.stringify(subTaskData || {}, null, 2)}`);
          return;
        }
        segmentIdxToBlueprint[i] = subTaskOutput;
        helpers.set("segmentIdxToBlueprint", segmentIdxToBlueprint);
      }

      // shift line numbers of segments yet to be edited
      const newLinesAdded =
        segmentIdxToFixedSegment[i].text.split("\n").length -
        oldFileSegments[i].text.split("\n").length;
      for (let j = i + 1; j < oldFileSegments.length; j++) {
        const segmentToEdit = oldFileSegments[j];
        oldFileSegments[j] = {
          start: segmentToEdit.start + newLinesAdded,
          end: segmentToEdit.end + newLinesAdded,
          text: segmentToEdit.text,
        };
      }
    }
    helpers.endStage();
  },
  writeAndReindexFile: async (helpers: StageFunctionHelpers) => {
    const fileName = (await helpers.get("fileName")) as string;
    const segmentIdxToFixedSegment = (await helpers.get(
      "segmentIdxToFixedSegment"
    )) as FileSegment[];
    const newFileContents = Object.values(segmentIdxToFixedSegment)
      .map((fileSegment) => fileSegment.text)
      .join("\n");
    const reindexFileSubTaskID: number | null = await helpers.get(
      "reindexFileSubTaskID"
    );
    if (!reindexFileSubTaskID) {
      await helpers.writeToFile(fileName, newFileContents);
      const subTaskID = await helpers.subTask({
        newTaskDefinition: TASK_PRESETS.indexFile,
        initialInputFields: {
          fileName,
        },
      });
      helpers.set("reindexFileSubTaskID", subTaskID);
      return;
    }
    const subTaskData = await getTaskBasicData({
      taskID: reindexFileSubTaskID,
    });
    if (!subTaskData?.success) return;
    helpers.taskResult({
      failed: false,
      taskSummary: `Modified and re-indexed the file: ${fileName}`,
      outputFields: {},
    });
  },
};
