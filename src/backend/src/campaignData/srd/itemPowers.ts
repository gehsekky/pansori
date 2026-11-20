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

export const ITEM_POWERS: Record<string, Spell> = {
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
