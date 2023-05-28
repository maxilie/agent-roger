import {
  type StageFunctionHelpers,
  type StageFunction,
} from "../stage-function.js";
import { TASK_PRESETS } from "../presets.js";
import { getTaskBasicData } from "../../db/db-actions.js";

const maxLlmWords = 600;

export const EXECUTE_SHELL_STAGE_FNS: { [key: string]: StageFunction } = {
  execCommand: async (helpers: StageFunctionHelpers) => {
    // get command from input fields
    let command = "";
    try {
      for (const inputFieldName of Object.keys(helpers.initialInputFields)) {
        const fieldNameLower = inputFieldName.toLowerCase();
        if (!fieldNameLower.includes("command")) continue;
        if (
          fieldNameLower.includes("execute") ||
          fieldNameLower.includes("run")
        ) {
          command = helpers.initialContextFields[inputFieldName] as string;
        }
      }
      if (!command) throw new Error("No command to execute.");
    } catch (error) {
      // pause task if no command to execute was found
      helpers.endStage(`Failed to get the command to be executed by executeShell task. Looked for the field \
      "commandToExecute" within the following input fields but did not find it: . ERROR: ${(
        error as Error
      ).toString()}`);
      return;
    }
    // execute command
    let shellOutput = "";
    let errorMessage = "";
    try {
      shellOutput = await helpers.execCmd(command);
    } catch (error) {
      errorMessage = (error as Error).toString();
    }
    helpers.set("command", command);
    helpers.set("shellOutput", shellOutput);
    helpers.set("errorMessage", errorMessage);
    helpers.endStage();
  },
  shortenCommand: async (helpers: StageFunctionHelpers) => {
    // don't summarize if command is short enough
    const command = (await helpers.get("command")) as string;
    if (command.split(" ").length < maxLlmWords / 8) {
      helpers.set("commandSummary", command);
      helpers.endStage();
      return;
    }
    // create command summary
    let subTaskID = await helpers.get("summarizeCommandSubTaskID");
    if (!subTaskID) {
      subTaskID = await helpers.subTask({
        newTaskDefinition: TASK_PRESETS.summarizeText,
        initialInputFields: {
          textToSummarize: command,
        },
      });
      helpers.set("summarizeCommandSubTaskID", subTaskID);
      return;
    }
    const subTaskData = await getTaskBasicData({ taskID: subTaskID as number });
    if (!subTaskData?.success) return;
    if (subTaskData?.resultData?.outputFields?.textSummary) {
      helpers.set(
        "commandSummary",
        subTaskData.resultData.outputFields.textSummary
      );
      helpers.endStage();
      return;
    }
    helpers.endStage("Failed to summarize command.");
  },
  shortenShellOutput: async (helpers: StageFunctionHelpers) => {
    // don't summarize if shell output is short enough
    const shellOutput = (await helpers.get("shellOutput")) as string;
    if (shellOutput.split(" ").length < maxLlmWords / 8) {
      helpers.set("shellOutputSummary", shellOutput);
      helpers.endStage();
      return;
    }
    // create shellOutput summary
    let subTaskID = await helpers.get("summarizeShellOutputSubTaskID");
    if (!subTaskID) {
      subTaskID = await helpers.subTask({
        newTaskDefinition: TASK_PRESETS.summarizeText,
        initialInputFields: {
          textToSummarize: shellOutput,
        },
      });
      helpers.set("summarizeShellOutputSubTaskID", subTaskID);
      return;
    }
    const subTaskData = await getTaskBasicData({ taskID: subTaskID as number });
    if (!subTaskData?.success) return;
    if (subTaskData?.resultData?.outputFields?.textSummary) {
      helpers.set(
        "shellOutputSummary",
        subTaskData.resultData.outputFields.textSummary
      );
      helpers.endStage();
      return;
    }
    helpers.endStage("Failed to summarize shellOutput.");
  },
  shortenErrorMessage: async (helpers: StageFunctionHelpers) => {
    // don't summarize if shell output is short enough
    const errorMessage = (await helpers.get("errorMessage")) as string;
    if (errorMessage.split(" ").length < maxLlmWords / 8) {
      helpers.set("errorMessageSummary", errorMessage);
      helpers.endStage();
      return;
    }
    // create error message summary
    let subTaskID = await helpers.get("summarizeErrorMessageSubTaskID");
    if (!subTaskID) {
      subTaskID = await helpers.subTask({
        newTaskDefinition: TASK_PRESETS.summarizeText,
        initialInputFields: {
          textToSummarize: errorMessage,
        },
      });
      helpers.set("summarizeErrorMessageSubTaskID", subTaskID);
      return;
    }
    const subTaskData = await getTaskBasicData({ taskID: subTaskID as number });
    if (!subTaskData?.success) return;
    if (subTaskData?.resultData?.outputFields?.textSummary) {
      helpers.set(
        "errorMessageSummary",
        subTaskData.resultData.outputFields.textSummary
      );
      helpers.endStage();
      return;
    }
    helpers.endStage("Failed to summarize errorMessage.");
  },
  summarizeShellEvent: async (helpers: StageFunctionHelpers) => {
    let subTaskID = await helpers.get("summarizeShellEventSubTaskID");
    if (!subTaskID) {
      subTaskID = await helpers.subTask({
        newTaskDefinition: TASK_PRESETS.generateJson,
        initialInputFields: {
          instructions:
            "Use the fields 'command', 'error', and 'output' to generate a 'shellEventSummary' field. Explain in plain \
          English what happened during the shell event. 'shellEventSummary' should be under 70 words, containing no fluff and only \
          a minimal amount of technical details.",
          example: {
            shellEventSummary:
              "Tried to rename the file 'path/to/file.txt' to '/path/to/newfolder/file.txt', but failed because the directory \
              'newfolder' does not exist.",
          },
        },
      });
      helpers.set("summarizeShellEventSubTaskID", subTaskID);
      return;
    }
    const subTaskData = await getTaskBasicData({ taskID: subTaskID as number });
    if (!subTaskData?.success) return;
    if (!subTaskData?.resultData?.outputFields?.shellEventSummary) {
      helpers.endStage("Failed to generate summary of shell response.");
      return;
    }
    // save internal data for admin to view
    const shellEventSummary = subTaskData.resultData.outputFields
      .shellEventSummary as string;
    const commandSummary = (await helpers.get("commandSummary")) as string;
    const shellOutputSummary = (await helpers.get(
      "shellOutputSummary"
    )) as string;
    const errorMessageSummary = (await helpers.get(
      "errorMessageSummary"
    )) as string;
    helpers.set("commandSummary", commandSummary);
    helpers.set("shellOutputSummary", shellOutputSummary);
    helpers.set("errorMessageSummary", errorMessageSummary);
    helpers.set("shellEventSummary", shellEventSummary);
    // save output
    // this output should be short enough to be read by the llm
    helpers.taskResult({
      failed: errorMessageSummary.length > 5,
      taskSummary: "",
      outputFields: {
        commandDescription: commandSummary,
        responseDescription: shellEventSummary,
      },
    });
  },
};
