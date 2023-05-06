import { UserButton } from "@clerk/nextjs";

import { useRouter } from "next/router";
import {
  AlertTriangle,
  ArrowLeftCircle,
  CheckCircle,
  CheckCircle2,
  CircleSlashed,
  Loader,
  Loader2,
  PauseCircle,
  XSquare,
} from "lucide-react";
import { useState, type FC, useReducer } from "react";
import { Button } from "~/components/ui/button";
import { schema } from "agent-roger-core";

export type SelectedTaskProps = {
  // task definition
  taskID: number | null;
  parentID: number | null;
  isAbstract: boolean;
  taskDefinition: string;
  initialInputFields: string;
  initialContextFields: string;
  initialContextSummary: string;
  // status
  paused: boolean | null;
  success: boolean | null;
  dead: boolean | null;
  // timestamps
  timeCreated: Date;
  timeLastUpdated: Date;
  // result data
  resultData: string;
  runtimeErrors: string;
  // stage data
  stage0Data: string;
  stage1Data: string;
  stage2Data: string;
  stage3Data: string;
  stage4Data: string;
  stage5Data: string;
  stage6Data: string;
  stage7Data: string;
  stage8Data: string;
  stage9Data: string;
  stage10Data: string;
  stage11Data: string;
  stage12Data: string;
  stage13Data: string;
  stage14Data: string;
  stage15Data: string;
  stage16Data: string;
  stage17Data: string;
  stage18Data: string;
  stage19Data: string;
  stage20Data: string;
  stage21Data: string;
  stage22Data: string;
  stage23Data: string;
};

