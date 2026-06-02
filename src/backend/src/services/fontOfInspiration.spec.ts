// RE-2 — Font of Inspiration (SRD 5.2.1, Bard L5): regain all expended uses of
// Bardic Inspiration on a Short or Long Rest (normally a long rest only). The
// short-rest refresh is gated on Bard L5+ in rest.ts (deletes the
// `class_resource_uses.bardic_inspiration` counter so it defaults back to full
// CHA-mod uses). This locks in that behavior end-to-end.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeState, baseSandboxSeed as seed } from '../test-fixtures.js';
import { context as ctx } from '../campaignData/sandbox.js';
import { takeAction } from './gameEngine.js';

afterEach(() => vi.restoreAllMocks());

// Injured (so the short rest is allowed) Bard with all Bardic Inspiration spent.
const bard = (level: number) =>
  makeState({
    character_class: 'Bard',
    level,
    cha: 16,
    hp: 3,
    max_hp: 10,
    hit_die: 8,
    hit_dice_remaining: 2,
    class_resource_uses: { bardic_inspiration: 0 },
  });

describe('Font of Inspiration — short-rest Bardic Inspiration refresh', () => {
  it('a Bard L5 regains Bardic Inspiration on a short rest', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const r = await takeAction({
      action: { type: 'short_rest' },
      history: [],
      state: bard(5),
      seed,
      context: ctx,
    });
    // The counter is cleared, so the next read defaults back to full uses.
    expect(r.newState.characters[0].class_resource_uses?.bardic_inspiration).toBeUndefined();
  });

  it('a Bard L4 does NOT (Font of Inspiration is not yet online)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const r = await takeAction({
      action: { type: 'short_rest' },
      history: [],
      state: bard(4),
      seed,
      context: ctx,
    });
    expect(r.newState.characters[0].class_resource_uses?.bardic_inspiration).toBe(0); // still spent
  });
});
