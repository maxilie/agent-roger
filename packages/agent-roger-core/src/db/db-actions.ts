import { connection, sqlClient } from "./sql-client";
import { tasks } from "./sql-schema";
import { env } from "../env.mjs";
import { desc, isNull, eq, inArray, and } from "drizzle-orm";
import { z } from "zod";
import * as neo4j from "neo4j-driver";
import { REDIS_TASK_QUEUE, type RedisManager } from "./redis";
import * as crypto from "crypto";
import { MAX_UNSYNC_TIME } from "../constants";
import {
  taskBasicDataSchema,
  taskUpdateSchema,
  jsonSchema,
  stageDataSchema,
  taskDefinitionSchema,
  jsonObjSchema,
} from "../zod-schema";

/**
 *
 *
 * Get up to n recently updated root task IDs.
 *
 *
 */

export const InSchema_getRootTaskIDs = z.object({
  n: z.number().min(1).default(20),
});
export const OutSchema_getRootTaskIDs = z.array(z.number()).nullable();
export type InType_getRootTaskIDs = z.infer<typeof InSchema_getRootTaskIDs>;
export type OutType_getRootTaskIDs = z.infer<typeof OutSchema_getRootTaskIDs>;
export const getRootTaskIDs = async (
  input: InType_getRootTaskIDs
): Promise<OutType_getRootTaskIDs | null> => {
  try {
    const results = await sqlClient
      .select({ taskID: tasks.taskID })
      .from(tasks)
      .where(isNull(tasks.parentID))
      .orderBy(desc(tasks.timeLastUpdated))
      .limit(input.n);
    return results.map((task) => task.taskID);
  } catch (error) {
    return null;
  }
};

/**
 *
 *
 * Get IDs of all tasks that aren't paused, dead, or completed.
 *
 *
 */

export const getActiveTaskIDs = async (): Promise<OutType_getRootTaskIDs> => {
  try {
    const results = await sqlClient
      .select({ taskID: tasks.taskID })
      .from(tasks)
      .where(
        and(
          isNull(tasks.success),
          eq(tasks.dead, false),
          eq(tasks.paused, false)
        )
      );
    return results.map((task) => task.taskID);
  } catch (error) {
    return [];
  }
};

/**
 *
 *
 * Get basic data for a single task, plus stage data for the current stage and the most recently ended stage.
 *
 *
 */

export const InSchema_getTaskBasicData = z.object({
  taskID: z.number(),
});
export const OutSchema_getTaskBasicDataPlus = taskBasicDataSchema.merge(
  z.object({
    previousStageData: jsonSchema.nullable(),
    currentStageData: jsonSchema.nullable(),
  })
);
export type InType_getTaskBasicData = z.infer<typeof InSchema_getTaskBasicData>;
export type OutType_getTaskBasicData = z.infer<typeof taskBasicDataSchema>;
export type OutType_getTaskBasicDataPlus = z.infer<
  typeof OutSchema_getTaskBasicDataPlus
