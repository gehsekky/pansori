import type { LootItem, TurnActions, DeathSaves } from '../types.js';

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

function rollCritical(expr: string | null | undefined): number {
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
  action_used:           false,
  bonus_action_used:     false,
  reaction_used:         false,
  free_interaction_used: false,
};

export function startCombat(playerDex?: number, enemyDex?: number) {
  const playerInit = d(20) + abilityMod(playerDex ?? 10);
  const enemyInit  = d(20) + abilityMod(enemyDex  ?? 10);
  return {
    combat_active: true,
    initiative:    { player: playerInit, enemy: enemyInit },
    player_first:  playerInit >= enemyInit,
    turn_actions:  { ...FRESH_TURN },
  };
}

export function endCombat() {
  return {
    combat_active: false,
    initiative:    null,
    player_first:  true,
    turn_actions:  { ...FRESH_TURN },
  };
}

// ─── Attack resolution ────────────────────────────────────────────────────────

interface PlayerStats {
  str:   number;
  dex:   number;
  level: number;
}

interface AttackResult {
  hit:      boolean;
  fumble:   boolean;
  critical: boolean;
  roll:     number;
  total:    number;
  damage:   number;
  atkMod:   number;
  atkStat:  'STR' | 'DEX';
  prof:     number;
}

// Player attacks an enemy. Finesse weapons use whichever of STR/DEX is higher.
export function resolvePlayerAttack(player: PlayerStats, weaponDamage: string | null, targetAC: number, finesse = false): AttackResult {
  const strMod  = abilityMod(player.str);
  const dexMod  = abilityMod(player.dex);
  const atkMod  = finesse ? Math.max(strMod, dexMod) : strMod;
  const atkStat = (finesse && dexMod > strMod) ? 'DEX' : 'STR';
  const prof    = profBonus(player.level);
  const roll    = d(20);
  const total   = roll + atkMod + prof;

  if (roll === 1)  return { hit: false, fumble: true,  critical: false, roll, total, damage: 0, atkMod, atkStat, prof };
  if (roll === 20) return { hit: true,  fumble: false, critical: true,  roll, total, damage: Math.max(1, rollCritical(weaponDamage) + atkMod), atkMod, atkStat, prof };
  if (total >= targetAC) return { hit: true, fumble: false, critical: false, roll, total, damage: Math.max(1, rollDice(weaponDamage) + atkMod), atkMod, atkStat, prof };
  return { hit: false, fumble: false, critical: false, roll, total, damage: 0, atkMod, atkStat, prof };
}

interface EnemyStats {
  damage: string;
  toHit:  number;
}

// Enemy attacks the player. Returns hit/miss and damage.
export function resolveEnemyAttack(enemy: EnemyStats, playerAC: number) {
  const roll  = d(20);
  const total = roll + enemy.toHit;
  const hit   = roll !== 1 && (roll === 20 || total >= playerAC);
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
  if (!turnActions?.free_interaction_used) return { allowed: true, cost: 'free_interaction' } as const;
  return { allowed: false, reason: 'You have already used your free object interaction this turn.' } as const;
}

// Shields cost 1 action to don/doff (PHB). We block in combat for simplicity.
export function canDonShield(combatActive: boolean) {
  if (!combatActive) return { allowed: true } as const;
  return { allowed: false, reason: 'Donning or doffing a shield takes 1 action — you cannot do it mid-combat.' } as const;
}

// Don/doff times per 5e PHB: light 1 min, medium 5 min, heavy 10 min.
// None of these can be done in combat.
const ARMOR_CATEGORY: Record<string, string> = {
  leather_armor:    'light',
  hazmat_suit:      'light',
  plate_armor:      'heavy',
  force_field_belt: 'light',
};
const DON_TIME: Record<string, string> = { light: '1 minute', medium: '5 minutes', heavy: '10 minutes' };

export function canDonArmor(combatActive: boolean, armorId: string) {
  if (!combatActive) return { allowed: true } as const;
  const cat = ARMOR_CATEGORY[armorId] ?? 'light';
  return {
    allowed: false,
    reason: `Donning ${cat} armour takes ${DON_TIME[cat]} — impossible mid-combat.`,
  } as const;
}

// Compute the new AC after swapping armor, given the loot table.
export function computeAcAfterArmorChange(
  currentAc: number,
  oldArmorId: string | null | undefined,
  newArmorId: string | null | undefined,
  lootTable: LootItem[],
): number {
  const oldBonus = oldArmorId ? (lootTable.find(l => l.id === oldArmorId)?.ac_bonus ?? 0) : 0;
  const newBonus = newArmorId ? (lootTable.find(l => l.id === newArmorId)?.ac_bonus ?? 0) : 0;
  return currentAc - oldBonus + newBonus;
}

// ─── Skill checks ─────────────────────────────────────────────────────────────

// proficient = whether the character has proficiency in this skill
export function skillCheck(abilityScore: number, dc: number, proficient = false, level = 1) {
  const roll  = d(20);
  const total = roll + abilityMod(abilityScore) + (proficient ? profBonus(level) : 0);
  return { roll, total, success: total >= dc };
}

// ─── Death saves ──────────────────────────────────────────────────────────────

// Per 5e PHB: d20, 10+ = success, 1-9 = failure, nat 20 = regain 1 HP, nat 1 = 2 failures.
// 3 successes = stable, 3 failures = dead.
export function rollDeathSave(current: DeathSaves = { successes: 0, failures: 0 }) {
  const roll = d(20);
  if (roll === 20) return { roll, result: 'regain_hp' as const, saves: { successes: 0, failures: 0 } };
  if (roll === 1) {
    const saves = { ...current, failures: current.failures + 2 };
    return { roll, result: (saves.failures >= 3 ? 'dead' : 'double_failure') as const, saves };
  }
  if (roll >= 10) {
    const saves = { ...current, successes: current.successes + 1 };
    return { roll, result: (saves.successes >= 3 ? 'stable' : 'success') as const, saves };
  }
  const saves = { ...current, failures: current.failures + 1 };
  return { roll, result: (saves.failures >= 3 ? 'dead' : 'failure') as const, saves };
}
