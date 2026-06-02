import type { ActionContext } from '../types.js';
import type { Spell } from '../../../types.js';
import { abilityMod } from '../../rulesEngine.js';
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
  summonVariant?: string,
  // Caster's spellcasting ability SCORE — only consulted for
  // `countFromSpellMod` spells (Animate Objects). Defaults to 10 (mod +0) so
  // direct unit callers needn't supply it for fixed-count summons.
  castingScore = 10
): boolean {
  if (ctx.actor.kind !== 'pc') return false;
  const { char } = ctx.actor;
  if (!spell.summon) return false;
  const base = spell.summon;
  const chosen = [base, ...(base.variants ?? [])].find((o) => o.name === summonVariant) ?? base;
  const baseLevel = spell.level ?? 1;
  const perUpcast = base.countPerUpcastLevel ?? 0;
  // Animate Objects: the base count is the caster's spellcasting modifier;
  // every other summon raises one at base level.
  const baseCount = base.countFromSpellMod ? Math.max(1, abilityMod(castingScore)) : 1;
  const count = Math.max(1, baseCount + perUpcast * Math.max(0, slotLevel - baseLevel));

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
    // SRD Mounted Combat — a rideable mount (Phantom Steed) carries its mount
    // flag + Speed so combat start auto-mounts the caster.
    isMount: base.isMount,
    speed: base.speed,
  }));
  ctx.st = {
    ...ctx.st,
    summoned_allies: [...(ctx.st.summoned_allies ?? []), ...raised],
  };
  // Mounts read differently from a war-band of summons: you conjure one steed
  // and ride it into the next fight.
  if (base.isMount) {
    ctx.narrative =
      (ctx.narrative ?? '') +
      `${char.name} casts ${spell.name}${slotNote} — a ${chosen.name} takes shape, ready to bear its rider into the next battle.`;
    return true;
  }
  const crew = count === 1 ? `a ${chosen.name}` : `${count} ${chosen.name}s`;
  ctx.narrative =
    (ctx.narrative ?? '') +
    `${char.name} casts ${spell.name}${slotNote} — ${crew} rise${count === 1 ? 's' : ''} to fight at the party's side, joining the next battle.`;
  return true;
}
