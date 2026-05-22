import { abilityMod, profBonus, rollDice } from '../../rulesEngine.js';
import {
  applyPartyLevelUps,
  effectiveSpeed,
  endCombatState,
  isRoomCleared,
  pushEvent,
  splitEncounterXp,
} from '../../gameEngine.js';
import { getClassLevel, hasClass } from '../../multiclass.js';
import type { ActionContext } from '../types.js';
import { composeNow } from '../../narrative/compose.js';

/**
 * Monk + Open Hand + Shadow features.
 *
 *  - `flurry_of_blows`: bonus action after the Attack action. 1 ki for
 *    2 unarmed strikes at the 2024 PHB Martial Arts die. Open Hand
 *    subclass forces a DEX save on each hit or knock prone.
 *  - `patient_defense_{free|dp}`: 2024 PHB Dodge-as-bonus-action.
 *    Free 1/turn or 1 DP for the extra DEX-save advantage.
 *  - `step_of_wind_{free_dash|free_disengage|dash|disengage}`:
 *    2024 PHB. Free variants pick ONE effect; 1-DP variants give
 *    Dash AND Disengage. Free uses share the `monk_free_used` slot.
 *  - `stunning_strike`: 1 ki, once per turn (was per-hit in 2014).
 *    CON save vs Monk DC or stunned until end of caster's next turn.
 *  - `shadow_arts`: L3 Shadow Monk subclass. 2 ki → invisible for 3
 *    rounds. Costs an action (not a bonus action).
 */
