import { SRD_MONSTERS } from './monsters.js';
import type { Spell } from '../../types.js';

// SRD 5.2.1 magic items whose activated effect isn't a spell — the Wand of
// Paralysis' ray, the Horn of Blasting's cone, a Bead of Force. Each is
// modeled as a spell-shaped `itemPower` so it resolves through the spell
// engine (attack roll / save / AoE / save-ends conditions), but it is on no
// class list and lives outside the spell table: it can only be used through
// its item (`ItemSpell.spellId`). Descriptions are our own words.

const power = (p: Omit<Spell, 'castTime' | 'itemPower'>): Spell => ({
  castTime: 'action',
  itemPower: true,
  ...p,
});

type Summon = NonNullable<Spell['summon']>;

/** A summon block from an SRD bestiary entry (one attack line; Multiattack aside). */
function creature(key: string, more: Partial<Summon> = {}): Summon {
  const m = SRD_MONSTERS[key];
  if (!m) throw new Error(`itemPowers: unknown monster ${key}`);
  return { name: m.name, ac: m.ac, maxHp: m.hp, toHit: m.toHit, damage: m.damage, ...more };
}

/**
 * An item that calls a creature to fight beside the party (out of combat; it
 * joins the next battle). Item creatures revert at the next Long Rest, and
 * using the item again replaces the earlier one.
 */
const summonPower = (id: string, name: string, summon: Summon, desc: string): Spell =>
  power({ id, name, level: 1, outOfCombatOnly: true, summon, desc });

