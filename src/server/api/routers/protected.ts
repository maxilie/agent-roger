import { desc, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "~/db/db";
import { tasks } from "~/db/schema";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import * as neo4j from "neo4j-driver";
import { env } from "~/env.mjs";

type Neo4JTask = {
  properties: {
    taskID: neo4j.Integer;
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
        .orderBy(desc(tasks.time_last_updated))
        .limit(input.n);
      return result.map((task) => task.taskID);
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
          "MATCH (root_task:Task {taskID: $idParam})-[link:SPAWNED*0..]->(sub_task:Task) \
          WITH DISTINCT link, sub_task \
          UNWIND link AS relation \
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
  MERGE (root_task)-[:SPAWNED]->(sub_task)
)
 */
