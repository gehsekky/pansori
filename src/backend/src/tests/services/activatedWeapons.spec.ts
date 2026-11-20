// SRD 5.2.1 activated magic weapons (batch 5) — armed on-hit powers, rider
// saves, natural-20 death effects, the Oathbow, the Hammer of Thunderbolts,
// Scimitar of Speed, the Acrobat's deflection, Ammunition of Slaying, and the
// creature-type tags they read.

import { CORRIDOR_ID, makeChar, makeState } from '../../test-fixtures.js';
import type { Character, Enemy, GameState, Seed } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateChoices, takeAction } from '../../services/gameEngine.js';
import type { ActionContext } from '../../services/actions/types.js';
import { CAMPAIGN_SECTION_SCHEMAS } from '../../routes/schemas.js';
import { SRD_ITEMS } from '../../campaignData/srd/items.js';
import { SRD_MONSTERS } from '../../campaignData/srd/monsters.js';
import { SRD_SPELLS } from '../../campaignData/srd/spells.js';
import { context as baseCtx } from '../fixtures/testContext.js';
import { bestDamageType } from '../../services/actions/attack/weaponPowers.js';
import { enemyActor } from '../../services/actions/actor.js';
import { handleEnemyAttack } from '../../services/actions/enemyAttack.js';
import { itemCastOptions } from '../../services/chargedItems.js';
import { syncSetAbilities } from '../../services/wornEffects.js';

afterEach(() => vi.restoreAllMocks());

const lootTable = [...baseCtx.lootTable, ...Object.values(SRD_ITEMS)];
const ctx = { ...baseCtx, lootTable, spellTable: { ...baseCtx.spellTable, ...SRD_SPELLS } };
const GOB = `${CORRIDOR_ID}#0`;

const foe = (over: Partial<Enemy> = {}): Enemy =>
  ({
    id: GOB,
    name: 'Foe',
    hp: 80,
    ac: 5,
    damage: '1d4',
    toHit: 3,
    xp: 10,
    con: 10,
    ...over,
  }) as Enemy;

const seedFor = (enemy: Enemy): Seed => ({
  context_id: ctx.id,
  world_name: 'Arms',
  ship_name: 'Arms',
  intro: '',
  seed_id: 'arms5',
  rooms: [{ id: CORRIDOR_ID, name: 'Hall', desc: '' }],
  enemies: { [CORRIDOR_ID]: [enemy] },
  loot: {},
  npcs: {},
});

/** A level-5 fighter wielding `weaponId` (plus `extra` gear: id → slot or null), next to the foe. */
function armed(
  weaponId: string,
  opts: {
    extra?: Record<string, string | null>;
    foePos?: { x: number; y: number };
    foeHp?: number;
    char?: Partial<Character>;
    inv?: Record<string, unknown>;
  } = {}
) {
  const extra = opts.extra ?? {};
  const items = [weaponId, ...Object.keys(extra)];
  const inventory = items.map((id, i) => ({
    instance_id: `i${i}`,
    id,
    name: SRD_ITEMS[id].name,
    ...(SRD_ITEMS[id].count ? { count: SRD_ITEMS[id].count } : {}),
    ...(i === 0 ? opts.inv : {}),
  }));
  const equipment: Record<string, string> = { main_hand: 'i0' };
  Object.values(extra).forEach((slot, k) => {
    if (slot) equipment[slot] = `i${k + 1}`;
  });
  const c = makeChar({
    id: 'pc-1',
    character_class: 'Fighter',
    level: 5,
    str: 16,
    dex: 16,
    hp: 60,
    max_hp: 60,
    inventory,
    equipment,
    attuned_items: inventory.map((i) => i.instance_id),
    weapon_proficiencies: ['simple', 'martial'],
    ...opts.char,
  });
  syncSetAbilities(c, lootTable);
  const hp = opts.foeHp ?? 80;
  const st: GameState = {
    ...makeState({ id: 'pc-1' }, { current_room: CORRIDOR_ID, combat_active: true }),
    characters: [c],
    active_character_id: 'pc-1',
    initiative_order: [
      { id: 'pc-1', roll: 18, is_enemy: false },
      { id: GOB, roll: 5, is_enemy: true },
    ],
    initiative_idx: 0,
    entities: [
      {
        id: 'pc-1',
        isEnemy: false,
        pos: { x: 2, y: 2 },
        hp: 60,
        maxHp: 60,
        conditions: [],
        condition_durations: {},
      },
      {
        id: GOB,
        isEnemy: true,
        pos: opts.foePos ?? { x: 3, y: 2 },
        hp,
        maxHp: hp,
        conditions: [],
        condition_durations: {},
      },
    ],
  };
  return st;
}

