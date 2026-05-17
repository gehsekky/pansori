import { ShieldChevron, Sword, Crosshair, Drop, Scroll } from '@phosphor-icons/react';
import type { FrontendContext } from '../types.js';

export const context: FrontendContext = {
  id: 'sunken-below',

  displayName: 'Sunken Below',
  tagline: 'Something came up with the core sample. You have 47 minutes of ascent time.',
  previewArt: `
  NEREID-2: READY
  [LAUNCH SEQUENCE]
  depth: 6,831m
  ==================
  crew: unaccounted
  specimen: ESCAPED
  O2: 18% !! LOW !!
  * it knows you're here`,

  classes: [
    {
      id: 'Biologist',
      desc: 'High WIS. Medicine + Perception. Understands what it is. Still has to fight it.',
    },
    {
      id: 'Diver',
      desc: 'High CON. Athletics + Survival. Six hundred dives. This one is different.',
    },
    { id: 'Salvager', desc: 'High STR. Athletics + Intimidation. Hit first. Identify later.' },
    { id: 'Engineer', desc: 'High INT. Investigation + Arcana. Finds the structural weak point.' },
    {
      id: 'Medic',
      desc: 'High WIS. Medicine + Survival. Triage decision: neutralize threat first.',
    },
  ],

  classPrimaryStats: {
    Biologist: 'WIS',
    Diver: 'CON',
    Salvager: 'STR',
    Engineer: 'INT',
    Medic: 'WIS',
  },

  classSkills: {
    Biologist: ['Medicine', 'Perception'],
    Diver: ['Athletics', 'Survival'],
    Salvager: ['Athletics', 'Intimidation'],
    Engineer: ['Investigation', 'Arcana'],
    Medic: ['Medicine', 'Survival'],
  },

  theme: {
    pageBg: '#020609',
    cardBg: '#04090f',
    font: '"Courier New", monospace',
    primary: '#00b4d8',
    mid: '#0096c7',
    dim: '#1a86c2',
    dimDark: '#03045e',
    border: '#0077b6',
    separator: '#03045e',
    itemColor: '#0077b6',
    hpHigh: '#00b4d8',
    hpMid: '#f77f00',
    hpLow: '#d62828',
    title: 'SUNKEN BELOW',
    worldLabel: 'ABOARD',
  },

  itemIcons: {
    pressure_suit: <ShieldChevron size={14} weight="bold" />,
    diving_knife: <Sword size={14} weight="bold" />,
    flare_pistol: <Crosshair size={14} weight="bold" />,
    oxygen_canister: <Drop size={14} weight="bold" />,
    research_notes: <Scroll size={14} weight="bold" />,
  },

  itemDescs: {
    pressure_suit: '+3 AC while equipped. Rated to 700 ATM.',
    diving_knife: '1d4+1 damage. Standard-issue station equipment.',
    flare_pistol: '1d6 damage, ranged. Effective at close range.',
    oxygen_canister: 'Restores 2d4 HP. Emergency O2 supply.',
    research_notes: "Dr. Vasquez's field notes. Answers more questions than you wanted.",
  },

  art: {
    airlock: `
   _____________________
  |   - AIRLOCK A-7 -   |
  |=====================|
  |[OUTER DOOR: SEALED] |
  |[INNER DOOR: OPEN  ] |
  |                     |
  |  PRESSURE: 340 ATM  |
  |  O2: 18%  !!LOW!!   |
  |                     |
  |  [EMERGENCY  KIT ]  |
  |  ~ red . blink . ~  |
  |  DEPTH: 6,800m      |
  |=====================|
  |_____________________|`,

    flooded_lab: `
   _____________________
  | - RESEARCH LAB B2 - |
  |=====================|
  | ~~~~~~~~~~~~~~~~~~~ |
  | ~  KNEE-DEEP  H2O ~ |
  | ~~~~~~~~~~~~~~~~~~~ |
  |   [tank] [EMPTY ]   |
  |   [tank] [tank  ]   |
  |                     |
  | LOG — entry 847:    |
  | "initial contact"   |
  |  water: still warm  |
  |=====================|
  |_____________________|`,

    pressure_corridor: `
   _____________________
  |- PRESSURE CORRIDOR -|
  |=====================|
  |  <<<< 40 meters >>>> |
  |                     |
  |  crack: hairline    |
  |  seam: compromised  |
  |                     |
  |  !!! HULL STRESS !!!|
  |  groan . . . crack  |
  |                     |
  |  sensors: triggered |
  |=====================|
  |_____________________|`,

    crew_quarters: `
   _____________________
  |  - CREW QUARTERS -  |
  |=====================|
  | [bunk][bunk][bunk]  |
  | [    ][    ][    ]  |
  |  meal: half-eaten   |
  |  photo: dog, yard   |
  |                     |
  | [LOCKER: open ]     |
  | [LOCKER: open ]     |
  | [LOCKER: sealed]    |
  |  from the inside    |
  |=====================|
  |_____________________|`,

    specimen_vault: `
   _____________________
  |  - SPECIMEN VAULT - |
  |=====================|
  | !! BIOHAZARD !!     |
  |[CONTAINMENT: OFF  ] |
  |[SAMPLE CASE: OPEN ] |
  |                     |
  | scratches on floor  |
  | radial . outward    |
  |                     |
  | DEPTH OF ORIGIN:    |
  | 6,831m              |
  |=====================|
  |_____________________|`,

    submersible_bay: `
   _____________________
  | - SUBMERSIBLE BAY - |
  |=====================|
  |       ________      |
  |      / NEREID  \\    |
  |     |    -2-   |   |
  |     |  [READY] |   |
  |      \\________/    |
  |                     |
  | [LAUNCH  SEQUENCE]  |
  | [=================] |
  |  ascent: 47 min     |
  |=====================|
  |_____________________|`,
  },
};
