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

### Spells (71)

All entries in `src/backend/src/contexts/srd/spells.ts` are
covered by SRD 5.2.1. Removed in earlier phases: absorb_elements,
silvery_barbs, hunger_of_hadar, bardic_inspiration_spell (the
last was a pansori-internal wrapper for the SRD Bard class
feature, kept under its existing id for now).

## Known orphan code (not yet swept)

Phase 3A2 + 3B left some dead orphan reads in hot-path code. These
always evaluate to false (no PC can take the matching feat or have
the matching species anymore) so they're functionally dead but
ugly. A follow-up sweep can clean them up:

- **toHit.ts**: reads of `sharpshooter_active` turn_action,
  `crossbow_expert` / `polearm_master` feat checks
- **resolveOneAttack.ts**: reads of `gwm_used` turn_action,
  `heavy_armor_master` / `tavern_brawler` checks
- **gameEngine.ts checkConcentration**: `war_caster` feat read;
  `observant` feat in `partyDetectsTrap`
- **rulesEngine.ts**: `tavernBrawler` parameter on `unarmedDamage`
- **gridMove.ts**: `mobile` feat speed bonus
- **twoWeaponAttack.ts**: `dual_wielder` feat check
- **Aasimar infrastructure**: `celestialRevelation` handler +
  `use_celestial_revelation` action + `use_healing_hands` action +
  `celestial_revelation_variant` / `celestial_revelation_rounds` /
  `healing_hands_used` Character state fields. The species was
  removed but the matching code is still wired (just unreachable).

None of this affects correctness; it's tech-debt cleanup.

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
