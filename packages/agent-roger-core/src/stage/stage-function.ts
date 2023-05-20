import { type WeaviateClient } from "weaviate-ts-client";
import { type ResultData } from "../zod-schema/index.js";
import { type Json, type JsonObj } from "../zod-schema/stage-base/json.js";
import { type TaskDefinition } from "../zod-schema/stage-base";
import { type TextLlmInput } from "../model-input/index.js";

export type GetFn = <T extends Json>(key: string) => Promise<T | null>;
export type SetFn = (key: string, val: Json | null) => void;
export type TextLLMFn = (data: TextLlmInput) => Promise<JsonObj>;
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
    memoryBankID?: string | null;
  },
  localParentTag?: string | number | null
) => Promise<number>;
export type PauseTaskFn = () => void;
export type EndStageFn = (err?: string | object) => void;
export type TaskResultFn = (result: ResultData) => void;
export type ExecCmdFn = (cmd: string) => Promise<string>;
export type StageFunctionHelpers = {
  initialInputFields: JsonObj;
  initialContextFields: JsonObj;
  initialContextSummary: string;
  get: GetFn;
  set: SetFn;
  // if null or "global", the global memory bank will be used
  memoryBankID: "global" | string | null;
  switchMemoryBank: (
    newMemoryBankID: "global" | string | null
  ) => Promise<void>;
  textLLM: TextLLMFn;
  embeddingLLM: EmbeddingLLMFn;
  weaviateClient: WeaviateClient;
  subTask: SubTaskFn;
  pauseTask: PauseTaskFn;
  endStage: EndStageFn;
  taskResult: TaskResultFn;
  execCmd: ExecCmdFn;
};
export type StageFunction = (helpers: StageFunctionHelpers) => Promise<void>;
