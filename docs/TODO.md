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

- [ ] **Boss legendary + lair actions — wire to actual bosses** — engine scaffolding (`EnemyTemplate.legendary_actions` + per-round point pool refreshing on the legendary's own turn; `EnemyTemplate.lair_actions` firing on round-wrap as AoE save-for-half damage) is in place with test coverage. Effects shipped: `extra_attack` (legendary) and `aoe_save_damage` (lair). Not wired to any current boss because per-encounter balance was tuned without them. A future boss (fourth-campaign showcase, or after Crypt Lord re-balance settles) is a better fit. More effect kinds (terrain shift, debuff aura, summon, multi-attack legendary) can be added as content demands them.
- [ ] **Party line-of-sight indicators on the grid** — Phase 2 of the grid-detail pass needs Bresenham LoS that respects the obstacles we just shipped. Visual: ghost-tint cells the active PC can't see; suppress enemy tokens in those cells beyond the existing `dark`-illum fog. ~1 day. Was in phase-2 but deferred to its own commit since it needs LoS-blocking through obstacles.
- [ ] **Fourth campaign module (opportunistic)** — coastal pirate town, desert ruin, planar city, etc. Stress-tests the format further. Not on the critical path.

---

## Type-share infrastructure

- [ ] **Phase 3 of type-share** (remaining workspace-local: Character, GameState, Seed, Trap, Room, OnHitEffect, BossPhase, EnemyTemplate, Enemy, Spell, BeastForm, InventoryItem, TurnActions, DeathSaves, Context/FrontendContext, Location, GameRule, RuleFacts, CampaignFacts) — these either depend on BE-only types that would cascade-share (Seed → Enemy → BossPhase → OnHitEffect; Location → Room → Trap), have FE-vs-BE structural differences requiring reconciliation (Character / GameState — FE has slim versions, BE has rich), or are intentionally separate (FrontendContext vs Context). Defer until there's a concrete reason to share each one.

---

## UX & polish

- [ ] **Tutorial / onboarding** (deferred-to-launch per user instruction). 2-room intro covering the action choice loop, grid combat, inventory modal. New players have nowhere to learn the controls today. Held until the engine surface stabilizes near launch — building this now means rebuilding every time a UI surface changes.
- [ ] **Dynamic room/encounter image generation** — Google Imagen behind `IMAGE_PROVIDER` flag, off by default.
- [ ] **Sound effects** — ambient audio per location type; combat sound cues.
- [ ] **LLM enhancement cost guards** (deferred-to-launch per user instruction). Per-session token budget, short-event skip threshold, `LLM_ENHANCEMENT=off` kill switch. Held until launch volume justifies it.

---

## Engine & infrastructure

- [ ] **Save/state persistence across redeploys (manual verify)** — `normalizeState` specs assert that a JSONB state row missing post-rollout fields loads cleanly and survives a `takeAction` call without crashing. Still TODO: actual end-to-end manual exercise — start a session, redeploy the backend container, resume the session, confirm parity. ~30 min.
- [ ] **Difficulty tuning from playtest data** — once playtests happen, capture damage/HP/encounter telemetry to inform tuning passes. Real fights are starting to expose where the math is off (Crypt Lord TPK was the first big signal). ~3-4h to wire telemetry; ongoing to tune.
- [ ] **gameEngine.ts class refactor (deferred)** — `takeAction` is ~3900 lines with three handlers that dominate (`use_class_feature` ~800, `cast_spell` ~544, `attack` ~532). Refactor into an `ActionContext` class that dispatches to handler files (`services/actions/castSpell.ts`, etc.). Moderate regression risk. Triggers to revisit: (a) big-handler edits grind into context budget; (b) a feature touches multiple handlers; (c) a quiet maintenance day.
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

## Accessibility audit (2026-05-21)

> Code-survey pass focused on WCAG 2.1 AA. The engine is already strong
> on focus-visible outlines (global `:focus-visible` rule), aria-labels
> on icon-only buttons (MoveDPad/SpellBar/CombatActionBar), tablist
> semantics + arrow-key navigation on ContextPanel, focus-trap +
> Esc-close on Dialog, aria-live polite on the combat narrative, and
> proper `<button>` elements for clickable party tiles. Items below are
> the gaps the survey found; manual screen-reader + keyboard-only
> validation is the next step.

### Shipped 2026-05-21
- [x] **Skip-to-main link** — `<a href="#main-content">` becomes visible-on-focus, lands keyboard users past the header on `<main id="main-content">`. WCAG 2.4.1.
- [x] **CharScreen label htmlFor** — name / class / subclass / species / background fields now use `htmlFor` + matching `id={\`char-${idx}-X\`}` so SR announces the field name on focus.
- [x] **Player avatar meaningful alt** — PartyRail / InventoryModal / SessionScreen portraits now read `"${name}'s portrait"` (was `alt=""`). User's own header avatar stays `alt=""` since the name is in adjacent text.
- [x] **`.choiceBtnSeen` contrast** — was `opacity:0.45` + `--t-dim` ≈ 1.86:1 (WCAG AA fail). Now `opacity:0.7` + `--t-mid` ≈ 4.75:1 (passes). Hover restores full color.
- [x] **MoveDPad keyboard navigation** — WAI-ARIA Composite Widget pattern: roving tabindex (one focused cell at a time), arrow keys move focus spatially, arrow keys skip past disabled cells. 3 spec assertions cover the behavior.

### Remaining
- [ ] **fieldset/legend on grouped form controls** — CharScreen's `PORTRAIT` and `ABILITY SCORES` "labels" are group descriptors (govern multiple buttons) but use plain `<label>` without an `htmlFor`. The right HTML is `<fieldset><legend>` (or `<div role="group" aria-labelledby="...">`). Larger refactor than the simple-label htmlFor pass already shipped.
- [ ] **HP / condition live-region updates** — the combat narrative has `aria-live="polite"` so SR users hear what happened, but HP-bar fills and condition badges update silently. An off-screen `aria-live` summary of the most recent delta (`Fighter HP 18, conditions: frightened`) would help SR users track state without re-listening to the full narrative. Needs UX tuning on when to announce vs. when to stay quiet.
- [ ] **Manual SR + keyboard-only validation** — code survey done; next step is exercising the app with VoiceOver / NVDA / JAWS and Tab-only to find the things the code review missed.

---

## Security audit (2026-05-21)

> Code-survey pass focused on OWASP Top 10 and multiplayer-readiness.
> Solid foundation already: helmet headers, CORS pinned to FRONTEND_URL,
> Postgres-backed sessions with httpOnly + secure + sameSite cookies,
> rate-limit on `/api/auth/*`, `trust proxy 1` for nginx, all DB queries
> parameterized ($1/$2 placeholders), passport+Google OAuth. The single-
> tenant model masks several issues that will bite when session_participants
> lands.

### Shipped 2026-05-21
- [x] **SESSION_SECRET fail-fast** — was `?? 'change-me-in-production'`. Now boot throws if env is missing — refuses to accept requests against a known-secret session signing key.
- [x] **Rate limit on `/api/game/*`** — 120 req/min `gameLimiter` sits after `requireAuth` and before `gameRouter`. Throttles takeAction spam without affecting normal play.
- [x] **Socket.IO `join-session` ownership check** — session middleware is now shared between Express and `io.engine.use(...)`. Before joining a session's room, we read `req.session.passport.user` and run a `SELECT 1 FROM game_sessions WHERE id = $1 AND user_id = $2`. Single-tenant today; will broaden via `session_participants` when multiplayer lands.

### Remaining
- [ ] **No CSRF protection on state-changing endpoints** — cookies use `sameSite: 'none'` in prod (required for cross-origin SPA + API), so the browser sends the session cookie on cross-origin POSTs. A malicious site could trigger `POST /api/game/session/:id/action` via a logged-in user. Options: (a) tighten to `sameSite: 'lax'` if cross-origin isn't actually needed — confirm the prod FE + API domain layout; (b) add a double-submit CSRF token; (c) require a custom header like `X-Requested-With: XMLHttpRequest` (lightweight but defense-in-depth only). **Needs design call before implementation.**
- [ ] **Multiplayer: session ownership + turn enforcement** (already in main TODO) — `game_sessions.user_id` is single-tenant; `takeAction` doesn't verify `req.user.id === characters[active].owner_user_id`. Documented above under Multiplayer; flagged here so the security pass references it.
- [ ] **`npm audit` in CI** — no automated dependency-vuln check. Add a job to PR builds that fails on `high` or `critical`. ~15 min YAML edit; ongoing maintenance to triage findings.
- [ ] **CSP for any future HTML-serving paths** — helmet's CSP is disabled (`contentSecurityPolicy: false`) because the API doesn't return HTML. If we ever serve uploaded files or generated images directly, re-enable CSP with a tight `script-src 'self'` policy.
- [ ] **Session fixation protection** — `express-session` doesn't rotate the session id on login. Passport regenerates by default but worth confirming. Tested by logging in, copying the cookie, logging out, logging in again — should produce a new cookie.

---

## Deployment reference

Already shipped: ECR, EC2, RDS, ALB-less direct EC2 + nginx, Let's Encrypt with certbot webroot auto-renew, GitHub Actions → SSM SendCommand deploy, Google OAuth, Docker Compose prod. The required `/opt/pansori/.env` vars on EC2:

- `POSTGRES_PASSWORD`, `POSTGRES_USER` (`pansori`), `POSTGRES_DB` (`pansori_db`)
- `SESSION_SECRET` (64-char random)
- `ANTHROPIC_API_KEY`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`
- `FRONTEND_URL`, `ECR_REGISTRY`, `AWS_REGION`
