// SRD 5.2.1 unique items (batch 12) — spell-canceling and spell-storing items,
// the Dancing Sword, the Helm of Brilliance, the Rods of Lordly Might and
// Security, the Rings of Three Wishes, Spell Turning and Elemental Command, the
// Cube of Force, the Candle of Invocation and the Manuals of Golems.

import { CORRIDOR_ID, makeChar, makeState } from '../../test-fixtures.js';
import type { Character, Enemy, GameState, Seed, Spell } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateChoices, resolveEnemySpell, takeAction } from '../../services/gameEngine.js';
import { CAMPAIGN_SECTION_SCHEMAS } from '../../routes/schemas.js';
import { SRD_ITEMS } from '../../campaignData/srd/items.js';
import { SRD_SPELLS } from '../../campaignData/srd/spells.js';
import { context as baseCtx } from '../fixtures/testContext.js';
import { itemCastOptions } from '../../services/chargedItems.js';
import { syncSetAbilities } from '../../services/wornEffects.js';

afterEach(() => vi.restoreAllMocks());

const lootTable = [...baseCtx.lootTable, ...Object.values(SRD_ITEMS)];
const spellTable = { ...baseCtx.spellTable, ...SRD_SPELLS };
const ctx = { ...baseCtx, lootTable, spellTable };
const FOE = `${CORRIDOR_ID}#0`;

const foe = (over: Partial<Enemy> = {}): Enemy =>
  ({
    id: FOE,
    name: 'Ogre',
    hp: 200,
    ac: 10,
    damage: '1d4',
    toHit: 3,
    xp: 10,
    con: 10,
    wis: 10,
    spellSaveDC: 14,
    ...over,
  }) as Enemy;
const seedWith = (enemy = foe()): Seed => ({
  context_id: ctx.id,
  world_name: 'U',
  ship_name: 'U',
  intro: '',
  seed_id: 'u',
  rooms: [{ id: CORRIDOR_ID, name: 'Hall', desc: '' }],
  enemies: { [CORRIDOR_ID]: [enemy] },
  loot: {},
  npcs: {},
});

