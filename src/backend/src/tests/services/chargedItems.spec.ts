// SRD 5.2.1 activated magic items — wands and staffs casting spells from their
// charges (held, attuned, no slot), the last-charge d20, dawn recharge on a
// Long Rest, attunement by a spellcaster, and Spell Scrolls (spell list, the
// higher-level check, the scroll's own DC / attack bonus).

import { CORRIDOR_ID, makeChar, makeState } from '../../test-fixtures.js';
import type { Character, Enemy, GameState, Seed } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { attuneBlocker, itemCastOptions, regainItemCharges } from '../../services/chargedItems.js';
import { generateChoices, takeAction } from '../../services/gameEngine.js';
import { CAMPAIGN_SECTION_SCHEMAS } from '../../routes/schemas.js';
import { SRD_ITEMS } from '../../campaignData/srd/items.js';
import { SRD_SPELLS } from '../../campaignData/srd/spells.js';
import { context as baseCtx } from '../fixtures/testContext.js';
import { syncSetAbilities } from '../../services/wornEffects.js';

afterEach(() => vi.restoreAllMocks());

const lootTable = [...baseCtx.lootTable, ...Object.values(SRD_ITEMS)];
const ctx = { ...baseCtx, lootTable, spellTable: { ...baseCtx.spellTable, ...SRD_SPELLS } };
const FOE = `${CORRIDOR_ID}#0`;

const foe = (over: Partial<Enemy> = {}): Enemy =>
  ({ id: FOE, name: 'Ogre', hp: 200, ac: 10, damage: '1d4', toHit: 3, xp: 10, ...over }) as Enemy;

const seedFor = (enemy: Enemy): Seed => ({
  context_id: ctx.id,
  world_name: 'Wands',
  ship_name: 'Wands',
  intro: '',
  seed_id: 'wands',
  rooms: [{ id: CORRIDOR_ID, name: 'Hall', desc: '' }],
  enemies: { [CORRIDOR_ID]: [enemy] },
  loot: {},
  npcs: {},
});

const item = (id: string, i: number, used?: number) => ({
  instance_id: `w${i}`,
  id,
  name: SRD_ITEMS[id].name,
  ...(used ? { charges_used: used } : {}),
});

function wizard(over: Partial<Character> = {}): Character {
  return makeChar({
    id: 'pc-1',
    name: 'Mira',
    character_class: 'Wizard',
    level: 5,
    int: 10,
    hp: 30,
    max_hp: 30,
    spell_slots_max: { 1: 4, 2: 3, 3: 2 },
    spell_slots_used: {},
    ...over,
  });
}

/** `char` holding `itemId` (equipped in `slot`, attuned) in a fight with `enemy`. */
function fight(
  itemId: string,
  opts: { used?: number; slot?: 'off_hand' | 'main_hand' | null; char?: Partial<Character> } = {}
) {
  const it = item(itemId, 0, opts.used);
  const slot =
    opts.slot === undefined
      ? SRD_ITEMS[itemId].slot === 'weapon'
        ? 'main_hand'
        : 'off_hand'
      : opts.slot;
  const c = wizard({
    inventory: [it],
    equipment: slot ? { [slot]: it.instance_id } : {},
    attuned_items: [it.instance_id],
    ...opts.char,
  });
  syncSetAbilities(c, lootTable);
  const st: GameState = {
    ...makeState({ id: 'pc-1' }, { current_room: CORRIDOR_ID, combat_active: true }),
    characters: [c],
    active_character_id: 'pc-1',
    initiative_order: [
      { id: 'pc-1', roll: 18, is_enemy: false },
      { id: FOE, roll: 5, is_enemy: true },
    ],
    initiative_idx: 0,
    entities: [
      {
        id: 'pc-1',
        isEnemy: false,
        pos: { x: 2, y: 2 },
        hp: 30,
        maxHp: 30,
        conditions: [],
        condition_durations: {},
      },
      {
        id: FOE,
        isEnemy: true,
        pos: { x: 4, y: 2 },
        hp: 200,
        maxHp: 200,
        conditions: [],
        condition_durations: {},
      },
    ],
  };
  return st;
}

