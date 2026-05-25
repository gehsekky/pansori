// Epic Boon feats (SRD 5.2.1, L19+). This suite covers the take-time
// machinery shared by all 7 boons: the level-19 prerequisite, the +1 ability
// bump capped at 30, Truesight's range grant, and the asi_pending consumption
// when a boon is taken in lieu of the level-19 Ability Score Improvement. The
// per-boon runtime effects (Peerless Aim, Improve Fate, etc.) are exercised in
// their own suites.

import { applyFeatTake, canTakeFeat } from './feats.js';
import { describe, expect, it } from 'vitest';
import { SRD_FEATS } from '../contexts/srd/feats.js';
import { context as ctx } from '../contexts/sandbox.js';
import { makeChar } from '../test-fixtures.js';

const BOON_IDS = [
  'boon_combat_prowess',
  'boon_dimensional_travel',
  'boon_fate',
  'boon_irresistible_offense',
  'boon_spell_recall',
  'boon_night_spirit',
  'boon_truesight',
] as const;

describe('epic boons — catalog', () => {
  it('registers exactly the 7 SRD boons, all epic-boon category at L19+', () => {
    const boons = Object.values(SRD_FEATS).filter((f) => f.category === 'epic-boon');
    expect(boons.map((b) => b.id).sort()).toEqual([...BOON_IDS].sort());
    for (const b of boons) {
      expect(b.prerequisites?.minLevel).toBe(19);
      expect(b.abilityBonus).toBeDefined();
    }
  });
});

describe('canTakeFeat — level-19 prerequisite', () => {
  it('rejects an epic boon below level 19 and accepts at 19', () => {
    expect(canTakeFeat(makeChar({ id: 'pc-1', level: 18 }), SRD_FEATS.boon_truesight)).toMatch(
      /requires character level 19/
    );
    expect(canTakeFeat(makeChar({ id: 'pc-1', level: 19 }), SRD_FEATS.boon_truesight)).toBe('');
  });
});

describe('applyFeatTake — epic-boon ability bonus', () => {
  it('adds +1 to the chosen ability and records the pick', () => {
    const char = makeChar({ id: 'pc-1', level: 19, dex: 17 });
    const { newChar, narrative } = applyFeatTake(char, SRD_FEATS.boon_combat_prowess, {
      abilityChoice: 'dex',
    });
    expect(newChar.feats).toContain('boon_combat_prowess');
    expect(newChar.dex).toBe(18);
    expect(newChar.feat_choices?.boon_combat_prowess?.abilityBonus).toBe('dex');
    expect(narrative).toMatch(/Peerless Aim/);
  });

  it('caps the boosted ability at 30', () => {
    const char = makeChar({ id: 'pc-1', level: 19, str: 30 });
    const { newChar } = applyFeatTake(char, SRD_FEATS.boon_irresistible_offense, {
      abilityChoice: 'str',
    });
    expect(newChar.str).toBe(30);
  });
});

describe('applyFeatTake — Boon of Truesight', () => {
  it('grants a 60-foot Truesight range', () => {
    const char = makeChar({ id: 'pc-1', level: 19 });
    const { newChar, narrative } = applyFeatTake(char, SRD_FEATS.boon_truesight, {
      abilityChoice: 'wis',
    });
    expect(newChar.truesight_ft).toBe(60);
    expect(narrative).toMatch(/Truesight out to 60 feet/);
  });
});

describe('take_feat action — epic boon consumes the L19 ASI', () => {
  it('clears asi_pending when an epic boon is taken in lieu of the improvement', async () => {
    const { takeAction } = await import('./gameEngine.js');
    const { makeState } = await import('../test-fixtures.js');
    const state = makeState({ id: 'pc-1', level: 19, hp: 50, max_hp: 50, asi_pending: true });
    const result = await takeAction({
      action: { type: 'take_feat', featId: 'boon_truesight', abilityChoice: 'wis' },
      history: [],
      state,
      seed: {
        context_id: ctx.id,
        world_name: 'Test',
        ship_name: 'Test',
        intro: '',
        seed_id: 'boon-test',
        rooms: [{ id: ctx.startRoomId, name: 'Start', desc: '' }],
        connections: { [ctx.startRoomId]: [] },
        enemies: {},
        loot: {},
        npcs: {},
      },
      context: ctx,
    });
    const pc = result.newState.characters[0];
    expect(pc.feats).toContain('boon_truesight');
    expect(pc.truesight_ft).toBe(60);
    expect(pc.asi_pending).toBe(false);
  });
});
