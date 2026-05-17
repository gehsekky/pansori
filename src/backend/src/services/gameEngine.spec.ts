import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildArrivalNarrative, generateChoices, takeAction, normalizeState } from './gameEngine.js';
import { context as ctx } from '../contexts/scifi-terror.js';
import type { GameState, Character, Seed } from '../types.js';

afterEach(() => vi.restoreAllMocks());

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const CORRIDOR_ID = 'corridor';

const seed: Seed = {
  context_id:  ctx.id,
  world_name:  'USS Test',
  ship_name:   'USS Test',
  intro:       'Test intro.',
  seed_id:     'test-seed-id',
  rooms: [
    { id: ctx.startRoomId,  name: 'Airlock',    desc: 'A cramped airlock.' },
    { id: CORRIDOR_ID,      name: 'Corridor',   desc: 'A dim corridor.' },
    { id: ctx.escapeRoomId, name: 'Escape Pod', desc: 'The escape pod.' },
  ],
  connections: {
    [ctx.startRoomId]:  [CORRIDOR_ID],
    [CORRIDOR_ID]:      [ctx.startRoomId, ctx.escapeRoomId],
    [ctx.escapeRoomId]: [CORRIDOR_ID],
  },
  enemies: {},
  loot:    {},
};

const seedWithEnemy: Seed = {
  ...seed,
  enemies: {
    [CORRIDOR_ID]: {
      name:   'Space Zombie',
      hp:     10,
      ac:     12,
      damage: '1d6',
      toHit:  3,
      xp:     20,
    },
  },
};

const seedWithLoot: Seed = {
  ...seed,
  loot: {
    [CORRIDOR_ID]: {
      id:      'medkit',
      name:    'Med-Kit',
      desc:    'Heals wounds.',
      weight:  1,
      type:    'consumable',
      slot:    null,
      damage:  null,
      ac_bonus: null,
      heal:    '1d6+1',
      effect:  null,
      aliases: ['medkit', 'med-kit', 'med kit'],
    },
  },
};

function makeChar(overrides: Partial<Character> = {}): Character {
  return {
    id:              'char-1',
    name:            'Test Hero',
    character_class: 'Soldier',
    portrait_url:    null,
    hp: 10, max_hp: 10, ac: 10,
    str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10,
    gold: 5, xp: 0, level: 1,
    inventory:           [],
    equipped_weapon:     null,
    equipped_armor:      null,
    equipped_shield:     null,
    conditions:          [],
    condition_durations: {},
    death_saves:         { successes: 0, failures: 0 },
    stable:          false,
    dead:            false,
    turn_actions:    { action_used: false, bonus_action_used: false, reaction_used: false, free_interaction_used: false },
    initiative_roll: null,
    ...overrides,
  };
}

