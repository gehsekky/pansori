# TODO

> **Status snapshot — verified 2026-06-03.** The top section is the
> authoritative implementation status, re-grounded in a fresh code survey
> (not the prior changelog). The backlog below it lists only **remaining**
> work — completed (`[x]`) items have been pruned; `git log` is the record
> of what already landed. `[~]` marks a shipped framework with documented
> deferrals.

## End-goal target

Browser-based, D&D 5e **SRD 5.2.1**-compliant engine capable of running
complex campaign scripts as a full RPG experience. Strict SRD-only — no
PHB/DMG-exclusive content (subclasses, feats, species, spells). See
[CLAUDE.md](../CLAUDE.md) for the contribution rule and
[LEGAL.md](../LEGAL.md) for the SRD attribution + scope statement.

---

## Implementation status (code-verified 2026-06-07)

Grounded in a code survey + the full suite: **backend 2755 tests across
322 files + frontend 327 across 41 files, all green** (lint + typecheck +
prettier clean).

### Done — world map / navigation

- **3-level grid map (regional → town → local)** — the campaign navigation
  model. The party is a single marker (`GameState.marker_pos`) on the
  regional + town grids and while exploring a local room out of combat;
  local combat deploys PC tokens, then collapses back to the marker. Every
  level is a tile grid with an SRD `feetPerSquare` scale (regional 5280 /
  town 25 / local 5). Movement is `marker_move` (free pathfinding out of
  combat); the regional grid spends SRD travel time (Normal 3 mi/hr → the
  in-game clock, see below) and rolls a per-square random encounter that
  drops the party into a transient local fight and marches them back. Every
  authored room/town/region grid carries cosmetic + tactical `terrain`
  (flagstone, rubble, ice, water, forest…); impassable cells fold into combat
  obstacles. "Transition cells" — region `sites`, town `venues`, room `exits`
  — descend / ascend / change rooms (`mapEngine.ts`, `activeGrid` +
  `resolveMarkerMove`). Frontend renders all three grids (`GridMapView`); the
  map overlay shows the active grid read-only.
- **One authored campaign — Malgovia — runs on the grid model** (+ the
  sandbox dev campaign). Campaign data lives under `campaignData/malgovia/`,
  split across sibling files assembled in `index.ts`: `entities.ts` (enemy
  templates / placements / NPCs), `map.ts` (rooms / regions / towns), `game.ts`
  (narratives / quests / factions / rules), `items.ts` (loot table / placements),
  guarded by `integrity.spec.ts` (cross-refs / dup-ids / reachability) + an
  order-insensitive `entities` snapshot. The context loader scans both top-level
  `campaignData/*.ts` files (e.g. `sandbox.ts`) and campaign folders' `index.ts`.
  Recommended party is **4** (Fighter / Cleric / Rogue / Wizard). Sandbox is
  marked `hidden`, reachable via `?campaign=sandbox`; the FE world-type picker
  only renders when more than one visible campaign exists.
- **In-game clock** — a single integer `GameState.world_minute` (total elapsed
  in-world minutes since campaign start; Day 1 08:00 == 480) is the source of
  truth; day / time-of-day band are derived at display time (`gameClock.ts`,
  mirrored BE+FE; header shows `Day N · HH:MM · band`). Regional travel adds
  minutes; a short rest +60, a long rest +480 (SRD), with SRD's **one long rest
  per 24 h** enforced via `last_long_rest_minute`. A `stateSchema` v2 migration
  collapsed the old dead `world_hour`/`world_day` pair.
- **NPC conversation mode** — "Talk to X" opens a dedicated dialogue window
  (`GameState.active_conversation`) that, mirroring the `pending_reaction`
  pattern, makes `generateChoices` early-return **only** the dialogue options
  (the NPC's responses at the current node + Back when nested + End
  conversation) until the player ends it. Responses **nest** arbitrarily
  (`NpcDialogueResponse.responses`, walked by `responsesAtPath`); the FE renders
  it as a `ConversationPanel`. Attack stays a normal choice; buying is a vendor
  pane nested under the conversation (below).