export function handleMonkFeature(ctx: ActionContext, fid: string): boolean {
  if (fid === 'flurry_of_blows') {
    if (!hasClass(ctx.char, 'monk')) {
      ctx.narrative = 'Only Monks have Flurry of Blows.';
      return true;
    }
    // Monk level gates feature unlock + ki pool + martial die size.
    const monkLvl = getClassLevel(ctx.char, 'monk');
    if (monkLvl < 2) {
      ctx.narrative = 'Flurry of Blows requires Monk level 2.';
      return true;
    }
    if (ctx.char.turn_actions.bonus_action_used) {
      ctx.narrative = 'Bonus action already used this turn.';
      return true;
    }
    if (!ctx.char.turn_actions.action_used) {
      ctx.narrative = 'You must use your Attack action before using Flurry of Blows.';
      return true;
    }
    const kiPool = ctx.char.class_resource_uses?.ki_points ?? monkLvl;
    if (kiPool <= 0) {
      ctx.narrative = 'No ki points remaining (recover on short rest).';
      return true;
    }
    ctx.char.class_resource_uses = {
      ...(ctx.char.class_resource_uses ?? {}),
      ki_points: kiPool - 1,
    };
    ctx.char.turn_actions = { ...ctx.char.turn_actions, bonus_action_used: true };
    const martialDie = monkLvl >= 17 ? 12 : monkLvl >= 11 ? 10 : monkLvl >= 5 ? 8 : 6;
    const isOpenHand = ctx.char.subclass === 'open_hand';
    const monkDc = 8 + profBonus(ctx.char.level) + abilityMod(ctx.char.wis);
    let flurryNarrative = `${ctx.char.name} — Flurry of Blows (${kiPool - 1} ki remaining)!`;
    for (let i = 0; i < 2; i++) {
      const flurryTarget = ctx.st.entities?.find((e) => e.id === ctx.enemy?.id && e.isEnemy);
      if (!ctx.enemyAlive || !flurryTarget) break;
      const toHit = rollDice('1d20') + abilityMod(ctx.char.dex) + profBonus(ctx.char.level);
      if (toHit >= (ctx.enemy?.ac ?? 10)) {
        const dmg = Math.max(1, rollDice(`1d${martialDie}`) + abilityMod(ctx.char.dex));
        const curHp = ctx.st.entities?.find((e) => e.id === ctx.enemy?.id && e.isEnemy)?.hp ?? 0;
        const newHp = curHp - dmg;
        ctx.st = {
          ...ctx.st,
          entities: (ctx.st.entities ?? []).map((e) =>
            e.id === ctx.enemy?.id && e.isEnemy ? { ...e, hp: Math.max(0, newHp) } : e
          ),
        };
        flurryNarrative += ` Strike ${i + 1}: hit (${toHit}) — ${dmg} bludgeoning.${newHp <= 0 ? ' (killed)' : ''}`;
        if (isOpenHand && newHp > 0) {
          const enemyDex = (ctx.enemy?.dex ?? 10) as number;
          const dexSave = rollDice('1d20') + abilityMod(enemyDex);
          const dexSuccess = dexSave >= monkDc;
          ctx.st = pushEvent(ctx.st, {
            kind: 'save',
            characterId: ctx.enemy?.id ?? ctx.roomId,
            characterName: ctx.enemy?.name ?? 'target',
            ability: 'dex',
            roll: dexSave,
            dc: monkDc,
            success: dexSuccess,
            vs: 'Open Hand Technique',
            round: ctx.st.round ?? 1,
          });
          if (!dexSuccess) {
            ctx.st = {
              ...ctx.st,
              entities: (ctx.st.entities ?? []).map((e) =>
                e.id === ctx.enemy?.id && e.isEnemy
                  ? {
                      ...e,
                      conditions: [...e.conditions.filter((c) => c !== 'prone'), 'prone'],
                    }
                  : e
              ),
            };
            ctx.st = pushEvent(ctx.st, {
              kind: 'condition_applied',
              targetId: ctx.enemy?.id ?? ctx.roomId,
              targetName: ctx.enemy?.name ?? 'target',
              condition: 'prone',
              source: 'Open Hand Technique',
              round: ctx.st.round ?? 1,
            });
            flurryNarrative += ` Open Hand: DEX ${dexSave} vs DC ${monkDc} — prone!`;
          } else {
            flurryNarrative += ` Open Hand: DEX ${dexSave} vs DC ${monkDc} — resists.`;
          }
        }
        if (newHp <= 0) {
          const split = splitEncounterXp(ctx.st, ctx.char.id, ctx.enemy?.xp ?? 10);
          ctx.st = split.st;
          ctx.char.xp = (ctx.char.xp || 0) + split.share;
          flurryNarrative += applyPartyLevelUps(ctx.st, ctx.char, ctx.context);
          if (ctx.enemy) {
            ctx.st.enemies_killed = [...ctx.st.enemies_killed, ctx.enemy.id];
          }
          // Only end combat once every enemy in the room is down — matches
          // the canonical attack handler's pattern. Was previously
          // unconditional, which ended combat early in multi-enemy rooms.
          if (isRoomCleared(ctx.st, ctx.seed, ctx.roomId)) {
            ctx.st = endCombatState(ctx.st);
          }
          break;
        }
      } else {
        flurryNarrative += ` Strike ${i + 1}: miss (${toHit}).`;
      }
    }
    ctx.narrative = flurryNarrative;
    return true;
  }

  if (fid === 'patient_defense_free' || fid === 'patient_defense_dp') {
    if (!hasClass(ctx.char, 'monk')) {
      ctx.narrative = 'Only Monks have Patient Defense.';
      return true;
    }
    const monkLvl2 = getClassLevel(ctx.char, 'monk');
    if (monkLvl2 < 2) {
      ctx.narrative = 'Patient Defense requires Monk level 2.';
      return true;
    }
    if (ctx.char.turn_actions.bonus_action_used) {
      ctx.narrative = 'Bonus action already used this turn.';
      return true;
    }
    const isFree = fid === 'patient_defense_free';
    if (isFree && ctx.char.turn_actions.monk_free_used) {
      ctx.narrative = "You've already used your free monk bonus action this turn.";
      return true;
    }
    const kiPoolPD = ctx.char.class_resource_uses?.ki_points ?? monkLvl2;
    if (!isFree && kiPoolPD <= 0) {
      ctx.narrative = 'No Discipline Points remaining (recover on short rest).';
      return true;
    }
    if (!isFree) {
      ctx.char.class_resource_uses = {
        ...(ctx.char.class_resource_uses ?? {}),
        ki_points: kiPoolPD - 1,
      };
    }
    ctx.char.turn_actions = {
      ...ctx.char.turn_actions,
      bonus_action_used: true,
      dodging: true,
      ...(isFree ? { monk_free_used: true } : {}),
    };
    ctx.narrative = isFree
      ? `${ctx.char.name} — Patient Defense (free): assumes a defensive stance. Attacks against have disadvantage until next turn.`
      : `${ctx.char.name} — Patient Defense (1 DP): defensive stance + advantage on next DEX save. (${kiPoolPD - 1} DP remaining)`;
    return true;
  }

  if (fid === 'step_of_wind_free_dash' || fid === 'step_of_wind_free_disengage') {
    if (!hasClass(ctx.char, 'monk')) {
      ctx.narrative = 'Only Monks have Step of the Wind.';
      return true;
    }
    if (getClassLevel(ctx.char, 'monk') < 2) {
      ctx.narrative = 'Step of the Wind requires Monk level 2.';
      return true;
    }
    if (ctx.char.turn_actions.bonus_action_used) {
      ctx.narrative = 'Bonus action already used this turn.';
      return true;
    }
    if (ctx.char.turn_actions.monk_free_used) {
      ctx.narrative = "You've already used your free monk bonus action this turn.";
      return true;
    }
    ctx.char.turn_actions = {
      ...ctx.char.turn_actions,
      bonus_action_used: true,
      monk_free_used: true,
    };
    if (fid === 'step_of_wind_free_dash') {
      const sw = effectiveSpeed(ctx.char);
      ctx.st = {
        ...ctx.st,
        movement_used: {
          ...(ctx.st.movement_used ?? {}),
          [ctx.char.id]: Math.max(0, (ctx.st.movement_used?.[ctx.char.id] ?? 0) - sw),
        },
      };
      ctx.narrative = `${ctx.char.name} — Step of the Wind: Dash (free)! +${sw} ft movement.`;
    } else {
      ctx.char.turn_actions = { ...ctx.char.turn_actions, disengaged: true };
      ctx.narrative = `${ctx.char.name} — Step of the Wind: Disengage (free)! No opportunity attacks when moving.`;
    }
    return true;
  }

  if (fid === 'step_of_wind_dash' || fid === 'step_of_wind_disengage') {
    if (!hasClass(ctx.char, 'monk')) {
      ctx.narrative = 'Only Monks have Step of the Wind.';
      return true;
    }
    const monkLvl3 = getClassLevel(ctx.char, 'monk');
    if (monkLvl3 < 2) {
      ctx.narrative = 'Step of the Wind requires Monk level 2.';
      return true;
    }
    if (ctx.char.turn_actions.bonus_action_used) {
      ctx.narrative = 'Bonus action already used this turn.';
      return true;
    }
    const kiPool2 = ctx.char.class_resource_uses?.ki_points ?? monkLvl3;
    if (kiPool2 <= 0) {
      ctx.narrative = 'No Discipline Points remaining (recover on short rest).';
      return true;
    }
    ctx.char.class_resource_uses = {
      ...(ctx.char.class_resource_uses ?? {}),
      ki_points: kiPool2 - 1,
    };
    // 2024 PHB: spending 1 DP gives BOTH Dash and Disengage. The legacy
    // `step_of_wind_disengage` id is kept for back-compat but now also
    // dashes. `step_of_wind_dash` does the same.
    ctx.char.turn_actions = {
      ...ctx.char.turn_actions,
      bonus_action_used: true,
      disengaged: true,
    };
    const stwSpeed = effectiveSpeed(ctx.char);
    ctx.st = {
      ...ctx.st,
      movement_used: {
        ...(ctx.st.movement_used ?? {}),
        [ctx.char.id]: Math.max(0, (ctx.st.movement_used?.[ctx.char.id] ?? 0) - stwSpeed),
      },
    };
    ctx.narrative = `${ctx.char.name} — Step of the Wind (1 DP): Dash +${stwSpeed} ft AND Disengage. (${kiPool2 - 1} DP remaining)`;
    return true;
  }

  if (fid === 'stunning_strike') {
    if (!hasClass(ctx.char, 'monk')) {
      ctx.narrative = 'Only Monks have Stunning Strike.';
      return true;
    }
    const monkLvl4 = getClassLevel(ctx.char, 'monk');
    if (monkLvl4 < 5) {
      ctx.narrative = 'Stunning Strike requires Monk level 5.';
      return true;
    }
    if (!ctx.enemyAlive || !ctx.enemy) {
      ctx.narrative = 'No living target.';
      return true;
    }
    if (ctx.char.turn_actions.monk_stunning_strike_used) {
      ctx.narrative = 'Stunning Strike already used this turn.';
      return true;
    }
    const kiPool3 = ctx.char.class_resource_uses?.ki_points ?? monkLvl4;
    if (kiPool3 <= 0) {
      ctx.narrative = 'No Discipline Points remaining (recover on short rest).';
      return true;
    }
    ctx.char.class_resource_uses = {
      ...(ctx.char.class_resource_uses ?? {}),
      ki_points: kiPool3 - 1,
    };
    ctx.char.turn_actions = { ...ctx.char.turn_actions, monk_stunning_strike_used: true };
    const stunDC = 8 + profBonus(ctx.char.level) + abilityMod(ctx.char.wis);
    const conSave =
      rollDice('1d20') + abilityMod((ctx.enemy as unknown as Record<string, number>)['con'] ?? 10);
    const stunSuccess = conSave >= stunDC;
    ctx.st = pushEvent(ctx.st, {
      kind: 'save',
      characterId: ctx.enemy!.id,
      characterName: ctx.enemy!.name,
      ability: 'con',
      roll: conSave,
      dc: stunDC,
      success: stunSuccess,
      vs: 'Stunning Strike',
      round: ctx.st.round ?? 1,
    });
    if (!stunSuccess) {
      ctx.st = {
        ...ctx.st,
        entities: (ctx.st.entities ?? []).map((e) =>
          e.id === ctx.enemy?.id && e.isEnemy
            ? {
                ...e,
                conditions: [...e.conditions.filter((c) => c !== 'stunned'), 'stunned'],
              }
            : e
        ),
      };
      composeNow(ctx, {
        kind: 'condition_applied',
        targetId: ctx.enemy!.id,
        targetName: ctx.enemy!.name,
        condition: 'stunned',
        source: 'Stunning Strike',
        prose: `Stunning Strike! CON save ${conSave} vs DC ${stunDC} — ${ctx.enemy!.name} is stunned until the end of your next turn! (${kiPool3 - 1} ki remaining)`,
      });
    } else {
      ctx.narrative = `Stunning Strike! CON save ${conSave} vs DC ${stunDC} — ${ctx.enemy!.name} resists. (${kiPool3 - 1} ki remaining)`;
    }
    return true;
  }

  if (fid === 'shadow_arts') {
    if (ctx.char.subclass !== 'shadow' || !hasClass(ctx.char, 'monk')) {
      ctx.narrative = 'Only Way of Shadow Monks have Shadow Arts.';
      return true;
    }
    const monkLvl5 = getClassLevel(ctx.char, 'monk');
    if (monkLvl5 < 3) {
      ctx.narrative = 'Shadow Arts requires Monk level 3.';
      return true;
    }
    const kiSa = ctx.char.class_resource_uses?.ki_points ?? monkLvl5;
    if (kiSa < 2) {
      ctx.narrative = 'Need 2 ki points for Shadow Arts.';
      return true;
    }
    ctx.char.class_resource_uses = { ...(ctx.char.class_resource_uses ?? {}), ki_points: kiSa - 2 };
    ctx.char.conditions = [...ctx.char.conditions.filter((c) => c !== 'invisible'), 'invisible'];
    ctx.char.condition_durations = {
      ...(ctx.char.condition_durations ?? {}),
      invisible: 3,
    };
    ctx.char.turn_actions = { ...ctx.char.turn_actions, action_used: true };
    ctx.usedInitiative = true;
    ctx.narrative = `🌑 ${ctx.char.name} weaves Shadow Arts — invisible for 3 rounds. (${kiSa - 2} ki remaining)`;
    return true;
  }

  return false;
}
