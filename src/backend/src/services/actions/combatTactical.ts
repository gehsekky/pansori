import { abilityMod, d, d20TestPenalty, profBonus, skillCheck } from '../rulesEngine.js';
import {
  applyIndomitableMight,
  hasExpertise,
  hasJackOfAllTrades,
  hasReliableTalent,
} from '../multiclass.js';
import type { ActionHandler } from './types.js';
import { composeNow } from '../narrative/compose.js';
import { distanceFeet } from '../gridEngine.js';
import { getEnemyById } from '../gameEngine.js';
import { updatePcActor } from './actor.js';

/**
 * `grapple`: 2024 PHB Unarmed Strike: Grapple. Contested STR
 * (Athletics) vs target's better-of-STR-or-DEX. 5 ft reach
 * prerequisite is checked before the action is spent — out-of-reach
 * attempts surface as a free notice. Sets `grappled` condition on
 * the entity and tracks the grappler id (so opportunity-attack
 * sweeps know to drop the grapple when the grappler is incapped).
 */
export const handleGrapple: ActionHandler<{
  type: 'grapple';
  targetEnemyId?: string;
}> = (ctx, action) => {
  if (ctx.actor.kind !== 'pc') return { rejected: 'Only PCs can grapple.' };
  const { char } = ctx.actor;
  if (!ctx.enemyAlive || !ctx.enemy) {
    return { rejected: 'No enemy to grapple.' };
  }
  const targetId = action.targetEnemyId ?? ctx.enemy.id;
  const target = ctx.livingEnemiesInRoom.find((e) => e.id === targetId) ?? ctx.enemy;
  if (ctx.st.entities) {
    const myEnt = ctx.st.entities.find((e) => e.id === char.id);
    const tgtEnt = ctx.st.entities.find((e) => e.id === target.id && e.isEnemy);
    if (myEnt && tgtEnt && distanceFeet(myEnt.pos, tgtEnt.pos) > 5) {
      return {
        rejected: `Out of reach — Grapple needs the target within 5 ft. Move closer first.`,
      };
    }
  }
  if (target.condition_immunities?.includes('grappled')) {
    // RAW: the action was committed (unarmed strike attempt); target's
    // immunity merely negates the grapple effect. Dispatcher deducts.
    ctx.narrative = `The ${target.name} cannot be grappled (condition immunity).`;
    ctx.usedInitiative = true;
    return;
  }
  const enemyStr = abilityMod(target.toHit);
  const enemyDex = abilityMod(target.dex ?? 10);
  const enemyRoll = d(20) + Math.max(enemyStr, enemyDex);
  // STR (Athletics) check routed through skillCheck so it picks up Expertise /
  // Jack of All Trades / Reliable Talent / Halfling Lucky + the exhaustion
  // penalty; Indomitable Might (Barbarian L18) floors the total at STR after.
  const athProf = (char.skill_proficiencies ?? []).some((s) => s.toLowerCase() === 'athletics');
  const grappleCheck = skillCheck(
    char.str,
    enemyRoll + 1,
    athProf,
    char.level,
    false,
    hasExpertise(char, 'athletics'),
    hasJackOfAllTrades(char),
    false,
    char.species === 'halfling',
    hasReliableTalent(char),
    false,
    d20TestPenalty(char)
  );
  const playerRoll = applyIndomitableMight(char, grappleCheck.total);
  ctx.usedInitiative = true;
  if (playerRoll > enemyRoll) {
    ctx.st = {
      ...ctx.st,
      entities: (ctx.st.entities ?? []).map((e) =>
        e.id === target.id && e.isEnemy
          ? {
              ...e,
              conditions: [...e.conditions.filter((c) => c !== 'grappled'), 'grappled'],
              grappled_by: char.id,
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
      prose: `You grapple the ${target.name}! (${playerRoll} vs ${enemyRoll}) They are GRAPPLED — speed 0, your attacks have advantage.`,
    });
  } else {
    ctx.narrative = `The ${target.name} breaks free of your grapple attempt. (${playerRoll} vs ${enemyRoll})`;
  }
};

/**
 * `try_escape_grapple`: SRD 5.2.1 p.16 — grappled creature spends its
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
  const escapeCheck = skillCheck(
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

/**
 * `shove`: 2024 PHB Unarmed Strike: Shove. Contested STR (Athletics)
 * vs target's better-of-STR-or-DEX. 5 ft reach prerequisite enforced
 * up front. On success: knocks the target prone (PHB p.193 prone
 * condition — melee attackers gain advantage, ranged attackers get
 * disadvantage).
 */
export const handleShove: ActionHandler<{
  type: 'shove';
  targetEnemyId?: string;
}> = (ctx, action) => {
  if (ctx.actor.kind !== 'pc') return { rejected: 'Only PCs can shove.' };
  const { char } = ctx.actor;
  if (!ctx.enemyAlive || !ctx.enemy) {
    return { rejected: 'No enemy to shove.' };
  }
  const targetId = action.targetEnemyId ?? ctx.enemy.id;
  const target = ctx.livingEnemiesInRoom.find((e) => e.id === targetId) ?? ctx.enemy;
  if (ctx.st.entities) {
    const myEnt = ctx.st.entities.find((e) => e.id === char.id);
    const tgtEnt = ctx.st.entities.find((e) => e.id === target.id && e.isEnemy);
    if (myEnt && tgtEnt && distanceFeet(myEnt.pos, tgtEnt.pos) > 5) {
      return { rejected: `Out of reach — Shove needs the target within 5 ft. Move closer first.` };
    }
  }
  if (target.condition_immunities?.includes('prone')) {
    // RAW: the action was committed; target's prone-immunity negates effect.
    ctx.narrative = `The ${target.name} cannot be knocked prone (condition immunity).`;
    ctx.usedInitiative = true;
    return;
  }
  const enemyStr = abilityMod(target.toHit);
  const enemyDex = abilityMod(target.dex ?? 10);
  const enemyRoll = d(20) + Math.max(enemyStr, enemyDex);
  // STR (Athletics) check routed through skillCheck so it picks up Expertise /
  // Jack of All Trades / Reliable Talent / Halfling Lucky + the exhaustion
  // penalty; Indomitable Might (Barbarian L18) floors the total at STR after.
  const athProf = (char.skill_proficiencies ?? []).some((s) => s.toLowerCase() === 'athletics');
  const grappleCheck = skillCheck(
    char.str,
    enemyRoll + 1,
    athProf,
    char.level,
    false,
    hasExpertise(char, 'athletics'),
    hasJackOfAllTrades(char),
    false,
    char.species === 'halfling',
    hasReliableTalent(char),
    false,
    d20TestPenalty(char)
  );
  const playerRoll = applyIndomitableMight(char, grappleCheck.total);
  ctx.usedInitiative = true;
  if (playerRoll > enemyRoll) {
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
      prose: `You shove the ${target.name} to the ground! (${playerRoll} vs ${enemyRoll}) They are PRONE — melee attacks against them have advantage, ranged attacks have disadvantage.`,
    });
  } else {
    ctx.narrative = `The ${target.name} resists your shove. (${playerRoll} vs ${enemyRoll})`;
  }
};
