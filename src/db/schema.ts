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
  // id
  taskID: serial("id").primaryKey(),
  // status
  awaitingChildren: boolean("awaiting_children").notNull().default(false),
  completed: boolean("completed").notNull().default(false),
  paused: boolean("paused").notNull().default(false),
  // root task or sub-task
  parentID: int("parent_id"),
  // timestamps
  time_created: date("time_created").notNull(),
  time_last_updated: date("time_last_updated").notNull(),
  // task definition
  taskType: text("task_type").notNull(),
  success: boolean("success"),
  input: json("input"),
  initialContextSummary: text("initial_context"),
  // data from intermediary stages of task lifecycle
  internalData: json("task_data"),
  semanticContextQueries: json("semantic_context_queries"),
  keywordContextQueries: json("keyword_context_queries"),
  semanticQueryEmbeddings: json("semantic_query_embeddings"),
  rawContext: json("raw_context"),
  summarizeContextChildTaskID: int("summarize_context_child_task_id"),
  contextSummary: text("context_summary"),
  stepsAndSuccessCriteria: json("steps_and_success_criteria"),
  summarizeSubTaskOutputsChildTaskID: int("summarize_sub_task_outputs_child_task_id"),
  subTasksSummary: text("sub_tasks_summary"),
  validationSummary: text("validation_summary"),
  resultData: json("result_data"),
});
