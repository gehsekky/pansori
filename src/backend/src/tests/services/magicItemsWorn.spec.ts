// SRD 5.2.1 worn magic items, batch 1 — resistances and immunities, senses,
// movement, Advantage, and the engine paths they feed (enemy attacks, enemy
// spells, Initiative, grid movement, Speed, Darkvision).

import {
  CORRIDOR_ID,
  makeChar,
  makeState,
  mockRandom,
  seedWithEnemy,
} from '../../test-fixtures.js';
import type { Character, Enemy, GameState, Seed } from '../../types.js';
import { SRD_ITEMS, srdItems } from '../../campaignData/srd/items.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildInitiativeOrder,
  conditionImmunitiesFor,
  effectiveSpeed,
  partyDetectsTrap,
  pcDamageTaken,
  resolveEnemySpell,
  takeAction,
} from '../../services/gameEngine.js';
import { syncSetAbilities, wornAcBonus } from '../../services/wornEffects.js';
import type { ActionContext } from '../../services/actions/types.js';
import { CAMPAIGN_SECTION_SCHEMAS } from '../../routes/schemas.js';
import { context as baseCtx } from '../fixtures/testContext.js';
import { enemyActor } from '../../services/actions/actor.js';
import { handleEnemyAttack } from '../../services/actions/enemyAttack.js';

afterEach(() => vi.restoreAllMocks());

const NEW_ITEMS = [
  'bracers_of_defense',
  'ring_of_fire_resistance',
  'ring_of_cold_resistance',
  'boots_of_the_winterlands',
  'ring_of_warmth',
  'brooch_of_shielding',
  'periapt_of_proof_against_poison',
  'mantle_of_spell_resistance',
  'boots_of_striding_and_springing',
  'ring_of_swimming',
  'gloves_of_swimming_and_climbing',
  'slippers_of_spider_climbing',
  'boots_of_elvenkind',
  'cloak_of_elvenkind',
  'eyes_of_the_eagle',
  'goggles_of_night',
  'sentinel_shield',
];
const lootTable = [...baseCtx.lootTable, ...srdItems(...NEW_ITEMS, 'leather_armor', 'shield')];
const ctx = { ...baseCtx, lootTable };
const GOB = `${CORRIDOR_ID}#0`;

/** A PC wearing (and attuned to) the given items, traits synced. */
function wearing(ids: string[], over: Partial<Character> = {}): Character {
  const inventory = ids.map((id, i) => ({ instance_id: `i${i}`, id, name: SRD_ITEMS[id].name }));
  const equipment: Record<string, string> = {};
  let ring = 1;
  ids.forEach((id, i) => {
    const itemSlot = SRD_ITEMS[id].slot ?? 'neck';
    const slot = itemSlot === 'ring' ? `ring_${ring++}` : itemSlot;
    equipment[slot === 'weapon' ? 'main_hand' : slot] = `i${i}`;
  });
  const c = makeChar({
    id: 'pc-1',
    name: 'Hero',
    character_class: 'Wizard',
    level: 5,
    ac: 12,
    hp: 60,
    max_hp: 60,
    inventory,
    equipment,
    attuned_items: inventory.map((i) => i.instance_id),
    ...over,
  });
  syncSetAbilities(c, lootTable);
  return c;
}

const fight = (char: Character): GameState => ({
  ...makeState({ id: char.id }),
  characters: [char],
  active_character_id: char.id,
  current_room: CORRIDOR_ID,
  visited_rooms: ['entry_hall', CORRIDOR_ID],
  combat_active: true,
  initiative_order: [
    { id: char.id, roll: 20, is_enemy: false },
    { id: GOB, roll: 5, is_enemy: true },
  ],
  initiative_idx: 0,
  entities: [
    {
      id: char.id,
      isEnemy: false,
      pos: { x: 2, y: 2 },
      hp: char.hp,
      maxHp: char.max_hp,
      conditions: [],
      condition_durations: {},
    },
    {
      id: GOB,
      isEnemy: true,
      pos: { x: 3, y: 2 },
      hp: 50,
      maxHp: 50,
      conditions: [],
      condition_durations: {},
    },
  ],
  movement_used: {},
});

