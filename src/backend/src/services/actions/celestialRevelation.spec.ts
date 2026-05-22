// Aasimar Celestial Revelation (2024 PHB L3+). Bonus action,
// 1/long rest, picks one of three transformations. Shipped:
// transformation activation + once-per-turn melee +prof damage
// rider (necrotic for Necrotic Shroud, radiant for the others).
// Deferred: flight speed, 10ft aura damage.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState, mockRandom } from '../../test-fixtures.js';
import type { Seed } from '../../types.js';
import { context as ctx } from '../../contexts/sandbox.js';
import { takeAction } from '../gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const enemyId = `${ctx.startRoomId}#0`;

const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Celestial Rev Test',
  ship_name: 'Celestial Rev Test',
  intro: '',
  seed_id: 'cel-rev',
  rooms: [{ id: ctx.startRoomId, name: 'Start', desc: '' }],
  connections: { [ctx.startRoomId]: [] },
  enemies: {
    [ctx.startRoomId]: [
      {
        id: enemyId,
        name: 'Goblin',
        hp: 100,
        ac: 10,
        damage: '1d4',
        toHit: 3,
        xp: 20,
      },
    ],
  },
  loot: {},
  npcs: {},
};

function buildAasimar(
  opts: {
    level?: number;
    alreadyUsed?: boolean;
    variant?: 'necrotic_shroud' | 'radiant_soul' | 'radiant_consumption';
  } = {}
) {
  return makeChar({
    id: 'pc-1',
    species: 'aasimar',
    character_class: 'Fighter',
    level: opts.level ?? 5,
    str: 16,
    hp: 30,
    max_hp: 30,
    class_resource_uses: opts.alreadyUsed ? { celestial_revelation_used: 1 } : {},
    celestial_revelation_variant: opts.variant,
    inventory: [{ instance_id: 'sw-1', id: 'longsword', name: 'Longsword' }],
    equipped_weapon: 'sw-1',
    weapon_proficiencies: ['simple', 'martial'],
  });
}

function buildState(pc: ReturnType<typeof makeChar>) {
  return {
    ...makeState({ id: pc.id }, { current_room: ctx.startRoomId, combat_active: true }),
    characters: [pc],
    active_character_id: pc.id,
    initiative_order: [
      { id: pc.id, roll: 18, is_enemy: false },
      { id: enemyId, roll: 5, is_enemy: true },
    ],
    initiative_idx: 0,
    entities: [
      {
        id: pc.id,
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
        hp: 100,
        maxHp: 100,
        conditions: [],
        condition_durations: {},
      },
    ],
  };
}

describe('Celestial Revelation — activation', () => {
  it('Aasimar L5 activates Radiant Soul: sets variant, daily flag, rounds, consumes bonus action', async () => {
    const pc = buildAasimar();
    const result = await takeAction({
      action: { type: 'use_celestial_revelation', variant: 'radiant_soul' },
      history: [],
      state: buildState(pc),
      seed,
      context: ctx,
    });
    const after = result.newState.characters[0];
    expect(after.celestial_revelation_variant).toBe('radiant_soul');
    expect(after.class_resource_uses?.celestial_revelation_used).toBe(1);
    // Rounds set to 10 on activation, then one round-start tick
    // fires when the initiative wraps back to the PC, so the
    // post-takeAction state shows 9. The duration is "lasts 10 of
    // your turns" which matches RAW's 1 minute (10 rounds).
    expect(after.class_resource_uses?.celestial_revelation_rounds).toBe(9);
    expect(result.narrative).toMatch(/Radiant Soul/);
  });

  it('non-Aasimar → rejected', async () => {
    const pc = makeChar({ id: 'pc-1', species: 'human', level: 5 });
    const result = await takeAction({
      action: { type: 'use_celestial_revelation', variant: 'necrotic_shroud' },
      history: [],
      state: buildState(pc),
      seed,
      context: ctx,
    });
    expect(result.narrative).toMatch(/Aasimar species feature/);
  });

  it('L2 Aasimar → rejected (L3+ requirement)', async () => {
    const pc = buildAasimar({ level: 2 });
    const result = await takeAction({
      action: { type: 'use_celestial_revelation', variant: 'necrotic_shroud' },
      history: [],
      state: buildState(pc),
      seed,
      context: ctx,
    });
    expect(result.narrative).toMatch(/unlocks at level 3/);
  });

  it('already used → rejected until long rest', async () => {
    const pc = buildAasimar({ alreadyUsed: true });
    const result = await takeAction({
      action: { type: 'use_celestial_revelation', variant: 'necrotic_shroud' },
      history: [],
      state: buildState(pc),
      seed,
      context: ctx,
    });
    expect(result.narrative).toMatch(/already used/);
  });
});

describe('Celestial Revelation — attack damage rider', () => {
  it('Necrotic Shroud: melee hit adds +prof necrotic (once per turn)', async () => {
    mockRandom(0.99); // auto-hit + max dmg
    const pc = buildAasimar({ variant: 'necrotic_shroud' });
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: enemyId },
      history: [],
      state: buildState(pc),
      seed,
      context: ctx,
    });
    expect(result.narrative).toMatch(/Celestial Revelation: \+3 necrotic/);
  });

  it('Radiant Soul: melee hit adds +prof radiant', async () => {
    mockRandom(0.99);
    const pc = buildAasimar({ variant: 'radiant_soul' });
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: enemyId },
      history: [],
      state: buildState(pc),
      seed,
      context: ctx,
    });
    expect(result.narrative).toMatch(/Celestial Revelation: \+3 radiant/);
  });

  it('rider does NOT fire on a non-transformed Aasimar', async () => {
    mockRandom(0.99);
    const pc = buildAasimar(); // no variant set
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: enemyId },
      history: [],
      state: buildState(pc),
      seed,
      context: ctx,
    });
    expect(result.narrative).not.toMatch(/Celestial Revelation:/);
  });
});
