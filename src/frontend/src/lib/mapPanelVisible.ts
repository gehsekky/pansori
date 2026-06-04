import type { GameState } from '../types';

/**
 * Whether the top-of-column map panel should render in the game view.
 *
 * It's hidden on the escaped terminal screen AND during the post-combat
 * "Continue" gate (`combat_over_pending`). The gate must own the screen so the
 * map's clickable cells can't issue a `marker_move` that bypasses it —
 * `combat_over_pending` is only cleared by Continue, so a bypass leaves the flag
 * stuck and the gate resurfaces later (e.g. on entering a peaceful town).
 *
 * On a party wipe (`allDead`) the map STAYS visible — the final battlefield
 * shows beside the "Hero Deceased" notice — so it's intentionally not a hide
 * condition here.
 *
 * Regression guard for the map-to-top layout change.
 */
export function mapPanelVisible(
  gameState: Pick<GameState, 'combat_over_pending'> | null | undefined,
  opts: { escaped: boolean; allDead: boolean }
): boolean {
  void opts.allDead; // intentionally not a hide condition — see doc above
  if (!gameState || opts.escaped) return false;
  if (gameState.combat_over_pending) return false;
  return true;
}
