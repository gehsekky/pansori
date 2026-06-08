// Boss encounter behavior — phase transitions + legendary/lair actions.
// Extracted from gameEngine.spec.ts as part of the test-suite split
// (TODO architecture-audit follow-up #1). Self-contained: builds its own
// minimal seed + state with just the boss + one PC, no campaign data.

import type { Character, Enemy, GameState, Seed } from '../../src/types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { context as ctx } from '../../src/campaignData/sandbox.js';
import { makeChar } from '../../src/test-fixtures.js';
import { takeAction } from '../../src/services/gameEngine.js';

afterEach(() => vi.restoreAllMocks());

describe('boss phase transitions', () => {
  // Minimal seed with one room + one boss, used to exercise the phase
  // machinery without dragging in a whole campaign context.
  function makeBossSeed(bossHp: number, phaseIndex = 0): Seed {
    const boss: Enemy = {
      id: 'boss#0',
      name: 'Test Boss',
      hp: bossHp,
      maxHp: 100,
      ac: 15,
      damage: '1d6+2',
      toHit: 5,
      xp: 1000,
      multiattack: 1,
      phases: [
        {
          hpPct: 50,
          name: 'Phase Two',
          narrative: 'The boss rages.',
          effects: [
            { kind: 'set_to_hit', value: 8 },
            { kind: 'set_damage', dice: '2d6+2' },
          ],
        },
        {
          hpPct: 25,
          name: 'Phase Three',
          narrative: 'A reckless gambit.',
          effects: [
            { kind: 'heal', amount: 20 },
            { kind: 'set_ac', value: 18 },
          ],
        },
      ],
    };
    void phaseIndex;
    return {
      context_id: ctx.id,
      world_name: 'Phase Test',
      ship_name: 'Phase Test',
      intro: '',
      rooms: [
        { id: 'r', name: 'Room', desc: 'A room.', exits: [], objects: [], traps: [] },
      ] as unknown as Seed['rooms'],
      enemies: { r: [boss] },
      loot: {},
      npcs: {},
      seed_id: 'test-seed',
    };
  }

  function makeBossState(bossHp: number, phaseIndex = 0): GameState {
    const char: Character = makeChar({ id: 'pc-1', hp: 20, max_hp: 20 });
    return {
      characters: [char],
      active_character_id: char.id,
      current_room: 'r',
      visited_rooms: ['r'],
      enemies_killed: [],
      loot_taken: [],
      combat_active: true,
      initiative_order: [
        { id: char.id, roll: 18, is_enemy: false },
        { id: 'boss#0', roll: 10, is_enemy: true },
      ],
      initiative_idx: 0,
      run_log: [],
      room_log: [],
      last_choices: [],
      short_rested_rooms: [],
      long_rested: false,
      npc_attitudes: {},
      npc_talked: [],
      traps_triggered: [],
      traps_disarmed: [],
      objects_searched: [],
      flags: {},
      round: 1,
      entities: [
        {
          id: char.id,
          isEnemy: false,
          pos: { x: 0, y: 0 },
          hp: char.hp,
          maxHp: char.max_hp,
          conditions: [],
          condition_durations: {},
        },
        {
          id: 'boss#0',
          isEnemy: true,
          pos: { x: 1, y: 0 },
          hp: bossHp,
          maxHp: 100,
          conditions: [],
          condition_durations: {},
          phase_index: phaseIndex,
        },
      ],
    };
  }

  it('does not transition while hp is above the first threshold', async () => {
    const seed = makeBossSeed(80);
    const state = makeBossState(80);
    const result = await takeAction({
      action: { type: 'pass' },
      history: [],
      state,
      seed,
      context: ctx,
    });
    const bossEnt = result.newState.entities!.find((e) => e.id === 'boss#0')!;
    expect(bossEnt.phase_index ?? 0).toBe(0);
    const phaseEvents = (result.newState.combat_log ?? []).filter(
      (e) => e.kind === 'phase_transition'
    );
    expect(phaseEvents).toHaveLength(0);
    // Seed boss stats unchanged
    expect(seed.enemies.r[0].toHit).toBe(5);
    expect(seed.enemies.r[0].damage).toBe('1d6+2');
  });

  it('crosses the 50% threshold → phase_index 1, event emitted, stats updated', async () => {
    const seed = makeBossSeed(45);
    const state = makeBossState(45);
    const result = await takeAction({
      action: { type: 'pass' },
      history: [],
      state,
      seed,
      context: ctx,
    });
    const bossEnt = result.newState.entities!.find((e) => e.id === 'boss#0')!;
    expect(bossEnt.phase_index).toBe(1);
    const phaseEvents = (result.newState.combat_log ?? []).filter(
      (e) => e.kind === 'phase_transition'
    );
    expect(phaseEvents).toHaveLength(1);
    if (phaseEvents[0].kind === 'phase_transition') {
      expect(phaseEvents[0].phaseName).toBe('Phase Two');
    }
    // Seed mutated in-place — to-hit + damage bumped
    expect(seed.enemies.r[0].toHit).toBe(8);
    expect(seed.enemies.r[0].damage).toBe('2d6+2');
  });

  it('crosses the 25% threshold from phase 1 → phase_index 2 + heal applied', async () => {
    const seed = makeBossSeed(20, 1);
    const state = makeBossState(20, 1);
    const result = await takeAction({
      action: { type: 'pass' },
      history: [],
      state,
      seed,
      context: ctx,
    });
    const bossEnt = result.newState.entities!.find((e) => e.id === 'boss#0')!;
    expect(bossEnt.phase_index).toBe(2);
    // Heal of 20 applies → entity hp 20 + 20 = 40
    expect(bossEnt.hp).toBe(40);
    expect(seed.enemies.r[0].ac).toBe(18);
  });

  it('rehydrates phase 1 stats onto a fresh seed when entity.phase_index = 1', async () => {
    // Boss at 60hp (above 50% threshold) but entity tracks phase_index = 1
    // from a prior action. Rehydrate should apply Phase Two effects to the
    // seed's boss before the action resolves; the post-action sweep should
    // not re-trigger Phase Two.
    const seed = makeBossSeed(60, 1);
    const state = makeBossState(60, 1);
    const result = await takeAction({
      action: { type: 'pass' },
      history: [],
      state,
      seed,
      context: ctx,
    });
    expect(seed.enemies.r[0].toHit).toBe(8);
    expect(seed.enemies.r[0].damage).toBe('2d6+2');
    const phaseEvents = (result.newState.combat_log ?? []).filter(
      (e) => e.kind === 'phase_transition'
    );
    expect(phaseEvents).toHaveLength(0);
  });
});

