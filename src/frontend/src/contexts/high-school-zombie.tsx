import {
  BaseballCap,
  Fire,
  BookOpen,
  ShieldChevron,
  TShirt,
  ForkKnife,
  FirstAidKit,
  Flask,
  SmileyXEyes,
  Ticket,
} from '@phosphor-icons/react';
import type { FrontendContext } from '../types.js';

export const context: FrontendContext = {
  id: 'high-school-zombie',

  displayName: 'High School Zombie',
  tagline: 'You woke up in gym class. This is worse than gym class.',
  previewArt: `
  PA: ROOFTOP. NOW.
  [HELICOPTER INBOUND]
  ==================
  locker . hallway
  cafeteria . lab
  ROOFTOP: 6 rooms
  * they were students`,

  classes: [
    { id: 'Jock', desc: 'High STR. Extra attack at level 3. Varsity instincts.' },
    { id: 'Nerd', desc: 'High INT. Identify items. Improvised weapon crafter.' },
    { id: 'Cheerleader', desc: 'High CHA. Advantage on persuasion. Unnervingly upbeat.' },
    { id: 'Goth', desc: 'High DEX. Sneak proficiency. Emotionally prepared for this.' },
    { id: 'Teacher', desc: 'High WIS. Medicine bonus. Has seen worse Mondays.' },
  ],

  classPrimaryStats: {
    Jock: 'STR',
    Nerd: 'INT',
    Cheerleader: 'CHA',
    Goth: 'DEX',
    Teacher: 'WIS',
  },

  classSkills: {
    Jock: ['Athletics', 'Intimidation'],
    Nerd: ['Arcana', 'Investigation'],
    Cheerleader: ['Persuasion', 'Deception'],
    Goth: ['Stealth', 'Perception'],
    Teacher: ['Medicine', 'Insight'],
  },

  theme: {
    pageBg: '#080b08',
    cardBg: '#0c100c',
    font: '"Courier New", monospace',
    primary: '#7fff00',
    mid: '#5fcc00',
    dim: '#6a9900',
    dimDark: '#1a3800',
    border: '#336600',
    separator: '#0f1f0f',
    itemColor: '#3a6600',
    hpHigh: '#7fff00',
    hpMid: '#cccc00',
    hpLow: '#cc3333',
    title: 'HIGH SCHOOL ZOMBIE',
    worldLabel: 'TRAPPED IN',
  },

  itemIcons: {
    baseball_bat: <BaseballCap size={14} weight="bold" />,
    fire_extinguisher: <Fire size={14} weight="bold" />,
    textbook: <BookOpen size={14} weight="bold" />,
    cafeteria_tray: <ShieldChevron size={14} weight="bold" />,
    lab_coat: <TShirt size={14} weight="bold" />,
    letterman_jacket: <TShirt size={14} weight="bold" />,
    energy_drink: <ForkKnife size={14} weight="bold" />,
    first_aid_kit: <FirstAidKit size={14} weight="bold" />,
    chemistry_bomb: <Flask size={14} weight="bold" />,
    hall_pass: <Ticket size={14} weight="bold" />,
  },

  itemDescs: {
    baseball_bat: 'Aluminum. Good weight. Has seen one previous apocalypse.',
    fire_extinguisher: 'Blinding spray, then a very satisfying clunk. Ranged.',
    textbook: 'Pre-Calculus, 4th edition. 900 pages. Finally useful.',
    cafeteria_tray: '+2 AC while equipped. Industrial plastic. Surprisingly robust.',
    lab_coat: '+1 AC while equipped. Heavy cotton. Placebo? Sure.',
    letterman_jacket: '+2 AC while equipped. Thick leather sleeves. Jefferson High, 2022.',
    energy_drink: 'Questionable ingredients. Unquestionable desperation.',
    first_aid_kit: "From the nurse's office. Gauze, antiseptic, bandages. The good stuff.",
    chemistry_bomb: 'A beaker of something volatile. Use with hope.',
    hall_pass: "Laminated. Mrs. Henderson's name. She won't need it back.",
  },

  art: {
    gymnasium: `
   _____________________
  |    - GYMNASIUM -    |
  |=====================|
  |  __   HOME  47      |
  | |  |  VISIT 12      |
  | |  |                |
  | |__|  SCOREBOARD    |
  |                     |
  | (===) BLEACHERS     |
  | (===) knocked over  |
  |                     |
  |  ~ whistle on floor ~|
  |=====================|
  |_____________________|`,

    cafeteria: `
   _____________________
  |   - CAFETERIA -     |
  |=====================|
  | [LUNCH LINE: OPEN]  |
  |  ---|---|---|---     |
  | [  SNEEZE GUARD  ]  |
  |   today's special   |
  |   ~ undisclosed ~   |
  |                     |
  |  ___|___|___|___    |
  | |   tables      |   |
  | |___|___|___|___|   |
  |  Jell-O: untouched  |
  |=====================|
  |_____________________|`,

    library: `
   _____________________
  |    - LIBRARY -      |
  |=====================|
  |[book][book][book]   |
  |[book][book][book]   |
  |[book][    ][book]   |
  | "QUIET PLEASE"      |
  |                     |
  |  _______________    |
  | |  READING AREA |   |
  | |  [open book]  |   |
  | |_______________|   |
  |  cart: overturned   |
  |=====================|
  |_____________________|`,

    science_lab: `
   _____________________
  | - SCIENCE LAB -     |
  |=====================|
  |    _     _     _    |
  |   |B|   |~|   |B|  |
  |   |U|   |U|   |U|  |
  |   |N|   |N|   |N|  |
  |   |_|   |_|   |_|  |
  |   BUNSEN BURNERS    |
  |   _______________   |
  |  |  SPECIMEN     |  |
  |  |___DESK________|  |
  |  goggles on floor   |
  |=====================|
  |_____________________|`,

    english_classroom: `
   _____________________
  |- ENGLISH CLASSROOM -|
  |=====================|
  | LORD OF THE FLIES   |
  | (still on board)    |
  |                     |
  |  _  _  _  _  _  _  |
  | |D||D||D||D||D||D|  |
  | |E||E||E||E||E||E|  |
  | |S||S||S||S||S||S|  |
  | |K||K||K||K||K||K|  |
  |                     |
  | quiz: not collected |
  |=====================|
  |_____________________|`,

    math_classroom: `
   _____________________
  | - MATH CLASSROOM -  |
  |=====================|
  | SLIDE 14:           |
  |   x = -b ± √(b²-4ac)|
  |         2a          |
  |                     |
  |  _  _  _  _  _  _  |
  | |D||D||D||D||D||D|  |
  | |E||E||E||E||E||E|  |
  | |S||S||S||S||S||S|  |
  |                     |
  | textbook: open      |
  |=====================|
  |_____________________|`,

    hallway: `
   _____________________
  |  - MAIN HALLWAY -   |
  |=====================|
  |[LCK][LCK][LCK][LCK]|
  |[   ][   ][ !! ][   ]|
  |[___][___][___][___] |
  |  <-one open->       |
  |                     |
  | TROPHY CASE: intact |
  |  ALL-STATE 2019     |
  |                     |
  |  sneaker: one (1)   |
  |  just the one       |
  |=====================|
  |_____________________|`,

    bathroom: `
   _____________________
  |    - BATHROOM -     |
  |=====================|
  |  [ mirror: HELP ]   |
  |    "lol same" ->    |
  |                     |
  | [stall][stall][   ] |
  | [open ][open ][ ?? ]|
  | [_____][_____][___] |
  |                     |
  |  tap: still running |
  |  drain: also running|
  |  ~ something else ~ |
  |=====================|
  |_____________________|`,

    locker_room: `
   _____________________
  |  - LOCKER ROOM -    |
  |=====================|
  | [LCKR][LCKR][LCKR]  |
  | [    ][    ][ OPN]  |
  | [____][____][____]  |
  |                     |
  |  cleats . pads .    |
  |  lacrosse stick     |
  |                     |
  | [  EMERGENCY  ]     |
  | [   SHOWER    ]     |
  | [  RUNNING    ]     |
  |  ~ has been ~       |
  |=====================|
  |_____________________|`,

    principal_office: `
   _____________________
  |- PRINCIPAL'S OFFICE-|
  |=====================|
  | [HONOR ROLL: 2023]  |
  | [HONOR ROLL: 2022]  |
  | [HONOR ROLL: 2021]  |
  |                     |
  | "World's Okayest"   |
  |  Administrator      |
  | [mug: still there ] |
  |                     |
  | [plaque][plaque]    |
  | * perfectly straight|
  |=====================|
  |_____________________|`,

    auditorium: `
   _____________________
  |   - AUDITORIUM -    |
  |=====================|
  | * STAGE LIGHTS ON * |
  |    ___________      |
  |   /  CURTAINS  \\   |
  |  | ~ ~ half ~ ~ |   |
  |   \\___________/    |
  |                     |
  | [row C, seat 7: OCC]|
  |                     |
  | GREASE: COMING SOON |
  |=====================|
  |_____________________|`,

    rooftop: `
   _____________________
  |     - ROOFTOP -     |
  |=====================|
  |   grey sky . smoke  |
  |         * *         |
  |        *   *        |
  |   [HELICOPTER]      |
  |   [  INBOUND ]      |
  |   [          ]      |
  |                     |
  |  [FLARE GUN: here]  |
  |  HVAC units humming |
  |  ~ rotors: louder ~ |
  |=====================|
  |_____________________|`,
  },
};
