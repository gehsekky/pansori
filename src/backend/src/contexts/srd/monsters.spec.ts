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

  it('flyers carry their flight speed', () => {
    expect(SRD_MONSTERS.griffon.speedFt).toBe(80);
    expect(SRD_MONSTERS.worg.speedFt).toBe(50);
  });

  it('the shared pool grew well past the original 12', () => {
    expect(Object.keys(SRD_MONSTERS).length).toBeGreaterThanOrEqual(30);
  });
});
