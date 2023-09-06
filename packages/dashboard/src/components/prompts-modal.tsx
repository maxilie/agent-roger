import { TRAINING_DATA_TAGS, getNumTokens, schema } from "agent-roger-core";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  InfoIcon,
  Loader2,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "~/utils/api";
import { Button } from "./ui/button";

const batchSize = 30;

export const DATA_BANKS = [
  "Select a Data Bank",
  "task-prompt-history",
  "prompt-injections",
  ...TRAINING_DATA_TAGS,
] as const;

const formatDateHrMin = (date: Date): string => {
  const hoursStr =
    date.getHours() > 12 ? date.getHours() - 12 : date.getHours();
  const amOrPm = date.getHours() >= 12 ? "PM" : "AM";
  return `${hoursStr}:${
    String(date.getMinutes()).length == 1
      ? "0" + String(date.getMinutes())
      : date.getMinutes()
  } ${amOrPm}`;
};

const formatTimeElapsed = (date: Date): string => {
  const secsApart = (new Date().getTime() - date.getTime()) / 1000.0;
  if (secsApart < 60) {
    return `${Math.floor(secsApart)} secs ago`;
  } else if (secsApart < 60 * 60) {
    return `${Math.floor(secsApart / 60.0)} mins ago`;
  } else if (secsApart < 60 * 60 * 24) {
    return `${(secsApart / 3600.0).toFixed(1)} hrs ago`;
  } else {
    return `${(secsApart / (60 * 60 * 24)).toFixed(1)} days ago`;
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

const DataPointField = (props: {
  label: string;
  isSaving: boolean;
  initialValue: string;
  localValue: string;
  setLocalValue: (val: string) => void;
  saveFn: () => Promise<void>;
  editable: boolean;
  setIsUserEditing: (val: boolean) => void;
}) => {
  const [prevInitialValue, setPrevInitialValue] = useState("");
  const [originalValue, setOriginalValue] = useState(props.initialValue);
  const [isJsonContent, setIsJsonContent] = useState(false);
  const [editedValue, setEditedValue] = useState(props.initialValue);
  useEffect(() => {
    if (props.initialValue == prevInitialValue) return;
    setPrevInitialValue(props.initialValue);
    setOriginalValue(props.initialValue);
    setEditedValue(props.initialValue);
    props.setLocalValue(props.initialValue);
    if (
      props.initialValue.trim().length < 2 ||
      isJsonInvalid(props.initialValue)
    ) {
      setIsJsonContent(false);
      return;
    }
    setIsJsonContent(true);
    try {
      const jsonContent = schema.jsonObj.parse(JSON.parse(props.initialValue));
      const rawStr = JSON.stringify(jsonContent);
      const prettyStr = JSON.stringify(jsonContent, null, 2);
      setEditedValue(prettyStr);
      setOriginalValue(rawStr);
      props.setLocalValue(rawStr);
    } catch (_) {}
  }, [prevInitialValue, props, props.initialValue]);
  const isNowInvalid = useMemo(() => {
    return isJsonContent && isJsonInvalid(props.localValue);
  }, [isJsonContent, props.localValue]);
  const isEdited = useMemo(() => {
    return originalValue !== props.localValue;
  }, [originalValue, props.localValue]);
  return (
    <div className="mt-8">
      <div className="mb-3 flex justify-between">
        <div className="my-auto flex w-7/12 flex-col justify-around">
          <label className="text-md block select-none text-gray-300">
            {props.label}
          </label>
        </div>
        {props.editable && isEdited && !isNowInvalid && (
          <SaveFieldBtn isSaving={props.isSaving} saveFn={props.saveFn} />
        )}
        {props.editable && isEdited && isNowInvalid && (
          <div className="my-auto ml-auto mr-2 flex">
            <AlertCircle className="h-6 w-6 text-red-400" />
            <p className="text-md ml-2 select-none font-serif font-semibold text-yellow-50">
              Invalid JSON
            </p>
          </div>
        )}
        {(!props.editable || !isEdited) && <div className="h-9" />}
      </div>
      <textarea
        className={
          "ml-3 h-80 w-full resize-y rounded bg-slate-600 p-2 text-white drop-shadow-sm"
        }
        value={editedValue}
        onChange={(e) => setEditedValue(e.target.value)}
        onFocus={() => props.setIsUserEditing(true)}
        onBlur={(e) => {
          props.setIsUserEditing(false);
          if (isJsonContent) {
            try {
              const jsonContent = schema.jsonObj.parse(
                JSON.parse(e.target.value)
              );
              const prettyStr = JSON.stringify(jsonContent, null, 2);
              const rawStr = JSON.stringify(jsonContent);
              props.setLocalValue(rawStr);
              setEditedValue(prettyStr);
            } catch (_) {
              props.setLocalValue(e.target.value);
            }
          } else {
            props.setLocalValue(e.target.value);
          }
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
      className="text-md my-auto ml-auto select-none font-mono text-emerald-900"
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

export const PromptsModal = (props: {
  setShowingPromptsModal: (val: boolean) => void;
  selectedDataBank: (typeof DATA_BANKS)[number];
  selectDataBankFn: (dataBank: string) => void;
  selectedHistoricalPromptsTaskID: number | null;
  setSelectedHistoricalPromptsTaskID: (taskID: number | null) => void;
}) => {
  // state vars
  const [selectedQualityFilter, setSelectedQualityFilter] = useState(1);
  const [selectedTrainingDataID, setSelectedTrainingDataID] = useState<
    number | null
  >(null);
  const [selectedInjectedPromptID, setSelectedInjectedPromptID] = useState<
    number | null
  >(null);
  const [selectedHistoricalPromptID, setSelectedHistoricalPromptID] = useState<
    number | null
  >(null);
  const [batchTrainingDataStartID, setBatchTrainingDataStartID] = useState<
    number | null
  >(null);
  const [batchTrainingDataEndID, setBatchTrainingDataEndID] = useState<
    number | null
  >(null);
  const [batchInjectedPromptsStartID, setBatchInjectedPromptsStartID] =
    useState<number | null>(null);
  const [batchInjectedPromptsEndID, setBatchInjectedPromptsEndID] = useState<
    number | null
  >(null);
  const [batchHistoricalPromptsStartTime, setBatchHistoricalPromptsStartTime] =
    useState<Date | null>(null);
  const [batchHistoricalPromptsEndTime, setBatchHistoricalPromptsEndTime] =
    useState<Date | null>(null);
  const [batchRecentTasksStartTime, setBatchRecentTasksStartTime] =
    useState<Date | null>(null);
  const [batchRecentTasksEndTime, setBatchRecentTasksEndTime] =
    useState<Date | null>(null);
  const [prevSelectedDataBank, setPrevSelectedDataBank] = useState(
    props.selectedDataBank
  );
  const [isUserEditing, setIsUserEditing] = useState(false);
  const [wasPromptHistoryRecentlyDeleted, setWasPromptHistoryRecentlyDeleted] =
    useState(false);
  const [dataStr0, setDataStr0] = useState("");
  const [dataStr1, setDataStr1] = useState("");
  const [dataStr2, setDataStr2] = useState("");
  const [dataStr3, setDataStr3] = useState("");
  const [dataStr4, setDataStr4] = useState("");
  const [dataStr5, setDataStr5] = useState("");
  const [dataStr6, setDataStr6] = useState("");
  const [dataStr7, setDataStr7] = useState("");
  const [initDataStr0, setInitDataStr0] = useState("");
  const [initDataStr1, setInitDataStr1] = useState("");
  const [initDataStr2, setInitDataStr2] = useState("");
  const [initDataStr3, setInitDataStr3] = useState("");
  const [initDataStr4, setInitDataStr4] = useState("");
  const [initDataStr5, setInitDataStr5] = useState("");
  const [initDataStr6, setInitDataStr6] = useState("");
  const [initDataStr7, setInitDataStr7] = useState("");

  // reset batch selection when data bank changes
  useEffect(() => {
    if (prevSelectedDataBank == props.selectedDataBank) {
      return;
    }
    setSelectedQualityFilter(1);
    setSelectedTrainingDataID(null);
    setSelectedHistoricalPromptID(null);
    setBatchTrainingDataStartID(null);
    setBatchTrainingDataEndID(null);
    setBatchInjectedPromptsStartID(null);
    setBatchInjectedPromptsEndID(null);
    setBatchHistoricalPromptsStartTime(null);
    setBatchHistoricalPromptsEndTime(null);
    setBatchRecentTasksStartTime(null);
    setBatchRecentTasksEndTime(null);
    if (props.selectedDataBank != "task-prompt-history") {
      props.setSelectedHistoricalPromptsTaskID(null);
    }
    setPrevSelectedDataBank(props.selectedDataBank);
  }, [props.selectedDataBank, props, prevSelectedDataBank]);

  // reset data point selection when quality filter changes
  useEffect(() => {
    setSelectedTrainingDataID(null);
    setDataStr0("");
    setDataStr1("");
    setDataStr2("");
    setDataStr3("");
    setDataStr4("");
    setDataStr5("");
    setDataStr6("");
    setDataStr7("");
    setInitDataStr0("");
    setInitDataStr1("");
    setInitDataStr2("");
    setInitDataStr3("");
    setInitDataStr4("");
    setInitDataStr5("");
    setInitDataStr6("");
    setInitDataStr7("");
  }, [selectedQualityFilter]);

  // reset data point selection when selected historical prompt changes
  useEffect(() => {
    setSelectedHistoricalPromptID(null);
    setDataStr0("");
    setDataStr1("");
    setDataStr2("");
    setDataStr3("");
    setDataStr4("");
    setDataStr5("");
    setDataStr6("");
    setDataStr7("");
    setInitDataStr0("");
    setInitDataStr1("");
    setInitDataStr2("");
    setInitDataStr3("");
    setInitDataStr4("");
    setInitDataStr5("");
    setInitDataStr6("");
    setInitDataStr7("");
  }, [props.selectedHistoricalPromptsTaskID]);

  // load batch of training data ids
  const {
    isLoading: isLoadingBatchTrainingDataIDs,
    data: batchTrainingDataIDs,
  } = api.tasks.getBatchTrainingDataIDs.useQuery({
    N: batchSize + 1,
    qualityRating: selectedQualityFilter,
    categoryTag: props.selectedDataBank,
    ...(batchTrainingDataStartID !== null && {
      startID: batchTrainingDataStartID,
    }),
    ...(batchTrainingDataEndID !== null && {
      endID: batchTrainingDataEndID,
    }),
  });
  const trainingDataIDsToDisplay = useMemo(() => {
    if (!batchTrainingDataIDs) {
      return [];
    }
    if (batchTrainingDataEndID != null) {
      return [...batchTrainingDataIDs].slice(0, batchSize).reverse();
    }
    return batchTrainingDataIDs.slice(0, batchSize);
  }, [batchTrainingDataEndID, batchTrainingDataIDs]);

  // load batch of injected prompt ids
  const {
    isLoading: isLoadingBatchInjectedPromptIDs,
    data: batchInjectedPromptIDs,
  } = api.tasks.getBatchInjectedPromptIDs.useQuery({
    N: batchSize + 1,
    ...(batchInjectedPromptsStartID !== null && {
      startID: batchInjectedPromptsStartID,
    }),
    ...(batchInjectedPromptsEndID !== null && {
      endID: batchInjectedPromptsEndID,
    }),
  });
  const injectedPromptIDsToDisplay = useMemo(() => {
    if (!batchInjectedPromptIDs) {
      return [];
    }
    if (batchInjectedPromptsEndID != null) {
      return [...batchInjectedPromptIDs].slice(0, batchSize).reverse();
    }
    return batchInjectedPromptIDs.slice(0, batchSize);
  }, [batchInjectedPromptIDs, batchInjectedPromptsEndID]);

  // load batch of historical prompt ids
  const {
    isLoading: isLoadingBatchHistoricalPromptIDs,
    data: batchHistoricalPromptIDs,
  } = api.tasks.getBatchHistoricalAiCallIDs.useQuery({
    N: batchSize + 1,
    taskID: props.selectedHistoricalPromptsTaskID || 0,
    ...(batchHistoricalPromptsStartTime !== null && {
      startTime: batchHistoricalPromptsStartTime,
    }),
    ...(batchHistoricalPromptsEndTime !== null && {
      endTime: batchHistoricalPromptsEndTime,
    }),
  });
  const historicalPromptIDsToDisplay = useMemo(() => {
    if (!batchHistoricalPromptIDs) {
      return [];
    }
    if (batchHistoricalPromptsStartTime != null) {
      return [...batchHistoricalPromptIDs].slice(0, batchSize).reverse();
    }
    return batchHistoricalPromptIDs.slice(0, batchSize);
  }, [batchHistoricalPromptIDs, batchHistoricalPromptsStartTime]);

  // load batch of recent task ids
  const { isLoading: isLoadingBatchRecentTaskIDs, data: batchRecentTaskIDs } =
    api.tasks.getBatchRecentTaskIDs.useQuery({
      N: batchSize + 1,
      ...(batchRecentTasksStartTime !== null && {
        startTime: batchRecentTasksStartTime,
      }),
      ...(batchRecentTasksEndTime !== null && {
        endTime: batchRecentTasksEndTime,
      }),
    });
  // add externally selected task id to recent task ids
  const taskIDsToDisplay = useMemo(() => {
    if (
      batchRecentTaskIDs &&
      batchRecentTaskIDs.find(
        (task) => task.taskID === props.selectedHistoricalPromptsTaskID
      ) !== undefined
    ) {
      if (batchRecentTasksStartTime != null) {
        return [...batchRecentTaskIDs].reverse().slice(0, batchSize);
      }
      return batchRecentTaskIDs.slice(0, batchSize);
    }
    if (props.selectedHistoricalPromptsTaskID != null) {
      const loadedItemsToDisplay =
        batchRecentTasksStartTime != null
          ? [...(batchRecentTaskIDs ?? [])].reverse().slice(0, batchSize)
          : batchRecentTaskIDs ?? [];
      return [
        {
          taskID: props.selectedHistoricalPromptsTaskID,
          timeLastUpdated: new Date(),
        },
        ...loadedItemsToDisplay,
      ];
    } else {
      if (batchRecentTasksStartTime != null) {
        return [...(batchRecentTaskIDs ?? [])].reverse().slice(0, batchSize);
      }
      return batchRecentTaskIDs ?? [];
    }
  }, [
    batchRecentTaskIDs,
    batchRecentTasksStartTime,
    props.selectedHistoricalPromptsTaskID,
  ]);

  // load historical prompt data
  const { isLoading: isLoadingHistoricalPrompt, data: historicalPrompt } =
    api.tasks.getHistoricalAiCall.useQuery({
      id: selectedHistoricalPromptID,
    });

  // load training data point
  const { isLoading: isLoadingTrainingDataExample, data: trainingDataExample } =
    api.tasks.getTrainingData.useQuery({
      id: selectedTrainingDataID,
    });

  // load injected prompt data
  const { isLoading: isLoadingInjectedPrompt, data: injectedPrompt } =
    api.tasks.getInjectedPrompt.useQuery({
      id: selectedInjectedPromptID,
    });

  // format data for display
  const prettyBatchHistoricalPrompts: { id: number; timeStr: string }[] = [];
  let lastTimeStr = batchHistoricalPromptIDs?.length
    ? formatDateHrMin(
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        new Date(batchHistoricalPromptIDs[0]!.timestamp.getTime() + 60000)
      )
    : formatDateHrMin(new Date());
  let duplicatesInMinute = 0;
  [...historicalPromptIDsToDisplay].reverse().forEach((data) => {
    const timeStr = formatDateHrMin(data.timestamp);
    if (timeStr != lastTimeStr) {
      lastTimeStr = timeStr;
      duplicatesInMinute = 0;
    } else {
      duplicatesInMinute++;
    }
    let prettyTimeStr = timeStr;
    if (duplicatesInMinute) {
      prettyTimeStr =
        (prettyTimeStr.split(" ")[0] || "") +
        `.${duplicatesInMinute} ` +
        (prettyTimeStr.split(" ")[1] || "");
    }
    if (data.isUserMsgJson) {
      prettyTimeStr += " (injectable)";
    }
    prettyBatchHistoricalPrompts.push({ id: data.id, timeStr: prettyTimeStr });
  });
  prettyBatchHistoricalPrompts.reverse();

  // auto-select first item in selected batch
  useEffect(() => {
    if (props.selectedDataBank == "Select a Data Bank") {
      return;
    } else if (props.selectedDataBank == "task-prompt-history") {
      if (
        props.selectedHistoricalPromptsTaskID == null &&
        taskIDsToDisplay[0] != undefined
      ) {
        props.setSelectedHistoricalPromptsTaskID(taskIDsToDisplay[0].taskID);
      }
      if (
        selectedHistoricalPromptID == null &&
        historicalPromptIDsToDisplay[0] != undefined
      ) {
        setSelectedHistoricalPromptID(historicalPromptIDsToDisplay[0].id);
      }
    } else if (props.selectedDataBank == "prompt-injections") {
      if (
        selectedInjectedPromptID == null &&
        injectedPromptIDsToDisplay[0] != undefined
      ) {
        setSelectedInjectedPromptID(injectedPromptIDsToDisplay[0]);
      }
    } else {
      if (
        selectedTrainingDataID == null &&
        trainingDataIDsToDisplay[0] != undefined
      ) {
        setSelectedTrainingDataID(trainingDataIDsToDisplay[0]);
      }
    }
  }, [
    batchTrainingDataIDs,
    batchInjectedPromptIDs,
    batchHistoricalPromptIDs,
    batchRecentTaskIDs,
    props,
    taskIDsToDisplay,
    selectedHistoricalPromptID,
    historicalPromptIDsToDisplay,
    selectedInjectedPromptID,
    injectedPromptIDsToDisplay,
    selectedTrainingDataID,
    trainingDataIDsToDisplay,
  ]);

  // populate data point fields
  useEffect(() => {
    if (trainingDataExample && selectedTrainingDataID != null) {
      if (props.selectedDataBank == "training-pair-1x") {
        setDataStr0(trainingDataExample.inputMessages[0] ?? "");
        setDataStr1(trainingDataExample.outputMessage ?? "");
        setInitDataStr0(trainingDataExample.inputMessages[0] ?? "");
        setInitDataStr1(trainingDataExample.outputMessage ?? "");
        return;
      } else if (props.selectedDataBank == "training-pair-2x") {
        setDataStr0(trainingDataExample.inputMessages[0] ?? "");
        setDataStr1(trainingDataExample.inputMessages[1] ?? "");
        setDataStr2(trainingDataExample.inputMessages[2] ?? "");
        setDataStr3(trainingDataExample.outputMessage ?? "");
        setInitDataStr0(trainingDataExample.inputMessages[0] ?? "");
        setInitDataStr1(trainingDataExample.inputMessages[1] ?? "");
        setInitDataStr2(trainingDataExample.inputMessages[2] ?? "");
        setInitDataStr3(trainingDataExample.outputMessage ?? "");
        return;
      } else if (props.selectedDataBank == "training-pair-3x") {
        setDataStr0(trainingDataExample.inputMessages[0] ?? "");
        setDataStr1(trainingDataExample.inputMessages[1] ?? "");
        setDataStr2(trainingDataExample.inputMessages[2] ?? "");
        setDataStr3(trainingDataExample.inputMessages[3] ?? "");
        setDataStr4(trainingDataExample.inputMessages[4] ?? "");
        setDataStr5(trainingDataExample.outputMessage ?? "");
        setInitDataStr0(trainingDataExample.inputMessages[0] ?? "");
        setInitDataStr1(trainingDataExample.inputMessages[1] ?? "");
        setInitDataStr2(trainingDataExample.inputMessages[2] ?? "");
        setInitDataStr3(trainingDataExample.inputMessages[3] ?? "");
        setInitDataStr4(trainingDataExample.inputMessages[4] ?? "");
        setInitDataStr5(trainingDataExample.outputMessage ?? "");
        return;
      } else if (props.selectedDataBank == "training-pair-4x") {
        setDataStr0(trainingDataExample.inputMessages[0] ?? "");
        setDataStr1(trainingDataExample.inputMessages[1] ?? "");
        setDataStr2(trainingDataExample.inputMessages[2] ?? "");
        setDataStr3(trainingDataExample.inputMessages[3] ?? "");
        setDataStr4(trainingDataExample.inputMessages[4] ?? "");
        setDataStr5(trainingDataExample.inputMessages[5] ?? "");
        setDataStr6(trainingDataExample.inputMessages[6] ?? "");
        setDataStr7(trainingDataExample.outputMessage ?? "");
        setInitDataStr0(trainingDataExample.inputMessages[0] ?? "");
        setInitDataStr1(trainingDataExample.inputMessages[1] ?? "");
        setInitDataStr2(trainingDataExample.inputMessages[2] ?? "");
        setInitDataStr3(trainingDataExample.inputMessages[3] ?? "");
        setInitDataStr4(trainingDataExample.inputMessages[4] ?? "");
        setInitDataStr5(trainingDataExample.inputMessages[5] ?? "");
        setInitDataStr6(trainingDataExample.inputMessages[6] ?? "");
        setInitDataStr7(trainingDataExample.outputMessage ?? "");
        return;
      }
    } else if (historicalPrompt && selectedHistoricalPromptID != null) {
      setDataStr0(historicalPrompt.systemMessage);
      setDataStr1(historicalPrompt.userMessage);
      setDataStr2(historicalPrompt.assistantMessage);
      setInitDataStr0(historicalPrompt.systemMessage);
      setInitDataStr1(historicalPrompt.userMessage);
      setInitDataStr2(historicalPrompt.assistantMessage);
      return;
    } else if (injectedPrompt && selectedInjectedPromptID != null) {
      setDataStr0(injectedPrompt.userMessage);
      setDataStr1(injectedPrompt.assistantMessage);
      setInitDataStr0(injectedPrompt.userMessage);
      setInitDataStr1(injectedPrompt.assistantMessage);
      return;
    }
    setDataStr0("");
    setDataStr1("");
    setDataStr2("");
    setDataStr3("");
    setDataStr4("");
    setDataStr5("");
    setDataStr6("");
    setDataStr7("");
    setInitDataStr0("");
    setInitDataStr1("");
    setInitDataStr2("");
    setInitDataStr3("");
    setInitDataStr4("");
    setInitDataStr5("");
    setInitDataStr6("");
    setInitDataStr7("");
  }, [
    historicalPrompt,
    injectedPrompt,
    props.selectedDataBank,
    selectedHistoricalPromptID,
    selectedInjectedPromptID,
    selectedTrainingDataID,
    trainingDataExample,
  ]);

  // calculate whether we are at the beginning or end of a batch
  const isFirstTrainingDataIdBatch = useMemo(() => {
    if (batchTrainingDataStartID != null) {
      return false;
    }
    if (
      batchTrainingDataEndID != null &&
      batchTrainingDataIDs &&
      batchTrainingDataIDs.length > batchSize
    ) {
      return false;
    }
    return true;
  }, [batchTrainingDataEndID, batchTrainingDataIDs, batchTrainingDataStartID]);
  const isLastTrainingDataIdBatch = useMemo(() => {
    if (batchTrainingDataEndID != null) {
      return false;
    }
    if (
      batchTrainingDataStartID != null ||
      (batchTrainingDataStartID == null && batchTrainingDataEndID == null)
    ) {
      if (batchTrainingDataIDs && batchTrainingDataIDs.length > batchSize) {
        return false;
      }
    }
    return true;
  }, [batchTrainingDataEndID, batchTrainingDataIDs, batchTrainingDataStartID]);
  const isFirstInjectedPromptIdBatch = useMemo(() => {
    if (batchInjectedPromptsStartID != null) {
      return false;
    }
    if (
      batchInjectedPromptsEndID != null &&
      batchInjectedPromptIDs &&
      batchInjectedPromptIDs.length > batchSize
    ) {
      return false;
    }
    return true;
  }, [
    batchInjectedPromptIDs,
    batchInjectedPromptsEndID,
    batchInjectedPromptsStartID,
  ]);
  const isLastInjectedPromptIdBatch = useMemo(() => {
    if (batchInjectedPromptsEndID != null) {
      return false;
    }
    if (
      batchInjectedPromptsStartID != null ||
      (batchInjectedPromptsStartID == null && batchInjectedPromptsEndID == null)
    ) {
      if (batchInjectedPromptIDs && batchInjectedPromptIDs.length > batchSize) {
        return false;
      }
    }
    return true;
  }, [
    batchInjectedPromptIDs,
    batchInjectedPromptsEndID,
    batchInjectedPromptsStartID,
  ]);
  const isFirstRecentTaskIdBatch = useMemo(() => {
    if (
      batchRecentTasksEndTime ||
      (!batchRecentTasksStartTime && !batchRecentTasksEndTime)
    ) {
      if (batchRecentTaskIDs && batchRecentTaskIDs.length <= batchSize) {
        return true;
      }
    }
    return false;
  }, [batchRecentTaskIDs, batchRecentTasksEndTime, batchRecentTasksStartTime]);
  const isLastRecentTaskIdBatch = useMemo(() => {
    if (batchRecentTasksEndTime) {
      return false;
    }
    if (
      batchRecentTasksStartTime &&
      batchRecentTaskIDs &&
      batchRecentTaskIDs.length > batchSize
    ) {
      return false;
    }
    return true;
  }, [batchRecentTaskIDs, batchRecentTasksEndTime, batchRecentTasksStartTime]);
  const isFirstHistoricalAiCallIdBatch = useMemo(() => {
    if (
      batchHistoricalPromptsEndTime ||
      (!batchHistoricalPromptsStartTime && !batchHistoricalPromptsEndTime)
    ) {
      if (
        batchHistoricalPromptIDs &&
        batchHistoricalPromptIDs.length <= batchSize
      ) {
        return true;
      }
    }
    return false;
  }, [
    batchHistoricalPromptIDs,
    batchHistoricalPromptsEndTime,
    batchHistoricalPromptsStartTime,
  ]);
  const isLastHistoricalAiCallIdBatch = useMemo(() => {
    if (batchHistoricalPromptsEndTime) {
      return false;
    }
    if (
      batchHistoricalPromptsStartTime &&
      batchHistoricalPromptIDs &&
      batchHistoricalPromptIDs.length > batchSize
    ) {
      return false;
    }
    return true;
  }, [
    batchHistoricalPromptIDs,
    batchHistoricalPromptsEndTime,
    batchHistoricalPromptsStartTime,
  ]);

  // determine if there is a previous item
  const isPreviousItemAvailable = useMemo(() => {
    if (props.selectedDataBank == "Select a Data Bank") return false;
    else if (props.selectedDataBank == "task-prompt-history") {
      if (
        selectedHistoricalPromptID != null &&
        historicalPromptIDsToDisplay.length &&
        historicalPromptIDsToDisplay[0]?.id != selectedHistoricalPromptID
      ) {
        return true;
      }
      return false;
    } else if (props.selectedDataBank == "prompt-injections") {
      if (
        selectedInjectedPromptID != null &&
        injectedPromptIDsToDisplay.length &&
        injectedPromptIDsToDisplay[0] != selectedInjectedPromptID
      ) {
        return true;
      }
      return false;
    } else {
      if (
        selectedTrainingDataID != null &&
        trainingDataIDsToDisplay.length &&
        trainingDataIDsToDisplay[0] != selectedTrainingDataID
      ) {
        return true;
      }
      return false;
    }
  }, [
    historicalPromptIDsToDisplay,
    injectedPromptIDsToDisplay,
    props.selectedDataBank,
    selectedHistoricalPromptID,
    selectedInjectedPromptID,
    selectedTrainingDataID,
    trainingDataIDsToDisplay,
  ]);

  // determine if there is a next item
  const isNextItemAvailable = useMemo(() => {
    if (props.selectedDataBank == "Select a Data Bank") return false;
    else if (props.selectedDataBank == "task-prompt-history") {
      if (
        selectedHistoricalPromptID != null &&
        historicalPromptIDsToDisplay.length &&
        historicalPromptIDsToDisplay.at(-1)?.id != selectedHistoricalPromptID
      ) {
        return true;
      }
      return false;
    } else if (props.selectedDataBank == "prompt-injections") {
      if (
        selectedInjectedPromptID != null &&
        injectedPromptIDsToDisplay.length &&
        injectedPromptIDsToDisplay.at(-1) != selectedInjectedPromptID
      ) {
        return true;
      }
      return false;
    } else {
      if (
        selectedTrainingDataID != null &&
        trainingDataIDsToDisplay.length &&
        trainingDataIDsToDisplay.at(-1) != selectedTrainingDataID
      ) {
        return true;
      }
      return false;
    }
  }, [
    historicalPromptIDsToDisplay,
    injectedPromptIDsToDisplay,
    props.selectedDataBank,
    selectedHistoricalPromptID,
    selectedInjectedPromptID,
    selectedTrainingDataID,
    trainingDataIDsToDisplay,
  ]);

  // function to select previous/next batch of historical prompt ids
  const navigateBatchHistoricalPromptIDs = useCallback(
    (isSelectingNext: boolean) => {
      if (isSelectingNext) {
        const newestElem = historicalPromptIDsToDisplay.at(0);
        if (newestElem == undefined) return;
        setBatchHistoricalPromptsEndTime(null);
        setBatchHistoricalPromptsStartTime(
          new Date(newestElem.timestamp.getTime() + 1)
        );
        setSelectedHistoricalPromptID(null);
      } else {
        const oldestElem = historicalPromptIDsToDisplay.at(-1);
        if (oldestElem == undefined) return;
        setBatchHistoricalPromptsStartTime(null);
        setBatchHistoricalPromptsEndTime(
          new Date(oldestElem.timestamp.getTime() - 1)
        );
        setSelectedHistoricalPromptID(null);
      }
    },
    [historicalPromptIDsToDisplay]
  );

  // function to select previous/next batch of recent task ids
  const navigateBatchRecentTaskIDs = useCallback(
    (isSelectingNext: boolean) => {
      if (isSelectingNext) {
        const newestElem = taskIDsToDisplay.at(0);
        if (newestElem == undefined) return;
        props.setSelectedHistoricalPromptsTaskID(null);
        setBatchRecentTasksEndTime(null);
        setBatchRecentTasksStartTime(
          new Date(newestElem.timeLastUpdated.getTime() + 100)
        );
      } else {
        const oldestElem = taskIDsToDisplay.at(-1);
        if (oldestElem == undefined) return;
        props.setSelectedHistoricalPromptsTaskID(null);
        setBatchRecentTasksStartTime(null);
        setBatchRecentTasksEndTime(
          new Date(oldestElem.timeLastUpdated.getTime() - 1)
        );
      }
    },
    [props, taskIDsToDisplay]
  );

  // function to select previous/next batch of injected prompt ids
  const navigateBatchInjectedPromptIDs = useCallback(
    (isSelectingNext: boolean) => {
      if (isSelectingNext) {
        const newestID = injectedPromptIDsToDisplay.at(-1);
        if (newestID == undefined) return;
        setBatchInjectedPromptsEndID(null);
        setBatchInjectedPromptsStartID(newestID + 1);
        setSelectedInjectedPromptID(null);
      } else {
        const oldestID = injectedPromptIDsToDisplay.at(0);
        if (oldestID == undefined) return;
        setBatchInjectedPromptsStartID(null);
        setBatchInjectedPromptsEndID(oldestID - 1);
        setSelectedInjectedPromptID(null);
      }
    },
    [injectedPromptIDsToDisplay]
  );

  // function to select previous/next batch of training data ids
  const navigateBatchTrainingDataIDs = useCallback(
    (isSelectingNext: boolean) => {
      if (isSelectingNext) {
        const newestID = trainingDataIDsToDisplay.at(-1);
        if (newestID == undefined) return;
        setSelectedTrainingDataID(null);
        setBatchTrainingDataEndID(null);
        setBatchTrainingDataStartID(newestID + 1);
      } else {
        const oldestID = trainingDataIDsToDisplay.at(0);
        if (oldestID == undefined) return;
        setSelectedTrainingDataID(null);
        setBatchTrainingDataStartID(null);
        setBatchTrainingDataEndID(oldestID - 1);
      }
    },
    [trainingDataIDsToDisplay]
  );

  // function to select previous/next data point
  const navigateDataPoint = useCallback(
    (isSelectingNext: boolean) => {
      setSelectedTrainingDataID(null);
      setSelectedHistoricalPromptID(null);
      setSelectedInjectedPromptID(null);
      setDataStr0("");
      setDataStr1("");
      setDataStr2("");
      setDataStr3("");
      setDataStr4("");
      setDataStr5("");
      setDataStr6("");
      setDataStr7("");
      setInitDataStr0("");
      setInitDataStr1("");
      setInitDataStr2("");
      setInitDataStr3("");
      setInitDataStr4("");
      setInitDataStr5("");
      setInitDataStr6("");
      setInitDataStr7("");
      try {
        if (props.selectedDataBank == "Select a Data Bank") return;
        else if (props.selectedDataBank == "task-prompt-history") {
          let curIdx = -1;
          for (let i = 0; i < historicalPromptIDsToDisplay.length; i++) {
            if (
              historicalPromptIDsToDisplay[i]?.id == selectedHistoricalPromptID
            ) {
              curIdx = i;
              break;
            }
          }
          const prevItemID =
            historicalPromptIDsToDisplay[curIdx + (isSelectingNext ? 1 : -1)]
              ?.id;
          setSelectedHistoricalPromptID(prevItemID as number);
        } else if (props.selectedDataBank == "prompt-injections") {
          const curIdx = injectedPromptIDsToDisplay.indexOf(
            selectedInjectedPromptID as number
          );
          const prevItemID =
            injectedPromptIDsToDisplay[curIdx + (isSelectingNext ? 1 : -1)];
          setSelectedInjectedPromptID(prevItemID as number);
        } else {
          const curIdx = trainingDataIDsToDisplay.indexOf(
            selectedTrainingDataID as number
          );
          const prevItemID =
            trainingDataIDsToDisplay[curIdx + (isSelectingNext ? 1 : -1)];
          setSelectedTrainingDataID(prevItemID as number);
        }
      } catch (_) {}
    },
    [
      historicalPromptIDsToDisplay,
      injectedPromptIDsToDisplay,
      props.selectedDataBank,
      selectedHistoricalPromptID,
      selectedInjectedPromptID,
      selectedTrainingDataID,
      trainingDataIDsToDisplay,
    ]
  );

  // decide whether to show the loading spinner
  const isLoadingPromptsData =
    isLoadingBatchTrainingDataIDs ||
    isLoadingBatchHistoricalPromptIDs ||
    isLoadingBatchInjectedPromptIDs ||
    isLoadingBatchRecentTaskIDs ||
    isLoadingHistoricalPrompt ||
    isLoadingInjectedPrompt ||
    isLoadingTrainingDataExample;

  // functions to save data
  const trpcUtils = api.useContext();
  const saveTrainingDataPoint = api.tasks.saveTrainingData.useMutation({
    async onSuccess() {
      //   await trpcUtils.tasks.getBatchTrainingDataIDs.invalidate();
      await trpcUtils.tasks.getTrainingData.invalidate();
    },
  });
  const saveInjectedPromptDataPoint = api.tasks.saveInjectedPrompt.useMutation({
    async onSuccess() {
      await trpcUtils.tasks.getInjectedPrompt.invalidate();
    },
  });
  const saveDataPoint = async (newQualityRating?: number) => {
    if (props.selectedDataBank == "prompt-injections") {
      if (!injectedPrompt || selectedInjectedPromptID == null) return;
      await saveInjectedPromptDataPoint.mutateAsync({
        id: selectedInjectedPromptID,
        userMessage: dataStr0,
        assistantMessage: dataStr1,
        numTokens: getNumTokens([dataStr0, dataStr1]),
      });
    } else if (props.selectedDataBank.startsWith("training-pair-")) {
      if (!trainingDataExample || selectedTrainingDataID == null) return;
      const inputMessages = [];
      let outputMessage = "";
      const numInputMessages = trainingDataExample.inputMessages.length;
      if (numInputMessages > 0) inputMessages.push(dataStr0);
      if (numInputMessages > 1) inputMessages.push(dataStr1);
      if (numInputMessages > 2) inputMessages.push(dataStr2);
      if (numInputMessages > 3) inputMessages.push(dataStr3);
      if (numInputMessages > 4) inputMessages.push(dataStr4);
      if (numInputMessages > 5) inputMessages.push(dataStr5);
      if (numInputMessages > 6) inputMessages.push(dataStr6);
      if (numInputMessages == 1) outputMessage = dataStr1;
      if (numInputMessages == 3) outputMessage = dataStr3;
      if (numInputMessages == 5) outputMessage = dataStr5;
      if (numInputMessages == 7) outputMessage = dataStr7;
      if (newQualityRating == undefined) {
        newQualityRating = trainingDataExample.qualityRating;
      }
      await saveTrainingDataPoint.mutateAsync({
        id: selectedTrainingDataID,
        categoryTag: props.selectedDataBank,
        qualityRating: newQualityRating,
        inputMessages,
        outputMessage,
      });
    }
  };

  // function to delete a task's prompt history
  const deleteTaskPromptsHistoryMutation =
    api.tasks.deleteTaskPromptHistory.useMutation({
      async onSuccess() {
        await trpcUtils.tasks.getBatchHistoricalAiCallIDs.invalidate();
        await trpcUtils.tasks.getHistoricalAiCall.invalidate();
      },
    });
  const deleteTaskPromptsHistory = async () => {
    await deleteTaskPromptsHistoryMutation.mutateAsync({
      secondsAgo: 60 * 60 * 24,
    });
    setWasPromptHistoryRecentlyDeleted(true);
    setTimeout(() => {
      setWasPromptHistoryRecentlyDeleted(false);
    }, 60000);
  };

  // functions to delete a data point
  const deleteInjectedPromptMutation =
    api.tasks.deleteInjectedPrompt.useMutation({
      async onSuccess() {
        await trpcUtils.tasks.getInjectedPrompt.invalidate();
        await trpcUtils.tasks.getBatchInjectedPromptIDs.invalidate();
      },
    });
  const deleteTrainingDataMutation =
    api.tasks.deleteTrainingDataExample.useMutation({
      async onSuccess() {
        await trpcUtils.tasks.getTrainingData.invalidate();
        await trpcUtils.tasks.getBatchTrainingDataIDs.invalidate();
      },
    });
  const deleteDataPoint = useCallback(async () => {
    if (props.selectedDataBank.startsWith("training-pair-")) {
      let nextID: number | null = null;
      if (isPreviousItemAvailable) {
        nextID =
          trainingDataIDsToDisplay[
            trainingDataIDsToDisplay.indexOf(selectedTrainingDataID as number) -
              1
          ] ?? null;
      } else if (isNextItemAvailable) {
        nextID =
          trainingDataIDsToDisplay[
            trainingDataIDsToDisplay.indexOf(selectedTrainingDataID as number) +
              1
          ] ?? null;
      }
      await deleteTrainingDataMutation.mutateAsync({
        id: selectedTrainingDataID ?? -1,
      });
      setSelectedTrainingDataID(nextID);
    } else if (props.selectedDataBank == "prompt-injections") {
      let nextID: number | null = null;
      if (isPreviousItemAvailable) {
        nextID =
          injectedPromptIDsToDisplay[
            injectedPromptIDsToDisplay.indexOf(
              selectedInjectedPromptID as number
            ) - 1
          ] ?? null;
      } else if (isNextItemAvailable) {
        nextID =
          injectedPromptIDsToDisplay[
            injectedPromptIDsToDisplay.indexOf(
              selectedInjectedPromptID as number
            ) + 1
          ] ?? null;
      }
      await deleteInjectedPromptMutation.mutateAsync({
        id: selectedInjectedPromptID ?? -1,
      });
      setSelectedInjectedPromptID(nextID);
    }
  }, [
    deleteInjectedPromptMutation,
    deleteTrainingDataMutation,
    injectedPromptIDsToDisplay,
    isNextItemAvailable,
    isPreviousItemAvailable,
    props.selectedDataBank,
    selectedInjectedPromptID,
    selectedTrainingDataID,
    trainingDataIDsToDisplay,
  ]);

  // determine whether a data point is being saved
  const isSavingDataPoint =
    saveTrainingDataPoint.isLoading || saveInjectedPromptDataPoint.isLoading;

  // determine whether the selected data point is already saved in prompt-injections
  const inferredNewUserMessage = useMemo(() => {
    return props.selectedDataBank == "training-pair-1x" && trainingDataExample
      ? dataStr0 // training data example (no system message)
      : dataStr1; // historical prompt (has a system message)
  }, [dataStr0, dataStr1, props.selectedDataBank, trainingDataExample]);
  const inferredNewAssistantMessage = useMemo(() => {
    return props.selectedDataBank == "training-pair-1x" && trainingDataExample
      ? dataStr1 // training data example (no system message)
      : dataStr2; // historical prompt (has a system message)
  }, [dataStr1, dataStr2, props.selectedDataBank, trainingDataExample]);
  const { data: isPresentInPromptInjections } =
    api.tasks.isInjectedPromptPresent.useQuery({
      userMessage: inferredNewUserMessage,
      assistantMessage: inferredNewAssistantMessage,
    });

  // determine whether the selected data point is already saved in training-pair-1x
  const inferredNewInputMessages = useMemo(() => {
    return props.selectedDataBank == "prompt-injections" && injectedPrompt
      ? [dataStr0] // prompt injection (no system message)
      : historicalPrompt?.userMessage
      ? [dataStr1] // historical prompt (has a system message)
      : null;
  }, [
    dataStr0,
    dataStr1,
    historicalPrompt?.userMessage,
    injectedPrompt,
    props.selectedDataBank,
  ]);
  const inferredNewOutputMessage = useMemo(() => {
    return props.selectedDataBank == "prompt-injections" && injectedPrompt
      ? dataStr1 // prompt injection (no system message)
      : dataStr2 ?? null; // historical prompt (has a system message)
  }, [dataStr1, dataStr2, injectedPrompt, props.selectedDataBank]);
  const { data: isPresentInTrainingPair1x } =
    api.tasks.isTrainingDataExamplePresent.useQuery({
      categoryTag: "training-pair-1x",
      inputMessages: inferredNewInputMessages,
      outputMessage: inferredNewOutputMessage,
    });

  // determine what buttons to show
  const showBtnAddToPromptInjections =
    (props.selectedDataBank == "task-prompt-history" &&
      selectedHistoricalPromptID &&
      historicalPrompt?.isUserMsgJson === false) ||
    (props.selectedDataBank == "training-pair-1x" && selectedTrainingDataID);
  const showBtnAddToTrainingData =
    (props.selectedDataBank == "task-prompt-history" &&
      selectedHistoricalPromptID) ||
    (props.selectedDataBank == "prompt-injections" && selectedInjectedPromptID);

  // function to add data point to prompt-injections
  const createPromptInjectionMutation =
    api.tasks.saveInjectedPrompt.useMutation({
      async onSuccess() {
        await trpcUtils.tasks.getHistoricalAiCall.invalidate();
        await trpcUtils.tasks.getTrainingData.invalidate();
        await trpcUtils.tasks.isInjectedPromptPresent.invalidate();
        await trpcUtils.tasks.getBatchInjectedPromptIDs.invalidate();
      },
    });
  const addToPromptInjections = useCallback(async () => {
    if (!inferredNewUserMessage || !inferredNewAssistantMessage) return;
    const numTokens = getNumTokens([
      inferredNewUserMessage,
      inferredNewAssistantMessage,
    ]);
    await createPromptInjectionMutation.mutateAsync({
      userMessage: inferredNewUserMessage,
      assistantMessage: inferredNewAssistantMessage,
      numTokens,
    });
  }, [
    createPromptInjectionMutation,
    inferredNewAssistantMessage,
    inferredNewUserMessage,
  ]);

  // function to add data point to training-pair-1x
  const createTrainingDataExampleMutation =
    api.tasks.saveTrainingData.useMutation({
      async onSuccess() {
        await trpcUtils.tasks.getHistoricalAiCall.invalidate();
        await trpcUtils.tasks.getInjectedPrompt.invalidate();
        await trpcUtils.tasks.isTrainingDataExamplePresent.invalidate();
        await trpcUtils.tasks.getBatchTrainingDataIDs.invalidate();
      },
    });
  const addToTrainingPair1x = useCallback(async () => {
    if (!inferredNewInputMessages || !inferredNewOutputMessage) return;
    await createTrainingDataExampleMutation.mutateAsync({
      categoryTag: "training-pair-1x",
      qualityRating: 1,
      inputMessages: inferredNewInputMessages,
      outputMessage: inferredNewOutputMessage,
    });
  }, [
    createTrainingDataExampleMutation,
    inferredNewInputMessages,
    inferredNewOutputMessage,
  ]);

  // listen for left and right key presses
  useEffect(() => {
    const handleKeyPress = (event: { key: string }) => {
      if (isUserEditing) return;
      if (event.key === "ArrowRight") {
        if (isNextItemAvailable) navigateDataPoint(true);
      } else if (event.key === "ArrowLeft") {
        if (isPreviousItemAvailable) navigateDataPoint(false);
      }
    };
    window.addEventListener("keydown", handleKeyPress);
    return () => {
      window.removeEventListener("keydown", handleKeyPress);
    };
  }, [
    isNextItemAvailable,
    isPreviousItemAvailable,
    navigateDataPoint,
    isUserEditing,
  ]);

  return (
    <>
      {/* Gray-out area */}
      <button
        onClick={() => props.setShowingPromptsModal(false)}
        className="fixed inset-0 flex h-screen w-screen flex-col justify-center bg-slate-700/95"
      />
      {/* Container */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="fixed inset-0 m-auto flex flex-col overflow-hidden rounded-lg border-2 border-slate-900 bg-slate-900 shadow-lg shadow-zinc-800"
        style={{ width: "98%", height: "98%" }}
      >
        {/* Modal header */}
        <div className="z-10 flex h-14 w-full flex-row overflow-hidden bg-gray-900 shadow-lg">
          <button
            className="my-2 ml-2"
            onClick={() => props.setShowingPromptsModal(false)}
          >
            <XCircle
              className="h-8 w-8 text-zinc-200 hover:animate-pulse hover:text-slate-50"
              onClick={() => props.setShowingPromptsModal(false)}
            />
          </button>
          <h1 className="mx-auto my-auto select-none pr-10 text-2xl font-bold text-slate-300">
            Prompt Explorer
          </h1>
        </div>
        {/* Top area */}
        <div className="flex h-[calc(100%*4/17)] w-full flex-row space-x-4 overflow-hidden bg-slate-900">
          {/* Item selection area */}
          <div className="flex flex-1 flex-row space-x-6 rounded-b-lg bg-slate-800 p-4 align-middle shadow-md">
            {/* First column */}
            <div
              className="flex flex-shrink flex-grow flex-col"
              style={{ flexBasis: "calc(100%/3)" }}
            >
              {/* Data bank selection */}
              <label className="mb-1 mt-10 select-none text-sm text-gray-300">
                Data Bank
              </label>
              <div className="flex flex-col pl-1 pr-8">
                <select
                  className="mb-4 h-10 w-full select-none rounded bg-gray-700 p-1 text-white drop-shadow-md"
                  value={props.selectedDataBank}
                  onChange={(e) => props.selectDataBankFn(e.target.value)}
                >
                  {DATA_BANKS.map((dataBankName) => (
                    <option key={dataBankName} value={dataBankName}>
                      {dataBankName}
                    </option>
                  ))}
                </select>
              </div>
              {props.selectedDataBank == "task-prompt-history" &&
                !wasPromptHistoryRecentlyDeleted && (
                  <button
                    className="my-auto ml-1 select-none rounded-md bg-red-600 p-1 text-sm text-slate-50 shadow-sm hover:bg-red-500"
                    // eslint-disable-next-line @typescript-eslint/no-misused-promises
                    onClick={deleteTaskPromptsHistory}
                  >
                    {"Delete Prompts >24 hrs Old"}
                  </button>
                )}
            </div>
            {/* Second column */}
            {props.selectedDataBank == "Select a Data Bank" && (
              <div
                className="flex flex-shrink flex-grow flex-col"
                style={{ flexBasis: "calc(100%/3)" }}
              ></div>
            )}
            {/* Task ID selection */}
            {props.selectedDataBank == "task-prompt-history" && (
              <div
                className="flex flex-shrink flex-grow flex-col"
                style={{ flexBasis: "calc(100%/3)" }}
              >
                <div className="flex w-full flex-row justify-between space-x-2 pr-2">
                  {isFirstRecentTaskIdBatch ? (
                    <div className="h-10" />
                  ) : (
                    <button
                      onClick={() => navigateBatchRecentTaskIDs(false)}
                      className="mb-3 flex w-fit flex-row rounded-lg border-2  border-sky-300 bg-slate-600 p-1 px-2 align-middle text-sky-50 hover:border-sky-400 hover:text-white"
                    >
                      <ArrowLeft className="h-4 w-4 text-sky-300" />
                      <p className="ml-1 select-none font-sans text-xs">
                        Older
                      </p>
                    </button>
                  )}
                  {isLastRecentTaskIdBatch ? (
                    <div className="h-10" />
                  ) : (
                    <button
                      onClick={() => navigateBatchRecentTaskIDs(true)}
                      className="mb-3 flex w-fit flex-row rounded-lg border-2 border-sky-300 bg-slate-600 p-1 px-2 align-middle text-sky-50 hover:border-sky-400 hover:text-white"
                    >
                      <p className="mr-1 select-none font-sans text-xs text-sky-50">
                        Newer
                      </p>
                      <ArrowRight className="h-4 w-4 text-sky-300" />
                    </button>
                  )}
                </div>
                <label className="mb-1 select-none text-sm text-gray-300">
                  Task
                </label>
                <div className="flex flex-col pl-1 pr-8">
                  <select
                    className="mb-4 h-10 w-full rounded bg-gray-700 p-1 text-white drop-shadow-md"
                    value={String(props.selectedHistoricalPromptsTaskID)}
                    onChange={(e) =>
                      props.setSelectedHistoricalPromptsTaskID(+e.target.value)
                    }
                  >
                    {taskIDsToDisplay.map((data) => (
                      <option key={data.taskID} value={data.taskID}>
                        {`#${data.taskID} - ${formatTimeElapsed(
                          data.timeLastUpdated
                        )}`}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
            {/* Injected prompt selection */}
            {props.selectedDataBank == "prompt-injections" && (
              <div
                className="flex flex-shrink flex-grow flex-col"
                style={{ flexBasis: "calc(100%/3)" }}
              >
                <div className="flex w-full flex-row justify-between space-x-2 pr-2">
                  {isFirstInjectedPromptIdBatch ? (
                    <div className="h-10" />
                  ) : (
                    <button
                      onClick={() => navigateBatchInjectedPromptIDs(false)}
                      className="mb-3 flex w-fit flex-row rounded-lg border-2 border-sky-300 bg-slate-600 p-1 px-2 align-middle text-sky-50 hover:border-sky-400 hover:text-white"
                    >
                      <ArrowLeft className="h-4 w-4 text-sky-300" />
                      <p className="ml-1 select-none font-sans text-xs">
                        Older
                      </p>
                    </button>
                  )}
                  {isLastInjectedPromptIdBatch ? (
                    <div className="h-10" />
                  ) : (
                    <button
                      onClick={() => navigateBatchInjectedPromptIDs(true)}
                      className="mb-3 flex w-fit flex-row rounded-lg border-2 border-sky-300 bg-slate-600 p-1 px-2 align-middle text-sky-50 hover:border-sky-400 hover:text-white"
                    >
                      <p className="mr-1 select-none font-sans text-xs text-sky-50">
                        Newer
                      </p>
                      <ArrowRight className="h-4 w-4 text-sky-300" />
                    </button>
                  )}
                </div>
                <label className="mb-1 select-none text-sm text-gray-300">
                  Prompt to Inject
                </label>
                <div className="flex flex-col pl-1 pr-8">
                  <select
                    className="mb-4 h-10 w-full select-none rounded bg-gray-700 p-1 text-white drop-shadow-md"
                    value={String(selectedInjectedPromptID)}
                    onChange={(e) =>
                      setSelectedInjectedPromptID(+e.target.value)
                    }
                  >
                    {injectedPromptIDsToDisplay.map((id) => (
                      <option key={id} value={id}>
                        {`#${id}`}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
            {/* Training data quality selection */}
            {props.selectedDataBank.startsWith("training-pair") && (
              <div
                className="flex flex-shrink flex-grow flex-col"
                style={{ flexBasis: "calc(100%/3)" }}
              >
                <label className="mb-1 mt-10 select-none text-sm text-gray-300">
                  Data Quality
                </label>
                <div className="flex flex-col pl-1 pr-20">
                  <select
                    className="mb-4 h-10 select-none rounded bg-gray-700 p-1 text-white drop-shadow-md"
                    value={String(selectedQualityFilter)}
                    onChange={(e) => setSelectedQualityFilter(+e.target.value)}
                  >
                    {[0, 1, 2, 3, 4, 5].map((rating) => (
                      <option key={rating} value={rating}>
                        {`${rating} / 5`}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Third column */}
            {(props.selectedDataBank == "Select a Data Bank" ||
              props.selectedDataBank == "prompt-injections") && (
              <div
                className="flex flex-shrink flex-grow flex-col"
                style={{ flexBasis: "calc(100%/3)" }}
              ></div>
            )}
            {/* Task historical AI call selection */}
            {props.selectedDataBank == "task-prompt-history" && (
              <div
                className="flex flex-shrink flex-grow flex-col"
                style={{ flexBasis: "calc(100%/3)" }}
              >
                <div className="flex w-full flex-row justify-between space-x-2 pr-2">
                  {isFirstHistoricalAiCallIdBatch ? (
                    <div className="h-10" />
                  ) : (
                    <button
                      onClick={() => navigateBatchHistoricalPromptIDs(false)}
                      className="mb-3 flex w-fit flex-row rounded-lg border-2 border-sky-300 bg-slate-600 p-1 px-2 align-middle text-sky-50 hover:border-sky-400 hover:text-white"
                    >
                      <ArrowLeft className="h-4 w-4 text-sky-300" />
                      <p className="ml-1 select-none font-sans text-xs">
                        Older
                      </p>
                    </button>
                  )}
                  {isLastHistoricalAiCallIdBatch ? (
                    <div className="h-10" />
                  ) : (
                    <button
                      onClick={() => navigateBatchHistoricalPromptIDs(true)}
                      className="mb-3 flex w-fit flex-row rounded-lg border-2 border-sky-300 bg-slate-600 p-1 px-2 align-middle text-sky-50 hover:border-sky-400 hover:text-white"
                    >
                      <p className="mr-1 select-none font-sans text-xs text-sky-50">
                        Newer
                      </p>
                      <ArrowRight className="h-4 w-4 text-sky-300" />
                    </button>
                  )}
                </div>
                <label className="mb-1 select-none text-sm text-gray-300">
                  Prompt
                </label>
                <div className="flex flex-col pl-1 pr-8">
                  <select
                    className="mb-4 h-10 w-full select-none rounded bg-gray-700 p-1 text-white drop-shadow-md"
                    value={String(selectedHistoricalPromptID)}
                    onChange={(e) =>
                      setSelectedHistoricalPromptID(+e.target.value)
                    }
                  >
                    {prettyBatchHistoricalPrompts.map((data) => (
                      <option key={data.id} value={data.id}>
                        {data.timeStr}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
            {/* Training data example selection */}
            {props.selectedDataBank.startsWith("training-pair") && (
              <div
                className="flex flex-shrink flex-grow flex-col"
                style={{ flexBasis: "calc(100%/3)" }}
              >
                <div className="flex w-full flex-row justify-between space-x-2 pr-2">
                  {isFirstTrainingDataIdBatch ? (
                    <div className="h-10" />
                  ) : (
                    <button
                      onClick={() => navigateBatchTrainingDataIDs(false)}
                      className="mb-3 flex w-fit flex-row rounded-lg border-2 border-sky-300 bg-slate-600 p-1 px-2 align-middle text-sky-50 hover:border-sky-400 hover:text-white"
                    >
                      <ArrowLeft className="h-4 w-4 text-sky-300" />
                      <p className="ml-1 select-none font-sans text-xs">
                        Older
                      </p>
                    </button>
                  )}
                  {isLastTrainingDataIdBatch ? (
                    <div className="h-10" />
                  ) : (
                    <button
                      onClick={() => navigateBatchTrainingDataIDs(true)}
                      className="mb-3 flex w-fit flex-row rounded-lg border-2 border-sky-300 bg-slate-600 p-1 px-2 align-middle text-sky-50 hover:border-sky-400 hover:text-white"
                    >
                      <p className="mr-1 select-none font-sans text-xs text-sky-50">
                        Newer
                      </p>
                      <ArrowRight className="h-4 w-4 text-sky-300" />
                    </button>
                  )}
                </div>
                <label className="mb-1 select-none text-sm text-gray-300">
                  Data Point
                </label>
                <div className="flex flex-col pl-1 pr-20">
                  <select
                    className="mb-4 h-10 w-full select-none rounded bg-gray-700 p-1 text-white drop-shadow-md"
                    value={String(selectedTrainingDataID)}
                    onChange={(e) => setSelectedTrainingDataID(+e.target.value)}
                  >
                    {trainingDataIDsToDisplay.slice(0, batchSize).map((id) => (
                      <option key={id} value={id}>
                        {`#${id}`}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>
          {/* Item controls */}
          {selectedHistoricalPromptID == null &&
          selectedInjectedPromptID == null &&
          selectedTrainingDataID == null ? (
            <>
              <div className="w-4"></div>
              <div className="flex w-full flex-1" />
            </>
          ) : (
            <div className="flex w-full flex-1 flex-col rounded-b-lg bg-slate-800 px-4">
              <div className="flex-2 mt-3 flex w-full justify-center">
                <p className="select-none font-mono text-base font-bold text-slate-100">
                  Edit Data Point
                </p>
              </div>
              <div className="mt-4 flex w-full flex-1 flex-row">
                {/* "Add to prompt-injections" button */}
                {showBtnAddToPromptInjections && isPresentInPromptInjections ? (
                  <div className="flex w-1/2 flex-col align-middle">
                    <p className="text-md text-center text-sky-100 drop-shadow-lg">
                      Same Data Is Also In
                      <p className="font-semibold">prompt-injections</p>
                    </p>
                  </div>
                ) : showBtnAddToPromptInjections &&
                  !isPresentInPromptInjections ? (
                  <div className="flex w-1/2 flex-col align-middle">
                    <button
                      className="mx-auto select-none rounded-md bg-sky-600 px-3 py-1 shadow-sm hover:bg-sky-500"
                      // eslint-disable-next-line @typescript-eslint/no-misused-promises
                      onClick={addToPromptInjections}
                    >
                      Add to prompt-injections
                    </button>
                    <div className="mt-3 flex w-full flex-row align-top">
                      <div className="mr-2">
                        <InfoIcon className="h-5 w-5 text-sky-300" />
                      </div>
                      <p className="select-none text-left text-xs text-slate-300">
                        {
                          "Prompt injections are injected into AI requests that have similar input. \
They're used to demonstrate your desired AI output, without retraining the model."
                        }
                      </p>
                    </div>
                  </div>
                ) : props.selectedDataBank == "prompt-injections" &&
                  selectedInjectedPromptID ? (
                  <></>
                ) : (
                  <div className="flex w-1/2 flex-col align-middle" />
                )}
                {/* "Add to training-pair-1x" button */}
                {showBtnAddToTrainingData && isPresentInTrainingPair1x && (
                  <div className="flex w-1/2 flex-col align-middle">
                    <p className="text-md text-center text-sky-100 drop-shadow-lg">
                      Same Data Is Also In
                      <p className="font-semibold">training-pair-1x</p>
                    </p>
                  </div>
                )}
                {showBtnAddToTrainingData && !isPresentInTrainingPair1x && (
                  <div className="flex w-1/2 flex-col align-middle">
                    <button
                      className="mx-auto select-none rounded-md bg-sky-600 px-3 py-1 shadow-sm hover:bg-sky-500"
                      // eslint-disable-next-line @typescript-eslint/no-misused-promises
                      onClick={addToTrainingPair1x}
                    >
                      Add to training-pair-1x
                    </button>
                  </div>
                )}
                {/* "Delete" button */}
                {((props.selectedDataBank.startsWith("training-pair") &&
                  selectedTrainingDataID) ||
                  (props.selectedDataBank == "prompt-injections" &&
                    selectedInjectedPromptID)) && (
                  <div className="flex w-1/2 flex-col align-middle">
                    <button
                      className="mx-auto select-none rounded-md bg-red-600 px-3 py-1 shadow-sm hover:bg-red-500"
                      // eslint-disable-next-line @typescript-eslint/no-misused-promises
                      onClick={deleteDataPoint}
                    >
                      Delete Data Point
                    </button>
                  </div>
                )}
              </div>
              {/* "Rate data quality" button */}
              {props.selectedDataBank.startsWith("training-pair") &&
                selectedTrainingDataID && (
                  <div className="flex flex-1 flex-row justify-center">
                    <p className="my-auto mr-4 select-none text-lg font-semibold text-slate-200">
                      Data Quality:
                    </p>
                    {[0, 1, 2, 3, 4, 5].map((item, index) => (
                      <div
                        key={index}
                        className="mr-5 flex items-center justify-center"
                      >
                        <input
                          type="radio"
                          id={`quality_radio_${item}`}
                          name="qualityRating"
                          value={item}
                          className="hidden"
                          checked={trainingDataExample?.qualityRating === item}
                          // eslint-disable-next-line @typescript-eslint/no-misused-promises
                          onChange={async () => {
                            let newTrainingDataExampleID: number | null = null;
                            if (
                              trainingDataIDsToDisplay &&
                              trainingDataIDsToDisplay.length > 0
                            ) {
                              const prevIdx = trainingDataIDsToDisplay.indexOf(
                                selectedTrainingDataID
                              );
                              if (
                                prevIdx ==
                                trainingDataIDsToDisplay.length - 1
                              ) {
                                newTrainingDataExampleID =
                                  trainingDataIDsToDisplay[prevIdx - 1] ?? null;
                              } else {
                                newTrainingDataExampleID =
                                  trainingDataIDsToDisplay[prevIdx + 1] ?? null;
                              }
                            }
                            await saveDataPoint(item);
                            await trpcUtils.tasks.getBatchTrainingDataIDs.invalidate();
                            setSelectedTrainingDataID(newTrainingDataExampleID);
                          }}
                        />
                        <label
                          htmlFor={`quality_radio_${item}`}
                          className="text-md ml-2 flex cursor-pointer select-none items-center text-slate-200/70"
                        >
                          {`${item}`}
                          <span
                            className={`ml-2 inline-block h-5 w-5 rounded-full ${
                              selectedQualityFilter === item
                                ? "border-2 border-slate-600 bg-slate-400"
                                : "border-2 border-slate-500 bg-slate-800 hover:bg-slate-700"
                            }`}
                          ></span>
                        </label>
                      </div>
                    ))}
                  </div>
                )}
            </div>
          )}
        </div>
        {/* Main area */}
        {props.selectedDataBank == "Select a Data Bank" ? (
          <div className="h-[calc(100%*11/17) w-full] mt-auto flex"></div>
        ) : (
          <div className="z-20 mt-auto flex h-[calc(100%*11/17)] flex-row bg-slate-200">
            {/* Left arrow */}
            {isPreviousItemAvailable ? (
              <button
                disabled={isLoadingPromptsData}
                onClick={() => navigateDataPoint(false)}
                className={
                  "flex h-full w-12 items-center justify-center border-t-2 border-gray-800 bg-gray-900 text-slate-400" +
                  (!isLoadingPromptsData
                    ? " hover:animate-pulse hover:bg-slate-800 hover:text-slate-200"
                    : "")
                }
              >
                <ArrowLeft className="h-8 w-8" />
              </button>
            ) : (
              <div className="flex h-full w-12 bg-slate-900" />
            )}
            {/* Item data */}
            <div className=" z-10 flex h-full flex-grow flex-col bg-slate-800 px-1 shadow-sm shadow-slate-500">
              <p className="w-full select-none rounded-b-sm bg-slate-700 py-3 text-center font-mono text-xl font-semibold text-slate-300 shadow-lg shadow-slate-900/40">
                Data Point
              </p>
              {isLoadingPromptsData ? (
                <Loader2 className=" m-auto h-14 w-14 animate-spin text-sky-500" />
              ) : (
                <div className="h-full w-full overflow-scroll px-8 scrollbar-none">
                  {props.selectedDataBank == "task-prompt-history" &&
                    historicalPrompt && (
                      <div>
                        <DataPointField
                          label="System Message"
                          isSaving={isSavingDataPoint}
                          initialValue={initDataStr0}
                          localValue={dataStr0 ?? ""}
                          setLocalValue={setDataStr0}
                          saveFn={saveDataPoint}
                          editable={false}
                          setIsUserEditing={setIsUserEditing}
                        />
                        <DataPointField
                          label="User Message"
                          isSaving={isSavingDataPoint}
                          initialValue={initDataStr1}
                          localValue={dataStr1 ?? ""}
                          setLocalValue={setDataStr1}
                          saveFn={saveDataPoint}
                          editable={false}
                          setIsUserEditing={setIsUserEditing}
                        />
                        <DataPointField
                          label="Assistant Message"
                          isSaving={isSavingDataPoint}
                          initialValue={initDataStr2}
                          localValue={dataStr2 ?? ""}
                          setLocalValue={setDataStr2}
                          saveFn={saveDataPoint}
                          editable={false}
                          setIsUserEditing={setIsUserEditing}
                        />
                      </div>
                    )}
                  {props.selectedDataBank == "prompt-injections" &&
                    injectedPrompt && (
                      <div>
                        <DataPointField
                          label="User Message (AI Input)"
                          isSaving={isSavingDataPoint}
                          initialValue={initDataStr0}
                          localValue={dataStr0 ?? ""}
                          setLocalValue={setDataStr0}
                          saveFn={saveDataPoint}
                          editable={true}
                          setIsUserEditing={setIsUserEditing}
                        />
                        <DataPointField
                          label="Assistant Message (AI Output)"
                          isSaving={isSavingDataPoint}
                          initialValue={initDataStr1}
                          localValue={dataStr1 ?? ""}
                          setLocalValue={setDataStr1}
                          saveFn={saveDataPoint}
                          editable={true}
                          setIsUserEditing={setIsUserEditing}
                        />
                      </div>
                    )}
                  {props.selectedDataBank == "training-pair-1x" &&
                    trainingDataExample && (
                      <div>
                        <DataPointField
                          label="User Message (AI Input)"
                          isSaving={isSavingDataPoint}
                          initialValue={initDataStr0}
                          localValue={dataStr0 ?? ""}
                          setLocalValue={setDataStr0}
                          saveFn={saveDataPoint}
                          editable={true}
                          setIsUserEditing={setIsUserEditing}
                        />
                        <DataPointField
                          label="Assistant Message (AI Output)"
                          isSaving={isSavingDataPoint}
                          initialValue={initDataStr1}
                          localValue={dataStr1 ?? ""}
                          setLocalValue={setDataStr1}
                          saveFn={saveDataPoint}
                          editable={true}
                          setIsUserEditing={setIsUserEditing}
                        />
                      </div>
                    )}
                  {props.selectedDataBank == "training-pair-2x" &&
                    trainingDataExample && (
                      <div>
                        <DataPointField
                          label="First User Message"
                          isSaving={isSavingDataPoint}
                          initialValue={initDataStr0}
                          localValue={dataStr0 ?? ""}
                          setLocalValue={setDataStr0}
                          saveFn={saveDataPoint}
                          editable={true}
                          setIsUserEditing={setIsUserEditing}
                        />
                        <DataPointField
                          label="First Assistant Message"
                          isSaving={isSavingDataPoint}
                          initialValue={initDataStr1}
                          localValue={dataStr1 ?? ""}
                          setLocalValue={setDataStr1}
                          saveFn={saveDataPoint}
                          editable={true}
                          setIsUserEditing={setIsUserEditing}
                        />
                        <DataPointField
                          label="Second User Message"
                          isSaving={isSavingDataPoint}
                          initialValue={initDataStr2}
                          localValue={dataStr2 ?? ""}
                          setLocalValue={setDataStr2}
                          saveFn={saveDataPoint}
                          editable={true}
                          setIsUserEditing={setIsUserEditing}
                        />
                        <DataPointField
                          label="Second Assistant Message"
                          isSaving={isSavingDataPoint}
                          initialValue={initDataStr3}
                          localValue={dataStr3 ?? ""}
                          setLocalValue={setDataStr3}
                          saveFn={saveDataPoint}
                          editable={true}
                          setIsUserEditing={setIsUserEditing}
                        />
                      </div>
                    )}
                  {props.selectedDataBank == "training-pair-3x" &&
                    trainingDataExample && (
                      <div>
                        <DataPointField
                          label="First User Message"
                          isSaving={isSavingDataPoint}
                          initialValue={initDataStr0}
                          localValue={dataStr0 ?? ""}
                          setLocalValue={setDataStr0}
                          saveFn={saveDataPoint}
                          editable={true}
                          setIsUserEditing={setIsUserEditing}
                        />
                        <DataPointField
                          label="First Assistant Message"
                          isSaving={isSavingDataPoint}
                          initialValue={initDataStr1}
                          localValue={dataStr1 ?? ""}
                          setLocalValue={setDataStr1}
                          saveFn={saveDataPoint}
                          editable={true}
                          setIsUserEditing={setIsUserEditing}
                        />
                        <DataPointField
                          label="Second User Message"
                          isSaving={isSavingDataPoint}
                          initialValue={initDataStr2}
                          localValue={dataStr2 ?? ""}
                          setLocalValue={setDataStr2}
                          saveFn={saveDataPoint}
                          editable={true}
                          setIsUserEditing={setIsUserEditing}
                        />
                        <DataPointField
                          label="Second Assistant Message"
                          isSaving={isSavingDataPoint}
                          initialValue={initDataStr3}
                          localValue={dataStr3 ?? ""}
                          setLocalValue={setDataStr3}
                          saveFn={saveDataPoint}
                          editable={true}
                          setIsUserEditing={setIsUserEditing}
                        />
                        <DataPointField
                          label="Third User Message"
                          isSaving={isSavingDataPoint}
                          initialValue={initDataStr4}
                          localValue={dataStr4 ?? ""}
                          setLocalValue={setDataStr4}
                          saveFn={saveDataPoint}
                          editable={true}
                          setIsUserEditing={setIsUserEditing}
                        />
                        <DataPointField
                          label="Third Assistant Message"
                          isSaving={isSavingDataPoint}
                          initialValue={initDataStr5}
                          localValue={dataStr5 ?? ""}
                          setLocalValue={setDataStr5}
                          saveFn={saveDataPoint}
                          editable={true}
                          setIsUserEditing={setIsUserEditing}
                        />
                      </div>
                    )}
                  {props.selectedDataBank == "training-pair-4x" &&
                    trainingDataExample && (
                      <div>
                        <DataPointField
                          label="First User Message"
                          isSaving={isSavingDataPoint}
                          initialValue={initDataStr0}
                          localValue={dataStr0 ?? ""}
                          setLocalValue={setDataStr0}
                          saveFn={saveDataPoint}
                          editable={true}
                          setIsUserEditing={setIsUserEditing}
                        />
                        <DataPointField
                          label="First Assistant Message"
                          isSaving={isSavingDataPoint}
                          initialValue={initDataStr1}
                          localValue={dataStr1 ?? ""}
                          setLocalValue={setDataStr1}
                          saveFn={saveDataPoint}
                          editable={true}
                          setIsUserEditing={setIsUserEditing}
                        />
                        <DataPointField
                          label="Second User Message"
                          isSaving={isSavingDataPoint}
                          initialValue={initDataStr2}
                          localValue={dataStr2 ?? ""}
                          setLocalValue={setDataStr2}
                          saveFn={saveDataPoint}
                          editable={true}
                          setIsUserEditing={setIsUserEditing}
                        />
                        <DataPointField
                          label="Second Assistant Message"
                          isSaving={isSavingDataPoint}
                          initialValue={initDataStr3}
                          localValue={dataStr3 ?? ""}
                          setLocalValue={setDataStr3}
                          saveFn={saveDataPoint}
                          editable={true}
                          setIsUserEditing={setIsUserEditing}
                        />
                        <DataPointField
                          label="Third User Message"
                          isSaving={isSavingDataPoint}
                          initialValue={initDataStr4}
                          localValue={dataStr4 ?? ""}
                          setLocalValue={setDataStr4}
                          saveFn={saveDataPoint}
                          editable={true}
                          setIsUserEditing={setIsUserEditing}
                        />
                        <DataPointField
                          label="Third Assistant Message"
                          isSaving={isSavingDataPoint}
                          initialValue={initDataStr5}
                          localValue={dataStr5 ?? ""}
                          setLocalValue={setDataStr5}
                          saveFn={saveDataPoint}
                          editable={true}
                          setIsUserEditing={setIsUserEditing}
                        />
                        <DataPointField
                          label="Fourth User Message"
                          isSaving={isSavingDataPoint}
                          initialValue={initDataStr6}
                          localValue={dataStr6 ?? ""}
                          setLocalValue={setDataStr6}
                          saveFn={saveDataPoint}
                          editable={true}
                          setIsUserEditing={setIsUserEditing}
                        />
                        <DataPointField
                          label="Fourth Assistant Message"
                          isSaving={isSavingDataPoint}
                          initialValue={initDataStr7}
                          localValue={dataStr7 ?? ""}
                          setLocalValue={setDataStr7}
                          saveFn={saveDataPoint}
                          editable={true}
                          setIsUserEditing={setIsUserEditing}
                        />
                      </div>
                    )}
                </div>
              )}
            </div>

            {/* Right arrow */}
            {isNextItemAvailable ? (
              <button
                disabled={isLoadingPromptsData}
                onClick={() => navigateDataPoint(true)}
                className={
                  "flex h-full w-12 items-center justify-center border-t-2 border-gray-800 bg-gray-900 text-slate-400" +
                  (!isLoadingPromptsData
                    ? " hover:animate-pulse hover:bg-slate-800 hover:text-slate-200"
                    : "")
                }
              >
                <ArrowRight className="h-8 w-8" />
              </button>
            ) : (
              <div className="flex h-full w-12 bg-slate-900 " />
            )}
          </div>
        )}
      </div>
    </>
  );
};
