// SRD spell batch — Animal Friendship, Giant Insect, Warding Bond, Aura of
// Life. Each maps onto an existing dispatch path:
//   - Animal Friendship → save → Charmed (charm-spell path)
//   - Giant Insect      → summon (beast ally, with cosmetic form variants)
//   - Warding Bond       → ally buff (grantResistances = all damage types)
//   - Aura of Life       → self buff (necrotic resistance + concentration)
// Tests pin catalog registration + that each resolves through the real cast
// path (condition / summoned ally / granted resistances).

import type { Enemy, GameState, Seed } from '../../../src/types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../../../src/test-fixtures.js';
import { SRD_SPELLS } from '../../../src/campaignData/srd/spells.js';
import { context as ctx } from '../../../src/campaignData/sandbox.js';
import { takeAction } from '../../../src/services/gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const ENEMY = `entry_hall#0`;

// ─── Catalog ────────────────────────────────────────────────────────────────

describe('animal/ward batch — catalog', () => {
  it('Animal Friendship is a L1 WIS-save Charmed spell', () => {
    const s = SRD_SPELLS.animal_friendship;
    expect(s.level).toBe(1);
    expect(s.savingThrow).toBe('wis');
    expect(s.saveEffect).toBe('negates');
    expect(s.condition).toBe('charmed');
  });

  it('Giant Insect is a L4 beast summon with three form variants', () => {
    const s = SRD_SPELLS.giant_insect;
    expect(s.level).toBe(4);
    expect(s.outOfCombatOnly).toBe(true);
    expect(s.summon?.name).toBe('Giant Insect');
    expect(s.summon?.variants?.map((v) => v.name)).toEqual([
      'Giant Wasp',
      'Giant Spider',
      'Giant Centipede',
    ]);
  });

  it('Warding Bond grants Resistance to all damage to an ally', () => {
    const s = SRD_SPELLS.warding_bond;
    expect(s.level).toBe(2);
    expect(s.targetType).toBe('self_or_ally');
    expect(s.grantResistances).toContain('fire');
    expect(s.grantResistances).toContain('necrotic');
    expect(s.grantResistances?.length).toBe(13);
  });

  it('Aura of Life is a self necrotic-resistance buff (Concentration)', () => {
    const s = SRD_SPELLS.aura_of_life;
    expect(s.level).toBe(4);
    expect(s.targetType).toBe('self');
    expect(s.concentration).toBe(true);
    expect(s.grantResistances).toEqual(['necrotic']);
  });
});

// ─── Animal Friendship — charm a beast in combat ────────────────────────────

function combatSeed(): Seed {
  const beast: Enemy = {
    id: ENEMY,
    name: 'Dire Wolf',
    hp: 37,
    ac: 14,
    damage: '1d8+3',
    toHit: 5,
    xp: 200,
    wis: 8,
    dex: 12,
    con: 14,
  };
  return {
    context_id: ctx.id,
    world_name: 'Animal/Ward Test',
    ship_name: 'Animal/Ward Test',
    intro: '',
    seed_id: 'animal-ward',
    rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
    enemies: { ['entry_hall']: [beast] },
    loot: {},
    npcs: {},
  };
}

function combatCaster(spellId: string, cls = 'Druid'): GameState {
  const caster = makeChar({
    id: 'pc-1',
    character_class: cls,
    level: 9,
    wis: 18,
    hp: 70,
    max_hp: 70,
    spells_known: [spellId],
    prepared_spells: [spellId],
    spell_slots_max: { 1: 4, 2: 3, 3: 3, 4: 2 },
    spell_slots_used: {},
  });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
    characters: [caster],
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
        hp: 70,
        maxHp: 70,
        conditions: [],
        condition_durations: {},
      },
      {
        id: ENEMY,
        isEnemy: true,
        pos: { x: 5, y: 5 },
        hp: 37,
        maxHp: 37,
        conditions: [],
        condition_durations: {},
      },
    ],
  };
}

describe('Animal Friendship — charms a beast on a failed WIS save', () => {
  it('applies Charmed and records the caster as the charmer', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01); // beast WIS save rolls 1 → fails
    const r = await takeAction({
      action: {
        type: 'cast_spell',
        spellId: 'animal_friendship',
        slotLevel: 1,
        targetEnemyId: ENEMY,
      },
      history: [],
      state: combatCaster('animal_friendship'),
      seed: combatSeed(),
      context: ctx,
    });
    const ent = r.newState.entities?.find((e) => e.id === ENEMY);
    expect(ent?.conditions).toContain('charmed');
    expect(ent?.charmer_id).toBe('pc-1');
  });
});

// ─── Out-of-combat buffs / summon ───────────────────────────────────────────

const quietSeed: Seed = {
  context_id: ctx.id,
  world_name: 'Animal/Ward Test',
  ship_name: 'Animal/Ward Test',
  intro: '',
  seed_id: 'animal-ward-quiet',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {},
  loot: {},
  npcs: {},
};

function quietCaster(spellId: string, cls = 'Cleric'): GameState {
  const caster = makeChar({
    id: 'pc-1',
    character_class: cls,
    level: 9,
    wis: 18,
    spells_known: [spellId],
    prepared_spells: [spellId],
    spell_slots_max: { 1: 4, 2: 3, 3: 3, 4: 2 },
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

describe('Giant Insect — summons a beast ally', () => {
  it('adds a Giant Insect to summoned_allies, honoring the chosen form', async () => {
    const r = await takeAction({
      action: {
        type: 'cast_spell',
        spellId: 'giant_insect',
        slotLevel: 4,
        summonVariant: 'Giant Wasp',
      },
      history: [],
      state: quietCaster('giant_insect', 'Druid'),
      seed: quietSeed,
      context: ctx,
    });
    const bugs = r.newState.summoned_allies ?? [];
    expect(bugs).toHaveLength(1);
    expect(bugs[0].name).toBe('Giant Wasp');
    expect(bugs[0].maxHp).toBe(30);
  });
});

describe('Warding Bond — grants the caster Resistance to all damage', () => {
  it('stamps every damage type onto spell_resistances', async () => {
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'warding_bond', slotLevel: 2 },
      history: [],
      state: quietCaster('warding_bond'),
      seed: quietSeed,
      context: ctx,
    });
    const res = r.newState.characters[0].spell_resistances ?? [];
    expect(res).toContain('fire');
    expect(res).toContain('slashing');
    expect(res).toContain('necrotic');
  });
});

describe('Aura of Life — grants necrotic resistance under concentration', () => {
  it('stamps necrotic resistance + the concentration link', async () => {
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'aura_of_life', slotLevel: 4 },
      history: [],
      state: quietCaster('aura_of_life'),
      seed: quietSeed,
      context: ctx,
    });
    const pc = r.newState.characters[0];
    expect(pc.spell_resistances ?? []).toContain('necrotic');
    expect(pc.concentrating_on?.spellId).toBe('aura_of_life');
  });
});
