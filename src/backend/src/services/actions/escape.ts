import type { ActionHandler } from './types.js';
import { pick } from '../gameEngine.js';

/**
 * `escape`: end-game exit. Only available in the configured escape
 * room (per Context) and only if no hostile is alive in the current
 * room. On success, sets `ctx.escaped` — the post-switch epilogue
 * passes that flag back to the caller, which marks the session as
 * 'escaped' status.
 */
export const handleEscape: ActionHandler<{ type: 'escape' }> = (ctx) => {
  if (ctx.roomId !== ctx.context.escapeRoomId) {
    ctx.narrative = pick(ctx.context.narratives.noEscapeNearby);
    return;
  }
  if (ctx.enemyAlive && ctx.enemy) {
    ctx.narrative = `The ${ctx.enemy.name} ${pick(ctx.context.narratives.escapeBlocked)}`;
    return;
  }
  ctx.escaped = true;
  ctx.narrative = pick(ctx.context.narratives.escapeLines).replace(/{world}/g, ctx.worldName);
};
