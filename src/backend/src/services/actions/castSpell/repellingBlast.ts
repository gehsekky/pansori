import type { ActionContext } from '../types.js';
import type { Enemy } from '../../../types.js';
import { fmt } from '../../narrativeFmt.js';
import { hasInvocation } from '../../invocations.js';
import { pushEntityAway } from '../../gameEngine.js';
import { sizeRank } from '../../unarmedStrike.js';

/**
 * SRD Repelling Blast (Warlock invocation) — when an Eldritch Blast beam hits a
 * Large or smaller creature, push it up to 10 ft straight away from you. The
 * push stops at walls, creatures and the grid edge. Always taken (AI policy).
 * Call after a hit that left the target standing. Returns the narrative note
 * ('' when nothing moved).
 */
export function applyRepellingBlast(ctx: ActionContext, target: Enemy): string {
  if (ctx.actor.kind !== 'pc') return '';
  const { char } = ctx.actor;
  if (!hasInvocation(char, 'repelling_blast')) return '';
  if (sizeRank(target.size) > sizeRank('large')) return '';
  const casterPos = ctx.st.entities?.find((e) => e.id === char.id)?.pos;
  const tgt = ctx.st.entities?.find((e) => e.id === target.id && e.isEnemy);
  if (!casterPos || !tgt || tgt.hp <= 0) return '';
  const pushed = pushEntityAway(
    ctx.st,
    target.id,
    casterPos,
    10,
    ctx.context,
    ctx.seed,
    ctx.st.current_room,
    ctx.roomObstacleCells
  );
  ctx.st = pushed.st;
  return pushed.pushedFt > 0
    ? ` ${fmt.note(`[Repelling Blast: ${target.name} pushed ${pushed.pushedFt} ft]`)}`
    : '';
}
