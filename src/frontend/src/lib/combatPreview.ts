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
