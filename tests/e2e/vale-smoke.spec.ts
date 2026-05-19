import { Page, expect, test } from '@playwright/test';

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

// ── Combat coverage ─────────────────────────────────────────────────────────
//
// Drives the sandbox campaign (smaller than Vale, combat closer to start)
// and clicks choices in priority order until a kill narrative appears. This
// exercises:
//   - Choice list rendering after each action.
//   - Server-side initiative & turn advancement.
//   - The grid_move + attack action handlers.
//   - The post-action narrative pipeline.
//
// The exact path through sandbox is non-deterministic (procgen room layout,
// d20 rolls). The test tolerates that by clicking the first viable choice
// each tick and bounding the total iterations.

interface CombatLoopResult {
  killed: boolean; // ever saw kill narrative
  sawAttackChoice: boolean; // ever had an `attack` action button available
  sawCombatNarrative: boolean; // ever saw combat-related text in the narrative
  iterations: number;
}

/**
 * Click choices in priority: attack > grid_move > move > choice[0].
 * Tracks whether combat surfaced at all — narrative alone is unreliable
 * because the panel shows only the current room, not history.
 */
async function driveCombatLoop(page: Page, maxIterations = 80): Promise<CombatLoopResult> {
  const narrative = page.getByTestId('game-narrative-panel');
  const result: CombatLoopResult = {
    killed: false,
    sawAttackChoice: false,
    sawCombatNarrative: false,
    iterations: 0,
  };
  // Track recently-clicked Move labels so we don't bounce between two rooms.
  // Sandbox connections often link both directions, so picking choice[0]
  // every time can ping-pong forever.
  const recentMoveLabels: string[] = [];
  for (let i = 0; i < maxIterations; i++) {
    result.iterations = i + 1;
    const text = (await narrative.textContent()) ?? '';
    if (/Initiative|combat begins|takes \d+ damage/i.test(text)) {
      result.sawCombatNarrative = true;
    }
    if (/killed|falls!|drops dead|XP\)/i.test(text)) {
      result.killed = true;
      return result;
    }
    if (/you escape|escape the/i.test(text)) return result;

    await page.waitForTimeout(150);
    const buttons = page.getByTestId('choice-btn');
    const count = await buttons.count();
    if (count === 0) {
      await page.waitForTimeout(300);
      continue;
    }

    const types = await Promise.all(
      Array.from({ length: count }, (_, j) => buttons.nth(j).getAttribute('data-action-type'))
    );
    const labels = await Promise.all(
      Array.from({ length: count }, (_, j) => buttons.nth(j).textContent())
    );
    const idxByType = (t: string) => types.findIndex((x) => x === t);
    const attackIdx = idxByType('attack');
    const gridMoveIdx = idxByType('grid_move');

    if (attackIdx >= 0) result.sawAttackChoice = true;

    let pick = -1;
    if (attackIdx >= 0) pick = attackIdx;
    else if (gridMoveIdx >= 0) pick = gridMoveIdx;
    else {
      // Among Move actions, prefer one we haven't clicked recently.
      const moveCandidates = types.map((t, j) => (t === 'move' ? j : -1)).filter((j) => j >= 0);
      const fresh = moveCandidates.find(
        (j) => !recentMoveLabels.slice(-2).includes(labels[j] ?? '')
      );
      pick = fresh ?? moveCandidates[0] ?? 0;
      if (types[pick] === 'move') {
        recentMoveLabels.push(labels[pick] ?? '');
        if (recentMoveLabels.length > 4) recentMoveLabels.shift();
      }
    }

    await buttons.nth(pick).click();
  }
  return result;
}

