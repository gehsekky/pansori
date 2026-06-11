// The two sovereign powers whose armies are about to clash over Silverford. The
// party's evidence (Act I) and choices (Acts II–IV) move rep with each; the
// diplomacy/war branch writes both. Tiers ascend hostile < unfriendly < neutral
// < friendly < exalted; shop modifiers tilt frontier prices by standing.

import type { Faction } from '../../types.js';

export const FACTIONS: Faction[] = [
  {
    id: 'malgovia',
    name: 'The Malgovian Imperium',
    description:
      'A militarized theocracy of zealous devotion and radical meritocracy — orc, ' +
      'dwarf, elf, and human serve shoulder to shoulder. Arcane magic is treated as a ' +
      'plague; only monitored clerical prayer is legal. Commander Vargis holds the ' +
      'frontier garrison at Silverford and wants to avoid a war he can feel coming.',
    thresholds: { hostile: -100, unfriendly: -40, neutral: 0, friendly: 40, exalted: 90 },
    shopPriceModifiers: {
      hostile: 1.5,
      unfriendly: 1.2,
      neutral: 1.0,
      friendly: 0.85,
      exalted: 0.7,
    },
  },
  {
    id: 'valerion',
    name: 'The Valerion Dynasty',
    description:
      'A ten-thousand-year human aristocracy obsessed with racial purity and ' +
      'tradition. Silver plate, faceless helms, arcane rangers. Commander Lucian ' +
      'Vane musters its vanguard at Miller’s Thicket — and despises Cassian for ' +
      'trading his noble blood for a Gavel signet.',
    thresholds: { hostile: -100, unfriendly: -40, neutral: 0, friendly: 40, exalted: 90 },
    shopPriceModifiers: {
      hostile: 1.5,
      unfriendly: 1.2,
      neutral: 1.0,
      friendly: 0.85,
      exalted: 0.7,
    },
  },
];
