import type { Enemy, InventoryItem, LootItem } from '../../../types.js';
import { SQUARE_SIZE, posEqual } from '../../gridEngine.js';
import {
  abilityMod,
  applyDamageMultiplier,
  profBonus,
  rageDamageBonus,
  resolvePlayerAttack,
  rollCritical,
  rollCriticalGwf,
  rollDice,
  rollDiceGwf,
  sneakAttackDice,
  unarmedDamage,
} from '../../rulesEngine.js';
import {
  applyPartyLevelUps,
  effectiveSpeed,
  endCombatState,
  getEnemyById,
  grantDarkOnesBlessing,
  isRoomCleared,
  pick,
  splitEncounterXp,
} from '../../gameEngine.js';
import { consumeStrokeOfLuck, strokeOfLuckAvailable } from '../../strokeOfLuck.js';
import {
  divineStrikeDie,
  extraAttackCountForChar,
  getClassLevel,
  hasClass,
  peerlessSkillDie,
} from '../../multiclass.js';
import type { ActionContext } from '../types.js';
import type { ToHitContext } from './toHit.js';
import { composeNow } from '../../narrative/compose.js';
import { fmt } from '../../narrativeFmt.js';
import { hasFightingStyle } from '../../fightingStyle.js';
import { updatePcActor } from '../actor.js';

/**
 * Bundles the per-attack resolved state that resolveOneAttack reads —
 * the target / weapon payload from `runPreattack` plus the to-hit
 * derivations from `computeToHitContext`. Computed once per attack
 * action and reused across the first attack + any Extra Attack
 * iterations so adv/disadv state stays stable across the loop.
 */
export interface AttackContext {
  target: Enemy;
  targetId: string;
  weaponItem: (LootItem & InventoryItem) | null;
  weaponDamage: string | null;
  isVersatile: boolean;
  weaponLabel: string;
  toHit: ToHitContext;
  /** 2024 PHB Heroic Inspiration / Lucky-RAW reroll plumbing — when set,
   *  resolveOneAttack passes this d20 to resolvePlayerAttack via
   *  `forceRoll1`. Caller is responsible for clearing the resource that
   *  granted the reroll BEFORE re-invoking, to prevent infinite-pause
   *  loops on a second miss. */
  forceD20?: number;
}

/**
 * Resolves one attack roll and applies it to enemy HP / narrative.
 * Returns true if the enemy was killed (so the caller can break early
 * from the Extra Attack loop). Mutates pc.char, ctx.st, ctx.narrative,
 * ctx.usedInitiative directly.
 *
 * Extracted from `attack/index.ts` (PR series 30) — was a ~615-line
 * closure capturing ~20 outer-scope variables. Behavior is unchanged;
 * the captures are now explicit fields on `AttackContext`.
 */
