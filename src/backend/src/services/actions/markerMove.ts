import { ENCOUNTER_ROOM_ID, resolveMarkerMove, stageEncounter } from '../mapEngine.js';
import { materializeEnemy, scaleEnemyHp } from '../enemyFactory.js';
import type { ActionHandler } from './types.js';
import type { GridPos } from '../../types.js';

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
  // A random encounter interrupted the march — drop the party off the map into
  // a transient local combat against the rolled creature. Materialize it from
  // the campaign bestiary (scaled to party size, like authored room enemies);
  // `endCombatState` marches the party back to this cell once the fight ends.
  if (res.encounter) {
    const template = ctx.context.enemyTemplates.find((t) => t.name === res.encounter);
    if (template) {
      const partySize = Math.max(1, ctx.st.characters.filter((c) => !c.dead).length);
      const hp = scaleEnemyHp(template.hp, partySize);
      // Unique id per encounter so a repeat of the same creature isn't treated
      // as already-killed (enemies_killed tracks ids).
      const enemy = materializeEnemy(template, `${ENCOUNTER_ROOM_ID}#${Date.now()}`, hp);
      ctx.seed.enemies = { ...(ctx.seed.enemies ?? {}), [ENCOUNTER_ROOM_ID]: [enemy] };
      ctx.st = stageEncounter(ctx.st);
      ctx.narrative += ` ⚔️ Ambush! A ${res.encounter} blocks the way — you have no choice but to fight.`;
    } else {
      // The encounter table named a creature absent from the bestiary — skip the
      // drop rather than crash; the party simply presses on.
      ctx.narrative += ` You sense danger nearby, but the way stays clear.`;
    }
  }
};
