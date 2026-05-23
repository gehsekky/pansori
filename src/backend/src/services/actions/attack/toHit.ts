import { BEAST_FORMS, SRD_SPECIES } from '../../../contexts/srd/index.js';
import {
  DISADV_CONDITIONS,
  PLAYER_ADV_CONDITIONS,
  abilityMod,
  hasArmorProficiency,
  hasWeaponProficiency,
  reviveD20Penalty,
} from '../../rulesEngine.js';
import type { Enemy, InventoryItem, LootItem } from '../../../types.js';
import { coverBonus, distanceFeet, isFlankingPosition } from '../../gridEngine.js';
import { getClassLevel, hasClass } from '../../multiclass.js';
import type { ActionContext } from '../types.js';
import { isHeavilyEncumbered } from '../../gameEngine.js';

/**
 * Everything resolveOneAttack needs once the target + weapon are
 * known. Computing it up front (a) ensures stable adv/disadv state
 * across the Extra Attack loop and (b) keeps the resolveOneAttack
 * closure's outer-scope captures explicit instead of implicit.
 */
export interface ToHitContext {
  weaponProficient: boolean;
  armorProficient: boolean;
  equippedArmorLootItem: LootItem | undefined;
  advantage: boolean;
  disadvantage: boolean;
  disadvNote: string;
  noProfNote: string;
  coverAcBonus: number;
  enemyUnconscious: boolean;
  critThresh: number;
  sacredWeaponBonus: number;
  totalAttackBonus: number;
  features: string[];
  isRaging: boolean;
}

/**
 * Compute the to-hit context. Includes side effects on ctx:
 *  - Consumes `help_target_id` if the active PC is the helped one
 *  - Consumes the `vexed_by_<charId>` tag on the target enemy
 *  - Consumes the `studied_by_<charId>` tag on the target enemy
 *  - Consumes `inspiration_pending` + `inspiration` on the active PC
 *  - Consumes `luck_pending` on the active PC (Lucky feat — point is
 *    decremented at spend time in `use_luck`, the flag clears here)
 *
 * Advantage sources stacked (any one enables advantage):
 *   conditionAdv, enemyGrappled, proneAdv, enemyParalyzed, flankingAdv,
 *   helpAdv, assassinAdv (vs surprised / round-1),
 *   recklessAdv (Barbarian L2+, melee only), inspirationAdv
 *   (Heroic Inspiration), vexAdv (consumed Vex tag), studyAdv
 *   (Fighter L13 miss-tag), packTacticsAdv (Wolf/Dire Wolf Beast Form
 *   + ally within 5 ft), luckAdv (Lucky feat, queued via `use_luck`).
 *
 * Disadvantage sources:
 *   rangedInMelee, conditionDisadv, exhaustionDisadv (lvl 3+),
 *   heavyEncumberedDisadv, heavyWeaponSmallDisadv, !armorProficient,
 *   proneDisadv (ranged vs prone), thrownLongRangeDisadv.
 */
