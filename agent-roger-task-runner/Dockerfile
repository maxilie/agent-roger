FROM node:18

ENV PATH=/usr/local/node/bin:$PATH

RUN mkdir /app
RUN mkdir /app/src
RUN mkdir /app/main
WORKDIR /app/main
COPY agent-roger-task-runner/ /app/main
COPY src/ /app/src

# install dependencies
RUN npm install

ENV NODE_ENV production

CMD [ "npm", "run", "start" ]
