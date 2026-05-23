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

describe('Subclass picker exposes the new options', () => {
  it('Wizard L3 offers diviner + illusionist', () => {
    const pc = makeChar({ id: 'pc', character_class: 'Wizard', level: 3 });
    expect(pickerOffers(pc)).toEqual(expect.arrayContaining(['diviner', 'illusionist']));
  });

  it('Warlock L3 offers great_old_one (Warlock subclass unlocks at L1 → also at L3)', () => {
    const pc = makeChar({ id: 'pc', character_class: 'Warlock', level: 3 });
    expect(pickerOffers(pc)).toContain('great_old_one');
  });

  it('Druid L3 offers sea + stars', () => {
    const pc = makeChar({ id: 'pc', character_class: 'Druid', level: 3 });
    expect(pickerOffers(pc)).toEqual(expect.arrayContaining(['sea', 'stars']));
  });

  it('Fighter L3 offers psi_warrior', () => {
    const pc = makeChar({ id: 'pc', character_class: 'Fighter', level: 3 });
    expect(pickerOffers(pc)).toContain('psi_warrior');
  });

  it('Rogue L3 offers arcane_trickster', () => {
    const pc = makeChar({ id: 'pc', character_class: 'Rogue', level: 3 });
    expect(pickerOffers(pc)).toContain('arcane_trickster');
  });

  it('Sorcerer L3 offers aberrant_mind + clockwork_soul', () => {
    const pc = makeChar({ id: 'pc', character_class: 'Sorcerer', level: 3 });
    expect(pickerOffers(pc)).toEqual(expect.arrayContaining(['aberrant_mind', 'clockwork_soul']));
  });

  it('Monk L3 offers elements', () => {
    const pc = makeChar({ id: 'pc', character_class: 'Monk', level: 3 });
    expect(pickerOffers(pc)).toContain('elements');
  });
});
