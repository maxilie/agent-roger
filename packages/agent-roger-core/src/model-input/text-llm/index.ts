import { encode } from "gpt-tokenizer";
import { z } from "zod";
import { type Json } from "../../zod-schema/stage-base/json";
import {
  SYSTEM_MESSAGES,
  type SuggestedApproaches,
} from "../../constants/prompts";
import { AI_MODELS } from "../../constants";

// gets number of tokens for an input
export const getNumTokens = (messages: string[]) => {
  let numTokens = 0;
  for (const inputMessage of messages) {
    numTokens += encode(inputMessage).length;
  }
  return numTokens;
};

export const textLlmInputSchema = z.object({
  chatMlMessages: z.array(z.string()),
  numInputTokens: z.number(),
  maxOutputTokens: z.number().optional(),
  expectedOutputFields: z.array(z.string()),
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
