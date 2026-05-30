// SRD 5.2.1 Vision & Light — darkness in combat. In a Heavily Obscured ('dark')
// room a creature that can't see (no Darkvision / Blindsight) is effectively
// Blinded: its attack rolls have Disadvantage and attack rolls against it have
// Advantage. Dim light is only Lightly Obscured (Perception, not combat).
// Enemies default to 60 ft darkvision; the explicit no-darkvision monsters
// (humans, a few beasts/giants) carry darkvision_ft: 0.
//
// PC side is asserted via the attack note ("(disadvantage — ... darkness ...)"
// vs "(advantage)"); the enemy side via a pinned dice sequence where the
// darkness Advantage flips a miss into a hit.

import type { Character, CombatEntity, Enemy, GameState, Seed } from '../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { canSeeTarget, isIlluminated, isInSunlight, magicalDarknessCells } from './gridEngine.js';
import { makeChar, makeState } from '../test-fixtures.js';
import { SRD_MONSTERS } from '../contexts/srd/monsters.js';
import { context as ctx } from '../contexts/sandbox.js';
import { takeAction } from './gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const ENEMY_ID = `${ctx.startRoomId}#0`;

describe('darkvision catalog', () => {
  it('humans carry darkvision_ft 0; monsters default to seeing in the dark', () => {
    expect(SRD_MONSTERS.bandit.darkvision_ft).toBe(0);
    expect(SRD_MONSTERS.guard.darkvision_ft).toBe(0);
    expect(SRD_MONSTERS.giant_eagle.darkvision_ft).toBe(0);
    expect(SRD_MONSTERS.hill_giant.darkvision_ft).toBe(0);
    expect(SRD_MONSTERS.wyvern.darkvision_ft).toBe(120);
    // Most monsters leave it unset (→ 60 default in the combat check).
    expect(SRD_MONSTERS.goblin.darkvision_ft).toBeUndefined();
  });
});

function seedWith(lighting: 'bright' | 'dim' | 'dark' | 'sunlight', enemy: Partial<Enemy>): Seed {
  return {
    context_id: ctx.id,
    world_name: 'Light Test',
    ship_name: 'Light Test',
    intro: '',
    seed_id: 'light',
    rooms: [{ id: ctx.startRoomId, name: 'Start', desc: '', lighting }],
    enemies: {
      [ctx.startRoomId]: [
        {
          id: ENEMY_ID,
          name: 'Foe',
          hp: 40,
          ac: 13,
          damage: '1d6+1',
          toHit: 4,
          xp: 50,
          str: 12,
          dex: 12,
          con: 12,
          damageType: 'slashing',
          ...enemy,
        } as Enemy,
      ],
    },
    loot: {},
    npcs: {},
  };
}

// PC adjacent to the enemy. `darkvisionFt` lets a test give the PC darkvision;
// `pcLightRadius` makes the PC a light source (as if it cast Light).
function pcState(charOverrides: Partial<Character> = {}, pcLightRadius?: number): GameState {
  const pc = makeChar({
    id: 'pc-1',
    character_class: 'Fighter',
    level: 1,
    str: 16,
    dex: 12,
    ac: 13,
    hp: 30,
    max_hp: 30,
    inventory: [{ instance_id: 'ss-1', id: 'shortsword', name: 'Shortsword' }],
    equipped_weapon: 'ss-1',
    weapon_proficiencies: ['simple', 'martial'],
    ...charOverrides,
  });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: ctx.startRoomId, combat_active: true }),
    characters: [pc],
    active_character_id: 'pc-1',
    initiative_order: [
      { id: 'pc-1', roll: 18, is_enemy: false },
      { id: ENEMY_ID, roll: 5, is_enemy: true },
    ],
    initiative_idx: 0,
    round: 1,
    entities: [
      {
        id: 'pc-1',
        isEnemy: false,
        pos: { x: 4, y: 5 },
        hp: 30,
        maxHp: 30,
        conditions: [],
        condition_durations: {},
        light_radius_ft: pcLightRadius,
      },
      {
        id: ENEMY_ID,
        isEnemy: true,
        pos: { x: 5, y: 5 },
        hp: 40,
        maxHp: 40,
        conditions: [],
        condition_durations: {},
      },
    ],
  } as unknown as GameState;
}

