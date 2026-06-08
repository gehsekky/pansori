// SRD Expeditious Retreat (L1, bonus action): grants the Dash action on cast —
// extra movement equal to the caster's Speed (a movement surplus, so the grid
// budget `speed - movement_used` rises by a full Speed) + concentration.

import type { GameState, Seed } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../../test-fixtures.js';
import { context as ctx } from '../../campaignData/sandbox.js';
import { takeAction } from '../../services/gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const seed: Seed = {
  context_id: ctx.id,
  world_name: 'ER Test',
  ship_name: 'ER Test',
  intro: '',
  seed_id: 'er',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {},
  loot: {},
  npcs: {},
};

function state(): GameState {
  const wiz = makeChar({
    id: 'pc-1',
    character_class: 'Wizard',
    level: 5,
    int: 16,
    speed: 30,
    spell_slots_max: { 1: 3 },
    spell_slots_used: {},
    spells_known: ['expeditious_retreat'],
    prepared_spells: ['expeditious_retreat'],
  });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
    characters: [wiz],
    active_character_id: 'pc-1',
    initiative_order: [{ id: 'pc-1', roll: 18, is_enemy: false }],
    initiative_idx: 0,
    movement_used: {},
    entities: [
      {
        id: 'pc-1',
        isEnemy: false,
        pos: { x: 0, y: 0 },
        hp: 30,
        maxHp: 30,
        conditions: [],
        condition_durations: {},
      },
    ],
  } as unknown as GameState;
}

describe('Expeditious Retreat — grants the Dash this turn', () => {
  it('adds a full Speed of extra movement (surplus) and starts concentration', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'expeditious_retreat', slotLevel: 1 },
      history: [],
      state: state(),
      seed,
      context: ctx,
    });
    // movement_used drops to -30 → grid budget (speed - used) = 30 - (-30) = 60.
    expect(r.newState.movement_used?.['pc-1']).toBe(-30);
    expect(r.newState.characters[0].concentrating_on?.spellId).toBe('expeditious_retreat');
  });
});
