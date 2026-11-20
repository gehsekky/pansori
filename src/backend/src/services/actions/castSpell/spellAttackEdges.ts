import { type AttackEdges, attackEdgeNote, computeAttackEdges } from '../../attackEdges.js';
import { resolveSpellAttack, spellAttackBonus } from '../../rulesEngine.js';
import type { ActionContext } from '../types.js';
import type { Enemy } from '../../../types.js';

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
  const char = ctx.actor.char;
  const edges = computeAttackEdges(ctx, target, target.id, opts);
  // SRD Wand of the War Mage — spell attacks ignore Half Cover.
  if (edges.coverAcBonus === 2 && char.worn_traits?.spellIgnoreHalfCover) edges.coverAcBonus = 0;
  const ac = target.ac + edges.coverAcBonus;
  const advantage = edges.advantage || !!opts.extraAdvantage;
  // SRD Spell Scroll — the scroll's own attack bonus replaces the caster's.
  const fixed = ctx.itemCast?.attackBonus;
  const fixedShift = fixed !== undefined ? spellAttackBonus(char.level, castingScore) - fixed : 0;
  // Held items' spell attack bonus (War Mage, Staff of Power / the Magi / Woodlands).
  const itemBonus = char.worn_traits?.spellAttackBonus ?? 0;
  const atk = resolveSpellAttack(char.level, castingScore, ac, advantage, {
    disadvantage: edges.disadvantage,
    // Sundering Blow's +5 (and item bonuses) ride the flat-modifier slot.
    penalty: edges.penalty - edges.sunderingBonus - itemBonus + fixedShift,
  });
  const critical = atk.critical || (atk.hit && edges.autoCritOnHit);
  const extraNote =
    opts.extraAdvantage && !edges.advantage && !edges.disadvantage ? ' (advantage)' : '';
  const coverNote = edges.coverAcBonus ? ` [cover +${edges.coverAcBonus} AC]` : '';
  const sunderNote = edges.sunderingBonus ? ` [Sundering Blow +${edges.sunderingBonus}]` : '';
  const itemNote = itemBonus ? ` [item +${itemBonus}]` : '';
  return {
    ...atk,
    critical,
    ac,
    note: attackEdgeNote(edges) + extraNote + coverNote + sunderNote + itemNote,
    edges,
  };
}