const cast = (
  st: GameState,
  spellId: string,
  slotLevel: number,
  enemy = foe(),
  instanceId = 'w0'
) =>
  takeAction({
    action: {
      type: 'cast_spell',
      spellId,
      slotLevel,
      targetEnemyId: FOE,
      itemInstanceId: instanceId,
    } as never,
    history: [],
    state: st,
    seed: seedFor(enemy),
    context: ctx,
  });

const foeHp = (st: GameState) => st.entities?.find((e) => e.id === FOE)?.hp;

describe('catalog', () => {
  it('lists wands, staffs and a scroll per spell, all valid', () => {
    for (const id of [
      'wand_of_fireballs',
      'wand_of_the_war_mage_plus_3',
      'staff_of_power',
      'staff_of_the_magi',
      'spell_scroll_fireball',
      'spell_scroll_wish',
    ]) {
      expect(SRD_ITEMS[id], id).toBeDefined();
    }
    for (const it of Object.values(SRD_ITEMS)) {
      for (const s of it.itemSpells ?? [])
        expect(SRD_SPELLS[s.spellId], `${it.id}: ${s.spellId}`).toBeDefined();
      if (it.spellScroll) expect(SRD_SPELLS[it.spellScroll]).toBeDefined();
    }
    expect(SRD_ITEMS.spell_scroll_fireball.value).toBe(300);
    const r = CAMPAIGN_SECTION_SCHEMAS.customItems.safeParse(Object.values(SRD_ITEMS));
    expect(r.success, JSON.stringify(r.error?.issues?.slice(0, 3))).toBe(true);
  });
});

describe('wands and staffs', () => {
  it('casts from charges — no slot spent — and upcasts for extra charges', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const r = await cast(fight('wand_of_magic_missiles'), 'magic_missile', 2);
    const c = r.newState.characters[0];
    expect(r.narrative).toMatch(/from the Wand of Magic Missiles, 2 charges/);
    expect(c.inventory[0].charges_used).toBe(2);
    expect(c.spell_slots_used?.[2] ?? 0).toBe(0);
    expect(foeHp(r.newState)).toBeLessThan(200);
  });

  it('works only while held', async () => {
    const r = await cast(fight('wand_of_magic_missiles', { slot: null }), 'magic_missile', 1);
    expect(r.narrative).toMatch(/must be holding the Wand of Magic Missiles/);
    expect(foeHp(r.newState)).toBe(200);
  });

  it('refuses a cast the charges can’t cover', async () => {
    const r = await cast(fight('wand_of_magic_missiles', { used: 6 }), 'magic_missile', 2);
    expect(r.narrative).toMatch(/has 1 charge — Magic Missile needs 2/);
  });

  it('uses the wand’s fixed save DC', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const r = await cast(fight('wand_of_fireballs'), 'fireball', 3);
    expect(r.narrative).toMatch(/DC 15/);
    expect(r.newState.characters[0].inventory[0].charges_used).toBe(1);
  });

  it('a 1 on the last-charge d20 destroys the wand', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const r = await cast(fight('wand_of_magic_missiles', { used: 6 }), 'magic_missile', 1);
    const c = r.newState.characters[0];
    expect(r.narrative).toMatch(/destroyed/);
    expect(c.inventory).toHaveLength(0);
    expect(c.equipment.off_hand).toBeUndefined();
  });

  it('a spent Staff of Power can fall to a +2 Quarterstaff', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const st = fight('staff_of_power', { used: 19, char: { character_class: 'Wizard' } });
    expect(st.characters[0].worn_traits?.spellAttackBonus).toBe(2);
    const r = await cast(st, 'magic_missile', 1);
    const c = r.newState.characters[0];
    expect(c.inventory[0].id).toBe('quarterstaff_plus_2');
    expect(c.equipment.main_hand).toBe('w0');
    expect(c.worn_traits?.spellAttackBonus).toBeUndefined();
  });

  it('Staff of Healing: Cure Wounds costs a charge per level', async () => {
    const st = fight('staff_of_healing', { char: { character_class: 'Cleric', hp: 5 } });
    const r = await takeAction({
      action: {
        type: 'cast_spell',
        spellId: 'cure_wounds',
        slotLevel: 3,
        itemInstanceId: 'w0',
      } as never,
      history: [],
      state: st,
      seed: seedFor(foe()),
      context: ctx,
    });
    const c = r.newState.characters[0];
    expect(c.inventory[0].charges_used).toBe(3);
    expect(c.hp).toBeGreaterThan(5);
  });

  it('held effects: Staff of Fire resists fire; War Mage adds to spell attacks', () => {
    expect(fight('staff_of_fire').characters[0].worn_traits?.resistances).toContain('fire');
    const wm = fight('wand_of_the_war_mage_plus_3').characters[0].worn_traits;
    expect(wm?.spellAttackBonus).toBe(3);
    expect(wm?.spellIgnoreHalfCover).toBe(true);
  });

  it('offers each castable level in the menu', () => {
    const st = fight('wand_of_fireballs', { used: 5 });
    const labels = generateChoices(st, seedFor(foe()), ctx).map((c) => c.label);
    expect(labels).toContain('Wand of Fireballs — cast Fireball (1 charge)');
    expect(labels).toContain('Wand of Fireballs — cast Fireball (level 4) (2 charges)');
    expect(labels.some((l) => l.includes('(level 5)'))).toBe(false);
  });

  it('regains charges on a Long Rest', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // 1d6+1 → 7
    const c = wizard({ inventory: [item('wand_of_fireballs', 0, 5)] });
    const notes = regainItemCharges(c, lootTable);
    expect(c.inventory[0].charges_used).toBeUndefined();
    expect(notes[0]).toMatch(/regains 5 charges/);
  });

  it('“by a spellcaster” bars a Fighter', () => {
    const fighter = makeChar({ character_class: 'Fighter' });
    expect(attuneBlocker(fighter, SRD_ITEMS.wand_of_fireballs)).toMatch(/spellcaster/);
    expect(attuneBlocker(wizard(), SRD_ITEMS.wand_of_fireballs)).toBeNull();
    expect(attuneBlocker(wizard(), SRD_ITEMS.staff_of_healing)).toMatch(/bard or cleric or druid/);
  });
});

