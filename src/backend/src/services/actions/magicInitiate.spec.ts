// Magic Initiate feat — spell-grant + per-long-rest free L1 cast.
// Tests the take-time flow (cantrips + L1 land on spells_known,
// L1 choice recorded on feat_choices, free-cast token initialized)
// + the cast-time freebie (first cast doesn't spend a slot;
// subsequent casts that day do).

import type { GameState, Seed } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyFeatTake, getFeat, resetFeatLongRestResources } from '../feats.js';
import { baseSandboxSeed, makeChar, makeState } from '../../test-fixtures.js';
import { generateChoices, takeAction } from '../gameEngine.js';
import { context as ctx } from '../../campaignData/sandbox.js';

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
  const enemyId = `entry_hall#0`;
  const seedWithGoblin: Seed = {
    context_id: ctx.id,
    world_name: 'MI Test',
    ship_name: 'MI Test',
    intro: '',
    seed_id: 'mi-test',
    rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
    enemies: {
      ['entry_hall']: [
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
      ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
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
      ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall', combat_active: true }),
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

describe('Magic Initiate — choice validation (take_feat action)', () => {
  function makeState1(char: ReturnType<typeof makeChar>) {
    return {
      ...makeState({ id: char.id, asi_pending: true }),
      characters: [char],
      active_character_id: char.id,
    };
  }

  const minimalSeed: Seed = {
    context_id: ctx.id,
    world_name: 'MI Validation Test',
    ship_name: 'MI Validation Test',
    intro: '',
    seed_id: 'mi-validate',
    rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
    enemies: {},
    loot: {},
    npcs: {},
  };

  it('rejects cantrips off the matching spell list', async () => {
    const pc = makeChar({ id: 'pc-1', level: 4, asi_pending: true });
    const result = await takeAction({
      action: {
        type: 'take_feat',
        featId: 'magic_initiate_divine',
        // Fire Bolt is on the arcane list — wrong for the divine variant.
        cantripChoices: ['fire_bolt', 'sacred_flame'],
        l1Choice: 'cure_wounds',
      },
      history: [],
      state: makeState1(pc),
      seed: minimalSeed,
      context: ctx,
    });
    expect(result.narrative).toMatch(/not on the divine spell list/);
    expect(result.newState.characters[0].feats ?? []).not.toContain('magic_initiate_divine');
  });

  it('rejects when the L1 choice is wrong-level', async () => {
    const pc = makeChar({ id: 'pc-1', level: 4, asi_pending: true });
    const result = await takeAction({
      action: {
        type: 'take_feat',
        featId: 'magic_initiate_arcane',
        cantripChoices: ['fire_bolt', 'vicious_mockery'],
        // Hold Person is L2, not L1.
        l1Choice: 'hold_person',
      },
      history: [],
      state: makeState1(pc),
      seed: minimalSeed,
      context: ctx,
    });
    expect(result.narrative).toMatch(/not a level-1 spell/);
  });

  it('rejects when cantrip count is wrong', async () => {
    const pc = makeChar({ id: 'pc-1', level: 4, asi_pending: true });
    const result = await takeAction({
      action: {
        type: 'take_feat',
        featId: 'magic_initiate_arcane',
        cantripChoices: ['fire_bolt'], // need 2
        l1Choice: 'magic_missile',
      },
      history: [],
      state: makeState1(pc),
      seed: minimalSeed,
      context: ctx,
    });
    expect(result.narrative).toMatch(/exactly 2 cantrip choice/);
  });

  it('accepts a valid Arcane pick (Fire Bolt + Vicious Mockery cantrips + Magic Missile L1)', async () => {
    const pc = makeChar({ id: 'pc-1', level: 4, asi_pending: true });
    // mage_hand isn't in the SRD set; use fire_bolt + vicious_mockery
    // (both tagged arcane).
    const result = await takeAction({
      action: {
        type: 'take_feat',
        featId: 'magic_initiate_arcane',
        cantripChoices: ['fire_bolt', 'vicious_mockery'],
        l1Choice: 'magic_missile',
      },
      history: [],
      state: makeState1(pc),
      seed: minimalSeed,
      context: ctx,
    });
    expect(result.newState.characters[0].feats ?? []).toContain('magic_initiate_arcane');
    expect(result.newState.characters[0].spells_known).toEqual(
      expect.arrayContaining(['fire_bolt', 'vicious_mockery', 'magic_missile'])
    );
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

describe('Magic Initiate — free L1 cast surfaces as a labeled combat choice', () => {
  // A Fighter (no spell slots) with Magic Initiate Divine → Cure Wounds.
  const fighterMI = (over: Partial<ReturnType<typeof makeChar>> = {}): GameState =>
    makeState(
      {
        id: 'pc-1',
        character_class: 'Fighter',
        level: 1,
        hp: 5,
        max_hp: 10, // injured, so the heal-spell choice is offered
        spells_known: ['cure_wounds'],
        spell_slots_max: {},
        spell_slots_used: {},
        feat_choices: { magic_initiate_divine: { magicInitiateL1: 'cure_wounds' } },
        class_resource_uses: { magic_initiate_l1_used: 0 },
        ...over,
      },
      { combat_active: true }
    );

  const castLabels = (st: GameState) =>
    generateChoices(st, baseSandboxSeed, ctx)
      .filter((c) => c.action.type === 'cast_spell')
      .map((c) => c.label);

  it('a slot-less caster sees the "free, Magic Initiate" cast even with no slots', () => {
    const labels = castLabels(fighterMI());
    expect(labels.some((l) => /Cure Wounds/.test(l) && /free, Magic Initiate/.test(l))).toBe(true);
  });

  it('once the freebie is spent, the spell drops out (no slot to fall back on)', () => {
    const labels = castLabels(fighterMI({ class_resource_uses: { magic_initiate_l1_used: 1 } }));
    expect(labels.some((l) => /Cure Wounds/.test(l))).toBe(false);
  });
});
