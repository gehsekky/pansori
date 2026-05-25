// RE-2 — Hunter's Mark (SRD 5.2.1, Ranger L1): bonus-action Concentration
// spell that marks a creature; the caster's attack-roll hits vs it deal +1d6
// Force (d10 at Ranger L20 — Foe Slayer). Unblocks the Hunter-subclass riders.

import type { Enemy, GameState, Seed } from '../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { breakConcentration, takeAction } from './gameEngine.js';
import { makeChar, makeState } from '../test-fixtures.js';
import { context as ctx } from '../contexts/sandbox.js';

afterEach(() => vi.restoreAllMocks());

const ENEMY = `${ctx.startRoomId}#0`;
const seed: Seed = {
  context_id: ctx.id,
  world_name: "Hunter's Mark Test",
  ship_name: "Hunter's Mark Test",
  intro: '',
  seed_id: 'hunters-mark',
  rooms: [{ id: ctx.startRoomId, name: 'Start', desc: '' }],
  connections: { [ctx.startRoomId]: [] },
  enemies: {
    [ctx.startRoomId]: [
      {
        id: ENEMY,
        name: 'Stag',
        hp: 120,
        ac: 5,
        damage: '1d6',
        toHit: 3,
        xp: 50,
      } as unknown as Enemy,
    ],
  },
  loot: {},
  npcs: {},
};

function rangerState(level: number, marked = false): GameState {
  const char = makeChar({
    id: 'pc-1',
    character_class: 'Ranger',
    level,
    str: 16,
    wis: 16,
    spell_slots_max: { 1: 2 },
    spell_slots_used: {},
    spells_known: ['hunters_mark'],
    equipped_weapon: 'sw-1',
    inventory: [{ instance_id: 'sw-1', id: 'shortsword', name: 'Shortsword' }],
    weapon_proficiencies: ['simple', 'martial'],
    ...(marked ? { hunters_mark_target_id: ENEMY } : {}),
  });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: ctx.startRoomId, combat_active: true }),
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

describe("Hunter's Mark — cast sets the mark + concentration", () => {
  it('marks the target and starts concentration (no immediate damage)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'hunters_mark', slotLevel: 1, targetEnemyId: ENEMY },
      history: [],
      state: rangerState(5),
      seed,
      context: ctx,
    });
    const c = r.newState.characters[0];
    expect(c.hunters_mark_target_id).toBe(ENEMY);
    expect(c.concentrating_on?.spellId).toBe('hunters_mark');
    // The target took no damage from the cast itself.
    expect(r.newState.entities?.find((e) => e.id === ENEMY)?.hp).toBe(120);
  });
});

describe("Hunter's Mark — attack rider", () => {
  it('adds Force damage on a hit against the marked target', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // d20 → 20, hits
    const r = await takeAction({
      action: { type: 'attack', targetEnemyId: ENEMY },
      history: [],
      state: rangerState(5, true),
      seed,
      context: ctx,
    });
    expect(r.narrative).toMatch(/Hunter's Mark 1d6/);
  });

  it('Foe Slayer (L20) upgrades the die to 1d10', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const r = await takeAction({
      action: { type: 'attack', targetEnemyId: ENEMY },
      history: [],
      state: rangerState(20, true),
      seed,
      context: ctx,
    });
    expect(r.narrative).toMatch(/Hunter's Mark 1d10/);
  });

  it('does not fire when no target is marked', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const r = await takeAction({
      action: { type: 'attack', targetEnemyId: ENEMY },
      history: [],
      state: rangerState(5, false),
      seed,
      context: ctx,
    });
    expect(r.narrative).not.toMatch(/Hunter's Mark/);
  });
});

describe("Hunter's Mark — concentration", () => {
  it('breaking concentration clears the mark', () => {
    const char = makeChar({
      character_class: 'Ranger',
      level: 5,
      hunters_mark_target_id: ENEMY,
      concentrating_on: { spellId: 'hunters_mark', rounds_left: 600 },
    });
    const state = makeState({}, { characters: [char] });
    const { char: after } = breakConcentration(char, state, ctx);
    expect(after.hunters_mark_target_id).toBeUndefined();
    expect(after.concentrating_on).toBeNull();
  });
});
