// Regression-coverage gaps (TODO "Regression-spec coverage gaps"). These pin
// four behaviors that were implemented but unguarded, so a future refactor
// can't silently regress them:
//   1. Bless auto-pick caps at the slot max on a 4+-member party (it does NOT
//      bless the whole party).
//   2. Monk Flurry whose FIRST strike kills the sole enemy — the loop breaks,
//      the second strike never runs, and combat ends cleanly (no crash).
//   3. Barbarian Frenzy with no enemy in range — rejects before spending the
//      bonus action.
//   4. The unknown-class-feature fallback — narrates and no-ops, never throws.

import {
  CORRIDOR_ID,
  ctxWithRage,
  makeChar,
  makeState,
  mockRandom,
  seedWithEnemy,
  spellSeed,
} from '../../test-fixtures.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GameState } from '../../types.js';
import { context as ctx } from '../fixtures/testContext.js';
import { takeAction } from '../../services/gameEngine.js';

afterEach(() => vi.restoreAllMocks());

// ── 1. Bless on a 4+-member party ──────────────────────────────────────────
// Auto-pick is caster + living allies, capped at 3 (+1 per slot above 1st).
// A 5-member party must NOT all light up — the cap holds even with more
// eligible targets than slots.
describe('Bless — auto-pick honors the slot cap on a large party', () => {
  function bigParty(): GameState {
    const cleric = makeChar({
      id: 'cleric-1',
      character_class: 'Cleric',
      wis: 14,
      spell_slots_max: { 1: 2, 2: 1 },
      spells_known: ['bless'],
      prepared_spells: ['bless'],
    });
    const allies = ['f1', 'f2', 'f3', 'f4'].map((id) =>
      makeChar({ id, character_class: 'Fighter' })
    );
    return {
      ...makeState(),
      characters: [cleric, ...allies],
      active_character_id: cleric.id,
      current_room: 'entry_hall',
      combat_active: false,
    };
  }

  it('blesses exactly 3 of a 5-member party at slot 1', async () => {
    const result = await takeAction({
      action: { type: 'cast_spell', spellId: 'bless', slotLevel: 1 },
      history: [],
      state: bigParty(),
      seed: spellSeed,
      context: ctxWithRage,
    });
    const blessed = result.newState.characters.filter((c) => c.conditions.includes('blessed'));
    expect(blessed).toHaveLength(3);
    // Auto-pick leads with the caster.
    expect(blessed.map((c) => c.id)).toContain('cleric-1');
  });

  it('an upcast to slot 2 raises the cap to 4 (still not all 5)', async () => {
    const result = await takeAction({
      action: { type: 'cast_spell', spellId: 'bless', slotLevel: 2 },
      history: [],
      state: bigParty(),
      seed: spellSeed,
      context: ctxWithRage,
    });
    const blessed = result.newState.characters.filter((c) => c.conditions.includes('blessed'));
    expect(blessed).toHaveLength(4);
  });
});

// ── 2. Flurry — first strike kills the sole enemy ──────────────────────────
describe('Flurry of Blows — first strike kills the only enemy', () => {
  it('breaks before the second strike and ends combat cleanly', async () => {
    mockRandom(0.99, 0.99, 0.99, 0.99); // force the first strike to hit + near-max damage
    const goblinId = `${CORRIDOR_ID}#0`;
    const monk = makeChar({
      id: 'mk-1',
      character_class: 'Monk',
      level: 5,
      dex: 18,
      class_resource_uses: { ki_points: 3 },
      turn_actions: {
        action_used: true,
        bonus_action_used: false,
        reaction_used: false,
        free_interaction_used: false,
      },
    });
    const state: GameState = {
      ...makeState({ id: 'mk-1' }, { current_room: CORRIDOR_ID, combat_active: true }),
      characters: [monk],
      active_character_id: 'mk-1',
      initiative_order: [
        { id: 'mk-1', roll: 18, is_enemy: false },
        { id: goblinId, roll: 5, is_enemy: true },
      ],
      initiative_idx: 0,
      entities: [
        {
          id: 'mk-1',
          isEnemy: false,
          pos: { x: 4, y: 5 },
          hp: 20,
          maxHp: 20,
          conditions: [],
          condition_durations: {},
        },
        {
          id: goblinId,
          isEnemy: true,
          pos: { x: 5, y: 5 },
          hp: 5, // frail — a single strike drops it
          maxHp: 5,
          conditions: [],
          condition_durations: {},
        },
      ],
    };
    const result = await takeAction({
      action: { type: 'use_class_feature', featureId: 'flurry_of_blows' },
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });
    // First strike kills; the loop breaks so the second strike never runs.
    expect(result.narrative).toContain('(killed)');
    expect(result.narrative).toContain('Strike 1');
    expect(result.narrative).not.toMatch(/Strike 2/);
    // Sole enemy down → room cleared → combat over. Kill is recorded.
    expect(result.newState.combat_active).toBe(false);
    expect(result.newState.enemies_killed).toContain(goblinId);
    // Exactly one ki spent (3 → 2), not double-charged by the unrun second strike.
    expect(result.newState.characters[0].class_resource_uses?.ki_points).toBe(2);
  });
});

// ── 3. Frenzy with no enemy in range ───────────────────────────────────────
describe('Frenzy — no enemy present', () => {
  it('rejects before consuming the bonus action', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const barb = makeChar({
      id: 'b-zerk',
      character_class: 'Barbarian',
      subclass: 'berserker',
      level: 3,
      str: 16,
      conditions: ['raging'],
      turn_actions: {
        action_used: true,
        bonus_action_used: false,
        reaction_used: false,
        free_interaction_used: false,
      },
    });
    // current_room is the start room (makeState default); seedWithEnemy's
    // enemy lives in CORRIDOR_ID, so there's no enemy here.
    const state = makeState({}, { characters: [barb], active_character_id: 'b-zerk' });
    state.characters = [barb];
    state.active_character_id = 'b-zerk';
    const result = await takeAction({
      action: { type: 'use_class_feature', featureId: 'frenzy_attack' },
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });
    expect(result.narrative).toMatch(/No enemy to Frenzy/i);
    expect(result.newState.characters[0].turn_actions.bonus_action_used).toBe(false);
  });
});

// ── 4. Unknown class-feature fallback ──────────────────────────────────────
describe('use_class_feature — unknown feature id', () => {
  it('narrates a clean fallback and leaves the character untouched', async () => {
    const state = makeState({ character_class: 'Fighter', level: 5, hp: 40, max_hp: 40 });
    const result = await takeAction({
      action: { type: 'use_class_feature', featureId: 'unknown_bogus_feature' },
      history: [],
      state,
      seed: spellSeed,
      context: ctx,
    });
    expect(result.narrative).toBe('Unknown class feature: unknown_bogus_feature.');
    // No mechanical effect — HP and the turn's bonus action are unchanged.
    expect(result.newState.characters[0].hp).toBe(40);
    expect(result.newState.characters[0].turn_actions.bonus_action_used).toBe(false);
  });
});
