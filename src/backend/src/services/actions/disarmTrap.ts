import { disarmTrap, reviveD20Penalty, rollDice } from '../rulesEngine.js';
import { getRoomTrap, partyDetectsTrap, trapSpent } from '../gameEngine.js';
import type { ActionHandler } from './types.js';
import { applyDamage } from '../damage.js';

/**
 * `disarm_trap`: must have already detected the trap (passive
 * Perception during room arrival). Uses the DEX-based disarmTrap
 * roll from rulesEngine, with thieves' tools / hacking tool
 * proficiency adding the proficiency bonus. Exhaustion level 1+
 * applies disadvantage by rolling twice and taking the lower.
 *
 * On failure: the trap fires (damage + condition application) and
 * is marked triggered. Always consumes the action either way.
 */
export const handleDisarmTrap: ActionHandler<{ type: 'disarm_trap' }> = (ctx) => {
  const trap = getRoomTrap(ctx.roomId, ctx.seed, ctx.context);
  if (!trap || trapSpent(ctx.st, ctx.roomId)) {
    return { rejected: 'There is no trap here to disarm.' };
  }
  if (!partyDetectsTrap(ctx.st.characters, trap)) {
    return { rejected: 'You have not located the trap.' };
  }
  const hasToolProf =
    ctx.char.tool_proficiencies?.some(
      (t) => t.toLowerCase().includes('thieves') || t.toLowerCase().includes('hacking')
    ) ?? false;
  const exhaustionDisadv1 = (ctx.char.exhaustion_level ?? 0) >= 1;
  const revivePen = reviveD20Penalty(ctx.char);
  const attempt1 = disarmTrap(ctx.char.dex, ctx.char.level, hasToolProf, revivePen);
  const attempt2 = exhaustionDisadv1
    ? disarmTrap(ctx.char.dex, ctx.char.level, hasToolProf, revivePen)
    : attempt1;
  const { roll, total } = attempt1.total <= attempt2.total ? attempt1 : attempt2;
  const profNote = hasToolProf ? ` (tool proficiency)` : '';
  let next = ctx.char;
  let nextSt = ctx.st;
  let narrative: string;
  if (total >= trap.dc) {
    nextSt = { ...nextSt, traps_disarmed: [...(nextSt.traps_disarmed ?? []), ctx.roomId] };
    narrative = `${trap.disarmSuccess} (DEX ${roll} + ${total - roll}${profNote} = ${total} vs DC ${trap.dc})`;
  } else {
    nextSt = { ...nextSt, traps_triggered: [...(nextSt.traps_triggered ?? []), ctx.roomId] };
    const trapDmg = rollDice(trap.damage);
    const dmgResult = applyDamage(next, nextSt, trapDmg);
    next = dmgResult.char;
    nextSt = dmgResult.st;
    let failNarr = `${trap.disarmFail} (DEX ${roll} + ${total - roll}${profNote} = ${total} vs DC ${trap.dc}). `;
    failNarr += trap.triggerNarrative
      .replace(/{name}/g, next.name)
      .replace(/{dmg}/g, String(trapDmg));
    failNarr += dmgResult.concentrationNote;
    narrative = failNarr;
    if (trap.condition && next.hp > 0) {
      next = {
        ...next,
        conditions: [...new Set([...next.conditions, trap.condition])],
        condition_durations: trap.conditionDuration
          ? { ...next.condition_durations, [trap.condition]: trap.conditionDuration }
          : next.condition_durations,
      };
    }
  }
  ctx.char = next;
  ctx.st = nextSt;
  ctx.narrative = narrative;
};
