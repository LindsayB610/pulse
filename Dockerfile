FROM node:22-slim AS build

WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
COPY src ./src
RUN npm ci
RUN npm run build

FROM node:22-slim

WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY bin ./bin

CMD ["node", "bin/pulse-runner.mjs", "--watch"]
