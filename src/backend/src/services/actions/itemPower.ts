import type { ActionHandler } from './types.js';
import { computeToHitContext } from './attack/toHit.js';
import { primeWeaponPower } from './attack/weaponPowers.js';
import { resolveOneAttack } from './attack/resolveOneAttack.js';
import { runPreattack } from './attack/preattack.js';
import { updatePcActor } from './actor.js';

/**
 * `item_power`: arm an on-hit power of the wielded weapon (SRD Dagger of
 * Venom's poison — a Bonus Action, once per dawn; Staff of Striking's or
 * Withering's charges and Staff of Thunder and Lightning's Lightning / Thunder
 * — no action). The armed rider fires on the next hit with the weapon.
 */
export const handleItemPower: ActionHandler<{
  type: 'item_power';
  instanceId: string;
  power: string;
  charges?: number;
}> = (ctx, action) => {
  if (ctx.actor.kind !== 'pc') return { rejected: 'Only PCs can use items.' };
  const char = { ...ctx.actor.char };
  const res = primeWeaponPower(
    char,
    action.instanceId,
    action.power,
    action.charges,
    ctx.context.lootTable
  );
  if ('error' in res) {
    ctx.narrative = res.error;
    return;
  }
  if (res.bonusAction && ctx.st.combat_active) {
    if (char.turn_actions.bonus_action_used) {
      ctx.narrative = 'You have already used your bonus action this turn.';
      return;
    }
    char.turn_actions = { ...char.turn_actions, bonus_action_used: true };
  }
  updatePcActor(ctx, char);
  ctx.narrative = res.note;
};

/**
 * `bonus_weapon_attack`: SRD Scimitar of Speed — one attack with the wielded
 * weapon as a Bonus Action on each of your turns (in combat).
 */
export const handleBonusWeaponAttack: ActionHandler<{
  type: 'bonus_weapon_attack';
  targetEnemyId?: string;
}> = (ctx, action) => {
  if (ctx.actor.kind !== 'pc') return { rejected: 'Only PCs can attack.' };
  const pc = ctx.actor;
  if (!ctx.st.combat_active) {
    ctx.narrative = 'There is no fight to make a quick strike in.';
    return;
  }
  if (pc.char.turn_actions.bonus_action_used) {
    ctx.narrative = 'You have already used your bonus action this turn.';
    return;
  }
  const pre = runPreattack(ctx, action);
  if (pre.done) return;
  if (!pre.weaponItem?.bonusAttack) {
    ctx.narrative = 'Your weapon has no power to strike as a bonus action.';
    return;
  }
  const toHit = computeToHitContext(ctx, {
    target: pre.target,
    targetId: pre.targetId,
    weaponItem: pre.weaponItem,
  });
  resolveOneAttack(
    ctx,
    {
      target: pre.target,
      targetId: pre.targetId,
      weaponItem: pre.weaponItem,
      weaponDamage: pre.weaponDamage,
      isVersatile: pre.isVersatile,
      weaponLabel: pre.weaponLabel,
      toHit,
    },
    'Bonus attack — '
  );
  updatePcActor(ctx, {
    turn_actions: { ...pc.char.turn_actions, bonus_action_used: true },
  });
};
