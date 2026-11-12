// Class resource pools on rests (SRD 5.2.1). Rage, Wild Shape and Channel
// Divinity regain ONE expended use on a Short Rest and all on a Long Rest, and
// every pool is sized by the owning class's level from its class table, for
// each class a multiclass character has (not only the primary one).

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  channelDivinityUsesMax,
  clericChannelDivinityUses,
  paladinChannelDivinityUses,
  wildShapeUsesMax,
} from '../../services/multiclass.js';
import { makeState, baseSandboxSeed as seed } from '../../test-fixtures.js';
import { context as ctx } from '../fixtures/testContext.js';
import { takeAction } from '../../services/gameEngine.js';

afterEach(() => vi.restoreAllMocks());

// Injured (so a short rest is allowed) with hit dice to spend.
const pc = (fields: Record<string, unknown>) =>
  makeState({ hp: 3, max_hp: 20, hit_die: 8, hit_dice_remaining: 3, ...fields });

const rest = (type: 'short_rest' | 'long_rest', state: ReturnType<typeof makeState>) => {
  vi.spyOn(Math, 'random').mockReturnValue(0.99);
  return takeAction({ action: { type }, history: [], state, seed, context: ctx });
};

const uses = async (type: 'short_rest' | 'long_rest', state: ReturnType<typeof makeState>) =>
  (await rest(type, state)).newState.characters[0].class_resource_uses ?? {};

describe('SRD class-table pool sizes', () => {
  it('Wild Shape: none before Druid 2, then 2 / 3 at 6 / 4 at 17', () => {
    expect([1, 2, 5, 6, 16, 17, 20].map(wildShapeUsesMax)).toEqual([0, 2, 2, 3, 3, 4, 4]);
  });

  it('Cleric Channel Divinity: none before 2, then 2 / 3 at 6 / 4 at 18', () => {
    expect([1, 2, 5, 6, 17, 18].map(clericChannelDivinityUses)).toEqual([0, 2, 2, 3, 3, 4]);
  });

  it('Paladin Channel Divinity: none before 3, then 2 / 3 at 11', () => {
    expect([2, 3, 10, 11, 20].map(paladinChannelDivinityUses)).toEqual([0, 2, 2, 3, 3]);
  });

  it('a Cleric/Paladin shares one pool sized by the larger class table', () => {
    const c = makeState({
      character_class: 'Paladin',
      level: 13,
      class_levels: { paladin: 11, cleric: 2 },
    }).characters[0];
    expect(channelDivinityUsesMax(c)).toBe(3);
  });
});

describe('Short Rest regains one use', () => {
  it('Wild Shape: one use back, not a full refill', async () => {
    const u = await uses(
      'short_rest',
      pc({ character_class: 'Druid', level: 6, class_resource_uses: { wild_shape: 0 } })
    );
    expect(u.wild_shape).toBe(1);
  });

  it('Wild Shape: never above the class-table maximum', async () => {
    const u = await uses(
      'short_rest',
      pc({ character_class: 'Druid', level: 6, class_resource_uses: { wild_shape: 3 } })
    );
    expect(u.wild_shape).toBe(3);
  });

  it('Rage: one use back (was none)', async () => {
    const u = await uses(
      'short_rest',
      pc({
        character_class: 'Barbarian',
        level: 6,
        hit_die: 12,
        class_resource_uses: { rage_uses: 1 },
      })
    );
    expect(u.rage_uses).toBe(2);
  });

  it('Channel Divinity: one use back, not a reset to the old 1-or-2', async () => {
    const u = await uses(
      'short_rest',
      pc({ character_class: 'Cleric', level: 6, class_resource_uses: { channel_divinity: 0 } })
    );
    expect(u.channel_divinity).toBe(1);
  });
});

describe('Long Rest refills to the class-table maximum', () => {
  it('Wild Shape: 4 at Druid 17 (was capped at 2)', async () => {
    const u = await uses(
      'long_rest',
      pc({ character_class: 'Druid', level: 17, class_resource_uses: { wild_shape: 0 } })
    );
    expect(u.wild_shape).toBe(4);
  });

  it('Channel Divinity: 4 at Cleric 18 (was capped at 2)', async () => {
    const u = await uses(
      'long_rest',
      pc({ character_class: 'Cleric', level: 18, class_resource_uses: { channel_divinity: 0 } })
    );
    expect(u.channel_divinity).toBe(4);
  });

  it("Channel Divinity: a Paladin's pool refills (it never did on a long rest)", async () => {
    const u = await uses(
      'long_rest',
      pc({
        character_class: 'Paladin',
        level: 11,
        hit_die: 10,
        class_resource_uses: { channel_divinity: 0 },
      })
    );
    expect(u.channel_divinity).toBe(3);
  });
});

describe('Long Rest sizes pools by class level for every class', () => {
  it('Fighter 5 / Barbarian 3: Rage refills to 3 (Barbarian 3), not missing or sized by level 8', async () => {
    const u = await uses(
      'long_rest',
      pc({
        character_class: 'Fighter',
        level: 8,
        class_levels: { fighter: 5, barbarian: 3 },
        class_resource_uses: { rage_uses: 0 },
      })
    );
    expect(u.rage_uses).toBe(3);
  });

  it('Sorcerer 6 / Warlock 4: Sorcery Points refill to 6, not 10', async () => {
    const u = await uses(
      'long_rest',
      pc({
        character_class: 'Sorcerer',
        level: 10,
        class_levels: { sorcerer: 6, warlock: 4 },
        class_resource_uses: { sorcery_points: 0 },
      })
    );
    expect(u.sorcery_points).toBe(6);
  });

  it('Wizard 4 / Monk 3: Focus Points refill to 3 though Monk is not the primary class', async () => {
    const u = await uses(
      'long_rest',
      pc({
        character_class: 'Wizard',
        level: 7,
        class_levels: { wizard: 4, monk: 3 },
        class_resource_uses: { ki_points: 0 },
      })
    );
    expect(u.ki_points).toBe(3);
  });

  it('a Druid has no Channel Divinity pool', async () => {
    const u = await uses('long_rest', pc({ character_class: 'Druid', level: 6 }));
    expect(u.channel_divinity).toBeUndefined();
  });
});
