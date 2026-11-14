import { type AttackEdges, attackEdgeNote, computeAttackEdges } from '../../attackEdges.js';
import type { ActionContext } from '../types.js';
import type { Enemy } from '../../../types.js';
import { resolveSpellAttack } from '../../rulesEngine.js';

/**
 * SRD spell attack roll — the same Advantage / Disadvantage, Cover and
 * auto-crit rules as any other attack roll (see `computeAttackEdges`).
 * `ranged` is false for touch spells and recurring melee spell attacks.
 * `extraAdvantage` carries spell-only sources (Innate Sorcery). Returns the
 * roll plus the effective AC (Cover included) and a narration note.
 */
export function rollSpellAttack(
  ctx: ActionContext,
  target: Enemy,
  castingScore: number,
  opts: { ranged: boolean; fromAdjacent?: boolean; extraAdvantage?: boolean }
): {
  hit: boolean;
  critical: boolean;
  roll: number;
  bonus: number;
  total: number;
  ac: number;
  note: string;
  edges: AttackEdges;
} {
  if (ctx.actor.kind !== 'pc') throw new Error('rollSpellAttack: PC actor only');
  const edges = computeAttackEdges(ctx, target, target.id, opts);
  const ac = target.ac + edges.coverAcBonus;
  const advantage = edges.advantage || !!opts.extraAdvantage;
  const atk = resolveSpellAttack(ctx.actor.char.level, castingScore, ac, advantage, {
    disadvantage: edges.disadvantage,
    penalty: edges.penalty,
  });
  const critical = atk.critical || (atk.hit && edges.autoCritOnHit);
  const extraNote =
    opts.extraAdvantage && !edges.advantage && !edges.disadvantage ? ' (advantage)' : '';
  const coverNote = edges.coverAcBonus ? ` [cover +${edges.coverAcBonus} AC]` : '';
  return { ...atk, critical, ac, note: attackEdgeNote(edges) + extraNote + coverNote, edges };
}
