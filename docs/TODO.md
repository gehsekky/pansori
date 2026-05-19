# TODO

<!-- Sections without open items have been pruned. See git history for what's already shipped. -->

## End-goal target

Browser-based, D&D 5e SRD-compliant engine capable of running complex campaign scripts as a full RPG experience.

---

## Top 5 — completing the 5.5e engine [✓ ALL SHIPPED]

> Goal: full 2024 PHB / SRD 5.2.1 mechanics coverage. All 5 items below
> landed in commits `ed841a1..1dfca3f`. Combat resolution + class
> features + multi-target spells are now on the 2024 spec.

1. [x] **Weapon Masteries — all 9 + per-class slots** (`ed841a1`). Topple / Push / Sap / Slow were already in; Cleave / Graze / Flex / Nick added. Vex was implemented earlier. Per-class slot count via `SRD_WEAPON_MASTERY_SLOTS` (Fighter 3 / Barb-Pal-Rang 2 / Rog 1).
2. [x] **2024 class feature audit — Cleric / Fighter / Monk** (`d17f647` + `e36fb63`). Cleric: Divine Spark + Turn Undead (bonus action) + Sear Undead L5. Fighter: Second Wind multi-use (2/3/4 at L1/L4/L10). Monk: Patient Defense + free 1/turn Step of the Wind + Stunning Strike 1/turn cap + 2024 Martial Arts die progression (d6/d8/d10/d12).
3. [x] **Heroic Inspiration on any d20** (`db312c7`). `inspiration_pending` now applies to ability checks too (saves were already wired). `spend_inspiration` choice surfaces in + out of combat.
4. [x] **Hide action — full DC tracking** (`4d10043`). Successful Hide stores `hide_dc = stealth_total`. Enemies roll passive Perception (10 + WIS mod) vs `hide_dc` when targeting the hider; on detect, invisible is removed and DC cleared. Attacking also clears both.
5. [x] **Multi-target spell allocation** (`1dfca3f`). `cast_spell.targetEnemyIds?: string[]` carries one entry per dart/beam. Choice gen emits focus-fire + spread variants for Magic Missile (per slot) and Eldritch Blast (L5+). Each shot resolves independently (per-beam attack roll for EB, per-dart auto-hit for MM).

The 5.5e RAW gap list (relative to the 2024 PHB + SRD 5.2.1) is now down
to the small-impact items below.

---

## 5e SRD remaining gaps

> **Edition alignment** — Pansori targets 2024 PHB / SRD 5.2.1. Most of the lift is done: 2014→2024 migration shipped for Wild Shape (Beast Forms), Rage progression, Cunning Strike, and the reactive-spell window. Remaining 2024 work is captured in the Top 5 above (weapon masteries, class feature audit, inspiration spend rules) and the gameplay-impact items below.

### Real gameplay impact (worth doing)

