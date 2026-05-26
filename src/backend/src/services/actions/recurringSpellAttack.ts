import type { ActionContext, ActionHandler } from './types.js';
import type { Character, Enemy, Spell } from '../../types.js';
import {
  abilityMod,
  resolveSpellAttack,
  rollCritical,
  rollDice,
  upcastDamage,
} from '../rulesEngine.js';
import { applySingleTargetDamage } from './castSpell/applyDamage.js';
import { updatePcActor } from './actor.js';

type Recurring = NonNullable<Character['recurring_attack']>;

// A minimal Spell shell so applySingleTargetDamage can read damageType (for the
// resistance multiplier) + id/name for its kill narrative.
function synthSpell(r: Recurring): Spell {
  return {
    id: r.spellId,
    name: r.name,
    desc: '',
    level: 0,
    castTime: 'action',
    damageType: r.damageType,
  };
}

/**
 * Resolve one swing of a recurring spell attack: a spell attack vs the target's
 * AC, and on a hit, roll `damage`, apply it (resistance + kill via
 * applySingleTargetDamage), and heal the caster `healFraction` of the damage
 * dealt (Vampiric Touch). Shared by the on-cast first attack and the
 * `recurring_spell_attack` re-issue. Mutates ctx.st + ctx.narrative.
 */
export function resolveRecurringAttack(
  ctx: ActionContext,
  recurring: Recurring,
  targetId: string | undefined
): void {
  if (ctx.actor.kind !== 'pc') return;
  const { char } = ctx.actor;
  const target: Enemy | undefined =
    (targetId ? ctx.livingEnemiesInRoom.find((e) => e.id === targetId) : undefined) ??
    ctx.enemy ??
    undefined;
  if (!target) {
    ctx.narrative += ` ${recurring.name} finds no target.`;
    return;
  }
  const atk = resolveSpellAttack(char.level, recurring.castingScore, target.ac);
  if (!atk.hit) {
    ctx.narrative += ` ${recurring.name} misses the ${target.name} (${atk.total} vs AC ${target.ac}).`;
    return;
  }
  const dmg = atk.critical ? rollCritical(recurring.damage) : rollDice(recurring.damage);
  ctx.narrative += ` ${recurring.name} strikes the ${target.name}${atk.critical ? ' (critical!)' : ''} for ${dmg} ${recurring.damageType}.`;
  const before = ctx.st.entities?.find((e) => e.id === target.id && e.isEnemy)?.hp ?? 0;
  applySingleTargetDamage(ctx, target, target.id, synthSpell(recurring), dmg);

  // Vampiric Touch — heal the caster half the damage actually dealt (post-resist).
  if (recurring.healFraction && recurring.healFraction > 0) {
    const after = ctx.st.entities?.find((e) => e.id === target.id && e.isEnemy)?.hp ?? 0;
    const dealt = Math.max(0, before - after);
    const heal = Math.floor(dealt * recurring.healFraction);
    if (heal > 0) {
      const newHp = Math.min(char.max_hp, char.hp + heal);
      char.hp = newHp;
      ctx.st = {
        ...ctx.st,
        entities: (ctx.st.entities ?? []).map((e) =>
          e.id === char.id && !e.isEnemy ? { ...e, hp: newHp } : e
        ),
      };
      ctx.narrative += ` ${char.name} drains ${heal} HP (now ${char.hp}/${char.max_hp}).`;
    }
  }
}

/**
 * Cast-time setup for a recurring-attack spell (Spiritual Weapon, Vampiric
 * Touch): bake the upcast-scaled damage (+ the spellcasting modifier for
 * Spiritual Weapon), record `recurring_attack` on the caster (and concentration
 * when the spell concentrates), and resolve the first attack immediately.
 */
export function runRecurringAttackSpell(
  ctx: ActionContext,
  spell: Spell,
  slotLevel: number,
  castingScore: number,
  targetId: string
): void {
  if (ctx.actor.kind !== 'pc') return;
  const { char } = ctx.actor;
  let dmgExpr = upcastDamage(spell, slotLevel) || spell.damage || '1d8';
  if (spell.recurringAddSpellMod) {
    const mod = abilityMod(castingScore);
    if (mod !== 0) dmgExpr = `${dmgExpr}${mod > 0 ? '+' : ''}${mod}`;
  }
  const recurring: Recurring = {
    spellId: spell.id,
    name: spell.name,
    damage: dmgExpr,
    damageType: spell.damageType ?? 'force',
    castingScore,
    cost: spell.recurringAttackCost ?? 'action',
    healFraction: spell.recurringHealFraction,
    rounds_left: spell.durationRounds ?? 10,
    concentration: spell.concentration,
  };
  updatePcActor(ctx, {
    recurring_attack: recurring,
    ...(spell.concentration
      ? { concentrating_on: { spellId: spell.id, rounds_left: recurring.rounds_left } }
      : {}),
  });
  ctx.narrative = `${char.name} casts ${spell.name}!`;
  resolveRecurringAttack(ctx, recurring, targetId);
  // A bonus-action cast (Spiritual Weapon) leaves the PC their action; an
  // action cast (Vampiric Touch) ends the turn.
  if (spell.castTime !== 'bonus_action') ctx.usedInitiative = true;
}

/**
 * `recurring_spell_attack`: re-issue an active recurring spell attack at a
 * target on a later turn, for the spell's recurring cost (a Bonus Action for
 * Spiritual Weapon; a Magic action for Vampiric Touch).
 */
export const handleRecurringSpellAttack: ActionHandler<{
  type: 'recurring_spell_attack';
  targetEnemyId?: string;
}> = (ctx, action) => {
  if (!ctx.st.combat_active) return { rejected: 'You can only do that in combat.' };
  if (ctx.actor.kind !== 'pc') return { rejected: 'Only PCs can do that.' };
  const pc = ctx.actor;
  const recurring = pc.char.recurring_attack;
  if (!recurring) return { rejected: 'You have no active spell attack to repeat.' };
  if (recurring.cost === 'bonus_action' && pc.char.turn_actions.bonus_action_used) {
    return { rejected: 'Bonus action already used this turn.' };
  }
  if (recurring.cost === 'action' && pc.char.turn_actions.action_used) {
    return { rejected: 'You have already used your action this turn.' };
  }
  if (!ctx.enemy || !ctx.enemyAlive) return { rejected: 'No target in range.' };
  ctx.narrative = '';
  resolveRecurringAttack(ctx, recurring, action.targetEnemyId);
  pc.char.turn_actions = {
    ...pc.char.turn_actions,
    ...(recurring.cost === 'bonus_action' ? { bonus_action_used: true } : { action_used: true }),
  };
  if (recurring.cost === 'action') ctx.usedInitiative = true;
};
