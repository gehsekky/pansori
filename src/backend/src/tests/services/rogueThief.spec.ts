// RE-2 — Rogue subclass migration: the SRD 5.2.1 iconic Rogue subclass is
// Thief (not the PHB-only Assassin). The PHB Assassinate auto-crit / advantage-
// vs-surprised mechanics are removed; the subclass list offers 'thief'.

import type { Character, Enemy, GameState, Seed } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyLevelUpForClass, takeAction } from '../../services/gameEngine.js';
import { hasSecondStoryWork, maxAttunement } from '../../services/multiclass.js';
import { makeChar, makeState } from '../../test-fixtures.js';
import type { ActionContext } from '../../services/actions/types.js';
import { context as ctx } from '../fixtures/testContext.js';
import { handleAttune } from '../../services/actions/inventory.js';
import { handleRogueFeature } from '../../services/actions/classFeature/rogue.js';
import { pcActor } from '../../services/actions/actor.js';

afterEach(() => vi.restoreAllMocks());

describe('Rogue subclass is Thief (SRD), not Assassin', () => {
  it('auto-assigns the Thief subclass (never Assassin) when a Rogue reaches level 3', () => {
    const rogue = makeChar({ id: 'pc-1', character_class: 'Rogue', level: 2 });
    const note = applyLevelUpForClass(rogue, 'Rogue', ctx);
    expect(rogue.level).toBe(3);
    expect(rogue.subclass).toBe('thief');
    expect(rogue.subclass).not.toBe('assassin');
    expect(note).toMatch(/thief/i);
  });
});

const ENEMY = `entry_hall#0`;
const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Thief Test',
  ship_name: 'Thief Test',
  intro: '',
  seed_id: 'thief',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {
    ['entry_hall']: [
      {
        id: ENEMY,
        name: 'Guard',
        hp: 80,
        ac: 10,
        damage: '1d6',
        toHit: 3,
        xp: 50,
      } as unknown as Enemy,
    ],
  },
  loot: {},
  npcs: {},
};

function thiefState(): GameState {
  const char = makeChar({
    id: 'pc-1',
    character_class: 'Rogue',
    subclass: 'thief',
    level: 5,
    dex: 16,
    str: 16,
    equipment: { main_hand: 'dg-1' },
    inventory: [{ instance_id: 'dg-1', id: 'dagger', name: 'Dagger' }],
    weapon_proficiencies: ['simple', 'martial'],
  });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
    characters: [char],
    active_character_id: 'pc-1',
    surprised: [ENEMY], // the old Assassinate would auto-crit this
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
        hp: 80,
        maxHp: 80,
        conditions: [],
        condition_durations: {},
      },
    ],
  } as unknown as GameState;
}

describe('Assassinate is gone — no auto-crit vs a surprised target', () => {
  it('a Thief hitting a surprised enemy does not auto-crit', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.7); // d20 → 15: a normal hit, not a nat-20
    const r = await takeAction({
      action: { type: 'attack', targetEnemyId: ENEMY },
      history: [],
      state: thiefState(),
      seed,
      context: ctx,
    });
    const hit = (r.newState.combat_log ?? []).find((e) => e.kind === 'attack_hit');
    expect(hit && hit.kind === 'attack_hit' && hit.isCrit).toBe(false);
    expect(r.narrative).not.toMatch(/Assassinate/i);
  });
});

const thief = (over: Partial<Character> = {}) =>
  makeChar({ character_class: 'Rogue', subclass: 'thief', level: 13, ...over });

describe('Thief passives — helper gating', () => {
  it('hasSecondStoryWork: Thief L3+, not below, not other subclasses', () => {
    expect(hasSecondStoryWork(thief({ level: 3 }))).toBe(true);
    expect(hasSecondStoryWork(thief({ level: 2 }))).toBe(false);
    expect(hasSecondStoryWork(makeChar({ character_class: 'Rogue', level: 5 }))).toBe(false);
  });

  it('maxAttunement: 4 for a Thief L13, otherwise 3', () => {
    expect(maxAttunement(thief({ level: 13 }))).toBe(4);
    expect(maxAttunement(thief({ level: 12 }))).toBe(3);
    expect(maxAttunement(makeChar({ character_class: 'Fighter', level: 20 }))).toBe(3);
  });
});

