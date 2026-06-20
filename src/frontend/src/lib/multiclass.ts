import type { Character } from '../types';

// FE-side SRD multiclass prerequisites + `levelUpAvailable` (used by
// PartyRail to badge a member who can level). The leveling pane itself surfaces
// the class-pick choices from the backend, so the FE no longer gates classes.
// Mirrors `MULTICLASS_PREREQS` + `canMulticlassInto` in
// src/backend/src/services/multiclass.ts. The BE is still authoritative —
// the action handler re-validates; this exists so the UI can render the
// requirement up front instead of dispatching and surfacing a rejection.

type AbilityKey = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';

type AbilityRequirement =
  | { kind: 'and'; abilities: Array<[AbilityKey, number]> }
  | { kind: 'or'; abilities: Array<[AbilityKey, number]> };

export const MULTICLASS_PREREQS: Record<string, AbilityRequirement> = {
  barbarian: { kind: 'and', abilities: [['str', 13]] },
  bard: { kind: 'and', abilities: [['cha', 13]] },
  cleric: { kind: 'and', abilities: [['wis', 13]] },
  druid: { kind: 'and', abilities: [['wis', 13]] },
  fighter: {
    kind: 'or',
    abilities: [
      ['str', 13],
      ['dex', 13],
    ],
  },
  monk: {
    kind: 'and',
    abilities: [
      ['dex', 13],
      ['wis', 13],
    ],
  },
  paladin: {
    kind: 'and',
    abilities: [
      ['str', 13],
      ['cha', 13],
    ],
  },
  ranger: {
    kind: 'and',
    abilities: [
      ['dex', 13],
      ['wis', 13],
    ],
  },
  rogue: { kind: 'and', abilities: [['dex', 13]] },
  sorcerer: { kind: 'and', abilities: [['cha', 13]] },
  warlock: { kind: 'and', abilities: [['cha', 13]] },
  wizard: { kind: 'and', abilities: [['int', 13]] },
};

export const CLASS_NAMES = Object.keys(MULTICLASS_PREREQS);

export function formatPrereq(req: AbilityRequirement): string {
  const parts = req.abilities.map(([ab, min]) => `${ab.toUpperCase()} ${min}`);
  return req.kind === 'or' ? parts.join(' or ') : parts.join(' + ');
}

export function canMulticlassInto(char: Character, targetClass: string): string {
  const cls = targetClass.toLowerCase();
  if (cls === char.character_class.toLowerCase()) return '';
  const req = MULTICLASS_PREREQS[cls];
  if (!req) return `${targetClass} is not a known class.`;
  const scoreOf = (ab: AbilityKey): number => (char[ab] ?? 10) as number;
  if (req.kind === 'and') {
    for (const [ab, min] of req.abilities) {
      if (scoreOf(ab) < min) {
        return `Requires ${ab.toUpperCase()} ${min} (you have ${scoreOf(ab)}).`;
      }
    }
    return '';
  }
  const passes = req.abilities.some(([ab, min]) => scoreOf(ab) >= min);
  if (passes) return '';
  return `Requires ${formatPrereq(req)}.`;
}

// Total XP required to BE at each level (SRD 5.2.1 Character Advancement).
// Mirrors XP_FOR_LEVEL in the backend gameEngine — kept in sync by hand since
// the FE can't import backend modules. A character at level L advances when
// total XP reaches the entry for L+1.
const XP_FOR_LEVEL: readonly number[] = [
  0, 0, 300, 900, 2_700, 6_500, 14_000, 23_000, 34_000, 48_000, 64_000, 85_000, 100_000, 120_000,
  140_000, 165_000, 195_000, 225_000, 265_000, 305_000, 355_000,
];

function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  return XP_FOR_LEVEL[Math.min(20, level)] ?? XP_FOR_LEVEL[20];
}

// True when a member has ANY level-up work the player can resolve out of
// combat — mirroring the backend `levelUpWorkFor` non-null states so the +LVL
// badge fires for "finish leveling" (a pending ASI / weapon-mastery / spell
// pick from a prior advance) as well as a fresh XP-threshold advance. The
// in-combat, dead, and level-20 guards are preserved (leveling never surfaces
// in combat — UI-SPEC / D-05).
export function levelUpAvailable(char: Character, inCombat: boolean): boolean {
  if (char.dead) return false;
  if (inCombat) return false;
  if ((char.level ?? 1) >= 20) return false;
  // Pending picks from a prior advance still owe work (backend levelUpWorkFor
  // resolves these before advancing again).
  if (char.asi_pending) return true;
  if ((char.weapon_mastery_pending ?? 0) > 0) return true;
  if ((char.spells_to_learn ?? 0) > 0) return true;
  // Otherwise, eligible when the XP threshold for the next level is met.
  return (char.xp ?? 0) >= xpForLevel((char.level ?? 1) + 1);
}
