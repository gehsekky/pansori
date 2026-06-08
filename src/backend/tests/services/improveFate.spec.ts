// SRD Boon of Fate (epic boon, L19+) — Improve Fate. The auto-resolve helpers
// mirror Dark One's Own Luck: spend the once-per-rest use only when the 2d4
// rescues a failed saving throw, and recharge on Initiative / Short / Long Rest.

import {
  consumeImproveFate,
  improveFateAvailable,
  improveFateRefresh,
  tryImproveFate,
} from '../../src/services/improveFate.js';
import { describe, expect, it } from 'vitest';
import { makeChar } from '../../src/test-fixtures.js';

const fated = (extra = {}) => makeChar({ id: 'pc-1', feats: ['boon_fate'], ...extra });

describe('improveFateAvailable', () => {
  it('needs the boon and an unspent use', () => {
    expect(improveFateAvailable(fated())).toBe(true);
    expect(improveFateAvailable(fated({ class_resource_uses: { improve_fate_used: 1 } }))).toBe(
      false
    );
    expect(improveFateAvailable(makeChar({ id: 'pc-2' }))).toBe(false);
  });
});

describe('consumeImproveFate', () => {
  it('marks the use spent', () => {
    expect(consumeImproveFate(fated()).class_resource_uses?.improve_fate_used).toBe(1);
  });
});

describe('improveFateRefresh', () => {
  it('clears the spent flag for a boon holder, no-op otherwise', () => {
    const spent = fated({ class_resource_uses: { improve_fate_used: 1 } });
    expect(improveFateRefresh(spent).class_resource_uses?.improve_fate_used).toBeUndefined();
    // Without the boon the flag is left untouched.
    const noBoon = makeChar({ id: 'pc-2', class_resource_uses: { improve_fate_used: 1 } });
    expect(improveFateRefresh(noBoon).class_resource_uses?.improve_fate_used).toBe(1);
  });
});

describe('tryImproveFate', () => {
  it('spends the use only when the 2d4 rescues the roll', () => {
    expect(tryImproveFate(fated(), () => true)).toEqual({ saved: true, used: true });
    expect(tryImproveFate(fated(), () => false)).toEqual({ saved: false, used: false });
    // Already spent → never fires.
    const spent = fated({ class_resource_uses: { improve_fate_used: 1 } });
    expect(tryImproveFate(spent, () => true)).toEqual({ saved: false, used: false });
  });
});
