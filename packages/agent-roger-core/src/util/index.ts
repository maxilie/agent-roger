import { encode } from "gpt-tokenizer";
import { type } from "os";
import { z } from "zod";

// LRU cache for tokenization
class LruCache extends Map<string, string> {
  private maxEntries: number;

  constructor(maxEntries = 10000) {
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
  chatLmMessages: z.array(z.string()),
  numInputTokens: z.number(),
  maxOutputTokens: z.number().optional(),
  expectedOutputFields: z.array(z.string()),
});

export type TextLlmInput = z.infer<typeof textLlmInputSchema>;

/**
 *
 * @param systemMessage don't include "System: "
 * @param exampleMessages start each message with "User: " / "Assistant: ", or it will default to "User: "
 * @param prompt
 * @returns
 */
const assembleTextLlmInput = (
  prompt: string[],
  expectedOutputFields: string[],
  systemMessage: string,
  exampleMessages?: string[]
): TextLlmInput => {
  return textLlmInputSchema.parse({});
};
