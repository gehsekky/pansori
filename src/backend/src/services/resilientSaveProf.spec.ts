// Regression test for Resilient feat-granted save proficiency.
//
// **Pre-existing bug:** `conditionSavingThrow` computed the
// `proficient` flag from `context.classSavingThrows` only. Resilient
// records its choice on `feat_choices.resilient.saveProficiencies`,
// but the function never consulted it. A Wizard who took Resilient
// (CON) got the +1 CON ability bump but never actually rolled CON
// saves with proficiency — defeating the half-feat's whole
// defensive value.
//
// Fixed by additionally walking `feat_choices.*.saveProficiencies`
// in conditionSavingThrow. This spec proves the fix by comparing
// proficient-vs-not roll outcomes on a borderline DC.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../test-fixtures.js';
import type { Seed } from '../types.js';
import { context as ctx } from '../campaignData/sandbox.js';
import { takeAction } from './gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const enemyId = `entry_hall#0`;

// Stun-on-hit goblin with a high DC. CON 10 (mod 0) PC needs a
// 14+ on the d20 to pass without proficiency; with proficiency
// (L5 → +3) needs only an 11+.
const seedWithStunGoblin: Seed = {
  context_id: ctx.id,
  world_name: 'Resilient Save Test',
  ship_name: 'Resilient Save Test',
  intro: '',
  seed_id: 'resilient-save',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {
    ['entry_hall']: [
      {
        id: enemyId,
        name: 'Stun Goblin',
        hp: 40,
        ac: 5,
        damage: '1d4',
        toHit: 20, // auto-hit
        xp: 20,
        con: 14,
        onHitEffect: { condition: 'stunned', ability: 'con', dc: 14 },
      },
    ],
  },
  loot: {},
  npcs: {},
};

function buildPc(opts: { resilient?: boolean }) {
  return makeChar({
    id: 'pc-1',
    character_class: 'Wizard',
    level: 5,
    con: 10,
    feats: opts.resilient ? ['resilient'] : [],
    feat_choices: opts.resilient
      ? { resilient: { abilityBonus: 'con', saveProficiencies: ['con'] } }
      : undefined,
    hp: 30,
    max_hp: 30,
  });
}

function buildState(pc: ReturnType<typeof makeChar>) {
  return {
    ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
    characters: [pc],
    active_character_id: 'pc-1',
    initiative_order: [
      { id: 'pc-1', roll: 5, is_enemy: false },
      { id: enemyId, roll: 18, is_enemy: true },
    ],
    initiative_idx: 0,
    entities: [
      {
        id: 'pc-1',
        isEnemy: false,
        pos: { x: 4, y: 5 },
        hp: 30,
        maxHp: 30,
        conditions: [],
        condition_durations: {},
      },
      {
        id: enemyId,
        isEnemy: true,
        pos: { x: 5, y: 5 },
        hp: 40,
        maxHp: 40,
        conditions: [],
        condition_durations: {},
      },
    ],
  };
}

describe('Resilient feat — save proficiency on conditionSavingThrow', () => {
  // The stunned condition has duration 1 and is ticked off at the
  // end of the post-action sweep, so checking `char.conditions`
  // post-takeAction always shows it absent. The narrative line
  // "X is stunned!" is the visible evidence the save FAILED;
  // its absence means the save PASSED.

  it('Wizard with Resilient (CON) — save passes, no "is stunned!" in narrative', async () => {
    // d20 → 11 (random 0.5). DC 14.
    //   Without prof: 11 + 0 = 11 → fail → "is stunned!" prints.
    //   With prof at L5 (+3): 11 + 0 + 3 = 14 → pass → no stun line.
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const pc = buildPc({ resilient: true });
    const result = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state: buildState(pc),
      seed: seedWithStunGoblin,
      context: ctx,
    });
    expect(result.narrative).not.toMatch(/is stunned!/);
  });

  it('Wizard without Resilient — save fails, "is stunned!" appears (control)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const pc = buildPc({ resilient: false });
    const result = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state: buildState(pc),
      seed: seedWithStunGoblin,
      context: ctx,
    });
    expect(result.narrative).toMatch(/is stunned!/);
  });

  it('class-prof save still works (Wizard has INT/WIS prof from class)', async () => {
    // INT save — Wizard class prof gives +3 at L5. INT 14 → +2.
    // d20=11 + 5 = 16 ≥ DC 14. Save passes.
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const intSeed: Seed = {
      ...seedWithStunGoblin,
      enemies: {
        ['entry_hall']: [
          {
            ...seedWithStunGoblin.enemies['entry_hall'][0],
            onHitEffect: { condition: 'stunned', ability: 'int', dc: 14 },
          },
        ],
      },
    };
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Wizard',
      level: 5,
      int: 14,
      hp: 30,
      max_hp: 30,
    });
    const result = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state: buildState(pc),
      seed: intSeed,
      context: ctx,
    });
    expect(result.narrative).not.toMatch(/is stunned!/);
  });
});
