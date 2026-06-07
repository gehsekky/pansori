// SRD bestiary additions — verify the new shared monsters register with their
// SRD 5.2.1 core stat line + the effect fields the engine honors.

import { describe, expect, it } from 'vitest';
import { SRD_MONSTERS } from './monsters.js';

// [id, cr, hp, ac, damage, toHit, xp, multiattack?]
const NEW_MONSTERS: Array<[string, number, number, number, string, number, number, number?]> = [
  ['kobold', 0.125, 7, 14, '1d4+2', 4, 25],
  ['guard', 0.125, 11, 16, '1d6+1', 3, 25],
  ['cultist', 0.125, 9, 12, '1d4+1', 3, 25],
  ['giant_rat', 0.125, 7, 13, '1d4+3', 5, 25],
  ['zombie', 0.25, 15, 8, '1d6+1', 3, 50],
  ['scout', 0.5, 16, 13, '1d6+2', 4, 100, 2],
  ['worg', 0.5, 26, 13, '1d8+3', 5, 100],
  ['gnoll', 0.5, 27, 15, '1d6+2', 4, 100],
  ['black_bear', 0.5, 19, 11, '1d6+2', 4, 100, 2],
  ['dire_wolf', 1, 22, 14, '1d8+3', 5, 200],
  ['specter', 1, 22, 12, '3d6', 4, 200],
  ['animated_armor', 1, 33, 18, '1d6+2', 4, 200, 2],
  ['bandit_captain', 2, 52, 15, '1d6+3', 5, 450, 2],
  ['berserker', 2, 67, 13, '1d12+3', 5, 450],
  ['ghast', 2, 36, 13, '2d6+3', 5, 450],
  ['griffon', 2, 59, 12, '1d8+4', 6, 450, 2],
  ['owlbear', 3, 59, 13, '2d8+5', 7, 700, 2],
  ['manticore', 3, 68, 14, '1d8+3', 5, 700, 3],
  ['wight', 3, 82, 14, '1d8+2', 4, 700, 2],
  ['hippogriff', 1, 26, 11, '1d8+3', 5, 200, 2],
  ['giant_eagle', 1, 26, 13, '1d4+3', 5, 200, 2],
  ['lion', 1, 22, 12, '1d8+3', 5, 200, 2],
  ['bugbear_warrior', 1, 33, 14, '2d6+2', 4, 200],
  ['saber_toothed_tiger', 2, 52, 13, '2d6+4', 6, 450, 2],
  ['giant_boar', 2, 42, 13, '2d6+3', 5, 450],
  ['mummy', 3, 58, 11, '1d10+3', 5, 700, 2],
  ['hill_giant', 5, 105, 13, '3d8+5', 8, 1800, 2],
  ['ettin', 4, 85, 12, '2d8+5', 7, 1100, 2],
  ['gladiator', 5, 112, 16, '2d6+4', 7, 1800, 3],
  ['wraith', 5, 67, 13, '4d8+3', 6, 1800],
  ['fire_elemental', 5, 93, 13, '2d6+3', 6, 1800, 2],
  ['wyvern', 6, 127, 14, '2d6+4', 7, 2300],
  ['stone_giant', 7, 126, 17, '3d10+6', 9, 2900, 2],
  ['giant_ape', 7, 168, 12, '3d10+6', 9, 2900, 2],
  ['frost_giant', 8, 149, 15, '2d12+6', 9, 3900, 2],
  ['fire_giant', 9, 162, 18, '4d6+7', 11, 5000, 2],
  ['cloud_giant', 9, 200, 14, '3d8+8', 12, 5000, 2],
  ['young_red_dragon', 10, 178, 18, '2d6+6', 10, 5900, 3],
  // Batch: martial/beast/monstrosity additions (CR 1/2 → 8).
  ['ape', 0.5, 19, 12, '1d4+3', 5, 100, 2],
  ['tiger', 1, 30, 13, '2d6+3', 5, 200],
  ['spy', 1, 27, 12, '1d6+2', 4, 200],
  ['pegasus', 2, 59, 12, '1d6+4', 6, 450],
  ['giant_constrictor_snake', 2, 60, 12, '2d6+4', 6, 450],
  ['knight', 3, 52, 18, '2d6+3', 5, 700, 2],
  ['doppelganger', 3, 52, 14, '2d6+4', 6, 700, 2],
  ['hell_hound', 3, 58, 15, '1d8+3', 5, 700, 2],
  ['bulette', 5, 94, 17, '2d12+4', 7, 1800, 2],
  ['mammoth', 6, 126, 13, '2d10+7', 10, 2300, 2],
  ['assassin', 8, 97, 16, '1d6+4', 7, 3900, 3],
  // SRD 5.2.1 caster monsters — their concrete attack action (Arcane Burst /
  // Radiant Flame), modeled as native multiattack.
  ['priest', 2, 38, 13, '2d10', 5, 450, 2],
  ['mage', 6, 81, 15, '3d8+3', 6, 2300, 3],
  ['archmage', 12, 170, 17, '4d10+5', 9, 8000, 4],
  // Batch 2026-06: beasts / humanoids / monstrosities / wyrmlings.
  ['hyena', 0, 5, 11, '1d6', 2, 10],
  ['giant_crab', 0.125, 13, 15, '1d6+1', 3, 25],
  ['noble', 0.125, 9, 15, '1d8+1', 3, 25],
  ['constrictor_snake', 0.25, 13, 13, '1d8+2', 4, 50],
  ['giant_wolf_spider', 0.25, 11, 13, '1d4+3', 5, 50],
  ['cockatrice', 0.5, 22, 11, '1d4+1', 3, 100],
  ['crocodile', 0.5, 13, 12, '1d8+2', 4, 100],
  ['tough', 0.5, 32, 12, '1d6+2', 4, 100],
  ['satyr', 0.5, 31, 13, '1d4+3', 5, 100],
  ['giant_hyena', 1, 45, 12, '2d6+3', 5, 200],
  ['merrow', 2, 45, 13, '2d6+4', 6, 450, 2],
  ['mimic', 2, 58, 12, '1d8+3', 5, 450],
  ['awakened_tree', 2, 59, 13, '3d6+4', 6, 450],
  ['white_dragon_wyrmling', 2, 32, 16, '1d8+2', 4, 450, 2],
  ['black_dragon_wyrmling', 2, 33, 17, '1d6+2', 4, 450, 2],
  ['ankheg', 2, 45, 14, '2d6+3', 5, 450],
  ['minotaur', 3, 85, 14, '1d12+4', 6, 700],
  ['giant_scorpion', 3, 52, 15, '1d8+3', 5, 700, 3],
  ['warrior_veteran', 3, 65, 17, '2d6+3', 5, 700, 2],
  // Animals appendix batch (2026-06-07) — the full SRD 5.2.1 animal roster.
  ['baboon', 0, 3, 12, '1', 1, 10],
  ['badger', 0, 5, 11, '1', 2, 10],
  ['bat', 0, 1, 12, '1', 4, 10],
  ['cat', 0, 2, 12, '1', 4, 10],
  ['crab', 0, 3, 11, '1', 2, 10],
  ['deer', 0, 4, 13, '1d4', 2, 10],
  ['eagle', 0, 4, 12, '1d4+2', 4, 10],
  ['frog', 0, 1, 11, '1', 3, 10],
  ['giant_fire_beetle', 0, 4, 13, '1', 1, 10],
  ['goat', 0, 4, 10, '1', 2, 10],
  ['hawk', 0, 1, 13, '1', 5, 10],
  ['jackal', 0, 3, 12, '1', 1, 10],
  ['lizard', 0, 2, 10, '1', 2, 10],
  ['octopus', 0, 3, 12, '1', 4, 10],
  ['owl', 0, 1, 11, '1', 3, 10],
  ['piranha', 0, 1, 13, '1', 5, 10],
  ['rat', 0, 1, 10, '1', 2, 10],
  ['raven', 0, 2, 12, '1', 4, 10],
  ['scorpion', 0, 1, 11, '1', 2, 10],
  ['spider', 0, 1, 12, '1', 4, 10],
  ['vulture', 0, 5, 10, '1d4', 2, 10],
  ['weasel', 0, 1, 13, '1', 5, 10],
  ['blood_hawk', 0.125, 7, 12, '1d4+2', 4, 25],
  ['camel', 0.125, 17, 10, '1d4+2', 4, 25],
  ['flying_snake', 0.125, 5, 14, '1', 4, 25],
  ['giant_weasel', 0.125, 9, 13, '1d4+3', 5, 25],
  ['mastiff', 0.125, 5, 12, '1d6+1', 3, 25],
  ['mule', 0.125, 11, 10, '1d4+2', 4, 25],
  ['pony', 0.125, 11, 10, '1d4+2', 4, 25],
  ['venomous_snake', 0.125, 5, 12, '1d4+2', 4, 25],
  ['boar', 0.25, 13, 11, '1d6+1', 3, 50],
  ['draft_horse', 0.25, 15, 10, '1d4+4', 6, 50],
  ['elk', 0.25, 11, 10, '1d6+3', 5, 50],
  ['giant_badger', 0.25, 15, 13, '2d4+1', 3, 50],
  ['giant_bat', 0.25, 22, 13, '1d6+3', 5, 50],
  ['giant_centipede', 0.25, 9, 14, '1d4+2', 4, 50],
  ['giant_frog', 0.25, 18, 11, '1d6+2', 3, 50],
  ['giant_lizard', 0.25, 19, 12, '1d8+2', 4, 50],
  ['giant_owl', 0.25, 19, 12, '1d10+2', 4, 50],
  ['giant_venomous_snake', 0.25, 11, 14, '1d4+4', 6, 50],
  ['panther', 0.25, 13, 13, '1d6+3', 5, 50],
  ['pteranodon', 0.25, 13, 13, '1d8+2', 4, 50],
  ['riding_horse', 0.25, 13, 11, '1d8+3', 5, 50],
  ['swarm_of_bats', 0.25, 11, 12, '2d4', 4, 50],
  ['swarm_of_rats', 0.25, 14, 10, '2d4', 2, 50],
  ['swarm_of_ravens', 0.25, 11, 12, '1d6+2', 4, 50],
  ['giant_goat', 0.5, 19, 11, '1d6+3', 5, 100],
  ['giant_seahorse', 0.5, 16, 14, '2d6+2', 4, 100],
  ['giant_wasp', 0.5, 22, 13, '1d6+2', 4, 100],
  ['reef_shark', 0.5, 22, 12, '2d4+2', 4, 100],
  ['swarm_of_insects', 0.5, 19, 11, '2d4+1', 3, 100],
  ['warhorse', 0.5, 19, 11, '2d4+4', 6, 100],
  ['giant_octopus', 1, 45, 11, '2d6+3', 5, 200],
  ['giant_toad', 1, 39, 11, '1d6+2', 4, 200],
  ['giant_vulture', 1, 25, 10, '2d6+2', 4, 200],
  ['swarm_of_piranhas', 1, 28, 13, '2d4+3', 5, 200],
  ['allosaurus', 2, 51, 13, '2d10+4', 6, 450],
  ['giant_elk', 2, 42, 14, '2d6+4', 6, 450],
  ['hunter_shark', 2, 45, 12, '3d6+4', 6, 450],
  ['plesiosaurus', 2, 68, 13, '2d6+4', 6, 450],
  ['rhinoceros', 2, 45, 13, '2d8+5', 7, 450],
  ['swarm_of_venomous_snakes', 2, 36, 14, '1d8+4', 6, 450],
  ['ankylosaurus', 3, 68, 15, '1d10+4', 6, 700, 2],
  ['killer_whale', 3, 90, 12, '5d6+4', 6, 700],
  ['archelon', 4, 90, 17, '3d6+4', 6, 1100, 2],
  ['elephant', 4, 76, 12, '2d8+6', 8, 1100, 2],
  ['hippopotamus', 4, 82, 14, '2d10+5', 7, 1100, 2],
  ['giant_crocodile', 5, 85, 14, '3d10+5', 8, 1800, 2],
  ['giant_shark', 5, 92, 13, '3d10+6', 9, 1800, 2],
  ['triceratops', 5, 114, 14, '2d12+6', 9, 1800, 2],
  ['tyrannosaurus_rex', 8, 136, 13, '4d12+7', 10, 3900, 2],
];