>;
export const getTaskBasicData = async (
  input: InType_getTaskBasicData
): Promise<OutType_getTaskBasicDataPlus | null> => {
  try {
    // see: https://github.com/planetscale/database-js
    const query = `SELECT :selectedFields, \
    CASE WHEN :lastEndedStage = -1 THEN NULL \
    WHEN :lastEndedStage = 0 THEN :stage0Data \
    WHEN :lastEndedStage = 1 THEN :stage1Data \
    WHEN :lastEndedStage = 2 THEN :stage2Data \
    WHEN :lastEndedStage = 3 THEN :stage3Data \
    WHEN :lastEndedStage = 4 THEN :stage4Data \
    WHEN :lastEndedStage = 5 THEN :stage5Data \
    WHEN :lastEndedStage = 6 THEN :stage6Data \
    WHEN :lastEndedStage = 7 THEN :stage7Data \
    WHEN :lastEndedStage = 8 THEN :stage8Data \
    WHEN :lastEndedStage = 9 THEN :stage9Data \
    WHEN :lastEndedStage = 10 THEN :stage10Data \
    WHEN :lastEndedStage = 11 THEN :stage11Data \
    WHEN :lastEndedStage = 12 THEN :stage12Data \
    WHEN :lastEndedStage = 13 THEN :stage13Data \
    WHEN :lastEndedStage = 14 THEN :stage14Data \
    WHEN :lastEndedStage = 15 THEN :stage15Data \
    WHEN :lastEndedStage = 16 THEN :stage16Data \
    WHEN :lastEndedStage = 17 THEN :stage17Data \
    WHEN :lastEndedStage = 18 THEN :stage18Data \
    WHEN :lastEndedStage = 19 THEN :stage19Data \
    WHEN :lastEndedStage = 20 THEN :stage20Data \
    WHEN :lastEndedStage = 21 THEN :stage21Data \
    WHEN :lastEndedStage = 22 THEN :stage22Data \
    WHEN :lastEndedStage = 23 THEN :stage23Data \
    END AS previousStageData, \
    CASE WHEN :lastEndedStage = -1 THEN :stage0Data \
    WHEN :lastEndedStage = 0 THEN :stage1Data \
    WHEN :lastEndedStage = 1 THEN :stage2Data \
    WHEN :lastEndedStage = 2 THEN :stage3Data \
    WHEN :lastEndedStage = 3 THEN :stage4Data \
    WHEN :lastEndedStage = 4 THEN :stage5Data \
    WHEN :lastEndedStage = 5 THEN :stage6Data \
    WHEN :lastEndedStage = 6 THEN :stage7Data \
    WHEN :lastEndedStage = 7 THEN :stage8Data \
    WHEN :lastEndedStage = 8 THEN :stage9Data \
    WHEN :lastEndedStage = 9 THEN :stage10Data \
    WHEN :lastEndedStage = 10 THEN :stage11Data \
    WHEN :lastEndedStage = 11 THEN :stage12Data \
    WHEN :lastEndedStage = 12 THEN :stage13Data \
    WHEN :lastEndedStage = 13 THEN :stage14Data \
    WHEN :lastEndedStage = 14 THEN :stage15Data \
    WHEN :lastEndedStage = 15 THEN :stage16Data \
    WHEN :lastEndedStage = 16 THEN :stage17Data \
    WHEN :lastEndedStage = 17 THEN :stage18Data \
    WHEN :lastEndedStage = 18 THEN :stage19Data \
    WHEN :lastEndedStage = 19 THEN :stage20Data \
    WHEN :lastEndedStage = 20 THEN :stage21Data \
    WHEN :lastEndedStage = 21 THEN :stage22Data \
    WHEN :lastEndedStage = 22 THEN :stage23Data \
    WHEN :lastEndedStage = 23 THEN NULL \
    END AS currentStageData FROM tasks WHERE taskID = :taskID`;
    const selectedFields = [
      tasks.taskID.name,
      tasks.paused.name,
      tasks.success.name,
      tasks.dead.name,
      tasks.lastEndedStage.name,
      tasks.lastInteractionMarker.name,
      tasks.isAbstract.name,
      tasks.parentID.name,
      tasks.taskDefinition.name,
      tasks.initialInputFields.name,
      tasks.initialContextFields.name,
      tasks.initialContextSummary.name,
      tasks.timeCreated.name,
      tasks.timeLastUpdated.name,
      tasks.resultData.name,
      tasks.runtimeErrors.name,
    ];
    const row = (
      await connection.execute(
        query,
        {
          selectedFields: selectedFields.join(", "),
          lastEndedStage: tasks.lastEndedStage.name,
          taskID: input.taskID,
          stage0Data: tasks.stage0Data.name,
          stage1Data: tasks.stage1Data.name,
          stage2Data: tasks.stage2Data.name,
          stage3Data: tasks.stage3Data.name,
          stage4Data: tasks.stage4Data.name,
          stage5Data: tasks.stage5Data.name,
          stage6Data: tasks.stage6Data.name,
          stage7Data: tasks.stage7Data.name,
          stage8Data: tasks.stage8Data.name,
          stage9Data: tasks.stage9Data.name,
          stage10Data: tasks.stage10Data.name,
          stage11Data: tasks.stage11Data.name,
          stage12Data: tasks.stage12Data.name,
          stage13Data: tasks.stage13Data.name,
          stage14Data: tasks.stage14Data.name,
          stage15Data: tasks.stage15Data.name,
          stage16Data: tasks.stage16Data.name,
          stage17Data: tasks.stage17Data.name,
          stage18Data: tasks.stage18Data.name,
          stage19Data: tasks.stage19Data.name,
          stage20Data: tasks.stage20Data.name,
          stage21Data: tasks.stage21Data.name,
          stage22Data: tasks.stage22Data.name,
          stage23Data: tasks.stage23Data.name,
        },
        { as: "object" }
      )
    ).rows[0];
    const rowObj = jsonObjSchema.parse(row);
    const taskData = {
      taskID: rowObj[tasks.taskID.name],
      paused: rowObj[tasks.paused.name],
      success: rowObj[tasks.success.name],
      dead: rowObj[tasks.dead.name],
      lastEndedStage: rowObj[tasks.lastEndedStage.name],
      lastInteractionMarker: rowObj[tasks.lastInteractionMarker.name],
      isAbstract: rowObj[tasks.isAbstract.name],
      parentID: rowObj[tasks.parentID.name],
      taskDefinition: rowObj[tasks.taskDefinition.name],
      initialInputFields: rowObj[tasks.initialInputFields.name],
      initialContextFields: rowObj[tasks.initialContextFields.name],
      initialContextSummary: rowObj[tasks.initialContextSummary.name],
      timeCreated: rowObj[tasks.timeCreated.name],
      timeLastUpdated: rowObj[tasks.timeLastUpdated.name],
      resultData: rowObj[tasks.resultData.name],
      runtimeErrors: rowObj[tasks.runtimeErrors.name],
      previousStageData: rowObj["previousStageData"],
      currentStageData: rowObj["currentStageData"],
    };
    return OutSchema_getTaskBasicDataPlus.parse(taskData);
  } catch (e) {
    console.error("Failed to get task basic data from SQL.");
    console.error(e);
    return null;
  }
};