export const ITEM_POWERS: Record<string, Spell> = {
  // ── Summoning items ───────────────────────────────────────────────────────
  // SRD Figurines of Wondrous Power.
  figurine_bronze_griffon: summonPower(
    'figurine_bronze_griffon',
    'Bronze Griffon',
    creature('griffon'),
    'The statuette becomes a Griffon that fights beside you.'
  ),
  // The Ebony Fly's Giant Fly has no attacks: a non-combatant mount.
  figurine_ebony_fly: summonPower(
    'figurine_ebony_fly',
    'Ebony Fly',
    {
      name: 'Giant Fly',
      ac: 11,
      maxHp: 19,
      toHit: 0,
      damage: '0',
      noAttack: true,
      isMount: true,
      speed: 30,
    },
    'The statuette becomes a Giant Fly you can ride.'
  ),
  figurine_golden_lions: summonPower(
    'figurine_golden_lions',
    'Golden Lions',
    creature('lion', { baseCount: 2 }),
    'The pair of statuettes become two Lions that fight beside you.'
  ),
  figurine_marble_elephant: summonPower(
    'figurine_marble_elephant',
    'Marble Elephant',
    creature('elephant'),
    'The statuette becomes an Elephant that fights beside you.'
  ),
  // Simplification: the Obsidian Steed's 10 percent chance to ignore orders
  // (and the ride to Hades) isn't modeled. It fights only to defend itself.
  figurine_obsidian_steed: summonPower(
    'figurine_obsidian_steed',
    'Obsidian Steed',
    creature('nightmare', { noAttack: true, isMount: true, speed: 60 }),
    'The statuette becomes a Nightmare you can ride; it fights only to defend itself.'
  ),
  figurine_onyx_dog: summonPower(
    'figurine_onyx_dog',
    'Onyx Dog',
    creature('mastiff'),
    'The statuette becomes a Mastiff that fights beside you.'
  ),
  figurine_serpentine_owl: summonPower(
    'figurine_serpentine_owl',
    'Serpentine Owl',
    creature('giant_owl'),
    'The statuette becomes a Giant Owl that fights beside you.'
  ),
  figurine_silver_raven: summonPower(
    'figurine_silver_raven',
    'Silver Raven',
    creature('raven'),
    'The statuette becomes a Raven that fights beside you.'
  ),
  // SRD Horn of Valhalla — Berserker spirits (2 / 3 / 4 / 5 by metal).
  ...Object.fromEntries(
    (
      [
        ['silver', 2],
        ['brass', 3],
        ['bronze', 4],
        ['iron', 5],
      ] as const
    ).map(([metal, n]) => [
      `valhalla_${metal}`,
      summonPower(
        `valhalla_${metal}`,
        'Warrior Spirits',
        creature('berserker', { baseCount: n }),
        `${n} Berserker spirits from Ysgard fight beside you.`
      ),
    ])
  ),
  // SRD Bowl / Brazier / Censer / Stone of commanding elementals, and the
  // Elemental Gems.
  ...Object.fromEntries(
    ['air', 'earth', 'fire', 'water'].map((el) => [
      `summon_${el}_elemental`,
      summonPower(
        `summon_${el}_elemental`,
        `${el.charAt(0).toUpperCase()}${el.slice(1)} Elemental`,
        creature(`${el}_elemental`),
        `${el === 'air' || el === 'earth' ? 'An' : 'A'} ${el} elemental answers the call and fights beside you.`
      ),
    ])
  ),
  // Simplification: the djinni needs no Concentration, and the 5 percent chance
  // it leaves for good isn't modeled.
  djinni_summoning: summonPower(
    'djinni_summoning',
    'Djinni',
    creature('djinni'),
    'A Djinni from the Elemental Plane of Air arrives to serve you.'
  ),
  // Simplification: the staff isn't destroyed when the snake drops to 0 HP.
  python_staff: summonPower(
    'python_staff',
    'Giant Constrictor Snake',
    creature('giant_constrictor_snake'),
    'The staff becomes a Giant Constrictor Snake that fights beside you.'
  ),

  // ── Attack and control powers ─────────────────────────────────────────────
  // SRD Wand of Paralysis — a ray: Con save or Paralyzed for 1 minute, saving
  // again at the end of each of its turns.
  paralysis_ray: power({
    id: 'paralysis_ray',
    name: 'Paralysis Ray',
    level: 2,
    savingThrow: 'con',
    saveEffect: 'negates',
    condition: 'paralyzed',
    conditionDuration: 10,
    conditionSaveEnds: true,
    rangeKind: 'ranged',
    rangeFt: 60,
    targetType: 'enemy',
    desc: 'A thin blue ray: Constitution save or Paralyzed for 1 minute (save again at the end of each turn).',
  }),
  // SRD Ring of the Ram — a spectral ram's head; 2d10 Force per charge spent.
  // Simplification: the 5-ft-per-charge push and the object-breaking use
  // aren't modeled.
  ram_strike: power({
    id: 'ram_strike',
    name: "Ram's Head",
    level: 1,
    attackRoll: true,
    damage: '2d10',
    damageType: 'force',
    upcastBonus: '2d10',
    rangeKind: 'ranged',
    rangeFt: 60,
    targetType: 'enemy',
    desc: 'A spectral ram charges one creature (ranged attack +7): 2d10 Force per charge spent.',
  }),
  // SRD Horn of Blasting — a 30-ft Cone: Con save, 5d8 Thunder and Deafened
  // for 1 minute on a failure, half damage only on a success.
  horn_blast: power({
    id: 'horn_blast',
    name: 'Horn Blast',
    level: 3,
    damage: '5d8',
    damageType: 'thunder',
    savingThrow: 'con',
    saveEffect: 'half',
    condition: 'deafened',
    conditionDuration: 10,
    blastRadius: 30,
    aoeShape: 'cone',
    rangeKind: 'self',
    desc: 'A thunderous 30-foot cone: Constitution save, 5d8 Thunder and Deafened for 1 minute (half damage only on a success).',
  }),
  // SRD Bead of Force — a 10-ft-radius Sphere: Dex save or 5d4 Force.
  // Simplification: the force sphere that traps the creatures that failed
  // isn't modeled.
  force_bead: power({
    id: 'force_bead',
    name: 'Bead of Force',
    level: 3,
    damage: '5d4',
    damageType: 'force',
    savingThrow: 'dex',
    saveEffect: 'negates',
    blastRadius: 10,
    aoeShape: 'sphere',
    rangeKind: 'ranged',
    rangeFt: 60,
    desc: 'Explodes in a 10-foot-radius sphere: Dexterity save or 5d4 Force.',
  }),
  // SRD Pipes of Haunting — each chosen creature within 30 ft: Wis save or
  // Frightened for 1 minute (save again each turn). Simplification: the
  // 24-hour immunity after a success isn't tracked.
  haunting_tune: power({
    id: 'haunting_tune',
    name: 'Haunting Tune',
    level: 2,
    savingThrow: 'wis',
    saveEffect: 'negates',
    condition: 'frightened',
    conditionDuration: 10,
    conditionSaveEnds: true,
    aoeCondition: true,
    blastRadius: 30,
    aoeShape: 'sphere',
    rangeKind: 'self',
    desc: 'An eerie tune: each enemy within 30 feet makes a Wisdom save or is Frightened for 1 minute (save again each turn).',
  }),
  // SRD Rod of Rulership — each chosen creature within 120 ft: Wis save or
  // Charmed for 8 hours. Simplification: the charm doesn't end early when the
  // party harms the creature.
  rulership: power({
    id: 'rulership',
    name: 'Command Obedience',
    level: 4,
    savingThrow: 'wis',
    saveEffect: 'negates',
    condition: 'charmed',
    conditionDuration: 4800,
    aoeCondition: true,
    blastRadius: 120,
    aoeShape: 'sphere',
    rangeKind: 'self',
    desc: 'Each enemy within 120 feet makes a Wisdom save or is Charmed by you for 8 hours.',
  }),
  // SRD Ring of Shooting Stars — 1 to 3 motes, each a 15-ft Cube: Dex save,
  // 5d4 Radiant (half on a success). Simplification: every mote lands on the
  // same point (one cube, 5d4 per charge).
  shooting_stars: power({
    id: 'shooting_stars',
    name: 'Shooting Stars',
    level: 1,
    damage: '5d4',
    damageType: 'radiant',
    upcastBonus: '5d4',
    savingThrow: 'dex',
    saveEffect: 'half',
    blastRadius: 15,
    aoeShape: 'cube',
    rangeKind: 'ranged',
    rangeFt: 60,
    desc: 'Motes of light burst in a 15-foot cube: Dexterity save, 5d4 Radiant per mote (half on a success).',
  }),

  // ── Utility and travel items ──────────────────────────────────────────────
  // SRD Feather Token (Bird) — a Roc that can't attack, carrying the party.
  feather_bird: summonPower(
    'feather_bird',
    'Feather Bird',
    creature('roc', { noAttack: true, isMount: true }),
    'The token becomes an enormous bird (a Roc that can’t attack) you can ride.'
  ),
  // SRD Rope of Entanglement — DC 15 Dexterity save or Restrained. Simplification:
  // the target's escape check is its end-of-turn save, and the rope's own AC / HP
  // aren't modeled.
  entangle_rope: power({
    id: 'entangle_rope',
    name: 'Entangle',
    level: 1,
    savingThrow: 'dex',
    saveEffect: 'negates',
    condition: 'restrained',
    conditionDuration: 10,
    conditionSaveEnds: true,
    rangeKind: 'ranged',
    rangeFt: 20,
    targetType: 'enemy',
    desc: 'The rope darts out at a creature within 20 feet: Dexterity save or Restrained (it tries to break free at the end of each of its turns).',
  }),
  // SRD Dust of Dryness — a pinch on a creature made mostly of water: Con save,
  // 10d6 Necrotic (half on a success).
  dryness_dust: power({
    id: 'dryness_dust',
    name: 'Dust of Dryness',
    level: 1,
    damage: '10d6',
    damageType: 'necrotic',
    savingThrow: 'con',
    saveEffect: 'half',
    rangeKind: 'touch',
    targetType: 'enemy',
    onlyVs: ['Water Elemental'],
    desc: 'A pinch on a creature made mostly of water within 5 feet: Constitution save, 10d6 Necrotic (half on a success).',
  }),
  // SRD Decanter of Endless Water (Geyser) — one creature in a 30-ft Line: Str
  // save or 1d4 Bludgeoning and Prone. Simplification: aimed at one creature
  // within 30 ft; the Splash and Fountain commands are table color.
  geyser: power({
    id: 'geyser',
    name: 'Geyser',
    level: 1,
    damage: '1d4',
    damageType: 'bludgeoning',
    savingThrow: 'str',
    saveEffect: 'negates',
    condition: 'prone',
    rangeKind: 'ranged',
    rangeFt: 30,
    targetType: 'enemy',
    desc: 'Thirty gallons of water gush out in a line: one creature makes a Strength save or takes 1d4 Bludgeoning and falls Prone.',
  }),
  // SRD Gem of Brightness — a beam (1 charge) or a 30-ft Cone flare (5 charges):
  // Con save or Blinded for 1 minute, saving again at the end of each turn.
  brightness_beam: power({
    id: 'brightness_beam',
    name: 'Brilliant Beam',
    level: 1,
    savingThrow: 'con',
    saveEffect: 'negates',
    condition: 'blinded',
    conditionDuration: 10,
    conditionSaveEnds: true,
    rangeKind: 'ranged',
    rangeFt: 60,
    targetType: 'enemy',
    desc: 'A beam of light at one creature within 60 feet: Constitution save or Blinded for 1 minute (save again at the end of each turn).',
  }),
  brightness_flare: power({
    id: 'brightness_flare',
    name: 'Blinding Flare',
    level: 1,
    savingThrow: 'con',
    saveEffect: 'negates',
    condition: 'blinded',
    conditionDuration: 10,
    conditionSaveEnds: true,
    aoeCondition: true,
    blastRadius: 30,
    aoeShape: 'cone',
    rangeKind: 'self',
    desc: 'A flare of light in a 30-foot cone: each creature makes a Constitution save or is Blinded for 1 minute (save again at the end of each turn).',
  }),
  // SRD Iron Bands — a ranged attack (Dex + Proficiency Bonus): Restrained on a
  // hit; a DC 20 Strength check breaks free. Simplification: the escape check is
  // made at the end of each of the target's turns, and a success doesn't
  // destroy the bands (a failure doesn't lock out retries for a day); the
  // Huge-or-smaller limit isn't checked.
  iron_bands: power({
    id: 'iron_bands',
    name: 'Iron Bands',
    level: 1,
    attackRoll: true,
    condition: 'restrained',
    conditionDuration: 10,
    conditionEscape: { ability: 'str', dc: 20 },
    rangeKind: 'ranged',
    rangeFt: 60,
    targetType: 'enemy',
    desc: 'Hurl the sphere at a creature within 60 feet (ranged attack, Dexterity + Proficiency Bonus): on a hit it is Restrained in iron bands (a DC 20 Strength check breaks free).',
  }),
  // SRD Feather Token (Whip) — a floating whip: a melee spell attack (+9) for 1d6
  // + 5 Force, repeated as a Bonus Action for 1 hour. Simplification: the first
  // strike comes with the throw, and it's treated as within reach of its target.
  feather_whip: power({
    id: 'feather_whip',
    name: 'Floating Whip',
    level: 1,
    attackRoll: true,
    damage: '1d6+5',
    damageType: 'force',
    recurringAttack: true,
    recurringAttackCost: 'bonus_action',
    durationRounds: 600,
    rangeKind: 'ranged',
    rangeFt: 30,
    targetType: 'enemy',
    desc: 'A floating whip lashes a creature (melee spell attack +9, 1d6 + 5 Force) and keeps striking as a Bonus Action for 1 hour.',
  }),

  // ── Unique items ──────────────────────────────────────────────────────────
  // SRD Rod of Lordly Might's Terrify — each creature within 30 ft: DC 17 Wis
  // save or Frightened for 1 minute (save again each turn).
  lordly_terrify: power({
    id: 'lordly_terrify',
    name: 'Terrify',
    level: 3,
    savingThrow: 'wis',
    saveEffect: 'negates',
    condition: 'frightened',
    conditionDuration: 10,
    conditionSaveEnds: true,
    aoeCondition: true,
    blastRadius: 30,
    aoeShape: 'sphere',
    rangeKind: 'self',
    desc: 'Each enemy within 30 feet makes a Wisdom save or is Frightened for 1 minute (save again at the end of each turn).',
  }),
  // SRD Ring of Elemental Command's Elemental Compulsion — an Elemental within 60
  // ft: DC 18 Wis save or Charmed until the start of your next turn.
  // Simplification: you don't steer its move and action; it just won't fight.
  elemental_compulsion: power({
    id: 'elemental_compulsion',
    name: 'Elemental Compulsion',
    level: 1,
    savingThrow: 'wis',
    saveEffect: 'negates',
    condition: 'charmed',
    conditionDuration: 1,
    rangeKind: 'ranged',
    rangeFt: 60,
    targetType: 'enemy',
    onlyVs: ['elemental'],
    desc: 'Compel an Elemental within 60 feet: Wisdom save or Charmed by you until the start of your next turn.',
  }),
  // SRD Helm of Brilliance's fire opal flames — the held weapon burns: +1d6 Fire
  // on a hit until extinguished. Simplification: until the end of the fight.
  helm_flames: power({
    id: 'helm_flames',
    name: 'Blazing Weapon',
    level: 1,
    targetType: 'self',
    rangeKind: 'self',
    weaponRider: { dice: '1d6', damageType: 'fire', persistent: true },
    desc: 'The weapon you hold bursts into harmless flame: +1d6 Fire damage on each hit.',
  }),
  // SRD Manual of Golems — the golem it teaches you to build, which serves for
  // good. Simplification: the work's days pass at once (out of combat).
  ...Object.fromEntries(
    (['clay', 'flesh', 'iron', 'stone'] as const).map((kind) => [
      `build_${kind}_golem`,
      power({
        id: `build_${kind}_golem`,
        name: `Build a ${kind.charAt(0).toUpperCase()}${kind.slice(1)} Golem`,
        level: 5,
        outOfCombatOnly: true,
        summon: creature(`${kind}_golem`, { permanent: true }),
        desc: `Build a ${kind} golem from the manual; it obeys you and serves for good.`,
      }),
    ])
  ),
  // ── Random-table items ────────────────────────────────────────────────────
  // SRD Wand of Wonder — a d100 roll on its table decides what each charge does
  // (`runItemEffect`); the table's own effects are the powers below it.
  wand_of_wonder: power({
    id: 'wand_of_wonder',
    name: 'Wonder',
    level: 1,
    itemEffect: 'wand_of_wonder',
    rangeKind: 'ranged',
    rangeFt: 120,
    targetType: 'enemy',
    desc: 'Point the wand at a spot within 120 feet and see what happens — a roll on the Wand of Wonder table.',
  }),
  // Simplification: the flash catches enemies only, not the wielder's allies.
  wonder_flash: power({
    id: 'wonder_flash',
    name: 'Shimmering Burst',
    level: 1,
    savingThrow: 'con',
    saveEffect: 'negates',
    condition: 'blinded',
    conditionDuration: 10,
    conditionSaveEnds: true,
    aoeCondition: true,
    blastRadius: 30,
    aoeShape: 'sphere',
    rangeKind: 'self',
    desc: 'Colorful light bursts 30 feet out from you: each creature makes a Constitution save or is Blinded for 1 minute (save again at the end of each turn).',
  }),
  // The damage is set per use (1d4 x 10 gems).
  wonder_gems: power({
    id: 'wonder_gems',
    name: 'Stream of Gems',
    level: 1,
    damage: '10',
    damageType: 'bludgeoning',
    rangeKind: 'ranged',
    rangeFt: 30,
    targetType: 'enemy',
    desc: 'A stream of tiny gems pelts a creature, 1 Bludgeoning damage per gem.',
  }),
  wonder_petrify: power({
    id: 'wonder_petrify',
    name: 'Creeping Stone',
    level: 1,
    savingThrow: 'con',
    saveEffect: 'negates',
    condition: 'restrained',
    conditionSaveEnds: true,
    conditionFailInto: 'petrified',
    rangeKind: 'ranged',
    rangeFt: 120,
    targetType: 'enemy',
    desc: 'A creature makes a Constitution save or is Restrained as it begins to turn to stone; if it fails again at the end of its next turn, it is Petrified.',
  }),
  // SRD Bag of Beans — dumped beans burst in a 10-foot Sphere around you (you
  // make the save too); a planted bean grows into something off its table.
  beans_dump: power({
    id: 'beans_dump',
    name: 'Dump the Beans',
    level: 1,
    itemEffect: 'beans_dump',
    savingThrow: 'dex',
    saveEffect: 'half',
    damage: '5d4',
    damageType: 'force',
    blastRadius: 10,
    aoeShape: 'sphere',
    rangeKind: 'self',
    desc: 'Tip beans out: they explode in a 10-foot Sphere around you. Everyone there, you included, makes a DC 15 Dexterity save, taking 5d4 Force damage (half on a success).',
  }),
  beans_plant: power({
    id: 'beans_plant',
    name: 'Plant a Bean',
    level: 1,
    itemEffect: 'beans_plant',
    outOfCombatOnly: true,
    targetType: 'self',
    rangeKind: 'self',
    desc: 'Plant and water a bean; a minute later something springs up from the ground.',
  }),
  // SRD Bag of Tricks — the fuzzy ball becomes a creature off the bag's d8
  // table. Simplification: as with the other item creatures, it's pulled out
  // between fights and joins the next one (it leaves at the next Long Rest).
  ...Object.fromEntries(
    (
      [
        [
          'gray',
          [
            'weasel',
            'giant_rat',
            'badger',
            'boar',
            'panther',
            'giant_badger',
            'dire_wolf',
            'giant_elk',
          ],
        ],
        [
          'rust',
          ['rat', 'owl', 'mastiff', 'goat', 'giant_goat', 'giant_boar', 'lion', 'brown_bear'],
        ],
        [
          'tan',
          [
            'jackal',
            'ape',
            'baboon',
            'axe_beak',
            'black_bear',
            'giant_weasel',
            'giant_hyena',
            'tiger',
          ],
        ],
      ] as const
    ).map(([color, table]) => [
      `bag_of_tricks_${color}`,
      summonPower(
        `bag_of_tricks_${color}`,
        'Fuzzy Ball',
        { ...creature(table[0]), randomForms: table.map((k) => creature(k)), stacks: true },
        'Pull a fuzzy ball from the bag and toss it: it becomes a creature off the bag’s table (1d8).'
      ),
    ])
  ),
  // SRD Figurine of Wondrous Power (Ivory Goats). Simplification: each goat
  // stays until the next Long Rest (not 3 hours / its charge-hours); the Goat
  // of Terror's horn weapons and fear aura aren't modeled.
  goat_of_travail: summonPower(
    'goat_of_travail',
    'Goat of Travail',
    creature('giant_goat'),
    'The statuette becomes a Giant Goat that fights beside you.'
  ),
  goat_of_traveling: summonPower(
    'goat_of_traveling',
    'Goat of Traveling',
    { ...creature('riding_horse', { isMount: true, speed: 60 }), name: 'Traveling Goat' },
    'The statuette becomes a large goat (a Riding Horse’s statistics) you can ride.'
  ),
  goat_of_terror: summonPower(
    'goat_of_terror',
    'Goat of Terror',
    creature('giant_goat', { noAttack: true, isMount: true, speed: 40 }),
    'The statuette becomes a Giant Goat you can ride; it doesn’t attack.'
  ),
  // SRD Robe of Useful Items — detach a patch and it becomes what it shows. Two
  // each of six fixed patches, plus random ones rolled when torn off.
  ...Object.fromEntries(
    (
      [
        ['lantern', 'Bullseye Lantern'],
        ['dagger', 'Dagger'],
        ['mirror', 'Mirror'],
        ['pole', 'Pole'],
        ['rope', 'Rope'],
        ['sack', 'Sack'],
        ['mystery', 'Mystery Patch'],
      ] as const
    ).map(([key, label]) => [
      `robe_patch_${key}`,
      power({
        id: `robe_patch_${key}`,
        name: `Detach a Patch (${label})`,
        level: 1,
        itemEffect: 'robe_patch',
        targetType: 'self',
        rangeKind: 'self',
        desc:
          key === 'mystery'
            ? 'Tear off one of the odd patches and see what it becomes (1d100).'
            : `Tear off a patch and it becomes a real ${label.toLowerCase()}.`,
      }),
    ])
  ),
  // SRD Deck of Illusions — a card thrown down becomes a harmless illusion of a
  // creature off its table.
  illusion_card: power({
    id: 'illusion_card',
    name: 'Draw an Illusion',
    level: 1,
    itemEffect: 'illusion_card',
    targetType: 'self',
    rangeKind: 'self',
    desc: 'Draw a card at random and throw it down: an illusion of a creature (1d100) forms over it.',
  }),
  // SRD Hat of Many Spells — try to cast a Wizard spell you don't know, with a
  // slot of its level and an Intelligence (Arcana) check; a failure rolls on
  // the hat's table instead.
  hat_of_many_spells: power({
    id: 'hat_of_many_spells',
    name: 'Pull an Unknown Spell',
    level: 1,
    itemEffect: 'hat_spell',
    rangeKind: 'self',
    desc: 'Spend a spell slot and reach into the hat for a Wizard spell you don’t know: an Intelligence (Arcana) check against DC 10 + its level casts it; a failure brings something else out.',
  }),
};
