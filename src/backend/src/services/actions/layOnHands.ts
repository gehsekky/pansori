import { getClassLevel, layOnHandsRemaining } from '../multiclass.js';
import type { ActionHandler } from './types.js';
import type { Character } from '../../types.js';
import { fmt } from '../narrativeFmt.js';
import { updatePcActor } from './actor.js';

/**
 * `lay_on_hands` (SRD 5.2.1 Paladin L1): touch a party member (or self) and
 * draw from the healing pool (5 × Paladin level HP, replenished on a long
 * rest) to restore HP. Heals the lesser of the target's missing HP and the
 * remaining pool, spending only what's used. A bonus action in combat
 * (self-managed so it stays usable out of combat); the pool is tracked as
 * points spent on `class_resource_uses.lay_on_hands`. The poison-cure use
 * (5 points to end Poisoned) is a deferred follow-up. (RE-2.)
 */
export const handleLayOnHands: ActionHandler<{ type: 'lay_on_hands'; targetCharId: string }> = (
  ctx,
  action
) => {
  if (ctx.actor.kind !== 'pc') return { rejected: 'Only PCs can use Lay on Hands.' };
  const { char } = ctx.actor;
  if (getClassLevel(char, 'paladin') < 1) {
    return { rejected: 'Only Paladins have Lay on Hands.' };
  }
  if (ctx.st.combat_active && char.turn_actions.bonus_action_used) {
    ctx.narrative = 'Bonus action already used this turn.';
    return;
  }
  const remaining = layOnHandsRemaining(char);
  if (remaining <= 0) {
    ctx.narrative = 'Your Lay on Hands pool is empty (recovers on a long rest).';
    return;
  }
  const target = ctx.st.characters.find((c) => c.id === action.targetCharId && !c.dead);
  if (!target) return { rejected: 'No such ally to heal.' };
  const missing = target.max_hp - target.hp;
  if (missing <= 0) {
    ctx.narrative = `${target.name} is already at full Hit Points.`;
    return;
  }

  const heal = Math.min(missing, remaining);
  const newHp = target.hp + heal;
  const isSelf = target.id === char.id;

  // Caster bookkeeping: spend the pool + (in combat) the bonus action, and
  // the HP when healing self. commitChar() in the epilogue syncs the caster
  // + their grid entity; an ally is synced into st below.
  const casterPatch: Partial<Character> = {
    class_resource_uses: {
      ...char.class_resource_uses,
      lay_on_hands: (char.class_resource_uses?.lay_on_hands ?? 0) + heal,
    },
  };
  if (ctx.st.combat_active) {
    casterPatch.turn_actions = { ...char.turn_actions, bonus_action_used: true };
  }
  if (isSelf) casterPatch.hp = newHp;
  updatePcActor(ctx, casterPatch);

  if (!isSelf) {
    ctx.st = {
      ...ctx.st,
      characters: ctx.st.characters.map((c) => (c.id === target.id ? { ...c, hp: newHp } : c)),
      entities: (ctx.st.entities ?? []).map((e) =>
        e.id === target.id && !e.isEnemy ? { ...e, hp: newHp } : e
      ),
    };
  }

  const who = isSelf ? 'themselves' : target.name;
  ctx.narrative = `${char.name} lays on hands — ${fmt.hp(heal)} HP restored to ${who} (now ${fmt.hp(newHp, target.max_hp)}). (${remaining - heal} HP left in the pool)`;
};
