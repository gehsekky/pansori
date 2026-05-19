import { expect, test } from '@playwright/test';

// Vale of Shadows smoke test — covers backend + frontend + DB integration
// from auth through mission start. Validates the path that unit tests can't:
// real HTTP, real session cookies, real DB writes, real UI rendering.
//
// Prerequisites:
//   - docker-compose dev stack running (npm run dev)
//   - backend started with E2E_TEST_LOGIN_ENABLED=true
//
// What this covers (the user-visible "happy path"):
//   1. Test-login bypass produces a usable session.
//   2. Sessions screen loads (empty state for fresh test user).
//   3. + NEW MISSION navigates to character creation.
//   4. World picker selects Vale of Shadows.
//   5. Auto-fill recommended party populates the form.
//   6. BEGIN MISSION POSTs and transitions to the game view.
//   7. The game narrative panel renders text from Vale's intro/arrival.
//
// What this does NOT cover (intentional — defer until smoke proves stable):
//   - Combat resolution end-to-end
//   - Reactive spell windows
//   - Session resume across reloads
//   - Faction price modifiers in shops
//   - Quest completion / escape

const BACKEND_URL = process.env.E2E_BACKEND_URL ?? 'http://localhost:3001';
// Unique email per test run avoids cross-run state contamination of sessions.
// Use a stable seed if you want to inspect prod-like state in the DB after.
const TEST_EMAIL = `e2e-${Date.now()}@pansori.local`;

test('Vale of Shadows: login → character creation → begin mission', async ({ page, request }) => {
  // 1. Auth bypass: POST /api/auth/test-login sets the session cookie on the
  //    request context. We then attach it to the browser context so the
  //    frontend's /api/auth/me call returns the test user.
  const loginRes = await request.post(`${BACKEND_URL}/api/auth/test-login`, {
    data: { email: TEST_EMAIL, displayName: 'E2E Test User' },
  });
  expect(loginRes.ok(), `test-login failed: ${loginRes.status()} ${await loginRes.text()}`).toBe(
    true
  );

  // Carry the session cookie into the browser context.
  const cookies = await request.storageState();
  await page.context().addCookies(cookies.cookies);

  // 2. Sessions screen — fresh test user has no missions.
  await page.goto('/');
  await expect(page.getByText(/NO MISSIONS ON RECORD/i)).toBeVisible({ timeout: 10_000 });

  // 3. Click + NEW MISSION.
  await page.getByTestId('new-mission-btn').click();

  // 4. Character screen — pick Vale of Shadows.
  await page.getByTestId('world-picker-vale_of_shadows').click();

  // 5. Auto-fill recommended party.
  await page.getByTestId('auto-fill-party-btn').click();

  // 6. Begin mission. The button is disabled while subclass picks are required
  //    on the auto-filled party; auto-fill defaults to the first L1 subclass
  //    option, so it should be enabled immediately.
  const begin = page.getByTestId('begin-mission-btn');
  await expect(begin).toBeEnabled();
  await begin.click();

  // 7. Game view should render with the narrative panel populated.
  const narrative = page.getByTestId('game-narrative-panel');
  await expect(narrative).toBeVisible({ timeout: 15_000 });
  // The Vale intro mentions the world. Soft assertion so any future flavour
  // text change doesn't break the smoke test — the structure check above is
  // the load-bearing assertion.
  await expect(narrative).not.toBeEmpty();
});
