// SRD 5.2.1 Potions — drinking (a Bonus Action in combat), administering to an
// ally, the timed effects (Resistance, Giant Strength, Speed, Heroism, …),
// their run-down with in-world time, and the oils.

import { CORRIDOR_ID, makeChar, makeState, seedWithEnemy } from '../../test-fixtures.js';
import type { Character, GameState } from '../../types.js';
import {
  POTION_SOURCE,
  elapsePotionTime,
  hitDieHealing,
  potionClimbs,
  potionFlyFt,
} from '../../services/potions.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  breakConcentration,
  conditionImmunitiesFor,
  pcDamageTaken,
  takeAction,
} from '../../services/gameEngine.js';
import { CAMPAIGN_SECTION_SCHEMAS } from '../../routes/schemas.js';
import { SRD_ITEMS } from '../../campaignData/srd/items.js';
import { context as baseCtx } from '../fixtures/testContext.js';
import { syncSetAbilities } from '../../services/wornEffects.js';

afterEach(() => vi.restoreAllMocks());

const lootTable = [...baseCtx.lootTable, ...Object.values(SRD_ITEMS)];
const ctx = { ...baseCtx, lootTable };

const inv = (id: string, i = 0, count?: number) => ({
  instance_id: `p${i}`,
  id,
  name: SRD_ITEMS[id].name,
  ...(count ? { count } : {}),
});

function hero(over: Partial<Character> = {}): Character {
  return makeChar({
    id: 'pc-1',
    name: 'Hero',
    character_class: 'Fighter',
    level: 5,
    str: 14,
    con: 14,
    hp: 30,
    max_hp: 50,
    ...over,
  });
}

function stateFor(chars: Character[], over: Partial<GameState> = {}): GameState {
  return {
    ...makeState({ id: chars[0].id }, { current_room: CORRIDOR_ID }),
    characters: chars,
    active_character_id: chars[0].id,
    world_minute: 1000,
    ...over,
  };
}

const use = (st: GameState, itemId: string, targetCharId?: string) =>
  takeAction({
    action: { type: 'use', itemId, ...(targetCharId ? { targetCharId } : {}) } as never,
    history: [],
    state: st,
    seed: seedWithEnemy,
    context: ctx,
  });

const drink = async (itemId: string, over: Partial<Character> = {}) => {
  const st = stateFor([hero({ inventory: [inv(itemId)], ...over })]);
  const r = await use(st, itemId);
  return { r, c: r.newState.characters[0] };
};

describe('catalog', () => {
  it('lists the SRD potions and validates', () => {
    for (const id of [
      'potion_of_flying',
      'potion_of_giant_strength_storm',
      'potion_of_resistance_fire',
      'potion_of_speed',
      'elixir_of_health',
      'oil_of_sharpness',
      'philter_of_love',
    ]) {
      expect(SRD_ITEMS[id]?.potion, id).toBeDefined();
    }
    const r = CAMPAIGN_SECTION_SCHEMAS.customItems.safeParse(Object.values(SRD_ITEMS));
    expect(r.success, JSON.stringify(r.error?.issues?.slice(0, 3))).toBe(true);
  });
});

describe('drinking', () => {
  it('uses up the potion and costs a Bonus Action in combat', async () => {
    const st = stateFor([hero({ inventory: [inv('potion_of_resistance_fire')] })], {
      combat_active: true,
    });
    const r = await use(st, 'potion_of_resistance_fire');
    const c = r.newState.characters[0];
    expect(c.inventory).toHaveLength(0);
    expect(c.turn_actions.bonus_action_used).toBe(true);
    expect(c.turn_actions.action_used).toBe(false);
  });

  it('can be administered to an ally', async () => {
    const ally = makeChar({ id: 'pc-2', name: 'Ally' });
    const st = stateFor([hero({ inventory: [inv('potion_of_heroism')] }), ally]);
    const r = await use(st, 'potion_of_heroism', 'pc-2');
    const a = r.newState.characters.find((c) => c.id === 'pc-2')!;
    expect(a.temp_hp).toBe(10);
    expect(a.conditions).toContain('blessed');
    expect(r.newState.characters[0].inventory).toHaveLength(0);
  });

  it('is offered in the choice menu', async () => {
    const { r } = await drink('potion_of_resistance_fire', {
      inventory: [inv('potion_of_flying'), inv('oil_of_sharpness', 1)],
    });
    const labels = r.choices.map((c) => c.label);
    expect(labels).toContain('Drink the Potion of Flying');
    expect(labels).toContain('Apply the Oil of Sharpness');
  });
});

