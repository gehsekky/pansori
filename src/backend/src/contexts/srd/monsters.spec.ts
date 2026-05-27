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

  it('the shared pool grew well past the original 12', () => {
    expect(Object.keys(SRD_MONSTERS).length).toBeGreaterThanOrEqual(38);
  });
});
