// Ancients Paladin (2024 PHB Oath of the Ancients) — L3 Channel
// Divinity Nature's Wrath. Target a creature within 10 ft, DEX
// save or restrained for 5 rounds.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateChoices, takeAction } from '../../gameEngine.js';
import { makeChar, makeState } from '../../../test-fixtures.js';
import type { Seed } from '../../../types.js';
import { context as ctx } from '../../../contexts/sandbox.js';

afterEach(() => vi.restoreAllMocks());

const enemyId = `${ctx.startRoomId}#0`;

const seed: Seed = {
  context_id: ctx.id,
  world_name: "Nature's Wrath Test",
  ship_name: "Nature's Wrath Test",
  intro: '',
  seed_id: 'natures-wrath',
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
        dex: 10,
      },
    ],
  },
  loot: {},
  npcs: {},
};

function buildPaladin(opts: { subclass?: string; cdUses?: number } = {}) {
  return makeChar({
    id: 'pc-1',
    character_class: 'Paladin',
    subclass: opts.subclass ?? 'ancients',
    level: 5,
    cha: 16,
    hp: 30,
    max_hp: 30,
    class_resource_uses: { channel_divinity: opts.cdUses ?? 2 },
  });
}

function buildState(pc: ReturnType<typeof makeChar>) {
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

describe("Ancients Paladin — Nature's Wrath", () => {
  it("Ancients Paladin sees Nature's Wrath choice in combat", () => {
    const pc = buildPaladin({ subclass: 'ancients' });
    const state = buildState(pc);
    const choices = generateChoices(state, seed, ctx);
    const nw = choices.find(
      (c) => c.action.type === 'use_class_feature' && c.action.featureId === 'natures_wrath'
    );
    expect(nw).toBeDefined();
  });

  it("Devotion Paladin does NOT see Nature's Wrath", () => {
    const pc = buildPaladin({ subclass: 'devotion' });
    const state = buildState(pc);
    const choices = generateChoices(state, seed, ctx);
    const nw = choices.find(
      (c) => c.action.type === 'use_class_feature' && c.action.featureId === 'natures_wrath'
    );
    expect(nw).toBeUndefined();
  });

  it('Failed save: enemy gets restrained condition', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01); // enemy fails save
    const pc = buildPaladin({ subclass: 'ancients' });
    const state = buildState(pc);
    const result = await takeAction({
      action: { type: 'use_class_feature', featureId: 'natures_wrath' },
      history: [],
      state,
      seed,
      context: ctx,
    });
    const ent = result.newState.entities?.find((e) => e.id === enemyId);
    expect(ent?.conditions).toContain('restrained');
    expect(result.narrative).toMatch(/Nature's Wrath/);
    expect(result.narrative).toMatch(/restrain/i);
    const pcAfter = result.newState.characters[0];
    expect(pcAfter.class_resource_uses?.channel_divinity).toBe(1);
  });

  it('Devotion Paladin rejected by handler', async () => {
    const pc = buildPaladin({ subclass: 'devotion' });
    const state = buildState(pc);
    const result = await takeAction({
      action: { type: 'use_class_feature', featureId: 'natures_wrath' },
      history: [],
      state,
      seed,
      context: ctx,
    });
    expect(result.narrative).toMatch(/Ancients Paladins/);
  });

  it('No CD remaining: rejected', async () => {
    const pc = buildPaladin({ subclass: 'ancients', cdUses: 0 });
    const state = buildState(pc);
    const result = await takeAction({
      action: { type: 'use_class_feature', featureId: 'natures_wrath' },
      history: [],
      state,
      seed,
      context: ctx,
    });
    expect(result.narrative).toMatch(/No Channel Divinity uses remaining/);
  });
});
