import { abilityMod, profBonus, rollDice } from '../../rulesEngine.js';
import {
  applyPartyLevelUps,
  effectiveSpeed,
  endCombatState,
  enemyHpAfterDamage,
  getEnemyById,
  isRoomCleared,
  splitEncounterXp,
} from '../../gameEngine.js';
import { getClassLevel, hasClass } from '../../multiclass.js';
import type { ActionContext } from '../types.js';
import { composeNow } from '../../narrative/compose.js';

/**
 * Monk + Open Hand + Shadow features.
 *
 *  - `flurry_of_blows`: bonus action after the Attack action. 1 ki for
 *    2 unarmed strikes at the SRD Martial Arts die. Open Hand
 *    subclass forces a DEX save on each hit or knock prone.
 *  - `patient_defense_{free|dp}`: SRD Dodge-as-bonus-action.
 *    Free 1/turn or 1 DP for the extra DEX-save advantage.
 *  - `step_of_wind_{free_dash|free_disengage|dash|disengage}`:
 *    SRD. Free variants pick ONE effect; 1-DP variants give
 *    Dash AND Disengage. Free uses share the `monk_free_used` slot.
 *  - `stunning_strike`: 1 ki, once per turn (was per-hit in 2014).
 *    CON save vs Monk DC or stunned until end of caster's next turn.
 */
