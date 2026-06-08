// RE-2 — Wizard core features. Scholar (L2): Expertise in one knowledge skill
// (Arcana, History, Investigation, Medicine, Nature, or Religion) the wizard
// is proficient in.

import type { Character, Enemy, GameState, Seed } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expertiseEligibleSkills, expertiseSlots } from '../../services/multiclass.js';
import { generateChoices, takeAction } from '../../services/gameEngine.js';
import {
  handleChooseExpertise,
  handleChooseSignatureSpell,
  handleChooseSpellMastery,
  handleMemorizeSpell,
} from '../../services/actions/meta.js';
import { makeChar, makeState } from '../../test-fixtures.js';
import { context as ctx } from '../fixtures/testContext.js';
import { pcActor } from '../../services/actions/actor.js';

afterEach(() => vi.restoreAllMocks());

const seed: Seed = {
  context_id: ctx.id,
  world_name: 'W',
  ship_name: 'W',
  intro: '',
  seed_id: 'w',
  rooms: [{ id: 'entry_hall', name: 'S', desc: '' }],
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
    st: { combat_active: false },
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
      ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall' }),
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

const ENEMY = `entry_hall#0`;
const combatSeed: Seed = {
  ...seed,
  enemies: {
    ['entry_hall']: [
      {
        id: ENEMY,
        name: 'Dummy',
        hp: 80,
        ac: 12,
        damage: '1d4',
        toHit: 3,
        xp: 50,
        dex: 8,
      } as unknown as Enemy,
    ],
  },
};

function combat(over: Partial<Character>): GameState {
  const c = makeChar({
    id: 'pc-1',
    character_class: 'Wizard',
    level: 20,
    int: 16,
    spell_slots_used: {},
    ...over,
  });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
    characters: [c],
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
        pos: { x: 1, y: 1 },
        hp: 40,
        maxHp: 40,
        conditions: [],
        condition_durations: {},
      },
      {
        id: ENEMY,
        isEnemy: true,
        pos: { x: 10, y: 10 },
        hp: 80,
        maxHp: 80,
        conditions: [],
        condition_durations: {},
      },
    ],
  } as unknown as GameState;
}

describe('Spell Mastery (L18)', () => {
  it('designates a L1/L2 action spell as mastered', () => {
    const c1 = featCtx(
      makeChar({
        id: 'pc-1',
        character_class: 'Wizard',
        level: 18,
        spells_known: ['magic_missile'],
      })
    );
    handleChooseSpellMastery(c1, {
      type: 'choose_spell_mastery',
      tier: 1,
      spellId: 'magic_missile',
    });
    expect(pcChar(c1).spell_mastery_l1).toBe('magic_missile');

    const c2 = featCtx(
      makeChar({
        id: 'pc-1',
        character_class: 'Wizard',
        level: 18,
        spells_known: ['scorching_ray'],
      })
    );
    handleChooseSpellMastery(c2, {
      type: 'choose_spell_mastery',
      tier: 2,
      spellId: 'scorching_ray',
    });
    expect(pcChar(c2).spell_mastery_l2).toBe('scorching_ray');
  });

  it('rejects a spell of the wrong level', () => {
    const c = featCtx(
      makeChar({
        id: 'pc-1',
        character_class: 'Wizard',
        level: 18,
        spells_known: ['scorching_ray'],
      })
    );
    const res = handleChooseSpellMastery(c, {
      type: 'choose_spell_mastery',
      tier: 1,
      spellId: 'scorching_ray',
    });
    expect(res).toEqual({ rejected: expect.stringMatching(/isn't a level-1 spell/) });
  });

  it('casts the mastered spell with no slot', async () => {
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'magic_missile', slotLevel: 1, targetEnemyId: ENEMY },
      history: [],
      // No level-1 slots left — only Spell Mastery can fire it.
      state: combat({
        level: 18,
        spell_mastery_l1: 'magic_missile',
        spells_known: ['magic_missile'],
        spell_slots_max: { 1: 1 },
        spell_slots_used: { 1: 1 },
      }),
      seed: combatSeed,
      context: ctx,
    });
    expect((r.newState.entities ?? []).find((e) => e.id === ENEMY)!.hp).toBeLessThan(80);
    expect(r.newState.characters[0].spell_slots_used?.[1]).toBe(1); // no slot consumed
    expect(r.narrative).toMatch(/Spell Mastery/);
  });
});

