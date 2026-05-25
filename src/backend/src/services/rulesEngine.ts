import type { AbilityKey, DeathSaves, LootItem, Spell, TurnActions } from '../types.js';

// ─── Dice ─────────────────────────────────────────────────────────────────────

export function d(sides: number): number {
  return Math.floor(Math.random() * sides) + 1;
}

export function rollDice(expr: string | number | null | undefined): number {
  if (!expr) return d(4);
  const flat = parseInt(String(expr), 10);
  if (!isNaN(flat) && !String(expr).includes('d')) return flat;
  const m = String(expr).match(/(\d+)d(\d+)(?:\+(\d+))?/);
  if (!m) return d(4);
  let total = parseInt(m[3] ?? '0', 10);
  for (let i = 0; i < parseInt(m[1], 10); i++) total += d(parseInt(m[2], 10));
  return total;
}

// Maximizes a dice expression instead of rolling it — every die yields its
// top face. `maxDice('2d8')` → 16, `maxDice('4d8+2')` → 34, `maxDice('70')`
// → 70. Used by Life Cleric Supreme Healing (SRD: "use the highest number
// possible for each die"). Mirrors rollDice's single-term `XdY+Z` grammar.
export function maxDice(expr: string | number | null | undefined): number {
  if (!expr) return 0;
  if (!String(expr).includes('d')) {
    const flat = parseInt(String(expr), 10);
    return isNaN(flat) ? 0 : flat;
  }
  const m = String(expr).match(/(\d+)d(\d+)(?:\+(\d+))?/);
  if (!m) return 0;
  return parseInt(m[1], 10) * parseInt(m[2], 10) + parseInt(m[3] ?? '0', 10);
}

// Exported so bonus dice (sneak attack, divine smite) can also be doubled on crits
export function rollCritical(expr: string | null | undefined): number {
  // Critical hit: damage dice rolled twice, modifier added once
  if (!expr) return d(4) + d(4);
  const m = String(expr).match(/(\d+)d(\d+)(?:\+(\d+))?/);
  if (!m) return d(4) + d(4);
  const count = parseInt(m[1], 10) * 2;
  let total = parseInt(m[3] ?? '0', 10);
  for (let i = 0; i < count; i++) total += d(parseInt(m[2], 10));
  return total;
}

// SRD Fighting Style: Great Weapon Fighting — "treat any 1 or 2 on a damage
// die as a 3." `gwfDie` rolls one die and applies that floor; the two rollers
// below mirror `rollDice` / `rollCritical` but use it for the weapon's damage
// dice (the flat `+N` modifier is untouched). Used only for two-handed melee
// weapon damage in resolveOneAttack.
function gwfDie(sides: number): number {
  const r = d(sides);
  return r <= 2 ? 3 : r;
}

export function rollDiceGwf(expr: string | number | null | undefined): number {
  if (!expr) return gwfDie(4);
  const flat = parseInt(String(expr), 10);
  if (!isNaN(flat) && !String(expr).includes('d')) return flat;
  const m = String(expr).match(/(\d+)d(\d+)(?:\+(\d+))?/);
  if (!m) return gwfDie(4);
  let total = parseInt(m[3] ?? '0', 10);
  for (let i = 0; i < parseInt(m[1], 10); i++) total += gwfDie(parseInt(m[2], 10));
  return total;
}

/**
 * SRD Sorcerer Metamagic — Empowered Spell. Rolls the damage expression and
 * rerolls up to `maxRerolls` of the lowest dice, keeping the new values
 * (player-favorable resolution of "reroll up to N dice, use the new rolls"
 * — rerolling the lowest dice is always the optimal choice). `crit` doubles
 * the dice count first (the flat bonus is added once, matching rollCritical).
 */
export function rollDiceEmpowered(
  expr: string | number | null | undefined,
  maxRerolls: number,
  crit = false
): number {
  if (!expr) return 0;
  const m = String(expr).match(/(\d+)d(\d+)(?:\+(\d+))?/);
  if (!m) return rollDice(expr); // flat / unparseable — nothing to reroll
  const count = parseInt(m[1], 10) * (crit ? 2 : 1);
  const sides = parseInt(m[2], 10);
  const flat = parseInt(m[3] ?? '0', 10);
  const dice = Array.from({ length: count }, () => d(sides));
  // Reroll the lowest `maxRerolls` dice (capped at the dice count).
  const rerolls = Math.max(0, Math.min(maxRerolls, count));
  const lowestFirst = dice.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  for (let k = 0; k < rerolls; k++) dice[lowestFirst[k].i] = d(sides);
  return dice.reduce((s, v) => s + v, 0) + flat;
}

// SRD Sorcerer Metamagic — Transmuted Spell: change a spell's damage type to
// one of these. pansori auto-picks the most favorable: a type the target is
// Vulnerable to, else one it doesn't resist or shrug off, else the base type.
export const TRANSMUTE_TYPES = ['acid', 'cold', 'fire', 'lightning', 'poison', 'thunder'] as const;

export function transmutedDamageType(
  target: { resistances?: string[]; vulnerabilities?: string[]; immunities?: string[] },
  baseType: string
): string {
  const vuln = TRANSMUTE_TYPES.find((t) => target.vulnerabilities?.includes(t));
  if (vuln) return vuln;
  const clean = TRANSMUTE_TYPES.find(
    (t) => !target.immunities?.includes(t) && !target.resistances?.includes(t)
  );
  return clean ?? baseType;
}

export function rollCriticalGwf(expr: string | null | undefined): number {
  if (!expr) return gwfDie(4) + gwfDie(4);
  const m = String(expr).match(/(\d+)d(\d+)(?:\+(\d+))?/);
  if (!m) return gwfDie(4) + gwfDie(4);
  const count = parseInt(m[1], 10) * 2;
  let total = parseInt(m[3] ?? '0', 10);
  for (let i = 0; i < count; i++) total += gwfDie(parseInt(m[2], 10));
  return total;
}

