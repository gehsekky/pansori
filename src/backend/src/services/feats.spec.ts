import { applyFeatTake, canTakeFeat, getFeat } from './feats.js';
import { describe, expect, it } from 'vitest';
import { SRD_FEATS } from '../contexts/srd/feats.js';
import { context as ctx } from '../contexts/sandbox.js';
import { makeChar } from '../test-fixtures.js';

describe('canTakeFeat', () => {
  it('returns empty string when the feat has no prereqs and PC does not have it', () => {
    const char = makeChar({ id: 'pc-1' });
    expect(canTakeFeat(char, SRD_FEATS.tough)).toBe('');
  });

  it('rejects taking the same feat twice', () => {
    const char = makeChar({ id: 'pc-1', feats: ['tough'] });
    expect(canTakeFeat(char, SRD_FEATS.tough)).toMatch(/already has the Tough feat/);
  });

  it('enforces minLevel prerequisite', () => {
    // Sharpshooter requires level 4.
    const lowLevel = makeChar({ id: 'pc-1', level: 1 });
    expect(canTakeFeat(lowLevel, SRD_FEATS.sharpshooter)).toMatch(/level 4/);
    const highLevel = makeChar({ id: 'pc-1', level: 4 });
    expect(canTakeFeat(highLevel, SRD_FEATS.sharpshooter)).toBe('');
  });
});

describe('applyFeatTake — Tough (hp-per-level)', () => {
  it('grants +2 HP per character level (max + current) and records the feat id', () => {
    const char = makeChar({ id: 'pc-1', level: 5, hp: 30, max_hp: 30 });
    const { newChar, narrative } = applyFeatTake(char, SRD_FEATS.tough);
    expect(newChar.feats).toContain('tough');
    expect(newChar.max_hp).toBe(40); // 30 + 2*5
    expect(newChar.hp).toBe(40);
    expect(narrative).toMatch(/Tough feat/);
    expect(narrative).toMatch(/\+10 max HP/);
  });

  it("doesn't heal beyond max — both max_hp and hp get the same delta", () => {
    const char = makeChar({ id: 'pc-1', level: 3, hp: 5, max_hp: 18 });
    const { newChar } = applyFeatTake(char, SRD_FEATS.tough);
    expect(newChar.max_hp).toBe(24); // 18 + 2*3
    expect(newChar.hp).toBe(11); // 5 + 2*3 (preserves the wound)
  });
});

describe('applyFeatTake — Lucky (d20-reroll)', () => {
  it('initializes luck-point pool on class_resource_uses', () => {
    const char = makeChar({ id: 'pc-1' });
    const { newChar, narrative } = applyFeatTake(char, SRD_FEATS.lucky);
    expect(newChar.feats).toContain('lucky');
    expect(newChar.class_resource_uses?.feat_lucky_uses).toBe(3);
    expect(narrative).toMatch(/3 luck points/);
  });
});

describe('applyFeatTake — Sharpshooter (ranged-toggle)', () => {
  it('registers the feat without mutating stats — toggle is at attack time', () => {
    const char = makeChar({ id: 'pc-1', level: 5, hp: 30, max_hp: 30 });
    const { newChar } = applyFeatTake(char, SRD_FEATS.sharpshooter);
    expect(newChar.feats).toContain('sharpshooter');
    // No HP / ability changes — only the feat id is recorded.
    expect(newChar.max_hp).toBe(30);
    expect(newChar.hp).toBe(30);
  });
});

describe('getFeat', () => {
  it('looks up a feat by id from context.featTable', () => {
    expect(getFeat('tough', ctx)?.name).toBe('Tough');
    expect(getFeat('nonexistent', ctx)).toBeUndefined();
  });
});

describe('take_feat action — integration through sandbox context', () => {
  it('rejects an unknown feat id', async () => {
    const { takeAction } = await import('./gameEngine.js');
    const { makeState } = await import('../test-fixtures.js');
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
        rooms: [{ id: ctx.startRoomId, name: 'Start', desc: '' }],
        connections: { [ctx.startRoomId]: [] },
        enemies: {},
        loot: {},
        npcs: {},
      },
      context: ctx,
    });
    expect(result.narrative).toMatch(/Unknown feat/);
  });

  it('rejects taking Sharpshooter at level 1 (prereq fail)', async () => {
    const { takeAction } = await import('./gameEngine.js');
    const { makeState } = await import('../test-fixtures.js');
    const state = makeState({ id: 'pc-1', level: 1, asi_pending: true });
    const result = await takeAction({
      action: { type: 'take_feat', featId: 'sharpshooter' },
      history: [],
      state,
      seed: {
        context_id: ctx.id,
        world_name: 'Test',
        ship_name: 'Test',
        intro: '',
        seed_id: 'feat-test',
        rooms: [{ id: ctx.startRoomId, name: 'Start', desc: '' }],
        connections: { [ctx.startRoomId]: [] },
        enemies: {},
        loot: {},
        npcs: {},
      },
      context: ctx,
    });
    expect(result.narrative).toMatch(/level 4/);
  });

  it('grants Tough on take_feat and consumes asi_pending when applicable', async () => {
    const { takeAction } = await import('./gameEngine.js');
    const { makeState } = await import('../test-fixtures.js');
    const state = makeState({
      id: 'pc-1',
      level: 4,
      hp: 20,
      max_hp: 20,
      asi_pending: true,
    });
    const result = await takeAction({
      action: { type: 'take_feat', featId: 'tough' },
      history: [],
      state,
      seed: {
        context_id: ctx.id,
        world_name: 'Test',
        ship_name: 'Test',
        intro: '',
        seed_id: 'feat-test',
        rooms: [{ id: ctx.startRoomId, name: 'Start', desc: '' }],
        connections: { [ctx.startRoomId]: [] },
        enemies: {},
        loot: {},
        npcs: {},
      },
      context: ctx,
    });
    const pc = result.newState.characters[0];
    expect(pc.feats).toContain('tough');
    // Tough is an 'origin' feat, NOT 'general', so asi_pending is NOT consumed
    // (origin feats don't compete with ASI slots).
    expect(pc.asi_pending).toBe(true);
    expect(pc.max_hp).toBe(28); // 20 + 2*4
  });
});