/**
 *
 *
 * Get basic data for multiple tasks.
 *
 *
 */

export const InSchema_getTaskBasicDatas = z.object({
  taskIDs: z.array(z.number().min(1)),
});
export const OutSchema_getTaskBasicDatas = z.array(taskBasicDataSchema);
export type InType_getTaskBasicDatas = z.infer<
  typeof InSchema_getTaskBasicDatas
>;
export type OutType_getTaskBasicDatas = z.infer<
  typeof OutSchema_getTaskBasicDatas
>;
export const getTaskBasicDatas = async (
  input: InType_getTaskBasicDatas
): Promise<OutType_getTaskBasicDatas | []> => {
  try {
    if (!!!input.taskIDs || !input.taskIDs.length) {
      return [];
    }
    const results = await sqlClient
      .select({
        taskID: tasks.taskID,
        paused: tasks.paused,
        success: tasks.success,
        dead: tasks.dead,
        lastEndedStage: tasks.lastEndedStage,
        isAbstract: tasks.isAbstract,
        parentID: tasks.parentID,
        taskDefinition: tasks.taskDefinition,
        initialInputFields: tasks.initialInputFields,
        initialContextFields: tasks.initialContextFields,
        initialContextSummary: tasks.initialContextSummary,
        timeCreated: tasks.timeCreated,
        timeLastUpdated: tasks.timeLastUpdated,
        resultData: tasks.resultData,
        runtimeErrors: tasks.runtimeErrors,
      })
      .from(tasks)
      .where(inArray(tasks.taskID, input.taskIDs));
    return results && results.length
      ? OutSchema_getTaskBasicDatas.parse(results)
      : [];
  } catch (e) {
    return [];
  }
};

/**
 *
 *
 * Get data for a single stage of a task.
 *
 *
 */

export const InSchema_getTaskStageNData = z.object({
  taskID: z.number(),
  stageN: z.number().min(0).max(23),
});
export type InType_getTaskStageNData = z.infer<
  typeof InSchema_getTaskStageNData
>;

export const OutSchema_getTaskStageNData = stageDataSchema.nullable();
export type OutType_getStageNData = z.infer<typeof OutSchema_getTaskStageNData>;