describe('SRD bestiary additions — core stat lines', () => {
  for (const [id, cr, hp, ac, damage, toHit, xp, multiattack] of NEW_MONSTERS) {
    it(`${id} registers with its SRD 5.2.1 stats`, () => {
      const m = SRD_MONSTERS[id];
      expect(m, id).toBeDefined();
      expect(m.cr, `${id} cr`).toBe(cr);
      expect(m.hp, `${id} hp`).toBe(hp);
      expect(m.ac, `${id} ac`).toBe(ac);
      expect(m.damage, `${id} damage`).toBe(damage);
      expect(m.toHit, `${id} toHit`).toBe(toHit);
      expect(m.xp, `${id} xp`).toBe(xp);
      if (multiattack) expect(m.multiattack, `${id} multiattack`).toBe(multiattack);
    });
  }
});

describe('SRD bestiary additions — effect fields', () => {
  it('Ghast applies Paralyzed on a CON save and resists necrotic', () => {
    expect(SRD_MONSTERS.ghast.onHitEffect).toEqual({
      condition: 'paralyzed',
      ability: 'con',
      dc: 10,
    });
    expect(SRD_MONSTERS.ghast.resistances).toContain('necrotic');
  });

  it('Specter is necrotic/poison-immune with the incorporeal resistance suite', () => {
    expect(SRD_MONSTERS.specter.immunities).toEqual(['necrotic', 'poison']);
    expect(SRD_MONSTERS.specter.resistances).toContain('slashing');
    expect(SRD_MONSTERS.specter.condition_immunities).toContain('paralyzed');
  });

  it('Animated Armor is poison/psychic-immune and construct-condition-immune', () => {
    expect(SRD_MONSTERS.animated_armor.immunities).toEqual(['poison', 'psychic']);
    expect(SRD_MONSTERS.animated_armor.condition_immunities).toContain('frightened');
  });

  it('Zombie carries Undead Fortitude and CON 16 for the DC-5+damage save', () => {
    expect(SRD_MONSTERS.zombie.undeadFortitude).toBe(true);
    expect(SRD_MONSTERS.zombie.con).toBe(16);
  });

  it('Ghast carries the Stench aura (CON save → Poisoned within 5 ft)', () => {
    expect(SRD_MONSTERS.ghast.aura).toMatchObject({
      radiusFt: 5,
      save: { ability: 'con', dc: 10 },
      condition: 'poisoned',
    });
  });

  it('Specter and Wight carry Life Drain (necrotic max-HP reduction)', () => {
    // Specter: all-necrotic attack drains the full damage.
    expect(SRD_MONSTERS.specter.lifeDrain).toBe(true);
    expect(SRD_MONSTERS.specter.damageType).toBe('necrotic');
    // Wight: only the necrotic bonus rider drains; the primary is slashing.
    expect(SRD_MONSTERS.wight.lifeDrain).toBe(true);
    expect(SRD_MONSTERS.wight.bonusDamageType).toBe('necrotic');
  });

  it('flyers carry their flight speed', () => {
    expect(SRD_MONSTERS.griffon.speedFt).toBe(80);
    expect(SRD_MONSTERS.worg.speedFt).toBe(50);
    expect(SRD_MONSTERS.giant_eagle.speedFt).toBe(80);
    expect(SRD_MONSTERS.hippogriff.speedFt).toBe(60);
  });

  it('Bugbear Warrior grapples on a hit (escape DC 12) at 10 ft reach', () => {
    expect(SRD_MONSTERS.bugbear_warrior.onHitEffect).toMatchObject({
      condition: 'grappled',
      escapeDc: 12,
    });
    expect(SRD_MONSTERS.bugbear_warrior.attackReachFt).toBe(10);
  });

  it('Giant Eagle deals bonus radiant and resists necrotic/radiant', () => {
    expect(SRD_MONSTERS.giant_eagle.bonusDamage).toBe('1d6');
    expect(SRD_MONSTERS.giant_eagle.bonusDamageType).toBe('radiant');
    expect(SRD_MONSTERS.giant_eagle.resistances).toEqual(['necrotic', 'radiant']);
  });

  it('Lion has Pack Tactics; Giant Boar has Bloodied Fury', () => {
    expect(SRD_MONSTERS.lion.packTactics).toBe(true);
    expect(SRD_MONSTERS.giant_boar.bloodiedFrenzy).toBe(true);
  });

  it('Mummy: fire-vulnerable, necrotic/poison-immune, condition-immune, frightens on hit', () => {
    expect(SRD_MONSTERS.mummy.vulnerabilities).toEqual(['fire']);
    expect(SRD_MONSTERS.mummy.immunities).toEqual(['necrotic', 'poison']);
    expect(SRD_MONSTERS.mummy.condition_immunities).toContain('frightened');
    expect(SRD_MONSTERS.mummy.bonusDamageType).toBe('necrotic');
    expect(SRD_MONSTERS.mummy.onHitEffect).toEqual({
      condition: 'frightened',
      ability: 'wis',
      dc: 11,
    });
  });

  it('Hill Giant is the first CR 5, with 10 ft reach', () => {
    expect(SRD_MONSTERS.hill_giant.cr).toBe(5);
    expect(SRD_MONSTERS.hill_giant.attackReachFt).toBe(10);
  });

  it('Gladiator parries with a +3 AC bonus (its proficiency bonus)', () => {
    expect(SRD_MONSTERS.gladiator.parry).toBe(true);
    expect(SRD_MONSTERS.gladiator.parryBonus).toBe(3);
  });

  it('Wraith carries Life Drain with the full incorporeal resistance suite', () => {
    expect(SRD_MONSTERS.wraith.lifeDrain).toBe(true);
    expect(SRD_MONSTERS.wraith.resistances).toContain('slashing');
    expect(SRD_MONSTERS.wraith.immunities).toEqual(['necrotic', 'poison']);
    expect(SRD_MONSTERS.wraith.condition_immunities).toContain('grappled');
  });

  it('Fire Elemental is fire/poison-immune with a 10-ft fire aura', () => {
    expect(SRD_MONSTERS.fire_elemental.immunities).toEqual(['fire', 'poison']);
    expect(SRD_MONSTERS.fire_elemental.resistances).toEqual([
      'bludgeoning',
      'piercing',
      'slashing',
    ]);
    expect(SRD_MONSTERS.fire_elemental.aura).toMatchObject({
      radiusFt: 10,
      damage: '1d10',
      damageType: 'fire',
    });
  });

  it('Wyvern stings for bonus poison and a CON save vs Poisoned at 10 ft', () => {
    expect(SRD_MONSTERS.wyvern.cr).toBe(6);
    expect(SRD_MONSTERS.wyvern.bonusDamage).toBe('7d6');
    expect(SRD_MONSTERS.wyvern.bonusDamageType).toBe('poison');
    expect(SRD_MONSTERS.wyvern.attackReachFt).toBe(10);
    expect(SRD_MONSTERS.wyvern.onHitEffect).toEqual({
      condition: 'poisoned',
      ability: 'con',
      dc: 14,
    });
  });

  it('Ettin is immune to a suite of sense/turn-loss conditions', () => {
    expect(SRD_MONSTERS.ettin.condition_immunities).toEqual([
      'blinded',
      'charmed',
      'deafened',
      'frightened',
      'stunned',
      'unconscious',
    ]);
  });

  it('Stone Giant has 15-ft reach; the other giants reach 10 ft', () => {
    expect(SRD_MONSTERS.stone_giant.attackReachFt).toBe(15);
    expect(SRD_MONSTERS.frost_giant.attackReachFt).toBe(10);
    expect(SRD_MONSTERS.fire_giant.attackReachFt).toBe(10);
    expect(SRD_MONSTERS.cloud_giant.attackReachFt).toBe(10);
  });

  it('the elemental giants carry their damage rider + matching immunity', () => {
    expect(SRD_MONSTERS.frost_giant.bonusDamageType).toBe('cold');
    expect(SRD_MONSTERS.frost_giant.immunities).toEqual(['cold']);
    expect(SRD_MONSTERS.fire_giant.bonusDamageType).toBe('fire');
    expect(SRD_MONSTERS.fire_giant.immunities).toEqual(['fire']);
    expect(SRD_MONSTERS.cloud_giant.bonusDamageType).toBe('thunder');
  });

  it('Young Red Dragon is the first CR 10: 3-attack, fire-immune, fast flyer with Darkvision 120', () => {
    const d = SRD_MONSTERS.young_red_dragon;
    expect(d.cr).toBe(10);
    expect(d.multiattack).toBe(3);
    expect(d.immunities).toEqual(['fire']);
    expect(d.bonusDamageType).toBe('fire');
    expect(d.speedFt).toBe(80);
    expect(d.darkvision_ft).toBe(120);
  });

  it('the no-darkvision giants/ape are explicitly sightless in the dark', () => {
    expect(SRD_MONSTERS.giant_ape.darkvision_ft).toBe(0);
    expect(SRD_MONSTERS.frost_giant.darkvision_ft).toBe(0);
    expect(SRD_MONSTERS.fire_giant.darkvision_ft).toBe(0);
    expect(SRD_MONSTERS.cloud_giant.darkvision_ft).toBe(0);
    // Stone Giant keeps its Darkvision 60.
    expect(SRD_MONSTERS.stone_giant.darkvision_ft).toBe(60);
  });

  it('the elemental quartet is complete (Air/Earth/Water join Fire, all CR 5, two attacks)', () => {
    for (const k of ['air_elemental', 'earth_elemental', 'water_elemental'] as const) {
      expect(SRD_MONSTERS[k].cr).toBe(5);
      expect(SRD_MONSTERS[k].multiattack).toBe(2);
      expect(SRD_MONSTERS[k].immunities).toContain('poison');
    }
  });

  it('Air Elemental resists physical + lightning and is thunder-immune at 10-ft reach', () => {
    const a = SRD_MONSTERS.air_elemental;
    expect(a.resistances).toEqual(['bludgeoning', 'lightning', 'piercing', 'slashing']);
    expect(a.immunities).toEqual(['poison', 'thunder']);
    expect(a.damageType).toBe('thunder');
    expect(a.attackReachFt).toBe(10);
    expect(a.speedFt).toBe(90);
  });

  it('Earth Elemental is the bruiser: thunder-vulnerable, 147 HP, 10-ft reach', () => {
    const e = SRD_MONSTERS.earth_elemental;
    expect(e.vulnerabilities).toEqual(['thunder']);
    expect(e.hp).toBe(147);
    expect(e.attackReachFt).toBe(10);
    expect(e.damageType).toBe('bludgeoning');
  });

  it('Water Elemental resists acid + fire', () => {
    expect(SRD_MONSTERS.water_elemental.resistances).toEqual(['acid', 'fire']);
  });

  it('Salamander: cold-vulnerable, fire-immune, bonus fire damage + a 5-ft fire aura', () => {
    const s = SRD_MONSTERS.salamander;
    expect(s.cr).toBe(5);
    expect(s.vulnerabilities).toEqual(['cold']);
    expect(s.immunities).toEqual(['fire']);
    expect(s.bonusDamage).toBe('2d6');
    expect(s.bonusDamageType).toBe('fire');
    expect(s.aura).toMatchObject({ radiusFt: 5, damage: '2d6', damageType: 'fire' });
  });

  it('Polar Bear is a CR 2 two-attack beast that resists cold', () => {
    const p = SRD_MONSTERS.polar_bear;
    expect(p.cr).toBe(2);
    expect(p.multiattack).toBe(2);
    expect(p.resistances).toEqual(['cold']);
    expect(p.damageType).toBe('slashing');
  });

  it('Tiger knocks Prone on a hit (auto, no save)', () => {
    expect(SRD_MONSTERS.tiger.onHitEffect).toEqual({ condition: 'prone' });
    expect(SRD_MONSTERS.tiger.darkvision_ft).toBe(60);
  });

  it('Spy carries a poison damage rider', () => {
    expect(SRD_MONSTERS.spy.bonusDamage).toBe('2d6');
    expect(SRD_MONSTERS.spy.bonusDamageType).toBe('poison');
  });

  it('Pegasus is a fast radiant-hooved flyer', () => {
    expect(SRD_MONSTERS.pegasus.speedFt).toBe(90);
    expect(SRD_MONSTERS.pegasus.bonusDamageType).toBe('radiant');
  });

  it('Giant Constrictor Snake grapples on a hit (escape DC 14) at 10-ft reach', () => {
    expect(SRD_MONSTERS.giant_constrictor_snake.onHitEffect).toMatchObject({
      condition: 'grappled',
      escapeDc: 14,
    });
    expect(SRD_MONSTERS.giant_constrictor_snake.attackReachFt).toBe(10);
  });

  it('Knight parries (+2), is frighten-immune, and smites for bonus radiant', () => {
    expect(SRD_MONSTERS.knight.parry).toBe(true);
    expect(SRD_MONSTERS.knight.parryBonus).toBe(2);
    expect(SRD_MONSTERS.knight.condition_immunities).toContain('frightened');
    expect(SRD_MONSTERS.knight.bonusDamageType).toBe('radiant');
  });

  it('Doppelganger is charm-immune with two slam attacks', () => {
    expect(SRD_MONSTERS.doppelganger.condition_immunities).toContain('charmed');
    expect(SRD_MONSTERS.doppelganger.multiattack).toBe(2);
  });

  it('Hell Hound: Pack Tactics, fire-immune, fire rider + a Fire Breath cone', () => {
    expect(SRD_MONSTERS.hell_hound.packTactics).toBe(true);
    expect(SRD_MONSTERS.hell_hound.immunities).toEqual(['fire']);
    expect(SRD_MONSTERS.hell_hound.bonusDamageType).toBe('fire');
    expect(SRD_MONSTERS.hell_hound.breathWeapon).toMatchObject({
      dice: '5d6',
      damageType: 'fire',
      savingThrow: 'dex',
      saveDC: 12,
    });
  });

  it('Assassin: 3 attacks, poison rider + Poisoned on hit, poison-resistant', () => {
    expect(SRD_MONSTERS.assassin.multiattack).toBe(3);
    expect(SRD_MONSTERS.assassin.bonusDamage).toBe('5d6');
    expect(SRD_MONSTERS.assassin.onHitEffect).toEqual({ condition: 'poisoned' });
    expect(SRD_MONSTERS.assassin.resistances).toEqual(['poison']);
  });

  it('caster monsters fight at range with their concrete attack', () => {
    // Priest — ranged Radiant Flame.
    expect(SRD_MONSTERS.priest.damageType).toBe('radiant');
    expect(SRD_MONSTERS.priest.attackReachFt).toBe(60);
    // Mage — ranged Force Arcane Burst, three per turn.
    expect(SRD_MONSTERS.mage.damageType).toBe('force');
    expect(SRD_MONSTERS.mage.multiattack).toBe(3);
    expect(SRD_MONSTERS.mage.attackReachFt).toBe(120);
    // Archmage — four bursts, psychic/charm immune.
    expect(SRD_MONSTERS.archmage.multiattack).toBe(4);
    expect(SRD_MONSTERS.archmage.immunities).toEqual(['psychic']);
    expect(SRD_MONSTERS.archmage.condition_immunities).toContain('charmed');
  });

  it('Mage and Archmage carry AoE spells (Fireball / Cone of Cold) for enemy casting', () => {
    for (const k of ['mage', 'archmage'] as const) {
      expect(SRD_MONSTERS[k].spells).toEqual(['fireball', 'cone_of_cold']);
      expect(SRD_MONSTERS[k].castChance).toBeGreaterThan(0);
      expect(SRD_MONSTERS[k].spellSaveDC).toBeGreaterThan(0);
    }
    expect(SRD_MONSTERS.archmage.spellSaveDC).toBe(17);
  });

  it('the shared pool grew well past the original 12', () => {
    expect(Object.keys(SRD_MONSTERS).length).toBeGreaterThanOrEqual(50);
  });

  // ── Batch 2026-06 effect fields ────────────────────────────────────────────

  it('grapplers carry their RAW escape DCs', () => {
    expect(SRD_MONSTERS.giant_crab.onHitEffect).toEqual({ condition: 'grappled', escapeDc: 11 });
    expect(SRD_MONSTERS.crocodile.onHitEffect).toEqual({ condition: 'grappled', escapeDc: 12 });
    expect(SRD_MONSTERS.constrictor_snake.onHitEffect).toEqual({
      condition: 'grappled',
      escapeDc: 12,
    });
    expect(SRD_MONSTERS.mimic.onHitEffect).toEqual({ condition: 'grappled', escapeDc: 13 });
    expect(SRD_MONSTERS.ankheg.onHitEffect).toEqual({ condition: 'grappled', escapeDc: 13 });
  });

  it('pack hunters and the rampager carry their traits', () => {
    expect(SRD_MONSTERS.hyena.packTactics).toBe(true);
    expect(SRD_MONSTERS.tough.packTactics).toBe(true);
    expect(SRD_MONSTERS.giant_hyena.rampage).toBe(true);
  });

  it('Noble and Warrior Veteran carry the Parry reaction', () => {
    expect(SRD_MONSTERS.noble.parry).toBe(true);
    expect(SRD_MONSTERS.warrior_veteran.parry).toBe(true);
  });

  it('Cockatrice models the first petrification stage (CON 11 → Restrained)', () => {
    expect(SRD_MONSTERS.cockatrice.onHitEffect).toEqual({
      condition: 'restrained',
      ability: 'con',
      dc: 11,
    });
    expect(SRD_MONSTERS.cockatrice.condition_immunities).toContain('petrified');
  });

  it('wyrmlings breathe per RAW (cold CON 12 / acid DEX 11) with elemental riders', () => {
    expect(SRD_MONSTERS.white_dragon_wyrmling.breathWeapon).toMatchObject({
      dice: '5d8',
      damageType: 'cold',
      savingThrow: 'con',
      saveDC: 12,
    });
    expect(SRD_MONSTERS.black_dragon_wyrmling.breathWeapon).toMatchObject({
      dice: '5d8',
      damageType: 'acid',
      savingThrow: 'dex',
      saveDC: 11,
    });
    expect(SRD_MONSTERS.white_dragon_wyrmling.bonusDamageType).toBe('cold');
    expect(SRD_MONSTERS.black_dragon_wyrmling.creatureType).toBe('dragon');
  });

  it('Ankheg sprays acid on a Recharge 6', () => {
    expect(SRD_MONSTERS.ankheg.breathWeapon).toMatchObject({
      dice: '4d6',
      damageType: 'acid',
      savingThrow: 'dex',
      saveDC: 12,
      rechargeMin: 6,
    });
  });

  it('reach attackers carry 10 ft (Awakened Tree slam, Minotaur glaive)', () => {
    expect(SRD_MONSTERS.awakened_tree.attackReachFt).toBe(10);
    expect(SRD_MONSTERS.minotaur.attackReachFt).toBe(10);
    expect(SRD_MONSTERS.minotaur.bonusDamageType).toBe('necrotic');
  });
});

