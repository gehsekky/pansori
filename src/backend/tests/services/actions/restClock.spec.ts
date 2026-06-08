// The in-game clock advances on rest: SRD short rest = 1 hour (60 min), long
// rest = 8 hours (480 min); only one long rest per 24 hours (1440 min).

import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeState, baseSandboxSeed as seed } from '../../../src/test-fixtures.js';
import { context as ctx } from '../../../src/campaignData/sandbox.js';
import { takeAction } from '../../../src/services/gameEngine.js';

afterEach(() => vi.restoreAllMocks());

// An injured PC (hp < max, hit dice available) so a rest is actually allowed.
const injured = { hp: 3, max_hp: 10, hit_die: 6, hit_dice_remaining: 2 };

const shortRest = (worldMinute: number, charOver = {}, stateOver = {}) =>
  takeAction({
    action: { type: 'short_rest' },
    history: [],
    state: makeState({ ...injured, ...charOver }, { world_minute: worldMinute, ...stateOver }),
    seed,
    context: ctx,
  });

const longRest = (worldMinute: number, stateOver = {}) =>
  takeAction({
    action: { type: 'long_rest' },
    history: [],
    state: makeState(injured, { world_minute: worldMinute, long_rested: false, ...stateOver }),
    seed,
    context: ctx,
  });

describe('rest advances the in-game clock', () => {
  it('short rest adds 60 minutes', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const r = await shortRest(480);
    expect(r.newState.world_minute).toBe(540);
  });

  it('a rejected short rest does NOT advance the clock', async () => {
    // At full HP → "already at full health" rejection before any clock change.
    const r = await shortRest(480, { hp: 10, max_hp: 10 });
    expect(r.newState.world_minute).toBe(480);
  });

  it('long rest adds 480 minutes and stamps last_long_rest_minute', async () => {
    const r = await longRest(480);
    expect(r.newState.world_minute).toBe(960);
    expect(r.newState.last_long_rest_minute).toBe(960);
  });
});

describe('one long rest per 24 hours', () => {
  it('blocks a second long rest before 24h have passed', async () => {
    // Last rest at 480; now only 1000 (520 min later) — still inside the window.
    const r = await longRest(1000, { last_long_rest_minute: 480 });
    expect(r.narrative).toContain('only one per 24 hours');
    expect(r.newState.world_minute).toBe(1000); // unchanged — rest rejected
    expect(r.newState.last_long_rest_minute).toBe(480);
  });

  it('allows a long rest once 24h have elapsed', async () => {
    // Last rest at 480; now 1920 (exactly 1440 later) — window cleared.
    const r = await longRest(1920, { last_long_rest_minute: 480 });
    expect(r.newState.world_minute).toBe(2400);
    expect(r.newState.last_long_rest_minute).toBe(2400);
  });

  it('the 24h gate fires even when long_rested is false (fresh-loaded session)', async () => {
    const r = await longRest(800, { last_long_rest_minute: 480, long_rested: false });
    expect(r.narrative).toContain('only one per 24 hours');
  });
});
