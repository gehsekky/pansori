// 3-level grid map model — the navigation core. Exercises resolveMarkerMove +
// activeGrid across a fixture campaign: regional → (town site) → town → (venue
// interior) → local room → (exit cell) → next room → ascend → town → (gate) →
// region. Pure-function tests on CampaignData + rooms + GameState.

import type { CampaignData, GameState, Room } from '../../types.js';
import {
  ENCOUNTER_ROOM_ID,
  activeGrid,
  initMapState,
  regionEnterNarration,
  resolveMarkerMove,
  returnFromEncounter,
  stageEncounter,
} from '../../services/mapEngine.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => vi.restoreAllMocks());

const rooms: Room[] = [
  {
    id: 'tavern',
    name: 'The Salt Hog',
    desc: '',
    gridWidth: 6,
    gridHeight: 6,
    entryPos: { x: 0, y: 0 },
    exits: [{ pos: { x: 5, y: 5 }, ascends: true, label: 'Door' }],
  },
  {
    id: 'crypt_entrance',
    name: 'Crypt Entrance',
    desc: '',
    gridWidth: 10,
    gridHeight: 10,
    entryPos: { x: 0, y: 0 },
    exits: [
      {
        pos: { x: 9, y: 9 },
        toRoomId: 'crypt_hall',
        entrancePos: { x: 0, y: 0 },
        label: 'Stairs down',
      },
      { pos: { x: 0, y: 1 }, ascends: true, label: 'Exit to road' },
    ],
  },
  {
    id: 'crypt_hall',
    name: 'Crypt Hall',
    desc: '',
    gridWidth: 10,
    gridHeight: 10,
    entryPos: { x: 0, y: 0 },
    exits: [{ pos: { x: 9, y: 0 }, toRoomId: 'crypt_entrance', entrancePos: { x: 9, y: 9 } }],
  },
];

const campaign: CampaignData = {
  world_name: 'Map Test',
  intro: '',
  rooms,
  regions: [
    {
      id: 'reg1',
      name: 'The Vale',
      feetPerSquare: 5280,
      gridWidth: 12,
      gridHeight: 12,
      startPos: { x: 0, y: 0 },
      sites: [
        { id: 's_town', name: 'Millhaven', pos: { x: 2, y: 0 }, kind: 'town', townId: 'town1' },
        {
          id: 's_crypt',
          name: 'Shattered Crypt',
          pos: { x: 3, y: 0 },
          kind: 'local',
          entryRoomId: 'crypt_entrance',
        },
      ],
    },
  ],
  towns: [
    {
      id: 'town1',
      name: 'Millhaven',
      feetPerSquare: 25,
      gridWidth: 8,
      gridHeight: 8,
      startPos: { x: 0, y: 0 },
      venues: [
        {
          id: 'v_tavern',
          name: 'The Salt Hog',
          pos: { x: 3, y: 3 },
          kind: 'interior',
          entryRoomId: 'tavern',
        },
        { id: 'v_gate', name: 'Town Gate', pos: { x: 1, y: 1 }, kind: 'gate' },
      ],
    },
  ],
};

function start(): GameState {
  return {
    map_level: 'regional',
    current_region_id: 'reg1',
    marker_pos: { x: 0, y: 0 },
    visited_rooms: [],
  } as unknown as GameState;
}

const move = (st: GameState, x: number, y: number) =>
  resolveMarkerMove(campaign, rooms, st, { x, y });

describe('activeGrid', () => {
  it('reports the regional grid scale + sites', () => {
    const g = activeGrid(campaign, rooms, start())!;
    expect(g.level).toBe('regional');
    expect(g.feetPerSquare).toBe(5280);
    expect(g.transitions).toHaveLength(2);
    expect(g.transitions.find((t) => t.toTownId === 'town1')).toBeTruthy();
  });

  it('returns null when not on the new map model', () => {
    expect(activeGrid(campaign, rooms, { visited_rooms: [] } as unknown as GameState)).toBeNull();
  });
});

