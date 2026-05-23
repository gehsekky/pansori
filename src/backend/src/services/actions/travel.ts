import type { ActionHandler } from './types.js';
import { buildArrivalNarrative } from '../gameEngine.js';

/**
 * `travel`: cross-location movement (campaign overworld). Blocked
 * while a hostile is in the current room. Advances world_day. Rolls
 * an encounter check against the destination's encounter table — on
 * hit, splices a new enemy into the current room via a seed mutation
 * (the only case in the engine that reassigns `ctx.seed`). Sets
 * `current_location_id`, clears district + grid entities, and lands
 * the party at the destination's centralRoomId.
 */
export const handleTravel: ActionHandler<{ type: 'travel'; locationId: string }> = (
  ctx,
  action
) => {
  const destLocation = ctx.context.campaign?.locations?.find((l) => l.id === action.locationId);
  if (!destLocation) {
    ctx.narrative = 'Unknown destination.';
    return;
  }
  if (ctx.enemyAlive) {
    ctx.narrative = 'A hostile is in the room — you cannot travel away until the room is clear.';
    return;
  }

  let encounterNote = '';
  if (
    destLocation.encounterTable?.length &&
    destLocation.encounterChance &&
    Math.random() < destLocation.encounterChance
  ) {
    const pick2 = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];
    const templateKey = pick2(destLocation.encounterTable);
    const tpl = ctx.context.enemyTemplates.find((t) => t.name === templateKey);
    if (tpl) {
      const newEnemyId = `${ctx.roomId}#enc${Date.now()}`;
      ctx.seed = {
        ...ctx.seed,
        enemies: {
          ...ctx.seed.enemies,
          [ctx.roomId]: [
            ...(ctx.seed.enemies?.[ctx.roomId] ?? []),
            {
              id: newEnemyId,
              name: tpl.name,
              hp: tpl.hp,
              ac: tpl.ac,
              damage: tpl.damage,
              toHit: tpl.toHit,
              xp: tpl.xp,
            },
          ],
        },
      };
      encounterNote = ` A ${tpl.name} bars your path!`;
    }
  }

  const destRoomId = destLocation.centralRoomId ?? ctx.st.current_room;
  ctx.st = {
    ...ctx.st,
    current_location_id: action.locationId,
    current_district_id: undefined,
    current_room: destRoomId,
    world_day: (ctx.st.world_day ?? 1) + 1,
    entities: undefined,
    movement_used: undefined,
  };
  // Append the standard arrival narrative (room desc + enemies-here +
  // loot-here + exits) so players see what's at the destination. Before
  // this fix the player just saw "You travel to X." with no room
  // context — enemies in the destination room were silently present.
  // The encounter-splice line (see `encounterNote` above) reads as a
  // separate hostile-spawn flag; the arrival narrative then lists
  // every hostile present in the room, including the spliced one.
  ctx.narrative =
    `You travel to ${destLocation.name}.${encounterNote} ` +
    buildArrivalNarrative(destRoomId, ctx.st, ctx.seed, ctx.context);
  ctx.usedInitiative = false;
};

/**
 * `enter_district`: in-location movement (town districts). Moves the
 * party into the district's room (so room-scoped NPCs/objects no
 * longer leak from the previous district) and appends the standard
 * arrival narrative tail (enemies, loot, exits).
 */
export const handleEnterDistrict: ActionHandler<{
  type: 'enter_district';
  districtId: string;
}> = (ctx, action) => {
  const currentLoc = ctx.context.campaign?.locations?.find(
    (l) => l.id === ctx.st.current_location_id
  );
  const district = currentLoc?.districts?.find((d) => d.id === action.districtId);
  if (!district) {
    ctx.narrative = 'Unknown district.';
    return;
  }
  const newRoomId = district.roomId;
  ctx.st = {
    ...ctx.st,
    current_district_id: action.districtId,
    current_room: newRoomId,
    visited_rooms: ctx.st.visited_rooms.includes(newRoomId)
      ? ctx.st.visited_rooms
      : [...ctx.st.visited_rooms, newRoomId],
  };
  ctx.narrative =
    `You enter the ${district.name}. ${district.desc}` +
    ' ' +
    buildArrivalNarrative(newRoomId, ctx.st, ctx.seed, ctx.context);
  ctx.usedInitiative = false;
};
