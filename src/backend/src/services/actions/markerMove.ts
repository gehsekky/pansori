import type { Context, GameState, GridPos } from '../../types.js';
import { ENCOUNTER_ROOM_ID, resolveMarkerMove, stageEncounter } from '../mapEngine.js';
import { buildArrivalNarrative, hasSaveProficiency } from '../gameEngine.js';
import { materializeEnemy, scaleEnemyHp } from '../enemyFactory.js';
import type { ActionHandler } from './types.js';
import { rollConditionSave } from '../rulesEngine.js';
import { runCombatStart } from './attack/combatStart.js';

const MARCH_BUDGET_MIN = 8 * 60; // SRD: 8 hours of travel/day before fatigue risk

/**
 * SRD 5.2.1 Extended Travel ("forced march"): each full hour of overland travel
 * beyond 8 hours in a day forces every character to make a Constitution save
 * (DC 10 + 1 per hour past 8) or gain a level of Exhaustion. Accrues the move's
 * `elapsedMin` into `travel_minutes_today` (reset by a long rest) and rolls a
 * save for each newly-completed past-8 hour this move added.
 */
export function applyForcedMarch(
  st: GameState,
  elapsedMin: number,
  context: Context
): { st: GameState; note: string } {
  if (elapsedMin <= 0) return { st, note: '' };
  const before = st.travel_minutes_today ?? 0;
  const after = before + elapsedMin;
  const pastBefore = Math.max(0, Math.floor((before - MARCH_BUDGET_MIN) / 60));
  const pastAfter = Math.max(0, Math.floor((after - MARCH_BUDGET_MIN) / 60));
  let characters = st.characters;
  const notes: string[] = [];
  for (let h = pastBefore + 1; h <= pastAfter; h++) {
    const dc = 10 + h; // 1st hour past 8 → DC 11, 2nd → DC 12, …
    characters = characters.map((c) => {
      if (c.dead) return c;
      const prof = hasSaveProficiency(c, 'con', context);
      const failed = rollConditionSave('con', c.con, dc, prof, c.level, 0, c.conditions ?? []);
      if (!failed) return c;
      // SRD 5.2.1 Exhaustion: cumulative, and "You die if your Exhaustion level
      // is 6." Cap at 6 and kill on reaching it — for EVERY marcher, here and
      // now, not only the active character (the general death sweep in takeAction
      // only checks the active PC, which would otherwise delay the death).
      const lvl = Math.min(6, (c.exhaustion_level ?? 0) + 1);
      if (lvl >= 6) {
        notes.push(`${c.name} (DC ${dc} CON) collapses and dies of exhaustion`);
        return {
          ...c,
          exhaustion_level: 6,
          dead: true,
          died_at_round: st.round ?? 0,
          conditions: (c.conditions ?? []).filter((x) => x !== 'unconscious'),
        };
      }
      notes.push(`${c.name} (DC ${dc} CON) → Exhaustion ${lvl}`);
      return { ...c, exhaustion_level: lvl };
    });
  }
  const next: GameState = { ...st, travel_minutes_today: after, characters };
  const note = notes.length ? ` The forced march takes its toll — ${notes.join('; ')}.` : '';
  return { st: next, note };
}

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
  // SRD Extended Travel — overland hours beyond 8/day risk Exhaustion. Fed to
  // resolveMarkerMove as a per-square hook so a collapse halts the party AT the
  // square it happens on (not at the destination); `died` stops the march.
  const applyFatigue = (s: GameState, minutes: number) => {
    const deadBefore = s.characters.filter((c) => c.dead).length;
    const m = applyForcedMarch(s, minutes, ctx.context);
    return {
      st: m.st,
      note: m.note,
      died: m.st.characters.filter((c) => c.dead).length > deadBefore,
    };
  };
  const res = resolveMarkerMove(
    ctx.context.campaign,
    ctx.seed.rooms,
    ctx.st,
    action.to,
    applyFatigue
  );
  if (res.rejected) {
    ctx.narrative = res.rejected;
    return;
  }
  ctx.st = res.st;
  // Fog + travel time + forced-march fatigue are all resolved square-by-square
  // inside resolveMarkerMove (it stops the marker at the first encounter / fatigue
  // collapse), so there's nothing more to apply here.

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
  if (res.fatigueNote) ctx.narrative += res.fatigueNote;
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
      // Drop straight into the fight instead of arriving out of combat with an
      // Attack button. stageEncounter moved the party into the encounter room,
      // so refresh the ctx's room-enemy list (it was the pre-move room) and
      // start combat now — runCombatStart deploys tokens + rolls initiative and
      // puts the active PC on the clock so the player acts immediately.
      const ambushLine = ` ⚔️ Ambush! A ${res.encounter} falls upon the party.`;
      // runCombatStart reads `livingEnemiesInRoom` (read-only on the dispatched
      // ctx, and stale for the pre-move room). Hand it the just-materialized
      // encounter enemy via a shallow ctx copy; the actor is shared by
      // reference (so PC updates land), and we copy the new st/narrative back.
      const preCombatNarrative = ctx.narrative ?? '';
      const combatCtx = { ...ctx, livingEnemiesInRoom: [enemy] };
      runCombatStart(combatCtx, enemy);
      ctx.st = combatCtx.st;
      ctx.narrative = preCombatNarrative + ambushLine + ' ' + combatCtx.narrative;
    } else {
      // The encounter table named a creature absent from the bestiary — skip the
      // drop rather than crash; the party simply presses on.
      ctx.narrative += ` You sense danger nearby, but the way stays clear.`;
    }
  }
};
