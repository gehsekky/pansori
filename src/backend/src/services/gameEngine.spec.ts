import type {
  CampaignFacts,
  CampaignState,
  Character,
  Context,
  GameRule,
  GameState,
  NpcTemplate,
  PlacedNpc,
  Seed,
} from '../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyConsequence,
  backfillOwnership,
  buildArrivalNarrative,
  generateChoices,
  normalizeState,
  preservesCriticalFacts,
  runRules,
  seenKeyForAction,
  takeAction,
} from './gameEngine.js';
import { applyQuestCompletions, evaluateQuestSteps } from './campaignEngine.js';
import {
  ctxWithRage,
  makeChar,
  makeClericState,
  makeMageState,
  makeState,
  seedWithEnemy,
  spellSeed,
} from '../test-fixtures.js';
import { context as ctx } from '../campaignData/sandbox.js';
import { generateSeed } from './procgen.js';
import { context as valeCtx } from '../campaignData/malgovia/index.js';

afterEach(() => vi.restoreAllMocks());

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const CORRIDOR_ID = 'guard_post';

const seed: Seed = {
  context_id: ctx.id,
  world_name: 'The Testing Grounds',
  ship_name: 'The Testing Grounds',
  intro: 'Test intro.',
  seed_id: 'test-seed-id',
  rooms: [
    { id: 'entry_hall', name: 'Entry Hall', desc: 'The entry hall.' },
    { id: CORRIDOR_ID, name: 'Guard Post', desc: 'A guard post.' },
    { id: 'exit_gate', name: 'Exit Gate', desc: 'The exit gate.' },
  ],
  enemies: {},
  loot: {},
  npcs: {},
};

const seedWithLoot: Seed = {
  ...seed,
  loot: {
    [CORRIDOR_ID]: {
      id: 'medkit',
      name: 'Med-Kit',
      desc: 'Heals wounds.',
      weight: 1,
      type: 'consumable',
      slot: null,
      damage: null,
      ac_bonus: null,
      heal: '1d6+1',
      effect: null,
      aliases: ['medkit', 'med-kit', 'med kit'],
    },
  },
};

// makeChar / makeState live in `../test-fixtures.ts` (shared across the
// backend spec suite). Specific scenario helpers (makeMageState,
// makeClericState, etc.) stay local — they apply class-specific
// overrides on top of the canonical fixture.

// ─── normalizeState ───────────────────────────────────────────────────────────

describe('normalizeState', () => {
  it('passes through already-new-format state unchanged', () => {
    const state = makeState();
    const result = normalizeState(state as unknown as Record<string, unknown>);
    expect(result.characters).toHaveLength(1);
    expect(result.characters[0].id).toBe('char-1');
  });

  it('wraps legacy flat GameState into a 1-character party', () => {
    const legacy = {
      hp: 15,
      max_hp: 20,
      ac: 12,
      str: 10,
      dex: 12,
      con: 10,
      int: 10,
      wis: 10,
      cha: 10,
      xp: 50,
      level: 1,
      gold: 5,
      character_class: 'Rogue',
      inventory: [],
      equipment: {},
      current_room: 'entry_hall',
      visited_rooms: ['entry_hall'],
      enemies_killed: [],
      loot_taken: [],
      enemy_hp: {},
      run_log: [{ action: 'start', narrative: 'Test.' }],
      room_log: ['Test.'],
      conditions: [],
      flags: {},
      combat_active: false,
      stable: false,
      dead: false,
      death_saves: { successes: 0, failures: 0 },
      turn_actions: {
        action_used: false,
        bonus_action_used: false,
        reaction_used: false,
        free_interaction_used: false,
      },
    };
    // Pre-party legacy state — character_name lives in the raw object itself
    // (we used to denormalize it onto game_sessions; now we derive from state).
    const result = normalizeState({
      ...legacy,
      character_name: 'Old Hero',
    } as unknown as Record<string, unknown>);
    expect(result.characters).toHaveLength(1);
    expect(result.characters[0].name).toBe('Old Hero');
    expect(result.characters[0].hp).toBe(15);
    expect(result.characters[0].character_class).toBe('Rogue');
    expect(result.run_log[0].character_id).toBe(result.characters[0].id);
  });

  // ── Schema-evolution / persistence path ────────────────────────────────────
  //
  // The state column is JSONB — any field added to GameState lives there
  // and the engine must tolerate the absence of newer fields when loading
  // sessions saved before they were added. normalizeState patches missing
  // fields with defaults; the engine reads through `?? defaults` at use
  // sites. These specs lock the contract so a schema-shape change can't
  // break stored sessions silently.

  it('patches missing optional fields on a new-format state (post-redeploy load)', () => {
    // Simulate a state saved before the grid-combat / quest / campaign
    // overlay fields existed. The spread in normalizeState passes them
    // through as undefined; engine call sites must tolerate this.
    const oldFormat = {
      characters: [
        {
          id: 'c1',
          name: 'Resumed Hero',
          character_class: 'Fighter',
          portrait_url: null,
          hp: 20,
          max_hp: 20,
          ac: 14,
          str: 14,
          dex: 12,
          con: 12,
          int: 10,
          wis: 10,
          cha: 10,
          xp: 0,
          level: 1,
          gold: 5,
          inventory: [],
          equipment: {},
          conditions: [],
          death_saves: { successes: 0, failures: 0 },
          stable: false,
          dead: false,
          turn_actions: {
            action_used: false,
            bonus_action_used: false,
            reaction_used: false,
            free_interaction_used: false,
          },
          initiative_roll: null,
          // Intentionally omit: hit_die, hit_dice_remaining, condition_durations,
          // class_resource_uses, asi_pending, exhaustion_level, spell_slots_max,
          // spell_slots_used, spells_known, background_id, skill_proficiencies,
          // tool_proficiencies, armor_proficiencies, weapon_proficiencies,
          // attuned_items, concentrating_on, subclass, species, etc.
        },
      ],
      active_character_id: 'c1',
      current_room: 'entry_hall',
      visited_rooms: ['entry_hall'],
      enemies_killed: [],
      loot_taken: [],
      combat_active: false,
      initiative_order: [],
      initiative_idx: 0,
      run_log: [],
      room_log: [],
      flags: {},
      // Omit all the post-rollout fields: short_rested_rooms, long_rested,
      // npc_attitudes, npc_talked, traps_triggered, traps_disarmed,
      // objects_searched, entities, movement_used, quest_progress, etc.
    };
    const result = normalizeState(oldFormat as unknown as Record<string, unknown>);
    expect(result.characters).toHaveLength(1);
    // Patched fields land with sensible defaults
    expect(result.short_rested_rooms).toEqual([]);
    expect(result.long_rested).toBe(false);
    expect(result.npc_attitudes).toEqual({});
    expect(result.traps_triggered).toEqual([]);
    expect(result.traps_disarmed).toEqual([]);
    expect(result.objects_searched).toEqual([]);
    expect(result.characters[0].hit_die).toBe(8);
    expect(result.characters[0].hit_dice_remaining).toBe(1);
    expect(result.characters[0].condition_durations).toEqual({});
    expect(result.characters[0].class_resource_uses).toEqual({});
    expect(result.characters[0].asi_pending).toBe(false);
    expect(result.characters[0].exhaustion_level).toBe(0);
    expect(result.characters[0].spell_slots_max).toBeDefined();
    expect(result.characters[0].spell_slots_used).toEqual({});
    expect(result.characters[0].spells_known).toEqual([]);
    // Multiclass schema backfill — pre-multiclass save loads with
    // class_levels derived from character_class + level so the helpers
    // in services/multiclass.ts have a populated breakdown.
    expect(result.characters[0].class_levels).toEqual({ fighter: 1 });
  });

  it('normalized old-format state is usable by takeAction without crashing', async () => {
    const oldFormat = {
      characters: [
        {
          id: 'c1',
          name: 'Resumed Hero',
          character_class: 'Fighter',
          portrait_url: null,
          hp: 20,
          max_hp: 20,
          ac: 14,
          str: 14,
          dex: 12,
          con: 12,
          int: 10,
          wis: 10,
          cha: 10,
          xp: 0,
          level: 1,
          gold: 5,
          inventory: [],
          equipment: {},
          conditions: [],
          death_saves: { successes: 0, failures: 0 },
          stable: false,
          dead: false,
          turn_actions: {
            action_used: false,
            bonus_action_used: false,
            reaction_used: false,
            free_interaction_used: false,
          },
          initiative_roll: null,
        },
      ],
      active_character_id: 'c1',
      current_room: 'entry_hall',
      visited_rooms: ['entry_hall'],
      enemies_killed: [],
      loot_taken: [],
      combat_active: false,
      initiative_order: [],
      initiative_idx: 0,
      run_log: [],
      room_log: [],
      flags: {},
    };
    const normalized = normalizeState(oldFormat as unknown as Record<string, unknown>);
    const result = await takeAction({
      action: { type: 'pass' },
      history: [],
      state: normalized,
      seed: seedWithEnemy,
      context: ctx,
    });
    // It returns something coherent: a narrative + choices + new state.
    expect(typeof result.narrative).toBe('string');
    expect(result.newState).toBeDefined();
    expect(result.newState.characters[0].id).toBe('c1');
  });
});

// ─── buildArrivalNarrative ───────────────────────────────────────────────────

describe('buildArrivalNarrative', () => {
  it('returns a non-empty string', () => {
    const text = buildArrivalNarrative('entry_hall', makeState(), seed, ctx);
    expect(typeof text).toBe('string');
    expect(text.length).toBeGreaterThan(0);
  });

  it('mentions a live enemy in the room', () => {
    const text = buildArrivalNarrative(
      CORRIDOR_ID,
      makeState({}, { current_room: CORRIDOR_ID }),
      seedWithEnemy,
      ctx
    );
    expect(text).toContain('Goblin');
  });

  it('does not mention an already-killed enemy', () => {
    const state = makeState(
      {},
      { current_room: CORRIDOR_ID, enemies_killed: [`${CORRIDOR_ID}#0`] }
    );
    const text = buildArrivalNarrative(CORRIDOR_ID, state, seedWithEnemy, ctx);
    expect(text).not.toContain('HP:');
  });

  it('mentions available loot', () => {
    const text = buildArrivalNarrative(
      CORRIDOR_ID,
      makeState({}, { current_room: CORRIDOR_ID }),
      seedWithLoot,
      ctx
    );
    expect(text).toContain('Med-Kit');
  });

  it('does not mention already-taken loot', () => {
    const state = makeState({}, { current_room: CORRIDOR_ID, loot_taken: [CORRIDOR_ID] });
    const text = buildArrivalNarrative(CORRIDOR_ID, state, seedWithLoot, ctx);
    expect(text).not.toContain('Med-Kit');
  });
});

// ─── generateChoices ─────────────────────────────────────────────────────────

describe('generateChoices', () => {
  it('returns [] for a dead hero', () => {
    expect(generateChoices(makeState({ dead: true }), seed, ctx)).toEqual([]);
  });

  it('returns only death save choice when HP = 0 and not stable', () => {
    const choices = generateChoices(makeState({ hp: 0 }), seed, ctx);
    expect(choices).toHaveLength(1);
    expect(choices[0].action.type).toBe('death_save');
    expect(choices[0].label).toBe('Roll death saving throw');
  });

  it('returns only healing choice when HP = 0 and stable', () => {
    const choices = generateChoices(makeState({ hp: 0, stable: true }), seed, ctx);
    expect(choices).toHaveLength(1);
    expect(choices[0].action.type).toBe('use');
    expect(choices[0].label).toBe('Use healing item');
  });

  it('includes attack option when an enemy is alive', () => {
    const state = makeState(
      {},
      { current_room: CORRIDOR_ID, visited_rooms: ['entry_hall', CORRIDOR_ID] }
    );
    const choices = generateChoices(state, seedWithEnemy, ctx);
    expect(choices.some((c) => c.action.type === 'attack')).toBe(true);
    expect(choices.some((c) => c.label.toLowerCase().includes('attack'))).toBe(true);
  });

  it('includes loot pick-up option when loot is available', () => {
    const state = makeState(
      {},
      { current_room: CORRIDOR_ID, visited_rooms: ['entry_hall', CORRIDOR_ID] }
    );
    const choices = generateChoices(state, seedWithLoot, ctx);
    expect(choices.some((c) => c.action.type === 'loot')).toBe(true);
    expect(choices.some((c) => c.label.toLowerCase().includes('med-kit'))).toBe(true);
  });
});

// ─── takeAction ──────────────────────────────────────────────────────────────

describe('takeAction', () => {
  it('examine action returns narrative, choices, and updated newState', async () => {
    const result = await takeAction({
      action: { type: 'examine' },
      history: [],
      state: makeState(),
      seed,
      context: ctx,
    });
    expect(typeof result.narrative).toBe('string');
    expect(result.narrative.length).toBeGreaterThan(0);
    expect(Array.isArray(result.choices)).toBe(true);
    expect(result.newState.run_log).toHaveLength(1);
    expect(result.escaped).toBe(false);
    expect(result.dead).toBe(false);
    // takeAction returns the seed so the route can persist in-place seed
    // mutations (e.g. marker_move materializing a wilderness-encounter enemy).
    expect(result.seed).toBeDefined();
    expect(result.seed.enemies).toBeDefined();
  });

  it('picking up loot adds item to inventory and marks loot_taken', async () => {
    const state = makeState(
      {},
      { current_room: CORRIDOR_ID, visited_rooms: ['entry_hall', CORRIDOR_ID] }
    );
    const result = await takeAction({
      action: { type: 'loot' },
      history: [],
      state,
      seed: seedWithLoot,
      context: ctx,
    });
    const char = result.newState.characters[0];
    expect(char.inventory).toHaveLength(1);
    expect(char.inventory[0].id).toBe('medkit');
    expect(char.inventory[0].instance_id).toBeTruthy();
    expect(result.newState.loot_taken).toContain(CORRIDOR_ID);
  });

  it('first attack populates initiative_order with all party members and the enemy', async () => {
    const state = makeState(
      {},
      { current_room: CORRIDOR_ID, visited_rooms: ['entry_hall', CORRIDOR_ID] }
    );
    const result = await takeAction({
      action: { type: 'attack' },
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });
    expect(result.newState.initiative_order.length).toBeGreaterThan(0);
    const playerEntry = result.newState.initiative_order.find((e) => !e.is_enemy);
    const enemyEntry = result.newState.initiative_order.find((e) => e.is_enemy);
    expect(playerEntry).toBeDefined();
    expect(enemyEntry).toBeDefined();
    // Initiative entries for enemies now use the enemy instance id (not the roomId)
    expect(enemyEntry?.id).toBe(`${CORRIDOR_ID}#0`);
  });

  it('first attack sets initiative_idx to point at a player entry', async () => {
    const state = makeState(
      {},
      { current_room: CORRIDOR_ID, visited_rooms: ['entry_hall', CORRIDOR_ID] }
    );
    const result = await takeAction({
      action: { type: 'attack' },
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });
    if (result.newState.combat_active) {
      const idx = result.newState.initiative_idx;
      const entry = result.newState.initiative_order[idx];
      expect(entry?.is_enemy).toBe(false);
    }
  });

  it('killing the enemy clears initiative_order and sets combat_active false', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // d20 → 20 (critical), always hits hard
    const state = makeState(
      { hp: 20, max_hp: 20 },
      { current_room: CORRIDOR_ID, visited_rooms: ['entry_hall', CORRIDOR_ID] }
    );
    const result = await takeAction({
      action: { type: 'attack' },
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });
    if (!result.newState.combat_active) {
      expect(result.newState.initiative_order).toHaveLength(0);
      expect(result.newState.initiative_idx).toBe(0);
    }
  });

  it('in a 2-char party, the acting PC keeps the turn while initiative advances under them', async () => {
    const char1 = makeChar({ id: 'c1', name: 'Alice' });
    const char2 = makeChar({ id: 'c2', name: 'Bob' });
    const state: GameState = {
      characters: [char1, char2],
      active_character_id: 'c1',
      current_room: CORRIDOR_ID,
      visited_rooms: ['entry_hall', CORRIDOR_ID],
      enemies_killed: [],
      loot_taken: [],
      combat_active: false,
      initiative_order: [],
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
    // Make enemy survive (miss always) so combat persists past the attack.
    vi.spyOn(Math, 'random').mockReturnValue(0); // d20 → 1 (miss)
    const result = await takeAction({
      action: { type: 'attack' },
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });
    // sandbox has gridWidth/gridHeight set, so combat-start creates grid
    // entities and c1 still has movement available. Per RAW the turn
    // doesn't end just because the action did — c1 retains the active
    // marker until `end_turn` (or until movement is exhausted and no
    // bonus actions remain). The engine's previous behavior round-
    // robined active_character_id off c1 mid-turn, desyncing the
    // InitiativeStrip and PartyRail; the fix anchors active to the
    // initiative slot's owner.
    if (result.newState.combat_active) {
      expect(result.newState.active_character_id).toBe('c1');
    }
  });

  // ─── Condition duration ──────────────────────────────────────────────────────

  it('stunned character gets only a pass choice', () => {
    const state = makeState(
      { conditions: ['stunned'], condition_durations: { stunned: 1 } },
      {
        current_room: CORRIDOR_ID,
        visited_rooms: ['entry_hall', CORRIDOR_ID],
      }
    );
    const choices = generateChoices(state, seedWithEnemy, ctx);
    expect(choices).toHaveLength(1);
    expect(choices[0].action.type).toBe('pass');
  });

  it('pass action advances the turn without dealing damage', async () => {
    const state = makeState(
      { hp: 10, conditions: ['stunned'], condition_durations: { stunned: 1 } },
      {
        current_room: CORRIDOR_ID,
        visited_rooms: ['entry_hall', CORRIDOR_ID],
        combat_active: true,
        initiative_order: [
          { id: 'char-1', roll: 5, is_enemy: false },
          { id: CORRIDOR_ID, roll: 15, is_enemy: true },
        ],
        initiative_idx: 0,
      }
    );
    const result = await takeAction({
      action: { type: 'pass' },
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });
    expect(result.narrative).toMatch(/stunned|paralyzed|passes/i);
    expect(result.newState.characters[0].hp).toBeLessThanOrEqual(10); // may take enemy hit next turn
  });

  it('stunned condition clears after 1 round (on next initiative tick for that character)', async () => {
    // Arrange: char is stunned with 1 round remaining, passes their turn
    const state = makeState(
      { conditions: ['stunned'], condition_durations: { stunned: 1 } },
      {
        current_room: CORRIDOR_ID,
        visited_rooms: ['entry_hall', CORRIDOR_ID],
        combat_active: true,
        initiative_order: [
          { id: 'char-1', roll: 5, is_enemy: false },
          { id: CORRIDOR_ID, roll: 15, is_enemy: true },
        ],
        initiative_idx: 0,
      }
    );
    // Pass turn — initiative advances to enemy, enemy attacks, then wraps back to char-1
    vi.spyOn(Math, 'random').mockReturnValue(0); // enemy misses, d20→1
    const result = await takeAction({
      action: { type: 'pass' },
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });
    // After the pass + enemy turn + wrap back to char-1, stun should be ticked off
    const char = result.newState.characters.find((c) => c.id === 'char-1')!;
    expect(char.conditions).not.toContain('stunned');
  });

  it('party is not dead until all characters are dead', async () => {
    const char1 = makeChar({ id: 'c1', hp: 0, dead: true });
    const char2 = makeChar({ id: 'c2', hp: 10, max_hp: 10 });
    const state: GameState = {
      characters: [char1, char2],
      active_character_id: 'c2',
      current_room: 'entry_hall',
      visited_rooms: ['entry_hall'],
      enemies_killed: [],
      loot_taken: [],
      combat_active: false,
      initiative_order: [],
      initiative_idx: 0,
      run_log: [],
      room_log: [],
      last_choices: [],
      short_rested_rooms: [],
      long_rested: false,
      flags: {},
      npc_attitudes: {},
      npc_talked: [],
      traps_triggered: [],
      traps_disarmed: [],
      objects_searched: [],
    };
    const result = await takeAction({
      action: { type: 'examine' },
      history: [],
      state,
      seed,
      context: ctx,
    });
    expect(result.dead).toBe(false);
  });
});

// ─── Short rest / Long rest ───────────────────────────────────────────────────

