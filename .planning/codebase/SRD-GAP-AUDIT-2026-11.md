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

**Batch 2 done 2026-11-19 — magic weapons and armor.** +1 / +2 / +3 of every
SRD weapon and armor (and the Shield); Ammunition +1 / +2 / +3 for every
ammunition type (the bonus is folded into the shot's weapon in
`runPreattack`); named weapons via a new `magicRiders` field (extra damage on a
hit, doubled on a crit; `vsCreatureTypes`, `onCrit`, `rangedOnly`): Vicious
Weapon, Dragon Slayer, Giant Slayer, Flame Tongue, Holy Avenger, Weapon of
Warning (party Advantage on Initiative), Defender, Energy Bow (Force, no
ammunition), Mace of Disruption, Mace of Smiting, Sun Blade, Thunderous
Greatclub, Dwarven Thrower; named armor: Armor of Resistance (studded leather /
half plate / plate × ten types), Armor of Invulnerability, Dragon Scale Mail
(ten dragons), Dwarven Plate, Elven Chain (no armor training needed),
Glamoured Studded Leather, Arrow-Catching Shield (+2 AC vs ranged attacks),
Spellguard Shield, Shield of the Cavalier. The SRD Giants are now typed
`creatureType: 'giant'`. Found on the way: ammunition matching was by id
substring, so an Arrow-Catching Shield would have been fired as an arrow — only
quiver items are ammunition now. Simplifications: the "any weapon" items are
generated on a few representative bases; Flame Tongue is always ablaze;
Giant Slayer's Prone save, Mace of Disruption's / Smiting's destroy riders,
Smiting's +2 to hit Constructs, Defender's AC transfer, Holy Avenger's aura,
Dragon Scale Mail's breath Advantage, Dwarven Plate's push reduction,
Arrow-Catching's redirect and the Cavalier's bash aren't modeled; riders
don't apply to off-hand attacks. Deferred: Adamantine Armor (enemy Critical
Hits aren't modeled), Scimitar of Speed (Bonus Action attack), the cursed items
(Berserker Axe, Demon Armor, Armor of Vulnerability, Shield of Missile
Attraction) and the activated weapons (Javelin of Lightning, Dagger of Venom,
Mace of Terror, Nine Lives Stealer, Oathbow, Hammer of Thunderbolts, Trident of
Fish Command, Quarterstaff of the Acrobat, Animated Shield, Plate Armor of
Etherealness, Ammunition of Slaying).

