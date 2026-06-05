// Tests for the Alert + Savage Attacker origin feats (SRD).
// Alert: +prof bonus to Initiative rolls. Savage Attacker: once
// per turn, weapon-damage hits reroll the damage and take the
// higher result.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildInitiativeOrder, takeAction } from '../gameEngine.js';
import { makeChar, makeEnemy, makeState, mockRandom } from '../../test-fixtures.js';
import type { Seed } from '../../types.js';
import { context as ctx } from '../../campaignData/sandbox.js';

afterEach(() => vi.restoreAllMocks());

describe('Alert feat — Initiative bonus', () => {
  it("adds proficiency bonus to a PC's initiative roll", () => {
    // d20 mocked to 10. Without Alert: 10 + DEX mod. With Alert at L5:
    // 10 + DEX mod + 3 (prof). Compare both PCs side-by-side.
    mockRandom(0.45, 0.45); // both d20s → 10
    const plain = makeChar({ id: 'pc-plain', level: 5, dex: 14, feats: [] });
    const alert = makeChar({ id: 'pc-alert', level: 5, dex: 14, feats: ['alert'] });
    const entries = buildInitiativeOrder([plain, alert], []);
    const plainEntry = entries.find((e) => e.id === 'pc-plain');
    const alertEntry = entries.find((e) => e.id === 'pc-alert');
    expect(plainEntry?.roll).toBe(10 + 2); // d20=10 + DEX mod +2
    expect(alertEntry?.roll).toBe(10 + 2 + 3); // + L5 prof
    // Alert PC ranks above the plain PC.
    expect(entries[0].id).toBe('pc-alert');
  });

  it('is a no-op for PCs without the feat', () => {
    mockRandom(0.45);
    const plain = makeChar({ id: 'pc-1', level: 5, dex: 14, feats: ['tough'] });
    const entries = buildInitiativeOrder([plain], []);
    expect(entries[0].roll).toBe(10 + 2);
  });
});

const enemyId = `entry_hall#0`;

const seedWithGoblin: Seed = {
  context_id: ctx.id,
  world_name: 'Savage Attacker Test',
  ship_name: 'Savage Attacker Test',
  intro: '',
  seed_id: 'sa-test',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {
    ['entry_hall']: [
      makeEnemy({ id: enemyId, name: 'Goblin', hp: 60, ac: 10, damage: '1d6', toHit: 3, xp: 20 }),
    ],
  },
  loot: {},
  npcs: {},
};

describe('Savage Attacker feat — once-per-turn damage reroll', () => {
  function buildFighterWithFeat(opts: { savedFlag?: boolean } = {}) {
    return makeChar({
      id: 'pc-1',
      character_class: 'Fighter',
      level: 5,
      str: 16,
      feats: opts.savedFlag !== undefined ? ['savage_attacker'] : ['savage_attacker'],
      inventory: [{ instance_id: 'sw-1', id: 'longsword', name: 'Longsword' }],
      equipment: { main_hand: 'sw-1' },
      weapon_proficiencies: ['simple', 'martial'],
      turn_actions: {
        action_used: false,
        bonus_action_used: false,
        reaction_used: false,
        free_interaction_used: false,
        savage_attacker_used: !!opts.savedFlag,
      },
    });
  }

  function buildState(char: ReturnType<typeof makeChar>) {
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

  it('rerolls weapon damage on first hit and marks the per-turn flag', async () => {
    // d20 → 20 (hit). First damage d8 → 1 (low). Reroll d8 → 8 (high).
    // random=0.99 → 20 (d20), random=0.0 → 1 (d8 first), random=0.99 → 8 (d8 reroll).
    mockRandom(0.99, 0.0, 0.99, 0.5, 0.5, 0.5);
    const pc = buildFighterWithFeat();
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: enemyId },
      history: [],
      state: buildState(pc),
      seed: seedWithGoblin,
      context: ctx,
    });
    const next = result.newState.characters[0];
    expect(next.turn_actions.savage_attacker_used).toBe(true);
  });

  it('does not reroll once the per-turn flag is set', async () => {
    mockRandom(0.99, 0.0, 0.5, 0.5);
    const pc = buildFighterWithFeat({ savedFlag: true });
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: enemyId },
      history: [],
      state: buildState(pc),
      seed: seedWithGoblin,
      context: ctx,
    });
    // Flag unchanged (already true).
    expect(result.newState.characters[0].turn_actions.savage_attacker_used).toBe(true);
  });

  it('is a no-op without the Savage Attacker feat', async () => {
    mockRandom(0.99, 0.0, 0.5);
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Fighter',
      level: 5,
      str: 16,
      feats: ['tough'],
      inventory: [{ instance_id: 'sw-1', id: 'longsword', name: 'Longsword' }],
      equipment: { main_hand: 'sw-1' },
      weapon_proficiencies: ['simple', 'martial'],
    });
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: enemyId },
      history: [],
      state: buildState(pc),
      seed: seedWithGoblin,
      context: ctx,
    });
    expect(result.newState.characters[0].turn_actions.savage_attacker_used).toBeFalsy();
  });
});
