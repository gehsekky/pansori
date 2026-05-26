import type { Enemy, Spell } from '../../../types.js';
import {
  abilityMod,
  applyDamageMultiplier,
  cantripDamageDice,
  maxDice,
  rollConditionSave,
  rollDice,
  rollDiceEmpowered,
  upcastDamage,
} from '../../rulesEngine.js';
import {
  applyPartyLevelUps,
  endCombatState,
  grantDarkOnesBlessing,
  isRoomCleared,
  pick,
  splitEncounterXp,
} from '../../gameEngine.js';
import { concentrationRoundsFor, pickCastPrefix } from './utils.js';
import {
  elementalAffinityBonus,
  empoweredEvocationBonus,
  hasPotentCantrip,
  improvedPotentTempHp,
  potentSpellcastingBonus,
} from '../../multiclass.js';
import type { ActionContext } from '../types.js';
import { composeNow } from '../../narrative/compose.js';
import { coverBonus } from '../../gridEngine.js';
import { fmt } from '../../narrativeFmt.js';

/**
 * Saving-throw spell branch. Rolls the target's save vs `dc`, applies
 * cover bonus on DEX saves, and emits one of:
 *
 *   - `spell_save_damage` — damage spell (full on fail, half/none on save).
 *   - `spell_save_condition` — pure condition spell (no damage).
 *
 * When the spell ALSO carries a condition (e.g. Hold Person), failure
 * applies the condition + concentration link AND handles kill resolution
 * inline (Magic Missile-style auto damage application + XP split + end-
 * combat-on-clear). That branch returns `{ done: true }` so the
 * orchestrator skips its own single-target damage block.
 *
 * Pure damage saves (no condition) return `{ done: false }` and the
 * orchestrator's `applySingleTargetDamage` runs to apply HP + kill
 * resolution against the resistance-multiplied damage.
 */
