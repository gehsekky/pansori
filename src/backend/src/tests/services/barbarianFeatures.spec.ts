// SRD 5.2.1 Barbarian features:
// - Primal Knowledge (L3): a skill from the Barbarian list, and STR for
//   Acrobatics / Intimidation / Perception / Stealth / Survival while raging.
// - Instinctive Pounce (L7): entering Rage grants half your Speed in movement.
// - Improved Brutal Strike (L13: Staggering / Sundering Blow; L17: 2d10 and two
//   different effects).
// - Path of the Berserker Mindless Rage (L6): Charmed / Frightened end on Rage,
//   and can't be applied while it lasts.
// Plus two engine fixes found on the way: Dash-style movement no longer
// clamps at 0, and skill-proficiency lookups ignore spelling.

import { CORRIDOR_ID, makeChar, makeState, seedWithEnemy } from '../../test-fixtures.js';
import type { Character, GameState, Seed } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  brutalStrikeDice,
  brutalStrikeOptions,
  instinctivePounceFeet,
  pendingBonusSkills,
  primalKnowledgeScore,
} from '../../services/barbarianFeatures.js';
import {
  conditionImmunitiesFor,
  effectiveSpeed,
  generateChoices,
  partyDetectsTrap,
  takeAction,
} from '../../services/gameEngine.js';
import { hasSkillProficiency, skillLabel } from '../../services/multiclass.js';
import type { ActionContext } from '../../services/actions/types.js';
import { computeAttackEdges } from '../../services/attackEdges.js';
import { context as ctx } from '../fixtures/testContext.js';
import { disadvantageOnSave } from '../../services/conditions/registry.js';
import { opportunityAttackTriggers } from '../../services/gridEngine.js';
import { pcActor } from '../../services/actions/actor.js';

afterEach(() => vi.restoreAllMocks());

const GOBLIN = `${CORRIDOR_ID}#0`;

const barbarian = (level: number, over: Partial<Character> = {}) =>
  makeChar({
    id: 'pc-1',
    character_class: 'Barbarian',
    level,
    class_levels: { barbarian: level },
    str: 18,
    dex: 10,
    hp: 80,
    max_hp: 80,
    ...over,
  });

const fresh = {
  action_used: false,
  bonus_action_used: false,
  reaction_used: false,
  free_interaction_used: false,
};

/** A 1v1 grid fight: the PC at `pcPos`, a sturdy goblin adjacent. */
function gridFight(char: Character, pcPos = { x: 2, y: 2 }, enemyPos = { x: 3, y: 2 }): GameState {
  return {
    ...makeState({ id: char.id }),
    characters: [char],
    active_character_id: char.id,
    current_room: CORRIDOR_ID,
    visited_rooms: ['entry_hall', CORRIDOR_ID],
    combat_active: true,
    initiative_order: [
      { id: char.id, roll: 18, is_enemy: false },
      { id: GOBLIN, roll: 5, is_enemy: true },
    ],
    initiative_idx: 0,
    entities: [
      {
        id: char.id,
        isEnemy: false,
        pos: pcPos,
        hp: char.hp,
        maxHp: char.max_hp,
        conditions: [],
        condition_durations: {},
      },
      {
        id: GOBLIN,
        isEnemy: true,
        pos: enemyPos,
        hp: 500,
        maxHp: 500,
        conditions: [],
        condition_durations: {},
      },
    ],
    movement_used: {},
  };
}

const act = (state: GameState, action: Record<string, unknown>, seed: Seed = seedWithEnemy) =>
  takeAction({ action: action as never, history: [], state, seed, context: ctx });

const feature = (featureId: string) => ({ type: 'use_class_feature', featureId });

// ─── Primal Knowledge ────────────────────────────────────────────────────────

