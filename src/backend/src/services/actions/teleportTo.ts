import type { ActionHandler } from './types.js';
import { relocateToTown } from '../mapEngine.js';

/**
 * `teleport_to`: resolve the town-teleport interstitial (Teleport /
 * Teleportation Circle) — relocate the party to a town it has VISITED, with
 * no travel time, then clear the pending state. The slot was spent at cast
 * time; cancel_teleport abandons the choice (the magic dissipates).
 */
export const handleTeleportTo: ActionHandler<{ type: 'teleport_to'; townId: string }> = (
  ctx,
  action
) => {
  if (ctx.actor.kind !== 'pc') return { rejected: 'Only the party teleports.' };
  if (!ctx.st.pending_teleport) {
    ctx.narrative = 'No teleportation is waiting on a destination.';
    return;
  }
  if (!(ctx.st.visited_towns ?? []).includes(action.townId)) {
    ctx.narrative = 'The party knows no such place.';
    return;
  }
  const moved = relocateToTown(ctx.context.campaign, ctx.st, action.townId);
  if (!moved) {
    ctx.narrative = 'The destination no longer answers — pick another.';
    return;
  }
  ctx.st = { ...moved.st, pending_teleport: undefined };
  ctx.narrative = moved.narrative.trim();
};

/** `cancel_teleport`: let the held teleportation dissipate unspent. */
export const handleCancelTeleport: ActionHandler<{ type: 'cancel_teleport' }> = (ctx) => {
  if (ctx.actor.kind !== 'pc') return { rejected: 'Only the party teleports.' };
  ctx.st = { ...ctx.st, pending_teleport: undefined };
  ctx.narrative = 'The held teleportation dissipates.';
};
