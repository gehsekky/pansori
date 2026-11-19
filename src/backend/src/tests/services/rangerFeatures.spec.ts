// Ranger features — SRD 5.2.1 Deft Explorer's Expertise (L2) and Expertise
// (L9), Hunter's Lore (Hunter L3) and Nature's Veil (L14).

import { CORRIDOR_ID, makeChar, makeState, seedWithEnemy } from '../../test-fixtures.js';
import type { Character, Enemy, GameState, Seed } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expertiseEligibleSkills, expertiseSlots } from '../../services/multiclass.js';
import { generateChoices, takeAction } from '../../services/gameEngine.js';
import { huntersLoreNote, naturesVeilLeft } from '../../services/rangerFeatures.js';
import { context as ctx } from '../fixtures/testContext.js';

afterEach(() => vi.restoreAllMocks());

const GOB = `${CORRIDOR_ID}#0`;

const wight = {
  id: GOB,
  name: 'Wight',
  hp: 500,
  ac: 10,
  damage: '1d6',
  toHit: 3,
  xp: 20,
  resistances: ['necrotic'],
  nonmagical_resistances: ['slashing'],
  immunities: ['poison'],
  condition_immunities: ['poisoned'],
  vulnerabilities: ['radiant'],
} as Enemy;

const seed: Seed = { ...seedWithEnemy, enemies: { [CORRIDOR_ID]: [wight] } };

const fresh = {
  action_used: false,
  bonus_action_used: false,
  reaction_used: false,
  free_interaction_used: false,
};

const ranger = (level: number, over: Partial<Character> = {}) =>
  makeChar({
    id: 'pc-1',
    name: 'Ranger',
    character_class: 'Ranger',
    subclass: 'hunter',
    level,
    class_levels: { ranger: level },
    wis: 16, // +3
    dex: 16,
    hp: 60,
    max_hp: 60,
    turn_actions: fresh,
    ...over,
  });

