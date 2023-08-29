/* eslint-disable @typescript-eslint/consistent-type-imports */
console.log("Starting up! Importing dependencies...");

import * as neo4j from "neo4j-driver";
import { type WeaviateClient } from "weaviate-ts-client";

import { db, env, REDIS_TASK_QUEUE, RedisManager } from "agent-roger-core";
import {
  MAX_CONCURRENT_TASKS,
  MIN_TIME_BETWEEN_REDIS_CALLS,
} from "./constants.js";
import { RunningTask } from "./running-task.js";
import { RateLimiter } from "./rate-limiter.js";
import {
  initInjectedPrompts,
  mergeNewInjectedPrompts,
} from "./injected-prompt-fns.js";

// settings
const RESET_PIPELINE_INTERVAL_SECS = 15;
const SYNC_NEW_PROMPTS_INTERVAL_SECS = 3;

// globals
const taskRunnerID: string =
  "task-runner-" + Math.random().toString(36).slice(2, 9);
let weaviateClient: WeaviateClient;
let neo4jDriver: neo4j.Driver;
let redis: RedisManager;
const rateLimiter = new RateLimiter();
let SHUTTING_DOWN = false;
let FULLY_INITIALIZED = false;
let IMPORTING_INJECTED_PROMPTS = false;
const runningTaskCleanupFns: (() => Promise<void>)[] = [];
const runningTaskIDs = new Set<number>();
let lastRedisCallTime = new Date().getTime();
let lastPipelineResetTime = new Date().getTime();
let lastInjectedPromptsSyncTime = new Date().getTime();
// every 5 seconds, print the number of tasks running
const statusTimer = setInterval(() => {
  if (SHUTTING_DOWN || !FULLY_INITIALIZED) return;
  console.log(`Tasks running: ${String(runningTaskIDs.size)}`);
}, 5000);

/**
 * Initializes and tests database connections.
 */
const initialize = async () => {
  FULLY_INITIALIZED = false;
  // connect to weaviate
  weaviateClient = db.weaviateHelp.createWeaviateClient();
  // ensure weaviate schema are created
  if (!(await db.weaviateHelp.isConnectionValid(weaviateClient))) {
    console.error("Could not connect to weaviate");
    process.exit(1);
  }
  console.log("connected to weaviate");

  // import injected prompts
  console.log("syncing injected prompts...");
  try {
    IMPORTING_INJECTED_PROMPTS = true;
    await initInjectedPrompts(weaviateClient);
    IMPORTING_INJECTED_PROMPTS = false;
  } catch (err) {
    console.error("Error syncing injected prompts:");
    console.error(err);
    process.exit(1);
  }

  // connect to neo4j
  neo4jDriver = neo4j.driver(
    env.NEO4J_URI,
    neo4j.auth.basic(env.NEO4J_USER, env.NEO4J_PASS)
  );
  await neo4jDriver.getServerInfo();
  console.log("connected to neo4j");

  // connect to redis & init pipeline
  redis = new RedisManager();
  await redis.redis.ping();
  console.log("connected to redis");

  // restart task queue
  const unfinishedTaskIDs = await db.getActiveTaskIDs();
  if (unfinishedTaskIDs && unfinishedTaskIDs.length > MAX_CONCURRENT_TASKS) {
    unfinishedTaskIDs.splice(MAX_CONCURRENT_TASKS);
  }
  console.log(
    "resetting redis task queue and initializing it with task IDs: ",
    unfinishedTaskIDs
  );
  FULLY_INITIALIZED = true;
  await redis.restartQueues(
    unfinishedTaskIDs?.filter((taskID) => !runningTaskIDs.has(taskID)) || []
  );
};

/**
 * Runs the next pipeline of redis commands, starts promises to handle the responses, and immediately returns without calling await.
 */
const runNextPipeline = async (): Promise<void> => {
  // wait a bit if the last redis call was too recent
  while (
    new Date().getTime() - lastRedisCallTime <
    MIN_TIME_BETWEEN_REDIS_CALLS
  ) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  // add to end of pipeline: move at least 5 tasks from waiting queue to processing queue.
  const numTasksToMove = Math.min(
    MAX_CONCURRENT_TASKS - runningTaskIDs.size,
    Math.max(5, redis.pipeline.length)
  );
  for (let i = 0; i < numTasksToMove; i++) {
    redis.pipeline.lmove(
      REDIS_TASK_QUEUE.waiting,
      REDIS_TASK_QUEUE.processing,
      "LEFT",
      "RIGHT"
    );
  }

  // execute pipeline and get new task IDs to process
  const taskPromises: Promise<void>[] = [];
  const inferenceResultPromises: {
    resolver: (result: string | null) => void;
    result: string | null;
  }[] = [];
  lastRedisCallTime = new Date().getTime();
  const results = await redis.pipeline.exec();
  redis.pipeline = redis.redis.pipeline();
  if (results == null || results == undefined) return;
  for (let i = 0; i < results.length; i++) {
    // handle ignored result
    if (i in redis.ignoredPipelineIdxs || !(i in results) || !results[i])
      continue;
    const [err, result] = results[i];

    // handle inference request result
    if (redis.inferenceResultPromiseResolvers[i]) {
      inferenceResultPromises.push({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
        resolver: redis.inferenceResultPromiseResolvers[i],
        result: result as string | null,
      });
      continue;
    }

    // handle task waiting->processing result
    if (
      err != null ||
      result == null ||
      i < results.length - numTasksToMove ||
      runningTaskIDs.has(result as number)
    ) {
      continue;
    }
    taskPromises.push(processTask(result as number));
  }

  // reset pipeline vars
  redis.inferenceResultPromiseResolvers = {};
  redis.ignoredPipelineIdxs = [];

  // create a batch of promises
  const allPromises = new Array(...taskPromises);
  inferenceResultPromises.forEach(
    (data: {
      resolver: (result: string | null) => void;
      result: string | null;
    }) => {
      allPromises.push(
        new Promise((resolve) => {
          data.resolver(data.result);
          resolve();
        })
      );
    }
  );

  // start the batch of promises and don't await; immediately run the next pipeline
  Promise.all(taskPromises).catch((error) => {
    console.error("Error processing a task: ", error);
  });
};

