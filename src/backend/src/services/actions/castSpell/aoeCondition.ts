import { TURN_LOOP_MANAGED_CONDITIONS, getEnemyById } from '../../gameEngine.js';
import {
  entitiesInBlast,
  entitiesInCone,
  entitiesInCube,
  entitiesInLine,
} from '../../gridEngine.js';
import type { ActionContext } from '../types.js';
import type { Spell } from '../../../types.js';
import { concentrationRoundsFor } from './utils.js';
import { fmt } from '../../narrativeFmt.js';
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

  // Epicenter: the targeted enemy's cell (Confusion's 10-ft sphere anchors on
  // the primary target; a Cone/Cube/Line extends from the caster toward it).
  const epicenter =
    ctx.st.entities.find((e) => e.id === ctx.enemy?.id && e.isEnemy)?.pos ??
    ctx.st.entities.find((e) => e.isEnemy)?.pos;
  if (!epicenter) return false;
  const casterPos = ctx.st.entities.find((e) => e.id === char.id)?.pos;

  // Same shape resolution as the AoE damage branch (Color Spray is a Cone from
  // the caster; Confusion a Sphere on the target).
  const aoeShape = spell.aoeShape ?? 'sphere';
  const blastTargets =
    aoeShape === 'cone' && casterPos
      ? entitiesInCone(casterPos, epicenter, aoeBR, ctx.st.entities)
      : aoeShape === 'cube' && casterPos
        ? entitiesInCube(casterPos, epicenter, aoeBR, ctx.st.entities)
        : aoeShape === 'line' && casterPos
          ? entitiesInLine(casterPos, epicenter, aoeBR, ctx.st.entities)
          : entitiesInBlast(epicenter, aoeBR, ctx.st.entities);
  ctx.narrative += ` ${fmt.note(`[AOE ${aoeBR}ft ${aoeShape}]`)}`;
  // Stamp a finite duration only for non-concentration AoE-condition spells
  // (Color Spray's 1-round Blinded). Concentration ones (Confusion) leave it
  // unset — concentration is their timer — as do turn-loop-managed conditions.
  const stampDuration =
    !spell.concentration && spell.conditionDuration && !TURN_LOOP_MANAGED_CONDITIONS.has(cond)
      ? spell.conditionDuration
      : undefined;
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
          ? {
              ...e,
              conditions: [...e.conditions.filter((c) => c !== cond), cond],
              ...(stampDuration !== undefined
                ? { condition_durations: { ...e.condition_durations, [cond]: stampDuration } }
                : {}),
              // SRD "save ends" (a future AoE save-ends condition): stamp the
              // recurring end-of-turn save (ability = the spell's save, DC = the
              // caster's spell save DC).
              ...(spell.conditionSaveEnds && spell.savingThrow
                ? {
                    save_ends: { ...e.save_ends, [cond]: { ability: spell.savingThrow, dc } },
                    save_ends_acted: (e.save_ends_acted ?? []).filter((c) => c !== cond),
                  }
                : {}),
              // SRD Charmed / Frightened — record the caster as the source for
              // the enemy AI (avoid the charmer / keep distance from the fear).
              ...(cond === 'charmed' ? { charmer_id: char.id } : {}),
              ...(cond === 'frightened' ? { frightened_by: char.id } : {}),
              // Confusion: a freshly-confused creature hasn't taken a confused
              // turn yet, so its first turn skips the end-of-turn re-save.
              ...(cond === 'confused' ? { confused_acted: false } : {}),
            }
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
