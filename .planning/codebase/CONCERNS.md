# Codebase Concerns

**Analysis Date:** 2026-06-20

## Tech Debt

### Multiclass System — Incomplete Implementation

**Issue:** Warlock pact-slot pool merging breaks multiclass mechanics.
- Files: `src/backend/src/services/multiclass.ts`, `src/backend/src/services/actions/rest.ts`
- Impact: A multiclass Warlock with pact slots and other class slots cannot short-rest correctly. `actions/rest.ts` short-rest overwrites `spell_slots_max` to the pact value and resets all `spell_slots_used`, wiping the Warlock's non-pact slots entirely.
- Fix approach: Separate pact pool from caster slot pool. Needs a distinct `pact_slots_max` and `pact_slots_used` column + casting/recovery logic + FE surface.

### Subclass Assignment — Second Class Limitation

**Issue:** Subclass features only auto-assign for the primary class at L3.
- Files: `src/backend/src/services/multiclass.ts`
- Impact: A character who multiclasses into a second class and reaches that class's subclass level (e.g., Rogue L3) gets no subclass feature. The model assumes one active subclass.
- Fix approach: Move to per-class subclass tracking. Requires `class_levels` + `subclasses` map structure.

### Bestiary Simplifications — 30+ Deferred Monster Features

**Issue:** Monster abilities are systematically deferred as `// Simplification:` comments.
- Files: `src/backend/src/campaignData/srd/monsters.ts` (30+ notes), `src/backend/src/types.ts` (multi-stage mechanics)
- Common deferrals:
  - **Utility spellcasting** — monsters with Innate/Prepared spells use only the Priest convention (deferred non-combat spells)
  - **Lair actions & legendary saves** — stat blocks ship but trigger-logic is missing
  - **Swallow/Engulf** — grapple + swallowing alternate HP deferred
  - **Ability-score drain** — Shadow's Strength reduction not modeled
  - **Size-dependent riders** — many charge/knockdown/Prone effects simplified to always apply
  - **Multi-weapon traits** — some creatures simplify to uniform attack patterns
- Impact: Encounter difficulty can deviate from RAW; high-CR monsters lose signature mechanics. Smells high when a CR 16+ boss is simplified.
- Fix approach: Track per-monster in TODO.md; prioritize by CR/signature ability (Medusa gaze, demon lair actions). Each needs engine support (state machines, AoE variants, conditional trait firing).

### Test Suite Split — Scattered Large Files

**Issue:** Regression-spec coverage scattered across multiple files, architectural unification deferred.
- Files: `src/backend/src/tests/services/gameEngine.spec.ts` (5,529 lines), `src/backend/src/tests/services/gameEngine.class_features.spec.ts`, `src/backend/src/tests/services/gameEngine.grid_combat.spec.ts`, `src/backend/src/tests/services/gameEngine.cast_spell.spec.ts`
- Impact: Large test files are hard to navigate; test discovery is unclear. `gameEngine.spec.ts` is the single largest file in the repo (11,727 lines for the service + 5,529 for the main test).
- Fix approach: Documented as TODO "architecture-audit follow-up #1" — consolidate into smaller logical suites by action type, then index in a top-level suite registry.

### Narrative Fragment Backlog — 4 Unimplemented Events

**Issue:** Some combat events don't emit narrative `CombatEvent` records.
- Files: `src/backend/src/services/gameEngine.ts`, `src/backend/src/services/narrative/fragments.ts`
- Missing events:
  - Off-hand attack outcomes (`twoWeaponAttack`)
  - Secondary-target damage from cleave hits
  - Auto-hit effects (Divine Spark)
  - Condition-applied fragments (4 condition kinds)
- Impact: Combat log gaps mean partial action narratives. Players may not see who got hit by the second attack in two-weapon fighting.
- Fix approach: Four small PRs, one per fragment kind. Helper `resolveTarget(ctx, action)` to dedupe target resolution across ~5 call sites.

## Known Bugs

### Backend Auth Race Under Load

**Symptoms:** Running the e2e suite repeatedly against a persisted stack occasionally causes `/api/auth/me` to 401 for an entire test run, then recover on the next run.

**Files:** `src/backend/src/index.ts` (session config), test harness
**Trigger:** Sustained e2e load on a single stack (connection-pool / session-store exhaustion hypothesis).
**Current Status:** Masked by `retries:2`; doesn't affect CI (fresh ephemeral stack per run).
**Workaround:** Fresh stack per test run; avoid persisted multi-run hammering locally.
**Priority:** Low — investigate before real concurrency load (multi-player sessions).

## Security Considerations

### CSRF on State-Changing Endpoints

**Risk:** Production cookies use `sameSite: 'none'`, so session cookies ride cross-origin POSTs. An attacker could embed a form in a malicious site that makes state-changing requests (e.g., `POST /api/game/take-action`) on behalf of a logged-in user.

**Files:** `src/backend/src/index.ts:77` (session cookie config)
**Current mitigation:** Single-tenant architecture masks the issue (no multi-user sessions exposed yet); CORS is pinned.
**Recommendations:**
  - Tighten `sameSite` to `'lax'` in prod
  - OR implement double-submit token validation on state-changing endpoints
  - OR add `X-Requested-With: XMLHttpRequest` gating

