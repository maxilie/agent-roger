export const SYSTEM_MESSAGES = {
  default:
    "You are a highly logical, careful, and thorough JSON input/output machine. You can only output properly formatted JSON, and \
    nothing else. Your output is a JSON object, meaning: it is wrapped with curly braces; field names are strings wrapped with \
    double quotes; field values are either string, number, boolean, array, null, or JSON object; there is no added explanation text, \
    comments, or readability formatting (like using ``` ... ``` to 'code fence' blocks of code, or **...** to bold text, or line \
    breaks and indentation between JSON fields).\
    \n Your output always contains at least the field names specified by the input field, 'expectedOutputFields' -- plus, it may \
    also contain field names that are not explicitly specified by 'expectedOutputFields', but which contain content that is either \
    requested by `expectedOutputFields` or is otherwise hyper-relevant to both the input and the expected output fields.\
    \n When you see an input field beginning with an underscore, you will use the field's name and value (which is truncated, as \
    indicated by it ending in '...') to determine whether it makes logical sense to include this field in your output. You will never \
    remove the underscore from a field name that begins with it. Each of these underscore fields can either be ignored or used as an \
    output field name (with field value: \"true\").\
    \n Your output is fully string-escaped and otherwise properly formatted so as to be parseable by the JSON.parse() function. If one \
    were to call JSON.parse(yourOutputString), it should return a valid object, beginning and ending with curly braces.\
    \n If the input field, 'suggestedApproaches' is not empty, you will use the suggested approaches as a starting point for \
    generating your output, by reading each scenario and applying the relevant approach(es) to generating your output given the input \
    fields and contextual fields.\
    \n Before you, the JSON input/output machine return the output you have generated, you always make a determination whether your \
    output is thorough, precise, and accurate enough to earn a score of 97%, an A+, in each category -- given the constraints and \
    contextual information provided to you in the input JSON. If you determine that your output is not excellent in every category, \
    then you will add a field to your output, called 'pauseReason', whose value is a string that logically explains all the \
    reason(s) why you made the determination as well as at least 1 detailed solution for the user to employ. For example, if the \
    user has requested you to design a website, but you notice in the context fields that the user's previous requests for websites \
    included instructions for the website's theme and layout; then you would explain in the 'pauseReason' field that your output \
    is not precise enough because you do not have enough constraints on the website. You would also list out the types of constraints \
    you would need (header, theme, technologies, etc.) along with a few possible options for each (sticky/pop-in-collabsible-sidebar, \
    light/dark/light-blue-modern, react/serverless/postgres, etc.).",
};

type Json = string | boolean | number | null | { [key: string]: Json } | Json[];
type JsonObj = { [key: string]: Json };
export type SuggestedApproaches = {
  scenario: string;
  approach: string;
  exampleOfSomeOutputFields: JsonObj;
};

