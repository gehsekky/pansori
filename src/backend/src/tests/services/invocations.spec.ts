// SRD 5.2.1 Warlock — Eldritch Invocations.
// - The Invocations column caps how many a Warlock knows (1 at L1 … 10 at L18).
// - Prerequisites (Warlock level, another invocation) gate learning.
// - Spell invocations (Armor of Shadows, Fiendish Vigor, One with Shadows, …)
//   cast their spell without a slot, at will.
// - Eldritch Mind: Advantage on Concentration saves.
// Also: Concentration saves add the Proficiency Bonus for CON save proficiency.

import type { Character, GameState, Seed } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { baseSandboxSeed, makeChar, makeState } from '../../test-fixtures.js';
import { checkConcentration, generateChoices, takeAction } from '../../services/gameEngine.js';
import { invocationsKnownMax, learnableInvocations } from '../../services/invocations.js';
import { context as ctx } from '../fixtures/testContext.js';

afterEach(() => vi.restoreAllMocks());

const warlock = (level: number, feats: string[] = [], over: Partial<Character> = {}) =>
  makeChar({
    id: 'pc-1',
    character_class: 'Warlock',
    level,
    class_levels: { warlock: level },
    cha: 16,
    dex: 14,
    feats,
    spell_slots_max: { 1: 2 },
    spell_slots_used: {},
    ...over,
  });

const stateFor = (char: Character, over: Partial<GameState> = {}): GameState => ({
  ...makeState({ id: 'pc-1' }, over),
  characters: [char],
  active_character_id: 'pc-1',
});

const act = (state: GameState, action: Record<string, unknown>, seed: Seed = baseSandboxSeed) =>
  takeAction({ action: action as never, history: [], state, seed, context: ctx });