export function computeToHitContext(
  ctx: ActionContext,
  pre: {
    target: Enemy;
    targetId: string;
    weaponItem: (LootItem & InventoryItem) | null;
  }
): ToHitContext {
  const { target, targetId, weaponItem } = pre;

  // Armor proficiency check (PHB p.144): non-proficient armor → disadv on
  // STR/DEX attack rolls.
  const equippedArmorLootItem = ctx.char.equipped_armor
    ? ctx.context.lootTable.find(
        (l) =>
          l.id === ctx.char.inventory?.find((i) => i.instance_id === ctx.char.equipped_armor)?.id
      )
    : undefined;
  const armorProficient = hasArmorProficiency(
    ctx.char.armor_proficiencies ?? [],
    equippedArmorLootItem?.armorCategory
  );
  const weaponProficient = hasWeaponProficiency(
    ctx.char.weapon_proficiencies ?? [],
    weaponItem?.weaponType
  );

  // 2024 PHB ranged-in-melee disadvantage: only applies when a
  // non-incapacitated enemy is within 5 ft of the attacker. Previously
  // pansori applied the penalty to every ranged attack — making bows
  // strictly worse than melee in any combat. The grid + condition
  // check matches RAW: an Incapacitated enemy doesn't threaten, so
  // no disadvantage from them. Without grid positions (e.g. legacy
  // saves without entities), default to no disadvantage so the
  // penalty is opt-in.
  let rangedInMelee = false;
  if (weaponItem?.range === 'ranged' && ctx.st.entities) {
    const charEnt = ctx.st.entities.find((e) => e.id === ctx.char.id);
    if (charEnt) {
      rangedInMelee = ctx.st.entities.some(
        (e) =>
          e.isEnemy &&
          e.hp > 0 &&
          !e.conditions.includes('incapacitated') &&
          distanceFeet(charEnt.pos, e.pos) <= 5
      );
    }
  }
  const conditionDisadv = ctx.char.conditions.some((c) => DISADV_CONDITIONS.has(c));
  const exhaustionDisadv = (ctx.char.exhaustion_level ?? 0) >= 3;
  const heavyEncumberedDisadv = isHeavilyEncumbered(ctx.char);
  const smallSpecies = ctx.char.species ? SRD_SPECIES[ctx.char.species]?.size === 'small' : false;
  const heavyWeaponSmallDisadv = !!(weaponItem?.heavy && smallSpecies);
  const conditionAdv = ctx.char.conditions.some((c) => PLAYER_ADV_CONDITIONS.has(c));
  const enemyEntity2 = ctx.st.entities?.find((e) => e.id === targetId && e.isEnemy);
  const enemyGrappled = enemyEntity2?.conditions.includes('grappled') ?? false;
  const enemyProne = enemyEntity2?.conditions.includes('prone') ?? false;
  const enemyParalyzed = enemyEntity2?.conditions.includes('paralyzed') ?? false;
  const enemyUnconscious = enemyEntity2?.conditions.includes('unconscious') ?? false;
  // 2024 PHB Faerie Fire — attacks against an outlined creature
  // have advantage.
  const enemyFaerieFired = enemyEntity2?.conditions.includes('faerie_fired') ?? false;
  const proneAdv = enemyProne && weaponItem?.range !== 'ranged';
  const proneDisadv = enemyProne && weaponItem?.range === 'ranged';

  // Thrown weapon beyond normal range: disadvantage (PHB p.147)
  let thrownLongRangeDisadv = false;
  if (weaponItem?.thrown && ctx.st.entities) {
    const charEnt = ctx.st.entities.find((e) => e.id === ctx.char.id);
    const enemyEnt = ctx.st.entities.find((e) => e.id === targetId && e.isEnemy);
    if (charEnt && enemyEnt) {
      const dist = distanceFeet(charEnt.pos, enemyEnt.pos);
      if (dist > weaponItem.thrown.normalRange) thrownLongRangeDisadv = true;
    }
  }

  let coverAcBonus = 0;
  let flankingAdv = false;
  if (ctx.st.entities) {
    const charEntity = ctx.st.entities.find((e) => e.id === ctx.char.id);
    const enemyEntity = ctx.st.entities.find((e) => e.id === targetId && e.isEnemy);
    if (charEntity && enemyEntity) {
      const obstacles = [
        ...ctx.st.entities
          .filter((e) => e.id !== ctx.char.id && e.id !== targetId)
          .map((e) => e.pos),
        ...ctx.roomObstacleCells,
      ];
      coverAcBonus = coverBonus(charEntity.pos, enemyEntity.pos, obstacles);
      const flankingAlly = ctx.st.entities.find(
        (e) =>
          !e.isEnemy &&
          e.id !== ctx.char.id &&
          isFlankingPosition(charEntity.pos, e.pos, enemyEntity.pos)
      );
      if (flankingAlly) flankingAdv = true;
    }
  }

  const helpAdv = ctx.st.help_target_id === ctx.char.id;
  if (helpAdv) ctx.st = { ...ctx.st, help_target_id: undefined };

  // Assassin: advantage vs creatures who haven't acted (surprised list or first round)
  const assassinAdv =
    ctx.char.subclass === 'assassin' &&
    hasClass(ctx.char, 'rogue') &&
    ((ctx.st.surprised ?? []).includes(targetId) || (ctx.st.round ?? 1) === 1);

  const recklessAdv = !!ctx.char.turn_actions.reckless && weaponItem?.range !== 'ranged';

  let packTacticsAdv = false;
  if (ctx.char.conditions.includes('wild_shaped') && ctx.char.wild_shape_form) {
    const form = BEAST_FORMS[ctx.char.wild_shape_form];
    if (form?.packTactics && ctx.st.entities) {
      const targetEnt = ctx.st.entities.find((e) => e.id === targetId && e.isEnemy);
      if (targetEnt) {
        packTacticsAdv = ctx.st.entities.some(
          (e) =>
            !e.isEnemy &&
            e.id !== ctx.char.id &&
            e.hp > 0 &&
            Math.max(Math.abs(e.pos.x - targetEnt.pos.x), Math.abs(e.pos.y - targetEnt.pos.y)) <= 1
        );
      }
    }
  }

  // 2024 PHB Vex weapon mastery — previous hit with a Vex weapon by this
  // char on this target grants advantage on the next attack. Consume the
  // tag immediately (RAW: lasts until end of your next turn, but for our
  // single-attack action model, one-shot is closer to what players expect).
  const vexTag = `vexed_by_${ctx.char.id}`;
  const vexAdv = !!ctx.st.entities?.find(
    (e) => e.id === targetId && e.isEnemy && e.conditions.includes(vexTag)
  );
  if (vexAdv) {
    ctx.st = {
      ...ctx.st,
      entities: (ctx.st.entities ?? []).map((e) =>
        e.id === targetId && e.isEnemy
          ? { ...e, conditions: e.conditions.filter((c) => c !== vexTag) }
          : e
      ),
    };
  }

  // 2024 PHB Fighter L13 Studied Attacks — same shape as Vex but seeded by
  // a *miss* on a prior turn (mark applied in the miss branch below).
  const studyTag = `studied_by_${ctx.char.id}`;
  const studyAdv = !!ctx.st.entities?.find(
    (e) => e.id === targetId && e.isEnemy && e.conditions.includes(studyTag)
  );
  if (studyAdv) {
    ctx.st = {
      ...ctx.st,
      entities: (ctx.st.entities ?? []).map((e) =>
        e.id === targetId && e.isEnemy
          ? { ...e, conditions: e.conditions.filter((c) => c !== studyTag) }
          : e
      ),
    };
  }

  const disadvantage =
    rangedInMelee ||
    conditionDisadv ||
    exhaustionDisadv ||
    heavyEncumberedDisadv ||
    heavyWeaponSmallDisadv ||
    !armorProficient ||
    proneDisadv ||
    thrownLongRangeDisadv;

  const inspirationAdv = !!ctx.char.turn_actions.inspiration_pending;
  if (inspirationAdv) {
    ctx.char = {
      ...ctx.char,
      turn_actions: { ...ctx.char.turn_actions, inspiration_pending: false },
      inspiration: false,
    };
  }

  const luckAdv = !!ctx.char.turn_actions.luck_pending;
  if (luckAdv) {
    ctx.char = {
      ...ctx.char,
      turn_actions: { ...ctx.char.turn_actions, luck_pending: false },
    };
  }

  const advantage =
    conditionAdv ||
    enemyGrappled ||
    proneAdv ||
    enemyParalyzed ||
    enemyFaerieFired ||
    flankingAdv ||
    helpAdv ||
    assassinAdv ||
    recklessAdv ||
    inspirationAdv ||
    vexAdv ||
    studyAdv ||
    packTacticsAdv ||
    luckAdv;

  const disadvReasons = [
    rangedInMelee ? 'ranged in melee' : '',
    conditionDisadv ? ctx.char.conditions.filter((c) => DISADV_CONDITIONS.has(c)).join(', ') : '',
    exhaustionDisadv ? 'exhaustion' : '',
    heavyEncumberedDisadv ? 'heavily encumbered' : '',
    heavyWeaponSmallDisadv ? 'heavy weapon — Small creature' : '',
    !armorProficient ? `not proficient with ${equippedArmorLootItem?.name ?? 'armor'}` : '',
    proneDisadv ? 'prone (ranged)' : '',
    thrownLongRangeDisadv ? 'thrown beyond normal range' : '',
  ]
    .filter(Boolean)
    .join(', ');
  const disadvNote = disadvReasons
    ? ` (disadvantage — ${disadvReasons})`
    : advantage && !disadvantage
      ? ' (advantage)'
      : '';
  const noProfNote = !weaponProficient ? ` [no weapon proficiency — prof bonus omitted]` : '';

  const features = ctx.context.classFeatures?.[ctx.char.character_class] ?? [];
  const isRaging = ctx.char.conditions.includes('raging');

  // Champion: Improved Critical — crit on 19–20 at level 3+
  const critThresh =
    ctx.char.subclass === 'champion' &&
    hasClass(ctx.char, 'fighter') &&
    getClassLevel(ctx.char, 'fighter') >= 3
      ? 19
      : 20;
  const sacredWeaponBonus =
    (ctx.char.class_resource_uses?.sacred_weapon_active ?? 0) > 0 ? abilityMod(ctx.char.cha) : 0;
  // SRD Raise Dead / Resurrection — recently-revived PCs take a
  // −N penalty on D20 Tests (attacks, saves, checks) until it
  // decays off via long rest. Subtracted from the attack bonus.
  const revivePenalty = reviveD20Penalty(ctx.char);
  const totalAttackBonus = sacredWeaponBonus - revivePenalty;

  // Silence linter: target is part of the signature but referenced via the
  // returned ToHitContext (resolveOneAttack reads target via the closure).
  void target;

  return {
    weaponProficient,
    armorProficient,
    equippedArmorLootItem,
    advantage,
    disadvantage,
    disadvNote,
    noProfNote,
    coverAcBonus,
    enemyUnconscious,
    critThresh,
    sacredWeaponBonus,
    totalAttackBonus,
    features,
    isRaging,
  };
}
