# Testing Patterns

**Analysis Date:** 2026-06-20

## Test Framework

**Runner:**
- Backend: Vitest (Node environment)
  - Config: `/home/gehsekky/workspace/pansori/src/backend/vitest.config.ts`
  - Spec pattern: `src/**/*.spec.ts` (includes 342 test files)
  - Run: `npm run test:be` (workspace-scoped from root)
- Frontend: Vitest (jsdom environment)
  - Config: `/home/gehsekky/workspace/pansori/src/frontend/vite.config.ts` (test section)
  - Spec pattern: `src/**/*.spec.{ts,tsx}` (includes 57 test files)
  - Run: `npm run test:fe` or `npm run test --workspace=pansori-frontend`

**Assertion Library:**
- Vitest built-in `expect()` and matchers

**Run Commands:**
```bash
npm run test              # Run all tests (backend + frontend)
npm run test:be           # Backend only
npm run test:fe           # Frontend only
npm run test:watch        # Frontend watch mode (run from src/frontend)
npm run test:e2e          # Playwright end-to-end tests
npm run test:e2e:stack    # Spin up Docker stack, seed test campaign, run E2E, tear down
npm run test:e2e:headed   # E2E with visible Chromium browser
```

## Test File Organization

**Location (Backend):**
- Co-located with source: Test files live in `src/tests/` subdirectory structure that mirrors the source tree
- Example: `src/services/feats.ts` → `src/tests/services/feats.spec.ts` (not beside source)
- Reason: `tsconfig.json` includes `src/**/*`; vitest's spec glob catches both locations, so nothing runs silently if a spec is misplaced

**Location (Frontend):**
- Primarily co-located: `src/lib/characterFmt.spec.ts` sits next to `src/lib/characterFmt.ts`
- Components: `src/components/ItemIcon.spec.tsx` next to `src/components/ItemIcon.tsx`

**Naming:**
- `.spec.ts` suffix for all unit tests (not `.test.ts`)
- Example: `resistanceSpell.spec.ts`, `campaignMembers.spec.ts`, `characterFmt.spec.ts`

**Directory Structure:**
```
src/backend/src/tests/
├── services/               # Mirrors src/services/
│   ├── gameEngine.spec.ts
│   ├── gameEngine.cast_spell.spec.ts
│   ├── gameEngine.grid_combat.spec.ts
│   ├── gameEngine.class_features.spec.ts
│   ├── gameEngine.boss_encounters.spec.ts
│   ├── gameEngine.conditions.spec.ts
│   ├── conditions/
│   ├── narrative/
│   ├── actions/
│   └── ...
├── campaignData/
│   └── srd/               # Mirrors src/campaignData/srd/
│       ├── monsters.spec.ts
│       └── ...
├── campaign/
├── auth/
├── fixtures/
│   └── testContext.ts     # Test-only context (not a campaign)
└── ...

src/frontend/src/
├── lib/
│   ├── characterFmt.ts
│   ├── characterFmt.spec.ts
│   ├── combatPreview.spec.ts
│   └── ...
├── components/
│   ├── ItemIcon.tsx
│   ├── ItemIcon.spec.tsx
│   ├── RegionEditorScreen.tsx
│   └── RegionEditorScreen.spec.tsx
└── ...
```

## Test Structure

**Suite Organization (Backend):**
```typescript
import { describe, expect, it, vi, afterEach } from 'vitest';
import { makeChar, makeState, mockRandom } from '../../test-fixtures.js';
import { canTakeFeat } from '../../services/feats.js';
import { context as ctx } from '../fixtures/testContext.js';

afterEach(() => vi.restoreAllMocks());

describe('Feat prerequisite checking', () => {
  it('allows a feat when all prerequisites are met', () => {
    const char = makeChar({ level: 5, int: 13 });
    const feat = { id: 'alert', prerequisites: { minLevel: 1 } };
    expect(canTakeFeat(char, feat)).toBe('');
  });

  it('blocks a feat when level is too low', () => {
    const char = makeChar({ level: 2 });
    const feat = { id: 'Magic Initiate', prerequisites: { minLevel: 4 } };
    const result = canTakeFeat(char, feat);
    expect(result).toContain('level 4');
  });
});
```

**Patterns:**