- **Vendor pane (buy-only)** — shopping is a sub-state nested under a
  conversation (`GameState.active_shop`): a friendly shop NPC offers a "🛒 Check
  out my wares" control → `generateChoices` early-returns the NPC's wares
  (faction-priced `buy` choices, `kind:'vendor'`) + a Back control, and the FE
  swaps in a `VendorPanel`. Selling is a planned follow-up on the same pane.

### Done — rules-engine frameworks

- **Attack / damage pipeline** — to-hit, advantage/disadvantage stacking,
  crits, resistance/vulnerability/immunity multipliers, dual-damage spells,
  massive-damage instant death.
- **Tactical grid combat** — BFS pathfinding, opportunity attacks (reach
  override), cover, flanking (optional), difficult terrain, Chebyshev
  distance; line-of-sight blocking by wall obstacles (ranged + offensive
  spell targeting); a room-grained **lighting/vision model** (dark/dim/bright/
  sunlight, darkvision, magical Darkness, light sources, Sunlight Sensitivity)
  with FE grid-fog + LoS reveal.
- **Conditions** with source attribution; **concentration** (saves +
  break sweep); **spell slots / components / AoE shapes / saves**;
  **reactions** (Shield, Counterspell, Hellish Rebuke, Uncanny Dodge,
  readied actions, OAs, Heroic-Inspiration reroll, Deflect Attacks,
  Indomitable / Countercharm — discriminated `pending_reaction` with
  pause/resume); **rest / death-save / revive ladder**; **weapon masteries**
  (all 8 SRD); **mounted combat**.
- **Dispatcher-integrated enemy turns** — a whole enemy turn runs as
  `enemy_move` → (`enemy_cast` | `enemy_attack`×N) through the same
  `dispatchAction` path as PC actions, via an `enemyActor`. PC vs monster
  attack/spell _resolvers_ stay deliberately distinct; the dispatch
  _entry_ is unified so shared abilities hook in from one place.
- **Summon-as-ally infrastructure** — `side` tagging, the ally turn AI
  (`runAllyTurn`), summon lifecycle, the combat-start bridge
  (`seedSummonedAllies`), and the `noAttack` Help-only familiar path. Spell
  frameworks that ride shipped paths: persistent damage zones (+ non-concentration
  teardown), recurring spell attacks, per-attack weapon riders, AoE-condition
  control (charm/fear/command/confuse/compel/dominate), forced displacement,
  wall spells — with per-spell RAW simplifications documented in `git log`.

### Done — character build

- **All 12 classes + their iconic SRD subclass, implemented through L20.**
  Full feature kits per class, each spec-covered. Subclasses: Berserker,
  College of Lore, Life Domain, Circle of the Land, Champion, Open Hand,
  Oath of Devotion, Hunter, Thief, Draconic Sorcery, Fiend, Evoker.
- **9 SRD species** with mechanical traits; **6 origin feats** + **7 SRD
  epic boons** (backend-wired); **4 SRD fighting styles** (Archery,
  Defense, Great Weapon, Two-Weapon).
- **Multiclassing** — per-class levels, multiclass spell-slot table,
  ability prerequisites, proficiency grants on entry, per-class feature
  gating.
- **2024 exhaustion** (−2/level to d20 tests, −5 ft/level speed, lethal at
  6); **ability-score generation** validation (point buy / standard array,
  backend) + background ASIs applied; **skill→ability map** with all
  contested/social checks routed through `skillCheck`.
- **Body-slot equipment + worn effects** — `Character.equipment` is a 13-slot
  map (`main_hand`/`off_hand`/`armor`/`shield`/`head`/`neck`/`cloak`/`hands`/
  `arms`/`waist`/`feet`/`ring_1`/`ring_2`) keyed to inventory `instance_id`s,
  with accessor helpers (`services/equipment.ts`) and a save migration from the
  old `equipped_weapon`/`armor`/`shield` trio. Any item with an `ItemSlot`
  category is equippable (rings fill ring_1 then ring_2). Items confer passive
  `wornEffects` while worn AND attuned (`services/wornEffects.ts`); today's one
  kind is `save_bonus` (the Moonstone Amulet's +1 WIS save, applied at condition
  saves) — the extension point for more effect kinds / save sites.
- **Character-creation surfaces** are complete (FE): ability-score method
  (roll / array / point-buy / manual) + background ASI split, class-skill
  choice, starting-equipment package, weapon-mastery picker (+ level-up
  scaling), Fighter fighting-style + Rogue Expertise pickers; plus in-game
  interactive reaction prompts, slot-recovery choice, and multi-target / option
  pickers.