export const SUGGESTED_APPROACHES: { [key: string]: SuggestedApproaches[] } = {
  generateStepsAndSuccessCriteria:
    // common patterns for breaking down a complex instruction into several less-complex instructions.
    [
      // make changes to a project
      {
        scenario:
          "User has specified the directory of a project, file, or files that he wants you to make changes to, but he has not \
          specified particular lines to change in a particular file; or, the user has specified particular lines, but has also \
          requested other changes that require you to further edit more lines or more files.",
        approach:
          "Step 0) If the current memoryBank is null, empty, or unspecified, then the first step is to 'create a new memory bank \
          and change the current memory bank to the new one'. If the user has indicated that he doesn't want you to re-index, or that \
          he wants you to use the global memory bank, then the first step is to 'switch to the global memory bank'. Step 1) Index the \
          directory, file, or files given by the user. Step 2) Determine what general changes to make. If there are more than a handful \
          of changes, then break them down into smaller groups of changes. Step 3) For each broad change or group of changes, create a \
          sub-task to make the changes. Step 4) Verify that the changes were made correctly.",
        exampleOfSomeOutputFields: {},
      },
      // index multiple files or a directory
      {
        scenario:
          "User has specified the directory of a project, file, or files that he wants you to index or add to the memory bank.",
        approach:
          "Step 0) If trying to index a folder, run a shell command to get the filenames and folders in the folder. Step 1) For each \
          file or folder returned by the shell command, create a sub-task to index it.",
        exampleOfSomeOutputFields: {},
      },
      // TODO make changes to a project: 1) set memory bank. 2) index files or folder
      // TODO index file(s): create a sub-task TaskDefinition (preset: )
      // TOOD index folder:
    ],
  expandStepInstructions: [],
  generateSubTasks:
    // scenarios describing when and how to use each task preset
    [
      // abstract task
      {
        scenario:
          "The user is trying to create either a new abstract, high-level task, complex task, or multi-step task. If the step and input \
        data cannot be matched to any of the other approaches, then it should probably be an abstract task.",
        approach:
          "Set the output field, 'newTask', to a new task creation object. Make sure to include relevant initialInputFields \
        & initialContextFields, and generate an initialContextSummary string with key context information that the task \
        might need to know. Choose the 'abstract' taskPreset.",
        exampleOfSomeOutputFields: {
          newTask: {
            taskPreset: "abstract",
            initialInputFields: {
              instructions:
                "Research and learn about X topic. Decide what information to present to the user. Create design notes to describe \
               to present a website presenting the selected information about X topic in a visually appealling way. Ensure that \
               the website works and is visually appealing.",
            },
            initialContextFields: {
              questionsToAnswerAboutXTopic: "...",
              previouslyUsedWebsiteDesigns: "dark theme, NextJS, ...",
            },
            initialContextSummary:
              "The user wants to learn about X topic for Y reasons, with a particular focus on the most recent \
          information about Z.",
          },
        },
      },
      // index file task
      {
        scenario: "The user is trying to index a single file.",
        approach:
          "Use the 'indexFile' task preset, which requires an input field, 'fileName', to point to the file's absolute path and \
        include the file extension.",
        exampleOfSomeOutputFields: {
          newTask: {
            taskPreset: "indexFile",
            initialInputFields: {
              fileName: "/user/someUser/someProjectDir/src/server.ts",
            },
            initialContextFields: {},
            initialContextSummary: "",
          },
        },
      },
      // modify file task
      {
        scenario:
          "The user is trying to modify a single file, create a single file, or delete a single file.",
        approach:
          "Use the 'modifyFile' task preset, which requires an input field, 'fileName', to point to the file's absolute path and \
        include the file extension. If the user is deleting the file, set the input field, 'deleteFile', to 'true'. Otherwise, \
        set the input field, 'changesToMake', to an array of specific changes to make (or specific content to create).",
        exampleOfSomeOutputFields: {
          newTask: {
            taskPreset: "modifyFile",
            initialInputFields: {
              fileName: "/user/someUser/someProjectDir/src/server.ts",
              changesToMake: [
                "make the main function async",
                "add explicit return types to all functions",
                "simplify the for loop on line 49",
              ],
            },
            initialContextFields: {},
            initialContextSummary: "",
          },
        },
      },
      // summarize text task
      {
        scenario:
          "The user is trying to shorten a long string or summarize some large data to create a string.",
        approach:
          "Use the 'summarizeText' task preset, which requires a single input field, 'textToSummarize', containing the string \
          to summarize.",
        exampleOfSomeOutputFields: {
          newTask: {
            taskPreset: "summarizeText",
            initialInputFields: {
              textToSummarize: "This is a long string of text to summarize.",
            },
          },
        },
      },
      // reduce json task
      {
        scenario:
          "The user is trying to shorten a JSON object into a smaller JSON object.",
        approach:
          "Use the 'reduceJson' task preset, which requires a single input field, 'jsonToReduce', containing the large \
          JSON object.",
        exampleOfSomeOutputFields: {
          newTask: {
            taskPreset: "reduceJson",
            initialInputFields: {
              jsonToReduce: {},
            },
          },
        },
      },
      // execute shell task
      {
        scenario: "The user is trying to execute a shell command.",
        approach:
          "Use the 'executeShell' task preset, which requires a single input field, 'commandToExecute'.",
        exampleOfSomeOutputFields: {
          newTask: {
            taskPreset: "executeShell",
            initialInputFields: {
              commandToExecute:
                "cd /user/someUser/someProjectDir && ls -a | grep .ts",
            },
          },
        },
      },
      // generate content task
      {
        scenario:
          "User wants to generate text, answer a question, write code, edit JSON, make a determination based on some input, etc.",
        approach:
          "Use the 'generateJson' task preset to generate JSON field(s). Use logical and descriptive names for the task's \
        'initialInputFields', and make sure to include: instructions on what content to generate; information needed to generate the \
        content; optional instructions on how many fields to generate and what to name them; optional context info that might be \
        useful for generating the content.",
        exampleOfSomeOutputFields: {
          newTask: {
            taskPreset: "generateJson",
            initialInputFields: {
              instructions:
                "Modify the function to use recursion instead of a stack.",
              codeToModify: "function someFunction() { ... }",
              outputFormatDetails:
                "Generate a single output field called 'modifiedCode'.",
            },
            initialContextFields: {
              functionsBroaderPurpose:
                "Broader purpose of the function is to traverse a tree of social media user data.",
            },
          },
        },
      },
      // search memory bank task
      {
        scenario:
          "The user wants to look up information from their history or indexed files (search the memory bank). For example, if the \
        user wants to know which files contain code that modifies a particular database table.",
        approach:
          "Use the 'searchMemoryBank' task preset. The field names don't matter but the field value(s) will be used to search the \
          memory bank. Do not include any initialInputFields that whose value isn't a query.",
        exampleOfSomeOutputFields: {
          newTask: {
            taskPreset: "searchMemoryBank",
            initialInputFields: {
              query1: "Where is the 'purchases' table modified?",
              query2: "helper function for generating random numbers/strings",
            },
          },
        },
      },
      // switch memory bank task
      {
        scenario:
          "The user wants to create a new memory bank, stop using the current memory bank, or switch to a different memory bank.",
        approach:
          "Use the 'switchMemoryBank' task preset, which requires a single field, 'newMemoryBankID', containing the ID of the \
          existing memory bank to switch to. If the user wants to create a new memory bank, leave the field as a blank string. \
          If the user wants to switch to the global memory bank, then set 'newMemoryBankID' to 'global'.",
        exampleOfSomeOutputFields: {
          newTask: {
            taskPreset: "switchMemoryBank",
            initialInputFields: {
              newMemoryBankID: "memory-bank-id-23452",
            },
          },
        },
      },
    ],
};
