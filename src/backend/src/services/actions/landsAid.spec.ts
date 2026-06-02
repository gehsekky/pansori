// Land Druid L3 — Land's Aid (Channel Nature). 2/long rest pool,
// bonus action, choose heal OR damage (necrotic/radiant), CON save
// halves on damage.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateChoices, takeAction } from '../gameEngine.js';
import { makeChar, makeState } from '../../test-fixtures.js';
import type { Seed } from '../../types.js';
import { context as ctx } from '../../contexts/sandbox.js';

afterEach(() => vi.restoreAllMocks());

const enemyId = `entry_hall#0`;

const seed: Seed = {
  context_id: ctx.id,
  world_name: "Land's Aid Test",
  ship_name: "Land's Aid Test",
  intro: '',
  seed_id: 'lands-aid',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {
    ['entry_hall']: [
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

function buildDruid(opts: { subclass?: string; uses?: number } = {}) {
  return makeChar({
    id: 'druid-1',
    character_class: 'Druid',
    level: 5,
    wis: 16,
    hp: 30,
    max_hp: 30,
    subclass: opts.subclass ?? 'land',
    class_resource_uses: opts.uses != null ? { lands_aid_used: opts.uses } : {},
  });
}

function buildState(druid: ReturnType<typeof makeChar>, ally?: ReturnType<typeof makeChar>) {
  const chars = ally ? [druid, ally] : [druid];
  return {
    ...makeState({ id: druid.id }, { current_room: 'entry_hall', combat_active: true }),
    characters: chars,
    active_character_id: druid.id,
    initiative_order: [
      { id: druid.id, roll: 18, is_enemy: false },
      { id: enemyId, roll: 5, is_enemy: true },
    ],
    initiative_idx: 0,
    entities: [
      {
        id: druid.id,
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

describe("Land Druid — Land's Aid choice surface", () => {
  it('L3 Land Druid sees 3 choices (heal + necrotic + radiant)', () => {
    const druid = buildDruid({ subclass: 'land' });
    const state = buildState(druid);
    const choices = generateChoices(state, seed, ctx);
    const laChoices = choices.filter((c) => c.action.type === 'use_lands_aid');
    expect(laChoices).toHaveLength(3);
  });

  it("Moon Druid sees no Land's Aid", () => {
    const druid = buildDruid({ subclass: 'moon' });
    const state = buildState(druid);
    const choices = generateChoices(state, seed, ctx);
    const laChoices = choices.filter((c) => c.action.type === 'use_lands_aid');
    expect(laChoices).toHaveLength(0);
  });

  it("Land Druid with both uses spent sees no Land's Aid", () => {
    const druid = buildDruid({ subclass: 'land', uses: 2 });
    const state = buildState(druid);
    const choices = generateChoices(state, seed, ctx);
    const laChoices = choices.filter((c) => c.action.type === 'use_lands_aid');
    expect(laChoices).toHaveLength(0);
  });
});

describe("Land Druid — Land's Aid handler", () => {
  it('heal variant: heals most-injured ally + decrements pool', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const druid = buildDruid({ subclass: 'land' });
    const ally = makeChar({ id: 'ally-1', hp: 5, max_hp: 30 });
    const state = buildState(druid, ally);
    const result = await takeAction({
      action: { type: 'use_lands_aid', variant: 'heal' },
      history: [],
      state,
      seed,
      context: ctx,
    });
    const afterAlly = result.newState.characters.find((c) => c.id === 'ally-1');
    expect(afterAlly?.hp).toBeGreaterThan(5);
    const afterDruid = result.newState.characters.find((c) => c.id === druid.id);
    expect(afterDruid?.class_resource_uses?.lands_aid_used).toBe(1);
    expect(result.narrative).toMatch(/Land's Aid/);
  });

  it('harm variant: damages enemy with CON save', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // enemy fails save
    const druid = buildDruid({ subclass: 'land' });
    const state = buildState(druid);
    const result = await takeAction({
      action: { type: 'use_lands_aid', variant: 'harm_radiant', targetEnemyId: enemyId },
      history: [],
      state,
      seed,
      context: ctx,
    });
    expect(result.narrative).toMatch(/Land's Aid/);
    expect(result.narrative).toMatch(/radiant/);
    const ent = result.newState.entities?.find((e) => e.id === enemyId);
    expect(ent?.hp).toBeLessThan(50);
  });

  it('Moon Druid rejected by handler', async () => {
    const druid = buildDruid({ subclass: 'moon' });
    const state = buildState(druid);
    const result = await takeAction({
      action: { type: 'use_lands_aid', variant: 'heal' },
      history: [],
      state,
      seed,
      context: ctx,
    });
    expect(result.narrative).toMatch(/Land Druid feature/);
  });
});
