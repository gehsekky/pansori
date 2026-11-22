// SRD 5.2.1 items whose creatures the party doesn't simply command (batch 16):
// the Efreeti Bottle, the Iron Flask, the Pipes of the Sewers and the
// Mysterious Deck's Skull (Avatar of Death).

import { CORRIDOR_ID, makeChar, makeState } from '../../test-fixtures.js';
import type { Character, Enemy, GameState, Seed } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { endCombatState, generateChoices, takeAction } from '../../services/gameEngine.js';
import { SRD_ITEMS } from '../../campaignData/srd/items.js';
import { SRD_SPELLS } from '../../campaignData/srd/spells.js';
import { context as baseCtx } from '../fixtures/testContext.js';
import { ratsIgnore } from '../../services/actions/castSpell/itemEffects.js';
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
const seedWith = (...enemies: Enemy[]): Seed => ({
  context_id: ctx.id,
  world_name: 'R',
  ship_name: 'R',
  intro: '',
  seed_id: 'r',
  rooms: [{ id: CORRIDOR_ID, name: 'Hall', desc: '' }],
  enemies: { [CORRIDOR_ID]: enemies.length ? enemies : [foe()] },
  loot: {},
  npcs: {},
});
const emptySeed = (): Seed => ({ ...seedWith(), enemies: {} });

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
    xp: 0,
    inventory,
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
function fight(c: Character): GameState {
  return {
    ...makeState({ id: c.id }, { current_room: CORRIDOR_ID, combat_active: true }),
    characters: [c],
    active_character_id: c.id,
    initiative_order: [
      { id: c.id, roll: 18, is_enemy: false },
      { id: FOE, roll: 5, is_enemy: true },
    ],
    initiative_idx: 0,
    entities: [ent(c.id, false, 2, c.hp), ent(FOE, true, 4)],
  };
}
const calm = (c: Character): GameState => ({
  ...makeState({ id: c.id }, { current_room: CORRIDOR_ID, combat_active: false }),
  characters: [c],
  active_character_id: c.id,
});

const use = (st: GameState, spellId: string, seed: Seed, more = {}) =>
  takeAction({
    action: {
      type: 'cast_spell',
      spellId,
      slotLevel: 1,
      itemInstanceId: 'i0',
      ...more,
    } as never,
    history: [],
    state: st,
    seed,
    context: ctx,
  });
const pc = (st: GameState) => st.characters.find((c) => c.id === 'pc-1')!;
/** Every die rolls the face at `frac` of its range (0 → 1s, 0.99 → max). */
const dice = (frac: number) => vi.spyOn(Math, 'random').mockReturnValue(frac);

