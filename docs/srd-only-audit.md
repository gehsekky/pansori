# SRD-Only Refactor — Audit + Migration Record

Pansori is a strict SRD 5.2.1 build. This doc started as an audit of
what would need to change to reach that scope; it now also serves as
the migration record (what was removed, where, when).

**Status as of 2026-05-23: ✅ COMPLETE.** All 13 removal phases
shipped. The codebase now contains only SRD 5.2.1 content (rule
mechanics, class subclasses, feats, species, spells) plus pansori's
own original content (campaign rooms, NPCs, items, narrative).

## Phase ledger

| Phase | What | Commit | Lines removed |
|---|---|---|---|
| 1 | PHB-only spells (Absorb Elements, Silvery Barbs, Hunger of Hadar) | `ebb616b` | 891 |
| 2A | Barbarian: totem_warrior, world_tree, zealot | `d220ba7` | 677 |
| 2B | Bard: glamour, valor, dance | `f77a7fe` | 292 |
| 2C | Cleric: light, war, trickery | `7b77646` | 521 |
| 2D | Druid: moon, sea, stars | `b895924` | 876 |
| 2E | Fighter: battle_master, eldritch_knight, psi_warrior | `78a0a66` | 715 |
| 2F | Monk: mercy, shadow, elements | `455e2ce` | 581 |
| 2G | Paladin: ancients, glory, vengeance | `d1b2b10` | 612 |
| 2H | Ranger: beastmaster, fey_wanderer, gloom_stalker | `77c45e7` | 443 |
| 2I | Rogue: soulknife, thief, arcane_trickster | `aa616c6` | 278 |
| 2J | Sorcerer: wild_magic, aberrant_mind, clockwork_soul | `bad3fc3` | 1,005 |
| 2K | Warlock: archfey, celestial, great_old_one | `c89df6e` | 479 |
| 2L | Wizard: abjurer, diviner, illusionist | `e3ff1cf` | 654 |
| 3A | PHB-only feats (16) — data + spec rewrites | `d48e0e9` | 2,727 |
| 3A2 | Orphan feat infrastructure (Lucky/Sentinel reactions, GWM/Polearm/Healer's Kit handlers, sharpshooter toggle, etc.) | `d023c00` | 2,088 |
| 3B | PHB-only species (Aasimar, Drow standalone) | `4461151` | 333 |
| 3C | Docs cleanup (this commit) | TBD | TBD |
| **Total** | | | **~13,200 lines** |

The original audit estimated 2,000-3,000 lines. Actual scope was
much larger because of cascading state fields, action types,
reaction infrastructure, and tests tied to each removed feature.

## Final shape of the SRD catalog in pansori

### Subclasses (12, all SRD-iconic)

| Class | Subclass |
|---|---|
| Barbarian | Berserker |
| Bard | College of Lore |
| Cleric | Life Domain |
| Druid | Circle of the Land |
| Fighter | Champion |
| Monk | Open Hand |
| Paladin | Oath of Devotion |
| Ranger | Hunter |
| Rogue | Assassin |
| Sorcerer | Draconic |
| Warlock | Fiend |
| Wizard | Evoker |

### Feats (6)

- Alert
- Magic Initiate (Arcane / Divine / Primal — pansori splits the
  SRD's single feat into 3 entries for picker ergonomics; the
  underlying mechanic is SRD)
- Savage Attacker
- Skilled

### Species (9)

Dragonborn, Dwarf, Elf, Gnome, Goliath, Halfling, Human, Orc,
Tiefling.

The SRD has Drow as an Elf lineage option, not a separate species —
pansori treats Elf as the species and doesn't currently surface the
lineage pick (a follow-up could add the SRD's High Elf / Wood Elf /
Drow lineage chooser without crossing the SRD line).

### Spells (111)

All entries in `src/backend/src/contexts/srd/spells.ts` are
covered by SRD 5.2.1. Removed in earlier phases: absorb_elements,
silvery_barbs, hunger_of_hadar, bardic_inspiration_spell (the
last was a pansori-internal wrapper for the SRD Bard class
feature, kept under its existing id for now). Catalog grew from
71 → 111 across the May 2026 SRD-spell sessions. The 2026-05-23
day landed two batches:

- **Bring-from-dead ladder (5):** Revivify, Raise Dead,
  Resurrection, True Resurrection, Reincarnate. All route
  through the same `runReviveSpell` branch with the
  `Spell.revive` field carrying `hpRestored` / `windowRounds` /
  `materialCost`. `Character.died_at_round` is set at every
  death site and cleared on revive.
- **Mixed batch (8):** Lesser Restoration, Greater Restoration,
  Prayer of Healing, Beacon of Hope, Death Ward, Bane,
  Scorching Ray, Chromatic Orb. Plug-ins into existing pipelines
  (heal-strip, mass-heal, buff, save+condition, multi-target
  attack-roll). Two new conditions added to `ConditionName`:
  `baned` (-1d4 to attacks + saves) and `hopeful` (advantage on
  WIS + death saves). New Character flag `death_ward_active`
  intercepted in `applyDamage`.

## Orphan sweep (2026-05-23)

Phase 3A2 + 3B left dead orphan reads in hot-path code (feat checks
that always evaluated to false, Character/turn_action fields that
no PC could populate). All of it was cleaned up in a follow-up
sweep on 2026-05-23. The removals:

- **toHit.ts**: dropped `sharpshooterActive` from `ToHitContext`,
  the `crossbow_expert` feat suppression of ranged-in-melee
  disadvantage, the `sharpshooter_active` cover-suppression block,
  and the -5/+10 penalty fold-in. `totalAttackBonus` now collapses
  to `sacredWeaponBonus` alone.
- **resolveOneAttack.ts**: dropped the `sharpshooterDmg` and
  `gwmDmg` riders, the `gwm_used`/`gwm_bonus_attack_pending`
  turn_action setters, the `tavern_brawler` branch on the unarmed
  fallback, and the celestial-revelation damage rider block.
- **gameEngine.ts**: simplified `checkConcentration` by dropping
  the `war_caster` advantage path; dropped the `observant` bonus
  in `partyDetectsTrap`; dropped the entire `polearm_master`
  `pamEnterReachTriggers` OA-on-enter-reach block; dropped the
  `heavy_armor_master` -3 damage reduction; dropped the `mobile`
  feat +10 ft speed read; dropped the celestial-revelation
  round-tick block.
- **rulesEngine.ts**: dropped the `tavernBrawler` parameter on
  `unarmedDamage`; pruned `observantBonus` from
  `passivePerception`.
- **gridEngine.ts**: deleted `pamEnterReachTriggers` helper
  (only PAM consumed it). `pamEnterReach.spec.ts` deleted.
- **twoWeaponAttack.ts**: dropped the `dual_wielder` off-hand
  relaxation; off-hand must be Light per SRD.
- **Aasimar infrastructure**: deleted `celestialRevelation.ts`
  handler, `healActions.ts` handler, the
  `use_celestial_revelation` and `use_healing_hands` action
  variants from `shared/types.ts`, the action registry entries
  in `actions/index.ts`, the cost-map entries in `cost.ts`, the
  long-rest reset block in `rest.ts`, and the
  `celestial_revelation_variant` / `celestial_revelation_rider_used`
  Character fields. The `aasimar` species entry was also dropped
  from `frontend/src/data/species.ts` (the BE species removal had
  already happened in Phase 3B; the FE entry was a stale dupe).
- **movementModes.spec.ts**: rewrote the two Aasimar-specific
  tests to use a direct `fly_speed_ft: 30` setup on a Human
  Cleric instead of routing through Radiant Soul.

Net: -6 test files, code lighter and free of dead branches.

## Tradeoffs accepted

**Lost (compared to a hypothetical PHB-derived build):**

- Most non-iconic subclasses — many were the most popular
  player-facing options (Battle Master maneuvers, Wild Magic
  surge, Stars Druid constellations, Eldritch Knight, etc.)
- Iconic combat-optimization feats (Lucky, Sharpshooter, Sentinel,
  GWM, Polearm Master, War Caster, etc.)
- Aasimar species
- A handful of marquee PHB-only spells (Absorb Elements, Silvery
  Barbs, Hunger of Hadar)

**Gained:**

- Airtight IP story — pansori-as-distributed is CC-BY-4.0
  derivative of SRD 5.2.1 with proper attribution
- Cleaner codebase: ~13,200 lines lighter, with no PHB-derived
  mechanics
- No "should this feature be here" judgment calls for new content —
  the SRD txt is the bright line
