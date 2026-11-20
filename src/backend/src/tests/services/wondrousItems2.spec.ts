// SRD 5.2.1 wondrous items, round 2 (batch 7) — carried stones (Luckstone,
// Ioun Stones, Scarab), ability increases, Manuals and Tomes, timed flight,
// Bracers of Archery, Robe of the Archmagi, Periapts, Ring of Regeneration and
// the Cloak of Displacement.

import { CORRIDOR_ID, makeChar, makeState } from '../../test-fixtures.js';
import type { Character, Enemy, GameState, Seed } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildInitiativeOrder, takeAction } from '../../services/gameEngine.js';
import { checkPenalty, rollDeathSave } from '../../services/rulesEngine.js';
import { hitDieHealing, potionFlyFt, regenerateOverTime } from '../../services/potions.js';
import { syncSetAbilities, wornSaveBonus } from '../../services/wornEffects.js';
import type { ActionContext } from '../../services/actions/types.js';
import { CAMPAIGN_SECTION_SCHEMAS } from '../../routes/schemas.js';
import { SRD_ITEMS } from '../../campaignData/srd/items.js';
import { context as baseCtx } from '../fixtures/testContext.js';
import { characterAc } from '../../services/armorClass.js';
import { enemyActor } from '../../services/actions/actor.js';
import { handleEnemyAttack } from '../../services/actions/enemyAttack.js';

afterEach(() => vi.restoreAllMocks());

const lootTable = [...baseCtx.lootTable, ...Object.values(SRD_ITEMS)];
const ctx = { ...baseCtx, lootTable };
const FOE = `${CORRIDOR_ID}#0`;

const foe = (over: Partial<Enemy> = {}): Enemy =>
  ({ id: FOE, name: 'Foe', hp: 80, ac: 5, damage: '1d4', toHit: 3, xp: 10, ...over }) as Enemy;
const seedFor = (...enemies: Enemy[]): Seed => ({
  context_id: ctx.id,
  world_name: 'W2',
  ship_name: 'W2',
  intro: '',
  seed_id: 'w2',
  rooms: [{ id: CORRIDOR_ID, name: 'Hall', desc: '' }],
  enemies: { [CORRIDOR_ID]: enemies },
  loot: {},
  npcs: {},
});

