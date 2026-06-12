// Deterministic grid spots for room objects authored WITHOUT a position.
//
// The classic 2D UI surfaces "Search the X" choices regardless of placement,
// so authors never needed to place objects — but the 3D room renders objects
// as PHYSICAL interactables, and an unplaced object simply didn't exist there
// (the Brine Barrels bug, 2026-06-13). Authored positions always win; the
// rest spread across free wall-adjacent cells first (furniture reads best
// against a wall), then the interior, skipping occupied cells. Pure and
// deterministic: the same room yields the same spots in the game's 3D view
// and the creator's preview.

import type { GridPos } from '../types';

export function placeRoomObjects(
  objects: ReadonlyArray<{ id: string; pos?: GridPos }>,
  roomW: number,
  roomH: number,
  /** `x,y` cells already taken (entry, exits, npcs, loot, obstacles). */
  occupied: ReadonlySet<string>
): Map<string, GridPos> {
  const out = new Map<string, GridPos>();
  if (roomW < 1 || roomH < 1) return out;
  const taken = new Set(occupied);
  for (const o of objects) if (o.pos) taken.add(`${o.pos.x},${o.pos.y}`);

  // Candidate order: the perimeter ring (top L→R, right T→B, bottom R→L,
  // left B→T), then interior rows.
  const candidates: GridPos[] = [];
  for (let x = 0; x < roomW; x++) candidates.push({ x, y: 0 });
  for (let y = 1; y < roomH; y++) candidates.push({ x: roomW - 1, y });
  if (roomH > 1) for (let x = roomW - 2; x >= 0; x--) candidates.push({ x, y: roomH - 1 });
  if (roomW > 1) for (let y = roomH - 2; y >= 1; y--) candidates.push({ x: 0, y });
  for (let y = 1; y < roomH - 1; y++) {
    for (let x = 1; x < roomW - 1; x++) candidates.push({ x, y });
  }
  const free = candidates.filter((c) => !taken.has(`${c.x},${c.y}`));

  const unplaced = objects.filter((o) => !o.pos);
  unplaced.forEach((o, i) => {
    if (free.length === 0) return;
    // Spread along the candidate list instead of clustering at its head.
    const at = Math.min(free.length - 1, Math.floor(((i + 0.5) * free.length) / unplaced.length));
    const [cell] = free.splice(at, 1);
    out.set(o.id, cell);
  });
  return out;
}
