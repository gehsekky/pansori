# Pansori — built features

What's implemented and working. Strict SRD 5.2.1 scope throughout (see
[CLAUDE.md](CLAUDE.md) / [LEGAL.md](LEGAL.md)). Open work lives in
[TODO.md](TODO.md). `git log` is the authoritative record of what landed.

## SRD content coverage

| Category | In pansori | SRD universe |
|---|---|---|
| Spells | **340** catalog entries (~232 mechanical, ~108 narrative-only) | full SRD coverage |
| Monsters | **328** stat blocks (CR 0 Rat → CR 30 Tarrasque), SRD-exact names | 330 (Seahorse + Shrieker Fungus have no attacks) |
| Classes | 12 | 12 |
| Subclasses | 12 iconic (1/class) | 1 iconic/class |
| Species | 9 (+ Drow as an Elf lineage) | 9 |
| Origin feats / epic boons | 6 / 7 | 4 (+Magic Initiate variants) / 7 |
| Fighting styles | 4 (Archery, Defense, Great Weapon, Two-Weapon) | — |

- The **bestiary is complete** — every attack-capable SRD block, spec-guarded
  (SRD-exact names, a full cr/hp/ac/xp audit against `docs/srd-5.2.1.txt`, a
  completeness pin). Regeneration, legendary `extra_attack` (26 bosses), Undead
  Fortitude, Life Drain, auras, recharge breath, Pack Tactics, Parry, etc. are wired.
- **Narrative-only spells graduate** as their systems land: anti-magic
  suppression, Time Stop, Shapechange / Animal Shapes, basic Wish, the teleport
  family, Remove Curse.

## Character build & creation

- **All 12 classes + their iconic SRD subclass, through L20**, each spec-covered
  (Berserker, College of Lore, Life Domain, Circle of the Land, Champion, Open
  Hand, Oath of Devotion, Hunter, Thief, Draconic Sorcery, Fiend, Evoker).
- **Multiclassing** (per-class levels, multiclass slot table, ability prereqs,
  entry proficiency grants, per-class feature gating); **2024 exhaustion**
  (−2/level d20, −5 ft/level, lethal at 6); ability-score generation
  (roll/array/point-buy/manual) + background ASIs; full skill→ability map.
- **Player-driven creation**: ability method + background split, class-skill
  choice, starting-equipment package, weapon-mastery picker (+ level-up scaling),
  fighting-style / Expertise pickers, Cleric **Divine Order**, a **caster spell
  picker** (cantrips + L1; Magic Initiate vs caster pickers lock duplicate
  cantrips, allow the L1 overlap, show locked spells). Magic Initiate's free L1
  cast is a distinct, slot-independent combat choice.
- **Body-slot equipment** — 13-slot `Character.equipment` map keyed to inventory
  instances; items confer passive `wornEffects` while worn + attuned.

## Equipment (full SRD 5.2.1 tables)

- All 38 weapons (simple + martial, incl. firearms) with RAW damage / properties
  / **weapon mastery**; all 13 armor entries. Tools + adventuring gear; Healer's
  Kit (`stabilize`), Antitoxin.
