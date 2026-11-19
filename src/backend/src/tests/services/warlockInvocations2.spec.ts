// SRD 5.2.1 Eldritch Invocations — the last six: Gaze of Two Minds, Gift of
// the Depths, Gift of the Protectors, Investment of the Chain Master, Lessons
// of the First Ones and Witch Sight.

import { CORRIDOR_ID, makeChar, makeState, seedWithEnemy } from '../../test-fixtures.js';
import type { Character, Enemy, GameState, Seed } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateChoices, takeAction } from '../../services/gameEngine.js';
import { learnableInvocations, pendingLessonsFeats } from '../../services/invocations.js';
import type { ActionContext } from '../../services/actions/types.js';
import { computeAttackEdges } from '../../services/attackEdges.js';
import { context as ctx } from '../fixtures/testContext.js';
import { enemyActor } from '../../services/actions/actor.js';
import { handleEnemyAttack } from '../../services/actions/enemyAttack.js';
import { pcActor } from '../../services/actions/actor.js';
import { pendingBonusSkills } from '../../services/bonusSkills.js';
import { truesightFt } from '../../services/multiclass.js';

afterEach(() => vi.restoreAllMocks());

const GOB = `${CORRIDOR_ID}#0`;

const fresh = {
  action_used: false,
  bonus_action_used: false,
  reaction_used: false,
  free_interaction_used: false,
};

const warlock = (level: number, feats: string[] = [], over: Partial<Character> = {}) =>
  makeChar({
    id: 'wl',
    name: 'Warlock',
    character_class: 'Warlock',
    level,
    class_levels: { warlock: level },
    cha: 16, // +3
    hp: 60,
    max_hp: 60,
    feats,
    turn_actions: fresh,
    ...over,
  });

const ally = (over: Partial<Character> = {}) =>
  makeChar({
    id: 'pc-2',
    name: 'Ally',
    character_class: 'Fighter',
    level: 5,
    hp: 40,
    max_hp: 40,
    ...over,
  });

const ent = (id: string, isEnemy: boolean, pos: { x: number; y: number }, hp = 60) => ({
  id,
  isEnemy,
  pos,
  hp,
  maxHp: hp,
  conditions: [] as string[],
  condition_durations: {} as Record<string, number>,
});

/** Warlock at (1,2), ally at (5,2), goblin at (6,2). */
function fight(w: Character, a: Character = ally(), extra: GameState['entities'] = []): GameState {
  return {
    ...makeState({ id: w.id }),
    characters: [w, a],
    active_character_id: w.id,
    current_room: CORRIDOR_ID,
    visited_rooms: ['entry_hall', CORRIDOR_ID],
    combat_active: true,
    initiative_order: [
      { id: w.id, roll: 20, is_enemy: false },
      { id: a.id, roll: 15, is_enemy: false },
      { id: GOB, roll: 5, is_enemy: true },
    ],
    initiative_idx: 0,
    entities: [
      ent(w.id, false, { x: 1, y: 2 }, w.hp),
      ent(a.id, false, { x: 5, y: 2 }, a.hp),
      ent(GOB, true, { x: 6, y: 2 }, 500),
      ...(extra ?? []),
    ],
    movement_used: {},
  };
}

const explore = (w: Character, a: Character = ally()): GameState => ({
  ...makeState({ id: w.id }),
  characters: [w, a],
  active_character_id: w.id,
});

const act = (state: GameState, action: Record<string, unknown>, seed: Seed = seedWithEnemy) =>
  takeAction({ action: action as never, history: [], state, seed, context: ctx });

const learnable = (c: Character) => learnableInvocations(c).map((d) => d.id);

describe('catalog prerequisites', () => {
  it('gates the six by Warlock level and Pact', () => {
    expect(learnable(warlock(2))).toContain('lessons_of_the_first_ones');
    expect(learnable(warlock(4))).not.toContain('gift_of_the_depths');
    expect(learnable(warlock(5))).toEqual(
      expect.arrayContaining(['gift_of_the_depths', 'gaze_of_two_minds'])
    );
    expect(learnable(warlock(5))).not.toContain('investment_of_the_chain_master');
    expect(learnable(warlock(5, ['pact_of_the_chain']))).toContain(
      'investment_of_the_chain_master'
    );
    expect(learnable(warlock(9, ['pact_of_the_tome']))).toContain('gift_of_the_protectors');
    expect(learnable(warlock(14))).not.toContain('witch_sight');
    expect(learnable(warlock(15))).toContain('witch_sight');
  });
});

