// Wizard Arcane Recovery (L1) + Land Druid Natural Recovery — interactive slot
// choice. Both let the caster recover expended spell slots totaling up to a
// budget of ⌈level / 2⌉ combined slot-levels, once per long rest (Arcane
// Recovery additionally bars slots above 5th). RAW the caster *chooses* which
// slots; the engine used to auto-pick lowest-first on a short rest. This module
// enumerates a small set of sensible recovery plans so the player can pick via
// the generic option picker.

import { getClassLevel, hasClass } from './multiclass.js';
import type { Character } from '../types.js';

export type RecoveryFeature = 'arcane' | 'natural';

export interface RecoverySpec {
  feature: RecoveryFeature;
  budget: number; // combined slot-levels recoverable
  maxLevel: number; // highest slot level allowed (Arcane Recovery: 5)
}

export interface RecoveryPlan {
  id: string; // stable key from the recovered levels, e.g. "1,1,2"
  levels: number[]; // the multiset of slot levels to restore (ascending)
}

export const RECOVERY_USED_FLAG: Record<RecoveryFeature, string> = {
  arcane: 'arcane_recovery_used',
  natural: 'natural_recovery_used',
};

const featureLabel: Record<RecoveryFeature, string> = {
  arcane: 'Arcane Recovery',
  natural: 'Natural Recovery',
};

/** The slot-recovery features the character can use right now (once / long rest). */
export function availableRecoveries(char: Character): RecoverySpec[] {
  const uses = char.class_resource_uses ?? {};
  const out: RecoverySpec[] = [];
  if (hasClass(char, 'wizard') && !uses[RECOVERY_USED_FLAG.arcane]) {
    out.push({
      feature: 'arcane',
      budget: Math.ceil(getClassLevel(char, 'wizard') / 2),
      maxLevel: 5,
    });
  }
  if (hasClass(char, 'druid') && char.subclass === 'land' && !uses[RECOVERY_USED_FLAG.natural]) {
    out.push({
      feature: 'natural',
      budget: Math.ceil(getClassLevel(char, 'druid') / 2),
      maxLevel: 9,
    });
  }
  return out;
}

function slotsUsedAt(char: Character, level: number): number {
  return (char.spell_slots_used ?? {})[level] ?? 0;
}

/** Slot levels (≤ maxLevel) that currently have at least one expended slot. */
function expendedLevels(char: Character, maxLevel: number): number[] {
  const max = char.spell_slots_max ?? {};
  return Object.keys(max)
    .map(Number)
    .filter((l) => l >= 1 && l <= maxLevel && slotsUsedAt(char, l) > 0)
    .sort((a, b) => a - b);
}

// Greedy fill: recover slots in `order`, taking as many of each as the expended
// count + remaining budget allow. Used for the lowest-first / highest-first plans.
function greedyPlan(char: Character, budget: number, order: number[]): number[] {
  let remaining = budget;
  const levels: number[] = [];
  for (const lvl of order) {
    let avail = slotsUsedAt(char, lvl);
    while (avail > 0 && remaining >= lvl) {
      levels.push(lvl);
      remaining -= lvl;
      avail -= 1;
    }
  }
  return levels.sort((a, b) => a - b);
}

const planId = (levels: number[]): string => [...levels].sort((a, b) => a - b).join(',');

/**
 * A small, bounded set of distinct recovery plans the player can choose from:
 * lowest-first (max count — the historical auto-pick, offered first as the
 * default), highest-first (biggest slots), and "a single Nth-level slot" for
 * each expended level. Deduped by allocation; capped.
 */
export function enumerateRecoveryPlans(char: Character, spec: RecoverySpec): RecoveryPlan[] {
  const expended = expendedLevels(char, spec.maxLevel);
  if (expended.length === 0 || spec.budget < expended[0]) return [];

  const seen = new Set<string>();
  const plans: RecoveryPlan[] = [];
  const add = (levels: number[]) => {
    if (levels.length === 0) return;
    const id = planId(levels);
    if (seen.has(id)) return;
    seen.add(id);
    plans.push({ id, levels });
  };

  // 1) lowest-first (default — maximizes the slot count recovered).
  add(greedyPlan(char, spec.budget, [...expended]));
  // 2) highest-first (favors the biggest slots).
  add(greedyPlan(char, spec.budget, [...expended].reverse()));
  // 3) a single slot of each expended level (a focused, partial recovery).
  for (const lvl of [...expended].reverse()) {
    if (spec.budget >= lvl) add([lvl]);
  }
  return plans.slice(0, 6);
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

/** Human label for a plan, e.g. "2×1st, 1×2nd". */
export function planLabel(levels: number[]): string {
  const counts = new Map<number, number>();
  for (const l of levels) counts.set(l, (counts.get(l) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([lvl, n]) => `${n}×${ordinal(lvl)}`)
    .join(', ');
}

export const planTotal = (levels: number[]): number => levels.reduce((s, l) => s + l, 0);

/** Apply a recovery plan: restore the slots + stamp the once-per-long-rest flag. */
export function applyRecoveryPlan(
  char: Character,
  feature: RecoveryFeature,
  levels: number[]
): Character {
  const used = { ...(char.spell_slots_used ?? {}) };
  for (const lvl of levels) {
    used[lvl] = Math.max(0, (used[lvl] ?? 0) - 1);
  }
  return {
    ...char,
    spell_slots_used: used,
    class_resource_uses: {
      ...(char.class_resource_uses ?? {}),
      [RECOVERY_USED_FLAG[feature]]: 1,
    },
  };
}

export { featureLabel };
