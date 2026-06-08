// SRD 5.2.1 publishes exactly one subclass per class, so there's no choice to
// make — the engine auto-assigns it at level 3 (see applySubclass /
// applyLevelUpForClass). These tests lock that the auto-assignment fires (with
// the Draconic Sorcerer side effects) and that the old player-facing picker is
// no longer surfaced.

import { applyLevelUpForClass, generateChoices } from '../../src/services/gameEngine.js';
import { describe, expect, it } from 'vitest';
import { makeChar, makeState } from '../../src/test-fixtures.js';
import type { Seed } from '../../src/types.js';
import { context as ctx } from '../../src/campaignData/sandbox.js';

const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Subclass Test',
  ship_name: 'Subclass Test',
  intro: '',
  seed_id: 'subclass',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {},
  loot: {},
  npcs: {},
};

describe('Subclass — auto-assigned at level 3 (SRD-only)', () => {
  it('a Wizard reaching level 3 is auto-assigned Evoker, with a narrative note', () => {
    const pc = makeChar({ id: 'pc', character_class: 'Wizard', level: 2 });
    expect(pc.subclass).toBeFalsy();
    const note = applyLevelUpForClass(pc, 'Wizard', ctx);
    expect(pc.level).toBe(3);
    expect(pc.subclass).toBe('evoker');
    expect(note).toMatch(/path of the evoker/i);
  });

  it('does not assign before level 3', () => {
    const pc = makeChar({ id: 'pc', character_class: 'Barbarian', level: 1 });
    applyLevelUpForClass(pc, 'Barbarian', ctx); // -> L2
    expect(pc.subclass).toBeFalsy();
    const note = applyLevelUpForClass(pc, 'Barbarian', ctx); // -> L3
    expect(pc.subclass).toBe('berserker');
    expect(note).toMatch(/berserker/i);
  });

  it('Sorcerer auto-assigns Draconic and applies Draconic Resilience HP', () => {
    const pc = makeChar({
      id: 'pc',
      character_class: 'Sorcerer',
      level: 2,
      class_levels: { sorcerer: 2 },
    });
    const hpBefore = pc.max_hp;
    const note = applyLevelUpForClass(pc, 'Sorcerer', ctx);
    expect(pc.subclass).toBe('draconic');
    // L3 HP roll (no draconic bonus that level) + retroactive +3 (sorcerer level).
    expect(pc.max_hp).toBeGreaterThan(hpBefore + 3);
    expect(note).toMatch(/Draconic Resilience/);
  });

  it('the level-up picker no longer offers select_subclass', () => {
    const pc = makeChar({ id: 'pc', character_class: 'Wizard', level: 3 });
    const state = {
      ...makeState({ id: pc.id }, { current_room: 'entry_hall' }),
      characters: [pc],
      active_character_id: pc.id,
    };
    const offered = generateChoices(state, seed, ctx).filter(
      (c) => c.action.type === 'select_subclass'
    );
    expect(offered).toHaveLength(0);
  });
});
