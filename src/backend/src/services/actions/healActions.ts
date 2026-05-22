// Two heal-a-target Action-shape handlers — both follow the same
// "use action, pick target, restore HP" pattern but differ in
// resource accounting.
//
// **use_healer_kit** (Healer feat): consumes one charge of a
// Healer's Kit consumable in the PC's inventory. Heal = 1d6 + 4 +
// prof. Multiple kits stack via count; when count hits 0 the item
// is removed.
//
// **use_healing_hands** (Aasimar species): no consumable. Once per
// long rest tracked via `class_resource_uses.healing_hands_used`.
// Heal = (prof)d4 HP.
//
// Both target a party member (`targetCharId`). Both heal only up
// to the target's max_hp. Both mirror onto st.entities (PC grid
// row) when the target is a PC.

import { profBonus, rollDice } from '../rulesEngine.js';
import type { ActionHandler } from './types.js';

function syncCharIntoState(
  ctx: Parameters<ActionHandler<{ type: 'use_healer_kit'; targetCharId: string }>>[0],
  targetId: string,
  newHp: number
): void {
  ctx.st = {
    ...ctx.st,
    characters: ctx.st.characters.map((c) => (c.id === targetId ? { ...c, hp: newHp } : c)),
    entities: (ctx.st.entities ?? []).map((e) =>
      e.id === targetId && !e.isEnemy ? { ...e, hp: newHp } : e
    ),
  };
}

export const handleUseHealerKit: ActionHandler<{
  type: 'use_healer_kit';
  targetCharId: string;
}> = (ctx, action) => {
  if (!(ctx.char.feats ?? []).includes('healer')) {
    return { rejected: `${ctx.char.name} does not have the Healer feat.` };
  }
  // Find a healer's kit with at least 1 charge.
  const kitIdx = ctx.char.inventory.findIndex((i) => i.id === 'healers_kit');
  if (kitIdx === -1) {
    return { rejected: "No Healer's Kit in inventory." };
  }
  const kit = ctx.char.inventory[kitIdx];
  // Charges tracked via `count`. Default to 10 on first use (a
  // freshly-acquired kit may not have count set).
  const charges = (kit.count as number | undefined) ?? 10;
  if (charges <= 0) {
    return { rejected: "Your Healer's Kit is out of charges." };
  }

  const target = ctx.st.characters.find((c) => c.id === action.targetCharId);
  if (!target || target.dead) {
    return { rejected: 'Invalid target.' };
  }
  if (target.hp >= target.max_hp) {
    return { rejected: `${target.name} is already at full HP.` };
  }

  const healed = rollDice('1d6') + 4 + profBonus(ctx.char.level);
  const newHp = Math.min(target.max_hp, target.hp + healed);

  // Decrement kit charges; remove the kit if drained.
  const newCharges = charges - 1;
  const newInventory =
    newCharges <= 0
      ? ctx.char.inventory.filter((_, i) => i !== kitIdx)
      : ctx.char.inventory.map((i, idx) => (idx === kitIdx ? { ...i, count: newCharges } : i));
  ctx.char = {
    ...ctx.char,
    inventory: newInventory,
    turn_actions: { ...ctx.char.turn_actions, action_used: true },
  };
  syncCharIntoState(ctx, target.id, newHp);
  const chargeNote = newCharges > 0 ? ` (${newCharges} charges left)` : ' (kit exhausted)';
  ctx.narrative = `${ctx.char.name} applies the Healer's Kit to ${target.name} — ${target.name} regains ${healed} HP (now ${newHp}/${target.max_hp})${chargeNote}.`;
};

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
  syncCharIntoState(ctx, target.id, newHp);
  ctx.narrative = `${ctx.char.name}'s palms glow with celestial light — Healing Hands restores ${healed} HP to ${target.name} (${dice}d4, now ${newHp}/${target.max_hp}). Recovers on a long rest.`;
};
