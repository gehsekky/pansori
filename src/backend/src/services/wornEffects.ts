import type { AbilityKey, Character, LootItem, WornEffect, WornTraits } from '../types.js';
import { abilityMod } from './rulesEngine.js';

const ABILITIES: AbilityKey[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

// Worn-effects layer. An item confers its passive `wornEffects` only while it is
// WORN in a body slot (it's in `char.equipment`) AND — if it requires
// attunement — the character is attuned to it. Both gates matter: attuning to
// the Moonstone Amulet without putting it on, or wearing it without attuning,
// gives nothing, matching 5e's "worn and attuned" requirement.

/**
 * All worn effects currently active on `char`, across every filled slot — plus
 * `carried` items (Stone of Good Luck, Ioun Stones), which need no slot.
 */
export function activeWornEffects(char: Character, lootTable: LootItem[]): WornEffect[] {
  const attuned = char.attuned_items ?? [];
  const out: WornEffect[] = [];
  const slotted = new Set(Object.values(char.equipment ?? {}));
  const carried = (char.inventory ?? [])
    .filter((i) => !slotted.has(i.instance_id) && lootTable.find((l) => l.id === i.id)?.carried)
    .map((i) => i.instance_id);
  for (const instanceId of [...slotted, ...carried]) {
    const invItem = char.inventory?.find((i) => i.instance_id === instanceId);
    const loot = invItem ? lootTable.find((l) => l.id === invItem.id) : undefined;
    if (!loot?.wornEffects?.length) continue;
    if (loot.requiresAttunement && !attuned.includes(instanceId)) continue;
    out.push(...loot.wornEffects);
  }
  return out;
}

/**
 * SRD curse effects of every cursed item the character is attuned to — worn
 * or not ("removing the armor fails to end the curse"). Each comes with the
 * cursed item's instance id.
 */
export function activeCurseEffects(
  char: Character,
  lootTable: LootItem[]
): Array<{ effect: WornEffect; instanceId: string }> {
  const out: Array<{ effect: WornEffect; instanceId: string }> = [];
  for (const instanceId of char.attuned_items ?? []) {
    const inv = char.inventory?.find((i) => i.instance_id === instanceId);
    const loot = inv ? lootTable.find((l) => l.id === inv.id) : undefined;
    for (const effect of loot?.curseEffects ?? []) out.push({ effect, instanceId });
  }
  return out;
}

/**
 * Total flat bonus to saving throws of `ability` from worn gear. Counts both
 * ability-specific bonuses (e.g. Moonstone Amulet +1 WIS) and all-saves bonuses
 * (`ability: 'all'` — Cloak / Ring of Protection's +1 to every save).
 */
export function wornSaveBonus(char: Character, ability: AbilityKey, lootTable: LootItem[]): number {
  return activeWornEffects(char, lootTable).reduce(
    (sum, e) =>
      e.kind === 'save_bonus' && (e.ability === ability || e.ability === 'all')
        ? sum + e.bonus
        : sum,
    0
  );
}

/**
 * Total flat AC bonus from worn gear (Cloak / Ring of Protection's +1). Folded
 * into the stored `ac` at every AC-recompute site, alongside `defenseAcBonus`,
 * so it stacks with armor and a shield.
 */
export function wornAcBonus(char: Character, lootTable: LootItem[]): number {
  // SRD Bracers of Defense — only while wearing no armor and using no Shield.
  const unarmored = !char.equipment?.armor && !char.equipment?.shield;
  return activeWornEffects(char, lootTable).reduce(
    (sum, e) => (e.kind === 'ac_bonus' && (!e.unarmoredOnly || unarmored) ? sum + e.bonus : sum),
    0
  );
}

/**
 * Derive the non-numeric worn-item traits (resistances, immunities, Advantage
 * on a skill or Initiative, Swim / Climb Speed, a Speed floor, Advantage on
 * saves against spells) from the active worn effects. Undefined when none.
 */
export function deriveWornTraits(char: Character, lootTable: LootItem[]): WornTraits | undefined {
  const t: WornTraits = {};
  const push = (
    k: 'resistances' | 'immunities' | 'spellImmunities' | 'conditionImmunities' | 'skillAdvantage',
    v: string
  ) => {
    const list = (t[k] ??= []);
    if (!list.includes(v)) list.push(v);
  };
  const better = (a: number | 'walk' | undefined, b: number | 'walk') =>
    a === 'walk' || b === 'walk' ? 'walk' : Math.max(a ?? 0, b);
  for (const e of activeWornEffects(char, lootTable)) {
    if (e.kind === 'resistance') push('resistances', e.damageType);
    else if (e.kind === 'damage_immunity') push('immunities', e.damageType);
    else if (e.kind === 'damage_reduction')
      (t.reductions ??= []).push({ damageType: e.damageType, dice: e.dice });
    else if (e.kind === 'spell_immunity') push('spellImmunities', e.spellId);
    else if (e.kind === 'condition_immunity') push('conditionImmunities', e.condition);
    else if (e.kind === 'skill_advantage') push('skillAdvantage', e.skill);
    else if (e.kind === 'initiative_advantage' && e.party) t.partyInitiativeAdvantage = true;
    else if (e.kind === 'initiative_advantage') t.initiativeAdvantage = true;
    else if (e.kind === 'ranged_ac_bonus') t.rangedAcBonus = (t.rangedAcBonus ?? 0) + e.bonus;
    else if (e.kind === 'spell_attack_disadvantage') t.spellAttackDisadvantage = true;
    else if (e.kind === 'speed_mode' && e.mode === 'swim') t.swimFt = better(t.swimFt, e.feet);
    else if (e.kind === 'speed_mode' && e.mode === 'climb') t.climbFt = better(t.climbFt, e.feet);
    else if (e.kind === 'speed_floor') t.speedFloor = Math.max(t.speedFloor ?? 0, e.feet);
    else if (e.kind === 'spell_save_advantage') t.spellSaveAdvantage = true;
    else if (e.kind === 'no_crits') t.critImmune = true;
    else if (e.kind === 'check_bonus') t.checkBonus = (t.checkBonus ?? 0) + e.bonus;
    else if (e.kind === 'weapon_bonus') {
      (t.weaponBonuses ??= []).push({ weapons: e.weapons, damage: e.damage });
    } else if (e.kind === 'unarmored_base_ac') {
      t.unarmoredBaseAc = Math.max(t.unarmoredBaseAc ?? 0, e.base);
    } else if (e.kind === 'spell_dc_bonus') t.spellDcBonus = (t.spellDcBonus ?? 0) + e.bonus;
    else if (e.kind === 'poison_save_advantage') t.poisonSaveAdvantage = true;
    else if (e.kind === 'wound_closure') t.woundClosure = true;
    else if (e.kind === 'regeneration') {
      (t.regeneration ??= []).push({ dice: e.dice, everyMinutes: e.everyMinutes });
    } else if (e.kind === 'displacement') t.displacement = true;
    else if (e.kind === 'truesight') t.truesightFt = Math.max(t.truesightFt ?? 0, e.feet);
    else if (e.kind === 'missile_snaring') t.missileSnaring = true;
    else if (e.kind === 'ranged_weapon_resistance') t.rangedWeaponResistance = true;
    else if (e.kind === 'clawed_unarmed') {
      t.clawedUnarmed = { dice: e.dice, damageType: e.damageType, bonus: e.bonus };
    } else if (e.kind === 'spell_attack_bonus') {
      t.spellAttackBonus = (t.spellAttackBonus ?? 0) + e.bonus;
      if (e.ignoreHalfCover) t.spellIgnoreHalfCover = true;
    }
  }
  // Curse effects ride on attunement, not the slot.
  for (const { effect: e, instanceId } of activeCurseEffects(char, lootTable)) {
    if (e.kind === 'vulnerability') {
      const list = (t.vulnerabilities ??= []);
      if (!list.includes(e.damageType)) list.push(e.damageType);
    } else if (e.kind === 'missile_attraction') {
      t.missileAttractionFt = Math.max(t.missileAttractionFt ?? 0, e.radiusFt);
    } else if (e.kind === 'hp_per_level') t.hpPerLevel = true;
    else if (e.kind === 'berserker') t.berserkerWeapon = instanceId;
    else if (e.kind === 'demon_bane') t.demonBane = true;
  }
  return Object.keys(t).length > 0 ? t : undefined;
}

/**
 * Largest bright-light radius (ft) shed by the character's worn light sources
 * (e.g. a held Torch). 0 = no worn light. Synced onto the combat entity's
 * `light_radius_ft` at combat start so the bearer illuminates the dark.
 */
export function wornLightRadius(char: Character, lootTable: LootItem[]): number {
  return activeWornEffects(char, lootTable).reduce(
    (max, e) => (e.kind === 'light' ? Math.max(max, e.radiusFt) : max),
    0
  );
}

/**
 * Re-derive the EFFECTIVE ability scores from worn `set_ability` items (Amulet
 * of Health, Gauntlets of Ogre Power, Belt of Giant Strength, …). Mutates `char`
 * in place and is IDEMPOTENT — safe to call after any equip / unequip / attune /
 * ASI, and defensively at combat start.
 *
 * The contract: `char.str`/`con`/… always hold the EFFECTIVE score (so every
 * read site sees the boost with no change), while `char.ability_set_base` records
 * the TRUE base of any ability a worn item is currently raising, so removal
 * restores it. An item SETS the score to its `value` with no effect if the base
 * is already ≥ value (RAW); the highest worn value for an ability wins. A CON
 * change adjusts max HP by Δmod × level, mirroring the ASI rule.
 */
export function syncSetAbilities(char: Character, lootTable: LootItem[]): void {
  const oldConMod = abilityMod(char.con);
  // 1. Un-apply current overrides so every `char.<ability>` holds the true base.
  const prevBase = char.ability_set_base ?? {};
  for (const ab of ABILITIES) {
    const base = prevBase[ab];
    if (base !== undefined) char[ab] = base;
  }
  // 2. The score each worn `set_ability` effect wants (highest value per ability).
  const want: Partial<Record<AbilityKey, number>> = {};
  for (const e of activeWornEffects(char, lootTable)) {
    if (e.kind !== 'set_ability') continue;
    want[e.ability] = Math.max(want[e.ability] ?? 0, e.value);
  }
  // SRD Belt of Dwarvenkind / Ioun Stones — raise the true base by the summed
  // increases, to the highest cap; a higher set score (a Belt) still wins.
  const incs: Partial<Record<AbilityKey, { amount: number; max: number }>> = {};
  for (const e of activeWornEffects(char, lootTable)) {
    if (e.kind !== 'ability_increase') continue;
    const cur = incs[e.ability] ?? { amount: 0, max: 0 };
    incs[e.ability] = { amount: cur.amount + e.amount, max: Math.max(cur.max, e.max) };
  }
  for (const ab of ABILITIES) {
    const inc = incs[ab];
    if (!inc || char[ab] >= inc.max) continue;
    want[ab] = Math.max(want[ab] ?? 0, Math.min(inc.max, char[ab] + inc.amount));
  }
  // SRD Hammer of Thunderbolts' Might of Giants — while attuned to it, a worn
  // and attuned Belt of Giant Strength / Gauntlets of Ogre Power sets Strength
  // 4 higher (max 30).
  const attuned = char.attuned_items ?? [];
  const mightPrefixes = (char.inventory ?? []).flatMap((i) =>
    attuned.includes(i.instance_id)
      ? (lootTable.find((l) => l.id === i.id)?.mightOfGiants ?? [])
      : []
  );
  if (mightPrefixes.length) {
    for (const iid of Object.values(char.equipment ?? {})) {
      const inv = char.inventory?.find((i) => i.instance_id === iid);
      const loot = inv ? lootTable.find((l) => l.id === inv.id) : undefined;
      if (!inv || !loot || !mightPrefixes.some((p) => inv.id.startsWith(p))) continue;
      if (loot.requiresAttunement && !attuned.includes(iid)) continue;
      for (const e of loot.wornEffects ?? []) {
        if (e.kind === 'set_ability' && e.ability === 'str') {
          want.str = Math.max(want.str ?? 0, Math.min(30, e.value + 4));
        }
      }
    }
  }
  // SRD Potion of Giant Strength — while it lasts, it competes with worn items.
  if (char.conditions?.includes('giant_strength') && char.potion_strength) {
    want.str = Math.max(want.str ?? 0, char.potion_strength.score);
  }
  // 3. Apply — set the effective score where the item beats the base; stash the
  //    displaced base. "No effect if base already ≥ value" falls out of the >.
  const nextBase: Partial<Record<AbilityKey, number>> = {};
  for (const ab of ABILITIES) {
    const target = want[ab];
    if (target !== undefined && target > char[ab]) {
      nextBase[ab] = char[ab];
      char[ab] = target;
    }
  }
  // Set to undefined (not `delete`) so a patch-merge persist (updatePcActor does
  // `{...char, ...patch}`) actually clears a previously-stored base map.
  char.ability_set_base = Object.keys(nextBase).length > 0 ? nextBase : undefined;
  // Worn traits + darkvision (Goggles of Night: Darkvision 60 ft, or +60 ft on
  // top of existing Darkvision). `darkvision_base` holds the displaced value.
  char.worn_traits = deriveWornTraits(char, lootTable);
  const baseDv = char.darkvision_base ?? char.darkvision_ft ?? 0;
  const dvEffects = activeWornEffects(char, lootTable).filter((e) => e.kind === 'darkvision');
  const dvGain = dvEffects.reduce((m, e) => (!e.atLeast ? Math.max(m, e.feet) : m), 0);
  const dvFloor = dvEffects.reduce((m, e) => (e.atLeast ? Math.max(m, e.feet) : m), 0);
  if (dvGain > 0 || dvFloor > baseDv) {
    char.darkvision_base = baseDv;
    const added = dvGain > 0 ? (baseDv > 0 ? baseDv + dvGain : dvGain) : baseDv;
    char.darkvision_ft = Math.max(added, dvFloor);
  } else if (char.darkvision_base !== undefined) {
    char.darkvision_ft = char.darkvision_base;
    char.darkvision_base = undefined;
  }
  // 4. A CON change ripples into max HP (Δmod × level), mirroring handleApplyAsi;
  //    so does SRD Berserker Axe's +1 per level (tracked in `item_hp_bonus`).
  const itemHp = char.worn_traits?.hpPerLevel ? char.level : 0;
  const conDelta =
    (abilityMod(char.con) - oldConMod) * char.level + itemHp - (char.item_hp_bonus ?? 0);
  char.item_hp_bonus = itemHp || undefined;
  if (conDelta !== 0) {
    char.max_hp = Math.max(1, char.max_hp + conDelta);
    char.hp = Math.max(0, Math.min(char.max_hp, char.hp + conDelta));
  }
}

/**
 * Whether a worn item grants Advantage on checks with `skill` (Boots / Cloak of
 * Elvenkind → Stealth, Sentinel Shield / Eyes of the Eagle → Perception).
 */
export function wornSkillAdvantage(char: Pick<Character, 'worn_traits'>, skill: string): boolean {
  const key = (x: string) =>
    x
      .trim()
      .toLowerCase()
      .replace(/[\s_-]+/g, '_');
  return (char.worn_traits?.skillAdvantage ?? []).some((s) => key(s) === key(skill));
}
