// RE-2 — Steady Aim (SRD 5.2.1, Rogue L3): a Bonus Action granting Advantage
// on your next attack roll this turn, usable only if you haven't moved, and
// your Speed drops to 0 for the rest of the turn. Handled in
// classFeature/rogue.ts (sets `turn_actions.steady_aim_pending` + zeroes
// remaining movement); the advantage is consumed in the attack to-hit.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeEnemy, makeState } from '../../src/test-fixtures.js';
import type { ActionContext } from '../../src/services/actions/types.js';
import type { Seed } from '../../src/types.js';
import { context as ctx } from '../../src/campaignData/sandbox.js';
import { handleRogueFeature } from '../../src/services/actions/classFeature/rogue.js';
import { pcActor } from '../../src/services/actions/actor.js';
import { takeAction } from '../../src/services/gameEngine.js';

afterEach(() => vi.restoreAllMocks());

function rogueCtx(char: ReturnType<typeof makeChar>, movedFt = 0): ActionContext {
  return {
    actor: pcActor(char, 0),
    context: { lootTable: [] }, // effectiveSpeed (Fast Movement) reads the loot table
    st: {
      combat_active: true,
      characters: [char],
      movement_used: { [char.id]: movedFt },
      entities: [],
    },
    narrative: '',
  } as unknown as ActionContext;
}

describe('handleRogueFeature — steady_aim', () => {
  const r3 = () => makeChar({ id: 'r', character_class: 'Rogue', level: 3 });
  const pcChar = (c: ActionContext) => {
    if (c.actor.kind !== 'pc') throw new Error('expected pc actor');
    return c.actor.char;
  };

  it('sets the advantage flag, spends the bonus action, and drops Speed to 0', () => {
    const c = rogueCtx(r3());
    expect(handleRogueFeature(c, 'steady_aim')).toBe(true);
    expect(pcChar(c).turn_actions.steady_aim_pending).toBe(true);
    expect(pcChar(c).turn_actions.bonus_action_used).toBe(true);
    expect(c.st.movement_used?.['r']).toBe(30); // all 30 ft spent → Speed 0
    expect(c.narrative).toContain('Steady Aim');
  });

  it('requires Rogue L3', () => {
    const c = rogueCtx(makeChar({ id: 'r', character_class: 'Rogue', level: 2 }));
    handleRogueFeature(c, 'steady_aim');
    expect(pcChar(c).turn_actions.steady_aim_pending).toBeFalsy();
    expect(c.narrative).toMatch(/Rogue level 3/);
  });

  it('rejects a non-Rogue', () => {
    const c = rogueCtx(makeChar({ id: 'r', character_class: 'Wizard', level: 20 }));
    handleRogueFeature(c, 'steady_aim');
    expect(pcChar(c).turn_actions.steady_aim_pending).toBeFalsy();
    expect(c.narrative).toMatch(/Only Rogues/);
  });

  it('rejects when the bonus action is already used', () => {
    const char = r3();
    char.turn_actions = { ...char.turn_actions, bonus_action_used: true };
    const c = rogueCtx(char);
    handleRogueFeature(c, 'steady_aim');
    expect(pcChar(c).turn_actions.steady_aim_pending).toBeFalsy();
    expect(c.narrative).toMatch(/already used/);
  });

  it('rejects (and spends nothing) when the rogue has already moved this turn', () => {
    const c = rogueCtx(r3(), 10); // moved 10 ft already
    handleRogueFeature(c, 'steady_aim');
    expect(pcChar(c).turn_actions.steady_aim_pending).toBeFalsy();
    expect(pcChar(c).turn_actions.bonus_action_used).toBeFalsy();
    expect(c.st.movement_used?.['r']).toBe(10); // unchanged
    expect(c.narrative).toMatch(/already moved/);
  });
});

const enemyId = `entry_hall#0`;
const seedWithGoblin: Seed = {
  context_id: ctx.id,
  world_name: 'Steady Aim Test',
  ship_name: 'Steady Aim Test',
  intro: '',
  seed_id: 'steady-aim',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {
    ['entry_hall']: [makeEnemy({ id: enemyId, name: 'Goblin', hp: 60, ac: 10, toHit: 3 })],
  },
  loot: {},
  npcs: {},
};

function buildRogue(steadyAimPending: boolean) {
  return makeChar({
    id: 'pc-1',
    character_class: 'Rogue',
    level: 3,
    dex: 16,
    hp: 30,
    max_hp: 30,
    inventory: [{ instance_id: 'dg-1', id: 'dagger', name: 'Dagger' }],
    equipment: { main_hand: 'dg-1' },
    weapon_proficiencies: ['simple', 'martial'],
    turn_actions: {
      action_used: false,
      bonus_action_used: false,
      reaction_used: false,
      free_interaction_used: false,
      steady_aim_pending: steadyAimPending,
    },
  });
}

function buildCombatState(char: ReturnType<typeof makeChar>) {
  return {
    ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
    characters: [char],
    active_character_id: 'pc-1',
    initiative_order: [
      { id: 'pc-1', roll: 18, is_enemy: false },
      { id: enemyId, roll: 5, is_enemy: true },
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
        id: enemyId,
        isEnemy: true,
        pos: { x: 5, y: 5 },
        hp: 60,
        maxHp: 60,
        conditions: [],
        condition_durations: {},
      },
    ],
  };
}

describe('Steady Aim — advantage on the next attack (integration)', () => {
  it('the pending flag gives the attack advantage and is consumed', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // every roll high; advantage is text-flagged
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: enemyId },
      history: [],
      state: buildCombatState(buildRogue(true)),
      seed: seedWithGoblin,
      context: ctx,
    });
    expect(result.narrative).toMatch(/\(advantage\)/);
    expect(result.newState.characters[0].turn_actions.steady_aim_pending).toBeFalsy();
  });

  it('without the flag the same attack has no advantage (control)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: enemyId },
      history: [],
      state: buildCombatState(buildRogue(false)),
      seed: seedWithGoblin,
      context: ctx,
    });
    expect(result.narrative).not.toMatch(/\(advantage\)/);
  });
});
