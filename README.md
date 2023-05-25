# Agent Roger

### An AI agent structured as a dynamic task tree.

### This repo also comes with a dashboard to visualize and modify the tree, improving the AI's logic in real time.

### Demo

demo pics and video go here

# What is Agent Roger?

Agent Roger is an AI system that can complete your tasks by intelligently spawning and processing its own sub-tasks.

Even more broadly speaking, it is a somewhat novel _implementation_ for the idea of "AI using other AI."

Its purpose is similar to that of LangChain, BabyAGI, AutoGPT, and other task-based and execution-loop-based systems.

However, there are key differences in Agent Roger:

### Serves as an application rather than a framework:

- This repo contains code to launch a UI and task runner process(es) that require particular database setups, which are described below in the "Getting Started" section.
- Within the rigid structure of the task tree system, you can very easily customize the following parts of the `agent-roger-core` package:
  - Prompts.
  - Stage functions. A stage function is a function that a task continuously calls until the stage is ended, at which point the task moves on to the next stage function.
  - Task definitions. A `TaskDefinition` is an array of stage functions to run in order before passing the task's output to its parent task. Each stage function has access to variables saved by the stage functions before it.
  - Task presets. A task preset is just a name for a `TaskDefinition`. Creating a task preset allows the AI to spawn a task that runs your custom stage functions.
- The LLM can accept any arbitrary JSON fields you provide it, and return JSON values for the named `outputFields` you request.
  - TODO: We will move to Microsoft's `guidance` format to: 1) more effectively communicate to the LLM how to use the tools it has available to it, and 2) enable LLM prompts to include a "blank space" for each named output field inline of one big context string (instead of being limited to a list of context fields and another list of requested output fields)
- To give the AI new functionality:
  - Create an `index.ts` file in a new folder: `packages/agent-roger-core/src/stage/task-<custom-task-name>`.
    - To keep it simple, you can perform all the task's logic in a single stage function.
    - Create your stage function by following the patterns of existing stage functions, like those in `packages/agent-roger-core/src/stage/task-execute-shell/index.ts`.
    - Follow the pattern for adding your new stage function(s) to the `packages/agent-roger-core/stage/presets.ts` file.
  - Create an `index.ts` file in a new folder: `packages/agent-roger-core/src/task/<custom-task-name>`.
    - Create a new task definition following the examples in other tasks. For example, `packages/agent-roger-core/src/task/execute-shell/index.ts`.
      - The "isAbstract" field should almost always be set to false. The system should only have one abstract task available to it (the task preset called "abstract" - see below file), which is responsible for breaking down an abstract task into simpler, more concrete sub-tasks.
    - Follow the pattern for adding your new task definition to the `packages/agent-roger-core/task/presets.ts` file.
  - Add a `SuggestedApproach` for your new task preset in the `packages/agent-roger-core/constants.prompts.ts` file, in the variable, `SUGGESTED_APPROACHES.generateSubTasks`.
    - This tells.

### Uses a dynamic _task tree_ instead of a queue:

- AI can delegate to arbitrary sub-tasks, branching out into sub-tasks-of-sub-tasks-of-etc.

### Task tree is _dynamic_:

- A single misstep in a sub-task does not necessarily ruin the overall task.
- A failed sub-task will try to improve until it is successful or has exhausted all reasonable options.
- User can provide feedback on a sub-task and restart a sub-tree while preserving the rest of the tree's independent logic.
- Independent sub-tasks can run concurrently or even on multiple machines.

### AI can switch its context between a global memory bank and local, task-specific memory banks.

- Memory banks are vector databases that store JSON documents and their embeddings.
- Currently we only store indexes of local files and summaries of previous tasks. Soon we will also store indexes of web content, information that the AI determines is commonly needed, and summaries of task trees.
- By default, a new memory bank is created for each new root task (user input), and documents are stored to both the new local memory bank and the global memory bank.
  - To save time, the AI will use the global memory bank if you tell it to (using plain english) in the root task's inputFields. For example, `inputFields: { "instructions": "Do some task. Use the global memory bank." }`.
  - Using the global memory bank is a trade-off: Tasks using the global memory bank will progress quicker as you run more of them, because they will remember how similar tasks were run and will already have the filesystem indexed. However, this could lead to the system remembering outdated prompts and file contents, which could cause the task to fail.
  - For best results, do not tell the system to use the global memory bank.

### Practically free (excepting cost of inferencing tokens) to get started:

- As of publishing this, all default database vendors have unreasonably generous free tiers, and offer reasonable pay-as-you-go pricing should you exceed the free tier limits.

### Runs orders of magnitude more inferences and logic to execute a single sub-task than do traditional systems:

- Agent Roger is made for an age when inference is relatively cheap (think 200k tokens/second at $30 USD/hr for a 50B-parameter multi-modal model).
- This repo provides a starting point for exploring the possibilities of using dynamic, concurrency-friendly task trees.
- The problem of inference (two problems: fine-tuning models and inferencing them quickly) is left to the intelligent and determined reader.

### Combines cloud resources with a lightweight `task runner` that can run on a low-end laptop, enabling it to:

