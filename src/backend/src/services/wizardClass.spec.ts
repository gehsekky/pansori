// RE-2 — Wizard core features. Scholar (L2): Expertise in one knowledge skill
// (Arcana, History, Investigation, Medicine, Nature, or Religion) the wizard
// is proficient in.

import type { Character, Seed } from '../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expertiseEligibleSkills, expertiseSlots } from './multiclass.js';
import { makeChar, makeState } from '../test-fixtures.js';
import { context as ctx } from '../contexts/sandbox.js';
import { generateChoices } from './gameEngine.js';
import { handleChooseExpertise } from './actions/meta.js';
import { pcActor } from './actions/actor.js';

afterEach(() => vi.restoreAllMocks());

const seed: Seed = {
  context_id: ctx.id,
  world_name: 'W',
  ship_name: 'W',
  intro: '',
  seed_id: 'w',
  rooms: [{ id: ctx.startRoomId, name: 'S', desc: '' }],
  connections: { [ctx.startRoomId]: [] },
  enemies: {},
  loot: {},
  npcs: {},
};

const wizard = (over: Partial<Character> = {}) =>
  makeChar({
    id: 'pc-1',
    character_class: 'Wizard',
    level: 2,
    skill_proficiencies: ['Arcana', 'Stealth'],
    ...over,
  });

function featCtx(char: Character) {
  return {
    actor: pcActor(char, 0),
    context: ctx,
    narrative: '',
  } as unknown as Parameters<typeof handleChooseExpertise>[0];
}
const pcChar = (c: ReturnType<typeof featCtx>) => {
  if (c.actor.kind !== 'pc') throw new Error('expected pc actor');
  return c.actor.char;
};

describe('Scholar (L2) — expertise slots + eligible skills', () => {
  it('grants one Expertise slot at Wizard L2', () => {
    expect(expertiseSlots(wizard())).toBe(1);
    expect(expertiseSlots(wizard({ level: 1 }))).toBe(0);
  });

  it('restricts the pool to knowledge skills', () => {
    // Arcana is a knowledge skill; Stealth is not.
    expect(expertiseEligibleSkills(wizard())).toEqual(['Arcana']);
  });
});

describe('Scholar (L2) — choice surface + handler', () => {
  it('offers Expertise in a knowledge skill out of combat', () => {
    const state = {
      ...makeState({ id: 'pc-1' }, { current_room: ctx.startRoomId }),
      characters: [wizard()],
      active_character_id: 'pc-1',
    };
    const labels = generateChoices(state, seed, ctx)
      .filter((c) => c.label.includes('Expertise'))
      .map((c) => c.label);
    expect(labels.some((l) => l.includes('Arcana'))).toBe(true);
    expect(labels.some((l) => l.includes('Stealth'))).toBe(false);
  });

  it('accepts a knowledge skill and rejects a non-knowledge skill', () => {
    const ok = featCtx(wizard());
    handleChooseExpertise(ok, { type: 'choose_expertise', skill: 'Arcana' });
    expect(pcChar(ok).expertise_skills).toContain('Arcana');

    const bad = featCtx(wizard());
    const res = handleChooseExpertise(bad, { type: 'choose_expertise', skill: 'Stealth' });
    expect(res).toEqual({ rejected: expect.stringMatching(/isn't an eligible Expertise skill/) });
    expect(pcChar(bad).expertise_skills ?? []).not.toContain('Stealth');
  });
});
