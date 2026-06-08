// RE-2 — Ranger Hunter "feature option" picker: Hunter's Prey (L3) lets a
// Hunter choose Colossus Slayer (existing) or Horde Breaker (an extra attack
// vs a nearby foe), swappable on a rest. Covers the generic picker + the
// Horde Breaker effect + Colossus Slayer suppression when Horde Breaker is set.

import type { Character, Enemy, GameState, Seed } from '../../src/types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateChoices, takeAction } from '../../src/services/gameEngine.js';
import { makeChar, makeState } from '../../src/test-fixtures.js';
import type { ActionContext } from '../../src/services/actions/types.js';
import { context as ctx } from '../../src/campaignData/sandbox.js';
import { handleChooseHunterOption } from '../../src/services/actions/meta.js';
import { pcActor } from '../../src/services/actions/actor.js';

afterEach(() => vi.restoreAllMocks());

function featCtx(char: Character): ActionContext {
  return {
    actor: pcActor(char, 0),
    context: { classFeatures: {} },
    narrative: '',
  } as unknown as ActionContext;
}
const pcChar = (c: ActionContext) => {
  if (c.actor.kind !== 'pc') throw new Error('expected pc actor');
  return c.actor.char;
};

describe('choose_hunter_option — Hunter’s Prey picker', () => {
  it('a Hunter L3 can choose Horde Breaker', () => {
    const c = featCtx(makeChar({ character_class: 'Ranger', subclass: 'hunter', level: 3 }));
    handleChooseHunterOption(c, {
      type: 'choose_hunter_option',
      feature: 'hunters_prey',
      option: 'horde_breaker',
    });
    expect(pcChar(c).hunters_prey).toBe('horde_breaker');
  });

  it('rejects a non-Hunter ranger', () => {
    const c = featCtx(makeChar({ character_class: 'Ranger', level: 3 }));
    handleChooseHunterOption(c, {
      type: 'choose_hunter_option',
      feature: 'hunters_prey',
      option: 'horde_breaker',
    });
    expect(pcChar(c).hunters_prey).toBeUndefined();
    expect(c.narrative).toMatch(/Hunter Ranger/);
  });

  it('requires level 3', () => {
    const c = featCtx(makeChar({ character_class: 'Ranger', subclass: 'hunter', level: 2 }));
    handleChooseHunterOption(c, {
      type: 'choose_hunter_option',
      feature: 'hunters_prey',
      option: 'horde_breaker',
    });
    expect(pcChar(c).hunters_prey).toBeUndefined();
  });

  it('rejects an unknown option', () => {
    const c = featCtx(makeChar({ character_class: 'Ranger', subclass: 'hunter', level: 3 }));
    const r = handleChooseHunterOption(c, {
      type: 'choose_hunter_option',
      feature: 'hunters_prey',
      option: 'nonsense',
    });
    expect(r && 'rejected' in r).toBe(true);
  });

  it('surfaces the Horde Breaker swap to a default (Colossus) Hunter out of combat', () => {
    const r = makeChar({ id: 'pc-1', character_class: 'Ranger', subclass: 'hunter', level: 3 });
    const state = makeState({}, { characters: [r], active_character_id: 'pc-1' });
    const picks = generateChoices(state, seed, ctx)
      .filter((c) => c.action.type === 'choose_hunter_option')
      .map((c) => (c.action.type === 'choose_hunter_option' ? c.action.option : ''));
    expect(picks).toContain('horde_breaker');
    expect(picks).not.toContain('colossus_slayer'); // already the default, not re-offered
  });
});

const E1 = `entry_hall#0`;
const E2 = `entry_hall#1`;
const seed: Seed = {
  context_id: ctx.id,
  world_name: "Hunter's Prey Test",
  ship_name: "Hunter's Prey Test",
  intro: '',
  seed_id: 'hunters-prey',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {
    ['entry_hall']: [
      { id: E1, name: 'Wolf', hp: 90, ac: 5, damage: '1d6', toHit: 3, xp: 50 } as unknown as Enemy,
      {
        id: E2,
        name: 'Jackal',
        hp: 90,
        ac: 5,
        damage: '1d6',
        toHit: 3,
        xp: 50,
      } as unknown as Enemy,
    ],
  },
  loot: {},
  npcs: {},
};

function hordeState(): GameState {
  const char = makeChar({
    id: 'pc-1',
    character_class: 'Ranger',
    subclass: 'hunter',
    level: 3,
    hunters_prey: 'horde_breaker',
    str: 16,
    equipment: { main_hand: 'sw-1' },
    inventory: [{ instance_id: 'sw-1', id: 'shortsword', name: 'Shortsword' }],
    weapon_proficiencies: ['simple', 'martial'],
  });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
    characters: [char],
    active_character_id: 'pc-1',
    initiative_order: [
      { id: 'pc-1', roll: 18, is_enemy: false },
      { id: E1, roll: 5, is_enemy: true },
      { id: E2, roll: 4, is_enemy: true },
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
        id: E1,
        isEnemy: true,
        pos: { x: 5, y: 5 },
        hp: 90,
        maxHp: 90,
        conditions: [],
        condition_durations: {},
      },
      {
        id: E2,
        isEnemy: true,
        pos: { x: 6, y: 5 },
        hp: 90,
        maxHp: 90,
        conditions: [],
        condition_durations: {},
      }, // 5 ft from E1
    ],
  } as unknown as GameState;
}

describe('Horde Breaker (Hunter’s Prey option)', () => {
  it('makes an extra attack vs a different creature within 5 ft of the target', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // hits
    const r = await takeAction({
      action: { type: 'attack', targetEnemyId: E1 },
      history: [],
      state: hordeState(),
      seed,
      context: ctx,
    });
    expect(r.narrative).toMatch(/Horde Breaker/);
    expect(r.newState.entities?.find((e) => e.id === E2)!.hp).toBeLessThan(90);
    expect(r.newState.characters[0].turn_actions.horde_breaker_used).toBe(true);
  });

  it('suppresses Colossus Slayer in the choice list when Horde Breaker is chosen', () => {
    const choices = generateChoices(hordeState(), seed, ctx);
    const hasColossus = choices.some(
      (c) => c.action.type === 'use_class_feature' && c.action.featureId === 'colossus_slayer'
    );
    expect(hasColossus).toBe(false);
  });
});
