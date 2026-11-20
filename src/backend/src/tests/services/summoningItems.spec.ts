// SRD 5.2.1 summoning items (batch 10) — Figurines of Wondrous Power, Horns of
// Valhalla, the elemental vessels and gems, the Ring of Djinni Summoning and
// the Staff of the Python. Each calls an ally (out of combat) that joins the
// next battle, reverts at the next Long Rest and is replaced on reuse; the
// Figurines recharge over several Long Rests.

import { CORRIDOR_ID, makeChar, makeState } from '../../test-fixtures.js';
import type { Character, GameState, Seed } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateChoices, seedSummonedAllies, takeAction } from '../../services/gameEngine.js';
import { CAMPAIGN_SECTION_SCHEMAS } from '../../routes/schemas.js';
import { ITEM_POWERS } from '../../campaignData/srd/itemPowers.js';
import { SRD_ITEMS } from '../../campaignData/srd/items.js';
import { SRD_MONSTERS } from '../../campaignData/srd/monsters.js';
import { SRD_SPELLS } from '../../campaignData/srd/spells.js';
import { context as baseCtx } from '../fixtures/testContext.js';
import { regainItemCharges } from '../../services/chargedItems.js';

afterEach(() => vi.restoreAllMocks());

const lootTable = [...baseCtx.lootTable, ...Object.values(SRD_ITEMS)];
const ctx = { ...baseCtx, lootTable, spellTable: { ...baseCtx.spellTable, ...SRD_SPELLS } };
const seed: Seed = {
  context_id: ctx.id,
  world_name: 'S',
  ship_name: 'S',
  intro: '',
  seed_id: 's',
  rooms: [{ id: CORRIDOR_ID, name: 'Hall', desc: '' }],
  enemies: {},
  loot: {},
  npcs: {},
};

function owner(items: Record<string, string | null>, over: Partial<Character> = {}) {
  const inventory = Object.keys(items).map((id, i) => ({
    instance_id: `i${i}`,
    id,
    name: SRD_ITEMS[id].name,
  }));
  const equipment: Record<string, string> = {};
  Object.values(items).forEach((slot, k) => {
    if (slot) equipment[slot] = `i${k}`;
  });
  return makeChar({
    id: 'pc-1',
    name: 'Tam',
    character_class: 'Fighter',
    level: 5,
    hp: 40,
    max_hp: 40,
    inventory,
    equipment,
    attuned_items: inventory.map((i) => i.instance_id),
    ...over,
  });
}

const calm = (c: Character): GameState => ({
  ...makeState({ id: c.id }, { current_room: CORRIDOR_ID, combat_active: false }),
  characters: [c],
  active_character_id: c.id,
});

const use = (st: GameState, spellId: string, itemInstanceId = 'i0') =>
  takeAction({
    action: { type: 'cast_spell', spellId, slotLevel: 1, itemInstanceId } as never,
    history: [],
    state: st,
    seed,
    context: ctx,
  });

describe('catalog', () => {
  it('lists the summoning items and validates', () => {
    for (const id of [
      'figurine_of_wondrous_power_bronze_griffon',
      'figurine_of_wondrous_power_obsidian_steed',
      'horn_of_valhalla_iron',
      'bowl_of_commanding_water_elementals',
      'elemental_gem_emerald',
      'ring_of_djinni_summoning',
      'staff_of_the_python',
    ]) {
      expect(SRD_ITEMS[id], id).toBeDefined();
    }
    const r = CAMPAIGN_SECTION_SCHEMAS.customItems.safeParse(Object.values(SRD_ITEMS));
    expect(r.success, JSON.stringify(r.error?.issues?.slice(0, 3))).toBe(true);
  });

  it('summons use the SRD stat blocks', () => {
    const g = ITEM_POWERS.figurine_bronze_griffon.summon!;
    expect(g).toMatchObject({
      name: 'Griffon',
      ac: SRD_MONSTERS.griffon.ac,
      maxHp: SRD_MONSTERS.griffon.hp,
    });
    expect(ITEM_POWERS.valhalla_iron.summon).toMatchObject({ name: 'Berserker', baseCount: 5 });
  });
});

