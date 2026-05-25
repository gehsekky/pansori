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
  // SRD: Acid Splash — an acidic bubble bursts in a 5-ft-radius Sphere;
  // each creature there makes a DEX save or takes 1d6 acid. Cantrip
  // scaling on the standard ladder.
  acid_splash: {
    id: 'acid_splash',
    name: 'Acid Splash',
    level: 0,
    castTime: 'action',
    damage: '1d6',
    damageType: 'acid',
    savingThrow: 'dex',
    saveEffect: 'negates',
    upcastBonus: '1d6',
    blastRadius: 5,
    aoeShape: 'sphere',
    desc: 'An acidic bubble bursts in a 5-ft-radius sphere; each creature makes a Dexterity save or takes 1d6 acid damage (scales with level).',
    rangeKind: 'ranged',
    rangeFt: 60,
    spellList: ['arcane'],
  },
  // SRD: Produce Flame — a flame in your hand sheds light and can be
  // hurled at a target within 60 ft (ranged spell attack, 1d8 fire). The
  // light is flavor in pansori's room-grained lighting; the hurl is the
  // combat payload. Cantrip scaling on the standard ladder.
  produce_flame: {
    id: 'produce_flame',
    name: 'Produce Flame',
    level: 0,
    castTime: 'action',
    damage: '1d8',
    damageType: 'fire',
    attackRoll: true,
    upcastBonus: '1d8',
    desc: 'A flame springs to your hand, shedding light, then is hurled at a target. Ranged spell attack; 1d8 fire damage on a hit (scales with level).',
    rangeKind: 'ranged',
    rangeFt: 60,
    spellList: ['primal'],
  },
  // SRD: Starry Wisp — launch a mote of light (ranged spell attack, 1d8
  // radiant). RAW it also lights the target and denies it the Invisible
  // condition until your next turn; that reveal rider is narrated (pansori
  // has no see-Invisible substrate). Cantrip scaling on the standard ladder.
  starry_wisp: {
    id: 'starry_wisp',
    name: 'Starry Wisp',
    level: 0,
    castTime: 'action',
    damage: '1d8',
    damageType: 'radiant',
    attackRoll: true,
    upcastBonus: '1d8',
    desc: 'A mote of starlight streaks at a target. Ranged spell attack; 1d8 radiant damage on a hit, and the target sheds dim light and cannot benefit from being Invisible until your next turn (scales with level).',
    rangeKind: 'ranged',
    rangeFt: 60,
    spellList: ['arcane', 'primal'],
  },
  // SRD: Message — whisper to one creature within 120 ft; it (and only it)
  // hears and can reply in a whisper. Narrative utility cantrip (somatic +
  // material only, no verbal component).
  message: {
    id: 'message',
    name: 'Message',
    level: 0,
    castTime: 'action',
    verbal: false,
    narrative: '{name} points and whispers — the words carry to one ear alone.',
    desc: 'Whisper a short message to one creature within range; only it hears, and it can whisper a reply only you hear (1 round).',
    rangeKind: 'ranged',
    rangeFt: 120,
    spellList: ['arcane', 'primal'],
  },
  // SRD: Minor Illusion — create a sound or a small static image within
  // 30 ft for 1 minute. A creature that Studies it can disbelieve with an
  // Investigation check vs your save DC. Narrative utility cantrip (somatic
  // + material only, no verbal component).
  minor_illusion: {
    id: 'minor_illusion',
    name: 'Minor Illusion',
    level: 0,
    castTime: 'action',
    verbal: false,
    narrative: '{name} shapes a brief illusion — a phantom sound or image flickers into being.',
    desc: 'Create an illusory sound or a static image of an object (no larger than a 5-ft cube) within range for 1 minute. A creature that studies it may disbelieve with an Investigation check vs your spell save DC.',
    rangeKind: 'ranged',
    rangeFt: 30,
    spellList: ['arcane'],
  },
  // SRD: Elementalism (2024) — a minor control effect over air, earth,
  // fire, or water within 30 ft. Narrative utility cantrip.
  elementalism: {
    id: 'elementalism',
    name: 'Elementalism',
    level: 0,
    castTime: 'action',
    narrative: '{name} flexes a hand and the elements answer in some small way.',
    desc: 'A minor elemental effect within range: stir a breeze, raise dust or sand, kindle or snuff a tiny flame, or part a thin sheet of water.',
    rangeKind: 'ranged',
    rangeFt: 30,
    spellList: ['arcane', 'primal'],
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
  // SRD: Lesser Restoration — L2 Abjuration, bonus action, touch.
  // End ONE of Blinded / Deafened / Paralyzed / Poisoned on the
  // target. Pansori MVP strips all four if present (the "pick one"
  // UX is deferred — for now restoration is forgiving). Routes
  // through the buff branch via `removeConditions`.
  lesser_restoration: {
    id: 'lesser_restoration',
    name: 'Lesser Restoration',
    level: 2,
    castTime: 'bonus_action',
    targetType: 'self_or_ally',
    rangeKind: 'touch',
    removeConditions: ['blinded', 'deafened', 'paralyzed', 'poisoned'],
    desc:
      'Touch: end Blinded / Deafened / Paralyzed / Poisoned on the target. ' +
      '(RAW "pick one" — pansori MVP strips any present.)',
    narratives: {
      cast: [
        '{name} places a steady hand on {target} — the affliction loosens its grip',
        "{name}'s touch draws the poison-thread of {spell} out of {target}",
      ],
    },
    spellList: ['arcane', 'divine', 'primal'],
  },
  // SRD: Greater Restoration — L5 Abjuration, action, touch.
  // Removes one of: 1 exhaustion level / Charmed / Petrified / a
  // curse / an ability-score reduction / a max-HP reduction.
  // Consumes 100 gp diamond dust. Pansori MVP strips Charmed +
  // Petrified + Stunned if present AND reduces exhaustion by 1
  // (Stunned is added here as a generous bundle for the MVP since
  // the 5-option picker UX isn't surfaced). Curse / ability-score /
  // max-HP reduction effects aren't modeled in pansori yet.
  greater_restoration: {
    id: 'greater_restoration',
    name: 'Greater Restoration',
    level: 5,
    castTime: 'action',
    materialCost: 100,
    targetType: 'self_or_ally',
    rangeKind: 'touch',
    removeConditions: ['charmed', 'petrified', 'stunned'],
    desc:
      'Touch: end Charmed / Petrified / Stunned on the target and reduce exhaustion by 1. ' +
      'Consumes 100 gp of diamond dust. (RAW curse / ability-score / max-HP reduction ' +
      "removal deferred — those effects aren't modeled in pansori.)",
    narratives: {
      cast: [
        '{name} sprinkles diamond dust over {target}, and the curse breaks like brittle ice',
        "{name} crushes the dust between their palms — {target}'s eyes clear, breath quickens",
      ],
    },
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
  // SRD: Scorching Ray — L2 Evocation. Three rays of fire; each
  // rolls its own ranged spell attack. 2d6 fire per hit. Upcast
  // adds +1 ray per slot above 2nd. Routes through the multi-
  // target branch alongside Magic Missile and Eldritch Blast.
  scorching_ray: {
    id: 'scorching_ray',
    name: 'Scorching Ray',
    level: 2,
    castTime: 'action',
    damageType: 'fire',
    damage: '6d6', // 3 rays × 2d6 — surfaced as the base "damage" for
    //                 single-target fallback when the FE doesn't
    //                 split into separate targetEnemyIds yet.
    attackRoll: true,
    rangeKind: 'ranged',
    rangeFt: 120,
    desc: 'Three fiery rays. Spell attack per ray; 2d6 fire each. +1 ray per slot above 2nd.',
    narratives: {
      cast: [
        '{name} hurls three lances of fire{slotNote} — the air shimmers in their wake',
        '{name} sweeps a hand, and three ribbons of flame streak toward {target}{slotNote}',
      ],
    },
    spellList: ['arcane'],
  },
  // SRD: Chromatic Orb — L1 Evocation. Single ranged spell attack;
  // 3d8 of a chosen damage type (Acid / Cold / Fire / Lightning /
  // Poison / Thunder). Pansori MVP defaults to fire (the picker UX
  // for choosing the damage type is deferred). Upcast: +1d8 per
  // slot above 1st. RAW also has a "leap" rider (matching d8 values
  // bounce to a second target) — deferred behind the same FE picker
  // work since it needs runtime per-die introspection.
  chromatic_orb: {
    id: 'chromatic_orb',
    name: 'Chromatic Orb',
    level: 1,
    castTime: 'action',
    damageType: 'fire',
    damage: '3d8',
    upcastBonus: '1d8',
    attackRoll: true,
    materialCost: 50,
    rangeKind: 'ranged',
    rangeFt: 90,
    desc:
      'Ranged spell attack: 3d8 fire damage (MVP — chosen-type picker deferred). ' +
      'Consumes a 50 gp diamond. +1d8 per slot above 1st.',
    narratives: {
      cast: [
        '{name} cradles a glowing 50-gp diamond — chromatic light flares and lances at {target}{slotNote}',
        '{name} hurls a shimmering orb of fire{slotNote} — the diamond detonates mid-arc',
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
  // SRD: Bane — the inverse of Bless. Three target enemies CHA save
  // or subtract 1d4 from their attack rolls and saves for the
  // concentration duration. Pansori wires the `baned` condition the
  // same way Bless wires `blessed`: a string flag on the target's
  // conditions list that toHit + rollConditionSave read. Upcast adds
  // +1 target per slot above 1st (data only — pansori MVP applies to
  // a single enemy through the save+condition pipeline; multi-target
  // upcast is deferred behind the same picker UX that Bless awaits).
  bane: {
    id: 'bane',
    name: 'Bane',
    level: 1,
    castTime: 'action',
    savingThrow: 'cha',
    saveEffect: 'negates',
    concentration: true,
    condition: 'baned',
    conditionDuration: 10,
    rangeKind: 'ranged',
    rangeFt: 30,
    desc:
      'CHA save or the target subtracts 1d4 from attack rolls and saves for the duration. ' +
      'Concentration, up to 1 minute. (RAW up to 3 targets — pansori MVP hits one.)',
    narratives: {
      cast: [
        '{name} whispers a curse{slotNote} — black motes settle around {target}',
        '{name} traces a sigil of blood{slotNote} and a sickly halo clings to {target}',
      ],
    },
    spellList: ['arcane', 'divine'],
  },
  // SRD: Death Ward — L4 Abjuration, Cleric/Paladin. Touch buff.
  // The first time the target would drop to 0 HP before the spell
  // ends, drops to 1 instead and the spell ends. 8-hour duration.
  // RAW also negates instant-death effects that don't deal damage
  // (Power Word Kill); pansori doesn't model those today so the
  // hook is unused. Routes through the buff branch — sets the
  // one-shot `death_ward_active` flag; interception lives in
  // `applyDamage` where HP would otherwise hit 0.
  death_ward: {
    id: 'death_ward',
    name: 'Death Ward',
    level: 4,
    castTime: 'action',
    targetType: 'self_or_ally',
    rangeKind: 'touch',
    desc:
      'Touch: the first time the target would drop to 0 HP before the spell ends, it drops ' +
      'to 1 instead. 8-hour duration; consumed on the rescue.',
    narratives: {
      cast: [
        '{name} traces a sigil of protection over {target} — the next mortal blow will hesitate at the threshold',
        "{name}'s touch leaves a silver echo around {target}, listening for the killing strike",
      ],
    },
    spellList: ['divine'],
  },
  // SRD: Power Word Heal — L9 Enchantment (Bard, Cleric). Verbal only
  // (no somatic). Restores all of one creature's HP and ends Charmed /
  // Frightened / Paralyzed / Poisoned / Stunned; a Prone target stands
  // (pansori auto-resolves the RAW optional reaction by clearing prone).
  // `heal: '0'` is a placeholder — `healFull` fills the target to max.
  // A Bard's L20 Words of Creation adds a second target within 10 ft
  // (handled in the heal branch).
  power_word_heal: {
    id: 'power_word_heal',
    name: 'Power Word Heal',
    level: 9,
    castTime: 'action',
    targetType: 'ally',
    rangeKind: 'ranged',
    rangeFt: 60,
    heal: '0',
    healFull: true,
    removeConditions: ['charmed', 'frightened', 'paralyzed', 'poisoned', 'stunned', 'prone'],
    verbal: true,
    somatic: false,
    desc:
      'A wave of healing energy restores all of one creature’s Hit Points within 60 ft and ends ' +
      'the Charmed, Frightened, Paralyzed, Poisoned, and Stunned conditions; a prone target stands.',
    narratives: {
      cast: [
        '{name} speaks a word of life over {target} — wounds knit shut and shackles of the mind fall away',
        "{name}'s word of creation washes over {target}, restoring them whole",
      ],
    },
    spellList: ['arcane', 'divine'],
  },
  // SRD: Power Word Kill — L9 Enchantment (Bard, Sorcerer, Warlock,
  // Wizard). Verbal only. If the target has 100 HP or fewer it dies
  // outright (no save, no damage); otherwise it takes 12d12 Psychic
  // damage. The instant-death branch ignores damage resistance (it is
  // not damage). A Bard's L20 Words of Creation adds a second target
  // within 10 ft. Resolved by `runPowerWordKill` (intercepted in the
  // castSpell orchestrator), not the generic auto-hit branch.
  power_word_kill: {
    id: 'power_word_kill',
    name: 'Power Word Kill',
    level: 9,
    castTime: 'action',
    rangeKind: 'ranged',
    rangeFt: 60,
    damage: '12d12',
    damageType: 'psychic',
    verbal: true,
    somatic: false,
    desc:
      'You compel one creature you can see within 60 ft to die. If it has 100 HP or fewer it dies; ' +
      'otherwise it takes 12d12 psychic damage.',
    narratives: {
      cast: [
        '{name} utters a word of death at {target}',
        "{name}'s word of creation tolls like a bell — {target}'s life answers",
      ],
    },
    spellList: ['arcane'],
  },
  // SRD: Hunter's Mark — L1 Divination (Ranger). Bonus action, V only,
  // Concentration up to 1 hour. Marks one creature within 90 ft; the caster's
  // attack-roll hits vs it deal +1d6 Force (d10 at Ranger L20 — Foe Slayer).
  // Resolved by a cast-pipeline interception that sets hunters_mark_target_id
  // + concentration (no immediate damage); the +damage rider lives in
  // resolveOneAttack. The "move the mark on a kill" + WIS-check advantage and
  // the Favored Enemy free-cast accounting are deferred follow-ups.
  hunters_mark: {
    id: 'hunters_mark',
    name: "Hunter's Mark",
    level: 1,
    castTime: 'bonus_action',
    concentration: true,
    durationRounds: 600, // 1 hour
    rangeKind: 'ranged',
    rangeFt: 90,
    verbal: true,
    somatic: false,
    desc:
      'Bonus action, Concentration up to 1 hour: mark one creature within 90 ft. Your attack-roll ' +
      'hits against it deal an extra 1d6 Force damage (1d10 at Ranger 20).',
    narratives: {
      cast: [
        '{name} marks {target} as quarry — every strike will bite deeper',
        "{name}'s gaze locks onto {target}; the hunter's mark is set",
      ],
    },
    spellList: ['primal'],
  },
  // SRD: Beacon of Hope — Cleric L3 Abjuration, concentration.
  // Targets in 30 ft gain advantage on WIS saves + death saves +
  // max heal on any healing. Pansori wires the `hopeful` condition
  // (read by rollConditionSave for WIS adv + by the death-save
  // handler for death-save adv). The max-heal effect is deferred —
  // it'd require the heal-roll site to know the dice ceiling, a
  // hook that hasn't landed yet. Hand-rolled in `utility.ts` the
  // same way Bless is, since utility doesn't have a Bless-shaped
  // generic-multi-target-condition primitive.
  beacon_of_hope: {
    id: 'beacon_of_hope',
    name: 'Beacon of Hope',
    level: 3,
    castTime: 'action',
    concentration: true,
    narrative: "{name} kindles a beacon of hope — allies' resolve hardens against fear and death.",
    desc:
      'Concentration, up to 1 minute. Up to 3 allies within 30 ft gain advantage on WIS saves ' +
      'and death saves. (RAW max-heal effect deferred.)',
    rangeKind: 'ranged',
    rangeFt: 30,
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
  // SRD: Grease — nonflammable grease coats a 10-ft square (Difficult
  // Terrain for 1 minute); each creature caught in it makes a DEX save or
  // has the Prone condition. The lingering difficult terrain is narrated
  // (pansori doesn't persist spell-made terrain); the save-or-Prone is
  // mechanical.
  grease: {
    id: 'grease',
    name: 'Grease',
    level: 1,
    castTime: 'action',
    savingThrow: 'dex',
    saveEffect: 'negates',
    condition: 'prone',
    blastRadius: 10,
    aoeShape: 'cube',
    desc: 'Slick grease coats a 10-ft square, turning it into difficult terrain; each creature caught in it must succeed on a Dexterity save or fall Prone.',
    rangeKind: 'ranged',
    rangeFt: 60,
    spellList: ['arcane'],
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
  // SRD: Invisibility — a creature you touch gains the Invisible condition
  // (Concentration, up to 1 hour). Ends early when the target attacks, deals
  // damage, or casts a spell — pansori's default break-on-attack handles this
  // (this id is NOT in the keep-invisibility set, unlike Greater Invisibility).
  // Upcast (+1 target/slot) isn't modeled (single target).
  invisibility: {
    id: 'invisibility',
    name: 'Invisibility',
    level: 2,
    castTime: 'action',
    concentration: true,
    durationRounds: 600,
    targetType: 'self_or_ally',
    condition: 'invisible',
    conditionDuration: 600,
    rangeKind: 'touch',
    desc: 'A willing creature you touch becomes Invisible until the spell ends (Concentration, up to 1 hour). The effect ends early if the target attacks, deals damage, or casts a spell.',
    narratives: {
      cast: [
        '{name} traces {spell}{slotNote} over {target}, who fades from view',
        '{name} murmurs {spell}{slotNote} and {target} melts into the air',
      ],
    },
    spellList: ['arcane'],
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
  // SRD: Revivify — touch a creature that died within the last
  // minute; they revive at 1 HP. Consumes a 300 gp diamond. Doesn't
  // restore missing body parts or work on death-by-old-age. Pansori
  // tracks the death-window via `died_at_round` (set when `dead`
  // flips to true) and gates the cast against the spell's
  // `revive.windowRounds` (1 minute = 10 combat rounds).
  // SRD: Animate Dead — out of combat, raise a Skeleton from bones to
  // fight at your side (commanded as a Bonus Action). Pansori models the
  // 1-minute cast as out-of-combat-only; the Skeleton joins the next
  // battle via the summon lifecycle (RE-1 Phase 4). MVP raises one
  // Skeleton (SRD stat block); the Zombie variant + multi-raise are
  // follow-ups.
  animate_dead: {
    id: 'animate_dead',
    name: 'Animate Dead',
    level: 3,
    castTime: 'action',
    desc: 'Out of combat, raise an undead servant from a pile of bones (Skeleton: AC 14, 13 HP, +5, 1d6+3) or a corpse (Zombie: AC 8, 15 HP, +3, 1d8+1). It fights at your side and joins your next battle; command it as a Bonus Action. A higher-level slot raises two more per level above 3rd.',
    spellList: ['arcane', 'divine'],
    outOfCombatOnly: true,
    summon: {
      name: 'Skeleton',
      ac: 14,
      maxHp: 13,
      toHit: 5,
      damage: '1d6+3',
      variants: [{ name: 'Zombie', ac: 8, maxHp: 15, toHit: 3, damage: '1d8+1' }],
      countPerUpcastLevel: 2,
    },
  },
  revivify: {
    id: 'revivify',
    name: 'Revivify',
    level: 3,
    castTime: 'action',
    materialCost: 300,
    narratives: {
      cast: [
        '{name} presses a flickering diamond to {target} and pours faith through the stone{slotNote}',
        '{name} kneels over {target}, diamond clutched between their palms — a slow, deliberate prayer{slotNote}',
        '{name} breaks open the stored light of a diamond and calls {target} back from the dark{slotNote}',
      ],
    },
    desc: 'Touch a creature dead < 1 minute. Returns them at 1 HP. Consumes a 300 gp diamond.',
    rangeKind: 'touch',
    spellList: ['divine', 'primal'],
    revive: {
      hpRestored: 1,
      windowRounds: 10,
      materialCost: 300,
    },
  },
  // SRD: Raise Dead — touch a creature dead ≤ 10 days; returns at
  // 1 HP, closes mortal wounds, neutralizes poisons. 1-hour cast.
  // Consumes a 500 gp diamond. RAW also imposes a −4 D20 penalty
  // until the target's long-rest count clears it; pansori MVP
  // skips that nerf (the d20-mod plumbing across every roll site
  // is meaningful surgery — deferred behind a global penalty
  // helper if the mechanic ever lands).
  raise_dead: {
    id: 'raise_dead',
    name: 'Raise Dead',
    level: 5,
    castTime: 'action',
    materialCost: 500,
    narratives: {
      cast: [
        "{name} sets the diamond on {target}'s chest and begins the slow ritual{slotNote}",
        '{name} chants over {target} for an hour, the diamond cracking as the soul returns{slotNote}',
      ],
    },
    desc:
      'Touch a creature dead < 10 days. Returns at 1 HP; closes mortal wounds, neutralizes poison. ' +
      'Consumes a 500 gp diamond. (RAW −4 D20 penalty until long-rested off — deferred in pansori.)',
    rangeKind: 'touch',
    spellList: ['arcane', 'divine'],
    revive: {
      hpRestored: 1,
      windowRounds: 99999,
      materialCost: 500,
    },
  },
  // SRD: Resurrection — touch a creature dead ≤ 100 years; returns
  // at full HP, closes wounds, neutralizes poison, restores missing
  // body parts. 1-hour cast. Consumes a 1000 gp diamond. RAW also
  // imposes the −4 D20 penalty + a 365-day caster-tax when reviving
  // a creature dead a year or more (no-spell-cast and disadvantage
  // on D20 tests until the caster long-rests). Pansori MVP skips
  // both (the 365-day check needs absolute-time tracking the engine
  // doesn't model today).
  resurrection: {
    id: 'resurrection',
    name: 'Resurrection',
    level: 7,
    castTime: 'action',
    materialCost: 1000,
    narratives: {
      cast: [
        '{name} pours a thousand gold of starfire into {target} and calls the soul home{slotNote}',
        "{name}'s hour-long invocation closes around {target}, knitting flesh and breath alike{slotNote}",
      ],
    },
    desc:
      'Touch a creature dead < 1 century. Returns at full HP; closes wounds, neutralizes poison, ' +
      'restores missing body parts. Consumes a 1000 gp diamond. (RAW −4 D20 penalty + 365-day ' +
      'caster-tax both deferred in pansori.)',
    rangeKind: 'touch',
    spellList: ['arcane', 'divine'],
    revive: {
      hpRestored: 'full',
      windowRounds: 99999,
      materialCost: 1000,
    },
  },
  // SRD: True Resurrection — touch a creature dead ≤ 200 years;
  // returns at full HP, closes all wounds, neutralizes poison,
  // cures magical contagions, lifts curses, replaces missing limbs
  // and organs. 1-hour cast. Consumes 25,000 gp of diamonds. RAW
  // also lifts any curses and restores undead to non-undead form
  // (pansori has no curse/undead-transformation state to clear).
  // No bedrest penalty.
  true_resurrection: {
    id: 'true_resurrection',
    name: 'True Resurrection',
    level: 9,
    castTime: 'action',
    materialCost: 25000,
    narratives: {
      cast: [
        "{name} crushes a king's ransom of diamonds and reweaves {target} from the soul outward{slotNote}",
        "{name} speaks {target}'s true name across the veil; the body answers, whole and breathing{slotNote}",
      ],
    },
    desc:
      'Touch a creature dead < 200 years. Returns at full HP; closes all wounds, neutralizes ' +
      'poison, lifts curses, replaces missing organs and limbs. Consumes 25,000 gp of diamonds.',
    rangeKind: 'touch',
    spellList: ['divine', 'primal'],
    revive: {
      hpRestored: 'full',
      windowRounds: 99999,
      materialCost: 25000,
    },
  },
  // SRD: Reincarnate — touch a dead Humanoid (or piece thereof)
  // dead ≤ 10 days; a new body forms and the soul enters. 1-hour
  // cast. Consumes 1000 gp of rare oils. RAW rolls 1d10 on the
  // species table to pick the new form (Dragonborn / Dwarf / Elf /
  // Gnome / Goliath / Halfling / Human / Orc / Tiefling).
  //
  // Pansori MVP: returns at full HP, KEEPS the original species —
  // the random species reroll requires species-trait revoke +
  // apply infrastructure (resistance lists, innate cantrips,
  // darkvision, breath weapon, species-resource flags) plus a UX
  // flow to surface the new form. Deferred behind a follow-up; in
  // the meantime, Reincarnate behaves as a Druid-list-only flavor
  // alternative to Raise Dead / Resurrection.
  reincarnate: {
    id: 'reincarnate',
    name: 'Reincarnate',
    level: 5,
    castTime: 'action',
    materialCost: 1000,
    narratives: {
      cast: [
        '{name} anoints {target} with rare oils and lets the green-pulse of the world re-knit the body{slotNote}',
        '{name} chants the long druidic rite over {target}; bone reforms, breath returns{slotNote}',
      ],
    },
    desc:
      'Touch a Humanoid dead < 10 days. Returns at full HP, reborn into a new species ' +
      'rolled uniformly from the SRD reincarnation table (Dragonborn / Dwarf / Elf / ' +
      'Gnome / Goliath / Halfling / Human / Orc / Tiefling). Consumes 1000 gp of rare oils.',
    rangeKind: 'touch',
    spellList: ['primal'],
    revive: {
      hpRestored: 'full',
      windowRounds: 99999,
      materialCost: 1000,
    },
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
    // 2024 PHB Cleric L3 — a 15-ft radius aura around the caster. Hostile
    // creatures in the area take 3d8 radiant (WIS save halves). Now a RE-4
    // caster-following persistent zone: the aura is centered on the caster and
    // recomputed from their cell each round (so it moves with them), ticking on
    // cast and on every round wrap until concentration ends. (`rangeKind: self`
    // signals the caster-centered placement in runZoneSpell.)
    persistentZone: true,
    damage: '3d8',
    damageType: 'radiant',
    savingThrow: 'wis',
    saveEffect: 'half',
    upcastBonus: '1d8',
    concentration: true,
    durationRounds: 100, // Concentration, up to 10 minutes
    blastRadius: 15,
    aoeShape: 'sphere',
    rangeKind: 'self',
    desc: 'Concentration, up to 10 minutes. Spirits surround you in a 15-ft radius that moves with you. Each round, hostiles in the area make a WIS save or take 3d8 radiant damage (half on success; +1d8 per slot above 3rd).',
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
  // SRD: Prayer of Healing — L2 Abjuration, 10-minute cast. Up to
  // 5 creatures within 30 ft regain 2d8 + casting mod HP each.
  // Upcast: +1d8 per slot above 2nd. RAW also grants short-rest
  // benefits + the 1/long-rest target gate; pansori MVP skips both
  // (short-rest plumbing isn't surfaced per-spell, and the gate
  // would need a per-PC "prayed-on this rest" flag — deferred).
  // Routes through the mass-heal path, same as mass_healing_word.
  prayer_of_healing: {
    id: 'prayer_of_healing',
    name: 'Prayer of Healing',
    level: 2,
    castTime: 'action',
    heal: '2d8',
    upcastBonus: '1d8',
    desc:
      'Up to 5 allies within 30 ft regain 2d8 + casting mod HP each. +1d8 per slot above 2nd. ' +
      '(RAW 10-minute cast + 1/long-rest gate + short-rest benefits deferred in pansori.)',
    rangeKind: 'ranged',
    rangeFt: 30,
    spellList: ['divine'],
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

  // ─── Damage spells (SRD save/AoE dispatch) ───────────────────────────
  blight: {
    id: 'blight',
    name: 'Blight',
    level: 4,
    castTime: 'action',
    damage: '8d8',
    damageType: 'necrotic',
    savingThrow: 'con',
    saveEffect: 'half',
    desc: 'A creature you can see within range makes a CON save, taking 8d8 necrotic damage on a failure or half on a success. (Plant-creature auto-fail and the withering of nonliving plants are not modeled.)',
    rangeKind: 'ranged',
    rangeFt: 30,
    spellList: ['arcane', 'primal'],
  },
  cloudkill: {
    id: 'cloudkill',
    name: 'Cloudkill',
    level: 5,
    castTime: 'action',
    damage: '5d8',
    damageType: 'poison',
    savingThrow: 'con',
    saveEffect: 'half',
    upcastBonus: '1d8',
    blastRadius: 20,
    aoeShape: 'sphere',
    concentration: true,
    durationRounds: 100,
    desc: 'A 20-ft-radius sphere of poisonous fog. Each creature inside makes a CON save, taking 5d8 poison damage on a failure or half on a success (+1d8 per slot above 5th). (The fog drifting away each round, and its heavy obscurement, are not modeled — damage resolves once on cast.)',
    rangeKind: 'ranged',
    rangeFt: 120,
    spellList: ['arcane'],
  },
  disintegrate: {
    id: 'disintegrate',
    name: 'Disintegrate',
    level: 6,
    castTime: 'action',
    damage: '10d6+40',
    damageType: 'force',
    savingThrow: 'dex',
    saveEffect: 'negates',
    desc: 'A green ray strikes a creature you can see. On a failed DEX save it takes 10d6 + 40 force damage; a creature reduced to 0 HP is disintegrated. On a success it takes none.',
    rangeKind: 'ranged',
    rangeFt: 60,
    spellList: ['arcane'],
  },
  finger_of_death: {
    id: 'finger_of_death',
    name: 'Finger of Death',
    level: 7,
    castTime: 'action',
    damage: '7d8+30',
    damageType: 'necrotic',
    savingThrow: 'con',
    saveEffect: 'half',
    desc: 'Negative energy lashes a creature you can see; it makes a CON save, taking 7d8 + 30 necrotic damage on a failure or half on a success. (A humanoid it kills rising as a zombie is not modeled.)',
    rangeKind: 'ranged',
    rangeFt: 60,
    spellList: ['arcane'],
  },
  harm: {
    id: 'harm',
    name: 'Harm',
    level: 6,
    castTime: 'action',
    damage: '14d6',
    damageType: 'necrotic',
    savingThrow: 'con',
    saveEffect: 'half',
    desc: 'Virulent magic floods a creature you can see; it makes a CON save, taking 14d6 necrotic damage on a failure or half on a success. (The accompanying Hit-Point-maximum reduction is not modeled.)',
    rangeKind: 'ranged',
    rangeFt: 60,
    spellList: ['divine'],
  },
  insect_plague: {
    id: 'insect_plague',
    name: 'Insect Plague',
    level: 5,
    castTime: 'action',
    damage: '4d10',
    damageType: 'piercing',
    savingThrow: 'con',
    saveEffect: 'half',
    upcastBonus: '1d10',
    blastRadius: 20,
    aoeShape: 'sphere',
    concentration: true,
    durationRounds: 100,
    desc: 'Swarming locusts fill a 20-ft-radius sphere. Each creature inside makes a CON save, taking 4d10 piercing damage on a failure or half on a success (+1d10 per slot above 5th). (The lingering difficult terrain / light obscurement and per-turn re-saves are not modeled — damage resolves once on cast.)',
    rangeKind: 'ranged',
    rangeFt: 300,
    spellList: ['divine', 'primal', 'arcane'],
  },
  flame_strike: {
    id: 'flame_strike',
    name: 'Flame Strike',
    level: 5,
    castTime: 'action',
    damage: '5d6',
    damageType: 'fire',
    damage2: '5d6',
    damageType2: 'radiant',
    upcastBonus: '1d6',
    upcastBonus2: '1d6',
    savingThrow: 'dex',
    saveEffect: 'half',
    blastRadius: 10,
    aoeShape: 'sphere',
    desc: 'A column of divine fire. Each creature in a 10-ft-radius makes a DEX save, taking 5d6 fire + 5d6 radiant on a failure or half on a success (both increase 1d6 per slot above 5th).',
    rangeKind: 'ranged',
    rangeFt: 60,
    spellList: ['divine'],
  },
  ice_storm: {
    id: 'ice_storm',
    name: 'Ice Storm',
    level: 4,
    castTime: 'action',
    damage: '2d10',
    damageType: 'bludgeoning',
    damage2: '4d6',
    damageType2: 'cold',
    savingThrow: 'dex',
    saveEffect: 'half',
    blastRadius: 20,
    aoeShape: 'sphere',
    desc: 'Hail pounds a 20-ft-radius. Each creature makes a DEX save, taking 2d10 bludgeoning + 4d6 cold on a failure or half on a success. (The lingering difficult terrain is not modeled.)',
    rangeKind: 'ranged',
    rangeFt: 300,
    spellList: ['primal', 'arcane'],
  },
  phantasmal_killer: {
    id: 'phantasmal_killer',
    name: 'Phantasmal Killer',
    level: 4,
    castTime: 'action',
    damage: '4d10',
    damageType: 'psychic',
    savingThrow: 'wis',
    saveEffect: 'half',
    condition: 'frightened',
    conditionDuration: 10,
    concentration: true,
    durationRounds: 10,
    desc: "An illusion of the target's deepest fear. It makes a WIS save, taking 4d10 psychic on a failure (and Disadvantage on ability checks and attack rolls for the duration, modeled as Frightened) or half on a success. (RAW the damage recurs on failed end-of-turn saves; pansori resolves it once on cast.)",
    rangeKind: 'ranged',
    rangeFt: 120,
    spellList: ['arcane'],
  },
  // SRD: Chain Lightning (L6) — a lightning bolt strikes one target (DEX save
  // for half of 10d8 lightning). RAW it arcs to up to three more creatures
  // within 30 ft of the first; the arcing isn't modeled — pansori resolves the
  // primary bolt.
  chain_lightning: {
    id: 'chain_lightning',
    name: 'Chain Lightning',
    level: 6,
    castTime: 'action',
    damage: '10d8',
    damageType: 'lightning',
    savingThrow: 'dex',
    saveEffect: 'half',
    desc: 'A lightning bolt leaps at a target (DEX save for half of 10d8 lightning). RAW it then arcs to up to three more creatures within 30 ft; pansori resolves the primary bolt only.',
    rangeKind: 'ranged',
    rangeFt: 150,
    spellList: ['arcane'],
  },
  // SRD: Circle of Death (L6) — negative energy in a 60-ft sphere; CON save for
  // half of 8d6 necrotic. (+2d8 per slot above 6th.)
  circle_of_death: {
    id: 'circle_of_death',
    name: 'Circle of Death',
    level: 6,
    castTime: 'action',
    damage: '8d6',
    damageType: 'necrotic',
    savingThrow: 'con',
    saveEffect: 'half',
    upcastBonus: '2d8',
    blastRadius: 60,
    aoeShape: 'sphere',
    desc: 'Negative energy ripples out in a 60-ft-radius sphere; each creature makes a CON save, taking 8d6 necrotic on a failure or half on a success (+2d8 per slot above 6th).',
    rangeKind: 'ranged',
    rangeFt: 150,
    spellList: ['arcane'],
  },
  // SRD: Eyebite (L6) — a creature within 60 ft makes a WIS save or is afflicted
  // for the duration (Concentration, up to 1 minute). RAW offers Asleep /
  // Panicked / Sickened; pansori models the Panicked (Frightened) effect. Pure
  // condition spell (no damage).
  eyebite: {
    id: 'eyebite',
    name: 'Eyebite',
    level: 6,
    castTime: 'action',
    savingThrow: 'wis',
    saveEffect: 'negates',
    condition: 'frightened',
    conditionDuration: 10,
    concentration: true,
    durationRounds: 10,
    desc: 'Your eyes become an inky void. A creature within 60 ft makes a WIS save or, on a failure, is Frightened of you for the duration (Concentration, up to 1 minute). RAW also offers Asleep and Sickened modes; pansori models the Panicked (Frightened) effect.',
    rangeKind: 'ranged',
    rangeFt: 60,
    spellList: ['arcane'],
  },
  // SRD: Fire Storm (L7) — up to ten contiguous 10-ft cubes of flame; DEX save
  // for half of 7d10 fire. Modeled as a single cube-shaped blast.
  fire_storm: {
    id: 'fire_storm',
    name: 'Fire Storm',
    level: 7,
    castTime: 'action',
    damage: '7d10',
    damageType: 'fire',
    savingThrow: 'dex',
    saveEffect: 'half',
    blastRadius: 20,
    aoeShape: 'cube',
    desc: 'A storm of fire fills the area; each creature makes a DEX save, taking 7d10 fire on a failure or half on a success.',
    rangeKind: 'ranged',
    rangeFt: 150,
    spellList: ['divine', 'primal', 'arcane'],
  },
  // SRD: Delayed Blast Fireball (L7) — a glowing bead detonates in a 20-ft
  // sphere; DEX save for half of 12d6 fire (+1d6 per slot above 7th). RAW the
  // bead can be delayed, gaining 1d6 per round; pansori detonates it on cast.
  delayed_blast_fireball: {
    id: 'delayed_blast_fireball',
    name: 'Delayed Blast Fireball',
    level: 7,
    castTime: 'action',
    damage: '12d6',
    damageType: 'fire',
    savingThrow: 'dex',
    saveEffect: 'half',
    upcastBonus: '1d6',
    blastRadius: 20,
    aoeShape: 'sphere',
    desc: 'A glowing bead detonates in a 20-ft-radius sphere; each creature makes a DEX save, taking 12d6 fire on a failure or half on a success (+1d6 per slot above 7th). RAW the bead can be held to gather 1d6 per round; pansori detonates it on cast.',
    rangeKind: 'ranged',
    rangeFt: 150,
    spellList: ['arcane'],
  },
  // SRD: Sunburst (L8) — brilliant light in a 60-ft sphere; CON save for half of
  // 12d6 radiant. RAW a failed save also inflicts Blinded (1 min, save ends);
  // the Blinded rider is deferred because pansori's AoE path resolves damage for
  // all targets but applies a condition only to a single target — keeping the
  // full-area damage is the better fidelity here. Also dispels magical Darkness.
  sunburst: {
    id: 'sunburst',
    name: 'Sunburst',
    level: 8,
    castTime: 'action',
    damage: '12d6',
    damageType: 'radiant',
    savingThrow: 'con',
    saveEffect: 'half',
    blastRadius: 60,
    aoeShape: 'sphere',
    desc: 'Brilliant sunlight flashes in a 60-ft-radius sphere (and dispels magical Darkness there); each creature makes a CON save, taking 12d6 radiant on a failure or half on a success. (RAW a failed save also Blinds for 1 minute; that rider is deferred so the full-area damage resolves.)',
    rangeKind: 'ranged',
    rangeFt: 150,
    spellList: ['divine', 'primal', 'arcane'],
  },
  // SRD: Meteor Swarm (L9) — blazing orbs at four points; each creature in a
  // 40-ft sphere makes a DEX save for half of 20d6 fire + 20d6 bludgeoning
  // (dual damage, like Flame Strike / Ice Storm). Modeled as one blast.
  meteor_swarm: {
    id: 'meteor_swarm',
    name: 'Meteor Swarm',
    level: 9,
    castTime: 'action',
    damage: '20d6',
    damageType: 'fire',
    damage2: '20d6',
    damageType2: 'bludgeoning',
    savingThrow: 'dex',
    saveEffect: 'half',
    blastRadius: 40,
    aoeShape: 'sphere',
    desc: 'Blazing orbs plummet from the sky; each creature in the area makes a DEX save, taking 20d6 fire and 20d6 bludgeoning on a failure or half on a success. (RAW four separate spheres; pansori resolves one blast.)',
    rangeKind: 'ranged',
    rangeFt: 1000,
    spellList: ['arcane'],
  },
  // SRD: Weird (L9) — illusory terrors in a 30-ft sphere; WIS save for half of
  // 10d10 psychic (Concentration, up to 1 minute). RAW a failed save also
  // inflicts Frightened (with recurring 5d10 psychic); that rider is deferred
  // for the same AoE-path reason as Sunburst, keeping the full-area damage.
  weird: {
    id: 'weird',
    name: 'Weird',
    level: 9,
    castTime: 'action',
    damage: '10d10',
    damageType: 'psychic',
    savingThrow: 'wis',
    saveEffect: 'half',
    concentration: true,
    durationRounds: 10,
    blastRadius: 30,
    aoeShape: 'sphere',
    desc: 'Illusory terrors assail each chosen creature in a 30-ft-radius sphere: WIS save for half of 10d10 psychic (Concentration, up to 1 minute). (RAW a failed save also Frightens, with recurring psychic damage; that rider is deferred so the full-area damage resolves.)',
    rangeKind: 'ranged',
    rangeFt: 120,
    spellList: ['arcane'],
  },

  // ─── Persistent damage zones (RE-4) ──────────────────────────────────
  // Stamp a SpellZone on cast that ticks each round wrap until concentration
  // ends (see castSpell/zone.ts + fireSpellZones). Movement (RAW repositioning)
  // is deferred — the zones are stationary for now.
  // SRD: Moonbeam (L2) — a 5-ft-radius cylinder of searing moonlight. A creature
  // in it makes a CON save for half of 2d10 radiant, each round it remains.
  moonbeam: {
    id: 'moonbeam',
    name: 'Moonbeam',
    level: 2,
    castTime: 'action',
    persistentZone: true,
    concentration: true,
    durationRounds: 10,
    damage: '2d10',
    damageType: 'radiant',
    savingThrow: 'con',
    saveEffect: 'half',
    upcastBonus: '1d10',
    blastRadius: 5,
    aoeShape: 'sphere',
    rangeKind: 'ranged',
    rangeFt: 120,
    desc: 'A 5-ft-radius beam of moonlight (Concentration, up to 1 minute). A creature in the beam makes a CON save, taking 2d10 radiant on a failure or half on a success, again each round it remains (+1d10 per slot above 2nd). RAW the beam can be moved 60 ft on later turns — repositioning is deferred, so pansori’s beam is stationary.',
    spellList: ['primal'],
  },
  // SRD: Flaming Sphere (L2) — a rolling ball of fire. Creatures within 5 ft of
  // it make a DEX save for half of 2d6 fire, each round it persists.
  flaming_sphere: {
    id: 'flaming_sphere',
    name: 'Flaming Sphere',
    level: 2,
    castTime: 'action',
    persistentZone: true,
    concentration: true,
    durationRounds: 10,
    damage: '2d6',
    damageType: 'fire',
    savingThrow: 'dex',
    saveEffect: 'half',
    upcastBonus: '1d6',
    blastRadius: 10,
    aoeShape: 'sphere',
    rangeKind: 'ranged',
    rangeFt: 60,
    desc: 'A 5-ft sphere of fire; creatures within 5 ft of it make a DEX save, taking 2d6 fire on a failure or half on a success, each round it persists (Concentration, up to 1 minute; +1d6 per slot above 2nd). RAW you can roll it 30 ft as a Bonus Action — movement is deferred, so the sphere is stationary.',
    spellList: ['primal', 'arcane'],
  },

  // ─── Defensive buffs ─────────────────────────────────────────────────
  stoneskin: {
    id: 'stoneskin',
    name: 'Stoneskin',
    level: 4,
    castTime: 'action',
    targetType: 'self_or_ally',
    grantResistances: ['bludgeoning', 'piercing', 'slashing'],
    concentration: true,
    durationRounds: 600,
    materialCost: 100,
    rangeKind: 'touch',
    desc: 'A willing creature you touch gains Resistance to bludgeoning, piercing, and slashing damage until the spell ends (Concentration). Consumes 100 gp of diamond dust.',
    narratives: {
      cast: [
        "{name}'s skin hardens like stone — {spell} turns aside blade and bludgeon",
        '{name} rubs diamond dust over {target}; their flesh takes on a granite sheen',
      ],
    },
    spellList: ['primal', 'arcane'],
  },
  false_life: {
    id: 'false_life',
    name: 'False Life',
    level: 1,
    castTime: 'action',
    targetType: 'self',
    // RAW 2d4 + 4; pansori grants a fixed value at the average (the buff path
    // takes a number, not a dice roll). The +5/slot upcast isn't modeled.
    tempHpGrant: 9,
    rangeKind: 'self',
    desc: 'A necromantic glimmer of life wards you, granting temporary Hit Points (RAW 2d4 + 4; pansori grants a fixed 9).',
    narratives: {
      cast: [
        '{name} siphons a flicker of unlife — a grey aura hardens into temporary vigor',
        '{name} whispers {spell}; a cold resilience settles over them',
      ],
    },
    spellList: ['arcane'],
  },

  // ─── Utility / ritual spells (narrative) ─────────────────────────────
  alarm: {
    id: 'alarm',
    name: 'Alarm',
    level: 1,
    castTime: 'action',
    ritualCasting: true,
    rangeKind: 'self',
    desc: 'You ward an area for 8 hours; an audible or mental alarm alerts you whenever a creature you did not designate touches or enters it.',
    narrative:
      '{name} sets a subtle ward — the air hums faintly, ready to cry out at any intruder.',
    spellList: ['primal', 'arcane'],
  },
  unseen_servant: {
    id: 'unseen_servant',
    name: 'Unseen Servant',
    level: 1,
    castTime: 'action',
    ritualCasting: true,
    rangeKind: 'self',
    desc: 'You conjure an invisible, mindless force that fetches, carries, and performs simple chores at your command until the spell ends.',
    narrative:
      '{name} conjures an invisible helper — unseen hands take up the work without a word.',
    spellList: ['arcane'],
  },
  rope_trick: {
    id: 'rope_trick',
    name: 'Rope Trick',
    level: 2,
    castTime: 'action',
    rangeKind: 'touch',
    desc: 'A length of rope rises and vanishes into an extradimensional space that hides up to eight creatures for 1 hour; the rope can be pulled up out of reach.',
    narrative:
      '{name} touches a rope — it stiffens skyward and its end disappears into a hidden pocket of space.',
    spellList: ['arcane'],
  },
  water_breathing: {
    id: 'water_breathing',
    name: 'Water Breathing',
    level: 3,
    castTime: 'action',
    ritualCasting: true,
    rangeKind: 'self',
    desc: 'Up to ten willing creatures gain the ability to breathe underwater until the spell ends.',
    narrative: '{name} murmurs over the water; gills shimmer at the throats of the willing.',
    spellList: ['primal', 'arcane'],
  },
  water_walk: {
    id: 'water_walk',
    name: 'Water Walk',
    level: 3,
    castTime: 'action',
    ritualCasting: true,
    rangeKind: 'self',
    desc: 'Up to ten willing creatures can move across any liquid surface — water, lava, mud — as though it were solid ground, until the spell ends.',
    narrative: '{name} blesses the party’s steps; the water’s surface firms beneath their feet.',
    spellList: ['divine', 'primal', 'arcane'],
  },
  arcane_lock: {
    id: 'arcane_lock',
    name: 'Arcane Lock',
    level: 2,
    castTime: 'action',
    rangeKind: 'touch',
    desc: 'You seal a door, gate, window, or container so it cannot be opened until the spell is dispelled. You set a password that bypasses the lock.',
    narrative: '{name} traces a sigil across the seam — it fuses shut with a soft click of magic.',
    spellList: ['arcane'],
  },
  silence: {
    id: 'silence',
    name: 'Silence',
    level: 2,
    castTime: 'action',
    ritualCasting: true,
    rangeKind: 'ranged',
    rangeFt: 120,
    desc: 'A 20-ft-radius sphere where no sound arises or passes through — thunder is muffled and spells with verbal components cannot be cast inside it. (The area suppression is not modeled in combat.)',
    narrative: '{name} calls down a bubble of utter quiet — the world within goes mute.',
    spellList: ['arcane', 'divine', 'primal'],
  },
  nondetection: {
    id: 'nondetection',
    name: 'Nondetection',
    level: 3,
    castTime: 'action',
    rangeKind: 'touch',
    desc: 'For 8 hours you hide a creature, place, or object from divination magic, magical scrying sensors, and spells that detect or locate.',
    narrative: '{name} veils the target from prying magic — to divination, it simply isn’t there.',
    spellList: ['arcane', 'primal'],
  },
  magic_mouth: {
    id: 'magic_mouth',
    name: 'Magic Mouth',
    level: 2,
    castTime: 'action',
    ritualCasting: true,
    rangeKind: 'self',
    desc: 'You implant a spoken message of up to 25 words into an object; it plays back when a trigger condition you specify occurs.',
    narrative: '{name} whispers into the object — the words settle in, waiting for their cue.',
    spellList: ['arcane'],
  },
  phantom_steed: {
    id: 'phantom_steed',
    name: 'Phantom Steed',
    level: 3,
    castTime: 'action',
    ritualCasting: true,
    rangeKind: 'self',
    desc: 'You conjure a quasi-real, horse-like steed that serves as a tireless mount for up to 1 hour, carrying its rider at a steady, swift pace.',
    narrative: '{name} calls up a steed of grey mist — it stamps once, solid enough to ride.',
    spellList: ['arcane'],
  },
  find_traps: {
    id: 'find_traps',
    name: 'Find Traps',
    level: 2,
    castTime: 'action',
    rangeKind: 'self',
    desc: 'You sense whether a trap is present within range and learn its general nature — but not its precise location or how to disarm it.',
    narrative: '{name} extends their senses; a prickle of warning marks unseen danger nearby.',
    spellList: ['divine', 'primal'],
  },
  locate_creature: {
    id: 'locate_creature',
    name: 'Locate Creature',
    level: 4,
    castTime: 'action',
    concentration: true,
    durationRounds: 600,
    rangeKind: 'self',
    desc: 'For up to 1 hour you sense the direction to a creature familiar to you, or to the nearest creature of a kind you name, while it is within range.',
    narrative:
      '{name} fixes the quarry in their mind — a pull, like a compass needle, points the way.',
    spellList: ['arcane', 'divine', 'primal'],
  },
  commune: {
    id: 'commune',
    name: 'Commune',
    level: 5,
    castTime: 'action',
    ritualCasting: true,
    rangeKind: 'self',
    desc: 'You contact your deity or a divine proxy and ask up to three yes-or-no questions, receiving truthful one-word answers.',
    narrative: '{name} kneels in prayer; a presence answers, brief and certain.',
    spellList: ['divine'],
  },
  divination: {
    id: 'divination',
    name: 'Divination',
    level: 4,
    castTime: 'action',
    ritualCasting: true,
    rangeKind: 'self',
    desc: 'Through a ritual offering you glean a truthful reply about a single goal, event, or hazard expected to occur within the next seven days.',
    narrative: '{name} reads the omens — the answer surfaces, clouded but true.',
    spellList: ['arcane', 'divine', 'primal'],
  },
  scrying: {
    id: 'scrying',
    name: 'Scrying',
    level: 5,
    castTime: 'action',
    concentration: true,
    durationRounds: 100,
    rangeKind: 'self',
    desc: 'You can see and hear a chosen creature through an invisible sensor, if it fails a Wisdom save. (The remote-sensing link is not modeled mechanically.)',
    narrative: '{name} gazes into a focus — a distant scene swims into view.',
    spellList: ['arcane', 'divine', 'primal'],
  },
  locate_animals_or_plants: {
    id: 'locate_animals_or_plants',
    name: 'Locate Animals or Plants',
    level: 2,
    castTime: 'action',
    ritualCasting: true,
    rangeKind: 'self',
    desc: 'You name a specific kind of beast or plant and sense the direction and distance to the nearest one within range.',
    narrative:
      '{name} attunes to the wild — the nearest of its kind reveals itself to their senses.',
    spellList: ['arcane', 'primal'],
  },
  // SRD: Fog Cloud (L1) — a 20-ft-radius sphere of fog that Heavily Obscures
  // its area (Concentration, up to 1 hour). The area-obscurement isn't applied
  // mechanically (pansori models obscurement at room scope); narrative.
  fog_cloud: {
    id: 'fog_cloud',
    name: 'Fog Cloud',
    level: 1,
    castTime: 'action',
    concentration: true,
    durationRounds: 600,
    rangeKind: 'ranged',
    rangeFt: 120,
    desc: 'A 20-ft-radius sphere of fog spreads around a point in range, Heavily Obscuring its area (Concentration, up to 1 hour). A wind disperses it.',
    narrative: '{name} breathes out a roiling bank of fog that swallows the area from sight.',
    spellList: ['primal', 'arcane'],
  },
  // SRD: Jump (L1) — a touched creature's jump distance triples for the
  // duration. The grid jump action isn't buffed mechanically; narrative.
  jump: {
    id: 'jump',
    name: 'Jump',
    level: 1,
    castTime: 'bonus_action',
    rangeKind: 'touch',
    desc: 'A willing creature you touch has its jump distance tripled for 1 minute.',
    narrative: '{name} touches the leaper — their legs coil with sudden spring.',
    spellList: ['primal', 'arcane'],
  },
  // SRD: Expeditious Retreat (L1) — lets you Dash as a Bonus Action each turn
  // (Concentration, up to 10 minutes). The recurring Dash isn't wired; narrative.
  expeditious_retreat: {
    id: 'expeditious_retreat',
    name: 'Expeditious Retreat',
    level: 1,
    castTime: 'bonus_action',
    concentration: true,
    durationRounds: 100,
    rangeKind: 'self',
    desc: 'You move with unnatural speed: take the Dash action as a Bonus Action this turn and on each of your turns until the spell ends (Concentration, up to 10 minutes).',
    narrative: '{name} blurs into motion, fleet-footed beyond reason.',
    spellList: ['arcane'],
  },
  // SRD: Spider Climb (L2) — a touched creature can climb walls and ceilings,
  // hands free, gaining a Climb Speed (Concentration, up to 1 hour). The climb
  // speed isn't granted as a movement mode mechanically; narrative.
  spider_climb: {
    id: 'spider_climb',
    name: 'Spider Climb',
    level: 2,
    castTime: 'action',
    concentration: true,
    durationRounds: 600,
    rangeKind: 'touch',
    desc: 'A willing creature you touch can move up, down, and across vertical surfaces and ceilings while leaving its hands free, gaining a Climb Speed equal to its Speed (Concentration, up to 1 hour).',
    narrative: "{name}'s touch lets the climber cling to sheer stone like a spider.",
    spellList: ['arcane'],
  },
  // SRD: Darkvision (L2) — grants a willing creature Darkvision (150 ft) for
  // 8 hours. Lighting is room-grained in pansori; narrative.
  darkvision: {
    id: 'darkvision',
    name: 'Darkvision',
    level: 2,
    castTime: 'action',
    rangeKind: 'touch',
    desc: 'A willing creature you touch gains Darkvision out to 150 feet for 8 hours.',
    narrative: "{name} anoints the creature's eyes — the dark resolves into shades of grey.",
    spellList: ['primal', 'arcane'],
  },
  // SRD: Gaseous Form (L3) — a willing creature becomes a misty cloud that can
  // seep through small gaps and gains a Fly Speed (Concentration, up to 1 hour).
  // The form's movement/defenses aren't modeled; narrative.
  gaseous_form: {
    id: 'gaseous_form',
    name: 'Gaseous Form',
    level: 3,
    castTime: 'action',
    concentration: true,
    durationRounds: 600,
    rangeKind: 'touch',
    desc: 'A willing creature you touch (and its gear) becomes a misty cloud that can pass through narrow gaps and has a Fly Speed of 10 ft, with Resistance to nonmagical damage (Concentration, up to 1 hour). It cannot attack or cast spells while gaseous.',
    narrative: '{name} dissolves the target into a drifting bank of mist.',
    spellList: ['arcane'],
  },
  // SRD: Clairvoyance (L3) — an invisible sensor at a known/visible location
  // lets you see or hear there (Concentration, up to 10 minutes). The remote
  // sensor isn't modeled mechanically; narrative.
  clairvoyance: {
    id: 'clairvoyance',
    name: 'Clairvoyance',
    level: 3,
    castTime: 'action',
    concentration: true,
    durationRounds: 100,
    rangeKind: 'self',
    desc: 'You create an invisible sensor at a location you can picture or have seen, perceiving sight or sound there as if present (Concentration, up to 10 minutes). The remote-sensing link is not modeled mechanically.',
    narrative: '{name} casts their senses outward — a distant place opens to sight and sound.',
    spellList: ['arcane', 'divine'],
  },
  // SRD: Create Food and Water (L3) — conjures a day's food and water for up to
  // ten people (or feed for mounts). Provisioning is narrative in pansori.
  create_food_and_water: {
    id: 'create_food_and_water',
    name: 'Create Food and Water',
    level: 3,
    castTime: 'action',
    rangeKind: 'ranged',
    rangeFt: 30,
    desc: 'You conjure 45 pounds of food and 30 gallons of water on the ground or in containers within range — enough to sustain up to ten people (or three mounts) for 24 hours.',
    narrative: '{name} calls forth a spread of plain food and clean water from the air.',
    spellList: ['divine'],
  },
  // SRD: Silent Image (L1) — a purely visual, moving illusion up to a 15-ft
  // cube within 60 ft (Concentration). A creature that Studies it disbelieves
  // with an Investigation check vs your save DC.
  silent_image: {
    id: 'silent_image',
    name: 'Silent Image',
    level: 1,
    castTime: 'action',
    concentration: true,
    durationRounds: 100,
    rangeKind: 'ranged',
    rangeFt: 60,
    desc: 'Create a silent, moving visual illusion no larger than a 15-ft cube within range (Concentration, up to 10 minutes). A creature that studies it may disbelieve with an Investigation check vs your spell save DC.',
    narrative: '{name} sculpts light into a convincing phantom image.',
    spellList: ['arcane'],
  },
  // SRD: Create or Destroy Water (L1) — conjure up to 10 gallons of water (or
  // a fog bank) in range, or destroy that much. Utility.
  create_or_destroy_water: {
    id: 'create_or_destroy_water',
    name: 'Create or Destroy Water',
    level: 1,
    castTime: 'action',
    rangeKind: 'ranged',
    rangeFt: 30,
    desc: 'Create up to 10 gallons of clean water (or a fog bank) in an open container or space within range, or destroy that much water or fog.',
    narrative: '{name} calls water out of the air — or banishes it just as fast.',
    spellList: ['divine', 'primal'],
  },
  // SRD: Purify Food and Drink (L1, ritual) — rid food and drink in a 5-ft
  // sphere of poison and spoilage. Utility.
  purify_food_and_drink: {
    id: 'purify_food_and_drink',
    name: 'Purify Food and Drink',
    level: 1,
    castTime: 'action',
    ritualCasting: true,
    rangeKind: 'ranged',
    rangeFt: 10,
    desc: 'All nonmagical food and drink within a 5-ft-radius sphere is purified and rendered free of poison and disease (also castable as a ritual).',
    narrative: '{name} blesses the provisions — taint and rot melt away.',
    spellList: ['divine', 'primal'],
  },
  // SRD: See Invisibility (L2) — for 1 hour you see Invisible creatures/objects
  // and into the Ethereal Plane. pansori has no see-Invisible substrate yet, so
  // the reveal is narrated.
  see_invisibility: {
    id: 'see_invisibility',
    name: 'See Invisibility',
    level: 2,
    castTime: 'action',
    rangeKind: 'self',
    desc: 'For 1 hour you can see Invisible creatures and objects (and into the Ethereal Plane) as if they were visible. The reveal is narrated, not modeled mechanically.',
    narrative: '{name} blinks, and the unseen swims into focus.',
    spellList: ['arcane'],
  },
  // SRD: Zone of Truth (L2) — creatures in a 15-ft sphere that fail a CHA save
  // cannot knowingly lie for 10 minutes. The social effect is narrated.
  zone_of_truth: {
    id: 'zone_of_truth',
    name: 'Zone of Truth',
    level: 2,
    castTime: 'action',
    rangeKind: 'ranged',
    rangeFt: 60,
    desc: 'Create a 15-ft-radius zone for 10 minutes; a creature in it that fails a Charisma save cannot speak a deliberate lie while there (it knows it is affected). The social effect is narrated.',
    narrative: '{name} sanctifies the area — within it, falsehood catches in the throat.',
    spellList: ['arcane', 'divine'],
  },
  // SRD: Alter Self (L2) — change your appearance, gain aquatic adaptation, or
  // grow natural weapons (Concentration, up to 1 hour). Cosmetic/utility.
  alter_self: {
    id: 'alter_self',
    name: 'Alter Self',
    level: 2,
    castTime: 'action',
    concentration: true,
    durationRounds: 600,
    rangeKind: 'self',
    desc: 'You transform your own form (Concentration, up to 1 hour): change your appearance, adapt to breathe water and swim, or grow natural weapons. The cosmetic/utility effects are narrated.',
    narrative: '{name} reshapes their own flesh at will.',
    spellList: ['arcane'],
  },
  // SRD: Arcane Eye (L4) — an invisible flying sensor you see through and move
  // 30 ft each turn (Concentration, up to 1 hour). Scouting; narrated.
  arcane_eye: {
    id: 'arcane_eye',
    name: 'Arcane Eye',
    level: 4,
    castTime: 'action',
    concentration: true,
    durationRounds: 600,
    rangeKind: 'self',
    desc: 'You create an invisible, flying magical eye that you can see through and move up to 30 ft on each of your turns (Concentration, up to 1 hour). The remote scouting is narrated.',
    narrative: '{name} conjures an unseen eye and sends it drifting ahead.',
    spellList: ['arcane'],
  },
  // SRD: Stone Shape (L4) — reshape a Medium-or-smaller section of stone you
  // touch into any form (a door, a weapon, crude features). Utility.
  stone_shape: {
    id: 'stone_shape',
    name: 'Stone Shape',
    level: 4,
    castTime: 'action',
    rangeKind: 'touch',
    desc: 'You reshape a section of stone you touch (up to a 5-ft cube) into any form you like — a door, a weapon, or a passage with crude features.',
    narrative: '{name} presses a hand to the stone and it flows like clay.',
    spellList: ['divine', 'primal', 'arcane'],
  },
};
