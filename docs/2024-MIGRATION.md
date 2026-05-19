# Pansori — 2024 PHB Migration Tracker

This document inventories every place Pansori's rules engine deviates from
the 2024 PHB / D&D 2024 ("One D&D") rules and tracks the migration toward
the 2024 baseline.

## Current state

Pansori is **hybrid**:

- **Core combat resolution**: 2024 SRD 5.2.1 (49 citations). Concentration
  DCs, massive damage, death saves, exhaustion, temp HP, grapple/shove as
  unarmed strikes, opportunity attacks, etc. — all follow the 2024 SRD.
- **Class & subclass features**: 2014 PHB (52 page citations using 2014
  pagination). The 2024 SRD doesn't cover subclasses; those are paid-PHB-
  only. We filled in from the 2014 PHB.
- **A few 2024-specific additions explicitly cited**: Heroic Inspiration
  (granted on Nat-1), Cleric L1 subclass timing.

## Target state

**Lean fully into 2024.** Where the 2024 PHB reworks a class feature, port
the implementation. Where it adds entirely new mechanics (Weapon Masteries),
add them. Update Heroic Inspiration to the full 2024 spec.

## Migration order

Listed by impact × tractability. Each item is its own PR.

| #   | Feature                        | Effort | Status  | Notes                                                          |
| --- | ------------------------------ | ------ | ------- | -------------------------------------------------------------- |
| 1   | Heroic Inspiration expansion   | ~1h    | pending | Additive — currently attack-only                               |
| 2   | Bardic Inspiration spend rules | ~2h    | pending | 2024 expands what the die can apply to                         |
| 3   | Weapon Masteries (framework)   | ~3h    | pending | New 2024 system; 9 masteries to support                        |
| 4   | Weapon Masteries (per-class)   | ~2h    | pending | Fighter (3), Paladin (2), Ranger (2), Barbarian (2), Rogue (2) |
| 5   | Wild Shape → Beast Forms       | ~4h    | pending | Replaces temp-HP-pool model                                    |
| 6   | Rage progression               | ~1h    | pending | Mostly the same — confirm diff                                 |
| 7   | Class feature audit pass       | ~4h    | pending | Cleric CD, Fighter Second Wind, etc.                           |

---

## 1. Heroic Inspiration — expand spend rules

**2014**: Inspiration was a DM-granted token used for advantage on one roll
(attack, save, or check). No formal mechanic for earning it.

**2024**: Granted on a Nat-1 d20 (or by DM). Spendable for advantage on
**any d20 test** (attack, save, ability check). Optional rule: also
spendable to add 1d4 to the roll instead of advantage.

**Pansori today**:

- Granted on Nat-1 (✓ matches 2024).
- Only spendable on attack rolls via `spend_inspiration` action setting
  `turn_actions.inspiration_pending`, which is consumed in the next attack's
  advantage calc. Saves and ability checks aren't player-mediated in the
  current engine — they're rolled inline as part of action resolution.

**Migration plan**:

- Keep the Nat-1 grant.
- Add `inspiration_active` flag (or extend `inspiration_pending` semantics)
  that consumes on the NEXT d20 of any kind, not just attacks.
- The places that roll saves on behalf of the PC (concentration, condition
  saves, contested grapple/shove) need to check this flag and apply
  advantage if set.
- UI: when a save is about to be rolled, optionally let the player choose
  to spend inspiration. v1: auto-consume on the next save if `pending` is
  set (matches the existing auto-consume-on-next-attack semantics).

**Risks**: low. Additive expansion of an existing mechanic. Doesn't change
the granting side or break existing playthroughs.

## 2. Bardic Inspiration — 2024 expanded uses

**2014**: Bonus action grants an ally a Bardic Inspiration die (d6 at L1,
scales). Ally can roll and add to one ability check, attack roll, or saving
throw within 10 minutes.

**2024**: Same grant mechanic. The die can also be added to **any d20 test
the ally makes** including death saves and initiative rolls. New 2024
addition: a creature can spend Bardic Inspiration to add to one damage roll
of an attack they hit with.

**Pansori today**:

- Grant: `bardic_inspiration` use_class_feature works.
- Spend: ally adds the die to their next attack roll. Save/check spending
  isn't wired (same gap as Heroic Inspiration).

**Migration plan**:

- Extend the spend point so saves and checks can also consume the die.
- Add damage-roll spending as a separate optional choice when an ally hits.

**Risks**: low-medium. Damage-roll spending requires a new choice surface
in the attack-resolution UI.

## 3. Weapon Masteries (NEW IN 2024)

The biggest new combat system in 2024. Every martial weapon has a single
**Mastery** property. Classes that get Weapon Mastery (Fighter, Paladin,
Ranger, Barbarian, Rogue) can apply the mastery property of weapons they
have mastered.

The 9 masteries:

