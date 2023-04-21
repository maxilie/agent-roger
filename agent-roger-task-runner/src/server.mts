console.log("Starting up! Importing dependencies...");

import * as dotenv from "dotenv";
import weaviate, { type WeaviateClient, ApiKey } from "weaviate-ts-client";
import { handleTask, type RogerTask } from "./task.mjs";
import type * as neo4j from "neo4j-driver"

// load env vars
dotenv.config();

import {
  drizzle,
  type PlanetScaleDatabase,
} from "drizzle-orm/planetscale-serverless";

import { connect } from "@planetscale/database";

// globals
let weaviateClient: WeaviateClient;
let sqlClient: PlanetScaleDatabase;
let neo4jDriver: neo4j.Driver;

const initialize = () => {
  // connect to weavius
  weaviateClient = weaviate.client({
    scheme: "https",
    host: "some-endpoint.weaviate.network",
    apiKey: new ApiKey(process.env.WEAVIATE_API_KEY),
  });
  console.log("connected to weavius");
  console.log(weaviateClient);

  // connect to sql
  sqlClient = drizzle(
    connect({
      host: process.env.DATABASE_HOST,
      username: process.env.DATABASE_USERNAME,
      password: 'sdfs',
    })
  );
  console.log("connected to sql");
  console.log(sqlClient);

  // connect to sql

  // Their example:
  // client.schema
  //   .getter()
  //   .do()
  //   .then((res: any) => {
  //     console.log(res);
  //   })
  //   .catch((err: Error) => {
  //     console.error(err);
  //   });
  // You can also use await instead of .then()
};

const runNextTask = async (): Promise<void> => {
  // get next task, if there is one
  const task = await getNextTask();
  if (task === null) return;

  // eslint-disable-next-line @typescript-eslint/await-thenable
  await handleTask(task);
  console.log(task.id);

  // run next task after returning to event loop
  setImmediate(runNextTask);
};

const getNextTask = (): Promise<RogerTask> => {
  // TODO scan graph db for a task with awaiting_children=false and completed=false and paused=false

  // TODO get task data from sql

  // TODO return the task with data
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({ id: 1, type: "test" });
    }, 1);
  });
};

const main = () => {
  console.log("Running main...");
  initialize();
    runNextTask().catch((error) => {
      console.log("Error running task: ", error);
      console.log('Restarting in 5 seconds...');
      setTimeout(main, 5000);
    });
};

try {
  main();
} catch (error) {
  console.log("Error starting the task runner:");
  console.log(error);
}

// close connections on exit
process.on("SIGINT", async () => {
  console.log("Shutting down...");
  try {
    await neo4jDriver?.close();
  } catch (_) { }
  console.log("Successfully shut down!");
  process.exit(0);
});