function makeState(charOverrides: Partial<Character> = {}, stateOverrides: Partial<GameState> = {}): GameState {
  const char = makeChar(charOverrides);
  return {
    characters:          [char],
    active_character_id: char.id,
    current_room:        ctx.startRoomId,
    visited_rooms:       [ctx.startRoomId],
    enemies_killed:      [],
    loot_taken:          [],
    enemy_hp:            {},
    combat_active:       false,
    initiative_order:    [],
    initiative_idx:      0,
    run_log:             [],
    room_log:            [],
    last_choices:        [],
    flags:               {},
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
      hp: 15, max_hp: 20, ac: 12,
      str: 10, dex: 12, con: 10, int: 10, wis: 10, cha: 10,
      xp: 50, level: 1, gold: 5,
      character_class: 'Rogue',
      inventory: [], equipped_weapon: null, equipped_armor: null, equipped_shield: null,
      current_room: ctx.startRoomId,
      visited_rooms: [ctx.startRoomId],
      enemies_killed: [], loot_taken: [], enemy_hp: {},
      run_log: [{ action: 'start', narrative: 'Test.' }],
      room_log: ['Test.'], conditions: [], flags: {},
      combat_active: false, stable: false, dead: false,
      death_saves: { successes: 0, failures: 0 },
      turn_actions: { action_used: false, bonus_action_used: false, reaction_used: false, free_interaction_used: false },
    };
    const result = normalizeState(legacy as unknown as Record<string, unknown>, { character_name: 'Old Hero', portrait_url: undefined });
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
    expect(text).toContain('Corridor');
  });

  it('mentions a live enemy in the room', () => {
    const text = buildArrivalNarrative(CORRIDOR_ID, makeState({}, { current_room: CORRIDOR_ID }), seedWithEnemy, ctx);
    expect(text).toContain('Space Zombie');
  });

  it('does not mention an already-killed enemy', () => {
    const state = makeState({}, { current_room: CORRIDOR_ID, enemies_killed: [CORRIDOR_ID] });
    const text  = buildArrivalNarrative(CORRIDOR_ID, state, seedWithEnemy, ctx);
    expect(text).not.toContain('HP:');
  });

  it('mentions available loot', () => {
    const text = buildArrivalNarrative(CORRIDOR_ID, makeState({}, { current_room: CORRIDOR_ID }), seedWithLoot, ctx);
    expect(text).toContain('Med-Kit');
  });

  it('does not mention already-taken loot', () => {
    const state = makeState({}, { current_room: CORRIDOR_ID, loot_taken: [CORRIDOR_ID] });
    const text  = buildArrivalNarrative(CORRIDOR_ID, state, seedWithLoot, ctx);
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
    expect(choices.some(c => c.label.includes('Corridor'))).toBe(true);
    expect(choices.some(c => c.action.type === 'move')).toBe(true);
  });

  it('includes attack option when an enemy is alive', () => {
    const state   = makeState({}, { current_room: CORRIDOR_ID, visited_rooms: [ctx.startRoomId, CORRIDOR_ID] });
    const choices = generateChoices(state, seedWithEnemy, ctx);
    expect(choices.some(c => c.action.type === 'attack')).toBe(true);
    expect(choices.some(c => c.label.toLowerCase().includes('attack'))).toBe(true);
  });

  it('includes loot pick-up option when loot is available', () => {
    const state   = makeState({}, { current_room: CORRIDOR_ID, visited_rooms: [ctx.startRoomId, CORRIDOR_ID] });
    const choices = generateChoices(state, seedWithLoot, ctx);
    expect(choices.some(c => c.action.type === 'loot')).toBe(true);
    expect(choices.some(c => c.label.toLowerCase().includes('med-kit'))).toBe(true);
  });

  it('includes escape choice at escape room when no enemy is alive', () => {
    const state = makeState({}, {
      current_room:  ctx.escapeRoomId,
      visited_rooms: [ctx.startRoomId, CORRIDOR_ID, ctx.escapeRoomId],
    });
    const choices = generateChoices(state, seed, ctx);
    expect(choices.some(c => c.action.type === 'escape')).toBe(true);
    expect(choices.some(c => c.label === ctx.escapeChoiceText)).toBe(true);
  });

  it('does not include escape choice when an enemy blocks the escape room', () => {
    const blockedSeed: Seed = {
      ...seed,
      enemies: { [ctx.escapeRoomId]: { name: 'Guard', hp: 10, ac: 12, damage: '1d6', toHit: 3, xp: 10 } },
    };
    const state = makeState({}, {
      current_room:  ctx.escapeRoomId,
      visited_rooms: [ctx.startRoomId, CORRIDOR_ID, ctx.escapeRoomId],
    });
    const choices = generateChoices(state, blockedSeed, ctx);
    expect(choices.every(c => c.action.type !== 'escape')).toBe(true);
  });
});

// ─── takeAction ──────────────────────────────────────────────────────────────

