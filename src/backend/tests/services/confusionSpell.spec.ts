// Enchantment control — Confusion (SRD L4). A 10-ft sphere; every creature
// that fails its WIS save gains the `confused` condition (applied to all via
// the opt-in `aoeCondition` cast path). On a confused creature's turn the enemy
// loop re-saves it (WIS vs the caster's stamped DC), then — if still confused —
// rolls 1d10: 1-6 lose the turn, 7-8 attack a random ally in reach (friendly
// fire), 9-10 act normally. Concentration; cleared by breakConcentration.

import type { GameState, Seed } from '../../src/types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { breakConcentration, takeAction } from '../../src/services/gameEngine.js';
import { makeChar, makeState } from '../../src/test-fixtures.js';
import { SRD_SPELLS } from '../../src/campaignData/srd/spells.js';
import { context as ctx } from '../../src/campaignData/sandbox.js';

afterEach(() => vi.restoreAllMocks());

const E0 = `entry_hall#0`; // the confused creature in the turn-behavior tests
const E1 = `entry_hall#1`; // a second creature (blast / friendly-fire victim)

const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Confusion Test',
  ship_name: 'Confusion Test',
  intro: '',
  seed_id: 'confusion',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {
    ['entry_hall']: [
      // E0 swings hard (for friendly fire); E1 is a soft secondary target.
      { id: E0, name: 'Ogre', hp: 120, ac: 10, damage: '2d8', toHit: 10, xp: 50, wis: 6 },
      { id: E1, name: 'Goblin', hp: 50, ac: 5, damage: '1d6', toHit: 3, xp: 10, wis: 6 },
    ],
  },
  loot: {},
  npcs: {},
};

function makeConfusedState(opts: {
  initiativeEnemyIds?: string[];
  confusedIds?: string[];
  saveDc?: number; // stamped on the caster's concentration for the per-turn re-save
  withConcentration?: boolean;
  // Mark confused creatures as having already taken a confused turn, so the
  // end-of-turn re-save fires at the start of THIS turn (RAW: a creature is
  // confused for its first full turn before its first re-save).
  acted?: boolean;
  pcPos?: { x: number; y: number }; // override the PC's cell (default far corner)
  pcAc?: number;
  e1Pos?: { x: number; y: number }; // override E1's cell (default adjacent to E0)
}): GameState {
  const wiz = makeChar({
    id: 'pc-1',
    character_class: 'Wizard',
    level: 7,
    int: 18,
    ac: opts.pcAc ?? 14,
    hp: 40,
    max_hp: 40,
    spells_known: ['confusion'],
    prepared_spells: ['confusion'],
    spell_slots_max: { 1: 4, 2: 3, 3: 3, 4: 2 },
    spell_slots_used: {},
    concentrating_on:
      opts.withConcentration && opts.confusedIds?.length
        ? {
            spellId: 'confusion',
            condition: 'confused',
            rounds_left: 10,
            save_dc: opts.saveDc ?? 15,
          }
        : undefined,
  });
  const initiative = [
    { id: 'pc-1', roll: 30, is_enemy: false },
    ...(opts.initiativeEnemyIds ?? []).map((id, i) => ({ id, roll: 20 - i, is_enemy: true })),
  ];
  return {
    ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
    characters: [wiz],
    active_character_id: 'pc-1',
    initiative_order: initiative,
    initiative_idx: 0,
    entities: [
      {
        id: 'pc-1',
        isEnemy: false,
        pos: opts.pcPos ?? { x: 1, y: 1 },
        hp: 40,
        maxHp: 40,
        conditions: [],
        condition_durations: {},
      },
      {
        id: E0,
        isEnemy: true,
        pos: { x: 4, y: 4 }, // far from the PC; adjacent to E1
        hp: 120,
        maxHp: 120,
        conditions: opts.confusedIds?.includes(E0) ? ['confused'] : [],
        condition_durations: {},
        ...(opts.confusedIds?.includes(E0) && opts.acted ? { confused_acted: true } : {}),
      },
      {
        id: E1,
        isEnemy: true,
        pos: opts.e1Pos ?? { x: 5, y: 4 }, // default 5 ft from E0 (friendly-fire reach)
        hp: 50,
        maxHp: 50,
        conditions: opts.confusedIds?.includes(E1) ? ['confused'] : [],
        condition_durations: {},
        ...(opts.confusedIds?.includes(E1) && opts.acted ? { confused_acted: true } : {}),
      },
    ],
  };
}

describe('Confusion — catalog', () => {
  it('is an L4 AoE enchantment-control spell: WIS save, 10-ft sphere, `confused`', () => {
    const s = SRD_SPELLS.confusion;
    expect(s).toBeDefined();
    expect(s.level).toBe(4);
    expect(s.savingThrow).toBe('wis');
    expect(s.saveEffect).toBe('negates');
    expect(s.condition).toBe('confused');
    expect(s.aoeCondition).toBe(true);
    expect(s.concentration).toBe(true);
    expect(s.blastRadius).toBe(10);
    expect(s.aoeShape).toBe('sphere');
  });
});

