import type { ActionContext } from '../types.js';
import type { Spell } from '../../../types.js';
import { concentrationRoundsFor } from './utils.js';
import { entitiesInBlast } from '../../gridEngine.js';
import { fmt } from '../../narrativeFmt.js';
import { getEnemyById } from '../../gameEngine.js';
import { rollConditionSave } from '../../rulesEngine.js';

/**
 * AoE condition branch (opt-in via `spell.aoeCondition`). Applies the spell's
 * `condition` to EVERY hostile in the blast that fails the save — unlike the
 * single-target save path (Hold Person etc.), which conditions only the primary
 * target. Concentration is linked with the spell save DC stamped on it so the
 * effect's ongoing resolution can re-roll a save away from the cast site
 * (Confusion: each confused creature re-saves on its turn to shake the effect).
 *
 * Returns true when it handled the cast (so the dispatcher can stop). Returns
 * false to fall through to the standard branches when the spell isn't a
 * grid AoE condition (no blast radius / no entities / not offensive).
 */
export function runAoeConditionSpell(ctx: ActionContext, spell: Spell, dc: number): boolean {
  if (ctx.actor.kind !== 'pc') return false;
  const { char } = ctx.actor;
  const aoeBR = spell.blastRadius;
  const cond = spell.condition;
  if (!aoeBR || !ctx.st.entities || !cond || !spell.savingThrow) return false;

  // Sphere centered on the targeted enemy's cell (Confusion: a point you choose
  // within range — pansori anchors it on the primary target).
  const epicenter =
    ctx.st.entities.find((e) => e.id === ctx.enemy?.id && e.isEnemy)?.pos ??
    ctx.st.entities.find((e) => e.isEnemy)?.pos;
  if (!epicenter) return false;

  const blastTargets = entitiesInBlast(epicenter, aoeBR, ctx.st.entities);
  ctx.narrative += ` ${fmt.note(`[AOE ${aoeBR}ft sphere]`)}`;
  const affected: string[] = [];
  for (const target of blastTargets) {
    if (!target.isEnemy) continue; // pansori MVP conditions only enemies
    const foe = getEnemyById(ctx.seed, target.id);
    const name = foe?.name ?? target.id;
    if (foe?.condition_immunities?.includes(cond)) {
      ctx.narrative += ` ${name}: immune.`;
      continue;
    }
    const score = (foe as unknown as Record<string, number>)?.[spell.savingThrow] ?? 10;
    const failed = rollConditionSave(
      spell.savingThrow,
      score,
      dc,
      false,
      char.level,
      0,
      target.conditions ?? []
    );
    if (!failed) {
      ctx.narrative += ` ${name}: saves.`;
      continue;
    }
    ctx.st = {
      ...ctx.st,
      entities: (ctx.st.entities ?? []).map((e) =>
        e.id === target.id && e.isEnemy
          ? { ...e, conditions: [...e.conditions.filter((c) => c !== cond), cond] }
          : e
      ),
    };
    affected.push(name);
  }

  ctx.narrative += affected.length
    ? ` ${affected.join(', ')} ${affected.length === 1 ? 'is' : 'are'} ${cond}!`
    : ` No creature is affected.`;

  // Confusion is concentration — stamp the DC so each confused creature can
  // re-save against it on its turn (resolved in the enemy turn loop).
  if (spell.concentration && affected.length) {
    char.concentrating_on = {
      spellId: spell.id,
      condition: cond,
      rounds_left: concentrationRoundsFor(spell),
      save_dc: dc,
    };
  }
  ctx.usedInitiative = true;
  return true;
}
