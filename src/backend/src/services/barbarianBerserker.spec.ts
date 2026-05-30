// RE-2 — Barbarian Path of the Berserker: Intimidating Presence (L14) — as a
// bonus action, each creature of your choice within 30 ft makes a WIS save
// (DC 8 + STR + prof) or is Frightened for 1 minute. 1/long rest, or by
// expending a Rage use.

import type { Character, Enemy, GameState, Seed } from '../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../test-fixtures.js';
import { context as ctx } from '../contexts/sandbox.js';
import { takeAction } from './gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const ENEMY = `${ctx.startRoomId}#0`;
const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Zerk',
  ship_name: 'Zerk',
  intro: '',
  seed_id: 'zerk',
  rooms: [{ id: ctx.startRoomId, name: 'S', desc: '' }],
  enemies: {
    [ctx.startRoomId]: [
      {
        id: ENEMY,
        name: 'Goblin',
        hp: 30,
        ac: 13,
        damage: '1d6',
        toHit: 3,
        xp: 50,
        wis: 10,
      } as unknown as Enemy,
    ],
  },
  loot: {},
  npcs: {},
};

function zerkCombat(over: Partial<Character> = {}): GameState {
  const c = makeChar({
    id: 'pc-1',
    character_class: 'Barbarian',
    subclass: 'berserker',
    level: 14,
    str: 18, // +4; DC = 8 + 4 + 5 prof = 17
    hp: 120,
    max_hp: 120,
    ...over,
  });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: ctx.startRoomId, combat_active: true }),
    characters: [c],
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
        hp: 120,
        maxHp: 120,
        conditions: [],
        condition_durations: {},
      },
      {
        id: ENEMY,
        isEnemy: true,
        pos: { x: 5, y: 5 },
        hp: 30,
        maxHp: 30,
        conditions: [],
        condition_durations: {},
      },
    ],
  } as unknown as GameState;
}

const useIP = async (state: GameState) =>
  takeAction({
    action: { type: 'use_class_feature', featureId: 'intimidating_presence' },
    history: [],
    state,
    seed,
    context: ctx,
  });

describe('Intimidating Presence (L14)', () => {
  it('frightens a nearby enemy that fails the WIS save (and spends the 1/long-rest use)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.05); // enemy d20 ≈ 2 → fails DC 17
    const r = await useIP(zerkCombat());
    const enemy = (r.newState.entities ?? []).find((e) => e.id === ENEMY)!;
    expect(enemy.conditions).toContain('frightened');
    expect(r.newState.characters[0].class_resource_uses?.intimidating_presence_used).toBe(1);
    expect(r.narrative).toMatch(/Intimidating Presence/);
  });

  it('requires a Berserker of level 14', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.05);
    const r = await useIP(zerkCombat({ level: 13 }));
    expect((r.newState.entities ?? []).find((e) => e.id === ENEMY)!.conditions).not.toContain(
      'frightened'
    );
    expect(r.narrative).toMatch(/requires a Berserker of level 14/);
  });

  it('once spent, can be reused by expending a Rage use', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.05);
    const r = await useIP(
      zerkCombat({ class_resource_uses: { intimidating_presence_used: 1, rage_uses: 2 } })
    );
    const enemy = (r.newState.entities ?? []).find((e) => e.id === ENEMY)!;
    expect(enemy.conditions).toContain('frightened');
    expect(r.newState.characters[0].class_resource_uses?.rage_uses).toBe(1); // a Rage use spent
  });

  it('is blocked when spent with no Rage uses left', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.05);
    const r = await useIP(
      zerkCombat({ class_resource_uses: { intimidating_presence_used: 1, rage_uses: 0 } })
    );
    expect((r.newState.entities ?? []).find((e) => e.id === ENEMY)!.conditions).not.toContain(
      'frightened'
    );
    expect(r.narrative).toMatch(/spent/);
  });
});

// ── Retaliation (L10): a reaction melee strike when an adjacent enemy hits ────
function retalCombat(over: Partial<Character> = {}): GameState {
  const c = makeChar({
    id: 'pc-1',
    character_class: 'Barbarian',
    subclass: 'berserker',
    level: 10,
    str: 18,
    hp: 120,
    max_hp: 120,
    equipped_weapon: 'gs-1',
    inventory: [{ instance_id: 'gs-1', id: 'greatsword', name: 'Greatsword' }],
    weapon_proficiencies: ['simple', 'martial'],
    ...over,
  });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: ctx.startRoomId, combat_active: true }),
    characters: [c],
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
        hp: 120,
        maxHp: 120,
        conditions: [],
        condition_durations: {},
      },
      {
        id: ENEMY,
        isEnemy: true,
        pos: { x: 5, y: 5 },
        hp: 30,
        maxHp: 30,
        conditions: [],
        condition_durations: {},
      },
    ],
  } as unknown as GameState;
}

const endTurn = async (state: GameState) =>
  takeAction({ action: { type: 'end_turn' }, history: [], state, seed, context: ctx });

describe('Retaliation (L10)', () => {
  it('a Berserker L10 strikes back when an adjacent enemy damages it', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // enemy hits; barbarian's counter hits
    const r = await endTurn(retalCombat());
    const enemyHp = (r.newState.entities ?? []).find((e) => e.id === ENEMY)!.hp;
    expect(enemyHp).toBeLessThan(30); // the retaliation strike landed
    expect(r.narrative).toMatch(/retaliates/);
  });

  it('does not trigger below Barbarian L10', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const r = await endTurn(retalCombat({ level: 9 }));
    expect((r.newState.entities ?? []).find((e) => e.id === ENEMY)!.hp).toBe(30);
    expect(r.narrative).not.toMatch(/retaliates/);
  });

  it('does not trigger if the reaction was already used', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const r = await endTurn(
      retalCombat({
        turn_actions: {
          action_used: false,
          bonus_action_used: false,
          reaction_used: true,
          free_interaction_used: false,
        },
      })
    );
    expect((r.newState.entities ?? []).find((e) => e.id === ENEMY)!.hp).toBe(30);
    expect(r.narrative).not.toMatch(/retaliates/);
  });
});
