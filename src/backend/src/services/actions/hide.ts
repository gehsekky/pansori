import type { ActionContext, ActionHandler } from './types.js';
import { abilityMod, d20TestPenalty, skillCheck } from '../rulesEngine.js';
import {
  canAttemptHide,
  consumeBardicForCheck,
  consumeInspirationForCheck,
  consumeLuckForCheck,
  inflictCondition,
  isHeavilyEncumbered,
} from '../gameEngine.js';
import { consumeStrokeOfLuck, strokeOfLuckAvailable } from '../strokeOfLuck.js';
import {
  hasExpertise,
  hasJackOfAllTrades,
  hasReliableTalent,
  peerlessSkillDie,
} from '../multiclass.js';
import { updatePcActor } from './actor.js';

/**
 * Result of a Hide attempt:
 *   - `{ ok: false, reason }` — the SRD positional prerequisite failed (the
 *     creature is in plain view). The caller should NOT spend an action.
 *   - `{ ok: true, success }` — the attempt was made and resolved; `success`
 *     reports whether the DC 15 Stealth check beat the DC. Either way the
 *     action is spent (RAW: you took the action even on a failed check).
 */
export type HideResult = { ok: false; reason: string } | { ok: true; success: boolean };

/**
 * Shared SRD 5.2.1 Hide [Action] resolution, used by both the general `hide`
 * action and the Rogue's `cunning_action_hide` (Cunning Action) bonus action.
 * Does NOT touch action economy — each caller spends the appropriate slot.
 *
 * Gate: `canAttemptHide` (Heavily Obscured or behind Three-Quarters / Total
 * Cover, and out of every enemy's line of sight). Resolution: a flat DC 15
 * Dexterity (Stealth) check (NOT contested vs passive Perception — that was the
 * 2014 model). On success the creature gains the Invisible condition and the
 * check total is recorded as `hide_dc`, the DC a creature must beat with a
 * Wisdom (Perception) check to find it (see `resolveEnemyHideCheck`).
 */
export function resolveHideAttempt(ctx: ActionContext): HideResult {
  if (ctx.actor.kind !== 'pc') return { ok: false, reason: 'only player characters can hide' };
  const pc = ctx.actor;
  const eligibility = canAttemptHide(pc.char, ctx.st, ctx.seed);
  if (!eligibility.allowed) return { ok: false, reason: eligibility.reason };

  const HIDE_DC = 15;
  // SRD Pass without Trace — +10 to the Stealth check (folded into the check's
  // effective DC, the same way the bardic roll is below; the displayed DC stays 15).
  const passWithoutTraceBonus = pc.char.pass_without_trace_active ? 10 : 0;
  const hideProf = pc.char.skill_proficiencies?.includes('Stealth') ?? false;
  const inspAdv = consumeInspirationForCheck(pc.char);
  const luckAdv = consumeLuckForCheck(pc.char);
  const bardicRoll = consumeBardicForCheck(pc.char);
  const peerlessRoll = peerlessSkillDie(pc.char);
  const check = skillCheck(
    pc.char.dex,
    HIDE_DC - bardicRoll - passWithoutTraceBonus,
    hideProf,
    pc.char.level,
    isHeavilyEncumbered(pc.char),
    hasExpertise(pc.char, 'Stealth'),
    hasJackOfAllTrades(pc.char),
    inspAdv || luckAdv,
    pc.char.species === 'halfling',
    hasReliableTalent(pc.char),
    strokeOfLuckAvailable(pc.char),
    d20TestPenalty(pc.char),
    peerlessRoll
  );
  if (check.strokeOfLuckUsed) updatePcActor(ctx, consumeStrokeOfLuck(pc.char));
  else if (check.peerlessSkillUsed) {
    const bi = pc.char.class_resource_uses?.bardic_inspiration ?? abilityMod(pc.char.cha);
    updatePcActor(ctx, {
      class_resource_uses: {
        ...(pc.char.class_resource_uses ?? {}),
        bardic_inspiration: Math.max(0, bi - 1),
      },
    });
  }
  if (check.success) {
    updatePcActor(ctx, inflictCondition(pc.char, 'invisible'));
    pc.char.hide_dc = check.total;
    ctx.narrative = `${pc.char.name} hides! (Stealth ${check.total} vs DC ${HIDE_DC} — success.) Hide DC = ${check.total}.`;
  } else {
    pc.char.hide_dc = undefined;
    ctx.narrative = `${pc.char.name} tries to hide but fails. (Stealth ${check.total} vs DC ${HIDE_DC})`;
  }
  return { ok: true, success: check.success };
}

/**
 * `hide`: SRD 5.2.1 Hide [Action]. The general Action any class can take in
 * combat. Rogues additionally get Hide as a Bonus Action (Cunning Action,
 * `cunning_action_hide`) from level 2. The action is spent only when the
 * attempt is actually made — an out-of-position rejection costs nothing.
 */
export const handleHide: ActionHandler<{ type: 'hide' }> = (ctx) => {
  if (!ctx.st.combat_active) return { rejected: 'You can only take the Hide action in combat.' };
  if (ctx.actor.kind !== 'pc') return { rejected: 'Only PCs can take the Hide action.' };
  const result = resolveHideAttempt(ctx);
  if (!result.ok) return { rejected: `You can't hide — ${result.reason}.` };
  ctx.usedInitiative = true;
};
