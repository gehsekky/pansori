import { BEAST_FORMS, SRD_SPECIES } from '../../../contexts/srd/index.js';
import {
  DISADV_CONDITIONS,
  FRESH_TURN,
  PLAYER_ADV_CONDITIONS,
  abilityMod,
  applyDamageMultiplier,
  extraAttackCount,
  hasArmorProficiency,
  hasWeaponProficiency,
  profBonus,
  rageDamageBonus,
  resolvePlayerAttack,
  rollCritical,
  rollDice,
  sneakAttackDice,
  unarmedDamage,
} from '../../rulesEngine.js';
import {
  applyPartyLevelUps,
  buildCombatHitNarrative,
  buildInitiativeOrder,
  endCombatState,
  getEnemyById,
  grantDarkOnesBlessing,
  hpTier,
  isHeavilyEncumbered,
  isRoomCleared,
  pick,
  pickTiered,
  pushEvent,
  splitEncounterXp,
} from '../../gameEngine.js';
import { coverBonus, distanceFeet, isFlankingPosition, posEqual } from '../../gridEngine.js';
import type { ActionHandler } from '../types.js';
import type { CombatEntity } from '../../../types.js';
import { fmt } from '../../narrativeFmt.js';
import { runPreattack } from './preattack.js';

/**
 * `attack`: the core melee/ranged combat resolution. Pansori's biggest
 * single action. Lifted verbatim from gameEngine.ts in PR 14; internal
 * sub-splits (pre-attack guards / combat-start / resolve-one-attack /
 * post-hit effects) land in follow-up PRs.
 *
 * Pipeline:
 *  1. Pre-attack gates: target resolution, grid range, charmed/stunned/
 *     paralyzed, weapon resolution (versatile + beast form override),
 *     ranged ammo consumption.
 *  2. Combat-start (first attack): build initiative order, seed grid
 *     entities (PCs + Beastmaster companions + enemies), surprise check
 *     via group Stealth vs enemy passive Perception, opening-blow text.
 *  3. To-hit context: armor/weapon proficiency, condition advantages,
 *     cover/flanking, Help target, Assassin/Vow/Reckless/Inspiration/
 *     Pack Tactics/Vex/Studied/Wolf Totem adv/disadv stacking.
 *  4. Inner `resolveOneAttack` closure: rolls, BI/Bless re-rolls,
 *     fumble + miss + hit branches, sneak attack, rage damage,
 *     damage multiplier, narrative + combat_log events, Cunning
 *     Strike effects, weapon mastery effects (Vex/Topple/Push/Sap/
 *     Slow/Cleave), kill resolution (XP split, Dark One's Blessing,
 *     end combat on room clear).
 *  5. First attack + Extra Attack loop (Fighter L5+).
 */