### Content counts (the breadth that remains)

| Category                  | In pansori                                       | SRD universe                     |
| ------------------------- | ------------------------------------------------ | -------------------------------- |
| Spells                    | **340** in the catalog (~232 mechanical, ~108 narrative-only) | full SRD coverage |
| Shared SRD monster pool   | **50** (`SRD_MONSTERS`) + per-campaign templates | hundreds                         |
| Species                   | 9                                                | 9 standalone + Drow lineage      |
| Classes                   | 12                                               | 12                               |
| Subclasses                | 12 iconic (1 / class)                            | 1 iconic / class in SRD          |
| Origin feats / epic boons | 6 / 7                                            | 4 (+Magic Initiate variants) / 7 |

**Bottom line:** the rules-engine frameworks and the entire class/subclass
progression are done. What remains is overwhelmingly **content breadth**
on existing patterns and a handful of **bounded subsystems**.

---

## Remaining work

### Content breadth — data on existing patterns (RE-6)

- [x] **Spells** — full SRD coverage: **340** catalog entries (census
      2026-06-08: ~232 mechanical, ~108 narrative-only). Combat staples once
      assumed missing (Dispel Magic, Sanctuary, Mirror Image, Blur, Silence,
      Freedom of Movement, Darkness/Daylight…) are ALL implemented. Recent
      graduations: anti-magic, Time Stop, Shapechange, basic Wish, and the
      teleport family (Teleport / Teleportation Circle / Word of Recall →
      visited-town relocation) + Remove Curse (breaks cursed attunements).
      The remaining narrative tail clusters by missing SYSTEM, not by data
      entry: illusions (silent/major image, seeming…), divination/scrying
      (commune, locate-*, scrying, legend lore…), planar travel (plane
      shift, etherealness, astral projection…), terrain shaping (stone
      shape, move earth, passwall…), and pure-flavor utility (mending,
      prestidigitation, tiny hut…) — several of those are
      narrative-by-design and should stay that way.
- [ ] **Monsters** — stat-block content breadth. The ambient catalog is at
      **88** (synced to the DB, served to every campaign; customs shadow by
      name), on the supported fields (multiattack, onHitEffect incl.
      grapple-on-hit, resist/vuln/immune, bonusDamage, packTactics,
      bloodiedFrenzy, lifeDrain, aura, parry, breath weapon, etc.).
      Remaining: more breadth + the per-monster specials that need new infra
      (below). Legendary + lair scaffolding is shipped but unwired to a
      current boss.
- [ ] **Magic items** — content; the body-slot + attunement + curse + worn-effect
      infra is shipped (so new wondrous items are largely data + an effect kind).

### Monster-ability infrastructure (remaining specials need new engine support)

> The shared bestiary's stat lines are in, and the common hooks shipped (central
> enemy-damage floor, Undead Fortitude, Life Drain / max-HP reduction, monster
> auras, enemy reactions / Parry, conditional extra actions / Rampage, Sunlight
> Sensitivity, grapple-on-hit, Pack Tactics, Bloodied Frenzy, bonus on-hit
> damage). Still narrated / deferred per-monster: Flyby, Lion Roar, charge +
> auto-Prone riders, Rotting Curse, Create Specter, and each giant's ranged /
> recharge / bonus-action specials (Deflect Missile, War Cry, Cloud Giant
> Spellcasting).

### Documented engine deferrals (depend on missing content / infra)

- [ ] **Greater Divine Intervention** (Cleric L20) — needs a Wish spell.
- [ ] **Dragon Companion** (Draconic L18) — needs a Summon Dragon spell.
- [ ] **Contact Patron** (Warlock L9) — needs a Contact Other Plane spell.
- [ ] **Holy Ward half** (Devotion L20) — save sites don't carry the
      attacker's creature type yet (the Radiant aura ships).
- [~] **Truesight / Dimensional Travel / Night Spirit boons** — the +1 ability
  lands and Truesight's "sees through magical darkness" half shipped.
  Remaining: Truesight's see-Invisible / shapechanger halves (no
  Invisible-lifecycle on the grid yet); concrete positioning for Dimensional
  Travel; Night Spirit. Narrated.
