// SRD 5.2.1 random-table items (batch 13) — the Wand of Wonder's d100 table,
// the Bags of Tricks, the Bag of Beans and the Ivory Goats.

import { CORRIDOR_ID, makeChar, makeState } from '../../test-fixtures.js';
import type { Character, Enemy, GameState, Seed } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateChoices, takeAction } from '../../services/gameEngine.js';
import { ITEM_POWERS } from '../../campaignData/srd/itemPowers.js';
import { SRD_ITEMS } from '../../campaignData/srd/items.js';
import { SRD_SPELLS } from '../../campaignData/srd/spells.js';
import { context as baseCtx } from '../fixtures/testContext.js';
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
    str: 10,
    dex: 10,
    con: 10,
    wis: 10,
    ...over,
  }) as Enemy;
const seedWith = (enemy = foe()): Seed => ({
  context_id: ctx.id,
  world_name: 'R',
  ship_name: 'R',
  intro: '',
  seed_id: 'r',
  rooms: [{ id: CORRIDOR_ID, name: 'Hall', desc: '' }],
  enemies: { [CORRIDOR_ID]: [enemy] },
  loot: {},
  npcs: {},
});

/** A level-5 fighter carrying `ids` (instance `i0`, `i1`, ...), all attuned. */
function bearer(ids: string[], over: Partial<Character> = {}) {
  const inventory = ids.map((id, i) => ({ ...SRD_ITEMS[id], instance_id: `i${i}` }));
  const c = makeChar({
    id: 'pc-1',
    name: 'Bram',
    character_class: 'Fighter',
    level: 5,
    dex: 10,
    hp: 40,
    max_hp: 40,
    gold: 0,
    inventory,
    equipment: { off_hand: 'i0' },
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
  conditions: [] as string[],
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
const cast = (st: GameState, spellId: string, more = {}, seed = seedWith()) =>
  run(
    st,
    {
      type: 'cast_spell',
      spellId,
      slotLevel: 1,
      itemInstanceId: 'i0',
      targetEnemyId: FOE,
      ...more,
    },
    seed
  );
const foeEnt = (st: GameState) => st.entities?.find((e) => e.id === FOE);
const pc = (st: GameState) => st.characters.find((c) => c.id === 'pc-1')!;
/** Force the next d100 to `roll`, then every later die to its lowest face. */
const d100 = (roll: number, ...then: number[]) => {
  const spy = vi.spyOn(Math, 'random').mockReturnValueOnce((roll - 0.5) / 100);
  for (const r of then) spy.mockReturnValueOnce(r);
  spy.mockReturnValue(0);
};

describe('Wand of Wonder', () => {
  const wand = () => fight([bearer(['wand_of_wonder'])]);

  it('is offered in combat against each enemy, costs 1 charge and needs attunement', async () => {
    const choices = generateChoices(wand(), seedWith(), ctx);
    expect(choices.some((c) => c.label.includes('Wand of Wonder — Wonder'))).toBe(true);
    expect(SRD_ITEMS.wand_of_wonder.requiresAttunement).toBe(true);
    expect(SRD_ITEMS.wand_of_wonder.charges).toMatchObject({ max: 7, destroyOnLast: true });
  });

  it('01–20: casts one of five spells — a Fireball at DC 15, with no slot', async () => {
    // d10 = 5 → Fireball; the Ogre fails (d20 = 1) and every die rolls 1.
    d100(16, 0.45);
    const r = await cast(wand(), 'wand_of_wonder');
    expect(r.narrative).toContain('casts Fireball');
    expect(r.narrative).toContain('(from the Wand of Wonder)');
    expect(foeEnt(r.newState)!.hp).toBeLessThan(200);
    expect(pc(r.newState).inventory[0].charges_used).toBe(1);
    expect(pc(r.newState).spell_slots_used ?? {}).toEqual({});
  });

  it('21–25: the wielder is Stunned until their next turn', async () => {
    d100(22);
    const r = await cast(wand(), 'wand_of_wonder');
    // It wears off as their next turn comes round (the Ogre's turn runs first).
    expect(r.narrative).toContain('Stunned until their next turn');
    expect(r.narrative).toContain('Condition cleared: stunned');
  });

  it('31–35: the wielder takes 1d6 Psychic damage', async () => {
    d100(33);
    const r = await cast(wand(), 'wand_of_wonder');
    expect(pc(r.newState).hp).toBe(39);
    expect(r.narrative).toContain('Psychic');
  });

  it('51–55: the target grows (Enlarged)', async () => {
    d100(53);
    const r = await cast(wand(), 'wand_of_wonder');
    expect(foeEnt(r.newState)!.conditions).toContain('enlarged');
  });

  it('69–72: the wielder shrinks (Reduced)', async () => {
    d100(70);
    const r = await cast(wand(), 'wand_of_wonder');
    expect(pc(r.newState).conditions).toContain('reduced');
  });

  it('83–87: the wielder turns Invisible', async () => {
    d100(85);
    const r = await cast(wand(), 'wand_of_wonder');
    expect(pc(r.newState).conditions).toContain('invisible');
  });

  it('88–92: a stream of gems — 1 damage per gem, gathered up as gold', async () => {
    d100(90); // d4 = 1 → 10 gems
    const r = await cast(wand(), 'wand_of_wonder');
    expect(foeEnt(r.newState)!.hp).toBe(190);
    expect(pc(r.newState).gold).toBe(10);
  });

  it('93–97: Polymorph into the rolled form', async () => {
    d100(95, 0.3); // d4 = 2 → Giant Wasp; the Ogre fails its save
    const r = await cast(wand(), 'wand_of_wonder');
    expect(r.narrative).toContain('casts Polymorph');
    expect(foeEnt(r.newState)!.polymorph_state?.formName).toBe('Giant Wasp');
  });

  it('98–00: Restrained, then Petrified when the repeat save fails', async () => {
    d100(99);
    const r = await cast(wand(), 'wand_of_wonder');
    const e = foeEnt(r.newState)!;
    expect(e.conditions).toContain('restrained');
    expect(e.save_ends?.restrained).toMatchObject({ dc: 15, failInto: 'petrified' });
    // The Ogre's next turn re-saves (it has already had its afflicted turn).
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const st = {
      ...r.newState,
      entities: r.newState.entities!.map((x) =>
        x.id === FOE ? { ...x, save_ends_acted: ['restrained'] } : x
      ),
    };
    const next = await run(st, { type: 'end_turn' });
    const after = foeEnt(next.newState)!;
    expect(after.conditions).toContain('petrified');
    expect(after.conditions).not.toContain('restrained');
    expect(after.save_ends?.restrained).toBeUndefined();
  });

  it('roll 36–50 scenery (rain) spends the charge and does nothing else', async () => {
    d100(38);
    const r = await cast(wand(), 'wand_of_wonder');
    expect(r.narrative).toContain('rain');
    expect(foeEnt(r.newState)!.hp).toBe(200);
    expect(pc(r.newState).inventory[0].charges_used).toBe(1);
  });
});

describe('Bags of Tricks', () => {
  it('pull a random creature off the bag’s table; three may stand at once', async () => {
    let st = calm(bearer(['bag_of_tricks_gray']));
    // d8 = 5 → Panther, then d8 = 8 → Giant Elk.
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.55);
    st = (await cast(st, 'bag_of_tricks_gray')).newState;
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.99);
    const r = await cast(st, 'bag_of_tricks_gray');
    const names = (r.newState.summoned_allies ?? []).map((a) => a.name);
    expect(names).toEqual(['Panther', 'Giant Elk']);
    expect(r.narrative).toContain('fuzzy ball');
    expect(pc(r.newState).inventory[0].charges_used).toBe(2);
  });

  it('is spent after three balls until dawn', async () => {
    let st = calm(bearer(['bag_of_tricks_rust']));
    for (let i = 0; i < 3; i++) st = (await cast(st, 'bag_of_tricks_rust')).newState;
    expect(st.summoned_allies).toHaveLength(3);
    const r = await cast(st, 'bag_of_tricks_rust');
    expect(r.newState.summoned_allies).toHaveLength(3);
    expect(SRD_ITEMS.bag_of_tricks_rust.charges).toMatchObject({ max: 3, regain: '3' });
  });

  it('each bag’s table lists eight SRD creatures', async () => {
    for (const color of ['gray', 'rust', 'tan']) {
      expect(ITEM_POWERS[`bag_of_tricks_${color}`].summon?.randomForms).toHaveLength(8);
    }
    expect(ITEM_POWERS.bag_of_tricks_tan.summon?.randomForms?.[7].name).toBe('Tiger');
  });
});

describe('Bag of Beans', () => {
  it('dumped beans burst around the user, who is caught too', async () => {
    // Fails the save (d20 = 1); 5d4 all 1s → 5 Force damage.
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const r = await cast(calm(bearer(['bag_of_beans'])), 'beans_dump');
    expect(pc(r.newState).hp).toBe(35);
    expect(r.narrative).toContain('Force damage');
    expect(pc(r.newState).inventory[0].charges_used).toBe(1);
  });

  it('in a fight, the blast also hits an enemy within 10 feet', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const r = await cast(fight([bearer(['bag_of_beans'])], 3), 'beans_dump');
    expect(pc(r.newState).hp).toBe(35);
    expect(foeEnt(r.newState)!.hp).toBe(195);
  });

  it('an enemy farther than 10 feet is out of the blast', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const r = await cast(fight([bearer(['bag_of_beans'])], 8), 'beans_dump');
    expect(foeEnt(r.newState)!.hp).toBe(200);
  });

  it('a planted bean grows something off the table — a fruit tree yields potions', async () => {
    d100(75, 0.3); // fruit tree; d8 = 3 magic fruits
    const r = await cast(calm(bearer(['bag_of_beans'])), 'beans_plant');
    expect(r.narrative).toContain('fruit tree');
    const potions = pc(r.newState).inventory.filter((i) => i.id.includes('potion'));
    expect(potions).toHaveLength(3);
  });

  it('planting is out of combat only, and the bag runs out of beans', async () => {
    const choices = generateChoices(fight([bearer(['bag_of_beans'])]), seedWith(), ctx);
    expect(choices.some((c) => c.label.includes('Plant a Bean'))).toBe(false);
    expect(choices.some((c) => c.label.includes('Dump the Beans'))).toBe(true);
    let st = calm(bearer(['bag_of_beans']));
    for (let i = 0; i < 7; i++) st = (await cast(st, 'beans_plant')).newState;
    expect(pc(st).inventory.some((i) => i.id === 'bag_of_beans')).toBe(false);
  });
});

describe('Figurine of Wondrous Power (Ivory Goats)', () => {
  const goats = () => calm(bearer(['figurine_of_wondrous_power_ivory_goats']));

  it('each goat is its own creature with its own recharge', async () => {
    let st = goats();
    st = (await cast(st, 'goat_of_travail')).newState;
    st = (await cast(st, 'goat_of_traveling')).newState;
    const r = await cast(st, 'goat_of_terror');
    const allies = r.newState.summoned_allies ?? [];
    expect(allies.map((a) => a.name)).toEqual(['Giant Goat', 'Traveling Goat', 'Giant Goat']);
    expect(allies[1]).toMatchObject({ isMount: true, speed: 60 });
    expect(allies[2]).toMatchObject({ isMount: true, noAttack: true });
    // The Goat of Travail is spent for 30 days.
    const again = await cast(r.newState, 'goat_of_travail');
    expect(again.narrative).toContain('30 more Long Rests');
  });

  it('the Goat of Traveling can be used again at once, replacing itself', async () => {
    let st = (await cast(goats(), 'goat_of_traveling')).newState;
    st = (await cast(st, 'goat_of_traveling')).newState;
    expect(st.summoned_allies).toHaveLength(1);
  });
});