// ─── Lessons of the First Ones ───────────────────────────────────────────────

describe('Lessons of the First Ones', () => {
  it('is repeatable, one Origin feat per learning', async () => {
    let st = explore(warlock(5));
    st = (await act(st, { type: 'use_class_feature', featureId: 'lessons_of_the_first_ones' }))
      .newState;
    st = (await act(st, { type: 'use_class_feature', featureId: 'lessons_of_the_first_ones' }))
      .newState;
    expect(pendingLessonsFeats(st.characters[0])).toBe(2);

    st = (await act(st, { type: 'choose_lessons_feat', featId: 'alert' })).newState;
    const again = await act(st, { type: 'choose_lessons_feat', featId: 'alert' });
    expect(again.newState.characters[0].lessons_feats).toEqual(['alert']); // must differ
    st = (await act(st, { type: 'choose_lessons_feat', featId: 'savage_attacker' })).newState;
    const w = st.characters[0];
    expect(w.feats).toEqual(expect.arrayContaining(['alert', 'savage_attacker']));
    expect(pendingLessonsFeats(w)).toBe(0);
  });

  it('Skilled opens three skill picks', async () => {
    const st = explore(warlock(2, ['lessons_of_the_first_ones'], { skill_proficiencies: [] }));
    const r = await act(st, { type: 'choose_lessons_feat', featId: 'skilled' });
    const grant = pendingBonusSkills(r.newState.characters[0]).find(
      (g) => g.source === 'lessons_skilled'
    );
    expect(grant?.count).toBe(3);
  });

  it('Magic Initiate asks for two cantrips, then a level 1 spell', async () => {
    let st = explore(warlock(2, ['lessons_of_the_first_ones'], { spells_known: [] }));
    st = (await act(st, { type: 'choose_lessons_feat', featId: 'magic_initiate_divine' })).newState;
    const labels = generateChoices(st, seedWithEnemy, ctx).map((c) => c.label);
    expect(labels).toContain('Magic Initiate (Divine): learn Sacred Flame (cantrip)');
    const wrongLevel = await act(st, {
      type: 'choose_feat_spell',
      featId: 'magic_initiate_divine',
      spellId: 'bless',
    });
    expect(wrongLevel.newState.characters[0].spells_known).not.toContain('bless');
    for (const spellId of ['sacred_flame', 'guidance', 'bless']) {
      st = (await act(st, { type: 'choose_feat_spell', featId: 'magic_initiate_divine', spellId }))
        .newState;
    }
    const w = st.characters[0];
    expect(w.spells_known).toEqual(expect.arrayContaining(['sacred_flame', 'guidance', 'bless']));
    expect(w.feat_choices?.magic_initiate_divine).toEqual({
      magicInitiateCantrips: ['sacred_flame', 'guidance'],
      magicInitiateL1: 'bless',
    });
  });
});

// ─── Gift of the Depths ──────────────────────────────────────────────────────

describe('Gift of the Depths', () => {
  const cast = {
    type: 'cast_spell',
    spellId: 'water_breathing',
    slotLevel: 3,
    invocation: 'gift_of_the_depths',
  };

  it('casts Water Breathing once without a slot, then not until a Long Rest', async () => {
    const st = explore(
      warlock(5, ['gift_of_the_depths'], { spell_slots_max: { 3: 2 }, spell_slots_used: {} })
    );
    const first = await act(st, cast);
    const w = first.newState.characters[0];
    expect(w.class_resource_uses?.invocation_used_gift_of_the_depths).toBe(1);
    expect(w.spell_slots_used?.[3] ?? 0).toBe(0);
    const second = await act(first.newState, cast);
    expect(second.narrative).toMatch(/returns after a Long Rest/);
    expect(
      generateChoices(first.newState, seedWithEnemy, ctx).some((c) =>
        c.label.includes('Water Breathing')
      )
    ).toBe(false);
  });

  it('gives a Swim Speed: water costs no extra movement', async () => {
    const swimSeed: Seed = {
      ...seedWithEnemy,
      rooms: seedWithEnemy.rooms.map((room) =>
        room.id === CORRIDOR_ID
          ? {
              ...room,
              swimTerrain: [
                { x: 2, y: 2 },
                { x: 3, y: 2 },
              ],
            }
          : room
      ),
    };
    const move = { type: 'grid_move', entityId: 'wl', to: { x: 3, y: 2 } };
    const gifted = await act(fight(warlock(5, ['gift_of_the_depths'])), move, swimSeed);
    expect(gifted.newState.movement_used?.wl).toBe(10);
    const plain = await act(fight(warlock(5)), move, swimSeed);
    // Without it, water is difficult going (the path may skirt a cell).
    expect(plain.newState.movement_used?.wl).toBeGreaterThan(10);
  });
});

