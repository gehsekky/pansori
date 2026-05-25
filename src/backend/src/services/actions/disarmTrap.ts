import { d20TestPenalty, disarmTrap, rollDice } from '../rulesEngine.js';
import { getRoomTrap, partyDetectsTrap, trapSpent } from '../gameEngine.js';
import type { ActionHandler } from './types.js';
import { applyDamage } from '../damage.js';
import { updatePcActor } from './actor.js';

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
  if (ctx.actor.kind !== 'pc') return { rejected: 'Only PCs can disarm traps.' };
  const { char } = ctx.actor;
  const trap = getRoomTrap(ctx.roomId, ctx.seed, ctx.context);
  if (!trap || trapSpent(ctx.st, ctx.roomId)) {
    return { rejected: 'There is no trap here to disarm.' };
  }
  if (!partyDetectsTrap(ctx.st.characters, trap)) {
    return { rejected: 'You have not located the trap.' };
  }
  const hasToolProf =
    char.tool_proficiencies?.some(
      (t) => t.toLowerCase().includes('thieves') || t.toLowerCase().includes('hacking')
    ) ?? false;
  // 2024 Exhaustion is a flat −2/level penalty (folded into d20TestPenalty),
  // not Disadvantage.
  const { roll, total } = disarmTrap(char.dex, char.level, hasToolProf, d20TestPenalty(char));
  const profNote = hasToolProf ? ` (tool proficiency)` : '';
  let next = char;
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
  updatePcActor(ctx, next);
  ctx.st = nextSt;
  ctx.narrative = narrative;
};
