import type { Region, Room, TerrainCell, TerrainType, Town } from '../../types.js';

// Overland-map authoring sugar: build terrain cells of one type from [x,y] pairs.
const terr = (type: TerrainType, ...cells: [number, number][]): TerrainCell[] =>
  cells.map(([x, y]) => ({ pos: { x, y }, type }));

export const rooms: Room[] = [
  // `millhaven_square` survives only as the opening-arrival frame: the party
  // starts on the regional grid (current_room is cleared), so this room is
  // never entered — its `roomArrival` text frames the vale map.
  {
    id: 'millhaven_square',
    name: 'Malgovia',
    desc: 'The Old Road brings you into Malgovia. Millhaven lies to the west; the pine-dark hills hide darker places — and the pass and grove lie beyond.',
  },

  // Millhaven interiors (town venues open these; each ascends back to town).
  {
    id: 'millhaven_temple',
    name: 'Temple of Selûne',
    desc: 'A modest stone temple, its silver crescent glinting above the door. Candles burn within.',
    canRest: true,
    gridWidth: 7,
    gridHeight: 7,
    entryPos: { x: 3, y: 6 },
    exits: [{ pos: { x: 3, y: 0 }, ascends: true, label: 'Step back into Millhaven' }],
  },
  {
    id: 'millhaven_market',
    name: 'Merchant District',
    desc: 'Guild warehouses and market stalls. Aldric the Merchant holds court here.',
    gridWidth: 7,
    gridHeight: 7,
    entryPos: { x: 3, y: 6 },
    exits: [{ pos: { x: 3, y: 0 }, ascends: true, label: 'Step back into Millhaven' }],
  },
  {
    id: 'millhaven_lantern',
    name: 'Lantern District',
    desc: 'Narrow alleys and shuttered windows. Someone is watching from the shadows.',
    gridWidth: 7,
    gridHeight: 7,
    entryPos: { x: 3, y: 6 },
    exits: [{ pos: { x: 3, y: 0 }, ascends: true, label: 'Step back into Millhaven' }],
  },
  {
    id: 'millhaven_garrison',
    name: 'Garrison Office',
    desc: 'A stone building bearing the City Watch crest. A strongbox sits behind the desk.',
    gridWidth: 7,
    gridHeight: 7,
    entryPos: { x: 3, y: 6 },
    exits: [{ pos: { x: 3, y: 0 }, ascends: true, label: 'Step back into Millhaven' }],
    objects: [
      {
        id: 'captain_strongbox',
        name: "Captain's Strongbox",
        desc: "An iron strongbox bolted under the captain's desk. The lock is intricate.",
        interactText: 'You crouch beside the strongbox and work the lock.',
        searchable: true,
        searchDC: 15,
        lootIds: ['shadow_evidence'],
        foundText:
          "The lock clicks. Inside, the incriminating letter — proof Captain Vane was on the bandits' payroll.",
        emptyText: 'The lock resists you. Reset your tools and try again.',
      },
    ],
  },

  // The Old Road — a regional site: a bandit skirmish on the way through.
  {
    id: 'old_road',
    name: 'The Old Road',
    desc: 'A rutted track through the hills. Fresh wagon tracks veer off near a stand of dead trees — and the men who made them are still here.',
    gridWidth: 10,
    gridHeight: 8,
    entryPos: { x: 0, y: 4 },
    exits: [{ pos: { x: 9, y: 4 }, ascends: true, label: 'Press on down the road' }],
    // Cosmetic terrain paint only (no mechanics): the rutted road runs west
    // to east; a stand of dead trees and hill-shoulders frame it.
    terrain: [
      ...terr(
        'road',
        [0, 4],
        [1, 4],
        [2, 4],
        [3, 4],
        [4, 4],
        [5, 4],
        [6, 4],
        [7, 4],
        [8, 4],
        [9, 4]
      ),
      ...terr('forest', [3, 1], [4, 1], [4, 2], [7, 6], [8, 6]),
      ...terr('hills', [0, 0], [9, 0], [0, 7], [9, 7]),
    ],
  },

  // Shattered Crypt (8 rooms). The regional site drops the party at the
  // entrance; exits chain the dungeon, and the Hidden Passage ascends out.
  {
    id: 'dungeon_crypt_entrance',
    name: 'Crypt Entrance',
    desc: 'Crumbling stone steps lead down. Crude graffiti warns: "Abandon hope." Torch brackets line the walls.',
    canRest: false,
    lighting: 'dim',
    gridWidth: 10,
    gridHeight: 10,
    entryPos: { x: 0, y: 0 },
    exits: [
      {
        pos: { x: 9, y: 0 },
        toRoomId: 'dungeon_antechamber',
        entrancePos: { x: 0, y: 0 },
        label: 'Into the antechamber',
      },
      { pos: { x: 0, y: 9 }, ascends: true, label: 'Climb out to the Old Road' },
    ],
  },
  {
    id: 'dungeon_antechamber',
    name: 'Antechamber',
    desc: 'A vaulted chamber of black stone. Funeral urns line the alcoves, some shattered. Bones litter the floor.',
    lighting: 'dark',
    gridWidth: 10,
    gridHeight: 10,
    entryPos: { x: 0, y: 0 },
    exits: [
      {
        pos: { x: 0, y: 9 },
        toRoomId: 'dungeon_crypt_entrance',
        entrancePos: { x: 9, y: 0 },
        label: 'Back to the entrance',
      },
      {
        pos: { x: 9, y: 0 },
        toRoomId: 'dungeon_charnel_hall',
        entrancePos: { x: 0, y: 0 },
        label: 'Charnel Hall',
      },
      {
        pos: { x: 9, y: 9 },
        toRoomId: 'dungeon_offering_chamber',
        entrancePos: { x: 0, y: 0 },
        label: 'Chamber of Offerings',
      },
    ],
    objects: [
      {
        id: 'funeral_urns',
        name: 'Funeral Urns',
        desc: 'Black ceramic urns sealed with wax. Most are cracked open.',
        interactText: 'You sift through the urns, brushing aside dust and ash.',
        searchable: true,
        searchDC: 10,
        lootIds: ['healing_potion'],
        foundText: 'Beneath the ashes — a small vial wrapped in cloth. A healing potion!',
        emptyText: 'Ashes drift through your fingers. Steady your hand and search again.',
      },
    ],
  },
  {
    id: 'dungeon_charnel_hall',
    name: 'Charnel Hall',
    desc: 'A long corridor flanked by sealed burial niches. The seals on several niches have been broken from within. Loose flagstones in the middle of the hall give you pause.',
    lighting: 'dark',
    gridWidth: 10,
    gridHeight: 10,
    entryPos: { x: 0, y: 0 },
    exits: [
      {
        pos: { x: 0, y: 9 },
        toRoomId: 'dungeon_antechamber',
        entrancePos: { x: 9, y: 0 },
        label: 'Back to the antechamber',
      },
      {
        pos: { x: 9, y: 9 },
        toRoomId: 'dungeon_shadow_gallery',
        entrancePos: { x: 0, y: 0 },
        label: 'Shadow Gallery',
      },
    ],
    trap: {
      id: 'charnel_hall_blade',
      name: 'Hidden Blade Plate',
      desc: 'A subtle depression in the flagstones, connected to a spring-loaded blade in the wall.',
      dc: 13,
      damage: '2d6',
      damageType: 'slashing',
      triggerNarrative: 'A blade scythes from the niche-wall! {name} takes {dmg} slashing damage.',
      detectNarrative:
        'You notice scoring in the wall opposite a worn flagstone — a blade trap, set to scythe across the corridor.',
      disarmSuccess: 'You wedge a fragment of bone into the mechanism. The blade is jammed.',
      disarmFail: 'You misjudge the angle — the mechanism trips and the blade scythes anyway!',
    },
  },
  {
    id: 'dungeon_offering_chamber',
    name: 'Chamber of Offerings',
    desc: 'An altar to a forgotten death deity stands at the center. Coins and grave goods have been disturbed.',
    lighting: 'dark',
    gridWidth: 10,
    gridHeight: 10,
    entryPos: { x: 0, y: 0 },
    exits: [
      {
        pos: { x: 0, y: 9 },
        toRoomId: 'dungeon_antechamber',
        entrancePos: { x: 9, y: 9 },
        label: 'Back to the antechamber',
      },
      {
        pos: { x: 9, y: 9 },
        toRoomId: 'dungeon_ossuary',
        entrancePos: { x: 0, y: 0 },
        label: 'Ossuary',
      },
    ],
  },
  {
    id: 'dungeon_shadow_gallery',
    name: 'Shadow Gallery',
    desc: 'Torchlight barely penetrates here. Paintings on the wall shift when you look away.',
    lighting: 'dark',
    gridWidth: 10,
    gridHeight: 10,
    entryPos: { x: 0, y: 0 },
    exits: [
      {
        pos: { x: 0, y: 9 },
        toRoomId: 'dungeon_charnel_hall',
        entrancePos: { x: 9, y: 9 },
        label: 'Back to the Charnel Hall',
      },
      {
        pos: { x: 9, y: 9 },
        toRoomId: 'dungeon_crypt_throne',
        entrancePos: { x: 1, y: 1 },
        label: 'Throne of the Dead',
      },
    ],
  },
  {
    id: 'dungeon_ossuary',
    name: 'Ossuary',
    desc: 'Bones are stacked floor to ceiling in ornate patterns. The artistry is almost beautiful.',
    lighting: 'dark',
    gridWidth: 10,
    gridHeight: 10,
    entryPos: { x: 0, y: 0 },
    exits: [
      {
        pos: { x: 0, y: 9 },
        toRoomId: 'dungeon_offering_chamber',
        entrancePos: { x: 9, y: 9 },
        label: 'Back to the Chamber of Offerings',
      },
      {
        pos: { x: 9, y: 9 },
        toRoomId: 'dungeon_crypt_throne',
        entrancePos: { x: 1, y: 1 },
        label: 'Throne of the Dead',
      },
    ],
  },
  {
    id: 'dungeon_crypt_throne',
    name: 'Throne of the Dead',
    desc: 'A massive chamber with a raised dais. An ancient throne of black stone dominates the room. Broken funeral pillars and piles of bone offer fragile cover. Something powerful waits here.',
    lighting: 'dim',
    gridWidth: 10,
    gridHeight: 10,
    // Marker arrives top-left, clear of the mid-room pillars.
    entryPos: { x: 1, y: 1 },
    exits: [
      {
        pos: { x: 0, y: 9 },
        toRoomId: 'dungeon_shadow_gallery',
        entrancePos: { x: 9, y: 9 },
        label: 'Back to the Shadow Gallery',
      },
      {
        pos: { x: 9, y: 0 },
        toRoomId: 'dungeon_ossuary',
        entrancePos: { x: 9, y: 9 },
        label: 'Back to the Ossuary',
      },
      {
        pos: { x: 9, y: 9 },
        toRoomId: 'dungeon_crypt_exit',
        entrancePos: { x: 0, y: 0 },
        label: 'A hidden passage in the dais',
      },
    ],
    // Broken pillars flanking the central approach + bone-rubble corners.
    // PCs spawn at row 1, enemies at row 8 — obstacles cluster mid-room
    // so the boss has to path around and the rogue gets LoS breaks.
    obstacles: [
      { x: 3, y: 4 },
      { x: 7, y: 4 },
      { x: 4, y: 6 },
      { x: 6, y: 6 },
    ],
    // Bone shards underfoot near the dais — slows approach.
    difficultTerrain: [
      { x: 4, y: 5 },
      { x: 5, y: 5 },
      { x: 6, y: 5 },
    ],
  },
  {
    id: 'dungeon_crypt_exit',
    name: 'Hidden Passage',
    desc: 'A narrow shaft cuts upward through the rock, emerging near the crypt entrance above.',
    gridWidth: 8,
    gridHeight: 8,
    entryPos: { x: 0, y: 0 },
    exits: [
      {
        pos: { x: 0, y: 1 },
        toRoomId: 'dungeon_crypt_throne',
        entrancePos: { x: 9, y: 9 },
        label: 'Back down to the throne',
      },
      { pos: { x: 7, y: 7 }, ascends: true, label: 'Climb out to the surface' },
    ],
  },

  // Bandit Camp (a regional site — the raiders behind the missing wagons).
  {
    id: 'bandit_camp',
    name: 'Bandit Camp',
    desc: 'A clearing ringed with crude tents and a smoldering cookfire. A half-stripped merchant wagon lists against a stump, Guild crates scattered around it. Lookouts turn at your approach.',
    lighting: 'dim',
    gridWidth: 10,
    gridHeight: 10,
    entryPos: { x: 0, y: 0 },
    exits: [
      {
        pos: { x: 9, y: 9 },
        toRoomId: 'bandit_tent',
        entrancePos: { x: 0, y: 0 },
        label: "The Captain's Tent",
      },
      { pos: { x: 0, y: 9 }, ascends: true, label: 'Leave the camp' },
    ],
  },
  {
    id: 'bandit_tent',
    name: "Captain's Tent",
    desc: "A larger oilcloth tent at the camp's heart. A war-map and a strongbox sit on a crate table. The Bandit Captain rises, hand on hilt.",
    lighting: 'dim',
    canRest: false,
    gridWidth: 8,
    gridHeight: 8,
    entryPos: { x: 0, y: 0 },
    exits: [
      {
        pos: { x: 7, y: 7 },
        toRoomId: 'bandit_camp',
        entrancePos: { x: 9, y: 9 },
        label: 'Back out to the camp',
      },
    ],
  },
];

