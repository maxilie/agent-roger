import { UserButton } from "@clerk/nextjs";

import { useRouter } from "next/router";
import {
  AlertCircle,
  AlertTriangle,
  ArrowBigDown,
  ArrowLeftCircle,
  CheckCircle,
  CheckCircle2,
  CircleSlashed,
  DownloadCloud,
  InfoIcon,
  Loader,
  Loader2,
  PauseCircle,
  XSquare,
  ZoomIn,
} from "lucide-react";
import { useState, type FC, useReducer, useEffect, useCallback } from "react";
import { Button } from "~/components/ui/button";
import {
  JsonObj,
  ResultData,
  RuntimeErrors,
  StageData,
  TaskDefinition,
  TaskUpdateData,
  schema,
} from "agent-roger-core";
import { z } from "zod";
import { DATA_BANKS } from "./prompts-modal";

export type SelectedTaskProps = {
  // task definition
  taskID: number | null;
  parentID: number | null;
  isAbstract: boolean;
  taskType:
    | "Root Task"
    | "Abstract Task"
    | "Helper Sub-Task"
    | "Operate Browser Task"
    | "Execute Shell Task"
    | "Execute TypeScript Task"
    | "Generate JSON Content Task";
  taskDefinition: TaskDefinition;
  initialInputFields: string;
  initialContextFields: string;
  initialContextSummary: string;
  // status
  paused: boolean | null;
  success: boolean | null;
  dead: boolean | null;
  lastEndedStage: number;
  lastInteractionMarker: string | null;
  // timestamps
  timeCreated: Date;
  timeLastUpdated: Date;
  // result data
  resultData: string;
  runtimeErrors: string;
  // stage data
  stage0Data: string | null;
  loadStage0: () => void;
  isLoadingStage0: boolean;
  stage1Data: string | null;
  loadStage1: () => void;
  isLoadingStage1: boolean;
  stage2Data: string | null;
  loadStage2: () => void;
  isLoadingStage2: boolean;
  stage3Data: string | null;
  loadStage3: () => void;
  isLoadingStage3: boolean;
  stage4Data: string | null;
  loadStage4: () => void;
  isLoadingStage4: boolean;
  stage5Data: string | null;
  loadStage5: () => void;
  isLoadingStage5: boolean;
  stage6Data: string | null;
  loadStage6: () => void;
  isLoadingStage6: boolean;
  stage7Data: string | null;
  loadStage7: () => void;
  isLoadingStage7: boolean;
  stage8Data: string | null;
  loadStage8: () => void;
  isLoadingStage8: boolean;
  stage9Data: string | null;
  loadStage9: () => void;
  isLoadingStage9: boolean;
  stage10Data: string | null;
  loadStage10: () => void;
  isLoadingStage10: boolean;
  stage11Data: string | null;
  loadStage11: () => void;
  isLoadingStage11: boolean;
  stage12Data: string | null;
  loadStage12: () => void;
  isLoadingStage12: boolean;
  stage13Data: string | null;
  loadStage13: () => void;
  isLoadingStage13: boolean;
  stage14Data: string | null;
  loadStage14: () => void;
  isLoadingStage14: boolean;
  stage15Data: string | null;
  loadStage15: () => void;
  isLoadingStage15: boolean;
  stage16Data: string | null;
  loadStage16: () => void;
  isLoadingStage16: boolean;
  stage17Data: string | null;
  loadStage17: () => void;
  isLoadingStage17: boolean;
  stage18Data: string | null;
  loadStage18: () => void;
  isLoadingStage18: boolean;
  stage19Data: string | null;
  loadStage19: () => void;
  isLoadingStage19: boolean;
  stage20Data: string | null;
  loadStage20: () => void;
  isLoadingStage20: boolean;
  stage21Data: string | null;
  loadStage21: () => void;
  isLoadingStage21: boolean;
  stage22Data: string | null;
  loadStage22: () => void;
  isLoadingStage22: boolean;
  stage23Data: string | null;
  loadStage23: () => void;
  isLoadingStage23: boolean;
};

const formatJsonField = (str: string) => {
  try {
    const valAsObject = schema.jsonObj.parse(JSON.parse(str));
    return JSON.stringify(valAsObject, null, 2);
  } catch (ignored) {
    return null;
  }
};

const formatResultDataField = (str: string) => {
  try {
    const valAsObject = schema.task.resultData.parse(JSON.parse(str));
    return JSON.stringify(valAsObject, null, 2);
  } catch (ignored) {
    return null;
  }
};

const formatRuntimeErrorsField = (str: string) => {
  try {
    const valAsObject = schema.task.runtimeErrors.parse(JSON.parse(str));
    return JSON.stringify(valAsObject, null, 2);
  } catch (ignored) {
    return null;
  }
};

const formatStageDataField = (str: string) => {
  try {
    const valAsObject = schema.task.stageData.parse(JSON.parse(str));
    return JSON.stringify(valAsObject, null, 2);
  } catch (ignored) {
    return null;
  }
};

const isJsonInvalid = (input: string | null) => {
  if (!input && !input?.trim().length) return false;
  try {
    return !schema.jsonObj.safeParse(JSON.parse(input)).success;
  } catch (ignored) {
    return true;
  }
};

const isResultDataInvalid = (input: string | null) => {
  if (!input && !input?.trim().length) return false;
  try {
    return !schema.task.resultData.safeParse(JSON.parse(input)).success;
  } catch (ignored) {
    return true;
  }
};

const isRuntimeErrorsInvalid = (input: string | null) => {
  if (!input && !input?.trim().length) return false;
  try {
    return !schema.task.runtimeErrors.safeParse(JSON.parse(input)).success;
  } catch (ignored) {
    return true;
  }
};

const isStageDataInvalid = (input: string | null) => {
  if (!input && !input?.trim().length) return false;
  try {
    return !schema.task.stageData.safeParse(JSON.parse(input)).success;
  } catch (ignored) {
    return true;
  }
};

// ignore empty string; replace "" or '' with empty string
const parseStr = (input: string): string | undefined => {
  if (!input.trim().length) return undefined;
  if (input == '""' || input == "''") return "";
  return undefined;
};

// ignore empty string and invalid json
const parseJsonStr = (input: string): JsonObj | undefined => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const rawJson = JSON.parse(input);
    return schema.jsonObj.parse(rawJson);
  } catch (ignored) {
    return undefined;
  }
};

const parseResultDataStr = (input: string): ResultData | undefined => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const rawJson = JSON.parse(input);
    return schema.task.resultData.parse(rawJson);
  } catch (ignored) {
    return undefined;
  }
};
const parseRuntimeErrorsStr = (input: string): RuntimeErrors | undefined => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const rawJson = JSON.parse(input);
    return schema.task.runtimeErrors.parse(rawJson);
  } catch (ignored) {
    return undefined;
  }
};

const parseStageDataStr = (input: string): StageData | undefined => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const rawJson = JSON.parse(input);
    return schema.task.stageData.parse(rawJson);
  } catch (ignored) {
    return undefined;
  }
};

