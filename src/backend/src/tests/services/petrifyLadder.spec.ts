// SRD petrification ladder (Cockatrice bite, Basilisk / Medusa / Gorgon gaze) —
// a failed CON save Restrains the target, which re-saves at the start of its next
// turn: shaking free on a success, turning to stone (Petrified) on a second
// failure. Covers the catalog wiring, the stage-1 party application, the stage-2
// re-save state machine (both arms + the acted gate), the gaze recharge, and an
// integration proving a gaze fired through `takeAction` Restrains the party.

import type { Enemy, GameState, Seed } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyPetrifyLadderToParty,
  maybeFirePetrifyingGaze,
  resolvePetrifyLadder,
  takeAction,
} from '../../services/gameEngine.js';
import { makeChar, makeState } from '../../test-fixtures.js';
import { SRD_MONSTERS } from '../../campaignData/srd/monsters.js';
import { context as ctx } from '../fixtures/testContext.js';

afterEach(() => vi.restoreAllMocks());

// ─── Catalog ────────────────────────────────────────────────────────────────

describe('petrify ladder — catalog', () => {
  it('Cockatrice bite seeds the ladder (CON DC 11, petrify flag)', () => {
    expect(SRD_MONSTERS.cockatrice.onHitEffect).toEqual({
      condition: 'restrained',
      ability: 'con',
      dc: 11,
      petrify: true,
    });
  });

  it('Basilisk has a Recharge 4–6 Petrifying Gaze (CON DC 12)', () => {
    expect(SRD_MONSTERS.basilisk.petrifyingGaze).toEqual({
      name: 'Petrifying Gaze',
      savingThrow: 'con',
      saveDC: 12,
      rechargeMin: 4,
    });
  });

  it('Gorgon has a Recharge 5–6 Petrifying Breath (CON DC 15)', () => {
    expect(SRD_MONSTERS.gorgon.petrifyingGaze).toMatchObject({ saveDC: 15, rechargeMin: 5 });
  });

  it('Medusa has a Recharge 5–6 Petrifying Gaze (CON DC 13)', () => {
    expect(SRD_MONSTERS.medusa.petrifyingGaze).toMatchObject({ saveDC: 13, rechargeMin: 5 });
  });
});

// ─── applyPetrifyLadderToParty (stage 1) ────────────────────────────────────

function twoPcState(): GameState {
  const a = makeChar({ id: 'pc-1', con: 10, hp: 40, max_hp: 40 });
  const b = makeChar({ id: 'pc-2', con: 10, hp: 40, max_hp: 40 });
  return { ...makeState({ id: 'pc-1' }), characters: [a, b] };
}

describe('applyPetrifyLadderToParty', () => {
  it('Restrains every PC that fails the save and seeds petrify_save', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01); // d20 → 1, fails
    const r = applyPetrifyLadderToParty(twoPcState(), ctx, { savingThrow: 'con', saveDC: 13 });
    for (const c of r.st.characters) {
      expect(c.conditions).toContain('restrained');
      expect(c.petrify_save).toEqual({ dc: 13, ability: 'con', acted: false });
      // Restrained must persist (no timed entry) so the ladder, not the timer, owns it.
      expect(c.condition_durations?.restrained).toBeUndefined();
    }
    expect(r.narrative).toContain('Restrained');
  });

  it('leaves a PC that makes the save untouched', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // d20 → 20, succeeds
    const r = applyPetrifyLadderToParty(twoPcState(), ctx, { savingThrow: 'con', saveDC: 13 });
    expect(r.st.characters[0].conditions).not.toContain('restrained');
    expect(r.st.characters[0].petrify_save).toBeUndefined();
    expect(r.narrative).toContain('resists');
  });

  it('does not re-seed a PC already on the ladder', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01);
    const st = twoPcState();
    st.characters[0] = {
      ...st.characters[0],
      conditions: ['restrained'],
      petrify_save: { dc: 11, ability: 'con', acted: true },
    };
    const r = applyPetrifyLadderToParty(st, ctx, { savingThrow: 'con', saveDC: 13 });
    expect(r.st.characters[0].petrify_save).toEqual({ dc: 11, ability: 'con', acted: true }); // unchanged
  });
});

// ─── resolvePetrifyLadder (stage 2 — turn-start re-save) ─────────────────────

function ladderChar(acted: boolean) {
  return makeChar({
    id: 'pc-1',
    con: 10,
    conditions: ['restrained'],
    petrify_save: { dc: 13, ability: 'con', acted },
  });
}

