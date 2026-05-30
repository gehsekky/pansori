// Forced displacement (SRD) — Thunderwave (15-ft cube: 2d8 thunder + push 10 ft
// on a failed CON save) and Gust of Wind (60-ft line: push 15 ft on a failed
// STR save, no damage). The push reuses `pushEntityAway`, moving the creature
// directly away from the caster up to the push distance, stopping at grid
// edges / blockers. Resolved after damage, only on a failed save.

import type { GameState, Seed } from '../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../test-fixtures.js';
import { SRD_SPELLS } from '../contexts/srd/spells.js';
import { context as ctx } from '../contexts/sandbox.js';
import { takeAction } from './gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const ENEMY = `${ctx.startRoomId}#0`;

const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Push Test',
  ship_name: 'Push Test',
  intro: '',
  seed_id: 'push',
  rooms: [{ id: ctx.startRoomId, name: 'Start', desc: '' }],
  enemies: {
    [ctx.startRoomId]: [
      {
        id: ENEMY,
        name: 'Goblin',
        hp: 40,
        ac: 10,
        damage: '1d6',
        toHit: 3,
        xp: 10,
        con: 6,
        str: 6,
      },
    ],
  },
  loot: {},
  npcs: {},
};

function caster(spellId: string): GameState {
  const wiz = makeChar({
    id: 'pc-1',
    character_class: 'Wizard',
    level: 5,
    int: 18,
    hp: 30,
    max_hp: 30,
    spells_known: [spellId],
    prepared_spells: [spellId],
    spell_slots_max: { 1: 4, 2: 3 },
    spell_slots_used: {},
  });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: ctx.startRoomId, combat_active: true }),
    characters: [wiz],
    active_character_id: 'pc-1',
    // PC-only initiative: the cast resolves the push without an enemy turn
    // shuffling positions afterward.
    initiative_order: [{ id: 'pc-1', roll: 20, is_enemy: false }],
    initiative_idx: 0,
    entities: [
      {
        id: 'pc-1',
        isEnemy: false,
        pos: { x: 1, y: 1 },
        hp: 30,
        maxHp: 30,
        conditions: [],
        condition_durations: {},
      },
      // Due east of the caster and well inside both the 15-ft cube and the line.
      {
        id: ENEMY,
        isEnemy: true,
        pos: { x: 3, y: 1 },
        hp: 40,
        maxHp: 40,
        conditions: [],
        condition_durations: {},
      },
    ],
  };
}

describe('Forced displacement — catalog', () => {
  it('Thunderwave is a 15-ft cube that damages + pushes 10 ft', () => {
    const s = SRD_SPELLS.thunderwave;
    expect(s.aoeShape).toBe('cube');
    expect(s.blastRadius).toBe(15);
    expect(s.pushFt).toBe(10);
    expect(s.damage).toBe('2d8');
    expect(s.savingThrow).toBe('con');
  });

  it('Gust of Wind is an L2 line that pushes 15 ft with no damage', () => {
    const s = SRD_SPELLS.gust_of_wind;
    expect(s.level).toBe(2);
    expect(s.aoeShape).toBe('line');
    expect(s.pushFt).toBe(15);
    expect(s.savingThrow).toBe('str');
    expect(s.damage).toBeUndefined();
    expect(s.concentration).toBe(true);
  });
});

describe('Thunderwave — damage + knockback', () => {
  it('a creature that fails its CON save takes damage and is pushed away', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01); // CON save fails
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'thunderwave', slotLevel: 1, targetEnemyId: ENEMY },
      history: [],
      state: caster('thunderwave'),
      seed,
      context: ctx,
    });
    const e = r.newState.entities?.find((x) => x.id === ENEMY)!;
    expect(e.hp).toBeLessThan(40); // took thunder damage
    expect(e.pos.x).toBeGreaterThan(3); // shoved east, away from the caster at x=1
    expect(r.narrative).toMatch(/pushed \d+ ft/i);
  });

  it('a creature that succeeds on its save is not pushed', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // CON save succeeds
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'thunderwave', slotLevel: 1, targetEnemyId: ENEMY },
      history: [],
      state: caster('thunderwave'),
      seed,
      context: ctx,
    });
    const e = r.newState.entities?.find((x) => x.id === ENEMY)!;
    expect(e.pos.x).toBe(3); // stayed put
  });
});

describe('Gust of Wind — line knockback (no damage)', () => {
  it('a creature that fails its STR save is pushed 15 ft and takes no damage', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01); // STR save fails
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'gust_of_wind', slotLevel: 2, targetEnemyId: ENEMY },
      history: [],
      state: caster('gust_of_wind'),
      seed,
      context: ctx,
    });
    const e = r.newState.entities?.find((x) => x.id === ENEMY)!;
    expect(e.hp).toBe(40); // no damage
    expect(e.pos.x).toBeGreaterThan(3); // pushed away
  });
});
