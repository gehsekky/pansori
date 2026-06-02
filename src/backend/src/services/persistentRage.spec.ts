// RE-2 — Persistent Rage (SRD 5.2.1, Barbarian L15): when you roll Initiative,
// regain all expended uses of Rage (once per long rest). `persistentRageTopUp`
// (multiclass.ts) is applied to every PC in runCombatStart. (The "Rage lasts 10
// minutes" clause is already pansori's behavior — Rage persists for the
// encounter and only clears at combat end.) rageUsesMax(L15) = 5.

import { CORRIDOR_ID, makeChar, makeState, seedWithEnemy } from '../test-fixtures.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { context as ctx } from '../contexts/sandbox.js';
import { persistentRageTopUp } from './multiclass.js';
import { takeAction } from './gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const cru = (c: ReturnType<typeof makeChar>) => c.class_resource_uses ?? {};

describe('persistentRageTopUp', () => {
  const barb = (over: Record<string, number>) =>
    makeChar({ character_class: 'Barbarian', level: 15, class_resource_uses: over });

  it('refreshes expended Rage uses to max and marks the once-per-rest flag', () => {
    const after = persistentRageTopUp(barb({ rage_uses: 1 }));
    expect(cru(after).rage_uses).toBe(5); // rageUsesMax(L15)
    expect(cru(after).persistent_rage_used).toBe(1);
  });

  it('is a no-op once already used this long rest', () => {
    const after = persistentRageTopUp(barb({ rage_uses: 1, persistent_rage_used: 1 }));
    expect(cru(after).rage_uses).toBe(1); // unchanged
  });

  it('is a no-op when no Rage uses are expended', () => {
    const after = persistentRageTopUp(barb({ rage_uses: 5 }));
    expect(cru(after).persistent_rage_used ?? 0).toBe(0);
  });

  it('is a no-op below L15 and for non-Barbarians', () => {
    expect(
      cru(
        persistentRageTopUp(
          makeChar({
            character_class: 'Barbarian',
            level: 14,
            class_resource_uses: { rage_uses: 1 },
          })
        )
      ).rage_uses
    ).toBe(1);
    expect(
      cru(
        persistentRageTopUp(
          makeChar({ character_class: 'Wizard', level: 20, class_resource_uses: { rage_uses: 1 } })
        )
      ).rage_uses
    ).toBe(1);
  });
});

describe('Persistent Rage — applied on rolling initiative (integration)', () => {
  it('a Barbarian L15 regains expended Rage uses when combat starts', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = makeState(
      { character_class: 'Barbarian', level: 15, class_resource_uses: { rage_uses: 1 } },
      { current_room: CORRIDOR_ID, visited_rooms: ['entry_hall', CORRIDOR_ID] }
    );
    const result = await takeAction({
      action: { type: 'attack' },
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });
    expect(result.newState.characters[0].class_resource_uses?.rage_uses).toBe(5);
    expect(result.newState.characters[0].class_resource_uses?.persistent_rage_used).toBe(1);
  });
});
