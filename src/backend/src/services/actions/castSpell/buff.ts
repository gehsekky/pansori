import { concentrationRoundsFor, pickCastPrefix } from './utils.js';
import type { ActionContext } from '../types.js';
import type { Spell } from '../../../types.js';
import { composeNow } from '../../narrative/compose.js';
import { computeTotalAc } from '../../rulesEngine.js';
import { defenseAcBonus } from '../../fightingStyle.js';

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
  if (ctx.actor.kind !== 'pc') return false;
  const { char } = ctx.actor;
  const targetType =
    (spell as { targetType?: 'self' | 'ally' | 'enemy' | 'self_or_ally' }).targetType ?? 'enemy';
  if (targetType !== 'self' && targetType !== 'ally' && targetType !== 'self_or_ally') {
    return false;
  }

  const spellId = action.spellId;
  const buffTargetCharId = action.targetCharId;
  let buffTarget = char;
  if (targetType === 'ally' || (targetType === 'self_or_ally' && buffTargetCharId)) {
    const explicit = ctx.st.characters.find((c) => c.id === buffTargetCharId && !c.dead);
    if (explicit) buffTarget = explicit;
  }
  const isCasterTarget = buffTarget.id === char.id;

  // Apply condition if specified.
  const buffCondition = spell.condition;
  if (buffCondition) {
    if (isCasterTarget) {
      if (!(char.conditions ?? []).includes(buffCondition)) {
        char.conditions = [...(char.conditions ?? []), buffCondition];
        if (spell.conditionDuration) {
          char.condition_durations = {
            ...(char.condition_durations ?? {}),
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
      const prev = char.temp_hp ?? 0;
      if (grant > prev) char.temp_hp = grant;
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
      char.max_hp += totalBonus;
      char.hp += totalBonus;
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
    // SRD Metamagic Extended Spell — double the concentration duration.
    const extendMult = ctx.metamagic?.includes('extended') ? 2 : 1;
    char.concentrating_on = {
      spellId,
      rounds_left: concentrationRoundsFor(spell) * extendMult,
    };
  }

  // Per-spell side effects. Some buffs flip a flag on the target
  // (mage_armor_active, shield_of_faith_active) AND need a fresh
  // AC computation to take effect. The flag toggle is here; the
  // AC recompute uses the same computeTotalAc + inventory lookup
  // pattern as the equip-armor path in routes/game.ts.
  // Haste also gets +2 AC via the hasted condition — recompute when
  // the buff path adds the condition.
  const grantsAcBump =
    spell.id === 'mage_armor' || spell.id === 'shield_of_faith' || spell.id === 'haste';
  if (grantsAcBump) {
    const recomputeAcFor = (c: typeof buffTarget): number =>
      computeTotalAc(
        c.dex,
        c.equipped_armor,
        c.equipped_shield,
        c.inventory ?? [],
        ctx.context.lootTable,
        (spell.id === 'mage_armor' ? true : (c.mage_armor_active ?? false)) as boolean,
        (spell.id === 'shield_of_faith' ? true : (c.shield_of_faith_active ?? false)) as boolean,
        // Haste adds +2 AC via the hasted condition. After this buff
        // path runs, the target's conditions include 'hasted', so
        // pass true when this is the Haste cast OR when the target
        // already had the condition from a prior cast.
        spell.id === 'haste' || (c.conditions ?? []).includes('hasted')
      ) + defenseAcBonus(c, ctx.context.lootTable);
    if (isCasterTarget) {
      if (spell.id === 'mage_armor') char.mage_armor_active = true;
      if (spell.id === 'shield_of_faith') char.shield_of_faith_active = true;
      char.ac = recomputeAcFor(char);
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

  // Resistance buff (Stoneskin → B/P/S, Protection from Energy → an element):
  // grant the damage-type resistances to the target for the duration. Cleared
  // when the spell's concentration ends (see breakConcentration).
  if (spell.grantResistances && spell.grantResistances.length > 0) {
    const types = spell.grantResistances;
    if (isCasterTarget) {
      char.spell_resistances = [...new Set([...(char.spell_resistances ?? []), ...types])];
    } else {
      ctx.st = {
        ...ctx.st,
        characters: ctx.st.characters.map((c) =>
          c.id === buffTarget.id
            ? { ...c, spell_resistances: [...new Set([...(c.spell_resistances ?? []), ...types])] }
            : c
        ),
      };
    }
  }

  // 2024 PHB Fly + Levitate: set fly_speed_ft on the target. The
  // movement-mode pipeline (gridMove obstacle bypass + difficult-
  // terrain ignore) keys off this field. Concentration drop in
  // breakConcentration clears the flag (see gameEngine.ts).
  // SRD restoration spells — strip listed conditions from the
  // target. Both Lesser and Greater Restoration share this hook;
  // the lists differ (Lesser: blinded/deafened/paralyzed/poisoned,
  // Greater: charmed/petrified/stunned). Mirrors the heal path's
  // `removeConditions` strip but in the buff branch since
  // restoration has no HP heal.
  const stripList = spell.removeConditions ?? [];
  if (stripList.length > 0) {
    const stripFrom = (conditions: string[]): string[] =>
      conditions.filter((c) => !stripList.includes(c));
    if (isCasterTarget) {
      char.conditions = stripFrom(char.conditions);
    } else {
      ctx.st = {
        ...ctx.st,
        characters: ctx.st.characters.map((c) =>
          c.id === buffTarget.id ? { ...c, conditions: stripFrom(c.conditions) } : c
        ),
        entities: (ctx.st.entities ?? []).map((e) =>
          e.id === buffTarget.id && !e.isEnemy ? { ...e, conditions: stripFrom(e.conditions) } : e
        ),
      };
    }
  }

  // SRD Greater Restoration — reduce target's exhaustion level by 1
  // (clamped to 0). One of the spell's selectable effects. Pansori
  // MVP applies it unconditionally when Greater Restoration is the
  // spell being cast; the "pick one of five effects" UX is deferred.
  if (spell.id === 'greater_restoration') {
    if (isCasterTarget) {
      char.exhaustion_level = Math.max(0, (char.exhaustion_level ?? 0) - 1);
    } else {
      ctx.st = {
        ...ctx.st,
        characters: ctx.st.characters.map((c) =>
          c.id === buffTarget.id
            ? { ...c, exhaustion_level: Math.max(0, (c.exhaustion_level ?? 0) - 1) }
            : c
        ),
      };
    }
  }

  // SRD per-attack weapon riders (Divine Favor, the smites). Self-cast: arm the
  // caster's weapon hits. `persistent` → every hit (Divine Favor); otherwise the
  // next melee hit (Searing/Shining/Ensnaring Strike). resolveOneAttack reads
  // these; breakConcentration clears them when the buff ends.
  if (spell.weaponRider) {
    const wr = spell.weaponRider;
    if (wr.persistent) {
      buffTarget.weapon_rider = {
        dice: wr.dice ?? '1d4',
        damageType: wr.damageType ?? 'force',
        spellId,
      };
    } else {
      buffTarget.pending_smite = {
        spellId,
        dice: wr.dice,
        damageType: wr.damageType,
        appliesFaerieFire: wr.appliesFaerieFire,
        appliesCondition: wr.appliesCondition,
        conditionSave: wr.conditionSave,
      };
    }
    if (!isCasterTarget) {
      ctx.st = {
        ...ctx.st,
        characters: ctx.st.characters.map((c) =>
          c.id === buffTarget.id
            ? {
                ...c,
                weapon_rider: buffTarget.weapon_rider,
                pending_smite: buffTarget.pending_smite,
              }
            : c
        ),
      };
    }
  }

  // SRD Death Ward — set the one-shot flag on the target. The
  // interception logic lives in `applyDamage` where HP would hit
  // 0; the flag clears there on consumption.
  if (spell.id === 'death_ward') {
    if (isCasterTarget) {
      char.death_ward_active = true;
    } else {
      ctx.st = {
        ...ctx.st,
        characters: ctx.st.characters.map((c) =>
          c.id === buffTarget.id ? { ...c, death_ward_active: true } : c
        ),
      };
    }
  }

  if (spell.id === 'fly' || spell.id === 'levitate') {
    const flyFt = spell.id === 'fly' ? 60 : 20;
    if (isCasterTarget) {
      char.fly_speed_ft = flyFt;
    } else {
      ctx.st = {
        ...ctx.st,
        characters: ctx.st.characters.map((c) =>
          c.id === buffTarget.id ? { ...c, fly_speed_ft: flyFt } : c
        ),
      };
    }
  }

  const buffProse =
    pickCastPrefix(spell, {
      name: char.name,
      spell: spell.name,
      slotNote,
      target: isCasterTarget ? char.name : buffTarget.name,
    }) + '.';
  composeNow(ctx, { kind: 'spell_utility', prose: buffProse });
  return true;
}
