import {
  SignIn,
  useOrganizationList,
  UserButton,
  useUser,
} from "@clerk/nextjs";
import { type NextPage } from "next";
import {
  type JsonObj,
  schema,
  task,
  type TaskBasicData,
  type TaskUpdateData,
} from "agent-roger-core";

import { Button } from "~/components/ui/button";
import { CheckCircle, Loader2, Webhook } from "lucide-react";
import {
  type SetStateAction,
  useCallback,
  useEffect,
  useState,
  useMemo,
} from "react";
import { api } from "~/utils/api";
import dynamic from "next/dynamic";
import { z } from "zod";
import { ControlArea, type SelectedTaskProps } from "~/components/control-area";
const ForceGraph = dynamic(
  () => import("~/components/force-graph").then((component) => component),
  { ssr: false }
);

/* A d3 node */
export type TaskNode = {
  id: number;
  name: string;
  value: number;
  level: number;
  status: "running" | "success" | "failed" | "paused" | "dead";
  dead: boolean;
  isAbstract: boolean;
  isExecution: boolean;
  parentID: number;
  idxInSiblingGroup: number;
  descendentIDs: number[];
};

/* A d3 link */
export type TaskLink = {
  source: number;
  target: number;
  targetNode: TaskNode;
};

const getTaskType = (
  taskData: TaskBasicData | null
):
  | "Root Task"
  | "Abstract Task"
  | "Helper Sub-Task"
  | "Operate Browser Task"
  | "Execute Shell Task"
  | "Execute TypeScript Task"
  | "Generate JSON Content Task" => {
  if (!taskData || !taskData.taskDefinition) return "Helper Sub-Task";
  let taskStagesStr = "";
  try {
    taskStagesStr = schema.taskDefinition
      .parse(taskData.taskDefinition)
      .stagePresets.join(", ")
      .toLowerCase();
  } catch (ignored) {}
  let taskType = "Helper Sub-Task";
  if (!taskData.parentID) taskType = "Root Task";
  else if (taskData.isAbstract) taskType = "Abstract Task";
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
  return taskType as
    | "Root Task"
    | "Abstract Task"
    | "Helper Sub-Task"
    | "Operate Browser Task"
    | "Execute Shell Task"
    | "Execute TypeScript Task"
    | "Generate JSON Content Task";
};

const getJSONString = (obj: object | null | unknown) => {
  try {
    return !obj ? "" : JSON.stringify(obj, null, 2);
  } catch (err) {
    return "";
  }
};

const getNodeSize = (task: TaskBasicData) => {
  return task.isAbstract ? 1 : 1;
};

type WindowDimentions = {
  windowWidth: number | undefined;
  windowHeight: number | undefined;
};

const useWindowDimensions = (): WindowDimentions => {
  const [windowDimensions, setWindowDimensions] = useState<WindowDimentions>({
    windowWidth: undefined,
    windowHeight: undefined,
  });
  useEffect(() => {
    function handleResize(): void {
      setWindowDimensions({
        windowWidth: window.innerWidth,
        windowHeight: window.innerHeight,
      });
    }
    handleResize();
    window.addEventListener("resize", handleResize);
    return (): void => window.removeEventListener("resize", handleResize);
  }, []); // Empty array ensures that effect is only run on mount

  return windowDimensions;
};

