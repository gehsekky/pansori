import type { ActionContext } from '../types.js';
import type { Spell } from '../../../types.js';
import { randomUUID } from 'crypto';

/**
 * Summon spells (Animate Dead, etc.). The precast out-of-combat gate
 * guarantees this runs out of combat, so we append persistent allies to
 * `state.summoned_allies` carrying the chosen stat block;
 * `seedSummonedAllies` materializes them as side:'ally' combatants at the
 * next combat start, where `runAllyTurn` drives them. Returns true when
 * handled (the spell had a `summon`). (RE-1 Phase 4.)
 *
 * RAW variant + multi-raise (Animate Dead): `summonVariant` picks the
 * creature (Skeleton base, or a `variants[]` alternate like Zombie), and
 * `summon.countPerUpcastLevel` raises that many extra per slot level above
 * the spell's base level. (RE-1 Phase 4.5.)
 */
export function runSummonSpell(
  ctx: ActionContext,
  spell: Spell,
  slotNote: string,
  slotLevel: number,
  summonVariant?: string
): boolean {
  if (ctx.actor.kind !== 'pc') return false;
  const { char } = ctx.actor;
  if (!spell.summon) return false;
  const base = spell.summon;
  const chosen = [base, ...(base.variants ?? [])].find((o) => o.name === summonVariant) ?? base;
  const baseLevel = spell.level ?? 1;
  const perUpcast = base.countPerUpcastLevel ?? 0;
  const count = Math.max(1, 1 + perUpcast * Math.max(0, slotLevel - baseLevel));

  const raised = Array.from({ length: count }, () => ({
    id: `summon-${randomUUID()}`,
    ownerId: char.id,
    name: chosen.name,
    ac: chosen.ac,
    maxHp: chosen.maxHp,
    toHit: chosen.toHit,
    damage: chosen.damage,
    // Non-combatant flag lives on the base summon (Find Familiar), so it applies
    // to every chosen form/variant.
    noAttack: base.noAttack,
  }));
  ctx.st = {
    ...ctx.st,
    summoned_allies: [...(ctx.st.summoned_allies ?? []), ...raised],
  };
  const crew = count === 1 ? `a ${chosen.name}` : `${count} ${chosen.name}s`;
  ctx.narrative =
    (ctx.narrative ?? '') +
    `${char.name} casts ${spell.name}${slotNote} — ${crew} rise${count === 1 ? 's' : ''} to fight at the party's side, joining the next battle.`;
  return true;
}
