# Technology Stack

**Analysis Date:** 2026-06-20

## Languages

**Primary:**
- TypeScript 6.0.3 - Full codebase (backend + frontend)
- SQL - Database migrations and schema

**Secondary:**
- Bash - Scripts and CI/CD tooling
- YAML - Docker Compose and GitHub Actions configurations

## Runtime

**Environment:**
- Node.js 20 (alpine Docker images for production)

**Package Manager:**
- npm (v10+ via Node 20)
- Lockfile: `package-lock.json` (committed)

## Frameworks

**Core:**
- Express 4.18.3 - HTTP server and routing (`src/backend/src/index.ts`)
- React 18.3.1 - Frontend UI framework
- Vite 7.3.3 - Frontend dev server and build tool

**3D/Graphics:**
- Three.js 0.160.1 - 3D rendering for room crawler view (`Room3DView` lazy-loaded)
- @react-three/fiber 8.18.0 - React bindings for Three.js
- @react-three/drei 9.122.0 - Three.js utilities for React

**Real-Time Communication:**
- Socket.IO 4.7.4 - Real-time bidirectional event-driven communication
- Socket.IO Client 4.8.3 - Frontend Socket.IO consumer

**Testing:**
- Vitest 4.1.6 - Unit test runner (backend + frontend)
- Playwright 1.60.0 - E2E testing framework with Chromium
- @testing-library/react 16.3.2 - React component testing utilities
- @testing-library/user-event 14.6.1 - User interaction simulation
- JSDOM 29.1.1 - DOM environment for browser testing

**Build/Dev:**
- TypeScript 6.0.3 - Type checking
- ESLint 9.0.0 - Linting (with typescript-eslint 8.59.3)
- Prettier 3.0.0 - Code formatting
- nodemon 3.1.0 - Development server auto-reload
- tsx 4.22.0 (backend), 4.7.0 (frontend) - TypeScript execution for scripts
- @vitejs/plugin-react 4.3.1 - React Fast Refresh for Vite
- husky 9.1.7 - Git hooks
- lint-staged 16.4.0 - Run linters on staged files

## Key Dependencies

**Critical:**
- pg 8.11.3 - PostgreSQL client for Node.js (`src/backend/src/db/pool.ts`)
- connect-pg-simple 10.0.0 - PostgreSQL session store for Express
- express-session 1.19.0 - Session middleware
- passport 0.7.0 - Authentication framework
- passport-google-oauth20 2.0.0 - Google OAuth 2.0 strategy
- passport-discord 0.1.4 - Discord OAuth strategy
- @anthropic-ai/sdk 0.96.0 - Anthropic Claude API client (`src/backend/src/services/llmProvider.ts`)
- zod 4.4.3 - Runtime schema validation

**Infrastructure & Security:**
- helmet 8.1.0 - Security headers middleware
- cors 2.8.5 - CORS middleware
- express-rate-limit 8.5.2 - Rate limiting for auth endpoints
- dotenv 16.4.5 - Environment variable management
- json-rules-engine 7.3.1 - Dialogue gating + campaign rule evaluation (`src/backend/src/services/dialogueGating.ts`)

**UI Components & Icons:**
- @phosphor-icons/react 2.1.10 - Phosphor icon library
- rpg-awesome 0.2.0 - RPG-themed icon font

## Configuration

**Environment:**
- Loaded via `dotenv` from `.env` file (development) or EC2 host `/opt/pansori/.env` (production)
- Key configs: `DATABASE_URL`, `NODE_ENV`, `PORT`, `FRONTEND_URL`, `SESSION_SECRET`, `ANTHROPIC_API_KEY`

**Build:**
- Backend: `tsconfig.json` + `tsconfig.build.json` for production compilation
- Frontend: `tsconfig.json` + `tsconfig.node.json` for Vite build config
- Vite optimizes dependencies for React + Three.js (dedupes react, react-dom, three)
- Backend TypeScript emits ES modules (`"type": "module"` in package.json)

**Code Style:**
- ESLint with flat config (eslint.config.* style)
- Prettier for auto-formatting
- Pre-commit linting via husky + lint-staged

## Platform Requirements

**Development:**
- Node.js 20+
- Docker Desktop (for Docker Compose local dev stack)
- Playwright Chromium (installed via `npm run test:e2e:install`)

**Production:**
- Docker (Linux ARM64 architecture — `--platform=linux/arm64`)
- PostgreSQL 16 (alpine image in compose)
- AWS EC2 instance with:
  - AmazonSSMManagedInstanceCore for SSM Session Manager deployment
  - ECR read permissions for pulling built container images
  - Docker + Docker Compose installed

## Deployment

**Architecture:**
- Multi-container Docker Compose (development: `docker-compose.yml`, production: `docker-compose.prod.yml`, e2e: `docker-compose.e2e.yml`)
- Backend: Node.js process in Docker, exposes port 3001
- Frontend: Nginx SPA server in Docker, exposes port 80 (serves `/usr/share/nginx/html` with React Router fallback via `nginx-spa.conf`)
- Database: PostgreSQL 16 alpine, persistent volume `postgres-data`
- Development tools: pgAdmin on port 5050 (optional `tools` profile)

**Image Registry:**
- AWS ECR (674162619498.dkr.ecr.us-east-1.amazonaws.com)

**CI/CD:**
- GitHub Actions (`.github/workflows/deploy.yml`)
- Builds & pushes Docker images to ECR on `main` branch push
- Deploys to EC2 via AWS SSM Session Manager (no SSH)
- Node 20 for CI matrix, Ubuntu latest runner

---

*Stack analysis: 2026-06-20*