1. **Imports**: Type imports at top, then vitest, then local services/fixtures
2. **Setup**: `afterEach(() => vi.restoreAllMocks())` to scope mocks to each test
3. **Test builders**: Use `makeChar()`, `makeState()` from `test-fixtures.ts` with `Partial<>` overrides
4. **Random mocking**: `mockRandom(0.5, 0.75)` returns values in sequence; next `.random()` call gets 0.5, next gets 0.75
5. **Async handling**: Use `await` in async test functions; vitest automatically detects promises
6. **Fixtures**: Global test context (`testContext.ts`) shared across ~220 specs

## Test Structure (Frontend)

```typescript
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { ItemIcon } from './ItemIcon';

describe('ItemIcon', () => {
  it('renders a painted PNG for a covered bucket', () => {
    const { container } = render(<ItemIcon item={{ id: 'longsword', type: 'weapon' }} />);
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe('/art/icons/blade.png');
  });

  it('honors the per-item icon override', () => {
    const { container } = render(
      <ItemIcon item={{ id: 'longsword', type: 'weapon', icon: 'axe' }} />
    );
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/art/icons/axe.png');
  });
});
```

**Patterns:**
- Use `@testing-library/react` for component rendering (`render()`)
- Query components via `container.querySelector()` for DOM assertions
- Mock environment variables with `vi.stubEnv()` for feature-flag testing (painted art tier)
- `afterEach` cleanup is implicit (test-setup.ts calls `cleanup()`)

## Mocking

**Framework:** Vitest `vi` module

**Mock Examples:**

1. **Random number mocking** (test-fixtures.ts):
```typescript
export function mockRandom(...values: number[]): ReturnType<typeof vi.spyOn> {
  const spy = vi.spyOn(Math, 'random');
  values.forEach((v) => spy.mockReturnValueOnce(v));
  return spy;
}
```

2. **Database query mocking** (campaignMembers.spec.ts):
```typescript
const pool = {
  query: vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes('SELECT id FROM users WHERE email')) {
      const u = users.find((u) => u.email === params[0]);
      return { rows: u ? [{ id: u.id }] : [], rowCount: u ? 1 : 0 };
    }
    // ... handle other queries
  }),
} as unknown as Pool;
```

3. **Environment variable stubs** (frontend, itemIcons.spec.tsx):
```typescript
afterEach(() => vi.unstubAllEnvs());

it('renders the bucket glyph when painted art is off', () => {
  vi.stubEnv('VITE_PAINTED_ART', '');
  const { container } = render(<ItemIcon item={{ id: 'longsword', type: 'weapon' }} />);
  expect(container.querySelector('.game-icon-broadsword')).toBeTruthy();
});
```

**What to Mock:**
- `Math.random` for deterministic dice rolls
- Database connections (Pool.query) for integration tests against fake schema
- Socket.io broadcasts in chat/state-sync tests
- External API calls (if any)

**What NOT to Mock:**
- Game logic functions — test them directly (damage calc, condition application, spell resolution)
- Type conversions and formatting (test the actual output)
- The test fixture builders themselves (`makeChar`, `makeState`)
- Local helper functions within a module (test through public API)

## Fixtures and Factories

**Test Data:**

Backend builders in `src/backend/src/test-fixtures.ts`:
```typescript
export function makeChar(overrides: Partial<Character> = {}): Character {
  return {
    id: 'char-1',
    name: 'Test Hero',
    character_class: 'Soldier',
    hp: 10,
    max_hp: 10,
    ac: 10,
    str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10,
    spell_slots_max: {},
    spell_slots_used: {},
    conditions: [],
    condition_durations: {},
    // ... full default object
    ...overrides,
  };
}

export function makeState(pc: { id: string }, opts: Partial<GameState> = {}): GameState {
  // Returns a fully-populated GameState with sensible defaults
}

export function makeAdjacent(
  state: GameState,
  enemyName: string,
  enemyHp?: number
): GameState {
  // Seeds the grid with PC at (4,5) and named enemy at (5,5) for reach testing
}
```

**Location:**
- Backend: `src/backend/src/test-fixtures.ts` (imported by ~220 specs)
- Frontend: None centralized; most components use inline props for test rendering

**Example usage (resistanceSpell.spec.ts):**
```typescript
const char = makeChar({
  id: 'pc-1',
  hp: 20,
  max_hp: 20,
  resistance_reduction: { type: 'fire' },
});
const res = applyDamage(char, dmgState(1), 10, { damageType: 'fire', skipConcentration: true });
expect(res.amountDealt).toBe(7); // 10 − 3 (1d4 roll mocked to 3)
```

