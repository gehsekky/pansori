// Regression spec for the "travel narrative omits room contents" bug
// surfaced in the Whispering Pines log: user traveled to The Frozen
// Pass, a Frost Wolf was hostile in the destination room, but the
// arrival narrative was only "You travel to The Frozen Pass." —
// no "Hostile here: Frost Wolf" line, no exits, no room desc.
//
// Cause: handleTravel emitted only the bare destination name, never
// calling buildArrivalNarrative. (handleEnterDistrict already did it
// correctly.)
//
// Fix: handleTravel now appends buildArrivalNarrative output to the
// travel narrative, same shape as enter_district.

import type { Context, GameState } from '../../types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeChar, makeState } from '../../test-fixtures.js';
import { takeAction } from '../gameEngine.js';

afterEach(() => vi.restoreAllMocks());

// Minimal campaign context: two locations (start + dest), dest has a
// hostile enemy in its central room.
const destLocId = 'loc_dest';
const destRoomId = 'room_dest';
const startRoomId = 'room_start';
const enemyId = `${destRoomId}#0`;

// Minimal Context — only the fields handleTravel + buildArrivalNarrative
// actually read. Cast through unknown so the structural check doesn't
// require every Context field on the test fixture.
const campaignCtx = {
  id: 'travel-test',
  startRoomId,
  escapeRoomId: 'room_escape',
  mapType: 'campaign',
  gridWidth: 8,
  gridHeight: 8,
  roomPool: [],
  enemyTemplates: [],
  lootTable: [],
  npcTemplates: [],
  narratives: {
    combatStart: ['Combat begins!'],
    enemyDeflected: ['{armor} deflects the blow.'],
    killShot: ['{enemy} falls. +{xp} XP.'],
    noEnemy: ['No enemy here.'],
    roomArrival: {},
    genericArrival: ['You arrive at the destination.'],
  } as Context['narratives'],
  classFeatures: {},
  classPrimaryStats: { Fighter: 'str' } as Context['classPrimaryStats'],
  classSkills: { Fighter: [] } as Context['classSkills'],
  spellTable: {},
  featTable: {},
  campaign: {
    world_name: 'Travel Test World',
    intro: '',
    locations: [
      {
        id: 'loc_start',
        name: 'Start Town',
        centralRoomId: startRoomId,
        rooms: [{ id: startRoomId, name: 'Start', desc: 'A starting hub.' }],
        connections: { [startRoomId]: [] },
      },
      {
        id: destLocId,
        name: 'Frozen Pass',
        centralRoomId: destRoomId,
        encounterChance: 0, // disable random encounter splice
        encounterTable: [],
        rooms: [
          {
            id: destRoomId,
            name: 'Frozen Pass',
            desc: 'Hoarfrost glitters on the boulders.',
          },
        ],
        connections: { [destRoomId]: [] },
      },
    ],
    enemies: {
      [destRoomId]: [
        {
          id: enemyId,
          name: 'Frost Wolf',
          hp: 22,
          ac: 13,
          damage: '2d4+2',
          toHit: 4,
          xp: 50,
        },
      ],
    },
    loot: {},
    npcs: {},
    rooms: [
      { id: startRoomId, name: 'Start', desc: 'A starting hub.' },
      {
        id: destRoomId,
        name: 'Frozen Pass',
        desc: 'Hoarfrost glitters on the boulders.',
      },
    ],
    connections: { [startRoomId]: [], [destRoomId]: [] },
  },
} as unknown as Context;

function freshState(pc: ReturnType<typeof makeChar>): GameState {
  return {
    ...makeState({ id: pc.id }, { current_room: startRoomId, combat_active: false }),
    characters: [pc],
    active_character_id: pc.id,
    current_location_id: 'loc_start',
  };
}

describe('handleTravel — arrival narrative regression', () => {
  it('travel narrative includes the hostile listing for the destination room', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const pc = makeChar({ id: 'pc-1', character_class: 'Fighter', level: 3 });
    const result = await takeAction({
      action: { type: 'travel', locationId: destLocId },
      history: [],
      state: freshState(pc),
      seed: {
        context_id: campaignCtx.id,
        world_name: 'Travel Test World',
        ship_name: 'Travel Test World',
        intro: '',
        seed_id: 'travel-test',
        rooms: campaignCtx.campaign?.rooms ?? [],
        connections: campaignCtx.campaign?.connections ?? {},
        enemies: campaignCtx.campaign?.enemies ?? {},
        loot: {},
        npcs: {},
      },
      context: campaignCtx,
    });
    // The travel narrative should both:
    //   - announce the destination ("You travel to Frozen Pass.")
    //   - list the hostile present in the room
    expect(result.narrative).toMatch(/travel to Frozen Pass/i);
    expect(result.narrative).toMatch(/frost wolf/i);
  });
});
