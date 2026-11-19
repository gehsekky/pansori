// SRD 5.2.1 magic weapons and armor, batch 2 — +N coverage, +N ammunition,
// weapon riders (Vicious, Slayers, Flame Tongue, Mace of Smiting, …), Energy
// Bow, Elven Chain, Weapon of Warning, Arrow-Catching and Spellguard Shields.

import { CORRIDOR_ID, makeChar, makeState, mockRandom } from '../../test-fixtures.js';
import type { Character, Enemy, GameState, Seed } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildInitiativeOrder, resolveEnemySpell, takeAction } from '../../services/gameEngine.js';
import type { ActionContext } from '../../services/actions/types.js';
import { CAMPAIGN_SECTION_SCHEMAS } from '../../routes/schemas.js';
import { SRD_ITEMS } from '../../campaignData/srd/items.js';
import { SRD_MONSTERS } from '../../campaignData/srd/monsters.js';
import { context as baseCtx } from '../fixtures/testContext.js';
import { enemyActor } from '../../services/actions/actor.js';
import { handleEnemyAttack } from '../../services/actions/enemyAttack.js';
import { hasArmorProficiency } from '../../services/rulesEngine.js';
import { syncSetAbilities } from '../../services/wornEffects.js';

afterEach(() => vi.restoreAllMocks());

const lootTable = [...baseCtx.lootTable, ...Object.values(SRD_ITEMS)];
const ctx = { ...baseCtx, lootTable };
const GOB = `${CORRIDOR_ID}#0`;

const foe = (over: Partial<Enemy> = {}): Enemy =>
  ({ id: GOB, name: 'Foe', hp: 500, ac: 5, damage: '1d4', toHit: 3, xp: 10, ...over }) as Enemy;

const seedFor = (enemy: Enemy): Seed => ({
  context_id: ctx.id,
  world_name: 'Arms Test',
  ship_name: 'Arms Test',
  intro: '',
  seed_id: 'arms',
  rooms: [{ id: CORRIDOR_ID, name: 'Hall', desc: '' }],
  enemies: { [CORRIDOR_ID]: [enemy] },
  loot: {},
  npcs: {},
});

/** A fighter wielding `weaponId` (plus `extra` gear: id → slot), adjacent to the foe. */
function armed(weaponId: string, extra: Record<string, string> = {}, foePos = { x: 3, y: 2 }) {
  const items = [weaponId, ...Object.keys(extra)];
  const inventory = items.map((id, i) => ({
    instance_id: `i${i}`,
    id,
    name: SRD_ITEMS[id].name,
    ...(SRD_ITEMS[id].count ? { count: SRD_ITEMS[id].count } : {}),
  }));
  const equipment: Record<string, string> = { main_hand: 'i0' };
  Object.values(extra).forEach((slot, k) => (equipment[slot] = `i${k + 1}`));
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
  });
  syncSetAbilities(c, lootTable);
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
        pos: foePos,
        hp: 500,
        maxHp: 500,
        conditions: [],
        condition_durations: {},
      },
    ],
  };
  return st;
}

const attack = (st: GameState, enemy: Enemy) =>
  takeAction({
    action: { type: 'attack', targetEnemyId: GOB } as never,
    history: [],
    state: st,
    seed: seedFor(enemy),
    context: ctx,
  });

describe('catalog', () => {
  it('has +1/+2/+3 of every weapon and armor, and validates', () => {
    for (const id of ['club', 'rapier', 'heavy_crossbow']) {
      for (const n of [1, 2, 3]) expect(SRD_ITEMS[`${id}_plus_${n}`]?.magicBonus).toBe(n);
    }
    expect(SRD_ITEMS.leather_armor_plus_3?.magicBonus).toBe(3);
    const r = CAMPAIGN_SECTION_SCHEMAS.customItems.safeParse(Object.values(SRD_ITEMS));
    expect(r.success, JSON.stringify(r.error?.issues?.slice(0, 3))).toBe(true);
  });

  it('types the SRD Giants', () => {
    for (const k of ['hill_giant', 'storm_giant', 'ogre', 'troll', 'ettin']) {
      expect((SRD_MONSTERS as Record<string, { creatureType?: string }>)[k]?.creatureType, k).toBe(
        'giant'
      );
    }
  });
});

