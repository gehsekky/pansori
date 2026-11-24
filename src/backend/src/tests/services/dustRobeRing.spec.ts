// SRD 5.2.1 batch 17 — Dust of Sneezing and Choking, the Robe of Scintillating
// Colors, and the Ring of Shooting Stars' Lightning Spheres.

import { CORRIDOR_ID, makeChar, makeState } from '../../test-fixtures.js';
import type { Character, Enemy, GameState, Seed } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateChoices, takeAction } from '../../services/gameEngine.js';
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
    maxHp: 200,
    ac: 10,
    damage: '1d4',
    toHit: 3,
    xp: 100,
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

function hero(id: string, name: string, ids: string[] = []): Character {
  const inventory = ids.map((it, i) => ({ ...SRD_ITEMS[it], instance_id: `i${i}` }));
  const c = makeChar({
    id,
    name,
    character_class: 'Fighter',
    level: 5,
    con: 10,
    wis: 10,
    hp: 40,
    max_hp: 40,
    inventory,
    equipment: ids[0] && SRD_ITEMS[ids[0]].slot ? { [SRD_ITEMS[ids[0]].slot!]: 'i0' } : {},
    attuned_items: inventory.map((i) => i.instance_id),
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
function fight(chars: Character[]): GameState {
  return {
    ...makeState({ id: chars[0].id }, { current_room: CORRIDOR_ID, combat_active: true }),
    characters: chars,
    active_character_id: chars[0].id,
    initiative_order: [
      ...chars.map((c, i) => ({ id: c.id, roll: 18 - i, is_enemy: false })),
      { id: FOE, roll: 5, is_enemy: true },
    ],
    initiative_idx: 0,
    entities: [...chars.map((c, i) => ent(c.id, false, 2 - i, c.hp)), ent(FOE, true, 4)],
  };
}
const calm = (c: Character): GameState => ({
  ...makeState({ id: c.id }, { current_room: CORRIDOR_ID, combat_active: false }),
  characters: [c],
  active_character_id: c.id,
});

const use = (st: GameState, spellId: string, seed = seedWith(), more = {}) =>
  takeAction({
    action: {
      type: 'cast_spell',
      spellId,
      slotLevel: 1,
      itemInstanceId: 'i0',
      targetEnemyId: FOE,
      ...more,
    } as never,
    history: [],
    state: st,
    seed,
    context: ctx,
  });
const who = (st: GameState, id: string) => st.characters.find((c) => c.id === id)!;
/** Give pc-1 a fresh turn (the action passes play on to the next PC). */
const myTurn = (st: GameState): GameState => ({
  ...st,
  active_character_id: 'pc-1',
  initiative_idx: 0,
  characters: st.characters.map((c) =>
    c.id === 'pc-1'
      ? { ...c, turn_actions: { ...c.turn_actions, action_used: false, bonus_action_used: false } }
      : c
  ),
});
const foeEnt = (st: GameState) => st.entities!.find((e) => e.id === FOE)!;
/** Every die rolls the face at `frac` of its range (0 → 1s, 0.99 → max). */
const dice = (frac: number) => vi.spyOn(Math, 'random').mockReturnValue(frac);

describe('Dust of Sneezing and Choking', () => {
  const party = () => [
    hero('pc-1', 'Bram', ['dust_of_sneezing_and_choking']),
    hero('pc-2', 'Ilsa'),
  ];

  it('catches the thrower, nearby allies and enemies; the dust is used up', async () => {
    dice(0); // every save fails
    const r = await use(fight(party()), 'sneezing_dust');
    const bram = who(r.newState, 'pc-1');
    expect(bram.conditions).toContain('incapacitated');
    // Ten failed repeat saves in a row: Incapacitated through ten turns.
    expect(bram.condition_durations?.incapacitated).toBe(11);
    expect(bram.inventory).toHaveLength(0);
    expect(who(r.newState, 'pc-2').conditions).toContain('incapacitated');
    expect(foeEnt(r.newState).conditions).toContain('incapacitated');
    expect(foeEnt(r.newState).save_ends?.incapacitated).toMatchObject({ ability: 'con', dc: 15 });
  });

  it('Undead and other listed types are unaffected; a made save shrugs it off', async () => {
    dice(0);
    const r = await use(fight(party()), 'sneezing_dust', seedWith(foe({ creatureType: 'undead' })));
    expect(foeEnt(r.newState).conditions).not.toContain('incapacitated');
    expect(r.narrative).toContain('unaffected');
    vi.restoreAllMocks();
    dice(0.99);
    const ok = await use(fight(party()), 'sneezing_dust');
    expect(who(ok.newState, 'pc-1').conditions).not.toContain('incapacitated');
    expect(foeEnt(ok.newState).conditions).not.toContain('incapacitated');
  });

  it('out of combat the sneezing just passes', async () => {
    const r = await use(calm(party()[0]), 'sneezing_dust');
    expect(r.narrative).toContain('then it passes');
    expect(who(r.newState, 'pc-1').conditions).not.toContain('incapacitated');
  });
});

describe('Robe of Scintillating Colors', () => {
  const robed = () => hero('pc-1', 'Bram', ['robe_of_scintillating_colors']);

  it('needs attunement and has 3 charges regaining 1d3', () => {
    expect(SRD_ITEMS.robe_of_scintillating_colors.requiresAttunement).toBe(true);
    expect(SRD_ITEMS.robe_of_scintillating_colors.charges).toMatchObject({ max: 3, regain: '1d3' });
  });

  it('attackers have Disadvantage until the next turn; a failed save Stuns', async () => {
    dice(0);
    const r = await use(fight([robed(), hero('pc-2', 'Ilsa')]), 'scintillating_colors');
    const me = who(r.newState, 'pc-1');
    expect(me.conditions).toContain('blurred');
    expect(me.condition_durations?.blurred).toBe(1);
    expect(me.inventory[0].charges_used).toBe(1);
    expect(foeEnt(r.newState).conditions).toContain('stunned');
    expect(foeEnt(r.newState).condition_durations?.stunned).toBe(1);
    // The robe's own line is told once.
    expect(r.narrative.split('robe erupts').length).toBe(2);
  });

  it('a made Wisdom save resists the Stun', async () => {
    dice(0.99);
    const r = await use(fight([robed(), hero('pc-2', 'Ilsa')]), 'scintillating_colors');
    expect(foeEnt(r.newState).conditions).not.toContain('stunned');
    expect(who(r.newState, 'pc-1').conditions).toContain('blurred');
  });
});

describe("Ring of Shooting Stars' Lightning Spheres", () => {
  const ringed = () => hero('pc-1', 'Bram', ['ring_of_shooting_stars']);

  it('are made only in a fight', async () => {
    const st = calm(ringed());
    expect(generateChoices(st, seedWith(), ctx).some((c) => c.label.includes('Lightning'))).toBe(
      false
    );
    const r = await use(st, 'lightning_spheres_2');
    expect(r.narrative).toContain('only worth making in a fight');
  });

  it('cost 2 charges, need Concentration, and are sent one per Bonus Action', async () => {
    // A second PC keeps the turn from wrapping (an enemy hit could break Concentration).
    const made = await use(fight([ringed(), hero('pc-2', 'Ilsa')]), 'lightning_spheres_2');
    let me = who(made.newState, 'pc-1');
    expect(me.inventory[0].charges_used).toBe(2);
    expect(me.concentrating_on?.spellId).toBe('lightning_spheres_2');
    expect(me.lightning_spheres).toEqual({ made: 2, left: 2 });
    const offers = generateChoices(myTurn(made.newState), seedWith(), ctx).filter(
      (c) => c.label.includes('Lightning Sphere —') || c.label.endsWith('Lightning Sphere')
    );
    expect(offers.length).toBeGreaterThan(0);
    expect(
      offers.every((c) => (c.action as { spellId: string }).spellId === 'lightning_sphere_2')
    ).toBe(true);
    expect(offers[0].requiresBonusAction).toBe(true);

    dice(0); // the save fails; 5d4 rolls all 1s
    const hit = await use(myTurn(made.newState), 'lightning_sphere_2');
    expect(foeEnt(hit.newState).hp).toBe(195);
    me = who(hit.newState, 'pc-1');
    expect(me.lightning_spheres?.left).toBe(1);
    expect(me.inventory[0].charges_used).toBe(2);

    const last = await use(myTurn(hit.newState), 'lightning_sphere_2');
    me = who(last.newState, 'pc-1');
    expect(me.lightning_spheres).toBeUndefined();
    expect(me.concentrating_on ?? null).toBeNull();
  });

  it("can't send a sphere it doesn't hold", async () => {
    const r = await use(fight([ringed()]), 'lightning_sphere_1');
    expect(r.narrative).toContain('no Lightning Spheres');
    expect(foeEnt(r.newState).hp).toBe(200);
  });
});