describe('resolveMarkerMove — descent / room change / ascent', () => {
  it('walks the full nav loop region → town → interior → room → ascend → gate → region', () => {
    let st = start();

    // Region → step onto the town site → enter the town.
    let r = move(st, 2, 0);
    expect(r.transitioned).toBe(true);
    expect(r.squaresMoved).toBe(2);
    st = r.st;
    expect(st.map_level).toBe('town');
    expect(st.current_town_id).toBe('town1');
    expect(st.marker_pos).toEqual({ x: 0, y: 0 }); // town startPos
    expect(st.region_marker_pos).toEqual({ x: 2, y: 0 }); // bookmarked for ascent

    // Town → step onto the tavern venue → enter the local room.
    r = move(st, 3, 3);
    st = r.st;
    expect(st.map_level).toBe('local');
    expect(st.current_room).toBe('tavern');
    expect(st.marker_pos).toEqual({ x: 0, y: 0 }); // tavern entryPos
    expect(st.town_marker_pos).toEqual({ x: 3, y: 3 });
    expect(st.visited_rooms).toContain('tavern');

    // Local → step onto the ascend exit → back to the town (at the bookmarked cell).
    r = move(st, 5, 5);
    st = r.st;
    expect(st.map_level).toBe('town');
    expect(st.marker_pos).toEqual({ x: 3, y: 3 });

    // Town → the gate → back to the region (at the bookmarked site cell).
    r = move(st, 1, 1);
    st = r.st;
    expect(st.map_level).toBe('regional');
    expect(st.current_town_id).toBeUndefined();
    expect(st.marker_pos).toEqual({ x: 2, y: 0 });
  });

  it('region local site → room, then room→room via an exit cell, then ascends to region', () => {
    let st = start();
    let r = move(st, 3, 0); // onto the crypt site
    st = r.st;
    expect(st.map_level).toBe('local');
    expect(st.current_room).toBe('crypt_entrance');
    expect(st.region_marker_pos).toEqual({ x: 3, y: 0 });

    r = move(st, 9, 9); // stairs down → crypt_hall, arriving at its entrancePos
    st = r.st;
    expect(st.current_room).toBe('crypt_hall');
    expect(st.marker_pos).toEqual({ x: 0, y: 0 });

    r = move(st, 9, 0); // back-passage → crypt_entrance at (9,9)
    st = r.st;
    expect(st.current_room).toBe('crypt_entrance');
    expect(st.marker_pos).toEqual({ x: 9, y: 9 });

    r = move(st, 0, 1); // ascend exit → region (no town, so straight to region)
    st = r.st;
    expect(st.map_level).toBe('regional');
    expect(st.marker_pos).toEqual({ x: 3, y: 0 });
  });

  it('one click spends at most an hour: the march halts where the hour runs out', () => {
    // 4 diagonal squares at Normal pace = 80 min — the 4th square would bust
    // the 60-minute travel turn, so the marker halts 3 squares along.
    const r = move(start(), 4, 4);
    expect(r.transitioned).toBe(false);
    expect(r.st.marker_pos).toEqual({ x: 3, y: 3 });
    expect(r.squaresMoved).toBe(3);
    expect(r.elapsedHours).toBeCloseTo(1, 5);
    expect(r.st.world_minute).toBe(60);
    expect(r.narrative).toContain("The hour's march covers 3 miles");
    // The next click finishes the leg.
    const r2 = move(r.st, 4, 4);
    expect(r2.st.marker_pos).toEqual({ x: 4, y: 4 });
    expect(r2.st.world_minute).toBe(80);
  });

  it('a fast pace covers 4 squares in the hour; a slow pace only 2', () => {
    const fast = resolveMarkerMove(
      campaign,
      rooms,
      { ...start(), travel_pace: 'fast' },
      { x: 6, y: 0 }
    );
    expect(fast.st.marker_pos).toEqual({ x: 4, y: 0 }); // 4 mi/hr
    expect(fast.st.world_minute).toBe(60);
    const slow = resolveMarkerMove(
      campaign,
      rooms,
      { ...start(), travel_pace: 'slow' },
      { x: 6, y: 0 }
    );
    expect(slow.st.marker_pos).toEqual({ x: 2, y: 0 }); // 2 mi/hr
    expect(slow.st.world_minute).toBe(60);
  });

  it('rejects an off-map destination', () => {
    expect(move(start(), 99, 99).rejected).toBeTruthy();
  });

  it('re-enters a transition the marker is already standing on (no travel)', () => {
    // Park the marker ON the town site, then "move" onto it again → re-enter.
    const onSite = { ...start(), marker_pos: { x: 2, y: 0 } } as GameState;
    const r = move(onSite, 2, 0);
    expect(r.rejected).toBeUndefined();
    expect(r.transitioned).toBe(true);
    expect(r.st.map_level).toBe('town');
    expect(r.st.current_town_id).toBe('town1');
    expect(r.squaresMoved).toBe(0); // stood still
    expect(r.elapsedHours).toBe(0); // no travel time
  });

  it('still rejects a same-cell move on a plain (non-transition) cell', () => {
    const here = { ...start(), marker_pos: { x: 4, y: 4 } } as GameState;
    expect(move(here, 4, 4).rejected).toBe('Already there.');
  });
});

