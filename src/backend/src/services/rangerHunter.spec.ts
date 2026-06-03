// RE-2 — Ranger Hunter's Mark riders: Precise Hunter (L17, Advantage on attack
// rolls vs your marked target) and Relentless Hunter (L13, taking damage can't
// break Concentration on Hunter's Mark).

import type { Enemy, GameState, Seed } from '../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkConcentration, takeAction } from './gameEngine.js';
import { makeChar, makeState } from '../test-fixtures.js';
import { context as ctx } from '../campaignData/sandbox.js';

afterEach(() => vi.restoreAllMocks());

const ENEMY = `entry_hall#0`;
const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Hunter Test',
  ship_name: 'Hunter Test',
  intro: '',
  seed_id: 'hunter',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {
    ['entry_hall']: [
      {
        id: ENEMY,
        name: 'Stag',
        hp: 120,
        ac: 12,
        damage: '1d6',
        toHit: 3,
        xp: 50,
      } as unknown as Enemy,
    ],
  },
  loot: {},
  npcs: {},
};

function markedRanger(level: number): GameState {
  const char = makeChar({
    id: 'pc-1',
    character_class: 'Ranger',
    level,
    str: 16,
    hunters_mark_target_id: ENEMY,
    equipment: { main_hand: 'sw-1' },
    inventory: [{ instance_id: 'sw-1', id: 'shortsword', name: 'Shortsword' }],
    weapon_proficiencies: ['simple', 'martial'],
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
        pos: { x: 4, y: 5 },
        hp: 30,
        maxHp: 30,
        conditions: [],
        condition_durations: {},
      },
      {
        id: ENEMY,
        isEnemy: true,
        pos: { x: 5, y: 5 },
        hp: 120,
        maxHp: 120,
        conditions: [],
        condition_durations: {},
      },
    ],
  } as unknown as GameState;
}

describe('Precise Hunter (L17) — Advantage vs the marked target', () => {
  it('a L17 Ranger attacks its Hunter’s Mark target with Advantage', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.6);
    const r = await takeAction({
      action: { type: 'attack', targetEnemyId: ENEMY },
      history: [],
      state: markedRanger(17),
      seed,
      context: ctx,
    });
    expect(r.narrative).toMatch(/\(advantage\)/);
  });

  it('a L16 Ranger does not (control)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.6);
    const r = await takeAction({
      action: { type: 'attack', targetEnemyId: ENEMY },
      history: [],
      state: markedRanger(16),
      seed,
      context: ctx,
    });
    expect(r.narrative).not.toMatch(/\(advantage\)/);
  });
});

describe('Relentless Hunter (L13) — Hunter’s Mark concentration holds', () => {
  const concentratingRanger = (level: number) =>
    makeChar({
      character_class: 'Ranger',
      level,
      con: 8, // poor CON — a normal save would likely fail
      concentrating_on: { spellId: 'hunters_mark', rounds_left: 600 },
      hunters_mark_target_id: ENEMY,
    });

  it('a L13 Ranger never rolls — the mark holds through damage', () => {
    const char = concentratingRanger(13);
    const { char: after, note } = checkConcentration(
      char,
      makeState({}, { characters: [char] }),
      40
    );
    expect(note).toMatch(/Relentless Hunter/);
    expect(after.concentrating_on?.spellId).toBe('hunters_mark');
  });

  it('a L12 Ranger goes through the normal concentration save', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // d20 → 1: a normal save fails
    const char = concentratingRanger(12);
    const { note } = checkConcentration(char, makeState({}, { characters: [char] }), 40);
    expect(note).not.toMatch(/Relentless Hunter/);
  });
});
