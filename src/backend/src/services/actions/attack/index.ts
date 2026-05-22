import {
  abilityMod,
  applyDamageMultiplier,
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
  endCombatState,
  getEnemyById,
  grantDarkOnesBlessing,
  isRoomCleared,
  pick,
  splitEncounterXp,
} from '../../gameEngine.js';
import { extraAttackCountForChar, getClassLevel, hasClass } from '../../multiclass.js';
import type { ActionHandler } from '../types.js';
import { composeNow } from '../../narrative/compose.js';
import { computeToHitContext } from './toHit.js';
import { fmt } from '../../narrativeFmt.js';
import { posEqual } from '../../gridEngine.js';
import { runCombatStart } from './combatStart.js';
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

  // ── Combat-start: only fires on the first attack of an encounter.
  //    Rolls initiative for everyone, seeds grid entities (PCs +
  //    Beastmaster companions + enemies), runs the surprise check, and
  //    emits the opening-blow narrative. See attack/combatStart.ts.
  runCombatStart(ctx, target);

  // ── To-hit context: compute armor/weapon proficiency, all the
  //    advantage/disadvantage sources, cover/flanking, crit threshold,
  //    Sacred Weapon and Guided Strike bonuses, etc. Mutates ctx to
  //    consume one-shot tags (Vex, Studied, Help target, Heroic
  //    Inspiration, Guided Strike). See attack/toHit.ts.
  const toHit = computeToHitContext(ctx, { target, targetId, weaponItem });
  const {
    weaponProficient,
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
    sharpshooterActive,
  } = toHit;

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
    let baseHit = weaponDamage
      ? isCrit && !atk.critical
        ? Math.max(1, rollCritical(weaponDamage) + atk.atkMod)
        : atk.damage
      : Math.max(1, unarmedDamage(ctx.char.str, (ctx.char.feats ?? []).includes('tavern_brawler')));

    // 2024 PHB Savage Attacker origin feat — once per turn, on a
    // weapon-damage hit, reroll the damage and use the higher total.
    // Gates on `turn_actions.savage_attacker_used` to enforce the
    // once-per-turn limit across Extra Attack / two-weapon sequences.
    // Unarmed strikes don't carry a `weaponDamage` expression, so
    // they're excluded (RAW: feat reads "weapon's damage roll").
    if (
      atk.hit &&
      weaponDamage &&
      (ctx.char.feats ?? []).includes('savage_attacker') &&
      !ctx.char.turn_actions.savage_attacker_used
    ) {
      const reroll = isCrit
        ? Math.max(1, rollCritical(weaponDamage) + atk.atkMod)
        : Math.max(1, rollDice(weaponDamage) + atk.atkMod);
      if (reroll > baseHit) baseHit = reroll;
      ctx.char = {
        ...ctx.char,
        turn_actions: { ...ctx.char.turn_actions, savage_attacker_used: true },
      };
    }
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
      const bonuses: { label: string }[] = [];
      if (!ctx.char.inspiration) {
        ctx.char = { ...ctx.char, inspiration: true };
        // Inspiration grant is conceptually a narrative aside, not a
        // mechanical bracket — but routing it through bonuses keeps
        // LLM input free of the ✦ symbol and keeps the composer as
        // the single source of fragment prose.
        bonuses.push({ label: `✦ Heroic Inspiration granted (${ctx.char.name}).` });
      }
      composeNow(ctx, {
        kind: 'attack_miss',
        attackerId: ctx.char.id,
        attackerName: ctx.char.name,
        target,
        weaponLabel,
        toHit: atk.total,
        targetAc: target.ac,
        atkNote,
        reason: 'fumble',
        bonuses,
      });
      return false;
    }
    if (!atk.hit) {
      const bonuses: { label: string }[] = [];
      // 2024 PHB Fighter L13 — Studied Attacks. On miss, mark the target
      // so this Fighter's next attack against them has advantage.
      if (hasClass(ctx.char, 'fighter') && getClassLevel(ctx.char, 'fighter') >= 13) {
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
        bonuses.push({
          label: `Studied Attacks: advantage on next attack vs ${target.name}`,
        });
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
          bonuses.push({
            label: `Graze: ${target.name} still takes ${fmt.dmg(grazeDmg)} damage from the swing.`,
          });
        }
      }
      composeNow(ctx, {
        kind: 'attack_miss',
        attackerId: ctx.char.id,
        attackerName: ctx.char.name,
        target,
        weaponLabel,
        toHit: atk.total,
        targetAc: target.ac,
        atkNote,
        bonuses,
      });
      return false;
    }

    // ── Hit ──────────────────────────────────────────────────────────────
    // Sneak Attack (SRD 5.2.1 — Rogue): once per turn, on a hit, with
    // either advantage on the attack OR an ally within 5 ft of the target
    // (and you don't have disadvantage). Weapon must be Finesse or Ranged.
    // Multiclass: gate on `hasClass(char, 'rogue')` so a Fighter 5 /
    // Rogue 2 actually gets Sneak Attack (the `features` array reads
    // only the PC's PRIMARY class). Dice scale below uses
    // `getClassLevel(char, 'rogue')` for the same reason.
    let sneakDmg = 0;
    if (hasClass(ctx.char, 'rogue')) {
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
        const saExpr = sneakAttackDice(getClassLevel(ctx.char, 'rogue'));
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

    // ── Divine Smite (2024 PHB) ─────────────────────────────────────
    // Pre-buff from the bonus-action `divine_smite_spell` cast.
    // Consumes `divine_smite_dice` on the next weapon hit and rolls
    // that many d8 radiant. Crit doubles the dice per RAW
    // ("you can roll the spell's damage dice twice and add them
    // together" — 2024 PHB Divine Smite).
    let smiteDmg = 0;
    let smiteDice = 0;
    if ((ctx.char.divine_smite_dice ?? 0) > 0 && (weaponItem || hasClass(ctx.char, 'monk'))) {
      smiteDice = ctx.char.divine_smite_dice!;
      const expr = `${smiteDice}d8`;
      smiteDmg = isCrit ? rollCritical(expr) : rollDice(expr);
      ctx.char.divine_smite_dice = undefined;
    }

    // ── Improved Divine Smite (Paladin L11+) ────────────────────────
    // Passive radiant rider: every melee-weapon hit adds 1d8 radiant.
    // (No interaction with the spell version — both stack RAW. Crit
    // doubles the d8.) RAW restricts to Melee Weapon only — ranged
    // attacks don't qualify; the spell version DOES allow ranged so
    // the gating differs between the two.
    let improvedSmiteDmg = 0;
    if (
      hasClass(ctx.char, 'paladin') &&
      getClassLevel(ctx.char, 'paladin') >= 11 &&
      weaponItem &&
      weaponItem.range !== 'ranged'
    ) {
      improvedSmiteDmg = isCrit ? rollCritical('1d8') : rollDice('1d8');
    }

    // Sharpshooter — +10 damage on ranged-weapon hits when active.
    // Same damage type as the weapon → folded into rawDmg so the
    // resistance / vulnerability multiplier applies (RAW: a creature
    // resistant to piercing halves the +10 too).
    const sharpshooterDmg = sharpshooterActive ? 10 : 0;
    const rawDmg = baseHit + sneakDmg + rageBonus + sharpshooterDmg;
    const { damage: finalDmg, note: dmgNote } = applyDamageMultiplier(
      rawDmg,
      weaponItem?.damageType,
      target
    );
    // Radiant damage rides on top of the weapon multiplier (a creature
    // resistant to the weapon's damage type still takes full radiant).
    // RAW radiant-resistant creatures would halve this too — TODO:
    // separate multiplier check for radiant.
    const radiantRider = smiteDmg + improvedSmiteDmg;
    const totalDmg = finalDmg + radiantRider;
    const enemyEnt = ctx.st.entities?.find((e) => e.id === targetId && e.isEnemy);
    const curEnemyHp = enemyEnt?.hp ?? 0;
    const newEnemyHp = curEnemyHp - totalDmg;

    const hitBonuses: { label: string }[] = [];
    if (isCrit && assassinAutoCrit) {
      hitBonuses.push({ label: 'Assassinate — auto-crit on surprised target!' });
    }
    if (sacredWeaponBonus > 0) {
      hitBonuses.push({ label: `Sacred Weapon: +${sacredWeaponBonus} to hit` });
    }
    if (sneakDmg > 0) {
      const saExpr = sneakAttackDice(getClassLevel(ctx.char, 'rogue'));
      const saLabel = isCrit ? `${parseInt(saExpr) * 2}d6 (crit)` : saExpr;
      hitBonuses.push({ label: `Sneak Attack ${saLabel}: +${sneakDmg}` });
    }
    if (rageBonus > 0) {
      hitBonuses.push({ label: `Rage: +${rageBonus}` });
    }
    if (sharpshooterDmg > 0) {
      hitBonuses.push({ label: `Sharpshooter: +${sharpshooterDmg} (-5 to hit)` });
    }
    if (dmgNote) {
      // dmgNote arrives as " [resistant: 6 → 3]" — strip leading space and
      // the surrounding brackets so the composer's fmt.note wrap doesn't
      // double-bracket.
      const labelText = dmgNote.replace(/^\s*\[(.*)\]\s*$/, '$1');
      hitBonuses.push({ label: labelText });
    }
    if (smiteDmg > 0) {
      const expr = isCrit ? `${smiteDice * 2}d8 (crit)` : `${smiteDice}d8`;
      hitBonuses.push({ label: `Divine Smite ${expr}: +${smiteDmg} radiant` });
    }
    if (improvedSmiteDmg > 0) {
      const expr = isCrit ? '2d8 (crit)' : '1d8';
      hitBonuses.push({ label: `Improved Divine Smite ${expr}: +${improvedSmiteDmg} radiant` });
    }
    composeNow(ctx, {
      kind: 'attack_hit',
      attackerId: ctx.char.id,
      attackerName: ctx.char.name,
      target,
      weapon: weaponItem ?? null,
      damage: totalDmg,
      damageType: weaponItem?.damageType ?? 'physical',
      isCrit,
      toHit: atk.total,
      targetAc: target.ac,
      atkNote,
      bonuses: hitBonuses,
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
          composeNow(ctx, {
            kind: 'condition_applied',
            targetId,
            targetName: target.name,
            condition: 'prone',
            source: 'Cunning Strike: Trip',
            prose: ` ${fmt.note(`[Cunning Strike — Trip: DEX ${dexSave} vs DC ${csDc} — ${target.name} is prone!]`)}`,
          });
        } else {
          ctx.narrative += ` ${fmt.note(`[Cunning Strike — Trip: DEX ${dexSave} vs DC ${csDc} — resists]`)}`;
        }
      } else if (csEffect === 'poison') {
        const enemyCon = (target.con ?? 10) as number;
        const conSave = rollDice('1d20') + abilityMod(enemyCon);
        if (target.condition_immunities?.includes('poisoned')) {
          ctx.narrative += ` ${fmt.note(`[Cunning Strike — Poison: ${target.name} is immune]`)}`;
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
          composeNow(ctx, {
            kind: 'condition_applied',
            targetId,
            targetName: target.name,
            condition: 'poisoned',
            source: 'Cunning Strike: Poison',
            prose: ` ${fmt.note(`[Cunning Strike — Poison: CON ${conSave} vs DC ${csDc} — ${target.name} is poisoned!]`)}`,
          });
        } else {
          ctx.narrative += ` ${fmt.note(`[Cunning Strike — Poison: CON ${conSave} vs DC ${csDc} — resists]`)}`;
        }
      } else if (csEffect === 'withdraw') {
        ctx.char = {
          ...ctx.char,
          turn_actions: { ...ctx.char.turn_actions, disengaged: true },
        };
        ctx.narrative += ` ${fmt.note(`[Cunning Strike — Withdraw: ${ctx.char.name} disengages without provoking OAs]`)}`;
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
        composeNow(ctx, {
          kind: 'condition_applied',
          targetId,
          targetName: target.name,
          condition: 'disarmed',
          source: 'Cunning Strike: Disarm',
          prose: ` ${fmt.note(`[Cunning Strike — Disarm: ${target.name} drops their weapon!]`)}`,
        });
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
        ctx.narrative += ` ${fmt.note(`[Tactical Master: applying ${mastery.toUpperCase()}]`)}`;
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
        ctx.narrative += ` ${fmt.note(`[Vex: advantage on your next attack vs ${target.name}]`)}`;
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
          composeNow(ctx, {
            kind: 'condition_applied',
            targetId,
            targetName: target.name,
            condition: 'prone',
            source: 'Topple (weapon mastery)',
            prose: ` ${fmt.note(`[Topple: CON ${conSave} vs DC ${weaponDc} — ${target.name} is prone!]`)}`,
          });
        } else {
          ctx.narrative += ` ${fmt.note(`[Topple: CON ${conSave} vs DC ${weaponDc} — resists]`)}`;
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
          ctx.narrative += ` ${fmt.note(`[Push: ${target.name} shoved 10 ft back]`)}`;
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
        ctx.narrative += ` ${fmt.note(`[Sap: ${target.name} has disadvantage on its next attack]`)}`;
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
        ctx.narrative += ` ${fmt.note(`[Slow: ${target.name}'s speed -10 ft]`)}`;
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
      const killProse =
        ' ' +
        pick(ctx.context.narratives.killShot)
          .replace('{enemy}', target.name)
          .replace('{xp}', String(xpShare));
      composeNow(ctx, {
        kind: 'attack_kill',
        attackerId: ctx.char.id,
        attackerName: ctx.char.name,
        victimId: targetId,
        victimName: target.name,
        xp: xpShare,
        killProse,
      });
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
    // ── Extra Attack (Fighter L5+, Ranger/Paladin/Barbarian/Monk L5) ───
    // SRD 5.2.1 p.90 "Loading": a Loading weapon fires only once per
    // Action/Bonus/Reaction regardless of Extra Attack.
    // Multiclass: `extraAttackCountForChar` walks all class levels
    // and takes the max. RAW: Extra Attack from multiple classes
    // doesn't add together — a Fighter 5 / Ranger 5 gets 1 extra
    // (not 2). The Fighter L11/20 cap only applies when the PC
    // actually has 11+ fighter levels.
    const extraCount = weaponItem?.loading ? 0 : extraAttackCountForChar(ctx.char);
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
