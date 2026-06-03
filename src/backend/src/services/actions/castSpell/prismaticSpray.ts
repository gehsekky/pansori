import type { Enemy, Spell } from '../../../types.js';
import { coverBonus, entitiesInCone, posEqual } from '../../gridEngine.js';
import { rollConditionSave, rollDice } from '../../rulesEngine.js';
import type { ActionContext } from '../types.js';
import { applySingleTargetDamage } from './applyDamage.js';
import { fmt } from '../../narrativeFmt.js';
import { getEnemyById } from '../../gameEngine.js';

// SRD Prismatic Spray (L7 Evocation) — eight rays of light in a 60-ft cone.
// Each creature makes ONE Dexterity save; then 1d8 selects which ray strikes it:
//   1 Red / 2 Orange / 3 Yellow / 4 Green / 5 Blue → 12d6 Fire / Acid /
//       Lightning / Poison / Cold, save-for-half.
//   6 Indigo  → Restrained (CON save-ends). RAW escalates to Petrified after
//       three failures; the petrify track is deferred.
//   7 Violet  → Blinded (WIS save-ends). RAW also teleports the target to
//       another plane on a failed follow-up; the teleport is deferred.
//   8 Special → struck by two rays (roll twice, rerolling any 8).
// Damage rays reuse the single-target damage applicator (resistance + kill / XP
// / drops handling); condition rays stamp a save-ends condition on the entity,
// mirroring the save-spell path. Allies caught in the cone are not modeled (the
// cone fires forward from the caster) — a documented simplification.

const RAY_DAMAGE_TYPE: Record<number, string> = {
  1: 'fire',
  2: 'acid',
  3: 'lightning',
  4: 'poison',
  5: 'cold',
};

const RAY_LABEL: Record<number, string> = {
  1: 'red',
  2: 'orange',
  3: 'yellow',
  4: 'green',
  5: 'blue',
  6: 'indigo',
  7: 'violet',
};

// One 1d8; on an 8 the target is struck by two rays (reroll 8s), so return two
// ray values in 1–7. Otherwise a single ray.
function rollRays(): number[] {
  const r = rollDice('1d8');
  if (r < 8) return [r];
  const draw = (): number => {
    let v = rollDice('1d8');
    while (v === 8) v = rollDice('1d8');
    return v;
  };
  return [draw(), draw()];
}

function enemyHp(ctx: ActionContext, id: string): number {
  return ctx.st.entities?.find((e) => e.id === id && e.isEnemy)?.hp ?? 0;
}

// Stamp a save-ends condition on an enemy entity (mirrors the save-spell path).
function stampSaveEndsCondition(
  ctx: ActionContext,
  enemy: Enemy,
  targetId: string,
  condition: 'restrained' | 'blinded',
  saveAbility: 'con' | 'wis',
  dc: number
): void {
  if (enemy.condition_immunities?.includes(condition)) {
    ctx.narrative += ` ${fmt.note(`[${enemy.name} is immune to ${condition}]`)}`;
    return;
  }
  ctx.st = {
    ...ctx.st,
    entities: (ctx.st.entities ?? []).map((e) => {
      if (e.id !== targetId || !e.isEnemy) return e;
      return {
        ...e,
        conditions: [...e.conditions.filter((c) => c !== condition), condition],
        save_ends: { ...e.save_ends, [condition]: { ability: saveAbility, dc } },
        save_ends_acted: (e.save_ends_acted ?? []).filter((c) => c !== condition),
      };
    }),
  };
  ctx.narrative += ` ${enemy.name} is ${condition}!`;
}

export function runPrismaticSpray(
  ctx: ActionContext,
  spell: Spell,
  // Prismatic Spray doesn't scale with a higher slot (fixed 12d6 per ray).
  _slotLevel: number,
  dc: number
): boolean {
  if (ctx.actor.kind !== 'pc' || !ctx.st.entities) return false;
  const { char } = ctx.actor;
  const coneLen = spell.blastRadius ?? 60;
  const casterPos = ctx.st.entities.find((e) => e.id === char.id)?.pos;
  const aoeAnchor = ctx.enemy?.id;
  const epicenter =
    ctx.st.entities.find((e) => e.id === aoeAnchor && e.isEnemy)?.pos ??
    ctx.st.entities.find((e) => e.isEnemy)?.pos;
  if (!casterPos || !epicenter) return false;

  const targets = entitiesInCone(casterPos, epicenter, coneLen, ctx.st.entities).filter(
    (t) => t.isEnemy
  );
  ctx.narrative += ` ${fmt.note(`[Prismatic Spray ${coneLen}ft cone]`)}`;

  for (const target of targets) {
    const enemy = getEnemyById(ctx.seed, target.id);
    if (!enemy || enemyHp(ctx, target.id) <= 0) continue;

    // One DEX save per target (cover from the cone's epicenter applies, as on
    // the other AoE saves).
    const score = (enemy as unknown as Record<string, number>)[spell.savingThrow ?? 'dex'] ?? 10;
    const obstacles = [
      ...ctx.st.entities
        .filter((e) => e.id !== target.id && !posEqual(e.pos, epicenter))
        .map((e) => e.pos),
      ...ctx.roomObstacleCells,
    ];
    const cover = coverBonus(epicenter, target.pos, obstacles);
    const conds = ctx.st.entities.find((e) => e.id === target.id && e.isEnemy)?.conditions ?? [];
    const failed = rollConditionSave('dex', score, dc, false, char.level, cover, conds);

    const rays = rollRays();
    ctx.narrative += ` ${enemy.name}: ${failed ? 'fails' : 'succeeds'} DEX save —`;

    for (const ray of rays) {
      if (enemyHp(ctx, target.id) <= 0) break; // a prior ray dropped it
      ctx.narrative += ` ${RAY_LABEL[ray]} ray:`;
      if (ray <= 5) {
        const full = rollDice('12d6');
        const eff = failed ? full : Math.floor(full / 2);
        const rayType = RAY_DAMAGE_TYPE[ray];
        applySingleTargetDamage(ctx, enemy, target.id, { ...spell, damageType: rayType }, eff);
      } else if (ray === 6) {
        if (failed) stampSaveEndsCondition(ctx, enemy, target.id, 'restrained', 'con', dc);
        else ctx.narrative += ' no effect.';
      } else {
        if (failed) stampSaveEndsCondition(ctx, enemy, target.id, 'blinded', 'wis', dc);
        else ctx.narrative += ' no effect.';
      }
    }
  }

  ctx.usedInitiative = true;
  return true;
}
