// SRD 5.2.1 subclass spell lists: Life Domain, Oath of Devotion, Circle of the
// Land, Fiend Patron and Draconic Sorcery spells are always prepared once the
// class level in the table is reached. They're castable without being in
// `prepared_spells`, don't use a preparation slot, and don't count against a
// known caster's spells-known target. Circle of the Land picks its land after
// each Long Rest.

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  alwaysPreparedSpells,
  circleLandSpells,
  syncSubclassSpells,
} from '../../services/subclassSpells.js';
import { applyLevelUpForClass, generateChoices, takeAction } from '../../services/gameEngine.js';
import {
  ctxWithRage,
  makeChar,
  makeClericState,
  makeState,
  baseSandboxSeed as seed,
  spellSeed,
} from '../../test-fixtures.js';
import type { Character } from '../../types.js';
import { context as ctx } from '../fixtures/testContext.js';

afterEach(() => vi.restoreAllMocks());

const sorted = (xs: string[]) => [...xs].sort();

describe('alwaysPreparedSpells — SRD tables', () => {
  it('Life Domain: 4 at Cleric 3, 6 at 5, 10 at 9', () => {
    const life = (level: number) =>
      makeChar({ character_class: 'Cleric', level, subclass: 'life' });
    expect(sorted(alwaysPreparedSpells(life(3)))).toEqual(
      sorted(['aid', 'bless', 'cure_wounds', 'lesser_restoration'])
    );
    expect(alwaysPreparedSpells(life(5))).toHaveLength(6);
    expect(alwaysPreparedSpells(life(9))).toHaveLength(10);
  });

  it('Oath of Devotion: tiers at Paladin 3/5/9/13/17', () => {
    const dev = (level: number) =>
      makeChar({ character_class: 'Paladin', level, subclass: 'devotion' });
    expect(sorted(alwaysPreparedSpells(dev(3)))).toEqual(
      sorted(['protection_from_evil_and_good', 'shield_of_faith'])
    );
    expect(alwaysPreparedSpells(dev(17))).toEqual(
      expect.arrayContaining(['commune', 'flame_strike', 'guardian_of_faith'])
    );
    expect(alwaysPreparedSpells(dev(17))).toHaveLength(10);
  });

  it('Fiend Patron: 4 at Warlock 3, + Fireball / Stinking Cloud at 5', () => {
    const fiend = (level: number) =>
      makeChar({ character_class: 'Warlock', level, subclass: 'fiend' });
    expect(alwaysPreparedSpells(fiend(3))).toHaveLength(4);
    expect(alwaysPreparedSpells(fiend(5))).toEqual(
      expect.arrayContaining(['fireball', 'stinking_cloud'])
    );
  });

  it('keys off the subclass class level, not total level (multiclass)', () => {
    const c = makeChar({
      character_class: 'Cleric',
      level: 9,
      class_levels: { cleric: 3, fighter: 6 },
      subclass: 'life',
    });
    expect(alwaysPreparedSpells(c)).toHaveLength(4);
  });

  it('a Land Druid has none until a land is chosen', () => {
    const d = makeChar({ character_class: 'Druid', level: 5, subclass: 'land' });
    expect(alwaysPreparedSpells(d)).toEqual([]);
    expect(sorted(alwaysPreparedSpells({ ...d, circle_land: 'polar' }))).toEqual(
      sorted(['fog_cloud', 'hold_person', 'ray_of_frost', 'sleet_storm'])
    );
  });
});

describe('syncSubclassSpells', () => {
  it('adds grants without touching independently known spells, and is idempotent', () => {
    const c = makeChar({
      character_class: 'Cleric',
      level: 3,
      subclass: 'life',
      spells_known: ['guiding_bolt', 'bless'],
    });
    expect(syncSubclassSpells(c)).toBe(3); // bless was already known
    expect(sorted(c.spells_known)).toEqual(
      sorted(['guiding_bolt', 'bless', 'aid', 'cure_wounds', 'lesser_restoration'])
    );
    expect(c.subclass_granted_spells).not.toContain('bless');
    expect(syncSubclassSpells(c)).toBe(0);
  });

  it('switching land drops the old land grants only', () => {
    const c: Character = makeChar({
      character_class: 'Druid',
      level: 5,
      subclass: 'land',
      circle_land: 'arid',
      spells_known: ['fire_bolt'], // known on its own: must survive the switch
    });
    syncSubclassSpells(c);
    expect(c.spells_known).toEqual(expect.arrayContaining(['blur', 'fireball', 'fire_bolt']));
    c.circle_land = 'temperate';
    syncSubclassSpells(c);
    expect(c.spells_known).not.toContain('blur');
    expect(c.spells_known).not.toContain('fireball');
    expect(c.spells_known).toContain('fire_bolt');
    expect(c.spells_known).toEqual(expect.arrayContaining(circleLandSpells('temperate', 5)));
  });
});

