// SRD 5.2.1 activated items, round 2 (batch 9) — item powers that aren't
// spells (Wand of Paralysis, Ring of the Ram, Horn of Blasting, Bead of Force,
// Pipes of Haunting, Rod of Rulership, Shooting Stars), Boots of Speed, Gloves
// of Missile Snaring, Ring of Evasion and the Ring / Cloak of Invisibility.

import { CORRIDOR_ID, makeChar, makeState } from '../../test-fixtures.js';
import type { Character, Enemy, GameState, Seed } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  effectiveSpeed,
  generateChoices,
  resolveEnemySpell,
  takeAction,
} from '../../services/gameEngine.js';
import type { ActionContext } from '../../services/actions/types.js';
import { CAMPAIGN_SECTION_SCHEMAS } from '../../routes/schemas.js';
import { ITEM_POWERS } from '../../campaignData/srd/itemPowers.js';
import { SRD_ITEMS } from '../../campaignData/srd/items.js';
import { SRD_SPELLS } from '../../campaignData/srd/spells.js';
import { context as baseCtx } from '../fixtures/testContext.js';
import { enemyActor } from '../../services/actions/actor.js';
import { handleEnemyAttack } from '../../services/actions/enemyAttack.js';
import { itemCastOptions } from '../../services/chargedItems.js';
import { syncSetAbilities } from '../../services/wornEffects.js';

afterEach(() => vi.restoreAllMocks());

const lootTable = [...baseCtx.lootTable, ...Object.values(SRD_ITEMS)];
const spellTable = { ...baseCtx.spellTable, ...SRD_SPELLS };
const ctx = { ...baseCtx, lootTable, spellTable };
const FOE = `${CORRIDOR_ID}#0`;
const FOE2 = `${CORRIDOR_ID}#1`;

const foe = (over: Partial<Enemy> = {}): Enemy =>
  ({ id: FOE, name: 'Ogre', hp: 200, ac: 10, damage: '1d4', toHit: 3, xp: 10, ...over }) as Enemy;
const seedWith = (...enemies: Enemy[]): Seed => ({
  context_id: ctx.id,
  world_name: 'W4',
  ship_name: 'W4',
  intro: '',
  seed_id: 'w4',
  rooms: [{ id: CORRIDOR_ID, name: 'Hall', desc: '' }],
  enemies: { [CORRIDOR_ID]: enemies.length ? enemies : [foe()] },
  loot: {},
  npcs: {},
});

