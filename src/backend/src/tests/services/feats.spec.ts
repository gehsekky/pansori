// Tests for the feat machinery. Pansori is SRD-only; the catalog
// contains only Alert, Magic Initiate (arcane/divine/primal),
// Savage Attacker, and Skilled. PHB-only feats (Lucky, Sharpshooter,
// Tough, etc.) were removed in the SRD-only refactor.

import {
  applyFeatTake,
  canTakeFeat,
  getFeat,
  resetFeatLongRestResources,
} from '../../services/feats.js';
import { describe, expect, it } from 'vitest';
import { SRD_FEATS } from '../../campaignData/srd/feats.js';
import { context as ctx } from '../fixtures/testContext.js';
import { makeChar } from '../../test-fixtures.js';

describe('canTakeFeat', () => {
  it('returns empty string when the feat has no prereqs and PC does not have it', () => {
    const char = makeChar({ id: 'pc-1' });
    expect(canTakeFeat(char, SRD_FEATS.alert)).toBe('');
  });

  it('rejects taking the same feat twice', () => {
    const char = makeChar({ id: 'pc-1', feats: ['alert'] });
    expect(canTakeFeat(char, SRD_FEATS.alert)).toMatch(/already has the Alert feat/);
  });
});

describe('applyFeatTake — Alert', () => {
  it('records the feat id and narrates the initiative + surprise benefit', () => {
    const char = makeChar({ id: 'pc-1', level: 5 });
    const { newChar, narrative } = applyFeatTake(char, SRD_FEATS.alert);
    expect(newChar.feats).toContain('alert');
    expect(narrative).toMatch(/Alert feat/);
    expect(narrative).toMatch(/Initiative/);
  });
});

describe('applyFeatTake — Savage Attacker', () => {
  it('records the feat id; no take-time stat changes', () => {
    const char = makeChar({ id: 'pc-1', level: 5, hp: 30, max_hp: 30 });
    const { newChar } = applyFeatTake(char, SRD_FEATS.savage_attacker);
    expect(newChar.feats).toContain('savage_attacker');
    expect(newChar.max_hp).toBe(30);
    expect(newChar.hp).toBe(30);
  });
});

describe('applyFeatTake — Skilled', () => {
  it('grants three chosen skill proficiencies', () => {
    const char = makeChar({ id: 'pc-1', skill_proficiencies: [], feats: [] });
    const { newChar } = applyFeatTake(char, SRD_FEATS.skilled, {
      skillChoices: ['Stealth', 'Perception', 'Athletics'],
    });
    expect(newChar.skill_proficiencies).toEqual(
      expect.arrayContaining(['Stealth', 'Perception', 'Athletics'])
    );
    expect(newChar.feats).toContain('skilled');
  });
});

describe('applyFeatTake — Magic Initiate', () => {
  it('grants cantrips + L1 spell from the chosen list and seeds the free-cast token', () => {
    const char = makeChar({ id: 'pc-1', spells_known: [] });
    const { newChar } = applyFeatTake(char, SRD_FEATS.magic_initiate_arcane, {
      cantripChoices: ['fire_bolt', 'mage_hand'],
      l1Choice: 'magic_missile',
    });
    expect(newChar.feats).toContain('magic_initiate_arcane');
    expect(newChar.spells_known).toEqual(
      expect.arrayContaining(['fire_bolt', 'mage_hand', 'magic_missile'])
    );
    expect(newChar.class_resource_uses?.magic_initiate_l1_used).toBe(0);
    expect(newChar.feat_choices?.magic_initiate_arcane?.magicInitiateL1).toBe('magic_missile');
  });
});

describe('getFeat', () => {
  it('looks up a feat by id from context.featTable', () => {
    expect(getFeat('alert', ctx)?.name).toBe('Alert');
    expect(getFeat('nonexistent', ctx)).toBeUndefined();
  });
});

describe('resetFeatLongRestResources', () => {
  it('resets the Magic Initiate L1 free-cast token to 0 (available)', () => {
    const char = makeChar({
      id: 'pc-1',
      feats: ['magic_initiate_arcane'],
      class_resource_uses: { magic_initiate_l1_used: 1, rage_uses: 1 },
    });
    const next = resetFeatLongRestResources(char, ctx, char.class_resource_uses ?? {});
    expect(next.magic_initiate_l1_used).toBe(0);
    expect(next.rage_uses).toBe(1);
  });

  it('is a no-op for feats with no per-long-rest resource', () => {
    const char = makeChar({
      id: 'pc-1',
      feats: ['alert', 'savage_attacker'],
      class_resource_uses: { unrelated: 1 },
    });
    const next = resetFeatLongRestResources(char, ctx, char.class_resource_uses ?? {});
    expect(next).toEqual({ unrelated: 1 });
  });

  it('handles a character with no feats', () => {
    const char = makeChar({ id: 'pc-1', class_resource_uses: { rage_uses: 2 } });
    const next = resetFeatLongRestResources(char, ctx, char.class_resource_uses ?? {});
    expect(next).toEqual({ rage_uses: 2 });
  });
});

describe('take_feat action — integration through sandbox context', () => {
  it('rejects an unknown feat id', async () => {
    const { takeAction } = await import('../../services/gameEngine.js');
    const { makeState } = await import('../../test-fixtures.js');
    const state = makeState({ id: 'pc-1', level: 5, asi_pending: true });
    const result = await takeAction({
      action: { type: 'take_feat', featId: 'nonexistent' },
      history: [],
      state,
      seed: {
        context_id: ctx.id,
        world_name: 'Test',
        ship_name: 'Test',
        intro: '',
        seed_id: 'feat-test',
        rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
        enemies: {},
        loot: {},
        npcs: {},
      },
      context: ctx,
    });
    expect(result.narrative).toMatch(/Unknown feat/);
  });

  it('grants Alert on take_feat (origin feat — does not consume asi_pending)', async () => {
    const { takeAction } = await import('../../services/gameEngine.js');
    const { makeState } = await import('../../test-fixtures.js');
    const state = makeState({
      id: 'pc-1',
      level: 4,
      hp: 20,
      max_hp: 20,
      asi_pending: true,
    });
    const result = await takeAction({
      action: { type: 'take_feat', featId: 'alert' },
      history: [],
      state,
      seed: {
        context_id: ctx.id,
        world_name: 'Test',
        ship_name: 'Test',
        intro: '',
        seed_id: 'feat-test',
        rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
        enemies: {},
        loot: {},
        npcs: {},
      },
      context: ctx,
    });
    const pc = result.newState.characters[0];
    expect(pc.feats).toContain('alert');
    // Alert is 'origin', NOT 'general', so asi_pending is NOT consumed.
    expect(pc.asi_pending).toBe(true);
  });
});