describe('Primal Knowledge (L3)', () => {
  it('lets a raging Barbarian use STR for the listed skills only', () => {
    const raging = barbarian(3, { conditions: ['raging'] });
    expect(primalKnowledgeScore(raging, 'Stealth', raging.dex)).toBe(18);
    expect(primalKnowledgeScore(raging, 'intimidation', raging.cha)).toBe(18);
    expect(primalKnowledgeScore(raging, 'perception', raging.wis)).toBe(18);
    // Not on the list.
    expect(primalKnowledgeScore(raging, 'persuasion', raging.cha)).toBe(10);
    // Not raging, or below L3.
    expect(primalKnowledgeScore(barbarian(3), 'stealth', 10)).toBe(10);
    expect(primalKnowledgeScore(barbarian(2, { conditions: ['raging'] }), 'stealth', 10)).toBe(10);
    // A better normal score is kept (it's the player's option).
    expect(primalKnowledgeScore(raging, 'stealth', 20)).toBe(20);
  });

  it('opens one skill pick from the Barbarian list at L3, skipping known skills', () => {
    expect(pendingBonusSkills(barbarian(2))).toEqual([]);
    const b = barbarian(3, { skill_proficiencies: ['athletics', 'Perception'] });
    const [grant] = pendingBonusSkills(b);
    expect(grant.count).toBe(1);
    expect(grant.options).not.toContain('athletics');
    expect(grant.options).not.toContain('perception');
    expect(grant.options).toContain('animal_handling');
  });

  it('is offered out of combat and spends the pick through choose_bonus_skill', async () => {
    const b = barbarian(3, { skill_proficiencies: ['athletics'] });
    const st = { ...makeState({ id: 'pc-1' }), characters: [b], active_character_id: 'pc-1' };
    const choices = generateChoices(st, seedWithEnemy, ctx);
    const pick = choices.find((c) => c.label === 'Primal Knowledge: gain proficiency in Survival');
    expect(pick?.action).toEqual({
      type: 'choose_bonus_skill',
      source: 'primal_knowledge',
      skill: 'survival',
    });

    const r = await act(st, pick!.action as never);
    const after = r.newState.characters[0];
    expect(after.skill_proficiencies).toContain('survival');
    expect(after.bonus_skill_picks).toEqual({ primal_knowledge: ['survival'] });
    expect(pendingBonusSkills(after)).toEqual([]);
    expect(
      generateChoices({ ...st, characters: [after] }, seedWithEnemy, ctx).some(
        (c) => c.action.type === 'choose_bonus_skill'
      )
    ).toBe(false);
  });

  it('rejects a skill outside the grant', async () => {
    const b = barbarian(3);
    const st = { ...makeState({ id: 'pc-1' }), characters: [b], active_character_id: 'pc-1' };
    const r = await act(st, {
      type: 'choose_bonus_skill',
      source: 'primal_knowledge',
      skill: 'arcana',
    });
    expect(r.newState.characters[0].skill_proficiencies).not.toContain('arcana');
  });
});

// ─── Instinctive Pounce ──────────────────────────────────────────────────────

describe('Instinctive Pounce (L7)', () => {
  it('entering Rage grants half Speed of extra movement this turn', async () => {
    expect(instinctivePounceFeet(barbarian(6), 40)).toBe(0);
    expect(instinctivePounceFeet(barbarian(7), 40)).toBe(20);

    const b = barbarian(7);
    const speed = effectiveSpeed(b, ctx.lootTable); // 30 + Fast Movement 10
    expect(speed).toBe(40);
    const r = await act(gridFight(b), feature('rage'));
    expect(r.newState.characters[0].conditions).toContain('raging');
    expect(r.newState.movement_used?.['pc-1']).toBe(-20);
    expect(r.narrative).toMatch(/Instinctive Pounce: \+20 ft/);
  });

  it('isn’t granted below L7', async () => {
    const r = await act(gridFight(barbarian(6)), feature('rage'));
    expect(r.newState.movement_used?.['pc-1'] ?? 0).toBe(0);
  });
});

// ─── Mindless Rage ───────────────────────────────────────────────────────────

describe('Berserker Mindless Rage (L6)', () => {
  const berserker = (level: number, over: Partial<Character> = {}) =>
    barbarian(level, { subclass: 'berserker', ...over });

  it('entering Rage ends Charmed and Frightened', async () => {
    const b = berserker(6, {
      conditions: ['frightened', 'charmed', 'poisoned'],
      condition_durations: { frightened: 3, charmed: 3, poisoned: 2 },
      condition_sources: { frightened: GOBLIN, charmed: GOBLIN },
      charmer_id: GOBLIN,
    });
    const r = await act(gridFight(b), feature('rage'));
    const after = r.newState.characters[0];
    expect(after.conditions).toEqual(expect.arrayContaining(['raging', 'poisoned']));
    expect(after.conditions).not.toContain('frightened');
    expect(after.conditions).not.toContain('charmed');
    expect(after.condition_durations.frightened).toBeUndefined();
    expect(after.condition_sources?.charmed).toBeUndefined();
    expect(after.charmer_id).toBeUndefined();
    expect(r.narrative).toMatch(/Mindless Rage/);
  });

  it('grants immunity to both only while raging, at L6+', () => {
    const st = makeState({ id: 'pc-1' });
    const raging = conditionImmunitiesFor(berserker(6, { conditions: ['raging'] }), st);
    expect(raging.has('charmed')).toBe(true);
    expect(raging.has('frightened')).toBe(true);
    expect(conditionImmunitiesFor(berserker(6), st).has('frightened')).toBe(false);
    expect(
      conditionImmunitiesFor(berserker(5, { conditions: ['raging'] }), st).has('frightened')
    ).toBe(false);
  });

  it('a non-Berserker Barbarian keeps the conditions', async () => {
    const r = await act(gridFight(barbarian(6, { conditions: ['frightened'] })), feature('rage'));
    expect(r.newState.characters[0].conditions).toContain('frightened');
  });
});

