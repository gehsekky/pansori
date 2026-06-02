// SRD damage-spell batch (Blight, Cloudkill, Disintegrate, Finger of Death,
// Harm, Insect Plague). Each maps onto the existing save / AoE damage dispatch;
// these tests confirm catalog registration + that a cast resolves and deals
// damage through the real cast path.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../../test-fixtures.js';
import { SRD_SPELLS } from './spells.js';
import type { Seed } from '../../types.js';
import { context as ctx } from '../sandbox.js';
import { takeAction } from '../../services/gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const ENEMY = `entry_hall#0`;
const BATCH = [
  { id: 'blight', level: 4, save: 'con', type: 'necrotic' },
  { id: 'cloudkill', level: 5, save: 'con', type: 'poison' },
  { id: 'disintegrate', level: 6, save: 'dex', type: 'force' },
  { id: 'finger_of_death', level: 7, save: 'con', type: 'necrotic' },
  { id: 'harm', level: 6, save: 'con', type: 'necrotic' },
  { id: 'insect_plague', level: 5, save: 'con', type: 'piercing' },
] as const;

describe('damage-spell batch — catalog', () => {
  it('registers each spell with the expected level, save, and damage type', () => {
    for (const s of BATCH) {
      const spell = SRD_SPELLS[s.id];
      expect(spell, s.id).toBeDefined();
      expect(spell.level).toBe(s.level);
      expect(spell.savingThrow).toBe(s.save);
      expect(spell.damageType).toBe(s.type);
      expect(spell.damage).toBeTruthy();
    }
  });
});

const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Damage Spell Test',
  ship_name: 'Damage Spell Test',
  intro: '',
  seed_id: 'dmg-spells',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {
    ['entry_hall']: [
      { id: ENEMY, name: 'Ogre', hp: 400, ac: 10, damage: '1d6', toHit: 3, xp: 50, con: 8, dex: 8 },
    ],
  },
  loot: {},
  npcs: {},
};

function casterState() {
  const wiz = makeChar({
    id: 'pc-1',
    character_class: 'Wizard',
    level: 13,
    int: 18,
    wis: 16,
    hp: 50,
    max_hp: 50,
    spells_known: BATCH.map((s) => s.id),
    prepared_spells: BATCH.map((s) => s.id),
    spell_slots_max: { 4: 1, 5: 2, 6: 2, 7: 1 },
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
    entities: [
      {
        id: 'pc-1',
        isEnemy: false,
        pos: { x: 1, y: 1 },
        hp: 50,
        maxHp: 50,
        conditions: [],
        condition_durations: {},
      },
      {
        id: ENEMY,
        isEnemy: true,
        pos: { x: 2, y: 2 },
        hp: 400,
        maxHp: 400,
        conditions: [],
        condition_durations: {},
      },
    ],
  };
}

describe('damage-spell batch — resolves and deals damage', () => {
  for (const s of BATCH) {
    it(`${s.id} damages the target on a failed save`, async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.01); // enemy save rolls 1 → fails → takes damage
      const result = await takeAction({
        action: { type: 'cast_spell', spellId: s.id, slotLevel: s.level, targetEnemyId: ENEMY },
        history: [],
        state: casterState(),
        seed,
        context: ctx,
      });
      const hp = result.newState.entities?.find((e) => e.id === ENEMY)?.hp ?? 400;
      expect(hp, `${s.id} should have dealt damage`).toBeLessThan(400);
    });
  }
});
