// SRD 5.2.1 utility and travel items (batch 11) — extradimensional containers,
// flight and mounts, senses, dusts and tokens, and the items whose use is
// described at the table.

import { CORRIDOR_ID, makeChar, makeState } from '../../test-fixtures.js';
import type { Character, Enemy, GameState, Seed } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { effectiveSpeed, generateChoices, takeAction } from '../../services/gameEngine.js';
import { syncSetAbilities, wornSkillAdvantage } from '../../services/wornEffects.js';
import { CAMPAIGN_SECTION_SCHEMAS } from '../../routes/schemas.js';
import { ITEM_POWERS } from '../../campaignData/srd/itemPowers.js';
import { SRD_ITEMS } from '../../campaignData/srd/items.js';
import { SRD_SPELLS } from '../../campaignData/srd/spells.js';
import { applyFallingDamage } from '../../services/damage.js';
import { context as baseCtx } from '../fixtures/testContext.js';
import { potionFlyFt } from '../../services/potions.js';
import { truesightFt } from '../../services/multiclass.js';

afterEach(() => vi.restoreAllMocks());

const lootTable = [...baseCtx.lootTable, ...Object.values(SRD_ITEMS)];
const spellTable = { ...baseCtx.spellTable, ...SRD_SPELLS };
const ctx = { ...baseCtx, lootTable, spellTable };
const FOE = `${CORRIDOR_ID}#0`;

const foe = (over: Partial<Enemy> = {}): Enemy =>
  ({ id: FOE, name: 'Ogre', hp: 200, ac: 10, damage: '1d4', toHit: 3, xp: 10, ...over }) as Enemy;
const seedWith = (enemy = foe(), room: Record<string, unknown> = {}): Seed => ({
  context_id: ctx.id,
  world_name: 'U',
  ship_name: 'U',
  intro: '',
  seed_id: 'u',
  rooms: [{ id: CORRIDOR_ID, name: 'Hall', desc: '', gridWidth: 20, gridHeight: 10, ...room }],
  enemies: { [CORRIDOR_ID]: [enemy] },
  loot: {},
  npcs: {},
});

/** A level-5 character carrying `items` (id → equip slot or null), all attuned. */
function bearer(items: Record<string, string | null>, over: Partial<Character> = {}) {
  const inventory = Object.keys(items).map((id, i) => ({
    ...SRD_ITEMS[id],
    instance_id: `i${i}`,
  }));
  const equipment: Record<string, string> = {};
  Object.values(items).forEach((slot, k) => {
    if (slot) equipment[slot] = `i${k}`;
  });
  const c = makeChar({
    id: 'pc-1',
    name: 'Ada',
    character_class: 'Fighter',
    level: 5,
    dex: 16,
    con: 10,
    hp: 40,
    max_hp: 40,
    speed: 30,
    inventory,
    equipment,
    attuned_items: inventory.map((i) => i.instance_id),
    ...over,
  });
  syncSetAbilities(c, lootTable);
  return c;
}

const ent = (id: string, isEnemy: boolean, x: number, hp = 200) => ({
  id,
  isEnemy,
  pos: { x, y: 2 },
  hp,
  maxHp: hp,
  conditions: [],
  condition_durations: {},
});

function fight(chars: Character[], foeX = 4): GameState {
  return {
    ...makeState({ id: chars[0].id }, { current_room: CORRIDOR_ID, combat_active: true }),
    characters: chars,
    active_character_id: chars[0].id,
    initiative_order: [
      ...chars.map((c, i) => ({ id: c.id, roll: 18 - i, is_enemy: false })),
      { id: FOE, roll: 5, is_enemy: true },
    ],
    initiative_idx: 0,
    entities: [...chars.map((c, i) => ent(c.id, false, 2 - i, c.hp)), ent(FOE, true, foeX)],
  };
}
const calm = (c: Character): GameState => ({
  ...makeState({ id: c.id }, { current_room: CORRIDOR_ID, combat_active: false }),
  characters: [c],
  active_character_id: c.id,
});