// ─── Improved Brutal Strike ──────────────────────────────────────────────────

const reckless = (level: number, pending?: string[]) =>
  barbarian(level, {
    weapon_proficiencies: ['simple', 'martial'],
    inventory: [{ instance_id: 'gx-1', id: 'greataxe', name: 'Greataxe' }],
    equipment: { main_hand: 'gx-1' },
    turn_actions: { ...fresh, reckless: true, brutal_strike_pending: pending as never },
  });

describe('Improved Brutal Strike (L13 / L17)', () => {
  it('unlocks Staggering and Sundering at L13 and 2d10 at L17', () => {
    expect(brutalStrikeOptions(barbarian(12))).toEqual(['forceful', 'hamstring']);
    expect(brutalStrikeOptions(barbarian(13))).toContain('staggering');
    expect(brutalStrikeOptions(barbarian(13))).toContain('sundering');
    expect(brutalStrikeDice(barbarian(16))).toBe('1d10');
    expect(brutalStrikeDice(barbarian(17))).toBe('2d10');
  });

  it('rejects Staggering Blow below L13', async () => {
    const r = await act(gridFight(reckless(12)), feature('brutal_strike_staggering'));
    expect(r.newState.characters[0].turn_actions.brutal_strike_pending).toBeUndefined();
    expect(r.narrative).toMatch(/level 13/);
  });

  it('L13 holds one effect; L17 adds a second, different one', async () => {
    const r13 = await act(
      gridFight(reckless(13, ['forceful'])),
      feature('brutal_strike_sundering')
    );
    expect(r13.newState.characters[0].turn_actions.brutal_strike_pending).toEqual(['forceful']);

    const r17 = await act(
      gridFight(reckless(17, ['forceful'])),
      feature('brutal_strike_sundering')
    );
    expect(r17.newState.characters[0].turn_actions.brutal_strike_pending).toEqual([
      'forceful',
      'sundering',
    ]);
    const dup = await act(gridFight(reckless(17, ['forceful'])), feature('brutal_strike_forceful'));
    expect(dup.newState.characters[0].turn_actions.brutal_strike_pending).toEqual(['forceful']);
  });

  it('the menu offers the second pick at L17, without the chosen effect', () => {
    const st = gridFight(reckless(17, ['staggering']));
    const ids = generateChoices(st, seedWithEnemy, ctx)
      .map((c) => (c.action as { featureId?: string }).featureId ?? '')
      .filter((id) => id.startsWith('brutal_strike_'));
    expect(ids.sort()).toEqual([
      'brutal_strike_forceful',
      'brutal_strike_hamstring',
      'brutal_strike_sundering',
    ]);
    const l13 = gridFight(reckless(13, ['staggering']));
    expect(
      generateChoices(l13, seedWithEnemy, ctx).some((c) =>
        ((c.action as { featureId?: string }).featureId ?? '').startsWith('brutal_strike_')
      )
    ).toBe(false);
  });

  it('a hit at L17 deals 2d10 and applies both Staggering and Sundering', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // d20 → 20
    const r = await act(gridFight(reckless(17, ['staggering', 'sundering'])), {
      type: 'attack',
      targetEnemyId: GOBLIN,
    });
    expect(r.narrative).toMatch(/Brutal Strike 2d10/);
    expect(r.narrative).toMatch(/Staggering Blow/);
    expect(r.narrative).toMatch(/Sundering Blow/);
    const gob = r.newState.entities?.find((e) => e.id === GOBLIN);
    expect(gob?.conditions).toContain('staggered');
    expect(gob?.conditions).toContain('sundered_by_pc-1');
    expect(r.newState.characters[0].turn_actions.brutal_strike_pending).toBeUndefined();
  });

  it('a pre-L17 single-string rider still resolves', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const b = reckless(9);
    b.turn_actions = { ...b.turn_actions, brutal_strike_pending: 'hamstring' };
    const r = await act(gridFight(b), { type: 'attack', targetEnemyId: GOBLIN });
    expect(r.newState.entities?.find((e) => e.id === GOBLIN)?.conditions).toContain('hamstrung');
  });

  it('Staggered: Disadvantage on saves, and no Opportunity Attacks', () => {
    expect(disadvantageOnSave(['staggered'], 'wis')).toBe(true);
    expect(disadvantageOnSave(['staggered'], 'dex')).toBe(true);
    const st = gridFight(barbarian(13));
    const gob = st.entities![1];
    const leaving = opportunityAttackTriggers({ x: 2, y: 2 }, { x: 0, y: 2 }, st.entities!, false);
    expect(leaving.map((e) => e.id)).toEqual([GOBLIN]);
    const staggered = [st.entities![0], { ...gob, conditions: ['staggered'] }];
    expect(opportunityAttackTriggers({ x: 2, y: 2 }, { x: 0, y: 2 }, staggered, false)).toEqual([]);
  });

  it('Sundering: +5 on the next attack by someone else, consumed once', () => {
    const ally = makeChar({ id: 'pc-2', character_class: 'Fighter', level: 5 });
    const st = gridFight(barbarian(13));
    st.characters = [...st.characters, ally];
    st.entities = [
      ...st.entities!.map((e) =>
        e.id === GOBLIN ? { ...e, conditions: ['sundered_by_pc-1'] } : e
      ),
      {
        id: 'pc-2',
        isEnemy: false,
        pos: { x: 3, y: 3 },
        hp: 10,
        maxHp: 10,
        conditions: [],
        condition_durations: {},
      },
    ];
    const target = seedWithEnemy.enemies[CORRIDOR_ID][0];
    const ctxFor = (char: Character): ActionContext =>
      ({
        actor: pcActor(char, 0),
        st,
        seed: seedWithEnemy,
        roomId: CORRIDOR_ID,
        roomObstacleCells: [],
      }) as unknown as ActionContext;

    // The Barbarian's own attack leaves the tag alone.
    const own = ctxFor(st.characters[0]);
    expect(computeAttackEdges(own, target, GOBLIN, { ranged: false }).sunderingBonus).toBe(0);
    expect(own.st.entities?.find((e) => e.id === GOBLIN)?.conditions).toContain('sundered_by_pc-1');

    const other = ctxFor(ally);
    expect(computeAttackEdges(other, target, GOBLIN, { ranged: false }).sunderingBonus).toBe(5);
    expect(other.st.entities?.find((e) => e.id === GOBLIN)?.conditions).toEqual([]);
    expect(computeAttackEdges(other, target, GOBLIN, { ranged: false }).sunderingBonus).toBe(0);
  });
});

