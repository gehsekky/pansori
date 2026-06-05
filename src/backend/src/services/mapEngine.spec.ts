// 3-level grid map model — the navigation core. Exercises resolveMarkerMove +
// activeGrid across a fixture campaign: regional → (town site) → town → (venue
// interior) → local room → (exit cell) → next room → ascend → town → (gate) →
// region. Pure-function tests on CampaignData + rooms + GameState.

import type { CampaignData, GameState, Room } from '../types.js';
import {
  ENCOUNTER_ROOM_ID,
  activeGrid,
  initMapState,
  resolveMarkerMove,
  returnFromEncounter,
  stageEncounter,
} from './mapEngine.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => vi.restoreAllMocks());

const rooms: Room[] = [
  {
    id: 'tavern',
    name: 'The Salt Hog',
    desc: '',
    gridWidth: 6,
    gridHeight: 6,
    entryPos: { x: 0, y: 0 },
    exits: [{ pos: { x: 5, y: 5 }, ascends: true, label: 'Door' }],
  },
  {
    id: 'crypt_entrance',
    name: 'Crypt Entrance',
    desc: '',
    gridWidth: 10,
    gridHeight: 10,
    entryPos: { x: 0, y: 0 },
    exits: [
      {
        pos: { x: 9, y: 9 },
        toRoomId: 'crypt_hall',
        entrancePos: { x: 0, y: 0 },
        label: 'Stairs down',
      },
      { pos: { x: 0, y: 1 }, ascends: true, label: 'Exit to road' },
    ],
  },
  {
    id: 'crypt_hall',
    name: 'Crypt Hall',
    desc: '',
    gridWidth: 10,
    gridHeight: 10,
    entryPos: { x: 0, y: 0 },
    exits: [{ pos: { x: 9, y: 0 }, toRoomId: 'crypt_entrance', entrancePos: { x: 9, y: 9 } }],
  },
];

const campaign: CampaignData = {
  world_name: 'Map Test',
  intro: '',
  rooms,
  regions: [
    {
      id: 'reg1',
      name: 'The Vale',
      feetPerSquare: 5280,
      gridWidth: 12,
      gridHeight: 12,
      startPos: { x: 0, y: 0 },
      sites: [
        { id: 's_town', name: 'Millhaven', pos: { x: 2, y: 0 }, kind: 'town', townId: 'town1' },
        {
          id: 's_crypt',
          name: 'Shattered Crypt',
          pos: { x: 5, y: 0 },
          kind: 'local',
          entryRoomId: 'crypt_entrance',
        },
      ],
    },
  ],
  towns: [
    {
      id: 'town1',
      name: 'Millhaven',
      feetPerSquare: 25,
      gridWidth: 8,
      gridHeight: 8,
      startPos: { x: 0, y: 0 },
      venues: [
        {
          id: 'v_tavern',
          name: 'The Salt Hog',
          pos: { x: 3, y: 3 },
          kind: 'interior',
          entryRoomId: 'tavern',
        },
        { id: 'v_gate', name: 'Town Gate', pos: { x: 1, y: 1 }, kind: 'gate' },
      ],
    },
  ],
};

function start(): GameState {
  return {
    map_level: 'regional',
    current_region_id: 'reg1',
    marker_pos: { x: 0, y: 0 },
    visited_rooms: [],
  } as unknown as GameState;
}

const move = (st: GameState, x: number, y: number) =>
  resolveMarkerMove(campaign, rooms, st, { x, y });

describe('activeGrid', () => {
  it('reports the regional grid scale + sites', () => {
    const g = activeGrid(campaign, rooms, start())!;
    expect(g.level).toBe('regional');
    expect(g.feetPerSquare).toBe(5280);
    expect(g.transitions).toHaveLength(2);
    expect(g.transitions.find((t) => t.toTownId === 'town1')).toBeTruthy();
  });

  it('returns null when not on the new map model', () => {
    expect(activeGrid(campaign, rooms, { visited_rooms: [] } as unknown as GameState)).toBeNull();
  });
});

