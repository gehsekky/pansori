// The top-of-column map panel is hidden only on the "escaped" terminal screen.
// It STAYS visible during the post-combat "Continue" gate (combat_over_pending)
// and on a party wipe — the caller renders it READ-ONLY in the gate (no click
// handlers) so its cells can't issue a marker_move that bypasses the gate (which
// once left combat_over_pending stuck and resurfaced "THE FIGHT IS OVER" in a
// peaceful town).

import { describe, expect, it } from 'vitest';
import type { GameState } from '../types';
import { mapPanelVisible } from './mapPanelVisible';

const gs = (over: boolean): Pick<GameState, 'combat_over_pending'> => ({
  combat_over_pending: over,
});

describe('mapPanelVisible', () => {
  it('shows the map in normal exploration (no gates set)', () => {
    expect(mapPanelVisible(gs(false), { escaped: false, allDead: false })).toBe(true);
  });

  it('KEEPS the map visible during the post-combat Continue gate (rendered read-only)', () => {
    expect(mapPanelVisible(gs(true), { escaped: false, allDead: false })).toBe(true);
  });

  it('hides the map on the "escaped" terminal screen', () => {
    expect(mapPanelVisible(gs(false), { escaped: true, allDead: false })).toBe(false);
  });

  it('KEEPS the map visible when the whole party is dead (final battlefield)', () => {
    expect(mapPanelVisible(gs(false), { escaped: false, allDead: true })).toBe(true);
  });

  it('hides the map when there is no game state', () => {
    expect(mapPanelVisible(null, { escaped: false, allDead: false })).toBe(false);
    expect(mapPanelVisible(undefined, { escaped: false, allDead: false })).toBe(false);
  });
});