const act = (st: GameState, enemy: Enemy, action: Record<string, unknown>) =>
  takeAction({
    action: action as never,
    history: [],
    state: st,
    seed: seedFor(enemy),
    context: ctx,
  });
const attack = (st: GameState, enemy: Enemy) =>
  act(st, enemy, { type: 'attack', targetEnemyId: GOB });
const foeEnt = (st: GameState) => st.entities!.find((e) => e.id === GOB)!;

/** The attack d20 is a natural 20; every later roll (saves, dice) is a 1. */
function nat20ThenOnes() {
  let first = true;
  vi.spyOn(Math, 'random').mockImplementation(() => {
    if (first) {
      first = false;
      return 0.99;
    }
    return 0;
  });
}

describe('catalog', () => {
  it('lists the activated weapons and validates', () => {
    for (const id of [
      'dagger_of_venom',
      'hammer_of_thunderbolts_maul',
      'oathbow_longbow',
      'vorpal_sword_longsword',
      'staff_of_striking',
      'arrows_of_dragon_slaying',
      'adamantine_plate_armor',
    ]) {
      expect(SRD_ITEMS[id], id).toBeDefined();
    }
    const r = CAMPAIGN_SECTION_SCHEMAS.customItems.safeParse(Object.values(SRD_ITEMS));
    expect(r.success, JSON.stringify(r.error?.issues?.slice(0, 3))).toBe(true);
  });

  it('types every SRD monster', () => {
    const untyped = Object.entries(SRD_MONSTERS).filter(
      ([, m]) => !(m as { creatureType?: string }).creatureType
    );
    expect(untyped.map(([k]) => k)).toEqual([]);
    expect((SRD_MONSTERS as Record<string, { creatureType?: string }>).aboleth.creatureType).toBe(
      'aberration'
    );
  });
});

describe('armed powers', () => {
  it('Dagger of Venom: a Bonus Action coats it; the next hit poisons', async () => {
    const st = armed('dagger_of_venom');
    const coat = await act(st, foe(), { type: 'item_power', instanceId: 'i0', power: 'venom' });
    const c = coat.newState.characters[0];
    expect(c.inventory[0].primed?.power).toBe('venom');
    expect(c.turn_actions.bonus_action_used).toBe(true);
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // hits AC 5; the foe's CON save 11 < 15
    const hit = await attack(coat.newState, foe());
    expect(hit.narrative).toMatch(/Venom 2d10: \+\d+ poison/);
    expect(foeEnt(hit.newState).conditions).toContain('poisoned');
    const after = hit.newState.characters[0];
    expect(after.inventory[0].primed).toBeUndefined();
    expect(after.inventory[0].powers_used).toContain('venom');
    // Once per dawn: no second coat on offer.
    const labels = generateChoices(hit.newState, seedFor(foe()), ctx).map((x) => x.label);
    expect(labels.some((l) => l.includes('Coat the blade'))).toBe(false);
  });

  it('Staff of Striking spends 1-3 charges for +1d6 Force each', async () => {
    const st = armed('staff_of_striking');
    const labels = generateChoices(st, seedFor(foe()), ctx).map((x) => x.label);
    expect(labels).toContain('Staff of Striking — Striking: 3 charges on your next hit (+3d6)');
    const armedSt = await act(st, foe(), {
      type: 'item_power',
      instanceId: 'i0',
      power: 'strike',
      charges: 3,
    });
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const hit = await attack(armedSt.newState, foe());
    expect(hit.narrative).toMatch(/Striking 3d6: \+\d+ force/);
    expect(hit.newState.characters[0].inventory[0].charges_used).toBe(3);
  });

  it('Staff of Withering leaves the target withered', async () => {
    const st = armed('staff_of_withering');
    const armedSt = await act(st, foe(), { type: 'item_power', instanceId: 'i0', power: 'wither' });
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const hit = await attack(armedSt.newState, foe());
    expect(foeEnt(hit.newState).conditions).toContain('withered');
    expect(hit.newState.characters[0].inventory[0].charges_used).toBe(1);
  });
});

