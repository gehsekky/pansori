// Tests for the `level_up_class` action — manual class choice at
// level-up. Validates XP gating, multiclass prerequisites, ASI
// gating on per-class level milestones, and multiclass proficiency
// grants on first level in a non-primary class.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../../test-fixtures.js';
import type { Seed } from '../../types.js';
import { context as ctx } from '../../contexts/sandbox.js';
import { takeAction } from '../gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const minimalSeed: Seed = {
  context_id: ctx.id,
  world_name: 'Level-up Test',
  ship_name: 'Level-up Test',
  intro: '',
  seed_id: 'lvlup-test',
  rooms: [{ id: ctx.startRoomId, name: 'Start', desc: '' }],
  enemies: {},
  loot: {},
  npcs: {},
};

describe('level_up_class — XP gating', () => {
  it('rejects when XP is below the next-level threshold', async () => {
    const pc = makeChar({ id: 'pc-1', character_class: 'Fighter', level: 3, xp: 200 });
    const state = {
      ...makeState({ id: 'pc-1' }, { current_room: ctx.startRoomId }),
      characters: [pc],
      active_character_id: 'pc-1',
    };
    const result = await takeAction({
      action: { type: 'level_up_class', className: 'fighter' },
      history: [],
      state,
      seed: minimalSeed,
      context: ctx,
    });
    // Level 3 → needs 300 XP, have 200, need 100 more.
    expect(result.narrative).toMatch(/needs 100 more XP/);
    expect(result.newState.characters[0].level).toBe(3);
  });

  it('rejects when at the level cap (20)', async () => {
    const pc = makeChar({ id: 'pc-1', character_class: 'Fighter', level: 20, xp: 99999 });
    const state = {
      ...makeState({ id: 'pc-1' }, { current_room: ctx.startRoomId }),
      characters: [pc],
      active_character_id: 'pc-1',
    };
    const result = await takeAction({
      action: { type: 'level_up_class', className: 'fighter' },
      history: [],
      state,
      seed: minimalSeed,
      context: ctx,
    });
    expect(result.narrative).toMatch(/level cap/);
  });

  it('rejects mid-combat', async () => {
    const pc = makeChar({ id: 'pc-1', character_class: 'Fighter', level: 3, xp: 400 });
    const state = {
      ...makeState({ id: 'pc-1' }, { current_room: ctx.startRoomId, combat_active: true }),
      characters: [pc],
      active_character_id: 'pc-1',
    };
    const result = await takeAction({
      action: { type: 'level_up_class', className: 'fighter' },
      history: [],
      state,
      seed: minimalSeed,
      context: ctx,
    });
    expect(result.narrative).toMatch(/cannot level up during combat/);
  });
});

describe('level_up_class — multiclass prereqs', () => {
  it('allows leveling into the primary class without ability prereqs', async () => {
    // Fighter with no ability ≥ 13 still can level up in Fighter.
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Fighter',
      level: 3,
      xp: 400,
      str: 10,
      dex: 10,
    });
    const state = {
      ...makeState({ id: 'pc-1' }, { current_room: ctx.startRoomId }),
      characters: [pc],
      active_character_id: 'pc-1',
    };
    const result = await takeAction({
      action: { type: 'level_up_class', className: 'fighter' },
      history: [],
      state,
      seed: minimalSeed,
      context: ctx,
    });
    expect(result.newState.characters[0].level).toBe(4);
  });

  it('rejects multiclassing into a class whose ability prereq is unmet', async () => {
    // Fighter at L3 with INT 10 cannot multiclass into Wizard (needs INT 13).
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Fighter',
      level: 3,
      xp: 400,
      int: 10,
    });
    const state = {
      ...makeState({ id: 'pc-1' }, { current_room: ctx.startRoomId }),
      characters: [pc],
      active_character_id: 'pc-1',
    };
    const result = await takeAction({
      action: { type: 'level_up_class', className: 'wizard' },
      history: [],
      state,
      seed: minimalSeed,
      context: ctx,
    });
    expect(result.narrative).toMatch(/requires INT 13/);
    expect(result.newState.characters[0].level).toBe(3);
  });

  it('allows multiclass into Wizard when INT ≥ 13', async () => {
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Fighter',
      level: 3,
      xp: 400,
      int: 13,
    });
    const state = {
      ...makeState({ id: 'pc-1' }, { current_room: ctx.startRoomId }),
      characters: [pc],
      active_character_id: 'pc-1',
    };
    const result = await takeAction({
      action: { type: 'level_up_class', className: 'wizard' },
      history: [],
      state,
      seed: minimalSeed,
      context: ctx,
    });
    const next = result.newState.characters[0];
    expect(next.level).toBe(4);
    expect(next.class_levels).toEqual({ fighter: 3, wizard: 1 });
  });
});

