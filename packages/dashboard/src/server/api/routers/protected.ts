import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { db, schema } from "agent-roger-core";
import { eq } from "drizzle-orm";

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
          console.log("response from createRootTask: ", res);
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

  // pauses a task
  pauseTask: protectedProcedure
    .input(schema.input.deleteTaskTree)
    .mutation(async ({ input }) => {
      await db.pauseTask(input);
    }),

  // pauses a task & descendents
  pauseTaskTree: protectedProcedure
    .input(schema.input.deleteTaskTree)
    .mutation(async ({ input }) => {
      await db.withNeo4jDriver(async (neo4jDriver) => {
        await db.pauseTaskTree(input, neo4jDriver);
      });
    }),

  // unpauses a task
  unpauseTask: protectedProcedure
    .input(schema.input.deleteTaskTree)
    .mutation(async ({ input }) => {
      await db.unpauseTask(input);
    }),

  // unpauses a task & descendents
  unpauseTaskTree: protectedProcedure
    .input(schema.input.deleteTaskTree)
    .mutation(async ({ input }) => {
      await db.withNeo4jDriver(async (neo4jDriver) => {
        await db.unpauseTaskTree(input, neo4jDriver);
      });
    }),

  // gets a training data example
  getTrainingData: protectedProcedure
    .input(z.object({ id: z.number().nullish() }))
    .output(schema.trainingDataExample.nullable())
    .query(async ({ input }) => {
      if (input?.id == null) return null;
      return await db.getTrainingDataExample(input as { id: number });
    }),

  // gets an injected prompt
  getInjectedPrompt: protectedProcedure
    .input(z.object({ id: z.number().nullish() }))
    .output(schema.injectedPrompt.nullable())
    .query(async ({ input }) => {
      if (input?.id == null) return null;
      return await db.getInjectedPrompt(input as { id: number });
    }),

  // gets a historical AI call (input & output)
  getHistoricalAiCall: protectedProcedure
    .input(z.object({ id: z.number().nullish() }))
    .output(schema.historicalAiCall.nullable())
    .query(async ({ input }) => {
      if (input?.id == null) return null;
      return await db.getHistoricalAiCall(input as { id: number });
    }),

  // saves or creates a training data example
  saveTrainingData: protectedProcedure
    .input(
      z.intersection(
        z.object({ id: z.number().nullish() }),
        schema.trainingDataExample
      )
    )
    .mutation(async ({ input }) => {
      await db.saveTrainingData(input);
    }),

  // saves or creates an injected prompt
  saveInjectedPrompt: protectedProcedure
    .input(
      z.intersection(
        z.object({ id: z.number().nullish() }),
        schema.injectedPrompt
      )
    )
    .mutation(async ({ input }) => {
      await db.saveInjectedPrompt(input);
    }),

  // deletes a training data example
  deleteTrainingDataExample: protectedProcedure
    .input(z.object({ id: z.number().nullish() }))
    .mutation(async ({ input }) => {
      if (input?.id === null || input?.id === undefined) return;
      await db.sqlClient
        .delete(db.trainingData)
        .where(eq(db.trainingData.id, input.id));
    }),

  // deletes an injected prompt
  deleteInjectedPrompt: protectedProcedure
    .input(z.object({ id: z.number().nullish() }))
    .mutation(async ({ input }) => {
      if (input?.id === null || input?.id === undefined) return;
      await db.sqlClient
        .delete(db.injectedPrompts)
        .where(eq(db.injectedPrompts.id, input.id));
    }),

  // gets a batch of ids of injected prompts
  getBatchInjectedPromptIDs: protectedProcedure
    .input(
      z.object({
        N: z.number(),
        startID: z.number().nullish(),
        endID: z.number().nullish(),
      })
    )
    .output(z.array(z.number()))
    .query(async ({ input }) => {
      return await db.getBatchInjectedPromptIDs(input);
    }),

  // gets a batch of task ids
  getBatchRecentTaskIDs: protectedProcedure
    .input(
      z.object({
        N: z.number(),
        startTime: z.date().nullish(),
        endTime: z.date().nullish(),
      })
    )
    .output(
      z.array(
        z.object({
          taskID: z.number(),
          timeLastUpdated: z.date(),
        })
      )
    )
    .query(async ({ input }) => {
      return await db.getBatchRecentTaskIDs(input);
    }),

  // gets a batch of ids of training data examples
  getBatchTrainingDataIDs: protectedProcedure
    .input(
      z.object({
        categoryTag: z.string(),
        qualityRating: z.number().default(1),
        N: z.number(),
        startID: z.number().nullish(),
        endID: z.number().nullish(),
      })
    )
    .output(z.array(z.number()))
    .query(async ({ input }) => {
      return await db.getBatchTrainingDataIDs(input);
    }),

  // gets a batch of ids of a task's previous AI inputs & outputs
  getBatchHistoricalAiCallIDs: protectedProcedure
    .input(
      z.object({
        taskID: z.number().default(0),
        N: z.number(),
        startTime: z.date().nullish(),
        endTime: z.date().nullish(),
      })
    )
    .output(
      z.array(
        z.object({
          id: z.number(),
          timestamp: z.date(),
        })
      )
    )
    .query(async ({ input }) => {
      if (input?.taskID === undefined || input?.taskID === null) {
        return [];
      }
      return await db.getBatchHistoricalAiCallIDs(input);
    }),

  // delete task prompt history older than x seconds ago
  deleteTaskPromptHistory: protectedProcedure
    .input(z.object({ secondsAgo: z.number() }))
    .mutation(async ({ input }) => {
      await db.deletePromptHistory(input);
    }),

  // checks if data point data is present in injectedPrompts table (ignores null input)
  isInjectedPromptPresent: protectedProcedure
    .input(
      z.object({
        userMessage: z.string().nullish(),
        assistantMessage: z.string().nullish(),
      })
    )
    .output(z.boolean())
    .query(async ({ input }) => {
      if (
        input.userMessage === null ||
        input.userMessage === undefined ||
        input.assistantMessage === null ||
        input.assistantMessage === undefined
      ) {
        return false;
      }
      return await db.isInjectedPromptPresent(
        input as { userMessage: string; assistantMessage: string }
      );
    }),

  // checks if data point data is present in trainingData table (ignores null input)
  isTrainingDataExamplePresent: protectedProcedure
    .input(
      z.object({
        categoryTag: z.string().nullish(),
        inputMessages: z.array(z.string()).nullish(),
        outputMessage: z.string().nullish(),
      })
    )
    .output(z.boolean())
    .query(async ({ input }) => {
      if (
        input.categoryTag === null ||
        input.categoryTag === undefined ||
        input.inputMessages === null ||
        input.inputMessages === undefined ||
        input.outputMessage === null ||
        input.outputMessage === undefined
      ) {
        return false;
      }
      return await db.isTrainingDataExamplePresent(
        input as {
          categoryTag: string;
          inputMessages: string[];
          outputMessage: string;
        }
      );
    }),
});