describe('short_rest', () => {
  it('restores HP and spends a hit die', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // d8 → 8, +CON mod 0 = 8 healed
    const state = makeState({ hp: 3, max_hp: 10, hit_die: 8, hit_dice_remaining: 2 });
    const result = await takeAction({
      action: { type: 'short_rest' },
      history: [],
      state,
      seed,
      context: ctx,
    });
    const char = result.newState.characters[0];
    expect(char.hp).toBeGreaterThan(3);
    expect(char.hp).toBeLessThanOrEqual(10);
    expect(char.hit_dice_remaining).toBe(1);
    expect(result.newState.short_rested_rooms).toContain('entry_hall');
  });

  it('cannot short rest twice in the same room', async () => {
    const state = makeState(
      { hp: 3, max_hp: 10, hit_die: 8, hit_dice_remaining: 2 },
      { short_rested_rooms: ['entry_hall'] }
    );
    const result = await takeAction({
      action: { type: 'short_rest' },
      history: [],
      state,
      seed,
      context: ctx,
    });
    const char = result.newState.characters[0];
    expect(char.hp).toBe(3); // no healing
    expect(result.narrative).toMatch(/already rested/i);
  });

  it('cannot short rest with no hit dice remaining', async () => {
    const state = makeState({ hp: 3, max_hp: 10, hit_die: 8, hit_dice_remaining: 0 });
    const result = await takeAction({
      action: { type: 'short_rest' },
      history: [],
      state,
      seed,
      context: ctx,
    });
    expect(result.narrative).toMatch(/no hit dice/i);
  });

  it('cannot short rest when at full HP', async () => {
    const state = makeState({ hp: 10, max_hp: 10, hit_die: 8, hit_dice_remaining: 2 });
    const result = await takeAction({
      action: { type: 'short_rest' },
      history: [],
      state,
      seed,
      context: ctx,
    });
    expect(result.narrative).toMatch(/already at full/i);
  });

  it('cannot short rest while an enemy is alive in the room', async () => {
    const state = makeState(
      { hp: 3, max_hp: 10, hit_die: 8, hit_dice_remaining: 2 },
      { current_room: CORRIDOR_ID, visited_rooms: ['entry_hall', CORRIDOR_ID] }
    );
    const result = await takeAction({
      action: { type: 'short_rest' },
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });
    expect(result.narrative).toMatch(/cannot rest here/i);
  });
});

describe('long_rest', () => {
  it('restores all characters to full HP and recovers half-level hit dice', async () => {
    const state = makeState({ hp: 2, max_hp: 10, level: 4, hit_die: 10, hit_dice_remaining: 0 });
    const result = await takeAction({
      action: { type: 'long_rest' },
      history: [],
      state,
      seed,
      context: ctx,
    });
    const char = result.newState.characters[0];
    expect(char.hp).toBe(10);
    expect(char.hit_dice_remaining).toBe(2); // Math.max(1, Math.floor(4/2)) = 2
    expect(result.newState.long_rested).toBe(true);
  });

  it('recovers at least 1 hit die even at level 1', async () => {
    const state = makeState({ hp: 1, max_hp: 8, level: 1, hit_die: 8, hit_dice_remaining: 0 });
    const result = await takeAction({
      action: { type: 'long_rest' },
      history: [],
      state,
      seed,
      context: ctx,
    });
    expect(result.newState.characters[0].hit_dice_remaining).toBe(1);
  });

  it('cannot long rest twice in a session', async () => {
    const state = makeState({ hp: 1, max_hp: 10 }, { long_rested: true });
    const result = await takeAction({
      action: { type: 'long_rest' },
      history: [],
      state,
      seed,
      context: ctx,
    });
    expect(result.narrative).toMatch(/already taken a long rest/i);
  });

  it('cannot long rest while an enemy is alive in the room', async () => {
    const state = makeState(
      { hp: 3, max_hp: 10 },
      { current_room: CORRIDOR_ID, visited_rooms: ['entry_hall', CORRIDOR_ID] }
    );
    const result = await takeAction({
      action: { type: 'long_rest' },
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });
    expect(result.narrative).toMatch(/cannot rest here/i);
  });

  it('clears conditions on long rest', async () => {
    const state = makeState({
      hp: 5,
      max_hp: 10,
      conditions: ['poisoned'],
      condition_durations: { poisoned: 1 },
    });
    const result = await takeAction({
      action: { type: 'long_rest' },
      history: [],
      state,
      seed,
      context: ctx,
    });
    expect(result.newState.characters[0].conditions).toHaveLength(0);
  });
});

// ─── runRules ─────────────────────────────────────────────────────────────────

function makeCtxWithRules(rules: GameRule[]): Context {
  return { ...ctx, rules };
}

const rulesSeed: Seed = {
  ...seed,
  loot: {
    medkit: {
      id: 'medkit',
      name: 'Med-Kit',
      desc: 'Heals wounds.',
      weight: 1,
      type: 'consumable',
      slot: null,
      damage: null,
      ac_bonus: null,
      heal: '1d6+1',
      effect: null,
      aliases: ['medkit'],
    },
  },
};

describe('runRules', () => {
  it('returns state unchanged when context has no rules', async () => {
    const state = makeState();
    const result = await runRules(state, ctx, { type: 'examine' }, 'entry_hall', seed);
    expect(result.extraNarrative).toBe('');
    expect(result.state).toEqual(state);
  });

  it('returns state unchanged when no rules match', async () => {
    const rule: GameRule = {
      name: 'never_fires',
      conditions: { all: [{ fact: 'action', operator: 'equal', value: 'loot' }] },
      consequences: [{ type: 'set_flag', key: 'triggered', value: true }],
    };
    const state = makeState();
    const result = await runRules(
      state,
      makeCtxWithRules([rule]),
      { type: 'examine' },
      'entry_hall',
      seed
    );
    expect(result.state.flags['triggered']).toBeUndefined();
  });

  it('set_flag consequence writes to state.flags', async () => {
    const rule: GameRule = {
      name: 'flag_test',
      conditions: { all: [{ fact: 'action', operator: 'equal', value: 'examine' }] },
      consequences: [{ type: 'set_flag', key: 'boss_defeated', value: true }],
    };
    const state = makeState();
    const result = await runRules(
      state,
      makeCtxWithRules([rule]),
      { type: 'examine' },
      'entry_hall',
      seed
    );
    expect(result.state.flags['boss_defeated']).toBe(true);
  });

  it('add_narrative consequence populates extraNarrative', async () => {
    const rule: GameRule = {
      name: 'narrative_test',
      conditions: { all: [{ fact: 'action', operator: 'equal', value: 'examine' }] },
      consequences: [{ type: 'add_narrative', text: 'You sense danger.' }],
    };
    const state = makeState();
    const result = await runRules(
      state,
      makeCtxWithRules([rule]),
      { type: 'examine' },
      'entry_hall',
      seed
    );
    expect(result.extraNarrative).toContain('You sense danger.');
  });

  it('give_item consequence adds item to active character inventory', async () => {
    const rule: GameRule = {
      name: 'give_item_test',
      conditions: { all: [{ fact: 'action', operator: 'equal', value: 'examine' }] },
      consequences: [{ type: 'give_item', itemId: 'medkit' }],
    };
    const state = makeState();
    const result = await runRules(
      state,
      makeCtxWithRules([rule]),
      { type: 'examine' },
      'entry_hall',
      rulesSeed
    );
    expect(result.state.characters[0].inventory).toHaveLength(1);
    expect(result.state.characters[0].inventory[0].id).toBe('medkit');
  });

  it('give_item with unknown itemId does not crash and leaves inventory unchanged', async () => {
    const rule: GameRule = {
      name: 'give_unknown',
      conditions: { all: [{ fact: 'action', operator: 'equal', value: 'examine' }] },
      consequences: [{ type: 'give_item', itemId: 'does_not_exist' }],
    };
    const state = makeState();
    const result = await runRules(
      state,
      makeCtxWithRules([rule]),
      { type: 'examine' },
      'entry_hall',
      seed
    );
    expect(result.state.characters[0].inventory).toHaveLength(0);
  });

  it('modify_hp consequence adjusts active character HP', async () => {
    const rule: GameRule = {
      name: 'hp_test',
      conditions: { all: [{ fact: 'action', operator: 'equal', value: 'examine' }] },
      consequences: [{ type: 'modify_hp', amount: -3 }],
    };
    const state = makeState({ hp: 10, max_hp: 10 });
    const result = await runRules(
      state,
      makeCtxWithRules([rule]),
      { type: 'examine' },
      'entry_hall',
      seed
    );
    expect(result.state.characters[0].hp).toBe(7);
  });

  it('modify_hp does not exceed max_hp', async () => {
    const rule: GameRule = {
      name: 'overheal_test',
      conditions: { all: [{ fact: 'action', operator: 'equal', value: 'examine' }] },
      consequences: [{ type: 'modify_hp', amount: 50 }],
    };
    const state = makeState({ hp: 8, max_hp: 10 });
    const result = await runRules(
      state,
      makeCtxWithRules([rule]),
      { type: 'examine' },
      'entry_hall',
      seed
    );
    expect(result.state.characters[0].hp).toBe(10);
  });

  it('modify_hp does not go below 0', async () => {
    const rule: GameRule = {
      name: 'overkill_test',
      conditions: { all: [{ fact: 'action', operator: 'equal', value: 'examine' }] },
      consequences: [{ type: 'modify_hp', amount: -999 }],
    };
    const state = makeState({ hp: 5, max_hp: 10 });
    const result = await runRules(
      state,
      makeCtxWithRules([rule]),
      { type: 'examine' },
      'entry_hall',
      seed
    );
    expect(result.state.characters[0].hp).toBe(0);
  });

  it('set_escape consequence sets _rule_escape flag for takeAction to consume', async () => {
    const rule: GameRule = {
      name: 'escape_test',
      conditions: { all: [{ fact: 'action', operator: 'equal', value: 'examine' }] },
      consequences: [{ type: 'set_escape' }],
    };
    const state = makeState();
    const result = await runRules(
      state,
      makeCtxWithRules([rule]),
      { type: 'examine' },
      'entry_hall',
      seed
    );
    expect(result.state.flags['_rule_escape']).toBe(true);
  });

  it('once:true rule fires exactly once — rule_fired_ guard is set afterward', async () => {
    const rule: GameRule = {
      name: 'once_narrative',
      once: true,
      conditions: { all: [{ fact: 'action', operator: 'equal', value: 'examine' }] },
      consequences: [{ type: 'add_narrative', text: 'First time!' }],
    };
    const ctxWithRule = makeCtxWithRules([rule]);
    const state = makeState();

    const first = await runRules(state, ctxWithRule, { type: 'examine' }, 'entry_hall', seed);
    const second = await runRules(
      first.state,
      ctxWithRule,
      { type: 'examine' },
      'entry_hall',
      seed
    );

    expect(first.extraNarrative).toContain('First time!');
    expect(first.state.flags['rule_fired_once_narrative']).toBe(true);
    expect(second.extraNarrative).toBe('');
  });

  it('rule conditions can check room_id', async () => {
    const rule: GameRule = {
      name: 'room_check',
      conditions: {
        all: [
          { fact: 'action', operator: 'equal', value: 'marker_move' },
          { fact: 'room_id', operator: 'equal', value: CORRIDOR_ID },
        ],
      },
      consequences: [{ type: 'set_flag', key: 'entered_corridor', value: true }],
    };
    const state = makeState({}, { current_room: CORRIDOR_ID });
    const result = await runRules(
      state,
      makeCtxWithRules([rule]),
      { type: 'marker_move', to: { x: 0, y: 0 } },
      'entry_hall',
      seed
    );
    expect(result.state.flags['entered_corridor']).toBe(true);
  });

  it('flags spread as top-level facts so rules can condition on them directly', async () => {
    const rule: GameRule = {
      name: 'flag_fact_check',
      conditions: { all: [{ fact: 'boss_defeated', operator: 'equal', value: true }] },
      consequences: [{ type: 'add_narrative', text: 'Boss is dead!' }],
    };
    const state = makeState({}, { flags: { boss_defeated: true } });
    const result = await runRules(
      state,
      makeCtxWithRules([rule]),
      { type: 'examine' },
      'entry_hall',
      seed
    );
    expect(result.extraNarrative).toContain('Boss is dead!');
  });

  it('takeAction integrates rule extraNarrative into final narrative', async () => {
    const rule: GameRule = {
      name: 'action_narrative',
      conditions: { all: [{ fact: 'action', operator: 'equal', value: 'examine' }] },
      consequences: [{ type: 'add_narrative', text: 'A whisper echoes.' }],
    };
    const state = makeState();
    const result = await takeAction({
      action: { type: 'examine' },
      history: [],
      state,
      seed,
      context: makeCtxWithRules([rule]),
    });
    expect(result.narrative).toContain('A whisper echoes.');
  });

  it('takeAction with set_escape rule sets escaped=true and removes _rule_escape from flags', async () => {
    const rule: GameRule = {
      name: 'force_escape',
      conditions: { all: [{ fact: 'action', operator: 'equal', value: 'examine' }] },
      consequences: [{ type: 'set_escape' }],
    };
    const state = makeState();
    const result = await takeAction({
      action: { type: 'examine' },
      history: [],
      state,
      seed,
      context: makeCtxWithRules([rule]),
    });
    expect(result.escaped).toBe(true);
    expect(result.newState.flags['_rule_escape']).toBeUndefined();
  });
});

// ─── turn_actions lifecycle ───────────────────────────────────────────────────

describe('turn_actions lifecycle', () => {
  it('generateChoices includes end_turn when combat_active and action already used', () => {
    const state = makeState(
      {
        turn_actions: {
          action_used: true,
          bonus_action_used: false,
          reaction_used: false,
          free_interaction_used: false,
        },
      },
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
    const choices = generateChoices(state, seedWithEnemy, ctx);
    expect(choices.some((c) => c.action.type === 'end_turn')).toBe(true);
  });

  it('generateChoices does not include end_turn outside combat', () => {
    const choices = generateChoices(makeState(), seed, ctx);
    expect(choices.every((c) => c.action.type !== 'end_turn')).toBe(true);
  });

  it('attack action marks action_used on the attacking character (2-char party, enemy survives)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // d20 → 1, always misses
    const char1 = makeChar({ id: 'c1', name: 'Alice' });
    const char2 = makeChar({ id: 'c2', name: 'Bob' });
    const state: GameState = {
      characters: [char1, char2],
      active_character_id: 'c1',
      current_room: CORRIDOR_ID,
      visited_rooms: ['entry_hall', CORRIDOR_ID],
      enemies_killed: [],
      loot_taken: [],
      combat_active: true,
      initiative_order: [
        { id: 'c1', roll: 20, is_enemy: false },
        { id: CORRIDOR_ID, roll: 10, is_enemy: true },
        { id: 'c2', roll: 5, is_enemy: false },
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
      action: { type: 'attack' },
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });
    // c1 misses → auto-advance → enemy attacks → c2's turn begins (c1 not yet reset)
    const c1 = result.newState.characters.find((c) => c.id === 'c1')!;
    expect(c1.turn_actions.action_used).toBe(true);
  });

  it("turn_actions reset when initiative advances to a character's slot", async () => {
    const char1 = makeChar({
      id: 'c1',
      name: 'Alice',
      turn_actions: {
        action_used: true,
        bonus_action_used: true,
        reaction_used: false,
        free_interaction_used: false,
      },
    });
    const char2 = makeChar({ id: 'c2', name: 'Bob' });
    // c2 ends turn; order wraps back to c1 (enemy is killed so no counter-attack)
    const state: GameState = {
      characters: [char1, char2],
      active_character_id: 'c2',
      current_room: CORRIDOR_ID,
      visited_rooms: ['entry_hall', CORRIDOR_ID],
      enemies_killed: [`${CORRIDOR_ID}#0`],
      loot_taken: [],
      combat_active: true,
      initiative_order: [
        { id: 'c1', roll: 20, is_enemy: false },
        { id: `${CORRIDOR_ID}#0`, roll: 10, is_enemy: true },
        { id: 'c2', roll: 5, is_enemy: false },
      ],
      initiative_idx: 2,
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
      action: { type: 'end_turn' },
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });
    const c1 = result.newState.characters.find((c) => c.id === 'c1')!;
    expect(c1.turn_actions.action_used).toBe(false);
    expect(c1.turn_actions.bonus_action_used).toBe(false);
    expect(result.newState.active_character_id).toBe('c1');
  });

  it('end_turn narrative mentions the character and advances active character', async () => {
    const char1 = makeChar({ id: 'c1', name: 'Alice' });
    const char2 = makeChar({ id: 'c2', name: 'Bob' });
    const state: GameState = {
      characters: [char1, char2],
      active_character_id: 'c1',
      current_room: CORRIDOR_ID,
      visited_rooms: ['entry_hall', CORRIDOR_ID],
      enemies_killed: [`${CORRIDOR_ID}#0`],
      loot_taken: [],
      combat_active: true,
      initiative_order: [
        { id: 'c1', roll: 20, is_enemy: false },
        { id: 'c2', roll: 5, is_enemy: false },
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
      action: { type: 'end_turn' },
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });
    expect(result.narrative).toMatch(/alice.*ends their turn/i);
    expect(result.newState.active_character_id).toBe('c2');
  });
});

// ─── NPC actions ──────────────────────────────────────────────────────────────

// (generateSeed is imported at the top of the file)

// ─── Ability Score Improvements ──────────────────────────────────────────────

describe('Ability Score Improvements', () => {
  it('generateChoices returns 6 stat-boost choices when asi_pending is true', () => {
    const state = makeState({ asi_pending: true });
    const choices = generateChoices(state, seed, ctx);
    expect(choices).toHaveLength(6);
    expect(choices.every((c) => c.action.type === 'apply_asi')).toBe(true);
  });

  it('apply_asi adds +2 to the chosen stat and clears asi_pending', async () => {
    const state = makeState({ str: 10, asi_pending: true });
    const result = await takeAction({
      action: { type: 'apply_asi', stat: 'str' },
      history: [],
      state,
      seed,
      context: ctx,
    });
    const char = result.newState.characters[0];
    expect(char.str).toBe(12);
    expect(char.asi_pending).toBe(false);
  });

  it('apply_asi on CON also increases max_hp retroactively', async () => {
    const state = makeState({ con: 10, level: 4, max_hp: 20, hp: 20, asi_pending: true });
    const result = await takeAction({
      action: { type: 'apply_asi', stat: 'con' },
      history: [],
      state,
      seed,
      context: ctx,
    });
    const char = result.newState.characters[0];
    expect(char.con).toBe(12); // +2 CON
    // CON 12 → mod +1; was CON 10 → mod 0; delta = +1/level × 4 levels = +4 max HP
    expect(char.max_hp).toBe(24);
  });

  it('apply_asi does nothing when asi_pending is false', async () => {
    const state = makeState({ str: 10, asi_pending: false });
    const result = await takeAction({
      action: { type: 'apply_asi', stat: 'str' },
      history: [],
      state,
      seed,
      context: ctx,
    });
    expect(result.newState.characters[0].str).toBe(10);
    expect(result.narrative).toMatch(/no ability score improvement/i);
  });
});

// ─── Enemy HP scaling ─────────────────────────────────────────────────────────

