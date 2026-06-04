import type { GameState } from '../types';

/**
 * Whether the top-of-column map panel should render in the game view.
 *
 * It's hidden only on the "escaped" terminal screen. It STAYS visible:
 *  - on a party wipe (`allDead`) — the final battlefield shows beside the
 *    "Hero Deceased" notice;
 *  - during the post-combat "Continue" gate (`combat_over_pending`) — the player
 *    should still see the cleared battlefield. The caller renders the map
 *    READ-ONLY during the gate (no marker_move / talk / attack handlers) so its
 *    cells can't bypass the gate (`combat_over_pending` is only cleared by
 *    Continue; a stray marker_move would leave the flag stuck and resurface the
 *    gate later, e.g. on entering a peaceful town).
 *
 * Regression guard for the map-to-top layout change.
 */
export function mapPanelVisible(
  gameState: Pick<GameState, 'combat_over_pending'> | null | undefined,
  opts: { escaped: boolean; allDead: boolean }
): boolean {
  void opts.allDead; // not a hide condition — see doc above
  return !!gameState && !opts.escaped;
}
