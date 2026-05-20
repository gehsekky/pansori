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
