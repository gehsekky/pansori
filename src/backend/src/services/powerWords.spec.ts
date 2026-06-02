// RE-2 — Bard capstone: Words of Creation (L20) grants Power Word Heal +
// Power Word Kill always-prepared, and a second target within 10 ft when
// casting either.
//
// Power Word Kill (L9): target ≤100 HP dies outright (no save, ignores
// resistance); else 12d12 psychic. Power Word Heal (L9): restore all HP +
// end Charmed/Frightened/Paralyzed/Poisoned/Stunned (+ stand if prone).

import type { Enemy, GameState, Seed } from '../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyLevelUpForClass, takeAction } from './gameEngine.js';
import { makeChar, makeState } from '../test-fixtures.js';
import { context as ctx } from '../contexts/sandbox.js';

afterEach(() => vi.restoreAllMocks());

const E1 = `entry_hall#0`;
const E2 = `entry_hall#1`;
const E3 = `entry_hall#2`;

function enemy(id: string, name: string, hp: number): Enemy {
  return { id, name, hp, ac: 10, damage: '1d6', toHit: 3, xp: 50 } as unknown as Enemy;
}

function killSeed(enemies: Enemy[]): Seed {
  return {
    context_id: ctx.id,
    world_name: 'Power Word Test',
    ship_name: 'Power Word Test',
    intro: '',
    seed_id: 'power-word',
    rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
    enemies: { ['entry_hall']: enemies },
    loot: {},
    npcs: {},
  };
}

// A L20-or-19 Bard already in combat, with a single L9 slot + Power Word Kill,
// facing pre-positioned enemy entities at known HP.
function killState(
  bardLevel: number,
  enemyEntities: Array<{ id: string; hp: number; pos: { x: number; y: number } }>
): GameState {
  const bard = makeChar({
    id: 'pc-1',
    name: 'Lyra',
    character_class: 'Bard',
    level: bardLevel,
    cha: 18,
    spell_slots_max: { 9: 1 },
    spell_slots_used: {},
    spells_known: ['power_word_kill', 'power_word_heal'],
  });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
    characters: [bard],
    active_character_id: 'pc-1',
    initiative_order: [
      { id: 'pc-1', roll: 18, is_enemy: false },
      ...enemyEntities.map((e) => ({ id: e.id, roll: 5, is_enemy: true })),
    ],
    initiative_idx: 0,
    entities: [
      {
        id: 'pc-1',
        isEnemy: false,
        pos: { x: 3, y: 5 },
        hp: 30,
        maxHp: 30,
        conditions: [],
        condition_durations: {},
      },
      ...enemyEntities.map((e) => ({
        id: e.id,
        isEnemy: true,
        pos: e.pos,
        hp: e.hp,
        maxHp: e.hp,
        conditions: [],
        condition_durations: {},
      })),
    ],
  } as unknown as GameState;
}

describe('Power Word Kill — death vs damage', () => {
  it('kills a target with 100 HP or fewer outright', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'power_word_kill', slotLevel: 9, targetEnemyId: E1 },
      history: [],
      state: killState(19, [{ id: E1, hp: 80, pos: { x: 4, y: 5 } }]),
      seed: killSeed([enemy(E1, 'Skeleton', 80)]),
      context: ctx,
    });
    expect(r.narrative).toMatch(/word of death/i);
    expect(r.newState.enemies_killed).toContain(E1); // dead (no damage roll involved)
    // L9 slot consumed
    expect(r.newState.characters[0].spell_slots_used[9]).toBe(1);
  });

  it('deals 12d12 psychic to a target above 100 HP (and does not instakill)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // each d12 → 7 → 84 total < 150
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'power_word_kill', slotLevel: 9, targetEnemyId: E1 },
      history: [],
      state: killState(19, [{ id: E1, hp: 150, pos: { x: 4, y: 5 } }]),
      seed: killSeed([enemy(E1, 'Ogre', 150)]),
      context: ctx,
    });
    expect(r.narrative).toMatch(/psychic damage/i);
    expect(r.newState.enemies_killed).not.toContain(E1);
    const ogre = r.newState.entities?.find((e) => e.id === E1);
    expect(ogre?.hp).toBeGreaterThan(0);
    expect(ogre?.hp).toBeLessThan(150);
  });
});

