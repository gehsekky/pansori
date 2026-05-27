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

/**
 * SRD 5.2.1 Vision & Light — whether `pos` is illuminated by any light source
 * on the grid. A source sheds bright light to `light_radius_ft` and dim light
 * for the same distance beyond, so a cell within 2× the bright radius is at
 * least dimly lit. A creature in such a cell can be SEEN even by an observer
 * without darkvision, so the darkness blind-combat penalties don't apply to it.
 * (Obstacles don't yet block light — a refinement.) Returns false when there
 * are no light sources, so darkness reduces to the room-level rule.
 */
export function isIlluminated(pos: GridPos, entities: CombatEntity[]): boolean {
  return entities.some((e) => {
    const r = e.light_radius_ft ?? 0;
    return r > 0 && distanceFeet(e.pos, pos) <= r * 2;
  });
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

// Returns +2 (half) or +5 (three-quarters) cover bonus for the target,
// from a specific attacker's angle. Only cardinals BETWEEN the attacker
// and target count — an obstacle on the far side of the target from the
// attacker doesn't grant cover.
//
// Previously this function ignored attacker position and checked all 4
// cardinals, which silently inflated every attack by +2 when any
// adjacent entity existed (e.g., two enemies spawning side-by-side at
// combat-start placement). After the fix:
//   - Attacker E of target → East cardinal candidate
//   - Attacker NE of target → East + North cardinals
//   - Etc.
// Both candidates blocked = three-quarters cover (corner-pocket).
export function coverBonus(attacker: GridPos, target: GridPos, obstacles: GridPos[]): 0 | 2 | 5 {
  const dx = attacker.x - target.x;
  const dy = attacker.y - target.y;
  if (dx === 0 && dy === 0) return 0;
  // Adjacent source (Chebyshev distance 1, including diagonals): no square
  // lies between it and the target, so RAW grants no cover. SRD 5.2.1: "A
  // target benefits from cover only when an obstacle is between it and the
  // source of the attack." Without this, a melee attacker in a scrum was
  // charged cover for the walls/creatures BESIDE the target (the target's
  // near-side cardinals), silently inflating AC by +2/+5 on adjacent strikes.
  if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) return 0;
  const candidates: GridPos[] = [];
  if (dx > 0) candidates.push({ x: target.x + 1, y: target.y });
  if (dx < 0) candidates.push({ x: target.x - 1, y: target.y });
  if (dy > 0) candidates.push({ x: target.x, y: target.y + 1 });
  if (dy < 0) candidates.push({ x: target.x, y: target.y - 1 });
  const blocked = candidates.filter((c) => obstacles.some((o) => posEqual(o, c))).length;
  if (blocked >= 2) return 5;
  if (blocked >= 1) return 2;
  return 0;
}

// Every grid cell the straight segment from `a` to `b` passes through,
// endpoints included. Supercover walk (steps one axis at a time, n = 1 + dx +
// dy cells), so the returned set is 4-connected and catches every cell the
// line touches — on a perfect diagonal it routes through one shared corner
// cell, the conservative choice for line-of-sight. Used by `hasLineOfSight`.
export function cellsOnLine(a: GridPos, b: GridPos): GridPos[] {
  const cells: GridPos[] = [];
  let x = a.x;
  let y = a.y;
  let dx = Math.abs(b.x - a.x);
  let dy = Math.abs(b.y - a.y);
  const xInc = b.x > a.x ? 1 : -1;
  const yInc = b.y > a.y ? 1 : -1;
  let n = 1 + dx + dy;
  let error = dx - dy;
  dx *= 2;
  dy *= 2;
  for (; n > 0; n--) {
    cells.push({ x, y });
    if (error > 0) {
      x += xInc;
      error -= dy;
    } else {
      y += yInc;
      error += dx;
    }
  }
  return cells;
}

// Line of sight between two squares: true unless a blocking cell (a wall /
// solid obstacle) lies strictly between them. The endpoints never block — the
// source's own square and the target's own square don't obscure the target.
// SRD 5.2.1 "Cover": a creature behind Total Cover can't be targeted directly;
// pass only the solid room obstacles as `blockers` (creatures grant cover but
// aren't total cover, so you can still target past them).
export function hasLineOfSight(a: GridPos, b: GridPos, blockers: GridPos[]): boolean {
  if (posEqual(a, b) || blockers.length === 0) return true;
  const blocked = new Set(blockers.map((p) => `${p.x},${p.y}`));
  for (const cell of cellsOnLine(a, b)) {
    if (posEqual(cell, a) || posEqual(cell, b)) continue;
    if (blocked.has(`${cell.x},${cell.y}`)) return false;
  }
  return true;
}

// Returns true when attacker and ally are on directly opposite squares of
// target's perimeter (DMG 2014 optional flanking rule — grants advantage
// on melee attacks). RAW requires BOTH the attacker and the ally to be
// adjacent to the target, AND on diametrically opposite squares (a line
// through the target separates them). The earlier implementation only
// checked sign opposition on one axis and skipped the adjacency check,
// which silently triggered flanking for almost every multi-PC attack.
export function isFlankingPosition(attacker: GridPos, ally: GridPos, target: GridPos): boolean {
  const ax = attacker.x - target.x;
  const ay = attacker.y - target.y;
  const bx = ally.x - target.x;
  const by = ally.y - target.y;
  // Both must be adjacent to target (Chebyshev distance = 1), neither
  // can be on the target's own square.
  const attackerAdjacent = Math.abs(ax) <= 1 && Math.abs(ay) <= 1 && (ax !== 0 || ay !== 0);
  const allyAdjacent = Math.abs(bx) <= 1 && Math.abs(by) <= 1 && (bx !== 0 || by !== 0);
  if (!attackerAdjacent || !allyAdjacent) return false;
  // Ally's offset is the exact negation of attacker's offset.
  return ax === -bx && ay === -by;
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

// Which entities in `before` were adjacent to `mover` but are no longer
// adjacent after the move? These entities may take opportunity attacks.
//
// `attackerReachFt` (SRD 5.2.1 p.90) lets the caller report each potential
// attacker's weapon reach — Reach weapons (glaive, halberd, pike, whip)
// extend melee threat from 5 ft to 10 ft. Default is 5 ft for any attacker
// without a reach lookup (most enemies don't expose weapon data, so they
// default; PCs can be looked up via their equipped weapon).
export function opportunityAttackTriggers(
  mover: GridPos,
  movedTo: GridPos,
  entities: CombatEntity[],
  moverIsEnemy: boolean,
  attackerReachFt: (e: CombatEntity) => number = () => DEFAULT_MELEE_REACH
): CombatEntity[] {
  const wasAdjacent = (e: CombatEntity) => distanceFeet(e.pos, mover) <= attackerReachFt(e);
  const isAdjacent = (e: CombatEntity) => distanceFeet(e.pos, movedTo) <= attackerReachFt(e);
  return entities.filter((e) => e.isEnemy !== moverIsEnemy && wasAdjacent(e) && !isAdjacent(e));
}
