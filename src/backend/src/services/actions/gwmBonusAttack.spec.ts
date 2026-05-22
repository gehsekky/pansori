// GWM bonus-action attack (2024 PHB Great Weapon Master, second
// benefit). Triggered after a Heavy-weapon hit that's a Crit or
// reduces the target to 0 HP; lets the PC make one bonus-action
// attack with their Heavy weapon.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateChoices, takeAction } from '../gameEngine.js';
import { makeChar, makeState, mockRandom } from '../../test-fixtures.js';
import type { Seed } from '../../types.js';
import { context as ctx } from '../../contexts/sandbox.js';

afterEach(() => vi.restoreAllMocks());

const enemyId = `${ctx.startRoomId}#0`;
const enemy2Id = `${ctx.startRoomId}#1`;

const seedTwoGoblins: Seed = {
  context_id: ctx.id,
  world_name: 'GWM Bonus Test',
  ship_name: 'GWM Bonus Test',
  intro: '',
  seed_id: 'gwm-bonus',
  rooms: [{ id: ctx.startRoomId, name: 'Start', desc: '' }],
  connections: { [ctx.startRoomId]: [] },
  enemies: {
    [ctx.startRoomId]: [
      {
        id: enemyId,
        name: 'Goblin A',
        hp: 1, // 1 HP — any hit kills, triggering GWM bonus
        ac: 10,
        damage: '1d6',
        toHit: 3,
        xp: 20,
      },
      {
        id: enemy2Id,
        name: 'Goblin B',
        hp: 50,
        ac: 10,
        damage: '1d6',
        toHit: 3,
        xp: 20,
      },
    ],
  },
  loot: {},
  npcs: {},
};

function buildState(opts: { feats: string[]; weaponId: string }) {
  const pc = makeChar({
    id: 'pc-1',
    character_class: 'Fighter',
    level: 5,
    str: 18,
    hp: 30,
    max_hp: 30,
    feats: opts.feats,
    inventory: [{ instance_id: 'w-1', id: opts.weaponId, name: opts.weaponId }],
    equipped_weapon: 'w-1',
    weapon_proficiencies: ['simple', 'martial'],
  });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: ctx.startRoomId, combat_active: true }),
    characters: [pc],
    active_character_id: 'pc-1',
    initiative_order: [
      { id: 'pc-1', roll: 18, is_enemy: false },
      { id: enemyId, roll: 5, is_enemy: true },
      { id: enemy2Id, roll: 4, is_enemy: true },
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
        hp: 1,
        maxHp: 1,
        conditions: [],
        condition_durations: {},
      },
      {
        id: enemy2Id,
        isEnemy: true,
        pos: { x: 6, y: 5 },
        hp: 50,
        maxHp: 50,
        conditions: [],
        condition_durations: {},
      },
    ],
  };
}

describe('GWM bonus-action attack', () => {
  // Note: testing the flag SET directly via takeAction would
  // require intercepting between the attack and the post-action
  // initiative-advance + FRESH_TURN. The choice-surface test
  // below covers the visible behavior — when the flag is set,
  // the player sees the GWM bonus-attack choice.
  it('choice surfaces in generateChoices when flag is set', () => {
    const state = buildState({ feats: ['great_weapon_master'], weaponId: 'greataxe' });
    // Manually set the flag (simulates the attack handler having
    // fired and flagged).
    state.characters[0].turn_actions = {
      ...state.characters[0].turn_actions,
      action_used: true,
      gwm_bonus_attack_pending: true,
    };
    const choices = generateChoices(state, seedTwoGoblins, ctx);
    const gwmChoice = choices.find((c) => c.action.type === 'gwm_bonus_attack');
    expect(gwmChoice).toBeDefined();
    expect(gwmChoice?.label).toMatch(/Great Weapon Master/);
  });

  it('handler executes the bonus attack and consumes the flag', async () => {
    mockRandom(0.99);
    const state = buildState({ feats: ['great_weapon_master'], weaponId: 'greataxe' });
    state.characters[0].turn_actions = {
      ...state.characters[0].turn_actions,
      action_used: true,
      gwm_bonus_attack_pending: true,
    };
    const result = await takeAction({
      action: { type: 'gwm_bonus_attack', targetEnemyId: enemy2Id },
      history: [],
      state,
      seed: seedTwoGoblins,
      context: ctx,
    });
    expect(result.narrative).toMatch(/Great Weapon Master bonus attack/);
  });

  it('rejects when no flag is pending', async () => {
    const state = buildState({ feats: ['great_weapon_master'], weaponId: 'greataxe' });
    state.characters[0].turn_actions = {
      ...state.characters[0].turn_actions,
      action_used: true,
    };
    const result = await takeAction({
      action: { type: 'gwm_bonus_attack', targetEnemyId: enemy2Id },
      history: [],
      state,
      seed: seedTwoGoblins,
      context: ctx,
    });
    expect(result.narrative).toMatch(/requires a prior Crit or kill/);
  });

  it('rejects when no feat', async () => {
    const state = buildState({ feats: [], weaponId: 'greataxe' });
    state.characters[0].turn_actions = {
      ...state.characters[0].turn_actions,
      action_used: true,
      gwm_bonus_attack_pending: true,
    };
    const result = await takeAction({
      action: { type: 'gwm_bonus_attack', targetEnemyId: enemy2Id },
      history: [],
      state,
      seed: seedTwoGoblins,
      context: ctx,
    });
    expect(result.narrative).toMatch(/does not have the Great Weapon Master feat/);
  });

  it('non-heavy weapon: GWM bonus attack rejected even with feat + flag', async () => {
    // Even if the flag is manually set, the handler rejects when
    // the equipped weapon isn't Heavy (the trigger conditions
    // upstream should never set the flag for non-heavy, but the
    // handler also gates defensively).
    const state = buildState({ feats: ['great_weapon_master'], weaponId: 'longsword' });
    state.characters[0].turn_actions = {
      ...state.characters[0].turn_actions,
      action_used: true,
      gwm_bonus_attack_pending: true,
    };
    const result = await takeAction({
      action: { type: 'gwm_bonus_attack', targetEnemyId: enemy2Id },
      history: [],
      state,
      seed: seedTwoGoblins,
      context: ctx,
    });
    expect(result.narrative).toMatch(/requires a Heavy weapon/);
  });
});
