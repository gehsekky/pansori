// Act I bestiary — the living Sunder-Carr marsh + the first hint of the enemy.
//
// STRICT-SRD RESKIN RULE (CLAUDE.md): the fiction is a sci-fi horror; the
// mechanics are 100% SRD 5.2.1. Every creature here is a campaign-level CLONE of
// an SRD stat block — `{ ...SRD_MONSTERS.<base>, name: '<flavor>' }` — never a
// bestiary rename. Only `name` (and, where the fiction demands a mechanical
// tweak, explicit fields) is overridden; the math is the SRD base's.
//
// Rooms reference these by their flavor `name` against the composed bestiary
// (DB customs → code campaign → full SRD catalog), so the names must be unique.

import type { EnemyTemplate } from '../../types.js';
import { SRD_MONSTERS } from '../srd/monsters.js';

export const MONSTERS: EnemyTemplate[] = [
  // The marsh predators.
  { ...SRD_MONSTERS.crocodile, name: 'Bog Lurker' }, // CR 1/2 ambush reptile in the peat channels
  // CR 2 grapple hazard — HP trimmed from the SRD 60 so the Act-I causeway
  // ambush isn't a slog for an L3 party (a campaign-clone balance tune).
  { ...SRD_MONSTERS.giant_constrictor_snake, name: 'Mire Constrictor', hp: 45 },
  { ...SRD_MONSTERS.swarm_of_insects, name: 'Carrion Swarm' }, // atmosphere + attrition on the clock
  // The desecrated tomb-mound's risen dead.
  { ...SRD_MONSTERS.ghoul, name: 'Peat Ghoul' }, // CR 1 corpse-rot around the ash-pit
  // The first sci-fi tell: a "marsh light" that is really a floating sensor drone.
  { ...SRD_MONSTERS.will_o_wisp, name: 'Recon Orb' }, // CR 2 invisible shock-damage sensor
  // The human soldiery — the horror Julian's forensics will expose.
  // CR 3 turned imperial soldier. AC dropped 17→15 and HP 65→52 so the L3 party
  // lands hits and the fight doesn't grind (a campaign-clone Act-I balance tune;
  // a tougher variant can return in Acts II–III).
  { ...SRD_MONSTERS.warrior_veteran, name: 'Subverted Trooper', ac: 15, hp: 52 },
  { ...SRD_MONSTERS.knight, name: 'Valerion Vanguard' }, // CR 3 Lucian Vane's men (usually avoidable)
];
