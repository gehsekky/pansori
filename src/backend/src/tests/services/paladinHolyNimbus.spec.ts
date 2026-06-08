// RE-2 — Paladin Holy Nimbus (Oath of Devotion L20): as a bonus action
// (1/long rest), enemies that start their turn in the paladin's aura take
// Radiant damage equal to CHA + Proficiency Bonus. (Holy Ward's save advantage
// vs Fiends/Undead is narrated but not yet wired into the save sites.)

import type { Character, Enemy, GameState, Seed } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { holyNimbusRadiant, takeAction } from '../../services/gameEngine.js';
import { makeChar, makeState } from '../../test-fixtures.js';
import { context as ctx } from '../../campaignData/sandbox.js';

afterEach(() => vi.restoreAllMocks());

const ENEMY = `entry_hall#0`;
const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Nimbus',
  ship_name: 'Nimbus',
  intro: '',
  seed_id: 'nimbus',
  rooms: [{ id: 'entry_hall', name: 'S', desc: '' }],
  enemies: {
    ['entry_hall']: [
      {
        id: ENEMY,
        name: 'Fiend',
        hp: 50,
        ac: 14,
        damage: '1d4',
        toHit: 2,
        xp: 50,
        dex: 10,
      } as unknown as Enemy,
    ],
  },
  loot: {},
  npcs: {},
};

// Devotion paladin L20, CHA 16 (+3), prof +6 → Holy Nimbus radiant = 9.
function nimbusCombat(over: Partial<Character> = {}): GameState {
  const c = makeChar({
    id: 'pc-1',
    character_class: 'Paladin',
    subclass: 'devotion',
    level: 20,
    cha: 16,
    hp: 90,
    max_hp: 90,
    ...over,
  });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
    characters: [c],
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
        hp: 50,
        maxHp: 50,
        conditions: [],
        condition_durations: {},
      },
    ],
  } as unknown as GameState;
}

describe('holyNimbusRadiant helper', () => {
  it('returns CHA + prof for an active L20 nimbus paladin with the enemy in range', () => {
    const st = nimbusCombat({ conditions: ['holy_nimbus'] });
    expect(holyNimbusRadiant(ENEMY, st)).toBe(9); // +3 CHA + 6 prof
  });

  it('is 0 when the nimbus is not active', () => {
    expect(holyNimbusRadiant(ENEMY, nimbusCombat())).toBe(0);
  });

  it('is 0 below Paladin L20', () => {
    const st = nimbusCombat({ level: 19, conditions: ['holy_nimbus'] });
    expect(holyNimbusRadiant(ENEMY, st)).toBe(0);
  });

  it('is 0 when the enemy is outside the aura', () => {
    const st = nimbusCombat({ conditions: ['holy_nimbus'] });
    const farEntities = (st.entities ?? []).map((e) =>
      e.id === ENEMY ? { ...e, pos: { x: 30, y: 30 } } : e
    );
    expect(holyNimbusRadiant(ENEMY, { ...st, entities: farEntities })).toBe(0);
  });
});

describe('Holy Nimbus activation', () => {
  it('a Devotion L20 paladin activates it (marker + 1/long-rest spent)', async () => {
    const r = await takeAction({
      action: { type: 'use_class_feature', featureId: 'holy_nimbus' },
      history: [],
      state: nimbusCombat(),
      seed,
      context: ctx,
    });
    const after = r.newState.characters[0];
    expect(after.conditions).toContain('holy_nimbus');
    expect(after.class_resource_uses?.holy_nimbus_used).toBe(1);
    expect(r.narrative).toMatch(/Holy Nimbus/);
  });

  it('requires a Devotion Paladin of level 20', async () => {
    const r = await takeAction({
      action: { type: 'use_class_feature', featureId: 'holy_nimbus' },
      history: [],
      state: nimbusCombat({ level: 19 }),
      seed,
      context: ctx,
    });
    expect(r.newState.characters[0].conditions).not.toContain('holy_nimbus');
    expect(r.narrative).toMatch(/requires a Devotion Paladin of level 20/);
  });
});

describe('Holy Nimbus radiant aura at enemy turn start', () => {
  it('an enemy starting its turn in the aura takes CHA + prof radiant', async () => {
    const r = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state: nimbusCombat({ conditions: ['holy_nimbus'] }),
      seed,
      context: ctx,
    });
    const enemyHp = (r.newState.entities ?? []).find((e) => e.id === ENEMY)!.hp;
    expect(enemyHp).toBe(41); // 50 − 9 radiant
    expect(r.narrative).toMatch(/Holy Nimbus/);
  });
});
