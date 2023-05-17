// this is the best (and only valid?) way to define JSON in zod

import { z } from "zod";

// see: https://zod.dev/?id=json-type
export const literalSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);
export type Literal = z.infer<typeof literalSchema>;
export type Json = Literal | { [key: string]: Json } | Json[];
export const jsonSchema: z.ZodType<Json> = z.lazy(() =>
  z.union([literalSchema, z.array(jsonSchema), z.record(jsonSchema)])
);
export type JsonObj = { [key: string]: Json };
export const jsonObjSchema: z.ZodType<JsonObj> = z.record(jsonSchema);