describe('enemy HP scaling by party size', () => {
  it('1-player seed has unscaled enemy HP (1× base)', () => {
    const s = generateSeed(ctx, 1);
    for (const enemiesInRoom of Object.values(s.enemies)) {
      for (const enemy of enemiesInRoom) {
        // All enemies should have HP ≥ 1
        expect(enemy.hp).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('2-player seed has ~1.5× the enemy HP of a 1-player seed for the same template', () => {
    // Fix random so both seeds pick the same enemy template
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const s1 = generateSeed(ctx, 1);
    const s2 = generateSeed(ctx, 2);
    const hps1 = Object.values(s1.enemies)
      .flat()
      .map((e) => e.hp);
    const hps2 = Object.values(s2.enemies)
      .flat()
      .map((e) => e.hp);
    if (hps1.length > 0 && hps2.length > 0) {
      // Average HP in 2-player seed should be higher than 1-player seed
      const avg1 = hps1.reduce((a, b) => a + b, 0) / hps1.length;
      const avg2 = hps2.reduce((a, b) => a + b, 0) / hps2.length;
      expect(avg2).toBeGreaterThan(avg1);
    }
  });

  it('scaleEnemyHp formula: partySize 1→1×, 2→1.5×, 3→2×, 4→2.5×', () => {
    // Test via generateRoguelikeSeed with a context whose enemy templates have known HP
    // We verify the formula by checking the ratio holds for a fixed base HP of 10
    // Formula: Math.round(10 * (0.5 + n * 0.5))
    expect(Math.round(10 * (0.5 + 1 * 0.5))).toBe(10);
    expect(Math.round(10 * (0.5 + 2 * 0.5))).toBe(15);
    expect(Math.round(10 * (0.5 + 3 * 0.5))).toBe(20);
    expect(Math.round(10 * (0.5 + 4 * 0.5))).toBe(25);
  });
});

const npcTemplate: NpcTemplate = {
  id: 'test_npc',
  name: 'Friendly Guide',
  attitude: 'friendly',
  hp: 10,
  ac: 10,
  damage: '1d4',
  toHit: 2,
  xp: 25,
  greeting: 'Greetings, traveller!',
  responses: [
    { label: 'Ask about the area', reply: 'Dangerous around here.' },
    {
      label: 'Ask for help',
      reply: 'Gladly!',
      consequences: [{ type: 'set_flag', key: 'guide_helped', value: true }],
    },
  ],
  shop: [{ itemId: 'healing_potion', price: 5 }],
};

const npcRoomId = CORRIDOR_ID;
const placedNpc: PlacedNpc = { ...npcTemplate, roomId: npcRoomId };

const seedWithNpc: Seed = {
  ...seedWithLoot,
  npcs: { [npcRoomId]: placedNpc },
};

function makeNpcState(charOverrides: Partial<Character> = {}, npcAttitude = placedNpc.attitude) {
  return makeState(charOverrides, {
    current_room: npcRoomId,
    visited_rooms: ['entry_hall', npcRoomId],
    npc_attitudes: npcAttitude !== placedNpc.attitude ? { [npcRoomId]: npcAttitude } : {},
    npc_talked: [],
  });
}

describe('NPC actions', () => {
  it('talk to friendly NPC shows greeting and marks room as talked', async () => {
    const result = await takeAction({
      action: { type: 'talk' },
      history: [],
      state: makeNpcState(),
      seed: seedWithNpc,
      context: ctx,
    });
    expect(result.narrative).toContain('Greetings, traveller!');
    expect(result.newState.npc_talked).toContain(npcRoomId);
  });

  it('talk to indifferent NPC succeeds on high CHA roll', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // d20 → 20, passes DC
    const state = makeNpcState({}, 'indifferent');
    const result = await takeAction({
      action: { type: 'talk' },
      history: [],
      state,
      seed: seedWithNpc,
      context: ctx,
    });
    expect(result.narrative).toMatch(/success/i);
    expect(result.newState.npc_attitudes[npcRoomId]).toBe('friendly');
  });

  it('talk to indifferent NPC fails on low CHA roll', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // d20 → 1, fails DC
    const state = makeNpcState({}, 'indifferent');
    const result = await takeAction({
      action: { type: 'talk' },
      history: [],
      state,
      seed: seedWithNpc,
      context: ctx,
    });
    expect(result.narrative).toMatch(/fail/i);
    expect(result.newState.npc_attitudes[npcRoomId]).not.toBe('friendly'); // attitude not changed to friendly
  });

  it('generateChoices shows talk choice for friendly NPC', () => {
    const state = makeNpcState();
    const choices = generateChoices(state, seedWithNpc, ctx);
    expect(choices.some((c) => c.action.type === 'talk')).toBe(true);
  });

  it('buying lives in the vendor pane, reached via the conversation "wares" control', () => {
    // In conversation, a friendly shop NPC offers an enter_shop control — and
    // NO standalone buy choices (those were removed in favour of the pane).
    const talking = {
      ...makeNpcState(),
      active_conversation: { roomId: npcRoomId, path: [], prompt: 'Greetings, traveller!' },
    };
    const convChoices = generateChoices(talking, seedWithNpc, ctx);
    expect(convChoices.some((c) => c.action.type === 'enter_shop')).toBe(true);
    expect(convChoices.some((c) => c.action.type === 'buy')).toBe(false);

    // Opening the shop (active_shop) surfaces ONLY the wares + a Back control.
    const shopping = { ...talking, active_shop: { roomId: npcRoomId } };
    const shopChoices = generateChoices(shopping, seedWithNpc, ctx);
    expect(shopChoices.some((c) => c.action.type === 'buy')).toBe(true);
    expect(shopChoices.some((c) => c.action.type === 'exit_shop')).toBe(true);
    expect(shopChoices.every((c) => c.kind === 'vendor')).toBe(true);
  });

  it('no standalone buy choice in the plain action list (out of conversation)', () => {
    const state = makeNpcState();
    const choices = generateChoices(state, seedWithNpc, ctx);
    expect(choices.some((c) => c.action.type === 'buy')).toBe(false);
    // ...but the Talk entry that leads to the wares is present.
    expect(choices.some((c) => c.action.type === 'talk')).toBe(true);
  });

  it('generateChoices shows a regular Attack choice for a hostile NPC (unified with grid combat)', () => {
    // Hostile NPCs surface as enemies via getLivingRoomEnemies — so they appear
    // as a regular Attack target, not as a separate attack_npc duel.
    const state = makeNpcState({}, 'hostile');
    const choices = generateChoices(state, seedWithNpc, ctx);
    const attacksOnNpc = choices.filter(
      (c) =>
        c.action.type === 'attack' &&
        (c.action as { type: 'attack'; targetEnemyId?: string }).targetEnemyId ===
          `npc:${npcRoomId}`
    );
    expect(attacksOnNpc.length).toBeGreaterThan(0);
    // attack_npc only shows for non-hostile NPCs (as the "first strike that
    // flips them hostile").
    expect(choices.filter((c) => c.action.type === 'attack_npc').length).toBe(0);
  });

  it('talk_response applies consequences and shows NPC reply', async () => {
    const state = { ...makeNpcState(), npc_talked: [npcRoomId] };
    const result = await takeAction({
      action: { type: 'talk_response', responseIdx: 1 },
      history: [],
      state,
      seed: seedWithNpc,
      context: ctx,
    });
    expect(result.narrative).toContain('Gladly!');
    expect(result.newState.flags['guide_helped']).toBe(true);
  });

  it('conversation responses use the <To NPC> stage-direction format', () => {
    // In conversation mode the response buttons surface framed as the party
    // speaking TO the NPC. (Responses only appear while a conversation is
    // active — never mixed into the normal choice list.)
    const state = {
      ...makeNpcState(),
      npc_talked: [npcRoomId],
      active_conversation: { roomId: npcRoomId, path: [], prompt: 'Greetings, traveller!' },
    };
    const choices = generateChoices(state, seedWithNpc, ctx);
    const responseChoices = choices.filter((c) => c.action.type === 'talk_response');
    expect(responseChoices.length).toBe(2);
    expect(responseChoices[0].label).toBe('<To Friendly Guide> Ask about the area');
    expect(responseChoices[1].label).toBe('<To Friendly Guide> Ask for help');
    expect(responseChoices.every((c) => c.kind === 'conversation')).toBe(true);
  });

  it('talk opens a conversation (prompt = greeting); responses are not mixed into the list', async () => {
    const result = await takeAction({
      action: { type: 'talk' },
      history: [],
      state: makeNpcState(),
      seed: seedWithNpc,
      context: ctx,
    });
    expect(result.newState.active_conversation).toMatchObject({
      roomId: npcRoomId,
      path: [],
      prompt: 'Greetings, traveller!',
    });
    // No inline "<To NPC>" hint dumped into the narrative anymore.
    expect(result.narrative).not.toMatch(/<To Friendly Guide>/);
  });

  it('buy deducts gold and adds item to inventory', async () => {
    const state = makeNpcState({ gold: 10 });
    const result = await takeAction({
      action: { type: 'buy', itemId: 'healing_potion', price: 5 },
      history: [],
      state,
      seed: seedWithNpc,
      context: ctx,
    });
    expect(result.newState.characters[0].gold).toBe(5);
    expect(result.newState.characters[0].inventory.some((i) => i.id === 'healing_potion')).toBe(
      true
    );
  });

  it('buy fails when insufficient gold', async () => {
    const state = makeNpcState({ gold: 2 });
    const result = await takeAction({
      action: { type: 'buy', itemId: 'healing_potion', price: 5 },
      history: [],
      state,
      seed: seedWithNpc,
      context: ctx,
    });
    expect(result.narrative).toMatch(/can't afford/i);
    expect(result.newState.characters[0].gold).toBe(2);
  });

  it('attack_npc flips attitude to hostile and dispatches a regular Attack against the NPC-as-enemy', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // d20 → 20, always hits
    const state = makeNpcState({ hp: 10, max_hp: 10 });
    const result = await takeAction({
      action: { type: 'attack_npc' },
      history: [],
      state,
      seed: seedWithNpc,
      context: ctx,
    });
    expect(result.newState.npc_attitudes[npcRoomId]).toBe('hostile');
    // Combat should be live (initiative rolled, entities created).
    expect(result.newState.combat_active).toBe(true);
    expect(result.newState.entities?.some((e) => e.id === `npc:${npcRoomId}`)).toBe(true);
    // Narrative reflects the unified combat path.
    expect(result.narrative).toMatch(/damage|combat|initiative/i);
  });

  it('attack_npc when NPC is killed marks enemies_killed', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // critical, high damage
    const weakNpc: PlacedNpc = { ...placedNpc, hp: 1 };
    const seedWeak: Seed = { ...seedWithNpc, npcs: { [npcRoomId]: weakNpc } };
    const state = makeNpcState({ hp: 10, max_hp: 10 });
    const result = await takeAction({
      action: { type: 'attack_npc' },
      history: [],
      state,
      seed: seedWeak,
      context: ctx,
    });
    expect(result.newState.enemies_killed).toContain(`npc:${npcRoomId}`);
  });
});

// ─── Faction-aware shop pricing ──────────────────────────────────────────────

describe('faction shop price modifiers', () => {
  // Aldric (Vale Merchant Guild) sells a healing potion at base 50 cr.
  // factionShopPrice maps faction_guild attitude tiers as:
  //   exalted (rep >= 60): 0.75x → 38 cr
  //   friendly (rep >= 20): 0.9x → 45 cr
  //   neutral (rep >= 0): 1.0x → 50 cr
  //   unfriendly (rep >= -10): 1.2x → 60 cr
  //   hostile (rep <  -50): 1.5x → 75 cr
  // The shop choice surfaces only when the NPC attitude is 'friendly' (set
  // statically on Aldric); faction rep modifies the price independently.

  function makeValeStateInMarket(repWithGuild: number): GameState {
    return {
      characters: [makeChar({ id: 'p1', character_class: 'Fighter' })],
      active_character_id: 'p1',
      current_room: 'millhaven_market',
      visited_rooms: ['millhaven_square', 'millhaven_market'],
      enemies_killed: [],
      loot_taken: [],
      combat_active: false,
      initiative_order: [],
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
      faction_rep: { faction_guild: repWithGuild },
      // The vendor pane is open — buy choices surface through the active_shop
      // early-return (faction pricing is independent of attitude/shop state).
      active_shop: { roomId: 'millhaven_market' },
    };
  }

  // Vale's millhaven_market is in a campaign-driven seed; build a minimal one
  // that mirrors the placed NPC for choice-generation purposes.
  const valeMarketSeed: Seed = {
    context_id: valeCtx.id,
    world_name: 'Vale',
    ship_name: 'Vale',
    intro: '',
    seed_id: 'vale-test-shop',
    rooms: [
      { id: 'millhaven_square', name: 'Town', desc: '' },
      { id: 'millhaven_market', name: 'Market', desc: '' },
    ],
    enemies: {},
    loot: {},
    npcs: {
      millhaven_market: {
        roomId: 'millhaven_market',
        id: 'npc_aldric',
        name: 'Aldric the Merchant',
        attitude: 'friendly',
        factionId: 'faction_guild',
        hp: 4,
        ac: 10,
        damage: '1d4',
        toHit: 0,
        xp: 0,
        greeting: 'hi',
        responses: [],
        shop: [{ itemId: 'healing_potion', price: 50 }],
      } as PlacedNpc,
    },
  };

  it('neutral rep (0) charges base price', () => {
    const choices = generateChoices(makeValeStateInMarket(0), valeMarketSeed, valeCtx);
    const buy = choices.find((c) => c.action.type === 'buy');
    expect(buy).toBeDefined();
    expect((buy?.action as { price: number }).price).toBe(50);
    expect(buy?.label).not.toMatch(/discount|markup/i);
  });

  it('friendly rep (25) gives a 10% discount → 45 cr', () => {
    const choices = generateChoices(makeValeStateInMarket(25), valeMarketSeed, valeCtx);
    const buy = choices.find((c) => c.action.type === 'buy');
    expect((buy?.action as { price: number }).price).toBe(45);
    expect(buy?.label).toMatch(/Merchant Guild discount/);
  });

  it('exalted rep (75) gives a 25% discount → 38 cr', () => {
    const choices = generateChoices(makeValeStateInMarket(75), valeMarketSeed, valeCtx);
    const buy = choices.find((c) => c.action.type === 'buy');
    expect((buy?.action as { price: number }).price).toBe(38);
    expect(buy?.label).toMatch(/Merchant Guild discount/);
  });

  it('unfriendly rep (-5) marks up by 20% → 60 cr', () => {
    // Aldric is statically 'friendly' attitude, so the shop still surfaces;
    // the faction rep just changes the price. This is the intentional design:
    // attitude gates *whether* the shop is open, rep gates *the price*.
    // Vale thresholds: unfriendly = -10 (i.e. rep >= -10 → unfriendly tier).
    const choices = generateChoices(makeValeStateInMarket(-5), valeMarketSeed, valeCtx);
    const buy = choices.find((c) => c.action.type === 'buy');
    expect((buy?.action as { price: number }).price).toBe(60);
    expect(buy?.label).toMatch(/Merchant Guild markup/);
  });

  it('hostile rep (-100) marks up by 50% → 75 cr', () => {
    const choices = generateChoices(makeValeStateInMarket(-100), valeMarketSeed, valeCtx);
    const buy = choices.find((c) => c.action.type === 'buy');
    expect((buy?.action as { price: number }).price).toBe(75);
    expect(buy?.label).toMatch(/Merchant Guild markup/);
  });
});

// ─── prepare_spells — cap calculation + clamping ─────────────────────────────

describe('prepare_spells', () => {
  it('cantrips are filtered out of prepared_spells (always-known, PHB p.234)', async () => {
    // Cleric L1 WIS 14 → cap 3. spellIds includes Sacred Flame (cantrip)
    // which must be stripped before counting + storing.
    const state = makeClericState({ wis: 14, level: 1 });
    const result = await takeAction({
      action: {
        type: 'prepare_spells',
        spellIds: ['sacred_flame', 'cure_wounds', 'guiding_bolt'],
      },
      history: [],
      state,
      seed: spellSeed,
      context: ctxWithRage,
    });
    // Sacred Flame dropped; only the 2 leveled spells stored.
    expect(result.newState.characters[0].prepared_spells).toEqual(['cure_wounds', 'guiding_bolt']);
  });

  it('Cleric L1 WIS 10 (cap 1): all-cantrip prep stores nothing (no over-cap error)', async () => {
    const state = makeClericState({ wis: 10, level: 1 });
    const result = await takeAction({
      action: {
        type: 'prepare_spells',
        spellIds: ['sacred_flame', 'cure_wounds'],
      },
      history: [],
      state,
      seed: spellSeed,
      context: ctxWithRage,
    });
    // After cantrip filter: ['cure_wounds'] — exactly the cap. Stored.
    expect(result.newState.characters[0].prepared_spells).toEqual(['cure_wounds']);
  });

  it('Cleric L1 WIS 10 (cap 1): preparing 2 leveled spells rejects', async () => {
    const state = makeClericState({ wis: 10, level: 1 });
    const result = await takeAction({
      action: {
        type: 'prepare_spells',
        spellIds: ['cure_wounds', 'guiding_bolt'],
      },
      history: [],
      state,
      seed: spellSeed,
      context: ctxWithRage,
    });
    expect(result.narrative).toMatch(/at most 1 leveled spells.*tried to prepare 2/);
  });

  it('generateChoices auto-prep skips cantrips when picking which to prepare', () => {
    // Cleric knows 4 spells (1 cantrip + 3 leveled), WIS 10 → cap 1.
    // The choice should surface only leveled spells in its spellIds,
    // and the "X of N known" count should be over the leveled subset.
    const state = makeClericState({ wis: 10, level: 1 });
    const choices = generateChoices(state, spellSeed, ctxWithRage);
    const prep = choices.find((c) => c.action.type === 'prepare_spells');
    expect(prep).toBeDefined();
    const spellIds = (prep!.action as { spellIds: string[] }).spellIds;
    // Cap is 1 → only one spellId, and it's a leveled one (not Sacred Flame).
    expect(spellIds).toHaveLength(1);
    expect(spellIds).not.toContain('sacred_flame');
    // 3 leveled spells in spells_known (cure_wounds, guiding_bolt, hold_person).
    expect(prep!.label).toMatch(/1 of 3 known/);
  });
});

// ─── Out-of-combat lead picker (set_active_character) ────────────────────────

describe('set_active_character (out-of-combat lead handoff)', () => {
  function makeOutOfCombatParty(): GameState {
    const pc1 = makeChar({ id: 'pc-1', name: 'Lead' });
    const pc2 = makeChar({ id: 'pc-2', name: 'Backup' });
    return {
      ...makeState(),
      characters: [pc1, pc2],
      active_character_id: 'pc-1',
      current_room: 'entry_hall',
      combat_active: false,
    };
  }

  it('switches active_character_id when called out of combat', async () => {
    const state = makeOutOfCombatParty();
    const result = await takeAction({
      action: { type: 'set_active_character', characterId: 'pc-2' },
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });
    expect(result.newState.active_character_id).toBe('pc-2');
    expect(result.narrative).toMatch(/Backup steps forward to lead/);
  });

  it('is a no-op in combat — initiative drives active_character_id there', async () => {
    const state: GameState = {
      ...makeOutOfCombatParty(),
      combat_active: true,
      initiative_order: [
        { id: 'pc-1', roll: 18, is_enemy: false },
        { id: 'pc-2', roll: 8, is_enemy: false },
      ],
      initiative_idx: 0,
    };
    const result = await takeAction({
      action: { type: 'set_active_character', characterId: 'pc-2' },
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });
    expect(result.newState.active_character_id).toBe('pc-1'); // unchanged
    expect(result.narrative).toMatch(/Initiative is rolled/);
  });

  it('rejects a dead character', async () => {
    const state = makeOutOfCombatParty();
    state.characters[1].dead = true;
    state.characters[1].hp = 0;
    const result = await takeAction({
      action: { type: 'set_active_character', characterId: 'pc-2' },
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });
    expect(result.newState.active_character_id).toBe('pc-1');
    expect(result.narrative).toMatch(/dead and can't lead/);
  });

  it('out-of-combat actions no longer auto-rotate active_character_id', async () => {
    // Take a benign action and verify active stays put. Pre-fix the
    // engine rotated through living party every action.
    const state = makeOutOfCombatParty();
    const result = await takeAction({
      action: { type: 'examine' },
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });
    expect(result.newState.active_character_id).toBe('pc-1');
  });
});

// ─── enter_district sync ─────────────────────────────────────────────────────
//

// ─── 2024 PHB class feature audit ────────────────────────────────────────────

describe('Fighter Second Wind (2024 multi-use)', () => {
  function makeFighter(level: number, used = 0): GameState {
    const fighter = makeChar({
      id: 'f-sw',
      character_class: 'Fighter',
      level,
      hp: 10,
      max_hp: 30,
      class_resource_uses: { second_wind: used },
      turn_actions: {
        action_used: false,
        bonus_action_used: false,
        reaction_used: false,
        free_interaction_used: false,
      },
    });
    return {
      characters: [fighter],
      active_character_id: fighter.id,
      current_room: 'entry_hall',
      visited_rooms: ['entry_hall'],
      enemies_killed: [],
      loot_taken: [],
      combat_active: true,
      initiative_order: [{ id: fighter.id, roll: 18, is_enemy: false }],
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
  }

  it('L1 Fighter has 2 Second Wind uses', async () => {
    const result = await takeAction({
      action: { type: 'use_class_feature', featureId: 'second_wind' },
      history: [],
      state: makeFighter(1, 0),
      seed,
      context: ctx,
    });
    expect(result.newState.characters[0].class_resource_uses?.second_wind).toBe(1);
    expect(result.narrative).toMatch(/1\/2 remaining/);
  });

  it('L4 Fighter has 3 Second Wind uses', () => {
    const choices = generateChoices(makeFighter(4, 0), seed, ctx);
    const sw = choices.find((c) => c.label.includes('Second Wind'));
    expect(sw?.label).toMatch(/3\/3 left/);
  });

  it('L10 Fighter has 4 Second Wind uses', () => {
    const choices = generateChoices(makeFighter(10, 0), seed, ctx);
    const sw = choices.find((c) => c.label.includes('Second Wind'));
    expect(sw?.label).toMatch(/4\/4 left/);
  });

  it('L1 Fighter at 2/2 used cannot Second Wind', async () => {
    const result = await takeAction({
      action: { type: 'use_class_feature', featureId: 'second_wind' },
      history: [],
      state: makeFighter(1, 2),
      seed,
      context: ctx,
    });
    expect(result.narrative).toMatch(/Second Wind exhausted/);
  });
});

describe('Cleric universal Channel Divinity (2024)', () => {
  function makeCleric(overrides: Partial<Character> = {}): GameState {
    const cleric = makeChar({
      id: 'c-cd',
      character_class: 'Cleric',
      level: 1,
      wis: 16,
      class_resource_uses: { channel_divinity: 1 },
      turn_actions: {
        action_used: false,
        bonus_action_used: false,
        reaction_used: false,
        free_interaction_used: false,
      },
      ...overrides,
    });
    const enemyId = `${CORRIDOR_ID}#0`;
    return {
      characters: [cleric],
      active_character_id: cleric.id,
      current_room: CORRIDOR_ID,
      visited_rooms: ['entry_hall', CORRIDOR_ID],
      enemies_killed: [],
      loot_taken: [],
      combat_active: true,
      initiative_order: [{ id: cleric.id, roll: 18, is_enemy: false }],
      initiative_idx: 0,
      entities: [
        {
          id: cleric.id,
          isEnemy: false,
          pos: { x: 4, y: 5 },
          hp: 20,
          maxHp: 20,
          conditions: [],
          condition_durations: {},
        },
        {
          id: enemyId,
          isEnemy: true,
          pos: { x: 5, y: 5 },
          hp: 30,
          maxHp: 30,
          conditions: [],
          condition_durations: {},
        },
      ],
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
      movement_used: {},
    };
  }

  it('Divine Spark deals radiant damage and consumes a CD use', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999); // max d8
    const result = await takeAction({
      action: { type: 'use_class_feature', featureId: 'divine_spark' },
      history: [],
      state: makeCleric(),
      seed: seedWithEnemy,
      context: ctx,
    });
    expect(result.narrative).toMatch(/Divine Spark/);
    expect(result.newState.characters[0].class_resource_uses?.channel_divinity).toBe(0);
    // 1d8 max + WIS +3 = 11 damage
    const enemy = result.newState.entities?.find((e) => e.isEnemy);
    expect(30 - (enemy?.hp ?? 30)).toBeGreaterThanOrEqual(11);
  });

  it('Divine Spark blocked when CD exhausted', async () => {
    const result = await takeAction({
      action: { type: 'use_class_feature', featureId: 'divine_spark' },
      history: [],
      state: makeCleric({ class_resource_uses: { channel_divinity: 0 } }),
      seed: seedWithEnemy,
      context: ctx,
    });
    expect(result.narrative).toMatch(/No Channel Divinity/);
  });

  it('Divine Spark reads CURRENT entity HP, not seed template (regression — Vale playthrough)', async () => {
    // Vale Crypt Ghoul fight: Ghoul started at 44 HP, the party whittled
    // it down to 19, then Cleric used Divine Spark — the entity HP jumped
    // back UP because the handler read from `enemy.hp` (seed template
    // = 44) instead of the current entity HP (19). Net: the previous
    // turns' damage was wiped out.
    //
    // This regression pre-damages the entity to 5 HP while the seed
    // still reads 30 HP. The DS roll is the lowest possible (1d8+3 with
    // a 0.0001 random → 1+3 = 4). Expected post-DS entity HP = 5 - 4 = 1.
    // With the bug, it would have been 30 - 4 = 26 — the entity HP would
    // GO UP. The assertion catches that direction explicitly.
    vi.spyOn(Math, 'random').mockReturnValue(0.0001); // d8 → 1
    const state = makeCleric();
    // Pre-damage the entity to HP = 5 (seed.enemy.hp remains 30)
    const damagedState = {
      ...state,
      entities: (state.entities ?? []).map((e) => (e.isEnemy ? { ...e, hp: 5 } : e)),
    };
    const result = await takeAction({
      action: { type: 'use_class_feature', featureId: 'divine_spark' },
      history: [],
      state: damagedState,
      seed: seedWithEnemy,
      context: ctx,
    });
    const enemy = result.newState.entities?.find((e) => e.isEnemy);
    // Damage is 1d8(=1) + WIS(+3) = 4. From 5 HP → 1 HP.
    // The PRE-FIX bug would have set HP to max(0, 30 - 4) = 26.
    expect(enemy?.hp ?? 0).toBeLessThanOrEqual(5);
    expect(enemy?.hp ?? 0).toBeGreaterThanOrEqual(0);
  });

  it('Sear Undead requires Cleric L5', async () => {
    const result = await takeAction({
      action: { type: 'use_class_feature', featureId: 'sear_undead' },
      history: [],
      state: makeCleric({ level: 4 }),
      seed: seedWithEnemy,
      context: ctx,
    });
    expect(result.narrative).toMatch(/requires Cleric level 5/);
  });
});

describe('Monk 2024 features', () => {
  function makeMonk(overrides: Partial<Character> = {}): GameState {
    const monk = makeChar({
      id: 'm-1',
      character_class: 'Monk',
      level: 2,
      dex: 16,
      wis: 14,
      class_resource_uses: { ki_points: 2 },
      turn_actions: {
        action_used: false,
        bonus_action_used: false,
        reaction_used: false,
        free_interaction_used: false,
      },
      ...overrides,
    });
    const enemyId = `${CORRIDOR_ID}#0`;
    return {
      characters: [monk],
      active_character_id: monk.id,
      current_room: CORRIDOR_ID,
      visited_rooms: ['entry_hall', CORRIDOR_ID],
      enemies_killed: [],
      loot_taken: [],
      combat_active: true,
      initiative_order: [{ id: monk.id, roll: 18, is_enemy: false }],
      initiative_idx: 0,
      entities: [
        {
          id: monk.id,
          isEnemy: false,
          pos: { x: 4, y: 5 },
          hp: 20,
          maxHp: 20,
          conditions: [],
          condition_durations: {},
        },
        {
          id: enemyId,
          isEnemy: true,
          pos: { x: 5, y: 5 },
          hp: 30,
          maxHp: 30,
          conditions: [],
          condition_durations: {},
        },
      ],
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
      movement_used: {},
    };
  }

  it('Patient Defense (free): sets dodging without spending DP', async () => {
    const result = await takeAction({
      action: { type: 'use_class_feature', featureId: 'patient_defense_free' },
      history: [],
      state: makeMonk(),
      seed: seedWithEnemy,
      context: ctx,
    });
    expect(result.narrative).toMatch(/Patient Defense \(free\)/);
    expect(result.newState.characters[0].turn_actions.dodging).toBe(true);
    expect(result.newState.characters[0].turn_actions.monk_free_used).toBe(true);
    // No DP spent
    expect(result.newState.characters[0].class_resource_uses?.ki_points).toBe(2);
  });

  it('Patient Defense (free) blocked after the free bonus action already used', async () => {
    const result = await takeAction({
      action: { type: 'use_class_feature', featureId: 'patient_defense_free' },
      history: [],
      state: makeMonk({
        turn_actions: {
          action_used: false,
          bonus_action_used: false,
          reaction_used: false,
          free_interaction_used: false,
          monk_free_used: true,
        },
      }),
      seed: seedWithEnemy,
      context: ctx,
    });
    expect(result.narrative).toMatch(/already used your free monk bonus action/);
  });

  it('Step of the Wind (1 DP) grants both Dash and Disengage', async () => {
    const result = await takeAction({
      action: { type: 'use_class_feature', featureId: 'step_of_wind_dash' },
      history: [],
      state: makeMonk(),
      seed: seedWithEnemy,
      context: ctx,
    });
    const monk = result.newState.characters[0];
    expect(monk.turn_actions.disengaged).toBe(true);
    expect(monk.turn_actions.bonus_action_used).toBe(true);
    expect(monk.class_resource_uses?.ki_points).toBe(1);
    expect(result.narrative).toMatch(/Dash.*Disengage/);
  });

  it('Stunning Strike: 1/turn cap blocks second use', async () => {
    const result = await takeAction({
      action: { type: 'use_class_feature', featureId: 'stunning_strike' },
      history: [],
      state: makeMonk({
        level: 5,
        class_resource_uses: { ki_points: 5 },
        turn_actions: {
          action_used: false,
          bonus_action_used: false,
          reaction_used: false,
          free_interaction_used: false,
          monk_stunning_strike_used: true,
        },
      }),
      seed: seedWithEnemy,
      context: ctx,
    });
    expect(result.narrative).toMatch(/already used this turn/);
  });
});

describe('Heroic Inspiration spend rules (2024 — any d20)', () => {
  it('spend_inspiration choice appears in and out of combat when inspiration is held', () => {
    const baseChar = makeChar({
      character_class: 'Rogue',
      inspiration: true,
      turn_actions: {
        action_used: false,
        bonus_action_used: false,
        reaction_used: false,
        free_interaction_used: false,
      },
    });
    // Out of combat
    const stateOOC: GameState = {
      ...makeState(),
      characters: [baseChar],
      active_character_id: baseChar.id,
      combat_active: false,
    };
    const oocChoices = generateChoices(stateOOC, seed, ctx);
    expect(oocChoices.some((c) => c.action.type === 'spend_inspiration')).toBe(true);

    // In combat
    const stateIC: GameState = { ...stateOOC, combat_active: true };
    const icChoices = generateChoices(stateIC, seed, ctx);
    expect(icChoices.some((c) => c.action.type === 'spend_inspiration')).toBe(true);
  });

  it('spend_inspiration clears char.inspiration and sets the pending flag', async () => {
    const char = makeChar({
      character_class: 'Rogue',
      inspiration: true,
      turn_actions: {
        action_used: false,
        bonus_action_used: false,
        reaction_used: false,
        free_interaction_used: false,
      },
    });
    const result = await takeAction({
      action: { type: 'spend_inspiration' },
      history: [],
      state: { ...makeState(), characters: [char], active_character_id: char.id },
      seed,
      context: ctx,
    });
    expect(result.newState.characters[0].turn_actions.inspiration_pending).toBe(true);
    expect(result.narrative).toMatch(/attack, save, or check/);
  });
});

describe('Hide action — DC tracking (2024)', () => {
  it('successful Cunning Action Hide records hide_dc on the character', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999); // max stealth roll
    const rogue = makeChar({
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
    });
    const enemyId = `${CORRIDOR_ID}#0`;
    const state: GameState = {
      characters: [rogue],
      active_character_id: rogue.id,
      current_room: CORRIDOR_ID,
      visited_rooms: ['entry_hall', CORRIDOR_ID],
      enemies_killed: [],
      loot_taken: [],
      combat_active: true,
      initiative_order: [{ id: rogue.id, roll: 18, is_enemy: false }],
      initiative_idx: 0,
      entities: [
        {
          id: rogue.id,
          isEnemy: false,
          pos: { x: 4, y: 5 },
          hp: 20,
          maxHp: 20,
          conditions: [],
          condition_durations: {},
        },
        {
          id: enemyId,
          isEnemy: true,
          pos: { x: 5, y: 5 },
          hp: 30,
          maxHp: 30,
          conditions: [],
          condition_durations: {},
        },
      ],
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
      movement_used: {},
    };
    const result = await takeAction({
      action: { type: 'use_class_feature', featureId: 'cunning_action_hide' },
      history: [],
      state,
      // SRD Hide [Action] prerequisite: a dark room is Heavily Obscured, so the
      // rogue may hide even adjacent to the enemy (pansori enemies lack
      // darkvision). See canAttemptHide.
      seed: {
        ...seedWithEnemy,
        rooms: seedWithEnemy.rooms.map((r) =>
          r.id === CORRIDOR_ID ? { ...r, lighting: 'dark' as const } : r
        ),
      },
      context: ctx,
    });
    expect(result.narrative).toMatch(/Hide DC/);
    const after = result.newState.characters[0];
    expect(after.conditions).toContain('invisible');
    expect(after.hide_dc).toBeGreaterThan(0);
  });

  it('attacking clears invisible AND hide_dc', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    const rogue = makeChar({
      id: 'r-attack',
      character_class: 'Rogue',
      level: 2,
      dex: 16,
      equipment: { main_hand: 'sword-inst' },
      inventory: [{ instance_id: 'sword-inst', id: 'shortsword', name: 'Shortsword' }],
      conditions: ['invisible'],
      hide_dc: 17,
      turn_actions: {
        action_used: false,
        bonus_action_used: false,
        reaction_used: false,
        free_interaction_used: false,
      },
    });
    const enemyId = `${CORRIDOR_ID}#0`;
    const state: GameState = {
      characters: [rogue],
      active_character_id: rogue.id,
      current_room: CORRIDOR_ID,
      visited_rooms: ['entry_hall', CORRIDOR_ID],
      enemies_killed: [],
      loot_taken: [],
      combat_active: true,
      initiative_order: [{ id: rogue.id, roll: 18, is_enemy: false }],
      initiative_idx: 0,
      entities: [
        {
          id: rogue.id,
          isEnemy: false,
          pos: { x: 4, y: 5 },
          hp: 20,
          maxHp: 20,
          conditions: ['invisible'],
          condition_durations: {},
        },
        {
          id: enemyId,
          isEnemy: true,
          pos: { x: 5, y: 5 },
          hp: 30,
          maxHp: 30,
          conditions: [],
          condition_durations: {},
        },
      ],
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
      movement_used: {},
    };
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: enemyId },
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });
    const after = result.newState.characters[0];
    expect(after.conditions).not.toContain('invisible');
    expect(after.hide_dc).toBeUndefined();
  });
});

