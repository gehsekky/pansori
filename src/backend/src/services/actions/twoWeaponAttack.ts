import {
  DISADV_CONDITIONS,
  applyDamageMultiplier,
  hasArmorProficiency,
  hasWeaponProficiency,
  resolveOffHandAttack,
} from '../rulesEngine.js';
import {
  applyPartyLevelUps,
  endCombatState,
  grantDarkOnesBlessing,
  isRoomCleared,
  splitEncounterXp,
} from '../gameEngine.js';
import { equippedArmorId, equippedWeaponId } from '../equipment.js';
import type { ActionHandler } from './types.js';
import type { GameState } from '../../types.js';
import { hasFightingStyle } from '../fightingStyle.js';
import { updatePcActor } from './actor.js';

/**
 * `two_weapon_attack`: SRD off-hand strike. No ability mod to
 * damage. Normally costs a bonus action; SRD Nick mastery
 * (dagger, light hammer, sickle, scimitar) trained users get it free
 * as part of the Attack action — frees the bonus action for Cunning
 * Action / Rage / etc.
 *
 * On-hit: damage the target entity, grant kill XP via splitEncounterXp,
 * fire Warlock Dark One's Blessing / party level-ups if applicable,
 * and end combat if the kill clears the room.
 */
export const handleTwoWeaponAttack: ActionHandler<{
  type: 'two_weapon_attack';
  targetEnemyId?: string;
}> = (ctx, action) => {
  if (ctx.actor.kind !== 'pc') return { rejected: 'Only PCs can do that.' };
  const pc = ctx.actor;
  if (!ctx.st.combat_active) {
    ctx.narrative = 'No enemy to attack.';
    return;
  }
  // SRD 5.2.1 — off-hand must be a Light weapon.
  const mainWpnInstanceId = equippedWeaponId(pc.char);
  const offhandInvItem = pc.char.inventory
    .filter((i) => i.instance_id !== mainWpnInstanceId)
    .find((i) => {
      const l = ctx.context.lootTable.find((ll) => ll.id === i.id);
      if (!l || l.slot !== 'weapon' || l.range === 'ranged') return false;
      return l.light;
    });
  if (!offhandInvItem) {
    ctx.narrative = 'No light off-hand weapon found.';
    return;
  }
  const offhandLoot = ctx.context.lootTable.find((l) => l.id === offhandInvItem.id)!;

  const nickFree =
    offhandLoot.mastery === 'nick' &&
    (pc.char.weapon_masteries ?? []).includes(offhandLoot.id) &&
    pc.char.turn_actions.action_used;
  if (!nickFree && pc.char.turn_actions.bonus_action_used) {
    ctx.narrative = 'Bonus action already used this turn.';
    return;
  }

  const offhandProficient = hasWeaponProficiency(
    pc.char.weapon_proficiencies ?? [],
    offhandLoot.weaponType
  );
  const targetId: string = action.targetEnemyId ?? ctx.enemy?.id ?? '';
  const enemyInRoom = ctx.livingEnemiesInRoom.find((e) => e.id === targetId) ?? ctx.enemy;
  if (!enemyInRoom) {
    ctx.narrative = 'No enemy here.';
    return;
  }
  const targetEntityId = enemyInRoom.id;
  const condDisadv = pc.char.conditions.some((c) => DISADV_CONDITIONS.has(c));
  const armorLootItem = equippedArmorId(pc.char)
    ? ctx.context.lootTable.find(
        (l) =>
          l.id === pc.char.inventory.find((i) => i.instance_id === equippedArmorId(pc.char))?.id
      )
    : null;
  const armorProf = hasArmorProficiency(
    pc.char.armor_proficiencies ?? [],
    armorLootItem?.armorCategory
  );
  const disadv = condDisadv || !armorProf;
  const atk = resolveOffHandAttack(
    { str: pc.char.str, dex: pc.char.dex, level: pc.char.level },
    offhandLoot.damage,
    enemyInRoom.ac,
    offhandLoot.finesse ?? false,
    disadv,
    false,
    offhandProficient,
    offhandLoot.range === 'ranged'
  );

  let nextChar = pc.char;
  if (!nickFree) {
    nextChar = {
      ...nextChar,
      turn_actions: { ...nextChar.turn_actions, bonus_action_used: true },
    };
  }
  ctx.usedInitiative = true;

  if (atk.fumble) {
    updatePcActor(ctx, nextChar);
    ctx.narrative = `Off-hand fumble! The ${offhandLoot.name} slips from your grip. (d20: 1)`;
    return;
  }
  if (!atk.hit) {
    updatePcActor(ctx, nextChar);
    ctx.narrative = `Off-hand attack with ${offhandLoot.name} misses. (${atk.roll}+${atk.atkMod}+${atk.prof}=${atk.total} vs AC ${enemyInRoom.ac})`;
    return;
  }
  const ent = ctx.st.entities?.find((e) => e.id === targetEntityId && e.isEnemy);
  const curHp = ent?.hp ?? 0;
  // Apply enemy resistance / vulnerability to the off-hand damage
  // type. Previously the raw `atk.damage` was written straight to
  // entity HP — a slashing-resistant enemy took full damage from an
  // off-hand shortsword.
  // SRD Fighting Style: Two-Weapon Fighting — add the ability modifier to
  // the off-hand attack's damage (off-hand normally adds none).
  const twfBonus = hasFightingStyle(pc.char, 'two_weapon') ? atk.atkMod : 0;
  const { damage: effDmg, note: dmgNote } = applyDamageMultiplier(
    Math.max(0, atk.damage + twfBonus),
    offhandLoot.damageType,
    enemyInRoom
  );
  const newHp = curHp - effDmg;
  let nextSt: GameState = {
    ...ctx.st,
    entities: (ctx.st.entities ?? []).map((e) =>
      e.id === targetEntityId && e.isEnemy ? { ...e, hp: newHp } : e
    ),
  };
  let narrative = `Off-hand strike with ${offhandLoot.name}! ${effDmg} damage${dmgNote}${atk.critical ? ' (CRITICAL!)' : ''} (${atk.roll}+${atk.atkMod}+${atk.prof}=${atk.total} vs AC ${enemyInRoom.ac}, no ability mod to damage).`;

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
  updatePcActor(ctx, nextChar);
  ctx.st = nextSt;
  ctx.narrative = narrative;
};