// ─── Engine fixes ────────────────────────────────────────────────────────────

describe('Dash before moving', () => {
  it('Dash at the start of a turn doubles the movement budget', async () => {
    const b = barbarian(1); // Speed 30
    const st = gridFight(b, { x: 0, y: 2 }, { x: 0, y: 9 });
    const to = { x: 9, y: 2 }; // 45 ft: beyond Speed alone, within Speed + Dash
    const wide: Seed = {
      ...seedWithEnemy,
      rooms: seedWithEnemy.rooms.map((r) =>
        r.id === CORRIDOR_ID ? { ...r, gridWidth: 14, gridHeight: 10 } : r
      ),
    };
    const noDash = await act(st, { type: 'grid_move', entityId: 'pc-1', to }, wide);
    expect(noDash.narrative).toMatch(/Not enough movement/);

    const r = await act(st, { type: 'dash' }, wide);
    expect(r.newState.movement_used?.['pc-1']).toBe(-30);
    const mv = await act(r.newState, { type: 'grid_move', entityId: 'pc-1', to }, wide);
    expect(mv.newState.entities?.find((e) => e.id === 'pc-1')?.pos).toEqual(to);
  });
});

describe('Skill proficiency spelling', () => {
  it('matches class picks, background names and multi-word skills alike', () => {
    const c = makeChar({ skill_proficiencies: ['stealth', 'Sleight of Hand', 'animal_handling'] });
    expect(hasSkillProficiency(c, 'Stealth')).toBe(true);
    expect(hasSkillProficiency(c, 'sleight_of_hand')).toBe(true);
    expect(hasSkillProficiency(c, 'Animal Handling')).toBe(true);
    expect(hasSkillProficiency(c, 'perception')).toBe(false);
    expect(skillLabel('sleight_of_hand')).toBe('Sleight of Hand');
  });

  it('a class-picked lowercase Perception counts for trap detection', () => {
    const trap = { dc: 13 } as never;
    const withProf = makeChar({ level: 5, wis: 10, skill_proficiencies: ['perception'] });
    const without = makeChar({ level: 5, wis: 10 });
    // Passive 10 + prof 3 = 13 vs 10.
    expect(partyDetectsTrap([withProf], trap)).toBe(true);
    expect(partyDetectsTrap([without], trap)).toBe(false);
  });
});