const run = (st: GameState, action: Record<string, unknown>, seed = seedWith()) =>
  takeAction({ action: action as never, history: [], state: st, seed, context: ctx });
const use = (st: GameState, itemId: string, seed = seedWith()) =>
  run(st, { type: 'use', itemId }, seed);
const cast = (st: GameState, spellId: string, slotLevel = 1, seed = seedWith(), more = {}) =>
  run(
    st,
    { type: 'cast_spell', spellId, slotLevel, itemInstanceId: 'i0', targetEnemyId: FOE, ...more },
    seed
  );
const foeEnt = (st: GameState) => st.entities?.find((e) => e.id === FOE);
const misc = (lb: number) => ({
  instance_id: `load-${lb}`,
  id: 'load',
  name: 'Load',
  weight: lb,
  type: 'misc',
});

describe('catalog', () => {
  it('lists the batch-11 items and validates', () => {
    for (const id of [
      'bag_of_holding',
      'portable_hole',
      'carpet_of_flying_3x5',
      'broom_of_flying',
      'horseshoes_of_a_zephyr',
      'ring_of_free_action',
      'gem_of_seeing',
      'lantern_of_revealing',
      'dust_of_disappearance',
      'feather_token_whip',
      'well_of_many_worlds',
    ]) {
      expect(SRD_ITEMS[id], id).toBeDefined();
    }
    const r = CAMPAIGN_SECTION_SCHEMAS.customItems.safeParse(Object.values(SRD_ITEMS));
    expect(r.success, JSON.stringify(r.error?.issues?.slice(0, 3))).toBe(true);
    for (const id of ['entangle_rope', 'geyser', 'iron_bands', 'feather_whip']) {
      expect(ITEM_POWERS[id]?.itemPower, id).toBe(true);
    }
  });
});

describe('extradimensional containers', () => {
  it('a Bag of Holding keeps its contents off your back', () => {
    // STR 10: over 100 lb is Heavily Encumbered (−20 ft).
    const loaded = makeChar({ str: 10, speed: 30, inventory: [misc(120)] as never });
    expect(effectiveSpeed(loaded, lootTable)).toBe(10);
    const bag = { ...SRD_ITEMS.bag_of_holding, instance_id: 'b' };
    const bagged = makeChar({ str: 10, speed: 30, inventory: [misc(120), bag] as never });
    expect(effectiveSpeed(bagged, lootTable)).toBe(30);
    // Past its 500 lb the rest counts again: 600 − 500 + 5 (the bag) = 105.
    const over = makeChar({ str: 10, speed: 30, inventory: [misc(600), bag] as never });
    expect(effectiveSpeed(over, lootTable)).toBe(10);
  });

  it('the Efficient Quiver only takes ammunition and weapons', () => {
    const quiver = { ...SRD_ITEMS.efficient_quiver, instance_id: 'q' };
    const arrows = { ...SRD_ITEMS.arrows, instance_id: 'a', count: 60 };
    const withArrows = makeChar({ str: 10, speed: 30, inventory: [arrows, quiver] as never });
    expect(effectiveSpeed(withArrows, lootTable)).toBe(30);
    const withGear = makeChar({ str: 10, speed: 30, inventory: [misc(60), quiver] as never });
    expect(effectiveSpeed(withGear, lootTable)).toBe(20);
  });
});

