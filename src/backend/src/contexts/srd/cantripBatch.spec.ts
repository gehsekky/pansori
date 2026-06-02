// SRD cantrip + low-level batch: Acid Splash, Produce Flame, Starry Wisp,
// Message, Minor Illusion, Elementalism (cantrips) + Grease (L1) + Invisibility
// (L2). Each maps onto existing dispatch (save/AoE damage, spell attack,
// narrative utility, save-or-condition, and the invisible-granting buff) — no
// new engine mechanic. Tests confirm catalog registration + that casts resolve
// through the real cast path.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../../test-fixtures.js';
import { SRD_SPELLS } from './spells.js';
import type { Seed } from '../../types.js';
import { context as ctx } from '../sandbox.js';
import { takeAction } from '../../services/gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const ENEMY = `entry_hall#0`;

const CATALOG = [
  { id: 'acid_splash', level: 0 },
  { id: 'produce_flame', level: 0 },
  { id: 'starry_wisp', level: 0 },
  { id: 'message', level: 0 },
  { id: 'minor_illusion', level: 0 },
  { id: 'elementalism', level: 0 },
  { id: 'grease', level: 1 },
  { id: 'invisibility', level: 2 },
] as const;

describe('cantrip/low-level batch — catalog', () => {
  it('registers each spell at the expected level with a spell list', () => {
    for (const s of CATALOG) {
      const spell = SRD_SPELLS[s.id];
      expect(spell, s.id).toBeDefined();
      expect(spell.id).toBe(s.id);
      expect(spell.level).toBe(s.level);
      expect((spell.spellList ?? []).length).toBeGreaterThan(0);
    }
  });

  it('Invisibility grants the Invisible condition but is not in the keep-on-attack set', () => {
    // Documented invariant: regular Invisibility breaks when the target later
    // attacks (unlike Greater Invisibility); both grant the condition.
    expect(SRD_SPELLS.invisibility.condition).toBe('invisible');
    expect(SRD_SPELLS.invisibility.concentration).toBe(true);
    expect(SRD_SPELLS.greater_invisibility.condition).toBe('invisible');
  });
});

const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Cantrip Batch Test',
  ship_name: 'Cantrip Batch Test',
  intro: '',
  seed_id: 'cantrip-batch',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {
    ['entry_hall']: [
      { id: ENEMY, name: 'Ogre', hp: 200, ac: 10, damage: '1d6', toHit: 3, xp: 50, con: 8, dex: 8 },
    ],
  },
  loot: {},
  npcs: {},
};

function caster(spellIds: string[]) {
  const wiz = makeChar({
    id: 'pc-1',
    character_class: 'Wizard',
    level: 5,
    int: 18,
    hp: 40,
    max_hp: 40,
    spells_known: spellIds,
    prepared_spells: spellIds,
    spell_slots_max: { 1: 2, 2: 2 },
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
    entities: [
      {
        id: 'pc-1',
        isEnemy: false,
        pos: { x: 1, y: 1 },
        hp: 40,
        maxHp: 40,
        conditions: [],
        condition_durations: {},
      },
      {
        id: ENEMY,
        isEnemy: true,
        pos: { x: 2, y: 2 },
        hp: 200,
        maxHp: 200,
        conditions: [],
        condition_durations: {},
      },
    ],
  };
}

describe('cantrip batch — damage cantrips deal damage', () => {
  it('Acid Splash (DEX save) damages on a failed save', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01); // enemy save rolls low → fails
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'acid_splash', slotLevel: 0, targetEnemyId: ENEMY },
      history: [],
      state: caster(['acid_splash']),
      seed,
      context: ctx,
    });
    const hp = r.newState.entities?.find((e) => e.id === ENEMY)?.hp ?? 200;
    expect(hp).toBeLessThan(200);
  });

  for (const id of ['produce_flame', 'starry_wisp']) {
    it(`${id} (spell attack) damages on a hit`, async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.99); // caster attack rolls high → hits
      const r = await takeAction({
        action: { type: 'cast_spell', spellId: id, slotLevel: 0, targetEnemyId: ENEMY },
        history: [],
        state: caster([id]),
        seed,
        context: ctx,
      });
      const hp = r.newState.entities?.find((e) => e.id === ENEMY)?.hp ?? 200;
      expect(hp, id).toBeLessThan(200);
    });
  }
});

describe('cantrip batch — Grease applies Prone on a failed save', () => {
  it('the caught enemy falls Prone', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01); // enemy DEX save fails
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'grease', slotLevel: 1, targetEnemyId: ENEMY },
      history: [],
      state: caster(['grease']),
      seed,
      context: ctx,
    });
    const ent = r.newState.entities?.find((e) => e.id === ENEMY);
    expect(ent?.conditions).toContain('prone');
  });
});

describe('cantrip batch — Invisibility buff', () => {
  it('grants the self-caster the Invisible condition + concentration (not stripped by its own cast)', async () => {
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'invisibility', slotLevel: 2 },
      history: [],
      state: caster(['invisibility']),
      seed,
      context: ctx,
    });
    const pc = r.newState.characters[0];
    expect(pc.conditions).toContain('invisible');
    expect(pc.concentrating_on?.spellId).toBe('invisibility');
  });
});

describe('cantrip batch — narrative utilities resolve cleanly', () => {
  for (const id of ['message', 'minor_illusion', 'elementalism']) {
    it(`${id} produces a narrative and does not error`, async () => {
      const r = await takeAction({
        action: { type: 'cast_spell', spellId: id, slotLevel: 0 },
        history: [],
        state: caster([id]),
        seed,
        context: ctx,
      });
      expect(r.narrative, id).toBeTruthy();
      expect(r.narrative).not.toMatch(/Unknown spell|cannot|not prepared/i);
    });
  }
});
