# Pansori — The Sky Is Falling, Act II

## What This Is

Pansori is a browser-based, strict **SRD 5.2.1** tabletop-RPG engine (React SPA +
Express/TypeScript + PostgreSQL) that models full TTRPG campaign mechanics —
tactical grid combat, spellcasting, class/subclass features, multiclassing,
conditions, dialogue gating — for both roguelikes and authored campaigns. Its
flagship campaign, **The Sky Is Falling** (setting: the continent of Utgard), is a
sci-fi-flavored, 100%-SRD-mechanics story told across four Acts.

This milestone builds **Act II — "Decoding the Coordinates"** (target level 5) to
the same fidelity as the already-shipped Act I: a playable, branching act on new
Valerion-heartland geography, authored as a version-controlled campaign fixture,
plus the one headline engine feature the story needs — a **general mid-campaign
level-up** system.

## Core Value

Act II is **playable end-to-end at Act-I fidelity** — a player who finished Act I
can carry their party into Act II, level up for real (L4→L5), and play the five
main quests through to the "Sky Splits" handoff stub, all on strict-SRD mechanics.

## Requirements

### Validated

<!-- Inferred from the existing codebase (brownfield) and the shipped Act I. These are the engine + content already relied upon. -->

- ✓ Three-tier engine: React SPA frontend, Express/TypeScript backend, PostgreSQL — existing
- ✓ Tactical grid combat: pathfinding, line-of-sight, cover, terrain, light/darkness (`gridEngine`) — existing
- ✓ Pure rules engine: d20 attack/save/skill resolution, AC, proficiency, conditions (`rulesEngine`) — existing
- ✓ 50+ action handlers dispatched via `StructuredAction` → `takeAction` → consequence loop — existing
- ✓ Full SRD 5.2.1 data: ~340 spells, 328 monsters, items, 12 subclasses, 9 species, 6 origin feats — existing
- ✓ Multiplayer sessions: WebSocket sync, per-player turn sequences, optimistic concurrency (`turn_seq`) — existing
- ✓ Character creation incl. subclass/feat/spell selection at creation, build-to-level (Act I builds party to L3) — existing
- ✓ Campaign authoring primitives: Acts → Quests/Steps → Regions/Towns/Rooms → NPC dialogue trees → SRD encounters → loot & flags — existing
- ✓ Dialogue gating + campaign-rule evaluation via json-rules-engine over `CampaignFacts` — existing
- ✓ Anti-magic suppression system (`isSpellSuppressed` / `suppressesMagic`) — drives Antimagic Field today, the Act IV field later — existing
- ✓ The Sky Is Falling **Act I** complete: Sunder-Carr region, Silverford town, spine NPCs, `q_case_107`, marsh reskin roster, world-time clock, side quests, both terminal endings (truce / war) — existing (`npm run seed:sky`)
- ✓ Campaign fixture pattern: code-authored sections seeded through the same `putCampaignSection` pipeline the creator UI uses, so the campaign stays editable — existing

### Active

<!-- This milestone. Hypotheses until shipped and validated. -->

**Act II content — "Decoding the Coordinates" (full Act-I depth)**

