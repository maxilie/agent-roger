import {
  mysqlTable,
  serial,
  text,
  boolean,
  json,
  int,
  date,
} from "drizzle-orm/mysql-core";

/**
 * Task data.
 */
export const tasks = mysqlTable("tasks", {
  // fields in both sql and Neo4j
  id: serial("id").primaryKey(),
  awaitingChildren: boolean("awaiting_children").notNull().default(false),
  completed: boolean("completed").notNull().default(false),
  paused: boolean("paused").notNull().default(false),
  time_created: date("time_created").notNull(),
  // fields only in sql
  parentID: int("parent_id"),
  taskType: text("task_type").notNull(),
  input: text("input"),
  internalData: json("task_data"),
  resultData: json("result_data"),
});
