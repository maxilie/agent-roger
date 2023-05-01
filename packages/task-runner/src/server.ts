/* eslint-disable @typescript-eslint/consistent-type-imports */
console.log("Starting up! Importing dependencies...");

import weaviate, { type WeaviateClient } from "weaviate-ts-client2";
import { handleTask, type RogerTask } from "./task.js";
import * as neo4j from "neo4j-driver";
import { Redis, Pipeline, RedisOptions } from "ioredis";

import {
  drizzle,
  type PlanetScaleDatabase,
} from "drizzle-orm/planetscale-serverless";

import { connect, Connection } from "@planetscale/database";
import { db, env, REDIS_TASK_QUEUE, RedisManager } from "agent-roger-core";

// globals
const taskRunnerID: string =
  "task-runner-" + Math.random().toString(36).slice(2, 9);
let weaviateClient: WeaviateClient;
let sqlClient: PlanetScaleDatabase;
let neo4jDriver: neo4j.Driver;
let redis: RedisManager;

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

  // connect to redis & init pipeline
  redis = new RedisManager();

  // restart task queue
  const unfinishedTaskIDs = await db.getActiveTaskIDs();
  await redis.restartQueues(unfinishedTaskIDs);
};

const runNextPipeline = async (): Promise<void> => {
  // add to pipeline: move at least 5 tasks from processing queue to waiting queue
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
  const taskPromises = [];
  const results = await redis.pipeline.exec();
  for (let i = 0; i < numTasksToMove; i++) {
    const [err, result] = results[results.length - i - 1];
    if (err != null || result == null) continue;
    console.log("Creating promise for taskID: ", result);
    taskPromises.push(processTask(result as number));
  }

  // process the batch of tasks asynchronously
  Promise.all(taskPromises).catch((error) => {
    console.error("Error processing a task: ", error);
  });
};

const processTask = async (taskID: number): Promise<void> => {
  // TODO Follow instruction from Notion to run the next stage

  // TODO ...

  // TODO get basic data from SQL

  // TODO validate TaskDefinition

  // TODO create new Stage object

  // TODO ... run the stage

  return new Promise((resolve) => {
    setTimeout(() => {
      resolve();
    }, 1);
  });
};

const main = () => {
  console.log("Running main...");
  initialize()
    .then(() => {
      Promise.resolve()
        .then(function resolver() {
          // random chance to restart task queues, just in case a new SQL task wasn't added to the queue
          if (Math.random() < 0.001) {
            console.log("Restarting queues...");
            return db
              .getActiveTaskIDs()
              .then((unfinishedTaskIDs) => {
                redis
                  .restartQueues(unfinishedTaskIDs)
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
