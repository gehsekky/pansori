// SRD Prismatic Spray (L7) — engine-backed random-ray cone. Each enemy makes
// one DEX save, then a 1d8 picks its ray: 1–5 deal 12d6 of an element
// (save-for-half), 6 Restrains (CON save-ends), 7 Blinds (WIS save-ends).
//
// Math.random draws: [one leading cast-path draw] [save d20] [ray d8]
// [12d6 damage…]. We drive specific rays with mockReturnValueOnce sequences
// (never a constant high mock — that would roll a d8 of 8 forever via the
// reroll-on-8). The leading 0.5 absorbs the pre-resolution cast-path draw.

import type { Enemy, GameState, Seed } from '../../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../../../test-fixtures.js';
import { SRD_SPELLS } from '../../../campaignData/srd/spells.js';
import { context as ctx } from '../../fixtures/testContext.js';
import { takeAction } from '../../../services/gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const ENEMY = 'entry_hall#0';

describe('Prismatic Spray — catalog', () => {
  it('is a 7th-level arcane DEX-save cone driven by the prismatic-ray dispatch', () => {
    const s = SRD_SPELLS.prismatic_spray;
    expect(s.level).toBe(7);
    expect(s.prismaticRays).toBe(true);
    expect(s.savingThrow).toBe('dex');
    expect(s.saveEffect).toBe('half');
    expect(s.aoeShape).toBe('cone');
    expect(s.blastRadius).toBe(60);
    expect(s.spellList).toEqual(['arcane']);
  });
});

function seedWith(enemy: Partial<Enemy>): Seed {
  return {
    context_id: ctx.id,
    world_name: 'Prism Test',
    ship_name: 'Prism Test',
    intro: '',
    seed_id: 'prism',
    rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
    enemies: {
      entry_hall: [
        {
          id: ENEMY,
          name: 'Ogre',
          hp: 200,
          ac: 10,
          damage: '1d6',
          toHit: 3,
          xp: 50,
          dex: 8,
          con: 8,
          wis: 8,
          ...enemy,
        } as Enemy,
      ],
    },
    loot: {},
    npcs: {},
  };
}

function wizCaster(): GameState {
  const wiz = makeChar({
    id: 'pc-1',
    character_class: 'Wizard',
    level: 18,
    int: 20,
    hp: 90,
    max_hp: 90,
    spells_known: ['prismatic_spray'],
    prepared_spells: ['prismatic_spray'],
    spell_slots_max: { 7: 1 },
    spell_slots_used: {},
  });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
    characters: [wiz],
    active_character_id: 'pc-1',
    initiative_order: [
      { id: 'pc-1', roll: 18, is_enemy: false },
      { id: ENEMY, roll: 5, is_enemy: true },
    ],
    initiative_idx: 0,
    round: 1,
    entities: [
      {
        id: 'pc-1',
        isEnemy: false,
        pos: { x: 4, y: 5 },
        hp: 90,
        maxHp: 90,
        conditions: [],
        condition_durations: {},
      },
      {
        id: ENEMY,
        isEnemy: true,
        pos: { x: 5, y: 5 },
        hp: 200,
        maxHp: 200,
        conditions: [],
        condition_durations: {},
      },
    ],
  };
}

async function cast(seed: Seed) {
  return takeAction({
    action: { type: 'cast_spell', spellId: 'prismatic_spray', slotLevel: 7, targetEnemyId: ENEMY },
    history: [],
    state: wizCaster(),
    seed,
    context: ctx,
  });
}

describe('Prismatic Spray — damage rays (1–5)', () => {
  it('red ray + failed save deals full 12d6 fire', async () => {
    // [save d20 = 1 → fail] [ray d8 = 1 → red] [12× d6 = 4 each → 48 fire]
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.5) // leading cast-path draw
      .mockReturnValueOnce(0.0) // save: d20 = 1 → fails
      .mockReturnValueOnce(0.0) // ray: d8 = 1 → red (fire)
      .mockReturnValue(0.5); // every d6 → 4
    const r = await cast(seedWith({}));
    const hp = r.newState.entities?.find((e) => e.id === ENEMY)?.hp ?? 200;
    expect(hp).toBe(152); // 200 − 48
  });

  it('a successful save halves the ray damage', async () => {
    // [save d20 = 20 → success] [ray d8 = 1 → red] [48 → halved to 24]
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.5) // leading cast-path draw
      .mockReturnValueOnce(0.99) // save: d20 = 20 → succeeds (DC 19)
      .mockReturnValueOnce(0.0) // ray: d8 = 1 → red
      .mockReturnValue(0.5); // every d6 → 4
    const r = await cast(seedWith({}));
    const hp = r.newState.entities?.find((e) => e.id === ENEMY)?.hp ?? 200;
    expect(hp).toBe(176); // 200 − 24
  });

  it('the ray damage type is honored — a fire-immune target takes nothing from red', async () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.5) // leading cast-path draw
      .mockReturnValueOnce(0.0) // save fails
      .mockReturnValueOnce(0.0) // red ray (fire)
      .mockReturnValue(0.5);
    const r = await cast(seedWith({ immunities: ['fire'] }));
    const hp = r.newState.entities?.find((e) => e.id === ENEMY)?.hp ?? 200;
    expect(hp).toBe(200); // fire immune → no damage
  });
});

describe('Prismatic Spray — condition rays (6 indigo, 7 violet)', () => {
  it('indigo ray (6) + failed save Restrains with a CON save-ends', async () => {
    // [save d20 = 1 → fail] [ray d8 = 6 → indigo]
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.5) // leading cast-path draw
      .mockReturnValueOnce(0.0) // save fails
      .mockReturnValueOnce(0.7); // d8 = floor(0.7*8)+1 = 6 → indigo
    const r = await cast(seedWith({}));
    const ent = r.newState.entities?.find((e) => e.id === ENEMY);
    expect(ent?.conditions).toContain('restrained');
    expect(ent?.save_ends?.restrained?.ability).toBe('con');
  });

  it('violet ray (7) + failed save Blinds with a WIS save-ends', async () => {
    // [save d20 = 1 → fail] [ray d8 = 7 → violet]
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.5) // leading cast-path draw
      .mockReturnValueOnce(0.0) // save fails
      .mockReturnValueOnce(0.8); // d8 = floor(0.8*8)+1 = 7 → violet
    const r = await cast(seedWith({}));
    const ent = r.newState.entities?.find((e) => e.id === ENEMY);
    expect(ent?.conditions).toContain('blinded');
    expect(ent?.save_ends?.blinded?.ability).toBe('wis');
  });

  it('a successful save against the indigo ray leaves the target unrestrained', async () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.5) // leading cast-path draw
      .mockReturnValueOnce(0.99) // save succeeds
      .mockReturnValueOnce(0.7); // indigo ray
    const r = await cast(seedWith({}));
    const ent = r.newState.entities?.find((e) => e.id === ENEMY);
    expect(ent?.conditions ?? []).not.toContain('restrained');
  });
});
