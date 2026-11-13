# SRD Gap Audit — 2026-11-11

Engine vs **SRD 5.2.1**, which is still the current SRD: D&D Beyond lists
nothing newer, and the English PDF is unchanged since 2025-05-01
(`docs/srd-5.2.1.txt` was extracted from it on 2026-05-22).

**Method.** Scripted inventory of the catalogs (spells, items, monsters) against
names extracted from the SRD text, plus per-feature code searches for every
`Level N: <Feature>` heading in the class chapters. A "missing" verdict means no
code path references the feature; it was confirmed by targeted search, not by
play. "Partial" means the feature exists but the RAW behaviour differs.

## Summary

| Area | SRD | In engine | Gap |
|---|---|---|---|
| Spells | 339 | 339 (+ Bardic Inspiration modeled as a spell) | **112 narrative-only** (no mechanical effect) |
| Class features (base + subclass, excl. ASI/Epic Boon) | 196 | ~150 | **~35 missing, ~10 partial** (below) |
| Eldritch Invocations | 28 | 2 (Agonizing Blast, Devil's Sight) | **26 missing** |
| Monsters | 330 | 328 | 169 `// Simplification:` notes; systemic gaps below |
| Monster spellcasting | 59 stat blocks | 2 (Mage, Archmage) | **57**; enemy casting supports only damage / single-target condition spells |
| Legendary Resistance | 32 stat blocks | all 32 (done 2026-11-12) | lair "+1/Day" not applied |
| Magic Resistance | 34 stat blocks | all 34 (done 2026-11-12) | Rakshasa's *Greater* Magic Resistance deferred |
| Magic items | ~260 | ~15 (+N weapons/armor/shields, healing potions, 4 wondrous) | **~245 missing** |
| Mundane weapons / armor / gear | — | complete, incl. all 8 weapon masteries | — |
| Species | 9 | 9 | — |
| Backgrounds | 4 | 4 | — |
| Feats | 4 origin + ASI + Grappler + 4 styles + 7 boons | all but Grappler (ASI handled as level-up) | Grappler (deliberately excluded per CLAUDE.md) |
| Conditions / Exhaustion | 15 + Exhaustion | all; Exhaustion uses the 2024 −2/level rule | — |

## 1. Accuracy bugs (wrong today, not merely missing) — FIXED 2026-11-12

> All three fixed, plus related rest bugs found while fixing them: Rage regained
> nothing on a Short Rest; Channel Divinity had the same 1–2-use / full-refill
> bug as Wild Shape; a Paladin's Channel Divinity never refilled on a Long Rest
> (`SRD_CLASS_FEATURES` listed it under Druid instead); and the Draconic list
> was itself incomplete. Pools now use the SRD class tables
> (`wildShapeUsesMax`, `channelDivinityUsesMax`) and class levels for every class
> a character has; subclass lists live in `services/subclassSpells.ts`, with a
> Circle of the Land land choice after each Long Rest.

1. **Wild Shape uses.** `actions/rest.ts` hard-codes 2 uses and refills to 2 on a
   Short Rest. RAW: 2 uses, rising with Druid level per the Wild Shape column
   of the Druid table; a Short Rest regains **one** expended use and a Long Rest
   regains all.
2. **Rest refills key off total level, not class level.** In the long-rest path,
   `rageUsesMax(c.level)` and `sorcery_points = c.level` use character level. A
   multiclassed Barbarian/Sorcerer gets too many Rages / Sorcery Points. Audit
   every `c.level` in `rest.ts` for the same pattern.
3. **Always-prepared subclass spells.** Only Draconic Sorcery grants its
   always-prepared list. Life Domain, Oath of Devotion, Circle of the Land and
   Fiend Patron spell lists are not granted, so those subclasses are missing
   their spells entirely.

## 2. Class features — missing or partial

Missing (no code path):

- **Barbarian:** Primal Knowledge (L3), Instinctive Pounce (L7), Improved Brutal
  Strike (L13 Staggering/Sundering Blow; L17 2d10 + two effects — only Forceful
  Blow and Hamstring Blow exist), Berserker Mindless Rage (L6).
- **Bard:** Font of Inspiration (L5: regain on Short Rest, spend a slot to
  regain a use), Magical Secrets (L10), College of Lore Bonus Proficiencies (L3)
  and Magical Discoveries (L6).
- **Druid:** Wild Companion (L2), Wild Resurgence (L5), Archdruid (L20);
  Nature's Sanctuary (L14). (Primal Order, Elemental Fury + Improved, Nature's
  Ward and Beast Spells done 2026-11-12 — `services/druidFeatures.ts`.)
