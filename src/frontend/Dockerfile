# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM --platform=linux/arm64 node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ── Stage 2: serve ────────────────────────────────────────────────────────────
FROM --platform=linux/arm64 nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
# SPA fallback: unknown paths return index.html so React Router handles routing
COPY nginx-spa.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