const SaveFieldBtn = (props: {
  isSaving: boolean;
  dbValue: string;
  localValue: string;
  saveFn: () => Promise<void>;
}) => {
  if (
    !props.isSaving &&
    (props.localValue.length < 5 || props.localValue == props.dbValue)
  ) {
    return <></>;
  }
  return (
    <Button
      disabled={props.isSaving}
      variant="subtle"
      className="ml-3 font-mono text-lg text-emerald-900"
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      onClick={async () => {
        await props.saveFn();
      }}
    >
      {props.isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
      {!props.isSaving && <CheckCircle className="mr-2 h-4 w-4" />}
      Save
    </Button>
  );
};

/* 
Create (React) and style (tailwind css) the components below. Make everything look nice together, on mobile and desktop (md:).

The ControlArea component is a sidebar (on desktop; a topbar on mobile) that takes up 1/3rd of the screen on the left (or, on mobile, 1/5th of the screen on the top and is collapsible/expandable to the entire screen).

The area below the dropdown select menu should take up the remainder of the available space and be scrollable. It is either a scrollable SelectedTask (if a task is selected) or a scrollable CreateNewTask. If neither is shown, then show a "Create Task" button prominently.

CreateNewTask fields:
- Input Command or Question (medium-height text field called input)
- Initial Context Summary (medium-height text field called initialContextSummary)
- Submit button (regular sized accent color button)
- Cancel button next to the submit button, and also an "X" button to the upper right that closes the CreateNewTask area.

WARNING: This will overwrite the entire db row with your values. Empty fields will be ignored. To erase a JSON field, use {}.

*/

export const ControlArea = (
  props: {
    rootTaskIDs: number[];
    selectedRootTaskID: number | undefined;
    setSelectedRootTaskID: (val: number) => void;
    createNewTaskFn: (params: {
      initialInputFieldsStr: string;
      initialContextFieldsStr: string;
      initialContextSummary: string;
    }) => Promise<void>;
    saveTaskFn: (taskData: SelectedTaskProps) => Promise<void>;
  } & SelectedTaskProps
) => {
  const router = useRouter();
  const [creatingNewTask, toggleCreatingNewTask] = useReducer(
    (val) => !val,
    false
  );

  const handleManageTrainingData = () => {
    router.push("/training-data").catch((err) => console.error(err));
  };

  return (
    <div className="float-left block bg-gray-900 p-4 md:h-full md:w-1/3 md:border-r md:border-slate-800">
      <div className="flex flex-col">
        {/* Mini header */}
        <div className="mb-4 flex justify-between">
          <button
            onClick={handleManageTrainingData}
            className="flex flex-row text-sm text-gray-300 hover:text-white"
          >
            <ArrowLeftCircle className="my-auto mr-2 h-4 w-4" />
            <p className="my-auto">Manage Training Data</p>
          </button>
          <UserButton />
        </div>

        {/* Root Task dropdown */}
        <label htmlFor="rootTask" className="mb-2 text-sm text-gray-300">
          Root Task
        </label>
        <select
          id="rootTask"
          className="mb-4 w-full rounded bg-gray-700 p-2 text-white"
          value={props.selectedRootTaskID}
          onChange={(e) => props.setSelectedRootTaskID(+e.target.value)}
        >
          <option value="">Select a task</option>
          {props.rootTaskIDs.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>

        {/* Create task button  */}
        {!creatingNewTask && (
          <button
            onClick={toggleCreatingNewTask}
            className="mb-10 rounded bg-green-500 px-4 py-2 text-white hover:bg-green-600"
          >
            Create New Root Task
          </button>
        )}

        {/*  */}
        <div className="flex-1 overflow-y-auto">
          <>
            {!creatingNewTask && props.taskID && (
              <SelectedTask
                saveTaskFn={props.saveTaskFn}
                taskID={props.taskID}
                parentID={props.parentID}
                paused={props.paused}
                success={props.success}
                dead={props.dead}
                isAbstract={props.isAbstract}
                taskDefinition={props.taskDefinition}
                initialInputFields={props.initialInputFields}
                initialContextFields={props.initialContextFields}
                initialContextSummary={props.initialContextSummary}
                timeCreated={props.timeCreated}
                timeLastUpdated={props.timeLastUpdated}
                resultData={props.resultData}
                runtimeErrors={props.runtimeErrors}
                stage0Data={props.stage0Data}
                stage1Data={props.stage1Data}
                stage2Data={props.stage2Data}
                stage3Data={props.stage3Data}
                stage4Data={props.stage4Data}
                stage5Data={props.stage5Data}
                stage6Data={props.stage6Data}
                stage7Data={props.stage7Data}
                stage8Data={props.stage8Data}
                stage9Data={props.stage9Data}
                stage10Data={props.stage10Data}
                stage11Data={props.stage11Data}
                stage12Data={props.stage12Data}
                stage13Data={props.stage13Data}
                stage14Data={props.stage14Data}
                stage15Data={props.stage15Data}
                stage16Data={props.stage16Data}
                stage17Data={props.stage17Data}
                stage18Data={props.stage18Data}
                stage19Data={props.stage19Data}
                stage20Data={props.stage20Data}
                stage21Data={props.stage21Data}
                stage22Data={props.stage22Data}
                stage23Data={props.stage23Data}
              />
            )}
            {creatingNewTask && (
              <CreateNewTask
                createNewTaskFn={props.createNewTaskFn}
                cancelFn={toggleCreatingNewTask}
              />
            )}
          </>
        </div>
      </div>
    </div>
  );
};

const CreateNewTask: FC<{
  createNewTaskFn: (params: {
    initialInputFieldsStr: string;
    initialContextFieldsStr: string;
    initialContextSummary: string;
  }) => Promise<void>;
  cancelFn: () => void;
}> = (props) => {
  const DEFAULT_INPUT_EXAMPLE = JSON.stringify(
    { taskDescription: "", someExtraInstruction: "" },
    null,
    2
  );
  const [initialInputFieldsStr, setInitialInputFieldsStr] = useState(
    DEFAULT_INPUT_EXAMPLE
  );
  const [initialContextFieldsStr, setInitialContextFieldsStr] = useState("");
  const [initialContextSummary, setInitialContextSummary] = useState("");

  const handleSubmit = async () => {
    await props.createNewTaskFn({
      initialInputFieldsStr,
      initialContextFieldsStr,
      initialContextSummary,
    });
    setInitialInputFieldsStr(DEFAULT_INPUT_EXAMPLE);
    setInitialContextFieldsStr("");
    setInitialContextSummary("");
    props.cancelFn();
  };

  return (
    <div className="rounded bg-gray-800 p-4">
      <button
        onClick={props.cancelFn}
        className="ml-auto block text-gray-300 hover:text-white"
      >
        <XSquare className="h-7 w-7" />
      </button>
      <h2 className="mb-4 text-lg font-bold text-white">New Root Task</h2>
      <div className="mb-4">
        <label className="mb-2 block text-sm text-gray-300">Input Fields</label>
        <textarea
          className="w-full resize-y rounded bg-gray-700 p-2 text-white"
          value={initialInputFieldsStr}
          onChange={(e) => setInitialInputFieldsStr(e.target.value)}
          onBlur={(e) => {
            try {
              const valAsObject = schema.jsonObj.parse(
                JSON.parse(e.target.value)
              );
              setInitialInputFieldsStr(JSON.stringify(valAsObject, null, 2));
            } catch (ignored) {}
          }}
        />
      </div>
      <div className="mb-4">
        <label className="mb-2 block text-sm text-gray-300">
          Context Fields (optional)
        </label>
        <textarea
          className="w-full resize-y rounded bg-gray-700 p-2 text-white"
          value={initialContextFieldsStr}
          onChange={(e) => setInitialContextFieldsStr(e.target.value)}
          onBlur={(e) => {
            try {
              const valAsObject = schema.jsonObj.parse(
                JSON.parse(e.target.value)
              );
              setInitialContextFieldsStr(JSON.stringify(valAsObject, null, 2));
            } catch (ignored) {}
          }}
        />
      </div>
      <div className="mb-4">
        <label className="mb-2 block text-sm text-gray-300">
          Initial Context Summary (optional)
        </label>
        <textarea
          className="w-full resize-y rounded bg-gray-700 p-2 text-white"
          value={initialContextSummary}
          onChange={(e) => setInitialContextSummary(e.target.value)}
        />
      </div>
      <div className="flex justify-end">
        <Button
          variant={"red"}
          onClick={props.cancelFn}
          className="mr-3 rounded bg-red-500 px-4 py-2 text-white hover:bg-red-600"
        >
          Cancel
        </Button>
        <Button
          disabled={initialInputFieldsStr.trim().length < 5}
          variant={"green"}
          // eslint-disable-next-line @typescript-eslint/no-misused-promises
          onClick={() => handleSubmit()}
          className="rounded bg-green-500 px-4 py-2 text-white hover:bg-green-600"
        >
          Submit
        </Button>
      </div>
    </div>
  );
};

const SelectedTask: FC<
  {
    saveTaskFn: (taskProps: SelectedTaskProps) => Promise<void>;
  } & SelectedTaskProps
> = (props) => {
  const [userInitialInputFields, setUserInitialInputFields] = useState(
    props.initialInputFields
  );
  const [userInitialContextFields, setUserInitialContextFields] = useState(
    props.initialInputFields
  );
  const [userInitialContextSummary, setUserInitialContextSummary] = useState(
    props.initialContextSummary
  );
  const [userResultData, setUserResultData] = useState(props.resultData);
  const [userRuntimeErrors, setUserRuntimeErrors] = useState(
    props.runtimeErrors
  );
  const [userStage0Data, setUserStage0Data] = useState(props.stage0Data);
  const [userStage1Data, setUserStage1Data] = useState(props.stage1Data);
  const [userStage2Data, setUserStage2Data] = useState(props.stage2Data);
  const [userStage3Data, setUserStage3Data] = useState(props.stage3Data);
  const [userStage4Data, setUserStage4Data] = useState(props.stage4Data);
  const [userStage5Data, setUserStage5Data] = useState(props.stage5Data);
  const [userStage6Data, setUserStage6Data] = useState(props.stage6Data);
  const [userStage7Data, setUserStage7Data] = useState(props.stage7Data);
  const [userStage8Data, setUserStage8Data] = useState(props.stage8Data);
  const [userStage9Data, setUserStage9Data] = useState(props.stage9Data);
  const [userStage10Data, setUserStage10Data] = useState(props.stage10Data);
  const [userStage11Data, setUserStage11Data] = useState(props.stage11Data);
  const [userStage12Data, setUserStage12Data] = useState(props.stage12Data);
  const [userStage13Data, setUserStage13Data] = useState(props.stage13Data);
  const [userStage14Data, setUserStage14Data] = useState(props.stage14Data);
  const [userStage15Data, setUserStage15Data] = useState(props.stage15Data);
  const [userStage16Data, setUserStage16Data] = useState(props.stage16Data);
  const [userStage17Data, setUserStage17Data] = useState(props.stage17Data);
  const [userStage18Data, setUserStage18Data] = useState(props.stage18Data);
  const [userStage19Data, setUserStage19Data] = useState(props.stage19Data);
  const [userStage20Data, setUserStage20Data] = useState(props.stage20Data);
  const [userStage21Data, setUserStage21Data] = useState(props.stage21Data);
  const [userStage22Data, setUserStage22Data] = useState(props.stage22Data);
  const [userStage23Data, setUserStage23Data] = useState(props.stage23Data);

  // create a task title
  const firstInputField: string =
    (props.initialInputFields.includes(":") &&
    props.initialInputFields.split(":").length
      ? props.initialInputFields.split(":")[1]
      : "Task With No Input Fields") ?? "Task With No Input Fields";
  const taskTitle: string =
    firstInputField.length > 50
      ? firstInputField.split(" ").slice(0, 50).join(" ") + "..."
      : firstInputField;

  // create a task status
  let status = "Running";
  let statusIcon = <Loader className="h-6 w-6 text-blue-500" />;
  if (props.dead) {
    status = "Dead";
    statusIcon = <CircleSlashed className="h-6 w-6 text-pink-700" />;
  } else if (props.success) {
    status = "Success";
    statusIcon = <CheckCircle2 className="h-6 w-6 text-green-500" />;
  } else if (props.success == false) {
    status = "Failed";
    statusIcon = <AlertTriangle className="h-6 w-6 text-red-500" />;
  } else if (props.paused) {
    status = "Paused";
    statusIcon = <PauseCircle className="h-6 w-6 text-yellow-500" />;
  }

  // create a task type
  let taskStagesStr = "";
  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    taskStagesStr = JSON.parse(props.taskDefinition)
      .stagePresets.join(", ")
      .toLowerCase();
  } catch (ignored) {}
  let taskType = "Helper Sub-Task";
  if (!props.parentID) taskType = "Root Task";
  else if (props.isAbstract) taskType = "Abstract Task";
  else if (taskStagesStr.length) {
    if (
      taskStagesStr.includes("operate") &&
      taskStagesStr.includes("browser")
    ) {
      taskType = "Operate Browser Task";
    } else if (
      taskStagesStr.includes("execute") &&
      taskStagesStr.includes("shell")
    ) {
      taskType = "Execute Shell Task";
    } else if (
      taskStagesStr.includes("execute") &&
      taskStagesStr.includes("typescript")
    ) {
      taskType = "Execute TypeScript Task";
    } else if (taskStagesStr.includes("generatejson")) {
      taskType = "Generate JSON Content Task";
    }
  }

  return (
    <div className="rounded bg-gray-800 p-4">
      <div className="mt-3 text-center">
        <h2 className="mb-4 text-lg font-semibold text-white">{taskTitle}</h2>
        <p className="text-sm text-gray-300">{taskType}</p>
      </div>

      {/* top area */}
      <div className="mb-4 flex items-center justify-between align-middle">
        {/* id and date */}
        <div className="mb-3 mt-3 flex flex-col">
          <div className="mb-1 flex flex-row align-middle">
            <p className="text-sm text-gray-50">#</p>
            <p className="ml-1 text-sm text-gray-200">{props.taskID}</p>
          </div>
          <p className="align-text-bottom text-sm text-gray-200">
            {"Created  " + props.timeCreated.toDateString()}
          </p>
        </div>

        {/* status */}
        <div className="mr-1 flex items-center">
          {statusIcon}
          <p className="text-md ml-2 text-zinc-200">{status}</p>
        </div>
      </div>

      {/* pause/resume buttons */}
      <div className="mb-4 flex flex-row justify-between">
        {!props.paused && (
          <>
            <button className="mr-4 w-full rounded bg-yellow-500 px-4 py-2 text-slate-50 hover:bg-yellow-600">
              Pause
            </button>
            <button className="ml-4 w-full rounded bg-yellow-500 px-4 py-2 text-slate-50 hover:bg-yellow-600">
              Pause Descendents
            </button>
          </>
        )}
        {props.paused && (
          <>
            <button className="mr-4 w-full rounded bg-blue-500 px-4 py-2 text-slate-50 hover:bg-blue-600">
              Resume
            </button>
            <button className="ml-4 w-full rounded bg-blue-500 px-4 py-2 text-slate-50 hover:bg-blue-600">
              Resume Descendents
            </button>
          </>
        )}
      </div>

      {/* restart button */}
      {props.isAbstract && (
        <div className="mb-4 flex flex-col">
          <button className="w-full rounded bg-red-500 px-4 py-2 text-white hover:bg-red-600">
            Restart Tree Here
          </button>
          <p className="mb-1 mt-3 text-sm text-slate-200">
            Restarting here will:
          </p>
          <p className=" text-sm text-slate-200">
            1) Mark this task and its descendents as dead.
          </p>
          <p className=" text-sm text-slate-200">
            2) Re-run this task with the latest saved initialInputFields,
            initialContextFields, and initialContextSummary (you can edit these
            fields down below).
          </p>
          <p className="text-sm text-slate-200">
            3) Undo any actions taken by ancestors after this task was created.
          </p>
          <p className=" mt-1 text-sm text-slate-200">
            When this task is complete, it will propogate back up to the root
            task and re-run any previously run ancestor task logic that depends
            on it (i.e. re-runs ancestor task stages after generateSubTasks).
          </p>
        </div>
      )}

      {/* data fields */}

      {/* TODO: press a button to setStageXLoaded() */}
    </div>
  );
};