// ─── Ability scores ───────────────────────────────────────────────────────────

export function abilityMod(score: number | undefined): number {
  return Math.floor(((score ?? 10) - 10) / 2);
}

// Combined penalty subtracted from every D20 Test (attack rolls, ability
// checks, saving throws) and passive score. Two SRD sources:
//   - Raise Dead / Resurrection: a −4 penalty that drops by 1 per Long Rest
//     (`revive_d20_penalty`).
//   - 2024 Exhaustion: −2 per Exhaustion level (`exhaustion_level`). Exhaustion
//     also cuts Speed by 5 ft/level (see `effectiveSpeed`) and is lethal at 6.
// Returns a non-negative magnitude; callers subtract it.
export function d20TestPenalty(char: {
  revive_d20_penalty?: number;
  exhaustion_level?: number;
}): number {
  return Math.max(0, char.revive_d20_penalty ?? 0) + 2 * Math.max(0, char.exhaustion_level ?? 0);
}

// SRD Slow — "It can't take reactions." Combine with the existing
// reaction-slot exhaustion check to gate every reaction site
// (Shield / Hellish Rebuke / Counterspell, OAs, Uncanny Dodge,
// Sentinel-style triggers, Lucky-feat reactions, Bardic Cutting
// Words, readied-action use_reaction). Use at every reaction-gate
// site so the engine consistently respects the condition.
export function canReact(char: {
  turn_actions?: { reaction_used?: boolean };
  conditions?: string[];
}): boolean {
  if (char.turn_actions?.reaction_used) return false;
  if ((char.conditions ?? []).includes('slowed')) return false;
  return true;
}

// PHB proficiency bonus table
export function profBonus(level: number | undefined): number {
  return Math.ceil((level ?? 1) / 4) + 1;
}

// ─── Combat state ─────────────────────────────────────────────────────────────

export const FRESH_TURN: TurnActions = {
  action_used: false,
  bonus_action_used: false,
  reaction_used: false,
  free_interaction_used: false,
  dodging: false,
  disengaged: false,
};

// ─── Damage type multipliers ──────────────────────────────────────────────────

export function applyDamageMultiplier(
  raw: number,
  damageType: string | undefined,
  enemy: { resistances?: string[]; vulnerabilities?: string[]; immunities?: string[] },
  // SRD Boon of Irresistible Offense (Overcome Defenses) sets this for B/P/S
  // damage — Resistance is ignored, but Immunity and Vulnerability still apply.
  opts?: { ignoreResistance?: boolean }
): { damage: number; note: string } {
  if (!damageType) return { damage: raw, note: '' };
  if (enemy.immunities?.includes(damageType))
    return { damage: 0, note: ` [immune to ${damageType}]` };
  // SRD 5.2.1 p.17 — order is: adjustments → resistance → vulnerability.
  // If a creature has both (rare), resistance halves first then vulnerability
  // doubles → net unchanged.
  const hasResist = (enemy.resistances?.includes(damageType) ?? false) && !opts?.ignoreResistance;
  const hasVuln = enemy.vulnerabilities?.includes(damageType) ?? false;
  let dmg = raw;
  const notes: string[] = [];
  if (hasResist) {
    dmg = Math.floor(dmg / 2);
    notes.push(`resistant to ${damageType}: ×½`);
  }
  if (hasVuln) {
    dmg = dmg * 2;
    notes.push(`vulnerable to ${damageType}: ×2`);
  }
  return { damage: dmg, note: notes.length ? ` [${notes.join(', ')}]` : '' };
}

// ─── Attack resolution ────────────────────────────────────────────────────────

interface PlayerStats {
  str: number;
  dex: number;
  level: number;
}

interface AttackResult {
  hit: boolean;
  fumble: boolean;
  critical: boolean;
  roll: number;
  total: number;
  damage: number;
  atkMod: number;
  atkStat: 'STR' | 'DEX';
  prof: number;
}

// Player attacks an enemy. Finesse weapons use whichever of STR/DEX is higher.
// Advantage and disadvantage both present → they cancel out (5e PHB p.173).
// weaponProficient=false omits proficiency bonus (PHB p.147: no profBonus without proficiency).
// ranged=true forces DEX for attack and damage (overrides finesse logic).
export function resolvePlayerAttack(
  player: PlayerStats,
  weaponDamage: string | null,
  targetAC: number,
  finesse = false,
  disadvantage = false,
  advantage = false,
  weaponProficient = true,
  ranged = false,
  critThreshold = 20,
  attackBonus = 0,
  halflingLucky = false,
  // 2024 PHB Heroic Inspiration / Lucky-RAW reroll — when set, the
  // function skips the internal d20 generation and uses this value
  // as the (single) roll instead. RAW for Heroic Inspiration says
  // "you must use the new roll" — no advantage/disadvantage logic,
  // no Halfling Lucky retry on the reroll. The first-roll path is
  // unchanged.
  forceRoll1?: number,
  // SRD Fighting Style: Great Weapon Fighting — roll the weapon's damage
  // dice treating 1s/2s as 3s. Caller sets this only for two-handed melee.
  gwf = false
): AttackResult {
  const strMod = abilityMod(player.str);
  const dexMod = abilityMod(player.dex);
  const atkMod = ranged ? dexMod : finesse ? Math.max(strMod, dexMod) : strMod;
  const atkStat: 'STR' | 'DEX' = ranged ? 'DEX' : finesse && dexMod > strMod ? 'DEX' : 'STR';
  const prof = weaponProficient ? profBonus(player.level) : 0;
  let roll: number;
  if (forceRoll1 !== undefined) {
    // Reroll path — must use the forced value, no adv/disadv, no
    // Halfling Lucky chain re-rolls.
    roll = forceRoll1;
  } else {
    const roll1 = d(20);
    // Advantage + disadvantage cancel; net advantage rolls 2d20 keep higher; net disadv keeps lower
    const netAdv = advantage && !disadvantage;
    const netDisadv = disadvantage && !advantage;
    roll = netDisadv ? Math.min(roll1, d(20)) : netAdv ? Math.max(roll1, d(20)) : roll1;
    // 2024 PHB Halfling Lucky — re-roll a Nat 1 on a d20 once; take the new
    // result. Applies to the final kept roll (after advantage/disadvantage).
    if (halflingLucky && roll === 1) roll = d(20);
  }
  const total = roll + atkMod + prof + attackBonus;

  if (roll === 1)
    return {
      hit: false,
      fumble: true,
      critical: false,
      roll,
      total,
      damage: 0,
      atkMod,
      atkStat,
      prof,
    };
  if (roll >= critThreshold)
    return {
      hit: true,
      fumble: false,
      critical: true,
      roll,
      total,
      damage: Math.max(
        1,
        (gwf ? rollCriticalGwf(weaponDamage) : rollCritical(weaponDamage)) + atkMod
      ),
      atkMod,
      atkStat,
      prof,
    };
  if (total >= targetAC)
    return {
      hit: true,
      fumble: false,
      critical: false,
      roll,
      total,
      damage: Math.max(1, (gwf ? rollDiceGwf(weaponDamage) : rollDice(weaponDamage)) + atkMod),
      atkMod,
      atkStat,
      prof,
    };
  return {
    hit: false,
    fumble: false,
    critical: false,
    roll,
    total,
    damage: 0,
    atkMod,
    atkStat,
    prof,
  };
}

