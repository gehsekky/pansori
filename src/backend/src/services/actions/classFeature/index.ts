import {
  abilityMod,
  applyDamageMultiplier,
  profBonus,
  rollCritical,
  rollDice,
} from '../../rulesEngine.js';
import {
  applyPartyLevelUps,
  effectiveSpeed,
  endCombatState,
  getEnemyById,
  inflictCondition,
  isRoomCleared,
  pushEvent,
  splitEncounterXp,
} from '../../gameEngine.js';
import { distanceFeet, entitiesInCone } from '../../gridEngine.js';
import type { ActionHandler } from '../types.js';
import { SRD_SPECIES } from '../../../contexts/srd/index.js';
import { fmt } from '../../narrativeFmt.js';
import { handleBarbarianFeature } from './barbarian.js';
import { handleCasterFeature } from './casters.js';
import { handleClericFeature } from './cleric.js';
import { handleDruidFeature } from './druid.js';
import { handleFighterFeature } from './fighter.js';
import { handleMonkFeature } from './monk.js';
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

  // ── Bardic Inspiration (Bard bonus action) ────────────────────────────
  if (fid === 'bardic_inspiration') {
    if (ctx.char.character_class.toLowerCase() !== 'bard') {
      ctx.narrative = 'Only Bards have Bardic Inspiration.';
      return;
    }
    const biUses =
      ctx.char.class_resource_uses?.bardic_inspiration ??
      Math.max(1, Math.floor((ctx.char.cha - 10) / 2));
    if (biUses <= 0) {
      ctx.narrative = 'No Bardic Inspiration uses remaining.';
      return;
    }
    if (ctx.char.turn_actions.bonus_action_used) {
      ctx.narrative = 'Bonus action already used this turn.';
      return;
    }
    // Pick an ally to grant the die to. Currently auto-picks the first
    // non-self living party member; a future PR can add a target picker.
    const ally = ctx.st.characters.find((c) => c.id !== ctx.char.id && !c.dead && c.hp > 0);
    if (!ally) {
      ctx.narrative = 'No ally to inspire.';
      return;
    }
    ctx.char.class_resource_uses = {
      ...(ctx.char.class_resource_uses ?? {}),
      bardic_inspiration: biUses - 1,
    };
    ctx.char.turn_actions = { ...ctx.char.turn_actions, bonus_action_used: true };
    const inspDie =
      ctx.char.level >= 15
        ? 'd12'
        : ctx.char.level >= 10
          ? 'd10'
          : ctx.char.level >= 5
            ? 'd8'
            : 'd6';
    ctx.st = {
      ...ctx.st,
      characters: ctx.st.characters.map((c) =>
        c.id === ally.id ? { ...c, bardic_inspiration_die: inspDie } : c
      ),
    };
    ctx.narrative = `${ctx.char.name} grants Bardic Inspiration (${inspDie}) to ${ally.name}! (${biUses - 1} use${biUses - 1 === 1 ? '' : 's'} remaining)`;
  }

  // ── 2024 PHB Cleric L5: Sear Undead ──────────────────────────────────────
  // Action. Replaces 2014 Destroy Undead. AoE radiant: each undead in 30 ft
  // takes Nd8 (N = cleric level) radiant damage; WIS save halves.
  // 2024 PHB Orc — Adrenaline Rush. Bonus action: gain the Dash action
  // (refunds full speed of movement this turn) and gain temp HP equal
  // to proficiency bonus. 1/short rest.
  else if (fid === 'adrenaline_rush') {
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

  // ── Hunter Ranger: Hunter's Prey — Colossus Slayer ───────────────────────
  else if (fid === 'colossus_slayer') {
    if (ctx.char.subclass !== 'hunter') {
      ctx.narrative = 'Only Hunter Rangers have Colossus Slayer.';
      return;
    }
    const csTarget = ctx.st.entities?.find((e) => e.id === ctx.roomId && e.isEnemy);
    if (!ctx.enemyAlive || !csTarget) {
      ctx.narrative = 'No living target.';
      return;
    }
    const enemyMaxHp =
      (ctx.enemy as unknown as Record<string, number>)['max_hp'] ?? csTarget.hp * 2;
    if (csTarget.hp >= enemyMaxHp) {
      ctx.narrative = 'Colossus Slayer only triggers on a bloodied (below max HP) target.';
      return;
    }
    if ((ctx.char.class_resource_uses?.colossus_slayer_used ?? 0) >= 1) {
      ctx.narrative = 'Colossus Slayer already triggered this turn.';
      return;
    }
    const csDmg = rollDice('1d8');
    ctx.char.class_resource_uses = {
      ...(ctx.char.class_resource_uses ?? {}),
      colossus_slayer_used: 1,
    };
    const csHp = (ctx.st.entities?.find((e) => e.id === ctx.roomId && e.isEnemy)?.hp ?? 0) - csDmg;
    ctx.st = {
      ...ctx.st,
      entities: (ctx.st.entities ?? []).map((e) =>
        e.id === ctx.roomId && e.isEnemy ? { ...e, hp: Math.max(0, csHp) } : e
      ),
    };
    ctx.narrative = `Colossus Slayer! +${fmt.dmg(csDmg)} piercing damage on a bloodied foe (${csHp <= 0 ? 'killed' : `${fmt.hp(Math.max(0, csHp))} HP remaining`}).`;
    if (csHp <= 0) {
      ctx.st.enemies_killed = [...ctx.st.enemies_killed, ctx.roomId];
      ctx.st = endCombatState(ctx.st);
    }
  }

  // ── Beastmaster Ranger: command animal companion (bonus action, PHB p.93)
  else if (fid === 'command_companion') {
    if (
      ctx.char.subclass !== 'beastmaster' ||
      ctx.char.character_class.toLowerCase() !== 'ranger'
    ) {
      ctx.narrative = 'Only Beastmaster Rangers can command an animal companion.';
      return;
    }
    if (ctx.char.level < 3) {
      ctx.narrative = 'Animal Companion unlocks at Ranger level 3.';
      return;
    }
    if (ctx.char.turn_actions.bonus_action_used) {
      ctx.narrative = 'Bonus action already used this turn.';
      return;
    }
    const comp = ctx.st.entities?.find(
      (e) => e.isCompanion && e.companionOwnerId === ctx.char.id && e.hp > 0
    );
    if (!comp) {
      ctx.narrative = 'Your animal companion is unavailable.';
      return;
    }
    // Pick the nearest living ctx.enemy as the target
    const targetEnt = (ctx.st.entities ?? [])
      .filter((e) => e.isEnemy && e.hp > 0)
      .sort((a, b) => distanceFeet(comp.pos, a.pos) - distanceFeet(comp.pos, b.pos))[0];
    if (!targetEnt) {
      ctx.narrative = 'No living enemy in sight for the companion.';
      return;
    }
    const targetEnemy = getEnemyById(ctx.seed, targetEnt.id);
    if (!targetEnemy) {
      ctx.narrative = "Companion's target is unreachable.";
      return;
    }
    ctx.char.turn_actions = { ...ctx.char.turn_actions, bonus_action_used: true };
    ctx.usedInitiative = true;
    // Resolve the companion's bite attack against the target's AC
    const toHit = comp.toHit ?? 4;
    const dmgDice = comp.damage ?? '2d4+2';
    const compName = comp.companionName ?? 'companion';
    const attackRoll = rollDice('1d20');
    const total = attackRoll + toHit;
    if (attackRoll === 1) {
      ctx.narrative = `${compName} lunges but misses wildly! (d20:1+${toHit}=${total} vs AC ${targetEnemy.ac})`;
    } else if (attackRoll === 20 || total >= targetEnemy.ac) {
      const isCrit = attackRoll === 20;
      const dmg = isCrit ? rollCritical(dmgDice) : rollDice(dmgDice);
      const { damage: finalDmg, note } = applyDamageMultiplier(dmg, 'piercing', targetEnemy);
      const curHp = targetEnt.hp;
      const newHp = Math.max(0, curHp - finalDmg);
      ctx.st = {
        ...ctx.st,
        entities: (ctx.st.entities ?? []).map((e) =>
          e.id === targetEnt.id && e.isEnemy ? { ...e, hp: newHp } : e
        ),
      };
      ctx.narrative = `${compName} bites the ${targetEnemy.name}! ${finalDmg} piercing damage${isCrit ? ' (CRIT)' : ''} (d20:${attackRoll}+${toHit}=${total} vs AC ${targetEnemy.ac})${note}`;
      if (newHp <= 0) {
        ctx.st.enemies_killed = [...ctx.st.enemies_killed, targetEnt.id];
        ctx.narrative += ` ${targetEnemy.name} falls!`;
        const xpGain = targetEnemy.xp ?? 10;
        const split = splitEncounterXp(ctx.st, ctx.char.id, xpGain);
        ctx.st = split.st;
        ctx.char.xp = (ctx.char.xp || 0) + split.share;
        ctx.narrative += applyPartyLevelUps(ctx.st, ctx.char, ctx.context);
        if (isRoomCleared(ctx.st, ctx.seed, ctx.roomId)) {
          ctx.st = endCombatState(ctx.st);
        }
      }
    } else {
      ctx.narrative = `${compName} bites at the ${targetEnemy.name} but misses. (d20:${attackRoll}+${toHit}=${total} vs AC ${targetEnemy.ac})`;
    }
  }

  // ── Devotion Paladin: Sacred Weapon (Channel Divinity) ───────────────────
  else if (fid === 'sacred_weapon') {
    if (ctx.char.subclass !== 'devotion') {
      ctx.narrative = 'Only Devotion Paladins have Sacred Weapon.';
      return;
    }
    const cdUsesDev = ctx.char.class_resource_uses?.channel_divinity ?? 1;
    if (cdUsesDev <= 0) {
      ctx.narrative = 'No Channel Divinity uses remaining.';
      return;
    }
    ctx.char.class_resource_uses = {
      ...(ctx.char.class_resource_uses ?? {}),
      channel_divinity: cdUsesDev - 1,
      sacred_weapon_active: 1,
    };
    const chaMod = abilityMod(ctx.char.cha);
    ctx.narrative = `${ctx.char.name} — Sacred Weapon! +${chaMod} to attack rolls for 1 minute (10 rounds). Your weapon gleams with divine light. (${cdUsesDev - 1} Channel Divinity remaining)`;
  }

  // ── Vengeance Paladin: Vow of Enmity (Channel Divinity) ──────────────────
  else if (fid === 'vow_of_enmity') {
    if (ctx.char.subclass !== 'vengeance') {
      ctx.narrative = 'Only Vengeance Paladins have Vow of Enmity.';
      return;
    }
    const cdUsesVen = ctx.char.class_resource_uses?.channel_divinity ?? 1;
    if (cdUsesVen <= 0) {
      ctx.narrative = 'No Channel Divinity uses remaining.';
      return;
    }
    ctx.char.class_resource_uses = {
      ...(ctx.char.class_resource_uses ?? {}),
      channel_divinity: cdUsesVen - 1,
    };
    ctx.st = { ...ctx.st, vow_of_enmity_target: ctx.roomId };
    ctx.narrative = `${ctx.char.name} — Vow of Enmity! You have advantage on all attack rolls against ${ctx.enemy?.name ?? 'your target'} for 1 minute. (${cdUsesVen - 1} Channel Divinity remaining)`;
  }

  // ── Vengeance Paladin: Abjure Enemy (Channel Divinity) ───────────────────
  else if (fid === 'abjure_enemy') {
    if (ctx.char.subclass !== 'vengeance') {
      ctx.narrative = 'Only Vengeance Paladins have Abjure Enemy.';
      return;
    }
    if (!ctx.enemyAlive || !ctx.enemy) {
      ctx.narrative = 'No living target.';
      return;
    }
    const cdUsesVen2 = ctx.char.class_resource_uses?.channel_divinity ?? 1;
    if (cdUsesVen2 <= 0) {
      ctx.narrative = 'No Channel Divinity uses remaining.';
      return;
    }
    ctx.char.class_resource_uses = {
      ...(ctx.char.class_resource_uses ?? {}),
      channel_divinity: cdUsesVen2 - 1,
    };
    const wisSave =
      rollDice('1d20') + abilityMod((ctx.enemy as unknown as Record<string, number>)['wis'] ?? 10);
    const frightenDC = 8 + profBonus(ctx.char.level) + abilityMod(ctx.char.cha);
    const abjureSuccess = wisSave >= frightenDC;
    ctx.st = pushEvent(ctx.st, {
      kind: 'save',
      characterId: ctx.enemy!.id,
      characterName: ctx.enemy!.name,
      ability: 'wis',
      roll: wisSave,
      dc: frightenDC,
      success: abjureSuccess,
      vs: 'Abjure Enemy',
      round: ctx.st.round ?? 1,
    });
    if (!abjureSuccess) {
      ctx.st = {
        ...ctx.st,
        entities: (ctx.st.entities ?? []).map((e) =>
          e.id === ctx.roomId && e.isEnemy
            ? {
                ...e,
                conditions: [...e.conditions.filter((c) => c !== 'frightened'), 'frightened'],
              }
            : e
        ),
      };
      ctx.st = pushEvent(ctx.st, {
        kind: 'condition_applied',
        targetId: ctx.enemy!.id,
        targetName: ctx.enemy!.name,
        condition: 'frightened',
        source: 'Abjure Enemy',
        round: ctx.st.round ?? 1,
      });
      ctx.narrative = `Abjure Enemy! WIS save ${wisSave} vs DC ${frightenDC} — ${ctx.enemy!.name} is frightened! (${cdUsesVen2 - 1} Channel Divinity remaining)`;
    } else {
      ctx.narrative = `Abjure Enemy! WIS save ${wisSave} vs DC ${frightenDC} — ${ctx.enemy!.name} resists. (${cdUsesVen2 - 1} Channel Divinity remaining)`;
    }
    ctx.usedInitiative = true;
  }

  // ── Lore Bard: Cutting Words (reaction) ──────────────────────────────────
  else if (fid === 'cutting_words') {
    if (ctx.char.subclass !== 'lore') {
      ctx.narrative = 'Only Lore Bards have Cutting Words.';
      return;
    }
    if (ctx.char.turn_actions.reaction_used) {
      ctx.narrative = 'Reaction already used this turn.';
      return;
    }
    if (!ctx.enemyAlive || !ctx.enemy) {
      ctx.narrative = 'No living target.';
      return;
    }
    const biLeft = ctx.char.class_resource_uses?.bardic_inspiration ?? abilityMod(ctx.char.cha);
    if (biLeft <= 0) {
      ctx.narrative = 'No Bardic Inspiration uses remaining.';
      return;
    }
    ctx.char.class_resource_uses = {
      ...(ctx.char.class_resource_uses ?? {}),
      bardic_inspiration: biLeft - 1,
    };
    ctx.char.turn_actions = { ...ctx.char.turn_actions, reaction_used: true };
    const cuttingDie =
      ctx.char.level >= 15 ? 12 : ctx.char.level >= 10 ? 10 : ctx.char.level >= 5 ? 8 : 6;
    const cuttingRoll = rollDice(`1d${cuttingDie}`);
    ctx.narrative = `${ctx.char.name} — Cutting Words! Subtract ${cuttingRoll} from ${ctx.enemy!.name}'s next attack roll or ability check this round. (${biLeft - 1} Bardic Inspiration remaining)`;
    ctx.st = { ...ctx.st, cutting_words_penalty: cuttingRoll };
  }

  // ── Unknown feature fallthrough ────────────────────────────────────────
  else {
    ctx.narrative = `Unknown class feature: ${fid}.`;
  }
  return;
};
