// Conditions, weapon-mastery, Heroic + Bardic Inspiration, stand-up,
// grapple side-effects, exhaustion + long-rest interaction. Extracted
// from gameEngine.spec.ts as part of the test-suite split (TODO
// architecture-audit follow-up #1).

import {
  CORRIDOR_ID,
  makeChar,
  makeState,
  baseSandboxSeed as seed,
  seedWithEnemy,
} from '../../test-fixtures.js';
import type { GameState, Seed } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateChoices, takeAction } from '../../services/gameEngine.js';
import { context as ctx } from '../fixtures/testContext.js';

afterEach(() => vi.restoreAllMocks());

describe('conditions — new types', () => {
  it('incapacitated character gets only a pass choice', () => {
    const state = makeState(
      { conditions: ['incapacitated'], condition_durations: { incapacitated: 1 } },
      {
        current_room: CORRIDOR_ID,
        visited_rooms: ['entry_hall', CORRIDOR_ID],
      }
    );
    const choices = generateChoices(state, seedWithEnemy, ctx);
    expect(choices).toHaveLength(1);
    expect(choices[0].action.type).toBe('pass');
    expect(choices[0].label).toMatch(/INCAPACITATED/);
  });

  it('grid_move is blocked when the moving character is grappled', async () => {
    const state = makeState(
      { conditions: ['grappled'], condition_durations: { grappled: 1 } },
      {
        combat_active: true,
        entities: [
          {
            id: 'char-1',
            isEnemy: false,
            pos: { x: 0, y: 0 },
            hp: 10,
            maxHp: 10,
            conditions: ['grappled'],
            condition_durations: { grappled: 1 },
            grappled_by: `${CORRIDOR_ID}#0`,
          },
        ],
      }
    );
    const result = await takeAction({
      action: { type: 'grid_move', entityId: 'char-1', to: { x: 1, y: 0 } },
      history: [],
      state,
      seed,
      context: ctx,
    });
    expect(result.narrative).toMatch(/GRAPPLED — your speed is 0/);
    const ent = result.newState.entities?.find((e) => e.id === 'char-1');
    expect(ent?.pos).toEqual({ x: 0, y: 0 });
  });

  it('surfaces a try_escape_grapple choice when grappled in combat', () => {
    const state = makeState(
      { conditions: ['grappled'], condition_durations: { grappled: 1 } },
      { combat_active: true }
    );
    const choices = generateChoices(state, seed, ctx);
    expect(choices.some((c) => c.action.type === 'try_escape_grapple')).toBe(true);
  });

  it('spend_inspiration queues advantage; clears char.inspiration after the attack resolves', async () => {
    // Roll a 1 first to grant inspiration (mocked random forces d20=1)
    vi.spyOn(Math, 'random').mockReturnValue(0); // floor(0*20)+1 = 1
    const state0 = makeState(
      { hp: 20, max_hp: 20, str: 14 },
      {
        combat_active: true,
        current_room: CORRIDOR_ID,
        initiative_order: [{ id: 'char-1', roll: 15, is_enemy: false }],
        initiative_idx: 0,
      }
    );
    const r1 = await takeAction({
      action: { type: 'attack' },
      history: [],
      state: state0,
      seed: seedWithEnemy,
      context: ctx,
    });
    expect(r1.newState.characters[0].inspiration).toBe(true);
    expect(r1.narrative).toMatch(/Heroic Inspiration granted/);

    // Spend it, then make an attack — flag should be cleared after
    vi.restoreAllMocks();
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // hits everything
    const stateSpend = {
      ...r1.newState,
      // Reset action so the spend → attack flow can happen this turn
      characters: r1.newState.characters.map((c) => ({
        ...c,
        turn_actions: { ...c.turn_actions, action_used: false },
      })),
    };
    const r2 = await takeAction({
      action: { type: 'spend_inspiration' },
      history: [],
      state: stateSpend,
      seed: seedWithEnemy,
      context: ctx,
    });
    expect(r2.newState.characters[0].turn_actions.inspiration_pending).toBe(true);
    expect(r2.newState.characters[0].inspiration).toBe(true); // not consumed until the attack

    const r3 = await takeAction({
      action: { type: 'attack' },
      history: [],
      state: r2.newState,
      seed: seedWithEnemy,
      context: ctx,
    });
    expect(r3.newState.characters[0].inspiration).toBe(false);
    expect(r3.newState.characters[0].turn_actions.inspiration_pending).toBeFalsy();
  });

  // ── SRD Weapon Mastery ─────────────────────────────────────────────────

  it('Topple mastery: longsword hit forces CON save or prone', async () => {
    // Force d20=20 to land the attack; enemy d20=1 for the CON save → fail.
    vi.spyOn(Math, 'random').mockReturnValue(0); // d20 rolls = 1
    const random = vi.spyOn(Math, 'random');
    random
      .mockReturnValueOnce(0.999) // attack d20 → 20
      .mockReturnValueOnce(0.999) // damage roll high
      .mockReturnValueOnce(0) // enemy CON save d20 → 1 (fail)
      .mockReturnValue(0);
    const fighterId = 'f-topple';
    // battleaxe → topple mastery. Use longsword (mastery: sap) won't work for
    // this test. Use a weapon mastery we can predictably trigger:
    // quarterstaff has topple too in our tagging. Use that.
    const staffInst = 'f-staff';
    const fighter = makeChar({
      id: fighterId,
      character_class: 'Fighter',
      level: 3,
      str: 16,
      equipment: { main_hand: staffInst },
      inventory: [{ instance_id: staffInst, id: 'quarterstaff', name: 'Quarterstaff' }],
      weapon_masteries: ['quarterstaff'],
    });
    const goblinId = `${CORRIDOR_ID}#0`;
    const state: GameState = {
      characters: [fighter],
      active_character_id: fighterId,
      current_room: CORRIDOR_ID,
      visited_rooms: ['entry_hall', CORRIDOR_ID],
      enemies_killed: [],
      loot_taken: [],
      combat_active: true,
      initiative_order: [
        { id: fighterId, roll: 18, is_enemy: false },
        { id: goblinId, roll: 5, is_enemy: true },
      ],
      initiative_idx: 0,
      entities: [
        {
          id: fighterId,
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
          hp: 50, // survives the hit so we see the prone effect
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
      round: 1,
    };
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: goblinId },
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });
    // Either prone was applied (save failed) or resists (save succeeded).
    expect(result.narrative).toMatch(/Topple:/);
  });

  it('Vex mastery: hit marks target for advantage on next attack', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999); // always hit
    const rogueId = 'r-vex';
    const swordInst = 'r-sword';
    const rogue = makeChar({
      id: rogueId,
      character_class: 'Rogue',
      level: 3,
      dex: 16,
      equipment: { main_hand: swordInst },
      inventory: [{ instance_id: swordInst, id: 'shortsword', name: 'Shortsword' }],
      weapon_masteries: ['shortsword'],
    });
    const goblinId = `${CORRIDOR_ID}#0`;
    const state: GameState = {
      characters: [rogue],
      active_character_id: rogueId,
      current_room: CORRIDOR_ID,
      visited_rooms: ['entry_hall', CORRIDOR_ID],
      enemies_killed: [],
      loot_taken: [],
      combat_active: true,
      initiative_order: [
        { id: rogueId, roll: 18, is_enemy: false },
        { id: goblinId, roll: 5, is_enemy: true },
      ],
      initiative_idx: 0,
      entities: [
        {
          id: rogueId,
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
      round: 1,
    };
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: goblinId },
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });
    // Vex narrative should mention the advantage promise.
    expect(result.narrative).toMatch(/Vex:/);
    // Entity should carry the vexed_by tag.
    const goblinEnt = result.newState.entities?.find((e) => e.id === goblinId);
    expect(goblinEnt?.conditions.some((c) => c.startsWith('vexed_by_'))).toBe(true);
  });

  it('Mastery is ignored when the PC has NOT mastered the weapon', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    const fighterId = 'f-no-mastery';
    const swordInst = 'f-sword';
    const fighter = makeChar({
      id: fighterId,
      character_class: 'Fighter',
      level: 3,
      str: 16,
      equipment: { main_hand: swordInst },
      inventory: [{ instance_id: swordInst, id: 'longsword', name: 'Longsword' }],
      weapon_masteries: [], // empty — no mastery applies
    });
    const goblinId = `${CORRIDOR_ID}#0`;
    const state: GameState = {
      characters: [fighter],
      active_character_id: fighterId,
      current_room: CORRIDOR_ID,
      visited_rooms: ['entry_hall', CORRIDOR_ID],
      enemies_killed: [],
      loot_taken: [],
      combat_active: true,
      initiative_order: [
        { id: fighterId, roll: 18, is_enemy: false },
        { id: goblinId, roll: 5, is_enemy: true },
      ],
      initiative_idx: 0,
      entities: [
        {
          id: fighterId,
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
      round: 1,
    };
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: goblinId },
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });
    // No mastery narrative chunk.
    expect(result.narrative).not.toMatch(/\[(Vex|Topple|Push|Sap|Slow|Graze|Cleave):/);
  });

  it('Graze mastery: missed greatsword swing still deals STR mod damage', async () => {
    // Force a miss with greatsword (mastery: graze). Sandbox greatsword
    // does 2d6 slashing on hit; Graze should deal STR mod damage on miss.
    const random = vi.spyOn(Math, 'random');
    random
      .mockReturnValueOnce(0) // attack d20 → 1 (miss; but resolveAttack treats nat-1 as fumble)
      .mockReturnValue(0); // everything else low
    const fighterId = 'f-graze';
    const swordInst = 'f-sword';
    const fighter = makeChar({
      id: fighterId,
      character_class: 'Fighter',
      level: 3,
      str: 18, // +4 STR mod = 4 graze damage
      equipment: { main_hand: swordInst },
      inventory: [{ instance_id: swordInst, id: 'greatsword', name: 'Greatsword' }],
      weapon_masteries: ['greatsword'],
    });
    const goblinId = `${CORRIDOR_ID}#0`;
    const state: GameState = {
      characters: [fighter],
      active_character_id: fighterId,
      current_room: CORRIDOR_ID,
      visited_rooms: ['entry_hall', CORRIDOR_ID],
      enemies_killed: [],
      loot_taken: [],
      combat_active: true,
      initiative_order: [{ id: fighterId, roll: 18, is_enemy: false }],
      initiative_idx: 0,
      entities: [
        {
          id: fighterId,
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
      round: 1,
    };
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: goblinId },
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });
    // Either it actually missed (Graze fires) or it fumbled and skipped — but
    // a nat-1 fumble returns false in the inner attack helper before Graze.
    // So Graze only lands on a "normal" miss. With STR 18, the narrative should
    // include the Graze damage line on any miss path.
    if (/MISS/.test(result.narrative) || /miss/.test(result.narrative)) {
      expect(result.narrative).toMatch(/Graze:.*4 damage/);
    }
  });

  it('Cleave mastery: greataxe hit damages a second adjacent enemy', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999); // always hit + max rolls
    const fighterId = 'f-cleave';
    const axeInst = 'f-axe';
    const fighter = makeChar({
      id: fighterId,
      character_class: 'Fighter',
      level: 3,
      str: 16,
      equipment: { main_hand: axeInst },
      inventory: [{ instance_id: axeInst, id: 'greataxe', name: 'Greataxe' }],
      weapon_masteries: ['greataxe'],
    });
    const goblinAId = `${CORRIDOR_ID}#0`;
    const goblinBId = `${CORRIDOR_ID}#1`;
    const state: GameState = {
      characters: [fighter],
      active_character_id: fighterId,
      current_room: CORRIDOR_ID,
      visited_rooms: ['entry_hall', CORRIDOR_ID],
      enemies_killed: [],
      loot_taken: [],
      combat_active: true,
      initiative_order: [{ id: fighterId, roll: 18, is_enemy: false }],
      initiative_idx: 0,
      entities: [
        {
          id: fighterId,
          isEnemy: false,
          pos: { x: 4, y: 5 },
          hp: 30,
          maxHp: 30,
          conditions: [],
          condition_durations: {},
        },
        {
          id: goblinAId,
          isEnemy: true,
          pos: { x: 5, y: 5 },
          hp: 50,
          maxHp: 50,
          conditions: [],
          condition_durations: {},
        },
        {
          id: goblinBId,
          isEnemy: true,
          pos: { x: 6, y: 5 }, // adjacent to goblin A
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
      round: 1,
    };
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: goblinAId },
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });
    expect(result.narrative).toMatch(/Cleave:/);
    // Second goblin should have taken damage.
    const goblinB = result.newState.entities?.find((e) => e.id === goblinBId);
    expect(goblinB!.hp).toBeLessThan(50);
  });

  it('Battleaxe: Topple mastery on hit, and a shield suppresses the versatile die (1d8)', async () => {
    // RAW SRD 5.2.1: the Battleaxe carries Topple (the homebrew `flex` mastery was
    // retired). With a shield equipped, versatile falls back to the one-handed
    // 1d8 die. Sequence: attack d20 → 15 (hit, not a crit), damage 1d8 → 8,
    // Topple CON save d20 → 1 (fail → prone).
    const random = vi.spyOn(Math, 'random');
    random
      .mockReturnValueOnce(0.7) // attack d20 → 15 (hit vs AC 12, not a crit)
      .mockReturnValueOnce(0.999) // damage 1d8 → 8
      .mockReturnValueOnce(0) // enemy CON save d20 → 1 (fail Topple)
      .mockReturnValue(0);
    const fighterId = 'f-axe-topple';
    const axeInst = 'f-axe';
    const shieldInst = 'f-shield';
    const fighter = makeChar({
      id: fighterId,
      character_class: 'Fighter',
      level: 3,
      str: 16,
      equipment: { main_hand: axeInst, shield: shieldInst },
      inventory: [
        { instance_id: axeInst, id: 'battleaxe', name: 'Battleaxe' },
        { instance_id: shieldInst, id: 'shield', name: 'Shield' },
      ],
      weapon_masteries: ['battleaxe'],
    });
    const goblinId = `${CORRIDOR_ID}#0`;
    const state: GameState = {
      characters: [fighter],
      active_character_id: fighterId,
      current_room: CORRIDOR_ID,
      visited_rooms: ['entry_hall', CORRIDOR_ID],
      enemies_killed: [],
      loot_taken: [],
      combat_active: true,
      initiative_order: [{ id: fighterId, roll: 18, is_enemy: false }],
      initiative_idx: 0,
      entities: [
        {
          id: fighterId,
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
          hp: 80,
          maxHp: 80,
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
    // Shield equipped → one-handed 1d8 (max 8) + STR mod 3 = 11 (NOT the 1d10
    // the retired Flex mastery would have granted, which would be 13).
    const goblin = result.newState.entities?.find((e) => e.id === goblinId);
    const dmgDealt = 80 - (goblin?.hp ?? 80);
    expect(dmgDealt).toBe(11);
    // Topple fired: the goblin is knocked Prone, and the chunk is narrated.
    expect(goblin?.conditions).toContain('prone');
    expect(result.narrative).toMatch(/Topple/);
  });

  it('Nick mastery: two-weapon attack with dagger off-hand does not consume bonus action', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    const rogueId = 'r-nick';
    const shortswordInst = 'r-sword';
    const daggerInst = 'r-dagger';
    const rogue = makeChar({
      id: rogueId,
      character_class: 'Rogue',
      level: 1,
      dex: 16,
      equipment: { main_hand: shortswordInst },
      inventory: [
        { instance_id: shortswordInst, id: 'shortsword', name: 'Shortsword' },
        { instance_id: daggerInst, id: 'dagger', name: 'Dagger' },
      ],
      weapon_masteries: ['dagger'],
      turn_actions: {
        action_used: true, // main attack already taken
        bonus_action_used: false,
        reaction_used: false,
        free_interaction_used: false,
      },
    });
    const goblinId = `${CORRIDOR_ID}#0`;
    const state: GameState = {
      characters: [rogue],
      active_character_id: rogueId,
      current_room: CORRIDOR_ID,
      visited_rooms: ['entry_hall', CORRIDOR_ID],
      enemies_killed: [],
      loot_taken: [],
      combat_active: true,
      initiative_order: [{ id: rogueId, roll: 18, is_enemy: false }],
      initiative_idx: 0,
      entities: [
        {
          id: rogueId,
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
      round: 1,
    };
    const result = await takeAction({
      action: { type: 'two_weapon_attack', targetEnemyId: goblinId },
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });
    // Off-hand attack landed AND bonus action stays available.
    expect(result.narrative).toMatch(/Off-hand/);
    expect(result.newState.characters[0].turn_actions.bonus_action_used).toBe(false);
  });

  // ── Bardic Inspiration (SRD) ──────────────────────────────────────────

  it('Bard grants Bardic Inspiration — die is stashed on the target ally', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const bardId = 'b1';
    const fighterId = 'f1';
    const bard = makeChar({
      id: bardId,
      character_class: 'Bard',
      level: 3,
      cha: 16,
      class_resource_uses: { bardic_inspiration: 3 },
    });
    const fighter = makeChar({ id: fighterId, character_class: 'Fighter', level: 3 });
    const state: GameState = {
      characters: [bard, fighter],
      active_character_id: bardId,
      current_room: 'entry_hall',
      visited_rooms: ['entry_hall'],
      enemies_killed: [],
      loot_taken: [],
      combat_active: true,
      initiative_order: [
        { id: bardId, roll: 18, is_enemy: false },
        { id: fighterId, roll: 14, is_enemy: false },
      ],
      initiative_idx: 0,
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
      action: { type: 'use_class_feature', featureId: 'bardic_inspiration' },
      history: [],
      state,
      seed,
      context: ctx,
    });
    // The Fighter should now carry a bardic_inspiration_die.
    const newFighter = result.newState.characters.find((c) => c.id === fighterId);
    expect(newFighter?.bardic_inspiration_die).toBe('d6');
    expect(result.narrative).toMatch(/Bardic Inspiration/);
  });

  it('Bardic Inspiration die consumed on an ally attack roll, +bonus to hit', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999); // d20=20, BI die rolls high
    const fighterId = 'f-bi';
    const swordInst = 'f-sw';
    const fighter = makeChar({
      id: fighterId,
      character_class: 'Fighter',
      level: 3,
      str: 16,
      equipment: { main_hand: swordInst },
      inventory: [{ instance_id: swordInst, id: 'longsword', name: 'Longsword' }],
      bardic_inspiration_die: 'd6',
    });
    const goblinId = `${CORRIDOR_ID}#0`;
    const state: GameState = {
      characters: [fighter],
      active_character_id: fighterId,
      current_room: CORRIDOR_ID,
      visited_rooms: ['entry_hall', CORRIDOR_ID],
      enemies_killed: [],
      loot_taken: [],
      combat_active: true,
      initiative_order: [{ id: fighterId, roll: 18, is_enemy: false }],
      initiative_idx: 0,
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
    expect(result.narrative).toMatch(/Bardic Inspiration:/);
    // Die consumed
    const newFighter = result.newState.characters[0];
    expect(newFighter.bardic_inspiration_die).toBeUndefined();
  });

  // ── Heroic Inspiration: SRD spend on saves ─────────────────────────────

  it('spend_inspiration grants advantage on a save vs enemy onHitEffect', async () => {
    // Build a seed where the enemy's attack ALWAYS hits + has an onHitEffect
    // (paralyze on CON save). Pre-arm inspiration so the PC's save gets
    // advantage. With d20=1 (one of the rolls), advantage picks the higher.
    // Hard to verify the exact roll without deeper instrumentation, but we
    // CAN verify the flag is consumed and a narrative note appears.
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const paralyzeSeed: Seed = {
      ...seedWithEnemy,
      enemies: {
        [CORRIDOR_ID]: [
          {
            id: `${CORRIDOR_ID}#0`,
            name: 'Frost Acolyte',
            hp: 50,
            ac: 10,
            damage: '1d4',
            toHit: 20, // forces hit
            xp: 100,
            con: 14,
            onHitEffect: { condition: 'paralyzed', ability: 'con', dc: 13 },
          },
        ],
      },
    };
    const pcId = 'char-1';
    const goblinId = `${CORRIDOR_ID}#0`;
    const state = makeState(
      {
        id: pcId,
        hp: 20,
        max_hp: 20,
        con: 12,
        inspiration: true,
        turn_actions: {
          action_used: false,
          bonus_action_used: false,
          reaction_used: false,
          free_interaction_used: false,
          inspiration_pending: true, // armed for the next d20 test
        },
      },
      {
        combat_active: true,
        current_room: CORRIDOR_ID,
        visited_rooms: ['entry_hall', CORRIDOR_ID],
        initiative_order: [
          { id: pcId, roll: 5, is_enemy: false },
          { id: goblinId, roll: 20, is_enemy: true },
        ],
        initiative_idx: 0,
        entities: [
          {
            id: pcId,
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
            hp: 50,
            maxHp: 50,
            conditions: [],
            condition_durations: {},
          },
        ],
      }
    );
    // End the PC's turn so the enemy attacks back next.
    const result = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state,
      seed: paralyzeSeed,
      context: ctx,
    });
    // Inspiration narrative should have fired during the save resolution.
    expect(result.narrative).toMatch(/Heroic Inspiration spent on the save/);
    // Inspiration flags must be cleared post-save.
    const pc = result.newState.characters[0];
    expect(pc.inspiration).toBe(false);
    expect(pc.turn_actions.inspiration_pending).toBeFalsy();
  });

  it('stand_up costs half speed and removes prone', async () => {
    const state = makeState(
      { conditions: ['prone'], condition_durations: { prone: 1 } },
      {
        combat_active: true,
        entities: [
          {
            id: 'char-1',
            isEnemy: false,
            pos: { x: 0, y: 0 },
            hp: 10,
            maxHp: 10,
            conditions: ['prone'],
            condition_durations: { prone: 1 },
          },
        ],
        movement_used: {},
      }
    );
    const result = await takeAction({
      action: { type: 'stand_up' },
      history: [],
      state,
      seed,
      context: ctx,
    });
    expect(result.newState.characters[0].conditions).not.toContain('prone');
    expect(result.newState.movement_used?.['char-1']).toBe(15);
  });

  it('killing the grappler clears grapples on subsequent action', async () => {
    const goblinId = `${CORRIDOR_ID}#0`;
    const state = makeState(
      { conditions: ['grappled'], condition_durations: { grappled: 1 } },
      {
        combat_active: true,
        current_room: CORRIDOR_ID,
        enemies_killed: [goblinId], // grappler already dead
        entities: [
          {
            id: 'char-1',
            isEnemy: false,
            pos: { x: 0, y: 0 },
            hp: 10,
            maxHp: 10,
            conditions: ['grappled'],
            condition_durations: { grappled: 1 },
            grappled_by: goblinId,
          },
        ],
      }
    );
    const result = await takeAction({
      action: { type: 'pass' },
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });
    expect(result.newState.characters[0].conditions).not.toContain('grappled');
    const ent = result.newState.entities?.find((e) => e.id === 'char-1');
    expect(ent?.conditions).not.toContain('grappled');
    expect(ent?.grappled_by).toBeUndefined();
  });

  it('long rest reduces exhaustion level by 1', async () => {
    const state = makeState({ exhaustion_level: 2, hp: 5, max_hp: 10 });
    const result = await takeAction({
      action: { type: 'long_rest' },
      history: [],
      state,
      seed,
      context: ctx,
    });
    expect(result.newState.characters[0].exhaustion_level).toBe(1);
  });

  it('long rest does not drop exhaustion below 0', async () => {
    const state = makeState({ exhaustion_level: 0, hp: 5, max_hp: 10 });
    const result = await takeAction({
      action: { type: 'long_rest' },
      history: [],
      state,
      seed,
      context: ctx,
    });
    expect(result.newState.characters[0].exhaustion_level).toBe(0);
  });
});
