import { computeTotalAc, spellSaveDC, upcastDamage } from '../../rulesEngine.js';
import { concentrationRoundsFor, pickCastPrefix } from './utils.js';
import { equippedArmorId, equippedShieldId } from '../../equipment.js';
import type { ActionContext } from '../types.js';
import type { Spell } from '../../../types.js';
import { composeNow } from '../../narrative/compose.js';
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
  action: {
    type: 'cast_spell';
    spellId: string;
    slotLevel: number;
    targetCharId?: string;
    restorationEffect?: string;
    resistType?: string;
    breathType?: string;
  },
  spell: Spell,
  slotLevel: number,
  slotNote: string,
  // The caster's spell save DC for this cast (from precast). Used by buffs whose
  // ward forces a SAVE on attackers (Sanctuary). Optional for back-compat.
  dc?: number
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

  // SRD Holy Aura — a 30-ft emanation centered on the caster. Pansori abstracts
  // the emanation to the whole party (everyone in the fight is "in the aura"):
  // each living party member gains `holy_warded` for the duration — attackers
  // have Disadvantage against them and they have Advantage on ALL saves. Bound to
  // the caster's concentration (cleared in breakConcentration). The fiend/undead-
  // hit-blinds-attacker rider is deferred (no creature-type model).
  if (spell.holyAura && isCasterTarget) {
    const WARD = 'holy_warded';
    ctx.st = {
      ...ctx.st,
      characters: ctx.st.characters.map((c) =>
        c.dead || (c.conditions ?? []).includes(WARD)
          ? c
          : { ...c, conditions: [...(c.conditions ?? []), WARD] }
      ),
      entities: (ctx.st.entities ?? []).map((e) =>
        !e.isEnemy && !e.conditions.includes(WARD)
          ? { ...e, conditions: [...e.conditions, WARD] }
          : e
      ),
    };
    // Keep the in-hand caster ref in sync (it's committed after the cast).
    if (!(char.conditions ?? []).includes(WARD)) {
      char.conditions = [...(char.conditions ?? []), WARD];
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
        equippedArmorId(c),
        equippedShieldId(c),
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
    // Protection from Energy — the caster picks one element (acid/cold/fire/
    // lightning/thunder); apply that instead of the spell's default list.
    const types =
      spell.id === 'protection_from_energy' && action.resistType
        ? [action.resistType]
        : spell.grantResistances;
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

  // SRD condition-immunity buff (Freedom of Movement → Paralyzed/Restrained/
  // Grappled; Mind Blank → Charmed): grant the immunities for the duration. The
  // engine's condition guards (`conditionImmunitiesFor`) then block them from
  // landing AND clear any already present. Cleared at combat end.
  if (spell.grantsConditionImmunities && spell.grantsConditionImmunities.length > 0) {
    const imms = spell.grantsConditionImmunities;
    if (isCasterTarget) {
      char.condition_immunities = [...new Set([...(char.condition_immunities ?? []), ...imms])];
    } else {
      ctx.st = {
        ...ctx.st,
        characters: ctx.st.characters.map((c) =>
          c.id === buffTarget.id
            ? {
                ...c,
                condition_immunities: [...new Set([...(c.condition_immunities ?? []), ...imms])],
              }
            : c
        ),
      };
    }
  }

  // SRD Fire Shield — arm the retaliation: a creature that hits the warded
  // character with a melee attack takes the shield's damage (read in the
  // enemy-turn loop). Self-target only in pansori (RAW range Self).
  if (spell.fireShield && isCasterTarget) {
    char.fire_shield = { dice: spell.fireShield.dice, damageType: spell.fireShield.damageType };
  }

  // SRD Mirror Image — conjure duplicates on the self-target that absorb hits
  // (read in the enemy-attack resolver). Self-target only (RAW range Self).
  if (spell.mirrorImages && isCasterTarget) {
    char.mirror_images = spell.mirrorImages;
  }

  // SRD Blink — flicker the self-target into the Border Ethereal about half each
  // round; incoming attacks find no one (read in the enemy-attack resolver).
  // Self-target only (RAW range Self).
  if (spell.blink && isCasterTarget) {
    char.blinking = true;
  }

  // SRD Sanctuary — ward the target so attackers must make a Wisdom save (vs the
  // caster's spell DC) or be unable to attack it. Store the DC on the ward.
  if (spell.sanctuary && dc !== undefined) {
    if (isCasterTarget) {
      char.sanctuary_dc = dc;
    } else {
      ctx.st = {
        ...ctx.st,
        characters: ctx.st.characters.map((c) =>
          c.id === buffTarget.id ? { ...c, sanctuary_dc: dc } : c
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
  // SRD Greater Restoration — RAW removes exactly ONE effect. When the player
  // picked one (`restorationEffect`), apply only that: a condition id strips
  // that condition (and no exhaustion); 'exhaustion' strips no condition. Absent
  // a pick, fall back to the spell's full `removeConditions` bundle (back-compat
  // + Lesser Restoration, which has no picker).
  const restorationEffect =
    spell.id === 'greater_restoration' ? action.restorationEffect : undefined;
  const stripList = restorationEffect
    ? restorationEffect === 'exhaustion' || restorationEffect === 'hp_max'
      ? []
      : [restorationEffect]
    : (spell.removeConditions ?? []);
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

  // SRD Greater Restoration — reduce target's exhaustion level by 1 (clamped to
  // 0). Applied when the player chose the 'exhaustion' effect, or (back-compat)
  // when no effect was picked.
  if (
    spell.id === 'greater_restoration' &&
    (!restorationEffect || restorationEffect === 'exhaustion')
  ) {
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

  // SRD Greater Restoration — remove any reduction to the target's Hit Point
  // maximum (Life Drain). Restores `max_hp` by the tracked amount; per RAW it
  // only lifts the cap, so current HP is left as-is.
  if (spell.id === 'greater_restoration' && restorationEffect === 'hp_max') {
    if (isCasterTarget) {
      char.max_hp += char.life_drain_reduction ?? 0;
      char.life_drain_reduction = 0;
    } else {
      ctx.st = {
        ...ctx.st,
        characters: ctx.st.characters.map((c) =>
          c.id === buffTarget.id
            ? { ...c, max_hp: c.max_hp + (c.life_drain_reduction ?? 0), life_drain_reduction: 0 }
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

  // SRD Dragon's Breath — grant the target a breath weapon for the duration.
  // The chosen element comes from the cast option picker (default fire); the
  // damage is the spell's dice scaled for the slot; the save DC is the caster's.
  if (spell.grantsBreath) {
    const breathType = action.breathType ?? 'fire';
    const dice = upcastDamage(spell, slotLevel) || spell.damage || '3d6';
    const saveDc = dc ?? spellSaveDC(char.level, char.int);
    const granted = { damageType: breathType, dice, saveDc, sourceCasterId: char.id };
    if (isCasterTarget) {
      char.granted_breath = granted;
    } else {
      ctx.st = {
        ...ctx.st,
        characters: ctx.st.characters.map((c) =>
          c.id === buffTarget.id ? { ...c, granted_breath: granted } : c
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