describe('riders and natural 20s', () => {
  it('Frost Brand adds Cold and resists Fire', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const st = armed('frost_brand_longsword');
    expect(st.characters[0].worn_traits?.resistances).toContain('fire');
    const hit = await attack(st, foe());
    expect(hit.narrative).toMatch(/Frost Brand 1d6: \+\d+ cold/);
  });

  it('Sword of Wounding: a failed save stops the target regaining HP', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const hit = await attack(armed('sword_of_wounding_longsword'), foe());
    const e = foeEnt(hit.newState);
    expect(e.conditions).toContain('festering_wound');
    expect(e.save_ends?.festering_wound).toEqual({ ability: 'con', dc: 15 });
  });

  it('Sword of Life Stealing: a 20 drains 15 and grants Temporary HP — not from Undead', async () => {
    nat20ThenOnes();
    const r = await attack(armed('sword_of_life_stealing_longsword'), foe());
    expect(r.narrative).toMatch(/Life Stealing 15: \+15 necrotic/);
    expect(r.newState.characters[0].temp_hp).toBe(15);
    nat20ThenOnes();
    const undead = await attack(
      armed('sword_of_life_stealing_longsword'),
      foe({ creatureType: 'undead' })
    );
    expect(undead.narrative).not.toMatch(/Life Stealing 15/);
  });

  it('Vorpal Sword: a 20 beheads; a headless Ooze takes 30 instead', async () => {
    nat20ThenOnes();
    const r = await attack(armed('vorpal_sword_longsword', { foeHp: 300 }), foe({ hp: 300 }));
    expect(r.narrative).toMatch(/Vorpal: slain outright/);
    expect(foeEnt(r.newState).hp).toBe(0);
    nat20ThenOnes();
    const ooze = await attack(
      armed('vorpal_sword_longsword', { foeHp: 300 }),
      foe({ hp: 300, creatureType: 'ooze' })
    );
    expect(ooze.narrative).toMatch(/Vorpal: \+30/);
    expect(foeEnt(ooze.newState).hp).toBeGreaterThan(0);
  });

  it('Vorpal Sword ignores Resistance to Slashing', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const r = await attack(armed('vorpal_sword_longsword'), foe({ resistances: ['slashing'] }));
    expect(r.narrative).not.toMatch(/resistant to slashing/);
    // Control: a plain longsword is resisted.
    const plain = await attack(armed('longsword'), foe({ resistances: ['slashing'] }));
    expect(plain.narrative).toMatch(/resistant to slashing/);
  });

  it('Nine Lives Stealer slays below 100 HP and spends a charge', async () => {
    nat20ThenOnes();
    const r = await attack(armed('nine_lives_stealer_longsword'), foe());
    expect(r.narrative).toMatch(/Life Stealing: slain outright/);
    expect(r.newState.characters[0].inventory[0].charges_used).toBe(1);
    nat20ThenOnes();
    const big = await attack(
      armed('nine_lives_stealer_longsword', { foeHp: 150 }),
      foe({ hp: 150 })
    );
    expect(big.narrative).not.toMatch(/slain outright/);
  });

  it('Ammunition of Slaying adds 6d10 Force to its creature type', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const st = armed('longbow', {
      extra: { arrows_of_dragon_slaying: 'quiver' },
      foePos: { x: 6, y: 2 },
    });
    const r = await attack(st, foe({ creatureType: 'dragon' }));
    expect(r.narrative).toMatch(/Dragon Slaying 6d10/);
    expect(
      r.newState.characters[0].inventory.some((i) => i.id === 'arrows_of_dragon_slaying')
    ).toBe(false);
  });
});

