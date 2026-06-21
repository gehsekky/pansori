// Act II bestiary — the Weaver cult and its subverted soldiery in the Valerion
// heartland.
//
// STRICT-SRD RESKIN RULE (CLAUDE.md): the fiction is sci-fi cult-horror; the
// mechanics are 100% SRD 5.2.1. Every creature here is a campaign-level CLONE of
// an SRD stat block — `{ ...SRD_MONSTERS.<base>, name }` — never a bestiary
// rename and never a stat tune. Act II clones take the FULL SRD-default numbers
// (D-10/D-11): an L5 party is built to handle CR-appropriate SRD enemies, and
// the un-tuned numbers stay verifiable against docs/srd-5.2.1.txt. Only `name`
// is overridden; the math is the SRD base's.
//
// `EnemyTemplate` carries no description field — flavor lives in room/region
// prose and these per-entry comments, exactly as Act I's monsters.ts does. So
// the only data override here is `name`; the sci-fi fiction is captured in the
// comments below.
//
// Note: the Act I `Subverted Trooper` (monsters.ts, a warrior_veteran tuned to
// ac15/hp52 for an L3 fight) is LEFT UNTOUCHED — Act II ships fresh, uniquely
// named entries from both the Veteran AND Guard bases (D-10), so the composed
// bestiary stays unambiguous (rooms resolve enemies by their flavor `name`).

import type { EnemyTemplate } from '../../types.js';
import { SRD_MONSTERS } from '../srd/monsters.js';

export const MONSTERS_ACT2: EnemyTemplate[] = [
  // Weaver Adept — a hooded Weaver-cult initiate murmuring threaded litanies to
  // the star-metal relic; beneath the devout mask, the same predatory will that
  // wiped a village clean. // SRD: Cultist Fanatic
  { ...SRD_MONSTERS.cult_fanatic, name: 'Weaver Adept' },
  // Weaver Magus — a senior Weaver who reads the relic's cold mathematics as
  // scripture, bending its hum into hurled force and warding veils; the cult's
  // sharpest mind in the undercroft. // SRD: Mage
  { ...SRD_MONSTERS.mage, name: 'Weaver Magus' },
  // Subverted Vanguard — a heartland garrison veteran with the relic's patient
  // hum behind the eyes, drilled discipline now turned to the Weavers' quiet
  // purpose. The heavy subverted-soldier variant. // SRD: Warrior Veteran
  { ...SRD_MONSTERS.warrior_veteran, name: 'Subverted Vanguard' },
  // Subverted Sentry — a turned watch-sentry standing the cell's thresholds,
  // spear level and gaze gone glassy, loyal now only to the listening relic
  // below the library. The lighter subverted-soldier variant. // SRD: Guard
  { ...SRD_MONSTERS.guard, name: 'Subverted Sentry' },
];