export function handleMonkFeature(ctx: ActionContext, fid: string): boolean {
  if (ctx.actor.kind !== 'pc') return false;
  const { char } = ctx.actor;
  if (fid === 'flurry_of_blows') {
    if (!hasClass(char, 'monk')) {
      ctx.narrative = 'Only Monks have Flurry of Blows.';
      return true;
    }
    // Monk level gates feature unlock + ki pool + martial die size.
    const monkLvl = getClassLevel(char, 'monk');
    if (monkLvl < 2) {
      ctx.narrative = 'Flurry of Blows requires Monk level 2.';
      return true;
    }
    if (char.turn_actions.bonus_action_used) {
      ctx.narrative = 'Bonus action already used this turn.';
      return true;
    }
    if (!char.turn_actions.action_used) {
      ctx.narrative = 'You must use your Attack action before using Flurry of Blows.';
      return true;
    }
    const kiPool = char.class_resource_uses?.ki_points ?? monkLvl;
    if (kiPool <= 0) {
      ctx.narrative = 'No ki points remaining (recover on short rest).';
      return true;
    }
    char.class_resource_uses = {
      ...(char.class_resource_uses ?? {}),
      ki_points: kiPool - 1,
    };
    char.turn_actions = { ...char.turn_actions, bonus_action_used: true };
    const martialDie = monkLvl >= 17 ? 12 : monkLvl >= 11 ? 10 : monkLvl >= 5 ? 8 : 6;
    const isOpenHand = char.subclass === 'open_hand';
    const monkDc = 8 + profBonus(char.level) + abilityMod(char.wis);
    let flurryNarrative = `${char.name} — Flurry of Blows (${kiPool - 1} ki remaining)!`;
    for (let i = 0; i < 2; i++) {
      const flurryTarget = ctx.st.entities?.find((e) => e.id === ctx.enemy?.id && e.isEnemy);
      if (!ctx.enemyAlive || !flurryTarget) break;
      const toHit = rollDice('1d20') + abilityMod(char.dex) + profBonus(char.level);
      if (toHit >= (ctx.enemy?.ac ?? 10)) {
        const dmg = Math.max(1, rollDice(`1d${martialDie}`) + abilityMod(char.dex));
        const curHp = ctx.st.entities?.find((e) => e.id === ctx.enemy?.id && e.isEnemy)?.hp ?? 0;
        // Central enemy-damage floor — Undead Fortitude can avert the drop to 0.
        const { hp: newHp, note: fortNote } = enemyHpAfterDamage(ctx.enemy, curHp, dmg, {
          damageType: 'bludgeoning',
        });
        ctx.st = {
          ...ctx.st,
          entities: (ctx.st.entities ?? []).map((e) =>
            e.id === ctx.enemy?.id && e.isEnemy ? { ...e, hp: newHp } : e
          ),
        };
        flurryNarrative += ` Strike ${i + 1}: hit (${toHit}) — ${dmg} bludgeoning.${newHp <= 0 ? ' (killed)' : ''}${fortNote}`;
        if (isOpenHand && newHp > 0) {
          const enemyDex = (ctx.enemy?.dex ?? 10) as number;
          const dexSave = rollDice('1d20') + abilityMod(enemyDex);
          const dexSuccess = dexSave >= monkDc;
          // Save event for the combat log (consolidated prose lives
          // in `flurryNarrative` below; fragment carries empty prose).
          composeNow(ctx, {
            kind: 'save',
            characterId: ctx.enemy?.id ?? ctx.roomId,
            characterName: ctx.enemy?.name ?? 'target',
            ability: 'dex',
            roll: dexSave,
            dc: monkDc,
            success: dexSuccess,
            vs: 'Open Hand Technique',
            prose: '',
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
            composeNow(ctx, {
              kind: 'condition_applied',
              targetId: ctx.enemy?.id ?? ctx.roomId,
              targetName: ctx.enemy?.name ?? 'target',
              condition: 'prone',
              source: 'Open Hand Technique',
              prose: '',
            });
            flurryNarrative += ` Open Hand: DEX ${dexSave} vs DC ${monkDc} — prone!`;
          } else {
            flurryNarrative += ` Open Hand: DEX ${dexSave} vs DC ${monkDc} — resists.`;
          }
        }
        if (newHp <= 0) {
          const split = splitEncounterXp(ctx.st, char.id, ctx.enemy?.xp ?? 10);
          ctx.st = split.st;
          char.xp = (char.xp || 0) + split.share;
          flurryNarrative += applyPartyLevelUps(ctx.st, char, ctx.context);
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
    if (!hasClass(char, 'monk')) {
      ctx.narrative = 'Only Monks have Patient Defense.';
      return true;
    }
    const monkLvl2 = getClassLevel(char, 'monk');
    if (monkLvl2 < 2) {
      ctx.narrative = 'Patient Defense requires Monk level 2.';
      return true;
    }
    if (char.turn_actions.bonus_action_used) {
      ctx.narrative = 'Bonus action already used this turn.';
      return true;
    }
    const isFree = fid === 'patient_defense_free';
    if (isFree && char.turn_actions.monk_free_used) {
      ctx.narrative = "You've already used your free monk bonus action this turn.";
      return true;
    }
    const kiPoolPD = char.class_resource_uses?.ki_points ?? monkLvl2;
    if (!isFree && kiPoolPD <= 0) {
      ctx.narrative = 'No Discipline Points remaining (recover on short rest).';
      return true;
    }
    if (!isFree) {
      char.class_resource_uses = {
        ...(char.class_resource_uses ?? {}),
        ki_points: kiPoolPD - 1,
      };
    }
    char.turn_actions = {
      ...char.turn_actions,
      bonus_action_used: true,
      dodging: true,
      ...(isFree ? { monk_free_used: true } : {}),
    };
    ctx.narrative = isFree
      ? `${char.name} — Patient Defense (free): assumes a defensive stance. Attacks against have disadvantage until next turn.`
      : `${char.name} — Patient Defense (1 DP): defensive stance + advantage on next DEX save. (${kiPoolPD - 1} DP remaining)`;
    return true;
  }

  if (fid === 'step_of_wind_free_dash' || fid === 'step_of_wind_free_disengage') {
    if (!hasClass(char, 'monk')) {
      ctx.narrative = 'Only Monks have Step of the Wind.';
      return true;
    }
    if (getClassLevel(char, 'monk') < 2) {
      ctx.narrative = 'Step of the Wind requires Monk level 2.';
      return true;
    }
    if (char.turn_actions.bonus_action_used) {
      ctx.narrative = 'Bonus action already used this turn.';
      return true;
    }
    if (char.turn_actions.monk_free_used) {
      ctx.narrative = "You've already used your free monk bonus action this turn.";
      return true;
    }
    char.turn_actions = {
      ...char.turn_actions,
      bonus_action_used: true,
      monk_free_used: true,
    };
    if (fid === 'step_of_wind_free_dash') {
      const sw = effectiveSpeed(char, ctx.context.lootTable);
      ctx.st = {
        ...ctx.st,
        movement_used: {
          ...(ctx.st.movement_used ?? {}),
          [char.id]: Math.max(0, (ctx.st.movement_used?.[char.id] ?? 0) - sw),
        },
      };
      ctx.narrative = `${char.name} — Step of the Wind: Dash (free)! +${sw} ft movement.`;
    } else {
      char.turn_actions = { ...char.turn_actions, disengaged: true };
      ctx.narrative = `${char.name} — Step of the Wind: Disengage (free)! No opportunity attacks when moving.`;
    }
    return true;
  }

  if (fid === 'step_of_wind_dash' || fid === 'step_of_wind_disengage') {
    if (!hasClass(char, 'monk')) {
      ctx.narrative = 'Only Monks have Step of the Wind.';
      return true;
    }
    const monkLvl3 = getClassLevel(char, 'monk');
    if (monkLvl3 < 2) {
      ctx.narrative = 'Step of the Wind requires Monk level 2.';
      return true;
    }
    if (char.turn_actions.bonus_action_used) {
      ctx.narrative = 'Bonus action already used this turn.';
      return true;
    }
    const kiPool2 = char.class_resource_uses?.ki_points ?? monkLvl3;
    if (kiPool2 <= 0) {
      ctx.narrative = 'No Discipline Points remaining (recover on short rest).';
      return true;
    }
    char.class_resource_uses = {
      ...(char.class_resource_uses ?? {}),
      ki_points: kiPool2 - 1,
    };
    // SRD: spending 1 DP gives BOTH Dash and Disengage. The legacy
    // `step_of_wind_disengage` id is kept for back-compat but now also
    // dashes. `step_of_wind_dash` does the same.
    char.turn_actions = {
      ...char.turn_actions,
      bonus_action_used: true,
      disengaged: true,
    };
    const stwSpeed = effectiveSpeed(char, ctx.context.lootTable);
    ctx.st = {
      ...ctx.st,
      movement_used: {
        ...(ctx.st.movement_used ?? {}),
        [char.id]: Math.max(0, (ctx.st.movement_used?.[char.id] ?? 0) - stwSpeed),
      },
    };
    ctx.narrative = `${char.name} — Step of the Wind (1 DP): Dash +${stwSpeed} ft AND Disengage. (${kiPool2 - 1} DP remaining)`;
    return true;
  }

  if (fid === 'stunning_strike') {
    if (!hasClass(char, 'monk')) {
      ctx.narrative = 'Only Monks have Stunning Strike.';
      return true;
    }
    const monkLvl4 = getClassLevel(char, 'monk');
    if (monkLvl4 < 5) {
      ctx.narrative = 'Stunning Strike requires Monk level 5.';
      return true;
    }
    if (!ctx.enemyAlive || !ctx.enemy) {
      ctx.narrative = 'No living target.';
      return true;
    }
    if (char.turn_actions.monk_stunning_strike_used) {
      ctx.narrative = 'Stunning Strike already used this turn.';
      return true;
    }
    const kiPool3 = char.class_resource_uses?.ki_points ?? monkLvl4;
    if (kiPool3 <= 0) {
      ctx.narrative = 'No Discipline Points remaining (recover on short rest).';
      return true;
    }
    char.class_resource_uses = {
      ...(char.class_resource_uses ?? {}),
      ki_points: kiPool3 - 1,
    };
    char.turn_actions = { ...char.turn_actions, monk_stunning_strike_used: true };
    const stunDC = 8 + profBonus(char.level) + abilityMod(char.wis);
    const conSave =
      rollDice('1d20') + abilityMod((ctx.enemy as unknown as Record<string, number>)['con'] ?? 10);
    const stunSuccess = conSave >= stunDC;
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
        kind: 'save',
        characterId: ctx.enemy!.id,
        characterName: ctx.enemy!.name,
        ability: 'con',
        roll: conSave,
        dc: stunDC,
        success: false,
        vs: 'Stunning Strike',
        prose: '',
      });
      composeNow(ctx, {
        kind: 'condition_applied',
        targetId: ctx.enemy!.id,
        targetName: ctx.enemy!.name,
        condition: 'stunned',
        source: 'Stunning Strike',
        prose: `Stunning Strike! CON save ${conSave} vs DC ${stunDC} — ${ctx.enemy!.name} is stunned until the end of your next turn! (${kiPool3 - 1} ki remaining)`,
      });
    } else {
      composeNow(ctx, {
        kind: 'save',
        characterId: ctx.enemy!.id,
        characterName: ctx.enemy!.name,
        ability: 'con',
        roll: conSave,
        dc: stunDC,
        success: true,
        vs: 'Stunning Strike',
        prose: `Stunning Strike! CON save ${conSave} vs DC ${stunDC} — ${ctx.enemy!.name} resists. (${kiPool3 - 1} ki remaining)`,
      });
    }
    return true;
  }

  if (fid === 'wholeness_of_body') {
    // SRD Warrior of the Open Hand L6 — bonus action: heal a Martial Arts
    // die + WIS mod (min 1 HP). Uses = WIS mod (min 1) per long rest.
    if (
      !hasClass(char, 'monk') ||
      char.subclass !== 'open_hand' ||
      getClassLevel(char, 'monk') < 6
    ) {
      ctx.narrative = 'Wholeness of Body requires an Open Hand Monk of level 6.';
      return true;
    }
    if (char.turn_actions.bonus_action_used) {
      ctx.narrative = 'Bonus action already used this turn.';
      return true;
    }
    const wobMax = Math.max(1, abilityMod(char.wis));
    const wobUsed = char.class_resource_uses?.wholeness_of_body_used ?? 0;
    if (wobUsed >= wobMax) {
      ctx.narrative = `Wholeness of Body exhausted (${wobMax}/${wobMax} used). Recovers on a long rest.`;
      return true;
    }
    const wobLvl = getClassLevel(char, 'monk');
    const wobDie = wobLvl >= 17 ? 12 : wobLvl >= 11 ? 10 : wobLvl >= 5 ? 8 : 6;
    const wobHeal = Math.max(1, rollDice(`1d${wobDie}`) + abilityMod(char.wis));
    char.hp = Math.min(char.max_hp, char.hp + wobHeal);
    char.class_resource_uses = {
      ...(char.class_resource_uses ?? {}),
      wholeness_of_body_used: wobUsed + 1,
    };
    char.turn_actions = { ...char.turn_actions, bonus_action_used: true };
    ctx.narrative = `${char.name} channels ki inward — Wholeness of Body heals ${wobHeal} HP (now ${char.hp}/${char.max_hp}). (${wobMax - wobUsed - 1}/${wobMax} remaining)`;
    return true;
  }

  if (fid === 'superior_defense') {
    if (!hasClass(char, 'monk') || getClassLevel(char, 'monk') < 18) {
      ctx.narrative = 'Superior Defense requires Monk level 18.';
      return true;
    }
    if (char.conditions.includes('superior_defense')) {
      ctx.narrative = 'Superior Defense is already active.';
      return true;
    }
    const sdKi = char.class_resource_uses?.ki_points ?? getClassLevel(char, 'monk');
    if (sdKi < 3) {
      ctx.narrative = 'Superior Defense needs 3 Discipline Points (recover on a short rest).';
      return true;
    }
    char.class_resource_uses = { ...(char.class_resource_uses ?? {}), ki_points: sdKi - 3 };
    char.conditions = [...char.conditions, 'superior_defense'];
    ctx.narrative = `${char.name} steels into Superior Defense — Resistance to all damage except force this combat. (${sdKi - 3} ki remaining)`;
    return true;
  }

  // SRD Open Hand Fleet Step (L11) — a free Step of the Wind (Dash +
  // Disengage) after another bonus action this turn. pansori offers it as an
  // extra free use once your bonus action is spent (the RAW "other than Step
  // of the Wind" nuance is simplified). Once per turn.
  if (fid === 'fleet_step_dash' || fid === 'fleet_step_disengage') {
    if (char.subclass !== 'open_hand' || getClassLevel(char, 'monk') < 11) {
      ctx.narrative = 'Fleet Step requires a Warrior of the Open Hand of level 11.';
      return true;
    }
    if (!char.turn_actions.bonus_action_used) {
      ctx.narrative = 'Fleet Step follows another bonus action — use one first.';
      return true;
    }
    if (char.turn_actions.fleet_step_used) {
      ctx.narrative = 'Fleet Step already used this turn.';
      return true;
    }
    char.turn_actions = { ...char.turn_actions, fleet_step_used: true, disengaged: true };
    const fsSpeed = effectiveSpeed(char, ctx.context.lootTable);
    ctx.st = {
      ...ctx.st,
      movement_used: {
        ...(ctx.st.movement_used ?? {}),
        [char.id]: Math.max(0, (ctx.st.movement_used?.[char.id] ?? 0) - fsSpeed),
      },
    };
    ctx.narrative = `${char.name} — Fleet Step! A free Step of the Wind: Dash +${fsSpeed} ft and Disengage.`;
    return true;
  }

  // SRD Open Hand Quivering Palm (L17) — set lethal vibrations on an unarmed
  // hit (4 Focus Points; one creature at a time). Harmless until detonated.
  if (fid === 'quivering_palm') {
    if (char.subclass !== 'open_hand' || getClassLevel(char, 'monk') < 17) {
      ctx.narrative = 'Quivering Palm requires a Warrior of the Open Hand of level 17.';
      return true;
    }
    if (!ctx.enemyAlive || !ctx.enemy) {
      ctx.narrative = 'No living target for Quivering Palm.';
      return true;
    }
    const qpKi = char.class_resource_uses?.ki_points ?? getClassLevel(char, 'monk');
    if (qpKi < 4) {
      ctx.narrative = 'Quivering Palm needs 4 Focus Points (recover on a short rest).';
      return true;
    }
    char.class_resource_uses = { ...(char.class_resource_uses ?? {}), ki_points: qpKi - 4 };
    char.quivering_palm_target = ctx.enemy.id;
    ctx.st = {
      ...ctx.st,
      entities: (ctx.st.entities ?? []).map((e) =>
        e.id === ctx.enemy?.id && e.isEnemy
          ? {
              ...e,
              conditions: [...e.conditions.filter((c) => c !== 'quivering_palm'), 'quivering_palm'],
            }
          : e
      ),
    };
    ctx.narrative = `${char.name} sets lethal vibrations in ${ctx.enemy.name} — Quivering Palm primed. (${qpKi - 4} Focus remaining)`;
    return true;
  }

  // SRD Open Hand Quivering Palm — detonate (an action): the marked creature
  // makes a CON save, taking 10d12 Force (half on a success).
  if (fid === 'quivering_palm_detonate') {
    if (!char.quivering_palm_target) {
      ctx.narrative = 'No creature is under your Quivering Palm.';
      return true;
    }
    if (char.turn_actions.action_used) {
      ctx.narrative = 'Action already used this turn.';
      return true;
    }
    const qpTargetId = char.quivering_palm_target;
    const qpEnt = ctx.st.entities?.find((e) => e.id === qpTargetId && e.isEnemy);
    const qpEnemy = getEnemyById(ctx.seed, qpTargetId);
    if (!qpEnt || qpEnt.hp <= 0 || !qpEnemy) {
      char.quivering_palm_target = undefined;
      ctx.narrative =
        'The creature under your Quivering Palm is no longer here — the vibrations fade.';
      return true;
    }
    char.turn_actions = { ...char.turn_actions, action_used: true };
    char.quivering_palm_target = undefined;
    const qpDC = 8 + profBonus(char.level) + abilityMod(char.wis);
    const qpSave =
      rollDice('1d20') + abilityMod((qpEnemy as unknown as Record<string, number>)?.con ?? 10);
    const qpFull = rollDice('10d12');
    const qpDmg = qpSave >= qpDC ? Math.floor(qpFull / 2) : qpFull;
    const qpNewHp = Math.max(0, qpEnt.hp - qpDmg);
    ctx.st = {
      ...ctx.st,
      entities: (ctx.st.entities ?? []).map((e) =>
        e.id === qpTargetId && e.isEnemy
          ? { ...e, hp: qpNewHp, conditions: e.conditions.filter((c) => c !== 'quivering_palm') }
          : e
      ),
    };
    ctx.usedInitiative = true;
    let qpNarr = `${char.name} ends the Quivering Palm! ${qpEnemy.name}: CON ${qpSave} vs DC ${qpDC} — ${qpDmg} force${qpSave >= qpDC ? ' (half)' : ''}.`;
    if (qpNewHp <= 0) {
      const split = splitEncounterXp(ctx.st, char.id, qpEnemy.xp ?? 0);
      ctx.st = split.st;
      char.xp = (char.xp || 0) + split.share;
      ctx.st.enemies_killed = [...ctx.st.enemies_killed, qpTargetId];
      qpNarr += ` ${qpEnemy.name} is destroyed!`;
      if (isRoomCleared(ctx.st, ctx.seed, ctx.roomId)) ctx.st = endCombatState(ctx.st);
      qpNarr += applyPartyLevelUps(ctx.st, char, ctx.context);
    }
    ctx.narrative = qpNarr;
    return true;
  }

  return false;
}
