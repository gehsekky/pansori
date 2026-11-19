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
| Eldritch Invocations | 28 | all 28 (done 2026-11-18; see §3) | simplifications in §3 |
| Monsters | 330 | 328 | 169 `// Simplification:` notes; systemic gaps below |
| Monster spellcasting | 59 stat blocks | 33 with combat spells (done 2026-11-18; §4) | the rest list only utility / narrative spells |
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

**Found 2026-11-17: Unarmored Defense was never applied.** Barbarian and Monk
Unarmored Defense, and Draconic Resilience's AC (10 + DEX + CHA), weren't in
the AC formula at all — a Monk or Barbarian had 10 + DEX. Fixed: every stored-AC
write now goes through one `characterAc` (`services/armorClass.ts`), which takes
the best single calculation (SRD Multiclassing: Armor Class) and keeps an
active Shield spell's +5. AC is also recomputed on level-up, ASI, feats and
subclass choice (a DEX increase used to wait for the next rest). The FE's grid
preview now reads the engine's effective Speed (`GameState.speed_ft`) instead
of base Speed, so Fast Movement / Roving / Haste / Unarmored Movement show.

## 2. Class features — missing or partial

Missing (no code path):

- ~~**Barbarian:** Primal Knowledge (L3), Instinctive Pounce (L7), Improved Brutal
  Strike (L13 Staggering/Sundering Blow; L17 2d10 + two effects — only Forceful
  Blow and Hamstring Blow exist), Berserker Mindless Rage (L6).~~ Done 2026-11-17
  (`services/barbarianFeatures.ts`). Primal Knowledge's skill is a
  `choose_bonus_skill` pick (a generic feature-skill grant, reusable for Lore's
  Bonus Proficiencies); its STR-for-skills option auto-picks the better score at
  every Acrobatics / Intimidation / Perception / Stealth check site. Pounce is
  extra movement on the Rage turn (the Dash budget refund). Simplifications:
  Staggering Blow's "next saving throw" is every save until the round wraps, and
  Staggering / Sundering end on the round wrap like Hamstring; Sundering's +5
  applies to PC weapon and spell attack rolls (summon / companion attacks don't
  read it).
  **Found on the way:** (1) Dash, Cunning Action Dash, Step of the Wind, Fleet
  Step and the species dash clamped `movement_used` at 0, so dashing *before*
  moving granted nothing — fixed (negative = extra budget, as Expeditious
  Retreat already did). Known edge: Steady Aim's "haven't moved" test reads
  `movement_used <= 0`, so Dash-then-move-then-Steady-Aim slips through.
  (2) Skill-proficiency lookups were case-sensitive while class picks are stored
  `'stealth'` and backgrounds `'Stealth'` — a class-picked Stealth / Perception
  didn't count for Hide, the surprise roll, jump landings, or trap detection,
  and Sneak read the class's default list instead of the character. All sites
  now go through `hasSkillProficiency` (spelling-insensitive).
- ~~**Bard:** Font of Inspiration (L5: regain on Short Rest, spend a slot to
  regain a use), Magical Secrets (L10), College of Lore Bonus Proficiencies (L3)
  and Magical Discoveries (L6).~~ Done 2026-11-18 (`services/bardFeatures.ts`).
  The Short Rest refill already existed; Font of Inspiration's slot spend is a
  no-action combat choice that uses the lowest open slot. Magical Secrets
  widens the level-up `learn_spell` pick to the divine and primal lists (the
  arcane tag stands in for the Wizard list). Bonus Proficiencies reuses the
  `choose_bonus_skill` grant (moved to `services/bonusSkills.ts`). Magical
  Discoveries picks are always prepared via `alwaysPreparedSpells`.
  Simplifications: neither Magical Secrets' nor Magical Discoveries' "replace a
  spell on level-up" is modeled (pansori has no known-spell swap for Bards).
