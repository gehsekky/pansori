// SRD control zones: Fog Cloud (a sight-blocking obscurement zone, blocks
// Darkvision) and Silence (a zone where Verbal-component spells can't be cast).

import type { Enemy, GameState, Seed } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../../test-fixtures.js';
import { context as ctx } from '../fixtures/testContext.js';
import { takeAction } from '../../services/gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const ENEMY = 'entry_hall#0';
const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Zone Test',
  ship_name: 'Zone Test',
  intro: '',
  seed_id: 'zones',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {
    entry_hall: [
      {
        id: ENEMY,
        name: 'Ogre',
        hp: 60,
        ac: 10,
        damage: '1d6',
        toHit: 3,
        xp: 20,
      } as unknown as Enemy,
    ],
  },
  loot: {},
  npcs: {},
};

function casterState(over: Partial<ReturnType<typeof makeChar>>): GameState {
  const char = makeChar({
    id: 'pc-1',
    level: 5,
    spell_slots_max: { 1: 3, 2: 3 },
    spell_slots_used: {},
    ...over,
  });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
    characters: [char],
    active_character_id: 'pc-1',
    initiative_order: [
      { id: 'pc-1', roll: 18, is_enemy: false },
      { id: ENEMY, roll: 5, is_enemy: true },
    ],
    initiative_idx: 0,
    entities: [
      {
        id: 'pc-1',
        isEnemy: false,
        pos: { x: 4, y: 4 },
        hp: 30,
        maxHp: 30,
        conditions: [],
        condition_durations: {},
      },
      {
        id: ENEMY,
        isEnemy: true,
        pos: { x: 5, y: 4 },
        hp: 60,
        maxHp: 60,
        conditions: [],
        condition_durations: {},
      },
    ],
  } as unknown as GameState;
}

describe('Fog Cloud — sight-blocking zone', () => {
  it('raises a blocksSight zone bound to concentration', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'fog_cloud', slotLevel: 1, targetEnemyId: ENEMY },
      history: [],
      state: casterState({
        character_class: 'Druid',
        wis: 16,
        spells_known: ['fog_cloud'],
        prepared_spells: ['fog_cloud'],
      }),
      seed,
      context: ctx,
    });
    const zone = r.newState.spell_zones?.find((z) => z.spellId === 'fog_cloud');
    expect(zone?.blocksSight).toBe(true);
    expect(zone?.casterId).toBe('pc-1');
    expect(r.newState.characters[0].concentrating_on?.spellId).toBe('fog_cloud');
  });
});

describe('Silence — blocks verbal-component casting inside it', () => {
  it('raises a blocksVerbal zone, and a caster inside it cannot cast a verbal spell', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    // Cast Silence centered on the caster's own cell (no enemy target picked).
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'silence', slotLevel: 2 },
      history: [],
      state: casterState({
        character_class: 'Cleric',
        wis: 16,
        spells_known: ['silence'],
        prepared_spells: ['silence'],
      }),
      seed,
      context: ctx,
    });
    const zone = r.newState.spell_zones?.find((z) => z.spellId === 'silence');
    expect(zone?.blocksVerbal).toBe(true);

    // A ranger standing in that zone tries Hunter's Mark (verbal) → blocked.
    const inZone = {
      ...r.newState,
      characters: [
        makeChar({
          id: 'pc-1',
          character_class: 'Ranger',
          level: 5,
          wis: 16,
          spell_slots_max: { 1: 3 },
          spell_slots_used: {},
          spells_known: ['hunters_mark'],
        }),
      ],
    } as GameState;
    const blocked = await takeAction({
      action: { type: 'cast_spell', spellId: 'hunters_mark', slotLevel: 1, targetEnemyId: ENEMY },
      history: [],
      state: inZone,
      seed,
      context: ctx,
    });
    expect(blocked.narrative).toMatch(/magical Silence/);
    expect(blocked.newState.characters[0].hunters_mark_target_id).toBeUndefined();
  });
});