describe('resolveMarkerMove — descent / room change / ascent', () => {
  it('walks the full nav loop region → town → interior → room → ascend → gate → region', () => {
    let st = start();

    // Region → step onto the town site → enter the town.
    let r = move(st, 2, 0);
    expect(r.transitioned).toBe(true);
    expect(r.squaresMoved).toBe(2);
    st = r.st;
    expect(st.map_level).toBe('town');
    expect(st.current_town_id).toBe('town1');
    expect(st.marker_pos).toEqual({ x: 0, y: 0 }); // town startPos
    expect(st.region_marker_pos).toEqual({ x: 2, y: 0 }); // bookmarked for ascent

    // Town → step onto the tavern venue → enter the local room.
    r = move(st, 3, 3);
    st = r.st;
    expect(st.map_level).toBe('local');
    expect(st.current_room).toBe('tavern');
    expect(st.marker_pos).toEqual({ x: 0, y: 0 }); // tavern entryPos
    expect(st.town_marker_pos).toEqual({ x: 3, y: 3 });
    expect(st.visited_rooms).toContain('tavern');

    // Local → step onto the ascend exit → back to the town (at the bookmarked cell).
    r = move(st, 5, 5);
    st = r.st;
    expect(st.map_level).toBe('town');
    expect(st.marker_pos).toEqual({ x: 3, y: 3 });

    // Town → the gate → back to the region (at the bookmarked site cell).
    r = move(st, 1, 1);
    st = r.st;
    expect(st.map_level).toBe('regional');
    expect(st.current_town_id).toBeUndefined();
    expect(st.marker_pos).toEqual({ x: 2, y: 0 });
  });

  it('region local site → room, then room→room via an exit cell, then ascends to region', () => {
    let st = start();
    let r = move(st, 5, 0); // onto the crypt site
    st = r.st;
    expect(st.map_level).toBe('local');
    expect(st.current_room).toBe('crypt_entrance');
    expect(st.region_marker_pos).toEqual({ x: 5, y: 0 });

    r = move(st, 9, 9); // stairs down → crypt_hall, arriving at its entrancePos
    st = r.st;
    expect(st.current_room).toBe('crypt_hall');
    expect(st.marker_pos).toEqual({ x: 0, y: 0 });

    r = move(st, 9, 0); // back-passage → crypt_entrance at (9,9)
    st = r.st;
    expect(st.current_room).toBe('crypt_entrance');
    expect(st.marker_pos).toEqual({ x: 9, y: 9 });

    r = move(st, 0, 1); // ascend exit → region (no town, so straight to region)
    st = r.st;
    expect(st.map_level).toBe('regional');
    expect(st.marker_pos).toEqual({ x: 5, y: 0 });
  });

  it('a plain move (no transition cell) just relocates the marker + spends travel time', () => {
    const r = move(start(), 4, 4);
    expect(r.transitioned).toBe(false);
    expect(r.st.marker_pos).toEqual({ x: 4, y: 4 });
    expect(r.st.map_level).toBe('regional');
    // 4 squares × 1 mile/square ÷ 3 mi/hr (Normal pace) ≈ 1.33 hr = 80 min.
    expect(r.elapsedHours).toBeCloseTo(4 / 3, 5);
    expect(r.st.world_minute).toBe(80);
  });

  it('rejects an off-map destination', () => {
    expect(move(start(), 99, 99).rejected).toBeTruthy();
  });

  it('re-enters a transition the marker is already standing on (no travel)', () => {
    // Park the marker ON the town site, then "move" onto it again → re-enter.
    const onSite = { ...start(), marker_pos: { x: 2, y: 0 } } as GameState;
    const r = move(onSite, 2, 0);
    expect(r.rejected).toBeUndefined();
    expect(r.transitioned).toBe(true);
    expect(r.st.map_level).toBe('town');
    expect(r.st.current_town_id).toBe('town1');
    expect(r.squaresMoved).toBe(0); // stood still
    expect(r.elapsedHours).toBe(0); // no travel time
  });

  it('still rejects a same-cell move on a plain (non-transition) cell', () => {
    const here = { ...start(), marker_pos: { x: 4, y: 4 } } as GameState;
    expect(move(here, 4, 4).rejected).toBe('Already there.');
  });
});

