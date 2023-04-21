# Setup

Create the infra using vendor dashboards:

- new PlanetScale MySQL database
- new Upstache Kafka queue
- new Neo4J graph database
- new Vercel app pointing at this GitHub repo
- new Clerk authentication app

Set environment variables:

- Use `.env.example` as a template which lists the requried environment variables.
- For local development, set correct environment variables in a new `.env`.
- For deployment, set correct environment variables in the Vercel dashboard.

NOTE: If you get a type error for `drizzle-kit` in `/src/drizzle.config.ts`, then you need to install `drizzle-kit@db-push`.

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
