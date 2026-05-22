// Seed feats — 2024 PHB Chapter 5. This file is intentionally small;
// new feats are pure-data entries that need no engine changes if they
// fit one of the existing `FeatEffect` kinds in shared/types.ts.
// Adding a feat with a new shape needs one new union variant + one
// new case in `services/feats.ts`.
//
// The three seed feats below exercise three different effect kinds:
//   - **Tough** — `hp-per-level` (passive stat grant, applied at
//     take-time and re-applied retroactively to existing levels).
//   - **Lucky** — `d20-reroll` (per-long-rest resource; spend hooks
//     not yet wired — that's a follow-up).
//   - **Sharpshooter** — `ranged-toggle` (combat-time opt-in; toggle
//     hooks into the attack handler are a follow-up).
//
// More feats become data once the matching `FeatEffect` kind exists.
// See the discriminated union in shared/types.ts for the supported
// shapes.

import type { Feat } from '../../types.js';

export const SRD_FEATS: Record<string, Feat> = {
  tough: {
    id: 'tough',
    name: 'Tough',
    desc: 'Your hit point maximum increases by an amount equal to twice your character level when you take this feat. Whenever you gain a character level thereafter, your hit point maximum increases by an additional 2 hit points.',
    category: 'origin',
    effect: {
      kind: 'hp-per-level',
      amount: 2,
    },
  },

  lucky: {
    id: 'lucky',
    name: 'Lucky',
    desc: 'You have inexplicable luck that seems to kick in at just the right moment. You have a number of luck points equal to your Proficiency Bonus (3 at typical play levels). After you roll a d20 for a D20 Test, you can spend 1 luck point to give yourself advantage on the roll. You regain all expended luck points when you finish a long rest.',
    category: 'origin',
    effect: {
      kind: 'd20-reroll',
      // 2024 PHB scales with Proficiency Bonus; seed with 3 (level-5 PB).
      // A future PR can wire this to char.level for dynamic scaling.
      usesPerLongRest: 3,
    },
  },

  sharpshooter: {
    id: 'sharpshooter',
    name: 'Sharpshooter',
    desc: "You have mastered ranged weapons and can make shots that others find impossible. Before you make a ranged attack roll with a ranged weapon, you can choose to take a -5 penalty to the attack roll. If the attack hits, it deals +10 damage. Attacking at long range doesn't impose disadvantage on your ranged weapon attack rolls. Your ranged weapon attacks ignore half cover and three-quarters cover.",
    category: 'general',
    prerequisites: {
      minLevel: 4,
      other: ['Proficiency with a ranged weapon'],
    },
    effect: {
      kind: 'ranged-toggle',
      toHitPenalty: -5,
      bonusDamage: 10,
      ignoreHalfAndThreeQuartersCover: true,
      longRangeNoDisadvantage: true,
    },
  },

  sentinel: {
    id: 'sentinel',
    name: 'Sentinel',
    desc: 'When an enemy you can see attacks a target other than you within 5 feet of you, you can use your Reaction to make a Melee weapon attack against the attacker. (RAW also grants an OA speed-zero benefit not modeled in this engine.)',
    category: 'general',
    prerequisites: {
      minLevel: 4,
    },
    effect: {
      kind: 'sentinel-react',
    },
  },
};
