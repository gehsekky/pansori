import { commitCharacter, getItemData } from '../gameEngine.js';
import {
  profBonus,
  resolveMysteryConsumable,
  resolveSaveWithAdvantage,
  rollDice,
} from '../rulesEngine.js';
import type { ActionHandler } from './types.js';
import { applyDamage } from '../damage.js';
import { fmt } from '../narrativeFmt.js';

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
  let narrative = `You spend a moment focusing on the ${invItem.name}, attuning yourself to its magic. (${attunedList.length + 1}/3 attuned items)`;
  // Cursed items reveal on attunement (PHB p.214). The curse text is
  // appended so the player learns about the curse and knows they're
  // bound until remove-curse or equivalent.
  if (lootItem.cursed) {
    narrative += ` ⚠ Curse revealed: ${lootItem.curseDesc ?? 'this item is cursed. You cannot end the attunement by choice.'}`;
  }
  ctx.narrative = narrative;
};

/**
 * `de_attune`: voluntarily end attunement with a magic item (PHB
 * p.215 — "If you cease attunement, you spend another short rest..."
 * — Pansori treats this as out-of-combat, no resource cost). Cursed
 * items resist voluntary de-attunement; a Remove Curse / Greater
 * Restoration would be required (not yet implemented as a spell —
 * cursed items currently can't be unbound until that lands).
 */
export const handleDeAttune: ActionHandler<{ type: 'de_attune'; instanceId: string }> = (
  ctx,
  action
) => {
  if (ctx.st.combat_active) {
    ctx.narrative = 'You cannot end attunement during combat.';
    return;
  }
  const attunedList = ctx.char.attuned_items ?? [];
  if (!attunedList.includes(action.instanceId)) {
    ctx.narrative = 'You are not attuned to that item.';
    return;
  }
  const invItem = ctx.char.inventory.find((i) => i.instance_id === action.instanceId);
  const lootItem = invItem ? ctx.context.lootTable.find((l) => l.id === invItem.id) : undefined;
  if (lootItem?.cursed) {
    ctx.narrative = `The curse on the ${invItem?.name ?? 'item'} prevents voluntary de-attunement. You'll need Remove Curse magic to break this bond.`;
    return;
  }
  // De-attuning a currently-equipped attunement-required item also
  // implicitly unequips it (since the equip check gates on attunement).
  let next = {
    ...ctx.char,
    attuned_items: attunedList.filter((id) => id !== action.instanceId),
  };
  if (lootItem?.requiresAttunement) {
    if (next.equipped_weapon === action.instanceId) next = { ...next, equipped_weapon: null };
    if (next.equipped_armor === action.instanceId) next = { ...next, equipped_armor: null };
    if (next.equipped_shield === action.instanceId) next = { ...next, equipped_shield: null };
  }
  ctx.char = next;
  ctx.narrative = `You release your attunement to the ${invItem?.name ?? 'item'}.`;
};

/**
 * `use`: invoke a held item. Weapon/armor items get a "use 'equip'
 * instead" hint. Consumables branch by effect:
 * - heal: rollDice + medicine-skill prof bonus, can target self or
 *   another party member; syncs grid entity HP
 * - con_advantage: CON save with advantage, consumes the item
 * - mystery: random heal / hurt / nothing
 *
 * In combat: potion-like consumables cost a bonus action (SRD 5.2.1
 * p.204); everything else costs a full action.
 */
