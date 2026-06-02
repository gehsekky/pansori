// Enchantment control — Compulsion (SRD L4) + Dominate Beast/Person/Monster
// (L4/L5/L8). Compulsion applies `compelled` to all failed-save creatures in a
// 30-ft sphere; on its turn a compelled creature staggers away from the caster
// (no action) then re-saves. Dominate applies `dominated` to one creature (WIS
// save rolled with Advantage); on its turn it attacks the nearest OTHER enemy,
// fighting for the party. Both are concentration, cleared by breakConcentration.

import type { GameState, Seed } from '../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { breakConcentration, takeAction } from './gameEngine.js';
import { makeChar, makeState } from '../test-fixtures.js';
import { SRD_SPELLS } from '../contexts/srd/spells.js';
import { context as ctx } from '../contexts/sandbox.js';

afterEach(() => vi.restoreAllMocks());

const E0 = `entry_hall#0`;
const E1 = `entry_hall#1`;

const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Control Test',
  ship_name: 'Control Test',
  intro: '',
  seed_id: 'control',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {
    ['entry_hall']: [
      {
        id: E0,
        name: 'Ogre',
        hp: 120,
        ac: 10,
        damage: '2d8',
        toHit: 10,
        xp: 50,
        wis: 6,
        speedFt: 30,
      },
      {
        id: E1,
        name: 'Goblin',
        hp: 60,
        ac: 5,
        damage: '1d6',
        toHit: 3,
        xp: 10,
        wis: 6,
        speedFt: 30,
      },
    ],
  },
  loot: {},
  npcs: {},
};

function baseState(opts: {
  charClass: string;
  ability: Partial<{ cha: number; int: number; wis: number }>;
  spellId: string;
  e0Pos: { x: number; y: number };
  e1Pos?: { x: number; y: number };
  initiativeEnemyIds?: string[];
  e0Conditions?: string[];
  concentration?: { condition: string; save_dc: number };
}): GameState {
  const caster = makeChar({
    id: 'pc-1',
    character_class: opts.charClass,
    level: 9,
    cha: opts.ability.cha ?? 10,
    int: opts.ability.int ?? 10,
    wis: opts.ability.wis ?? 10,
    hp: 50,
    max_hp: 50,
    spells_known: [opts.spellId, 'fire_bolt'],
    prepared_spells: [opts.spellId, 'fire_bolt'],
    spell_slots_max: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1, 8: 1 },
    spell_slots_used: {},
    concentrating_on: opts.concentration
      ? {
          spellId: opts.spellId,
          condition: opts.concentration.condition,
          rounds_left: 10,
          save_dc: opts.concentration.save_dc,
        }
      : undefined,
  });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
    characters: [caster],
    active_character_id: 'pc-1',
    initiative_order: [
      { id: 'pc-1', roll: 30, is_enemy: false },
      ...(opts.initiativeEnemyIds ?? []).map((id, i) => ({ id, roll: 20 - i, is_enemy: true })),
    ],
    initiative_idx: 0,
    entities: [
      {
        id: 'pc-1',
        isEnemy: false,
        pos: { x: 1, y: 1 },
        hp: 50,
        maxHp: 50,
        conditions: [],
        condition_durations: {},
      },
      {
        id: E0,
        isEnemy: true,
        pos: opts.e0Pos,
        hp: 120,
        maxHp: 120,
        conditions: opts.e0Conditions ?? [],
        condition_durations: {},
      },
      {
        id: E1,
        isEnemy: true,
        pos: opts.e1Pos ?? { x: 6, y: 6 },
        hp: 60,
        maxHp: 60,
        conditions: [],
        condition_durations: {},
      },
    ],
  };
}

// ─── Compulsion ──────────────────────────────────────────────────────────

describe('Compulsion — catalog', () => {
  it('is an L4 AoE control spell: WIS save, 30-ft sphere, `compelled`, concentration', () => {
    const s = SRD_SPELLS.compulsion;
    expect(s.level).toBe(4);
    expect(s.savingThrow).toBe('wis');
    expect(s.condition).toBe('compelled');
    expect(s.aoeCondition).toBe(true);
    expect(s.concentration).toBe(true);
    expect(s.blastRadius).toBe(30);
    expect(s.spellList).toContain('arcane');
  });
});

