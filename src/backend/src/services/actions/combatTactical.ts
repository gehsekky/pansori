import type { ActionContext, ActionHandler } from './types.js';
import { abilityMod, d, d20TestPenalty, profBonus, skillCheck } from '../rulesEngine.js';
import { applyGuidanceDie, consumeGuidanceDie, updatePcActor } from './actor.js';
import {
  applyIndomitableMight,
  hasExpertise,
  hasJackOfAllTrades,
  hasReliableTalent,
} from '../multiclass.js';
import { getEnemyById, pushEntityAway } from '../gameEngine.js';
import { unarmedStrikeDc, unarmedStrikeSave, withinUnarmedSizeLimit } from '../unarmedStrike.js';
import { checkMountFallOff } from './mount.js';
import { composeNow } from '../narrative/compose.js';
import { distanceFeet } from '../gridEngine.js';
import { extraAttackCountForChar } from './attack/resolveOneAttack.js';
import { handleAttack } from './attack/index.js';

/**
 * SRD Unarmed Strike — Grapple / Shove. Shared resolution:
 *  - the target must be within 5 ft and no more than one size larger;
 *  - it makes a STR or DEX save (its choice) against 8 + STR mod (a Monk may
 *    use DEX) + Proficiency Bonus; Legendary Resistance applies;
 *  - a failed save grapples it (escape DC = the same DC), knocks it Prone, or
 *    pushes it 5 ft away.
 * An Unarmed Strike is one attack of the Attack action, so with Extra Attack
 * the remaining attacks follow against the same target (`handleAttack` with
 * `attackActionAttacksSpent`). Simplification: the follow-up attacks can't be
 * aimed at a different creature.
 */
type UnarmedOption = 'grapple' | 'prone' | 'push';

function resolveUnarmedOption(
  ctx: ActionContext,
  targetEnemyId: string | undefined,
  option: UnarmedOption
): { rejected: string } | undefined {
  if (ctx.actor.kind !== 'pc') {
    return { rejected: option === 'grapple' ? 'Only PCs can grapple.' : 'Only PCs can shove.' };
  }
  const { char } = ctx.actor;
  const verb = option === 'grapple' ? 'Grapple' : 'Shove';
  if (!ctx.enemyAlive || !ctx.enemy) {
    return { rejected: option === 'grapple' ? 'No enemy to grapple.' : 'No enemy to shove.' };
  }
  const targetId = targetEnemyId ?? ctx.enemy.id;
  const target = ctx.livingEnemiesInRoom.find((e) => e.id === targetId) ?? ctx.enemy;
  const myEnt = ctx.st.entities?.find((e) => e.id === char.id);
  const tgtEnt = ctx.st.entities?.find((e) => e.id === target.id && e.isEnemy);
  if (myEnt && tgtEnt && distanceFeet(myEnt.pos, tgtEnt.pos) > 5) {
    return { rejected: `Out of reach — ${verb} needs the target within 5 ft. Move closer first.` };
  }
  if (!withinUnarmedSizeLimit(char, target)) {
    return {
      rejected: `The ${target.name} is too big to ${verb.toLowerCase()} — it can be at most one size larger than you.`,
    };
  }

  const dc = unarmedStrikeDc(char);
  const immuneTo = option === 'grapple' ? 'grappled' : option === 'prone' ? 'prone' : null;
  if (immuneTo && target.condition_immunities?.includes(immuneTo)) {
    // RAW: the attack is spent; the immunity just negates the effect.
    ctx.narrative = `The ${target.name} cannot be ${immuneTo === 'prone' ? 'knocked prone' : 'grappled'} (condition immunity).`;
  } else {
    const save = unarmedStrikeSave(ctx.st, target, tgtEnt?.conditions ?? [], dc);
    const saveText = `${save.ability.toUpperCase()} save vs DC ${dc}`;
    if (!save.failed) {
      ctx.narrative =
        option === 'grapple'
          ? `The ${target.name} slips your grapple. (${saveText}: success)${save.note}`
          : `The ${target.name} holds its ground against your shove. (${saveText}: success)${save.note}`;
    } else if (option === 'grapple') {
      ctx.st = {
        ...ctx.st,
        entities: (ctx.st.entities ?? []).map((e) =>
          e.id === target.id && e.isEnemy
            ? {
                ...e,
                conditions: [...e.conditions.filter((c) => c !== 'grappled'), 'grappled'],
                grappled_by: char.id,
                grapple_escape_dc: dc,
              }
            : e
        ),
      };
      composeNow(ctx, {
        kind: 'condition_applied',
        targetId: target.id,
        targetName: target.name,
        condition: 'grappled',
        source: 'Grapple',
        prose: `You grapple the ${target.name}! (${saveText}: failed) It is GRAPPLED — Speed 0, and Disadvantage on attacks against anyone but you (escape DC ${dc}).`,
      });
    } else if (option === 'prone') {
      ctx.st = {
        ...ctx.st,
        entities: (ctx.st.entities ?? []).map((e) =>
          e.id === target.id && e.isEnemy
            ? { ...e, conditions: [...e.conditions.filter((c) => c !== 'prone'), 'prone'] }
            : e
        ),
      };
      composeNow(ctx, {
        kind: 'condition_applied',
        targetId: target.id,
        targetName: target.name,
        condition: 'prone',
        source: 'Shove',
        prose: `You shove the ${target.name} to the ground! (${saveText}: failed) It is PRONE — melee attacks against it have Advantage, ranged attacks Disadvantage.`,
      });
      // SRD Mounted Combat — a shoved mount's rider makes a DC 10 DEX save or
      // falls off (no-op for an unmounted target).
      const fallOff = checkMountFallOff(ctx.st, target.id);
      ctx.st = fallOff.st;
      if (fallOff.narrative) ctx.narrative = (ctx.narrative ?? '') + fallOff.narrative;
    } else {
      const pushed =
        myEnt && tgtEnt
          ? pushEntityAway(
              ctx.st,
              target.id,
              myEnt.pos,
              5,
              ctx.context,
              ctx.seed,
              ctx.st.current_room,
              ctx.roomObstacleCells
            )
          : { st: ctx.st, pushedFt: 0 };
      ctx.st = pushed.st;
      ctx.narrative =
        pushed.pushedFt > 0
          ? `You shove the ${target.name} 5 feet back! (${saveText}: failed)`
          : `You shove the ${target.name}, but there's no room to push it back. (${saveText}: failed)`;
    }
    if (save.failed && save.note) ctx.narrative += save.note;
  }

  spendUnarmedStrikeAttack(ctx, target.id);
  return undefined;
}

