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
      { id: ROOM, name: 'Room', desc: '', lighting: opts.lighting, obstacles: opts.obstacles },
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
