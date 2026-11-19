// Bard features — SRD 5.2.1 Font of Inspiration (L5), Magical Secrets (L10),
// and College of Lore Bonus Proficiencies (L3) and Magical Discoveries (L6).

import { CORRIDOR_ID, makeChar, makeState, seedWithEnemy } from '../../test-fixtures.js';
import type { Character, GameState } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  canFontOfInspiration,
  isMagicalDiscoveryEligible,
  lowestOpenSlot,
  magicalDiscoveryOptions,
  magicalSecretsLists,
  pendingMagicalDiscoveries,
} from '../../services/bardFeatures.js';
import { generateChoices, takeAction } from '../../services/gameEngine.js';
import { alwaysPreparedSpells } from '../../services/subclassSpells.js';
import { context as ctx } from '../fixtures/testContext.js';
import { pendingBonusSkills } from '../../services/bonusSkills.js';

afterEach(() => vi.restoreAllMocks());

const GOBLIN = `${CORRIDOR_ID}#0`;
const spells = ctx.spellTable ?? {};

const bard = (level: number, over: Partial<Character> = {}) =>
  makeChar({
    id: 'pc-1',
    character_class: 'Bard',
    subclass: 'lore',
    level,
    class_levels: { bard: level },
    cha: 16, // +3 → 3 Bardic Inspiration uses
    spell_slots_max: { 1: 4, 2: 3, 3: 2 },
    spell_slots_used: {},
    spells_known: [],
    ...over,
  });

const fresh = {
  action_used: false,
  bonus_action_used: false,
  reaction_used: false,
  free_interaction_used: false,
};

function fight(char: Character): GameState {
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
        pos: { x: 2, y: 2 },
        hp: char.hp,
        maxHp: char.max_hp,
        conditions: [],
        condition_durations: {},
      },
      {
        id: GOBLIN,
        isEnemy: true,
        pos: { x: 5, y: 2 },
        hp: 500,
        maxHp: 500,
        conditions: [],
        condition_durations: {},
      },
    ],
    movement_used: {},
  };
}

const explore = (char: Character): GameState => ({
  ...makeState({ id: char.id }),
  characters: [char],
  active_character_id: char.id,
});

const act = (state: GameState, action: Record<string, unknown>) =>
  takeAction({ action: action as never, history: [], state, seed: seedWithEnemy, context: ctx });

// ─── Font of Inspiration ─────────────────────────────────────────────────────

describe('Font of Inspiration (L5)', () => {
  const spent = { class_resource_uses: { bardic_inspiration: 1 } };

  it('is available from L5 with an expended use and an open slot', () => {
    expect(canFontOfInspiration(bard(5, spent))).toBe(true);
    expect(canFontOfInspiration(bard(4, spent))).toBe(false);
    expect(canFontOfInspiration(bard(5))).toBe(false); // pool already full
    expect(
      canFontOfInspiration(bard(5, { ...spent, spell_slots_used: { 1: 4, 2: 3, 3: 2 } }))
    ).toBe(false);
  });

  it('picks the lowest open slot', () => {
    expect(lowestOpenSlot(bard(5, { spell_slots_used: { 1: 4 } }))).toBe(2);
    expect(lowestOpenSlot(bard(5, { spell_slots_used: { 1: 4, 2: 3, 3: 2 } }))).toBe(0);
  });

  it('spends the slot and restores one use, taking no action', async () => {
    const char = bard(5, { ...spent, turn_actions: { ...fresh, bonus_action_used: true } });
    const r = await act(fight(char), {
      type: 'use_class_feature',
      featureId: 'font_of_inspiration',
    });
    const after = r.newState.characters[0];
    expect(after.class_resource_uses?.bardic_inspiration).toBe(2);
    expect(after.spell_slots_used?.[1]).toBe(1);
    expect(after.turn_actions.action_used).toBe(false);
    expect(r.narrative).toMatch(/Font of Inspiration/);
  });

  it('refuses when the pool is full', async () => {
    const r = await act(fight(bard(5, { turn_actions: fresh })), {
      type: 'use_class_feature',
      featureId: 'font_of_inspiration',
    });
    expect(r.newState.characters[0].spell_slots_used?.[1] ?? 0).toBe(0);
    expect(r.narrative).toMatch(/already full/);
  });

  it('is offered in combat even after the bonus action is spent', () => {
    const char = bard(5, { ...spent, turn_actions: { ...fresh, bonus_action_used: true } });
    const ids = generateChoices(fight(char), seedWithEnemy, ctx).map(
      (c) => (c.action as { featureId?: string }).featureId
    );
    expect(ids).toContain('font_of_inspiration');
  });
});

// ─── Bonus Proficiencies ─────────────────────────────────────────────────────