const nToStageNColumn = new Map<
  number,
  | typeof tasks.stage0Data
  | typeof tasks.stage1Data
  | typeof tasks.stage2Data
  | typeof tasks.stage3Data
  | typeof tasks.stage4Data
  | typeof tasks.stage5Data
  | typeof tasks.stage6Data
  | typeof tasks.stage7Data
  | typeof tasks.stage8Data
  | typeof tasks.stage9Data
  | typeof tasks.stage10Data
  | typeof tasks.stage11Data
  | typeof tasks.stage12Data
  | typeof tasks.stage13Data
  | typeof tasks.stage14Data
  | typeof tasks.stage15Data
  | typeof tasks.stage16Data
  | typeof tasks.stage17Data
  | typeof tasks.stage18Data
  | typeof tasks.stage19Data
  | typeof tasks.stage20Data
  | typeof tasks.stage21Data
  | typeof tasks.stage22Data
  | typeof tasks.stage23Data
>([
  [0, tasks.stage0Data],
  [1, tasks.stage1Data],
  [2, tasks.stage2Data],
  [3, tasks.stage3Data],
  [4, tasks.stage4Data],
  [5, tasks.stage5Data],
  [6, tasks.stage6Data],
  [7, tasks.stage7Data],
  [8, tasks.stage8Data],
  [9, tasks.stage9Data],
  [10, tasks.stage10Data],
  [11, tasks.stage11Data],
  [12, tasks.stage12Data],
  [13, tasks.stage13Data],
  [14, tasks.stage14Data],
  [15, tasks.stage15Data],
  [16, tasks.stage16Data],
  [17, tasks.stage17Data],
  [18, tasks.stage18Data],
  [19, tasks.stage19Data],
  [20, tasks.stage20Data],
  [21, tasks.stage21Data],
  [22, tasks.stage22Data],
  [23, tasks.stage23Data],
]);
export const getTaskStageNData = async (
  input: InType_getTaskStageNData
): Promise<OutType_getStageNData> => {
  try {
    if (InSchema_getTaskStageNData.safeParse(input).success) {
      return null;
    }
    const results = await sqlClient
      .select({
        stageNData: nToStageNColumn.get(input.stageN) ?? tasks.stage0Data,
      })
      .from(tasks)
      .where(eq(tasks.taskID, input.taskID));
    return results && results.length ? stageDataSchema.parse(results[0]) : null;
  } catch (e) {
    return null;
  }
};

/**
 *
 *
 * Update a task's data in SQL and Neo4J.
 *
 * If called from outside the task runner, saving will take a few seconds to confirm task runner does not overwrite the changes.
 *
 * null and undefined fields are IGNORED -- if you want to clear a field, use {} or "".
 * setting a json field to {}, or a string field to "", sets the respective column to null or "".
 *
 * // TODO Move the dashboard validation function to db-helpers or sth, and use it in the task runner too.
 * // TODO Move the above message, "setting a json field...", to the helper function.
 *
 *
 */

export const InSchema_saveTaskData = z.object({
  taskID: z.number().min(1),
  newFields: taskUpdateSchema,
});
export type InType_saveTaskData = z.infer<typeof InSchema_saveTaskData>;
export const saveTaskData = async (
  input: InType_saveTaskData,
  neo4jDriver: neo4j.Driver,
  redis?: RedisManager,
  isTaskRunner = false
) => {
  // save to sql
  try {
    const marker = crypto.pseudoRandomBytes(12).toString("hex");
    let retries = 0;
    while (retries < 3) {
      // stop processing the task
      if (!isTaskRunner && redis) {
        await redis.redis
          .multi()
          .lrem(REDIS_TASK_QUEUE.processing, 0, input.taskID)
          .lrem(REDIS_TASK_QUEUE.waiting, 0, input.taskID)
          .exec();
      }
      // update data
      await sqlClient
        .update(tasks)
        .set({
          lastInteractionMarker: marker,
          ...input.newFields,
        })
        .where(eq(tasks.taskID, input.taskID));
      if (isTaskRunner) break;
      // wait for data to potentially be overwritten by a task runner
      await new Promise((resolve) =>
        setTimeout(resolve, MAX_UNSYNC_TIME + 500)
      );
      // check if data was overwritten
      const nextResponse = await sqlClient
        .select({ lastInteractionMarker: tasks.lastInteractionMarker })
        .from(tasks)
        .where(eq(tasks.taskID, input.taskID));
      // try again if data was overwritten
      if (nextResponse[0].lastInteractionMarker == marker) break;
      retries++;
    }
  } catch (e) {
    console.error("FAILED to update task in SQL (id:  ", input.taskID, ")");
    console.error(e);
  }

  // update dead/alive status in neo4j
  let neo4jSession: neo4j.Session | undefined;
  try {
    neo4jSession = neo4jDriver.session();

    // execute query
    await neo4jSession.run(
      "MATCH (task:Task {taskID: idParam,}) SET task.isDead = $isDeadParam",
      {
        idParam: input.taskID,
        isDeadParam: input.newFields.dead ? "true" : "false",
      }
    );
  } catch (error) {
    console.error("FAILED to update task in Neo4J (id:  ", input.taskID, ")");
    console.error(error);
  } finally {
    await neo4jSession?.close();
  }
};

