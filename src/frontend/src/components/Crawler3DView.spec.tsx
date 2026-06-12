// The first-person grid crawler — under test: the WebGL-unavailable fallback
// (jsdom's own path: getContext returns null, so the r3f canvas never mounts
// and the classic UI keeps working without it). Movement math lives in
// lib/gridStep (its own spec); the placement logic in lib/roomPlacement.

import type { ActiveGrid, GameState, Seed } from '../types';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import Crawler3DView from './Crawler3DView.tsx';

const grid: ActiveGrid = {
  level: 'local',
  id: 'den',
  name: "Lorien's Den",
  width: 7,
  height: 6,
  feetPerSquare: 5,
  terrain: [],
  obstacles: [{ x: 2, y: 2 }],
  transitions: [{ pos: { x: 3, y: 5 }, kind: 'ascend', label: 'Out to Silverford' }],
  startPos: { x: 3, y: 5 },
};

const gameState = {
  map_level: 'local',
  current_room: 'den',
  marker_pos: { x: 3, y: 5 },
  characters: [],
  visited_rooms: [],
} as unknown as GameState;

const seed = {
  rooms: [{ id: 'den', name: "Lorien's Den", desc: '' }],
  npcs: {},
} as unknown as Seed;

describe('Crawler3DView', () => {
  it('renders the placeholder (not the canvas) when WebGL is unavailable', () => {
    render(
      <Crawler3DView
        gameState={gameState}
        seed={seed}
        grid={grid}
        choices={[]}
        loading={false}
        readOnly={false}
        onChoice={() => {}}
      />
    );
    expect(screen.getByTestId('crawler-3d-unavailable')).toBeTruthy();
    expect(screen.queryByTestId('crawler-3d-view')).toBeNull();
  });

  it('handles a TOWN grid the same way (the outdoor crawler shares the component)', () => {
    const townGrid: ActiveGrid = {
      level: 'town',
      id: 'silverford',
      name: 'Silverford',
      width: 10,
      height: 8,
      feetPerSquare: 25,
      terrain: [],
      obstacles: [],
      transitions: [
        { pos: { x: 2, y: 2 }, kind: 'venue', label: 'General Store', toRoomId: 'store' },
        { pos: { x: 5, y: 6 }, kind: 'ascend', label: 'Town Gate', ascendTo: 'region' },
      ],
      startPos: { x: 5, y: 6 },
    };
    const townState = {
      ...gameState,
      map_level: 'town',
      current_town_id: 'silverford',
      current_room: '',
      marker_pos: { x: 5, y: 6 },
    } as unknown as typeof gameState;
    render(
      <Crawler3DView
        gameState={townState}
        seed={seed}
        grid={townGrid}
        choices={[]}
        loading={false}
        readOnly={false}
        onChoice={() => {}}
      />
    );
    expect(screen.getAllByTestId('crawler-3d-unavailable').length).toBeGreaterThan(0);
  });
});
