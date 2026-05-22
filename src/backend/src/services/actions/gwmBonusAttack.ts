// 2024 PHB Great Weapon Master — bonus-action follow-up attack.
//
// Trigger: after a Heavy-weapon hit that's a Critical Hit OR
// reduces a creature to 0 HP. The trigger sets
// `turn_actions.gwm_bonus_attack_pending` on the PC.
//
// This handler consumes the pending flag, makes one weapon attack
// with the equipped Heavy weapon (full damage die, not the
// butt-end 1d4 like PAM), and consumes the bonus action.
//
// Mechanically similar to twoWeaponAttack but with the main weapon
// and ability mod included on damage. Extra Attack does NOT chain
// off this — RAW: only ONE additional attack.

import {
  DISADV_CONDITIONS,
  applyDamageMultiplier,
  hasArmorProficiency,
  hasWeaponProficiency,
  resolvePlayerAttack,
} from '../rulesEngine.js';
import {
  applyPartyLevelUps,
  endCombatState,
  grantDarkOnesBlessing,
  isRoomCleared,
  splitEncounterXp,
} from '../gameEngine.js';
import type { ActionHandler } from './types.js';
import type { GameState } from '../../types.js';

export const handleGwmBonusAttack: ActionHandler<{
  type: 'gwm_bonus_attack';
  targetEnemyId?: string;
}> = (ctx, action) => {
  if (!ctx.st.combat_active) {
    ctx.narrative = 'No enemy to attack.';
    return;
  }
  if (!(ctx.char.feats ?? []).includes('great_weapon_master')) {
    return { rejected: `${ctx.char.name} does not have the Great Weapon Master feat.` };
  }
  if (!ctx.char.turn_actions.gwm_bonus_attack_pending) {
    return {
      rejected:
        'Great Weapon Master bonus attack requires a prior Crit or kill with a heavy weapon this turn.',
    };
  }
  if (ctx.char.turn_actions.bonus_action_used) {
    return { rejected: 'Bonus action already used this turn.' };
  }

  const weaponInstanceId = ctx.char.equipped_weapon;
  const weaponInvItem = ctx.char.inventory.find((i) => i.instance_id === weaponInstanceId);
  const weaponLoot = weaponInvItem
    ? ctx.context.lootTable.find((l) => l.id === weaponInvItem.id)
    : null;
  if (!weaponLoot || !weaponLoot.heavy) {
    return { rejected: 'GWM bonus attack requires a Heavy weapon equipped.' };
  }

  const targetId: string = action.targetEnemyId ?? ctx.enemy?.id ?? '';
  const enemyInRoom = ctx.livingEnemiesInRoom.find((e) => e.id === targetId) ?? ctx.enemy;
  if (!enemyInRoom) {
    ctx.narrative = 'No enemy here.';
    return;
  }
  const targetEntityId = enemyInRoom.id;

  const condDisadv = ctx.char.conditions.some((c) => DISADV_CONDITIONS.has(c));
  const armorLootItem = ctx.char.equipped_armor
    ? ctx.context.lootTable.find(
        (l) =>
          l.id === ctx.char.inventory.find((i) => i.instance_id === ctx.char.equipped_armor)?.id
      )
    : null;
  const armorProf = hasArmorProficiency(
    ctx.char.armor_proficiencies ?? [],
    armorLootItem?.armorCategory
  );
  const weaponProf = hasWeaponProficiency(
    ctx.char.weapon_proficiencies ?? [],
    weaponLoot.weaponType
  );
  const disadv = condDisadv || !armorProf;

  const atk = resolvePlayerAttack(
    { str: ctx.char.str, dex: ctx.char.dex, level: ctx.char.level },
    weaponLoot.damage,
    enemyInRoom.ac,
    weaponLoot.finesse ?? false,
    false,
    disadv,
    weaponProf
  );

  let nextChar = {
    ...ctx.char,
    turn_actions: {
      ...ctx.char.turn_actions,
      bonus_action_used: true,
      gwm_bonus_attack_pending: undefined,
    },
  };
  ctx.usedInitiative = true;

  if (atk.fumble) {
    ctx.char = nextChar;
    ctx.narrative = `GWM bonus attack: fumble! Your ${weaponLoot.name} swings wide. (d20: 1)`;
    return;
  }
  if (!atk.hit) {
    ctx.char = nextChar;
    ctx.narrative = `GWM bonus attack with ${weaponLoot.name} misses. (${atk.roll}+${atk.atkMod}+${atk.prof}=${atk.total} vs AC ${enemyInRoom.ac})`;
    return;
  }
  const ent = ctx.st.entities?.find((e) => e.id === targetEntityId && e.isEnemy);
  const curHp = ent?.hp ?? 0;
  const { damage: effDmg, note: dmgNote } = applyDamageMultiplier(
    atk.damage,
    weaponLoot.damageType,
    enemyInRoom
  );
  const newHp = curHp - effDmg;
  let nextSt: GameState = {
    ...ctx.st,
    entities: (ctx.st.entities ?? []).map((e) =>
      e.id === targetEntityId && e.isEnemy ? { ...e, hp: newHp } : e
    ),
  };
  let narrative = `Great Weapon Master bonus attack with ${weaponLoot.name}! ${effDmg} damage${dmgNote}${atk.critical ? ' (CRITICAL!)' : ''} (${atk.roll}+${atk.atkMod}+${atk.prof}=${atk.total} vs AC ${enemyInRoom.ac}).`;

  if (newHp <= 0) {
    const xpGain = enemyInRoom.xp ?? 10;
    const split = splitEncounterXp(nextSt, nextChar.id, xpGain);
    nextSt = split.st;
    nextChar = { ...nextChar, xp: (nextChar.xp || 0) + split.share };
    narrative += ` The ${enemyInRoom.name} falls!`;
    nextSt = {
      ...nextSt,
      entities: (nextSt.entities ?? []).map((e) =>
        e.id === targetEntityId && e.isEnemy ? { ...e, hp: 0 } : e
      ),
      enemies_killed: [...(nextSt.enemies_killed || []), targetEntityId],
    };
    narrative += grantDarkOnesBlessing(nextChar);
    narrative += applyPartyLevelUps(nextSt, nextChar, ctx.context);
    if (nextSt.combat_active && isRoomCleared(nextSt, ctx.seed, ctx.roomId)) {
      nextSt = endCombatState(nextSt);
    }
  }
  ctx.char = nextChar;
  ctx.st = nextSt;
  ctx.narrative = narrative;
};