describe('Efreeti Bottle', () => {
  it('on a 1 the Efreeti attacks its releaser, joining the fight; the bottle is spent', async () => {
    dice(0); // d10 = 1
    const seed = seedWith();
    const r = await use(fight(bearer(['efreeti_bottle'])), 'efreeti_bottle', seed);
    const efreeti = seed.enemies[CORRIDOR_ID].find((e) => e.name === 'Efreeti')!;
    expect(efreeti).toBeDefined();
    const e = r.newState.entities!.find((x) => x.id === efreeti.id)!;
    expect(e.isEnemy).toBe(true);
    expect(e.commanded_target_id).toBe('pc-1');
    // It acts straight after the PC who opened the bottle.
    expect(r.newState.initiative_order.map((x) => x.id)).toEqual(['pc-1', efreeti.id, FOE]);
    expect(pc(r.newState).inventory).toHaveLength(0);
    expect(r.narrative).toContain('turns on Bram');
  });

  it('opened out of combat, a hostile Efreeti starts a fight', async () => {
    dice(0);
    const seed = emptySeed();
    const r = await use(calm(bearer(['efreeti_bottle'])), 'efreeti_bottle', seed);
    expect(r.newState.combat_active).toBe(true);
    const id = seed.enemies[CORRIDOR_ID][0].id;
    expect(r.newState.entities?.find((x) => x.id === id)?.commanded_target_id).toBe('pc-1');
  });

  it('on 2–9 it serves (joining a fight at once) and the stopper stays shut until dawn', async () => {
    dice(0.5); // d10 = 6
    const r = await use(fight(bearer(['efreeti_bottle'])), 'efreeti_bottle', seedWith());
    const ally = r.newState.entities!.find((x) => x.companionName === 'Efreeti');
    expect(ally?.side).toBe('ally');
    expect(r.newState.summoned_allies?.[0].fromItem).toBe('i0:efreeti_bottle');
    expect(pc(r.newState).inventory[0].bottle_opens).toBe(1);
    const again = generateChoices(
      {
        ...r.newState,
        characters: [
          {
            ...pc(r.newState),
            turn_actions: { ...pc(r.newState).turn_actions, action_used: false },
          },
        ],
      },
      seedWith(),
      ctx
    );
    expect(again.some((c) => c.label.includes('Unstopper the Bottle'))).toBe(false);
  });

  it('on a 10 it grants one Wish and the bottle is spent', async () => {
    dice(0.99);
    const r = await use(calm(bearer(['efreeti_bottle'])), 'efreeti_bottle', emptySeed());
    expect(pc(r.newState).deck_wishes).toBe(1);
    expect(pc(r.newState).inventory).toHaveLength(0);
    expect(r.newState.summoned_allies ?? []).toHaveLength(0);
  });

  it('the fourth opening sets it free for good', async () => {
    const c = bearer(['efreeti_bottle']);
    c.inventory[0] = { ...c.inventory[0], bottle_opens: 3 };
    const r = await use(calm(c), 'efreeti_bottle', emptySeed());
    expect(r.narrative).toContain('is gone');
    expect(pc(r.newState).inventory).toHaveLength(0);
    expect(r.newState.summoned_allies ?? []).toHaveLength(0);
  });
});

describe('Iron Flask', () => {
  const fiend = () => foe({ name: 'Bone Devil', creatureType: 'fiend', wis: 1, xp: 2900 });

  it('only creatures from another plane can be targeted', async () => {
    const st = fight(bearer(['iron_flask']));
    const choices = generateChoices(st, seedWith(), ctx);
    expect(choices.some((c) => c.label.includes('Trap a Creature'))).toBe(false);
    const r = await use(st, 'iron_flask_trap', seedWith(), { targetEnemyId: FOE });
    expect(r.narrative).toContain('belongs to this plane');
    expect(pc(r.newState).turn_actions.action_used).toBe(false);
    const fiendChoices = generateChoices(st, seedWith(fiend()), ctx);
    expect(fiendChoices.some((c) => c.label.includes('Trap a Creature'))).toBe(true);
  });

  it('a failed DC 17 Wisdom save traps it: it leaves the fight, counting as defeated', async () => {
    dice(0);
    const r = await use(fight(bearer(['iron_flask'])), 'iron_flask_trap', seedWith(fiend()), {
      targetEnemyId: FOE,
    });
    expect(r.narrative).toContain('into the flask');
    expect(r.newState.enemies_killed).toContain(FOE);
    expect(r.newState.combat_active).toBe(false);
    expect(pc(r.newState).inventory[0].flask_creature).toMatchObject({ name: 'Bone Devil' });
    expect(pc(r.newState).xp).toBe(2900);
  });

  it('a successful save resists, and the flask stays empty', async () => {
    dice(0.99);
    const strong = { ...fiend(), wis: 20 };
    const r = await use(fight(bearer(['iron_flask'])), 'iron_flask_trap', seedWith(strong), {
      targetEnemyId: FOE,
    });
    expect(r.narrative).toContain('resists');
    expect(pc(r.newState).inventory[0].flask_creature).toBeUndefined();
  });

  it('releasing the creature puts it at your command; a full flask can’t trap', async () => {
    const c = bearer(['iron_flask']);
    c.inventory[0] = {
      ...c.inventory[0],
      flask_creature: { name: 'Bone Devil', ac: 16, maxHp: 161, toHit: 8, damage: '2d8+4' },
    };
    const full = generateChoices(fight(c), seedWith(fiend()), ctx);
    expect(full.some((x) => x.label.includes('Trap a Creature'))).toBe(false);
    expect(full.some((x) => x.label.includes('Release the Creature'))).toBe(true);
    const r = await use(calm(c), 'iron_flask_release', emptySeed());
    expect(r.newState.summoned_allies?.[0]).toMatchObject({ name: 'Bone Devil', maxHp: 161 });
    expect(pc(r.newState).inventory[0].flask_creature).toBeUndefined();
    const empty = await use(r.newState, 'iron_flask_release', emptySeed());
    expect(empty.narrative).toContain('The flask is empty');
  });
});

