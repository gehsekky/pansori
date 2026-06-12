// Shared combat-grid preview math — used by BOTH the 2D GridCombatView and the
// 3D Combat3DView so their overlays can't drift. Mirrors the backend geometry
// (entitiesInCone/Cube/Line/Blast in gridEngine.ts) so previews are RAW-accurate.

import type { GridPos } from '../types';

export const SQUARE_SIZE_FT = 5;

export function chebyshev(a: GridPos, b: GridPos): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

export interface AoePreview {
  shape: 'sphere' | 'cone' | 'cube' | 'line';
  radiusFt: number;
  targetEnemyId?: string;
  rangeKind?: 'self' | 'touch' | 'ranged';
}

/**
 * The set of "x,y" cells a hovered AoE spell would cover, anchored on the
 * caster (self shapes) or the hovered target (epicenter). Exact port of the
 * per-shape math that lived in GridCombatView.
 */
export function computeAoeCells(
  preview: AoePreview,
  casterPos: GridPos,
  epicenter: GridPos,
  gridWidth: number,
  gridHeight: number
): Set<string> {
  const sq = Math.floor(preview.radiusFt / SQUARE_SIZE_FT);
  const cells = new Set<string>();
  switch (preview.shape) {
    case 'sphere':
      for (let dx = -sq; dx <= sq; dx++) {
        for (let dy = -sq; dy <= sq; dy++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) > sq) continue;
          cells.add(`${epicenter.x + dx},${epicenter.y + dy}`);
        }
      }
      break;
    case 'cone': {
      const dx = Math.sign(epicenter.x - casterPos.x);
      const dy = Math.sign(epicenter.y - casterPos.y);
      if (dx === 0 && dy === 0) break;
      for (let cx = 0; cx < gridWidth; cx++) {
        for (let cy = 0; cy < gridHeight; cy++) {
          const rx = cx - casterPos.x;
          const ry = cy - casterPos.y;
          const along = rx * dx + ry * dy;
          if (along <= 0 || along > sq) continue;
          const perp =
            dx !== 0 && dy !== 0 ? Math.abs(rx * dy - ry * dx) / 2 : Math.abs(rx * dy - ry * dx);
          if (perp <= along) cells.add(`${cx},${cy}`);
        }
      }
      break;
    }
    case 'cube': {
      const dx = Math.sign(epicenter.x - casterPos.x);
      const dy = Math.sign(epicenter.y - casterPos.y);
      const side = sq;
      const minX =
        dx >= 0 ? casterPos.x + (dx === 0 ? -Math.floor(side / 2) : 1) : casterPos.x - side;
      const maxX = minX + side - 1;
      const minY =
        dy >= 0 ? casterPos.y + (dy === 0 ? -Math.floor(side / 2) : 1) : casterPos.y - side;
      const maxY = minY + side - 1;
      for (let cx = minX; cx <= maxX; cx++)
        for (let cy = minY; cy <= maxY; cy++) cells.add(`${cx},${cy}`);
      break;
    }
    case 'line': {
      const dx = Math.sign(epicenter.x - casterPos.x);
      const dy = Math.sign(epicenter.y - casterPos.y);
      if (dx === 0 && dy === 0) break;
      for (let i = 1; i <= sq; i++) {
        cells.add(`${casterPos.x + dx * i},${casterPos.y + dy * i}`);
      }
      break;
    }
  }
  return cells;
}

/**
 * Disambiguated display names for same-name enemies ("Bandit #1/#2"), matching
 * the labels the attack choices use.
 */
export function enemyDisplayNames(
  entities: Array<{ id: string; isEnemy: boolean }>,
  nameOf: (id: string) => string | undefined
): (id: string) => string {
  const map = new Map<string, string>();
  const byName: Record<string, string[]> = {};
  for (const e of entities) {
    if (!e.isEnemy) continue;
    const name = nameOf(e.id) ?? 'Enemy';
    (byName[name] ??= []).push(e.id);
  }
  for (const [name, ids] of Object.entries(byName)) {
    if (ids.length === 1) map.set(ids[0], name);
    else ids.forEach((id, i) => map.set(id, `${name} #${i + 1}`));
  }
  return (id: string) => map.get(id) ?? nameOf(id) ?? 'Enemy';
}

/**
 * Cells that cost TWO squares for this mover: difficult terrain, plus climb /
 * swim cells the character has no matching speed for. Mirrors the engine's
 * grid_move pricing (actions/gridMove.ts) — non-stacking, and the Thief's
 * Second-Story Work (L3) waives climb cost like a real climb speed does.
 */
export function doubledCellsFor(
  room:
    | { difficultTerrain?: GridPos[]; climbTerrain?: GridPos[]; swimTerrain?: GridPos[] }
    | undefined,
  char:
    | { climb_speed_ft?: number; swim_speed_ft?: number; subclass?: string; level?: number }
    | undefined
): Set<string> {
  const out = new Set<string>((room?.difficultTerrain ?? []).map((p) => `${p.x},${p.y}`));
  const climbOk =
    (char?.climb_speed_ft ?? 0) > 0 || (char?.subclass === 'thief' && (char?.level ?? 0) >= 3);
  const swimOk = (char?.swim_speed_ft ?? 0) > 0;
  if (!climbOk) for (const p of room?.climbTerrain ?? []) out.add(`${p.x},${p.y}`);
  if (!swimOk) for (const p of room?.swimTerrain ?? []) out.add(`${p.x},${p.y}`);
  return out;
}

/**
 * Per-cell movement cost (in squares) mirroring the engine EXACTLY: the
 * engine prices the shortest-HOP path that gridEngine.findPath's BFS returns
 * — NOT the cheapest path — so this walks the same BFS in the same neighbor
 * order (tie-breaking must match) and accrues each entered cell at one
 * square, two on `doubled` cells. A cell only reachable through doubled
 * cells can therefore legitimately cost more than its Chebyshev distance,
 * which is exactly when the old distance-only highlight lied.
 *
 * Not modeled (the engine has them; mismatch is rare and read-only): flying
 * movement and active wall-spell cells.
 */
export function movementCosts(opts: {
  from: GridPos;
  gridWidth: number;
  gridHeight: number;
  /** Path-blocking cells: living entities (minus the mover) + obstacles. */
  blocked: ReadonlySet<string>;
  /** Cells costing 2 squares for this mover (see doubledCellsFor). */
  doubled: ReadonlySet<string>;
  /** Expansion stops once a cell's cost reaches this budget. */
  maxSquares: number;
}): Map<string, number> {
  const { from, gridWidth, gridHeight, blocked, doubled, maxSquares } = opts;
  const costs = new Map<string, number>([[`${from.x},${from.y}`, 0]]);
  const queue: GridPos[] = [from];
  while (queue.length) {
    const cur = queue.shift()!;
    const curCost = costs.get(`${cur.x},${cur.y}`)!;
    // gridEngine.adjacentPositions order — dx outer −1..1, dy inner −1..1.
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue;
        const x = cur.x + dx;
        const y = cur.y + dy;
        if (x < 0 || x >= gridWidth || y < 0 || y >= gridHeight) continue;
        const key = `${x},${y}`;
        if (costs.has(key) || blocked.has(key)) continue;
        const cost = curCost + (doubled.has(key) ? 2 : 1);
        // First visit wins (the BFS hop-tree cost, like the engine) — record
        // it even when over budget so a longer-hop-but-cheaper path can't
        // sneak in a cost the engine would never charge.
        costs.set(key, cost);
        if (cost < maxSquares) queue.push({ x, y });
      }
    }
  }
  return costs;
}