describe('PC attacks — darkness visibility', () => {
  it('a PC without darkvision attacks at disadvantage in a dark room', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const r = await takeAction({
      action: { type: 'attack', targetEnemyId: ENEMY_ID },
      history: [],
      state: pcState(), // no darkvision
      seed: seedWith('dark', {}), // enemy defaults to 60 ft DV → it can see the PC
      context: ctx,
    });
    expect(r.narrative).toMatch(/disadvantage/);
    expect(r.narrative).toMatch(/darkness/);
  });

  it('a PC WITH darkvision is unaffected by a dark room', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const r = await takeAction({
      action: { type: 'attack', targetEnemyId: ENEMY_ID },
      history: [],
      state: pcState({ darkvision_ft: 60 }),
      seed: seedWith('dark', {}),
      context: ctx,
    });
    expect(r.narrative).not.toMatch(/darkness/);
  });

  it('dim light does not affect attack rolls (Perception only)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const r = await takeAction({
      action: { type: 'attack', targetEnemyId: ENEMY_ID },
      history: [],
      state: pcState(), // no darkvision
      seed: seedWith('dim', {}),
      context: ctx,
    });
    expect(r.narrative).not.toMatch(/darkness/);
    expect(r.narrative).not.toMatch(/disadvantage/);
  });

  it('a PC with darkvision attacking a blind (no-DV) enemy in the dark has advantage', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const r = await takeAction({
      action: { type: 'attack', targetEnemyId: ENEMY_ID },
      history: [],
      state: pcState({ darkvision_ft: 60 }), // PC sees → no disadvantage
      seed: seedWith('dark', { darkvision_ft: 0 }), // enemy can't see the PC → advantage
      context: ctx,
    });
    expect(r.narrative).toMatch(/advantage/);
    expect(r.narrative).not.toMatch(/disadvantage/);
  });
});

describe('enemy attacks — darkness visibility', () => {
  it('a seeing enemy gains advantage attacking a no-darkvision PC in the dark', async () => {
    // Advantage rolls two d20s and takes the higher. Sequence: first die low
    // (d20 2 → would miss), second die high (d20 19 → hits); rest 0.5.
    vi.spyOn(Math, 'random')
      .mockReturnValue(0.5)
      .mockReturnValueOnce(0.05)
      .mockReturnValueOnce(0.9);
    const r = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state: pcState(), // PC has no darkvision → enemy (60 ft DV) sees it → advantage
      seed: seedWith('dark', {}),
      context: ctx,
    });
    const pc = r.newState.characters[0];
    expect(pc.hp).toBeLessThan(30); // the high die (advantage) connected
  });

  it('the same low first roll misses a darkvision PC (no advantage)', async () => {
    vi.spyOn(Math, 'random')
      .mockReturnValue(0.5)
      .mockReturnValueOnce(0.05)
      .mockReturnValueOnce(0.9);
    const r = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state: pcState({ darkvision_ft: 60 }), // PC sees the enemy → no advantage → single low die
      seed: seedWith('dark', {}),
      context: ctx,
    });
    const pc = r.newState.characters[0];
    expect(pc.hp).toBe(30); // the lone low roll missed
  });
});

// ── Auto-Blinded narration ───────────────────────────────────────────────────
describe('auto-Blinded narration', () => {
  it("a PC who can't see its target reads as Blinded by darkness", async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const r = await takeAction({
      action: { type: 'attack', targetEnemyId: ENEMY_ID },
      history: [],
      state: pcState(), // no darkvision → can't see the enemy in the dark
      seed: seedWith('dark', {}),
      context: ctx,
    });
    expect(r.narrative).toMatch(/Blinded by darkness/);
  });

  it('a PC with darkvision attacking a no-darkvision enemy reads the foe as Blinded', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const r = await takeAction({
      action: { type: 'attack', targetEnemyId: ENEMY_ID },
      history: [],
      state: pcState({ darkvision_ft: 60 }), // PC sees → advantage, no disadvantage
      seed: seedWith('dark', { darkvision_ft: 0 }), // enemy can't see the PC
      context: ctx,
    });
    expect(r.narrative).toMatch(/Blinded by darkness/);
  });

  it("an enemy attack narrates the PC as Blinded when the PC can't see it", async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const r = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state: pcState(), // no darkvision → PC is the blind one (enemy gets advantage)
      seed: seedWith('dark', {}),
      context: ctx,
    });
    expect(r.narrative).toMatch(/is Blinded by the darkness/);
  });

  it('a no-darkvision enemy narrates ITSELF as Blinded attacking a seeing PC', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const r = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state: pcState({ darkvision_ft: 60 }), // PC sees the enemy
      seed: seedWith('dark', { darkvision_ft: 0 }), // enemy is the blind one
      context: ctx,
    });
    expect(r.narrative).toMatch(/Foe is Blinded by the darkness/);
  });

  it('a bright room produces no Blinded narration', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const r = await takeAction({
      action: { type: 'attack', targetEnemyId: ENEMY_ID },
      history: [],
      state: pcState(),
      seed: seedWith('bright', {}),
      context: ctx,
    });
    expect(r.narrative).not.toMatch(/Blinded by/);
  });
});

