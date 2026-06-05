// SRD 5.2.1 Extended Travel ("forced march"): overland hours beyond 8/day force
// a CON save (DC 10 + hours past 8) per character or a level of Exhaustion.

import type { CampaignData, Context, GameState, Seed } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ActionContext } from './types.js';
import { applyForcedMarch } from './markerMove.js';
import { handleMarkerMove } from './markerMove.js';
import { makeChar } from '../../test-fixtures.js';
import { pcActor } from './actor.js';
import { resolveMarkerMove } from '../mapEngine.js';

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
      encounterTable: [],
      encounterChance: 0, // no encounter interruptions for this test
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
    const ctxM = ctxFor(470); // 470 min already; a 4-mile (80 min) move crosses 8h
    handleMarkerMove(ctxM, { type: 'marker_move', to: { x: 4, y: 0 } });
    expect(ctxM.st.travel_minutes_today).toBe(550); // 470 + 80
    expect(ctxM.st.characters[0].exhaustion_level).toBe(1);
    expect(ctxM.narrative).toContain('forced march');
  });

  it('halts the march on the square where a member collapses (short of the destination)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // every CON save fails
    const ctxM = ctxFor(470);
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
    const campEnc: CampaignData = {
      ...campaign,
      regions: [{ ...campaign.regions![0], encounterChance: 1, encounterTable: ['Goblin'] }],
    };
    const st = {
      map_level: 'regional',
      current_region_id: 'reg1',
      marker_pos: { x: 0, y: 0 },
      characters: [makeChar({ id: 'a', con: 10 })],
      travel_minutes_today: 0,
    } as unknown as GameState;
    const r = resolveMarkerMove(campEnc, [], st, { x: 6, y: 0 });
    expect(r.encounter).toBe('Goblin');
    expect(r.st.marker_pos).toEqual({ x: 1, y: 0 }); // stopped on the first crossed square
    expect(r.squaresMoved).toBe(1);
    expect(r.transitioned).toBe(false);
  });
});
