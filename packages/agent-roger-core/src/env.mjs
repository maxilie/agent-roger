import { z } from "zod";

/**
 * Specify your server-side environment variables schema here. This way you can ensure the app isn't
 * built with invalid env vars.
 */
const server = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]),
  CLERK_SECRET_KEY: z.string().min(1),
  DATABASE_HOST: z.string().min(1),
  DATABASE_USERNAME: z.string().min(1),
  DATABASE_PASSWORD: z.string().min(1),
  DATABASE_NAME: z.string().min(1),
  NEO4J_URI: z.string().min(1),
  NEO4J_USER: z.string().min(1),
  NEO4J_PASS: z.string().min(1),
  WEAVIATE_HOST: z.string().min(1),
  WEAVIATE_KEY: z.string().min(1),
  WEAVIATE_BACKUP_DIR: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  NEXT_PUBLIC_GPT4_ENABLED: z.boolean(),
  NEXT_PUBLIC_MPT_ENABLED: z.boolean(),
  NEXT_PUBLIC_CHANCE_TO_USE_GPT4: z.number(),
  REDIS_HOST: z.string(),
  REDIS_PORT: z.number(),
  REDIS_PASS: z.string(),
  LOCAL_EMBEDDINGS_URL: z.string(),
  SHORT_EMBEDDINGS_API_KEY: z.string(),
  LOCAL_LLM_PATH: z.string(),
  LOCAL_LLM_CONTEXT: z.number(),
  LOCAL_LLM_NUM_GPUS: z.number(),
});

/**
 * Specify your client-side environment variables schema here. This way you can ensure the app isn't
 * built with invalid env vars. To expose them to the client, prefix them with `NEXT_PUBLIC_`.
 */
const client = z.object({
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1),
  NEXT_PUBLIC_GPT4_ENABLED: z.boolean(),
  NEXT_PUBLIC_MPT_ENABLED: z.boolean(),
  NEXT_PUBLIC_CHANCE_TO_USE_GPT4: z.number(),
});

/**
 * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
 * middlewares) or client-side so we need to destruct manually.
 *
 * @type {Record<keyof z.infer<typeof server> | keyof z.infer<typeof client>, string | undefined>}
 */
const processEnv = {
  NODE_ENV: process.env.NODE_ENV,
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
  DATABASE_HOST: process.env.DATABASE_HOST,
  DATABASE_USERNAME: process.env.DATABASE_USERNAME,
  DATABASE_PASSWORD: process.env.DATABASE_PASSWORD,
  DATABASE_NAME: process.env.DATABASE_NAME,
  NEO4J_URI: process.env.NEO4J_URI,
  NEO4J_USER: process.env.NEO4J_USER,
  NEO4J_PASS: process.env.NEO4J_PASS,
  WEAVIATE_KEY: process.env.WEAVIATE_KEY,
  WEAVIATE_BACKUP_DIR: process.env.WEAVIATE_BACKUP_DIR,
  WEAVIATE_HOST: process.env.WEAVIATE_HOST,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  NEXT_PUBLIC_GPT4_ENABLED:
    process.env.NEXT_PUBLIC_GPT4_ENABLED == "true" || false,
  NEXT_PUBLIC_MPT_ENABLED:
    process.env.NEXT_PUBLIC_MPT_ENABLED == "true" || false,
  NEXT_PUBLIC_CHANCE_TO_USE_GPT4: +(
    process.env.NEXT_PUBLIC_CHANCE_TO_USE_GPT4 || ""
  ).trim(),
  REDIS_HOST: process.env.REDIS_HOST,
  REDIS_PORT: +process.env.REDIS_PORT,
  REDIS_PASS: process.env.REDIS_PASS,
  LOCAL_EMBEDDINGS_URL: process.env.LOCAL_EMBEDDINGS_URL,
  SHORT_EMBEDDINGS_API_KEY: process.env.SHORT_EMBEDDINGS_API_KEY,
  LOCAL_LLM_PATH: process.env.LOCAL_LLM_PATH,
  LOCAL_LLM_CONTEXT: +process.env.LOCAL_LLM_CONTEXT,
  LOCAL_LLM_NUM_GPUS: +process.env.LOCAL_LLM_NUM_GPUS,
};

// Don't touch the part below
// --------------------------

const merged = server.merge(client);

/** @typedef {z.input<typeof merged>} MergedInput */
/** @typedef {z.infer<typeof merged>} MergedOutput */
/** @typedef {z.SafeParseReturnType<MergedInput, MergedOutput>} MergedSafeParseReturn */

let env = /** @type {MergedOutput} */ (process.env);

if (!!process.env.SKIP_ENV_VALIDATION == false) {
  const isServer = typeof window === "undefined";

  const parsed = /** @type {MergedSafeParseReturn} */ (
    isServer
      ? merged.safeParse(processEnv) // on server we can validate all env vars
      : client.safeParse(processEnv) // on client we can only validate the ones that are exposed
  );

  if (parsed.success === false) {
    console.error(
      "❌ Invalid environment variables:",
      parsed.error.flatten().fieldErrors
    );
    throw new Error("Invalid environment variables");
  }

  env = new Proxy(parsed.data, {
    get(target, prop) {
      if (typeof prop !== "string") return undefined;
      // Throw a descriptive error if a server-side env var is accessed on the client
      // Otherwise it would just be returning `undefined` and be annoying to debug
      if (!isServer && !prop.startsWith("NEXT_PUBLIC_")) {
        // throw new Error(
        //   process.env.NODE_ENV === "production"
        //     ? "❌ Attempted to access a server-side environment variable on the client"
        //     : `❌ Attempted to access server-side environment variable '${prop}' on the client`
        // );
      }
      return target[/** @type {keyof typeof target} */ (prop)];
    },
  });
}

export { env };
