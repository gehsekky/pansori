import type { BeastForm } from '../../types.js';

// 2024 PHB Wild Shape "Beast Forms" — a curated list of beast stat blocks
// the druid can transform into. Each form replaces the druid's attack
// profile while shifted and applies its trait set.
//
// Form selection rules:
//   - Base druids can pick any form with cr ≤ floor(level/4) (rounded up),
//     min 1/4. (i.e. L1-L3 = 1/4, L4-L7 = 1/2, L8+ = 1.)
//   - Circle of the Moon druids can pick any form with cr ≤ floor(level/3),
//     min 1. (i.e. L3-L5 = 1, L6-L8 = 2, L9-L11 = 3, etc.)
//
// These match the 2024 PHB Wild Shape progression. Pansori models temp
// HP separately (2 × level for base, 3 × level for Moon — see Wild Shape
// handler in gameEngine.ts).

export const BEAST_FORMS: Record<string, BeastForm> = {
  // ── CR 0 — accessible to every druid at L1 ──────────────────────────────
  hawk: {
    id: 'hawk',
    hp: 3,
    name: 'Hawk',
    cr: 0,
    attackName: 'Talons',
    attackToHit: 5,
    attackDamage: '1d4-1',
    attackDamageType: 'slashing',
    flying: true,
    speedFt: 60, // 10 ft walking + 60 ft flying in RAW; we use the higher
    descriptor: 'A keen-eyed hawk darting on the wind',
  },
  // ── CR 1/4 — accessible at L1 (base) / L1 (moon won't use these much) ──
  wolf: {
    id: 'wolf',
    hp: 11,
    name: 'Wolf',
    cr: 0.25,
    attackName: 'Bite',
    attackToHit: 4,
    attackDamage: '2d4+2',
    attackDamageType: 'piercing',
    packTactics: true,
    speedFt: 40,
    descriptor: 'A lean grey wolf, eyes glinting',
  },
  spider: {
    id: 'spider',
    hp: 26,
    name: 'Giant Spider',
    cr: 0.25,
    attackName: 'Bite',
    attackToHit: 5,
    attackDamage: '1d8',
    attackDamageType: 'piercing',
    climbing: true,
    speedFt: 30,
    descriptor: 'A hand-sized spider that scales walls',
  },
  // ── CR 1/2 — base druid L4+, Moon L3+ ───────────────────────────────────
  black_bear: {
    id: 'black_bear',
    hp: 19,
    name: 'Black Bear',
    cr: 0.5,
    attackName: 'Claws',
    attackToHit: 3,
    attackDamage: '2d4+2',
    attackDamageType: 'slashing',
    physicalResistance: true,
    speedFt: 30,
    descriptor: 'A shaggy black bear, claws raking',
  },
  // ── CR 1 — base druid L8+, Moon L3+ ─────────────────────────────────────
  brown_bear: {
    id: 'brown_bear',
    hp: 34,
    name: 'Brown Bear',
    cr: 1,
    attackName: 'Bite + Claw',
    attackToHit: 5,
    attackDamage: '2d6+4',
    attackDamageType: 'slashing',
    physicalResistance: true,
    speedFt: 40,
    descriptor: 'A massive brown bear, a wall of fury',
  },
  dire_wolf: {
    id: 'dire_wolf',
    hp: 37,
    name: 'Dire Wolf',
    cr: 1,
    attackName: 'Bite',
    attackToHit: 5,
    attackDamage: '2d6+3',
    attackDamageType: 'piercing',
    packTactics: true,
    speedFt: 50,
    descriptor: 'A hulking dire wolf with iron jaws',
  },
};

// Returns the max CR a druid of this level can access.
// SRD progression: 1/4 (L1-3) → 1/2 (L4-7) → 1 (L8+).
export function maxBeastCRForLevel(level: number): number {
  if (level >= 8) return 1;
  if (level >= 4) return 0.5;
  return 0.25;
}

// Filter the catalog to the forms available to a druid at this level.
export function availableBeastForms(level: number): BeastForm[] {
  const maxCR = maxBeastCRForLevel(level);
  return Object.values(BEAST_FORMS).filter((f) => f.cr <= maxCR);
}