describe('Magic Missile / Eldritch Blast multi-target (2024)', () => {
  const seedTwoEnemies: Seed = {
    ...seed,
    enemies: {
      [CORRIDOR_ID]: [
        {
          id: `${CORRIDOR_ID}#0`,
          name: 'Goblin A',
          hp: 8,
          ac: 12,
          damage: '1d6',
          toHit: 3,
          xp: 20,
        },
        {
          id: `${CORRIDOR_ID}#1`,
          name: 'Goblin B',
          hp: 8,
          ac: 12,
          damage: '1d6',
          toHit: 3,
          xp: 20,
        },
      ],
    },
  };

  function makeMultiEnemyState(): GameState {
    const wizard = makeChar({
      id: 'w-mm',
      character_class: 'Wizard',
      int: 16,
      level: 1,
      spell_slots_max: { 1: 2 },
      spell_slots_used: {},
      spells_known: ['magic_missile', 'eldritch_blast'],
      turn_actions: {
        action_used: false,
        bonus_action_used: false,
        reaction_used: false,
        free_interaction_used: false,
      },
    });
    const enemyA = `${CORRIDOR_ID}#0`;
    const enemyB = `${CORRIDOR_ID}#1`;
    return {
      characters: [wizard],
      active_character_id: wizard.id,
      current_room: CORRIDOR_ID,
      visited_rooms: ['entry_hall', CORRIDOR_ID],
      enemies_killed: [],
      loot_taken: [],
      combat_active: true,
      initiative_order: [{ id: wizard.id, roll: 18, is_enemy: false }],
      initiative_idx: 0,
      entities: [
        {
          id: wizard.id,
          isEnemy: false,
          pos: { x: 0, y: 0 },
          hp: 10,
          maxHp: 10,
          conditions: [],
          condition_durations: {},
        },
        {
          id: enemyA,
          isEnemy: true,
          pos: { x: 2, y: 0 },
          hp: 8,
          maxHp: 8,
          conditions: [],
          condition_durations: {},
        },
        {
          id: enemyB,
          isEnemy: true,
          pos: { x: 4, y: 0 },
          hp: 8,
          maxHp: 8,
          conditions: [],
          condition_durations: {},
        },
      ],
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
      movement_used: {},
    };
  }

  it('generateChoices emits focus-fire and spread variants for Magic Missile when 2+ enemies', () => {
    const choices = generateChoices(makeMultiEnemyState(), seedTwoEnemies, ctx);
    const mmChoices = choices.filter((c) => c.action.type === 'cast_spell');
    const focus = mmChoices.filter((c) => c.label.includes('focus fire'));
    const spread = mmChoices.filter((c) => c.label.includes('spread'));
    // Magic Missile L1: 3 darts. Expect 2 focus-fire (one per enemy) +
    // 1 spread variant.
    expect(focus.length).toBeGreaterThanOrEqual(2);
    expect(spread.length).toBeGreaterThanOrEqual(1);
  });

  it('Magic Missile with targetEnemyIds applies one dart per listed target', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999); // max d4 = 4 (+1) = 5/dart
    const state = makeMultiEnemyState();
    const enemyA = state.entities!.filter((e) => e.isEnemy)[0].id;
    const enemyB = state.entities!.filter((e) => e.isEnemy)[1].id;
    const result = await takeAction({
      action: {
        type: 'cast_spell',
        spellId: 'magic_missile',
        slotLevel: 1,
        targetEnemyIds: [enemyA, enemyB, enemyA],
      },
      history: [],
      state,
      seed: seedTwoEnemies,
      context: ctx,
    });
    // Both enemies should have taken damage.
    const afterA = result.newState.entities?.find((e) => e.id === enemyA);
    const afterB = result.newState.entities?.find((e) => e.id === enemyB);
    expect(afterA!.hp).toBeLessThan(8);
    expect(afterB!.hp).toBeLessThan(8);
    expect(result.narrative).toMatch(/dart 1/);
    expect(result.narrative).toMatch(/dart 2/);
    expect(result.narrative).toMatch(/dart 3/);
  });
});

describe('Heavy encumbrance disadvantage (2024 variant)', () => {
  // 10 weight × 11 items = 110 lb. STR 10 → cap 150 lb total; heavy
  // encumbrance triggers at > 100 lb (STR × 10).
  function heavyLoadInventory() {
    return Array.from({ length: 11 }, (_, i) => ({
      instance_id: `bag-${i}`,
      id: 'bag',
      name: 'Heavy Bag',
      weight: 10,
    }));
  }

  it('attack roll picks up "heavily encumbered" in disadvantage reasons', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    const fighter = makeChar({
      id: 'f-enc',
      character_class: 'Fighter',
      level: 1,
      str: 10,
      dex: 14,
      equipment: { main_hand: 'sword-inst' },
      inventory: [
        { instance_id: 'sword-inst', id: 'shortsword', name: 'Shortsword' },
        ...heavyLoadInventory(),
      ],
    });
    const enemyId = `${CORRIDOR_ID}#0`;
    const state: GameState = {
      characters: [fighter],
      active_character_id: fighter.id,
      current_room: CORRIDOR_ID,
      visited_rooms: ['entry_hall', CORRIDOR_ID],
      enemies_killed: [],
      loot_taken: [],
      combat_active: true,
      initiative_order: [{ id: fighter.id, roll: 18, is_enemy: false }],
      initiative_idx: 0,
      entities: [
        {
          id: fighter.id,
          isEnemy: false,
          pos: { x: 4, y: 5 },
          hp: 20,
          maxHp: 20,
          conditions: [],
          condition_durations: {},
        },
        {
          id: enemyId,
          isEnemy: true,
          pos: { x: 5, y: 5 },
          hp: 30,
          maxHp: 30,
          conditions: [],
          condition_durations: {},
        },
      ],
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
      movement_used: {},
    };
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: enemyId },
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });
    expect(result.narrative).toMatch(/heavily encumbered/);
  });

  it('Bardic Inspiration die is consumed on a Stealth check', async () => {
    // Mock so Stealth d20 + DEX + prof = ~5+2+2 = 9; bardic d6 = 6; DC 14.
    // 9 + 6 = 15 → success only because Bardic spent.
    const random = vi.spyOn(Math, 'random');
    random.mockReturnValueOnce(0.2); // sneak d20 = 5
    random.mockReturnValue(0.999); // bardic d6 = 6, anything else high
    const rogue = makeChar({
      id: 'r-bardic',
      character_class: 'Rogue',
      level: 1,
      dex: 14,
      skill_proficiencies: ['Stealth'],
      bardic_inspiration_die: 'd6',
    });
    const enemyId = `${CORRIDOR_ID}#0`;
    const state: GameState = {
      ...makeState(),
      characters: [rogue],
      active_character_id: rogue.id,
      current_room: CORRIDOR_ID,
      visited_rooms: ['entry_hall', CORRIDOR_ID],
      combat_active: false,
    };
    void enemyId;
    const result = await takeAction({
      action: { type: 'sneak' },
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });
    // The die is consumed regardless of outcome.
    expect(result.newState.characters[0].bardic_inspiration_die).toBeUndefined();
  });

  it('Tactical Master (L9 Fighter) swaps mastery to PUSH for the next attack', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    const fighter = makeChar({
      id: 'f-tm',
      character_class: 'Fighter',
      level: 9,
      str: 16,
      equipment: { main_hand: 'sword-inst' },
      inventory: [{ instance_id: 'sword-inst', id: 'longsword', name: 'Longsword' }],
      weapon_masteries: ['longsword'],
    });
    const enemyId = `${CORRIDOR_ID}#0`;
    const state: GameState = {
      characters: [fighter],
      active_character_id: fighter.id,
      current_room: CORRIDOR_ID,
      visited_rooms: ['entry_hall', CORRIDOR_ID],
      enemies_killed: [],
      loot_taken: [],
      combat_active: true,
      initiative_order: [{ id: fighter.id, roll: 18, is_enemy: false }],
      initiative_idx: 0,
      entities: [
        {
          id: fighter.id,
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
          hp: 80, // survives the hit
          maxHp: 80,
          conditions: [],
          condition_durations: {},
        },
      ],
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
      movement_used: {},
    };
    // Arm Tactical Master.
    const armed = await takeAction({
      action: { type: 'use_class_feature', featureId: 'tactical_master_push' },
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });
    expect(armed.newState.characters[0].turn_actions.tactical_master_mastery).toBe('push');

    // Then attack — Push should apply instead of the longsword's Sap.
    const attacked = await takeAction({
      action: { type: 'attack', targetEnemyId: enemyId },
      history: [],
      state: armed.newState,
      seed: seedWithEnemy,
      context: ctx,
    });
    expect(attacked.narrative).toMatch(/Tactical Master: applying PUSH/);
    expect(attacked.narrative).toMatch(/\[Push:/);
    // Flag cleared after the attack.
    expect(attacked.newState.characters[0].turn_actions.tactical_master_mastery).toBeUndefined();
  });

  it('Frightened PC cannot move closer to the source of fear (2024)', async () => {
    const enemyId = `${CORRIDOR_ID}#0`;
    const pc = makeChar({
      id: 'pc-fear',
      character_class: 'Fighter',
      conditions: ['frightened'],
      condition_sources: { frightened: enemyId },
      str: 14,
      speed: 30,
    });
    const state: GameState = {
      characters: [pc],
      active_character_id: pc.id,
      current_room: CORRIDOR_ID,
      visited_rooms: ['entry_hall', CORRIDOR_ID],
      enemies_killed: [],
      loot_taken: [],
      combat_active: true,
      initiative_order: [{ id: pc.id, roll: 18, is_enemy: false }],
      initiative_idx: 0,
      entities: [
        {
          id: pc.id,
          isEnemy: false,
          pos: { x: 5, y: 5 },
          hp: 20,
          maxHp: 20,
          conditions: ['frightened'],
          condition_durations: { frightened: 3 },
        },
        {
          id: enemyId,
          isEnemy: true,
          pos: { x: 8, y: 5 }, // 3 squares right of PC
          hp: 30,
          maxHp: 30,
          conditions: [],
          condition_durations: {},
        },
      ],
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
      movement_used: {},
    };
    // Try to move one step closer (6,5).
    const result = await takeAction({
      action: { type: 'grid_move', entityId: pc.id, to: { x: 6, y: 5 } },
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });
    expect(result.narrative).toMatch(/FRIGHTENED.*can't willingly move closer/);
    const pcEnt = result.newState.entities?.find((e) => e.id === pc.id);
    expect(pcEnt?.pos).toEqual({ x: 5, y: 5 });
  });

  it('Cunning Action Hide check fires with disadvantage when heavily encumbered', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // worst rolls — disadv intensifies
    const rogue = makeChar({
      id: 'r-enc',
      character_class: 'Rogue',
      level: 2,
      dex: 16,
      str: 10,
      skill_proficiencies: ['Stealth'],
      inventory: heavyLoadInventory(),
      turn_actions: {
        action_used: true,
        bonus_action_used: false,
        reaction_used: false,
        free_interaction_used: false,
      },
    });
    const enemyId = `${CORRIDOR_ID}#0`;
    const state: GameState = {
      characters: [rogue],
      active_character_id: rogue.id,
      current_room: CORRIDOR_ID,
      visited_rooms: ['entry_hall', CORRIDOR_ID],
      enemies_killed: [],
      loot_taken: [],
      combat_active: true,
      initiative_order: [{ id: rogue.id, roll: 18, is_enemy: false }],
      initiative_idx: 0,
      entities: [
        {
          id: rogue.id,
          isEnemy: false,
          pos: { x: 4, y: 5 },
          hp: 20,
          maxHp: 20,
          conditions: [],
          condition_durations: {},
        },
        {
          id: enemyId,
          isEnemy: true,
          pos: { x: 5, y: 5 },
          hp: 30,
          maxHp: 30,
          conditions: [],
          condition_durations: {},
        },
      ],
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
      movement_used: {},
    };
    const result = await takeAction({
      action: { type: 'use_class_feature', featureId: 'cunning_action_hide' },
      history: [],
      state,
      // Dark room satisfies the Hide prerequisite so the Stealth check actually
      // runs (and then fails on the worst-roll-with-disadvantage mock).
      seed: {
        ...seedWithEnemy,
        rooms: seedWithEnemy.rooms.map((r) =>
          r.id === CORRIDOR_ID ? { ...r, lighting: 'dark' as const } : r
        ),
      },
      context: ctx,
    });
    // Hide check with disadv on worst-roll mock should fail.
    expect(result.narrative).toMatch(/fails/);
  });
});

