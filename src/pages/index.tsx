/* eslint-disable @typescript-eslint/consistent-type-imports */
import { SignedIn, SignedOut, SignIn, UserButton } from "@clerk/nextjs";
import { type NextPage } from "next";

import { Button } from "~/components/ui/button";
import { useRouter } from "next/router";
import {
  ArrowLeftCircle,
  CheckCircle,
  Loader2,
  Webhook,
  XSquare,
} from "lucide-react";
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
        status: status as
          | "success"
          | "failed"
          | "pending"
          | "running"
          | "paused",
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
        // sort by time_created
        .sort((a, b) => {
          return (
            (!!a ? a.time_created.getTime() : 0) -
            (!!b ? b.time_created.getTime() : 0)
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

/* 
Create (React) and style (tailwind css) the components below. Make everything look nice together, on mobile and desktop (md:).

The ControlArea component is a sidebar (on desktop; a topbar on mobile) that takes up 1/3rd of the screen on the left (or, on mobile, 1/5th of the screen on the top and is collapsible/expandable to the entire screen).

The area below the dropdown select menu should take up the remainder of the available space and be scrollable. It is either a scrollable SelectedTask (if a task is selected) or a scrollable CreateNewTask. If neither is shown, then show a "Create Task" button prominently.

CreateNewTask fields:
- Input Command or Question (medium-height text field called input)
- Initial Context Summary (medium-height text field called initialContextSummary)
- Submit button (regular sized accent color button)
- Cancel button next to the submit button, and also an "X" button to the upper right that closes the CreateNewTask area.

SelectedTask fields:

- an "X" button to the upper right to close the menu.

- Task Type (medium-small text, centered, expect it to be under 20 characters)
- Task Title (medium text, semibold, centered, expect it to be a couple sentences long)
- Row with:
  - Status icon (green dot for "success", a sky blue loading spinner for "running", a red dot for "paused" or "failed", a gray dot for "dead") and text "{status}"
  - Depending on status, either a "Pause" "Unpause" button (regular sized accent color button) or neither
- A "Pause Descendents" row
- A "Restart Tree Here" row with an <Info /> that has hover text: "Restarting here will mark this task and its descendents as dead, re-run this task with the latest saved input and contextSummary (you can edit these fields down below), and undo any actions taken by ancestors after this task was created.\nWhen this task is complete, it will propogate back up to the root task like normal."

- (the following are vertically expandable inputs that show a save button if changed from the initial props value that was passed to SelectedTask)
 - Input Command or Question
 - Initial Context Summary

*/

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
  const [input, setInput] = useState("");
  const [initialContextSummary, setInitialContextSummary] = useState("");

  const handleSubmit = () => {
    // TODO: Implement create new task functionality
  };

  const handleCancel = () => {
    setInput("");
    setInitialContextSummary("");
    // TODO: Implement closing the CreateNewTask area
  };

  return (
    <div className="rounded bg-gray-800 p-4">
      <button
        onClick={handleCancel}
        className="absolute right-2 top-2 text-gray-300 hover:text-white"
      >
        <XSquare className="h-4 w-4" />
      </button>
      <div className="mb-4">
        <label className="mb-2 block text-sm text-gray-300">
          Input Command or Question
        </label>
        <textarea
          className="w-full resize-y rounded bg-gray-700 p-2 text-white"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
      </div>
      <div className="mb-4">
        <label className="mb-2 block text-sm text-gray-300">
          Initial Context Summary
        </label>
        <textarea
          className="w-full resize-y rounded bg-gray-700 p-2 text-white"
          value={initialContextSummary}
          onChange={(e) => setInitialContextSummary(e.target.value)}
        />
      </div>
      <div className="flex justify-end">
        <button
          onClick={handleCancel}
          className="mr-2 rounded bg-red-500 px-4 py-2 text-white hover:bg-red-600"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          className="rounded bg-green-500 px-4 py-2 text-white hover:bg-green-600"
        >
          Submit
        </button>
      </div>
    </div>
  );
};

const SelectedTask = () => {
  // TODO: Receive necessary props for displaying and interacting with the task

  const handleClose = () => {
    // TODO: Implement closing the SelectedTask area
  };

  return (
    <div className="rounded bg-gray-800 p-4">
      <button
        onClick={handleClose}
        className="right-2 top-2 text-gray-300 hover:text-white"
      >
        <XSquare className="h-8 w-8" />
      </button>
      <div className="mt-3 text-center">
        <p className="text-sm text-gray-300">Task Type</p>
        <h2 className="mb-4 text-lg font-semibold text-white">
          Task Title: A couple of sentences long
        </h2>
      </div>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center">
          <div className="mr-2 h-4 w-4 rounded-full bg-green-500"></div>
          <p className="text-sm text-gray-300">Success</p>
        </div>
        <button className="rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600">
          Pause
        </button>
      </div>
      <div className="mb-4">
        <button className="w-full rounded bg-yellow-500 px-4 py-2 text-white hover:bg-yellow-600">
          Pause Descendents
        </button>
      </div>
      <div className="mb-4">
        <button className="w-full rounded bg-red-500 px-4 py-2 text-white hover:bg-red-600">
          Restart Tree
        </button>
      </div>
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
