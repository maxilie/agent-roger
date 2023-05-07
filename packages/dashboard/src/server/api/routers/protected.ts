import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { db, schema } from "agent-roger-core";

export const tasksRouter = createTRPCRouter({
  // returns N most recently updated root nodes
  rootTaskIDs: protectedProcedure
    .input(z.object({ n: z.number().min(1).default(20) }))
    .output(z.array(z.number()).nullable())
    .query(async ({ input }) => {
      return await db.getRootTaskIDs(input);
    }),

  // returns task data for the specified ID
  getTaskBasicData: protectedProcedure
    .input(z.object({ taskID: z.number().nullish() }))
    .output(schema.output.getTaskBasicData.nullable())
    .query(async ({ input }) => {
      if (input?.taskID == null) return null;
      return await db.getTaskBasicData({ taskID: input.taskID ?? undefined });
    }),

  // returns data for a single stage of a task
  getTaskStageNData: protectedProcedure
    .input(schema.input.getTaskStageNData)
    .output(schema.output.getTaskStageNData.nullable())
    .query(async ({ input }) => {
      if (input.taskID == null || input.stageN < 0) return null;
      return await db.getTaskStageNData(input);
    }),

  // returns task data for the specified IDs
  getTaskBasicDatas: protectedProcedure
    .input(z.object({ taskIDs: z.array(z.number()) }))
    .output(schema.output.getTaskBasicDatas)
    .query(async ({ input }) => {
      return await db.getTaskBasicDatas(input);
    }),

  // updates an existing task's data in SQL and Neo4J
  saveTaskData: protectedProcedure
    .input(schema.input.saveTask)
    .mutation(async ({ input }) => {
      let res = null;
      await db.withNeo4jDriver(async (neo4jDriver) => {
        await db.withRedis(async (redis) => {
          res = await db.saveTaskData(input, neo4jDriver, redis, true);
        });
      });
      return res;
    }),

  // creates a new root task
  createRootTask: protectedProcedure
    .input(schema.input.createRootTask)
    .output(schema.output.createRootTask.nullable())
    .mutation(async ({ input }) => {
      let res = null;
      await db.withNeo4jDriver(async (neo4jDriver) => {
        await db.withRedis(async (redis) => {
          res = await db.createRootTask(input, neo4jDriver, redis);
        });
      });
      return res;
    }),

  // creates a new child task
  createChildTask: protectedProcedure
    .input(schema.input.createChildTask)
    .output(schema.output.createChildTask.nullable())
    .mutation(async ({ input }) => {
      let res = null;
      await db.withNeo4jDriver(async (neo4jDriver) => {
        await db.withRedis(async (redis) => {
          res = await db.createChildTask(input, neo4jDriver, redis);
        });
      });
      return res;
    }),

  // returns nodeIDs=[rootTaskID, ...descendentIDs], links[{source, target}], tasks: TaskBasicData[]
  getTaskTree: protectedProcedure
    .input(schema.input.getTaskTree)
    .output(schema.output.getTaskTree)
    .query(async ({ input }) => {
      let res = null;
      await db.withNeo4jDriver(async (neo4jDriver) => {
        res = await db.getTaskTree(input, neo4jDriver);
      });
      return res || { taskIDs: [], links: [], tasks: [] };
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
