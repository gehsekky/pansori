import type { AbilityKey, Character, Enemy, Spell } from '../../types.js';
import {
  abilityMod,
  addDice,
  applyDamageMultiplier,
  cantripDamageDice,
  d,
  hasArmorProficiency,
  multiplyDice,
  resolveSpellAttack,
  rollConditionSave,
  rollCritical,
  rollDice,
  spellSaveDC,
  upcastDamage,
} from '../rulesEngine.js';
import {
  applyPartyLevelUps,
  breakConcentration,
  endCombatState,
  getEnemyById,
  grantDarkOnesBlessing,
  isRoomCleared,
  pick,
  splitEncounterXp,
} from '../gameEngine.js';
import {
  coverBonus,
  distanceFeet,
  entitiesInBlast,
  entitiesInCone,
  entitiesInCube,
  entitiesInLine,
  posEqual,
} from '../gridEngine.js';
import { hasClass, resolveCastingAbility } from '../multiclass.js';
import type { ActionHandler } from './types.js';
import { composeNow } from '../narrative/compose.js';
import { fmt } from '../narrativeFmt.js';

// concentrationRoundsFor is a small helper used by the cast handler.
// Inlined here (instead of exported from gameEngine) because it's only
// used by spell-cast logic; lives next to its sole caller.
function concentrationRoundsFor(spell: { durationRounds?: number } | undefined): number {
  return spell?.durationRounds ?? 10;
}

/**
 * Build the cast-prefix prose for a spell. If `spell.narratives.cast`
 * is populated, picks one entry and substitutes {name}/{spell}/
 * {slotNote}/{target}. Otherwise returns the engine default
 * "{name} casts {spell}{slotNote}".
 *
 * Pool entries are flavor-only — engine appends mechanical resolution
 * (damage tokens, save outcomes, etc.) AFTER this prefix.
 */
export function pickCastPrefix(
  spell: Spell,
  tokens: { name: string; spell: string; slotNote: string; target?: string }
): string {
  const pool = spell.narratives?.cast;
  if (pool && pool.length > 0) {
    return pick(pool)
      .replace(/\{name\}/g, tokens.name)
      .replace(/\{spell\}/g, tokens.spell)
      .replace(/\{slotNote\}/g, tokens.slotNote)
      .replace(/\{target\}/g, tokens.target ?? '');
  }
  return `${tokens.name} casts ${tokens.spell}${tokens.slotNote}`;
}

/**
 * `cast_spell`: spell-casting dispatch. Lifted verbatim from
 * gameEngine.ts in PR 15; internal sub-splits (per-spell-category
 * branches: heal, utility, attack-roll, save, AOE, multi-target)
 * land in follow-up PRs.
 *
 * Pipeline:
 *  1. Pre-cast gates: armor proficiency, Deafened (no verbal),
 *     ritual eligibility, slot availability, prepared-spell check
 *     (Cleric/Paladin/Druid), costly material components, Quickened
 *     metamagic constraints.
 *  2. Mark action economy (action OR bonus action OR free for ritual)
 *     + Wild Magic Surge (Sorcerer · Wild Magic).
 *  3. Heal spells: roll heal, +Disciple of Life bonus (Life Cleric),
 *     target most-injured ally.
 *  4. Utility (no damage/save/attack/condition): fire spell.narrative;
 *     Bless gets special-cased to apply 'blessed' to up to 3 PCs +
 *     start concentration.
 *  5. Offensive: target resolution, grid range check (with slot
 *     refund on out-of-range), Magic Missile / Eldritch Blast
 *     multi-target loop, then single-target attack-roll OR save
 *     spell OR auto-hit (Magic Missile single-target), then AOE
 *     blast resolution (sphere/cone/cube/line) for spells with
 *     blastRadius, finally damage application + kill resolution
 *     (XP split + Dark One's Blessing + end-combat-on-clear).
 */
