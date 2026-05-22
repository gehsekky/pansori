import { concentrationRoundsFor, pickCastPrefix } from './utils.js';
import type { ActionContext } from '../types.js';
import type { Spell } from '../../../types.js';
import { composeNow } from '../../narrative/compose.js';
import { computeTotalAc } from '../../rulesEngine.js';

/**
 * Self / ally / self_or_ally buff branch. Handles spells where the
 * target type is friendly (no save, no enemy required). Applies the
 * configured side effects in turn: condition, temp HP grant, max HP
 * bonus, concentration link, and the Mage Armor / Shield of Faith
 * AC recompute hooks.
 *
 * Returns `true` when handled (caller returns from the cast pipeline).
 * Returns `false` when the spell isn't a buff and the orchestrator
 * should continue to later branches.
 */
export function runBuffSpell(
  ctx: ActionContext,
  action: { type: 'cast_spell'; spellId: string; slotLevel: number; targetCharId?: string },
  spell: Spell,
  slotLevel: number,
  slotNote: string
): boolean {
  const targetType =
    (spell as { targetType?: 'self' | 'ally' | 'enemy' | 'self_or_ally' }).targetType ?? 'enemy';
  if (targetType !== 'self' && targetType !== 'ally' && targetType !== 'self_or_ally') {
    return false;
  }

  const spellId = action.spellId;
  const buffTargetCharId = action.targetCharId;
  let buffTarget = ctx.char;
  if (targetType === 'ally' || (targetType === 'self_or_ally' && buffTargetCharId)) {
    const explicit = ctx.st.characters.find((c) => c.id === buffTargetCharId && !c.dead);
    if (explicit) buffTarget = explicit;
  }
  const isCasterTarget = buffTarget.id === ctx.char.id;

  // Apply condition if specified.
  const buffCondition = spell.condition;
  if (buffCondition) {
    if (isCasterTarget) {
      if (!(ctx.char.conditions ?? []).includes(buffCondition)) {
        ctx.char.conditions = [...(ctx.char.conditions ?? []), buffCondition];
        if (spell.conditionDuration) {
          ctx.char.condition_durations = {
            ...(ctx.char.condition_durations ?? {}),
            [buffCondition]: spell.conditionDuration,
          };
        }
      }
    } else {
      ctx.st = {
        ...ctx.st,
        characters: ctx.st.characters.map((c) =>
          c.id === buffTarget.id && !(c.conditions ?? []).includes(buffCondition)
            ? {
                ...c,
                conditions: [...(c.conditions ?? []), buffCondition],
                condition_durations: spell.conditionDuration
                  ? {
                      ...(c.condition_durations ?? {}),
                      [buffCondition]: spell.conditionDuration,
                    }
                  : c.condition_durations,
              }
            : c
        ),
        entities: (ctx.st.entities ?? []).map((e) =>
          e.id === buffTarget.id && !e.isEnemy
            ? {
                ...e,
                conditions: e.conditions.includes(buffCondition)
                  ? e.conditions
                  : [...e.conditions, buffCondition],
              }
            : e
        ),
      };
    }
  }

  // Apply temp HP grant (replace if greater — temp HP doesn't stack).
  if (spell.tempHpGrant) {
    const grant = spell.tempHpGrant;
    if (isCasterTarget) {
      const prev = ctx.char.temp_hp ?? 0;
      if (grant > prev) ctx.char.temp_hp = grant;
    } else {
      ctx.st = {
        ...ctx.st,
        characters: ctx.st.characters.map((c) =>
          c.id === buffTarget.id ? { ...c, temp_hp: Math.max(c.temp_hp ?? 0, grant) } : c
        ),
      };
    }
  }

  // Apply max HP bonus (Aid). Upcast: +N per slot above base.
  const baseBonus = spell.maxHpBonus ?? 0;
  if (baseBonus > 0) {
    const extra = Math.max(0, slotLevel - (spell.level ?? 1));
    const totalBonus = baseBonus + (spell.upcastMaxHpBonus ?? 0) * extra;
    if (isCasterTarget) {
      ctx.char.max_hp += totalBonus;
      ctx.char.hp += totalBonus;
    } else {
      ctx.st = {
        ...ctx.st,
        characters: ctx.st.characters.map((c) =>
          c.id === buffTarget.id
            ? { ...c, max_hp: c.max_hp + totalBonus, hp: c.hp + totalBonus }
            : c
        ),
      };
    }
  }

  if (spell.concentration) {
    ctx.char.concentrating_on = {
      spellId,
      rounds_left: concentrationRoundsFor(spell),
    };
  }

  // Per-spell side effects. Some buffs flip a flag on the target
  // (mage_armor_active, shield_of_faith_active) AND need a fresh
  // AC computation to take effect. The flag toggle is here; the
  // AC recompute uses the same computeTotalAc + inventory lookup
  // pattern as the equip-armor path in routes/game.ts.
  if (spell.id === 'mage_armor' || spell.id === 'shield_of_faith') {
    const recomputeAcFor = (c: typeof buffTarget): number =>
      computeTotalAc(
        c.dex,
        c.equipped_armor,
        c.equipped_shield,
        c.inventory ?? [],
        ctx.context.lootTable,
        (spell.id === 'mage_armor' ? true : (c.mage_armor_active ?? false)) as boolean,
        (spell.id === 'shield_of_faith' ? true : (c.shield_of_faith_active ?? false)) as boolean
      );
    if (isCasterTarget) {
      if (spell.id === 'mage_armor') ctx.char.mage_armor_active = true;
      if (spell.id === 'shield_of_faith') ctx.char.shield_of_faith_active = true;
      ctx.char.ac = recomputeAcFor(ctx.char);
    } else {
      ctx.st = {
        ...ctx.st,
        characters: ctx.st.characters.map((c) => {
          if (c.id !== buffTarget.id) return c;
          const flagged = {
            ...c,
            mage_armor_active: spell.id === 'mage_armor' ? true : c.mage_armor_active,
            shield_of_faith_active:
              spell.id === 'shield_of_faith' ? true : c.shield_of_faith_active,
          };
          return { ...flagged, ac: recomputeAcFor(flagged) };
        }),
      };
    }
  }

  const buffProse =
    pickCastPrefix(spell, {
      name: ctx.char.name,
      spell: spell.name,
      slotNote,
      target: isCasterTarget ? ctx.char.name : buffTarget.name,
    }) + '.';
  composeNow(ctx, { kind: 'spell_utility', prose: buffProse });
  return true;
}
