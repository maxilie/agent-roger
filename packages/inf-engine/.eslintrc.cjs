/** @type {import("eslint").Linter.Config} */
const config = {
  extends: ["@agent-roger/eslint-config-base"],
  parserOptions: {
    project: "packages/inf-engine/tsconfig.json",
  },
  ignorePatterns: ["llama.ccp/**/*"],
};

module.exports = config;