const processTask = async (taskID: number): Promise<void> => {
  const runningTask = new RunningTask(
    +taskID,
    {
      redis,
      weaviateClient,
      neo4jDriver,
    },
    rateLimiter
  );
  if (runningTaskIDs.has(+taskID)) return;
  runningTaskIDs.add(+taskID);
  const cleanupFn = runningTask.cleanup.bind(runningTask);
  runningTaskCleanupFns.push(cleanupFn);
  await runningTask.runNextStages();
  runningTaskCleanupFns.splice(runningTaskCleanupFns.indexOf(cleanupFn), 1);
  runningTaskIDs.delete(+taskID);
};

const main = () => {
  console.log("Running main...");

  // initialize connections
  initialize()
    .then(async () => {
      // run task pipeline logic
      while (true) {
        // merge new injected prompts every 2 seconds
        if (
          !IMPORTING_INJECTED_PROMPTS &&
          (new Date().getTime() - lastInjectedPromptsSyncTime) / 1000 >
            SYNC_NEW_PROMPTS_INTERVAL_SECS
        ) {
          new Promise<void>((resolve) => {
            IMPORTING_INJECTED_PROMPTS = true;
            mergeNewInjectedPrompts(weaviateClient).finally(() => resolve());
          }).finally(() => {
            lastInjectedPromptsSyncTime = new Date().getTime();
            IMPORTING_INJECTED_PROMPTS = false;
          });
        }

        // restart task queues every 15 seconds, just in case a new SQL task wasn't added to the waiting queue
        if (SHUTTING_DOWN) return;
        if (
          (new Date().getTime() - lastPipelineResetTime) / 1000 >
          RESET_PIPELINE_INTERVAL_SECS
        ) {
          console.log("Restarting queues...");
          try {
            const unfinishedTaskIDs = await db.getActiveTaskIDs();
            if (SHUTTING_DOWN) return;
            await redis.restartQueues(
              unfinishedTaskIDs?.filter(
                (taskID) => !runningTaskIDs.has(taskID)
              ) || []
            );
          } catch (error) {
            console.error("Error restarting task queues: ");
            console.error(error);
          }
          lastPipelineResetTime = new Date().getTime();
        }

        // run the next redis pipeline
        try {
          if (SHUTTING_DOWN) return;
          await runNextPipeline();
        } catch (error) {
          console.error("Error running redis pipeline: ");
          console.error(error);
          if (SHUTTING_DOWN) return;
          console.log("");
          console.log("");
          console.log("");
          console.log("Restarting in 5 seconds...");
          setTimeout(main, 5000);
          break;
        }
      }
    })
    .catch((error) => {
      console.error("Error initializing the task runner: ", error);
      console.log("Restarting in 5 seconds...");
      if (SHUTTING_DOWN) return;
      setTimeout(main, 5000);
    });
};

// close connections on exit
process.on("SIGINT", () => {
  console.log("Shutting down...");
  console.log("");
  SHUTTING_DOWN = true;
  clearInterval(statusTimer);
  const cleanupTasks = async () => {
    if (runningTaskIDs.size > 0) {
      console.log(
        `Waiting for ${String(runningTaskIDs.size)} tasks to clean up...`
      );
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      try {
        await Promise.allSettled(runningTaskCleanupFns);
      } catch (_) {}
      let retries = 0;
      while (retries < 5 && runningTaskIDs.size > 0) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        retries++;
      }
      if (retries == 10) {
        console.warn(
          "Tasks did not clean up in time, so there could be dangling sub-tasks in SQL and Neo4J whose parent tasks are unaware of them."
        );
      } else {
        console.log("All tasks cleaned up!");
      }
    }
  };
  const closeConnections = async () => {
    console.log("Closing connections...");
    try {
      await neo4jDriver?.close();
    } catch (_) {}
    try {
      await redis?.redis.quit();
    } catch (_) {}
    // TODO Close weaviate connection? Or is it not necessary? Or do we not need a global connection at all?
    console.log("Successfully shut down!");
    process.exit(0);
  };
  cleanupTasks()
    .then(closeConnections)
    .finally(() => {
      console.log("Successfully shut down!");
      process.exit(0);
    });
});

// entrypoint
main();
