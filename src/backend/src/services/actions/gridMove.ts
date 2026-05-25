import { SQUARE_SIZE, findPath, opportunityAttackTriggers, posEqual } from '../gridEngine.js';
import { effectiveSpeed, getEnemyById, wallObstacleCells } from '../gameEngine.js';
import { hasEscapeTheHorde, hasSecondStoryWork } from '../multiclass.js';
import type { ActionHandler } from './types.js';
import { applyDamage } from '../damage.js';
import { resolveEnemyAttack } from '../rulesEngine.js';
import { updatePcActor } from './actor.js';

/**
 * `grid_move`: tactical movement on the combat grid. Validates:
 * - entities exist (grid combat is active)
 * - the move targets this character (no manipulating allies)
 * - speed isn't 0 (grappled / restrained reject the move)
 * - 2024 PHB Frightened: can't move closer to fear source
 * - the path exists (BFS over grid, blocked by living entities +
 *   room obstacles; dead bodies are walked over to match the FE)
 * - movement budget covers the path (difficult-terrain squares cost
 *   2× per SRD 5.2.1)
 *
 * On valid move: triggers opportunity attacks from enemies the move
 * leaves threat-range of (skipped if Disengaged); applies any OA
 * damage with concentration checks; updates the entity's pos and
 * accumulates movement_used.
 */
