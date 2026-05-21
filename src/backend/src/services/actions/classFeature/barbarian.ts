import {
  abilityMod,
  profBonus,
  rageDamageBonus,
  rageUsesMax,
  rollDice,
} from '../../rulesEngine.js';
import {
  applyPartyLevelUps,
  endCombatState,
  getItemData,
  isRoomCleared,
  splitEncounterXp,
} from '../../gameEngine.js';
import type { ActionContext } from '../types.js';
import type { InventoryItem } from '../../../types.js';

/**
 * Barbarian + Berserker features.
 *
 * Returns `true` if the action's featureId matched a Barbarian
 * feature (caller stops the per-class dispatch chain). Returns
 * `false` to let the chain continue.
 *
 *  - `rage`: PHB p.49 — bonus action. Long-rest resource (rageUsesMax
 *    per level). +STR melee damage, resistance to physical attacks.
 *  - `reckless_attack`: PHB p.50 — L2+ free toggle. Advantage on STR
 *    melee attacks this turn; enemies have advantage against you
 *    until your next turn.
 *  - `frenzy_attack`: Berserker subclass (PHB p.49). While raging,
 *    one extra melee weapon attack as a bonus action. RAW exhaustion
 *    on rage-end is deferred (needs more state tracking).
 */
export function handleBarbarianFeature(ctx: ActionContext, fid: string): boolean {
  const features = ctx.context.classFeatures?.[ctx.char.character_class] ?? [];

  if (fid === 'rage') {
    if (!features.includes('rage')) {
      ctx.narrative = `${ctx.char.character_class} does not have Rage.`;
      return true;
    }
    if (ctx.char.conditions.includes('raging')) {
      ctx.narrative = 'You are already raging!';
      return true;
    }
    const rageUses = ctx.char.class_resource_uses?.rage_uses ?? rageUsesMax(ctx.char.level);
    if (rageUses <= 0) {
      ctx.narrative = 'No rage uses remaining. They recover on a long rest.';
      return true;
    }
    ctx.char.conditions = [...ctx.char.conditions, 'raging'];
    ctx.char.class_resource_uses = {
      ...(ctx.char.class_resource_uses ?? {}),
      rage_uses: rageUses - 1,
    };
    ctx.char.turn_actions = { ...ctx.char.turn_actions, bonus_action_used: true };
    ctx.narrative = `${ctx.char.name} RAGES! +${rageDamageBonus(ctx.char.level)} bonus STR melee damage, resistance to physical attacks. (${rageUses - 1} use${rageUses - 1 === 1 ? '' : 's'} remaining)`;
    return true;
  }

  if (fid === 'reckless_attack') {
    if (ctx.char.character_class.toLowerCase() !== 'barbarian') {
      ctx.narrative = 'Only Barbarians have Reckless Attack.';
      return true;
    }
    if (ctx.char.level < 2) {
      ctx.narrative = 'Reckless Attack requires Barbarian level 2.';
      return true;
    }
    if (ctx.char.turn_actions.reckless) {
      ctx.narrative = 'You are already attacking recklessly this turn.';
      return true;
    }
    ctx.char.turn_actions = { ...ctx.char.turn_actions, reckless: true };
    ctx.narrative = `${ctx.char.name} attacks recklessly! Advantage on STR melee attacks this turn — but enemies have advantage against you until your next turn.`;
    return true;
  }

  if (fid === 'frenzy_attack') {
    if (
      ctx.char.subclass !== 'berserker' ||
      ctx.char.character_class.toLowerCase() !== 'barbarian'
    ) {
      ctx.narrative = 'Only Berserker Barbarians have Frenzy.';
      return true;
    }
    if (!ctx.char.conditions.includes('raging')) {
      ctx.narrative = 'You must be raging to use Frenzy.';
      return true;
    }
    if (ctx.char.turn_actions.bonus_action_used) {
      ctx.narrative = 'Bonus action already used this turn.';
      return true;
    }
    if (!ctx.enemyAlive || !ctx.enemy) {
      ctx.narrative = 'No enemy to Frenzy attack.';
      return true;
    }
    const frWeapon = ctx.char.equipped_weapon
      ? getItemData(
          ctx.char.inventory?.find(
            (i) => i.instance_id === ctx.char.equipped_weapon
          ) as InventoryItem,
          ctx.context
        )
      : null;
    if (frWeapon?.range === 'ranged') {
      ctx.narrative = 'Frenzy requires a melee weapon.';
      return true;
    }
    ctx.char.turn_actions = { ...ctx.char.turn_actions, bonus_action_used: true };
    const frTarget = ctx.livingEnemiesInRoom[0] ?? ctx.enemy;
    const frToHit = rollDice('1d20') + abilityMod(ctx.char.str) + profBonus(ctx.char.level);
    if (frToHit >= (frTarget.ac ?? 10)) {
      const dmgDice = frWeapon?.damage ?? '1d4';
      const frDmg = Math.max(
        1,
        rollDice(dmgDice) + abilityMod(ctx.char.str) + rageDamageBonus(ctx.char.level)
      );
      const curHp = ctx.st.entities?.find((e) => e.id === frTarget.id && e.isEnemy)?.hp ?? 0;
      const newHp = Math.max(0, curHp - frDmg);
      ctx.st = {
        ...ctx.st,
        entities: (ctx.st.entities ?? []).map((e) =>
          e.id === frTarget.id && e.isEnemy ? { ...e, hp: newHp } : e
        ),
      };
      ctx.narrative = `💢 ${ctx.char.name} — Frenzy! (${frToHit} hits AC ${frTarget.ac}) ${frDmg} ${frWeapon?.damageType ?? 'bludgeoning'}${newHp <= 0 ? ` — ${frTarget.name} falls!` : ''}`;
      if (newHp <= 0) {
        const split = splitEncounterXp(ctx.st, ctx.char.id, frTarget.xp ?? 10);
        ctx.st = split.st;
        ctx.char.xp = (ctx.char.xp || 0) + split.share;
        ctx.narrative += applyPartyLevelUps(ctx.st, ctx.char, ctx.context);
        ctx.st.enemies_killed = [...ctx.st.enemies_killed, frTarget.id];
        if (isRoomCleared(ctx.st, ctx.seed, ctx.roomId)) {
          ctx.st = endCombatState(ctx.st);
          ctx.char.conditions = ctx.char.conditions.filter((c) => c !== 'raging');
        }
      }
    } else {
      ctx.narrative = `💢 ${ctx.char.name} — Frenzy! (${frToHit} vs AC ${frTarget.ac}) — miss.`;
    }
    return true;
  }

  return false;
}