function fight(char: Character, enemyPos = { x: 3, y: 2 }): GameState {
  return {
    ...makeState({ id: char.id }),
    characters: [char],
    active_character_id: char.id,
    current_room: CORRIDOR_ID,
    visited_rooms: ['entry_hall', CORRIDOR_ID],
    combat_active: true,
    initiative_order: [
      { id: char.id, roll: 18, is_enemy: false },
      { id: GOB, roll: 5, is_enemy: true },
    ],
    initiative_idx: 0,
    entities: [
      {
        id: char.id,
        isEnemy: false,
        pos: { x: 2, y: 2 },
        hp: char.hp,
        maxHp: char.max_hp,
        conditions: [],
        condition_durations: {},
      },
      {
        id: GOB,
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

const act = (state: GameState, action: Record<string, unknown>) =>
  takeAction({ action: action as never, history: [], state, seed, context: ctx });

// ─── Deft Explorer / Expertise ───────────────────────────────────────────────

describe('Ranger Expertise (Deft Explorer L2, Expertise L9)', () => {
  it('grants 1 Expertise at L2 and 2 more at L9, from any proficient skill', () => {
    expect(expertiseSlots(ranger(1))).toBe(0);
    expect(expertiseSlots(ranger(2))).toBe(1);
    expect(expertiseSlots(ranger(9))).toBe(3);
    const r = ranger(2, { skill_proficiencies: ['stealth', 'Athletics'] });
    expect(expertiseEligibleSkills(r)).toEqual(['stealth', 'Athletics']);
  });

  it('is chosen through the Expertise pick', async () => {
    const st = {
      ...makeState({ id: 'pc-1' }),
      characters: [ranger(2, { skill_proficiencies: ['stealth'] })],
    };
    const labels = generateChoices(st, seed, ctx).map((c) => c.label);
    expect(labels).toContain('Choose Expertise: stealth (double proficiency)');
    const r = await act(st, { type: 'choose_expertise', skill: 'stealth' });
    expect(r.newState.characters[0].expertise_skills).toEqual(['stealth']);
  });
});

// ─── Hunter's Lore ───────────────────────────────────────────────────────────

describe("Hunter's Lore (Hunter L3)", () => {
  it('reveals immunities, resistances and vulnerabilities', () => {
    const note = huntersLoreNote(ranger(3), wight);
    expect(note).toContain('immune to poison damage');
    expect(note).toContain("can't be poisoned");
    expect(note).toContain('resists necrotic, nonmagical slashing');
    expect(note).toContain('vulnerable to radiant');
  });

  it('says so when there is nothing to reveal, and needs a Hunter of L3', () => {
    const plain = {
      ...wight,
      resistances: [],
      nonmagical_resistances: [],
      immunities: [],
      condition_immunities: [],
      vulnerabilities: [],
    } as Enemy;
    expect(huntersLoreNote(ranger(3), plain)).toMatch(/no immunities/);
    expect(huntersLoreNote(ranger(2), wight)).toBe('');
    expect(huntersLoreNote(ranger(3, { subclass: undefined }), wight)).toBe('');
  });

  it("is revealed when Hunter's Mark lands", async () => {
    // High rolls: the Wight's counterattack can't break concentration on the mark.
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const char = ranger(3, {
      spells_known: ['hunters_mark'],
      spell_slots_max: { 1: 3 },
      spell_slots_used: {},
    });
    const r = await act(fight(char), {
      type: 'cast_spell',
      spellId: 'hunters_mark',
      slotLevel: 1,
      targetEnemyId: GOB,
    });
    expect(r.newState.characters[0].hunters_mark_target_id).toBe(GOB);
    expect(r.narrative).toContain("Hunter's Lore: Wight");
  });
});

// ─── Nature's Veil ───────────────────────────────────────────────────────────

describe("Nature's Veil (L14)", () => {
  const veil = { type: 'use_class_feature', featureId: 'natures_veil' };

  it('has WIS-modifier uses from L14', () => {
    expect(naturesVeilLeft(ranger(13))).toBe(0);
    expect(naturesVeilLeft(ranger(14))).toBe(3);
    expect(naturesVeilLeft(ranger(14, { wis: 8 }))).toBe(1); // minimum 1
    expect(naturesVeilLeft(ranger(14, { class_resource_uses: { natures_veil_used: 3 } }))).toBe(0);
  });

  it('turns the Ranger Invisible for a Bonus Action', async () => {
    const r = await act(fight(ranger(14)), veil);
    const c = r.newState.characters[0];
    expect(c.conditions).toContain('invisible');
    expect(c.condition_durations?.invisible).toBe(2);
    expect(c.class_resource_uses?.natures_veil_used).toBe(1);
    expect(c.turn_actions.bonus_action_used).toBe(true);
    expect(c.turn_actions.action_used).toBe(false);
  });

  it('refuses below L14 or with no uses', async () => {
    const low = await act(fight(ranger(13)), veil);
    expect(low.newState.characters[0].conditions).not.toContain('invisible');
    const spent = await act(
      fight(ranger(14, { class_resource_uses: { natures_veil_used: 3 } })),
      veil
    );
    expect(spent.newState.characters[0].conditions).not.toContain('invisible');
  });

  it("isn't ended by attacking", async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const veiled = ranger(14, {
      conditions: ['invisible'],
      condition_durations: { invisible: 2 },
      condition_sources: { invisible: 'natures_veil' },
      inventory: [{ instance_id: 'ss-1', id: 'shortsword', name: 'Shortsword' }],
      equipment: { main_hand: 'ss-1' },
      weapon_proficiencies: ['simple', 'martial'],
    });
    const r = await act(fight(veiled), { type: 'attack', targetEnemyId: GOB });
    expect(r.narrative).not.toMatch(/No living target|out of reach/i);
    expect(r.newState.characters[0].conditions).toContain('invisible');
  });

  it('is offered in combat while a use remains', () => {
    const ids = (c: Character) =>
      generateChoices(fight(c), seed, ctx).map(
        (x) => (x.action as { featureId?: string }).featureId
      );
    expect(ids(ranger(14))).toContain('natures_veil');
    expect(ids(ranger(14, { class_resource_uses: { natures_veil_used: 3 } }))).not.toContain(
      'natures_veil'
    );
  });
});