describe('catalog', () => {
  it('every new item validates against the campaign item schema', () => {
    const r = CAMPAIGN_SECTION_SCHEMAS.customItems.safeParse(srdItems(...NEW_ITEMS));
    expect(r.success, JSON.stringify(r.error?.issues?.slice(0, 3))).toBe(true);
  });

  it('has a Ring of Resistance for each of the ten damage types', () => {
    for (const t of [
      'acid',
      'cold',
      'fire',
      'force',
      'lightning',
      'necrotic',
      'poison',
      'psychic',
      'radiant',
      'thunder',
    ]) {
      expect(SRD_ITEMS[`ring_of_${t}_resistance`]?.wornEffects).toEqual([
        { kind: 'resistance', damageType: t },
      ]);
    }
  });
});

describe('Bracers of Defense', () => {
  it('+2 AC only with no armor and no Shield', () => {
    expect(wornAcBonus(wearing(['bracers_of_defense']), lootTable)).toBe(2);
    expect(wornAcBonus(wearing(['bracers_of_defense', 'shield']), lootTable)).toBe(0);
    expect(wornAcBonus(wearing(['bracers_of_defense', 'leather_armor']), lootTable)).toBe(0);
  });
});

describe('resistances and immunities', () => {
  it('a Ring of Resistance halves its type only', () => {
    const c = wearing(['ring_of_fire_resistance']);
    const st = fight(c);
    expect(pcDamageTaken(c, st, 20, 'fire')).toBe(10);
    expect(pcDamageTaken(c, st, 20, 'cold')).toBe(20);
  });

  it('the Periapt makes poison damage 0 and Poisoned impossible', () => {
    const c = wearing(['periapt_of_proof_against_poison']);
    expect(pcDamageTaken(c, fight(c), 20, 'poison')).toBe(0);
    expect(conditionImmunitiesFor(c, fight(c)).has('poisoned')).toBe(true);
  });

  it('the Brooch ignores Magic Missile and halves other Force damage', () => {
    const c = wearing(['brooch_of_shielding']);
    expect(pcDamageTaken(c, fight(c), 12, 'force', 'magic_missile')).toBe(0);
    expect(pcDamageTaken(c, fight(c), 12, 'force')).toBe(6);
  });

  it('the Ring of Warmth subtracts 2d8 from Cold damage', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // each d8 = 5
    const c = wearing(['ring_of_warmth']);
    expect(pcDamageTaken(c, fight(c), 20, 'cold')).toBe(10);
  });

  it('resistance applies to an enemy weapon attack', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const brute = {
      id: GOB,
      name: 'Brute',
      hp: 50,
      ac: 10,
      toHit: 100,
      damage: '20',
      damageType: 'fire',
    } as unknown as Enemy;
    const st = fight(wearing(['ring_of_fire_resistance']));
    const c = {
      actor: enemyActor(brute),
      context: ctx,
      st,
      narrative: '',
    } as unknown as ActionContext;
    handleEnemyAttack(c, {
      type: 'enemy_attack',
      targetCharId: 'pc-1',
      advIdx: 0,
      multiattackIdx: 0,
    });
    if (c.enemySubAttack?.outcome !== 'done') throw new Error('expected done');
    expect(c.enemySubAttack.target.hp).toBe(50);
  });

  it('resistance now applies to enemy spells too', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // the save (d20 = 11) fails vs DC 20
    const caster = {
      id: GOB,
      name: 'Mage',
      hp: 40,
      ac: 12,
      toHit: 5,
      damage: '1d4',
      xp: 1,
      spellSaveDC: 20,
    } as Enemy;
    const c = wearing(['ring_of_fire_resistance']);
    const st = { ...fight(c), entities: undefined };
    const r = resolveEnemySpell({
      enemy: caster,
      spell: baseCtx.spellTable!.fireball,
      target: c,
      st,
      narrative: '',
      context: ctx,
    });
    // 8d6 of 4s = 32 fire, failed save, halved by the ring → 16.
    expect(r.target.hp).toBe(60 - 16);
  });
});