const Dashboard: NextPage = () => {
  const trpcUtils = api.useContext();
  const [selectedRootTaskID, setSelectedRootTaskID] = useState<
    number | undefined
  >(undefined);
  const [selectedTaskID, setSelectedTaskID] = useState<number | undefined>(
    undefined
  );
  const [nodes, setNodes] = useState<TaskNode[]>([]);
  const [links, setLinks] = useState<TaskLink[]>([]);
  const [errorToastHeadline, setErrorToastHeadline] = useState<string>("");
  const [errorToastDetails1, setErrorToastDetails1] = useState<string>("");
  const [errorToastDetails2, setErrorToastDetails2] = useState<string>("");
  const [showingErrorToast, setShowingErrorToast] = useState<boolean>(false);

  // fetch root task ids
  const {
    isLoading: isLoadingIDs,
    isError: failedLoadingIDs,
    data: rootTaskIDs,
  } = api.tasks.rootTaskIDs.useQuery({ n: 20 });

  // select most recent root task by default
  useEffect(() => {
    if (!!rootTaskIDs && rootTaskIDs.length && !selectedRootTaskID) {
      setSelectedRootTaskID(rootTaskIDs[0]);
    }
  }, [rootTaskIDs, selectedRootTaskID]);

  // fetch data for selected root tasks's descendents
  const {
    isLoading: isLoadingTree,
    isError: failedLoadingTree,
    data: selectedTaskTree,
  } = api.tasks.getTaskTree.useQuery({
    rootTaskID: selectedRootTaskID,
  });

  //console.log(selectedTaskTree);

  // build nodes and links
  useEffect(() => {
    if (
      !selectedTaskTree ||
      selectedRootTaskID == undefined ||
      selectedRootTaskID == null
    )
      return;

    // new node function
    const createNode = (
      nodeID: number,
      level: number,
      parentID: number
    ): TaskNode | null => {
      if (!selectedTaskTree || !selectedTaskTree.tasks) return null;
      const task = selectedTaskTree.tasks.find((task) => task.taskID == nodeID);
      if (!task) return null;
      let status = task.success != null && !task.success ? "failed" : "running";
      if (task.paused) status = "paused";
      if (task.success != null && task.success) status = "success";
      if (task.dead) status = "dead";
      const taskType = getTaskType(task);
      return {
        id: task.taskID,
        name: "[" + status + "]  " + taskType,
        dead: task.dead ?? false,
        value: getNodeSize(task),
        isAbstract: task.isAbstract ?? false,
        isExecution:
          taskType.toLowerCase().includes("execute") ||
          taskType.toLowerCase().includes("operate") ||
          taskType.toLowerCase().includes("generate"),
        level,
        status: status as "success" | "failed" | "running" | "paused" | "dead",
        parentID,
        idxInSiblingGroup: 1,
        descendentIDs: [],
      };
    };

    // init new node & link vars
    const rootTaskNode = createNode(selectedRootTaskID, 0, -1);
    if (!rootTaskNode) return;
    const idToTaskNode = new Map<number, TaskNode>();
    idToTaskNode.set(rootTaskNode.id, rootTaskNode);
    const newLinks: TaskLink[] = [];

    // mark tree level of each node
    type QueueItem = { nodeID: number; level: number; parentID: number };
    const bfsQueue = new Array<QueueItem>({
      nodeID: selectedRootTaskID,
      level: 0,
      parentID: -1,
    });
    while (true) {
      const item = bfsQueue.shift();
      if (!item) break;
      const { nodeID, level, parentID } = item;
      const newNode = createNode(nodeID, level + 1, parentID);
      if (!newNode) continue;
      idToTaskNode.set(nodeID, newNode);
      selectedTaskTree.links
        .filter((link) => link.source == nodeID)
        .forEach((link) =>
          bfsQueue.push({
            nodeID: link.target,
            level: level + 1,
            parentID: nodeID,
          })
        );
    }

    // create links
    selectedTaskTree.links.forEach((link) => {
      const targetNode = idToTaskNode.get(link.target);
      if (!targetNode) return;
      newLinks.push({
        source: link.source,
        target: link.target,
        targetNode,
      });
    });

    // mark descendents of each node
    const markDescendents = (node: TaskNode) => {
      const bfsQueue = [node.id];
      while (true) {
        const descendentID = bfsQueue.shift();
        if (!descendentID) break;
        newLinks
          .filter((link) => link.source == descendentID)
          .forEach((link) => {
            node.descendentIDs.push(link.target);
            bfsQueue.push(link.target);
          });
      }
    };
    const newNodes = Array.from(idToTaskNode.values());
    newNodes.forEach((node) => markDescendents(node));

    // mark order each node was created relative to its siblings
    selectedTaskTree.tasks.forEach((task) => {
      newLinks
        // links to children
        .filter((link) => {
          return link.source == task.taskID;
        })
        // child tasks
        .map((link) => {
          return selectedTaskTree.tasks.find((task) => {
            return task.taskID == link.target;
          });
        })
        .filter((task) => !!task)
        // sort by time created
        .sort((a, b) => {
          return (
            (!!a ? a.timeCreated.getTime() : 0) -
            (!!b ? b.timeCreated.getTime() : 0)
          );
        })
        // use sort index as idxInSiblingGroup
        .forEach((task, idx) => {
          console.log("child idx of ", idx + 1, " task id: ", task?.taskID);
          if (!task) {
            console.log("skipping null task");
            return;
          }
          const taskNode = idToTaskNode.get(task.taskID);
          if (!taskNode) return;
          console.log("setting node idx to ", idx + 1);
          taskNode.idxInSiblingGroup = idx + 1;
        });
    });

    // update state with new nodes and links
    setNodes(newNodes);
    setLinks(newLinks);
  }, [selectedRootTaskID, selectedTaskTree]);

  // prevent Graph from re-rendering when user selects a node
  const setSelectedTaskIDCallback = useCallback((newTaskID: number | null) => {
    setSelectedTaskID(newTaskID as SetStateAction<number | undefined>);
  }, []);

  // prevent rerendering the force graph by separating selectedNode data from selectedTaskTree
  const { data: selectedTask } = api.tasks.getTaskBasicData.useQuery({
    taskID: selectedTaskID,
  });

  // don't load stage data until user requests it
  const [shouldLoadStage0, setShouldLoadStage0] = useState<boolean>(false);
  const [shouldLoadStage1, setShouldLoadStage1] = useState<boolean>(false);
  const [shouldLoadStage2, setShouldLoadStage2] = useState<boolean>(false);
  const [shouldLoadStage3, setShouldLoadStage3] = useState<boolean>(false);
  const [shouldLoadStage4, setShouldLoadStage4] = useState<boolean>(false);
  const [shouldLoadStage5, setShouldLoadStage5] = useState<boolean>(false);
  const [shouldLoadStage6, setShouldLoadStage6] = useState<boolean>(false);
  const [shouldLoadStage7, setShouldLoadStage7] = useState<boolean>(false);
  const [shouldLoadStage8, setShouldLoadStage8] = useState<boolean>(false);
  const [shouldLoadStage9, setShouldLoadStage9] = useState<boolean>(false);
  const [shouldLoadStage10, setShouldLoadStage10] = useState<boolean>(false);
  const [shouldLoadStage11, setShouldLoadStage11] = useState<boolean>(false);
  const [shouldLoadStage12, setShouldLoadStage12] = useState<boolean>(false);
  const [shouldLoadStage13, setShouldLoadStage13] = useState<boolean>(false);
  const [shouldLoadStage14, setShouldLoadStage14] = useState<boolean>(false);
  const [shouldLoadStage15, setShouldLoadStage15] = useState<boolean>(false);
  const [shouldLoadStage16, setShouldLoadStage16] = useState<boolean>(false);
  const [shouldLoadStage17, setShouldLoadStage17] = useState<boolean>(false);
  const [shouldLoadStage18, setShouldLoadStage18] = useState<boolean>(false);
  const [shouldLoadStage19, setShouldLoadStage19] = useState<boolean>(false);
  const [shouldLoadStage20, setShouldLoadStage20] = useState<boolean>(false);
  const [shouldLoadStage21, setShouldLoadStage21] = useState<boolean>(false);
  const [shouldLoadStage22, setShouldLoadStage22] = useState<boolean>(false);
  const [shouldLoadStage23, setShouldLoadStage23] = useState<boolean>(false);
  useEffect(() => {
    setShouldLoadStage0(false);
    setShouldLoadStage1(false);
    setShouldLoadStage2(false);
    setShouldLoadStage3(false);
    setShouldLoadStage4(false);
    setShouldLoadStage5(false);
    setShouldLoadStage6(false);
    setShouldLoadStage7(false);
    setShouldLoadStage8(false);
    setShouldLoadStage9(false);
    setShouldLoadStage10(false);
    setShouldLoadStage11(false);
    setShouldLoadStage12(false);
    setShouldLoadStage13(false);
    setShouldLoadStage14(false);
    setShouldLoadStage15(false);
    setShouldLoadStage16(false);
    setShouldLoadStage17(false);
    setShouldLoadStage18(false);
    setShouldLoadStage19(false);
    setShouldLoadStage20(false);
    setShouldLoadStage21(false);
    setShouldLoadStage22(false);
    setShouldLoadStage23(false);
  }, [selectedTaskID]);
  const { data: selectedTaskStage0, isFetching: isLoadingStage0 } =
    api.tasks.getTaskStageNData.useQuery(
      {
        taskID: selectedTaskID ?? 0,
        stageN: 0,
      },
      { enabled: shouldLoadStage0 }
    );
  const { data: selectedTaskStage1, isFetching: isLoadingStage1 } =
    api.tasks.getTaskStageNData.useQuery(
      {
        taskID: selectedTaskID ?? 0,
        stageN: 1,
      },
      { enabled: shouldLoadStage1 }
    );
  const { data: selectedTaskStage2, isFetching: isLoadingStage2 } =
    api.tasks.getTaskStageNData.useQuery(
      {
        taskID: selectedTaskID ?? 0,
        stageN: 2,
      },
      { enabled: shouldLoadStage2 }
    );
  const { data: selectedTaskStage3, isFetching: isLoadingStage3 } =
    api.tasks.getTaskStageNData.useQuery(
      {
        taskID: selectedTaskID ?? 0,
        stageN: 3,
      },
      { enabled: shouldLoadStage3 }
    );
  const { data: selectedTaskStage4, isFetching: isLoadingStage4 } =
    api.tasks.getTaskStageNData.useQuery(
      {
        taskID: selectedTaskID ?? 0,
        stageN: 4,
      },
      { enabled: shouldLoadStage4 }
    );
  const { data: selectedTaskStage5, isFetching: isLoadingStage5 } =
    api.tasks.getTaskStageNData.useQuery(
      {
        taskID: selectedTaskID ?? 0,
        stageN: 5,
      },
      { enabled: shouldLoadStage5 }
    );
  const { data: selectedTaskStage6, isFetching: isLoadingStage6 } =
    api.tasks.getTaskStageNData.useQuery(
      {
        taskID: selectedTaskID ?? 0,
        stageN: 6,
      },
      { enabled: shouldLoadStage6 }
    );
  const { data: selectedTaskStage7, isFetching: isLoadingStage7 } =
    api.tasks.getTaskStageNData.useQuery(
      {
        taskID: selectedTaskID ?? 0,
        stageN: 7,
      },
      { enabled: shouldLoadStage7 }
    );
  const { data: selectedTaskStage8, isFetching: isLoadingStage8 } =
    api.tasks.getTaskStageNData.useQuery(
      {
        taskID: selectedTaskID ?? 0,
        stageN: 8,
      },
      { enabled: shouldLoadStage8 }
    );
  const { data: selectedTaskStage9, isFetching: isLoadingStage9 } =
    api.tasks.getTaskStageNData.useQuery(
      {
        taskID: selectedTaskID ?? 0,
        stageN: 9,
      },
      { enabled: shouldLoadStage9 }
    );
  const { data: selectedTaskStage10, isFetching: isLoadingStage10 } =
    api.tasks.getTaskStageNData.useQuery(
      {
        taskID: selectedTaskID ?? 0,
        stageN: 10,
      },
      { enabled: shouldLoadStage10 }
    );
  const { data: selectedTaskStage11, isFetching: isLoadingStage11 } =
    api.tasks.getTaskStageNData.useQuery(
      {
        taskID: selectedTaskID ?? 0,
        stageN: 11,
      },
      { enabled: shouldLoadStage11 }
    );
  const { data: selectedTaskStage12, isFetching: isLoadingStage12 } =
    api.tasks.getTaskStageNData.useQuery(
      {
        taskID: selectedTaskID ?? 0,
        stageN: 12,
      },
      { enabled: shouldLoadStage12 }
    );
  const { data: selectedTaskStage13, isFetching: isLoadingStage13 } =
    api.tasks.getTaskStageNData.useQuery(
      {
        taskID: selectedTaskID ?? 0,
        stageN: 13,
      },
      { enabled: shouldLoadStage13 }
    );
  const { data: selectedTaskStage14, isFetching: isLoadingStage14 } =
    api.tasks.getTaskStageNData.useQuery(
      {
        taskID: selectedTaskID ?? 0,
        stageN: 14,
      },
      { enabled: shouldLoadStage14 }
    );
  const { data: selectedTaskStage15, isFetching: isLoadingStage15 } =
    api.tasks.getTaskStageNData.useQuery(
      {
        taskID: selectedTaskID ?? 0,
        stageN: 15,
      },
      { enabled: shouldLoadStage15 }
    );
  const { data: selectedTaskStage16, isFetching: isLoadingStage16 } =
    api.tasks.getTaskStageNData.useQuery(
      {
        taskID: selectedTaskID ?? 0,
        stageN: 16,
      },
      { enabled: shouldLoadStage16 }
    );
  const { data: selectedTaskStage17, isFetching: isLoadingStage17 } =
    api.tasks.getTaskStageNData.useQuery(
      {
        taskID: selectedTaskID ?? 0,
        stageN: 17,
      },
      { enabled: shouldLoadStage17 }
    );
  const { data: selectedTaskStage18, isFetching: isLoadingStage18 } =
    api.tasks.getTaskStageNData.useQuery(
      {
        taskID: selectedTaskID ?? 0,
        stageN: 18,
      },
      { enabled: shouldLoadStage18 }
    );
  const { data: selectedTaskStage19, isFetching: isLoadingStage19 } =
    api.tasks.getTaskStageNData.useQuery(
      {
        taskID: selectedTaskID ?? 0,
        stageN: 19,
      },
      { enabled: shouldLoadStage19 }
    );
  const { data: selectedTaskStage20, isFetching: isLoadingStage20 } =
    api.tasks.getTaskStageNData.useQuery(
      {
        taskID: selectedTaskID ?? 0,
        stageN: 20,
      },
      { enabled: shouldLoadStage20 }
    );
  const { data: selectedTaskStage21, isFetching: isLoadingStage21 } =
    api.tasks.getTaskStageNData.useQuery(
      {
        taskID: selectedTaskID ?? 0,
        stageN: 21,
      },
      { enabled: shouldLoadStage21 }
    );
  const { data: selectedTaskStage22, isFetching: isLoadingStage22 } =
    api.tasks.getTaskStageNData.useQuery(
      {
        taskID: selectedTaskID ?? 0,
        stageN: 22,
      },
      { enabled: shouldLoadStage22 }
    );
  const { data: selectedTaskStage23, isFetching: isLoadingStage23 } =
    api.tasks.getTaskStageNData.useQuery(
      {
        taskID: selectedTaskID ?? 0,
        stageN: 23,
      },
      { enabled: shouldLoadStage23 }
    );

  // save task db function
  const saveTask = api.tasks.saveTaskData.useMutation({
    async onSuccess() {
      await trpcUtils.tasks.getTaskBasicData.invalidate();
      await trpcUtils.tasks.getTaskStageNData.invalidate();
    },
  });

  // create new task db function
  const createRootTask = api.tasks.createRootTask.useMutation({
    async onSuccess() {
      await trpcUtils.tasks.rootTaskIDs.invalidate();
    },
  });

  const saveTaskFn = async (changedFields: TaskUpdateData) => {
    try {
      if (!selectedTask) return;
      const params = schema.input.saveTask.parse({
        taskID: selectedTask.taskID,
        newFields: schema.updateTask.parse(changedFields),
      });
      await saveTask.mutateAsync(params);
    } catch (error) {
      console.error(error);
      // show error alert
      setErrorToastHeadline("Task Saving Failed");
      setErrorToastDetails1(
        "Make sure all your JSON fields contain valid JSON, and check your connection."
      );
      if (error instanceof z.ZodError) {
        setErrorToastDetails2(error.message);
      } else {
        setErrorToastDetails2("");
      }
      setShowingErrorToast(true);
    }
  };

  const isSavingChangedFields = saveTask.isLoading;

  // get props for children components
  const stage0DataStr = useMemo(
    () => (shouldLoadStage0 ? getJSONString(selectedTaskStage0) : null),
    [shouldLoadStage0, selectedTaskStage0]
  );
  const stage1DataStr = shouldLoadStage1
    ? getJSONString(selectedTaskStage1)
    : null;
  const stage2DataStr = shouldLoadStage2
    ? getJSONString(selectedTaskStage2)
    : null;
  const stage3DataStr = shouldLoadStage3
    ? getJSONString(selectedTaskStage3)
    : null;
  const stage4DataStr = shouldLoadStage4
    ? getJSONString(selectedTaskStage4)
    : null;
  const stage5DataStr = shouldLoadStage5
    ? getJSONString(selectedTaskStage5)
    : null;
  const stage6DataStr = shouldLoadStage6
    ? getJSONString(selectedTaskStage6)
    : null;
  const stage7DataStr = shouldLoadStage7
    ? getJSONString(selectedTaskStage7)
    : null;
  const stage8DataStr = shouldLoadStage8
    ? getJSONString(selectedTaskStage8)
    : null;
  const stage9DataStr = shouldLoadStage9
    ? getJSONString(selectedTaskStage9)
    : null;
  const stage10DataStr = shouldLoadStage10
    ? getJSONString(selectedTaskStage10)
    : null;
  const stage11DataStr = shouldLoadStage11
    ? getJSONString(selectedTaskStage11)
    : null;
  const stage12DataStr = shouldLoadStage12
    ? getJSONString(selectedTaskStage12)
    : null;
  const stage13DataStr = shouldLoadStage13
    ? getJSONString(selectedTaskStage13)
    : null;
  const stage14DataStr = shouldLoadStage14
    ? getJSONString(selectedTaskStage14)
    : null;
  const stage15DataStr = shouldLoadStage15
    ? getJSONString(selectedTaskStage15)
    : null;
  const stage16DataStr = shouldLoadStage16
    ? getJSONString(selectedTaskStage16)
    : null;
  const stage17DataStr = shouldLoadStage17
    ? getJSONString(selectedTaskStage17)
    : null;
  const stage18DataStr = shouldLoadStage18
    ? getJSONString(selectedTaskStage18)
    : null;
  const stage19DataStr = shouldLoadStage19
    ? getJSONString(selectedTaskStage19)
    : null;
  const stage20DataStr = shouldLoadStage20
    ? getJSONString(selectedTaskStage20)
    : null;
  const stage21DataStr = shouldLoadStage21
    ? getJSONString(selectedTaskStage21)
    : null;
  const stage22DataStr = shouldLoadStage22
    ? getJSONString(selectedTaskStage22)
    : null;
  const stage23DataStr = shouldLoadStage23
    ? getJSONString(selectedTaskStage23)
    : null;

  // handle loading state
  if (isLoadingIDs) {
    return (
      <div className="flex h-screen w-full flex-col">
        <Loader2 className="m-auto h-10 w-10 animate-spin" />
      </div>
    );
  }

  const createNewTask = async (params: {
    initialInputFieldsStr: string;
    initialContextFieldsStr: string;
    initialContextSummary: string;
  }) => {
    let initialInputFieldsJSON: JsonObj = {
      uhOh: "Dashboard user created a task without specifying a valid initialInputFields JSON",
    };
    let initialContextFieldsJSON: JsonObj | null = null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      initialInputFieldsJSON = schema.jsonObj.parse(
        JSON.parse(params.initialInputFieldsStr)
      );
      initialContextFieldsJSON = schema.jsonObj.parse(
        JSON.parse(params.initialContextFieldsStr)
      );
    } catch (error) {}
    await createRootTask.mutateAsync({
      taskDefinition: task.preset.abstract ?? {},
      initialInputFields: initialInputFieldsJSON,
      ...(initialContextFieldsJSON
        ? { initialContextFields: initialContextFieldsJSON }
        : {}),
      initialContextSummary: params.initialContextSummary,
    });
    setSelectedRootTaskID(undefined);
    setSelectedTaskID(undefined);
  };

  return (
    <div className="block h-screen w-full overflow-hidden">
      <ControlArea
        // other props
        rootTaskIDs={rootTaskIDs || []}
        selectedRootTaskID={selectedRootTaskID}
        setSelectedRootTaskID={(val: number) => {
          setSelectedRootTaskID(val);
          setSelectedTaskID(undefined);
        }}
        createNewTaskFn={createNewTask}
        saveTaskFn={saveTaskFn}
        isSaving={isSavingChangedFields}
        // SelectedTaskProps
        taskID={selectedTask ? selectedTask.taskID : null}
        parentID={selectedTask?.parentID || null}
        paused={selectedTask ? selectedTask.paused : null}
        success={selectedTask ? selectedTask.success : null}
        dead={selectedTask ? selectedTask.dead : null}
        isAbstract={selectedTask?.isAbstract || false}
        taskType={getTaskType(selectedTask ?? null)}
        lastEndedStage={selectedTask ? selectedTask.lastEndedStage : 0}
        lastInteractionMarker={selectedTask?.lastInteractionMarker ?? null}
        taskDefinition={
          selectedTask?.taskDefinition || { isAbstract: true, stagePresets: [] }
        }
        initialInputFields={getJSONString(selectedTask?.initialInputFields)}
        initialContextFields={getJSONString(selectedTask?.initialContextFields)}
        initialContextSummary={selectedTask?.initialContextSummary || ""}
        timeCreated={selectedTask?.timeCreated || new Date(2000, 1, 1)}
        timeLastUpdated={selectedTask?.timeLastUpdated || new Date(2000, 1, 1)}
        resultData={getJSONString(selectedTask?.resultData)}
        runtimeErrors={getJSONString(selectedTask?.runtimeErrors)}
        stage0Data={stage0DataStr}
        loadStage0={() => setShouldLoadStage0(true)}
        isLoadingStage0={isLoadingStage0}
        stage1Data={stage1DataStr}
        loadStage1={() => setShouldLoadStage1(true)}
        isLoadingStage1={isLoadingStage1}
        stage2Data={stage2DataStr}
        loadStage2={() => setShouldLoadStage2(true)}
        isLoadingStage2={isLoadingStage2}
        stage3Data={stage3DataStr}
        loadStage3={() => setShouldLoadStage3(true)}
        isLoadingStage3={isLoadingStage3}
        stage4Data={stage4DataStr}
        loadStage4={() => setShouldLoadStage4(true)}
        isLoadingStage4={isLoadingStage4}
        stage5Data={stage5DataStr}
        loadStage5={() => setShouldLoadStage5(true)}
        isLoadingStage5={isLoadingStage5}
        stage6Data={stage6DataStr}
        loadStage6={() => setShouldLoadStage6(true)}
        isLoadingStage6={isLoadingStage6}
        stage7Data={stage7DataStr}
        loadStage7={() => setShouldLoadStage7(true)}
        isLoadingStage7={isLoadingStage7}
        stage8Data={stage8DataStr}
        loadStage8={() => setShouldLoadStage8(true)}
        isLoadingStage8={isLoadingStage8}
        stage9Data={stage9DataStr}
        loadStage9={() => setShouldLoadStage9(true)}
        isLoadingStage9={isLoadingStage9}
        stage10Data={stage10DataStr}
        loadStage10={() => setShouldLoadStage10(true)}
        isLoadingStage10={isLoadingStage10}
        stage11Data={stage11DataStr}
        loadStage11={() => setShouldLoadStage11(true)}
        isLoadingStage11={isLoadingStage11}
        stage12Data={stage12DataStr}
        loadStage12={() => setShouldLoadStage12(true)}
        isLoadingStage12={isLoadingStage12}
        stage13Data={stage13DataStr}
        loadStage13={() => setShouldLoadStage13(true)}
        isLoadingStage13={isLoadingStage13}
        stage14Data={stage14DataStr}
        loadStage14={() => setShouldLoadStage14(true)}
        isLoadingStage14={isLoadingStage14}
        stage15Data={stage15DataStr}
        loadStage15={() => setShouldLoadStage15(true)}
        isLoadingStage15={isLoadingStage15}
        stage16Data={stage16DataStr}
        loadStage16={() => setShouldLoadStage16(true)}
        isLoadingStage16={isLoadingStage16}
        stage17Data={stage17DataStr}
        loadStage17={() => setShouldLoadStage17(true)}
        isLoadingStage17={isLoadingStage17}
        stage18Data={stage18DataStr}
        loadStage18={() => setShouldLoadStage18(true)}
        isLoadingStage18={isLoadingStage18}
        stage19Data={stage19DataStr}
        loadStage19={() => setShouldLoadStage19(true)}
        isLoadingStage19={isLoadingStage19}
        stage20Data={stage20DataStr}
        loadStage20={() => setShouldLoadStage20(true)}
        isLoadingStage20={isLoadingStage20}
        stage21Data={stage21DataStr}
        loadStage21={() => setShouldLoadStage21(true)}
        isLoadingStage21={isLoadingStage21}
        stage22Data={stage22DataStr}
        loadStage22={() => setShouldLoadStage22(true)}
        isLoadingStage22={isLoadingStage22}
        stage23Data={stage23DataStr}
        loadStage23={() => setShouldLoadStage23(true)}
        isLoadingStage23={isLoadingStage23}
      />
      <GraphArea
        isLoading={
          isLoadingIDs || isLoadingTree || failedLoadingIDs || failedLoadingTree
        }
        nodes={nodes}
        links={links}
        setSelectedTaskID={
          setSelectedTaskIDCallback as (val: number | null) => void
        }
      />
    </div>
  );
};