describe('flight and mounts', () => {
  it('a Carpet of Flying gives its rider the carpet’s Fly Speed', async () => {
    const r = await use(calm(bearer({ carpet_of_flying_3x5: null })), 'carpet_of_flying_3x5');
    expect(potionFlyFt(r.newState.characters[0])).toBe(80);
    const big = await use(calm(bearer({ carpet_of_flying_6x9: null })), 'carpet_of_flying_6x9');
    expect(potionFlyFt(big.newState.characters[0])).toBe(30);
  });

  it('a Broom of Flying needs attunement, then flies at 50 feet', async () => {
    const unattuned = bearer({ broom_of_flying: null }, { attuned_items: [] });
    const no = await use(calm(unattuned), 'broom_of_flying');
    expect(no.narrative).toMatch(/attuned/);
    const r = await use(calm(bearer({ broom_of_flying: null })), 'broom_of_flying');
    expect(potionFlyFt(r.newState.characters[0])).toBe(50);
  });

  it('Horseshoes of Speed add 30 ft to the mount; a Zephyr’s float past rough ground', async () => {
    const rider = (items: Record<string, string | null>) => {
      const c = bearer(items);
      const st = fight([c], 15);
      st.entities = [
        { ...ent(c.id, false, 2, c.hp), mount_id: 'horse' },
        { ...ent('horse', false, 2, 13), speed_ft: 30 },
        ent(FOE, true, 18),
      ];
      return st;
    };
    const plain = await run(rider({}), {
      type: 'grid_move',
      entityId: 'pc-1',
      to: { x: 14, y: 2 },
    });
    expect(plain.narrative).toMatch(/Not enough movement/);
    const shod = await run(rider({ horseshoes_of_speed: null }), {
      type: 'grid_move',
      entityId: 'pc-1',
      to: { x: 14, y: 2 },
    });
    expect(shod.narrative).not.toMatch(/Not enough movement/);
    // Difficult terrain in the way: 6 squares cost 60 ft without the float.
    const mud = seedWith(foe(), {
      difficultTerrain: [3, 4, 5, 6, 7, 8].map((x) => ({ x, y: 2 })),
    });
    const bogged = await run(
      rider({}),
      { type: 'grid_move', entityId: 'pc-1', to: { x: 8, y: 2 } },
      mud
    );
    expect(bogged.narrative).toMatch(/Not enough movement/);
    const floats = await run(
      rider({ horseshoes_of_a_zephyr: null }),
      { type: 'grid_move', entityId: 'pc-1', to: { x: 8, y: 2 } },
      mud
    );
    expect(floats.narrative).not.toMatch(/Not enough movement/);
  });

  it('a Cloak of the Bat flies only in Dim Light or Darkness', async () => {
    const c = bearer({ cloak_of_the_bat: 'cloak' });
    expect(wornSkillAdvantage(c, 'stealth')).toBe(true);
    const pillars = { obstacles: [{ x: 3, y: 2 }] };
    // Flying passes over the pillar; walking has to go around it.
    const lit = await run(
      fight([c], 15),
      { type: 'grid_move', entityId: 'pc-1', to: { x: 3, y: 2 } },
      seedWith(foe(), pillars)
    );
    expect(lit.narrative).toMatch(/No path|obstacle/);
    const dark = await run(
      fight([c], 15),
      { type: 'grid_move', entityId: 'pc-1', to: { x: 4, y: 2 } },
      seedWith(foe(), { ...pillars, lighting: 'dark' })
    );
    expect(dark.newState.entities?.find((e) => e.id === 'pc-1')?.pos).toEqual({ x: 4, y: 2 });
  });
});

describe('rings', () => {
  it('Ring of Free Action: no Slow halving, no Paralyzed / Restrained, no rough-ground cost', async () => {
    const c = bearer({ ring_of_free_action: 'ring_1' }, { conditions: ['slowed'] });
    expect(effectiveSpeed(c, lootTable)).toBe(30);
    expect(c.worn_traits?.conditionImmunities).toEqual(['paralyzed', 'restrained']);
    const free = bearer({ ring_of_free_action: 'ring_1' });
    const mud = seedWith(foe(), { difficultTerrain: [3, 4, 5, 6].map((x) => ({ x, y: 2 })) });
    const r = await run(
      fight([free], 15),
      { type: 'grid_move', entityId: 'pc-1', to: { x: 6, y: 2 } },
      mud
    );
    expect(r.newState.movement_used?.['pc-1']).toBe(20);
  });

  it('Ring of Feather Falling: no falling damage', () => {
    const c = bearer({ ring_of_feather_falling: 'ring_1' });
    const r = applyFallingDamage(c, 60, calm(c));
    expect(r.amountDealt).toBe(0);
    expect(r.narrative).toMatch(/drifts gently/);
  });

  it('Ring of X-ray Vision: a second use before a Long Rest risks Exhaustion', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const c = bearer({ ring_of_x_ray_vision: 'ring_1' });
    const first = await use(calm(c), 'ring_of_x_ray_vision');
    expect(first.newState.characters[0].exhaustion_level ?? 0).toBe(0);
    const second = await use(first.newState, 'ring_of_x_ray_vision');
    expect(second.newState.characters[0].exhaustion_level).toBe(1);
    expect(second.narrative).toMatch(/Exhaustion/);
  });
});

