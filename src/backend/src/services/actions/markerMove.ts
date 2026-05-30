import type { ActionHandler } from './types.js';
import type { GridPos } from '../../types.js';
import { resolveMarkerMove } from '../mapEngine.js';

/**
 * `marker_move`: move the single party marker on the current grid (regional /
 * town / local-exploration) to a destination cell. Free pathfinding — no combat
 * movement budget — so it's blocked during combat (use `grid_move` there).
 * Arriving on a transition cell (a region site, a town venue, or a room exit)
 * descends / ascends / changes rooms via `resolveMarkerMove`. (3-level grid map
 * model; the campaign replacement for `travel` / `enter_district` / room `move`.)
 */
export const handleMarkerMove: ActionHandler<{ type: 'marker_move'; to: GridPos }> = (
  ctx,
  action
) => {
  if (ctx.actor.kind !== 'pc') return { rejected: 'Only the party can travel the map.' };
  if (ctx.st.combat_active) {
    ctx.narrative = 'You cannot wander the map while in combat.';
    return;
  }
  const res = resolveMarkerMove(ctx.context.campaign, ctx.seed.rooms, ctx.st, action.to);
  if (res.rejected) {
    ctx.narrative = res.rejected;
    return;
  }
  ctx.st = res.st;
  ctx.narrative = (ctx.narrative ?? '') + (res.narrative || ' The party moves across the map.');
  // Regional travel-time flavor (whole-hour granularity reads cleanly).
  if (res.elapsedHours >= 1) {
    ctx.narrative += ` (${Math.round(res.elapsedHours)} hr of travel.)`;
  }
  // A random encounter interrupted the march. Dropping the party into a local
  // encounter map (combat) is wired in a follow-up; surface it for now.
  if (res.encounter) {
    ctx.narrative += ` ⚔️ Ambush! A ${res.encounter} blocks the way.`;
  }
};
