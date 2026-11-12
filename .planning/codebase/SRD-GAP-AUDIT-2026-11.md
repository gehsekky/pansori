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
| Legendary Resistance | 33 stat blocks | no system | **missing** |
| Magic Resistance | 34 stat blocks | no system | **missing** |
| Magic items | ~260 | ~15 (+N weapons/armor/shields, healing potions, 4 wondrous) | **~245 missing** |
| Mundane weapons / armor / gear | — | complete, incl. all 8 weapon masteries | — |
| Species | 9 | 9 | — |
| Backgrounds | 4 | 4 | — |
| Feats | 4 origin + ASI + Grappler + 4 styles + 7 boons | all but Grappler (ASI handled as level-up) | Grappler (deliberately excluded per CLAUDE.md) |
| Conditions / Exhaustion | 15 + Exhaustion | all; Exhaustion uses the 2024 −2/level rule | — |

## 1. Accuracy bugs (wrong today, not merely missing)

These produce incorrect results in normal play; fix before adding content.

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
- **Cleric:** Life Domain Spells (L3, see §1.3).
- **Druid:** Primal Order (L1), Wild Companion (L2), Wild Resurgence (L5),
  Elemental Fury (L7) and Improved Elemental Fury (L15), Archdruid (L20); Circle
  of the Land Spells (L3), Nature's Ward (L10), Nature's Sanctuary (L14).
  Druid is the least complete class.
- **Fighter:** Tactical Mind (L2), Tactical Shift (L5).
- **Monk:** Unarmored Movement (L2), Slow Fall (L4), Acrobatic Movement (L9),
  Heightened Focus (L10).
- **Paladin:** Abjure Foes (L9), Restoring Touch (L14), Smite of Protection
  (Devotion L15), Oath of Devotion Spells (§1.3).
- **Ranger:** Deft Explorer (L2), Nature's Veil (L14), Hunter's Lore (L3).
- **Rogue:** Thief's Reflexes (Thief L17). Thieves' Cant exists only as a
  language (fine; it's narrative).
- **Sorcerer:** Dragon Companion (Draconic L18).
- **Warlock:** Eldritch Invocations beyond 2 of 28 (§3), Contact Patron (L9),
  Fiend Spells (§1.3).

Partial or unverified (check behaviour against the text):

- Paladin's Smite (L2): Divine Smite exists; check the free once-per-Long-Rest cast.
- Faithful Steed (L5): Find Steed exists; check the always-prepared + free cast.
- Improved Cunning Strike (Rogue L11): Cunning Strike and Devious Strikes
  exist; check that two effects can be applied at once.
- Wizard Ritual Adept (L1): ritual casting exists; check that rituals can be
  cast from the spellbook without being prepared.
- Druid Beast Spells (L18): no evidence that casting is allowed while Wild Shaped.

## 3. Warlock: Eldritch Invocations

Present: Agonizing Blast, Devil's Sight. Missing: Armor of Shadows, Ascendant
Step, Devouring Blade, Eldritch Mind, Eldritch Smite, Eldritch Spear, Fiendish
Vigor, Gaze of Two Minds, Gift of the Depths, Gift of the Protectors,
Investment of the Chain Master, Lessons of the First Ones, Lifedrinker, Mask of
Many Faces, Master of Myriad Forms, Misty Visions, One with Shadows,
Otherworldly Leap, **Pact of the Blade / Chain / Tome**, Repelling Blast,
Thirsting Blade, Visions of Distant Realms, Whispers of the Grave, Witch Sight.

The Pacts and Thirsting Blade matter most: without them a Warlock has no
pact identity and no Extra Attack path. Many others (Armor of Shadows,
Ascendant Step, Fiendish Vigor, Misty Visions, Mask of Many Faces, Otherworldly
Leap) are "cast spell X at will / without a slot", which the existing
free-cast machinery (`wishDuplicate`-style flags) should cover cheaply.

## 4. Monsters

Systemic gaps, each affecting many stat blocks:

| System | SRD stat blocks | State |
|---|---|---|
| Spellcasting | 59 | 2 casters; enemy casting supports only damage and single-target condition spells |
| Magic Resistance (Adv. on saves vs spells) | 34 | no system |
| Legendary Resistance (auto-succeed a failed save, N/day) | 33 | no system |
| Legendary Actions | 32 | supported (26 data references); spot-check coverage |
| Breath weapons / recharge | many | supported; 22 simplification notes trim riders |
| Grapple riders | many | supported; 18 notes defer specifics |
| Swallow / Engulf | ~11 notes | partial (4 engine references) |
| Shape-shift | 14 | deferred |

Magic Resistance and Legendary Resistance are the cheapest high-value fixes:
each is one hook in save resolution plus a data flag on the affected blocks,
and without them boss fights are much easier than RAW.

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

No code references: the **Search** and **Utilize** actions, **suffocation**,
**squeezing** into a smaller space, **crafting**, and **poisons** as items.
Present and 2024-correct: Exhaustion (−2 per level to d20 tests, death at 6),
weapon masteries, Heroic Inspiration, cover, opportunity attacks, death saves,
concentration.

## Suggested order

1. §1 accuracy bugs (small; wrong answers today).
2. Monster Magic Resistance + Legendary Resistance (one hook each, 30+ blocks).
3. Always-prepared subclass spells (fixes four subclasses at once).
4. Warlock Pacts + core invocations; Druid's missing base features.
5. Remaining class features, class by class, each with a spec per CLAUDE.md.
6. Monster spellcasting (needs enemy support for buff/control/AoE spells first).
7. Magic items, passive-number ones first; then mechanizable narrative spells.

## Reproducing

Scratch scripts used: load `SRD_SPELLS` / `SRD_ITEMS` with `tsx` and diff names
against headings extracted from `docs/srd-5.2.1.txt` (spell entries are the
line before `Level N <School> (` / `<School> Cantrip (`; class features are
`^Level N: ` lines under each `<Class> Class Features` heading). A spell
counts as narrative-only when it has no mechanical field and no id reference in
`src/backend/src/services/`.
