import { abilityMod, applyDamageMultiplier, profBonus, rollDice } from '../../rulesEngine.js';
import {
  effectiveSpeed,
  endCombatState,
  getEnemyById,
  inflictCondition,
  isRoomCleared,
} from '../../gameEngine.js';
import type { ActionContext } from '../types.js';
import { SRD_SPECIES } from '../../../campaignData/srd/index.js';
import { entitiesInCone } from '../../gridEngine.js';
import { updatePcActor } from '../actor.js';

/**
 * SRD species (formerly "racial") features. Three classes
 * bundled — each has exactly one "racial trait as featureId" entry.
 *
 *  - `adrenaline_rush` (Orc): bonus action Dash + temp HP equal to
 *    proficiency bonus. 1/short rest.
 *  - `large_form` (Goliath): bonus action grow Large for 10 rounds.
 *    +10 ft speed (via effectiveSpeed's large_form condition check),
 *    advantage on STR checks. 1/short rest.
 *  - `breath_weapon` (Dragonborn): action. 15-ft cone of the
 *    ancestral damage type (DEX save halves). Damage = (level/5
 *    bucket)d10. 1/short rest.
 */
export function handleSpeciesFeature(ctx: ActionContext, fid: string): boolean {
  if (ctx.actor.kind !== 'pc') return false;
  const pc = ctx.actor;
  if (fid === 'adrenaline_rush') {
    if (pc.char.species !== 'orc') {
      ctx.narrative = 'Only Orcs have Adrenaline Rush.';
      return true;
    }
    if (pc.char.class_resource_uses?.adrenaline_rush_used === 1) {
      ctx.narrative = 'Adrenaline Rush already used this short rest.';
      return true;
    }
    if (pc.char.turn_actions.bonus_action_used) {
      ctx.narrative = 'Bonus action already used this turn.';
      return true;
    }
    const arSpeed = effectiveSpeed(pc.char);
    ctx.st = {
      ...ctx.st,
      movement_used: {
        ...(ctx.st.movement_used ?? {}),
        [pc.char.id]: Math.max(0, (ctx.st.movement_used?.[pc.char.id] ?? 0) - arSpeed),
      },
    };
    const arTemp = profBonus(pc.char.level);
    const newTemp = Math.max(pc.char.temp_hp ?? 0, arTemp);
    pc.char.temp_hp = newTemp;
    pc.char.class_resource_uses = {
      ...(pc.char.class_resource_uses ?? {}),
      adrenaline_rush_used: 1,
    };
    pc.char.turn_actions = { ...pc.char.turn_actions, bonus_action_used: true };
    ctx.narrative = `🪓 ${pc.char.name} — Adrenaline Rush! +${arSpeed} ft movement (Dash) and ${arTemp} temp HP.`;
    ctx.usedInitiative = true;
    return true;
  }

  if (fid === 'large_form') {
    if (pc.char.species !== 'goliath') {
      ctx.narrative = 'Only Goliaths have Large Form.';
      return true;
    }
    if (pc.char.class_resource_uses?.large_form_used === 1) {
      ctx.narrative = 'Large Form already used this short rest.';
      return true;
    }
    if (pc.char.turn_actions.bonus_action_used) {
      ctx.narrative = 'Bonus action already used this turn.';
      return true;
    }
    pc.char.class_resource_uses = {
      ...(pc.char.class_resource_uses ?? {}),
      large_form_used: 1,
    };
    pc.char.turn_actions = { ...pc.char.turn_actions, bonus_action_used: true };
    updatePcActor(ctx, inflictCondition(pc.char, 'large_form'));
    if (!pc.char.condition_durations) pc.char.condition_durations = {};
    pc.char.condition_durations = { ...pc.char.condition_durations, large_form: 10 };
    ctx.narrative = `🗿 ${pc.char.name} swells to Large size! +10 ft speed and advantage on STR checks for 10 rounds.`;
    ctx.usedInitiative = true;
    return true;
  }

  if (fid === 'breath_weapon') {
    if (pc.char.species !== 'dragonborn') {
      ctx.narrative = 'Only Dragonborn have a Breath Weapon.';
      return true;
    }
    if (pc.char.class_resource_uses?.breath_weapon_used === 1) {
      ctx.narrative = 'Breath Weapon already used — recovers on a short rest.';
      return true;
    }
    if (!ctx.enemyAlive || !ctx.enemy) {
      ctx.narrative = 'No living target to direct your breath at.';
      return true;
    }
    const selfEntBW = ctx.st.entities?.find((e) => e.id === pc.char.id);
    const targetEntBW = ctx.st.entities?.find((e) => e.id === ctx.enemy!.id && e.isEnemy);
    if (!selfEntBW || !targetEntBW) {
      ctx.narrative = 'Breath Weapon needs a grid position to project the cone.';
      return true;
    }
    const bwDice = pc.char.level >= 17 ? 4 : pc.char.level >= 11 ? 3 : pc.char.level >= 5 ? 2 : 1;
    const bwDC = 8 + profBonus(pc.char.level) + abilityMod(pc.char.con);
    const bwDmgType = SRD_SPECIES.dragonborn?.resistances?.[0] ?? 'fire';
    const cone = entitiesInCone(selfEntBW.pos, targetEntBW.pos, 15, ctx.st.entities ?? []);
    const lines: string[] = [];
    let updatedEntities = ctx.st.entities ?? [];
    for (const ent of cone) {
      if (!ent.isEnemy || ent.hp <= 0) continue;
      const enemyData = getEnemyById(ctx.seed, ent.id);
      if (!enemyData) continue;
      const dexScore = enemyData.dex ?? 10;
      const save = rollDice('1d20') + abilityMod(dexScore);
      const fullDmg = rollDice(`${bwDice}d10`);
      const { damage: typedDmg, note } = applyDamageMultiplier(fullDmg, bwDmgType, enemyData);
      const dmg = save >= bwDC ? Math.floor(typedDmg / 2) : typedDmg;
      updatedEntities = updatedEntities.map((e) =>
        e.id === ent.id ? { ...e, hp: Math.max(0, e.hp - dmg) } : e
      );
      lines.push(
        `${enemyData.name}: DEX ${save} vs DC ${bwDC} — ${dmg} ${bwDmgType}${save >= bwDC ? ' (half)' : ''}${note ?? ''}`
      );
    }
    ctx.st = { ...ctx.st, entities: updatedEntities };
    pc.char.class_resource_uses = {
      ...(pc.char.class_resource_uses ?? {}),
      breath_weapon_used: 1,
    };
    ctx.narrative =
      lines.length > 0
        ? `🐲 ${pc.char.name}'s Breath Weapon (${bwDice}d10 ${bwDmgType}, 15-ft cone)! ${lines.join(' · ')}`
        : `${pc.char.name} exhales a cone of ${bwDmgType} but no enemies are caught in it.`;
    ctx.usedInitiative = true;
    if (isRoomCleared(ctx.st, ctx.seed, ctx.roomId)) {
      ctx.st = endCombatState(ctx.st);
    }
    return true;
  }

  return false;
}
