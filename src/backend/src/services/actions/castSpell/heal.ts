import { addDice, multiplyDice, rollDice } from '../../rulesEngine.js';
import { hasClass, hasWordsOfCreation } from '../../multiclass.js';
import type { ActionContext } from '../types.js';
import type { Spell } from '../../../types.js';
import { composeNow } from '../../narrative/compose.js';
import { distanceFeet } from '../../gridEngine.js';
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
  if (ctx.actor.kind !== 'pc') return;
  const pc = ctx.actor;
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
    pc.char.subclass === 'life' && hasClass(pc.char, 'cleric') ? 2 + (spell.level ?? 1) : 0;
  // SRD Power Word Heal restores ALL HP — a huge value floors every target
  // to its own max via the per-target `Math.min(max_hp, …)` caps below.
  const healed = spell.healFull ? Number.MAX_SAFE_INTEGER : baseHealed + discipleBonus;

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
    let casterAfter = pc.char;
    for (const member of livingParty) {
      const isMemberCaster = member.id === pc.char.id;
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
          name: pc.char.name,
          spell: spell.name,
          slotNote,
        }) + ` — ${healed} HP to each: ${perTargetLines.join(', ')}.${bonusSuffix}`,
    });
    return;
  }

  // Target the most injured party member (excluding the caster, unless only one)
  const injured = ctx.st.characters.filter(
    (c) => !c.dead && c.hp < c.max_hp && c.id !== pc.char.id
  );
  const target = injured.length > 0 ? injured.reduce((a, b) => (a.hp < b.hp ? a : b)) : pc.char;
  const isSelf = target.id === pc.char.id;
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
    const prevHp = pc.char.hp;
    pc.char.hp = Math.min(pc.char.max_hp, pc.char.hp + healed);
    targetNewHp = pc.char.hp;
    actualHealed = targetNewHp - prevHp;
    if (stripList.length > 0) {
      pc.char.conditions = stripFrom(pc.char.conditions);
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
      name: pc.char.name,
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

  // SRD Words of Creation (Bard L20) — Power Word Heal also affects a
  // second creature within 10 ft of the first target. Picks the most-
  // injured other living ally in range (off-grid = party assumed
  // together) that is hurt or carries a condition this spell ends.
  if (spell.id === 'power_word_heal' && hasWordsOfCreation(pc.char)) {
    const entities = ctx.st.entities ?? [];
    const primaryPos = entities.find((e) => e.id === target.id && !e.isEnemy)?.pos;
    const eligible = ctx.st.characters.filter((c) => {
      if (c.dead || c.id === target.id) return false;
      const needsHeal = c.hp < c.max_hp;
      const needsCleanse = stripList.some((s) => c.conditions.includes(s));
      if (!needsHeal && !needsCleanse) return false;
      if (primaryPos) {
        const pos = entities.find((e) => e.id === c.id && !e.isEnemy)?.pos;
        if (!pos || distanceFeet(primaryPos, pos) > 10) return false;
      }
      return true;
    });
    if (eligible.length > 0) {
      const second = eligible.reduce((a, b) => (a.hp < b.hp ? a : b));
      const isSecondSelf = second.id === pc.char.id;
      let secondPrevHp: number;
      let secondNewHp: number;
      if (isSecondSelf) {
        secondPrevHp = pc.char.hp;
        pc.char.hp = Math.min(pc.char.max_hp, pc.char.hp + healed);
        pc.char.conditions = stripFrom(pc.char.conditions);
        secondNewHp = pc.char.hp;
      } else {
        secondPrevHp = second.hp;
        secondNewHp = Math.min(second.max_hp, second.hp + healed);
        ctx.st = {
          ...ctx.st,
          characters: ctx.st.characters.map((c) =>
            c.id === second.id ? { ...c, hp: secondNewHp, conditions: stripFrom(c.conditions) } : c
          ),
          entities: (ctx.st.entities ?? []).map((e) =>
            e.id === second.id && !e.isEnemy
              ? { ...e, hp: secondNewHp, conditions: stripFrom(e.conditions) }
              : e
          ),
        };
      }
      composeNow(ctx, {
        kind: 'spell_heal',
        castPrefix: `Words of Creation echo to ${second.name}: `,
        healed: secondNewHp - secondPrevHp,
        targetName: second.name,
        isSelf: isSecondSelf,
        targetNewHp: secondNewHp,
        targetMaxHp: second.max_hp,
      });
    }
  }
}
