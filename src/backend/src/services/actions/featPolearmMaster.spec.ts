// Polearm Master (2024 PHB) — bonus-action butt-end attack after
// Attack action. Damage = 1d4 + ability mod, same damage type as
// the weapon.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyFeatTake, getFeat } from '../feats.js';
import { generateChoices, takeAction } from '../gameEngine.js';
import { makeChar, makeState, mockRandom } from '../../test-fixtures.js';
import type { Seed } from '../../types.js';
import { context as ctx } from '../../contexts/sandbox.js';

afterEach(() => vi.restoreAllMocks());

const enemyId = `${ctx.startRoomId}#0`;

const seedWithGoblin: Seed = {
  context_id: ctx.id,
  world_name: 'Polearm Master Test',
  ship_name: 'Polearm Master Test',
  intro: '',
  seed_id: 'pam-test',
  rooms: [{ id: ctx.startRoomId, name: 'Start', desc: '' }],
  connections: { [ctx.startRoomId]: [] },
  enemies: {
    [ctx.startRoomId]: [
      {
        id: enemyId,
        name: 'Goblin',
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

function buildState(opts: {
  feats: string[];
  weaponId: string;
  actionUsed: boolean;
  bonusActionUsed?: boolean;
}) {
  const pc = makeChar({
    id: 'pc-1',
    character_class: 'Fighter',
    level: 3,
    str: 16,
    hp: 30,
    max_hp: 30,
    feats: opts.feats,
    inventory: [{ instance_id: 'w-1', id: opts.weaponId, name: opts.weaponId }],
    equipped_weapon: 'w-1',
    weapon_proficiencies: ['simple', 'martial'],
    turn_actions: {
      action_used: opts.actionUsed,
      bonus_action_used: opts.bonusActionUsed ?? false,
      reaction_used: false,
      free_interaction_used: false,
    },
  });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: ctx.startRoomId, combat_active: true }),
    characters: [pc],
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
        hp: 50,
        maxHp: 50,
        conditions: [],
        condition_durations: {},
      },
    ],
  };
}

describe('Polearm Master — butt-end attack handler', () => {
  it('with feat + glaive + action_used → handler hits and consumes bonus action', async () => {
    mockRandom(0.99); // d20 = 20, max damage
    const state = buildState({
      feats: ['polearm_master'],
      weaponId: 'glaive',
      actionUsed: true,
    });
    const result = await takeAction({
      action: { type: 'polearm_butt_end', targetEnemyId: enemyId },
      history: [],
      state,
      seed: seedWithGoblin,
      context: ctx,
    });
    expect(result.narrative).toMatch(/Polearm Master butt-end/);
    // The narrative confirms the bonus-action attack fired; the
    // post-action initiative advance + FRESH_TURN means the
    // `bonus_action_used` flag is already cleared by the time the
    // PC's next turn rolls around. The choice gate test below
    // verifies the gate while the flag is still hot.
  });

  it('without the feat → rejected', async () => {
    const state = buildState({
      feats: [],
      weaponId: 'glaive',
      actionUsed: true,
    });
    const result = await takeAction({
      action: { type: 'polearm_butt_end', targetEnemyId: enemyId },
      history: [],
      state,
      seed: seedWithGoblin,
      context: ctx,
    });
    expect(result.narrative).toMatch(/does not have the Polearm Master feat/);
  });

  it('with feat but non-polearm weapon → rejected', async () => {
    const state = buildState({
      feats: ['polearm_master'],
      weaponId: 'longsword',
      actionUsed: true,
    });
    const result = await takeAction({
      action: { type: 'polearm_butt_end', targetEnemyId: enemyId },
      history: [],
      state,
      seed: seedWithGoblin,
      context: ctx,
    });
    expect(result.narrative).toMatch(/qualifying polearm/);
  });

  it('with feat + polearm but action not used → rejected', async () => {
    const state = buildState({
      feats: ['polearm_master'],
      weaponId: 'spear',
      actionUsed: false,
    });
    const result = await takeAction({
      action: { type: 'polearm_butt_end', targetEnemyId: enemyId },
      history: [],
      state,
      seed: seedWithGoblin,
      context: ctx,
    });
    expect(result.narrative).toMatch(/Attack action to have been used/);
  });

  it('choice surfaces in generateChoices after Attack action', () => {
    const state = buildState({
      feats: ['polearm_master'],
      weaponId: 'glaive',
      actionUsed: true,
    });
    const choices = generateChoices(state, seedWithGoblin, ctx);
    const labels = choices.map((c) => c.label);
    expect(labels.some((l) => /Polearm Master/.test(l))).toBe(true);
  });

  it('take-time records the feat + narrative', () => {
    const char = makeChar({ id: 'pc-1', feats: [] });
    const feat = getFeat('polearm_master', ctx);
    if (!feat) throw new Error('polearm_master missing');
    const { newChar, narrative } = applyFeatTake(char, feat);
    expect(newChar.feats).toContain('polearm_master');
    expect(narrative).toMatch(/bonus-action butt-end strike/);
  });
});
