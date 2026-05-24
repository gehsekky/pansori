import type { ActionHandler } from './types.js';
import { buildArrivalNarrative } from '../gameEngine.js';

/**
 * `move`: room-to-room navigation out of combat. Gated by:
 * - adjacency (destination must be reachable from current room)
 * - grappled / restrained conditions (speed 0)
 * - combat-active (use grid_move + Disengage instead)
 * - hostile present (engage or escape)
 *
 * On success: updates current_room, extends visited_rooms, appends
 * the arrival narrative for the new room.
 */
export const handleMove: ActionHandler<{ type: 'move'; roomId: string }> = (ctx, action) => {
  if (ctx.actor.kind !== 'pc') return { rejected: 'Only PCs can move between rooms.' };
  const { char, safeIdx } = ctx.actor;
  const target = ctx.seed.rooms.find((r) => r.id === action.roomId);
  if (!target || !ctx.adjacent.find((r) => r.id === target.id)) {
    ctx.narrative = 'The path loops back on itself. You cannot get there from here.';
    return;
  }
  const immobilizer = char.conditions.find((c) => ['grappled', 'restrained'].includes(c));
  if (immobilizer) {
    ctx.narrative = `You are ${immobilizer} and cannot move.`;
    return;
  }
  if (ctx.st.combat_active) {
    ctx.narrative = `You cannot flee while in grid combat. Use Disengage and move on the grid.`;
    return;
  }
  if (ctx.enemyAlive) {
    ctx.narrative = 'A hostile is in this room — engage it or attempt to escape before moving on.';
    return;
  }
  ctx.st = {
    ...ctx.st,
    current_room: target.id,
    visited_rooms: ctx.st.visited_rooms.includes(target.id)
      ? ctx.st.visited_rooms
      : [...ctx.st.visited_rooms, target.id],
  };
  ctx.narrative +=
    (ctx.narrative ? '' : '') +
    buildArrivalNarrative(
      target.id,
      {
        ...ctx.st,
        characters: ctx.st.characters.map((c, i) => (i === safeIdx ? char : c)),
      },
      ctx.seed,
      ctx.context
    );
};
