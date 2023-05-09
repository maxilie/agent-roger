import { connection, sqlClient } from "./sql-client.js";
import { tasks } from "./sql-schema.js";
import { env } from "../env.mjs";
import { desc, isNull, eq, inArray, and } from "drizzle-orm";
import * as neo4j from "neo4j-driver";
import { REDIS_TASK_QUEUE, type RedisManager } from "./redis.js";
import * as crypto from "crypto";
import { MAX_UNSYNC_TIME } from "../constants/index.js";
import {
  stageDataSchema,
  jsonObjSchema,
  InSchema_getTaskStageNData,
  OutSchema_getTaskBasicDataPlus,
  OutSchema_getTaskBasicDatas,
  type InType_getRootTaskIDs,
  type OutType_getRootTaskIDs,
  type InType_getTaskBasicData,
  type OutType_getTaskBasicDataPlus,
  type InType_getTaskBasicDatas,
  type OutType_getTaskBasicDatas,
  type InType_getTaskStageNData,
  type OutType_getStageNData,
  type InType_saveTaskData,
  type InType_createRootTask,
  type OutType_createRootTask,
  type InType_createChildTask,
  type OutType_createChildTask,
  type InType_getTaskTreeIDs,
  type InType_deleteTaskTree,
  type InType_getTaskTree,
  type OutType_getTaskTree,
} from "../zod-schema/index.js";

/**
 *
 *
 * Get up to n recently updated root task IDs.
 *
 *
 */

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