/** A level-5 caster carrying `items` (id → equip slot or null), all attuned. */
function bearer(items: Record<string, string | null>, over: Partial<Character> = {}) {
  const inventory = Object.keys(items).map((id, i) => ({
    instance_id: `i${i}`,
    id,
    name: SRD_ITEMS[id].name,
  }));
  const equipment: Record<string, string> = {};
  Object.values(items).forEach((slot, k) => {
    if (slot) equipment[slot] = `i${k}`;
  });
  const c = makeChar({
    id: 'pc-1',
    name: 'Mira',
    character_class: 'Wizard',
    level: 5,
    int: 16,
    dex: 14,
    hp: 40,
    max_hp: 40,
    spell_slots_max: { 1: 4, 2: 3, 3: 2 },
    spell_slots_used: {},
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

function fight(c: Character, foeX = 4, extra: ReturnType<typeof ent>[] = []): GameState {
  return {
    ...makeState({ id: c.id }, { current_room: CORRIDOR_ID, combat_active: true }),
    characters: [c],
    active_character_id: c.id,
    initiative_order: [
      { id: c.id, roll: 18, is_enemy: false },
      { id: FOE, roll: 5, is_enemy: true },
    ],
    initiative_idx: 0,
    entities: [ent(c.id, false, 2, c.hp), ent(FOE, true, foeX), ...extra],
  };
}

const run = (st: GameState, action: Record<string, unknown>, seed = seedWith()) =>
  takeAction({ action: action as never, history: [], state: st, seed, context: ctx });
const cast = (st: GameState, spellId: string, slotLevel: number, more = {}, seed = seedWith()) =>
  run(
    st,
    { type: 'cast_spell', spellId, slotLevel, itemInstanceId: 'i0', targetEnemyId: FOE, ...more },
    seed
  );
const foeEnt = (st: GameState, id = FOE) => st.entities?.find((e) => e.id === id);

describe('catalog', () => {
  it('lists the batch-9 items and validates', () => {
    for (const id of [
      'wand_of_paralysis',
      'ring_of_the_ram',
      'horn_of_blasting',
      'bead_of_force',
      'pipes_of_haunting',
      'rod_of_rulership',
      'boots_of_speed',
      'gloves_of_missile_snaring',
      'ring_of_evasion',
      'ring_of_invisibility',
      'cloak_of_invisibility',
    ]) {
      expect(SRD_ITEMS[id], id).toBeDefined();
    }
    const r = CAMPAIGN_SECTION_SCHEMAS.customItems.safeParse(Object.values(SRD_ITEMS));
    expect(r.success, JSON.stringify(r.error?.issues?.slice(0, 3))).toBe(true);
  });

  it('item powers are not spells: off every list and out of the spell table', () => {
    for (const p of Object.values(ITEM_POWERS)) {
      expect(p.itemPower).toBe(true);
      expect(p.spellList ?? []).toEqual([]);
      expect(SRD_SPELLS[p.id], p.id).toBeUndefined();
    }
  });

  it('a power can only be used through its item', async () => {
    const c = bearer({});
    const r = await run(fight(c), {
      type: 'cast_spell',
      spellId: 'paralysis_ray',
      slotLevel: 2,
      targetEnemyId: FOE,
    });
    expect(r.narrative).toMatch(/Unknown spell/);
  });
});

describe('item powers', () => {
  it('Wand of Paralysis: a failed DC 15 Con save Paralyzes, with a save each turn', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const c = bearer({ wand_of_paralysis: 'off_hand' });
    const st = fight(c);
    const choice = generateChoices(st, seedWith(), ctx).find((ch) =>
      /Wand of Paralysis — Paralysis Ray/.test(ch.label)
    );
    expect(choice).toBeDefined();
    const r = await cast(st, 'paralysis_ray', 2);
    const e = foeEnt(r.newState)!;
    expect(r.narrative).toMatch(/DC 15/);
    expect(e.conditions).toContain('paralyzed');
    expect(e.save_ends?.paralyzed).toMatchObject({ ability: 'con', dc: 15 });
    expect(r.newState.characters[0].inventory[0].charges_used).toBe(1);
  });

  it('Ring of the Ram: +7 to hit, 2d10 Force per charge', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const c = bearer({ ring_of_the_ram: 'ring_1' }, { int: 20 });
    expect(
      itemCastOptions(c, lootTable, spellTable).map((o) => `${o.spell.id}@${o.level}:${o.cost}`)
    ).toEqual(['ram_strike@1:1', 'ram_strike@2:2', 'ram_strike@3:3']);
    const r = await cast(fight(c), 'ram_strike', 3);
    expect(r.narrative).toMatch(/\+7/);
    expect(r.newState.characters[0].inventory[0].charges_used).toBe(3);
    // 6d10 at 0.5 → 6 × 6 = 36.
    expect(200 - foeEnt(r.newState)!.hp).toBe(36);
  });

  it('Horn of Blasting: Thunder and Deafened in the cone; it can explode', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const c = bearer({ horn_of_blasting: 'off_hand' });
    const r = await cast(fight(c, 3), 'horn_blast', 3);
    const e = foeEnt(r.newState)!;
    expect(e.hp).toBeLessThan(200);
    expect(e.conditions).toContain('deafened');
    // d100 = 1 ≤ 20 → the horn explodes: 10d6 Force (all 1s) on the user.
    const me = r.newState.characters[0];
    expect(r.narrative).toMatch(/explodes/);
    expect(me.inventory).toHaveLength(0);
    expect(me.hp).toBe(30);
  });

  it('Horn of Blasting: no explosion on a high d100', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9);
    const c = bearer({ horn_of_blasting: 'off_hand' });
    const r = await cast(fight(c, 3), 'horn_blast', 3);
    expect(r.newState.characters[0].inventory).toHaveLength(1);
    expect(r.narrative).not.toMatch(/explodes/);
  });

  it('Bead of Force: a DC 15 Dex save or 5d4 Force; the pouch empties', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const c = bearer({ bead_of_force: null });
    const r = await cast(fight(c), 'force_bead', 3);
    expect(foeEnt(r.newState)!.hp).toBe(195);
    expect(r.newState.characters[0].inventory[0].charges_used).toBe(1);
  });

  it('Pipes of Haunting: frightens enemies within 30 ft of the piper only', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const c = bearer({ pipes_of_haunting: 'off_hand' });
    const st = fight(c, 4, [ent(FOE2, true, 12)]);
    const seed = seedWith(foe(), foe({ id: FOE2, name: 'Far Ogre' }));
    const r = await cast(st, 'haunting_tune', 2, {}, seed);
    expect(foeEnt(r.newState)!.conditions).toContain('frightened');
    expect(foeEnt(r.newState, FOE2)!.conditions).not.toContain('frightened');
    expect(foeEnt(r.newState)!.save_ends?.frightened).toMatchObject({ ability: 'wis', dc: 15 });
  });

  it('Rod of Rulership: Charms for 8 hours, once per dawn', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const c = bearer({ rod_of_rulership: 'off_hand' });
    const r = await cast(fight(c), 'rulership', 4);
    const e = foeEnt(r.newState)!;
    expect(e.conditions).toContain('charmed');
    expect(e.charmer_id).toBe('pc-1');
    expect(r.newState.characters[0].inventory[0].powers_used).toContain('spell:rulership');
  });

  it('Ring of Shooting Stars: 5d4 Radiant per charge', () => {
    const c = bearer({ ring_of_shooting_stars: 'ring_1' });
    const opts = itemCastOptions(c, lootTable, spellTable)
      .filter((o) => o.spell.id === 'shooting_stars')
      .map((o) => o.cost);
    expect(opts).toEqual([1, 2, 3]);
  });
});

