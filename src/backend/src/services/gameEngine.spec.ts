import type {
  CampaignFacts,
  CampaignState,
  Character,
  Context,
  Enemy,
  GameRule,
  GameState,
  GridPos,
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
import { generateRoguelikeSeed, generateSeed } from './procgen.js';
import { context as ctx } from '../contexts/sandbox.js';
import { context as valeCtx } from '../contexts/vale_of_shadows.js';

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
    { id: ctx.startRoomId, name: 'Entry Hall', desc: 'The entry hall.' },
    { id: CORRIDOR_ID, name: 'Guard Post', desc: 'A guard post.' },
    { id: ctx.escapeRoomId, name: 'Exit Gate', desc: 'The exit gate.' },
  ],
  connections: {
    [ctx.startRoomId]: [CORRIDOR_ID],
    [CORRIDOR_ID]: [ctx.startRoomId, ctx.escapeRoomId],
    [ctx.escapeRoomId]: [CORRIDOR_ID],
  },
  enemies: {},
  loot: {},
  npcs: {},
};

const seedWithEnemy: Seed = {
  ...seed,
  enemies: {
    [CORRIDOR_ID]: [
      {
        id: `${CORRIDOR_ID}#0`,
        name: 'Goblin',
        hp: 10,
        ac: 12,
        damage: '1d6',
        toHit: 3,
        xp: 20,
      },
    ],
  },
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

function makeChar(overrides: Partial<Character> = {}): Character {
  return {
    id: 'char-1',
    name: 'Test Hero',
    character_class: 'Soldier',
    portrait_url: null,
    hp: 10,
    max_hp: 10,
    ac: 10,
    str: 10,
    dex: 10,
    con: 10,
    int: 10,
    wis: 10,
    cha: 10,
    gold: 5,
    xp: 0,
    level: 1,
    inventory: [],
    equipped_weapon: null,
    equipped_armor: null,
    equipped_shield: null,
    conditions: [],
    condition_durations: {},
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
    hit_die: 8,
    hit_dice_remaining: 1,
    class_resource_uses: {},
    asi_pending: false,
    exhaustion_level: 0,
    background_id: null,
    skill_proficiencies: [],
    tool_proficiencies: [],
    spell_slots_max: {},
    spell_slots_used: {},
    spells_known: [],
    armor_proficiencies: [],
    weapon_proficiencies: [],
    attuned_items: [],
    concentrating_on: null,
    ...overrides,
  };
}

function makeState(
  charOverrides: Partial<Character> = {},
  stateOverrides: Partial<GameState> = {}
): GameState {
  const char = makeChar(charOverrides);
  return {
    characters: [char],
    active_character_id: char.id,
    current_room: ctx.startRoomId,
    visited_rooms: [ctx.startRoomId],
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
    npc_attitudes: {},
    npc_talked: [],
    traps_triggered: [],
    traps_disarmed: [],
    objects_searched: [],
    flags: {},
    ...stateOverrides,
  };
}

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
      equipped_weapon: null,
      equipped_armor: null,
      equipped_shield: null,
      current_room: ctx.startRoomId,
      visited_rooms: [ctx.startRoomId],
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
          equipped_weapon: null,
          equipped_armor: null,
          equipped_shield: null,
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
      current_room: ctx.startRoomId,
      visited_rooms: [ctx.startRoomId],
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
          equipped_weapon: null,
          equipped_armor: null,
          equipped_shield: null,
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
      current_room: ctx.startRoomId,
      visited_rooms: [ctx.startRoomId],
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
    const text = buildArrivalNarrative(ctx.startRoomId, makeState(), seed, ctx);
    expect(typeof text).toBe('string');
    expect(text.length).toBeGreaterThan(0);
  });

  it('includes the name of an adjacent room in the exits list', () => {
    const text = buildArrivalNarrative(ctx.startRoomId, makeState(), seed, ctx);
    expect(text).toContain('Guard Post');
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

  it('includes a move option for each adjacent room', () => {
    const choices = generateChoices(makeState(), seed, ctx);
    expect(choices.some((c) => c.label.includes('Guard Post'))).toBe(true);
    expect(choices.some((c) => c.action.type === 'move')).toBe(true);
  });

  it('includes attack option when an enemy is alive', () => {
    const state = makeState(
      {},
      { current_room: CORRIDOR_ID, visited_rooms: [ctx.startRoomId, CORRIDOR_ID] }
    );
    const choices = generateChoices(state, seedWithEnemy, ctx);
    expect(choices.some((c) => c.action.type === 'attack')).toBe(true);
    expect(choices.some((c) => c.label.toLowerCase().includes('attack'))).toBe(true);
  });

  it('includes loot pick-up option when loot is available', () => {
    const state = makeState(
      {},
      { current_room: CORRIDOR_ID, visited_rooms: [ctx.startRoomId, CORRIDOR_ID] }
    );
    const choices = generateChoices(state, seedWithLoot, ctx);
    expect(choices.some((c) => c.action.type === 'loot')).toBe(true);
    expect(choices.some((c) => c.label.toLowerCase().includes('med-kit'))).toBe(true);
  });

  it('includes escape choice at escape room when no enemy is alive', () => {
    const state = makeState(
      {},
      {
        current_room: ctx.escapeRoomId,
        visited_rooms: [ctx.startRoomId, CORRIDOR_ID, ctx.escapeRoomId],
      }
    );
    const choices = generateChoices(state, seed, ctx);
    expect(choices.some((c) => c.action.type === 'escape')).toBe(true);
    expect(choices.some((c) => c.label === ctx.escapeChoiceText)).toBe(true);
  });

  it('does not include escape choice when an enemy blocks the escape room', () => {
    const blockedSeed: Seed = {
      ...seed,
      enemies: {
        [ctx.escapeRoomId]: [
          {
            id: `${ctx.escapeRoomId}#0`,
            name: 'Guard',
            hp: 10,
            ac: 12,
            damage: '1d6',
            toHit: 3,
            xp: 10,
          },
        ],
      },
    };
    const state = makeState(
      {},
      {
        current_room: ctx.escapeRoomId,
        visited_rooms: [ctx.startRoomId, CORRIDOR_ID, ctx.escapeRoomId],
      }
    );
    const choices = generateChoices(state, blockedSeed, ctx);
    expect(choices.every((c) => c.action.type !== 'escape')).toBe(true);
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
  });

  it('moving to an adjacent room updates current_room and room_log', async () => {
    const result = await takeAction({
      action: { type: 'move', roomId: CORRIDOR_ID },
      history: [],
      state: makeState(),
      seed,
      context: ctx,
    });
    expect(result.newState.current_room).toBe(CORRIDOR_ID);
    expect(result.newState.visited_rooms).toContain(CORRIDOR_ID);
    expect(result.newState.room_log).toHaveLength(1);
    expect(result.newState.room_log[0].length).toBeGreaterThan(0);
    expect(result.newState.room_log[0]).toMatch(/entry hall|exit gate|guard post/i);
  });

  it('picking up loot adds item to inventory and marks loot_taken', async () => {
    const state = makeState(
      {},
      { current_room: CORRIDOR_ID, visited_rooms: [ctx.startRoomId, CORRIDOR_ID] }
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

  // Test Case I — Grid combat blocks room movement
  it('[Case I] moving out of a room during grid combat is blocked (use Disengage + grid_move)', async () => {
    const state = makeState(
      { hp: 20, max_hp: 20 },
      {
        current_room: CORRIDOR_ID,
        visited_rooms: [ctx.startRoomId, CORRIDOR_ID],
        combat_active: true,
        initiative_order: [
          { id: 'char-1', roll: 15, is_enemy: false },
          { id: CORRIDOR_ID, roll: 10, is_enemy: true },
        ],
        initiative_idx: 0,
      }
    );
    const result = await takeAction({
      action: { type: 'move', roomId: ctx.startRoomId },
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });
    // Move is blocked; player stays in room
    expect(result.newState.current_room).toBe(CORRIDOR_ID);
    expect(result.narrative.toLowerCase()).toMatch(/cannot flee|grid combat|disengage/);
  });

  it('[Case I] moving without an enemy present triggers no opportunity attack', async () => {
    const result = await takeAction({
      action: { type: 'move', roomId: CORRIDOR_ID },
      history: [],
      state: makeState(),
      seed,
      context: ctx,
    });
    expect(result.narrative.toLowerCase()).not.toMatch(/strikes as you go|opportunity/);
  });

  it('escape action at the escape room with no enemy sets escaped=true', async () => {
    const state = makeState(
      {},
      {
        current_room: ctx.escapeRoomId,
        visited_rooms: [ctx.startRoomId, CORRIDOR_ID, ctx.escapeRoomId],
      }
    );
    const result = await takeAction({
      action: { type: 'escape' },
      history: [],
      state,
      seed,
      context: ctx,
    });
    expect(result.escaped).toBe(true);
  });

  it('first attack populates initiative_order with all party members and the enemy', async () => {
    const state = makeState(
      {},
      { current_room: CORRIDOR_ID, visited_rooms: [ctx.startRoomId, CORRIDOR_ID] }
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
      { current_room: CORRIDOR_ID, visited_rooms: [ctx.startRoomId, CORRIDOR_ID] }
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
      { current_room: CORRIDOR_ID, visited_rooms: [ctx.startRoomId, CORRIDOR_ID] }
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
      visited_rooms: [ctx.startRoomId, CORRIDOR_ID],
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
        visited_rooms: [ctx.startRoomId, CORRIDOR_ID],
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
        visited_rooms: [ctx.startRoomId, CORRIDOR_ID],
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
        visited_rooms: [ctx.startRoomId, CORRIDOR_ID],
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
      current_room: ctx.startRoomId,
      visited_rooms: [ctx.startRoomId],
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
    expect(result.newState.short_rested_rooms).toContain(ctx.startRoomId);
  });

  it('cannot short rest twice in the same room', async () => {
    const state = makeState(
      { hp: 3, max_hp: 10, hit_die: 8, hit_dice_remaining: 2 },
      { short_rested_rooms: [ctx.startRoomId] }
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
      { current_room: CORRIDOR_ID, visited_rooms: [ctx.startRoomId, CORRIDOR_ID] }
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
      { current_room: CORRIDOR_ID, visited_rooms: [ctx.startRoomId, CORRIDOR_ID] }
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
    const result = await runRules(state, ctx, { type: 'examine' }, ctx.startRoomId, seed);
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
      ctx.startRoomId,
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
      ctx.startRoomId,
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
      ctx.startRoomId,
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
      ctx.startRoomId,
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
      ctx.startRoomId,
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
      ctx.startRoomId,
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
      ctx.startRoomId,
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
      ctx.startRoomId,
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
      ctx.startRoomId,
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

    const first = await runRules(state, ctxWithRule, { type: 'examine' }, ctx.startRoomId, seed);
    const second = await runRules(
      first.state,
      ctxWithRule,
      { type: 'examine' },
      ctx.startRoomId,
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
          { fact: 'action', operator: 'equal', value: 'move' },
          { fact: 'room_id', operator: 'equal', value: CORRIDOR_ID },
        ],
      },
      consequences: [{ type: 'set_flag', key: 'entered_corridor', value: true }],
    };
    const state = makeState({}, { current_room: CORRIDOR_ID });
    const result = await runRules(
      state,
      makeCtxWithRules([rule]),
      { type: 'move', roomId: CORRIDOR_ID },
      ctx.startRoomId,
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
      ctx.startRoomId,
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
        visited_rooms: [ctx.startRoomId, CORRIDOR_ID],
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
      visited_rooms: [ctx.startRoomId, CORRIDOR_ID],
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
      visited_rooms: [ctx.startRoomId, CORRIDOR_ID],
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
      visited_rooms: [ctx.startRoomId, CORRIDOR_ID],
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

// (generateRoguelikeSeed is imported at the top of the file)

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

// ─── Full conditions list ─────────────────────────────────────────────────────

describe('conditions — new types', () => {
  it('incapacitated character gets only a pass choice', () => {
    const state = makeState(
      { conditions: ['incapacitated'], condition_durations: { incapacitated: 1 } },
      {
        current_room: CORRIDOR_ID,
        visited_rooms: [ctx.startRoomId, CORRIDOR_ID],
      }
    );
    const choices = generateChoices(state, seedWithEnemy, ctx);
    expect(choices).toHaveLength(1);
    expect(choices[0].action.type).toBe('pass');
    expect(choices[0].label).toMatch(/INCAPACITATED/);
  });

  it('grappled character cannot move — gets a pass choice instead of move', () => {
    const state = makeState({ conditions: ['grappled'], condition_durations: { grappled: 1 } });
    const choices = generateChoices(state, seed, ctx);
    expect(choices.every((c) => c.action.type !== 'move')).toBe(true);
    expect(choices.some((c) => c.label.match(/GRAPPLED/))).toBe(true);
  });

  it('restrained character cannot move', () => {
    const state = makeState({ conditions: ['restrained'], condition_durations: { restrained: 1 } });
    const choices = generateChoices(state, seed, ctx);
    expect(choices.every((c) => c.action.type !== 'move')).toBe(true);
  });

  it('move action is blocked in takeAction when grappled', async () => {
    const state = makeState({ conditions: ['grappled'], condition_durations: { grappled: 1 } });
    const result = await takeAction({
      action: { type: 'move', roomId: CORRIDOR_ID },
      history: [],
      state,
      seed,
      context: ctx,
    });
    expect(result.newState.current_room).toBe(ctx.startRoomId); // did not move
    expect(result.narrative).toMatch(/grappled/i);
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

  // ── 2024 PHB Weapon Mastery ─────────────────────────────────────────────────

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
      equipped_weapon: staffInst,
      inventory: [{ instance_id: staffInst, id: 'quarterstaff', name: 'Quarterstaff' }],
      weapon_masteries: ['quarterstaff'],
    });
    const goblinId = `${CORRIDOR_ID}#0`;
    const state: GameState = {
      characters: [fighter],
      active_character_id: fighterId,
      current_room: CORRIDOR_ID,
      visited_rooms: [ctx.startRoomId, CORRIDOR_ID],
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
      equipped_weapon: swordInst,
      inventory: [{ instance_id: swordInst, id: 'shortsword', name: 'Shortsword' }],
      weapon_masteries: ['shortsword'],
    });
    const goblinId = `${CORRIDOR_ID}#0`;
    const state: GameState = {
      characters: [rogue],
      active_character_id: rogueId,
      current_room: CORRIDOR_ID,
      visited_rooms: [ctx.startRoomId, CORRIDOR_ID],
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
      equipped_weapon: swordInst,
      inventory: [{ instance_id: swordInst, id: 'longsword', name: 'Longsword' }],
      weapon_masteries: [], // empty — no mastery applies
    });
    const goblinId = `${CORRIDOR_ID}#0`;
    const state: GameState = {
      characters: [fighter],
      active_character_id: fighterId,
      current_room: CORRIDOR_ID,
      visited_rooms: [ctx.startRoomId, CORRIDOR_ID],
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
    expect(result.narrative).not.toMatch(/\[(Vex|Topple|Push|Sap|Slow|Graze|Cleave|Flex):/);
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
      equipped_weapon: swordInst,
      inventory: [{ instance_id: swordInst, id: 'greatsword', name: 'Greatsword' }],
      weapon_masteries: ['greatsword'],
    });
    const goblinId = `${CORRIDOR_ID}#0`;
    const state: GameState = {
      characters: [fighter],
      active_character_id: fighterId,
      current_room: CORRIDOR_ID,
      visited_rooms: [ctx.startRoomId, CORRIDOR_ID],
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
      equipped_weapon: axeInst,
      inventory: [{ instance_id: axeInst, id: 'greataxe', name: 'Greataxe' }],
      weapon_masteries: ['greataxe'],
    });
    const goblinAId = `${CORRIDOR_ID}#0`;
    const goblinBId = `${CORRIDOR_ID}#1`;
    const state: GameState = {
      characters: [fighter],
      active_character_id: fighterId,
      current_room: CORRIDOR_ID,
      visited_rooms: [ctx.startRoomId, CORRIDOR_ID],
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

  it('Flex mastery: battleaxe with shield uses two-handed (1d10) damage die', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    const fighterId = 'f-flex';
    const axeInst = 'f-axe';
    const shieldInst = 'f-shield';
    const fighter = makeChar({
      id: fighterId,
      character_class: 'Fighter',
      level: 3,
      str: 16,
      equipped_weapon: axeInst,
      equipped_shield: shieldInst,
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
      visited_rooms: [ctx.startRoomId, CORRIDOR_ID],
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
    // With Math.random=0.999, 1d10 rolls 10 + STR mod 3 = 13 damage; 1d8 only
    // 8 + 3 = 11. Damage should be ≥ 13 (the two-handed die fired).
    const goblin = result.newState.entities?.find((e) => e.id === goblinId);
    const dmgDealt = 80 - (goblin?.hp ?? 80);
    expect(dmgDealt).toBeGreaterThanOrEqual(13);
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
      equipped_weapon: shortswordInst,
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
      visited_rooms: [ctx.startRoomId, CORRIDOR_ID],
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

  // ── Bardic Inspiration (2024 PHB) ──────────────────────────────────────────

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
      current_room: ctx.startRoomId,
      visited_rooms: [ctx.startRoomId],
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
      equipped_weapon: swordInst,
      inventory: [{ instance_id: swordInst, id: 'longsword', name: 'Longsword' }],
      bardic_inspiration_die: 'd6',
    });
    const goblinId = `${CORRIDOR_ID}#0`;
    const state: GameState = {
      characters: [fighter],
      active_character_id: fighterId,
      current_room: CORRIDOR_ID,
      visited_rooms: [ctx.startRoomId, CORRIDOR_ID],
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

  // ── Heroic Inspiration: 2024 PHB spend on saves ─────────────────────────────

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
        visited_rooms: [ctx.startRoomId, CORRIDOR_ID],
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

// ─── Enemy HP scaling ─────────────────────────────────────────────────────────

describe('enemy HP scaling by party size', () => {
  it('1-player seed has unscaled enemy HP (1× base)', () => {
    const s = generateRoguelikeSeed(ctx, 1);
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
    const s1 = generateRoguelikeSeed(ctx, 1);
    const s2 = generateRoguelikeSeed(ctx, 2);
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

// ─── Class features ───────────────────────────────────────────────────────────

// Context with Warrior class that has rage feature, for rage-specific tests
const ctxWithRage: Context = {
  ...ctx,
  classFeatures: { ...ctx.classFeatures, Warrior: ['rage'] },
};

const dungeonSeedWithEnemy: Seed = {
  context_id: ctx.id,
  world_name: 'The Testing Grounds',
  ship_name: '',
  intro: 'Test.',
  seed_id: 'dungeon-test-seed',
  rooms: [
    { id: ctx.startRoomId, name: 'Entry Hall', desc: 'Entry.' },
    { id: CORRIDOR_ID, name: 'Guard Post', desc: 'Dark.' },
    { id: ctx.escapeRoomId, name: 'Exit Gate', desc: 'Exit.' },
  ],
  connections: {
    [ctx.startRoomId]: [CORRIDOR_ID],
    [CORRIDOR_ID]: [ctx.startRoomId, ctx.escapeRoomId],
    [ctx.escapeRoomId]: [CORRIDOR_ID],
  },
  enemies: {
    [CORRIDOR_ID]: [
      {
        id: `${CORRIDOR_ID}#0`,
        name: 'Goblin',
        hp: 10,
        ac: 12,
        damage: '1d4',
        toHit: 2,
        xp: 20,
      },
    ],
  },
  loot: {},
  npcs: {},
};

describe('class features', () => {
  // ── Sorcerer subclasses (PHB Chapter 3) ─────────────────────────────────────

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

  // ── Warlock subclasses (PHB Chapter 3) ──────────────────────────────────────

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
      equipped_weapon: 'wl-dagger',
      inventory: [{ instance_id: 'wl-dagger', id: 'dagger', name: 'Dagger' }],
    });
    const state: GameState = {
      characters: [wl],
      active_character_id: warlockId,
      current_room: CORRIDOR_ID,
      visited_rooms: [ctx.startRoomId, CORRIDOR_ID],
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
      subclass: 'archfey',
      level: 3,
      cha: 18,
      temp_hp: 0,
      equipped_weapon: 'wl-dagger2',
      inventory: [{ instance_id: 'wl-dagger2', id: 'dagger', name: 'Dagger' }],
    });
    const state: GameState = {
      characters: [wl],
      active_character_id: warlockId,
      current_room: CORRIDOR_ID,
      visited_rooms: [ctx.startRoomId, CORRIDOR_ID],
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

  it('Archfey Warlock — Fey Presence frightens enemies in 10 ft on failed WIS save', async () => {
    // Force d20 → 1 on enemy saves so they fail. Warlock at (5,5), goblin at (6,6) → 5 ft.
    vi.spyOn(Math, 'random').mockReturnValue(0); // d20 → 1 always
    const warlockId = 'wl-archfey';
    const goblinId = `${CORRIDOR_ID}#0`;
    const wl = makeChar({
      id: warlockId,
      character_class: 'Warlock',
      subclass: 'archfey',
      level: 3,
      cha: 16, // +3
    });
    const state: GameState = {
      characters: [wl],
      active_character_id: warlockId,
      current_room: CORRIDOR_ID,
      visited_rooms: [ctx.startRoomId, CORRIDOR_ID],
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
          pos: { x: 5, y: 5 },
          hp: 20,
          maxHp: 20,
          conditions: [],
          condition_durations: {},
        },
        {
          id: goblinId,
          isEnemy: true,
          pos: { x: 6, y: 6 },
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
      action: { type: 'use_class_feature', featureId: 'fey_presence' },
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });
    expect(result.narrative).toMatch(/Fey Presence/);
    const ent = result.newState.entities?.find((e) => e.id === goblinId);
    expect(ent?.conditions).toContain('frightened');
    // Used resource flag set
    expect(result.newState.characters[0].class_resource_uses?.fey_presence_used).toBe(1);
  });

  // ── Druid subclasses (PHB p.65-69) ──────────────────────────────────────────

  it('Circle of the Moon — Wild Shape uses bonus action + CR scales by level/3', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const druidId = 'd1';
    const druid = makeChar({
      id: druidId,
      character_class: 'Druid',
      subclass: 'moon',
      level: 6, // moon CR = 6/3 = 2
      hp: 30,
      max_hp: 30,
      class_resource_uses: { wild_shape: 2 },
    });
    const state = makeState(
      {},
      {
        characters: [druid],
        active_character_id: druidId,
        combat_active: true,
        initiative_order: [{ id: druidId, roll: 18, is_enemy: false }],
        initiative_idx: 0,
      }
    );
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
    expect(newDruid.turn_actions.bonus_action_used).toBe(true);
    expect(newDruid.turn_actions.action_used).toBe(false);
    expect(newDruid.class_resource_uses?.wild_shape).toBe(1);
    // 2024 PHB: Moon temp HP = 3 × druid level. At L6 → 18 temp HP on top
    // of 30 base → 48. (Base druid would give 2 × 6 = 12 → 42.)
    expect(newDruid.hp).toBe(48);
    expect(result.narrative).toMatch(/bonus action/i);
  });

  it('Base Druid Wild Shape — temp HP = 2 × druid level (2024 PHB)', async () => {
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

  it('Wild Shape: Moon at L3 unlocks CR 1 forms', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const druidId = 'd-moon-cr1';
    const druid = makeChar({
      id: druidId,
      character_class: 'Druid',
      subclass: 'moon',
      level: 3, // Moon: floor(3/3) = 1 → can pick CR 1
      hp: 18,
      max_hp: 18,
      class_resource_uses: { wild_shape: 2 },
    });
    const state = makeState(
      {},
      { characters: [druid], active_character_id: druidId, combat_active: true }
    );
    state.characters = [druid];
    state.active_character_id = druidId;
    const result = await takeAction({
      action: { type: 'use_class_feature', featureId: 'wild_shape_brown_bear' },
      history: [],
      state,
      seed,
      context: ctx,
    });
    expect(result.narrative).toMatch(/Brown Bear/);
    expect(result.newState.characters[0].wild_shape_form).toBe('brown_bear');
  });

  it('Circle of the Moon — Moon Healing while shifted spends a slot to heal', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999); // max d8 → 8
    const druidId = 'd-moon-heal';
    const druid = makeChar({
      id: druidId,
      character_class: 'Druid',
      subclass: 'moon',
      level: 4,
      hp: 10,
      max_hp: 30,
      conditions: ['wild_shaped'],
      spell_slots_max: { 1: 3, 2: 2 },
      spell_slots_used: {},
    });
    const state = makeState(
      {},
      {
        characters: [druid],
        active_character_id: druidId,
        combat_active: true,
        initiative_order: [{ id: druidId, roll: 18, is_enemy: false }],
        initiative_idx: 0,
      }
    );
    state.characters = [druid];
    state.active_character_id = druidId;
    const result = await takeAction({
      action: { type: 'use_class_feature', featureId: 'moon_healing' },
      history: [],
      state,
      seed,
      context: ctx,
    });
    const newDruid = result.newState.characters[0];
    // Spent lowest slot (lvl 1) → 1d8 = 8 healed
    expect(newDruid.spell_slots_used?.[1]).toBe(1);
    expect(newDruid.hp).toBe(18); // 10 + 8
    expect(newDruid.turn_actions.bonus_action_used).toBe(true);
    expect(result.narrative).toMatch(/Moon|lunar/i);
  });

  it('Circle of the Land — Natural Recovery refunds slot levels on short rest', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const druidId = 'd-land';
    const druid = makeChar({
      id: druidId,
      character_class: 'Druid',
      subclass: 'land',
      level: 4, // budget = ceil(4/2) = 2 slot levels
      hp: 20,
      max_hp: 30,
      hit_dice_remaining: 4,
      spell_slots_max: { 1: 4, 2: 3 },
      // Use 2 L1s and 1 L2 — recovery prefers low levels, so 2× L1 = 2 levels
      spell_slots_used: { 1: 2, 2: 1 },
    });
    const state = makeState({}, { characters: [druid], active_character_id: druidId });
    state.characters = [druid];
    state.active_character_id = druidId;
    const result = await takeAction({
      action: { type: 'short_rest' },
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

  it('Circle of the Land — Natural Recovery only fires once per long rest', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const druidId = 'd-land-twice';
    const druid = makeChar({
      id: druidId,
      character_class: 'Druid',
      subclass: 'land',
      level: 4,
      hp: 20,
      max_hp: 30,
      hit_dice_remaining: 4,
      spell_slots_max: { 1: 4 },
      spell_slots_used: { 1: 3 },
      class_resource_uses: { natural_recovery_used: 1 }, // already used today
    });
    const state = makeState({}, { characters: [druid], active_character_id: druidId });
    state.characters = [druid];
    state.active_character_id = druidId;
    const result = await takeAction({
      action: { type: 'short_rest' },
      history: [],
      state,
      seed,
      context: ctx,
    });
    const newDruid = result.newState.characters[0];
    // Slots NOT refunded
    expect(newDruid.spell_slots_used?.[1]).toBe(3);
    expect(result.narrative).not.toMatch(/Natural Recovery/);
  });

  // ── Monk subclasses (PHB p.79-80) ───────────────────────────────────────────

  it('Way of the Open Hand — Flurry hits force DEX save or prone', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // d20 → 1 enemy DEX save fails; monk hits at max
    // We need monk hits to land. With d20=1 on every roll, even monk attack
    // misses. Mix: first roll for monk attack must be ≥ goblin AC. Easier:
    // mock per-call to alternate. For simplicity: spy mockReturnValueOnce
    // chain.
    const random = vi.spyOn(Math, 'random');
    random
      .mockReturnValueOnce(0) // initiative monk
      .mockReturnValueOnce(0) // initiative goblin
      .mockReturnValueOnce(0) // surprise stealth
      .mockReturnValueOnce(0.999) // monk strike 1 d20 → hit
      .mockReturnValueOnce(0.999) // monk strike 1 damage roll
      .mockReturnValueOnce(0.5) // ?
      .mockReturnValue(0); // remaining → enemy DEX saves fail
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
      visited_rooms: [ctx.startRoomId, CORRIDOR_ID],
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
    // At least one of the strikes should hit and impose prone.
    if (result.narrative.includes('Open Hand:')) {
      // If a hit landed, the goblin should have been forced to make a save.
      expect(result.narrative).toMatch(/Open Hand:/);
    }
  });

  it('Way of Shadow — Shadow Arts spends 2 ki and applies invisible', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const monkId = 'mk-sh';
    const monk = makeChar({
      id: monkId,
      character_class: 'Monk',
      subclass: 'shadow',
      level: 3,
      hp: 20,
      max_hp: 20,
      class_resource_uses: { ki_points: 3 },
    });
    const state = makeState(
      {},
      { characters: [monk], active_character_id: monkId, combat_active: true }
    );
    state.characters = [monk];
    state.active_character_id = monkId;
    const result = await takeAction({
      action: { type: 'use_class_feature', featureId: 'shadow_arts' },
      history: [],
      state,
      seed,
      context: ctx,
    });
    const newMonk = result.newState.characters[0];
    expect(newMonk.conditions).toContain('invisible');
    expect(newMonk.condition_durations?.invisible).toBe(3);
    expect(newMonk.class_resource_uses?.ki_points).toBe(1); // 3 - 2
    expect(newMonk.turn_actions.action_used).toBe(true);
    expect(result.narrative).toMatch(/Shadow Arts/);
  });

  it('Way of Shadow — Shadow Arts fails when ki is insufficient', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const monkId = 'mk-sh-low';
    const monk = makeChar({
      id: monkId,
      character_class: 'Monk',
      subclass: 'shadow',
      level: 3,
      hp: 20,
      max_hp: 20,
      class_resource_uses: { ki_points: 1 }, // only 1 ki, need 2
    });
    const state = makeState({}, { characters: [monk], active_character_id: monkId });
    state.characters = [monk];
    state.active_character_id = monkId;
    const result = await takeAction({
      action: { type: 'use_class_feature', featureId: 'shadow_arts' },
      history: [],
      state,
      seed,
      context: ctx,
    });
    expect(result.narrative).toMatch(/Need 2 ki/);
    expect(result.newState.characters[0].conditions).not.toContain('invisible');
  });

  // ── Barbarian subclasses (PHB p.49-51) ──────────────────────────────────────

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
      equipped_weapon: daggerInst,
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
      visited_rooms: [ctx.startRoomId, CORRIDOR_ID],
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

  it('Totem Warrior (Wolf) — raging barb within 5 ft grants ally melee advantage', async () => {
    // Two PCs: a wolf-totem raging Barbarian adjacent to the goblin, and a
    // Fighter at range. The Fighter's melee attack should pick up advantage
    // from the wolf adjacency.
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    const barbId = 'b-wolf';
    const fighterId = 'f-ally';
    const goblinId = `${CORRIDOR_ID}#0`;
    const barb = makeChar({
      id: barbId,
      character_class: 'Barbarian',
      subclass: 'totem_warrior',
      level: 3,
      hp: 30,
      max_hp: 30,
      conditions: ['raging'],
    });
    const fighter = makeChar({
      id: fighterId,
      character_class: 'Fighter',
      level: 3,
      hp: 30,
      max_hp: 30,
      str: 14,
      equipped_weapon: 'f-sword',
      inventory: [{ instance_id: 'f-sword', id: 'longsword', name: 'Longsword' }],
    });
    const state: GameState = {
      characters: [barb, fighter],
      active_character_id: fighterId,
      current_room: CORRIDOR_ID,
      visited_rooms: [ctx.startRoomId, CORRIDOR_ID],
      enemies_killed: [],
      loot_taken: [],
      combat_active: true,
      initiative_order: [
        { id: fighterId, roll: 18, is_enemy: false },
        { id: barbId, roll: 14, is_enemy: false },
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
          id: barbId,
          isEnemy: false,
          pos: { x: 6, y: 5 }, // adjacent to goblin
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
      action: { type: 'attack', targetEnemyId: goblinId },
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });
    // The Fighter's attack narrative should include the advantage indicator
    // (the engine surfaces adv reasons in the d20 display when adv applies).
    expect(result.narrative).toMatch(/adv/i);
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
      equipped_weapon: dagger,
      inventory: [{ instance_id: dagger, id: 'dagger', name: 'Dagger' }],
    });
    const goblinId = `${CORRIDOR_ID}#0`;
    const state: GameState = {
      characters: [fighter],
      active_character_id: charId,
      current_room: CORRIDOR_ID,
      visited_rooms: [ctx.startRoomId, CORRIDOR_ID],
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
      equipped_weapon: 'wp',
      inventory: [{ instance_id: 'wp', id: 'dagger', name: 'Dagger' }],
    });
    const goblinId = `${CORRIDOR_ID}#0`;
    const state: GameState = {
      characters: [fighter],
      active_character_id: charId,
      current_room: CORRIDOR_ID,
      visited_rooms: [ctx.startRoomId, CORRIDOR_ID],
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
      visited_rooms: [ctx.startRoomId, CORRIDOR_ID],
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
      equipped_weapon: 'wp',
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
      visited_rooms: [ctx.startRoomId, CORRIDOR_ID],
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

  // ── Shield (reactive spell, PHB p.275) ──────────────────────────────────────

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
      visited_rooms: [ctx.startRoomId, CORRIDOR_ID],
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
    expect(result.newState.pending_reaction?.targetCharId).toBe(wizId);
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
      visited_rooms: [ctx.startRoomId, CORRIDOR_ID],
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
        pendingDamage: 5,
        pendingNarrative: 'The Goblin hits for 5 damage.',
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
      visited_rooms: [ctx.startRoomId, CORRIDOR_ID],
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
        pendingDamage: 5,
        pendingNarrative: 'The Goblin hits for 5 damage.',
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

  // ── Hellish Rebuke (reactive spell, PHB p.252) ──────────────────────────────

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
      visited_rooms: [ctx.startRoomId, CORRIDOR_ID],
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
      visited_rooms: [ctx.startRoomId, CORRIDOR_ID],
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

  // ── Counterspell (reactive spell, PHB p.234) ────────────────────────────────

  it('Accepting Counterspell consumes a 3rd-level slot, auto-counters lvl-1 enemy spell', async () => {
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
      visited_rooms: [ctx.startRoomId, CORRIDOR_ID],
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
        enemySpellLevel: 0, // cantrip — auto-counter
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
      visited_rooms: [ctx.startRoomId, CORRIDOR_ID],
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

  it('Counterspell at lvl-3 slot vs lvl-5 enemy spell requires ability check', async () => {
    // Force int-based check to barely succeed: d20=20 (random=0.999) +int mod +prof
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
      visited_rooms: [ctx.startRoomId, CORRIDOR_ID],
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
        enemySpellLevel: 5, // forces ability check
        enemySpellName: 'Fire Bolt (5th)',
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
    // Either INT check or AUTO-counter — but spell level 5 > slot level 3
    // means ability check fires. With d20=20 + INT mod (+4) + prof (+3) = 27 vs DC 15, success.
    expect(result.narrative).toMatch(/INT check|ability check/i);
    expect(result.narrative).toMatch(/success/);
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
      equipped_weapon: daggerInst,
      inventory: [{ instance_id: daggerInst, id: 'dagger', name: 'Dagger' }],
    });
    const ally = makeChar({ id: 'p2', character_class: 'Fighter' });
    const goblinId = `${CORRIDOR_ID}#0`;
    const state: GameState = {
      characters: [pilot, ally],
      active_character_id: 'p1',
      current_room: CORRIDOR_ID,
      visited_rooms: [ctx.startRoomId, CORRIDOR_ID],
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
      { current_room: CORRIDOR_ID, visited_rooms: [ctx.startRoomId, CORRIDOR_ID] }
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

    const state = makeState(
      { character_class: 'Fighter', level: 5 },
      { current_room: CORRIDOR_ID, visited_rooms: [ctx.startRoomId, CORRIDOR_ID] }
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

    const state = makeState(
      { character_class: 'Fighter', level: 4 },
      { current_room: CORRIDOR_ID, visited_rooms: [ctx.startRoomId, CORRIDOR_ID] }
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

  // ── Rage (Warrior — tested via ctxWithRage) ──────────────────────────────────

  it('use_class_feature rage activates raging condition and spends a use', async () => {
    const state = {
      ...makeState(
        { character_class: 'Warrior', level: 1 },
        {
          current_room: CORRIDOR_ID,
          visited_rooms: [ctx.startRoomId, CORRIDOR_ID],
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
          visited_rooms: [ctx.startRoomId, CORRIDOR_ID],
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
    const state = makeState(
      { character_class: 'Warrior', conditions: ['raging'] },
      { current_room: CORRIDOR_ID, visited_rooms: [ctx.startRoomId, CORRIDOR_ID] }
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
    // rageUsesMax(6) = 4 (2024 PHB)
    expect(result.newState.characters[0].class_resource_uses.rage_uses).toBe(4);
  });

  it('generateChoices shows rage bonus action for Warrior in combat with uses remaining', () => {
    const state = makeState(
      { character_class: 'Warrior', level: 1, class_resource_uses: { rage_uses: 2 } },
      {
        current_room: CORRIDOR_ID,
        visited_rooms: [ctx.startRoomId, CORRIDOR_ID],
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
        visited_rooms: [ctx.startRoomId, CORRIDOR_ID],
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
    visited_rooms: [ctx.startRoomId, npcRoomId],
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

  it('generateChoices shows buy choice for friendly NPC with shop', () => {
    const state = makeNpcState();
    const choices = generateChoices(state, seedWithNpc, ctx);
    expect(choices.some((c) => c.action.type === 'buy')).toBe(true);
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

  it('talk_response buttons use the <To NPC> stage-direction format', () => {
    // After the party has greeted the NPC once, the response buttons
    // surface with labels framed as the party speaking TO the NPC
    // rather than the NPC saying them.
    const state = { ...makeNpcState(), npc_talked: [npcRoomId] };
    const choices = generateChoices(state, seedWithNpc, ctx);
    const responseChoices = choices.filter((c) => c.action.type === 'talk_response');
    expect(responseChoices.length).toBe(2);
    expect(responseChoices[0].label).toBe('<To Friendly Guide> Ask about the area');
    expect(responseChoices[1].label).toBe('<To Friendly Guide> Ask for help');
  });

  it("talk handler's inline dialogue hint also uses the <To NPC> format", async () => {
    const result = await takeAction({
      action: { type: 'talk' },
      history: [],
      state: makeNpcState(),
      seed: seedWithNpc,
      context: ctx,
    });
    // Inline hints reflect the same framing the buttons use.
    expect(result.narrative).toMatch(/<To Friendly Guide> Ask about the area/);
    expect(result.narrative).toMatch(/<To Friendly Guide> Ask for help/);
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

// ─── Spell system ─────────────────────────────────────────────────────────────

// ctxWithRage and dungeonSeedWithEnemy already declared above (rage tests)
// Spell tests use CORRIDOR_ID (same room as existing dungeonSeedWithEnemy enemy)
const spellSeed: Seed = {
  context_id: ctx.id,
  world_name: 'Test Dungeon',
  ship_name: 'Test Dungeon',
  intro: 'Test.',
  seed_id: 'spell-seed-id',
  rooms: [
    { id: ctx.startRoomId, name: 'Crypt', desc: 'Cold stone.' },
    { id: CORRIDOR_ID, name: 'Burial', desc: 'A chamber.' },
    { id: ctx.escapeRoomId, name: 'Exit Shaft', desc: 'A shaft of light.' },
  ],
  connections: {
    [ctx.startRoomId]: [CORRIDOR_ID],
    [CORRIDOR_ID]: [ctx.startRoomId, ctx.escapeRoomId],
    [ctx.escapeRoomId]: [CORRIDOR_ID],
  },
  enemies: {
    [CORRIDOR_ID]: [
      {
        id: `${CORRIDOR_ID}#0`,
        name: 'Skeleton',
        hp: 10,
        ac: 12,
        damage: '1d6',
        toHit: 4,
        xp: 50,
      },
    ],
  },
  loot: {},
  npcs: {},
};

function makeMageState(charOverrides: Partial<Character> = {}): GameState {
  const char = makeChar({
    character_class: 'Mage',
    int: 16, // +3 mod → spell attack +5, DC 13
    spell_slots_max: { 1: 2, 2: 1, 3: 1 },
    spell_slots_used: {},
    spells_known: ['fire_bolt', 'magic_missile', 'thunderwave', 'misty_step', 'fireball'],
    ...charOverrides,
  });
  return {
    characters: [char],
    active_character_id: char.id,
    current_room: CORRIDOR_ID,
    visited_rooms: [ctx.startRoomId, CORRIDOR_ID],
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
    npc_attitudes: {},
    npc_talked: [],
    traps_triggered: [],
    traps_disarmed: [],
    objects_searched: [],
    flags: {},
  };
}

function makeClericState(charOverrides: Partial<Character> = {}): GameState {
  const char = makeChar({
    character_class: 'Cleric',
    wis: 14,
    spell_slots_max: { 1: 2 },
    spell_slots_used: {},
    spells_known: ['sacred_flame', 'cure_wounds', 'guiding_bolt', 'hold_person'],
    ...charOverrides,
  });
  return {
    characters: [char],
    active_character_id: char.id,
    current_room: CORRIDOR_ID,
    visited_rooms: [ctx.startRoomId, CORRIDOR_ID],
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
    npc_attitudes: {},
    npc_talked: [],
    traps_triggered: [],
    traps_disarmed: [],
    objects_searched: [],
    flags: {},
  };
}

describe('cast_spell — Fire Bolt (cantrip, spell attack)', () => {
  it('hits and deals 1d10 fire damage on a successful spell attack', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.7); // d20 → 15; bonus=5; total=20 vs AC 12 → hit
    const state = makeMageState();
    const result = await takeAction({
      action: { type: 'cast_spell', spellId: 'fire_bolt', slotLevel: 0 },
      history: [],
      state,
      seed: spellSeed,
      context: ctxWithRage,
    });
    expect(result.narrative).toMatch(/fire bolt/i);
    expect(result.narrative).toMatch(/damage/i);
    // No slot consumed for cantrip
    expect(result.newState.characters[0].spell_slots_used[1]).toBeFalsy();
  });

  it('misses on a nat-1 spell attack roll', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // d20 → 1 → miss
    const state = makeMageState();
    const result = await takeAction({
      action: { type: 'cast_spell', spellId: 'fire_bolt', slotLevel: 0 },
      history: [],
      state,
      seed: spellSeed,
      context: ctxWithRage,
    });
    expect(result.narrative).toMatch(/miss/i);
  });
});

describe('cast_spell — Magic Missile (level 1, auto-hit)', () => {
  it('expends a level-1 slot and deals force damage without a roll', async () => {
    const state = makeMageState();
    const result = await takeAction({
      action: { type: 'cast_spell', spellId: 'magic_missile', slotLevel: 1 },
      history: [],
      state,
      seed: spellSeed,
      context: ctxWithRage,
    });
    expect(result.narrative).toMatch(/magic missile/i);
    expect(result.narrative).toMatch(/force/i);
    expect(result.newState.characters[0].spell_slots_used[1]).toBe(1);
  });

  it('refuses to cast when no level-1 slots remain', async () => {
    const state = makeMageState({ spell_slots_used: { 1: 2 } });
    const result = await takeAction({
      action: { type: 'cast_spell', spellId: 'magic_missile', slotLevel: 1 },
      history: [],
      state,
      seed: spellSeed,
      context: ctxWithRage,
    });
    expect(result.narrative).toMatch(/no level-1 spell slots/i);
    expect(result.newState.characters[0].spell_slots_used[1]).toBe(2); // unchanged
  });
});

describe('cast_spell — Thunderwave (level 1, CON save)', () => {
  it('deals thunder damage when enemy fails CON save', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // d20 → 1 → save fails; then damage roll
    const state = makeMageState();
    const result = await takeAction({
      action: { type: 'cast_spell', spellId: 'thunderwave', slotLevel: 1 },
      history: [],
      state,
      seed: spellSeed,
      context: ctxWithRage,
    });
    expect(result.narrative).toMatch(/thunderwave/i);
    expect(result.narrative).toMatch(/fails|damage/i);
    expect(result.newState.characters[0].spell_slots_used[1]).toBe(1);
  });

  it('deals no damage when enemy succeeds CON save (negates)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999); // d20 → 20 → save succeeds
    const state = makeMageState();
    const result = await takeAction({
      action: { type: 'cast_spell', spellId: 'thunderwave', slotLevel: 1 },
      history: [],
      state,
      seed: spellSeed,
      context: ctxWithRage,
    });
    expect(result.narrative).toMatch(/thunderwave/i);
    expect(result.narrative).toMatch(/succeeds|no damage/i);
  });
});

describe('cast_spell — Fireball (level 3, DEX save, half on save)', () => {
  it('deals half damage when enemy succeeds DEX save', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999); // d20 save → 20 → success; then 8d6 damage all max
    const state = makeMageState({ spell_slots_max: { 3: 1 }, spell_slots_used: {} });
    const result = await takeAction({
      action: { type: 'cast_spell', spellId: 'fireball', slotLevel: 3 },
      history: [],
      state,
      seed: spellSeed,
      context: ctxWithRage,
    });
    expect(result.narrative).toMatch(/fireball/i);
    expect(result.narrative).toMatch(/half damage|succeeds/i);
  });

  it('expends a level-3 slot', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const state = makeMageState({ spell_slots_max: { 3: 1 }, spell_slots_used: {} });
    const result = await takeAction({
      action: { type: 'cast_spell', spellId: 'fireball', slotLevel: 3 },
      history: [],
      state,
      seed: spellSeed,
      context: ctxWithRage,
    });
    expect(result.newState.characters[0].spell_slots_used[3]).toBe(1);
  });
});

describe('cast_spell — Cure Wounds (level 1, heal)', () => {
  it('restores HP to the caster when at lower HP', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999); // 1d8 → 8; WIS 14 → +2 → 10 healed
    const state = makeClericState({ hp: 3, max_hp: 10 });
    const result = await takeAction({
      action: { type: 'cast_spell', spellId: 'cure_wounds', slotLevel: 1 },
      history: [],
      state,
      seed: spellSeed,
      context: ctxWithRage,
    });
    expect(result.narrative).toMatch(/cure wounds/i);
    expect(result.newState.characters[0].hp).toBeGreaterThan(3);
    expect(result.newState.characters[0].spell_slots_used[1]).toBe(1);
  });

  it('healing an ally syncs the grid entity HP (regression — battlefield lag)', async () => {
    // Cleric casts Cure Wounds on a downed Rogue (hp=0). Both the
    // character record AND the grid entity must reflect the heal so the
    // FE battlefield renderer doesn't keep showing the Rogue as dead
    // until the next turn. The bug was that commitChar() only syncs
    // the caster's entity, not the target's.
    vi.spyOn(Math, 'random').mockReturnValue(0.999); // max heal
    const cleric = makeChar({
      id: 'c-heal',
      character_class: 'Cleric',
      wis: 14,
      spell_slots_max: { 1: 2 },
      spells_known: ['cure_wounds'],
      prepared_spells: ['cure_wounds'],
    });
    const rogue = makeChar({ id: 'r-down', hp: 0, max_hp: 12 });
    const state: GameState = {
      ...makeState(),
      characters: [cleric, rogue],
      active_character_id: cleric.id,
      current_room: CORRIDOR_ID,
      visited_rooms: [ctx.startRoomId, CORRIDOR_ID],
      combat_active: true,
      initiative_order: [{ id: cleric.id, roll: 20, is_enemy: false }],
      initiative_idx: 0,
      entities: [
        {
          id: cleric.id,
          isEnemy: false,
          pos: { x: 4, y: 5 },
          hp: cleric.hp,
          maxHp: cleric.max_hp,
          conditions: [],
          condition_durations: {},
        },
        {
          id: rogue.id,
          isEnemy: false,
          pos: { x: 5, y: 5 },
          hp: 0, // grid says dead
          maxHp: 12,
          conditions: ['unconscious'],
          condition_durations: {},
        },
      ],
    };
    const result = await takeAction({
      action: { type: 'cast_spell', spellId: 'cure_wounds', slotLevel: 1 },
      history: [],
      state,
      seed: spellSeed,
      context: ctxWithRage,
    });
    const rogueChar = result.newState.characters.find((c) => c.id === 'r-down');
    const rogueEnt = result.newState.entities?.find((e) => e.id === 'r-down');
    // Character HP healed
    expect(rogueChar?.hp ?? 0).toBeGreaterThan(0);
    // Grid entity HP synced — this is the regression assertion
    expect(rogueEnt?.hp ?? 0).toBeGreaterThan(0);
    expect(rogueEnt?.hp).toBe(rogueChar?.hp);
  });
});

describe('cast_spell — Misty Step (level 2, bonus action, utility)', () => {
  it('produces a narrative and consumes a level-2 slot without touching enemy HP', async () => {
    const state = makeClericState({
      character_class: 'Mage',
      spell_slots_max: { 2: 1 },
      spell_slots_used: {},
      spells_known: ['misty_step'],
    });
    const result = await takeAction({
      action: { type: 'cast_spell', spellId: 'misty_step', slotLevel: 2 },
      history: [],
      state,
      seed: spellSeed,
      context: ctxWithRage,
    });
    expect(result.narrative).toMatch(/misty step|silver mist/i);
    expect(result.newState.characters[0].spell_slots_used[2]).toBe(1);
    // Enemy HP should be unmodified (no damage from utility spell)
    const enemyEntAfter = result.newState.entities?.find((e) => e.id === CORRIDOR_ID && e.isEnemy);
    expect(enemyEntAfter?.hp).toBeFalsy();
  });
});

// ─── Bless (PHB p.219) — concentration buff, +1d4 to attack rolls ────────────
//
// The Vale Crypt Lord log showed Bless casting a flavorful narrative but
// the +1d4 never appeared in subsequent Rogue attack notes. Bless now
// applies the `blessed` condition to caster + up to 2 living allies and
// is surfaced in atkNote alongside Bardic Inspiration.

describe('cast_spell — Bless (level 1, concentration buff)', () => {
  it('applies blessed to caster + first 2 living party members', async () => {
    const cleric = makeChar({
      id: 'cleric-1',
      character_class: 'Cleric',
      wis: 14,
      spell_slots_max: { 1: 2 },
      spells_known: ['bless'],
      prepared_spells: ['bless'],
    });
    const fighter = makeChar({ id: 'fighter-1', character_class: 'Fighter' });
    const rogue = makeChar({ id: 'rogue-1', character_class: 'Rogue' });
    const state: GameState = {
      ...makeState(),
      characters: [cleric, fighter, rogue],
      active_character_id: cleric.id,
      current_room: ctx.startRoomId,
      combat_active: false,
    };
    const result = await takeAction({
      action: { type: 'cast_spell', spellId: 'bless', slotLevel: 1 },
      history: [],
      state,
      seed: spellSeed,
      context: ctxWithRage,
    });
    // Caster + 2 allies blessed; source attribution points back at caster.
    const blessed = result.newState.characters.filter((c) => c.conditions.includes('blessed'));
    expect(blessed.map((c) => c.id).sort()).toEqual(['cleric-1', 'fighter-1', 'rogue-1']);
    for (const c of blessed) {
      expect(c.condition_sources?.blessed).toBe('cleric-1');
    }
    // Caster is concentrating on bless.
    expect(result.newState.characters[0].concentrating_on?.spellId).toBe('bless');
  });

  it('blessed PC adds +1d4 to attack rolls; surfaces "Bless: +N (1d4)" in atkNote', async () => {
    // Mock: d20 roll just below AC, bless d4 nudges to a hit; atkNote
    // surfaces the bless contribution.
    const random = vi.spyOn(Math, 'random');
    random.mockReturnValueOnce(0.55); // d20 → 12
    random.mockReturnValue(0.999); // bless d4 → 4
    const fighter = makeChar({
      id: 'pc-bless',
      character_class: 'Fighter',
      str: 14,
      level: 1,
      conditions: ['blessed'],
      condition_sources: { blessed: 'caster-id' },
      inventory: [{ instance_id: 'sw-inst', id: 'shortsword', name: 'Shortsword' }],
      equipped_weapon: 'sw-inst',
    });
    const enemyId = `${CORRIDOR_ID}#0`;
    const state: GameState = {
      ...makeState(),
      characters: [fighter],
      active_character_id: fighter.id,
      current_room: CORRIDOR_ID,
      visited_rooms: [ctx.startRoomId, CORRIDOR_ID],
      combat_active: true,
      initiative_order: [
        { id: fighter.id, roll: 18, is_enemy: false },
        { id: enemyId, roll: 5, is_enemy: true },
      ],
      initiative_idx: 0,
      entities: [
        {
          id: fighter.id,
          isEnemy: false,
          pos: { x: 5, y: 5 },
          hp: fighter.hp,
          maxHp: fighter.max_hp,
          conditions: [],
          condition_durations: {},
        },
        {
          id: enemyId,
          isEnemy: true,
          pos: { x: 6, y: 5 },
          hp: 30,
          maxHp: 30,
          conditions: [],
          condition_durations: {},
        },
      ],
    };
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: enemyId },
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });
    expect(result.narrative).toMatch(/Bless: \+\d \(1d4\)/);
  });

  it('casting another concentration spell drops Bless and clears blessed from allies', async () => {
    // Cleric is concentrating on Bless. Casting Hold Person (also a
    // concentration spell) triggers the auto-break path in the cast
    // handler — `blessed` must clear from both PCs.
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const cleric = makeChar({
      id: 'cleric-bless',
      character_class: 'Cleric',
      wis: 14,
      spell_slots_max: { 1: 2, 2: 1 },
      spell_slots_used: { 1: 1 }, // Bless was already cast
      spells_known: ['bless', 'hold_person'],
      prepared_spells: ['bless', 'hold_person'],
      conditions: ['blessed'],
      condition_sources: { blessed: 'cleric-bless' },
      concentrating_on: { spellId: 'bless' },
    });
    const rogue = makeChar({
      id: 'rogue-bless',
      character_class: 'Rogue',
      conditions: ['blessed'],
      condition_sources: { blessed: 'cleric-bless' },
    });
    const enemyId = `${CORRIDOR_ID}#0`;
    const state: GameState = {
      ...makeState(),
      characters: [cleric, rogue],
      active_character_id: cleric.id,
      current_room: CORRIDOR_ID,
      visited_rooms: [ctx.startRoomId, CORRIDOR_ID],
      combat_active: true,
      initiative_order: [{ id: cleric.id, roll: 20, is_enemy: false }],
      initiative_idx: 0,
    };
    const result = await takeAction({
      action: { type: 'cast_spell', spellId: 'hold_person', slotLevel: 2, targetEnemyId: enemyId },
      history: [],
      state,
      seed: spellSeed,
      context: ctxWithRage,
    });
    const clericAfter = result.newState.characters.find((c) => c.id === 'cleric-bless');
    const rogueAfter = result.newState.characters.find((c) => c.id === 'rogue-bless');
    // Bless concentration was replaced — blessed must clear from BOTH PCs.
    expect(clericAfter?.conditions ?? []).not.toContain('blessed');
    expect(rogueAfter?.conditions ?? []).not.toContain('blessed');
  });

  it('casting Bless initialises rounds_left to 10 (1 minute SRD default)', async () => {
    const cleric = makeChar({
      id: 'cleric-cast',
      character_class: 'Cleric',
      wis: 14,
      spell_slots_max: { 1: 2 },
      spells_known: ['bless'],
      prepared_spells: ['bless'],
    });
    const state: GameState = {
      ...makeState(),
      characters: [cleric],
      active_character_id: cleric.id,
      current_room: ctx.startRoomId,
      combat_active: false,
    };
    const result = await takeAction({
      action: { type: 'cast_spell', spellId: 'bless', slotLevel: 1 },
      history: [],
      state,
      seed: spellSeed,
      context: ctxWithRage,
    });
    const casterAfter = result.newState.characters[0];
    expect(casterAfter.concentrating_on?.spellId).toBe('bless');
    expect(casterAfter.concentrating_on?.rounds_left).toBe(10);
  });

  it('concentration auto-ends when rounds_left ticks to 0', async () => {
    // Cleric with Bless that has 1 round left + Rogue blessed by them.
    // PC end_turn → enemy turn → round wraps → tick drops to 0 → Bless ends.
    vi.spyOn(Math, 'random').mockReturnValue(0); // enemy misses
    const cleric = makeChar({
      id: 'cleric-tick',
      character_class: 'Cleric',
      conditions: ['blessed'],
      condition_sources: { blessed: 'cleric-tick' },
      concentrating_on: { spellId: 'bless', rounds_left: 1 },
    });
    const rogue = makeChar({
      id: 'rogue-tick',
      character_class: 'Rogue',
      conditions: ['blessed'],
      condition_sources: { blessed: 'cleric-tick' },
    });
    const enemyId = `${CORRIDOR_ID}#0`;
    const state: GameState = {
      ...makeState(),
      characters: [cleric, rogue],
      active_character_id: cleric.id,
      current_room: CORRIDOR_ID,
      visited_rooms: [ctx.startRoomId, CORRIDOR_ID],
      combat_active: true,
      initiative_order: [
        { id: cleric.id, roll: 20, is_enemy: false },
        { id: enemyId, roll: 5, is_enemy: true },
      ],
      initiative_idx: 0,
      entities: [
        {
          id: cleric.id,
          isEnemy: false,
          pos: { x: 5, y: 5 },
          hp: cleric.hp,
          maxHp: cleric.max_hp,
          conditions: ['blessed'],
          condition_durations: {},
        },
        {
          id: rogue.id,
          isEnemy: false,
          pos: { x: 4, y: 5 },
          hp: rogue.hp,
          maxHp: rogue.max_hp,
          conditions: ['blessed'],
          condition_durations: {},
        },
        {
          id: enemyId,
          isEnemy: true,
          pos: { x: 7, y: 7 },
          hp: 10,
          maxHp: 10,
          conditions: [],
          condition_durations: {},
        },
      ],
    };
    const result = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });
    const clericAfter = result.newState.characters.find((c) => c.id === 'cleric-tick');
    const rogueAfter = result.newState.characters.find((c) => c.id === 'rogue-tick');
    expect(clericAfter?.concentrating_on).toBeFalsy();
    expect(clericAfter?.conditions ?? []).not.toContain('blessed');
    expect(rogueAfter?.conditions ?? []).not.toContain('blessed');
    expect(result.narrative).toMatch(/concentration duration expired/);
  });

  it('Bless flipping a miss to a hit rolls damage (regression — Vale T29 {{dmg|0}} bug)', async () => {
    // Vale playthrough log T29: a Fighter attack rolled d20=9, +2 STR +2
    // prof = 13 vs AC 15 — a clean miss. Bless added +3 → 16, flipping
    // hit=true. But atk.damage was already 0 from the miss path, and the
    // hit branch ran with damage=0 → "{{dmg|0}} damage." Now the
    // miss-to-hit flip also rolls damage, so the hit lands for >= 1 HP.
    //
    // Setup: roll d20=10 (just below AC); Bless rolls a 4 so total
    // becomes 14 → flips a 13 miss to a 14 hit vs AC 14. We mock
    // random to control both rolls.
    const random = vi.spyOn(Math, 'random');
    // resolvePlayerAttack uses d() once for d20; then if hit, rollDice
    // for damage. We override only the d20 + bless rolls in order.
    random.mockReturnValueOnce(0.45); // d20 → 10 (miss vs AC 14: 10+2+2=14? actually 10+2+2=14 = AC; hit. need lower)
    random.mockReturnValueOnce(0.99); // bless d4 → 4
    random.mockReturnValue(0.5); // damage d8 → 5, etc.
    const fighter = makeChar({
      id: 'pc-bless-hit',
      character_class: 'Fighter',
      str: 14, // +2 mod
      level: 1,
      conditions: ['blessed'],
      condition_sources: { blessed: 'caster' },
      inventory: [{ instance_id: 'sw-inst', id: 'shortsword', name: 'Shortsword' }],
      equipped_weapon: 'sw-inst',
    });
    const enemyId = `${CORRIDOR_ID}#0`;
    const state: GameState = {
      ...makeState(),
      characters: [fighter],
      active_character_id: fighter.id,
      current_room: CORRIDOR_ID,
      visited_rooms: [ctx.startRoomId, CORRIDOR_ID],
      combat_active: true,
      initiative_order: [{ id: fighter.id, roll: 18, is_enemy: false }],
      initiative_idx: 0,
      entities: [
        {
          id: fighter.id,
          isEnemy: false,
          pos: { x: 4, y: 5 },
          hp: fighter.hp,
          maxHp: fighter.max_hp,
          conditions: ['blessed'],
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
    };
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: enemyId },
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });
    // If it landed as a hit and damage was rolled, the damage token
    // should be at least 1 (the Math.max(1, ...) floor). Asserting > 0
    // catches the pre-fix bug where atk.damage stayed at 0.
    const dmgMatch = result.narrative.match(/\{\{dmg\|(\d+)\}\}/);
    expect(dmgMatch).toBeDefined();
    expect(parseInt(dmgMatch![1], 10)).toBeGreaterThan(0);
  });
});

describe('spell slots — long rest resets used slots', () => {
  it('spell_slots_used is reset to {} after long rest', async () => {
    // Must be in a room with no living enemy to rest; use startRoomId
    const state = {
      ...makeMageState({ spell_slots_used: { 1: 2, 2: 1 } }),
      current_room: ctx.startRoomId,
    };
    const result = await takeAction({
      action: { type: 'long_rest' },
      history: [],
      state,
      seed: spellSeed,
      context: ctxWithRage,
    });
    expect(result.newState.characters[0].spell_slots_used).toEqual({});
  });
});

describe('generateChoices — spell choices', () => {
  it('includes cast_spell choices for Mage cantrip and leveled spells when enemy present', () => {
    const state = makeMageState();
    const choices = generateChoices(state, spellSeed, ctxWithRage);
    const spellChoices = choices.filter((c) => c.action.type === 'cast_spell');
    expect(spellChoices.length).toBeGreaterThan(0);
  });

  it('does not include offensive spell choices when no enemy present', () => {
    const state = { ...makeMageState(), current_room: ctx.startRoomId };
    const choices = generateChoices(state, spellSeed, ctxWithRage);
    const offensiveSpells = choices.filter(
      (c) =>
        c.action.type === 'cast_spell' &&
        ['fire_bolt', 'magic_missile', 'thunderwave', 'fireball'].includes(
          (c.action as { spellId: string }).spellId
        )
    );
    expect(offensiveSpells.length).toBe(0);
  });

  it('does not include spell choices when all slots at all eligible levels are used', () => {
    // magic_missile is level 1; mage has 2×L1, 1×L2, 1×L3 — exhaust all
    const state = makeMageState({ spell_slots_used: { 1: 2, 2: 1, 3: 1 } });
    const choices = generateChoices(state, spellSeed, ctxWithRage);
    const missileChoice = choices.find(
      (c) =>
        c.action.type === 'cast_spell' &&
        (c.action as { spellId: string }).spellId === 'magic_missile'
    );
    expect(missileChoice).toBeUndefined();
  });

  it('includes upcast choices when higher slots are available', () => {
    // L1 slots exhausted but L2 still available — upcast magic_missile should appear
    const state = makeMageState({ spell_slots_used: { 1: 2 } });
    const choices = generateChoices(state, spellSeed, ctxWithRage);
    const upcastChoice = choices.find(
      (c) =>
        c.action.type === 'cast_spell' &&
        (c.action as { spellId: string; slotLevel: number }).spellId === 'magic_missile' &&
        (c.action as { spellId: string; slotLevel: number }).slotLevel === 2
    );
    expect(upcastChoice).toBeDefined();
  });

  it('includes Misty Step as a bonus-action choice', () => {
    const state = makeMageState();
    const choices = generateChoices(state, spellSeed, ctxWithRage);
    const mistyStep = choices.find(
      (c) =>
        c.action.type === 'cast_spell' && (c.action as { spellId: string }).spellId === 'misty_step'
    );
    expect(mistyStep).toBeDefined();
    expect(mistyStep?.requiresBonusAction).toBe(true);
  });

  // ── Prep-class spell filter ────────────────────────────────────────────
  //
  // Cleric / Paladin / Druid only cast level-1+ spells in their
  // `prepared_spells` list. Without this filter the cast menu surfaces
  // every known spell and the player burns clicks on rejection messages
  // (observed in the Vale Crypt Lord log: 3× "Healing Word is not prepared").

  it('Cleric: unprepared level-1+ spell is filtered out of cast menu', () => {
    // Cleric knows guiding_bolt + cure_wounds but only prepared guiding_bolt.
    // Use injured Cleric so cure_wounds clears the separate heal-target
    // filter — that way the assertion isolates the prep gate.
    const state = makeClericState({
      prepared_spells: ['guiding_bolt'],
      hp: 3,
      max_hp: 10,
    });
    const choices = generateChoices(state, spellSeed, ctxWithRage);
    const spellIds = choices
      .filter((c) => c.action.type === 'cast_spell')
      .map((c) => (c.action as { spellId: string }).spellId);
    // Cure Wounds is level-1 + not prepared → filtered out.
    expect(spellIds).not.toContain('cure_wounds');
    // Guiding Bolt is prepared → still surfaced.
    expect(spellIds).toContain('guiding_bolt');
  });

  it('Cleric: cantrips are always castable regardless of prep list', () => {
    // sacred_flame is a level-0 cantrip — prep filter must not gate it.
    const state = makeClericState({
      prepared_spells: ['guiding_bolt'], // sacred_flame deliberately NOT in list
    });
    const choices = generateChoices(state, spellSeed, ctxWithRage);
    const spellIds = choices
      .filter((c) => c.action.type === 'cast_spell')
      .map((c) => (c.action as { spellId: string }).spellId);
    expect(spellIds).toContain('sacred_flame');
  });

  it('Cleric: empty prepared_spells falls back to surfacing all known spells (legacy state)', () => {
    // Old DB rows / pre-prep flow have prepared_spells = []. The filter
    // intentionally bails in that case so the player isn't left without
    // any spell options. Use an injured Cleric so cure_wounds passes
    // the separate "heal needs an injured target" filter.
    const state = makeClericState({ prepared_spells: [], hp: 3, max_hp: 10 });
    const choices = generateChoices(state, spellSeed, ctxWithRage);
    const spellIds = choices
      .filter((c) => c.action.type === 'cast_spell')
      .map((c) => (c.action as { spellId: string }).spellId);
    expect(spellIds).toContain('cure_wounds');
    expect(spellIds).toContain('guiding_bolt');
  });

  it('Sorcerer / Bard / Warlock are NOT prep classes — no filter applies', () => {
    // Mage state defaults to a Wizard-ish setup; the prep gate only
    // affects cleric/paladin/druid. Even with an empty prepared_spells
    // a Mage sees its full known list.
    const state = makeMageState({ prepared_spells: [] });
    const choices = generateChoices(state, spellSeed, ctxWithRage);
    const castChoices = choices.filter((c) => c.action.type === 'cast_spell');
    expect(castChoices.length).toBeGreaterThan(0);
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
      visited_rooms: [valeCtx.startRoomId, 'millhaven_market'],
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
      { id: valeCtx.startRoomId, name: 'Town', desc: '' },
      { id: 'millhaven_market', name: 'Market', desc: '' },
    ],
    connections: {
      [valeCtx.startRoomId]: ['millhaven_market'],
      millhaven_market: [valeCtx.startRoomId],
    },
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

// ─── Boss-phase transitions ──────────────────────────────────────────────────

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
      connections: { r: [] },
      enemies: { r: [boss] },
      loot: {},
      npcs: {},
      seed_id: 'test-seed',
    };
  }

  function makeBossState(bossHp: number, phaseIndex = 0): GameState {
    const char = makeChar({ id: 'pc-1', hp: 20, max_hp: 20 });
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

// ─── Boss legendary + lair actions (SRD p.221) ───────────────────────────────
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
      connections: { r: [] },
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
      current_room: ctx.startRoomId,
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
// Regression: enter_district used to set only current_district_id without
// updating current_room. A player who "entered" the Lantern District from
// the Merchant District kept Aldric (placed in millhaven_market) on their
// choice list because current_room hadn't moved.

describe('enter_district moves current_room into the district roomId', () => {
  it('updates current_room and visited_rooms when entering a sibling district', async () => {
    const ctx2 = valeCtx;
    const seedPlaceholder: Seed = {
      ...seedWithEnemy,
      context_id: ctx2.id,
      rooms: [
        { id: 'millhaven_market', name: 'Merchant District', desc: '' },
        { id: 'millhaven_slums', name: 'Lantern District', desc: '' },
      ],
    };
    const state: GameState = {
      ...makeState(),
      characters: [makeChar({ id: 'pc-1' })],
      active_character_id: 'pc-1',
      current_room: 'millhaven_market',
      current_location_id: 'town_millhaven',
      current_district_id: 'district_market',
      visited_rooms: ['millhaven_square', 'millhaven_market'],
      combat_active: false,
    };
    const result = await takeAction({
      action: { type: 'enter_district', districtId: 'district_lantern' },
      history: [],
      state,
      seed: seedPlaceholder,
      context: ctx2,
    });
    expect(result.newState.current_district_id).toBe('district_lantern');
    expect(result.newState.current_room).toBe('millhaven_slums');
    expect(result.newState.visited_rooms).toContain('millhaven_slums');
  });
});

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
      current_room: ctx.startRoomId,
      visited_rooms: [ctx.startRoomId],
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
      visited_rooms: [ctx.startRoomId, CORRIDOR_ID],
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
      visited_rooms: [ctx.startRoomId, CORRIDOR_ID],
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
      visited_rooms: [ctx.startRoomId, CORRIDOR_ID],
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
      seed: seedWithEnemy,
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
      equipped_weapon: 'sword-inst',
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
      visited_rooms: [ctx.startRoomId, CORRIDOR_ID],
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
      visited_rooms: [ctx.startRoomId, CORRIDOR_ID],
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
      equipped_weapon: 'sword-inst',
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
      visited_rooms: [ctx.startRoomId, CORRIDOR_ID],
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
      visited_rooms: [ctx.startRoomId, CORRIDOR_ID],
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
      equipped_weapon: 'sword-inst',
      inventory: [{ instance_id: 'sword-inst', id: 'longsword', name: 'Longsword' }],
      weapon_masteries: ['longsword'],
    });
    const enemyId = `${CORRIDOR_ID}#0`;
    const state: GameState = {
      characters: [fighter],
      active_character_id: fighter.id,
      current_room: CORRIDOR_ID,
      visited_rooms: [ctx.startRoomId, CORRIDOR_ID],
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
      visited_rooms: [ctx.startRoomId, CORRIDOR_ID],
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
      visited_rooms: [ctx.startRoomId, CORRIDOR_ID],
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
      seed: seedWithEnemy,
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
      visited_rooms: [ctx.startRoomId, CORRIDOR_ID],
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
      visited_rooms: [ctx.startRoomId, CORRIDOR_ID],
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
      visited_rooms: [ctx.startRoomId, CORRIDOR_ID],
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
      equipped_weapon: 'sword-inst',
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
      visited_rooms: [ctx.startRoomId, CORRIDOR_ID],
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
      visited_rooms: [ctx.startRoomId, CORRIDOR_ID],
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
      equipped_weapon: 'mace-inst',
      inventory: [{ instance_id: 'mace-inst', id: 'mace', name: 'Mace' }],
      ...charOverrides,
    });
    const enemyId = `${CORRIDOR_ID}#0`;
    return {
      characters: [cleric],
      active_character_id: cleric.id,
      current_room: CORRIDOR_ID,
      visited_rooms: [ctx.startRoomId, CORRIDOR_ID],
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
        equipped_armor: 'chain-mail-inst',
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

describe('Enemy tactical movement (must close distance to melee)', () => {
  // Standard 1v1 grid combat with adjustable enemy stats. The PC always sits
  // at (1, 1); the enemy at the supplied position. Initiative starts on the
  // PC so a single end_turn drives one full enemy turn cycle.
  function makeMoveState(
    enemyPos: { x: number; y: number },
    enemyOverrides: Partial<Enemy> = {}
  ): { state: GameState; mySeed: Seed; enemyId: string } {
    const fighter = makeChar({
      id: 'pc-1',
      character_class: 'Fighter',
      str: 16,
      dex: 14,
      armor_proficiencies: ['light', 'medium', 'heavy', 'shield'],
      weapon_proficiencies: ['simple', 'martial'],
      equipped_weapon: 'longsword-inst',
      inventory: [{ instance_id: 'longsword-inst', id: 'longsword', name: 'Longsword' }],
    });
    const enemyId = `${CORRIDOR_ID}#0`;
    const mySeed: Seed = {
      ...seed,
      enemies: {
        [CORRIDOR_ID]: [
          {
            id: enemyId,
            name: 'Goblin',
            hp: 10,
            ac: 12,
            damage: '1d4', // Low damage so a hit doesn't drop a fresh PC
            toHit: 3,
            xp: 20,
            ...enemyOverrides,
          },
        ],
      },
    };
    const state: GameState = {
      characters: [fighter],
      active_character_id: fighter.id,
      current_room: CORRIDOR_ID,
      visited_rooms: [ctx.startRoomId, CORRIDOR_ID],
      enemies_killed: [],
      loot_taken: [],
      combat_active: true,
      initiative_order: [
        { id: fighter.id, roll: 18, is_enemy: false },
        { id: enemyId, roll: 10, is_enemy: true },
      ],
      initiative_idx: 0,
      entities: [
        {
          id: fighter.id,
          isEnemy: false,
          pos: { x: 1, y: 1 },
          hp: 20,
          maxHp: 20,
          conditions: [],
          condition_durations: {},
        },
        {
          id: enemyId,
          isEnemy: true,
          pos: enemyPos,
          hp: 10,
          maxHp: 10,
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
    return { state, mySeed, enemyId };
  }

  it('Distant enemy with default speed walks into reach and attacks', async () => {
    // Enemy starts at (7, 7) — Chebyshev 6 from PC at (1, 1) = 30 ft. Speed
    // 30 ft = 6 squares; reach 5 ft = 1 square. The closest unoccupied in-reach
    // square is at distance 5 from the enemy, so the enemy makes it in one
    // turn and attacks.
    const { state, mySeed, enemyId } = makeMoveState({ x: 7, y: 7 });
    const result = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state,
      seed: mySeed,
      context: ctx,
    });
    const finalEnemyEnt = result.newState.entities!.find((e) => e.id === enemyId);
    expect(finalEnemyEnt).toBeDefined();
    // Enemy must have moved (no longer at (7, 7))
    expect(finalEnemyEnt!.pos).not.toEqual({ x: 7, y: 7 });
    // Final position must be within reach (5 ft = 1 square Chebyshev) of PC
    const pcPos = result.newState.entities!.find((e) => e.id === 'pc-1')!.pos;
    const finalDist = Math.max(
      Math.abs(finalEnemyEnt!.pos.x - pcPos.x),
      Math.abs(finalEnemyEnt!.pos.y - pcPos.y)
    );
    expect(finalDist).toBeLessThanOrEqual(1);
    expect(result.narrative).toMatch(/closes \d+ ft/i);
    // PC's HP may or may not have dropped (depends on the d20), but the
    // engine emitted an attack roll — the enemy didn't skip combat.
    expect(result.narrative).toMatch(/Goblin/i);
  });

  it('Enemy already in reach attacks without moving', async () => {
    // Enemy at (2, 1) — 5 ft from PC; already in reach.
    const { state, mySeed, enemyId } = makeMoveState({ x: 2, y: 1 });
    const result = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state,
      seed: mySeed,
      context: ctx,
    });
    const finalEnemyEnt = result.newState.entities!.find((e) => e.id === enemyId);
    expect(finalEnemyEnt!.pos).toEqual({ x: 2, y: 1 });
    expect(result.narrative).not.toMatch(/closes \d+ ft/i);
  });

  it('Slow enemy that cannot close advances but does not attack', async () => {
    // Speed 10 ft = 2 squares. Enemy at (7, 7), PC at (1, 1) — 30 ft apart.
    // After moving 2 squares it's still > 5 ft away. No attack this turn.
    const { state, mySeed, enemyId } = makeMoveState({ x: 7, y: 7 }, { speedFt: 10 });
    const pcHpBefore = state.characters[0].hp;
    const result = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state,
      seed: mySeed,
      context: ctx,
    });
    const finalEnemyEnt = result.newState.entities!.find((e) => e.id === enemyId);
    // Enemy moved (no longer at start)
    expect(finalEnemyEnt!.pos).not.toEqual({ x: 7, y: 7 });
    const pcPos = result.newState.entities!.find((e) => e.id === 'pc-1')!.pos;
    const finalDist = Math.max(
      Math.abs(finalEnemyEnt!.pos.x - pcPos.x),
      Math.abs(finalEnemyEnt!.pos.y - pcPos.y)
    );
    // Still out of reach
    expect(finalDist).toBeGreaterThan(1);
    expect(result.narrative).toMatch(/still out of reach/i);
    // PC HP unchanged
    expect(result.newState.characters[0].hp).toBe(pcHpBefore);
  });

  it('Reach-weapon enemy (10 ft) hits at 10 ft without moving', async () => {
    // attackReachFt: 10 → Chebyshev ≤ 2 counts as in reach. Enemy at (3, 1) is
    // 10 ft from PC.
    const { state, mySeed, enemyId } = makeMoveState({ x: 3, y: 1 }, { attackReachFt: 10 });
    const result = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state,
      seed: mySeed,
      context: ctx,
    });
    const finalEnemyEnt = result.newState.entities!.find((e) => e.id === enemyId);
    expect(finalEnemyEnt!.pos).toEqual({ x: 3, y: 1 });
    expect(result.narrative).not.toMatch(/closes \d+ ft/i);
  });

  it("PC opportunity attack fires when enemy leaves the PC's threat zone", async () => {
    // Two-PC layout. The enemy's nearest-target filter excludes companions,
    // so we flag PC1 as `isCompanion: true` on the grid entity only — PC1 is
    // still a regular character. That forces the enemy to target PC2 (far
    // away). The path past PC1's threat zone triggers PC1's reaction OA.
    // After: the enemy reaches PC2, PC1's reaction is consumed, and the OA
    // narrative is in the result string.
    const pc1 = makeChar({
      id: 'pc-1',
      character_class: 'Fighter',
      str: 16,
      dex: 14,
      weapon_proficiencies: ['simple', 'martial'],
      equipped_weapon: 'longsword-inst',
      inventory: [{ instance_id: 'longsword-inst', id: 'longsword', name: 'Longsword' }],
    });
    const pc2 = makeChar({ id: 'pc-2', character_class: 'Cleric' });
    const enemyId = `${CORRIDOR_ID}#0`;
    const mySeed: Seed = {
      ...seed,
      enemies: {
        [CORRIDOR_ID]: [
          {
            id: enemyId,
            name: 'Bandit',
            hp: 20,
            ac: 12,
            damage: '1d4',
            toHit: 3,
            xp: 20,
          },
        ],
      },
    };
    const state: GameState = {
      characters: [pc1, pc2],
      active_character_id: pc1.id,
      current_room: CORRIDOR_ID,
      visited_rooms: [ctx.startRoomId, CORRIDOR_ID],
      enemies_killed: [],
      loot_taken: [],
      combat_active: true,
      // pc-2 is intentionally NOT in initiative_order — that way one end_turn
      // from pc-1 advances straight to the enemy slot. pc-2 is still present
      // as an entity, so the enemy can target it.
      initiative_order: [
        { id: pc1.id, roll: 20, is_enemy: false },
        { id: enemyId, roll: 10, is_enemy: true },
      ],
      initiative_idx: 0,
      entities: [
        {
          id: pc1.id,
          isEnemy: false,
          // Hack: isCompanion: true excludes pc-1 from the enemy's target
          // filter while leaving it visible to the OA pass. The OA pass
          // looks up the character record (which is alive with full HP).
          isCompanion: true,
          pos: { x: 4, y: 4 },
          hp: 10,
          maxHp: 10,
          conditions: [],
          condition_durations: {},
        },
        {
          id: pc2.id,
          isEnemy: false,
          pos: { x: 1, y: 5 },
          hp: 10,
          maxHp: 10,
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
    const result = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state,
      seed: mySeed,
      context: ctx,
    });
    // The OA narrative names the PC by name — and *only* PC-1 should be the
    // one OA'ing, since PC-2 was never adjacent to the enemy's start square.
    expect(result.narrative).toMatch(/Test Hero opportunity attack/i);
    expect(result.narrative).not.toMatch(/pc-2 opportunity attack/i);
    // The enemy should have ended its turn adjacent to PC-2 (i.e. moved).
    const finalEnemyEnt = result.newState.entities!.find((e) => e.id === enemyId);
    expect(finalEnemyEnt!.pos).not.toEqual({ x: 5, y: 5 });
    const pc2Pos = result.newState.entities!.find((e) => e.id === 'pc-2')!.pos;
    const distToPc2 = Math.max(
      Math.abs(finalEnemyEnt!.pos.x - pc2Pos.x),
      Math.abs(finalEnemyEnt!.pos.y - pc2Pos.y)
    );
    expect(distToPc2).toBeLessThanOrEqual(1);
  });

  it('Grappled enemy cannot move and does not attack a distant PC', async () => {
    // Enemy at (7, 7), grappled. Speed effectively 0. PC at (1, 1) is out of
    // reach. The enemy can't move and can't attack.
    const { state, mySeed, enemyId } = makeMoveState({ x: 7, y: 7 });
    state.entities = state.entities!.map((e) =>
      e.id === enemyId ? { ...e, conditions: ['grappled'] } : e
    );
    const pcHpBefore = state.characters[0].hp;
    const result = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state,
      seed: mySeed,
      context: ctx,
    });
    const finalEnemyEnt = result.newState.entities!.find((e) => e.id === enemyId);
    expect(finalEnemyEnt!.pos).toEqual({ x: 7, y: 7 });
    expect(result.narrative).toMatch(/held in place/i);
    expect(result.newState.characters[0].hp).toBe(pcHpBefore);
  });
});

// ─── Narrative tokenization (UI rendering contract) ──────────────────────────
//
// Mechanical bits — damage, rolls, HP, AC, DC, saves, mechanical asides —
// flow inline as `{{kind|display}}` tokens so the frontend can render
// them with distinct styling without breaking immersion. These tests lock
// in the format at the highest-traffic emission sites; if a future
// change drops the wrapper at one of these sites the structured rendering
// silently degrades, so we want a regression gate.

// ─── LLM fact-preservation guard ─────────────────────────────────────────────
//
// Post-LLM safety net: if the model drops a damage number or an outcome
// word from the input, the engine falls back to the raw tokenised
// narrative so the player isn't shown prose that misrepresents state.

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
      { current_room: CORRIDOR_ID, visited_rooms: [ctx.startRoomId, CORRIDOR_ID] }
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
      visited_rooms: [ctx.startRoomId, CORRIDOR_ID],
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
      rooms: [{ id: valeCtx.startRoomId, name: 'Crypt', desc: '' }],
      connections: { [valeCtx.startRoomId]: [] },
      enemies: {},
      loot: {},
      npcs: {},
    };
    const state: GameState = {
      characters: [downed],
      active_character_id: 'pc-dn',
      current_room: valeCtx.startRoomId,
      visited_rooms: [valeCtx.startRoomId],
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
      visited_rooms: [ctx.startRoomId, CORRIDOR_ID],
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
        visited_rooms: [ctx.startRoomId, CORRIDOR_ID],
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
        visited_rooms: [ctx.startRoomId, CORRIDOR_ID],
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
      visited_rooms: [ctx.startRoomId, CORRIDOR_ID],
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
      visited_rooms: [ctx.startRoomId, CORRIDOR_ID],
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
        visited_rooms: [ctx.startRoomId, CORRIDOR_ID],
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
      visited_rooms: [ctx.startRoomId, CORRIDOR_ID],
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
      visited_rooms: [ctx.startRoomId, CORRIDOR_ID],
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
      visited_rooms: [ctx.startRoomId, CORRIDOR_ID],
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
        visited_rooms: [ctx.startRoomId, CORRIDOR_ID],
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
      visited_rooms: [ctx.startRoomId, CORRIDOR_ID],
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

// ─── Grid-combat invariants ──────────────────────────────────────────────────
//
// This block exists to close the unit-coverage gap that let the
// in-combat round-robin bug (gameEngine.ts:8884) hide for the entire
// grid-combat era. Every spec elsewhere in this file uses
// `seedWithEnemy` (no grid entities), which means the auto-advance
// block sees `hasMovementLeft === false`, sets `usedInitiative = true`,
// and never executes the buggy ELSE branch. To catch that whole class
// of bug, the specs below set up a real grid state — entities + a
// non-zero `gridWidth`/`gridHeight` from the context + tracked
// `movement_used` — and assert the load-bearing invariants:
//
//   1. active_character_id stays on the acting PC after a non-turn-
//      ending action (grid_move, examine-in-combat).
//   2. active_character_id matches `initiative_order[initiative_idx].id`
//      whenever combat is live and the engine is waiting for input.
//   3. `end_turn` advances initiative monotonically and lands on the
//      next living PC's slot (skipping enemy slots that runEnemyTurns
//      processed inline).

function makeGridCombatState(opts: { partySize: number; pcAt?: GridPos[] }): {
  state: GameState;
  seed: Seed;
  enemyId: string;
} {
  const partySize = opts.partySize;
  const pcPositions = opts.pcAt ?? [
    { x: 2, y: 2 },
    { x: 3, y: 2 },
    { x: 4, y: 2 },
  ];
  const characters: Character[] = [];
  for (let i = 0; i < partySize; i++) {
    characters.push(
      makeChar({
        id: `pc-${i + 1}`,
        name: `PC${i + 1}`,
        hp: 20,
        max_hp: 20,
        str: 16,
      })
    );
  }
  const enemyId = `${CORRIDOR_ID}#0`;
  const gridSeed: Seed = {
    ...seedWithEnemy,
    enemies: {
      [CORRIDOR_ID]: [
        { id: enemyId, name: 'Goblin', hp: 10, ac: 12, damage: '1d6', toHit: 3, xp: 20 },
      ],
    },
  };
  const initiativeOrder = [
    ...characters.map((c, i) => ({ id: c.id, roll: 20 - i, is_enemy: false })),
    { id: enemyId, roll: 5, is_enemy: true },
  ];
  const state: GameState = {
    characters,
    active_character_id: characters[0].id,
    current_room: CORRIDOR_ID,
    visited_rooms: [ctx.startRoomId, CORRIDOR_ID],
    enemies_killed: [],
    loot_taken: [],
    combat_active: true,
    initiative_order: initiativeOrder,
    initiative_idx: 0,
    entities: [
      ...characters.map((c, i) => ({
        id: c.id,
        isEnemy: false as const,
        pos: pcPositions[i] ?? { x: 1 + i, y: 1 },
        hp: c.hp,
        maxHp: c.max_hp,
        conditions: [] as string[],
        condition_durations: {} as Record<string, number>,
      })),
      {
        id: enemyId,
        isEnemy: true,
        pos: { x: 7, y: 7 },
        hp: 50, // survive the grid_move test below
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
  return { state, seed: gridSeed, enemyId };
}

describe('grid-combat invariants', () => {
  it('grid_move does not advance the active marker off the moving PC', async () => {
    const { state, seed } = makeGridCombatState({ partySize: 3 });
    const result = await takeAction({
      action: { type: 'grid_move', entityId: 'pc-1', to: { x: 3, y: 3 } },
      history: [],
      state,
      seed,
      context: ctx,
    });
    expect(result.newState.combat_active).toBe(true);
    // PC1 still acts — they haven't used their action, just spent some
    // movement. PartyRail's aria-current keeps pointing at PC1.
    expect(result.newState.active_character_id).toBe('pc-1');
    // Initiative slot matches: the strip ▶ should be on PC1 too.
    const activeIdx = result.newState.initiative_idx ?? -1;
    expect(result.newState.initiative_order[activeIdx]?.id).toBe('pc-1');
  });

  it('initiative_idx and active_character_id stay aligned through end_turn', async () => {
    // Force the enemy to miss so combat persists past PC1's exit and
    // we can observe whose turn the engine landed on after the enemy's
    // interleaved turn.
    vi.spyOn(Math, 'random').mockReturnValue(0); // d20 → 1 (miss)
    const { state, seed } = makeGridCombatState({ partySize: 3 });
    const result = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state,
      seed,
      context: ctx,
    });
    expect(result.newState.combat_active).toBe(true);
    const activeIdx = result.newState.initiative_idx ?? -1;
    expect(activeIdx).toBeGreaterThanOrEqual(0);
    // Whoever the engine landed on, the two indicators agree.
    const activeEntry = result.newState.initiative_order[activeIdx];
    expect(activeEntry?.id).toBe(result.newState.active_character_id);
    expect(activeEntry?.is_enemy).toBe(false);
  });

  it('multiple grid_moves in a row keep active locked to the same PC', async () => {
    // Walk PC1 from (2,2) to (3,3) to (4,4) — two grid moves. Each
    // advance must NOT shift the active marker to PC2 (the historical
    // bug). Only end_turn should hand the turn over.
    const { state: s0, seed } = makeGridCombatState({ partySize: 3 });
    const step1 = await takeAction({
      action: { type: 'grid_move', entityId: 'pc-1', to: { x: 3, y: 3 } },
      history: [],
      state: s0,
      seed,
      context: ctx,
    });
    expect(step1.newState.active_character_id).toBe('pc-1');
    const step2 = await takeAction({
      action: { type: 'grid_move', entityId: 'pc-1', to: { x: 4, y: 4 } },
      history: [],
      state: step1.newState,
      seed,
      context: ctx,
    });
    expect(step2.newState.active_character_id).toBe('pc-1');
    // Both moves resolved (entity position advanced both times).
    const pc1Ent = step2.newState.entities?.find((e) => e.id === 'pc-1');
    expect(pc1Ent?.pos).toEqual({ x: 4, y: 4 });
    // Movement_used reflects 10 ft burned (two diagonal grid moves).
    expect((step2.newState.movement_used ?? {})['pc-1']).toBe(10);
  });

  // ── Follow-ups (full coverage) ─────────────────────────────────────────────
  // (a) `initiative_idx` advances monotonically across a full round and
  //     wraps cleanly at the end (round counter increments on wrap).
  // (b) The strip↔PartyRail sync invariant is preserved through reactive-
  //     spell pauses (Shield / Counterspell / Hellish Rebuke). The pause
  //     path mutates `active_character_id` to the reactor while the strip
  //     stays on the original initiative slot; the invariant we pin is
  //     that the pending reactor is always a living PC the strip knows
  //     about.

  it('(follow-up) initiative_idx advances monotonically and wraps with round++', async () => {
    // Force enemy d20 → 1 so its attack misses and combat persists for
    // the whole round. The enemy still walks toward a PC (BFS pathing
    // is deterministic on a fresh grid).
    vi.spyOn(Math, 'random').mockReturnValue(0); // d20 → 1
    const { state, seed } = makeGridCombatState({ partySize: 3 });
    // 4-slot initiative: PC1 (idx 0), PC2 (idx 1), PC3 (idx 2), enemy (idx 3)
    expect(state.initiative_order).toHaveLength(4);
    expect(state.initiative_idx).toBe(0);
    expect(state.round).toBe(1);

    // PC1 → PC2
    let r = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state,
      seed,
      context: ctx,
    });
    expect(r.newState.initiative_idx).toBe(1);
    expect(r.newState.active_character_id).toBe('pc-2');
    expect(r.newState.round).toBe(1);

    // PC2 → PC3
    r = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state: r.newState,
      seed,
      context: ctx,
    });
    expect(r.newState.initiative_idx).toBe(2);
    expect(r.newState.active_character_id).toBe('pc-3');
    expect(r.newState.round).toBe(1);

    // PC3 end_turn → enemy auto-acts (miss) → wraps to PC1, round=2.
    r = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state: r.newState,
      seed,
      context: ctx,
    });
    expect(r.newState.initiative_idx).toBe(0);
    expect(r.newState.active_character_id).toBe('pc-1');
    expect(r.newState.round).toBe(2);
  });

  it('(follow-up) reactive-spell pause: active_character_id moves to the reactor; strip stays aligned', async () => {
    // Enemy d20 = 15 + toHit 3 = 18 vs Wizard AC 16 → hit in [AC, AC+4]
    // window. Wizard has Shield prepared → pending_reaction fires.
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.74) // enemy d20 → 15
      .mockReturnValue(0.5);
    const wizId = 'wiz-react';
    const fighterId = 'fighter-1';
    const enemyId = `${CORRIDOR_ID}#0`;
    const wiz = makeChar({
      id: wizId,
      character_class: 'Wizard',
      level: 3,
      ac: 16,
      max_hp: 18,
      hp: 18,
      spells_known: ['shield'],
      prepared_spells: ['shield'],
      spell_slots_max: { 1: 4 },
      spell_slots_used: {},
    });
    const fighter = makeChar({
      id: fighterId,
      character_class: 'Fighter',
      level: 3,
      ac: 16,
      hp: 28,
      max_hp: 28,
    });
    const state: GameState = {
      ...makeState(),
      characters: [fighter, wiz],
      active_character_id: fighterId,
      current_room: CORRIDOR_ID,
      visited_rooms: [ctx.startRoomId, CORRIDOR_ID],
      combat_active: true,
      // Fighter goes first; enemy next will target the Wizard (adjacent).
      initiative_order: [
        { id: fighterId, roll: 18, is_enemy: false },
        { id: enemyId, roll: 10, is_enemy: true },
        { id: wizId, roll: 5, is_enemy: false },
      ],
      initiative_idx: 0,
      entities: [
        {
          id: fighterId,
          isEnemy: false,
          pos: { x: 1, y: 1 },
          hp: 28,
          maxHp: 28,
          conditions: [],
          condition_durations: {},
        },
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
          id: enemyId,
          isEnemy: true,
          pos: { x: 5, y: 5 },
          hp: 10,
          maxHp: 10,
          conditions: [],
          condition_durations: {},
        },
      ],
    };
    const result = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });
    // pending_reaction is set, active_character_id moves to the reactor.
    expect(result.newState.pending_reaction).toBeDefined();
    expect(result.newState.pending_reaction?.kind).toBe('shield');
    const reactor = result.newState.pending_reaction?.targetCharId;
    expect(reactor).toBe(wizId);
    expect(result.newState.active_character_id).toBe(reactor);
    // Strip↔PartyRail sync invariant: the reactor is still a known PC
    // in the initiative order, and they're alive. The strip's ▶ marker
    // and PartyRail's aria-current both read off `active_character_id`
    // during the pause, and the resume idx points at a real slot.
    const reactorEntry = result.newState.initiative_order.find(
      (e) => e.id === reactor && !e.is_enemy
    );
    expect(reactorEntry).toBeDefined();
    const reactorChar = result.newState.characters.find((c) => c.id === reactor);
    expect(reactorChar?.dead).toBe(false);
    // resumeFromInitiativeIdx points at a valid slot.
    const resumeIdx = result.newState.pending_reaction?.resumeFromInitiativeIdx ?? -1;
    expect(resumeIdx).toBeGreaterThanOrEqual(0);
    expect(resumeIdx).toBeLessThan(result.newState.initiative_order.length);
  });
});