export const handleAttack: ActionHandler<{ type: 'attack'; targetEnemyId?: string }> = (
  ctx,
  action
) => {
  // ── Pre-attack: target resolution, range/charm/incapacitation gates,
  //    weapon resolution (Beast Form override, Versatile/Flex), and
  //    ranged-ammo consumption. See attack/preattack.ts. The runPreattack
  //    function mutates ctx (narrative, usedInitiative, inventory) and
  //    returns done:true to short-circuit, or the resolved weapon/target
  //    payload the rest of the pipeline needs.
  const pre = runPreattack(ctx, action);
  if (pre.done) return;
  const { target, targetId, weaponItem, weaponDamage, isVersatile, weaponLabel } = pre;

  // ── Start combat on first attack — roll initiative for all ─────────────
  if (!ctx.st.combat_active) {
    const enemiesForInit = ctx.livingEnemiesInRoom;
    const order = buildInitiativeOrder(ctx.st.characters, enemiesForInit);
    ctx.st = { ...ctx.st, combat_active: true };

    const updatedCharsForInit = ctx.st.characters.map((c) => {
      const entry = order.find((e) => e.id === c.id);
      return entry ? { ...c, initiative_roll: entry.roll } : c;
    });
    ctx.st = { ...ctx.st, characters: updatedCharsForInit, initiative_order: order };

    // Refresh char from updated characters array
    const freshChar = updatedCharsForInit.find((c) => c.id === ctx.char.id);
    if (freshChar) ctx.char = { ...freshChar };
    ctx.char = { ...ctx.char, turn_actions: { ...FRESH_TURN } };

    // ── Initialize grid entities at combat start ────────────────────────
    if (!ctx.st.entities) {
      const gw = ctx.context.gridWidth ?? 8;
      const gh = ctx.context.gridHeight ?? 8;
      const pcEntities: CombatEntity[] = ctx.st.characters.map((c, ci) => ({
        id: c.id,
        isEnemy: false,
        pos: { x: 1 + ci, y: 1 },
        hp: c.hp,
        maxHp: c.max_hp,
        conditions: c.conditions,
        condition_durations: c.condition_durations,
      }));
      // Beastmaster Ranger L3+ enters combat with an animal companion
      // (Wolf, MM stats: HP 11, AC 13, +4 to hit, 2d4+2 bite). PHB p.93.
      const companionEntities: CombatEntity[] = ctx.st.characters
        .filter(
          (c) =>
            !c.dead &&
            c.character_class.toLowerCase() === 'ranger' &&
            c.subclass === 'beastmaster' &&
            c.level >= 3
        )
        .map((c, ci) => ({
          id: `${c.id}:companion`,
          isEnemy: false,
          isCompanion: true,
          companionOwnerId: c.id,
          companionName: 'Wolf',
          pos: { x: 1 + ci, y: 2 },
          hp: 11,
          maxHp: 11,
          ac: 13,
          toHit: 4,
          damage: '2d4+2',
          conditions: [],
          condition_durations: {},
        }));
      const enemyEntities: CombatEntity[] = enemiesForInit.map((en, ei) => ({
        id: en.id,
        isEnemy: true,
        pos: { x: Math.max(0, gw - 2 - ei), y: Math.max(0, gh - 2) },
        hp: en.hp,
        maxHp: en.hp,
        conditions: [],
        condition_durations: {},
      }));
      ctx.st = {
        ...ctx.st,
        entities: [...pcEntities, ...companionEntities, ...enemyEntities],
        movement_used: {},
      };
    }

    // ── Surprise check (PHB p.189) ────────────────────────────────────
    // If the party averages a higher Stealth than the highest passive
    // Perception among the enemies, all enemies are surprised for round 1.
    const partyAvgStealth = Math.round(
      ctx.st.characters
        .filter((c) => !c.dead)
        .reduce((sum, c) => {
          const prof = c.skill_proficiencies?.includes('Stealth') ?? false;
          return sum + rollDice('1d20') + abilityMod(c.dex) + (prof ? profBonus(c.level) : 0);
        }, 0) / Math.max(1, ctx.st.characters.filter((c) => !c.dead).length)
    );
    const enemyPassivePerc = Math.max(...enemiesForInit.map((e) => 10 + abilityMod(e.wis ?? 10)));
    if (partyAvgStealth > enemyPassivePerc) {
      ctx.st = { ...ctx.st, surprised: enemiesForInit.map((e) => e.id) };
    }

    const orderText = order
      .map((e) => {
        const name = e.is_enemy
          ? (enemiesForInit.find((en) => en.id === e.id)?.name ?? 'Enemy')
          : (ctx.st.characters.find((c) => c.id === e.id)?.name ?? 'Hero');
        return `${name}(${e.roll})`;
      })
      .join(' → ');
    const surpriseLabel =
      enemiesForInit.length === 1
        ? `The ${enemiesForInit[0].name} is SURPRISED!`
        : `${enemiesForInit.map((e) => e.name).join(', ')} are SURPRISED!`;
    const surpriseNote = ctx.st.surprised?.length ? ` ${surpriseLabel}` : '';
    const combatPrefix = ctx.context.narratives.combatStart
      ? pick(ctx.context.narratives.combatStart).replace(/{enemy}/g, target.name) + ' '
      : 'Combat begins! ';
    ctx.narrative = `${combatPrefix}Initiative: ${orderText}.${surpriseNote} `;

    const myInitIdx = order.findIndex((e) => e.id === ctx.char.id);
    ctx.st.initiative_idx = myInitIdx >= 0 ? myInitIdx : 0;

    const myRoll = order.find((e) => e.id === ctx.char.id)?.roll ?? 0;
    // The triggering PC's attack runs immediately — they had the element of
    // surprise on the encounter even if their initiative wasn't highest.
    // After this opening swing, play returns to the initiative order at the
    // slot just past them (handled by the post-attack initiative advance).
    const isHighestInit = myInitIdx === 0;
    ctx.narrative += isHighestInit
      ? `${ctx.char.name} acts first (initiative ${myRoll})! `
      : `${ctx.char.name} strikes with the opening blow (initiative ${myRoll})! `;
  }

  // ── Resolve the player's attack ────────────────────────────────────────
  // Armor proficiency check (PHB p.144): non-proficient armor → disadv on
  // STR/DEX attack rolls.
  const equippedArmorLootItem = ctx.char.equipped_armor
    ? ctx.context.lootTable.find(
        (l) =>
          l.id === ctx.char.inventory?.find((i) => i.instance_id === ctx.char.equipped_armor)?.id
      )
    : null;
  const armorProficient = hasArmorProficiency(
    ctx.char.armor_proficiencies ?? [],
    equippedArmorLootItem?.armorCategory
  );
  const weaponProficient = hasWeaponProficiency(
    ctx.char.weapon_proficiencies ?? [],
    weaponItem?.weaponType
  );

  const rangedInMelee = weaponItem?.range === 'ranged';
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
    ctx.char.character_class.toLowerCase() === 'rogue' &&
    ((ctx.st.surprised ?? []).includes(targetId) || (ctx.st.round ?? 1) === 1);

  const vowAdv = ctx.st.vow_of_enmity_target === targetId;
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

  // Path of the Totem Warrior — Wolf (PHB p.51): "While raging, your
  // allies have advantage on melee attack rolls against any creature
  // within 5 feet of you that is hostile to you."
  const wolfAdv =
    weaponItem?.range !== 'ranged' &&
    !!ctx.st.entities &&
    ctx.st.characters.some((ally) => {
      if (ally.id === ctx.char.id) return false;
      if (ally.dead || ally.hp <= 0) return false;
      if (ally.subclass !== 'totem_warrior') return false;
      if (ally.character_class.toLowerCase() !== 'barbarian') return false;
      if (!ally.conditions.includes('raging')) return false;
      const allyEnt = ctx.st.entities?.find((e) => e.id === ally.id);
      const targetEnt = ctx.st.entities?.find((e) => e.id === targetId && e.isEnemy);
      if (!allyEnt || !targetEnt) return false;
      return distanceFeet(allyEnt.pos, targetEnt.pos) <= 5;
    });

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

  const advantage =
    conditionAdv ||
    enemyGrappled ||
    proneAdv ||
    enemyParalyzed ||
    flankingAdv ||
    helpAdv ||
    assassinAdv ||
    vowAdv ||
    recklessAdv ||
    inspirationAdv ||
    wolfAdv ||
    vexAdv ||
    studyAdv ||
    packTacticsAdv;

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
    ctx.char.character_class.toLowerCase() === 'fighter' &&
    ctx.char.level >= 3
      ? 19
      : 20;
  const sacredWeaponBonus =
    (ctx.char.class_resource_uses?.sacred_weapon_active ?? 0) > 0 ? abilityMod(ctx.char.cha) : 0;
  const guidedStrikeBonus = ctx.st.guided_strike_active ? 10 : 0;
  const totalAttackBonus = sacredWeaponBonus + guidedStrikeBonus;
  if (guidedStrikeBonus) ctx.st = { ...ctx.st, guided_strike_active: false };

  /**
   * Resolves one attack roll and applies it to enemy HP / narrative.
   * Returns true if the enemy was killed (so the caller can break early
   * from the Extra Attack loop). Mutates ctx.char, ctx.st, ctx.narrative,
   * ctx.usedInitiative directly.
   */
  const resolveOneAttack = (label: string): boolean => {
    const effectiveEnemyAc = target.ac + coverAcBonus;
    const assassinAutoCrit =
      ctx.char.subclass === 'assassin' && (ctx.st.surprised ?? []).includes(targetId);
    const atk = resolvePlayerAttack(
      { str: ctx.char.str, dex: ctx.char.dex, level: ctx.char.level },
      weaponDamage,
      effectiveEnemyAc,
      weaponItem?.finesse ?? false,
      disadvantage,
      advantage,
      weaponProficient,
      weaponItem?.range === 'ranged',
      critThresh,
      totalAttackBonus,
      ctx.char.species === 'halfling'
    );
    // Bardic Inspiration consumption on attack roll (2024 PHB p.52). If
    // a stashed BI die exists, roll it and add to total. If that turns a
    // miss into a hit, atk.hit flips AND we need to roll damage
    // (resolvePlayerAttack returned 0 damage on the original miss).
    let biNote = '';
    if (ctx.char.bardic_inspiration_die && !atk.fumble) {
      const biRoll = rollDice(`1${ctx.char.bardic_inspiration_die}`);
      atk.total += biRoll;
      const newHit = atk.roll === 20 || atk.total >= effectiveEnemyAc;
      if (!atk.hit && newHit) {
        atk.hit = true;
        atk.damage = Math.max(1, rollDice(weaponDamage ?? '1d4') + atk.atkMod);
      }
      biNote = ` ✦ Bardic Inspiration: +${biRoll} (${ctx.char.bardic_inspiration_die})`;
      ctx.char = { ...ctx.char, bardic_inspiration_die: undefined };
    }
    // Bless (PHB p.219): +1d4 to attack rolls. Same miss-to-hit
    // damage-roll concern as BI above.
    let blessNote = '';
    if ((ctx.char.conditions ?? []).includes('blessed') && !atk.fumble) {
      const blessRoll = rollDice('1d4');
      atk.total += blessRoll;
      const newHit = atk.roll === 20 || atk.total >= effectiveEnemyAc;
      if (!atk.hit && newHit) {
        atk.hit = true;
        atk.damage = Math.max(1, rollDice(weaponDamage ?? '1d4') + atk.atkMod);
      }
      blessNote = ` ✦ Bless: +${blessRoll} (1d4)`;
    }
    // Unconscious or Assassin-surprised: force crit on hit
    const autoCritCheck =
      (enemyUnconscious &&
        (!ctx.st.entities ||
          (() => {
            const charEnt = ctx.st.entities?.find((e) => e.id === ctx.char.id);
            const enmEnt = ctx.st.entities?.find((e) => e.id === targetId);
            return charEnt && enmEnt
              ? posEqual(
                  { x: charEnt.pos.x, y: charEnt.pos.y },
                  { x: enmEnt.pos.x, y: enmEnt.pos.y }
                ) ||
                  Math.max(
                    Math.abs(charEnt.pos.x - enmEnt.pos.x),
                    Math.abs(charEnt.pos.y - enmEnt.pos.y)
                  ) <= 1
              : true;
          })())) ||
      assassinAutoCrit;
    const isCrit = atk.critical || (autoCritCheck && atk.hit);
    const baseHit = weaponDamage
      ? isCrit && !atk.critical
        ? Math.max(1, rollCritical(weaponDamage) + atk.atkMod)
        : atk.damage
      : Math.max(1, unarmedDamage(ctx.char.str));
    const versatileNote = isVersatile ? ' (versatile)' : '';
    const coverNote = coverAcBonus > 0 ? ` +${coverAcBonus} cover` : '';
    const bonusNote = totalAttackBonus > 0 ? ` +${totalAttackBonus} bonus` : '';
    const atkNote =
      ' ' +
      fmt.note(
        `(${label}d20 ${atk.roll}+${atk.atkMod} ${atk.atkStat}+${atk.prof} prof${bonusNote} = ${atk.total} vs AC ${effectiveEnemyAc}${coverNote}${disadvNote}${versatileNote})${noProfNote}${biNote}${blessNote}`
      );

    if (atk.fumble) {
      // 2024 PHB — a Nat 1 on a d20 grants Heroic Inspiration. Failure
      // becomes the seed of next turn's success.
      let inspirationNote = '';
      if (!ctx.char.inspiration) {
        ctx.char = { ...ctx.char, inspiration: true };
        inspirationNote = ` ✦ Heroic Inspiration granted (${ctx.char.name}).`;
      }
      ctx.narrative += `Natural 1 — a fumble! ${weaponLabel} goes completely wide.${atkNote}${inspirationNote} `;
      ctx.st = pushEvent(ctx.st, {
        kind: 'attack_miss',
        attackerId: ctx.char.id,
        attackerName: ctx.char.name,
        targetId,
        targetName: target.name,
        toHit: atk.total,
        targetAc: target.ac,
        round: ctx.st.round ?? 1,
      });
      return false;
    }
    if (!atk.hit) {
      ctx.narrative += pickTiered(ctx.context.narratives.combatMiss, hpTier(ctx.char)).replace(
        /{enemy}/g,
        target.name
      );
      ctx.narrative += atkNote + ' ';
      ctx.st = pushEvent(ctx.st, {
        kind: 'attack_miss',
        attackerId: ctx.char.id,
        attackerName: ctx.char.name,
        targetId,
        targetName: target.name,
        toHit: atk.total,
        targetAc: target.ac,
        round: ctx.st.round ?? 1,
      });
      // 2024 PHB Fighter L13 — Studied Attacks. On miss, mark the target
      // so this Fighter's next attack against them has advantage.
      if (ctx.char.character_class.toLowerCase() === 'fighter' && ctx.char.level >= 13) {
        const tag = `studied_by_${ctx.char.id}`;
        ctx.st = {
          ...ctx.st,
          entities: (ctx.st.entities ?? []).map((e) =>
            e.id === targetId && e.isEnemy
              ? {
                  ...e,
                  conditions: [...e.conditions.filter((c) => c !== tag), tag],
                }
              : e
          ),
        };
        ctx.narrative += ` [Studied Attacks: advantage on next attack vs ${target.name}]`;
      }
      // 2024 PHB Graze weapon mastery (greatsword, glaive) — even on a
      // miss, deal STR mod damage (DEX for Finesse weapons). Floor at 0.
      if (
        weaponItem?.mastery === 'graze' &&
        (ctx.char.weapon_masteries ?? []).includes(weaponItem.id)
      ) {
        const grazeMod = weaponItem.finesse ? abilityMod(ctx.char.dex) : abilityMod(ctx.char.str);
        const grazeDmg = Math.max(0, grazeMod);
        if (grazeDmg > 0) {
          const grazedHp = Math.max(0, target.hp - grazeDmg);
          ctx.st = {
            ...ctx.st,
            entities: (ctx.st.entities ?? []).map((e) =>
              e.id === targetId && e.isEnemy ? { ...e, hp: grazedHp } : e
            ),
          };
          ctx.narrative += `[Graze: ${target.name} still takes ${fmt.dmg(grazeDmg)} damage from the swing.] `;
        }
      }
      return false;
    }

    // ── Hit ──────────────────────────────────────────────────────────────
    // Sneak Attack (SRD 5.2.1 — Rogue): once per turn, on a hit, with
    // either advantage on the attack OR an ally within 5 ft of the target
    // (and you don't have disadvantage). Weapon must be Finesse or Ranged.
    let sneakDmg = 0;
    if (features.includes('sneak_attack')) {
      const isFinesseOrRanged = (weaponItem?.finesse ?? false) || weaponItem?.range === 'ranged';
      let allyAdjacent = false;
      if (ctx.st.entities) {
        const targetEnt = ctx.st.entities.find((e) => e.id === targetId && e.isEnemy);
        if (targetEnt) {
          allyAdjacent = ctx.st.entities.some(
            (e) =>
              !e.isEnemy &&
              e.id !== ctx.char.id &&
              e.hp > 0 &&
              Math.max(Math.abs(e.pos.x - targetEnt.pos.x), Math.abs(e.pos.y - targetEnt.pos.y)) <=
                1
          );
        }
      } else {
        allyAdjacent = ctx.st.characters.some((c) => !c.dead && c.id !== ctx.char.id);
      }
      const hasAdv = advantage && !disadvantage;
      const triggers = (hasAdv || allyAdjacent) && !disadvantage;
      if (isFinesseOrRanged && triggers) {
        const saExpr = sneakAttackDice(ctx.char.level);
        sneakDmg = isCrit ? rollCritical(saExpr) : rollDice(saExpr);
        // 2024 PHB Cunning Strike: if the player pre-committed an effect,
        // subtract one die from the SA roll (average 3.5 on 1d6).
        if (ctx.char.turn_actions.cunning_strike_pending) {
          sneakDmg = Math.max(0, sneakDmg - rollDice('1d6'));
        }
      }
    }

    const rageBonus =
      features.includes('rage') && isRaging && atk.atkStat === 'STR'
        ? rageDamageBonus(ctx.char.level)
        : 0;

    const rawDmg = baseHit + sneakDmg + rageBonus;
    const { damage: finalDmg, note: dmgNote } = applyDamageMultiplier(
      rawDmg,
      weaponItem?.damageType,
      target
    );
    const enemyEnt = ctx.st.entities?.find((e) => e.id === targetId && e.isEnemy);
    const curEnemyHp = enemyEnt?.hp ?? 0;
    const newEnemyHp = curEnemyHp - finalDmg;

    ctx.narrative += buildCombatHitNarrative(
      target,
      weaponItem,
      finalDmg,
      isCrit,
      ctx.char,
      ctx.context
    );
    ctx.narrative += atkNote;
    if (isCrit && assassinAutoCrit)
      ctx.narrative += ` [Assassinate — auto-crit on surprised target!]`;
    if (sacredWeaponBonus > 0) ctx.narrative += ` [Sacred Weapon: +${sacredWeaponBonus} to hit]`;
    if (sneakDmg > 0) {
      const saExpr = sneakAttackDice(ctx.char.level);
      const saLabel = isCrit ? `${parseInt(saExpr) * 2}d6 (crit)` : saExpr;
      ctx.narrative += ` [Sneak Attack ${saLabel}: +${sneakDmg}]`;
    }
    if (rageBonus > 0) ctx.narrative += ` [Rage: +${rageBonus}]`;
    if (dmgNote) ctx.narrative += dmgNote;

    ctx.st = pushEvent(ctx.st, {
      kind: 'attack_hit',
      attackerId: ctx.char.id,
      attackerName: ctx.char.name,
      targetId,
      targetName: target.name,
      damage: finalDmg,
      damageType: weaponItem?.damageType ?? 'physical',
      isCrit,
      toHit: atk.total,
      targetAc: target.ac,
      round: ctx.st.round ?? 1,
    });

    // ── 2024 PHB Cunning Strike effect application ───────────────────────
    if (ctx.char.turn_actions.cunning_strike_pending && sneakDmg > 0 && newEnemyHp > 0) {
      const csEffect = ctx.char.turn_actions.cunning_strike_pending;
      const csDc = 8 + profBonus(ctx.char.level) + abilityMod(ctx.char.dex);
      ctx.char = {
        ...ctx.char,
        turn_actions: { ...ctx.char.turn_actions, cunning_strike_pending: undefined },
      };
      if (csEffect === 'trip') {
        const enemyDex = (target.dex ?? 10) as number;
        const dexSave = rollDice('1d20') + abilityMod(enemyDex);
        if (dexSave < csDc) {
          ctx.st = {
            ...ctx.st,
            entities: (ctx.st.entities ?? []).map((e) =>
              e.id === targetId && e.isEnemy
                ? {
                    ...e,
                    conditions: [...e.conditions.filter((c) => c !== 'prone'), 'prone'],
                  }
                : e
            ),
          };
          ctx.st = pushEvent(ctx.st, {
            kind: 'condition_applied',
            targetId,
            targetName: target.name,
            condition: 'prone',
            source: 'Cunning Strike: Trip',
            round: ctx.st.round ?? 1,
          });
          ctx.narrative += ` [Cunning Strike — Trip: DEX ${dexSave} vs DC ${csDc} — ${target.name} is prone!]`;
        } else {
          ctx.narrative += ` [Cunning Strike — Trip: DEX ${dexSave} vs DC ${csDc} — resists]`;
        }
      } else if (csEffect === 'poison') {
        const enemyCon = (target.con ?? 10) as number;
        const conSave = rollDice('1d20') + abilityMod(enemyCon);
        if (target.condition_immunities?.includes('poisoned')) {
          ctx.narrative += ` [Cunning Strike — Poison: ${target.name} is immune]`;
        } else if (conSave < csDc) {
          ctx.st = {
            ...ctx.st,
            entities: (ctx.st.entities ?? []).map((e) =>
              e.id === targetId && e.isEnemy
                ? {
                    ...e,
                    conditions: [...e.conditions.filter((c) => c !== 'poisoned'), 'poisoned'],
                  }
                : e
            ),
          };
          ctx.st = pushEvent(ctx.st, {
            kind: 'condition_applied',
            targetId,
            targetName: target.name,
            condition: 'poisoned',
            source: 'Cunning Strike: Poison',
            round: ctx.st.round ?? 1,
          });
          ctx.narrative += ` [Cunning Strike — Poison: CON ${conSave} vs DC ${csDc} — ${target.name} is poisoned!]`;
        } else {
          ctx.narrative += ` [Cunning Strike — Poison: CON ${conSave} vs DC ${csDc} — resists]`;
        }
      } else if (csEffect === 'withdraw') {
        ctx.char = {
          ...ctx.char,
          turn_actions: { ...ctx.char.turn_actions, disengaged: true },
        };
        ctx.narrative += ` [Cunning Strike — Withdraw: ${ctx.char.name} disengages without provoking OAs]`;
      } else if (csEffect === 'disarm') {
        ctx.st = {
          ...ctx.st,
          entities: (ctx.st.entities ?? []).map((e) =>
            e.id === targetId && e.isEnemy
              ? {
                  ...e,
                  conditions: [...e.conditions.filter((c) => c !== 'disarmed'), 'disarmed'],
                }
              : e
          ),
        };
        ctx.st = pushEvent(ctx.st, {
          kind: 'condition_applied',
          targetId,
          targetName: target.name,
          condition: 'disarmed',
          source: 'Cunning Strike: Disarm',
          round: ctx.st.round ?? 1,
        });
        ctx.narrative += ` [Cunning Strike — Disarm: ${target.name} drops their weapon!]`;
      }
    }

    // ── 2024 PHB Weapon Mastery on hit ────────────────────────────────────
    if (
      weaponItem?.mastery &&
      newEnemyHp > 0 &&
      (ctx.char.weapon_masteries ?? []).includes(weaponItem.id)
    ) {
      // 2024 PHB Fighter L9 Tactical Master — pre-armed swap wins over the
      // weapon's printed mastery for this one attack.
      let mastery = weaponItem.mastery;
      if (ctx.char.turn_actions.tactical_master_mastery) {
        mastery = ctx.char.turn_actions.tactical_master_mastery;
        ctx.char = {
          ...ctx.char,
          turn_actions: { ...ctx.char.turn_actions, tactical_master_mastery: undefined },
        };
        ctx.narrative += ` [Tactical Master: applying ${mastery.toUpperCase()}]`;
      }
      const weaponDc = 8 + profBonus(ctx.char.level) + abilityMod(ctx.char.str);
      if (mastery === 'vex') {
        const tag = `vexed_by_${ctx.char.id}`;
        ctx.st = {
          ...ctx.st,
          entities: (ctx.st.entities ?? []).map((e) =>
            e.id === targetId && e.isEnemy
              ? { ...e, conditions: [...e.conditions.filter((c) => c !== tag), tag] }
              : e
          ),
        };
        ctx.narrative += ` [Vex: advantage on your next attack vs ${target.name}]`;
      } else if (mastery === 'topple') {
        const enemyCon = (target.con ?? 10) as number;
        const conSave = rollDice('1d20') + abilityMod(enemyCon);
        if (conSave < weaponDc) {
          ctx.st = {
            ...ctx.st,
            entities: (ctx.st.entities ?? []).map((e) =>
              e.id === targetId && e.isEnemy
                ? {
                    ...e,
                    conditions: [...e.conditions.filter((c) => c !== 'prone'), 'prone'],
                  }
                : e
            ),
          };
          ctx.st = pushEvent(ctx.st, {
            kind: 'condition_applied',
            targetId,
            targetName: target.name,
            condition: 'prone',
            source: 'Topple (weapon mastery)',
            round: ctx.st.round ?? 1,
          });
          ctx.narrative += ` [Topple: CON ${conSave} vs DC ${weaponDc} — ${target.name} is prone!]`;
        } else {
          ctx.narrative += ` [Topple: CON ${conSave} vs DC ${weaponDc} — resists]`;
        }
      } else if (mastery === 'push') {
        const charEnt = ctx.st.entities?.find((e) => e.id === ctx.char.id);
        const targetEnt = ctx.st.entities?.find((e) => e.id === targetId && e.isEnemy);
        if (charEnt && targetEnt) {
          const dx = Math.sign(targetEnt.pos.x - charEnt.pos.x);
          const dy = Math.sign(targetEnt.pos.y - charEnt.pos.y);
          const newPos = { x: targetEnt.pos.x + dx * 2, y: targetEnt.pos.y + dy * 2 };
          ctx.st = {
            ...ctx.st,
            entities: (ctx.st.entities ?? []).map((e) =>
              e.id === targetId && e.isEnemy ? { ...e, pos: newPos } : e
            ),
          };
          ctx.narrative += ` [Push: ${target.name} shoved 10 ft back]`;
        }
      } else if (mastery === 'sap') {
        ctx.st = {
          ...ctx.st,
          entities: (ctx.st.entities ?? []).map((e) =>
            e.id === targetId && e.isEnemy
              ? {
                  ...e,
                  conditions: [...e.conditions.filter((c) => c !== 'sapped'), 'sapped'],
                }
              : e
          ),
        };
        ctx.narrative += ` [Sap: ${target.name} has disadvantage on its next attack]`;
      } else if (mastery === 'slow') {
        ctx.st = {
          ...ctx.st,
          entities: (ctx.st.entities ?? []).map((e) =>
            e.id === targetId && e.isEnemy
              ? {
                  ...e,
                  conditions: [...e.conditions.filter((c) => c !== 'slowed'), 'slowed'],
                }
              : e
          ),
        };
        ctx.narrative += ` [Slow: ${target.name}'s speed -10 ft]`;
      } else if (mastery === 'cleave') {
        // 2024 PHB Cleave (greataxe, halberd) — second enemy within 5 ft
        // takes the weapon's damage die (no ability mod).
        const targetEnt = ctx.st.entities?.find((e) => e.id === targetId && e.isEnemy);
        if (targetEnt && weaponItem.damage) {
          const cleaveTarget = (ctx.st.entities ?? []).find(
            (e) =>
              e.isEnemy &&
              e.hp > 0 &&
              e.id !== targetId &&
              Math.max(Math.abs(e.pos.x - targetEnt.pos.x), Math.abs(e.pos.y - targetEnt.pos.y)) <=
                1
          );
          if (cleaveTarget) {
            const cleaveDmg = rollDice(weaponItem.damage);
            const cleaveNewHp = Math.max(0, cleaveTarget.hp - cleaveDmg);
            ctx.st = {
              ...ctx.st,
              entities: (ctx.st.entities ?? []).map((e) =>
                e.id === cleaveTarget.id ? { ...e, hp: cleaveNewHp } : e
              ),
            };
            const cleaveName = getEnemyById(ctx.seed, cleaveTarget.id)?.name ?? cleaveTarget.id;
            ctx.narrative += ` ${fmt.note(`[Cleave: ${cleaveName} also takes ${cleaveDmg} damage!${cleaveNewHp <= 0 ? ' (killed)' : ''}]`)}`;
            if (cleaveNewHp <= 0) {
              const cleaveXp = getEnemyById(ctx.seed, cleaveTarget.id)?.xp ?? 0;
              const cleaveSplit = splitEncounterXp(ctx.st, ctx.char.id, cleaveXp);
              ctx.st = cleaveSplit.st;
              ctx.char = { ...ctx.char, xp: (ctx.char.xp || 0) + cleaveSplit.share };
              ctx.narrative += applyPartyLevelUps(ctx.st, ctx.char, ctx.context);
            }
          }
        }
      }
    }

    if (newEnemyHp <= 0) {
      const xpGain = target.xp ?? 10 + (target.hp || 8);
      const killSplit = splitEncounterXp(ctx.st, ctx.char.id, xpGain);
      ctx.st = killSplit.st;
      const xpShare = killSplit.share;
      ctx.char = { ...ctx.char, xp: (ctx.char.xp || 0) + xpShare };
      ctx.st = {
        ...ctx.st,
        entities: (ctx.st.entities ?? []).map((e) =>
          e.id === targetId && e.isEnemy ? { ...e, hp: 0 } : e
        ),
        enemies_killed: [...ctx.st.enemies_killed, targetId],
      };
      ctx.narrative += grantDarkOnesBlessing(ctx.char);
      // Only end combat once every enemy in the room is down
      if (isRoomCleared(ctx.st, ctx.seed, ctx.roomId)) {
        ctx.st = endCombatState(ctx.st);
        ctx.char = {
          ...ctx.char,
          conditions: ctx.char.conditions.filter((c) => c !== 'raging'),
        };
      }
      ctx.st = pushEvent(ctx.st, {
        kind: 'kill',
        attackerId: ctx.char.id,
        attackerName: ctx.char.name,
        victimId: targetId,
        victimName: target.name,
        xp: xpShare,
        round: ctx.st.round ?? 1,
      });
      ctx.narrative +=
        ' ' +
        pick(ctx.context.narratives.killShot)
          .replace('{enemy}', target.name)
          .replace('{xp}', String(xpShare));
      ctx.narrative += applyPartyLevelUps(ctx.st, ctx.char, ctx.context);
      ctx.usedInitiative = true;
      return true;
    }
    ctx.st = {
      ...ctx.st,
      entities: (ctx.st.entities ?? []).map((e) =>
        e.id === targetId && e.isEnemy ? { ...e, hp: newEnemyHp } : e
      ),
    };
    ctx.narrative += ` The ${target.name} has ${fmt.hp(newEnemyHp)} HP remaining. `;
    return false;
  };

  // ── First attack ─────────────────────────────────────────────────────
  const killed = resolveOneAttack('');
  if (!killed) {
    // ── Extra Attack (Fighter/Warrior level 5+) ───────────────────────
    // SRD 5.2.1 p.90 "Loading": a Loading weapon fires only once per
    // Action/Bonus/Reaction regardless of Extra Attack.
    const extraCount =
      features.includes('extra_attack') && !weaponItem?.loading
        ? extraAttackCount(ctx.char.character_class, ctx.char.level)
        : 0;
    for (let ei = 0; ei < extraCount; ei++) {
      if ((ctx.st.entities?.find((e) => e.id === targetId && e.isEnemy)?.hp ?? 0) <= 0) break;
      const killedExtra = resolveOneAttack(`Attack ${ei + 2} — `);
      if (killedExtra) break;
    }
  }

  // Action consumed. Initiative advances unless a bonus-action choice is
  // available (checked after commitChar — see auto-advance block below
  // the switch).
  ctx.char = { ...ctx.char, turn_actions: { ...ctx.char.turn_actions, action_used: true } };
};
