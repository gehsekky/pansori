// Six lighter subclass exposures. Each is selectable; mechanical
// features are mostly deferred. Diviner Wizard gets a starter
// Portent dice roll on long rest (interception deferred).

import { describe, expect, it } from 'vitest';
import { makeChar, makeState } from '../test-fixtures.js';
import type { Seed } from '../types.js';
import { context as ctx } from '../contexts/sandbox.js';
import { generateChoices } from './gameEngine.js';

const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Subclass Picker Test',
  ship_name: 'Subclass Picker Test',
  intro: '',
  seed_id: 'subclass-picker',
  rooms: [{ id: ctx.startRoomId, name: 'Start', desc: '' }],
  connections: { [ctx.startRoomId]: [] },
  enemies: {},
  loot: {},
  npcs: {},
};

function buildState(pc: ReturnType<typeof makeChar>) {
  return {
    ...makeState({ id: pc.id }, { current_room: ctx.startRoomId }),
    characters: [pc],
    active_character_id: pc.id,
  };
}

function pickerOffers(pc: ReturnType<typeof makeChar>): string[] {
  const state = buildState(pc);
  return generateChoices(state, seed, ctx)
    .filter((c) => c.action.type === 'select_subclass')
    .map((c) => (c.action.type === 'select_subclass' ? c.action.subclass : ''))
    .filter(Boolean);
}

describe('Subclass picker — SRD-only baseline', () => {
  it('Wizard L3 offers evoker', () => {
    const pc = makeChar({ id: 'pc', character_class: 'Wizard', level: 3 });
    expect(pickerOffers(pc)).toContain('evoker');
  });
});
