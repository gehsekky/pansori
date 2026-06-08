// Removal spells — Resilient Sphere, Forcecage, Imprisonment. Each takes a
// creature out of the fight via the `banished` condition (save negates), with a
// FINITE, non-concentration duration that expires through tickEnemyConditions.
// Mirrors the Banishment/Maze removal path.

import type { GameState, Seed } from '../../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../../../test-fixtures.js';
import { SRD_SPELLS } from '../../../campaignData/srd/spells.js';
import { context as ctx } from '../../../campaignData/sandbox.js';
import { takeAction } from '../../../services/gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const ENEMY = 'entry_hall#0';

const seed = (): Seed => ({
  context_id: ctx.id,
  world_name: 'Removal Test',
  ship_name: 'Removal Test',
  intro: '',
  seed_id: 'removal',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {
    entry_hall: [{ id: ENEMY, name: 'Ogre', hp: 80, ac: 12, damage: '8', toHit: 5, xp: 50 }],
  },
  loot: {},
  npcs: {},
});

function wizCaster(spellId: string, slot: number): GameState {
  const wiz = makeChar({
    id: 'pc-1',
    character_class: 'Wizard',
    level: 18,
    int: 20,
    hp: 90,
    max_hp: 90,
    spells_known: [spellId],
    prepared_spells: [spellId],
    spell_slots_max: { [slot]: 1 },
    spell_slots_used: {},
  });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
    characters: [wiz],
    active_character_id: 'pc-1',
    initiative_order: [
      { id: 'pc-1', roll: 18, is_enemy: false },
      { id: ENEMY, roll: 5, is_enemy: true },
    ],
    initiative_idx: 0,
    round: 1,
    entities: [
      {
        id: 'pc-1',
        isEnemy: false,
        pos: { x: 4, y: 5 },
        hp: 90,
        maxHp: 90,
        conditions: [],
        condition_durations: {},
      },
      {
        id: ENEMY,
        isEnemy: true,
        pos: { x: 5, y: 5 },
        hp: 80,
        maxHp: 80,
        conditions: [],
        condition_durations: {},
      },
    ],
  };
}

describe('removal spells — catalog', () => {
  const cases: Array<[string, number, 'dex' | 'cha' | 'wis']> = [
    ['resilient_sphere', 4, 'dex'],
    ['forcecage', 7, 'cha'],
    ['imprisonment', 9, 'wis'],
  ];
  for (const [id, level, save] of cases) {
    it(`${id} banishes on a ${save.toUpperCase()} save-negates, non-concentration`, () => {
      const s = SRD_SPELLS[id];
      expect(s.level).toBe(level);
      expect(s.condition).toBe('banished');
      expect(s.savingThrow).toBe(save);
      expect(s.saveEffect).toBe('negates');
      expect(s.concentration).toBeFalsy();
      expect(s.conditionDuration).toBeGreaterThan(0);
    });
  }
});

describe('removal spells — cast', () => {
  for (const [id, slot] of [
    ['resilient_sphere', 4],
    ['forcecage', 7],
    ['imprisonment', 9],
  ] as const) {
    it(`${id} banishes the target (finite, non-concentration) on a failed save`, async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.01); // save rolls low → fails
      const r = await takeAction({
        action: { type: 'cast_spell', spellId: id, slotLevel: slot, targetEnemyId: ENEMY },
        history: [],
        state: wizCaster(id, slot),
        seed: seed(),
        context: ctx,
      });
      const ent = r.newState.entities?.find((e) => e.id === ENEMY);
      expect(ent?.conditions).toContain('banished');
      // Non-concentration: a finite duration is stamped so it expires on its own.
      expect(ent?.condition_durations?.banished).toBeGreaterThan(0);
      expect(r.newState.characters[0].concentrating_on).toBeFalsy();
    });
  }

  it('a successful save avoids the banish (Imprisonment)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // WIS save rolls high → succeeds
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'imprisonment', slotLevel: 9, targetEnemyId: ENEMY },
      history: [],
      state: wizCaster('imprisonment', 9),
      seed: seed(),
      context: ctx,
    });
    const ent = r.newState.entities?.find((e) => e.id === ENEMY);
    expect(ent?.conditions ?? []).not.toContain('banished');
  });
});
