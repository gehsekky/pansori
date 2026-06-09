import { Page, expect, test } from '@playwright/test';

// End-to-end smoke — covers backend + frontend + DB integration from auth
// through adventure start and combat. Validates the path unit tests can't:
// real HTTP, real session cookies, real DB writes, real UI rendering.
//
// The campaign under test is NOT a built-in: the suite seeds a throwaway one
// (`e2e-proving-grounds`, see src/backend/src/services/e2eCampaign.ts) at the
// start of each test via the gated POST /api/test/seed-campaign endpoint. In
// the ephemeral e2e stack the database is discarded after the run, so nothing
// persists — and the project ships no campaign of its own.
//
// Prerequisites:
//   - the e2e stack running (npm run test:e2e:stack brings it up + tears down)
//   - backend started with E2E_TEST_LOGIN_ENABLED=true (gates BOTH test-login
//     and seed-campaign; the e2e compose sets it)
//
// What this covers (the user-visible "happy path"):
//   1. Test-login bypass produces a usable session.
//   2. The throwaway campaign is seeded and resolves live.
//   3. Sessions screen loads (empty state for fresh test user).
//   4. + NEW ADVENTURE navigates to character creation.
//   5. The (sole) campaign is auto-selected; auto-fill populates the party.
//   6. BEGIN ADVENTURE POSTs and transitions to the game view.
//   7. The game narrative panel renders the campaign's intro/arrival text.

const BACKEND_URL = process.env.E2E_BACKEND_URL ?? 'http://localhost:3001';
// Unique email per test run avoids cross-run state contamination of sessions.
const TEST_EMAIL = `e2e-${Date.now()}@pansori.local`;

// Plant (or refresh) the throwaway campaign. Idempotent (replace-all), gated to
// non-production + E2E_TEST_LOGIN_ENABLED. No auth required.
async function seedCampaign(request: import('@playwright/test').APIRequestContext): Promise<void> {
  const res = await request.post(`${BACKEND_URL}/api/test/seed-campaign`);
  expect(res.ok(), `seed-campaign failed: ${res.status()} ${await res.text()}`).toBe(true);
}

test('login → character creation → begin adventure', async ({ page, request }) => {
  // 1. Auth bypass: POST /api/auth/test-login sets the session cookie on the
  //    request context. We then attach it to the browser context so the
  //    frontend's /api/auth/me call returns the test user.
  const loginRes = await request.post(`${BACKEND_URL}/api/auth/test-login`, {
    data: { email: TEST_EMAIL, displayName: 'E2E Test User' },
  });
  expect(loginRes.ok(), `test-login failed: ${loginRes.status()} ${await loginRes.text()}`).toBe(
    true
  );

  // 2. Seed the throwaway campaign so it resolves live before we play it.
  await seedCampaign(request);

  // Carry the session cookie into the browser context.
  const cookies = await request.storageState();
  await page.context().addCookies(cookies.cookies);

  // 3. Sessions screen — fresh test user has no adventures.
  await page.goto('/');
  await expect(page.getByText(/NO ADVENTURES ON RECORD/i)).toBeVisible({ timeout: 10_000 });

  // 4. Click + NEW ADVENTURE.
  await page.getByTestId('new-adventure-btn').click();

  // 5. Character screen — the seeded campaign is the sole player-facing one, so
  // the world picker is hidden and it is auto-selected. Auto-fill the party.
  await page.getByTestId('auto-fill-party-btn').click();

  // 6. Begin adventure. The button is disabled while subclass picks are required
  //    on the auto-filled party; auto-fill defaults to the first L1 subclass
  //    option, so it should be enabled immediately.
  const begin = page.getByTestId('begin-adventure-btn');
  await expect(begin).toBeEnabled();
  await begin.click();

  // 7. Game view should render with the narrative panel populated.
  const narrative = page.getByTestId('game-narrative-panel');
  await expect(narrative).toBeVisible({ timeout: 15_000 });
  // Soft assertion so any future flavour text change doesn't break the smoke —
  // the structure check above is the load-bearing assertion.
  await expect(narrative).not.toBeEmpty();

  // 8. Party composition — auto-fill seeded a 4-PC Fighter/Cleric/Rogue/Wizard
  //    party (the campaign's recommendedComposition). Verify the engine round-
  //    tripped all four through to the rail.
  const partyTiles = page.getByTestId('party-tile');
  await expect(partyTiles).toHaveCount(4);
  const partyText = (await partyTiles.allTextContents()).join(' ');
  // Open-bracket prefix (not '[Cleric]') so the assertion works both
  // before and after a subclass is appended — Cleric picks Life Domain
  // at L1 so its tile reads '[Cleric / Life]', not '[Cleric]'. The others
  // pick their subclass at L3, so they're still '[Fighter]' / '[Rogue]' /
  // '[Wizard]' at this point, but the looser match covers both forms.
  expect(partyText).toContain('[Fighter');
  expect(partyText).toContain('[Cleric');
  expect(partyText).toContain('[Rogue');
  expect(partyText).toContain('[Wizard');

  // 9. Initiative is not active out of combat — the strip only renders during
  //    combat, and the campaign starts on the regional grid with no enemies.
  await expect(page.getByTestId('initiative-strip')).toHaveCount(0);

  // 10. Exactly one tile is marked active (aria-current="true"). Out-of-
  //     combat the engine seeds the active char from state, but only one
  //     PC ever holds the turn.
  const activeTiles = page.locator('[data-testid="party-tile"][aria-current="true"]');
  await expect(activeTiles).toHaveCount(1);
  const firstActiveText = (await activeTiles.first().textContent()) ?? '';

  // 11. Out-of-combat round-robin: any action advances the active PC to
  //     the next living party member. Pick the first available choice
  //     (typically `examine`) and confirm the active marker moved.
  const firstChoice = page.getByTestId('choice-btn').first();
  await expect(firstChoice).toBeVisible();
  await firstChoice.click();
  // Wait for the engine response + state-driven re-render before reading.
  await page.waitForTimeout(400);
  const newActiveText = (await activeTiles.first().textContent()) ?? '';
  expect(newActiveText).not.toBe(firstActiveText);
});

