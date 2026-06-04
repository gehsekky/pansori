// Shared test-fixture helpers for backend unit tests.
//
// Before this module landed, every spec rebuilt `Character` / `GameState`
// / `Enemy` / `Context` literals inline — roughly 400 lines of
// duplication across `gameEngine.spec.ts`, `damage.spec.ts`,
// `compose.spec.ts`, `castSpell.spec.ts`, `cost.spec.ts`, and
// `conditions/registry.spec.ts`. The canonical builders here return
// fully-populated objects with sensible defaults; specs pass `Partial<>`
// overrides to customize.
//
// Why under `src/` and not a separate `tests/` folder? The backend's
// `tsconfig.json` only includes `src/**/*` and vitest's spec pattern is
// `src/**/*.spec.ts`. Putting fixtures here keeps them inside the
// type-checked surface without rewiring config; the frontend follows
// the same pattern (`src/frontend/src/components/test-fixtures.ts`).
//
// `mockRandom` was duplicated identically in `rulesEngine.spec.ts` and
// `damage.spec.ts`; lifted here so spec files share one definition.

import type { Character, CombatEntity, Context, Enemy, GameState, Seed } from './types.js';
import { context as sandboxCtx } from './campaignData/sandbox.js';
import { vi } from 'vitest';

/**
 * Spy on `Math.random` and return the provided values in sequence. Each
 * `Math.random()` consumes the next value; calls beyond the supplied
 * count fall through to vitest's default mock behavior. Pair with
 * `afterEach(() => vi.restoreAllMocks())` to scope the spy to one test.
 */
export function mockRandom(...values: number[]): ReturnType<typeof vi.spyOn> {
  const spy = vi.spyOn(Math, 'random');
  values.forEach((v) => spy.mockReturnValueOnce(v));
  return spy;
}

/**
 * Canonical Character fixture. Returns a fully-populated Character with
 * neutral defaults (stats 10, level 1, full HP, no equipment, no spell
 * slots). Pass `overrides` to customize any field.
 */