// An attunement item from the sandbox loot table.
const attuneItem = ctx.lootTable.find((l) => l.requiresAttunement)!;

function attuneCtx(char: Character): ActionContext {
  return {
    actor: pcActor(char, 0),
    context: ctx,
    st: { combat_active: false },
    narrative: '',
  } as unknown as ActionContext;
}
const attCharOf = (c: ActionContext) => {
  if (c.actor.kind !== 'pc') throw new Error('expected pc actor');
  return c.actor.char;
};

describe('Use Magic Device (L13) — attune to four items', () => {
  it('a Thief L13 can attune a fourth item', () => {
    const c = attuneCtx(
      thief({
        inventory: [{ instance_id: 'item-4', id: attuneItem.id, name: attuneItem.name }],
        attuned_items: ['a', 'b', 'c'], // already at the normal cap of 3
      })
    );
    handleAttune(c, { type: 'attune', instanceId: 'item-4' });
    expect(attCharOf(c).attuned_items).toContain('item-4');
  });

  it('a non-Thief is capped at three', () => {
    const c = attuneCtx(
      makeChar({
        character_class: 'Wizard',
        level: 20,
        inventory: [{ instance_id: 'item-4', id: attuneItem.id, name: attuneItem.name }],
        attuned_items: ['a', 'b', 'c'],
      })
    );
    handleAttune(c, { type: 'attune', instanceId: 'item-4' });
    expect(attCharOf(c).attuned_items ?? []).not.toContain('item-4');
    expect(c.narrative).toMatch(/only be attuned to 3/);
  });
});

function rfCtx(char: Character): ActionContext {
  return { actor: pcActor(char, 0), narrative: '' } as unknown as ActionContext;
}

describe('Devious Strikes (L14) + Supreme Sneak (L9) — Cunning Strike gating', () => {
  it('Devious Strikes options require Rogue L14', () => {
    const lo = rfCtx(thief({ level: 13 }));
    handleRogueFeature(lo, 'cunning_strike_knock_out');
    expect(attCharOf(lo).turn_actions.cunning_strike_pending).toBeUndefined();

    const hi = rfCtx(thief({ level: 14 }));
    handleRogueFeature(hi, 'cunning_strike_knock_out');
    expect(attCharOf(hi).turn_actions.cunning_strike_pending).toBe('knock_out');
  });

  it('Stealth Attack requires a Thief L9', () => {
    const lo = rfCtx(thief({ level: 8 }));
    handleRogueFeature(lo, 'cunning_strike_stealth_attack');
    expect(attCharOf(lo).turn_actions.cunning_strike_pending).toBeUndefined();

    const hi = rfCtx(thief({ level: 9 }));
    handleRogueFeature(hi, 'cunning_strike_stealth_attack');
    expect(attCharOf(hi).turn_actions.cunning_strike_pending).toBe('stealth_attack');
  });
});

// Obscure has no save — a Sneak Attack hit applies Blinded. Assert on the
// narrative (the condition may tick off over the following enemy turn).
function obscureState(): GameState {
  const char = makeChar({
    id: 'pc-1',
    character_class: 'Rogue',
    subclass: 'thief',
    level: 14,
    dex: 16,
    equipment: { main_hand: 'dg-1' },
    inventory: [{ instance_id: 'dg-1', id: 'dagger', name: 'Dagger' }],
    weapon_proficiencies: ['simple', 'martial'],
    turn_actions: {
      action_used: false,
      bonus_action_used: false,
      reaction_used: false,
      free_interaction_used: false,
      cunning_strike_pending: 'obscure',
    },
  });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
    characters: [char],
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
        conditions: ['prone'],
        condition_durations: {},
      },
    ],
  } as unknown as GameState;
}

describe('Devious Strikes — Obscure on a Sneak Attack', () => {
  it('a Sneak Attack hit applies the Obscure (Blinded) effect', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // advantage (prone) → hit + Sneak Attack
    const r = await takeAction({
      action: { type: 'attack', targetEnemyId: ENEMY },
      history: [],
      state: obscureState(),
      seed,
      context: ctx,
    });
    expect(r.narrative).toMatch(/Obscure/);
    expect(r.narrative).toMatch(/blinded/i);
  });
});
