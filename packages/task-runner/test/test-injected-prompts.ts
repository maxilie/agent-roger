// change host name for docker containers from "host.docker.internal" to "localhost"
process.env.WEAVIATE_HOST = (
  process.env.WEAVIATE_HOST || "host.docker.internal:8080"
).replace("host.docker.internal", "localhost");
process.env.WEAVIATE_HOST = (
  process.env.REDIS_HOST || "host.docker.internal"
).replace("host.docker.internal", "localhost");
process.env.LOCAL_EMBEDDINGS_URL = (
  process.env.LOCAL_EMBEDDINGS_URL ||
  "http://host.docker.internal:699/embedParagraph/"
).replace("host.docker.internal", "localhost");

// startup connection to sql and weaviate

// test saving a few prompts to weaviate

// test finding prompt injections for identical prompts

// test finding prompt injections for similar prompts

// test finding prompt injections for unrelated prompts
