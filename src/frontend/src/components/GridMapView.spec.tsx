import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import type { ActiveGrid } from '../types';
import GridMapView from './GridMapView';
import React from 'react';

// Exploration map view: a single party marker, clickable transition cells that
// dispatch marker_move, and a non-clickable obstacle cell.

const grid: ActiveGrid = {
  level: 'regional',
  id: 'reg1',
  name: 'The Vale',
  width: 4,
  height: 3,
  feetPerSquare: 5280,
  terrain: [],
  obstacles: [{ x: 2, y: 2 }],
  startPos: { x: 0, y: 0 },
  transitions: [
    { pos: { x: 3, y: 0 }, kind: 'site', label: 'Millhaven', toTownId: 'town1' },
    { pos: { x: 0, y: 2 }, kind: 'site', label: 'Old Crypt' }, // local site (no toTownId)
  ],
};

// A region with typed terrain (impassable cells also folded into obstacles, as
// the activeGrid builder does).
const terrainGrid: ActiveGrid = {
  level: 'regional',
  id: 'reg2',
  name: 'The Wilds',
  width: 5,
  height: 3,
  feetPerSquare: 5280,
  terrain: [
    { pos: { x: 0, y: 1 }, type: 'road' },
    { pos: { x: 2, y: 0 }, type: 'mountain' },
    { pos: { x: 3, y: 1 }, type: 'water' },
    { pos: { x: 1, y: 2 }, type: 'forest' },
  ],
  obstacles: [
    { x: 2, y: 0 },
    { x: 3, y: 1 },
  ],
  startPos: { x: 0, y: 0 },
  transitions: [],
};

const cell = (c: HTMLElement, x: number, y: number) =>
  c.querySelector(`[aria-label^="${x},${y}"]`) as HTMLElement;