export const handleGridMove: ActionHandler<{
  type: 'grid_move';
  entityId: string;
  to: { x: number; y: number };
}> = (ctx, action) => {
  if (ctx.actor.kind !== 'pc') return { rejected: 'Only PCs can move on the grid.' };
  const { char } = ctx.actor;
  if (!ctx.st.entities) {
    ctx.narrative = 'Grid combat is not active.';
    return;
  }
  if (action.entityId !== char.id) {
    ctx.narrative = 'You can only move your own character.';
    return;
  }
  const charEntity = ctx.st.entities.find((e) => e.id === char.id);
  if (!charEntity) {
    ctx.narrative = 'Your character is not on the grid.';
    return;
  }

  if (char.conditions.some((c) => c === 'grappled' || c === 'restrained')) {
    const which = char.conditions.includes('restrained') ? 'RESTRAINED' : 'GRAPPLED';
    ctx.narrative = `You are ${which} — your speed is 0.`;
    return;
  }

  // 2024 PHB Frightened — can't willingly move closer to the source of fear.
  if (char.conditions.includes('frightened') && char.condition_sources?.frightened) {
    const fearSourceId = char.condition_sources.frightened;
    const fearSourceEnt = ctx.st.entities.find((e) => e.id === fearSourceId);
    if (fearSourceEnt && fearSourceEnt.hp > 0) {
      const currentDist = Math.max(
        Math.abs(charEntity.pos.x - fearSourceEnt.pos.x),
        Math.abs(charEntity.pos.y - fearSourceEnt.pos.y)
      );
      const newDist = Math.max(
        Math.abs(action.to.x - fearSourceEnt.pos.x),
        Math.abs(action.to.y - fearSourceEnt.pos.y)
      );
      if (newDist < currentDist) {
        const fearName = getEnemyById(ctx.seed, fearSourceId)?.name ?? 'the source of your fear';
        ctx.narrative = `You are FRIGHTENED — you can't willingly move closer to ${fearName}.`;
        return;
      }
    }
  }

  const locationGrid = ctx.context.campaign?.locations?.find((l) =>
    l.rooms?.some((r) => r.id === ctx.roomId)
  );
  const gridW = locationGrid?.gridWidth ?? ctx.context.gridWidth ?? 10;
  const gridH = locationGrid?.gridHeight ?? ctx.context.gridHeight ?? 10;
  // Dead entities don't block — walking over a corpse is allowed (matches
  // the FE's isReachable). Static obstacles (columns, walls, debris) do.
  const currentRoomForMove = ctx.seed.rooms.find((r) => r.id === ctx.roomId);
  const roomObstacles = currentRoomForMove?.obstacles ?? [];
  const walkSpeedFt = effectiveSpeed(char, ctx.context.lootTable);
  // 2024 PHB flying movement — when the PC has a fly speed ≥ their
  // walking speed, the path may pass over obstacle cells (boulders,
  // columns, debris) and difficult-terrain cells without the 2× cost.
  // RAW lets flying creatures move over difficult terrain without
  // penalty. We still block on living entities (no flying through
  // someone in the same square) and require the final cell to be
  // an empty space — flying doesn't let you land in a wall.
  const flySpeedFt = char.fly_speed_ft ?? 0;
  const isFlying = flySpeedFt > 0 && flySpeedFt >= walkSpeedFt;
  // Transient wall spells that block movement (Wall of Force) stop everyone,
  // including flyers — nothing physically passes through. Opaque-only walls
  // (Wall of Fire) don't set blocksMovement, so they aren't here.
  const wallMoveCells = wallObstacleCells(ctx.st, ctx.roomId, 'movement');
  const blocked = [
    ...ctx.st.entities.filter((e) => e.id !== char.id && e.hp > 0).map((e) => e.pos),
    ...(isFlying ? [] : roomObstacles),
    ...wallMoveCells,
  ];

  const path = findPath(charEntity.pos, action.to, blocked, gridW, gridH);
  if (!path) {
    ctx.narrative = 'No path to that square.';
    return;
  }
  // The destination must not be inside an obstacle even when flying —
  // RAW: you have to land somewhere. findPath gates on `blocked`, which
  // already includes living entities; we re-check obstacles for the
  // landing cell specifically when flying so the player can't end up
  // standing inside a wall.
  if (isFlying && roomObstacles.some((o) => posEqual(o, action.to))) {
    ctx.narrative = 'You cannot land inside an obstacle.';
    return;
  }

  // 2024 PHB cost rules. Per RAW, multiple "extra-foot" sources DON'T
  // stack — a cell that's both difficult terrain AND climbable still
  // costs 2× total, not 3×. Flying bypasses ALL of these (RAW: flying
  // creatures ignore difficult terrain; a climbable wall or swimmable
  // water cell is no obstacle to flight).
  const difficultTerrain = currentRoomForMove?.difficultTerrain ?? [];
  const climbTerrain = currentRoomForMove?.climbTerrain ?? [];
  const swimTerrain = currentRoomForMove?.swimTerrain ?? [];
  // SRD Thief Second-Story Work (L3) — Climb Speed equal to Speed (climbing
  // costs no extra movement), in addition to any innate/granted climb speed.
  const hasClimbSpeed = (char.climb_speed_ft ?? 0) > 0 || hasSecondStoryWork(char);
  const hasSwimSpeed = (char.swim_speed_ft ?? 0) > 0;
  const costFeet = path.reduce((acc, pos) => {
    if (isFlying) return acc + SQUARE_SIZE;
    const isDifficult = difficultTerrain.some((dt) => posEqual(dt, pos));
    const needsClimb = climbTerrain.some((ct) => posEqual(ct, pos)) && !hasClimbSpeed;
    const needsSwim = swimTerrain.some((sw) => posEqual(sw, pos)) && !hasSwimSpeed;
    const slowed = isDifficult || needsClimb || needsSwim;
    return acc + (slowed ? SQUARE_SIZE * 2 : SQUARE_SIZE);
  }, 0);

  // Use the larger of walking or flying speed as the movement budget
  // when flying — RAW the creature picks which mode per turn but
  // pansori models a single combined move per action.
  const speedFt = isFlying ? Math.max(walkSpeedFt, flySpeedFt) : walkSpeedFt;
  const usedFt = ctx.st.movement_used?.[char.id] ?? 0;
  if (usedFt + costFeet > speedFt) {
    const reasons: string[] = [];
    if (difficultTerrain.length) reasons.push('difficult terrain');
    if (climbTerrain.length && !hasClimbSpeed) reasons.push('climbing (no climb speed)');
    if (swimTerrain.length && !hasSwimSpeed) reasons.push('swimming (no swim speed)');
    const suffix = reasons.length ? ` — ${reasons.join(', ')}` : '';
    ctx.narrative = `Not enough movement. (${speedFt - usedFt} ft remaining, ${costFeet} ft needed${suffix})`;
    return;
  }

  const oaTargets = opportunityAttackTriggers(charEntity.pos, action.to, ctx.st.entities, false);
  let nextChar = char;
  let nextSt = ctx.st;
  let oaNarrative = '';
  for (const oaEntity of oaTargets) {
    const oaEnemy = getEnemyById(ctx.seed, oaEntity.id);
    if (
      oaEnemy &&
      !nextSt.enemies_killed.includes(oaEntity.id) &&
      !nextChar.turn_actions?.disengaged
    ) {
      // SRD Ranger Escape the Horde (Defensive Tactics L7) — opportunity
      // attacks against you have Disadvantage.
      const oaResult = resolveEnemyAttack(oaEnemy, nextChar.ac, false, hasEscapeTheHorde(nextChar));
      if (oaResult.hit) {
        const rawDmg = oaResult.damage;
        // Route through applyDamage so the OA respects every PC-side
        // damage gate: temp HP, exhaustion-4 max-HP clamp,
        // knock-out detection, AND the concentration save (no
        // separate checkConcentration call needed — applyDamage runs
        // it internally). Pre-fix the OA bypassed all of these and
        // applied raw damage with `hp = Math.max(0, hp - dmg)`.
        const dmgResult = applyDamage(nextChar, nextSt, rawDmg);
        nextChar = dmgResult.char;
        nextSt = dmgResult.st;
        oaNarrative += ` [Opportunity attack from ${oaEnemy.name}: ${dmgResult.amountDealt} damage!${dmgResult.concentrationNote}]`;
      } else {
        oaNarrative += ` [Opportunity attack from ${oaEnemy.name}: missed!]`;
      }
    }
  }

  nextSt = {
    ...nextSt,
    entities: (nextSt.entities ?? []).map((e) => (e.id === char.id ? { ...e, pos: action.to } : e)),
    movement_used: { ...nextSt.movement_used, [char.id]: usedFt + costFeet },
  };
  updatePcActor(ctx, nextChar);
  ctx.st = nextSt;
  ctx.narrative = `${nextChar.name} moves to (${action.to.x}, ${action.to.y}).${oaNarrative}`;
};
