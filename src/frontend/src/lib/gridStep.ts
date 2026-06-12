// Grid-stepped first-person movement math for the 3D crawler view
// (Room3DView). Pure helpers, no three.js — the camera work consumes these.
//
// Conventions: grid x grows east, grid y grows south (same as the 2D map).
// World mapping is x→x, y→z, so heading North means decreasing grid y.
// A camera with rotation.y = 0 looks down -z (north); +yaw turns counter-
// clockwise, so East (+x) is yaw -π/2 — i.e. yaw = -heading * π/2.

import type { GridPos } from '../types';

export type Heading = 0 | 1 | 2 | 3; // N, E, S, W

export const HEADING_LABEL: Record<Heading, string> = { 0: 'N', 1: 'E', 2: 'S', 3: 'W' };

const DELTA: Record<Heading, GridPos> = {
  0: { x: 0, y: -1 }, // north
  1: { x: 1, y: 0 }, // east
  2: { x: 0, y: 1 }, // south
  3: { x: -1, y: 0 }, // west
};

export type StepMove = 'forward' | 'back' | 'left' | 'right';

export function turn(h: Heading, dir: 'left' | 'right'): Heading {
  return ((h + (dir === 'right' ? 1 : 3)) % 4) as Heading;
}

/** The world-relative heading a facing-relative move resolves to. */
export function moveHeading(heading: Heading, move: StepMove): Heading {
  switch (move) {
    case 'forward':
      return heading;
    case 'back':
      return turn(turn(heading, 'right'), 'right');
    case 'left':
      return turn(heading, 'left');
    case 'right':
      return turn(heading, 'right');
  }
}

/** The cell one step from `from`, moving `move` relative to `heading`. */
export function stepTarget(from: GridPos, heading: Heading, move: StepMove): GridPos {
  const d = DELTA[moveHeading(heading, move)];
  return { x: from.x + d.x, y: from.y + d.y };
}

/** Out of bounds or an obstacle cell (impassable terrain is folded into obstacles). */
export function isBlocked(
  grid: { width: number; height: number; obstacles: GridPos[] },
  to: GridPos
): boolean {
  if (to.x < 0 || to.y < 0 || to.x >= grid.width || to.y >= grid.height) return true;
  return grid.obstacles.some((o) => o.x === to.x && o.y === to.y);
}

/** Camera yaw (radians) for a heading — see the convention note above. */
export function yawForHeading(h: Heading): number {
  return (-h * Math.PI) / 2;
}

/**
 * A sensible spawn facing: look toward the room's center along the dominant
 * axis, so entering from a south doorway faces north into the room (not the
 * wall at your back).
 */
export function initialHeading(pos: GridPos, grid: { width: number; height: number }): Heading {
  const dx = (grid.width - 1) / 2 - pos.x;
  const dy = (grid.height - 1) / 2 - pos.y;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 1 : 3;
  return dy > 0 ? 2 : 0;
}