describe('Rage resistance is B/P/S only (2024)', () => {
  const raging = (type: string) => {
    const c = makeChar({
      id: 'pc-1',
      character_class: 'Barbarian',
      level: 5,
      hp: 60,
      max_hp: 60,
      conditions: ['raging'],
    });
    return pcDamageTaken(c, fight(c), 20, type);
  };
  it('halves slashing, not fire', () => {
    expect(raging('slashing')).toBe(10);
    expect(raging('fire')).toBe(20);
  });
});

describe('Mantle of Spell Resistance', () => {
  it('rolls enemy spell saves with Advantage', () => {
    // Mind Spike: three d8s for damage, then the save — 1 then 20.
    mockRandom(0.5, 0.5, 0.5, 0, 0.99);
    const caster = {
      id: GOB,
      name: 'Hag',
      hp: 40,
      ac: 12,
      toHit: 5,
      damage: '1d4',
      xp: 1,
      spellSaveDC: 14,
    } as Enemy;
    const c = wearing(['mantle_of_spell_resistance']);
    const r = resolveEnemySpell({
      enemy: caster,
      spell: baseCtx.spellTable!.mind_spike,
      target: c,
      st: fight(c),
      narrative: '',
      context: ctx,
    });
    expect(r.narrative).toMatch(/saves/);
  });
});

describe('Advantage on skills and Initiative', () => {
  it('Eyes of the Eagle add 5 to Passive Perception for spotting traps', () => {
    const trap = { dc: 16 } as never;
    const plain = makeChar({ id: 'a', wis: 12, level: 1, skill_proficiencies: [] }); // passive 11
    expect(partyDetectsTrap([plain], trap)).toBe(false);
    expect(
      partyDetectsTrap(
        [wearing(['eyes_of_the_eagle'], { wis: 12, level: 1, skill_proficiencies: [] })],
        trap
      )
    ).toBe(true);
  });

  it('a Sentinel Shield gives Advantage on Initiative', () => {
    mockRandom(0, 0.99); // 1, then 20
    const [entry] = buildInitiativeOrder([wearing(['sentinel_shield'], { dex: 10 })], []);
    expect(entry.roll).toBe(20);
  });
});

describe('movement and senses', () => {
  it('a Ring of Swimming lets water cost normal movement', async () => {
    const swimSeed: Seed = {
      ...seedWithEnemy,
      rooms: seedWithEnemy.rooms.map((room) =>
        room.id === CORRIDOR_ID
          ? {
              ...room,
              swimTerrain: [
                { x: 2, y: 4 },
                { x: 2, y: 5 },
              ],
            }
          : room
      ),
    };
    const st = fight(wearing(['ring_of_swimming']));
    const r = await takeAction({
      action: { type: 'grid_move', entityId: 'pc-1', to: { x: 2, y: 5 } } as never,
      history: [],
      state: st,
      seed: swimSeed,
      context: ctx,
    });
    expect(r.newState.movement_used?.['pc-1']).toBe(15);
  });

  it('Boots of Striding and Springing set a 30-ft Speed floor', () => {
    expect(effectiveSpeed(wearing([], { speed: 25 }), lootTable)).toBe(25);
    expect(
      effectiveSpeed(wearing(['boots_of_striding_and_springing'], { speed: 25 }), lootTable)
    ).toBe(30);
  });

  it('Goggles of Night grant Darkvision 60 ft, or +60 ft, and restore it when removed', () => {
    expect(wearing(['goggles_of_night'], { darkvision_ft: 0 }).darkvision_ft).toBe(60);
    const elf = wearing(['goggles_of_night'], { darkvision_ft: 60 });
    expect(elf.darkvision_ft).toBe(120);
    elf.equipment = {};
    syncSetAbilities(elf, lootTable);
    expect(elf.darkvision_ft).toBe(60);
    expect(elf.worn_traits).toBeUndefined();
  });

  it('attunement gates an attunement item', () => {
    const c = wearing(['ring_of_fire_resistance', 'boots_of_the_winterlands'], {
      attuned_items: [],
    });
    // The Ring of Resistance needs no attunement; the boots do.
    expect(c.worn_traits?.resistances).toEqual(['fire']);
  });
});
