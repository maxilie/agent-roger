import { encode } from "gpt-tokenizer";
import { z } from "zod";
import { type Json } from "../../zod-schema/stage-base/json";
import {
  SYSTEM_MESSAGES,
  type SuggestedApproaches,
} from "../../constants/prompts";
import { AI_MODELS } from "../../constants";

// LRU cache for tokenization
class LruCache extends Map<string, string> {
  private maxEntries: number;

  constructor(maxEntries = 100000) {
    super();
    this.maxEntries = maxEntries;
  }

  get(key: string): string | undefined {
    if (!super.has(key)) return undefined;
    const entry = super.get(key) as string;
    super.delete(key);
    super.set(key, entry);
    return undefined;
  }

  set(key: string, value: string): this {
    if (super.size >= this.maxEntries) {
      const keyToDelete = super.keys().next().value as string;
      super.delete(keyToDelete);
    }
    return super.set(key, value);
  }
}
const tokenizationCache = new LruCache();

// gets number of tokens for an input
export const getNumTokens = (messages: string[]) => {
  let numTokens = 0;
  for (const inputMessage of messages) {
    numTokens += encode(inputMessage, tokenizationCache).length;
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

// TODO Add parameter for availableTaskPresets. For each one, add a description of when to use it to the prompt.
/**
 *
 * @param systemMessage a system message beginning with "System: ...", or leave blank to use the default
 * @param exampleMessages start each message with "User: ..." / "Assistant: ...", or it will default to "User: ..."
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
    if (data.systemMessage) {
      if (!data.systemMessage.toLowerCase().startsWith("system: ")) {
        chatMlMessages.push("System: " + data.systemMessage);
      } else {
        chatMlMessages.push(data.systemMessage);
      }
    } else {
      chatMlMessages.push(SYSTEM_MESSAGES.default);
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
