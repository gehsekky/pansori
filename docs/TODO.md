# TODO

<!-- Sections without open items have been pruned. See git history for what's already shipped. -->

## End-goal target

Browser-based, D&D 5e SRD-compliant engine capable of running complex campaign scripts as a full RPG experience.

---

## Top 5 items to push toward the end goal

1. **End-to-end Vale of Shadows playtest** — complete all 3 quests in a single session, verify campaign state survives session resume, verify faction price modifiers apply in shop. This is the validation gate: until a campaign plays start-to-finish without engine bugs, every other rule addition is unverified.
2. **Reactive spells / interrupt system** — Counterspell (PHB p.234), Shield (PHB p.275), Hellish Rebuke. Architectural: the turn engine needs a reaction-window hook so a defender can spend a reaction to interrupt the attacker's resolve. Without this, the iconic 5e arcane combat mechanics aren't representable.
3. **Inspiration (Heroic Inspiration in 2024)** — RAW free reroll on attack/save/check. Needs UX: grant (quest completion, roleplay, level-up), display (token on character card), spend (button on the relevant choice).
4. **Combat narrative clarity (UX)** — combat currently produces a long text log scroll mixing damage numbers, condition changes, save rolls, OA narrations. A "combat log panel" that separates **mechanical events** (rolls, damage, condition apply/remove) from **prose flavour** would dramatically improve readability and let new players follow what's happening. Hooks into the existing `narrative template format` backlog item.
5. **Authoring documentation (`AUTHORING.md`)** — for the engine to actually be "capable of running complex campaign scripts" by third parties (or future-you), the campaign format needs a written reference: required vs optional fields on `Context`/`CampaignData`, quest condition shape, rule engine consequences, loot/room/NPC patterns, gotchas. Should reference Vale + Whispering Pines as worked examples.

---

## 5e SRD remaining gaps

### Real gameplay impact (worth doing)

- [ ] **Inspiration UX** — see top-5 item 3.
- [ ] **Reactive spells / interrupt system** — see top-5 item 2.
- [ ] **Multi-target spell allocation UX** — Magic Missile dart split, Eldritch Blast multi-beam (L5+). Damage math is correct on single target; missing: the optional dart/beam-distribution UI so the player can spread across multiple enemies.
- [ ] **Reach weapon OA range** — `inRange()` honours `weapon.reach`, but `opportunityAttackTriggers` still hard-codes 5 ft. A glaive-wielding fighter currently can't OA at 10 ft. Also: no current loot has Reach, so this is infrastructure-only until a Reach weapon is authored.
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

- [ ] **End-to-end Vale of Shadows playtest** — see top-5 item 1.
- [ ] **Third campaign module** — once Vale is verified, a third module would stress-test the format further. Possible themes: coastal pirate town, desert ruin, planar city. Lower priority than the playtest gate.
- [ ] **Boss fight mechanics** — phase changes, lair actions, legendary actions (SRD p.221). The Crypt Lord and Frost Acolyte are currently stat-block bosses; bigger bosses would benefit from multi-phase scripts.

---

## UX & polish

- [ ] **Combat narrative clarity** — see top-5 item 4. Related backlog: narrative template format separating mechanics from prose.
- [ ] **Grid map detail pass** — surface more battlefield state on the grid. Dead bodies should render as a faded/greyed-out token (or a 💀 marker) so players can see where corpses lie even though they no longer block movement (fixed in commit `4a7f68f`). Other candidates: difficult-terrain squares (rocks/snow tile), obstacles, party line-of-sight indicators, last-attacker arrows, AoE preview when hovering a spell choice.
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

---

## Deployment reference

Already shipped: ECR, EC2, RDS, ALB-less direct EC2 + nginx, Let's Encrypt with certbot webroot auto-renew, GitHub Actions → SSM SendCommand deploy, Google OAuth, Docker Compose prod. The required `/opt/pansori/.env` vars on EC2:

- `POSTGRES_PASSWORD`, `POSTGRES_USER` (`pansori`), `POSTGRES_DB` (`pansori_db`)
- `SESSION_SECRET` (64-char random)
- `ANTHROPIC_API_KEY`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`
- `FRONTEND_URL`, `ECR_REGISTRY`, `AWS_REGION`