- [ ] Minor markers: Devious Strikes' Daze restriction, Use Magic Device
      scroll/charge sub-features, Thief Jumper, Lay on Hands poison-cure use,
      Deflect Energy (Monk L13) — pending broader enforcement/item/jump infra.

### Combat / exploration subsystems (bounded) — RE-4

- [ ] **Underwater combat** — non-piercing melee disadvantage, ranged
      rules, fire resistance.
- [ ] **High Jump / verticality** — Long Jump shipped; High Jump is
      helper-only. Verticality is the architectural gap (flat grid, no
      elevation/ledges).
- [ ] **Somatic spell components** — RAW requires a free hand; needs a
      hand-state model. No spell carries a `somatic` flag yet. Also unlocks
      focus-substitutes-for-material.
- [ ] **Forced-march death at Exhaustion 6** — SRD Extended Travel fatigue
      ships (`applyForcedMarch` in `actions/markerMove.ts`: CON save per hour
      past 8/day or +1 Exhaustion, reset on long rest). But it only raises
      `exhaustion_level`; the Exhaustion-6 = death rule fires in a separate
      flow, so a marched-to-6 PC sits at max penalties instead of dying. Wire
      the death check into the march path (and/or centralize exhaustion-gain).
- [ ] **Out-of-combat systems** — Downtime, Bastions, Crafting (potions /
      scrolls / items), Vehicles. Lowest urgency.

### Condition + spellcasting fidelity (cleanups) — RE-5

- [~] **Multiclass edge cases** — per-class ASI spacing + multiclass-entry
  skill/tool grants are done. DEFERRED (larger model changes): - **Warlock pact-slot pool separation** — slots are still a single merged
  pool. Concrete bug to fix with it: `actions/rest.ts` short-rest
  overwrites `spell_slots_max` to the pact-only value and resets _all_
  `spell_slots_used`, wiping a multiclass Warlock's other-class slots.
  Needs a separate pact pool + casting + short/long-rest recovery + FE. - **Second-class subclass features** — subclass auto-assign only triggers
  for the _primary_ class at its level 3; a second class reaching its own
  subclass level gets nothing. Needs a per-class subclass model.

### Subsystem follow-ups

- [ ] **Magic / Utilize action-category tags** — only needed for Action
      Surge's "extra action, except the Magic action" once a martial
      multiclasses into a caster. Bundle with multiclass UX.
- [ ] **Magic-item attunement — remaining** — short-rest attune gating,
      Remove Curse ↔ `de_attune` interaction, cursed items in seed loot.
- [ ] **Long Rest → pure SRD 24-hour rule** — today `state.long_rested`
      caps long rests at ONE per session (never resets), with the SRD
      one-per-24h world-clock gate (`last_long_rest_minute`) as a
      backstop. As campaigns grow multi-region, drop the per-session
      flag and let the 24h gate govern alone — the clock plumbing is
      already in place (decided 2026-06-07; one-line change in
      `actions/rest.ts` + choice-label update in `gameEngine.ts`).

### Narrative pipeline — structured fragments (partial)

- [ ] `twoWeaponAttack` fragment — off-hand outcomes emit no `CombatEvent`
      (needs a `two_weapon_hit` kind or prose alignment).
- [ ] Cleave-hit fragment — secondary-target damage emits no event.
- [ ] `resolveTarget(ctx, action)` helper to dedupe target resolution
      across ~5 sites.
- [ ] `cleric.ts` Divine Spark auto-hit → `spell_auto_hit` fragment (defer
      to a Divine Spark rework).

---

## Campaign platform (active major feature)

> **End goal:** users author their own campaigns online and invite friends
> to play them. A campaign is **private by default** — invisible to
> non-members everywhere, including the new-game picker; members must be
> added to it (role `player`+) to see/play it. Some campaigns are **global**
> (visible to all users — the code-authored built-ins); **only site admins
> can promote** a campaign to global. Campaign content moves from code into
> the DB so owners/editors edit it in the website's admin section.
>
> **Shipped groundwork (2026-06):** `users.is_admin`; `campaigns` registry
> (startup-synced from code contexts, code built-ins = global) with
> `visibility`; `campaign_members` with `owner ⊃ editor ⊃ player` +
> last-owner guard; role middleware (`requireAdmin`,
> `requireCampaignRole`); `/api/campaigns` membership + visibility API;
> admin FE shell (campaign list, member management, admin-only
> promote/demote); `/game/contexts` + `session/new` visibility gating; FE
> picker intersects with the server-visible set.