// ── Light sources — counterplay to darkness ──────────────────────────────────
function lightSource(x: number, y: number, brightFt: number): CombatEntity {
  return {
    id: 'src',
    isEnemy: false,
    pos: { x, y },
    hp: 1,
    maxHp: 1,
    conditions: [],
    condition_durations: {},
    light_radius_ft: brightFt,
  };
}

describe('isIlluminated', () => {
  it('a cell within 2x the bright radius (bright + dim) is lit; beyond is not', () => {
    const ents = [lightSource(5, 5, 20)]; // 20 ft bright (4 cells) + 20 ft dim → reach 40 ft
    expect(isIlluminated({ x: 5, y: 5 }, ents)).toBe(true); // at the source
    expect(isIlluminated({ x: 13, y: 5 }, ents)).toBe(true); // 8 cells = 40 ft (edge of dim)
    expect(isIlluminated({ x: 14, y: 5 }, ents)).toBe(false); // 9 cells = 45 ft — dark
  });

  it('returns false with no light sources', () => {
    expect(isIlluminated({ x: 5, y: 5 }, [lightSource(5, 5, 0)])).toBe(false);
    expect(isIlluminated({ x: 5, y: 5 }, [])).toBe(false);
  });

  it('a solid wall between the source and the cell blocks the light', () => {
    const ents = [lightSource(5, 5, 20)];
    expect(isIlluminated({ x: 8, y: 5 }, ents)).toBe(true); // clear line
    expect(isIlluminated({ x: 8, y: 5 }, ents, [{ x: 7, y: 5 }])).toBe(false); // wall between
    // A wall NOT between source and cell doesn't block.
    expect(isIlluminated({ x: 8, y: 5 }, ents, [{ x: 1, y: 1 }])).toBe(true);
  });
});

describe('Light cantrip — cast in combat', () => {
  it('makes the caster a light source (sheds 20 ft bright)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const wizard = makeChar({
      id: 'pc-1',
      character_class: 'Wizard',
      level: 3,
      spells_known: ['light'],
      prepared_spells: ['light'],
    });
    const state: GameState = {
      ...makeState({ id: 'pc-1' }, { current_room: ctx.startRoomId, combat_active: true }),
      characters: [wizard],
      active_character_id: 'pc-1',
      entities: [
        {
          id: 'pc-1',
          isEnemy: false,
          pos: { x: 4, y: 5 },
          hp: 20,
          maxHp: 20,
          conditions: [],
          condition_durations: {},
        },
      ],
    } as unknown as GameState;
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'light', slotLevel: 0 },
      history: [],
      state,
      seed: seedWith('dark', {}),
      context: ctx,
    });
    const pcEnt = r.newState.entities?.find((e) => e.id === 'pc-1');
    expect(pcEnt?.light_radius_ft).toBe(20);
    expect(r.narrative).toMatch(/sheds light/);
  });
});

