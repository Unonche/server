FROM node:18-alpine

ENV NODE_ENV=production
ENV PORT=8080

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm ci && npm cache clean --force

COPY . .

EXPOSE 8080

CMD [ "npm", "start" ]
