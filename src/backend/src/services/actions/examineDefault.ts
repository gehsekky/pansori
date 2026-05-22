import type { ActionHandler } from './types.js';
import { buildArrivalNarrative } from '../gameEngine.js';
import { fmt } from '../narrativeFmt.js';

/**
 * `examine`: re-emit the room's arrival narrative. Appends combat
 * status + active conditions so a confused player can re-read where
 * they are without consuming a turn. Also serves as the dispatch
 * default — the inline switch in `takeAction` keeps a `default:`
 * arm with the same body for action types that haven't been
 * registered yet.
 */
export const handleExamine: ActionHandler<{ type: 'examine' }> = (ctx) => {
  let narrative = buildArrivalNarrative(ctx.roomId, ctx.st, ctx.seed, ctx.context);
  if (ctx.st.combat_active) narrative += ` You are in combat!`;
  if (ctx.char.conditions.length > 0) {
    narrative += ` ${fmt.note(`[Conditions: ${ctx.char.conditions.join(', ')}]`)}`;
  }
  ctx.narrative = narrative;
};