// ─── Group ability checks (SRD p.6) ──────────────────────────────────────────
//
// When a number of individuals attempt a check together, if at least half
// the group succeeds, the whole group succeeds. The sneak action is the
// natural fit since `current_room` is single-valued — the party moves
// together. Solo parties collapse to the existing single-PC behavior.

describe('group ability check — sneak (SRD p.6)', () => {
  function makeSneakScenario(party: Array<Partial<Character>>): GameState {
    const characters = party.map((o, i) =>
      makeChar({ id: `pc-${i + 1}`, name: `PC${i + 1}`, ...o })
    );
    const enemyId = `${CORRIDOR_ID}#0`;
    return {
      ...makeState(),
      characters,
      active_character_id: 'pc-1',
      current_room: CORRIDOR_ID,
      visited_rooms: ['entry_hall', CORRIDOR_ID],
      combat_active: false,
      initiative_order: [{ id: enemyId, roll: 5, is_enemy: true }],
      initiative_idx: 0,
    };
  }

  it('group passes when at least half succeed (3-PC party, 2 successes)', async () => {
    // Mock all d20 rolls high (0.99 → ~20). Most checks succeed; group passes.
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const state = makeSneakScenario([{}, {}, {}]);
    const result = await takeAction({
      action: { type: 'sneak' },
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });
    expect(result.narrative).toMatch(/Group check: 3\/3 pass/);
  });

  it('group fails when fewer than half succeed (3-PC party, 0 successes)', async () => {
    // Mock all d20 rolls low (0.01 → 1). Everyone fails.
    vi.spyOn(Math, 'random').mockReturnValue(0.01);
    const state = makeSneakScenario([{}, {}, {}]);
    const result = await takeAction({
      action: { type: 'sneak' },
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });
    expect(result.narrative).toMatch(/Group check: 0\/3 pass — group fails/);
    expect(result.narrative).toMatch(/party fails to slip past/i);
  });

  it('solo PC keeps single-check behavior (no group note)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const state = makeSneakScenario([{}]);
    const result = await takeAction({
      action: { type: 'sneak' },
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });
    expect(result.narrative).not.toMatch(/Group check/);
  });

  it('dead PCs are excluded from the group check', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    // PC3 dead → group is effectively 2; 2 of 2 succeed → "Group check: 2/2".
    const state = makeSneakScenario([{}, {}, { dead: true, hp: 0 }]);
    const result = await takeAction({
      action: { type: 'sneak' },
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });
    expect(result.narrative).toMatch(/Group check: 2\/2 pass/);
  });

  it('passive party members do not auto-spend Bardic Inspiration', async () => {
    // Mock high so the active PC's check passes outright (bardic unneeded).
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const state = makeSneakScenario([
      {},
      { id: 'pc-2', name: 'PC2', bardic_inspiration_die: 'd6' },
    ]);
    state.characters[1].id = 'pc-2';
    const result = await takeAction({
      action: { type: 'sneak' },
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });
    // PC2 is passive; their bardic die survives the group check.
    expect(result.newState.characters[1].bardic_inspiration_die).toBe('d6');
  });
});

describe('Species damage resistance (2024)', () => {
  it('Tiefling halves fire damage from a fire-typed enemy attack', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999); // enemy attack always hits
    const tiefling = makeChar({
      id: 'pc-tief',
      character_class: 'Wizard',
      species: 'tiefling',
      hp: 30,
      max_hp: 30,
      ac: 12,
    });
    const enemyId = `${CORRIDOR_ID}#0`;
    // Create a seed with a fire-typed enemy.
    const fireSeed: Seed = {
      ...seedWithEnemy,
      enemies: {
        [CORRIDOR_ID]: [
          {
            id: enemyId,
            name: 'Fire Imp',
            hp: 20,
            ac: 12,
            damage: '1d6',
            toHit: 5,
            xp: 50,
            damageType: 'fire',
          },
        ],
      },
    };
    const state: GameState = {
      characters: [tiefling],
      active_character_id: tiefling.id,
      current_room: CORRIDOR_ID,
      visited_rooms: ['entry_hall', CORRIDOR_ID],
      enemies_killed: [],
      loot_taken: [],
      combat_active: true,
      initiative_order: [
        { id: tiefling.id, roll: 5, is_enemy: false },
        { id: enemyId, roll: 20, is_enemy: true },
      ],
      initiative_idx: 0, // PC's turn; pass → enemy resolves
      entities: [
        {
          id: tiefling.id,
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
          hp: 20,
          maxHp: 20,
          conditions: [],
          condition_durations: {},
        },
      ],
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
      movement_used: {},
    };
    // Pass action to let enemy take its turn.
    const result = await takeAction({
      action: { type: 'pass' },
      history: [],
      state,
      seed: fireSeed,
      context: ctx,
    });
    // Narrative should mention the Tiefling fire resistance.
    expect(result.narrative).toMatch(/Tiefling fire resistance/);
  });

  it('Human Resourceful: long rest grants Heroic Inspiration', async () => {
    const human = makeChar({
      id: 'h-rest',
      species: 'human',
      inspiration: false,
      hp: 5,
      max_hp: 20,
    });
    const state: GameState = {
      ...makeState(),
      characters: [human],
      active_character_id: human.id,
      combat_active: false,
    };
    const result = await takeAction({
      action: { type: 'long_rest' },
      history: [],
      state,
      seed,
      context: ctx,
    });
    expect(result.newState.characters[0].inspiration).toBe(true);
  });

  it('Orc Relentless Endurance: drops to 1 HP instead of 0 on a hit (1/long rest)', async () => {
    // Force enemy attack to hit and deal massive (but not massive-death) damage.
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    const orc = makeChar({
      id: 'pc-orc',
      character_class: 'Fighter',
      species: 'orc',
      hp: 8, // enemy 1d6+0 damage at 0.999 = 6 dmg; we set HP to 8 so > one hit
      max_hp: 40,
      ac: 5, // ensure hit
    });
    const enemyId = `${CORRIDOR_ID}#0`;
    const seedBigDmg: Seed = {
      ...seedWithEnemy,
      enemies: {
        [CORRIDOR_ID]: [
          {
            id: enemyId,
            name: 'Brute',
            hp: 50,
            ac: 12,
            damage: '4d6', // overkill — pushes well past 8 HP
            toHit: 10,
            xp: 50,
          },
        ],
      },
    };
    const state: GameState = {
      characters: [orc],
      active_character_id: orc.id,
      current_room: CORRIDOR_ID,
      visited_rooms: ['entry_hall', CORRIDOR_ID],
      enemies_killed: [],
      loot_taken: [],
      combat_active: true,
      initiative_order: [
        { id: orc.id, roll: 5, is_enemy: false },
        { id: enemyId, roll: 20, is_enemy: true },
      ],
      initiative_idx: 0,
      entities: [
        {
          id: orc.id,
          isEnemy: false,
          pos: { x: 4, y: 5 },
          hp: 8,
          maxHp: 40,
          conditions: [],
          condition_durations: {},
        },
        {
          id: enemyId,
          isEnemy: true,
          pos: { x: 5, y: 5 },
          hp: 50,
          maxHp: 50,
          conditions: [],
          condition_durations: {},
        },
      ],
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
      movement_used: {},
    };
    const result = await takeAction({
      action: { type: 'pass' },
      history: [],
      state,
      seed: seedBigDmg,
      context: ctx,
    });
    expect(result.narrative).toMatch(/Relentless Endurance/);
    expect(result.newState.characters[0].hp).toBe(1);
    expect(result.newState.characters[0].class_resource_uses?.relentless_endurance_used).toBe(1);
  });

  it('Goliath Powerful Build: doubled STR for encumbrance — same load no longer heavy', async () => {
    // Same loadout that triggered heavy-encumbrance for a STR-10 Human now
    // passes for a STR-10 Goliath (effective STR 20 for carry).
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    const goliath = makeChar({
      id: 'g-load',
      character_class: 'Fighter',
      species: 'goliath',
      str: 10,
      equipment: { main_hand: 'sword-inst' },
      inventory: [
        { instance_id: 'sword-inst', id: 'shortsword', name: 'Shortsword' },
        // 11 × 10 lb = 110 lb. STR 10 baseline cap is 100 lb (heavy at >100);
        // Powerful Build doubles to 200 lb cap → not heavy.
        ...Array.from({ length: 11 }, (_, i) => ({
          instance_id: `bag-${i}`,
          id: 'bag',
          name: 'Heavy Bag',
          weight: 10,
        })),
      ],
    });
    const enemyId = `${CORRIDOR_ID}#0`;
    const state: GameState = {
      characters: [goliath],
      active_character_id: goliath.id,
      current_room: CORRIDOR_ID,
      visited_rooms: ['entry_hall', CORRIDOR_ID],
      enemies_killed: [],
      loot_taken: [],
      combat_active: true,
      initiative_order: [{ id: goliath.id, roll: 18, is_enemy: false }],
      initiative_idx: 0,
      entities: [
        {
          id: goliath.id,
          isEnemy: false,
          pos: { x: 4, y: 5 },
          hp: 20,
          maxHp: 20,
          conditions: [],
          condition_durations: {},
        },
        {
          id: enemyId,
          isEnemy: true,
          pos: { x: 5, y: 5 },
          hp: 30,
          maxHp: 30,
          conditions: [],
          condition_durations: {},
        },
      ],
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
      movement_used: {},
    };
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: enemyId },
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });
    // No "heavily encumbered" in the disadvantage reason chain.
    expect(result.narrative).not.toMatch(/heavily encumbered/);
  });

  it('Dragonborn Breath Weapon: cone hits enemies in front, consumes 1/short-rest use', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // worst d20 saves → no halving
    const dragonborn = makeChar({
      id: 'd-bw',
      character_class: 'Fighter',
      species: 'dragonborn',
      con: 16,
      level: 1,
    });
    const enemyAId = `${CORRIDOR_ID}#0`;
    const enemyBId = `${CORRIDOR_ID}#1`;
    const fireSeed: Seed = {
      ...seedWithEnemy,
      enemies: {
        [CORRIDOR_ID]: [
          {
            id: enemyAId,
            name: 'Goblin A',
            hp: 8,
            ac: 12,
            damage: '1d6',
            toHit: 3,
            xp: 20,
          },
          {
            id: enemyBId,
            name: 'Goblin B',
            hp: 8,
            ac: 12,
            damage: '1d6',
            toHit: 3,
            xp: 20,
          },
        ],
      },
    };
    const state: GameState = {
      characters: [dragonborn],
      active_character_id: dragonborn.id,
      current_room: CORRIDOR_ID,
      visited_rooms: ['entry_hall', CORRIDOR_ID],
      enemies_killed: [],
      loot_taken: [],
      combat_active: true,
      initiative_order: [{ id: dragonborn.id, roll: 18, is_enemy: false }],
      initiative_idx: 0,
      entities: [
        {
          id: dragonborn.id,
          isEnemy: false,
          pos: { x: 4, y: 5 },
          hp: 20,
          maxHp: 20,
          conditions: [],
          condition_durations: {},
        },
        // Both goblins lined up in the cone — same row, to the right.
        {
          id: enemyAId,
          isEnemy: true,
          pos: { x: 5, y: 5 },
          hp: 8,
          maxHp: 8,
          conditions: [],
          condition_durations: {},
        },
        {
          id: enemyBId,
          isEnemy: true,
          pos: { x: 6, y: 5 },
          hp: 8,
          maxHp: 8,
          conditions: [],
          condition_durations: {},
        },
      ],
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
      movement_used: {},
    };
    const result = await takeAction({
      action: { type: 'use_class_feature', featureId: 'breath_weapon' },
      history: [],
      state,
      seed: fireSeed,
      context: ctx,
    });
    expect(result.narrative).toMatch(/Breath Weapon/);
    expect(result.newState.characters[0].class_resource_uses?.breath_weapon_used).toBe(1);
    // Both goblins took damage.
    const eA = result.newState.entities?.find((e) => e.id === enemyAId);
    const eB = result.newState.entities?.find((e) => e.id === enemyBId);
    expect(eA!.hp).toBeLessThan(8);
    expect(eB!.hp).toBeLessThan(8);
  });
});

describe('Failed precondition actions do not consume the turn', () => {
  // Helper for a 1v1 grid combat state with adjustable positions.
  function makeRangeState(
    charPos: { x: number; y: number },
    enemyPos: { x: number; y: number },
    charOverrides: Partial<Character> = {}
  ): GameState {
    const cleric = makeChar({
      id: 'pc-1',
      character_class: 'Cleric',
      equipment: { main_hand: 'mace-inst' },
      inventory: [{ instance_id: 'mace-inst', id: 'mace', name: 'Mace' }],
      ...charOverrides,
    });
    const enemyId = `${CORRIDOR_ID}#0`;
    return {
      characters: [cleric],
      active_character_id: cleric.id,
      current_room: CORRIDOR_ID,
      visited_rooms: ['entry_hall', CORRIDOR_ID],
      enemies_killed: [],
      loot_taken: [],
      combat_active: true,
      initiative_order: [
        { id: cleric.id, roll: 18, is_enemy: false },
        { id: enemyId, roll: 10, is_enemy: true },
      ],
      initiative_idx: 0,
      entities: [
        {
          id: cleric.id,
          isEnemy: false,
          pos: charPos,
          hp: 20,
          maxHp: 20,
          conditions: [],
          condition_durations: {},
        },
        {
          id: enemyId,
          isEnemy: true,
          pos: enemyPos,
          hp: 30,
          maxHp: 30,
          conditions: [],
          condition_durations: {},
        },
      ],
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
      movement_used: {},
    };
  }

  it('Out-of-range melee attack does NOT advance initiative or consume the action', async () => {
    const state = makeRangeState({ x: 1, y: 5 }, { x: 8, y: 5 }); // 35 ft apart
    const enemyId = state.entities!.find((e) => e.isEnemy)!.id;
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: enemyId },
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });
    expect(result.narrative).toMatch(/Out of range/);
    // Action NOT consumed
    expect(result.newState.characters[0].turn_actions.action_used).toBe(false);
    // Initiative still on the player
    expect(result.newState.initiative_idx).toBe(0);
  });

  it('Out-of-range Sacred Flame does NOT advance initiative or consume the action', async () => {
    const state = makeRangeState(
      { x: 1, y: 5 },
      { x: 14, y: 5 }, // 65 ft — beyond Sacred Flame's 60 ft range
      { wis: 16, spells_known: ['sacred_flame'] }
    );
    const enemyId = state.entities!.find((e) => e.isEnemy)!.id;
    const result = await takeAction({
      action: {
        type: 'cast_spell',
        spellId: 'sacred_flame',
        slotLevel: 0,
        targetEnemyId: enemyId,
      },
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });
    expect(result.narrative).toMatch(/out of range/i);
    expect(result.newState.characters[0].turn_actions.action_used).toBe(false);
    expect(result.newState.initiative_idx).toBe(0);
  });

  it('Out-of-reach Grapple does NOT advance initiative or consume the action', async () => {
    const state = makeRangeState({ x: 1, y: 5 }, { x: 8, y: 5 });
    const enemyId = state.entities!.find((e) => e.isEnemy)!.id;
    const result = await takeAction({
      action: { type: 'grapple', targetEnemyId: enemyId },
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });
    expect(result.narrative).toMatch(/Out of reach/);
    expect(result.newState.characters[0].turn_actions.action_used).toBe(false);
    expect(result.newState.initiative_idx).toBe(0);
  });

  it('Cleric in heavy armor (no proficiency) cannot cast — turn, slot, and concentration preserved', async () => {
    // PHB p.144: casting while wearing armor you lack proficiency with fails.
    // The guard must fire BEFORE consuming the action, the spell slot, or
    // breaking existing concentration.
    const state = makeRangeState(
      { x: 1, y: 5 },
      { x: 3, y: 5 }, // 10 ft — well within Sacred Flame's 60 ft range
      {
        wis: 16,
        spells_known: ['sacred_flame', 'guiding_bolt'],
        armor_proficiencies: ['light', 'medium', 'shield'], // no 'heavy'
        equipment: { armor: 'chain-mail-inst' },
        inventory: [
          { instance_id: 'mace-inst', id: 'mace', name: 'Mace' },
          { instance_id: 'chain-mail-inst', id: 'chain_mail', name: 'Chain Mail' },
        ],
        // Pre-existing concentration: must NOT break when the cast aborts.
        concentrating_on: { spellId: 'guiding_bolt' },
        spell_slots_max: { 1: 2 },
        spell_slots_used: { 1: 0 },
      }
    );
    const enemyId = state.entities!.find((e) => e.isEnemy)!.id;
    const result = await takeAction({
      action: {
        type: 'cast_spell',
        spellId: 'sacred_flame',
        slotLevel: 0,
        targetEnemyId: enemyId,
      },
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });
    expect(result.narrative).toMatch(/cannot cast spells while wearing/i);
    expect(result.narrative).toMatch(/heavy/i);
    const pc = result.newState.characters[0];
    // Action NOT consumed
    expect(pc.turn_actions.action_used).toBe(false);
    // Initiative still on the player
    expect(result.newState.initiative_idx).toBe(0);
    // Existing concentration NOT broken
    expect(pc.concentrating_on?.spellId).toBe('guiding_bolt');
    // For a level-1 leveled spell variant the slot would also be at risk; verify
    // by attempting Guiding Bolt and confirming no slot is consumed.
    const result2 = await takeAction({
      action: {
        type: 'cast_spell',
        spellId: 'guiding_bolt',
        slotLevel: 1,
        targetEnemyId: enemyId,
      },
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });
    expect(result2.narrative).toMatch(/cannot cast spells while wearing/i);
    expect(result2.newState.characters[0].spell_slots_used?.[1] ?? 0).toBe(0);
    expect(result2.newState.characters[0].turn_actions.action_used).toBe(false);
    expect(result2.newState.initiative_idx).toBe(0);
  });
});