describe('College of Lore Bonus Proficiencies (L3)', () => {
  it('grants three picks from any skill to a Lore Bard of level 3+', () => {
    expect(pendingBonusSkills(bard(2))).toEqual([]);
    expect(pendingBonusSkills(bard(3, { subclass: undefined }))).toEqual([]);
    const [grant] = pendingBonusSkills(bard(3, { skill_proficiencies: ['Stealth'] }));
    expect(grant.source).toBe('lore_bonus_proficiencies');
    expect(grant.count).toBe(3);
    expect(grant.options).toHaveLength(17);
    expect(grant.options).not.toContain('stealth');
  });

  it('closes after three picks', async () => {
    let state = explore(bard(3, { skill_proficiencies: [] }));
    for (const skill of ['arcana', 'history', 'insight']) {
      const r = await act(state, {
        type: 'choose_bonus_skill',
        source: 'lore_bonus_proficiencies',
        skill,
      });
      state = r.newState;
    }
    const after = state.characters[0];
    expect(after.skill_proficiencies).toEqual(['arcana', 'history', 'insight']);
    expect(pendingBonusSkills(after)).toEqual([]);
  });
});

// ─── Magical Discoveries ─────────────────────────────────────────────────────

describe('College of Lore Magical Discoveries (L6)', () => {
  it('opens two picks for a Lore Bard of level 6+', () => {
    expect(pendingMagicalDiscoveries(bard(5))).toBe(0);
    expect(pendingMagicalDiscoveries(bard(6, { subclass: undefined }))).toBe(0);
    expect(pendingMagicalDiscoveries(bard(6))).toBe(2);
    expect(pendingMagicalDiscoveries(bard(6, { magical_discoveries: ['guiding_bolt'] }))).toBe(1);
  });

  it('allows cantrips and spells up to the highest slot level, not known ones', () => {
    const b = bard(6, { spells_known: ['guiding_bolt'] });
    expect(isMagicalDiscoveryEligible(b, spells.sacred_flame)).toBe(true); // cantrip
    expect(isMagicalDiscoveryEligible(b, spells.spirit_guardians)).toBe(true); // level 3
    expect(isMagicalDiscoveryEligible(b, spells.guiding_bolt)).toBe(false); // already known
    expect(isMagicalDiscoveryEligible(b, spells.fire_shield)).toBe(false); // level 4: no slot
    expect(magicalDiscoveryOptions(b, spells)).toContain('spirit_guardians');
  });

  it('learns the spell as always prepared', async () => {
    const r = await act(explore(bard(6)), {
      type: 'choose_magical_discovery',
      spellId: 'spirit_guardians',
    });
    const after = r.newState.characters[0];
    expect(after.magical_discoveries).toEqual(['spirit_guardians']);
    expect(after.spells_known).toContain('spirit_guardians');
    expect(after.subclass_granted_spells).toContain('spirit_guardians');
    expect(alwaysPreparedSpells(after)).toContain('spirit_guardians');
    expect(pendingMagicalDiscoveries(after)).toBe(1);
  });

  it('rejects an ineligible spell and a third pick', async () => {
    const tooHigh = await act(explore(bard(6)), {
      type: 'choose_magical_discovery',
      spellId: 'fire_shield',
    });
    expect(tooHigh.newState.characters[0].magical_discoveries).toBeUndefined();
    const full = await act(explore(bard(6, { magical_discoveries: ['bless', 'aid'] })), {
      type: 'choose_magical_discovery',
      spellId: 'spirit_guardians',
    });
    expect(full.newState.characters[0].magical_discoveries).toEqual(['bless', 'aid']);
  });

  it('is offered out of combat while a pick is open', () => {
    const labels = generateChoices(explore(bard(6)), seedWithEnemy, ctx).map((c) => c.label);
    expect(labels).toContain('Magical Discoveries: learn Spirit Guardians (level 3)');
    const done = bard(6, { magical_discoveries: ['bless', 'aid'] });
    expect(
      generateChoices(explore(done), seedWithEnemy, ctx).some((c) =>
        c.label.startsWith('Magical Discoveries')
      )
    ).toBe(false);
  });
});

// ─── Magical Secrets ─────────────────────────────────────────────────────────

describe('Magical Secrets (L10)', () => {
  it('opens the divine and primal lists at L10', () => {
    expect(magicalSecretsLists(bard(9))).toEqual([]);
    expect(magicalSecretsLists(bard(10))).toEqual(['divine', 'primal']);
  });

  it('lets a level-up spell pick come from the Cleric list at L10 only', async () => {
    const pick = { type: 'learn_spell', spellId: 'spirit_guardians' };
    const at10 = await act(explore(bard(10, { spells_to_learn: 1 })), pick);
    expect(at10.newState.characters[0].spells_known).toContain('spirit_guardians');
    const at9 = await act(explore(bard(9, { spells_to_learn: 1 })), pick);
    expect(at9.newState.characters[0].spells_known).not.toContain('spirit_guardians');
  });
});
