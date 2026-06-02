// SRD 5.2.1 feat catalog — the 6 Origin Feats plus the 7 Epic Boon feats
// (L19+). The SRD's "General Feats" section contains only Ability Score
// Improvement + Grappler, neither of which fits pansori's choose-a-feat
// surface, so it is intentionally absent. Pansori is an
// SRD-only build; PHB-only feats (Lucky, Sharpshooter, Sentinel,
// Great Weapon Master, Polearm Master, War Caster, Heavy Armor
// Master, Resilient, Tough, Mobile, Observant, Athlete, Dual Wielder,
// Healer, Tavern Brawler, Crossbow Expert) were removed in the
// SRD-only refactor (Phase 3A).
//
// Adding a feat with a new shape needs one new union variant +
// one new case in `services/feats.ts`.

import type { Feat } from '../../types.js';

export const SRD_FEATS: Record<string, Feat> = {
  alert: {
    id: 'alert',
    name: 'Alert',
    desc: 'You gain a +proficiency bonus to Initiative rolls. You cannot be surprised while you are conscious. (The third RAW benefit — swap initiative with a willing ally — is not yet modeled.)',
    category: 'origin',
    effect: {
      kind: 'alert',
    },
  },

  // SRD 5.2.1 Magic Initiate — RAW is a single feat that picks
  // Cleric/Druid/Wizard list at take-time. Pansori splits the choice
  // into three feat IDs (arcane / divine / primal) so the picker
  // surface is one button per option rather than a take-then-pick
  // workflow. The L1 free-cast-per-long-rest mechanic is wired via
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

  savage_attacker: {
    id: 'savage_attacker',
    name: 'Savage Attacker',
    desc: "Once per turn, when you hit a creature with a weapon's damage roll, you can reroll the damage and use either total. The engine automatically takes the higher of the two.",
    category: 'origin',
    effect: {
      kind: 'savage-attacker',
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

  // ─── Epic Boon feats (SRD 5.2.1, L19+) ───────────────────────────────
  // Each boon grants +1 to a chosen ability (to a max of 30) alongside a
  // signature benefit. Taken at level 19+ in place of an Ability Score
  // Improvement. The +1 is modeled via `abilityBonus`; the signature
  // benefit's runtime hook lives outside the take handler.
  boon_combat_prowess: {
    id: 'boon_combat_prowess',
    name: 'Boon of Combat Prowess',
    desc: 'Increase one ability score by 1 (max 30). Peerless Aim: when you miss with an attack roll you may hit instead — once, then not again until the start of your next turn.',
    category: 'epic-boon',
    abilityBonus: { choices: ['str', 'dex', 'con', 'int', 'wis', 'cha'] },
    prerequisites: { minLevel: 19 },
    effect: { kind: 'epic-boon', boon: 'combat-prowess' },
  },
  boon_dimensional_travel: {
    id: 'boon_dimensional_travel',
    name: 'Boon of Dimensional Travel',
    desc: 'Increase one ability score by 1 (max 30). Blink Steps: immediately after you take the Attack or Magic action, you can teleport up to 30 feet to an unoccupied space you can see.',
    category: 'epic-boon',
    abilityBonus: { choices: ['str', 'dex', 'con', 'int', 'wis', 'cha'] },
    prerequisites: { minLevel: 19 },
    effect: { kind: 'epic-boon', boon: 'dimensional-travel' },
  },
  boon_fate: {
    id: 'boon_fate',
    name: 'Boon of Fate',
    desc: 'Increase one ability score by 1 (max 30). Improve Fate: when you or a creature within 60 feet succeeds on or fails a D20 Test, you can roll 2d4 and apply the total as a bonus or penalty — once, then not again until you roll Initiative or finish a rest.',
    category: 'epic-boon',
    abilityBonus: { choices: ['str', 'dex', 'con', 'int', 'wis', 'cha'] },
    prerequisites: { minLevel: 19 },
    effect: { kind: 'epic-boon', boon: 'fate' },
  },
  boon_irresistible_offense: {
    id: 'boon_irresistible_offense',
    name: 'Boon of Irresistible Offense',
    desc: 'Increase your Strength or Dexterity by 1 (max 30). Overcome Defenses: your bludgeoning, piercing, and slashing damage ignores Resistance. Overwhelming Strike: on a natural 20 attack roll, deal extra damage of the attack’s type equal to the ability score boosted by this boon.',
    category: 'epic-boon',
    abilityBonus: { choices: ['str', 'dex'] },
    prerequisites: { minLevel: 19 },
    effect: { kind: 'epic-boon', boon: 'irresistible-offense' },
  },
  boon_spell_recall: {
    id: 'boon_spell_recall',
    name: 'Boon of Spell Recall',
    desc: 'Increase your Intelligence, Wisdom, or Charisma by 1 (max 30). Free Casting: whenever you cast a spell with a level 1–4 slot, roll 1d4; if the roll equals the slot’s level, the slot isn’t expended.',
    category: 'epic-boon',
    abilityBonus: { choices: ['int', 'wis', 'cha'] },
    prerequisites: { minLevel: 19, other: ['Spellcasting feature'] },
    effect: { kind: 'epic-boon', boon: 'spell-recall' },
  },
  boon_night_spirit: {
    id: 'boon_night_spirit',
    name: 'Boon of the Night Spirit',
    desc: 'Increase one ability score by 1 (max 30). Merge with Shadows: while in Dim Light or Darkness you can become Invisible as a Bonus Action (ending after your next action, Bonus Action, or Reaction). Shadowy Form: while in Dim Light or Darkness you have Resistance to all damage except psychic and radiant.',
    category: 'epic-boon',
    abilityBonus: { choices: ['str', 'dex', 'con', 'int', 'wis', 'cha'] },
    prerequisites: { minLevel: 19 },
    effect: { kind: 'epic-boon', boon: 'night-spirit' },
  },
  boon_truesight: {
    id: 'boon_truesight',
    name: 'Boon of Truesight',
    desc: 'Increase one ability score by 1 (max 30). You gain Truesight with a range of 60 feet.',
    category: 'epic-boon',
    abilityBonus: { choices: ['str', 'dex', 'con', 'int', 'wis', 'cha'] },
    prerequisites: { minLevel: 19 },
    effect: { kind: 'epic-boon', boon: 'truesight' },
  },
};