describe('initMapState', () => {
  it('starts the party on the regional grid for a region campaign', () => {
    const st = initMapState(campaign, { visited_rooms: [] } as unknown as GameState);
    expect(st.map_level).toBe('regional');
    expect(st.current_region_id).toBe('reg1');
    expect(st.marker_pos).toEqual({ x: 0, y: 0 });
  });

  it('is a no-op without regions or when map state is already set', () => {
    expect(initMapState({ world_name: '', intro: '', rooms: [] }, start()).map_level).toBe(
      'regional'
    );
    const already = initMapState(campaign, { ...start(), map_level: 'town' } as GameState);
    expect(already.map_level).toBe('town'); // untouched
  });
});

describe('regional encounters', () => {
  const encounterCampaign: CampaignData = {
    world_name: 'Enc',
    intro: '',
    rooms,
    regions: [
      {
        id: 'reg1',
        name: 'Wilds',
        feetPerSquare: 5280,
        gridWidth: 12,
        gridHeight: 12,
        startPos: { x: 0, y: 0 },
        sites: [{ id: 's', name: 'Keep', pos: { x: 3, y: 0 }, kind: 'town', townId: 'town1' }],
        encounterTable: ['Bandit Ruffian'],
        encounterChance: 1, // always triggers in the test
      },
    ],
    towns: campaign.towns,
  };

  it('rolls a per-square encounter that interrupts travel (suppressing the transition)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // < chance → encounter; index 0 → Bandit Ruffian
    const st = {
      map_level: 'regional',
      current_region_id: 'reg1',
      marker_pos: { x: 0, y: 0 },
      visited_rooms: [],
    } as unknown as GameState;
    const r = resolveMarkerMove(encounterCampaign, rooms, st, { x: 3, y: 0 }); // would enter the town
    expect(r.encounter).toBe('Bandit Ruffian');
    expect(r.transitioned).toBe(false); // interrupted en route — didn't enter the town
    expect(r.st.map_level).toBe('regional');
  });

  it('stage → return round-trips the party back to the travelling cell', () => {
    const travelling = {
      map_level: 'regional',
      current_region_id: 'reg1',
      marker_pos: { x: 4, y: 2 },
      visited_rooms: [],
    } as unknown as GameState;

    // Drop off the map into the transient encounter room.
    const staged = stageEncounter(travelling);
    expect(staged.map_level).toBe('local');
    expect(staged.current_room).toBe(ENCOUNTER_ROOM_ID);
    expect(staged.encounter_return).toEqual({
      level: 'regional',
      region_id: 'reg1',
      town_id: undefined,
      pos: { x: 4, y: 2 },
    });

    // Combat collapses → march back to the exact cell we were travelling on.
    const back = returnFromEncounter(staged);
    expect(back.map_level).toBe('regional');
    expect(back.current_region_id).toBe('reg1');
    expect(back.marker_pos).toEqual({ x: 4, y: 2 });
    expect(back.current_room).toBe('');
    expect(back.encounter_return).toBeUndefined();
  });

  it('returnFromEncounter is a no-op when not returning from an encounter', () => {
    const st = start();
    expect(returnFromEncounter(st)).toBe(st);
  });

  it('no encounter when the chance roll misses', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999); // ≥ chance(1)? no — but use a 0-chance check
    const noChance: CampaignData = {
      ...encounterCampaign,
      regions: [{ ...encounterCampaign.regions![0], encounterChance: 0 }],
    };
    const st = {
      map_level: 'regional',
      current_region_id: 'reg1',
      marker_pos: { x: 0, y: 0 },
      visited_rooms: [],
    } as unknown as GameState;
    const r = resolveMarkerMove(noChance, rooms, st, { x: 3, y: 0 });
    expect(r.encounter).toBeUndefined();
    expect(r.transitioned).toBe(true); // reached + entered the town
  });
});