const GraphArea = (props: {
  isLoading: boolean;
  nodes: TaskNode[];
  links: TaskLink[];
  setSelectedTaskID: (val: number | null) => void;
}) => {
  // get width and height px for the canvas
  const { windowWidth, windowHeight } = useWindowDimensions();

  const handleSelectedTaskID = useCallback(
    (newTaskID: number | null) => {
      props.setSelectedTaskID(newTaskID);
    },
    [props]
  );

  if (props.isLoading || !!!windowWidth || !!!windowHeight) {
    return (
      <div className="block bg-slate-900 md:float-left md:h-full md:w-2/3">
        <div className="flex h-full flex-1 justify-center align-middle">
          <Webhook className="flex h-14 w-14 animate-spin self-center text-gray-300" />
        </div>
      </div>
    );
  }

  const canvasWidth = windowWidth >= 768 ? windowWidth * (2 / 3) : windowWidth;
  const canvasHeight =
    windowWidth >= 768 ? windowHeight : windowHeight * (4 / 5);

  return (
    <div className="block bg-slate-900 md:float-left md:h-full md:w-2/3">
      <ForceGraph
        nodes={props.nodes}
        links={props.links}
        width={canvasWidth}
        height={canvasHeight}
        setSelectedTaskID={handleSelectedTaskID}
      />
    </div>
  );
};