export const handleUse: ActionHandler<{
  type: 'use';
  itemId: string;
  targetCharId?: string;
}> = (ctx, action) => {
  const held = ctx.char.inventory?.find((i) => i.id === action.itemId);
  if (!held) {
    ctx.narrative = "You search your pack — you don't have that.";
    return;
  }
  const itemData = getItemData(held, ctx.context);
  const firstIdx = ctx.char.inventory.findIndex((i) => i.id === held.id);

  let nextChar = ctx.char;
  let nextSt = ctx.st;
  let narrative: string;

  if (itemData.slot === 'weapon') {
    narrative = `The ${held.name} is ready. Use "attack" to strike, or "equip" to make it your active weapon.`;
  } else if (itemData.slot === 'armor') {
    narrative = `The ${held.name} offers protection. Use "equip" to don it for a +${itemData.ac_bonus || 0} AC bonus.`;
  } else if (itemData.type === 'consumable') {
    if (itemData.heal) {
      const hasMedicine =
        ctx.context.classSkills[nextChar.character_class]?.includes('medicine') ?? false;
      const healBonus = hasMedicine ? profBonus(nextChar.level) : 0;
      const healed = rollDice(itemData.heal) + healBonus;
      const bonusNote = healBonus > 0 ? ` (+${healBonus} medicine)` : '';

      const targetId = action.targetCharId;
      const targetIdx = targetId
        ? nextSt.characters.findIndex((c) => c.id === targetId)
        : ctx.safeIdx;
      const isSelf = !targetId || targetIdx === ctx.safeIdx;

      if (!isSelf && targetIdx >= 0) {
        const target = nextSt.characters[targetIdx];
        const newHp = Math.min(target.max_hp, target.hp + healed);
        nextSt = commitCharacter(nextSt, { ...target, hp: newHp });
        nextChar = {
          ...nextChar,
          inventory: nextChar.inventory.filter((_, i) => i !== firstIdx),
        };
        narrative = `${nextChar.name} uses the ${held.name} on ${target.name} — ${fmt.hp(healed)} HP restored${bonusNote} (now ${fmt.hp(newHp, target.max_hp)}).`;
      } else {
        const newHp = Math.min(nextChar.max_hp, nextChar.hp + healed);
        nextChar = {
          ...nextChar,
          hp: newHp,
          inventory: nextChar.inventory.filter((_, i) => i !== firstIdx),
        };
        nextSt = {
          ...nextSt,
          entities: (nextSt.entities ?? []).map((e) =>
            e.id === nextChar.id && !e.isEnemy ? { ...e, hp: newHp } : e
          ),
        };
        narrative = `You use the ${held.name} and recover ${fmt.hp(healed)} HP${bonusNote} (now ${fmt.hp(newHp, nextChar.max_hp)}).`;
      }
    } else if (itemData.effect === 'con_advantage') {
      nextChar = { ...nextChar, inventory: nextChar.inventory.filter((_, i) => i !== firstIdx) };
      const { roll1, roll2, best } = resolveSaveWithAdvantage(nextChar.con);
      narrative = `You use the ${held.name}. CON save with advantage: rolled ${roll1} and ${roll2} — keeping the ${best}. You feel steadier.`;
    } else if (itemData.effect === 'mystery') {
      nextChar = { ...nextChar, inventory: nextChar.inventory.filter((_, i) => i !== firstIdx) };
      const { result, value } = resolveMysteryConsumable();
      if (result === 'heal') {
        nextChar = { ...nextChar, hp: Math.min(nextChar.max_hp, nextChar.hp + value) };
        narrative = `You use the ${held.name}. It tastes of regret and eucalyptus — but you feel better? +${fmt.hp(value)} HP.`;
      } else if (result === 'hurt') {
        // Mystery consumable can't kill — cap the damage at hp-1 then route
        // through applyDamage so concentration is checked correctly.
        const safeDmg = Math.min(value, Math.max(0, nextChar.hp - 1));
        const dmgResult = applyDamage(nextChar, nextSt, safeDmg);
        nextChar = dmgResult.char;
        nextSt = dmgResult.st;
        narrative = `You use the ${held.name}. Immediate. Searing. Regret. -${fmt.hp(value)} HP.${dmgResult.concentrationNote}`;
      } else {
        narrative = `You use the ${held.name}. Nothing happens. You stand there feeling foolish.`;
      }
    } else {
      narrative = `You use the ${held.name}. Something may have happened.`;
    }
  } else {
    narrative = itemData.useNarrative || `You examine the ${held.name}. Might come in handy.`;
  }

  if (nextSt.combat_active) {
    const isPotionLike =
      itemData.type === 'consumable' &&
      (itemData.heal != null ||
        itemData.effect === 'con_advantage' ||
        itemData.effect === 'mystery');
    // 2024 PHB Thief Rogue Fast Hands — Utilize action becomes a
    // Bonus Action. Any item-use that would normally cost an
    // action now costs a bonus action instead. Doesn't change
    // potions (already bonus-action) or weapon-equip flavor texts.
    // The 'thief' subclass is exclusive to Rogue, so the subclass
    // check is sufficient.
    const isFastHandsBonus = !isPotionLike && nextChar.subclass === 'thief';
    nextChar = {
      ...nextChar,
      turn_actions: {
        ...nextChar.turn_actions,
        ...(isPotionLike || isFastHandsBonus ? { bonus_action_used: true } : { action_used: true }),
      },
    };
  }
  ctx.char = nextChar;
  ctx.st = nextSt;
  ctx.narrative = narrative;
};
