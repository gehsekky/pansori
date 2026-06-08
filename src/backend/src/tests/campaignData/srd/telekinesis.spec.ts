// SRD Telekinesis — a single-target STR save that, on a failure, hurls the
// creature away from the caster. Exercises the new single-target `pushFt`
// forced-displacement path in runSaveSpell (reusing pushEntityAway).

import type { GameState, Seed } from '../../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../../../test-fixtures.js';
import { SRD_SPELLS } from '../../../campaignData/srd/spells.js';
import { context as ctx } from '../../../campaignData/sandbox.js';
import { takeAction } from '../../../services/gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const ENEMY = `entry_hall#0`;

const seed: Seed = {
  context_id: ctx.id,
  world_name: 'TK Test',
  ship_name: 'TK Test',
  intro: '',
  seed_id: 'tk',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {
    ['entry_hall']: [
      { id: ENEMY, name: 'Ogre', hp: 80, ac: 10, damage: '1d6', toHit: 3, xp: 50, str: 10 },
    ],
  },
  loot: {},
  npcs: {},
};

// Caster at (1,5), enemy adjacent at (2,5) → a failed save shoves the enemy
// toward higher x (away from the caster).
function casterState(): GameState {
  const wiz = makeChar({
    id: 'pc-1',
    character_class: 'Wizard',
    level: 9,
    int: 18,
    spells_known: ['telekinesis'],
    prepared_spells: ['telekinesis'],
    spell_slots_max: { 5: 1 },
    spell_slots_used: {},
  });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
    characters: [wiz],
    active_character_id: 'pc-1',
    initiative_order: [{ id: 'pc-1', roll: 18, is_enemy: false }], // PC-only: no counterattack
    initiative_idx: 0,
    entities: [
      {
        id: 'pc-1',
        isEnemy: false,
        pos: { x: 1, y: 5 },
        hp: 30,
        maxHp: 30,
        conditions: [],
        condition_durations: {},
      },
      {
        id: ENEMY,
        isEnemy: true,
        pos: { x: 2, y: 5 },
        hp: 80,
        maxHp: 80,
        conditions: [],
        condition_durations: {},
      },
    ],
  } as unknown as GameState;
}

describe('Telekinesis', () => {
  it('catalog: a STR-save spell with a 30-ft push', () => {
    expect(SRD_SPELLS.telekinesis).toMatchObject({ level: 5, savingThrow: 'str', pushFt: 30 });
  });

  it('on a failed save, hurls the target away from the caster', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01); // STR save → 1 → fails
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'telekinesis', slotLevel: 5, targetEnemyId: ENEMY },
      history: [],
      state: casterState(),
      seed,
      context: ctx,
    });
    const e = r.newState.entities?.find((x) => x.id === ENEMY)!;
    expect(e.pos.x).toBeGreaterThan(2); // shoved away (+x) from the caster at x=1
  });

  it('on a successful save, the target is not moved', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // STR save → 20 → passes
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'telekinesis', slotLevel: 5, targetEnemyId: ENEMY },
      history: [],
      state: casterState(),
      seed,
      context: ctx,
    });
    const e = r.newState.entities?.find((x) => x.id === ENEMY)!;
    expect(e.pos).toEqual({ x: 2, y: 5 }); // unmoved
  });
});