/**
 *
 *
 * Create a new root task in SQL & Neo4J, and push to redis queue of waiting tasks.
 *
 * // TODO in protected.js, make sure to exec() the redis.pipeline before closing it
 *
 *
 */

export const InSchema_createRootTask = z.object({
  taskDefinition: jsonSchema,
  initialInputFields: jsonSchema.nullish(),
  initialContextFields: jsonSchema.nullish(),
  initialContextSummary: z.string().nullish(),
});
export const OutSchema_createRootTask = z.number();
type InType_createRootTask = z.infer<typeof InSchema_createRootTask>;
type OutType_createRootTask = z.infer<typeof OutSchema_createRootTask>;
export const createRootTask = async (
  input: InType_createRootTask,
  neo4jDriver: neo4j.Driver,
  redis: RedisManager
): Promise<OutType_createRootTask | null> => {
  // save to sql
  let newTaskID: string;
  try {
    newTaskID = (
      await sqlClient.insert(tasks).values({
        isAbstract: true,
        taskDefinition: input.taskDefinition,
        ...(input.initialInputFields
          ? { initialInputFields: input.initialInputFields }
          : {}),
        ...(input.initialContextFields
          ? { initialContextFields: input.initialContextFields }
          : {}),
        ...(input.initialContextSummary
          ? { initialContextSummary: input.initialContextSummary }
          : {}),
      })
    ).insertId;
  } catch (e) {
    console.error(
      "Error creating new root task in SQL with input query: ",
      JSON.stringify(input)
    );
    return null;
  }

  // verify a new id was created
  if (newTaskID.length == 0) {
    console.error(
      "Failed to create new root task in SQL with input query: ",
      JSON.stringify(input)
    );
    return null;
  }

  // save to neo4j
  let neo4jSession: neo4j.Session | undefined;
  try {
    neo4jSession = neo4jDriver.session();

    // execute query
    await neo4jSession.run(
      "CREATE (task:Task {taskID: idParam, isDead: 'false'})",
      {
        idParam: +newTaskID,
      }
    );
    await neo4jSession.close();
  } catch (error) {
    console.error(
      "FAILED to create new root task in Neo4J (id:  ",
      newTaskID,
      "). Delete the failed task in SQL (not urgent)."
    );
    console.error(error);
    try {
      await neo4jSession?.close();
    } finally {
      return null;
    }
  }

  // add to redis queue of waiting tasks
  try {
    redis.queueNewTask(+newTaskID);
  } catch (error) {
    console.error(
      "FAILED to add new root task to redis waiting queue (id:  ",
      newTaskID,
      "). Not to worry -- a task runner will add it to the queue in several seconds."
    );
    console.error(error);
  }
  return +newTaskID;
};

/**
 *
 *
 * Create a child task of another task. Save it in SQL & Neo4J, and push to redis queue of waiting tasks.
 *
 * // TODO in protected.js, make sure to exec() the redis.pipeline before closing it
 *
 *
 */

