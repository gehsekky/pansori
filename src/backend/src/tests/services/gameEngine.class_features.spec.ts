// Class features tests — Sorcerer, Warlock, Barbarian, Rogue, Fighter,
// Cleric, Monk, Paladin, Ranger, Bard, Druid features dispatched via
// `use_class_feature`. Extracted from gameEngine.spec.ts as part of
// the test-suite split (TODO architecture-audit follow-up #1). Future
// per-class colocations under `services/actions/classFeature/*.spec.ts`
// can pull from this consolidated extraction.

import {
  CORRIDOR_ID,
  ctxWithRage,
  dungeonSeedWithEnemy,
  makeChar,
  makeState,
  baseSandboxSeed as seed,
  seedWithEnemy,
  withAdjacentEntities,
} from '../../test-fixtures.js';
import type { GameState, Seed } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateChoices, takeAction } from '../../services/gameEngine.js';
import { context as ctx } from '../fixtures/testContext.js';

afterEach(() => vi.restoreAllMocks());

// ─── Class features ───────────────────────────────────────────────────────────

// `ctxWithRage` and `dungeonSeedWithEnemy` live in test-fixtures.ts.

describe('class features', () => {
  // ── Sorcerer subclasses (SRD Chapter 3) ─────────────────────────────────────

  it('Sorcerer Draconic Bloodline grants +1 HP per level via select_subclass', async () => {
    const state = makeState({
      character_class: 'Sorcerer',
      level: 3,
      hp: 18,
      max_hp: 18,
    });
    const result = await takeAction({
      action: { type: 'select_subclass', subclass: 'draconic' },
      history: [],
      state,
      seed,
      context: ctx,
    });
    expect(result.newState.characters[0].subclass).toBe('draconic');
    expect(result.newState.characters[0].max_hp).toBe(21); // 18 + 3 (level)
    expect(result.newState.characters[0].hp).toBe(21);
    expect(result.narrative).toMatch(/Draconic Resilience/);
  });

  it('non-Sorcerer Draconic select does NOT grant the HP bonus', async () => {
    const state = makeState({ character_class: 'Fighter', level: 5, hp: 30, max_hp: 30 });
    const result = await takeAction({
      action: { type: 'select_subclass', subclass: 'draconic' },
      history: [],
      state,
      seed,
      context: ctx,
    });
    expect(result.newState.characters[0].max_hp).toBe(30); // unchanged
  });

  // ── Warlock subclasses (SRD Chapter 3) ──────────────────────────────────────

  it("Fiend Warlock — Dark One's Blessing: temp HP on kill = level + CHA mod", async () => {
    // CHA 18 (+4) at L3 → grant 7 temp HP on kill. Force a hit + lethal damage.
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    const warlockId = 'wl1';
    const goblinId = `${CORRIDOR_ID}#0`;
    const wl = makeChar({
      id: warlockId,
      character_class: 'Warlock',
      subclass: 'fiend',
      level: 3,
      cha: 18,
      hp: 20,
      max_hp: 20,
      temp_hp: 0,
      equipment: { main_hand: 'wl-dagger' },
      inventory: [{ instance_id: 'wl-dagger', id: 'dagger', name: 'Dagger' }],
    });
    const state: GameState = {
      characters: [wl],
      active_character_id: warlockId,
      current_room: CORRIDOR_ID,
      visited_rooms: ['entry_hall', CORRIDOR_ID],
      enemies_killed: [],
      loot_taken: [],
      combat_active: true,
      initiative_order: [
        { id: warlockId, roll: 18, is_enemy: false },
        { id: goblinId, roll: 5, is_enemy: true },
      ],
      initiative_idx: 0,
      entities: [
        {
          id: warlockId,
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
          hp: 1, // 1 HP — any hit kills
          maxHp: 10,
          conditions: [],
          condition_durations: {},
        },
      ],
      movement_used: {},
      run_log: [],
      room_log: [],
      last_choices: [],
      flags: {},
      short_rested_rooms: [],
      long_rested: false,
      npc_attitudes: {},
      npc_talked: [],
      traps_triggered: [],
      traps_disarmed: [],
      objects_searched: [],
    };
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: goblinId },
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });
    expect(result.narrative).toMatch(/Dark One's Blessing/);
    // L3 + CHA mod (+4) = 7 temp HP
    expect(result.newState.characters[0].temp_hp).toBe(7);
  });

  it("non-Fiend Warlock kill does NOT grant Dark One's Blessing", async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    const warlockId = 'wl1';
    const goblinId = `${CORRIDOR_ID}#0`;
    const wl = makeChar({
      id: warlockId,
      character_class: 'Warlock',
      // No subclass — verifies the Fiend-only gating without
      // needing a non-iconic subclass (all non-Fiend Warlock
      // subclasses are PHB-only and removed in Phase 2K).
      level: 3,
      cha: 18,
      temp_hp: 0,
      equipment: { main_hand: 'wl-dagger2' },
      inventory: [{ instance_id: 'wl-dagger2', id: 'dagger', name: 'Dagger' }],
    });
    const state: GameState = {
      characters: [wl],
      active_character_id: warlockId,
      current_room: CORRIDOR_ID,
      visited_rooms: ['entry_hall', CORRIDOR_ID],
      enemies_killed: [],
      loot_taken: [],
      combat_active: true,
      initiative_order: [
        { id: warlockId, roll: 18, is_enemy: false },
        { id: goblinId, roll: 5, is_enemy: true },
      ],
      initiative_idx: 0,
      entities: [
        {
          id: warlockId,
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
          hp: 1,
          maxHp: 10,
          conditions: [],
          condition_durations: {},
        },
      ],
      movement_used: {},
      run_log: [],
      room_log: [],
      last_choices: [],
      flags: {},
      short_rested_rooms: [],
      long_rested: false,
      npc_attitudes: {},
      npc_talked: [],
      traps_triggered: [],
      traps_disarmed: [],
      objects_searched: [],
    };
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: goblinId },
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });
    expect(result.narrative).not.toMatch(/Dark One's Blessing/);
    expect(result.newState.characters[0].temp_hp ?? 0).toBe(0);
  });

  // ── Druid subclasses (SRD-69) ──────────────────────────────────────────

  it('Base Druid Wild Shape — temp HP = 2 × druid level (SRD)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const druidId = 'd-base';
    const druid = makeChar({
      id: druidId,
      character_class: 'Druid',
      subclass: 'land', // not Moon
      level: 8,
      hp: 40,
      max_hp: 40,
      class_resource_uses: { wild_shape: 2 },
    });
    const state = makeState({}, { characters: [druid], active_character_id: druidId });
    state.characters = [druid];
    state.active_character_id = druidId;
    const result = await takeAction({
      action: { type: 'use_class_feature', featureId: 'wild_shape' },
      history: [],
      state,
      seed,
      context: ctx,
    });
    const newDruid = result.newState.characters[0];
    expect(newDruid.conditions).toContain('wild_shaped');
    // 2024 base: 2 × level 8 = 16 temp HP on top of 40 → 56.
    expect(newDruid.hp).toBe(56);
  });

  it('Wild Shape: black_bear at L4 grants physical resistance + records the form', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const druidId = 'd-bear';
    const druid = makeChar({
      id: druidId,
      character_class: 'Druid',
      subclass: 'land',
      level: 4,
      hp: 20,
      max_hp: 20,
      class_resource_uses: { wild_shape: 2 },
    });
    const state = makeState({}, { characters: [druid], active_character_id: druidId });
    state.characters = [druid];
    state.active_character_id = druidId;
    const result = await takeAction({
      action: { type: 'use_class_feature', featureId: 'wild_shape_black_bear' },
      history: [],
      state,
      seed,
      context: ctx,
    });
    const newDruid = result.newState.characters[0];
    expect(newDruid.conditions).toContain('wild_shaped');
    expect(newDruid.wild_shape_form).toBe('black_bear');
    expect(result.narrative).toMatch(/Black Bear/);
    expect(result.narrative).toMatch(/Physical Resistance/);
  });

  it('Wild Shape: refuses a too-high-CR form for a base druid', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const druidId = 'd-low';
    const druid = makeChar({
      id: druidId,
      character_class: 'Druid',
      subclass: 'land',
      level: 1, // max CR = 0.25; brown_bear is CR 1
      hp: 10,
      max_hp: 10,
      class_resource_uses: { wild_shape: 2 },
    });
    const state = makeState({}, { characters: [druid], active_character_id: druidId });
    state.characters = [druid];
    state.active_character_id = druidId;
    const result = await takeAction({
      action: { type: 'use_class_feature', featureId: 'wild_shape_brown_bear' },
      history: [],
      state,
      seed,
      context: ctx,
    });
    expect(result.narrative).toMatch(/higher-CR form access/);
    expect(result.newState.characters[0].conditions).not.toContain('wild_shaped');
  });

  it('Circle of the Land — Natural Recovery refunds chosen slot levels (recover_slots)', async () => {
    const druidId = 'd-land';
    const druid = makeChar({
      id: druidId,
      character_class: 'Druid',
      subclass: 'land',
      level: 4, // budget = ceil(4/2) = 2 slot levels
      hp: 20,
      max_hp: 30,
      spell_slots_max: { 1: 4, 2: 3 },
      // Use 2 L1s and 1 L2 — default (lowest-first) plan recovers 2× L1 = 2 levels.
      spell_slots_used: { 1: 2, 2: 1 },
    });
    const state = makeState({}, { characters: [druid], active_character_id: druidId });
    state.characters = [druid];
    state.active_character_id = druidId;
    const result = await takeAction({
      action: { type: 'recover_slots', recovery: 'natural' },
      history: [],
      state,
      seed,
      context: ctx,
    });
    const newDruid = result.newState.characters[0];
    // L1 slots refunded back to 0 used; L2 untouched.
    expect(newDruid.spell_slots_used?.[1] ?? 0).toBe(0);
    expect(newDruid.spell_slots_used?.[2] ?? 0).toBe(1);
    expect(newDruid.class_resource_uses?.natural_recovery_used).toBe(1);
    expect(result.narrative).toMatch(/Natural Recovery/);
  });

  it('Circle of the Land — Natural Recovery is rejected once already used this long rest', async () => {
    const druidId = 'd-land-twice';
    const druid = makeChar({
      id: druidId,
      character_class: 'Druid',
      subclass: 'land',
      level: 4,
      hp: 20,
      max_hp: 30,
      spell_slots_max: { 1: 4 },
      spell_slots_used: { 1: 3 },
      class_resource_uses: { natural_recovery_used: 1 }, // already used today
    });
    const state = makeState({}, { characters: [druid], active_character_id: druidId });
    state.characters = [druid];
    state.active_character_id = druidId;
    const result = await takeAction({
      action: { type: 'recover_slots', recovery: 'natural' },
      history: [],
      state,
      seed,
      context: ctx,
    });
    const newDruid = result.newState.characters[0];
    // Slots NOT refunded
    expect(newDruid.spell_slots_used?.[1]).toBe(3);
    expect(result.narrative).toMatch(/isn't available/i);
  });

  // ── Monk subclasses (SRD-80) ───────────────────────────────────────────

  it('Way of the Open Hand — Flurry hits force DEX save or prone', async () => {
    // All rolls high → strikes auto-hit (AC 12), DEX saves auto-pass.
    // Test asserts the Open Hand DEX-save branch fires (either prone
    // or resist path emits "Open Hand:" prose), not the save outcome.
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const monkId = 'mk-oh';
    const goblinId = `${CORRIDOR_ID}#0`;
    const monk = makeChar({
      id: monkId,
      character_class: 'Monk',
      subclass: 'open_hand',
      level: 3,
      hp: 20,
      max_hp: 20,
      str: 10,
      dex: 16,
      wis: 14,
      class_resource_uses: { ki_points: 3 },
      turn_actions: {
        action_used: true, // Flurry requires the Attack action be used first
        bonus_action_used: false,
        reaction_used: false,
        free_interaction_used: false,
      },
    });
    const state: GameState = {
      characters: [monk],
      active_character_id: monkId,
      current_room: CORRIDOR_ID,
      visited_rooms: ['entry_hall', CORRIDOR_ID],
      enemies_killed: [],
      loot_taken: [],
      combat_active: true,
      initiative_order: [
        { id: monkId, roll: 18, is_enemy: false },
        { id: goblinId, roll: 5, is_enemy: true },
      ],
      initiative_idx: 0,
      entities: [
        {
          id: monkId,
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
          hp: 50, // big enough to survive a hit so we see the prone effect
          maxHp: 50,
          conditions: [],
          condition_durations: {},
        },
      ],
      movement_used: {},
      run_log: [],
      room_log: [],
      last_choices: [],
      flags: {},
      short_rested_rooms: [],
      long_rested: false,
      npc_attitudes: {},
      npc_talked: [],
      traps_triggered: [],
      traps_disarmed: [],
      objects_searched: [],
    };
    const result = await takeAction({
      action: { type: 'use_class_feature', featureId: 'flurry_of_blows' },
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });
    // With the entity-lookup fix (ctx.enemy.id instead of ctx.roomId,
    // shipped 2026-05-22), Flurry actually lands damage and the Open
    // Hand DEX-save rider fires on every hit. Pre-fix this assertion
    // was wrapped in an `if (narrative.includes(...))` guard that was
    // vacuous because the rider never reached its branch.
    expect(result.narrative).toMatch(/Open Hand:/);
  });

  // ── Barbarian subclasses (SRD-51) ──────────────────────────────────────

  it('Path of the Berserker — Frenzy makes a bonus-action melee attack while raging', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999); // d20 → 20, dmg max
    const barbId = 'b-zerk';
    const daggerInst = 'b-dagger';
    const barb = makeChar({
      id: barbId,
      character_class: 'Barbarian',
      subclass: 'berserker',
      level: 3,
      hp: 30,
      max_hp: 30,
      str: 16,
      conditions: ['raging'],
      equipment: { main_hand: daggerInst },
      inventory: [{ instance_id: daggerInst, id: 'dagger', name: 'Dagger' }],
      turn_actions: {
        action_used: true, // attacked already this turn
        bonus_action_used: false,
        reaction_used: false,
        free_interaction_used: false,
      },
    });
    const goblinId = `${CORRIDOR_ID}#0`;
    const state: GameState = {
      characters: [barb],
      active_character_id: barbId,
      current_room: CORRIDOR_ID,
      visited_rooms: ['entry_hall', CORRIDOR_ID],
      enemies_killed: [],
      loot_taken: [],
      combat_active: true,
      initiative_order: [
        { id: barbId, roll: 18, is_enemy: false },
        { id: goblinId, roll: 5, is_enemy: true },
      ],
      initiative_idx: 0,
      entities: [
        {
          id: barbId,
          isEnemy: false,
          pos: { x: 4, y: 5 },
          hp: 30,
          maxHp: 30,
          conditions: [],
          condition_durations: {},
        },
        {
          id: goblinId,
          isEnemy: true,
          pos: { x: 5, y: 5 },
          hp: 50,
          maxHp: 50,
          conditions: [],
          condition_durations: {},
        },
      ],
      movement_used: {},
      run_log: [],
      room_log: [],
      last_choices: [],
      flags: {},
      short_rested_rooms: [],
      long_rested: false,
      npc_attitudes: {},
      npc_talked: [],
      traps_triggered: [],
      traps_disarmed: [],
      objects_searched: [],
    };
    const result = await takeAction({
      action: { type: 'use_class_feature', featureId: 'frenzy_attack' },
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });
    expect(result.narrative).toMatch(/Frenzy/);
    const newBarb = result.newState.characters[0];
    expect(newBarb.turn_actions.bonus_action_used).toBe(true);
    const goblinEnt = result.newState.entities?.find((e) => e.id === goblinId);
    expect(goblinEnt?.hp).toBeLessThan(50); // damage applied
  });

  it('Path of the Berserker — Frenzy refused when not raging', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const barbId = 'b-no-rage';
    const barb = makeChar({
      id: barbId,
      character_class: 'Barbarian',
      subclass: 'berserker',
      level: 3,
      hp: 30,
      max_hp: 30,
      // not raging
    });
    const state = makeState({}, { characters: [barb], active_character_id: barbId });
    state.characters = [barb];
    state.active_character_id = barbId;
    const result = await takeAction({
      action: { type: 'use_class_feature', featureId: 'frenzy_attack' },
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });
    expect(result.narrative).toMatch(/must be raging/i);
  });

  // ── Combat event log ────────────────────────────────────────────────────────

  it('emits attack_hit + kill events on a successful PC attack', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999); // d20 → 20, max damage
    const charId = 'p1';
    const dagger = 'p1-dag';
    const fighter = makeChar({
      id: charId,
      character_class: 'Fighter',
      level: 3,
      str: 16,
      equipment: { main_hand: dagger },
      inventory: [{ instance_id: dagger, id: 'dagger', name: 'Dagger' }],
    });
    const goblinId = `${CORRIDOR_ID}#0`;
    const state: GameState = {
      characters: [fighter],
      active_character_id: charId,
      current_room: CORRIDOR_ID,
      visited_rooms: ['entry_hall', CORRIDOR_ID],
      enemies_killed: [],
      loot_taken: [],
      combat_active: true,
      initiative_order: [
        { id: charId, roll: 18, is_enemy: false },
        { id: goblinId, roll: 5, is_enemy: true },
      ],
      initiative_idx: 0,
      entities: [
        {
          id: charId,
          isEnemy: false,
          pos: { x: 4, y: 5 },
          hp: 30,
          maxHp: 30,
          conditions: [],
          condition_durations: {},
        },
        {
          id: goblinId,
          isEnemy: true,
          pos: { x: 5, y: 5 },
          hp: 1, // any hit kills
          maxHp: 10,
          conditions: [],
          condition_durations: {},
        },
      ],
      movement_used: {},
      run_log: [],
      room_log: [],
      last_choices: [],
      flags: {},
      short_rested_rooms: [],
      long_rested: false,
      npc_attitudes: {},
      npc_talked: [],
      traps_triggered: [],
      traps_disarmed: [],
      objects_searched: [],
      round: 1,
    };
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: goblinId },
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });
    const events = result.newState.combat_log ?? [];
    expect(events.some((e) => e.kind === 'attack_hit')).toBe(true);
    expect(events.some((e) => e.kind === 'kill')).toBe(true);
    const killEvent = events.find((e) => e.kind === 'kill');
    if (killEvent && killEvent.kind === 'kill') {
      expect(killEvent.victimId).toBe(goblinId);
      expect(killEvent.attackerId).toBe(charId);
    }
  });

  it('emits attack_miss on a PC attack that fails to-hit', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // d20 → 1, fumble
    const charId = 'p1-miss';
    const fighter = makeChar({
      id: charId,
      character_class: 'Fighter',
      level: 1,
      equipment: { main_hand: 'wp' },
      inventory: [{ instance_id: 'wp', id: 'dagger', name: 'Dagger' }],
    });
    const goblinId = `${CORRIDOR_ID}#0`;
    const state: GameState = {
      characters: [fighter],
      active_character_id: charId,
      current_room: CORRIDOR_ID,
      visited_rooms: ['entry_hall', CORRIDOR_ID],
      enemies_killed: [],
      loot_taken: [],
      combat_active: true,
      initiative_order: [
        { id: charId, roll: 18, is_enemy: false },
        { id: goblinId, roll: 5, is_enemy: true },
      ],
      initiative_idx: 0,
      entities: [
        {
          id: charId,
          isEnemy: false,
          pos: { x: 4, y: 5 },
          hp: 30,
          maxHp: 30,
          conditions: [],
          condition_durations: {},
        },
        {
          id: goblinId,
          isEnemy: true,
          pos: { x: 5, y: 5 },
          hp: 100,
          maxHp: 100,
          conditions: [],
          condition_durations: {},
        },
      ],
      movement_used: {},
      run_log: [],
      room_log: [],
      last_choices: [],
      flags: {},
      short_rested_rooms: [],
      long_rested: false,
      npc_attitudes: {},
      npc_talked: [],
      traps_triggered: [],
      traps_disarmed: [],
      objects_searched: [],
      round: 1,
    };
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: goblinId },
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });
    const events = result.newState.combat_log ?? [];
    expect(events.some((e) => e.kind === 'attack_miss')).toBe(true);
  });

  it('Stunning Strike emits a save event and a condition_applied event on fail', async () => {
    // d20=1 (random=0) → enemy CON save fails the DC = 8+prof+wis_mod.
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const charId = 'monk-stun';
    const monk = makeChar({
      id: charId,
      character_class: 'Monk',
      level: 5,
      wis: 16,
      class_resource_uses: { ki_points: 3 },
      turn_actions: {
        action_used: true,
        bonus_action_used: false,
        reaction_used: false,
        free_interaction_used: false,
      },
    });
    const goblinId = `${CORRIDOR_ID}#0`;
    const state: GameState = {
      characters: [monk],
      active_character_id: charId,
      current_room: CORRIDOR_ID,
      visited_rooms: ['entry_hall', CORRIDOR_ID],
      enemies_killed: [],
      loot_taken: [],
      combat_active: true,
      initiative_order: [
        { id: charId, roll: 18, is_enemy: false },
        { id: goblinId, roll: 5, is_enemy: true },
      ],
      initiative_idx: 0,
      entities: [
        {
          id: charId,
          isEnemy: false,
          pos: { x: 4, y: 5 },
          hp: 30,
          maxHp: 30,
          conditions: [],
          condition_durations: {},
        },
        {
          id: goblinId,
          isEnemy: true,
          pos: { x: 5, y: 5 },
          hp: 100,
          maxHp: 100,
          conditions: [],
          condition_durations: {},
        },
      ],
      movement_used: {},
      run_log: [],
      room_log: [],
      last_choices: [],
      flags: {},
      short_rested_rooms: [],
      long_rested: false,
      npc_attitudes: {},
      npc_talked: [],
      traps_triggered: [],
      traps_disarmed: [],
      objects_searched: [],
      round: 1,
    };
    const result = await takeAction({
      action: { type: 'use_class_feature', featureId: 'stunning_strike' },
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });
    const events = result.newState.combat_log ?? [];
    const saveEvent = events.find((e) => e.kind === 'save');
    expect(saveEvent).toBeDefined();
    if (saveEvent && saveEvent.kind === 'save') {
      expect(saveEvent.ability).toBe('con');
      expect(saveEvent.vs).toBe('Stunning Strike');
      expect(saveEvent.success).toBe(false); // d20=1 always fails
    }
    const condEvent = events.find((e) => e.kind === 'condition_applied');
    expect(condEvent).toBeDefined();
    if (condEvent && condEvent.kind === 'condition_applied') {
      expect(condEvent.condition).toBe('stunned');
      expect(condEvent.targetId).toBe(goblinId);
      expect(condEvent.source).toBe('Stunning Strike');
    }
  });

  it('combat_log is capped at COMBAT_LOG_MAX entries', async () => {
    // Pre-fill the log past the cap and confirm pushEvent trims.
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    const charId = 'p1-cap';
    const fighter = makeChar({
      id: charId,
      character_class: 'Fighter',
      level: 3,
      equipment: { main_hand: 'wp' },
      inventory: [{ instance_id: 'wp', id: 'dagger', name: 'Dagger' }],
    });
    const goblinId = `${CORRIDOR_ID}#0`;
    const fullLog = Array.from({ length: 35 }, (_, i) => ({
      kind: 'attack_miss' as const,
      attackerId: 'old',
      attackerName: 'Past Hero',
      targetId: 'foo',
      targetName: 'Past Foe',
      toHit: 5,
      targetAc: 15,
      round: i,
    }));
    const state: GameState = {
      characters: [fighter],
      active_character_id: charId,
      current_room: CORRIDOR_ID,
      visited_rooms: ['entry_hall', CORRIDOR_ID],
      enemies_killed: [],
      loot_taken: [],
      combat_active: true,
      initiative_order: [
        { id: charId, roll: 18, is_enemy: false },
        { id: goblinId, roll: 5, is_enemy: true },
      ],
      initiative_idx: 0,
      entities: [
        {
          id: charId,
          isEnemy: false,
          pos: { x: 4, y: 5 },
          hp: 30,
          maxHp: 30,
          conditions: [],
          condition_durations: {},
        },
        {
          id: goblinId,
          isEnemy: true,
          pos: { x: 5, y: 5 },
          hp: 50,
          maxHp: 50,
          conditions: [],
          condition_durations: {},
        },
      ],
      movement_used: {},
      run_log: [],
      room_log: [],
      last_choices: [],
      flags: {},
      short_rested_rooms: [],
      long_rested: false,
      npc_attitudes: {},
      npc_talked: [],
      traps_triggered: [],
      traps_disarmed: [],
      objects_searched: [],
      round: 100,
      combat_log: fullLog,
    };
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: goblinId },
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });
    const log = result.newState.combat_log ?? [];
    expect(log.length).toBeLessThanOrEqual(30);
    // Old entries should have been evicted from the front.
    expect(log[0].round).toBeGreaterThan(0);
  });

  // ── Shield (reactive spell, SRD) ──────────────────────────────────────

  it('Shield reaction window opens when enemy hits within [AC, AC+4]', async () => {
    // Enemy attack roll: d20=15, toHit +3 → total 18. PC AC 16 → total in window (16-20).
    // PC has Shield prepared + L1 slot → pending_reaction should be set.
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.74) // d20 → 15 (toHit total = 18 vs AC 16 → hit in window)
      .mockReturnValue(0.5);
    const wizId = 'wiz1';
    const goblinId = `${CORRIDOR_ID}#0`;
    const wiz = makeChar({
      id: wizId,
      character_class: 'Wizard',
      level: 3,
      ac: 16,
      max_hp: 18,
      hp: 18,
      spells_known: ['shield'],
      prepared_spells: ['shield'],
      spell_slots_max: { 1: 4, 2: 2 },
      spell_slots_used: {},
    });
    const state: GameState = {
      characters: [wiz],
      active_character_id: wizId,
      current_room: CORRIDOR_ID,
      visited_rooms: ['entry_hall', CORRIDOR_ID],
      enemies_killed: [],
      loot_taken: [],
      combat_active: true,
      // Enemy goes next so usedInitiative + advance triggers the enemy turn.
      initiative_order: [
        { id: wizId, roll: 18, is_enemy: false },
        { id: goblinId, roll: 5, is_enemy: true },
      ],
      initiative_idx: 0,
      entities: [
        {
          id: wizId,
          isEnemy: false,
          pos: { x: 4, y: 5 },
          hp: 18,
          maxHp: 18,
          conditions: [],
          condition_durations: {},
        },
        {
          id: goblinId,
          isEnemy: true,
          pos: { x: 5, y: 5 },
          hp: 10,
          maxHp: 10,
          conditions: [],
          condition_durations: {},
        },
      ],
      movement_used: {},
      run_log: [],
      room_log: [],
      last_choices: [],
      flags: {},
      short_rested_rooms: [],
      long_rested: false,
      npc_attitudes: {},
      npc_talked: [],
      traps_triggered: [],
      traps_disarmed: [],
      objects_searched: [],
    };
    // PC ends their turn; goblin attacks; Shield window should fire.
    const result = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });
    expect(result.newState.pending_reaction).toBeDefined();
    expect(result.newState.pending_reaction?.kind).toBe('shield');
    if (result.newState.pending_reaction?.kind === 'shield') {
      expect(result.newState.pending_reaction.targetCharId).toBe(wizId);
    }
    expect(result.newState.active_character_id).toBe(wizId);
  });

  it('Accepting Shield consumes a slot + reaction, bumps AC by 5, attack misses', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const wizId = 'wiz2';
    const goblinId = `${CORRIDOR_ID}#0`;
    const wiz = makeChar({
      id: wizId,
      character_class: 'Wizard',
      level: 3,
      ac: 14,
      max_hp: 18,
      hp: 18,
      spells_known: ['shield'],
      prepared_spells: ['shield'],
      spell_slots_max: { 1: 4 },
      spell_slots_used: {},
      turn_actions: {
        action_used: true,
        bonus_action_used: false,
        reaction_used: false,
        free_interaction_used: false,
      },
    });
    const state: GameState = {
      characters: [wiz],
      active_character_id: wizId,
      current_room: CORRIDOR_ID,
      visited_rooms: ['entry_hall', CORRIDOR_ID],
      enemies_killed: [],
      loot_taken: [],
      combat_active: true,
      initiative_order: [
        { id: wizId, roll: 18, is_enemy: false },
        { id: goblinId, roll: 5, is_enemy: true },
      ],
      initiative_idx: 0,
      entities: [
        {
          id: wizId,
          isEnemy: false,
          pos: { x: 4, y: 5 },
          hp: 18,
          maxHp: 18,
          conditions: [],
          condition_durations: {},
        },
        {
          id: goblinId,
          isEnemy: true,
          pos: { x: 5, y: 5 },
          hp: 10,
          maxHp: 10,
          conditions: [],
          condition_durations: {},
        },
      ],
      pending_reaction: {
        kind: 'shield',
        attackerEnemyId: goblinId,
        targetCharId: wizId,
        atkTotal: 16,
        targetAcAtAttack: 14,
        pendingFragment: {
          kind: 'enemy_attack_hit',
          attackerEnemyId: goblinId,
          attackerName: 'Goblin',
          targetCharId: wizId,
          targetName: wiz.name,
          damage: 5,
          damageType: 'physical',
          atkTotal: 16,
          targetAc: 14,
          prose: 'The Goblin hits for 5 damage.',
        },
        pendingProposedChar: { ...wiz, hp: 13 },
        pendingProposedSt: {
          characters: [{ ...wiz, hp: 13 }],
          entities: [
            {
              id: wizId,
              isEnemy: false,
              pos: { x: 4, y: 5 },
              hp: 13,
              maxHp: 18,
              conditions: [],
              condition_durations: {},
            },
            {
              id: goblinId,
              isEnemy: true,
              pos: { x: 5, y: 5 },
              hp: 10,
              maxHp: 10,
              conditions: [],
              condition_durations: {},
            },
          ],
          round: 1,
        } as unknown as GameState,
        resumeFromInitiativeIdx: 1,
        resumeFromMultiattackIdx: 1, // multi-attack done; resume just advances past goblin
        narrativeSoFar: "[Goblin's turn]",
        eligibleCharIds: [wizId],
      },
      movement_used: {},
      run_log: [],
      room_log: [],
      last_choices: [],
      flags: {},
      short_rested_rooms: [],
      long_rested: false,
      npc_attitudes: {},
      npc_talked: [],
      traps_triggered: [],
      traps_disarmed: [],
      objects_searched: [],
    };
    const result = await takeAction({
      action: { type: 'resolve_reaction', accept: true },
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });
    expect(result.narrative).toMatch(/SHIELD/);
    const newWiz = result.newState.characters[0];
    expect(newWiz.spell_slots_used?.[1]).toBe(1);
    expect(newWiz.turn_actions.reaction_used).toBe(true);
    expect(newWiz.ac).toBe(19); // 14 + 5
    expect(newWiz.hp).toBe(18); // damage NOT applied
    expect(result.newState.pending_reaction).toBeUndefined();
  });

  it('Declining Shield applies the pending damage', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const wizId = 'wiz3';
    const goblinId = `${CORRIDOR_ID}#0`;
    const wiz = makeChar({
      id: wizId,
      character_class: 'Wizard',
      level: 3,
      ac: 14,
      max_hp: 18,
      hp: 18,
      spells_known: ['shield'],
      prepared_spells: ['shield'],
      spell_slots_max: { 1: 4 },
      spell_slots_used: {},
      turn_actions: {
        action_used: true,
        bonus_action_used: false,
        reaction_used: false,
        free_interaction_used: false,
      },
    });
    const state: GameState = {
      characters: [wiz],
      active_character_id: wizId,
      current_room: CORRIDOR_ID,
      visited_rooms: ['entry_hall', CORRIDOR_ID],
      enemies_killed: [],
      loot_taken: [],
      combat_active: true,
      initiative_order: [
        { id: wizId, roll: 18, is_enemy: false },
        { id: goblinId, roll: 5, is_enemy: true },
      ],
      initiative_idx: 0,
      entities: [
        {
          id: wizId,
          isEnemy: false,
          pos: { x: 4, y: 5 },
          hp: 18,
          maxHp: 18,
          conditions: [],
          condition_durations: {},
        },
        {
          id: goblinId,
          isEnemy: true,
          pos: { x: 5, y: 5 },
          hp: 10,
          maxHp: 10,
          conditions: [],
          condition_durations: {},
        },
      ],
      pending_reaction: {
        kind: 'shield',
        attackerEnemyId: goblinId,
        targetCharId: wizId,
        atkTotal: 16,
        targetAcAtAttack: 14,
        pendingFragment: {
          kind: 'enemy_attack_hit',
          attackerEnemyId: goblinId,
          attackerName: 'Goblin',
          targetCharId: wizId,
          targetName: wiz.name,
          damage: 5,
          damageType: 'physical',
          atkTotal: 16,
          targetAc: 14,
          prose: 'The Goblin hits for 5 damage.',
        },
        pendingProposedChar: { ...wiz, hp: 13 },
        pendingProposedSt: {
          characters: [{ ...wiz, hp: 13 }],
          entities: [
            {
              id: wizId,
              isEnemy: false,
              pos: { x: 4, y: 5 },
              hp: 13,
              maxHp: 18,
              conditions: [],
              condition_durations: {},
            },
            {
              id: goblinId,
              isEnemy: true,
              pos: { x: 5, y: 5 },
              hp: 10,
              maxHp: 10,
              conditions: [],
              condition_durations: {},
            },
          ],
          round: 1,
        } as unknown as GameState,
        resumeFromInitiativeIdx: 1,
        resumeFromMultiattackIdx: 1,
        narrativeSoFar: "[Goblin's turn]",
        eligibleCharIds: [wizId],
      },
      movement_used: {},
      run_log: [],
      room_log: [],
      last_choices: [],
      flags: {},
      short_rested_rooms: [],
      long_rested: false,
      npc_attitudes: {},
      npc_talked: [],
      traps_triggered: [],
      traps_disarmed: [],
      objects_searched: [],
    };
    const result = await takeAction({
      action: { type: 'resolve_reaction', accept: false },
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });
    const newWiz = result.newState.characters[0];
    expect(newWiz.hp).toBe(13); // 18 - 5
    expect(newWiz.ac).toBe(14); // unchanged
    expect(newWiz.spell_slots_used?.[1] ?? 0).toBe(0);
    expect(newWiz.turn_actions.reaction_used).toBe(false);
    expect(result.newState.pending_reaction).toBeUndefined();
  });

  // ── Hellish Rebuke (reactive spell, SRD) ──────────────────────────────

  it('Accepting Hellish Rebuke consumes slot + reaction and damages attacker', async () => {
    // Force d20 → max (20) for all rolls so the enemy fails the DEX save and
    // damage rolls high. CHA 16 → spell save DC = 8 + 2 (prof) + 3 = 13.
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    const wlId = 'wl1';
    const goblinId = `${CORRIDOR_ID}#0`;
    const wl = makeChar({
      id: wlId,
      character_class: 'Warlock',
      level: 3,
      cha: 16,
      hp: 10,
      max_hp: 18,
      spells_known: ['hellish_rebuke'],
      prepared_spells: ['hellish_rebuke'],
      spell_slots_max: { 1: 2 },
      spell_slots_used: {},
    });
    const state: GameState = {
      characters: [wl],
      active_character_id: wlId,
      current_room: CORRIDOR_ID,
      visited_rooms: ['entry_hall', CORRIDOR_ID],
      enemies_killed: [],
      loot_taken: [],
      combat_active: true,
      initiative_order: [
        { id: wlId, roll: 18, is_enemy: false },
        { id: goblinId, roll: 5, is_enemy: true },
      ],
      initiative_idx: 1,
      entities: [
        {
          id: wlId,
          isEnemy: false,
          pos: { x: 4, y: 5 },
          hp: 10,
          maxHp: 18,
          conditions: [],
          condition_durations: {},
        },
        {
          id: goblinId,
          isEnemy: true,
          pos: { x: 5, y: 5 },
          hp: 30,
          maxHp: 30,
          conditions: [],
          condition_durations: {},
        },
      ],
      pending_reaction: {
        kind: 'hellish_rebuke',
        attackerEnemyId: goblinId,
        targetCharId: wlId,
        resumeFromInitiativeIdx: 1,
        resumeFromMultiattackIdx: 1,
        narrativeSoFar: "[Goblin's turn]",
        eligibleCharIds: [wlId],
      },
      movement_used: {},
      run_log: [],
      room_log: [],
      last_choices: [],
      flags: {},
      short_rested_rooms: [],
      long_rested: false,
      npc_attitudes: {},
      npc_talked: [],
      traps_triggered: [],
      traps_disarmed: [],
      objects_searched: [],
    };
    const result = await takeAction({
      action: { type: 'resolve_reaction', accept: true },
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });
    expect(result.narrative).toMatch(/HELLISH REBUKE/);
    const newWl = result.newState.characters[0];
    expect(newWl.spell_slots_used?.[1]).toBe(1);
    expect(newWl.turn_actions.reaction_used).toBe(true);
    // 2d10 with Math.random ≈ 0.999 → ~10+10 = 20 damage to a 30-HP goblin.
    const goblinEnt = result.newState.entities?.find((e) => e.id === goblinId);
    expect(goblinEnt?.hp).toBeLessThan(30);
    expect(result.newState.pending_reaction).toBeUndefined();
  });

  it('Declining Hellish Rebuke clears the pending reaction without spending resources', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const wlId = 'wl2';
    const goblinId = `${CORRIDOR_ID}#0`;
    const wl = makeChar({
      id: wlId,
      character_class: 'Warlock',
      level: 3,
      cha: 16,
      hp: 10,
      max_hp: 18,
      spells_known: ['hellish_rebuke'],
      prepared_spells: ['hellish_rebuke'],
      spell_slots_max: { 1: 2 },
      spell_slots_used: {},
    });
    const state: GameState = {
      characters: [wl],
      active_character_id: wlId,
      current_room: CORRIDOR_ID,
      visited_rooms: ['entry_hall', CORRIDOR_ID],
      enemies_killed: [],
      loot_taken: [],
      combat_active: true,
      initiative_order: [
        { id: wlId, roll: 18, is_enemy: false },
        { id: goblinId, roll: 5, is_enemy: true },
      ],
      initiative_idx: 1,
      entities: [
        {
          id: wlId,
          isEnemy: false,
          pos: { x: 4, y: 5 },
          hp: 10,
          maxHp: 18,
          conditions: [],
          condition_durations: {},
        },
        {
          id: goblinId,
          isEnemy: true,
          pos: { x: 5, y: 5 },
          hp: 30,
          maxHp: 30,
          conditions: [],
          condition_durations: {},
        },
      ],
      pending_reaction: {
        kind: 'hellish_rebuke',
        attackerEnemyId: goblinId,
        targetCharId: wlId,
        resumeFromInitiativeIdx: 1,
        resumeFromMultiattackIdx: 1,
        narrativeSoFar: "[Goblin's turn]",
        eligibleCharIds: [wlId],
      },
      movement_used: {},
      run_log: [],
      room_log: [],
      last_choices: [],
      flags: {},
      short_rested_rooms: [],
      long_rested: false,
      npc_attitudes: {},
      npc_talked: [],
      traps_triggered: [],
      traps_disarmed: [],
      objects_searched: [],
    };
    const result = await takeAction({
      action: { type: 'resolve_reaction', accept: false },
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });
    const newWl = result.newState.characters[0];
    expect(newWl.spell_slots_used?.[1] ?? 0).toBe(0);
    expect(newWl.turn_actions.reaction_used).toBe(false);
    const goblinEnt = result.newState.entities?.find((e) => e.id === goblinId);
    expect(goblinEnt?.hp).toBe(30); // unchanged
    expect(result.newState.pending_reaction).toBeUndefined();
  });

  // ── Counterspell (reactive spell, SRD) ────────────────────────────────

  it('Accepting Counterspell burns a ≥L3 slot; enemy fails its CON save → spell countered', async () => {
    // SRD 5.2.1: the enemy makes a CON save vs the counterspeller's spell save
    // DC. Wizard L5 int 16 → DC 8 + prof 3 + int +3 = 14. random 0.5 → d20 = 11;
    // goblin con 10 (+0) → save 11 < 14 → fails → the spell is unraveled.
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const wizId = 'wiz-cs';
    const goblinId = `${CORRIDOR_ID}#0`;
    const wiz = makeChar({
      id: wizId,
      character_class: 'Wizard',
      level: 5,
      int: 16,
      hp: 30,
      max_hp: 30,
      spells_known: ['counterspell'],
      prepared_spells: ['counterspell'],
      spell_slots_max: { 1: 4, 2: 3, 3: 2 },
      spell_slots_used: {},
    });
    const state: GameState = {
      characters: [wiz],
      active_character_id: wizId,
      current_room: CORRIDOR_ID,
      visited_rooms: ['entry_hall', CORRIDOR_ID],
      enemies_killed: [],
      loot_taken: [],
      combat_active: true,
      initiative_order: [
        { id: wizId, roll: 18, is_enemy: false },
        { id: goblinId, roll: 5, is_enemy: true },
      ],
      initiative_idx: 1,
      entities: [
        {
          id: wizId,
          isEnemy: false,
          pos: { x: 4, y: 5 },
          hp: 30,
          maxHp: 30,
          conditions: [],
          condition_durations: {},
        },
        {
          id: goblinId,
          isEnemy: true,
          pos: { x: 5, y: 5 },
          hp: 10,
          maxHp: 10,
          conditions: [],
          condition_durations: {},
        },
      ],
      pending_reaction: {
        kind: 'counterspell',
        attackerEnemyId: goblinId,
        targetCharId: wizId,
        intendedTargetPcId: wizId,
        enemySpellId: 'fire_bolt',
        enemySpellLevel: 0,
        enemySpellName: 'Fire Bolt',
        resumeFromInitiativeIdx: 0,
        resumeFromMultiattackIdx: 0,
        narrativeSoFar: "[Goblin's turn]",
        eligibleCharIds: [wizId],
      },
      movement_used: {},
      run_log: [],
      room_log: [],
      last_choices: [],
      flags: {},
      short_rested_rooms: [],
      long_rested: false,
      npc_attitudes: {},
      npc_talked: [],
      traps_triggered: [],
      traps_disarmed: [],
      objects_searched: [],
    };
    const result = await takeAction({
      action: { type: 'resolve_reaction', accept: true },
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });
    expect(result.narrative).toMatch(/COUNTERSPELL/);
    expect(result.narrative).toMatch(/unraveled|no effect/);
    const newWiz = result.newState.characters[0];
    expect(newWiz.spell_slots_used?.[3]).toBe(1);
    expect(newWiz.turn_actions.reaction_used).toBe(true);
    expect(newWiz.hp).toBe(30); // no damage taken — spell countered
    expect(result.newState.pending_reaction).toBeUndefined();
  });

  it('Declining Counterspell lets the enemy spell resolve on its target', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999); // max damage roll
    const wizId = 'wiz-cs-decline';
    const goblinId = `${CORRIDOR_ID}#0`;
    const wiz = makeChar({
      id: wizId,
      character_class: 'Wizard',
      level: 5,
      int: 16,
      hp: 30,
      max_hp: 30,
      spells_known: ['counterspell'],
      prepared_spells: ['counterspell'],
      spell_slots_max: { 1: 4, 2: 3, 3: 2 },
      spell_slots_used: {},
    });
    const state: GameState = {
      characters: [wiz],
      active_character_id: wizId,
      current_room: CORRIDOR_ID,
      visited_rooms: ['entry_hall', CORRIDOR_ID],
      enemies_killed: [],
      loot_taken: [],
      combat_active: true,
      initiative_order: [
        { id: wizId, roll: 18, is_enemy: false },
        { id: goblinId, roll: 5, is_enemy: true },
      ],
      initiative_idx: 1,
      entities: [
        {
          id: wizId,
          isEnemy: false,
          pos: { x: 4, y: 5 },
          hp: 30,
          maxHp: 30,
          conditions: [],
          condition_durations: {},
        },
        {
          id: goblinId,
          isEnemy: true,
          pos: { x: 5, y: 5 },
          hp: 10,
          maxHp: 10,
          conditions: [],
          condition_durations: {},
        },
      ],
      pending_reaction: {
        kind: 'counterspell',
        attackerEnemyId: goblinId,
        targetCharId: wizId,
        intendedTargetPcId: wizId,
        enemySpellId: 'fire_bolt',
        enemySpellLevel: 0,
        enemySpellName: 'Fire Bolt',
        resumeFromInitiativeIdx: 0,
        resumeFromMultiattackIdx: 0,
        narrativeSoFar: "[Goblin's turn]",
        eligibleCharIds: [wizId],
      },
      movement_used: {},
      run_log: [],
      room_log: [],
      last_choices: [],
      flags: {},
      short_rested_rooms: [],
      long_rested: false,
      npc_attitudes: {},
      npc_talked: [],
      traps_triggered: [],
      traps_disarmed: [],
      objects_searched: [],
    };
    const result = await takeAction({
      action: { type: 'resolve_reaction', accept: false },
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });
    const newWiz = result.newState.characters[0];
    expect(newWiz.spell_slots_used?.[3] ?? 0).toBe(0); // no slot spent
    expect(newWiz.turn_actions.reaction_used).toBe(false);
    expect(newWiz.hp).toBeLessThan(30); // fire_bolt resolved
    expect(result.newState.pending_reaction).toBeUndefined();
  });

  it('Counterspell fails when the enemy succeeds its CON save → spell bursts through', async () => {
    // SRD 5.2.1: a SUCCESSFUL enemy CON save lets the spell resolve. Wizard L5
    // int 18 → DC 8 + prof 3 + int +4 = 15. random 0.999 → d20 = 20; goblin con
    // 10 (+0) → save 20 ≥ 15 → succeeds → Fire Bolt resolves and deals damage.
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    const wizId = 'wiz-cs-check';
    const goblinId = `${CORRIDOR_ID}#0`;
    const wiz = makeChar({
      id: wizId,
      character_class: 'Wizard',
      level: 5,
      int: 18,
      hp: 30,
      max_hp: 30,
      spells_known: ['counterspell'],
      prepared_spells: ['counterspell'],
      spell_slots_max: { 1: 4, 2: 3, 3: 2 },
      spell_slots_used: {},
    });
    const state: GameState = {
      characters: [wiz],
      active_character_id: wizId,
      current_room: CORRIDOR_ID,
      visited_rooms: ['entry_hall', CORRIDOR_ID],
      enemies_killed: [],
      loot_taken: [],
      combat_active: true,
      initiative_order: [
        { id: wizId, roll: 18, is_enemy: false },
        { id: goblinId, roll: 5, is_enemy: true },
      ],
      initiative_idx: 1,
      entities: [
        {
          id: wizId,
          isEnemy: false,
          pos: { x: 4, y: 5 },
          hp: 30,
          maxHp: 30,
          conditions: [],
          condition_durations: {},
        },
        {
          id: goblinId,
          isEnemy: true,
          pos: { x: 5, y: 5 },
          hp: 10,
          maxHp: 10,
          conditions: [],
          condition_durations: {},
        },
      ],
      pending_reaction: {
        kind: 'counterspell',
        attackerEnemyId: goblinId,
        targetCharId: wizId,
        intendedTargetPcId: wizId,
        enemySpellId: 'fire_bolt',
        enemySpellLevel: 0,
        enemySpellName: 'Fire Bolt',
        resumeFromInitiativeIdx: 0,
        resumeFromMultiattackIdx: 0,
        narrativeSoFar: "[Goblin's turn]",
        eligibleCharIds: [wizId],
      },
      movement_used: {},
      run_log: [],
      room_log: [],
      last_choices: [],
      flags: {},
      short_rested_rooms: [],
      long_rested: false,
      npc_attitudes: {},
      npc_talked: [],
      traps_triggered: [],
      traps_disarmed: [],
      objects_searched: [],
    };
    const result = await takeAction({
      action: { type: 'resolve_reaction', accept: true },
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });
    // The enemy's save succeeds → Counterspell fails, the spell resolves.
    expect(result.narrative).toMatch(/COUNTERSPELL/);
    expect(result.narrative).toMatch(/bursts through|resolves/);
    const newWiz = result.newState.characters[0];
    expect(newWiz.spell_slots_used?.[3]).toBe(1); // slot still spent on the attempt
    expect(newWiz.turn_actions.reaction_used).toBe(true);
    expect(newWiz.hp).toBeLessThan(30); // Fire Bolt landed
  });

  // ── Sneak Attack (Rogue in sandbox) ─────────────────────────────────────────

  it('Rogue sneak attack adds bonus damage on hit', async () => {
    // SRD 5.2.1: Sneak Attack needs (a) a finesse or ranged weapon, AND
    // (b) advantage OR an ally within 5 ft of the target, AND (c) no
    // disadvantage. We give the Rogue a dagger and place the Fighter
    // adjacent to the goblin on the grid.
    vi.spyOn(Math, 'random').mockReturnValue(0.999); // d20 → 20 always
    const daggerInst = 'rogue-dagger-1';
    const pilot = makeChar({
      id: 'p1',
      character_class: 'Rogue',
      level: 3,
      equipment: { main_hand: daggerInst },
      inventory: [{ instance_id: daggerInst, id: 'dagger', name: 'Dagger' }],
    });
    const ally = makeChar({ id: 'p2', character_class: 'Fighter' });
    const goblinId = `${CORRIDOR_ID}#0`;
    const state: GameState = {
      characters: [pilot, ally],
      active_character_id: 'p1',
      current_room: CORRIDOR_ID,
      visited_rooms: ['entry_hall', CORRIDOR_ID],
      enemies_killed: [],
      loot_taken: [],
      combat_active: true,
      initiative_order: [
        { id: 'p1', roll: 18, is_enemy: false },
        { id: 'p2', roll: 12, is_enemy: false },
        { id: goblinId, roll: 5, is_enemy: true },
      ],
      initiative_idx: 0,
      // Pre-place entities so the ally is within 5 ft of the goblin.
      entities: [
        {
          id: 'p1',
          isEnemy: false,
          pos: { x: 4, y: 5 },
          hp: 10,
          maxHp: 10,
          conditions: [],
          condition_durations: {},
        },
        {
          id: 'p2',
          isEnemy: false,
          pos: { x: 6, y: 5 },
          hp: 10,
          maxHp: 10,
          conditions: [],
          condition_durations: {},
        },
        {
          id: goblinId,
          isEnemy: true,
          pos: { x: 5, y: 5 },
          hp: 10,
          maxHp: 10,
          conditions: [],
          condition_durations: {},
        },
      ],
      movement_used: {},
      run_log: [],
      room_log: [],
      last_choices: [],
      flags: {},
      short_rested_rooms: [],
      long_rested: false,
      npc_attitudes: {},
      npc_talked: [],
      traps_triggered: [],
      traps_disarmed: [],
      objects_searched: [],
    };
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: goblinId },
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });
    // Sneak Attack [2d6] should appear in narrative at level 3 (ceil(3/2)=2 dice)
    expect(result.narrative).toMatch(/Sneak Attack/i);
  });

  it('Fighter does not get sneak attack', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    const state = makeState(
      { character_class: 'Fighter' },
      { current_room: CORRIDOR_ID, visited_rooms: ['entry_hall', CORRIDOR_ID] }
    );
    const result = await takeAction({
      action: { type: 'attack' },
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });
    expect(result.narrative).not.toMatch(/Sneak Attack/i);
  });

  // ── Extra Attack (Fighter level 5+ in sandbox) ───────────────────────────────

  it('Fighter at level 5 makes 2 attacks on Attack action (both show in narrative)', async () => {
    // Roll just above miss threshold: roll=1 (fumble) then roll=20 (hit) — ensures at least 2 roll events
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0) // initiative d20 for Fighter
      .mockReturnValueOnce(0) // initiative d20 for enemy
      .mockReturnValueOnce(0) // surprise stealth roll (1d20) for Fighter
      .mockReturnValueOnce(0) // first attack d20 → 1 (fumble)
      .mockReturnValueOnce(0.999) // second attack d20 → 20 (hit)
      .mockReturnValue(0.999); // damage dice

    const state = withAdjacentEntities(
      makeState(
        { character_class: 'Fighter', level: 5 },
        { current_room: CORRIDOR_ID, visited_rooms: ['entry_hall', CORRIDOR_ID] }
      ),
      `${CORRIDOR_ID}#0`
    );
    const result = await takeAction({
      action: { type: 'attack' },
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });
    // Should see both fumble text and a subsequent hit — "Attack 2" label in narrative
    expect(result.narrative).toMatch(/fumble|Attack 2/i);
  });

  it('Fighter at level 4 only makes 1 attack (no Attack 2 label)', async () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0) // first attack d20 → 1 (fumble)
      .mockReturnValue(0);

    const state = withAdjacentEntities(
      makeState(
        { character_class: 'Fighter', level: 4 },
        { current_room: CORRIDOR_ID, visited_rooms: ['entry_hall', CORRIDOR_ID] }
      ),
      `${CORRIDOR_ID}#0`
    );
    const result = await takeAction({
      action: { type: 'attack' },
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });
    expect(result.narrative).not.toMatch(/Attack 2/i);
  });

  // SRD 5.2.1 Fighter Extra Attack tiers — 3 attacks at L11, 4 at L20. Every
  // swing (even a miss) prints its "Attack N — " roll-detail label, so forcing
  // all attacks to miss (d20 = 1) keeps the enemy alive through the whole loop
  // and lets us count the labels exactly.
  it('Fighter at level 11 makes 3 attacks (Attack 3 label, no Attack 4)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // every d20 → 1: all miss, enemy survives
    const state = withAdjacentEntities(
      makeState(
        { character_class: 'Fighter', level: 11 },
        { current_room: CORRIDOR_ID, visited_rooms: ['entry_hall', CORRIDOR_ID] }
      ),
      `${CORRIDOR_ID}#0`
    );
    const result = await takeAction({
      action: { type: 'attack' },
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });
    expect(result.narrative).toMatch(/Attack 2 — /);
    expect(result.narrative).toMatch(/Attack 3 — /);
    expect(result.narrative).not.toMatch(/Attack 4/);
  });

  it('Fighter at level 20 makes 4 attacks (Attack 4 label, no Attack 5)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // every d20 → 1: all miss, enemy survives
    const state = withAdjacentEntities(
      makeState(
        { character_class: 'Fighter', level: 20 },
        { current_room: CORRIDOR_ID, visited_rooms: ['entry_hall', CORRIDOR_ID] }
      ),
      `${CORRIDOR_ID}#0`
    );
    const result = await takeAction({
      action: { type: 'attack' },
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });
    expect(result.narrative).toMatch(/Attack 3 — /);
    expect(result.narrative).toMatch(/Attack 4 — /);
    expect(result.narrative).not.toMatch(/Attack 5/);
  });

  // ── Rage (Warrior — tested via ctxWithRage) ──────────────────────────────────

  it('use_class_feature rage activates raging condition and spends a use', async () => {
    const state = {
      ...makeState(
        { character_class: 'Warrior', level: 1 },
        {
          current_room: CORRIDOR_ID,
          visited_rooms: ['entry_hall', CORRIDOR_ID],
          combat_active: true,
          initiative_order: [
            { id: 'char-1', roll: 15, is_enemy: false },
            { id: CORRIDOR_ID, roll: 5, is_enemy: true },
          ],
          initiative_idx: 0,
        }
      ),
    };
    const result = await takeAction({
      action: { type: 'use_class_feature', featureId: 'rage' },
      history: [],
      state,
      seed: dungeonSeedWithEnemy,
      context: ctxWithRage,
    });
    const char = result.newState.characters[0];
    expect(char.conditions).toContain('raging');
    // rage_uses should be initialized to rageUsesMax(1)-1 = 1
    expect(char.class_resource_uses.rage_uses).toBe(1);
    expect(char.turn_actions.bonus_action_used).toBe(true);
    expect(result.narrative).toMatch(/RAGES/i);
  });

  it('use_class_feature rage cannot be activated twice', async () => {
    const state = {
      ...makeState(
        { character_class: 'Warrior', conditions: ['raging'] },
        {
          current_room: CORRIDOR_ID,
          visited_rooms: ['entry_hall', CORRIDOR_ID],
          combat_active: true,
          initiative_order: [{ id: 'char-1', roll: 15, is_enemy: false }],
          initiative_idx: 0,
        }
      ),
    };
    const result = await takeAction({
      action: { type: 'use_class_feature', featureId: 'rage' },
      history: [],
      state,
      seed: dungeonSeedWithEnemy,
      context: ctxWithRage,
    });
    expect(result.narrative).toMatch(/already raging/i);
  });

  it('raging condition clears when combat ends', async () => {
    // Kill the enemy while raging → combat ends → raging cleared
    // Use a 1 HP enemy so any hit kills it and combat ends deterministically
    const fragileSeed: Seed = {
      ...dungeonSeedWithEnemy,
      enemies: {
        [CORRIDOR_ID]: [
          {
            id: `${CORRIDOR_ID}#0`,
            name: 'Goblin',
            hp: 1,
            ac: 1,
            damage: '1d4',
            toHit: 2,
            xp: 20,
          },
        ],
      },
    };
    vi.spyOn(Math, 'random').mockReturnValue(0.999); // always hit/crit
    const state = withAdjacentEntities(
      makeState(
        { character_class: 'Warrior', conditions: ['raging'] },
        { current_room: CORRIDOR_ID, visited_rooms: ['entry_hall', CORRIDOR_ID] }
      ),
      `${CORRIDOR_ID}#0`,
      { enemyHp: 1 } // fragile goblin — the opening blow kills it, ending combat
    );
    const result = await takeAction({
      action: { type: 'attack' },
      history: [],
      state,
      seed: fragileSeed,
      context: ctxWithRage,
    });
    expect(result.newState.combat_active).toBe(false);
    expect(result.newState.characters[0].conditions).not.toContain('raging');
  });

  it('long rest restores rage uses for Warrior', async () => {
    const state = makeState(
      {
        character_class: 'Warrior',
        level: 6,
        class_resource_uses: { rage_uses: 0 },
      },
      {}
    );
    const result = await takeAction({
      action: { type: 'long_rest' },
      history: [],
      state,
      seed: dungeonSeedWithEnemy,
      context: ctxWithRage,
    });
    // rageUsesMax(6) = 4 (SRD)
    expect(result.newState.characters[0].class_resource_uses.rage_uses).toBe(4);
  });

  it('generateChoices shows rage bonus action for Warrior in combat with uses remaining', () => {
    const state = makeState(
      { character_class: 'Warrior', level: 1, class_resource_uses: { rage_uses: 2 } },
      {
        current_room: CORRIDOR_ID,
        visited_rooms: ['entry_hall', CORRIDOR_ID],
        combat_active: true,
        initiative_order: [
          { id: 'char-1', roll: 15, is_enemy: false },
          { id: CORRIDOR_ID, roll: 5, is_enemy: true },
        ],
        initiative_idx: 0,
      }
    );
    const choices = generateChoices(state, dungeonSeedWithEnemy, ctxWithRage);
    const rageChoice = choices.find((c) => c.action.type === 'use_class_feature');
    expect(rageChoice).toBeDefined();
    expect(rageChoice?.requiresBonusAction).toBe(true);
  });

  it('generateChoices hides rage when already raging', () => {
    const state = makeState(
      { character_class: 'Warrior', conditions: ['raging'] },
      {
        current_room: CORRIDOR_ID,
        visited_rooms: ['entry_hall', CORRIDOR_ID],
        combat_active: true,
        initiative_order: [
          { id: 'char-1', roll: 15, is_enemy: false },
          { id: CORRIDOR_ID, roll: 5, is_enemy: true },
        ],
        initiative_idx: 0,
      }
    );
    const choices = generateChoices(state, dungeonSeedWithEnemy, ctxWithRage);
    expect(choices.every((c) => c.action.type !== 'use_class_feature')).toBe(true);
  });
});