describe('senses', () => {
  it('Gem of Seeing: a charge buys 10 minutes of Truesight 120 ft', async () => {
    const r = await use(calm(bearer({ gem_of_seeing: 'off_hand' })), 'gem_of_seeing');
    const me = r.newState.characters[0];
    expect(truesightFt(me)).toBe(120);
    expect(me.condition_durations?.gem_of_seeing).toBe(100);
    expect(me.inventory[0].charges_used).toBe(1);
  });

  it('Lantern of Revealing lights the way and shows the Invisible; Eyes of Minute Seeing', () => {
    const c = bearer({ lantern_of_revealing: 'off_hand', eyes_of_minute_seeing: 'head' });
    expect(c.worn_traits?.revealInvisibleFt).toBe(30);
    expect(wornSkillAdvantage(c, 'investigation')).toBe(true);
  });

  it('Sending Stones cast Sending once a day', async () => {
    const c = bearer({ sending_stones: null });
    const r = await cast(calm(c), 'sending', 3, seedWith(), { targetEnemyId: undefined });
    expect(r.newState.characters[0].inventory[0].powers_used).toContain('spell:sending');
  });
});

describe('dusts, water, light and bands', () => {
  it('Dust of Disappearance turns you and nearby allies Invisible for the same time', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const a = bearer({ dust_of_disappearance: null });
    const b = makeChar({ id: 'pc-2', name: 'Bo', hp: 20, max_hp: 20 });
    const r = await use(fight([a, b]), 'dust_of_disappearance');
    const [me, ally] = r.newState.characters;
    expect(me.conditions).toContain('invisible');
    expect(ally.conditions).toContain('invisible');
    // 2d4 at 0.5 → 6 minutes = 60 rounds, the same for both.
    expect(me.condition_durations?.invisible).toBe(60);
    expect(ally.condition_durations?.invisible).toBe(60);
    expect(me.inventory).toHaveLength(0);
  });

  it('Dust of Dryness works only on a creature made of water', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const c = bearer({ dust_of_dryness: null });
    const no = await cast(fight([c], 3), 'dryness_dust');
    expect(no.narrative).toMatch(/no power over the Ogre/);
    expect(no.newState.characters[0].inventory[0].charges_used).toBeUndefined();
    const water = seedWith(foe({ name: 'Water Elemental' }));
    const r = await cast(fight([c], 3), 'dryness_dust', 1, water);
    expect(foeEnt(r.newState)!.hp).toBe(190);
    expect(r.newState.characters[0].inventory[0].charges_used).toBe(1);
  });

  it('Decanter of Endless Water: a geyser knocks a creature Prone', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const c = bearer({ decanter_of_endless_water: 'off_hand' });
    const r = await cast(fight([c]), 'geyser');
    expect(foeEnt(r.newState)!.conditions).toContain('prone');
    expect(r.narrative).toMatch(/DC 13/);
  });

  it('Rope of Entanglement: DC 15 Dex save or Restrained (save-ends)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const c = bearer({ rope_of_entanglement: 'off_hand' });
    const r = await cast(fight([c]), 'entangle_rope');
    const e = foeEnt(r.newState)!;
    expect(e.conditions).toContain('restrained');
    expect(e.save_ends?.restrained).toMatchObject({ ability: 'dex', dc: 15 });
  });

  it('Gem of Brightness: a 1-charge beam Blinds; the flare costs 5', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const c = bearer({ gem_of_brightness: 'off_hand' });
    const beam = await cast(fight([c]), 'brightness_beam');
    expect(foeEnt(beam.newState)!.conditions).toContain('blinded');
    const flare = await cast(fight([c], 3), 'brightness_flare');
    expect(foeEnt(flare.newState)!.conditions).toContain('blinded');
    expect(flare.newState.characters[0].inventory[0].charges_used).toBe(5);
  });

  it('Iron Bands: Dex + PB to hit, Restrained until a DC 20 Strength escape; once a day', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9);
    const c = bearer({ iron_bands: null });
    const r = await cast(fight([c]), 'iron_bands');
    // DEX 16 (+3) + PB 3 = +6.
    expect(r.narrative).toMatch(/\+6/);
    const e = foeEnt(r.newState)!;
    expect(e.conditions).toContain('restrained');
    expect(e.save_ends?.restrained).toMatchObject({ ability: 'str', dc: 20 });
    const again = await cast(r.newState, 'iron_bands');
    expect(again.narrative).toMatch(/until dawn/);
  });
});

