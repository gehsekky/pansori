// RE-2 — Uncanny Metabolism (SRD 5.2.1, Monk L2): when you roll Initiative,
// regain all expended Focus Points (ki) and heal Monk level + a Martial Arts
// die roll. Once per long rest. `uncannyMetabolismRefresh` (multiclass.ts) is
// applied to every PC in runCombatStart, beside Persistent Rage / Superior
// Inspiration. Only fires when there's something to regain.

import { CORRIDOR_ID, makeChar, makeState, mockRandom, seedWithEnemy } from '../test-fixtures.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { context as ctx } from '../campaignData/sandbox.js';
import { takeAction } from './gameEngine.js';
import { uncannyMetabolismRefresh } from './multiclass.js';

afterEach(() => vi.restoreAllMocks());

const cru = (c: ReturnType<typeof makeChar>) => c.class_resource_uses ?? {};

describe('uncannyMetabolismRefresh', () => {
  it('regains all ki and heals (Monk level + Martial Arts die) once', () => {
    mockRandom(0.99); // L5 Martial Arts die d8 → 8
    const monk = makeChar({
      character_class: 'Monk',
      level: 5,
      hp: 10,
      max_hp: 40,
      class_resource_uses: { ki_points: 0 },
    });
    const after = uncannyMetabolismRefresh(monk);
    expect(cru(after).ki_points).toBe(5); // back to max (monk level)
    expect(after.hp).toBe(23); // 10 + 5 level + 8 die
    expect(cru(after).uncanny_metabolism_used).toBe(1);
  });

  it('is a no-op when ki is full and HP is full', () => {
    const monk = makeChar({ character_class: 'Monk', level: 5, hp: 40, max_hp: 40 });
    expect(cru(uncannyMetabolismRefresh(monk)).uncanny_metabolism_used ?? 0).toBe(0);
  });

  it('is a no-op once already used this long rest', () => {
    const monk = makeChar({
      character_class: 'Monk',
      level: 5,
      hp: 10,
      max_hp: 40,
      class_resource_uses: { ki_points: 0, uncanny_metabolism_used: 1 },
    });
    expect(uncannyMetabolismRefresh(monk).hp).toBe(10); // unchanged
  });

  it('is a no-op below L2 and for non-Monks', () => {
    mockRandom(0.99);
    const m1 = makeChar({ character_class: 'Monk', level: 1, hp: 5, max_hp: 40 });
    expect(uncannyMetabolismRefresh(m1).hp).toBe(5);
    const fighter = makeChar({ character_class: 'Fighter', level: 20, hp: 5, max_hp: 40 });
    expect(uncannyMetabolismRefresh(fighter).hp).toBe(5);
  });
});

describe('Uncanny Metabolism — applied on rolling initiative (integration)', () => {
  it('a Monk L5 regains Focus Points and heals when combat starts', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = makeState(
      {
        character_class: 'Monk',
        level: 5,
        hp: 10,
        max_hp: 40,
        class_resource_uses: { ki_points: 0 },
      },
      { current_room: CORRIDOR_ID, visited_rooms: ['entry_hall', CORRIDOR_ID] }
    );
    const result = await takeAction({
      action: { type: 'attack' },
      history: [],
      state,
      seed: seedWithEnemy,
      context: ctx,
    });
    const monk = result.newState.characters[0];
    expect(monk.class_resource_uses?.ki_points).toBe(5);
    expect(monk.class_resource_uses?.uncanny_metabolism_used).toBe(1);
    expect(monk.hp).toBeGreaterThan(10); // healed
  });
});
