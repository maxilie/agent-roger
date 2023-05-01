import { env } from "../env.mjs";
import * as neo4j from "neo4j-driver";

/**
 * Provides a Neo4J driver that will be safely closed after the callback is executed.
 */
export const withNeo4jDriver = async (
  callback: (neo4jDriver: neo4j.Driver) => Promise<void>
): Promise<void> => {
  const neo4jDriver = neo4j.driver(
    env.NEO4J_URI,
    neo4j.auth.basic(env.NEO4J_USER, env.NEO4J_PASS)
  );
  try {
    await callback(neo4jDriver);
  } finally {
    await neo4jDriver.close();
  }
};