- Light sources (Torch / Hooded / Bullseye Lantern) as a worn `light` effect +
  a quiver slot (seeds `light_radius_ft`); thrown splash weapons (Acid,
  Alchemist's Fire, Holy Water — creature-type-gated); ammunition spent per
  ranged round.

## Combat engine

- Grid tactical combat (5-ft squares): to-hit, advantage/disadvantage stacking,
  crits, cover, flanking (optional), difficult terrain, BFS pathfinding,
  opportunity attacks (reach), Chebyshev distance, line-of-sight blocking, and a
  room-grained **lighting/vision model** (dark/dim/bright/sunlight, darkvision,
  magical Darkness, light sources, Sunlight Sensitivity) with FE grid-fog + LoS reveal.
- **Per-room grid size** — each fight uses its room's `gridWidth`/`gridHeight`
  (clamped 6–16), falling back to the campaign default; one shared clamp keeps the
  drawn grid and the server's movement bounds in lockstep.
- **Surprise** = Disadvantage on the Initiative roll (SRD 5.2.1; Alert immune).
- All 8 SRD **weapon masteries** (Cleave makes its own attack roll; Graze, Topple,
  Vex, Slow, …); resistance/vulnerability/immunity; massive-damage instant death.
- **Reaction framework** — discriminated `pending_reaction` with pause/resume:
  Shield, Counterspell (2024 enemy CON-save), Hellish Rebuke, Uncanny Dodge,
  readied actions, OAs, Heroic-Inspiration reroll, Deflect Attacks, Indomitable,
  Countercharm.
- Conditions (source attribution, immunities, durations), concentration (saves +
  break sweep), spell slots / components / AoE shapes / saves, rest / death-save /
  revive ladder, temp HP, Death Ward, mounted combat.
- **Dispatcher-integrated enemy turns** (enemy_move → enemy_cast | enemy_attack×N
  through the same dispatch path as PCs); **summon-as-ally** infra (side tagging,
  ally AI, lifecycle, familiar Help-only path); persistent damage zones, recurring
  spell attacks, weapon riders (Divine Favor, smites), AoE-condition control,
  forced displacement, wall spells.
- Per-spell handlers cover the combat-relevant catalog. Recent mechanizations:
  Guidance, Resistance, True Strike, Shield, Counterspell, Shillelagh.

## Map, travel & encounters

- Three-level grid map: **regional → town → local room**, one party marker;
  descend/ascend/change-room on transition cells (region sites / town venues /
  room exits). Region-to-region travel via **GATE sites** (full enter/exit hook
  matrix); town **teleportation** (Teleport / Word of Recall → visited towns).
- **In-game clock** — single `world_minute` integer; day/time-band derived at
  display; travel adds minutes, short rest +60, long rest +480, SRD one-long-rest-
  per-24h gate.
- SRD **Travel Pace** (hour-per-click cap; fast/normal/slow) + **forced-march**
  CON saves → exhaustion past 8 hrs/day; fog of war.
- **Encounter zones** — paintable, non-overlapping region sub-areas, each a
  self-contained pool: a difficulty **tier (1–4)**, a per-square chance, and a
  creature table. Table entries are **weighted** — a bare name rolls at weight 1,
  or a `{name, weight}` pair makes a creature spawn proportionally more often
  (set per-creature in the zone's creator panel). One region can span multiple
  tiers; a square outside every zone never rolls. The sole source of random
  wilderness encounters.
- **Encounter arenas** — a zone can map each terrain type to a pool of room ids;
  a rolled encounter on that terrain is fought on a random one of those rooms'
  battlegrounds (floor, obstacles, terrain, cover, lighting, size), else a default
  bare arena. Edited in the zone's creator panel.
- **Party-size scaling** the SRD way — by creature COUNT (not inflated stat
  blocks), relative to `recommendedPartySize`, floored to the XP budget; bosses
  (count-1 placements) never cloned.

## NPCs, dialogue & economy

- **Conversation mode** — a dedicated dialogue window; arbitrarily nested
  responses; condition/once/check-gated nodes; a safe consequence subset
  (advance_quest, add_narrative, modify_hp, consume_item, start_quest); parley
  with authored-hostile NPCs; greeting/goodbye narrative hooks (variant pools —
  see below). Dialogue replies are single lines (index-addressed, inline JSONB).
- **Vendor economy** — buy + sell (half price), per-entry stock quantities,
  vendor wallets, daily restock, general buyback off SRD catalog values.

## Campaign platform (content lives in the DB)

- Campaigns are DB rows resolving over the shared SRD base template
  (`campaignData/srd/baseCampaign.ts`) — one loading path for every campaign.
  Nothing ships a built-in campaign; the per-campaign code contexts are deleted
  and the DB is canonical. Campaigns are user-authored through the creator (and,
  for the e2e suite, planted at test time into a throwaway database).
- **Creator / editor**: visual region/town/room **painters** (terrain, tiers,
  mechanics, SIZE, markers, encounter zones, narration-hook cards), placed
  content in rooms (enemies/loot/NPCs/objects/traps), a structured dialogue-tree
  editor + QUESTS/FACTIONS panels (shared condition/effect vocabulary), a
  structured **NARRATIVE panel** for the campaign-wide flavor pools, and the
  **MAP ART editor** (terrain tints, town-marker tiles, floor skins, level tabs).
- **Structured narrative hooks** — authored prose attached to an entity
  (region/town/room enter+exit, site arrival, room object/trap text, NPC
  greeting/goodbye) is normalized into the `campaign_narratives` table, one row
  per **variant**: the engine picks one at random (`pickHookText`) and a variant
  may be multi-paragraph. Edited in-place via the **variant-list control**
  (add/remove variant; multi-line each). The section payloads still carry the
  hooks inline — only the persistence is normalized.
- **Editable sections** (DB-first, live via `refreshCampaignOverlay`, per-section
  schema-validated): gameStart, narratives, regions, towns, rooms, quests,
  factions, terrainArt, customItems, customMonsters, theme, rules,
  recommendedParty, backgrounds, classSpells, classStarting{Loot,Equipment}.
  Custom monsters/items carry the full template surface (phases, legendary/lair
  actions, wornEffects, curses, attunement, masteries).
- **Live edits reach running games** — a session's seed is re-resolved against
  the live campaign on refresh (presentation/map/room text/NPC dialogue + not-yet-
  reached encounters update; engaged rooms keep their combat/cleared state). A
  `campaign-updated` socket event nudges open sessions to refresh automatically.
- **Membership & visibility** — `users.is_admin`; campaigns registry with
  visibility (private-by-default; admin-only promote to global); `campaign_members`
  with **owner ⊃ editor ⊃ player** + last-owner guard; role middleware +
  `/api/campaigns` API; the picker intersects with the server-visible set.
  Breadcrumb nav.

## Art & assets (two tiers — the public repo ships only redistributable art)

- **Free tier (in this repo, default):** monochrome glyphs (game-icons CC BY 3.0 /
  RPG Awesome OFL / Phosphor MIT) for UI, map markers, item buckets, and party/NPC
  tokens; per-terrain color tints; CC0 floor tiles (SBS "Tiny Texture Pack") +
  original procgen dirt/sand. Fully playable with zero licensed assets — see
  [ASSETS.md](ASSETS.md). The renderer (`src/frontend/src/lib/art.ts`) falls back
  to this whenever `VITE_PAINTED_ART` is off.
- **Painted tier (separate private overlay, opt-in):** the richer raster packs —
  Baumgart Basic Terrain Set + Medieval Fantasy Locations markers, Baumgart
  "Medieval Arms & Armor" + Vivid Motion item icons, Tiny Swords party/NPC
  sprites. Licensed for in-game use but not standalone redistribution, so they
  live in the private `pansori-assets` repo and overlay at build/deploy
  (`VITE_PAINTED_ART=1`, optional `VITE_ASSET_BASE_URL` CDN). See [LEGAL.md](LEGAL.md).

## Platform & ops

- Type-share: `src/shared/types.ts` is the source of truth, synced to BE+FE
  `shared-types.ts` (CI `sync-types:check`).
- Local gate: lint + both tsc + `test:be` + `test:fe` + the Playwright e2e smoke;
  `npm run check-migrations` on migration changes.
- **Deployment** (shipped): ECR + EC2 + RDS, nginx, Let's Encrypt (certbot
  auto-renew), GitHub Actions → SSM deploy, Google OAuth, Docker Compose prod;
  Postgres sessions (httpOnly/secure/sameSite), helmet, pinned CORS, parameterized
  queries, auth rate-limit, `npm audit` in CI.
