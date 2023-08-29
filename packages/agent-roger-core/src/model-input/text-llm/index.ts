import { encode } from "gpt-tokenizer";
import { z } from "zod";
import { type Json } from "../../zod-schema/stage-base/json";
import {
  SYSTEM_MESSAGES,
  type SuggestedApproaches,
} from "../../constants/prompts";
import { AI_MODELS, type AiModel } from "../../constants";
import { env } from "../../env.mjs";

// gets number of tokens for an input
export const getNumTokens = (messages: string[]) => {
  let numTokens = 0;
  for (const inputMessage of messages) {
    numTokens += encode(inputMessage).length;
  }
  return numTokens;
};

/**
 * Returns the shortest-context AiModel that can handle the given context length (including input & output tokens), or NULL if the context length is too large.
 */
export const getSmallestModel = (minContextLength: number): AiModel | null => {
  // find shortest model that can handle the context length
  let shortestSufficientModelInfo: AiModel | null = null;
  for (const modelInfo of Object.values(AI_MODELS)) {
    if (modelInfo.maxTokens < minContextLength) continue;
    if (modelInfo.id == AI_MODELS.mpt.id && !env.MPT_ENABLED) continue;
    if (modelInfo.id == AI_MODELS.gpt4.id && !env.GPT4_ENABLED) continue;
    if (
      !shortestSufficientModelInfo ||
      modelInfo.maxTokens < shortestSufficientModelInfo.maxTokens
    ) {
      shortestSufficientModelInfo = modelInfo;
    }
  }
  if (!shortestSufficientModelInfo) {
    return env.MPT_ENABLED ? AI_MODELS.mpt : null;
  }
  // when a cheap model could suffice, randomly decide to use GPT-4 instead
  if (
    minContextLength < AI_MODELS.gpt4.maxTokens &&
    env.GPT4_ENABLED &&
    Math.random() < env.CHANCE_TO_USE_GPT4
  ) {
    return AI_MODELS.gpt4;
  }
  return shortestSufficientModelInfo;
};

export const textLlmInputSchema = z.object({
  chatMlMessages: z.array(z.string()),
  numInputTokens: z.number(),
  maxOutputTokens: z.number().optional(),
});

export type TextLlmInput = z.infer<typeof textLlmInputSchema>;

/**
 *
 * @param systemMessage a system message beginning with "System: ...", or leave blank to use the default
 * @param prompt context fields and input fields
 * @param expectedOutputFields name and description of each output field to generate
 * @param maxOutputTokens maximum number of tokens to generate; defaults to (maxTokens - numInputTokens)
 */
export const assembleTextLlmInput = (data: {
  prompt: { [key: string]: Json };
  expectedOutputFields: { [key: string]: string };
  maxOutputTokens?: 0;
  systemMessage?: string;
  suggestedApproaches?: SuggestedApproaches[];
}): TextLlmInput => {
  try {
    // assemble messages...
    const chatMlMessages = [];

    // validate system message
    let systemMessage = SYSTEM_MESSAGES.default;
    if (data.systemMessage) {
      systemMessage = data.systemMessage;
    }
    if (!systemMessage.toLowerCase().startsWith("system: ")) {
      chatMlMessages.push("System: " + systemMessage);
    } else {
      chatMlMessages.push(systemMessage);
    }

    // validate prompt
    const prompt = {
      ...data.prompt,
      suggestedApproaches: data.suggestedApproaches,
      expectedOutputFields: data.expectedOutputFields,
    };
    const promptStr = JSON.stringify(prompt);
    chatMlMessages.push("User: " + promptStr);

    // count input tokens
    const numInputTokens = getNumTokens(chatMlMessages);

    // validate max output tokens
    let maxOutputTokens = 0;
    if (data.maxOutputTokens) {
      maxOutputTokens = data.maxOutputTokens;
    } else {
      maxOutputTokens = 0.9 * AI_MODELS.gpt4.maxTokens - numInputTokens;
    }

    // create text llm input
    return textLlmInputSchema.parse({
      chatMlMessages,
      numInputTokens,
      maxOutputTokens,
      expectedOutputFields: Object.keys(data.expectedOutputFields),
    });
  } catch (err) {
    console.error("assembleTextLlmInput() failed for data: ", data);
    throw new Error("Error assembling text llm input: " + String(err));
  }
};
