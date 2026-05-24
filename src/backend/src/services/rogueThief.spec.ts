// RE-2 — Rogue subclass migration: the SRD 5.2.1 iconic Rogue subclass is
// Thief (not the PHB-only Assassin). The PHB Assassinate auto-crit / advantage-
// vs-surprised mechanics are removed; the subclass list offers 'thief'.

import type { Enemy, GameState, Seed } from '../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { baseSandboxSeed, makeChar, makeState } from '../test-fixtures.js';
import { generateChoices, takeAction } from './gameEngine.js';
import { context as ctx } from '../contexts/sandbox.js';

afterEach(() => vi.restoreAllMocks());

describe('Rogue subclass is Thief (SRD), not Assassin', () => {
  it('offers the Thief subclass choice to a Rogue L3 out of combat', () => {
    const rogue = makeChar({ id: 'pc-1', character_class: 'Rogue', level: 3 });
    const state = makeState({}, { characters: [rogue], active_character_id: 'pc-1' });
    const subclassChoices = generateChoices(state, baseSandboxSeed, ctx).filter(
      (c) => c.action.type === 'select_subclass'
    );
    const picks = subclassChoices.map((c) =>
      c.action.type === 'select_subclass' ? c.action.subclass : ''
    );
    expect(picks).toContain('thief');
    expect(picks).not.toContain('assassin');
  });
});

const ENEMY = `${ctx.startRoomId}#0`;
const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Thief Test',
  ship_name: 'Thief Test',
  intro: '',
  seed_id: 'thief',
  rooms: [{ id: ctx.startRoomId, name: 'Start', desc: '' }],
  connections: { [ctx.startRoomId]: [] },
  enemies: {
    [ctx.startRoomId]: [
      { id: ENEMY, name: 'Guard', hp: 80, ac: 10, damage: '1d6', toHit: 3, xp: 50 } as unknown as Enemy,
    ],
  },
  loot: {},
  npcs: {},
};

function thiefState(): GameState {
  const char = makeChar({
    id: 'pc-1',
    character_class: 'Rogue',
    subclass: 'thief',
    level: 5,
    dex: 16,
    str: 16,
    equipped_weapon: 'dg-1',
    inventory: [{ instance_id: 'dg-1', id: 'dagger', name: 'Dagger' }],
    weapon_proficiencies: ['simple', 'martial'],
  });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: ctx.startRoomId, combat_active: true }),
    characters: [char],
    active_character_id: 'pc-1',
    surprised: [ENEMY], // the old Assassinate would auto-crit this
    round: 1,
    initiative_order: [
      { id: 'pc-1', roll: 18, is_enemy: false },
      { id: ENEMY, roll: 5, is_enemy: true },
    ],
    initiative_idx: 0,
    entities: [
      { id: 'pc-1', isEnemy: false, pos: { x: 4, y: 5 }, hp: 30, maxHp: 30, conditions: [], condition_durations: {} },
      { id: ENEMY, isEnemy: true, pos: { x: 5, y: 5 }, hp: 80, maxHp: 80, conditions: [], condition_durations: {} },
    ],
  } as unknown as GameState;
}

describe('Assassinate is gone — no auto-crit vs a surprised target', () => {
  it('a Thief hitting a surprised enemy does not auto-crit', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.7); // d20 → 15: a normal hit, not a nat-20
    const r = await takeAction({
      action: { type: 'attack', targetEnemyId: ENEMY },
      history: [],
      state: thiefState(),
      seed,
      context: ctx,
    });
    const hit = (r.newState.combat_log ?? []).find((e) => e.kind === 'attack_hit');
    expect(hit && hit.kind === 'attack_hit' && hit.isCrit).toBe(false);
    expect(r.narrative).not.toMatch(/Assassinate/i);
  });
});
