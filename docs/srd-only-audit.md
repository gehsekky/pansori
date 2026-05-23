# SRD-Only Support Audit

What would need to change if pansori narrows scope to SRD 5.2.1 content only (no PHB-exclusive subclasses, feats, spells, species).

**Why this question matters:** SRD 5.2.1 is CC-BY-4.0 licensed — freely redistributable with attribution. PHB-exclusive content is fully copyrighted. Going SRD-only would make pansori's content side fully open-license; any PHB-derived mechanics would need to be removed or refactored.

## Status: snapshot as of 2026-05-23

Audit done by `grep`-ing pansori's identifiers against `docs/srd-5.2.1.txt`. Some checks are approximate where the PDF→txt extraction puts content in tables or with formatting that doesn't line-match cleanly — those rows are flagged.

## Subclasses (high confidence)

Pansori references ~43 subclass identifiers. Of these:

### ✅ SRD-covered (would stay)
| Class | Subclass | Pansori id |
|---|---|---|
| Barbarian | Path of the Berserker | `berserker` |
| Bard | College of Lore | `lore` |
| Cleric | Life Domain | `life` |
| Druid | Circle of the Land | `land` |
| Fighter | Champion | `champion` |
| Monk | Open Hand | `open_hand` |
| Paladin | Oath of Devotion | `devotion` |
| Ranger | Hunter | `hunter` |
| Rogue | Assassin | `assassin` |
| Sorcerer | Draconic Sorcery | `draconic` |
| Warlock | Fiend Patron | `fiend` (likely id; verify) |
| Wizard | Evoker | `evoker` |

### ❌ PHB-only (would need to remove or rebuild)

**Barbarian:** `totem_warrior`, `world_tree`, `zealot`
**Bard:** `glamour`, `valor`
**Cleric:** `light`, `war`, `trickery`
**Druid:** `moon`, `sea`, `stars`
**Fighter:** `battle_master`, `eldritch_knight`, `psi_warrior`
**Monk:** `mercy`, `shadow`, `elements`
**Paladin:** `ancients`, `glory`, `vengeance`
**Ranger:** `beastmaster`, `fey_wanderer`, `gloom_stalker`
**Rogue:** `soulknife`, `thief`
**Sorcerer:** `wild_magic`, `aberrant_mind`, `clockwork_soul`
**Warlock:** `archfey`, `celestial`
**Wizard:** `abjurer`, `diviner`

Rough count: **12 SRD-covered subclasses, ~30 PHB-only** in pansori today.

The non-iconic subclasses received substantial implementation work over recent sessions (Stars Druid, Clockwork Soul, Glamour Bard, Aberrant Mind, etc.). Removing them would walk back a lot of recent feature work.

## Spells (high confidence)

Pansori has 65 spell entries. Cross-checked names against the SRD:

### ❌ Non-SRD spells in pansori
- `absorb_elements` — PHB
- `bardic_inspiration_spell` — pansori-internal wrapper for the Bard class feature (not really a spell in either book). Could be renamed/relocated without loss.
- `hunger_of_hadar` — PHB
- `silvery_barbs` — Strixhaven (Curriculum of Chaos) — neither SRD nor PHB

### ✅ Everything else is SRD-covered
The other 61 spells in pansori's catalog are in SRD 5.2.1.

Going SRD-only: remove the 3 PHB spells + Silvery Barbs (or move them to a separate "house rules" namespace), and rename `bardic_inspiration_spell` since the suffix is meaningful only as a disambiguation from the class feature.

Code impact: the Silvery Barbs reaction has its own pause path in `runEnemyTurns` + resolver branch in `reaction.ts`. Removing it requires deleting the `PendingSilveryBarbsReaction` variant, the `isSilveryBarbsEligible` helper, the pause-point block, and the resolver branch. ~80 lines.

Absorb Elements + Hunger of Hadar both have reaction-window infrastructure too — same removal pattern.

## Feats (approximate — verify before action)

Pansori's feats: `alert`, `athlete`, `crossbow_expert`, `dual_wielder`, `great_weapon_master`, `healer`, `heavy_armor_master`, `lucky`, `magic_initiate_arcane`/`_divine`/`_primal`, `mobile`, `observant`, `polearm_master`, `resilient`, `savage_attacker`, `sentinel`, `sharpshooter`, `skilled`, `tavern_brawler`, `tough`, `war_caster`.

Strict `^FeatName$` line-match against SRD txt returned ambiguous results — the PDF's feat section uses table/header formatting that pdftotext doesn't render as clean line entries. The 2024 SRD 5.2.1 *does* include most of the iconic origin + general feats (verified inline in earlier sessions: Tough, Lucky, Magic Initiate, Savage Attacker, Skilled, Resilient, Sentinel, Healer, Alert all appear in usage references).

Best estimate: **most feats in pansori are SRD-covered**. Likely exceptions to verify:
- `polearm_master` — possibly PHB-only
- `crossbow_expert` — possibly PHB-only
- `dual_wielder` — possibly PHB-only
- `heavy_armor_master` — possibly PHB-only
- `tavern_brawler` — possibly PHB-only
- `mobile` — possibly PHB-only
- `observant` — possibly PHB-only

