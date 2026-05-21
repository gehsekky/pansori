import {
  profBonus,
  resolveMysteryConsumable,
  resolveSaveWithAdvantage,
  rollDice,
} from '../rulesEngine.js';
import type { ActionHandler } from './types.js';
import { fmt } from '../narrativeFmt.js';
import { getItemData } from '../gameEngine.js';

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
        nextSt = {
          ...nextSt,
          characters: nextSt.characters.map((c, i) => (i === targetIdx ? { ...c, hp: newHp } : c)),
          entities: (nextSt.entities ?? []).map((e) =>
            e.id === target.id && !e.isEnemy ? { ...e, hp: newHp } : e
          ),
        };
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
        nextChar = { ...nextChar, hp: Math.max(1, nextChar.hp - value) };
        narrative = `You use the ${held.name}. Immediate. Searing. Regret. -${fmt.hp(value)} HP.`;
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
    nextChar = {
      ...nextChar,
      turn_actions: {
        ...nextChar.turn_actions,
        ...(isPotionLike ? { bonus_action_used: true } : { action_used: true }),
      },
    };
  }
  ctx.char = nextChar;
  ctx.st = nextSt;
  ctx.narrative = narrative;
};
