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

import { ELARA, QUENTIN, VANE_ACT2 } from './npcsAct2.js';
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

// An undercroft grid: empty, with a regular scatter of pillars for a caster-
// heavy fight (D-07). Pillars use the MECHANICAL `m: 'cover'` flag — they grant
// half/three-quarters cover but are PASSABLE, so the room never strands a cell
// (the load-bearing rooms.ts terrain rule: a cosmetic impassable `t:` tile would
// wall the room; `m:` flags never do). Deterministic: a pillar every 3rd column
// on the interior even rows, away from the grid edges so entry/exit lanes stay
// clear. (mirrors the marshGrid scatter idiom in rooms.ts L31-41)
function undercroftGrid(w: number, h: number) {
  const g = grid(w, h);
  for (let y = 2; y < h - 1; y += 2) {
    for (let x = 2; x < w - 1; x += 3) {
      g[y][x] = { t: 'rubble', m: 'cover' }; // a fallen-stone pillar: cover, passable
    }
  }
  return g;
}

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
    // The court-arrival friction tableau (D-07): the duo presented to a hall
    // that has already decided what it thinks of them.
    onEnter: [
      'The herald’s call dies into a silence that is not quite respect. The ' +
        'ministers in the colonnades turn as one to watch you cross the long ' +
        'Valerion floor — frontier law come to a court that measures everything ' +
        'by its lineage and finds you wanting. Lucian Vane waits at the foot of ' +
        'the dais with the patience of a man who expects to win, and somewhere ' +
        'off to the side a young Vance is already smiling at a joke you have not ' +
        'yet heard. Whatever the Gavel sent you to find, you will have to find it ' +
        'here, among people who would rather you did not.',
    ],
    npcs: [
      { ...VANE_ACT2, pos: { x: 3, y: 1 } },
      { ...QUENTIN, pos: { x: 6, y: 1 } },
    ],
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
    // The decode mood: the long lamp-lit table where Mythic Geometry gets solved.
    onEnter: [
      'The Grand Library swallows the city’s noise whole. Galleries of vellum ' +
        'climb tier on tier into the dome, and at the long decoding-table in the ' +
        'center a grey-eyed woman is already watching you come — Lady Elara ' +
        'Aurellion, who reads the things the court would rather stayed buried.',
    ],
    // The descent anchor (D-09): a `toRoomId` exit leads down a hidden stair into
    // the Weaver-cell undercroft (NOT an `ascends`/`descends` flag — it returns
    // to a specific room). The ascends-exit back to the district stays in place.
    grid: grid(11, 10),
    exits: [
      { pos: { x: 5, y: 9 }, ascends: true, label: 'Out to the Library District' },
      {
        pos: { x: 0, y: 0 },
        toRoomId: 'library_undercroft_approach',
        label: 'Down the hidden stair, into the undercroft',
      },
    ],
    // Lady Elara at the central decoding-table (D-11) — slice-2 anchor. Placed at
    // an upper-central cell, in-bounds on the 11×10 grid, off the entry (5,9) and
    // off the descent-exit (0,0) (Pitfall 4). The descent exits above are kept
    // intact — slice 2 must not break Phase 2's undercroft chain.
    npcs: [{ ...ELARA, pos: { x: 5, y: 2 } }],
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

  // ── Weaver-cell undercroft: the fuel-cell raid chain ───────────────────────
  // A three-room catacomb chain beneath the Grand Library (D-06/D-07), reached by
  // the descent exit on grand_library_room above (D-09). Dim/dark interior floor
  // with pillar cover for a caster-heavy fight. EMPTY-but-ready (D-08): valid
  // grid/entryPos/exits/lighting but NO `enemies` and NO `npcs` — Phase 4 places
  // the q_fuel_cell encounter (the Weaver Adepts/Magus from monstersAct2.ts).
  // The chain links approach ↔ inner ↔ core; the approach room's "go back up"
  // exit is a `toRoomId` back to grand_library_room (NOT `ascends`, since it
  // returns to a specific room, D-09).
  {
    id: 'library_undercroft_approach',
    name: 'The Undercroft Stair',
    desc:
      'The hidden stair lets out into a low vaulted gallery of damp grey stone, ' +
      'older than the Library above it. Broken pillars march into the gloom, and ' +
      'somewhere ahead a faint, rhythmic hum carries on the still air — the ' +
      'Weaver-cell at its work.',
    floor: 'cobblestone',
    lighting: 'dim',
    entryPos: { x: 4, y: 8 },
    grid: undercroftGrid(9, 9),
    exits: [
      {
        pos: { x: 4, y: 0 },
        toRoomId: 'library_undercroft_inner',
        label: 'Deeper into the undercroft',
      },
      {
        pos: { x: 4, y: 8 },
        toRoomId: 'grand_library_room',
        label: 'Back up the stair to the Library',
      },
    ],
    // The raid's opening pressure (D-04): a Subverted Sentry watch at the
    // stair-foot. The clear rule (rulesAct2 fuel_cell_approach_clear) keys on the
    // two named sentries; a third unnamed sentry adds body to the line without
    // gating the clear (RESEARCH Pitfall 1 — clear targets are count-1 named ids).
    // FULL SRD-default Guard numbers, no tuning (D-10).
    enemies: [
      { name: 'Subverted Sentry', id: 'library_undercroft_approach#sentry1' },
      { name: 'Subverted Sentry', id: 'library_undercroft_approach#sentry2' },
    ],
  },
  {
    id: 'library_undercroft_inner',
    name: 'The Reliquary Catacombs',
    desc:
      'Burial-niches honeycomb the walls, their saints’ bones long since cleared ' +
      'to make room for crates of stolen apparatus. Cabling snakes between the ' +
      'pillars toward a sealed inner door, and the hum is louder here, almost a ' +
      'voice.',
    floor: 'cobblestone',
    lighting: 'dim',
    entryPos: { x: 5, y: 9 },
    grid: undercroftGrid(11, 10),
    exits: [
      {
        pos: { x: 5, y: 0 },
        toRoomId: 'library_undercroft_core',
        label: 'Through to the cell core',
      },
      {
        pos: { x: 5, y: 9 },
        toRoomId: 'library_undercroft_approach',
        label: 'Back toward the stair',
      },
    ],
    // Escalation (D-04): a Subverted Vanguard line holding the catacombs with one
    // Weaver Adept directing them. The clear rule (rulesAct2 fuel_cell_inner_clear)
    // keys on all three named instances. FULL SRD-default Veteran/Cult-Fanatic
    // numbers, no tuning (D-10).
    enemies: [
      { name: 'Subverted Vanguard', id: 'library_undercroft_inner#vanguard1' },
      { name: 'Subverted Vanguard', id: 'library_undercroft_inner#vanguard2' },
      { name: 'Weaver Adept', id: 'library_undercroft_inner#adept' },
    ],
  },
  {
    id: 'library_undercroft_core',
    name: 'The Weaver-Cell Core',
    desc:
      'The catacomb opens into a great pillared crypt, pitch-dark but for the ' +
      'cold blue glow of the apparatus at its heart — the cradle where the ' +
      'star-metal’s fuel-cell will be wrung open. This is the raid’s end, and ' +
      'whatever guards it will make its stand among the pillars.',
    floor: 'cobblestone',
    lighting: 'dark',
    entryPos: { x: 6, y: 11 },
    grid: undercroftGrid(13, 12),
    exits: [
      {
        pos: { x: 6, y: 11 },
        toRoomId: 'library_undercroft_inner',
        label: 'Back into the catacombs',
      },
    ],
    // The climactic stand (D-04): the Weaver Magus working the cradle, flanked by
    // two Weaver Adepts. The core-clear rule (rulesAct2 fuel_cell_core_clear) keys
    // on all three named instances → relic_fuel_cell='party'. FULL SRD-default
    // Mage/Cult-Fanatic numbers, no tuning (D-10).
    enemies: [
      { name: 'Weaver Magus', id: 'library_undercroft_core#magus' },
      { name: 'Weaver Adept', id: 'library_undercroft_core#adept1' },
      { name: 'Weaver Adept', id: 'library_undercroft_core#adept2' },
    ],
  },
];