describe('initMapState', () => {
  it('starts the party on the regional grid for a region campaign', () => {
    const st = initMapState(campaign, { visited_rooms: [] } as unknown as GameState);
    expect(st.map_level).toBe('regional');
    expect(st.current_region_id).toBe('reg1');
    expect(st.marker_pos).toEqual({ x: 0, y: 0 });
    // Game start counts as entering the starting region — recorded so the
    // regionEnter hook stays first-entry-only once region travel exists.
    expect(st.visited_regions).toEqual(['reg1']);
  });

  it('is a no-op without regions or when map state is already set', () => {
    expect(initMapState({ world_name: '', intro: '', rooms: [] }, start()).map_level).toBe(
      'regional'
    );
    const already = initMapState(campaign, { ...start(), map_level: 'town' } as GameState);
    expect(already.map_level).toBe('town'); // untouched
  });
});

describe('narration hooks', () => {
  it('regionEnterNarration: onFirstEnter ?? onEnter ?? desc, neither → empty', () => {
    const withAll: CampaignData = {
      ...campaign,
      regions: [
        {
          ...campaign.regions![0],
          desc: 'A vale of mists.',
          onEnter: 'The mists part.',
          onFirstEnter: 'For the first time, the vale opens before you.',
        },
      ],
    };
    // Game start is a first entry — the FIRST variant wins.
    expect(regionEnterNarration(withAll, 'reg1')).toBe(
      '\n\nFor the first time, the vale opens before you.'
    );
    const withHooks: CampaignData = {
      ...campaign,
      regions: [{ ...campaign.regions![0], desc: 'A vale of mists.', onEnter: 'The mists part.' }],
    };
    expect(regionEnterNarration(withHooks, 'reg1')).toBe('\n\nThe mists part.');
    const descOnly: CampaignData = {
      ...campaign,
      regions: [{ ...campaign.regions![0], desc: 'A vale of mists.' }],
    };
    expect(regionEnterNarration(descOnly, 'reg1')).toBe('\n\nA vale of mists.');
    expect(regionEnterNarration(campaign, 'reg1')).toBe(''); // fixture has neither
    expect(regionEnterNarration(campaign, 'nope')).toBe('');
    expect(regionEnterNarration(undefined, 'reg1')).toBe('');
  });

  it('town level hooks: FIRST overrides plain on first entry; gate exit fires town exit', () => {
    const hooked: CampaignData = {
      ...campaign,
      towns: [
        {
          ...campaign.towns![0],
          onEnter: 'The mill wheel creaks.',
          onFirstEnter: 'Millhaven, at last.',
          onExit: 'The gate thuds shut.',
          onFirstExit: 'You leave Millhaven for the first time.',
        },
      ],
    };
    // First entry → onFirstEnter.
    let r = resolveMarkerMove(hooked, rooms, start(), { x: 2, y: 0 });
    expect(r.narrative).toContain('You enter Millhaven. Millhaven, at last.');
    expect(r.st.visited_towns).toEqual(['town1']);
    // Gate ascend → FIRST exit text; the exit is recorded.
    r = resolveMarkerMove(hooked, rooms, r.st, { x: 1, y: 1 });
    expect(r.narrative).toContain('You leave Millhaven for the first time.');
    expect(r.narrative).toContain('You return to The Vale.');
    expect(r.st.exited_towns).toEqual(['town1']);
    // Re-enter + re-exit → the plain variants.
    r = resolveMarkerMove(hooked, rooms, r.st, { x: 2, y: 0 });
    expect(r.narrative).toContain('You enter Millhaven. The mill wheel creaks.');
    r = resolveMarkerMove(hooked, rooms, r.st, { x: 1, y: 1 });
    expect(r.narrative).toContain('The gate thuds shut.');
  });

  it('room level hooks fire on enter/exit; town scope survives a venue visit', () => {
    const hooked: CampaignData = { ...campaign };
    const hookedRooms = rooms.map((rm) =>
      rm.id === 'tavern'
        ? {
            ...rm,
            onEnter: 'Sawdust and spilled ale.',
            onFirstEnter: 'The Salt Hog, in the flesh.',
            onExit: 'The din fades behind you.',
            onFirstExit: 'First time stepping OUT of the Hog sober.',
          }
        : rm
    );
    const st = start();
    let r = resolveMarkerMove(hooked, hookedRooms, st, { x: 2, y: 0 }); // → town
    r = resolveMarkerMove(hooked, hookedRooms, r.st, { x: 3, y: 3 }); // → tavern (first)
    expect(r.narrative).toContain('You enter The Salt Hog. The Salt Hog, in the flesh.');
    // Ascend back to the town: room FIRST exit fires; the town is NOT
    // re-entered (it never left scope).
    r = resolveMarkerMove(hooked, hookedRooms, r.st, { x: 5, y: 5 });
    expect(r.narrative).toContain('First time stepping OUT of the Hog sober.');
    expect(r.narrative).toContain('You return to Millhaven.');
    expect(r.narrative).not.toContain('mill wheel');
    expect(r.st.exited_rooms).toEqual(['tavern']);
    // Second visit → plain variants both ways.
    r = resolveMarkerMove(hooked, hookedRooms, r.st, { x: 3, y: 3 });
    expect(r.narrative).toContain('You enter The Salt Hog. Sawdust and spilled ale.');
    r = resolveMarkerMove(hooked, hookedRooms, r.st, { x: 5, y: 5 });
    expect(r.narrative).toContain('The din fades behind you.');
  });

  it('room→room passage fires the old room exit and the new room enter', () => {
    const hookedRooms = rooms.map((rm) =>
      rm.id === 'crypt_entrance'
        ? { ...rm, onExit: 'The doorway breathes cold at your back.' }
        : rm.id === 'crypt_hall'
          ? { ...rm, onFirstEnter: 'Bones. Bones everywhere.' }
          : rm
    );
    let r = resolveMarkerMove(campaign, hookedRooms, start(), { x: 3, y: 0 }); // → crypt
    r = resolveMarkerMove(campaign, hookedRooms, r.st, { x: 9, y: 9 }); // → hall
    expect(r.narrative).toContain('The doorway breathes cold at your back.');
    expect(r.narrative).toContain('You pass into Crypt Hall. Bones. Bones everywhere.');
    expect(r.st.exited_rooms).toEqual(['crypt_entrance']);
  });

  it('ascending from a dungeon room to the region fires the room exit hook', () => {
    const hookedRooms = rooms.map((rm) =>
      rm.id === 'crypt_entrance' ? { ...rm, onExit: 'Daylight, finally.' } : rm
    );
    let r = resolveMarkerMove(campaign, hookedRooms, start(), { x: 3, y: 0 });
    r = resolveMarkerMove(campaign, hookedRooms, r.st, { x: 0, y: 1 }); // ascend exit
    expect(r.narrative).toContain('Daylight, finally.');
    expect(r.narrative).toContain('You return to The Vale.');
  });

  it('a site onEnter hook follows the announcement on town descend', () => {
    const hooked: CampaignData = {
      ...campaign,
      regions: [
        {
          ...campaign.regions![0],
          sites: campaign.regions![0].sites.map((s) =>
            s.id === 's_town' ? { ...s, onEnter: 'Smoke curls from the mill chimneys.' } : s
          ),
        },
      ],
    };
    const r = resolveMarkerMove(hooked, rooms, start(), { x: 2, y: 0 });
    expect(r.transitioned).toBe(true);
    expect(r.narrative).toContain('You enter Millhaven. Smoke curls from the mill chimneys.');
  });

  it('a site onEnter hook follows the announcement on local descend, every landing', () => {
    const hooked: CampaignData = {
      ...campaign,
      regions: [
        {
          ...campaign.regions![0],
          sites: campaign.regions![0].sites.map((s) =>
            s.id === 's_crypt' ? { ...s, onEnter: 'Cold air breathes up from the dark.' } : s
          ),
        },
      ],
    };
    let r = resolveMarkerMove(hooked, rooms, start(), { x: 3, y: 0 });
    expect(r.narrative).toContain('You enter Crypt Entrance. Cold air breathes up from the dark.');
    // Leave and land again — the hook fires every time.
    r = resolveMarkerMove(hooked, rooms, r.st, { x: 0, y: 1 }); // ascend
    r = resolveMarkerMove(hooked, rooms, r.st, { x: 3, y: 0 }); // re-enter
    expect(r.narrative).toContain('Cold air breathes up from the dark.');
  });

  it('unhooked transitions keep the bare announcement', () => {
    const r = resolveMarkerMove(campaign, rooms, start(), { x: 2, y: 0 });
    expect(r.narrative).toContain('You enter Millhaven.');
    expect(r.narrative.trim().endsWith('Millhaven.')).toBe(true);
  });
});