describe('light negates the darkness combat penalty', () => {
  it('a no-darkvision PC in its own light has no disadvantage vs an adjacent enemy', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    // PC carries Light (20 ft); the adjacent enemy is in the lit area → seen.
    const r = await takeAction({
      action: { type: 'attack', targetEnemyId: ENEMY_ID },
      history: [],
      state: pcState({}, 20), // no darkvision, but a light source
      seed: seedWith('dark', {}),
      context: ctx,
    });
    expect(r.narrative).not.toMatch(/darkness/);
    expect(r.narrative).not.toMatch(/disadvantage/);
  });

  it("the PC's light reveals it to a blind enemy — no advantage on the enemy's attack", async () => {
    // Mirror of the enemy-advantage test, but the PC carries Light, so the enemy
    // (adjacent, in the lit area) is illuminated → the PC is seen → no advantage,
    // and the same low first die misses.
    vi.spyOn(Math, 'random')
      .mockReturnValue(0.5)
      .mockReturnValueOnce(0.05)
      .mockReturnValueOnce(0.9);
    const r = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state: pcState({}, 20), // no darkvision, but a light source
      seed: seedWith('dark', {}),
      context: ctx,
    });
    const pc = r.newState.characters[0];
    expect(pc.hp).toBe(30); // no advantage → the lone low roll missed
  });
});

describe('canSeeTarget — walls block light in the dark', () => {
  it('a wall between the light source and the target leaves the target unseen', () => {
    const lit = [lightSource(5, 5, 20)]; // the source lights its surroundings
    const base = {
      observerPos: { x: 0, y: 0 },
      targetPos: { x: 8, y: 5 }, // within the lit area
      observerCanSeeInDark: false, // no darkvision
      observerPiercesMagicalDarkness: false,
      roomDark: true,
      entities: lit,
      darknessCells: new Set<string>(),
    };
    expect(canSeeTarget(base)).toBe(true); // clear line → target is lit → seen
    expect(canSeeTarget({ ...base, obstacles: [{ x: 7, y: 5 }] })).toBe(false); // wall shadows it
  });
});

// ── Magical Darkness (the Darkness spell) ────────────────────────────────────
describe('magicalDarknessCells / canSeeTarget — magical darkness', () => {
  const dark = new Set(['5,5']);

  it('darkvision cannot pierce magical darkness (target inside is unseen)', () => {
    expect(
      canSeeTarget({
        observerPos: { x: 4, y: 5 },
        targetPos: { x: 5, y: 5 }, // in darkness
        observerCanSeeInDark: true, // has darkvision — still blocked
        observerPiercesMagicalDarkness: false,
        roomDark: false,
        entities: [],
        darknessCells: dark,
      })
    ).toBe(false);
  });

  it("Blindsight / Devil's Sight pierces magical darkness", () => {
    expect(
      canSeeTarget({
        observerPos: { x: 4, y: 5 },
        targetPos: { x: 5, y: 5 },
        observerCanSeeInDark: false,
        observerPiercesMagicalDarkness: true,
        roomDark: false,
        entities: [],
        darknessCells: dark,
      })
    ).toBe(true);
  });

  it('an observer standing in darkness is blinded looking out', () => {
    expect(
      canSeeTarget({
        observerPos: { x: 5, y: 5 }, // in darkness
        targetPos: { x: 8, y: 8 }, // outside
        observerCanSeeInDark: true,
        observerPiercesMagicalDarkness: false,
        roomDark: false,
        entities: [],
        darknessCells: dark,
      })
    ).toBe(false);
  });

  it('magicalDarknessCells collects only blocksSight zones', () => {
    const zones = [
      {
        blocksSight: true,
        cells: [
          { x: 5, y: 5 },
          { x: 6, y: 5 },
        ],
      },
      { blocksSight: false, cells: [{ x: 1, y: 1 }] },
    ] as Parameters<typeof magicalDarknessCells>[0];
    const set = magicalDarknessCells(zones);
    expect(set.has('5,5')).toBe(true);
    expect(set.has('6,5')).toBe(true);
    expect(set.has('1,1')).toBe(false);
  });
});

