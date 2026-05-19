# TODO

<!-- Sections without open items have been pruned. See git history for what's already shipped. -->

## End-goal target

Browser-based, D&D 5e SRD-compliant engine capable of running complex campaign scripts as a full RPG experience.

---

## Top 5 items to push toward the end goal

1. **Reactive spells — Counterspell + Hellish Rebuke** — the reaction-window architecture is in place (Shield ships as proof). Counterspell needs an enemy spell-cast detection point; Hellish Rebuke needs a post-damage trigger for Warlock targets. Both plug into `pending_reaction` the same way Shield does. (Promoted from #2 after Vale playtest gate closed.)
2. **Subclass packs for the remaining 3 classes** — Druid (L2), Monk + Barbarian (L3). Cleric, Sorcerer, Warlock are shipped. Pattern is well-established; ~2-3h per pack.
3. **Combat narrative clarity (UX)** — combat currently produces a long text log scroll mixing damage numbers, condition changes, save rolls, OA narrations. A "combat log panel" that separates **mechanical events** (rolls, damage, condition apply/remove) from **prose flavour** would dramatically improve readability and let new players follow what's happening. Hooks into the existing `narrative template format` backlog item.
4. **Authoring documentation (`AUTHORING.md`)** — for the engine to actually be "capable of running complex campaign scripts" by third parties (or future-you), the campaign format needs a written reference: required vs optional fields on `Context`/`CampaignData`, quest condition shape, rule engine consequences, loot/room/NPC patterns, gotchas. Should reference Vale + Whispering Pines as worked examples.
5. **Tutorial / onboarding** — the game drops new players into character creation with no introduction to the action choice loop, grid combat, or the inventory modal. A 2-room intro tutorial would help. Without this, new players can't actually pick the game up — gates "full RPG experience" from the end-goal sentence.

---

## 5e SRD remaining gaps

### Real gameplay impact (worth doing)

- [x] **Heroic Inspiration (2024 PHB)** — granted automatically on a Nat-1 d20, spent via the `spend_inspiration` action for advantage on the next attack. CharStatsCard shows an ✦ INSP badge. Granted-on-Nat-1 model from the 2024 PHB; saves/ability-check advantage not yet wired (those rolls aren't player-mediated).
- [~] **Reactive spells / interrupt system** — architecture shipped. Enemy-turn loop extracted to `runEnemyTurns` helper supporting mid-loop pause via `pending_reaction` state. Shield (PHB p.275) now triggers when an enemy hit lands in `[AC, AC+4]` on a defender with Shield prepared + L1 slot + unused reaction; choices list collapses to accept/decline; accept consumes slot + reaction + bumps AC by 5 for the round (decremented by `tickConditions` on expiry). Still TODO under this item: **Counterspell** (different trigger — needs spell-cast detection on enemy casters) and **Hellish Rebuke** (Warlock-only, post-damage trigger) — both plug into the now-existing hook.
- [~] **Subclass packs for the remaining classes** (PHB Chapter 3). The L1 picker UI is in place. Shipped so far: Cleric (life, war), Sorcerer (draconic, wild_magic), Warlock (fiend, archfey). Still need:
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

- [ ] **Combat narrative clarity** — see top-5 item 4. Related backlog: narrative template format separating mechanics from prose.
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

---

## Deployment reference

Already shipped: ECR, EC2, RDS, ALB-less direct EC2 + nginx, Let's Encrypt with certbot webroot auto-renew, GitHub Actions → SSM SendCommand deploy, Google OAuth, Docker Compose prod. The required `/opt/pansori/.env` vars on EC2:

- `POSTGRES_PASSWORD`, `POSTGRES_USER` (`pansori`), `POSTGRES_DB` (`pansori_db`)
- `SESSION_SECRET` (64-char random)
- `ANTHROPIC_API_KEY`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`
- `FRONTEND_URL`, `ECR_REGISTRY`, `AWS_REGION`