const LoadStageButton = (props: {
  isLoading: boolean;
  N: number;
  loadFn: () => void;
}) => {
  return (
    <div className="mt-5 flex w-full flex-row justify-center">
      <Button
        disabled={props.isLoading}
        variant="blue"
        className="text-md mx-auto my-auto font-mono text-gray-50"
        onClick={props.loadFn}
      >
        {props.isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {!props.isLoading && (
          <DownloadCloud className="mr-2 h-5 w-5 text-sky-300" />
        )}
        {`Load Stage ${props.N}`}
      </Button>
    </div>
  );
};

const StringOrJsonInputArea = (props: {
  label: string;
  typeLabel: string;
  defaultFieldHeight: string;
  isSaving: boolean;
  dbValue: string;
  localValue: string;
  setLocalValue: (val: string) => void;
  saveFn: () => Promise<void>;
  formatStringFn: (str: string) => string | null;
  isEdited: boolean;
  isInvalid: (input: string) => boolean;
}) => {
  const isNowInvalid = props.isInvalid(props.localValue);
  return (
    <div className="mt-8">
      <div className="mb-3 flex justify-between">
        <div className="my-auto flex w-7/12 flex-col justify-around">
          <label className="text-md block text-gray-50">{props.label}</label>
          <label className="ml-2 mt-2 block text-sm text-gray-300">
            {props.typeLabel}
          </label>
        </div>
        {props.isEdited && !isNowInvalid && (
          <SaveFieldBtn isSaving={props.isSaving} saveFn={props.saveFn} />
        )}
        {props.isEdited && isNowInvalid && (
          <div className="my-auto ml-auto mr-2 flex">
            <AlertCircle className="h-6 w-6 text-red-400" />
            <p className="text-md ml-2 font-serif font-semibold text-yellow-50">
              Invalid!
            </p>
          </div>
        )}
      </div>
      <textarea
        className={
          "w-full resize-y rounded bg-gray-700 p-2 text-white drop-shadow-lg" +
          " " +
          props.defaultFieldHeight
        }
        value={props.localValue}
        onChange={(e) => props.setLocalValue(e.target.value)}
        onBlur={(e) => {
          const formattedString = props.formatStringFn(e.target.value);
          if (formattedString != null) props.setLocalValue(formattedString);
        }}
      />
    </div>
  );
};

const SaveFieldBtn = (props: {
  isSaving: boolean;
  saveFn: () => Promise<void>;
}) => {
  return (
    <Button
      disabled={props.isSaving}
      variant="subtle"
      size="sm"
      className="text-md my-auto ml-auto font-mono text-emerald-900"
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      onClick={async () => {
        await props.saveFn();
      }}
    >
      {props.isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
      {!props.isSaving && <CheckCircle className="mr-2 h-5 w-5" />}
      Save All
    </Button>
  );
};

export const MainControlArea = (
  props: {
    rootTaskIDs: number[];
    selectedRootTaskID: number | undefined;
    setSelectedRootTaskID: (val: number) => void;
    createNewTaskFn: (params: {
      initialInputFieldsStr: string;
      initialContextFieldsStr: string;
      initialContextSummary: string;
    }) => Promise<void>;
    saveTaskFn: (changedFields: TaskUpdateData) => Promise<void>;
    isSaving: boolean;
    isPausing: boolean;
    isPausingDescendents: boolean;
    isUnpausing: boolean;
    isUnpausingDescendents: boolean;
    pauseFn: () => Promise<void>;
    pauseDescendentsFn: () => Promise<void>;
    unpauseFn: () => Promise<void>;
    unpauseDescendentsFn: () => Promise<void>;
    // prompt explorer props
    setShowingPromptsModal: (val: boolean) => void;
    selectedDataBank: (typeof DATA_BANKS)[number];
    selectDataBankFn: (dataBank: string) => void;
    selectedHistoricalPromptsTaskID: number | null;
    setSelectedHistoricalPromptsTaskID: (taskID: number | null) => void;
  } & SelectedTaskProps
) => {
  const [creatingNewTask, toggleCreatingNewTask] = useReducer(
    (val) => !val,
    false
  );

  const openPromptHistory = () => {
    props.setShowingPromptsModal(true);
    props.selectDataBankFn("task-prompt-history");
    props.setSelectedHistoricalPromptsTaskID(props.taskID);
  };

  return (
    <div className="z-10 float-left block overflow-hidden bg-gray-900 px-4 pb-4 shadow-md shadow-white md:h-full md:w-1/3 md:border-r md:border-slate-800">
      {/* Mini header */}
      <div className="mb-8 mt-6 flex justify-between border-b border-slate-800 pb-10">
        <UserButton />
        <button
          onClick={() => props.setShowingPromptsModal(true)}
          className="flex flex-row text-lg text-gray-200 hover:animate-pulse hover:text-white"
        >
          <p className="my-auto">Manage Prompt Data</p>
          <ZoomIn className="my-auto ml-2 h-8 w-8" />
        </button>
      </div>
      <div className="flex h-full flex-col overflow-y-auto scrollbar-none">
        {/* Root Task dropdown */}
        {!creatingNewTask && (
          <>
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
          </>
        )}

        {/* Create task button  */}
        {!creatingNewTask && (
          <button
            onClick={toggleCreatingNewTask}
            className="rounded bg-green-500 px-4 py-2 text-white hover:bg-green-600"
          >
            Create New Root Task
          </button>
        )}

        {/* CreateNewTask or SelectedTask */}
        <>
          {!creatingNewTask && props.taskID && (
            <>
              <label className="mb-2 mt-10 text-sm text-gray-300">
                Selected Task
              </label>
              <SelectedTask
                openPromptHistory={openPromptHistory}
                saveTaskFn={props.saveTaskFn}
                isSaving={props.isSaving}
                isPausing={props.isPausing}
                isPausingDescendents={props.isPausingDescendents}
                isUnpausing={props.isUnpausing}
                isUnpausingDescendents={props.isUnpausingDescendents}
                pauseFn={props.pauseFn}
                pauseDescendentsFn={props.pauseDescendentsFn}
                unpauseFn={props.unpauseFn}
                unpauseDescendentsFn={props.unpauseDescendentsFn}
                taskID={props.taskID}
                parentID={props.parentID}
                paused={props.paused}
                success={props.success}
                dead={props.dead}
                isAbstract={props.isAbstract}
                taskType={props.taskType}
                lastEndedStage={props.lastEndedStage}
                lastInteractionMarker={props.lastInteractionMarker}
                taskDefinition={props.taskDefinition}
                initialInputFields={props.initialInputFields}
                initialContextFields={props.initialContextFields}
                initialContextSummary={props.initialContextSummary}
                timeCreated={props.timeCreated}
                timeLastUpdated={props.timeLastUpdated}
                resultData={props.resultData}
                runtimeErrors={props.runtimeErrors}
                stage0Data={props.stage0Data}
                loadStage0={props.loadStage0}
                isLoadingStage0={props.isLoadingStage0}
                stage1Data={props.stage1Data}
                loadStage1={props.loadStage1}
                isLoadingStage1={props.isLoadingStage1}
                stage2Data={props.stage2Data}
                loadStage2={props.loadStage2}
                isLoadingStage2={props.isLoadingStage2}
                stage3Data={props.stage3Data}
                loadStage3={props.loadStage3}
                isLoadingStage3={props.isLoadingStage3}
                stage4Data={props.stage4Data}
                loadStage4={props.loadStage4}
                isLoadingStage4={props.isLoadingStage4}
                stage5Data={props.stage5Data}
                loadStage5={props.loadStage5}
                isLoadingStage5={props.isLoadingStage5}
                stage6Data={props.stage6Data}
                loadStage6={props.loadStage6}
                isLoadingStage6={props.isLoadingStage6}
                stage7Data={props.stage7Data}
                loadStage7={props.loadStage7}
                isLoadingStage7={props.isLoadingStage7}
                stage8Data={props.stage8Data}
                loadStage8={props.loadStage8}
                isLoadingStage8={props.isLoadingStage8}
                stage9Data={props.stage9Data}
                loadStage9={props.loadStage9}
                isLoadingStage9={props.isLoadingStage9}
                stage10Data={props.stage10Data}
                loadStage10={props.loadStage10}
                isLoadingStage10={props.isLoadingStage10}
                stage11Data={props.stage11Data}
                loadStage11={props.loadStage11}
                isLoadingStage11={props.isLoadingStage11}
                stage12Data={props.stage12Data}
                loadStage12={props.loadStage12}
                isLoadingStage12={props.isLoadingStage12}
                stage13Data={props.stage13Data}
                loadStage13={props.loadStage13}
                isLoadingStage13={props.isLoadingStage13}
                stage14Data={props.stage14Data}
                loadStage14={props.loadStage14}
                isLoadingStage14={props.isLoadingStage14}
                stage15Data={props.stage15Data}
                loadStage15={props.loadStage15}
                isLoadingStage15={props.isLoadingStage15}
                stage16Data={props.stage16Data}
                loadStage16={props.loadStage16}
                isLoadingStage16={props.isLoadingStage16}
                stage17Data={props.stage17Data}
                loadStage17={props.loadStage17}
                isLoadingStage17={props.isLoadingStage17}
                stage18Data={props.stage18Data}
                loadStage18={props.loadStage18}
                isLoadingStage18={props.isLoadingStage18}
                stage19Data={props.stage19Data}
                loadStage19={props.loadStage19}
                isLoadingStage19={props.isLoadingStage19}
                stage20Data={props.stage20Data}
                loadStage20={props.loadStage20}
                isLoadingStage20={props.isLoadingStage20}
                stage21Data={props.stage21Data}
                loadStage21={props.loadStage21}
                isLoadingStage21={props.isLoadingStage21}
                stage22Data={props.stage22Data}
                loadStage22={props.loadStage22}
                isLoadingStage22={props.isLoadingStage22}
                stage23Data={props.stage23Data}
                loadStage23={props.loadStage23}
                isLoadingStage23={props.isLoadingStage23}
              />
            </>
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
  const [initialInputFieldsValid, setInitialInputFieldsValid] = useState(true);
  const [initialContextFieldsValid, setInitialContextFieldsValid] =
    useState(true);

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
    <div className="mb-44 rounded bg-gray-800 p-4">
      <button
        onClick={props.cancelFn}
        className="ml-auto block text-gray-300 hover:text-white"
      >
        <XSquare className="h-7 w-7" />
      </button>
      <h2 className="mb-4 text-lg font-bold text-white">New Root Task</h2>

      <div className="mt-8">
        <div className="mb-3 flex justify-between">
          <div className="my-auto flex w-7/12 flex-col justify-around">
            <label className="mb-1 block text-sm text-gray-300">
              Input Fields
            </label>
          </div>
          {!initialInputFieldsValid && (
            <div className="my-auto ml-auto mr-2 flex">
              <AlertCircle className="h-6 w-6 text-red-400" />
              <p className="text-md ml-2 font-serif font-semibold text-yellow-50">
                Invalid!
              </p>
            </div>
          )}
        </div>
        <textarea
          className="h-44 w-full resize-y rounded bg-gray-700 p-2 text-white drop-shadow-lg"
          value={initialInputFieldsStr}
          onChange={(e) => setInitialInputFieldsStr(e.target.value)}
          onBlur={(e) => {
            try {
              const valAsObject = schema.jsonObj.parse(
                JSON.parse(e.target.value)
              );
              setInitialInputFieldsStr(JSON.stringify(valAsObject, null, 2));
              setInitialInputFieldsValid(true);
            } catch (_) {
              if (e.target.value.trim().length) {
                setInitialInputFieldsValid(false);
              }
            }
          }}
        />
      </div>
      <div className="mt-8">
        <div className="mb-3 flex justify-between">
          <div className="my-auto flex w-7/12 flex-col justify-around">
            <label className="mb-1 block text-sm text-gray-300">
              Context Fields (optional)
            </label>
          </div>
          {!initialContextFieldsValid && (
            <div className="my-auto ml-auto mr-2 flex">
              <AlertCircle className="h-6 w-6 text-red-400" />
              <p className="text-md ml-2 font-serif font-semibold text-yellow-50">
                Invalid!
              </p>
            </div>
          )}
        </div>
        <textarea
          className="h-20 w-full resize-y rounded bg-gray-700 p-2 text-white drop-shadow-lg"
          value={initialContextFieldsStr}
          onChange={(e) => setInitialContextFieldsStr(e.target.value)}
          onBlur={(e) => {
            try {
              const valAsObject = schema.jsonObj.parse(
                JSON.parse(e.target.value)
              );
              setInitialContextFieldsStr(JSON.stringify(valAsObject, null, 2));
              setInitialContextFieldsValid(true);
            } catch (_) {
              if (e.target.value.trim().length) {
                setInitialContextFieldsValid(false);
              }
            }
          }}
        />
      </div>
      <div className="mt-8">
        <div className="mb-3 flex justify-between">
          <div className="my-auto flex w-7/12 flex-col justify-around">
            <label className="mb-1 block text-sm text-gray-300">
              Context Summary (optional)
            </label>
          </div>
        </div>
        <textarea
          className="h-20 w-full resize-y rounded bg-gray-700 p-2 text-white drop-shadow-lg"
          value={initialContextSummary}
          onChange={(e) => setInitialContextSummary(e.target.value)}
        />
      </div>
      <div className="mb-8 mt-8 flex justify-end">
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
    saveTaskFn: (changedFields: TaskUpdateData) => Promise<void>;
    isSaving: boolean;
    isPausing: boolean;
    isPausingDescendents: boolean;
    isUnpausing: boolean;
    isUnpausingDescendents: boolean;
    pauseFn: () => Promise<void>;
    pauseDescendentsFn: () => Promise<void>;
    unpauseFn: () => Promise<void>;
    unpauseDescendentsFn: () => Promise<void>;
    openPromptHistory: () => void;
  } & SelectedTaskProps
> = (props) => {
  // state vars for editable fields
  const [userTaskID, setUserTaskID] = useState<number | null>(props.taskID);
  const [userSuccess, setUserSuccess] = useState<boolean | null>(props.success);
  const [userLastEndedStage, setUserLastEndedStage] = useState<number>(
    props.lastEndedStage
  );
  const [userInitialInputFields, setUserInitialInputFields] = useState<
    string | null
  >(props.initialInputFields);
  const [userInitialContextFields, setUserInitialContextFields] = useState<
    string | null
  >(props.initialContextFields);
  const [userInitialContextSummary, setUserInitialContextSummary] = useState<
    string | null
  >(props.initialContextSummary);
  const [userResultData, setUserResultData] = useState<string | null>(
    props.resultData
  );
  const [userRuntimeErrors, setUserRuntimeErrors] = useState<string | null>(
    props.runtimeErrors
  );
  // initial stage data strings need to be updated with useEffect() when user loads a stage
  const [userStage0Data, setUserStage0Data] = useState<string | null>(
    props.stage0Data
  );
  const [userStage1Data, setUserStage1Data] = useState<string | null>(
    props.stage1Data
  );
  const [userStage2Data, setUserStage2Data] = useState<string | null>(
    props.stage2Data
  );
  const [userStage3Data, setUserStage3Data] = useState<string | null>(
    props.stage3Data
  );
  const [userStage4Data, setUserStage4Data] = useState<string | null>(
    props.stage4Data
  );
  const [userStage5Data, setUserStage5Data] = useState<string | null>(
    props.stage5Data
  );
  const [userStage6Data, setUserStage6Data] = useState<string | null>(
    props.stage6Data
  );
  const [userStage7Data, setUserStage7Data] = useState<string | null>(
    props.stage7Data
  );
  const [userStage8Data, setUserStage8Data] = useState<string | null>(
    props.stage8Data
  );
  const [userStage9Data, setUserStage9Data] = useState<string | null>(
    props.stage9Data
  );
  const [userStage10Data, setUserStage10Data] = useState<string | null>(
    props.stage10Data
  );
  const [userStage11Data, setUserStage11Data] = useState<string | null>(
    props.stage11Data
  );
  const [userStage12Data, setUserStage12Data] = useState<string | null>(
    props.stage12Data
  );
  const [userStage13Data, setUserStage13Data] = useState<string | null>(
    props.stage13Data
  );
  const [userStage14Data, setUserStage14Data] = useState<string | null>(
    props.stage14Data
  );
  const [userStage15Data, setUserStage15Data] = useState<string | null>(
    props.stage15Data
  );
  const [userStage16Data, setUserStage16Data] = useState<string | null>(
    props.stage16Data
  );
  const [userStage17Data, setUserStage17Data] = useState<string | null>(
    props.stage17Data
  );
  const [userStage18Data, setUserStage18Data] = useState<string | null>(
    props.stage18Data
  );
  const [userStage19Data, setUserStage19Data] = useState<string | null>(
    props.stage19Data
  );
  const [userStage20Data, setUserStage20Data] = useState<string | null>(
    props.stage20Data
  );
  const [userStage21Data, setUserStage21Data] = useState<string | null>(
    props.stage21Data
  );
  const [userStage22Data, setUserStage22Data] = useState<string | null>(
    props.stage22Data
  );
  const [userStage23Data, setUserStage23Data] = useState<string | null>(
    props.stage23Data
  );
  useEffect(() => {
    if (userTaskID != props.taskID) {
      setUserTaskID(props.taskID);
      setUserSuccess(props.success);
      setUserLastEndedStage(props.lastEndedStage);
      setUserInitialInputFields(props.initialInputFields);
      setUserInitialContextFields(props.initialContextFields);
      setUserInitialContextSummary(props.initialContextSummary);
      setUserResultData(props.resultData);
      setUserRuntimeErrors(props.runtimeErrors);
    }
    if (userStage0Data !== props.stage0Data)
      setUserStage0Data(props.stage0Data);
    if (userStage1Data !== props.stage1Data)
      setUserStage1Data(props.stage1Data);
    if (userStage2Data !== props.stage2Data)
      setUserStage2Data(props.stage2Data);
    if (userStage3Data !== props.stage3Data)
      setUserStage3Data(props.stage3Data);
    if (userStage4Data !== props.stage4Data)
      setUserStage4Data(props.stage4Data);
    if (userStage5Data !== props.stage5Data)
      setUserStage5Data(props.stage5Data);
    if (userStage6Data !== props.stage6Data)
      setUserStage6Data(props.stage6Data);
    if (userStage7Data !== props.stage7Data)
      setUserStage7Data(props.stage7Data);
    if (userStage8Data !== props.stage8Data)
      setUserStage8Data(props.stage8Data);
    if (userStage9Data != props.stage9Data) setUserStage9Data(props.stage9Data);
    if (userStage10Data != props.stage10Data)
      setUserStage10Data(props.stage10Data);
    if (userStage11Data != props.stage11Data)
      setUserStage11Data(props.stage11Data);
    if (userStage12Data != props.stage12Data)
      setUserStage12Data(props.stage12Data);
    if (userStage13Data != props.stage13Data)
      setUserStage13Data(props.stage13Data);
    if (userStage14Data != props.stage14Data)
      setUserStage14Data(props.stage14Data);
    if (userStage15Data != props.stage15Data)
      setUserStage15Data(props.stage15Data);
    if (userStage16Data != props.stage16Data)
      setUserStage16Data(props.stage16Data);
    if (userStage17Data != props.stage17Data)
      setUserStage17Data(props.stage17Data);
    if (userStage18Data != props.stage18Data)
      setUserStage18Data(props.stage18Data);
    if (userStage19Data != props.stage19Data)
      setUserStage19Data(props.stage19Data);
    if (userStage20Data != props.stage20Data)
      setUserStage20Data(props.stage20Data);
    if (userStage21Data != props.stage21Data)
      setUserStage21Data(props.stage21Data);
    if (userStage22Data != props.stage22Data)
      setUserStage22Data(props.stage22Data);
    if (userStage23Data != props.stage23Data)
      setUserStage23Data(props.stage23Data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    props.initialContextFields,
    props.initialContextSummary,
    props.initialInputFields,
    props.lastEndedStage,
    props.resultData,
    props.runtimeErrors,
    props.stage0Data,
    props.stage10Data,
    props.stage11Data,
    props.stage12Data,
    props.stage13Data,
    props.stage14Data,
    props.stage15Data,
    props.stage16Data,
    props.stage17Data,
    props.stage18Data,
    props.stage19Data,
    props.stage1Data,
    props.stage20Data,
    props.stage21Data,
    props.stage22Data,
    props.stage23Data,
    props.stage2Data,
    props.stage3Data,
    props.stage4Data,
    props.stage5Data,
    props.stage6Data,
    props.stage7Data,
    props.stage8Data,
    props.stage9Data,
    props.success,
    props.taskID,
    userTaskID,
  ]);

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
  let statusIcon = <Loader className="h-6 w-6 animate-spin text-gray-300" />;
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

  const saveEditedFields = async () => {
    // get only the changed fields
    const changedFields: TaskUpdateData = {
      ...(userSuccess !== props.success ? { success: userSuccess } : {}),
      ...(userLastEndedStage != props.lastEndedStage
        ? { lastEndedStage: userLastEndedStage }
        : {}),
      ...(userInitialInputFields != props.initialInputFields
        ? { initialInputFields: parseJsonStr(userInitialInputFields ?? "") }
        : {}),
      ...(userInitialContextFields != props.initialContextFields
        ? { initialContextFields: parseJsonStr(userInitialContextFields ?? "") }
        : {}),
      ...(userInitialContextSummary != props.initialContextSummary
        ? { initialContextSummary: parseStr(userInitialContextSummary ?? "") }
        : {}),
      ...(userResultData != props.resultData
        ? { resultData: parseResultDataStr(userResultData ?? "") }
        : {}),
      ...(userRuntimeErrors != props.runtimeErrors
        ? { runtimeErrors: parseRuntimeErrorsStr(userRuntimeErrors ?? "") }
        : {}),
      ...(userStage0Data != props.stage0Data
        ? { stage0Data: parseStageDataStr(userStage0Data ?? "") }
        : {}),
      ...(userStage1Data != props.stage1Data
        ? { stage1Data: parseStageDataStr(userStage1Data ?? "") }
        : {}),
      ...(userStage2Data != props.stage2Data
        ? { stage2Data: parseStageDataStr(userStage2Data ?? "") }
        : {}),
      ...(userStage3Data != props.stage3Data
        ? { stage3Data: parseStageDataStr(userStage3Data ?? "") }
        : {}),
      ...(userStage4Data != props.stage4Data
        ? { stage4Data: parseStageDataStr(userStage4Data ?? "") }
        : {}),
      ...(userStage5Data != props.stage5Data
        ? { stage5Data: parseStageDataStr(userStage5Data ?? "") }
        : {}),
      ...(userStage6Data != props.stage6Data
        ? { stage6Data: parseStageDataStr(userStage6Data ?? "") }
        : {}),
      ...(userStage7Data != props.stage7Data
        ? { stage7Data: parseStageDataStr(userStage7Data ?? "") }
        : {}),
      ...(userStage8Data != props.stage8Data
        ? { stage8Data: parseStageDataStr(userStage8Data ?? "") }
        : {}),
      ...(userStage9Data != props.stage9Data
        ? { stage9Data: parseStageDataStr(userStage9Data ?? "") }
        : {}),
      ...(userStage10Data != props.stage10Data
        ? { stage10Data: parseStageDataStr(userStage10Data ?? "") }
        : {}),
      ...(userStage11Data != props.stage11Data
        ? { stage11Data: parseStageDataStr(userStage11Data ?? "") }
        : {}),
      ...(userStage12Data != props.stage12Data
        ? { stage12Data: parseStageDataStr(userStage12Data ?? "") }
        : {}),
      ...(userStage13Data != props.stage13Data
        ? { stage13Data: parseStageDataStr(userStage13Data ?? "") }
        : {}),
      ...(userStage14Data != props.stage14Data
        ? { stage14Data: parseStageDataStr(userStage14Data ?? "") }
        : {}),
      ...(userStage15Data != props.stage15Data
        ? { stage15Data: parseStageDataStr(userStage15Data ?? "") }
        : {}),
      ...(userStage16Data != props.stage16Data
        ? { stage16Data: parseStageDataStr(userStage16Data ?? "") }
        : {}),
      ...(userStage17Data != props.stage17Data
        ? { stage17Data: parseStageDataStr(userStage17Data ?? "") }
        : {}),
      ...(userStage18Data != props.stage18Data
        ? { stage18Data: parseStageDataStr(userStage18Data ?? "") }
        : {}),
      ...(userStage19Data != props.stage19Data
        ? { stage19Data: parseStageDataStr(userStage19Data ?? "") }
        : {}),
      ...(userStage20Data != props.stage20Data
        ? { stage20Data: parseStageDataStr(userStage20Data ?? "") }
        : {}),
      ...(userStage21Data != props.stage21Data
        ? { stage21Data: parseStageDataStr(userStage21Data ?? "") }
        : {}),
      ...(userStage22Data != props.stage22Data
        ? { stage22Data: parseStageDataStr(userStage22Data ?? "") }
        : {}),
      ...(userStage23Data != props.stage23Data
        ? { stage23Data: parseStageDataStr(userStage23Data ?? "") }
        : {}),
    };
    await props.saveTaskFn(changedFields);
  };

  return (
    <div className="mb-20 flex flex-col">
      <div className="rounded bg-gray-800 p-4">
        {/* top area */}
        <div className="flex items-center justify-between align-middle">
          {/* id, type, and date */}
          <div className="mb-3 mt-3 flex flex-col">
            <p className="text-md mb-1 text-gray-200">{props.taskType}</p>
            <div className="mb-1 flex flex-row align-middle">
              <p className="text-sm text-gray-200">#</p>
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

        <div className="mt-4 text-center">
          <h2 className="mx-2 bg-gray-900 p-6 text-xl font-semibold text-slate-50/80">
            {taskTitle}
          </h2>
        </div>
        <button
          onClick={props.openPromptHistory}
          className="mx-auto mb-12 mt-10 flex flex-row font-mono text-xl text-gray-100 underline hover:animate-pulse hover:text-white"
        >
          <p className="my-auto">Prompt History</p>
          <ZoomIn className="my-auto ml-2 h-8 w-8" />
        </button>

        {/* pause/resume buttons */}
        {!props.dead && (
          <div className="mb-4 flex flex-row justify-between">
            {!props.paused && (
              <>
                {!props.resultData && props.success == null ? (
                  <Button
                    disabled={props.isPausing}
                    variant={"yellow"}
                    className="mr-4 w-full rounded px-4 py-2 text-lg text-slate-50"
                    // eslint-disable-next-line @typescript-eslint/no-misused-promises
                    onClick={async () => {
                      await props.pauseFn();
                    }}
                  >
                    {props.isPausing && (
                      <Loader2 className="mr-4 h-4 w-4 animate-spin" />
                    )}
                    Pause
                  </Button>
                ) : (
                  <div className="mr-4 w-full"></div>
                )}
                <Button
                  disabled={props.isPausingDescendents}
                  variant={"yellow"}
                  className="ml-4 w-full rounded px-4 py-2 text-lg"
                  // eslint-disable-next-line @typescript-eslint/no-misused-promises
                  onClick={async () => {
                    await props.pauseDescendentsFn();
                  }}
                >
                  {props.isPausingDescendents && (
                    <Loader2 className="mr-4 h-4 w-4 animate-spin" />
                  )}
                  Pause Descendents
                </Button>
              </>
            )}
            {props.paused && (
              <>
                <Button
                  disabled={props.isUnpausing}
                  variant={"blue2"}
                  className="roundedpx-4 mr-4 w-full py-2 text-lg"
                  // eslint-disable-next-line @typescript-eslint/no-misused-promises
                  onClick={async () => {
                    await props.unpauseFn();
                  }}
                >
                  {props.isUnpausing && (
                    <Loader2 className="mr-4 h-4 w-4 animate-spin" />
                  )}
                  Unpause
                </Button>
                <Button
                  disabled={props.isUnpausingDescendents}
                  variant={"blue2"}
                  className="ml-4 w-full rounded  px-4 py-2 text-lg"
                  // eslint-disable-next-line @typescript-eslint/no-misused-promises
                  onClick={async () => {
                    await props.unpauseDescendentsFn();
                  }}
                >
                  {props.isUnpausingDescendents && (
                    <Loader2 className="mr-4 h-4 w-4 animate-spin" />
                  )}
                  {props.isUnpausingDescendents
                    ? "Unpause Tree"
                    : "Unpause Descendents"}
                </Button>
              </>
            )}
          </div>
        )}

        {/* restart button */}
        {props.isAbstract && (
          <div className="mb-4 flex flex-col">
            <button className="w-full rounded bg-red-500 px-4 py-2 text-white hover:bg-red-600">
              Restart Tree Here
            </button>
            <p className="mt-3 text-sm font-semibold text-slate-200">
              Restarting here will:
            </p>
            <p className=" mt-2 text-sm  text-slate-300">
              1) Mark this task and its descendents as dead.
            </p>
            <p className=" text-sm text-slate-300">
              2) Re-run this task with the latest saved initialInputFields,
              initialContextFields, and initialContextSummary (you can edit
              these fields down below).
            </p>
            <p className="text-sm text-slate-300">
              3) Undo any actions taken by ancestors after this task was
              created.
            </p>
            <p className=" mt-2 text-sm text-slate-300">
              When this task is complete, it will propogate back up to the root
              task and re-run any previously run ancestor task logic that
              depends on it (i.e. re-runs ancestor task stages after
              generateSubTasks).
            </p>
          </div>
        )}
      </div>

      {/* task data fields */}
      <div className="mb-16 mt-12 rounded bg-gray-800 p-4">
        <div className="mt-3 text-center">
          <h2 className="mb-4 text-3xl font-semibold text-white">Task Data</h2>
        </div>
        <div className="mt-1 flex">
          <div>
            <InfoIcon className="h-5 w-5 text-cyan-300" />
          </div>
          <p className="ml-2 text-sm text-orange-50">{`When you edit a field, a "Save All" button appears. THIS WILL ALSO SAVE OTHER FIELDS YOU HAVE EDITED.`}</p>
        </div>
        <div className="mt-3 flex">
          <div>
            <InfoIcon className="h-5 w-5 text-cyan-300" />
          </div>
          <p className="ml-2 text-sm text-orange-50">{`To erase a JSON field, change it to: {}`}</p>
        </div>
        <div className="mt-3 flex">
          <div>
            <InfoIcon className="h-5 w-5 text-cyan-300" />
          </div>
          <p className="ml-2 block text-sm text-orange-50">{`To erase a string field, change it to: ""`}</p>
        </div>
        <div className="mt-14" />

        {/* initialInputFields */}
        <StringOrJsonInputArea
          label="Initial Input Fields"
          typeLabel="JSON Object"
          defaultFieldHeight="h-44"
          isSaving={props.isSaving}
          dbValue={props.initialInputFields}
          localValue={userInitialInputFields ?? ""}
          setLocalValue={setUserInitialInputFields}
          saveFn={saveEditedFields}
          formatStringFn={formatJsonField}
          isEdited={
            userInitialInputFields != props.initialInputFields &&
            (userInitialInputFields?.trim().length ?? 0) > 0
          }
          isInvalid={isJsonInvalid}
        />

        {/* initialContextFields */}
        <StringOrJsonInputArea
          label="Initial Context Fields"
          typeLabel="JSON Object"
          defaultFieldHeight="h-14"
          isSaving={props.isSaving}
          dbValue={props.initialContextFields}
          localValue={userInitialContextFields ?? ""}
          setLocalValue={setUserInitialContextFields}
          saveFn={saveEditedFields}
          formatStringFn={formatJsonField}
          isEdited={
            userInitialContextFields != props.initialContextFields &&
            (userInitialContextFields?.trim().length ?? 0) > 0
          }
          isInvalid={isJsonInvalid}
        />

        {/* initialContextSummary */}
        <StringOrJsonInputArea
          label="Initial Context Summary"
          typeLabel="String"
          defaultFieldHeight="h-14"
          isSaving={props.isSaving}
          dbValue={props.initialContextSummary}
          localValue={userInitialContextSummary ?? ""}
          setLocalValue={setUserInitialContextSummary}
          saveFn={saveEditedFields}
          formatStringFn={(input: string) => {
            return input.trim();
          }}
          isEdited={
            userInitialContextSummary != props.initialContextSummary &&
            (userInitialContextSummary?.trim().length ?? 0) > 0
          }
          isInvalid={(input: string) => {
            return false;
          }}
        />

        {/* resultData */}
        <StringOrJsonInputArea
          label="Result Data"
          typeLabel='{"failed": bool, "taskSummary": str, "outputFields": JSON Object}'
          defaultFieldHeight="h-32"
          isSaving={props.isSaving}
          dbValue={props.resultData}
          localValue={userResultData ?? ""}
          setLocalValue={setUserResultData}
          saveFn={saveEditedFields}
          formatStringFn={formatResultDataField}
          isEdited={
            userResultData != props.resultData &&
            (userResultData?.trim().length ?? 0) > 0
          }
          isInvalid={isResultDataInvalid}
        />

        {/* runtimeErrors */}
        <StringOrJsonInputArea
          label="Runtime Errors"
          typeLabel="String Array"
          defaultFieldHeight="h-14"
          isSaving={props.isSaving}
          dbValue={props.runtimeErrors}
          localValue={userRuntimeErrors ?? ""}
          setLocalValue={setUserRuntimeErrors}
          saveFn={saveEditedFields}
          formatStringFn={formatRuntimeErrorsField}
          isEdited={
            userRuntimeErrors != props.runtimeErrors &&
            (userRuntimeErrors?.trim().length ?? 0) > 0
          }
          isInvalid={isRuntimeErrorsInvalid}
        />

        {/* taskDefinition stages */}
        <div className="mt-8 flex flex-row">
          <label className="text-md mr-3 font-semibold text-gray-50">
            Stage Functions:
          </label>
          <div className="mt-1 flex flex-col">
            {props.taskDefinition.stagePresets.map((stage, i) => (
              <div key={i} className="flex flex-row pr-1">
                <p className="mt-1 text-sm text-gray-50">{`${i}. `}</p>
                <p className="ml-2 mt-1 text-sm text-gray-200">{stage}</p>
              </div>
            ))}
          </div>
        </div>

        {/* success */}
        <div className="mb-6 mt-10 flex w-full flex-row align-middle">
          <label
            htmlFor="successField"
            className="text-md my-auto font-semibold text-gray-50"
          >
            Success:
          </label>
          <select
            id="successField"
            className="my-auto ml-4 max-w-lg rounded bg-slate-500 p-2 text-white drop-shadow-md hover:cursor-pointer"
            value={
              userSuccess == null ? "null" : userSuccess ? "true" : "false"
            }
            onChange={(e) => {
              if (e.target.value == "true") setUserSuccess(true);
              else if (e.target.value == "false") setUserSuccess(false);
              else setUserSuccess(null);
            }}
          >
            <option key={"success_true"} value="true">
              TRUE
            </option>
            <option key={"success_false"} value="false">
              FALSE
            </option>
            <option key={"success_null"} value="null">
              NULL
            </option>
          </select>
          {userSuccess !== props.success && (
            <SaveFieldBtn isSaving={props.isSaving} saveFn={saveEditedFields} />
          )}
        </div>

        {/* lastEndedStage */}
        <div className="mb-2 mt-8 flex w-full flex-row align-middle">
          <label
            htmlFor="lastEndedStageField"
            className="text-md my-auto font-semibold text-gray-50"
          >
            Last Ended Stage:
          </label>
          <select
            id="lastEndedStageField"
            className="my-auto ml-4 max-w-lg rounded bg-slate-500 p-2 text-white drop-shadow-md hover:cursor-pointer"
            value={userLastEndedStage}
            onChange={(e) => {
              setUserLastEndedStage(Number(e.target.value));
            }}
          >
            {[
              -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17,
              18, 19, 20, 21, 22, 23,
            ].map((stageIdx) => (
              <option key={stageIdx} value={stageIdx}>
                {stageIdx}
              </option>
            ))}
          </select>
          {userLastEndedStage != props.lastEndedStage && (
            <SaveFieldBtn isSaving={props.isSaving} saveFn={saveEditedFields} />
          )}
        </div>
        <div className="mb-7 mt-3 flex flex-row align-middle">
          <div className="mr-2">
            <InfoIcon className="h-4 w-4 text-cyan-300" />
          </div>
          <p className="text-sm text-orange-50">
            {
              "You could cause the task to fail if you skip stages \
                without adding the Stage Data which they would have generated."
            }
          </p>
        </div>

        {/* paused */}
        <div className="mt-5 flex flex-row align-middle">
          <label className="text-md my-auto mr-3 font-semibold text-gray-50">
            Paused:
          </label>
          <p className="my-auto mr-2 text-sm text-gray-200">
            {props.paused ? "TRUE" : "FALSE"}
          </p>
        </div>

        {/* dead */}
        <div className="mt-5 flex flex-row align-middle">
          <label className="text-md my-auto mr-3 font-semibold text-gray-50">
            Dead:
          </label>
          <p className="my-auto mr-2 text-sm text-gray-200">
            {props.dead ? "TRUE" : "FALSE"}
          </p>
        </div>

        {/* isAbstract */}
        <div className="mt-5 flex flex-row align-middle">
          <label className="text-md my-auto mr-3 font-semibold text-gray-50">
            Is Abstract:
          </label>
          <p className="my-auto mr-2 text-sm text-gray-200">
            {props.isAbstract ? "TRUE" : "FALSE"}
          </p>
        </div>

        {/* taskID */}
        <div className="mt-5 flex flex-row align-middle">
          <label className="text-md my-auto mr-3 font-semibold text-gray-50">
            Task ID:
          </label>
          <p className="my-auto mr-2 text-sm text-gray-200">{`#${
            props.taskID || -1
          }`}</p>
        </div>

        {/* parentID */}
        <div className="mt-5 flex flex-row align-middle">
          <label className="text-md my-auto mr-3 font-semibold text-gray-50">
            Parent ID:
          </label>
          <p className="my-auto mr-2 text-sm text-gray-200">
            {props.parentID ? `#${props.parentID}` : "NULL"}
          </p>
        </div>

        {/* lastInteractionMarker */}
        <div className="mt-5 flex flex-row align-middle">
          <label className="text-md my-auto mr-3 font-semibold text-gray-50">
            Last Interaction Marker:
          </label>
          <p className="my-auto mr-2 text-sm text-gray-200">
            {props.lastInteractionMarker || "NULL"}
          </p>
        </div>

        {/* timeCreated */}
        <div className="mt-5 flex flex-row align-middle">
          <label className="text-md my-auto mr-3 font-semibold text-gray-50">
            Date Created:
          </label>
          <p className="my-auto mr-2 text-sm text-gray-200">
            {props.timeCreated.toDateString()}
          </p>
        </div>

        {/* timeLastUpdated */}
        <div className="mt-5 flex flex-row align-middle">
          <label className="text-md my-auto mr-3 font-semibold text-gray-50">
            Date Last Updated:
          </label>
          <p className="my-auto mr-2 text-sm text-gray-200">
            {props.timeLastUpdated.toDateString()}
          </p>
        </div>

        {/* stage0Data */}
        {props.stage0Data == null ? (
          <LoadStageButton
            N={0}
            loadFn={props.loadStage0}
            isLoading={props.isLoadingStage0}
          />
        ) : (
          <StringOrJsonInputArea
            label="Stage 0 Data"
            typeLabel='{"fields": JSON Object}'
            defaultFieldHeight="h-44"
            isSaving={props.isSaving}
            dbValue={props.stage0Data}
            localValue={userStage0Data ?? ""}
            setLocalValue={setUserStage0Data}
            saveFn={saveEditedFields}
            formatStringFn={formatStageDataField}
            isEdited={
              userStage0Data != props.stage0Data &&
              (userStage0Data?.trim().length ?? 0) > 0
            }
            isInvalid={isStageDataInvalid}
          />
        )}

        {/* stage1Data */}
        {props.stage1Data == null ? (
          <LoadStageButton
            N={1}
            loadFn={props.loadStage1}
            isLoading={props.isLoadingStage1}
          />
        ) : (
          <StringOrJsonInputArea
            label="Stage 1 Data"
            typeLabel='{"fields": JSON Object}'
            defaultFieldHeight="h-44"
            isSaving={props.isSaving}
            dbValue={props.stage1Data}
            localValue={userStage1Data ?? ""}
            setLocalValue={setUserStage1Data}
            saveFn={saveEditedFields}
            formatStringFn={formatStageDataField}
            isEdited={
              userStage1Data != props.stage1Data &&
              (userStage1Data?.trim().length ?? 0) > 0
            }
            isInvalid={isStageDataInvalid}
          />
        )}

        {/* stage2Data */}
        {props.stage2Data == null ? (
          <LoadStageButton
            N={2}
            loadFn={props.loadStage2}
            isLoading={props.isLoadingStage2}
          />
        ) : (
          <StringOrJsonInputArea
            label="Stage 2 Data"
            typeLabel='{"fields": JSON Object}'
            defaultFieldHeight="h-44"
            isSaving={props.isSaving}
            dbValue={props.stage2Data}
            localValue={userStage2Data ?? ""}
            setLocalValue={setUserStage2Data}
            saveFn={saveEditedFields}
            formatStringFn={formatStageDataField}
            isEdited={
              userStage2Data != props.stage2Data &&
              (userStage2Data?.trim().length ?? 0) > 0
            }
            isInvalid={isStageDataInvalid}
          />
        )}

        {/* stage3Data */}
        {props.stage3Data == null ? (
          <LoadStageButton
            N={3}
            loadFn={props.loadStage3}
            isLoading={props.isLoadingStage3}
          />
        ) : (
          <StringOrJsonInputArea
            label="Stage 3 Data"
            typeLabel='{"fields": JSON Object}'
            defaultFieldHeight="h-44"
            isSaving={props.isSaving}
            dbValue={props.stage3Data}
            localValue={userStage3Data ?? ""}
            setLocalValue={setUserStage3Data}
            saveFn={saveEditedFields}
            formatStringFn={formatStageDataField}
            isEdited={
              userStage3Data != props.stage3Data &&
              (userStage3Data?.trim().length ?? 0) > 0
            }
            isInvalid={isStageDataInvalid}
          />
        )}

        {/* stage4Data */}
        {props.stage4Data == null ? (
          <LoadStageButton
            N={4}
            loadFn={props.loadStage4}
            isLoading={props.isLoadingStage4}
          />
        ) : (
          <StringOrJsonInputArea
            label="Stage 4 Data"
            typeLabel='{"fields": JSON Object}'
            defaultFieldHeight="h-44"
            isSaving={props.isSaving}
            dbValue={props.stage4Data}
            localValue={userStage4Data ?? ""}
            setLocalValue={setUserStage4Data}
            saveFn={saveEditedFields}
            formatStringFn={formatStageDataField}
            isEdited={
              userStage4Data != props.stage4Data &&
              (userStage4Data?.trim().length ?? 0) > 0
            }
            isInvalid={isStageDataInvalid}
          />
        )}

        {/* stage5Data */}
        {props.stage5Data == null ? (
          <LoadStageButton
            N={5}
            loadFn={props.loadStage5}
            isLoading={props.isLoadingStage5}
          />
        ) : (
          <StringOrJsonInputArea
            label="Stage 5 Data"
            typeLabel='{"fields": JSON Object}'
            defaultFieldHeight="h-44"
            isSaving={props.isSaving}
            dbValue={props.stage5Data}
            localValue={userStage5Data ?? ""}
            setLocalValue={setUserStage5Data}
            saveFn={saveEditedFields}
            formatStringFn={formatStageDataField}
            isEdited={
              userStage5Data != props.stage5Data &&
              (userStage5Data?.trim().length ?? 0) > 0
            }
            isInvalid={isStageDataInvalid}
          />
        )}

        {/* stage6Data */}
        {props.stage6Data == null ? (
          <LoadStageButton
            N={6}
            loadFn={props.loadStage6}
            isLoading={props.isLoadingStage6}
          />
        ) : (
          <StringOrJsonInputArea
            label="Stage 6 Data"
            typeLabel='{"fields": JSON Object}'
            defaultFieldHeight="h-44"
            isSaving={props.isSaving}
            dbValue={props.stage6Data}
            localValue={userStage6Data ?? ""}
            setLocalValue={setUserStage6Data}
            saveFn={saveEditedFields}
            formatStringFn={formatStageDataField}
            isEdited={
              userStage6Data != props.stage6Data &&
              (userStage6Data?.trim().length ?? 0) > 0
            }
            isInvalid={isStageDataInvalid}
          />
        )}

        {/* stage7Data */}
        {props.stage7Data == null ? (
          <LoadStageButton
            N={7}
            loadFn={props.loadStage7}
            isLoading={props.isLoadingStage7}
          />
        ) : (
          <StringOrJsonInputArea
            label="Stage 7 Data"
            typeLabel='{"fields": JSON Object}'
            defaultFieldHeight="h-44"
            isSaving={props.isSaving}
            dbValue={props.stage7Data}
            localValue={userStage7Data ?? ""}
            setLocalValue={setUserStage7Data}
            saveFn={saveEditedFields}
            formatStringFn={formatStageDataField}
            isEdited={
              userStage7Data != props.stage7Data &&
              (userStage7Data?.trim().length ?? 0) > 0
            }
            isInvalid={isStageDataInvalid}
          />
        )}

        {/* stage8Data */}
        {props.stage8Data == null ? (
          <LoadStageButton
            N={8}
            loadFn={props.loadStage8}
            isLoading={props.isLoadingStage8}
          />
        ) : (
          <StringOrJsonInputArea
            label="Stage 8 Data"
            typeLabel='{"fields": JSON Object}'
            defaultFieldHeight="h-44"
            isSaving={props.isSaving}
            dbValue={props.stage8Data}
            localValue={userStage8Data ?? ""}
            setLocalValue={setUserStage8Data}
            saveFn={saveEditedFields}
            formatStringFn={formatStageDataField}
            isEdited={
              userStage8Data != props.stage8Data &&
              (userStage8Data?.trim().length ?? 0) > 0
            }
            isInvalid={isStageDataInvalid}
          />
        )}

        {/* stage9Data */}
        {props.stage9Data == null ? (
          <LoadStageButton
            N={9}
            loadFn={props.loadStage9}
            isLoading={props.isLoadingStage9}
          />
        ) : (
          <StringOrJsonInputArea
            label="Stage 9 Data"
            typeLabel='{"fields": JSON Object}'
            defaultFieldHeight="h-44"
            isSaving={props.isSaving}
            dbValue={props.stage9Data}
            localValue={userStage9Data ?? ""}
            setLocalValue={setUserStage9Data}
            saveFn={saveEditedFields}
            formatStringFn={formatStageDataField}
            isEdited={
              userStage9Data != props.stage9Data &&
              (userStage9Data?.trim().length ?? 0) > 0
            }
            isInvalid={isStageDataInvalid}
          />
        )}

        {/* stage10Data */}
        {props.stage10Data == null ? (
          <LoadStageButton
            N={10}
            loadFn={props.loadStage10}
            isLoading={props.isLoadingStage10}
          />
        ) : (
          <StringOrJsonInputArea
            label="Stage 10 Data"
            typeLabel='{"fields": JSON Object}'
            defaultFieldHeight="h-44"
            isSaving={props.isSaving}
            dbValue={props.stage10Data}
            localValue={userStage10Data ?? ""}
            setLocalValue={setUserStage10Data}
            saveFn={saveEditedFields}
            formatStringFn={formatStageDataField}
            isEdited={
              userStage10Data != props.stage10Data &&
              (userStage10Data?.trim().length ?? 0) > 0
            }
            isInvalid={isStageDataInvalid}
          />
        )}
        {/* stage11Data */}
        {props.stage11Data == null ? (
          <LoadStageButton
            N={11}
            loadFn={props.loadStage11}
            isLoading={props.isLoadingStage11}
          />
        ) : (
          <StringOrJsonInputArea
            label="Stage 11 Data"
            typeLabel='{"fields": JSON Object}'
            defaultFieldHeight="h-44"
            isSaving={props.isSaving}
            dbValue={props.stage11Data}
            localValue={userStage11Data ?? ""}
            setLocalValue={setUserStage11Data}
            saveFn={saveEditedFields}
            formatStringFn={formatStageDataField}
            isEdited={
              userStage11Data != props.stage11Data &&
              (userStage11Data?.trim().length ?? 0) > 0
            }
            isInvalid={isStageDataInvalid}
          />
        )}

        {/* stage12Data */}
        {props.stage12Data == null ? (
          <LoadStageButton
            N={12}
            loadFn={props.loadStage12}
            isLoading={props.isLoadingStage12}
          />
        ) : (
          <StringOrJsonInputArea
            label="Stage 12 Data"
            typeLabel='{"fields": JSON Object}'
            defaultFieldHeight="h-44"
            isSaving={props.isSaving}
            dbValue={props.stage12Data}
            localValue={userStage12Data ?? ""}
            setLocalValue={setUserStage12Data}
            saveFn={saveEditedFields}
            formatStringFn={formatStageDataField}
            isEdited={
              userStage12Data != props.stage12Data &&
              (userStage12Data?.trim().length ?? 0) > 0
            }
            isInvalid={isStageDataInvalid}
          />
        )}

        {/* stage13Data */}
        {props.stage13Data == null ? (
          <LoadStageButton
            N={13}
            loadFn={props.loadStage13}
            isLoading={props.isLoadingStage13}
          />
        ) : (
          <StringOrJsonInputArea
            label="Stage 13 Data"
            typeLabel='{"fields": JSON Object}'
            defaultFieldHeight="h-44"
            isSaving={props.isSaving}
            dbValue={props.stage13Data}
            localValue={userStage13Data ?? ""}
            setLocalValue={setUserStage13Data}
            saveFn={saveEditedFields}
            formatStringFn={formatStageDataField}
            isEdited={
              userStage13Data != props.stage13Data &&
              (userStage13Data?.trim().length ?? 0) > 0
            }
            isInvalid={isStageDataInvalid}
          />
        )}

        {/* stage14Data */}
        {props.stage14Data == null ? (
          <LoadStageButton
            N={14}
            loadFn={props.loadStage14}
            isLoading={props.isLoadingStage14}
          />
        ) : (
          <StringOrJsonInputArea
            label="Stage 14 Data"
            typeLabel='{"fields": JSON Object}'
            defaultFieldHeight="h-44"
            isSaving={props.isSaving}
            dbValue={props.stage14Data}
            localValue={userStage14Data ?? ""}
            setLocalValue={setUserStage14Data}
            saveFn={saveEditedFields}
            formatStringFn={formatStageDataField}
            isEdited={
              userStage14Data != props.stage14Data &&
              (userStage14Data?.trim().length ?? 0) > 0
            }
            isInvalid={isStageDataInvalid}
          />
        )}

        {/* stage15Data */}
        {props.stage15Data == null ? (
          <LoadStageButton
            N={15}
            loadFn={props.loadStage15}
            isLoading={props.isLoadingStage15}
          />
        ) : (
          <StringOrJsonInputArea
            label="Stage 15 Data"
            typeLabel='{"fields": JSON Object}'
            defaultFieldHeight="h-44"
            isSaving={props.isSaving}
            dbValue={props.stage15Data}
            localValue={userStage15Data ?? ""}
            setLocalValue={setUserStage15Data}
            saveFn={saveEditedFields}
            formatStringFn={formatStageDataField}
            isEdited={
              userStage15Data != props.stage15Data &&
              (userStage15Data?.trim().length ?? 0) > 0
            }
            isInvalid={isStageDataInvalid}
          />
        )}

        {/* Stage 16 */}
        {props.stage16Data == null ? (
          <LoadStageButton
            N={16}
            loadFn={props.loadStage16}
            isLoading={props.isLoadingStage16}
          />
        ) : (
          <StringOrJsonInputArea
            label="Stage 16 Data"
            typeLabel='{"fields": JSON Object}'
            defaultFieldHeight="h-44"
            isSaving={props.isSaving}
            dbValue={props.stage16Data}
            localValue={userStage16Data ?? ""}
            setLocalValue={setUserStage16Data}
            saveFn={saveEditedFields}
            formatStringFn={formatStageDataField}
            isEdited={
              userStage16Data != props.stage16Data &&
              (userStage16Data?.trim().length ?? 0) > 0
            }
            isInvalid={isStageDataInvalid}
          />
        )}

        {/* Stage 17 */}
        {props.stage17Data == null ? (
          <LoadStageButton
            N={17}
            loadFn={props.loadStage17}
            isLoading={props.isLoadingStage17}
          />
        ) : (
          <StringOrJsonInputArea
            label="Stage 17 Data"
            typeLabel='{"fields": JSON Object}'
            defaultFieldHeight="h-44"
            isSaving={props.isSaving}
            dbValue={props.stage17Data}
            localValue={userStage17Data ?? ""}
            setLocalValue={setUserStage17Data}
            saveFn={saveEditedFields}
            formatStringFn={formatStageDataField}
            isEdited={
              userStage17Data != props.stage17Data &&
              (userStage17Data?.trim().length ?? 0) > 0
            }
            isInvalid={isStageDataInvalid}
          />
        )}

        {/* Stage 18 */}
        {props.stage18Data == null ? (
          <LoadStageButton
            N={18}
            loadFn={props.loadStage18}
            isLoading={props.isLoadingStage18}
          />
        ) : (
          <StringOrJsonInputArea
            label="Stage 18 Data"
            typeLabel='{"fields": JSON Object}'
            defaultFieldHeight="h-44"
            isSaving={props.isSaving}
            dbValue={props.stage18Data}
            localValue={userStage18Data ?? ""}
            setLocalValue={setUserStage18Data}
            saveFn={saveEditedFields}
            formatStringFn={formatStageDataField}
            isEdited={
              userStage18Data != props.stage18Data &&
              (userStage18Data?.trim().length ?? 0) > 0
            }
            isInvalid={isStageDataInvalid}
          />
        )}

        {/* Stage 19 */}
        {props.stage19Data == null ? (
          <LoadStageButton
            N={19}
            loadFn={props.loadStage19}
            isLoading={props.isLoadingStage19}
          />
        ) : (
          <StringOrJsonInputArea
            label="Stage 19 Data"
            typeLabel='{"fields": JSON Object}'
            defaultFieldHeight="h-44"
            isSaving={props.isSaving}
            dbValue={props.stage19Data}
            localValue={userStage19Data ?? ""}
            setLocalValue={setUserStage19Data}
            saveFn={saveEditedFields}
            formatStringFn={formatStageDataField}
            isEdited={
              userStage19Data != props.stage19Data &&
              (userStage19Data?.trim().length ?? 0) > 0
            }
            isInvalid={isStageDataInvalid}
          />
        )}

        {/* Stage 20 */}
        {props.stage20Data == null ? (
          <LoadStageButton
            N={20}
            loadFn={props.loadStage20}
            isLoading={props.isLoadingStage20}
          />
        ) : (
          <StringOrJsonInputArea
            label="Stage 20 Data"
            typeLabel='{"fields": JSON Object}'
            defaultFieldHeight="h-44"
            isSaving={props.isSaving}
            dbValue={props.stage20Data}
            localValue={userStage20Data ?? ""}
            setLocalValue={setUserStage20Data}
            saveFn={saveEditedFields}
            formatStringFn={formatStageDataField}
            isEdited={
              userStage20Data != props.stage20Data &&
              (userStage20Data?.trim().length ?? 0) > 0
            }
            isInvalid={isStageDataInvalid}
          />
        )}

        {/* Stage 21 */}
        {props.stage21Data == null ? (
          <LoadStageButton
            N={21}
            loadFn={props.loadStage21}
            isLoading={props.isLoadingStage21}
          />
        ) : (
          <StringOrJsonInputArea
            label="Stage 21 Data"
            typeLabel='{"fields": JSON Object}'
            defaultFieldHeight="h-44"
            isSaving={props.isSaving}
            dbValue={props.stage21Data}
            localValue={userStage21Data ?? ""}
            setLocalValue={setUserStage21Data}
            saveFn={saveEditedFields}
            formatStringFn={formatStageDataField}
            isEdited={
              userStage21Data != props.stage21Data &&
              (userStage21Data?.trim().length ?? 0) > 0
            }
            isInvalid={isStageDataInvalid}
          />
        )}

        {/* Stage 22 */}
        {props.stage22Data == null ? (
          <LoadStageButton
            N={22}
            loadFn={props.loadStage22}
            isLoading={props.isLoadingStage22}
          />
        ) : (
          <StringOrJsonInputArea
            label="Stage 22 Data"
            typeLabel='{"fields": JSON Object}'
            defaultFieldHeight="h-44"
            isSaving={props.isSaving}
            dbValue={props.stage22Data}
            localValue={userStage22Data ?? ""}
            setLocalValue={setUserStage22Data}
            saveFn={saveEditedFields}
            formatStringFn={formatStageDataField}
            isEdited={
              userStage22Data != props.stage22Data &&
              (userStage22Data?.trim().length ?? 0) > 0
            }
            isInvalid={isStageDataInvalid}
          />
        )}

        {/* Stage 23 */}
        {props.stage23Data == null ? (
          <LoadStageButton
            N={23}
            loadFn={props.loadStage23}
            isLoading={props.isLoadingStage23}
          />
        ) : (
          <StringOrJsonInputArea
            label="Stage 23 Data"
            typeLabel='{"fields": JSON Object}'
            defaultFieldHeight="h-44"
            isSaving={props.isSaving}
            dbValue={props.stage23Data}
            localValue={userStage23Data ?? ""}
            setLocalValue={setUserStage23Data}
            saveFn={saveEditedFields}
            formatStringFn={formatStageDataField}
            isEdited={
              userStage23Data != props.stage23Data &&
              (userStage23Data?.trim().length ?? 0) > 0
            }
            isInvalid={isStageDataInvalid}
          />
        )}
      </div>
    </div>
  );
};
