// SRD 5.2.1 Warlock — Pact of the Blade and the invocations built on it.
// - Bonus Action: bond with the held melee weapon, or conjure one; a new bond
//   ends the old one and a conjured weapon disappears with it.
// - The pact weapon: proficiency, and CHA for its attack and damage rolls.
// - Thirsting Blade: Extra Attack with the pact weapon (Devouring Blade: two).
// - Eldritch Smite: on a pact-weapon hit spend a Pact Magic slot for
//   (1 + slot level)d8 Force and Prone (Huge or smaller), once per turn.
// - Lifedrinker: +1d6 Necrotic once per turn on a pact-weapon hit.

import type { Character, Enemy, GameState, Seed } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateChoices, takeAction } from '../../services/gameEngine.js';
import { learnableInvocations, pactWeaponExtraAttacks } from '../../services/invocations.js';
import { makeChar, makeState } from '../../test-fixtures.js';
import { context as ctx } from '../fixtures/testContext.js';

afterEach(() => vi.restoreAllMocks());

const ENEMY = 'entry_hall#0';

const seed = (traits: Partial<Enemy> = {}): Seed =>
  ({
    context_id: ctx.id,
    world_name: 'PB',
    ship_name: 'PB',
    intro: '',
    seed_id: 'pb',
    rooms: [{ id: 'entry_hall', name: 'S', desc: '' }],
    enemies: {
      entry_hall: [
        {
          id: ENEMY,
          name: 'Brute',
          hp: 300,
          ac: 10,
          damage: '1d4',
          toHit: 3,
          xp: 50,
          ...traits,
        } as unknown as Enemy,
      ],
    },
    loot: {},
    npcs: {},
  }) as Seed;

// A Warlock (STR 8, CHA 18, no Martial weapon proficiency) holding a
// longsword, adjacent to the enemy, on its turn.
function bladeState(level: number, feats: string[], over: Partial<Character> = {}): GameState {
  const pc = makeChar({
    id: 'pc-1',
    character_class: 'Warlock',
    level,
    class_levels: { warlock: level },
    str: 8,
    cha: 18,
    feats,
    weapon_proficiencies: ['simple'],
    equipment: { main_hand: 'sword-1' },
    inventory: [{ instance_id: 'sword-1', id: 'longsword', name: 'Longsword' }],
    spell_slots_max: { 3: 2 },
    spell_slots_used: {},
    ...over,
  });
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
        hp: 300,
        maxHp: 300,
        conditions: [],
        condition_durations: {},
      },
    ],
  } as unknown as GameState;
}

const bonded = (st: GameState): GameState => ({
  ...st,
  characters: st.characters.map((c) => ({ ...c, pact_weapon: 'sword-1' })),
});

const act = (state: GameState, s: Seed, action: Record<string, unknown>) =>
  takeAction({ action: action as never, history: [], state, seed: s, context: ctx });

const attacks = (st: GameState) =>
  (st.combat_log ?? []).filter(
    (ev) => ev.kind === 'attack_hit' || ev.kind === 'attack_miss' || ev.kind === 'kill'
  ).length;

describe('bonding a pact weapon', () => {
  it('bonds the held melee weapon as a Bonus Action', async () => {
    const r = await act(bladeState(1, ['pact_of_the_blade']), seed(), {
      type: 'use_class_feature',
      featureId: 'pact_blade_bond',
    });
    const pc = r.newState.characters[0];
    expect(pc.pact_weapon).toBe('sword-1');
    expect(pc.turn_actions.bonus_action_used).toBe(true);
  });

  it('needs the invocation', async () => {
    const r = await act(bladeState(1, []), seed(), {
      type: 'use_class_feature',
      featureId: 'pact_blade_bond',
    });
    expect(r.newState.characters[0].pact_weapon).toBeUndefined();
  });

  it('conjures a chosen weapon, and a new conjuring replaces the old one', async () => {
    const first = await act(bladeState(1, ['pact_of_the_blade']), seed(), {
      type: 'use_class_feature',
      featureId: 'pact_blade_conjure',
      option: 'greatsword',
    });
    const pc = first.newState.characters[0];
    const conjured = pc.inventory.find((i) => i.instance_id === pc.pact_weapon);
    expect(conjured?.id).toBe('greatsword');
    expect(pc.equipment?.main_hand).toBe(pc.pact_weapon);

    const nextTurn = {
      ...first.newState,
      characters: first.newState.characters.map((c) => ({
        ...c,
        turn_actions: { ...c.turn_actions, bonus_action_used: false },
      })),
    };
    const second = await act(nextTurn, seed(), {
      type: 'use_class_feature',
      featureId: 'pact_blade_conjure',
      option: 'rapier',
    });
    const pc2 = second.newState.characters[0];
    expect(pc2.inventory.some((i) => i.id === 'greatsword')).toBe(false);
    expect(pc2.inventory.find((i) => i.instance_id === pc2.pact_weapon)?.id).toBe('rapier');
  });

  it('offers Conjure with a weapon picker', () => {
    const choice = generateChoices(bladeState(1, ['pact_of_the_blade']), seed(), ctx).find(
      (c) => (c.action as { featureId?: string }).featureId === 'pact_blade_conjure'
    );
    expect(choice?.pickOption?.param).toBe('option');
    const ids = choice?.pickOption?.options.map((o) => o.id) ?? [];
    expect(ids).toContain('longsword');
    expect(ids).not.toContain('dart'); // a Ranged weapon
    expect(ids).not.toContain('longbow');
  });
});

