// SRD anti-magic suppression — Globe of Invulnerability and Antimagic Field.
// `isSpellSuppressed` decides whether a cast crossing a `suppressesMagic` zone
// fizzles; the cast pipeline (PC precast + enemy cast) reads it. Unit tests pin
// the geometry/level rules; an integration test confirms a PC cast is blocked.

import type { GameState, Seed, SpellZone } from '../../src/types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isSpellSuppressed, takeAction } from '../../src/services/gameEngine.js';
import { makeChar, makeState } from '../../src/test-fixtures.js';
import { context as ctx } from '../../src/campaignData/sandbox.js';

afterEach(() => vi.restoreAllMocks());

const baseZone = (over: Partial<SpellZone>): SpellZone => ({
  id: 'z1',
  casterId: 'owner',
  spellId: 'x',
  name: 'Zone',
  roomId: 'r',
  cells: [],
  damage: '0',
  damageType: 'none',
  center: { x: 5, y: 5 },
  radiusFt: 10, // 2 squares
  ...over,
});

const stWith = (zone: SpellZone, casterPos: { x: number; y: number }): GameState =>
  ({
    current_room: 'r',
    entities: [{ id: 'caster', isEnemy: false, pos: casterPos, hp: 10, maxHp: 10, conditions: [] }],
    spell_zones: [zone],
  }) as unknown as GameState;

const INSIDE = { x: 5, y: 5 }; // at the center
const OUTSIDE = { x: 0, y: 0 }; // far from the center

describe('isSpellSuppressed — Globe of Invulnerability (from outside, ≤ level 5)', () => {
  const globe = baseZone({
    name: 'Globe of Invulnerability',
    suppressesMagic: true,
    suppressMaxLevel: 5,
    suppressFromOutsideOnly: true,
  });

  it('blocks a ≤5 spell cast from outside at a target inside', () => {
    const r = isSpellSuppressed(stWith(globe, OUTSIDE), 'caster', INSIDE, 3);
    expect(r.blocked).toBe(true);
    expect(r.zoneName).toBe('Globe of Invulnerability');
  });

  it('does NOT block a 6th-level spell (above the cap)', () => {
    expect(isSpellSuppressed(stWith(globe, OUTSIDE), 'caster', INSIDE, 6).blocked).toBe(false);
  });

  it('does NOT block a caster standing inside the globe (can cast out/in freely)', () => {
    expect(isSpellSuppressed(stWith(globe, INSIDE), 'caster', INSIDE, 3).blocked).toBe(false);
  });

  it('does NOT block a spell at a target outside the globe', () => {
    expect(isSpellSuppressed(stWith(globe, OUTSIDE), 'caster', OUTSIDE, 3).blocked).toBe(false);
  });
});

describe('isSpellSuppressed — Antimagic Field (magic in or out, any level)', () => {
  const field = baseZone({
    name: 'Antimagic Field',
    suppressesMagic: true,
    suppressFromOutsideOnly: false,
  });

  it('blocks a caster standing inside the field (even a self cast)', () => {
    expect(isSpellSuppressed(stWith(field, INSIDE), 'caster', undefined, 1).blocked).toBe(true);
  });

  it('blocks a spell from outside at a target inside', () => {
    expect(isSpellSuppressed(stWith(field, OUTSIDE), 'caster', INSIDE, 9).blocked).toBe(true);
  });

  it('does NOT block when both caster and target are outside', () => {
    expect(isSpellSuppressed(stWith(field, OUTSIDE), 'caster', OUTSIDE, 9).blocked).toBe(false);
  });
});

