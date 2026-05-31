import { ENCOUNTER_ROOM_ID, resolveMarkerMove, stageEncounter } from '../mapEngine.js';
import { materializeEnemy, scaleEnemyHp } from '../enemyFactory.js';
import type { ActionHandler } from './types.js';
import type { GridPos } from '../../types.js';
import { buildArrivalNarrative } from '../gameEngine.js';

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
  // RAW egress: a hostile in the current room means engage (Attack) or evade
  // (Sneak) — you can't simply stroll past it onto a transition cell. Mirrors
  // the old room `move` guard + the marker_move choice gating in generateChoices.
  if (ctx.enemyAlive) {
    ctx.narrative = 'A hostile is here — deal with it before you travel on.';
    return;
  }
  const fromRoom = ctx.st.current_room;
  const res = resolveMarkerMove(ctx.context.campaign, ctx.seed.rooms, ctx.st, action.to);
  if (res.rejected) {
    ctx.narrative = res.rejected;
    return;
  }
  ctx.st = res.st;

  // Walking away from an NPC ends any conversation with them (the marker left
  // their room) — so a stale conversation can't linger into the next room.
  if (ctx.st.active_conversation && ctx.st.active_conversation.roomId !== ctx.st.current_room) {
    ctx.st = { ...ctx.st, active_conversation: undefined };
  }

  // Entering a new local room (a site interior or a room-exit passage): use the
  // full arrival narrative so the party gets the room description, a "Hostile
  // here" listing, passive trap detection, and loot-spotting — the same cues the
  // old room `move` gave. Otherwise fall back to the terse transition / move text.
  const enteredRoom =
    res.transitioned &&
    ctx.st.current_room &&
    ctx.st.current_room !== fromRoom &&
    ctx.seed.rooms.some((r) => r.id === ctx.st.current_room)
      ? ctx.st.current_room
      : undefined;
  const arrival = enteredRoom
    ? ' ' + buildArrivalNarrative(enteredRoom, ctx.st, ctx.seed, ctx.context)
    : res.narrative || ' The party moves across the map.';
  ctx.narrative = (ctx.narrative ?? '') + arrival;
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