// Two-weapon fighting: off-hand attack gets no ability modifier to damage (PHB p.195)
export function resolveOffHandAttack(
  player: PlayerStats,
  weaponDamage: string | null,
  targetAC: number,
  finesse = false,
  disadvantage = false,
  advantage = false,
  weaponProficient = true,
  ranged = false
): AttackResult {
  const strMod = abilityMod(player.str);
  const dexMod = abilityMod(player.dex);
  const atkMod = ranged ? dexMod : finesse ? Math.max(strMod, dexMod) : strMod;
  const atkStat: 'STR' | 'DEX' = ranged ? 'DEX' : finesse && dexMod > strMod ? 'DEX' : 'STR';
  const prof = weaponProficient ? profBonus(player.level) : 0;
  const roll1 = d(20);
  const netAdv = advantage && !disadvantage;
  const netDisadv = disadvantage && !advantage;
  const roll = netDisadv ? Math.min(roll1, d(20)) : netAdv ? Math.max(roll1, d(20)) : roll1;
  const total = roll + atkMod + prof;
  // Off-hand damage: NO ability modifier added (PHB p.195)
  if (roll === 1)
    return {
      hit: false,
      fumble: true,
      critical: false,
      roll,
      total,
      damage: 0,
      atkMod,
      atkStat,
      prof,
    };
  if (roll === 20) {
    // Critical: double dice, still no atkMod to damage
    const m = weaponDamage?.match(/(\d+)d(\d+)/);
    const critDmg = m ? parseInt(m[1]) * 2 * Math.ceil(parseInt(m[2]) / 2) : 1; // simplified crit
    return {
      hit: true,
      fumble: false,
      critical: true,
      roll,
      total,
      damage: Math.max(1, critDmg),
      atkMod,
      atkStat,
      prof,
    };
  }
  if (total >= targetAC) {
    const baseDmg = rollDice(weaponDamage); // NO +atkMod
    return {
      hit: true,
      fumble: false,
      critical: false,
      roll,
      total,
      damage: Math.max(1, baseDmg),
      atkMod,
      atkStat,
      prof,
    };
  }
  return {
    hit: false,
    fumble: false,
    critical: false,
    roll,
    total,
    damage: 0,
    atkMod,
    atkStat,
    prof,
  };
}

interface EnemyStats {
  damage: string;
  toHit: number;
}

// Enemy attacks the player. Advantage rolls 2d20 keep higher; disadvantage keeps lower.
// Advantage + disadvantage cancel per 5e PHB p.173.
export function resolveEnemyAttack(
  enemy: EnemyStats,
  playerAC: number,
  advantage = false,
  disadvantage = false
) {
  const roll1 = d(20);
  const netAdv = advantage && !disadvantage;
  const netDisadv = disadvantage && !advantage;
  const roll = netDisadv ? Math.min(roll1, d(20)) : netAdv ? Math.max(roll1, d(20)) : roll1;
  const total = roll + enemy.toHit;
  const hit = roll !== 1 && (roll === 20 || total >= playerAC);
  return { hit, roll, total, damage: hit ? rollDice(enemy.damage) : 0 };
}

// Unarmed strike: 1 + STR modifier (minimum 1), per SRD 5.2.1.
export function unarmedDamage(str: number): number {
  return Math.max(1, 1 + abilityMod(str));
}

// ─── Equipment legality ───────────────────────────────────────────────────────

// Weapon draw/stow costs a free object interaction (once per turn) in combat.
export function canEquipWeapon(combatActive: boolean, turnActions?: TurnActions) {
  if (!combatActive) return { allowed: true } as const;
  if (!turnActions?.free_interaction_used)
    return { allowed: true, cost: 'free_interaction' } as const;
  return {
    allowed: false,
    reason: 'You have already used your free object interaction this turn.',
  } as const;
}

// Shields cost 1 action to don/doff (PHB). We block in combat for simplicity.
export function canDonShield(combatActive: boolean) {
  if (!combatActive) return { allowed: true } as const;
  return {
    allowed: false,
    reason: 'Donning or doffing a shield takes 1 action — you cannot do it mid-combat.',
  } as const;
}

