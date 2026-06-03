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
  // ─── Spell batch: walls, a poison ray, energy ward, a corpse ritual ─────────
  // SRD: Blade Barrier — a wall of whirling force. Modeled as the initial-area
  // DEX save-for-half damage (the persistent cover / difficult-terrain wall and
  // its per-turn re-save on entry are not modeled — like our other walls).
  blade_barrier: {
    id: 'blade_barrier',
    name: 'Blade Barrier',
    level: 6,
    castTime: 'action',
    concentration: true,
    durationRounds: 100, // 10 minutes
    damage: '6d10',
    damageType: 'force',
    savingThrow: 'dex',
    saveEffect: 'half',
    blastRadius: 100, // a 100-ft wall
    aoeShape: 'line',
    rangeKind: 'ranged',
    rangeFt: 90,
    desc: 'A wall of spinning force blades. Each creature in the line makes a DEX save, taking 6d10 force on a failure or half on a success. Concentration.',
    narratives: {
      cast: [
        '{name} carves the air into a curtain of whirling blades{slotNote}',
        '{name} speaks a war-word and a wall of razor light springs up',
      ],
    },
    spellList: ['divine'],
  },
  // SRD: Wind Wall — a wall of strong wind. Modeled as the initial-area STR
  // save-for-half damage (the projectile-deflection and gas-barring effects are
  // narrative, not modeled).
  wind_wall: {
    id: 'wind_wall',
    name: 'Wind Wall',
    level: 3,
    castTime: 'action',
    concentration: true,
    durationRounds: 10, // 1 minute
    damage: '4d8',
    damageType: 'bludgeoning',
    savingThrow: 'str',
    saveEffect: 'half',
    blastRadius: 50, // a 50-ft wall
    aoeShape: 'line',
    rangeKind: 'ranged',
    rangeFt: 120,
    desc: 'A wall of roaring wind rises from the ground. Each creature in the area makes a STR save, taking 4d8 bludgeoning on a failure or half on a success. Concentration.',
    narratives: {
      cast: [
        '{name} sweeps a hand upward and a howling wall of wind erupts{slotNote}',
        '{name} whistles a rising note; the air hardens into a gale',
      ],
    },
    spellList: ['primal'],
  },
  // SRD: Ray of Sickness — a greenish ray of poison. Ranged spell attack;
  // on a hit, 2d8 poison and Poisoned until the end of your next turn.
  ray_of_sickness: {
    id: 'ray_of_sickness',
    name: 'Ray of Sickness',
    level: 1,
    castTime: 'action',
    attackRoll: true,
    damage: '2d8',
    damageType: 'poison',
    upcastBonus: '1d8',
    condition: 'poisoned',
    conditionDuration: 1, // until the end of your next turn ≈ 1 round
    rangeKind: 'ranged',
    rangeFt: 60,
    desc: 'A ray of sickly green light. Spell attack roll; on a hit, 2d8 poison (+1d8 per slot above 1st) and the target is Poisoned until the end of your next turn.',
    narratives: {
      cast: [
        '{name} flings a sickly green ray at {target}{slotNote}',
        '{name} points, and a ray of nauseating light lances toward {target}',
      ],
    },
    spellList: ['arcane'],
  },
  // SRD: Protection from Energy — Resistance to one chosen damage type (Acid,
  // Cold, Fire, Lightning, or Thunder) for the duration. The element is picked
  // at cast time; defaults to Fire when unspecified.
  protection_from_energy: {
    id: 'protection_from_energy',
    name: 'Protection from Energy',
    level: 3,
    castTime: 'action',
    targetType: 'self_or_ally',
    grantResistances: ['fire'],
    concentration: true,
    durationRounds: 600, // 1 hour
    rangeKind: 'touch',
    desc: 'A willing creature you touch gains Resistance to one damage type of your choice — Acid, Cold, Fire, Lightning, or Thunder — until the spell ends (Concentration).',
    narratives: {
      cast: [
        '{name} traces a warding sigil over {target}; the chosen element will slough away{slotNote}',
        '{name} lays a hand on {target} — a shimmer of protection settles over their skin',
      ],
    },
    spellList: ['arcane', 'primal', 'divine'],
  },
  // SRD: Gentle Repose — preserves a corpse from decay and prevents it rising as
  // Undead, and extends the window for raise-from-death spells. Narrative-only
  // ritual in pansori (the multi-day raise window isn't tracked).
  gentle_repose: {
    id: 'gentle_repose',
    name: 'Gentle Repose',
    level: 2,
    castTime: 'action',
    ritualCasting: true,
    rangeKind: 'ranged',
    rangeFt: 5,
    desc: 'You touch a corpse: for 10 days it is protected from decay and cannot become Undead, and the time limit on raising it from the dead is effectively extended.',
    narrative:
      '{name} rests two coins on the body and murmurs a rite of stillness; the remains will not turn or rot.',
    spellList: ['divine', 'arcane'],
  },

  // ─── Spell batch: control & debuff (Sleet Storm, Heat Metal, Bestow Curse) ──
  // SRD: Sleet Storm — freezing sleet fills a 20-ft-radius area; creatures in it
  // make a DEX save or fall Prone. Modeled as the initial knockdown burst (the
  // lingering difficult terrain / heavy obscurement / dousing flames and the
  // spell's Concentration are not modeled).
  sleet_storm: {
    id: 'sleet_storm',
    name: 'Sleet Storm',
    level: 3,
    castTime: 'action',
    savingThrow: 'dex',
    saveEffect: 'negates',
    condition: 'prone',
    conditionDuration: 1,
    aoeCondition: true,
    blastRadius: 20,
    aoeShape: 'sphere',
    rangeKind: 'ranged',
    rangeFt: 150,
    desc: 'Freezing sleet lashes a 20-ft-radius area. Each creature in it makes a DEX save or is knocked Prone. (The lingering difficult terrain, obscurement, and Concentration are not modeled — pansori applies the initial knockdown.)',
    narratives: {
      cast: [
        '{name} calls down a stinging curtain of sleet over the area',
        '{name} sweeps a hand and freezing rain hammers the ground to ice',
      ],
    },
    spellList: ['primal', 'arcane'],
  },
  // SRD: Heat Metal — a metal weapon or piece of armor glows red-hot. The
  // target takes 2d8 fire damage (no save reduces it) and, on a failed CON
  // save, attacks at Disadvantage until the start of your next turn. (The
  // metal-object requirement + the sustained bonus-action re-damage are not
  // modeled — a single searing burst.)
  heat_metal: {
    id: 'heat_metal',
    name: 'Heat Metal',
    level: 2,
    castTime: 'action',
    damage: '2d8',
    damageType: 'fire',
    upcastBonus: '1d8',
    savingThrow: 'con',
    damageIgnoresSave: true,
    condition: 'heat_seared',
    conditionDuration: 1,
    rangeKind: 'ranged',
    rangeFt: 60,
    desc: 'Metal a creature wears or wields glows red-hot: 2d8 fire damage (+1d8 per slot above 2nd), which no save reduces, and on a failed CON save the creature attacks at Disadvantage until the start of your next turn.',
    narratives: {
      cast: [
        "{name} points at {target}'s gear and the metal flares searing red",
        '{name} speaks a word of heat — {target}’s armor begins to smoke',
      ],
    },
    spellList: ['arcane', 'primal'],
  },
  // SRD: Bestow Curse — touch a creature; on a failed WIS save it is Cursed for
  // the duration. RAW offers a choice of curse effects; pansori applies one
  // hindering curse — the cursed creature attacks at Disadvantage (Concentration).
  bestow_curse: {
    id: 'bestow_curse',
    name: 'Bestow Curse',
    level: 3,
    castTime: 'action',
    savingThrow: 'wis',
    saveEffect: 'negates',
    condition: 'cursed',
    concentration: true,
    durationRounds: 10,
    rangeKind: 'touch',
    desc: 'You touch a creature: it makes a WIS save or is Cursed for the duration, attacking at Disadvantage (Concentration, up to 1 minute). RAW lets the caster pick from several curse effects; pansori applies this one hindering curse.',
    narratives: {
      cast: [
        '{name} lays a hand on {target} and speaks a word of ruin',
        '{name} marks {target} with a curse that drags at every strike',
      ],
    },
    spellList: ['arcane', 'divine'],
  },

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
  // SRD: Sorcerous Burst — a Sorcerer cantrip. Ranged spell attack; 1d8 of a
  // chosen type (scales to 4d8). Each d8 that rolls an 8 explodes into another
  // d8, up to spellcasting-mod added dice (rollSorcerousBurst). The damage-type
  // choice is not modeled (cast as fire), like Chromatic Orb.
  sorcerous_burst: {
    id: 'sorcerous_burst',
    name: 'Sorcerous Burst',
    level: 0,
    castTime: 'action',
    damage: '1d8',
    damageType: 'fire',
    attackRoll: true,
    upcastBonus: '1d8',
    desc: 'Spell attack roll: 1d8 damage (your choice of Acid, Cold, Fire, Lightning, Poison, Psychic, or Thunder; cast as fire here — chosen-type picker deferred). Each 8 rolled explodes into another d8, up to your spellcasting modifier in added dice. Scales to 2d8/3d8/4d8 at levels 5/11/17.',
    narratives: {
      cast: [
        '{name} flings a crackling mote of raw sorcery at {target}',
        "{name}'s bloodline flares — a burst of wild magic lances toward {target}",
      ],
    },
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
  // SRD: Light — touch an object; it sheds Bright Light 20 ft + Dim Light 20 ft
  // for 1 hour. In pansori the caster becomes the light source (their grid
  // entity gets `light_radius_ft: 20`); in a dark room that illuminated area
  // lets creatures be SEEN, negating the darkness blind-combat penalty. See the
  // Light/Daylight branch in castSpell/utility.ts + `isIlluminated`.
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
  // SRD: Find Familiar (L1 Conjuration, Wizard) — a 1-hour ritual (10 GP incense
  // consumed) that conjures a CR-0 spirit companion. RAW the familiar acts on its
  // own turn and CAN'T take the Attack action. Rides the summon path with
  // `noAttack: true`: it materializes as a non-combatant ally that takes the Help
  // action each turn (granting its owner Advantage via `help_target_id`). Choose
  // a form (Owl / Cat / Raven) — all mechanically identical (CR 0). The telepathy,
  // see-through-its-eyes, and touch-spell delivery are narrated.
  find_familiar: {
    id: 'find_familiar',
    name: 'Find Familiar',
    level: 1,
    castTime: 'action',
    ritualCasting: true,
    outOfCombatOnly: true, // RAW 1-hour / ritual cast
    materialCost: 10, // 10 GP incense, consumed
    rangeKind: 'ranged',
    rangeFt: 10,
    summon: {
      name: 'Owl',
      ac: 11,
      maxHp: 1,
      toHit: 0,
      damage: '0',
      noAttack: true,
      variants: [
        { name: 'Cat', ac: 11, maxHp: 1, toHit: 0, damage: '0' },
        { name: 'Raven', ac: 11, maxHp: 1, toHit: 0, damage: '0' },
      ],
    },
    desc: 'A ritual that binds a spirit familiar (Owl, Cat, or Raven) to your service. It fights at your side but can’t attack — instead it takes the Help action each turn, granting you Advantage on your next attack. (Telepathy, seeing through its eyes, and delivering your touch spells are narrated.)',
    narrative: '{name} burns the incense and a faithful spirit familiar coalesces at their side.',
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
      'Touch: remove one effect — end Charmed or Petrified, reduce exhaustion by 1, ' +
      'or restore a drained Hit Point maximum (Life Drain). Consumes 100 gp of diamond ' +
      "dust. (RAW curse / ability-score reduction removal deferred — pansori doesn't model those.)",
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
  // SRD: Power Word Stun (L8 Enchantment, Bard/Sorcerer/Warlock/Wizard) — V only.
  // No save or attack on cast: a target with ≤150 HP is Stunned (CON save at the
  // end of each of its turns ends it); a tougher target's Speed drops to 0 until
  // your next turn. Resolved by `runPowerWordStun` (dispatcher interception); the
  // Stun rides the generic save-ends hook (`save_ends`). The >150-HP Speed-0
  // branch is narrated (no per-enemy speed-0-until-X primitive).
  power_word_stun: {
    id: 'power_word_stun',
    name: 'Power Word Stun',
    level: 8,
    castTime: 'action',
    rangeKind: 'ranged',
    rangeFt: 60,
    verbal: true,
    somatic: false,
    desc: 'You hurl a word of power at one creature you can see within 60 ft. If it has 150 HP or fewer it is Stunned (CON save at the end of each of its turns to recover); otherwise its Speed is 0 until your next turn.',
    narratives: {
      cast: [
        '{name} hurls a word of power at {target}',
        "{name} speaks a syllable that slams into {target}'s mind",
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
    // SRD: 15-ft cube from the caster — CON save for half; on a failed save the
    // creature also takes the full 2d8 and is pushed 10 ft away from the caster.
    blastRadius: 15,
    aoeShape: 'cube',
    pushFt: 10,
    desc: 'A 15-ft cube of thunderous force erupts from you. Each creature makes a CON save — 2d8 thunder (half on a success); on a failure it is also pushed 10 ft away.',
    rangeKind: 'self',
    // Bard / Druid / Sorcerer / Wizard (2024 PHB).
    spellList: ['arcane', 'primal'],
  },
  gust_of_wind: {
    id: 'gust_of_wind',
    name: 'Gust of Wind',
    level: 2,
    castTime: 'action',
    concentration: true,
    // SRD: a 60-ft line, 10 ft wide. Each creature in the line makes a STR save
    // or is pushed 15 ft away from the caster. pansori models the on-cast push;
    // the per-turn re-push for creatures ending their turn in the line and the
    // "2 ft per 1 ft toward you" movement tax are deferred.
    savingThrow: 'str',
    saveEffect: 'negates',
    blastRadius: 60,
    aoeShape: 'line',
    pushFt: 15,
    desc: 'A 60-ft line of strong wind blasts from you. Each creature in the line makes a STR save or is pushed 15 ft away (Concentration, up to 1 min).',
    rangeKind: 'self',
    // Druid / Ranger / Sorcerer / Wizard (2024 PHB).
    spellList: ['primal', 'arcane'],
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
  // SRD: Divine Favor (L1 Transmutation, Paladin) — Bonus Action, Self, 1 minute
  // (NOT concentration in 2024). A persistent per-attack weapon rider: every
  // weapon hit deals +1d4 Radiant for the duration. Modeled via
  // `Character.weapon_rider` (set by the buff path); cleared at combat end.
  divine_favor: {
    id: 'divine_favor',
    name: 'Divine Favor',
    level: 1,
    castTime: 'bonus_action',
    targetType: 'self',
    rangeKind: 'self',
    weaponRider: { dice: '1d4', damageType: 'radiant', persistent: true },
    desc: 'Bonus action. For 1 minute, your weapon attacks each deal an extra 1d4 radiant damage on a hit.',
    narrative: '{name} channels divine radiance into their weapon.',
    spellList: ['divine'],
  },
  // SRD: Searing Smite (L1 Evocation, Paladin) — Bonus Action, Self, 1 minute
  // (not concentration). Arms the next melee hit for +1d6 Fire. The ongoing
  // start-of-turn 1d6 fire + CON save-ends is deferred (pansori models the
  // on-hit burst); the strike is consumed on the next melee hit.
  searing_smite: {
    id: 'searing_smite',
    name: 'Searing Smite',
    level: 1,
    castTime: 'bonus_action',
    targetType: 'self',
    rangeKind: 'self',
    weaponRider: { dice: '1d6', damageType: 'fire' },
    desc: 'Bonus action. Your next melee weapon hit deals an extra 1d6 fire damage. (The lingering per-turn fire is narrated.)',
    narrative: "{name}'s weapon kindles with searing flame.",
    spellList: ['divine'],
  },
  // SRD: Shining Smite (L2 Transmutation, Paladin) — Bonus Action, Self,
  // Concentration up to 1 minute. Arms the next melee hit for +2d6 Radiant and
  // wreathes the target in light: attack rolls against it have Advantage
  // (modeled via the existing `faerie_fired` primitive, capped at ~1 minute).
  shining_smite: {
    id: 'shining_smite',
    name: 'Shining Smite',
    level: 2,
    castTime: 'bonus_action',
    targetType: 'self',
    rangeKind: 'self',
    concentration: true,
    durationRounds: 10,
    weaponRider: { dice: '2d6', damageType: 'radiant', appliesFaerieFire: true },
    desc: 'Bonus action (Concentration, 1 min). Your next melee weapon hit deals an extra 2d6 radiant damage and wreathes the target in light — attacks against it have Advantage.',
    narrative: "{name}'s weapon blazes with searing light.",
    spellList: ['divine'],
  },
  // SRD: Ensnaring Strike (L1 Conjuration, Ranger) — Bonus Action, Self,
  // Concentration up to 1 minute. Arms the next hit: grasping vines, STR save or
  // Restrained (save-ends, STR). The per-turn 1d6 piercing is deferred.
  ensnaring_strike: {
    id: 'ensnaring_strike',
    name: 'Ensnaring Strike',
    level: 1,
    castTime: 'bonus_action',
    targetType: 'self',
    rangeKind: 'self',
    concentration: true,
    durationRounds: 10,
    weaponRider: { appliesCondition: 'restrained', conditionSave: 'str' },
    desc: 'Bonus action (Concentration, 1 min). On your next weapon hit, grasping vines snare the target — STR save or Restrained (it repeats the save at the end of each of its turns). The per-turn piercing damage is narrated.',
    narrative: '{name} conjures grasping vines along their weapon.',
    spellList: ['primal'],
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
  // SRD: Darkness — 15-ft radius sphere of magical darkness for 10 minutes
  // (concentration). Heavily Obscured; Darkvision can't see through it. In
  // pansori this places a `blocksSight` SpellZone (centered on the targeted
  // enemy, else the caster); cells inside blind everyone without Blindsight /
  // Devil's Sight for combat. See the darkness branch in castSpell/utility.ts
  // + `canSeeTarget`. (Daylight-counters-Darkness + light-suppression deferred.)
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
  command: {
    id: 'command',
    name: 'Command',
    level: 1,
    castTime: 'action',
    // SRD: Command — one-word command; on a failed WIS save the target
    // obeys on its next turn. Pansori resolves the "Halt" command: the
    // creature loses its next turn (no move or action). The `commanded`
    // condition is consumed by the enemy turn loop on the skip, so the
    // effect lasts exactly one turn (no concentration). RAW upcast adds
    // one extra target per slot above 1st — deferred (single-target cast).
    condition: 'commanded',
    conditionDuration: 1,
    savingThrow: 'wis',
    saveEffect: 'negates',
    desc: 'Bark a one-word command at a creature within 60 ft. On a failed WIS save it is compelled to halt — losing its next turn (no move or action).',
    rangeKind: 'ranged',
    rangeFt: 60,
    // SRD: Bard / Cleric / Paladin.
    spellList: ['arcane', 'divine'],
  },
  confusion: {
    id: 'confusion',
    name: 'Confusion',
    level: 4,
    castTime: 'action',
    concentration: true,
    // SRD: Confusion — 10-ft sphere, WIS save. Failed-save creatures become
    // `confused` (applied to all via `aoeCondition`). Each confused creature's
    // turn rolls 1d10 in the enemy loop: lose the turn, lash out at a random
    // ally in reach (friendly fire), or act normally; it re-saves each turn to
    // shake the effect. RAW upcast widens the sphere — deferred (fixed radius).
    condition: 'confused',
    conditionDuration: 10,
    aoeCondition: true,
    savingThrow: 'wis',
    saveEffect: 'negates',
    blastRadius: 10,
    aoeShape: 'sphere',
    desc: 'Each creature in a 10-ft sphere makes a WIS save or is confused (Concentration, 1 min): each turn it may lose its turn, attack a random creature within reach, or act normally, re-saving each turn to recover.',
    rangeKind: 'ranged',
    rangeFt: 90,
    // SRD: Bard / Druid / Sorcerer / Wizard.
    spellList: ['arcane', 'primal'],
  },
  compulsion: {
    id: 'compulsion',
    name: 'Compulsion',
    level: 4,
    castTime: 'action',
    concentration: true,
    // SRD: Compulsion — each creature in range (30 ft) makes a WIS save or is
    // driven to flee. pansori applies `compelled` to all failed-save creatures
    // in a 30-ft sphere (via `aoeCondition`); each turn the enemy loop forces
    // it to use its full movement staggering away from the caster (no action),
    // then it re-saves. Simplification: the direction is fixed to "away from
    // caster" (RAW lets the caster pick a horizontal direction as a Bonus
    // Action each turn) and the effect auto-applies without that bonus action.
    condition: 'compelled',
    conditionDuration: 10,
    aoeCondition: true,
    savingThrow: 'wis',
    saveEffect: 'negates',
    blastRadius: 30,
    aoeShape: 'sphere',
    desc: 'Creatures within 30 ft make a WIS save or are compelled (Concentration, 1 min): each turn the target must use all its movement to stagger away from you (no action), then re-saves to break free.',
    rangeKind: 'ranged',
    rangeFt: 30,
    // SRD: Bard.
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
  // SRD: Dominate Beast / Person / Monster — one creature makes a WIS save (with
  // Advantage while the party fights it) or is `dominated`: the enemy loop drives
  // it to attack the nearest OTHER enemy on its turn (it fights for the party).
  // Concentration. Deferred from RAW: the on-damage re-save and the telepathic
  // command surface (pansori auto-pilots the dominated creature, attacking the
  // nearest foe — the RAW "acts to protect itself" fallback). The variants are
  // mechanically identical, differing only in level / target restriction / list.
  dominate_beast: {
    id: 'dominate_beast',
    name: 'Dominate Beast',
    level: 4,
    castTime: 'action',
    concentration: true,
    condition: 'dominated',
    conditionDuration: 10,
    savingThrow: 'wis',
    saveEffect: 'negates',
    saveAdvantage: true,
    desc: 'A beast within 60 ft makes a WIS save (Advantage while you fight it) or is dominated (Concentration, 1 min): on its turn it attacks the nearest other enemy on your behalf.',
    rangeKind: 'ranged',
    rangeFt: 60,
    // SRD: Druid / Ranger / Sorcerer.
    spellList: ['primal', 'arcane'],
  },
  dominate_person: {
    id: 'dominate_person',
    name: 'Dominate Person',
    level: 5,
    castTime: 'action',
    concentration: true,
    condition: 'dominated',
    conditionDuration: 10,
    savingThrow: 'wis',
    saveEffect: 'negates',
    saveAdvantage: true,
    desc: 'A humanoid within 60 ft makes a WIS save (Advantage while you fight it) or is dominated (Concentration, 1 min): on its turn it attacks the nearest other enemy on your behalf.',
    rangeKind: 'ranged',
    rangeFt: 60,
    // SRD: Bard / Sorcerer / Wizard.
    spellList: ['arcane'],
  },
  dominate_monster: {
    id: 'dominate_monster',
    name: 'Dominate Monster',
    level: 8,
    castTime: 'action',
    concentration: true,
    condition: 'dominated',
    conditionDuration: 10,
    savingThrow: 'wis',
    saveEffect: 'negates',
    saveAdvantage: true,
    desc: 'A creature within 60 ft makes a WIS save (Advantage while you fight it) or is dominated (Concentration, 1 min): on its turn it attacks the nearest other enemy on your behalf.',
    rangeKind: 'ranged',
    rangeFt: 60,
    // SRD: Bard / Sorcerer / Warlock / Wizard.
    spellList: ['arcane'],
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
  // SRD: Spiritual Weapon (L2) — a floating force weapon (1 minute, NO
  // concentration). RE-4 recurring spell attack: on cast and as a Bonus Action
  // each later turn, it makes a melee spell attack for 1d8 + spellcasting mod
  // force. Re-issued via `recurring_spell_attack`.
  spiritual_weapon: {
    id: 'spiritual_weapon',
    name: 'Spiritual Weapon',
    level: 2,
    castTime: 'bonus_action',
    recurringAttack: true,
    recurringAttackCost: 'bonus_action',
    recurringAddSpellMod: true,
    damage: '1d8',
    damageType: 'force',
    upcastBonus: '1d8',
    durationRounds: 10, // 1 minute, no concentration
    rangeKind: 'ranged',
    rangeFt: 60,
    desc: 'Summon a floating spectral weapon for 1 minute (no concentration). On cast, and as a Bonus Action on later turns, it makes a melee spell attack for 1d8 + your spellcasting modifier Force damage (+1d8 per two slots above 2nd).',
    spellList: ['divine'],
  },
  // SRD: Vampiric Touch (L3) — a shadow-wreathed melee spell attack (3d6
  // necrotic) that heals the caster half the damage dealt (Concentration). RE-4
  // recurring spell attack: re-attack each turn as a Magic action.
  vampiric_touch: {
    id: 'vampiric_touch',
    name: 'Vampiric Touch',
    level: 3,
    castTime: 'action',
    recurringAttack: true,
    recurringAttackCost: 'action',
    recurringHealFraction: 0.5,
    concentration: true,
    durationRounds: 10, // Concentration, up to 1 minute
    damage: '3d6',
    damageType: 'necrotic',
    upcastBonus: '1d6',
    rangeKind: 'self',
    desc: 'A shadow-wreathed melee spell attack deals 3d6 necrotic and heals you for half the damage dealt. As a Magic action on later turns you can attack again (Concentration, up to 1 minute; +1d6 per slot above 3rd).',
    spellList: ['arcane'],
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
  // SRD: Daylight — a 60-ft sphere of bright sunlight (+ 60 ft Dim beyond) for
  // 1 hour. Like Light but larger: the caster becomes a 60-ft light source
  // (`light_radius_ft: 60`), illuminating the room so creatures can be seen in
  // the dark (see castSpell/utility.ts). The "counters magical Darkness" clause
  // is deferred with the Darkness spell itself.
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
    wall: { blocksMovement: false, blocksLineOfSight: true }, // opaque, but passable
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

  // SRD: Telekinesis (L5 Transmutation, Sorcerer/Wizard) — STR save or the
  // caster shoves the creature around with the mind. Rides the single-target
  // save path's new `pushFt` (forced displacement, reusing the AoE push). RAW is
  // Concentration + repeatable each turn (any direction, up to 30 ft); pansori
  // models a one-shot shove away from the caster on a failed save.
  telekinesis: {
    id: 'telekinesis',
    name: 'Telekinesis',
    level: 5,
    castTime: 'action',
    savingThrow: 'str',
    saveEffect: 'negates',
    pushFt: 30,
    rangeKind: 'ranged',
    rangeFt: 60,
    desc: 'You seize a creature with telekinetic force: a Strength save or it is hurled up to 30 ft away from you. (RAW: Concentration, repeatable each turn in any direction — pansori models a one-shot shove.)',
    narratives: {
      cast: [
        '{name} clenches a fist and unseen force wrenches {target} backward',
        '{name} hurls {target} away with a surge of telekinetic power',
      ],
    },
    spellList: ['arcane'],
  },

  // ─── Wall spells (RE-6) — barrier + formation-damage walls ──────────────────
  // Ride the SpellWall path (anchored on the target, perpendicular to the
  // caster→target approach). Point/orientation targeting is abstracted to that
  // anchor. Concentration-bound; removed by breakConcentration.

  // SRD: Wall of Force (L5 Wizard) — an invisible, impassable barrier. Blocks
  // movement but not sight (it's invisible). No damage.
  wall_of_force: {
    id: 'wall_of_force',
    name: 'Wall of Force',
    level: 5,
    castTime: 'action',
    concentration: true,
    durationRounds: 100, // 10 minutes
    wall: { blocksMovement: true, blocksLineOfSight: false },
    blastRadius: 30,
    rangeKind: 'ranged',
    rangeFt: 120,
    desc: 'An invisible wall of force springs up, impassable to movement (but transparent). Concentration, up to 10 minutes. (RAW free orientation is abstracted to a barrier across the target.)',
    spellList: ['arcane'],
  },

  // SRD: Wall of Stone (L5) — a solid stone barrier. Blocks movement and sight.
  // No damage.
  wall_of_stone: {
    id: 'wall_of_stone',
    name: 'Wall of Stone',
    level: 5,
    castTime: 'action',
    concentration: true,
    durationRounds: 100,
    wall: { blocksMovement: true, blocksLineOfSight: true },
    blastRadius: 60,
    rangeKind: 'ranged',
    rangeFt: 120,
    desc: 'A solid wall of stone springs into existence, blocking movement and sight. Concentration, up to 10 minutes (RAW can become permanent).',
    spellList: ['arcane', 'primal'],
  },

  // SRD: Wall of Ice (L6 Wizard) — a wall of ice; on formation a creature in its
  // space makes a DEX save for 10d6 Cold (half). Blocks movement and sight. The
  // wall's HP / breach-and-frigid-air follow-up is deferred.
  wall_of_ice: {
    id: 'wall_of_ice',
    name: 'Wall of Ice',
    level: 6,
    castTime: 'action',
    concentration: true,
    durationRounds: 100,
    damage: '10d6',
    damageType: 'cold',
    savingThrow: 'dex',
    saveEffect: 'half',
    blastRadius: 60,
    aoeShape: 'line',
    wall: { blocksMovement: true, blocksLineOfSight: true },
    rangeKind: 'ranged',
    rangeFt: 120,
    desc: 'A wall of ice forms: creatures in its space make a DEX save, taking 10d6 Cold damage (half on a success). It blocks movement and sight. Concentration, up to 10 minutes. (Breaching the wall + the frigid-air follow-up are deferred.)',
    spellList: ['arcane'],
  },

  // SRD: Wall of Thorns (L6 Druid) — a thorny barrier; on formation a creature in
  // its area makes a DEX save for 7d8 Piercing (half). Blocks sight; it's
  // passable difficult terrain (move-through slashing damage is narrated).
  wall_of_thorns: {
    id: 'wall_of_thorns',
    name: 'Wall of Thorns',
    level: 6,
    castTime: 'action',
    concentration: true,
    durationRounds: 100,
    damage: '7d8',
    damageType: 'piercing',
    savingThrow: 'dex',
    saveEffect: 'half',
    upcastBonus: '1d8',
    blastRadius: 60,
    aoeShape: 'line',
    wall: { blocksMovement: false, blocksLineOfSight: true }, // passable difficult terrain
    rangeKind: 'ranged',
    rangeFt: 120,
    desc: 'A wall of needle-sharp thorns erupts: creatures in its area make a DEX save, taking 7d8 Piercing damage (half on a success; +1d8 per slot above 6th). It blocks sight. Concentration, up to 10 minutes. (The move-through slashing damage + difficult terrain are narrated.)',
    spellList: ['primal'],
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
    // 2024 PHB — the target repeats the WIS save at the end of each of its turns,
    // ending the spell on itself on a success.
    conditionSaveEnds: true,
    desc: 'Up to six creatures in a 40 ft cube make a WIS save or are slowed for 1 minute (Speed halved, -2 AC, -2 Dex saves). Each repeats the save at the end of its turn, ending it on a success.',
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

  // SRD: Fire Shield (L4 Evocation) — wispy flames wreathe you (10 min, NOT
  // concentration). A "warm" shield grants Resistance to Cold and retaliates
  // with Fire when a creature hits you in melee. Rides the buff path:
  // `grantResistances` for the resistance + the new `fireShield` retaliate (read
  // in the enemy-turn loop). pansori models the warm shield; the "chill" variant
  // (resist Fire, retaliate Cold) is deferred.
  fire_shield: {
    id: 'fire_shield',
    name: 'Fire Shield',
    level: 4,
    castTime: 'action',
    targetType: 'self',
    grantResistances: ['cold'],
    fireShield: { dice: '2d8', damageType: 'fire' },
    durationRounds: 100, // 10 minutes (non-concentration; cleared at combat end)
    rangeKind: 'self',
    desc: 'Flames wreathe you for 10 minutes: you have Resistance to Cold, and a creature that hits you with a melee attack takes 2d8 Fire damage. (RAW alternate "chill" shield — resist Fire, retaliate Cold — is deferred.)',
    narrative: '{name} is wrapped in a curtain of protective flame.',
    spellList: ['arcane', 'primal'],
  },

  // SRD: Mirror Image (L2 Illusion) — three illusory duplicates (1 min, NOT
  // concentration). When a creature hits you, a d6 per remaining duplicate is
  // rolled; any 3+ means a duplicate takes the hit and is destroyed. Rides the
  // buff path (`mirrorImages` → `Character.mirror_images`); the enemy-attack
  // resolver burns them down. (Blinded/Blindsight/Truesight attacker exemption
  // deferred.)
  mirror_image: {
    id: 'mirror_image',
    name: 'Mirror Image',
    level: 2,
    castTime: 'action',
    targetType: 'self',
    mirrorImages: 3,
    durationRounds: 10, // 1 minute (non-concentration; cleared at combat end)
    rangeKind: 'self',
    desc: 'Three illusory duplicates of you appear. When a creature hits you, roll a d6 per remaining duplicate; on any 3+, a duplicate is struck instead and shatters. The spell ends when all three are gone.',
    narrative: '{name} blurs into a shifting cluster of identical duplicates.',
    spellList: ['arcane'],
  },

  // SRD: Sanctuary (L1 Abjuration) — Bonus Action, 1 min (not concentration). A
  // creature that tries to attack the warded target makes a Wisdom save vs your
  // spell DC or must pick a new target / lose the attack. Rides the buff path
  // (`sanctuary` → `Character.sanctuary_dc`, the caster's DC); the enemy-attack
  // resolver rolls the WIS save. (RAW: the ward ends when the warded creature
  // attacks/casts — that break-on-action is deferred; self-or-ally targeting.)
  sanctuary: {
    id: 'sanctuary',
    name: 'Sanctuary',
    level: 1,
    castTime: 'bonus_action',
    targetType: 'self_or_ally',
    sanctuary: true,
    durationRounds: 10, // 1 minute (non-concentration; cleared at combat end)
    rangeKind: 'ranged',
    rangeFt: 30,
    desc: 'You ward a creature: any creature that tries to attack it must succeed on a Wisdom save against your spell save DC or lose that attack. (RAW: the ward ends if the warded creature attacks or casts — deferred in pansori.)',
    narrative: '{name} traces a sigil of protection over {target}.',
    spellList: ['divine'],
  },

  // ─── Persistent damage zones (RE-4) ──────────────────────────────────
  // Stamp a SpellZone on cast that ticks each round wrap until concentration
  // ends (see castSpell/zone.ts + fireSpellZones). Movable zones declare
  // `zoneMoveFt` + `zoneMoveCost` and are repositioned via the `move_zone`
  // action (see moveZone.ts); Spike Growth is stationary.
  // SRD: Moonbeam (L2) — a 5-ft-radius cylinder of searing moonlight. A creature
  // in it makes a CON save for half of 2d10 radiant, each round it remains.
  moonbeam: {
    id: 'moonbeam',
    name: 'Moonbeam',
    level: 2,
    castTime: 'action',
    persistentZone: true,
    zoneMoveFt: 60,
    zoneMoveCost: 'action',
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
    desc: 'A 5-ft-radius beam of moonlight (Concentration, up to 1 minute). A creature in the beam makes a CON save, taking 2d10 radiant on a failure or half on a success, again each round it remains (+1d10 per slot above 2nd). The beam can be repositioned up to 60 ft as a Magic action.',
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
    zoneMoveFt: 30,
    zoneMoveCost: 'bonus_action',
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
    desc: 'A 5-ft sphere of fire; creatures within 5 ft of it make a DEX save, taking 2d6 fire on a failure or half on a success, each round it persists (Concentration, up to 1 minute; +1d6 per slot above 2nd). You can roll the sphere up to 30 ft as a Bonus Action.',
    spellList: ['primal', 'arcane'],
  },
  // SRD: Call Lightning (L3) — a storm cloud calls a bolt down at a point each
  // round (Concentration). Creatures at the strike point make a DEX save for
  // half of 3d10 lightning. You re-aim the bolt to a new point as a Magic
  // action (`move_zone`).
  call_lightning: {
    id: 'call_lightning',
    name: 'Call Lightning',
    level: 3,
    castTime: 'action',
    persistentZone: true,
    zoneMoveFt: 120,
    zoneMoveCost: 'action',
    concentration: true,
    durationRounds: 100,
    damage: '3d10',
    damageType: 'lightning',
    savingThrow: 'dex',
    saveEffect: 'half',
    upcastBonus: '1d10',
    blastRadius: 5,
    aoeShape: 'sphere',
    rangeKind: 'ranged',
    rangeFt: 120,
    desc: 'A storm cloud calls a lightning bolt down at a point each round (Concentration, up to 10 minutes). A creature at the strike point makes a DEX save, taking 3d10 lightning on a failure or half on a success (+1d10 per slot above 3rd). You can re-aim the bolt to a new point (up to 120 ft) as a Magic action.',
    spellList: ['primal'],
  },
  // SRD: Spike Growth (L2) — a 20-ft-radius field of spikes + Difficult Terrain
  // (Concentration). RAW deals 2d4 piercing per 5 ft moved through it (no save);
  // pansori ticks 2d4 to hostiles in the field each round (the per-5-ft
  // accounting + the difficult terrain are deferred). First no-save zone.
  spike_growth: {
    id: 'spike_growth',
    name: 'Spike Growth',
    level: 2,
    castTime: 'action',
    persistentZone: true,
    concentration: true,
    durationRounds: 100,
    damage: '2d4',
    damageType: 'piercing',
    blastRadius: 20,
    aoeShape: 'sphere',
    rangeKind: 'ranged',
    rangeFt: 150,
    desc: 'The ground in a 20-ft-radius sphere sprouts spikes, becoming difficult terrain (Concentration, up to 10 minutes). RAW a creature takes 2d4 piercing per 5 ft it moves through the area (no save); pansori ticks 2d4 to hostiles in the field each round (the per-5-ft accounting and difficult terrain are deferred).',
    spellList: ['primal'],
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
    materialCost: 25, // SRD: a pinch of diamond dust worth 25+ GP, consumed
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
    // SRD Phantom Steed — "functions as a controlled mount while you ride it."
    // A swift (100 ft Speed) non-combatant; the caster is auto-mounted when the
    // next battle starts. AC/HP are nominal (a hit dispels it; mount-death
    // fall-off is a follow-up). noAttack — a steed bears its rider, it doesn't fight.
    summon: {
      name: 'Phantom Steed',
      ac: 11,
      maxHp: 1,
      toHit: 0,
      damage: '0',
      noAttack: true,
      isMount: true,
      speed: 100,
    },
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

  // ─── RAW spell batch: save-damage + control + ward ──────────────────────────
  // Six SRD 5.2.1 spells that map onto existing dispatch shapes (single-target
  // save-for-half, AoE sphere save-for-half, WIS-save charm, and a touch ward
  // via the resistance/condition-strip buff path). No new engine code.

  // SRD: Dissonant Whispers (L1 Enchantment, Bard) — a discordant melody only
  // the target hears. WIS save; 3d6 psychic, half on a success. The fail-rider
  // (the target must use its Reaction to flee by the safest route) is deferred
  // — pansori models the damage core; the forced-flee reaction isn't wired.
  dissonant_whispers: {
    id: 'dissonant_whispers',
    name: 'Dissonant Whispers',
    level: 1,
    castTime: 'action',
    damage: '3d6',
    damageType: 'psychic',
    savingThrow: 'wis',
    saveEffect: 'half',
    upcastBonus: '1d6',
    rangeKind: 'ranged',
    rangeFt: 60,
    verbal: true,
    somatic: false, // V only
    desc: 'A creature hears a discordant melody in its mind. WIS save or take 3d6 psychic damage (half on a success; +1d6 per slot above 1st). The forced-flee reaction on a failure is narrated.',
    spellList: ['arcane'],
  },

  // SRD: Mind Spike (L2 Divination, Sorcerer/Warlock/Wizard) — a spike of
  // psionic energy. WIS save; 3d8 psychic, half on a success. RAW it is a
  // Concentration spell whose only ongoing effect is knowing the target's
  // location (it can't hide / benefit from Invisible against you). Pansori has
  // no hidden/invisible-tracking substrate, so the location rider is narrated
  // and the spell resolves as instantaneous damage — no concentration tie-up
  // for an effect we don't model.
  mind_spike: {
    id: 'mind_spike',
    name: 'Mind Spike',
    level: 2,
    castTime: 'action',
    damage: '3d8',
    damageType: 'psychic',
    savingThrow: 'wis',
    saveEffect: 'half',
    upcastBonus: '1d8',
    rangeKind: 'ranged',
    rangeFt: 120,
    desc: "A spike of psionic energy drives into a creature's mind. WIS save or take 3d8 psychic damage (half on a success; +1d8 per slot above 2nd). The location-tracking rider is narrated.",
    spellList: ['arcane'],
  },

  // SRD: Vitriolic Sphere (L4 Evocation, Sorcerer/Wizard) — a ball of acid
  // bursting in a 20-ft-radius sphere. DEX save; 10d4 acid, half on a success.
  // The "another 5d4 at the end of its next turn" rider is deferred (pansori
  // has no end-of-next-turn delayed follow-up on a save-damage spell yet).
  vitriolic_sphere: {
    id: 'vitriolic_sphere',
    name: 'Vitriolic Sphere',
    level: 4,
    castTime: 'action',
    damage: '10d4',
    damageType: 'acid',
    savingThrow: 'dex',
    saveEffect: 'half',
    upcastBonus: '2d4',
    blastRadius: 20,
    aoeShape: 'sphere',
    rangeKind: 'ranged',
    rangeFt: 150,
    desc: 'A ball of acid streaks to a point and explodes in a 20-ft-radius sphere. Each creature there makes a DEX save, taking 10d4 acid damage (half on a success; +2d4 per slot above 4th). The lingering 5d4 next-turn splash is narrated.',
    spellList: ['arcane'],
  },

  // SRD: Freezing Sphere (L6 Evocation, Sorcerer/Wizard) — a frigid globe that
  // explodes in a 60-ft-radius sphere. CON save; 10d6 cold, half on a success.
  // The water-freezing + held-globe utility clauses are flavour, not modeled.
  freezing_sphere: {
    id: 'freezing_sphere',
    name: 'Freezing Sphere',
    level: 6,
    castTime: 'action',
    damage: '10d6',
    damageType: 'cold',
    savingThrow: 'con',
    saveEffect: 'half',
    blastRadius: 60,
    aoeShape: 'sphere',
    rangeKind: 'ranged',
    rangeFt: 300,
    desc: 'A frigid globe streaks to a point and bursts in a 60-ft-radius sphere. Each creature there makes a CON save, taking 10d6 cold damage (half on a success). Freezing open water is narrated.',
    spellList: ['arcane'],
  },

  // SRD: Charm Monster (L4 Enchantment) — like Charm Person but works on any
  // creature. WIS save, rolled with Advantage while you or your allies are
  // fighting it (`saveAdvantage`); on a failure the target is Charmed (Friendly
  // to you) for 1 hour. Upcast (+1 target per slot) is deferred; damaging the
  // charmed creature ends the charm RAW — also deferred (mirrors Charm Person).
  charm_monster: {
    id: 'charm_monster',
    name: 'Charm Monster',
    level: 4,
    castTime: 'action',
    savingThrow: 'wis',
    saveEffect: 'negates',
    saveAdvantage: true, // RAW: Advantage on the save while it's fighting you
    condition: 'charmed',
    conditionDuration: 10,
    rangeKind: 'ranged',
    rangeFt: 30,
    desc: 'One creature you can see makes a WIS save (with Advantage if it is fighting you). On a failure it is Charmed and Friendly to you for 1 hour. The +1-target upcast and damage-ends-the-charm rider are deferred.',
    // Bard / Druid / Sorcerer / Warlock / Wizard (2024 PHB).
    spellList: ['arcane', 'primal'],
  },

  // SRD: Enlarge/Reduce (L2 Transmutation, Bard/Druid/Sorcerer/Wizard) — a
  // Concentration buff/debuff. pansori selects the effect from the target:
  // a party member (or self) is Enlarged (+1d4 weapon damage), an enemy is
  // Reduced (-1d4 weapon damage + Disadvantage on STR saves). Size changes,
  // the STR-check Advantage, and the unwilling-target CON save are narrated.
  enlarge_reduce: {
    id: 'enlarge_reduce',
    name: 'Enlarge/Reduce',
    level: 2,
    castTime: 'action',
    enlargeReduce: true,
    concentration: true,
    durationRounds: 10,
    rangeKind: 'ranged',
    rangeFt: 30,
    desc: 'You enlarge or reduce a creature for up to 1 minute (Concentration). A willing ally (or you) is Enlarged — weapon attacks deal +1d4 and Advantage on Strength checks/saves. An enemy is Reduced — weapon attacks deal -1d4 and Disadvantage on Strength saves.',
    spellList: ['arcane', 'primal'],
  },

  // SRD: Ice Knife (L1 Conjuration, Druid/Sorcerer/Wizard) — a ranged spell
  // attack for 1d10 piercing; then the shard explodes (hit or miss) in a 5-ft
  // burst centered on the target, each creature there making a DEX save or
  // taking 2d6 Cold (+1d6 per slot above 1st). The piercing is the primary
  // attack-roll damage; the cold burst rides the new `secondaryAoe` path.
  ice_knife: {
    id: 'ice_knife',
    name: 'Ice Knife',
    level: 1,
    castTime: 'action',
    attackRoll: true,
    damage: '1d10',
    damageType: 'piercing',
    secondaryAoe: {
      damage: '2d6',
      damageType: 'cold',
      savingThrow: 'dex',
      saveEffect: 'negates',
      blastRadius: 5,
      upcastBonus: '1d6',
    },
    rangeKind: 'ranged',
    rangeFt: 60,
    desc: 'You fling a shard of ice: a ranged spell attack for 1d10 Piercing on a hit. Hit or miss, the shard explodes — each creature within 5 ft of the target makes a DEX save or takes 2d6 Cold (+1d6 per slot above 1st).',
    spellList: ['arcane', 'primal'],
  },

  // SRD: Mass Suggestion (L6 Enchantment, Bard/Sorcerer/Wizard) — a WIS save
  // or Charmed for up to 24 hours, no Concentration. RAW targets up to twelve
  // creatures you can see within range; modeled here as every hostile in a
  // 30-ft sphere via the aoe-condition path (the verbal 25-word suggestion +
  // the full-day duration are narrated rather than tracked).
  mass_suggestion: {
    id: 'mass_suggestion',
    name: 'Mass Suggestion',
    level: 6,
    castTime: 'action',
    savingThrow: 'wis',
    saveEffect: 'negates',
    condition: 'charmed',
    conditionDuration: 100,
    aoeCondition: true,
    blastRadius: 30,
    aoeShape: 'sphere',
    rangeKind: 'ranged',
    rangeFt: 60,
    desc: 'You suggest a course of action to the creatures around a point you can see. Each hostile in a 30-ft sphere makes a WIS save or is Charmed (no Concentration). RAW targets up to twelve chosen creatures for 24 hours; the suggestion wording + duration are narrated.',
    spellList: ['arcane'],
  },

  // SRD: Irresistible Dance (L6 Enchantment, Bard/Wizard) — one creature makes
  // a WIS save or is Charmed (flailing in a comic dance) for the duration,
  // repeating the save at the end of each turn. The dance-specific riders
  // (Disadvantage on DEX saves, attacks against it have Advantage, all movement
  // spent dancing) are narrated through the Charmed condition.
  irresistible_dance: {
    id: 'irresistible_dance',
    name: 'Irresistible Dance',
    level: 6,
    castTime: 'action',
    savingThrow: 'wis',
    saveEffect: 'negates',
    condition: 'charmed',
    conditionSaveEnds: true,
    concentration: true,
    rangeKind: 'ranged',
    rangeFt: 30,
    desc: 'One creature you can see makes a WIS save or is Charmed for the duration (Concentration, up to 1 minute), flailing in a comic dance — it repeats the save at the end of each of its turns. The dance riders (Disadvantage on DEX saves, Advantage to attackers) are narrated.',
    spellList: ['arcane'],
  },

  // ─── SRD utility/narrative batch (RE-6) ─────────────────────────────────────
  // Out-of-combat utility spells with no combat mechanics — they route through
  // the utility (narrative) path and are gated out of combat (outOfCombatOnly).
  // Their full effects (terrain reshaping, disguises, telepathy, etc.) are
  // narrated rather than simulated.

  // SRD: Tenser's Floating Disk (L1 Conjuration, Wizard) — a hovering disk that
  // carries loads and follows you.
  floating_disk: {
    id: 'floating_disk',
    name: 'Floating Disk',
    level: 1,
    castTime: 'action',
    ritualCasting: true,
    outOfCombatOnly: true,
    rangeKind: 'ranged',
    rangeFt: 30,
    desc: 'You conjure a 3-ft-wide disk of force that hovers at waist height, carries up to 500 lb, and follows you for an hour — handy for hauling loot or a wounded companion.',
    narrative:
      '{name} conjures a shimmering disk of force; it hovers, patient, ready to bear a burden.',
    spellList: ['arcane'],
  },

  // SRD: Magic Circle (L3 Abjuration, Cleric/Paladin/Warlock/Wizard) — a 10-ft
  // cylinder warded against a chosen creature type.
  magic_circle: {
    id: 'magic_circle',
    name: 'Magic Circle',
    level: 3,
    castTime: 'action',
    outOfCombatOnly: true,
    materialCost: 100,
    rangeKind: 'ranged',
    rangeFt: 10,
    desc: 'You trace a 10-ft cylinder of binding sigils. A chosen kind of creature (celestials, fiends, undead, and the like) cannot willingly enter, and is hindered from harming or charming those within.',
    narrative:
      '{name} inscribes a ring of glowing sigils; the air inside it turns still and sacrosanct.',
    spellList: ['arcane', 'divine'],
  },

  // SRD: Hallucinatory Terrain (L4 Illusion, Bard/Druid/Warlock/Wizard) — make
  // natural terrain look, sound, and smell like another kind.
  hallucinatory_terrain: {
    id: 'hallucinatory_terrain',
    name: 'Hallucinatory Terrain',
    level: 4,
    castTime: 'action',
    outOfCombatOnly: true,
    rangeKind: 'ranged',
    rangeFt: 300,
    desc: 'You make a wide stretch of natural terrain look, sound, and smell like another sort — a swamp as a meadow, a road as open field — for up to 24 hours. Only physical contact reveals the illusion.',
    narrative:
      '{name} gestures across the land; the terrain shimmers and wears a wholly different face.',
    spellList: ['arcane', 'primal'],
  },

  // ─── Illusion & enchantment batch (SRD) ─────────────────────────────────────
  // SRD: Major Image (L3 Illusion, Bard/Sorcerer/Warlock/Wizard) — a movable
  // image up to a 20-ft cube with sound/smell/temperature, on Concentration. The
  // disbelieve check (Investigation vs spell DC) + illusory physicality narrated.
  major_image: {
    id: 'major_image',
    name: 'Major Image',
    level: 3,
    castTime: 'action',
    concentration: true,
    durationRounds: 100,
    rangeKind: 'ranged',
    rangeFt: 120,
    desc: 'Conjure a movable image of an object, creature, or phenomenon up to a 20-ft cube — complete with sound, smell, and warmth — and reshape it each turn (Concentration, up to 10 minutes). A creature that studies it may disbelieve with an Investigation check vs your spell save DC.',
    narrative:
      '{name} weaves light, sound, and scent into a phantom indistinguishable from the real thing.',
    spellList: ['arcane'],
  },
  // SRD: Mislead (L5 Illusion, Bard/Warlock/Wizard) — you gain the Invisible
  // condition while an illusory double appears; the invisibility ends if you
  // attack or cast. Modeled via the shared `invisible` condition (the
  // controllable double is narrated).
  mislead: {
    id: 'mislead',
    name: 'Mislead',
    level: 5,
    castTime: 'action',
    targetType: 'self',
    rangeKind: 'self',
    condition: 'invisible',
    concentration: true,
    durationRounds: 600,
    desc: 'You gain the Invisible condition while an illusory double of you appears in your space (Concentration, up to 1 hour). You can move the double and speak through it; the invisibility ends if you attack or cast a spell.',
    narrative: '{name} steps out of sight as a flawless double strides forward in their place.',
    spellList: ['arcane'],
  },
  // SRD: Programmed Illusion (L6 Illusion, Bard/Wizard) — a preset image
  // (≤30-ft cube) that stays imperceptible until a trigger you name, then plays
  // its scene and resets. A utility set-piece — out of combat.
  programmed_illusion: {
    id: 'programmed_illusion',
    name: 'Programmed Illusion',
    level: 6,
    castTime: 'action',
    outOfCombatOnly: true,
    materialCost: 25,
    rangeKind: 'ranged',
    rangeFt: 120,
    desc: 'You set an illusion of an object, creature, or phenomenon (up to a 30-ft cube) that stays hidden until a trigger you describe occurs, then plays out its scripted scene before resetting. Lasts until dispelled.',
    narrative: '{name} primes a phantom that waits, unseen, for its cue.',
    spellList: ['arcane'],
  },
  // SRD: Geas (L5 Enchantment, Bard/Cleric/Druid/Paladin/Wizard) — a verbal
  // command binding a creature for up to 30 days; while it holds the target is
  // Charmed and takes psychic damage if it defies the order. A downtime / social
  // spell — out of combat. (SRD cast time is 1 minute; pansori has no sub-action
  // timer, so it casts as an action.)
  geas: {
    id: 'geas',
    name: 'Geas',
    level: 5,
    castTime: 'action',
    outOfCombatOnly: true,
    rangeKind: 'ranged',
    rangeFt: 60,
    desc: 'You lay a magical command on a creature you can see, ordering it to carry out a service or refrain from an action for up to 30 days. While the geas holds, the target is Charmed toward you, and it takes 5d10 psychic damage (once per day) if it defies the command.',
    narrative: '{name} speaks a binding word; the order settles over {target} like a yoke.',
    spellList: ['arcane', 'divine', 'primal'],
  },
  // SRD: Modify Memory (L5 Enchantment, Bard/Wizard) — reshape a creature's
  // memory of a recent event on a failed WIS save (Advantage if you're fighting
  // it). A social spell — out of combat; the save + altered recollection narrated.
  modify_memory: {
    id: 'modify_memory',
    name: 'Modify Memory',
    level: 5,
    castTime: 'action',
    outOfCombatOnly: true,
    rangeKind: 'ranged',
    rangeFt: 30,
    desc: "You attempt to reshape a creature's memory of an event it experienced within the last 24 hours. It makes a Wisdom saving throw (with Advantage if you are fighting it); on a failure you can erase, alter, or implant its recollection of that event.",
    narrative: "{name} threads a false strand through {target}'s recollection; the memory reknits.",
    spellList: ['arcane'],
  },

  // SRD: Fabricate (L4 Transmutation, Wizard) — convert raw material into a
  // finished product.
  fabricate: {
    id: 'fabricate',
    name: 'Fabricate',
    level: 4,
    castTime: 'action',
    outOfCombatOnly: true,
    rangeKind: 'ranged',
    rangeFt: 120,
    desc: 'You transform raw materials into finished products of the same substance — timber into a bridge, ore into a portcullis, cloth into clothes — shaping a large volume in an instant (work requiring fine craft is limited by your skill).',
    narrative:
      '{name} sweeps a hand over the raw stock; it folds and sets into a finished, purposeful form.',
    spellList: ['arcane'],
  },

  // SRD: Awaken (L5 Transmutation, Bard/Druid) — grant Intelligence and speech
  // to a beast or plant, which becomes charmed to you for a time.
  awaken: {
    id: 'awaken',
    name: 'Awaken',
    level: 5,
    castTime: 'action',
    outOfCombatOnly: true,
    materialCost: 1000,
    rangeKind: 'touch',
    desc: 'Over a long ritual you touch a Beast or plant and kindle a mind in it: it gains the ability to reason and speak, and regards you as a friendly ally for 30 days.',
    narrative:
      '{name} whispers for hours, and something behind the creature’s eyes wakes — aware, and grateful.',
    spellList: ['arcane', 'primal'],
  },

  // SRD: Seeming (L5 Illusion, Bard/Sorcerer/Wizard) — disguise the appearance
  // of any number of willing creatures.
  seeming: {
    id: 'seeming',
    name: 'Seeming',
    level: 5,
    castTime: 'action',
    outOfCombatOnly: true,
    rangeKind: 'ranged',
    rangeFt: 30,
    desc: 'You cloak any number of creatures within range in a convincing illusion, changing how each looks (and how their clothing and gear appear) for the duration. Only a successful inspection reveals the disguise.',
    narrative:
      '{name} sweeps a hand across the party; faces and finery blur and resettle into new guises.',
    spellList: ['arcane'],
  },

  // SRD: Rary's Telepathic Bond (L5 Divination, Bard/Wizard) — link the minds
  // of a group for silent communication.
  telepathic_bond: {
    id: 'telepathic_bond',
    name: 'Telepathic Bond',
    level: 5,
    castTime: 'action',
    ritualCasting: true,
    outOfCombatOnly: true,
    rangeKind: 'ranged',
    rangeFt: 30,
    desc: 'You forge a telepathic link among up to eight willing creatures for an hour: while bound, they can silently share words, ideas, and images with one another across any distance on the same plane.',
    narrative:
      '{name} touches each brow in turn; a quiet thread of shared thought draws the group together.',
    spellList: ['arcane'],
  },

  // SRD: Move Earth (L6 Transmutation, Druid/Sorcerer/Wizard) — reshape dirt,
  // sand, and clay across a large area.
  move_earth: {
    id: 'move_earth',
    name: 'Move Earth',
    level: 6,
    castTime: 'action',
    outOfCombatOnly: true,
    rangeKind: 'ranged',
    rangeFt: 120,
    desc: 'You reshape loose earth, sand, and clay across a wide area — raising or sinking the ground, digging trenches, or building ramparts — slowly, over the course of the spell (Concentration, up to 2 hours). It can’t move stone or worked structures.',
    narrative: '{name} rolls their hands, and the very ground heaves and flows like slow water.',
    spellList: ['arcane', 'primal'],
  },

  // SRD: Protection from Poison (L2 Abjuration, Cleric/Druid/Paladin/Ranger) —
  // a touch ward. Ends the Poisoned condition on the target and grants
  // Resistance to poison damage for the duration (1 hour). The "Advantage on
  // saves to avoid/end Poisoned" rider is deferred — pansori has no save-
  // advantage-vs-condition substrate. Non-concentration: the granted poison
  // resistance persists like other non-concentration buffs (e.g. Mage Armor).
  protection_from_poison: {
    id: 'protection_from_poison',
    name: 'Protection from Poison',
    level: 2,
    castTime: 'action',
    targetType: 'self_or_ally',
    rangeKind: 'touch',
    removeConditions: ['poisoned'],
    grantResistances: ['poison'],
    desc: 'Touch a creature to end the Poisoned condition on it and grant Resistance to poison damage for 1 hour. The Advantage-on-poison-saves rider is deferred.',
    spellList: ['divine', 'primal'],
  },

  // SRD: Color Spray (L1 Illusion, Bard/Sorcerer/Wizard) — a dazzling 15-ft cone
  // of light. Each creature in it makes a CON save or is Blinded until the end of
  // your next turn. Rides the AoE-condition path (now cone-aware): every failed-
  // save hostile in the cone is Blinded with a 1-round stamped duration, so it
  // expires on the round-wrap enemy-condition tick. Non-concentration.
  color_spray: {
    id: 'color_spray',
    name: 'Color Spray',
    level: 1,
    castTime: 'action',
    savingThrow: 'con',
    saveEffect: 'negates',
    condition: 'blinded',
    conditionDuration: 1, // "until the end of its next turn" ≈ one round
    aoeCondition: true,
    blastRadius: 15,
    aoeShape: 'cone',
    rangeKind: 'self',
    desc: 'A dazzling 15-ft cone of light. Each creature in it makes a CON save or is Blinded until the end of your next turn (attacks against it have Advantage; its own attacks have Disadvantage).',
    spellList: ['arcane'],
  },

  // ─── Spell batch: Blur + AoE damage + narrative utility ─────────────────────

  // SRD: Blur (L2 Illusion, Sorcerer/Wizard) — Self, Concentration up to 1
  // minute. Any creature has Disadvantage on attack rolls against you. Modeled
  // as a self-buff that applies the `blurred` condition (read by the enemy
  // attack path via ENEMY_DISADV_CONDITIONS); cleared on concentration end.
  blur: {
    id: 'blur',
    name: 'Blur',
    level: 2,
    castTime: 'action',
    targetType: 'self',
    rangeKind: 'self',
    condition: 'blurred',
    concentration: true,
    durationRounds: 10,
    desc: 'Your body blurs (Concentration, up to 1 minute) — any creature has Disadvantage on attack rolls against you. (Blindsight / Truesight ignore it — not modeled.)',
    narrative: "{name}'s outline smears into a shifting, hard-to-strike blur.",
    spellList: ['arcane'],
  },

  // SRD: Incendiary Cloud (L8 Conjuration, Druid/Sorcerer/Wizard) — a swirling
  // 20-ft-radius ember cloud. Each creature in it makes a DEX save, taking 10d8
  // fire (half on a success). Mirrors Cloudkill's one-shot AoE shape: the
  // drifting cloud + per-turn re-damage + heavy obscurement are not modeled —
  // damage resolves once on cast.
  incendiary_cloud: {
    id: 'incendiary_cloud',
    name: 'Incendiary Cloud',
    level: 8,
    castTime: 'action',
    damage: '10d8',
    damageType: 'fire',
    savingThrow: 'dex',
    saveEffect: 'half',
    blastRadius: 20,
    aoeShape: 'sphere',
    concentration: true,
    durationRounds: 10,
    rangeKind: 'ranged',
    rangeFt: 150,
    desc: 'A 20-ft-radius cloud of embers. Each creature there makes a DEX save, taking 10d8 fire damage (half on a success). The drifting cloud + per-turn re-damage are narrated.',
    spellList: ['primal', 'arcane'],
  },

  // SRD: Sunbeam (L6 Evocation, Cleric/Druid/Sorcerer/Wizard) — a 60-ft line of
  // searing light. Each creature in the line makes a CON save, taking 6d8
  // radiant (half on a success) and is Blinded until the start of your next turn
  // on a failure. Models the on-cast line damage (mirrors Lightning Bolt);
  // the per-turn re-fire as an action and the Blinded rider are deferred.
  sunbeam: {
    id: 'sunbeam',
    name: 'Sunbeam',
    level: 6,
    castTime: 'action',
    damage: '6d8',
    damageType: 'radiant',
    savingThrow: 'con',
    saveEffect: 'half',
    blastRadius: 60,
    aoeShape: 'line',
    concentration: true,
    durationRounds: 10,
    rangeKind: 'self',
    desc: 'A 60-ft line of sunlight. Each creature in it makes a CON save, taking 6d8 radiant damage (half on a success). The Blinded rider and per-turn re-fire are narrated.',
    spellList: ['divine', 'primal', 'arcane'],
  },

  // ── Narrative-utility spells (exploration / divination; no combat mechanics) ──

  // SRD: Commune with Nature (L5 Divination, Druid/Ranger) — ritual; learn the
  // lay of the surrounding land.
  commune_with_nature: {
    id: 'commune_with_nature',
    name: 'Commune with Nature',
    level: 5,
    castTime: 'action',
    ritualCasting: true,
    outOfCombatOnly: true,
    rangeKind: 'self',
    desc: 'You commune with nearby nature spirits and learn facts about the surrounding terrain — water, prey, plants, settlements, and the like (3 miles outdoors, 300 ft underground).',
    narrative: '{name} stills, and the land murmurs its secrets in reply.',
    spellList: ['primal'],
  },

  // SRD: Find the Path (L6 Divination, Bard/Cleric/Druid) — sense the most
  // direct route to a familiar location.
  find_the_path: {
    id: 'find_the_path',
    name: 'Find the Path',
    level: 6,
    castTime: 'action',
    outOfCombatOnly: true,
    materialCost: 100,
    rangeKind: 'self',
    desc: 'You sense the shortest, most direct physical route to a location you name and are familiar with on this plane, knowing its direction for the duration.',
    narrative: '{name} traces a path no map shows; the way ahead feels suddenly certain.',
    spellList: ['arcane', 'divine', 'primal'],
  },

  // SRD: Legend Lore (L5 Divination, Bard/Cleric/Wizard) — recall significant
  // lore about a famous person, place, or object.
  legend_lore: {
    id: 'legend_lore',
    name: 'Legend Lore',
    level: 5,
    castTime: 'action',
    outOfCombatOnly: true,
    materialCost: 250,
    rangeKind: 'self',
    desc: 'Name or describe a famous person, place, or object; the spell brings to mind a summary of the significant lore about it.',
    narrative:
      '{name} sifts the weight of history; half-remembered legends surface, clear and ordered.',
    spellList: ['arcane', 'divine'],
  },

  // SRD: Meld into Stone (L3 Transmutation, Cleric/Druid/Ranger) — ritual; step
  // into a stone surface large enough to contain you.
  meld_into_stone: {
    id: 'meld_into_stone',
    name: 'Meld into Stone',
    level: 3,
    castTime: 'action',
    ritualCasting: true,
    rangeKind: 'touch',
    desc: 'You step into a stone object or surface large enough to hold you, merging with it (and your gear) for up to 8 hours — hidden and sheltered within the stone.',
    narrative: '{name} presses into the rock and is gone, swallowed by the stone.',
    spellList: ['divine', 'primal'],
  },

  // SRD: Animal Messenger (L2 Enchantment, Bard/Druid/Ranger) — ritual; send a
  // Tiny beast to carry a short message.
  animal_messenger: {
    id: 'animal_messenger',
    name: 'Animal Messenger',
    level: 2,
    castTime: 'action',
    ritualCasting: true,
    rangeKind: 'ranged',
    rangeFt: 30,
    desc: 'A Tiny beast you can see carries a short message to a place you have visited, seeking out a recipient you describe and delivering your words.',
    narrative: '{name} whispers to a small creature, which darts off bearing the message.',
    spellList: ['arcane', 'primal'],
  },

  // SRD: Tiny Hut (L3 Evocation, Bard/Wizard) — ritual; a sheltering dome over
  // the party for 8 hours.
  tiny_hut: {
    id: 'tiny_hut',
    name: 'Tiny Hut',
    level: 3,
    castTime: 'action',
    ritualCasting: true,
    outOfCombatOnly: true,
    rangeKind: 'self',
    desc: 'A 10-ft dome of force springs up around you and your companions for up to 8 hours — weatherproof, impassable to other creatures and effects, and free passage only for those inside.',
    narrative: '{name} raises a shimmering dome; the night and its dangers stay outside.',
    spellList: ['arcane'],
  },

  // ─── Spell content batch (RE-6) ─────────────────────────────────────────────
  // Six SRD 5.2.1 spells riding shipped dispatcher paths (heal / mass-heal /
  // single-target save+condition / AoE-condition / recurring spell attack). No
  // new mechanics — data only (+ a small mass-heal narrative/strip touch-up).

  // SRD: Regenerate (L7 Transmutation) — Touch; the target regains 4d8 + 15 HP.
  // Routes through the single-target heal path (auto-targets the most-injured
  // ally). RAW also grants regen 1 HP / turn for 1 hour + regrows severed limbs
  // — narrated, not ticked (no per-turn ally-heal primitive).
  regenerate: {
    id: 'regenerate',
    name: 'Regenerate',
    level: 7,
    castTime: 'action',
    heal: '4d8+15',
    rangeKind: 'touch',
    desc: 'A creature you touch regains 4d8 + 15 Hit Points and begins to mend (RAW: also regains 1 HP at the start of each of its turns for 1 hour and regrows lost limbs — narrated in pansori).',
    spellList: ['divine', 'primal'],
  },

  // SRD: Mass Heal (L9 Abjuration, Cleric) — a flood of healing restores up to
  // 700 HP split among creatures in range (pansori: every ally to full) and ends
  // their Blinded, Deafened, and Poisoned conditions. Routes through the
  // mass-heal path (`healFull` → each target to its own max).
  mass_heal: {
    id: 'mass_heal',
    name: 'Mass Heal',
    level: 9,
    castTime: 'action',
    heal: '0', // unused — `healFull` floors every target to its max HP
    healFull: true,
    removeConditions: ['blinded', 'deafened', 'poisoned'],
    rangeKind: 'ranged',
    rangeFt: 60,
    desc: 'A flood of healing energy restores all allies within 60 ft to full Hit Points and ends their Blinded, Deafened, and Poisoned conditions.',
    spellList: ['divine'],
  },

  // SRD: Contagion (L5 Necromancy, Cleric/Druid) — Touch; CON save or take 11d8
  // Necrotic damage and be Poisoned, repeating the save at the end of each turn
  // (save-ends). Rides the single-target save path + the save-ends hook. RAW's
  // disease ladder (3 successes/failures → worse) + the per-disease ability
  // disadvantage are simplified to "Poisoned, save-ends".
  contagion: {
    id: 'contagion',
    name: 'Contagion',
    level: 5,
    castTime: 'action',
    savingThrow: 'con',
    saveEffect: 'negates',
    damage: '11d8',
    damageType: 'necrotic',
    condition: 'poisoned',
    conditionSaveEnds: true,
    rangeKind: 'touch',
    desc: 'Your touch inflicts a magical contagion: a Constitution save or 11d8 Necrotic damage and Poisoned, repeating the save at the end of each turn to shake it off.',
    narratives: {
      cast: [
        '{name} presses a hand to {target}; sickness blooms beneath the skin',
        '{name} breathes a word of rot — disease races through {target}',
      ],
    },
    spellList: ['divine', 'primal'],
  },

  // SRD: Flame Blade (L2 Evocation, Druid/Sorcerer) — Bonus Action to evoke a
  // fiery scimitar (Concentration, 10 min); as a Magic action, a melee spell
  // attack for 3d6 + spellcasting modifier Fire. Rides the recurring-spell-
  // attack path (re-attack each turn as an action), mirroring Vampiric Touch.
  // (pansori makes the first attack on cast, like the other recurring spells —
  // a slight deviation from RAW's separate-action first swing.)
  flame_blade: {
    id: 'flame_blade',
    name: 'Flame Blade',
    level: 2,
    castTime: 'bonus_action',
    recurringAttack: true,
    recurringAttackCost: 'action',
    recurringAddSpellMod: true,
    concentration: true,
    durationRounds: 100, // Concentration, up to 10 minutes
    damage: '3d6',
    damageType: 'fire',
    rangeKind: 'self',
    desc: 'You evoke a fiery scimitar of flame. A melee spell attack deals 3d6 + your spellcasting modifier Fire damage, and you can strike again each turn (Concentration, up to 10 minutes).',
    spellList: ['primal'],
  },

  // SRD: Earthquake (L8 Transmutation, Cleric/Druid/Sorcerer) — a 100-ft-radius
  // tremor (Concentration, 1 min): each creature on the ground makes a DEX save
  // or is knocked Prone. Rides the AoE-condition path. RAW's Difficult Terrain,
  // structural collapse, and fissures are narrated; the per-turn re-save is
  // simplified to the on-cast knockdown.
  earthquake: {
    id: 'earthquake',
    name: 'Earthquake',
    level: 8,
    castTime: 'action',
    savingThrow: 'dex',
    condition: 'prone',
    aoeCondition: true,
    concentration: true,
    durationRounds: 10, // Concentration, up to 1 minute
    blastRadius: 100,
    aoeShape: 'sphere',
    rangeKind: 'ranged',
    rangeFt: 120,
    desc: 'An intense tremor rips through a 100-ft radius: every creature on the ground makes a Dexterity save or is knocked Prone (RAW Difficult Terrain, fissures, and structural collapse are narrated).',
    narratives: {
      cast: [
        '{name} drives the ground into a heaving, splitting tremor',
        '{name} calls up an earthquake — the floor bucks and cracks',
      ],
    },
    spellList: ['divine', 'primal'],
  },

  // ─── Spell content batch B (RE-6) ───────────────────────────────────────────
  // Five more SRD 5.2.1 spells on shipped paths: AoE save-for-half damage,
  // single-target save→condition (save-ends), AoE-condition, and a concentration
  // buff. One new registry condition (`enfeebled`, mirroring `cursed`).

  // SRD: Tsunami (L8 Conjuration, Druid) — a 300-ft wall of water; each creature
  // in the area makes a STR save for 6d10 Bludgeoning, half on a success. Rides
  // the AoE save-for-half damage path (wall shape + per-round diminishing
  // narrated). Concentration, up to 6 rounds.
  tsunami: {
    id: 'tsunami',
    name: 'Tsunami',
    level: 8,
    castTime: 'action',
    savingThrow: 'str',
    saveEffect: 'half',
    damage: '6d10',
    damageType: 'bludgeoning',
    concentration: true,
    durationRounds: 6,
    blastRadius: 60,
    aoeShape: 'sphere',
    rangeKind: 'ranged',
    rangeFt: 120,
    desc: 'A towering wall of water crashes down: each creature in the area makes a Strength save, taking 6d10 Bludgeoning damage (half on a success). Concentration, up to 6 rounds.',
    spellList: ['primal'],
  },

  // SRD: Flesh to Stone (L6 Transmutation) — CON save or Restrained for the
  // duration; a Restrained target re-saves at the end of each of its turns
  // (save-ends), and sustained failures turn it to stone (narrated). Rides the
  // single-target save→condition path + the save-ends hook. Concentration.
  flesh_to_stone: {
    id: 'flesh_to_stone',
    name: 'Flesh to Stone',
    level: 6,
    castTime: 'action',
    savingThrow: 'con',
    saveEffect: 'negates',
    condition: 'restrained',
    conditionSaveEnds: true,
    concentration: true,
    durationRounds: 10,
    rangeKind: 'ranged',
    rangeFt: 60,
    desc: 'You begin turning a creature to stone: a Constitution save or Restrained, repeating the save at the end of each turn (sustained failures petrify it — narrated). Concentration, up to 1 minute.',
    narratives: {
      cast: [
        '{name} points at {target}, whose limbs grind toward stone',
        '{name} speaks a petrifying word; {target} stiffens',
      ],
    },
    spellList: ['arcane', 'primal'],
  },

  // SRD: Ray of Enfeeblement (L2 Necromancy, Warlock/Wizard) — CON save or the
  // target is Enfeebled: Disadvantage on Strength-based attacks (save-ends).
  // Rides the single-target save→condition path; the RAW −1d8 weapon-damage
  // rider is narrated. Concentration.
  ray_of_enfeeblement: {
    id: 'ray_of_enfeeblement',
    name: 'Ray of Enfeeblement',
    level: 2,
    castTime: 'action',
    savingThrow: 'con',
    saveEffect: 'negates',
    condition: 'enfeebled',
    conditionSaveEnds: true,
    concentration: true,
    durationRounds: 10,
    rangeKind: 'ranged',
    rangeFt: 60,
    desc: 'A beam of enervating energy: a Constitution save or the target attacks at Disadvantage, repeating the save at the end of each turn (RAW also subtracts 1d8 from its damage — narrated). Concentration, up to 1 minute.',
    narratives: {
      cast: [
        '{name} drains the strength from {target} with a sickly grey beam',
        '{name} lances {target} with enervating energy',
      ],
    },
    spellList: ['arcane'],
  },

  // SRD: Black Tentacles (L4 Conjuration, Wizard) — a 20-ft square of grasping
  // tentacles; each creature makes a STR save or is Restrained (save-ends).
  // Rides the AoE-condition path. RAW's 3d6 Bludgeoning + Difficult Terrain are
  // narrated (the AoE-condition path is condition-only). Concentration.
  black_tentacles: {
    id: 'black_tentacles',
    name: 'Black Tentacles',
    level: 4,
    castTime: 'action',
    savingThrow: 'str',
    condition: 'restrained',
    aoeCondition: true,
    conditionSaveEnds: true,
    concentration: true,
    durationRounds: 10,
    blastRadius: 20,
    aoeShape: 'sphere',
    rangeKind: 'ranged',
    rangeFt: 90,
    desc: 'Squirming tentacles fill the area: each creature makes a Strength save or is Restrained, repeating the save at the end of each turn (RAW 3d6 Bludgeoning + Difficult Terrain narrated). Concentration, up to 1 minute.',
    narratives: {
      cast: [
        '{name} calls writhing black tentacles up through the ground',
        '{name} fills the ground with grasping, ebony tendrils',
      ],
    },
    spellList: ['arcane'],
  },

  // SRD: Enhance Ability (L2 Transmutation) — Touch; the target has Advantage on
  // ability checks using a chosen ability for the duration. Rides the
  // concentration-buff path; the advantage on (mostly out-of-combat) ability
  // checks is narrated, as pansori doesn't track a per-ability check buff.
  enhance_ability: {
    id: 'enhance_ability',
    name: 'Enhance Ability',
    level: 2,
    castTime: 'action',
    targetType: 'self_or_ally',
    concentration: true,
    durationRounds: 600, // Concentration, up to 1 hour
    rangeKind: 'touch',
    desc: 'You bolster a creature, granting Advantage on ability checks with one ability of your choice (narrated). Concentration, up to 1 hour.',
    narratives: {
      cast: [
        '{name} touches {target}; latent talent surges to the surface',
        "{name}'s blessing sharpens {target}'s every effort",
      ],
    },
    spellList: ['arcane', 'divine', 'primal'],
  },

  // ─── Spell content batch C (RE-6) — environmental / travel utility ───────────
  // Five SRD 5.2.1 exploration spells. No combat mechanics — they route through
  // the utility (narrative) path and are gated out of combat (`outOfCombatOnly`),
  // matching the existing narrated-utility spells (Tiny Hut, Find the Path).

  // SRD: Plant Growth (L3 Transmutation) — the Overgrowth form chokes a wide area
  // with hampering growth; the Enrichment form makes land bountiful for a year.
  // (RAW Overgrowth difficult terrain is deferred — no dynamic terrain.)
  plant_growth: {
    id: 'plant_growth',
    name: 'Plant Growth',
    level: 3,
    castTime: 'action',
    outOfCombatOnly: true,
    rangeKind: 'ranged',
    rangeFt: 150,
    desc: 'You channel growth into the land — either choking a wide area with hampering overgrowth, or enriching the soil so it yields a bountiful harvest for a year.',
    narrative: '{name} calls on green and growing things; the land answers, lush and wild.',
    spellList: ['arcane', 'primal'],
  },

  // SRD: Control Water (L4 Transmutation) — reshape a large body of water
  // (flood, part, redirect the flow, or churn a whirlpool) for the duration.
  control_water: {
    id: 'control_water',
    name: 'Control Water',
    level: 4,
    castTime: 'action',
    outOfCombatOnly: true,
    rangeKind: 'ranged',
    rangeFt: 300,
    desc: 'You seize control of a large body of water — parting it, raising a flood, redirecting its flow, or wrenching it into a whirlpool (Concentration, up to 10 minutes).',
    narrative: '{name} sweeps a hand and the water heaves, bending to their will.',
    spellList: ['arcane', 'divine', 'primal'],
  },

  // SRD: Tree Stride (L5 Conjuration) — step into one living tree and out of
  // another of the same kind within 500 ft, once per turn for the duration.
  tree_stride: {
    id: 'tree_stride',
    name: 'Tree Stride',
    level: 5,
    castTime: 'action',
    outOfCombatOnly: true,
    rangeKind: 'self',
    desc: 'You gain the power to step into a living tree and emerge from another of the same kind up to 500 ft away (Concentration, up to 1 minute).',
    narrative: '{name} melts into the bark of a nearby tree and is gone.',
    spellList: ['primal'],
  },

  // SRD: Wind Walk (L6 Transmutation) — you and up to ten allies become wisps of
  // cloud with a 300-ft Fly Speed for long-distance travel.
  wind_walk: {
    id: 'wind_walk',
    name: 'Wind Walk',
    level: 6,
    castTime: 'action',
    outOfCombatOnly: true,
    rangeKind: 'self',
    desc: 'You and up to ten willing companions become gaseous wisps of cloud with a 300-ft flying speed, streaking across the sky for up to 8 hours (the Fly Speed is not modeled in combat).',
    narrative: '{name} and the party dissolve into streaming wisps of cloud and race skyward.',
    spellList: ['primal'],
  },

  // SRD: Control Weather (L8 Transmutation) — over time, shift the weather in a
  // wide area around you (precipitation, temperature, and wind) for the duration.
  control_weather: {
    id: 'control_weather',
    name: 'Control Weather',
    level: 8,
    castTime: 'action',
    outOfCombatOnly: true,
    rangeKind: 'self',
    desc: 'You take command of the sky, gradually shifting the precipitation, temperature, and wind across a wide area (Concentration, up to 8 hours).',
    narrative: '{name} raises their arms; clouds gather and the wind turns to their command.',
    spellList: ['arcane', 'divine', 'primal'],
  },

  // SRD: Guardian of Faith (L4 Conjuration, Cleric) — a spectral guardian; a
  // creature entering within 10 ft (or starting its turn there) makes a DEX save
  // for 20 Radiant, half on a success. NOT concentration — it vanishes after
  // dealing 60 total damage (or 8 hours). The first non-concentration persistent
  // zone: rides the zone path with `zoneDamageCap` (→ removed at 60 damage) and
  // the combat-end zone clear. (RAW friend-or-foe damage is enemy-only here.)
  guardian_of_faith: {
    id: 'guardian_of_faith',
    name: 'Guardian of Faith',
    level: 4,
    castTime: 'action',
    persistentZone: true,
    zoneDamageCap: 60,
    savingThrow: 'dex',
    saveEffect: 'half',
    damage: '20',
    damageType: 'radiant',
    blastRadius: 10,
    aoeShape: 'sphere',
    rangeKind: 'ranged',
    rangeFt: 30,
    desc: 'A Large spectral guardian appears: a creature that enters within 10 ft or starts its turn there makes a Dexterity save, taking 20 Radiant damage (half on a success). It fades after dealing 60 total damage.',
    narrative: '{name} calls up a towering spectral guardian wreathed in radiant light.',
    spellList: ['divine'],
  },

  // ─── Conjure-summon family (RE-6) — 2024 SRD ────────────────────────────────
  // The 2024 conjure spells aren't stat-block summons; they're concentration
  // effects (damage zones / emanations / a recurring strike). They ride the
  // shipped zone / recurring-attack / weapon-rider paths — no ally-turn AI.

  // SRD: Conjure Animals (L3) — a spectral pack (placed); a creature within 10 ft
  // makes a DEX save or takes 3d10 Slashing (once/turn). Movable 30 ft when you
  // move. Rides the placed, repositionable damage-zone path (Call Lightning).
  // (STR-save Advantage near the pack is narrated.)
  conjure_animals: {
    id: 'conjure_animals',
    name: 'Conjure Animals',
    level: 3,
    castTime: 'action',
    persistentZone: true,
    savingThrow: 'dex',
    saveEffect: 'negates',
    damage: '3d10',
    damageType: 'slashing',
    upcastBonus: '1d10',
    concentration: true,
    durationRounds: 100,
    blastRadius: 10,
    aoeShape: 'sphere',
    zoneMoveFt: 30,
    zoneMoveCost: 'bonus_action',
    rangeKind: 'ranged',
    rangeFt: 60,
    desc: 'A Large pack of spectral animals appears: a creature within 10 ft makes a Dexterity save or takes 3d10 Slashing (+1d10 per slot above 3rd). You can reposition the pack 30 ft. Concentration, up to 10 minutes.',
    narrative: '{name} conjures a pack of spectral beasts that prowl the field.',
    spellList: ['primal'],
  },

  // SRD: Conjure Minor Elementals (L4) — elemental spirits flit around you in a
  // 15-ft Emanation: your attacks deal +2d8 (Acid/Cold/Fire/Lightning) to a
  // creature in it. Rides the persistent weapon-rider path (Divine Favor).
  // Simplified to a flat +2d8 on every hit (the in-Emanation gate + Difficult
  // Terrain are deferred; element defaults to Fire — picker deferred).
  conjure_minor_elementals: {
    id: 'conjure_minor_elementals',
    name: 'Conjure Minor Elementals',
    level: 4,
    castTime: 'action',
    targetType: 'self',
    rangeKind: 'self',
    concentration: true,
    durationRounds: 100,
    weaponRider: { dice: '2d8', damageType: 'fire', persistent: true },
    desc: 'Elemental spirits swirl around you (Concentration, up to 10 minutes): each of your weapon hits deals an extra 2d8 Fire damage. (RAW: only vs creatures in the 15-ft Emanation, your choice of Acid/Cold/Fire/Lightning, plus Difficult Terrain for enemies — simplified here.)',
    narrative: '{name} is wreathed by darting elemental spirits.',
    spellList: ['arcane', 'primal'],
  },

  // SRD: Conjure Woodland Beings (L4) — nature spirits flit around you in a 10-ft
  // Emanation; a creature entering / ending its turn there makes a WIS save,
  // taking 5d8 Force (half on a success). A `rangeKind: 'self'` zone → a
  // caster-following aura (Spirit Guardians). (Disengage-as-Bonus is deferred.)
  conjure_woodland_beings: {
    id: 'conjure_woodland_beings',
    name: 'Conjure Woodland Beings',
    level: 4,
    castTime: 'action',
    persistentZone: true,
    savingThrow: 'wis',
    saveEffect: 'half',
    damage: '5d8',
    damageType: 'force',
    upcastBonus: '1d8',
    concentration: true,
    durationRounds: 100,
    blastRadius: 10,
    aoeShape: 'sphere',
    rangeKind: 'self',
    desc: 'Nature spirits flit in a 10-ft aura around you: a creature that enters or ends its turn there makes a Wisdom save, taking 5d8 Force damage (half on a success; +1d8 per slot above 4th). Concentration, up to 10 minutes.',
    narrative: '{name} is encircled by flitting woodland spirits.',
    spellList: ['primal'],
  },

  // SRD: Conjure Elemental (L5) — a Large elemental spirit (placed); a creature
  // entering / starting near it makes a DEX save or takes 8d8 of the spirit's
  // type and is Restrained. Rides the placed damage-zone path. The Restrained
  // (save-ends, 4d8/turn) rider + the element picker are deferred (defaults Fire).
  conjure_elemental: {
    id: 'conjure_elemental',
    name: 'Conjure Elemental',
    level: 5,
    castTime: 'action',
    persistentZone: true,
    savingThrow: 'dex',
    saveEffect: 'negates',
    damage: '8d8',
    damageType: 'fire',
    upcastBonus: '1d8',
    concentration: true,
    durationRounds: 100,
    blastRadius: 5,
    aoeShape: 'sphere',
    rangeKind: 'ranged',
    rangeFt: 60,
    desc: 'A Large elemental spirit appears: a creature entering or starting near it makes a Dexterity save or takes 8d8 Fire damage (+1d8 per slot above 5th). (RAW: choose the element, and a failed save also Restrains — deferred here.) Concentration, up to 10 minutes.',
    narrative: '{name} tears open a rift and a raging elemental spirit pours through.',
    spellList: ['arcane', 'primal'],
  },

  // SRD: Conjure Fey (L6) — a Feywild spirit; on appearing (and as a Bonus Action
  // on later turns, teleporting up to 30 ft) it makes a melee spell attack for
  // 3d12 + spellcasting modifier Psychic. Rides the recurring-spell-attack path
  // (Spiritual Weapon). The on-hit Frightened rider is deferred.
  conjure_fey: {
    id: 'conjure_fey',
    name: 'Conjure Fey',
    level: 6,
    castTime: 'action',
    recurringAttack: true,
    recurringAttackCost: 'bonus_action',
    recurringAddSpellMod: true,
    damage: '3d12',
    damageType: 'psychic',
    upcastBonus: '1d12',
    concentration: true,
    durationRounds: 100,
    rangeKind: 'ranged',
    rangeFt: 60,
    desc: 'A Feywild spirit appears and strikes: a melee spell attack for 3d12 + your spellcasting modifier Psychic damage, repeatable each turn as a Bonus Action (+1d12 per slot above 6th). (RAW on-hit Frightened is narrated.) Concentration, up to 10 minutes.',
    narrative: '{name} calls a capering fey spirit that lunges at the foe.',
    spellList: ['primal'],
  },

  // SRD: Conjure Celestial (L7) — a pillar of light (movable 30 ft); a creature in
  // it can be bathed in Searing Light (DEX save, 6d12 Radiant, half on a success)
  // or Healing Light (heal allies). Rides the placed, repositionable damage-zone
  // path (Searing Light vs enemies); the ally-healing mode is deferred.
  conjure_celestial: {
    id: 'conjure_celestial',
    name: 'Conjure Celestial',
    level: 7,
    castTime: 'action',
    persistentZone: true,
    savingThrow: 'dex',
    saveEffect: 'half',
    damage: '6d12',
    damageType: 'radiant',
    upcastBonus: '1d12',
    concentration: true,
    durationRounds: 100,
    blastRadius: 10,
    aoeShape: 'sphere',
    zoneMoveFt: 30,
    zoneMoveCost: 'bonus_action',
    rangeKind: 'ranged',
    rangeFt: 90,
    desc: 'A pillar of celestial light: a creature within it makes a Dexterity save, taking 6d12 Radiant damage (half on a success; +1d12 per slot above 7th). You can move the pillar 30 ft. (RAW Healing-Light mode for allies is deferred.) Concentration, up to 10 minutes.',
    narrative: '{name} calls down a searing pillar of celestial light.',
    spellList: ['divine'],
  },

  // ─── Spell batch: a force blade, an animated crew, a steed, a maze, and a
  // mind-blasting nuke ────────────────────────────────────────────────────

  // SRD: Arcane Sword — a spectral blade of force. RE-4 recurring spell attack:
  // the initial cast (an Action) makes a melee spell attack for 4d12 + your
  // spellcasting modifier Force; on each later turn a Bonus Action repositions
  // it and repeats the attack. Concentration, up to 1 minute. (No upcast — RAW
  // doesn't scale it by slot.) Gives arcane casters the recurring-attack option
  // divine casters already get from Spiritual Weapon.
  arcane_sword: {
    id: 'arcane_sword',
    name: 'Arcane Sword',
    level: 7,
    castTime: 'action',
    concentration: true,
    durationRounds: 10, // 1 minute, Concentration
    recurringAttack: true,
    recurringAttackCost: 'bonus_action',
    recurringAddSpellMod: true,
    damage: '4d12',
    damageType: 'force',
    rangeKind: 'ranged',
    rangeFt: 90,
    desc: 'Conjure a spectral sword of force (Concentration, up to 1 minute). On the cast, and as a Bonus Action on each later turn, it makes a melee spell attack for 4d12 + your spellcasting modifier Force damage.',
    spellList: ['arcane'],
  },

  // SRD: Animate Objects — animate a crew of objects as Construct allies.
  // Pansori summon model: the animated objects join your NEXT battle as ally
  // combatants (Animated Object stat block — AC 15, 10 HP, Slam 1d4 + your spell
  // mod Force). The count equals your spellcasting modifier (`countFromSpellMod`),
  // +2 per slot level above 5th. Cast before the fight — the crew materializes at
  // combat start.
  animate_objects: {
    id: 'animate_objects',
    name: 'Animate Objects',
    level: 5,
    castTime: 'action',
    outOfCombatOnly: true,
    desc: 'Out of combat, animate a number of objects equal to your spellcasting modifier (two more per slot level above 5th). Each becomes an Animated Object (AC 15, 10 HP, Slam 1d4+4 Force) that fights at your side and joins your next battle.',
    spellList: ['arcane'],
    summon: {
      name: 'Animated Object',
      ac: 15,
      maxHp: 10,
      toHit: 6,
      damage: '1d4+4',
      countFromSpellMod: true,
      countPerUpcastLevel: 2,
    },
  },

  // SRD: Find Steed — summon a loyal otherworldly steed (Paladin). Pansori
  // mounted combat: the steed materializes at the next battle's start already
  // bearing its rider (`isMount`) and fights as an ally (Otherworldly Steed at
  // 2nd level — AC 12, 25 HP, Speed 60). Cast before the fight. (RAW's
  // controlled-mount action limits are not modeled; the steed fights as an
  // ally combatant.)
  find_steed: {
    id: 'find_steed',
    name: 'Find Steed',
    level: 2,
    castTime: 'action',
    outOfCombatOnly: true,
    desc: 'Out of combat, summon a loyal otherworldly steed (AC 12, 25 HP, Speed 60) that bears you into your next battle and fights at your side as a mount.',
    spellList: ['divine'],
    summon: {
      name: 'Otherworldly Steed',
      ac: 12,
      maxHp: 25,
      toHit: 5,
      damage: '1d8+4',
      isMount: true,
      speed: 60,
    },
  },

  // SRD: Maze — banish a creature into a labyrinthine demiplane (Concentration,
  // up to 10 minutes). RAW: no entry save; the target escapes with a DC 20
  // Intelligence (Investigation) check via the Study action. Pansori models the
  // escape as a recurring INT save (the caster's spell DC) at the end of each of
  // the target's turns, and — for engine uniformity with our other removal spell
  // (Banishment) — gates the initial banish on that same INT save. While mazed
  // the target is `banished` (removed from combat); it returns when concentration
  // ends.
  maze: {
    id: 'maze',
    name: 'Maze',
    level: 8,
    castTime: 'action',
    concentration: true,
    durationRounds: 100, // 10 minutes
    savingThrow: 'int',
    saveEffect: 'negates',
    condition: 'banished',
    conditionDuration: 100,
    conditionSaveEnds: true,
    rangeKind: 'ranged',
    rangeFt: 60,
    desc: 'Banish a creature within 60 ft into a labyrinthine demiplane (INT save negates). While mazed it is removed from the fight, repeating the INT save at the end of each of its turns to escape. Concentration, up to 10 minutes.',
    narrative:
      '{name} folds the air into an impossible corridor — {target} stumbles into a maze with no walls and is gone.',
    spellList: ['arcane'],
  },

  // SRD: Befuddlement — blast a creature's mind (INT save). On a failure: 10d12
  // Psychic damage and the target can't cast spells or take the Magic action
  // (RAW: it re-saves only every 30 days — effectively permanent in a fight).
  // Pansori has no cast-only lockout, so the rider is approximated with the
  // `incapacitated` condition (a superset — it also stops the target's other
  // actions). On a successful save the target takes half damage only (no
  // condition).
  befuddlement: {
    id: 'befuddlement',
    name: 'Befuddlement',
    level: 8,
    castTime: 'action',
    savingThrow: 'int',
    saveEffect: 'half',
    damage: '10d12',
    damageType: 'psychic',
    condition: 'incapacitated',
    conditionDuration: 100,
    rangeKind: 'ranged',
    rangeFt: 150,
    desc: "Blast a creature's mind (INT save). On a failure it takes 10d12 psychic damage and is incapacitated, unable to focus enough to act; on a success, half damage only.",
    narrative: "{name} drives a spike of raw thought into {target}'s mind.",
    spellList: ['arcane', 'primal'],
  },

  // ─── Spell batch: a beast charm, an insect summon, and two protective wards ──

  // SRD: Animal Friendship — soothe a Beast (WIS save negates → Charmed for the
  // duration; a charmed creature won't attack the caster). RAW targets only
  // Beasts; pansori doesn't gate spell targets by creature type, so the
  // beast-only restriction is narrated. Non-concentration (24-hour duration ≈
  // the rest of the fight).
  animal_friendship: {
    id: 'animal_friendship',
    name: 'Animal Friendship',
    level: 1,
    castTime: 'action',
    savingThrow: 'wis',
    saveEffect: 'negates',
    condition: 'charmed',
    conditionDuration: 100,
    rangeKind: 'ranged',
    rangeFt: 30,
    desc: "Gentle a beast within 30 ft (WIS save negates). On a failure it is Charmed and won't attack you for the duration. (RAW targets only Beasts.)",
    narrative: '{name} murmurs a gentling word; the {target} calms, no longer keen to attack.',
    spellList: ['arcane', 'primal'],
  },

  // SRD: Giant Insect — summon a giant centipede, spider, or wasp. Pansori
  // summon model: the insect joins your NEXT battle as a beast ally (Giant
  // Insect stat block at 4th level — AC 15, 30 HP, Poison Jab 1d6+7 piercing).
  // Cast before the fight; the form is a cosmetic variant. (RAW's multiattack,
  // the +1d4 poison rider, and the Spider's Web Bolt are deferred/narrated.)
  giant_insect: {
    id: 'giant_insect',
    name: 'Giant Insect',
    level: 4,
    castTime: 'action',
    outOfCombatOnly: true,
    desc: 'Out of combat, summon a giant insect — a beast ally (AC 15, 30 HP, Poison Jab 1d6+7 piercing) that fights at your side and joins your next battle.',
    spellList: ['primal'],
    summon: {
      name: 'Giant Insect',
      ac: 15,
      maxHp: 30,
      toHit: 6,
      damage: '1d6+7',
      variants: [
        { name: 'Giant Wasp', ac: 15, maxHp: 30, toHit: 6, damage: '1d6+7' },
        { name: 'Giant Spider', ac: 15, maxHp: 30, toHit: 6, damage: '1d6+7' },
        { name: 'Giant Centipede', ac: 15, maxHp: 30, toHit: 6, damage: '1d6+7' },
      ],
    },
  },

  // SRD: Warding Bond — bond with a willing ally (touch): for the duration they
  // gain Resistance to all damage. Non-concentration (1 hour ≈ the fight); the
  // resistance clears at combat end. (RAW also grants +1 AC / +1 saves and
  // shares half the ally's damage back to the caster — simplified/narrated; the
  // worn platinum rings are a reusable focus, not consumed.)
  warding_bond: {
    id: 'warding_bond',
    name: 'Warding Bond',
    level: 2,
    castTime: 'action',
    targetType: 'self_or_ally',
    grantResistances: [
      'acid',
      'bludgeoning',
      'cold',
      'fire',
      'force',
      'lightning',
      'necrotic',
      'piercing',
      'poison',
      'psychic',
      'radiant',
      'slashing',
      'thunder',
    ],
    rangeKind: 'touch',
    desc: 'Touch a willing ally to forge a warding bond: they gain Resistance to all damage for the fight.',
    narrative: '{name} forges a warding bond — {target} is sheathed against all harm.',
    spellList: ['divine'],
  },

  // SRD: Aura of Life — a life-warding aura (Concentration). You gain Resistance
  // to Necrotic damage and your Hit Point maximum can't be reduced. (RAW the
  // 30-ft emanation extends this to allies and revives a 0-HP ally to 1 HP each
  // turn — simplified here to the caster's necrotic resistance; the HP-max and
  // ally-revive halves are deferred/narrated.)
  aura_of_life: {
    id: 'aura_of_life',
    name: 'Aura of Life',
    level: 4,
    castTime: 'action',
    targetType: 'self',
    concentration: true,
    durationRounds: 100, // 10 minutes
    grantResistances: ['necrotic'],
    rangeKind: 'self',
    desc: 'Kindle a warding aura of life: you gain Resistance to Necrotic damage for the duration. Concentration, up to 10 minutes.',
    narrative: '{name} kindles a warding aura of life.',
    spellList: ['divine'],
  },

  // ─── Spell batch: condition-immunity wards ───────────────────────────────────

  // SRD: Freedom of Movement — touch a willing ally: for the duration, magical
  // effects can't Paralyze, Restrain, or hold (Grapple) them, and difficult
  // terrain doesn't slow them. Grants those condition immunities via the buff
  // path; the engine then blocks them from landing AND frees the target of any
  // already in effect. Non-concentration (cleared at combat end). (The
  // difficult-terrain + auto-escape-nonmagical-restraints halves are narrated.)
  freedom_of_movement: {
    id: 'freedom_of_movement',
    name: 'Freedom of Movement',
    level: 4,
    castTime: 'action',
    targetType: 'self_or_ally',
    grantsConditionImmunities: ['paralyzed', 'restrained', 'grappled'],
    rangeKind: 'touch',
    desc: "Touch a willing ally: for the fight they can't be Paralyzed, Restrained, or Grappled, and difficult terrain doesn't slow them.",
    narrative: '{name} blesses {target} with unfettered freedom of movement.',
    spellList: ['arcane', 'divine', 'primal'],
  },

  // SRD: Mind Blank — touch a willing ally: for the duration they have Immunity
  // to the Charmed condition (and to Psychic damage + magical detection — those
  // halves are narrated/deferred). Grants Charmed immunity via the buff path.
  // Non-concentration (cleared at combat end).
  mind_blank: {
    id: 'mind_blank',
    name: 'Mind Blank',
    level: 8,
    castTime: 'action',
    targetType: 'self_or_ally',
    grantsConditionImmunities: ['charmed'],
    rangeKind: 'touch',
    desc: "Touch a willing ally to seal their mind: for the fight they can't be Charmed. (RAW also grants immunity to psychic damage and to magical mind-reading / detection.)",
    narrative: "{name} seals {target}'s mind against all intrusion.",
    spellList: ['arcane'],
  },

  // ─── Spell batch: Abjuration wards + high-level utility ──────────────────────
  // Iconic SRD abjurations and a divination/conjuration pair that round out the
  // utility roster. Most are narrated (pansori doesn't model ongoing enemy
  // enchantments to dispel, scry-able auras, or planar trap glyphs); Heroes'
  // Feast lands mechanically as a max-HP + immunity buff via the buff path.

  // SRD: Dispel Magic (L3 Abjuration) — end one ongoing spell effect on a target
  // (auto for slot ≥ the effect's level; an ability check vs DC 10 + level
  // otherwise). Pansori doesn't track removable enemy enchantments, so which
  // effect ends is narrated — like Counterspell, the entry is the surface.
  dispel_magic: {
    id: 'dispel_magic',
    name: 'Dispel Magic',
    level: 3,
    castTime: 'action',
    rangeKind: 'ranged',
    rangeFt: 120,
    desc: 'Choose one creature, object, or magical effect within range; any spell of 3rd level or lower on it ends. For a higher-level effect, make an ability check (DC 10 + that spell’s level) for each. Which lingering magic unravels is narrated.',
    narrative: '{name} speaks a word of unmaking and the weave of a nearby spell frays apart.',
    spellList: ['arcane', 'divine', 'primal'],
  },

  // SRD: Glyph of Warding (L3 Abjuration) — 1-hour cast inscribing a stored
  // trap/spell glyph. Out-of-combat ritual-style prep; narrated.
  glyph_of_warding: {
    id: 'glyph_of_warding',
    name: 'Glyph of Warding',
    level: 3,
    castTime: 'action', // RAW 1 hour — gated to out-of-combat below
    outOfCombatOnly: true,
    rangeKind: 'touch',
    materialCost: 200,
    desc: 'You inscribe a hidden glyph that triggers when a condition you set is met (a creature approaches, opens a warded object, etc.), unleashing a stored burst of damage or a stored spell. Placement and trigger are narrated.',
    narrative:
      '{name} traces a glyph in powdered diamond; it flares once, then fades from sight, waiting.',
    spellList: ['arcane', 'divine'],
  },

  // SRD: Hallow (L5 Abjuration) — 24-hour cast that consecrates an area with a
  // warding effect + tied guard. Out-of-combat consecration; narrated.
  hallow: {
    id: 'hallow',
    name: 'Hallow',
    level: 5,
    castTime: 'action', // RAW 24 hours — gated to out-of-combat
    outOfCombatOnly: true,
    rangeKind: 'touch',
    materialCost: 1000,
    desc: 'You suffuse an area with sacred (or profane) power: specified creature types can’t enter or charm/frighten/possess those within, and you bind one extra guarding effect. The consecration is narrated.',
    narrative: '{name} censes the ground for an age; the very air turns hallowed and still.',
    spellList: ['divine'],
  },

  // SRD: Forbiddance (L6 Abjuration, ritual) — wards a region against planar
  // travel and damages chosen creature types that enter. Out-of-combat ritual;
  // narrated.
  forbiddance: {
    id: 'forbiddance',
    name: 'Forbiddance',
    level: 6,
    castTime: 'action', // RAW 10 minutes / ritual — gated to out-of-combat
    outOfCombatOnly: true,
    ritualCasting: true,
    rangeKind: 'touch',
    materialCost: 1000,
    desc: 'You ward an area for a day against magical entry (teleport / planar travel fails) and sear chosen creature types that try to enter. The boundary is narrated.',
    narrative:
      '{name} walks the perimeter scattering ruby dust; an unseen wall seals the ground against intrusion.',
    spellList: ['divine'],
  },

  // SRD: True Seeing (L6 Divination) — touch; for 1 hour the target gains
  // Truesight 120 ft (sees in darkness, through illusions/invisibility, into the
  // Ethereal). Like See Invisibility, the reveal is narrated, not modeled.
  true_seeing: {
    id: 'true_seeing',
    name: 'True Seeing',
    level: 6,
    castTime: 'action',
    rangeKind: 'touch',
    materialCost: 25,
    desc: 'For 1 hour the touched creature gains Truesight out to 120 ft: it sees in normal and magical darkness, spots Invisible creatures and objects, sees through illusions, and perceives into the Ethereal Plane. The reveal is narrated, not modeled mechanically.',
    narrative: "{name} dusts {target}'s eyes; every lie of shadow and glamour falls away.",
    spellList: ['arcane', 'divine'],
  },

  // SRD: Heroes' Feast (L6 Conjuration) — a feast (1 hour to consume) that, for
  // 24 hours, grants each partaker Poison resistance, immunity to Frightened +
  // Poisoned, and +2d10 max HP (and that many HP). Out-of-combat prep; modeled
  // as a single-target buff (RAW feeds up to twelve) via the buff path. The 2d10
  // max-HP bump is fixed to its average (11), as Aid fixes its +5.
  heroes_feast: {
    id: 'heroes_feast',
    name: "Heroes' Feast",
    level: 6,
    castTime: 'action', // RAW 10 minutes to cast + 1 hour to consume
    outOfCombatOnly: true,
    targetType: 'self_or_ally',
    materialCost: 1000,
    maxHpBonus: 11, // RAW 2d10, fixed to average (cf. Aid's fixed +5)
    grantResistances: ['poison'],
    grantsConditionImmunities: ['frightened', 'poisoned'],
    rangeKind: 'touch',
    desc: 'A magical feast steels those who partake: for 24 hours they gain Resistance to poison damage, Immunity to the Frightened and Poisoned conditions, and +11 (RAW 2d10) maximum and current HP. Pansori feeds one chosen ally (RAW up to twelve).',
    narratives: {
      cast: [
        '{name} conjures a groaning board of fare; {target} eats deep and rises emboldened',
        "{name}'s feast fills {target} with warmth and unshakable courage",
      ],
    },
    spellList: ['arcane', 'divine', 'primal'],
  },
};