describe('Signature Spells (L20)', () => {
  it('designates up to two L3 spells', () => {
    const c = featCtx(
      makeChar({
        id: 'pc-1',
        character_class: 'Wizard',
        level: 20,
        spells_known: ['fireball', 'lightning_bolt'],
      })
    );
    handleChooseSignatureSpell(c, { type: 'choose_signature_spell', spellId: 'fireball' });
    handleChooseSignatureSpell(c, { type: 'choose_signature_spell', spellId: 'lightning_bolt' });
    expect(pcChar(c).signature_spells).toEqual(['fireball', 'lightning_bolt']);
  });

  it('casts a signature spell free once, marking it spent', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // enemy fails the DEX save
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'fireball', slotLevel: 3, targetEnemyId: ENEMY },
      history: [],
      // No level-3 slots — only the Signature free cast can fire it.
      state: combat({
        signature_spells: ['fireball'],
        spells_known: ['fireball'],
        spell_slots_max: { 3: 1 },
        spell_slots_used: { 3: 1 },
      }),
      seed: combatSeed,
      context: ctx,
    });
    expect((r.newState.entities ?? []).find((e) => e.id === ENEMY)!.hp).toBeLessThan(80);
    expect(r.newState.characters[0].spell_slots_used?.[3]).toBe(1); // no slot consumed
    expect(r.newState.characters[0].class_resource_uses?.signature_used_fireball).toBe(1);
    expect(r.narrative).toMatch(/Signature Spell/);
  });

  it('requires a Wizard of level 20', () => {
    const c = featCtx(
      makeChar({ id: 'pc-1', character_class: 'Wizard', level: 19, spells_known: ['fireball'] })
    );
    handleChooseSignatureSpell(c, { type: 'choose_signature_spell', spellId: 'fireball' });
    expect(pcChar(c).signature_spells ?? []).not.toContain('fireball');
  });
});

describe('Memorize Spell (L5)', () => {
  const studious = (over: Partial<Character> = {}) =>
    makeChar({
      id: 'pc-1',
      character_class: 'Wizard',
      level: 5,
      spells_known: ['fireball', 'magic_missile', 'lightning_bolt'],
      prepared_spells: ['fireball', 'magic_missile'],
      ...over,
    });

  it('swaps a prepared spell for another from the spellbook', () => {
    const c = featCtx(studious());
    handleMemorizeSpell(c, {
      type: 'memorize_spell',
      swapOut: 'fireball',
      swapIn: 'lightning_bolt',
    });
    expect(pcChar(c).prepared_spells).toEqual(['magic_missile', 'lightning_bolt']);
  });

  it('rejects swapping out a spell that is not prepared', () => {
    const c = featCtx(studious());
    const res = handleMemorizeSpell(c, {
      type: 'memorize_spell',
      swapOut: 'lightning_bolt',
      swapIn: 'magic_missile',
    });
    expect(res).toEqual({ rejected: expect.stringMatching(/isn't one of your prepared spells/) });
  });

  it('rejects swapping in a spell not in the spellbook', () => {
    const c = featCtx(studious({ spells_known: ['fireball', 'magic_missile'] }));
    const res = handleMemorizeSpell(c, {
      type: 'memorize_spell',
      swapOut: 'fireball',
      swapIn: 'cone_of_cold',
    });
    expect(res).toEqual({ rejected: expect.stringMatching(/isn't in your spellbook/) });
  });

  it('requires a Wizard of level 5', () => {
    const c = featCtx(studious({ level: 4 }));
    handleMemorizeSpell(c, {
      type: 'memorize_spell',
      swapOut: 'fireball',
      swapIn: 'lightning_bolt',
    });
    expect(pcChar(c).prepared_spells).toEqual(['fireball', 'magic_missile']); // unchanged
  });
});
