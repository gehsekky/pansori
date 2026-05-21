import { Page, expect, test } from '@playwright/test';

// Vale of Shadows smoke test — covers backend + frontend + DB integration
// from auth through adventure start. Validates the path that unit tests can't:
// real HTTP, real session cookies, real DB writes, real UI rendering.
//
// Prerequisites:
//   - docker-compose dev stack running (npm run dev)
//   - backend started with E2E_TEST_LOGIN_ENABLED=true
//
// What this covers (the user-visible "happy path"):
//   1. Test-login bypass produces a usable session.
//   2. Sessions screen loads (empty state for fresh test user).
//   3. + NEW ADVENTURE navigates to character creation.
//   4. World picker selects Vale of Shadows.
//   5. Auto-fill recommended party populates the form.
//   6. BEGIN ADVENTURE POSTs and transitions to the game view.
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

test('Vale of Shadows: login → character creation → begin adventure', async ({ page, request }) => {
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

  // 2. Sessions screen — fresh test user has no adventures.
  await page.goto('/');
  await expect(page.getByText(/NO ADVENTURES ON RECORD/i)).toBeVisible({ timeout: 10_000 });

  // 3. Click + NEW ADVENTURE.
  await page.getByTestId('new-adventure-btn').click();

  // 4. Character screen — pick Vale of Shadows.
  await page.getByTestId('world-picker-vale_of_shadows').click();

  // 5. Auto-fill recommended party.
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
  // The Vale intro mentions the world. Soft assertion so any future flavour
  // text change doesn't break the smoke test — the structure check above is
  // the load-bearing assertion.
  await expect(narrative).not.toBeEmpty();

  // 8. Party composition — auto-fill seeded a 3-PC Fighter/Cleric/Rogue
  //    party (Vale's `recommendedComposition`). Verify the engine round-
  //    tripped all three through to the rail.
  const partyTiles = page.getByTestId('party-tile');
  await expect(partyTiles).toHaveCount(3);
  const partyText = (await partyTiles.allTextContents()).join(' ');
  expect(partyText).toContain('[Fighter]');
  expect(partyText).toContain('[Cleric]');
  expect(partyText).toContain('[Rogue]');

  // 9. Initiative is not active in town — the strip only renders during
  //    combat, and Vale starts in millhaven_square with no enemies.
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

    // Attack is now in the CombatActionBar (icon row) — check there
    // first since it's the highest-priority pick. Enabled state means
    // the engine surfaced an attack against the currently-selected
    // enemy.
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
  const cookies = await request.storageState();
  await page.context().addCookies(cookies.cookies);

  // Start a fresh sandbox adventure.
  await page.goto('/');
  await expect(page.getByText(/NO ADVENTURES ON RECORD/i)).toBeVisible({ timeout: 10_000 });
  await page.getByTestId('new-adventure-btn').click();
  await page.getByTestId('world-picker-sandbox').click();
  await page.getByTestId('auto-fill-party-btn').click();
  await page.getByTestId('begin-adventure-btn').click();

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
  await expect(page.getByText(/NO ADVENTURES ON RECORD/i)).toBeVisible({ timeout: 10_000 });
  await page.getByTestId('new-adventure-btn').click();
  await page.getByTestId('world-picker-sandbox').click();
  await page.getByTestId('auto-fill-party-btn').click();
  await expect(page.getByTestId('begin-adventure-btn')).toBeEnabled();
  await page.getByTestId('begin-adventure-btn').click();

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

// ── Multi-PC initiative + class-button separation ───────────────────────────
//
// Verifies the engine's class-aware choice generation under multi-PC play:
//
//   - Combat starts when a PC attacks an in-room enemy.
//   - InitiativeStrip becomes visible with at least 4 entries (3 PCs + 1+ enemies).
//   - For each PC's turn observed, the choice list contains `cast_spell`
//     options if and only if the active PC is the Cleric. Fighter and
//     Rogue at level 1 have no spells known and must not see cast_spell
//     buttons; the Cleric does (Sacred Flame cantrip is always available
//     when an enemy is in range).
//
// Navigation path: millhaven_square → The Old Road (a Bandit Ruffian
// patrols here, the first hostile the party encounters). The engine
// suppresses Move choices while an enemy is alive in the room, so the
// only forward step from road_north is Attack — which trips combat
// initialization.

const CLASS_NAMES = ['Fighter', 'Cleric', 'Rogue'] as const;
type PartyClass = (typeof CLASS_NAMES)[number];

async function activeClass(page: Page): Promise<PartyClass | null> {
  const active = page.locator('[data-testid="party-tile"][aria-current="true"]');
  if ((await active.count()) === 0) return null;
  const txt = (await active.first().textContent()) ?? '';
  return CLASS_NAMES.find((c) => txt.includes(`[${c}]`)) ?? null;
}

// Strip the ▶ glyph and the trailing "(roll)" from an initiative entry's
// text content so the bare creature name is left ("Fighter", "Bandit
// Ruffian"). The ▶ is aria-hidden but still part of textContent.
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

async function clickMoveTo(page: Page, roomName: string): Promise<void> {
  // Move-to-room buttons are labeled "Move to <Room Name>". Use a partial
  // text match to tolerate trailing whitespace / future label tweaks.
  const btn = page.getByTestId('choice-btn').filter({ hasText: `Move to ${roomName}` });
  await expect(btn).toBeVisible({ timeout: 5_000 });
  await btn.first().click();
  await page.waitForTimeout(300);
}

test('Vale combat: initiative live + class-specific choices respect class', async ({
  page,
  request,
}) => {
  // 1. Fresh test user + Vale auto-fill (Fighter/Cleric/Rogue).
  const email = `e2e-vale-combat-${Date.now()}@pansori.local`;
  const loginRes = await request.post(`${BACKEND_URL}/api/auth/test-login`, {
    data: { email, displayName: 'E2E Vale Combat User' },
  });
  expect(loginRes.ok()).toBe(true);
  const cookies = await request.storageState();
  await page.context().addCookies(cookies.cookies);
  await page.goto('/');
  await expect(page.getByText(/NO ADVENTURES ON RECORD/i)).toBeVisible({ timeout: 10_000 });
  await page.getByTestId('new-adventure-btn').click();
  await page.getByTestId('world-picker-vale_of_shadows').click();
  await page.getByTestId('auto-fill-party-btn').click();
  await expect(page.getByTestId('begin-adventure-btn')).toBeEnabled();
  await page.getByTestId('begin-adventure-btn').click();
  await expect(page.getByTestId('game-narrative-panel')).toBeVisible({ timeout: 15_000 });

  // 2. Navigate town → road_north. One move places the party in a
  //    Bandit-Ruffian-occupied tile; the engine suppresses Move choices
  //    while an enemy is alive, so Attack is the only forward path.
  await clickMoveTo(page, 'The Old Road');

  // 3. Trigger combat by attacking the first available enemy. The
  //    Attack verb is iconized in the CombatActionBar — one button per
  //    combat verb, with the target controlled by the EnemySelector.
  const attackBtn = page.getByTestId('combat-attack');
  await expect(attackBtn).toBeVisible({ timeout: 5_000 });
  await expect(attackBtn).toBeEnabled();
  await attackBtn.click();
  await page.waitForTimeout(400);

  // 4. The first attack ignites combat. InitiativeStrip appears with one
  //    entry per PC (3) plus the bandits (2) = 5 total. Verify the full
  //    roster: each PC class shows up exactly once and every bandit
  //    enemy in the room is represented. A bug that left a PC out of
  //    the order, doubled an entry, or rolled initiative for the wrong
  //    creature would surface here rather than slipping past a count
  //    check.
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
  // road_north hosts 2 Bandit Ruffians; both should be in the order.
  expect(
    initialEntries.filter((t) => t === 'Bandit Ruffian'),
    `expected 2 Bandit Ruffian entries, got ${JSON.stringify(initialEntries)}`
  ).toHaveLength(2);
  expect(initialEntries).toHaveLength(5);

  // 5. Per-PC class invariant: cast_spell appears iff active class is
  //    Cleric. Iterate observed PC turns; tolerate combat ending early.
  let observed: PartyClass[] = [];
  for (let turn = 0; turn < 8; turn++) {
    // Combat may have ended (skeleton fell). If so, exit the loop.
    if ((await initStrip.count()) === 0) break;

    const cls = await activeClass(page);
    if (!cls) {
      // Active marker not on any party tile (e.g. mid-transition); pause
      // briefly and retry next iteration.
      await page.waitForTimeout(200);
      continue;
    }

    // Strip ↔ PartyRail sync: the ▶-marked entry in the initiative strip
    // must name the same character as the PartyRail's active tile. A
    // drift here would mean the engine and the renderer disagree about
    // whose turn it is.
    const stripActive = await activeInitiativeName(page);
    expect(
      stripActive,
      `turn=${turn}: initiative strip has no aria-current entry while PartyRail shows ${cls}`
    ).not.toBeNull();
    // Auto-fill sets `char.name === char.character_class`, so the strip
    // entry name and the PartyRail class label coincide for our party.
    expect(
      stripActive,
      `turn=${turn}: initiative ▶ marker is on "${stripActive}" but PartyRail aria-current is on ${cls}`
    ).toBe(cls);

    const types = await choiceActionTypes(page);
    const hasCast = types.includes('cast_spell');
    // Cast_spell is gated on action availability: a Cleric who already
    // consumed their action this turn (e.g. they're the PC who
    // initiated combat by attacking) won't see spell options until
    // their next turn. The engine signals "action already used" by
    // surfacing an `end_turn` choice (added only after action_used=true).
    // Skip the cast-presence assertion in that case; the inverse
    // assertion (Fighter/Rogue NEVER see cast_spell) still holds.
    const actionAlreadyUsed = types.includes('end_turn');
    if (cls !== 'Cleric') {
      expect(
        hasCast,
        `class=${cls} turn=${turn}: cast_spell present=${hasCast}, ` +
          `but only Cleric should see cast_spell. action types=${types.join(',')}`
      ).toBe(false);
    } else if (!actionAlreadyUsed) {
      expect(
        hasCast,
        `class=Cleric turn=${turn}: action is fresh but no cast_spell offered. ` +
          `action types=${types.join(',')}`
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