export const regions: Region[] = [
  {
    id: 'vale_region',
    name: 'Malgovia',
    desc: 'The borderland of Malgovia — a shadowed vale of old tombs, the frozen pass beneath the Iceshard Spire, and the silent grove beyond Pinegate, all ringed by pine-dark hills.',
    feetPerSquare: 5280, // 1 square = 1 mile (SRD Travel Pace scale)
    gridWidth: 12,
    gridHeight: 8,
    startPos: { x: 0, y: 7 }, // the southern road, bottom-left of the vale
    // A linear horseshoe: the party starts bottom-left, a frozen sea floods
    // in from the west across the middle (impassable), so they must arc
    // EAST along the southern road, up the open eastern lane, then WEST
    // across the top into the snowy frozen north (the Frozen Pass + Iceshard
    // Spire). Passability / travel time / encounter rate all derive from
    // terrain type; unlisted cells are plains.
    terrain: [
      // The sea pushing in from the west edge, covering the middle and
      // blocking any straight northern route — the reason the road arcs east.
      // Its eastern edge reaches x7 and its southern shore comes down to y6,
      // right up against the y7 road; the start, road tiles, and Silent Grove
      // (6,6) stay clear so the arc still works.
      ...terr('water', [0, 2], [1, 2], [2, 2], [3, 2]),
      ...terr('water', [0, 3], [1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [7, 3]),
      ...terr('water', [0, 4], [1, 4], [2, 4], [3, 4], [4, 4], [5, 4], [6, 4], [7, 4]),
      ...terr('water', [0, 5], [1, 5], [2, 5], [3, 5], [4, 5], [5, 5]),
      ...terr('water', [0, 6], [1, 6], [2, 6], [3, 6]),
      // The southern road from the start east past the early sites.
      ...terr('road', [2, 7], [4, 7], [6, 7], [7, 7], [8, 7], [9, 7], [10, 7]),
      // Snowy frozen north (top band) — the Frozen Pass + Iceshard Spire sit
      // in it; a couple of impassable peaks give the Spire its teeth.
      ...terr('snow', [0, 0], [1, 0], [4, 0], [5, 0], [7, 0]),
      ...terr('snow', [0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1]),
      ...terr('mountain', [2, 0], [3, 0], [6, 0]),
      // Hilly approach to the frozen north on the east shoulder.
      ...terr('hills', [8, 0], [9, 0], [10, 0], [10, 1], [11, 1]),
      // Woods along the south-east, thickening around the Silent Grove.
      ...terr('forest', [4, 6], [5, 6], [6, 5], [7, 5], [7, 6], [8, 6], [9, 6], [8, 5], [9, 5]),
    ],
    sites: [
      {
        id: 'site_millhaven',
        name: 'Millhaven',
        pos: { x: 1, y: 7 }, // hub town, by the start
        kind: 'town',
        townId: 'millhaven_town',
      },
      {
        id: 'site_old_road',
        name: 'The Old Road',
        pos: { x: 3, y: 7 }, // early, along the southern road
        kind: 'local',
        entryRoomId: 'old_road',
      },
      {
        id: 'site_bandit_camp',
        name: 'Bandit Camp',
        pos: { x: 10, y: 4 }, // up the eastern lane
        kind: 'local',
        entryRoomId: 'bandit_camp',
      },
      {
        id: 'site_crypt',
        name: 'Shattered Crypt',
        pos: { x: 10, y: 3 }, // up the eastern lane
        kind: 'local',
        entryRoomId: 'dungeon_crypt_entrance',
      },
    ],
    encounterTable: ['Bandit Ruffian'],
    encounterChance: 0.1, // per mile-square crossed
  },
];

export const towns: Town[] = [
  {
    id: 'millhaven_town',
    name: 'Millhaven',
    desc: "A market town at the vale's edge — temple, guild market, lantern-lit slums, and the Watch garrison.",
    feetPerSquare: 25, // settlement scale
    gridWidth: 8,
    gridHeight: 8,
    startPos: { x: 4, y: 6 }, // just inside the gate
    venues: [
      {
        id: 'venue_temple',
        name: 'Temple of Selûne',
        pos: { x: 1, y: 2 },
        kind: 'interior',
        entryRoomId: 'millhaven_temple',
      },
      {
        id: 'venue_market',
        name: 'Merchant District',
        pos: { x: 6, y: 2 },
        kind: 'interior',
        entryRoomId: 'millhaven_market',
      },
      {
        id: 'venue_lantern',
        name: 'Lantern District',
        pos: { x: 1, y: 5 },
        kind: 'interior',
        entryRoomId: 'millhaven_lantern',
      },
      {
        id: 'venue_garrison',
        name: 'Garrison Office',
        pos: { x: 6, y: 5 },
        kind: 'interior',
        entryRoomId: 'millhaven_garrison',
      },
      { id: 'venue_gate', name: 'Town Gate', pos: { x: 4, y: 7 }, kind: 'gate' },
    ],
  },
];
