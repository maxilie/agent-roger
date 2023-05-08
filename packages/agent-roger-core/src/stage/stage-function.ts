import { type WeaviateClient } from "weaviate-ts-client2";
import {
  type JsonObj,
  type Json,
  type ResultData,
  type TaskDefinition,
} from "../zod-schema/index.js";

export type GetFn = <T extends Json>(key: string) => Promise<T | null>;
export type SetFn = (key: string, val: Json | null) => void;
export type TextLLMFn = (data: {
  input: string[];
  numInputTokens: number;
  maxOutputTokens?: number;
}) => Promise<JsonObj>;
export type EmbeddingLLMFn = (data: {
  input: string[];
  numInputTokens: number[];
}) => Promise<number[][] | null>;
export type SubTaskFn = (
  input: {
    newTaskDefinition: TaskDefinition;
    initialInputFields?: JsonObj | null;
    initialContextFields?: JsonObj | null;
    initialContextSummary?: string | null;
  },
  localParentTag?: string | number | null
) => Promise<number>;
export type PauseTaskFn = () => void;
export type EndStageFn = (err: string | object) => void;
export type TaskResultFn = (result: ResultData) => void;
export type StageFunctionHelpers = {
  get: GetFn;
  set: SetFn;
  textLLM: TextLLMFn;
  embeddingLLM: EmbeddingLLMFn;
  weaviateClient: WeaviateClient;
  subTask: SubTaskFn;
  pauseTask: PauseTaskFn;
  endStage: EndStageFn;
  taskResult: TaskResultFn;
};
export type StageFunction = (helpers: StageFunctionHelpers) => Promise<void>;
