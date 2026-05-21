import { abilityMod, applyDamageMultiplier, profBonus, rollDice } from '../../rulesEngine.js';
import {
  effectiveSpeed,
  endCombatState,
  getEnemyById,
  inflictCondition,
  isRoomCleared,
} from '../../gameEngine.js';
import type { ActionHandler } from '../types.js';
import { SRD_SPECIES } from '../../../contexts/srd/index.js';
import { entitiesInCone } from '../../gridEngine.js';
import { handleBarbarianFeature } from './barbarian.js';
import { handleCasterFeature } from './casters.js';
import { handleClericFeature } from './cleric.js';
import { handleDruidFeature } from './druid.js';
import { handleFighterFeature } from './fighter.js';
import { handleMonkFeature } from './monk.js';
import { handlePaladinRangerBardFeature } from './paladinRangerBard.js';
import { handleRogueFeature } from './rogue.js';

/**
 * `use_class_feature`: per-feature dispatch — the catch-all for every
 * class-feature/subclass-feature/species-feature that doesn't already
 * have its own action type. Largest single case in the engine.
 *
 * Lifted verbatim from gameEngine.ts in PR 16. Internal splits (per-
 * class files: barbarian.ts, fighter.ts, rogue.ts, monk.ts, cleric.ts,
 * etc.) land in follow-up PRs once the per-class boundaries are clear.
 *
 * Each feature branch is gated by a feature id (action.featureId) and
 * usually some combination of class/subclass/level. The dispatch table
 * is currently a series of `if` blocks rather than a single switch —
 * intentional, because some features (Channel Divinity variants,
 * Metamagic options) share a feature id and differentiate via subclass
 * or a secondary parameter.
 *
 * Features handled today: Rage, Action Surge, Second Wind, Tactical
 * Master, Bardic Inspiration, Reckless Attack, Cunning Action (Dash /
 * Disengage / Hide), Cunning Strike, Channel Divinity (Turn Undead /
 * Sacred Weapon / Guided Strike / Vow of Enmity / Nature's Wrath),
 * Wild Shape, Natural Recovery, Sneak Attack-style flurry attacks
 * (Monk), Ki abilities, Metamagic (Sorcerer), Eldritch Invocations
 * (Warlock), Patron features, racial 1/long-rest uses, Orc Adrenaline
 * Rush, Goliath Large Form, Dragonborn Breath Weapon, and the
 * "unknown feature" fallthrough.
 */
