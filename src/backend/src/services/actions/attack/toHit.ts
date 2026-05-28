import { BEAST_FORMS, SRD_SPECIES } from '../../../contexts/srd/index.js';
import {
  DISADV_CONDITIONS,
  PLAYER_ADV_CONDITIONS,
  abilityMod,
  d20TestPenalty,
  hasArmorProficiency,
  hasWeaponProficiency,
  seesInDarkness,
} from '../../rulesEngine.js';
import type { Enemy, InventoryItem, LootItem } from '../../../types.js';
import {
  canSeeTarget,
  coverBonus,
  distanceFeet,
  isFlankingPosition,
  magicalDarknessCells,
} from '../../gridEngine.js';
import { getClassLevel, hasClass, hasFeralSenses } from '../../multiclass.js';
import type { ActionContext } from '../types.js';
import { hasFightingStyle } from '../../fightingStyle.js';
import { isHeavilyEncumbered } from '../../gameEngine.js';
import { updatePcActor } from '../actor.js';

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
      enemyUnconscious: false,
      critThresh: 20,
      sacredWeaponBonus: 0,
      totalAttackBonus: 0,
      features: [],
      isRaging: false,
    };
  }
  const pc = ctx.actor;
  const { target, targetId, weaponItem } = pre;

  // Armor proficiency check (PHB p.144): non-proficient armor → disadv on
  // STR/DEX attack rolls.
  const equippedArmorLootItem = pc.char.equipped_armor
    ? ctx.context.lootTable.find(
        (l) => l.id === pc.char.inventory?.find((i) => i.instance_id === pc.char.equipped_armor)?.id
      )
    : undefined;
  const armorProficient = hasArmorProficiency(
    pc.char.armor_proficiencies ?? [],
    equippedArmorLootItem?.armorCategory
  );
  const weaponProficient = hasWeaponProficiency(
    pc.char.weapon_proficiencies ?? [],
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
    const charEnt = ctx.st.entities.find((e) => e.id === pc.char.id);
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
  // SRD Ranger Feral Senses (L18) — Blindsight; the ranger ignores Blinded
  // for its own attack rolls (other disadvantage conditions still apply).
  const ignoreBlinded = hasFeralSenses(pc.char);
  const conditionDisadv = pc.char.conditions.some(
    (c) => DISADV_CONDITIONS.has(c) && !(c === 'blinded' && ignoreBlinded)
  );
  // 2024 Exhaustion is a flat −2/level penalty on the attack roll (folded into
  // `d20TestPenalty` → `totalAttackBonus`), not Disadvantage.
  const heavyEncumberedDisadv = isHeavilyEncumbered(pc.char);
  const smallSpecies = pc.char.species ? SRD_SPECIES[pc.char.species]?.size === 'small' : false;
  const heavyWeaponSmallDisadv = !!(weaponItem?.heavy && smallSpecies);
  const conditionAdv = pc.char.conditions.some((c) => PLAYER_ADV_CONDITIONS.has(c));
  const enemyEntity2 = ctx.st.entities?.find((e) => e.id === targetId && e.isEnemy);
  const enemyGrappled = enemyEntity2?.conditions.includes('grappled') ?? false;
  const enemyProne = enemyEntity2?.conditions.includes('prone') ?? false;
  const enemyParalyzed = enemyEntity2?.conditions.includes('paralyzed') ?? false;
  const enemyUnconscious = enemyEntity2?.conditions.includes('unconscious') ?? false;
  // 2024 PHB Faerie Fire — attacks against an outlined creature
  // have advantage.
  const enemyFaerieFired = enemyEntity2?.conditions.includes('faerie_fired') ?? false;
  // SRD Blinded — attack rolls against a Blinded creature have Advantage
  // (Blindness/Deafness, Color Spray, Rogue Cunning Strike: Obscure).
  const enemyBlinded = enemyEntity2?.conditions.includes('blinded') ?? false;
  const proneAdv = enemyProne && weaponItem?.range !== 'ranged';
  const proneDisadv = enemyProne && weaponItem?.range === 'ranged';

  // Thrown weapon beyond normal range: disadvantage (PHB p.147)
  let thrownLongRangeDisadv = false;
  if (weaponItem?.thrown && ctx.st.entities) {
    const charEnt = ctx.st.entities.find((e) => e.id === pc.char.id);
    const enemyEnt = ctx.st.entities.find((e) => e.id === targetId && e.isEnemy);
    if (charEnt && enemyEnt) {
      const dist = distanceFeet(charEnt.pos, enemyEnt.pos);
      if (dist > weaponItem.thrown.normalRange) thrownLongRangeDisadv = true;
    }
  }

  let coverAcBonus = 0;
  let flankingAdv = false;
  if (ctx.st.entities) {
    const charEntity = ctx.st.entities.find((e) => e.id === pc.char.id);
    const enemyEntity = ctx.st.entities.find((e) => e.id === targetId && e.isEnemy);
    if (charEntity && enemyEntity) {
      const obstacles = [
        ...ctx.st.entities
          .filter((e) => e.id !== pc.char.id && e.id !== targetId)
          .map((e) => e.pos),
        ...ctx.roomObstacleCells,
      ];
      coverAcBonus = coverBonus(charEntity.pos, enemyEntity.pos, obstacles);
      const flankingAlly = ctx.st.entities.find(
        (e) =>
          !e.isEnemy &&
          e.id !== pc.char.id &&
          isFlankingPosition(charEntity.pos, e.pos, enemyEntity.pos)
      );
      if (flankingAlly) flankingAdv = true;
    }
  }

  const helpAdv = ctx.st.help_target_id === pc.char.id;
  if (helpAdv) ctx.st = { ...ctx.st, help_target_id: undefined };

  // SRD Ranger Precise Hunter (L17): Advantage on attack rolls vs your
  // Hunter's Mark target.
  const preciseHunterAdv =
    getClassLevel(pc.char, 'ranger') >= 17 && pc.char.hunters_mark_target_id === targetId;

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

  // 2024 PHB Vex weapon mastery — previous hit with a Vex weapon by this
  // char on this target grants advantage on the next attack. Consume the
  // tag immediately (RAW: lasts until end of your next turn, but for our
  // single-attack action model, one-shot is closer to what players expect).
  const vexTag = `vexed_by_${pc.char.id}`;
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
  const studyTag = `studied_by_${pc.char.id}`;
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

  // SRD Vision & Light — in a Heavily Obscured (dark) room a creature that can't
  // see is effectively Blinded: it attacks at Disadvantage, and attacks against
  // it have Advantage. "Can see X" = darkvision/blindsight, OR X stands in an
  // illuminated cell (a light source — Light/Daylight/torch — overrides the
  // dark). Dim light is only Lightly Obscured (Perception, not combat). Enemies
  // default to 60 ft darkvision.
  const roomLighting = ctx.seed?.rooms?.find((r) => r.id === ctx.roomId)?.lighting ?? 'bright';
  const roomDark = roomLighting === 'dark';
  const pcBlindsight = hasFeralSenses(pc.char) || (pc.char.feats?.includes('devils_sight') ?? false);
  const litEntities = ctx.st.entities ?? [];
  const darknessCells = magicalDarknessCells(ctx.st.spell_zones);
  const pcPos = litEntities.find((e) => e.id === pc.char.id)?.pos;
  const enemyPos = enemyEntity2?.pos;
  const pcCanSeeEnemy = canSeeTarget({
    observerPos: pcPos,
    targetPos: enemyPos,
    observerCanSeeInDark: seesInDarkness(pc.char.darkvision_ft ?? 0, pcBlindsight),
    observerPiercesMagicalDarkness: pcBlindsight,
    roomDark,
    entities: litEntities,
    darknessCells,
    obstacles: ctx.roomObstacleCells,
  });
  const enemyCanSeePc = canSeeTarget({
    observerPos: enemyPos,
    targetPos: pcPos,
    observerCanSeeInDark: seesInDarkness(target.darkvision_ft ?? 60, false),
    observerPiercesMagicalDarkness: false,
    roomDark,
    entities: litEntities,
    darknessCells,
    obstacles: ctx.roomObstacleCells,
  });
  const darknessDisadv = !pcCanSeeEnemy; // PC can't see the enemy → Disadvantage
  const darknessAdv = !enemyCanSeePc; // enemy can't see the PC → Advantage

  const disadvantage =
    rangedInMelee ||
    conditionDisadv ||
    heavyEncumberedDisadv ||
    heavyWeaponSmallDisadv ||
    !armorProficient ||
    proneDisadv ||
    thrownLongRangeDisadv ||
    darknessDisadv;

  const inspirationAdv = !!pc.char.turn_actions.inspiration_pending;
  if (inspirationAdv) {
    updatePcActor(ctx, {
      turn_actions: { ...pc.char.turn_actions, inspiration_pending: false },
      inspiration: false,
    });
  }

  const luckAdv = !!pc.char.turn_actions.luck_pending;
  if (luckAdv) {
    updatePcActor(ctx, {
      turn_actions: { ...pc.char.turn_actions, luck_pending: false },
    });
  }

  // Rogue Steady Aim (L3) — advantage on the next attack this turn. One-shot:
  // consumed here so only the first swing of the turn benefits.
  const steadyAimAdv = !!pc.char.turn_actions.steady_aim_pending;
  if (steadyAimAdv) {
    updatePcActor(ctx, {
      turn_actions: { ...pc.char.turn_actions, steady_aim_pending: false },
    });
  }

  const advantage =
    conditionAdv ||
    enemyGrappled ||
    proneAdv ||
    enemyParalyzed ||
    enemyFaerieFired ||
    enemyBlinded ||
    flankingAdv ||
    helpAdv ||
    preciseHunterAdv ||
    recklessAdv ||
    inspirationAdv ||
    vexAdv ||
    studyAdv ||
    packTacticsAdv ||
    luckAdv ||
    steadyAimAdv ||
    darknessAdv;

  const disadvReasons = [
    rangedInMelee ? 'ranged in melee' : '',
    conditionDisadv
      ? pc.char.conditions
          .filter((c) => DISADV_CONDITIONS.has(c) && !(c === 'blinded' && ignoreBlinded))
          .join(', ')
      : '',
    heavyEncumberedDisadv ? 'heavily encumbered' : '',
    heavyWeaponSmallDisadv ? 'heavy weapon — Small creature' : '',
    !armorProficient ? `not proficient with ${equippedArmorLootItem?.name ?? 'armor'}` : '',
    proneDisadv ? 'prone (ranged)' : '',
    thrownLongRangeDisadv ? 'thrown beyond normal range' : '',
    darknessDisadv ? 'darkness — you can\'t see' : '',
  ]
    .filter(Boolean)
    .join(', ');
  const disadvNote = disadvReasons
    ? ` (disadvantage — ${disadvReasons})`
    : advantage && !disadvantage
      ? ' (advantage)'
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
  const revivePenalty = d20TestPenalty(pc.char);
  const totalAttackBonus = sacredWeaponBonus - revivePenalty + archeryBonus;

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