describe('Animals appendix batch — effect fields', () => {
  it('every appendix animal carries the beast creature type (Celestials/Monstrosities excepted)', () => {
    // The four appendix entries that are NOT Beasts in SRD 5.2.1 (the
    // creatureType union has no celestial/monstrosity — left unspecified).
    const notBeasts = ['giant_owl', 'giant_elk', 'flying_snake', 'giant_vulture'];
    for (const id of notBeasts) expect(SRD_MONSTERS[id].creatureType, id).toBeUndefined();
    for (const id of ['rat', 'panther', 'elephant', 'tyrannosaurus_rex', 'swarm_of_rats'])
      expect(SRD_MONSTERS[id].creatureType, id).toBe('beast');
  });

  it('swarms share the swarm kit: weapon resistance + the crowd-control immunity suite', () => {
    const swarms = [
      'swarm_of_bats',
      'swarm_of_rats',
      'swarm_of_ravens',
      'swarm_of_insects',
      'swarm_of_piranhas',
      'swarm_of_venomous_snakes',
    ];
    for (const id of swarms) {
      expect(SRD_MONSTERS[id].resistances, id).toEqual(['bludgeoning', 'piercing', 'slashing']);
      expect(SRD_MONSTERS[id].condition_immunities, id).toEqual([
        'charmed',
        'frightened',
        'grappled',
        'paralyzed',
        'petrified',
        'prone',
        'restrained',
        'stunned',
      ]);
    }
    // The snake swarm's bites carry the 3d6 poison rider.
    expect(SRD_MONSTERS.swarm_of_venomous_snakes.bonusDamage).toBe('3d6');
    expect(SRD_MONSTERS.swarm_of_venomous_snakes.bonusDamageType).toBe('poison');
  });

  it('venomous fauna carry their poison riders', () => {
    const riders: Array<[string, string]> = [
      ['scorpion', '1d6'],
      ['spider', '1d4'],
      ['flying_snake', '2d4'],
      ['venomous_snake', '1d6'],
      ['giant_venomous_snake', '1d8'],
      ['giant_wasp', '2d4'],
      ['giant_toad', '2d4'],
    ];
    for (const [id, dice] of riders) {
      expect(SRD_MONSTERS[id].bonusDamage, id).toBe(dice);
      expect(SRD_MONSTERS[id].bonusDamageType, id).toBe('poison');
    }
  });

  it('the big grapplers pin on a hit at their SRD escape DCs', () => {
    const grapplers: Array<[string, number]> = [
      ['giant_frog', 11],
      ['giant_toad', 12],
      ['giant_octopus', 13],
      ['giant_crocodile', 15],
      ['tyrannosaurus_rex', 17],
    ];
    for (const [id, escapeDc] of grapplers)
      expect(SRD_MONSTERS[id].onHitEffect, id).toMatchObject({ condition: 'grappled', escapeDc });
  });

  it('auto-condition riders: knockdown bites and lingering poison', () => {
    expect(SRD_MONSTERS.mastiff.onHitEffect).toEqual({ condition: 'prone' });
    expect(SRD_MONSTERS.ankylosaurus.onHitEffect).toEqual({ condition: 'prone' });
    expect(SRD_MONSTERS.giant_centipede.onHitEffect).toEqual({ condition: 'poisoned' });
    expect(SRD_MONSTERS.giant_vulture.onHitEffect).toEqual({ condition: 'poisoned' });
  });

  it('pack hunters have Pack Tactics (the SRD 5.2.1 carriers, not folk memory)', () => {
    for (const id of ['baboon', 'blood_hawk', 'giant_vulture', 'reef_shark', 'vulture'])
      expect(SRD_MONSTERS[id].packTactics, id).toBe(true);
    // Jackal and Mastiff do NOT carry it in 5.2.1.
    expect(SRD_MONSTERS.jackal.packTactics).toBeUndefined();
    expect(SRD_MONSTERS.mastiff.packTactics).toBeUndefined();
  });

  it('the Celestial fauna carry their radiant kit', () => {
    expect(SRD_MONSTERS.giant_elk.bonusDamage).toBe('2d4');
    expect(SRD_MONSTERS.giant_elk.bonusDamageType).toBe('radiant');
    expect(SRD_MONSTERS.giant_elk.resistances).toEqual(['necrotic', 'radiant']);
    expect(SRD_MONSTERS.giant_owl.resistances).toEqual(['necrotic', 'radiant']);
    expect(SRD_MONSTERS.giant_owl.darkvision_ft).toBe(120);
  });

  it('flyers and swimmers carry their dominant movement speed', () => {
    expect(SRD_MONSTERS.giant_owl.speedFt).toBe(60); // fly
    expect(SRD_MONSTERS.pteranodon.speedFt).toBe(60); // fly
    expect(SRD_MONSTERS.killer_whale.speedFt).toBe(60); // swim
    expect(SRD_MONSTERS.giant_shark.speedFt).toBe(60); // swim
    expect(SRD_MONSTERS.allosaurus.speedFt).toBe(60); // ground sprinter
  });
});
