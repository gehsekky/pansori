// SRD 5.2.1 cursed items (batch 6) — Berserker Axe, Demon Armor, Armor of
// Vulnerability, Shield of Missile Attraction — and Remove Curse ending them.

import { CORRIDOR_ID, makeChar, makeState } from '../../test-fixtures.js';
import type { Character, Enemy, GameState, Seed } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  berserkOnDamage,
  generateChoices,
  missileAttractionTarget,
  pcDamageTaken,
  takeAction,
} from '../../services/gameEngine.js';
import type { ActionContext } from '../../services/actions/types.js';
import { CAMPAIGN_SECTION_SCHEMAS } from '../../routes/schemas.js';
import { SRD_ITEMS } from '../../campaignData/srd/items.js';
import { SRD_MONSTERS } from '../../campaignData/srd/monsters.js';
import { SRD_SPELLS } from '../../campaignData/srd/spells.js';
import { context as baseCtx } from '../fixtures/testContext.js';
import { enemyActor } from '../../services/actions/actor.js';
import { handleEnemyAttack } from '../../services/actions/enemyAttack.js';
import { syncSetAbilities } from '../../services/wornEffects.js';

afterEach(() => vi.restoreAllMocks());

const lootTable = [...baseCtx.lootTable, ...Object.values(SRD_ITEMS)];
const ctx = { ...baseCtx, lootTable, spellTable: { ...baseCtx.spellTable, ...SRD_SPELLS } };
const FOE = `${CORRIDOR_ID}#0`;
const FOE2 = `${CORRIDOR_ID}#1`;

const foe = (over: Partial<Enemy> = {}): Enemy =>
  ({ id: FOE, name: 'Foe', hp: 80, ac: 5, damage: '1d4', toHit: 3, xp: 10, ...over }) as Enemy;

const seedFor = (...enemies: Enemy[]): Seed => ({
  context_id: ctx.id,
  world_name: 'Curses',
  ship_name: 'Curses',
  intro: '',
  seed_id: 'curses',
  rooms: [{ id: CORRIDOR_ID, name: 'Hall', desc: '' }],
  enemies: { [CORRIDOR_ID]: enemies },
  loot: {},
  npcs: {},
});

/** A level-5 fighter carrying `items` (id → equip slot or null), all attuned. */
function bearer(items: Record<string, string | null>, over: Partial<Character> = {}) {
  const ids = Object.keys(items);
  const inventory = ids.map((id, i) => ({
    instance_id: `i${i}`,
    id,
    name: SRD_ITEMS[id].name,
    ...(SRD_ITEMS[id].count ? { count: SRD_ITEMS[id].count } : {}),
  }));
  const equipment: Record<string, string> = {};
  Object.values(items).forEach((slot, k) => {
    if (slot) equipment[slot] = `i${k}`;
  });
  const c = makeChar({
    id: 'pc-1',
    name: 'Brann',
    character_class: 'Fighter',
    level: 5,
    str: 16,
    dex: 12,
    hp: 40,
    max_hp: 40,
    inventory,
    equipment,
    attuned_items: inventory.map((i) => i.instance_id),
    weapon_proficiencies: ['simple', 'martial'],
    ...over,
  });
  syncSetAbilities(c, lootTable);
  return c;
}

function fight(chars: Character[], foes: Array<{ id: string; pos: { x: number; y: number } }>) {
  const st: GameState = {
    ...makeState({ id: chars[0].id }, { current_room: CORRIDOR_ID, combat_active: true }),
    characters: chars,
    active_character_id: chars[0].id,
    initiative_order: [
      ...chars.map((c) => ({ id: c.id, roll: 18, is_enemy: false })),
      ...foes.map((f) => ({ id: f.id, roll: 5, is_enemy: true })),
    ],
    initiative_idx: 0,
    entities: [
      ...chars.map((c, i) => ({
        id: c.id,
        isEnemy: false,
        pos: { x: 2 + i, y: 2 },
        hp: c.hp,
        maxHp: c.max_hp,
        conditions: [],
        condition_durations: {},
      })),
      ...foes.map((f) => ({
        id: f.id,
        isEnemy: true,
        pos: f.pos,
        hp: 80,
        maxHp: 80,
        conditions: [],
        condition_durations: {},
      })),
    ],
  };
  return st;
}

