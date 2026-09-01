FROM node:22-alpine
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build
RUN npm prune --production

# SQLite data lives on a persistent volume mounted at /app/data
VOLUME ["/app/data"]

EXPOSE 3000
CMD ["node", "dist/index.js"]