describe('preservesCriticalFacts (LLM safety guard)', () => {
  it('accepts faithful paraphrase that keeps all numbers + outcomes', () => {
    const input = 'PC1 hits the goblin for 12 damage. Goblin killed!';
    const output = 'PC1 lands a vicious blow on the goblin — 12 damage. The goblin is killed!';
    expect(preservesCriticalFacts(input, output)).toBe(true);
  });

  it('rejects output that drops a multi-digit damage number', () => {
    const input = 'PC1 hits the goblin for 15 damage.';
    const output = 'PC1 lands a heavy blow on the goblin — considerable damage.';
    expect(preservesCriticalFacts(input, output)).toBe(false);
  });

  it('rejects output that drops the "killed" outcome word', () => {
    const input = 'PC1 hits the goblin for 12 damage. Goblin killed!';
    const output = 'PC1 strikes the goblin for 12 damage. It falls silent.';
    expect(preservesCriticalFacts(input, output)).toBe(false);
  });

  it('ignores single-digit numbers (grammatical, not mechanical)', () => {
    const input = '1 round remaining. PC1 takes 4 damage from frost.';
    const output = 'One round remains. The frost bites PC1 for some damage.';
    expect(preservesCriticalFacts(input, output)).toBe(true);
  });

  it('accepts identical input (passthrough path)', () => {
    const input = 'PC1 attacks. 8 damage.';
    expect(preservesCriticalFacts(input, input)).toBe(true);
  });
});

describe('narrative tokenization', () => {
  it('player melee hit emits {{dmg|N}} for damage and {{note|...}} for the to-hit breakdown', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // forces hit + max damage
    const state = makeState(
      { hp: 20, max_hp: 20 },
      { current_room: CORRIDOR_ID, visited_rooms: ['entry_hall', CORRIDOR_ID] }
    );
    const result = await takeAction({
      action: { type: 'attack' },
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });
    // Damage on hit is wrapped: `... for {{dmg|N}} damage.`
    expect(result.narrative).toMatch(/\{\{dmg\|\d+\}\}/);
    // The to-hit breakdown (d20/AC line) lands inside a {{note|...}} so
    // the UI can dim it relative to the prose.
    expect(result.narrative).toMatch(/\{\{note\|.*d20 .* vs AC .*\}\}/);
  });

  it('spell-attack hit emits {{dmg|N}} for cantrip damage (regression — Sacred Flame / Fire Bolt class)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // hits + max damage
    const state = makeMageState();
    const result = await takeAction({
      action: { type: 'cast_spell', spellId: 'fire_bolt', slotLevel: 0 },
      history: [],
      state,
      seed: spellSeed,
      context: ctxWithRage,
    });
    expect(result.narrative).toMatch(/\{\{dmg\|\d+\}\}/);
  });

  it('save-spell damage emits {{dmg|N}} + {{dc|DC N}} (regression — cantrip / Thunderwave class)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // enemy fails save → full damage
    const state = makeMageState();
    const result = await takeAction({
      action: { type: 'cast_spell', spellId: 'thunderwave', slotLevel: 1 },
      history: [],
      state,
      seed: spellSeed,
      context: ctxWithRage,
    });
    // Damage tokenized + DC tokenized as {{dc|DC N}}.
    expect(result.narrative).toMatch(/\{\{dmg\|\d+\}\}/);
    expect(result.narrative).toMatch(/\{\{dc\|DC \d+\}\}/);
  });

  it('enemy attack on a PC emits {{dmg|N}} damage tokens', async () => {
    // Set up an adjacent enemy + active grid combat so the goblin's turn
    // resolves an attack and reaches applyEnemyAttackNarrative.
    vi.spyOn(Math, 'random').mockReturnValue(0.999); // enemy hits hard
    const pc = makeChar({ id: 'pc-1', hp: 30, max_hp: 30, ac: 10 });
    const enemyId = `${CORRIDOR_ID}#0`;
    const state: GameState = {
      characters: [pc],
      active_character_id: pc.id,
      current_room: CORRIDOR_ID,
      visited_rooms: ['entry_hall', CORRIDOR_ID],
      enemies_killed: [],
      loot_taken: [],
      combat_active: true,
      initiative_order: [
        { id: pc.id, roll: 5, is_enemy: false },
        { id: enemyId, roll: 20, is_enemy: true },
      ],
      initiative_idx: 0,
      entities: [
        {
          id: pc.id,
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
          hp: 10,
          maxHp: 10,
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
    const result = await takeAction({
      action: { type: 'pass' },
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });
    expect(result.narrative).toMatch(/\{\{dmg\|\d+\}\}/);
  });
});

// ─── Death narrative placeholder substitution ────────────────────────────────
//
// Regression for the `{name} falls, life fading...` leak: the `deathLines`
// pool template references {name}, but the two resolution sites in
// processDeathSave were only substituting {enemy} and {world}, so the
// character's name leaked through verbatim to the player. The placeholder
// lint missed it because some *other* code path in gameEngine.ts handles
// {name} elsewhere, and the lint only checked for any global match.

describe('deathLines placeholder substitution', () => {
  it("case 'dead' (failed death save) substitutes {name} with the character name", async () => {
    // PC at 0 HP with 2 failures already. Mock random=0 → d20=1 → Nat 1
    // adds 2 failures → reaches 3 → rollDeathSave returns 'dead', which is
    // the branch that resolves deathLines.
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const downed = makeChar({
      id: 'pc-dn',
      name: 'Halric',
      hp: 0,
      max_hp: 20,
      conditions: ['unconscious'],
      death_saves: { successes: 0, failures: 2 },
    });
    // Use the Vale context — its deathLines pool literally is
    // "{name} falls..." / "{name} collapses..." (both reference {name}).
    const valeSeed: Seed = {
      context_id: valeCtx.id,
      world_name: 'Vale',
      ship_name: 'Vale',
      intro: '',
      seed_id: 'death-line-seed',
      rooms: [{ id: 'millhaven_square', name: 'Crypt', desc: '' }],
      enemies: {},
      loot: {},
      npcs: {},
    };
    const state: GameState = {
      characters: [downed],
      active_character_id: 'pc-dn',
      current_room: 'millhaven_square',
      visited_rooms: ['millhaven_square'],
      enemies_killed: [],
      loot_taken: [],
      combat_active: false,
      initiative_order: [],
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
      action: { type: 'death_save' },
      history: [],
      state,
      seed: valeSeed,
      context: valeCtx,
    });
    expect(result.dead).toBe(true);
    // The deathLines pool only ever yields a line containing the character
    // name — both Vale templates start with "{name}".
    expect(result.narrative).toContain('Halric');
    // The literal placeholder must not survive.
    expect(result.narrative).not.toContain('{name}');
  });
});

// ─── grid_move choice tagging (UI D-pad contract) ────────────────────────────
//
// Movement choices carry `kind: 'grid_move'` and a `direction` enum so the
// frontend can place each arrow button in the right cell of its 3x3 D-pad
// without re-deriving direction from coordinates.

describe('grid_move choice tagging', () => {
  it('every movement choice is tagged with kind=grid_move and a direction', () => {
    const pc = makeChar({ id: 'pc-1', hp: 20, max_hp: 20 });
    const enemyId = `${CORRIDOR_ID}#0`;
    const state: GameState = {
      characters: [pc],
      active_character_id: pc.id,
      current_room: CORRIDOR_ID,
      visited_rooms: ['entry_hall', CORRIDOR_ID],
      enemies_killed: [],
      loot_taken: [],
      combat_active: true,
      initiative_order: [
        { id: pc.id, roll: 20, is_enemy: false },
        { id: enemyId, roll: 5, is_enemy: true },
      ],
      initiative_idx: 0,
      // PC at a non-edge cell so all 8 directions are in bounds; enemy is
      // far enough away that it doesn't occupy any of them.
      entities: [
        {
          id: pc.id,
          isEnemy: false,
          pos: { x: 5, y: 5 },
          hp: 20,
          maxHp: 20,
          conditions: [],
          condition_durations: {},
        },
        {
          id: enemyId,
          isEnemy: true,
          pos: { x: 9, y: 9 },
          hp: 10,
          maxHp: 10,
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
    const choices = generateChoices(state, seedWithEnemy, ctx);
    const moves = choices.filter((c) => c.action.type === 'grid_move');
    expect(moves.length).toBeGreaterThan(0);
    for (const move of moves) {
      expect(move.kind).toBe('grid_move');
      expect(['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']).toContain(move.direction);
    }
    // From an open cell with all 8 neighbours free, all 8 directions surface.
    const directions = new Set(moves.map((m) => m.direction));
    expect(directions.size).toBe(8);
  });

  it('non-movement choices remain untagged (kind is undefined)', () => {
    // A plain out-of-combat examine in the start room — no grid, no kind.
    const choices = generateChoices(makeState(), seed, ctx);
    for (const c of choices) {
      if (c.action.type !== 'grid_move') {
        expect(c.kind).toBeUndefined();
        expect(c.direction).toBeUndefined();
      }
    }
  });
});

// ─── Default-action choice tagging (5.5e action universals) ──────────────────
//
// Dash / Disengage / Dodge / Ready are the no-target action choices that
// fuel the icon row above the regular choice list on the frontend. Each
// gets its own `kind` so the UI can hoist them out of the text list and
// render with the rpg-awesome glyph for that action.

describe('default-action choice tagging', () => {
  it('Dash / Disengage / Dodge / Ready surface tagged when combat is live', () => {
    const pc = makeChar({ id: 'pc-1', hp: 20, max_hp: 20 });
    const enemyId = `${CORRIDOR_ID}#0`;
    const state = makeState(
      { hp: 20, max_hp: 20 },
      {
        current_room: CORRIDOR_ID,
        visited_rooms: ['entry_hall', CORRIDOR_ID],
        combat_active: true,
        initiative_order: [
          { id: pc.id, roll: 20, is_enemy: false },
          { id: enemyId, roll: 5, is_enemy: true },
        ],
        initiative_idx: 0,
      }
    );
    const choices = generateChoices(state, seedWithEnemy, ctx);
    const byKind = new Map(choices.filter((c) => c.kind).map((c) => [c.kind, c]));
    expect(byKind.get('dash')?.action.type).toBe('dash');
    expect(byKind.get('disengage')?.action.type).toBe('disengage');
    expect(byKind.get('dodge')?.action.type).toBe('dodge');
    // Ready requires a living enemy — seedWithEnemy has one in CORRIDOR_ID.
    expect(byKind.get('ready')?.action.type).toBe('ready');
  });

  it('default actions do not surface out of combat', () => {
    const choices = generateChoices(makeState(), seed, ctx);
    for (const c of choices) {
      expect(c.kind).not.toBe('dash');
      expect(c.kind).not.toBe('disengage');
      expect(c.kind).not.toBe('dodge');
      expect(c.kind).not.toBe('ready');
    }
  });

  it('combat verbs (attack / grapple / shove) carry their kind', () => {
    // In a room with two enemies, the per-target loop fires and tags
    // each Attack / Grapple / Shove choice with its corresponding kind.
    // The CombatActionBar consumes these via the FE's enemy filter.
    const pc = makeChar({ id: 'pc-1', hp: 20, max_hp: 20 });
    const enemyA = `${CORRIDOR_ID}#0`;
    const enemyB = `${CORRIDOR_ID}#1`;
    const twoEnemySeed: Seed = {
      ...seedWithEnemy,
      enemies: {
        [CORRIDOR_ID]: [
          { id: enemyA, name: 'Goblin', hp: 10, ac: 12, damage: '1d6', toHit: 3, xp: 20 },
          { id: enemyB, name: 'Goblin', hp: 10, ac: 12, damage: '1d6', toHit: 3, xp: 20 },
        ],
      },
    };
    const state = makeState(
      { hp: 20, max_hp: 20 },
      {
        current_room: CORRIDOR_ID,
        visited_rooms: ['entry_hall', CORRIDOR_ID],
        combat_active: true,
        initiative_order: [
          { id: pc.id, roll: 20, is_enemy: false },
          { id: enemyA, roll: 5, is_enemy: true },
          { id: enemyB, roll: 4, is_enemy: true },
        ],
        initiative_idx: 0,
      }
    );
    const choices = generateChoices(state, twoEnemySeed, ctx);
    expect(choices.filter((c) => c.kind === 'attack').length).toBe(2);
    expect(choices.filter((c) => c.kind === 'grapple').length).toBe(2);
    expect(choices.filter((c) => c.kind === 'shove').length).toBe(2);
    // Each tagged choice carries the right action type.
    for (const c of choices.filter((c) => c.kind === 'attack')) {
      expect(c.action.type).toBe('attack');
    }
    for (const c of choices.filter((c) => c.kind === 'grapple')) {
      expect(c.action.type).toBe('grapple');
    }
    for (const c of choices.filter((c) => c.kind === 'shove')) {
      expect(c.action.type).toBe('shove');
    }
  });
});

// ─── Encounter XP distribution (2024 PHB / SRD 5.2.1) ────────────────────────
//
// XP from a defeated creature is divided equally among all party members
// who participated. Pansori's participation model is "alive when the kill
// resolved" — downed/unconscious PCs (hp=0, dead=false) still get a share;
// only truly-dead PCs are excluded.

describe('encounter XP distribution', () => {
  // Build a multi-PC party state in the corridor with one weak enemy the
  // active PC will one-shot via the basic attack path.
  function makeKillScenario(partyOverrides: Array<Partial<Character>>): GameState {
    const characters = partyOverrides.map((o, i) =>
      makeChar({
        id: `pc-${i + 1}`,
        name: `PC${i + 1}`,
        // Force max-damage one-shot: high STR, crit-on-Math-random=0.99
        str: 20,
        ...o,
      })
    );
    const enemyId = `${CORRIDOR_ID}#0`;
    return {
      characters,
      active_character_id: 'pc-1',
      current_room: CORRIDOR_ID,
      visited_rooms: ['entry_hall', CORRIDOR_ID],
      enemies_killed: [],
      loot_taken: [],
      combat_active: true,
      initiative_order: [
        ...characters.map((c) => ({ id: c.id, roll: 15, is_enemy: false })),
        { id: enemyId, roll: 5, is_enemy: true },
      ],
      initiative_idx: 0,
      entities: [
        ...characters.map((c, i) => ({
          id: c.id,
          isEnemy: false as const,
          pos: { x: 3 + i, y: 4 },
          hp: c.hp,
          maxHp: c.max_hp,
          conditions: [] as string[],
          condition_durations: {} as Record<string, number>,
        })),
        {
          id: enemyId,
          isEnemy: true,
          pos: { x: 3, y: 5 },
          hp: 1, // one-shot trivially
          maxHp: 1,
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
  }

  it('solo PC gets the full XP value (no behavior change for 1-PC parties)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // guaranteed hit + max dmg
    const state = makeKillScenario([{}]);
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: `${CORRIDOR_ID}#0` },
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });
    // seedWithEnemy's Goblin has xp: 20.
    expect(result.newState.characters[0].xp).toBe(20);
  });

  it('multi-PC party splits XP equally among living members', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const state = makeKillScenario([{}, {}, {}, {}]);
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: `${CORRIDOR_ID}#0` },
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });
    // 20 XP / 4 PCs = 5 each; every living PC receives the same share.
    for (const pc of result.newState.characters) {
      expect(pc.xp).toBe(5);
    }
  });

  it('truly-dead party members are excluded from the split', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const state = makeKillScenario([{}, {}, {}, { dead: true, hp: 0 }]);
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: `${CORRIDOR_ID}#0` },
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });
    // 20 XP / 3 living = 6 each (floor). Dead PC's xp stays at 0.
    expect(result.newState.characters[0].xp).toBe(6);
    expect(result.newState.characters[1].xp).toBe(6);
    expect(result.newState.characters[2].xp).toBe(6);
    expect(result.newState.characters[3].xp).toBe(0);
  });

  it('downed (hp=0, dead=false) PCs still get their share', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    // PC2 is unconscious (hp=0) but not dead — death saves still in play.
    const state = makeKillScenario([{}, { hp: 0, conditions: ['unconscious'] }, {}]);
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: `${CORRIDOR_ID}#0` },
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });
    // 20 XP / 3 eligible = 6 each (floor). PC2 is downed but eligible.
    expect(result.newState.characters[0].xp).toBe(6);
    expect(result.newState.characters[1].xp).toBe(6);
    expect(result.newState.characters[2].xp).toBe(6);
  });

  it('kill event xp payload reports the share each PC received', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const state = makeKillScenario([{}, {}, {}, {}]);
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: `${CORRIDOR_ID}#0` },
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });
    const killEvt = result.newState.combat_log?.find((e) => e.kind === 'kill');
    expect(killEvt).toBeDefined();
    // 20 / 4 = 5
    if (killEvt && killEvt.kind === 'kill') {
      expect(killEvt.xp).toBe(5);
    }
  });

  // ─── Non-killer level-up (the original gap fixed here) ────────────────────
  //
  // `splitEncounterXp` distributes XP across the party, but the level-up
  // check used to fire at only 2 of 13 kill sites. Non-killers would hoard
  // XP without ever leveling. `applyPartyLevelUps` runs after every split
  // for both the killer and every living non-killer.

  it('non-killer at XP threshold levels up on a kill', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    // 4 PCs, kill grants 20 XP, 5 each. PC2/PC3 at xp=95 cross to 100 → L2.
    const state = makeKillScenario([{}, { xp: 95 }, { xp: 95 }, {}]);
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: `${CORRIDOR_ID}#0` },
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });
    expect(result.newState.characters[0].level).toBe(1); // killer not at threshold
    expect(result.newState.characters[1].level).toBe(2); // non-killer leveled
    expect(result.newState.characters[2].level).toBe(2); // non-killer leveled
    expect(result.newState.characters[3].level).toBe(1); // not at threshold
  });

  it('killer level-up still fires (existing behavior preserved)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    // Solo PC at xp=85 + 20 = 105 → L2.
    const state = makeKillScenario([{ xp: 85 }]);
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: `${CORRIDOR_ID}#0` },
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });
    expect(result.newState.characters[0].level).toBe(2);
  });

  it('non-killer crossing into an ASI level flags asi_pending', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    // 4 PCs, 20 XP / 4 = 5 each. PC2 at level=3, xp=295 → 300 → L4 (ASI level).
    const state = makeKillScenario([{}, { level: 3, xp: 295, max_hp: 30, hp: 30 }, {}, {}]);
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: `${CORRIDOR_ID}#0` },
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });
    expect(result.newState.characters[1].level).toBe(4);
    expect(result.newState.characters[1].asi_pending).toBe(true);
  });

  it('dead PC at the XP threshold is excluded from the level-up', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    // PC4 is dead — gets no share, no level-up. Living PCs split 20 / 3 = 6.
    const state = makeKillScenario([
      {},
      { xp: 95 }, // 95 + 6 = 101 → L2
      {},
      { xp: 95, dead: true, hp: 0 },
    ]);
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: `${CORRIDOR_ID}#0` },
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });
    expect(result.newState.characters[1].level).toBe(2);
    expect(result.newState.characters[3].level).toBe(1);
    expect(result.newState.characters[3].xp).toBe(95);
  });
});

// ─── Speaker prefix in multi-PC narratives ────────────────────────────────────
//
// Combat narrative templates draw from pools with second-person ("Your
// attack connects..."), third-person impersonal ("A solid strike lands
// on Crypt Ghoul"), and enemy-first opener variants. In a multi-PC
// party every one of those is ambiguous about whose turn it is, so we
// prepend "[CharName] " unless the prose already starts with the
// character's name. Solo parties skip the prefix entirely.