describe('learning invocations', () => {
  it('follows the Invocations column of the Warlock table', () => {
    const known = [1, 2, 4, 5, 7, 9, 12, 15, 18, 20].map(invocationsKnownMax);
    expect(known).toEqual([1, 3, 3, 5, 6, 7, 8, 9, 10, 10]);
    expect(invocationsKnownMax(0)).toBe(0);
  });

  it('a level-1 Warlock may learn only the level-1 options, and only one', () => {
    const ids = learnableInvocations(warlock(1)).map((d) => d.id);
    expect(ids).toContain('armor_of_shadows');
    expect(ids).toContain('eldritch_mind');
    expect(ids).not.toContain('agonizing_blast'); // Level 2+
    expect(ids).not.toContain('ascendant_step'); // Level 5+
    expect(learnableInvocations(warlock(1, ['eldritch_mind']))).toEqual([]);
  });

  it('learning records it and the cap then blocks another', async () => {
    const first = await act(stateFor(warlock(1)), {
      type: 'use_class_feature',
      featureId: 'armor_of_shadows',
    });
    expect(first.newState.characters[0].feats).toContain('armor_of_shadows');
    const second = await act(first.newState, {
      type: 'use_class_feature',
      featureId: 'eldritch_mind',
    });
    expect(second.newState.characters[0].feats).not.toContain('eldritch_mind');
    expect(second.narrative).toMatch(/can't learn/);
  });

  it('a level prerequisite blocks learning', async () => {
    const r = await act(stateFor(warlock(2)), {
      type: 'use_class_feature',
      featureId: 'ascendant_step',
    });
    expect(r.newState.characters[0].feats).not.toContain('ascendant_step');
  });

  it('offers Learn Invocation choices out of combat only', () => {
    const out = generateChoices(stateFor(warlock(2)), baseSandboxSeed, ctx);
    expect(out.some((c) => c.label.startsWith('Learn Invocation: Agonizing Blast'))).toBe(true);
    const inCombat = generateChoices(
      stateFor(warlock(2), { combat_active: true }),
      baseSandboxSeed,
      ctx
    );
    expect(inCombat.some((c) => c.label.startsWith('Learn Invocation'))).toBe(false);
  });
});

describe('spell invocations cast without a slot', () => {
  it('Armor of Shadows casts Mage Armor on yourself, spending no slot', async () => {
    const st = stateFor(warlock(1, ['armor_of_shadows']));
    const choice = generateChoices(st, baseSandboxSeed, ctx).find((c) =>
      c.label.startsWith('Armor of Shadows')
    );
    expect(choice).toBeDefined();
    const r = await act(st, choice!.action as Record<string, unknown>);
    const pc = r.newState.characters[0];
    expect(pc.mage_armor_active).toBe(true);
    expect(pc.spell_slots_used?.[1] ?? 0).toBe(0);
    expect(r.narrative).toMatch(/Armor of Shadows — no slot/);
  });

  it('is refused without the invocation', async () => {
    const r = await act(stateFor(warlock(1)), {
      type: 'cast_spell',
      spellId: 'mage_armor',
      slotLevel: 1,
      invocation: 'armor_of_shadows',
    });
    expect(r.newState.characters[0].mage_armor_active).toBeFalsy();
    expect(r.narrative).toMatch(/can't cast Mage Armor with that invocation/);
  });

  it('Fiendish Vigor grants the maximum False Life temp HP (12)', async () => {
    const r = await act(stateFor(warlock(2, ['fiendish_vigor'])), {
      type: 'cast_spell',
      spellId: 'false_life',
      slotLevel: 1,
      invocation: 'fiendish_vigor',
    });
    expect(r.newState.characters[0].temp_hp).toBe(12);
    expect(r.newState.characters[0].spell_slots_used?.[1] ?? 0).toBe(0);
  });

  it('One with Shadows works only in dim light or darkness', async () => {
    const char = warlock(5, ['one_with_shadows'], { spell_slots_max: { 3: 2 } });
    const roomSeed = (lighting: 'bright' | 'dark'): Seed => ({
      ...baseSandboxSeed,
      rooms: baseSandboxSeed.rooms.map((r) => ({ ...r, lighting })),
    });
    const action = {
      type: 'cast_spell',
      spellId: 'invisibility',
      slotLevel: 2,
      invocation: 'one_with_shadows',
    };
    const lit = await act(stateFor(char), action, roomSeed('bright'));
    expect(lit.narrative).toMatch(/only in Dim Light or Darkness/);
    expect(
      generateChoices(stateFor(char), roomSeed('bright'), ctx).some((c) =>
        c.label.startsWith('One with Shadows')
      )
    ).toBe(false);
    const dark = await act(stateFor(char), action, roomSeed('dark'));
    expect(dark.newState.characters[0].conditions).toContain('invisible');
  });
});

describe('Concentration saves', () => {
  const concentrating = (over: Partial<Character>) =>
    makeChar({
      con: 10,
      level: 1,
      concentrating_on: { spellId: 'bless', rounds: 10 } as Character['concentrating_on'],
      ...over,
    });

  // d20 rolls: 3, then 15. DC 10 (10 damage).
  const rolls = () => vi.spyOn(Math, 'random').mockReturnValueOnce(0.1).mockReturnValueOnce(0.7);

  it('Eldritch Mind rolls with Advantage', () => {
    rolls();
    const held = checkConcentration(
      concentrating({ character_class: 'Warlock', feats: ['eldritch_mind'] }),
      { characters: [] } as unknown as GameState,
      10
    );
    expect(held.note).toMatch(/Concentration hold/);
  });

  it('without it, the low die stands', () => {
    rolls();
    const broke = checkConcentration(
      concentrating({ character_class: 'Warlock' }),
      { characters: [] } as unknown as GameState,
      10
    );
    expect(broke.char.concentrating_on).toBeFalsy();
  });

  it('CON save proficiency adds the Proficiency Bonus', () => {
    // d20 8: 8 + 0 + PB 2 = 10 holds for a Sorcerer (CON proficient); a
    // Wizard (no CON proficiency) totals 8 and fails.
    vi.spyOn(Math, 'random').mockReturnValue(0.35);
    const sorc = checkConcentration(
      concentrating({ character_class: 'Sorcerer' }),
      { characters: [] } as unknown as GameState,
      10,
      ctx
    );
    expect(sorc.note).toMatch(/Concentration hold/);
    const wiz = checkConcentration(
      concentrating({ character_class: 'Wizard' }),
      { characters: [] } as unknown as GameState,
      10,
      ctx
    );
    expect(wiz.char.concentrating_on).toBeFalsy();
  });
});
