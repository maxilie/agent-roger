import { SUGGESTED_APPROACHES } from "../../constants/prompts.js";
import { getTaskBasicData } from "../../db/db-actions.js";
import { assembleTextLlmInput } from "../../model-input/index.js";
import {
  type TasksStepsData,
  taskStepsDataSchema,
} from "../../zod-schema/stage-base/index.js";
import { type JsonObj } from "../../zod-schema/stage-base/json.js";
import {
  type StageFunctionHelpers,
  type StageFunction,
} from "../stage-function.js";
import { TASK_PRESETS } from "../presets.js";

export const ABSTRACT_TASK_STAGE_FNS: { [key: string]: StageFunction } = {
  // eslint-disable-next-line @typescript-eslint/require-await
  observeTaskHistory: async (helpers: StageFunctionHelpers) => {
    // TODO
    //
    // Search memory bank for summaries of previous tasks similar to this one.
    //
    // Add the summaries of previous tasks to the context.
    helpers.endStage();
  },

  /*
    Generates initialSteps: string[]
  */
  generateInitialSteps: async (helpers: StageFunctionHelpers) => {
    const taskContext = {
      ...(helpers.initialContextSummary
        ? { contextOverview: helpers.initialContextSummary }
        : {}),
      ...(helpers.initialContextFields || {}),
    };
    const prompt = {
      instructions: [
        "Break down the 'task' into at most 4 specific, descriptive steps. Output each step as an element of an array called 'steps'. \
Ensure that the steps closely follow the guidelines outlined in 'suggestedApproaches'.",
      ],
      task: {
        ...helpers.initialInputFields,
        ...(taskContext ? taskContext : {}),
      },
    };
    const expectedOutputFields = {
      steps:
        "An array of strings, each explaining in plain english a step to take toward completing the task. If a step involves a file, \
        make sure to include the file name in the step description.",
    };
    const llmOutput = await helpers.textLLM(
      assembleTextLlmInput({
        prompt,
        expectedOutputFields,
        suggestedApproaches: SUGGESTED_APPROACHES.generateInitialSteps,
      })
    );
    let initialSteps: string[] = [];
    try {
      if (llmOutput.steps) {
        initialSteps = llmOutput.steps as string[];
      }
    } catch (_) {}
    if (initialSteps.length == 0) {
      helpers.endStage(
        `Failed to get 'steps' string array field from llm output: ${JSON.stringify(
          llmOutput,
          null,
          2
        )}`
      );
      return;
    }
    helpers.set("initialSteps", initialSteps);
    helpers.endStage();
  },
  /*
    Generates stepInstructions: string[]
    Cleans up initialSteps.
  */
  expandStepInstructions: async (helpers: StageFunctionHelpers) => {
    const steps = (await helpers.get("steps")) as string[];
    const contextFields = {
      howToUnderstandBroaderTask:
        "The 'tasksBefore', 'taskToModify', and 'tasksAfter' input fields should encompass all that's needed to complete the \
'broaderTask' context field. Do not confuse the broader task with the individual task input fields. Some of the fields in the broader \
task may be irrelevant to the 'taskToModify'.",
      broaderTask: {
        ...(helpers.initialInputFields || {}),
        ...(helpers.initialContextFields || {}),
        ...(helpers.initialContextSummary
          ? { contextOverview: helpers.initialContextSummary }
          : {}),
      },
    };
    const expectedOutputFields = {
      modifiedTask:
        "A string, no more than 200 words, describing how a computer would complete the 'taskToModify' in a way that complies with \
the suggested approaches. OR, 'do nothing' or an empty string if the 'taskToModify' should be removed.",
    };
    const promises: Promise<JsonObj>[] = [];
    for (let i = 0; i < steps.length; i++) {
      let stepsBefore: string[] = [];
      if (i > 0) {
        stepsBefore = steps.slice(0, i);
      }
      let stepsAfter: string[] = [];
      if (i < steps.length - 1) {
        stepsAfter = steps.slice(i + 1);
      }
      const promise = helpers.textLLM(
        assembleTextLlmInput({
          prompt: {
            backgroundInfo:
              "The 'previousTasks', 'taskToModify', and 'nextTasks' fields sequentially define a task for a computer to run. Your job \
is to modify the 'taskToModify' field to comply with the suggested approaches, or to remove it if it's unnecessary.",
            instructions: [
              "Write a 'modifiedTask' field containing improved instructions for completing the 'taskToModify' in a way that aligns with \
the suggested approaches. Keep in mind contextual information that might be relevant to the sub-task.",
              "Remove the task, by setting the 'modifiedTask' field to 'do nothing' or an empty string, if: the task is already \
performed by one of the 'tasksBefore'; one of the 'tasksAfter' performs the same function as the 'modifiedTask'; or the 'modifiedTask' \
does not reasonably align with the 'suggestedApproaches'.",
            ],
            tasksBefore: stepsBefore,
            taskToModify: steps[i],
            tasksAfter: stepsAfter,
            contextFields,
          },
          expectedOutputFields,
          suggestedApproaches: SUGGESTED_APPROACHES.expandStepInstructions,
        })
      );
      promises.push(promise);
    }
    const stepInstructions: string[] = [];
    const llmOutputs = await Promise.allSettled(promises);
    let initialStepsIdx = 0;
    for (const llmOutput of llmOutputs) {
      if (llmOutput.status == "rejected") {
        helpers.endStage(
          `Failed to generate step instructions for step index ${initialStepsIdx}: "${
            steps[initialStepsIdx]
          }". textLlm promise failed: ${String(llmOutput.reason)}`
        );
        return;
      }
      const stepInstruction = llmOutput.value.taskToModify;
      if (
        stepInstruction === null ||
        stepInstruction === undefined ||
        typeof stepInstruction != "string"
      ) {
        helpers.endStage(
          `Generated invalid step instructions for step index ${initialStepsIdx}: "${
            steps[initialStepsIdx]
          }". textLlm returned data: ${JSON.stringify(
            llmOutput.value,
            null,
            2
          )}`
        );
        return;
      } else if (
        stepInstruction.length > 18 &&
        !stepInstruction.slice(0, 18).toLowerCase().includes("nothing")
      ) {
        stepInstructions.push(stepInstruction);
      }
      initialStepsIdx++;
    }
    if (!stepInstructions.length) {
      helpers.endStage(
        `Did not generate any step instructions for steps: [${steps.join(
          ", "
        )}]`
      );
      return;
    }
    helpers.set("stepInstructions", stepInstructions);
    helpers.endStage();
  },
  /*
    Generates stepDependencies: {stepIdx: otherStepIdx[]}
    Determines which steps require which other steps to be completed first.
  */
  generateStepDependencies: async (helpers: StageFunctionHelpers) => {
    const prompt = {
      instructions: [
        "You are being given an array of 'stepInstructions' for which you will create a field called 'stepDependencies'. If a step \
needs another step(s) to finish in order to proceed, then include it in the 'stepDependencies' field. For example, if the fourth step \
depends on the first and third step, then step dependencies should look like: {3: [0, 2]}. Note that the steps are zero-indexed.",
        "As another example, if step 0 first indexes a file, and then step 1 uses the information from that file to create another file, \
and then finally step 2 validates the contents of the newly-created file... then step 2 only needs to depend on step 1, since step 1 \
already depends on step 0. 'stepDependencies' would look like: {1: [0], 2: [1]}",
      ],
      stepInstructions: (await helpers.get("stepInstructions")) as string[],
    };
    const expectedOutputFields = {
      stepDependencies:
        "{[key: number]: number}. An object mapping each step index (starting at zero) to the indices of the other steps that it \
depends on. Not all steps necessarily depend on other steps.",
    };
    const llmOutput = await helpers.textLLM(
      assembleTextLlmInput({
        prompt,
        expectedOutputFields,
      })
    );
    let stepDependencies: { [key: number]: number } = {};
    try {
      if ("stepDependencies" in Object.keys(llmOutput)) {
        stepDependencies = llmOutput.stepDependencies as {
          [key: number]: number;
        };
      }
    } catch (_) {
      helpers.endStage(
        `Failed to get 'stepDependencies' field from llm output: ${JSON.stringify(
          llmOutput,
          null,
          2
        )}`
      );
      return;
    }
    helpers.set("stepDependencies", stepDependencies);
    helpers.endStage();
  },
  /*
    Generates successCriteria: string[]
    successCriteria do not necessarily correspond 1-1 with steps, since criteria are for the task as a whole.
  */
  generateSuccessCriteria: async (helpers: StageFunctionHelpers) => {
    const taskContext = {
      ...(helpers.initialContextSummary
        ? { contextOverview: helpers.initialContextSummary }
        : {}),
      ...(helpers.initialContextFields || {}),
    };
    const prompt = {
      instructions: [
        "Write an array of 'successCriteria', conditions that must be met after performing the 'stepInstructions' in order for the \
        'task' to be considered completed successfully.",
      ],
      stepInstructions: (await helpers.get("stepInstructions")) as string[],
      task: {
        ...helpers.initialInputFields,
        ...(taskContext ? taskContext : {}),
      },
    };
    const expectedOutputFields = {
      successCriteria:
        "An array of strings, each concisely describing a condition that must be met in order for the task to be \
      considered completed successfully.",
    };
    const llmOutput = await helpers.textLLM(
      assembleTextLlmInput({
        prompt,
        expectedOutputFields,
      })
    );
    let successCriteria: string[] = [];
    try {
      if ("successCriteria" in Object.keys(llmOutput)) {
        successCriteria = llmOutput.successCriteria as string[];
      }
    } catch (_) {
      helpers.endStage(
        `Failed to get 'successCriteria' field from llm output: ${JSON.stringify(
          llmOutput,
          null,
          2
        )}`
      );
      return;
    }
    helpers.set("successCriteria", successCriteria);
    helpers.endStage();
  },
  /*
    Generates a task definition for each step, and starts a new sub-task for each step once its dependency steps have completed.
  */
  generateSubTasks: async (helpers: StageFunctionHelpers) => {
    // get step data
    const stepsDataRaw = await helpers.get("stepsData");
    let stepsData: TasksStepsData;
    if (!stepsDataRaw) {
      const stepInstructions = (await helpers.get(
        "stepInstructions"
      )) as string[];
      const stepIdxToDescription: { [key: string]: string } = {};
      const stepDependencies = (await helpers.get("stepDependencies")) as {
        [key: number]: [number];
      };
      const stepIdxToDependencyStepIndices: { [key: string]: [number] } = {};
      for (let i = 0; i < stepInstructions.length; i++) {
        stepIdxToDescription[String(i)] = stepInstructions[i];
        if (i in Object.keys(stepDependencies)) {
          stepIdxToDependencyStepIndices[String(i)] = stepDependencies[i];
        }
      }
      stepsData = {
        stepIdxToDescription,
        stepIdxToDependencyStepIndices,
        stepIdxToTaskDefinition: {},
        stepIdxToSubTaskID: {},
        stepIdxToSubTaskOutput: {},
        stepIdxToOutputSummary: {},
      };
      helpers.set("stepsData", stepsData);
    } else {
      stepsData = taskStepsDataSchema.parse(stepsDataRaw);
    }
    // generate sub-tasks
    let subTaskFailure = false;
    for (
      let i = 0;
      i < Object.keys(stepsData.stepIdxToDescription).length;
      i++
    ) {
      // ensure clean task restarts by deleting sub-task data that shouldn't be present
      if (!stepsData.stepIdxToSubTaskID[String(i)]) {
        delete stepsData.stepIdxToSubTaskID[String(i)];
        delete stepsData.stepIdxToSubTaskOutput[String(i)];
        delete stepsData.stepIdxToOutputSummary[String(i)];
        helpers.set("stepsData", stepsData);
      }
      // check that dependency steps are complete
      let dependencyTasksSucceeded = true;
      const dependencyStepIndices =
        stepsData.stepIdxToDependencyStepIndices[String(i)] || [];
      for (const dependencyStepIdx of dependencyStepIndices) {
        if (!stepsData.stepIdxToSubTaskID[String(dependencyStepIdx)]) {
          dependencyTasksSucceeded = false;
          break;
        }
        const dependencyTaskData = await getTaskBasicData({
          taskID: stepsData.stepIdxToSubTaskID[String(dependencyStepIdx)],
        });
        if (!dependencyTaskData?.success) {
          dependencyTasksSucceeded = false;
          break;
        }
      }
      if (!dependencyTasksSucceeded) continue;
      // generate sub-task TaskDefinition
      if (!stepsData.stepIdxToTaskDefinition[String(i)]) {
        let dependencySummary = "";
        for (const dependencyStepIdx of dependencyStepIndices) {
          dependencySummary +=
            stepsData.stepIdxToOutputSummary[String(dependencyStepIdx)];
        }
        const llmOutput = await helpers.textLLM(
          assembleTextLlmInput({
            prompt: {
              instructions:
                "Use the 'taskToCreate' field to create a 'newTask'. Follow exactly the required format for 'newTask': \
{taskPreset: string, initialInputFields: {}, initialContextFields: optional {}, initialContextSummary: optional string}. \
Start by deciding on which taskPreset to use, and then generate the appropriate initialInputFields for the new task.",
              taskToCreate: stepsData.stepIdxToDescription[String(i)],
              ...(dependencySummary
                ? { summaryOfTasksPerfomedPreviously: dependencySummary }
                : {}),
            },
            expectedOutputFields: {
              newTask:
                "A task creation json object like: {taskPreset: string, initialInputFields: {}, initialContextFields: optional {}, \
              initialContextSummary: optional string}",
            },
            suggestedApproaches: SUGGESTED_APPROACHES.generateSubTasks,
          })
        );
        if (
          !llmOutput.newTask ||
          !(llmOutput.newTask as JsonObj).taskPreset ||
          !(llmOutput.newTask as JsonObj).initialInputFields
        ) {
          helpers.endStage(
            `Failed to generate task definition for step index ${i}: "${
              stepsData.stepIdxToDescription[String(i)]
            }". textLlm returned data: ${JSON.stringify(llmOutput, null, 2)}`
          );
          return;
        }
        const newTask = llmOutput.newTask as JsonObj;
        if (
          typeof newTask.taskPreset != "string" ||
          !(newTask.taskPreset in TASK_PRESETS)
        ) {
          helpers.endStage(
            `Failed to generate valid task definition for step index ${i}: "${
              stepsData.stepIdxToDescription[String(i)]
            }". textLlm generated invalid task preset: "${
              newTask.taskPreset as string
            }"`
          );
          return;
        }
        const taskDefinition = {
          newTaskDefinition: TASK_PRESETS[newTask.taskPreset],
          initialInputFields: newTask.initialInputFields as JsonObj,
          ...(newTask.initialContextFields
            ? { initialContextFields: newTask.initialContextFields as JsonObj }
            : {}),
          ...(newTask.initialContextSummary
            ? { initialContextSummary: newTask.initialContextSummary as string }
            : {}),
          memoryBankID: helpers.memoryBankID,
        };
        stepsData.stepIdxToTaskDefinition[String(i)] = taskDefinition;
        helpers.set("stepsData", stepsData);
      }
      // start sub-task
      if (!stepsData.stepIdxToSubTaskID[String(i)]) {
        const subTaskID = await helpers.subTask(
          stepsData.stepIdxToTaskDefinition[String(i)]
        );
        stepsData.stepIdxToSubTaskID[String(i)] = subTaskID;
        helpers.set("stepsData", stepsData);
        continue;
      }
      // summarize sub-task output
      const subTaskOutput = await getTaskBasicData({
        taskID: stepsData.stepIdxToSubTaskID[String(i)],
      });
      if (!subTaskOutput || subTaskOutput.success === null) return;
      if (!stepsData.stepIdxToOutputSummary[String(i)]) {
        const subTaskResultData = subTaskOutput.resultData;
        const summaryData = await helpers.textLLM(
          assembleTextLlmInput({
            prompt: {
              backgroundInformation:
                "A computer performed a task and put some information about the task's execution into the field 'taskResultData'. \
                The computer now wants to present this information to a human in a concise but detailed string, called 'resultSummary'.",
              instructions:
                "Summarize the output data from 'taskResultData' and output the summary to 'resultSummary'. Write the \
              summary to be as thorough as possible, including specific variables, file names, etc., but no more than 200 words.",
              taskResultData: subTaskResultData,
            },
            expectedOutputFields: {
              resultSummary: "A summary of the task's result data.",
            },
          })
        );
        if (
          !summaryData?.resultSummary ||
          typeof summaryData.resultSummary != "string"
        ) {
          helpers.endStage(
            `Failed to generate summary for sub-task result data of step idx ${i}. textLlm() returned invalid output: \
            ${JSON.stringify(summaryData, null, 2)}`
          );
          return;
        }
        stepsData.stepIdxToOutputSummary[String(i)] = summaryData.resultSummary;
        helpers.set("stepsData", stepsData);
      }
      if (!subTaskOutput.success) {
        subTaskFailure = true;
        break;
      }
    }
    // end the stage when all sub-tasks are complete or one has failed
    if (
      subTaskFailure ||
      Object.keys(stepsData.stepIdxToOutputSummary).length ==
        Object.keys(stepsData.stepIdxToDescription).length
    ) {
      helpers.endStage();
    }
  },
  summarizeSubTaskOutputs: async (helpers: StageFunctionHelpers) => {
    const stepsData = taskStepsDataSchema.parse(await helpers.get("stepsData"));
    const stepsTaken: { [key: string]: string } = {};
    for (const stepIdxStr of Object.keys(stepsData.stepIdxToOutputSummary)) {
      const stepName = `step${Number(stepIdxStr) + 1}`;
      stepsTaken[stepName] = stepsData.stepIdxToOutputSummary[stepIdxStr];
    }
    const llmOutput = await helpers.textLLM(
      assembleTextLlmInput({
        prompt: {
          instructions:
            "Provide a detailed overview of the steps taken and the results of these actions. Do it in under 400 words using json \
            format, and output the json to a field called 'report'.",
          stepsTaken: stepsData.stepIdxToOutputSummary,
        },
        expectedOutputFields: {
          report: "A json object providing an overview of the steps taken.",
        },
      })
    );
    if (!llmOutput.report) {
      helpers.endStage(
        `Failed to generate sub-task outputs summary. textLlm() returned invalid output: ${JSON.stringify(
          llmOutput,
          null,
          2
        )}`
      );
      return;
    }
    helpers.set("subTaskOutputsReport", llmOutput.report);
    helpers.endStage();
  },
  validateOutput: async (helpers: StageFunctionHelpers) => {
    const outputsReport = (await helpers.get(
      "subTaskOutputsReport"
    )) as JsonObj;
    const successCriteria = (await helpers.get("successCriteria")) as string[];
    const llmOutput = await helpers.textLLM(
      assembleTextLlmInput({
        prompt: {
          backgroundInformation:
            "A computer has just completed a task and summarized its actions into json data called 'taskReport'. \
        The task can only be considered complete if the 'taskReport' excellently meets each of the 'successCriteria'. The computer \
        wants to know if the task was completed successfully, and if not, what specifically went wrong.",
          instructions:
            "Determine whether the 'taskReport' indicates that the task meets each of the 'successCriteria'. If yes, \
          output 'success' as true. If no, output 'success' as false and 'failureReason' as a string describing the failure.",
          taskReport: outputsReport,
          successCriteria,
        },
        expectedOutputFields: {
          success:
            "A boolean indicating whether the task excellently met the success criteria.",
          failureReason: "A string describing in detail why the task failed.",
        },
      })
    );
    if (!llmOutput || !("success" in Object.keys(llmOutput))) {
      helpers.endStage(
        `Failed to validate sub-task outputs. textLlm() returned invalid output: ${JSON.stringify(
          llmOutput,
          null,
          2
        )}`
      );
      return;
    }
    let success = false;
    if (
      llmOutput.success === true ||
      (llmOutput.success as string).trim().toLowerCase() == "true"
    ) {
      success = true;
    }
    let failureReason = "";
    if (llmOutput.failureReason) {
      failureReason = llmOutput.failureReason as string;
    }
    helpers.set("subTasksSucceeded", success);
    helpers.set("subTasksFailureReason", failureReason);
    helpers.endStage();
  },
  decideCorrectiveAction: async (helpers: StageFunctionHelpers) => {
    const subTasksSucceeded = (await helpers.get(
      "subTasksSucceeded"
    )) as boolean;
    const taskOutputFields = (await helpers.get(
      "subTaskOutputsReport"
    )) as JsonObj;
    // option 1: end the task successfully
    if (subTasksSucceeded) {
      helpers.taskResult({
        failed: false,
        taskSummary: "",
        outputFields: taskOutputFields,
      });
      return;
    }
    const subTasksFailureReason = (await helpers.get(
      "subTasksFailureReason"
    )) as string;
    const llmOutput = await helpers.textLLM(
      assembleTextLlmInput({
        prompt: {
          backgroundInformation:
            "A computer has just completed a task using the information and instructions in 'oldInputFields', 'oldContextFields', and \
            'oldContextSummary', but the task failed because of the reason described in 'failureReason'. The computer wants to know \
            whether the task might be completed successfully if it is provided additional information or instructions.",
          instructions:
            "Determine whether there is a reasonable chance that adding instructions or context could address the 'taskFailureReason' \
            and allow the task to be completed successfully. If yes, output 'newInputFields', 'newContextFields', and \
            'newContextSummary' as modified versions of the 'oldInputFields', 'oldContextFields', and 'oldContextSummary' that contain \
            added context or instructions for avoiding the 'taskFailureReason'. If no, output 'newInputFields' as an empty string.",
          taskFailureReason: subTasksFailureReason,
          oldInputFields: helpers.initialInputFields,
          oldContextFields: helpers.initialContextFields,
          oldContextSummary: helpers.initialContextSummary,
        },
        expectedOutputFields: {
          newInputFields:
            "A json object similar to oldInputFields, if adding context or instructions could help the task succeed. \
          Otherwise, an empty string.",
          newContextFields:
            "(optional) A json object similar to oldContextFields.",
          newContextSummary:
            "(optional) A string similar to oldContextSummary.",
        },
      })
    );
    helpers.set("correctiveActionLlmOutput", llmOutput);
    if (!llmOutput.newInputFields) {
      // option 2: end the task as a failure
      helpers.taskResult({
        failed: true,
        taskSummary: subTasksFailureReason,
        outputFields: taskOutputFields,
      });
      return;
    }
    // option 3: restart the task with new instructions
    const newInputFields = llmOutput.newInputFields as JsonObj;
    const newContextFields = (llmOutput.newContextFields ||
      helpers.initialContextFields) as JsonObj;
    const newContextSummary = (llmOutput.newContextSummary ||
      helpers.initialContextSummary) as string;
    await helpers.restartTaskWhileRunning({
      initialInputFields: newInputFields,
      initialContextFields: newContextFields,
      initialContextSummary: newContextSummary,
    });
    return;
  },
};
