import { abilityMod, profBonus, rollDice } from '../../rulesEngine.js';
import { getClassLevel, hasClass } from '../../multiclass.js';
import type { ActionContext } from '../types.js';
import { composeNow } from '../../narrative/compose.js';
import { pushEvent } from '../../gameEngine.js';

/**
 * Fighter + Battle Master + Champion features.
 *
 *  - `action_surge`: 2024 PHB — once per rest, refunds the action so the
 *    Fighter can take two actions this turn. Resets on short rest.
 *  - `tactical_master_{push|sap|slow}`: Fighter L9+. Pre-arms the next
 *    attack to apply the chosen mastery instead of the weapon's printed
 *    one. Consumes the queue slot in turn_actions.
 *  - `second_wind`: 2024 PHB — 2/3/4 uses per rest at L1/4/10. Bonus
 *    action heal of 1d10 + level HP.
 *  - `maneuver_{trip|goading|...}`: Battle Master L3+. Spend a
 *    superiority die (1d8 default pool of 4, recovers on short rest)
 *    to add damage + apply a maneuver effect. Trip: STR-save to prone.
 *    Goading: WIS-save to apply 'goaded' (disadvantage vs others).
 *  - `remarkable_athlete`: Champion subclass. Passive narrative line
 *    only (the actual proficiency-half bonus is applied in skill check
 *    resolution paths elsewhere).
 */