- **Fighter:** Tactical Mind (L2), Tactical Shift (L5).
- **Monk:** Unarmored Movement (L2), Slow Fall (L4), Acrobatic Movement (L9),
  Heightened Focus (L10).
- **Paladin:** Abjure Foes (L9), Restoring Touch (L14), Smite of Protection
  (Devotion L15).
- **Ranger:** Deft Explorer (L2), Nature's Veil (L14), Hunter's Lore (L3).
- **Rogue:** Thief's Reflexes (Thief L17). Thieves' Cant exists only as a
  language (fine; it's narrative).
- **Sorcerer:** Dragon Companion (Draconic L18).
- **Warlock:** Eldritch Invocations beyond 2 of 28 (§3), Contact Patron (L9).

Partial or unverified (check behaviour against the text):

- Paladin's Smite (L2): Divine Smite exists; check the free once-per-Long-Rest cast.
- Faithful Steed (L5): Find Steed exists; check the always-prepared + free cast.
- Improved Cunning Strike (Rogue L11): Cunning Strike and Devious Strikes
  exist; check that two effects can be applied at once.
- Wizard Ritual Adept (L1): ritual casting exists; check that rituals can be
  cast from the spellbook without being prepared.
- ~~Druid Beast Spells (L18)~~: fixed 2026-11-12. Wild Shape never blocked
  spellcasting at all (RAW: no spellcasting in a beast form until L18, and then
  not spells with a costly or consumed Material component).

## 3. Warlock: Eldritch Invocations

**Mostly done (2026-11-12).** `services/invocations.ts` holds the catalog,
prerequisites and the Invocations-column cap (1 at L1 … 10 at L18); learning is
an out-of-combat choice. Modeled: Agonizing Blast, Armor of Shadows, Ascendant
Step, Devil's Sight, Eldritch Mind, Fiendish Vigor, Mask of Many Faces, Master
of Myriad Forms, Misty Visions, One with Shadows, Otherworldly Leap, Visions of
Distant Realms, Whispers of the Grave. Spell invocations cast through
`cast_spell` with `invocation` set (no slot, at will).

Pact of the Blade (bond the held weapon or conjure one from the mundane SRD
melee weapons; proficiency and CHA for the pact weapon), Thirsting Blade,
Devouring Blade, Eldritch Smite (armed before the hit; spends the highest open
slot) and Lifedrinker are modeled. Simplifications: the pact weapon keeps its
normal damage type (no Necrotic/Psychic/Radiant option); the bond doesn't
lapse when the weapon is left behind; Lifedrinker's Hit Point Die heal isn't
offered.

Pact of the Chain (Find Familiar without a slot, the seven special forms, one
familiar at a time, forgo an attack so the familiar attacks), Pact of the Tome
(Book of Shadows: 3 cantrips + 2 level-1 Rituals from any list, always
prepared), Repelling Blast and Eldritch Spear are modeled. Simplifications:
Chain's free Find Familiar is out of combat only (summons join at the next
combat start); the Book of Shadows can be rewritten any time out of combat
(RAW: when it appears at the end of a rest).

Still missing: Investment of the Chain Master, Gift of the Protectors, Gift of
the Depths, Gaze of Two Minds, Lessons of the First Ones, Witch Sight.
Simplifications: Agonizing Blast, Repelling Blast and Eldritch Spear apply to
Eldritch Blast only (RAW: a chosen damaging Warlock cantrip, repeatable);
replacing an invocation on level-up isn't offered.

Fixed alongside: Concentration saves never added the Proficiency Bonus for CON
save proficiency (Sorcerer, Fighter, Barbarian…); casting Find Familiar again
added a second familiar (RAW: one familiar; a recast changes its form).

## 4. Monsters

Systemic gaps, each affecting many stat blocks:

| System | SRD stat blocks | State |
|---|---|---|
| Spellcasting | 59 | 2 casters; enemy casting supports only damage and single-target condition spells |
| Magic Resistance (Adv. on saves vs spells) | 34 | **done** (`services/monsterSaves.ts`) |
| Legendary Resistance (auto-succeed a failed save, N/day) | 32 | **done**; spent on effect saves, not damage-only ones (AI policy) |
| Legendary Actions | 32 | supported (26 data references); spot-check coverage |
| Breath weapons / recharge | many | supported; 22 simplification notes trim riders |
| Grapple riders | many | supported; 18 notes defer specifics |
| Swallow / Engulf | ~11 notes | partial (4 engine references) |
| Shape-shift | 14 | deferred |