describe('weapon riders', () => {
  it('Vicious adds 2d6 of the weapon type to every hit', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.6);
    const r = await attack(armed('vicious_longsword'), foe());
    expect(r.narrative).toMatch(/Vicious 2d6: \+\d+ slashing/);
  });

  it('Dragon Slayer adds 3d6 only against Dragons', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.6);
    const vsDragon = await attack(
      armed('dragon_slayer_longsword'),
      foe({ creatureType: 'dragon' })
    );
    expect(vsDragon.narrative).toMatch(/Dragon Slayer 3d6/);
    const vsOther = await attack(armed('dragon_slayer_longsword'), foe({ creatureType: 'beast' }));
    expect(vsOther.narrative).not.toMatch(/Dragon Slayer 3d6/);
  });

  it('Flame Tongue adds 2d6 Fire', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.6);
    const r = await attack(armed('flame_tongue_longsword'), foe());
    expect(r.narrative).toMatch(/Flame Tongue 2d6: \+\d+ fire/);
  });

  it('Mace of Smiting adds 7 only on a natural 20', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const crit = await attack(armed('mace_of_smiting'), foe());
    expect(crit.narrative).toMatch(/Smiting \(20\) 7: \+7/);
    vi.spyOn(Math, 'random').mockReturnValue(0.6);
    const plain = await attack(armed('mace_of_smiting'), foe());
    expect(plain.narrative).not.toMatch(/Smiting \(20\)/);
  });

  it('Dwarven Thrower adds Force only when thrown', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.6);
    const thrown = await attack(armed('dwarven_thrower', {}, { x: 5, y: 2 }), foe());
    expect(thrown.narrative).toMatch(/Dwarven Thrower 1d8: \+\d+ force/);
    const melee = await attack(armed('dwarven_thrower'), foe());
    expect(melee.narrative).not.toMatch(/Dwarven Thrower 1d8/);
  });
});

describe('ammunition and bows', () => {
  it('+1 arrows add their bonus to the shot', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.6);
    const r = await attack(armed('longbow', { arrows_plus_1: 'quiver' }, { x: 6, y: 2 }), foe());
    expect(r.narrative).toMatch(/\+1 \(magic\)/);
    const left = r.newState.characters[0].inventory.find((i) => i.id === 'arrows_plus_1');
    expect(left?.count).toBe(9);
  });

  it('an Arrow-Catching Shield is not ammunition', async () => {
    const r = await attack(
      armed('longbow', { arrow_catching_shield: 'shield' }, { x: 6, y: 2 }),
      foe()
    );
    expect(r.narrative).toMatch(/no ammunition/);
  });

  it('an Energy Bow needs no arrows and deals Force', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.6);
    const r = await attack(
      armed('energy_bow_longbow', {}, { x: 6, y: 2 }),
      foe({ resistances: ['piercing'] })
    );
    expect(r.narrative).not.toMatch(/no ammunition/);
    expect(r.newState.entities?.find((e) => e.id === GOB)?.hp).toBeLessThan(500);
  });
});

describe('armor and shields', () => {
  it('Elven Chain needs no armor training', () => {
    expect(hasArmorProficiency([], 'medium')).toBe(false);
    expect(
      hasArmorProficiency([], 'medium', !!SRD_ITEMS.elven_chain_mail.noArmorTrainingNeeded)
    ).toBe(true);
  });

  it('Dragon Scale Mail grants its dragon’s Resistance', () => {
    const st = armed('longsword', { dragon_scale_mail_red: 'armor' });
    expect(st.characters[0].worn_traits?.resistances).toEqual(['fire']);
  });

  it('an Arrow-Catching Shield adds 2 AC against ranged attacks only', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // d20 = 11
    const swing = (reach: number) => {
      const st = armed('longsword', { arrow_catching_shield: 'shield' });
      const pcAc = { ...st, characters: [{ ...st.characters[0], ac: 15 }] };
      const archer = {
        ...foe({ toHit: 5, damage: '10', attackReachFt: reach }),
        damageType: 'piercing',
      } as Enemy;
      const c = {
        actor: enemyActor(archer),
        context: ctx,
        st: pcAc,
        narrative: '',
      } as unknown as ActionContext;
      handleEnemyAttack(c, {
        type: 'enemy_attack',
        targetCharId: 'pc-1',
        advIdx: 0,
        multiattackIdx: 0,
      });
      if (c.enemySubAttack?.outcome !== 'done') throw new Error('expected done');
      return c.enemySubAttack.target.hp;
    };
    expect(swing(5)).toBe(50); // melee: 16 vs 15 hits
    expect(swing(80)).toBe(60); // ranged: 16 vs 17 misses
  });

  it('a Spellguard Shield gives spell attacks Disadvantage', () => {
    mockRandom(0.99, 0); // 20, then 1 → the lower is used
    const st = armed('longsword', { spellguard_shield: 'shield' });
    const caster = { ...foe(), spellAttackBonus: 10 } as Enemy;
    const r = resolveEnemySpell({
      enemy: caster,
      spell: baseCtx.spellTable!.guiding_bolt,
      target: st.characters[0],
      st,
      narrative: '',
      context: ctx,
    });
    expect(r.narrative).toMatch(/miss/);
    expect(st.characters[0].worn_traits?.spellSaveAdvantage).toBe(true);
  });
});

describe('Weapon of Warning', () => {
  it('gives the whole party Advantage on Initiative', () => {
    mockRandom(0, 0.99, 0, 0.99); // each PC: 1 then 20
    const holder = armed('weapon_of_warning_longsword').characters[0];
    const friend: Character = makeChar({ id: 'pc-2', dex: 10 });
    const order = buildInitiativeOrder([{ ...holder, dex: 10 }, friend], []);
    expect(order.map((e) => e.roll)).toEqual([20, 20]);
  });
});