- Execute bash scripts on your computer.
- Solve a pesky bug for you by searching through and editing your project files.
- [NOT YET IMPLEMENTED] Concurrently operate multiple graphical browsers with different sessions.
- [REQUIRES CUSTOMIZED INFERENCE] Develop an entirely new codebase in a specified folder.
- [REQUIRES CUSTOMIZED INFERENCE] Process large amounts of information into files on your computer (spreadsheets, word documents, powerpoints, pdfs, images)
- [REQUIRES CUSTOMIZED INFERENCE] Index your files, online accounts, messages, etc. and look for insights.
- [REQUIRES CUSTOMIZED INFERENCE] Write code to your computer, deploy it using your command line, and test it until it works.
- [REQUIRES CUSTOMIZED INFERENCE] Learn and experiment with new functionalities and patterns on its own.

### The repo includes a dashboard:

- Interactive task tree shows every thought and data point involved in your task.
- Ability to pause/modify/rerun sub-tasks.
- Modify and copy any task data to a designated db table for future use with fine-tuning your own LLM.

### Written in TypeScript:

- Uses the `zod` library for type checking, which enables better autocomplete, error handling, bug detection, etc.
- Enables the developer, the dashboard user, and the AI to be confident that any JSON data has the fields it expects -- even including custom schema generated by the AI or user.
- NOTE: If you're not using an API like OpenAI's, then you will still need to implement your own inference engine, likely using Python.

# Getting Started

The easiest way to get started is to:

1. Fork the repo.
2. Duplicate `.env.example` to a fresh `.env` (only in your local environment!).
3. Fill in the environment variables in `.env`, using the Setup Details (below) as a reference.

<details>
   <summary>Setup Details</summary>

You will need the following (free) infra, each of which can be spun up using vendors' websites:

- new Vercel app pointing at your forked GitHub repo (vercel.com)
- new PlanetScale MySQL database (planetscale.com)
- new Upstache Redis database (upstache.com)
- new Neo4J graph database (neo4j.com/auradb)
- new Clerk authentication app (clerk.com)
  - create a user, say, `adminUser`. create an organization called `admin` set its owner to the admin user.
  - only members of the `admin` organization will be able to access the dashboard.

Set environment variables:

- Use `.env.example` as a template which lists the requried environment variables.
- For local development, set correct environment variables in your `.env`.
- For deployment, set correct environment variables in the Vercel dashboard under Settings -> Environment Variables (you can copy/paste from your `.env` file).

</details>

# Deploying

1. Push to GitHub to trigger new Vercel deployment of the dashboard.

   - You can also run the dashboard on your local computer: `yarn start:dashboard`.

2. To start the Weaviate vector database:

```bash
docker-compose down # ensures database is saved to disk
docker-compose rm -f # if you want to rebuild from scratch
docker-compose up # OR, TO RUN IN BACKGROUND: docker-compose up -d
```

3. To start a task runner (can be run locally), make sure `.env` is correct and start the container:

```bash
# install external dependencies
yarn install

# build core packages
yarn run build:core

# build a docker image for task runner
yarn run build:task-runner

# RUN DOCKER CONTAINER
yarn run start:task-runner
```

<details>

   <summary>Local Deployment</summary>
   
To run the dashboard on your local computer:

```bash
# install external dependencies
yarn install

# build core packages
yarn run build:core

# START THE DASHBOARD
yarn run start:dashboard # or:  yarn run dev
```

</details>

# MySQL Database

To change database schema:

1. Log in to planetscale.com.
2. Create a new branch of the main database and copy the credentials into your local `.env` file.
3. Change `/packages/agent-roger-core/src/db/sql-schema.ts` and other files as necessary.
4. Run `yarn workspace agent-roger-core db-push` to update the new PlanetScale branch.
5. Make any changes you need in order for the rest of the code to work with the new schema.
6. Once everything is working locally, go to the PlanetScale branch and create a new "deploy request", and then approve the deploy request to update the db main branch's schema.

# Vector Database (Weaviate)

Weaviate powers Agent Roger's context logic:

- It stores documents as vector embeddings (lists of numbers) that represent semantic meaning.
- Weaviate seems to be a good solution because it allows for both vector and traditional keyword search, and it can be self-hosted locally on a decent CPU or in the cloud.

Switching to a different vector database:

- You will need to alter a few components: new environment variables, new Tasks using new Stages for retrieving and storing context, and possibly for embedding vectors (depending on the vector length setting of the database).

# Development

NOTE: We use yarn workspaces to configure the monorepo. You might need a Yarn "Editor SDK" in order for your IDE to properly recognize imports:

- `yarn dlx @yarnpkg/sdks vscode`
- Press ctrl+shift+p in a TypeScript file
- Choose "Select TypeScript Version"
- Pick "Use Workspace Version"
- See here for more info: https://yarnpkg.com/getting-started/editor-sdks#vscode

# Miscellaneous

The dashboard visualizer does not work with Brave browser's shields enabled (specifically, the "block fingerprinting" option disables click functionality for the dashboard's force graph).

If docker fails to build, you may need to disable buildkit by running the following commands in a terminal:

```bash
export DOCKER_BUILDKIT=0
export COMPOSE_DOCKER_CLI_BUILD=0
```
