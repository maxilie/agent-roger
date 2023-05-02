import { type Json } from "../db/db-types";
import { type TaskDefinition } from "../task/task-definition";
import { type WeaviateClient } from "weaviate-ts-client2";

export type GetFn = <T extends Json>(key: string) => Promise<T | null>;
export type SetFn = (key: string) => void;
export type ErrFn = (err: string | object) => void;
export type TextLLMFn = (input: string[]) => Promise<string>;
export type SubTaskFn = (newTaskDefinition: TaskDefinition) => Promise<number>;
export type EndFn = () => void;
export type StageFunctionHelpers = {
  get: GetFn;
  set: SetFn;
  err: ErrFn;
  textLLM: TextLLMFn;
  weaviateClient: WeaviateClient;
  subTask: SubTaskFn;
  end: EndFn;
};
export type StageFunction = (helpers: StageFunctionHelpers) => Promise<void>;
