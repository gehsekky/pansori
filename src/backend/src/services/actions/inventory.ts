import type { ActionHandler } from './types.js';

/**
 * `attune`: PHB p.138 — bind to a magic item that requires
 * attunement. Out-of-combat only. Cap of 3 attuned items per
 * character (PHB rule). De-attunement is implicit on item transfer
 * elsewhere.
 */
export const handleAttune: ActionHandler<{ type: 'attune'; instanceId: string }> = (
  ctx,
  action
) => {
  if (ctx.st.combat_active) {
    ctx.narrative = 'You cannot attune to items during combat.';
    return;
  }
  const instanceId = action.instanceId;
  const invItem = ctx.char.inventory.find((i) => i.instance_id === instanceId);
  if (!invItem) {
    ctx.narrative = "You don't have that item.";
    return;
  }
  const lootItem = ctx.context.lootTable.find((l) => l.id === invItem.id);
  if (!lootItem?.requiresAttunement) {
    ctx.narrative = `The ${invItem.name} doesn't require attunement.`;
    return;
  }
  const attunedList = ctx.char.attuned_items ?? [];
  if (attunedList.includes(instanceId)) {
    ctx.narrative = `You are already attuned to the ${invItem.name}.`;
    return;
  }
  if (attunedList.length >= 3) {
    ctx.narrative =
      'You can only be attuned to 3 items at a time (PHB p.138). De-attune one first.';
    return;
  }
  ctx.char = { ...ctx.char, attuned_items: [...attunedList, instanceId] };
  ctx.narrative = `You spend a moment focusing on the ${invItem.name}, attuning yourself to its magic. (${attunedList.length + 1}/3 attuned items)`;
};
