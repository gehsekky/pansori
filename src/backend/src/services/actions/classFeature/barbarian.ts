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
import { getClassLevel, hasClass } from '../../multiclass.js';
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

  // `rage` accepts an optional totem suffix encoded in the feature id —
  // `rage_bear`, `rage_eagle`, `rage_wolf` — for Totem Warrior PCs.
  // Plain `rage` enters rage without a totem (any class with the
  // feature) and is also the fallback for Totem Warriors who don't
  // pick a totem at activation.
  const isRageId =
    fid === 'rage' || fid === 'rage_bear' || fid === 'rage_eagle' || fid === 'rage_wolf';
  if (isRageId) {
    if (!features.includes('rage')) {
      ctx.narrative = `${ctx.char.character_class} does not have Rage.`;
      return true;
    }
    if (ctx.char.conditions.includes('raging')) {
      ctx.narrative = 'You are already raging!';
      return true;
    }
    // Totem variants require the Totem Warrior subclass.
    const totem: 'bear' | 'eagle' | 'wolf' | undefined =
      fid === 'rage_bear'
        ? 'bear'
        : fid === 'rage_eagle'
          ? 'eagle'
          : fid === 'rage_wolf'
            ? 'wolf'
            : undefined;
    if (totem && ctx.char.subclass !== 'totem_warrior') {
      ctx.narrative = 'Only Totem Warrior Barbarians can rage with a totem spirit.';
      return true;
    }
    // Rage uses + damage scale with BARBARIAN level (not total level).
    const barbLvl = getClassLevel(ctx.char, 'barbarian');
    const rageUses = ctx.char.class_resource_uses?.rage_uses ?? rageUsesMax(barbLvl);
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
    if (totem) {
      ctx.char.totem_spirit = totem;
    }
    // Totem-specific narrative flavor.
    const totemBlurb =
      totem === 'bear'
        ? " The spirit of the Bear hardens you — resistance extends to all damage types except psychic (the Rage cover applies in pansori's simplified model)."
        : totem === 'eagle'
          ? ' The spirit of the Eagle quickens your reflexes — Dash as a bonus action, and opportunity attacks against you have disadvantage.'
          : totem === 'wolf'
            ? ' The spirit of the Wolf coordinates the pack — allies within 5 ft of your target have advantage on attacks against it.'
            : '';
    ctx.narrative = `${ctx.char.name} RAGES! +${rageDamageBonus(barbLvl)} bonus STR melee damage, resistance to physical attacks. (${rageUses - 1} use${rageUses - 1 === 1 ? '' : 's'} remaining)${totemBlurb}`;
    return true;
  }

  if (fid === 'reckless_attack') {
    if (!hasClass(ctx.char, 'barbarian')) {
      ctx.narrative = 'Only Barbarians have Reckless Attack.';
      return true;
    }
    if (getClassLevel(ctx.char, 'barbarian') < 2) {
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
    if (ctx.char.subclass !== 'berserker' || !hasClass(ctx.char, 'barbarian')) {
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
        rollDice(dmgDice) +
          abilityMod(ctx.char.str) +
          rageDamageBonus(getClassLevel(ctx.char, 'barbarian'))
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
          ctx.char.totem_spirit = undefined;
        }
      }
    } else {
      ctx.narrative = `💢 ${ctx.char.name} — Frenzy! (${frToHit} vs AC ${frTarget.ac}) — miss.`;
    }
    return true;
  }

  return false;
}
