// SRD 5.2.1 Shillelagh (cantrip): imbue a held Club or Quarterstaff so that for
// 1 minute its melee attacks use your spellcasting ability instead of STR and
// its damage die becomes a scaling d8 (d10 at L5, d12 at L11, 2d6 at L17). Cast
// as a bonus action; routed through the buff branch (targetType 'self'). The
// attack pipeline (preattack swaps the die, resolveOneAttack swaps the ability)
// reads the `shillelagh` flag. A low-STR / high-WIS Druid proves the swap.

import type { Character, Enemy, GameState, Seed } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../../test-fixtures.js';
import { context as ctx } from '../fixtures/testContext.js';
import { takeAction } from '../../services/gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const ENEMY = 'entry_hall#0';

const seed: Seed = {
  context_id: ctx.id,
  world_name: 'SH',
  ship_name: 'SH',
  intro: '',
  seed_id: 'sh',
  rooms: [{ id: 'entry_hall', name: 'S', desc: '' }],
  enemies: {
    entry_hall: [
      { id: ENEMY, name: 'Dummy', hp: 60, ac: 12, damage: '1d4', toHit: 3, xp: 50 } as Enemy,
    ],
  },
  loot: {},
  npcs: {},
};

function druidCombat(over: Partial<Character> = {}): GameState {
  const druid = makeChar({
    id: 'pc-1',
    character_class: 'Druid',
    level: 5,
    wis: 16, // +3 spellcasting mod
    str: 8, // -1 — if Shillelagh wrongly used STR, the math would differ
    weapon_proficiencies: ['simple'],
    spells_known: ['shillelagh'],
    prepared_spells: ['shillelagh'],
    inventory: [{ instance_id: 'w1', id: 'club', name: 'Club' }],
    equipment: { main_hand: 'w1' },
    ...over,
  });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
    characters: [druid],
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

describe('Shillelagh — imbued weapon uses the spellcasting ability + a scaling die', () => {
  it('cast then attack: a club hits with WIS and rolls the L5 d10 die', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    // Cast (bonus action) — sets the shillelagh flag on the club-wielding druid.
    const cast = await takeAction({
      action: { type: 'cast_spell', spellId: 'shillelagh', slotLevel: 0 },
      history: [],
      state: druidCombat(),
      seed,
      context: ctx,
    });
    expect(cast.newState.characters[0].shillelagh).toEqual({ ability: 'wis' });

    // Attack with the imbued club. random 0.5 → d20 = 11 (hit vs AC 12 with +3
    // WIS +3 prof = 17); shillelagh die at L5 is d10 = 6; +3 WIS = 9 total.
    // (If STR -1 + the normal 1d4 club were used: 3 + (-1) = 2.)
    const atk = await takeAction({
      action: { type: 'attack', targetEnemyId: ENEMY },
      history: [],
      state: cast.newState,
      seed,
      context: ctx,
    });
    expect(60 - enemyHp(atk)).toBe(9);
  });

  it('without a club or quarterstaff in hand the cast fizzles (no flag set)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const cast = await takeAction({
      action: { type: 'cast_spell', spellId: 'shillelagh', slotLevel: 0 },
      history: [],
      state: druidCombat({
        inventory: [{ instance_id: 'w1', id: 'dagger', name: 'Dagger' }],
        equipment: { main_hand: 'w1' },
      }),
      seed,
      context: ctx,
    });
    expect(cast.narrative).toMatch(/club or quarterstaff/i);
    expect(cast.newState.characters[0].shillelagh).toBeUndefined();
  });

  it('the cantrip-upgrade die scales — at L1 the imbued club rolls only a d8', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const cast = await takeAction({
      action: { type: 'cast_spell', spellId: 'shillelagh', slotLevel: 0 },
      history: [],
      state: druidCombat({ level: 1 }),
      seed,
      context: ctx,
    });
    // d8 = 5; to-hit 11 + WIS 3 + prof 2 (L1) = 16 ≥ 12 hit; +3 WIS = 8 total.
    const atk = await takeAction({
      action: { type: 'attack', targetEnemyId: ENEMY },
      history: [],
      state: cast.newState,
      seed,
      context: ctx,
    });
    expect(60 - enemyHp(atk)).toBe(8);
  });
});