describe('typed overland terrain (unified model)', () => {
  const terrainCampaign: CampaignData = {
    world_name: 'Terr',
    intro: '',
    rooms,
    regions: [
      {
        id: 'reg1',
        name: 'Wilds',
        feetPerSquare: 5280,
        gridWidth: 10,
        gridHeight: 10,
        startPos: { x: 0, y: 0 },
        sites: [],
        encounterTable: ['Bandit Ruffian'],
        encounterChance: 0.5,
        terrain: [
          { pos: { x: 2, y: 0 }, type: 'mountain' }, // impassable
          { pos: { x: 0, y: 1 }, type: 'road' }, // quick + safe
          { pos: { x: 0, y: 2 }, type: 'road' },
          { pos: { x: 0, y: 3 }, type: 'forest' }, // slow + dangerous
        ],
      },
    ],
  };
  const stAt = (x: number, y: number): GameState =>
    ({
      map_level: 'regional',
      current_region_id: 'reg1',
      marker_pos: { x, y },
      visited_rooms: [],
    }) as unknown as GameState;

  it('folds impassable terrain into obstacles + carries the terrain array', () => {
    const g = activeGrid(terrainCampaign, rooms, stAt(0, 0))!;
    expect(g.terrain).toHaveLength(4);
    expect(g.obstacles).toContainEqual({ x: 2, y: 0 }); // mountain blocks pathing
    expect(g.obstacles).not.toContainEqual({ x: 0, y: 1 }); // road is passable
  });

  it('rejects moving onto an impassable (mountain) cell', () => {
    expect(
      resolveMarkerMove(terrainCampaign, rooms, stAt(0, 0), { x: 2, y: 0 }).rejected
    ).toBeTruthy();
  });

  it('roads halve travel time; forest doubles it', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999); // no encounter
    // (0,1)+(0,2) both road (×0.5) ⇒ 1.0 weighted square ÷ 3 mi/hr.
    expect(
      resolveMarkerMove(terrainCampaign, rooms, stAt(0, 0), { x: 0, y: 2 }).elapsedHours
    ).toBeCloseTo(1 / 3, 5);
    // road + road + forest (0.5+0.5+2 = 3 weighted) ÷ 3 = 1.0 hr.
    expect(
      resolveMarkerMove(terrainCampaign, rooms, stAt(0, 0), { x: 0, y: 3 }).elapsedHours
    ).toBeCloseTo(1, 5);
  });

  it('keeps a site reachable even when impassable terrain is painted on its cell', () => {
    const overlap: CampaignData = {
      world_name: 'Overlap',
      intro: '',
      rooms,
      regions: [
        {
          id: 'reg1',
          name: 'Wilds',
          feetPerSquare: 5280,
          gridWidth: 10,
          gridHeight: 10,
          startPos: { x: 0, y: 0 },
          sites: [
            { id: 's', name: 'Pinegate', pos: { x: 1, y: 0 }, kind: 'town', townId: 'town1' },
          ],
          terrain: [{ pos: { x: 1, y: 0 }, type: 'water' }], // painted on the site cell
        },
      ],
      towns: campaign.towns,
    };
    // The site cell is NOT folded into obstacles despite the impassable paint…
    expect(activeGrid(overlap, rooms, stAt(0, 0))!.obstacles).not.toContainEqual({ x: 1, y: 0 });
    // …so the party can still travel to it (entering the town).
    expect(resolveMarkerMove(overlap, rooms, stAt(0, 0), { x: 1, y: 0 }).rejected).toBeUndefined();
  });

  it('roads are the safest terrain but not immune; forest is more dangerous', () => {
    // chance 0.5: road ×0.5 ⇒ 0.25 effective; forest ×2.5 ⇒ ≥1 effective.
    // A high roll (0.4) clears the low road threshold — an all-road trip is safe…
    vi.spyOn(Math, 'random').mockReturnValue(0.4);
    expect(
      resolveMarkerMove(terrainCampaign, rooms, stAt(0, 0), { x: 0, y: 2 }).encounter
    ).toBeUndefined();
    // …but a low roll (0.1 < 0.25) can still trigger on a road — roads aren't safe.
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
    expect(resolveMarkerMove(terrainCampaign, rooms, stAt(0, 0), { x: 0, y: 2 }).encounter).toBe(
      'Bandit Ruffian'
    );
    // Forest: road squares (0.25) miss at 0.6 but the forest cell hits.
    vi.spyOn(Math, 'random').mockReturnValue(0.6);
    expect(resolveMarkerMove(terrainCampaign, rooms, stAt(0, 0), { x: 0, y: 3 }).encounter).toBe(
      'Bandit Ruffian'
    );
  });
});
