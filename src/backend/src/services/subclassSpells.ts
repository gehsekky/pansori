import type { Character } from '../types.js';
import { getClassLevel } from './multiclass.js';

// SRD 5.2.1 subclass spell lists: "when you reach a <Class> level specified in
// the table, you thereafter always have the listed spells prepared." Such
// spells never count against the number of spells a character can prepare or
// know.
//
// pansori casts from `spells_known`, so the granted ids are merged into it
// (`syncSubclassSpells`) and the ones it added are recorded in
// `subclass_granted_spells`; a later sync can then drop a grant that no longer
// applies (Circle of the Land after choosing a different land) without touching
// spells the character had on their own. The prepare gates and the known-spell
// count treat these ids as always prepared via `alwaysPreparedSpells`.

interface Tier {
  level: number;
  spells: string[];
}

interface SubclassList {
  cls: string;
  tiers: Tier[];
}

// SRD: Life Domain Spells / Oath of Devotion Spells / Fiend Spells / Draconic Spells
const SUBCLASS_SPELLS: Record<string, SubclassList> = {
  life: {
    cls: 'cleric',
    tiers: [
      { level: 3, spells: ['aid', 'bless', 'cure_wounds', 'lesser_restoration'] },
      { level: 5, spells: ['mass_healing_word', 'revivify'] },
      { level: 7, spells: ['aura_of_life', 'death_ward'] },
      { level: 9, spells: ['greater_restoration', 'mass_cure_wounds'] },
    ],
  },
  devotion: {
    cls: 'paladin',
    tiers: [
      { level: 3, spells: ['protection_from_evil_and_good', 'shield_of_faith'] },
      { level: 5, spells: ['aid', 'zone_of_truth'] },
      { level: 9, spells: ['beacon_of_hope', 'dispel_magic'] },
      { level: 13, spells: ['freedom_of_movement', 'guardian_of_faith'] },
      { level: 17, spells: ['commune', 'flame_strike'] },
    ],
  },
  fiend: {
    cls: 'warlock',
    tiers: [
      { level: 3, spells: ['burning_hands', 'command', 'scorching_ray', 'suggestion'] },
      { level: 5, spells: ['fireball', 'stinking_cloud'] },
      { level: 7, spells: ['fire_shield', 'wall_of_fire'] },
      { level: 9, spells: ['geas', 'insect_plague'] },
    ],
  },
  draconic: {
    cls: 'sorcerer',
    tiers: [
      { level: 3, spells: ['alter_self', 'chromatic_orb', 'command', 'dragons_breath'] },
      { level: 5, spells: ['fear', 'fly'] },
      { level: 7, spells: ['arcane_eye', 'charm_monster'] },
      { level: 9, spells: ['legend_lore', 'summon_dragon'] },
    ],
  },
};

// SRD: Circle of the Land Spells — one table per land type, chosen whenever
// the Druid finishes a Long Rest.
export const CIRCLE_LANDS = ['arid', 'polar', 'temperate', 'tropical'] as const;
export type CircleLand = (typeof CIRCLE_LANDS)[number];

const CIRCLE_LAND_SPELLS: Record<CircleLand, Tier[]> = {
  arid: [
    { level: 3, spells: ['blur', 'burning_hands', 'fire_bolt'] },
    { level: 5, spells: ['fireball'] },
    { level: 7, spells: ['blight'] },
    { level: 9, spells: ['wall_of_stone'] },
  ],
  polar: [
    { level: 3, spells: ['fog_cloud', 'hold_person', 'ray_of_frost'] },
    { level: 5, spells: ['sleet_storm'] },
    { level: 7, spells: ['ice_storm'] },
    { level: 9, spells: ['cone_of_cold'] },
  ],
  temperate: [
    { level: 3, spells: ['misty_step', 'shocking_grasp', 'sleep'] },
    { level: 5, spells: ['lightning_bolt'] },
    { level: 7, spells: ['freedom_of_movement'] },
    { level: 9, spells: ['tree_stride'] },
  ],
  tropical: [
    { level: 3, spells: ['acid_splash', 'ray_of_sickness', 'web'] },
    { level: 5, spells: ['stinking_cloud'] },
    { level: 7, spells: ['polymorph'] },
    { level: 9, spells: ['insect_plague'] },
  ],
};

const unlocked = (tiers: Tier[], level: number): string[] =>
  tiers.filter((t) => level >= t.level).flatMap((t) => t.spells);

/** The Circle spells a land grants at the given Druid level. */
export function circleLandSpells(land: CircleLand, druidLevel: number): string[] {
  return unlocked(CIRCLE_LAND_SPELLS[land], druidLevel);
}

/** True for a Circle of the Land Druid of level 3+, who picks a land each Long Rest. */
export function choosesCircleLand(char: Character): boolean {
  return char.subclass === 'land' && getClassLevel(char, 'druid') >= 3;
}

/**
 * The spells this character always has prepared from its subclass, at its
 * current level in the subclass's class. A Land Druid gets none until a land
 * is chosen.
 */
export function alwaysPreparedSpells(char: Character): string[] {
  const out = new Set<string>();
  const list = char.subclass ? SUBCLASS_SPELLS[char.subclass] : undefined;
  if (list) unlocked(list.tiers, getClassLevel(char, list.cls)).forEach((s) => out.add(s));
  if (choosesCircleLand(char) && char.circle_land) {
    circleLandSpells(char.circle_land, getClassLevel(char, 'druid')).forEach((s) => out.add(s));
  }
  // SRD Pact of the Tome — the Book of Shadows' spells are prepared.
  for (const s of [
    ...(char.book_of_shadows?.cantrips ?? []),
    ...(char.book_of_shadows?.rituals ?? []),
  ])
    out.add(s);
  return [...out];
}

/**
 * Bring `spells_known` in line with the subclass grants (mutates `char`).
 * Adds newly unlocked spells, drops earlier grants that no longer apply, and
 * never removes a spell the character knew independently. Idempotent.
 * Returns how many spells were added.
 */
export function syncSubclassSpells(char: Character): number {
  const want = new Set(alwaysPreparedSpells(char));
  const granted = new Set(char.subclass_granted_spells ?? []);
  const known = new Set(char.spells_known ?? []);
  for (const id of granted) {
    if (!want.has(id)) {
      known.delete(id);
      granted.delete(id);
    }
  }
  let added = 0;
  for (const id of want) {
    if (!known.has(id)) {
      known.add(id);
      granted.add(id);
      added++;
    }
  }
  char.spells_known = [...known];
  char.subclass_granted_spells = [...granted];
  return added;
}
