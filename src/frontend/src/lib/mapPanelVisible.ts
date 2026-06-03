import type { GameState } from '../types';

/**
 * Whether the top-of-column map panel should render in the game view.
 *
 * It's hidden on the terminal screens (escaped / all-dead) AND during the
 * post-combat "Continue" gate (`combat_over_pending`). The gate must own the
 * screen so the map's clickable cells can't issue a `marker_move` that bypasses
 * it — `combat_over_pending` is only cleared by Continue, so a bypass leaves the
 * flag stuck and the gate resurfaces later (e.g. on entering a peaceful town).
 *
 * Regression guard for the map-to-top layout change.
 */
export function mapPanelVisible(
  gameState: Pick<GameState, 'combat_over_pending'> | null | undefined,
  opts: { escaped: boolean; allDead: boolean }
): boolean {
  if (!gameState || opts.escaped || opts.allDead) return false;
  if (gameState.combat_over_pending) return false;
  return true;
}
