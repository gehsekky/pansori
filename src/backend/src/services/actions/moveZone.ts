import { applyZoneTick, combatGridDims, zoneCells } from '../gameEngine.js';
import type { ActionHandler } from './types.js';
import type { GridPos } from '../../types.js';
import { distanceFeet } from '../gridEngine.js';

/**
 * `move_zone`: reposition a placed persistent damage zone (Flaming Sphere
 * rolls, Moonbeam / Call Lightning re-aim) onto a cell within the spell's
 * move range. Costs the spell's `zoneMoveCost` (a Bonus Action for Flaming
 * Sphere; a Magic action for Moonbeam / Call Lightning). Recomputes the
 * footprint at the new center and ticks the zone there — moving the zone into
 * a creature's space triggers its damage (SRD). Caster-following auras (Spirit
 * Guardians) and stationary zones (Spike Growth) aren't repositionable.
 */
export const handleMoveZone: ActionHandler<{ type: 'move_zone'; zoneId: string; to: GridPos }> = (
  ctx,
  action
) => {
  if (!ctx.st.combat_active) return { rejected: 'You can only move a zone in combat.' };
  if (ctx.actor.kind !== 'pc') return { rejected: 'Only PCs can move a spell zone.' };
  const pc = ctx.actor;

  const zone = (ctx.st.spell_zones ?? []).find((z) => z.id === action.zoneId);
  if (!zone || zone.casterId !== pc.char.id) {
    return { rejected: 'No zone of yours to move.' };
  }
  if (zone.followsCaster || !zone.center) {
    return { rejected: `${zone.name} can't be repositioned.` };
  }
  const spell = ctx.context.spellTable?.[zone.spellId];
  const moveFt = spell?.zoneMoveFt;
  const moveCost = spell?.zoneMoveCost;
  if (!moveFt || !moveCost) {
    return { rejected: `${zone.name} can't be repositioned.` };
  }

  // Action-economy gate (the move costs the spell's declared slot).
  if (moveCost === 'bonus_action' && pc.char.turn_actions.bonus_action_used) {
    return { rejected: 'Bonus action already used this turn.' };
  }
  if (moveCost === 'action' && pc.char.turn_actions.action_used) {
    return { rejected: 'You have already used your action this turn.' };
  }

  // Range + grid-bounds check.
  const { w: gridW, h: gridH } = combatGridDims(ctx.roomId, ctx.seed, ctx.context);
  const { to } = action;
  if (to.x < 0 || to.x >= gridW || to.y < 0 || to.y >= gridH) {
    return { rejected: 'That cell is off the grid.' };
  }
  if (distanceFeet(zone.center, to) > moveFt) {
    return { rejected: `${zone.name} can move at most ${moveFt} ft.` };
  }

  // Reposition: recompute the footprint around the new center.
  const movedZone = { ...zone, center: to, cells: zoneCells(to, zone.radiusFt ?? 5, gridW, gridH) };
  ctx.st = {
    ...ctx.st,
    spell_zones: (ctx.st.spell_zones ?? []).map((z) => (z.id === zone.id ? movedZone : z)),
  };
  pc.char.turn_actions = {
    ...pc.char.turn_actions,
    ...(moveCost === 'bonus_action' ? { bonus_action_used: true } : { action_used: true }),
  };
  ctx.narrative = `${pc.char.name} repositions ${zone.name}.`;

  // SRD: moving the zone into a creature's space triggers its damage.
  const tick = applyZoneTick(ctx.st, movedZone, ctx.seed, ctx.context);
  ctx.st = tick.st;
  ctx.narrative += tick.narrative;

  // A Magic-action reposition uses the turn's action; a Bonus Action doesn't.
  if (moveCost === 'action') ctx.usedInitiative = true;
};
