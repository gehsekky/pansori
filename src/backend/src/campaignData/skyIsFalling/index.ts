// THE SKY IS FALLING — pansori's flagship starter campaign (see docs/STORY.md).
//
// Authored as a version-controlled fixture (not hand-clicked in the creator) so
// it ships with pansori, survives DB wipes, is code-reviewable, and doubles as
// the canonical stress-test of the section schemas. It's seeded into a dev DB
// via `npm run seed:sky` (scripts/seedSkyIsFalling.ts), which writes each
// section through the SAME putCampaignSection pipeline the creator UI uses — so
// the campaign stays fully editable in the creator afterward.
//
// Setting: the continent of Utgard (`world_name`). Act I — "The Forensic Trail
// of Star-Metal" — is a 24-hour forensic countdown in and around the stilt-town
// of Silverford, ending in diplomacy (evidence found) or war (the clock runs
// out → the Battle of Silverford). Sci-fi fiction, 100% SRD 5.2.1 mechanics:
// every "alien" enemy is a campaign-level clone of an SRD stat block.
//
// The fixture is assembled bottom-up from sibling files so cross-referenced ids
// (rooms→monsters/items/npcs, regions→towns/rooms, quests/rules→flags) stay in
// one coherent place. Sections are applied in dependency order by the seeder.

import { ACTS } from './acts.js';
import type { EditableSection } from '../../services/campaignContent.js';
import { FACTIONS } from './factions.js';
import { ITEMS } from './items.js';
import { MONSTERS } from './monsters.js';
import { MONSTERS_ACT2 } from './monstersAct2.js';
import { QUESTS } from './quests.js';
import { QUESTS_ACT2 } from './questsAct2.js';
import { REGIONS } from './regions.js';
import { REGIONS_ACT2 } from './regionsAct2.js';
import { ROOMS } from './rooms.js';
import { ROOMS_ACT2 } from './roomsAct2.js';
import { RULES } from './rules.js';
import { TOWNS } from './towns.js';
import { TOWNS_ACT2 } from './townsAct2.js';

export const SKY_CAMPAIGN_ID = 'the-sky-is-falling';
export const SKY_CAMPAIGN_NAME = 'The Sky Is Falling';

// The opening crawl — picked once per new game (a one-variant pool here).
const GAME_START =
  'Two Justiciars of the Iron Gavel ride into the Sunder-Carr under a sky the ' +
  'color of wet slate. Word reached the circuit court three days ago: the ' +
  'logging village of Miller’s Thicket, wiped out to the last soul, and a ' +
  'relic gone from a neutral vault. The Malgovian garrison blames Valerion ' +
  'raiders; Valerion blames the Imperium. Two armies are a day’s march ' +
  'apart and closing. Your diplomatic immunity buys exactly one thing — time. ' +
  'Twenty-four hours to find the truth before the Battle of Silverford writes ' +
  'it in blood. Cassian Althion checks his shield; Julian Sterling opens his ' +
  'forensic case. The stilt-town of Silverford waits ahead on its giant-bone ' +
  'pilings.';

// The pre-gen Justiciars (required, locked name+class) + the recommended fill.
// Cassian → Fighter (equally lethal with or without magic — the Act IV anchor);
// Julian → Wizard (the forensic intellect whose power the Act IV field steals).
const RECOMMENDED_PARTY = {
  size: 4,
  composition: ['Fighter', 'Wizard', 'Cleric', 'Rogue'],
  requiredMembers: [
    { name: 'Cassian Althion', cls: 'Fighter' },
    { name: 'Julian Sterling', cls: 'Wizard' },
  ],
  // Act I is balanced for L3 (STORY.md Part 8 level curve). The party is built
  // straight to L3 at creation — HP/slots/subclass + a level-3 caster loadout —
  // instead of starting L1 against L3-tier encounters.
  startingLevel: 3,
};

// The DB sections this campaign overlays onto the SRD base template, applied in
// dependency order (leaf data first; geography/quests/acts reference it). Each
// value matches the shape PUT /api/campaigns/:id/data/:section accepts.
export const SKY_CAMPAIGN_SECTIONS: { section: EditableSection; value: unknown }[] = [
  { section: 'worldName', value: 'Utgard' },
  {
    section: 'tagline',
    value: 'Two Justiciars. Twenty-four hours. A massacre that was no raid.',
  },
  { section: 'gameStart', value: GAME_START },
  { section: 'recommendedParty', value: RECOMMENDED_PARTY },
  // Leaf data first — geography / quests / rules / acts reference it by id/name.
  { section: 'factions', value: FACTIONS },
  // Act I + Act II content is concatenated into the SAME section arrays (one
  // section per content type) — putCampaignSection applies them in array order,
  // so leaf data (monsters) precedes geography (regions) which precedes acts.
  { section: 'customMonsters', value: [...MONSTERS, ...MONSTERS_ACT2] },
  { section: 'customItems', value: ITEMS },
  { section: 'rooms', value: [...ROOMS, ...ROOMS_ACT2] },
  { section: 'towns', value: [...TOWNS, ...TOWNS_ACT2] },
  { section: 'regions', value: [...REGIONS, ...REGIONS_ACT2] },
  { section: 'quests', value: [...QUESTS, ...QUESTS_ACT2] },
  { section: 'rules', value: RULES },
  { section: 'acts', value: ACTS }, // act2 already appended in acts.ts
];
