// Celestial Warlock L3 — Healing Light. Bonus action, pool of
// (1 + warlock level) d6, heal self or ally within 60 ft. Pool
// refills on long rest.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateChoices, takeAction } from '../gameEngine.js';
import { makeChar, makeState } from '../../test-fixtures.js';
import type { Seed } from '../../types.js';
import { context as ctx } from '../../contexts/sandbox.js';

afterEach(() => vi.restoreAllMocks());

const noEnemySeed: Seed = {
  context_id: ctx.id,
  world_name: 'Healing Light Test',
  ship_name: 'Healing Light Test',
  intro: '',
  seed_id: 'healing-light',
  rooms: [{ id: ctx.startRoomId, name: 'Start', desc: '' }],
  connections: { [ctx.startRoomId]: [] },
  enemies: {},
  loot: {},
  npcs: {},
};

function buildState(caster: ReturnType<typeof makeChar>, ally?: ReturnType<typeof makeChar>) {
  const chars = ally ? [caster, ally] : [caster];
  return {
    ...makeState({ id: caster.id }, { current_room: ctx.startRoomId, combat_active: true }),
    characters: chars,
    active_character_id: caster.id,
    initiative_order: [{ id: caster.id, roll: 18, is_enemy: false }],
    initiative_idx: 0,
  };
}

describe('Healing Light — choice surface', () => {
  it('Celestial Warlock L3 with bonus action sees the Healing Light choice', () => {
    const wl = makeChar({
      id: 'wl-1',
      character_class: 'Warlock',
      subclass: 'celestial',
      level: 3,
      cha: 14,
    });
    const state = buildState(wl);
    const choices = generateChoices(state, noEnemySeed, ctx);
    const hl = choices.find((c) => c.action.type === 'use_healing_light');
    expect(hl).toBeDefined();
    expect(hl?.label).toMatch(/Healing Light/);
    expect(hl?.label).toMatch(/4\/4 dice left/); // pool = 1 + 3 = 4
  });

  it('Non-Celestial Warlock does NOT see Healing Light', () => {
    const wl = makeChar({
      id: 'wl-1',
      character_class: 'Warlock',
      subclass: 'fiend',
      level: 3,
    });
    const state = buildState(wl);
    const choices = generateChoices(state, noEnemySeed, ctx);
    const hl = choices.find((c) => c.action.type === 'use_healing_light');
    expect(hl).toBeUndefined();
  });

  it('Celestial Warlock with empty pool does NOT see Healing Light', () => {
    const wl = makeChar({
      id: 'wl-1',
      character_class: 'Warlock',
      subclass: 'celestial',
      level: 3,
      class_resource_uses: { healing_light_used: 4 }, // pool spent
    });
    const state = buildState(wl);
    const choices = generateChoices(state, noEnemySeed, ctx);
    const hl = choices.find((c) => c.action.type === 'use_healing_light');
    expect(hl).toBeUndefined();
  });
});

describe('Healing Light — handler', () => {
  it('Self-heal: spend 1 die, gain HP, decrement pool', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // d6 → 4
    const wl = makeChar({
      id: 'wl-1',
      character_class: 'Warlock',
      subclass: 'celestial',
      level: 3,
      hp: 5,
      max_hp: 20,
      class_resource_uses: {},
    });
    const state = buildState(wl);
    const result = await takeAction({
      action: { type: 'use_healing_light', dice: 1 },
      history: [],
      state,
      seed: noEnemySeed,
      context: ctx,
    });
    const after = result.newState.characters[0];
    expect(after.hp).toBeGreaterThan(5);
    expect(after.class_resource_uses?.healing_light_used).toBe(1);
    // bonus_action_used is set during the handler but the
    // post-takeAction initiative wrap (single-entry initiative
    // order in this fixture) fires FRESH_TURN which clears it.
    // Verify via narrative instead.
    expect(result.narrative).toMatch(/Healing Light/);
  });

  it('Heal an ally: explicit targetCharId', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const wl = makeChar({
      id: 'wl-1',
      character_class: 'Warlock',
      subclass: 'celestial',
      level: 5, // pool = 6
      class_resource_uses: {},
    });
    const ally = makeChar({ id: 'ally-1', hp: 3, max_hp: 30 });
    const state = buildState(wl, ally);
    const result = await takeAction({
      action: { type: 'use_healing_light', dice: 3, targetCharId: 'ally-1' },
      history: [],
      state,
      seed: noEnemySeed,
      context: ctx,
    });
    const afterAlly = result.newState.characters.find((c) => c.id === 'ally-1');
    expect(afterAlly?.hp).toBeGreaterThan(3);
    const afterWl = result.newState.characters.find((c) => c.id === 'wl-1');
    expect(afterWl?.class_resource_uses?.healing_light_used).toBe(3);
  });

  it('Requesting more dice than pool: clamps to remaining', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const wl = makeChar({
      id: 'wl-1',
      character_class: 'Warlock',
      subclass: 'celestial',
      level: 3, // pool = 4
      class_resource_uses: { healing_light_used: 3 }, // 1 left
    });
    const state = buildState(wl);
    const result = await takeAction({
      action: { type: 'use_healing_light', dice: 10 }, // ask for more than left
      history: [],
      state,
      seed: noEnemySeed,
      context: ctx,
    });
    const after = result.newState.characters[0];
    // Should have spent only the 1 remaining die.
    expect(after.class_resource_uses?.healing_light_used).toBe(4);
  });

  it('Non-Celestial Warlock rejected by handler', async () => {
    const wl = makeChar({
      id: 'wl-1',
      character_class: 'Warlock',
      subclass: 'fiend',
      level: 3,
    });
    const state = buildState(wl);
    const result = await takeAction({
      action: { type: 'use_healing_light', dice: 1 },
      history: [],
      state,
      seed: noEnemySeed,
      context: ctx,
    });
    expect(result.narrative).toMatch(/Celestial Warlock feature/);
  });
});