describe('Compulsion — cast + forced movement', () => {
  it('confuses every enemy in the sphere with `compelled` and links concentration', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01); // all WIS saves fail
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'compulsion', slotLevel: 4, targetEnemyId: E0 },
      history: [],
      state: baseState({
        charClass: 'Bard',
        ability: { cha: 18 },
        spellId: 'compulsion',
        e0Pos: { x: 5, y: 5 },
        e1Pos: { x: 6, y: 5 },
        initiativeEnemyIds: [], // PC-only so the cast doesn't run the enemy turn
      }),
      seed,
      context: ctx,
    });
    const ents = r.newState.entities ?? [];
    expect(ents.find((e) => e.id === E0)?.conditions).toContain('compelled');
    expect(ents.find((e) => e.id === E1)?.conditions).toContain('compelled');
    expect(r.newState.characters[0].concentrating_on?.condition).toBe('compelled');
  });

  it('on its turn a compelled creature staggers away from the caster (no attack)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1); // re-save fails vs DC 30 -> stays compelled
    const before = baseState({
      charClass: 'Bard',
      ability: { cha: 18 },
      spellId: 'compulsion',
      e0Pos: { x: 5, y: 5 }, // caster is at (1,1); away = toward higher x/y
      initiativeEnemyIds: [E0],
      e0Conditions: ['compelled'],
      concentration: { condition: 'compelled', save_dc: 30 },
    });
    const r = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state: before,
      seed,
      context: ctx,
    });
    const e0 = r.newState.entities?.find((e) => e.id === E0)!;
    const distFrom = (p: { x: number; y: number }) =>
      Math.max(Math.abs(p.x - 1), Math.abs(p.y - 1));
    expect(distFrom(e0.pos)).toBeGreaterThan(distFrom({ x: 5, y: 5 })); // moved farther from caster
    expect(r.newState.characters[0].hp).toBe(50); // it fled instead of attacking
    expect(r.narrative).toMatch(/compelled to stagger/i);
  });

  it('a successful re-save ends the compulsion', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.95); // high re-save vs DC 1 -> breaks free
    const r = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state: baseState({
        charClass: 'Bard',
        ability: { cha: 18 },
        spellId: 'compulsion',
        e0Pos: { x: 5, y: 5 },
        initiativeEnemyIds: [E0],
        e0Conditions: ['compelled'],
        concentration: { condition: 'compelled', save_dc: 1 },
      }),
      seed,
      context: ctx,
    });
    expect(r.narrative).toMatch(/shakes off the compulsion/i);
    expect(r.newState.entities?.find((e) => e.id === E0)?.conditions).not.toContain('compelled');
  });
});

// ─── Dominate ──────────────────────────────────────────────────────────────

describe('Dominate — catalog', () => {
  it('registers Beast (L4) / Person (L5) / Monster (L8), each WIS save with Advantage', () => {
    expect(SRD_SPELLS.dominate_beast.level).toBe(4);
    expect(SRD_SPELLS.dominate_person.level).toBe(5);
    expect(SRD_SPELLS.dominate_monster.level).toBe(8);
    for (const id of ['dominate_beast', 'dominate_person', 'dominate_monster'] as const) {
      const s = SRD_SPELLS[id];
      expect(s.condition).toBe('dominated');
      expect(s.savingThrow).toBe('wis');
      expect(s.saveAdvantage).toBe(true);
      expect(s.concentration).toBe(true);
    }
  });
});

