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
  obstacles: [{ x: 2, y: 2 }],
  startPos: { x: 0, y: 0 },
  transitions: [{ pos: { x: 3, y: 0 }, kind: 'site', label: 'Millhaven', toTownId: 'town1' }],
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

  it('checkerboards plain cells so adjacent squares are distinguishable', () => {
    const { container } = render(<GridMapView grid={grid} markerPos={{ x: 0, y: 0 }} />);
    // (1,0) is an even square (x+y=1 → odd index gets the tint; 2,0 even).
    const light = cell(container, 2, 0).style.background; // x+y=2 → plain --t-bg
    const dark = cell(container, 1, 0).style.background; // x+y=1 → tinted
    expect(light).not.toBe(dark);
    expect(dark).toContain('linear-gradient'); // the checker tint overlay
  });
});
