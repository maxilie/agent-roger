import { SignedIn, SignedOut, SignIn } from "@clerk/nextjs";
import { type NextPage } from "next";

import { Button } from "~/components/ui/button";
import { CheckCircle, Loader2, Webhook } from "lucide-react";
import { type SetStateAction, useCallback, useEffect, useState } from "react";
import { api, type RouterOutputs } from "~/utils/api";
import { type TaskType, type TaskLink, type TaskNode } from "~/types";
import dynamic from "next/dynamic";
import { TASK_SCHEMA } from "~/types";
import { z } from "zod";
import { TEST_CONST } from "../../../agent-roger-core";
import { ControlArea, type SelectedTaskProps } from "~/components/control-area";
const ForceGraph = dynamic(
  () => import("~/components/force-graph").then((component) => component),
  { ssr: false }
);

const test1 = TEST_CONST + 1;

/* 
Throws z.ZodError if invalid task properties.
If a value is null, that property will be deleted in the database. To leave a property untouched, do not pass it in taskPtops.
 */
const validateAndParseTaskProps = (
  taskProps: SelectedTaskProps
): z.infer<typeof TASK_SCHEMA> => {
  // init vars
  const processedParams: {
    [k: string]: string | number | Date | object | boolean | null;
  } = {};
  const filteredTaskProps: Partial<SelectedTaskProps> = {};

  // build processedParams by visiting each taskProp
  for (const key in taskProps) {
    if (!key || !TASK_SCHEMA.shape.hasOwnProperty(key)) continue;
    const fieldVal = taskProps[key as keyof SelectedTaskProps];

    // determine whether string field (edited by user) should be converted to json
    const valueSchema =
      TASK_SCHEMA.shape[key as keyof z.infer<typeof TASK_SCHEMA>];
    const isJsonField =
      valueSchema instanceof z.ZodObject ||
      (valueSchema instanceof z.ZodUnion &&
        (
          valueSchema as z.ZodUnion<[z.ZodObject<z.ZodRawShape>, z.ZodTypeAny]>
        ).options.some((option: unknown) => option instanceof z.ZodObject));

    // parse string field into json field
    if (
      isJsonField &&
      typeof filteredTaskProps[key as keyof SelectedTaskProps] === "string"
    ) {
      let parsedJSON: unknown = null;
      try {
        parsedJSON = typeof fieldVal == "string" ? JSON.parse(fieldVal) : null;
      } catch (err) {
        // set invalid JSON to null
        filteredTaskProps[key as keyof SelectedTaskProps] = undefined;
      }
      processedParams[key] = parsedJSON ?? null;
    }

    // if not json field, forward the param as is
    else {
      processedParams[key] = fieldVal;
    }
  }

  // validate process params or throw a z.ZodError
  return TASK_SCHEMA.parse(filteredTaskProps);
};

const getJSONString = (obj: object | null | unknown) => {
  try {
    return !obj ? "" : JSON.stringify(obj, null, 2);
  } catch (err) {
    return "";
  }
};