export function resolveOneAttack(
  ctx: ActionContext,
  atkCtx: AttackContext,
  label: string
): boolean {
  if (ctx.actor.kind !== 'pc') return false;
  const pc = ctx.actor;
  const { target, targetId, weaponItem, weaponDamage, isVersatile, weaponLabel, toHit } = atkCtx;
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
  } = toHit;

  // SRD Barbarian Brutal Strike (L9): while Reckless, a pre-committed rider
  // forgoes the Reckless advantage on one STR melee attack that isn't at
  // disadvantage; on a hit it deals +1d10 (weapon's type) and applies the
  // chosen effect. `effectiveAdvantage` drops the advantage for this swing.
  const brutalRider = pc.char.turn_actions.brutal_strike_pending;
  const brutalStrikeApplies =
    !!brutalRider &&
    getClassLevel(pc.char, 'barbarian') >= 9 &&
    !!pc.char.turn_actions.reckless &&
    weaponItem?.range !== 'ranged' &&
    !disadvantage;
  const effectiveAdvantage = brutalStrikeApplies ? false : advantage;

  // 2024 PHB Slow — slowed creature takes -2 AC. Read the live target
  // entity (target.ac comes from the seed template; the slowed flag
  // lives on the grid entity). Stacks with cover (RAW: penalties +
  // bonuses are additive).
  const targetEntForSlow = ctx.st.entities?.find((e) => e.id === targetId && e.isEnemy);
  const slowedAcPenalty = targetEntForSlow?.conditions.includes('slowed') ? 2 : 0;
  const effectiveEnemyAc = target.ac + coverAcBonus - slowedAcPenalty;
  // SRD Fighting Style: Great Weapon Fighting — applies to a two-handed melee
  // weapon (a heavy two-handed weapon, or a versatile weapon used two-handed).
  const gwfApplies =
    !!weaponItem &&
    weaponItem.range !== 'ranged' &&
    hasFightingStyle(pc.char, 'great_weapon') &&
    (isVersatile || weaponItem.heavy === true);
  const rollWeaponDmg = gwfApplies ? rollDiceGwf : rollDice;
  const rollWeaponCrit = gwfApplies ? rollCriticalGwf : rollCritical;
  const atk = resolvePlayerAttack(
    { str: pc.char.str, dex: pc.char.dex, level: pc.char.level },
    weaponDamage,
    effectiveEnemyAc,
    weaponItem?.finesse ?? false,
    disadvantage,
    effectiveAdvantage,
    weaponProficient,
    weaponItem?.range === 'ranged',
    critThresh,
    totalAttackBonus,
    pc.char.species === 'halfling',
    atkCtx.forceD20,
    gwfApplies
  );
  // Side-channel for callers: stash the attack result on ctx so the
  // outer attack/index.ts orchestrator can detect hit/miss without
  // changing the function's return shape (still `boolean killed`).
  ctx.lastAttackResult = {
    hit: atk.hit,
    fumble: atk.fumble,
    critical: atk.critical,
    d20: atk.roll,
    total: atk.total,
    atkMod: atk.atkMod,
    prof: atk.prof,
    attackBonus: totalAttackBonus,
    targetAc: effectiveEnemyAc,
  };
  // Bardic Inspiration consumption on attack roll (2024 PHB p.52). If
  // a stashed BI die exists, roll it and add to total. If that turns a
  // miss into a hit, atk.hit flips AND we need to roll damage
  // (resolvePlayerAttack returned 0 damage on the original miss).
  let biNote = '';
  if (pc.char.bardic_inspiration_die && !atk.fumble) {
    const biRoll = rollDice(`1${pc.char.bardic_inspiration_die}`);
    atk.total += biRoll;
    const newHit = atk.roll === 20 || atk.total >= effectiveEnemyAc;
    if (!atk.hit && newHit) {
      atk.hit = true;
      atk.damage = Math.max(1, rollWeaponDmg(weaponDamage ?? '1d4') + atk.atkMod);
    }
    biNote = ` ✦ Bardic Inspiration: +${biRoll} (${pc.char.bardic_inspiration_die})`;
    updatePcActor(ctx, { bardic_inspiration_die: undefined });
  }
  // Bless (PHB p.219): +1d4 to attack rolls. Same miss-to-hit
  // damage-roll concern as BI above.
  let blessNote = '';
  if ((pc.char.conditions ?? []).includes('blessed') && !atk.fumble) {
    const blessRoll = rollDice('1d4');
    atk.total += blessRoll;
    const newHit = atk.roll === 20 || atk.total >= effectiveEnemyAc;
    if (!atk.hit && newHit) {
      atk.hit = true;
      atk.damage = Math.max(1, rollWeaponDmg(weaponDamage ?? '1d4') + atk.atkMod);
    }
    blessNote = ` ✦ Bless: +${blessRoll} (1d4)`;
  }
  // SRD Bane: -1d4 to attack rolls. Mirror of Bless, opposite sign.
  // A hit-becomes-miss on subtraction stays a hit (RAW: the d20
  // value alone settled it; this just shifts the total down).
  let baneNote = '';
  if ((pc.char.conditions ?? []).includes('baned') && !atk.fumble) {
    const baneRoll = rollDice('1d4');
    atk.total -= baneRoll;
    // Hit-to-miss on a non-natural-20: re-check the threshold and
    // zero out damage if the subtraction drops below AC.
    if (atk.hit && atk.roll !== 20 && atk.total < effectiveEnemyAc) {
      atk.hit = false;
      atk.damage = 0;
    }
    baneNote = ` ☠ Bane: -${baneRoll} (1d4)`;
  }
  // SRD Rogue Stroke of Luck (L20) — if the attack (still) missed, turn the die
  // into a natural 20: an auto-hit and a critical. A nat 20 always hits, so it
  // always rescues a miss (including a fumble). Once per short/long rest.
  let strokeNote = '';
  if (!atk.hit && strokeOfLuckAvailable(pc.char)) {
    atk.total = 20 + (atk.total - atk.roll);
    atk.roll = 20;
    atk.fumble = false;
    atk.hit = true;
    atk.critical = true;
    if (weaponDamage) atk.damage = Math.max(1, rollWeaponCrit(weaponDamage) + atk.atkMod);
    updatePcActor(ctx, consumeStrokeOfLuck(pc.char));
    strokeNote = ' ✦ Stroke of Luck — a natural 20!';
  }
  // SRD Bard Peerless Skill (Lore L14) — if the attack (still) missed, add a
  // rolled Bardic Inspiration die; if it now meets AC it's a hit and a BI use
  // is spent. A still-miss refunds the use (no decrement). After Bless/Bane so
  // those passive shifts settle first.
  let peerlessNote = '';
  if (!atk.hit && !atk.fumble) {
    const peerlessRoll = peerlessSkillDie(pc.char);
    if (peerlessRoll > 0 && atk.total + peerlessRoll >= effectiveEnemyAc) {
      atk.total += peerlessRoll;
      atk.hit = true;
      atk.damage = Math.max(1, rollWeaponDmg(weaponDamage ?? '1d4') + atk.atkMod);
      const biUsesP = pc.char.class_resource_uses?.bardic_inspiration ?? abilityMod(pc.char.cha);
      updatePcActor(ctx, {
        class_resource_uses: {
          ...(pc.char.class_resource_uses ?? {}),
          bardic_inspiration: Math.max(0, biUsesP - 1),
        },
      });
      peerlessNote = ` ✦ Peerless Skill: +${peerlessRoll} — a hit!`;
    }
  }
  // Brutal Strike: the chosen swing is now resolving — consume the rider
  // (the advantage was already forgone above) regardless of hit/miss.
  let brutalNote = '';
  if (brutalStrikeApplies) {
    updatePcActor(ctx, {
      turn_actions: { ...pc.char.turn_actions, brutal_strike_pending: undefined },
    });
    brutalNote = ' 💥 Brutal Strike (advantage forgone)';
  }
  // Unconscious target within 5 ft: an attack that hits is a crit (SRD).
  const autoCritCheck =
    enemyUnconscious &&
    (!ctx.st.entities ||
      (() => {
        const charEnt = ctx.st.entities?.find((e) => e.id === pc.char.id);
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
      })());
  const isCrit = atk.critical || (autoCritCheck && atk.hit);
  let baseHit = weaponDamage
    ? isCrit && !atk.critical
      ? Math.max(1, rollWeaponCrit(weaponDamage) + atk.atkMod)
      : atk.damage
    : Math.max(1, unarmedDamage(pc.char.str));

  // 2024 PHB Savage Attacker origin feat — once per turn, on a
  // weapon-damage hit, reroll the damage and use the higher total.
  // Gates on `turn_actions.savage_attacker_used` to enforce the
  // once-per-turn limit across Extra Attack / two-weapon sequences.
  // Unarmed strikes don't carry a `weaponDamage` expression, so
  // they're excluded (RAW: feat reads "weapon's damage roll").
  if (
    atk.hit &&
    weaponDamage &&
    (pc.char.feats ?? []).includes('savage_attacker') &&
    !pc.char.turn_actions.savage_attacker_used
  ) {
    const reroll = isCrit
      ? Math.max(1, rollWeaponCrit(weaponDamage) + atk.atkMod)
      : Math.max(1, rollWeaponDmg(weaponDamage) + atk.atkMod);
    if (reroll > baseHit) baseHit = reroll;
    updatePcActor(ctx, {
      turn_actions: { ...pc.char.turn_actions, savage_attacker_used: true },
    });
  }
  const versatileNote = isVersatile ? ' (versatile)' : '';
  const coverNote = coverAcBonus > 0 ? ` +${coverAcBonus} cover` : '';
  const bonusNote = totalAttackBonus > 0 ? ` +${totalAttackBonus} bonus` : '';
  const atkNote =
    ' ' +
    fmt.note(
      `(${label}d20 ${atk.roll}+${atk.atkMod} ${atk.atkStat}+${atk.prof} prof${bonusNote} = ${atk.total} vs AC ${effectiveEnemyAc}${coverNote}${disadvNote}${versatileNote})${noProfNote}${biNote}${blessNote}${baneNote}${strokeNote}${peerlessNote}${brutalNote}`
    );

  if (atk.fumble) {
    // 2024 PHB — a Nat 1 on a d20 grants Heroic Inspiration. Failure
    // becomes the seed of next turn's success.
    const bonuses: { label: string }[] = [];
    if (!pc.char.inspiration) {
      updatePcActor(ctx, { inspiration: true });
      // Inspiration grant is conceptually a narrative aside, not a
      // mechanical bracket — but routing it through bonuses keeps
      // LLM input free of the ✦ symbol and keeps the composer as
      // the single source of fragment prose.
      bonuses.push({ label: `✦ Heroic Inspiration granted (${pc.char.name}).` });
    }
    composeNow(ctx, {
      kind: 'attack_miss',
      attackerId: pc.char.id,
      attackerName: pc.char.name,
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
    if (hasClass(pc.char, 'fighter') && getClassLevel(pc.char, 'fighter') >= 13) {
      const tag = `studied_by_${pc.char.id}`;
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
      (pc.char.weapon_masteries ?? []).includes(weaponItem.id)
    ) {
      const grazeMod = weaponItem.finesse ? abilityMod(pc.char.dex) : abilityMod(pc.char.str);
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
      attackerId: pc.char.id,
      attackerName: pc.char.name,
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
  if (hasClass(pc.char, 'rogue') && !pc.char.turn_actions.sneak_attack_used) {
    const isFinesseOrRanged = (weaponItem?.finesse ?? false) || weaponItem?.range === 'ranged';
    let allyAdjacent = false;
    if (ctx.st.entities) {
      const targetEnt = ctx.st.entities.find((e) => e.id === targetId && e.isEnemy);
      if (targetEnt) {
        allyAdjacent = ctx.st.entities.some(
          (e) =>
            !e.isEnemy &&
            e.id !== pc.char.id &&
            e.hp > 0 &&
            Math.max(Math.abs(e.pos.x - targetEnt.pos.x), Math.abs(e.pos.y - targetEnt.pos.y)) <= 1
        );
      }
    } else {
      allyAdjacent = ctx.st.characters.some((c) => !c.dead && c.id !== pc.char.id);
    }
    const hasAdv = advantage && !disadvantage;
    const triggers = (hasAdv || allyAdjacent) && !disadvantage;
    if (isFinesseOrRanged && triggers) {
      const saExpr = sneakAttackDice(getClassLevel(pc.char, 'rogue'));
      sneakDmg = isCrit ? rollCritical(saExpr) : rollDice(saExpr);
      // 2024 PHB Cunning Strike: if the player pre-committed an effect,
      // subtract one die from the SA roll (average 3.5 on 1d6).
      if (pc.char.turn_actions.cunning_strike_pending) {
        sneakDmg = Math.max(0, sneakDmg - rollDice('1d6'));
      }
      // SRD 5.2.1 — once per turn. Mark spent so Extra Attack /
      // two-weapon follow-up attacks don't re-trigger SA.
      updatePcActor(ctx, {
        turn_actions: { ...pc.char.turn_actions, sneak_attack_used: true },
      });
    }
  }

  const rageBonus =
    features.includes('rage') && isRaging && atk.atkStat === 'STR'
      ? rageDamageBonus(pc.char.level)
      : 0;

  // SRD Ranger Hunter's Mark — +1d6 Force on a hit against the marked target;
  // the die becomes d10 at Ranger L20 (Foe Slayer). Doubled on a crit.
  const huntersMarkDie = getClassLevel(pc.char, 'ranger') >= 20 ? '1d10' : '1d6';
  const huntersMarkDmg =
    atk.hit && pc.char.hunters_mark_target_id === targetId
      ? isCrit
        ? rollCritical(huntersMarkDie)
        : rollDice(huntersMarkDie)
      : 0;

  // ── Divine Smite (2024 PHB) ─────────────────────────────────────
  // Pre-buff from the bonus-action `divine_smite_spell` cast.
  // Consumes `divine_smite_dice` on the next weapon hit and rolls
  // that many d8 radiant. Crit doubles the dice per RAW
  // ("you can roll the spell's damage dice twice and add them
  // together" — 2024 PHB Divine Smite).
  let smiteDmg = 0;
  let smiteDice = 0;
  if ((pc.char.divine_smite_dice ?? 0) > 0 && (weaponItem || hasClass(pc.char, 'monk'))) {
    smiteDice = pc.char.divine_smite_dice!;
    const expr = `${smiteDice}d8`;
    smiteDmg = isCrit ? rollCritical(expr) : rollDice(expr);
    pc.char.divine_smite_dice = undefined;
  }

  // ── Improved Divine Smite (Paladin L11+) ────────────────────────
  // Passive radiant rider: every melee-weapon hit adds 1d8 radiant.
  // (No interaction with the spell version — both stack RAW. Crit
  // doubles the d8.) RAW restricts to Melee Weapon only — ranged
  // attacks don't qualify; the spell version DOES allow ranged so
  // the gating differs between the two.
  let improvedSmiteDmg = 0;
  if (
    hasClass(pc.char, 'paladin') &&
    getClassLevel(pc.char, 'paladin') >= 11 &&
    weaponItem &&
    weaponItem.range !== 'ranged'
  ) {
    improvedSmiteDmg = isCrit ? rollCritical('1d8') : rollDice('1d8');
  }

  // ── Cleric Divine Strike (Blessed Strikes, L7 / 2d8 at L14) ─────────────
  // Once per turn, a weapon hit deals an extra 1d8 (2d8 at L14) radiant. Rides
  // on top of the weapon multiplier like the Smite riders. Once-per-turn via
  // turn_actions.divine_strike_used.
  let divineStrikeDmg = 0;
  const dsDie = divineStrikeDie(pc.char);
  if (dsDie && weaponItem && atk.hit && !pc.char.turn_actions.divine_strike_used) {
    divineStrikeDmg = isCrit ? rollCritical(dsDie) : rollDice(dsDie);
    updatePcActor(ctx, {
      turn_actions: { ...pc.char.turn_actions, divine_strike_used: true },
    });
  }

  // Brutal Strike +1d10 (weapon's damage type, so it rides inside rawDmg and
  // shares the weapon's resistance/vulnerability multiplier). Doubled on a crit
  // like the rest of the attack's dice. Plain d10 — GWF only rerolls the
  // weapon's own dice, not this feature rider.
  const brutalStrikeDmg =
    brutalStrikeApplies && atk.hit ? (isCrit ? rollCritical('1d10') : rollDice('1d10')) : 0;
  const rawDmg = baseHit + sneakDmg + rageBonus + brutalStrikeDmg + huntersMarkDmg;
  // SRD Monk Empowered Strikes (L6) — unarmed strikes can deal Force damage.
  // pansori auto-picks Force (it bypasses most resistances); only when unarmed
  // (no weaponItem). Otherwise the weapon's own type stands.
  const empoweredStrikes = !weaponItem && getClassLevel(pc.char, 'monk') >= 6;
  const effectiveDamageType = weaponItem?.damageType ?? (empoweredStrikes ? 'force' : undefined);
  const { damage: finalDmg, note: dmgNote } = applyDamageMultiplier(
    rawDmg,
    effectiveDamageType,
    target
  );
  // Radiant damage rides on top of the weapon multiplier (a creature
  // resistant to the weapon's damage type still takes full radiant).
  // RAW radiant-resistant creatures would halve this too — TODO:
  // separate multiplier check for radiant.
  const radiantRider = smiteDmg + improvedSmiteDmg + divineStrikeDmg;
  const totalDmg = finalDmg + radiantRider;
  const enemyEnt = ctx.st.entities?.find((e) => e.id === targetId && e.isEnemy);
  const curEnemyHp = enemyEnt?.hp ?? 0;
  // 2024 PHB enemy temp HP — currently only set by Polymorph. Absorb
  // damage into temp_hp first, then into hp. When temp_hp depletes,
  // the polymorph form drops automatically (cleared below at the
  // state-update site).
  const curEnemyTempHp = enemyEnt?.temp_hp ?? 0;
  const tempHpAbsorbed = Math.min(totalDmg, curEnemyTempHp);
  const damageToHp = totalDmg - tempHpAbsorbed;
  const newEnemyTempHp = curEnemyTempHp - tempHpAbsorbed;
  const polymorphFormDrops = enemyEnt?.polymorph_state && newEnemyTempHp <= 0;
  const newEnemyHp = curEnemyHp - damageToHp;

  const hitBonuses: { label: string }[] = [];
  if (sacredWeaponBonus > 0) {
    hitBonuses.push({ label: `Sacred Weapon: +${sacredWeaponBonus} to hit` });
  }
  if (sneakDmg > 0) {
    const saExpr = sneakAttackDice(getClassLevel(pc.char, 'rogue'));
    const saLabel = isCrit ? `${parseInt(saExpr) * 2}d6 (crit)` : saExpr;
    hitBonuses.push({ label: `Sneak Attack ${saLabel}: +${sneakDmg}` });
  }
  if (huntersMarkDmg > 0) {
    hitBonuses.push({ label: `Hunter's Mark ${huntersMarkDie}: +${huntersMarkDmg} force` });
  }
  if (rageBonus > 0) {
    hitBonuses.push({ label: `Rage: +${rageBonus}` });
  }
  if (brutalStrikeDmg > 0) {
    hitBonuses.push({
      label: `Brutal Strike ${isCrit ? '2d10 (crit)' : '1d10'}: +${brutalStrikeDmg}`,
    });
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
  if (divineStrikeDmg > 0) {
    hitBonuses.push({ label: `Divine Strike ${dsDie}: +${divineStrikeDmg} radiant` });
  }
  composeNow(ctx, {
    kind: 'attack_hit',
    attackerId: pc.char.id,
    attackerName: pc.char.name,
    target,
    weapon: weaponItem ?? null,
    damage: totalDmg,
    damageType: effectiveDamageType ?? 'physical',
    isCrit,
    toHit: atk.total,
    targetAc: target.ac,
    atkNote,
    bonuses: hitBonuses,
  });

  // ── Ranger Superior Hunter's Prey (L11) ──────────────────────────────
  // Once per turn, when you deal Hunter's Mark damage to the marked target,
  // deal that same extra (Force) damage to a different creature within 30 ft.
  if (
    huntersMarkDmg > 0 &&
    pc.char.subclass === 'hunter' &&
    getClassLevel(pc.char, 'ranger') >= 11 &&
    !pc.char.turn_actions.superior_hunters_prey_used
  ) {
    const markEnt = ctx.st.entities?.find((e) => e.id === targetId && e.isEnemy);
    const shpTarget = markEnt
      ? (ctx.st.entities ?? []).find(
          (e) =>
            e.isEnemy &&
            e.hp > 0 &&
            e.id !== targetId &&
            Math.max(Math.abs(e.pos.x - markEnt.pos.x), Math.abs(e.pos.y - markEnt.pos.y)) <= 6
        )
      : undefined;
    if (shpTarget) {
      const shpEnemy = getEnemyById(ctx.seed, shpTarget.id);
      const { damage: shpDmg, note: shpNote } = applyDamageMultiplier(
        huntersMarkDmg,
        'force',
        shpEnemy ?? {}
      );
      const shpNewHp = Math.max(0, shpTarget.hp - shpDmg);
      ctx.st = {
        ...ctx.st,
        entities: (ctx.st.entities ?? []).map((e) =>
          e.id === shpTarget.id ? { ...e, hp: shpNewHp } : e
        ),
      };
      updatePcActor(ctx, {
        turn_actions: { ...pc.char.turn_actions, superior_hunters_prey_used: true },
      });
      const shpName = shpEnemy?.name ?? shpTarget.id;
      ctx.narrative += ` ${fmt.note(`[Superior Hunter's Prey: ${shpName} also takes ${shpDmg} force${shpNote}${shpNewHp <= 0 ? ' (killed)' : ''}]`)}`;
      if (shpNewHp <= 0) {
        const shpSplit = splitEncounterXp(ctx.st, pc.char.id, shpEnemy?.xp ?? 0);
        ctx.st = shpSplit.st;
        updatePcActor(ctx, { xp: (pc.char.xp || 0) + shpSplit.share });
        ctx.narrative += applyPartyLevelUps(ctx.st, pc.char, ctx.context);
      }
    }
  }

  // ── Barbarian Brutal Strike effect application (on a hit) ────────────
  if (brutalStrikeApplies && atk.hit && newEnemyHp > 0) {
    const bsCharEnt = ctx.st.entities?.find((e) => e.id === pc.char.id);
    const bsTargetEnt = ctx.st.entities?.find((e) => e.id === targetId && e.isEnemy);
    if (brutalRider === 'forceful' && bsCharEnt && bsTargetEnt) {
      // Push 15 ft (3 squares) straight away from the attacker...
      const dx = Math.sign(bsTargetEnt.pos.x - bsCharEnt.pos.x);
      const dy = Math.sign(bsTargetEnt.pos.y - bsCharEnt.pos.y);
      const pushedPos = { x: bsTargetEnt.pos.x + dx * 3, y: bsTargetEnt.pos.y + dy * 3 };
      // ...then move up to half Speed straight toward the target (no OA),
      // stopping adjacent. Direct entity move ⇒ no opportunity attacks.
      const halfSpeedSquares = Math.floor(
        effectiveSpeed(pc.char, ctx.context.lootTable) / 2 / SQUARE_SIZE
      );
      const distToPushed = Math.max(
        Math.abs(pushedPos.x - bsCharEnt.pos.x),
        Math.abs(pushedPos.y - bsCharEnt.pos.y)
      );
      const followSquares = Math.min(halfSpeedSquares, Math.max(0, distToPushed - 1));
      const followedPos = {
        x: bsCharEnt.pos.x + dx * followSquares,
        y: bsCharEnt.pos.y + dy * followSquares,
      };
      ctx.st = {
        ...ctx.st,
        entities: (ctx.st.entities ?? []).map((e) =>
          e.id === targetId && e.isEnemy
            ? { ...e, pos: pushedPos }
            : e.id === pc.char.id
              ? { ...e, pos: followedPos }
              : e
        ),
      };
      ctx.narrative += ` ${fmt.note(`[Forceful Blow: ${target.name} pushed 15 ft; ${pc.char.name} closes ${followSquares * SQUARE_SIZE} ft]`)}`;
    } else if (brutalRider === 'hamstring' && bsTargetEnt) {
      // -15 ft Speed until the start of your next turn — honored by
      // attemptEnemyApproach; cleared on round wrap.
      ctx.st = {
        ...ctx.st,
        entities: (ctx.st.entities ?? []).map((e) =>
          e.id === targetId && e.isEnemy
            ? { ...e, conditions: [...e.conditions.filter((c) => c !== 'hamstrung'), 'hamstrung'] }
            : e
        ),
      };
      ctx.narrative += ` ${fmt.note(`[Hamstring Blow: ${target.name}'s Speed −15 ft]`)}`;
    }
  }

  // ── 2024 PHB Cunning Strike effect application ───────────────────────
  if (pc.char.turn_actions.cunning_strike_pending && sneakDmg > 0 && newEnemyHp > 0) {
    const csEffect = pc.char.turn_actions.cunning_strike_pending;
    const csDc = 8 + profBonus(pc.char.level) + abilityMod(pc.char.dex);
    updatePcActor(ctx, {
      turn_actions: { ...pc.char.turn_actions, cunning_strike_pending: undefined },
    });
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
      updatePcActor(ctx, {
        turn_actions: { ...pc.char.turn_actions, disengaged: true },
      });
      ctx.narrative += ` ${fmt.note(`[Cunning Strike — Withdraw: ${pc.char.name} disengages without provoking OAs]`)}`;
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
    } else if (csEffect === 'daze' || csEffect === 'knock_out') {
      // SRD Devious Strikes (L14) — Daze (CON save or dazed) / Knock Out (CON
      // save or unconscious 1 min).
      const enemyCon = (target.con ?? 10) as number;
      const conSave = rollDice('1d20') + abilityMod(enemyCon);
      const applied = csEffect === 'daze' ? 'dazed' : 'unconscious';
      const label = csEffect === 'daze' ? 'Daze' : 'Knock Out';
      if (conSave < csDc) {
        ctx.st = {
          ...ctx.st,
          entities: (ctx.st.entities ?? []).map((e) =>
            e.id === targetId && e.isEnemy
              ? { ...e, conditions: [...e.conditions.filter((c) => c !== applied), applied] }
              : e
          ),
        };
        composeNow(ctx, {
          kind: 'condition_applied',
          targetId,
          targetName: target.name,
          condition: applied,
          source: `Cunning Strike: ${label}`,
          prose: ` ${fmt.note(`[Cunning Strike — ${label}: CON ${conSave} vs DC ${csDc} — ${target.name} is ${applied}!]`)}`,
        });
      } else {
        ctx.narrative += ` ${fmt.note(`[Cunning Strike — ${label}: CON ${conSave} vs DC ${csDc} — resists]`)}`;
      }
    } else if (csEffect === 'obscure') {
      // SRD Devious Strikes (L14) — Obscure: the target is Blinded until the
      // end of its next turn (no save).
      ctx.st = {
        ...ctx.st,
        entities: (ctx.st.entities ?? []).map((e) =>
          e.id === targetId && e.isEnemy
            ? { ...e, conditions: [...e.conditions.filter((c) => c !== 'blinded'), 'blinded'] }
            : e
        ),
      };
      composeNow(ctx, {
        kind: 'condition_applied',
        targetId,
        targetName: target.name,
        condition: 'blinded',
        source: 'Cunning Strike: Obscure',
        prose: ` ${fmt.note(`[Cunning Strike — Obscure: ${target.name} is blinded!]`)}`,
      });
    } else if (csEffect === 'stealth_attack') {
      // SRD Supreme Sneak (Thief L9) — Stealth Attack: keep your Hide
      // (Invisible) after the strike. (pansori doesn't drop Invisible on an
      // attack, so this reaffirms it.)
      updatePcActor(ctx, {
        conditions: pc.char.conditions.includes('invisible')
          ? pc.char.conditions
          : [...pc.char.conditions, 'invisible'],
      });
      ctx.narrative += ` ${fmt.note(`[Cunning Strike — Stealth Attack: ${pc.char.name} stays hidden]`)}`;
    }
  }

  // ── 2024 PHB Weapon Mastery on hit ────────────────────────────────────
  if (
    weaponItem?.mastery &&
    newEnemyHp > 0 &&
    (pc.char.weapon_masteries ?? []).includes(weaponItem.id)
  ) {
    // 2024 PHB Fighter L9 Tactical Master — pre-armed swap wins over the
    // weapon's printed mastery for this one attack.
    let mastery = weaponItem.mastery;
    if (pc.char.turn_actions.tactical_master_mastery) {
      mastery = pc.char.turn_actions.tactical_master_mastery;
      updatePcActor(ctx, {
        turn_actions: { ...pc.char.turn_actions, tactical_master_mastery: undefined },
      });
      ctx.narrative += ` ${fmt.note(`[Tactical Master: applying ${mastery.toUpperCase()}]`)}`;
    }
    const weaponDc = 8 + profBonus(pc.char.level) + abilityMod(pc.char.str);
    if (mastery === 'vex') {
      const tag = `vexed_by_${pc.char.id}`;
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
      const charEnt = ctx.st.entities?.find((e) => e.id === pc.char.id);
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
      // 2024 PHB Slow weapon mastery — narrative-only "speed -10 ft"
      // marker. Distinct from the Slow SPELL's `slowed` condition
      // (speed halved, -2 AC, -2 Dex saves). Renamed from `slowed`
      // to `slow_struck` to avoid name collision with the spell;
      // neither path reads the condition for engine effects today.
      ctx.st = {
        ...ctx.st,
        entities: (ctx.st.entities ?? []).map((e) =>
          e.id === targetId && e.isEnemy
            ? {
                ...e,
                conditions: [...e.conditions.filter((c) => c !== 'slow_struck'), 'slow_struck'],
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
            Math.max(Math.abs(e.pos.x - targetEnt.pos.x), Math.abs(e.pos.y - targetEnt.pos.y)) <= 1
        );
        if (cleaveTarget) {
          const rawCleaveDmg = rollDice(weaponItem.damage);
          // Apply enemy resistance / vulnerability to the cleave
          // damage type — previously this raw weapon-die damage was
          // written straight to entity HP, ignoring any resistance
          // the second target had to the weapon's damage type.
          const cleaveEnemy = getEnemyById(ctx.seed, cleaveTarget.id);
          const { damage: cleaveDmg, note: cleaveDmgNote } = applyDamageMultiplier(
            rawCleaveDmg,
            weaponItem.damageType,
            cleaveEnemy ?? {}
          );
          const cleaveNewHp = Math.max(0, cleaveTarget.hp - cleaveDmg);
          ctx.st = {
            ...ctx.st,
            entities: (ctx.st.entities ?? []).map((e) =>
              e.id === cleaveTarget.id ? { ...e, hp: cleaveNewHp } : e
            ),
          };
          const cleaveName = cleaveEnemy?.name ?? cleaveTarget.id;
          ctx.narrative += ` ${fmt.note(`[Cleave: ${cleaveName} also takes ${cleaveDmg} damage!${cleaveDmgNote}${cleaveNewHp <= 0 ? ' (killed)' : ''}]`)}`;
          if (cleaveNewHp <= 0) {
            const cleaveXp = getEnemyById(ctx.seed, cleaveTarget.id)?.xp ?? 0;
            const cleaveSplit = splitEncounterXp(ctx.st, pc.char.id, cleaveXp);
            ctx.st = cleaveSplit.st;
            updatePcActor(ctx, { xp: (pc.char.xp || 0) + cleaveSplit.share });
            ctx.narrative += applyPartyLevelUps(ctx.st, pc.char, ctx.context);
          }
        }
      }
    }
  }

  if (newEnemyHp <= 0) {
    const xpGain = target.xp ?? 10 + (target.hp || 8);
    const killSplit = splitEncounterXp(ctx.st, pc.char.id, xpGain);
    ctx.st = killSplit.st;
    const xpShare = killSplit.share;
    updatePcActor(ctx, { xp: (pc.char.xp || 0) + xpShare });
    ctx.st = {
      ...ctx.st,
      entities: (ctx.st.entities ?? []).map((e) =>
        e.id === targetId && e.isEnemy ? { ...e, hp: 0 } : e
      ),
      enemies_killed: [...ctx.st.enemies_killed, targetId],
    };
    ctx.narrative += grantDarkOnesBlessing(pc.char);
    // Only end combat once every enemy in the room is down
    if (isRoomCleared(ctx.st, ctx.seed, ctx.roomId)) {
      ctx.st = endCombatState(ctx.st);
      updatePcActor(ctx, {
        conditions: pc.char.conditions.filter((c) => c !== 'raging'),
      });
    }
    const killProse =
      ' ' +
      pick(ctx.context.narratives.killShot)
        .replace('{enemy}', target.name)
        .replace('{xp}', String(xpShare));
    composeNow(ctx, {
      kind: 'attack_kill',
      attackerId: pc.char.id,
      attackerName: pc.char.name,
      victimId: targetId,
      victimName: target.name,
      xp: xpShare,
      killProse,
    });
    ctx.narrative += applyPartyLevelUps(ctx.st, pc.char, ctx.context);
    ctx.usedInitiative = true;
    return true;
  }
  ctx.st = {
    ...ctx.st,
    entities: (ctx.st.entities ?? []).map((e) => {
      if (e.id !== targetId || !e.isEnemy) return e;
      const updated = {
        ...e,
        hp: newEnemyHp,
        temp_hp: newEnemyTempHp > 0 ? newEnemyTempHp : undefined,
      };
      // 2024 PHB Polymorph form-drop: when the polymorph buffer
      // (temp_hp) depletes to 0, the form ends. Clear polymorph_state
      // + the polymorphed condition; the entity's real `hp` is
      // unchanged (it was never modified by the polymorph cast).
      if (polymorphFormDrops) {
        return {
          ...updated,
          temp_hp: undefined,
          polymorph_state: undefined,
          conditions: e.conditions.filter((c) => c !== 'polymorphed'),
        };
      }
      return updated;
    }),
  };
  if (polymorphFormDrops) {
    const formName = enemyEnt?.polymorph_state?.formName ?? 'the beast form';
    ctx.narrative += ` The ${formName} form shatters — ${target.name} returns to themselves!`;
  }
  ctx.narrative += ` The ${target.name} has ${fmt.hp(newEnemyHp)} HP remaining. `;
  return false;
}

/**
 * Re-export so the attack handler can pull both the helper and the
 * extra-attack count from one location without a separate import.
 */
export { extraAttackCountForChar };
