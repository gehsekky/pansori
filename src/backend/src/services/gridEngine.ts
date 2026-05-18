import type { CombatEntity, GridPos, LootItem } from '../types.js';

export const SQUARE_SIZE = 5; // feet per square
export const DEFAULT_MELEE_REACH = SQUARE_SIZE;
export const DEFAULT_RANGED_RANGE = 150;
export const DEFAULT_SPEED_FEET = 30;

// Chebyshev distance — 5e diagonal rule (diagonals cost 1 square)
export function chebyshev(a: GridPos, b: GridPos): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

export function distanceFeet(a: GridPos, b: GridPos): number {
  return chebyshev(a, b) * SQUARE_SIZE;
}

export function adjacentPositions(pos: GridPos): GridPos[] {
  const out: GridPos[] = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      if (dx !== 0 || dy !== 0) out.push({ x: pos.x + dx, y: pos.y + dy });
    }
  }
  return out;
}

export function posEqual(a: GridPos, b: GridPos): boolean {
  return a.x === b.x && a.y === b.y;
}

// True if attacker can reach target given the equipped weapon.
// Thrown melee weapons (weapon.thrown) extend reach to their long range.
// Reach weapons (SRD 5.2.1 p.90: glaive, halberd, etc.) get +5 ft melee.
export function inRange(
  attacker: GridPos,
  target: GridPos,
  weapon: Pick<LootItem, 'range' | 'thrown' | 'reach'> | null
): boolean {
  const dist = distanceFeet(attacker, target);
  if (weapon?.range === 'ranged') return dist <= DEFAULT_RANGED_RANGE;
  if (weapon?.thrown) return dist <= weapon.thrown.longRange;
  const reachFt = weapon?.reach ? DEFAULT_MELEE_REACH + SQUARE_SIZE : DEFAULT_MELEE_REACH;
  return dist <= reachFt;
}

// Returns +2 (half) or +5 (three-quarters) cover bonus for the target.
// Counts how many of the target's 4 cardinal neighbours are occupied by obstacles.
export function coverBonus(_attacker: GridPos, target: GridPos, obstacles: GridPos[]): 0 | 2 | 5 {
  const cardinals = [
    { x: target.x - 1, y: target.y },
    { x: target.x + 1, y: target.y },
    { x: target.x, y: target.y - 1 },
    { x: target.x, y: target.y + 1 },
  ];
  const blocked = cardinals.filter((c) => obstacles.some((o) => posEqual(o, c))).length;
  if (blocked >= 3) return 5;
  if (blocked >= 1) return 2;
  return 0;
}

// Returns true when attacker and ally are on strictly opposite sides of target
// (PHB optional flanking rule — grants advantage on melee attacks).
export function isFlankingPosition(attacker: GridPos, ally: GridPos, target: GridPos): boolean {
  const ax = attacker.x - target.x;
  const ay = attacker.y - target.y;
  const bx = ally.x - target.x;
  const by = ally.y - target.y;
  // Opposite sides: one has positive, the other negative delta on at least one axis
  return (
    (Math.sign(ax) === -Math.sign(bx) && bx !== 0) || (Math.sign(ay) === -Math.sign(by) && by !== 0)
  );
}

// All entities within blastRadius feet of epicenter
export function entitiesInBlast(
  epicenter: GridPos,
  blastRadius: number,
  entities: CombatEntity[]
): CombatEntity[] {
  return entities.filter((e) => distanceFeet(epicenter, e.pos) <= blastRadius);
}

// Entities in a cone of given length (feet), originating from caster pointing
// toward target. The cone widens at 45° per side from caster. SRD 5.2.1 p.193:
// "A cone's width at a given point equals the distance from the point of origin".
export function entitiesInCone(
  caster: GridPos,
  toward: GridPos,
  lengthFt: number,
  entities: CombatEntity[]
): CombatEntity[] {
  const lengthSq = Math.floor(lengthFt / SQUARE_SIZE);
  const dx = Math.sign(toward.x - caster.x);
  const dy = Math.sign(toward.y - caster.y);
  if (dx === 0 && dy === 0) return [];
  return entities.filter((e) => {
    // Project the entity position onto the cone axis. The cone is symmetric
    // about the caster→toward direction; distance along that direction must
    // be ≤ length, and perpendicular distance must be ≤ along-axis distance.
    const rx = e.pos.x - caster.x;
    const ry = e.pos.y - caster.y;
    // Same-direction component (positive if entity is in the cone's half-plane)
    const along = rx * dx + ry * dy;
    if (along <= 0 || along > lengthSq) return false;
    // Perpendicular component magnitude (with diagonal direction we treat
    // perp ≤ along for a 45° spread).
    const perp =
      dx !== 0 && dy !== 0 ? Math.abs(rx * dy - ry * dx) / 2 : Math.abs(rx * dy - ry * dx);
    return perp <= along;
  });
}