export function handleFighterFeature(ctx: ActionContext, fid: string): boolean {
  const dispatchKey = [ctx.char.character_class, ctx.char.subclass, fid].filter(Boolean).join('_');

  if (fid === 'action_surge') {
    if (!hasClass(ctx.char, 'fighter')) {
      ctx.narrative = 'Only Fighters have Action Surge.';
      return true;
    }
    if (getClassLevel(ctx.char, 'fighter') < 2) {
      ctx.narrative = 'Action Surge requires Fighter level 2.';
      return true;
    }
    if ((ctx.char.class_resource_uses?.action_surge ?? 0) >= 1) {
      ctx.narrative = 'Action Surge already used this rest.';
      return true;
    }
    ctx.char.class_resource_uses = { ...(ctx.char.class_resource_uses ?? {}), action_surge: 1 };
    ctx.char.turn_actions = { ...ctx.char.turn_actions, action_used: false };
    ctx.narrative = `${ctx.char.name} uses Action Surge — one additional action this turn!`;
    return true;
  }

  if (
    fid === 'tactical_master_push' ||
    fid === 'tactical_master_sap' ||
    fid === 'tactical_master_slow'
  ) {
    if (!hasClass(ctx.char, 'fighter')) {
      ctx.narrative = 'Only Fighters have Tactical Master.';
      return true;
    }
    if (getClassLevel(ctx.char, 'fighter') < 9) {
      ctx.narrative = 'Tactical Master requires Fighter level 9.';
      return true;
    }
    if (ctx.char.turn_actions.tactical_master_mastery) {
      ctx.narrative = 'Tactical Master already queued this turn.';
      return true;
    }
    const m = fid.replace('tactical_master_', '') as 'push' | 'sap' | 'slow';
    ctx.char.turn_actions = { ...ctx.char.turn_actions, tactical_master_mastery: m };
    ctx.narrative = `${ctx.char.name} — Tactical Master: next attack will use ${m.toUpperCase()} mastery.`;
    return true;
  }

  if (fid === 'second_wind') {
    if (!hasClass(ctx.char, 'fighter')) {
      ctx.narrative = 'Only Fighters have Second Wind.';
      return true;
    }
    // Second Wind uses scale with Fighter level (RAW 2/3/4 at L1/4/10),
    // and the heal adds Fighter level — not total character level.
    const fighterLvl = getClassLevel(ctx.char, 'fighter');
    const swMax = fighterLvl >= 10 ? 4 : fighterLvl >= 4 ? 3 : 2;
    const swUsed = ctx.char.class_resource_uses?.second_wind ?? 0;
    if (swUsed >= swMax) {
      ctx.narrative = `Second Wind exhausted (${swMax}/${swMax} used). Recovers on a short or long rest.`;
      return true;
    }
    if (ctx.char.turn_actions.bonus_action_used) {
      ctx.narrative = 'Bonus action already used this turn.';
      return true;
    }
    const swHeal = rollDice('1d10') + fighterLvl;
    ctx.char.hp = Math.min(ctx.char.max_hp, ctx.char.hp + swHeal);
    ctx.char.class_resource_uses = {
      ...(ctx.char.class_resource_uses ?? {}),
      second_wind: swUsed + 1,
    };
    ctx.char.turn_actions = { ...ctx.char.turn_actions, bonus_action_used: true };
    ctx.narrative = `${ctx.char.name} uses Second Wind — healed ${swHeal} HP (now ${ctx.char.hp}/${ctx.char.max_hp}). (${swMax - swUsed - 1}/${swMax} remaining)`;
    return true;
  }

  if (dispatchKey.includes('battle_master') && fid.startsWith('maneuver_')) {
    const sdPool = ctx.char.class_resource_uses?.superiority_dice ?? 4;
    if (sdPool <= 0) {
      ctx.narrative = 'No superiority dice remaining (recover on short rest).';
      return true;
    }
    ctx.char.class_resource_uses = {
      ...(ctx.char.class_resource_uses ?? {}),
      superiority_dice: sdPool - 1,
    };
    const sdRoll = rollDice('1d8');
    if (fid === 'maneuver_trip') {
      const tripSave =
        rollDice('1d20') +
        abilityMod((ctx.enemy as unknown as Record<string, number>)['str'] ?? 10);
      const tripDC = 8 + profBonus(ctx.char.level) + abilityMod(ctx.char.str);
      if (tripSave < tripDC) {
        ctx.st = {
          ...ctx.st,
          entities: (ctx.st.entities ?? []).map((e) =>
            e.id === ctx.enemy?.id && e.isEnemy
              ? { ...e, conditions: [...e.conditions.filter((c) => c !== 'prone'), 'prone'] }
              : e
          ),
        };
        ctx.narrative = `Maneuver — Trip Attack: +${sdRoll} damage, ${ctx.enemy!.name} knocked prone! (STR save ${tripSave} vs DC ${tripDC})`;
      } else {
        ctx.narrative = `Maneuver — Trip Attack: +${sdRoll} damage, ${ctx.enemy!.name} resists the trip. (STR save ${tripSave} vs DC ${tripDC})`;
      }
    } else if (fid === 'maneuver_goading') {
      const goadSave =
        rollDice('1d20') +
        abilityMod((ctx.enemy as unknown as Record<string, number>)['wis'] ?? 10);
      const goadDC = 8 + profBonus(ctx.char.level) + abilityMod(ctx.char.cha);
      const goadSuccess = goadSave >= goadDC;
      ctx.st = pushEvent(ctx.st, {
        kind: 'save',
        characterId: ctx.enemy!.id,
        characterName: ctx.enemy!.name,
        ability: 'wis',
        roll: goadSave,
        dc: goadDC,
        success: goadSuccess,
        vs: 'Goading Attack',
        round: ctx.st.round ?? 1,
      });
      if (!goadSuccess) {
        ctx.st = {
          ...ctx.st,
          entities: (ctx.st.entities ?? []).map((e) =>
            e.id === ctx.enemy?.id && e.isEnemy
              ? {
                  ...e,
                  conditions: [...e.conditions.filter((c) => c !== 'goaded'), 'goaded'],
                }
              : e
          ),
        };
        composeNow(ctx, {
          kind: 'condition_applied',
          targetId: ctx.enemy!.id,
          targetName: ctx.enemy!.name,
          condition: 'goaded',
          source: 'Goading Attack',
          prose: `Maneuver — Goading Attack: +${sdRoll} damage, ${ctx.enemy!.name} goaded (disadvantage vs others)! (WIS save ${goadSave} vs DC ${goadDC})`,
        });
      } else {
        ctx.narrative = `Maneuver — Goading Attack: +${sdRoll} damage, ${ctx.enemy!.name} resists. (WIS save ${goadSave} vs DC ${goadDC})`;
      }
    } else {
      // Generic maneuver: deal extra die damage
      ctx.narrative = `Maneuver — +${sdRoll} superiority die damage! (${sdPool - 1} dice remaining)`;
    }
    return true;
  }

  if (fid === 'remarkable_athlete') {
    ctx.narrative = `${ctx.char.name} — Remarkable Athlete: add +${Math.ceil(profBonus(ctx.char.level) / 2)} to uninvested STR/DEX/CON checks (passive).`;
    return true;
  }

  return false;
}
