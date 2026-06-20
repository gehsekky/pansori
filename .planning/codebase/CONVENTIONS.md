# Coding Conventions

**Analysis Date:** 2026-06-20

## Naming Patterns

**Files:**
- Service modules: camelCase (`feats.ts`, `dialogueGating.ts`, `multiclass.ts`)
- Component files: PascalCase (`CharScreen.tsx`, `GridMapView.tsx`, `RegionEditorScreen.tsx`)
- Test files: `.spec.ts` or `.spec.tsx` suffix (e.g., `feats.spec.ts`, `ItemIcon.spec.tsx`)
- Data files: camelCase for implementations, SCREAMING_SNAKE_CASE for constants (`srdItems`, `SRD_MONSTERS`, `SRD_CASTER_SPELL_COUNTS`)
- Fixtures: consistent suffix pattern (`test-fixtures.ts`)

**Functions:**
- camelCase for all function definitions (`applyDamage`, `formatSubclass`, `evalCondition`, `canTakeFeat`)
- Predicates use `can*`, `has*`, `is*` prefixes (`canTakeFeat`, `hasClass`, `canReact`, `isInSunlight`)
- Action handlers use `take*` or `apply*` patterns (`takeAction`, `applyFeatTake`, `applyDamage`)
- Recovery/consumption functions use `*ing` or `try*` pattern (`consumeImproveFate`, `tryDarkOnesLuck`, `breakConcentration`)

**Variables:**
- camelCase for local variables, function parameters, and object properties (`char`, `newState`, `resistance_reduction`)
- Database columns use snake_case (legacy schema fields like `character_class`, `spell_slots_max`, `condition_durations`)
- Type parameter names: PascalCase (`T`, `K`, `Character`, `Context`)
- Constants: SCREAMING_SNAKE_CASE for module-level constants (`DEFAULT_SPEED_FEET`, `SQUARE_SIZE`, `COMBAT_LOG_MAX`)

**Types:**
- Interfaces: PascalCase (`Character`, `GameState`, `Context`, `ApplyDamageOptions`)
- Type aliases: PascalCase (`EntitySide`, `ConditionName`, `Spell`)
- Union/literal types: lowercase identifiers matching database values (`'fire_bolt'`, `'misty_step'`, `'blinded'`)
- Discriminated union tags: camelCase fields (`type: 'cast_spell'`, `type: 'attack'`)

## Code Style

**Formatting:**
- Prettier: `semi: true`, `singleQuote: true`, `tabWidth: 2`, `printWidth: 100`, `trailingComma: 'es5'`, `arrowParens: 'always'`
- Enforced via pre-commit hooks (`.prettierignore` ignores build dirs)

**Linting:**
- Backend (Node): ESLint with TypeScript, `@typescript-eslint/recommended` ruleset
  - Config: `/home/gehsekky/workspace/pansori/src/backend/eslint.config.js`
  - Unused variables suppressed with `^_` prefix pattern (e.g., `_unused`)
  - `console` allowed (off), imports sorted
- Frontend (React): ESLint + React hooks + react-refresh plugins
  - Config: `/home/gehsekky/workspace/pansori/src/frontend/eslint.config.js`
  - React components exported only at module level (react-refresh/only-export-components warns otherwise)
  - Console calls generate `warn` (not error)
  - Unused capital-letter names allowed (React components, types)

**Module structure:**
- Imports grouped in order: types, standard library, third-party, local modules (enforced by `sort-imports` ESLint rule)
- Type imports use `import type` syntax throughout
- Barrel files common for sub-module exports (e.g., `index.ts` re-exports submodule functions)

## Import Organization

**Order:**
1. Type imports: `import type { ... } from '...'`
2. Standard library + third-party (React, vitest, etc.)
3. Local modules in order: types, utils, services
4. Side effects last (CSS, global setup)

**Path Aliases:**
- None configured; use relative paths with explicit file extensions (`.ts`, `.js`)
- Backend: `index.ts` and service files import from `../types.js` for the type seam
- Frontend: shared types live in `src/types.ts`, fetched by `src/lib/api.ts` route interface

## Documentation & Comments

**When to Comment:**
- High-level module purpose: Each service file opens with a multi-line block explaining the module's responsibility and architectural role
- SRD references: Use `// SRD: <section>` comment to cite the source rule (e.g., `// SRD: 5.2.1 Concentration check`)
- Non-obvious logic: Complex predicates, state transitions, and interaction patterns get inline explanation
- Architectural decisions: Type seams, migration paths, and cross-module contracts documented as block comments

