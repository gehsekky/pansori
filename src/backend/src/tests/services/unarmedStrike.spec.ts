// SRD 5.2.1 Unarmed Strike — Grapple and Shove.
// - The target makes a STR or DEX save (its choice) against DC 8 + STR mod
//   (a Monk may use DEX) + Proficiency Bonus; Legendary Resistance applies.
// - Only a target at most one size larger than the attacker.
// - Grapple: Grappled, escape DC = the same DC. Shove: Prone, or pushed 5 ft.
// - It is one attack of the Attack action: Extra Attack's remaining attacks follow.
// - Grappled: Disadvantage on attacks against anyone but the grappler; the
//   grapple ends when the two are more than its range apart.

import type { Enemy, GameState, Seed } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateChoices, takeAction } from '../../services/gameEngine.js';
import {
  grappledAttackDisadvantage,
  pcSize,
  unarmedStrikeDc,
  unarmedStrikeSave,
  withinUnarmedSizeLimit,
} from '../../services/unarmedStrike.js';
import { makeChar, makeState } from '../../test-fixtures.js';
import { SRD_MONSTERS } from '../../campaignData/srd/monsters.js';
import { context as ctx } from '../fixtures/testContext.js';

afterEach(() => vi.restoreAllMocks());

const ENEMY = 'entry_hall#0';

const seed = (traits: Partial<Enemy> = {}): Seed =>
  ({
    context_id: ctx.id,
    world_name: 'US',
    ship_name: 'US',
    intro: '',
    seed_id: 'us',
    rooms: [{ id: 'entry_hall', name: 'S', desc: '' }],
    enemies: {
      entry_hall: [
        {
          id: ENEMY,
          name: 'Brute',
          hp: 200,
          ac: 5,
          damage: '1d4',
          toHit: 3,
          xp: 50,
          str: 10,
          dex: 10,
          ...traits,
        } as unknown as Enemy,
      ],
    },
    loot: {},
    npcs: {},
  }) as Seed;

// A Fighter at `level` (STR 16, PB by level) adjacent to the enemy, on its turn.
function fightState(level = 1, over: Parameters<typeof makeChar>[0] = {}): GameState {
  const pc = makeChar({ id: 'pc-1', character_class: 'Fighter', level, str: 16, ...over });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
    characters: [pc],
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
        hp: 30,
        maxHp: 30,
        conditions: [],
        condition_durations: {},
      },
      {
        id: ENEMY,
        isEnemy: true,
        pos: { x: 5, y: 5 },
        hp: 200,
        maxHp: 200,
        conditions: [],
        condition_durations: {},
      },
    ],
  } as unknown as GameState;
}

const act = (state: GameState, s: Seed, action: Record<string, unknown>) =>
  takeAction({ action: action as never, history: [], state, seed: s, context: ctx });

const enemyEnt = (st: GameState) => st.entities?.find((e) => e.id === ENEMY);
const failSaves = () => vi.spyOn(Math, 'random').mockReturnValue(0.01); // every d20 is a 1
const passSaves = () => vi.spyOn(Math, 'random').mockReturnValue(0.99); // every d20 is a 20

