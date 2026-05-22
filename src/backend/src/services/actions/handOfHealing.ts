// 2024 PHB Mercy Monk L3 — Hand of Healing.
//
// Bonus action. Spend 1 Ki (Discipline) to heal a creature within
// 5 ft for 1d6 + WIS mod HP. Self or ally.
//
// Pansori MVP: track via class_resource_uses.ki_points (existing
// Monk resource). Mercy Monk pool refills on short/long rest
// alongside the standard Ki pool — no changes to rest.ts needed.

import { abilityMod, rollDice } from '../rulesEngine.js';
import { getClassLevel, hasClass } from '../multiclass.js';
import type { ActionHandler } from './types.js';

export const handleHandOfHealing: ActionHandler<{
  type: 'use_hand_of_healing';
  targetCharId?: string;
}> = (ctx, action) => {
  if (!hasClass(ctx.char, 'monk') || ctx.char.subclass !== 'mercy') {
    return { rejected: 'Hand of Healing is a Mercy Monk feature.' };
  }
  const monkLvl = getClassLevel(ctx.char, 'monk');
  if (monkLvl < 3) {
    return { rejected: 'Hand of Healing unlocks at Monk level 3.' };
  }
  const ki = ctx.char.class_resource_uses?.ki_points ?? monkLvl;
  if (ki <= 0) {
    return { rejected: 'No Ki points remaining (recovers on a short or long rest).' };
  }
  if (ctx.char.turn_actions.bonus_action_used) {
    return { rejected: 'Bonus action already used this turn.' };
  }

  // Target resolution: explicit targetCharId or self.
  let target = ctx.char;
  let isSelf = true;
  if (action.targetCharId && action.targetCharId !== ctx.char.id) {
    const ally = ctx.st.characters.find((c) => c.id === action.targetCharId && !c.dead);
    if (ally) {
      target = ally;
      isSelf = false;
    }
  }

  const heal = rollDice('1d6') + abilityMod(ctx.char.wis);
  const prevHp = target.hp;
  const newHp = Math.min(target.max_hp, target.hp + heal);
  const actualHealed = newHp - prevHp;
  if (isSelf) {
    ctx.char = { ...ctx.char, hp: newHp };
  } else {
    ctx.st = {
      ...ctx.st,
      characters: ctx.st.characters.map((c) => (c.id === target.id ? { ...c, hp: newHp } : c)),
      entities: (ctx.st.entities ?? []).map((e) =>
        e.id === target.id && !e.isEnemy ? { ...e, hp: newHp } : e
      ),
    };
  }
  ctx.char = {
    ...ctx.char,
    turn_actions: { ...ctx.char.turn_actions, bonus_action_used: true },
    class_resource_uses: {
      ...(ctx.char.class_resource_uses ?? {}),
      ki_points: ki - 1,
    },
  };
  ctx.usedInitiative = true;
  ctx.narrative = `🤲 Hand of Healing — ${ctx.char.name} channels mercy: ${actualHealed} HP restored to ${target.name} (now ${newHp}/${target.max_hp}). (${ki - 1} Ki remaining)`;
};
