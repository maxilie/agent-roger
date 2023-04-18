FROM node:18.5.0 as base

WORKDIR /home/node/app

COPY agent-roger-task-runner/package*.json ./

RUN npm i

COPY agent-roger-task-runner/tsconfig.json ./
COPY agent-roger-task-runner/src ./src

FROM base as production

ENV NODE_PATH=./src

CMD [ "npm", "run", "start" ]