describe('feather tokens and table-color items', () => {
  it('the Whip token conjures a whip that strikes at +9 and again as a Bonus Action', async () => {
    // A d20 of 2: +9 hits AC 10 (a Fighter's own +3 spell attack wouldn't).
    vi.spyOn(Math, 'random').mockReturnValue(0.05);
    const c = bearer({ feather_token_whip: null });
    const r = await cast(fight([c]), 'feather_whip');
    const me = r.newState.characters[0];
    expect(me.inventory).toHaveLength(0);
    expect(me.recurring_attack).toMatchObject({ name: 'Floating Whip', attackBonus: 9 });
    expect(r.narrative).toMatch(/Floating Whip strikes the Ogre for 6 force/);
    // Next turn: the whip strikes again as a Bonus Action, still at +9.
    const next: GameState = {
      ...r.newState,
      active_character_id: 'pc-1',
      initiative_idx: 0,
      characters: [{ ...me, turn_actions: {} as never }],
    };
    const again = await run(next, { type: 'recurring_spell_attack', targetEnemyId: FOE });
    expect(again.narrative).toMatch(/Floating Whip strikes the Ogre/);
    expect(again.newState.characters[0].turn_actions.bonus_action_used).toBe(true);
  });

  it('the Bird token calls a Roc that carries you but can’t attack', async () => {
    const r = await cast(
      calm(bearer({ feather_token_bird: null })),
      'feather_bird',
      1,
      seedWith(),
      {
        targetEnemyId: undefined,
      }
    );
    expect(r.newState.summoned_allies?.[0]).toMatchObject({
      name: 'Roc',
      isMount: true,
      noAttack: true,
    });
    expect(r.newState.characters[0].inventory).toHaveLength(0);
  });

  it('a Folding Boat unfolds at the table; Sovereign Glue runs out', async () => {
    const boat = await use(calm(bearer({ folding_boat: null })), 'folding_boat');
    expect(boat.narrative).toMatch(/unfolds into a boat/);
    let st = calm(bearer({ sovereign_glue: null }));
    for (let i = 0; i < 4; i++) st = (await use(st, 'sovereign_glue')).newState;
    expect(st.characters[0].inventory).toHaveLength(0);
  });

  it('narrative items show up as choices', () => {
    const c = bearer({ immovable_rod: null, eversmoking_bottle: null });
    const labels = generateChoices(calm(c), seedWith(), ctx).map((ch) => ch.label);
    expect(labels.some((l) => /Immovable Rod/.test(l))).toBe(true);
    expect(labels.some((l) => /Eversmoking Bottle/.test(l))).toBe(true);
  });
});