- [ ] New **Valerion-heartland Region + capital Town** (court, Grand Library, high-society ball venues) plus local Rooms for the Weaver-cell raid
- [ ] Five main quests authored end-to-end: `q_act2_open` (The Faded Crest), `q_library` (Mythic Geometry), `q_fuel_cell` (The Heart of the Saint), `q_jarek` (The Inquisitor's Suspicion), `q_quentin_thread` (Old Money)
- [ ] Full dialogue trees for new NPCs — Lady Elara Aurellion, High Inquisitor Jarek, Quentin Vance — and returning Lucian Vane
- [ ] Act II reskin enemy roster as SRD campaign-clones: Weaver Adept (Cult Fanatic), Weaver Magus (Mage), Subverted Troopers (Veteran/Guard)
- [ ] The `q_library` decode beat (skill/puzzle) writing `coords_decoded` and paying off the `martha_hint` thread from Act I
- [ ] The fuel-cell **race as a narrative device** — resolved by quest-step ordering / dialogue / skill-gates, with `relic_fuel_cell = party | sect` as the stakes (no timer/competition engine mechanic)
- [ ] Side-quest texture giving the capital the same lived-in feel Silverford has
- [ ] Act I → Act II carry: branch at Act II's opening beats, then converge to a shared spine; Act I **war-state is flavor-only** in Act II (unlocks a few conversation options; no substantive mechanical/faction impact this cycle)
- [ ] Act II ends on a "To be continued…" stub (Act III handoff), branched so the world the party made is acknowledged
- [ ] Act II advances on `q_fuel_cell` completion + `coords_decoded` (per STORY.md Part 12)

**Engine — general mid-campaign level-up**

- [ ] Level-up applied mid-campaign (not only at creation): HP, spell slots, spells-on-level-gain, subclass features, for the party between Act I and Act II (L4→L5)
- [ ] Built **general** (engine-wide: any class/subclass, any level transition), not scoped only to Act II's party
- [ ] **Simple, guided UX** — sensible auto-suggested choices on level gain; the player should not have to min/max yet (deep optimization surface deferred)

### Out of Scope

<!-- Explicit boundaries with reasoning. -->

- Acts III and IV content — this cycle is Act II only; re-evaluate after it ships
- A fuel-cell race timer / competition engine primitive — the race is narrative-only by decision
- Deep level-up optimization UX (min/max-heavy spell/ASI surface) — guided/auto is enough for now; revisit near launch
- Substantive Act I war-state consequences in Act II (faction-rep divergence, alternate spine) — flavor-only this cycle; can deepen later
- Any PHB-only content (subclasses, feats, species, spells) — strict-SRD scope, non-negotiable (see CLAUDE.md / LEGAL.md)
- The deferred Act I time-block `advance_clock` consequence — Act II uses no clock; not needed here
- Kael-Gorgoroth custom phased boss and the Act IV anti-magic guerrilla reframe — Act IV work

## Context

- **Source of truth for the story:** `docs/STORY.md` — the master campaign blueprint. Part 12 sketches Act II at quest granularity (the spec this milestone fleshes to Act-I depth); Parts 7–10 give the engine mapping, reskin roster, and relic catalog.
- **Act I is the depth benchmark:** `src/backend/src/campaignData/skyIsFalling/` — mirror its file structure (acts/quests/regions/towns/rooms/npcs/monsters/items/rules) and its fixture/seed discipline (`scripts/seedSkyIsFalling.ts`, `npm run seed:sky`).
- **Strict-SRD reskin rule (non-negotiable):** every sci-fi enemy is a campaign-level clone of an SRD stat block with flavor name/desc (`{ ...SRD_MONSTERS.mage, name: 'Weaver Magus' }`) — never a bestiary rename. The fiction is sci-fi; the mechanics are 100% SRD 5.2.1.
- **Level curve:** party finishes Act I near L4 (the `q_case_107` reward grants toward L4); Act II targets L5 — which is what makes mid-campaign level-up a real, now-needed feature rather than a deferred nicety.
- **Pre-gen party:** Cassian Althion (Fighter) + Julian Sterling (Wizard) are required, locked-name/class members; recommended fill Cleric + Rogue. Act/loot effects target members by name.
- **Known soft spots flagged in prior work:** party-create spell-picker UI and ASI-at-creation were deferred during Act I — relevant context for the guided level-up UX.

## Constraints

- **Content scope**: Strict SRD 5.2.1 only — no PHB content — Why: licensing + project identity (CLAUDE.md, LEGAL.md)
- **Tech stack**: TypeScript everywhere, Express + React + PostgreSQL, json-rules-engine for gating — Why: match the existing engine; no new frameworks for content work
- **Authoring shape**: Act II ships as a code-authored, version-controlled campaign fixture seeded through `putCampaignSection` — Why: survives DB wipes, code-reviewable, stays creator-editable (Act I's proven pattern)
- **Quality gate (per CLAUDE.md)**: local pre-push gate = lint + tsc + full unit suites + the e2e smoke (`npm run test:e2e:stack`); migration changes add `npm run check-migrations`. Each mechanical addition gets a matching `.spec.ts`. Don't block on CI — push and let the owner watch it.
- **Assets**: only redistributable art in the public repo; restricted packs live in the private `pansori-assets` overlay; free tier must work without it — Why: OSS-clean repo (CLAUDE.md "Assets & licensing")

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Milestone = Act II only, full Act-I depth | Ship a proven, playable increment before committing to Acts III–IV | — Pending |
| New Region + capital Town for Act II geography | Mirrors Act I's Region→Town→Rooms shape; fits the high-society move from the marsh | — Pending |
| Act I → Act II branch at the opening only | Acknowledge the player's Act I choice without doubling the whole act's authoring | — Pending |
| Act I war-state is flavor-only in Act II (for now) | Keep scope tight; unlock conversation options, no substantive mechanical impact yet | — Pending |
| Fuel-cell race is a narrative device, not an engine mechanic | Keeps Act II on existing primitives; `relic_fuel_cell = party\|sect` carries the stakes | — Pending |
| Mid-campaign level-up built general, with guided UX | One real engine feature, reusable engine-wide; no min/max burden on the player yet | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-06-20 after initialization*
