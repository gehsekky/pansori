// +1/+2/+3 magic weapons & armor:
//   - weapon: +N to attack + damage, and the attack counts as MAGICAL so it
//     bypasses a creature's nonmagical-only resistance (elementals etc.).
//   - armor / shield: +N to AC.
// Unit helpers below; the integration test proves the wiring through the real
// attack path (resolveOneAttack).

import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyDamageMultiplier, computeTotalAc } from '../../services/rulesEngine.js';
import { makeChar, makeState, mockRandom } from '../../test-fixtures.js';
import { SRD_ITEMS } from '../../campaignData/srd/items.js';
import type { Seed } from '../../types.js';
import { context as ctx } from '../fixtures/testContext.js';
import { takeAction } from '../../services/gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const loot = Object.values(SRD_ITEMS);

// The shared test context's lootTable is a curated subset; add the magic
// longsword so getItemData resolves it (with its magicBonus) during the attack.
const magicCtx = { ...ctx, lootTable: [...ctx.lootTable, SRD_ITEMS.longsword_plus_1] };

describe('applyDamageMultiplier — magical bypass of nonmagical resistance', () => {
  it('halves a nonmagical attack but a magical attack bypasses (full damage)', () => {
    const elemental = { nonmagical_resistances: ['slashing'] };
    expect(applyDamageMultiplier(10, 'slashing', elemental).damage).toBe(5);
    expect(applyDamageMultiplier(10, 'slashing', elemental, { magical: true }).damage).toBe(10);
  });

  it('does NOT bypass true (non-qualified) resistance — e.g. a swarm', () => {
    const swarm = { resistances: ['slashing'] };
    expect(applyDamageMultiplier(10, 'slashing', swarm, { magical: true }).damage).toBe(5);
  });

  it('immunity always applies, even to a magical attack', () => {
    expect(
      applyDamageMultiplier(10, 'fire', { immunities: ['fire'] }, { magical: true }).damage
    ).toBe(0);
  });
});

describe('computeTotalAc — +N magic armor / shield', () => {
  it('+1 plate armor adds 1 to the worn AC', () => {
    const inv = [{ instance_id: 'a', id: 'plate_armor_plus_1', name: 'Plate +1' }];
    // heavy armor: dexCap 0 → base 18 + 0 dex + 1 magic = 19.
    expect(computeTotalAc(10, 'a', null, inv, loot)).toBe(
      (SRD_ITEMS.plate_armor.armorAcBase ?? 0) + 1
    );
  });

  it("a +2 shield stacks on the shield's normal +2 AC", () => {
    const inv = [{ instance_id: 's', id: 'shield_plus_2', name: 'Shield +2' }];
    // unarmored 10 + dex 0 + shield ac_bonus 2 + magic 2 = 14.
    expect(computeTotalAc(10, null, 's', inv, loot)).toBe(14);
  });
});

// ─── Integration through the real attack path ────────────────────────────────
// A slashing creature that resists B/P/S only from NONMAGICAL attacks (like an
// elemental). A magic longsword should bypass it and deal full damage.
const seedFor = (): Seed => ({
  context_id: ctx.id,
  world_name: 'Magic Weapon Test',
  ship_name: 'Magic Weapon Test',
  intro: '',
  seed_id: 'magic-weapon',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {
    ['entry_hall']: [
      {
        id: `entry_hall#0`,
        name: 'Living Flame',
        hp: 300,
        ac: 5, // low AC so the attack reliably lands
        damage: '1d6',
        toHit: 3,
        xp: 20,
        nonmagical_resistances: ['slashing'],
      },
    ],
  },
  loot: {},
  npcs: {},
});

function fighterState(weaponId: string) {
  const pc = makeChar({
    id: 'pc-1',
    character_class: 'Fighter',
    level: 5,
    str: 18,
    hp: 50,
    max_hp: 50,
    inventory: [{ instance_id: 'w-1', id: weaponId, name: weaponId }],
    equipment: { main_hand: 'w-1' },
    weapon_proficiencies: ['simple', 'martial'],
  });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
    characters: [pc],
    active_character_id: 'pc-1',
    initiative_order: [
      { id: 'pc-1', roll: 18, is_enemy: false },
      { id: `entry_hall#0`, roll: 5, is_enemy: true },
    ],
    initiative_idx: 0,
    entities: [
      {
        id: 'pc-1',
        isEnemy: false,
        pos: { x: 4, y: 5 },
        hp: 50,
        maxHp: 50,
        conditions: [],
        condition_durations: {},
      },
      {
        id: `entry_hall#0`,
        isEnemy: true,
        pos: { x: 5, y: 5 },
        hp: 300,
        maxHp: 300,
        conditions: [],
        condition_durations: {},
      },
    ],
  };
}

describe('magic weapon — through the attack path', () => {
  it('a +1 longsword shows the +1 and bypasses nonmagical slashing resistance', async () => {
    mockRandom(0.5); // d20 ≈ 11 → a hit, not a nat 20
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: `entry_hall#0` },
      history: [],
      state: fighterState('longsword_plus_1'),
      seed: seedFor(),
      context: magicCtx,
    });
    expect(result.narrative).toMatch(/\+1 \(magic\)/);
    expect(result.narrative).not.toMatch(/resistant to slashing/); // bypassed
  });

  it('a plain longsword is halved by the same nonmagical slashing resistance', async () => {
    mockRandom(0.5);
    const result = await takeAction({
      action: { type: 'attack', targetEnemyId: `entry_hall#0` },
      history: [],
      state: fighterState('longsword'),
      seed: seedFor(),
      context: magicCtx,
    });
    expect(result.narrative).not.toMatch(/\(magic\)/);
    expect(result.narrative).toMatch(/resistant to slashing/); // not bypassed
  });
});
