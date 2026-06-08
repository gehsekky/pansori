// RE-2 — Self-Restoration (SRD 5.2.1, Monk L10): at the end of each of your
// turns, remove one of Charmed / Frightened / Poisoned from yourself. Applied
// in the turn-advance epilogue to the PC whose turn is ending.

import type { Enemy, Seed } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../../test-fixtures.js';
import { context as ctx } from '../../campaignData/sandbox.js';
import { takeAction } from '../../services/gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const enemyId = `entry_hall#0`;
const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Self-Restoration Test',
  ship_name: 'Self-Restoration Test',
  intro: '',
  seed_id: 'self-restoration',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {
    // Passive (low to-hit, no onHitEffect) so it can't re-apply a condition.
    ['entry_hall']: [
      {
        id: enemyId,
        name: 'Shade',
        hp: 30,
        ac: 12,
        damage: '1d4',
        toHit: 0,
        xp: 10,
      } as unknown as Enemy,
    ],
  },
  loot: {},
  npcs: {},
};

function buildState(monk: ReturnType<typeof makeChar>) {
  return {
    ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
    characters: [monk],
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
        pos: { x: 1, y: 1 },
        hp: 40,
        maxHp: 40,
        conditions: [],
        condition_durations: {},
      },
      {
        id: enemyId,
        isEnemy: true,
        pos: { x: 7, y: 7 },
        hp: 30,
        maxHp: 30,
        conditions: [],
        condition_durations: {},
      },
    ],
  };
}

const monk = (level: number, conditions: string[]) =>
  makeChar({ id: 'pc-1', character_class: 'Monk', level, hp: 40, max_hp: 40, conditions });

describe('Self-Restoration — end-of-turn condition cleanse', () => {
  it('a Monk L10 sheds Frightened at the end of its turn', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const r = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state: buildState(monk(10, ['frightened'])),
      seed,
      context: ctx,
    });
    expect(r.newState.characters[0].conditions).not.toContain('frightened');
    expect(r.narrative).toContain('Self-Restoration');
  });

  it('a Monk L9 does not (feature not yet online)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const r = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state: buildState(monk(9, ['frightened'])),
      seed,
      context: ctx,
    });
    expect(r.newState.characters[0].conditions).toContain('frightened');
  });

  it('removes only one eligible condition and leaves non-eligible ones', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const r = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state: buildState(monk(10, ['frightened', 'blinded'])),
      seed,
      context: ctx,
    });
    const conds = r.newState.characters[0].conditions;
    expect(conds).not.toContain('frightened'); // Charmed/Frightened/Poisoned — eligible
    expect(conds).toContain('blinded'); // not eligible for Self-Restoration
  });
});