export const getTaskBasicData = async (
  input: InType_getTaskBasicData
): Promise<OutType_getTaskBasicDataPlus | null> => {
  try {
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
    const lastEndedStageCol = tasks.lastEndedStage.name;
    // see: https://github.com/planetscale/database-js
    const query = `SELECT ${selectedFields.join(", ")}, \
    CASE WHEN ${lastEndedStageCol} = -1 THEN NULL \
    WHEN ${lastEndedStageCol} = 0 THEN ${tasks.stage0Data.name} \
    WHEN ${lastEndedStageCol} = 1 THEN ${tasks.stage1Data.name} \
    WHEN ${lastEndedStageCol} = 2 THEN ${tasks.stage2Data.name} \
    WHEN ${lastEndedStageCol} = 3 THEN ${tasks.stage3Data.name} \
    WHEN ${lastEndedStageCol} = 4 THEN ${tasks.stage4Data.name} \
    WHEN ${lastEndedStageCol} = 5 THEN ${tasks.stage5Data.name} \
    WHEN ${lastEndedStageCol} = 6 THEN ${tasks.stage6Data.name} \
    WHEN ${lastEndedStageCol} = 7 THEN ${tasks.stage7Data.name} \
    WHEN ${lastEndedStageCol} = 8 THEN ${tasks.stage8Data.name} \
    WHEN ${lastEndedStageCol} = 9 THEN ${tasks.stage9Data.name} \
    WHEN ${lastEndedStageCol} = 10 THEN ${tasks.stage10Data.name} \
    WHEN ${lastEndedStageCol} = 11 THEN ${tasks.stage11Data.name} \
    WHEN ${lastEndedStageCol} = 12 THEN ${tasks.stage12Data.name} \
    WHEN ${lastEndedStageCol} = 13 THEN ${tasks.stage13Data.name} \
    WHEN ${lastEndedStageCol} = 14 THEN ${tasks.stage14Data.name} \
    WHEN ${lastEndedStageCol} = 15 THEN ${tasks.stage15Data.name} \
    WHEN ${lastEndedStageCol} = 16 THEN ${tasks.stage16Data.name} \
    WHEN ${lastEndedStageCol} = 17 THEN ${tasks.stage17Data.name} \
    WHEN ${lastEndedStageCol} = 18 THEN ${tasks.stage18Data.name} \
    WHEN ${lastEndedStageCol} = 19 THEN ${tasks.stage19Data.name} \
    WHEN ${lastEndedStageCol} = 20 THEN ${tasks.stage20Data.name} \
    WHEN ${lastEndedStageCol} = 21 THEN ${tasks.stage21Data.name} \
    WHEN ${lastEndedStageCol} = 22 THEN ${tasks.stage22Data.name} \
    WHEN ${lastEndedStageCol} = 23 THEN ${tasks.stage23Data.name} \
    END AS previousStageData, \
    CASE WHEN ${lastEndedStageCol} = -1 THEN ${tasks.stage0Data.name} \
    WHEN ${lastEndedStageCol} = 0 THEN ${tasks.stage1Data.name} \
    WHEN ${lastEndedStageCol} = 1 THEN ${tasks.stage2Data.name} \
    WHEN ${lastEndedStageCol} = 2 THEN ${tasks.stage3Data.name} \
    WHEN ${lastEndedStageCol} = 3 THEN ${tasks.stage4Data.name} \
    WHEN ${lastEndedStageCol} = 4 THEN ${tasks.stage5Data.name} \
    WHEN ${lastEndedStageCol} = 5 THEN ${tasks.stage6Data.name} \
    WHEN ${lastEndedStageCol} = 6 THEN ${tasks.stage7Data.name} \
    WHEN ${lastEndedStageCol} = 7 THEN ${tasks.stage8Data.name} \
    WHEN ${lastEndedStageCol} = 8 THEN ${tasks.stage9Data.name} \
    WHEN ${lastEndedStageCol} = 9 THEN ${tasks.stage10Data.name} \
    WHEN ${lastEndedStageCol} = 10 THEN ${tasks.stage11Data.name} \
    WHEN ${lastEndedStageCol} = 11 THEN ${tasks.stage12Data.name} \
    WHEN ${lastEndedStageCol} = 12 THEN ${tasks.stage13Data.name} \
    WHEN ${lastEndedStageCol} = 13 THEN ${tasks.stage14Data.name} \
    WHEN ${lastEndedStageCol} = 14 THEN ${tasks.stage15Data.name} \
    WHEN ${lastEndedStageCol} = 15 THEN ${tasks.stage16Data.name} \
    WHEN ${lastEndedStageCol} = 16 THEN ${tasks.stage17Data.name} \
    WHEN ${lastEndedStageCol} = 17 THEN ${tasks.stage18Data.name} \
    WHEN ${lastEndedStageCol} = 18 THEN ${tasks.stage19Data.name} \
    WHEN ${lastEndedStageCol} = 19 THEN ${tasks.stage20Data.name} \
    WHEN ${lastEndedStageCol} = 20 THEN ${tasks.stage21Data.name} \
    WHEN ${lastEndedStageCol} = 21 THEN ${tasks.stage22Data.name} \
    WHEN ${lastEndedStageCol} = 22 THEN ${tasks.stage23Data.name} \
    WHEN ${lastEndedStageCol} = 23 THEN NULL \
    END AS currentStageData FROM tasks \
    WHERE ${tasks.taskID.name} = ${input.taskID}`;
    const row = (await connection.execute(query, { as: "object" })).rows[0];
    const rowObj = jsonObjSchema.parse(row);
    // in raw sql: booleans are stored as 0 or 1; taskID is a string; Dates are strings
    const taskData = {
      taskID: tasks.taskID.mapFromDriverValue(
        rowObj[tasks.taskID.name] as string
      ),
      paused: tasks.paused.mapFromDriverValue(
        rowObj[tasks.paused.name] as number
      ),
      success:
        rowObj[tasks.success.name] != null
          ? tasks.success.mapFromDriverValue(
              rowObj[tasks.success.name] as number
            )
          : null,
      dead: tasks.success.mapFromDriverValue(rowObj[tasks.dead.name] as number),
      lastEndedStage: tasks.lastEndedStage.mapFromDriverValue(
        rowObj[tasks.lastEndedStage.name] as number
      ),
      lastInteractionMarker: rowObj[tasks.lastInteractionMarker.name]
        ? tasks.lastInteractionMarker.mapFromDriverValue(
            rowObj[tasks.lastInteractionMarker.name] as string
          )
        : null,
      isAbstract: tasks.isAbstract.mapFromDriverValue(
        rowObj[tasks.isAbstract.name] as number
      ),
      parentID: rowObj[tasks.parentID.name],
      taskDefinition: rowObj[tasks.taskDefinition.name],
      initialInputFields: rowObj[tasks.initialInputFields.name],
      initialContextFields: rowObj[tasks.initialContextFields.name],
      initialContextSummary: rowObj[tasks.initialContextSummary.name],
      timeCreated: tasks.timeCreated.mapFromDriverValue(
        rowObj[tasks.timeCreated.name] as string
      ),
      timeLastUpdated: tasks.timeLastUpdated.mapFromDriverValue(
        rowObj[tasks.timeLastUpdated.name] as string
      ),
      resultData: rowObj[tasks.resultData.name],
      runtimeErrors: rowObj[tasks.runtimeErrors.name],
      previousStageData: rowObj["previousStageData"],
      currentStageData: rowObj["currentStageData"],
    };
    return OutSchema_getTaskBasicDataPlus.parse(taskData);
  } catch (e) {
    console.error(
      "Failed to get task basic data from SQL for taskID: ",
      input.taskID
    );
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
        lastInteractionMarker: tasks.lastInteractionMarker,
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
    console.error("Failed to get basic task datas:");
    console.log(e);
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
    if (!InSchema_getTaskStageNData.safeParse(input).success) {
      return null;
    }
    const results = await sqlClient
      .select({
        stageNData: nToStageNColumn.get(input.stageN) ?? tasks.stage0Data,
      })
      .from(tasks)
      .where(eq(tasks.taskID, input.taskID));
    return results && results.length
      ? stageDataSchema.parse(results[0].stageNData)
      : null;
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

export const saveTaskData = async (
  input: InType_saveTaskData,
  neo4jDriver: neo4j.Driver,
  redis?: RedisManager,
  isTaskRunner = false
) => {
  try {
    const marker = crypto.webcrypto.randomUUID();
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
          timeLastUpdated: new Date(),
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
      "MATCH (task:Task {taskID: $idParam}) SET task.isDead = $isDeadParam",
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
      "CREATE (task:Task {taskID: $idParam, isDead: 'false'})",
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
 *
 */

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
 *
 *
 * Delete task (in SQL and Neo4J) with `taskID`, and all its descendant tasks.
 *
 *
 */

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
 *
 *
 * Get a task tree (nodes & relationships) rooted at the node with taskID=rootTaskID.
 *
 *
 */

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

/**
 *
 *
 * Get a task's last interaction marker, which changes every time its data is updated.
 *
 *
 */

export const getLastInteractionMarker = async (
  taskID: number
): Promise<string | null> => {
  try {
    return (
      await sqlClient
        .select({ lastInteractionMarker: tasks.lastInteractionMarker })
        .from(tasks)
        .where(eq(tasks.taskID, taskID))
    )[0].lastInteractionMarker;
  } catch (error) {
    return null;
  }
};

/**
 *
 *
 * Pause the task with `taskID`.
 *
 *
 */

export const pauseTask = async (
  input: InType_deleteTaskTree
): Promise<void> => {
  if (!!!input.taskID) {
    return;
  }
  try {
    await sqlClient
      .update(tasks)
      .set({ paused: true })
      .where(eq(tasks.taskID, input.taskID));

    // handle errors
  } catch (error) {
    console.error("FAILED to pause task with taskID: ", input.taskID);
    console.error(error);
  }
};

/**
 *
 *
 * Unpause the task with `taskID`.
 *
 *
 */

export const unpauseTask = async (
  input: InType_deleteTaskTree
): Promise<void> => {
  if (!!!input.taskID) {
    return;
  }
  try {
    await sqlClient
      .update(tasks)
      .set({ paused: false })
      .where(eq(tasks.taskID, input.taskID));

    // handle errors
  } catch (error) {
    console.error("FAILED to unpause task with taskID: ", input.taskID);
    console.error(error);
  }
};

/**
 *
 *
 * Pause task with `taskID`, and all its descendant tasks.
 *
 *
 */
export const pauseTaskTree = async (
  input: InType_deleteTaskTree,
  neo4jDriver: neo4j.Driver
): Promise<void> => {
  if (!!!input.taskID) {
    return;
  }
  const taskIDsToPause = new Set([input.taskID]);
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
      taskIDsToPause.add(record.get("source").properties.taskID.toInt());
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      taskIDsToPause.add(record.get("target").properties.taskID.toInt());
    });

    // pause tasks in SQL
    await sqlClient
      .update(tasks)
      .set({ paused: true })
      .where(inArray(tasks.taskID, Array.from(taskIDsToPause)));

    // handle errors
  } catch (error) {
    console.error("FAILED to pause task tree rooted at task: ", input.taskID);
    console.error(error);
  }
};

/**
 *
 *
 * Pause task with `taskID`, and all its descendant tasks.
 *
 *
 */

export const unpauseTaskTree = async (
  input: InType_deleteTaskTree,
  neo4jDriver: neo4j.Driver
): Promise<void> => {
  if (!!!input.taskID) {
    return;
  }
  const taskIDsToUnpause = new Set([input.taskID]);
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
      taskIDsToUnpause.add(record.get("source").properties.taskID.toInt());
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      taskIDsToUnpause.add(record.get("target").properties.taskID.toInt());
    });

    // unpause tasks in SQL
    await sqlClient
      .update(tasks)
      .set({ paused: false })
      .where(inArray(tasks.taskID, Array.from(taskIDsToUnpause)));

    // handle errors
  } catch (error) {
    console.error("FAILED to unpause task tree rooted at task: ", input.taskID);
    console.error(error);
  }
};

