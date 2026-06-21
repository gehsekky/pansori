// Act II venue + flavor-site interior rooms. Two kinds, both EMPTY-but-ready
// (D-08): valid tactical grids with entry/exit and lighting, but NO enemies and
// NO NPCs placed — the court/Library/ball NPCs land in Phases 3–4, and the
// undercroft encounter lands in Phase 4.
//   - Capital venue interiors (reached from the district-town venues in
//     townsAct2.ts): the royal court, the Grand Library, the high-society ball,
//     the inn, and the scholars' market. Bright/indoor, small grids, an
//     `ascends: true` exit back to the town.
//   - Heartland flavor-site rooms (reached from regionsAct2.ts `kind:'local'`
//     sites): the kingsroad inn and the hollowing orchard. One room each, with an
//     `ascends: true` exit back to the region.
//
// The Grand Library room (grand_library_room) is the descent anchor (D-09):
// Plan 03 will add a `toRoomId` exit from it down into the Weaver-cell
// undercroft chain. Its grid / entryPos / ascends-exit are authored now so the
// descent has somewhere to hang.
//
// Mechanical-flag-vs-cosmetic-tile rule is load-bearing: passable-but-costly
// cells use the `m:` flag (cover/difficult/…); a cosmetic `t: 'water'` tile is
// IMPASSABLE and would wall the room — never used here. Any flavor object must
// carry an in-bounds pos off the entry/exit cells (the room-object-placement
// spec enforces it).

import type { CampaignRoom } from '../../services/campaignContent.js';

// A w×h grid of empty cells; callers overwrite specific cells for terrain
// (mirrors the rooms.ts factory signature exactly).
const grid = (w: number, h: number) =>
  Array.from({ length: h }, () =>
    Array.from(
      { length: w },
      () => ({}) as { t?: string; m?: 'obstacle' | 'difficult' | 'climb' | 'swim' | 'cover' }
    )
  );

export const ROOMS_ACT2: CampaignRoom[] = [
  // ── Capital venue interiors ────────────────────────────────────────────────
  {
    id: 'valerion_court_room',
    name: 'The Royal Court of Valerion',
    desc:
      'A long throne hall under a vaulted ceiling, banners of Valerion gold ' +
      'falling from the rafters. Ministers murmur in the colonnades; the empty ' +
      'dais waits at the far end.',
    floor: 'cobblestone',
    lighting: 'bright',
    entryPos: { x: 4, y: 7 },
    grid: grid(9, 8),
    exits: [{ pos: { x: 4, y: 7 }, ascends: true, label: 'Out to the Court District' }],
  },
  {
    id: 'valerion_ball_room',
    name: 'The Grand Ballroom',
    desc:
      'A vast ballroom blazing with crystal chandeliers, the polished floor ' +
      'mirroring candlelight. Musicians tune in an alcove; the heartland’s elite ' +
      'will gather here under a fortune in glass.',
    floor: 'cobblestone',
    lighting: 'bright',
    entryPos: { x: 5, y: 8 },
    grid: grid(11, 9),
    exits: [{ pos: { x: 5, y: 8 }, ascends: true, label: 'Out to the Court District' }],
  },
  {
    id: 'valerion_inn_room',
    name: 'The Gilded Lantern',
    desc:
      'A genteel common room with a banked fire, settles of dark oak, and a ' +
      'gleaming brass lantern over the bar. The kind of place where a careful ' +
      'ear catches the capital’s gossip.',
    floor: 'cobblestone',
    lighting: 'bright',
    entryPos: { x: 3, y: 5 },
    grid: grid(7, 6),
    exits: [{ pos: { x: 3, y: 5 }, ascends: true, label: 'Out to the Court District' }],
  },
  {
    id: 'grand_library_room',
    name: "Lady Elara's Grand Library",
    desc:
      'Galleries of vellum rise tier on tier under a great dome, ladders ' +
      'gliding along the stacks. Long decoding-tables fill the floor, lamp-lit ' +
      'and strewn with charts — the heartland’s deepest archive, and the place ' +
      'where the star-metal’s secret will be read.',
    floor: 'cobblestone',
    lighting: 'bright',
    entryPos: { x: 5, y: 9 },
    // The descent anchor (D-09): Plan 03 adds a `toRoomId` exit from here down
    // into the Weaver-cell undercroft. The ascends-exit back to the district
    // stays in place.
    grid: grid(11, 10),
    exits: [{ pos: { x: 5, y: 9 }, ascends: true, label: 'Out to the Library District' }],
  },
  {
    id: 'valerion_market_room',
    name: 'The Scholars’ Market',
    desc:
      'A covered arcade of stalls — booksellers, scribes selling fair copies, ' +
      'curio-traders with maps and oddments. The capital’s scholars haggle ' +
      'between the columns.',
    floor: 'cobblestone',
    lighting: 'bright',
    entryPos: { x: 4, y: 6 },
    grid: grid(8, 7),
    exits: [{ pos: { x: 4, y: 6 }, ascends: true, label: 'Out to the Library District' }],
  },
  // ── Heartland flavor-site rooms ────────────────────────────────────────────
  {
    id: 'kingsroad_inn_room',
    name: 'The Wayfarer’s Rest',
    desc:
      'A low-beamed coaching inn loud with carters and pilgrims, roast turning ' +
      'on the spit and lantern-light spilling across the kingsroad outside. The ' +
      'last comfort before the capital gates.',
    floor: 'cobblestone',
    lighting: 'bright',
    entryPos: { x: 4, y: 6 },
    grid: grid(8, 7),
    exits: [{ pos: { x: 4, y: 6 }, ascends: true, label: 'Back to the kingsroad' }],
  },
  {
    id: 'hollowing_orchard_room',
    name: 'The Hollowing Orchard',
    desc:
      'Rows of old apple trees stand too still in the afternoon light, fruit ' +
      'unpicked and the birdsong gone strangely thin — the first faint wrongness ' +
      'in the heartland’s order.',
    floor: 'dirt',
    lighting: 'dim',
    entryPos: { x: 3, y: 6 },
    grid: grid(8, 7),
    exits: [{ pos: { x: 3, y: 6 }, ascends: true, label: 'Back to the heartland' }],
  },
];