/** A level-9 wizard carrying `items` (id → equip slot or null), all attuned. */
function bearer(items: Record<string, string | null>, over: Partial<Character> = {}) {
  const inventory = Object.keys(items).map((id, i) => ({ ...SRD_ITEMS[id], instance_id: `i${i}` }));
  const equipment: Record<string, string> = {};
  Object.values(items).forEach((slot, k) => {
    if (slot) equipment[slot] = `i${k}`;
  });
  const c = makeChar({
    id: 'pc-1',
    name: 'Ilse',
    character_class: 'Wizard',
    level: 9,
    int: 18,
    str: 14,
    dex: 14,
    hp: 60,
    max_hp: 60,
    spell_slots_max: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 1 },
    spell_slots_used: {},
    prepared_spells: ['magic_missile', 'fireball', 'scorching_ray'],
    weapon_proficiencies: ['simple', 'martial'],
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
const calm = (...chars: Character[]): GameState => ({
  ...makeState({ id: chars[0].id }, { current_room: CORRIDOR_ID, combat_active: false }),
  characters: chars,
  active_character_id: chars[0].id,
});

const run = (st: GameState, action: Record<string, unknown>, seed = seedWith()) =>
  takeAction({ action: action as never, history: [], state: st, seed, context: ctx });
const use = (st: GameState, itemId: string) => run(st, { type: 'use', itemId });
const cast = (st: GameState, spellId: string, slotLevel: number, more = {}, seed = seedWith()) =>
  run(
    st,
    { type: 'cast_spell', spellId, slotLevel, itemInstanceId: 'i0', targetEnemyId: FOE, ...more },
    seed
  );
const foeEnt = (st: GameState) => st.entities?.find((e) => e.id === FOE);

// An enemy's single-target / area damage spell for the resolver tests.
const bolt: Spell = {
  id: 'test_bolt',
  name: 'Test Bolt',
  desc: '',
  level: 3,
  castTime: 'action',
  damage: '8d6',
  damageType: 'fire',
  savingThrow: 'dex',
  saveEffect: 'half',
};
const enemySpell = (target: Character, spell: Spell = bolt, party: Character[] = [target]) =>
  resolveEnemySpell({
    enemy: foe(),
    spell,
    target,
    st: calm(...party),
    narrative: '',
    context: ctx,
  });

describe('catalog', () => {
  it('lists the batch-12 items and validates', () => {
    for (const id of [
      'ring_of_three_wishes',
      'cube_of_force',
      'ring_of_spell_turning',
      'rod_of_absorption',
      'ioun_stone_of_greater_absorption',
      'ring_of_spell_storing',
      'ioun_stone_of_reserve',
      'dancing_sword_longsword',
      'helm_of_brilliance',
      'rod_of_lordly_might',
      'rod_of_security',
      'ring_of_elemental_command_fire',
      'candle_of_invocation',
      'manual_of_golems_iron',
      'bag_of_devouring',
    ]) {
      expect(SRD_ITEMS[id], id).toBeDefined();
    }
    const r = CAMPAIGN_SECTION_SCHEMAS.customItems.safeParse(Object.values(SRD_ITEMS));
    expect(r.success, JSON.stringify(r.error?.issues?.slice(0, 3))).toBe(true);
  });
});

describe('canceling and turning spells', () => {
  it('Ring of Spell Turning: a saved spell of level 7 or lower does nothing', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const plain = enemySpell(bearer({}));
    expect(plain.target.hp).toBeLessThan(60);
    const ringed = enemySpell(bearer({ ring_of_spell_turning: 'ring_1' }));
    expect(ringed.target.hp).toBe(60);
    expect(ringed.narrative).toMatch(/Ring of Spell Turning/);
    // A level 8 spell still gets through on a save (half damage).
    const big = enemySpell(bearer({ ring_of_spell_turning: 'ring_1' }), { ...bolt, level: 8 });
    expect(big.target.hp).toBeLessThan(60);
  });

  it('Rod of Absorption: drinks a spell aimed at its bearer alone and stores its levels', () => {
    const c = bearer({ rod_of_absorption: 'off_hand' });
    const r = enemySpell(c);
    expect(r.target.hp).toBe(60);
    expect(r.narrative).toMatch(/Rod of Absorption drinks it in/);
    const rod = r.target.inventory[0];
    expect(rod.absorbed_levels).toBe(3);
    expect(rod.energy).toBe(8); // 5 found + 3
    expect(r.target.turn_actions.reaction_used).toBe(true);
    // An area spell isn't aimed at the bearer alone.
    const area = enemySpell(bearer({ rod_of_absorption: 'off_hand' }), {
      ...bolt,
      blastRadius: 20,
    });
    expect(area.narrative).not.toMatch(/drinks it in/);
  });

  it('Rod of Absorption: stored energy refills an expended slot (up to level 5)', async () => {
    const c = bearer({ rod_of_absorption: 'off_hand' }, { spell_slots_used: { 3: 2 } });
    const r = await use(calm(c), 'rod_of_absorption');
    const me = r.newState.characters[0];
    expect(me.spell_slots_used?.[3]).toBe(1);
    expect(me.inventory[0].energy).toBe(2);
    const none = await use(calm(bearer({ rod_of_absorption: 'off_hand' })), 'rod_of_absorption');
    expect(none.narrative).toMatch(/no expended slot/);
  });

  it('Ioun Stone of Absorption: cancels a level 4 spell for anyone, not a level 5', () => {
    const holder = bearer({ ioun_stone_of_absorption: null });
    const target = makeChar({ id: 'pc-2', name: 'Tam', hp: 60, max_hp: 60 });
    const r = enemySpell(target, { ...bolt, level: 4 }, [target, holder]);
    expect(r.target.hp).toBe(60);
    expect(r.narrative).toMatch(/Ilse's Ioun Stone of Absorption cancels it/);
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const big = enemySpell(target, { ...bolt, level: 5 }, [target, holder]);
    expect(big.target.hp).toBeLessThan(60);
  });

  it('an Ioun Stone of Absorption burns out after 20 levels', () => {
    const c = bearer({ ioun_stone_of_absorption: null });
    c.inventory[0].absorbed_levels = 18;
    const r = enemySpell(c);
    expect(r.narrative).toMatch(/burns out/);
    expect(r.target.inventory).toHaveLength(0);
  });
});

describe('storing spells', () => {
  it('Ring of Spell Storing: cast a spell in, then out with its slot level and DC', async () => {
    const c = bearer({ ring_of_spell_storing: 'ring_1' });
    const stored = await run(calm(c), {
      type: 'cast_spell',
      spellId: 'fireball',
      slotLevel: 3,
      storeInItem: 'i0',
    });
    let me = stored.newState.characters[0];
    expect(stored.narrative).toMatch(/into the Ring of Spell Storing/);
    expect(me.spell_slots_used?.[3]).toBe(1);
    expect(me.inventory[0].stored_spells).toEqual([
      { spellId: 'fireball', level: 3, dc: 16, attack: 8 },
    ]);
    // Only 2 levels of room left.
    const full = await run(stored.newState, {
      type: 'cast_spell',
      spellId: 'fireball',
      slotLevel: 3,
      storeInItem: 'i0',
    });
    expect(full.narrative).toMatch(/room for only 2 more levels/);
    expect(full.newState.characters[0].spell_slots_used?.[3]).toBe(1);
    // Cast it out — no slot spent; the ring empties.
    expect(itemCastOptions(me, lootTable, spellTable).map((o) => o.spell.id)).toEqual(['fireball']);
    vi.spyOn(Math, 'random').mockReturnValue(0);
    // The stored DC rides with the spell, whatever the bearer's own is now.
    const st = fight([{ ...me, int: 10 }], 6);
    const out = await cast(st, 'fireball', 3);
    me = out.newState.characters[0];
    expect(out.narrative).toMatch(/DC 16/);
    expect(foeEnt(out.newState)!.hp).toBeLessThan(200);
    expect(me.spell_slots_used?.[3]).toBe(1);
    expect(me.inventory[0].stored_spells).toBeUndefined();
  });

  it('Ioun Stone of Reserve holds level 1-4 spells only', async () => {
    const c = bearer({ ioun_stone_of_reserve: null }, { spell_slots_max: { 1: 4, 5: 2 } });
    const big = await run(calm(c), {
      type: 'cast_spell',
      spellId: 'fireball',
      slotLevel: 5,
      storeInItem: 'i0',
    });
    expect(big.narrative).toMatch(/level 1 to 4 only/);
  });
});

describe('weapons and rods', () => {
  it('a Dancing Sword strikes as a Bonus Action', () => {
    const c = bearer({ dancing_sword_longsword: 'main_hand' });
    const labels = generateChoices(fight([c], 3), seedWith(), ctx).map((ch) => ch.label);
    expect(labels.some((l) => /Dancing Longsword — quick strike/.test(l))).toBe(true);
  });

  it('Rod of Lordly Might: +3 mace; Drain Life heals half its Necrotic damage', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const c = bearer({ rod_of_lordly_might: 'main_hand' }, { hp: 30 });
    expect(SRD_ITEMS.rod_of_lordly_might.magicBonus).toBe(3);
    const armed = await run(fight([c], 3), {
      type: 'item_power',
      instanceId: 'i0',
      power: 'drain_life',
    });
    const hit = await run(armed.newState, { type: 'attack', targetEnemyId: FOE });
    expect(hit.narrative).toMatch(/Drain Life/);
    expect(hit.narrative).toMatch(/drains \d+ Hit Points/);
    expect(hit.newState.characters[0].hp).toBeGreaterThan(30);
  });

  it('Rod of Lordly Might: Terrify frightens, once per dawn', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const c = bearer({ rod_of_lordly_might: 'main_hand' });
    const r = await cast(fight([c], 3), 'lordly_terrify', 3);
    expect(foeEnt(r.newState)!.conditions).toContain('frightened');
    const again = await cast(r.newState, 'lordly_terrify', 3);
    expect(again.narrative).toMatch(/until dawn/);
  });

  it('Rod of Security: then not again for 10 days', async () => {
    const r = await use(calm(bearer({ rod_of_security: 'off_hand' })), 'rod_of_security');
    expect(r.narrative).toMatch(/demiplane/);
    const again = await use(r.newState, 'rod_of_security');
    expect(again.narrative).toMatch(/still recovering — 10 more Long Rests/);
  });
});

