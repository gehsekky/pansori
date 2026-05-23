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
    // 2024 PHB Lucky (Origin Feat). Pool of Luck Points equal to
    // proficiency bonus, refreshed on long rest. Two ways to spend:
    // (a) grant yourself Advantage on your own d20 roll, or (b)
    // impose Disadvantage on an incoming attack roll against you.
    desc: 'Pool of Luck Points equal to your proficiency bonus (refreshed on long rest). Spend 1 to give yourself Advantage on a d20 roll, or 1 to impose Disadvantage on an attack roll against you.',
    category: 'origin',
    effect: {
      kind: 'd20-reroll',
      // Sentinel value — actual pool size derived from PB at
      // applyFeatTake / long-rest time when `scalesWithPb` is set.
      usesPerLongRest: 0,
      scalesWithPb: true,
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

  // 2024 PHB Magic Initiate (Arcane / Divine / Primal) — origin feat
  // variants. Each grants 2 cantrips + 1 L1 spell from the matching
  // spell list. The L1 spell can be cast 1/long rest without spending
  // a spell slot, OR using an available slot at any time. The engine
  // tracks the per-rest free cast via
  // `class_resource_uses.magic_initiate_l1_used`; the L1 choice is
  // recorded on `feat_choices['magic_initiate_*'].l1` so the cast
  // handler can identify the free-cast spell. Cantrips simply land on
  // `spells_known`.
  magic_initiate_arcane: {
    id: 'magic_initiate_arcane',
    name: 'Magic Initiate (Arcane)',
    desc: 'Choose 2 cantrips and 1 level-1 spell from the Wizard / Sorcerer spell list. You can cast the L1 spell once per long rest without expending a slot (or via a slot as normal).',
    category: 'origin',
    effect: {
      kind: 'extra-cantrips-and-l1',
      spellList: 'arcane',
      cantripCount: 2,
      l1Count: 1,
    },
  },
  magic_initiate_divine: {
    id: 'magic_initiate_divine',
    name: 'Magic Initiate (Divine)',
    desc: 'Choose 2 cantrips and 1 level-1 spell from the Cleric / Paladin spell list. You can cast the L1 spell once per long rest without expending a slot (or via a slot as normal).',
    category: 'origin',
    effect: {
      kind: 'extra-cantrips-and-l1',
      spellList: 'divine',
      cantripCount: 2,
      l1Count: 1,
    },
  },
  magic_initiate_primal: {
    id: 'magic_initiate_primal',
    name: 'Magic Initiate (Primal)',
    desc: 'Choose 2 cantrips and 1 level-1 spell from the Druid / Ranger spell list. You can cast the L1 spell once per long rest without expending a slot (or via a slot as normal).',
    category: 'origin',
    effect: {
      kind: 'extra-cantrips-and-l1',
      spellList: 'primal',
      cantripCount: 2,
      l1Count: 1,
    },
  },

  alert: {
    id: 'alert',
    name: 'Alert',
    desc: 'You gain a +proficiency bonus to Initiative rolls. You cannot be surprised while you are conscious. (The third RAW benefit — swap initiative with a willing ally — is not yet modeled.)',
    category: 'origin',
    effect: {
      kind: 'alert',
    },
  },

  savage_attacker: {
    id: 'savage_attacker',
    name: 'Savage Attacker',
    desc: "Once per turn, when you hit a creature with a weapon's damage roll, you can reroll the damage and use either total. The engine automatically takes the higher of the two.",
    category: 'origin',
    effect: {
      kind: 'savage-attacker',
    },
  },

  mobile: {
    id: 'mobile',
    name: 'Mobile',
    desc: "Your speed increases by 10 feet. (RAW also grants: difficult terrain doesn't halve Dash speed; melee attack against a creature prevents OAs from that creature this turn — neither modeled yet.)",
    category: 'general',
    prerequisites: {
      minLevel: 4,
    },
    effect: {
      kind: 'speed-bonus',
      bonusFeet: 10,
    },
  },

  tavern_brawler: {
    id: 'tavern_brawler',
    name: 'Tavern Brawler',
    desc: 'Half-feat: +1 STR or CON. Your unarmed strikes deal 1d4 + STR mod instead of 1 + STR mod. (RAW also grants improvised-weapon proficiency and a free Shove on unarmed hit — neither modeled yet.)',
    category: 'origin',
    abilityBonus: { choices: ['str', 'con'] },
    effect: {
      kind: 'tavern-brawler',
    },
  },

  skilled: {
    id: 'skilled',
    name: 'Skilled',
    desc: 'You gain proficiency in any combination of three skills or tools of your choice.',
    category: 'origin',
    effect: {
      kind: 'skill-proficiencies',
      count: 3,
    },
  },

  observant: {
    id: 'observant',
    name: 'Observant',
    desc: 'Half-feat: +1 INT or WIS. Your passive Perception and passive Investigation scores both increase by 5.',
    category: 'general',
    prerequisites: {
      minLevel: 4,
    },
    abilityBonus: { choices: ['int', 'wis'] },
    effect: {
      kind: 'observant',
    },
  },

  athlete: {
    id: 'athlete',
    name: 'Athlete',
    desc: 'Half-feat: +1 STR or DEX. Standing up from prone costs only 5 ft of movement (instead of half your speed). (RAW also: climbing speed not halved — not modeled.)',
    category: 'general',
    prerequisites: {
      minLevel: 4,
    },
    abilityBonus: { choices: ['str', 'dex'] },
    effect: {
      kind: 'athlete',
    },
  },

  dual_wielder: {
    id: 'dual_wielder',
    name: 'Dual Wielder',
    desc: 'Half-feat: +1 STR or DEX. You can use any one-handed melee weapon (not just Light) in your off-hand for two-weapon fighting. (RAW also grants free draw/stow of both weapons — not modeled.)',
    category: 'general',
    prerequisites: {
      minLevel: 4,
    },
    abilityBonus: { choices: ['str', 'dex'] },
    effect: {
      kind: 'dual-wielder',
    },
  },

  healer: {
    id: 'healer',
    name: 'Healer',
    desc: "Action: spend one use of a Healer's Kit to restore 1d6 + 4 + your proficiency bonus HP to a creature you can touch.",
    category: 'origin',
    effect: {
      kind: 'healer',
    },
  },

  polearm_master: {
    id: 'polearm_master',
    name: 'Polearm Master',
    desc: 'After the Attack action with a qualifying polearm (quarterstaff/spear/glaive/halberd/pike), make a bonus-action attack with the opposite end — 1d4 damage + your ability mod, same damage type as the weapon. (RAW also grants an OA when a creature enters your reach — not yet wired.)',
    category: 'general',
    prerequisites: {
      minLevel: 4,
    },
    effect: {
      kind: 'polearm-master',
    },
  },

  crossbow_expert: {
    id: 'crossbow_expert',
    name: 'Crossbow Expert',
    desc: "When you attack with a crossbow you don't have disadvantage from being within 5 ft of an enemy. (RAW also ignores the Loading property and grants a bonus-action hand crossbow shot after Attack — neither modeled yet.)",
    category: 'general',
    prerequisites: {
      minLevel: 4,
    },
    effect: {
      kind: 'crossbow-expert',
    },
  },

  great_weapon_master: {
    id: 'great_weapon_master',
    name: 'Great Weapon Master',
    desc: 'Once per turn, on a hit with a Heavy weapon, the target takes extra damage equal to your proficiency bonus. (RAW also grants a Bonus Action attack on a crit or kill with a Heavy weapon — not yet wired.)',
    category: 'general',
    prerequisites: {
      minLevel: 4,
      other: ['Proficiency with a Heavy weapon'],
    },
    effect: {
      kind: 'gwm-bonus-damage',
    },
  },

  heavy_armor_master: {
    id: 'heavy_armor_master',
    name: 'Heavy Armor Master',
    desc: "While you're wearing heavy armor and not incapacitated, attacks against you deal 3 less damage. (Also grants heavy-armor proficiency on take — not yet wired by the take handler.)",
    category: 'general',
    prerequisites: {
      minLevel: 4,
      other: ['Proficiency with heavy armor'],
    },
    effect: {
      kind: 'heavy-armor-master',
    },
  },

  war_caster: {
    id: 'war_caster',
    name: 'War Caster',
    desc: 'Advantage on CON saves to maintain concentration when you take damage. (RAW also grants: somatic components with both hands full; cast as an OA reaction — neither modeled yet.)',
    category: 'general',
    prerequisites: {
      minLevel: 4,
      other: ['Spellcasting feature'],
    },
    effect: {
      kind: 'war-caster',
    },
  },

  resilient: {
    id: 'resilient',
    name: 'Resilient',
    desc: 'Increase one ability score of your choice by 1. You gain saving-throw proficiency in that ability.',
    category: 'general',
    prerequisites: {
      minLevel: 4,
    },
    // Half-feat — player picks one of the six abilities for the +1
    // bump AND the save proficiency. `applyFeatTake` uses
    // `abilityChoice` for the +1 and `saveProficiencyChoices` for the
    // save prof; for Resilient they're the same ability, surfaced
    // by the FE as a single pick.
    abilityBonus: { choices: ['str', 'dex', 'con', 'int', 'wis', 'cha'] },
    effect: {
      kind: 'save-proficiency',
      // Empty `abilities` triggers the "player picks" branch in
      // `applyFeatTake`; the chosen ability is passed via
      // `saveProficiencyChoices`.
      abilities: [],
    },
  },
};