const attack = (st: GameState, ...enemies: Enemy[]) =>
  takeAction({
    action: { type: 'attack', targetEnemyId: FOE } as never,
    history: [],
    state: st,
    seed: seedFor(...enemies),
    context: ctx,
  });

describe('catalog', () => {
  it('lists the cursed items, hides the curse until attunement, and validates', () => {
    for (const id of [
      'berserker_axe_greataxe',
      'demon_armor_plate_armor',
      'plate_armor_of_vulnerability_slashing',
      'shield_of_missile_attraction',
    ]) {
      expect(SRD_ITEMS[id]?.cursed, id).toBe(true);
      expect(SRD_ITEMS[id].curseDesc, id).toBeTruthy();
    }
    expect(SRD_ITEMS.plate_armor_of_vulnerability_slashing.desc).not.toMatch(/ulnerab/);
    const r = CAMPAIGN_SECTION_SCHEMAS.customItems.safeParse(Object.values(SRD_ITEMS));
    expect(r.success, JSON.stringify(r.error?.issues?.slice(0, 3))).toBe(true);
  });

  it('tags the SRD demons', () => {
    const subtype = (k: string) =>
      (SRD_MONSTERS as Record<string, { creatureSubtype?: string }>)[k].creatureSubtype;
    for (const k of ['balor', 'dretch', 'quasit', 'vrock']) expect(subtype(k), k).toBe('demon');
    expect(subtype('imp')).toBeUndefined();
  });

  it('attuning reveals the curse', async () => {
    const c = bearer({ berserker_axe_greataxe: null }, { attuned_items: [] });
    const st = { ...fight([c], []), combat_active: false };
    const r = await takeAction({
      action: { type: 'attune', instanceId: 'i0' } as never,
      history: [],
      state: st,
      seed: seedFor(),
      context: ctx,
    });
    expect(r.narrative).toMatch(/Curse revealed: .*berserk/);
  });
});

describe('Berserker Axe', () => {
  it('adds 1 Hit Point maximum per level while attuned', () => {
    const c = bearer({ berserker_axe_greataxe: 'main_hand' });
    expect(c.max_hp).toBe(45);
    expect(c.hp).toBe(45);
    c.attuned_items = [];
    syncSetAbilities(c, lootTable);
    expect(c.max_hp).toBe(40);
  });

  it('other weapons attack at Disadvantage', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const c = bearer({ longsword: 'main_hand', berserker_axe_greataxe: null });
    const r = await attack(fight([c], [{ id: FOE, pos: { x: 3, y: 2 } }]), foe());
    expect(r.narrative).toMatch(/not your Berserker Axe/);
  });

  it('damage can send the bearer berserk; then only the nearest foe can be attacked', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // WIS save: a 1
    const c = bearer({ berserker_axe_greataxe: 'main_hand' });
    const st = fight(
      [{ ...c, hp: 30 }],
      [
        { id: FOE, pos: { x: 3, y: 2 } },
        { id: FOE2, pos: { x: 6, y: 2 } },
      ]
    );
    const r = berserkOnDamage(st, new Map([['pc-1', 45]]), ctx);
    expect(r.st.characters[0].conditions).toContain('berserk');
    expect(r.note).toMatch(/goes berserk/);
    const choices = generateChoices(r.st, seedFor(foe(), foe({ id: FOE2, name: 'Far Foe' })), ctx);
    const attacks = choices.filter((x) => (x.action as { type: string }).type === 'attack');
    expect(attacks.length).toBeGreaterThan(0);
    expect(
      attacks.every((x) => (x.action as { targetEnemyId?: string }).targetEnemyId === FOE)
    ).toBe(true);
    expect(choices.some((x) => (x.action as { type: string }).type === 'dodge')).toBe(false);
  });
});

