import { desc, inArray, isNull, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "~/db/db";
import { tasks } from "~/db/schema";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import * as neo4j from "neo4j-driver";
import { env } from "~/env.mjs";
import { CREATE_CHILD_TASK_SCHEMA, TASK_SCHEMA } from "~/types";

type Neo4JTask = {
  properties: {
    taskID: neo4j.Integer;
    isDead: string;
  };
};

// API endpoints for handling managed users
export const tasksRouter = createTRPCRouter({
  // returns N most recently updated root nodes
  rootTasks: protectedProcedure
    .input(z.object({ n: z.number().min(1).default(20) }))
    .query(async ({ input }) => {
      const result = await db
        .select({ taskID: tasks.taskID })
        .from(tasks)
        .where(isNull(tasks.parentID))
        .orderBy(desc(tasks.timeLastUpdated))
        .limit(input.n);
      return result.map((task) => task.taskID);
    }),

  // returns task data for the specified ID
  taskData: protectedProcedure
    .input(z.object({ taskID: z.number().nullish() }))
    .query(async ({ input }) => {
      if (!!!input.taskID) {
        return null;
      }
      const result = await db
        .select()
        .from(tasks)
        .where(eq(tasks.taskID, input.taskID));
      return result ? result[0] : null;
    }),

  // returns task data for the specified IDs
  taskDatas: protectedProcedure
    .input(z.object({ taskIDs: z.array(z.number()) }))
    .query(async ({ input }) => {
      const result = await db
        .select()
        .from(tasks)
        .where(inArray(tasks.taskID, input.taskIDs));
      return result || [];
    }),

  // updates an existing task's data in SQL and Neo4J
  // any field left unspecified in the input will be DELETED
  saveArbitraryTask: protectedProcedure
    .input(TASK_SCHEMA)
    .mutation(async ({ input }) => {
      // sql
      await db
        .update(tasks)
        .set({
          ...input,
        })
        .where(eq(tasks.taskID, input.taskID));
      
      // neo4j
      let neo4jDriver: neo4j.Driver | undefined = undefined;
      let neo4jSession: neo4j.Session | undefined = undefined;
      try {
        neo4jDriver = neo4j.driver(
          env.NEO4J_URI,
          neo4j.auth.basic(env.NEO4J_USER, env.NEO4J_PASS)
        );
        neo4jSession = neo4jDriver.session();

        // execute query
        await neo4jSession.run<{
          source: Neo4JTask;
          target: Neo4JTask;
          relation: object;
        }>("MATCH (task:Task {taskID: idParam,}) SET task.isDead = $isDeadParam", {
          idParam: input.taskID,
          isDeadParam: input.dead ? "true" : "false",
        });
        // handle errors
      } catch (error) {
        console.error(
          "FAILED to update task in Neo4J (id:  ",input.taskID,")");
        console.error(error);
        try {
          await neo4jSession?.close();
          await neo4jDriver?.close();
        } finally {
        }
      }
    }),

  // creates a new root task
  createRootTask: protectedProcedure
    .input(
      z.object({
        taskInput: z.object({}).nullish(),
        initialContextSummary: z.string().nullish(),
      })
    )
    .mutation(async ({ input }) => {
      // sql
      const newTaskID: string = (
        await db.insert(tasks).values({
          taskType: "ROOT",
          ...(input.taskInput ? { input: input.taskInput } : {}),
          ...(input.initialContextSummary
            ? { initialContextSummary: input.initialContextSummary }
            : {}),
        })
      ).insertId;
      if (newTaskID.length == 0) {
        console.error(
          "Failed to create new root task in SQL with input query: ",
          JSON.stringify(input)
        );
        return null;
      }

      // neo4j
      let neo4jDriver: neo4j.Driver | undefined = undefined;
      let neo4jSession: neo4j.Session | undefined = undefined;
      try {
        neo4jDriver = neo4j.driver(
          env.NEO4J_URI,
          neo4j.auth.basic(env.NEO4J_USER, env.NEO4J_PASS)
        );
        neo4jSession = neo4jDriver.session();

        // execute query
        await neo4jSession.run<{
          source: Neo4JTask;
          target: Neo4JTask;
          relation: object;
        }>("CREATE (task:Task {taskID: idParam, isDead:'false'})", {
          idParam: +newTaskID,
        });
        // handle errors
      } catch (error) {
        console.error(
          "FAILED to create new root task in Neo4J (id:  ",
          newTaskID,
          "). Delete the failed task in SQL (not urgent)."
        );
        console.error(error);
        try {
          await neo4jSession?.close();
          await neo4jDriver?.close();
        } finally {
          return null
        }
      }
        return +newTaskID
    }),

  // creates a new child task
  createChildTask: protectedProcedure
    .input(CREATE_CHILD_TASK_SCHEMA)
    .mutation(async ({ input }) => {
      // sql
      const newTaskID: string = (
        await db.insert(tasks).values({
          ...input,
        })
      ).insertId;
      if (newTaskID.length == 0) {
        console.error(
          "Failed to create new child task in SQL with input query: ",
          JSON.stringify(input)
        );
        return null;
      }

      // neo4j
      let neo4jDriver: neo4j.Driver | undefined = undefined;
      let neo4jSession: neo4j.Session | undefined = undefined;
      try {
        neo4jDriver = neo4j.driver(
          env.NEO4J_URI,
          neo4j.auth.basic(env.NEO4J_USER, env.NEO4J_PASS)
        );
        neo4jSession = neo4jDriver.session();

        // execute query
        await neo4jSession.run<{
          source: Neo4JTask;
          target: Neo4JTask;
          relation: object;
        }>(
          "MATCH (parentTask:Task {taskID: $parentTaskIDParam}) \
          CREATE (newTask:Task {taskID: $newTaskIDParam, isDead:'false'}) \
          CREATE (parentTask)-[:SPAWNED]->(newTask)",
          {
            parentTaskIDParam: input.parentID,
            newTaskIDParam: +newTaskID,
          }
        );
        // handle errors
      } catch (error) {
        console.error(
          "FAILED to create new child task in Neo4J (id:  ",
          newTaskID,
          "). Delete the failed task in SQL to avoid orphaned nodes."
        );
        console.error(error);
        try {
          await neo4jSession?.close();
          await neo4jDriver?.close();
        } finally {
          return null;
        }
      }
      return +newTaskID;
    }),

  // returns nodeIDs=[rootTaskID, ...descendentIDs], links[{source, target}], tasks: Task[]
  taskTree: protectedProcedure
    .input(z.object({ rootTaskID: z.number().nullish() }))
    .query(async ({ input }) => {
      if (!!!input.rootTaskID) {
        return { taskIDs: [], links: [], tasks: [] };
      }
      // get db connection
      let neo4jDriver: neo4j.Driver | undefined = undefined;
      let neo4jSession: neo4j.Session | undefined = undefined;
      try {
        neo4jDriver = neo4j.driver(
          env.NEO4J_URI,
          neo4j.auth.basic(env.NEO4J_USER, env.NEO4J_PASS)
        );
        neo4jSession = neo4jDriver.session();

        // execute query
        const result = await neo4jSession.run<{
          source: Neo4JTask;
          target: Neo4JTask;
          relation: object;
        }>(
          "MATCH (root_task:Task {taskID: $idParam}) \
          CALL apoc.path.subgraphAll(root_task, {relationshipFilter: 'SPAWNED>', maxLevel: -1}) YIELD nodes, relationships \
          UNWIND relationships AS relation \
          RETURN startNode(relation) AS source, relation, endNode(relation) AS target; ",
          {
            idParam: input.rootTaskID,
          }
        );

        // process nodes and links
        const taskIDs = new Set<number>([input.rootTaskID]);
        const links: { source: number; target: number }[] = [];
        result.records.forEach((record) => {
          taskIDs.add(record.get("source").properties.taskID.toInt());
          taskIDs.add(record.get("target").properties.taskID.toInt());
          links.push({
            source: record.get("source").properties.taskID.toInt(),
            target: record.get("target").properties.taskID.toInt(),
          });
        });

        // get task data from task ids
        const taskData = await db
          .select()
          .from(tasks)
          .where(inArray(tasks.taskID, Array.from(taskIDs)));
        return { taskIDs: Array.from(taskIDs), links, tasks: taskData || [] };

        // handle errors
      } catch (error) {
        console.error(
          "FAILED to get task graph for rootTaskID: ",
          input.rootTaskID
        );
        console.error(error);
        try {
          await neo4jSession?.close();
          await neo4jDriver?.close();
        } finally {
          return { taskIDs: [], links: [], tasks: [] };
        }
      }
    }),
});

/**
 * 

 * create root node
CREATE (root_task:Task {taskID: 1})


 * create child nodes
WITH [
  {taskID: 14},
  {taskID: 15}
] AS sub_tasks
MATCH (root_task:Task {taskID: 12})
FOREACH (sub_task_props IN sub_tasks |
  MERGE (sub_task:Task {taskID: sub_task_props.taskID})
  MERGE (root_task)-[:SPAWNED]->(sub_task))


  * mark as dead nodes with id in array of ids
MATCH (n)
WHERE n.taskID IN $taskIDs
SET n.isDead = 'true'
RETURN n
 */
