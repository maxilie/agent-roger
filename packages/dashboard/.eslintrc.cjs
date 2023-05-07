/** @type {import("eslint").Linter.Config} */
const config = {
  extends: ["@agent-roger/eslint-config-base", "next/core-web-vitals", "next"],
  parserOptions: {
    project: "packages/dashboard/tsconfig.json",
  },
  settings: {
    root: "../../",
  },
  ignorePatterns: ["src/components/force-graph.jsx"],
};

module.exports = config;
