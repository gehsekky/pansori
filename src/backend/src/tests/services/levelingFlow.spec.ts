// Player-driven leveling: out of combat, eligible members surface a roster of
// `enter_leveling` entries (normal options suppressed); the leveling pane then
// drives the per-member cascade (class pick → ASI → mastery) with a Back
// control, auto-dropping back to the roster when a member is done.

import type { GameState, Seed } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { casterSpellOptionsByLevel, knownSpellTargetForLevel } from '../../services/multiclass.js';
import { generateChoices, takeAction } from '../../services/gameEngine.js';
import { makeChar, makeState } from '../../test-fixtures.js';
import { context as ctx } from '../fixtures/testContext.js';

afterEach(() => vi.restoreAllMocks());

const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Level Test',
  ship_name: 'Level Test',
  intro: '',
  seed_id: 'level',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {},
  loot: {},
  npcs: {},
};

// A party in a safe room (out of combat). `over` patches state.
function party(chars: ReturnType<typeof makeChar>[], over: Partial<GameState> = {}): GameState {
  return {
    ...makeState({ id: chars[0].id }, { current_room: 'entry_hall' }),
    characters: chars,
    active_character_id: chars[0].id,
    ...over,
  };
}

describe('leveling roster gate', () => {
  it('surfaces one enter_leveling per eligible member, suppressing normal options', () => {
    const eligible = makeChar({ id: 'a', name: 'Aria', xp: 300, level: 1 });
    const notYet = makeChar({ id: 'b', name: 'Bran', xp: 0, level: 1 });
    const choices = generateChoices(party([eligible, notYet]), seed, ctx);
    expect(choices.length).toBe(1);
    expect(choices[0]).toMatchObject({
      action: { type: 'enter_leveling', characterId: 'a' },
      kind: 'leveling',
    });
    // No normal options leak through while a member can level.
    expect(choices.some((c) => c.action.type !== 'enter_leveling')).toBe(false);
  });

  it('shows nothing leveling-related when no member is eligible (normal play)', () => {
    const choices = generateChoices(party([makeChar({ id: 'a', xp: 0, level: 1 })]), seed, ctx);
    expect(choices.some((c) => c.kind === 'leveling')).toBe(false);
    expect(choices.length).toBeGreaterThan(0); // normal options returned
  });

  it('combat suppresses the leveling roster entirely', () => {
    const eligible = makeChar({ id: 'a', xp: 300, level: 1 });
    const choices = generateChoices(party([eligible], { combat_active: true }), seed, ctx);
    expect(choices.some((c) => c.action.type === 'enter_leveling')).toBe(false);
  });
});

describe('enter_leveling → cascade → auto-drop', () => {
  // Seed a full L4 Wizard spellbook so the L3→L4 advance owes NO known-caster
  // spell pick — the ASI→auto-drop flow under test isolates the ASI step. (A
  // Wizard with an empty book would accrue `spells_to_learn` on advance, which
  // is its own cascade step covered by midCampaignLevelUp.spec.ts.)
  const fullBook = (() => {
    const byLevel = casterSpellOptionsByLevel('Wizard', ctx.spellTable ?? {}, 9);
    const leveled: string[] = [];
    for (let l = 1; l <= 9; l++) for (const id of byLevel[l] ?? []) leveled.push(id);
    const target = knownSpellTargetForLevel('Wizard', 4) ?? 12;
    return leveled.slice(0, target);
  })();

  // All-15 stats so the multiclass prereqs for other classes are met (the
  // class-pick step should then offer multiclass options, not just Wizard).
  const wizard = () =>
    makeChar({
      id: 'w',
      name: 'Wrenna',
      character_class: 'Wizard',
      level: 3,
      xp: 2700,
      spells_known: [...fullBook],
      str: 15,
      dex: 15,
      con: 15,
      int: 15,
      wis: 15,
      cha: 15,
    });

  it('enter_leveling sets active_leveling and makes the member active', async () => {
    const r = await takeAction({
      action: { type: 'enter_leveling', characterId: 'w' },
      history: [],
      state: party([wizard()]),
      seed,
      context: ctx,
    });
    expect(r.newState.active_leveling).toEqual({ characterId: 'w' });
    expect(r.newState.active_character_id).toBe('w');
  });

  it('the cascade offers a class pick (incl. a multiclass option) + Back', () => {
    const choices = generateChoices(
      party([wizard()], { active_leveling: { characterId: 'w' } }),
      seed,
      ctx
    );
    expect(choices.every((c) => c.kind === 'leveling')).toBe(true);
    const classPicks = choices.filter((c) => c.action.type === 'level_up_class');
    const classNames = classPicks.map((c) =>
      c.action.type === 'level_up_class' ? c.action.className : ''
    );
    expect(classNames).toContain('wizard'); // continue primary
    expect(classNames.length).toBeGreaterThan(1); // INT 15 → multiclass options
    expect(choices.some((c) => c.action.type === 'exit_leveling')).toBe(true);

    // Labels reflect the CLASS level gained, not the total character level: the
    // Wizard (level 3) continues to wizard 4, while a multiclass option grants
    // the new class's LEVEL 1 (not a misleading "→ level 4").
    const labelByClass = new Map(
      classPicks.map(
        (c) => [c.action.type === 'level_up_class' ? c.action.className : '', c.label] as const
      )
    );
    expect(labelByClass.get('wizard')).toBe('Advance Wizard → level 4');
    const mcClass = classNames.find((n) => n !== 'wizard')!;
    expect(labelByClass.get(mcClass)).toContain('(new class — level 1)');
  });

  it('advancing into an ASI level shows ASI choices next, then auto-drops when done', async () => {
    // L3 → L4 Wizard is an ASI milestone (no weapon mastery for Wizard).
    const afterLevel = await takeAction({
      action: { type: 'level_up_class', className: 'wizard' },
      history: [],
      state: party([wizard()], { active_leveling: { characterId: 'w' } }),
      seed,
      context: ctx,
    });
    expect(afterLevel.newState.characters[0].level).toBe(4);
    expect(afterLevel.newState.characters[0].asi_pending).toBe(true);
    // Still in the pane — the cascade now offers ASI choices + Back.
    const asiChoices = generateChoices(afterLevel.newState, seed, ctx);
    expect(asiChoices.some((c) => c.action.type === 'apply_asi')).toBe(true);
    expect(asiChoices.some((c) => c.action.type === 'exit_leveling')).toBe(true);

    // Resolve the ASI — no more work (xp 300 < 400), so it auto-drops to roster.
    const afterAsi = await takeAction({
      action: { type: 'apply_asi', stat: 'int' },
      history: [],
      state: afterLevel.newState,
      seed,
      context: ctx,
    });
    expect(afterAsi.newState.characters[0].asi_pending).toBe(false);
    expect(afterAsi.newState.active_leveling).toBeUndefined();
    // Wizard no longer eligible → normal options return (no leveling choices).
    expect(generateChoices(afterAsi.newState, seed, ctx).some((c) => c.kind === 'leveling')).toBe(
      false
    );
  });

  it('exit_leveling returns to the roster without advancing', async () => {
    const r = await takeAction({
      action: { type: 'exit_leveling' },
      history: [],
      state: party([wizard()], { active_leveling: { characterId: 'w' } }),
      seed,
      context: ctx,
    });
    expect(r.newState.active_leveling).toBeUndefined();
    expect(r.newState.characters[0].level).toBe(3); // unchanged
    // Still eligible → roster shows the entry again.
    expect(
      generateChoices(r.newState, seed, ctx).some((c) => c.action.type === 'enter_leveling')
    ).toBe(true);
  });
});