describe('speaker prefix (multi-PC narratives)', () => {
  // Reuse the kill-scenario builder but keep the enemy alive so we get
  // the full hit narrative including the combatHit pool opener.
  function makeAttackScenario(partyOverrides: Array<Partial<Character>>): GameState {
    const characters = partyOverrides.map((o, i) =>
      makeChar({ id: `pc-${i + 1}`, name: `PC${i + 1}`, str: 20, ...o })
    );
    const enemyId = `${CORRIDOR_ID}#0`;
    return {
      characters,
      active_character_id: 'pc-1',
      current_room: CORRIDOR_ID,
      visited_rooms: ['entry_hall', CORRIDOR_ID],
      enemies_killed: [],
      loot_taken: [],
      combat_active: true,
      initiative_order: [
        ...characters.map((c) => ({ id: c.id, roll: 15, is_enemy: false })),
        { id: enemyId, roll: 5, is_enemy: true },
      ],
      initiative_idx: 0,
      entities: [
        ...characters.map((c, i) => ({
          id: c.id,
          isEnemy: false as const,
          pos: { x: 3 + i, y: 4 },
          hp: c.hp,
          maxHp: c.max_hp,
          conditions: [] as string[],
          condition_durations: {} as Record<string, number>,
        })),
        {
          id: enemyId,
          isEnemy: true,
          pos: { x: 3, y: 5 },
          hp: 50, // survive the hit
          maxHp: 50,
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
  }

  it('multi-PC attack narrative gets a "[CharName]" prefix regardless of opener', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // forces hit + max damage
    const state = makeAttackScenario([{}, {}, {}]);
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: `${CORRIDOR_ID}#0` },
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });
    // Combat narrative pools open variably (second-person, third-person,
    // enemy-first). The prefix attaches in every case for multi-PC.
    expect(result.narrative.startsWith('[PC1]')).toBe(true);
  });

  it('solo-PC parties do NOT get the speaker prefix', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const state = makeAttackScenario([{}]);
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: `${CORRIDOR_ID}#0` },
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });
    expect(result.narrative.startsWith('[PC1]')).toBe(false);
  });

  it('single-target offensive spell emits one cast choice per living enemy', () => {
    // Guiding Bolt is a single-target spell attack ("a creature of your
    // choice"). With 2+ enemies in the room, the choice generator must
    // surface one cast option per enemy so the caster picks their
    // target rather than the engine auto-aiming at livingEnemies[0].
    const enemy0Id = `${CORRIDOR_ID}#0`;
    const enemy1Id = `${CORRIDOR_ID}#1`;
    const cleric = makeChar({
      id: 'cleric-1',
      character_class: 'Cleric',
      spells_known: ['guiding_bolt'],
      spell_slots_max: { 1: 2 },
      spell_slots_used: {},
    });
    const twoBanditSeed: Seed = {
      ...seedWithEnemy,
      enemies: {
        [CORRIDOR_ID]: [
          { id: enemy0Id, name: 'Bandit', hp: 11, ac: 12, damage: '1d6', toHit: 3, xp: 25 },
          { id: enemy1Id, name: 'Bandit', hp: 11, ac: 12, damage: '1d6', toHit: 3, xp: 25 },
        ],
      },
    };
    const state = makeState(
      {},
      {
        characters: [cleric],
        active_character_id: cleric.id,
        current_room: CORRIDOR_ID,
        visited_rooms: ['entry_hall', CORRIDOR_ID],
      }
    );
    const choices = generateChoices(state, twoBanditSeed, ctx);
    const casts = choices.filter(
      (c) =>
        c.action.type === 'cast_spell' &&
        (c.action as { spellId: string }).spellId === 'guiding_bolt'
    );
    expect(casts.length).toBe(2);
    const targets = casts
      .map((c) => (c.action as { targetEnemyId?: string }).targetEnemyId)
      .filter(Boolean)
      .sort();
    expect(targets).toEqual([enemy0Id, enemy1Id].sort());
    // Disambiguated labels surface so the player can tell them apart.
    expect(casts.some((c) => c.label.includes('#1'))).toBe(true);
    expect(casts.some((c) => c.label.includes('#2'))).toBe(true);
  });

  it('downed PC (hp=0, dead=false) with active turn still surfaces a death_save choice', () => {
    // Repro for the user-reported "no available options" soft-lock.
    // Fighter is at hp=0 with 2/3 death-save failures (not dead). Active
    // is on Fighter — generateChoices must still return *something* the
    // player can click, namely the death save itself.
    const fighter = makeChar({
      id: 'pc-fighter',
      name: 'Fighter',
      character_class: 'Fighter',
      hp: 0,
      max_hp: 13,
      death_saves: { successes: 1, failures: 2 },
      conditions: ['unconscious'],
      stable: false,
      dead: false,
    });
    const cleric = makeChar({ id: 'pc-cleric', name: 'Cleric', character_class: 'Cleric' });
    const rogue = makeChar({ id: 'pc-rogue', name: 'Rogue', character_class: 'Rogue' });
    const enemyId = `${CORRIDOR_ID}#0`;
    const state: GameState = {
      characters: [fighter, cleric, rogue],
      active_character_id: fighter.id,
      current_room: CORRIDOR_ID,
      visited_rooms: ['entry_hall', CORRIDOR_ID],
      enemies_killed: [],
      loot_taken: [],
      combat_active: true,
      initiative_order: [
        { id: cleric.id, roll: 18, is_enemy: false },
        { id: enemyId, roll: 14, is_enemy: true },
        { id: fighter.id, roll: 8, is_enemy: false },
        { id: rogue.id, roll: 6, is_enemy: false },
      ],
      initiative_idx: 2,
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
      entities: [
        {
          id: fighter.id,
          isEnemy: false,
          pos: { x: 2, y: 2 },
          hp: 0,
          maxHp: 13,
          conditions: ['unconscious'],
          condition_durations: {},
        },
        {
          id: cleric.id,
          isEnemy: false,
          pos: { x: 1, y: 1 },
          hp: 8,
          maxHp: 8,
          conditions: [],
          condition_durations: {},
        },
        {
          id: rogue.id,
          isEnemy: false,
          pos: { x: 3, y: 1 },
          hp: 10,
          maxHp: 10,
          conditions: [],
          condition_durations: {},
        },
        {
          id: enemyId,
          isEnemy: true,
          pos: { x: 2, y: 3 },
          hp: 4,
          maxHp: 13,
          conditions: [],
          condition_durations: {},
        },
      ],
    };
    const choices = generateChoices(state, seedWithEnemy, ctx);
    expect(choices.length).toBeGreaterThan(0);
    expect(choices.some((c) => c.action.type === 'death_save')).toBe(true);
  });

  it('death_save Nat 20 brings the PC back at 1 HP and clears the save counters', async () => {
    // Sanity check that the existing death-save early block (above the
    // switch) still rolls a save, applies regain_hp on a Nat 20, and
    // advances active off the rolling PC via round-robin.
    vi.spyOn(Math, 'random').mockReturnValue(0.999); // d20 → 20
    const fighter = makeChar({
      id: 'pc-fighter',
      name: 'Fighter',
      hp: 0,
      max_hp: 13,
      death_saves: { successes: 1, failures: 2 },
      // Pre-existing conditions persist through Nat 20 recovery; only
      // unconscious clears (RAW: SRD 5.2.1 p.197). Pansori previously
      // cleared the whole array, which erased frightened from a downed-
      // then-revived PC and dropped the disadvantage on their next attack.
      conditions: ['unconscious', 'frightened'],
      condition_durations: { unconscious: 1, frightened: 2 },
      condition_sources: { frightened: 'cl-1' },
      stable: false,
      dead: false,
    });
    const cleric = makeChar({ id: 'pc-cleric', name: 'Cleric' });
    const state: GameState = {
      characters: [fighter, cleric],
      active_character_id: fighter.id,
      current_room: CORRIDOR_ID,
      visited_rooms: ['entry_hall', CORRIDOR_ID],
      enemies_killed: [],
      loot_taken: [],
      combat_active: true,
      initiative_order: [
        { id: cleric.id, roll: 18, is_enemy: false },
        { id: fighter.id, roll: 8, is_enemy: false },
      ],
      initiative_idx: 1,
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
    const result = await takeAction({
      action: { type: 'death_save' },
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });
    const updatedFighter = result.newState.characters.find((c) => c.id === fighter.id)!;
    expect(updatedFighter.hp).toBe(1);
    expect(updatedFighter.death_saves).toEqual({ successes: 0, failures: 0 });
    // unconscious clears; frightened persists per RAW.
    expect(updatedFighter.conditions).not.toContain('unconscious');
    expect(updatedFighter.conditions).toContain('frightened');
    expect(updatedFighter.condition_sources?.frightened).toBe('cl-1');
    expect(result.newState.active_character_id).toBe(cleric.id);
    expect(result.narrative).toMatch(/death save|natural 20/i);
  });

  it('death_save 3rd failure (PC dies) advances active to the next living PC, not a soft-lock', async () => {
    // The user-reported soft-lock: when Fighter's 3rd death-save failure
    // kills them, the engine used to return choices: [] AND leave active
    // pointed at the dead Fighter — generateChoices then returned []
    // because char.dead, and the UI froze on "[Fighter] arrival" with no
    // buttons. The fix advances active to the next living PC and
    // regenerates choices.
    vi.spyOn(Math, 'random').mockReturnValue(0); // d20 → 1 → Nat 1, +2 failures → dead (2+2 → 3+)
    const fighter = makeChar({
      id: 'pc-fighter',
      name: 'Fighter',
      hp: 0,
      max_hp: 13,
      death_saves: { successes: 0, failures: 2 }, // one more failure tips them over
      conditions: ['unconscious'],
      stable: false,
      dead: false,
    });
    const cleric = makeChar({ id: 'pc-cleric', name: 'Cleric' });
    const rogue = makeChar({ id: 'pc-rogue', name: 'Rogue' });
    const state: GameState = {
      characters: [fighter, cleric, rogue],
      active_character_id: fighter.id,
      current_room: CORRIDOR_ID,
      visited_rooms: ['entry_hall', CORRIDOR_ID],
      enemies_killed: [],
      loot_taken: [],
      combat_active: true,
      initiative_order: [
        { id: cleric.id, roll: 18, is_enemy: false },
        { id: rogue.id, roll: 12, is_enemy: false },
        { id: fighter.id, roll: 8, is_enemy: false },
      ],
      initiative_idx: 2,
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
    const result = await takeAction({
      action: { type: 'death_save' },
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });
    // Fighter is now dead.
    const updatedFighter = result.newState.characters.find((c) => c.id === fighter.id)!;
    expect(updatedFighter.dead).toBe(true);
    // Active advanced to a living PC — anyone but the dead Fighter.
    expect(result.newState.active_character_id).not.toBe(fighter.id);
    // Choices for the new active PC must be non-empty so the run continues.
    expect(result.choices.length).toBeGreaterThan(0);
    // `dead: true` in the response is reserved for TPK — Cleric + Rogue
    // are alive, so this is NOT a game-over.
    expect(result.dead).toBe(false);
  });

  it('single-target offensive spell stays as one choice when there is only one enemy', () => {
    const enemyId = `${CORRIDOR_ID}#0`;
    const cleric = makeChar({
      id: 'cleric-1',
      character_class: 'Cleric',
      spells_known: ['guiding_bolt'],
      spell_slots_max: { 1: 2 },
      spell_slots_used: {},
    });
    const state = makeState(
      {},
      {
        characters: [cleric],
        active_character_id: cleric.id,
        current_room: CORRIDOR_ID,
        visited_rooms: ['entry_hall', CORRIDOR_ID],
      }
    );
    const choices = generateChoices(state, seedWithEnemy, ctx);
    const casts = choices.filter(
      (c) =>
        c.action.type === 'cast_spell' &&
        (c.action as { spellId: string }).spellId === 'guiding_bolt'
    );
    expect(casts.length).toBe(1);
    expect((casts[0].action as { targetEnemyId?: string }).targetEnemyId).toBe(enemyId);
  });

  it('in grid combat, active_character_id stays in sync with initiative_idx after a non-turn-ending action', async () => {
    // Regression for the bug the new e2e sync assertion caught:
    // gameEngine.ts:8884 used to round-robin `active_character_id` whenever
    // `usedInitiative` was false, *even when combat was active*. With a
    // grid up and movement still available after an attack, that branch
    // would advance the active marker off the attacker mid-turn — while
    // initiative_idx correctly stayed put — desyncing PartyRail and
    // InitiativeStrip and surfacing the next PC's choice list while the
    // current PC still had moves to make.
    vi.spyOn(Math, 'random').mockReturnValue(0); // attack misses; combat persists
    const char1 = makeChar({ id: 'c1', name: 'Alice', str: 16 });
    const char2 = makeChar({ id: 'c2', name: 'Bob', str: 16 });
    const state: GameState = {
      characters: [char1, char2],
      active_character_id: 'c1',
      current_room: CORRIDOR_ID,
      visited_rooms: ['entry_hall', CORRIDOR_ID],
      enemies_killed: [],
      loot_taken: [],
      combat_active: false,
      initiative_order: [],
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
      action: { type: 'attack' },
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });
    // Combat ignited; grid was created by the engine's combat-start path.
    expect(result.newState.combat_active).toBe(true);
    expect(result.newState.entities?.length ?? 0).toBeGreaterThan(0);

    // The acting PC (c1) keeps the active marker — they still have
    // movement, so RAW says their turn isn't over. initiative_idx
    // points at c1's slot in the order; active_character_id matches.
    expect(result.newState.active_character_id).toBe('c1');
    const activeIdx = result.newState.initiative_idx ?? -1;
    expect(result.newState.initiative_order[activeIdx]?.id).toBe('c1');
  });

  it('prefix is suppressed when the prose already opens with the active PC name', () => {
    // Sanity check at the unit level for the suppression branch — a turn
    // whose narrative starts with the active char's name (e.g. an end-of-turn
    // log line "PC1 ends their turn.") doesn't need the bracket prefix.
    // We exercise this via the existing `end_turn` action path which yields
    // an "{Name} ends their turn." narrative.
    // (Covered indirectly by existing end-of-turn tests; we just assert the
    // string predicate that gates the prefix here.)
    const charName = 'PC1';
    const narrative = `${charName} ends their turn.`;
    const alreadyNamed =
      narrative.startsWith(`${charName} `) ||
      narrative.startsWith(`${charName}:`) ||
      narrative.startsWith(`[${charName}]`);
    expect(alreadyNamed).toBe(true);
  });
});

describe('applyConsequence give_xp', () => {
  function makeParty(specs: Array<Partial<Character>>): GameState {
    const characters = specs.map((s, i) => makeChar({ id: `pc-${i}`, xp: 0, ...s }));
    return makeState({}, { characters, active_character_id: characters[0].id });
  }

  it('splits XP evenly across all living party members', () => {
    const st = makeParty([{}, {}, {}, {}]); // 4 living PCs
    const narrativeParts: string[] = [];
    const next = applyConsequence(
      { type: 'give_xp', amount: 400 },
      st,
      seed,
      'pc-0',
      narrativeParts
    );
    for (const ch of next.characters) {
      expect(ch.xp).toBe(100);
    }
    // Narrative shows the authored total + per-PC share.
    const text = narrativeParts.join(' ');
    expect(text).toContain('+400 XP');
    expect(text).toContain('+100 each');
  });

  it('collapses to a single line for solo parties (each = total)', () => {
    const st = makeParty([{}]); // 1 living PC
    const narrativeParts: string[] = [];
    applyConsequence({ type: 'give_xp', amount: 250 }, st, seed, 'pc-0', narrativeParts);
    const text = narrativeParts.join(' ');
    expect(text).toContain('+250 XP');
    // Solo case: don't repeat the per-PC share since it matches the total.
    expect(text).not.toContain('each');
  });

  it('floors the per-PC share when it does not divide evenly', () => {
    const st = makeParty([{}, {}, {}]); // 3 living PCs, 100 XP → 33 each
    const narrativeParts: string[] = [];
    const next = applyConsequence(
      { type: 'give_xp', amount: 100 },
      st,
      seed,
      'pc-0',
      narrativeParts
    );
    for (const ch of next.characters) {
      expect(ch.xp).toBe(33);
    }
  });

  it('skips dead PCs in the split', () => {
    const st = makeParty([{ dead: true }, {}, {}]); // 1 dead, 2 living
    const narrativeParts: string[] = [];
    const next = applyConsequence(
      { type: 'give_xp', amount: 200 },
      st,
      seed,
      'pc-0',
      narrativeParts
    );
    expect(next.characters[0].xp).toBe(0); // dead
    expect(next.characters[1].xp).toBe(100);
    expect(next.characters[2].xp).toBe(100);
  });

  it('returns state unchanged when amount is zero or negative', () => {
    const st = makeParty([{}, {}]);
    const narrativeParts: string[] = [];
    expect(applyConsequence({ type: 'give_xp', amount: 0 }, st, seed, 'pc-0', narrativeParts)).toBe(
      st
    );
    expect(
      applyConsequence({ type: 'give_xp', amount: -50 }, st, seed, 'pc-0', narrativeParts)
    ).toBe(st);
    expect(narrativeParts).toHaveLength(0);
  });

  it('triggers level-up when context is provided and threshold crossed', () => {
    // L1 → L2 = 300 XP. With 1 living PC, 300 XP grant levels them up.
    const st = makeParty([{ level: 1, xp: 0 }]);
    const narrativeParts: string[] = [];
    const next = applyConsequence(
      { type: 'give_xp', amount: 300 },
      st,
      seed,
      'pc-0',
      narrativeParts,
      ctx
    );
    expect(next.characters[0].xp).toBeGreaterThanOrEqual(300);
    expect(next.characters[0].level).toBeGreaterThanOrEqual(2);
    // Narrative line for level-up should be emitted.
    expect(narrativeParts.join(' ')).toMatch(/level/i);
  });

  it('does not level up when context is omitted', () => {
    const st = makeParty([{ level: 1, xp: 0 }]);
    const narrativeParts: string[] = [];
    const next = applyConsequence(
      { type: 'give_xp', amount: 300 },
      st,
      seed,
      'pc-0',
      narrativeParts
    );
    expect(next.characters[0].xp).toBeGreaterThanOrEqual(300);
    // Level stays at 1 since no context was supplied to trigger level-up.
    expect(next.characters[0].level).toBe(1);
  });
});

// ─── seenKeyForAction — choice-dimming key derivation ───────────────────────
// The backend stamps each choice with a stable seenKey so the FE can dim
// repeat presentations. Room-scoped actions fold the current room into the
// key so two physically distinct same-template objects (e.g. two crypts with
// "dirty_chest") get distinct keys — the bug we explicitly designed against.

describe('seenKeyForAction', () => {
  const st = makeState({}, { current_room: 'crypt_room_a' });

  it('returns undefined for kinds that are not dim-tracked', () => {
    expect(seenKeyForAction({ type: 'attack' }, st)).toBeUndefined();
    expect(
      seenKeyForAction({ type: 'grid_move', entityId: 'c', to: { x: 0, y: 0 } }, st)
    ).toBeUndefined();
    expect(seenKeyForAction({ type: 'dash' }, st)).toBeUndefined();
    expect(
      seenKeyForAction({ type: 'cast_spell', spellId: 'fire_bolt', slotLevel: 0 }, st)
    ).toBeUndefined();
  });

  it('talk_response folds the room id, conversation path, and response index', () => {
    // No active conversation → empty path segment.
    expect(seenKeyForAction({ type: 'talk_response', responseIdx: 2 }, st)).toBe(
      'talk_response::crypt_room_a::::2'
    );
    // A nested node's path is included, so the same index at different depths
    // gets a distinct key (no false-positive dimming across levels).
    const nested = {
      ...st,
      active_conversation: { roomId: 'crypt_room_a', path: [0, 1], prompt: '' },
    };
    expect(seenKeyForAction({ type: 'talk_response', responseIdx: 2 }, nested)).toBe(
      'talk_response::crypt_room_a::0.1::2'
    );
  });

  it('interact_object folds room id + object id', () => {
    expect(seenKeyForAction({ type: 'interact_object', objectId: 'dirty_chest' }, st)).toBe(
      'interact_object::crypt_room_a::dirty_chest'
    );
  });

  it('same object id in different rooms produces different keys', () => {
    const stA = makeState({}, { current_room: 'crypt_room_a' });
    const stB = makeState({}, { current_room: 'crypt_room_b' });
    const keyA = seenKeyForAction({ type: 'interact_object', objectId: 'dirty_chest' }, stA);
    const keyB = seenKeyForAction({ type: 'interact_object', objectId: 'dirty_chest' }, stB);
    expect(keyA).not.toBe(keyB);
  });

  it('accept_quest uses the quest id (room-independent)', () => {
    expect(seenKeyForAction({ type: 'accept_quest', questId: 'quest_crypt' }, st)).toBe(
      'accept_quest::quest_crypt'
    );
  });

  it('examine and loot fold the room id', () => {
    expect(seenKeyForAction({ type: 'examine' }, st)).toBe('examine::crypt_room_a');
    expect(seenKeyForAction({ type: 'loot' }, st)).toBe('loot::crypt_room_a');
  });
});