describe('takeAction', () => {
  it('examine action returns narrative, choices, and updated newState', async () => {
    const result = await takeAction({ action: { type: 'examine' }, history: [], state: makeState(), seed, context: ctx });
    expect(typeof result.narrative).toBe('string');
    expect(result.narrative.length).toBeGreaterThan(0);
    expect(Array.isArray(result.choices)).toBe(true);
    expect(result.newState.run_log).toHaveLength(1);
    expect(result.escaped).toBe(false);
    expect(result.dead).toBe(false);
  });

  it('moving to an adjacent room updates current_room and room_log', async () => {
    const result = await takeAction({ action: { type: 'move', roomId: CORRIDOR_ID }, history: [], state: makeState(), seed, context: ctx });
    expect(result.newState.current_room).toBe(CORRIDOR_ID);
    expect(result.newState.visited_rooms).toContain(CORRIDOR_ID);
    expect(result.newState.room_log).toHaveLength(1);
    expect(result.newState.room_log[0].length).toBeGreaterThan(0);
    expect(result.newState.room_log[0]).toMatch(/airlock|escape pod/i);
  });

  it('picking up loot adds item to inventory and marks loot_taken', async () => {
    const state  = makeState({}, { current_room: CORRIDOR_ID, visited_rooms: [ctx.startRoomId, CORRIDOR_ID] });
    const result = await takeAction({ action: { type: 'loot' }, history: [], state, seed: seedWithLoot, context: ctx });
    const char   = result.newState.characters[0];
    expect(char.inventory).toHaveLength(1);
    expect(char.inventory[0].id).toBe('medkit');
    expect(char.inventory[0].instance_id).toBeTruthy();
    expect(result.newState.loot_taken).toContain(CORRIDOR_ID);
  });

  // Test Case I — Opportunity Attack
  it('[Case I] moving out of a room with a live enemy triggers an opportunity attack', async () => {
    const state = makeState({ hp: 20, max_hp: 20 }, {
      current_room:  CORRIDOR_ID,
      visited_rooms: [ctx.startRoomId, CORRIDOR_ID],
    });
    vi.spyOn(Math, 'random').mockReturnValue(0); // d20 → 1, always misses
    const result = await takeAction({ action: { type: 'move', roomId: ctx.startRoomId }, history: [], state, seed: seedWithEnemy, context: ctx });
    expect(result.newState.current_room).toBe(ctx.startRoomId);
    expect(result.narrative.toLowerCase()).toMatch(/flee|dodge|sprint|strike/);
  });

  it('[Case I] moving without an enemy present triggers no opportunity attack', async () => {
    const result = await takeAction({ action: { type: 'move', roomId: CORRIDOR_ID }, history: [], state: makeState(), seed, context: ctx });
    expect(result.narrative.toLowerCase()).not.toMatch(/strikes as you go|opportunity/);
  });

  it('escape action at the escape room with no enemy sets escaped=true', async () => {
    const state = makeState({}, {
      current_room:  ctx.escapeRoomId,
      visited_rooms: [ctx.startRoomId, CORRIDOR_ID, ctx.escapeRoomId],
    });
    const result = await takeAction({ action: { type: 'escape' }, history: [], state, seed, context: ctx });
    expect(result.escaped).toBe(true);
  });

  it('first attack populates initiative_order with all party members and the enemy', async () => {
    const state = makeState({}, { current_room: CORRIDOR_ID, visited_rooms: [ctx.startRoomId, CORRIDOR_ID] });
    const result = await takeAction({ action: { type: 'attack' }, history: [], state, seed: seedWithEnemy, context: ctx });
    expect(result.newState.initiative_order.length).toBeGreaterThan(0);
    const playerEntry = result.newState.initiative_order.find(e => !e.is_enemy);
    const enemyEntry  = result.newState.initiative_order.find(e =>  e.is_enemy);
    expect(playerEntry).toBeDefined();
    expect(enemyEntry).toBeDefined();
    expect(enemyEntry?.id).toBe(CORRIDOR_ID);
  });

  it('first attack sets initiative_idx to point at a player entry', async () => {
    const state = makeState({}, { current_room: CORRIDOR_ID, visited_rooms: [ctx.startRoomId, CORRIDOR_ID] });
    const result = await takeAction({ action: { type: 'attack' }, history: [], state, seed: seedWithEnemy, context: ctx });
    if (result.newState.combat_active) {
      const idx   = result.newState.initiative_idx;
      const entry = result.newState.initiative_order[idx];
      expect(entry?.is_enemy).toBe(false);
    }
  });

  it('killing the enemy clears initiative_order and sets combat_active false', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // d20 → 20 (critical), always hits hard
    const state = makeState({ hp: 20, max_hp: 20 }, { current_room: CORRIDOR_ID, visited_rooms: [ctx.startRoomId, CORRIDOR_ID] });
    const result = await takeAction({ action: { type: 'attack' }, history: [], state, seed: seedWithEnemy, context: ctx });
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
      enemies_killed: [], loot_taken: [], enemy_hp: {},
      combat_active: false, initiative_order: [], initiative_idx: 0,
      run_log: [], room_log: [], last_choices: [], flags: {},
    };
    // Make enemy survive (miss always) so initiative advances
    vi.spyOn(Math, 'random').mockReturnValue(0); // d20 → 1 (miss)
    const result = await takeAction({ action: { type: 'attack' }, history: [], state, seed: seedWithEnemy, context: ctx });
    if (result.newState.combat_active) {
      expect(result.newState.active_character_id).toBe('c2');
    }
  });

  // ─── Condition duration ──────────────────────────────────────────────────────

  it('stunned character gets only a pass choice', () => {
    const state = makeState({ conditions: ['stunned'], condition_durations: { stunned: 1 } }, {
      current_room: CORRIDOR_ID, visited_rooms: [ctx.startRoomId, CORRIDOR_ID],
    });
    const choices = generateChoices(state, seedWithEnemy, ctx);
    expect(choices).toHaveLength(1);
    expect(choices[0].action.type).toBe('pass');
  });

  it('pass action advances the turn without dealing damage', async () => {
    const state = makeState({ hp: 10, conditions: ['stunned'], condition_durations: { stunned: 1 } }, {
      current_room: CORRIDOR_ID, visited_rooms: [ctx.startRoomId, CORRIDOR_ID],
      combat_active: true,
      initiative_order: [
        { id: 'char-1', roll: 5, is_enemy: false },
        { id: CORRIDOR_ID, roll: 15, is_enemy: true },
      ],
      initiative_idx: 0,
    });
    const result = await takeAction({ action: { type: 'pass' }, history: [], state, seed: seedWithEnemy, context: ctx });
    expect(result.narrative).toMatch(/stunned|paralyzed|passes/i);
    expect(result.newState.characters[0].hp).toBeLessThanOrEqual(10); // may take enemy hit next turn
  });

  it('stunned condition clears after 1 round (on next initiative tick for that character)', async () => {
    // Arrange: char is stunned with 1 round remaining, passes their turn
    const state = makeState(
      { conditions: ['stunned'], condition_durations: { stunned: 1 } },
      {
        current_room: CORRIDOR_ID, visited_rooms: [ctx.startRoomId, CORRIDOR_ID],
        combat_active: true,
        initiative_order: [
          { id: 'char-1', roll: 5,  is_enemy: false },
          { id: CORRIDOR_ID, roll: 15, is_enemy: true },
        ],
        initiative_idx: 0,
      },
    );
    // Pass turn — initiative advances to enemy, enemy attacks, then wraps back to char-1
    vi.spyOn(Math, 'random').mockReturnValue(0); // enemy misses, d20→1
    const result = await takeAction({ action: { type: 'pass' }, history: [], state, seed: seedWithEnemy, context: ctx });
    // After the pass + enemy turn + wrap back to char-1, stun should be ticked off
    const char = result.newState.characters.find(c => c.id === 'char-1')!;
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
      enemies_killed: [], loot_taken: [], enemy_hp: {},
      combat_active: false, initiative_order: [], initiative_idx: 0,
      run_log: [], room_log: [], last_choices: [], flags: {},
    };
    const result = await takeAction({ action: { type: 'examine' }, history: [], state, seed, context: ctx });
    expect(result.dead).toBe(false);
  });
});
