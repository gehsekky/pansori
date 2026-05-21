import { abilityMod, d, profBonus } from '../rulesEngine.js';
import { getEnemyById, pushEvent } from '../gameEngine.js';
import type { ActionHandler } from './types.js';
import { distanceFeet } from '../gridEngine.js';

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
  if (!ctx.enemyAlive || !ctx.enemy) {
    ctx.narrative = 'No enemy to grapple.';
    return;
  }
  const targetId = action.targetEnemyId ?? ctx.enemy.id;
  const target = ctx.livingEnemiesInRoom.find((e) => e.id === targetId) ?? ctx.enemy;
  if (ctx.st.entities) {
    const myEnt = ctx.st.entities.find((e) => e.id === ctx.char.id);
    const tgtEnt = ctx.st.entities.find((e) => e.id === target.id && e.isEnemy);
    if (myEnt && tgtEnt && distanceFeet(myEnt.pos, tgtEnt.pos) > 5) {
      ctx.narrative = `Out of reach — Grapple needs the target within 5 ft. Move closer first.`;
      return;
    }
  }
  if (target.condition_immunities?.includes('grappled')) {
    ctx.narrative = `The ${target.name} cannot be grappled (condition immunity).`;
    ctx.char = { ...ctx.char, turn_actions: { ...ctx.char.turn_actions, action_used: true } };
    ctx.usedInitiative = true;
    return;
  }
  const athProf = (ctx.context.classSkills[ctx.char.character_class] ?? []).includes('athletics');
  const playerRoll = d(20) + abilityMod(ctx.char.str) + (athProf ? profBonus(ctx.char.level) : 0);
  const enemyStr = abilityMod(target.toHit);
  const enemyDex = abilityMod(target.dex ?? 10);
  const enemyRoll = d(20) + Math.max(enemyStr, enemyDex);
  ctx.char = { ...ctx.char, turn_actions: { ...ctx.char.turn_actions, action_used: true } };
  ctx.usedInitiative = true;
  if (playerRoll > enemyRoll) {
    ctx.st = {
      ...ctx.st,
      entities: (ctx.st.entities ?? []).map((e) =>
        e.id === target.id && e.isEnemy
          ? {
              ...e,
              conditions: [...e.conditions.filter((c) => c !== 'grappled'), 'grappled'],
              grappled_by: ctx.char.id,
            }
          : e
      ),
    };
    ctx.st = pushEvent(ctx.st, {
      kind: 'condition_applied',
      targetId: target.id,
      targetName: target.name,
      condition: 'grappled',
      source: 'Grapple',
      round: ctx.st.round ?? 1,
    });
    ctx.narrative = `You grapple the ${target.name}! (${playerRoll} vs ${enemyRoll}) They are GRAPPLED — speed 0, your attacks have advantage.`;
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
  const myEntity = ctx.st.entities?.find((e) => e.id === ctx.char.id);
  const grapplerId = myEntity?.grappled_by;
  if (!ctx.char.conditions.includes('grappled') && !myEntity?.conditions.includes('grappled')) {
    ctx.narrative = 'You are not grappled.';
    return;
  }
  if (!grapplerId) {
    ctx.char = {
      ...ctx.char,
      conditions: ctx.char.conditions.filter((c) => c !== 'grappled'),
      turn_actions: { ...ctx.char.turn_actions, action_used: true },
    };
    ctx.narrative = 'You break free of the grapple.';
    ctx.usedInitiative = true;
    return;
  }
  const grappler = ctx.st.entities?.find((e) => e.id === grapplerId);
  const grapplerEnemy = grappler?.isEnemy ? getEnemyById(ctx.seed, grapplerId) : null;
  const grapplerStrMod = grapplerEnemy ? abilityMod(grapplerEnemy.toHit) : 0;
  const grapplerRoll = d(20) + grapplerStrMod;

  const athProf = (ctx.context.classSkills[ctx.char.character_class] ?? []).includes('athletics');
  const acrProf = (ctx.context.classSkills[ctx.char.character_class] ?? []).includes('acrobatics');
  const athRoll = d(20) + abilityMod(ctx.char.str) + (athProf ? profBonus(ctx.char.level) : 0);
  const acrRoll = d(20) + abilityMod(ctx.char.dex) + (acrProf ? profBonus(ctx.char.level) : 0);
  const myRoll = Math.max(athRoll, acrRoll);
  const skillUsed = athRoll >= acrRoll ? 'Athletics' : 'Acrobatics';

  ctx.char = { ...ctx.char, turn_actions: { ...ctx.char.turn_actions, action_used: true } };
  ctx.usedInitiative = true;
  if (myRoll > grapplerRoll) {
    ctx.char = { ...ctx.char, conditions: ctx.char.conditions.filter((c) => c !== 'grappled') };
    ctx.st = {
      ...ctx.st,
      entities: (ctx.st.entities ?? []).map((e) =>
        e.id === ctx.char.id
          ? {
              ...e,
              conditions: e.conditions.filter((c) => c !== 'grappled'),
              grappled_by: undefined,
            }
          : e
      ),
    };
    ctx.narrative = `You break free of the grapple! (${skillUsed} ${myRoll} vs ${grapplerRoll})`;
  } else {
    ctx.narrative = `You strain against the grapple but cannot escape. (${skillUsed} ${myRoll} vs ${grapplerRoll})`;
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
  if (!ctx.enemyAlive || !ctx.enemy) {
    ctx.narrative = 'No enemy to shove.';
    return;
  }
  const targetId = action.targetEnemyId ?? ctx.enemy.id;
  const target = ctx.livingEnemiesInRoom.find((e) => e.id === targetId) ?? ctx.enemy;
  if (ctx.st.entities) {
    const myEnt = ctx.st.entities.find((e) => e.id === ctx.char.id);
    const tgtEnt = ctx.st.entities.find((e) => e.id === target.id && e.isEnemy);
    if (myEnt && tgtEnt && distanceFeet(myEnt.pos, tgtEnt.pos) > 5) {
      ctx.narrative = `Out of reach — Shove needs the target within 5 ft. Move closer first.`;
      return;
    }
  }
  if (target.condition_immunities?.includes('prone')) {
    ctx.narrative = `The ${target.name} cannot be knocked prone (condition immunity).`;
    ctx.char = { ...ctx.char, turn_actions: { ...ctx.char.turn_actions, action_used: true } };
    ctx.usedInitiative = true;
    return;
  }
  const athProf = (ctx.context.classSkills[ctx.char.character_class] ?? []).includes('athletics');
  const playerRoll = d(20) + abilityMod(ctx.char.str) + (athProf ? profBonus(ctx.char.level) : 0);
  const enemyStr = abilityMod(target.toHit);
  const enemyDex = abilityMod(target.dex ?? 10);
  const enemyRoll = d(20) + Math.max(enemyStr, enemyDex);
  ctx.char = { ...ctx.char, turn_actions: { ...ctx.char.turn_actions, action_used: true } };
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
    ctx.st = pushEvent(ctx.st, {
      kind: 'condition_applied',
      targetId: target.id,
      targetName: target.name,
      condition: 'prone',
      source: 'Shove',
      round: ctx.st.round ?? 1,
    });
    ctx.narrative = `You shove the ${target.name} to the ground! (${playerRoll} vs ${enemyRoll}) They are PRONE — melee attacks against them have advantage, ranged attacks have disadvantage.`;
  } else {
    ctx.narrative = `The ${target.name} resists your shove. (${playerRoll} vs ${enemyRoll})`;
  }
};