**Blocker:** Requires a design call on CSRF strategy before implementation.

### Multiplayer Session Ownership

**Risk:** `game_sessions.user_id` is single-tenant; `takeAction` doesn't verify the active character's owner. When multiplayer campaigns ship, a player could theoretically submit actions on behalf of another player's character.

**Files:** `src/backend/src/routes/game.ts` (action dispatch), `src/backend/src/db/schema.sql`
**Current mitigation:** Single-tenant masks this; campaigns are author-only today.
**Recommendations:** Add `session_participants` table (already migrated in 010); gate `takeAction` to verify `ctx.user_id` owns the active character or has player-or-higher role.

### Content Security Policy

**Risk:** CSP is off (API returns no HTML). If future paths serve HTML directly, inline scripts could execute.

**Files:** `src/backend/src/index.ts` (helmet config)
**Current status:** Not a risk today (JSON API only).
**Recommendations:** Pre-commit a tight CSP (`script-src 'self'`) before any HTML-serving paths land.

## Performance Bottlenecks

### Large Monolithic Service Files

**Problem:** `gameEngine.ts` is 11,727 lines — single-function discovery is slow.
**Files:** `src/backend/src/services/gameEngine.ts`
**Cause:** Historical accumulation of game-state logic; no recent refactoring.
**Improvement path:** Move action dispatchers to `src/backend/src/services/actions/` subdirectory (already partially done). Phase out `gameEngine.ts` in favor of focused action modules + a registry.

### Full-State Broadcast (Multiplayer)

**Problem:** Every action reply broadcasts the entire `GameState` to all participants. At scale (large campaigns, many players), payload size explodes.
**Files:** `src/backend/src/routes/game.ts` (response structure)
**Current capacity:** Fine at single-player and small-party (3–5 players) scales.
**Limit:** Likely hits bandwidth/latency issues >10 concurrent sessions with complex state.
**Scaling path:** Implement delta protocol (send only changed fields) once multiplayer is in use. Don't prebuild; the shape of state may change significantly.

### Absence of Observability

**Problem:** Only `console.log` — no structured logging, error tracking, or metrics.
**Files:** Throughout (no single location).
**Risk:** Production errors surface only as 500s; telemetry for tuning (encounter difficulty, LLM enhancement latency) is unavailable.
**Improvement path:** Choose a service (Sentry for errors, structured logging for ops). Requires a decision before full launch.

## Fragile Areas

### Condition Duration Model — Multi-Stage Mechanics

**Files:** `src/backend/src/services/conditions/registry.ts`, `src/backend/src/services/gameEngine.ts` (petrify-ladder, save-ends timing)
**Why fragile:** The condition system mixes timed entries, save-ends, and hand-rolled state machines (e.g., petrifying-gaze ladder, Dazed). Changes to tick timing can break multi-turn mechanics.
**Safe modification:** Always add tests under `src/backend/src/tests/services/gameEngine.conditions.spec.ts` before touching condition expiry. The two-stage petrify ladder (`Restrained` → `Petrified`) is a good regression target (added 2026-06-20).
**Test coverage:** Condition specs exist; petrify-ladder regression in `gameEngine.spec.ts` (line ~2500).

### Action Dispatch Pipeline — Implicit Dependencies

**Files:** `src/backend/src/services/actions/index.ts`, `src/backend/src/services/gameEngine.ts` (takeAction), action handlers
**Why fragile:** `dispatchAction` delegates to action-specific handlers (cast_spell, move, attack, etc.) which expect certain `Character` fields (spell_slots_used, conditions, class_levels) to exist and be in sync. A migration that adds a new field can silently break actions if the field isn't initialized on legacy characters.
**Safe modification:** All new character fields must have a default in `makeChar()` and initialization in migrations. Check `migrationRunner.spec.ts` for the double-apply pattern (catches fresh-env breakage).
**Test coverage:** Regression specs in `regressionCoverageGaps.spec.ts` (grid combat, Flurry edge-cases, unknown features).

### LLM Provider — Silent Fallback

**Files:** `src/backend/src/services/llmProvider.ts:71`
**Why fragile:** `enhanceNarrative()` catches Anthropic errors and falls back to template narrative without re-throwing. A persistent API issue (quota, auth) could silently degrade UX without alerting ops.
**Safe modification:** Pair any LLM feature changes with error-budget tests. The fallback is intentional (graceful degradation) but needs telemetry to surface systemic issues.
**Test coverage:** No e2e LLM test (API key gating). Unit tests mock the call.

### Campaign Creator — Region/Room Sync

**Files:** `src/frontend/src/components/RegionEditorScreen.tsx` (4,046 lines), `src/backend/src/services/campaignContent.ts` (2,369 lines)
**Why fragile:** The creator's room painter, encounter-table editor, and narrative-node editor each maintain in-memory copies of the room/encounter/dialogue state, then POST back to the DB. Stale cache or partial saves can desync the UI from the backend.
**Safe modification:** Always verify round-trip consistency (create → load → compare) in tests before touching the editor. `lintCampaign` (cross-section FK audit) exists and catches some sync issues (`GET /campaigns/:id/validate`).
**Test coverage:** `RegionEditorScreen.spec.tsx` (1,566 lines) and `campaignContent.spec.ts` (3,061 lines) have good coverage, but e2e room-create → combat flow is worth monitoring.

