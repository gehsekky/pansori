// Glamour Bard (2024 PHB) — Mantle of Inspiration. Bonus action,
// 1 BI use, grants (5 + CHA mod) temp HP to up to 5 ally targets.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateChoices, takeAction } from './gameEngine.js';
import { makeChar, makeState } from '../test-fixtures.js';
import type { Seed } from '../types.js';
import { context as ctx } from '../contexts/sandbox.js';

afterEach(() => vi.restoreAllMocks());

const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Glamour Bard Test',
  ship_name: 'Glamour Bard Test',
  intro: '',
  seed_id: 'glamour-bard',
  rooms: [{ id: ctx.startRoomId, name: 'Start', desc: '' }],
  connections: { [ctx.startRoomId]: [] },
  enemies: {},
  loot: {},
  npcs: {},
};

function buildState(pc: ReturnType<typeof makeChar>, allies: ReturnType<typeof makeChar>[] = []) {
  return {
    ...makeState({ id: pc.id }, { current_room: ctx.startRoomId }),
    characters: [pc, ...allies],
    active_character_id: pc.id,
  };
}

describe('Glamour Bard — Mantle of Inspiration', () => {
  it('Glamour Bard sees Mantle choice when BI available', () => {
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Bard',
      subclass: 'glamour',
      level: 3,
      cha: 16,
      class_resource_uses: { bardic_inspiration: 3 },
    });
    const state = buildState(pc);
    const choices = generateChoices(state, seed, ctx);
    const m = choices.find((c) => c.action.type === 'use_mantle_of_inspiration');
    expect(m).toBeDefined();
    expect(m?.label).toMatch(/Mantle of Inspiration/);
  });

  it('Lore Bard does NOT see Mantle', () => {
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Bard',
      subclass: 'lore',
      level: 3,
      cha: 16,
      class_resource_uses: { bardic_inspiration: 3 },
    });
    const state = buildState(pc);
    const choices = generateChoices(state, seed, ctx);
    const m = choices.find((c) => c.action.type === 'use_mantle_of_inspiration');
    expect(m).toBeUndefined();
  });

  it('Grants temp HP to caster + allies, consumes BI', async () => {
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Bard',
      subclass: 'glamour',
      level: 3,
      cha: 16,
      class_resource_uses: { bardic_inspiration: 3 },
    });
    const fighter = makeChar({ id: 'fighter-1', character_class: 'Fighter', level: 3 });
    const rogue = makeChar({ id: 'rogue-1', character_class: 'Rogue', level: 3 });
    const state = buildState(pc, [fighter, rogue]);
    const result = await takeAction({
      action: { type: 'use_mantle_of_inspiration' },
      history: [],
      state,
      seed,
      context: ctx,
    });
    const afterPc = result.newState.characters.find((c) => c.id === 'pc-1');
    const afterFighter = result.newState.characters.find((c) => c.id === 'fighter-1');
    const afterRogue = result.newState.characters.find((c) => c.id === 'rogue-1');
    // 5 + CHA mod (3) = 8 temp HP
    expect(afterPc?.temp_hp).toBe(8);
    expect(afterFighter?.temp_hp).toBe(8);
    expect(afterRogue?.temp_hp).toBe(8);
    expect(afterPc?.class_resource_uses?.bardic_inspiration).toBe(2);
    expect(result.narrative).toMatch(/Mantle of Inspiration/);
  });

  it('Empty BI pool: rejected', async () => {
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Bard',
      subclass: 'glamour',
      level: 3,
      cha: 16,
      class_resource_uses: { bardic_inspiration: 0 },
    });
    const state = buildState(pc);
    const result = await takeAction({
      action: { type: 'use_mantle_of_inspiration' },
      history: [],
      state,
      seed,
      context: ctx,
    });
    expect(result.narrative).toMatch(/No Bardic Inspiration uses remaining/);
  });
});