export function runSaveSpell(
  ctx: ActionContext,
  spellTarget: Enemy,
  spellTargetId: string,
  spell: Spell,
  slotLevel: number,
  slotNote: string,
  dc: number
): { done: boolean; spellDmg: number; spellHit: boolean } {
  if (ctx.actor.kind !== 'pc') return { done: true, spellDmg: 0, spellHit: false };
  const { char } = ctx.actor;
  const saveAbility = spell.savingThrow!;
  const enemyScore = (spellTarget as unknown as Record<string, number>)[saveAbility] ?? 10;
  // Cover bonus to DEX saves (SRD 5.2.1 p.15): the spell originates from
  // the caster, so half/three-quarters cover between caster→target
  // applies to the target's DEX save against the spell. Other abilities
  // are unaffected.
  let saveCoverDexBonus = 0;
  if (saveAbility === 'dex' && ctx.st.entities) {
    const casterEntSave = ctx.st.entities.find((e) => e.id === char.id);
    const targetEntSave = ctx.st.entities.find((e) => e.id === spellTargetId && e.isEnemy);
    if (casterEntSave && targetEntSave) {
      const obstaclesSave = [
        ...ctx.st.entities
          .filter((e) => e.id !== char.id && e.id !== spellTargetId)
          .map((e) => e.pos),
        ...ctx.roomObstacleCells,
      ];
      saveCoverDexBonus = coverBonus(casterEntSave.pos, targetEntSave.pos, obstaclesSave);
    }
  }
  const targetEntForCond = ctx.st.entities?.find((e) => e.id === spellTargetId && e.isEnemy);
  // SRD Metamagic Heightened Spell — the target rolls this save with
  // Disadvantage.
  const heightened = !!ctx.metamagic?.includes('heightened');
  // SRD Dominate — the target saves with Advantage while the party fights it.
  const saveAdvantage = !!spell.saveAdvantage;
  const saveFailed = rollConditionSave(
    saveAbility,
    enemyScore,
    dc,
    false,
    char.level,
    saveCoverDexBonus,
    targetEntForCond?.conditions ?? [],
    saveAdvantage,
    heightened
  );
  const saveLabel = saveAbility.toUpperCase();

  const saveCastPrefix = pickCastPrefix(spell, {
    name: char.name,
    spell: spell.name,
    slotNote,
    target: spellTarget.name,
  });

  let spellDmg = 0;
  if (spell.damage) {
    const saveDmgExpr =
      spell.level === 0 ? cantripDamageDice(spell, char.level) : upcastDamage(spell, slotLevel);
    // SRD Metamagic Empowered Spell — reroll up to CHA-mod of the lowest dice;
    // Draconic Elemental Affinity — +CHA to the damage roll of the affinity type
    // (added to the full roll, so it's halved on a successful save per RAW).
    const fullDmg =
      (ctx.overchannel
        ? maxDice(saveDmgExpr || spell.damage)
        : ctx.metamagic?.includes('empowered')
          ? rollDiceEmpowered(saveDmgExpr || spell.damage, Math.max(1, abilityMod(char.cha)))
          : rollDice(saveDmgExpr || spell.damage)) +
      elementalAffinityBonus(char, spell.damageType) +
      potentSpellcastingBonus(char, spell) +
      empoweredEvocationBonus(char, spell);
    // SRD Evoker Potent Cantrip (L3) — a damaging cantrip deals half damage
    // even on a successful save (upgrading a 'negates' cantrip to 'half').
    const potentHalf = spell.level === 0 && hasPotentCantrip(char);
    spellDmg = saveFailed
      ? fullDmg
      : spell.saveEffect === 'half' || potentHalf
        ? Math.floor(fullDmg / 2)
        : 0;
    if (!saveFailed && potentHalf && spell.saveEffect !== 'half') {
      ctx.narrative += ` ${fmt.note('[Potent Cantrip: half damage on a save]')}`;
    }
    composeNow(ctx, {
      kind: 'spell_save_damage',
      attackerId: char.id,
      attackerName: char.name,
      target: spellTarget,
      spellId: spell.id,
      spellName: spell.name,
      castPrefix: saveCastPrefix,
      saveAbility: saveLabel,
      saveDC: dc,
      saveFailed,
      damage: spellDmg,
      damageType: spell.damageType ?? '',
      halfOnSave: spell.saveEffect === 'half',
    });
    // SRD Improved Blessed Strikes (Cleric L14, Potent Spellcasting) —
    // dealing cantrip damage grants 2 × WIS Temporary Hit Points (RAW: to
    // yourself or an ally within 60 ft; pansori MVP grants to the caster).
    const potentTemp = improvedPotentTempHp(char);
    if (spell.level === 0 && spellDmg > 0 && potentTemp > (char.temp_hp ?? 0)) {
      char.temp_hp = potentTemp;
      ctx.st = {
        ...ctx.st,
        entities: (ctx.st.entities ?? []).map((e) =>
          e.id === char.id && !e.isEnemy ? { ...e, temp_hp: potentTemp } : e
        ),
      };
      ctx.narrative += ` ${fmt.note(`[Potent Spellcasting: ${char.name} gains ${potentTemp} temporary HP]`)}`;
    }
  } else {
    composeNow(ctx, {
      kind: 'spell_save_condition',
      attackerId: char.id,
      attackerName: char.name,
      target: spellTarget,
      spellId: spell.id,
      spellName: spell.name,
      castPrefix: saveCastPrefix,
      saveAbility: saveLabel,
      saveDC: dc,
      saveFailed,
    });
  }

  if (spell.condition && saveFailed) {
    if (spellTarget.condition_immunities?.includes(spell.condition)) {
      ctx.narrative += ` ${fmt.note(`[${spellTarget.name} is immune to ${spell.condition}]`)}`;
    } else {
      const condToApply = spell.condition;
      // 2024 PHB Polymorph — give the target Temporary Hit Points
      // equal to the chosen beast form's HP (Wolf: 11). The form's
      // pool lives on `entity.temp_hp`; damage absorbs into it first,
      // and when temp_hp depletes the form drops automatically (the
      // attack resolver clears polymorph_state + the polymorphed
      // condition). Pansori MVP auto-picks Wolf regardless of target
      // CR; RAW lets the caster pick any beast ≤ target level.
      const isPolymorph = spell.id === 'polymorph';
      ctx.st = {
        ...ctx.st,
        entities: (ctx.st.entities ?? []).map((e) => {
          if (e.id !== spellTargetId || !e.isEnemy) return e;
          const next = {
            ...e,
            conditions: [...e.conditions.filter((c) => c !== condToApply), condToApply],
          };
          if (isPolymorph && !next.polymorph_state) {
            return {
              ...next,
              polymorph_state: { formName: 'Wolf' },
              temp_hp: 11,
            };
          }
          return next;
        }),
      };
      composeNow(ctx, {
        kind: 'condition_applied',
        targetId: spellTargetId,
        targetName: spellTarget.name,
        condition: condToApply,
        source: spell.name,
        prose: ` The ${spellTarget.name} is ${condToApply}!`,
      });
      if (spell.concentration) {
        char.concentrating_on = {
          spellId: spell.id,
          condition: condToApply,
          rounds_left: concentrationRoundsFor(spell),
          // Stamp the DC so effects that re-roll a save away from the cast
          // site read the caster's real spell save DC (Dominate's on-damage
          // re-save), not the fallback.
          save_dc: dc,
        };
      }
    }
    const { damage: effCondDmg, note: condDmgNote } = applyDamageMultiplier(
      spellDmg,
      spell.damageType,
      spellTarget
    );
    if (condDmgNote) ctx.narrative += condDmgNote;
    const enemyEntCond = ctx.st.entities?.find((e) => e.id === spellTargetId && e.isEnemy);
    const curHpCond = enemyEntCond?.hp ?? 0;
    const newEnemyHp = curHpCond - effCondDmg;
    ctx.st = {
      ...ctx.st,
      entities: (ctx.st.entities ?? []).map((e) =>
        e.id === spellTargetId && e.isEnemy ? { ...e, hp: Math.max(0, newEnemyHp) } : e
      ),
    };
    if (newEnemyHp <= 0) {
      const xpGain = spellTarget.xp ?? 10;
      const split = splitEncounterXp(ctx.st, char.id, xpGain);
      ctx.st = split.st;
      const xpShare = split.share;
      char.xp = (char.xp || 0) + xpShare;
      ctx.st = {
        ...ctx.st,
        entities: (ctx.st.entities ?? []).map((e) =>
          e.id === spellTargetId && e.isEnemy ? { ...e, hp: 0 } : e
        ),
      };
      ctx.st.enemies_killed = [...ctx.st.enemies_killed, spellTargetId];
      char.concentrating_on = null;
      ctx.narrative += grantDarkOnesBlessing(char);
      if (isRoomCleared(ctx.st, ctx.seed, ctx.roomId)) {
        ctx.st = endCombatState(ctx.st);
      }
      ctx.narrative +=
        ' ' +
        pick(ctx.context.narratives.killShot)
          .replace('{enemy}', spellTarget.name)
          .replace('{xp}', String(xpShare));
      ctx.narrative += applyPartyLevelUps(ctx.st, char, ctx.context);
    }
    ctx.usedInitiative = true;
    return { done: true, spellDmg, spellHit: true };
  }

  return { done: false, spellDmg, spellHit: true };
}
