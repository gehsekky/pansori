import {
  Drop, Sword, Axe, ShieldStar, ShieldChevron, Shield,
  ForkKnife, Scroll, Diamond, Key, Flask, Wine, Sparkle,
} from '@phosphor-icons/react';
import type { FrontendContext } from '../types.js';

export const context: FrontendContext = {
  id: 'dungeon-crawler',

  displayName: 'Dungeon Crawler',
  tagline:     'Descend into cursed catacombs. Fight the undead. Escape with your life.',
  previewArt: `
   /--exit--\\
   | rungs  |
   |  = = = |
   |  = = = |
  -+---------+-
  skull . gold
  * dark * below`,

  classes: [
    { id: 'Warrior',  desc: 'Heavy armour proficiency. Extra attack at level 3.' },
    { id: 'Mage',     desc: 'Cast arcane spells. Identify magical items.' },
    { id: 'Rogue',    desc: 'Sneak attack. Lockpicking and trap disarming.' },
    { id: 'Cleric',   desc: 'Channel divinity. Heal allies and smite undead.' },
    { id: 'Ranger',   desc: 'Track enemies. Advantage in natural environments.' },
  ],

  classPrimaryStats: {
    Warrior: 'STR',
    Mage:    'INT',
    Rogue:   'DEX',
    Cleric:  'WIS',
    Ranger:  'DEX',
  },

  classSkills: {
    Warrior: ['Athletics', 'Intimidation'],
    Mage:    ['Arcana', 'Investigation'],
    Rogue:   ['Stealth', 'Sleight of Hand', 'Deception'],
    Cleric:  ['Medicine', 'Religion'],
    Ranger:  ['Stealth', 'Perception', 'Nature'],
  },

  theme: {
    pageBg:    '#0d0a08',
    cardBg:    '#130e0a',
    font:      '"Courier New", monospace',
    primary:   '#c8a96e',
    mid:       '#a07848',
    dim:       '#b06820',
    dimDark:   '#3d2810',
    border:    '#6b4520',
    separator: '#2a1508',
    itemColor: '#7a5030',
    hpHigh:    '#c8a96e',
    hpMid:     '#d4822a',
    hpLow:     '#cc3333',
    title:      'DUNGEON CRAWLER',
    worldLabel: 'DELVING INTO',
  },

  itemIcons: {
    health_potion:   <Drop          size={14} weight="bold" />,
    iron_sword:      <Sword         size={14} weight="bold" />,
    battle_axe:      <Axe           size={14} weight="bold" />,
    enchanted_blade: <Sparkle       size={14} weight="bold" />,
    wooden_shield:   <Shield        size={14} weight="bold" />,
    leather_armor:   <ShieldStar    size={14} weight="bold" />,
    plate_armor:     <ShieldChevron size={14} weight="bold" />,
    rations:         <ForkKnife     size={14} weight="bold" />,
    undead_tome:     <Scroll        size={14} weight="bold" />,
    cursed_gem:      <Diamond       size={14} weight="bold" />,
    skeleton_key:    <Key           size={14} weight="bold" />,
    dark_potion:     <Flask         size={14} weight="bold" />,
    mead_flask:      <Wine          size={14} weight="bold" />,
  },

  itemDescs: {
    health_potion:   'Restores 2d4+2 HP, one use',
    iron_sword:      '1d8 damage, melee weapon',
    battle_axe:      '1d8 damage, melee weapon',
    enchanted_blade: '2d6 damage, finesse, glows with arcane light',
    wooden_shield:   '+2 AC while equipped',
    leather_armor:   '+2 AC while equipped',
    plate_armor:     '+6 AC while equipped',
    rations:         'Restore 1 HP, one use',
    undead_tome:     'Forbidden necromantic knowledge. Probably cursed.',
    cursed_gem:      'Pulses with malevolent purple light. Worth a fortune — if you survive.',
    skeleton_key:    'Opens any lock. Made from an actual skeleton finger.',
    dark_potion:     'Unknown effect. Smells of sulphur and regret.',
    mead_flask:      'Advantage on next CON save, one use',
  },

  art: {
    crypt: `
   _____________________
  |      - CRYPT -      |
  |=====================|
  | [R.I.P] [   ] [R.I.P]|
  |  _____   ___   _____ |
  | |     | |   | |     ||
  | |     | |   | |     ||
  | |_____|_|___|_|_____||
  |                      |
  |  . . . cobwebs . .   |
  |                      |
  |  ~ torch flickers ~  |
  |======================|
  |______________________|`,

    burial_chamber: `
   _____________________
  | - BURIAL CHAMBER -  |
  |=====================|
  |   _______________   |
  |  |               |  |
  |  |  R . I . P    |  |
  |  |  SARCOPHAGUS  |  |
  |  |_______________|  |
  |                     |
  |  O       O       O  |
  | skull   skull  skull|
  |                     |
  |[URN][URN][URN][URN] |
  |=====================|
  |_____________________|`,

    torture_chamber: `
   _____________________
  |- TORTURE CHAMBER -  |
  |=====================|
  | /o\\  /o\\  /o\\  /o\\ |
  |  |    |    |    |   |
  | hooks from ceiling  |
  |                     |
  |  ________________   |
  | |                |  |
  | |   T H E  RACK  |  |
  | |________________|  |
  |                     |
  | [shackle][shackle]  |
  |=====================|
  |_____________________|`,

    necromancer_study: `
   _____________________
  |- NECROMANCER STUDY- |
  |=====================|
  |[tome][tome][tome]   |
  |[tome][tome][tome]   |
  |                     |
  |     __________      |
  |    | CAULDRON |     |
  |    |~  ~  ~  ~|     |
  |    |__________|     |
  |                     |
  |  * candles lit  *   |
  |  diagrams . ritual  |
  |=====================|
  |_____________________|`,

    weapon_vault: `
   _____________________
  |  - WEAPON VAULT -   |
  |=====================|
  |  /|  /|  /|  /|    |
  | /-| /-| /-| /-|     |
  |  SWORDS AND SPEARS  |
  |                     |
  |  [==============]   |
  |  [ ARMOUR  RACK ]   |
  |  [==============]   |
  |                     |
  |[AXE][AXE][BLADE][?] |
  |=====================|
  |_____________________|`,

    throne_room: `
   _____________________
  |   - THRONE ROOM -   |
  |=====================|
  | *cold blue flames*  |
  |                     |
  |        _____        |
  |       |CROWN|       |
  |    ___|     |___    |
  |   |   OBSIDIAN  |   |
  |   |   THRONE    |   |
  |   |_____________|   |
  |                     |
  | ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ |
  |=====================|
  |_____________________|`,

    catacombs: `
   _____________________
  |    - CATACOMBS -    |
  |=====================|
  |OOO OOO OOO OOO OOO  |
  |=====================|
  |OOO OOO OOO OOO OOO  |
  |                     |
  |  <- <- <- <- <- <-  |
  |  (arrows: circle)   |
  |                     |
  |OOO OOO OOO OOO OOO  |
  |=====================|
  |OOO OOO OOO OOO OOO  |
  |=====================|
  |_____________________|`,

    ritual_chamber: `
   _____________________
  |  - RITUAL CHAMBER - |
  |=====================|
  |  *       *       *  |
  |      _________      |
  |     / SUMMON  \\     |
  |    |  CIRCLE   |    |
  |    | ~ glow ~  |    |
  |     \\_________/     |
  |  *       *       *  |
  |                     |
  | [ALTAR: STILL WARM] |
  |=====================|
  |_____________________|`,

    treasure_vault: `
   _____________________
  |  - TREASURE VAULT - |
  |=====================|
  | $  $  $  $  $  $   |
  | $   G O L D    $   |
  | $  $  $  $  $  $   |
  |  [CHEST] [CHEST]    |
  |  [open!] [empty]    |
  |                     |
  |  * * *  GEMS  * * * |
  |    oo  CROWNS  oo   |
  |                     |
  | skeleton: grinning  |
  |=====================|
  |_____________________|`,

    bone_pit: `
   _____________________
  |    - BONE PIT -     |
  |=====================|
  |                     |
  | oooooooooooooooooo  |
  |o                  o |
  |o  BONE PIT (deep) o |
  |o  o  o  o  o  o  o |
  | oooooooooooooooooo  |
  |                     |
  | ~ they are moving ~ |
  |                     |
  |  EDGE WITH CAUTION  |
  |=====================|
  |_____________________|`,

    flooded_corridor: `
   _____________________
  |- FLOODED CORRIDOR - |
  |=====================|
  | ~~~~~~~~~~~~~~~~~~~ |
  | ~   BLACK WATER   ~ |
  | ~~~~~~~~~~~~~~~~~~~ |
  |                     |
  |  something is below |
  |                     |
  | ~~~~~~~~~~~~~~~~~~~ |
  | ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ |
  | ~~~~~~~~~~~~~~~~~~~ |
  |                     |
  | too shallow for this|
  |=====================|
  |_____________________|`,

    forbidden_library: `
   _____________________
  |- FORBIDDEN LIBRARY -|
  |=====================|
  |[tome][tome][tome]   |
  |[tome][CHAIN][tome]  |
  |[tome][tome][tome]   |
  |   * one whispers *  |
  |                     |
  |  _______________    |
  | |  READING TABLE|   |
  | |  [open tome]  |   |
  | |_______________|   |
  |  pages: self-turning|
  |=====================|
  |_____________________|`,

    guard_post: `
   _____________________
  |    - GUARD POST -   |
  |=====================|
  |  X    X    X    X   |
  | /|\\  /|\\  /|\\  /|\\  |
  | / \\  / \\  / \\  / \\  |
  |  SKELETAL GUARDS    |
  |  perfect formation  |
  |                     |
  |  [=WEAPON  RACK=]   |
  |  [================] |
  |                     |
  |  * eyes tracking *  |
  |=====================|
  |_____________________|`,

    exit_shaft: `
   _____________________
  |   - EXIT SHAFT -    |
  |=====================|
  |     grey daylight   |
  |          |          |
  |         =|=         |
  |         =|= rungs   |
  |         =|=         |
  |         =|=         |
  |         =|=         |
  |         =|=         |
  |         =|=         |
  |  SURFACE: ~30ft up  |
  |=====================|
  |_____________________|`,
  },
};
