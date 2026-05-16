import {
  Drop, Sword, Axe, ShieldStar, ShieldChevron,
  ForkKnife, Scroll, Diamond, Key, Flask, Wine, Sparkle,
} from '@phosphor-icons/react';

export const context = {
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
    { id: 'Warrior',  desc: '+2 STR. Heavy armour proficiency. Extra attack at level 3.' },
    { id: 'Mage',     desc: '+2 INT. Cast arcane spells. Identify magical items.' },
    { id: 'Rogue',    desc: '+2 DEX. Sneak attack. Lockpicking and trap disarming.' },
    { id: 'Cleric',   desc: '+2 WIS. Channel divinity. Heal allies and smite undead.' },
    { id: 'Ranger',   desc: '+2 DEX. Track enemies. Advantage in natural environments.' },
  ],

  theme: {
    // structural
    pageBg:    '#0d0a08',
    cardBg:    '#130e0a',
    font:      '"Courier New", monospace',
    // color tiers
    primary:   '#c8a96e',   // warm amber — text, glow, active
    mid:       '#a07848',   // medium amber — stats, art tint
    dim:       '#5c3d20',   // dark brown — labels, quiet text
    dimDark:   '#3d2810',   // very dark brown — footer, buttons
    border:    '#6b4520',   // brown — card/input borders
    separator: '#2a1508',   // very dark — separators, log dividers
    itemColor: '#7a5030',   // unequipped inventory items
    // hp bar
    hpHigh:    '#c8a96e',   // amber at full health
    hpMid:     '#d4822a',   // orange when hurt
    hpLow:     '#cc3333',   // red when critical
    // title
    title:      'DUNGEON CRAWLER',
    worldLabel: 'DELVING INTO',
  },

  itemIcons: {
    health_potion:   <Drop          size={14} weight="bold" />,
    iron_sword:      <Sword         size={14} weight="bold" />,
    battle_axe:      <Axe           size={14} weight="bold" />,
    enchanted_blade: <Sparkle       size={14} weight="bold" />,
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
    battle_axe:      '2d6 damage, melee weapon',
    enchanted_blade: '2d8 damage, glows with arcane light',
    leather_armor:   '+2 AC while equipped',
    plate_armor:     '+3 AC while equipped',
    rations:         'Restore 1 HP, one use',
    undead_tome:     'Forbidden necromantic knowledge. Probably cursed.',
    cursed_gem:      'Pulses with malevolent purple light. Worth a fortune — if you survive.',
    skeleton_key:    'Opens any lock. Made from an actual skeleton finger.',
    dark_potion:     'Unknown effect. Smells of sulphur and regret.',
    mead_flask:      'Advantage on next CON save, one use',
  },

  weaponNames: {
    iron_sword:      'Iron Sword',
    battle_axe:      'Battle Axe',
    enchanted_blade: 'Enchanted Blade',
  },

  armorNames: {
    leather_armor: 'Leather Armour',
    plate_armor:   'Plate Armour',
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
  | /o\  /o\  /o\  /o\ |
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
  |     / SUMMON  \     |
  |    |  CIRCLE   |    |
  |    | ~ glow ~  |    |
  |     \_________/     |
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
  | /|\  /|\  /|\  /|\  |
  | / \  / \  / \  / \  |
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