/**
 * The Grapple / Shove was one attack. Outside combat it simply uses the
 * action; in combat with Extra Attack the remaining attacks follow.
 */
function spendUnarmedStrikeAttack(ctx: ActionContext, targetId: string): void {
  if (ctx.actor.kind !== 'pc') return;
  const { char } = ctx.actor;
  if (!ctx.st.combat_active) {
    ctx.usedInitiative = true;
    return;
  }
  const remaining = char.turn_actions.haste_extra_action_used ? 0 : extraAttackCountForChar(char);
  const targetAlive = (ctx.st.entities?.find((e) => e.id === targetId)?.hp ?? 0) > 0;
  if (remaining > 0 && targetAlive) {
    const before = ctx.narrative;
    ctx.narrative = '';
    ctx.attackActionAttacksSpent = 1;
    handleAttack(ctx, { type: 'attack', targetEnemyId: targetId });
    ctx.attackActionAttacksSpent = undefined;
    const pc = ctx.actor.kind === 'pc' ? ctx.actor.char : char;
    if (pc.turn_actions.action_used || ctx.st.pending_reaction) {
      ctx.narrative = `${before}\n\n${ctx.narrative}`;
      return;
    }
    // The follow-up never happened (e.g. a pushed target is now out of reach).
    ctx.narrative = `${before} (Your remaining attacks have no target in reach.)`;
  }
  const latest = ctx.actor.kind === 'pc' ? ctx.actor.char : char;
  updatePcActor(ctx, { turn_actions: { ...latest.turn_actions, action_used: true } });
}

/** `grapple`: SRD Unarmed Strike — Grapple. See `resolveUnarmedOption`. */
export const handleGrapple: ActionHandler<{
  type: 'grapple';
  targetEnemyId?: string;
}> = (ctx, action) => resolveUnarmedOption(ctx, action.targetEnemyId, 'grapple');

/**
 * `try_escape_grapple`: SRD 5.2.1 — grappled creature spends its
 * action on a contested STR(Athletics) or DEX(Acrobatics) check vs
 * grappler's STR(Athletics). Engine picks the better of the two for
 * the player. Lenient fallback when there's no tracked grappler:
 * just drop the condition (shouldn't happen, but be defensive).
 */