export const handleCastSpell: ActionHandler<{
  type: 'cast_spell';
  spellId: string;
  slotLevel: number;
}> = (ctx, action) => {
  const { spellId, slotLevel } = action;
  const isRitualCast =
    (action as { type: 'cast_spell'; spellId: string; slotLevel: number; ritual?: boolean })
      .ritual ?? false;
  const spell = ctx.context.spellTable?.[spellId];
  if (!spell) {
    ctx.narrative = `Unknown spell: ${spellId}.`;
    return;
  }

  // PHB p.144: cannot cast spells while wearing armor you are not proficient with
  const spellArmorItem = ctx.char.equipped_armor
    ? ctx.context.lootTable.find(
        (l) =>
          l.id === ctx.char.inventory?.find((i) => i.instance_id === ctx.char.equipped_armor)?.id
      )
    : null;
  if (
    spellArmorItem &&
    !hasArmorProficiency(ctx.char.armor_proficiencies ?? [], spellArmorItem.armorCategory)
  ) {
    ctx.narrative = `You cannot cast spells while wearing ${spellArmorItem.name} — you are not proficient with ${spellArmorItem.armorCategory ?? 'this'} armor.`;
    return;
  }

  // Deafened: cannot cast spells with verbal components
  if (ctx.char.conditions.includes('deafened') && (spell as { verbal?: boolean }).verbal) {
    ctx.narrative = `You cannot cast ${spell.name} while deafened — it requires a verbal component.`;
    return;
  }

  // Ritual casting: no slot cost, only out of combat
  if (isRitualCast) {
    if (!(spell as { ritualCasting?: boolean }).ritualCasting) {
      ctx.narrative = `${spell.name} cannot be cast as a ritual.`;
      return;
    }
    if (ctx.st.combat_active) {
      ctx.narrative = `Ritual casting takes 10 minutes — not usable in combat.`;
      return;
    }
    // No slot consumed for ritual casting
  }

  // Spell preparation check (Cleric, Paladin, Druid). Multi-class
  // characters with ANY prep class are subject to prep enforcement.
  const prepClasses = ['cleric', 'paladin', 'druid'];
  if (prepClasses.some((c) => hasClass(ctx.char, c)) && spell.level > 0 && !isRitualCast) {
    const prepared = ctx.char.prepared_spells ?? [];
    if (prepared.length > 0 && !prepared.includes(spellId)) {
      // Reachable only as a safety net — the choice generator now
      // filters unprepared spells out of the cast menu (see the
      // prepClasses block in generateChoices). Prep is a long-rest
      // action, so the message no longer suggests mid-combat prep.
      ctx.narrative = `${spell.name} is not prepared. Prepare it on a long rest.`;
      return;
    }
  }

  // Break existing concentration if this spell also requires concentration (PHB p.203)
  if (spell.concentration && ctx.char.concentrating_on) {
    const { char: nc, st: ns } = breakConcentration(ctx.char, ctx.st);
    ctx.char = nc;
    ctx.st = ns;
  }

  // Magic Initiate free L1 cast (2024 PHB origin feat) — the player
  // picked one L1 spell when taking Magic Initiate (Arcane/Divine/
  // Primal). That specific spell can be cast 1× per long rest without
  // expending a slot; subsequent casts that day need a slot like any
  // other spell. Recognized by walking `feat_choices` for any feat
  // entry whose `magicInitiateL1` matches the spell being cast.
  let usedMagicInitiateFree = false;
  if (spell.level > 0 && !isRitualCast) {
    const choices = ctx.char.feat_choices ?? {};
    const matched = Object.values(choices).some((c) => c?.magicInitiateL1 === spellId);
    if (matched && (ctx.char.class_resource_uses?.magic_initiate_l1_used ?? 0) === 0) {
      // Free cast at the spell's base level — upcasting still
      // requires a slot, so gate the freebie to slotLevel === spell.level.
      if (slotLevel === spell.level) {
        ctx.char.class_resource_uses = {
          ...(ctx.char.class_resource_uses ?? {}),
          magic_initiate_l1_used: 1,
        };
        usedMagicInitiateFree = true;
      }
    }
  }

  // Expend a slot for non-cantrips (unless ritual or Magic-Initiate free cast)
  if (spell.level > 0 && !isRitualCast && !usedMagicInitiateFree) {
    if (slotLevel < spell.level) {
      ctx.narrative = `${spell.name} requires at least a level-${spell.level} slot.`;
      return;
    }
    const slotsMax = (ctx.char.spell_slots_max ?? {})[slotLevel] ?? 0;
    const slotsUsed = (ctx.char.spell_slots_used ?? {})[slotLevel] ?? 0;
    if (slotsUsed >= slotsMax) {
      ctx.narrative = `No level-${slotLevel} spell slots remaining (recovered on long rest).`;
      return;
    }
    ctx.char.spell_slots_used = {
      ...(ctx.char.spell_slots_used ?? {}),
      [slotLevel]: slotsUsed + 1,
    };
  }

  // 2024 PHB / SRD 5.2.1 — costly material components (Identify's 100 gp
  // pearl, Revivify's 300 gp diamond, etc.) are consumed on cast. Block
  // the cast if the caster can't afford it; deduct from gold otherwise.
  if (spell.materialCost && spell.materialCost > 0) {
    if ((ctx.char.gold ?? 0) < spell.materialCost) {
      ctx.narrative = `${spell.name} requires a ${spell.materialCost} gp material component you don't have.`;
      return;
    }
    ctx.char.gold = (ctx.char.gold ?? 0) - spell.materialCost;
    ctx.narrative = `${ctx.char.name} expends a ${spell.materialCost} gp component. `;
  }

  // SRD 5.2.1 p.67 (Quickened Spell): after consuming Quickened, can't
  // cast a level 1+ spell on the same turn EXCEPT the quickened cast
  // itself (which is the spell that got "modified"). We detect the
  // quickened cast via ctx.st.metamagic_active === 'quickened' being still
  // active at the start of resolution.
  const isQuickenedCast = ctx.st.metamagic_active === 'quickened';
  if (
    spell.level > 0 &&
    !isRitualCast &&
    ctx.char.turn_actions.quickened_used &&
    !isQuickenedCast
  ) {
    ctx.narrative = 'You used Quickened Spell this turn — you cannot cast another level 1+ spell.';
    return;
  }

  // Mark action economy
  if (spell.castTime === 'bonus_action') {
    ctx.char.turn_actions = { ...ctx.char.turn_actions, bonus_action_used: true };
  } else {
    ctx.char.turn_actions = { ...ctx.char.turn_actions, action_used: true };
  }
  // Track that a leveled spell was cast this turn (for the Quickened
  // activation check on a subsequent metamagic invocation).
  if (spell.level > 0 && !isRitualCast) {
    ctx.char.turn_actions = { ...ctx.char.turn_actions, leveled_spell_cast: true };
  }
  // Sorcerer · Wild Magic Surge (PHB p.103) — 1-in-20 chance after each
  // leveled spell to trigger a chaotic effect. RAW rolls 1d20 and on a 1
  // rolls a result on the Wild Magic table (d100). We use a small
  // curated table appropriate to our engine's mechanics.
  if (
    spell.level > 0 &&
    !isRitualCast &&
    hasClass(ctx.char, 'sorcerer') &&
    ctx.char.subclass === 'wild_magic' &&
    d(20) === 1
  ) {
    const surge = pick([
      'You glow with a soft blue light for 1 minute (visible from 30 ft).',
      'A poof of harmless multicolored smoke envelops you.',
      `You regain 2d4 (${rollDice('2d4')}) hit points (Wild Magic Surge).`,
      'Your hair (or scales, where applicable) turns vivid pink until your next long rest.',
      'You feel a momentary disorientation — disadvantage on your next attack.',
    ]);
    // Apply mechanical effects where possible.
    if (surge.startsWith('You regain')) {
      const heal = rollDice('2d4');
      ctx.char.hp = Math.min(ctx.char.max_hp, ctx.char.hp + heal);
    }
    ctx.narrative += ` 🌀 WILD MAGIC SURGE: ${surge}`;
  }

  // Multiclass spell-casting ability resolution (2024 PHB). For a
  // multiclass PC, pick the best casting ability across the classes
  // whose spell list matches the spell's `spellList` tag. Single-
  // class PCs fall through to the primary-class lookup.
  const primaryCastingAbility = (ctx.context.spellcastingAbility?.[ctx.char.character_class] ??
    ctx.context.classPrimaryStats[ctx.char.character_class] ??
    'int') as AbilityKey;
  const castingAbility = resolveCastingAbility(
    ctx.char,
    (spell as { spellList?: ReadonlyArray<'arcane' | 'divine' | 'primal'> }).spellList,
    ctx.context.spellcastingAbility ?? {},
    primaryCastingAbility
  ) as AbilityKey;
  const castingScore = ctx.char[castingAbility] ?? 10;
  const slotNote = spell.level > 0 ? ` (level-${slotLevel} slot)` : ' (cantrip)';

  // ── Divine Smite (2024 PHB) ────────────────────────────────────────────
  // Bonus-action pre-buff: queues 2d8 radiant on the caster's next
  // successful weapon attack, upcast +1d8 per slot level above 1st.
  // The buff doesn't deal damage on cast — it stashes
  // `divine_smite_dice` on the character; the attack handler reads
  // and clears it on hit. Caller already paid the slot above.
  if (spell.id === 'divine_smite_spell') {
    const upcastBonus = Math.max(0, slotLevel - 1);
    const dice = 2 + upcastBonus;
    ctx.char.divine_smite_dice = dice;
    composeNow(ctx, {
      kind: 'spell_utility',
      prose: `${ctx.char.name} channels divine power${slotNote}! Their next weapon hit will deal an additional ${dice}d8 radiant damage.`,
    });
    return;
  }

  // ── Heal spells ────────────────────────────────────────────────────────
  if (spell.heal) {
    const healMod = Math.max(0, Math.floor((castingScore - 10) / 2));
    // Upcast scaling — Cure Wounds at slot 2 rolls 2d8 (base) + 2d8
    // (upcastBonus × 1 extra level) = 4d8 + mod. Previously the
    // upcast slot was consumed but only the base heal dice rolled.
    const extraLevels = Math.max(0, slotLevel - (spell.level ?? 1));
    const healDice =
      spell.upcastBonus && extraLevels > 0
        ? addDice(spell.heal, multiplyDice(spell.upcastBonus, extraLevels))
        : spell.heal;
    const baseHealed = rollDice(healDice) + healMod;
    // Life Cleric: Disciple of Life — healing spells restore extra 2 + spell level HP
    const discipleBonus =
      ctx.char.subclass === 'life' && hasClass(ctx.char, 'cleric') ? 2 + (spell.level ?? 1) : 0;
    const healed = baseHealed + discipleBonus;
    // Target the most injured party member (excluding the caster, unless only one)
    const injured = ctx.st.characters.filter(
      (c) => !c.dead && c.hp < c.max_hp && c.id !== ctx.char.id
    );
    const target = injured.length > 0 ? injured.reduce((a, b) => (a.hp < b.hp ? a : b)) : ctx.char;
    const isSelf = target.id === ctx.char.id;
    const healBonuses =
      discipleBonus > 0 ? [{ label: `Disciple of Life: +${discipleBonus}` }] : undefined;
    let targetNewHp: number;
    if (isSelf) {
      ctx.char.hp = Math.min(ctx.char.max_hp, ctx.char.hp + healed);
      targetNewHp = ctx.char.hp;
    } else {
      targetNewHp = Math.min(target.max_hp, target.hp + healed);
      ctx.st = {
        ...ctx.st,
        characters: ctx.st.characters.map((c) =>
          c.id === target.id ? { ...c, hp: targetNewHp } : c
        ),
        // Sync the grid entity HP so the battlefield reflects the heal
        // immediately — `commitChar()` only syncs the caster's entity,
        // not the target's, so without this the healed ally would
        // still render as a faded skull until the next state update.
        entities: (ctx.st.entities ?? []).map((e) =>
          e.id === target.id && !e.isEnemy ? { ...e, hp: targetNewHp } : e
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
      healed,
      targetName: target.name,
      isSelf,
      targetNewHp,
      targetMaxHp: target.max_hp,
      bonuses: healBonuses,
    });
    return;
  }

  // ── Utility spells (no damage, no save, no heal) ───────────────────────
  if (!spell.damage && !spell.savingThrow && !spell.attackRoll && !spell.condition) {
    const utilityProse = spell.narrative
      ? spell.narrative.replace('{name}', ctx.char.name)
      : `${ctx.char.name} casts ${spell.name}${slotNote}.`;
    composeNow(ctx, { kind: 'spell_utility', prose: utilityProse });
    // Bless (PHB p.219) — caster picks up to 3 creatures (RAW). Pansori
    // simplifies: caster + first 2 living non-caster party members are
    // blessed. Each gets +1d4 to attack rolls (saves are a follow-up).
    // Concentration links the buff to the caster — `blessed` clears
    // from all linked PCs when the Cleric's concentration drops.
    if (spell.id === 'bless') {
      // Mark caster as concentrating on bless. The runtime-mutated
      // `ctx.char` reference is what gets written back to state.
      ctx.char.concentrating_on = {
        spellId: 'bless',
        rounds_left: concentrationRoundsFor(spell),
      };
      // Pick the targets: caster (always) + up to 2 living allies.
      const blessTargets: string[] = [ctx.char.id];
      for (const c of ctx.st.characters) {
        // Cap at 3 targets per RAW. (PR 15 sed regression: had `return`
        // here, which exited the whole handler before the bless effect
        // ever applied. Tests didn't catch it because no test hits the
        // exact 4+-party-member path. Restored to `break`.)
        if (blessTargets.length >= 3) break;
        if (c.id === ctx.char.id || c.dead) continue;
        blessTargets.push(c.id);
      }
      const targetSet = new Set(blessTargets);
      ctx.st = {
        ...ctx.st,
        characters: ctx.st.characters.map((c) => {
          // The caster is mutated in place — don't overwrite our `ctx.char`
          // ref with a spread (it'd silently drop the concentrating_on
          // we just set). Skip; the post-cast state writeback handles it.
          if (c.id === ctx.char.id) return c;
          if (!targetSet.has(c.id) || (c.conditions ?? []).includes('blessed')) {
            return c;
          }
          return {
            ...c,
            conditions: [...(c.conditions ?? []), 'blessed'],
            condition_sources: {
              ...(c.condition_sources ?? {}),
              blessed: ctx.char.id,
            },
          };
        }),
      };
      // Apply blessed to the caster's local ref too.
      if (!(ctx.char.conditions ?? []).includes('blessed')) {
        ctx.char.conditions = [...(ctx.char.conditions ?? []), 'blessed'];
        ctx.char.condition_sources = {
          ...(ctx.char.condition_sources ?? {}),
          blessed: ctx.char.id,
        };
      }
      // Look up names for the ctx.narrative addendum.
      const blessedNames = blessTargets
        .map((id) => ctx.st.characters.find((c) => c.id === id)?.name ?? id)
        .join(', ');
      ctx.narrative += ` Blessed: ${blessedNames}.`;
    }
    return;
  }

  // ── Offensive spells — need a living ctx.enemy ─────────────────────────────
  if (!ctx.enemy || !ctx.enemyAlive) {
    ctx.narrative = pick(ctx.context.narratives.noEnemy);
    return;
  }

  // Resolve targeted ctx.enemy: explicit targetEnemyId wins; fallback to first living
  const spellTargetId: string =
    (action as { type: 'cast_spell'; targetEnemyId?: string }).targetEnemyId ?? ctx.enemy.id;
  const spellTarget: Enemy =
    ctx.livingEnemiesInRoom.find((e) => e.id === spellTargetId) ?? ctx.enemy;

  // SRD 5.2.1 — enforce spell range against the grid when entities exist.
  // 'self' spells need no target check (they originate from the caster).
  // 'touch' = adjacent only (≤ 1 grid square / 5 ft).
  // 'ranged' = up to spell.rangeFt feet of grid distance.
  if (ctx.st.entities && spell.rangeKind && spell.rangeKind !== 'self') {
    const casterEnt = ctx.st.entities.find((e) => e.id === ctx.char.id);
    const targetEnt = ctx.st.entities.find((e) => e.id === spellTargetId && e.isEnemy);
    if (casterEnt && targetEnt) {
      const distFt = distanceFeet(casterEnt.pos, targetEnt.pos);
      const maxFt = spell.rangeKind === 'touch' ? 5 : (spell.rangeFt ?? 0);
      if (distFt > maxFt) {
        ctx.narrative =
          spell.rangeKind === 'touch'
            ? `${spell.name} requires a touch — the ${spellTarget.name} is ${distFt} ft away.`
            : `${spell.name} is out of range (${distFt} ft to target, max ${maxFt} ft).`;
        // Refund the slot we just spent
        if (spell.level > 0 && !isRitualCast) {
          const slotsUsedRefund = ctx.char.spell_slots_used?.[slotLevel] ?? 1;
          ctx.char.spell_slots_used = {
            ...(ctx.char.spell_slots_used ?? {}),
            [slotLevel]: Math.max(0, slotsUsedRefund - 1),
          };
        }
        // Refund the action economy too
        if (spell.castTime === 'bonus_action') {
          ctx.char.turn_actions = { ...ctx.char.turn_actions, bonus_action_used: false };
        } else {
          ctx.char.turn_actions = { ...ctx.char.turn_actions, action_used: false };
        }
        if (spell.level > 0 && !isRitualCast) {
          ctx.char.turn_actions = { ...ctx.char.turn_actions, leveled_spell_cast: false };
        }
        return;
      }
    }
  }

  const dc = spellSaveDC(ctx.char.level, castingScore);
  let spellDmg = 0;
  let spellHit = true;

  // 2024 PHB Magic Missile / Eldritch Blast multi-target.
  // Action payload `targetEnemyIds` lists one entry per dart/beam
  // (duplicates = multiple on same target). Resolves each independently,
  // then short-circuits the single-target damage path.
  const castAction = action as { type: 'cast_spell'; targetEnemyIds?: string[] };
  const multiTargets = castAction.targetEnemyIds;
  if (
    multiTargets &&
    multiTargets.length > 1 &&
    (spell.id === 'magic_missile' || spell.id === 'eldritch_blast')
  ) {
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
    spellDmg = 0; // Already applied per-target; skip the single-target block below.
    spellHit = false; // Suppress the single-target damage application.
    return;
  }

  if (spell.attackRoll) {
    // ── Spell attack roll ──────────────────────────────────────────────
    const atk = resolveSpellAttack(ctx.char.level, castingScore, spellTarget.ac);
    spellHit = atk.hit;
    const atkNote = ` (spell attack ${atk.roll}+${atk.bonus}=${atk.total} vs AC ${spellTarget.ac})`;
    const castPrefix = pickCastPrefix(spell, {
      name: ctx.char.name,
      spell: spell.name,
      slotNote,
      target: spellTarget.name,
    });
    if (!spellHit) {
      composeNow(ctx, {
        kind: 'spell_attack_miss',
        attackerId: ctx.char.id,
        attackerName: ctx.char.name,
        target: spellTarget,
        spellId: spell.id,
        spellName: spell.name,
        castPrefix,
        toHit: atk.total,
        targetAc: spellTarget.ac,
        atkNote,
      });
      return;
    }
    const atkDmgExpr =
      spell.level === 0 ? cantripDamageDice(spell, ctx.char.level) : upcastDamage(spell, slotLevel);
    spellDmg = atk.critical ? rollCritical(atkDmgExpr || null) : rollDice(atkDmgExpr || '1d4');
    // Agonizing Blast: Warlock invocation — add CHA mod to Eldritch Blast damage
    const agonizingBonus =
      spell.id === 'eldritch_blast' && (ctx.char.feats ?? []).includes('agonizing_blast')
        ? Math.max(0, abilityMod(ctx.char.cha))
        : 0;
    spellDmg += agonizingBonus;
    composeNow(ctx, {
      kind: 'spell_attack_hit',
      attackerId: ctx.char.id,
      attackerName: ctx.char.name,
      target: spellTarget,
      spellId: spell.id,
      spellName: spell.name,
      castPrefix,
      damage: spellDmg,
      damageType: spell.damageType ?? '',
      isCrit: atk.critical,
      toHit: atk.total,
      targetAc: spellTarget.ac,
      atkNote,
      bonuses: agonizingBonus > 0 ? [{ label: `Agonizing Blast: +${agonizingBonus}` }] : undefined,
    });
  } else if (spell.savingThrow) {
    // ── Saving throw spell ─────────────────────────────────────────────
    const saveAbility = spell.savingThrow;
    const enemyScore = (spellTarget as unknown as Record<string, number>)[saveAbility] ?? 10;
    // Cover bonus to DEX saves (SRD 5.2.1 p.15): the spell originates from
    // the caster, so half/three-quarters cover between caster→target
    // applies to the target's DEX save against the spell. Other abilities
    // are unaffected.
    let saveCoverDexBonus = 0;
    if (saveAbility === 'dex' && ctx.st.entities) {
      const casterEntSave = ctx.st.entities.find((e) => e.id === ctx.char.id);
      const targetEntSave = ctx.st.entities.find((e) => e.id === spellTargetId && e.isEnemy);
      if (casterEntSave && targetEntSave) {
        const obstaclesSave = [
          ...ctx.st.entities
            .filter((e) => e.id !== ctx.char.id && e.id !== spellTargetId)
            .map((e) => e.pos),
          ...ctx.roomObstacleCells,
        ];
        saveCoverDexBonus = coverBonus(casterEntSave.pos, targetEntSave.pos, obstaclesSave);
      }
    }
    const targetEntForCond = ctx.st.entities?.find((e) => e.id === spellTargetId && e.isEnemy);
    const saveFailed = rollConditionSave(
      saveAbility,
      enemyScore,
      dc,
      false,
      ctx.char.level,
      saveCoverDexBonus,
      targetEntForCond?.conditions ?? []
    );
    const saveLabel = saveAbility.toUpperCase();

    const saveCastPrefix = pickCastPrefix(spell, {
      name: ctx.char.name,
      spell: spell.name,
      slotNote,
      target: spellTarget.name,
    });
    if (spell.damage) {
      const saveDmgExpr =
        spell.level === 0
          ? cantripDamageDice(spell, ctx.char.level)
          : upcastDamage(spell, slotLevel);
      const fullDmg = rollDice(saveDmgExpr || spell.damage);
      spellDmg = saveFailed ? fullDmg : spell.saveEffect === 'half' ? Math.floor(fullDmg / 2) : 0;
      composeNow(ctx, {
        kind: 'spell_save_damage',
        attackerId: ctx.char.id,
        attackerName: ctx.char.name,
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
    } else {
      composeNow(ctx, {
        kind: 'spell_save_condition',
        attackerId: ctx.char.id,
        attackerName: ctx.char.name,
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
        const condToApply = spell.condition!;
        ctx.st = {
          ...ctx.st,
          entities: (ctx.st.entities ?? []).map((e) =>
            e.id === spellTargetId && e.isEnemy
              ? {
                  ...e,
                  conditions: [...e.conditions.filter((c) => c !== condToApply), condToApply],
                }
              : e
          ),
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
          ctx.char.concentrating_on = {
            spellId,
            condition: condToApply,
            rounds_left: concentrationRoundsFor(spell),
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
        const split = splitEncounterXp(ctx.st, ctx.char.id, xpGain);
        ctx.st = split.st;
        const xpShare = split.share;
        ctx.char.xp = (ctx.char.xp || 0) + xpShare;
        ctx.st = {
          ...ctx.st,
          entities: (ctx.st.entities ?? []).map((e) =>
            e.id === spellTargetId && e.isEnemy ? { ...e, hp: 0 } : e
          ),
        };
        ctx.st.enemies_killed = [...ctx.st.enemies_killed, spellTargetId];
        ctx.char.concentrating_on = null;
        ctx.narrative += grantDarkOnesBlessing(ctx.char);
        if (isRoomCleared(ctx.st, ctx.seed, ctx.roomId)) {
          ctx.st = endCombatState(ctx.st);
        }
        ctx.narrative +=
          ' ' +
          pick(ctx.context.narratives.killShot)
            .replace('{enemy}', spellTarget.name)
            .replace('{xp}', String(xpShare));
        ctx.narrative += applyPartyLevelUps(ctx.st, ctx.char, ctx.context);
      }
      ctx.usedInitiative = true;
      return;
    }
  } else if (spell.damage && !spell.savingThrow && !spell.attackRoll) {
    // ── Auto-hit (Magic Missile style) ─────────────────────────────────
    const autoHitExpr =
      spell.level === 0 ? cantripDamageDice(spell, ctx.char.level) : upcastDamage(spell, slotLevel);
    spellDmg = rollDice(autoHitExpr || spell.damage);
    composeNow(ctx, {
      kind: 'spell_auto_hit',
      attackerId: ctx.char.id,
      attackerName: ctx.char.name,
      target: spellTarget,
      spellId: spell.id,
      spellName: spell.name,
      castPrefix: pickCastPrefix(spell, {
        name: ctx.char.name,
        spell: spell.name,
        slotNote,
      }),
      damage: spellDmg,
      damageType: spell.damageType ?? '',
    });
  }

  // ── AOE spells on grid ────────────────────────────────────────────────
  // If the spell has a blastRadius and grid entities exist, resolve against all
  // entities in the blast instead of the single-target path. Default shape is
  // sphere (radius from target square); cone/cube/line emanate from caster
  // toward the target square per SRD 5.2.1 p.193.
  const aoeBR = (spell as { blastRadius?: number }).blastRadius;
  const aoeShape =
    (spell as { aoeShape?: 'sphere' | 'cone' | 'cube' | 'line' }).aoeShape ?? 'sphere';
  if (aoeBR && ctx.st.entities && spell.savingThrow && spellDmg >= 0) {
    // ctx.enemy is guaranteed non-undefined here — the offensive branch
    // above already returned if !ctx.enemy. TS can't narrow across the
    // long handler body, so we re-assert.
    const aoeAnchor = ctx.enemy?.id;
    const epicenter =
      ctx.st.entities.find((e) => e.id === aoeAnchor && e.isEnemy)?.pos ??
      ctx.st.entities.find((e) => e.isEnemy)?.pos;
    const casterPos = ctx.st.entities.find((e) => e.id === ctx.char.id)?.pos;
    if (epicenter) {
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
      const isEvoker = ctx.char.subclass === 'evoker';
      ctx.narrative += ` ${fmt.note(`[AOE ${aoeBR}ft ${aoeShape}]`)}`;
      for (const target of blastTargets) {
        if (target.id === ctx.char.id) continue;
        const targetEnemy = target.isEnemy ? getEnemyById(ctx.seed, target.id) : null;
        const targetChar = !target.isEnemy
          ? ctx.st.characters.find((c) => c.id === target.id)
          : null;

        if (target.isEnemy && targetEnemy) {
          const tScore =
            (targetEnemy as unknown as Record<string, number>)[spell.savingThrow] ?? 10;
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
            ctx.char.level,
            tCover,
            targetEntCond
          );
          const baseDmg = rollDice(upcastDamage(spell, slotLevel) || (spell.damage ?? '0'));
          const effDmg = tFailed
            ? baseDmg
            : spell.saveEffect === 'half'
              ? Math.floor(baseDmg / 2)
              : 0;
          const { damage: resDmg } = applyDamageMultiplier(effDmg, spell.damageType, targetEnemy);
          const curHp = ctx.st.entities?.find((e) => e.id === target.id && e.isEnemy)?.hp ?? 0;
          const newHp = curHp - resDmg;
          ctx.st = {
            ...ctx.st,
            entities: (ctx.st.entities ?? []).map((e) =>
              e.id === target.id && e.isEnemy ? { ...e, hp: Math.max(0, newHp) } : e
            ),
          };
          ctx.narrative += ` ${targetEnemy.name}: ${tFailed ? 'fails' : 'succeeds'} save — ${resDmg} dmg${newHp <= 0 ? ' (killed)' : ''}.`;
          if (newHp <= 0) {
            const split = splitEncounterXp(ctx.st, ctx.char.id, targetEnemy.xp ?? 10);
            ctx.st = split.st;
            ctx.char.xp = (ctx.char.xp || 0) + split.share;
            ctx.st = {
              ...ctx.st,
              entities: (ctx.st.entities ?? []).map((e) =>
                e.id === target.id && e.isEnemy ? { ...e, hp: 0 } : e
              ),
            };
            ctx.st.enemies_killed = [...ctx.st.enemies_killed, target.id];
            ctx.narrative += grantDarkOnesBlessing(ctx.char);
            ctx.narrative += applyPartyLevelUps(ctx.st, ctx.char, ctx.context);
            if (isRoomCleared(ctx.st, ctx.seed, ctx.roomId)) {
              ctx.st = endCombatState(ctx.st);
            }
          }
        } else if (targetChar && !target.isEnemy) {
          // Allies in blast: Evoker Sculpt Spells lets them auto-succeed (PHB p.117)
          const autoSucceed = isEvoker;
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
              ctx.char.level,
              allyCover,
              targetChar.conditions ?? []
            );
            const baseDmg = rollDice(upcastDamage(spell, slotLevel) || (spell.damage ?? '0'));
            const effDmg = allyFailed
              ? baseDmg
              : spell.saveEffect === 'half'
                ? Math.floor(baseDmg / 2)
                : 0;
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
            ctx.narrative += ` ${targetChar.name}: auto-succeeds (Sculpt Spells).`;
          }
        }
      }
      ctx.usedInitiative = true;
      return;
    }
  }

  // Apply damage to single ctx.enemy target
  if (spellDmg > 0 || spellHit) {
    const { damage: effSpellDmg, note: spellDmgNote } = applyDamageMultiplier(
      spellDmg,
      spell.damageType,
      spellTarget
    );
    if (spellDmgNote) ctx.narrative += spellDmgNote;
    spellDmg = effSpellDmg;
    const enemyEntSpell = ctx.st.entities?.find((e) => e.id === spellTargetId && e.isEnemy);
    const curEnemyHpSpell = enemyEntSpell?.hp ?? 0;
    const newEnemyHpSpell = curEnemyHpSpell - spellDmg;
    ctx.st = {
      ...ctx.st,
      entities: (ctx.st.entities ?? []).map((e) =>
        e.id === spellTargetId && e.isEnemy ? { ...e, hp: newEnemyHpSpell } : e
      ),
    };
    if (newEnemyHpSpell <= 0) {
      const xpGain = spellTarget.xp ?? 10;
      const split = splitEncounterXp(ctx.st, ctx.char.id, xpGain);
      ctx.st = split.st;
      const xpShare = split.share;
      ctx.char.xp = (ctx.char.xp || 0) + xpShare;
      ctx.st = {
        ...ctx.st,
        entities: (ctx.st.entities ?? []).map((e) =>
          e.id === spellTargetId && e.isEnemy ? { ...e, hp: 0 } : e
        ),
      };
      ctx.st.enemies_killed = [...ctx.st.enemies_killed, spellTargetId];
      ctx.narrative += grantDarkOnesBlessing(ctx.char);
      if (isRoomCleared(ctx.st, ctx.seed, ctx.roomId)) {
        ctx.st = endCombatState(ctx.st);
      }
      ctx.narrative +=
        ' ' +
        pick(ctx.context.narratives.killShot)
          .replace('{enemy}', spellTarget.name)
          .replace('{xp}', String(xpShare));
      ctx.narrative += applyPartyLevelUps(ctx.st, ctx.char, ctx.context);
    } else {
      ctx.narrative += ` The ${spellTarget.name} has ${fmt.hp(newEnemyHpSpell)} HP remaining.`;
    }
  }

  ctx.usedInitiative = true;
  return;
};
