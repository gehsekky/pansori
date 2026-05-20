# TODO

<!-- Completed items pruned. See git history for what's already shipped. -->

## End-goal target

Browser-based, D&D 5e SRD-compliant engine capable of running complex campaign scripts as a full RPG experience.

---

## 5e SRD remaining gaps

> **Edition alignment** — Pansori targets 2024 PHB / SRD 5.2.1. The Top 5
> (weapon masteries, class feature audit, inspiration spend, Hide DC,
> multi-target spells) and the bulk of subsystems are shipped; remaining
> RAW gaps are small-impact or architecturally blocked.

### Architectural blockers

- [ ] **Climbing & Crawling movement cost** — needs a "movement mode" concept. Skip until verticality.
- [ ] **Jumping** — Long jump = STR ft, high jump = 3 + STR mod ft. Same verticality blocker.

### From mission-log analysis (2026-05-20) — all shipped

- [x] **Unprepared spells surface in cast menu** — `cast_spell` choices are now filtered to `prepared_spells` for Cleric/Paladin/Druid (cantrips always castable). Sorcerer/Bard/Warlock cast everything they know. Runtime rejection message no longer suggests mid-combat prep.
- [x] **Bless +1d4 not appearing in attack notes** — Bless now applies a `blessed` condition to caster + first 2 living allies (tracked via `condition_sources.blessed = caster.id`). Each blessed attack rolls 1d4 and adds to the to-hit total; `Bless: +N (1d4)` surfaces in `atkNote` alongside Bardic Inspiration. Concentration drop clears `blessed` from all linked PCs.
- [x] **Cantrip damage + spell HP-remaining tokenized** — `fmt.dmg()` + `fmt.hp()` + `fmt.dc()` now wrap spell-attack damage, save-spell damage + DC, auto-hit cantrip damage (e.g. Eldritch Blast), Divine Spark damage, Graze damage, Colossus Slayer damage + HP-remaining, single-target spell HP-remaining. Regression specs cover the spell-attack and save-spell paths.
- [x] **Frightened condition persists through death-save Nat 20** — root cause was unrelated to frightened duration. The Nat-20 recovery handler was clearing ALL conditions instead of just `unconscious` (line 698 of `processDeathSave`); a downed-then-revived PC would lose every pre-existing condition, including frightened. Fix: clear only `unconscious` + matching duration entry; everything else persists per SRD 5.2.1 p.197.
- [x] **Compound enemy-turn narratives split into paragraphs** — `runEnemyTurns` now prepends `\n\n` to each `[X's turn]` header. `NarrativeText` uses `whiteSpace: 'pre-line'` so the FE renders each turn as its own paragraph. The strip → log → narrative chain still has the same per-event combat_log entries; the prose just breathes between turns now.

### From mission-log analysis (2026-05-21)

> Findings from the multi-combat Vale playthrough log (Bandits → Skeleton →
> 2× Crypt Ghoul). Ordered by impact + ease.

