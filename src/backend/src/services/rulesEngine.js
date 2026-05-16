// D&D 5e rules engine — pure mechanics, no narrative, no context-specific content

// ─── Dice ─────────────────────────────────────────────────────────────────────

export function d(sides) {
  return Math.floor(Math.random() * sides) + 1;
}

export function rollDice(expr) {
  if (!expr) return d(4);
  const flat = parseInt(expr, 10);
  if (!isNaN(flat) && !String(expr).includes('d')) return flat;
  const m = String(expr).match(/(\d+)d(\d+)(?:\+(\d+))?/);
  if (!m) return d(4);
  let total = parseInt(m[3] || 0, 10);
  for (let i = 0; i < parseInt(m[1], 10); i++) total += d(parseInt(m[2], 10));
  return total;
}

function rollCritical(expr) {
  // Critical hit: damage dice rolled twice, modifier added once
  if (!expr) return d(4) + d(4);
  const m = String(expr).match(/(\d+)d(\d+)(?:\+(\d+))?/);
  if (!m) return d(4) + d(4);
  const count = parseInt(m[1], 10) * 2;
  let total = parseInt(m[3] || 0, 10);
  for (let i = 0; i < count; i++) total += d(parseInt(m[2], 10));
  return total;
}

// ─── Ability scores ───────────────────────────────────────────────────────────

export function abilityMod(score) {
  return Math.floor(((score ?? 10) - 10) / 2);
}

// PHB proficiency bonus table
export function profBonus(level) {
  return Math.ceil((level ?? 1) / 4) + 1;
}

// ─── Combat state ─────────────────────────────────────────────────────────────

export const FRESH_TURN = {
  action_used:           false,
  bonus_action_used:     false,
  reaction_used:         false,
  free_interaction_used: false,
};

export function startCombat(playerDex, enemyDex) {
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

// Player attacks an enemy. Returns hit/miss/crit, roll details, and damage.
// Assumes melee (STR-based); finesse weapons could use DEX — future enhancement.
export function resolvePlayerAttack(player, weaponDamage, targetAC) {
  const strMod    = abilityMod(player.str);
  const prof      = profBonus(player.level);
  const roll      = d(20);
  const total     = roll + strMod + prof;

  if (roll === 1)  return { hit: false, fumble: true,  critical: false, roll, total, damage: 0, strMod, prof };
  if (roll === 20) return { hit: true,  fumble: false, critical: true,  roll, total, damage: Math.max(1, rollCritical(weaponDamage) + strMod), strMod, prof };
  if (total >= targetAC) return { hit: true, fumble: false, critical: false, roll, total, damage: Math.max(1, rollDice(weaponDamage) + strMod), strMod, prof };
  return { hit: false, fumble: false, critical: false, roll, total, damage: 0, strMod, prof };
}

// Enemy attacks the player. Returns hit/miss and damage.
export function resolveEnemyAttack(enemy, playerAC) {
  // Enemies use an approximate CR-based attack modifier rather than full stat blocks
  const atkMod = Math.floor((enemy.hp ?? 8) / 4);
  const roll   = d(20);
  const total  = roll + atkMod;
  const hit    = roll !== 1 && (roll === 20 || total >= playerAC);
  return { hit, roll, total, damage: hit ? rollDice(enemy.damage) : 0 };
}

// Unarmed strike: 1 + STR modifier (minimum 1), per 5e PHB
export function unarmedDamage(str) {
  return Math.max(1, 1 + abilityMod(str));
}

// ─── Equipment legality ───────────────────────────────────────────────────────

// Weapon draw/stow costs a free object interaction (once per turn) in combat.
export function canEquipWeapon(combatActive, turnActions) {
  if (!combatActive) return { allowed: true };
  if (!turnActions?.free_interaction_used) return { allowed: true, cost: 'free_interaction' };
  return { allowed: false, reason: 'You have already used your free object interaction this turn.' };
}

// Don/doff times per 5e PHB: light 1 min, medium 5 min, heavy 10 min.
// None of these can be done in combat (shields not yet implemented).
const ARMOR_CATEGORY = {
  leather_armor:    'light',
  hazmat_suit:      'light',
  plate_armor:      'heavy',
  force_field_belt: 'light',
};
const DON_TIME = { light: '1 minute', medium: '5 minutes', heavy: '10 minutes' };

export function canDonArmor(combatActive, armorId) {
  if (!combatActive) return { allowed: true };
  const cat = ARMOR_CATEGORY[armorId] ?? 'light';
  return {
    allowed: false,
    reason: `Donning ${cat} armour takes ${DON_TIME[cat]} — impossible mid-combat.`,
  };
}

// Compute the new AC after swapping armor, given the loot table.
export function computeAcAfterArmorChange(currentAc, oldArmorId, newArmorId, lootTable) {
  const oldBonus = oldArmorId ? (lootTable.find(l => l.id === oldArmorId)?.ac_bonus ?? 0) : 0;
  const newBonus = newArmorId ? (lootTable.find(l => l.id === newArmorId)?.ac_bonus ?? 0) : 0;
  return currentAc - oldBonus + newBonus;
}

// ─── Skill checks ─────────────────────────────────────────────────────────────

// proficient = whether the character has proficiency in this skill
export function skillCheck(abilityScore, dc, proficient = false, level = 1) {
  const roll  = d(20);
  const total = roll + abilityMod(abilityScore) + (proficient ? profBonus(level) : 0);
  return { roll, total, success: total >= dc };
}

// ─── Death saves ──────────────────────────────────────────────────────────────

// Per 5e PHB: d20, 10+ = success, 1-9 = failure, nat 20 = regain 1 HP, nat 1 = 2 failures.
// 3 successes = stable, 3 failures = dead.
export function rollDeathSave(current = { successes: 0, failures: 0 }) {
  const roll = d(20);
  if (roll === 20) return { roll, result: 'regain_hp', saves: { successes: 0, failures: 0 } };
  if (roll === 1) {
    const saves = { ...current, failures: current.failures + 2 };
    return { roll, result: saves.failures >= 3 ? 'dead' : 'double_failure', saves };
  }
  if (roll >= 10) {
    const saves = { ...current, successes: current.successes + 1 };
    return { roll, result: saves.successes >= 3 ? 'stable' : 'success', saves };
  }
  const saves = { ...current, failures: current.failures + 1 };
  return { roll, result: saves.failures >= 3 ? 'dead' : 'failure', saves };
}