describe('GridMapView', () => {
  it('renders the party marker, the scale header, and a labelled travel point', () => {
    const { container, getByText } = render(<GridMapView grid={grid} markerPos={{ x: 0, y: 0 }} />);
    // Header shows level + name + mile scale.
    expect(getByText(/REGION · The Vale/)).toBeTruthy();
    expect(getByText(/1 mi\/square/)).toBeTruthy();
    // Party marker on its cell.
    expect(cell(container, 0, 0).getAttribute('aria-current')).toBe('location');
    // Transition cell carries its label.
    expect(cell(container, 3, 0).getAttribute('title')).toBe('Millhaven');
  });

  it('dispatches marker_move with the clicked cell, and never the marker / obstacle cells', () => {
    const onMarkerMove = vi.fn();
    const { container } = render(
      <GridMapView grid={grid} markerPos={{ x: 0, y: 0 }} onMarkerMove={onMarkerMove} />
    );

    // Click a plain reachable cell.
    fireEvent.click(cell(container, 1, 0));
    expect(onMarkerMove).toHaveBeenCalledWith({ x: 1, y: 0 });

    // Click the travel point.
    fireEvent.click(cell(container, 3, 0));
    expect(onMarkerMove).toHaveBeenCalledWith({ x: 3, y: 0 });

    // The obstacle and the marker's own cell are not buttons.
    expect(cell(container, 2, 2).getAttribute('role')).toBe('gridcell');
    expect(cell(container, 0, 0).getAttribute('role')).toBe('gridcell');
    onMarkerMove.mockClear();
    fireEvent.click(cell(container, 2, 2));
    fireEvent.click(cell(container, 0, 0));
    expect(onMarkerMove).not.toHaveBeenCalled();
  });

  it('shows a single red enemy marker near the party when an enemy is present', () => {
    const { container, getByText, rerender } = render(
      <GridMapView grid={grid} markerPos={{ x: 0, y: 0 }} enemyPresent />
    );
    const enemyCells = container.querySelectorAll('[aria-label*="an enemy"]');
    expect(enemyCells.length).toBe(1); // exactly one red marker
    expect(getByText('enemy')).toBeTruthy(); // legend entry
    // It is not on the party's own cell.
    expect(cell(container, 0, 0).getAttribute('aria-label')).not.toContain('an enemy');

    // No enemy present → no marker, no legend entry.
    rerender(<GridMapView grid={grid} markerPos={{ x: 0, y: 0 }} />);
    expect(container.querySelectorAll('[aria-label*="an enemy"]').length).toBe(0);
  });

  it('distinguishes a town (⌂) from a local site (◈) and shows their names', () => {
    const { container, getByText } = render(<GridMapView grid={grid} markerPos={{ x: 0, y: 0 }} />);
    // Town cell: house glyph + always-visible name.
    expect(cell(container, 3, 0).textContent).toContain('⌂');
    expect(getByText('Millhaven')).toBeTruthy();
    // Local site cell: diamond glyph + name.
    expect(cell(container, 0, 2).textContent).toContain('◈');
    expect(getByText('Old Crypt')).toBeTruthy();
    // Legend gains town + site entries.
    expect(getByText('town')).toBeTruthy();
    expect(getByText('site')).toBeTruthy();
  });

  it('tooltips a non-POI square with its terrain type + travel/encounter info', () => {
    const { container } = render(<GridMapView grid={terrainGrid} markerPos={{ x: 0, y: 0 }} />);
    // Painted terrain: label + how it crosses (road = quick + safe).
    expect(cell(container, 0, 1).getAttribute('title')).toBe('Road · quick travel · safe');
    // Impassable terrain just notes it can't be crossed.
    expect(cell(container, 3, 1).getAttribute('title')).toBe('Water · impassable');
    // Blank cell on a terrain grid reads as plain (no modifiers ⇒ label only).
    expect(cell(container, 4, 2).getAttribute('title')).toBe('Plains');
  });

  it('renders regional impassable terrain as a mountain glyph + a "mountains" legend', () => {
    const { container, getByText } = render(<GridMapView grid={grid} markerPos={{ x: 0, y: 0 }} />);
    expect(cell(container, 2, 2).textContent).toContain('▲');
    expect(getByText('mountains')).toBeTruthy();
  });

  it('highlights the party current cell with the current-cell class', () => {
    const { container } = render(<GridMapView grid={grid} markerPos={{ x: 1, y: 1 }} />);
    const here = cell(container, 1, 1);
    expect(here.getAttribute('aria-current')).toBe('location');
    expect(here.className).toMatch(/gridMapCellCurrent/);
  });

  it('renders typed terrain: glyphs for impassable, tints + legend for the rest', () => {
    const onMarkerMove = vi.fn();
    const { container, getByText } = render(
      <GridMapView grid={terrainGrid} markerPos={{ x: 0, y: 0 }} onMarkerMove={onMarkerMove} />
    );
    // Impassable terrain carries a glyph and is not clickable.
    expect(cell(container, 2, 0).textContent).toContain('▲'); // mountain
    expect(cell(container, 3, 1).textContent).toContain('≈'); // water
    expect(cell(container, 2, 0).getAttribute('role')).toBe('gridcell');
    expect(cell(container, 3, 1).getAttribute('role')).toBe('gridcell');
    // Passable terrain (road) stays travel-able.
    expect(cell(container, 0, 1).getAttribute('role')).toBe('button');
    // Legend names each terrain type present.
    expect(getByText('road')).toBeTruthy();
    expect(getByText('water')).toBeTruthy();
    expect(getByText('forest')).toBeTruthy();
    expect(getByText('mountains')).toBeTruthy();
  });

  it('shows the site glyph (not the terrain glyph) and stays clickable when terrain overlaps a site', () => {
    // Regression: Pinegate is a town site painted with water terrain on the
    // same cell. It must read as ⌂ (town), not ≈ (water), and stay travel-able
    // (the builder keeps the site cell out of obstacles).
    const overlap: ActiveGrid = {
      level: 'regional',
      id: 'reg3',
      name: 'Overlap',
      width: 4,
      height: 3,
      feetPerSquare: 5280,
      terrain: [{ pos: { x: 1, y: 0 }, type: 'water' }],
      obstacles: [], // builder excludes the site cell
      startPos: { x: 0, y: 0 },
      transitions: [{ pos: { x: 1, y: 0 }, kind: 'site', label: 'Pinegate', toTownId: 'town1' }],
    };
    const onMarkerMove = vi.fn();
    const { container } = render(
      <GridMapView grid={overlap} markerPos={{ x: 0, y: 0 }} onMarkerMove={onMarkerMove} />
    );
    const c = cell(container, 1, 0);
    expect(c.textContent).toContain('⌂'); // town glyph wins
    expect(c.textContent).not.toContain('≈'); // not the water glyph
    expect(c.getAttribute('role')).toBe('button'); // reachable
  });

  it('fills plains squares on a terrain map with the light-tan ground tint (no checkerboard)', () => {
    const { container } = render(<GridMapView grid={terrainGrid} markerPos={{ x: 0, y: 0 }} />);
    // (4,2) is an unpainted (plains) cell on a terrain-bearing grid → tan tint,
    // applied uniformly (no light/dark checkerboard alternation).
    expect(cell(container, 4, 2).style.background).toContain('208, 188, 146');
    // A second plains cell of opposite parity carries the same fill.
    expect(cell(container, 3, 2).style.background).toContain('208, 188, 146');
  });

  const localGrid: ActiveGrid = {
    level: 'local',
    id: 'temple',
    name: 'Temple',
    width: 7,
    height: 7,
    feetPerSquare: 5,
    terrain: [],
    obstacles: [],
    startPos: { x: 3, y: 6 },
    transitions: [],
  };

  it('renders a clickable NPC token (name label + Talk tooltip) and dispatches talk', () => {
    const onNpcClick = vi.fn();
    const onMarkerMove = vi.fn();
    const { container, getByText } = render(
      <GridMapView
        grid={localGrid}
        markerPos={{ x: 3, y: 6 }}
        npc={{ pos: { x: 3, y: 2 }, name: 'Sister Maren' }}
        onNpcClick={onNpcClick}
        onMarkerMove={onMarkerMove}
      />
    );
    const npcCell = cell(container, 3, 2);
    expect(getByText('Sister Maren')).toBeTruthy(); // name label
    expect(npcCell.getAttribute('title')).toBe('Talk to Sister Maren');
    expect(npcCell.getAttribute('role')).toBe('button'); // clickable
    fireEvent.click(npcCell);
    expect(onNpcClick).toHaveBeenCalledTimes(1);
    expect(onMarkerMove).not.toHaveBeenCalled(); // the NPC cell talks, doesn't move
  });

  it('hides the NPC token when the party marker stands on it', () => {
    const { container, queryByText } = render(
      <GridMapView
        grid={localGrid}
        markerPos={{ x: 3, y: 2 }} // party on the NPC's cell
        npc={{ pos: { x: 3, y: 2 }, name: 'Sister Maren' }}
        onNpcClick={vi.fn()}
        onMarkerMove={vi.fn()}
      />
    );
    // The party marker wins the cell; the NPC label isn't drawn.
    expect(queryByText('Sister Maren')).toBeNull();
    expect(cell(container, 3, 2).getAttribute('aria-current')).toBe('location');
  });
});
