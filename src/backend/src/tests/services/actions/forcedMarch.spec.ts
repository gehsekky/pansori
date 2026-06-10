// SRD 5.2.1 Extended Travel ("forced march"): overland hours beyond 8/day force
// a CON save (DC 10 + hours past 8) per character or a level of Exhaustion.

import type { CampaignData, Context, GameState, Seed } from '../../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ActionContext } from '../../../services/actions/types.js';
import { SRD_ITEMS } from '../../../campaignData/srd/items.js';
import { applyForcedMarch } from '../../../services/actions/markerMove.js';
import { handleMarkerMove } from '../../../services/actions/markerMove.js';
import { makeChar } from '../../../test-fixtures.js';
import { pcActor } from '../../../services/actions/actor.js';
import { resolveMarkerMove } from '../../../services/mapEngine.js';

afterEach(() => vi.restoreAllMocks());

// No class save proficiencies → a plain CON save (d20 + CON mod). con 10 = +0.
const ctx = { classSavingThrows: {} } as unknown as Context;
const stWith = (travel: number, ...chars: ReturnType<typeof makeChar>[]): GameState =>
  ({ travel_minutes_today: travel, characters: chars }) as unknown as GameState;

describe('applyForcedMarch — helper', () => {
  it('does nothing under the 8h/day budget', () => {
    const st = stWith(0, makeChar({ id: 'a', con: 10 }));
    const r = applyForcedMarch(st, 400, ctx); // 6h 40m total, < 8h
    expect(r.st.travel_minutes_today).toBe(400);
    expect(r.st.characters[0].exhaustion_level ?? 0).toBe(0);
    expect(r.note).toBe('');
  });

  it('a failed CON save past 8h adds a level of Exhaustion', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // d20 = 1 → fails DC 11
    const st = stWith(470, makeChar({ id: 'a', con: 10 })); // 470 + 70 = 540 → 1 hr past 8
    const r = applyForcedMarch(st, 70, ctx);
    expect(r.st.travel_minutes_today).toBe(540);
    expect(r.st.characters[0].exhaustion_level).toBe(1);
    expect(r.note).toContain('Exhaustion 1');
  });

  it('a made CON save past 8h leaves Exhaustion untouched', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // d20 = 20 → clears DC 11
    const st = stWith(470, makeChar({ id: 'a', con: 10 }));
    const r = applyForcedMarch(st, 70, ctx);
    expect(r.st.characters[0].exhaustion_level ?? 0).toBe(0);
    expect(r.note).toBe('');
  });

  it('rolls a save per past-8 hour with an escalating DC', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // every save fails
    const st = stWith(470, makeChar({ id: 'a', con: 10 })); // +190 → 660 → 3 hrs past 8
    const r = applyForcedMarch(st, 190, ctx);
    expect(r.st.characters[0].exhaustion_level).toBe(3); // DC 11, 12, 13 all failed
  });

  it("a Cloak of Protection's +1 save turns a failed forced-march save into a success", () => {
    // d20 = 10 (rnd 0.45 → floor(9)+1). At con 10 (+0), DC 11: a bare save is
    // 10 < 11 → fail; the cloak's all-saves +1 drops the effective DC to 10 → 10
    // ≥ 10 → made. Same roll, opposite outcome — proving the worn bonus applies.
    vi.spyOn(Math, 'random').mockReturnValue(0.45);
    const ctxCloak = {
      classSavingThrows: {},
      lootTable: [SRD_ITEMS.cloak_of_protection],
    } as unknown as Context;
    const cloaked = makeChar({
      id: 'cloaked',
      con: 10,
      inventory: [{ instance_id: 'c1', id: 'cloak_of_protection', name: 'Cloak of Protection' }],
      equipment: { cloak: 'c1' },
      attuned_items: ['c1'],
    });
    const bare = makeChar({ id: 'bare', con: 10 });
    const r = applyForcedMarch(stWith(470, cloaked, bare), 70, ctxCloak); // 1 hr past 8 → DC 11
    expect(r.st.characters[0].exhaustion_level ?? 0).toBe(0); // cloaked made the save
    expect(r.st.characters[1].exhaustion_level).toBe(1); // bare failed the same roll
  });

  it('skips dead characters', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const st = stWith(470, makeChar({ id: 'a', con: 10, dead: true }));
    const r = applyForcedMarch(st, 70, ctx);
    expect(r.st.characters[0].exhaustion_level ?? 0).toBe(0);
  });

  it('caps Exhaustion at 6 and kills on reaching it (SRD: level 6 = death)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // every save fails
    const st = stWith(
      470,
      makeChar({ id: 'a', con: 10 }), // 0 → would hit ~10 levels without a cap
      makeChar({ id: 'b', con: 10, exhaustion_level: 5 }) // 5 → dies on the first fail
    );
    const r = applyForcedMarch(st, 600, ctx); // +600m → ~10 hrs past 8
    // 'a' is capped at 6 and dead — never climbs to 7+.
    expect(r.st.characters[0].exhaustion_level).toBe(6);
    expect(r.st.characters[0].dead).toBe(true);
    // 'b' starts at 5 and dies the moment it reaches 6.
    expect(r.st.characters[1].exhaustion_level).toBe(6);
    expect(r.st.characters[1].dead).toBe(true);
    expect(r.note).toContain('dies of exhaustion');
  });
});