- [x] **Mystery advantage on every subsequent PC attack** — fixed. Root cause was NOT Vex/Sap as suspected; it was `isFlankingPosition` (gridEngine.ts:63) being far too permissive. The pre-fix function returned true whenever attacker and ally had opposing signs on a single axis relative to target — regardless of distance. With a 3-PC party spread across the grid, almost every attack after the first PC repositioned would silently trigger flanking. RAW DMG 2014 flanking requires (a) both attacker AND ally adjacent to target (Chebyshev distance = 1), and (b) ally's offset is the exact negation of attacker's offset (diametrically opposite squares). 7 regression specs cover cardinals, diagonals, and the Vale 3-PC scenario.
- [x] **Concentration spells never expire** — fixed. Added `concentrating_on.rounds_left?: number` + `Spell.durationRounds?: number` (default 10 = 1 minute). New `tickConcentrationDurations(st)` helper runs on round wrap, decrementing every PC's timer; spells whose budget hits 0 break cleanly via `breakConcentration` so linked conditions (`blessed`, `paralyzed`, etc.) clear at the same time. Bless + Hold Person + Bane all use the 10-round default; longer-duration spells (Spirit Guardians, Hex) can override per spell. 2 regression specs cover cast-time init + auto-end on round wrap.
- [x] **Combat-start initiative narrative** — fixed. Replaced the misleading `X acts (initiative N)!` with `X strikes with the opening blow (initiative N)!` when the triggering PC isn't first in initiative. When they ARE first, narrative stays `X acts first (initiative N)!`. The behavior (PC's attack runs immediately on combat-start) is kept as an "ambusher" affordance — only the framing changed.
- [x] **Cantrips in prep cap** — fixed. Both `generateChoices` (auto-prep clamp) and the `prepare_spells` handler now filter out cantrips (level 0) before counting against the cap. RAW: cantrips are always known, not prepared. Three regression specs updated.
- [x] **Surprise — enemies now actually skip their first turn** — root cause: surprised PCs already skipped via the choice generator's `SURPRISED — cannot act this round (pass)` short-circuit, but the enemy turn loop had no equivalent check. A surprised enemy got the narrative marker and then acted normally. Now: surprised enemies emit `[X is surprised and loses their turn!]` and the loop advances past them. Pansori sticks with 2014 surprise model (skip first turn) consistently across both sides; 2024 init-disadvantage conversion remains a separate refactor.
- [x] **Preserve Life narrative when no eligible target** — fixed. Channel-divinity spend still costs the use (RAW behavior — gates don't refund) but the narrative now says `No HP distributed (every wounded ally is already above half HP)` instead of the misleading `Distributed 0 HP among 1 wounded allies`.
- [x] **Level-up narrative on a downed PC** — fixed in `applyLevelUpFromXp`. PCs at 0 HP / unconscious / accumulating death-save failures still get the mechanical level-up (level/HP/spell-slot increase, HP bump may revive them — that's RAW), but the heroic-flavor pool is suppressed in favor of a quieter `X reaches level N (+H HP, while unconscious)` line.
- [x] **Enemy miss flavor variety** — fixed. The single repeated "you dodge at the last second" line is now a `pick()` over 6 variants ("swings wide", "blow glances off your guard", "misjudges the distance", "you sidestep", "and misses cleanly", plus the original).

---

## Content & playtest

- [ ] **Boss fight follow-ups — wire to actual bosses** — engine scaffolding for legendary actions (`EnemyTemplate.legendary_actions` + per-round point pool with refresh on the legendary's own turn) and lair actions (`EnemyTemplate.lair_actions` firing on round-wrap as AoE save-for-half damage) is in place with test coverage (`describe('boss legendary + lair actions', ...)`). Effects shipped: `extra_attack` (legendary) and `aoe_save_damage` (lair). Not wired to the Vale Crypt Lord because the existing playthrough balance assumes phase transitions alone — adding strong lair pulses required re-tuning the boss. A future boss (e.g. fourth-campaign showcase) is a better fit. More effect kinds (terrain shift, debuff aura, summon, multi-attack legendary) can be added as content demands them.
- [ ] **Fourth campaign module (opportunistic)** — coastal pirate town, desert ruin, planar city, etc. Stress-tests the format further. Not on the critical path.

---

## Type-share infrastructure

- [ ] **Phase 3 of type-share** (remaining workspace-local: Character, GameState, Seed, Trap, Room, OnHitEffect, BossPhase, EnemyTemplate, Enemy, Spell, BeastForm, InventoryItem, TurnActions, DeathSaves, Context/FrontendContext, Location, GameRule, RuleFacts, CampaignFacts) — these either depend on BE-only types that would cascade-share (Seed → Enemy → BossPhase → OnHitEffect; Location → Room → Trap), have FE-vs-BE structural differences requiring reconciliation (Character / GameState — FE has slim versions, BE has rich), or are intentionally separate (FrontendContext vs Context). Defer until there's a concrete reason to share each one.

---

## UX & polish

- [ ] **Grid map detail pass** — phase 1 shipped (dead bodies as faded skull, same-name enemy `#N` disambiguation, AoE preview tints, rich `aria-label`). Still TODO: difficult-terrain squares (rocks/snow tile), obstacles, party LoS indicators, last-attacker arrows.
- [ ] **Tutorial / onboarding** — 2-room intro covering the action choice loop, grid combat, inventory modal. New players have nowhere to learn the controls today.
- [ ] **Dynamic room/encounter image generation** — Google Imagen behind `IMAGE_PROVIDER` flag, off by default.
- [ ] **Sound effects** — ambient audio per location type; combat sound cues.
- [ ] **LLM enhancement follow-ups** — initial audit shipped (`preservesCriticalFacts()` guard in `gameEngine.ts` falls back to raw narrative when the model drops a multi-digit number or outcome word; system prompt now mentions multi-PC `[CharName]` prefix preservation). Still open: (a) cost/latency circuit-breaker — every action invokes the LLM, no per-session budget cap; (b) skip enhancement for short events (<100 chars) where prose flourish isn't worth the round-trip; (c) side-by-side comparison of LLM vs no-LLM mode to know if enhancement is net-positive for player experience.

---

## Engine & infrastructure

- [ ] **Save/state persistence across redeploys (manual verify)** — schema-evolution contract is now under test: `normalizeState` specs assert that a JSONB state row missing post-rollout fields (grid `entities`, `movement_used`, `pending_reaction`, quest/faction overlay, etc.) loads cleanly and survives a `takeAction` call without crashing. Still TODO: an actual end-to-end manual exercise — start a session, redeploy the backend container, resume the session, confirm parity. ~30 min.
- [ ] **Difficulty tuning from playtest data** — once playtests happen, capture damage/HP/encounter telemetry to inform tuning passes.
- [ ] **gameEngine.ts class refactor (deferred)** — `takeAction` is ~3700 lines with three handlers that dominate (`use_class_feature` ~800, `cast_spell` ~544, `attack` ~532). Refactor into an `ActionContext` class that dispatches to handler files (`services/actions/castSpell.ts`, etc.). Moderate regression risk. Triggers to revisit: (a) big-handler edits grind into context budget; (b) a feature touches multiple handlers; (c) a quiet maintenance day.
- [ ] **Pre-commit hook (Husky + lint-staged)** — auto-run eslint + prettier on staged files before commit. Catches the class of bug where prettier-dirty code reaches CI and fails the build. ~30 min setup; bypassable with `--no-verify`. CI lint stays as the gate.

- [ ] **Multiplayer + party chat (online co-op)** — let friends share a session and chat in realtime. Architecture audit confirmed the base is close: `state.characters[]` already models a party, `state.current_room` is single-valued (no party split → players share one narrative), and the reactive-spell pause already routes prompts to the eligible PC. Four concrete gaps:
  1. **Ownership model**: `game_sessions.user_id` is single-tenant. Add `session_participants(session_id, user_id, character_id, role)`; authorization becomes "user is a participant." Original `user_id` stays as host (matters for delete/invite). ~3-4h.
  2. **Turn enforcement at the API boundary**: `takeAction` doesn't check `req.user.id === characters[active].owner_user_id`. Singleplayer doesn't care; multiplayer is exploitable. Add `Character.owner_user_id` + a single route-level guard. ~1h.
  3. **Realtime push (Socket.IO)**: one server room per session; `state` event after every takeAction broadcasts to all participants; `chat` event in both directions for messages. Keeps REST for writes (auth model unchanged, easy to reason about) and uses WS only for fanout. Needs sticky sessions if Pansori ever scales to >1 backend instance — today single EC2, no concern. ~7h server + frontend integration.
  4. **Chat MVP**: input + message list + `chat_messages` table for persistence. ~3h.
  5. **Race detection** (optional): `turn_seq` column rejects stale takeAction submissions when two players race-click. ~1-2h. Defer until it actually bites.

  Total ~15-17h, splittable into 4 PRs. Order: participants table → Socket.IO scaffolding → chat → race detection. Each PR keeps singleplayer working; multiplayer only activates when a session has >1 participant.

  Open questions to settle before starting:
  - Invite UX: shareable link, or invite-by-email through users table?
  - DM mode (one player runs encounters for others) or strict party-of-equals?
  - Voice — pipe Discord OAuth into a Discord-server-link feature, or leave voice out and let players use their own VC?


### Architecture audit follow-ups

- [ ] **Socket.IO frontend client** (needs-input) — the server-side Socket.IO scaffolding already exists in `src/backend/src/index.ts` (room-join handler + per-session rooms), but no frontend client is wired and no state broadcasts happen. The Multiplayer TODO under-estimated this — half of the WebSocket scaffolding is already done. Open question: do we wire the client now (as prep for multiplayer) or wait until the participants-table item lands?
- [ ] **Observability** (needs-input) — only `console.log` today. Sentry / structured logging / error tracking would surface prod issues. Requires choosing a service (paid SaaS or self-hosted).
- [ ] **CHANGELOG.md** (needs-input) — no user-visible change log. Should we keep one? Format (Keep-a-Changelog, conventional commits, etc.)?
- [ ] **Post-deploy health check + rollback** (needs-input) — CI deploys via SSM but doesn't poll `/api/health` after to verify, nor roll back on failure. Bad deploys 500 prod until manual intervention. ~2-3h to wire properly.

---

## Deployment reference

Already shipped: ECR, EC2, RDS, ALB-less direct EC2 + nginx, Let's Encrypt with certbot webroot auto-renew, GitHub Actions → SSM SendCommand deploy, Google OAuth, Docker Compose prod. The required `/opt/pansori/.env` vars on EC2:

- `POSTGRES_PASSWORD`, `POSTGRES_USER` (`pansori`), `POSTGRES_DB` (`pansori_db`)
- `SESSION_SECRET` (64-char random)
- `ANTHROPIC_API_KEY`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`
- `FRONTEND_URL`, `ECR_REGISTRY`, `AWS_REGION`
