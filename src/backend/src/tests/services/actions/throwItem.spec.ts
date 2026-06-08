import type { Enemy, GameState, Seed } from '../../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateChoices, takeAction } from '../../../services/gameEngine.js';
import { makeChar, makeState } from '../../../test-fixtures.js';
import { SRD_ITEMS } from '../../../campaignData/srd/items.js';
import { context as baseCtx } from '../../fixtures/testContext.js';

// SRD thrown splash weapons (throw_item): a DEX ranged attack vs the target's
// AC; on a hit, splash damage of the item's type. Holy Water only harms
// Fiends/Undead; Alchemist's Fire sets the target alight (save-ends burn).

afterEach(() => vi.restoreAllMocks());

const ctx = {
  ...baseCtx,
  lootTable: [
    ...baseCtx.lootTable,
    SRD_ITEMS.acid_vial,
    SRD_ITEMS.alchemists_fire,
    SRD_ITEMS.holy_water,
  ],
};

const ENEMY_ID = 'entry_hall#0';

function seedWith(enemy: Partial<Enemy>): Seed {
  return {
    context_id: ctx.id,
    world_name: 'Throw Test',
    ship_name: 'Throw Test',
    intro: '',
    seed_id: 'throw',
    rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
    enemies: {
      ['entry_hall']: [
        {
          id: ENEMY_ID,
          name: 'Foe',
          hp: 40,
          ac: 10, // low AC so a mid roll connects
          damage: '1d6',
          toHit: 4,
          xp: 50,
          ...enemy,
        } as Enemy,
      ],
    },
    loot: {},
    npcs: {},
  };
}

function stateWith(itemId: string): GameState {
  const pc = makeChar({
    id: 'pc-1',
    character_class: 'Rogue',
    level: 1,
    dex: 14,
    hp: 30,
    max_hp: 30,
    inventory: [{ instance_id: 'sp-1', id: itemId, name: SRD_ITEMS[itemId].name }],
  });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
    characters: [pc],
    active_character_id: 'pc-1',
    initiative_order: [
      { id: 'pc-1', roll: 18, is_enemy: false },
      { id: ENEMY_ID, roll: 5, is_enemy: true },
    ],
    initiative_idx: 0,
    round: 1,
    entities: [
      {
        id: 'pc-1',
        isEnemy: false,
        pos: { x: 4, y: 5 },
        hp: 30,
        maxHp: 30,
        conditions: [],
        condition_durations: {},
      },
      {
        id: ENEMY_ID,
        isEnemy: true,
        pos: { x: 5, y: 5 },
        hp: 40,
        maxHp: 40,
        conditions: [],
        condition_durations: {},
      },
    ],
  } as unknown as GameState;
}

const enemyHp = (st: GameState) => st.entities?.find((e) => e.id === ENEMY_ID)?.hp;
const pcInv = (st: GameState) => st.characters[0].inventory ?? [];

describe('throw_item — Acid', () => {
  it('hits and deals acid damage; the vial is consumed', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.7); // d20 15 + 2 DEX = 17 vs AC 10 → hit; d6=5
    const r = await takeAction({
      action: { type: 'throw_item', itemId: 'acid_vial', targetEnemyId: ENEMY_ID },
      history: [],
      state: stateWith('acid_vial'),
      seed: seedWith({}),
      context: ctx,
    });
    expect(enemyHp(r.newState)).toBe(30); // 40 − 2d6 (5+5)
    expect(pcInv(r.newState).some((i) => i.id === 'acid_vial')).toBe(false);
    expect(r.narrative).toMatch(/bursts over/);
  });

  it('a miss deals no damage but still consumes the vial', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.05); // d20 2 + 2 = 4 vs AC 10 → miss
    const r = await takeAction({
      action: { type: 'throw_item', itemId: 'acid_vial', targetEnemyId: ENEMY_ID },
      history: [],
      state: stateWith('acid_vial'),
      seed: seedWith({}),
      context: ctx,
    });
    expect(enemyHp(r.newState)).toBe(40);
    expect(pcInv(r.newState).some((i) => i.id === 'acid_vial')).toBe(false);
    expect(r.narrative).toMatch(/shatters wide/);
  });
});

describe('throw_item — Holy Water (Fiend/Undead only)', () => {
  it('damages an Undead foe', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.7);
    const r = await takeAction({
      action: { type: 'throw_item', itemId: 'holy_water', targetEnemyId: ENEMY_ID },
      history: [],
      state: stateWith('holy_water'),
      seed: seedWith({ creatureType: 'undead' }),
      context: ctx,
    });
    expect(enemyHp(r.newState)).toBe(30); // 2d6 radiant
    expect(r.narrative).toMatch(/bursts over/);
  });

  it('splashes harmlessly off a living (non-fiend/undead) foe', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.7); // a hit, but no creature-type match
    const r = await takeAction({
      action: { type: 'throw_item', itemId: 'holy_water', targetEnemyId: ENEMY_ID },
      history: [],
      state: stateWith('holy_water'),
      seed: seedWith({}), // no creatureType
      context: ctx,
    });
    expect(enemyHp(r.newState)).toBe(40); // unharmed
    expect(pcInv(r.newState).some((i) => i.id === 'holy_water')).toBe(false); // still used
    expect(r.narrative).toMatch(/neither fiend nor undead/);
  });
});

describe('throw_item — Alchemist’s Fire', () => {
  it('deals initial fire and sets the target alight (save-ends burn)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.7); // hit; d4 = 3
    const r = await takeAction({
      action: { type: 'throw_item', itemId: 'alchemists_fire', targetEnemyId: ENEMY_ID },
      history: [],
      state: stateWith('alchemists_fire'),
      seed: seedWith({}),
      context: ctx,
    });
    expect(enemyHp(r.newState)).toBe(37); // 40 − 1d4 (3); first burn tick is gated this turn
    const ent = r.newState.entities?.find((e) => e.id === ENEMY_ID);
    expect(ent?.save_ends?.burning?.recurDice).toBe('1d4');
    expect(ent?.save_ends?.burning?.recurType).toBe('fire');
    expect(ent?.save_ends?.burning?.label).toBe('the flames');
    expect(r.narrative).toMatch(/wreathed in clinging flame/);
  });
});

describe('throw_item — choices', () => {
  it('offers a Throw choice per held splash item × living enemy', () => {
    const choices = generateChoices(stateWith('acid_vial'), seedWith({}), ctx);
    expect(choices.some((c) => /Throw Acid .* at Foe/.test(c.label))).toBe(true);
  });
});