describe('Resistance and Invulnerability', () => {
  it('Potion of Resistance halves its damage type only', async () => {
    const { r, c } = await drink('potion_of_resistance_fire');
    expect(pcDamageTaken(c, r.newState, 10, 'fire')).toBe(5);
    expect(pcDamageTaken(c, r.newState, 10, 'cold')).toBe(10);
  });

  it('Potion of Invulnerability halves every type, for 1 minute', async () => {
    const { r, c } = await drink('potion_of_invulnerability');
    expect(pcDamageTaken(c, r.newState, 10, 'slashing')).toBe(5);
    expect(pcDamageTaken(c, r.newState, 10, 'psychic')).toBe(5);
    expect(c.condition_durations?.potion_invulnerable).toBe(10);
  });
});

describe('Giant Strength', () => {
  it('sets Strength for the hour, then restores it', async () => {
    const { r, c } = await drink('potion_of_giant_strength_fire');
    expect(c.str).toBe(25);
    const later = elapsePotionTime(r.newState, 61);
    expect(later.characters[0].str).toBe(14);
    expect(later.characters[0].conditions).not.toContain('giant_strength');
  });

  it('has no effect when Strength is already that high', async () => {
    const { c } = await drink('potion_of_giant_strength_hill', { str: 22 });
    expect(c.str).toBe(22);
    expect(c.conditions).not.toContain('giant_strength');
  });

  it('beats a worn Belt, survives a resync, and falls back to the Belt', async () => {
    const belted = hero({
      inventory: [inv('belt_of_hill_giant_strength', 1), inv('potion_of_giant_strength_storm')],
      equipment: { waist: 'p1' },
      attuned_items: ['p1'],
    });
    syncSetAbilities(belted, lootTable);
    expect(belted.str).toBe(21);
    const r = await use(stateFor([belted]), 'potion_of_giant_strength_storm');
    const c = r.newState.characters[0];
    expect(c.str).toBe(29);
    syncSetAbilities(c, lootTable);
    expect(c.str).toBe(29);
    const later = elapsePotionTime({ ...r.newState, characters: [c] }, 61).characters[0];
    expect(later.str).toBe(21);
    syncSetAbilities(later, lootTable);
    expect(later.str).toBe(21);
  });

  it('a Long Rest ends it', async () => {
    const { r } = await drink('potion_of_giant_strength_cloud');
    const rest = await takeAction({
      action: { type: 'long_rest' } as never,
      history: [],
      state: { ...r.newState, world_minute: 5000 },
      seed: { ...seedWithEnemy, enemies: {} },
      context: ctx,
    });
    expect(rest.newState.characters[0].str).toBe(14);
  });
});

describe('Speed, Heroism, Growth, Invisibility', () => {
  it("Potion of Speed's Haste survives another caster's Haste ending", async () => {
    const { r, c } = await drink('potion_of_speed');
    expect(c.conditions).toContain('hasted');
    expect(c.condition_sources?.hasted).toBe(POTION_SOURCE);
    const caster = makeChar({
      id: 'pc-2',
      concentrating_on: { spellId: 'haste', condition: 'hasted' } as never,
    });
    const st = { ...r.newState, characters: [c, caster] };
    const after = breakConcentration(caster, st, ctx).st;
    const me = after.characters.find((x) => x.id === 'pc-1')!;
    expect(me.conditions).toContain('hasted');
    expect(me.conditions).not.toContain('incapacitated');
  });

  it('Heroism: 10 Temporary Hit Points and Bless for an hour', async () => {
    const { c } = await drink('potion_of_heroism');
    expect(c.temp_hp).toBe(10);
    expect(c.conditions).toContain('blessed');
    expect(c.condition_durations?.blessed).toBe(600);
  });

  it('Growth enlarges for 10 minutes; Diminution reduces for 1d4 hours', async () => {
    const g = await drink('potion_of_growth');
    expect(g.c.conditions).toContain('enlarged');
    expect(g.c.condition_durations?.enlarged).toBe(100);
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // 1d4 → 4 hours
    const d = await drink('potion_of_diminution');
    expect(d.c.condition_durations?.reduced).toBe(2400);
  });

  it('Invisibility turns the drinker Invisible', async () => {
    const { c } = await drink('potion_of_invisibility');
    expect(c.conditions).toContain('invisible');
  });
});

describe('movement', () => {
  it('Flying and Climbing grant their speeds', async () => {
    const f = await drink('potion_of_flying');
    expect(potionFlyFt(f.c)).toBe(f.c.speed ?? 30);
    const cl = await drink('potion_of_climbing');
    expect(potionClimbs(cl.c)).toBe(true);
  });
});

