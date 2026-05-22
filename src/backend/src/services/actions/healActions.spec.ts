// Healer feat + Healing Hands (Aasimar) — heal-a-target action
// handlers with different resource costs.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../../test-fixtures.js';
import type { Seed } from '../../types.js';
import { context as ctx } from '../../contexts/sandbox.js';
import { takeAction } from '../gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const noEnemySeed: Seed = {
  context_id: ctx.id,
  world_name: 'Heal Action Test',
  ship_name: 'Heal Action Test',
  intro: '',
  seed_id: 'heal-action',
  rooms: [{ id: ctx.startRoomId, name: 'Start', desc: '' }],
  connections: { [ctx.startRoomId]: [] },
  enemies: {},
  loot: {},
  npcs: {},
};

function buildState(pc: ReturnType<typeof makeChar>, ally: ReturnType<typeof makeChar>) {
  return {
    ...makeState({ id: pc.id }, { current_room: ctx.startRoomId }),
    characters: [pc, ally],
    active_character_id: pc.id,
  };
}

describe('Healer feat — use_healer_kit', () => {
  it('with kit + feat: heals 1d6 + 4 + prof, decrements kit charge', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // d6 → 6
    const healer = makeChar({
      id: 'healer-1',
      level: 5,
      feats: ['healer'],
      inventory: [{ instance_id: 'kit-1', id: 'healers_kit', name: "Healer's Kit", count: 10 }],
    });
    const wounded = makeChar({ id: 'wounded-1', hp: 1, max_hp: 30 });
    const state = buildState(healer, wounded);
    const result = await takeAction({
      action: { type: 'use_healer_kit', targetCharId: 'wounded-1' },
      history: [],
      state,
      seed: noEnemySeed,
      context: ctx,
    });
    const after = result.newState.characters.find((c) => c.id === 'wounded-1');
    // Expected: 6 + 4 + 3 (prof L5) = 13. wounded was at 1 → 14.
    expect(after?.hp).toBe(14);
    const newHealer = result.newState.characters.find((c) => c.id === 'healer-1');
    const newKit = newHealer?.inventory.find((i) => i.id === 'healers_kit');
    expect(newKit?.count).toBe(9);
  });

  it('without the feat → rejected', async () => {
    const healer = makeChar({
      id: 'healer-1',
      level: 5,
      feats: [],
      inventory: [{ instance_id: 'kit-1', id: 'healers_kit', name: "Healer's Kit", count: 10 }],
    });
    const wounded = makeChar({ id: 'wounded-1', hp: 5, max_hp: 30 });
    const state = buildState(healer, wounded);
    const result = await takeAction({
      action: { type: 'use_healer_kit', targetCharId: 'wounded-1' },
      history: [],
      state,
      seed: noEnemySeed,
      context: ctx,
    });
    expect(result.narrative).toMatch(/does not have the Healer feat/);
  });

  it('without a kit → rejected', async () => {
    const healer = makeChar({
      id: 'healer-1',
      level: 5,
      feats: ['healer'],
      inventory: [],
    });
    const wounded = makeChar({ id: 'wounded-1', hp: 5, max_hp: 30 });
    const state = buildState(healer, wounded);
    const result = await takeAction({
      action: { type: 'use_healer_kit', targetCharId: 'wounded-1' },
      history: [],
      state,
      seed: noEnemySeed,
      context: ctx,
    });
    expect(result.narrative).toMatch(/No Healer's Kit/);
  });

  it('last charge removes the kit entirely', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const healer = makeChar({
      id: 'healer-1',
      level: 5,
      feats: ['healer'],
      inventory: [{ instance_id: 'kit-1', id: 'healers_kit', name: "Healer's Kit", count: 1 }],
    });
    const wounded = makeChar({ id: 'wounded-1', hp: 5, max_hp: 30 });
    const state = buildState(healer, wounded);
    const result = await takeAction({
      action: { type: 'use_healer_kit', targetCharId: 'wounded-1' },
      history: [],
      state,
      seed: noEnemySeed,
      context: ctx,
    });
    const newHealer = result.newState.characters.find((c) => c.id === 'healer-1');
    expect(newHealer?.inventory.find((i) => i.id === 'healers_kit')).toBeUndefined();
    expect(result.narrative).toMatch(/kit exhausted/);
  });

  it("target at full HP → rejected (don't waste a charge)", async () => {
    const healer = makeChar({
      id: 'healer-1',
      level: 5,
      feats: ['healer'],
      inventory: [{ instance_id: 'kit-1', id: 'healers_kit', name: "Healer's Kit", count: 10 }],
    });
    const ally = makeChar({ id: 'ally-1', hp: 30, max_hp: 30 });
    const state = buildState(healer, ally);
    const result = await takeAction({
      action: { type: 'use_healer_kit', targetCharId: 'ally-1' },
      history: [],
      state,
      seed: noEnemySeed,
      context: ctx,
    });
    expect(result.narrative).toMatch(/already at full HP/);
  });
});

describe('Healing Hands — Aasimar species feature', () => {
  it('Aasimar heals (prof)d4 HP, consumes daily use', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // d4 → 4
    const aasimar = makeChar({
      id: 'pc-1',
      species: 'aasimar',
      level: 5,
    });
    const wounded = makeChar({ id: 'wounded-1', hp: 5, max_hp: 30 });
    const state = buildState(aasimar, wounded);
    const result = await takeAction({
      action: { type: 'use_healing_hands', targetCharId: 'wounded-1' },
      history: [],
      state,
      seed: noEnemySeed,
      context: ctx,
    });
    const after = result.newState.characters.find((c) => c.id === 'wounded-1');
    // L5 prof = 3 → 3d4. Max roll = 12. wounded 5 + 12 = 17.
    expect(after?.hp).toBe(17);
    const newAasimar = result.newState.characters.find((c) => c.id === 'pc-1');
    expect(newAasimar?.class_resource_uses?.healing_hands_used).toBe(1);
  });

  it('non-Aasimar → rejected', async () => {
    const human = makeChar({ id: 'pc-1', species: 'human', level: 5 });
    const wounded = makeChar({ id: 'wounded-1', hp: 5, max_hp: 30 });
    const state = buildState(human, wounded);
    const result = await takeAction({
      action: { type: 'use_healing_hands', targetCharId: 'wounded-1' },
      history: [],
      state,
      seed: noEnemySeed,
      context: ctx,
    });
    expect(result.narrative).toMatch(/Aasimar species feature/);
  });

  it('already used → rejected until long rest', async () => {
    const aasimar = makeChar({
      id: 'pc-1',
      species: 'aasimar',
      level: 5,
      class_resource_uses: { healing_hands_used: 1 },
    });
    const wounded = makeChar({ id: 'wounded-1', hp: 5, max_hp: 30 });
    const state = buildState(aasimar, wounded);
    const result = await takeAction({
      action: { type: 'use_healing_hands', targetCharId: 'wounded-1' },
      history: [],
      state,
      seed: noEnemySeed,
      context: ctx,
    });
    expect(result.narrative).toMatch(/already used/);
  });
});
