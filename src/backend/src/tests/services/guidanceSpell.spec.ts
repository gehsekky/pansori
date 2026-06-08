// SRD Guidance (cantrip): touch a willing creature; until the spell ends it
// adds 1d4 to one ability check. Mechanized as a one-shot `guidance_die` flag
// set on cast (concentration), consumed at the next skillCheck via
// `consumeGuidanceDie` and folded in with `applyGuidanceDie`. Simplification:
// the +1d4 applies to the target's next ability check of any kind (pansori's
// checks don't carry a per-check skill tag).

import type { Character, GameState, Seed } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyGuidanceDie, consumeGuidanceDie } from '../../services/actions/actor.js';
import { breakConcentration, takeAction } from '../../services/gameEngine.js';
import { makeChar, makeState } from '../../test-fixtures.js';
import type { Actor } from '../../services/actions/actor.js';
import { context as ctx } from '../fixtures/testContext.js';

afterEach(() => vi.restoreAllMocks());

const seed: Seed = {
  context_id: ctx.id,
  world_name: 'Guidance Test',
  ship_name: 'Guidance Test',
  intro: '',
  seed_id: 'guidance',
  rooms: [{ id: 'entry_hall', name: 'Start', desc: '' }],
  enemies: {},
  loot: {},
  npcs: {},
};

function casterState(): GameState {
  const char = makeChar({
    id: 'pc-1',
    character_class: 'Cleric',
    level: 5,
    wis: 16,
    spells_known: ['guidance'],
    prepared_spells: ['guidance'],
  });
  return {
    ...makeState({ id: 'pc-1' }, { current_room: 'entry_hall' }),
    characters: [char],
    active_character_id: 'pc-1',
  } as unknown as GameState;
}

const pcCtx = (char: Character): { actor: Actor } => ({
  actor: { kind: 'pc', char, safeIdx: 0 },
});

describe('Guidance — one-shot +1d4 ability-check rider', () => {
  it('casting it arms guidance_die on the target (concentration)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const r = await takeAction({
      action: { type: 'cast_spell', spellId: 'guidance', slotLevel: 0, targetCharId: 'pc-1' },
      history: [],
      state: casterState(),
      seed,
      context: ctx,
    });
    const c = r.newState.characters[0];
    expect(c.guidance_die).toBe(true);
    expect(c.concentrating_on?.spellId).toBe('guidance');
  });

  it('consumeGuidanceDie rolls 1d4 and clears the flag when armed', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // d4 → floor(0.5*4)+1 = 3
    const ctxA = pcCtx(makeChar({ id: 'pc-1', guidance_die: true }));
    const die = consumeGuidanceDie(ctxA);
    expect(die).toBe(3);
    expect((ctxA.actor as { char: Character }).char.guidance_die).toBe(false);
  });

  it('consumeGuidanceDie is a no-op (returns 0) when not armed', () => {
    const ctxA = pcCtx(makeChar({ id: 'pc-1' }));
    expect(consumeGuidanceDie(ctxA)).toBe(0);
  });

  it('applyGuidanceDie adds the die to the total and re-checks success vs DC', () => {
    // A check that failed by 2 is rescued by a 3.
    const failed = { roll: 8, total: 12, success: false };
    const rescued = applyGuidanceDie(failed, 3, 14);
    expect(rescued.total).toBe(15);
    expect(rescued.success).toBe(true);
    // Zero die is a no-op (identity).
    expect(applyGuidanceDie(failed, 0, 14)).toBe(failed);
  });

  it('losing concentration drops an unused guidance die', () => {
    const armed = makeChar({
      id: 'pc-1',
      guidance_die: true,
      concentrating_on: { spellId: 'guidance', rounds_left: 10 },
    });
    const st = {
      ...makeState({ id: 'pc-1' }),
      characters: [armed],
    } as unknown as GameState;
    const { char } = breakConcentration(armed, st, ctx);
    expect(char.guidance_die).toBe(false);
    expect(char.concentrating_on).toBeNull();
  });
});