// Don/doff times per 5e PHB: light 1 min, medium 5 min, heavy 10 min.
// None of these can be done in combat.
const DON_TIME: Record<string, string> = {
  light: '1 minute',
  medium: '5 minutes',
  heavy: '10 minutes',
};

export function canDonArmor(combatActive: boolean, armorCategory: string) {
  if (!combatActive) return { allowed: true } as const;
  const cat = armorCategory || 'light';
  return {
    allowed: false,
    reason: `Donning ${cat} armour takes ${DON_TIME[cat] ?? '1 minute'} — impossible mid-combat.`,
  } as const;
}

// 5e PHB p.144: non-proficient armor → disadvantage on STR/DEX checks and attack rolls, cannot cast spells
export function hasArmorProficiency(
  armorProficiencies: string[],
  armorCategory: string | undefined
): boolean {
  if (!armorCategory) return true;
  return armorProficiencies.includes(armorCategory);
}

// 5e PHB p.147: non-proficient weapon → no proficiency bonus added to attack rolls
export function hasWeaponProficiency(
  weaponProficiencies: string[],
  weaponType: string | undefined
): boolean {
  if (!weaponType) return true;
  return weaponProficiencies.includes(weaponType);
}

// Compute AC from scratch given all equipped items.
// Light armor: armorAcBase + full DEX mod
// Medium armor: armorAcBase + min(DEX mod, 2) [dexCapToAc=2]
// Heavy armor: armorAcBase only [dexCapToAc=0]
// Shield: adds ac_bonus flat
// Unarmored: 10 + DEX mod
export function computeTotalAc(
  dex: number,
  equippedArmorInstanceId: string | null | undefined,
  equippedShieldInstanceId: string | null | undefined,
  inventory: Array<{ instance_id: string; id: string; [key: string]: unknown }>,
  lootTable: LootItem[],
  // Optional buff toggles. Mage Armor changes unarmored base from
  // 10 to 13 (no-op when wearing body armor). Shield of Faith adds
  // a flat +2 regardless of armor. Haste adds a flat +2 from the
  // hasted condition; the buff spell handler / save handler doesn't
  // need to recompute AC since most call sites read the live
  // condition list directly via `hastedActive`. All flags default
  // false for legacy compat.
  mageArmorActive: boolean = false,
  shieldOfFaithActive: boolean = false,
  hastedActive: boolean = false
): number {
  const dexMod = abilityMod(dex);
  const armorId = equippedArmorInstanceId
    ? inventory.find((i) => i.instance_id === equippedArmorInstanceId)?.id
    : null;
  const shieldId = equippedShieldInstanceId
    ? inventory.find((i) => i.instance_id === equippedShieldInstanceId)?.id
    : null;
  const armor = armorId ? lootTable.find((l) => l.id === armorId) : null;
  const shield = shieldId ? lootTable.find((l) => l.id === shieldId) : null;

  let ac: number;
  if (armor?.armorAcBase !== undefined) {
    const cap = armor.dexCapToAc ?? Infinity;
    ac = armor.armorAcBase + Math.min(dexMod, cap);
  } else {
    // Unarmored. Mage Armor bumps base from 10 to 13.
    ac = (mageArmorActive ? 13 : 10) + dexMod;
  }
  if (shield?.ac_bonus) ac += shield.ac_bonus;
  if (shieldOfFaithActive) ac += 2;
  if (hastedActive) ac += 2;
  return ac;
}

// Compute the new AC after swapping armor, given the loot table.
export function computeAcAfterArmorChange(
  currentAc: number,
  oldArmorId: string | null | undefined,
  newArmorId: string | null | undefined,
  lootTable: LootItem[]
): number {
  const oldBonus = oldArmorId ? (lootTable.find((l) => l.id === oldArmorId)?.ac_bonus ?? 0) : 0;
  const newBonus = newArmorId ? (lootTable.find((l) => l.id === newArmorId)?.ac_bonus ?? 0) : 0;
  return currentAc - oldBonus + newBonus;
}

// ─── Conditions ───────────────────────────────────────────────────────────────

// Condition effect data lives in `services/conditions/registry.ts`. These
// Sets are derived views — kept exported for the call sites that read
// them directly (`conditions.some((c) => SET.has(c))`). New code should
// prefer the query helpers in the registry module.
export {
  ADVANTAGE_CONDITIONS,
  DISADV_CONDITIONS,
  PLAYER_ADV_CONDITIONS,
  ENEMY_DISADV_CONDITIONS,
} from './conditions/registry.js';
import { autoFailsSave, disadvantageOnSave } from './conditions/registry.js';

// SRD 5.2.1 skill → governing ability. Keys are pansori's lowercase snake-case
// skill ids (as in SRD_CLASS_SKILLS / `skill_proficiencies`). The single source
// of truth for which ability a skill check rolls.
export const SKILL_ABILITY: Record<string, AbilityKey> = {
  athletics: 'str',
  acrobatics: 'dex',
  sleight_of_hand: 'dex',
  stealth: 'dex',
  arcana: 'int',
  history: 'int',
  investigation: 'int',
  nature: 'int',
  religion: 'int',
  animal_handling: 'wis',
  insight: 'wis',
  medicine: 'wis',
  perception: 'wis',
  survival: 'wis',
  deception: 'cha',
  intimidation: 'cha',
  performance: 'cha',
  persuasion: 'cha',
};

/** The governing ability for a skill (case-insensitive on the skill name);
 *  defaults to INT for an unknown skill. */
export function abilityForSkill(skill: string): AbilityKey {
  return SKILL_ABILITY[skill.toLowerCase()] ?? 'int';
}

