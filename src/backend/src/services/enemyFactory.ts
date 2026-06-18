import type { Enemy, EnemyTemplate } from '../types.js';

// Party-size encounter scaling — the SRD 5.2.1 way: adjust the NUMBER of
// creatures, never a creature's stat block (so every enemy stays bestiary-exact).
// The authored encounter is balanced for the campaign's `recommendedPartySize`,
// which IS the XP budget at that size (RAW: budget = per-character XP ×
// party size). For a different party the budget scales linearly, so the target
// count is `baseCount × partySize / recommendedSize`, FLOORED so the encounter's
// XP never exceeds the party's pool (we get as close as possible from below).
export function scaledEnemyCount(
  baseCount: number,
  partySize: number,
  recommendedSize = 1
): number {
  const multiplier = partySize / Math.max(1, recommendedSize);
  return Math.max(0, Math.floor(baseCount * multiplier));
}

// Apply count scaling to one room's already-materialized enemy list. Enemies are
// grouped by name (a name = one placement of one template); each group is grown
// or trimmed to its floored target. Two safeguards:
//   • A singleton group (count-1 placement — bosses, quest/rule targets) is never
//     cloned or dropped; its id (which a quest/rule may reference) is preserved.
//   • A multi-instance group keeps at least 1 (we never delete an authored
//     encounter outright, even for an under-sized party).
// Clones get fresh positional ids above any existing `#<n>` so nothing collides.
export function scaleRoomEnemiesByCount(
  roomId: string,
  enemies: Enemy[],
  partySize: number,
  recommendedSize: number
): Enemy[] {
  const groups = new Map<string, Enemy[]>();
  for (const e of enemies) {
    const g = groups.get(e.name);
    if (g) g.push(e);
    else groups.set(e.name, [e]);
  }
  // Next free positional index in this room, so clone ids never collide.
  let nextIdx = 0;
  for (const e of enemies) {
    const m = /#(\d+)$/.exec(e.id);
    if (m) nextIdx = Math.max(nextIdx, Number(m[1]) + 1);
  }
  const out: Enemy[] = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      out.push(group[0]); // unique / boss / quest target — never cloned or dropped
      continue;
    }
    const target = Math.max(1, scaledEnemyCount(group.length, partySize, recommendedSize));
    if (target <= group.length) {
      out.push(...group.slice(0, target));
    } else {
      out.push(...group);
      const proto = group[0];
      const fullHp = proto.maxHp ?? proto.hp;
      for (let k = group.length; k < target; k++) {
        out.push({ ...proto, id: `${roomId}#${nextIdx++}`, hp: fullHp, maxHp: fullHp });
      }
    }
  }
  return out;
}

/**
 * Instantiate a combat `Enemy` from a bestiary `EnemyTemplate`. The single
 * source of truth for which template fields carry onto a live enemy — used by
 * procgen seeding and by `mapEngine` wilderness encounters so a rolled ambush
 * fights exactly like an authored room enemy.
 */
export function materializeEnemy(template: EnemyTemplate, id: string, hp: number): Enemy {
  return {
    id,
    name: template.name,
    // SRD creature type — drives Fiend/Undead interactions (Holy Water).
    // The template contract says this carries onto live enemies; it was
    // previously only carried by code campaigns' place() helper, so
    // wilderness encounters (and now DB room placements) lost it.
    creatureType: template.creatureType,
    hp,
    maxHp: hp,
    ac: template.ac,
    damage: template.damage,
    toHit: template.toHit,
    xp: template.xp,
    str: template.str,
    dex: template.dex,
    con: template.con,
    int: template.int,
    wis: template.wis,
    cha: template.cha,
    onHitEffect: template.onHitEffect,
    multiattack: template.multiattack,
    resistances: template.resistances,
    vulnerabilities: template.vulnerabilities,
    immunities: template.immunities,
    condition_immunities: template.condition_immunities,
    spells: template.spells,
    castChance: template.castChance,
    spellSaveDC: template.spellSaveDC,
    spellAttackBonus: template.spellAttackBonus,
    attackReachFt: template.attackReachFt,
    speedFt: template.speedFt,
    darkvision_ft: template.darkvision_ft,
    sunlightSensitivity: template.sunlightSensitivity,
    phases: template.phases,
    damageType: template.damageType,
    packTactics: template.packTactics,
    bloodiedFrenzy: template.bloodiedFrenzy,
    bonusDamage: template.bonusDamage,
    bonusDamageType: template.bonusDamageType,
    chargeRider: template.chargeRider,
    undeadFortitude: template.undeadFortitude,
    lifeDrain: template.lifeDrain,
    regeneration: template.regeneration,
    regenBlockedBy: template.regenBlockedBy,
    parry: template.parry,
    parryBonus: template.parryBonus,
    rampage: template.rampage,
    aura: template.aura,
    // Recharge AoE — previously dropped here, so wilderness-encounter and
    // DB-placed breath monsters lost their breath weapon entirely.
    breathWeapon: template.breathWeapon,
    legendary_actions: template.legendary_actions,
    legendary_pool: template.legendary_pool,
    legendary_action_points: template.legendary_actions
      ? (template.legendary_pool ?? 3)
      : undefined,
    lair_actions: template.lair_actions,
    // Death drops carried from the template (a placement may override these).
    drops: template.drops,
    goldDrop: template.goldDrop,
  };
}