## Scaling Limits

### Session Storage

**Current capacity:** Single `game_sessions` table with JSONB `state` column; parameterized queries.
**Limit:** Reasonable for 100–1,000 concurrent sessions. Beyond that, state JSON bloat and DB query latency compound.
**Scaling path:** If sessions exceed 10,000 concurrent, consider:
  - Serialization to a fast cache (Redis) with periodic DB flush
  - Sharded session tables
  - Only materialize the delta from the last checkpoint

### Spell & Monster Catalogs

**Current capacity:** ~340 spells, ~330 monsters (each with complex trait definitions).
**Limit:** Catalog load happens at startup (`contextLoader.ts`); no per-campaign filtering yet (TODO: `srdSpells()` implemented but not used universally).
**Scaling path:** Lazy-load catalogs on first use; pre-compute combat-relevant fields (e.g., enemy attacks, spell DC) at catalog-build time instead of runtime.

## Dependencies at Risk

### Migration Execution Model

**Risk:** Migrations run sequentially in a transaction, but there's no dry-run or staging validation. A bad migration blocks the entire app until manually rolled back.

**Files:** `src/backend/src/services/migrationRunner.ts`
**Impact:** Deployment fails hard; recovery requires manual DB intervention or a hotfix migration.
**Current mitigation:** `npm run check-migrations` (double-apply to a scratch DB) catches fresh-env breakage. All migrations are tested before commit.
**Improvement:** CI should run `check-migrations` on the test DB before deploying (currently local-only).

### Undeci Dependency (v7.25.0 → 7.28.0)

**Status:** Bumped in commit `30edb9c`. Known to have security issues in lower versions.
**Files:** `package.json`, `package-lock.json`
**Recommendation:** Keep `npm audit` in CI and audit regularly.

## Missing Critical Features

### Observability / Monitoring

**Problem:** No Sentry, structured logging, or custom metrics. Prod errors are invisible until a user reports them.
**Blocks:** Launch readiness (can't tune difficulty, debug LLM issues, detect outages).
**Priority:** High — tie into full launch prep.

### Multiplayer State Synchronization

**Problem:** Full-state broadcast works for current use-cases but doesn't scale. Delta protocol and proper session-ownership gating are deferred.
**Blocks:** Concurrent multi-player campaigns, spectator mode.
**Priority:** Medium — post-launch feature.

## Test Coverage Gaps

### Line-of-Sight Blocking

**What's not tested:** Walls / difficult terrain blocking spell AoEs and ranged attacks.
**Files:** `src/backend/src/services/gridEngine.ts` (line-of-sight functions used, but `hasLineOfSight` blocking by walls not exercised in combat).
**Risk:** Encounter design assumes cover rules; missing tests let subtle bugs through (e.g., a 30-ft blast ignoring walls).
**Priority:** Medium — add e2e tests for cover-based damage reduction.

### Equipment & Attunement Mechanics

**What's not tested:** Short-rest attunement, Remove Curse deattunement, cursed-item seeding.
**Files:** `src/backend/src/services/gameEngine.ts` (attunement touched minimally).
**Risk:** Item features work in isolation but attunement chains aren't verified end-to-end.
**Priority:** Low — attunement system is optional (magic items are mostly flavor until rare artifacts).

### Multiclass Spell Slots Edge Case

**What's not tested:** A Warlock/Wizard mix using short-rest pact slots + long-rest Wizard slots in a single turn.
**Files:** `src/backend/src/services/actions/rest.ts`, `src/backend/src/tests/services/multiclass.spec.ts`
**Risk:** Slot recovery is broken; no test catches it. This is a Known Bug (Warlock pact-pool issue).
**Priority:** High — tie into the multiclass PR roadmap.

### NPC Dialogue (Complex Branching)

**What's not tested:** Dialogue nodes with multi-stage conditions (`goto` hub-and-spoke paths, consequence chains that spawn quests + NPCs).
**Files:** `src/backend/src/tests/services/gameEngine.spec.ts` (dialogue tests exist but are minimal).
**Risk:** Dialogue state machine (cursor tracking, once-per-playthrough) is hand-rolled and can desync if consequences reorder nodes.
**Priority:** Medium — add regression tests as new dialogue features land.

### E2E Smoke Test — Auth Under Persistence

**What's not tested:** Multiple consecutive test runs against a single persisted Docker stack.
**Files:** `npm run test:e2e:stack` (ephemeral stack; fresh per run).
**Risk:** Auth race (TODO item #252) only manifests under sustained load on a persisted stack. CI uses ephemeral, so the bug is invisible in CI.
**Priority:** Low — known and mitigated locally; investigate before real concurrency (noted in TODO.md).

---

*Concerns audit: 2026-06-20*