describe('resolvePetrifyLadder', () => {
  it('first afflicted turn gets no save — only flips acted', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01); // would fail, but no save this turn
    const r = resolvePetrifyLadder(ladderChar(false), twoPcState(), ctx);
    expect(r.char.conditions).toContain('restrained');
    expect(r.char.petrify_save).toEqual({ dc: 13, ability: 'con', acted: true });
    expect(r.narrative).toBe('');
  });

  it('a made re-save breaks free (clears Restrained + marker)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // d20 → 20, succeeds
    const r = resolvePetrifyLadder(ladderChar(true), twoPcState(), ctx);
    expect(r.char.conditions).not.toContain('restrained');
    expect(r.char.petrify_save).toBeUndefined();
    expect(r.narrative).toContain('breaks free');
  });

  it('a failed re-save turns the PC to stone (Petrified)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01); // d20 → 1, fails
    const r = resolvePetrifyLadder(ladderChar(true), twoPcState(), ctx);
    expect(r.char.conditions).toContain('petrified');
    expect(r.char.conditions).not.toContain('restrained');
    expect(r.char.petrify_save).toBeUndefined();
    expect(r.narrative).toContain('turns to stone');
  });

  it('clears the marker if Restrained was lifted by other means', () => {
    const cured = makeChar({
      id: 'pc-1',
      conditions: [], // restrained stripped (e.g. a save-reroll)
      petrify_save: { dc: 13, ability: 'con', acted: true },
    });
    const r = resolvePetrifyLadder(cured, twoPcState(), ctx);
    expect(r.char.petrify_save).toBeUndefined();
    expect(r.char.conditions).not.toContain('petrified');
  });

  it('is a no-op for a PC not on the ladder', () => {
    const plain = makeChar({ id: 'pc-1', conditions: [] });
    const r = resolvePetrifyLadder(plain, twoPcState(), ctx);
    expect(r.char.petrify_save).toBeUndefined();
    expect(r.narrative).toBe('');
  });
});

// ─── maybeFirePetrifyingGaze — recharge state machine ───────────────────────

function gazeEnemy(): Enemy {
  return {
    ...SRD_MONSTERS.basilisk,
    id: 'basilisk#0',
  } as Enemy;
}

function gazeState(gazeCharged?: boolean): GameState {
  return {
    ...twoPcState(),
    entities: [
      {
        id: 'basilisk#0',
        isEnemy: true,
        pos: { x: 5, y: 5 },
        hp: 52,
        maxHp: 52,
        conditions: [],
        condition_durations: {},
        ...(gazeCharged !== undefined ? { gaze_charged: gazeCharged } : {}),
      },
    ],
  };
}

describe('maybeFirePetrifyingGaze', () => {
  it('fires when charged, Restrains the party, and marks it spent', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01); // saves fail
    const r = maybeFirePetrifyingGaze({
      enemy: gazeEnemy(),
      enemyId: 'basilisk#0',
      st: gazeState(undefined),
      context: ctx,
      narrative: '',
    });
    expect(r.fired).toBe(true);
    expect(r.st.entities?.[0].gaze_charged).toBe(false);
    expect(r.st.characters[0].conditions).toContain('restrained');
    expect(r.narrative).toContain('Petrifying Gaze');
  });

  it('does not fire when spent and the recharge roll fails', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01); // d6 → 1, below rechargeMin 4
    const r = maybeFirePetrifyingGaze({
      enemy: gazeEnemy(),
      enemyId: 'basilisk#0',
      st: gazeState(false),
      context: ctx,
      narrative: '',
    });
    expect(r.fired).toBe(false);
    expect(r.st.characters[0].conditions).not.toContain('restrained');
  });

  it('is a no-op for an enemy without a gaze', () => {
    const r = maybeFirePetrifyingGaze({
      enemy: { ...gazeEnemy(), petrifyingGaze: undefined },
      enemyId: 'basilisk#0',
      st: gazeState(undefined),
      context: ctx,
      narrative: '',
    });
    expect(r.fired).toBe(false);
  });
});

// ─── Integration — a Basilisk gazes on its turn via takeAction ──────────────

describe('Petrifying Gaze — fires on the enemy turn (integration)', () => {
  it('a Basilisk Restrains the party after a PC acts', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01); // saves fail
    const basilisk: Enemy = { ...SRD_MONSTERS.basilisk, id: 'basilisk#0' };
    const seed: Seed = {
      context_id: ctx.id,
      world_name: 'Gaze Test',
      ship_name: 'Gaze Test',
      intro: '',
      seed_id: 'gaze',
      rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
      enemies: { ['entry_hall']: [basilisk] },
      loot: {},
      npcs: {},
    };
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Fighter',
      level: 5,
      hp: 44,
      max_hp: 44,
      con: 10,
    });
    const state: GameState = {
      ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
      characters: [pc],
      active_character_id: 'pc-1',
      initiative_order: [
        { id: 'pc-1', roll: 18, is_enemy: false },
        { id: 'basilisk#0', roll: 5, is_enemy: true },
      ],
      initiative_idx: 0,
      round: 1,
      entities: [
        {
          id: 'pc-1',
          isEnemy: false,
          pos: { x: 4, y: 5 },
          hp: 44,
          maxHp: 44,
          conditions: [],
          condition_durations: {},
        },
        {
          id: 'basilisk#0',
          isEnemy: true,
          pos: { x: 5, y: 5 },
          hp: 52,
          maxHp: 52,
          conditions: [],
          condition_durations: {},
        },
      ],
    };
    const r = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state,
      seed,
      context: ctx,
    });
    expect(r.narrative).toMatch(/Petrifying Gaze/);
    expect(r.newState.characters[0].conditions).toContain('restrained');
    expect(r.newState.characters[0].petrify_save?.ability).toBe('con');
  });
});