export const InSchema_createChildTask = z.object({
  parentID: z.number(),
  taskDefinition: taskDefinitionSchema,
  initialInputFields: jsonObjSchema.nullish(),
  initialContextFields: jsonObjSchema.nullish(),
  initialContextSummary: z.string().nullish(),
});
export const OutSchema_createChildTask = z.number();
export type InType_createChildTask = z.infer<typeof InSchema_createChildTask>;
export type OutType_createChildTask = z.infer<typeof OutSchema_createChildTask>;
export const createChildTask = async (
  input: InType_createChildTask,
  neo4jDriver: neo4j.Driver,
  redis: RedisManager
): Promise<OutType_createChildTask | null> => {
  // save to sql
  const newTaskID: string = (
    await sqlClient.insert(tasks).values({
      isAbstract: input.taskDefinition.isAbstract,
      parentID: input.parentID,
      taskDefinition: input.taskDefinition,
      ...(input.initialInputFields
        ? { initialInputFields: input.initialInputFields }
        : {}),
      ...(input.initialContextFields
        ? { initialContextFields: input.initialContextFields }
        : {}),
      ...(input.initialContextSummary
        ? { initialContextSummary: input.initialContextSummary }
        : {}),
    })
  ).insertId;

  // verify a new id was created
  if (newTaskID.length == 0) {
    console.error(
      "Failed to create new child task in SQL with values: ",
      JSON.stringify(input)
    );
    return null;
  }

  // save to neo4j
  let neo4jSession: neo4j.Session | undefined = undefined;
  try {
    neo4jDriver = neo4j.driver(
      env.NEO4J_URI,
      neo4j.auth.basic(env.NEO4J_USER, env.NEO4J_PASS)
    );
    neo4jSession = neo4jDriver.session();

    // execute query
    await neo4jSession.run(
      "MATCH (parentTask:Task {taskID: $parentTaskIDParam}) \
          CREATE (newTask:Task {taskID: $newTaskIDParam, isDead: 'false'}) \
          CREATE (parentTask)-[:SPAWNED]->(newTask)",
      {
        parentTaskIDParam: input.parentID,
        newTaskIDParam: +newTaskID,
      }
    );
    await neo4jSession.close();
  } catch (error) {
    console.error(
      "FAILED to create new child task in Neo4J (id:  ",
      newTaskID,
      "). Delete the failed task in SQL to avoid orphaned nodes in Neo4J."
    );
    console.error(error);
    try {
      await neo4jSession?.close();
    } finally {
      return null;
    }
  }

  // add to redis queue of waiting tasks
  try {
    redis.queueNewTask(+newTaskID);
  } catch (error) {
    console.error(
      "FAILED to add new root task to redis waiting queue (id:  ",
      newTaskID,
      "). Not to worry -- a task runner will add it to the queue in several seconds."
    );
    console.error(error);
  }
  return +newTaskID;
};

/**
 *
 *
 * Get IDs of task with `rootTaskID`, and all tasks descended from it.
 *
 *
 */
export const InSchema_getTaskTreeIDs = z.object({
  rootTaskID: z.number().min(1),
});
export type InType_getTaskTreeIDs = z.infer<typeof InSchema_getTaskTreeIDs>;
export const getTaskTreeIDs = async (
  input: InType_getTaskTreeIDs,
  neo4jDriver: neo4j.Driver
): Promise<number[]> => {
  if (!!!input.rootTaskID) {
    return [];
  }
  // get neo4j connection
  let neo4jSession: neo4j.Session | undefined = undefined;
  try {
    neo4jSession = neo4jDriver.session();

    // execute query
    const result = await neo4jSession.run(
      "MATCH (root_task:Task {taskID: $idParam}) \
          CALL apoc.path.subgraphAll(root_task, {relationshipFilter: 'SPAWNED>', maxLevel: -1}) YIELD nodes, relationships \
          UNWIND relationships AS relation \
          RETURN startNode(relation) AS source, endNode(relation) AS target; ",
      {
        idParam: input.rootTaskID,
      }
    );
    await neo4jSession.close();

    // process nodes
    const taskIDs = new Set<number>([input.rootTaskID]);
    result.records.forEach((record) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      taskIDs.add(record.get("source").properties.taskID.toInt());
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      taskIDs.add(record.get("target").properties.taskID.toInt());
    });

    // return unique task IDs
    return Array.from(taskIDs);

    // handle errors
  } catch (error) {
    console.error(
      "FAILED to get task graph for rootTaskID: ",
      input.rootTaskID
    );
    console.error(error);
    try {
      await neo4jSession?.close();
    } finally {
      return [];
    }
  }
};

/**
 * Delete task (in SQL and Neo4J) with `taskID`, and all its descendant tasks.
 */