**JSDoc/TSDoc:**
- Function-level JSDoc used extensively for public APIs
- `@param` and return descriptions: plain text, not TypeScript syntax (types inferred from signature)
- Multi-line descriptions for complex options objects
- Example in `applyDamage` (damage.ts): options object fully documented with `@param` for each field + usage pattern in comment

**Example patterns:**

From `src/backend/src/services/feats.ts` (line 14–22):
```typescript
/**
 * Check whether `char` meets the prerequisites for `feat`. Returns
 * an empty string on success, or a human-readable reason string on
 * failure. Callers can short-circuit on truthy returns.
 *
 * Modeled prereqs: `minLevel`, `minAbilityScores`, `classes` (any-of
 * match against the PC's class), `requiredFeat`. `other` is a list
 * of human-readable prereq strings the engine doesn't model — they
 * always pass here; UI surfaces them so the player knows.
 */
export function canTakeFeat(char: Character, feat: Feat): string {
```

From `src/backend/src/services/multiclass.ts` (line 1–21):
```typescript
// Multiclassing helpers (SRD Ch. 1).
//
// This module is the **read-side type seam** for multiclass support.
// It exposes `class_levels` lookups in a way that handles legacy
// single-class characters (where `class_levels` is unset) by deriving
// the breakdown from `character_class` + `level`.
```

## Error Handling

**Patterns:**
- Functions return discriminated results or throw intentionally for invariant violations
- Sync functions return string error messages in predicates (e.g., `canTakeFeat` returns reason or `''` on success)
- Async route handlers return `{ rows, rowCount }` from DB queries; check `rowCount` before destructuring
- No try/catch for expected failures; use return values instead
- Invariant violations throw errors immediately (e.g., missing context, invalid type coercion)

**Example from damage.ts:**
```typescript
if (rawAmount <= 0) {
  return {
    char,
    st,
    amountDealt: 0,
    tempHpAbsorbed: 0,
    tempHpRemaining: char.temp_hp ?? 0,
    concentrationNote: '',
    concentrationBroken: false,
    knockedOut: false,
    resistanceNote: '',
  };
}
```

## Function Design

**Size:** 
- Functions typically 20–100 lines; complex game logic (gameEngine.ts) reaches 200–500 lines per function
- Large spec files (gameEngine.spec.ts: 5500 lines) organize test cases into focused `describe` blocks by feature area

**Parameters:**
- Prefer named options objects for functions with 3+ parameters
- Type options with `Partial<T>` for overrides in test builders (e.g., `makeChar(overrides: Partial<Character> = {})`)
- Database query functions pass SQL + params array separately

**Return Values:**
- Single return type; use discriminated unions or named return objects for complex results
- `applyDamage` returns a detailed result object with narrative notes, damage accounting, and side effects
- Predicates return `boolean` or string (for human-readable failure reasons)
- State mutations: functions typically return the new state; original is immutable in game-engine paths

## Module Design

**Exports:**
- Services export only public functions; internal helpers are not exported (implicit via non-export)
- Test fixtures (`test-fixtures.ts`) export builder functions and test-context constants
- Type definitions shipped in `types.ts` and `shared-types.ts` (synced via `npm run sync-types`)

**Barrel Files:**
- `src/backend/src/campaignData/srd/index.ts` re-exports all SRD data (`SRD_MONSTERS`, `SRD_SPECIES`, item tables)
- Routes grouped in `src/backend/src/routes/` with one logical route file per major endpoint
- Backend tests grouped under `src/backend/src/tests/` with subdirectories mirroring source layout (`services/`, `campaignData/`)

## Architectural Comments

**Type Seams:**
- `multiclass.ts` is a read-side type seam allowing progressive migration from single-class to multiclass support
- `equipment.ts` bridges legacy single-slot schema to a new 13-slot equipment map
- Frontend `sync-shared-types` script copies backend types to frontend (one-way, checked via `--check` flag in CI)

**Invariants:**
- Character `class_levels` keys are lowercased; sum equals `char.level`
- Database rows converted to types immediately at route boundaries (no mixing raw results)
- Game state is immutable in the dispatcher path; mutations happen only in the effect handler
- Condition duration tracking indexed by condition name, with separate `condition_durations` map

---

*Convention analysis: 2026-06-20*
