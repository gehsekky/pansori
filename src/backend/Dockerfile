# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM --platform=linux/arm64 node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ── Stage 2: run ──────────────────────────────────────────────────────────────
FROM --platform=linux/arm64 node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
EXPOSE 3001
CMD ["node", "dist/index.js"]
