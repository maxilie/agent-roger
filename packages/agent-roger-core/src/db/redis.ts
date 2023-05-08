import Redis, { type ChainableCommander, type RedisOptions } from "ioredis";
import { env } from "../env.mjs";

export const REDIS_TASK_QUEUE = {
  waiting: "queue_waiting",
  processing: "queue_processing",
  codeLLMInference: "queue_inference_code",
};

export class RedisManager {
  readonly redis: Redis;
  pipeline: ChainableCommander;
  inferenceResultPromiseResolvers: {
    [pipelineIdx: number]: (result: string | null) => void;
  } = {};
  ignoredPipelineIdxs: number[] = [];

  constructor(taskRunnerID?: string) {
    const redisOpts: RedisOptions = {
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      password: env.REDIS_PASS,
      connectionName: taskRunnerID ?? "dashboard-temp",
    };
    this.redis = new Redis(redisOpts);
    this.pipeline = this.redis.pipeline();
    this.inferenceResultPromiseResolvers = {};
    this.ignoredPipelineIdxs = [];
  }

  /**
   * Clears processing & waiting queues and populates waiting queue with unfinished tasks from SQL.
   *
   * Uses a redis transaction to ensure other task runners do not move edit the queues while this is happening.
   *
   * If another task runner is processing a task:
   *  1) this task runner clears both queues and puts the task id in the waiting queue.
   *  2) other task runner will still save the result of its processing to SQL.
   *  3) other task runner will gracefully fail to move task id from processing queue to waiting queue (since we cleared the processing queue).
   *  4) either task runner can pick up the task from the waiting queue and process the next stage of it.
   */
  async restartQueues(taskIDs: number[]) {
    // clear current pipeline
    this.pipeline = this.redis.pipeline();
    this.inferenceResultPromiseResolvers = {};
    this.ignoredPipelineIdxs = [];

    if (taskIDs.length === 0) return;

    // clear queues and add tasks to waiting queue
    await this.redis
      .multi()
      .del(REDIS_TASK_QUEUE.waiting)
      .del(REDIS_TASK_QUEUE.processing)
      .lpush(REDIS_TASK_QUEUE.waiting, ...taskIDs)
      .exec();
  }

  /**
   * Adds a new task to the waiting queue.
   * Only meant to be called when a new task is created.
   */
  queueNewTask(taskID: number) {
    this.pipeline.rpush(REDIS_TASK_QUEUE.waiting, taskID);
  }

  /**
   * Moves task from the processing queue to the waiting queue.
   */
  markTaskWaitingAgain(taskID: number) {
    this.pipeline
      .lrem(REDIS_TASK_QUEUE.processing, 0, taskID)
      .rpush(REDIS_TASK_QUEUE.waiting, taskID);
  }

  /**
   * Removes task from the processing queue.
   */
  markTaskFinished(taskID: number) {
    this.pipeline.lrem(REDIS_TASK_QUEUE.processing, 0, taskID);
  }

  queueInferenceRequest(request: { requestID: string; llmInput: string }) {
    this.pipeline.rpush(
      REDIS_TASK_QUEUE.codeLLMInference,
      JSON.stringify(request)
    );
    this.ignoredPipelineIdxs.push(this.pipeline.length - 1);
  }

  /**
   * Returns the LLM string output, or null if the inference is not yet complete.
   *
   * Queues a promise in the pipeline instead of executing the redis command immediately.
   */
  async getInferenceResult(requestID: string): Promise<string | null> {
    this.pipeline.get(REDIS_TASK_QUEUE.codeLLMInference + "_" + requestID);
    const pipelineIdx = this.pipeline.length - 1;
    const resultPromise = new Promise<string | null>((resolve) => {
      this.inferenceResultPromiseResolvers[pipelineIdx] = (
        result: string | null
      ) => resolve(result);
    });
    return resultPromise;
  }
}

/**
 * Provides a RedisManager that will be safely closed after the callback is executed.
 */
export const withRedis = async (
  callback: (redis: RedisManager) => Promise<void>
): Promise<void> => {
  const redis = new RedisManager();
  try {
    await callback(redis);
  } finally {
    await redis.redis.quit();
  }
};