- ~~**Druid:** Nature's Sanctuary (L14).~~ Done 2026-11-18
  (`druidFeatures.ts`, a `sanctuary` SpellZone). Magic action + a Wild Shape
  use; the 3×3 cube is centered on a chosen party member within 120 ft, lasts
  10 rounds, and moves 60 ft via `move_zone` for a Bonus Action. Half Cover is
  +2 AC against enemy attacks; allies share the Ward Resistance against enemy
  attacks. Simplifications: the cover's +2 to DEX saves and the Resistance
  against enemy spells / zones aren't applied; the cube centers on a creature,
  not an arbitrary ground cell. (Earlier, done 2026-11-12: Primal Order,
  Wild Companion, Wild Resurgence, Elemental Fury + Improved, Archdruid's
  Evergreen Wild Shape and Nature Magician, Nature's Ward, Beast Spells —
  `services/druidFeatures.ts`, `actions/classFeature/druid.ts`. Wild Shape
  itself was fixed: a Bonus Action, Temporary Hit Points = Druid level — it
  used to take the Action and add 2× level to real HP, above the maximum.
  Wild Companion is out of combat only, like other summons.)
- ~~**Fighter:** Tactical Mind (L2), Tactical Shift (L5).~~ Done 2026-11-17
  (`services/fighterFeatures.ts`). Tactical Mind is auto-applied like Peerless
  Skill: on a failed ability check the d10 is rolled and a Second Wind spent
  only if it rescues the check (every PC check site). Tactical Shift gives a
  half-Speed budget (`turn_actions.tactical_shift_ft`) that a grid move fitting
  inside spends instead of Speed, provoking no Opportunity Attacks.
- ~~**Monk:** Unarmored Movement (L2), Slow Fall (L4), Acrobatic Movement (L9),
  Heightened Focus (L10).~~ Done 2026-11-17 (`services/monkFeatures.ts`).
  Simplifications: Acrobatic Movement makes climb / swim cells cost no extra
  movement (no verticality model); Slow Fall is auto-used inside
  `applyFallingDamage`, which nothing triggers yet; Heightened Focus's Step of
  the Wind carry-an-ally rider isn't modeled.
- ~~**Paladin:** Abjure Foes (L9), Restoring Touch (L14), Smite of Protection
  (Devotion L15).~~ Done 2026-11-18 (`services/paladinFeatures.ts`). Abjure
  Foes targets the nearest CHA-mod non-invisible foes within 60 ft; an
  `abjured` tag ends the Frightened when the creature takes damage
  (`breakAbjureOnDamage`, the same end-of-action choke point as the charm
  break). Restoring Touch extends Lay on Hands' 5-point cure with a
  `condition`. Smite of Protection (Oath of Devotion L15) sets
  `turn_actions.smite_of_protection` on casting Divine Smite: Half Cover
  (+2 AC against enemy attacks, not stacking with Nature's Sanctuary) for the
  aura. Simplifications: Abjure Foes' "only one of move / action / Bonus
  Action" limit isn't enforced on enemy turns; Smite of Protection's cover
  lasts until the round wraps (where `turn_actions` reset), not exactly the
  Paladin's next turn, and doesn't add +2 to DEX saves.
- ~~**Ranger:** Deft Explorer (L2), Nature's Veil (L14), Hunter's Lore (L3).~~
  Done 2026-11-18 (`services/rangerFeatures.ts`). Deft Explorer's Expertise
  (1 skill) and the L9 Expertise (2 more, also missing before) use the shared
  Expertise pick. Hunter's Lore reveals the marked creature's immunities,
  resistances and vulnerabilities when Hunter's Mark lands. Nature's Veil is a
  Bonus Action Invisible (duration 2, so it lifts as the turn after next
  begins) that attacking doesn't end; WIS-mod uses per Long Rest.
  Simplification: Deft Explorer's two languages aren't modeled (pansori has no
  languages).
- ~~**Rogue:** Thief's Reflexes (Thief L17).~~ Done 2026-11-18
  (`services/rogueFeatures.ts`): combat start adds a second initiative slot at
  Initiative − 10 tagged `extra_turn_round`; the turn loop passes over it once
  that round has wrapped, and both wrap paths (the main advance and the
  reaction resume) drop it. Thieves' Cant exists only as a language (fine;
  it's narrative). Found on the way: the round counter isn't reset between
  combats, and the reaction-resume wrap doesn't bump it (or tick zones and
  concentration) — the extra slot records its own round rather than relying
  on `round` starting at 1.
- **Sorcerer:** Dragon Companion (Draconic L18).
- **Warlock:** Contact Patron (L9). (Invocations done 2026-11-18, §3.)

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

The last six done 2026-11-18:
- Lessons of the First Ones (repeatable): each learning takes an Origin feat
  (`choose_lessons_feat`); Magic Initiate's spells follow one at a time
  (`choose_feat_spell`, `services/actions/lessons.ts`) and Skilled's skills via
  the shared bonus-skill grant.
