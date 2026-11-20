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
};
