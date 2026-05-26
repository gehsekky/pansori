// SRD RAW spell batch: four save-for-half damage spells (Dissonant Whispers,
// Mind Spike, Vitriolic Sphere, Freezing Sphere), one WIS-save control spell
// (Charm Monster), and one touch ward (Protection from Poison). Each rides an
// existing dispatch shape — these tests confirm catalog registration plus that
// a real cast resolves the spell's mechanical core.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../../test-fixtures.js';
import { SRD_SPELLS } from './spells.js';
import type { Seed } from '../../types.js';
import { context as ctx } from '../sandbox.js';
import { takeAction } from '../../services/gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const ENEMY = `${ctx.startRoomId}#0`;

// The four save-for-half damage spells.
const DAMAGE_BATCH = [
  { id: 'dissonant_whispers', level: 1, save: 'wis', type: 'psychic' },
  { id: 'mind_spike', level: 2, save: 'wis', type: 'psychic' },
  { id: 'vitriolic_sphere', level: 4, save: 'dex', type: 'acid' },
  { id: 'freezing_sphere', level: 6, save: 'con', type: 'cold' },
] as const;

describe('RAW spell batch — catalog', () => {
  it('registers each damage spell with the expected level, save, type, and half-effect', () => {
    for (const s of DAMAGE_BATCH) {
      const spell = SRD_SPELLS[s.id];
      expect(spell, s.id).toBeDefined();
      expect(spell.level).toBe(s.level);
      expect(spell.savingThrow).toBe(s.save);
      expect(spell.damageType).toBe(s.type);
      expect(spell.saveEffect).toBe('half');
      expect(spell.damage).toBeTruthy();
    }
  });

  it('Vitriolic Sphere and Freezing Sphere are spheres', () => {
    expect(SRD_SPELLS.vitriolic_sphere.aoeShape).toBe('sphere');
    expect(SRD_SPELLS.vitriolic_sphere.blastRadius).toBe(20);
    expect(SRD_SPELLS.freezing_sphere.aoeShape).toBe('sphere');
    expect(SRD_SPELLS.freezing_sphere.blastRadius).toBe(60);
  });

  it('Charm Monster is a WIS-save charm with save Advantage', () => {
    const cm = SRD_SPELLS.charm_monster;
    expect(cm.level).toBe(4);
    expect(cm.savingThrow).toBe('wis');
    expect(cm.condition).toBe('charmed');
    expect(cm.saveAdvantage).toBe(true);
  });

  it('Protection from Poison strips Poisoned and grants poison resistance', () => {
    const pp = SRD_SPELLS.protection_from_poison;
    expect(pp.level).toBe(2);
    expect(pp.targetType).toBe('self_or_ally');
    expect(pp.removeConditions).toEqual(['poisoned']);
    expect(pp.grantResistances).toEqual(['poison']);
  });
});

const seed: Seed = {
  context_id: ctx.id,
  world_name: 'RAW Spell Test',
  ship_name: 'RAW Spell Test',
  intro: '',
  seed_id: 'raw-spells',
  rooms: [{ id: ctx.startRoomId, name: 'Start', desc: '' }],
  connections: { [ctx.startRoomId]: [] },
  enemies: {
    [ctx.startRoomId]: [
      { id: ENEMY, name: 'Ogre', hp: 400, ac: 10, damage: '1d6', toHit: 3, xp: 50, con: 8, dex: 8 },
    ],
  },
  loot: {},
  npcs: {},
};

const ALL_IDS = [...DAMAGE_BATCH.map((s) => s.id), 'charm_monster', 'protection_from_poison'];

function casterState(conditions: string[] = []) {
  const wiz = makeChar({
    id: 'pc-1',
    character_class: 'Wizard',
    level: 13,
    int: 18,
    wis: 16,
    con: 16,
    hp: 50,
    max_hp: 50,
    conditions,
    spells_known: ALL_IDS,
    prepared_spells: ALL_IDS,
    spell_slots_max: { 1: 4, 2: 3, 4: 2, 6: 1 },
    spell_slots_used: {},
  });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: ctx.startRoomId, combat_active: true }),
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
        hp: 50,
        maxHp: 50,
        conditions,
        condition_durations: {},
      },
      {
        id: ENEMY,
        isEnemy: true,
        pos: { x: 2, y: 2 },
        hp: 400,
        maxHp: 400,
        conditions: [],
        condition_durations: {},
      },
    ],
  };
}

describe('RAW spell batch — damage spells resolve', () => {
  for (const s of DAMAGE_BATCH) {
    it(`${s.id} damages the target on a failed save`, async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.01); // save rolls 1 → fails → full damage
      const result = await takeAction({
        action: { type: 'cast_spell', spellId: s.id, slotLevel: s.level, targetEnemyId: ENEMY },
        history: [],
        state: casterState(),
        seed,
        context: ctx,
      });
      const hp = result.newState.entities?.find((e) => e.id === ENEMY)?.hp ?? 400;
      expect(hp, `${s.id} should have dealt damage`).toBeLessThan(400);
    });
  }
});

describe('Charm Monster — applies the charmed condition', () => {
  it('charms the target on a failed save', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01); // both Advantage rolls low → fails
    const result = await takeAction({
      action: { type: 'cast_spell', spellId: 'charm_monster', slotLevel: 4, targetEnemyId: ENEMY },
      history: [],
      state: casterState(),
      seed,
      context: ctx,
    });
    const ent = result.newState.entities?.find((e) => e.id === ENEMY && e.isEnemy);
    expect(ent?.conditions).toContain('charmed');
  });
});

describe('Protection from Poison — ward on self', () => {
  it('ends the Poisoned condition and grants poison resistance', async () => {
    const result = await takeAction({
      action: { type: 'cast_spell', spellId: 'protection_from_poison', slotLevel: 2 },
      history: [],
      state: casterState(['poisoned']),
      seed,
      context: ctx,
    });
    const pc = result.newState.characters[0];
    expect(pc.conditions).not.toContain('poisoned');
    expect(pc.spell_resistances).toContain('poison');
  });
});
