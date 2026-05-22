// Aasimar species (2024 PHB) — celestial-touched mortal with
// resistance to necrotic + radiant damage, darkvision 60 ft,
// Light cantrip innate.
//
// Resistance is data-driven: `computeEnemyAttack` reads
// `SRD_SPECIES[char.species]?.resistances` and halves matching
// damage. This spec verifies the wiring works end-to-end.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../test-fixtures.js';
import { SRD_SPECIES } from '../contexts/srd/index.js';
import type { Seed } from '../types.js';
import { context as ctx } from '../contexts/sandbox.js';
import { takeAction } from './gameEngine.js';

afterEach(() => vi.restoreAllMocks());

describe('Aasimar species data', () => {
  it('is registered in SRD_SPECIES with the expected core traits', () => {
    const aasimar = SRD_SPECIES['aasimar'];
    expect(aasimar).toBeDefined();
    expect(aasimar?.size).toBe('medium');
    expect(aasimar?.speedFt).toBe(30);
    expect(aasimar?.darkvisionFt).toBe(60);
    expect(aasimar?.resistances).toEqual(expect.arrayContaining(['necrotic', 'radiant']));
    expect(aasimar?.innateCantrips).toEqual(['light']);
  });
});

const necroGoblinSeed: Seed = {
  context_id: ctx.id,
  world_name: 'Aasimar Resist Test',
  ship_name: 'Aasimar Resist Test',
  intro: '',
  seed_id: 'aasimar-resist',
  rooms: [{ id: ctx.startRoomId, name: 'Start', desc: '' }],
  connections: { [ctx.startRoomId]: [] },
  enemies: {
    [ctx.startRoomId]: [
      {
        id: `${ctx.startRoomId}#0`,
        name: 'Wight',
        hp: 30,
        ac: 10,
        damage: '1d10',
        damageType: 'necrotic',
        toHit: 20, // auto-hit
        xp: 20,
      },
    ],
  },
  loot: {},
  npcs: {},
};

describe('Aasimar — necrotic resistance via species data', () => {
  it('halves incoming necrotic damage from an enemy hit', async () => {
    // d10 max = 10. Aasimar resistance halves → 5.
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const aasimar = makeChar({
      id: 'pc-1',
      species: 'aasimar',
      hp: 30,
      max_hp: 30,
    });
    const state = {
      ...makeState({ id: 'pc-1' }, { current_room: ctx.startRoomId, combat_active: true }),
      characters: [aasimar],
      active_character_id: 'pc-1',
      initiative_order: [
        { id: 'pc-1', roll: 18, is_enemy: false },
        { id: `${ctx.startRoomId}#0`, roll: 5, is_enemy: true },
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
          id: `${ctx.startRoomId}#0`,
          isEnemy: true,
          pos: { x: 5, y: 5 },
          hp: 30,
          maxHp: 30,
          conditions: [],
          condition_durations: {},
        },
      ],
    };
    const result = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state,
      seed: necroGoblinSeed,
      context: ctx,
    });
    const after = result.newState.characters[0];
    // Pre-fix (no Aasimar): full 10 damage → 20 HP.
    // Post-fix (Aasimar): halved to 5 → 25 HP.
    expect(after.hp).toBe(25);
    expect(result.narrative).toMatch(/Aasimar necrotic resistance/);
  });
});