// ─── Boss legendary + lair actions (SRD) ───────────────────────────────
//
// Legendary actions fire AFTER another creature's turn ends, spending
// points from a per-round pool that refreshes on the legendary creature's
// own turn. Lair actions fire on round start when a creature with
// `lair_actions` is in the current room — one randomly-picked effect.

describe('boss legendary + lair actions', () => {
  function makeBossWithLegendaryLair(): {
    seed: Seed;
    state: GameState;
  } {
    const boss: Enemy = {
      id: 'boss#0',
      name: 'Test Lich',
      hp: 60,
      maxHp: 60,
      ac: 15,
      damage: '1d6+2',
      toHit: 5,
      xp: 1000,
      multiattack: 1,
      legendary_pool: 3,
      legendary_action_points: 3,
      legendary_actions: [
        {
          id: 'swing',
          name: 'Tomb Swing',
          cost: 1,
          kind: 'extra_attack',
          narrative: 'The lich snaps off a quick blow.',
        },
      ],
      lair_actions: [
        {
          id: 'necrotic_pulse',
          name: 'Necrotic Pulse',
          kind: 'aoe_save_damage',
          dice: '2d6',
          damageType: 'necrotic',
          savingThrow: 'con',
          saveDC: 13,
          narrative: 'Tomb fog floods the room.',
        },
      ],
    };
    const seed: Seed = {
      context_id: ctx.id,
      world_name: 'Lair Test',
      ship_name: 'Lair Test',
      intro: '',
      rooms: [
        { id: 'r', name: 'Room', desc: 'A room.', exits: [], objects: [], traps: [] },
      ] as unknown as Seed['rooms'],
      enemies: { r: [boss] },
      loot: {},
      npcs: {},
      seed_id: 'lair-seed',
    };
    const char = makeChar({ id: 'pc-1', hp: 30, max_hp: 30 });
    const state: GameState = {
      characters: [char],
      active_character_id: char.id,
      current_room: 'r',
      visited_rooms: ['r'],
      enemies_killed: [],
      loot_taken: [],
      combat_active: true,
      // Both PC and boss exist; PC is idx 0 (goes first).
      initiative_order: [
        { id: char.id, roll: 20, is_enemy: false },
        { id: 'boss#0', roll: 5, is_enemy: true },
      ],
      initiative_idx: 0,
      entities: [
        {
          id: char.id,
          isEnemy: false,
          pos: { x: 1, y: 1 },
          hp: char.hp,
          maxHp: char.max_hp,
          conditions: [],
          condition_durations: {},
        },
        {
          id: 'boss#0',
          isEnemy: true,
          pos: { x: 2, y: 2 },
          hp: 60,
          maxHp: 60,
          conditions: [],
          condition_durations: {},
        },
      ],
      run_log: [],
      room_log: [],
      last_choices: [],
      short_rested_rooms: [],
      long_rested: false,
      npc_attitudes: {},
      npc_talked: [],
      traps_triggered: [],
      traps_disarmed: [],
      objects_searched: [],
      flags: {},
      round: 1,
      movement_used: {},
    };
    return { seed, state };
  }

  it('legendary action fires after a PC end_turn (narrative emitted)', async () => {
    // Force the legendary attack to MISS so the test doesn't care about
    // damage application — we just verify the legendary narrative fires.
    vi.spyOn(Math, 'random').mockReturnValue(0); // d20 → 1, miss
    const { seed, state } = makeBossWithLegendaryLair();
    const result = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state,
      seed,
      context: ctx,
    });
    expect(result.narrative).toMatch(/Legendary action.*Tomb Swing/);
    // The pool dropped from 3 → 2 when legendary fired, then refreshed
    // back to 3 on the boss's own turn (same end_turn cycle). The visible
    // end-state is the post-refresh value; we assert that here.
    expect(seed.enemies.r[0].legendary_action_points).toBe(3);
  });

  it('lair action fires on round wrap with AoE save → damage', async () => {
    // Mock d20 low so the save fails (DC 13 vs CON 10 + roll 1).
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const { seed, state } = makeBossWithLegendaryLair();
    // Round-wrap requires the enemy slot to be the last in initiative AND
    // for combat to advance through it. PC end_turn → enemy auto-acts →
    // initiative wraps to idx 0, round 2; lair fires here.
    const result = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state,
      seed,
      context: ctx,
    });
    expect(result.newState.round).toBe(2);
    expect(result.narrative).toMatch(/Lair action: Necrotic Pulse/);
    expect(result.narrative).toMatch(/Tomb fog floods the room/);
    // The PC took some damage from the failed CON save.
    expect(result.newState.characters[0].hp).toBeLessThan(30);
  });

  it('legendary pool refreshes when the boss takes its own turn', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // misses
    const { seed, state } = makeBossWithLegendaryLair();
    // Burn 2 points: pre-drain to 1 so we can verify it bumps to 3 again.
    seed.enemies.r[0].legendary_action_points = 1;
    const result = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state,
      seed,
      context: ctx,
    });
    // After the PC end_turn the enemy goes; entering its turn refreshes
    // the pool to 3, then the legendary-after-PC fired BEFORE the refresh
    // (since runEnemyTurns advances after the legendary).
    // Net: legendary spent 1 (pool 1 → 0), then enemy turn refreshed to 3.
    expect(seed.enemies.r[0].legendary_action_points).toBe(3);
    expect(result.newState.round).toBe(2);
  });
});
