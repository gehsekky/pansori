// RE-2 — Superior Inspiration (SRD 5.2.1, Bard L18): when you roll Initiative,
// regain expended Bardic Inspiration until you have two (if you have fewer).
// `superiorInspirationTopUp` is applied to every PC in `runCombatStart` (the
// single initiative-roll path). Capped at the bard's normal max (CHA mod), as
// it only regains expended uses.

import { CORRIDOR_ID, makeChar, makeState, seedWithEnemy } from '../../src/test-fixtures.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { context as ctx } from '../../src/campaignData/sandbox.js';
import { superiorInspirationTopUp } from '../../src/services/multiclass.js';
import { takeAction } from '../../src/services/gameEngine.js';

afterEach(() => vi.restoreAllMocks());

const uses = (c: ReturnType<typeof makeChar>) => c.class_resource_uses?.bardic_inspiration;

describe('superiorInspirationTopUp', () => {
  const bard18 = (bi: number | undefined, cha = 20) =>
    makeChar({
      character_class: 'Bard',
      level: 18,
      cha,
      class_resource_uses: bi === undefined ? {} : { bardic_inspiration: bi },
    });

  it('tops a depleted bard up to 2', () => {
    expect(uses(superiorInspirationTopUp(bard18(0)))).toBe(2);
    expect(uses(superiorInspirationTopUp(bard18(1)))).toBe(2);
  });

  it('leaves a bard with 2+ uses unchanged', () => {
    expect(uses(superiorInspirationTopUp(bard18(3)))).toBe(3);
  });

  it('does not exceed the bard’s max when CHA is low (max 1 use)', () => {
    // CHA 12 → +1 mod → only 1 BI use max; "until you have two" caps at 1.
    expect(uses(superiorInspirationTopUp(bard18(0, 12)))).toBe(1);
  });

  it('is a no-op below L18 and for non-Bards', () => {
    expect(
      uses(
        superiorInspirationTopUp(
          makeChar({
            character_class: 'Bard',
            level: 17,
            cha: 20,
            class_resource_uses: { bardic_inspiration: 0 },
          })
        )
      )
    ).toBe(0);
    expect(
      uses(
        superiorInspirationTopUp(
          makeChar({
            character_class: 'Fighter',
            level: 20,
            class_resource_uses: { bardic_inspiration: 0 },
          })
        )
      )
    ).toBe(0);
  });
});

describe('Superior Inspiration — applied on rolling initiative (integration)', () => {
  it('a Bard L18 regains Bardic Inspiration to 2 when combat starts', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // deterministic init/surprise rolls
    const state = makeState(
      {
        character_class: 'Bard',
        level: 18,
        cha: 20,
        class_resource_uses: { bardic_inspiration: 0 },
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
    expect(result.newState.characters[0].class_resource_uses?.bardic_inspiration).toBe(2);
  });
});
