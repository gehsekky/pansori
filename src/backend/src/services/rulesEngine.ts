import type { DeathSaves, LootItem, Spell, TurnActions } from '../types.js';

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

// ─── Ability scores ───────────────────────────────────────────────────────────

export function abilityMod(score: number | undefined): number {
  return Math.floor(((score ?? 10) - 10) / 2);
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
  enemy: { resistances?: string[]; vulnerabilities?: string[]; immunities?: string[] }
): { damage: number; note: string } {
  if (!damageType) return { damage: raw, note: '' };
  if (enemy.immunities?.includes(damageType))
    return { damage: 0, note: ` [immune to ${damageType}]` };
  if (enemy.vulnerabilities?.includes(damageType))
    return { damage: raw * 2, note: ` [vulnerable to ${damageType}: ×2]` };
  if (enemy.resistances?.includes(damageType))
    return { damage: Math.floor(raw / 2), note: ` [resistant to ${damageType}: ×½]` };
  return { damage: raw, note: '' };
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
  attackBonus = 0
): AttackResult {
  const strMod = abilityMod(player.str);
  const dexMod = abilityMod(player.dex);
  const atkMod = ranged ? dexMod : finesse ? Math.max(strMod, dexMod) : strMod;
  const atkStat: 'STR' | 'DEX' = ranged ? 'DEX' : finesse && dexMod > strMod ? 'DEX' : 'STR';
  const prof = weaponProficient ? profBonus(player.level) : 0;
  const roll1 = d(20);
  // Advantage + disadvantage cancel; net advantage rolls 2d20 keep higher; net disadv keeps lower
  const netAdv = advantage && !disadvantage;
  const netDisadv = disadvantage && !advantage;
  const roll = netDisadv ? Math.min(roll1, d(20)) : netAdv ? Math.max(roll1, d(20)) : roll1;
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
      damage: Math.max(1, rollCritical(weaponDamage) + atkMod),
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
      damage: Math.max(1, rollDice(weaponDamage) + atkMod),
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

// Unarmed strike: 1 + STR modifier (minimum 1), per 5e PHB
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
  lootTable: LootItem[]
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
    ac = 10 + dexMod; // unarmored
  }
  if (shield?.ac_bonus) ac += shield.ac_bonus;
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

// Enemy gets advantage on attacks against the player when player has these conditions
export const ADVANTAGE_CONDITIONS = new Set([
  'paralyzed',
  'stunned',
  'prone',
  'blinded',
  'restrained',
]);
// Player attacks with disadvantage when they have these conditions
export const DISADV_CONDITIONS = new Set([
  'poisoned',
  'prone',
  'frightened',
  'blinded',
  'restrained',
]);
// Player attacks with advantage when they have these conditions (invisible enemy = player can't see)
export const PLAYER_ADV_CONDITIONS = new Set(['invisible']);
// Enemy attacks the player with disadvantage when the player has these conditions
export const ENEMY_DISADV_CONDITIONS = new Set(['invisible']);

