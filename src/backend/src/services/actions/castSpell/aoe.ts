import type { Character, Spell } from '../../../types.js';
import {
  abilityMod,
  applyDamageMultiplier,
  maxDice,
  rollConditionSave,
  rollDice,
  upcastDamage,
  upcastDamage2,
} from '../../rulesEngine.js';
import {
  applyPartyLevelUps,
  dominatedDamageReSave,
  endCombatState,
  getEnemyById,
  grantDarkOnesBlessing,
  isRoomCleared,
  pushEntityAway,
  splitEncounterXp,
} from '../../gameEngine.js';
import {
  coverBonus,
  entitiesInBlast,
  entitiesInCone,
  entitiesInCube,
  entitiesInLine,
  posEqual,
} from '../../gridEngine.js';
import { empoweredEvocationBonus, getClassLevel } from '../../multiclass.js';
import type { ActionContext } from '../types.js';
import { fmt } from '../../narrativeFmt.js';
import { grantEnemyDrops } from '../enemyDrops.js';

/**
 * AOE-on-grid branch. Resolves area-of-effect spells against every
 * entity inside the configured `aoeShape` (sphere/cone/cube/line)
 * centered on the target square (or extending from caster→target for
 * directional shapes). Each entity rolls its own save; failures take
 * full damage (multiplied for resistance/vulnerability), successes
 * take half on `saveEffect === 'half'`. Allies in the blast also save
 * — Evoker's Sculpt Spells auto-succeeds them per PHB p.117.
 *
 * Returns `true` when the AOE branch fired (the orchestrator returns
 * immediately). Returns `false` when the spell isn't an AOE spell or
 * when the grid isn't populated so the caller falls through to the
 * single-target damage block.
 */

// Second damage component for a dual-type AoE spell (Flame Strike's radiant,
// Ice Storm's cold). Rolled and saved-for-half exactly like the primary, and
// resisted per its own type when a resist target is supplied. Returns 0 for a
// single-type spell.
function secondaryAoeDamage(
  spell: Spell,
  slotLevel: number,
  failed: boolean,
  overchannel: boolean,
  resistTarget?: { resistances?: string[]; vulnerabilities?: string[]; immunities?: string[] }
): number {
  if (!spell.damage2) return 0;
  const expr = upcastDamage2(spell, slotLevel);
  const base = overchannel ? maxDice(expr) : rollDice(expr);
  const eff = failed ? base : spell.saveEffect === 'half' ? Math.floor(base / 2) : 0;
  if (eff <= 0) return 0;
  return resistTarget ? applyDamageMultiplier(eff, spell.damageType2, resistTarget).damage : eff;
}