describe('region-to-region travel (region gates)', () => {
  // Two regions joined by a pass: reg1 gains a gate to reg2 (explicit entry
  // cell) and reg2 a gate back (default arrival = reg1.startPos).
  const twoRegions: CampaignData = {
    ...campaign,
    regions: [
      {
        ...campaign.regions![0],
        onExit: 'The vale road bends behind you.',
        onFirstExit: 'For the first time, you leave the vale.',
        onEnter: 'Vale air again — pine and millsmoke.',
        sites: [
          ...campaign.regions![0].sites,
          {
            id: 's_pass',
            name: 'The North Pass',
            pos: { x: 11, y: 0 },
            kind: 'region',
            regionId: 'reg2',
            entryPos: { x: 1, y: 7 },
            onEnter: 'Wind screams between the cliff walls.',
          },
        ],
      },
      {
        id: 'reg2',
        name: 'The Frost Reach',
        desc: 'White hills under a low sun.',
        onFirstEnter: 'The Frost Reach opens before you, blinding white.',
        onEnter: 'Snow again.',
        feetPerSquare: 5280,
        gridWidth: 8,
        gridHeight: 8,
        startPos: { x: 4, y: 4 },
        sites: [
          {
            id: 's_pass_south',
            name: 'The Pass South',
            pos: { x: 1, y: 7 },
            kind: 'region',
            regionId: 'reg1',
          },
        ],
      },
    ],
  };
  const cross = (st: GameState, x: number, y: number) =>
    resolveMarkerMove(twoRegions, rooms, st, { x, y });

  it('first crossing: exit FIRST hook, site hook, target first-enter chain, state swap', () => {
    const st = { ...start(), marker_pos: { x: 9, y: 0 }, visited_regions: ['reg1'] };
    const r = cross(st, 11, 0);
    expect(r.rejected).toBeUndefined();
    expect(r.st.current_region_id).toBe('reg2');
    expect(r.st.map_level).toBe('regional');
    expect(r.st.marker_pos).toEqual({ x: 1, y: 7 }); // the authored entry cell
    expect(r.st.visited_regions).toEqual(['reg1', 'reg2']);
    expect(r.st.exited_regions).toEqual(['reg1']);
    // Exit FIRST overrides plain; the site hook follows the announcement;
    // reg2's first entry uses onFirstEnter (?? onEnter ?? desc).
    expect(r.narrative).toContain('For the first time, you leave the vale.');
    expect(r.narrative).not.toContain('The vale road bends');
    expect(r.narrative).toContain('You cross into The Frost Reach.');
    expect(r.narrative).toContain('Wind screams between the cliff walls.');
    expect(r.narrative).toContain('The Frost Reach opens before you, blinding white.');
  });

  it('re-crossing plays the plain hooks; return arrives at startPos by default', () => {
    // Both regions already visited/exited — every hook drops to its plain form.
    let st: GameState = {
      ...start(),
      marker_pos: { x: 9, y: 0 },
      visited_regions: ['reg1', 'reg2'],
      exited_regions: ['reg1', 'reg2'],
    };
    const out = cross(st, 11, 0);
    expect(out.narrative).toContain('The vale road bends behind you.');
    expect(out.narrative).toContain('Snow again.');
    expect(out.narrative).not.toContain('blinding white');
    st = out.st;
    // Back through the south pass: no entryPos → reg1.startPos.
    const back = cross(st, 1, 7);
    expect(back.st.current_region_id).toBe('reg1');
    expect(back.st.marker_pos).toEqual({ x: 0, y: 0 });
    expect(back.narrative).toContain('Vale air again — pine and millsmoke.');
  });
});