// ── Combat coverage ─────────────────────────────────────────────────────────
//
// Drives the throwaway campaign and clicks choices in priority order until a
// kill narrative appears. This exercises:
//   - Choice list rendering after each action.
//   - Server-side initiative & turn advancement.
//   - The grid_move + attack action handlers.
//   - The post-action narrative pipeline.

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

    // Attack is in the CombatActionBar (icon row) — check there first since
    // it's the highest-priority pick. Enabled state means the engine surfaced
    // an attack against the currently-selected enemy.
    const combatAttack = page.getByTestId('combat-attack');
    if ((await combatAttack.count()) > 0 && (await combatAttack.isEnabled())) {
      result.sawAttackChoice = true;
      await combatAttack.click();
      continue;
    }

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
    const gridMoveIdx = idxByType('grid_move');

    let pick = -1;
    if (gridMoveIdx >= 0) pick = gridMoveIdx;
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
  await seedCampaign(request);
  const cookies = await request.storageState();
  await page.context().addCookies(cookies.cookies);

  // Start a fresh adventure in the seeded campaign.
  await page.goto('/');
  await expect(page.getByText(/NO ADVENTURES ON RECORD/i)).toBeVisible({ timeout: 10_000 });
  await page.getByTestId('new-adventure-btn').click();
  await page.getByTestId('auto-fill-party-btn').click();
  await page.getByTestId('begin-adventure-btn').click();

  const narrative = page.getByTestId('game-narrative-panel');
  await expect(narrative).toBeVisible({ timeout: 15_000 });
  const initialText = (await narrative.textContent()) ?? '';
  expect(initialText.length).toBeGreaterThan(0);

  // After session creation, the URL changes to /game/<sessionId>. We rely on
  // this for the reload-resume path; capture it here.
  await page.waitForFunction(
    () => /^\/game\/[0-9a-f-]{36}$/i.test(window.location.pathname),
    null,
    {
      timeout: 5_000,
    }
  );
  const sessionUrl = page.url();
  const sessionId = new URL(sessionUrl).pathname.replace(/^\/game\//, '');
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

// SKIPPED 2026-05-22: this combat-loop E2E has been ~50% flaky across many
// commits with a consistent "click intercepted by parent layout" error from
// Playwright. The deterministic checks (BE typecheck/lint/prettier + unit
// tests, FE typecheck/lint + unit tests) cover the combat path extensively.
// Re-enable after debugging the underlying layout race — likely the
// combat-attack button overlapping the grid card on certain layouts.
test.skip('combat: enter a fight and resolve an attack', async ({ page, request }) => {
  // Re-login as a fresh test user so this test is independent of the smoke.
  const email = `e2e-combat-${Date.now()}@pansori.local`;
  const loginRes = await request.post(`${BACKEND_URL}/api/auth/test-login`, {
    data: { email, displayName: 'E2E Combat User' },
  });
  expect(loginRes.ok()).toBe(true);
  await seedCampaign(request);
  const cookies = await request.storageState();
  await page.context().addCookies(cookies.cookies);

  await page.goto('/');
  await expect(page.getByText(/NO ADVENTURES ON RECORD/i)).toBeVisible({ timeout: 10_000 });
  await page.getByTestId('new-adventure-btn').click();
  await page.getByTestId('auto-fill-party-btn').click();
  await expect(page.getByTestId('begin-adventure-btn')).toBeEnabled();
  await page.getByTestId('begin-adventure-btn').click();

  // Wait for the game view to render.
  const narrative = page.getByTestId('game-narrative-panel');
  await expect(narrative).toBeVisible({ timeout: 15_000 });

  // Travel to the practice ring (where the goblins wait) before driving combat.
  await clickTravelTo(page, 'The Practice Ring');

  // Drive the loop until a kill or the iteration cap.
  const result = await driveCombatLoop(page, 80);

  // Hard assertion: the loop must have surfaced at least one Attack action.
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

// ── Multi-PC initiative + class-button separation ───────────────────────────
//
// Verifies the engine's class-aware choice generation under multi-PC play:
//
//   - Combat starts when a PC attacks an in-room enemy.
//   - InitiativeStrip becomes visible with all 6 entries (4 PCs + 2 enemies).
//   - For each PC's turn observed, the choice list contains `cast_spell`
//     options if and only if the active PC is a spellcaster (Cleric / Wizard).
//     Fighter and Rogue at level 1 have no spells known and must not see
//     cast_spell buttons; the Cleric/Wizard do.
//
// Navigation: the party starts on the regional grid; "The Practice Ring" is a
// 'local' site one step east, whose entry room holds two Goblin Warriors — the
// first hostiles the party meets. The engine blocks travelling on while a
// hostile is alive in the room, so the only forward step is Attack — which
// trips combat initialization.

const CLASS_NAMES = ['Fighter', 'Cleric', 'Rogue', 'Wizard'] as const;
type PartyClass = (typeof CLASS_NAMES)[number];
// Spellcasters in the recommended party — they may surface cast_spell; the
// martials (Fighter/Rogue) never do.
const SPELLCASTERS = new Set<PartyClass>(['Cleric', 'Wizard']);
// The SRD-catalog monster the practice ring is stocked with (×2).
const ENEMY_NAME = 'Goblin Warrior';

async function activeClass(page: Page): Promise<PartyClass | null> {
  const active = page.locator('[data-testid="party-tile"][aria-current="true"]');
  if ((await active.count()) === 0) return null;
  const txt = (await active.first().textContent()) ?? '';
  return CLASS_NAMES.find((c) => txt.includes(`[${c}]`)) ?? null;
}

// Strip the ▶ glyph and the trailing "(roll)" from an initiative entry's
// text content so the bare creature name is left ("Fighter", "Goblin
// Warrior"). The ▶ is aria-hidden but still part of textContent.
function cleanInitiativeEntry(txt: string): string {
  return txt
    .replace(/^▶\s*/, '')
    .replace(/\s*\(\d+\)\s*$/, '')
    .trim();
}

async function activeInitiativeName(page: Page): Promise<string | null> {
  const active = page.locator('[data-testid="initiative-strip"] li[aria-current="true"]');
  if ((await active.count()) === 0) return null;
  const txt = (await active.first().textContent()) ?? '';
  return cleanInitiativeEntry(txt) || null;
}

async function choiceActionTypes(page: Page): Promise<string[]> {
  const btns = page.getByTestId('choice-btn');
  const n = await btns.count();
  const types: string[] = [];
  for (let i = 0; i < n; i++) {
    const t = await btns.nth(i).getAttribute('data-action-type');
    if (t) types.push(t);
  }
  return types;
}

async function clickTravelTo(page: Page, siteName: string): Promise<void> {
  // Travel is map-driven: GridMapView renders each transition cell as a
  // clickable, labelled square whose aria-label carries the destination name
  // (e.g. "1,1, The Practice Ring"). Click that cell to dispatch the
  // marker_move. The site sits one cell east of the party's start (row y=1)
  // and is revealed from the outset, so this resolves in a step or two.
  // Random encounters are disabled under the e2e test-login backend, so the
  // journey is deterministic.
  for (let step = 0; step < 8; step++) {
    const site = page.locator(`[aria-label*="${siteName}"]`).first();
    if (await site.isVisible().catch(() => false)) {
      await site.click();
      await page.waitForTimeout(300);
      return;
    }
    // Among the revealed, travelable map cells on the start row (y=1), pick the
    // easternmost and step onto it to advance toward the site.
    const labels = (await page
      .locator('[role="button"][aria-label]')
      .evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? ''))) as string[];
    let bestX = -1;
    for (const label of labels) {
      const m = label.match(/^(\d+),1(?:,|$)/);
      if (m && Number(m[1]) > bestX) bestX = Number(m[1]);
    }
    if (bestX < 0) break;
    await page.locator(`[aria-label^="${bestX},1"]`).first().click();
    await page.waitForTimeout(250);
  }
  const cellEl = page.locator(`[aria-label*="${siteName}"]`).first();
  await expect(cellEl).toBeVisible({ timeout: 5_000 });
  await cellEl.click();
  await page.waitForTimeout(300);
}

test('combat: initiative live + class-specific choices respect class', async ({
  page,
  request,
}) => {
  // 1. Fresh test user + auto-fill (Fighter/Cleric/Rogue/Wizard).
  const email = `e2e-combat-class-${Date.now()}@pansori.local`;
  const loginRes = await request.post(`${BACKEND_URL}/api/auth/test-login`, {
    data: { email, displayName: 'E2E Combat Class User' },
  });
  expect(loginRes.ok()).toBe(true);
  await seedCampaign(request);
  const cookies = await request.storageState();
  await page.context().addCookies(cookies.cookies);
  await page.goto('/');
  await expect(page.getByText(/NO ADVENTURES ON RECORD/i)).toBeVisible({ timeout: 10_000 });
  await page.getByTestId('new-adventure-btn').click();
  // Sole campaign auto-selected (world picker hidden).
  await page.getByTestId('auto-fill-party-btn').click();
  await expect(page.getByTestId('begin-adventure-btn')).toBeEnabled();
  await page.getByTestId('begin-adventure-btn').click();
  await expect(page.getByTestId('game-narrative-panel')).toBeVisible({ timeout: 15_000 });

  // 2. From the regional grid, enter the practice ring — the party lands in a
  //    Goblin-Warrior-occupied room; the engine blocks travelling on while an
  //    enemy is alive, so Attack is the only forward path.
  await clickTravelTo(page, 'The Practice Ring');

  // 3. Trigger combat by attacking the first available enemy. The Attack verb
  //    is iconized in the CombatActionBar — one button per combat verb, with
  //    the target controlled by the EnemySelector.
  const attackBtn = page.getByTestId('combat-attack');
  await expect(attackBtn).toBeVisible({ timeout: 5_000 });
  await expect(attackBtn).toBeEnabled();
  await attackBtn.click();
  await page.waitForTimeout(400);

  // 4. The first attack ignites combat. InitiativeStrip appears with one entry
  //    per PC (4) plus the goblins (2) = 6 total. Verify the full roster: each
  //    PC class shows up exactly once and every enemy in the room is
  //    represented.
  const initStrip = page.getByTestId('initiative-strip');
  await expect(initStrip).toBeVisible({ timeout: 5_000 });
  const initialEntries = (await initStrip.locator('li').allTextContents()).map(
    cleanInitiativeEntry
  );
  for (const cls of CLASS_NAMES) {
    expect(
      initialEntries.filter((t) => t === cls),
      `expected exactly one initiative entry named ${cls}, got ${JSON.stringify(initialEntries)}`
    ).toHaveLength(1);
  }
  // The practice ring hosts 2 Goblin Warriors; both should be in the order.
  expect(
    initialEntries.filter((t) => t === ENEMY_NAME),
    `expected 2 ${ENEMY_NAME} entries, got ${JSON.stringify(initialEntries)}`
  ).toHaveLength(2);
  expect(initialEntries).toHaveLength(6);

  // 5. Per-PC class invariant: cast_spell appears iff the active class is a
  //    spellcaster (Cleric / Wizard). Iterate observed PC turns; tolerate
  //    combat ending early.
  const observed: PartyClass[] = [];
  for (let turn = 0; turn < 8; turn++) {
    // Combat may have ended. If so, exit the loop.
    if ((await initStrip.count()) === 0) break;

    // Strip ↔ PartyRail sync: the ▶-marked initiative entry and the PartyRail's
    // active tile must name the same character. Both derive from the same
    // active character but can re-render a beat apart during a turn transition,
    // so poll until they agree. Auto-fill sets `char.name === char.character_class`,
    // so the strip entry name and the PartyRail class label coincide.
    let cls: PartyClass | null = null;
    try {
      await expect
        .poll(
          async () => {
            cls = await activeClass(page);
            const strip = await activeInitiativeName(page);
            return cls !== null && strip === cls;
          },
          { timeout: 3_000, message: `turn=${turn}: strip ▶ never matched PartyRail active` }
        )
        .toBe(true);
    } catch {
      // No consistent active PC settled (mid-transition / combat ending). Pause
      // briefly and retry the loop rather than failing on a transient state.
      await page.waitForTimeout(200);
      continue;
    }
    if (!cls) continue;

    const types = await choiceActionTypes(page);
    // In combat, single-target spells are surfaced as icon buttons in the
    // SpellBar (data-testid="spell-bar"), not in the generic choice-btn list —
    // so cast_spell presence must be read from BOTH surfaces. The SpellBar
    // renders only when the active PC has at least one cast_spell choice.
    const spellBarCount = await page.getByTestId('spell-bar').count();
    const hasCast = types.includes('cast_spell') || spellBarCount > 0;
    // Cast_spell is gated on action availability: a Cleric who already
    // consumed their action this turn won't see spell options until their
    // next turn. The engine signals "action already used" by surfacing an
    // `end_turn` choice. Skip the cast-presence assertion in that case; the
    // inverse assertion (Fighter/Rogue NEVER see cast_spell) still holds.
    const actionAlreadyUsed = types.includes('end_turn');
    if (!SPELLCASTERS.has(cls)) {
      expect(
        hasCast,
        `class=${cls} turn=${turn}: cast_spell present=${hasCast}, ` +
          `but only spellcasters (Cleric/Wizard) should see cast_spell. action types=${types.join(',')}, spellBar=${spellBarCount}`
      ).toBe(false);
    } else if (!actionAlreadyUsed) {
      expect(
        hasCast,
        `class=${cls} turn=${turn}: action is fresh but no cast_spell offered. ` +
          `action types=${types.join(',')}, spellBar=${spellBarCount}`
      ).toBe(true);
    }
    observed.push(cls);

    // Take a turn-ending action that doesn't damage the enemy (so combat
    // stays alive long enough to observe more PCs). Prefer Dodge (icon
    // bar), fall back to Disengage, then end_turn, then choice[0].
    const dodgeBtn = page.getByTestId('action-dodge');
    const disengageBtn = page.getByTestId('action-disengage');
    if ((await dodgeBtn.count()) > 0 && (await dodgeBtn.isEnabled())) {
      await dodgeBtn.click();
    } else if ((await disengageBtn.count()) > 0 && (await disengageBtn.isEnabled())) {
      await disengageBtn.click();
    } else {
      const endTurn = page
        .getByTestId('choice-btn')
        .and(page.locator('[data-action-type="end_turn"]'));
      if ((await endTurn.count()) > 0) {
        await endTurn.first().click();
      } else {
        await page.getByTestId('choice-btn').first().click();
      }
    }
    await page.waitForTimeout(400);
  }

  // 6. Sanity floor: we should have observed at least one PC's turn.
  expect(observed.length, 'expected at least one PC turn observed in combat').toBeGreaterThan(0);
});
