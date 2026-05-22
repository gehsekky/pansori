// Light Cleric (2024 PHB) — Radiance of the Dawn Channel Divinity.
// AoE radiant damage in 30 ft, CON save halves.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateChoices, takeAction } from '../../gameEngine.js';
import { makeChar, makeState } from '../../../test-fixtures.js';
import type { Seed } from '../../../types.js';
import { context as ctx } from '../../../contexts/sandbox.js';

afterEach(() => vi.restoreAllMocks());

const enemyId = `${ctx.startRoomId}#0`;

const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Light Cleric Test',
  ship_name: 'Light Cleric Test',
  intro: '',
  seed_id: 'light-cleric',
  rooms: [{ id: ctx.startRoomId, name: 'Start', desc: '' }],
  connections: { [ctx.startRoomId]: [] },
  enemies: {
    [ctx.startRoomId]: [
      {
        id: enemyId,
        name: 'Goblin',
        hp: 50,
        ac: 10,
        damage: '1d6',
        toHit: 3,
        xp: 20,
        con: 10,
      },
    ],
  },
  loot: {},
  npcs: {},
};

function buildState(opts: { subclass?: string; cdUses?: number } = {}) {
  const pc = makeChar({
    id: 'pc-1',
    character_class: 'Cleric',
    level: 5,
    wis: 16,
    hp: 30,
    max_hp: 30,
    subclass: opts.subclass,
    class_resource_uses: { channel_divinity: opts.cdUses ?? 2 },
  });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: ctx.startRoomId, combat_active: true }),
    characters: [pc],
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
        pos: { x: 4, y: 5 },
        hp: 30,
        maxHp: 30,
        conditions: [],
        condition_durations: {},
      },
      {
        id: enemyId,
        isEnemy: true,
        pos: { x: 5, y: 5 },
        hp: 50,
        maxHp: 50,
        conditions: [],
        condition_durations: {},
      },
    ],
  };
}

describe('Light Cleric — Radiance of the Dawn', () => {
  it('Light subclass surfaces the RotD choice in combat with enemies', () => {
    const state = buildState({ subclass: 'light', cdUses: 1 });
    const choices = generateChoices(state, seed, ctx);
    const rotd = choices.find(
      (c) => c.action.type === 'use_class_feature' && c.action.featureId === 'radiance_of_the_dawn'
    );
    expect(rotd).toBeDefined();
    expect(rotd?.label).toMatch(/Radiance of the Dawn/);
  });

  it('Non-Light cleric does NOT see the RotD choice', () => {
    const state = buildState({ subclass: 'life', cdUses: 1 });
    const choices = generateChoices(state, seed, ctx);
    const rotd = choices.find(
      (c) => c.action.type === 'use_class_feature' && c.action.featureId === 'radiance_of_the_dawn'
    );
    expect(rotd).toBeUndefined();
  });

  it('handler hits enemies in range, deals radiant damage, consumes CD', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const state = buildState({ subclass: 'light', cdUses: 2 });
    const result = await takeAction({
      action: { type: 'use_class_feature', featureId: 'radiance_of_the_dawn' },
      history: [],
      state,
      seed,
      context: ctx,
    });
    expect(result.narrative).toMatch(/Radiance of the Dawn/);
    expect(result.narrative).toMatch(/radiant/);
    const ent = result.newState.entities?.find((e) => e.id === enemyId);
    expect(ent?.hp).toBeLessThan(50); // damage applied
    const pc = result.newState.characters[0];
    expect(pc.class_resource_uses?.channel_divinity).toBe(1);
  });

  it('non-Light cleric rejected by handler', async () => {
    const state = buildState({ subclass: 'life', cdUses: 1 });
    const result = await takeAction({
      action: { type: 'use_class_feature', featureId: 'radiance_of_the_dawn' },
      history: [],
      state,
      seed,
      context: ctx,
    });
    expect(result.narrative).toMatch(/Only Light Clerics/);
  });

  it('no CD remaining → rejected', async () => {
    const state = buildState({ subclass: 'light', cdUses: 0 });
    const result = await takeAction({
      action: { type: 'use_class_feature', featureId: 'radiance_of_the_dawn' },
      history: [],
      state,
      seed,
      context: ctx,
    });
    expect(result.narrative).toMatch(/No Channel Divinity uses remaining/);
  });
});