// On-hit saving throw: returns true if the save FAILS (condition is applied).
// Pass proficient=true when the character has saving throw proficiency in this ability.
// coverDexBonus (SRD 5.2.1 p.15): half cover +2 to DEX saves, three-quarters
// cover +5 — applied only for DEX saves. AC use of the same bonus happens
// separately in resolvePlayerAttack / resolveEnemyAttack.
// targetConditions: pass the target's current conditions to force auto-fail on
// STR/DEX saves when paralyzed/stunned/unconscious/petrified. Restrained gives
// disadvantage on DEX saves.
export function rollConditionSave(
  ability: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha',
  score: number,
  dc: number,
  proficient = false,
  level = 1,
  coverDexBonus = 0,
  targetConditions: string[] = [],
  advantage = false,
  extraDisadvantage = false,
  // SRD Raise Dead / Resurrection — −N penalty to D20 Tests until
  // long-rested off. Caller passes `d20TestPenalty(char)`; the
  // save subtracts it from the final roll, same shape as the Bane
  // and Slow penalties below.
  reviveD20Pen = 0,
  // When set, use this value for the d20 instead of rolling (advantage /
  // disadvantage ignored). Lets a caller test a fixed die — e.g. Rogue
  // Stroke of Luck checking whether turning the roll into a 20 would pass.
  // Auto-fail conditions (paralyzed/stunned STR/DEX) still apply, per RAW.
  forceD20?: number
): boolean {
  // Auto-fail saves: registry-driven. Paralyzed/stunned/unconscious/petrified
  // auto-fail STR + DEX saves (SRD 5.2.1 p.186/p.189).
  if (autoFailsSave(targetConditions, ability)) {
    return true;
  }
  const prof = proficient ? profBonus(level) : 0;
  const cover = ability === 'dex' ? coverDexBonus : 0;
  // 2024 PHB Slow — slowed creature has a -2 penalty to Dex saves.
  // Stacks linearly with proficiency / cover. Pansori MVP applies
  // only on Dex saves (RAW: "−2 penalty to ... Dexterity saving
  // throws"); other saves unaffected.
  const slowedDexPenalty = ability === 'dex' && targetConditions.includes('slowed') ? 2 : 0;
  // SRD Bane — baned creature subtracts 1d4 from saves. Applies to
  // every save ability (RAW: "make an attack roll or a saving
  // throw"). Rolled fresh on each save, mirror of the toHit baneRoll.
  const baneRoll = targetConditions.includes('baned') ? d(4) : 0;
  // Save disadvantage from conditions (e.g. restrained → DEX saves). Advantage
  // and disadvantage cancel — see 2024 PHB advantage/disadvantage rules.
  // `extraDisadvantage` covers any caller-supplied source (e.g. heavy
  // encumbrance giving disadv on STR/DEX/CON saves per 2024 PHB).
  const disadv = disadvantageOnSave(targetConditions, ability) || extraDisadvantage;
  // 2024 PHB Haste — "the target has Advantage on Dexterity saving
  // throws." Caller advantage wins by 2024 PHB stacking rules, so OR
  // these together rather than threading a separate parameter.
  const hasteAdv = ability === 'dex' && targetConditions.includes('hasted');
  // SRD Beacon of Hope — hopeful creatures have advantage on WIS
  // saves (and death saves; that path lives in the death-save
  // handler, not here).
  const hopefulAdv = ability === 'wis' && targetConditions.includes('hopeful');
  const advSource = advantage || hasteAdv || hopefulAdv;
  const netAdv = advSource && !disadv;
  const netDisadv = disadv && !advSource;
  // Note: Halfling Lucky for saves would land here. We don't currently
  // thread the species through this helper since it's also called for
  // enemies. Caller threads it via the higher-level `conditionSavingThrow`
  // wrapper if needed.
  const final = (roll: number): number =>
    roll + abilityMod(score) + prof + cover - slowedDexPenalty - baneRoll - reviveD20Pen;
  if (forceD20 !== undefined) {
    return final(forceD20) < dc;
  }
  if (netDisadv) {
    return final(Math.min(d(20), d(20))) < dc;
  }
  if (netAdv) {
    return final(Math.max(d(20), d(20))) < dc;
  }
  return final(d(20)) < dc;
}

// ─── Consumable effects ───────────────────────────────────────────────────────

export function resolveSaveWithAdvantage(abilityScore: number) {
  const roll1 = d(20) + abilityMod(abilityScore);
  const roll2 = d(20) + abilityMod(abilityScore);
  return { roll1, roll2, best: Math.max(roll1, roll2) };
}

export function resolveMysteryConsumable(): { result: 'heal' | 'hurt' | 'none'; value: number } {
  const eff = d(3);
  if (eff === 1) return { result: 'heal', value: rollDice('1d4') };
  if (eff === 2) return { result: 'hurt', value: rollDice('1d4') };
  return { result: 'none', value: 0 };
}

// ─── Passive checks ───────────────────────────────────────────────────────────

// Passive Perception DC an enemy presents: 10 + WIS modifier (PHB p.175)
export function passivePerceptionDC(enemyWisdom: number): number {
  return 10 + abilityMod(enemyWisdom);
}

/**
 * 2024 PHB lighting & vision (PHB p.190).
 *
 * Each cell / room has one of three light levels:
 *   - bright: normal vision; no effect.
 *   - dim:    "lightly obscured". Sight-based Perception has
 *             Disadvantage. Treated as -5 to passive Perception.
 *   - dark:   "heavily obscured". Sight-based observers are
 *             effectively Blinded — automatically fail Perception
 *             vs hidden things; attacks against them are at
 *             advantage, their attacks at disadvantage. For the
 *             Stealth/Perception contest, the observer auto-fails.
 *
 * Darkvision (`darkvisionFt > 0`) shifts the effective level one
 * step brighter within range: dark → dim, dim → bright. For
 * pansori's room-grained model, every cell counts as within
 * range (rooms are smaller than the typical 60 ft darkvision).
 *
 * `effectiveLightFor` returns the level a given creature actually
 * perceives. Used by sneak / search call sites that need the
 * observer's effective light to adjust DCs.
 */
