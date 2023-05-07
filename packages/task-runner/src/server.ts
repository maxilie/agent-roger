/* eslint-disable @typescript-eslint/consistent-type-imports */
console.log("Starting up! Importing dependencies...");

import weaviate, { type WeaviateClient } from "weaviate-ts-client2";
import * as neo4j from "neo4j-driver";

import {
  drizzle,
  type PlanetScaleDatabase,
} from "drizzle-orm/planetscale-serverless";

import { connect } from "@planetscale/database";
import { db, env, REDIS_TASK_QUEUE, RedisManager } from "agent-roger-core";
import { RunningTask } from "./running-task.js";
import { RateLimiter } from "./rate-limiter.js";

// globals
const taskRunnerID: string =
  "task-runner-" + Math.random().toString(36).slice(2, 9);
let weaviateClient: WeaviateClient;
let sqlClient: PlanetScaleDatabase;
let neo4jDriver: neo4j.Driver;
let redis: RedisManager;
const rateLimiter = new RateLimiter();

/**
 * Initializes and tests database connections.
 */
const initialize = async () => {
  // connect to weaviate
  weaviateClient = weaviate.client({
    scheme: "https",
    host: env.WEAVIATE_HOST,
    apiKey: new weaviate.ApiKey(env.WEAVIATE_KEY),
  });
  // TODO test connection
  // client
  // .schema
  // .getter()
  // .do()
  // .then((res: any) => {
  //   console.log(res);
  // })
  // .catch((err: Error) => {
  //   console.error(err)
  // });
  console.log("connected to weaviate");

  // connect to sql
  sqlClient = drizzle(
    connect({
      host: env.DATABASE_HOST,
      username: env.DATABASE_USERNAME,
      password: env.DATABASE_PASSWORD,
    })
  );
  await sqlClient.select().from(db.tasks).limit(1);
  console.log("connected to sql");

  // connect to neo4j
  neo4jDriver = neo4j.driver(
    env.NEO4J_URI,
    neo4j.auth.basic(env.NEO4J_USER, env.NEO4J_PASS)
  );
  await neo4jDriver.getServerInfo();
  console.log("connected to neo4j");

  // connect to redis & init pipeline
  redis = new RedisManager();
  console.log("connected to redis");

  // restart task queue
  const unfinishedTaskIDs = await db.getActiveTaskIDs();
  console.log(
    "initializing first task pipeline with task IDs: ",
    unfinishedTaskIDs
  );
  await redis.restartQueues(unfinishedTaskIDs || []);
};

/**
 * Runs the next pipeline of redis commands, starts promises to handle the responses, and immediately returns without calling await.
 */
const runNextPipeline = async (): Promise<void> => {
  // add to end of pipeline: move at least 5 tasks from waiting queue to processing queue.
  const numTasksToMove = Math.max(5, redis.pipeline.length);
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
  const results = await redis.pipeline.exec();
  if (results == null) return;
  for (let i = 0; i < results.length; i++) {
    // handle ignored result
    if (i in redis.ignoredPipelineIdxs) continue;
    const [err, result] = results[results.length - i - 1];

    // handle inference request result
    if (i in redis.inferenceResultPromiseResolvers) {
      inferenceResultPromises.push({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
        resolver: redis.inferenceResultPromiseResolvers[i],
        result: result as string | null,
      });
      continue;
    }

    // handle task waiting->processing result
    if (err != null || result == null || i < results.length - numTasksToMove)
      continue;
    console.log("Creating promise for taskID: ", result);
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
    taskID,
    {
      redis,
      weaviateClient,
      sqlClient,
      neo4jDriver,
    },
    rateLimiter
  );
  await runningTask.runNextStages();

  // return new Promise((resolve) => {
  //   setTimeout(() => {
  //     resolve();
  //   }, 1);
  // });
};

const main = () => {
  console.log("Running main...");
  initialize()
    .then(() => {
      Promise.resolve()
        .then(async function resolver(): Promise<void> {
          // random chance to restart task queues, just in case a new SQL task wasn't added to the waiting queue
          if (Math.random() < 0.001) {
            console.log("Restarting queues...");
            return db
              .getActiveTaskIDs()
              .then((unfinishedTaskIDs) => {
                redis
                  .restartQueues(unfinishedTaskIDs || [])
                  .then(resolver)
                  .catch(resolver);
              })
              .catch(resolver);
          }
          // run the next redis pipeline
          else {
            return runNextPipeline().then(resolver);
          }
        })
        .catch((error) => {
          console.log("Error running redis pipeline: ", error);
          console.log("Restarting in 5 seconds...");
          setTimeout(main, 5000);
        });
    })
    .catch((error) => {
      console.log("Error initializing db connections: ", error);
      console.log("Restarting in 5 seconds...");
      setTimeout(main, 5000);
    });
};

// close connections on exit
process.on("SIGINT", () => {
  console.log("Shutting down...");
  const closeConnections = async () => {
    try {
      await neo4jDriver?.close();
    } catch (_) {}
    try {
      await redis?.redis.quit();
    } catch (_) {}
    // TODO Close weaviate connection? Or is it not necessary? Or do we not need a global connection at all?
  };
  closeConnections().finally(() => {
    console.log("Successfully shut down!");
    process.exit(0);
  });
});

// entrypoint
main();
