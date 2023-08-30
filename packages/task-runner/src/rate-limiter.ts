import { AI_MODELS, type AiModel } from "agent-roger-core";
/**
 * Inference API (i.e. OpenAI) rate limiter for a single task runner.
 *
 * If using multiple task runners, you can avoid API errors by setting the rate limit to (totalRateLimit / numTaskRunners).
 * However, it is advisable for cost and performance reasons to use an inference queue (no rate limits) with your own AI models
 *  instead of using 3rd party APIs.
 */
export class RateLimiter {
  tokens: { [modelID: string]: { [minute: number]: number } };
  requests: { [modelID: string]: { [minute: number]: number } };

  constructor() {
    // init tokens and requests tracker for each model
    this.tokens = {};
    this.requests = {};
    for (const modelName in AI_MODELS) {
      const modelID = AI_MODELS[modelName].id;
      this.tokens[modelID] = {};
      this.requests[modelID] = {};
    }
  }

  currentMinute(): number {
    return Math.floor(Date.now() / 1000 / 60);
  }

  willLimitBeReached(newTokens: number, modelInfo: AiModel): boolean {
    const debug = true;
    const currentMinute = this.currentMinute();
    // get tokens used by this model and all models with shared limits
    const tokensUsed = newTokens + this.tokens[modelInfo.id][currentMinute];
    let sharedTokensUsed = tokensUsed;
    let maxSharedTokensPerMin = modelInfo.rateLimits?.tokensPerMinute ?? 0;
    const sharedLimitModelIDs = modelInfo.rateLimits?.sharedLimits ?? [];
    for (const otherModelName in AI_MODELS) {
      const otherModelInfo = AI_MODELS[otherModelName];
      if (!sharedLimitModelIDs.includes(otherModelInfo.id)) continue;
      sharedTokensUsed += this.tokens[otherModelInfo.id][currentMinute] ?? 0;
      maxSharedTokensPerMin = Math.max(
        maxSharedTokensPerMin,
        otherModelInfo.rateLimits?.tokensPerMinute ?? maxSharedTokensPerMin
      );
    }
    const isTokensLimitReached =
      (modelInfo.rateLimits?.tokensPerMinute ?? 0) > 0 &&
      (tokensUsed >= (modelInfo.rateLimits?.tokensPerMinute ?? 0) ||
        sharedTokensUsed >= maxSharedTokensPerMin);
    if (debug) {
      console.log(
        `reached tokens limit for ${
          modelInfo.id
        }. new tokens (${newTokens}) + tokens used (${
          this.tokens[modelInfo.id][currentMinute]
        }) >= max tokens per minute (${
          modelInfo.rateLimits?.tokensPerMinute ?? 0
        })`
      );
    }

    // get requests used by this model and all models with shared limits
    const requestsMade = 1 + this.requests[modelInfo.id][currentMinute];
    let sharedRequestsMade = requestsMade;
    let maxSharedRequestsPerMin = modelInfo.rateLimits?.requestsPerMinute ?? 0;
    for (const otherModelName in AI_MODELS) {
      const otherModelInfo = AI_MODELS[otherModelName];
      if (!sharedLimitModelIDs.includes(otherModelInfo.id)) continue;
      sharedRequestsMade +=
        this.requests[otherModelInfo.id][currentMinute] ?? 0;
      maxSharedRequestsPerMin = Math.max(
        maxSharedRequestsPerMin,
        otherModelInfo.rateLimits?.requestsPerMinute ?? maxSharedRequestsPerMin
      );
    }
    const isRequestsLimitReached =
      (modelInfo.rateLimits?.requestsPerMinute ?? 0) > 0 &&
      (requestsMade >= (modelInfo.rateLimits?.requestsPerMinute ?? 0) ||
        sharedRequestsMade >= maxSharedRequestsPerMin);
    if (debug) {
      console.log(
        `reached requests limit for ${modelInfo.id}. requests made (${
          this.requests[modelInfo.id][currentMinute]
        }) >= max requests per minute (${
          modelInfo.rateLimits?.requestsPerMinute ?? 0
        })`
      );
    }

    return isTokensLimitReached || isRequestsLimitReached;
  }

  addRequests(numTokens: number, modelInfo: AiModel) {
    const currentMinute = this.currentMinute();
    if (!(currentMinute in this.tokens))
      this.tokens[modelInfo.id][currentMinute] = 0;
    if (!(currentMinute in this.requests))
      this.requests[modelInfo.id][currentMinute] = 0;
    this.tokens[modelInfo.id][currentMinute] += numTokens;
    this.requests[modelInfo.id][currentMinute] += 1;
  }
}
