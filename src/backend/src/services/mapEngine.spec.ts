// 3-level grid map model — the navigation core. Exercises resolveMarkerMove +
// activeGrid across a fixture campaign: regional → (town site) → town → (venue
// interior) → local room → (exit cell) → next room → ascend → town → (gate) →
// region. Pure-function tests on CampaignData + rooms + GameState.

import type { CampaignData, GameState, Room } from '../types.js';
import { activeGrid, resolveMarkerMove } from './mapEngine.js';
import { describe, expect, it } from 'vitest';

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
  connections: {},
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

  it('a plain move (no transition cell) just relocates the marker', () => {
    const r = move(start(), 4, 4);
    expect(r.transitioned).toBe(false);
    expect(r.st.marker_pos).toEqual({ x: 4, y: 4 });
    expect(r.st.map_level).toBe('regional');
  });

  it('rejects an off-map destination', () => {
    expect(move(start(), 99, 99).rejected).toBeTruthy();
  });
});