describe('preparation', () => {
  it('a Life Cleric can cast an always-prepared spell that is not in prepared_spells', () => {
    const state = makeClericState({
      level: 3,
      subclass: 'life',
      prepared_spells: ['guiding_bolt'],
      hp: 3,
      max_hp: 10,
    });
    syncSubclassSpells(state.characters[0]);
    const castable = generateChoices(state, spellSeed, ctxWithRage)
      .filter((c) => c.action.type === 'cast_spell')
      .map((c) => (c.action as { spellId: string }).spellId);
    expect(castable).toContain('cure_wounds');
    expect(castable).not.toContain('hold_person'); // known but unprepared, not a subclass spell
  });

  it('the auto-prepare choice leaves subclass spells out of the preparation slots', () => {
    const state = makeClericState({ level: 3, subclass: 'life' });
    syncSubclassSpells(state.characters[0]);
    const prep = generateChoices(state, spellSeed, ctxWithRage).find(
      (c) => c.action.type === 'prepare_spells'
    );
    const ids = (prep?.action as { spellIds: string[] } | undefined)?.spellIds ?? [];
    expect(ids).not.toContain('bless');
    expect(ids).not.toContain('aid');
  });
});

describe('level-up and rests', () => {
  it('a Fiend Warlock leveling 4→5 gains Fireball / Stinking Cloud without losing a spell pick', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const char = makeChar({
      character_class: 'Warlock',
      level: 4,
      class_levels: { warlock: 4 },
      subclass: 'fiend',
      spells_known: ['eldritch_blast', 'hex', 'armor_of_agathys', 'misty_step', 'hold_person'],
    });
    syncSubclassSpells(char); // the L3 grants (4 spells)
    applyLevelUpForClass(char, 'warlock', ctx);
    expect(char.spells_known).toEqual(expect.arrayContaining(['fireball', 'stinking_cloud']));
    // Warlock 5 knows 6 non-cantrip spells; 4 are chosen, so 2 picks are owed.
    // Counting the 6 subclass spells would have owed none.
    expect(char.spells_to_learn).toBe(2);
  });

  it('a Long Rest grants the list to a save made before the grant existed', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const state = makeState({
      character_class: 'Paladin',
      level: 5,
      subclass: 'devotion',
      hp: 3,
      max_hp: 20,
    });
    const r = await takeAction({
      action: { type: 'long_rest' },
      history: [],
      state,
      seed,
      context: ctx,
    });
    expect(r.newState.characters[0].spells_known).toEqual(
      expect.arrayContaining(['shield_of_faith', 'aid', 'zone_of_truth'])
    );
  });
});

describe('Circle of the Land — land choice', () => {
  const druidState = (extra: Partial<Character> = {}) =>
    makeState({ character_class: 'Druid', level: 5, subclass: 'land', ...extra });

  const choose = (state: ReturnType<typeof makeState>, land: string) =>
    takeAction({
      action: { type: 'use_class_feature', featureId: `circle_land_${land}` },
      history: [],
      state,
      seed,
      context: ctx,
    });

  it('offers the four lands out of combat until one is chosen', async () => {
    const state = druidState();
    const lands = generateChoices(state, seed, ctx).filter((c) =>
      (c.action as { featureId?: string }).featureId?.startsWith('circle_land_')
    );
    expect(lands).toHaveLength(4);
    const r = await choose(state, 'tropical');
    const d = r.newState.characters[0];
    expect(d.circle_land).toBe('tropical');
    expect(d.spells_known).toEqual(expect.arrayContaining(['web', 'stinking_cloud']));
    const after = generateChoices(r.newState, seed, ctx).filter((c) =>
      (c.action as { featureId?: string }).featureId?.startsWith('circle_land_')
    );
    expect(after).toHaveLength(0);
  });

  it('can be changed again after a Long Rest', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const chosen = (await choose(druidState(), 'arid')).newState;
    chosen.characters[0].hp = 3;
    const rested = (
      await takeAction({
        action: { type: 'long_rest' },
        history: [],
        state: chosen,
        seed,
        context: ctx,
      })
    ).newState;
    const d = (await choose(rested, 'polar')).newState.characters[0];
    expect(d.circle_land).toBe('polar');
    expect(d.spells_known).not.toContain('fireball'); // arid L5 grant dropped
    expect(d.spells_known).toEqual(expect.arrayContaining(['sleet_storm']));
  });
});
