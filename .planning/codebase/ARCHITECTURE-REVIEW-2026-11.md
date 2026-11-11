# Architecture Review — 2026-11-11

Re-examination after ~5 months (last feature work 2026-06-24; Nov work was
deploy/CI only). Question: is the current architecture the most efficient one
for what Pansori is trying to be — a strict-SRD rules engine plus campaign
creator, played solo or by a small party, run by one developer on a shared
low-cost host?

## Verdict

**Keep the overall shape. Fix what's inside it.** A modular monolith (one Node
process, Postgres with JSONB game state, REST for actions + Socket.IO for fan-out,
one Docker Compose host) is the right fit for this workload and budget. Nothing
here is scale-bound: a turn-based game with 1–5 players per session produces a
handful of writes per minute. Re-platforming (microservices, Redis, managed DB,
Kubernetes, a delta-sync protocol, an event-sourced store) would add cost and
moving parts without addressing any problem the project actually has.

The real inefficiencies are (1) a correctness gap in how state is written,
(2) operational gaps (no backups, CI weaker than the documented gate, EOL
runtime), and (3) developer-throughput costs from a few oversized modules and
duplicated FE/BE logic.

## Snapshot (measured 2026-11-11)

| Metric | Value |
|---|---|
| Backend source (non-test) | ~72k lines TS; `gameEngine.ts` 11,824 lines |
| Largest functions | `generateChoices` ~2,600 lines, `takeAction` ~970, `runEnemyTurns` ~910 |
| Backend tests | 345 files, 3,427 pass / 3 skipped, ~17s wall, **~123s cumulative import vs ~10s test time** |
| Frontend | ~27k lines; `RegionEditorScreen.tsx` 4,046, `CharScreen.tsx` 2,357, `App.tsx` 1,851; 57 spec files / 466 tests pass |
| Migrations | 47 SQL files, idempotent, applied on boot |
| Host | one `t4g.small` (2 GB, arm64), shared with mysignalchain |
| Prod LLM | `LLM_PROVIDER=none` by default |

## Findings, ranked

### 1. Session-state writes can lose updates — correctness (S) — DONE 2026-11-11

> Implemented as a per-session row lock rather than a conditional update:
> `withSessionTx` + `SELECT … FOR UPDATE` (`db/sessionTx.ts`). No migration
> or FE change; side routes wait instead of failing.


`POST /session/:id/action` reads the row, compares the client's `turn_seq`,
does the work, then writes with `UPDATE game_sessions SET … WHERE id = $n`.
The write is not conditioned on the `turn_seq` it read, so two in-flight
requests both pass and the later one overwrites the earlier one. Five other
routes (`equip`, `transfer`, `drop`, `reorder-inventory`, `assign-character`)
rewrite the full `state` without checking or bumping `turn_seq` at all.

This is reachable today: a second tab, the 3D view's movement sync, or any two
party members acting near-simultaneously.

**Fix:** one `saveSessionState(client, id, expectedSeq, state, seed?)` helper
doing `UPDATE … WHERE id = $1 AND turn_seq = $2 RETURNING turn_seq`; 0 rows →
409. Route every state write through it. Make `turn_seq` required from the
current FE. No architectural change needed; this is the optimistic-concurrency
design finished.

### 2. No database backups — operational risk (S)

Prod Postgres runs in a container on the host's EBS volume with no `pg_dump`,
snapshot policy, or replica. Because campaigns are now **creator-authored in
the DB** (not only code fixtures), losing that volume loses user content, not
just sessions. `gehsekky-infra/mysignalchain.tf` already implements nightly
`pg_dump` → S3 with 30-day retention and an alarm; clone it for Pansori. This
is cheaper and simpler than moving to RDS.

### 3. CI is weaker than the documented gate (S) — DONE 2026-11-11

`deploy.yml` does not run the frontend unit suite, `sync-types:check`, or
`check-migrations`, though README / the sync script / TODO all said CI checks
type drift. The 2026-06-06 incidents (auto-fill / Divine Order; 015/020
migrations) are exactly what these catch. Add three steps to the `test` job.

### 4. Runtime is end-of-life (S–M)

Images and CI use Node 20 (EOL 2026-04-30). Move both to Node 24 LTS in one
change. Local dev already runs Node 26, so the test suites are known to work on
newer Node.

### 5. `gameEngine.ts` is the throughput bottleneck (M–L, incremental)

