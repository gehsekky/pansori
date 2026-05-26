// Bane target picker (FE option pickers) — Bane is a single picker choice
// (not the per-enemy spread); the cast path applies `baned` to each chosen
// enemy that fails its CHA save, under one concentration.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateChoices, takeAction } from './gameEngine.js';
import { makeChar, makeState } from '../test-fixtures.js';
import type { Seed } from '../types.js';
import { context as ctx } from '../contexts/sandbox.js';

afterEach(() => vi.restoreAllMocks());

const E0 = `${ctx.startRoomId}#0`;
const E1 = `${ctx.startRoomId}#1`;

const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Bane Test',
  ship_name: 'Bane Test',
  intro: '',
  seed_id: 'bane',
  rooms: [{ id: ctx.startRoomId, name: 'Start', desc: '' }],
  connections: { [ctx.startRoomId]: [] },
  enemies: {
    [ctx.startRoomId]: [
      { id: E0, name: 'Bandit', hp: 30, ac: 12, damage: '1d6', toHit: 3, xp: 10, cha: 8 },
      { id: E1, name: 'Bandit', hp: 30, ac: 12, damage: '1d6', toHit: 3, xp: 10, cha: 8 },
    ],
  },
  loot: {},
  npcs: {},
};

function casterState() {
  const cleric = makeChar({
    id: 'pc-1',
    character_class: 'Cleric',
    level: 9,
    wis: 18,
    hp: 50,
    max_hp: 50,
    spells_known: ['bane'],
    prepared_spells: ['bane'],
    spell_slots_max: { 1: 2, 2: 1 },
    spell_slots_used: {},
  });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: ctx.startRoomId, combat_active: true }),
    characters: [cleric],
    active_character_id: 'pc-1',
    initiative_order: [
      { id: 'pc-1', roll: 18, is_enemy: false },
      { id: E0, roll: 8, is_enemy: true },
      { id: E1, roll: 5, is_enemy: true },
    ],
    initiative_idx: 0,
    entities: [
      {
        id: 'pc-1',
        isEnemy: false,
        pos: { x: 1, y: 1 },
        hp: 50,
        maxHp: 50,
        conditions: [],
        condition_durations: {},
      },
      {
        id: E0,
        isEnemy: true,
        pos: { x: 2, y: 1 },
        hp: 30,
        maxHp: 30,
        conditions: [],
        condition_durations: {},
      },
      {
        id: E1,
        isEnemy: true,
        pos: { x: 3, y: 1 },
        hp: 30,
        maxHp: 30,
        conditions: [],
        condition_durations: {},
      },
    ],
  };
}

describe('Bane target picker — applies baned to each chosen enemy', () => {
  it('banes every chosen enemy that fails its CHA save', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01); // CHA saves roll 1 → fail
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'bane', slotLevel: 1, targetEnemyIds: [E0, E1] },
      history: [],
      state: casterState(),
      seed,
      context: ctx,
    });
    const e0 = r.newState.entities?.find((e) => e.id === E0);
    const e1 = r.newState.entities?.find((e) => e.id === E1);
    expect(e0?.conditions).toContain('baned');
    expect(e1?.conditions).toContain('baned');
    expect(r.newState.characters[0].concentrating_on?.spellId).toBe('bane');
  });

  it('falls back to a single target when no targetEnemyIds are provided', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01);
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'bane', slotLevel: 1, targetEnemyId: E1 },
      history: [],
      state: casterState(),
      seed,
      context: ctx,
    });
    const baned = (r.newState.entities ?? []).filter((e) => e.conditions.includes('baned'));
    expect(baned.map((e) => e.id)).toEqual([E1]);
  });
});

describe('Bane target picker — single choice tagged pickTargets {enemy, 3}', () => {
  it('emits one Bane cast choice per slot (not per enemy), each pickTargets enemy', () => {
    const choices = generateChoices(casterState(), seed, ctx);
    const baneChoices = choices.filter(
      (c) => c.action.type === 'cast_spell' && c.action.spellId === 'bane'
    );
    // Two slot levels available (1 + 2) → exactly two choices, despite 2 enemies
    // (a per-enemy spread would yield 4+).
    expect(baneChoices).toHaveLength(2);
    for (const c of baneChoices) {
      expect(c.pickTargets?.side).toBe('enemy');
    }
    const base = baneChoices.find(
      (c) => c.action.type === 'cast_spell' && c.action.slotLevel === 1
    );
    expect(base?.pickTargets).toEqual({ side: 'enemy', max: 3 });
  });
});