describe('Boots of Speed', () => {
  it('a Bonus Action doubles Speed for 10 minutes, once per Long Rest', async () => {
    const c = bearer({ boots_of_speed: 'feet' }, { speed: 30 });
    const st = fight(c);
    const choice = generateChoices(st, seedWith(), ctx).find((ch) =>
      /Boots of Speed/.test(ch.label)
    );
    expect(choice?.requiresBonusAction).toBe(true);
    const r = await run(st, { type: 'use', itemId: 'boots_of_speed' });
    const me = r.newState.characters[0];
    expect(me.conditions).toContain('boots_of_speed');
    expect(me.condition_durations?.boots_of_speed).toBe(100);
    expect(effectiveSpeed(me, lootTable)).toBe(60);
    expect(me.turn_actions.bonus_action_used).toBe(true);
    expect(me.turn_actions.action_used).toBeFalsy();
    const again = await run(r.newState, { type: 'use', itemId: 'boots_of_speed' });
    expect(again.narrative).toMatch(/Bonus Action|until dawn/);
  });
});

describe('reactions', () => {
  const archer = { ...foe({ toHit: 20, damage: '12' }), damageType: 'piercing', attackReachFt: 80 };
  const shoot = (c: Character) => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const actx = {
      actor: enemyActor(archer as Enemy),
      context: ctx,
      st: fight(c),
      narrative: '',
    } as unknown as ActionContext;
    handleEnemyAttack(actx, {
      type: 'enemy_attack',
      targetCharId: 'pc-1',
      advIdx: 0,
      multiattackIdx: 0,
    });
    if (actx.enemySubAttack?.outcome !== 'done') throw new Error('expected done');
    return actx.enemySubAttack.target;
  };

  it('Gloves of Missile Snaring cut a ranged hit by 1d10 + DEX, spending the Reaction', () => {
    const t = shoot(bearer({ gloves_of_missile_snaring: 'hands' }));
    // 1d10 at 0.5 → 6, +2 DEX → 8 off the 12.
    expect(t.hp).toBe(36);
    expect(t.turn_actions.reaction_used).toBe(true);
  });

  it('no snare without the Reaction', () => {
    const c = bearer({ gloves_of_missile_snaring: 'hands' });
    const t = shoot({ ...c, turn_actions: { ...c.turn_actions, reaction_used: true } });
    expect(t.hp).toBe(28);
  });

  it('Ring of Evasion turns a failed Dex save into a success for a charge', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const c = bearer({ ring_of_evasion: 'ring_1' });
    const caster = foe({ spellSaveDC: 15 } as Partial<Enemy>);
    const st = fight(c);
    const res = resolveEnemySpell({
      enemy: caster,
      spell: SRD_SPELLS.sacred_flame,
      target: st.characters[0],
      st,
      narrative: '',
      context: ctx,
    });
    expect(res.narrative).toMatch(/Ring of Evasion/);
    expect(res.target.hp).toBe(40);
    expect(res.target.inventory[0].charges_used).toBe(1);
    expect(res.target.turn_actions.reaction_used).toBe(true);
  });
});

describe('invisibility items', () => {
  it('Ring of Invisibility: Invisible, and attacking keeps it', async () => {
    const c = bearer({ ring_of_invisibility: 'ring_1' }, { str: 16 });
    const r = await run(fight(c), { type: 'use', itemId: 'ring_of_invisibility' });
    const me = r.newState.characters[0];
    expect(me.conditions).toEqual(expect.arrayContaining(['invisible', 'item_invisibility']));
    const st2 = {
      ...r.newState,
      characters: [{ ...me, turn_actions: { ...me.turn_actions, action_used: false } }],
    };
    const atk = await run(
      { ...st2, entities: fight(me, 3).entities },
      {
        type: 'attack',
        targetEnemyId: FOE,
      }
    );
    expect(atk.newState.characters[0].conditions).toContain('invisible');
  });

  it('Cloak of Invisibility spends a charge', async () => {
    const c = bearer({ cloak_of_invisibility: 'cloak' });
    const r = await run(fight(c), { type: 'use', itemId: 'cloak_of_invisibility' });
    const me = r.newState.characters[0];
    expect(me.conditions).toContain('invisible');
    expect(me.inventory[0].charges_used).toBe(1);
  });
});