describe('Helm of Brilliance', () => {
  it('Fire Resistance, a blazing weapon, and spells that spend its gems', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const c = bearer({ helm_of_brilliance: 'head' });
    expect(c.worn_traits?.resistances).toContain('fire');
    const r = await cast(fight([c], 6), 'fireball', 3);
    expect(r.narrative).toMatch(/DC 18/);
    expect(r.newState.characters[0].inventory[0].spell_uses).toEqual({ fireball: 1 });
    // Out of diamonds: no more Prismatic Spray.
    const spent = bearer({ helm_of_brilliance: 'head' });
    spent.inventory[0].spell_uses = { prismatic_spray: 5 };
    const ids = itemCastOptions(spent, lootTable, spellTable).map((o) => o.spell.id);
    expect(ids).not.toContain('prismatic_spray');
    expect(ids).toContain('fireball');
    const flames = await cast(fight([c], 6), 'helm_flames', 1, { targetEnemyId: undefined });
    expect(flames.newState.characters[0].weapon_rider).toMatchObject({
      dice: '1d6',
      damageType: 'fire',
    });
  });
});

describe('rings and wishes', () => {
  it('Ring of Elemental Command: bane, focus, and compulsion only over Elementals', async () => {
    const air = bearer({ ring_of_elemental_command_air: 'ring_1' });
    expect(air.worn_traits?.creatureBane).toEqual(['elemental']);
    expect(air.worn_traits?.flyFt).toBe('walk');
    expect(air.worn_traits?.resistances).toContain('lightning');
    const fire = bearer({ ring_of_elemental_command_fire: 'ring_1' });
    expect(fire.worn_traits?.immunities).toContain('fire');
    const earth = bearer({ ring_of_elemental_command_earth: 'ring_1' });
    expect(earth.worn_traits?.ignoresDifficultTerrain).toBe(true);
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const no = await cast(fight([fire]), 'elemental_compulsion', 1);
    expect(no.narrative).toMatch(/no power over the Ogre/);
    const elemental = seedWith(foe({ name: 'Fire Elemental', creatureType: 'elemental' }));
    const yes = await cast(fight([fire]), 'elemental_compulsion', 1, {}, elemental);
    // Charmed through its turn, until the start of the wearer's next one.
    expect(yes.narrative).toMatch(/Fire Elemental is charmed/);
    expect(
      itemCastOptions(fire, lootTable, spellTable).find((o) => o.spell.id === 'fire_storm')?.cost
    ).toBe(4);
  });

  it('Ring of Three Wishes: three Wishes, then it is spent', async () => {
    let st = calm(bearer({ ring_of_three_wishes: 'ring_1' }));
    for (let i = 0; i < 3; i++) {
      st = (
        await run(st, { type: 'cast_spell', spellId: 'wish', slotLevel: 9, itemInstanceId: 'i0' })
      ).newState;
    }
    expect(st.characters[0].inventory).toHaveLength(0);
  });

  it('Cube of Force: charges per face; Shield (a Reaction) isn’t on the menu', () => {
    const c = bearer({ cube_of_force: null });
    const opts = itemCastOptions(c, lootTable, spellTable);
    expect(opts.find((o) => o.spell.id === 'wall_of_force')?.cost).toBe(5);
    const labels = generateChoices(calm(c), seedWith(), ctx).map((ch) => ch.label);
    expect(labels.some((l) => /Cube of Force.*Mage Armor/.test(l))).toBe(true);
    expect(labels.some((l) => /Cube of Force.*Shield/.test(l))).toBe(false);
  });
});