export const handleUseClassFeature: ActionHandler<{
  type: 'use_class_feature';
  featureId: string;
}> = (ctx, action) => {
  const fid = action.featureId;

  // Per-class dispatch. Each handler returns true if the action's fid
  // matched one of its features (caller stops here); false to fall
  // through to the next class's handler. As more classes get extracted
  // into per-class files, this chain grows and the inline if-chain
  // below shrinks.
  if (handleBarbarianFeature(ctx, fid)) return;
  if (handleFighterFeature(ctx, fid)) return;
  if (handleRogueFeature(ctx, fid)) return;
  if (handleMonkFeature(ctx, fid)) return;
  if (handleDruidFeature(ctx, fid)) return;
  if (handleCasterFeature(ctx, fid)) return;
  if (handleClericFeature(ctx, fid)) return;
  if (handlePaladinRangerBardFeature(ctx, fid)) return;

  // ── 2024 PHB Orc — Adrenaline Rush. Bonus action: gain the Dash action
  // (refunds full speed of movement this turn) and gain temp HP equal
  // to proficiency bonus. 1/short rest.
  if (fid === 'adrenaline_rush') {
    if (ctx.char.species !== 'orc') {
      ctx.narrative = 'Only Orcs have Adrenaline Rush.';
      return;
    }
    if (ctx.char.class_resource_uses?.adrenaline_rush_used === 1) {
      ctx.narrative = 'Adrenaline Rush already used this short rest.';
      return;
    }
    if (ctx.char.turn_actions.bonus_action_used) {
      ctx.narrative = 'Bonus action already used this turn.';
      return;
    }
    const arSpeed = effectiveSpeed(ctx.char);
    ctx.st = {
      ...ctx.st,
      movement_used: {
        ...(ctx.st.movement_used ?? {}),
        [ctx.char.id]: Math.max(0, (ctx.st.movement_used?.[ctx.char.id] ?? 0) - arSpeed),
      },
    };
    const arTemp = profBonus(ctx.char.level);
    const newTemp = Math.max(ctx.char.temp_hp ?? 0, arTemp);
    ctx.char.temp_hp = newTemp;
    ctx.char.class_resource_uses = {
      ...(ctx.char.class_resource_uses ?? {}),
      adrenaline_rush_used: 1,
    };
    ctx.char.turn_actions = { ...ctx.char.turn_actions, bonus_action_used: true };
    ctx.narrative = `🪓 ${ctx.char.name} — Adrenaline Rush! +${arSpeed} ft movement (Dash) and ${arTemp} temp HP.`;
    ctx.usedInitiative = true;
  }

  // 2024 PHB Goliath — Large Form. Bonus action; the Goliath grows to
  // Large size for ~10 rounds (1 min RAW). Gains +10 ft speed (via
  // condition wired in `effectiveSpeed`) and is treated as Large for
  // any size-dependent interactions. 1/short rest.
  else if (fid === 'large_form') {
    if (ctx.char.species !== 'goliath') {
      ctx.narrative = 'Only Goliaths have Large Form.';
      return;
    }
    if (ctx.char.class_resource_uses?.large_form_used === 1) {
      ctx.narrative = 'Large Form already used this short rest.';
      return;
    }
    if (ctx.char.turn_actions.bonus_action_used) {
      ctx.narrative = 'Bonus action already used this turn.';
      return;
    }
    ctx.char.class_resource_uses = {
      ...(ctx.char.class_resource_uses ?? {}),
      large_form_used: 1,
    };
    ctx.char.turn_actions = { ...ctx.char.turn_actions, bonus_action_used: true };
    ctx.char = inflictCondition(ctx.char, 'large_form');
    if (!ctx.char.condition_durations) ctx.char.condition_durations = {};
    ctx.char.condition_durations = { ...ctx.char.condition_durations, large_form: 10 };
    ctx.narrative = `🗿 ${ctx.char.name} swells to Large size! +10 ft speed and advantage on STR checks for 10 rounds.`;
    ctx.usedInitiative = true;
  }

  // 2024 PHB Dragonborn — Breath Weapon. Cone of damage emanating from
  // the dragonborn in the direction of the currently-targeted ctx.enemy.
  // DEX save for half; damage scales with level. 1/short rest.
  else if (fid === 'breath_weapon') {
    if (ctx.char.species !== 'dragonborn') {
      ctx.narrative = 'Only Dragonborn have a Breath Weapon.';
      return;
    }
    if (ctx.char.class_resource_uses?.breath_weapon_used === 1) {
      ctx.narrative = 'Breath Weapon already used — recovers on a short rest.';
      return;
    }
    if (!ctx.enemyAlive || !ctx.enemy) {
      ctx.narrative = 'No living target to direct your breath at.';
      return;
    }
    const selfEntBW = ctx.st.entities?.find((e) => e.id === ctx.char.id);
    const targetEntBW = ctx.st.entities?.find((e) => e.id === ctx.enemy!.id && e.isEnemy);
    if (!selfEntBW || !targetEntBW) {
      ctx.narrative = 'Breath Weapon needs a grid position to project the cone.';
      return;
    }
    const bwDice =
      ctx.char.level >= 17 ? 4 : ctx.char.level >= 11 ? 3 : ctx.char.level >= 5 ? 2 : 1;
    const bwDC = 8 + profBonus(ctx.char.level) + abilityMod(ctx.char.con);
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
    ctx.st = {
      ...ctx.st,
      entities: updatedEntities,
    };
    ctx.char.class_resource_uses = {
      ...(ctx.char.class_resource_uses ?? {}),
      breath_weapon_used: 1,
    };
    ctx.narrative =
      lines.length > 0
        ? `🐲 ${ctx.char.name}'s Breath Weapon (${bwDice}d10 ${bwDmgType}, 15-ft cone)! ${lines.join(' · ')}`
        : `${ctx.char.name} exhales a cone of ${bwDmgType} but no enemies are caught in it.`;
    ctx.usedInitiative = true;
    // Combat may have ended if everyone in the cone dropped.
    if (isRoomCleared(ctx.st, ctx.seed, ctx.roomId)) {
      ctx.st = endCombatState(ctx.st);
    }
  }

  // ── Unknown feature fallthrough ────────────────────────────────────────
  else {
    ctx.narrative = `Unknown class feature: ${fid}.`;
  }
  return;
};