/** A level-5 character carrying `items` (id → equip slot or null), all attuned. */
function bearer(items: Record<string, string | null>, over: Partial<Character> = {}) {
  const inventory = Object.keys(items).map((id, i) => ({
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
    name: 'Ilse',
    character_class: 'Fighter',
    level: 5,
    str: 14,
    dex: 14,
    con: 14,
    hp: 40,
    max_hp: 40,
    inventory,
    equipment,
    attuned_items: inventory.map((i) => i.instance_id),
    ...over,
  });
  syncSetAbilities(c, lootTable);
  c.ac = characterAc(c, lootTable);
  return c;
}

function fight(c: Character, foePos = { x: 3, y: 2 }): GameState {
  return {
    ...makeState({ id: c.id }, { current_room: CORRIDOR_ID, combat_active: true }),
    characters: [c],
    active_character_id: c.id,
    initiative_order: [
      { id: c.id, roll: 18, is_enemy: false },
      { id: FOE, roll: 5, is_enemy: true },
    ],
    initiative_idx: 0,
    entities: [
      {
        id: c.id,
        isEnemy: false,
        pos: { x: 2, y: 2 },
        hp: c.hp,
        maxHp: c.max_hp,
        conditions: [],
        condition_durations: {},
      },
      {
        id: FOE,
        isEnemy: true,
        pos: foePos,
        hp: 80,
        maxHp: 80,
        conditions: [],
        condition_durations: {},
      },
    ],
  };
}

const use = (st: GameState, itemId: string) =>
  takeAction({
    action: { type: 'use', itemId } as never,
    history: [],
    state: st,
    seed: seedFor(),
    context: ctx,
  });

describe('catalog', () => {
  it('lists the round-2 wondrous items and validates', () => {
    for (const id of [
      'stone_of_good_luck',
      'ioun_stone_of_fortitude',
      'belt_of_dwarvenkind',
      'manual_of_bodily_health',
      'winged_boots',
      'robe_of_the_archmagi',
      'cloak_of_displacement',
    ]) {
      expect(SRD_ITEMS[id], id).toBeDefined();
    }
    const r = CAMPAIGN_SECTION_SCHEMAS.customItems.safeParse(Object.values(SRD_ITEMS));
    expect(r.success, JSON.stringify(r.error?.issues?.slice(0, 3))).toBe(true);
  });
});

describe('carried stones', () => {
  it('the Luckstone works from the pack: +1 saves, checks and Initiative', () => {
    const c = bearer({ stone_of_good_luck: null });
    expect(wornSaveBonus(c, 'wis', lootTable)).toBe(1);
    expect(checkPenalty(c)).toBe(-1);
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // d20 11
    const [entry] = buildInitiativeOrder([c], []);
    expect(entry.roll).toBe(11 + 2 + 1);
  });

  it('not while unattuned', () => {
    const c = bearer({ stone_of_good_luck: null }, { attuned_items: [] });
    expect(wornSaveBonus(c, 'wis', lootTable)).toBe(0);
  });

  it('an Ioun Stone raises its score by 2, to 20, with HP for Constitution', () => {
    const c = bearer({ ioun_stone_of_fortitude: null });
    expect(c.con).toBe(16);
    expect(c.max_hp).toBe(45);
    expect(bearer({ ioun_stone_of_fortitude: null }, { con: 19 }).con).toBe(20);
    expect(bearer({ ioun_stone_of_fortitude: null }, { con: 20 }).con).toBe(20);
    // A Belt of Giant Strength's higher set score still wins.
    const both = bearer(
      { ioun_stone_of_strength: null, belt_of_hill_giant_strength: 'waist' },
      { str: 18 }
    );
    expect(both.str).toBe(21);
  });

  it('Ioun Stone of Protection: +1 AC', () => {
    expect(bearer({ ioun_stone_of_protection: null }).ac).toBe(bearer({}).ac + 1);
  });
});

describe('Belt of Dwarvenkind', () => {
  it('Darkvision of at least 60 ft — not added on top', () => {
    expect(bearer({ belt_of_dwarvenkind: 'waist' }).darkvision_ft).toBe(60);
    expect(bearer({ belt_of_dwarvenkind: 'waist' }, { darkvision_ft: 60 }).darkvision_ft).toBe(60);
    expect(bearer({ belt_of_dwarvenkind: 'waist' }).con).toBe(16);
  });
});

describe('Manuals and Tomes', () => {
  it('studying raises the score by 2 and spends the book', async () => {
    const c = bearer({ manual_of_bodily_health: null }, { con: 15 });
    const r = await use({ ...fight(c), combat_active: false }, 'manual_of_bodily_health');
    const after = r.newState.characters[0];
    expect(after.con).toBe(17);
    expect(after.max_hp).toBe(45); // mod +2 → +3, ×5 levels
    expect(after.inventory).toHaveLength(0);
  });

  it('raises the true base under a Belt', async () => {
    const c = bearer(
      { manual_of_gainful_exercise: null, belt_of_hill_giant_strength: 'waist' },
      { str: 14 }
    );
    const r = await use({ ...fight(c), combat_active: false }, 'manual_of_gainful_exercise');
    const after = r.newState.characters[0];
    expect(after.str).toBe(21);
    expect(after.ability_set_base?.str).toBe(16);
  });
});

describe('activated items', () => {
  it('Winged Boots: a charge buys an hour of 30-ft flight', async () => {
    const c = bearer({ winged_boots: 'feet' });
    const r = await use(fight(c), 'winged_boots');
    const after = r.newState.characters[0];
    expect(after.conditions).toContain('winged_boots');
    expect(potionFlyFt(after)).toBe(30);
    expect(after.inventory[0].charges_used).toBe(1);
    expect(after.turn_actions.action_used).toBe(true);
  });

  it('Wings of Flying: 60 ft, once per dawn', async () => {
    const c = bearer({ wings_of_flying: 'cloak' });
    const st = { ...fight(c), combat_active: false };
    const r = await use(st, 'wings_of_flying');
    expect(potionFlyFt(r.newState.characters[0])).toBe(60);
    const again = await use(r.newState, 'wings_of_flying');
    expect(again.narrative).toMatch(/until dawn/);
  });

  it('Periapt of Health heals 2d4 + 2 once per dawn', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const c = bearer({ periapt_of_health: 'neck' }, { hp: 20 });
    const r = await use({ ...fight(c), combat_active: false }, 'periapt_of_health');
    expect(r.newState.characters[0].hp).toBe(30);
  });
});

