// SRD 5.2.1 Hide [Action] conformance (2024, not 2014). The combat Hide
// (Rogue Cunning Action) must:
//   1. be gated on the RAW prerequisite — Heavily Obscured OR behind
//      Three-Quarters / Total Cover, AND out of every enemy's line of sight
//      (`canAttemptHide`); and
//   2. resolve on a FLAT DC 15 Dexterity (Stealth) check — NOT a contest
//      against an observer's passive Perception (the replaced 2014 model).
// The find side (an enemy's Wisdom Perception/Search vs the recorded total)
// is covered separately in resolveEnemyHideCheck.spec.ts.

import { CORRIDOR_ID, makeChar, makeState, seedWithEnemy } from '../test-fixtures.js';
import type { CombatEntity, GameState, GridPos, Seed } from '../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { canAttemptHide, generateChoices, takeAction } from './gameEngine.js';
import { context as ctx } from '../contexts/sandbox.js';

afterEach(() => vi.restoreAllMocks());

/** seedWithEnemy with the corridor room's lighting + obstacles overridden. */
function seedLit(lighting: 'bright' | 'dim' | 'dark', obstacles: GridPos[] = []): Seed {
  return {
    ...seedWithEnemy,
    rooms: seedWithEnemy.rooms.map((r) =>
      r.id === CORRIDOR_ID ? { ...r, lighting, obstacles } : r
    ),
  };
}

function entity(id: string, isEnemy: boolean, pos: GridPos, hp = 20): CombatEntity {
  return { id, isEnemy, pos, hp, maxHp: 20, conditions: [], condition_durations: {} };
}

function gridState(
  rogueId: string,
  roguePos: GridPos,
  enemyPos: GridPos,
  enemyHp = 30,
  extra: Partial<GameState> = {}
): GameState {
  return makeState(
    {},
    {
      characters: [],
      active_character_id: rogueId,
      current_room: CORRIDOR_ID,
      combat_active: true,
      initiative_order: [{ id: rogueId, roll: 18, is_enemy: false }],
      initiative_idx: 0,
      round: 1,
      movement_used: {},
      entities: [
        entity(rogueId, false, roguePos),
        entity(`${CORRIDOR_ID}#0`, true, enemyPos, enemyHp),
      ],
      ...extra,
    }
  );
}

describe('canAttemptHide — SRD Hide prerequisite', () => {
  const rogue = makeChar({ id: 'r', character_class: 'Rogue', level: 2 });

  it('denies hiding in the open — clear line of sight, no cover', () => {
    // Rogue (4,5) adjacent to enemy (5,5) in bright light: the enemy plainly
    // sees the rogue, so Hide is illegal.
    const st = gridState(rogue.id, { x: 4, y: 5 }, { x: 5, y: 5 });
    const result = canAttemptHide(rogue, st, seedLit('bright'));
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/open/);
  });

  it('allows hiding behind a sight-blocking obstacle (out of line of sight)', () => {
    // Obstacle at (4,5) lies strictly between enemy (6,5) and rogue (2,5),
    // so the enemy has no line of sight → Total Cover → eligible.
    const st = gridState(rogue.id, { x: 2, y: 5 }, { x: 6, y: 5 });
    const result = canAttemptHide(rogue, st, seedLit('bright', [{ x: 4, y: 5 }]));
    expect(result.allowed).toBe(true);
  });

  it('allows hiding in a dark room (Heavily Obscured), even adjacent', () => {
    const st = gridState(rogue.id, { x: 4, y: 5 }, { x: 5, y: 5 });
    expect(canAttemptHide(rogue, st, seedLit('dark')).allowed).toBe(true);
  });

  it('denies hiding in dim light — lightly obscured is not enough', () => {
    const st = gridState(rogue.id, { x: 4, y: 5 }, { x: 5, y: 5 });
    expect(canAttemptHide(rogue, st, seedLit('dim')).allowed).toBe(false);
  });

  it('denies hiding with only Half Cover in clear line of sight', () => {
    // Enemy (5,2), rogue (2,5): cover candidate (2,4) is off the sight line, so
    // blocking it grants Half Cover (+2) while line of sight stays clear —
    // RAW Half Cover does not let you Hide.
    const st = gridState(rogue.id, { x: 2, y: 5 }, { x: 5, y: 2 });
    expect(canAttemptHide(rogue, st, seedLit('bright', [{ x: 2, y: 4 }])).allowed).toBe(false);
  });

  it('allows hiding when no living enemy remains', () => {
    const st = gridState(rogue.id, { x: 4, y: 5 }, { x: 5, y: 5 }, 0);
    expect(canAttemptHide(rogue, st, seedLit('bright')).allowed).toBe(true);
  });

  it('degrades to allowed off-grid (no tracked entities)', () => {
    const st = makeState({ id: rogue.id }, { current_room: CORRIDOR_ID, entities: undefined });
    expect(canAttemptHide(rogue, st, seedLit('bright')).allowed).toBe(true);
  });
});