// ── Integration: the marker_move handler accrues travel + applies fatigue ──
const campaign: CampaignData = {
  world_name: 'March',
  intro: '',
  rooms: [],
  regions: [
    {
      id: 'reg1',
      name: 'Wilds',
      feetPerSquare: 5280, // 1 mile/square; SRD Normal pace 3 mph → 20 min/square
      gridWidth: 12,
      gridHeight: 12,
      startPos: { x: 0, y: 0 },
      sites: [],
      // No encounter zones → no encounter interruptions for this test.
    },
  ],
};

function ctxFor(travelMinutes: number): ActionContext {
  const char = makeChar({ id: 'pc-1', con: 10 });
  const st = {
    map_level: 'regional',
    current_region_id: 'reg1',
    marker_pos: { x: 0, y: 0 },
    characters: [char],
    combat_active: false,
    visited_rooms: [],
    travel_minutes_today: travelMinutes,
  } as unknown as GameState;
  const seed = { rooms: [], enemies: {} } as unknown as Seed;
  return {
    actor: pcActor(char, 0),
    st,
    seed,
    context: { campaign, enemyTemplates: [], narratives: {} } as unknown as Context,
    narrative: '',
  } as unknown as ActionContext;
}

describe('handleMarkerMove — forced-march wiring', () => {
  it('a regional move pushes past 8h and fatigues the party on a failed save', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // CON save fails
    // 540 min = 1h past the 8h budget already; the hour-per-click travel turn
    // adds 60 more (3 squares at Normal pace), completing a second past-8 hour.
    const ctxM = ctxFor(540);
    handleMarkerMove(ctxM, { type: 'marker_move', to: { x: 4, y: 0 } });
    expect(ctxM.st.travel_minutes_today).toBe(600); // 540 + the hour's 60
    expect(ctxM.st.characters[0].exhaustion_level).toBe(1);
    expect(ctxM.narrative).toContain('forced march');
  });

  it('halts the march on the square where a member collapses (short of the destination)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // every CON save fails
    const ctxM = ctxFor(540); // the next completed past-8 hour kills
    ctxM.st.characters[0].exhaustion_level = 5; // one failed save from death
    handleMarkerMove(ctxM, { type: 'marker_move', to: { x: 8, y: 0 } });
    expect(ctxM.st.characters[0].dead).toBe(true);
    expect(ctxM.st.characters[0].exhaustion_level).toBe(6);
    // Stopped where they fell — short of the destination (x=8).
    expect(ctxM.st.marker_pos!.x).toBeGreaterThan(0);
    expect(ctxM.st.marker_pos!.x).toBeLessThan(8);
    expect(ctxM.narrative).toContain('dies of exhaustion');
  });

  it('an encounter leaves the marker ON the encounter square, not the destination', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // < chance → ambush on the first square
    const allCells = Array.from({ length: 12 * 12 }, (_, i) => ({
      x: i % 12,
      y: Math.floor(i / 12),
    }));
    const campEnc: CampaignData = {
      ...campaign,
      regions: [
        {
          ...campaign.regions![0],
          encounterZones: [
            {
              id: 'wilds',
              tier: 1,
              encounterChance: 1,
              encounterTable: ['Goblin'],
              cells: allCells,
            },
          ],
        },
      ],
    };
    const st = {
      map_level: 'regional',
      current_region_id: 'reg1',
      marker_pos: { x: 0, y: 0 },
      characters: [makeChar({ id: 'a', con: 10 })],
      travel_minutes_today: 0,
    } as unknown as GameState;
    const r = resolveMarkerMove(campEnc, [], st, { x: 6, y: 0 });
    expect(r.encounter).toEqual([{ name: 'Goblin', count: 1 }]);
    expect(r.st.marker_pos).toEqual({ x: 1, y: 0 }); // stopped on the first crossed square
    expect(r.squaresMoved).toBe(1);
    expect(r.transitioned).toBe(false);
  });
});
