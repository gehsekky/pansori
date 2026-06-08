// SRD 5.2.1 Mounted Combat. Covers the full vertical slice:
//   - Phantom Steed casts a rideable mount onto summoned_allies, and combat
//     start auto-mounts the caster (rider/mount binding, shared square).
//   - mount / dismount handlers (half-Speed movement cost, reach + budget gates).
//   - mounted grid movement (mount carries the rider, mount's Speed is the budget).
//   - the DC 10 "falling off" save when a rider/mount is knocked prone.
//   - generateChoices surfaces Mount / Dismount.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { ctxWithRage, makeChar, makeState, spellSeed } from '../../../src/test-fixtures.js';
import {
  generateChoices,
  seedSummonedAllies,
  takeAction,
} from '../../../src/services/gameEngine.js';
import type { GameState } from '../../../src/types.js';
import { checkMountFallOff } from '../../../src/services/actions/mount.js';
import { context as ctx } from '../../../src/campaignData/sandbox.js';

afterEach(() => vi.restoreAllMocks());

const RIDER = 'rider-1';
const STEED = 'steed-1';

/** A combat state with a rider PC and one Phantom-Steed-like ally entity. */
function mountedCombat(opts: { mounted: boolean; steedPos?: { x: number; y: number } }): GameState {
  const rider = makeChar({ id: RIDER, character_class: 'Wizard', dex: 10, speed: 30 });
  const steedPos = opts.steedPos ?? { x: 2, y: 2 };
  return {
    ...makeState({ id: RIDER }, { current_room: 'entry_hall', combat_active: true }),
    characters: [rider],
    active_character_id: RIDER,
    initiative_order: [{ id: RIDER, roll: 15, is_enemy: false }],
    initiative_idx: 0,
    movement_used: {},
    entities: [
      {
        id: RIDER,
        isEnemy: false,
        side: 'pc',
        pos: { x: 2, y: 2 },
        hp: 12,
        maxHp: 12,
        conditions: [],
        condition_durations: {},
        ...(opts.mounted ? { mount_id: STEED } : {}),
      },
      {
        id: STEED,
        isEnemy: false,
        side: 'ally',
        companionName: 'Phantom Steed',
        pos: opts.mounted ? { x: 2, y: 2 } : steedPos,
        hp: 1,
        maxHp: 1,
        conditions: [],
        condition_durations: {},
        speed_ft: 100,
        noAttack: true,
        summoned_by: RIDER,
        ...(opts.mounted ? { rider_id: RIDER } : {}),
      },
    ],
  };
}

describe('Phantom Steed — spawn + auto-mount', () => {
  it('casting adds a rideable mount to summoned_allies', async () => {
    const wizard = makeChar({
      id: RIDER,
      character_class: 'Wizard',
      level: 5,
      spell_slots_max: { 3: 1 },
      spells_known: ['phantom_steed'],
      prepared_spells: ['phantom_steed'],
    });
    const state: GameState = {
      ...makeState({ id: RIDER }),
      characters: [wizard],
      active_character_id: RIDER,
      current_room: 'entry_hall',
      combat_active: false,
    };
    const result = await takeAction({
      action: { type: 'cast_spell', spellId: 'phantom_steed', slotLevel: 3 },
      history: [],
      state,
      seed: spellSeed,
      context: ctxWithRage,
    });
    const steeds = (result.newState.summoned_allies ?? []).filter((s) => s.isMount);
    expect(steeds).toHaveLength(1);
    expect(steeds[0].name).toBe('Phantom Steed');
    expect(steeds[0].speed).toBe(100);
    expect(result.narrative).toMatch(/bear its rider/i);
  });

  it('combat start binds the steed to its owner (auto-mount, shared square)', () => {
    const wizard = makeChar({ id: RIDER, character_class: 'Wizard' });
    const state: GameState = {
      ...makeState({ id: RIDER }, { combat_active: true }),
      characters: [wizard],
      initiative_order: [{ id: RIDER, roll: 12, is_enemy: false }],
      entities: [
        {
          id: RIDER,
          isEnemy: false,
          side: 'pc',
          pos: { x: 3, y: 4 },
          hp: 12,
          maxHp: 12,
          conditions: [],
          condition_durations: {},
        },
      ],
      summoned_allies: [
        {
          id: STEED,
          ownerId: RIDER,
          name: 'Phantom Steed',
          ac: 11,
          maxHp: 1,
          toHit: 0,
          damage: '0',
          noAttack: true,
          isMount: true,
          speed: 100,
        },
      ],
    };
    const next = seedSummonedAllies(state);
    const riderEnt = next.entities?.find((e) => e.id === RIDER);
    const steedEnt = next.entities?.find((e) => e.id === STEED);
    expect(riderEnt?.mount_id).toBe(STEED);
    expect(steedEnt?.rider_id).toBe(RIDER);
    expect(steedEnt?.speed_ft).toBe(100);
    expect(steedEnt?.pos).toEqual(riderEnt?.pos); // shares the rider's square
  });
});