describe('attacking with the pact weapon', () => {
  // d20 = 11 (Math.random 0.5). CHA +4 and proficiency +3 (L5) → 18. Without
  // the bond: STR −1 and no Martial proficiency → 10.
  it('uses CHA and adds proficiency', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const withBond = await act(bonded(bladeState(5, ['pact_of_the_blade'])), seed(), {
      type: 'attack',
      targetEnemyId: ENEMY,
    });
    expect(withBond.narrative).toMatch(/= 18 vs AC 10/);
    const without = await act(bladeState(5, ['pact_of_the_blade']), seed(), {
      type: 'attack',
      targetEnemyId: ENEMY,
    });
    expect(without.narrative).toMatch(/= 10 vs AC 10/);
  });

  it('Thirsting Blade gives the pact weapon a second attack', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const thirsting = await act(
      bonded(bladeState(5, ['pact_of_the_blade', 'thirsting_blade'])),
      seed(),
      { type: 'attack', targetEnemyId: ENEMY }
    );
    expect(attacks(thirsting.newState)).toBe(2);
    const plain = await act(bonded(bladeState(5, ['pact_of_the_blade'])), seed(), {
      type: 'attack',
      targetEnemyId: ENEMY,
    });
    expect(attacks(plain.newState)).toBe(1);
  });

  it('Devouring Blade makes it two extra attacks', () => {
    expect(pactWeaponExtraAttacks({ feats: ['thirsting_blade'] })).toBe(1);
    expect(pactWeaponExtraAttacks({ feats: ['thirsting_blade', 'devouring_blade'] })).toBe(2);
  });

  it('Thirsting Blade needs Pact of the Blade and Warlock level 5', () => {
    const ids = (c: Character) => learnableInvocations(c).map((d) => d.id);
    const wl = (level: number, feats: string[]) =>
      makeChar({ character_class: 'Warlock', level, class_levels: { warlock: level }, feats });
    expect(ids(wl(5, []))).not.toContain('thirsting_blade');
    expect(ids(wl(5, ['pact_of_the_blade']))).toContain('thirsting_blade');
    expect(ids(wl(4, ['pact_of_the_blade']))).not.toContain('thirsting_blade');
  });
});

describe('Eldritch Smite', () => {
  async function smite(size: Enemy['size']) {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // hits
    const st = bonded(bladeState(5, ['pact_of_the_blade', 'eldritch_smite']));
    const s = seed({ size });
    const armed = await act(st, s, { type: 'use_class_feature', featureId: 'eldritch_smite_arm' });
    expect(armed.newState.characters[0].turn_actions.eldritch_smite_armed).toBe(true);
    return act(armed.newState, s, { type: 'attack', targetEnemyId: ENEMY });
  }

  it('spends a Pact slot for 4d8 force (level-3 slot) and knocks the target Prone', async () => {
    const r = await smite('large');
    expect(r.narrative).toMatch(/Eldritch Smite 4d8/);
    expect(r.newState.characters[0].spell_slots_used?.[3]).toBe(1);
    expect(r.newState.entities?.find((e) => e.id === ENEMY)?.conditions).toContain('prone');
    expect(r.newState.characters[0].turn_actions.eldritch_smite_used).toBe(true);
  });

  it('a Gargantuan target is not knocked Prone', async () => {
    const r = await smite('gargantuan');
    expect(r.narrative).toMatch(/Eldritch Smite/);
    expect(r.newState.entities?.find((e) => e.id === ENEMY)?.conditions).not.toContain('prone');
  });
});

describe('Lifedrinker', () => {
  it('adds 1d6 necrotic once per turn', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const r = await act(
      bonded(bladeState(9, ['pact_of_the_blade', 'thirsting_blade', 'lifedrinker'])),
      seed(),
      { type: 'attack', targetEnemyId: ENEMY }
    );
    expect(attacks(r.newState)).toBe(2);
    expect(r.narrative.match(/Lifedrinker 1d6/g)?.length).toBe(1);
  });
});
