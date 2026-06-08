// SRD Hex (Warlock L1): bonus-action Concentration spell that curses a creature;
// the caster's attack-roll hits vs it deal +1d6 Necrotic. Mirrors Hunter's Mark.

import type { Enemy, GameState, Seed } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { breakConcentration, takeAction } from '../../services/gameEngine.js';
import { makeChar, makeState } from '../../test-fixtures.js';
import { context as ctx } from '../fixtures/testContext.js';

afterEach(() => vi.restoreAllMocks());

const ENEMY = `entry_hall#0`;
const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Hex Test',
  ship_name: 'Hex Test',
  intro: '',
  seed_id: 'hex',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {
    ['entry_hall']: [
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

function warlockState(hexed = false): GameState {
  const char = makeChar({
    id: 'pc-1',
    character_class: 'Warlock',
    level: 5,
    str: 16,
    cha: 16,
    spell_slots_max: { 3: 2 },
    spell_slots_used: {},
    spells_known: ['hex'],
    equipment: { main_hand: 'sw-1' },
    inventory: [{ instance_id: 'sw-1', id: 'shortsword', name: 'Shortsword' }],
    weapon_proficiencies: ['simple', 'martial'],
    ...(hexed ? { hex_target_id: ENEMY } : {}),
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

describe('Hex — cast sets the curse + concentration', () => {
  it('curses the target and starts concentration (no immediate damage)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'hex', slotLevel: 3, targetEnemyId: ENEMY },
      history: [],
      state: warlockState(),
      seed,
      context: ctx,
    });
    const c = r.newState.characters[0];
    expect(c.hex_target_id).toBe(ENEMY);
    expect(c.concentrating_on?.spellId).toBe('hex');
    expect(r.newState.entities?.find((e) => e.id === ENEMY)?.hp).toBe(120); // no cast damage
  });
});

describe('Hex — attack rider', () => {
  it('adds Necrotic damage on a hit against the hexed target', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // d20 → 20, hits
    const r = await takeAction({
      action: { type: 'attack', targetEnemyId: ENEMY },
      history: [],
      state: warlockState(true),
      seed,
      context: ctx,
    });
    expect(r.narrative).toMatch(/Hex 1d6/);
  });

  it('does not fire when no target is hexed', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const r = await takeAction({
      action: { type: 'attack', targetEnemyId: ENEMY },
      history: [],
      state: warlockState(false),
      seed,
      context: ctx,
    });
    expect(r.narrative).not.toMatch(/Hex/);
  });
});

describe('Hex — concentration', () => {
  it('breaking concentration lifts the curse', () => {
    const char = makeChar({
      character_class: 'Warlock',
      level: 5,
      hex_target_id: ENEMY,
      concentrating_on: { spellId: 'hex', rounds_left: 600 },
    });
    const state = makeState({}, { characters: [char] });
    const { char: after } = breakConcentration(char, state, ctx);
    expect(after.hex_target_id).toBeUndefined();
    expect(after.concentrating_on).toBeNull();
  });
});