> **Shipped — the creator platform (2026-06, this section was the plan; it
> landed):** campaign creation (`POST /api/campaigns`, owner+private,
> DB-born campaigns resolve over the base template, playable immediately);
> campaign rename (owners; `campaigns.name` drives picker + the in-game
> header via `campaignMeta.displayName`); **ten editable sections** —
> gameStart, narratives, regions, towns, rooms, quests, factions,
> terrainArt, customItems, customMonsters — DB-first with code fallback,
> live via `refreshCampaignOverlay` (no restart). Relational tables for
> regions/towns/rooms (+ sites/venues children); the rest as
> `campaigns.data` JSONB keys. Visual painters for region/town/room
> (terrain rows, tiers, mechanics, SIZE tool, markers, narration-hook
> cards) with nested URLs (`/creator/<cid>/region/<rid>/town/<tid>/room/<id>`);
> placed content in rooms (enemies, loot, NPCs, objects, traps); the
> **conversation platform** (gated dialogue: condition/once/check nodes,
> safe consequence subset incl. start_quest; parley with authored-hostile
> NPCs; NPC narrative hooks greeting/firstGreeting/goodbye/firstGoodbye;
> structured dialogue-tree editor + QUESTS/FACTIONS panels sharing one
> condition/effect row vocabulary). Rooms locked to the SRD 5-ft scale.

- [ ] **Narratives section editor** — the last JSON-only section with a
      natural structured surface (keyed string-lists).
- [ ] **Region-to-region travel** — region `onExit`/`onFirstExit` hooks are
      authored + stored but dormant until a region-edge transition exists.
      The next world-model piece; the-sky-has-fallen needs it at region #2.
- [ ] **Venue-level narration hooks** — venues carry only the per-landing
      site `onEnter`; no first/exit variants (towns/rooms/regions have all
      four).
- [ ] **Dialogue follow-ups (as authoring demands)** — `say` field (menu
      label vs spoken line), `goto`/node-ids for hub-and-spoke trees,
      mid-combat surrender, NPC ICON sprite picker (`/art/sprites` stems).
- [ ] **Region-page ROOMS panel (if needed)** — rooms are created via a
      town's hosted panel today; dungeon interiors for region local sites
      have no home-page panel (the top-level one was removed).

## Content & playtest

- [ ] **Wire boss legendary + lair actions to an actual boss** — scaffolding +
      tests exist; unwired pending a fitting boss. More effect kinds (terrain
      shift, debuff aura, summon, multi-attack legendary) as content demands.
- [ ] **Another campaign module (opportunistic)** — coastal pirate town,
      desert ruin, planar city, etc. Authored on the 3-level grid map as its own
      `campaignData/<name>/` folder (auto-discovered), or merged into Malgovia.
      A new player-facing campaign drops the `hidden` flag so the world picker
      resurfaces. Not on the critical path.
- [ ] **Sell side of the vendor pane** — add a `sell` action + a "Selling"
      section to the existing `VendorPanel` (the buy half shipped).

---

## Type-share infrastructure

- [ ] **Phase 3 of type-share** (remaining workspace-local: Character,
      GameState, Seed, Trap, Room, OnHitEffect, BossPhase, EnemyTemplate,
      Enemy, Spell, BeastForm, InventoryItem, TurnActions, DeathSaves,
      Context/FrontendContext, GameRule, RuleFacts, CampaignFacts, and the
      3-level map types Region/Town/MapSite/MapVenue/RoomExit/ActiveGrid).
      These cascade-share, need FE↔BE reconciliation, or are intentionally
      separate. Defer until there's a concrete reason to share each one.

---

## UX & polish

- [ ] **Tutorial / onboarding** (deferred-to-launch) — 2-room intro covering
      the action loop, grid combat, inventory modal. Held until the engine
      surface stabilizes near launch.
- [ ] **Dynamic room/encounter image generation** — Google Imagen behind
      `IMAGE_PROVIDER` flag, off by default.