Magic Resistance and Legendary Resistance landed 2026-11-12: every enemy save
path (spell saves, AoE, re-saves, zones, smites, Turn/Sear Undead, Counterspell,
Hurl Through Hell, Land's Aid, Sanctuary, Stunning Strike, Open Hand, Cunning
Strike, Topple, Intimidating Presence) applies them; uses reset on a Long Rest.

## 5. Spells: 112 narrative-only

By level: cantrip 9, L1 16, L2 17, L3 16, L4 9, L5 18, L6 12, L7 8, L8 5, L9 2.
Many are genuinely table-adjudicated utility (Augury, Sending, Speak with Dead).
The ones worth mechanizing are those with a combat or exploration effect the
engine can already express, e.g. Feather Fall (falling damage exists), Knock
(locks/traps exist), Goodberry (healing exists), Detect Evil and Good / True
Seeing (vision system exists), Glyph of Warding (traps exist), Enthrall.
Regenerate the full list with the audit script (below) when picking these up.

## 6. Magic items

The catalog has the generic +N weapons/armor/shields, healing potions and four
wondrous items (Amulet of Health, Cloak of Protection, Gauntlets of Ogre Power,
Headband of Intellect). Campaign creators can add custom items, but the SRD's
~245 other magic items are absent. Prioritize items whose effect is a passive
number the engine already models (Bracers of Defense, Ring of Protection, Belt of
Giant Strength, Boots of Speed, Weapon of Warning, Ammunition +N, Potion of
Giant Strength, Potion of Resistance, Spell Scrolls), then activated items.

## 7. Core rules not found

**Grapple / Shove — done 2026-11-12** (`services/unarmedStrike.ts`). Now the
5.2.1 Unarmed Strike options: the target makes a STR or DEX save (its choice)
against 8 + STR mod (Monk: DEX via Dexterous Attacks) + PB; Legendary
Resistance applies; only a target at most one size larger (every SRD stat block
now carries `size`); Shove pushes 5 ft or knocks Prone; a grapple's escape DC is
the same DC. Each replaces one attack of the Attack action, so Extra Attack's
remaining attacks follow (against the same target — simplification). Fixed along
the way: attacks against a Grappled creature no longer get Advantage (2014
rule); a Grappled creature now has Disadvantage on attacks against anyone but
its grappler; a grapple ends when the two are farther apart than its range (no
dragging — simplification); Grapple / Shove no longer end the turn on the spot;
the Push weapon mastery now respects walls, creatures and its "Large or
smaller" limit (it moved the target two squares through anything).

**Spell attack rolls ignore conditions.** `resolveSpellAttack` takes only
Innate Sorcery's Advantage: a Blinded, Poisoned, Prone, Restrained or Grappled
caster rolls spell attacks normally, and attacks against a Paralyzed or
Restrained target get no Advantage. Weapon attacks (`attack/toHit.ts`) handle
all of these.

No code references: the **Search** and **Utilize** actions, **suffocation**,
**squeezing** into a smaller space, **crafting**, and **poisons** as items.
Present and 2024-correct: Exhaustion (−2 per level to d20 tests, death at 6),
weapon masteries, Heroic Inspiration, cover, opportunity attacks, death saves,
concentration.

## Suggested order

1. ~~§1 accuracy bugs~~ and ~~always-prepared subclass spells~~ (done 2026-11-12).
2. ~~Monster Magic Resistance + Legendary Resistance~~ (done 2026-11-12).
3. ~~Grapple / Shove as 5.2.1 saves~~, ~~Warlock Pacts + core invocations~~
   (done 2026-11-12). Druid's missing base features. Spell attacks honoring
   conditions.
4. Remaining class features, class by class, each with a spec per CLAUDE.md.
5. Monster spellcasting (needs enemy support for buff/control/AoE spells first).
6. Magic items, passive-number ones first; then mechanizable narrative spells.

## Reproducing

Scratch scripts used: load `SRD_SPELLS` / `SRD_ITEMS` with `tsx` and diff names
against headings extracted from `docs/srd-5.2.1.txt` (spell entries are the
line before `Level N <School> (` / `<School> Cantrip (`; class features are
`^Level N: ` lines under each `<Class> Class Features` heading). A spell
counts as narrative-only when it has no mechanical field and no id reference in
`src/backend/src/services/`.
