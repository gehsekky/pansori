import type { ActionContext } from '../types.js';
import type { Spell } from '../../../types.js';
import { randomUUID } from 'crypto';

/**
 * Summon spells (Animate Dead, etc.). The precast out-of-combat gate
 * guarantees this runs out of combat, so we append a persistent ally to
 * `state.summoned_allies` carrying the spell's `summon` stat block;
 * `seedSummonedAllies` materializes it as a side:'ally' combatant at the
 * next combat start, where `runAllyTurn` drives it. Returns true when
 * handled (the spell had a `summon`). (RE-1 Phase 4.)
 */
export function runSummonSpell(ctx: ActionContext, spell: Spell, slotNote: string): boolean {
  if (!spell.summon) return false;
  const s = spell.summon;
  ctx.st = {
    ...ctx.st,
    summoned_allies: [
      ...(ctx.st.summoned_allies ?? []),
      {
        id: `summon-${randomUUID()}`,
        ownerId: ctx.char.id,
        name: s.name,
        ac: s.ac,
        maxHp: s.maxHp,
        toHit: s.toHit,
        damage: s.damage,
      },
    ],
  };
  ctx.narrative =
    (ctx.narrative ?? '') +
    `${ctx.char.name} casts ${spell.name}${slotNote} — a ${s.name} rises to fight at the party's side, joining the next battle.`;
  return true;
}