The action handlers were split out under `services/actions/`, but the three
largest pieces of logic didn't follow:

- `generateChoices` (~2,600 lines) builds every menu for every mode.
- `takeAction` (~970) is persistence-adjacent orchestration + narrative + LLM.
- `runEnemyTurns` + `computeEnemyAttack` + the enemy multiattack/spell loops
  (~2,300 combined) are the monster AI.

51 action modules import back from `gameEngine.ts`, which keeps the
lazy-import cycle alive. Every one of the 345 spec files pays to import the
whole engine and the SRD catalogs — hence ~12× more time spent importing than
testing.

**Direction:** mirror the action registry on the choice side
(`choices/combat.ts`, `choices/exploration.ts`, `choices/dialogue.ts`,
`choices/leveling.ts`, each `(state, seed, ctx) => GameChoice[]`, composed by a
thin `generateChoices`), and move enemy AI to `services/enemyAi/`. Do it one
slice at a time when touching an area, not as a big-bang refactor; the existing
3,400 tests are the safety net.

### 6. Duplicated FE/BE logic (M)

Only *types* are shared (`src/shared/types.ts`, copied into each workspace).
Logic is mirrored by hand: at least 8 FE sites say they "mirror the backend"
(`lib/activeGrid.ts` ↔ `mapEngine.mergeObstacles`/active-grid resolution,
`lib/combatPreview.ts` ↔ grid geometry, grid-dimension derivation in
`MapsPanel`, `levelUpAvailable`), and FE `types.ts` restates BE types outside
the shared file. Each is a silent-drift risk.

**Direction:** let `src/shared/` hold pure functions too (grid geometry, active
grid resolution, level-up pending checks), and replace the copy script with a
TS path alias / workspace package. The cost is a wider Docker build context for
both images, a one-time change.

### 7. Seed snapshots duplicate campaign content per session (watch)

`Seed` copies the campaign's regions, towns, theme and terrain art into every
session row so the FE can render without the `Context`. The action route already
avoids rewriting it each turn. This is fine at today's scale. If session rows
grow large, serve campaign content once from a cacheable
`GET /campaigns/:id/content?v=<version>` and keep only per-session deltas in
`seed`. Measure row sizes before acting.

### 8. LLM narration blocks the action response (only if enabled)

With `LLM_PROVIDER=anthropic`, `takeAction` awaits a model call before the
REST response and the broadcast, adding hundreds of ms+ to every turn and
coupling turn latency to a third-party API. If this gets turned on: respond with
the template narrative immediately, then push the enhanced text over the
existing socket as a follow-up event. Also update the default model from
`claude-haiku-4-5-20251001` to the current Haiku (`claude-haiku-5-5`).

### 9. Two renderers (product decision)

The FE maintains both 2D (`GridMapView` / `GridCombatView`) and 3D
(`Crawler3DView` / `Combat3DView`) views, and the 3D ones also mirror backend
geometry. `origin/experiment/3d-v2` is fully merged and 5 months stale. Decide
whether 3D is a first-class target; if not, freezing it would cut the
mirroring surface roughly in half.

## Explicitly not recommended now

| Idea | Why not |
|---|---|
| Split into services | One developer, one deploy unit, turn-based load. Splitting adds network hops to the hottest path (action → rules → state). |
| Redis / cache tier | State is one row per session; Postgres JSONB handles it. The in-process `CONTEXTS` cache is fine for a single instance. |
| Horizontal scaling | Blocked by the in-process `CONTEXTS` cache and Socket.IO rooms without an adapter. Neither is needed at current load; revisit only with real concurrency numbers. |
| Multiplayer delta protocol | Full-state broadcast is small enough for 1–5 players. Already in TODO as "don't prebuild". |
| RDS | ~$15/mo+ for what a nightly `pg_dump` to S3 covers at this scale. |
| Normalizing `GameState` into tables | The rules engine works on an in-memory object graph; JSONB keeps reads/writes single-row. The fix needed is atomic writes (#1), not a schema change. |

## Suggested order

1. Atomic state writes (#1) — small, fixes a live correctness bug.
2. Backups (#2) and CI parity (#3) — an afternoon, removes the biggest operational risks.
3. Node 24 (#4).
4. Then, opportunistically with feature work: engine decomposition (#5) and
   shared logic (#6), starting with whichever area the next milestone touches.