export function runAoeSpell(
  ctx: ActionContext,
  spell: Spell,
  slotLevel: number,
  dc: number,
  spellDmg: number
): boolean {
  if (ctx.actor.kind !== 'pc') return false;
  const { char } = ctx.actor;
  const aoeBR = (spell as { blastRadius?: number }).blastRadius;
  const aoeShape =
    (spell as { aoeShape?: 'sphere' | 'cone' | 'cube' | 'line' }).aoeShape ?? 'sphere';
  if (!aoeBR || !ctx.st.entities || !spell.savingThrow || spellDmg < 0) {
    return false;
  }
  // ctx.enemy is guaranteed non-undefined here — the offensive branch
  // above already returned if !ctx.enemy. TS can't narrow across the
  // long handler body, so we re-assert.
  const aoeAnchor = ctx.enemy?.id;
  const epicenter =
    ctx.st.entities.find((e) => e.id === aoeAnchor && e.isEnemy)?.pos ??
    ctx.st.entities.find((e) => e.isEnemy)?.pos;
  const casterPos = ctx.st.entities.find((e) => e.id === char.id)?.pos;
  if (!epicenter) return false;

  const blastTargets =
    aoeShape === 'sphere'
      ? entitiesInBlast(epicenter, aoeBR, ctx.st.entities)
      : aoeShape === 'cone' && casterPos
        ? entitiesInCone(casterPos, epicenter, aoeBR, ctx.st.entities)
        : aoeShape === 'cube' && casterPos
          ? entitiesInCube(casterPos, epicenter, aoeBR, ctx.st.entities)
          : aoeShape === 'line' && casterPos
            ? entitiesInLine(casterPos, epicenter, aoeBR, ctx.st.entities)
            : entitiesInBlast(epicenter, aoeBR, ctx.st.entities);
  const isEvoker = char.subclass === 'evoker';
  // SRD Evoker Sculpt Spells (L6) — choose 1 + the spell's (slot) level
  // creatures to auto-succeed their save and take no damage. Sorcerer
  // Metamagic Careful Spell protects CHA-mod creatures. pansori auto-protects
  // the first N allies in the blast, up to the larger of the two budgets.
  const carefulActive = !!ctx.metamagic?.includes('careful');
  const sculptCap = isEvoker && getClassLevel(char, 'wizard') >= 6 ? 1 + slotLevel : 0;
  const carefulCap = carefulActive ? Math.max(1, abilityMod(char.cha)) : 0;
  let protectBudget = Math.max(sculptCap, carefulCap);
  ctx.narrative += ` ${fmt.note(`[AOE ${aoeBR}ft ${aoeShape}]`)}`;
  for (const target of blastTargets) {
    if (target.id === char.id) continue;
    const targetEnemy = target.isEnemy ? getEnemyById(ctx.seed, target.id) : null;
    const targetChar = !target.isEnemy ? ctx.st.characters.find((c) => c.id === target.id) : null;

    if (target.isEnemy && targetEnemy) {
      const tScore = (targetEnemy as unknown as Record<string, number>)[spell.savingThrow] ?? 10;
      // Cover bonus on DEX saves (SRD 5.2.1 p.15): obstacles between
      // the blast epicenter and this target give +2 (half) / +5
      // (three-quarters) to the DEX save.
      let tCover = 0;
      if (spell.savingThrow === 'dex' && ctx.st.entities) {
        const obstaclesAoe = [
          ...ctx.st.entities
            .filter((e) => e.id !== target.id && !posEqual(e.pos, epicenter))
            .map((e) => e.pos),
          ...ctx.roomObstacleCells,
        ];
        tCover = coverBonus(epicenter, target.pos, obstaclesAoe);
      }
      const targetEntCond =
        ctx.st.entities?.find((e) => e.id === target.id && e.isEnemy)?.conditions ?? [];
      const tFailed = rollConditionSave(
        spell.savingThrow,
        tScore,
        dc,
        false,
        char.level,
        tCover,
        targetEntCond
      );
      // SRD Evoker Empowered Evocation — +INT to the evocation's damage roll
      // (RAW: one roll applied to all targets, so every target shares the +INT).
      // SRD Evoker Overchannel — maximize the spell's damage dice.
      const aoeExpr = upcastDamage(spell, slotLevel) || (spell.damage ?? '0');
      const baseDmg =
        (ctx.overchannel ? maxDice(aoeExpr) : rollDice(aoeExpr)) +
        empoweredEvocationBonus(char, spell);
      const effDmg = tFailed ? baseDmg : spell.saveEffect === 'half' ? Math.floor(baseDmg / 2) : 0;
      let resDmg = applyDamageMultiplier(effDmg, spell.damageType, targetEnemy).damage;
      // Dual-damage spells (Flame Strike, Ice Storm) — add the second component,
      // saved-for-half the same way and resisted per its own type.
      resDmg += secondaryAoeDamage(spell, slotLevel, tFailed, !!ctx.overchannel, targetEnemy);
      const curHp = ctx.st.entities?.find((e) => e.id === target.id && e.isEnemy)?.hp ?? 0;
      const newHp = curHp - resDmg;
      ctx.st = {
        ...ctx.st,
        entities: (ctx.st.entities ?? []).map((e) =>
          e.id === target.id && e.isEnemy ? { ...e, hp: Math.max(0, newHp) } : e
        ),
      };
      // Push-only spells (Gust of Wind) carry no damage — drop the "N dmg" tail.
      const dmgPart = spell.damage ? ` — ${resDmg} dmg${newHp <= 0 ? ' (killed)' : ''}` : '';
      ctx.narrative += ` ${targetEnemy.name}: ${tFailed ? 'fails' : 'succeeds'} save${dmgPart}.`;
      if (newHp <= 0) {
        const split = splitEncounterXp(ctx.st, char.id, targetEnemy.xp ?? 10);
        ctx.st = split.st;
        char.xp = (char.xp || 0) + split.share;
        ctx.st = {
          ...ctx.st,
          entities: (ctx.st.entities ?? []).map((e) =>
            e.id === target.id && e.isEnemy ? { ...e, hp: 0 } : e
          ),
        };
        ctx.st.enemies_killed = [...ctx.st.enemies_killed, target.id];
        ctx.narrative += grantDarkOnesBlessing(char);
        grantEnemyDrops(ctx, targetEnemy);
        ctx.narrative += applyPartyLevelUps(ctx.st, char, ctx.context);
        if (isRoomCleared(ctx.st, ctx.seed, ctx.roomId)) {
          ctx.st = endCombatState(ctx.st);
        }
      } else if (resDmg > 0) {
        // SRD Dominate — a dominated creature caught in the blast re-saves.
        dominatedDamageReSave(ctx, target.id, targetEnemy.name);
      }
      // SRD forced displacement (Thunderwave, Gust of Wind) — a creature that
      // failed its save and is still standing is pushed away from the caster.
      if (
        spell.pushFt &&
        tFailed &&
        (ctx.st.entities?.find((e) => e.id === target.id && e.isEnemy)?.hp ?? 0) > 0
      ) {
        const pr = pushEntityAway(
          ctx.st,
          target.id,
          casterPos ?? epicenter,
          spell.pushFt,
          ctx.context,
          ctx.roomId,
          ctx.roomObstacleCells
        );
        ctx.st = pr.st;
        if (pr.pushedFt > 0) ctx.narrative += ` ${targetEnemy.name} is pushed ${pr.pushedFt} ft.`;
      }
    } else if (targetChar && !target.isEnemy) {
      // Allies in blast auto-succeed (and take no damage) via Evoker Sculpt
      // Spells or Sorcerer Metamagic Careful Spell, up to the protection
      // budget computed above. Beyond the budget, allies roll normally.
      const autoSucceed = protectBudget > 0;
      if (autoSucceed) protectBudget -= 1;
      if (!autoSucceed && spell.saveEffect !== 'negates') {
        const allyScore = (targetChar[spell.savingThrow as keyof Character] as number) ?? 10;
        let allyCover = 0;
        if (spell.savingThrow === 'dex' && ctx.st.entities) {
          const obstaclesAllyAoe = [
            ...ctx.st.entities
              .filter((e) => e.id !== target.id && !posEqual(e.pos, epicenter))
              .map((e) => e.pos),
            ...ctx.roomObstacleCells,
          ];
          allyCover = coverBonus(epicenter, target.pos, obstaclesAllyAoe);
        }
        const allyFailed = rollConditionSave(
          spell.savingThrow,
          allyScore,
          dc,
          false,
          char.level,
          allyCover,
          targetChar.conditions ?? []
        );
        const baseDmg = rollDice(upcastDamage(spell, slotLevel) || (spell.damage ?? '0'));
        let effDmg = allyFailed
          ? baseDmg
          : spell.saveEffect === 'half'
            ? Math.floor(baseDmg / 2)
            : 0;
        // Dual-damage second component (no per-ally resistance modeled here).
        effDmg += secondaryAoeDamage(spell, slotLevel, allyFailed, false);
        if (effDmg > 0) {
          const newAllyHp = Math.max(0, targetChar.hp - effDmg);
          ctx.st = {
            ...ctx.st,
            characters: ctx.st.characters.map((c) =>
              c.id === targetChar.id ? { ...c, hp: newAllyHp } : c
            ),
          };
          ctx.narrative += ` ${targetChar.name}: ${allyFailed ? 'fails' : 'succeeds'} save — ${effDmg} dmg.`;
        }
      } else if (autoSucceed) {
        ctx.narrative += ` ${targetChar.name}: auto-succeeds (${carefulActive ? 'Careful Spell' : 'Sculpt Spells'}).`;
      }
    }
  }
  ctx.usedInitiative = true;
  return true;
}
