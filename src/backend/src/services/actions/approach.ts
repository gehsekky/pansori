import type { ActionHandler } from './types.js';
import { activeGrid } from '../mapEngine.js';
import { approachCell } from './social.js';

/**
 * `approach`: walk the party marker to a free cell adjacent to `pos` on the
 * current local-room grid (out of combat only). Dispatched by clicking a loot or
 * object token on the map; once adjacent, that item's contextual "Pick up" /
 * "Interact" choice surfaces via its adjacency gate. Reuses `approachCell` — the
 * same adjacency-pathfinding the Talk handler uses to step up to an NPC.
 */
export const handleApproach: ActionHandler<{ type: 'approach'; pos: { x: number; y: number } }> = (
  ctx,
  action
) => {
  if (ctx.actor.kind !== 'pc') return { rejected: 'Only the party can move.' };
  if (ctx.st.combat_active) {
    ctx.narrative = 'You cannot reposition like this while in combat.';
    return;
  }
  // Pass the NPC placements so the adjacent-cell pick can't land on someone.
  const grid = activeGrid(ctx.context.campaign, ctx.seed.rooms, ctx.st, ctx.seed.npcs);
  if (!grid || !ctx.st.marker_pos) {
    ctx.narrative = 'There is nowhere to move here.';
    return;
  }
  ctx.st = { ...ctx.st, marker_pos: approachCell(grid, ctx.st.marker_pos, action.pos) };
  ctx.narrative = 'The party moves up to it.';
};
