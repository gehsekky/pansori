// Soulknife Rogue (2024 PHB). MVP: subclass-select grants the
// Psychic Blade weapon (1d6 psychic, finesse, thrown). Player
// equips it; standard attack handler + Sneak Attack apply.
// Deferred: Psionic Energy dice pool (resource), damage scaling
// to 1d8/1d10/1d12 at L5/L11/L17, Soul Blades (L9 Homing Strikes
// + Psychic Teleportation), Psychic Veil (L13).

import { describe, expect, it } from 'vitest';
import { makeChar, makeState } from '../test-fixtures.js';
import type { Seed } from '../types.js';
import { context as ctx } from '../contexts/sandbox.js';
import { takeAction } from './gameEngine.js';

const noEnemySeed: Seed = {
  context_id: ctx.id,
  world_name: 'Soulknife Test',
  ship_name: 'Soulknife Test',
  intro: '',
  seed_id: 'soulknife',
  rooms: [{ id: ctx.startRoomId, name: 'Start', desc: '' }],
  connections: { [ctx.startRoomId]: [] },
  enemies: {},
  loot: {},
  npcs: {},
};

describe('Soulknife Rogue — subclass-select grants Psychic Blade', () => {
  it("selecting soulknife adds psychic_blade to the rogue's inventory", async () => {
    const rogue = makeChar({
      id: 'pc-1',
      character_class: 'Rogue',
      level: 3,
      dex: 16,
    });
    const state = {
      ...makeState({ id: 'pc-1' }, { current_room: ctx.startRoomId }),
      characters: [rogue],
      active_character_id: 'pc-1',
    };
    const result = await takeAction({
      action: { type: 'select_subclass', subclass: 'soulknife' },
      history: [],
      state,
      seed: noEnemySeed,
      context: ctx,
    });
    const after = result.newState.characters[0];
    expect(after.subclass).toBe('soulknife');
    expect(after.inventory.some((i) => i.id === 'psychic_blade')).toBe(true);
    expect(result.narrative).toMatch(/Psychic Blades manifest/);
  });

  it('non-rogue selecting soulknife: subclass set but no blade granted', async () => {
    const fighter = makeChar({
      id: 'pc-1',
      character_class: 'Fighter',
      level: 3,
    });
    const state = {
      ...makeState({ id: 'pc-1' }, { current_room: ctx.startRoomId }),
      characters: [fighter],
      active_character_id: 'pc-1',
    };
    const result = await takeAction({
      action: { type: 'select_subclass', subclass: 'soulknife' },
      history: [],
      state,
      seed: noEnemySeed,
      context: ctx,
    });
    const after = result.newState.characters[0];
    expect(after.subclass).toBe('soulknife');
    // Without hasClass(rogue) the blade isn't granted — this is a
    // defensive gate (the UI wouldn't offer 'soulknife' to a Fighter
    // anyway, but the handler enforces).
    expect(after.inventory.some((i) => i.id === 'psychic_blade')).toBe(false);
  });

  it('idempotent: re-selecting soulknife rejects (subclass already set)', async () => {
    const rogue = makeChar({
      id: 'pc-1',
      character_class: 'Rogue',
      level: 3,
      subclass: 'soulknife',
    });
    const state = {
      ...makeState({ id: 'pc-1' }, { current_room: ctx.startRoomId }),
      characters: [rogue],
      active_character_id: 'pc-1',
    };
    const result = await takeAction({
      action: { type: 'select_subclass', subclass: 'soulknife' },
      history: [],
      state,
      seed: noEnemySeed,
      context: ctx,
    });
    expect(result.narrative).toMatch(/already chosen/);
  });
});