describe('anti-magic suppression — PC cast is blocked', () => {
  const enemyId = 'entry_hall#0';
  const seed: Seed = {
    context_id: ctx.id,
    world_name: 'AM Test',
    ship_name: 'AM Test',
    intro: '',
    seed_id: 'am',
    rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
    enemies: {
      entry_hall: [
        { id: enemyId, name: 'Mage', hp: 80, ac: 12, damage: '4', toHit: 4, xp: 50, dex: 10 },
      ],
    },
    loot: {},
    npcs: {},
  };

  it('Fireball fizzles against an enemy sheltered in its own Globe', async () => {
    const wiz = makeChar({
      id: 'pc-1',
      character_class: 'Wizard',
      level: 9,
      int: 18,
      hp: 60,
      max_hp: 60,
      spells_known: ['fireball'],
      prepared_spells: ['fireball'],
      spell_slots_max: { 3: 2 },
      spell_slots_used: {},
    });
    const state = {
      ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
      characters: [wiz],
      active_character_id: 'pc-1',
      initiative_order: [
        { id: 'pc-1', roll: 18, is_enemy: false },
        { id: enemyId, roll: 5, is_enemy: true },
      ],
      initiative_idx: 0,
      entities: [
        {
          id: 'pc-1',
          isEnemy: false,
          pos: { x: 0, y: 0 },
          hp: 60,
          maxHp: 60,
          conditions: [],
          condition_durations: {},
        },
        {
          id: enemyId,
          isEnemy: true,
          pos: { x: 6, y: 6 },
          hp: 80,
          maxHp: 80,
          conditions: [],
          condition_durations: {},
        },
      ],
      // The enemy stands inside its own Globe (centered on it).
      spell_zones: [
        baseZone({
          casterId: enemyId,
          name: 'Globe of Invulnerability',
          roomId: 'entry_hall',
          suppressesMagic: true,
          suppressMaxLevel: 5,
          suppressFromOutsideOnly: true,
          followsCaster: true,
          center: { x: 6, y: 6 },
        }),
      ],
    } as unknown as GameState;
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'fireball', slotLevel: 3, targetEnemyId: enemyId },
      history: [],
      state,
      seed,
      context: ctx,
    });
    expect(r.newState.entities?.find((e) => e.id === enemyId)?.hp).toBe(80); // unharmed
    expect(r.narrative.toLowerCase()).toContain('suppress');
    // The slot wasn't spent (the spell never went off).
    expect(r.newState.characters[0].spell_slots_used?.[3] ?? 0).toBe(0);
  });

  it('casting Globe of Invulnerability raises a suppressesMagic zone bound to concentration', async () => {
    const wiz = makeChar({
      id: 'pc-1',
      character_class: 'Wizard',
      level: 11,
      int: 18,
      hp: 60,
      max_hp: 60,
      spells_known: ['globe_of_invulnerability'],
      prepared_spells: ['globe_of_invulnerability'],
      spell_slots_max: { 6: 1 },
      spell_slots_used: {},
    });
    const state = {
      ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
      characters: [wiz],
      active_character_id: 'pc-1',
      initiative_order: [
        { id: 'pc-1', roll: 18, is_enemy: false },
        { id: enemyId, roll: 5, is_enemy: true },
      ],
      initiative_idx: 0,
      entities: [
        {
          id: 'pc-1',
          isEnemy: false,
          pos: { x: 2, y: 2 },
          hp: 60,
          maxHp: 60,
          conditions: [],
          condition_durations: {},
        },
        {
          id: enemyId,
          isEnemy: true,
          pos: { x: 6, y: 6 },
          hp: 80,
          maxHp: 80,
          conditions: [],
          condition_durations: {},
        },
      ],
    } as unknown as GameState;
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'globe_of_invulnerability', slotLevel: 6 },
      history: [],
      state,
      seed,
      context: ctx,
    });
    const zone = r.newState.spell_zones?.find((z) => z.casterId === 'pc-1' && z.suppressesMagic);
    expect(zone).toBeDefined();
    expect(zone?.suppressMaxLevel).toBe(5);
    expect(zone?.suppressFromOutsideOnly).toBe(true);
    expect(zone?.followsCaster).toBe(true);
    expect(r.newState.characters[0].concentrating_on?.spellId).toBe('globe_of_invulnerability');
  });
});