- [x] **Heroic Inspiration (Nat-1 grant)** — auto-granted on a Nat-1 d20, spent via `spend_inspiration` for advantage on the *next attack*. Saves/ability-check spend is still missing (see top-5 #3).
- [x] **Reactive spells / interrupt system** — Shield, Hellish Rebuke, Counterspell all ship. `pending_reaction` discriminated union pauses `runEnemyTurns` and yields control to the eligible PC. Enemy spell-casting wired (Frost Acolyte casts fire_bolt @ 40% to exercise Counterspell).
- [x] **Subclass packs (all 12 classes)** — every class ships ≥1 subclass. Cleric (life, war), Fighter (champion, battle_master), Rogue (thief, assassin), Wizard (evoker, abjurer), Ranger (hunter, beastmaster), Paladin (devotion, vengeance), Bard (lore, valor), Sorcerer (draconic, wild_magic), Warlock (fiend, archfey), Druid (land, moon), Monk (open_hand, shadow), Barbarian (berserker, totem_warrior).
- [x] **Wild Shape — 2024 Beast Forms** — replaced the 2014 temp-HP-pool. Beast Forms catalog (`contexts/srd/beast_forms.ts`) with 6 forms; Druid keeps own stats + adds the form's attack/AC/speed profile (5aa954b).
- [x] **Rage — 2024 progression** — uses-per-rest table + 2024 damage scaling (97a22ad).
- [x] **Cunning Strike (2024 Rogue L5)** — trip / poison / withdraw / disarm options (9ebcac4).
- [x] **Reach weapon OA range** — `opportunityAttackTriggers` honours a 10-ft reach lookup; default 5 ft preserved.
- [x] **Weapon Masteries — all 9 + per-class slots** (`ed841a1`). Slot counts in `SRD_WEAPON_MASTERY_SLOTS`.
- [x] **Multi-target spell allocation** (`1dfca3f`). Magic Missile + Eldritch Blast focus-fire/spread choices.
- [x] **Hide action — full DC tracking** (`4d10043`).
- [x] **2024 class feature audit — Cleric / Fighter / Monk** (`d17f647`, `e36fb63`).
- [x] **Inspiration spend on any d20** (`db312c7`).
- [ ] **Heavy-encumbrance skill-check disadvantage** — speed penalties wired via `effectiveSpeed`; STR/DEX/CON checks + saves + attacks still don't see disadvantage.
- [ ] **Bardic Inspiration spend on any d20** — saves already wired; ability-check path still skipped. Smaller scope than Heroic Inspiration since it only matters for Bard allies.
- [ ] **Enemy Search action vs Hide DC** — passive Perception is checked on target-select today; a dedicated Search action would let enemies actively roll. Limited by enemy AI being "nearest PC = target" — useful when AI grows.
- [ ] **Tactical Master + Studied Attacks (Fighter L9 / L13)** — left out of the L1-focused class audit. Wire when level-up actually reaches L9/L13.

### No-current-content (defer)

- [ ] **Frightened — movement restriction** (SRD p.182) — the frightened creature cannot willingly move closer to the source of its fear. Needs a fear-source id on the condition. Currently only enemies become frightened (Vengeance Paladin's Abjure Enemy), and enemies don't grid-move, so this has no practical effect today.
- [ ] **Heavy weapon disadvantage for Small creatures** (SRD p.90) — no Small races on either campaign's character sheet. Add when a Small race appears.
- [ ] **Charmed: charmer's social advantage** (SRD p.181) — no spell currently sets `charmer_id`. Wire it from Charm Person when a charm-effect spell starts appearing in NPC dialogue.
- [ ] **Costly material component consumption** — Identify's 100 gp pearl, Resurrection's 1000 gp diamond, etc. No spell currently consumes material components.
- [ ] **Group ability checks** (SRD p.6) — half-the-party-succeeds = group succeeds. Could fold into the existing sneak action when a party rolls together.

### Architectural blockers

- [ ] **Climbing & Crawling movement cost** — needs a "movement mode" concept. Skip until verticality.
- [ ] **Jumping** — Long jump = STR ft, high jump = 3 + STR mod ft. Same verticality blocker.

---

## Content & playtest

- [x] **End-to-end Vale of Shadows playtest** — DONE at the validation-gate level. Coverage by layer: (a) all 3 quests in a single session — `src/backend/src/contexts/vale_of_shadows.spec.ts` drives takeAction through every quest step + final escape; (b) session resume — Playwright `session resume` test reloads mid-game and verifies state rehydrates; (c) faction price modifiers — wired into shop choice generation + 5 backend tests covering all rep tiers. Still loose-end: manual playtest of the polish layer (narrative variety, no-LLM mode UX), which is ongoing on prod.
- [x] **Campaign modules — 3 shipped** — Vale of Shadows (dungeon/heist), Whispering Pines (mountain pass/cult), Grove of Thorns (fey/Druid showcase). A 4th would broaden archetypes but isn't blocking.
- [x] **Boss fight phases** — HP-threshold phase transitions shipped (b330783). `EnemyTemplate.phases: BossPhase[]` with `set_multiattack`/`set_damage`/`set_to_hit`/`set_ac`/`set_on_hit_effect`/`add_resistance`/`heal` effects. Crypt Lord (50% rage, 25% phylactery-heal) and Frost Acolyte (60% ice armor, 30% frostbinding) wired up. Frontend renders `phase_transition` events.
- [ ] **Boss fight follow-ups** — legendary actions + lair actions (SRD p.221) are still separate systems we haven't tackled. Defer until a campaign needs them.
- [ ] **Fourth campaign module (opportunistic)** — coastal pirate town, desert ruin, planar city, etc. Stress-tests the format further. Not on the critical path.

---

## UX & polish

- [x] **3-zone UI redesign + a11y baseline** — PartyRail (left) + narrative/choices (center) + tabbed ContextPanel (right). Dialog primitive with focus trap + ARIA; live regions on narrative + combat log; landmarks; heading hierarchy; focus-visible; theme contrast bumped to ≥4.5:1. Four commits (`9230516..0f6f52c`).
- [x] **Combat narrative clarity foundation** — `CombatEvent` + CombatLogPanel ship; condition + save events for Abjure Enemy, Fey Presence, Goading Attack; `phase_transition` event for boss phases. Visual polish (event grouping, color theming) deferred until a playtest tells us it's needed.
- [~] **Grid map detail pass** — dead bodies render as faded 💀; same-name enemies get `#N` disambiguation; AoE preview tints when hovering a spell choice; cells carry rich `aria-label`. Still TODO: difficult-terrain squares (rocks/snow tile), obstacles, party LoS indicators, last-attacker arrows.
- [~] **Narrative speaker clarity** — single-point fix at the `rawNarrative` step prepends `[CharName] ` for multi-PC parties; enemy attacks name the target PC explicitly. Mid-line ambiguity in stitched narratives still remains — see narrative template format below.
- [x] **Placeholder lint** — `narrativePlaceholders.spec.ts` walks every `context.narratives` string for `{X}` tokens and confirms a matching `.replace(...)` exists.
- [ ] **Narrative template format** — separate dice rolls / damage numbers / HP changes from prose so the UI can render them differently while keeping immersion.
- [ ] **Tutorial / onboarding** — 2-room intro covering the action choice loop, grid combat, inventory modal. New players have nowhere to learn the controls today.
- [ ] **Dynamic room/encounter image generation** — Google Imagen behind `IMAGE_PROVIDER` flag, off by default.
- [ ] **Sound effects** — ambient audio per location type; combat sound cues.
- [ ] **LLM narrative quality audit** — `llmProvider` enhances narratives; quality has not been systematically reviewed against the engine's mechanical output.

---

## Engine & infrastructure

- [x] **Authoring documentation (`AUTHORING.md`)** — shipped (b2705fc). Covers the campaign context format end-to-end.
- [ ] **Save/state persistence across redeploys** — verify a mid-campaign session survives a backend redeploy. The state migration path on schema changes is untested.
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

- [x] **Playwright E2E test** — three tests in `tests/e2e/vale-smoke.spec.ts`: (a) Vale smoke covers login → BEGIN MISSION → narrative renders; (b) session resume reloads mid-session and verifies state rehydrates; (c) sandbox combat drives the choice loop until an Attack action surfaces. `data-testid` attrs on key UI elements + `data-action-type` on choice buttons. Auth bypass `/api/auth/test-login` double-gated. Combat test has `retries: 2` for procgen variance. Wired into CI: `e2e` job in `.github/workflows/deploy.yml` runs after the unit-test job and gates `build-and-deploy`. Failure uploads `playwright-report/` + `test-results/` as artifacts and dumps backend/frontend/postgres compose logs.

### Architecture audit findings (2026-05-19)

Captured during the autonomous-mode audit. Items marked **autonomous** can be picked up without user input; **needs-input** requires a design call.

- [x] **Body validation gaps** — Zod schemas now gate every POST body that takes JSON: `/api/auth/test-login`, `/api/game/session/new`, `/equip`, `/transfer`, `/drop`, `/action`. Schemas live in `src/backend/src/routes/schemas.ts`; failures return `{ error, issues: [{path, message}] }` with 400. `StructuredAction` is intentionally loose-typed at the route boundary (the engine's exhaustive switch covers depth).
- [x] **Security headers** — `helmet({ contentSecurityPolicy: false })` middleware added to `src/backend/src/index.ts` (4bf73c1).
- [x] **Frontend error boundary** — top-level `<ErrorBoundary>` wraps `<App>` in `src/frontend/src/main.tsx` with a recovery UI (4bf73c1).
- [ ] **Strongly-typed req.user** (autonomous) — routes use `req.user!` non-null assertion (10 sites). A typed wrapper that narrows after the requireAuth middleware would remove the assertions cleanly. ~30 min.
- [x] **Update .env.example** — already current: Discord OAuth fields + `E2E_TEST_LOGIN_ENABLED` documented in `.env.example`.
- [x] **Rate-limit auth endpoints** — `express-rate-limit` middleware on `/api/auth/*` caps at 30 req/min/IP. `RateLimit-Policy` + `RateLimit` headers exposed to clients (draft-7 spec). Confirmed via curl on `/api/auth/google`.
- [ ] **Fix react-hooks/exhaustive-deps warnings** (autonomous, careful) — 3 lingering lint warnings in App.tsx (PartyPanel was deleted in the UI redesign so that one's gone). Each marks a potential stale-closure bug. Need to check whether adding the dep would cause a re-render loop. ~30 min.
- [x] **Root-level `npm test`** — already wired: `package.json` `test` script runs `test:be && test:fe` (vitest in each workspace).
- [ ] **Socket.IO frontend client** (needs-input) — the server-side Socket.IO scaffolding already exists in `src/backend/src/index.ts` (room-join handler + per-session rooms), but no frontend client is wired and no state broadcasts happen. The Multiplayer TODO under-estimated this — half of the WebSocket scaffolding is already done. Open question: do we wire the client now (as prep for multiplayer) or wait until the participants-table item lands?
- [ ] **Frontend↔backend type drift** (needs-input) — types are duplicated by hand between `src/backend/src/types.ts` and `src/frontend/src/types.ts`. Could share via a single types package (workspace), or codegen, or just keep mirroring. Each approach has tradeoffs.
- [ ] **Observability** (needs-input) — only `console.log` today. Sentry / structured logging / error tracking would surface prod issues. Requires choosing a service (paid SaaS or self-hosted).
- [x] **`npm audit` clean across all three workspaces** — root, backend, frontend all return `found 0 vulnerabilities`. Two fixes: (a) `ws ^8.20.1` override at root + backend addresses the socket.io transitive uninitialized-memory disclosure (GHSA-58qx-3vcg-4xpx); (b) vite bumped to ^7.3.3 + `esbuild ^0.25.0` override resolves the dev-server SSRF (GHSA-67mh-4wv8-2f99). Per-workspace lockfiles regenerated so Docker `npm install` lands on the patched versions.
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
