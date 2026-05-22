// Magic Initiate feat — spell-grant + per-long-rest free L1 cast.
// Tests the take-time flow (cantrips + L1 land on spells_known,
// L1 choice recorded on feat_choices, free-cast token initialized)
// + the cast-time freebie (first cast doesn't spend a slot;
// subsequent casts that day do).

import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyFeatTake, getFeat, resetFeatLongRestResources } from '../feats.js';
import { makeChar, makeState } from '../../test-fixtures.js';
import type { Seed } from '../../types.js';
import { context as ctx } from '../../contexts/sandbox.js';
import { takeAction } from '../gameEngine.js';

afterEach(() => vi.restoreAllMocks());

describe('Magic Initiate — take_feat side effects', () => {
  it('adds chosen cantrips + L1 spell to spells_known', () => {
    const char = makeChar({ id: 'pc-1', spells_known: [] });
    const feat = getFeat('magic_initiate_arcane', ctx);
    if (!feat) throw new Error('feat not in context');
    const { newChar } = applyFeatTake(char, feat, {
      cantripChoices: ['fire_bolt', 'mage_hand'],
      l1Choice: 'magic_missile',
    });
    expect(newChar.spells_known).toEqual(
      expect.arrayContaining(['fire_bolt', 'mage_hand', 'magic_missile'])
    );
  });

  it('records the L1 choice on feat_choices so the cast handler can find it', () => {
    const char = makeChar({ id: 'pc-1' });
    const feat = getFeat('magic_initiate_arcane', ctx);
    if (!feat) throw new Error('feat not in context');
    const { newChar } = applyFeatTake(char, feat, {
      cantripChoices: ['fire_bolt', 'mage_hand'],
      l1Choice: 'magic_missile',
    });
    expect(newChar.feat_choices?.magic_initiate_arcane?.magicInitiateL1).toBe('magic_missile');
  });

  it('initializes the free-cast token at 0 (available)', () => {
    const char = makeChar({ id: 'pc-1' });
    const feat = getFeat('magic_initiate_arcane', ctx);
    if (!feat) throw new Error('feat not in context');
    const { newChar } = applyFeatTake(char, feat, {
      cantripChoices: ['fire_bolt'],
      l1Choice: 'magic_missile',
    });
    expect(newChar.class_resource_uses?.magic_initiate_l1_used).toBe(0);
  });

  it('falls through gracefully when no choices are supplied yet', () => {
    const char = makeChar({ id: 'pc-1' });
    const feat = getFeat('magic_initiate_divine', ctx);
    if (!feat) throw new Error('feat not in context');
    const { newChar, narrative } = applyFeatTake(char, feat, {});
    // No grants — placeholder narrative.
    expect(narrative).toMatch(/no choices supplied yet/);
    expect(newChar.spells_known).toEqual([]);
    // Token still initialized so future picks work.
    expect(newChar.class_resource_uses?.magic_initiate_l1_used).toBe(0);
  });
});

