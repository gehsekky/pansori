// RE-3 — Skill→ability map + routing social checks through skillCheck so they
// pick up Expertise / Jack of All Trades / Reliable Talent / Halfling Lucky.

import type { Enemy, GameState, Seed } from '../types.js';
import { SKILL_ABILITY, abilityForSkill } from './rulesEngine.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../test-fixtures.js';
import { context as ctx } from '../contexts/sandbox.js';
import { takeAction } from './gameEngine.js';

afterEach(() => vi.restoreAllMocks());

describe('skill → ability map', () => {
  it('maps each SRD skill to its governing ability', () => {
    expect(abilityForSkill('athletics')).toBe('str');
    expect(abilityForSkill('stealth')).toBe('dex');
    expect(abilityForSkill('Arcana')).toBe('int'); // case-insensitive
    expect(abilityForSkill('perception')).toBe('wis');
    expect(abilityForSkill('persuasion')).toBe('cha');
    expect(abilityForSkill('made_up_skill')).toBe('int'); // sensible default
  });

  it('covers all 18 SRD skills', () => {
    expect(Object.keys(SKILL_ABILITY)).toHaveLength(18);
  });
});

const ENEMY = `${ctx.startRoomId}#0`;
const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Skill',
  ship_name: 'Skill',
  intro: '',
  seed_id: 'skill',
  rooms: [{ id: ctx.startRoomId, name: 'S', desc: '' }],
  connections: { [ctx.startRoomId]: [] },
  // int 17 → Influence DC = max(15, 17) = 17.
  enemies: {
    [ctx.startRoomId]: [
      { id: ENEMY, name: 'Zealot', hp: 40, ac: 12, damage: '1d6', toHit: 3, xp: 30, int: 17 } as unknown as Enemy,
    ],
  },
  loot: {},
  npcs: {},
};

function bardState(expert: boolean): GameState {
  const c = makeChar({
    id: 'pc-1',
    character_class: 'Bard',
    subclass: 'lore',
    level: 3, // prof +2
    cha: 16, // +3
    skill_proficiencies: ['persuasion'],
    expertise_skills: expert ? ['persuasion'] : [],
  });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: ctx.startRoomId, combat_active: true }),
    characters: [c],
    active_character_id: 'pc-1',
    initiative_order: [
      { id: 'pc-1', roll: 18, is_enemy: false },
      { id: ENEMY, roll: 5, is_enemy: true },
    ],
    initiative_idx: 0,
    entities: [
      { id: 'pc-1', isEnemy: false, pos: { x: 4, y: 5 }, hp: 30, maxHp: 30, conditions: [], condition_durations: {} },
      { id: ENEMY, isEnemy: true, pos: { x: 5, y: 5 }, hp: 40, maxHp: 40, conditions: [], condition_durations: {} },
    ],
  } as unknown as GameState;
}

const influence = async (state: GameState) =>
  takeAction({
    action: { type: 'influence', skill: 'persuasion', targetEnemyId: ENEMY },
    history: [],
    state,
    seed,
    context: ctx,
  });

describe('Influence now routes through skillCheck (Expertise applies)', () => {
  it('a Lore Bard with Expertise in Persuasion succeeds where a non-expert fails', async () => {
    // d20 = 11. Non-expert: 11 + 3 CHA + 2 prof = 16 < DC 17 → fail.
    // Expert (double prof): 11 + 3 + 4 = 18 ≥ 17 → success.
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const expert = await influence(bardState(true));
    expect(expert.narrative).toMatch(/success/);

    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const plain = await influence(bardState(false));
    expect(plain.narrative).toMatch(/fails/);
  });
});
