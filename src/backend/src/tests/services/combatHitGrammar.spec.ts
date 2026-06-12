// Attack-line grammar. Weapon verbs are often authored transitively
// ("cleaves with", "stabs with") and the object never comes — the class
// style is the complement. The playtest log read "cleaves with, with
// martial precision"; buildCombatHitNarrative now merges the dangling
// "with" into a with-style seamlessly.

import type { Context, Enemy } from '../../types.js';
import { describe, expect, it } from 'vitest';
import { context as base } from '../fixtures/testContext.js';
import { buildCombatHitNarrative } from '../../services/gameEngine.js';
import { makeChar } from '../../test-fixtures.js';

const goblin = { name: 'Goblin', hp: 7, max_hp: 7 } as unknown as Enemy;
const longsword = { id: 'longsword', name: 'Longsword' } as Parameters<
  typeof buildCombatHitNarrative
>[1];

// Single-entry pools make `pick` deterministic.
const ctxWith = (weaponVerb: string, style: string): Context => ({
  ...base,
  narratives: {
    ...base.narratives,
    combatHit: ['A decisive strike.'],
    weaponVerbs: { longsword: [weaponVerb] },
    classStyle: { Fighter: [style] },
    enemyReactions: {},
  },
});

const fighter = makeChar({ character_class: 'Fighter', hp: 20, max_hp: 20 });

describe('buildCombatHitNarrative — verb/style seam', () => {
  it('merges a dangling "with" verb into a with-style ("cleaves with martial precision")', () => {
    const line = buildCombatHitNarrative(
      goblin,
      longsword,
      6,
      false,
      fighter,
      ctxWith('cleaves with', 'with martial precision')
    );
    expect(line).toContain('cleaves with martial precision');
    expect(line).not.toContain('with, with');
  });

  it('strips the dangling "with" before a non-with style', () => {
    const line = buildCombatHitNarrative(
      goblin,
      longsword,
      6,
      false,
      fighter,
      ctxWith('cleaves with', 'from the shadows')
    );
    expect(line).toContain('cleaves, from the shadows');
    expect(line).not.toContain('cleaves with,');
  });

  it('leaves a non-dangling verb + style pair as before', () => {
    const line = buildCombatHitNarrative(
      goblin,
      longsword,
      6,
      false,
      fighter,
      ctxWith('swings', 'with disciplined form')
    );
    expect(line).toContain('swings, with disciplined form');
  });
});