describe('Confusion — cast applies `confused` to all failed-save creatures in the blast', () => {
  it('confuses every enemy in the sphere and links concentration with the save DC', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01); // all WIS saves fail
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'confusion', slotLevel: 4, targetEnemyId: E0 },
      history: [],
      // PC-only initiative so the cast doesn't immediately run the enemy turn
      // (which would re-save / process the freshly-applied condition).
      state: makeConfusedState({ initiativeEnemyIds: [] }),
      seed,
      context: ctx,
    });
    const ents = r.newState.entities ?? [];
    expect(ents.find((e) => e.id === E0)?.conditions).toContain('confused');
    expect(ents.find((e) => e.id === E1)?.conditions).toContain('confused'); // within 10 ft
    const pc = r.newState.characters[0];
    expect(pc.concentrating_on?.spellId).toBe('confusion');
    expect(pc.concentrating_on?.condition).toBe('confused');
    expect(pc.concentrating_on?.save_dc).toBeGreaterThan(0);
  });
});

describe('Confusion — per-turn behavior', () => {
  it('1-6: a confused creature that fails its re-save wastes its turn', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1); // d10 -> 2 (waste); re-save fails vs DC 30
    const r = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state: makeConfusedState({
        initiativeEnemyIds: [E0], // solo: only the confused creature acts
        confusedIds: [E0],
        withConcentration: true,
        saveDc: 30, // re-save always fails -> stays confused
      }),
      seed,
      context: ctx,
    });
    expect(r.narrative).toMatch(/wastes its turn/i);
    expect(r.newState.characters[0].hp).toBe(40); // confused creature never reached the PC
    expect(r.newState.entities?.find((e) => e.id === E0)?.conditions).toContain('confused');
  });

  it('7-8: a confused creature attacks a random ally within reach (friendly fire)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.7); // d10 -> 8 (friendly fire); re-save fails vs DC 30; attack hits
    const r = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state: makeConfusedState({
        initiativeEnemyIds: [E0, E1], // E0 acts first and turns on E1
        confusedIds: [E0],
        withConcentration: true,
        saveDc: 30,
      }),
      seed,
      context: ctx,
    });
    expect(r.narrative).toMatch(/turns on Goblin/i);
    expect(r.newState.entities?.find((e) => e.id === E1)?.hp).toBeLessThan(50); // ally took the hit
  });

  it('7-8: a confused creature can attack an adjacent PC (RAW: any creature in reach)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.7); // d10 -> 8 (attack in reach); attack hits
    const r = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state: makeConfusedState({
        initiativeEnemyIds: [E0],
        confusedIds: [E0],
        withConcentration: true,
        saveDc: 30,
        pcPos: { x: 3, y: 4 }, // adjacent to the confused Ogre at (4,4)
        pcAc: 5, // low AC so the swing connects
        e1Pos: { x: 9, y: 9 }, // far away so the PC is the only creature in reach
      }),
      seed,
      context: ctx,
    });
    expect(r.narrative).toMatch(/turns on Test Hero/i);
    expect(r.newState.characters[0].hp).toBeLessThan(40); // the party member took the hit
  });

  it('a confused creature that has already acted shakes off on a successful re-save', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9); // high re-save roll vs DC 1 -> succeeds
    const r = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state: makeConfusedState({
        initiativeEnemyIds: [E0],
        confusedIds: [E0],
        withConcentration: true,
        saveDc: 1, // re-save always succeeds -> recovers
        acted: true, // already spent a confused turn -> the re-save fires now
      }),
      seed,
      context: ctx,
    });
    expect(r.narrative).toMatch(/shakes off the confusion/i);
    expect(r.newState.entities?.find((e) => e.id === E0)?.conditions).not.toContain('confused');
  });

  it('RAW: no re-save on the first confused turn — the creature stays confused that turn', async () => {
    // An impossible-to-fail re-save DC (1) would free the creature instantly
    // if a re-save were rolled; because this is its FIRST confused turn, the
    // re-save is skipped and it acts confused (and is flagged for next turn).
    vi.spyOn(Math, 'random').mockReturnValue(0.1); // d10 -> 2 (waste)
    const r = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state: makeConfusedState({
        initiativeEnemyIds: [E0],
        confusedIds: [E0],
        withConcentration: true,
        saveDc: 1, // trivially-passable, but no re-save happens this turn
        // acted: false (default) -> first confused turn
      }),
      seed,
      context: ctx,
    });
    expect(r.narrative).not.toMatch(/shakes off/i);
    const e0 = r.newState.entities?.find((e) => e.id === E0);
    expect(e0?.conditions).toContain('confused'); // still confused after its first turn
    expect(e0?.confused_acted).toBe(true); // flagged so next turn re-saves
  });
});

describe('Confusion — concentration', () => {
  it('breakConcentration clears `confused` from all enemies', () => {
    const caster = makeChar({
      id: 'pc-1',
      concentrating_on: {
        spellId: 'confusion',
        condition: 'confused',
        rounds_left: 10,
        save_dc: 15,
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
          conditions: ['confused'],
          condition_durations: {},
        },
      ],
    };
    const res = breakConcentration(caster, st, ctx);
    expect(res.st.entities?.find((e) => e.id === E0)?.conditions).not.toContain('confused');
  });
});
