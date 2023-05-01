/**
 * This is for drizzle-kit, which is only by the developer for updating database schema (`npx drizzle-kit push:mysql`).
 *
 * Runtime uses drizzle-orm, which we configured to use HTTP requests instead of "mysql://...".
 * */

import type { Config } from "drizzle-kit";
import d from "dotenv";
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
d.config();
// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
d.config({ path: `../../.env`, override: true });

export default {
  out: "./migrations",
  schema: "./src/db/sql-schema.ts",
  // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
  connectionString: `mysql://${process.env.DATABASE_USERNAME}:${process.env.DATABASE_PASSWORD}@${process.env.DATABASE_HOST}:3306/${process.env.DATABASE_NAME}?ssl={"rejectUnauthorized":true}`,
  breakpoints: true,
} satisfies Config;
