import {
  abilityMod,
  applyDamageMultiplier,
  resolveSpellAttack,
  rollCritical,
  rollDice,
} from '../../rulesEngine.js';
import {
  applyPartyLevelUps,
  endCombatState,
  isRoomCleared,
  splitEncounterXp,
} from '../../gameEngine.js';
import type { ActionContext } from '../types.js';
import type { Spell } from '../../../types.js';
import { composeNow } from '../../narrative/compose.js';
import { pickCastPrefix } from './utils.js';

/**
 * Magic Missile / Eldritch Blast multi-target branch. The action
 * payload carries `targetEnemyIds` (one entry per dart / beam;
 * duplicates fire at the same enemy). Each shot is resolved
 * independently — MM auto-hits, EB rolls an attack vs each target's
 * AC + Agonizing Blast bonus. Per-target damage applies enemy
 * resistance / vulnerability via `applyDamageMultiplier`. Kill
 * resolution + XP split fires per dropped target; the combined
 * outcome is emitted as a single `spell_multi_target` fragment so
 * the LLM gets one sentence, not N.
 *
 * Returns `true` when handled (the orchestrator returns from the
 * cast pipeline). Returns `false` when the spell isn't multi-target.
 */
export function runMultiTargetSpell(
  ctx: ActionContext,
  action: { type: 'cast_spell'; spellId: string; targetEnemyIds?: string[] },
  spell: Spell,
  castingScore: number,
  slotNote: string
): boolean {
  const multiTargets = action.targetEnemyIds;
  const isMultiTargetable = spell.id === 'magic_missile' || spell.id === 'eldritch_blast';
  if (!multiTargets || multiTargets.length <= 1 || !isMultiTargetable) {
    return false;
  }

  const perShot = spell.id === 'magic_missile' ? '1d4+1' : '1d10';
  const agonizingBonusPerBeam =
    spell.id === 'eldritch_blast' && (ctx.char.feats ?? []).includes('agonizing_blast')
      ? Math.max(0, abilityMod(ctx.char.cha))
      : 0;
  let totalDealt = 0;
  const lines: string[] = [];
  const hits: Array<{
    enemyId: string;
    enemyName: string;
    targetAc: number;
    damage: number;
    killed: boolean;
    note?: string;
  }> = [];
  for (let i = 0; i < multiTargets.length; i++) {
    const tid = multiTargets[i];
    const tgtEnemy = ctx.livingEnemiesInRoom.find((e) => e.id === tid);
    const tgtEnt = ctx.st.entities?.find((e) => e.id === tid && e.isEnemy);
    if (!tgtEnemy || !tgtEnt || tgtEnt.hp <= 0) {
      lines.push(`${i + 1}: ${tgtEnemy?.name ?? tid} — already down, fizzles.`);
      continue;
    }
    if (spell.id === 'eldritch_blast') {
      // Each beam rolls its own attack vs the target's AC.
      const atkE = resolveSpellAttack(ctx.char.level, castingScore, tgtEnemy.ac);
      if (!atkE.hit) {
        lines.push(`${i + 1}: ${tgtEnemy.name} — MISS (${atkE.total} vs AC ${tgtEnemy.ac}).`);
        continue;
      }
      const dmgRoll = atkE.critical
        ? rollCritical(perShot) + agonizingBonusPerBeam
        : rollDice(perShot) + agonizingBonusPerBeam;
      const { damage: effDmg, note } = applyDamageMultiplier(dmgRoll, spell.damageType, tgtEnemy);
      const newHp = Math.max(0, tgtEnt.hp - effDmg);
      ctx.st = {
        ...ctx.st,
        entities: (ctx.st.entities ?? []).map((e) =>
          e.id === tid && e.isEnemy ? { ...e, hp: newHp } : e
        ),
      };
      totalDealt += effDmg;
      const killed = newHp <= 0;
      lines.push(
        `${i + 1}: ${tgtEnemy.name} — HIT ${effDmg}${atkE.critical ? ' CRIT' : ''}${note ?? ''}${killed ? ' (killed)' : ''}.`
      );
      hits.push({
        enemyId: tid,
        enemyName: tgtEnemy.name,
        targetAc: tgtEnemy.ac,
        damage: effDmg,
        killed,
        note,
      });
      if (killed) {
        const split = splitEncounterXp(ctx.st, ctx.char.id, tgtEnemy.xp ?? 0);
        ctx.st = split.st;
        ctx.char.xp = (ctx.char.xp || 0) + split.share;
        ctx.st.enemies_killed = [...(ctx.st.enemies_killed ?? []), tid];
      }
    } else {
      // Magic Missile — auto-hit, no attack roll.
      const dmgRoll = rollDice(perShot);
      const { damage: effDmg, note } = applyDamageMultiplier(dmgRoll, spell.damageType, tgtEnemy);
      const newHp = Math.max(0, tgtEnt.hp - effDmg);
      ctx.st = {
        ...ctx.st,
        entities: (ctx.st.entities ?? []).map((e) =>
          e.id === tid && e.isEnemy ? { ...e, hp: newHp } : e
        ),
      };
      totalDealt += effDmg;
      const killed = newHp <= 0;
      lines.push(
        `dart ${i + 1} → ${tgtEnemy.name}: ${effDmg}${note ?? ''}${killed ? ' (killed)' : ''}.`
      );
      hits.push({
        enemyId: tid,
        enemyName: tgtEnemy.name,
        targetAc: tgtEnemy.ac,
        damage: effDmg,
        killed,
        note,
      });
      if (killed) {
        const split = splitEncounterXp(ctx.st, ctx.char.id, tgtEnemy.xp ?? 0);
        ctx.st = split.st;
        ctx.char.xp = (ctx.char.xp || 0) + split.share;
        ctx.st.enemies_killed = [...(ctx.st.enemies_killed ?? []), tid];
      }
    }
  }
  if (isRoomCleared(ctx.st, ctx.seed, ctx.roomId)) {
    ctx.st = endCombatState(ctx.st);
  }
  composeNow(ctx, {
    kind: 'spell_multi_target',
    attackerId: ctx.char.id,
    attackerName: ctx.char.name,
    spellId: spell.id,
    spellName: spell.name,
    castPrefix: pickCastPrefix(spell, {
      name: ctx.char.name,
      spell: spell.name,
      slotNote,
    }),
    damageType: spell.damageType ?? '',
    hits,
    totalDamage: totalDealt,
    labels: lines,
  });
  ctx.narrative += applyPartyLevelUps(ctx.st, ctx.char, ctx.context);
  ctx.usedInitiative = true;
  return true;
}
