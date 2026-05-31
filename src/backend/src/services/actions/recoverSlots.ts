import {
  applyRecoveryPlan,
  availableRecoveries,
  enumerateRecoveryPlans,
  featureLabel,
  planLabel,
  planTotal,
} from '../slotRecovery.js';
import type { ActionHandler } from './types.js';
import type { RecoveryFeature } from '../slotRecovery.js';
import { updatePcActor } from './actor.js';

/**
 * `recover_slots`: spend Wizard Arcane Recovery / Land Druid Natural Recovery to
 * restore expended spell slots. `action.plan` is the chosen allocation id from
 * the option picker; absent → the engine's default (lowest-first, max-count)
 * plan. Validates the chosen plan against the freshly-enumerated set and falls
 * back to the default when missing/invalid. Out of combat only, once / long rest.
 */
export const handleRecoverSlots: ActionHandler<{
  type: 'recover_slots';
  recovery: RecoveryFeature;
  plan?: string;
}> = (ctx, action) => {
  if (ctx.actor.kind !== 'pc') return { rejected: 'Only a party member can recover spell slots.' };
  if (ctx.st.combat_active) {
    ctx.narrative = 'You can only recover spell slots between encounters, not mid-fight.';
    return;
  }
  const char = ctx.actor.char;
  const spec = availableRecoveries(char).find((s) => s.feature === action.recovery);
  if (!spec) {
    ctx.narrative = `${featureLabel[action.recovery]} isn't available right now (it returns after a long rest).`;
    return;
  }
  const plans = enumerateRecoveryPlans(char, spec);
  if (plans.length === 0) {
    ctx.narrative = 'You have no expended spell slots to recover.';
    return;
  }
  // Default (offered first) is the lowest-first plan; honor the player's pick
  // when it matches an offered plan, else fall back to the default.
  const chosen = (action.plan && plans.find((p) => p.id === action.plan)) || plans[0];
  const updated = applyRecoveryPlan(char, spec.feature, chosen.levels);
  updatePcActor(ctx, updated);
  ctx.narrative = `${spec.feature === 'arcane' ? '📖' : '🌿'} ${featureLabel[spec.feature]} — you recover ${chosen.levels.length} spell slot(s) [${planLabel(chosen.levels)}], ${planTotal(chosen.levels)} of ${spec.budget} levels.`;
};
