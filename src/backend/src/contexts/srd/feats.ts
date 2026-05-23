// SRD 5.2.1 feat catalog (Origin Feats only — the SRD's "General Feats"
// section contains only Ability Score Improvement + Grappler, neither
// of which fit pansori's choose-a-feat surface). Pansori is an
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
};
