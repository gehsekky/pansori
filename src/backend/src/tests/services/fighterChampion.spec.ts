// RE-2 — Fighter L17 Action Surge (second use) + Champion L15 Superior
// Critical (crit on 18–20, upgrading the L3 Improved Critical's 19–20).

import type { Character, Enemy, GameState, Seed } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { hasHeroicWarrior, heroicWarriorTopUp } from '../../services/multiclass.js';
import { makeChar, makeState } from '../../test-fixtures.js';
import type { ActionContext } from '../../services/actions/types.js';
import { context as ctx } from '../fixtures/testContext.js';
import { handleFighterFeature } from '../../services/actions/classFeature/fighter.js';
import { pcActor } from '../../services/actions/actor.js';
import { takeAction } from '../../services/gameEngine.js';

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
const freshTurn = () => ({
  action_used: true, // action spent — Action Surge refunds it
  bonus_action_used: false,
  reaction_used: false,
  free_interaction_used: false,
});

describe('Fighter Action Surge — L17 second use', () => {
  it('a L17 Fighter can Action Surge twice per rest (once per turn)', () => {
    const char = makeChar({ character_class: 'Fighter', level: 17, turn_actions: freshTurn() });
    const c = featCtx(char);

    // First use, turn 1.
    expect(handleFighterFeature(c, 'action_surge')).toBe(true);
    expect(pcChar(c).class_resource_uses?.action_surge).toBe(1);
    expect(pcChar(c).turn_actions.action_used).toBe(false); // refunded
    expect(pcChar(c).turn_actions.action_surge_used).toBe(true);

    // Same turn again → rejected (once per turn).
    handleFighterFeature(c, 'action_surge');
    expect(c.narrative).toMatch(/once per turn/);
    expect(pcChar(c).class_resource_uses?.action_surge).toBe(1);

    // New turn: clear the per-turn flag, surge a second time.
    pcChar(c).turn_actions = { ...freshTurn(), action_surge_used: false };
    expect(handleFighterFeature(c, 'action_surge')).toBe(true);
    expect(pcChar(c).class_resource_uses?.action_surge).toBe(2);

    // Third use exhausted.
    pcChar(c).turn_actions = { ...freshTurn(), action_surge_used: false };
    handleFighterFeature(c, 'action_surge');
    expect(c.narrative).toMatch(/exhausted/);
    expect(pcChar(c).class_resource_uses?.action_surge).toBe(2);
  });

  it('a L16 Fighter only gets one use per rest', () => {
    const char = makeChar({
      character_class: 'Fighter',
      level: 16,
      turn_actions: freshTurn(),
      class_resource_uses: { action_surge: 1 },
    });
    const c = featCtx(char);
    handleFighterFeature(c, 'action_surge');
    expect(c.narrative).toMatch(/exhausted/);
    expect(pcChar(c).class_resource_uses?.action_surge).toBe(1);
  });
});

// Combat state: a Champion adjacent to a high-HP enemy; an 18 to-hit roll.
const ENEMY = `entry_hall#0`;
const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Champion Test',
  ship_name: 'Champion Test',
  intro: '',
  seed_id: 'champion',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {
    ['entry_hall']: [
      {
        id: ENEMY,
        name: 'Golem',
        hp: 200,
        ac: 12,
        damage: '1d6',
        toHit: 3,
        xp: 50,
      } as unknown as Enemy,
    ],
  },
  loot: {},
  npcs: {},
};

function championState(level: number): GameState {
  const char = makeChar({
    id: 'pc-1',
    character_class: 'Fighter',
    subclass: 'champion',
    level,
    str: 16,
    equipment: { main_hand: 'gx-1' },
    inventory: [{ instance_id: 'gx-1', id: 'greatsword', name: 'Greatsword' }],
    weapon_proficiencies: ['simple', 'martial'],
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
        hp: 40,
        maxHp: 40,
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

describe('Champion Superior Critical (L15)', () => {
  it('a L15 Champion crits on an 18', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.86); // d20 → 18
    const r = await takeAction({
      action: { type: 'attack', targetEnemyId: ENEMY },
      history: [],
      state: championState(15),
      seed,
      context: ctx,
    });
    const hit = (r.newState.combat_log ?? []).find((e) => e.kind === 'attack_hit');
    expect(hit && hit.kind === 'attack_hit' && hit.isCrit).toBe(true);
  });

  it('a L14 Champion does NOT crit on an 18 (still 19–20)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.86); // d20 → 18
    const r = await takeAction({
      action: { type: 'attack', targetEnemyId: ENEMY },
      history: [],
      state: championState(14),
      seed,
      context: ctx,
    });
    const hit = (r.newState.combat_log ?? []).find((e) => e.kind === 'attack_hit');
    expect(hit && hit.kind === 'attack_hit' && hit.isCrit).toBe(false);
  });
});

describe('Champion Heroic Warrior (L10)', () => {
  it('hasHeroicWarrior gates on Champion L10+', () => {
    expect(
      hasHeroicWarrior(makeChar({ character_class: 'Fighter', subclass: 'champion', level: 10 }))
    ).toBe(true);
    expect(
      hasHeroicWarrior(makeChar({ character_class: 'Fighter', subclass: 'champion', level: 9 }))
    ).toBe(false);
    expect(hasHeroicWarrior(makeChar({ character_class: 'Fighter', level: 10 }))).toBe(false);
  });

  it('heroicWarriorTopUp grants Heroic Inspiration only when lacking it', () => {
    const champ = makeChar({
      character_class: 'Fighter',
      subclass: 'champion',
      level: 10,
      inspiration: false,
    });
    expect(heroicWarriorTopUp(champ).inspiration).toBe(true);
    const fighter = makeChar({ character_class: 'Fighter', level: 10, inspiration: false });
    expect(heroicWarriorTopUp(fighter).inspiration ?? false).toBe(false);
  });

  it('a L10 Champion regains Heroic Inspiration when their next turn begins', async () => {
    const r = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state: championState(10),
      seed,
      context: ctx,
    });
    expect(r.newState.characters[0].inspiration).toBe(true);
    expect(r.narrative).toMatch(/Heroic Warrior/);
  });

  it('does not grant below Fighter L10', async () => {
    const r = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state: championState(9),
      seed,
      context: ctx,
    });
    expect(r.newState.characters[0].inspiration ?? false).toBe(false);
    expect(r.narrative).not.toMatch(/Heroic Warrior/);
  });
});