// ─── Gift of the Protectors ──────────────────────────────────────────────────

describe('Gift of the Protectors', () => {
  const tome = ['pact_of_the_tome', 'gift_of_the_protectors'];

  it('writes up to CHA-mod names on the page', async () => {
    let st = explore(warlock(9, tome, { cha: 12 })); // +1 → one name
    st = (
      await act(st, { type: 'use_class_feature', featureId: 'protectors_inscribe', option: 'pc-2' })
    ).newState;
    expect(st.characters[0].protectors_page).toEqual(['pc-2']);
    const full = await act(st, {
      type: 'use_class_feature',
      featureId: 'protectors_inscribe',
      option: 'wl',
    });
    expect(full.narrative).toMatch(/page is full/);
    st = (
      await act(st, { type: 'use_class_feature', featureId: 'protectors_erase', option: 'pc-2' })
    ).newState;
    expect(st.characters[0].protectors_page).toEqual([]);
  });

  it('holds a named ally at 1 HP once, then not again before a Long Rest', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const brute = {
      id: GOB,
      name: 'Brute',
      hp: 50,
      ac: 10,
      toHit: 100,
      damage: '20',
      damageType: 'bludgeoning',
    } as unknown as Enemy;
    const swing = (st: GameState) => {
      const c = {
        actor: enemyActor(brute),
        context: ctx,
        st,
        narrative: '',
      } as unknown as ActionContext;
      handleEnemyAttack(c, {
        type: 'enemy_attack',
        targetCharId: 'pc-2',
        advIdx: 0,
        multiattackIdx: 0,
      });
      if (c.enemySubAttack?.outcome !== 'done') throw new Error('expected done');
      return { hp: c.enemySubAttack.target.hp, st: c.st, narrative: c.narrative };
    };
    const w = warlock(9, tome, { protectors_page: ['pc-2'] });
    const saved = swing(fight(w, ally({ hp: 5 })));
    expect(saved.hp).toBe(1);
    expect(saved.narrative).toMatch(/Gift of the Protectors/);
    expect(
      saved.st.characters.find((c) => c.id === 'wl')?.class_resource_uses?.gift_of_protectors_used
    ).toBe(1);

    const spent = warlock(9, tome, {
      protectors_page: ['pc-2'],
      class_resource_uses: { gift_of_protectors_used: 1 },
    });
    expect(swing(fight(spent, ally({ hp: 5 }))).hp).toBe(0);
    const unnamed = warlock(9, tome, { protectors_page: [] });
    expect(swing(fight(unnamed, ally({ hp: 5 }))).hp).toBe(0);
  });
});

// ─── Gaze of Two Minds ───────────────────────────────────────────────────────