describe('Darkness spell', () => {
  it('cast places a sight-blocking zone bound to concentration', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const wizard = makeChar({
      id: 'pc-1',
      character_class: 'Wizard',
      level: 5,
      darkvision_ft: 60,
      spells_known: ['darkness'],
      prepared_spells: ['darkness'],
      spell_slots_max: { 2: 1 },
      spell_slots_used: {},
    });
    const state: GameState = {
      ...makeState({ id: 'pc-1' }, { current_room: ctx.startRoomId, combat_active: true }),
      characters: [wizard],
      active_character_id: 'pc-1',
      entities: [
        {
          id: 'pc-1',
          isEnemy: false,
          pos: { x: 1, y: 5 },
          hp: 25,
          maxHp: 25,
          conditions: [],
          condition_durations: {},
        },
        {
          id: ENEMY_ID,
          isEnemy: true,
          pos: { x: 5, y: 5 },
          hp: 40,
          maxHp: 40,
          conditions: [],
          condition_durations: {},
        },
      ],
    } as unknown as GameState;
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'darkness', slotLevel: 2, targetEnemyId: ENEMY_ID },
      history: [],
      state,
      seed: seedWith('bright', {}),
      context: ctx,
    });
    const zone = r.newState.spell_zones?.find((z) => z.spellId === 'darkness');
    expect(zone?.blocksSight).toBe(true);
    expect(zone?.cells.some((c) => c.x === 5 && c.y === 5)).toBe(true); // centered on the enemy
    expect(r.newState.characters[0].concentrating_on?.spellId).toBe('darkness');
  });

  // SRD 5.2.1 dispel cutoffs — Darkness (L2) snuffs overlapping light from a
  // spell of level ≤ 2; Daylight (L3) banishes overlapping Darkness (L2 ≤ 3).
  function casterState(
    spellId: string,
    casterClass: string,
    level: number,
    slots: Record<number, number>
  ): GameState {
    const caster = makeChar({
      id: 'pc-1',
      character_class: casterClass,
      level,
      darkvision_ft: 60,
      spells_known: [spellId],
      prepared_spells: [spellId],
      spell_slots_max: slots,
      spell_slots_used: {},
    });
    return {
      ...makeState({ id: 'pc-1' }, { current_room: ctx.startRoomId, combat_active: true }),
      characters: [caster],
      active_character_id: 'pc-1',
      entities: [
        {
          id: 'pc-1',
          isEnemy: false,
          pos: { x: 1, y: 5 },
          hp: 25,
          maxHp: 25,
          conditions: [],
          condition_durations: {},
        },
        {
          id: ENEMY_ID,
          isEnemy: true,
          pos: { x: 5, y: 5 },
          hp: 40,
          maxHp: 40,
          conditions: [],
          condition_durations: {},
        },
      ],
    } as unknown as GameState;
  }

  it('Darkness snuffs an overlapping Light cantrip (spell level ≤ 2)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = casterState('darkness', 'Wizard', 5, { 2: 1 });
    // A lamp-bearer carrying the Light cantrip (level 0) inside the blast.
    state.entities = [
      ...(state.entities ?? []),
      {
        id: 'lamp',
        isEnemy: false,
        pos: { x: 4, y: 5 },
        hp: 10,
        maxHp: 10,
        conditions: [],
        condition_durations: {},
        light_radius_ft: 20,
        light_spell_level: 0,
      },
    ];
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'darkness', slotLevel: 2, targetEnemyId: ENEMY_ID },
      history: [],
      state,
      seed: seedWith('bright', {}),
      context: ctx,
    });
    const lamp = r.newState.entities?.find((e) => e.id === 'lamp');
    expect(lamp?.light_radius_ft).toBeUndefined();
    expect(lamp?.light_spell_level).toBeUndefined();
    expect(r.narrative).toMatch(/snuffs out overlapping magical light/);
  });

  it('Darkness does NOT dispel an overlapping Daylight (spell level 3)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = casterState('darkness', 'Wizard', 5, { 2: 1 });
    state.entities = [
      ...(state.entities ?? []),
      {
        id: 'sun',
        isEnemy: false,
        pos: { x: 4, y: 5 },
        hp: 10,
        maxHp: 10,
        conditions: [],
        condition_durations: {},
        light_radius_ft: 60,
        light_spell_level: 3,
      },
    ];
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'darkness', slotLevel: 2, targetEnemyId: ENEMY_ID },
      history: [],
      state,
      seed: seedWith('bright', {}),
      context: ctx,
    });
    const sun = r.newState.entities?.find((e) => e.id === 'sun');
    expect(sun?.light_radius_ft).toBe(60); // Daylight (L3 > 2) survives
    expect(r.narrative).not.toMatch(/snuffs out/);
  });

  it('Daylight banishes an overlapping Darkness zone and drops its concentration', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = casterState('daylight', 'Cleric', 5, { 3: 1 });
    // An ally is concentrating on a Darkness zone overlapping the Daylight caster.
    state.characters = [
      ...state.characters,
      makeChar({
        id: 'pc-2',
        character_class: 'Warlock',
        level: 5,
        concentrating_on: { spellId: 'darkness', rounds_left: 100 },
      }),
    ];
    state.spell_zones = [
      {
        id: 'd1',
        casterId: 'pc-2',
        spellId: 'darkness',
        name: 'Darkness',
        roomId: ctx.startRoomId,
        cells: [
          { x: 1, y: 5 },
          { x: 2, y: 5 },
        ], // touches the Daylight caster at (1,5)
        damage: '0',
        damageType: 'none',
        blocksSight: true,
      },
    ];
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'daylight', slotLevel: 3 },
      history: [],
      state,
      seed: seedWith('dark', {}),
      context: ctx,
    });
    expect(r.newState.spell_zones?.some((z) => z.spellId === 'darkness')).toBe(false);
    const warlock = r.newState.characters.find((c) => c.id === 'pc-2');
    expect(warlock?.concentrating_on).toBeUndefined();
    expect(r.narrative).toMatch(/Daylight banishes the magical darkness/);
  });

  it('Daylight leaves a non-overlapping Darkness zone alone', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = casterState('daylight', 'Cleric', 5, { 3: 1 });
    state.characters = [
      ...state.characters,
      makeChar({
        id: 'pc-2',
        character_class: 'Warlock',
        level: 5,
        concentrating_on: { spellId: 'darkness', rounds_left: 100 },
      }),
    ];
    state.spell_zones = [
      {
        id: 'd1',
        casterId: 'pc-2',
        spellId: 'darkness',
        name: 'Darkness',
        roomId: ctx.startRoomId,
        cells: [{ x: 30, y: 30 }], // far outside the 60-ft (12-cell) Daylight reach from (1,5)
        damage: '0',
        damageType: 'none',
        blocksSight: true,
      },
    ];
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'daylight', slotLevel: 3 },
      history: [],
      state,
      seed: seedWith('dark', {}),
      context: ctx,
    });
    expect(r.newState.spell_zones?.some((z) => z.spellId === 'darkness')).toBe(true);
    const warlock = r.newState.characters.find((c) => c.id === 'pc-2');
    expect(warlock?.concentrating_on?.spellId).toBe('darkness');
    expect(r.narrative).not.toMatch(/banishes/);
  });

  it("a Devil's Sight PC gains advantage on an enemy stuck in its darkness", async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    // Enemy at (5,5) sits in magical darkness; the PC (devil's sight, at (4,5))
    // sees through → no disadvantage, and the blinded enemy can't see the PC →
    // advantage. Bright room, to show magical darkness works regardless of ambient.
    const state = pcState({ feats: ['devils_sight'] });
    state.spell_zones = [
      {
        id: 'd1',
        casterId: 'pc-1',
        spellId: 'darkness',
        name: 'Darkness',
        roomId: ctx.startRoomId,
        cells: [{ x: 5, y: 5 }],
        damage: '0',
        damageType: 'none',
        blocksSight: true,
      },
    ];
    const r = await takeAction({
      action: { type: 'attack', targetEnemyId: ENEMY_ID },
      history: [],
      state,
      seed: seedWith('bright', {}),
      context: ctx,
    });
    expect(r.narrative).toMatch(/advantage/);
    expect(r.narrative).not.toMatch(/disadvantage/);
  });

  it("a Truesight PC (epic boon) pierces magical darkness like Devil's Sight", async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    // Same setup as the Devil's Sight case, but the PC's sight comes from the
    // Boon of Truesight (truesight_ft) — it should pierce the magical darkness:
    // no disadvantage for the PC, advantage vs the blinded enemy inside it.
    const state = pcState({ truesight_ft: 60 });
    state.spell_zones = [
      {
        id: 'd1',
        casterId: 'pc-1',
        spellId: 'darkness',
        name: 'Darkness',
        roomId: ctx.startRoomId,
        cells: [{ x: 5, y: 5 }],
        damage: '0',
        damageType: 'none',
        blocksSight: true,
      },
    ];
    const r = await takeAction({
      action: { type: 'attack', targetEnemyId: ENEMY_ID },
      history: [],
      state,
      seed: seedWith('bright', {}),
      context: ctx,
    });
    expect(r.narrative).toMatch(/advantage/);
    expect(r.narrative).not.toMatch(/disadvantage/);
  });
});