export type LightLevel = 'bright' | 'dim' | 'dark';

export function effectiveLightFor(roomLighting: LightLevel, darkvisionFt: number): LightLevel {
  if (darkvisionFt <= 0) return roomLighting;
  // Shift one step brighter.
  if (roomLighting === 'dark') return 'dim';
  if (roomLighting === 'dim') return 'bright';
  return 'bright';
}

/**
 * Light-adjusted passive Perception DC. Dim light gives the observer
 * Disadvantage on sight-based Perception (-5 to passive). Dark light
 * heavily obscures — observer effectively auto-fails sight Perception;
 * we model this as DC = 0 so any roll succeeds (the caller can detect
 * the `dark` case explicitly if it wants a different short-circuit).
 */
export function passivePerceptionDcInLight(
  enemyWisdom: number,
  effectiveLight: LightLevel
): number {
  const base = passivePerceptionDC(enemyWisdom);
  if (effectiveLight === 'dim') return Math.max(0, base - 5);
  if (effectiveLight === 'dark') return 0;
  return base;
}

// Passive Perception score for trap detection: 10 + WIS mod + prof if proficient in Perception
// SRD 5.2.1 / 5e DMG ch.5: compare passive score to trap DC; meet/exceed = spotted before triggering.
export function passivePerception(
  wisdom: number,
  level: number,
  perceptionProficient: boolean
): number {
  return 10 + abilityMod(wisdom) + (perceptionProficient ? profBonus(level) : 0);
}

// Disarm trap: DEX check + profBonus if character has Thieves' Tools or Hacking Tools proficiency
export function disarmTrap(
  dexterity: number,
  level: number,
  toolProficient: boolean,
  reviveD20Pen = 0
): { roll: number; total: number; success: boolean } {
  const roll = d(20);
  const total =
    roll + abilityMod(dexterity) + (toolProficient ? profBonus(level) : 0) - reviveD20Pen;
  return { roll, total, success: false }; // dc compared at call site
}

// ─── Skill checks ─────────────────────────────────────────────────────────────

// proficient = whether the character has proficiency in this skill.
// expertise = double proficiency bonus (Rogue/Bard Expertise).
// jackOfAllTrades = add half prof when not proficient (Bard L2+).
export function skillCheck(
  abilityScore: number,
  dc: number,
  proficient = false,
  level = 1,
  disadvantage = false,
  expertise = false,
  jackOfAllTrades = false,
  advantage = false,
  halflingLucky = false,
  // SRD Rogue Reliable Talent (L7) — treat a d20 of 9 or lower as a 10 on a
  // check that uses a skill/tool proficiency. The caller passes whether the
  // rogue has the feature; we additionally gate on `proficient` so it only
  // fires on a proficient check, per RAW.
  reliableTalent = false,
  // SRD Rogue Stroke of Luck (L20) — when set, a *failed* check is turned into
  // a natural 20 if that 20 would meet the DC. The caller passes whether the
  // rogue has the use available and, when `strokeOfLuckUsed` comes back true,
  // spends it. One D20-Test category among attack/check/save.
  strokeOfLuck = false,
  // SRD Raise Dead / Resurrection — −N penalty to D20 Tests until
  // long-rested off. Subtracted from the final total.
  reviveD20Pen = 0,
  // SRD Bard Peerless Skill (Lore L14) — a pre-rolled Bardic Inspiration die
  // the caller supplies (0 = not attempting). Added to a failed check only
  // when it would convert it to a success; the result flags `peerlessSkillUsed`
  // so the caller spends the BI use (a still-fail refunds it).
  peerlessDieRoll = 0
) {
  const roll1 = d(20);
  const netAdv = advantage && !disadvantage;
  const netDisadv = disadvantage && !advantage;
  let roll = netDisadv ? Math.min(roll1, d(20)) : netAdv ? Math.max(roll1, d(20)) : roll1;
  // 2024 PHB Halfling Lucky — re-roll a Nat 1, take the new result.
  if (halflingLucky && roll === 1) roll = d(20);
  // Reliable Talent floors the (post-reroll) die at 10 on a proficient check.
  if (reliableTalent && proficient && roll < 10) roll = 10;
  const prof = profBonus(level);
  let profContrib = 0;
  if (proficient) profContrib = expertise ? prof * 2 : prof;
  else if (jackOfAllTrades) profContrib = Math.floor(prof / 2);
  const mods = abilityMod(abilityScore) + profContrib - reviveD20Pen;
  let total = roll + mods;
  // Stroke of Luck — turn a failed check into a 20 when that rescues it.
  let strokeOfLuckUsed = false;
  if (strokeOfLuck && total < dc && 20 + mods >= dc) {
    roll = 20;
    total = 20 + mods;
    strokeOfLuckUsed = true;
  }
  // Peerless Skill — add the rolled BI die to a failed check when it rescues it.
  let peerlessSkillUsed = false;
  if (peerlessDieRoll > 0 && !strokeOfLuckUsed && total < dc && total + peerlessDieRoll >= dc) {
    total += peerlessDieRoll;
    peerlessSkillUsed = true;
  }
  return { roll, total, success: total >= dc, strokeOfLuckUsed, peerlessSkillUsed };
}

// ─── Death saves ──────────────────────────────────────────────────────────────

// ─── Class features ───────────────────────────────────────────────────────────

// Sneak Attack dice expression (Rogue PHB p.96): ⌈level/2⌉ d6
export function sneakAttackDice(level: number): string {
  return `${Math.ceil(level / 2)}d6`;
}

