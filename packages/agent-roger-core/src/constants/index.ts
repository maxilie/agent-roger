// For up to 4 seconds after you change a task's data in SQL, a task runner can overwrite it.
// When updating a task's data from outside of a task runner, change its `lastInteractionMarker`, wait 4 seconds, and ensure the marker is still the same.
export const MAX_UNSYNC_TIME = 4000;

// models available to the task runner; for rate limits, see:
// https://platform.openai.com/docs/guides/rate-limits/overview
export type AiModel = {
  id: string;
  maxTokens: number;
  rateLimits?: {
    tokensPerMinute: number;
    requestsPerMinute: number;
    sharedLimits?: Array<string>;
  };
};
export const AI_MODELS: { [modelName: string]: AiModel } = {
  mpt: {
    id: "mpt",
    maxTokens: 100000,
    rateLimits: {
      tokensPerMinute: 5000000,
      requestsPerMinute: 10000,
    },
  },
  gpt4: {
    id: "gpt-4",
    maxTokens: 8000,
    rateLimits: {
      tokensPerMinute: 40000,
      requestsPerMinute: 200,
      sharedLimits: ["gpt-3.5-turbo", "gpt-3.5-turbo-16k"],
    },
  },
  gpt35Turbo: {
    id: "gpt-3.5-turbo",
    maxTokens: 4000,
    rateLimits: {
      tokensPerMinute: 90000,
      requestsPerMinute: 3500,
      sharedLimits: ["gpt-4", "gpt-3.5-turbo-16k"],
    },
  },
  gpt35Turbo16k: {
    id: "gpt-3.5-turbo-16k",
    maxTokens: 16000,
    rateLimits: {
      tokensPerMinute: 180000,
      requestsPerMinute: 3500,
      sharedLimits: ["gpt-4", "gpt-3.5-turbo"],
    },
  },
  adaEmbedding: {
    id: "text-embedding-ada-002",
    maxTokens: 8000,
    rateLimits: {
      tokensPerMinute: 350000,
      requestsPerMinute: 3500,
    },
  },
};

export const TRAINING_DATA_TAGS = [
  "training-pair-1x",
  "training-pair-2x",
  "training-pair-3x",
  "training-pair-4x",
];
