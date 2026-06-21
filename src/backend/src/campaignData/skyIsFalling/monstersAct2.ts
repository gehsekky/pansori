// Act II bestiary — the Weaver cult and its subverted soldiery in the Valerion
// heartland.
//
// STRICT-SRD RESKIN RULE (CLAUDE.md): the fiction is sci-fi cult-horror; the
// mechanics are 100% SRD 5.2.1. Every creature here is a campaign-level CLONE of
// an SRD stat block — `{ ...SRD_MONSTERS.<base>, name, desc }` — never a bestiary
// rename and never a stat tune. Act II clones take the FULL SRD-default numbers
// (D-10/D-11): an L5 party is built to handle CR-appropriate SRD enemies, and
// the un-tuned numbers stay verifiable against docs/srd-5.2.1.txt. Only `name`
// and `desc` are overridden; the math is the SRD base's.
//
// Note: the Act I `Subverted Trooper` (monsters.ts, a warrior_veteran tuned to
// ac15/hp52 for an L3 fight) is LEFT UNTOUCHED — Act II ships fresh, uniquely
// named entries from both the Veteran AND Guard bases (D-10), so the composed
// bestiary stays unambiguous (rooms resolve enemies by their flavor `name`).

import type { EnemyTemplate } from '../../types.js';
import { SRD_MONSTERS } from '../srd/monsters.js';

export const MONSTERS_ACT2: EnemyTemplate[] = [
  // The Weaver cell's initiates — fanatics who "thread" prayers to the silent
  // relic, sci-fi cultists wearing a holy-order mask. // SRD: Cultist Fanatic
  {
    ...SRD_MONSTERS.cult_fanatic,
    name: 'Weaver Adept',
    desc:
      'A hooded initiate of the Weaver cult, murmuring threaded litanies to the ' +
      'star-metal relic. Beneath the devout mask, the same predatory will that ' +
      'wiped a village clean.',
  },
  // The cell's spell-slinging leadership — a "magus" who reads the relic's cold
  // mathematics as scripture. // SRD: Mage
  {
    ...SRD_MONSTERS.mage,
    name: 'Weaver Magus',
    desc:
      'A senior Weaver who has learned to speak the relic’s humming dialect, ' +
      'bending it into hurled force and warding veils. The cult’s sharpest ' +
      'and most dangerous mind in the undercroft.',
  },
  // The subverted heartland garrison — line soldiers turned, taken from the SRD
  // Veteran block (the heavy variant). // SRD: Warrior Veteran
  {
    ...SRD_MONSTERS.warrior_veteran,
    name: 'Subverted Vanguard',
    desc:
      'A heartland garrison veteran with the relic’s patient hum behind the ' +
      'eyes. Drilled discipline now turned to the Weavers’ quiet purpose, ' +
      'blade and crossbow at the cult’s command.',
  },
  // The lighter subverted sentries posted at the cult's thresholds, taken from
  // the SRD Guard block. // SRD: Guard
  {
    ...SRD_MONSTERS.guard,
    name: 'Subverted Sentry',
    desc:
      'A turned watch-sentry standing the Weaver cell’s thresholds, spear ' +
      'level and gaze gone glassy. Loyal now only to the listening relic below ' +
      'the library.',
  },
];