describe('Gaze of Two Minds', () => {
  const grasp = { type: 'cast_spell', spellId: 'shocking_grasp', slotLevel: 0, targetEnemyId: GOB };
  const linkedWarlock = (linked: boolean) =>
    warlock(5, ['gaze_of_two_minds'], {
      spells_known: ['shocking_grasp'],
      ...(linked
        ? {
            gaze_ally_id: 'pc-2',
            conditions: ['gaze_linked'],
            condition_durations: { gaze_linked: 2 },
          }
        : {}),
    });

  it('links with a touched ally for a Bonus Action', async () => {
    const st = fight(warlock(5, ['gaze_of_two_minds']));
    const adjacent = {
      ...st,
      entities: st.entities!.map((e) => (e.id === 'pc-2' ? { ...e, pos: { x: 2, y: 2 } } : e)),
    };
    const r = await act(adjacent, {
      type: 'use_class_feature',
      featureId: 'gaze_link',
      option: 'pc-2',
    });
    const w = r.newState.characters[0];
    expect(w.gaze_ally_id).toBe('pc-2');
    expect(w.conditions).toContain('gaze_linked');
    expect(w.turn_actions.bonus_action_used).toBe(true);
    const far = await act(st, {
      type: 'use_class_feature',
      featureId: 'gaze_link',
      option: 'pc-2',
    });
    expect(far.narrative).toMatch(/must touch/);
  });

  it("casts a touch spell from the linked ally's space", async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const unlinked = await act(fight(linkedWarlock(false)), grasp);
    expect(unlinked.narrative).toMatch(/requires a touch/);
    const linked = await act(fight(linkedWarlock(true)), grasp);
    expect(linked.narrative).not.toMatch(/requires a touch/);
    expect(linked.newState.characters[0].turn_actions.action_used).toBe(true);
  });
});

// ─── Investment of the Chain Master ──────────────────────────────────────────

describe('Investment of the Chain Master', () => {
  const imp = {
    ...ent('fam', false, { x: 5, y: 3 }, 10),
    summoned_by: 'wl',
    noAttack: true,
    side: 'ally' as const,
    companionName: 'Imp',
    toHit: 100,
    damage: '3',
  };
  const quick = { type: 'familiar_quick_attack', targetEnemyId: GOB };

  it('the familiar attacks for a Bonus Action, costing none of your attacks', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const w = warlock(5, ['pact_of_the_chain', 'investment_of_the_chain_master']);
    const r = await act(fight(w, ally(), [imp]), quick);
    expect(r.newState.entities?.find((e) => e.id === GOB)?.hp).toBe(497);
    const after = r.newState.characters[0].turn_actions;
    expect(after.bonus_action_used).toBe(true);
    expect(after.action_used).toBe(false);
    expect(r.narrative).toMatch(/Quick Attack/);
  });

  it('needs the invocation, and is offered when the familiar is in reach', async () => {
    const chainOnly = await act(fight(warlock(5, ['pact_of_the_chain']), ally(), [imp]), quick);
    expect(chainOnly.newState.entities?.find((e) => e.id === GOB)?.hp).toBe(500);
    const w = warlock(5, ['pact_of_the_chain', 'investment_of_the_chain_master']);
    const labels = generateChoices(fight(w, ally(), [imp]), seedWithEnemy, ctx).map((c) => c.label);
    expect(labels.some((l) => l.startsWith('Quick Attack — your Imp attacks'))).toBe(true);
  });
});

// ─── Witch Sight ─────────────────────────────────────────────────────────────

describe('Witch Sight', () => {
  it('grants 30-ft Truesight', () => {
    expect(truesightFt(warlock(15))).toBe(0);
    expect(truesightFt(warlock(15, ['witch_sight']))).toBe(30);
    expect(truesightFt(warlock(15, ['witch_sight'], { truesight_ft: 60 }))).toBe(60);
  });

  it('sees an invisible target within 30 ft, not beyond', () => {
    const target = { id: GOB, name: 'Goblin', ac: 10, hp: 500 } as Enemy;
    const edgesAt = (x: number) => {
      const st = fight(warlock(15, ['witch_sight']));
      const s = {
        ...st,
        entities: st.entities!.map((e) =>
          e.id === GOB ? { ...e, pos: { x, y: 2 }, conditions: ['invisible'] } : e
        ),
      };
      const c = {
        actor: pcActor(s.characters[0], 0),
        st: s,
        seed: seedWithEnemy,
        roomId: CORRIDOR_ID,
        roomObstacleCells: [],
      } as unknown as ActionContext;
      return computeAttackEdges(c, target, GOB, { ranged: true }).targetDisadvConditions;
    };
    expect(edgesAt(6)).not.toContain('invisible'); // 25 ft
    expect(edgesAt(9)).toContain('invisible'); // 40 ft
  });
});