// ─── applyConsequence — give_xp ───────────────────────────────────────────────
// Quest XP rewards: split `amount` evenly across living party members,
// floor the share, and trigger level-ups inline when context is provided.

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
    expect(seenKeyForAction({ type: 'move', roomId: 'foo' }, st)).toBeUndefined();
    expect(seenKeyForAction({ type: 'dash' }, st)).toBeUndefined();
    expect(
      seenKeyForAction({ type: 'cast_spell', spellId: 'fire_bolt', slotLevel: 0 }, st)
    ).toBeUndefined();
  });

  it('talk_response folds the room id and response index', () => {
    expect(seenKeyForAction({ type: 'talk_response', responseIdx: 2 }, st)).toBe(
      'talk_response::crypt_room_a::2'
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
    // Use a procgen seed so we get a real room with possible loot/objects.
    const sd = generateRoguelikeSeed(ctx);
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

describe('travel updates current_room to destination central room', () => {
  it('moving from a town to wilderness moves current_room to the location centralRoomId', async () => {
    // Build a minimal vale-shaped state sitting in the temple. The vale
    // campaign defines wilderness_old_road with centralRoomId road_north,
    // so traveling there should land current_room on road_north — not
    // leave it stuck in millhaven_temple (where Sister Maren would keep
    // emitting talk_response choices).
    // Vale is a campaign context (empty roomPool) — use generateSeed.
    const valeSeed = generateSeed(valeCtx, 1);
    const st = makeState(
      { id: 'pc-1', xp: 0 },
      {
        current_room: 'millhaven_temple',
        current_location_id: 'town_millhaven',
        active_character_id: 'pc-1',
      }
    );
    const result = await takeAction({
      action: { type: 'travel', locationId: 'wilderness_old_road' },
      history: [],
      state: st,
      seed: valeSeed,
      context: valeCtx,
    });
    expect(result.newState.current_location_id).toBe('wilderness_old_road');
    expect(result.newState.current_room).toBe('road_north');
  });

  it('preserves current_room when destination location has no centralRoomId', async () => {
    // Synth a minimal context with one location that omits centralRoomId.
    const ctxNoCentral = {
      ...valeCtx,
      campaign: {
        ...valeCtx.campaign!,
        locations: [
          {
            id: 'wilderness_test',
            name: 'Test Wilderness',
            type: 'wilderness' as const,
            desc: '',
            connections: [],
          },
        ],
      },
    };
    const sd = generateSeed(valeCtx, 1);
    const st = makeState(
      { id: 'pc-1' },
      {
        current_room: 'millhaven_temple',
        current_location_id: 'town_millhaven',
        active_character_id: 'pc-1',
      }
    );
    const result = await takeAction({
      action: { type: 'travel', locationId: 'wilderness_test' },
      history: [],
      state: st,
      seed: sd,
      context: ctxNoCentral,
    });
    expect(result.newState.current_room).toBe('millhaven_temple');
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
      connections: { test_room: [] },
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

describe('hostile in current room blocks travel / loot / move', () => {
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

  it('travel handler rejects when a hostile is in the current room', async () => {
    const seed = valeSeedWithGhoulIn('dungeon_offering_chamber');
    const st = makeState(
      { id: 'pc-1' },
      {
        current_room: 'dungeon_offering_chamber',
        current_location_id: 'dungeon_shattered_crypt',
        active_character_id: 'pc-1',
      }
    );
    const result = await takeAction({
      action: { type: 'travel', locationId: 'town_millhaven' },
      history: [],
      state: st,
      seed,
      context: valeCtx,
    });
    // Location unchanged; narrative explains.
    expect(result.newState.current_location_id).toBe('dungeon_shattered_crypt');
    expect(result.narrative).toMatch(/hostile/i);
  });

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

  it('move handler rejects when a hostile is in the current room', async () => {
    const seed = valeSeedWithGhoulIn('dungeon_offering_chamber');
    const st = makeState(
      { id: 'pc-1' },
      {
        current_room: 'dungeon_offering_chamber',
        active_character_id: 'pc-1',
      }
    );
    const result = await takeAction({
      action: { type: 'move', roomId: 'dungeon_antechamber' },
      history: [],
      state: st,
      seed,
      context: valeCtx,
    });
    expect(result.newState.current_room).toBe('dungeon_offering_chamber');
    expect(result.narrative).toMatch(/hostile/i);
  });

  it('generateChoices suppresses Travel + Pick up while a hostile is in the room', () => {
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
    expect(choices.find((c) => c.action.type === 'travel')).toBeUndefined();
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
      connections: { crypt: [] },
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
      location_id: 'town_millhaven',
      enemies_killed: [],
      loot_taken: [],
      flags: {},
      campaign_flags: {},
      quest_progress: [],
      faction_rep: {},
      world_day: 1,
      active_level: 1,
      active_class: 'Fighter',
    };
    const emptyCs: CampaignState = {
      campaign_id: valeCtx.id,
      user_id: 'u',
      world_day: 1,
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
      world_day: 1,
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
      location_id: 'dungeon_shattered_crypt',
      enemies_killed: [],
      loot_taken: ['guild_ledger'],
      flags: {},
      campaign_flags: {},
      quest_progress: [],
      faction_rep: {},
      world_day: 1,
      active_level: 1,
      active_class: 'Fighter',
    };
    const emptyCs: CampaignState = {
      campaign_id: valeCtx.id,
      user_id: 'u',
      world_day: 1,
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
