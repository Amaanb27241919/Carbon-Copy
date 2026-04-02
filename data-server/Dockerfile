FROM node:20-alpine

RUN apk add --no-cache wget

WORKDIR /app

COPY package*.json ./
RUN npm ci --production

COPY src/ ./src/

EXPOSE 3002

CMD ["node", "src/index.js"]
