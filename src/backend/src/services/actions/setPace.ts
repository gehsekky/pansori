import { PACE_MILES_PER_HOUR, type TravelPace } from '../mapEngine.js';
import type { ActionHandler } from './types.js';

// SRD Travel Pace — flavor per stance, mirroring the table's check effects
// (Fast: Disadvantage on Wisdom (Perception); Slow: Advantage).
const PACE_LINES: Record<TravelPace, string> = {
  fast: 'The party picks up a fast pace — 4 miles an hour, eyes on the road and little else.',
  normal: 'The party settles into a normal pace — 3 miles an hour, steady and watchful.',
  slow: 'The party slows to a careful pace — 2 miles an hour, scanning every shadow.',
};

/**
 * `set_pace`: choose the party's SRD Travel Pace (overland stance). Free and
 * out-of-combat only; persists until changed. Drives miles-per-hour on the
 * regional map (the hour-per-click travel turn) and the pace check effects —
 * passive Perception ±5 for trap/ambush detection (pacePerceptionMod).
 */
export const handleSetPace: ActionHandler<{ type: 'set_pace'; pace: TravelPace }> = (
  ctx,
  action
) => {
  if (ctx.actor.kind !== 'pc') return { rejected: 'Only the party sets the pace.' };
  if (ctx.st.combat_active) {
    ctx.narrative = 'No time to think about travel pace mid-fight.';
    return;
  }
  if (!(action.pace in PACE_MILES_PER_HOUR)) {
    ctx.narrative = 'That is not a pace.';
    return;
  }
  ctx.st = { ...ctx.st, travel_pace: action.pace };
  ctx.narrative = PACE_LINES[action.pace];
};
