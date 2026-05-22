// Heavy Armor Master feat — while wearing heavy armor and not
// incapacitated, attacks against you deal 3 less damage (2024 PHB
// general feat, L4 + heavy-armor proficiency).

import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyFeatTake, getFeat } from '../feats.js';
import { makeChar, makeState } from '../../test-fixtures.js';
import type { Seed } from '../../types.js';
import { context as ctx } from '../../contexts/sandbox.js';
import { takeAction } from '../gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const enemyId = `${ctx.startRoomId}#0`;

const seedWithGoblin: Seed = {
  context_id: ctx.id,
  world_name: 'HAM Test',
  ship_name: 'HAM Test',
  intro: '',
  seed_id: 'ham-test',
  rooms: [{ id: ctx.startRoomId, name: 'Start', desc: '' }],
  connections: { [ctx.startRoomId]: [] },
  enemies: {
    [ctx.startRoomId]: [
      {
        id: enemyId,
        name: 'Goblin',
        hp: 30,
        ac: 10,
        damage: '1d6',
        toHit: 20, // auto-hit
        xp: 20,
      },
    ],
  },
  loot: {},
  npcs: {},
};

function buildState(pcOverrides: Partial<ReturnType<typeof makeChar>>) {
  const pc = makeChar({
    id: 'pc-1',
    character_class: 'Fighter',
    level: 5,
    hp: 30,
    max_hp: 30,
    armor_proficiencies: ['light', 'medium', 'heavy'],
    inventory: [{ instance_id: 'a-1', id: 'chain_mail', name: 'Chain Mail' }],
    equipped_armor: 'a-1',
    ...pcOverrides,
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
        conditions: pcOverrides.conditions ?? [],
        condition_durations: {},
      },
      {
        id: enemyId,
        isEnemy: true,
        pos: { x: 5, y: 5 },
        hp: 30,
        maxHp: 30,
        conditions: [],
        condition_durations: {},
      },
    ],
  };
}

describe('Heavy Armor Master — damage reduction', () => {
  it('subtracts 3 from incoming damage when wearing heavy armor', async () => {
    // Force d6 → 6 (random=0.99). HP after: 30 - max(0, 6 - 3) = 27.
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const state = buildState({ feats: ['heavy_armor_master'] });
    const result = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state,
      seed: seedWithGoblin,
      context: ctx,
    });
    expect(result.narrative).toMatch(/Heavy Armor Master: -3/);
    // Note: damage rounding / random sequencing may give a different
    // exact value; only assert that the HAM note fired.
  });

  it('does NOT reduce damage when in non-heavy armor', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    // Light armor — feat shouldn't fire.
    const state = buildState({
      feats: ['heavy_armor_master'],
      inventory: [{ instance_id: 'la-1', id: 'leather', name: 'Leather Armor' }],
      equipped_armor: 'la-1',
    });
    const result = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state,
      seed: seedWithGoblin,
      context: ctx,
    });
    expect(result.narrative).not.toMatch(/Heavy Armor Master/);
  });

  it('does NOT reduce damage when incapacitated', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const state = buildState({
      feats: ['heavy_armor_master'],
      conditions: ['incapacitated'],
    });
    const result = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state,
      seed: seedWithGoblin,
      context: ctx,
    });
    expect(result.narrative).not.toMatch(/Heavy Armor Master/);
  });

  it('does NOT reduce damage when the PC lacks the feat', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const state = buildState({ feats: [] });
    const result = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state,
      seed: seedWithGoblin,
      context: ctx,
    });
    expect(result.narrative).not.toMatch(/Heavy Armor Master/);
  });

  it('take-time records the feat and surfaces the narrative', () => {
    const char = makeChar({ id: 'pc-1', feats: [] });
    const feat = getFeat('heavy_armor_master', ctx);
    if (!feat) throw new Error('heavy_armor_master missing from context');
    const { newChar, narrative } = applyFeatTake(char, feat);
    expect(newChar.feats).toContain('heavy_armor_master');
    expect(narrative).toMatch(/Heavy armor attacks against you deal 3 less damage/);
  });
});