// Extra Attack — additional attacks per Attack action.
// Fighter: 2 at L5, 3 at L11, 4 at L20. Ranger/Paladin/Barbarian: 2 at L5 only.
// Returns number of EXTRA attacks (0 = 1 total, 1 = 2 total, 2 = 3 total)
export function extraAttackCount(cls: string, level: number): number {
  if (cls === 'fighter') {
    if (level >= 20) return 3; // 4 attacks total
    if (level >= 11) return 2; // 3 attacks total
    if (level >= 5) return 1; // 2 attacks total
    return 0;
  }
  if (['ranger', 'paladin', 'barbarian', 'monk'].includes(cls)) {
    return level >= 5 ? 1 : 0;
  }
  return 0;
}

// Barbarian Rage damage bonus (2024 PHB) — applies to STR-based melee attacks.
// Same progression as 2014: +2 / +3 / +4 at L1/L9/L16.
export function rageDamageBonus(level: number): number {
  if (level >= 16) return 4;
  if (level >= 9) return 3;
  return 2;
}

// Rage uses per long rest (2024 PHB).
// 2024 PHB progression rebalanced upward at lower levels compared to 2014.
// 2024: L1-2=2, L3-5=3, L6-11=4, L12-16=5, L17+=6.
export function rageUsesMax(level: number): number {
  if (level >= 17) return 6;
  if (level >= 12) return 5;
  if (level >= 6) return 4;
  if (level >= 3) return 3;
  return 2; // levels 1–2
}

// ─── Dice manipulation ────────────────────────────────────────────────────────

// Multiply a dice expression by a count: multiplyDice('1d6', 3) → '3d6'
export function multiplyDice(expr: string, count: number): string {
  if (count <= 0 || !expr) return '0';
  // Plain numeric expressions (used by Heal-style static-value heals)
  // multiply directly: multiplyDice('10', 2) → '20'.
  if (!expr.includes('d')) {
    const flat = parseInt(expr, 10);
    if (!isNaN(flat)) return String(flat * count);
  }
  const m = expr.match(/^(\d+)d(\d+)((?:[+-]\d+)?)$/);
  if (!m) return expr;
  const newCount = parseInt(m[1], 10) * count;
  return `${newCount}d${m[2]}${m[3]}`;
}

// Add two same-die expressions: addDice('2d6', '1d6') → '3d6'.
// Also handles plain-numeric expressions: addDice('70', '10') → '80'
// (used by Heal-style static-value heals + their upcast bonuses).
// If die sizes differ, falls back to a '+'-chained string (rollDice
// reads the leading term only — callers should avoid this path for
// load-bearing math).
export function addDice(base: string, extra: string): string {
  if (!extra || extra === '0') return base;
  // Both plain numbers (no 'd') — sum them.
  if (!base.includes('d') && !extra.includes('d')) {
    const flatBase = parseInt(base, 10);
    const flatExtra = parseInt(extra, 10);
    if (!isNaN(flatBase) && !isNaN(flatExtra)) {
      return String(flatBase + flatExtra);
    }
  }
  const mb = base.match(/^(\d+)d(\d+)((?:[+-]\d+)?)$/);
  const me = extra.match(/^(\d+)d(\d+)((?:[+-]\d+)?)$/);
  if (mb && me && mb[2] === me[2] && !mb[3] && !me[3]) {
    return `${parseInt(mb[1], 10) + parseInt(me[1], 10)}d${mb[2]}`;
  }
  // Different die sizes — just concatenate; rollDice handles '+' chains too loosely,
  // so we return a compound expression and let the caller handle it.
  return `${base}+${extra}`;
}

// ─── Spell damage scaling ─────────────────────────────────────────────────────

// Returns effective damage dice for an upcasted spell.
export function upcastDamage(spell: Spell, slotLevel: number): string {
  const extraLevels = Math.max(0, slotLevel - (spell.level ?? 1));
  if (!spell.upcastBonus || extraLevels === 0) return spell.damage ?? '0';
  return addDice(spell.damage ?? '0', multiplyDice(spell.upcastBonus, extraLevels));
}

// Upcast expression for a dual-damage spell's SECOND component (e.g. Flame
// Strike's radiant half). Mirrors upcastDamage against damage2 / upcastBonus2.
export function upcastDamage2(spell: Spell, slotLevel: number): string {
  const base = spell.damage2 ?? '0';
  const extraLevels = Math.max(0, slotLevel - (spell.level ?? 1));
  if (!spell.upcastBonus2 || extraLevels === 0) return base;
  return addDice(base, multiplyDice(spell.upcastBonus2, extraLevels));
}

// Returns cantrip damage dice scaled by character level (PHB cantrip progression).
export function cantripDamageDice(spell: Spell, charLevel: number): string {
  const bonus = charLevel >= 17 ? 3 : charLevel >= 11 ? 2 : charLevel >= 5 ? 1 : 0;
  if (bonus === 0 || !spell.upcastBonus) return spell.damage ?? '0';
  return addDice(spell.damage ?? '0', multiplyDice(spell.upcastBonus, bonus));
}

// ─── Spell slot tables (PHB) ─────────────────────────────────────────────────

// Returns max slots per spell level for a given class and character level.
// PHB multiclass spell-slot table, indexed by effective caster level
// (1–20). Single-class full-casters use their level directly; half-
// casters use ⌊level/2⌋; third-casters use ⌊level/3⌋. Multiclass
// characters sum the contributions and look up here. Defined as a
// constant so both `spellSlotsForClassLevel` and the multiclass
// helper in `services/multiclass.ts` can index it.
const MULTICLASS_SLOT_TABLE: Record<number, Record<number, number>> = {
  1: { 1: 2 },
  2: { 1: 3 },
  3: { 1: 4, 2: 2 },
  4: { 1: 4, 2: 3 },
  5: { 1: 4, 2: 3, 3: 2 },
  6: { 1: 4, 2: 3, 3: 3 },
  7: { 1: 4, 2: 3, 3: 3, 4: 1 },
  8: { 1: 4, 2: 3, 3: 3, 4: 2 },
  9: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 1 },
  10: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2 },
  11: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1 },
  12: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1 },
  13: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1 },
  14: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1 },
  15: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1, 8: 1 },
  16: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1, 8: 1 },
  17: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1, 8: 1, 9: 1 },
  18: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 3, 6: 1, 7: 1, 8: 1, 9: 1 },
  19: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 3, 6: 2, 7: 1, 8: 1, 9: 1 },
  20: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 3, 6: 2, 7: 2, 8: 1, 9: 1 },
};

