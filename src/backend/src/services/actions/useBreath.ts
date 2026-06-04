import { rollConditionSave, rollDice } from '../rulesEngine.js';
import type { ActionHandler } from './types.js';
import type { Spell } from '../../types.js';
import { applySingleTargetDamage } from './castSpell/applyDamage.js';
import { entitiesInCone } from '../gridEngine.js';
import { getEnemyById } from '../gameEngine.js';

// A minimal Spell shell for applySingleTargetDamage (reads id/name/damageType).
// The id is deliberately NOT an evocation id, so no Evoker damage bonus bleeds
// onto a Transmutation breath.
function synthBreath(damageType: string): Spell {
  return {
    id: 'dragons_breath_exhale',
    name: "Dragon's Breath",
    desc: '',
    level: 2,
    castTime: 'action',
    damageType,
  };
}

/**
 * `use_breath` (SRD Dragon's Breath): the holder of a `granted_breath` exhales a
 * 15-ft cone toward the aimed enemy — its action. One damage roll, shared across
 * the cone; each enemy in it makes a DEX save vs the granting caster's spell save
 * DC, taking full damage on a failure or half on a success. Per-enemy resistance
 * + kill resolution reuse `applySingleTargetDamage`. The breath persists for the
 * spell's duration (concentration), so it can be re-issued each turn.
 */
export const handleUseBreath: ActionHandler<{ type: 'use_breath'; targetEnemyId?: string }> = (
  ctx,
  action
) => {
  if (!ctx.st.combat_active) return { rejected: 'You can only do that in combat.' };
  if (ctx.actor.kind !== 'pc') return { rejected: 'Only PCs can do that.' };
  const pc = ctx.actor;
  const gb = pc.char.granted_breath;
  if (!gb) return { rejected: 'You have no breath weapon to exhale.' };
  if (pc.char.turn_actions.action_used) {
    return { rejected: 'You have already used your action this turn.' };
  }
  if (!ctx.enemy || !ctx.enemyAlive) return { rejected: 'No target in range.' };

  const entities = ctx.st.entities ?? [];
  const casterPos = entities.find((e) => e.id === pc.char.id && !e.isEnemy)?.pos;
  const aimId = action.targetEnemyId ?? ctx.enemy.id;
  const aimPos = entities.find((e) => e.id === aimId && e.isEnemy)?.pos;
  if (!casterPos || !aimPos) return { rejected: 'There is no clear line for the breath.' };

  const cone = entitiesInCone(casterPos, aimPos, 15, entities).filter((e) => e.isEnemy && e.hp > 0);
  const synth = synthBreath(gb.damageType);
  const rolled = rollDice(gb.dice);
  ctx.narrative = `${pc.char.name} exhales a 15-ft cone of ${gb.damageType}!`;
  if (cone.length === 0) ctx.narrative += ' Nothing is caught in the cone.';
  for (const ent of cone) {
    if (!ctx.st.combat_active) break; // a kill cleared the room mid-cone
    const enemy = getEnemyById(ctx.seed, ent.id);
    if (!enemy) continue;
    const dexScore = (enemy as unknown as Record<string, number>).dex ?? 10;
    const failed = rollConditionSave('dex', dexScore, gb.saveDc, false, 1, 0, ent.conditions ?? []);
    const dmg = failed ? rolled : Math.floor(rolled / 2);
    ctx.narrative += ` ${enemy.name} ${failed ? 'fails' : 'saves'}.`;
    applySingleTargetDamage(ctx, enemy, ent.id, synth, dmg);
  }

  pc.char.turn_actions = { ...pc.char.turn_actions, action_used: true };
  ctx.usedInitiative = true;
};
