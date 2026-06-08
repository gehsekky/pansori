// SRD 5.2.1 True Strike (cantrip): make one weapon attack using your
// spellcasting ability for the attack + damage rolls, plus a scaling Radiant
// rider (L5 1d6, L11 2d6, L17 3d6). Mechanized in castSpell/index.ts — it
// reuses the to-hit pipeline + resolvePlayerAttack with the ability swapped to
// the casting stat. A low-STR / high-INT Wizard proves the swap (the dagger
// damage carries the INT modifier, not STR).

import type { Character, Enemy, GameState, Seed } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../../test-fixtures.js';
import { context as ctx } from '../fixtures/testContext.js';
import { takeAction } from '../../services/gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const ENEMY = 'entry_hall#0';

const seed: Seed = {
  context_id: ctx.id,
  world_name: 'TS',
  ship_name: 'TS',
  intro: '',
  seed_id: 'ts',
  rooms: [{ id: 'entry_hall', name: 'S', desc: '' }],
  enemies: {
    entry_hall: [
      { id: ENEMY, name: 'Dummy', hp: 60, ac: 12, damage: '1d4', toHit: 3, xp: 50 } as Enemy,
    ],
  },
  loot: {},
  npcs: {},
};

function casterCombat(over: Partial<Character> = {}): GameState {
  const caster = makeChar({
    id: 'pc-1',
    character_class: 'Wizard',
    level: 5,
    int: 16, // +3 spellcasting mod
    str: 8, // -1 — if True Strike wrongly used STR, the math would differ
    weapon_proficiencies: ['simple'],
    spell_slots_max: { 1: 4 },
    spell_slots_used: {},
    spells_known: ['true_strike'],
    prepared_spells: ['true_strike'],
    inventory: [{ instance_id: 'w1', id: 'dagger', name: 'Dagger' }],
    equipment: { weapon: 'w1' },
    ...over,
  });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
    characters: [caster],
    active_character_id: 'pc-1',
    round: 1,
    initiative_order: [
      { id: 'pc-1', roll: 18, is_enemy: false },
      { id: ENEMY, roll: 5, is_enemy: true },
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
        id: ENEMY,
        isEnemy: true,
        pos: { x: 5, y: 5 },
        hp: 60,
        maxHp: 60,
        conditions: [],
        condition_durations: {},
      },
    ],
  } as unknown as GameState;
}

const enemyHp = (r: { newState: GameState }) =>
  (r.newState.entities ?? []).find((e) => e.id === ENEMY)!.hp;

describe('True Strike — weapon attack via the spellcasting ability + Radiant rider', () => {
  it('hits with the casting modifier and adds the L5 Radiant rider', async () => {
    // random 0.5 → d20 = 11 (hit vs AC 12 with +3 INT +3 prof = 17); dagger 1d4 = 3;
    // radiant 1d6 = 4. Total = 3 + 3 (INT) + 4 = 10. (If STR -1 were used: only 6.)
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'true_strike', slotLevel: 0, targetEnemyId: ENEMY },
      history: [],
      state: casterCombat(),
      seed,
      context: ctx,
    });
    expect(60 - enemyHp(r)).toBe(10);
  });

  it('below level 5 there is no Radiant rider', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'true_strike', slotLevel: 0, targetEnemyId: ENEMY },
      history: [],
      state: casterCombat({ level: 4 }),
      seed,
      context: ctx,
    });
    // dagger 3 + INT 3, prof at L4 is still +2 → to-hit 11+3+2=16 ≥ 12 hit; no rider.
    expect(60 - enemyHp(r)).toBe(6);
  });
});
