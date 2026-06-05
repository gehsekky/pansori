import type { GameState, Seed } from '../types';
import { describe, expect, it } from 'vitest';
import GridCombatView from './GridCombatView';
import React from 'react';
import { render } from '@testing-library/react';

// FE grid fog-of-war / vision reveal. A cell behind a solid obstacle (no party
// line of sight) is fogged "out of sight" and any enemy token there is
// suppressed — mirroring the backend `hasLineOfSight` vision rule. A 'sunlight'
// room behaves like 'bright' for vision.

const ROOM = 'r1';

function build(opts: {
  lighting?: 'bright' | 'dim' | 'dark' | 'sunlight';
  obstacles?: { x: number; y: number }[];
  terrain?: Seed['rooms'][number]['terrain'];
  pcPos: { x: number; y: number };
  enemyPos: { x: number; y: number };
}): { state: GameState; seed: Seed } {
  const state = {
    combat_active: true,
    active_character_id: 'pc-1',
    current_room: ROOM,
    movement_used: {},
    characters: [{ id: 'pc-1', name: 'Hero', speed: 30, dead: false, darkvision_ft: 0 }],
    entities: [
      { id: 'pc-1', isEnemy: false, pos: opts.pcPos, hp: 20, maxHp: 20, conditions: [] },
      { id: `${ROOM}#0`, isEnemy: true, pos: opts.enemyPos, hp: 15, maxHp: 15, conditions: [] },
    ],
  } as unknown as GameState;
  const seed = {
    rooms: [
      {
        id: ROOM,
        name: 'Room',
        desc: '',
        lighting: opts.lighting,
        obstacles: opts.obstacles,
        terrain: opts.terrain,
      },
    ],
    enemies: { [ROOM]: [{ id: `${ROOM}#0`, name: 'Goblin', hp: 15, ac: 12 }] },
  } as unknown as Seed;
  return { state, seed };
}

function cell(container: HTMLElement, x: number, y: number): HTMLElement {
  const el = container.querySelector(
    `[aria-label^="Cell ${x}, ${y},"], [aria-label="Cell ${x}, ${y}"]`
  );
  if (!el) throw new Error(`cell ${x},${y} not found`);
  return el as HTMLElement;
}

describe('GridCombatView — line-of-sight fog', () => {
  it('shows an enemy with clear line of sight (no obstacles)', () => {
    const { state, seed } = build({
      lighting: 'bright',
      pcPos: { x: 0, y: 5 },
      enemyPos: { x: 6, y: 5 },
    });
    const { container } = render(<GridCombatView state={state} seed={seed} />);
    expect(cell(container, 6, 5).getAttribute('aria-label')).toMatch(/Goblin, enemy/);
  });

  it('suppresses an enemy token behind a wall and marks the cell out of sight', () => {
    const { state, seed } = build({
      lighting: 'bright',
      obstacles: [{ x: 3, y: 5 }], // wall on the line from PC (0,5) to enemy (6,5)
      pcPos: { x: 0, y: 5 },
      enemyPos: { x: 6, y: 5 },
    });
    const { container } = render(<GridCombatView state={state} seed={seed} />);
    const label = cell(container, 6, 5).getAttribute('aria-label') ?? '';
    expect(label).not.toMatch(/Goblin/);
    expect(label).toMatch(/out of line of sight/);
  });

  it('reveals the enemy again when the wall is off the sightline', () => {
    const { state, seed } = build({
      lighting: 'bright',
      obstacles: [{ x: 3, y: 0 }], // wall elsewhere — does not block (0,5)→(6,5)
      pcPos: { x: 0, y: 5 },
      enemyPos: { x: 6, y: 5 },
    });
    const { container } = render(<GridCombatView state={state} seed={seed} />);
    expect(cell(container, 6, 5).getAttribute('aria-label')).toMatch(/Goblin, enemy/);
  });

  it("a 'sunlight' room behaves like bright — the enemy is visible", () => {
    const { state, seed } = build({
      lighting: 'sunlight',
      pcPos: { x: 0, y: 5 },
      enemyPos: { x: 6, y: 5 },
    });
    const { container } = render(<GridCombatView state={state} seed={seed} />);
    const label = cell(container, 6, 5).getAttribute('aria-label') ?? '';
    expect(label).toMatch(/Goblin, enemy/);
    expect(label).not.toMatch(/heavily obscured|out of line of sight/);
  });

  it('hides an enemy beyond torch + darkvision range in a dark room', () => {
    // PC at (0,0) with no darkvision; enemy 9 cells away (45 ft) — past the
    // 40 ft torch dim radius → heavily obscured, token suppressed.
    const { state, seed } = build({
      lighting: 'dark',
      pcPos: { x: 0, y: 0 },
      enemyPos: { x: 9, y: 0 },
    });
    const { container } = render(<GridCombatView state={state} seed={seed} />);
    const label = cell(container, 9, 0).getAttribute('aria-label') ?? '';
    expect(label).not.toMatch(/Goblin/);
    expect(label).toMatch(/heavily obscured/);
  });
});

