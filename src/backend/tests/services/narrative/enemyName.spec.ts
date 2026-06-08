import { describe, expect, it } from 'vitest';
import { fillEnemyTokens, isProperNounName } from '../../../src/services/narrative/enemyName.js';

describe('isProperNounName', () => {
  it('treats common-noun monster types as common (needs an article)', () => {
    expect(isProperNounName('Crypt Ghoul')).toBe(false);
    expect(isProperNounName('Skeleton Warrior')).toBe(false);
    expect(isProperNounName('Bandit Captain')).toBe(false); // title is a suffix here
    expect(isProperNounName('Crypt Lord')).toBe(false);
  });

  it('infers proper nouns from "<Name> the <Role>", titles, and parentheticals', () => {
    expect(isProperNounName('Aldric the Merchant')).toBe(true);
    expect(isProperNounName('Captain Riese')).toBe(true);
    expect(isProperNounName('Sister Maren')).toBe(true);
    expect(isProperNounName('Old Elise (village elder)')).toBe(true);
  });

  it('honors an explicit flag over the heuristic', () => {
    expect(isProperNounName('Dusk', true)).toBe(true); // single-word proper name
    expect(isProperNounName('Captain Riese', false)).toBe(false); // forced common
  });
});

describe('fillEnemyTokens', () => {
  const ghoul = { name: 'Crypt Ghoul' };
  const riese = { name: 'Captain Riese' };
  const dusk = { name: 'Dusk', proper_noun: true };

  it('articles a common noun: {the_enemy} / {The_enemy}', () => {
    expect(fillEnemyTokens('lands on {the_enemy}.', ghoul)).toBe('lands on the Crypt Ghoul.');
    expect(fillEnemyTokens('{The_enemy} reels.', ghoul)).toBe('The Crypt Ghoul reels.');
  });

  it('drops the article for a proper noun (inferred or flagged)', () => {
    expect(fillEnemyTokens('{The_enemy} reels.', riese)).toBe('Captain Riese reels.');
    expect(fillEnemyTokens('lands on {the_enemy}.', riese)).toBe('lands on Captain Riese.');
    expect(fillEnemyTokens('{The_enemy} attacks!', dusk)).toBe('Dusk attacks!');
  });

  it('leaves bare {enemy} unarticled (possessives / hand-articled prose)', () => {
    expect(fillEnemyTokens("off {enemy}'s guard.", ghoul)).toBe("off Crypt Ghoul's guard.");
  });
});
