# TODO

<!-- Sections without open items have been pruned. See git history for what's already shipped. -->

## End-goal target

Browser-based, D&D 5e SRD-compliant engine capable of running complex campaign scripts as a full RPG experience.

---

## Top 5 items to push toward the end goal

1. **Tutorial / onboarding** — the game drops new players into character creation with no introduction to the action choice loop, grid combat, or the inventory modal. A 2-room intro tutorial would help. Without this, new players can't actually pick the game up — gates "full RPG experience" from the end-goal sentence. (Promoted from #3 after AUTHORING.md shipped.)
2. **Combat narrative clarity (UX) — iterate** — foundation (CombatEvent + CombatLogPanel) shipped; condition+save event coverage now lands for Abjure Enemy, Fey Presence, Goading Attack (cfd120c+). Remaining work is visual polish (event grouping, color theming) and any further edge cases as new subclasses ship.
3. **Boss fight mechanics** — phase changes, lair actions, legendary actions (SRD p.221). Bigger bosses (later campaign modules) would benefit from multi-phase scripts. The Crypt Lord and Frost Acolyte are currently stat-block bosses with no phasing.
4. **Multiplayer + party chat** — see the engine/infra entry. Architectural audit confirmed the base is close; ~15-17h split across 4 PRs once we're ready to pick it up.
5. **Fourth campaign module** — once playtest data trickles in, a fourth themed campaign (coastal pirate town, desert ruin, planar city) would stress-test the format further now that Vale + Pines + Grove cover dungeon, mountain pass, and fey grove archetypes.

---

## 5e SRD remaining gaps