- Gift of the Depths: Swim Speed (water costs no extra movement) and a free
  Water Breathing once per Long Rest (`freeSpell.oncePerLongRest`).
- Gift of the Protectors: party members are written on the page out of combat
  (CHA-mod names); a named creature knocked to 0 HP by an enemy attack (and not
  killed outright) stays at 1 HP, once per Long Rest of that Warlock.
- Gaze of Two Minds: a Bonus Action link (touch to start, any distance to
  maintain; `gaze_linked`, duration 2); while within 60 ft, a spell's range and
  line of sight can be measured from the ally's space.
- Investment of the Chain Master: Quick Attack (`familiar_quick_attack`, a
  Bonus Action familiar attack).
- Witch Sight: Truesight 30 ft (`truesightFt`) — pierces magical darkness and
  negates an invisible target's defence within range.

Simplifications for these: Gift of the Protectors triggers only on the
enemy-attack knockout path (like Relentless Endurance); Gaze of Two Minds
doesn't lend the ally's special senses, and attack-roll edges (cover, light)
are still measured from the Warlock; the Chain Master's flying / swimming
familiar, damage-type swap, save DC and Resistance reaction aren't modeled
(familiars don't move independently, their damage ignores type, they have no
save effects, and enemies never target summons); Witch Sight doesn't stop an
invisible enemy's Advantage against the Warlock or see through shapechanges;
breathing underwater has no system to apply to.
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
| Spellcasting | 59 | **done 2026-11-18** for the combat spells — see below |
| Magic Resistance (Adv. on saves vs spells) | 34 | **done** (`services/monsterSaves.ts`) |
| Legendary Resistance (auto-succeed a failed save, N/day) | 32 | **done**; spent on effect saves, not damage-only ones (AI policy) |
| Legendary Actions | 32 | supported (26 data references); spot-check coverage |
| Breath weapons / recharge | many | supported; 22 simplification notes trim riders |
| Grapple riders | many | supported; 18 notes defer specifics |
| Swallow / Engulf | ~11 notes | partial (4 engine references) |
| Shape-shift | 14 | deferred |

Monster Spellcasting landed 2026-11-18. Every SRD caster with a combat spell
the enemy resolver can express now lists it (`spells`), with its "level N
version" (`spellLevels`, upcast damage), its "N/Day" limit (`spellsPerDay`,
tracked in `GameState.enemy_spell_uses`; a countered spell still spends its
use), its save DC and spell attack bonus (DC − 8 when the block lists none):
the ten adult/ancient chromatic and metallic dragons that cast, Cultist
Fanatic, Druid, Dryad, Efreeti, Green Hag, Guardian Naga, Incubus, Lich, Mage,
Archmage (now Lightning Bolt, per 5.2.1, not Fireball), Mummy Lord, Night Hag,
Oni, Spirit Naga, Unicorn. The resolver gained spell attack rolls (vs AC with
Half Cover, crits, one roll per Scorching Ray ray), damage-spell riders on a
failed save or a hit (Phantasmal Killer, Ray of Sickness), no-damage control
areas (Fear, Hypnotic Pattern, Entangle), and a spell that gets past
Counterspell now resolves in full (save, area, rider) instead of as raw damage.
Guiding Bolt and Ice Storm gained their missing upcast bonus (PCs too).
Simplifications: utility / narrative spells (Detect Magic, Scrying, Plane
Shift, Invisibility, Fly, Darkness, Dispel Magic, …) aren't cast; Command,
Confusion and Sleep are left out (their PC-side condition has no effect or no
end); healing spells (Guardian Naga's Cure Wounds) and the Priest's Spirit
Guardians aura aren't cast; lingering areas (Moonbeam, Wall of Fire, Insect
Plague) resolve once; Ice Knife's explosion, Acid Arrow's delayed damage,
Guiding Bolt's Advantage rider and extra targets from upcast Hold Person /
Charm Person aren't modeled; the cast decision is a per-turn `castChance`, and
spell range isn't checked.

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

