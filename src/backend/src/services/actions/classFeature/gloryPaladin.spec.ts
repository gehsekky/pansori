// Glory Paladin (2024 PHB Oath of Glory) — L3 Inspiring Smite.
// Channel Divinity AoE temp HP grant (2d8 + paladin level) to
// caster + all living party allies.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateChoices, takeAction } from '../../gameEngine.js';
import { makeChar, makeState } from '../../../test-fixtures.js';
import type { Seed } from '../../../types.js';
import { context as ctx } from '../../../contexts/sandbox.js';

afterEach(() => vi.restoreAllMocks());

const enemyId = `${ctx.startRoomId}#0`;
const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Inspiring Smite Test',
  ship_name: 'Inspiring Smite Test',
  intro: '',
  seed_id: 'inspiring-smite',
  rooms: [{ id: ctx.startRoomId, name: 'Start', desc: '' }],
  connections: { [ctx.startRoomId]: [] },
  enemies: {
    [ctx.startRoomId]: [
      { id: enemyId, name: 'Goblin', hp: 50, ac: 10, damage: '1d6', toHit: 3, xp: 20 },
    ],
  },
  loot: {},
  npcs: {},
};

function buildState(pc: ReturnType<typeof makeChar>, ally?: ReturnType<typeof makeChar>) {
  const chars = ally ? [pc, ally] : [pc];
  return {
    ...makeState({ id: pc.id }, { current_room: ctx.startRoomId, combat_active: true }),
    characters: chars,
    active_character_id: pc.id,
    initiative_order: [
      { id: pc.id, roll: 18, is_enemy: false },
      { id: enemyId, roll: 5, is_enemy: true },
    ],
    initiative_idx: 0,
    entities: [
      {
        id: pc.id,
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

describe('Glory Paladin — Inspiring Smite', () => {
  it('Glory Paladin sees Inspiring Smite choice when CD available', () => {
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Paladin',
      subclass: 'glory',
      level: 5,
      class_resource_uses: { channel_divinity: 2 },
    });
    const state = buildState(pc);
    const choices = generateChoices(state, seed, ctx);
    const is = choices.find(
      (c) => c.action.type === 'use_class_feature' && c.action.featureId === 'inspiring_smite'
    );
    expect(is).toBeDefined();
  });

  it('Devotion Paladin does NOT see Inspiring Smite', () => {
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Paladin',
      subclass: 'devotion',
      level: 5,
      class_resource_uses: { channel_divinity: 2 },
    });
    const state = buildState(pc);
    const choices = generateChoices(state, seed, ctx);
    const is = choices.find(
      (c) => c.action.type === 'use_class_feature' && c.action.featureId === 'inspiring_smite'
    );
    expect(is).toBeUndefined();
  });

  it('Grants temp HP to caster + ally, consumes CD', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Paladin',
      subclass: 'glory',
      level: 5,
      class_resource_uses: { channel_divinity: 2 },
    });
    const ally = makeChar({ id: 'ally-1', character_class: 'Rogue', level: 5 });
    const state = buildState(pc, ally);
    const result = await takeAction({
      action: { type: 'use_class_feature', featureId: 'inspiring_smite' },
      history: [],
      state,
      seed,
      context: ctx,
    });
    const afterPc = result.newState.characters.find((c) => c.id === 'pc-1');
    const afterAlly = result.newState.characters.find((c) => c.id === 'ally-1');
    expect(afterPc?.temp_hp).toBeGreaterThan(0);
    expect(afterAlly?.temp_hp).toBeGreaterThan(0);
    expect(afterPc?.class_resource_uses?.channel_divinity).toBe(1);
    expect(result.narrative).toMatch(/Inspiring Smite/);
  });

  it('Devotion Paladin rejected by handler', async () => {
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Paladin',
      subclass: 'devotion',
      level: 5,
      class_resource_uses: { channel_divinity: 2 },
    });
    const state = buildState(pc);
    const result = await takeAction({
      action: { type: 'use_class_feature', featureId: 'inspiring_smite' },
      history: [],
      state,
      seed,
      context: ctx,
    });
    expect(result.narrative).toMatch(/Glory Paladins/);
  });
});