describe('Power Word Kill — Words of Creation second target', () => {
  const layout = [
    { id: E1, hp: 80, pos: { x: 4, y: 5 } }, // primary, 5 ft from PC
    { id: E2, hp: 80, pos: { x: 6, y: 5 } }, // 10 ft from E1 → in WoC range
    { id: E3, hp: 80, pos: { x: 15, y: 5 } }, // far → out of range
  ];
  const seed = killSeed([
    enemy(E1, 'Skeleton', 80),
    enemy(E2, 'Zombie', 80),
    enemy(E3, 'Ghoul', 80),
  ]);

  it('a L20 Bard kills a second enemy within 10 ft (but not one out of range)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'power_word_kill', slotLevel: 9, targetEnemyId: E1 },
      history: [],
      state: killState(20, layout),
      seed,
      context: ctx,
    });
    expect(r.newState.enemies_killed).toContain(E1);
    expect(r.newState.enemies_killed).toContain(E2);
    expect(r.newState.enemies_killed).not.toContain(E3);
    expect(r.narrative).toMatch(/Words of Creation/);
  });

  it('a L19 Bard only kills the primary target', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'power_word_kill', slotLevel: 9, targetEnemyId: E1 },
      history: [],
      state: killState(19, layout),
      seed,
      context: ctx,
    });
    expect(r.newState.enemies_killed).toContain(E1);
    expect(r.newState.enemies_killed).not.toContain(E2);
  });
});

// Out-of-combat Bard party for Power Word Heal (heal needs no enemy / grid;
// off-grid the party is assumed together so WoC range is auto-satisfied).
function healState(bardLevel: number): GameState {
  const bard = makeChar({
    id: 'pc-1',
    name: 'Lyra',
    character_class: 'Bard',
    level: bardLevel,
    cha: 18,
    hp: 30,
    max_hp: 30,
    spell_slots_max: { 9: 1 },
    spell_slots_used: {},
    spells_known: ['power_word_heal', 'power_word_kill'],
  });
  const ally1 = makeChar({
    id: 'pc-2',
    name: 'Doran',
    character_class: 'Fighter',
    hp: 5,
    max_hp: 30,
    conditions: ['frightened'],
  });
  const ally2 = makeChar({
    id: 'pc-3',
    name: 'Mira',
    character_class: 'Rogue',
    hp: 12,
    max_hp: 30,
  });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: false }),
    characters: [bard, ally1, ally2],
    active_character_id: 'pc-1',
  } as unknown as GameState;
}

describe('Power Word Heal — full heal + cleanse + Words of Creation', () => {
  it('restores the most-injured ally to full and ends its conditions', async () => {
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'power_word_heal', slotLevel: 9 },
      history: [],
      state: healState(19),
      seed: killSeed([]),
      context: ctx,
    });
    const doran = r.newState.characters.find((c) => c.id === 'pc-2')!;
    expect(doran.hp).toBe(30); // healed to full
    expect(doran.conditions).not.toContain('frightened'); // cleansed
  });

  it('a L20 Bard also heals a second ally (Words of Creation); a L19 does not', async () => {
    const r20 = await takeAction({
      action: { type: 'cast_spell', spellId: 'power_word_heal', slotLevel: 9 },
      history: [],
      state: healState(20),
      seed: killSeed([]),
      context: ctx,
    });
    expect(r20.newState.characters.find((c) => c.id === 'pc-2')!.hp).toBe(30);
    expect(r20.newState.characters.find((c) => c.id === 'pc-3')!.hp).toBe(30);
    expect(r20.narrative).toMatch(/Words of Creation/);

    const r19 = await takeAction({
      action: { type: 'cast_spell', spellId: 'power_word_heal', slotLevel: 9 },
      history: [],
      state: healState(19),
      seed: killSeed([]),
      context: ctx,
    });
    expect(r19.newState.characters.find((c) => c.id === 'pc-2')!.hp).toBe(30); // primary
    expect(r19.newState.characters.find((c) => c.id === 'pc-3')!.hp).toBe(12); // untouched
  });
});

describe('Words of Creation — L20 capstone grant', () => {
  it('grants both Power Words to spells_known on reaching Bard L20', () => {
    const bard = makeChar({
      character_class: 'Bard',
      level: 19,
      class_levels: { bard: 19 },
      spells_known: ['vicious_mockery'],
    });
    const note = applyLevelUpForClass(bard, 'bard', ctx);
    expect(bard.level).toBe(20);
    expect(bard.spells_known).toContain('power_word_heal');
    expect(bard.spells_known).toContain('power_word_kill');
    expect(note).toMatch(/Words of Creation/);
  });

  it('does not grant them before L20', () => {
    const bard = makeChar({
      character_class: 'Bard',
      level: 17,
      class_levels: { bard: 17 },
      spells_known: [],
    });
    applyLevelUpForClass(bard, 'bard', ctx);
    expect(bard.spells_known).not.toContain('power_word_kill');
  });
});