describe('SRD travel pace (set_pace + perception effects)', () => {
  it('set_pace stores the stance and narrates it', async () => {
    const { takeAction } = await import('../../services/gameEngine.js');
    const { makeState } = await import('../../test-fixtures.js');
    const { context: sandbox } = await import('../fixtures/testContext.js');
    const st = {
      ...makeState({ id: 'pc-1' }, {}),
      map_level: 'regional' as const,
      current_region_id: 'reg1',
      marker_pos: { x: 0, y: 0 },
    };
    const seed = {
      context_id: sandbox.id,
      world_name: 'x',
      ship_name: 'x',
      intro: '',
      seed_id: 'pace',
      rooms: [],
      enemies: {},
      loot: {},
      npcs: {},
    } as never;
    const r = await takeAction({
      action: { type: 'set_pace', pace: 'fast' },
      history: [],
      state: st,
      seed,
      context: sandbox,
    });
    expect(r.newState.travel_pace).toBe('fast');
    expect(r.narrative).toContain('fast pace');
  });

  it('pacePerceptionMod: fast −5 / slow +5 swings passive trap detection', async () => {
    const { pacePerceptionMod, partyDetectsTrap } = await import('../../services/gameEngine.js');
    const chars = [
      { dead: false, wis: 14, level: 1, skill_proficiencies: ['Perception'] },
    ] as never[];
    // Passive Perception 10 + 2 (WIS) + 2 (prof) = 14.
    const trap = { dc: 14 } as never;
    expect(partyDetectsTrap(chars as never, trap, 0)).toBe(true);
    expect(partyDetectsTrap(chars as never, trap, -5)).toBe(false); // fast pace
    expect(partyDetectsTrap(chars as never, { dc: 19 } as never, 5)).toBe(true); // slow pace
    expect(pacePerceptionMod({ travel_pace: 'fast' } as never)).toBe(-5);
    expect(pacePerceptionMod({ travel_pace: 'slow' } as never)).toBe(5);
    expect(pacePerceptionMod({} as never)).toBe(0);
  });
});

