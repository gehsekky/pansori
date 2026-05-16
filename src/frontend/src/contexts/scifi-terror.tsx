import {
  FirstAidKit, Crosshair, Lightning, ShieldStar,
  ForkKnife, Wine, Egg, Sword, Belt, Scroll, CreditCard, Flask,
} from '@phosphor-icons/react';
import type { FrontendContext } from '../types.js';

export const context: FrontendContext = {
  id: 'scifi-terror',

  displayName: 'Sci-Fi Terror',
  tagline:     'Survive aboard a doomed starship overrun by alien horrors.',
  previewArt: `
  /------\\  /----\\
 |  POD   || POD  |
 |   1    ||  2   |
  \\------/  \\----/
  [ LAUNCH READY ]
  * . * . * . * .`,

  classes: [
    { id: 'Soldier',    desc: '+2 STR. Proficient with all weapons. Extra attack at level 3.' },
    { id: 'Scientist',  desc: '+2 INT. Can identify alien specimens. Lab equipment bonus.' },
    { id: 'Pilot',      desc: '+2 DEX. Advantage on vehicle checks. Fast escape pod launch.' },
    { id: 'Engineer',   desc: '+2 CON. Can repair ship systems. Improvised weapons.' },
    { id: 'Medic',      desc: '+2 WIS. Heal action bonus. Advantage on poison saves.' },
  ],

  theme: {
    pageBg:    '#0a0a0a',
    cardBg:    '#060f06',
    font:      '"Courier New", monospace',
    primary:   '#00ff41',
    mid:       '#00cc33',
    dim:       '#005f18',
    dimDark:   '#003d0f',
    border:    '#00551a',
    separator: '#001a06',
    itemColor: '#00661a',
    hpHigh:    '#00ff41',
    hpMid:     '#ffaa00',
    hpLow:     '#ff4444',
    title:     'ESCAPE FROM THE STARS',
    worldLabel: 'ABOARD',
  },

  itemIcons: {
    med_kit:          <FirstAidKit size={14} weight="bold" />,
    ray_gun:          <Crosshair   size={14} weight="bold" />,
    stun_baton:       <Lightning   size={14} weight="bold" />,
    hazmat_suit:      <ShieldStar  size={14} weight="bold" />,
    space_rations:    <ForkKnife   size={14} weight="bold" />,
    space_whiskey:    <Wine        size={14} weight="bold" />,
    alien_egg:        <Egg         size={14} weight="bold" />,
    laser_sword:      <Sword       size={14} weight="bold" />,
    force_field_belt: <Belt        size={14} weight="bold" />,
    autopsy_manual:   <Scroll      size={14} weight="bold" />,
    insurance_card:   <CreditCard  size={14} weight="bold" />,
    mystery_goo:      <Flask       size={14} weight="bold" />,
  },

  itemDescs: {
    med_kit:          'Heals 2d4+2 HP, one use',
    ray_gun:          '2d6 damage, ranged weapon',
    space_rations:    'Restore 1 HP, one use',
    stun_baton:       '1d8 damage, melee weapon',
    hazmat_suit:      '+2 AC while equipped',
    alien_egg:        'Pulsing. Warm. Why did you take this?',
    space_whiskey:    'Advantage on next CON save, one use',
    laser_sword:      '2d8 damage, melee weapon',
    force_field_belt: '+3 AC while equipped',
    autopsy_manual:   'Reading it raises more questions than answers',
    insurance_card:   'Coverage void in alien encounters',
    mystery_goo:      'Unknown effect. Smells like eucalyptus and regret.',
  },

  weaponNames: {
    laser_sword: 'Laser Sword',
    ray_gun:     'Ray Gun',
    stun_baton:  'Stun Baton',
  },

  armorNames: {
    hazmat_suit:      'Hazmat Suit',
    force_field_belt: 'Force Field Belt',
  },

  art: {
    cryo_bay: `
   _____________________
  |    - CRYO BAY -     |
  |=====================|
  |  [===] [===] [===]  |
  |  [***]       [***]  |
  |  [===] [===] [===]  |
  |  . . ice . . . ice  |
  |  [===] [===] [===]  |
  |  [   ] [***] [   ]  |
  |  [===] [===] [===]  |
  |                     |
  |~~~~~~~~~~~~~~~~~~~~~|
  |  frost . . . . . .  |
  |=====================|
  |_____________________|`,

    med_bay: `
   _____________________
  |    - MED BAY -      |
  |=====================|
  |          [+]        |
  |         _|_         |
  |        |   |        |
  |        | B |        |
  |        | E |        |
  |        | D |        |
  |        |___|        |
  |   _______________   |
  |  |  INSTRUMENTS  |  |
  |  |_______________|  |
  |   [KIT]    [MEDS]   |
  |=====================|
  |_____________________|`,

    engine_room: `
   _____________________
  |  - ENGINE ROOM -    |
  |=====================|
  |       /~~~~~~\\      |
  |      / REACT  \\     |
  |     |  [====]  |    |
  |     |  [CORE]  |    |
  |     |  [====]  |    |
  |      \\_________/    |
  |       ||      ||    |
  |      [==]    [==]   |
  |      [==]    [==]   |
  |      [==]    [==]   |
  |       TURBINES      |
  |=====================|
  |_____________________|`,

    bridge: `
   _____________________
  |  - SHIP BRIDGE -    |
  |=====================|
  | *  .   *   .   *  . |
  |  .   *   .   *   .  |
  | *  .   *   .   *  . |
  |_____________________|
  | [===] [=====] [===] |
  |  CTL   NAVIG   ENG  |
  | [___] [_____] [___] |
  |                     |
  |  [ MAIN  CONSOLE ]  |
  |  [=================]|
  |=====================|
  |_____________________|`,

    cargo_hold: `
   _____________________
  |  - CARGO HOLD -     |
  |=====================|
  | [####] [####] [####]|
  | [####] [####] [####]|
  |                     |
  |         [####]      |
  |   [####]     [####] |
  |                     |
  | [####] [####] [####]|
  | [####]        [####]|
  |                     |
  |  ~ something moves ~|
  |=====================|
  |_____________________|`,

    cafeteria: `
   _____________________
  |   - CAFETERIA -     |
  |=====================|
  |  ___|___|___|___    |
  | |   |   |   |   |   |
  | |___|___|___|___|   |
  |                     |
  |  ___|___|___|___    |
  | |   |   |   |   |   |
  | |___|___|___|___|   |
  |                     |
  |  [  FOOD SYNTH  ]   |
  |  [~~~~~~~~~~~~~]    |
  |=====================|
  |_____________________|`,

    armory: `
   _____________________
  |     - ARMORY -      |
  |=====================|
  |   ||||  ||||  ||||  |
  |   ||||  ||||  ||||  |
  |   ||||  ||||  ||||  |
  |   ||||  ||||  ||||  |
  |                     |
  |  [=================]|
  |  [  AMMO  LOCKER  ] |
  |  [_________________]|
  |                     |
  |  [ CHARGE  PACKS  ] |
  |=====================|
  |_____________________|`,

    airlock: `
   _____________________
  |    - AIRLOCK -      |
  |=====================|
  |  *    .     *    .  |
  |     *    .     *    |
  |  .     *    .     * |
  |     .     *     .   |
  |                     |
  |  [====INNER-DOOR=]  |
  |  [================] |
  |                     |
  |  !! VACUUM ALERT !! |
  |  [================] |
  |=====================|
  |_____________________|`,

    lab: `
   _____________________
  |  - SCIENCE LAB -    |
  |=====================|
  |    _     _     _    |
  |   |#|   |~|   |#|  |
  |   |#|   |~|   |#|  |
  |   |#|   |#|   |#|  |
  |   |#|   |#|   |#|  |
  |   |_|   |_|   |_|  |
  |                     |
  |   _______________   |
  |  |  SPECIMEN     |  |
  |  |____DESK_______|  |
  |=====================|
  |_____________________|`,

    gaming_room: `
   _____________________
  | - CREW GAMING ROOM -|
  |=====================|
  |  _____    _____     |
  | |     |  |     |    |
  | | [>] |  | [>] |    |
  | |ARCDE|  |ARCDE|    |
  | |_____|  |_____|    |
  |                     |
  |  _________________  |
  | |   CARD  TABLE   | |
  | |  [* . * . * . ] | |
  | |_________________| |
  |  HIGH SCORE: ????? |
  |=====================|
  |_____________________|`,

    crew_quarters: `
   _____________________
  |  - CREW QUARTERS -  |
  |=====================|
  |   ____________      |
  |  |  BUNK  [z] |     |
  |  |____________|     |
  |     ____________    |
  |    |  BUNK  [z] |   |
  |    |____________|   |
  |                     |
  | [LCKR][LCKR][LCKR]  |
  | [    ][    ][    ]   |
  | [____][____][____]   |
  |  photo . memo . ?   |
  |=====================|
  |_____________________|`,

    stellar_cartography: `
   _____________________
  |- STELLAR CARTOG.  - |
  |=====================|
  |    *    .    *      |
  |  .  +----------+   |
  |  *  | * .  * . |  *|
  |     | .  [***] |   |
  |  *  | * .  * . |  *|
  |  .  +----------+   |
  |    *    .    *      |
  |                     |
  | COURSE: [UNKNOWN]   |
  | [=================] |
  |=====================|
  |_____________________|`,

    ship_gym: `
   _____________________
  |    - SHIP GYM -     |
  |=====================|
  |  ___  ___  ___      |
  | [   ][   ][   ]     |
  | [ O ][ O ][ O ]     |
  | [___][___][___]     |
  |  TREADMILLS: ON     |
  |                     |
  |  [===============]  |
  |  [  BENCH PRESS  ]  |
  |  [===TWISTED======] |
  |                     |
  |  o  o  WEIGHTS  o   |
  |=====================|
  |_____________________|`,

    escape_pods: `
   _____________________
  |  - ESCAPE PODS -    |
  |=====================|
  |   /------\\  /----\\  |
  |  |  POD   || POD  | |
  |  |   1    ||  2   | |
  |  |        ||      | |
  |   \\------/  \\----/  |
  |                     |
  |   [ !! LAUNCH !! ]  |
  |   [=============]   |
  |                     |
  |  PODS READY: 2/6    |
  |=====================|
  |_____________________|`,
  },
};