describe('Hammer of Thunderbolts', () => {
  it('each throw spends a charge; a hit stuns on a failed save', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // CON 10 save: 11 < 17
    const st = armed('hammer_of_thunderbolts_warhammer', { foePos: { x: 5, y: 2 } });
    const r = await attack(st, foe());
    // Two throws: the level-5 fighter's Extra Attack.
    expect(r.newState.characters[0].inventory[0].charges_used).toBe(2);
    expect(foeEnt(r.newState).conditions).toContain('stunned');
  });

  it('can’t be thrown without a charge', async () => {
    const st = armed('hammer_of_thunderbolts_warhammer', {
      foePos: { x: 5, y: 2 },
      inv: { charges_used: 5 },
    });
    const r = await attack(st, foe());
    expect(r.narrative).toMatch(/no charges left/);
  });

  it('Might of Giants raises a worn Belt by 4', () => {
    const st = armed('hammer_of_thunderbolts_maul', {
      extra: { belt_of_hill_giant_strength: 'waist' },
    });
    expect(st.characters[0].str).toBe(25);
  });

  it('Giants’ Bane needs the Belt or Gauntlets', async () => {
    nat20ThenOnes();
    const giant = foe({ creatureType: 'giant' });
    const bare = await attack(armed('hammer_of_thunderbolts_maul'), giant);
    expect(bare.narrative).not.toMatch(/Giants' Bane/);
    nat20ThenOnes();
    const belted = await attack(
      armed('hammer_of_thunderbolts_maul', { extra: { belt_of_hill_giant_strength: 'waist' } }),
      giant
    );
    expect(belted.narrative).toMatch(/Giants' Bane: slain outright/);
  });
});

describe('Oathbow', () => {
  it('swears the first target, adds 3d6 to it, and hampers other weapons', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const st = armed('oathbow_longbow', {
      extra: { arrows: 'quiver', longsword: null },
      foePos: { x: 6, y: 2 },
    });
    const r = await attack(st, foe());
    const c = r.newState.characters[0];
    expect(c.oath_sworn_id).toBe(GOB);
    expect(r.narrative).toMatch(/Oathbow 3d6/);
    expect(r.narrative).toMatch(/advantage/);
    // Switch to the longsword: Disadvantage while the sworn enemy lives.
    const swapped: GameState = {
      ...r.newState,
      characters: [
        {
          ...c,
          equipment: { ...c.equipment, main_hand: 'i2' },
          turn_actions: { ...c.turn_actions, action_used: false },
        },
      ],
      entities: r.newState.entities!.map((e) => (e.id === GOB ? { ...e, pos: { x: 3, y: 2 } } : e)),
    };
    const melee = await attack(swapped, foe());
    expect(melee.narrative).toMatch(/your sworn enemy lives/);
  });
});

