import type { Context } from '../types.js';

export const context: Context = {
  id: 'dungeon-crawler',
  worldNoun: 'dungeon',
  startRoomId: 'crypt',
  escapeRoomId: 'exit_shaft',
  escapeTriggers: ['climb', 'get out now', 'escape the dungeon'],
  escapeChoiceText: 'Climb the exit shaft — ESCAPE THE DUNGEON',

  worldNames: [
    'The Abyssal Vaults', 'Crypts of Malgrath', 'The Sunken Citadel',
    'Ossuary of the Fallen King', 'The Wretched Depths', 'Catacombs of Neth',
    'The Bone Labyrinth',
  ],

  enemyTemplates: [
    // CR 1/4 — starter threats
    { name: 'Skeleton',     cr: 0.25, hp:  13, ac: 13, damage: '1d6+2',  toHit: 4, xp:    50 },
    { name: 'Zombie',       cr: 0.25, hp:  22, ac:  8, damage: '1d6+1',  toHit: 3, xp:    50 },
    // CR 1 — early rooms
    { name: 'Ghoul',        cr:    1, hp:  22, ac: 12, damage: '2d6+2',  toHit: 4, xp:   200, dex: 15 },
    { name: 'Shadow',       cr:    1, hp:  16, ac: 12, damage: '2d6+2',  toHit: 4, xp:   200, dex: 14 },
    // CR 3–5 — mid dungeon
    { name: 'Wight',        cr:    3, hp:  45, ac: 14, damage: '2d8+3',  toHit: 4, xp:   700 },
    { name: 'Wraith',       cr:    5, hp:  67, ac: 13, damage: '4d8+3',  toHit: 6, xp:  1100, dex: 16 },
    { name: 'Flesh Golem',  cr:    5, hp:  93, ac:  9, damage: '2d8+5',  toHit: 7, xp:  1800 },
    // CR 6+ — boss-tier
    { name: 'Necromancer',  cr:    6, hp:  66, ac: 12, damage: '4d6',    toHit: 5, xp:  2300, dex: 14 },
    { name: 'Death Knight', cr:   17, hp: 110, ac: 20, damage: '2d8+6',  toHit: 9, xp:  5900 },
  ],

  introTexts: [
    'You come to your senses on a cold stone floor. A single torch sputters nearby. The air smells of rot and old magic. How did you get here? More urgently — how do you get out?',
    'Darkness. Then pain. You open your eyes to a torch-lit corridor of ancient stone. Somewhere deep below, something chants in a language that should be forgotten.',
  ],

  roomPool: [
    { id: 'crypt', name: 'Crypt', descs: [
      'Cold stone sarcophagi line the walls, lids askew. Whoever — or whatever — was inside has long since departed.',
      'The crypt reeks of must and old death. Cobwebs obscure inscriptions on the walls. One reads: DO NOT WAKE THEM.',
      'You lie among the honoured dead. Or what used to be the honoured dead. Several burial niches are conspicuously empty.',
    ]},
    { id: 'burial_chamber', name: 'Burial Chamber', descs: [
      'A grand sarcophagus dominates the centre, its lid shattered from within. Treasure offerings have been scattered — or searched.',
      'Funerary urns line every shelf. The inscriptions promise eternal rest. That promise has clearly not been kept.',
      'Stone walls bear carved reliefs of ancient battles. The carved soldiers seem to be watching you. Perhaps they are.',
    ]},
    { id: 'torture_chamber', name: 'Torture Chamber', descs: [
      'Implements of suffering hang from iron hooks. The rack in the corner still has a figure strapped to it. It turns its head to look at you.',
      'The smell of ancient suffering is overwhelming. A journal lies open on a table — the last entry reads: IT WORKED.',
      'This chamber was built for screaming. The acoustics confirm it. Something in here is still capable of screaming.',
    ]},
    { id: 'necromancer_study', name: "Necromancer's Study", descs: [
      'Bookshelves of forbidden tomes surround a desk covered in ritual diagrams. The candles are still burning. Someone was just here.',
      'A cauldron bubbles with something luminescent and foul. Anatomical sketches cover the walls — but the anatomy is all wrong.',
      'The study smells of sulphur and arcane ink. A mirror in the corner reflects the room differently than you see it. Something is behind you in the reflection.',
    ]},
    { id: 'weapon_vault', name: 'Weapon Vault', descs: [
      'Rows of weapons line the walls — most corroded beyond use. But a few gleam as though freshly forged. Someone has been maintaining them.',
      'The vault door stands open. Blades, axes, armour. The previous owner left in a hurry. The blood on the floor suggests they did not get far.',
      'Iron racks of weapons stretch into the darkness. You reach for a sword and notice the rack is warm to the touch.',
    ]},
    { id: 'throne_room', name: 'Throne Room', descs: [
      'A great obsidian throne dominates the hall, ringed by torches that burn with cold blue flame. The throne is occupied.',
      'Tattered banners hang from the vaulted ceiling. A crown rests at the throne\'s base, waiting. Whatever rules here now is not a king.',
      'The grandeur of this hall is unmistakable — and deeply wrong. Kings are buried here, not seated. Not anymore.',
    ]},
    { id: 'catacombs', name: 'Catacombs', descs: [
      'Bones are stacked floor to ceiling — femurs, skulls, ribs — an ossuary of thousands. Some stacks are disturbed. Some bones are missing.',
      'The catacomb tunnels branch in every direction. Someone has scratched arrows into the walls. They point in a circle.',
      'Skulls stare from every niche. The silence has a texture here — expectant, as if the dead are deciding something.',
    ]},
    { id: 'ritual_chamber', name: 'Ritual Chamber', descs: [
      'A summoning circle carved into the floor still glows faintly. Something was called here. Whether it left is unclear.',
      'Ritual candles surround an altar stained with use. The inscriptions ask for things that should not be asked for.',
      'The chamber hums with residual power. You can feel it in your teeth. You feel watched by something with no eyes.',
    ]},
    { id: 'treasure_vault', name: 'Treasure Vault', descs: [
      'Gold and jewels glitter in the torchlight. Most chests are open. Most are empty. Something got here first.',
      'The vault is stuffed with treasure — coins, chalices, crowns. Also: bones. Also: something stirring beneath the coins.',
      'A skeleton sits atop a coin pile, grinning at you, still clutching a chest. It found the treasure first.',
    ]},
    { id: 'bone_pit', name: 'Bone Pit', descs: [
      'A pit ten feet deep filled with bones stretches across half the room. You skirt the edge carefully. The bones are breathing.',
      'The bone pit smells like centuries of violence. From below, something rattles rhythmically — too intentionally.',
      'You almost fall into the bone pit before you see it. The bones at the bottom are arranged into shapes. You move away before you can read them.',
    ]},
    { id: 'flooded_corridor', name: 'Flooded Corridor', descs: [
      'Black water floods the corridor ankle-deep. Something moves beneath the surface — far too large for water this shallow.',
      'The corridor drips from ceiling cracks. Your torchlight reflects back from the water — and from something beneath it.',
      'Floodwater has warped the ancient doors. The water is cold enough to hurt. Something else is in it with you.',
    ]},
    { id: 'forbidden_library', name: 'Forbidden Library', descs: [
      'Shelves of books bound in materials you refuse to identify. Some are chained shut. One is whispering.',
      'A reading table is set with an open tome. The pages are turning on their own. The text rearranges itself as you try to read it.',
      'The library extends further than the room should allow. Some books have returned themselves to shelves — upside down.',
    ]},
    { id: 'guard_post', name: 'Guard Post', descs: [
      'Skeletal guards man this post with terrible precision. They turn to face you in perfect unison. They have been waiting for exactly this.',
      'Overturned furniture suggests a frantic last stand. Whatever attacked this post did not lose.',
      'A roster on the wall lists the guards on duty. It is one name, repeated hundreds of times.',
    ]},
    { id: 'exit_shaft', name: 'Exit Shaft', descs: [
      'A shaft of grey daylight cuts down from above — the surface! Iron rungs are hammered into the stone. Freedom is thirty feet up.',
      'The exit shaft! Blessed light from above. The ladder looks old but it will hold. Probably.',
      'You can smell fresh air. The exit shaft rises into daylight. Your hands are already on the rungs.',
    ]},
  ],

  lootTable: [
    { id: 'health_potion',   name: 'Health Potion',    desc: 'Restores 2d4+2 HP, one use',                                        weight: 28, type: 'consumable', slot: null,     damage: null,   ac_bonus: null, heal: '2d4+2', effect: null,            aliases: ['health potion', 'potion', 'red potion'] },
    { id: 'iron_sword',      name: 'Iron Sword',        desc: '1d8 damage, melee weapon',                                          weight: 16, type: 'weapon',     slot: 'weapon', damage: '1d8',  ac_bonus: null, heal: null,    effect: null,            aliases: ['iron sword', 'sword'] },
    { id: 'battle_axe',      name: 'Battle Axe',        desc: '2d6 damage, melee weapon',                                          weight: 12, type: 'weapon',     slot: 'weapon', damage: '2d6',  ac_bonus: null, heal: null,    effect: null,            aliases: ['battle axe', 'axe', 'battleaxe'] },
    { id: 'enchanted_blade', name: 'Enchanted Blade',   desc: '2d8 damage, glows with arcane light',                               weight: 8,  type: 'weapon',     slot: 'weapon', damage: '2d8',  ac_bonus: null, heal: null,    effect: null,            aliases: ['enchanted blade', 'enchanted sword', 'magic sword', 'blade'] },
    { id: 'leather_armor',   name: 'Leather Armour',    desc: '+2 AC while equipped',                                              weight: 12, type: 'armor',      slot: 'armor',  damage: null,   ac_bonus: 2,    heal: null,    effect: null,            aliases: ['leather armour', 'leather armor', 'leather'] },
    { id: 'plate_armor',     name: 'Plate Armour',      desc: '+3 AC while equipped',                                              weight: 7,  type: 'armor',      slot: 'armor',  damage: null,   ac_bonus: 3,    heal: null,    effect: null,            aliases: ['plate armour', 'plate armor', 'plate'] },
    { id: 'rations',         name: 'Trail Rations',     desc: 'Restore 1 HP, one use',                                             weight: 20, type: 'consumable', slot: null,     damage: null,   ac_bonus: null, heal: '1',     effect: null,            aliases: ['trail rations', 'rations', 'food'] },
    { id: 'undead_tome',     name: 'Undead Tome',        desc: 'Forbidden necromantic knowledge. Probably cursed.',                 weight: 5,  type: 'misc',       slot: null,     damage: null,   ac_bonus: null, heal: null,    effect: null,            aliases: ['undead tome', 'tome', 'book'], useNarrative: 'You open the Undead Tome to a random page. The illustration moves. You close it immediately. Some knowledge is not worth having.' },
    { id: 'cursed_gem',      name: 'Cursed Gem',         desc: 'Pulses with malevolent purple light. Worth a fortune — if you survive.',  weight: 4,  type: 'misc', slot: null,  damage: null,   ac_bonus: null, heal: null,    effect: null,            aliases: ['cursed gem', 'gem', 'jewel'], useNarrative: 'You hold up the Cursed Gem. It pulses. The shadows in the room shift toward you. You pocket it quickly.' },
    { id: 'skeleton_key',    name: 'Skeleton Key',       desc: 'Opens any lock. Made from an actual skeleton finger. You try not to think about this.',  weight: 5, type: 'misc', slot: null, damage: null, ac_bonus: null, heal: null, effect: null, aliases: ['skeleton key', 'key'], useNarrative: 'The Skeleton Key fits every lock you test it on. It is made from an actual finger bone. You choose not to dwell on this.' },
    { id: 'dark_potion',     name: 'Dark Potion',        desc: 'Unknown effect. Smells of sulphur and regret.',                    weight: 5,  type: 'consumable', slot: null,     damage: null,   ac_bonus: null, heal: null,    effect: 'mystery',       aliases: ['dark potion', 'black potion', 'strange potion'] },
    { id: 'mead_flask',      name: 'Mead Flask',         desc: 'Advantage on next CON save, one use',                              weight: 4,  type: 'consumable', slot: null,     damage: null,   ac_bonus: null, heal: null,    effect: 'con_advantage', aliases: ['mead flask', 'mead', 'flask', 'ale'] },
  ],

  narratives: {
    roomArrival: {
      crypt: [
        'You bolt upright from the cold stone floor, gasping. The crypt is dark save for a sputtering torch. Half the sarcophagi are open. From the inside.',
        'Consciousness returns like cold water. You are in a crypt. The honoured dead were here once. They are not resting any more.',
      ],
      burial_chamber: [
        'The burial chamber is vast, its ceiling lost in shadow. A grand sarcophagus dominates the centre — lid shattered outward. You step carefully around the scattered offerings.',
        'Funerary urns line every shelf. The inscriptions promise eternal rest. Based on what you\'ve seen so far, that promise has not been kept.',
      ],
      torture_chamber: [
        'The smell hits you first. Then the sight. The torture chamber is exactly as grim as the name promises, and currently occupied.',
        'You push through the iron door and immediately wish you had not. The torture chamber has been recently used. The implements are still warm.',
      ],
      necromancer_study: [
        'The study is thick with the smell of arcane ink and something burning. The candles are lit. Whoever works here left moments ago.',
        'Books and diagrams cover every surface. The cauldron at the far end bubbles with something that smells like ambition and grave-dirt.',
      ],
      weapon_vault: [
        'The weapon vault! Blades, axes, and armour on every wall. Most are corroded — but a few gleam with suspicious freshness.',
        'You enter the vault and feel better about your odds immediately. The weapons here are varied and well-kept. Something has been maintaining them.',
      ],
      throne_room: [
        'The throne room is vast and cold, lit by torches burning with blue flame. Whatever sits on the obsidian throne has been waiting a very long time.',
        'You enter the great hall. The throne at the far end is occupied. Its occupant turns its skull toward you with a sound like grinding millstones.',
      ],
      catacombs: [
        'The catacombs stretch in every direction, walls lined floor-to-ceiling with stacked bones. The silence has a texture. The bones have a patience.',
        'Thousands of bones. Thousands of years. Some of the stacks are disturbed. You pick a direction and move quickly, not looking at the skulls.',
      ],
      ritual_chamber: [
        'The summoning circle carved into the floor still pulses with faint light. Something was called here. Whether it left is uncertain.',
        'The ritual chamber reeks of power and old blood. Inscriptions ring the walls — prayers or demands, you can\'t tell. The altar is still warm.',
      ],
      treasure_vault: [
        'Gold glitters in the torchlight. Your heart leaps — then sinks as you notice most chests are already open. Already empty. Already picked clean.',
        'The treasure vault! Riches piled high. Also: a skeleton grinning at you from atop a coin pile, still clutching its prize. It got here first.',
      ],
      bone_pit: [
        'The bone pit stretches across the floor, bones piled ten feet deep. As you edge around it, the bones shift. You move faster.',
        'The smell of the bone pit reaches you before you see it. You skirt the edge. The bones below arrange themselves into shapes as you watch.',
      ],
      flooded_corridor: [
        'Black water covers the floor to ankle depth. It is cold enough to ache. Something moves under the surface — far too large for water this shallow.',
        'The corridor is flooded. Your torchlight reflects from the water — and from something beneath it. Multiple somethings.',
      ],
      forbidden_library: [
        'Books stretch wall to wall, floor to ceiling — bound in things you refuse to name. One is whispering. Another is laughing softly.',
        'The forbidden library is larger inside than it has any right to be. The shelves rearrange when you\'re not looking. One book has crawled off its shelf.',
      ],
      guard_post: [
        'Skeletal guards stand at perfect attention. They turn to face you in unison. They have been waiting for exactly this moment.',
        'The guard post is abandoned except for one skeleton still writing in a ledger. It does not stop as you enter. It does not look up.',
      ],
      exit_shaft: [
        'The exit shaft! Grey daylight filters down from above. Iron rungs lead up through the stone. You have never been so glad to see the colour grey.',
        'A shaft of actual daylight. The surface is up there. The rungs look old. They will hold. They have to hold.',
      ],
    },

    genericArrival: [
      'You push through a heavy stone door into another torch-lit passage of {world}. The shadows move in ways shadows should not.',
      'The passage opens into another chamber of {world}. Your footsteps echo on ancient stone. Something else\'s footsteps echo back.',
      'You move deeper into {world}. The air grows colder. The torches flicker without any wind to move them.',
    ],

    weaponVerbs: {
      iron_sword:      ['bites into', 'carves through', 'strikes', 'pierces'],
      battle_axe:      ['cleaves into', 'hews through', 'rends', 'shatters against'],
      enchanted_blade: ['blazes through', 'severs with arcane force', 'cuts clean through', 'carves glowing lines through'],
      unarmed:         ['crashes into', 'batters', 'hammers', 'drives into'],
    },

    classStyle: {
      Warrior: ['with disciplined battlefield form', 'in a powerful overhand arc', 'with the weight of trained muscle behind it'],
      Mage:    ['channelling arcane force through your arm', 'with magically augmented momentum', 'guided by arcane insight'],
      Rogue:   ['finding the gap in its defence', 'slipping past its guard at the last instant', 'striking the unprotected flank'],
      Cleric:  ['invoking divine judgement', 'with holy purpose driving the swing', 'righteousness behind the blow'],
      Ranger:  ['with careful aim and steady hand', 'reading its movement before committing', 'choosing the optimal angle'],
    },

    enemyReactions: {
      'Skeleton Warrior':  ['bones fracture and splinter', 'it staggers with a dry rattling crack', 'the skeleton recoils, joints grinding'],
      'Necromancer':       ['dark energy bleeds from the wound', 'it hisses an incantation through gritted teeth', 'the dark magic wavers around it'],
      'Death Knight':      ['ancient armour dents and buckles', 'it snarls with cold ancient fury', 'it absorbs the blow and redoubles its focus'],
      'Bone Golem':        ['chunks of bone scatter and clatter to the stones', 'it rocks back on its foundations', 'the frame cracks audibly'],
      'Wraith':            ['the spectral form ripples and screams', 'it recoils as if burned by living warmth', 'cold light bleeds from the wound'],
      'Cursed Revenant':   ['the curse-light dims momentarily', 'it staggers, nearly breaking the compulsion', 'dark energy seeps from the break'],
      'Tomb Guardian':     ['ancient stone cracks under the force', 'the runic ward flickers', 'it lurches backward grinding on the floor'],
    },

    deathSaveStatus: {
      0: ['The dungeon watches you struggle...', 'The cold pulls you toward the dark...'],
      1: ['Two failures from the end. Hold on.', 'The cold stone draws the warmth from you...'],
      2: ['One more failure and the dungeon keeps you. Push back.', 'This is the edge. Fight.'],
    },

    combatHit: {
      healthy: [
        'By the old gods! Your strike connects with a resounding crack! The {enemy} staggers!',
        'A solid hit! Your weapon bites deep — the {enemy} shrieks in a voice like grinding millstones!',
        'Excellent! You find a gap in the {enemy}\'s defences and land a devastating blow!',
        'Well struck! The {enemy} howls with ancient fury as the blow lands!',
      ],
      hurt: [
        'Wounded and furious, you drive the blow home — the {enemy} reels!',
        'Through gritted teeth and sheer will, you land a telling strike on the {enemy}!',
        'Pain sharpens your focus. You connect — the {enemy} staggers!',
        'Fighting through the hurt, you find your mark on the {enemy}!',
      ],
      critical: [
        'On the edge of darkness, pure instinct guides your arm — it lands! The {enemy} shrieks!',
        'Barely standing, you pour everything into one strike — it connects! The {enemy} staggers!',
        'The blow comes from somewhere deeper than strength. It lands — the {enemy} reels!',
        'Against all odds, the strike finds its mark — the {enemy} recoils!',
      ],
    },

    combatMiss: {
      healthy: [
        'You swing wide — the {enemy} sidesteps with unnatural grace.',
        'Your attack goes wild! The {enemy} lets out a rattling laugh.',
        'A near-miss — the {enemy} twists away with terrible speed.',
        'The {enemy} parries your strike with cold precision.',
      ],
      hurt: [
        'Your wounded arm throws the swing off — the {enemy} reads it easily.',
        'The {enemy} watches your exhausted movement and simply steps aside.',
        'Fighting through the pain is slowing you — the {enemy} avoids the blow.',
        'Your strike telegraphs too much. The {enemy} steps out of range.',
      ],
      critical: [
        'You can barely raise the weapon. The {enemy} steps past your guard.',
        'Your vision swims — the strike goes wide and the {enemy} is still coming.',
        'Everything you have, and still it misses — the {enemy} is relentless.',
        'The desperate swing finds nothing. The {enemy} watches you fail.',
      ],
    },

    enemyAttacks: [
      'The {enemy} strikes with undead fury, dealing {dmg} damage!',
      'With a bone-rattling shriek, the {enemy} tears into you for {dmg} damage!',
      'The {enemy} lashes out with cold, unerring purpose — {dmg} damage!',
      'Before you can recover, the {enemy} rakes across you! {dmg} damage!',
    ],

    killShot: [
      'The {enemy} collapses in a clatter of bone and shadow. The light fades from its eyes. It is done. +{xp} XP!',
      'With a final, shuddering groan, the {enemy} crumbles to dust. You breathe. You survived. +{xp} XP!',
      'The {enemy} falls at last, ancient and defeated. The dungeon is quieter for it. +{xp} XP!',
    ],

    lootPickedUp: [
      'You snatch the {item} from the gloom. In a dungeon full of horrors, even small finds matter.',
      'You grab the {item}. Something to tip the odds — you\'ll take it.',
      'The {item} goes into your pack. The dead don\'t need it. You do.',
    ],

    noLoot: [
      'You search the chamber thoroughly. Nothing useful — looted long ago, or consumed by whatever haunts this place.',
      'Empty. Picked clean. Whatever passed through first left you nothing but dust and dread.',
      'You find nothing of use. The dungeon gives up its secrets reluctantly — and this time, not at all.',
    ],

    alreadyLooted: [
      'Already searched this area. Still nothing.',
      'You grabbed everything useful here. The darkness owes you nothing more.',
    ],

    noEnemy: [
      'You look around. The chamber is still — for now. The dungeon is never truly empty.',
      'No undead visible. Either you\'re fortunate, or they\'re waiting.',
    ],

    alreadyDead: [
      'The creature\'s bones lie where it fell. Still crumbled. Still very defeated.',
      'The remains of your fallen foe lie on the cold stone. You give them a cautious kick. Thoroughly dead.',
    ],

    examineTemplates: [
      'You study the {room} carefully. {desc} Passages lead to: {exits}.',
      'Taking stock of the {room}: {desc} You could proceed toward: {exits}.',
      'You survey the {room}. {desc} Exits open to: {exits}.',
    ],

    sneakSuccess: [
      'You press yourself flat against the cold stone and edge past the {enemy}, holding your breath.',
      'Somehow you slip past the {enemy} undetected. The dead are not known for their perception — usually.',
    ],

    sneakFail: [
      'The {enemy} senses the living! It strikes before you can react — {dmg} damage!',
      'The undead feel the warmth of the living. The {enemy} wheels and attacks for {dmg} damage!',
    ],

    deathLines: [
      'The {enemy} delivers a final, crushing blow. The torch goes dark. The dungeon claims another soul.',
      'You fall to the cold floor of {world}. Your last thought: at least you made it further than the last one.',
      'Darkness takes you. {world} has swallowed you whole. The bones will be sorted with the rest.',
    ],

    escapeLines: [
      'You haul yourself up the iron rungs and burst into daylight! The air is clean and cold and wonderful! YOU ESCAPED {world}!',
      'Hand over hand, you climb toward the light. Stone gives way to soil gives way to open sky. YOU MADE IT OUT OF {world}!',
    ],

    enemyDeflected: [
      'The {enemy} strikes but your {armor} holds firm!',
      'Your {armor} absorbs the {enemy}\'s blow with a hollow clang — not even a scratch!',
      'The {enemy}\'s attack glances off your {armor}. The dead are persistent, but you are armoured.',
    ],

    levelUp: 'LEVEL UP! Your trials have hardened you into something the dungeon should fear. +4 max HP!',

    noEscapeNearby: 'There is no way out here. You must find the Exit Shaft.',

    escapeBlocked: 'blocks the exit shaft! Deal with it first!',
  },
};
