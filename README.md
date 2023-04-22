# Agent Roger

### An AI agent structured as a dynamic task tree.

### This repo also comes with a dashboard to visualize and modify the tree, improving the AI's logic in real time.

## Demo

demo pics and video go here

# What is Agent Roger?

Agent Roger is an AI system that can complete your tasks by intelligently spawning and processing its own sub-tasks.

More broadly speaking, it is a somewhat novel _implementation_ for the idea of "AI using other AI."

Its purpose is similar to that of LangChain, BabyAGI, and other task-based and execution-loop-based systems.

However, there are key differences in Agent Roger:

### Serves as an application rather than a high-level framework, but is still modular enough to be expanded upon.

- Both you, the human, and your AI can define custom tasks and sub-tasks using simple JSON text.
- Each "stage" of a task's lifecycle has its own logic and variables, and it's simple to code new stages and use them to define a new task (as JSON).

### Uses a _dynamic task tree_ instead of a queue:

- AI can delegate to arbitrary sub-tasks, branching out into sub-tasks-of-sub-tasks-of-etc.

### Task tree is dynamic:

- A single misstep in a sub-task does not necessarily ruin the overall task.
- A failed sub-task will try to improve until it is successful or has exhausted all reasonable options.
- User can provide feedback on a sub-task and restart a sub-tree while preserving the rest.
- Independent sub-tasks can run concurrently or even on multiple machines.

### Contains partly hard-coded optimizations for handling context and "memory" of previous experiences.

### Practically free (excepting cost of inferencing tokens) to get started:

- As of publishing this, all default database vendors have unreasonably generous free tiers, and offer reasonable pay-as-you-go pricing should you exceed the free tier limits.

### Runs orders of magnitude more inferences and logic to execute a single sub-task than do traditional systems:

- Agent Roger is made for an age when inference is cheap (think 200k tokens/second at $10 USD/hr for a top-notch multimodal transformer model).
- This repo provides a starting point for exploring the possibilities of using dynamic, concurrency-friendly task trees.
- The problem of inference (two problems: fine-tuning models and inferencing them quickly) is left to the intelligent and determined reader.

### Combines cloud resources with a lightweight `task runner` that can run on a low-end laptop, enabling it to:

- Execute bash scripts on your computer.
- Solve a pesky bug for you by searching through and editing your project files.
- [NOT YET IMPLEMENTED] Concurrently operate multiple graphical browsers with different sessions.
- [REQUIRES CUSTOMIZED INFERENCE] Develop an entirely new codebase in a specified folder.
- [REQUIRES CUSTOMIZED INFERENCE] Process large amounts of information into files on your computer (spreadsheets, word documents, powerpoints, pdfs, images)
- [REQUIRES CUSTOMIZED INFERENCE] Index your files, online accounts, messages, etc. and look for insights.

### The repo includes a dashboard:

- Interactive task tree shows every thought and data point involved in your task.
- Ability to pause/modify/rerun sub-tasks.
- Modify and save any task to your database for future use with fine-tuning your own LLM.

# Getting Started

The easiest way to get started is:

1. Clone the repo.
2. Rename `.env.example` to `.env`
3. Fill in the environment variables in `.env`, using the Setup Details (below) as a reference.

<details>
   <summary>Setup Details</summary>

You will need the following (free) infra, most of which can be spun up using vendors' websites:

- new Vercel app pointing at your forked GitHub repo (vercel.com)
- new PlanetScale MySQL database (planetscale.com)
- new Upstache Redis database (upstache.com)
- new Neo4J graph database (AuraDB)
- new Clerk authentication app (clerk.com)

Set environment variables:

- Use `.env.example` as a template which lists the requried environment variables.
- For local development, set correct environment variables in a new `.env`.
- For deployment, set correct environment variables in the Vercel dashboard under Settings -> Environment Variables (you can copy/paste from your `.env` file).

NOTE: If you get a type error for `drizzle-kit` in `/src/drizzle.config.ts`, then you need to install `yarn add --dev drizzle-kit@db-push` or a later version.

</details>

# Deploying

1. Push to GitHub to trigger new Vercel deployment of the dashboard.
2. To start the Weaviate vector database:

```
cd agent-roger
docker-compose down  # ensures database is saved to disk
docker-compose rm -f  # if you want to rebuild from scratch
docker-compose up  # OR, TO RUN IN BACKGROUND:  docker-compose up -d
```

3. To start a task runner (can be run locally), make sure `.env` is correct and start the container:

```
cd agent-roger  # docker context must be dashboard project root in order to share /src folder (contains database schema)
docker build -t agent-roger-task-runner -f agent-roger-task-runner/Dockerfile . && docker run -it agent-roger-task-runner
```

# MySQL Database

To change database schema:

1. Log in to planetscale.com.
2. Create a new branch of the main database and copy the credentials into your local `.env` file.
3. Change `/src/db/schema.ts` and other files as necessary.
4. Install (temporarily) special version of drizzle-kit: `yarn add --dev drizzle-kit@db-push`.
5. Run `npx drizzle-kit push:mysql` to update the new PlanetScale branch.
6. Update drizzle-kit or else Vercel deployment will fail: `yarn remove drizzle-kit && yarn add --dev drizzle-kit`.
7. Change any router and component code necessary to work with the new schema.
8. Once everything is working locally, go to the PlanetScale branch and create a new "deploy request", and then approve the deploy request to update the db main branch's schema.

# Vector Database (Weaviate)

The w
