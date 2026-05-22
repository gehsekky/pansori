// Dual Wielder (2024 PHB general feat, L4 half-feat). Three RAW
// benefits — pansori ships two:
//   1. +1 STR or DEX (half-feat).
//   2. TWF off-hand can be any one-handed melee weapon, not just
//      Light. The free draw/stow benefit is not modeled.

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
  world_name: 'Dual Wielder Test',
  ship_name: 'Dual Wielder Test',
  intro: '',
  seed_id: 'dw-test',
  rooms: [{ id: ctx.startRoomId, name: 'Start', desc: '' }],
  connections: { [ctx.startRoomId]: [] },
  enemies: {
    [ctx.startRoomId]: [
      {
        id: enemyId,
        name: 'Goblin',
        hp: 50,
        ac: 12,
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
  mainHandId: string;
  offhandId: string;
  actionUsed: boolean;
}) {
  const pc = makeChar({
    id: 'pc-1',
    character_class: 'Fighter',
    level: 5,
    str: 16,
    dex: 14,
    hp: 30,
    max_hp: 30,
    feats: opts.feats,
    inventory: [
      { instance_id: 'mh-1', id: opts.mainHandId, name: opts.mainHandId },
      { instance_id: 'oh-1', id: opts.offhandId, name: opts.offhandId },
    ],
    equipped_weapon: 'mh-1',
    weapon_proficiencies: ['simple', 'martial'],
    turn_actions: {
      action_used: opts.actionUsed,
      bonus_action_used: false,
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

describe('Dual Wielder — relaxes light-only off-hand requirement', () => {
  it('without the feat: longsword + longsword off-hand → no TWF choice (light-only RAW)', () => {
    const state = buildState({
      feats: [],
      mainHandId: 'longsword',
      offhandId: 'longsword',
      actionUsed: true,
    });
    const choices = generateChoices(state, seedWithGoblin, ctx);
    const twfChoice = choices.find((c) => c.action.type === 'two_weapon_attack');
    expect(twfChoice).toBeUndefined();
  });

  it('with the feat: longsword + longsword off-hand → TWF choice surfaces', () => {
    const state = buildState({
      feats: ['dual_wielder'],
      mainHandId: 'longsword',
      offhandId: 'longsword',
      actionUsed: true,
    });
    const choices = generateChoices(state, seedWithGoblin, ctx);
    const twfChoice = choices.find((c) => c.action.type === 'two_weapon_attack');
    expect(twfChoice).toBeDefined();
  });

  it('with the feat: TWF handler accepts the non-light off-hand', async () => {
    mockRandom(0.99); // auto-hit + max dmg
    const state = buildState({
      feats: ['dual_wielder'],
      mainHandId: 'longsword',
      offhandId: 'longsword',
      actionUsed: true,
    });
    const result = await takeAction({
      action: { type: 'two_weapon_attack', targetEnemyId: enemyId },
      history: [],
      state,
      seed: seedWithGoblin,
      context: ctx,
    });
    expect(result.narrative).toMatch(/Off-hand strike with [Ll]ongsword/);
  });

  it('shortsword + dagger still works (light-only baseline) — feat does not break TWF', async () => {
    mockRandom(0.99);
    const state = buildState({
      feats: ['dual_wielder'],
      mainHandId: 'shortsword',
      offhandId: 'dagger',
      actionUsed: true,
    });
    const result = await takeAction({
      action: { type: 'two_weapon_attack', targetEnemyId: enemyId },
      history: [],
      state,
      seed: seedWithGoblin,
      context: ctx,
    });
    expect(result.narrative).toMatch(/Off-hand strike with [Dd]agger/);
  });

  it('take-time: half-feat ability bonus + narrative', () => {
    const char = makeChar({ id: 'pc-1', str: 14, feats: [] });
    const feat = getFeat('dual_wielder', ctx);
    if (!feat) throw new Error('dual_wielder missing');
    const { newChar, narrative } = applyFeatTake(char, feat, { abilityChoice: 'str' });
    expect(newChar.feats).toContain('dual_wielder');
    expect(newChar.str).toBe(15);
    expect(narrative).toMatch(/TWF off-hand can be any one-handed melee weapon/);
  });
});