const getNodeSize = (task: RouterOutputs["tasks"]["taskDatas"][0]) => {
  return task.taskType == "ROOT" ? 1 : 1;
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

type TaskTreeItem = RouterOutputs["tasks"]["taskTree"];

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
  } = api.tasks.rootTasks.useQuery({ n: 20 });

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
  } = api.tasks.taskTree.useQuery({
    rootTaskID: selectedRootTaskID,
  });

  // build nodes and links
  useEffect(() => {
    if (!!!selectedTaskTree || !!!selectedRootTaskID) return;

    // new node function
    const createNode = (
      nodeID: number,
      level: number,
      parentID: number
    ): TaskNode | null => {
      const task = selectedTaskTree.tasks.find((task) => task.taskID == nodeID);
      if (!task) return null;
      let status = task.success != null && !task.success ? "failed" : "running";
      if (task.paused) status = "paused";
      if (task.success != null && task.success) status = "success";
      if (task.dead) status = "dead";
      return {
        id: task.taskID,
        name:
          // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
          task.taskType +
          " task (" +
          task.taskID +
          ") is " +
          status.toUpperCase(),
        dead: task.dead,
        value: getNodeSize(task),
        level,
        status: status as "success" | "failed" | "running" | "paused" | "dead",
        type: task.taskType as TaskType,
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
  const { data: selectedTask } = api.tasks.taskData.useQuery({
    taskID: selectedTaskID,
  });

  // save task db function
  const saveTask = api.tasks.saveArbitraryTask.useMutation({
    async onSuccess() {
      await trpcUtils.tasks.taskData.invalidate();
    },
  });

  // create new task db function
  const createRootTask = api.tasks.createRootTask.useMutation({
    async onSuccess() {
      await trpcUtils.tasks.rootTasks.invalidate();
    },
  });

  const saveTaskFn = async (taskProps: SelectedTaskProps) => {
    try {
      const params = validateAndParseTaskProps(taskProps);
      await saveTask.mutateAsync(params);
    } catch (error) {
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

  // get props for children components
  const input = getJSONString(selectedTask?.input);

  const initialContextSummary = JSON.stringify(
    selectedTask?.initialContextSummary
  );
  const semanticContextQueries = getJSONString(
    selectedTask?.semanticContextQueries
  );
  const keywordContextQueries = getJSONString(
    selectedTask?.keywordContextQueries
  );
  const semanticQueryEmbeddings = getJSONString(
    selectedTask?.semanticQueryEmbeddings
  );
  const rawContext = getJSONString(selectedTask?.rawContext);
  const contextSummary = getJSONString(selectedTask?.contextSummary);
  const stepsAndSuccessCriteria = getJSONString(
    selectedTask?.stepsAndSuccessCriteria
  );
  const subTasksSummary = selectedTask?.subTasksSummary
    ? selectedTask?.subTasksSummary
    : "";
  const validationSummary = selectedTask?.validationSummary
    ? selectedTask?.validationSummary
    : "";
  const runtimeErrors = getJSONString(selectedTask?.runtimeErrors);
  const resultData = getJSONString(selectedTask?.resultData);
  const stage0Data = getJSONString(selectedTask?.stage0Data);
  const stage1Data = getJSONString(selectedTask?.stage1Data);
  const stage2Data = getJSONString(selectedTask?.stage2Data);
  const stage3Data = getJSONString(selectedTask?.stage3Data);
  const stage4Data = getJSONString(selectedTask?.stage4Data);
  const stage5Data = getJSONString(selectedTask?.stage5Data);
  const stage6Data = getJSONString(selectedTask?.stage6Data);
  const stage7Data = getJSONString(selectedTask?.stage7Data);
  const stage8Data = getJSONString(selectedTask?.stage8Data);
  const stage9Data = getJSONString(selectedTask?.stage9Data);
  const stage10Data = getJSONString(selectedTask?.stage10Data);
  const stage11Data = getJSONString(selectedTask?.stage11Data);
  const stage12Data = getJSONString(selectedTask?.stage12Data);
  const stage13Data = getJSONString(selectedTask?.stage13Data);
  const stage14Data = getJSONString(selectedTask?.stage14Data);
  const stage15Data = getJSONString(selectedTask?.stage15Data);
  const stage16Data = getJSONString(selectedTask?.stage16Data);
  const stage17Data = getJSONString(selectedTask?.stage17Data);
  const stage18Data = getJSONString(selectedTask?.stage18Data);
  const stage19Data = getJSONString(selectedTask?.stage19Data);
  const stage20Data = getJSONString(selectedTask?.stage20Data);
  const stage21Data = getJSONString(selectedTask?.stage21Data);
  const stage22Data = getJSONString(selectedTask?.stage22Data);
  const stage23Data = getJSONString(selectedTask?.stage23Data);

  // handle loading state
  if (isLoadingIDs) {
    return (
      <div className="flex h-screen w-full flex-col">
        <Loader2 className="m-auto h-10 w-10 animate-spin" />
      </div>
    );
  }

  const createNewTask = async (params: {
    inputJSONString: string;
    initialContextSummary: string;
  }) => {
    const { inputJSONString, initialContextSummary } = params;
    let inputJSON: { [key: string]: any } | null = null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      inputJSON = JSON.parse(inputJSONString);
    } catch (error) {}
    await createRootTask.mutateAsync({
      ...(inputJSON ? { taskInput: inputJSON } : {}),
      initialContextSummary: params.initialContextSummary,
    });
    setSelectedRootTaskID(undefined);
  };

  return (
    <div className="block h-screen w-full">
      <ControlArea
        rootTaskIDs={rootTaskIDs || []}
        selectedRootTaskID={selectedRootTaskID}
        setSelectedRootTaskID={setSelectedRootTaskID}
        createNewTaskFn={createNewTask}
        // selected task props
        saveTaskFn={saveTaskFn}
        taskID={selectedTask ? selectedTask.taskID : null}
        parentID={selectedTask?.parentID || null}
        paused={selectedTask?.paused || null}
        success={selectedTask?.success || null}
        dead={selectedTask?.dead || null}
        taskType={selectedTask?.taskType || ""}
        input={input}
        initialContextSummary={initialContextSummary}
        generateSubTasksStageIdx={
          selectedTask?.generateSubTasksStageIdx || null
        }
        timeCreated={selectedTask?.timeCreated || new Date(2000, 1, 1)}
        timeLastUpdated={selectedTask?.timeLastUpdated || new Date(2000, 1, 1)}
        semanticContextQueries={semanticContextQueries}
        keywordContextQueries={keywordContextQueries}
        semanticQueryEmbeddings={semanticQueryEmbeddings}
        rawContext={rawContext}
        contextSummary={contextSummary}
        stepsAndSuccessCriteria={stepsAndSuccessCriteria}
        subTasksSummary={subTasksSummary}
        validationSummary={validationSummary}
        resultData={resultData}
        runtimeErrors={runtimeErrors}
        stage0Data={stage0Data}
        stage1Data={stage1Data}
        stage2Data={stage2Data}
        stage3Data={stage3Data}
        stage4Data={stage4Data}
        stage5Data={stage5Data}
        stage6Data={stage6Data}
        stage7Data={stage7Data}
        stage8Data={stage8Data}
        stage9Data={stage9Data}
        stage10Data={stage10Data}
        stage11Data={stage11Data}
        stage12Data={stage12Data}
        stage13Data={stage13Data}
        stage14Data={stage14Data}
        stage15Data={stage15Data}
        stage16Data={stage16Data}
        stage17Data={stage17Data}
        stage18Data={stage18Data}
        stage19Data={stage19Data}
        stage20Data={stage20Data}
        stage21Data={stage21Data}
        stage22Data={stage22Data}
        stage23Data={stage23Data}
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
  return (
    <>
      <SignedIn>
        <Dashboard />
      </SignedIn>

      <SignedOut>
        <div className="flex h-full w-full justify-center pt-20 align-middle">
          <SignIn />
        </div>
      </SignedOut>
    </>
  );
};

export default Home;
