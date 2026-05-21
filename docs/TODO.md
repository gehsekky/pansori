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

- [x] **Multiplayer MVP — party-of-equals with per-PC ownership** (design locked + shipped 2026-05-21).
  All four PRs landed: PR 1 (data foundation), PR 2 (auth + turn enforcement),
  PR 3 (Socket.IO realtime push + WaitingForPlayer), PR 4 (invite link UX).
  Solo mode is unchanged — host owns every PC, no participant rejects, no
  waiting banner. Multi: friend opens the shared `?join=<token>` URL,
  becomes a participant, sees the full narrative chat via realtime
  broadcasts, but can't act until the host reassigns a PC via the
  assign-character endpoint (UI follow-up below). Three follow-ups
  remain before MP feels complete; tracked separately so the MVP itself
  reads as shipped.

  Follow-ups:
  - [x] **ParticipantsManager UI** (shipped — a97ce9c). Players & invites
    dialog now lists session_participants and gives the host a per-PC
    owner dropdown. Realtime Socket.IO 'state' broadcasts keep the
    dropdown values in sync. Realtime 'participants' (joined/left)
    listener still deferred — host has to close + reopen the dialog
    to see a freshly-joined friend.
  - [x] **Voluntary leave** (shipped — d42484e). Non-host participants
    have a "Leave session" button in the players dialog. Server auto-
    transfers PCs they owned to the host before removing them, so turn
    enforcement never encounters an orphan owner.
  - [x] **Race detection** (`turn_seq` column) — shipped 4d3b7bb.
    `game_sessions.turn_seq` bumps on every successful takeAction;
    clients send their last-known value with each action; server
    rejects with 409 on mismatch. useGame handles 409 by logging
    "out of sync" + resuming the session for fresh state.
  - [x] **Realtime participants refresh** — shipped 4d3b7bb.
    useGame listens for Socket.IO 'participants' events and bumps
    a participantsVersion counter; InviteDialog includes it in its
    fetch-participants useEffect deps so the list updates the
    moment a friend joins/leaves/has their PC reassigned.
      Each PC has exactly one human controller via `Character.owner_user_id`. Solo
      mode = host owns all PCs (no schema branch). 2+1 / 1+2 / 1+1+1 splits all
      fall out of the same row layout in `session_participants`. Every participant
      sees the full narrative (Socket.IO broadcast on every state change). Action
      buttons render only for the player whose PC is currently active; everyone
      else sees "Waiting for `<Name>` to finish their turn."

  **Design calls (locked)**
  - Invite UX: shareable link with a session-scoped `invite_token`.
  - No DM mode (yet) — strict party-of-equals. `session_participants.role`
    column carries a default `'pc'` value from day one so a `'dm'` role can
    be added later without a schema migration.
  - No voice — players use their own VC (Discord, etc.).

  **Invariants**
  - Each PR keeps singleplayer working. In solo mode every PC is owned by
    the host, so no guard ever rejects, no "waiting" banner ever renders.
  - Lead handoff (out-of-combat): only the current lead's owner can pass.
    No "claim the lead" escape hatch in MVP — add if AFK becomes a real
    problem in playtest.
  - Host disconnect = session paused (no actions accepted) until host
    reconnects. Simpler than promoting a new host.
  - Player disconnect = their PCs stay theirs; host can reassign via the
    participants modal if they don't return.
  - Inventory modal: viewing any PC's tab is allowed; Equip / Transfer /
    Drop only enabled for PCs you own.

  **Phases (~15-18h total, splittable into 4 PRs)**
  1. **Data foundation** (~4-5h). Migration: `session_participants(session_id,
user_id, joined_at, role text default 'pc')` table + index. Schema
     evolution: every PC's `owner_user_id` is set at character creation;
     `normalizeState` backfills missing values to `session.user_id` for
     existing sessions. Type: `Character.owner_user_id?: string` on the
     shared types. Specs: backfill correctness, default value on new
     PCs. **This PR is data-only — no behavior changes.**
  2. **Auth + turn enforcement** (~2h). Route guard: `/api/game/session/:id/*`
     checks the requesting user is a participant (was: owner). `takeAction`
     rejects when `req.user.id !== characters[active].owner_user_id` with
     a clean narrative. Reaction-routed actions check the eligible PC's
     owner instead of `active_character_id`. New endpoints:
     `POST /session/:id/assign-character` (host-only) and
     `POST /session/:id/join` (anyone with a valid invite token).
  3. **Realtime push** (~6-7h). After every successful `takeAction`,
     `io.to(\`session:${sessionId}\`).emit('state', result.newState)`.
Frontend `useGame`connects to the socket on session load and
replaces local state on each broadcast. Sequence number on the
broadcast envelope so out-of-order packets don't downgrade state.
Frontend: render`<WaitingForPlayer name={...} />` instead of the
     action pane when the active PC's owner isn't us.
  4. **Invite + participant management UX** (~3-4h). Generate per-session
     `invite_token`, build a shareable URL `?join=<token>`. Landing on
     that URL triggers login (if needed) → join → redirect to game.
     Participants modal (host only): list all participants + which PCs
     they own, allow host to reassign with a dropdown. "Rotate invite
     token" button for leaked links.

  **Deferred from MVP** (revisit after playtest)
  - Race detection (`turn_seq` column rejecting stale submissions when
    two participants race-click). Defer until it actually bites.
  - Chat MVP (`chat_messages` table + input + log). Players can use
    voice (Discord); chat is nice but not required for a working co-op.
  - Per-participant cosmetics (name colors in narrative attribution, etc.)
  - Spectator mode (a participant with no PC, observing only).
  - "Claim the lead" escape hatch for AFK lead owners.

### Architecture audit follow-ups

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
