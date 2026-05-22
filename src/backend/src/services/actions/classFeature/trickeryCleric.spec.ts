// Trickery Cleric (2024 PHB) — L3 Blessing of the Trickster.
// Channel Divinity sets `tricksters_blessing_active` on the most-
// injured living ally (or self if alone). The sneak action then
// reads the flag as an advantage source. Long rest clears it.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateChoices, takeAction } from '../../gameEngine.js';
import { makeChar, makeState } from '../../../test-fixtures.js';
import type { Seed } from '../../../types.js';
import { context as ctx } from '../../../contexts/sandbox.js';

afterEach(() => vi.restoreAllMocks());

const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Blessing of the Trickster Test',
  ship_name: 'Blessing of the Trickster Test',
  intro: '',
  seed_id: 'blessing-of-trickster',
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

describe('Trickery Cleric — Blessing of the Trickster', () => {
  it('surfaces the choice for Trickery Cleric with CD available', () => {
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Cleric',
      subclass: 'trickery',
      level: 3,
      class_resource_uses: { channel_divinity: 1 },
    });
    const state = buildState(pc);
    const choices = generateChoices(state, seed, ctx);
    const bot = choices.find(
      (c) =>
        c.action.type === 'use_class_feature' && c.action.featureId === 'blessing_of_the_trickster'
    );
    expect(bot).toBeDefined();
  });

  it('does NOT surface for Life Cleric', () => {
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Cleric',
      subclass: 'life',
      level: 3,
      class_resource_uses: { channel_divinity: 1 },
    });
    const state = buildState(pc);
    const choices = generateChoices(state, seed, ctx);
    const bot = choices.find(
      (c) =>
        c.action.type === 'use_class_feature' && c.action.featureId === 'blessing_of_the_trickster'
    );
    expect(bot).toBeUndefined();
  });

  it('does NOT surface when the blessing is already active', () => {
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Cleric',
      subclass: 'trickery',
      level: 3,
      class_resource_uses: { channel_divinity: 1 },
      tricksters_blessing_active: true,
    });
    const state = buildState(pc);
    const choices = generateChoices(state, seed, ctx);
    const bot = choices.find(
      (c) =>
        c.action.type === 'use_class_feature' && c.action.featureId === 'blessing_of_the_trickster'
    );
    expect(bot).toBeUndefined();
  });

  it('sets the flag on the most-injured ally and consumes CD', async () => {
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Cleric',
      subclass: 'trickery',
      level: 3,
      class_resource_uses: { channel_divinity: 1 },
    });
    const ally = makeChar({
      id: 'ally-1',
      character_class: 'Rogue',
      level: 3,
      hp: 4,
      max_hp: 18,
    });
    const state = buildState(pc, ally);
    const result = await takeAction({
      action: { type: 'use_class_feature', featureId: 'blessing_of_the_trickster' },
      history: [],
      state,
      seed,
      context: ctx,
    });
    const afterAlly = result.newState.characters.find((c) => c.id === 'ally-1');
    const afterPc = result.newState.characters.find((c) => c.id === 'pc-1');
    expect(afterAlly?.tricksters_blessing_active).toBe(true);
    expect(afterPc?.tricksters_blessing_active ?? false).toBe(false);
    expect(afterPc?.class_resource_uses?.channel_divinity).toBe(0);
    expect(result.narrative).toMatch(/Blessing of the Trickster/);
  });

  it('falls back to self when alone in the party', async () => {
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Cleric',
      subclass: 'trickery',
      level: 3,
      class_resource_uses: { channel_divinity: 1 },
    });
    const state = buildState(pc);
    const result = await takeAction({
      action: { type: 'use_class_feature', featureId: 'blessing_of_the_trickster' },
      history: [],
      state,
      seed,
      context: ctx,
    });
    const after = result.newState.characters.find((c) => c.id === 'pc-1');
    expect(after?.tricksters_blessing_active).toBe(true);
  });

  it('long rest clears the flag', async () => {
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Rogue',
      level: 3,
      tricksters_blessing_active: true,
    });
    const state = buildState(pc);
    const result = await takeAction({
      action: { type: 'long_rest' },
      history: [],
      state,
      seed,
      context: ctx,
    });
    const after = result.newState.characters.find((c) => c.id === 'pc-1');
    expect(after?.tricksters_blessing_active ?? false).toBe(false);
  });

  it('rejects for non-Trickery clerics', async () => {
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Cleric',
      subclass: 'life',
      level: 3,
      class_resource_uses: { channel_divinity: 1 },
    });
    const state = buildState(pc);
    const result = await takeAction({
      action: { type: 'use_class_feature', featureId: 'blessing_of_the_trickster' },
      history: [],
      state,
      seed,
      context: ctx,
    });
    expect(result.narrative).toMatch(/Trickery Clerics/);
  });
});