**Batch 3 done 2026-11-19 — potions** (`LootItem.potion`, resolved in
`services/potions.ts`; `use` drinks it as a Bonus Action, or administers it to
an ally; oils apply out of combat only). Timed effects are conditions sourced
to `'potion'`, so they tick in combat, survive another caster's Concentration
ending (Haste's lethargy sweep, Bless, Enlarge/Reduce), and — new — run down
with in-world time out of combat (`elapsePotionTime`, called on a Short Rest
and on overland travel; other round durations still freeze between fights).
Mechanical: Potion of Climbing, Flying, Giant Strength (all six; competes with
a worn Belt and restores the displaced score when it ends), Growth,
Diminution, Heroism, Invisibility, Invulnerability, Resistance (ten types),
Speed (no lethargy), Vitality (clears Exhaustion and Poisoned; Hit Point Dice
heal their maximum for 24 in-world hours), Water Breathing, Elixir of Health,
Potion of Poison, Oil of Sharpness (the wielded weapon or 20 piercing
ammunition becomes the +3 version), Oil of Slipperiness. Narrative: Animal
Friendship, Clairvoyance, Mind Reading, Gaseous Form, Longevity, Oil of
Etherealness, Philter of Love. Simplifications: Potion of Poison is listed
under its true name (no unidentified items); Climbing's Athletics Advantage,
Slipperiness's Grease pour, Water Breathing (no drowning rules) and the Potion
Miscibility table aren't modeled; Heroism's Bless, like the spell's, adds to
attack rolls only (Bless on saves is an existing gap); the healing ladder keeps
its existing prices.

**Batch 4 done 2026-11-19 — wands, staffs and Spell Scrolls** (`LootItem.charges` /
`itemSpells` / `spellScroll`, resolved in `services/chargedItems.ts`; a
`cast_spell` with `itemInstanceId` skips the slot, preparation and Material
gates in `runPrecast`). Charges are tracked per inventory instance
(`charges_used`); a wand or staff works only while held (a wand in the off
hand, a staff wielded as a Quarterstaff); expending the last charge rolls the
d20 (a Staff of Power / of the Woodlands becomes a +2 / plain Quarterstaff
instead of vanishing); charges come back on a Long Rest. New: "Requires
Attunement by a …" (`attuneBy`: classes or any spellcaster) is enforced; a
`spell_attack_bonus` held effect (Wand of the War Mage also ignores Half
Cover); casting from an item with no spellcasting ability uses a +0 modifier;
wands and staffs need no components (Deafened, Silence, Slow don't stop them).
Wands: Binding, Fear, Fireballs, Lightning Bolts, Magic Detection, Magic
Missiles, Polymorph, Web, War Mage +1 / +2 / +3. Staffs: Charming, Fire,
Frost, Healing, Power, Swarming Insects, the Magi, the Woodlands. A Spell
Scroll for every SRD spell (only readable when the spell is on your list —
pansori's arcane / divine / primal lists; a spell above your highest slot
needs the DC 10 + level check; the scroll's own DC and attack bonus apply;
worth twice the scribing cost). Simplifications: "dawn" is the Long Rest;
Wand of Fear's Command isn't limited to flee / grovel and its Fear keeps the
spell's cone; Staff of Charming's Reflect / Resist Enchantment, Staff of
Power's and the Magi's Retributive Strike, the Magi's Spell Absorption and
regain-on-20, Swarming Insects' Insect Cloud and Woodlands' Tree Form aren't
modeled; a held staff's Resistance / AC needs it equipped; scrolls aren't
copyable into a spellbook. Deferred: Wand of Paralysis, Enemy Detection,
Secrets and Wonder (non-spell activations), Staff of Striking, Withering,
Thunder and Lightning and the Python (with the activated weapons), rods,
Necklace of Fireballs, Ring of Shooting Stars / Spell Storing and the other
charged wondrous items.

**Batch 5 done 2026-11-19 — activated weapons and armor** (on-hit layer in
`services/actions/attack/weaponPowers.ts`). New machinery: armed one-shot
powers (`weaponPowers`, the `item_power` action — Bonus Action or free, daily
or per charge, spent on the next hit); rider saves with conditions (`RiderSave`),
Temporary HP, sworn-enemy and melee-only gating, and creature-type exclusions;
natural-20 death effects (`critSlay`); a Bonus Action weapon attack
(`bonus_weapon_attack`); per-throw charges; item spells with their own DC /
damage / no Concentration / once per dawn, usable while worn or carried; the
Acrobat's deflection in the Shield reaction window. Items: Javelin of
Lightning, Dagger of Venom, Mace of Terror, Nine Lives Stealer, Oathbow,
Hammer of Thunderbolts (incl. Might of Giants and Giants' Bane), Trident of
Fish Command, Quarterstaff of the Acrobat, Scimitar of Speed, Frost Brand,
Vorpal Sword, Swords of Sharpness, Wounding and Life Stealing, Luck Blade,
Staffs of Striking, Withering and Thunder and Lightning, Adamantine and
Mithral Armor, Animated Shield, Plate Armor of Etherealness, Ammunition of
Slaying (14 types × 5 ammunition kinds). Found on the way: only 198 of 328
SRD monsters had a creature type (the union lacked half the SRD's types), so
type-keyed riders (Holy Water, Mace of Disruption, the Slayers) missed most
monsters — the union now has all 14 and every monster is tagged from the SRD
type line (Axe Beak and Roc were wrongly Beasts; they're Monstrosities).
Simplifications: Mace of Terror uses the Fear spell's cone (without
Concentration); Nine Lives Stealer starts with 5 charges and Luck Blade with
2 Wishes (the averages); Luck Blade's save bonus needs it wielded and its
Luck reroll isn't modeled; the Hammer's thunderclap catches only enemies;
the Oathbow's oath lasts the encounter; Vorpal treats Oozes, Elementals and
Plants as headless and ignores size; Sword of Sharpness's Exhaustion,
Withering's ability-check Disadvantage, Thunder and Lightning's combined use
and Thunderclap, the Trident's swim-speed limit, the Acrobat's light and
forms aren't modeled; Mithral and Animated Shield are mechanically the base
item (pansori doesn't enforce Stealth Disadvantage, Strength requirements or
hands); Adamantine only matters against enemy spell attacks (enemy weapon
attacks don't crit). Deferred: Dancing Sword, Staff of the Python, and the
cursed items (Berserker Axe, Demon Armor, Armor of Vulnerability, Shield of
Missile Attraction).

**Batch 6 done 2026-11-19 — cursed items.** New: `LootItem.curseEffects`
(active while attuned, worn or not — Remove Curse's broken attunement is the
only way out) and `curseLocksSlot`; a cursed item the bearer is attuned to
can't be de-attuned or given away. Berserker Axe (battleaxe / greataxe /
halberd): +1, +1 HP max per level while attuned (`item_hp_bonus`),
Disadvantage with other weapons, and damage from another creature forces a DC
15 Wisdom save or `berserk` (the menu offers only attacking the nearest enemy,
moving and ending the turn; ends with no enemy within 60 ft or with the
fight). Demon Armor (studded leather / chain mail / plate): +1 AC, clawed
Unarmed Strikes (1d8 Slashing, +1), can't be removed, Disadvantage on attacks
against Demons and on saves against their condition effects (the eight SRD
demons now carry `creatureSubtype: 'demon'`). Armor of Vulnerability (3 bases
× 3 types): Resistance while worn; the curse, revealed on attunement, gives
Vulnerability to the other two physical types (applied after Resistance, in
both PC damage paths). Shield of Missile Attraction: Resistance to ranged
weapon attacks while held; the curse redirects an enemy's ranged weapon
attack at anyone within 10 ft of the bearer to the bearer. Found on the way:
Remove Curse looked for `cursed` on the inventory entry (it lives on the
catalog item), so it never freed a real cursed item; it now also takes the
freed item off and re-derives its effects. Simplifications: berserk never
targets allies; self-inflicted damage can trigger it; the Demon Armor's
save Disadvantage doesn't reach damage-only saves, and Abyssal isn't modeled;
Missile Attraction only redirects enemy attacks. Still deferred: Dancing
Sword, Staff of the Python.

**Batch 7 done 2026-11-19 — wondrous items, round 2.** New machinery:
`carried` items (effects from the pack while attuned — an attuned Ioun Stone
counts as orbiting, attunement already caps them at three); an
`ability_increase` worn effect (+N to a cap, beaten by a higher set score);
an ability-check bonus (`checkPenalty`, used by every skill check, and
Initiative); `activate` (a Magic action while worn and attuned, spending a
charge or the daily use, resolving a `PotionEffect` — now with a `heal`
kind); `studyIncrease` for the Manuals and Tomes; per-weapon proficiency and
damage; an unarmored base AC; a spell save DC bonus; Advantage on saves
against Poisoned; a death-save floor and doubled Hit Dice; HP regeneration
with in-world time; and Disadvantage on attacks against the wearer until
damaged (reset with the turn). Items: Stone of Good Luck; Ioun Stones of
Agility, Awareness, Fortitude, Insight, Intellect, Leadership, Protection,
Regeneration, Strength and Sustenance; Belt of Dwarvenkind (with a
Darkvision floor, not stacking); the six Manuals and Tomes; Winged Boots;
Wings of Flying; Cloak of the Manta Ray; Bracers of Archery; Robe of the
Archmagi; Rod of Alertness (held; its four detection spells at will); the
Talismans of Pure Good and Ultimate Evil; Scarab of Protection; Periapts of
Health and Wound Closure; Ring of Regeneration; Cloak of Displacement.
Simplifications: studying is instant (out of combat) and removes the spent
book; Wings of Flying recover at dawn, not after 1d12 hours; the Belt's
non-dwarf benefits apply to everyone, and Dwarvish / its Persuasion edge
aren't modeled; the Rod's Protective Aura, the Talismans' touch damage and
fissure charges, the Scarab's Preservation charges and the Robe's Advantage
against non-spell magical effects aren't modeled; Displacement's break is
checked per damage instance. Deferred Ioun Stones: Absorption, Greater
Absorption, Mastery, Reserve.

**Batch 8 done 2026-11-19 — wondrous items, round 3 (items that cast spells).**
New machinery: `ItemSpell.attack` (a fixed spell attack bonus), `ItemSpell.selfOnly`
(the item casts on its wearer only), `ItemCharges.consumable` (the charges are
the item — spending the last one uses it up), a `regain_slot` activation
(Pearl of Power, usable from the pack) and a worn `truesight` sense (feeds
`truesightFt`, so it sees Invisible creatures in range). Items: Necklace of
Fireballs; Necklace of Prayer Beads; Rings of Animal Influence, Shooting
Stars, Telekinesis, Jumping and Water Walking; Circlet of Blasting; Helms of
Teleportation, Telepathy and Comprehending Languages; Medallion of Thoughts;
Eyes of Charming; Cape of the Mountebank; Boots of Levitation; Hat of
Disguise; Rod of Resurrection; the four Crystal Balls; Robe of Stars; Cloak of
Arachnida; Chime of Opening; Wind Fan; Pearl of Power; Necklace of
Adaptation; Robe of Eyes. Simplifications: the Necklace of Fireballs has a
fixed 6 beads and the Prayer Beads one bead of each kind, cast at the spell's
own casting time; the Ring of Animal Influence's Fear isn't limited to
Beasts; the Ring of Shooting Stars' Lightning Spheres and Shooting Stars, the
Robe of Stars' Astral trip, Cloak of Arachnida's Spider Walk and doubled Web,
the Crystal Balls' sensor-bound extras and the Robe of Eyes' Light / Daylight
drawback aren't modeled; the Robe of Stars' stars return at dawn, not dusk;
the Wind Fan gets one safe use per dawn instead of its tearing chance. The
Rod of Resurrection's Resurrection is castable through the API but isn't
offered in the choice list (revive spells never are for item casts yet).

**Batch 9 done 2026-11-20 — activated items, round 2 (effects that aren't
spells).** New machinery: item powers (`campaignData/srd/itemPowers.ts`) —
spell-shaped `itemPower` effects resolved by the spell engine (attack roll,
save, cone / sphere / cube, save-ends conditions) but on no class list and
outside the spell table, reachable only through their item; Emanations
centered on the user for AoE conditions; `ItemSpell.backfire` (a chance to
explode in the user's hands); `activate.bonusAction`; `evasionRing` (a failed
Dex save against an enemy spell becomes a success for a charge and the
Reaction); a `missile_snaring` worn effect (a ranged weapon hit loses 1d10 +
DEX for the Reaction); and item invisibility that attacking doesn't end.
Items: Wand of Paralysis, Ring of the Ram, Horn of Blasting, Bead of Force,
Pipes of Haunting, Rod of Rulership, Boots of Speed, Gloves of Missile
Snaring, Ring of Evasion, Ring and Cloak of Invisibility, and the Ring of
Shooting Stars' Shooting Stars. Simplifications: the Ram's push and
object-breaking, the Bead's trapping sphere (and a fixed pouch of 6), the
Pipes' 24-hour immunity and the Rod's early end when harmed aren't modeled;
every Shooting Stars mote lands on one point; Boots of Speed are one
10-minute use per Long Rest; Missile Snaring and the Ring of Evasion resolve
automatically (the free hand isn't checked, and the ring covers enemy spell
saves only, not monster on-hit saves); the Ring of Invisibility lasts an hour
per use and neither item's invisibility ends early when it's removed.
Deferred: Dust of Sneezing and Choking (it catches the user too), Robe of
Scintillating Colors, the Ring of Shooting Stars' Lightning Spheres.

**Batch 10 done 2026-11-20 — summoning items.** Item powers can now carry a
`summon` block (stat blocks read from the SRD bestiary). Used out of combat,
the item calls its creature into `summoned_allies` (it joins the next battle,
like Animate Dead); item creatures are tagged `fromItem`, revert at the next
Long Rest, and using the item again replaces its earlier creature. New
`ItemSpell.rechargeDays` + `InventoryItem.recharge_rests`: a property that
takes days to return counts down one per Long Rest (a pansori day). Items:
Figurines of Wondrous Power (Bronze Griffon, Ebony Fly — the Giant Fly as a
non-combatant mount — Golden Lions, Marble Elephant, Obsidian Steed, Onyx
Dog, Serpentine Owl, Silver Raven); Horns of Valhalla (Silver, Brass, Bronze,
Iron); Bowl / Brazier / Censer / Stone of commanding elementals; the four
Elemental Gems; Ring of Djinni Summoning; Staff of the Python.
Simplifications: creatures last until the Long Rest rather than their listed
hours (and use the existing one-attack ally model); the Horn of Valhalla's
requirement and its spirits' Charmed / Frightened immunity, the Obsidian
Steed's disobedience, the djinni's Concentration and chance of leaving, and
the Python staff shattering when the snake dies aren't modeled. Deferred:
Ivory Goats, Bag of Tricks (random tables), Pipes of the Sewers (uncontrolled
swarms), Efreeti Bottle.

**Batch 11 done 2026-11-20 — utility and travel items.** New machinery:
`LootItem.holds` (extradimensional containers: carried items up to a weight
don't count toward the load — the Efficient Quiver only takes ammunition and
weapons); item flight conditions (`ITEM_FLIGHT`, alongside Winged Boots and
Wings of Flying); worn effects `reveal_invisible` (an Invisible target within
range doesn't impose Disadvantage), `dark_flight` (a Fly Speed in Dim Light or
Darkness), `free_action` (Difficult Terrain costs nothing extra, Slow doesn't
halve Speed), `feather_fall` (no falling damage), `mount_speed` and
`mount_float` (carried horseshoes boost the ridden mount, or let it float over
Difficult Terrain and water); `activate.reuseExhaustionDc`; a party-wide
timed activation (`PotionEffect.condition.party`) and minute dice (`'2d4m'`);
`Spell.onlyVs` (a power that only works on named creatures) and
`Spell.conditionEscape` (an attack power's condition escaped by a save-ends
check); `ItemSpell.attack: 'dex'` (Dex + Proficiency Bonus); and a repeating
item attacker keeps its fixed bonus (`recurring_attack.attackBonus`). Found on
the way: worn skill Advantage (Eyes of the Eagle) now applies to searches.
Items: Bag of Holding, Handy Haversack, Portable Hole, Efficient Quiver; the
four Carpets of Flying, Broom of Flying, Horseshoes of Speed and of a Zephyr,
Folding Boat, Ropes of Climbing and Entanglement; Rings of Feather Falling,
Free Action, Mind Shielding and X-ray Vision; Cloak of the Bat; Amulet of the
Planes, Cubic Gate, Well of Many Worlds, Instant Fortress; Gem of Seeing,
Lantern of Revealing, Eyes of Minute Seeing, Gloves of Thievery, Sending
Stones, Wands of Secrets and Enemy Detection; Dust of Disappearance, Dust of
Dryness, Decanter of Endless Water, Eversmoking Bottle, Gem of Brightness,
Iron Bands, Dimensional Shackles, Immovable Rod, Bead of Nourishment,
Sovereign Glue, Universal Solvent, Marvelous Pigments; and the six Feather
Tokens (the Bird calls a Roc mount that can't attack; the Whip strikes at +9
and again as a Bonus Action). Table-color items (the boat, ropes of climbing,
rod, bottle, fortress, shackles, glue, pigments, …) carry a narrative
activation. Simplifications: containers track weight only (no volume, no
nesting); the carpet carries only its rider, and neither it nor the broom
checks weight; the horseshoes fit whichever mount the bearer rides; Free
Action's immunities cover every source; Cloak of the Bat's Polymorph, the
Amulet of the Planes' Arcana check, the X-ray range limits and the Lantern
revealing Invisible creatures to anyone but its bearer aren't modeled; Gloves
of Thievery have no effect yet (nothing rolls Sleight of Hand); escape checks
(Rope of Entanglement, Iron Bands) run as end-of-turn saves, and Iron Bands
aren't destroyed by a successful escape; dusts, glue, solvent and pigments
come in fixed amounts; the Well of Many Worlds recharges at dawn. Known issue
(not fixed): ammunition bundles weigh their per-bundle weight per piece, so
20 Arrows count 20 pounds instead of 1.

**Batch 12 done 2026-11-20 — unique items.** New machinery: enemy spells can
be canceled before they resolve (`LootItem.absorbSpells`, auto-resolved with
a Reaction — the Rod of Absorption takes a spell aimed at its bearer alone and
stores its levels as energy that refills expended slots up to level 5; Ioun
Stones of Absorption cancel spells up to level 4 / 8 cast at anyone in the
party, burning out after 20 levels); spell storing (`LootItem.spellStore`,
`cast_spell` with `storeInItem` — the spell is held with its slot level, save
DC and attack bonus, and cast back out from the item); worn effects
`spell_turning`, `creature_bane`, `ignore_difficult_terrain` and a worn Fly
Speed (`speed_mode` 'fly'); `ItemSpell.uses` (a per-spell supply, the Helm of
Brilliance's gems) and `ItemSpell.requires` (slots + gold, the Manuals of
Golems); `activate.rechargeDays`; a Drain Life rider (`healHalf`); permanent
item summons (`summon.permanent`); and Candle of Invocation Advantage on
attack rolls and saves. Items: Ring of Three Wishes; Cube of Force; Ring of
Spell Turning; Rod of Absorption; Ioun Stones of Absorption, Greater
Absorption and Reserve; Ring of Spell Storing; the five Dancing Swords; Helm
of Brilliance; Rod of Lordly Might; Rod of Security; the four Rings of
Elemental Command; Candle of Invocation; the four Manuals of Golems; Bag of
Devouring. Simplifications: absorption and turning resolve automatically;
Spell Turning doesn't deflect a spell back; the stores start empty and only
their bearer casts into them; drawing on the rod's energy takes no action;
the Dancing Sword's strike is a Bonus Action attack with it in hand; the
Helm's gem counts are fixed (5 / 10 / 15 / 20), its flames last the fight,
and its Diamond Light, losing Fire Resistance with the last ruby and bursting
on a failed save against fire aren't modeled; the Rod of Lordly Might's
on-hit powers are armed beforehand and its six button forms aren't modeled;
Elemental Compulsion charms rather than letting you steer the Elemental; the
Cube's Shield (a Reaction) isn't offered; the Candle burns all 4 hours at
once and doesn't cover ability checks or the free level 1 spells; golems take
no in-world time to build; the Bag of Devouring devours nothing yet. Still
deferred: Ioun Stone of Mastery (Proficiency Bonus is derived from level at
~40 sites); Iron Flask (capturing and releasing a creature); Mirror of Life
Trapping, Sphere of Annihilation and Talisman of the Sphere (world objects);
Apparatus of the Crab (a vehicle); Dragon Orb (an Artifact); the random-table
items (Mysterious Deck, Wand of Wonder, Hat of Many Spells, Bag of Beans, Deck
of Illusions, Robe of Useful Items) alongside the batch 9–10 deferrals.

**Batch 13 done 2026-11-20 — random-table items, part 1.** New machinery: an
item power can be resolved by its own table (`Spell.itemEffect`, dispatched by
`castSpell/itemEffects.ts` once the charge is spent), and a table result can
cast a real spell through the same handler as a free cast with the item's DC
(`ctx.tableCast`, server-side only); item summons can be rolled from a list
(`summon.randomForms`) and can stack (`summon.stacks`), and each of an item's
powers now keeps its own creature (`fromItem` is `instance:power`); a
self-centered damage Sphere is an Emanation from the caster; a save-ends
condition can harden into another on a failed repeat save
(`conditionFailInto` → `save_ends.failInto`). Fixed along the way: Invisibility
gained during an action (not just from an Invisibility-named cast) is no longer
stripped by that same action. Items: Wand of Wonder (the full d100 table —
Darkness / Faerie Fire / Fireball / Slow / Stinking Cloud, Gust of Wind,
Lightning Bolt, Invisibility on yourself and Polymorph into a Black Bear,
Giant Wasp or Frog at DC 15; self-Stun, 1d6 Psychic, Enlarge on the target,
shrinking yourself, the blinding burst, the gem stream and the creeping
petrification); the Gray, Rust and Tan Bags of Tricks; the Bag of Beans; and
the Ivory Goats. Simplifications: the wand's rain, butterflies, grass, leaves
and vanished object are scenery (no obscured areas on the grid); its hostile
Rhinoceros / Elephant / Rat wanders off; the burst spares allies; the whole gem
stream hits the target, and the gems are gathered as gold. Bag of Tricks
creatures come out between fights like the other item creatures. The Bag of
Beans holds a fixed 7 beans; a planted bean's creatures (Treant, Shriekers,
Bulette, toads, the pyramid's Undead) and its toadstools and eggs are
described rather than placed; the fruit tree's 1d8 potions go into the pack.
The goats stay until the next Long Rest; the Goat of Traveling's charge-hours
and the Goat of Terror's horn weapons and fear aura aren't modeled. Still
deferred: Hat of Many Spells, Deck of Illusions, Robe of Useful Items, the
Mysterious Deck, and the batch 9–12 deferrals.

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