describe('worn boosts', () => {
  it('Bracers of Archery: Longbow proficiency and +2 damage', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const c = bearer(
      { longbow: 'main_hand', arrows: 'quiver', bracers_of_archery: 'arms' },
      { weapon_proficiencies: [] }
    );
    const r = await takeAction({
      action: { type: 'attack', targetEnemyId: FOE } as never,
      history: [],
      state: fight(c, { x: 6, y: 2 }),
      seed: seedFor(foe()),
      context: ctx,
    });
    expect(r.narrative).toMatch(/\+2 \(bracers\)/);
    expect(r.narrative).not.toMatch(/no weapon proficiency/);
  });

  it('Robe of the Archmagi: base AC 15 + DEX without armor; +2 spell DC', () => {
    const c = bearer({ robe_of_the_archmagi: 'cloak' }, { character_class: 'Wizard', dex: 14 });
    expect(c.ac).toBe(17);
    expect(c.worn_traits?.spellDcBonus).toBe(2);
    expect(c.worn_traits?.spellSaveAdvantage).toBe(true);
  });

  it('Periapt of Wound Closure: death saves of 9 or less become 10; Hit Dice double', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // a natural 1
    expect(rollDeathSave(undefined, false, 0, true).result).toBe('success');
    expect(rollDeathSave(undefined, false, 0, false).result).toBe('double_failure');
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // d8 = 8
    const c = bearer({ periapt_of_wound_closure: 'neck' }, { hit_die: 8 });
    expect(hitDieHealing(c, fight(c))).toBe((8 + 2) * 2);
  });

  it('Ring of Regeneration: 1d6 every 10 minutes at 1+ HP', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // 6s
    const c = bearer({ ring_of_regeneration: 'ring_1' }, { hp: 10 });
    expect(regenerateOverTime(c, 60).hp).toBe(40); // 6 × 6 = 36, capped at 40
    expect(regenerateOverTime({ ...c, hp: 0 }, 60).hp).toBe(0);
  });

  it('Cloak of Displacement: attacks at Disadvantage until it takes damage', () => {
    const c = bearer({ cloak_of_displacement: 'cloak' });
    const brute = { ...foe({ toHit: 5, damage: '5' }), damageType: 'bludgeoning' } as Enemy;
    const swing = (st: GameState) => {
      let n = 0;
      vi.spyOn(Math, 'random').mockImplementation(() => (n++ % 2 === 0 ? 0.99 : 0));
      const actx = {
        actor: enemyActor(brute),
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
      return actx.enemySubAttack.target;
    };
    // d20s 20 and 1 → Disadvantage keeps the 1: a miss.
    expect(swing(fight(c)).hp).toBe(40);
    // Already damaged this turn → no Disadvantage: the 20 hits.
    const hurt = { ...c, turn_actions: { ...c.turn_actions, displacement_broken: true } };
    const t = swing(fight(hurt));
    expect(t.hp).toBeLessThan(40);
  });
});