const Home: NextPage = () => {
  const { organizationList, isLoaded } = useOrganizationList();
  const { isLoaded: authLoaded, isSignedIn } = useUser();

  let isAdmin = false;
  if (isLoaded && organizationList) {
    organizationList.forEach(({ organization }) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      if (organization.name.toLowerCase().includes("admin")) isAdmin = true;
    });
  }

  if (!authLoaded) {
    return (
      <div className="flex h-screen w-full flex-col">
        <Loader2 className="m-auto h-10 w-10 animate-spin" />
      </div>
    );
  } else if (isSignedIn && !isAdmin) {
    return (
      <div className="flex h-full w-full flex-col justify-center align-middle">
        <div className="ml-auto mr-5 mt-5">
          <UserButton />
        </div>
        <h1 className="mx-auto mt-5 text-3xl font-bold text-red-500 shadow-white drop-shadow-2xl">
          You are not authorized to use this site!
        </h1>
        <h3 className="mx-auto mt-5 text-lg font-semibold text-red-100">
          You need to sign in with an admin account.
        </h3>
      </div>
    );
  }

  return isAdmin ? (
    <Dashboard />
  ) : (
    <div className="flex h-full w-full justify-center pt-20 align-middle">
      <SignIn />
    </div>
  );
};

export default Home;
