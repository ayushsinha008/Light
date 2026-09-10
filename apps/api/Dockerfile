FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY apps/api/package.json apps/api/
COPY packages/schemas/package.json packages/schemas/
COPY packages/shared/package.json packages/shared/
COPY packages/privacy/package.json packages/privacy/
COPY packages/ai-provider/package.json packages/ai-provider/
COPY packages/agent-core/package.json packages/agent-core/
COPY packages/vision/package.json packages/vision/
RUN npm install --workspace=@privai/api --include-workspace-root

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build -w @privai/schemas \
 && npm run build -w @privai/shared \
 && npm run build -w @privai/privacy \
 && npm run build -w @privai/ai-provider \
 && npm run build -w @privai/agent-core \
 && npm run db:generate -w @privai/api \
 && npm run build -w @privai/api

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app /app
WORKDIR /app/apps/api
EXPOSE 4000
CMD ["node", "dist/index.js"]