describe('mount / dismount handlers', () => {
  it('mount binds the pair and spends half the rider’s Speed', async () => {
    const result = await takeAction({
      action: { type: 'mount', mountId: STEED },
      history: [],
      state: mountedCombat({ mounted: false, steedPos: { x: 2, y: 3 } }), // adjacent
      seed: spellSeed,
      context: ctx,
    });
    const riderEnt = result.newState.entities?.find((e) => e.id === RIDER);
    const steedEnt = result.newState.entities?.find((e) => e.id === STEED);
    expect(riderEnt?.mount_id).toBe(STEED);
    expect(steedEnt?.rider_id).toBe(RIDER);
    expect(steedEnt?.pos).toEqual({ x: 2, y: 2 }); // pulled onto the rider's square
    expect(result.newState.movement_used?.[RIDER]).toBe(15); // half of 30
  });

  it('rejects mounting a steed more than 5 ft away', async () => {
    const result = await takeAction({
      action: { type: 'mount', mountId: STEED },
      history: [],
      state: mountedCombat({ mounted: false, steedPos: { x: 6, y: 6 } }),
      seed: spellSeed,
      context: ctx,
    });
    expect(result.narrative).toMatch(/too far/i);
    expect(result.newState.entities?.find((e) => e.id === RIDER)?.mount_id).toBeUndefined();
  });

  it('dismount unbinds and the mount steps into an adjacent square', async () => {
    const result = await takeAction({
      action: { type: 'dismount' },
      history: [],
      state: mountedCombat({ mounted: true }),
      seed: spellSeed,
      context: ctx,
    });
    const riderEnt = result.newState.entities?.find((e) => e.id === RIDER);
    const steedEnt = result.newState.entities?.find((e) => e.id === STEED);
    expect(riderEnt?.mount_id).toBeUndefined();
    expect(steedEnt?.rider_id).toBeUndefined();
    expect(steedEnt?.pos).not.toEqual(riderEnt?.pos); // moved aside
    expect(result.newState.movement_used?.[RIDER]).toBe(15);
  });
});

describe('mounted movement', () => {
  it('carries the rider and uses the mount’s Speed as the budget', async () => {
    const state = mountedCombat({ mounted: true });
    // Co-locate both at (0,0) so a long straight move is unobstructed.
    state.entities = state.entities!.map((e) => ({ ...e, pos: { x: 0, y: 0 } }));
    const result = await takeAction({
      // 7 squares = 35 ft — over the rider's own 30 ft Speed, within the
      // mount's 100 ft (the 8×8 grid tops out at y=7).
      action: { type: 'grid_move', entityId: RIDER, to: { x: 0, y: 7 } },
      history: [],
      state,
      seed: spellSeed,
      context: ctx,
    });
    const riderEnt = result.newState.entities?.find((e) => e.id === RIDER);
    const steedEnt = result.newState.entities?.find((e) => e.id === STEED);
    expect(riderEnt?.pos).toEqual({ x: 0, y: 7 });
    expect(steedEnt?.pos).toEqual({ x: 0, y: 7 }); // mount moves with the rider
    expect(result.newState.movement_used?.[RIDER]).toBe(35);
    expect(result.narrative).toMatch(/rides/i);
  });
});

describe('falling off (DC 10 DEX save)', () => {
  it('a failed save dismounts the rider and knocks them prone', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // d20 → 1, +0 DEX → fails DC 10
    const { st, narrative } = checkMountFallOff(mountedCombat({ mounted: true }), STEED);
    const riderEnt = st.entities?.find((e) => e.id === RIDER);
    const steedEnt = st.entities?.find((e) => e.id === STEED);
    expect(riderEnt?.mount_id).toBeUndefined();
    expect(steedEnt?.rider_id).toBeUndefined();
    expect(riderEnt?.conditions).toContain('prone');
    expect(st.characters.find((c) => c.id === RIDER)?.conditions).toContain('prone');
    expect(narrative).toMatch(/falls from the saddle/i);
  });

  it('a successful save keeps the rider mounted', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // d20 → 20 → succeeds
    const { st, narrative } = checkMountFallOff(mountedCombat({ mounted: true }), RIDER);
    expect(st.entities?.find((e) => e.id === RIDER)?.mount_id).toBe(STEED);
    expect(narrative).toMatch(/keeps their seat/i);
  });

  it('is a no-op for an entity that is not part of a mounted pair', () => {
    const state = mountedCombat({ mounted: false, steedPos: { x: 8, y: 8 } });
    const { st, narrative } = checkMountFallOff(state, RIDER);
    expect(narrative).toBe('');
    expect(st).toBe(state);
  });
});

describe('generateChoices — mount surface', () => {
  it('offers Dismount while mounted', () => {
    const choices = generateChoices(mountedCombat({ mounted: true }), spellSeed, ctx);
    expect(choices.some((c) => c.action.type === 'dismount')).toBe(true);
  });

  it('offers Mount when an unridden steed is adjacent', () => {
    const choices = generateChoices(
      mountedCombat({ mounted: false, steedPos: { x: 2, y: 3 } }),
      spellSeed,
      ctx
    );
    const mountChoice = choices.find((c) => c.action.type === 'mount');
    expect(mountChoice).toBeDefined();
    expect((mountChoice?.action as { mountId: string }).mountId).toBe(STEED);
  });

  it('does not offer Mount when the steed is out of reach', () => {
    const choices = generateChoices(
      mountedCombat({ mounted: false, steedPos: { x: 8, y: 8 } }),
      spellSeed,
      ctx
    );
    expect(choices.some((c) => c.action.type === 'mount')).toBe(false);
  });
});