describe('level_up_class — ASI gating', () => {
  it('flags asi_pending when crossing a per-class ASI milestone (fighter L4)', async () => {
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Fighter',
      level: 3,
      xp: 400,
      class_levels: { fighter: 3 },
    });
    const state = {
      ...makeState({ id: 'pc-1' }, { current_room: ctx.startRoomId }),
      characters: [pc],
      active_character_id: 'pc-1',
    };
    const result = await takeAction({
      action: { type: 'level_up_class', className: 'fighter' },
      history: [],
      state,
      seed: minimalSeed,
      context: ctx,
    });
    expect(result.newState.characters[0].asi_pending).toBe(true);
  });

  it('does NOT flag asi_pending when total level is 4 but class level is 1 (multiclass entry)', async () => {
    // Fighter 3 / Wizard 1 — total level 4, but Fighter level is still 3
    // and Wizard level is only 1. No ASI.
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Fighter',
      level: 3,
      xp: 400,
      int: 13,
      class_levels: { fighter: 3 },
    });
    const state = {
      ...makeState({ id: 'pc-1' }, { current_room: ctx.startRoomId }),
      characters: [pc],
      active_character_id: 'pc-1',
    };
    const result = await takeAction({
      action: { type: 'level_up_class', className: 'wizard' },
      history: [],
      state,
      seed: minimalSeed,
      context: ctx,
    });
    // Pre-multiclass-aware ASI gating would have fired here (total
    // level 4). With per-class gating, the wizard level is 1, so no.
    expect(result.newState.characters[0].asi_pending).toBeFalsy();
  });
});

describe('level_up_class — multiclass proficiency grants', () => {
  it('grants narrow Wizard profs on first wizard level (none, since Wizard grants nothing)', async () => {
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Fighter',
      level: 3,
      xp: 400,
      int: 13,
      armor_proficiencies: ['light', 'medium', 'heavy', 'shield'],
      weapon_proficiencies: ['simple', 'martial'],
    });
    const state = {
      ...makeState({ id: 'pc-1' }, { current_room: ctx.startRoomId }),
      characters: [pc],
      active_character_id: 'pc-1',
    };
    const result = await takeAction({
      action: { type: 'level_up_class', className: 'wizard' },
      history: [],
      state,
      seed: minimalSeed,
      context: ctx,
    });
    // Wizard isn't in the grant table; profs unchanged.
    expect(result.newState.characters[0].armor_proficiencies).toEqual([
      'light',
      'medium',
      'heavy',
      'shield',
    ]);
  });

  it('grants Cleric profs on first cleric level (light/medium armor + shield)', async () => {
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Wizard',
      level: 3,
      xp: 400,
      wis: 13,
      armor_proficiencies: [], // Wizards start with no armor
      weapon_proficiencies: ['simple'],
    });
    const state = {
      ...makeState({ id: 'pc-1' }, { current_room: ctx.startRoomId }),
      characters: [pc],
      active_character_id: 'pc-1',
    };
    const result = await takeAction({
      action: { type: 'level_up_class', className: 'cleric' },
      history: [],
      state,
      seed: minimalSeed,
      context: ctx,
    });
    const next = result.newState.characters[0];
    expect(next.armor_proficiencies).toEqual(expect.arrayContaining(['light', 'medium', 'shield']));
    expect(result.narrative).toMatch(/Multiclass proficiency/);
  });

  it('does NOT re-grant profs when leveling further in an existing multiclass', async () => {
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Fighter',
      level: 4,
      xp: 500,
      str: 13,
      class_levels: { fighter: 3, cleric: 1 },
      armor_proficiencies: ['light', 'medium', 'heavy', 'shield'],
    });
    const state = {
      ...makeState({ id: 'pc-1' }, { current_room: ctx.startRoomId }),
      characters: [pc],
      active_character_id: 'pc-1',
    };
    const result = await takeAction({
      action: { type: 'level_up_class', className: 'cleric' },
      history: [],
      state,
      seed: minimalSeed,
      context: ctx,
    });
    // Second cleric level — no new prof grant narrative.
    expect(result.narrative).not.toMatch(/Multiclass proficiency/);
    expect(result.newState.characters[0].class_levels?.cleric).toBe(2);
  });
});

describe('level_up_class — spell-slot recompute on multiclass', () => {
  it('Wizard 3 → Wizard 3 / Fighter 1: slots unchanged (fighter is non-caster)', async () => {
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Wizard',
      level: 3,
      xp: 400,
      str: 13,
      class_levels: { wizard: 3 },
      spell_slots_max: { 1: 4, 2: 2 },
    });
    const state = {
      ...makeState({ id: 'pc-1' }, { current_room: ctx.startRoomId }),
      characters: [pc],
      active_character_id: 'pc-1',
    };
    const result = await takeAction({
      action: { type: 'level_up_class', className: 'fighter' },
      history: [],
      state,
      seed: minimalSeed,
      context: ctx,
    });
    // Wizard 3 + Fighter 1 → multiclass caster level = 3 (wizard only;
    // Fighter contributes 0 unless Eldritch Knight subclass on primary).
    // Same slot row as Wizard 3 → { 1: 4, 2: 2 }.
    expect(result.newState.characters[0].spell_slots_max).toEqual({ 1: 4, 2: 2 });
  });

  it('Paladin 4 → Paladin 4 / Wizard 1: slots jump to caster-level 3', async () => {
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Paladin',
      level: 4,
      xp: 500,
      int: 13,
      class_levels: { paladin: 4 },
      spell_slots_max: { 1: 3 }, // half-caster L4 → caster level 2 row
    });
    const state = {
      ...makeState({ id: 'pc-1' }, { current_room: ctx.startRoomId }),
      characters: [pc],
      active_character_id: 'pc-1',
    };
    const result = await takeAction({
      action: { type: 'level_up_class', className: 'wizard' },
      history: [],
      state,
      seed: minimalSeed,
      context: ctx,
    });
    // Paladin 4 contributes ⌊4/2⌋ = 2; Wizard 1 contributes 1. Total
    // caster level = 3 → row { 1: 4, 2: 2 }.
    expect(result.newState.characters[0].spell_slots_max).toEqual({ 1: 4, 2: 2 });
  });
});
