FROM node:20.5.0 as build

WORKDIR /usr/src

RUN mkdir -p packages/agent-roger-core packages/task-runner .yarn/releases
COPY ./yarn.lock ./
COPY .yarnrc.yml ./
COPY .yarn/releases .yarn/releases
COPY .env .env
COPY ./package.json ./
COPY ./libs/@eslint-config-base/package.json ./libs/@eslint-config-base/package.json
COPY ./libs/@eslint-config-base/tsconfig.json ./libs/@eslint-config-base/tsconfig.json
COPY ./packages/agent-roger-core/package.json ./packages/agent-roger-core/package.json
COPY ./packages/agent-roger-core/tsconfig.json ./packages/agent-roger-core/tsconfig.json
COPY ./packages/task-runner/package.json ./packages/task-runner/package.json
COPY ./packages/task-runner/tsconfig.json ./packages/task-runner/tsconfig.json

RUN yarn

COPY ./libs/@eslint-config-base/ ./libs/@eslint-config-base/
COPY ./packages/agent-roger-core/ ./packages/agent-roger-core/
COPY ./packages/task-runner/ ./packages/task-runner/

RUN yarn run build:core

CMD ["yarn", "workspace", "agent-roger-task-runner", "start"]