describe('Demon Armor', () => {
  it('claws: Unarmed Strikes deal 1d8 + 1 Slashing', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const c = bearer({ demon_armor_plate_armor: 'armor' });
    const r = await attack(fight([c], [{ id: FOE, pos: { x: 3, y: 2 } }]), foe());
    expect(r.narrative).toMatch(/\+1 \(Demon Armor claws\)/);
  });

  it('Disadvantage on attacks against Demons', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const c = bearer({ longsword: 'main_hand', demon_armor_plate_armor: 'armor' });
    const r = await attack(
      fight([c], [{ id: FOE, pos: { x: 3, y: 2 } }]),
      foe({ creatureType: 'fiend', creatureSubtype: 'demon' })
    );
    expect(r.narrative).toMatch(/Demon Armor curse vs a demon/);
  });
});

describe('Armor of Vulnerability', () => {
  it('resists its type, and the curse makes the other two doubled — even unworn', () => {
    const worn = bearer({ plate_armor_of_vulnerability_slashing: 'armor' });
    const st = fight([worn], []);
    expect(pcDamageTaken(worn, st, 10, 'slashing')).toBe(5);
    expect(pcDamageTaken(worn, st, 10, 'piercing')).toBe(20);
    expect(pcDamageTaken(worn, st, 10, 'bludgeoning')).toBe(20);
    expect(pcDamageTaken(worn, st, 10, 'fire')).toBe(10);
    const off = bearer({ plate_armor_of_vulnerability_slashing: null });
    expect(pcDamageTaken(off, st, 10, 'slashing')).toBe(10);
    expect(pcDamageTaken(off, st, 10, 'piercing')).toBe(20);
  });
});

describe('Shield of Missile Attraction', () => {
  it('draws ranged weapon attacks aimed near the bearer', () => {
    const cursed = bearer({ shield_of_missile_attraction: 'shield' });
    const ally = makeChar({ id: 'pc-2', name: 'Ally', hp: 20, max_hp: 20 });
    const st = fight([cursed, ally], [{ id: FOE, pos: { x: 9, y: 2 } }]);
    expect(missileAttractionTarget(st, { attackReachFt: 80 }, 1)).toBe(0);
    expect(missileAttractionTarget(st, { attackReachFt: 5 }, 1)).toBe(1);
  });

  it('resists ranged weapon damage while held', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // d20 11 + 10 hits
    const c = bearer({ shield_of_missile_attraction: 'shield' });
    const st = fight([{ ...c, ac: 10 }], [{ id: FOE, pos: { x: 9, y: 2 } }]);
    const archer = {
      ...foe({ toHit: 10, damage: '10', attackReachFt: 80 }),
      damageType: 'piercing',
    } as Enemy;
    const actx = {
      actor: enemyActor(archer),
      context: ctx,
      st,
      narrative: '',
    } as unknown as ActionContext;
    handleEnemyAttack(actx, {
      type: 'enemy_attack',
      targetCharId: 'pc-1',
      advIdx: 0,
      multiattackIdx: 0,
    });
    if (actx.enemySubAttack?.outcome !== 'done') throw new Error('expected done');
    expect(actx.enemySubAttack.target.hp).toBe(35);
  });
});

describe('Remove Curse', () => {
  it('breaks the bond: curse effects end and the item comes off', async () => {
    const c = bearer(
      { berserker_axe_greataxe: 'main_hand', plate_armor_of_vulnerability_slashing: null },
      {
        character_class: 'Cleric',
        spell_slots_max: { 3: 2 },
        spell_slots_used: {},
        spells_known: ['remove_curse'],
        prepared_spells: ['remove_curse'],
      }
    );
    expect(c.worn_traits?.vulnerabilities).toEqual(['bludgeoning', 'piercing']);
    const st = { ...fight([c], []), combat_active: false, entities: undefined };
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'remove_curse', slotLevel: 3 } as never,
      history: [],
      state: st,
      seed: seedFor(),
      context: ctx,
    });
    const after = r.newState.characters[0];
    expect(after.attuned_items).toEqual([]);
    expect(after.equipment.main_hand).toBeUndefined();
    expect(after.worn_traits?.vulnerabilities).toBeUndefined();
    expect(after.max_hp).toBe(40);
    expect(r.narrative).toMatch(/attunement bond on .*Berserker Greataxe/);
  });
});