## Coverage

**Requirements:** No enforced target; high coverage is a goal but not a CI blocker

**Test suite stats (as of 2026-06-20):**
- Backend: 342 spec files, ~5500 lines in gameEngine.spec.ts alone
- Frontend: 57 spec files
- Regression suite: `regressionCoverageGaps.spec.ts` tracks intentional gaps and known edge cases

**View Coverage:**
```bash
# No coverage reports are configured; use IDE/CLI tools to measure locally
# vitest has built-in coverage support but it's not configured in this project
```

## Test Types

**Unit Tests:**
- Scope: Individual service functions and their output invariants
- Approach: Fully isolated with mocked dependencies; test expectations on return values
- Example: `feats.spec.ts` tests `canTakeFeat()` with mocked context data
- Count: The vast majority of backend tests (300+ files)

**Integration Tests:**
- Scope: Cross-service interactions (game engine calling damage, spell resolution, condition application)
- Approach: Use real (in-memory) game state; mock only external boundaries (DB, socket)
- Example: `gameEngine.spec.ts` tests full action flows: cast spell → apply damage → check concentration → update state
- Count: ~20 large integration suites (each 500–5500 lines)

**E2E Tests:**
- Framework: Playwright
- Config: `/home/gehsekky/workspace/pansori/playwright.config.ts`
- Scope: Browser login → character creation → BEGIN ADVENTURE → in-game combat
- Approach: Real Docker-compose stack (`docker-compose.e2e.yml`); ephemeral test campaign seeded via `POST /api/test/seed-campaign`
- Run: `npm run test:e2e:stack` (creates stack, runs tests, tears down; leaves no DB artifacts)
- Importance: **Critical gate** — the only local check that exercises the full login → creation → combat flow for real; unit suites alone have let CI-only breakage through

## Common Patterns

**Async Testing:**
```typescript
it('casting Resistance stamps resistance_reduction', async () => {
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
  const r = await takeAction({
    action: { type: 'cast_spell', spellId: 'resistance', targetCharId: 'pc-1' },
    history: [],
    state: casterState(),
    seed,
    context: ctx,
  });
  const c = r.newState.characters[0];
  expect(c.concentrating_on?.spellId).toBe('resistance');
});
```

**Error Testing:**
```typescript
it('rejects a feat with unmet level prerequisite', () => {
  const char = makeChar({ level: 2 });
  const feat = { id: 'Magic Initiate', prerequisites: { minLevel: 4 } };
  const result = canTakeFeat(char, feat);
  expect(result).toContain('requires character level 4');
});
```

**State Mutation Testing:**
```typescript
it('applies multiclass proficiency grants on first level in a new class', () => {
  const char = makeChar({ character_class: 'Fighter', armor_proficiencies: ['light'] });
  const msg = applyMulticlassProfGrants(char, 'Rogue');
  expect(char.armor_proficiencies).toContain('light'); // Rogue adds 'light'
  expect(msg).toContain('light armor');
});
```

**Random Roll Testing:**
```typescript
it('reduces damage by 1d4 when Resistance matches damage type', () => {
  vi.spyOn(Math, 'random').mockReturnValue(0.5); // 1d4 → 3 (4 * 0.5 + 1 = 3)
  const char = makeChar({ hp: 20, max_hp: 20, resistance_reduction: { type: 'fire' } });
  const res = applyDamage(char, dmgState(1), 10, { damageType: 'fire', skipConcentration: true });
  expect(res.amountDealt).toBe(7); // 10 − 3
  expect(res.resistanceNote).toContain('Resistance');
});
```

## Test Data Management

**Shared Test Context:**
- Location: `src/backend/src/tests/fixtures/testContext.ts`
- Provides: A self-contained Context object with SRD class machinery, a small dungeon campaign, bestiary, and loot table
- Scope: Imported by ~220 backend specs; stateless and reusable
- Pattern: All specs that need game rules import `context as ctx` from this fixture

**Database Mocks:**
- Approach: Fake in-memory object with a `query: vi.fn()` method that returns `{ rows, rowCount }`
- Pattern: Check `rowCount` before destructuring; each test function handles queries it cares about, rest return empty arrays
- Example (campaignMembers.spec.ts): ~100 lines of conditional query handling in the fake DB

---

*Testing analysis: 2026-06-20*
