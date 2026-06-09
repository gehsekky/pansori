// The throwaway campaign the e2e suite seeds at test time (via the gated
// POST /api/test/seed-campaign route — see routes/testSeed.ts). It exists so
// the e2e can prove the DB-campaign play path WITHOUT the project shipping a
// built-in campaign: the test plants it into an ephemeral database, runs, and
// the database is discarded.
//
// It's deliberately compact but complete enough to mirror the e2e's coverage:
//   - recommendedParty drives auto-fill to a Fighter/Cleric/Rogue/Wizard party
//     (the martials never surface cast_spell; Cleric+Wizard always do — the
//     base template already supplies their spell lists).
//   - a starting region with a single 'local' site one step from the party's
//     start, whose entry room holds exactly two Goblin Warriors (an SRD-catalog
//     monster — no custom bestiary needed) so the initiative strip reads
//     4 PCs + 2 enemies = 6.
//
// Everything else (class machinery, spell lists, backgrounds, theme, narrative
// pools) resolves from the SRD base template these sections overlay.

import type { CampaignRegion, CampaignRoom, EditableSection } from './campaignContent.js';

export const E2E_CAMPAIGN_ID = 'e2e-proving-grounds';
export const E2E_CAMPAIGN_NAME = 'The Proving Grounds';

// A small overland field: the party starts at the west edge and the lone
// skirmish site sits one cell east — revealed and travelable immediately, so
// the e2e reaches combat in a single step.
const REGIONS: CampaignRegion[] = [
  {
    id: 'proving_region',
    name: 'The Proving Field',
    isStartingRegion: true,
    desc: 'A flat training field, fenced off for drills and the occasional real fight.',
    onEnter: [
      'The proving field opens ahead — trampled grass, and movement near the practice ring.',
    ],
    feetPerSquare: 5280,
    startPos: { x: 0, y: 1 },
    grid: [
      [{ t: 'plains' }, { t: 'plains' }, { t: 'plains' }, { t: 'plains' }],
      [{ t: 'road' }, { t: 'road' }, { t: 'plains' }, { t: 'plains' }],
      [{ t: 'plains' }, { t: 'plains' }, { t: 'plains' }, { t: 'plains' }],
    ],
    sites: [
      {
        id: 'site_skirmish',
        name: 'The Practice Ring',
        pos: { x: 1, y: 1 },
        kind: 'local',
        entryRoomId: 'skirmish_room',
        icon: 'crossed-swords',
        onEnter: ['Two goblins have taken over the practice ring — they turn as you step in.'],
      },
    ],
  },
];

// The combat room: a bare ring with two Goblin Warriors. No explicit enemy
// positions — the engine seeds them onto the grid at combat start, the same as
// every other placed-enemy room.
const ROOMS: CampaignRoom[] = [
  {
    id: 'skirmish_room',
    name: 'The Practice Ring',
    desc: 'A packed-dirt ring ringed by splintered training dummies.',
    onEnter: ['Sand scuffs underfoot. The two goblins ready their blades.'],
    floor: 'dirt',
    entryPos: { x: 2, y: 5 },
    grid: Array.from({ length: 6 }, () => Array.from({ length: 6 }, () => ({}))),
    enemies: [{ name: 'Goblin Warrior', count: 2 }],
  },
];

// The DB sections this campaign overlays onto the base template, applied in
// order (the campaign row is created first by the seed route). Each value
// matches the shape PUT /api/campaigns/:id/data/:section accepts.
export const E2E_CAMPAIGN_SECTIONS: { section: EditableSection; value: unknown }[] = [
  { section: 'worldName', value: E2E_CAMPAIGN_NAME },
  { section: 'tagline', value: 'A throwaway proving ground for the end-to-end suite.' },
  {
    section: 'gameStart',
    value:
      'A drill sergeant waves you onto the proving field. "Two goblins got loose in the practice ring," ' +
      'she grunts. "Earn your keep." The field is yours to cross.',
  },
  {
    section: 'recommendedParty',
    value: { size: 4, composition: ['Fighter', 'Cleric', 'Rogue', 'Wizard'] },
  },
  { section: 'regions', value: REGIONS },
  { section: 'rooms', value: ROOMS },
];