describe('Javelin of Lightning, Scimitar of Speed, Acrobat', () => {
  it('the javelin deals Lightning when it hurts more', () => {
    const jav = { ...SRD_ITEMS.javelin_of_lightning, instance_id: 'x' };
    expect(bestDamageType(jav, foe({ resistances: ['piercing'] }))).toBe('lightning');
    expect(bestDamageType(jav, foe({ resistances: ['lightning'] }))).toBe('piercing');
  });

  it('the javelin’s bolt is a daily 4d6 Lightning Bolt', () => {
    const st = armed('javelin_of_lightning');
    const opts = itemCastOptions(st.characters[0], lootTable, ctx.spellTable);
    expect(opts.map((o) => o.spell.id)).toContain('lightning_bolt');
  });

  it('Scimitar of Speed attacks as a Bonus Action', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const st = armed('scimitar_of_speed');
    const c = st.characters[0];
    st.characters[0] = { ...c, turn_actions: { ...c.turn_actions, action_used: true } };
    const labels = generateChoices(st, seedFor(foe()), ctx).map((x) => x.label);
    expect(labels.some((l) => l.startsWith('Scimitar of Speed — quick strike'))).toBe(true);
    const r = await act(st, foe(), { type: 'bonus_weapon_attack', targetEnemyId: GOB });
    expect(r.narrative).toMatch(/Bonus attack/);
    expect(r.newState.characters[0].turn_actions.bonus_action_used).toBe(true);
    expect(foeEnt(r.newState).hp).toBeLessThan(80);
  });

  it('the Acrobat’s deflection turns a hit into a miss, once per rest', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // enemy d20 11 + 5 = 16 vs AC 15
    const st = armed('quarterstaff_of_the_acrobat');
    const pc = { ...st.characters[0], ac: 15 };
    const withAc = { ...st, characters: [pc] };
    const brute = { ...foe({ toHit: 5, damage: '10' }), damageType: 'bludgeoning' } as Enemy;
    const c = {
      actor: enemyActor(brute),
      context: ctx,
      st: withAc,
      narrative: '',
    } as unknown as ActionContext;
    handleEnemyAttack(c, {
      type: 'enemy_attack',
      targetCharId: 'pc-1',
      advIdx: 0,
      multiattackIdx: 0,
    });
    expect(c.st.pending_reaction?.kind).toBe('shield');
    const labels = generateChoices(c.st, seedFor(brute), ctx).map((x) => x.label);
    expect(labels.some((l) => l.startsWith('Deflect with the Quarterstaff'))).toBe(true);
    const r = await act(c.st, brute, {
      type: 'resolve_reaction',
      accept: true,
      source: 'acrobat_deflect',
    });
    const after = r.newState.characters[0];
    expect(after.hp).toBe(60);
    expect(after.class_resource_uses?.acrobat_deflect_used).toBe(1);
  });
});

describe('items cast while worn or carried', () => {
  it('the Trident works from the pack; Plate Armor of Etherealness while worn', () => {
    const trident = armed('longsword', { extra: { trident_of_fish_command: null } });
    expect(
      itemCastOptions(trident.characters[0], lootTable, ctx.spellTable).map((o) => o.spell.id)
    ).toContain('dominate_beast');
    const plate = armed('longsword', { extra: { plate_armor_of_etherealness: 'armor' } });
    expect(
      itemCastOptions(plate.characters[0], lootTable, ctx.spellTable).map((o) => o.spell.id)
    ).toContain('etherealness');
  });

  it('Mace of Terror frightens without Concentration', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.3); // WIS save 7 < 15
    const st = armed('mace_of_terror');
    const r = await act(st, foe(), {
      type: 'cast_spell',
      spellId: 'fear',
      slotLevel: 3,
      targetEnemyId: GOB,
      itemInstanceId: 'i0',
    });
    expect(r.narrative).toMatch(/from the Mace of Terror/);
    expect(r.newState.characters[0].concentrating_on).toBeFalsy();
    expect(foeEnt(r.newState).conditions).toContain('frightened');
  });

  it('Adamantine Armor turns away critical hits', () => {
    const st = armed('longsword', { extra: { adamantine_plate_armor: 'armor' } });
    expect(st.characters[0].worn_traits?.critImmune).toBe(true);
  });
});
