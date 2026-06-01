import type { CombatEntity, Spell } from '../../../types.js';
import type { ActionContext } from '../types.js';
import { updatePcActor } from '../actor.js';

/**
 * SRD Enlarge/Reduce (L2 Transmutation). One concentration spell with two
 * opposite effects; pansori picks the effect from the target side:
 *   • a party member (or self) is ENLARGED — its weapon attacks deal +1d4
 *     (and Advantage on STR checks/saves, narrated);
 *   • an enemy is REDUCED — its weapon attacks deal -1d4 and it has
 *     Disadvantage on STR saves.
 * The ±1d4 is applied at the weapon-damage sites (resolveOneAttack /
 * computeEnemyAttack) keyed off the `enlarged` / `reduced` condition. The
 * condition is Concentration-linked (breakConcentration strips it). RAW lets
 * you choose either effect for either target and an unwilling creature saves;
 * those are deferred — the target side selects the effect, no save.
 *
 * Returns true when handled (a no-op `false` for non-Enlarge/Reduce spells).
 */
export function runEnlargeReduce(
  ctx: ActionContext,
  action: { type: 'cast_spell'; spellId: string; targetCharId?: string; targetEnemyId?: string },
  spell: Spell
): boolean {
  if (!spell.enlargeReduce || ctx.actor.kind !== 'pc') return false;
  const caster = ctx.actor.char;
  const addEntCond = (e: CombatEntity, cond: string): CombatEntity => ({
    ...e,
    conditions: e.conditions.includes(cond) ? e.conditions : [...e.conditions, cond],
    condition_durations: { ...e.condition_durations, [cond]: 100 },
  });

  // An explicit enemy target → Reduce; otherwise a party member (default self) → Enlarge.
  const enemyId = action.targetEnemyId;
  const enemyEnt = enemyId
    ? ctx.st.entities?.find((e) => e.id === enemyId && e.isEnemy)
    : undefined;
  if (enemyEnt) {
    ctx.st = {
      ...ctx.st,
      entities: (ctx.st.entities ?? []).map((e) =>
        e.id === enemyId && e.isEnemy ? addEntCond(e, 'reduced') : e
      ),
    };
    updatePcActor(ctx, {
      ...caster,
      concentrating_on: {
        spellId: spell.id,
        condition: 'reduced',
        rounds_left: spell.durationRounds ?? 10,
      },
    });
    ctx.commitChar();
    ctx.narrative = `🪄 ${caster.name} casts ${spell.name} — ${enemyEnt.id === enemyId ? 'the target' : 'the enemy'} shrinks (Reduced): its weapon attacks deal -1d4 and it has Disadvantage on Strength saves.`;
    ctx.usedInitiative = true;
    return true;
  }

  // Enlarge a willing party member (default the caster).
  const targetId = action.targetCharId ?? caster.id;
  const targetName = ctx.st.characters.find((c) => c.id === targetId)?.name ?? caster.name;
  const addCharCond = (cond: string) => (c: typeof caster) => ({
    ...c,
    conditions: c.conditions.includes(cond) ? c.conditions : [...c.conditions, cond],
    condition_durations: { ...(c.condition_durations ?? {}), [cond]: 100 },
  });
  ctx.st = {
    ...ctx.st,
    characters: ctx.st.characters.map((c) => (c.id === targetId ? addCharCond('enlarged')(c) : c)),
    entities: (ctx.st.entities ?? []).map((e) =>
      e.id === targetId && !e.isEnemy ? addEntCond(e, 'enlarged') : e
    ),
  };
  // The caster concentrates regardless of who was enlarged.
  const casterAfter = targetId === caster.id ? addCharCond('enlarged')(caster) : caster;
  updatePcActor(ctx, {
    ...casterAfter,
    concentrating_on: {
      spellId: spell.id,
      condition: 'enlarged',
      rounds_left: spell.durationRounds ?? 10,
    },
  });
  ctx.commitChar();
  ctx.narrative = `🪄 ${caster.name} casts ${spell.name} — ${targetName} grows (Enlarged): weapon attacks deal +1d4 and Advantage on Strength checks and saves.`;
  ctx.usedInitiative = true;
  return true;
}
