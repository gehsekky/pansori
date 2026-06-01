import type { GameState, GridPos } from '../../types.js';
import { abilityMod, rollDice } from '../rulesEngine.js';
import type { ActionHandler } from './types.js';
import { effectiveSpeed } from '../gameEngine.js';

/**
 * SRD 5.2.1 Mounted Combat.
 *
 *  - `mount`: during your move, climb onto a willing creature within 5 ft.
 *    Costs half your Speed (round down). The mount becomes a controlled mount
 *    (shares your space + your turn — see `runEnemyTurns`'s rider-skip and
 *    `grid_move`'s mounted movement).
 *  - `dismount`: get off the mount you're riding. Also costs half your Speed;
 *    the mount steps into an adjacent square.
 *  - `checkMountFallOff`: the DC 10 DEX "falling off" save — run when a rider
 *    or their mount is knocked Prone (or the mount is force-moved). On a
 *    failure the rider falls off, landing Prone, and the pair is unbound.
 */

const within5ft = (a: GridPos, b: GridPos): boolean =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) <= 1;

const mountCost = (speedFt: number): number => Math.floor(speedFt / 2);

/** First grid square adjacent to `from` not occupied by a living entity. */
function freeAdjacentCell(st: GameState, from: GridPos, gridW: number, gridH: number): GridPos {
  const occupied = (st.entities ?? []).filter((e) => e.hp > 0).map((e) => e.pos);
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ]) {
    const cell = { x: from.x + dx, y: from.y + dy };
    if (cell.x < 0 || cell.y < 0 || cell.x >= gridW || cell.y >= gridH) continue;
    if (occupied.some((p) => p.x === cell.x && p.y === cell.y)) continue;
    return cell;
  }
  return from; // hemmed in — share the rider's square rather than vanish
}

export const handleMount: ActionHandler<{ type: 'mount'; mountId: string }> = (ctx, action) => {
  if (ctx.actor.kind !== 'pc') return { rejected: 'Only the party can mount.' };
  const { char } = ctx.actor;
  if (!ctx.st.entities) {
    ctx.narrative = 'You can only mount during combat.';
    return;
  }
  const riderEnt = ctx.st.entities.find((e) => e.id === char.id);
  if (!riderEnt) {
    ctx.narrative = 'Your character is not on the grid.';
    return;
  }
  if (riderEnt.mount_id) {
    ctx.narrative = 'You are already mounted — dismount first.';
    return;
  }
  const mountEnt = ctx.st.entities.find((e) => e.id === action.mountId);
  if (!mountEnt || mountEnt.isEnemy || mountEnt.hp <= 0) {
    ctx.narrative = 'There is no willing mount there.';
    return;
  }
  if (mountEnt.rider_id) {
    ctx.narrative = `${mountEnt.companionName ?? 'That mount'} already carries a rider.`;
    return;
  }
  if (!within5ft(riderEnt.pos, mountEnt.pos)) {
    ctx.narrative = `${mountEnt.companionName ?? 'The mount'} is too far away — get within 5 feet first.`;
    return;
  }
  // Mounting costs half your Speed of movement (SRD).
  const cost = mountCost(effectiveSpeed(char, ctx.context.lootTable));
  const usedFt = ctx.st.movement_used?.[char.id] ?? 0;
  const speedFt = effectiveSpeed(char, ctx.context.lootTable);
  if (usedFt + cost > speedFt) {
    ctx.narrative = `Not enough movement to mount. (${speedFt - usedFt} ft left, ${cost} ft needed)`;
    return;
  }
  ctx.st = {
    ...ctx.st,
    entities: ctx.st.entities.map((e) => {
      if (e.id === char.id) return { ...e, mount_id: mountEnt.id };
      // The mount shares the rider's square and binds back to the rider.
      if (e.id === mountEnt.id) return { ...e, rider_id: char.id, pos: riderEnt.pos };
      return e;
    }),
    movement_used: { ...ctx.st.movement_used, [char.id]: usedFt + cost },
  };
  ctx.narrative = `${char.name} swings up onto ${mountEnt.companionName ?? 'the mount'}. (${cost} ft of movement)`;
};

