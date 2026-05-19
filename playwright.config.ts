import { defineConfig, devices } from '@playwright/test';

// Pansori E2E suite. Assumes the dev docker-compose stack is running locally
// (`npm run dev` from repo root). The backend must be started with
// E2E_TEST_LOGIN_ENABLED=true so the /api/auth/test-login bypass is exposed
// (gated to non-production environments in src/backend/src/routes/auth.ts).
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  fullyParallel: false, // sessions are shared per test-user; keep serial for v1
  // Combat test traverses procgen rooms and is mildly flaky on layout luck.
  // Smoke test is deterministic. 2 retries covers the variance without
  // hiding real regressions (3 consecutive failures still fails the run).
  retries: 2,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    trace: 'on-first-retry',
    headless: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
