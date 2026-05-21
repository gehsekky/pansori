import type { ActionHandler } from './types.js';
import { buildArrivalNarrative } from '../gameEngine.js';

/**
 * `death_save`: defensive fallback. The early-return block in
 * `takeAction` ("Death saves override all actions when HP = 0") catches
 * every death_save while `char.hp <= 0` and short-circuits before
 * dispatch. This handler only runs if some future code path routes a
 * death_save here with `hp > 0` — shouldn't happen, but the original
 * switch had this case as a noop-with-arrival-narrative and we
 * preserve that behavior on principle.
 */
export const handleDeathSave: ActionHandler<{ type: 'death_save' }> = (ctx) => {
  ctx.narrative = buildArrivalNarrative(ctx.roomId, ctx.st, ctx.seed, ctx.context);
};
