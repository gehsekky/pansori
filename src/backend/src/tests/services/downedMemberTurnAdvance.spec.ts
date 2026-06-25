// Regression test for the combat-freeze-downed-member bug.
//
// **Pre-fix bug:** when a 0-HP (downed/unconscious, not dead) party
// member took their turn action (death_save / pass / use), the engine
// ran a bespoke early-return that advanced `active_character_id` by a
// simple round-robin over not-dead characters and returned immediately
// — bypassing the shared `initiative_idx` advance + `runEnemyTurns`
// epilogue that every other combat action uses.
//
// Consequences:
//   1. Enemies NEVER took a turn after a downed member acted.
//   2. When the spotlight rotated back to a still-downed member (solo
//      party, or every other PC also down) the loop produced only
//      `[death_save]` / `[pass]` forever — a permanent freeze.
//
// This bit the Act I carry party hard: a *required* member (plot armor,
// only revived at combat-end) that fell mid-fight stalled the turn loop
// because there was no in-fight revive path and the enemies were frozen.
//
// SRD 5.2.1 — Dropping to 0 Hit Points / Death Saving Throws: a downed
// creature still occupies its place in the initiative order; its turn is
// spent rolling a death save. The fix makes that turn pass through the
// normal initiative advance so the rest of the combatants (enemies
// included) get their turns.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../../test-fixtures.js';
import type { Seed } from '../../types.js';
import { context as ctx } from '../fixtures/testContext.js';
import { takeAction } from '../../services/gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const enemyId = `entry_hall#0`;

const seedWithGoblin: Seed = {
  context_id: ctx.id,
  world_name: 'Downed Turn Test',
  ship_name: 'Downed Turn Test',
  intro: '',
  seed_id: 'downed-turn-test',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {
    ['entry_hall']: [
      {
        id: enemyId,
        name: 'Goblin',
        hp: 50,
        ac: 10,
        damage: '1d4',
        toHit: 20, // always hits the standing PC's AC 10
        xp: 20,
      },
    ],
  },
  loot: {},
  npcs: {},
};

describe('downed member turn advances the initiative loop (combat-freeze fix)', () => {
  it('runs enemy turns after a downed required member rolls a death save', async () => {
    // d20 mid-roll so the downed member's save succeeds (no death) and we
    // can observe whether the goblin — next in initiative — then acts.
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    // PC-1: downed, REQUIRED member (plot armor), currently active.
    const downed = makeChar({
      id: 'pc-1',
      name: 'Required Downed',
      hp: 0,
      max_hp: 20,
      conditions: ['unconscious'],
      death_saves: { successes: 0, failures: 0 },
      required: true,
    });
    // PC-2: a standing ally the goblin can attack so we can detect the
    // enemy turn by observed damage.
    const standing = makeChar({
      id: 'pc-2',
      name: 'Standing Ally',
      hp: 30,
      max_hp: 30,
      ac: 10,
    });

    const state = {
      ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
      characters: [downed, standing],
      active_character_id: 'pc-1',
      // Initiative: downed member → goblin → standing ally. After the
      // downed member's turn the goblin must act before the spotlight
      // reaches the standing ally.
      initiative_order: [
        { id: 'pc-1', roll: 20, is_enemy: false },
        { id: enemyId, roll: 10, is_enemy: true },
        { id: 'pc-2', roll: 5, is_enemy: false },
      ],
      initiative_idx: 0,
      entities: [
        {
          id: 'pc-1',
          isEnemy: false,
          pos: { x: 0, y: 0 },
          hp: 0,
          maxHp: 20,
          conditions: ['unconscious'],
          condition_durations: {},
        },
        {
          id: enemyId,
          isEnemy: true,
          pos: { x: 4, y: 5 }, // adjacent to the standing ally
          hp: 50,
          maxHp: 50,
          conditions: [],
          condition_durations: {},
        },
        {
          id: 'pc-2',
          isEnemy: false,
          pos: { x: 5, y: 5 },
          hp: 30,
          maxHp: 30,
          conditions: [],
          condition_durations: {},
        },
      ],
    };

    const result = await takeAction({
      action: { type: 'death_save' },
      history: [],
      state,
      seed: seedWithGoblin,
      context: ctx,
    });

    // The downed member's death save must still be recorded.
    const after1 = result.newState.characters.find((c) => c.id === 'pc-1')!;
    expect(after1.death_saves.successes).toBeGreaterThanOrEqual(1);

    // CORE ASSERTION: the goblin (next in initiative) took its turn.
    // Pre-fix the death-save path returned before runEnemyTurns, so the
    // standing ally took zero damage and the spotlight snapped straight to
    // the next living PC with enemies frozen.
    const after2 = result.newState.characters.find((c) => c.id === 'pc-2')!;
    expect(after2.hp).toBeLessThan(30);
    // And the spotlight should rest on a living, conscious actor for the
    // next turn (the standing ally), not loop back to the downed member.
    expect(result.newState.active_character_id).toBe('pc-2');
  });
});
