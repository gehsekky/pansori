import { BEAST_FORMS, SRD_SPECIES } from '../../../campaignData/srd/index.js';
import type { Enemy, InventoryItem, LootItem } from '../../../types.js';
import { abilityMod, hasArmorProficiency, hasWeaponProficiency } from '../../rulesEngine.js';
import { distanceFeet, isFlankingPosition } from '../../gridEngine.js';
import { getClassLevel, hasClass } from '../../multiclass.js';
import type { ActionContext } from '../types.js';
import { computeAttackEdges } from '../../attackEdges.js';
import { equippedArmorId } from '../../equipment.js';
import { hasFightingStyle } from '../../fightingStyle.js';
import { isPactWeapon } from '../../invocations.js';
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
  /** A hit is a Critical Hit (Paralyzed / Unconscious target within 5 ft). */
  autoCritOnHit: boolean;
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
 *   conditionAdv, proneAdv, enemyParalyzed, flankingAdv,
 *   helpAdv,
 *   recklessAdv (Barbarian L2+, melee only), inspirationAdv
 *   (Heroic Inspiration), vexAdv (consumed Vex tag), studyAdv
 *   (Fighter L13 miss-tag), packTacticsAdv (Wolf/Dire Wolf Beast Form
 *   + ally within 5 ft), luckAdv (Lucky feat, queued via `use_luck`).
 *
 * Disadvantage sources:
 *   rangedInMelee, conditionDisadv, heavyEncumberedDisadv,
 *   heavyWeaponSmallDisadv, !armorProficient,
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
  if (ctx.actor.kind !== 'pc') {
    return {
      weaponProficient: false,
      armorProficient: false,
      equippedArmorLootItem: undefined,
      advantage: false,
      disadvantage: false,
      disadvNote: '',
      noProfNote: '',
      coverAcBonus: 0,
      autoCritOnHit: false,
      critThresh: 20,
      sacredWeaponBonus: 0,
      totalAttackBonus: 0,
      features: [],
      isRaging: false,
    };
  }
  const pc = ctx.actor;
  const { target, targetId, weaponItem } = pre;

  // Armor proficiency check (SRD): non-proficient armor → disadv on
  // STR/DEX attack rolls.
  const equippedArmorLootItem = equippedArmorId(pc.char)
    ? ctx.context.lootTable.find(
        (l) =>
          l.id === pc.char.inventory?.find((i) => i.instance_id === equippedArmorId(pc.char))?.id
      )
    : undefined;
  const armorProficient = hasArmorProficiency(
    pc.char.armor_proficiencies ?? [],
    equippedArmorLootItem?.armorCategory
  );
  // SRD Pact of the Blade — you have proficiency with your pact weapon.
  const weaponProficient =
    isPactWeapon(pc.char, weaponItem) ||
    hasWeaponProficiency(
      pc.char.weapon_proficiencies ?? [],
      weaponItem?.weaponType,
      weaponItem ?? undefined
    );

  // Generic attack-roll edges shared with spell attacks (conditions on either
  // side, Ranged Attacks in Close Combat, Cover, Vision & Light, and the
  // one-shot "next attack roll" grants — consumed here).
  const edges = computeAttackEdges(ctx, target, targetId, {
    ranged: weaponItem?.range === 'ranged',
  });
  const smallSpecies = pc.char.species ? SRD_SPECIES[pc.char.species]?.size === 'small' : false;
  const heavyWeaponSmallDisadv = !!(weaponItem?.heavy && smallSpecies);

  // Thrown weapon beyond normal range: disadvantage (SRD)
  let thrownLongRangeDisadv = false;
  if (weaponItem?.thrown && ctx.st.entities) {
    const charEnt = ctx.st.entities.find((e) => e.id === pc.char.id);
    const enemyEnt = ctx.st.entities.find((e) => e.id === targetId && e.isEnemy);
    if (charEnt && enemyEnt) {
      const dist = distanceFeet(charEnt.pos, enemyEnt.pos);
      if (dist > weaponItem.thrown.normalRange) thrownLongRangeDisadv = true;
    }
  }

  let flankingAdv = false;
  if (ctx.st.entities) {
    const charEntity = ctx.st.entities.find((e) => e.id === pc.char.id);
    const enemyEntity = ctx.st.entities.find((e) => e.id === targetId && e.isEnemy);
    if (charEntity && enemyEntity) {
      const flankingAlly = ctx.st.entities.find(
        (e) =>
          !e.isEnemy &&
          e.id !== pc.char.id &&
          isFlankingPosition(charEntity.pos, e.pos, enemyEntity.pos)
      );
      if (flankingAlly) flankingAdv = true;
    }
  }

  const recklessAdv = !!pc.char.turn_actions.reckless && weaponItem?.range !== 'ranged';

  let packTacticsAdv = false;
  if (pc.char.conditions.includes('wild_shaped') && pc.char.wild_shape_form) {
    const form = BEAST_FORMS[pc.char.wild_shape_form];
    if (form?.packTactics && ctx.st.entities) {
      const targetEnt = ctx.st.entities.find((e) => e.id === targetId && e.isEnemy);
      if (targetEnt) {
        packTacticsAdv = ctx.st.entities.some(
          (e) =>
            !e.isEnemy &&
            e.id !== pc.char.id &&
            e.hp > 0 &&
            Math.max(Math.abs(e.pos.x - targetEnt.pos.x), Math.abs(e.pos.y - targetEnt.pos.y)) <= 1
        );
      }
    }
  }

  const disadvantage =
    edges.disadvantage || heavyWeaponSmallDisadv || !armorProficient || thrownLongRangeDisadv;

  const advantage = edges.advantage || flankingAdv || recklessAdv || packTacticsAdv;

  const disadvReasons = [
    edges.rangedInMelee ? 'ranged in melee' : '',
    edges.selfDisadvConditions.join(', '),
    edges.heavilyEncumbered ? 'heavily encumbered' : '',
    heavyWeaponSmallDisadv ? 'heavy weapon — Small creature' : '',
    !armorProficient ? `not proficient with ${equippedArmorLootItem?.name ?? 'armor'}` : '',
    edges.proneDisadv ? 'prone target beyond 5 ft' : '',
    thrownLongRangeDisadv ? 'thrown beyond normal range' : '',
    edges.darknessDisadv ? "Blinded by darkness — you can't see your target" : '',
    edges.targetDisadvConditions.includes('invisible') ? 'target is invisible' : '',
    edges.targetDisadvConditions
      .filter((c) => c !== 'invisible')
      .map((c) => `target ${c}`)
      .join(', '),
    edges.grappled ? 'grappled' : '',
  ]
    .filter(Boolean)
    .join(', ');
  const disadvNote = disadvReasons
    ? ` (disadvantage — ${disadvReasons})`
    : advantage && !disadvantage
      ? // SRD Vision & Light — when the only/least edge is the foe being Blinded
        // by darkness, say so; otherwise the generic advantage note.
        edges.darknessAdv
        ? ' (advantage — your target is Blinded by darkness)'
        : ' (advantage)'
      : '';
  const noProfNote = !weaponProficient ? ` [no weapon proficiency — prof bonus omitted]` : '';

  const features = ctx.context.classFeatures?.[pc.char.character_class] ?? [];
  const isRaging = pc.char.conditions.includes('raging');

  // Champion: Improved Critical — crit on 19–20 at L3+, upgrading to
  // Superior Critical — crit on 18–20 at L15+.
  const isChampion = pc.char.subclass === 'champion' && hasClass(pc.char, 'fighter');
  const championLvl = isChampion ? getClassLevel(pc.char, 'fighter') : 0;
  const critThresh = championLvl >= 15 ? 18 : championLvl >= 3 ? 19 : 20;
  const sacredWeaponBonus =
    (pc.char.class_resource_uses?.sacred_weapon_active ?? 0) > 0 ? abilityMod(pc.char.cha) : 0;
  // SRD Fighting Style: Archery — +2 to attack rolls with Ranged weapons.
  const archeryBonus =
    weaponItem?.range === 'ranged' && hasFightingStyle(pc.char, 'archery') ? 2 : 0;
  // SRD Raise Dead / Resurrection — recently-revived PCs take a
  // −N penalty on D20 Tests (attacks, saves, checks) until it
  // decays off via long rest. Subtracted from the attack bonus.
  const revivePenalty = edges.penalty;
  // Magic weapons — flat +N to the attack roll (weapon attacks only; the
  // matching +N to damage is applied in resolveOneAttack). Combines the
  // intrinsic +N of a magic weapon (`magicBonus`) with the Magic Weapon spell's
  // temporary `weapon_enhancement`.
  const magicWeaponBonus = weaponItem
    ? (pc.char.weapon_enhancement ?? 0) + (weaponItem.magicBonus ?? 0)
    : 0;
  const totalAttackBonus = sacredWeaponBonus - revivePenalty + archeryBonus + magicWeaponBonus;

  return {
    weaponProficient,
    armorProficient,
    equippedArmorLootItem,
    advantage,
    disadvantage,
    disadvNote,
    noProfNote,
    coverAcBonus: edges.coverAcBonus,
    autoCritOnHit: edges.autoCritOnHit,
    critThresh,
    sacredWeaponBonus,
    totalAttackBonus,
    features,
    isRaging,
  };
}
