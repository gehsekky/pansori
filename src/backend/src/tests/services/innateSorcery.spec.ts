// RE-2 — Innate Sorcery (SRD 5.2.1, Sorcerer L1): a Bonus Action grants, for
// the encounter, +1 spell save DC and Advantage on Sorcerer spell attacks;
// 2 uses per long rest. Modeled as a self-buff condition cleared at combat end.

import type { Character, Enemy, GameState, Seed } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { baseSandboxSeed, makeChar, makeState } from '../../test-fixtures.js';
import { endCombatState, takeAction } from '../../services/gameEngine.js';
import type { ActionContext } from '../../services/actions/types.js';
import { context as ctx } from '../fixtures/testContext.js';
import { handleCasterFeature } from '../../services/actions/classFeature/casters.js';
import { pcActor } from '../../services/actions/actor.js';

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
const fresh = () => ({
  action_used: false,
  bonus_action_used: false,
  reaction_used: false,
  free_interaction_used: false,
});

describe('Innate Sorcery — activation', () => {
  it('a Sorcerer activates it: condition set, a use spent, bonus action spent', () => {
    const c = featCtx(
      makeChar({ character_class: 'Sorcerer', level: 1, cha: 16, turn_actions: fresh() })
    );
    expect(handleCasterFeature(c, 'innate_sorcery')).toBe(true);
    expect(pcChar(c).conditions).toContain('innate_sorcery');
    expect(pcChar(c).class_resource_uses?.innate_sorcery_used).toBe(1);
    expect(pcChar(c).turn_actions.bonus_action_used).toBe(true);
  });

  it('is expended after 2 uses per long rest', () => {
    const c = featCtx(
      makeChar({
        character_class: 'Sorcerer',
        level: 5,
        cha: 16,
        turn_actions: fresh(),
        class_resource_uses: { innate_sorcery_used: 2 },
      })
    );
    handleCasterFeature(c, 'innate_sorcery');
    expect(c.narrative).toMatch(/expended/);
    expect(pcChar(c).conditions).not.toContain('innate_sorcery');
  });

  it('rejects a non-Sorcerer and a double-activation', () => {
    const c1 = featCtx(makeChar({ character_class: 'Wizard', level: 5, turn_actions: fresh() }));
    handleCasterFeature(c1, 'innate_sorcery');
    expect(c1.narrative).toMatch(/Only Sorcerers/);

    const c2 = featCtx(
      makeChar({
        character_class: 'Sorcerer',
        level: 5,
        cha: 16,
        turn_actions: fresh(),
        conditions: ['innate_sorcery'],
      })
    );
    handleCasterFeature(c2, 'innate_sorcery');
    expect(c2.narrative).toMatch(/already active/);
  });
});

describe('Innate Sorcery — lifecycle', () => {
  it('clears at combat end', () => {
    const sorc = makeChar({
      id: 'pc-1',
      character_class: 'Sorcerer',
      level: 5,
      conditions: ['innate_sorcery'],
    });
    const ended = endCombatState(
      makeState({}, { characters: [sorc], active_character_id: 'pc-1', combat_active: true })
    );
    expect(ended.characters[0].conditions).not.toContain('innate_sorcery');
  });

  it('regains both uses on a long rest', async () => {
    const sorc = makeChar({
      character_class: 'Sorcerer',
      level: 5,
      hp: 5,
      max_hp: 20,
      class_resource_uses: { innate_sorcery_used: 2, sorcery_points: 0 },
    });
    const r = await takeAction({
      action: { type: 'long_rest' },
      history: [],
      state: makeState({ ...sorc }),
      seed: baseSandboxSeed,
      context: ctx,
    });
    expect(r.newState.characters[0].class_resource_uses?.innate_sorcery_used).toBeUndefined();
  });
});

const ENEMY = `entry_hall#0`;
const baseSeed = {
  context_id: ctx.id,
  world_name: 'IS',
  ship_name: 'IS',
  intro: '',
  seed_id: 'is',
  rooms: [{ id: 'entry_hall', name: 'S', desc: '' }],
  enemies: {
    ['entry_hall']: [
      {
        id: ENEMY,
        name: 'Skeleton',
        hp: 40,
        ac: 12,
        damage: '1d6',
        toHit: 3,
        xp: 50,
      } as unknown as Enemy,
    ],
  },
  loot: {},
  npcs: {},
} as Seed;

function sorcState(active: boolean): GameState {
  const sorc = makeChar({
    id: 'pc-1',
    character_class: 'Sorcerer',
    level: 3,
    cha: 16,
    spell_slots_max: { 1: 4, 2: 2 },
    spell_slots_used: {},
    spells_known: ['fire_bolt'],
    conditions: active ? ['innate_sorcery'] : [],
  });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
    characters: [sorc],
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
        hp: 18,
        maxHp: 18,
        conditions: active ? ['innate_sorcery'] : [],
        condition_durations: {},
      },
      {
        id: ENEMY,
        isEnemy: true,
        pos: { x: 5, y: 5 },
        hp: 40,
        maxHp: 40,
        conditions: [],
        condition_durations: {},
      },
    ],
  } as unknown as GameState;
}

describe('Innate Sorcery — Advantage on spell attacks', () => {
  it('a low-then-high roll hits with Innate Sorcery (advantage takes the high)', async () => {
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.1).mockReturnValue(0.9); // d20 3 then 19
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'fire_bolt', slotLevel: 0, targetEnemyId: ENEMY },
      history: [],
      state: sorcState(true),
      seed: baseSeed,
      context: ctx,
    });
    expect(r.newState.entities?.find((e) => e.id === ENEMY)!.hp).toBeLessThan(40); // hit
  });

  it('the same low roll misses without Innate Sorcery (control)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1); // d20 3 → +5 = 8 < AC 12 → miss
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'fire_bolt', slotLevel: 0, targetEnemyId: ENEMY },
      history: [],
      state: sorcState(false),
      seed: baseSeed,
      context: ctx,
    });
    expect(r.newState.entities?.find((e) => e.id === ENEMY)!.hp).toBe(40); // miss
  });
});