export const InSchema_deleteTaskTree = z.object({
  taskID: z.number().min(1),
});
export type InType_deleteTaskTree = z.infer<typeof InSchema_deleteTaskTree>;
export const deleteTaskTree = async (
  input: InType_deleteTaskTree,
  neo4jDriver: neo4j.Driver
): Promise<void> => {
  if (!!!input.taskID) {
    return;
  }
  const taskIDsToDelete = new Set([input.taskID]);
  try {
    const neo4jSession = neo4jDriver.session();

    // get nodes from neo4j
    const result = await neo4jSession.run(
      "MATCH (root_task:Task {taskID: $idParam}) \
          CALL apoc.path.subgraphAll(root_task, {relationshipFilter: 'SPAWNED>', maxLevel: -1}) YIELD nodes, relationships \
          UNWIND relationships AS relation \
          RETURN startNode(relation) AS source, endNode(relation) AS target; ",
      {
        idParam: input.taskID,
      }
    );

    // process nodes from neo4j
    result.records.forEach((record) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      taskIDsToDelete.add(record.get("source").properties.taskID.toInt());
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      taskIDsToDelete.add(record.get("target").properties.taskID.toInt());
    });

    // delete nodes and relationships in neo4j
    await neo4jSession.run(
      "MATCH (root_task:Task {taskID: $idParam}) \
      CALL apoc.path.subgraphAll(root_task, {relationshipFilter: 'SPAWNED>', maxLevel: -1}) YIELD nodes, relationships \
      FOREACH (relation IN relationships | DELETE relation) \
      FOREACH (node IN nodes | DELETE node); ",
      {
        idParam: input.taskID,
      }
    );
    await neo4jSession.close();

    // delete tasks in SQL
    await sqlClient
      .delete(tasks)
      .where(inArray(tasks.taskID, Array.from(taskIDsToDelete)));

    // handle errors
  } catch (error) {
    console.error("FAILED to delete task tree rooted at task: ", input.taskID);
    console.error(error);
  }
};

/**
 * Get a task tree (nodes & relationships) rooted at the node with taskID=rootTaskID.
 */

export const InSchema_getTaskTree = z.object({
  rootTaskID: z.number().nullish(),
});
export const OutSchema_getTaskTree = z.object({
  taskIDs: z.array(z.number()),
  links: z.array(
    z.object({
      source: z.number(),
      target: z.number(),
    })
  ),
  tasks: z.array(taskBasicDataSchema),
});
export type InType_getTaskTree = z.infer<typeof InSchema_getTaskTree>;
export type OutType_getTaskTree = z.infer<typeof OutSchema_getTaskTree>;
export const getTaskTree = async (
  input: InType_getTaskTree,
  neo4jDriver: neo4j.Driver
): Promise<OutType_getTaskTree> => {
  if (input.rootTaskID == null || input.rootTaskID == undefined) {
    return { taskIDs: [], links: [], tasks: [] };
  }
  // get neo4j connection
  let neo4jSession: neo4j.Session | undefined = undefined;
  try {
    neo4jSession = neo4jDriver.session();

    // execute query
    const result = await neo4jSession.run(
      "MATCH (root_task:Task {taskID: $idParam}) \
          CALL apoc.path.subgraphAll(root_task, {relationshipFilter: 'SPAWNED>', maxLevel: -1}) YIELD nodes, relationships \
          UNWIND relationships AS relation \
          RETURN startNode(relation) AS source, relation, endNode(relation) AS target; ",
      {
        idParam: input.rootTaskID,
      }
    );
    await neo4jSession.close();

    // process nodes and links
    const taskIDs = new Set<number>([input.rootTaskID]);
    const links: { source: number; target: number }[] = [];
    result.records.forEach((record) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      taskIDs.add(record.get("source").properties.taskID.toInt());
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      taskIDs.add(record.get("target").properties.taskID.toInt());
      links.push({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment
        source: record.get("source").properties.taskID.toInt(),
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment
        target: record.get("target").properties.taskID.toInt(),
      });
    });

    // get task data from task ids
    const taskDatas = await getTaskBasicDatas({ taskIDs: Array.from(taskIDs) });
    return { taskIDs: Array.from(taskIDs), links, tasks: taskDatas || [] };

    // handle errors
  } catch (error) {
    console.error(
      "FAILED to get task graph for rootTaskID: ",
      input.rootTaskID
    );
    console.error(error);
    try {
      await neo4jSession?.close();
    } finally {
      return { taskIDs: [], links: [], tasks: [] };
    }
  }
};
