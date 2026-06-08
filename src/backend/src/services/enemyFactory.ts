import type { Enemy, EnemyTemplate } from '../types.js';

// HP scaling — 1× solo, 1.5× 2-player, 2× 3-player, 2.5× 4-player. Shared by
// procgen (room population) and the map engine (wilderness encounter drops) so
// both stat-block instantiations stay identical.
export function scaleEnemyHp(baseHp: number, partySize: number): number {
  return Math.max(1, Math.round(baseHp * (0.5 + partySize * 0.5)));
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