describe('regional encounters', () => {
  const encounterCampaign: CampaignData = {
    world_name: 'Enc',
    intro: '',
    rooms,
    regions: [
      {
        id: 'reg1',
        name: 'Wilds',
        feetPerSquare: 5280,
        gridWidth: 12,
        gridHeight: 12,
        startPos: { x: 0, y: 0 },
        sites: [{ id: 's', name: 'Keep', pos: { x: 3, y: 0 }, kind: 'town', townId: 'town1' }],
        encounterTable: ['Bandit Ruffian'],
        encounterChance: 1, // always triggers in the test
      },
    ],
    towns: campaign.towns,
  };

  it('rolls a per-square encounter that interrupts travel (suppressing the transition)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // < chance → encounter; index 0 → Bandit Ruffian
    const st = {
      map_level: 'regional',
      current_region_id: 'reg1',
      marker_pos: { x: 0, y: 0 },
      visited_rooms: [],
    } as unknown as GameState;
    const r = resolveMarkerMove(encounterCampaign, rooms, st, { x: 3, y: 0 }); // would enter the town
    expect(r.encounter).toBe('Bandit Ruffian');
    expect(r.transitioned).toBe(false); // interrupted en route — didn't enter the town
    expect(r.st.map_level).toBe('regional');
  });

  it('stage → return round-trips the party back to the travelling cell', () => {
    const travelling = {
      map_level: 'regional',
      current_region_id: 'reg1',
      marker_pos: { x: 4, y: 2 },
      visited_rooms: [],
    } as unknown as GameState;

    // Drop off the map into the transient encounter room.
    const staged = stageEncounter(travelling);
    expect(staged.map_level).toBe('local');
    expect(staged.current_room).toBe(ENCOUNTER_ROOM_ID);
    expect(staged.encounter_return).toEqual({
      level: 'regional',
      region_id: 'reg1',
      town_id: undefined,
      pos: { x: 4, y: 2 },
    });

    // Combat collapses → march back to the exact cell we were travelling on.
    const back = returnFromEncounter(staged);
    expect(back.map_level).toBe('regional');
    expect(back.current_region_id).toBe('reg1');
    expect(back.marker_pos).toEqual({ x: 4, y: 2 });
    expect(back.current_room).toBe('');
    expect(back.encounter_return).toBeUndefined();
  });

  it('returnFromEncounter is a no-op when not returning from an encounter', () => {
    const st = start();
    expect(returnFromEncounter(st)).toBe(st);
  });

  it('no encounter when the chance roll misses', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999); // ≥ chance(1)? no — but use a 0-chance check
    const noChance: CampaignData = {
      ...encounterCampaign,
      regions: [{ ...encounterCampaign.regions![0], encounterChance: 0 }],
    };
    const st = {
      map_level: 'regional',
      current_region_id: 'reg1',
      marker_pos: { x: 0, y: 0 },
      visited_rooms: [],
    } as unknown as GameState;
    const r = resolveMarkerMove(noChance, rooms, st, { x: 3, y: 0 });
    expect(r.encounter).toBeUndefined();
    expect(r.transitioned).toBe(true); // reached + entered the town
  });
});

