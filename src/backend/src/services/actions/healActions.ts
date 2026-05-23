// **use_healing_hands** (Aasimar species feature): once per long
// rest, action — heal a party member for (prof)d4 HP. The Healer's
// Kit ITEM stays in the inventory as a healing consumable
// (consumed via the `use` action and the item's `heal` property);
// the dedicated Healer-feat handler was removed in the SRD-only
// refactor (no SRD feat grants the +1d6+4+prof bonus heal).

import { profBonus, rollDice } from '../rulesEngine.js';
import type { ActionHandler } from './types.js';

export const handleUseHealingHands: ActionHandler<{
  type: 'use_healing_hands';
  targetCharId: string;
}> = (ctx, action) => {
  if (ctx.char.species !== 'aasimar') {
    return { rejected: 'Healing Hands is an Aasimar species feature.' };
  }
  if ((ctx.char.class_resource_uses?.healing_hands_used ?? 0) > 0) {
    return { rejected: 'Healing Hands already used — recovers on a long rest.' };
  }

  const target = ctx.st.characters.find((c) => c.id === action.targetCharId);
  if (!target || target.dead) {
    return { rejected: 'Invalid target.' };
  }
  if (target.hp >= target.max_hp) {
    return { rejected: `${target.name} is already at full HP.` };
  }

  const dice = profBonus(ctx.char.level);
  const healed = rollDice(`${dice}d4`);
  const newHp = Math.min(target.max_hp, target.hp + healed);

  ctx.char = {
    ...ctx.char,
    class_resource_uses: {
      ...(ctx.char.class_resource_uses ?? {}),
      healing_hands_used: 1,
    },
    turn_actions: { ...ctx.char.turn_actions, action_used: true },
  };
  ctx.st = {
    ...ctx.st,
    characters: ctx.st.characters.map((c) => (c.id === target.id ? { ...c, hp: newHp } : c)),
    entities: (ctx.st.entities ?? []).map((e) =>
      e.id === target.id && !e.isEnemy ? { ...e, hp: newHp } : e
    ),
  };
  ctx.narrative = `${ctx.char.name}'s palms glow with celestial light — Healing Hands restores ${healed} HP to ${target.name} (${dice}d4, now ${newHp}/${target.max_hp}). Recovers on a long rest.`;
};