describe('Magic Initiate — free L1 cast at cast time', () => {
  const enemyId = `${ctx.startRoomId}#0`;
  const seedWithGoblin: Seed = {
    context_id: ctx.id,
    world_name: 'MI Test',
    ship_name: 'MI Test',
    intro: '',
    seed_id: 'mi-test',
    rooms: [{ id: ctx.startRoomId, name: 'Start', desc: '' }],
    connections: { [ctx.startRoomId]: [] },
    enemies: {
      [ctx.startRoomId]: [
        {
          id: enemyId,
          name: 'Goblin',
          hp: 30,
          ac: 12,
          damage: '1d6',
          toHit: 3,
          xp: 20,
        },
      ],
    },
    loot: {},
    npcs: {},
  };

  function buildMagicInitiatePc(): ReturnType<typeof makeChar> {
    return makeChar({
      id: 'pc-1',
      character_class: 'Fighter',
      level: 3,
      int: 14,
      feats: ['magic_initiate_arcane'],
      feat_choices: { magic_initiate_arcane: { magicInitiateL1: 'magic_missile' } },
      spells_known: ['fire_bolt', 'mage_hand', 'magic_missile'],
      spell_slots_max: {},
      spell_slots_used: {},
      class_resource_uses: { magic_initiate_l1_used: 0 },
    });
  }

  it('casts the recorded L1 spell without consuming a slot when token is available', async () => {
    const pc = buildMagicInitiatePc();
    const state = {
      ...makeState({ id: 'pc-1' }, { current_room: ctx.startRoomId, combat_active: true }),
      characters: [pc],
      active_character_id: 'pc-1',
      initiative_order: [
        { id: 'pc-1', roll: 18, is_enemy: false },
        { id: enemyId, roll: 5, is_enemy: true },
      ],
      initiative_idx: 0,
      entities: [
        {
          id: 'pc-1',
          isEnemy: false,
          pos: { x: 4, y: 5 },
          hp: 20,
          maxHp: 20,
          conditions: [],
          condition_durations: {},
        },
        {
          id: enemyId,
          isEnemy: true,
          pos: { x: 5, y: 5 },
          hp: 30,
          maxHp: 30,
          conditions: [],
          condition_durations: {},
        },
      ],
    };
    const result = await takeAction({
      action: {
        type: 'cast_spell',
        spellId: 'magic_missile',
        slotLevel: 1,
        targetEnemyId: enemyId,
      },
      history: [],
      state,
      seed: seedWithGoblin,
      context: ctx,
    });
    const next = result.newState.characters[0];
    // Token consumed.
    expect(next.class_resource_uses?.magic_initiate_l1_used).toBe(1);
    // No L1 slot was used — PC had 0 max, so this would have rejected
    // without the Magic Initiate freebie.
    expect(next.spell_slots_used?.[1]).toBeUndefined();
    expect(result.narrative).not.toMatch(/No level-1 spell slots remaining/);
  });

  it('rejects the second cast when the token is already used and no slot exists', async () => {
    const pc = buildMagicInitiatePc();
    pc.class_resource_uses = { magic_initiate_l1_used: 1 };
    const state = {
      ...makeState({ id: 'pc-1' }, { current_room: ctx.startRoomId, combat_active: true }),
      characters: [pc],
      active_character_id: 'pc-1',
      initiative_order: [
        { id: 'pc-1', roll: 18, is_enemy: false },
        { id: enemyId, roll: 5, is_enemy: true },
      ],
      initiative_idx: 0,
      entities: [
        {
          id: 'pc-1',
          isEnemy: false,
          pos: { x: 4, y: 5 },
          hp: 20,
          maxHp: 20,
          conditions: [],
          condition_durations: {},
        },
        {
          id: enemyId,
          isEnemy: true,
          pos: { x: 5, y: 5 },
          hp: 30,
          maxHp: 30,
          conditions: [],
          condition_durations: {},
        },
      ],
    };
    const result = await takeAction({
      action: {
        type: 'cast_spell',
        spellId: 'magic_missile',
        slotLevel: 1,
        targetEnemyId: enemyId,
      },
      history: [],
      state,
      seed: seedWithGoblin,
      context: ctx,
    });
    // No slot to spend; rejection.
    expect(result.narrative).toMatch(/No level-1 spell slots remaining/);
  });
});

describe('Magic Initiate — long-rest reset', () => {
  it('clears magic_initiate_l1_used so the next day grants the free cast again', () => {
    const char = makeChar({
      id: 'pc-1',
      feats: ['magic_initiate_arcane'],
      class_resource_uses: { magic_initiate_l1_used: 1 },
    });
    const reset = resetFeatLongRestResources(char, ctx, char.class_resource_uses ?? {});
    expect(reset.magic_initiate_l1_used).toBe(0);
  });

  it('is a no-op when the PC does not have Magic Initiate', () => {
    const char = makeChar({
      id: 'pc-1',
      feats: ['tough'],
      class_resource_uses: { magic_initiate_l1_used: 1 },
    });
    const reset = resetFeatLongRestResources(char, ctx, char.class_resource_uses ?? {});
    // Field unchanged — only feats with the matching effect trigger a reset.
    expect(reset.magic_initiate_l1_used).toBe(1);
  });
});