describe('Truesight in a dark room', () => {
  it('a Truesight PC sees in nonmagical darkness — no disadvantage', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const r = await takeAction({
      action: { type: 'attack', targetEnemyId: ENEMY_ID },
      history: [],
      state: pcState({ truesight_ft: 60 }), // no darkvision, but Truesight
      seed: seedWith('dark', {}),
      context: ctx,
    });
    expect(r.narrative).not.toMatch(/darkness/);
    expect(r.narrative).not.toMatch(/disadvantage/);
  });
});

// ── Sunlight Sensitivity (Kobold / Specter / Wight / Wraith) ─────────────────
describe('isInSunlight', () => {
  const daylightSource: CombatEntity = {
    id: 'sun',
    isEnemy: false,
    pos: { x: 5, y: 5 },
    hp: 1,
    maxHp: 1,
    conditions: [],
    condition_durations: {},
    light_radius_ft: 60,
    light_spell_level: 3,
  };

  it('a sunlit room is sunlight everywhere', () => {
    expect(isInSunlight({ x: 0, y: 0 }, 'sunlight', [])).toBe(true);
  });

  it('a Daylight emanation is sunlight within its bright radius only', () => {
    expect(isInSunlight({ x: 5, y: 5 }, 'dark', [daylightSource])).toBe(true); // at the source
    expect(isInSunlight({ x: 17, y: 5 }, 'dark', [daylightSource])).toBe(true); // 12 cells = 60 ft
    expect(isInSunlight({ x: 18, y: 5 }, 'dark', [daylightSource])).toBe(false); // 65 ft — only dim
  });

  it('the Light cantrip (level 0) is not sunlight', () => {
    const torch: CombatEntity = { ...daylightSource, light_radius_ft: 20, light_spell_level: 0 };
    expect(isInSunlight({ x: 5, y: 5 }, 'dark', [torch])).toBe(false);
  });

  it('a plain bright/dim/dark room with no Daylight is not sunlight', () => {
    expect(isInSunlight({ x: 5, y: 5 }, 'bright', [])).toBe(false);
  });
});

