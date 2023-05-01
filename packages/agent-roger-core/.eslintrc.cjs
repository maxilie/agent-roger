/** @type {import("eslint").Linter.Config} */
const config = {
  extends: ["@agent-roger/eslint-config-base"],
  parserOptions: {
    project: "packages/agent-roger-core/tsconfig.json",
  },
  ignorePatterns: ["dist/src/env.d.mts", ".eslintrc.cjs"],
};

module.exports = config;