describe('calling a creature', () => {
  it('a Figurine becomes an ally that joins the next fight', async () => {
    const c = owner({ figurine_of_wondrous_power_bronze_griffon: null });
    const st = calm(c);
    expect(
      generateChoices(st, seed, ctx).some((ch) =>
        /Figurine of Wondrous Power \(Bronze Griffon\) — Bronze Griffon/.test(ch.label)
      )
    ).toBe(true);
    const r = await use(st, 'figurine_bronze_griffon');
    const allies = r.newState.summoned_allies ?? [];
    expect(allies).toHaveLength(1);
    expect(allies[0]).toMatchObject({ name: 'Griffon', fromItem: 'i0', ownerId: 'pc-1' });
    expect(r.narrative).toMatch(/Griffon stands ready/);
    // Combat start puts it on the grid.
    const fight = seedSummonedAllies({
      ...r.newState,
      combat_active: true,
      entities: [
        {
          id: 'pc-1',
          isEnemy: false,
          pos: { x: 2, y: 2 },
          hp: 40,
          maxHp: 40,
          conditions: [],
          condition_durations: {},
        },
      ],
      initiative_order: [{ id: 'pc-1', roll: 10, is_enemy: false }],
    });
    expect(fight.entities?.some((e) => e.id === allies[0].id)).toBe(true);
  });

  it('only out of combat', async () => {
    const c = owner({ figurine_of_wondrous_power_onyx_dog: null });
    const r = await use({ ...calm(c), combat_active: true }, 'figurine_onyx_dog');
    expect(r.newState.summoned_allies ?? []).toHaveLength(0);
  });

  it('Golden Lions come as a pair; a Horn of Valhalla brings its count', async () => {
    const lions = await use(
      calm(owner({ figurine_of_wondrous_power_golden_lions: null })),
      'figurine_golden_lions'
    );
    expect(lions.newState.summoned_allies?.map((a) => a.name)).toEqual(['Lion', 'Lion']);
    const horn = await use(calm(owner({ horn_of_valhalla_bronze: null })), 'valhalla_bronze');
    expect(horn.newState.summoned_allies).toHaveLength(4);
  });

  it('the Obsidian Steed is a mount that only defends itself', async () => {
    const r = await use(
      calm(owner({ figurine_of_wondrous_power_obsidian_steed: null })),
      'figurine_obsidian_steed'
    );
    expect(r.newState.summoned_allies?.[0]).toMatchObject({
      name: 'Nightmare',
      isMount: true,
      noAttack: true,
    });
  });

  it('using the item again replaces its creature; other summons stay', async () => {
    const c = owner({ staff_of_the_python: 'main_hand' });
    const other = {
      id: 'x',
      ownerId: 'pc-1',
      name: 'Skeleton',
      ac: 14,
      maxHp: 13,
      toHit: 5,
      damage: '1d6+3',
    };
    const st = { ...calm(c), summoned_allies: [other] };
    const r1 = await use(st, 'python_staff');
    const r2 = await use(r1.newState, 'python_staff');
    const names = (r2.newState.summoned_allies ?? []).map((a) => a.name).sort();
    expect(names).toEqual(['Giant Constrictor Snake', 'Skeleton']);
  });

  it('the Staff of the Python must be held', async () => {
    const r = await use(calm(owner({ staff_of_the_python: null })), 'python_staff');
    expect(r.narrative).toMatch(/must be holding/);
  });

  it('an Elemental Gem is spent when broken', async () => {
    const r = await use(calm(owner({ elemental_gem_red_corundum: null })), 'summon_fire_elemental');
    expect(r.newState.summoned_allies?.[0].name).toBe('Fire Elemental');
    expect(r.newState.characters[0].inventory).toHaveLength(0);
  });

  it('item creatures leave at the Long Rest; spell summons stay', async () => {
    const r = await use(calm(owner({ ring_of_djinni_summoning: 'ring_1' })), 'djinni_summoning');
    const skeleton = {
      id: 'x',
      ownerId: 'pc-1',
      name: 'Skeleton',
      ac: 14,
      maxHp: 13,
      toHit: 5,
      damage: '1d6+3',
    };
    const st = {
      ...r.newState,
      summoned_allies: [...(r.newState.summoned_allies ?? []), skeleton],
    };
    const rested = await takeAction({
      action: { type: 'long_rest' } as never,
      history: [],
      state: st,
      seed,
      context: ctx,
    });
    expect(rested.newState.summoned_allies?.map((a) => a.name)).toEqual(['Skeleton']);
  });
});

describe('recharging', () => {
  it('a Figurine waits its days (Long Rests) before it works again', async () => {
    const c = owner({ figurine_of_wondrous_power_bronze_griffon: null });
    const r = await use(calm(c), 'figurine_bronze_griffon');
    const me = r.newState.characters[0];
    expect(me.inventory[0].recharge_rests).toEqual({ 'spell:figurine_bronze_griffon': 5 });
    const again = await use(r.newState, 'figurine_bronze_griffon');
    expect(again.narrative).toMatch(/still recovering — 5 more Long Rests/);
    for (let day = 1; day <= 4; day++) {
      regainItemCharges(me, lootTable);
      expect(me.inventory[0].powers_used, `day ${day}`).toEqual(['spell:figurine_bronze_griffon']);
    }
    regainItemCharges(me, lootTable);
    expect(me.inventory[0].powers_used).toBeUndefined();
    expect(me.inventory[0].recharge_rests).toBeUndefined();
  });

  it('a once-per-dawn vessel is back after one Long Rest', async () => {
    const c = owner({ censer_of_controlling_air_elementals: null });
    const r = await use(calm(c), 'summon_air_elemental');
    const me = r.newState.characters[0];
    expect(me.inventory[0].powers_used).toEqual(['spell:summon_air_elemental']);
    regainItemCharges(me, lootTable);
    expect(me.inventory[0].powers_used).toBeUndefined();
  });
});
