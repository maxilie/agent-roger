/** @type {import("eslint").Linter.Config} */
const config = {
  extends: ["@agent-roger/eslint-config-base"],
  parserOptions: {
    project: "packages/task-runner/tsconfig.json",
  },
};

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
module.exports = config;
