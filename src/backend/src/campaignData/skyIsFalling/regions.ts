// The Sunder-Carr — the misty wetland overworld of Act I. feetPerSquare 5280
// (≈1 mile/square), so crossing the marsh between sites burns real world-time —
// the geography enforces the scarcity the 24-hour clock dramatizes. The leads
// are spread across the sites on purpose: you cannot chase all of them.
//
// Sites: Silverford (the town hub), Miller's Thicket (the massacre site → the
// thicket_approach → ash-pit → tomb-mound chain), the Drowned Causeway (the
// third-party clue + the lost locket), and Vane's Overlook (the Valerion line).

import type { CampaignRegion } from '../../services/campaignContent.js';

// An 8×8 wetland: mostly swamp, Silverford on a dry verge, and a small pond for
// flavor. Overland `water` is IMPASSABLE, so the pond is only a 2×2 patch — it
// must NOT span a row, or it would wall off the northern sites (Miller's
// Thicket, Vane's camp) from the southern hub and the party could never reach
// them ("No path there"). Everything stays mutually reachable.
function carrGrid() {
  const g = Array.from({ length: 8 }, () =>
    Array.from({ length: 8 }, () => ({ t: 'swamp' }) as { t: string; ez?: string })
  );
  // A small impassable pond off to the west — routable around, never blocking.
  g[3][0] = { t: 'water' };
  g[4][0] = { t: 'water' };
  g[3][1] = { t: 'water' };
  g[6][1] = { t: 'plains' }; // Silverford's dry verge
  g[6][2] = { t: 'plains' };
  return g;
}

export const REGIONS: CampaignRegion[] = [
  {
    id: 'sunder_carr',
    name: 'The Sunder-Carr',
    isStartingRegion: true,
    desc:
      'A sprawling, misty wetland of waterlogged ironwoods and treacherous peat ' +
      'bogs, the bones of departed giants breaking the surface like grey reefs.',
    onFirstEnter: [
      'The Sunder-Carr opens grey and endless, the smell of rot and cold iron on ' +
        'the wind. Somewhere out in the mist, two armies are counting down the hours.',
    ],
    onEnter: ['Mist coils across the black water of the Sunder-Carr.'],
    feetPerSquare: 5280,
    startPos: { x: 1, y: 6 },
    grid: carrGrid(),
    sites: [
      {
        id: 'site_silverford',
        name: 'Silverford',
        pos: { x: 2, y: 6 },
        kind: 'town',
        townId: 'silverford',
        icon: 'village',
        desc: 'The stilt-town hub: garrison, docks, vault, and Lorien’s den.',
        onEnter: ['The plank causeway into Silverford thuds hollow over the giant-bones below.'],
      },
      {
        id: 'site_millers_thicket',
        name: 'Miller’s Thicket',
        pos: { x: 5, y: 2 },
        kind: 'local',
        entryRoomId: 'thicket_approach',
        icon: 'campfire',
        desc: 'The ash-ruin of the wiped-out logging village. The core of the investigation.',
        onEnter: ['The ironwoods give way to a black scar where Miller’s Thicket used to stand.'],
      },
      {
        id: 'site_bog_path',
        name: 'The Drowned Causeway',
        pos: { x: 6, y: 5 },
        kind: 'local',
        entryRoomId: 'causeway',
        icon: 'stone-bridge',
        desc: 'A sunken stone road through the open bog — an ambush leg, and a hidden clue.',
        onEnter: ['Black water laps over a sunken stone road ahead.'],
      },
      {
        id: 'site_vane_camp',
        name: 'Miller’s Thicket Overlook',
        pos: { x: 6, y: 1 },
        kind: 'local',
        entryRoomId: 'vane_command',
        icon: 'tent',
        desc: 'The dry rise where Lucian Vane’s Valerion vanguard waits to march.',
        onEnter: ['Valerion silver-and-white banners hang limp over a command pavilion ahead.'],
      },
    ],
  },
];
