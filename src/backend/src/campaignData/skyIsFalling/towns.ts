// Silverford — the frontier melting-pot stilt-town on giant-bone pilings, the
// Act I hub. feetPerSquare 25 (settlement scale). Venues are the town grid's
// transition cells: 'interior' opens a room (the five spine locations); the
// 'gate' ascends back to the Sunder-Carr overworld. Hub-local venues cost no
// Time Block — only the marsh sites burn the clock (see rules.ts).

import type { CampaignTown } from '../../services/campaignContent.js';

const townGrid = Array.from({ length: 8 }, () =>
  Array.from({ length: 10 }, () => ({ t: 'plains' }) as { t: string; ez?: string })
);

export const TOWNS: CampaignTown[] = [
  {
    id: 'silverford',
    name: 'Silverford',
    desc:
      'A ramshackle stilt-town lashed to the bleached ribs of a buried giant, ' +
      'where Malgovian iron, Valerion silver, and smuggler grey all rub shoulders ' +
      'over the same rotting boardwalks.',
    onFirstEnter: [
      'Silverford rises out of the mist on its giant-bone pilings — lantern-light, ' +
        'woodsmoke, and the low murmur of a town that knows two armies are coming.',
    ],
    onEnter: ['The boardwalks of Silverford creak underfoot.'],
    feetPerSquare: 25,
    floor: 'cobblestone',
    grid: townGrid,
    startPos: { x: 5, y: 6 },
    venues: [
      {
        id: 'garrison_hall',
        name: 'Malgovian Garrison Hall',
        pos: { x: 2, y: 2 },
        kind: 'interior',
        entryRoomId: 'garrison_hall_room',
        desc: 'A timber hall under crimson-and-bone banners. Commander Vargis holds the frontier here.',
      },
      {
        id: 'silverford_store',
        name: 'Bremmer’s General Store',
        pos: { x: 5, y: 2 },
        kind: 'interior',
        entryRoomId: 'store_room',
        desc: 'The town’s only shop — currently overrun by giant rats.',
      },
      {
        id: 'relic_vault_anteroom',
        name: 'Gavel Relic Vault',
        pos: { x: 8, y: 2 },
        kind: 'interior',
        entryRoomId: 'vault_room',
        desc: 'A small neutral vault of the Iron Gavel. Sister Martha keeps the reliquaries.',
      },
      {
        id: 'lorien_den',
        name: "Lorien's Den",
        pos: { x: 1, y: 5 },
        kind: 'interior',
        entryRoomId: 'lorien_den_room',
        desc: 'The back room of a smuggler’s shack. Information for coin or leverage.',
      },
      {
        id: 'silverford_docks',
        name: 'Silverford Docks',
        pos: { x: 8, y: 5 },
        kind: 'interior',
        entryRoomId: 'docks_room',
        desc: 'The stilt-town wharf — fishers, smugglers, and frightened locals.',
      },
      {
        id: 'silverford_gate',
        name: 'The Causeway Out',
        pos: { x: 5, y: 7 },
        kind: 'gate',
        desc: 'The plank road out of Silverford, into the Sunder-Carr.',
      },
    ],
  },
];
