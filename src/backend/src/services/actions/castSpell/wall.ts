// RE-4 — wall/terrain spells as transient grid blockers.
//
// Wall of Fire (SRD): "The wall is opaque." It blocks line of sight but not
// movement — RAW a creature can enter it (taking damage). pansori places the
// wall as a barrier centred on the target, perpendicular to the caster→target
// approach, so the caster can still see/strike the target it was aimed at while
// sightlines that continue past the target are blocked. The wall is owned by
// the caster's concentration and removed by `breakConcentration` when that
// concentration ends.

import type { GridPos, Spell, SpellWall } from '../../../types.js';
import type { ActionContext } from '../types.js';
import { concentrationRoundsFor } from './utils.js';
import { randomUUID } from 'crypto';
import { runAoeSpell } from './aoe.js';
import { updatePcActor } from '../actor.js';

// Cells for a wall centred on `target`, perpendicular to the caster→target
// axis, `lengthFt` long, clipped to the grid. Keeping the target at the centre
// leaves the caster→target line open (the target is the sightline's endpoint)
// while blocking lines that continue past it.
function perpendicularWallCells(
  caster: GridPos,
  target: GridPos,
  lengthFt: number,
  gridW: number,
  gridH: number
): GridPos[] {
  const sx = Math.sign(target.x - caster.x);
  const sy = Math.sign(target.y - caster.y);
  // Rotate the approach 90°: a cardinal approach yields a wall along the other
  // axis; a diagonal approach yields the anti-diagonal.
  let px: number;
  let py: number;
  if (sx !== 0 && sy !== 0) {
    px = sx;
    py = -sy;
  } else if (sx !== 0) {
    px = 0;
    py = 1;
  } else {
    px = 1;
    py = 0;
  }
  const half = Math.floor(Math.max(1, Math.round(lengthFt / 5)) / 2);
  const cells: GridPos[] = [];
  for (let k = -half; k <= half; k++) {
    const x = target.x + px * k;
    const y = target.y + py * k;
    if (x >= 0 && x < gridW && y >= 0 && y < gridH) cells.push({ x, y });
  }
  return cells;
}

// Resolve Wall of Fire: deal the line damage via the AoE path, then raise the
// opaque wall and bind it to the caster's concentration. Returns true when it
// owned resolution (always, when grid entities exist).
export function runWallOfFire(
  ctx: ActionContext,
  spell: Spell,
  slotLevel: number,
  dc: number,
  spellDmg: number,
  targetId: string
): boolean {
  if (ctx.actor.kind !== 'pc' || !ctx.st.entities) return false;
  const pc = ctx.actor;
  const casterEnt = ctx.st.entities.find((e) => e.id === pc.char.id);
  const targetEnt = ctx.st.entities.find((e) => e.id === targetId && e.isEnemy);
  if (!casterEnt || !targetEnt) return false;

  // Line damage first (same path every other AoE-line spell uses).
  runAoeSpell(ctx, spell, slotLevel, dc, spellDmg);

  const gridW = ctx.context.gridWidth ?? 8;
  const gridH = ctx.context.gridHeight ?? 8;
  const cells = perpendicularWallCells(
    casterEnt.pos,
    targetEnt.pos,
    spell.blastRadius ?? 60,
    gridW,
    gridH
  );
  // Wall of Fire is a Concentration spell, but its damage path doesn't stamp
  // concentration — set it here so the wall's lifetime tracks it.
  updatePcActor(ctx, {
    concentrating_on: { spellId: spell.id, rounds_left: concentrationRoundsFor(spell) },
  });
  const wall: SpellWall = {
    id: randomUUID(),
    casterId: pc.char.id,
    spellId: spell.id,
    name: spell.name,
    roomId: ctx.st.current_room,
    cells,
    blocksMovement: false, // RAW: a creature can enter it (taking damage)
    blocksLineOfSight: true, // "The wall is opaque"
  };
  ctx.st = { ...ctx.st, spell_walls: [...(ctx.st.spell_walls ?? []), wall] };
  ctx.usedInitiative = true;
  return true;
}