describe('Dominate — cast + control', () => {
  it('a failed WIS save (even with Advantage) dominates the target and links concentration', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01); // both advantage dice low -> fails
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'dominate_person', slotLevel: 5, targetEnemyId: E0 },
      history: [],
      state: baseState({
        charClass: 'Wizard',
        ability: { int: 18 },
        spellId: 'dominate_person',
        e0Pos: { x: 4, y: 4 },
        initiativeEnemyIds: [], // PC-only so the cast doesn't run the enemy turn
      }),
      seed,
      context: ctx,
    });
    expect(r.newState.entities?.find((e) => e.id === E0)?.conditions).toContain('dominated');
    expect(r.newState.characters[0].concentrating_on?.condition).toBe('dominated');
    // The real cast must stamp the caster's actual spell save DC on the
    // concentration link — otherwise the on-damage re-save falls back to a
    // hardcoded DC. Level-9 Wizard, INT 18 → 8 + prof(4) + mod(4) = 16.
    expect(r.newState.characters[0].concentrating_on?.save_dc).toBe(16);
  });

  it('a successful save (Advantage) leaves the target free', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // high roll -> saves
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'dominate_person', slotLevel: 5, targetEnemyId: E0 },
      history: [],
      state: baseState({
        charClass: 'Wizard',
        ability: { int: 18 },
        spellId: 'dominate_person',
        e0Pos: { x: 4, y: 4 },
        initiativeEnemyIds: [],
      }),
      seed,
      context: ctx,
    });
    expect(r.newState.entities?.find((e) => e.id === E0)?.conditions).not.toContain('dominated');
  });

  it('on its turn a dominated creature attacks the nearest OTHER enemy', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // attack hits
    const r = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state: baseState({
        charClass: 'Wizard',
        ability: { int: 18 },
        spellId: 'dominate_person',
        e0Pos: { x: 4, y: 4 },
        e1Pos: { x: 5, y: 4 }, // adjacent to the dominated Ogre
        initiativeEnemyIds: [E0, E1],
        e0Conditions: ['dominated'],
        concentration: { condition: 'dominated', save_dc: 16 },
      }),
      seed,
      context: ctx,
    });
    expect(r.narrative).toMatch(/dominated\) strikes Goblin/i);
    expect(r.newState.entities?.find((e) => e.id === E1)?.hp).toBeLessThan(60);
  });

  it('taking damage lets a dominated creature re-save and break free (RAW)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.95); // Fire Bolt hits; re-save passes vs DC 1
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'fire_bolt', slotLevel: 0, targetEnemyId: E0 },
      history: [],
      state: baseState({
        charClass: 'Wizard',
        ability: { int: 18 },
        spellId: 'dominate_person',
        e0Pos: { x: 4, y: 4 },
        initiativeEnemyIds: [], // PC-only so we inspect the post-damage state cleanly
        e0Conditions: ['dominated'],
        concentration: { condition: 'dominated', save_dc: 1 }, // trivially-passable re-save
      }),
      seed,
      context: ctx,
    });
    expect(r.narrative).toMatch(/breaks free of domination/i);
    expect(r.newState.entities?.find((e) => e.id === E0)?.conditions).not.toContain('dominated');
    expect(r.newState.characters[0].concentrating_on).toBeFalsy(); // concentration ended
  });

  it('a dominated creature that fails the on-damage re-save stays controlled', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.95); // Fire Bolt hits; re-save fails vs DC 30
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'fire_bolt', slotLevel: 0, targetEnemyId: E0 },
      history: [],
      state: baseState({
        charClass: 'Wizard',
        ability: { int: 18 },
        spellId: 'dominate_person',
        e0Pos: { x: 4, y: 4 },
        initiativeEnemyIds: [],
        e0Conditions: ['dominated'],
        concentration: { condition: 'dominated', save_dc: 30 }, // impossible re-save
      }),
      seed,
      context: ctx,
    });
    expect(r.newState.entities?.find((e) => e.id === E0)?.conditions).toContain('dominated');
  });
});

describe('Dominate / Compulsion — concentration cleanup', () => {
  it('breakConcentration clears `dominated` from enemies', () => {
    const caster = makeChar({
      id: 'pc-1',
      concentrating_on: {
        spellId: 'dominate_person',
        condition: 'dominated',
        rounds_left: 10,
        save_dc: 16,
      },
    });
    const st = {
      ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
      characters: [caster],
      entities: [
        {
          id: E0,
          isEnemy: true,
          pos: { x: 4, y: 4 },
          hp: 120,
          maxHp: 120,
          conditions: ['dominated'],
          condition_durations: {},
        },
      ],
    };
    const res = breakConcentration(caster, st, ctx);
    expect(res.st.entities?.find((e) => e.id === E0)?.conditions).not.toContain('dominated');
  });
});