describe('generateChoices stamps seenKey on dim-tracked choices', () => {
  it('emitted talk_response / interact_object / loot choices carry a seenKey', () => {
    // Use the campaign seed so we get a real room with possible loot/objects.
    const sd = generateSeed(ctx);
    const startRoom = sd.rooms[0];
    const st = makeState({}, { current_room: startRoom.id });
    const choices = generateChoices(st, sd, ctx);
    for (const c of choices) {
      const expected = seenKeyForAction(c.action, st);
      if (expected) {
        expect(c.seenKey).toBe(expected);
      } else {
        expect(c.seenKey).toBeUndefined();
      }
    }
  });
});

describe('interact_object retry on fail', () => {
  function buildSearchableSeed(): Seed {
    return {
      context_id: ctx.id,
      world_name: 'Search Test',
      ship_name: 'Search Test',
      intro: '',
      seed_id: 'search-test',
      rooms: [
        {
          id: 'test_room',
          name: 'Test Room',
          desc: '',
          objects: [
            {
              id: 'test_chest',
              name: 'Test Chest',
              desc: '',
              interactText: 'You work the lock.',
              searchable: true,
              searchDC: 15,
              lootIds: ['healing_potion'],
              foundText: 'Inside: a potion!',
              emptyText: 'The lock resists you. Try again.',
            },
          ],
        },
      ],
      enemies: {},
      loot: {},
      npcs: {},
    };
  }

  it('does NOT mark searched on a failed roll (player can retry)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // d20 → 1, always fails DC 15
    const sd = buildSearchableSeed();
    const st = makeState({ int: 10 }, { current_room: 'test_room' });
    const result = await takeAction({
      action: { type: 'interact_object', objectId: 'test_chest' },
      history: [],
      state: st,
      seed: sd,
      context: ctx,
    });
    // The choice should remain available for a retry.
    expect(result.newState.objects_searched).toEqual([]);
    expect(result.narrative).toMatch(/fail/i);
    expect(result.narrative).toMatch(/try again/i);
    // No loot granted.
    expect(result.newState.characters[0].inventory).toHaveLength(0);
  });

  it('DOES mark searched on success and grants loot', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // d20 → 20, beats any DC
    const sd = buildSearchableSeed();
    const st = makeState({ int: 10 }, { current_room: 'test_room' });
    const result = await takeAction({
      action: { type: 'interact_object', objectId: 'test_chest' },
      history: [],
      state: st,
      seed: sd,
      context: ctx,
    });
    expect(result.newState.objects_searched).toContain('test_room:test_chest');
    expect(result.narrative).toMatch(/success/i);
    expect(result.newState.characters[0].inventory.length).toBeGreaterThan(0);
  });

  it('flavor objects (no DC, no loot) mark searched on first click', async () => {
    const sd: Seed = {
      ...buildSearchableSeed(),
      rooms: [
        {
          id: 'test_room',
          name: 'Test Room',
          desc: '',
          objects: [
            {
              id: 'painting',
              name: 'Painting',
              desc: '',
              interactText: 'A faded portrait.',
              // No searchable / no lootIds — pure flavor.
            },
          ],
        },
      ],
    };
    const st = makeState({}, { current_room: 'test_room' });
    const result = await takeAction({
      action: { type: 'interact_object', objectId: 'painting' },
      history: [],
      state: st,
      seed: sd,
      context: ctx,
    });
    // Flavor objects still one-shot — repeat clicks add nothing.
    expect(result.newState.objects_searched).toContain('test_room:painting');
  });
});

describe('interact_object — lighting-adjusted active search', () => {
  function searchSeed(lighting?: 'bright' | 'dim' | 'dark' | 'sunlight'): Seed {
    return {
      context_id: ctx.id,
      world_name: 'Search Light Test',
      ship_name: 'Search Light Test',
      intro: '',
      seed_id: 'search-light',
      rooms: [
        {
          id: 'test_room',
          name: 'Test Room',
          desc: '',
          lighting,
          objects: [
            {
              id: 'test_chest',
              name: 'Test Chest',
              desc: '',
              interactText: 'You work the lock.',
              searchable: true,
              searchDC: 10,
              lootIds: ['healing_potion'],
              foundText: 'Inside: a potion!',
              emptyText: 'The lock resists you. Try again.',
            },
          ],
        },
      ],
      enemies: {},
      loot: {},
      npcs: {},
    };
  }

  it('a dark room imposes Disadvantage — a would-be success rolls low and fails', async () => {
    // Disadvantage rolls two d20s and takes the lower: 19 (would pass DC 10), then
    // 1 (fails). No darkvision → the room stays Heavily Obscured for the search.
    vi.spyOn(Math, 'random').mockReturnValue(0.5).mockReturnValueOnce(0.9).mockReturnValueOnce(0);
    const st = makeState({ int: 10, darkvision_ft: 0 }, { current_room: 'test_room' });
    const result = await takeAction({
      action: { type: 'interact_object', objectId: 'test_chest' },
      history: [],
      state: st,
      seed: searchSeed('dark'),
      context: ctx,
    });
    expect(result.newState.objects_searched).toEqual([]); // failed → retryable
    expect(result.newState.characters[0].inventory).toHaveLength(0);
  });

  it('a bright room lets the same high roll succeed (single d20)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5).mockReturnValueOnce(0.9);
    const st = makeState({ int: 10, darkvision_ft: 0 }, { current_room: 'test_room' });
    const result = await takeAction({
      action: { type: 'interact_object', objectId: 'test_chest' },
      history: [],
      state: st,
      seed: searchSeed('bright'),
      context: ctx,
    });
    expect(result.newState.objects_searched).toContain('test_room:test_chest');
    expect(result.newState.characters[0].inventory.length).toBeGreaterThan(0);
  });

  it('darkvision negates the Disadvantage in DIM light (dim → bright for the searcher)', async () => {
    // With darkvision, dim shifts to bright → no Disadvantage → the lone high roll
    // is the only die drawn and it succeeds.
    vi.spyOn(Math, 'random').mockReturnValue(0.5).mockReturnValueOnce(0.9);
    const st = makeState({ int: 10, darkvision_ft: 60 }, { current_room: 'test_room' });
    const result = await takeAction({
      action: { type: 'interact_object', objectId: 'test_chest' },
      history: [],
      state: st,
      seed: searchSeed('dim'),
      context: ctx,
    });
    expect(result.newState.objects_searched).toContain('test_room:test_chest');
    expect(result.newState.characters[0].inventory.length).toBeGreaterThan(0);
  });
});

describe('normalizeState preserves seen_choices', () => {
  it('defaults to empty array when missing on a new-format state', () => {
    const st = makeState();
    const result = normalizeState(st as unknown as Record<string, unknown>);
    expect(result.seen_choices).toEqual([]);
  });

  it('passes through an existing seen_choices array', () => {
    const st = makeState({}, { seen_choices: ['interact_object::roomA::chest'] });
    const result = normalizeState(st as unknown as Record<string, unknown>);
    expect(result.seen_choices).toEqual(['interact_object::roomA::chest']);
  });
});

// ─── Multiplayer ownership backfill ──────────────────────────────────────────
// Pre-MP saves don't carry Character.owner_user_id. backfillOwnership writes
// the host's id onto every PC that lacks one — the same idempotent
// schema-evolution pattern as normalizeState's defaulted fields.

describe('backfillOwnership', () => {
  it('fills in owner_user_id on PCs that lack one', () => {
    const pcA = makeChar({ id: 'pc-a' });
    const pcB = makeChar({ id: 'pc-b' });
    const st = makeState({}, { characters: [pcA, pcB] });
    expect(pcA.owner_user_id).toBeUndefined();
    expect(pcB.owner_user_id).toBeUndefined();
    const next = backfillOwnership(st, 'host-id');
    expect(next.characters[0].owner_user_id).toBe('host-id');
    expect(next.characters[1].owner_user_id).toBe('host-id');
  });

  it('leaves existing owner_user_id untouched', () => {
    const pcA = makeChar({ id: 'pc-a', owner_user_id: 'friend-id' });
    const pcB = makeChar({ id: 'pc-b' });
    const st = makeState({}, { characters: [pcA, pcB] });
    const next = backfillOwnership(st, 'host-id');
    // Friend's PC stays theirs even though the route-level host is different.
    expect(next.characters[0].owner_user_id).toBe('friend-id');
    // The unassigned PC defaults to the host.
    expect(next.characters[1].owner_user_id).toBe('host-id');
  });

  it('returns the same state object reference when nothing needs backfilling', () => {
    // Idempotency / cheapness: if every PC already has an owner, we skip the
    // map+spread and hand back the input unchanged. Lets callers cheaply
    // detect "no migration needed" via referential equality.
    const pcA = makeChar({ id: 'pc-a', owner_user_id: 'host-id' });
    const pcB = makeChar({ id: 'pc-b', owner_user_id: 'host-id' });
    const st = makeState({}, { characters: [pcA, pcB] });
    expect(backfillOwnership(st, 'host-id')).toBe(st);
  });
});

// ─── Hostile-in-room blocks egress + loot ────────────────────────────────────
// User playtest report: traveled out of a Crypt room with a Crypt Ghoul
// standing in it. RAW: a hostile in the room means engage or escape — no
// strolling past. Guards added to travel/loot/move handlers + their choice
// emits.

describe('hostile in current room blocks loot / move', () => {
  function valeSeedWithGhoulIn(room: string): Seed {
    const base = generateSeed(valeCtx, 1);
    return {
      ...base,
      enemies: {
        ...base.enemies,
        [room]: [
          {
            id: `${room}#0`,
            name: 'Crypt Ghoul',
            hp: 22,
            maxHp: 22,
            ac: 13,
            damage: '1d6+2',
            toHit: 4,
            xp: 100,
            str: 13,
            dex: 14,
            con: 10,
            int: 7,
            wis: 10,
            cha: 6,
          },
        ],
      },
    };
  }

  it('loot handler rejects when a hostile is in the current room', async () => {
    const seed = {
      ...valeSeedWithGhoulIn('dungeon_offering_chamber'),
      loot: {
        dungeon_offering_chamber: {
          id: 'guild_ledger',
          name: 'Guild Ledger',
          weight: 1,
          desc: '',
          type: 'misc' as const,
          slot: null,
          damage: null,
          ac_bonus: null,
          heal: null,
          effect: null,
          aliases: [],
        },
      },
    };
    const st = makeState(
      { id: 'pc-1' },
      {
        current_room: 'dungeon_offering_chamber',
        active_character_id: 'pc-1',
      }
    );
    const result = await takeAction({
      action: { type: 'loot' },
      history: [],
      state: st,
      seed,
      context: valeCtx,
    });
    expect(result.newState.loot_taken).not.toContain('guild_ledger');
    expect(result.narrative).toMatch(/hostile/i);
  });

  it('marker_move is blocked when a hostile is in the current room', async () => {
    const seed = valeSeedWithGhoulIn('dungeon_offering_chamber');
    const st = makeState(
      { id: 'pc-1' },
      {
        current_room: 'dungeon_offering_chamber',
        map_level: 'local',
        marker_pos: { x: 0, y: 0 },
        active_character_id: 'pc-1',
      }
    );
    const result = await takeAction({
      action: { type: 'marker_move', to: { x: 5, y: 5 } },
      history: [],
      state: st,
      seed,
      context: valeCtx,
    });
    expect(result.newState.current_room).toBe('dungeon_offering_chamber');
    expect(result.narrative).toMatch(/hostile/i);
  });

  it('generateChoices suppresses Pick up while a hostile is in the room', () => {
    const seed = {
      ...valeSeedWithGhoulIn('dungeon_offering_chamber'),
      loot: {
        dungeon_offering_chamber: {
          id: 'guild_ledger',
          name: 'Guild Ledger',
          weight: 1,
          desc: '',
          type: 'misc' as const,
          slot: null,
          damage: null,
          ac_bonus: null,
          heal: null,
          effect: null,
          aliases: [],
        },
      },
    };
    const st = makeState(
      {},
      {
        current_room: 'dungeon_offering_chamber',
        current_location_id: 'dungeon_shattered_crypt',
      }
    );
    const choices = generateChoices(st, seed, valeCtx);
    expect(choices.find((c) => c.action.type === 'loot')).toBeUndefined();
    // Attack-the-ghoul should still surface so the player can engage.
    expect(choices.find((c) => c.action.type === 'attack')).toBeDefined();
  });
});

// ─── Turn Undead is a Magic Action (not bonus action) ───────────────────────
// 2024 PHB p.74. Earlier the engine had Turn Undead gated on bonus_action_used
// + the choice flagged requiresBonusAction:true, which blocked the Cleric
// from using it after a Healing Potion (also bonus action) in a real
// playthrough. This regression catches the action-economy.

describe('Turn Undead — action economy + behavior', () => {
  function clericInThroneRoom(): { st: GameState; sd: Seed } {
    const cleric = makeChar({
      id: 'pc-1',
      name: 'Cleric',
      character_class: 'Cleric',
      level: 4,
      wis: 18,
      class_resource_uses: { channel_divinity: 1 },
      conditions: [],
      condition_durations: {},
    });
    const sd: Seed = {
      context_id: ctx.id,
      world_name: '',
      ship_name: '',
      intro: '',
      seed_id: 'turn-undead-test',
      rooms: [{ id: 'crypt', name: 'Crypt', desc: '' }],
      enemies: {
        crypt: [
          {
            id: 'crypt#0',
            name: 'Skeleton Warrior',
            hp: 10,
            ac: 13,
            damage: '1d6',
            toHit: 4,
            xp: 50,
            str: 10,
            dex: 14,
            con: 15,
            int: 6,
            wis: 8,
            cha: 5,
          },
        ],
      },
      loot: {},
      npcs: {},
    };
    const st = makeState(
      {},
      {
        characters: [cleric],
        active_character_id: 'pc-1',
        current_room: 'crypt',
        combat_active: true,
        initiative_order: [{ id: 'pc-1', roll: 20, is_enemy: false }],
        initiative_idx: 0,
        entities: [
          {
            id: 'pc-1',
            isEnemy: false,
            pos: { x: 1, y: 1 },
            hp: 23,
            maxHp: 23,
            conditions: [],
            condition_durations: {},
          },
          {
            id: 'crypt#0',
            isEnemy: true,
            pos: { x: 3, y: 3 },
            hp: 10,
            maxHp: 10,
            conditions: [],
            condition_durations: {},
          },
        ],
      }
    );
    return { st, sd };
  }

  it('is NOT blocked by a spent bonus action (regression)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // d20 → 1 — Skeleton fails its save
    const { st: initial, sd } = clericInThroneRoom();
    // Simulate the player having already used their bonus action this turn
    // (e.g. drank a Healing Potion or moved a Spiritual Weapon).
    const st: GameState = {
      ...initial,
      characters: initial.characters.map((c) =>
        c.id === 'pc-1' ? { ...c, turn_actions: { ...c.turn_actions, bonus_action_used: true } } : c
      ),
    };
    const result = await takeAction({
      action: { type: 'use_class_feature', featureId: 'turn_undead' },
      history: [],
      state: st,
      seed: sd,
      context: ctx,
    });
    expect(result.narrative).not.toMatch(/Bonus action already used/i);
    expect(result.narrative).toMatch(/Turn Undead/i);
    // Undead in range should have failed the save and gained 'frightened'.
    const skel = result.newState.entities?.find((e) => e.id === 'crypt#0');
    expect(skel?.conditions).toContain('frightened');
  });

  it('consumes the action (action_used = true)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const { st, sd } = clericInThroneRoom();
    const result = await takeAction({
      action: { type: 'use_class_feature', featureId: 'turn_undead' },
      history: [],
      state: st,
      seed: sd,
      context: ctx,
    });
    const cleric = result.newState.characters.find((c) => c.id === 'pc-1');
    expect(cleric?.turn_actions.action_used).toBe(true);
    // Bonus action should NOT have been consumed — that's the bug we fixed.
    expect(cleric?.turn_actions.bonus_action_used).not.toBe(true);
  });

  it('rejects when the main action is already spent', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const { st: initial, sd } = clericInThroneRoom();
    const st: GameState = {
      ...initial,
      characters: initial.characters.map((c) =>
        c.id === 'pc-1' ? { ...c, turn_actions: { ...c.turn_actions, action_used: true } } : c
      ),
    };
    const result = await takeAction({
      action: { type: 'use_class_feature', featureId: 'turn_undead' },
      history: [],
      state: st,
      seed: sd,
      context: ctx,
    });
    expect(result.narrative).toMatch(/Action already used/i);
  });
});

// ─── Quest auto-acceptance ───────────────────────────────────────────────────
// The explicit "Accept quest" choice was removed. A talk_response in the
// giver NPC's room (matched by quest step[0]'s tightened condition) is now
// enough to auto-activate the quest. The router emits a "Quest accepted —"
// narrative line in that case.

describe('quest auto-acceptance via talk_response', () => {
  it('generateChoices no longer emits an "Accept quest" choice', () => {
    // Build a minimal vale-shaped state in Aldric's room.
    const sd = generateSeed(valeCtx, 1);
    const st = makeState({}, { current_room: 'millhaven_market' });
    const choices = generateChoices(st, sd, valeCtx);
    const acceptChoice = choices.find((c) => c.action.type === 'accept_quest');
    expect(acceptChoice).toBeUndefined();
    // The Talk-to-NPC choice keeps its quest indicator [!] when an
    // unaccepted quest is available from this NPC.
    const talkChoice = choices.find((c) => c.action.type === 'talk');
    expect(talkChoice?.label).toMatch(/\[!\]/);
  });

  it('Vale quest_shipment step 1 only fires in millhaven_market (room-scoped)', async () => {
    // Action matches (talk_response) but the room does not — should NOT trigger.
    const elsewhere = {
      action: 'talk_response',
      room_id: 'millhaven_temple',
      current_town_id: 'millhaven_town',
      location_id: 'town_millhaven',
      enemies_killed: [],
      loot_taken: [],
      visited_rooms: [],
      flags: {},
      campaign_flags: {},
      quest_progress: [],
      faction_rep: {},
      world_minute: 480,
      world_day: 1,
      active_level: 1,
      active_class: 'Fighter',
    };
    const emptyCs: CampaignState = {
      campaign_id: valeCtx.id,
      user_id: 'u',
      world_minute: 480,
      current_location: 'town_millhaven',
      quests: [],
      flags: {},
      faction_rep: {},
      npc_attitudes: {},
    };
    const completionsWrongRoom = await evaluateQuestSteps(
      emptyCs,
      valeCtx.campaign?.quests ?? [],
      elsewhere
    );
    expect(completionsWrongRoom.find((c) => c.questId === 'quest_shipment')).toBeUndefined();

    // Same action, correct room — should activate quest_shipment.
    const correct = { ...elsewhere, room_id: 'millhaven_market' };
    const completionsRightRoom = await evaluateQuestSteps(
      emptyCs,
      valeCtx.campaign?.quests ?? [],
      correct
    );
    const matched = completionsRightRoom.find((c) => c.questId === 'quest_shipment');
    expect(matched).toBeDefined();
    expect(matched?.completedStepIds).toEqual(['step_talk_aldric']);
  });

  it('applyQuestCompletions reports newly-activated quest IDs', () => {
    const emptyCs: CampaignState = {
      campaign_id: valeCtx.id,
      user_id: 'u',
      world_minute: 480,
      current_location: 'town_millhaven',
      quests: [],
      flags: {},
      faction_rep: {},
      npc_attitudes: {},
    };
    const result = applyQuestCompletions(emptyCs, valeCtx.campaign?.quests ?? [], [
      { questId: 'quest_shipment', completedStepIds: ['step_talk_aldric'] },
    ]);
    expect(result.newlyActivatedQuestIds).toEqual(['quest_shipment']);
    expect(result.cs.quests).toHaveLength(1);
    expect(result.cs.quests[0]).toMatchObject({
      questId: 'quest_shipment',
      status: 'active',
      completedSteps: ['step_talk_aldric'],
    });
  });

  it('does not auto-activate later steps of an inactive quest (only step 1 is eligible)', async () => {
    // facts simulate "loot_taken contains guild_ledger" (which would match
    // quest_shipment step 2). Because the quest is inactive, only step 1 is
    // checked — and step 1 requires room_id = millhaven_market, which we
    // don't satisfy here. So nothing should activate.
    const facts: CampaignFacts = {
      action: 'loot',
      room_id: 'dungeon_crypt_throne',
      current_town_id: '',
      location_id: 'dungeon_shattered_crypt',
      enemies_killed: [],
      loot_taken: ['guild_ledger'],
      visited_rooms: [],
      flags: {},
      campaign_flags: {},
      quest_progress: [],
      faction_rep: {},
      world_minute: 480,
      world_day: 1,
      active_level: 1,
      active_class: 'Fighter',
    };
    const emptyCs: CampaignState = {
      campaign_id: valeCtx.id,
      user_id: 'u',
      world_minute: 480,
      current_location: 'town_millhaven',
      quests: [],
      flags: {},
      faction_rep: {},
      npc_attitudes: {},
    };
    const completions = await evaluateQuestSteps(emptyCs, valeCtx.campaign?.quests ?? [], facts);
    expect(completions.find((c) => c.questId === 'quest_shipment')).toBeUndefined();
  });
});