Need to spot-check each by opening the SRD's "Feats" chapter directly (lines 8283+) rather than relying on line-matching grep.

## Species (approximate — verify)

Pansori's species: `aasimar`, `dragonborn`, `drow`, `dwarf`, `elf`, `gnome`, `goliath`, `halfling`, `human`, `orc`, `tiefling`.

Grep results were unreliable for species too (PDF formatting again). Manual confirmation from prior sessions:
- ✅ SRD-covered: Dragonborn, Dwarf, Elf, Gnome, Goliath, Halfling, Human, Orc, Tiefling
- ⚠️ Aasimar: confirmed in SRD 5.2.1 line ranges earlier this session (extracted as a spell-list source) — SRD
- ❓ Drow: pansori has it as a separate species; needs verification. The SRD 5.2.1 has Drow as an Elf subspecies/lineage. If pansori treats Drow as a top-level species rather than an Elf lineage, that's a model divergence rather than a content question.

## Backgrounds

Pansori has custom backgrounds (Acolyte, Soldier, Sage variants) tied to origin feats. The 2024 PHB shipped a specific background list; the SRD has a subset. Most pansori backgrounds appear to mirror SRD-listed backgrounds. Worth a separate spot-check.

## Engine impact summary

Going SRD-only would touch the following code surfaces:

1. **`contexts/srd/spells.ts`** — delete 4 entries (silvery_barbs, absorb_elements, hunger_of_hadar, bardic_inspiration_spell rename)
2. **`services/actions/reaction.ts`** — remove silvery_barbs + absorb_elements resolver branches (~120 lines)
3. **`services/gameEngine.ts`** — remove the matching pause-point blocks for those reactions in `runEnemyTurns`, plus their eligibility helpers (~80 lines)
4. **`services/actions/classFeature/*.ts`** — delete the non-iconic subclass feature handlers (Stars Druid, Clockwork Soul, Glamour Bard, World Tree, etc.) — substantial deletion, hundreds of lines
5. **`services/gameEngine.ts`** — remove non-iconic-subclass choice-surface blocks
6. **`services/actions/meta.ts`** — remove non-iconic-subclass handling in `handleSelectSubclass`
7. **`services/actions/rest.ts`** — remove non-iconic-subclass long-rest hooks
8. **Subclass selection UI** (FE) — remove non-iconic options from the picker
9. **Tests** — delete or skip ~200+ tests covering non-iconic subclasses, PHB-only feats, removed spells
10. **`shared/types.ts`** — remove condition / state fields that only exist for non-iconic subclasses (`starry_form_constellation`, `tricksters_blessing_active`, etc.)
11. **`docs/TODO.md`** — strike the deferred-PHB-content section; close out the per-feature placeholder rows

Rough scale: **2,000-3,000 lines of code removal + ~200 tests skipped or deleted + 30+ entity-type fields cleaned**. The campaign content (Whispering Pines, Vale of Shadows) is unaffected — that's original pansori content using SRD-equivalent monsters/spells.

## Tradeoffs

**Pro of going SRD-only:**
- Content side fully open-license (CC-BY-4.0 with attribution)
- No IP question on any spell/feat/subclass implementation
- Clear story: "pansori implements SRD 5.2.1, plus original campaign content"
- Documentation gets cleaner — no "deferred for PHB" entries

**Con of going SRD-only:**
- Loses substantial recent work on non-iconic subclasses
- Loses the feature-richness players associate with full-PHB campaigns (most player favorites are PHB-only: Battle Master, Eldritch Knight, Hexblade-shaped Warlocks, etc.)
- Loses Silvery Barbs / Hunger of Hadar / etc. — popular reaction-spell mechanics
- Narrows class options to 12 SRD-iconic subclasses

## Recommendation (analysis, not a decision)

Three viable paths:

1. **SRD-only.** Cleanest IP story. Heavy work to walk back PHB content already shipped. Pansori's identity becomes "the SRD D&D engine."

2. **Hybrid with namespaced PHB content.** Move PHB-derived code to a separate `phb-content/` directory that's gitignored by default; users who own the PHB can opt-in by un-ignoring the directory locally. Pansori-as-shipped stays SRD-only; PHB content is a personal extension. No code deletion required, just reorganization.

3. **Status quo + license-aware documentation.** Keep current trajectory but mark each PHB-derived feature in TODO.md / source comments with `// PHB-derived — see LEGAL.md`. Add a clear LEGAL.md section explaining that pansori-as-distributed is SRD content + original campaign material, and PHB-derived implementations require the user to own the PHB. This is the current de-facto state but isn't explicitly documented.

**My read:** Path 2 (hybrid with namespacing) preserves the work already done and provides a cleaner IP separation than the current setup. Path 3 is the lowest-effort change. Path 1 is the cleanest but most invasive — only worth it if pansori's distribution model becomes important (e.g., open-source release).

Worth discussing with you before any code action. None of this is urgent.
