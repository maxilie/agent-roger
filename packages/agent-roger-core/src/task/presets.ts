import task_abstract from "./abstract";

const TASK_PRESETS = {
  abstract: task_abstract,
  // TODO tasks for summarizing context and sub-task outputs
  // TODO task_generate_text
  // TODO task_execute_shell
  // TODO task_execute_typescript
  // TODO some kind of task to do stuff in a browser
};

export default TASK_PRESETS;
