// The first-person grid crawler — under test: the WebGL-unavailable fallback
// (jsdom's own path: getContext returns null, so the r3f canvas never mounts
// and the classic UI keeps working without it). Movement math lives in
// lib/gridStep (its own spec); the placement logic in lib/roomPlacement.

import type { ActiveGrid, GameState, Seed } from '../types';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
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

describe('Crawler3DView — NPCs are solid', () => {
  // Marker (3,5) in the 7×6 den faces north (initialHeading), so 'w' steps
  // to (3,4). The keydown handler registers regardless of the WebGL
  // fallback, so jsdom can drive it.
  const step = (npcs: Seed['npcs']) => {
    const onChoice = vi.fn();
    render(
      <Crawler3DView
        gameState={gameState}
        seed={{ ...seed, npcs } as Seed}
        grid={grid}
        choices={[]}
        loading={false}
        readOnly={false}
        onChoice={onChoice}
      />
    );
    fireEvent.keyDown(window, { key: 'w' });
    return onChoice;
  };

  it('a step into a living NPC is a bump — no marker_move round-trip', () => {
    const onChoice = step({
      bram: {
        id: 'bram',
        name: 'Bram',
        attitude: 'friendly',
        roomId: 'den',
        pos: { x: 3, y: 4 },
      },
    } as unknown as Seed['npcs']);
    expect(onChoice).not.toHaveBeenCalled();
  });

  it('the same step dispatches marker_move when no one stands there', () => {
    const onChoice = step({} as Seed['npcs']);
    expect(onChoice).toHaveBeenCalledTimes(1);
    expect(onChoice.mock.calls[0][0].action).toEqual({
      type: 'marker_move',
      to: { x: 3, y: 4 },
    });
  });
});
