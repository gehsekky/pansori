// Central enemy-damage floor — Undead Fortitude (Zombie).
//
// `enemyHpAfterDamage` is the single seam every PC-damage path now routes
// its "would this drop the enemy to 0" decision through. For a creature
// WITHOUT `undeadFortitude` it must be exactly `max(0, cur - dmg)` (a
// provable no-op, so the 31 existing monsters are unchanged). For a Zombie
// it grants a CON save (DC 5 + damage) to cling to 1 HP, unless the damage
// is Radiant or from a Critical Hit.
//
// rollDice('1d20') = floor(random * 20) + 1, so Math.random() === 0.5 → d20
// 11. The Zombie's CON 16 (+3) makes the save total 14 at that roll.

import type { Enemy, Seed } from '../../src/types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../../src/test-fixtures.js';
import { context as ctx } from '../../src/campaignData/sandbox.js';
import { enemyHpAfterDamage } from '../../src/services/enemyDamage.js';
import { takeAction } from '../../src/services/gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const ZOMBIE: Enemy = {
  id: 'z',
  name: 'Zombie',
  hp: 15,
  maxHp: 15,
  ac: 8,
  damage: '1d6+1',
  toHit: 3,
  con: 16, // +3
  undeadFortitude: true,
} as unknown as Enemy;

describe('enemyHpAfterDamage — no-op for ordinary creatures', () => {
  it('a non-lethal hit returns the remaining HP, rolls no save', () => {
    const spy = vi.spyOn(Math, 'random');
    const r = enemyHpAfterDamage({ name: 'Goblin' }, 10, 4);
    expect(r).toEqual({ hp: 6, note: '', fortitudeSaved: false });
    expect(spy).not.toHaveBeenCalled(); // short-circuits before any roll
  });

  it('a lethal hit on a creature without the trait returns 0', () => {
    const r = enemyHpAfterDamage({ name: 'Goblin' }, 5, 9);
    expect(r).toEqual({ hp: 0, note: '', fortitudeSaved: false });
  });

  it('treats an undefined enemy as an ordinary creature', () => {
    expect(enemyHpAfterDamage(undefined, 5, 9).hp).toBe(0);
    expect(enemyHpAfterDamage(undefined, 5, 2).hp).toBe(3);
  });
});

describe('enemyHpAfterDamage — Undead Fortitude', () => {
  it('clings to 1 HP when the CON save succeeds (non-radiant, non-crit)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // d20 11 → 11 + 3 = 14
    // 8 damage to a 5-HP zombie → DC 5 + 8 = 13; 14 ≥ 13 succeeds.
    const r = enemyHpAfterDamage(ZOMBIE, 5, 8, { damageType: 'bludgeoning' });
    expect(r.hp).toBe(1);
    expect(r.fortitudeSaved).toBe(true);
    expect(r.note).toMatch(/Undead Fortitude/);
    expect(r.note).toMatch(/DC 13/);
  });

  it('drops to 0 when the CON save fails', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.45); // d20 10 → 10 + 3 = 13
    // 9 damage → DC 14; 13 < 14 fails.
    const r = enemyHpAfterDamage(ZOMBIE, 5, 9, { damageType: 'bludgeoning' });
    expect(r.hp).toBe(0);
    expect(r.fortitudeSaved).toBe(false);
    expect(r.note).toBe('');
  });

  it('the save DC scales with the damage taken (5 + damage)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.15); // d20 4 → 4 + 3 = 7
    // A small 2-damage blow → DC 7; 7 ≥ 7 succeeds.
    expect(enemyHpAfterDamage(ZOMBIE, 1, 2, { damageType: 'slashing' }).hp).toBe(1);
    // The same roll against a 20-damage blow → DC 25; 7 < 25 fails.
    expect(enemyHpAfterDamage(ZOMBIE, 1, 20, { damageType: 'slashing' }).hp).toBe(0);
  });

  it('Radiant damage is exempt — no save, the zombie falls', () => {
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0.99); // would auto-pass if rolled
    const r = enemyHpAfterDamage(ZOMBIE, 5, 8, { damageType: 'radiant' });
    expect(r.hp).toBe(0);
    expect(r.fortitudeSaved).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it('a Critical Hit is exempt — no save, the zombie falls', () => {
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const r = enemyHpAfterDamage(ZOMBIE, 5, 8, { damageType: 'slashing', isCrit: true });
    expect(r.hp).toBe(0);
    expect(spy).not.toHaveBeenCalled();
  });

  it('does not roll on a non-lethal hit even for a zombie', () => {
    const spy = vi.spyOn(Math, 'random');
    expect(enemyHpAfterDamage(ZOMBIE, 20, 8, { damageType: 'bludgeoning' }).hp).toBe(12);
    expect(spy).not.toHaveBeenCalled();
  });
});

