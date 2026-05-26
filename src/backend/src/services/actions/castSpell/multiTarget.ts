import {
  abilityMod,
  applyDamageMultiplier,
  maxDice,
  resolveSpellAttack,
  rollCritical,
  rollDice,
} from '../../rulesEngine.js';
import {
  applyPartyLevelUps,
  endCombatState,
  enemyHpAfterDamage,
  isRoomCleared,
  splitEncounterXp,
} from '../../gameEngine.js';
import type { ActionContext } from '../types.js';
import type { Spell } from '../../../types.js';
import { composeNow } from '../../narrative/compose.js';
import { empoweredEvocationBonus } from '../../multiclass.js';
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
  if (ctx.actor.kind !== 'pc') return false;
  const { char } = ctx.actor;
  const multiTargets = action.targetEnemyIds;
  const isMultiTargetable =
    spell.id === 'magic_missile' || spell.id === 'eldritch_blast' || spell.id === 'scorching_ray';
  if (!multiTargets || multiTargets.length <= 1 || !isMultiTargetable) {
    return false;
  }

  // Per-shot damage expression. Magic Missile: 1d4+1 force darts
  // (auto-hit). Eldritch Blast: 1d10 beams (spell-attack roll).
  // Scorching Ray: 2d6 fire rays (spell-attack roll, same shape
  // as EB).
  const perShot =
    spell.id === 'magic_missile' ? '1d4+1' : spell.id === 'eldritch_blast' ? '1d10' : '2d6';
  const agonizingBonusPerBeam =
    spell.id === 'eldritch_blast' && (char.feats ?? []).includes('agonizing_blast')
      ? Math.max(0, abilityMod(char.cha))
      : 0;
  const isAttackRollMulti = spell.id === 'eldritch_blast' || spell.id === 'scorching_ray';
  let totalDealt = 0;
  // SRD Evoker Empowered Evocation — +INT to ONE damage roll of an Evocation
  // spell (Magic Missile / Scorching Ray are Evocation). Applied to the first
  // shot that lands, then cleared so it isn't added to every dart.
  let empoweredBonus = empoweredEvocationBonus(char, spell);
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
    if (isAttackRollMulti) {
      // Each beam/ray rolls its own attack vs the target's AC.
      const atkE = resolveSpellAttack(char.level, castingScore, tgtEnemy.ac);
      if (!atkE.hit) {
        lines.push(`${i + 1}: ${tgtEnemy.name} — MISS (${atkE.total} vs AC ${tgtEnemy.ac}).`);
        continue;
      }
      const dmgRoll =
        (ctx.overchannel
          ? maxDice(perShot)
          : atkE.critical
            ? rollCritical(perShot)
            : rollDice(perShot)) +
        agonizingBonusPerBeam +
        empoweredBonus;
      empoweredBonus = 0;
      const { damage: effDmg, note } = applyDamageMultiplier(dmgRoll, spell.damageType, tgtEnemy);
      // Central enemy-damage floor — Undead Fortitude (a crit ray is exempt).
      const { hp: newHp, note: fortNote } = enemyHpAfterDamage(tgtEnemy, tgtEnt.hp, effDmg, {
        damageType: spell.damageType,
        isCrit: atkE.critical,
      });
      ctx.st = {
        ...ctx.st,
        entities: (ctx.st.entities ?? []).map((e) =>
          e.id === tid && e.isEnemy ? { ...e, hp: newHp } : e
        ),
      };
      totalDealt += effDmg;
      const killed = newHp <= 0;
      lines.push(
        `${i + 1}: ${tgtEnemy.name} — HIT ${effDmg}${atkE.critical ? ' CRIT' : ''}${note ?? ''}${killed ? ' (killed)' : ''}.${fortNote}`
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
        const split = splitEncounterXp(ctx.st, char.id, tgtEnemy.xp ?? 0);
        ctx.st = split.st;
        char.xp = (char.xp || 0) + split.share;
        ctx.st.enemies_killed = [...(ctx.st.enemies_killed ?? []), tid];
      }
    } else {
      // Magic Missile — auto-hit, no attack roll.
      const dmgRoll = (ctx.overchannel ? maxDice(perShot) : rollDice(perShot)) + empoweredBonus;
      empoweredBonus = 0;
      const { damage: effDmg, note } = applyDamageMultiplier(dmgRoll, spell.damageType, tgtEnemy);
      // Central enemy-damage floor — Undead Fortitude (auto-hit darts never crit).
      const { hp: newHp, note: fortNote } = enemyHpAfterDamage(tgtEnemy, tgtEnt.hp, effDmg, {
        damageType: spell.damageType,
      });
      ctx.st = {
        ...ctx.st,
        entities: (ctx.st.entities ?? []).map((e) =>
          e.id === tid && e.isEnemy ? { ...e, hp: newHp } : e
        ),
      };
      totalDealt += effDmg;
      const killed = newHp <= 0;
      lines.push(
        `dart ${i + 1} → ${tgtEnemy.name}: ${effDmg}${note ?? ''}${killed ? ' (killed)' : ''}.${fortNote}`
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
        const split = splitEncounterXp(ctx.st, char.id, tgtEnemy.xp ?? 0);
        ctx.st = split.st;
        char.xp = (char.xp || 0) + split.share;
        ctx.st.enemies_killed = [...(ctx.st.enemies_killed ?? []), tid];
      }
    }
  }
  if (isRoomCleared(ctx.st, ctx.seed, ctx.roomId)) {
    ctx.st = endCombatState(ctx.st);
  }
  composeNow(ctx, {
    kind: 'spell_multi_target',
    attackerId: char.id,
    attackerName: char.name,
    spellId: spell.id,
    spellName: spell.name,
    castPrefix: pickCastPrefix(spell, {
      name: char.name,
      spell: spell.name,
      slotNote,
    }),
    damageType: spell.damageType ?? '',
    hits,
    totalDamage: totalDealt,
    labels: lines,
  });
  ctx.narrative += applyPartyLevelUps(ctx.st, char, ctx.context);
  ctx.usedInitiative = true;
  return true;
}
