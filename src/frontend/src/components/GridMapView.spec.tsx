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
    // Party marker on its cell — the animated warrior sprite on the overworld.
    expect(cell(container, 0, 0).getAttribute('aria-current')).toBe('location');
    expect(cell(container, 0, 0).querySelector('[class*="gridMapMarkerSprite"]')).toBeTruthy();
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

  it('engages combat when the red enemy marker is clicked (not a travel move)', () => {
    const onEnemyClick = vi.fn();
    const onMarkerMove = vi.fn();
    const { container } = render(
      <GridMapView
        grid={grid}
        markerPos={{ x: 0, y: 0 }}
        enemyPresent
        onEnemyClick={onEnemyClick}
        onMarkerMove={onMarkerMove}
      />
    );
    const enemyCell = container.querySelector('[aria-label*="an enemy"]') as HTMLElement;
    expect(enemyCell.getAttribute('role')).toBe('button'); // clickable
    expect(enemyCell.getAttribute('title')).toBe('Attack');
    fireEvent.click(enemyCell);
    expect(onEnemyClick).toHaveBeenCalledTimes(1);
    expect(onMarkerMove).not.toHaveBeenCalled(); // engages, doesn't travel onto the cell
  });

  it('distinguishes a town (painted village tile) from a local site (default dungeon icon) and shows their names', () => {
    const { container, getByText } = render(<GridMapView grid={grid} markerPos={{ x: 0, y: 0 }} />);
    // Town cell: the painted village tile (not the old glyph) + always-visible name.
    expect(cell(container, 3, 0).querySelector('img')?.getAttribute('src')).toContain(
      '/art/tiles/town.png'
    );
    expect(cell(container, 3, 0).querySelector('.game-icon-village')).toBeNull();
    expect(getByText('Millhaven')).toBeTruthy();
    // Local site cell (no authored icon): the default dungeon glyph + name.
    expect(cell(container, 0, 2).querySelector('.game-icon-dungeon-gate')).toBeTruthy();
    expect(getByText('Old Crypt')).toBeTruthy();
    // Legend gains town + site entries.
    expect(getByText('town')).toBeTruthy();
    expect(getByText('site')).toBeTruthy();
  });

  it('renders a site as a painted tile when its icon is "tile:<name>"', () => {
    const groveGrid: ActiveGrid = {
      ...grid,
      transitions: [
        { pos: { x: 0, y: 2 }, kind: 'site', label: 'The Silent Grove', icon: 'tile:forest' },
      ],
    };
    const { container, getByText } = render(
      <GridMapView grid={groveGrid} markerPos={{ x: 0, y: 0 }} />
    );
    const c = cell(container, 0, 2);
    expect(c.querySelector('img')?.getAttribute('src')).toContain('/art/tiles/forest.png');
    expect(c.querySelector('.game-icon-dungeon-gate')).toBeNull(); // tile replaces the glyph
    expect(getByText('The Silent Grove')).toBeTruthy(); // label kept
  });

  it('renders a per-dungeon icon override on a local site', () => {
    const withIcon: ActiveGrid = {
      ...grid,
      transitions: [
        { pos: { x: 0, y: 2 }, kind: 'site', label: 'Shattered Crypt', icon: 'tombstone' },
      ],
    };
    const { container } = render(<GridMapView grid={withIcon} markerPos={{ x: 0, y: 0 }} />);
    const c = cell(container, 0, 2);
    expect(c.querySelector('.game-icon-tombstone')).toBeTruthy(); // override wins
    expect(c.querySelector('.game-icon-dungeon-gate')).toBeNull(); // not the default
  });

  it('tooltips a non-POI square with its terrain type + travel/encounter info', () => {
    const { container } = render(<GridMapView grid={terrainGrid} markerPos={{ x: 0, y: 0 }} />);
    // Painted terrain: label + how it crosses (road = quick + safer, the lowest
    // nonzero encounter rate — roads aren't fully immune).
    expect(cell(container, 0, 1).getAttribute('title')).toBe('Road · quick travel · safer');
    // Impassable terrain just notes it can't be crossed.
    expect(cell(container, 3, 1).getAttribute('title')).toBe('Water · impassable');
    // Blank cell on a terrain grid defaults to plains (wilds — encounters more
    // likely than on a road).
    expect(cell(container, 4, 2).getAttribute('title')).toBe('Plains · encounters more likely');
  });

  it('renders regional impassable terrain as a mountain glyph + a "mountains" legend', () => {
    const { container, getByText } = render(<GridMapView grid={grid} markerPos={{ x: 0, y: 0 }} />);
    expect(cell(container, 2, 2).textContent).toContain('▲');
    expect(getByText('mountains')).toBeTruthy();
  });

  it('fog of war: hides undiscovered cells and blocks travel to them', () => {
    const onMarkerMove = vi.fn();
    // Only (0,0) and (1,0) are discovered; the town site at (3,0) is fogged.
    const { container } = render(
      <GridMapView
        grid={grid}
        markerPos={{ x: 0, y: 0 }}
        onMarkerMove={onMarkerMove}
        revealed={new Set(['0,0', '1,0'])}
      />
    );
    // A revealed plain cell is a normal travel target.
    expect(cell(container, 1, 0).getAttribute('role')).toBe('button');
    // The fogged town site reads as unexplored — hidden glyph, not travelable.
    const fog = cell(container, 3, 0);
    expect(fog.getAttribute('title')).toBe('Unexplored');
    expect(fog.getAttribute('aria-label')).toContain('unexplored');
    expect(fog.getAttribute('role')).toBe('gridcell'); // not a button
    expect(fog.querySelector('.game-icon-village')).toBeNull(); // site glyph hidden
    fireEvent.click(fog);
    expect(onMarkerMove).not.toHaveBeenCalled();
    // The party marker is never fogged.
    expect(cell(container, 0, 0).querySelector('[class*="gridMapMarkerSprite"]')).toBeTruthy();
  });

  it('renders the painted terrain tile (not a glyph) on a regional forest cell', () => {
    // terrainGrid has a forest at (1,2) on a regional grid.
    const { container } = render(<GridMapView grid={terrainGrid} markerPos={{ x: 0, y: 0 }} />);
    const c = cell(container, 1, 2);
    expect(c.querySelector('img')?.getAttribute('src')).toContain('/art/tiles/forest.png');
    expect(c.querySelector('.game-icon-forest')).toBeNull(); // tile replaces the glyph
  });

  it('renders the road terrain tile on a regional road cell (still clickable)', () => {
    // terrainGrid has a road at (0,1).
    const onMarkerMove = vi.fn();
    const { container } = render(
      <GridMapView grid={terrainGrid} markerPos={{ x: 0, y: 0 }} onMarkerMove={onMarkerMove} />
    );
    expect(cell(container, 0, 1).querySelector('img')?.getAttribute('src')).toContain(
      '/art/tiles/road.png'
    );
    expect(cell(container, 0, 1).getAttribute('role')).toBe('button'); // passable
  });

  it('renders the game-icons hills glyph on a regional hills tile', () => {
    const hillsGrid: ActiveGrid = {
      ...grid,
      terrain: [{ pos: { x: 1, y: 1 }, type: 'hills' }],
      transitions: [],
    };
    const { container } = render(<GridMapView grid={hillsGrid} markerPos={{ x: 0, y: 0 }} />);
    expect(cell(container, 1, 1).querySelector('img')?.getAttribute('src')).toContain(
      '/art/tiles/hills.png'
    );
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
    // Impassable terrain now carries its painted tile, and is not clickable.
    expect(cell(container, 2, 0).querySelector('img')?.getAttribute('src')).toContain(
      '/art/tiles/mountain.png'
    );
    expect(cell(container, 3, 1).querySelector('img')?.getAttribute('src')).toContain(
      '/art/tiles/water.png'
    );
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

  it('shows the town tile (not the terrain) and stays clickable when terrain overlaps a site', () => {
    // Regression: Pinegate is a town site painted with water terrain on the
    // same cell. It must read as a town (the village tile wins over the water
    // tile) and stay travel-able (the builder keeps the site cell out of obstacles).
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
    expect(c.querySelector('img')?.getAttribute('src')).toContain('/art/tiles/town.png'); // town wins
    expect(c.querySelector('.game-icon-wave-crest')).toBeNull(); // not the water glyph
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

  it('renders a clickable NPC token (name label + Talk tooltip) and dispatches talk with the npc id', () => {
    const onNpcClick = vi.fn();
    const onMarkerMove = vi.fn();
    const { container, getByText } = render(
      <GridMapView
        grid={localGrid}
        markerPos={{ x: 3, y: 6 }}
        npcs={[{ id: 'npc_maren', pos: { x: 3, y: 2 }, name: 'Sister Maren' }]}
        onNpcClick={onNpcClick}
        onMarkerMove={onMarkerMove}
      />
    );
    const npcCell = cell(container, 3, 2);
    expect(getByText('Sister Maren')).toBeTruthy(); // name label
    expect(npcCell.getAttribute('title')).toBe('Talk to Sister Maren');
    expect(npcCell.getAttribute('role')).toBe('button'); // clickable
    fireEvent.click(npcCell);
    expect(onNpcClick).toHaveBeenCalledWith('npc_maren');
    expect(onMarkerMove).not.toHaveBeenCalled(); // the NPC cell talks, doesn't move
  });

  it('renders a token per NPC when several share a room, each dispatching its own id', () => {
    const onNpcClick = vi.fn();
    const { container, getByText } = render(
      <GridMapView
        grid={localGrid}
        markerPos={{ x: 3, y: 6 }}
        npcs={[
          { id: 'npc_elise', pos: { x: 3, y: 2 }, name: 'Old Elise' },
          { id: 'npc_bram', pos: { x: 5, y: 4 }, name: 'Bram' },
        ]}
        onNpcClick={onNpcClick}
        onMarkerMove={vi.fn()}
      />
    );
    expect(getByText('Old Elise')).toBeTruthy();
    expect(getByText('Bram')).toBeTruthy();
    fireEvent.click(cell(container, 5, 4));
    expect(onNpcClick).toHaveBeenCalledWith('npc_bram');
  });

  it('hides the NPC token when the party marker stands on it', () => {
    const { container, queryByText } = render(
      <GridMapView
        grid={localGrid}
        markerPos={{ x: 3, y: 2 }} // party on the NPC's cell
        npcs={[{ id: 'npc_maren', pos: { x: 3, y: 2 }, name: 'Sister Maren' }]}
        onNpcClick={vi.fn()}
        onMarkerMove={vi.fn()}
      />
    );
    // The party marker wins the cell; the NPC label isn't drawn.
    expect(queryByText('Sister Maren')).toBeNull();
    expect(cell(container, 3, 2).getAttribute('aria-current')).toBe('location');
  });

  it('on town/local grids: painted tiles where available, glyphs for the rest', () => {
    // Terrain with a tile (water) shows the tile on every level; interior types
    // this set doesn't cover (town_wall, garden) keep their game-icons glyphs.
    const townGrid: ActiveGrid = {
      level: 'town',
      id: 'pinegate',
      name: 'Pinegate',
      width: 6,
      height: 6,
      feetPerSquare: 5,
      terrain: [
        { pos: { x: 1, y: 1 }, type: 'water' },
        { pos: { x: 2, y: 1 }, type: 'town_wall' },
        { pos: { x: 3, y: 1 }, type: 'garden' },
      ],
      obstacles: [],
      startPos: { x: 0, y: 5 },
      transitions: [],
    };
    const { container } = render(<GridMapView grid={townGrid} markerPos={{ x: 0, y: 5 }} />);
    expect(cell(container, 1, 1).querySelector('img')?.getAttribute('src')).toContain(
      '/art/tiles/water.png'
    );
    expect(cell(container, 2, 1).querySelector('.game-icon-brick-wall')).toBeTruthy();
    expect(cell(container, 3, 1).querySelector('.game-icon-flowers')).toBeTruthy();
  });

  it('tiles unpainted plains on the regional map but leaves interior grids bare', () => {
    // Regional: an unpainted cell on a terrain-bearing grid is plains → plains tile.
    const { container } = render(<GridMapView grid={terrainGrid} markerPos={{ x: 0, y: 0 }} />);
    expect(cell(container, 4, 2).querySelector('img')?.getAttribute('src')).toContain(
      '/art/tiles/plains.png'
    );
    // Local interior: cobblestone has no tile, and unpainted cells don't sprout
    // grass — so no tile images at all.
    const room: ActiveGrid = {
      level: 'local',
      id: 'room',
      name: 'Room',
      width: 4,
      height: 4,
      feetPerSquare: 5,
      terrain: [{ pos: { x: 0, y: 0 }, type: 'cobblestone' }],
      obstacles: [],
      startPos: { x: 0, y: 3 },
      transitions: [],
    };
    const { container: c2 } = render(<GridMapView grid={room} markerPos={{ x: 0, y: 3 }} />);
    expect(c2.querySelector('img')).toBeNull();
  });

  it('does not render a tile on a fogged cell', () => {
    const { container } = render(
      <GridMapView grid={terrainGrid} markerPos={{ x: 0, y: 0 }} revealed={new Set(['0,0'])} />
    );
    expect(cell(container, 1, 2).querySelector('img')).toBeNull(); // fogged forest cell
  });

  it('elevates token cells so tile overhangs from below cannot occlude them', () => {
    const { container } = render(
      <GridMapView
        grid={localGrid}
        markerPos={{ x: 3, y: 6 }}
        npcs={[{ id: 'n', pos: { x: 1, y: 1 }, name: 'X' }]}
        onNpcClick={vi.fn()}
        onMarkerMove={vi.fn()}
      />
    );
    expect(cell(container, 3, 6).style.zIndex).toBe('2'); // party marker cell
    expect(cell(container, 1, 1).style.zIndex).toBe('2'); // NPC token cell
  });

  it('renders game-icons glyphs for town venues, room exits, and ascents', () => {
    const venueGrid: ActiveGrid = {
      ...localGrid,
      transitions: [
        { pos: { x: 1, y: 1 }, kind: 'venue', label: 'The Mug' },
        { pos: { x: 2, y: 1 }, kind: 'room_exit', label: 'East Passage' },
        { pos: { x: 3, y: 1 }, kind: 'ascend', label: 'Leave' },
      ],
    };
    const { container } = render(<GridMapView grid={venueGrid} markerPos={{ x: 3, y: 6 }} />);
    expect(cell(container, 1, 1).querySelector('.game-icon-house')).toBeTruthy();
    // Room exits and ascents both use the exit-door glyph.
    expect(cell(container, 2, 1).querySelector('.game-icon-exit-door')).toBeTruthy();
    expect(cell(container, 3, 1).querySelector('.game-icon-exit-door')).toBeTruthy();
  });

  it('renders the enemy marker as a red game-icons glyph (not a letter token)', () => {
    const { container } = render(
      <GridMapView grid={grid} markerPos={{ x: 0, y: 0 }} enemyPresent />
    );
    const enemyCell = container.querySelector('[aria-label*="an enemy"]') as HTMLElement;
    expect(enemyCell.querySelector('.game-icon-daemon-skull')).toBeTruthy();
  });

  it('renders an NPC token with the default glyph, or a per-NPC icon override', () => {
    const { container } = render(
      <GridMapView
        grid={localGrid}
        markerPos={{ x: 3, y: 6 }}
        npcs={[
          { id: 'npc_a', pos: { x: 1, y: 1 }, name: 'Townsfolk' }, // no icon → default
          { id: 'npc_bram', pos: { x: 2, y: 1 }, name: 'Bram', icon: 'wood-axe' }, // override
        ]}
        onNpcClick={vi.fn()}
        onMarkerMove={vi.fn()}
      />
    );
    expect(cell(container, 1, 1).querySelector('.game-icon-conversation')).toBeTruthy();
    expect(cell(container, 2, 1).querySelector('.game-icon-wood-axe')).toBeTruthy();
  });

  it('renders clickable loot tokens (default glyph + label + Approach tooltip) and dispatches onLootClick with the key', () => {
    const onLootClick = vi.fn();
    const onMarkerMove = vi.fn();
    const { container, getByText } = render(
      <GridMapView
        grid={localGrid}
        markerPos={{ x: 3, y: 6 }}
        loot={[
          { key: 'room#0', pos: { x: 2, y: 2 }, name: 'Healing Potion' },
          { key: 'room#1', pos: { x: 5, y: 4 }, name: 'Silver Dagger' },
        ]}
        onLootClick={onLootClick}
        onMarkerMove={onMarkerMove}
      />
    );
    expect(getByText('Healing Potion')).toBeTruthy();
    expect(getByText('Silver Dagger')).toBeTruthy();
    const lootCell = cell(container, 2, 2);
    expect(lootCell.querySelector('.game-icon-swap-bag')).toBeTruthy(); // green loot glyph
    expect(lootCell.getAttribute('title')).toBe('Approach the Healing Potion');
    expect(lootCell.getAttribute('role')).toBe('button');
    fireEvent.click(cell(container, 5, 4));
    expect(onLootClick).toHaveBeenCalledWith('room#1');
    expect(onMarkerMove).not.toHaveBeenCalled(); // the loot cell approaches, doesn't travel
  });

  it('renders a clickable container token (chest glyph) and dispatches onObjectClick with the id', () => {
    const onObjectClick = vi.fn();
    const { container, getByText } = render(
      <GridMapView
        grid={localGrid}
        markerPos={{ x: 3, y: 6 }}
        objects={[{ id: 'strongbox', pos: { x: 4, y: 1 }, name: "Captain's Strongbox" }]}
        onObjectClick={onObjectClick}
        onMarkerMove={vi.fn()}
      />
    );
    expect(getByText("Captain's Strongbox")).toBeTruthy();
    const objCell = cell(container, 4, 1);
    expect(objCell.querySelector('.game-icon-locked-chest')).toBeTruthy();
    expect(objCell.getAttribute('title')).toBe("Approach the Captain's Strongbox");
    fireEvent.click(objCell);
    expect(onObjectClick).toHaveBeenCalledWith('strongbox');
  });

  it('readOnly suppresses every cell click even when handlers are wired (alternate flow owns the surface)', () => {
    const onMarkerMove = vi.fn();
    const onNpcClick = vi.fn();
    const onLootClick = vi.fn();
    const onObjectClick = vi.fn();
    const onEnemyClick = vi.fn();
    const { container } = render(
      <GridMapView
        grid={localGrid}
        markerPos={{ x: 3, y: 6 }}
        readOnly
        enemyPresent
        npcs={[{ id: 'npc_x', pos: { x: 1, y: 1 }, name: 'Elder' }]}
        loot={[{ key: 'r#0', pos: { x: 2, y: 2 }, name: 'Potion' }]}
        objects={[{ id: 'chest', pos: { x: 4, y: 1 }, name: 'Chest' }]}
        onMarkerMove={onMarkerMove}
        onNpcClick={onNpcClick}
        onLootClick={onLootClick}
        onObjectClick={onObjectClick}
        onEnemyClick={onEnemyClick}
      />
    );
    // No cell is a button; the tokens still render (the map is visible).
    expect(container.querySelectorAll('[role="button"]').length).toBe(0);
    // Clicking the token cells fires nothing.
    fireEvent.click(cell(container, 1, 1)); // npc
    fireEvent.click(cell(container, 2, 2)); // loot
    fireEvent.click(cell(container, 4, 1)); // object
    fireEvent.click(cell(container, 0, 0)); // empty travel cell
    expect(onMarkerMove).not.toHaveBeenCalled();
    expect(onNpcClick).not.toHaveBeenCalled();
    expect(onLootClick).not.toHaveBeenCalled();
    expect(onObjectClick).not.toHaveBeenCalled();
    expect(onEnemyClick).not.toHaveBeenCalled();
  });

  it('uses the warrior sprite marker on every exploration map level (regional/town/local)', () => {
    for (const g of [grid, localGrid]) {
      const { container } = render(<GridMapView grid={g} markerPos={{ x: 0, y: 0 }} />);
      expect(container.querySelector('[class*="gridMapMarkerSprite"]')).toBeTruthy();
      expect(container.querySelector('.game-icon-swords-emblem')).toBeNull();
    }
  });
});
