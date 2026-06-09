// RE-4 — `jump`: a SRD Long Jump on the combat grid. Unlike `grid_move` (which
// routes around obstacles and pays 2× for difficult terrain), a jump leaps in
// a straight line and may clear obstacle / difficult-terrain cells, landing on
// solid ground up to the long-jump distance away. Each foot jumped costs a
// foot of movement. A ≥10-ft run-up (movement already spent this turn) grants
// the full distance; otherwise it's a standing jump (half). Landing in
// difficult terrain forces a DC 10 Dexterity (Acrobatics) check or Prone.
//
// High Jump is vertical; pansori's grid is flat, so only the distance helper
// (services/jump.ts) is modeled, not a grid action.

import { SQUARE_SIZE, chebyshev, opportunityAttackTriggers, posEqual } from '../gridEngine.js';
import { combatGridDims, effectiveSpeed, getEnemyById } from '../gameEngine.js';
import { d20TestPenalty, resolveEnemyAttack, skillCheck } from '../rulesEngine.js';
import type { ActionHandler } from './types.js';
import { applyDamage } from '../damage.js';
import { hasEscapeTheHorde } from '../multiclass.js';
import { longJumpDistance } from '../jump.js';
import { updatePcActor } from './actor.js';

export const handleJump: ActionHandler<{ type: 'jump'; to: { x: number; y: number } }> = (
  ctx,
  action
) => {
  if (ctx.actor.kind !== 'pc') return { rejected: 'Only PCs can jump.' };
  const { char } = ctx.actor;
  if (!ctx.st.entities) {
    ctx.narrative = 'Jumping is only available in grid combat.';
    return;
  }
  const charEntity = ctx.st.entities.find((e) => e.id === char.id);
  if (!charEntity) {
    ctx.narrative = 'You are not on the battle grid.';
    return;
  }
  const { w: gridW, h: gridH } = combatGridDims(ctx.roomId, ctx.seed, ctx.context);
  const { to } = action;
  if (to.x < 0 || to.x >= gridW || to.y < 0 || to.y >= gridH) {
    ctx.narrative = 'You cannot jump off the battlefield.';
    return;
  }
  if (posEqual(charEntity.pos, to)) {
    ctx.narrative = 'You are already there.';
    return;
  }
  // Landing must be clear of living creatures and solid obstacles.
  const room = ctx.seed.rooms.find((r) => r.id === ctx.roomId);
  const roomObstacles = room?.obstacles ?? [];
  if (ctx.st.entities.some((e) => e.id !== char.id && e.hp > 0 && posEqual(e.pos, to))) {
    ctx.narrative = 'You cannot land on another creature.';
    return;
  }
  if (roomObstacles.some((o) => posEqual(o, to))) {
    ctx.narrative = 'You cannot land inside an obstacle.';
    return;
  }

  // Distance + run-up. A run-up is ≥10 ft of movement already spent this turn.
  const usedFt = ctx.st.movement_used?.[char.id] ?? 0;
  const hasRunUp = usedFt >= 10;
  const jumpFt = chebyshev(charEntity.pos, to) * SQUARE_SIZE;
  const maxJumpFt = longJumpDistance(char.str, hasRunUp);
  if (jumpFt > maxJumpFt) {
    const stand = hasRunUp ? '' : ' (standing — no 10-ft run-up)';
    ctx.narrative = `Too far to jump${stand}: ${jumpFt} ft, max ${maxJumpFt} ft.`;
    return;
  }
  // Each foot jumped costs a foot of movement.
  const speedFt = effectiveSpeed(char, ctx.context.lootTable);
  if (usedFt + jumpFt > speedFt) {
    ctx.narrative = `Not enough movement to jump. (${speedFt - usedFt} ft remaining, ${jumpFt} ft needed)`;
    return;
  }

  // Leaving a threatened square mid-jump still provokes opportunity attacks.
  const oaTargets = opportunityAttackTriggers(charEntity.pos, to, ctx.st.entities, false);
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
      const oaResult = resolveEnemyAttack(oaEnemy, nextChar.ac, false, hasEscapeTheHorde(nextChar));
      if (oaResult.hit) {
        const dmgResult = applyDamage(nextChar, nextSt, oaResult.damage);
        nextChar = dmgResult.char;
        nextSt = dmgResult.st;
        oaNarrative += ` [Opportunity attack from ${oaEnemy.name}: ${dmgResult.amountDealt} damage!${dmgResult.concentrationNote}]`;
      } else {
        oaNarrative += ` [Opportunity attack from ${oaEnemy.name}: missed!]`;
      }
    }
  }

  // Landing in difficult terrain: DC 10 DEX (Acrobatics) or fall Prone.
  let landNarrative = '';
  const landsInDifficult = (room?.difficultTerrain ?? []).some((dt) => posEqual(dt, to));
  if (landsInDifficult) {
    const proficient = nextChar.skill_proficiencies?.includes('Acrobatics') ?? false;
    const check = skillCheck(
      nextChar.dex,
      10,
      proficient,
      nextChar.level,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      d20TestPenalty(nextChar)
    );
    if (!check.success) {
      if (!nextChar.conditions.includes('prone')) {
        nextChar = { ...nextChar, conditions: [...nextChar.conditions, 'prone'] };
      }
      landNarrative = ` Lands hard in difficult terrain (Acrobatics ${check.total} vs DC 10) — Prone!`;
    } else {
      landNarrative = ` Sticks the landing in difficult terrain (Acrobatics ${check.total} vs DC 10).`;
    }
  }

  nextSt = {
    ...nextSt,
    entities: (nextSt.entities ?? []).map((e) => (e.id === char.id ? { ...e, pos: to } : e)),
    movement_used: { ...nextSt.movement_used, [char.id]: usedFt + jumpFt },
  };
  updatePcActor(ctx, nextChar);
  ctx.st = nextSt;
  ctx.narrative = `${nextChar.name} leaps ${jumpFt} ft to (${to.x}, ${to.y}).${oaNarrative}${landNarrative}`;
};
