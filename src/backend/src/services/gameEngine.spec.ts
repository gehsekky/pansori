import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildArrivalNarrative, generateChoices, takeAction } from './gameEngine.js';
import { context as ctx } from '../contexts/scifi-terror.js';
import type { GameState, Seed } from '../types.js';

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

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    hp: 10, max_hp: 10, ac: 10,
    str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10,
    gold: 5, xp: 0, level: 1,
    character_class: 'Soldier',
    inventory: [],
    equipped_weapon: null, equipped_armor: null, equipped_shield: null,
    current_room:  ctx.startRoomId,
    visited_rooms: [ctx.startRoomId],
    enemies_killed: [], loot_taken: [], enemy_hp: {},
    run_log: [], room_log: [], last_choices: [],
    conditions: [], flags: {},
    combat_active: false, initiative: null, player_first: true,
    turn_actions: { action_used: false, bonus_action_used: false, reaction_used: false, free_interaction_used: false },
    death_saves: { successes: 0, failures: 0 },
    stable: false, dead: false,
    ...overrides,
  };
}

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
    const text = buildArrivalNarrative(CORRIDOR_ID, makeState(), seedWithEnemy, ctx);
    expect(text).toContain('Space Zombie');
  });

  it('does not mention an already-killed enemy', () => {
    const state = makeState({ enemies_killed: [CORRIDOR_ID] });
    const text  = buildArrivalNarrative(CORRIDOR_ID, state, seedWithEnemy, ctx);
    expect(text).not.toContain('HP:');
  });

  it('mentions available loot', () => {
    const text = buildArrivalNarrative(CORRIDOR_ID, makeState(), seedWithLoot, ctx);
    expect(text).toContain('Med-Kit');
  });

  it('does not mention already-taken loot', () => {
    const state = makeState({ loot_taken: [CORRIDOR_ID] });
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
    const state   = makeState({ current_room: CORRIDOR_ID, visited_rooms: [ctx.startRoomId, CORRIDOR_ID] });
    const choices = generateChoices(state, seedWithEnemy, ctx);
    expect(choices.some(c => c.action.type === 'attack')).toBe(true);
    expect(choices.some(c => c.label.toLowerCase().includes('attack'))).toBe(true);
  });

  it('includes loot pick-up option when loot is available', () => {
    const state   = makeState({ current_room: CORRIDOR_ID, visited_rooms: [ctx.startRoomId, CORRIDOR_ID] });
    const choices = generateChoices(state, seedWithLoot, ctx);
    expect(choices.some(c => c.action.type === 'loot')).toBe(true);
    expect(choices.some(c => c.label.toLowerCase().includes('med-kit'))).toBe(true);
  });

  it('includes escape choice at escape room when no enemy is alive', () => {
    const state = makeState({
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
    const state = makeState({
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
    const state  = makeState({ current_room: CORRIDOR_ID, visited_rooms: [ctx.startRoomId, CORRIDOR_ID] });
    const result = await takeAction({ action: { type: 'loot' }, history: [], state, seed: seedWithLoot, context: ctx });
    expect(result.newState.inventory).toHaveLength(1);
    expect(result.newState.inventory[0].id).toBe('medkit');
    expect(result.newState.inventory[0].instance_id).toBeTruthy();
    expect(result.newState.loot_taken).toContain(CORRIDOR_ID);
  });

  // Test Case I — Opportunity Attack
  // Moving away from a live enemy triggers an enemy attack roll against the player.
  it('[Case I] moving out of a room with a live enemy triggers an opportunity attack', async () => {
    const state = makeState({
      current_room:  CORRIDOR_ID,
      visited_rooms: [ctx.startRoomId, CORRIDOR_ID],
      hp: 20, max_hp: 20,
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
    const state = makeState({
      current_room:  ctx.escapeRoomId,
      visited_rooms: [ctx.startRoomId, CORRIDOR_ID, ctx.escapeRoomId],
    });
    const result = await takeAction({ action: { type: 'escape' }, history: [], state, seed, context: ctx });
    expect(result.escaped).toBe(true);
  });
});