describe('typed overland terrain (unified model)', () => {
  const terrainCampaign: CampaignData = {
    world_name: 'Terr',
    intro: '',
    rooms,
    regions: [
      {
        id: 'reg1',
        name: 'Wilds',
        feetPerSquare: 5280,
        gridWidth: 10,
        gridHeight: 10,
        startPos: { x: 0, y: 0 },
        sites: [],
        encounterTable: ['Bandit Ruffian'],
        encounterChance: 0.5,
        terrain: [
          { pos: { x: 2, y: 0 }, type: 'mountain' }, // impassable
          { pos: { x: 0, y: 1 }, type: 'road' }, // quick + safe
          { pos: { x: 0, y: 2 }, type: 'road' },
          { pos: { x: 0, y: 3 }, type: 'forest' }, // slow + dangerous
        ],
      },
    ],
  };
  const stAt = (x: number, y: number): GameState =>
    ({
      map_level: 'regional',
      current_region_id: 'reg1',
      marker_pos: { x, y },
      visited_rooms: [],
    }) as unknown as GameState;

  it('folds impassable terrain into obstacles + carries the terrain array', () => {
    const g = activeGrid(terrainCampaign, rooms, stAt(0, 0))!;
    expect(g.terrain).toHaveLength(4);
    expect(g.obstacles).toContainEqual({ x: 2, y: 0 }); // mountain blocks pathing
    expect(g.obstacles).not.toContainEqual({ x: 0, y: 1 }); // road is passable
  });

  it('rejects moving onto an impassable (mountain) cell', () => {
    expect(
      resolveMarkerMove(terrainCampaign, rooms, stAt(0, 0), { x: 2, y: 0 }).rejected
    ).toBeTruthy();
  });

  it('roads halve travel time; forest doubles it', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999); // no encounter
    // (0,1)+(0,2) both road (×0.5) ⇒ 1.0 weighted square ÷ 3 mi/hr.
    expect(
      resolveMarkerMove(terrainCampaign, rooms, stAt(0, 0), { x: 0, y: 2 }).elapsedHours
    ).toBeCloseTo(1 / 3, 5);
    // road + road + forest (0.5+0.5+2 = 3 weighted) ÷ 3 = 1.0 hr.
    expect(
      resolveMarkerMove(terrainCampaign, rooms, stAt(0, 0), { x: 0, y: 3 }).elapsedHours
    ).toBeCloseTo(1, 5);
  });

  it('keeps a site reachable even when impassable terrain is painted on its cell', () => {
    const overlap: CampaignData = {
      world_name: 'Overlap',
      intro: '',
      rooms,
      regions: [
        {
          id: 'reg1',
          name: 'Wilds',
          feetPerSquare: 5280,
          gridWidth: 10,
          gridHeight: 10,
          startPos: { x: 0, y: 0 },
          sites: [
            { id: 's', name: 'Pinegate', pos: { x: 1, y: 0 }, kind: 'town', townId: 'town1' },
          ],
          terrain: [{ pos: { x: 1, y: 0 }, type: 'water' }], // painted on the site cell
        },
      ],
      towns: campaign.towns,
    };
    // The site cell is NOT folded into obstacles despite the impassable paint…
    expect(activeGrid(overlap, rooms, stAt(0, 0))!.obstacles).not.toContainEqual({ x: 1, y: 0 });
    // …so the party can still travel to it (entering the town).
    expect(resolveMarkerMove(overlap, rooms, stAt(0, 0), { x: 1, y: 0 }).rejected).toBeUndefined();
  });

  it('roads are the safest terrain but not immune; forest is more dangerous', () => {
    // chance 0.5: road ×0.5 ⇒ 0.25 effective; forest ×2.5 ⇒ ≥1 effective.
    // A high roll (0.4) clears the low road threshold — an all-road trip is safe…
    vi.spyOn(Math, 'random').mockReturnValue(0.4);
    expect(
      resolveMarkerMove(terrainCampaign, rooms, stAt(0, 0), { x: 0, y: 2 }).encounter
    ).toBeUndefined();
    // …but a low roll (0.1 < 0.25) can still trigger on a road — roads aren't safe.
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
    expect(resolveMarkerMove(terrainCampaign, rooms, stAt(0, 0), { x: 0, y: 2 }).encounter).toBe(
      'Bandit Ruffian'
    );
    // Forest: road squares (0.25) miss at 0.6 but the forest cell hits.
    vi.spyOn(Math, 'random').mockReturnValue(0.6);
    expect(resolveMarkerMove(terrainCampaign, rooms, stAt(0, 0), { x: 0, y: 3 }).encounter).toBe(
      'Bandit Ruffian'
    );
  });
});