describe('catalog — sunlight-sensitive undead/kobolds', () => {
  it('Kobold, Specter, Wight, and Wraith carry the flag', () => {
    expect(SRD_MONSTERS.kobold.sunlightSensitivity).toBe(true);
    expect(SRD_MONSTERS.specter.sunlightSensitivity).toBe(true);
    expect(SRD_MONSTERS.wight.sunlightSensitivity).toBe(true);
    expect(SRD_MONSTERS.wraith.sunlightSensitivity).toBe(true);
    // A daylight-loving mortal does not.
    expect(SRD_MONSTERS.guard.sunlightSensitivity).toBeUndefined();
  });
});

describe('enemy attacks — Sunlight Sensitivity', () => {
  // Disadvantage rolls two d20s and takes the LOWER. Sequence: first die high
  // (would hit), second die low (misses); with Disadvantage the low die wins.
  it('a sunlight-sensitive enemy in a sunlit room attacks at disadvantage (drags a hit to a miss)', async () => {
    vi.spyOn(Math, 'random')
      .mockReturnValue(0.5)
      .mockReturnValueOnce(0.9)
      .mockReturnValueOnce(0.05);
    const r = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state: pcState({ darkvision_ft: 60 }), // both see (sunlight is bright) → only sensitivity matters
      seed: seedWith('sunlight', { sunlightSensitivity: true }),
      context: ctx,
    });
    expect(r.newState.characters[0].hp).toBe(30); // disadvantage → the low die missed
  });

  it('the same enemy WITHOUT the flag hits with the single high roll', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5).mockReturnValueOnce(0.9);
    const r = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state: pcState({ darkvision_ft: 60 }),
      seed: seedWith('sunlight', {}), // no sensitivity → single d20 → the high roll connects
      context: ctx,
    });
    expect(r.newState.characters[0].hp).toBeLessThan(30);
  });

  it('a sunlight-sensitive enemy in a NON-sunlit room attacks normally', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5).mockReturnValueOnce(0.9);
    const r = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state: pcState({ darkvision_ft: 60 }),
      seed: seedWith('bright', { sunlightSensitivity: true }), // bright ≠ sunlight → no penalty
      context: ctx,
    });
    expect(r.newState.characters[0].hp).toBeLessThan(30); // single high roll hits
  });
});