- [ ] **Sound effects** — ambient audio per location type; combat cues.
- [ ] **LLM enhancement cost guards** (deferred-to-launch) — per-session
      token budget, short-event skip threshold, `LLM_ENHANCEMENT=off` kill
      switch.

---

## Engine & infrastructure

- [ ] **Save/state persistence across redeploys (manual verify)** —
      `normalizeState` specs assert a state row missing post-rollout fields
      loads + survives a `takeAction`. Still TODO: actual end-to-end exercise
      (start → redeploy → resume → confirm parity). ~30 min.
- [ ] **Difficulty tuning from playtest data** — capture damage/HP/encounter
      telemetry to inform tuning (Crypt Lord TPK was the first signal).
      ~3-4h to wire telemetry; ongoing to tune.

### Lower urgency (flag now, defer)

- [ ] **Multiplayer delta protocol** — full-state replace per action is fine
      at current scale; revisit when broadcast size hurts (more PCs, larger
      maps, persistent NPCs). Don't prebuild.
- [ ] **Server-side invariants** — `castSpell` checks slots only as a
      permission gate; stale-state actions get accepted. With `turn_seq` on
      the wire, assert `spell_slots_used <= max`, `hp <= max_hp`, action
      budget and reject with 409. Tighten when an exploit surfaces.
- [ ] **Observability** (needs-input) — only `console.log` today; Sentry /
      structured logging would surface prod issues. Requires choosing a service.
- [ ] **CHANGELOG.md** (needs-input) — no user-visible change log. Keep one?
      Which format?
- [ ] **Post-deploy health check + rollback** (needs-input) — CI deploys via
      SSM but doesn't poll `/api/health` or roll back on failure. ~2-3h.

---

## Accessibility audit

> Code-survey pass (WCAG 2.1 AA). Already strong: focus-visible outlines,
> aria-labels on icon buttons, tablist semantics + arrow-key nav, focus-trap +
> Esc-close dialogs, aria-live combat narrative, real `<button>` party tiles.
> Gaps below; manual SR + keyboard-only validation is the next step.

- [ ] **fieldset/legend on grouped form controls** — CharScreen's `PORTRAIT`
      / `ABILITY SCORES` group descriptors use plain `<label>`; the right
      HTML is `<fieldset><legend>` (or `role="group"` + `aria-labelledby`).
- [ ] **HP / condition live-region updates** — HP bars + condition badges
      update silently; an off-screen `aria-live` delta summary would help SR
      users track state. Needs UX tuning on when to announce.
- [ ] **Manual SR + keyboard-only validation** — exercise with VoiceOver /
      NVDA / JAWS and Tab-only to find what the code review missed.

---

## Security audit

> Solid foundation: helmet headers, CORS pinned to `FRONTEND_URL`, Postgres
> sessions with httpOnly + secure + sameSite cookies, auth rate-limit, all
> queries parameterized, passport + Google OAuth, `npm audit` in CI, session
> fixation protection. The single-tenant model masks issues that bite when
> `session_participants` lands.

- [ ] **CSRF on state-changing endpoints** — prod cookies use
      `sameSite: 'none'`, so the session cookie rides cross-origin POSTs.
      Options: tighten to `lax` if cross-origin isn't needed; double-submit
      token; or `X-Requested-With` header. **Needs a design call first.**
- [ ] **Multiplayer: session ownership + turn enforcement** —
      `game_sessions.user_id` is single-tenant; `takeAction` doesn't verify
      `req.user.id === characters[active].owner_user_id`.
- [ ] **CSP for any future HTML-serving paths** — helmet CSP is off (API
      returns no HTML); re-enable with tight `script-src 'self'` if we ever
      serve files/images directly.

---

## Deployment reference

Shipped: ECR, EC2, RDS, direct EC2 + nginx, Let's Encrypt (certbot webroot
auto-renew), GitHub Actions → SSM SendCommand deploy, Google OAuth, Docker
Compose prod. Required `/opt/pansori/.env` vars on EC2:

- `POSTGRES_PASSWORD`, `POSTGRES_USER` (`pansori`), `POSTGRES_DB` (`pansori_db`)
- `SESSION_SECRET` (64-char random)
- `ANTHROPIC_API_KEY`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`
- `FRONTEND_URL`, `ECR_REGISTRY`, `AWS_REGION`