export const handleTryEscapeGrapple: ActionHandler<{ type: 'try_escape_grapple' }> = (ctx) => {
  if (ctx.actor.kind !== 'pc') return { rejected: 'Only PCs can escape a grapple.' };
  const { char } = ctx.actor;
  const myEntity = ctx.st.entities?.find((e) => e.id === char.id);
  const grapplerId = myEntity?.grappled_by;
  if (!char.conditions.includes('grappled') && !myEntity?.conditions.includes('grappled')) {
    return { rejected: 'You are not grappled.' };
  }
  if (!grapplerId) {
    updatePcActor(ctx, { conditions: char.conditions.filter((c) => c !== 'grappled') });
    ctx.narrative = 'You break free of the grapple.';
    ctx.usedInitiative = true;
    return;
  }
  const grappler = ctx.st.entities?.find((e) => e.id === grapplerId);
  // SRD monster grapples (e.g. Griffon Rend) specify a fixed escape DC; the
  // grappled creature beats that static DC rather than making a contested
  // check. Fall back to the contested STR(Athletics) check vs the grappler
  // (the PC-grapple path) when no escape DC is stamped.
  const escapeDc = myEntity?.grapple_escape_dc;
  const grapplerEnemy = grappler?.isEnemy ? getEnemyById(ctx.seed, grapplerId) : null;
  const grapplerStrMod = grapplerEnemy ? abilityMod(grapplerEnemy.toHit) : 0;
  // The target number the escape check must EXCEED: a fixed DC means "meet or
  // beat", so subtract 1 (the `>` comparison below then matches "≥ DC").
  const grapplerRoll = escapeDc != null ? escapeDc - 1 : d(20) + grapplerStrMod;

  // Pick the better of STR (Athletics) / DEX (Acrobatics) by modifier (RAW lets
  // the grappled creature choose), then resolve once through skillCheck so the
  // escape gains Expertise / Jack of All Trades / Reliable Talent / Halfling
  // Lucky + the exhaustion penalty. Indomitable Might floors a STR check after.
  const prof = profBonus(char.level);
  const isProf = (skill: string) =>
    (char.skill_proficiencies ?? []).some((s) => s.toLowerCase() === skill);
  const athProf = isProf('athletics');
  const acrProf = isProf('acrobatics');
  const athMod =
    abilityMod(char.str) + (athProf ? prof : 0) + (hasExpertise(char, 'athletics') ? prof : 0);
  const acrMod =
    abilityMod(char.dex) + (acrProf ? prof : 0) + (hasExpertise(char, 'acrobatics') ? prof : 0);
  const useAthletics = athMod >= acrMod;
  const escapeSkill = useAthletics ? 'athletics' : 'acrobatics';
  const gDie = consumeGuidanceDie(ctx);
  const escapeCheck = applyGuidanceDie(
    skillCheck(
      useAthletics ? char.str : char.dex,
      grapplerRoll + 1,
      useAthletics ? athProf : acrProf,
      char.level,
      false,
      hasExpertise(char, escapeSkill),
      hasJackOfAllTrades(char),
      false,
      char.species === 'halfling',
      hasReliableTalent(char),
      false,
      d20TestPenalty(char)
    ),
    gDie,
    grapplerRoll + 1
  );
  const myRoll = useAthletics ? applyIndomitableMight(char, escapeCheck.total) : escapeCheck.total;
  const skillUsed = useAthletics ? 'Athletics' : 'Acrobatics';
  // Display the target as a static DC for a monster grapple, or the grappler's
  // contested roll otherwise.
  const target = escapeDc != null ? `DC ${escapeDc}` : `${grapplerRoll}`;

  ctx.usedInitiative = true;
  if (myRoll > grapplerRoll) {
    updatePcActor(ctx, { conditions: char.conditions.filter((c) => c !== 'grappled') });
    ctx.st = {
      ...ctx.st,
      entities: (ctx.st.entities ?? []).map((e) =>
        e.id === char.id
          ? {
              ...e,
              conditions: e.conditions.filter((c) => c !== 'grappled'),
              grappled_by: undefined,
              grapple_escape_dc: undefined,
            }
          : e
      ),
    };
    ctx.narrative = `You break free of the grapple! (${skillUsed} ${myRoll} vs ${target})`;
  } else {
    ctx.narrative = `You strain against the grapple but cannot escape. (${skillUsed} ${myRoll} vs ${target})`;
  }
};

/** `shove`: SRD Unarmed Strike — Shove (Prone by default, or push 5 ft). */
export const handleShove: ActionHandler<{
  type: 'shove';
  targetEnemyId?: string;
  mode?: 'prone' | 'push';
}> = (ctx, action) =>
  resolveUnarmedOption(ctx, action.targetEnemyId, action.mode === 'push' ? 'push' : 'prone');
