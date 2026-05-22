// 2024 PHB Celestial Warlock L3 — Healing Light.
//
// Pool of (1 + warlock level) d6 dice. As a Bonus Action, spend
// any subset of dice to heal yourself or a creature within 60
// feet. Pool refills on a Long Rest.
//
// Pansori MVP: pool tracked via class_resource_uses.healing_light_used
// (counts spent dice). The remaining-dice computation is
// (1 + warlockLevel) - used. Long-rest reset clears the counter.

import { getClassLevel, hasClass } from '../multiclass.js';
import type { ActionHandler } from './types.js';
import { rollDice } from '../rulesEngine.js';

export const handleHealingLight: ActionHandler<{
  type: 'use_healing_light';
  dice: number;
  targetCharId?: string;
}> = (ctx, action) => {
  if (!hasClass(ctx.char, 'warlock') || ctx.char.subclass !== 'celestial') {
    return { rejected: 'Healing Light is a Celestial Warlock feature.' };
  }
  const warlockLvl = getClassLevel(ctx.char, 'warlock');
  if (warlockLvl < 3) {
    return { rejected: 'Healing Light unlocks at Warlock level 3.' };
  }
  if (ctx.char.turn_actions.bonus_action_used) {
    return { rejected: 'Bonus action already used this turn.' };
  }
  const pool = 1 + warlockLvl;
  const used = ctx.char.class_resource_uses?.healing_light_used ?? 0;
  const remaining = pool - used;
  if (remaining <= 0) {
    return { rejected: 'No Healing Light dice remaining (recovers on a long rest).' };
  }
  const requested = Math.max(1, action.dice);
  const spend = Math.min(remaining, requested);

  // Target resolution: explicit targetCharId wins; otherwise self.
  let target = ctx.char;
  let isSelf = true;
  if (action.targetCharId && action.targetCharId !== ctx.char.id) {
    const ally = ctx.st.characters.find((c) => c.id === action.targetCharId && !c.dead);
    if (ally) {
      target = ally;
      isSelf = false;
    }
  }

  const healAmount = rollDice(`${spend}d6`);
  const prevHp = target.hp;
  const newHp = Math.min(target.max_hp, target.hp + healAmount);
  const actualHealed = newHp - prevHp;

  // Apply the heal.
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
  // Bookkeeping on the caster.
  ctx.char = {
    ...ctx.char,
    turn_actions: { ...ctx.char.turn_actions, bonus_action_used: true },
    class_resource_uses: {
      ...(ctx.char.class_resource_uses ?? {}),
      healing_light_used: used + spend,
    },
  };
  ctx.usedInitiative = true;

  const newRemaining = pool - (used + spend);
  const subjectName = isSelf ? ctx.char.name : target.name;
  ctx.narrative = `✦ Healing Light — ${ctx.char.name} channels celestial energy: ${spend}d6 → ${actualHealed} HP restored to ${subjectName} (now ${newHp}/${target.max_hp}). (${newRemaining}/${pool} dice remaining)`;
};
