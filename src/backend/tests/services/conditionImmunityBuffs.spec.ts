// SRD condition-immunity buffs — Freedom of Movement (L4) and Mind Blank (L8).
// The new mechanic: a buff stamps `Character.condition_immunities`, which
// `conditionImmunitiesFor` folds in alongside paladin-aura immunities so every
// condition-application guard (enemy on-hit auto-apply + save-based, monster
// auras) and the per-turn clear sweep honor it. Cleared at combat end.

import type { Enemy, GameState, Seed } from '../../src/types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { conditionImmunitiesFor, takeAction } from '../../src/services/gameEngine.js';
import { makeChar, makeState } from '../../src/test-fixtures.js';
import { SRD_MONSTERS } from '../../src/campaignData/srd/monsters.js';
import { SRD_SPELLS } from '../../src/campaignData/srd/spells.js';
import { context as ctx } from '../../src/campaignData/sandbox.js';

afterEach(() => vi.restoreAllMocks());

// ─── Catalog ────────────────────────────────────────────────────────────────

describe('condition-immunity buffs — catalog', () => {
  it('Freedom of Movement grants Paralyzed/Restrained/Grappled immunity', () => {
    const s = SRD_SPELLS.freedom_of_movement;
    expect(s.level).toBe(4);
    expect(s.targetType).toBe('self_or_ally');
    expect(s.grantsConditionImmunities).toEqual(['paralyzed', 'restrained', 'grappled']);
  });

  it('Mind Blank grants Charmed immunity', () => {
    const s = SRD_SPELLS.mind_blank;
    expect(s.level).toBe(8);
    expect(s.grantsConditionImmunities).toEqual(['charmed']);
  });
});

// ─── conditionImmunitiesFor — unions buff immunities ────────────────────────

describe('conditionImmunitiesFor', () => {
  it('includes a character’s buff-granted condition immunities', () => {
    const pc = makeChar({ id: 'pc-1', condition_immunities: ['restrained', 'grappled'] });
    const st: GameState = { ...makeState({ id: 'pc-1' }), characters: [pc] };
    const set = conditionImmunitiesFor(pc, st);
    expect(set.has('restrained')).toBe(true);
    expect(set.has('grappled')).toBe(true);
    expect(set.has('paralyzed')).toBe(false);
  });
});

// ─── Casting stamps the immunities ──────────────────────────────────────────

const quietSeed: Seed = {
  context_id: ctx.id,
  world_name: 'Immunity Test',
  ship_name: 'Immunity Test',
  intro: '',
  seed_id: 'immunity',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {},
  loot: {},
  npcs: {},
};

function quietCaster(spellId: string, cls: string, slots: Record<number, number>): GameState {
  const caster = makeChar({
    id: 'pc-1',
    character_class: cls,
    level: 16,
    wis: 18,
    int: 18,
    spells_known: [spellId],
    prepared_spells: [spellId],
    spell_slots_max: slots,
    spell_slots_used: {},
  });
  return {
    ...makeState({ id: 'pc-1' }),
    characters: [caster],
    active_character_id: 'pc-1',
    current_room: 'entry_hall',
    combat_active: false,
  };
}

describe('Freedom of Movement — stamps the immunities on the target', () => {
  it('self-cast grants Paralyzed/Restrained/Grappled immunity', async () => {
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'freedom_of_movement', slotLevel: 4 },
      history: [],
      state: quietCaster('freedom_of_movement', 'Cleric', { 4: 1 }),
      seed: quietSeed,
      context: ctx,
    });
    const imm = r.newState.characters[0].condition_immunities ?? [];
    expect(imm).toEqual(expect.arrayContaining(['paralyzed', 'restrained', 'grappled']));
  });
});

describe('Mind Blank — stamps Charmed immunity', () => {
  it('self-cast grants Charmed immunity', async () => {
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'mind_blank', slotLevel: 8 },
      history: [],
      state: quietCaster('mind_blank', 'Wizard', { 8: 1 }),
      seed: quietSeed,
      context: ctx,
    });
    expect(r.newState.characters[0].condition_immunities ?? []).toContain('charmed');
  });
});

// ─── The immunity blocks an enemy's grapple (integration) ───────────────────

describe('Grapple immunity blocks the Griffon’s auto-grapple Rend', () => {
  it('a Freedom-of-Movement’d PC is not Grappled on a hit', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // the Griffon's attacks hit
    const griffon: Enemy = { ...SRD_MONSTERS.griffon, id: 'gryph#0' };
    const seed: Seed = {
      ...quietSeed,
      enemies: { ['entry_hall']: [griffon] },
    };
    // PC with grapple immunity already active (as Freedom of Movement would set),
    // low AC so the Griffon reliably hits.
    const pc = makeChar({
      id: 'pc-1',
      character_class: 'Fighter',
      level: 12,
      hp: 120,
      max_hp: 120,
      dex: 8,
      ac: 10,
      condition_immunities: ['paralyzed', 'restrained', 'grappled'],
    });
    const state: GameState = {
      ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
      characters: [pc],
      active_character_id: 'pc-1',
      initiative_order: [
        { id: 'pc-1', roll: 18, is_enemy: false },
        { id: 'gryph#0', roll: 5, is_enemy: true },
      ],
      initiative_idx: 0,
      round: 1,
      entities: [
        {
          id: 'pc-1',
          isEnemy: false,
          pos: { x: 4, y: 5 },
          hp: 120,
          maxHp: 120,
          conditions: [],
          condition_durations: {},
        },
        {
          id: 'gryph#0',
          isEnemy: true,
          pos: { x: 5, y: 5 },
          hp: 59,
          maxHp: 59,
          conditions: [],
          condition_durations: {},
        },
      ],
    };
    const r = await takeAction({
      action: { type: 'end_turn' },
      history: [],
      state,
      seed,
      context: ctx,
    });
    // The Griffon hit but the grapple was blocked by the immunity.
    expect(r.narrative).toMatch(/immune to grappled/i);
    expect(r.newState.characters[0].conditions).not.toContain('grappled');
  });
});
