// The Valerion Heartland — the overworld of Act II. A deliberate tonal jump from
// Act I's grey frontier marsh: tilled fields, kingsroads, and the towers of the
// Valerion capital under a clean sky. feetPerSquare 5280 (≈1 mile/square) is kept
// at Act-I scale for consistency (D-01), but Act II reads NO world-time clock —
// so unlike the Sunder-Carr's distance-scarcity geometry, every site here stays
// mutually reachable. Distance is pure flavor (D-03).
//
// Terrain is the HEARTLAND palette (roads/plains/forest), never marsh. All cells
// are passable; the only texture is a small forest copse that the kingsroads route
// around. The navigability spec (tests/campaign/skyIsFalling.spec.ts) asserts every
// site is BFS-reachable from startPos, so no edit can accidentally strand a site.
//
// Sites: the capital authored as connected DISTRICT towns (Court district +
// Library district, per D-04 — defined in townsAct2.ts, Plan 02), plus 1–2
// light flavor/travel sites for heartland texture (D-02). The Weaver-cell raid
// undercroft is NOT a region site (D-09): it descends from inside the Grand
// Library room (Plan 03).

import type { CampaignRegion } from '../../services/campaignContent.js';

// An 8×8 heartland map: kingsroads threading tilled plains, a forest copse for
// flavor in the north-west. Every terrain type here is passable (roads/plains/
// forest), so the region is fully traversable — the heartland has no clock and
// no walls (D-01/D-03). The copse is cosmetic texture the roads route around.
function valerionGrid() {
  const g = Array.from({ length: 8 }, () =>
    Array.from({ length: 8 }, () => ({ t: 'plains' }) as { t: string; ez?: string })
  );
  // The kingsroad spine — the capital's approach, drawn for flavor (faster
  // travel mult, lower encounter weight); still fully passable.
  for (let x = 1; x <= 6; x++) g[6][x] = { t: 'road' };
  g[5][4] = { t: 'road' };
  g[4][4] = { t: 'road' };
  // A forest copse in the north-west — heartland texture, passable, routable.
  g[1][1] = { t: 'forest' };
  g[1][2] = { t: 'forest' };
  g[2][1] = { t: 'forest' };
  return g;
}

export const REGIONS_ACT2: CampaignRegion[] = [
  {
    id: 'valerion_heartland',
    name: 'The Valerion Heartland',
    // Act I keeps the campaign's starting region; Act II is entered via its act
    // record, not as the campaign's first region.
    isStartingRegion: false,
    desc:
      'The cultivated heart of Valerion: hedged fields and orchards along the ' +
      'kingsroad, the white spires of the capital rising ahead. After the ' +
      'Sunder-Carr, the order of it feels almost like a held breath.',
    onFirstEnter: [
      'The kingsroad lifts you out of the borderlands and into the Valerion ' +
        'heartland — tilled fields to the horizon, the capital’s towers pale and ' +
        'sharp against a clean sky. Somewhere under all that order, a relic is ' +
        'humming.',
    ],
    onEnter: ['The kingsroad runs straight and sure toward the Valerion capital.'],
    feetPerSquare: 5280,
    startPos: { x: 1, y: 6 },
    grid: valerionGrid(),
    sites: [
      // The capital's Court district — the throne, the high-society ball venue.
      // townId is the contract Plan 02's townsAct2.ts will adopt.
      {
        id: 'site_court_district',
        name: 'The Court District',
        pos: { x: 4, y: 6 },
        kind: 'town',
        townId: 'valerion_court_district',
        icon: 'castle',
        desc: 'The capital’s seat of power — the royal court and the grand ballrooms of Valerion society.',
        onEnter: [
          'Marble colonnades and liveried guards mark the Court District; the ' +
            'business of an empire hums behind every gilded door.',
        ],
      },
      // The capital's Library district — Lady Elara's Grand Library, anchor of
      // the decode beat (Phase 3) and the undercroft descent (Plan 03).
      {
        id: 'site_library_district',
        name: 'The Library District',
        pos: { x: 6, y: 5 },
        kind: 'town',
        townId: 'valerion_library_district',
        icon: 'book',
        desc: 'The scholar’s quarter, crowned by Lady Elara’s Grand Library — the heartland’s deepest archive.',
        onEnter: [
          'Ink, old vellum, and lamp-oil thread the air of the Library District; ' +
            'the Grand Library’s dome looms over the rooftops.',
        ],
      },
      // A light flavor/travel site — heartland texture seeding Phase 5's
      // side-quest layer (D-02). A single room (entryRoomId, Plan 02/03).
      {
        id: 'site_kingsroad_inn',
        name: 'The Wayfarer’s Rest',
        pos: { x: 2, y: 6 },
        kind: 'local',
        entryRoomId: 'kingsroad_inn_room',
        icon: 'campfire',
        desc: 'A bustling coaching inn on the kingsroad, last comfort before the capital gates.',
        onEnter: [
          'Lantern-light and the smell of roast spill from the Wayfarer’s Rest by the road.',
        ],
      },
      // A second flavor site — a roadside heartland landmark.
      {
        id: 'site_old_orchard',
        name: 'The Hollowing Orchard',
        pos: { x: 1, y: 2 },
        kind: 'local',
        entryRoomId: 'hollowing_orchard_room',
        icon: 'campfire',
        desc: 'An old apple orchard gone strangely quiet — the first faint wrongness in the heartland’s order.',
        onEnter: [
          'The orchard rows stand too still, fruit unpicked and silent in the afternoon light.',
        ],
      },
    ],
  },
];
