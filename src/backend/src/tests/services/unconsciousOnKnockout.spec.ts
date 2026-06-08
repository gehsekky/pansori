// Regression test for the Unconscious-on-knockout RAW behavior.
//
// **Pre-existing gap:** RAW SRD — a creature reduced to 0 HP
// without being killed outright becomes Unconscious. Pansori only
// applied this via the Sleep spell; downed PCs sat at 0 HP without
// the condition. Consequences pre-fix:
//   - Enemies didn't get advantage attacking the downed PC (the
//     condition's `grantsAdvantageToAttackers` flag never fired).
//   - STR/DEX saves on the downed PC didn't auto-fail (the
//     condition's `autoFailSaves` flag never fired).
//
// Fixed by inflicting Unconscious in `applyDamage` whenever the
// post-clamp HP hits 0 AND the character isn't dead. The earlier
// heal-from-0 sweep automatically clears Unconscious once hp > 0.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../../test-fixtures.js';
import { applyDamage } from '../../services/damage.js';

afterEach(() => vi.restoreAllMocks());

describe('applyDamage — Unconscious condition on knockout', () => {
  it('inflicts Unconscious when HP drops to 0 (PC is not yet dead)', () => {
    const pc = makeChar({ id: 'pc-1', hp: 5, max_hp: 20 });
    const state = makeState({ id: 'pc-1' });
    const result = applyDamage(pc, state, 5);
    expect(result.char.hp).toBe(0);
    expect(result.knockedOut).toBe(true);
    expect(result.char.conditions).toContain('unconscious');
  });

  it('does NOT inflict Unconscious on damage that does not knock out', () => {
    const pc = makeChar({ id: 'pc-1', hp: 20, max_hp: 20 });
    const state = makeState({ id: 'pc-1' });
    const result = applyDamage(pc, state, 5);
    expect(result.char.hp).toBe(15);
    expect(result.knockedOut).toBe(false);
    expect(result.char.conditions).not.toContain('unconscious');
  });

  it('overkill damage clamps to 0 → Unconscious still inflicted (not dead)', () => {
    const pc = makeChar({ id: 'pc-1', hp: 1, max_hp: 20 });
    const state = makeState({ id: 'pc-1' });
    // Massive overkill — but pansori doesn't model "massive damage
    // dead" here; the death check fires in caller logic. applyDamage
    // returns knockedOut=true.
    const result = applyDamage(pc, state, 100);
    expect(result.char.hp).toBe(0);
    expect(result.knockedOut).toBe(true);
    expect(result.char.conditions).toContain('unconscious');
  });

  it('does NOT re-add Unconscious if already present (idempotent)', () => {
    const pc = makeChar({
      id: 'pc-1',
      hp: 5,
      max_hp: 20,
      conditions: ['unconscious'],
    });
    const state = makeState({ id: 'pc-1' });
    const result = applyDamage(pc, state, 5);
    // Still exactly one entry.
    expect(result.char.conditions.filter((c) => c === 'unconscious')).toHaveLength(1);
  });

  it('mirrors Unconscious onto entity row for grid rendering', () => {
    const pc = makeChar({ id: 'pc-1', hp: 5, max_hp: 20 });
    const state = {
      ...makeState({ id: 'pc-1' }),
      entities: [
        {
          id: 'pc-1',
          isEnemy: false as const,
          pos: { x: 4, y: 5 },
          hp: 5,
          maxHp: 20,
          conditions: [],
          condition_durations: {},
        },
      ],
    };
    const result = applyDamage(pc, state, 5);
    const ent = result.st.entities?.find((e) => e.id === 'pc-1');
    expect(ent?.conditions).toContain('unconscious');
  });
});
