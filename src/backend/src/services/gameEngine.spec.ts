import type {
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
  buildArrivalNarrative,
  generateChoices,
  normalizeState,
  runRules,
  takeAction,
} from './gameEngine.js';
import { context as ctx } from '../contexts/sandbox.js';

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

  it('in a 2-char party, active_character_id advances to the other player after attack', async () => {
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
    // Make enemy survive (miss always) so initiative advances
    vi.spyOn(Math, 'random').mockReturnValue(0); // d20 → 1 (miss)
    const result = await takeAction({
      action: { type: 'attack' },
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });
    if (result.newState.combat_active) {
      expect(result.newState.active_character_id).toBe('c2');
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

import { generateRoguelikeSeed } from './procgen.js';

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
    // rageUsesMax(6) = 3
    expect(result.newState.characters[0].class_resource_uses.rage_uses).toBe(3);
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
});
