// 2024 PHB Land Druid L3 — Land's Aid.
//
// Channel Nature (2 uses per long rest at L3, more at higher
// levels per RAW). Pansori MVP: track via
// `class_resource_uses.lands_aid_used` with a fixed 2/long rest
// cap. Higher tiers (L6 = 3/rest, L11 = 4/rest, L17 = unlimited)
// are deferred — flat 2 for now.
//
// Action: bonus action. Pick one of three variants at use time:
//   - heal: heal a creature within 30 ft for 2d6 + druid level HP.
//   - harm_necrotic / harm_radiant: deal 2d6 + druid level damage
//     to a creature within 30 ft, CON save (DC = 8 + prof + WIS)
//     for half.

import { abilityMod, profBonus, rollDice } from '../rulesEngine.js';
import { getClassLevel, hasClass } from '../multiclass.js';
import type { ActionHandler } from './types.js';
import { composeNow } from '../narrative/compose.js';

const MAX_USES = 2;

export const handleLandsAid: ActionHandler<{
  type: 'use_lands_aid';
  variant: 'heal' | 'harm_necrotic' | 'harm_radiant';
  targetCharId?: string;
  targetEnemyId?: string;
}> = (ctx, action) => {
  if (!hasClass(ctx.char, 'druid') || ctx.char.subclass !== 'land') {
    return { rejected: "Land's Aid is a Land Druid feature." };
  }
  const druidLvl = getClassLevel(ctx.char, 'druid');
  if (druidLvl < 3) {
    return { rejected: "Land's Aid unlocks at Druid level 3." };
  }
  const used = ctx.char.class_resource_uses?.lands_aid_used ?? 0;
  if (used >= MAX_USES) {
    return { rejected: "No Land's Aid uses remaining (2/long rest)." };
  }
  if (ctx.char.turn_actions.bonus_action_used) {
    return { rejected: 'Bonus action already used this turn.' };
  }

  const wisMod = abilityMod(ctx.char.wis);
  ctx.usedInitiative = true;

  if (action.variant === 'heal') {
    // Target an ally or self (default to most-injured ally,
    // self if no injured ally exists).
    let target = ctx.char;
    let isSelf = true;
    if (action.targetCharId && action.targetCharId !== ctx.char.id) {
      const ally = ctx.st.characters.find((c) => c.id === action.targetCharId && !c.dead);
      if (ally) {
        target = ally;
        isSelf = false;
      }
    } else {
      const injured = ctx.st.characters.filter(
        (c) => !c.dead && c.hp < c.max_hp && c.id !== ctx.char.id
      );
      if (injured.length > 0) {
        target = injured.reduce((a, b) => (a.hp < b.hp ? a : b));
        isSelf = false;
      }
    }
    const heal = rollDice('2d6') + druidLvl;
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
        lands_aid_used: used + 1,
      },
    };
    ctx.narrative = `🌿 Land's Aid — ${ctx.char.name} channels nature: ${actualHealed} HP restored to ${target.name} (now ${newHp}/${target.max_hp}). (${MAX_USES - used - 1}/${MAX_USES} uses left)`;
    return;
  }

  // Damage variants.
  const enemyId = action.targetEnemyId ?? ctx.enemy?.id;
  const enemyData = enemyId
    ? (ctx.livingEnemiesInRoom.find((e) => e.id === enemyId) ?? ctx.enemy)
    : ctx.enemy;
  if (!enemyData) {
    return { rejected: 'No enemy to target.' };
  }
  const dmgType = action.variant === 'harm_necrotic' ? 'necrotic' : 'radiant';
  const dc = 8 + profBonus(ctx.char.level) + wisMod;
  const enemyCon = (enemyData as unknown as Record<string, number>)?.con ?? 10;
  const save = rollDice('1d20') + abilityMod(enemyCon);
  const fullDmg = rollDice('2d6') + druidLvl;
  const dmg = save >= dc ? Math.floor(fullDmg / 2) : fullDmg;
  composeNow(ctx, {
    kind: 'save',
    characterId: enemyData.id,
    characterName: enemyData.name,
    ability: 'con',
    roll: save,
    dc,
    success: save >= dc,
    vs: "Land's Aid",
    prose: '',
  });
  const ent = ctx.st.entities?.find((e) => e.id === enemyData.id && e.isEnemy);
  const curHp = ent?.hp ?? 0;
  const newHp = Math.max(0, curHp - dmg);
  ctx.st = {
    ...ctx.st,
    entities: (ctx.st.entities ?? []).map((e) =>
      e.id === enemyData.id && e.isEnemy ? { ...e, hp: newHp } : e
    ),
  };
  ctx.char = {
    ...ctx.char,
    turn_actions: { ...ctx.char.turn_actions, bonus_action_used: true },
    class_resource_uses: {
      ...(ctx.char.class_resource_uses ?? {}),
      lands_aid_used: used + 1,
    },
  };
  ctx.narrative = `🌿 Land's Aid — ${ctx.char.name} channels nature: ${enemyData.name} CON ${save} vs DC ${dc} — ${dmg} ${dmgType}${save >= dc ? ' (half)' : ''}. (${MAX_USES - used - 1}/${MAX_USES} uses left)`;
};
