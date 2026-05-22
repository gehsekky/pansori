// Clockwork Soul Sorcerer (2024 PHB) — L3 Bastion of Law. Bonus
// action, spend 1 sorcery point, grant 5 temp HP to caster or a
// living ally. Pansori MVP fixes the spend at 1 SP for choice-list
// clarity (RAW allows 1-5 SP for 5N temp HP).

import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateChoices, takeAction } from '../../gameEngine.js';
import { makeChar, makeState } from '../../../test-fixtures.js';
import type { Seed } from '../../../types.js';
import { context as ctx } from '../../../contexts/sandbox.js';

afterEach(() => vi.restoreAllMocks());

const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Bastion of Law Test',
  ship_name: 'Bastion of Law Test',
  intro: '',
  seed_id: 'bastion-of-law',
  rooms: [{ id: ctx.startRoomId, name: 'Start', desc: '' }],
  connections: { [ctx.startRoomId]: [] },
  enemies: {},
  loot: {},
  npcs: {},
};

function buildState(pc: ReturnType<typeof makeChar>, ally?: ReturnType<typeof makeChar>) {
  const chars = ally ? [pc, ally] : [pc];
  return {
    ...makeState({ id: pc.id }, { current_room: ctx.startRoomId }),
    characters: chars,
    active_character_id: pc.id,
  };
}

describe('Clockwork Soul Sorcerer — Bastion of Law', () => {
  it('surfaces the choice for a Clockwork Soul Sorcerer with sorcery points', () => {
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Sorcerer',
      subclass: 'clockwork_soul',
      level: 3,
      class_resource_uses: { sorcery_points: 3 },
    });
    const state = buildState(pc);
    const choices = generateChoices(state, seed, ctx);
    const bol = choices.find(
      (c) => c.action.type === 'use_class_feature' && c.action.featureId === 'bastion_of_law'
    );
    expect(bol).toBeDefined();
  });

  it('does NOT surface for Draconic Sorcerer', () => {
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Sorcerer',
      subclass: 'draconic',
      level: 3,
      class_resource_uses: { sorcery_points: 3 },
    });
    const state = buildState(pc);
    const choices = generateChoices(state, seed, ctx);
    const bol = choices.find(
      (c) => c.action.type === 'use_class_feature' && c.action.featureId === 'bastion_of_law'
    );
    expect(bol).toBeUndefined();
  });

  it('does NOT surface when bonus action is already used', () => {
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Sorcerer',
      subclass: 'clockwork_soul',
      level: 3,
      class_resource_uses: { sorcery_points: 3 },
      turn_actions: {
        action_used: false,
        bonus_action_used: true,
        reaction_used: false,
        free_interaction_used: false,
      },
    });
    const state = buildState(pc);
    const choices = generateChoices(state, seed, ctx);
    const bol = choices.find(
      (c) => c.action.type === 'use_class_feature' && c.action.featureId === 'bastion_of_law'
    );
    expect(bol).toBeUndefined();
  });

  it('grants 5 temp HP to the most-injured ally and consumes 1 SP', async () => {
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Sorcerer',
      subclass: 'clockwork_soul',
      level: 3,
      class_resource_uses: { sorcery_points: 3 },
    });
    const ally = makeChar({
      id: 'ally-1',
      character_class: 'Fighter',
      level: 3,
      hp: 5,
      max_hp: 20,
    });
    const state = buildState(pc, ally);
    const result = await takeAction({
      action: { type: 'use_class_feature', featureId: 'bastion_of_law' },
      history: [],
      state,
      seed,
      context: ctx,
    });
    const afterAlly = result.newState.characters.find((c) => c.id === 'ally-1');
    const afterPc = result.newState.characters.find((c) => c.id === 'pc-1');
    expect(afterAlly?.temp_hp).toBe(5);
    expect(afterPc?.temp_hp ?? 0).toBe(0);
    expect(afterPc?.class_resource_uses?.sorcery_points).toBe(2);
    expect(afterPc?.turn_actions.bonus_action_used).toBe(true);
    expect(result.narrative).toMatch(/Bastion of Law/);
  });

  it('falls back to self when no ally is in the party', async () => {
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Sorcerer',
      subclass: 'clockwork_soul',
      level: 3,
      hp: 10,
      max_hp: 18,
      class_resource_uses: { sorcery_points: 3 },
    });
    const state = buildState(pc);
    const result = await takeAction({
      action: { type: 'use_class_feature', featureId: 'bastion_of_law' },
      history: [],
      state,
      seed,
      context: ctx,
    });
    const after = result.newState.characters.find((c) => c.id === 'pc-1');
    expect(after?.temp_hp).toBe(5);
  });

  it('rejects when sorcery points are exhausted', async () => {
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Sorcerer',
      subclass: 'clockwork_soul',
      level: 3,
      class_resource_uses: { sorcery_points: 0 },
    });
    const state = buildState(pc);
    const result = await takeAction({
      action: { type: 'use_class_feature', featureId: 'bastion_of_law' },
      history: [],
      state,
      seed,
      context: ctx,
    });
    expect(result.narrative).toMatch(/sorcery points/);
  });

  it('rejects for non-Clockwork Soul sorcerers', async () => {
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Sorcerer',
      subclass: 'draconic',
      level: 3,
      class_resource_uses: { sorcery_points: 3 },
    });
    const state = buildState(pc);
    const result = await takeAction({
      action: { type: 'use_class_feature', featureId: 'bastion_of_law' },
      history: [],
      state,
      seed,
      context: ctx,
    });
    expect(result.narrative).toMatch(/Clockwork Soul/);
  });
});