describe('DC and size', () => {
  it('DC is 8 + STR mod + Proficiency Bonus', () => {
    expect(unarmedStrikeDc(makeChar({ str: 16, level: 1 }))).toBe(8 + 3 + 2);
    expect(unarmedStrikeDc(makeChar({ str: 16, level: 5 }))).toBe(8 + 3 + 3);
  });

  it('a Monk may use DEX (Dexterous Attacks), but not while wearing armor', () => {
    const monk = makeChar({ character_class: 'Monk', class_levels: { monk: 1 }, str: 10, dex: 18 });
    expect(unarmedStrikeDc(monk)).toBe(8 + 4 + 2);
    const armored = { ...monk, equipment: { armor: 'leather-1' } };
    expect(unarmedStrikeDc(armored)).toBe(8 + 0 + 2);
  });

  it('allows a target at most one size larger', () => {
    const human = makeChar({ species: 'human' });
    const halfling = makeChar({ species: 'halfling' });
    expect(pcSize(halfling)).toBe('small');
    expect(withinUnarmedSizeLimit(human, { size: 'large' })).toBe(true);
    expect(withinUnarmedSizeLimit(human, { size: 'huge' })).toBe(false);
    expect(withinUnarmedSizeLimit(halfling, { size: 'medium' })).toBe(true);
    expect(withinUnarmedSizeLimit(halfling, { size: 'large' })).toBe(false);
    expect(withinUnarmedSizeLimit(human, {})).toBe(true); // unknown ⇒ Medium
  });

  it('every SRD stat block carries its size', () => {
    const all = Object.values(SRD_MONSTERS);
    expect(all.every((m) => m.size)).toBe(true);
    expect(SRD_MONSTERS.balor.size).toBe('huge');
    expect(SRD_MONSTERS.rat.size).toBe('tiny');
    expect(SRD_MONSTERS.goblin.size).toBe('small'); // Goblin Warrior
  });

  it('hides Grapple / Shove for a target that is too big, and rejects it for free', async () => {
    const s = seed({ size: 'huge' });
    const choices = generateChoices(fightState(), s, ctx);
    expect(choices.some((c) => c.kind === 'grapple' || c.kind === 'shove')).toBe(false);
    const r = await act(fightState(), s, { type: 'grapple', targetEnemyId: ENEMY });
    expect(r.narrative).toMatch(/too big/);
    expect(r.newState.characters[0].turn_actions.action_used).toBeFalsy();
  });
});

describe('the target save', () => {
  it('the target picks its better ability, avoiding one it has Disadvantage on', () => {
    const st = {} as GameState;
    const nimble = { id: 'e', str: 8, dex: 18 } as Enemy;
    expect(unarmedStrikeSave(st, nimble, [], 10).ability).toBe('dex');
    expect(unarmedStrikeSave(st, nimble, ['restrained'], 10).ability).toBe('str');
  });

  it('spends Legendary Resistance on a failed save', () => {
    failSaves();
    const st = {} as GameState;
    const boss = { id: 'b', name: 'Boss', legendaryResistance: 1 } as Enemy;
    expect(unarmedStrikeSave(st, boss, [], 15).failed).toBe(false);
    expect(st.legendary_resistance_used?.b).toBe(1);
    expect(unarmedStrikeSave(st, boss, [], 15).failed).toBe(true);
  });
});

describe('Grapple', () => {
  it('a failed save grapples the target and stamps the escape DC', async () => {
    failSaves();
    const r = await act(fightState(), seed(), { type: 'grapple', targetEnemyId: ENEMY });
    const e = enemyEnt(r.newState);
    expect(e?.conditions).toContain('grappled');
    expect(e?.grappled_by).toBe('pc-1');
    expect(e?.grapple_escape_dc).toBe(13);
    expect(r.narrative).toMatch(/save vs DC 13/);
  });

  it('a successful save leaves it free', async () => {
    passSaves();
    const r = await act(fightState(), seed(), { type: 'grapple', targetEnemyId: ENEMY });
    expect(enemyEnt(r.newState)?.conditions).not.toContain('grappled');
  });

  it('uses the action but does not end the turn on the spot', async () => {
    failSaves();
    const r = await act(fightState(), seed(), { type: 'grapple', targetEnemyId: ENEMY });
    expect(r.newState.characters[0].turn_actions.action_used).toBe(true);
    // Movement is left, so it is still this PC's turn.
    expect(r.newState.active_character_id).toBe('pc-1');
  });

  it('with Extra Attack, the remaining attack follows against the same target', async () => {
    failSaves();
    const r = await act(fightState(5), seed(), { type: 'grapple', targetEnemyId: ENEMY });
    expect(enemyEnt(r.newState)?.conditions).toContain('grappled');
    expect(r.narrative).toMatch(/grapple the Brute/);
    // One follow-up attack (a d20 of 1 misses), not two.
    const attacks = (r.newState.combat_log ?? []).filter(
      (ev) => ev.kind === 'attack_hit' || ev.kind === 'attack_miss' || ev.kind === 'kill'
    );
    expect(attacks).toHaveLength(1);
    expect(r.newState.characters[0].turn_actions.action_used).toBe(true);
  });

  it('ends when the grappler moves more than 5 ft away', async () => {
    failSaves();
    const held = await act(fightState(), seed(), { type: 'grapple', targetEnemyId: ENEMY });
    expect(enemyEnt(held.newState)?.conditions).toContain('grappled');
    const moved = await act(held.newState, seed(), {
      type: 'grid_move',
      entityId: 'pc-1',
      to: { x: 2, y: 5 },
    });
    expect(enemyEnt(moved.newState)?.conditions).not.toContain('grappled');
    expect(enemyEnt(moved.newState)?.grappled_by).toBeUndefined();
  });
});

