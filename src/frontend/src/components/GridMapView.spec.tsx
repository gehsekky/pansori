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

  it('checkerboards plain cells so adjacent squares are distinguishable', () => {
    const { container } = render(<GridMapView grid={grid} markerPos={{ x: 0, y: 0 }} />);
    // (1,0) is an even square (x+y=1 → odd index gets the tint; 2,0 even).
    const light = cell(container, 2, 0).style.background; // x+y=2 → plain --t-bg
    const dark = cell(container, 1, 0).style.background; // x+y=1 → tinted
    expect(light).not.toBe(dark);
    expect(dark).toContain('linear-gradient'); // the checker tint overlay
  });
});