describe('candle and golems', () => {
  it('Candle of Invocation: Advantage for everyone within 30 feet for 4 hours', async () => {
    const a = bearer({ candle_of_invocation: null });
    const b = makeChar({ id: 'pc-2', name: 'Tam', hp: 20, max_hp: 20 });
    const r = await use(calm(a, b), 'candle_of_invocation');
    const [me, ally] = r.newState.characters;
    expect(me.conditions).toContain('candle_of_invocation');
    expect(ally.conditions).toContain('candle_of_invocation');
    expect(me.condition_durations?.candle_of_invocation).toBe(2400);
    expect(me.inventory).toHaveLength(0);
  });

  it('Manual of Golems: a caster with two level 5 slots builds a golem that stays', async () => {
    const weak = bearer({ manual_of_golems_flesh: null }, { gold: 60000 });
    const no = await cast(calm(weak), 'build_flesh_golem', 5, { targetEnemyId: undefined });
    expect(no.narrative).toMatch(/two level 5 spell slots|2 level 5 spell slots/);
    const c = bearer(
      { manual_of_golems_flesh: null },
      { gold: 60000, spell_slots_max: { 1: 4, 5: 2 } }
    );
    const r = await cast(calm(c), 'build_flesh_golem', 5, { targetEnemyId: undefined });
    const ally = r.newState.summoned_allies?.[0];
    expect(ally).toMatchObject({ name: 'Flesh Golem', ownerId: 'pc-1' });
    expect(ally?.fromItem).toBeUndefined();
    expect(r.newState.characters[0].gold).toBe(10000);
    expect(r.newState.characters[0].inventory).toHaveLength(0);
    const rested = await run(r.newState, { type: 'long_rest' });
    expect(rested.newState.summoned_allies?.map((s) => s.name)).toEqual(['Flesh Golem']);
  });
});
