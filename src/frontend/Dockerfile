# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM --platform=linux/arm64 node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Painted art tier — Vite inlines import.meta.env at build, so this is a build
# arg. Default empty ⇒ FREE glyph/color tier (a public build with no licensed
# packs). Production CI passes --build-arg VITE_PAINTED_ART=1 (and bundles the
# painted overlay into the image / a CDN via VITE_ASSET_BASE_URL).
ARG VITE_PAINTED_ART
ARG VITE_ASSET_BASE_URL
ENV VITE_PAINTED_ART=${VITE_PAINTED_ART}
ENV VITE_ASSET_BASE_URL=${VITE_ASSET_BASE_URL}
RUN npm run build

# ── Stage 2: serve ────────────────────────────────────────────────────────────
FROM --platform=linux/arm64 nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
# SPA fallback: unknown paths return index.html so React Router handles routing
COPY nginx-spa.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
