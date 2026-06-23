// The Valerion capital — Act II's high-society hub, authored as MULTIPLE
// connected district Towns (D-04) rather than a single settlement. After Act I's
// grey frontier marsh, the capital is a deliberate tonal jump: white marble,
// liveried guards, scholars and courtiers, a gilded order that the Weavers are
// quietly hollowing from beneath. feetPerSquare 25 (settlement scale), floor
// 'cobblestone' — both matching Silverford, but each district grid is GRANDER
// than Silverford's 8×10 (D-04).
//
// The two districts mirror the region's two town-sites (regionsAct2.ts):
//   - The Court District (valerion_court_district) — the royal court and the
//     high-society ball, plus a coaching inn for texture (D-05).
//   - The Library District (valerion_library_district) — Lady Elara's Grand
//     Library (the decode-beat anchor and the Plan 03 undercroft descent) and a
//     scholars' market for texture (D-05).
//
// Venue discipline (D-05): every `kind:'interior'` venue opens a loadable room
// (roomsAct2.ts, Task 2); every district has EXACTLY ONE `kind:'gate'` venue
// back to the heartland region. Icons reuse existing redistributable glyph keys
// only — the free tier renders without the painted-art overlay (CLAUDE.md
// "Assets"). The venue-wiring spec (skyIsFalling.spec.ts) asserts each town id
// matches a region town-site townId, each entryRoomId resolves to a real room,
// and each district has exactly one gate.

import type { CampaignTown } from '../../services/campaignContent.js';

// A w×h grid of cobblestone cells (settlement scale); both districts are larger
// than Silverford's 8×10 per D-04. Returns a fresh grid each call so the two
// districts don't share a mutable array.
const capitalGrid = (w: number, h: number) =>
  Array.from({ length: h }, () =>
    Array.from({ length: w }, () => ({ t: 'plains' }) as { t: string; ez?: string })
  );

export const TOWNS_ACT2: CampaignTown[] = [
  // ── The Court District ─────────────────────────────────────────────────────
  // The seat of Valerion power: the throne hall and the grand ballrooms where
  // the high-society opening of Act II plays out. 12×12 — grander than Silverford.
  {
    id: 'valerion_court_district',
    name: 'The Court District',
    desc:
      'Marble colonnades and gilded gates ring the royal court of Valerion, ' +
      'where ministers, peers, and liveried guards conduct the business of an ' +
      'empire — and where, tonight, the great ballroom is lit for a gathering of ' +
      'the heartland’s finest.',
    onFirstEnter: [
      'The Court District opens before you in white marble and banners of Valerion ' +
        'gold — a world away from the Sunder-Carr’s rotting boardwalks. Somewhere ' +
        'beneath the music, a relic is humming.',
    ],
    onEnter: ['Liveried guards and gilded doors mark the Court District of the capital.'],
    feetPerSquare: 25,
    floor: 'cobblestone',
    grid: capitalGrid(12, 12),
    startPos: { x: 6, y: 10 },
    venues: [
      {
        id: 'valerion_court',
        name: 'The Royal Court',
        pos: { x: 3, y: 2 },
        kind: 'interior',
        entryRoomId: 'valerion_court_room',
        desc: 'The throne hall of Valerion — ministers, petitioners, and the crown’s long memory.',
      },
      {
        id: 'valerion_ball',
        name: 'The Grand Ballroom',
        pos: { x: 9, y: 2 },
        kind: 'interior',
        entryRoomId: 'valerion_ball_room',
        desc: 'A high-society ball under crystal and candlelight — the capital’s elite at play.',
      },
      {
        id: 'valerion_court_inn',
        name: 'The Gilded Lantern',
        pos: { x: 2, y: 7 },
        kind: 'interior',
        entryRoomId: 'valerion_inn_room',
        desc: 'A genteel coaching inn off the court square — beds, board, and overheard gossip.',
      },
      // The Vance estate — the Quentin "Old Money" exposé venue (Plan 04-03, D-11).
      // An interior venue opening the counting-house cellar (vance_cellar_room),
      // where Quentin's Weaver Magus lieutenant guards the master ledger. Placed at
      // (10,8) — in-bounds on the 12×12 court grid, non-colliding with the other
      // venues (3,2)/(9,2)/(2,7) and the gate (6,11). NOT a gate (the district keeps
      // exactly one kind:'gate', valerion_court_gate).
      {
        id: 'vance_estate',
        name: 'The Vance Estate',
        pos: { x: 10, y: 8 },
        kind: 'interior',
        entryRoomId: 'vance_cellar_room',
        desc: 'The gilded townhouse of the Vance family — and, beneath it, an old counting-house cellar best left unseen.',
      },
      {
        id: 'valerion_court_gate',
        name: 'The Court Gate',
        pos: { x: 6, y: 11 },
        kind: 'gate',
        desc: 'The capital’s grand gate, out onto the kingsroad and the Valerion heartland.',
      },
    ],
  },
  // ── The Library District ───────────────────────────────────────────────────
  // The scholars' quarter, crowned by Lady Elara's Grand Library. The Grand
  // Library room is the geographic anchor of the decode beat (Phase 3) and the
  // Weaver-cell undercroft descent (Plan 03). 12×12 — grander than Silverford.
  {
    id: 'valerion_library_district',
    name: 'The Library District',
    desc:
      'Ink, old vellum, and lamp-oil thread the air of the scholars’ quarter, ' +
      'whose every street bends toward the great dome of Lady Elara’s Grand ' +
      'Library — the deepest archive in the heartland, and the place where the ' +
      'star-metal’s secret will finally be read.',
    onFirstEnter: [
      'The Library District climbs in terraces of pale stone toward the Grand ' +
        'Library’s dome. Booksellers, copyists, and quiet scholars throng the ' +
        'arcades; the whole quarter smells of old paper and lamp-oil.',
    ],
    onEnter: ['The arcades of the Library District wind up toward the Grand Library’s dome.'],
    feetPerSquare: 25,
    floor: 'cobblestone',
    grid: capitalGrid(12, 12),
    startPos: { x: 6, y: 10 },
    venues: [
      {
        id: 'valerion_grand_library',
        name: "Lady Elara's Grand Library",
        pos: { x: 6, y: 2 },
        kind: 'interior',
        entryRoomId: 'grand_library_room',
        desc: 'The heartland’s deepest archive — galleries of vellum under a great dome, and Lady Elara’s decoding tables.',
      },
      {
        id: 'valerion_market',
        name: 'The Scholars’ Market',
        pos: { x: 10, y: 6 },
        kind: 'interior',
        entryRoomId: 'valerion_market_room',
        desc: 'A bustling market of booksellers, scribes, and curio-traders along the library arcades.',
      },
      {
        id: 'valerion_library_gate',
        name: 'The Library Gate',
        pos: { x: 6, y: 11 },
        kind: 'gate',
        desc: 'The quarter’s gate, back onto the kingsroad and the Valerion heartland.',
      },
    ],
  },
];
