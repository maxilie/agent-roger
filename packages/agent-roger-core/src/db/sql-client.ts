import { drizzle } from "drizzle-orm/planetscale-serverless";

import { connect } from "@planetscale/database";
import { env } from "../env.mjs";

// define the connection
export const connection = connect({
  host: env.DATABASE_HOST,
  username: env.DATABASE_USERNAME,
  password: env.DATABASE_PASSWORD,
});

export const sqlClient = drizzle(connection);