describe('time', () => {
  it('a Short Rest runs potion effects down; spell conditions keep theirs', async () => {
    const { r, c } = await drink('potion_of_resistance_fire');
    const withSpell: Character = {
      ...c,
      hp: 20,
      hit_dice_remaining: 3,
      conditions: [...c.conditions, 'invisible'],
      condition_durations: { ...c.condition_durations, invisible: 600 },
    };
    const rest = await takeAction({
      action: { type: 'short_rest' } as never,
      history: [],
      state: { ...r.newState, characters: [withSpell] },
      seed: { ...seedWithEnemy, enemies: {} },
      context: ctx,
    });
    const after = rest.newState.characters[0];
    expect(after.conditions).not.toContain('potion_resistance');
    expect(after.conditions).toContain('invisible');
  });

  it('time short of the duration only shortens it', () => {
    const c = hero({
      conditions: ['potion_flying'],
      condition_durations: { potion_flying: 600 },
      condition_sources: { potion_flying: POTION_SOURCE },
    });
    const after = elapsePotionTime(stateFor([c]), 30).characters[0];
    expect(after.condition_durations?.potion_flying).toBe(300);
  });
});

describe('restoratives and poison', () => {
  it('Vitality clears Exhaustion and Poisoned; Hit Point Dice heal their maximum', async () => {
    const { r, c } = await drink('potion_of_vitality', {
      exhaustion_level: 3,
      conditions: ['poisoned'],
      hit_die: 10,
    });
    expect(c.exhaustion_level).toBe(0);
    expect(c.conditions).not.toContain('poisoned');
    expect(hitDieHealing(c, r.newState)).toBe(12); // d10 max + CON 2
    expect(hitDieHealing(c, { ...r.newState, world_minute: 1000 + 1441 })).toBeLessThanOrEqual(12);
  });

  it('Elixir of Health ends Blinded, Deafened, Paralyzed, and Poisoned', async () => {
    const { c } = await drink('elixir_of_health', {
      conditions: ['blinded', 'poisoned', 'prone'],
    });
    expect(c.conditions).toEqual(['prone']);
  });

  it('Potion of Poison deals 4d6 Poison and can Poison on a failed save', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // 4d6 → 4; the save rolls a 1
    const { c } = await drink('potion_of_poison');
    expect(c.hp).toBe(26);
    expect(c.conditions).toContain('poisoned');
  });
});

describe('oils', () => {
  it('Oil of Sharpness turns a wielded slashing weapon into its +3 version', async () => {
    const { r, c } = await drink('oil_of_sharpness', {
      inventory: [inv('longsword', 1), inv('oil_of_sharpness')],
      equipment: { main_hand: 'p1' },
    });
    expect(r.narrative).toMatch(/Longsword \+3/);
    expect(c.inventory.map((i) => i.id)).toEqual(['longsword_plus_3']);
    expect(c.inventory[0].instance_id).toBe('p1');
  });

  it('…or twenty arrows, leaving the rest', async () => {
    const { c } = await drink('oil_of_sharpness', {
      inventory: [inv('arrows', 1, 25), inv('oil_of_sharpness')],
    });
    expect(c.inventory.find((i) => i.id === 'arrows')?.count).toBe(5);
    expect(c.inventory.find((i) => i.id === 'arrows_plus_3')?.count).toBe(20);
  });

  it("doesn't coat a bludgeoning weapon, and isn't spent", async () => {
    const { c, r } = await drink('oil_of_sharpness', {
      inventory: [inv('mace', 1), inv('oil_of_sharpness')],
      equipment: { main_hand: 'p1' },
    });
    expect(r.narrative).toMatch(/needs a nonmagical/);
    expect(c.inventory).toHaveLength(2);
  });

  it("can't be applied mid-fight", async () => {
    const st = stateFor([hero({ inventory: [inv('oil_of_slipperiness')] })], {
      combat_active: true,
    });
    const r = await use(st, 'oil_of_slipperiness');
    expect(r.narrative).toMatch(/mid-fight/);
    expect(r.newState.characters[0].inventory).toHaveLength(1);
  });

  it('Oil of Slipperiness grants the Freedom of Movement immunities', async () => {
    const { r, c } = await drink('oil_of_slipperiness');
    const imm = conditionImmunitiesFor(c, r.newState);
    expect([...imm]).toEqual(expect.arrayContaining(['paralyzed', 'restrained', 'grappled']));
  });
});