describe('Shove', () => {
  it('knocks the target Prone by default', async () => {
    failSaves();
    const r = await act(fightState(), seed(), { type: 'shove', targetEnemyId: ENEMY });
    expect(enemyEnt(r.newState)?.conditions).toContain('prone');
  });

  it('pushes it 5 ft away in push mode', async () => {
    failSaves();
    const r = await act(fightState(), seed(), {
      type: 'shove',
      targetEnemyId: ENEMY,
      mode: 'push',
    });
    // One square (5 ft) farther from the PC at (4, 5).
    expect(enemyEnt(r.newState)?.pos.x).toBe(6);
    expect(enemyEnt(r.newState)?.conditions).not.toContain('prone');
  });

  it('offers both shove options per enemy', () => {
    const choices = generateChoices(fightState(), seed(), ctx);
    expect(choices.some((c) => c.kind === 'shove')).toBe(true);
    expect(
      choices.some(
        (c) => c.kind === 'shove_push' && (c.action as { mode?: string }).mode === 'push'
      )
    ).toBe(true);
  });
});

describe('Grappled attacks', () => {
  it('Disadvantage only against targets other than the grappler', () => {
    expect(grappledAttackDisadvantage(['grappled'], 'orc', 'goblin')).toBe(true);
    expect(grappledAttackDisadvantage(['grappled'], 'orc', 'orc')).toBe(false);
    expect(grappledAttackDisadvantage([], 'orc', 'goblin')).toBe(false);
  });
});

describe('Push weapon mastery', () => {
  // Tactical Master (Fighter L9) swaps the longsword's mastery to Push.
  async function pushAttack(size: Enemy['size']) {
    vi.spyOn(Math, 'random').mockReturnValue(0.999); // every attack hits
    const state = fightState(9, {
      equipment: { main_hand: 'sword-inst' },
      inventory: [{ instance_id: 'sword-inst', id: 'longsword', name: 'Longsword' }],
      weapon_masteries: ['longsword'],
    } as Parameters<typeof makeChar>[0]);
    const s = seed({ size });
    const armed = await act(state, s, {
      type: 'use_class_feature',
      featureId: 'tactical_master_push',
    });
    return act(armed.newState, s, { type: 'attack', targetEnemyId: ENEMY });
  }

  it('pushes a Large target up to 10 ft away', async () => {
    const r = await pushAttack('large');
    expect(enemyEnt(r.newState)?.pos.x).toBeGreaterThan(5);
    expect(r.narrative).toMatch(/\[Push: Brute shoved \d+ ft back\]/);
  });

  it('cannot push a Huge target', async () => {
    const r = await pushAttack('huge');
    expect(enemyEnt(r.newState)?.pos).toEqual({ x: 5, y: 5 });
    expect(r.narrative).toMatch(/too big to push/);
  });
});
