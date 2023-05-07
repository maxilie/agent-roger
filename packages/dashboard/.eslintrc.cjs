/** @type {import("eslint").Linter.Config} */
const config = {
  extends: ["@agent-roger/eslint-config-base", "next/core-web-vitals"],
  parserOptions: {
    project: "./tsconfig.json",
  },
  ignorePatterns: ["src/components/force-graph.jsx"],
};

module.exports = config;