test('session resume: state survives a page reload', async ({ page, request }) => {
  // Validates the cross-request persistence path that the in-process backend
  // tests can't reach: state is serialized to Postgres, the cookie session is
  // restored on the new page load, and the resume API rehydrates the same
  // game state.
  const email = `e2e-resume-${Date.now()}@pansori.local`;
  const loginRes = await request.post(`${BACKEND_URL}/api/auth/test-login`, {
    data: { email, displayName: 'E2E Resume User' },
  });
  expect(loginRes.ok()).toBe(true);
  const cookies = await request.storageState();
  await page.context().addCookies(cookies.cookies);

  // Start a fresh sandbox mission.
  await page.goto('/');
  await expect(page.getByText(/NO MISSIONS ON RECORD/i)).toBeVisible({ timeout: 10_000 });
  await page.getByTestId('new-mission-btn').click();
  await page.getByTestId('world-picker-sandbox').click();
  await page.getByTestId('auto-fill-party-btn').click();
  await page.getByTestId('begin-mission-btn').click();

  const narrative = page.getByTestId('game-narrative-panel');
  await expect(narrative).toBeVisible({ timeout: 15_000 });
  const initialText = (await narrative.textContent()) ?? '';
  expect(initialText.length).toBeGreaterThan(0);

  // After session creation, the URL changes to /<sessionId>. We rely on this
  // for the reload-resume path; capture it here.
  await page.waitForFunction(() => /^\/[0-9a-f-]{36}$/i.test(window.location.pathname), null, {
    timeout: 5_000,
  });
  const sessionUrl = page.url();
  const sessionId = new URL(sessionUrl).pathname.slice(1);
  expect(sessionId).toMatch(/^[0-9a-f-]{36}$/i);

  // Take an action so the state differs from initial — pick any choice,
  // preferring a Move/grid_move so the room or position changes.
  await page.waitForTimeout(200);
  const buttons = page.getByTestId('choice-btn');
  const count = await buttons.count();
  expect(count).toBeGreaterThan(0);
  const types = await Promise.all(
    Array.from({ length: count }, (_, j) => buttons.nth(j).getAttribute('data-action-type'))
  );
  const moveIdx = types.findIndex((t) => t === 'move' || t === 'grid_move');
  await buttons.nth(moveIdx >= 0 ? moveIdx : 0).click();

  // Grab the post-action narrative — this is what should survive the reload.
  await page.waitForTimeout(500);
  const afterActionText = (await narrative.textContent()) ?? '';
  expect(afterActionText.length).toBeGreaterThan(0);

  // Reload the page. The session cookie persists; the URL stays at /<sessionId>.
  await page.reload();

  // After reload the game view should rehydrate — narrative panel visible
  // and populated with the same room state we left in.
  await expect(narrative).toBeVisible({ timeout: 15_000 });
  const resumedText = (await narrative.textContent()) ?? '';
  expect(resumedText.length).toBeGreaterThan(0);

  // The narrative panel renders the current room. After reload it should
  // show the room we navigated to, not the initial start room. We don't
  // assert exact equality of `afterActionText === resumedText` because the
  // narrative panel only holds the *current* room's text, which doesn't
  // include the action verb. But: it should not show the literal "Scanning
  // sector..." loading text, and the URL must still be the session URL.
  expect(resumedText).not.toMatch(/^Scanning sector/);
  expect(page.url()).toBe(sessionUrl);
});

test('sandbox combat: enter a fight and resolve an attack', async ({ page, request }) => {
  // Re-login as a fresh test user so this test is independent of the smoke.
  const email = `e2e-combat-${Date.now()}@pansori.local`;
  const loginRes = await request.post(`${BACKEND_URL}/api/auth/test-login`, {
    data: { email, displayName: 'E2E Combat User' },
  });
  expect(loginRes.ok()).toBe(true);
  const cookies = await request.storageState();
  await page.context().addCookies(cookies.cookies);

  await page.goto('/');
  await expect(page.getByText(/NO MISSIONS ON RECORD/i)).toBeVisible({ timeout: 10_000 });
  await page.getByTestId('new-mission-btn').click();
  await page.getByTestId('world-picker-sandbox').click();
  await page.getByTestId('auto-fill-party-btn').click();
  await expect(page.getByTestId('begin-mission-btn')).toBeEnabled();
  await page.getByTestId('begin-mission-btn').click();

  // Wait for the game view to render.
  const narrative = page.getByTestId('game-narrative-panel');
  await expect(narrative).toBeVisible({ timeout: 15_000 });

  // Drive the loop until a kill or the iteration cap. Bound generous enough
  // to absorb procgen variance + d20 misses; the existing scripted Vale
  // playthrough uses 300 — 80 is a middle ground for an E2E run.
  const result = await driveCombatLoop(page, 80);

  // Hard assertion: the loop must have surfaced at least one Attack action.
  // That proves initiative ran, the party closed with an enemy, and the
  // choice list reflected combat state. Narrative alone is unreliable
  // because the panel shows only the current room — past combat scrolls
  // away when the party moves on.
  expect(
    result.sawAttackChoice,
    `expected Attack action to surface during ${result.iterations} iterations; ` +
      `sawCombatNarrative=${result.sawCombatNarrative}, killed=${result.killed}`
  ).toBe(true);

  // Kill is the happier signal; warn (not fail) if we didn't see one so
  // future runs surface flakiness early.
  if (!result.killed) {
    console.warn(
      `combat test: attack surfaced but no kill in ${result.iterations} iterations ` +
        `(sawCombatNarrative=${result.sawCombatNarrative})`
    );
  }
});
