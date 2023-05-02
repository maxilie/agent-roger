import {
  type RedisManager,
  type Json,
  type TaskDefinition,
  db,
  MAX_UNSYNC_TIME,
} from "agent-roger-core";
import { type WeaviateClient } from "weaviate-ts-client2";
import { type PlanetScaleDatabase } from "drizzle-orm/planetscale-serverless";
import type * as neo4j from "neo4j-driver";

// instead of saving every action to SQL, run for up to 10 seconds
// ...and then save results to SQL if the task wasn't updated (by the dashboard user) in the meantime
const MAX_RUN_SECS = 10;

class RunningTask {
  taskID: number;
  redis: RedisManager;
  weaviateClient: WeaviateClient;
  sqlClient: PlanetScaleDatabase;
  neo4jDriver: neo4j.Driver;
  unsavedSubTaskIDs: number[];
  unsavedStageData: { [stageIdx: number]: StageData };
  localStageIdx: number;
  startTime: Date;

  constructor(
    redis: RedisManager,
    weaviateClient: WeaviateClient,
    sqlClient: PlanetScaleDatabase,
    neo4jDriver: neo4j.Driver
  ) {
    this.redis = redis;
    this.weaviateClient = weaviateClient;
    this.sqlClient = sqlClient;
    this.neo4jDriver = neo4jDriver;
    this.unsavedSubTaskIDs = [];
  }

  async runNextStages() {
    try {
      this.startTime = new Date();
      // get task data from SQL
      const task = await db.getTaskBasicData({ taskID: this.taskID });
      this.localStageIdx = task.lastEndedStage + 1;

      // move task back to the waiting queue when the next pipeline runs
      this.redis.

      await this.get("test");
    } catch (error) {
      console.error(
        "Failed to run next stage(s) of task (id  #",
        this.taskID,
        "): "
      );
      console.error(error);
    }
  }

  /**
   * Undoes any changes we just made.
   */
  async cleanup() {
    try {
      for (const subTaskID of this.unsavedSubTaskIDs) {
        await db.deleteTaskTree({ taskID: subTaskID }, this.neo4jDriver);
      }
    } catch (err) {
      if (this.unsavedSubTaskIDs.length) {
        console.error(
          "FAILED TO CLEAN UP SUB-TASKS FROM A FAILED EXECUTION... The following sub-tasks are out-of-sync with their parent task and must be deleted from SQL and Neo4J: ",
          this.unsavedSubTaskIDs
        );
        console.error(err);
      }
    }
  }

  async get<T extends Json | null>(key: string): Promise<T> {
    // TODO
    // eslint-disable-next-line @typescript-eslint/await-thenable
    return await null;
  }

  async set(key: string, val: Json) {
    // TODO
    // eslint-disable-next-line @typescript-eslint/await-thenable
    return await "";
  }

  /**
   *
   * @param input messages for an instruction LLM (e.g. [`System: You are a JSON machine.`, `Json: {...}`] )
   * @returns the output of the LLM
   */
  async textLLM(input: string[]): Promise<string> {
    // TODO
    // eslint-disable-next-line @typescript-eslint/await-thenable
    return await "";
  }

  /**
   * Creates a sub-task and returns its ID.
   *
   * If the parent task is modified externally while task runner is executing, the sub-task will be deleted when cleanup() is called.
   */
  async subTask(newTaskDefinition: TaskDefinition): Promise<number> {
    // TODO
    const newTaskID = 0;
    this.redis.queueNewTask(newTaskID);
    // eslint-disable-next-line @typescript-eslint/await-thenable
    return newTaskID;
  }
}

export { RunningTask };