describe('Spell Scrolls', () => {
  const scrollFight = (scroll: string, char: Partial<Character> = {}) =>
    fight(scroll, { slot: null, char: { attuned_items: [], ...char } });

  it('casts a spell the reader can cast, then crumbles', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const r = await cast(scrollFight('spell_scroll_magic_missile'), 'magic_missile', 1);
    expect(r.narrative).toMatch(/crumbles to dust/);
    expect(r.newState.characters[0].inventory).toHaveLength(0);
    expect(r.newState.characters[0].spell_slots_used?.[1] ?? 0).toBe(0);
  });

  it('is unintelligible off your spell list', async () => {
    const st = scrollFight('spell_scroll_fireball', { character_class: 'Cleric' });
    expect(itemCastOptions(st.characters[0], lootTable, ctx.spellTable)).toHaveLength(0);
    const r = await cast(st, 'fireball', 3);
    expect(r.narrative).toMatch(/unintelligible/);
    expect(r.newState.characters[0].inventory).toHaveLength(1);
  });

  it('a higher-level spell needs a check; a failure wipes the scroll', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // d20 = 1
    const low = { spell_slots_max: { 1: 2 } };
    const r = await cast(scrollFight('spell_scroll_fireball', low), 'fireball', 3);
    expect(r.narrative).toMatch(/words fade/);
    expect(r.newState.characters[0].inventory).toHaveLength(0);
    expect(foeHp(r.newState)).toBe(200);
  });

  it('uses the scroll’s attack bonus (+5 for a cantrip)', async () => {
    // d20 = 13: the wizard's own +3 gives 16 (a miss vs AC 18); the scroll's +5 hits.
    vi.spyOn(Math, 'random').mockReturnValue(0.6);
    const r = await cast(scrollFight('spell_scroll_fire_bolt'), 'fire_bolt', 0, foe({ ac: 18 }));
    expect(foeHp(r.newState)).toBeLessThan(200);
    // Control: the same roll with the wizard's own bonus misses.
    const own = await takeAction({
      action: {
        type: 'cast_spell',
        spellId: 'fire_bolt',
        slotLevel: 0,
        targetEnemyId: FOE,
      } as never,
      history: [],
      state: scrollFight('spell_scroll_fire_bolt', { spells_known: ['fire_bolt'] }),
      seed: seedFor(foe({ ac: 18 })),
      context: ctx,
    });
    expect(foeHp(own.newState)).toBe(200);
  });
});
