// SRD Time Stop — the caster takes 1d4+1 extra turns in a row while everyone
// else is frozen (the turn-advance hook refreshes their turn instead of passing
// initiative). The effect ends the moment one of those turns affects an enemy.

import type { GameState, Seed } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../../test-fixtures.js';
import { SRD_SPELLS } from '../../campaignData/srd/spells.js';
import { context as ctx } from '../../campaignData/sandbox.js';
import { takeAction } from '../../services/gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const ENEMY = 'entry_hall#0';

const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Time Test',
  ship_name: 'Time Test',
  intro: '',
  seed_id: 'time',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {
    entry_hall: [
      { id: ENEMY, name: 'Ogre', hp: 200, ac: 5, damage: '1d4', toHit: 2, xp: 50, dex: 10 },
    ],
  },
  loot: {},
  npcs: {},
};

function wizState(over: Partial<ReturnType<typeof makeChar>> = {}): GameState {
  const wiz = makeChar({
    id: 'pc-1',
    character_class: 'Wizard',
    level: 18,
    int: 20,
    hp: 80,
    max_hp: 80,
    spells_known: ['time_stop', 'fireball'],
    prepared_spells: ['time_stop', 'fireball'],
    spell_slots_max: { 3: 2, 9: 1 },
    spell_slots_used: {},
    ...over,
  });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
    characters: [wiz],
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
        pos: { x: 0, y: 0 },
        hp: 80,
        maxHp: 80,
        conditions: [],
        condition_durations: {},
      },
      {
        id: ENEMY,
        isEnemy: true,
        pos: { x: 1, y: 0 },
        hp: 200,
        maxHp: 200,
        conditions: [],
        condition_durations: {},
      },
    ],
  };
}

describe('Time Stop — catalog', () => {
  it('grants 1d4+1 extra turns', () => {
    expect(SRD_SPELLS.time_stop.grantsExtraTurns).toBe('1d4+1');
    expect(SRD_SPELLS.time_stop.level).toBe(9);
  });
});

describe('Time Stop — extra turns', () => {
  it('casting banks 1d4+1 turns; enemies stay frozen and the caster keeps acting', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // 1d4 = 3 → 1d4+1 = 4
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'time_stop', slotLevel: 9 },
      history: [],
      state: wizState(),
      seed,
      context: ctx,
    });
    expect(r.newState.characters[0].time_stop_turns).toBe(4); // banked (ticks on turn end)
    expect(r.newState.active_character_id).toBe('pc-1'); // still the caster's turn
    expect(r.newState.entities?.find((e) => e.id === ENEMY)?.hp).toBe(200); // enemy frozen
  });

  it('ending a frozen turn grants the next one (bank ticks down, enemies still frozen)', async () => {
    const start = wizState({ time_stop_turns: 3 });
    const r = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state: start,
      seed,
      context: ctx,
    });
    expect(r.newState.characters[0].time_stop_turns).toBe(2); // 3 → 2
    expect(r.newState.active_character_id).toBe('pc-1'); // refreshed onto the caster
    expect(r.newState.characters[0].turn_actions.action_used).toBe(false); // fresh turn
    expect(r.newState.entities?.find((e) => e.id === ENEMY)?.hp).toBe(200); // enemy never acted
  });

  it('the bank empties after the last frozen turn, then the world moves again', async () => {
    const r = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state: wizState({ time_stop_turns: 1 }),
      seed,
      context: ctx,
    });
    expect(r.newState.characters[0].time_stop_turns).toBe(0); // 1 → 0 (last frozen turn)
    expect(r.newState.active_character_id).toBe('pc-1'); // still gets that final turn
  });

  it('affecting an enemy ends the time stop mid-turn', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // Fireball lands; still deals (at least half) damage
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'fireball', slotLevel: 3, targetEnemyId: ENEMY },
      history: [],
      state: wizState({ time_stop_turns: 3 }),
      seed,
      context: ctx,
    });
    expect(r.newState.characters[0].time_stop_turns).toBe(0); // ended by striking the enemy
    expect(r.newState.entities?.find((e) => e.id === ENEMY)?.hp).toBeLessThan(200); // it took damage
  });
});