| Mastery | Effect                                                                                                                                               |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vex     | On a hit, you have advantage on your next attack against the target this turn or next                                                                |
| Topple  | On a hit, target makes a CON save (vs your weapon save DC) or is knocked prone                                                                       |
| Push    | On a hit, push target 10 ft away (Large or smaller)                                                                                                  |
| Sap     | On a hit, target has disadvantage on its next attack roll before its next turn ends                                                                  |
| Slow    | On a hit, target's speed drops by 10 ft until start of your next turn                                                                                |
| Nick    | When you make the extra attack of the Light property, you can do so as part of the Attack action instead of a Bonus Action                           |
| Cleave  | When you hit a creature with melee weapon attack, you can make a melee attack with the same weapon against another creature within 5 ft of the first |
| Graze   | If your attack roll misses, the target takes damage equal to your STR (or DEX) modifier (no damage type)                                             |
| Flex    | Versatile weapon's two-handed damage applies when wielded one-handed if no shield equipped                                                           |

**Weapon mastery property assignments** (from the 2024 PHB weapon table):

- Longsword: Sap
- Greatsword: Graze
- Greataxe: Cleave
- Battleaxe: Topple
- Rapier: Vex
- Shortsword: Vex
- Mace: Sap
- Warhammer: Push
- Dagger: Nick
- Handaxe: Vex
- Quarterstaff: Topple
- Longbow: Slow
- Shortbow: Vex
- Crossbow (light): Slow
- Crossbow (heavy): Push

**Pansori today**: No Weapon Mastery system. All weapons are simple stat
blocks (damage die, damage type, range, reach).

**Migration plan**:

- Add `mastery?: 'vex' | 'topple' | ...` field to LootItem.
- Add `weaponMasteries?: string[]` to Character (list of weapon ids the PC
  has mastered).
- In the attack handler, check if the equipped weapon has a mastery AND the
  PC has mastered it. Apply the mastery's effect.
- Tag SRD weapons in the registry with their RAW masteries.
- Initial PR: framework + 2-3 masteries (Vex, Topple, Push as flagship).
  Follow-up: complete the set.

**Risks**: medium. New cross-cutting mechanic that affects nearly every
combat resolution. Tests need to cover each mastery's trigger.

## 4. Wild Shape → Beast Forms

**2014**: Druid transforms into a beast. Gain the beast's stat block
entirely — HP, AC, attacks, speeds, senses. Skills/saves/INT/WIS/CHA stay
the druid's. Death of the form reverts the druid.

**2024**: Druid transforms but **keeps own stats** (mental + physical
ability scores). The form provides movement modes, senses, attacks, and
temp HP from a curated form list rather than the open Monster Manual.

**Pansori today**: Simplified — Wild Shape grants temp HP based on
max_CR × 5 × level. No actual beast stat block, no form-specific abilities.
Effectively a defensive buff.

**Migration plan**:

- Define a `BeastForm` catalog (3-5 forms): Wolf, Bear, Spider, Eagle. Each
  has temp_hp_formula, attack_dice, movement_modes, senses.
- Druid picks a form when activating Wild Shape (offer per-form choices).
- While shifted, attack uses the form's attack dice instead of equipped
  weapon.
- Bear-form damage resistance fits Bear directly.

**Risks**: medium. Behavioral change for existing Druid players.

## 5. Rage — 2024 progression

**2014**: Bonus action; +2 damage (scales); resistance to slashing/
piercing/bludgeoning; advantage on STR checks and saves; ends after 1
minute or if you haven't attacked or taken damage by end of your turn.

**2024**: Same triggers and durations. Key changes:

- Rage damage bonus progression rebalanced slightly.
- Rage now lasts up to 10 minutes (was 1 minute) unless ended.

**Pansori today**: Tracks `raging` condition, damage bonus via
`rageDamageBonus(level)`, rage uses tracked. Duration isn't ticked down
(rage ends when combat ends instead — non-RAW).

**Migration plan**:

- Verify rageDamageBonus formula matches 2024.
- Add rage duration tracking (rounds-based, since "10 minutes" maps to
  the rest of an encounter for our purposes — likely no-op).

**Risks**: low. Mostly verification.

## 6. Class feature audit

A broad sweep of every class feature to confirm/update against 2024 PHB.
Specific known diffs:

- **Cleric Channel Divinity**: 2024 changed Turn Undead and added new
  options like Divine Spark.
- **Fighter Second Wind**: 2024 increases the d10 die to d10 (was d10
  already in 2014) — verify damage formula.
- **Fighter Action Surge**: same mechanic, slight scaling change.
- **Rogue**: 2024 adds Cunning Strike (apply effects to Sneak Attack at the
  cost of dice). Could add as a Rogue subclass feature.
- **Paladin Lay on Hands**: 2024 changed it from a pool to a per-rest count.
- **Monk** entirely renamed mechanics: Ki → Focus Points; Martial Arts
  scaled differently. Significant rename but mostly the same math.

**Risks**: medium. Each class affects multiple downstream tests.

---

## Out-of-scope (deferred indefinitely)

- 2024 species changes (we don't have species/races in Pansori).
- 2024 backgrounds rewrite (we have backgrounds but they're flavor-only).
- New 2024 spells (we already include most relevant ones via SRD 5.2.1).