> **Edition alignment** — Pansori is hybrid: core combat resolution follows the 2024 SRD 5.2.1 (49 citations); class/subclass features fill in from the 2014 PHB (52 page citations from 2014 pagination) because the 2024 SRD doesn't cover subclasses and those rules are paid-PHB-only. Going forward we want to **lean fully into 2024**: rework class features (Rage progression, Wild Shape Beast Forms, 2024 Bardic Inspiration spend rules, etc.) to the 2024 PHB versions where they differ, and align Heroic Inspiration usage to the full 2024 spec (currently only granted-on-Nat-1, not the broader uses).
>
> **Scope of the 2024 lean** (deferred but tracked):
>
> - **Wild Shape** → 2024 "Beast Forms" mechanic (player keeps own stats + adds the form's profile) instead of the 2014 temp-HP-pool simplification we have today.
> - **Rage** → 2024 progression (improved damage bonus, fewer changes than expected — mostly the same).
> - **Bardic Inspiration** → 2024 expanded spend rules (ability checks, saves) in addition to attack rolls.
> - **Heroic Inspiration** → support spending on saves + ability checks (currently only attack-roll advantage).
> - **Weapon Masteries** (entirely new in 2024) — Vex, Topple, Push, Sap, etc. Major new system. Defer to a focused PR.
> - **Class feature changes per 2024 PHB** — Cleric Channel Divinity, Fighter Second Wind, Rogue Cunning Strike, etc. Each needs an audit pass.
>
> Single document tracking the per-feature 2014→2024 diffs should land in `docs/2024-MIGRATION.md` before any code change so the seam is reviewable. Estimated overall effort: 15-25h spread across several PRs.

### Real gameplay impact (worth doing)

- [x] **Heroic Inspiration (2024 PHB)** — granted automatically on a Nat-1 d20, spent via the `spend_inspiration` action for advantage on the next attack. CharStatsCard shows an ✦ INSP badge. Granted-on-Nat-1 model from the 2024 PHB; saves/ability-check advantage not yet wired (those rolls aren't player-mediated).
- [x] **Reactive spells / interrupt system** — all three SRD reactive spells ship: **Shield** (PHB p.275, BEFORE-damage negation in [AC, AC+4] window), **Hellish Rebuke** (PHB p.252, AFTER-damage counter-attack, Warlock-only), **Counterspell** (PHB p.234, BEFORE-spell-cast interrupt with auto-counter for ≤3rd-level slots and ability check for higher). Architecture: `pending_reaction` discriminated union with shield/hellish_rebuke/counterspell variants, `runEnemyTurns` helper pauses + yields control to the eligible PC, `resolve_reaction` handler applies the chosen outcome and re-enters the loop. Enemy spell-casting added to Enemy type (`spells`, `castChance`, `spellSaveDC`, `spellAttackBonus`); Frost Acolyte (Pines boss) tagged as a caster of `fire_bolt` (40% per turn) to validate the Counterspell path in playtest.
- [x] **Subclass packs for the remaining classes** (PHB Chapter 3). All 9 classes that had subclasses queued now ship at least one option each: Cleric (life, war), Sorcerer (draconic, wild_magic), Warlock (fiend, archfey), Druid (land, moon), Monk (open_hand, shadow), Barbarian (berserker, totem_warrior) — plus the originally-shipped Fighter (champion, battle_master), Rogue (thief, assassin), Wizard (evoker, abjurer), Ranger (hunter, beastmaster), Paladin (devotion, vengeance), Bard (lore, valor). Original entry follows:
  - **Druid** (L2) — Circle of the Land + Circle of the Moon
  - **Monk** (L3) — Way of the Open Hand + Way of Shadow
  - **Barbarian** (L3) — Path of the Berserker + Path of the Totem Warrior

  Each pack: subclass id added to `subclassChoices` map (gameEngine line ~1097), feature handlers in the appropriate sites (use_class_feature dispatch + passive checks like `char.subclass === 'fiend'`), and frontend `L1_SUBCLASS_OPTIONS` for the L1-required ones. Roughly 2-3h per pack including tests.

- [ ] **Multi-target spell allocation UX** — Magic Missile dart split, Eldritch Blast multi-beam (L5+). Damage math is correct on single target; missing: the optional dart/beam-distribution UI so the player can spread across multiple enemies.
- [x] **Reach weapon OA range** — `opportunityAttackTriggers` now takes an optional `attackerReachFt(entity)` lookup so callers can report 10-ft reach for Reach-weapon wielders. Default 5 ft preserved. Still no current loot has Reach, but infrastructure is ready (3 new tests in `gridEngine.spec.ts`).
- [ ] **Hide action — full DC tracking** (SRD p.11) — successful Stealth grants Invisible _and_ records the check total as the DC for others to find you. Enemies should be able to make passive Perception (or active Search) against that DC. Today we apply `invisible` for one attack's advantage; we don't track the DC or allow finding. Half-implemented (invisible reveals on attack already done).
- [ ] **Heavy-encumbrance skill-check disadvantage** — speed penalties are wired (`effectiveSpeed`), but heavy encumbrance is also supposed to give disadvantage on STR/DEX/CON checks, saves, and attacks. Not yet enforced.

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

- [x] **End-to-end Vale of Shadows playtest** — DONE at the validation-gate level. Coverage by layer: (a) all 3 quests in a single session — `src/backend/src/contexts/vale_of_shadows.spec.ts` drives takeAction through every quest step + final escape; (b) session resume — Playwright `session resume` test reloads mid-game and verifies state rehydrates; (c) faction price modifiers — wired into shop choice generation (gameEngine.ts ~line 1047) + 5 backend tests covering all rep tiers vs Aldric's 50 cr potion. Still loose-end: manual playtest of the polish layer (narrative variety, no-LLM mode UX), which is ongoing on prod.
- [ ] **Third campaign module** — once Vale is verified, a third module would stress-test the format further. Possible themes: coastal pirate town, desert ruin, planar city. Lower priority than the playtest gate.
- [ ] **Boss fight mechanics** — phase changes, lair actions, legendary actions (SRD p.221). The Crypt Lord and Frost Acolyte are currently stat-block bosses; bigger bosses would benefit from multi-phase scripts.

---

## UX & polish

- [ ] **Combat narrative clarity** — see top-5 item 1. Related backlog: narrative template format separating mechanics from prose.
- [~] **Grid map detail pass** — dead bodies render as a faded 💀 marker; same-name enemies get `#N` disambiguation on tooltips + tokens (e.g., "B1"/"B2"). Still TODO: difficult-terrain squares (rocks/snow tile), obstacles, party line-of-sight indicators, last-attacker arrows, AoE preview when hovering a spell choice.
- [~] **Narrative speaker clarity** — single-point fix at the `rawNarrative` step prepends `[CharName] ` to any `"You ..."` narrative in a multi-PC party (skipped for solo). Enemy attacks now also name the target PC explicitly (`"${char.name} takes ${hp} damage. ${char.name} is paralyzed!"`). Mid-line ambiguity in stitched-together narratives still remains — full per-line decomposition is the longer-term "narrative template format" backlog item.
- [x] **Placeholder lint** — `narrativePlaceholders.spec.ts` walks every `context.narratives` string for `{X}` tokens and confirms `gameEngine.ts` has a matching `.replace(...)` call. Three tests pass (sandbox / vale / pines).
- [ ] **Narrative template format** — separate dice rolls / damage numbers / HP changes from prose so the UI can render them differently while keeping immersion.
- [ ] **Tutorial / onboarding** — the game drops new players into character creation with no introduction to the action choice loop, grid combat, or the inventory modal. A 2-room intro tutorial would help.
- [ ] **Multi-window inventory** — deferred. Single modal serves the core use case.
- [ ] **Dynamic room/encounter image generation** — Google Imagen behind `IMAGE_PROVIDER` flag, off by default.
- [ ] **Sound effects** — ambient audio per location type; combat sound cues.
- [ ] **LLM narrative quality audit** — `llmProvider` enhances narratives; quality has not been systematically reviewed against the engine's mechanical output.

---

## Engine & infrastructure

- [ ] **Authoring documentation (`AUTHORING.md`)** — see top-5 item 5.
- [ ] **Save/state persistence across redeploys** — verify a mid-campaign session survives a backend redeploy. The state migration path on schema changes is untested.
- [ ] **Difficulty tuning from playtest data** — once playtests happen, capture damage/HP/encounter telemetry to inform tuning passes.
- [ ] **gameEngine.ts class refactor (deferred)** — `takeAction` is ~3700 lines with three handlers that dominate (`use_class_feature` ~800, `cast_spell` ~544, `attack` ~532). Refactor into an `ActionContext` class that owns the per-call mutable state (`state`, `char`, `narrative`, `usedInitiative`, etc.) and dispatches to handler files: `services/actions/castSpell.ts`, `actions/attack.ts`, etc. Each handler becomes a small file taking the context; the trunk shrinks to ~3500 lines. Cost: 4-6 hours across multiple commits, moderate regression risk (the 286-test suite is decent but doesn't cover every code path). Triggers to revisit: (a) a specific big-handler edit keeps grinding into context budget; (b) we want to add a feature touching multiple handlers (e.g. reactive spells / Counterspell from top-5); (c) we have a quiet maintenance day with no playtest-driven priorities.
- [ ] **Pre-commit hook (Husky + lint-staged)** — auto-run eslint + prettier on staged files before commit. Catches the class of bug where prettier-dirty code reaches CI and fails the build (we've burned ~3 commits this week on this). Setup is ~30 min: install `husky` + `lint-staged` as dev deps in the repo root, configure `package.json` lint-staged entry for `*.ts`/`*.tsx` (eslint --fix + prettier --write), `npx husky init` to wire `.husky/pre-commit`. Bypassable with `--no-verify` so it doesn't block urgent fixes. CI lint stays in place as the actual gate.

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

- [ ] **Body validation gaps** (autonomous-ready) — route handlers use `req.body as { ... }` type assertions with no runtime validation. Low risk in single-player but a real best-practice gap. Add Zod schemas at the route boundary; failure path returns 400 with the validation message. ~2h.
- [x] **Security headers** — `helmet({ contentSecurityPolicy: false })` middleware added to `src/backend/src/index.ts` (4bf73c1).
- [x] **Frontend error boundary** — top-level `<ErrorBoundary>` wraps `<App>` in `src/frontend/src/main.tsx` with a recovery UI (4bf73c1).
- [ ] **Strongly-typed req.user** (autonomous) — routes use `req.user!` non-null assertion (10 sites). A typed wrapper that narrows after the requireAuth middleware would remove the assertions cleanly. ~30 min.
- [x] **Update .env.example** — already current: Discord OAuth fields + `E2E_TEST_LOGIN_ENABLED` documented in `.env.example`.
- [x] **Rate-limit auth endpoints** — `express-rate-limit` middleware on `/api/auth/*` caps at 30 req/min/IP. `RateLimit-Policy` + `RateLimit` headers exposed to clients (draft-7 spec). Confirmed via curl on `/api/auth/google`.
- [ ] **Fix react-hooks/exhaustive-deps warnings** (autonomous, careful) — 5 lingering lint warnings in App.tsx, PartyPanel.tsx. Each marks a potential stale-closure bug. Need to check whether adding the dep would cause a re-render loop. ~30 min.
- [x] **Root-level `npm test`** — already wired: `package.json` `test` script runs `test:be && test:fe` (vitest in each workspace).
- [ ] **Socket.IO frontend client** (needs-input) — the server-side Socket.IO scaffolding already exists in `src/backend/src/index.ts` (room-join handler + per-session rooms), but no frontend client is wired and no state broadcasts happen. The Multiplayer TODO under-estimated this — half of the WebSocket scaffolding is already done. Open question: do we wire the client now (as prep for multiplayer) or wait until the participants-table item lands?
- [ ] **Frontend↔backend type drift** (needs-input) — types are duplicated by hand between `src/backend/src/types.ts` and `src/frontend/src/types.ts`. Could share via a single types package (workspace), or codegen, or just keep mirroring. Each approach has tradeoffs.
- [ ] **Observability** (needs-input) — only `console.log` today. Sentry / structured logging / error tracking would surface prod issues. Requires choosing a service (paid SaaS or self-hosted).
- [ ] **`npm audit` shows 6 moderate vulnerabilities** (needs-input) — most are transitive in dev tooling. `npm audit fix --force` might break things; reviewing the list one-by-one is the safer path.
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