/**
 *
 *
 * Delete a task's descendents, restart it, and propogate its new outputs to ancestor tasks.
 *
 *
 */

export const restartTaskTree = async (
  input: InType_deleteTaskTree,
  neo4jDriver: neo4j.Driver
): Promise<void> => {
  if (!!!input.taskID) {
    return;
  }
  const descendentTaskIDs = new Set();
  const ancestorTaskIDs = new Set();
  try {
    const neo4jSession = neo4jDriver.session();

    // get descendent nodes from neo4j
    const descendentsResult = await neo4jSession.run(
      "MATCH (root_task:Task {taskID: $idParam}) \
          CALL apoc.path.subgraphAll(root_task, {relationshipFilter: 'SPAWNED>', maxLevel: -1}) YIELD nodes, relationships \
          UNWIND relationships AS relation \
          RETURN startNode(relation) AS source, endNode(relation) AS target; ",
      {
        idParam: input.taskID,
      }
    );

    // process descendent nodes from neo4j
    descendentsResult.records.forEach((record) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      descendentTaskIDs.add(record.get("source").properties.taskID.toInt());
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      descendentTaskIDs.add(record.get("target").properties.taskID.toInt());
    });
    descendentTaskIDs.delete(input.taskID);

    // get descendent nodes from neo4j
    const ancestorsResult = await neo4jSession.run(
      "MATCH (root_task:Task {taskID: $idParam}) \
          CALL apoc.path.subgraphAll(root_task, {relationshipFilter: 'SPAWNED>', maxLevel: -1}) YIELD nodes, relationships \
          UNWIND relationships AS relation \
          RETURN startNode(relation) AS source, endNode(relation) AS target; ",
      {
        idParam: input.taskID,
      }
    );

    // process descendent nodes from neo4j
    ancestorsResult.records.forEach((record) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      ancestorTaskIDs.add(record.get("source").properties.taskID.toInt());
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      ancestorTaskIDs.add(record.get("target").properties.taskID.toInt());
    });
    ancestorTaskIDs.delete(input.taskID);

    /*

- Fail if taskToRestart is dead.
- Create map of which tasks were previously paused: ancestorPreviouslyPaused.
- Create a list of tasksToKill.
- Get all direct ancestor task IDs from Neo4J.
    - Get whether they’re paused in SQL and save to ancestorPreviouslyPaused.
    - Mark them all as paused in SQL.
- Clear redis queues.
- While any ancestor task is in a redis queue, pause all the tasks in SQL again and clear redis queues again.
- Once no ancestor tasks are in a redis queue, pause all the tasks in SQL one more time.
- Start with dependencyParent = taskToRestart’s parentID task. dependencyTaskID = taskToRestart.
    - Get all stage data for generate_sub_tasks and later stages.
    - a) Get the stepIdx where stepIdxToSubTaskID[stepIdx] = dependencyTaskID.
    - If dependencyTaskID = taskToRestart.taskID:
        - create a new sub-task with the same init fields as taskToRestart.
        - set internalData.stepIdxToSubTaskID[step] = new sub-task’s id.
        - set internalData.dependencyStepOutput[step] = null.
    - Get step indexes that depend on (internalData.stepDependencies) dependency stepIdx from a). For each stepIdx:
        - Set internalData.dependencyStepOutput[stepIdx] = null.
        - Get possible subTaskID from internalData.stepIdxToSubTaskID[stepIdx]:
            - Get all oldTaskIDs from the Neo4J tree rooted at subTaskID.
            - Add oldTaskIDs to tasksToKill.
            - Remove all oldTaskIDs from redis waiting queue.
            - Mark all oldTaskIDs as dead in SQL and Neo4J.
    - Move on: dependencyTaskID = dependencyParent. dependencyParent = dependencyParent’s parent (or else end loop).
- While true:
    - Mark all tasksToKill as dead in SQL.
    - While any tasksToKill, or any ancestor task, is in a redis queue: clear redis queues, m
    - Wait
    - Verify that every tasksToKill task is dead in SQL. Only break if true.
- Unpause all ancestors that were not ancestorPreviouslyPaused=true.
    */

    // handle errors
  } catch (error) {
    console.error("FAILED to restart task tree task: ", input.taskID);
    console.error(error);
  }
};