// Conditions that force STR/DEX saves to auto-fail (SRD 5.2.1 p.186/p.189).
// Paralyzed, stunned, unconscious, petrified all share this rule.
const STR_DEX_AUTO_FAIL = new Set(['paralyzed', 'stunned', 'unconscious', 'petrified']);

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
  targetConditions: string[] = []
): boolean {
  // Auto-fail STR/DEX saves while incapacitated by paralysis/stun/unconscious/petrified
  if (
    (ability === 'str' || ability === 'dex') &&
    targetConditions.some((c) => STR_DEX_AUTO_FAIL.has(c))
  ) {
    return true;
  }
  const prof = proficient ? profBonus(level) : 0;
  const cover = ability === 'dex' ? coverDexBonus : 0;
  // Restrained: disadvantage on DEX saves (SRD p.187)
  if (ability === 'dex' && targetConditions.includes('restrained')) {
    const r1 = d(20);
    const r2 = d(20);
    return Math.min(r1, r2) + abilityMod(score) + prof + cover < dc;
  }
  return d(20) + abilityMod(score) + prof + cover < dc;
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

// Passive Perception score for trap detection: 10 + WIS mod + prof if proficient in Perception
// 5e DMG ch.5: compare passive score to trap DC; meet/exceed = spotted before triggering
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
  toolProficient: boolean
): { roll: number; total: number; success: boolean } {
  const roll = d(20);
  const total = roll + abilityMod(dexterity) + (toolProficient ? profBonus(level) : 0);
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
  advantage = false
) {
  const roll1 = d(20);
  const netAdv = advantage && !disadvantage;
  const netDisadv = disadvantage && !advantage;
  const roll = netDisadv ? Math.min(roll1, d(20)) : netAdv ? Math.max(roll1, d(20)) : roll1;
  const prof = profBonus(level);
  let profContrib = 0;
  if (proficient) profContrib = expertise ? prof * 2 : prof;
  else if (jackOfAllTrades) profContrib = Math.floor(prof / 2);
  const total = roll + abilityMod(abilityScore) + profContrib;
  return { roll, total, success: total >= dc };
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

// Barbarian Rage damage bonus (PHB p.48) — applies to STR-based melee attacks
export function rageDamageBonus(level: number): number {
  if (level >= 16) return 4;
  if (level >= 9) return 3;
  return 2;
}

// Rage uses per long rest (PHB p.48)
export function rageUsesMax(level: number): number {
  if (level >= 17) return 6;
  if (level >= 13) return 5;
  if (level >= 10) return 4;
  if (level >= 6) return 3;
  return 2; // levels 1–5
}

// ─── Dice manipulation ────────────────────────────────────────────────────────

// Multiply a dice expression by a count: multiplyDice('1d6', 3) → '3d6'
export function multiplyDice(expr: string, count: number): string {
  if (count <= 0 || !expr) return '0';
  const m = expr.match(/^(\d+)d(\d+)((?:[+-]\d+)?)$/);
  if (!m) return expr;
  const newCount = parseInt(m[1], 10) * count;
  return `${newCount}d${m[2]}${m[3]}`;
}

// Add two same-die expressions: addDice('2d6', '1d6') → '3d6'.
// If die sizes differ, falls back to rolling both and summing (no simplification).
export function addDice(base: string, extra: string): string {
  if (!extra || extra === '0') return base;
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

// Returns cantrip damage dice scaled by character level (PHB cantrip progression).
export function cantripDamageDice(spell: Spell, charLevel: number): string {
  const bonus = charLevel >= 17 ? 3 : charLevel >= 11 ? 2 : charLevel >= 5 ? 1 : 0;
  if (bonus === 0 || !spell.upcastBonus) return spell.damage ?? '0';
  return addDice(spell.damage ?? '0', multiplyDice(spell.upcastBonus, bonus));
}

// ─── Spell slot tables (PHB) ─────────────────────────────────────────────────

// Returns max slots per spell level for a given class and character level.
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
  const effectiveLevel = halfCasters.includes(cls) ? Math.floor(level / 2) : level;
  if (!fullCasters.includes(cls) && !halfCasters.includes(cls)) return {};

  const table: Record<number, Record<number, number>> = {
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
  return table[Math.min(effectiveLevel, 20)] ?? {};
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
  enemyAc: number
): { hit: boolean; critical: boolean; roll: number; bonus: number; total: number } {
  const bonus = spellAttackBonus(level, castingAbilityScore);
  const roll = d(20);
  if (roll === 1) return { hit: false, critical: false, roll, bonus, total: roll + bonus };
  if (roll === 20) return { hit: true, critical: true, roll, bonus, total: roll + bonus };
  const total = roll + bonus;
  return { hit: total >= enemyAc, critical: false, roll, bonus, total };
}

// ─── Death saves ──────────────────────────────────────────────────────────────

// Per 5e PHB: d20, 10+ = success, 1-9 = failure, nat 20 = regain 1 HP, nat 1 = 2 failures.
// 3 successes = stable, 3 failures = dead.
export function rollDeathSave(current: DeathSaves = { successes: 0, failures: 0 }) {
  const roll = d(20);
  if (roll === 20)
    return { roll, result: 'regain_hp' as const, saves: { successes: 0, failures: 0 } };
  if (roll === 1) {
    const saves = { ...current, failures: current.failures + 2 };
    const result = saves.failures >= 3 ? ('dead' as const) : ('double_failure' as const);
    return { roll, result, saves };
  }
  if (roll >= 10) {
    const saves = { ...current, successes: current.successes + 1 };
    const result = saves.successes >= 3 ? ('stable' as const) : ('success' as const);
    return { roll, result, saves };
  }
  const saves = { ...current, failures: current.failures + 1 };
  const result = saves.failures >= 3 ? ('dead' as const) : ('failure' as const);
  return { roll, result, saves };
}
