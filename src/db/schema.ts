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
  paused: boolean("paused").notNull().default(false),
  success: boolean("success"),
  dead: boolean("dead").notNull().default(false),
  // root task or sub-task
  parentID: int("parent_id"),
  // timestamps
  time_created: date("time_created").notNull(),
  time_last_updated: date("time_last_updated").notNull(),
  // task definition
  taskType: text("task_type").notNull(),
  input: json("input"),
  initialContextSummary: text("initial_context"),
  generateSubTasksStageIdx: int("generate_sub_tasks_stage_idx"),
  // data from intermediary stages of task lifecycle
  internalData: json("task_data"),
  semanticContextQueries: json("semantic_context_queries"),
  keywordContextQueries: json("keyword_context_queries"),
  semanticQueryEmbeddings: json("semantic_query_embeddings"),
  rawContext: json("raw_context"),
  // summarizeContextChildTaskID: int("summarize_context_child_task_id"),
  contextSummary: text("context_summary"),
  stepsAndSuccessCriteria: json("steps_and_success_criteria"),
  summarizeSubTaskOutputsChildTaskID: int("summarize_sub_task_outputs_child_task_id"),
  subTasksSummary: text("sub_tasks_summary"),
  validationSummary: text("validation_summary"),
  resultData: json("result_data"),
  stage0Data: json("stage_0_data"),
  stage1Data: json("stage_1_data"),
  stage2Data: json("stage_2_data"),
  stage3Data: json("stage_3_data"),
  stage4Data: json("stage_4_data"),
  stage5Data: json("stage_5_data"),
  stage6Data: json("stage_6_data"),
  stage7Data: json("stage_7_data"),
  stage8Data: json("stage_8_data"),
  stage9Data: json("stage_9_data"),
  stage10Data: json("stage_10_data"),
  stage11Data: json("stage_11_data"),
  stage12Data: json("stage_12_data"),
  stage13Data: json("stage_13_data"),
  stage14Data: json("stage_14_data"),
  stage15Data: json("stage_15_data"),
  stage16Data: json("stage_16_data"),
  stage17Data: json("stage_17_data"),
  stage18Data: json("stage_18_data"),
  stage19Data: json("stage_19_data"),
  stage20Data: json("stage_20_data"),
  stage21Data: json("stage_21_data"),
  stage22Data: json("stage_22_data"),
  stage23Data: json("stage_23_data"),
});
