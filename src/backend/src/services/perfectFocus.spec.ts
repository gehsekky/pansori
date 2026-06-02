// RE-2 — Perfect Focus (SRD 5.2.1, Monk L15): when you roll Initiative and
// don't use Uncanny Metabolism, regain Focus Points until you have 4 (if you
// have 3 or fewer). `perfectFocusRefresh` (multiclass.ts) runs in runCombatStart
// AFTER uncannyMetabolismRefresh, so when Uncanny fired (ki already at max ≥4)
// this is a no-op — exactly the "don't use Uncanny Metabolism" fallback.

import { CORRIDOR_ID, makeChar, makeState, seedWithEnemy } from '../test-fixtures.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { context as ctx } from '../campaignData/sandbox.js';
import { perfectFocusRefresh } from './multiclass.js';
import { takeAction } from './gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const ki = (c: ReturnType<typeof makeChar>) => c.class_resource_uses?.ki_points;
const monk15 = (kiPoints: number) =>
  makeChar({ character_class: 'Monk', level: 15, class_resource_uses: { ki_points: kiPoints } });

describe('perfectFocusRefresh', () => {
  it('tops Focus Points up to 4 when 3 or fewer', () => {
    expect(ki(perfectFocusRefresh(monk15(0)))).toBe(4);
    expect(ki(perfectFocusRefresh(monk15(3)))).toBe(4);
  });

  it('leaves 4+ untouched', () => {
    expect(ki(perfectFocusRefresh(monk15(4)))).toBe(4);
    expect(ki(perfectFocusRefresh(monk15(10)))).toBe(10);
  });

  it('is a no-op below L15 and for non-Monks', () => {
    expect(
      ki(
        perfectFocusRefresh(
          makeChar({ character_class: 'Monk', level: 14, class_resource_uses: { ki_points: 0 } })
        )
      )
    ).toBe(0);
    expect(
      ki(
        perfectFocusRefresh(
          makeChar({ character_class: 'Fighter', level: 20, class_resource_uses: { ki_points: 0 } })
        )
      )
    ).toBe(0);
  });
});

describe('Perfect Focus — on rolling initiative (integration)', () => {
  it('tops a Monk L15 to 4 ki when Uncanny Metabolism is unavailable', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = makeState(
      {
        character_class: 'Monk',
        level: 15,
        // Uncanny Metabolism already spent this rest → Perfect Focus does the work.
        class_resource_uses: { ki_points: 1, uncanny_metabolism_used: 1 },
      },
      { current_room: CORRIDOR_ID, visited_rooms: ['entry_hall', CORRIDOR_ID] }
    );
    const r = await takeAction({
      action: { type: 'attack' },
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });
    expect(r.newState.characters[0].class_resource_uses?.ki_points).toBe(4);
  });

  it('defers to Uncanny Metabolism (which restores all ki) when that is available', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = makeState(
      { character_class: 'Monk', level: 15, class_resource_uses: { ki_points: 1 } },
      { current_room: CORRIDOR_ID, visited_rooms: ['entry_hall', CORRIDOR_ID] }
    );
    const r = await takeAction({
      action: { type: 'attack' },
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });
    // Uncanny Metabolism fired (ki → max 15), so Perfect Focus was a no-op.
    expect(r.newState.characters[0].class_resource_uses?.ki_points).toBe(15);
    expect(r.newState.characters[0].class_resource_uses?.uncanny_metabolism_used).toBe(1);
  });
});
