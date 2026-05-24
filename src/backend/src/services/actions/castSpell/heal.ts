import { addDice, multiplyDice, rollDice } from '../../rulesEngine.js';
import type { ActionContext } from '../types.js';
import type { Spell } from '../../../types.js';
import { composeNow } from '../../narrative/compose.js';
import { hasClass } from '../../multiclass.js';
import { pickCastPrefix } from './utils.js';
import { updatePcActor } from '../actor.js';

/**
 * Heal spell branch. Picks the most-injured non-caster ally (falls back
 * to the caster if no injured ally is present), rolls heal + casting-
 * ability mod, applies Disciple of Life (Life Cleric: +2 + spell level),
 * upcasts via `spell.upcastBonus * extraLevels`, syncs both character
 * HP and the mirrored grid entity HP, and emits a `spell_heal` fragment.
 */
export function runHealSpell(
  ctx: ActionContext,
  spell: Spell,
  slotLevel: number,
  castingScore: number,
  slotNote: string
): void {
  const healMod = Math.max(0, Math.floor((castingScore - 10) / 2));
  // Upcast scaling — Cure Wounds at slot 2 rolls 2d8 (base) + 2d8
  // (upcastBonus × 1 extra level) = 4d8 + mod. Previously the
  // upcast slot was consumed but only the base heal dice rolled.
  const extraLevels = Math.max(0, slotLevel - (spell.level ?? 1));
  const healDice =
    spell.upcastBonus && extraLevels > 0
      ? addDice(spell.heal ?? '', multiplyDice(spell.upcastBonus, extraLevels))
      : (spell.heal ?? '');
  const baseHealed = rollDice(healDice) + healMod;
  // Life Cleric: Disciple of Life — healing spells restore extra 2 + spell level HP
  const discipleBonus =
    ctx.char.subclass === 'life' && hasClass(ctx.char, 'cleric') ? 2 + (spell.level ?? 1) : 0;
  const healed = baseHealed + discipleBonus;

  // 2024 PHB Mass Healing Word (L3) / Mass Cure Wounds (L5) — apply the
  // rolled heal to EVERY living party member instead of just the most-
  // injured ally. RAW caps at 6 targets within range; pansori MVP heals
  // the whole party (parties are 1-4 PCs so the cap doesn't bite).
  // Disciple of Life + Chalice bonus apply per-target.
  const isMassHeal =
    spell.id === 'mass_healing_word' ||
    spell.id === 'mass_cure_wounds' ||
    spell.id === 'prayer_of_healing';
  if (isMassHeal) {
    const livingParty = ctx.st.characters.filter((c) => !c.dead);
    const perTargetLines: string[] = [];
    let updatedChars = ctx.st.characters;
    let updatedEntities = ctx.st.entities ?? [];
    let casterAfter = ctx.char;
    for (const member of livingParty) {
      const isMemberCaster = member.id === ctx.char.id;
      const target = isMemberCaster ? casterAfter : member;
      const prevHp = target.hp;
      const newHp = Math.min(target.max_hp, prevHp + healed);
      const delta = newHp - prevHp;
      perTargetLines.push(`${target.name}: ${prevHp}→${newHp} (+${delta})`);
      if (isMemberCaster) {
        casterAfter = { ...casterAfter, hp: newHp };
      } else {
        updatedChars = updatedChars.map((c) => (c.id === member.id ? { ...c, hp: newHp } : c));
        updatedEntities = updatedEntities.map((e) =>
          e.id === member.id && !e.isEnemy ? { ...e, hp: newHp } : e
        );
      }
    }
    updatePcActor(ctx, casterAfter);
    ctx.st = { ...ctx.st, characters: updatedChars, entities: updatedEntities };
    const bonusNote: string[] = [];
    if (discipleBonus > 0) bonusNote.push(`Disciple of Life: +${discipleBonus}`);
    const bonusSuffix = bonusNote.length > 0 ? ` (${bonusNote.join(' · ')})` : '';
    composeNow(ctx, {
      kind: 'spell_utility',
      prose:
        pickCastPrefix(spell, {
          name: ctx.char.name,
          spell: spell.name,
          slotNote,
        }) + ` — ${healed} HP to each: ${perTargetLines.join(', ')}.${bonusSuffix}`,
    });
    return;
  }

  // Target the most injured party member (excluding the caster, unless only one)
  const injured = ctx.st.characters.filter(
    (c) => !c.dead && c.hp < c.max_hp && c.id !== ctx.char.id
  );
  const target = injured.length > 0 ? injured.reduce((a, b) => (a.hp < b.hp ? a : b)) : ctx.char;
  const isSelf = target.id === ctx.char.id;
  const healBonusList: Array<{ label: string }> = [];
  if (discipleBonus > 0) healBonusList.push({ label: `Disciple of Life: +${discipleBonus}` });
  const healBonuses = healBonusList.length > 0 ? healBonusList : undefined;
  let targetNewHp: number;
  let actualHealed: number;
  // SRD — some healing spells (Heal, Greater Restoration, ...) strip
  // conditions from the target after the HP restore. The list is on
  // `spell.removeConditions`; clearing applies to both the character
  // record AND the grid entity mirror for the same drift-prevention
  // reason as HP sync.
  const stripList = spell.removeConditions ?? [];
  const stripFrom = (conditions: string[]): string[] =>
    stripList.length > 0 ? conditions.filter((c) => !stripList.includes(c)) : conditions;
  if (isSelf) {
    const prevHp = ctx.char.hp;
    ctx.char.hp = Math.min(ctx.char.max_hp, ctx.char.hp + healed);
    targetNewHp = ctx.char.hp;
    actualHealed = targetNewHp - prevHp;
    if (stripList.length > 0) {
      ctx.char.conditions = stripFrom(ctx.char.conditions);
    }
  } else {
    const prevHp = target.hp;
    targetNewHp = Math.min(target.max_hp, target.hp + healed);
    actualHealed = targetNewHp - prevHp;
    ctx.st = {
      ...ctx.st,
      characters: ctx.st.characters.map((c) =>
        c.id === target.id ? { ...c, hp: targetNewHp, conditions: stripFrom(c.conditions) } : c
      ),
      // Sync the grid entity HP so the battlefield reflects the heal
      // immediately — `commitChar()` only syncs the caster's entity,
      // not the target's, so without this the healed ally would
      // still render as a faded skull until the next state update.
      entities: (ctx.st.entities ?? []).map((e) =>
        e.id === target.id && !e.isEnemy
          ? { ...e, hp: targetNewHp, conditions: stripFrom(e.conditions) }
          : e
      ),
    };
  }
  composeNow(ctx, {
    kind: 'spell_heal',
    castPrefix: pickCastPrefix(spell, {
      name: ctx.char.name,
      spell: spell.name,
      slotNote,
      target: isSelf ? undefined : target.name,
    }),
    // `actualHealed` is post-cap. Previously the fragment showed the
    // rolled value (e.g. "restores 13 HP to Fighter (now 8/8)") even
    // when the target only had room for less. Now matches the visible
    // newHp delta.
    healed: actualHealed,
    targetName: target.name,
    isSelf,
    targetNewHp,
    targetMaxHp: target.max_hp,
    bonuses: healBonuses,
  });
}
