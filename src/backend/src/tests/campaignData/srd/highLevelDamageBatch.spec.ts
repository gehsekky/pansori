// SRD high-level damage/control batch (L6–L9): Chain Lightning, Circle of
// Death, Eyebite, Fire Storm, Delayed Blast Fireball, Sunburst, Meteor Swarm,
// Weird. Each maps onto existing dispatch — single/AoE save damage, dual
// damage (Meteor Swarm), or a single-target condition (Eyebite). Sunburst and
// Weird ship damage-only (their condition rider is deferred — see spells.ts —
// because the AoE path applies a condition to a single target only). Tests
// confirm catalog registration + that casts resolve and deal damage / apply
// the condition through the real cast path.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../../../test-fixtures.js';
import { SRD_SPELLS } from '../../../campaignData/srd/spells.js';
import type { Seed } from '../../../types.js';
import { context as ctx } from '../../fixtures/testContext.js';
import { takeAction } from '../../../services/gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const ENEMY = `entry_hall#0`;

// Damage spells (single-target or AoE) that should reduce enemy HP on a failed save.
const DAMAGE = [
  { id: 'chain_lightning', level: 6, save: 'dex', type: 'lightning' },
  { id: 'circle_of_death', level: 6, save: 'con', type: 'necrotic' },
  { id: 'fire_storm', level: 7, save: 'dex', type: 'fire' },
  { id: 'delayed_blast_fireball', level: 7, save: 'dex', type: 'fire' },
  { id: 'sunburst', level: 8, save: 'con', type: 'radiant' },
  { id: 'meteor_swarm', level: 9, save: 'dex', type: 'fire' },
  { id: 'weird', level: 9, save: 'wis', type: 'psychic' },
] as const;

describe('high-level damage batch — catalog', () => {
  it('registers each damage spell with the expected level, save, and damage type', () => {
    for (const s of DAMAGE) {
      const spell = SRD_SPELLS[s.id];
      expect(spell, s.id).toBeDefined();
      expect(spell.level).toBe(s.level);
      expect(spell.savingThrow).toBe(s.save);
      expect(spell.damageType).toBe(s.type);
      expect(spell.saveEffect).toBe('half');
      expect(spell.damage).toBeTruthy();
    }
  });

  it('Meteor Swarm carries a second (bludgeoning) damage component', () => {
    expect(SRD_SPELLS.meteor_swarm.damage2).toBe('20d6');
    expect(SRD_SPELLS.meteor_swarm.damageType2).toBe('bludgeoning');
  });

  it('Eyebite is a single-target Frightened condition spell (Concentration)', () => {
    const e = SRD_SPELLS.eyebite;
    expect(e.level).toBe(6);
    expect(e.savingThrow).toBe('wis');
    expect(e.condition).toBe('frightened');
    expect(e.concentration).toBe(true);
    expect(e.damage).toBeUndefined();
  });
});

const seed: Seed = {
  context_id: ctx.id,
  world_name: 'High-Level Damage Test',
  ship_name: 'High-Level Damage Test',
  intro: '',
  seed_id: 'hi-dmg',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {
    ['entry_hall']: [
      {
        id: ENEMY,
        name: 'Tarrasque',
        hp: 600,
        ac: 10,
        damage: '1d6',
        toHit: 3,
        xp: 50,
        con: 8,
        dex: 8,
        wis: 8,
      },
    ],
  },
  loot: {},
  npcs: {},
};

function caster(spellId: string) {
  const wiz = makeChar({
    id: 'pc-1',
    character_class: 'Wizard',
    level: 18,
    int: 20,
    hp: 80,
    max_hp: 80,
    spells_known: [spellId],
    prepared_spells: [spellId],
    spell_slots_max: { 6: 1, 7: 1, 8: 1, 9: 1 },
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
        hp: 80,
        maxHp: 80,
        conditions: [],
        condition_durations: {},
      },
      {
        id: ENEMY,
        isEnemy: true,
        pos: { x: 2, y: 2 },
        hp: 600,
        maxHp: 600,
        conditions: [],
        condition_durations: {},
      },
    ],
  };
}

describe('high-level damage batch — deals damage on a failed save', () => {
  for (const s of DAMAGE) {
    it(`${s.id} damages the target`, async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.01); // enemy save rolls 1 → fails
      const r = await takeAction({
        action: { type: 'cast_spell', spellId: s.id, slotLevel: s.level, targetEnemyId: ENEMY },
        history: [],
        state: caster(s.id),
        seed,
        context: ctx,
      });
      const hp = r.newState.entities?.find((e) => e.id === ENEMY)?.hp ?? 600;
      expect(hp, `${s.id} should have dealt damage`).toBeLessThan(600);
    });
  }
});

describe('high-level control — Eyebite', () => {
  it('Frightens the target on a failed save and links concentration', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01); // enemy WIS save fails
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'eyebite', slotLevel: 6, targetEnemyId: ENEMY },
      history: [],
      state: caster('eyebite'),
      seed,
      context: ctx,
    });
    const ent = r.newState.entities?.find((e) => e.id === ENEMY);
    expect(ent?.conditions).toContain('frightened');
    expect(r.newState.characters[0].concentrating_on?.spellId).toBe('eyebite');
  });
});
