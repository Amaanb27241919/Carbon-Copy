FROM node:20-alpine

RUN apk add --no-cache wget

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY src/ ./src/
COPY blueprints/ ./blueprints/

RUN mkdir -p /data/knowledge

EXPOSE 3008

CMD ["node", "src/index.js"]
