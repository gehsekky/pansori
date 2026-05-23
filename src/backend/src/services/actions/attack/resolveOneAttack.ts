import type { Enemy, InventoryItem, LootItem } from '../../../types.js';
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
import type { ActionContext } from '../types.js';
import type { ToHitContext } from './toHit.js';
import { composeNow } from '../../narrative/compose.js';
import { fmt } from '../../narrativeFmt.js';
import { posEqual } from '../../gridEngine.js';

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
 * from the Extra Attack loop). Mutates ctx.char, ctx.st, ctx.narrative,
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
    sharpshooterActive,
  } = toHit;

  // 2024 PHB Slow — slowed creature takes -2 AC. Read the live target
  // entity (target.ac comes from the seed template; the slowed flag
  // lives on the grid entity). Stacks with cover (RAW: penalties +
  // bonuses are additive).
  const targetEntForSlow = ctx.st.entities?.find((e) => e.id === targetId && e.isEnemy);
  const slowedAcPenalty = targetEntForSlow?.conditions.includes('slowed') ? 2 : 0;
  const effectiveEnemyAc = target.ac + coverAcBonus - slowedAcPenalty;
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
    ctx.char.species === 'halfling',
    atkCtx.forceD20
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
  if (hasClass(ctx.char, 'rogue') && !ctx.char.turn_actions.sneak_attack_used) {
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
            Math.max(Math.abs(e.pos.x - targetEnt.pos.x), Math.abs(e.pos.y - targetEnt.pos.y)) <= 1
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
      // SRD 5.2.1 — once per turn. Mark spent so Extra Attack /
      // two-weapon follow-up attacks don't re-trigger SA.
      ctx.char = {
        ...ctx.char,
        turn_actions: { ...ctx.char.turn_actions, sneak_attack_used: true },
      };
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
  // Great Weapon Master (2024 PHB) — once per turn, on a hit with
  // a Heavy weapon, add prof bonus damage. Same shape as Sneak
  // Attack: gated on `turn_actions.gwm_used`, set after firing.
  let gwmDmg = 0;
  if (
    (ctx.char.feats ?? []).includes('great_weapon_master') &&
    weaponItem?.heavy &&
    !ctx.char.turn_actions.gwm_used
  ) {
    gwmDmg = profBonus(ctx.char.level);
    ctx.char = {
      ...ctx.char,
      turn_actions: { ...ctx.char.turn_actions, gwm_used: true },
    };
  }
  // Aasimar Celestial Revelation (2024 PHB L3+) — once per turn,
  // a melee weapon hit while transformed adds +prof damage of
  // the matching type (necrotic for Necrotic Shroud, radiant for
  // Radiant Soul / Radiant Consumption). The rider rides on top
  // of the weapon damage but in a different damage type — the
  // weapon's resistance multiplier wouldn't apply to it. Pansori
  // currently folds it into the same rawDmg total (same as Divine
  // Smite radiant rider — a known simplification documented inline).
  let celRevDmg = 0;
  let celRevDmgType: 'necrotic' | 'radiant' | undefined;
  if (
    ctx.char.celestial_revelation_variant &&
    weaponItem?.range !== 'ranged' &&
    !ctx.char.turn_actions.celestial_revelation_rider_used
  ) {
    celRevDmg = profBonus(ctx.char.level);
    celRevDmgType =
      ctx.char.celestial_revelation_variant === 'necrotic_shroud' ? 'necrotic' : 'radiant';
    ctx.char = {
      ...ctx.char,
      turn_actions: {
        ...ctx.char.turn_actions,
        celestial_revelation_rider_used: true,
      },
    };
  }
  // 2024 PHB Fey Wanderer Ranger L3 — Dreadful Strikes: once per
  // turn, a weapon hit deals +1d4 psychic. RAW upscales to +1d6
  // at L11 (deferred — flat 1d4 for now). Same gate shape as
  // GWM / Celestial Revelation riders; cleared by FRESH_TURN.
  let dreadfulStrikesDmg = 0;
  if (
    hasClass(ctx.char, 'ranger') &&
    ctx.char.subclass === 'fey_wanderer' &&
    getClassLevel(ctx.char, 'ranger') >= 3 &&
    weaponItem &&
    !ctx.char.turn_actions.dreadful_strikes_used
  ) {
    dreadfulStrikesDmg = rollDice('1d4');
    ctx.char = {
      ...ctx.char,
      turn_actions: { ...ctx.char.turn_actions, dreadful_strikes_used: true },
    };
  }
  // 2024 PHB Gloom Stalker Ranger L3 — Dread Ambusher: first
  // weapon attack of combat deals +1d8. Flag is set in
  // runCombatStart for Gloom Stalkers and consumed here on the
  // first hit. FRESH_TURN at turn start expires the flag if
  // unused (matches the RAW "first turn of combat" cap).
  let dreadAmbusherDmg = 0;
  if (
    ctx.char.turn_actions.dread_ambusher_pending &&
    weaponItem &&
    hasClass(ctx.char, 'ranger') &&
    ctx.char.subclass === 'gloom_stalker'
  ) {
    dreadAmbusherDmg = rollDice('1d8');
    ctx.char = {
      ...ctx.char,
      turn_actions: { ...ctx.char.turn_actions, dread_ambusher_pending: undefined },
    };
  }
  const rawDmg =
    baseHit +
    sneakDmg +
    rageBonus +
    sharpshooterDmg +
    gwmDmg +
    celRevDmg +
    dreadfulStrikesDmg +
    dreadAmbusherDmg;
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
  if (gwmDmg > 0) {
    hitBonuses.push({ label: `Great Weapon Master: +${gwmDmg}` });
  }
  if (celRevDmg > 0 && celRevDmgType) {
    hitBonuses.push({ label: `Celestial Revelation: +${celRevDmg} ${celRevDmgType}` });
  }
  if (dreadfulStrikesDmg > 0) {
    hitBonuses.push({ label: `Dreadful Strikes: +${dreadfulStrikesDmg} psychic` });
  }
  if (dreadAmbusherDmg > 0) {
    hitBonuses.push({ label: `Dread Ambusher: +${dreadAmbusherDmg}` });
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
            const cleaveSplit = splitEncounterXp(ctx.st, ctx.char.id, cleaveXp);
            ctx.st = cleaveSplit.st;
            ctx.char = { ...ctx.char, xp: (ctx.char.xp || 0) + cleaveSplit.share };
            ctx.narrative += applyPartyLevelUps(ctx.st, ctx.char, ctx.context);
          }
        }
      }
    }
  }

  // 2024 PHB Great Weapon Master — when a Heavy-weapon hit
  // scores a Crit OR reduces a creature to 0 HP, queue a
  // bonus-action attack. Surfaced as the `gwm_bonus_attack`
  // choice; cleared by FRESH_TURN at turn start. The damage
  // rider above (gwm_used flag) is separate from this trigger.
  if (
    (ctx.char.feats ?? []).includes('great_weapon_master') &&
    weaponItem?.heavy &&
    (isCrit || newEnemyHp <= 0) &&
    !ctx.char.turn_actions.bonus_action_used
  ) {
    ctx.char = {
      ...ctx.char,
      turn_actions: { ...ctx.char.turn_actions, gwm_bonus_attack_pending: true },
    };
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
