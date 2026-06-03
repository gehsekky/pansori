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
    // Cosmetic floor: a flagstone aisle leading to the moon-altar, flanked by
    // shrine plantings.
    terrain: [
      ...terr(
        'cobblestone',
        [3, 1],
        [3, 2],
        [3, 3],
        [3, 4],
        [3, 5],
        [3, 6],
        [2, 2],
        [4, 2],
        [2, 3],
        [4, 3],
        [2, 4],
        [4, 4]
      ),
      ...terr('garden', [1, 1], [5, 1]),
    ],
  },
  {
    id: 'millhaven_market',
    name: 'Merchant District',
    desc: 'Guild warehouses and market stalls. Aldric the Merchant holds court here.',
    gridWidth: 7,
    gridHeight: 7,
    entryPos: { x: 3, y: 6 },
    exits: [{ pos: { x: 3, y: 0 }, ascends: true, label: 'Step back into Millhaven' }],
    // Cosmetic: a cobbled market square with a couple of planter beds.
    terrain: [
      ...terr(
        'cobblestone',
        [2, 2],
        [3, 2],
        [4, 2],
        [2, 3],
        [3, 3],
        [4, 3],
        [2, 4],
        [3, 4],
        [4, 4],
        [3, 5],
        [3, 6]
      ),
      ...terr('garden', [1, 5], [5, 5]),
    ],
  },
  {
    id: 'millhaven_lantern',
    name: 'Lantern District',
    desc: 'Narrow alleys and shuttered windows. Someone is watching from the shadows.',
    gridWidth: 7,
    gridHeight: 7,
    entryPos: { x: 3, y: 6 },
    exits: [{ pos: { x: 3, y: 0 }, ascends: true, label: 'Step back into Millhaven' }],
    // Cosmetic: a narrow cobbled alley winding through the slums.
    terrain: [
      ...terr('cobblestone', [3, 1], [3, 2], [3, 3], [3, 4], [3, 5], [3, 6], [2, 3], [4, 3]),
    ],
  },
  {
    id: 'millhaven_garrison',
    name: 'Garrison Office',
    desc: 'A stone building bearing the City Watch crest. A strongbox sits behind the desk.',
    gridWidth: 7,
    gridHeight: 7,
    entryPos: { x: 3, y: 6 },
    exits: [{ pos: { x: 3, y: 0 }, ascends: true, label: 'Step back into Millhaven' }],
    // Cosmetic: a flagstone office floor.
    terrain: [
      ...terr(
        'cobblestone',
        [2, 2],
        [3, 2],
        [4, 2],
        [2, 3],
        [3, 3],
        [4, 3],
        [2, 4],
        [3, 4],
        [4, 4],
        [3, 5],
        [3, 6]
      ),
    ],
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
    // Crumbling flagstone steps; a rubble pile from the caved-in ceiling.
    terrain: [
      ...terr('mountain', [4, 4], [5, 4], [5, 5]),
      ...terr(
        'cobblestone',
        [1, 1],
        [2, 1],
        [3, 1],
        [2, 2],
        [6, 3],
        [3, 6],
        [6, 6],
        [7, 6],
        [6, 7]
      ),
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
    // Shattered urns and bone-rubble strewn across the vaulted floor.
    terrain: [
      ...terr('mountain', [3, 4], [4, 4], [6, 6]),
      ...terr('cobblestone', [2, 2], [3, 2], [6, 2], [7, 3], [5, 5], [2, 6]),
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
    // Broken burial-niche debris flanks the long corridor flagstones.
    terrain: [
      ...terr('mountain', [3, 4], [6, 5]),
      ...terr('cobblestone', [2, 2], [3, 2], [4, 2], [5, 7], [6, 7], [7, 7]),
    ],
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
    // A central altar block; a stagnant offering-pool has flooded one corner.
    terrain: [
      ...terr('mountain', [4, 4], [5, 4], [4, 5], [5, 5]),
      ...terr('water', [2, 7], [3, 7]),
      ...terr('cobblestone', [2, 2], [7, 2], [7, 6]),
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
    // Toppled picture frames fallen in a diagonal across the gallery floor.
    terrain: [
      ...terr('mountain', [4, 4], [5, 5], [6, 6]),
      ...terr('cobblestone', [2, 2], [3, 2], [6, 3], [3, 6], [7, 6]),
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
    // Bones stacked floor-to-ceiling in great ornamental piles.
    terrain: [
      ...terr('mountain', [3, 3], [3, 4], [6, 5], [6, 6]),
      ...terr('cobblestone', [2, 2], [7, 2], [5, 5], [2, 7]),
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
    // Cosmetic paint over the tuned combat layout: the broken pillars (which are
    // the existing `obstacles`) render as rubble; dais flagstones around them.
    // Mountain cells here coincide with `obstacles`, so the impassable set is
    // unchanged — this only adds the visual.
    terrain: [
      ...terr('mountain', [3, 4], [7, 4], [4, 6], [6, 6]),
      ...terr('cobblestone', [5, 1], [5, 2], [1, 2], [8, 1], [1, 8], [8, 8]),
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
    // A cramped rubble-strewn shaft; a clear path winds from the throne door up.
    terrain: [
      ...terr('mountain', [3, 3], [4, 4]),
      ...terr('cobblestone', [1, 1], [2, 2], [5, 5], [6, 6], [6, 7]),
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
    // A woodland clearing: a tree-line rings the camp (cosmetic forest); a
    // listing wagon, boulders, and a stump give hard cover mid-clearing.
    terrain: [
      ...terr('mountain', [4, 4], [5, 4], [4, 5], [6, 6]),
      ...terr('forest', [3, 0], [6, 0], [9, 3], [9, 6], [2, 2], [7, 2]),
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
    // The captain's crate-table (war-map + strongbox) sits as hard cover mid-tent,
    // with brush crowding the oilcloth corners.
    terrain: [...terr('mountain', [3, 3], [4, 3]), ...terr('forest', [0, 7], [7, 0])],
  },

  // ── Whispering Pines (folded) ────────────────────────────────────────────
  // Village interiors (town venues open these; each ascends back to town).
  {
    id: 'pines_tavern',
    name: 'Pine Tavern',
    desc: 'A low-beamed inn smelling of woodsmoke and mulled spirits. Innkeeper Brann tends the bar.',
    canRest: true,
    gridWidth: 7,
    gridHeight: 7,
    entryPos: { x: 3, y: 6 },
    exits: [{ pos: { x: 3, y: 0 }, ascends: true, label: 'Back into the village' }],
    // Cosmetic: a timber-board floor warmed by the hearth; snow tracked in at the door.
    terrain: [
      ...terr(
        'cobblestone',
        [3, 1],
        [3, 2],
        [3, 3],
        [3, 4],
        [3, 5],
        [2, 2],
        [4, 2],
        [2, 3],
        [4, 3]
      ),
      ...terr('snow', [2, 6], [4, 6]),
    ],
  },
  {
    id: 'pines_lodge',
    name: "Trapper's Lodge",
    desc: "Marta's lodge — pelts hanging in racks, snowshoes and warhammers along the wall. A locked supply locker stands by the door.",
    gridWidth: 7,
    gridHeight: 7,
    entryPos: { x: 3, y: 6 },
    exits: [{ pos: { x: 3, y: 0 }, ascends: true, label: 'Back into the village' }],
    objects: [
      {
        id: 'trapper_locker',
        name: "Trapper's Locker",
        desc: "Marta's supply locker, kept off the floor. The lock looks honest, not warded.",
        interactText: 'You crouch by the locker and pick at the latch.',
        searchable: true,
        searchDC: 12,
        lootIds: ['elixir_of_warmth'],
        foundText: 'Inside: a wax-stoppered vial. An elixir of warmth.',
        emptyText: 'The latch sticks. Brace it properly and try the lock again.',
      },
    ],
    // Cosmetic: a plank floor hung with pelts; snow tracked from the door.
    terrain: [
      ...terr(
        'cobblestone',
        [3, 1],
        [3, 2],
        [3, 3],
        [3, 4],
        [3, 5],
        [2, 3],
        [4, 3],
        [2, 4],
        [4, 4]
      ),
      ...terr('snow', [2, 6], [4, 6]),
    ],
  },
  {
    id: 'pines_warden',
    name: 'Warden Post',
    desc: "Captain Riese's command — a stone hut warmed by a single brazier. A war map covers one wall.",
    gridWidth: 7,
    gridHeight: 7,
    entryPos: { x: 3, y: 6 },
    exits: [{ pos: { x: 3, y: 0 }, ascends: true, label: 'Back into the village' }],
    // Cosmetic: a stone hut floor by the brazier; snow at the threshold.
    terrain: [
      ...terr(
        'cobblestone',
        [2, 2],
        [3, 2],
        [4, 2],
        [2, 3],
        [3, 3],
        [4, 3],
        [2, 4],
        [3, 4],
        [4, 4],
        [3, 5]
      ),
      ...terr('snow', [2, 6], [4, 6]),
    ],
  },

  // The Frozen Pass — a regional site (a Frost Wolf prowls the trail).
  {
    id: 'pass_climb',
    name: 'Frozen Pass',
    desc: 'A switchback trail along the cliff face. Wind carries the scent of woodsmoke from below and something colder from above.',
    gridWidth: 10,
    gridHeight: 8,
    entryPos: { x: 0, y: 4 },
    exits: [{ pos: { x: 9, y: 4 }, ascends: true, label: 'Back down the pass' }],
    // A snowbound switchback: sheer cliff walls (mountain) above and below the
    // trail, with a couple of boulders forcing the path to wind. Row 4 stays open.
    terrain: [
      ...terr(
        'mountain',
        [3, 0],
        [4, 0],
        [5, 0],
        [6, 0],
        [3, 7],
        [4, 7],
        [5, 7],
        [6, 7],
        [5, 2],
        [4, 5]
      ),
      ...terr('snow', [1, 3], [2, 3], [7, 3], [2, 4], [3, 4], [6, 4], [7, 4], [3, 5], [6, 5]),
    ],
  },

  // Iceshard Spire — a regional site; rooms chain entrance → hall → cult →
  // apex → egress, and the Hidden Descent ascends out.
  {
    id: 'spire_entrance',
    name: 'Spire Entrance',
    desc: 'A black stone arch leans against the cliff. Old cult sigils mark the lintel. The air inside is colder than the wind.',
    canRest: false,
    lighting: 'dim',
    gridWidth: 10,
    gridHeight: 10,
    entryPos: { x: 0, y: 0 },
    exits: [
      {
        pos: { x: 9, y: 0 },
        toRoomId: 'spire_frozen_hall',
        entrancePos: { x: 0, y: 0 },
        label: 'Into the Frozen Hall',
      },
      { pos: { x: 0, y: 9 }, ascends: true, label: 'Back out to the pass' },
    ],
    // Rime-sheathed threshold: ice columns and a frozen puddle by the arch.
    terrain: [
      ...terr('mountain', [4, 4], [5, 4], [5, 5]),
      ...terr('water', [6, 7]),
      ...terr('snow', [1, 1], [2, 2], [7, 2], [2, 6], [7, 6], [3, 8]),
    ],
  },
  {
    id: 'spire_frozen_hall',
    name: 'Frozen Hall',
    desc: 'A long pillared hall sheathed in ice. Frost mephits glitter in the air like motes of dust. Heavy icicles hang from the vaulted ceiling — some look ready to fall.',
    lighting: 'dark',
    gridWidth: 10,
    gridHeight: 10,
    entryPos: { x: 0, y: 0 },
    exits: [
      {
        pos: { x: 0, y: 1 },
        toRoomId: 'spire_entrance',
        entrancePos: { x: 9, y: 0 },
        label: 'Back to the entrance',
      },
      {
        pos: { x: 9, y: 9 },
        toRoomId: 'spire_cult_chamber',
        entrancePos: { x: 0, y: 0 },
        label: 'Into the Cult Chamber',
      },
    ],
    trap: {
      id: 'frozen_hall_icicle',
      name: 'Falling Icicle',
      desc: 'A spear-length icicle hangs over the hall, threaded with a thawing rune. Disturbance below shakes it loose.',
      dc: 12,
      damage: '2d6',
      damageType: 'piercing',
      triggerNarrative:
        'The icicle plunges from the ceiling — {name} takes {dmg} piercing damage and a faceful of frost.',
      detectNarrative:
        'You spot the rune carved at the base of the icicle — pure ice, set to drop if the hall is disturbed.',
      disarmSuccess: 'You snap the rune cleanly. The icicle slumps harmlessly.',
      disarmFail: 'Your hand slips on the rime — the icicle plummets early!',
    },
    // A pillared ice hall: four frozen columns break line of sight, with a
    // frozen pool at the centre. Wide lanes between the pillars.
    terrain: [
      ...terr('mountain', [3, 3], [6, 3], [3, 6], [6, 6]),
      ...terr('water', [5, 5]),
      ...terr('snow', [1, 1], [8, 1], [5, 2], [2, 5], [1, 8], [8, 8]),
    ],
  },
  {
    id: 'spire_cult_chamber',
    name: 'Cult Chamber',
    desc: 'A circular vault with a low altar of black ironwood. Frostspire cultists chant in unison around a captive form. (Old Halden lies bound near the altar, unconscious.)',
    lighting: 'dim',
    gridWidth: 10,
    gridHeight: 10,
    entryPos: { x: 0, y: 0 },
    exits: [
      {
        pos: { x: 0, y: 1 },
        toRoomId: 'spire_frozen_hall',
        entrancePos: { x: 9, y: 9 },
        label: 'Back to the Frozen Hall',
      },
      {
        pos: { x: 9, y: 9 },
        toRoomId: 'spire_ritual_apex',
        entrancePos: { x: 1, y: 1 },
        label: 'Up to the Ritual Apex',
      },
    ],
    // A circular vault: the black-ironwood altar (mountain) at the centre, ice
    // chunks scattered, a frozen patch by the chant-ring.
    terrain: [
      ...terr('mountain', [4, 5], [5, 5], [3, 3], [7, 6]),
      ...terr('water', [5, 2]),
      ...terr('snow', [2, 2], [7, 2], [2, 7], [7, 7]),
    ],
  },
  {
    id: 'spire_ritual_apex',
    name: 'Ritual Apex',
    desc: "The spire's top chamber. A green flame burns above the broken vault. Shattered ice columns and frozen statuary line the approach. The Frost Acolyte stands at the apex, hands raised, runes blazing.",
    lighting: 'bright',
    gridWidth: 10,
    gridHeight: 10,
    entryPos: { x: 1, y: 1 },
    exits: [
      {
        pos: { x: 0, y: 9 },
        toRoomId: 'spire_cult_chamber',
        entrancePos: { x: 9, y: 9 },
        label: 'Back to the Cult Chamber',
      },
      {
        pos: { x: 9, y: 9 },
        toRoomId: 'spire_egress',
        entrancePos: { x: 0, y: 0 },
        label: 'A hidden descent',
      },
    ],
    // Ice columns + frozen ritual statuary clustered around the approach
    // to the apex dais. Symmetric so neither flank is "the right side".
    obstacles: [
      { x: 2, y: 4 },
      { x: 8, y: 4 },
      { x: 4, y: 6 },
      { x: 6, y: 6 },
      { x: 5, y: 3 },
    ],
    // Slick ice in the centre — slows the approach to the dais.
    difficultTerrain: [
      { x: 4, y: 4 },
      { x: 5, y: 4 },
      { x: 6, y: 4 },
    ],
    // Cosmetic paint over the tuned layout: the shattered ice columns + frozen
    // statuary (the existing `obstacles`) render as ice; the impassable set is
    // unchanged. Slick-ice centre stays `difficultTerrain`.
    terrain: [
      ...terr('mountain', [2, 4], [8, 4], [4, 6], [6, 6], [5, 3]),
      ...terr('snow', [1, 2], [2, 2], [8, 2], [1, 8], [8, 8], [5, 8]),
    ],
  },
  {
    id: 'spire_egress',
    name: 'Hidden Descent',
    desc: 'A narrow stair cuts through the cliff back to the lower trail. Daylight shows below.',
    gridWidth: 8,
    gridHeight: 8,
    entryPos: { x: 0, y: 0 },
    exits: [
      {
        pos: { x: 0, y: 1 },
        toRoomId: 'spire_ritual_apex',
        entrancePos: { x: 9, y: 9 },
        label: 'Back up to the apex',
      },
      { pos: { x: 7, y: 7 }, ascends: true, label: 'Descend to the pass' },
    ],
    // A cramped icy stair: a little rubble, with a clear run from the apex door
    // down to the daylit descent.
    terrain: [
      ...terr('mountain', [3, 3], [4, 4]),
      ...terr('snow', [1, 1], [2, 2], [5, 5], [6, 6], [6, 7]),
    ],
  },

  // ── Grove of Thorns (folded) ─────────────────────────────────────────────
  // Pinegate town interiors (venues open these; each ascends back to town).
  {
    id: 'pinegate_square',
    name: 'Pinegate Village',
    desc: 'A small village square with a stone well at its center. Pine trees rise dark beyond the houses. Lanterns burn even at midday.',
    gridWidth: 7,
    gridHeight: 7,
    entryPos: { x: 3, y: 6 },
    exits: [{ pos: { x: 3, y: 0 }, ascends: true, label: 'Back into Pinegate' }],
    // Cosmetic: a cobbled square around the central stone well, ringed by the
    // dark pines beyond the houses.
    terrain: [
      ...terr('water', [3, 3]), // the stone well (impassable)
      ...terr(
        'cobblestone',
        [2, 2],
        [3, 2],
        [4, 2],
        [2, 3],
        [4, 3],
        [2, 4],
        [3, 4],
        [4, 4],
        [3, 5],
        [3, 6]
      ),
      ...terr('garden', [0, 0], [6, 0], [0, 6], [6, 6], [0, 3], [6, 3]),
    ],
  },
  {
    id: 'pinegate_lodge',
    name: 'The Burnt Stump (lodge)',
    desc: "A timber-frame lodge serving as inn, common-hall, and informal council seat. A fire crackles. Mareth's carved charm hangs on the wall.",
    gridWidth: 7,
    gridHeight: 7,
    entryPos: { x: 3, y: 6 },
    exits: [{ pos: { x: 3, y: 0 }, ascends: true, label: 'Back into Pinegate' }],
    // Cosmetic: a worn plank-and-flagstone common-hall floor.
    terrain: [
      ...terr(
        'cobblestone',
        [2, 2],
        [3, 2],
        [4, 2],
        [2, 3],
        [3, 3],
        [4, 3],
        [2, 4],
        [3, 4],
        [4, 4],
        [3, 5],
        [3, 6]
      ),
    ],
  },

  // The Grove — a regional site. Entry room is the bridge; the path chains
  // bridge → entrance → maze → oak → sanctum, and the sanctum ascends out.
  {
    id: 'thornwater_bridge',
    name: 'Thornwater Bridge',
    desc: 'A stone bridge across rushing water. The pines on the far bank stand too still. A faded Verdant Circle banner hangs from the rail.',
    gridWidth: 8,
    gridHeight: 6,
    entryPos: { x: 0, y: 3 },
    // Cosmetic: the stone bridge spans the rushing Thornwater (impassable), with
    // the too-still pines on the far bank. Pathing keeps the bridge row + the
    // x=0 column to the ascent open.
    terrain: [
      ...terr('cobblestone', [0, 3], [1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [7, 3]),
      ...terr(
        'water',
        [1, 1],
        [2, 1],
        [3, 1],
        [4, 1],
        [5, 1],
        [6, 1],
        [7, 1],
        [1, 2],
        [2, 2],
        [3, 2],
        [4, 2],
        [5, 2],
        [6, 2],
        [7, 2],
        [0, 4],
        [1, 4],
        [2, 4],
        [3, 4],
        [4, 4],
        [5, 4],
        [6, 4],
        [7, 4],
        [0, 5],
        [1, 5],
        [2, 5],
        [3, 5],
        [4, 5],
        [5, 5],
        [6, 5],
        [7, 5]
      ),
      ...terr('forest', [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [7, 0]),
    ],
    exits: [
      {
        pos: { x: 7, y: 3 },
        toRoomId: 'grove_entrance',
        entrancePos: { x: 0, y: 0 },
        label: 'Cross into the grove',
      },
      { pos: { x: 0, y: 0 }, ascends: true, label: 'Back to the Verdant Reach' },
    ],
  },
  {
    id: 'grove_entrance',
    name: 'Grove Entrance',
    desc: "The path widens into a clearing of standing stones. Wolf-eyes glow from the underbrush. The Circle's old gateway arch is here — and broken.",
    gridWidth: 10,
    gridHeight: 10,
    entryPos: { x: 0, y: 0 },
    // Cosmetic: a grassy clearing ringed by underbrush (forest).
    terrain: [
      ...terr('garden', [4, 4], [5, 4], [4, 5], [5, 5]),
      ...terr(
        'forest',
        [2, 1],
        [3, 1],
        [6, 2],
        [7, 2],
        [1, 5],
        [8, 4],
        [2, 8],
        [3, 8],
        [7, 7],
        [6, 8]
      ),
    ],
    exits: [
      {
        pos: { x: 0, y: 1 },
        toRoomId: 'thornwater_bridge',
        entrancePos: { x: 7, y: 3 },
        label: 'Back to the bridge',
      },
      {
        pos: { x: 9, y: 9 },
        toRoomId: 'thornwood_maze',
        entrancePos: { x: 0, y: 0 },
        label: 'Into the Thornwood',
      },
    ],
  },
  {
    id: 'thornwood_maze',
    name: 'The Thornwood Maze',
    desc: 'A winding stretch of thorn-thicket where the path forks and rejoins. Webs glint between branches. Something many-legged moves overhead.',
    gridWidth: 10,
    gridHeight: 10,
    entryPos: { x: 0, y: 0 },
    // Cosmetic: dense thorn-thicket (forest) with a few boggy hollows (swamp).
    terrain: [
      ...terr(
        'forest',
        [2, 1],
        [3, 1],
        [6, 2],
        [1, 3],
        [4, 3],
        [8, 3],
        [6, 4],
        [2, 5],
        [5, 5],
        [4, 6],
        [7, 6],
        [3, 7],
        [8, 7],
        [1, 8],
        [5, 8]
      ),
      ...terr('swamp', [2, 4], [7, 4], [5, 7]),
    ],
    exits: [
      {
        pos: { x: 0, y: 1 },
        toRoomId: 'grove_entrance',
        entrancePos: { x: 9, y: 9 },
        label: 'Back to the entrance',
      },
      {
        pos: { x: 9, y: 9 },
        toRoomId: 'ancient_oak',
        entrancePos: { x: 1, y: 1 },
        label: 'To the Ancient Oak',
      },
    ],
  },
  {
    id: 'ancient_oak',
    name: 'The Ancient Oak',
    desc: "A vast, ancient oak at the grove's heart. Roots curl up from the earth in a circular dais, splitting the approach into braided paths. A figure in fey green stands at the trunk — the Trickster, with two trained bears flanking it.",
    gridWidth: 10,
    gridHeight: 10,
    entryPos: { x: 1, y: 1 },
    // Cosmetic: the Oak's verdant dais at the heart (garden), ringed by old
    // forest. (The mechanical root obstacles + thorned difficult terrain are
    // the separate arrays below.)
    terrain: [
      ...terr('garden', [4, 4], [5, 4], [6, 4], [4, 5], [5, 5], [6, 5], [4, 6], [6, 6], [5, 7]),
      ...terr('forest', [2, 2], [8, 2], [1, 7], [8, 7], [2, 8], [7, 8]),
    ],
    exits: [
      {
        pos: { x: 0, y: 9 },
        toRoomId: 'thornwood_maze',
        entrancePos: { x: 9, y: 9 },
        label: 'Back into the maze',
      },
      {
        pos: { x: 9, y: 9 },
        toRoomId: 'grove_sanctum',
        entrancePos: { x: 0, y: 0 },
        label: 'Into the sanctum',
      },
    ],
    // Gnarled roots arching up through the floor — split the approach so
    // the bears can't all converge at once.
    obstacles: [
      { x: 4, y: 3 },
      { x: 6, y: 3 },
      { x: 3, y: 5 },
      { x: 7, y: 5 },
      { x: 5, y: 6 },
    ],
    // Thorned undergrowth in patches — slows movement near the dais.
    difficultTerrain: [
      { x: 4, y: 5 },
      { x: 5, y: 5 },
      { x: 6, y: 5 },
      { x: 5, y: 4 },
    ],
  },
  {
    id: 'grove_sanctum',
    name: 'Grove Sanctum',
    desc: "A sunlit clearing past the Oak. Mareth's charm warms in your hand. The path back to Pinegate is open.",
    gridWidth: 8,
    gridHeight: 8,
    entryPos: { x: 0, y: 0 },
    // Cosmetic: a sunlit sacred clearing (garden) edged by quiet pines (forest).
    terrain: [
      ...terr('garden', [3, 3], [4, 3], [5, 3], [2, 4], [3, 4], [4, 4], [4, 5]),
      ...terr('forest', [1, 1], [6, 1], [1, 6], [2, 6], [6, 5], [6, 6]),
    ],
    exits: [
      {
        pos: { x: 0, y: 1 },
        toRoomId: 'ancient_oak',
        entrancePos: { x: 9, y: 9 },
        label: 'Back to the Oak',
      },
      { pos: { x: 7, y: 7 }, ascends: true, label: 'Return to Pinegate' },
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
    startPos: { x: 0, y: 7 }, // the south-west road end — Pinegate + the beginner grove are the first stops east
    // A linear horseshoe: the party starts bottom-left, a frozen sea floods
    // in from the west across the middle (impassable), so they must arc
    // EAST along the southern road, up the open eastern lane, then WEST
    // across the top into the snowy frozen north (the Frozen Pass + Iceshard
    // Spire). Passability / travel time / encounter rate all derive from
    // terrain type; unlisted cells are plains.
    terrain: [
      // The frozen sea pushes in from the west edge, covering the middle and
      // blocking any straight northern route — the reason the road arcs east.
      // Its eastern edge reaches x7; the start (0,7), the southern road, and the
      // Silent Grove's forest clearing at (3,6) stay clear so the arc works.
      ...terr('water', [0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [7, 2]),
      ...terr('water', [0, 3], [1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [7, 3]),
      ...terr('water', [0, 4], [1, 4], [2, 4], [3, 4], [4, 4], [5, 4], [6, 4], [7, 4]),
      ...terr('water', [0, 5], [1, 5], [5, 5]),
      ...terr('water', [0, 6], [1, 6]),
      // The southern road runs east from the start, past Pinegate + the grove,
      // to Millhaven; the eastern road then climbs north toward the crypt and
      // the frozen pass, with a short western spur into Whispering Pines.
      ...terr('road', [2, 7], [3, 7], [4, 7], [5, 7], [6, 7], [7, 7], [8, 7], [9, 7], [10, 7]),
      ...terr('road', [10, 6], [10, 5], [10, 4], [10, 3], [10, 2], [10, 1]),
      ...terr('road', [8, 1], [7, 1]),
      // Snowy frozen north (top band) — the Frozen Pass + Iceshard Spire sit
      // in it; a couple of impassable peaks give the Spire its teeth.
      ...terr('snow', [0, 0], [1, 0], [4, 0], [5, 0], [7, 0]),
      ...terr('snow', [0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1]),
      ...terr('mountain', [2, 0], [3, 0], [6, 0]),
      // Hilly approach to the frozen north on the east shoulder.
      ...terr('hills', [8, 0], [9, 0], [10, 0], [11, 1]),
      // Woods along the south-east + the Silent Grove's clearing carved from the
      // sea's edge (the four squares freed around the grove at (3,6)).
      ...terr(
        'forest',
        [4, 6],
        [5, 6],
        [6, 5],
        [7, 5],
        [7, 6],
        [8, 6],
        [9, 6],
        [8, 5],
        [9, 5],
        [2, 5],
        [3, 5],
        [4, 5],
        [2, 6],
        [6, 6]
      ),
    ],
    sites: [
      {
        id: 'site_millhaven',
        name: 'Millhaven',
        pos: { x: 10, y: 7 }, // mid-tier hub at the far east end of the southern road
        kind: 'town',
        townId: 'millhaven_town',
      },
      {
        id: 'site_old_road',
        name: 'The Old Road',
        pos: { x: 10, y: 5 }, // on the eastern road, climbing north out of Millhaven
        kind: 'local',
        entryRoomId: 'old_road',
      },
      {
        id: 'site_bandit_camp',
        name: 'Bandit Camp',
        pos: { x: 11, y: 3 }, // off the eastern road, by the crypt
        kind: 'local',
        entryRoomId: 'bandit_camp',
      },
      {
        id: 'site_crypt',
        name: 'Shattered Crypt',
        pos: { x: 9, y: 3 }, // mid-tier, off the eastern road
        kind: 'local',
        entryRoomId: 'dungeon_crypt_entrance',
      },
      // ── Whispering Pines (folded) — three new sites in the frozen north ──
      {
        id: 'site_pines',
        name: 'Whispering Pines',
        pos: { x: 9, y: 1 }, // gateway town into the frozen north
        kind: 'town',
        townId: 'pines_village',
      },
      {
        id: 'site_pass',
        name: 'The Frozen Pass',
        pos: { x: 5, y: 1 }, // snowy north, on the way west to the Spire
        kind: 'local',
        entryRoomId: 'pass_climb',
      },
      {
        id: 'site_spire',
        name: 'Iceshard Spire',
        pos: { x: 1, y: 0 }, // climax, the frozen NW corner
        kind: 'local',
        entryRoomId: 'spire_entrance',
      },
      // ── Grove of Thorns (folded) — Pinegate + the Silent Grove ──
      {
        id: 'site_pinegate',
        name: 'Pinegate',
        pos: { x: 1, y: 7 }, // the beginner hub, first stop east of the start
        kind: 'town',
        townId: 'pinegate_town',
      },
      {
        id: 'site_grove',
        name: 'The Silent Grove',
        pos: { x: 3, y: 6 }, // the beginner dungeon, in a forest clearing by Pinegate
        kind: 'local',
        entryRoomId: 'thornwater_bridge',
      },
    ],
    // Bandit Ruffian (Malgovia) + the folded modules' overland encounters
    // (Whispering Pines: Snowshrouded Bandit, Frost Wolf; Grove: Awakened Wolf).
    encounterTable: ['Bandit Ruffian', 'Snowshrouded Bandit', 'Frost Wolf', 'Awakened Wolf'],
    encounterChance: 0.1, // per mile-square crossed
    // Encounter tiers (SRD Tiers of Play, loosely) for future procedural
    // scaling — danger rises as you push north off the southern grove road.
    // The 12×8 grid: y 5–7 = the beginner grove wilds (baseTier 1, levels 1–4);
    // y 3–4 = the mid eastern lane to the crypt / bandit camp (Tier 2, ~5–7);
    // y 0–2 = the frozen north (the pass + Iceshard Spire) — endgame (Tier 3).
    baseTier: 1,
    tierZones: [
      { tier: 2, from: { x: 0, y: 3 }, to: { x: 11, y: 4 } },
      { tier: 3, from: { x: 0, y: 0 }, to: { x: 11, y: 2 } },
    ],
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
    // Cosmetic settlement terrain (no mechanics): the town wall along the north
    // edge, cobblestone streets linking the gate to the four districts, and a
    // couple of tended gardens.
    terrain: [
      ...terr('town_wall', [0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [7, 0]),
      ...terr(
        'cobblestone',
        [4, 1],
        [4, 2],
        [4, 3],
        [4, 4],
        [4, 5],
        [4, 6],
        [2, 2],
        [3, 2],
        [5, 2],
        [2, 5],
        [3, 5],
        [5, 5]
      ),
      ...terr('garden', [2, 1], [5, 1], [2, 6], [5, 6]),
    ],
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

  // ── Whispering Pines (folded) ────────────────────────────────────────────
  {
    id: 'pines_village',
    name: 'Whispering Pines',
    desc: 'A snow-shrouded square — the Pine Tavern, the Trapper’s Lodge, and the Warden Post.',
    feetPerSquare: 25,
    gridWidth: 6,
    gridHeight: 6,
    startPos: { x: 3, y: 3 },
    // Cosmetic: a snow-blanketed square with a trodden cobblestone path through
    // the middle and a little pine greenery to either side.
    terrain: [
      ...terr(
        'snow',
        [0, 0],
        [2, 0],
        [3, 0],
        [5, 0],
        [0, 2],
        [5, 2],
        [2, 4],
        [4, 4],
        [0, 5],
        [5, 5]
      ),
      ...terr('cobblestone', [3, 2], [3, 3], [3, 4]),
      ...terr('garden', [0, 3], [5, 3]),
    ],
    venues: [
      {
        id: 'venue_tavern',
        name: 'Pine Tavern',
        pos: { x: 1, y: 1 },
        kind: 'interior',
        entryRoomId: 'pines_tavern',
      },
      {
        id: 'venue_lodge',
        name: "Trapper's Lodge",
        pos: { x: 4, y: 1 },
        kind: 'interior',
        entryRoomId: 'pines_lodge',
      },
      {
        id: 'venue_warden',
        name: 'Warden Post',
        pos: { x: 1, y: 4 },
        kind: 'interior',
        entryRoomId: 'pines_warden',
      },
      { id: 'venue_gate_pines', name: 'Village Edge', pos: { x: 3, y: 5 }, kind: 'gate' },
    ],
  },

  // ── Grove of Thorns (folded) ─────────────────────────────────────────────
  {
    id: 'pinegate_town',
    name: 'Pinegate',
    desc: 'A lantern-lit village square ringed by pine — the well, the lodge, and worried faces.',
    feetPerSquare: 25,
    gridWidth: 6,
    gridHeight: 6,
    startPos: { x: 3, y: 4 },
    // Cosmetic: a cobblestone square around the village well, ringed by pine.
    terrain: [
      ...terr('water', [3, 1]), // the well
      ...terr('cobblestone', [3, 2], [3, 3], [3, 4], [2, 3], [4, 3]),
      ...terr('garden', [0, 0], [5, 0], [0, 5], [5, 5], [0, 3], [5, 3]),
    ],
    venues: [
      {
        id: 'venue_square_grove',
        name: 'Village Square',
        pos: { x: 1, y: 2 },
        kind: 'interior',
        entryRoomId: 'pinegate_square',
      },
      {
        id: 'venue_lodge_grove',
        name: 'The Burnt Stump',
        pos: { x: 4, y: 2 },
        kind: 'interior',
        entryRoomId: 'pinegate_lodge',
      },
      { id: 'venue_gate_grove', name: 'Village Edge', pos: { x: 3, y: 5 }, kind: 'gate' },
    ],
  },
];