// ── Integration: the floor is actually wired into the weapon-attack path ──
function attackSeed(enemy: Partial<Enemy>): Seed {
  return {
    context_id: ctx.id,
    world_name: 'Undead Fortitude Test',
    ship_name: 'Undead Fortitude Test',
    intro: '',
    seed_id: 'undead-fort',
    rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
    enemies: {
      ['entry_hall']: [
        {
          id: `entry_hall#0`,
          name: 'Zombie',
          hp: 8,
          ac: 8,
          damage: '1d6+1',
          toHit: 3,
          xp: 50,
          con: 16,
          ...enemy,
        } as Enemy,
      ],
    },
    loot: {},
    npcs: {},
  };
}

function attackState() {
  const pc = makeChar({
    id: 'pc-1',
    character_class: 'Fighter',
    level: 1, // no Extra Attack — one clean swing
    str: 18, // +4
    hp: 30,
    max_hp: 30,
    inventory: [{ instance_id: 'ss-1', id: 'shortsword', name: 'Shortsword' }],
    equipment: { main_hand: 'ss-1' },
    weapon_proficiencies: ['simple', 'martial'],
  });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
    characters: [pc],
    active_character_id: 'pc-1',
    initiative_order: [
      { id: 'pc-1', roll: 18, is_enemy: false },
      { id: `entry_hall#0`, roll: 5, is_enemy: true },
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
        id: `entry_hall#0`,
        isEnemy: true,
        pos: { x: 5, y: 5 },
        hp: 8,
        maxHp: 15,
        conditions: [],
        condition_durations: {},
      },
    ],
  };
}

describe('Undead Fortitude — wired into the weapon-attack path', () => {
  it('a Zombie that would drop to 0 clings to 1 HP on a successful save', async () => {
    // d20 11 (hit, not a crit) + shortsword 1d6 (4) + STR 4 = 8 damage onto an
    // 8-HP zombie → 0; CON save 14 ≥ DC 13 → survives at 1.
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: `entry_hall#0` },
      history: [],
      state: attackState(),
      seed: attackSeed({ undeadFortitude: true }),
      context: ctx,
    });
    const zombie = result.newState.entities?.find((e) => e.id === `entry_hall#0`);
    expect(zombie?.hp).toBe(1);
    expect(result.newState.enemies_killed).not.toContain(`entry_hall#0`);
    expect(result.narrative).toMatch(/Undead Fortitude/);
  });

  it('without the trait the identical hit kills it (the floor is a no-op)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: `entry_hall#0` },
      history: [],
      state: attackState(),
      seed: attackSeed({}), // no undeadFortitude
      context: ctx,
    });
    // A killed enemy is recorded in enemies_killed (its entity may be pruned).
    expect(result.newState.enemies_killed).toContain(`entry_hall#0`);
    const zombie = result.newState.entities?.find((e) => e.id === `entry_hall#0`);
    expect(zombie?.hp ?? 0).toBe(0);
    expect(result.narrative).not.toMatch(/Undead Fortitude/);
  });
});
