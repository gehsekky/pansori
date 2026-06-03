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

  it('the shared pool grew well past the original 12', () => {
    expect(Object.keys(SRD_MONSTERS).length).toBeGreaterThanOrEqual(50);
  });
});
