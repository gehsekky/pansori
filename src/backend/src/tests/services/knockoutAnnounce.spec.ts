// A PC dropping to 0 HP from an enemy attack is announced in the
// narrative. The 2026-06 playtest log showed a ranger silently hit
// down to 0 — the next mention was three turns later when an ally's
// Healing Word "brought him back", with no line saying he ever fell.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../../test-fixtures.js';
import type { Seed } from '../../types.js';
import { context as ctx } from '../fixtures/testContext.js';
import { takeAction } from '../../services/gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const enemyId = `entry_hall#0`;

const seedWithGoblin: Seed = {
  context_id: ctx.id,
  world_name: 'Knockout Test',
  ship_name: 'Knockout Test',
  intro: '',
  seed_id: 'knockout-test',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {
    ['entry_hall']: [
      {
        id: enemyId,
        name: 'Goblin',
        hp: 10,
        ac: 10,
        damage: '1d6',
        // High toHit so a mid d20 reliably lands.
        toHit: 20,
        xp: 20,
      },
    ],
  },
  loot: {},
  npcs: {},
};

function stateWithPcAt(hp: number) {
  const pc = makeChar({
    id: 'pc-1',
    character_class: 'Fighter',
    level: 3,
    hp,
    max_hp: 30,
    ac: 10,
  });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
    characters: [pc],
    active_character_id: 'pc-1',
    initiative_order: [
      { id: 'pc-1', roll: 18, is_enemy: false },
      { id: enemyId, roll: 5, is_enemy: true },
    ],
    initiative_idx: 0,
    entities: [
      {
        id: 'pc-1',
        isEnemy: false,
        pos: { x: 4, y: 5 },
        hp,
        maxHp: 30,
        conditions: [],
        condition_durations: {},
      },
      {
        id: enemyId,
        isEnemy: true,
        pos: { x: 5, y: 5 },
        hp: 10,
        maxHp: 10,
        conditions: [],
        condition_durations: {},
      },
    ],
  };
}

describe('enemy attack drops a PC to 0 HP', () => {
  it('announces the knockout in the narrative', async () => {
    // d20 11 (hits at +20, no crit); 1d6 @ 0.5 → 4 damage onto 3 HP → 0.
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const result = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state: stateWithPcAt(3),
      seed: seedWithGoblin,
      context: ctx,
    });
    const pc = result.newState.characters.find((c) => c.id === 'pc-1');
    expect(pc?.hp).toBe(0);
    expect(pc?.dead).toBeFalsy();
    expect(result.narrative).toMatch(/falls unconscious/);
  });

  it('stays silent when the PC survives the hit', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const result = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state: stateWithPcAt(20),
      seed: seedWithGoblin,
      context: ctx,
    });
    expect(result.narrative).not.toMatch(/falls unconscious/);
  });
});
