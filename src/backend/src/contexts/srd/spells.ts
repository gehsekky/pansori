import type { Spell } from '../../types.js';

// Shared SRD spell definitions.
//
// 5e core spells are universal — a Wizard's Magic Missile in Vale of Shadows
// is the same Magic Missile as in Whispering Pines. Pansori previously
// duplicated these definitions across every campaign context; this registry
// is the single source of truth.
//
// Contexts spread this into their own spellTable and can:
//   - add campaign-specific spells (`spellTable: { ...SRD_SPELLS, my_spell }`)
//   - override an SRD spell (same id wins in the campaign's local entry)
//
// Spell IDs match the SRD 5.2.1 / 2014 PHB names where possible. Damage and
// upcast formulas follow RAW unless a flavour note documents the change.

export const SRD_SPELLS: Record<string, Spell> = {
  // ─── Cantrips (level 0) ────────────────────────────────────────────────────
  sacred_flame: {
    id: 'sacred_flame',
    name: 'Sacred Flame',
    level: 0,
    castTime: 'action',
    damageType: 'radiant',
    damage: '1d8',
    savingThrow: 'dex',
    saveEffect: 'negates',
    desc: 'Radiant flame descends on a target. DEX save or take 1d8 radiant damage.',
    rangeKind: 'ranged',
    rangeFt: 60,
    spellList: ['divine'],
  },
  fire_bolt: {
    id: 'fire_bolt',
    name: 'Fire Bolt',
    level: 0,
    castTime: 'action',
    damage: '1d10',
    damageType: 'fire',
    attackRoll: true,
    upcastBonus: '1d10',
    desc: 'Hurl a mote of fire. Spell attack roll, 1d10 fire damage (scales with level).',
    rangeKind: 'ranged',
    rangeFt: 120,
    spellList: ['arcane'],
  },
  eldritch_blast: {
    id: 'eldritch_blast',
    name: 'Eldritch Blast',
    level: 0,
    castTime: 'action',
    damage: '1d10',
    damageType: 'force',
    attackRoll: true,
    upcastBonus: '1d10',
    rangeKind: 'ranged',
    rangeFt: 120,
    desc: 'A beam of crackling energy streaks toward a creature.',
    spellList: ['arcane'],
  },
  shillelagh: {
    id: 'shillelagh',
    name: 'Shillelagh',
    level: 0,
    castTime: 'bonus_action',
    narrative: 'Your staff glows with natural energy.',
    desc: 'Your staff deals 1d8 magical bludgeoning using WIS for attack/damage.',
    rangeKind: 'self',
    spellList: ['primal'],
  },
  bardic_inspiration_spell: {
    id: 'bardic_inspiration_spell',
    name: 'Bardic Inspiration',
    level: 0,
    castTime: 'bonus_action',
    narrative: 'Your stirring words inspire an ally, granting them +1d6 on their next roll.',
    desc: 'Bonus action. One ally gains a Bardic Inspiration die (1d6) to add to one roll.',
    rangeKind: 'ranged',
    rangeFt: 60,
  },
  vicious_mockery: {
    id: 'vicious_mockery',
    name: 'Vicious Mockery',
    level: 0,
    castTime: 'action',
    // 2024 PHB Bard cantrip — psychic damage + WIS save or disadvantage on
    // its next attack. Damage scales like a standard cantrip.
    damage: '1d6',
    upcastBonus: '1d6',
    damageType: 'psychic',
    savingThrow: 'wis',
    saveEffect: 'negates',
    rangeKind: 'ranged',
    rangeFt: 60,
    desc: 'Hurl insults at a creature. WIS save or take 1d6 psychic damage (scales with level).',
    // Bard is on the arcane list in 2024 PHB.
    spellList: ['arcane'],
  },

  // ─── Level 1 ────────────────────────────────────────────────────────────────
  cure_wounds: {
    id: 'cure_wounds',
    name: 'Cure Wounds',
    level: 1,
    castTime: 'action',
    // 2024 PHB: 2d8 + spellcasting modifier (was 1d8 + mod in 2014). Engine
    // adds the casting-stat mod on top of this roll.
    heal: '2d8',
    upcastBonus: '2d8',
    desc: 'A creature you touch regains 2d8 + spell modifier HP. +2d8 per slot above 1st.',
    rangeKind: 'touch',
    narratives: {
      cast: [
        '{name} lays a glowing palm on {target} — {spell}{slotNote}',
        "{name}'s touch kindles a warm golden light around {target} — {spell}{slotNote}",
        '{name} breathes a quiet prayer and touches {target} — {spell}{slotNote}',
      ],
    },
    // Bard / Cleric / Druid / Paladin / Ranger list (2024 PHB).
    spellList: ['arcane', 'divine', 'primal'],
  },
  healing_word: {
    id: 'healing_word',
    name: 'Healing Word',
    level: 1,
    castTime: 'bonus_action',
    // 2024 PHB: 2d4 + spellcasting modifier (was 1d4 + mod in 2014).
    heal: '2d4',
    upcastBonus: '2d4',
    rangeKind: 'ranged',
    rangeFt: 60,
    desc: 'A creature of your choice regains HP. Bonus action.',
    // Bard / Cleric / Druid (2024 PHB).
    spellList: ['arcane', 'divine', 'primal'],
  },
  guiding_bolt: {
    id: 'guiding_bolt',
    name: 'Guiding Bolt',
    level: 1,
    castTime: 'action',
    damageType: 'radiant',
    damage: '4d6',
    attackRoll: true,
    desc: 'A flash of light streaks toward a target. Spell attack roll, 4d6 radiant on hit.',
    rangeKind: 'ranged',
    rangeFt: 120,
    spellList: ['divine'],
  },
  magic_missile: {
    id: 'magic_missile',
    name: 'Magic Missile',
    level: 1,
    castTime: 'action',
    damageType: 'force',
    // SRD 5.2.1 p.282 — three darts at 1d4+1 each = 3d4+3 total.
    damage: '3d4+3',
    upcastBonus: '1d4+1',
    desc: 'Three magical darts each deal 1d4+1 force damage, automatically hitting. +1 dart per slot above 1st.',
    rangeKind: 'ranged',
    rangeFt: 120,
    narratives: {
      cast: [
        '{name} weaves {spell}{slotNote} — darts of pure force leap from their fingertips',
        '{name} points and speaks the words of {spell}{slotNote} — silvery bolts streak unerring',
        "Three glowing motes of {spell}{slotNote} spiral from {name}'s palm",
      ],
    },
    spellList: ['arcane'],
  },
  shield: {
    id: 'shield',
    name: 'Shield',
    // PHB p.275 — abjuration, 1st-level. "When you are hit by an attack or
    // targeted by the magic missile spell, you can cast this spell as a
    // reaction to gain +5 AC until the start of your next turn."
    desc: 'A reaction that grants +5 AC until the start of your next turn against the triggering attack and any others.',
    level: 1,
    castTime: 'reaction',
    rangeKind: 'self',
    spellList: ['arcane'],
  },
  silvery_barbs: {
    id: 'silvery_barbs',
    name: 'Silvery Barbs',
    // Strixhaven, 1st-level enchantment. Reaction triggered on an
    // enemy's successful attack/save/check. Forces the enemy to
    // reroll the d20 and use the lower result. MVP handles the
    // reroll branch only; the "ally gains advantage on next d20"
    // follow-up is in docs/TODO.md.
    desc: 'A reaction that forces an enemy to reroll a successful attack roll, taking the lower result.',
    level: 1,
    castTime: 'reaction',
    rangeKind: 'self',
    spellList: ['arcane'],
  },
  absorb_elements: {
    id: 'absorb_elements',
    name: 'Absorb Elements',
    // PHB p.211 — abjuration, 1st-level. Reaction triggered when the
    // caster takes acid / cold / fire / lightning / thunder damage.
    // MVP halves the trigger damage on accept; the "resistance until
    // next turn" + "+1d6 next melee" enhancements are TODOs tracked
    // in docs/TODO.md.
    desc: 'A reaction that halves the triggering elemental damage (acid / cold / fire / lightning / thunder).',
    level: 1,
    castTime: 'reaction',
    rangeKind: 'self',
    // Druid / Ranger / Sorcerer / Wizard (2024 PHB).
    spellList: ['arcane', 'primal'],
  },
  hellish_rebuke: {
    id: 'hellish_rebuke',
    name: 'Hellish Rebuke',
    // PHB p.252 — evocation, 1st-level. "1 reaction, which you take in
    // response to being damaged by a creature within 60 feet of you that
    // you can see. The creature takes 2d10 fire damage on a failed Dex
    // save, or half as much on a successful one." Warlock spell.
    desc: 'A reaction: when damaged by a visible creature within 60 ft, deal 2d10 fire (DEX save for half). +1d10 per slot above 1st.',
    level: 1,
    castTime: 'reaction',
    damage: '2d10',
    damageType: 'fire',
    savingThrow: 'dex',
    saveEffect: 'half',
    upcastBonus: '1d10',
    rangeKind: 'ranged',
    rangeFt: 60,
    spellList: ['arcane'],
  },
  bless: {
    id: 'bless',
    name: 'Bless',
    level: 1,
    castTime: 'action',
    concentration: true,
    narrative: 'You bless your allies — they gain +1d4 to attack rolls and saving throws.',
    desc: 'Concentration. Allies gain +1d4 to attack rolls and saving throws.',
    rangeKind: 'ranged',
    rangeFt: 30,
    // Cleric / Paladin (2024 PHB).
    spellList: ['divine'],
  },
  thunderwave: {
    id: 'thunderwave',
    name: 'Thunderwave',
    level: 1,
    castTime: 'action',
    damageType: 'thunder',
    damage: '2d8',
    savingThrow: 'con',
    saveEffect: 'half',
    desc: 'A wave of thunderous force erupts from you. CON save or take 2d8 thunder, half on success.',
    rangeKind: 'self',
    // Bard / Druid / Sorcerer / Wizard (2024 PHB).
    spellList: ['arcane', 'primal'],
  },
  burning_hands: {
    id: 'burning_hands',
    name: 'Burning Hands',
    level: 1,
    castTime: 'action',
    damage: '3d6',
    damageType: 'fire',
    savingThrow: 'dex',
    saveEffect: 'half',
    upcastBonus: '1d6',
    blastRadius: 15,
    aoeShape: 'cone',
    rangeKind: 'self',
    desc: 'A 15-foot cone of flame shoots from your hands.',
    spellList: ['arcane'],
  },
  entangle: {
    id: 'entangle',
    name: 'Entangle',
    level: 1,
    castTime: 'action',
    damage: '0',
    damageType: 'none',
    savingThrow: 'str',
    saveEffect: 'negates',
    condition: 'restrained',
    conditionDuration: 3,
    concentration: true,
    blastRadius: 20,
    aoeShape: 'sphere',
    rangeKind: 'ranged',
    rangeFt: 90,
    desc: 'Grasping weeds restrain creatures in a 20-ft area.',
    // Druid / Ranger (2024 PHB).
    spellList: ['primal'],
  },
  mage_armor: {
    id: 'mage_armor',
    name: 'Mage Armor',
    level: 1,
    castTime: 'action',
    targetType: 'self_or_ally',
    // No condition / no temp HP / no max HP bonus — the AC effect is
    // applied via the per-spell side-effect hook in castSpell that
    // sets mage_armor_active and recomputes AC.
    rangeKind: 'touch',
    desc: "A willing creature gains a protective magical force. Until the spell ends, the target's base AC becomes 13 + DEX (only effective while not wearing body armor). Lasts 8 hours; cleared on long rest.",
    narratives: {
      cast: [
        '{name} traces wards in the air around {target} — {spell}{slotNote} settles into a shimmering second skin',
        '{name} casts {spell}{slotNote}; pale runes drift across {target}, settling into a magical shield',
      ],
    },
    spellList: ['arcane'],
  },
  shield_of_faith: {
    id: 'shield_of_faith',
    name: 'Shield of Faith',
    level: 1,
    castTime: 'bonus_action',
    concentration: true,
    targetType: 'self_or_ally',
    // Side-effect hook (shield_of_faith_active) flips on cast.
    durationRounds: 10, // 1 min concentration
    rangeKind: 'ranged',
    rangeFt: 60,
    desc: 'A shimmering field grants the target +2 AC for the duration (Concentration, up to 1 minute).',
    narratives: {
      cast: [
        '{name} murmurs {spell}{slotNote} — a shimmering field of faith wraps {target}',
        "{name}'s prayer kindles {spell}{slotNote}; golden light hovers about {target}",
      ],
    },
    spellList: ['divine'],
  },

  heroism: {
    id: 'heroism',
    name: 'Heroism',
    level: 1,
    castTime: 'action',
    concentration: true,
    targetType: 'self_or_ally',
    // RAW: temp HP equal to spellcasting modifier at the start of each
    // of the target's turns + immunity to Frightened. Pansori MVP grants
    // a flat 3 temp HP on cast (mod-ish for L1-4) and leaves the
    // refresh-per-turn + frightened-immunity for a follow-up.
    tempHpGrant: 3,
    durationRounds: 10, // 1 minute concentration
    rangeKind: 'touch',
    desc: 'A willing creature gains 3 temporary HP and emboldened resolve (Concentration, up to 1 minute).',
    narratives: {
      cast: [
        '{name} grasps {target} by the shoulder — {spell}{slotNote} surges through them like liquid courage',
        '{name} whispers {spell}{slotNote} and {target} stands taller, fear washing away',
      ],
    },
    spellList: ['arcane', 'divine'],
  },
  aid: {
    id: 'aid',
    name: 'Aid',
    level: 2,
    castTime: 'action',
    // RAW: choose up to 3 creatures, each gets +5 max HP and +5 current
    // HP for 8 hours. Pansori MVP targets one (the caster or chosen ally)
    // and bumps both max_hp and current hp. The duration is until the
    // next long rest (which clears the temp bonus via the rest sweep —
    // wired below in rest.ts? actually no, this is durable until
    // long rest naturally resets max_hp from char build... actually
    // it persists; documented as a known simplification).
    targetType: 'self_or_ally',
    maxHpBonus: 5,
    upcastMaxHpBonus: 5,
    rangeKind: 'ranged',
    rangeFt: 30,
    desc: 'A creature’s hit point maximum and current hit points increase by 5 (+5 per slot above 2nd).',
    narratives: {
      cast: [
        '{name} channels {spell}{slotNote} — {target} feels their resolve thicken into iron',
        '{name} casts {spell}{slotNote}; warmth pools in {target}’s chest, steeling them against the fight',
      ],
    },
    spellList: ['divine'],
  },
  greater_invisibility: {
    id: 'greater_invisibility',
    name: 'Greater Invisibility',
    level: 4,
    castTime: 'action',
    concentration: true,
    targetType: 'self_or_ally',
    condition: 'invisible',
    conditionDuration: 10, // 1 minute concentration
    rangeKind: 'touch',
    desc: 'A willing creature becomes invisible. Anything it is wearing or carrying is invisible too. The target can attack while invisible (Concentration, up to 1 minute).',
    narratives: {
      cast: [
        '{name} traces {spell}{slotNote} in the air — {target} fades from sight',
        '{name} whispers {spell}{slotNote} and {target} winks out of view',
      ],
    },
    spellList: ['arcane'],
  },

  faerie_fire: {
    id: 'faerie_fire',
    name: 'Faerie Fire',
    level: 1,
    castTime: 'action',
    damage: '0',
    damageType: 'none',
    savingThrow: 'dex',
    saveEffect: 'negates',
    condition: 'faerie_fired',
    conditionDuration: 10, // 1 minute, concentration-capped
    concentration: true,
    blastRadius: 20, // 20-ft cube; pansori's sphere/cube AoE handling
    aoeShape: 'cube',
    rangeKind: 'ranged',
    rangeFt: 60,
    desc: 'Each creature in a 20-ft cube must make a DEX save or be outlined. Attacks against an outlined creature have advantage.',
    narratives: {
      cast: [
        '{name} casts {spell}{slotNote} — silvery motes drift through the air, clinging to anything they touch',
        '{name} weaves {spell}{slotNote}; pale blue flames trace the silhouettes of every creature in the area',
      ],
    },
    // Bard / Druid (2024 PHB).
    spellList: ['arcane', 'primal'],
  },
  charm_person: {
    id: 'charm_person',
    name: 'Charm Person',
    level: 1,
    castTime: 'action',
    savingThrow: 'wis',
    saveEffect: 'negates',
    condition: 'charmed',
    conditionDuration: 6,
    rangeKind: 'ranged',
    rangeFt: 30,
    desc: 'A humanoid you can see is charmed for 1 hour on failed WIS save.',
    // Bard / Druid / Sorcerer / Warlock / Wizard (2024 PHB).
    spellList: ['arcane', 'primal'],
  },
  sleep: {
    id: 'sleep',
    name: 'Sleep',
    level: 1,
    castTime: 'action',
    damage: '5d8',
    damageType: 'none',
    savingThrow: 'con',
    saveEffect: 'negates',
    condition: 'unconscious',
    conditionDuration: 3,
    upcastBonus: '2d8',
    blastRadius: 20,
    aoeShape: 'sphere',
    rangeKind: 'ranged',
    rangeFt: 90,
    desc: 'Sends creatures into a magical slumber (5d8 HP pool).',
    // Bard / Sorcerer / Wizard (2024 PHB).
    spellList: ['arcane'],
  },
  hex: {
    id: 'hex',
    name: 'Hex',
    level: 1,
    castTime: 'bonus_action',
    narrative: 'A dark curse settles on your target.',
    desc: 'Curse a creature — bonus 1d6 necrotic on every hit. Concentration.',
    concentration: true,
    rangeKind: 'ranged',
    rangeFt: 90,
    // Warlock-only.
    spellList: ['arcane'],
  },
  divine_smite_spell: {
    id: 'divine_smite_spell',
    name: 'Divine Smite',
    level: 1,
    // 2024 PHB — bonus-action cast. The spell doesn't deal damage on
    // its own; it pre-buffs the caster so the next successful weapon
    // attack within 1 minute / before the end of the next turn adds
    // +2d8 radiant (upcast +1d8 per level above 1).
    castTime: 'bonus_action',
    damageType: 'radiant',
    damage: '2d8',
    desc: 'Bonus action. Next successful weapon attack within 1 minute deals an extra 2d8 radiant damage (upcast +1d8 per level above 1st).',
    rangeKind: 'self',
    // Paladin-only.
    spellList: ['divine'],
  },

  // ─── Level 2 ────────────────────────────────────────────────────────────────
  hold_person: {
    id: 'hold_person',
    name: 'Hold Person',
    level: 2,
    castTime: 'action',
    concentration: true,
    condition: 'paralyzed',
    conditionDuration: 3,
    savingThrow: 'wis',
    saveEffect: 'negates',
    desc: 'Target must make a WIS save or be paralyzed for up to 3 rounds (Concentration).',
    rangeKind: 'ranged',
    rangeFt: 60,
    // Bard / Cleric / Druid / Sorcerer / Warlock / Wizard (2024 PHB).
    spellList: ['arcane', 'divine', 'primal'],
  },
  web: {
    id: 'web',
    name: 'Web',
    level: 2,
    castTime: 'action',
    concentration: true,
    condition: 'restrained',
    conditionDuration: 10, // 1 hour concentration; combat-capped here
    savingThrow: 'dex',
    saveEffect: 'negates',
    blastRadius: 20,
    aoeShape: 'cube',
    rangeKind: 'ranged',
    rangeFt: 60,
    desc: 'You conjure a mass of thick, sticky webbing filling a 20-ft cube. Creatures must make a DEX save or be restrained.',
    narratives: {
      cast: [
        '{name} flings a glob of {spell}{slotNote} — strands of viscous silk spread across the area',
        '{name} weaves {spell}{slotNote} into a sticky lattice that fills the chamber',
      ],
    },
    // Sorcerer / Wizard (2024 PHB).
    spellList: ['arcane'],
  },
  suggestion: {
    id: 'suggestion',
    name: 'Suggestion',
    level: 2,
    castTime: 'action',
    concentration: true,
    condition: 'charmed',
    conditionDuration: 8, // shortened from 8 hours for combat scale
    savingThrow: 'wis',
    saveEffect: 'negates',
    rangeKind: 'ranged',
    rangeFt: 30,
    desc: 'Suggest a reasonable course of action to one creature. WIS save or be charmed and pursue the suggestion (Concentration).',
    narratives: {
      cast: [
        "{name} leans in close and whispers {spell}{slotNote} — their words slip past {target}'s defenses",
        '{name} murmurs {spell}{slotNote} — honeyed words wind around {target}',
      ],
    },
    // Bard / Sorcerer / Warlock / Wizard (2024 PHB).
    spellList: ['arcane'],
  },
  misty_step: {
    id: 'misty_step',
    name: 'Misty Step',
    level: 2,
    castTime: 'bonus_action',
    narrative: 'You vanish in a puff of silver mist and reappear nearby.',
    desc: 'Surrounded by silver mist, you teleport up to 30 feet.',
    rangeKind: 'self',
    // Sorcerer / Warlock / Wizard (2024 PHB). Druid also has it.
    spellList: ['arcane', 'primal'],
  },
  spiritual_weapon: {
    id: 'spiritual_weapon',
    name: 'Spiritual Weapon',
    level: 2,
    castTime: 'bonus_action',
    damage: '1d8',
    damageType: 'force',
    upcastBonus: '1d8',
    rangeKind: 'ranged',
    rangeFt: 60,
    desc: 'A floating spectral weapon makes melee attacks.',
    spellList: ['divine'],
  },

  // ─── Level 3 ────────────────────────────────────────────────────────────────
  counterspell: {
    id: 'counterspell',
    name: 'Counterspell',
    // PHB p.234 — abjuration, 3rd-level. "1 reaction, which you take when
    // you see a creature within 60 feet of you casting a spell. The
    // creature's spell fails and has no effect if it is of 3rd level or
    // lower. If it is 4th level or higher, make an ability check using
    // your spellcasting ability (DC = 10 + the spell's level). On a
    // success, the creature's spell fails and has no effect."
    desc: 'A reaction that interrupts a creature casting a spell. Auto-counters spells of 3rd level or lower (slot ≥ spell level); ability check (DC 10 + spell level) for higher.',
    level: 3,
    castTime: 'reaction',
    rangeKind: 'ranged',
    rangeFt: 60,
    // Sorcerer / Warlock / Wizard (2024 PHB).
    spellList: ['arcane'],
  },
  fireball: {
    id: 'fireball',
    name: 'Fireball',
    level: 3,
    castTime: 'action',
    damage: '8d6',
    damageType: 'fire',
    savingThrow: 'dex',
    saveEffect: 'half',
    upcastBonus: '1d6',
    blastRadius: 20,
    aoeShape: 'sphere',
    rangeKind: 'ranged',
    rangeFt: 150,
    desc: 'A bright streak erupts into a ball of flame.',
    narratives: {
      cast: [
        '{name} hurls a tiny bead of flame — {spell}{slotNote} blooms into a roaring sphere of fire',
        '{name} speaks the syllables of {spell}{slotNote} and a spark blossoms into an inferno',
        "A glowing mote leaps from {name}'s palm — {spell}{slotNote} detonates in a wave of heat",
      ],
    },
    spellList: ['arcane'],
  },
  lightning_bolt: {
    id: 'lightning_bolt',
    name: 'Lightning Bolt',
    level: 3,
    castTime: 'action',
    damage: '8d6',
    damageType: 'lightning',
    savingThrow: 'dex',
    saveEffect: 'half',
    upcastBonus: '1d6',
    blastRadius: 100, // 100-ft line, 5-ft wide
    aoeShape: 'line',
    rangeKind: 'self',
    desc: 'A stroke of lightning forming a 100-foot line bursts from your hand.',
    narratives: {
      cast: [
        '{name} raises an arm and {spell}{slotNote} crackles down the corridor in a blinding spear of lightning',
        "{name}'s fingers spark — {spell}{slotNote} arcs out as a thundering line of voltage",
        '{name} channels {spell}{slotNote} into a searing electric javelin that punches through the line',
      ],
    },
    spellList: ['arcane'],
  },
  hunger_of_hadar: {
    id: 'hunger_of_hadar',
    name: 'Hunger of Hadar',
    level: 3,
    castTime: 'action',
    damage: '2d6',
    damageType: 'cold',
    savingThrow: 'dex',
    saveEffect: 'half',
    concentration: true,
    blastRadius: 20,
    aoeShape: 'sphere',
    rangeKind: 'ranged',
    rangeFt: 150,
    desc: 'Open a gate to the void — creatures inside take 2d6 cold and DEX save or 2d6 acid.',
    // Warlock-only.
    spellList: ['arcane'],
  },
  spirit_guardians: {
    id: 'spirit_guardians',
    name: 'Spirit Guardians',
    level: 3,
    castTime: 'action',
    // 2024 PHB Cleric L3 — 15-ft radius aura around caster. Hostile creatures
    // moving inside (or starting their turn in) the area take 3d8 radiant/
    // necrotic; WIS save halves. Concentration, up to 10 min. Engine treats
    // as an AoE sphere centered on caster — runs on cast and on any enemy
    // turn-start tick is left as future scope.
    damage: '3d8',
    damageType: 'radiant',
    savingThrow: 'wis',
    saveEffect: 'half',
    upcastBonus: '1d8',
    concentration: true,
    blastRadius: 15,
    aoeShape: 'sphere',
    rangeKind: 'self',
    desc: 'Concentration. Spirits surround you in a 15-ft radius. Hostiles in the area make a WIS save or take 3d8 radiant damage (half on success).',
    spellList: ['divine'],
  },
  cone_of_cold: {
    id: 'cone_of_cold',
    name: 'Cone of Cold',
    level: 5,
    castTime: 'action',
    damage: '8d8',
    damageType: 'cold',
    savingThrow: 'con',
    saveEffect: 'half',
    upcastBonus: '1d8',
    blastRadius: 60,
    aoeShape: 'cone',
    rangeKind: 'self',
    desc: 'A blast of cold air erupts from your hands in a 60-ft cone. CON save halves.',
    narratives: {
      cast: [
        "{name}'s breath frosts the air — {spell}{slotNote} roars out in a freezing wall",
        '{name} sweeps an arm forward and {spell}{slotNote} crashes down the cone in a shimmering blast',
      ],
    },
    spellList: ['arcane'],
  },
  stinking_cloud: {
    id: 'stinking_cloud',
    name: 'Stinking Cloud',
    level: 3,
    castTime: 'action',
    concentration: true,
    condition: 'poisoned',
    conditionDuration: 5,
    savingThrow: 'con',
    saveEffect: 'negates',
    blastRadius: 20,
    aoeShape: 'sphere',
    rangeKind: 'ranged',
    rangeFt: 90,
    desc: 'A 20-ft sphere of yellow nauseating gas. CON save or be poisoned (and lose actions per RAW — only the poisoned condition is modeled).',
    narratives: {
      cast: [
        '{name} flings a glob of {spell}{slotNote} into the air — sickly yellow vapor blooms',
        '{name} casts {spell}{slotNote} — choking fumes pour into the area',
      ],
    },
    spellList: ['arcane'],
  },
  wall_of_fire: {
    id: 'wall_of_fire',
    name: 'Wall of Fire',
    level: 4,
    castTime: 'action',
    concentration: true,
    damage: '5d8',
    damageType: 'fire',
    savingThrow: 'dex',
    saveEffect: 'half',
    upcastBonus: '1d8',
    blastRadius: 60, // 60-ft line, 20 ft high, 1 ft thick
    aoeShape: 'line',
    rangeKind: 'ranged',
    rangeFt: 120,
    desc: 'You create a 60-ft line of flame. Creatures in the area take 5d8 fire damage (DEX save halves). Concentration.',
    narratives: {
      cast: [
        '{name} chants {spell}{slotNote} — a roaring curtain of flame snaps into being',
        '{name} traces a line and {spell}{slotNote} erupts along it in a wall of fire',
      ],
    },
    spellList: ['arcane', 'primal'],
  },
  hold_monster: {
    id: 'hold_monster',
    name: 'Hold Monster',
    level: 5,
    castTime: 'action',
    concentration: true,
    condition: 'paralyzed',
    conditionDuration: 5,
    savingThrow: 'wis',
    saveEffect: 'negates',
    desc: 'Choose a creature you can see. WIS save or be paralyzed (Concentration, up to 1 minute). Repeats saves at end of its turns (not modeled — uses fixed duration).',
    rangeKind: 'ranged',
    rangeFt: 90,
    narratives: {
      cast: [
        '{name} weaves {spell}{slotNote} — invisible bonds clamp around {target}',
        "{name} casts {spell}{slotNote}; {target}'s limbs lock as if frozen mid-motion",
      ],
    },
    // Bard / Sorcerer / Warlock / Wizard (2024 PHB).
    spellList: ['arcane'],
  },
  inflict_wounds: {
    id: 'inflict_wounds',
    name: 'Inflict Wounds',
    level: 1,
    castTime: 'action',
    // 2024 PHB Cleric/Warlock L1 — touch spell, attack roll, big up-front
    // necrotic damage.
    damage: '2d10',
    upcastBonus: '2d10',
    damageType: 'necrotic',
    attackRoll: true,
    rangeKind: 'touch',
    desc: 'A creature you touch takes 2d10 necrotic on a hit. +2d10 per slot above 1st.',
    // Cleric / Warlock — divine + arcane.
    spellList: ['arcane', 'divine'],
  },

  // ── Ritual spells (2024 PHB Chapter 3, Ritual tag) ───────────────────
  // RAW: a ritual spell can be cast normally (action + slot) OR as a
  // ritual (10 min, no slot, out of combat). Pansori models the
  // 10-minute time cost as "out of combat" — the engine doesn't have
  // a finer-grained time axis. Class gating: Wizard / Cleric / Druid /
  // Bard can ritual-cast their known/prepared spells (see canRitualCast
  // in gameEngine.ts). The spells themselves are narrative utility —
  // no damage, save, or condition mechanics — until pansori needs
  // engine-side hooks for "you sense magic" / "you identify an item".
  detect_magic: {
    id: 'detect_magic',
    name: 'Detect Magic',
    level: 1,
    castTime: 'action',
    desc: 'For the next 10 minutes you sense magical auras within 30 feet.',
    narrative: '{name} weaves a probing sigil — auras of magic shimmer at the edge of sight.',
    ritualCasting: true,
    // No targetType — routes through the utility branch (no damage,
    // save, attack, condition, heal, or buff effect). The branch
    // reads `spell.narrative` for prose.
    rangeKind: 'self',
    spellList: ['arcane', 'divine', 'primal'],
  },
  identify: {
    id: 'identify',
    name: 'Identify',
    level: 1,
    castTime: 'action',
    materialCost: 100,
    desc: 'Touch an item to learn its magical properties, command words, and remaining charges.',
    narrative: '{name} traces glyphs over the item — its history glows behind the eyes.',
    ritualCasting: true,
    rangeKind: 'touch',
    spellList: ['arcane'],
  },
  comprehend_languages: {
    id: 'comprehend_languages',
    name: 'Comprehend Languages',
    level: 1,
    castTime: 'action',
    desc: 'For 1 hour you understand the literal meaning of any spoken language you hear.',
    narrative: '{name} mouths a syllable — the babble of foreign tongues resolves into sense.',
    ritualCasting: true,
    rangeKind: 'self',
    spellList: ['arcane'],
  },

  // ── Flight & movement-mode spells (PHB 2024 Chapter 3) ────────────────
  // These two spells set fly_speed_ft on the target via the buff path
  // (see castSpell/buff.ts spell-id check). Concentration drop clears
  // the flag in breakConcentration (gameEngine.ts).
  levitate: {
    id: 'levitate',
    name: 'Levitate',
    level: 2,
    castTime: 'action',
    concentration: true,
    durationRounds: 100, // RAW 10 min; pansori rounds-based timer
    desc: 'One willing creature within 60 ft rises or descends vertically up to 20 ft per turn. Concentration up to 10 min.',
    narrative: '{name} traces an upward sigil — {target} drifts free of gravity.',
    targetType: 'self_or_ally',
    rangeKind: 'ranged',
    rangeFt: 60,
    spellList: ['arcane'],
  },
  fly: {
    id: 'fly',
    name: 'Fly',
    level: 3,
    castTime: 'action',
    concentration: true,
    durationRounds: 100, // RAW 10 min
    desc: 'A willing creature you touch gains a flying speed of 60 ft for 10 min. Concentration.',
    narrative: '{name} touches {target} — invisible wings unfurl.',
    targetType: 'self_or_ally',
    rangeKind: 'touch',
    spellList: ['arcane'],
  },

  // ── Multi-target heals (PHB 2024 Chapter 3) ──────────────────────────
  // Route through the new `multiTargetHeal` branch in castSpell —
  // distributes the rolled heal across all living party members
  // (pansori MVP: party-wide, not RAW's "up to 6 within 30 ft").
  mass_healing_word: {
    id: 'mass_healing_word',
    name: 'Mass Healing Word',
    level: 3,
    castTime: 'bonus_action',
    heal: '1d4',
    upcastBonus: '1d4',
    desc: 'Up to 6 creatures within 60 ft regain 1d4 + casting mod HP. +1d4 per slot above 3rd.',
    rangeKind: 'ranged',
    rangeFt: 60,
    spellList: ['divine'],
  },
  mass_cure_wounds: {
    id: 'mass_cure_wounds',
    name: 'Mass Cure Wounds',
    level: 5,
    castTime: 'action',
    heal: '3d8',
    upcastBonus: '1d8',
    desc: 'Up to 6 creatures within 60 ft regain 3d8 + casting mod HP. +1d8 per slot above 5th.',
    rangeKind: 'ranged',
    rangeFt: 60,
    spellList: ['divine', 'primal'],
  },

  // L6 dedicated heal — restores a fixed 70 HP and removes some
  // adverse conditions on the target. Different from Cure Wounds /
  // Healing Word in that the heal amount is fixed (not rolled);
  // pansori models this as a high static heal expression.
  heal: {
    id: 'heal',
    name: 'Heal',
    level: 6,
    castTime: 'action',
    heal: '70',
    upcastBonus: '10',
    desc: 'A creature you can see within 60 ft regains 70 HP and is cured of Blinded, Deafened, and Poisoned. +10 HP per slot above 6th.',
    rangeKind: 'ranged',
    rangeFt: 60,
    spellList: ['divine', 'primal'],
  },

  // 2024 PHB Banishment (L4 abjuration). Send a creature to a
  // harmless demiplane on a failed CHA save. The banished target is
  // removed from combat — enemy-turn loop skips them, player attack
  // selection filters them out. Concentration drop returns them
  // (`breakConcentration` strips the linked `banished` condition).
  // RAW upcast: +1 target per slot above 4th — deferred (pansori
  // models single-target via the save branch).
  banishment: {
    id: 'banishment',
    name: 'Banishment',
    level: 4,
    castTime: 'action',
    concentration: true,
    durationRounds: 10,
    savingThrow: 'cha',
    saveEffect: 'negates',
    condition: 'banished',
    conditionDuration: 10,
    desc: 'A creature within 60 ft makes a CHA save or is banished to a harmless demiplane for the duration. Concentration up to 1 minute.',
    narrative:
      '{name} unfurls a sigil — the air around {target} buckles inward, swallowing them whole.',
    rangeKind: 'ranged',
    rangeFt: 60,
    spellList: ['arcane', 'divine'],
  },
};