/**
 * Looks up the spell-slot row for an effective caster level (1–20).
 * Returns an empty record outside the valid range. Used by both
 * single-class (`spellSlotsForClassLevel`) and multiclass
 * (`spellSlotsForChar`) computations; the only difference is how the
 * effective level is derived.
 */
export function spellSlotsForCasterLevel(effectiveLevel: number): Record<number, number> {
  if (effectiveLevel < 1) return {};
  return MULTICLASS_SLOT_TABLE[Math.min(effectiveLevel, 20)] ?? {};
}

// Full casters: Wizard, Cleric, Druid, Bard, Sorcerer.
// Half casters (÷2 effective level): Ranger, Paladin.
// Pact Magic (Warlock): separate table, all slots are the same level.
// Returns a Record<spellLevel, maxSlots> — only present levels have entries.
export function spellSlotsForClassLevel(cls: string, level: number): Record<number, number> {
  const fullCasters = ['wizard', 'cleric', 'druid', 'bard', 'sorcerer'];
  const halfCasters = ['ranger', 'paladin'];

  if (cls === 'warlock') {
    // Pact Magic: all slots are the same level, recharge on short rest
    const pactSlots: Record<number, Record<number, number>> = {
      1: { 1: 1 },
      2: { 1: 2 },
      3: { 2: 2 },
      4: { 2: 2 },
      5: { 3: 2 },
      6: { 3: 2 },
      7: { 4: 2 },
      8: { 4: 2 },
      9: { 5: 2 },
      10: { 5: 2 },
      11: { 5: 3 },
      12: { 5: 3 },
      13: { 5: 3 },
      14: { 5: 3 },
      15: { 5: 3 },
      16: { 5: 3 },
      17: { 5: 4 },
      18: { 5: 4 },
      19: { 5: 4 },
      20: { 5: 4 },
    };
    return pactSlots[level] ?? {};
  }

  // PHB multiclassing spell slot table (full casters; half casters use ⌊level/2⌋)
  if (!fullCasters.includes(cls) && !halfCasters.includes(cls)) return {};
  const effectiveLevel = halfCasters.includes(cls) ? Math.floor(level / 2) : level;
  return spellSlotsForCasterLevel(effectiveLevel);
}

// ─── Spell helpers ────────────────────────────────────────────────────────────

// Spell attack bonus = proficiency + spellcasting ability modifier (PHB p.205)
export function spellAttackBonus(level: number, castingAbilityScore: number): number {
  return profBonus(level) + abilityMod(castingAbilityScore);
}

// Spell save DC = 8 + proficiency + spellcasting ability modifier (PHB p.205)
export function spellSaveDC(level: number, castingAbilityScore: number): number {
  return 8 + profBonus(level) + abilityMod(castingAbilityScore);
}

// Spell attack roll against an enemy. Crits (nat 20) double damage dice; nat 1 always misses.
export function resolveSpellAttack(
  level: number,
  castingAbilityScore: number,
  enemyAc: number,
  // SRD Sorcerer Innate Sorcery (L1) grants Advantage on Sorcerer spell attack
  // rolls while active — roll two d20 and keep the higher.
  advantage = false
): { hit: boolean; critical: boolean; roll: number; bonus: number; total: number } {
  const bonus = spellAttackBonus(level, castingAbilityScore);
  const roll = advantage ? Math.max(d(20), d(20)) : d(20);
  if (roll === 1) return { hit: false, critical: false, roll, bonus, total: roll + bonus };
  if (roll === 20) return { hit: true, critical: true, roll, bonus, total: roll + bonus };
  const total = roll + bonus;
  return { hit: total >= enemyAc, critical: false, roll, bonus, total };
}

// ─── Death saves ──────────────────────────────────────────────────────────────

// Per 5e PHB: d20, 10+ = success, 1-9 = failure, nat 20 = regain 1 HP, nat 1 = 2 failures.
// 3 successes = stable, 3 failures = dead.
// SRD Beacon of Hope grants advantage on death saves — caller passes
// `advantage = true` when the dying PC has the `hopeful` condition.
// SRD Raise Dead / Resurrection penalty subtracts from the success
// threshold check (the raw d20 still decides nat-1/nat-20 specials,
// but the 10+ pass/fail comparison reads `roll + adjustment >= 10`).
export function rollDeathSave(
  current: DeathSaves = { successes: 0, failures: 0 },
  advantage = false,
  reviveD20Pen = 0
) {
  const roll = advantage ? Math.max(d(20), d(20)) : d(20);
  if (roll === 20)
    return { roll, result: 'regain_hp' as const, saves: { successes: 0, failures: 0 } };
  if (roll === 1) {
    const saves = { ...current, failures: current.failures + 2 };
    const result = saves.failures >= 3 ? ('dead' as const) : ('double_failure' as const);
    return { roll, result, saves };
  }
  if (roll - reviveD20Pen >= 10) {
    const saves = { ...current, successes: current.successes + 1 };
    const result = saves.successes >= 3 ? ('stable' as const) : ('success' as const);
    return { roll, result, saves };
  }
  const saves = { ...current, failures: current.failures + 1 };
  const result = saves.failures >= 3 ? ('dead' as const) : ('failure' as const);
  return { roll, result, saves };
}
