// 2024 PHB Polearm Master — bonus-action butt-end attack.
//
// After the Attack action with a qualifying polearm
// (quarterstaff, spear, glaive, halberd, pike), the PC can make a
// bonus-action attack with the opposite end of the weapon. The
// attack:
//   - Uses the same ability mod as the primary (STR for most;
//     finesse-eligible polearms could use DEX but none of the 2024
//     PHB polearms are finesse).
//   - Deals 1d4 damage + ability mod (smaller die than the main
//     hand because it's a butt-end strike).
//   - Same damage type as the polearm.
//
// Mechanically a near-copy of twoWeaponAttack but with a fixed 1d4
// damage die and DOES add the ability mod (TWF off-hand drops the
// mod per RAW; PAM explicitly keeps it).
//
// Validation:
//   - Combat must be active.
//   - PC must have 'polearm_master' feat.
//   - Equipped weapon must be one of the qualifying polearms.
//   - Action must have been used this turn (bonus-action follow-up).
//   - Bonus action must be free.

import {
  DISADV_CONDITIONS,
  abilityMod,
  applyDamageMultiplier,
  hasArmorProficiency,
  hasWeaponProficiency,
  profBonus,
  resolvePlayerAttack,
  rollDice,
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

const POLEARM_IDS = new Set(['quarterstaff', 'spear', 'glaive', 'halberd', 'pike']);

export const handlePolearmButtEnd: ActionHandler<{
  type: 'polearm_butt_end';
  targetEnemyId?: string;
}> = (ctx, action) => {
  if (!ctx.st.combat_active) {
    ctx.narrative = 'No enemy to attack.';
    return;
  }
  if (!(ctx.char.feats ?? []).includes('polearm_master')) {
    return { rejected: `${ctx.char.name} does not have the Polearm Master feat.` };
  }
  const weaponInstanceId = ctx.char.equipped_weapon;
  const weaponInvItem = ctx.char.inventory.find((i) => i.instance_id === weaponInstanceId);
  const weaponLoot = weaponInvItem
    ? ctx.context.lootTable.find((l) => l.id === weaponInvItem.id)
    : null;
  if (!weaponLoot || !POLEARM_IDS.has(weaponLoot.id)) {
    return {
      rejected:
        'Polearm Master requires a qualifying polearm equipped (quarterstaff, spear, glaive, halberd, or pike).',
    };
  }
  if (!ctx.char.turn_actions.action_used) {
    return {
      rejected: 'Polearm Master butt-end attack requires the Attack action to have been used.',
    };
  }
  if (ctx.char.turn_actions.bonus_action_used) {
    return { rejected: 'Bonus action already used this turn.' };
  }

  const targetId: string = action.targetEnemyId ?? ctx.enemy?.id ?? '';
  const enemyInRoom = ctx.livingEnemiesInRoom.find((e) => e.id === targetId) ?? ctx.enemy;
  if (!enemyInRoom) {
    ctx.narrative = 'No enemy here.';
    return;
  }
  const targetEntityId = enemyInRoom.id;

  // Standard attack-roll context. Polearms are STR-based; no
  // finesse polearms in the 2024 PHB.
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
  // Butt-end is 1d4 damage. Use `resolvePlayerAttack` with the
  // polearm's STR-based to-hit math but a 1d4 damage expression.
  const atk = resolvePlayerAttack(
    { str: ctx.char.str, dex: ctx.char.dex, level: ctx.char.level },
    '1d4',
    enemyInRoom.ac,
    false, // not finesse — STR only
    false, // no advantage from the PAM rider itself
    disadv,
    weaponProf
  );

  let nextChar = {
    ...ctx.char,
    turn_actions: { ...ctx.char.turn_actions, bonus_action_used: true },
  };
  ctx.usedInitiative = true;

  if (atk.fumble) {
    ctx.char = nextChar;
    ctx.narrative = `Polearm Master butt-end: fumble! The shaft of your ${weaponLoot.name} slips. (d20: 1)`;
    return;
  }
  if (!atk.hit) {
    ctx.char = nextChar;
    ctx.narrative = `Polearm Master butt-end with the ${weaponLoot.name} misses. (${atk.roll}+${atk.atkMod}+${atk.prof}=${atk.total} vs AC ${enemyInRoom.ac})`;
    return;
  }
  const ent = ctx.st.entities?.find((e) => e.id === targetEntityId && e.isEnemy);
  const curHp = ent?.hp ?? 0;
  // Apply enemy resistance / vulnerability to the polearm's damage
  // type (e.g. piercing for spear, slashing for glaive/halberd).
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
  let narrative = `Polearm Master butt-end with the ${weaponLoot.name}! ${effDmg} damage${dmgNote}${atk.critical ? ' (CRITICAL!)' : ''} (${atk.roll}+${atk.atkMod}+${atk.prof}=${atk.total} vs AC ${enemyInRoom.ac}).`;
  // Trail: damage type so the narrative is consistent with main hand.
  void abilityMod;
  void profBonus;
  void rollDice;

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
