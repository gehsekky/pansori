// Character-model mapping (PC class / NPC icon / enemy name → CC0 model).
// Pins the Act-I-relevant mappings and the non-humanoid null fallback.

import { CHAR_MODEL, modelForClass, modelForEnemyName, modelForNpcIcon } from './characters3d';
import { describe, expect, it } from 'vitest';

describe('characters3d mapping', () => {
  it('maps PC classes onto the adventurer set', () => {
    expect(modelForClass('Fighter')).toBe(CHAR_MODEL.knight);
    expect(modelForClass('Wizard')).toBe(CHAR_MODEL.mage);
    expect(modelForClass('Cleric')).toBe(CHAR_MODEL.knight);
    expect(modelForClass('Rogue')).toBe(CHAR_MODEL.rogue);
    expect(modelForClass('Barbarian')).toBe(CHAR_MODEL.barbarian);
    expect(modelForClass(undefined)).toBe(CHAR_MODEL.knight);
  });

  it('maps the Act I NPC icons sensibly', () => {
    expect(modelForNpcIcon('orc-head')).toBe(CHAR_MODEL.knight); // Vargis
    expect(modelForNpcIcon('knight-helmet')).toBe(CHAR_MODEL.knight); // Vane
    expect(modelForNpcIcon('hood')).toBe(CHAR_MODEL.rogueHooded); // Lorien
    expect(modelForNpcIcon('blindfold')).toBe(CHAR_MODEL.mage); // Martha
    expect(modelForNpcIcon('shopping-bag')).toBe(CHAR_MODEL.rogue); // Halda (commoner)
    expect(modelForNpcIcon(undefined)).toBe(CHAR_MODEL.rogue);
  });

  it('maps humanoid/undead enemies and leaves beasts as null (primitive token)', () => {
    expect(modelForEnemyName('Subverted Trooper')).toBe(CHAR_MODEL.knight);
    expect(modelForEnemyName('Valerion Vanguard')).toBe(CHAR_MODEL.knight);
    expect(modelForEnemyName('Peat Ghoul')).toBe(CHAR_MODEL.skeletonMinion);
    expect(modelForEnemyName('Skeleton')).toBe(CHAR_MODEL.skeletonWarrior);
    expect(modelForEnemyName('Weaver Magus')).toBe(CHAR_MODEL.mage);
    expect(modelForEnemyName('Cultist')).toBe(CHAR_MODEL.mage);
    // Beasts / swarms / constructs keep their primitive tokens.
    expect(modelForEnemyName('Giant Rat')).toBeNull();
    expect(modelForEnemyName('Mire Constrictor')).toBeNull();
    expect(modelForEnemyName('Carrion Swarm')).toBeNull();
    expect(modelForEnemyName('Bog Lurker')).toBeNull();
    expect(modelForEnemyName(undefined)).toBeNull();
  });
});