describe('GridCombatView — cosmetic terrain paint', () => {
  it('tints a cell from the room terrain layer and lists it in the legend', () => {
    // A far, bright, unreachable cell so no dynamic overlay covers the tint.
    const { state, seed } = build({
      lighting: 'bright',
      terrain: [{ pos: { x: 9, y: 9 }, type: 'swamp' }],
      pcPos: { x: 0, y: 0 },
      enemyPos: { x: 1, y: 0 },
    });
    const { container, getByText } = render(<GridCombatView state={state} seed={seed} />);
    expect(cell(container, 9, 9).style.background).toContain('96, 112, 72'); // swamp tint
    expect(getByText('swamp')).toBeTruthy(); // legend entry
  });
});

describe('GridCombatView — battlefield floor texture', () => {
  it('paints the room floor under walkable cells (and a tint composites over it)', () => {
    const { state, seed } = build({
      lighting: 'bright',
      obstacles: [{ x: 8, y: 8 }],
      pcPos: { x: 0, y: 0 },
      enemyPos: { x: 1, y: 0 },
    });
    // Default floor for an authored interior room is cobblestone.
    const { container } = render(<GridCombatView state={state} seed={seed} />);
    expect(cell(container, 9, 9).style.background).toMatch(/\/art\/floors\/cobblestone_[123]\.png/);
    // A wall (obstacle) cell keeps its own look — no floor underneath.
    expect(cell(container, 8, 8).style.background).not.toContain('/art/floors/');
  });

  it("honors the room's authored floor", () => {
    const { state, seed } = build({
      lighting: 'bright',
      pcPos: { x: 0, y: 0 },
      enemyPos: { x: 1, y: 0 },
    });
    (seed.rooms[0] as { floor?: string }).floor = 'grass';
    const { container } = render(<GridCombatView state={state} seed={seed} />);
    expect(cell(container, 9, 9).style.background).toMatch(/\/art\/floors\/grass_[123]\.png/);
  });
});

describe('GridCombatView — enemy token glyphs', () => {
  it('renders the enemy as its family game-icon (Goblin → goblin-head)', () => {
    const { state, seed } = build({
      lighting: 'bright',
      pcPos: { x: 0, y: 5 },
      enemyPos: { x: 6, y: 5 },
    });
    const { container } = render(<GridCombatView state={state} seed={seed} />);
    expect(cell(container, 6, 5).querySelector('.game-icon-goblin-head')).toBeTruthy();
  });

  it('falls back to a generic threat glyph for an unmapped creature name', () => {
    const { state, seed } = build({
      lighting: 'bright',
      pcPos: { x: 0, y: 5 },
      enemyPos: { x: 6, y: 5 },
    });
    // Rename the fixture enemy to something no rule matches.
    for (const list of Object.values(seed.enemies ?? {})) {
      for (const e of list) e.name = 'Gelatinous Cube';
    }
    const { container } = render(<GridCombatView state={state} seed={seed} />);
    expect(cell(container, 6, 5).querySelector('.game-icon-daemon-skull')).toBeTruthy();
  });

  it('keeps the battlefield on screen during the post-combat gate, marked cleared', () => {
    const { state, seed } = build({
      lighting: 'bright',
      pcPos: { x: 0, y: 5 },
      enemyPos: { x: 6, y: 5 },
    });
    const gate = { ...state, combat_active: false, combat_over_pending: true } as GameState;
    const { getByText } = render(<GridCombatView state={gate} seed={seed} />);
    expect(getByText('BATTLEFIELD')).toBeTruthy(); // still rendered
    expect(getByText(/cleared/)).toBeTruthy(); // header reads "cleared", not a move counter
  });

  it('renders nothing once combat is over and the gate is dismissed', () => {
    const { state, seed } = build({
      lighting: 'bright',
      pcPos: { x: 0, y: 5 },
      enemyPos: { x: 6, y: 5 },
    });
    const done = { ...state, combat_active: false, combat_over_pending: false } as GameState;
    const { container } = render(<GridCombatView state={done} seed={seed} />);
    expect(container.firstChild).toBeNull();
  });
});
