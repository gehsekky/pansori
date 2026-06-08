// Regression guard for the Malgovia creature roster: the assembled
// enemyTemplates + per-room enemy placements, captured as a canonical
// (key-sorted) snapshot. Originally written to prove the stat-block de-dup
// changed no data, it stays as the only coverage for the grove/pines placements
// (which have no playthrough test) — any accidental stat drift fails here.
//
// sortDeep sorts object keys so a `place(BASE, { id, ... })` spread (which
// changes key order, not data) doesn't churn it; array order is preserved (it
// should be). When you intentionally edit a creature, bless it with `vitest -u`.

import { describe, expect, it } from 'vitest';
import { context } from '../../../campaignData/malgovia/index.js';

function sortDeep(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.keys(v as Record<string, unknown>)
        .sort()
        .map((k) => [k, sortDeep((v as Record<string, unknown>)[k])])
    );
  }
  return v;
}

describe('Malgovia entities — de-dup behavior guard', () => {
  it('enemyTemplates catalog is unchanged', () => {
    expect(sortDeep(context.enemyTemplates)).toMatchSnapshot();
  });

  it('per-room enemy placements are unchanged', () => {
    expect(sortDeep(context.campaign?.enemies)).toMatchSnapshot();
  });
});
