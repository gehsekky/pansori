// Regression guard for the map-to-top layout: the top-of-column map panel must
// be HIDDEN during the post-combat "Continue" gate (combat_over_pending) so its
// clickable cells can't issue a marker_move that bypasses the gate — which left
// combat_over_pending stuck and resurfaced "THE FIGHT IS OVER" in a peaceful
// town. Also hidden on the terminal (escaped / all-dead) screens.

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

  it('HIDES the map during the post-combat Continue gate (the regression)', () => {
    expect(mapPanelVisible(gs(true), { escaped: false, allDead: false })).toBe(false);
  });

  it('hides the map on the "escaped" terminal screen', () => {
    expect(mapPanelVisible(gs(false), { escaped: true, allDead: false })).toBe(false);
  });

  it('hides the map when the whole party is dead', () => {
    expect(mapPanelVisible(gs(false), { escaped: false, allDead: true })).toBe(false);
  });

  it('hides the map when there is no game state', () => {
    expect(mapPanelVisible(null, { escaped: false, allDead: false })).toBe(false);
    expect(mapPanelVisible(undefined, { escaped: false, allDead: false })).toBe(false);
  });
});