describe('Cunning Action Hide — action integration', () => {
  function hideRogue(overrides = {}) {
    return makeChar({
      id: 'r-hide',
      character_class: 'Rogue',
      level: 2,
      dex: 16,
      skill_proficiencies: ['Stealth'],
      turn_actions: {
        action_used: true,
        bonus_action_used: false,
        reaction_used: false,
        free_interaction_used: false,
      },
      ...overrides,
    });
  }

  it('is rejected when standing in the open, without revealing/hiding', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    const rogue = hideRogue();
    const st = gridState(rogue.id, { x: 4, y: 5 }, { x: 5, y: 5 });
    st.characters = [rogue];
    const result = await takeAction({
      action: { type: 'use_class_feature', featureId: 'cunning_action_hide' },
      history: [],
      state: st,
      seed: seedLit('bright'),
      context: ctx,
    });
    expect(result.narrative).toMatch(/can't hide/);
    const after = result.newState.characters[0];
    expect(after.conditions).not.toContain('invisible');
    expect(after.hide_dc).toBeUndefined();
  });

  it('uses a flat DC 15 — not the enemy passive Perception (proves 2024 model)', async () => {
    // Dark room → eligible. Rogue dex 10 (+0), no proficiency; d20 mocked to 10
    // → total 10. A WIS 8 enemy has passive Perception 9, so the 2014 contested
    // model (Stealth vs passive) would SUCCEED (10 ≥ 9). Under 2024's flat DC 15
    // it must FAIL (10 < 15).
    vi.spyOn(Math, 'random').mockReturnValue(0.45); // d20 = floor(9)+1 = 10
    const rogue = hideRogue({ dex: 10, skill_proficiencies: [] });
    const st = gridState(rogue.id, { x: 4, y: 5 }, { x: 5, y: 5 });
    st.characters = [rogue];
    // enemy WIS 8 → passive Perception 9 (well below the rolled total of 10)
    const seed: Seed = {
      ...seedLit('dark'),
      enemies: {
        ...seedWithEnemy.enemies,
        [CORRIDOR_ID]: seedWithEnemy.enemies[CORRIDOR_ID].map((e) => ({ ...e, wis: 8 })),
      },
    };
    const result = await takeAction({
      action: { type: 'use_class_feature', featureId: 'cunning_action_hide' },
      history: [],
      state: st,
      seed,
      context: ctx,
    });
    expect(result.narrative).toMatch(/fails/);
    expect(result.narrative).toMatch(/DC 15/);
    const after = result.newState.characters[0];
    expect(after.conditions).not.toContain('invisible');
  });

  it('succeeds from a dark room and records the check total as the find DC', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999); // max roll
    const rogue = hideRogue();
    const st = gridState(rogue.id, { x: 4, y: 5 }, { x: 5, y: 5 });
    st.characters = [rogue];
    const result = await takeAction({
      action: { type: 'use_class_feature', featureId: 'cunning_action_hide' },
      history: [],
      state: st,
      seed: seedLit('dark'),
      context: ctx,
    });
    expect(result.narrative).toMatch(/Hide DC/);
    const after = result.newState.characters[0];
    expect(after.conditions).toContain('invisible');
    expect(after.hide_dc).toBeGreaterThanOrEqual(15);
  });
});

describe('General Hide action — available to any class', () => {
  // A Fighter (no Cunning Action) taking the Hide Action.
  function fighter(overrides = {}) {
    return makeChar({
      id: 'f-hide',
      character_class: 'Fighter',
      level: 3,
      dex: 16,
      skill_proficiencies: ['Stealth'],
      ...overrides,
    });
  }

  it('a non-Rogue can take the Hide action and gains Invisible on a success', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999); // max roll
    const pc = fighter();
    const st = gridState(pc.id, { x: 4, y: 5 }, { x: 5, y: 5 });
    st.characters = [pc];
    const result = await takeAction({
      action: { type: 'hide' },
      history: [],
      state: st,
      seed: seedLit('dark'), // Heavily Obscured → eligible
      context: ctx,
    });
    expect(result.narrative).toMatch(/Hide DC/);
    const after = result.newState.characters[0];
    expect(after.conditions).toContain('invisible');
    expect(after.hide_dc).toBeGreaterThanOrEqual(15);
  });

  it('is rejected in the open and does NOT spend the action', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    const pc = fighter();
    const st = gridState(pc.id, { x: 4, y: 5 }, { x: 5, y: 5 });
    st.characters = [pc];
    const result = await takeAction({
      action: { type: 'hide' },
      history: [],
      state: st,
      seed: seedLit('bright'), // in plain view → illegal
      context: ctx,
    });
    expect(result.narrative).toMatch(/can't hide/);
    const after = result.newState.characters[0];
    expect(after.conditions).not.toContain('invisible');
    // RAW: an action you can't legally take isn't spent.
    expect(after.turn_actions.action_used).toBe(false);
  });

  it('is offered in generateChoices for a non-Rogue only when eligible', () => {
    const pc = fighter();
    const inOpen = gridState(pc.id, { x: 4, y: 5 }, { x: 5, y: 5 });
    inOpen.characters = [pc];
    expect(
      generateChoices(inOpen, seedLit('bright'), ctx).some((c) => c.action.type === 'hide')
    ).toBe(false);
    expect(
      generateChoices(inOpen, seedLit('dark'), ctx).some((c) => c.action.type === 'hide')
    ).toBe(true);
  });
});