export function makeChar(overrides: Partial<Character> = {}): Character {
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
    equipment: {},
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

/**
 * Seed grid `entities` with `state.characters[0]` placed adjacent to the named
 * enemy (PC at (4,5), enemy at (5,5)). Use for tests that trigger combat-start
 * via an Attack: the opening blow is now reach-gated against the freshly-seeded
 * grid, and the default fresh-seed placement is 25 ft apart (out of melee
 * reach). Pre-seeding adjacency keeps the PC in reach so the opening swing
 * lands. `enemyHp` defaults high so the enemy survives a multi-attack loop;
 * pass `enemyHp: 1` for kill/combat-end tests.
 */
export function withAdjacentEntities(
  state: GameState,
  enemyId: string,
  opts: { enemyHp?: number; enemyMaxHp?: number } = {}
): GameState {
  const pc = state.characters[0];
  const enemyHp = opts.enemyHp ?? 50;
  const entities: CombatEntity[] = [
    {
      id: pc.id,
      isEnemy: false,
      pos: { x: 4, y: 5 },
      hp: pc.hp,
      maxHp: pc.max_hp,
      conditions: pc.conditions ?? [],
      condition_durations: pc.condition_durations ?? {},
    },
    {
      id: enemyId,
      isEnemy: true,
      pos: { x: 5, y: 5 },
      hp: enemyHp,
      maxHp: opts.enemyMaxHp ?? enemyHp,
      conditions: [],
      condition_durations: {},
    },
  ];
  return { ...state, entities };
}

/**
 * Canonical GameState fixture with one character. `charOverrides` are
 * forwarded to `makeChar`; `stateOverrides` customize state-level
 * fields. Default `current_room` / `visited_rooms` use the sandbox's
 * home room id ('entry_hall').
 */
export function makeState(
  charOverrides: Partial<Character> = {},
  stateOverrides: Partial<GameState> = {}
): GameState {
  const char = makeChar(charOverrides);
  return {
    characters: [char],
    active_character_id: char.id,
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
    npc_attitudes: {},
    npc_talked: [],
    traps_triggered: [],
    traps_disarmed: [],
    objects_searched: [],
    flags: {},
    ...stateOverrides,
  };
}

/**
 * Minimal Enemy fixture for tests that don't care about the full enemy
 * shape (composer / damage tests). Defaults to an orc-shaped enemy.
 */
export function makeEnemy(overrides: Partial<Enemy> = {}): Enemy {
  return {
    id: 'orc-1',
    name: 'orc',
    hp: 15,
    max_hp: 15,
    ac: 13,
    damage: '1d8',
    toHit: 4,
    xp: 50,
    conditions: [],
    ...overrides,
  } as Enemy;
}

/**
 * Canonical "corridor" room id used by the spell + class-feature
 * specs as the non-start room where combat happens. Matches the
 * sandbox context's neighbour-of-start room layout.
 */
export const CORRIDOR_ID = 'guard_post';

/**
 * Sandbox context extended with a Warrior class that has the Rage
 * feature. The base sandbox context doesn't list Rage among Warrior
 * features; this fixture flips that flag for tests that exercise
 * Rage-related behavior (cast_spell concentration, class features).
 */
export const ctxWithRage: Context = {
  ...sandboxCtx,
  classFeatures: { ...sandboxCtx.classFeatures, Warrior: ['rage'] },
};

/**
 * Minimal sandbox-based seed: start / corridor / exit rooms with no
 * enemies or loot. Spread into specialized seeds (`seedWithEnemy`,
 * `seedWithLoot`, etc.) for tests that need specific encounters.
 */
export const baseSandboxSeed: Seed = {
  context_id: sandboxCtx.id,
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

/**
 * Seed with a Goblin enemy in the corridor (`damage: '1d6'`,
 * `toHit: 3`). The canonical "minimal enemy" seed used across
 * attack, spell, and bless tests.
 */
export const seedWithEnemy: Seed = {
  ...baseSandboxSeed,
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

/**
 * Variant goblin (weaker — `damage: '1d4'`, `toHit: 2`) used by the
 * class-features tests where the Warrior's rage damage reduction
 * needs the enemy to deal modest physical damage.
 */
export const dungeonSeedWithEnemy: Seed = {
  context_id: sandboxCtx.id,
  world_name: 'The Testing Grounds',
  ship_name: '',
  intro: 'Test.',
  seed_id: 'dungeon-test-seed',
  rooms: [
    { id: 'entry_hall', name: 'Entry Hall', desc: 'Entry.' },
    { id: CORRIDOR_ID, name: 'Guard Post', desc: 'Dark.' },
    { id: 'exit_gate', name: 'Exit Gate', desc: 'Exit.' },
  ],
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

/**
 * Spell-test seed: sandbox-context world with start/corridor/exit
 * rooms and one Skeleton enemy in the corridor. Reused across the
 * cast_spell, prepare_spells, and narrative-tokenization specs.
 */
export const spellSeed: Seed = {
  context_id: sandboxCtx.id,
  world_name: 'Test Dungeon',
  ship_name: 'Test Dungeon',
  intro: 'Test.',
  seed_id: 'spell-seed-id',
  rooms: [
    { id: 'entry_hall', name: 'Crypt', desc: 'Cold stone.' },
    { id: CORRIDOR_ID, name: 'Burial', desc: 'A chamber.' },
    { id: 'exit_shaft', name: 'Exit Shaft', desc: 'A shaft of light.' },
  ],
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

/**
 * Mage character in the corridor with INT 16 (+3 mod → spell attack
 * +5, save DC 13) and a small spell list covering attack-roll, save,
 * heal, AOE, and utility flavors.
 */
export function makeMageState(charOverrides: Partial<Character> = {}): GameState {
  const char = makeChar({
    character_class: 'Mage',
    int: 16,
    spell_slots_max: { 1: 2, 2: 1, 3: 1 },
    spell_slots_used: {},
    spells_known: ['fire_bolt', 'magic_missile', 'thunderwave', 'misty_step', 'fireball'],
    ...charOverrides,
  });
  return {
    characters: [char],
    active_character_id: char.id,
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

/**
 * Cleric character in the corridor with WIS 14 and a prepared-spell
 * list. Used for heal, save-spell, and prepare_spells tests.
 */
export function makeClericState(charOverrides: Partial<Character> = {}): GameState {
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
    visited_rooms: ['entry_hall', CORRIDOR_ID],
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

/**
 * Minimal Context fixture — just the narrative pools needed by the
 * weapon-attack composer renderers (combatHit / combatMiss /
 * weaponVerbs / classStyle / enemyReactions). Use when the test
 * doesn't need the full sandbox / vale contexts.
 */
export function makeMinimalContext(): Context {
  return {
    narratives: {
      combatHit: {
        healthy: ['Strikes {enemy} cleanly.'],
        hurt: ['Strikes {enemy} cleanly.'],
        critical: ['Strikes {enemy} cleanly.'],
      },
      combatMiss: {
        healthy: ['Misses {enemy} wide.'],
        hurt: ['Misses {enemy} wide.'],
        critical: ['Misses {enemy} wide.'],
      },
      weaponVerbs: { unarmed: ['connects with'] },
      classStyle: {},
      enemyReactions: {},
    },
  } as unknown as Context;
}