**Batch 1 done 2026-11-19 — worn passives** (`wornEffects`, derived onto
`Character.worn_traits` by `syncSetAbilities`): Bracers of Defense, Ring of
Resistance (all ten types), Boots of the Winterlands, Ring of Warmth, Brooch of
Shielding, Periapt of Proof against Poison, Mantle of Spell Resistance, Boots of
Striding and Springing, Ring of Swimming, Gloves of Swimming and Climbing,
Slippers of Spider Climbing, Boots and Cloak of Elvenkind, Eyes of the Eagle,
Goggles of Night, Sentinel Shield. New worn-effect kinds: unarmored-only AC,
resistance, damage immunity, damage reduction, spell immunity, condition
immunity, skill Advantage (Stealth: Hide / Sneak / surprise; Perception: +5
passive for traps), Initiative Advantage, Swim / Climb Speed, Speed floor,
Darkvision, Advantage on saves against spells. Found on the way and fixed:
enemy spells ignored every PC resistance (Rage, species, Stoneskin, …) — they
now share `pcDamageResponse` with enemy attacks; worn save bonuses (Cloak / Ring
of Protection) weren't added to enemy damage-spell saves; Rage resisted every
damage type (2024: Bludgeoning / Piercing / Slashing only). Simplifications:
Gloves of Swimming and Climbing's +5 Athletics, the Boots of Striding and
Springing jump, Winter Strider, and the Cloak of Elvenkind's Disadvantage on
Perception to spot you aren't modeled; Advantage on Stealth / Perception only
reaches the checks listed above. Deferred from this batch: Stone of Good Luck
and Ioun Stones (no body slot fits a carried stone), Ring of Free Action
(needs a magic-vs-mundane source for Paralyzed / Restrained), Belt of
Dwarvenkind (needs an ability *increase* effect).

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

**Spell attack rolls honor conditions — done 2026-11-13** (`services/attackEdges.ts`).
One `computeAttackEdges` now feeds weapon, single-target spell, per-beam
(Eldritch Blast / Scorching Ray) and recurring spell attacks (Spiritual Weapon,
Vampiric Touch, ...): the attacker's conditions, Ranged Attacks in Close Combat
(touch spells are melee), target conditions read from the condition registry,
Prone by distance (within 5 ft Advantage, else Disadvantage), Cover, Vision &
Light, Exhaustion's d20 penalty, and the one-shot grants (Help, Heroic
Inspiration, Steady Aim, Vex, Studied Attacks). Fixed along the way for weapon
attacks too: a Stunned, Restrained, Petrified or Unconscious target granted no
Advantage (only Paralyzed / Blinded / Prone / Faerie Fire were checked); a hit
on a Paralyzed target from within 5 ft wasn't a Critical Hit (only Unconscious
was); Prone used melee/ranged instead of the 5-ft distance (a reach weapon got
Advantage at 10 ft). The Unconscious condition now grants attackers Advantage
in the registry, so enemies get it against an Unconscious PC as well.
Simplifications: recurring spell attacks are treated as made from within 5 ft
with no Cover; the "enemy who can see you" clause of close-combat Disadvantage
isn't modeled; flanking stays weapon-only.

No code references: the **Search** and **Utilize** actions, **suffocation**,
**squeezing** into a smaller space, **crafting**, and **poisons** as items.
Present and 2024-correct: Exhaustion (−2 per level to d20 tests, death at 6),
weapon masteries, Heroic Inspiration, cover, opportunity attacks, death saves,
concentration.

## Suggested order

1. ~~§1 accuracy bugs~~ and ~~always-prepared subclass spells~~ (done 2026-11-12).
2. ~~Monster Magic Resistance + Legendary Resistance~~ (done 2026-11-12).
3. ~~Grapple / Shove as 5.2.1 saves~~, ~~Warlock Pacts + core invocations~~
   and Druid base features (done 2026-11-12); ~~spell attacks honoring
   conditions~~ (done 2026-11-13).
4. Remaining class features, class by class, each with a spec per CLAUDE.md.
5. ~~Monster spellcasting~~ (done 2026-11-18, §4).
6. Magic items, passive-number ones first; then mechanizable narrative spells.

## Reproducing

Scratch scripts used: load `SRD_SPELLS` / `SRD_ITEMS` with `tsx` and diff names
against headings extracted from `docs/srd-5.2.1.txt` (spell entries are the
line before `Level N <School> (` / `<School> Cantrip (`; class features are
`^Level N: ` lines under each `<Class> Class Features` heading). A spell
counts as narrative-only when it has no mechanical field and no id reference in
`src/backend/src/services/`.