export const handleDismount: ActionHandler<{ type: 'dismount' }> = (ctx) => {
  if (ctx.actor.kind !== 'pc') return { rejected: 'Only the party can dismount.' };
  const { char } = ctx.actor;
  if (!ctx.st.entities) {
    ctx.narrative = 'You can only dismount during combat.';
    return;
  }
  const riderEnt = ctx.st.entities.find((e) => e.id === char.id);
  if (!riderEnt?.mount_id) {
    ctx.narrative = 'You are not mounted.';
    return;
  }
  const mountEnt = ctx.st.entities.find((e) => e.id === riderEnt.mount_id);
  const cost = mountCost(effectiveSpeed(char, ctx.context.lootTable));
  const usedFt = ctx.st.movement_used?.[char.id] ?? 0;
  const speedFt = effectiveSpeed(char, ctx.context.lootTable);
  if (usedFt + cost > speedFt) {
    ctx.narrative = `Not enough movement to dismount. (${speedFt - usedFt} ft left, ${cost} ft needed)`;
    return;
  }
  const gridW = ctx.context.gridWidth ?? 10;
  const gridH = ctx.context.gridHeight ?? 10;
  // The mount steps aside into an open square; the rider keeps the space.
  const mountCell = freeAdjacentCell(ctx.st, riderEnt.pos, gridW, gridH);
  ctx.st = {
    ...ctx.st,
    entities: ctx.st.entities.map((e) => {
      if (e.id === char.id) return { ...e, mount_id: undefined };
      if (e.id === mountEnt?.id) return { ...e, rider_id: undefined, pos: mountCell };
      return e;
    }),
    movement_used: { ...ctx.st.movement_used, [char.id]: usedFt + cost },
  };
  ctx.narrative = `${char.name} drops down from ${mountEnt?.companionName ?? 'the mount'}. (${cost} ft of movement)`;
};

/**
 * SRD "Falling Off" — when a rider or their mount is knocked Prone (or the
 * mount is force-moved against its will), the rider makes a DC 10 DEX save or
 * falls off, landing Prone in a space within 5 ft of the mount. Pass the id of
 * the entity that was just affected (the rider OR the mount); resolves the
 * rider's save and unbinds the pair on a failure. No-op when the affected
 * entity isn't part of a mounted pair. Returns the updated state + a narrative
 * fragment (empty when nothing happened).
 */
export function checkMountFallOff(
  st: GameState,
  affectedId: string
): { st: GameState; narrative: string } {
  const ents = st.entities ?? [];
  const affected = ents.find((e) => e.id === affectedId);
  if (!affected) return { st, narrative: '' };
  // Resolve which entity is the rider: the affected one is either the rider
  // (carries mount_id) or the mount (carries rider_id).
  const riderId = affected.mount_id ? affected.id : affected.rider_id;
  if (!riderId) return { st, narrative: '' };
  const riderEnt = ents.find((e) => e.id === riderId);
  const mountEnt = ents.find((e) => e.id === riderEnt?.mount_id);
  if (!riderEnt || !mountEnt) return { st, narrative: '' };
  const riderChar = st.characters.find((c) => c.id === riderId);
  const dexMod = riderChar ? abilityMod(riderChar.dex) : 0;
  const roll = rollDice('1d20') + dexMod;
  const riderName = riderChar?.name ?? riderEnt.companionName ?? 'The rider';
  if (roll >= 10) {
    return {
      st,
      narrative: ` ${riderName} keeps their seat (DEX ${roll} vs DC 10).`,
    };
  }
  // Failed — the rider falls off, landing Prone, and the pair is unbound.
  const nextSt: GameState = {
    ...st,
    entities: ents.map((e) => {
      if (e.id === riderId) {
        return {
          ...e,
          mount_id: undefined,
          conditions: [...e.conditions.filter((c) => c !== 'prone'), 'prone'],
        };
      }
      if (e.id === mountEnt.id) return { ...e, rider_id: undefined };
      return e;
    }),
    characters: st.characters.map((c) =>
      c.id === riderId
        ? { ...c, conditions: [...c.conditions.filter((cc) => cc !== 'prone'), 'prone'] }
        : c
    ),
  };
  return {
    st: nextSt,
    narrative: ` ${riderName} fails to hold on (DEX ${roll} vs DC 10) and falls from the saddle, landing prone!`,
  };
}
