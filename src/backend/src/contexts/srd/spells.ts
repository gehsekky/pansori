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
  // SRD: Poison Spray — ranged spell attack, single target, 1d12 poison.
  // Cantrip scaling per the standard SRD ladder.
  poison_spray: {
    id: 'poison_spray',
    name: 'Poison Spray',
    level: 0,
    castTime: 'action',
    damage: '1d12',
    upcastBonus: '1d12',
    damageType: 'poison',
    attackRoll: true,
    desc: 'Spray toxic mist at a target. Ranged spell attack; 1d12 poison damage on hit (scales with level).',
    rangeKind: 'ranged',
    rangeFt: 30,
    spellList: ['arcane', 'primal'],
  },
  // SRD: Ray of Frost — ranged spell attack, 1d8 cold. RAW also slows
  // the target's speed by 10 ft until the caster's next turn; the
  // speed-debuff side effect is deferred until pansori has a
  // short-duration speed-debuff mechanic (the existing `slowed`
  // condition halves speed — a different magnitude). Damage works
  // immediately.
  ray_of_frost: {
    id: 'ray_of_frost',
    name: 'Ray of Frost',
    level: 0,
    castTime: 'action',
    damage: '1d8',
    upcastBonus: '1d8',
    damageType: 'cold',
    attackRoll: true,
    desc: 'A beam of cold strikes a target. Ranged spell attack; 1d8 cold damage on hit (scales with level).',
    rangeKind: 'ranged',
    rangeFt: 60,
    spellList: ['arcane'],
  },
  // SRD: Chill Touch — melee spell attack, 1d10 necrotic. RAW also
  // prevents the target from regaining hit points until the end of
  // the caster's next turn; the heal-block side effect is deferred
  // until pansori has a no-healing condition. Damage works.
  chill_touch: {
    id: 'chill_touch',
    name: 'Chill Touch',
    level: 0,
    castTime: 'action',
    damage: '1d10',
    upcastBonus: '1d10',
    damageType: 'necrotic',
    attackRoll: true,
    desc: 'Channel grave-chill in a melee spell attack; 1d10 necrotic damage on hit (scales with level).',
    rangeKind: 'touch',
    spellList: ['arcane'],
  },
  // SRD: Shocking Grasp — melee spell attack, 1d8 lightning. RAW
  // also prevents the target from making opportunity attacks until
  // the start of its next turn; the OA-block side effect is deferred
  // until pansori models opportunity-attack suppression. Damage works.
  shocking_grasp: {
    id: 'shocking_grasp',
    name: 'Shocking Grasp',
    level: 0,
    castTime: 'action',
    damage: '1d8',
    upcastBonus: '1d8',
    damageType: 'lightning',
    attackRoll: true,
    desc: 'A jolt arcs from your hand. Melee spell attack; 1d8 lightning damage on hit (scales with level).',
    rangeKind: 'touch',
    spellList: ['arcane'],
  },
  // SRD: Light — touch an object; it sheds Bright Light 20 ft + Dim
  // Light 20 ft for 1 hour. Pure narrative cantrip; no mechanical
  // hooks beyond the lighting-pipeline (which is room-grained in
  // pansori, so the spell's effect is flavor-only at the room scope).
  light: {
    id: 'light',
    name: 'Light',
    level: 0,
    castTime: 'action',
    narrative: '{name} touches the object and a steady glow blooms across its surface.',
    desc: 'Touch a Large-or-smaller object so it sheds light for 1 hour.',
    rangeKind: 'touch',
    spellList: ['arcane', 'divine'],
  },
  // SRD: Dancing Lights — up to four hovering lights for 1 minute
  // (concentration). Pure narrative cantrip; pansori models this as
  // flavor since the engine has no per-light positional rendering.
  dancing_lights: {
    id: 'dancing_lights',
    name: 'Dancing Lights',
    level: 0,
    castTime: 'action',
    concentration: true,
    durationRounds: 10,
    narrative: '{name} traces a sigil — small lights drift up like fireflies.',
    desc: 'Up to four hovering lights drift within 120 ft for up to 1 minute (concentration).',
    rangeKind: 'ranged',
    rangeFt: 120,
    spellList: ['arcane'],
  },
  // SRD: Mage Hand — a spectral floating hand performs minor
  // manipulations within 30 ft for 1 minute. Pure narrative cantrip
  // in pansori's interaction model (the FE doesn't pick separate
  // hand-versus-PC targets for object interactions).
  mage_hand: {
    id: 'mage_hand',
    name: 'Mage Hand',
    level: 0,
    castTime: 'action',
    durationRounds: 10,
    narrative:
      '{name} sketches a quick gesture — a translucent hand fades into view, awaiting commands.',
    desc: 'A spectral hand within 30 ft performs minor manipulations for 1 minute.',
    rangeKind: 'ranged',
    rangeFt: 30,
    spellList: ['arcane'],
  },
  // SRD: Spare the Dying — touch a creature with 0 HP and stabilize
  // it (becomes Stable, stops death saves). Narrative cantrip;
  // pansori's death-save flow consumes a `Stable` condition flag
  // automatically when reached, so the handler-side wiring is
  // minimal. Range scales by level (15/30/60/120 ft) but pansori
  // doesn't enforce spell range at this granularity yet.
  spare_the_dying: {
    id: 'spare_the_dying',
    name: 'Spare the Dying',
    level: 0,
    castTime: 'action',
    narrative: '{name} steadies the wounded. Death loosens its grip.',
    desc: 'Stabilize a dying creature within 15 ft (range increases with level).',
    rangeKind: 'ranged',
    rangeFt: 15,
    spellList: ['divine', 'primal'],
  },
  // SRD: Mending — repair a single break/tear in an object touched.
  // Pure narrative cantrip in pansori (no object-damage tracking).
  mending: {
    id: 'mending',
    name: 'Mending',
    level: 0,
    castTime: 'action',
    narrative: '{name} threads magic through the breach — the seam closes.',
    desc: 'Repair a single break or tear in an object touched.',
    rangeKind: 'touch',
    spellList: ['arcane', 'divine', 'primal'],
  },
  // SRD: Druidcraft — minor druidic effects (predict weather, bloom
  // a flower, snuff a tiny flame, etc.). Narrative cantrip.
  druidcraft: {
    id: 'druidcraft',
    name: 'Druidcraft',
    level: 0,
    castTime: 'action',
    narrative: '{name} whispers to the wild — a small wonder answers.',
    desc: 'Minor druidic effects: predict weather, bloom flora, snuff a tiny flame, sense the weather.',
    rangeKind: 'ranged',
    rangeFt: 30,
    spellList: ['primal'],
  },
  // SRD: Prestidigitation — minor magical tricks (light a candle,
  // chill or warm a small object, conjure a tiny illusion, etc.).
  // Narrative cantrip.
  prestidigitation: {
    id: 'prestidigitation',
    name: 'Prestidigitation',
    level: 0,
    castTime: 'action',
    narrative: '{name} gestures — a small flourish of magic answers.',
    desc: 'Minor magical effects within 10 ft: light a candle, chill/warm a small object, conjure tiny illusions, clean or soil an object.',
    rangeKind: 'ranged',
    rangeFt: 10,
    spellList: ['arcane'],
  },
  // SRD: Thaumaturgy — minor cleric "showmanship" effects (boom
  // your voice, flicker flames, tremor underfoot, etc.). Narrative
  // cantrip. Granted as an innate cantrip to Tieflings (see
  // contexts/srd/species.ts).
  thaumaturgy: {
    id: 'thaumaturgy',
    name: 'Thaumaturgy',
    level: 0,
    castTime: 'action',
    narrative: '{name} speaks a word that rings with weight — the air shifts.',
    desc: 'Minor wonder: boom your voice, flicker flames, tremor underfoot, alter an open flame, harmless tremors.',
    rangeKind: 'ranged',
    rangeFt: 30,
    spellList: ['divine'],
  },
  // SRD: Resistance — concentration cantrip. Touch a willing
  // creature and pick a damage type; until the spell ends the
  // creature reduces damage of that type by 1d4 (once per turn).
  // Pansori MVP is narrative — the damage-reduction rider would
  // need a per-type-resistance hook on the damage pipeline.
  resistance: {
    id: 'resistance',
    name: 'Resistance',
    level: 0,
    castTime: 'action',
    concentration: true,
    durationRounds: 10,
    narrative: '{name} touches an ally and shapes a ward against the chosen element.',
    desc: 'Touch buff: -1d4 damage of chosen type per turn (concentration, 1 minute).',
    rangeKind: 'touch',
    spellList: ['divine', 'primal'],
  },
  // SRD: Guidance — concentration cantrip. Touch a willing
  // creature, pick a skill; until the spell ends, the creature
  // adds 1d4 to any ability check using that skill. Pansori MVP
  // is narrative — the +1d4 skill-check rider would need a
  // per-skill-buff hook on the check pipeline.
  guidance: {
    id: 'guidance',
    name: 'Guidance',
    level: 0,
    castTime: 'action',
    concentration: true,
    durationRounds: 10,
    narrative: "{name} murmurs a few quiet words — focus settles into the recipient's hands.",
    desc: 'Touch buff: +1d4 on the chosen skill (concentration, 1 minute).',
    rangeKind: 'touch',
    spellList: ['divine', 'primal'],
  },

  // ─── Level 1 ────────────────────────────────────────────────────────────────
  // SRD: Goodberry — conjure 10 magical berries that each restore
  // 1 HP when eaten as a bonus action. Berries last 24 hours.
  // Narrative spell in pansori — granted-consumable inventory is a
  // future infra item; the spell is flavor for narrative purposes.
  goodberry: {
    id: 'goodberry',
    name: 'Goodberry',
    level: 1,
    castTime: 'action',
    narrative:
      '{name} cups a sprig of mistletoe — ten berries form, each one humming with faint primal life.',
    desc: 'Conjure 10 magical berries; each restores 1 HP (bonus action to eat). Berries last 24 hours.',
    rangeKind: 'self',
    spellList: ['primal'],
  },
  // SRD: Protection from Evil and Good — touch a willing creature
  // for 10 minutes of concentration; targeted by Aberrations,
  // Celestials, Elementals, Fey, Fiends, or Undead with
  // Disadvantage on their attacks against the warded creature,
  // and the warded creature is immune to Charm / Fear / Possession
  // from those creature types. Pansori MVP is narrative; the
  // creature-type-tagged Disadv would need an enemy-type tag on
  // the toHit pipeline that's deferred.
  protection_from_evil_and_good: {
    id: 'protection_from_evil_and_good',
    name: 'Protection from Evil and Good',
    level: 1,
    castTime: 'action',
    concentration: true,
    durationRounds: 100, // 10 minutes
    narrative:
      '{name} traces a sigil against an ally — a faint shimmer wards them from otherworldly malice.',
    desc: 'Touch buff: protection against Aberrations / Celestials / Elementals / Fey / Fiends / Undead for 10 minutes (concentration).',
    rangeKind: 'touch',
    spellList: ['arcane', 'divine'],
  },
  // SRD: Find Familiar — 1-hour ritual cast (10 gp material consumed).
  // Summons a Tiny familiar that scouts and shares senses. Narrative
  // spell in pansori — companion entities are out of scope (the
  // Beastmaster companion was removed in Phase 2H). RAW lists the
  // available animal forms (cat, owl, frog, etc.); we leave the
  // form choice as flavor.
  find_familiar: {
    id: 'find_familiar',
    name: 'Find Familiar',
    level: 1,
    castTime: 'action',
    narrative:
      '{name} traces an intricate sigil; brass and incense crumble away, and a small familiar takes shape.',
    desc: 'Ritual: summon a Tiny familiar. Narrative-only in pansori — the familiar accompanies the caster as flavor.',
    rangeKind: 'ranged',
    rangeFt: 10,
    spellList: ['arcane'],
  },
  // SRD: Detect Evil and Good — concentration up to 10 minutes,
  // ritual. Caster knows the location of Aberrations / Celestials /
  // Elementals / Fey / Fiends / Undead within 30 ft. Narrative.
  detect_evil_and_good: {
    id: 'detect_evil_and_good',
    name: 'Detect Evil and Good',
    level: 1,
    castTime: 'action',
    concentration: true,
    durationRounds: 100, // 10 minutes
    narrative:
      '{name} extends their senses — the planar fingerprints of nearby creatures register cleanly.',
    desc: 'Sense Aberrations / Celestials / Elementals / Fey / Fiends / Undead within 30 ft (concentration, 10 minutes).',
    rangeKind: 'self',
    spellList: ['divine'],
  },
  // SRD: Detect Poison and Disease — concentration up to 10 minutes,
  // ritual. Sense location of poisons, poisonous creatures, and
  // diseases within 30 ft. Narrative.
  detect_poison_and_disease: {
    id: 'detect_poison_and_disease',
    name: 'Detect Poison and Disease',
    level: 1,
    castTime: 'action',
    concentration: true,
    durationRounds: 100, // 10 minutes
    narrative:
      "{name}'s nose tightens — every taint of poison or sickness within 30 ft becomes obvious.",
    desc: 'Sense poisons + diseased creatures within 30 ft (concentration, 10 minutes).',
    rangeKind: 'self',
    spellList: ['divine', 'primal'],
  },
  // SRD: Disguise Self — illusion that changes the caster's
  // appearance for 1 hour. Visual + tactile illusion (touching
  // gives it away on a successful INT check). Narrative — pansori
  // doesn't track NPC visual identification for the disguise to
  // bypass.
  disguise_self: {
    id: 'disguise_self',
    name: 'Disguise Self',
    level: 1,
    castTime: 'action',
    durationRounds: 600, // 1 hour
    narrative: "{name}'s outline shimmers — a new face, a new gait, a new voice settle into place.",
    desc: 'Change your appearance for 1 hour. Touch reveals the illusion (INT (Investigation) check).',
    rangeKind: 'self',
    spellList: ['arcane'],
  },
  // SRD: Feather Fall — reaction triggered when caster or up to 5
  // creatures within 60 ft fall. Falling rate slows to 60 ft/round
  // for 1 minute. Narrative — pansori doesn't model falling damage
  // mechanics deeply enough for this to have a mechanical hook.
  feather_fall: {
    id: 'feather_fall',
    name: 'Feather Fall',
    level: 1,
    castTime: 'reaction',
    narrative: '{name} sketches a quick gesture — falling creatures drift, light as autumn leaves.',
    desc: 'Reaction: slow the descent of up to 5 falling creatures within 60 ft (no fall damage).',
    rangeKind: 'ranged',
    rangeFt: 60,
    spellList: ['arcane'],
  },
  // SRD: Hideous Laughter — single-target WIS save or Prone +
  // Incapacitated for the duration (concentration, up to 1 minute).
  // Target re-saves at end of each turn or after taking damage.
  // Pansori MVP applies Prone (the mechanically dominant rider);
  // the Incapacitated co-application and per-turn save are
  // deferred.
  hideous_laughter: {
    id: 'hideous_laughter',
    name: 'Hideous Laughter',
    level: 1,
    castTime: 'action',
    savingThrow: 'wis',
    saveEffect: 'negates',
    concentration: true,
    condition: 'prone',
    conditionDuration: 10,
    rangeKind: 'ranged',
    rangeFt: 30,
    desc: 'WIS save or Prone (and Incapacitated, RAW) for 1 minute (concentration). Target re-saves on damage.',
    spellList: ['arcane'],
  },
  // SRD: Longstrider — touch, +10 speed for 1 hour. Multi-target
  // via upcast. Pansori MVP is narrative — speed-buff persistence
  // across encounters needs a per-buff state field that's
  // deferred (effectiveSpeed currently reads only base speed +
  // feat bonuses).
  longstrider: {
    id: 'longstrider',
    name: 'Longstrider',
    level: 1,
    castTime: 'action',
    durationRounds: 600, // 1 hour
    narrative: '{name} touches an ally — their stride lengthens, the ground feels closer.',
    desc: 'Touch buff: +10 speed for 1 hour. Targets one creature; upcast +1 creature per slot above 1.',
    rangeKind: 'touch',
    spellList: ['arcane', 'primal'],
  },
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
  // SRD: Speak with Animals — for 10 minutes the caster can
  // comprehend beasts. Action or ritual. Narrative-only in pansori
  // (no beast NPC dialog model today).
  speak_with_animals: {
    id: 'speak_with_animals',
    name: 'Speak with Animals',
    level: 1,
    castTime: 'action',
    durationRounds: 100, // 10 minutes
    narrative:
      '{name} attunes their voice to a wilder register — the local beasts cock their heads to listen.',
    desc: 'Comprehend and converse with beasts for 10 minutes (also castable as a ritual).',
    rangeKind: 'self',
    spellList: ['primal'],
  },

  // ─── Level 2 ────────────────────────────────────────────────────────────────
  // SRD: Barkskin — touch a willing creature; their AC becomes 17
  // (if lower) for 1 hour (concentration). Pansori MVP is narrative
  // — persistent AC overrides need an AC-buff stack on the
  // character that's deferred.
  barkskin: {
    id: 'barkskin',
    name: 'Barkskin',
    level: 2,
    castTime: 'action',
    concentration: true,
    durationRounds: 600, // 1 hour
    narrative:
      '{name} presses a sprig of holly to an ally — rough bark-like skin hardens over their hide.',
    desc: 'Touch buff: minimum AC 17 for 1 hour (concentration).',
    rangeKind: 'touch',
    spellList: ['primal'],
  },
  // SRD: Magic Weapon — touch a nonmagical weapon; it becomes a
  // +1 weapon (attack + damage) for 1 hour (concentration). Pansori
  // MVP is narrative — persistent weapon-buff stacks need a
  // per-weapon-buff field that's deferred.
  magic_weapon: {
    id: 'magic_weapon',
    name: 'Magic Weapon',
    level: 2,
    castTime: 'bonus_action',
    concentration: true,
    durationRounds: 600, // 1 hour
    narrative:
      "{name}'s palm traces along the weapon — runes flare and the steel rings with new edge.",
    desc: 'Touch a weapon: +1 to attack + damage for 1 hour (concentration). Upcast: +2 at L4, +3 at L6.',
    rangeKind: 'touch',
    spellList: ['arcane', 'divine'],
  },
  // SRD: Calm Emotions — 20-ft sphere within 60 ft. Humanoids in
  // the area make a CHA save or one of: immunity to Charmed and
  // Frightened (and suppression of any current Charmed/Frightened),
  // or made indifferent to chosen creatures. Pansori MVP is
  // narrative — the suppress-condition rider would need a per-
  // condition-immunity hook on the condition pipeline.
  calm_emotions: {
    id: 'calm_emotions',
    name: 'Calm Emotions',
    level: 2,
    castTime: 'action',
    concentration: true,
    durationRounds: 10,
    rangeKind: 'ranged',
    rangeFt: 60,
    blastRadius: 20,
    aoeShape: 'sphere',
    narrative: '{name} sweeps a wave of calm through the room — tempers cool, fears thin.',
    desc: '20-ft sphere; humanoid targets CHA save or be calmed (suppress Charmed/Frightened OR indifferent). Concentration.',
    spellList: ['arcane', 'divine'],
  },
  // SRD: Continual Flame — permanent magical light from an object
  // touched. 50 gp ruby dust consumed at cast. Until dispelled.
  // Pansori MVP is narrative — flavor-only at the room-grained
  // lighting model.
  continual_flame: {
    id: 'continual_flame',
    name: 'Continual Flame',
    level: 2,
    castTime: 'action',
    materialCost: 50,
    narrative: '{name} touches the object — a perfectly steady flame springs from it, heatless.',
    desc: 'Permanent magical flame on a touched object (Bright Light 20 ft + Dim Light 20 ft). Consumes 50 gp ruby dust.',
    rangeKind: 'touch',
    spellList: ['arcane', 'divine', 'primal'],
  },
  // SRD: Pass without Trace — radiate a 30-ft aura of stealth for
  // 1 hour (concentration). Caster + each chosen creature gets
  // +10 to Dex (Stealth) and leaves no tracks. Pansori MVP is
  // narrative — the +10 stealth rider would need a per-skill
  // buff hook on the check pipeline (same shape Guidance defers).
  pass_without_trace: {
    id: 'pass_without_trace',
    name: 'Pass without Trace',
    level: 2,
    castTime: 'action',
    concentration: true,
    durationRounds: 600, // 1 hour
    narrative:
      '{name} burns a sprig of mistletoe — a hush settles over the party. Footsteps vanish into the loam.',
    desc: '30-ft party-stealth aura: +10 Stealth, leave no tracks (concentration, 1 hour).',
    rangeKind: 'self',
    spellList: ['primal'],
  },
  // SRD: Blindness/Deafness — single target, CON save or Blinded
  // (or Deafened — caster's choice) for 1 minute. RAW: target
  // repeats the save at end of each of its turns. Pansori MVP
  // sets a 10-round duration and doesn't repeat the save (matches
  // most other save-or-condition spells today).
  blindness_deafness: {
    id: 'blindness_deafness',
    name: 'Blindness/Deafness',
    level: 2,
    castTime: 'action',
    savingThrow: 'con',
    saveEffect: 'negates',
    condition: 'blinded',
    conditionDuration: 10,
    rangeKind: 'ranged',
    rangeFt: 120,
    desc: 'CON save or Blinded for 1 minute. (Deafened option deferred — pansori MVP defaults to Blinded.)',
    spellList: ['arcane', 'divine'],
  },
  // SRD: Detect Thoughts — divination, concentration up to 1 minute.
  // Sense thinking creatures within 30 ft; can probe surface
  // thoughts on a failed WIS save (deeper probe is a contested
  // check). Pansori MVP is narrative — no enemy "thinking creature"
  // detection model yet.
  detect_thoughts: {
    id: 'detect_thoughts',
    name: 'Detect Thoughts',
    level: 2,
    castTime: 'action',
    concentration: true,
    durationRounds: 10,
    narrative:
      '{name} extends a thread of attention — minds within 30 ft register as distinct presences.',
    desc: 'Sense thinking creatures within 30 ft for 1 minute (concentration).',
    rangeKind: 'self',
    spellList: ['arcane'],
  },
  // SRD: Knock — instantly unlock or unstick one mundane lock or
  // arcanely-sealed object within 60 ft. Loud (~300 ft audible).
  // Narrative spell — pansori's lock states are binary, so the
  // spell flips the latch without further mechanics.
  knock: {
    id: 'knock',
    name: 'Knock',
    level: 2,
    castTime: 'action',
    narrative:
      '{name} barks a hard syllable — the lock cracks open with a sound the whole hall hears.',
    desc: 'Unlock one mundane or arcanely-sealed object within 60 ft. Loud.',
    rangeKind: 'ranged',
    rangeFt: 60,
    spellList: ['arcane'],
  },
  // SRD: Locate Object — divination concentration up to 10 minutes.
  // Caster knows the direction to a familiar object within 1,000 ft.
  // Narrative spell in pansori — quest items typically have known
  // locations; the spell is flavor for player narrative.
  locate_object: {
    id: 'locate_object',
    name: 'Locate Object',
    level: 2,
    castTime: 'action',
    concentration: true,
    durationRounds: 100, // 10 minutes
    narrative:
      "{name}'s mind reaches out — a tug in the air points the way to the object's location.",
    desc: 'Sense the direction to a familiar object within 1,000 ft (concentration, 10 minutes).',
    rangeKind: 'self',
    spellList: ['arcane', 'divine', 'primal'],
  },
  // SRD: Augury — divination ritual (1 minute or ritual). Returns
  // a one-word omen (weal / woe / weal-and-woe / nothing) for an
  // action the caster is about to take. Narrative.
  augury: {
    id: 'augury',
    name: 'Augury',
    level: 2,
    castTime: 'action',
    narrative:
      '{name} casts bones, sticks, or marked cards — the world answers with an omen, brief and certain.',
    desc: 'Ritual divination: receive an omen (weal / woe / both / nothing) about a future course of action.',
    rangeKind: 'self',
    spellList: ['divine', 'primal'],
  },
  // SRD: Darkness — 15-ft radius sphere of magical darkness for 10
  // minutes (concentration). Heavy obscurement; even darkvision
  // can't see through. Narrative spell in pansori — the engine
  // doesn't model per-tile lighting at the resolution Darkness
  // operates on, so the spell is flavor-only. (Drow's racial
  // Darkness in pansori's earlier build used the same shape.)
  darkness: {
    id: 'darkness',
    name: 'Darkness',
    level: 2,
    castTime: 'action',
    concentration: true,
    durationRounds: 100, // 10 minutes
    narrative: '{name} sketches a black sigil — light bleeds out of the air around it.',
    desc: '60-ft radius sphere of magical darkness for 10 minutes (concentration). Heavily Obscured area.',
    rangeKind: 'ranged',
    rangeFt: 60,
    blastRadius: 15,
    aoeShape: 'sphere',
    spellList: ['arcane'],
  },
  // SRD: Shatter — 10-ft sphere AoE centered on a point within 60 ft;
  // CON save for half. 3d8 thunder, +1d8 per slot above 2nd. Constructs
  // roll the save at disadvantage RAW; pansori's enemy-disadvantage
  // path doesn't yet take a per-enemy-type tag, so the Construct
  // disadvantage is deferred.
  shatter: {
    id: 'shatter',
    name: 'Shatter',
    level: 2,
    castTime: 'action',
    damage: '3d8',
    upcastBonus: '1d8',
    damageType: 'thunder',
    savingThrow: 'con',
    saveEffect: 'half',
    desc: '10-ft thunder sphere; CON save for half. 3d8 thunder (+1d8 per slot above 2nd).',
    rangeKind: 'ranged',
    rangeFt: 60,
    blastRadius: 10,
    aoeShape: 'sphere',
    spellList: ['arcane'],
  },
  // SRD: Acid Arrow — ranged spell attack; on hit deals 4d4 acid +
  // 2d4 acid at the end of the target's next turn. RAW also splashes
  // half initial damage on a miss. Pansori MVP applies just the
  // initial 4d4 on hit; the end-of-next-turn DoT and miss-splash are
  // both deferred behind a future "delayed-damage" hook.
  acid_arrow: {
    id: 'acid_arrow',
    name: 'Acid Arrow',
    level: 2,
    castTime: 'action',
    damage: '4d4',
    upcastBonus: '1d4',
    damageType: 'acid',
    attackRoll: true,
    desc: 'Ranged spell attack; 4d4 acid on hit (+1d4 per slot above 2nd). Future-tick splash deferred.',
    rangeKind: 'ranged',
    rangeFt: 90,
    spellList: ['arcane'],
  },
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
  // SRD: Tongues — touch a willing creature; for 1 hour they
  // understand any spoken language and any creature that knows a
  // language understands them. Narrative.
  tongues: {
    id: 'tongues',
    name: 'Tongues',
    level: 3,
    castTime: 'action',
    durationRounds: 600, // 1 hour
    narrative:
      "{name} touches an ally's lips — speech and understanding become unbound from any single tongue.",
    desc: 'Touch buff: understand and be understood in any spoken language for 1 hour.',
    rangeKind: 'touch',
    spellList: ['arcane', 'divine'],
  },
  // SRD: Speak with Dead — grant a corpse the ability to answer
  // five questions; corpse responds within its knowledge but won't
  // betray secrets. Lasts 10 minutes. Narrative.
  speak_with_dead: {
    id: 'speak_with_dead',
    name: 'Speak with Dead',
    level: 3,
    castTime: 'action',
    durationRounds: 100, // 10 minutes
    narrative:
      "{name} kneels by the body and speaks the question. After a long pause, the corpse's lips move with grave-borrowed words.",
    desc: 'Question a corpse — five answers, no oaths of silence broken. Lasts 10 minutes.',
    rangeKind: 'ranged',
    rangeFt: 10,
    spellList: ['arcane', 'divine'],
  },
  // SRD: Speak with Plants — for 10 minutes the caster can
  // communicate with plants in a 30-ft Emanation: ask about
  // recent events, who has passed nearby, etc. Narrative.
  speak_with_plants: {
    id: 'speak_with_plants',
    name: 'Speak with Plants',
    level: 3,
    castTime: 'action',
    durationRounds: 100, // 10 minutes
    narrative:
      '{name} kneels among the plants and listens. Roots remember; leaves whisper recent days.',
    desc: 'Converse with plants within 30 ft for 10 minutes — learn who has passed, recent events.',
    rangeKind: 'self',
    spellList: ['primal'],
  },
  // SRD: Remove Curse — touch a creature; all curses on them end.
  // Cursed magic items keep their curse but the attunement is
  // broken. Pansori MVP is narrative — no curse-condition pipeline
  // exists today (Bestow Curse / Hex / etc. aren't seeded).
  remove_curse: {
    id: 'remove_curse',
    name: 'Remove Curse',
    level: 3,
    castTime: 'action',
    narrative: '{name} lays a hand on the cursed — the dark hum that has followed them falls away.',
    desc: 'Touch: end all curses on the target. Breaks attunement to cursed items.',
    rangeKind: 'touch',
    spellList: ['arcane', 'divine'],
  },
  // SRD: Fear — 30-ft cone WIS save or Frightened (concentration,
  // up to 1 minute). Frightened creatures must Dash away from the
  // caster each turn. Pansori MVP applies the Frightened condition;
  // the forced-Dash behavior is deferred (would need an AI hook
  // for the enemy-turn move planner).
  fear: {
    id: 'fear',
    name: 'Fear',
    level: 3,
    castTime: 'action',
    savingThrow: 'wis',
    saveEffect: 'negates',
    concentration: true,
    condition: 'frightened',
    conditionDuration: 10,
    rangeKind: 'self',
    blastRadius: 30,
    aoeShape: 'cone',
    desc: '30-ft cone WIS save or Frightened (concentration, 1 minute). RAW forced-Dash behavior deferred.',
    spellList: ['arcane'],
  },
  // SRD: Sending — telepathic 25-word message to anyone the caster
  // has met or had described to them. Unlimited range, even across
  // planes. Pure narrative spell.
  sending: {
    id: 'sending',
    name: 'Sending',
    level: 3,
    castTime: 'action',
    narrative:
      "{name} fixes the recipient's face in mind — a thought-thread carries 25 words across any distance.",
    desc: 'Send a 25-word telepathic message to anyone you have met. Unlimited range.',
    rangeKind: 'self',
    spellList: ['arcane', 'divine'],
  },
  // SRD: Hypnotic Pattern — 30-ft cube within 120 ft. WIS save or
  // Charmed for the duration (concentration, up to 1 minute);
  // Charmed targets also gain Incapacitated + Speed 0. RAW: the
  // spell ends for an affected creature if it takes damage or an
  // ally uses an action to shake it out. Pansori MVP applies the
  // charmed condition with a 10-round duration and skips the
  // damage-breaks-charm rider for now (would need a per-condition
  // break-on-damage hook).
  hypnotic_pattern: {
    id: 'hypnotic_pattern',
    name: 'Hypnotic Pattern',
    level: 3,
    castTime: 'action',
    savingThrow: 'wis',
    saveEffect: 'negates',
    concentration: true,
    condition: 'charmed',
    conditionDuration: 10,
    rangeKind: 'ranged',
    rangeFt: 120,
    blastRadius: 30,
    aoeShape: 'cube',
    desc: '30-ft cube WIS save or charmed (concentration, 1 minute). Damage breaks the charm — deferred.',
    spellList: ['arcane'],
  },
  // SRD: Daylight — creates a 60-ft sphere of bright sunlight for
  // 1 hour. Bright Light + 60 ft of Dim Light beyond. Narrative
  // spell in pansori (room-grained lighting model); the spell
  // can also be cast on an object to make it a sun-source.
  daylight: {
    id: 'daylight',
    name: 'Daylight',
    level: 3,
    castTime: 'action',
    durationRounds: 600, // 1 hour
    narrative: '{name} kindles a star at their fingertips — daylight floods the room.',
    desc: '60-ft sphere of sunlight for 1 hour. Counters magical Darkness of level 3 or lower.',
    rangeKind: 'ranged',
    rangeFt: 60,
    spellList: ['divine', 'primal'],
  },
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
    // SRD: "This spell also ends the Blinded, Deafened, and Poisoned
    // conditions on the target."
    removeConditions: ['blinded', 'deafened', 'poisoned'],
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

  // 2024 PHB Polymorph (L4 transmutation). Target makes a WIS save or
  // is transformed into a small beast for the duration. Pansori MVP
  // auto-picks 'Wolf' (CR 1/4, 11 HP, 2d4+2 bite) as the form for
  // every successful polymorph. RAW lets the caster pick a beast with
  // CR ≤ target's level; auto-pick keeps the choice surface clean
  // (no destination picker yet on the FE). Stats are swapped via the
  // entity's `polymorph_state` field — concentration drop reverts.
  // 0 HP in new form: pansori MVP just dies (RAW would revert with
  // excess damage carrying over).
  polymorph: {
    id: 'polymorph',
    name: 'Polymorph',
    level: 4,
    castTime: 'action',
    concentration: true,
    durationRounds: 100,
    savingThrow: 'wis',
    saveEffect: 'negates',
    condition: 'polymorphed',
    conditionDuration: 100,
    desc: 'A creature within 60 ft makes a WIS save or is transformed into a small beast (Wolf, 11 HP) for the duration. Concentration up to 1 hour.',
    narrative:
      '{name} weaves a transmutation rune — {target} contorts, shrinks, fur and fang reshaping flesh.',
    rangeKind: 'ranged',
    rangeFt: 60,
    spellList: ['arcane', 'primal'],
  },

  // 2024 PHB Slow (L3 transmutation). Up to 6 creatures in a 40-ft
  // cube make a WIS save or are slowed for the duration. Pansori MVP
  // hits a single target via the existing save+condition path (RAW
  // multi-target deferred).
  //
  // SRD: "An affected target's Speed is halved, it takes a −2 penalty
  // to AC and Dexterity saving throws, and it can't take Reactions.
  // On its turns, it can take either an action or a Bonus Action, not
  // both, and it can make only one attack if it takes the Attack
  // action. If it casts a spell with a Somatic component, there is a
  // 25 percent chance the spell fails..."
  //
  // Pansori MVP wires the speed-halving + AC penalty + Dex-save
  // penalty via the `slowed` condition. The action-economy cap
  // (action OR bonus, one attack max), no reactions, and the 25%
  // somatic fail are deferred behind the same turn-flow / reaction-
  // window work that Haste's extra-action is blocked on. The end-of-
  // turn save to throw off the effect is also deferred.
  slow: {
    id: 'slow',
    name: 'Slow',
    level: 3,
    castTime: 'action',
    concentration: true,
    durationRounds: 100, // 1 minute
    savingThrow: 'wis',
    saveEffect: 'negates',
    condition: 'slowed',
    conditionDuration: 100,
    desc: 'Up to six creatures in a 40 ft cube make a WIS save or are slowed for 1 minute: Speed halved, -2 AC, -2 Dex saves.',
    narrative: '{name} weaves the rune of stilled time — {target} drags as if through mud.',
    rangeKind: 'ranged',
    rangeFt: 120,
    spellList: ['arcane'],
  },

  // 2024 PHB Haste (L3 transmutation). Buff a willing creature
  // for concentration up to 1 minute: Speed doubled, +2 AC,
  // advantage on Dex saves, and one extra action per turn (limited
  // to Attack-one / Dash / Disengage / Hide / Utilize). When the
  // spell ends, the target is Incapacitated and has Speed 0 until
  // the end of its next turn (the "lethargy" RAW carries).
  //
  // SRD: "Choose a willing creature ... the target's Speed is doubled,
  // it gains a +2 bonus to Armor Class, it has Advantage on Dexterity
  // saving throws, and it gains an additional action on each of its
  // turns. ... When the spell ends, the target is Incapacitated and
  // has a Speed of 0 until the end of its next turn."
  //
  // Pansori MVP wires the speed / AC / Dex save / lethargy parts via
  // the `hasted` condition flag; the extra-action mechanic is
  // deferred behind a turn-flow refactor that would let a PC take a
  // second limited action without ending their turn.
  haste: {
    id: 'haste',
    name: 'Haste',
    level: 3,
    castTime: 'action',
    concentration: true,
    durationRounds: 100, // 1 minute = 10 rounds; doubled to track lethargy carryover
    condition: 'hasted',
    conditionDuration: 100,
    desc: 'A willing creature gains Speed×2, +2 AC, Advantage on Dex saves, and one extra limited action per turn for 1 minute. When the spell ends, the target is Incapacitated until the end of its next turn.',
    narrative: '{name} chants the rune of swiftness — {target} blurs with sudden speed.',
    targetType: 'self_or_ally',
    rangeKind: 'ranged',
    rangeFt: 30,
    spellList: ['arcane'],
  },

  // 2024 PHB Dimension Door (L4 conjuration). Teleport up to 500 ft
  // to an unoccupied space. Pansori treats the grid as effectively
  // "within range" since rooms are smaller than 500 ft. New castSpell
  // branch auto-picks the cell with maximum min-distance to any
  // living enemy (pansori MVP — no FE picker yet for destination
  // cells). Willing-creature passenger (RAW: one creature within 5 ft)
  // deferred until the action shape carries an optional companion id.
  dimension_door: {
    id: 'dimension_door',
    name: 'Dimension Door',
    level: 4,
    castTime: 'action',
    desc: 'You teleport yourself up to 500 feet to an unoccupied space you can see.',
    narrative:
      '{name} steps through a tear in the air — reality folds and they reappear elsewhere.',
    rangeKind: 'self',
    spellList: ['arcane'],
  },
};
