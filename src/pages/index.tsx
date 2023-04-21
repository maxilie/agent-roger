/* eslint-disable @typescript-eslint/consistent-type-imports */
import { SignedIn, SignedOut, SignIn, UserButton } from "@clerk/nextjs";
import { type NextPage } from "next";

import { Button } from "~/components/ui/button";
import { useRouter } from "next/router";
import { ArrowLeftCircle, CheckCircle, Loader2, Webhook } from "lucide-react";
import { type SetStateAction, useCallback, useEffect, useState } from "react";
import { api, RouterOutputs } from "~/utils/api";
import { TaskType, type TaskLink, type TaskNode } from "~/types";
import dynamic from "next/dynamic";
const ForceGraph = dynamic(
  () => import("~/components/force-graph").then((component) => component),
  { ssr: false }
);

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

// type Task = {
//   taskID: number;
//   awaitingChildren: boolean;
//   paused: boolean;
//   completed: boolean;
//   success: boolean | undefined;
//   taskType: string;
//   input: object | undefined;
//   internalData: object | undefined;
//   resultData: object | undefined;
// };

// type TaskTreeItem = RouterOutputs["tasks"]["taskTree"];

type TabValue = "tasks" | "training_data";

const Dashboard: NextPage = () => {
  const [selectedRootTaskID, setSelectedRootTaskID] = useState<
    number | undefined
  >(undefined);
  const [selectedTaskID, setSelectedTaskID] = useState<number | undefined>(
    undefined
  );
  const [nodes, setNodes] = useState<TaskNode[]>([]);
  const [links, setLinks] = useState<TaskLink[]>([]);

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
      let status = task.success != null && task.success ? "success" : "pending";
      if (task.paused) status = "paused";
      if (task.success != null && !task.success) status = "failed";
      if (status == "pending" && !task.awaitingChildren) status = "running";
      return {
        id: task.taskID,
        name:
          // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
          task.taskType +
          " task (" +
          task.taskID +
          ") is " +
          status.toUpperCase(),
        value: getNodeSize(task),
        level,
        status: status as
          | "success"
          | "failed"
          | "pending"
          | "running"
          | "paused",
        type: task.taskType as TaskType,
        parentID,
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

    // update state with new nodes and links
    setNodes(newNodes);
    setLinks(newLinks);
  }, [selectedRootTaskID, selectedTaskTree]);

  // prevent Graph from re-rendering when user selects a node
  const setSelectedTaskIDCallback = useCallback((newTaskID: number | null) => {
    setSelectedTaskID(newTaskID as SetStateAction<number | undefined>);
  }, []);

  // handle loading state
  if (isLoadingIDs) {
    return (
      <div className="flex h-screen w-full flex-col">
        <Loader2 className="m-auto h-10 w-10 animate-spin" />
      </div>
    );
  }

  const selectedTask = selectedTaskID
    ? selectedTaskTree?.tasks.find((task) => task.taskID == selectedTaskID)
    : null;

  return (
    <div className="block h-screen w-full">
      <ControlArea
        rootTaskIDs={rootTaskIDs || []}
        selectedRootTaskID={selectedRootTaskID}
        setSelectedRootTaskID={setSelectedRootTaskID}
        taskID={selectedTask ? selectedTask.taskID : null}
        taskInput={selectedTask ? selectedTask.input || null : null}
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

const ControlArea = (props: {
  rootTaskIDs: number[];
  selectedRootTaskID: number | undefined;
  setSelectedRootTaskID: (val: number) => void;
  taskID: number | null;
  taskInput: object | null;
  // TODO taskStatus: string, restartTaskFn: () => void, etc.
}) => {
  const router = useRouter();

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

        {/* Options for selected task or new task */}
        <div className="flex-1 overflow-y-auto">
          {props.selectedRootTaskID ? (
            <>
              <SelectedTask // TODO taskTitle={}, taskStatus={}, restartTaskFn={}, etc.
              />
              <p className="mt-4 text-sm text-gray-300">
                {props.taskInput
                  ? JSON.stringify(props.taskInput, null, 2)
                  : ""}
              </p>
            </>
          ) : (
            <CreateNewTask // TODO createNewTaskFn={}
            />
          )}
        </div>
      </div>
    </div>
  );
};

const CreateNewTask = () => {
  // Implement create new task functionality here
  return <div>Create New Task</div>;
};

const SelectedTask = () => {
  // Implement selected task functionality here
  return <div>Selected Task: </div>;
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

/**
 * Replace the Dashboard NextJS React component, below, with 3 components: Dashboard, ControlArea, and GraphArea.
 * Use tailwind css and className property for styling. On md screens, ControlArea should be on the right, taking up 1/5 of the width of the screen, and GraphArea should fill the remaining 4/5ths on the left side. On smaller screens, position the ControlArea above the GraphArea.
 * The GraphArea must take up the vast majority of the screen, so small screens will need to have the option to collapse the ControlArea which is above the GraphArea.
 *
 * ControlArea has:
 * - A "Manage Training Data" link button and a UserButton component. These make up a mini header and are not important visually. When the button is pressed, redirect NextJS to "/training-data".
 * - More prominently, a dropdown box below with label "Root Task", and a list of task IDs which are stored in Dashboard's state and passed to ControlArea as a prop.
 * - The rest of the control area is a scrollable area with fields and button pertaining to the selectedTaskID, which is also stored in Dashboard's state and passed to ControlArea as a prop.
 * - If no selectedTaskID, then the control area should be empty except for a button to create a new root task. (This means we probably need two components for this area: one for a selected task and another for a new task creation template).
 *
 * CreateNewTask fields:
 * - Input Command or Question (medium-height text field)
 * - Submit button (regular sized accent color button)
 * - Cancel button next to the submit button, and also an "X" button to the upper right.
 *
 * SelectedTask fields:
 * - Task Title (medium text, semibold, centered, expect it to be a couple sentences long)
 * - Row with:
 * - - Status icon (green dot for completed, a loading spinner for running, a red dot for paused or failed) and text "Status: In Progress" or "Status: Complete"
 * - - A "Pause" button (regular sized accent color button)
 * - an "X" button to the upper right.
 * - Task data (big tall field with lots of json text in it). Warning icon if the user changed the data from the initial value that was passed to SelectedTask.
 * - Input Command or Question (medium-height text field) (same text as task title, but editable). Same warning icon as above.
 * - Save and Cancel buttons next to each other. Both disabled if the user has not changed the data field or the input field.
 * - "Context" heading
 * - Feedback field (medium-height text field) with explanation text below it that says, "Human feedback will be applied to agent context will create a new task"
 * - Add context button (regular sized, different accent color button)
 * - A Restart button with a warning that this will delete descendent tasks, set status of ancestor tasks to "awaiting_children", and re-run this task with the current input.
 * - A delete button.
 *
 * GraphArea: Just give it a dark background color like the rest of the components. Make sure all the colors go well together and fit a dark theme.
 */

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