// Entities in a cube of given side length emanating from caster toward target.
// The cube has its near face adjacent to caster; the entire 3D cube is modelled
// as a 2D square on the grid for simplicity.
export function entitiesInCube(
  caster: GridPos,
  toward: GridPos,
  sideFt: number,
  entities: CombatEntity[]
): CombatEntity[] {
  const side = Math.floor(sideFt / SQUARE_SIZE);
  // Determine cube's anchor: the square adjacent to caster in the toward direction
  const dx = Math.sign(toward.x - caster.x);
  const dy = Math.sign(toward.y - caster.y);
  // Position the cube so it spans `side` squares in caster's facing direction,
  // and is centred perpendicular to that direction.
  const minX = dx >= 0 ? caster.x + (dx === 0 ? -Math.floor(side / 2) : 1) : caster.x - side;
  const maxX = minX + side - 1;
  const minY = dy >= 0 ? caster.y + (dy === 0 ? -Math.floor(side / 2) : 1) : caster.y - side;
  const maxY = minY + side - 1;
  return entities.filter(
    (e) => e.pos.x >= minX && e.pos.x <= maxX && e.pos.y >= minY && e.pos.y <= maxY
  );
}

// Entities along a line of given length, 5-ft wide, from caster toward target.
export function entitiesInLine(
  caster: GridPos,
  toward: GridPos,
  lengthFt: number,
  entities: CombatEntity[]
): CombatEntity[] {
  const length = Math.floor(lengthFt / SQUARE_SIZE);
  const dx = Math.sign(toward.x - caster.x);
  const dy = Math.sign(toward.y - caster.y);
  if (dx === 0 && dy === 0) return [];
  const linePositions: GridPos[] = [];
  for (let i = 1; i <= length; i++) {
    linePositions.push({ x: caster.x + dx * i, y: caster.y + dy * i });
  }
  return entities.filter((e) => linePositions.some((p) => posEqual(p, e.pos)));
}

// BFS pathfinding on a gridW × gridH grid, avoiding blocked squares
// Returns the sequence of squares to move through (not including `from`),
// or null if no path exists.
export function findPath(
  from: GridPos,
  to: GridPos,
  blocked: GridPos[],
  gridW: number,
  gridH: number
): GridPos[] | null {
  if (posEqual(from, to)) return [];

  const key = (p: GridPos) => `${p.x},${p.y}`;
  const isBlocked = new Set(blocked.map(key));
  const inBounds = (p: GridPos) => p.x >= 0 && p.x < gridW && p.y >= 0 && p.y < gridH;

  const visited = new Map<string, GridPos | null>();
  visited.set(key(from), null);
  const queue: GridPos[] = [from];

  while (queue.length) {
    const curr = queue.shift()!;
    for (const nb of adjacentPositions(curr)) {
      const k = key(nb);
      if (!inBounds(nb) || isBlocked.has(k) || visited.has(k)) continue;
      visited.set(k, curr);
      if (posEqual(nb, to)) {
        // Reconstruct path
        const path: GridPos[] = [];
        let step: GridPos | null = nb;
        while (step && !posEqual(step, from)) {
          path.unshift(step);
          step = visited.get(key(step)) ?? null;
        }
        return path;
      }
      queue.push(nb);
    }
  }
  return null;
}

// Movement cost in feet for a path (each step = SQUARE_SIZE feet)
export function pathCostFeet(path: GridPos[]): number {
  return path.length * SQUARE_SIZE;
}

// Which entities in `before` were adjacent to `mover` but are no longer adjacent after the move?
// These entities may take opportunity attacks.
export function opportunityAttackTriggers(
  mover: GridPos,
  movedTo: GridPos,
  entities: CombatEntity[],
  moverIsEnemy: boolean
): CombatEntity[] {
  const wasAdjacent = (e: CombatEntity) => distanceFeet(e.pos, mover) <= DEFAULT_MELEE_REACH;
  const isAdjacent = (e: CombatEntity) => distanceFeet(e.pos, movedTo) <= DEFAULT_MELEE_REACH;
  // Only opposite-side entities that were adjacent and are now not adjacent trigger
  return entities.filter((e) => e.isEnemy !== moverIsEnemy && wasAdjacent(e) && !isAdjacent(e));
}