describe('Pipes of the Sewers', () => {
  it('works only in a fight, with 3 charges regaining 1d3', async () => {
    expect(SRD_ITEMS.pipes_of_the_sewers.charges).toMatchObject({ max: 3, regain: '1d3' });
    const st = calm(bearer(['pipes_of_the_sewers']));
    expect(generateChoices(st, emptySeed(), ctx).some((c) => c.label.includes('Swarm'))).toBe(
      false
    );
    const r = await use(st, 'pipes_of_the_sewers', emptySeed());
    expect(r.narrative).toContain('thick of a fight');
  });

  it('a swayed swarm fights for the piper until the battle ends', async () => {
    dice(0); // the swarm's save: 1
    const r = await use(fight(bearer(['pipes_of_the_sewers'])), 'pipes_of_the_sewers', seedWith());
    const ally = r.newState.entities!.find((x) => x.companionName === 'Swarm of Rats');
    expect(ally?.side).toBe('ally');
    expect(pc(r.newState).inventory[0].charges_used).toBe(1);
    expect(endCombatState(r.newState).summoned_allies).toEqual([]);
  });

  it('a swarm that resists the music attacks the party', async () => {
    dice(0.99);
    const seed = seedWith();
    const r = await use(fight(bearer(['pipes_of_the_sewers'])), 'pipes_of_the_sewers', seed);
    const swarm = seed.enemies[CORRIDOR_ID].find((e) => e.name === 'Swarm of Rats')!;
    expect(r.newState.initiative_order.some((x) => x.id === swarm.id)).toBe(true);
    expect(r.newState.entities!.find((x) => x.id === swarm.id)?.isEnemy).toBe(true);
  });

  it('rats leave the attuned piper alone until they are hurt', () => {
    const st = fight(bearer(['pipes_of_the_sewers']));
    const rat = foe({ name: 'Giant Rat' });
    expect(ratsIgnore(st, rat, FOE)).toEqual(['pc-1']);
    expect(ratsIgnore(st, foe(), FOE)).toEqual([]);
    const hurt = {
      ...st,
      entities: st.entities!.map((e) => (e.id === FOE ? { ...e, hp: 10 } : e)),
    };
    expect(ratsIgnore(hurt, rat, FOE)).toEqual([]);
    const unattuned = { ...st, characters: [{ ...pc(st), attuned_items: [] }] };
    expect(ratsIgnore(unattuned, rat, FOE)).toEqual([]);
  });
});

describe("Mysterious Deck's Skull", () => {
  it('an Avatar of Death with half the drawer’s HP maximum appears and hunts them', async () => {
    const spy = vi.spyOn(Math, 'random').mockReturnValueOnce((72 - 0.5) / 100);
    spy.mockReturnValue(0);
    const seed = emptySeed();
    const r = await use(calm(bearer(['mysterious_deck_13'])), 'deck_draw_13', seed);
    expect(r.narrative).toContain('Skull');
    expect(r.newState.combat_active).toBe(true);
    const avatar = seed.enemies[CORRIDOR_ID][0];
    expect(avatar).toMatchObject({ name: 'Avatar of Death', hp: 20, ac: 20, xp: 0 });
    expect(avatar.multiattack).toBe(2); // half of PB 3, rounded up
    expect(r.newState.entities?.find((e) => e.id === avatar.id)?.commanded_target_id).toBe('pc-1');
  });
});
