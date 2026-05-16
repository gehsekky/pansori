import type { Context } from '../types.js';

export const context: Context = {
  id: 'scifi-terror',
  worldNoun: 'ship',
  startRoomId: 'cryo_bay',
  escapeRoomId: 'escape_pods',
  escapeTriggers: ['launch', 'get out now'],
  escapeChoiceText: 'Launch escape pod — GET OUT NOW',

  worldNames: [
    'USCSS Prometheus', 'ISV Covenant', 'ECS Nostromo',
    'GSV Iron Fist', 'MV Red Dwarf', 'USCSS Derelict',
    'NSEA Protector',
  ],

  enemyTemplates: [
    // CR 1/4 — starter threats (zombie / skeleton equivalent)
    { name: 'Infected Crewmate', cr: 0.25, hp:  22, ac:  8, damage: '1d6+1',  toHit: 3, xp:    50, wis:  6 },
    { name: 'Pod-Spawn',         cr: 0.25, hp:  13, ac: 12, damage: '1d6+2',  toHit: 4, xp:    50, dex: 14, wis:  8 },
    // CR 1 — early ship sections
    { name: 'Brain-Leech',       cr:    1, hp:  22, ac: 13, damage: '2d6+2',  toHit: 4, xp:   200, dex: 15, wis: 14 },
    { name: 'Chrome-Crawler',    cr:    1, hp:  26, ac: 14, damage: '1d8+3',  toHit: 4, xp:   200,          wis: 10 },
    // CR 3–5 — mid ship
    { name: 'Corrupted Android', cr:    3, hp:  52, ac: 15, damage: '2d8+3',  toHit: 5, xp:   700,          wis: 10 },
    { name: 'Alien Warrior',     cr:    5, hp:  67, ac: 13, damage: '2d8+4',  toHit: 6, xp:  1100, dex: 16, wis: 12 },
    { name: 'Xenomorph Brute',   cr:    5, hp:  84, ac: 14, damage: '3d6+4',  toHit: 7, xp:  1800,          wis: 12 },
    // CR 6+ — boss-tier
    { name: 'Hive Empress',      cr:   13, hp: 127, ac: 17, damage: '3d8+6',  toHit: 9, xp: 10000, dex: 18, wis: 18 },
  ],

  introTexts: [
    'You awake from your slumber and find yourself in a strange room. The windows on the wall show moving star trails so you realize you are in space. But how? Why?',
    'You are awoken by a shrill scream somewhere nearby. You find yourself on a starship. How did you get here? What made that scream?',
  ],

  roomPool: [
    { id: 'cryo_bay', name: 'Cryo Bay', descs: [
      'Banks of cryo-tubes, some cracked open from the inside. Frost drifts in the red-lit air.',
      'Shattered cryo-pods litter the floor, their occupants long gone. Ice crystals hang motionless in the recycled air.',
      'The revival sequence is still cycling on a tube in the corner — whoever it was waiting for never came.',
    ]},
    { id: 'med_bay', name: 'Medical Bay', descs: [
      'Gleaming chrome surfaces stained with luminous ichor. A surgical robot twitches in the corner.',
      'Every cabinet has been ransacked. The diagnostic table hums softly, its readouts scrolling vital signs for no one.',
      'Sedative canisters have been smashed open. Whatever woke up in here did not wait for the doctor.',
    ]},
    { id: 'engine_room', name: 'Engine Room', descs: [
      'Massive ion drives hum ominously. The floor vibrates. Something is behind the coolant tanks.',
      'The reactor gauge is pinned in the red. Heat shimmer blurs the far end of the room, where something moves.',
      'Coolant is leaking from a ruptured pipe, pooling in a slow iridescent slick across the grating.',
    ]},
    { id: 'bridge', name: 'Ship Bridge', descs: [
      'Blinking control panels illuminate a smashed viewport. Stars wheel past. The nav-computer screams.',
      'The pilot\'s chair is still warm. Navigation shows the ship drifting in a slow death-spiral toward the nearest moon.',
      'Emergency lighting casts everything red. A recorded distress signal plays on loop from a cracked speaker.',
    ]},
    { id: 'cargo_hold', name: 'Cargo Hold', descs: [
      'Towering stacks of crates, some... moving. A sticky substance coats the floor.',
      'Manifests scattered everywhere list biological specimens — all marked CONTAINED. The cages are open.',
      'Something enormous has been nesting between the shipping containers. The smell alone is enough to make you gag.',
    ]},
    { id: 'cafeteria', name: 'Cafeteria', descs: [
      'Trays of space-food, half-eaten and abandoned. The Jell-O is still quivering. Strangely.',
      'The coffee machine is still brewing. Forty-seven mugs of cold coffee line the counter, each one abandoned mid-sip.',
      'Tables overturned in a panic. Someone wrote a name on the wall in ketchup, then ran out of time to finish it.',
    ]},
    { id: 'armory', name: 'Armory', descs: [
      'Ray gun racks — mostly empty. Scorch marks everywhere. Someone made a last stand here.',
      'Spent charge packs crunch underfoot. The weapon locker has been torn open from the outside, not the inside.',
      'A barricade of overturned shelving, long since breached. The defenders ran out of ammunition before hope.',
    ]},
    { id: 'airlock', name: 'Airlock', descs: [
      'One door leads to the void. Warning lights flash. The outer door has been opened recently.',
      'Scratch marks line the inner door — from inside the airlock, pointing out. Someone wanted out very badly.',
      'A pressure suit hangs by the entrance, one glove missing. The helmet visor is fogged from the inside.',
    ]},
    { id: 'lab', name: 'Science Lab', descs: [
      'Bubbling vats containing things best left unexamined. One of the containment units has been breached.',
      'Research notes are pinned everywhere — excited scrawl that grows increasingly frantic toward the final pages.',
      'Every specimen jar has been shattered. The dissection table holds something that does not match any known taxonomy.',
    ]},
    { id: 'gaming_room', name: 'Crew Gaming Room', descs: [
      'Arcade cabinets stand dark and silent. Someone spray-painted DONT PLAY on the nearest screen. The high score table reads the same name in all ten slots.',
      'Card tables overturned, poker chips scattered mid-hand. A slot machine still cycles its lights in the corner, paying out to no one.',
      'The rec room smells of stale snacks and something biological. A dartboard hangs on the far wall — the target replaced with a crew photo.',
    ]},
    { id: 'crew_quarters', name: 'Crew Quarters', descs: [
      'Rows of bunks, personal effects undisturbed — photos, novels, a child\'s drawing pinned above one pillow. The mundane horror of it hits harder than the monsters.',
      'A personal terminal plays a recorded message on loop. You catch fragments: "tell my family..." before you stop listening and focus on moving forward.',
      'The sleeping quarters are eerily pristine. Every bunk made, every locker shut. The smell is wrong though. Something has been here very recently.',
    ]},
    { id: 'stellar_cartography', name: 'Stellar Cartography', descs: [
      'A holographic star map blooms in blue light. The ship\'s course has been manually overridden. You trace the new heading — it leads nowhere charted.',
      'Star charts and handwritten notes cover every surface. The calculations don\'t make sense, then they do, then you wish they didn\'t.',
      'The cartography display is zoomed to maximum on a single dark point in space — one that appears on no official map. Someone was very interested in that location.',
    ]},
    { id: 'ship_gym', name: 'Ship Gym', descs: [
      'All the treadmills are still running — nobody on them. The weight rack has been stripped and the plates bent like tin foil. Something in here was very strong.',
      'Resistance cables hang from the ceiling, snapped at their anchors. The bench press bar is twisted into a spiral. You give the punching bag a wide berth — it has been punched through.',
      'The gymnasium reeks of exertion. The equipment settings are maxed far beyond any crew member\'s capability. Whatever trained in here wasn\'t human.',
    ]},
    { id: 'escape_pods', name: 'Escape Pod Bay', descs: [
      'Three pods remain among six empty berths. The control panel reads: LAUNCH READY. Freedom awaits.',
      'Two pods remain. Someone left in a hurry — the third launch cradle is scorched and still warm.',
      'A single escape pod sits powered and ready. One berth. One chance. The others were taken long ago.',
    ]},
  ],

  lootTable: [
    { id: 'ray_gun',          name: 'Ray Gun',              desc: '2d6 damage, ranged weapon',                          weight: 18, type: 'weapon',     slot: 'weapon', damage: '2d6',  ac_bonus: null, heal: null,    effect: null,            aliases: ['ray gun', 'raygun'] },
    { id: 'med_kit',          name: 'Med Kit',              desc: 'Heals 2d4+2 HP, one use',                            weight: 28, type: 'consumable',  slot: null,     damage: null,   ac_bonus: null, heal: '2d4+2', effect: null,            aliases: ['med kit', 'medkit', 'med'] },
    { id: 'space_rations',    name: 'Space Rations',        desc: 'Restore 1 HP, one use',                              weight: 22, type: 'consumable',  slot: null,     damage: null,   ac_bonus: null, heal: '1',     effect: null,            aliases: ['space rations', 'rations'] },
    { id: 'stun_baton',       name: 'Stun Baton',           desc: '1d8 damage, finesse, melee weapon',                  weight: 14, type: 'weapon',     slot: 'weapon', damage: '1d8',  finesse: true, ac_bonus: null, heal: null,    effect: null,            aliases: ['stun baton', 'stun', 'baton'] },
    { id: 'hazmat_suit',      name: 'Hazmat Suit',          desc: '+2 AC while equipped',                               weight: 10, type: 'armor',      slot: 'armor',  damage: null,   ac_bonus: 2,    heal: null,    effect: null,            aliases: ['hazmat suit', 'hazmat'] },
    { id: 'alien_egg',        name: 'Alien Egg',            desc: 'Pulsing. Warm. Why did you take this?',              weight: 4,  type: 'misc',       slot: null,     damage: null,   ac_bonus: null, heal: null,    effect: null,            aliases: ['alien egg', 'egg'], useNarrative: 'You hold up the Alien Egg. It pulses warmly in your hand. You set it back down very carefully.' },
    { id: 'space_whiskey',    name: 'Space Whiskey',        desc: 'Advantage on next CON save, one use',                weight: 4,  type: 'consumable',  slot: null,     damage: null,   ac_bonus: null, heal: null,    effect: 'con_advantage', aliases: ['space whiskey', 'whiskey'] },
    { id: 'laser_sword',      name: 'Laser Sword',          desc: '2d8 damage, finesse, melee weapon',                  weight: 10, type: 'weapon',     slot: 'weapon', damage: '2d8',  finesse: true, ac_bonus: null, heal: null,    effect: null,            aliases: ['laser sword', 'lightsaber', 'laser'] },
    { id: 'ballistic_shield', name: 'Ballistic Shield',     desc: '+2 AC while equipped',                               weight: 12, type: 'armor',      slot: 'shield', damage: null,   ac_bonus: 2,    heal: null,    effect: null,            aliases: ['ballistic shield', 'shield'] },
    { id: 'force_field_belt', name: 'Force Field Belt',     desc: '+3 AC while equipped',                               weight: 8,  type: 'armor',      slot: 'armor',  damage: null,   ac_bonus: 3,    heal: null,    effect: null,            aliases: ['force field belt', 'force field', 'belt'] },
    { id: 'autopsy_manual',   name: 'Alien Autopsy Manual', desc: 'Reading it raises more questions than answers',      weight: 5,  type: 'misc',       slot: null,     damage: null,   ac_bonus: null, heal: null,    effect: null,            aliases: ['autopsy manual', 'autopsy', 'manual'], useNarrative: 'You flip through the Alien Autopsy Manual. Page 47 raises a question you will never be able to un-think. You close it.' },
    { id: 'insurance_card',   name: 'Space Insurance Card', desc: 'Coverage void in alien encounters',                  weight: 5,  type: 'misc',       slot: null,     damage: null,   ac_bonus: null, heal: null,    effect: null,            aliases: ['space insurance card', 'insurance card', 'insurance', 'card'], useNarrative: 'You read the fine print. Section 12, Subsection F: "Coverage void in the event of alien encounter, dimensional anomaly, or acts of cosmic horror." Helpful.' },
    { id: 'mystery_goo',      name: 'Mystery Goo',          desc: 'Unknown effect. Smells like eucalyptus and regret.', weight: 5,  type: 'consumable',  slot: null,     damage: null,   ac_bonus: null, heal: null,    effect: 'mystery',       aliases: ['mystery goo', 'goo', 'mystery'] },
  ],

  narratives: {
    roomArrival: {
      cryo_bay: [
        'You bolt upright from your cryo-tube, gasping. The chamber reeks of ozone and something biological. Half the tubes are shattered — from the inside.',
        'Consciousness crashes back like a freight hauler. You\'re in the cryo bay. Frost clings to the walls, red emergency lights pulse, and something is making a sound you cannot identify.',
      ],
      med_bay: [
        'The medical bay gleams with chrome surfaces — mostly stained with luminous greenish ichor. A surgical robot twitches in the corner, its saw-arm spinning on its own.',
        'The medbay door groans open. The smell of antiseptic barely covers something worse. Every drawer has been ransacked. The autopsy table is occupied.',
      ],
      engine_room: [
        'The ion drives thunder around you, shaking your teeth loose. Warning lights paint everything amber. Something large is moving behind the coolant tanks.',
        'Blast-heat washes over you as you enter. The reactor is running dangerously hot. A wet trail on the deck leads behind the primary generator.',
      ],
      bridge: [
        'The bridge is a chaos of sparking consoles and a smashed viewport. Stars wheel past. The nav-computer shrieks: COLLISION WARNING — 47 MINUTES.',
        'You stagger onto the bridge. Most crew stations are vacant. The captain\'s chair is occupied by something that used to be the captain.',
      ],
      cargo_hold: [
        'Towering crates loom in the red-lit hold. A sticky substance coats the floor — your boots make obscene sounds with each step. Something shifts high above you.',
        'The cargo hold stretches into darkness. Someone has arranged the crates into a nest. There are eggs. There are a lot of eggs.',
      ],
      cafeteria: [
        'Half-eaten meals sit abandoned on the tables. The Jell-O is still quivering — which is strange because the {world} has been dark for months. The lights flicker in a pattern.',
        'The food synthesizer is still running, depositing something greenish onto an ever-growing pile on the floor. A meal tray skitters across the room on its own.',
      ],
      armory: [
        'The armory reeks of ozone and scorched metal. Most weapon racks stand empty. Scorch marks scar every surface. Someone made a heroic last stand here.',
        'Ray gun housings lie spent on the floor. Whoever was here fought hard and long. You step over a smoldering blast-glove and search for anything left.',
      ],
      airlock: [
        'Warning lights bathe the airlock in crimson. The outer door indicator reads AJAR. Through the porthole: stars, and something clinging to the hull.',
        'The airlock hisses around you. VACUUM ALERT strobes on the panel. The emergency tether locker hangs open. Someone wrote DONT OPEN on the wall in what you hope is rust.',
      ],
      lab: [
        'Containment vats bubble with specimens you refuse to name. One unit has been breached — the glass pushed outward. Something got out from the inside.',
        'The science lab reeks of formaldehyde and burned circuitry. Research notes are scattered everywhere. The last legible entry reads: IT REMEMBERS.',
      ],
      gaming_room: [
        'The gaming lounge is dark except for one arcade cabinet still cycling its attract screen, casting strobing light across overturned chairs. The high score board reads the same name — all ten slots.',
        'You step into the rec room. Cards and chips litter the floor from a game interrupted mid-hand. A recorded jingle plays somewhere in the dark. It does not stop.',
      ],
      crew_quarters: [
        'The bunks stretch in rows, personal effects undisturbed — photos, a child\'s drawing, a novel left open face-down. The mundane horror of it hits harder than the monsters.',
        'A personal terminal at the far end loops a recorded message. You catch fragments — "tell my family" — before you stop listening and force yourself to focus.',
      ],
      stellar_cartography: [
        'A holographic star map fills the room in cold blue light. The {world}\'s course has been manually overridden. You trace the new heading with your finger — it leads nowhere charted.',
        'Star charts and handwritten notes cover every surface. The calculations don\'t make sense. Then they do. Then you wish they didn\'t.',
      ],
      ship_gym: [
        'All the treadmills are running. Nobody on them. The weight rack has been stripped bare, the plates bent like tin foil. Something in here was very, very strong.',
        'The gymnasium reeks of exertion. Resistance cables hang snapped from the ceiling. The bench press bar is twisted into a rough spiral. You give the punching bag a wide berth — it has been punched through.',
      ],
      escape_pods: [
        'Three escape pods sit in their berths. The control panel blazes green: LAUNCH READY. Your heart hammers. You\'re so close. But something is in here with you.',
        'The escape pod bay! Freedom! Three pods, ready to launch. You sprint for the nearest — then freeze. The access panel has been tampered with. Not by a human hand.',
      ],
    },

    genericArrival: [
      'You push through the bulkhead into a new section of the {world}. Emergency lighting casts everything in shades of dread.',
      'The corridor opens into the next compartment. Your footsteps echo. Something else\'s footsteps echo back.',
      'You move through the hatch. The air here is different — colder, heavier, wrong.',
    ],

    weaponVerbs: {
      ray_gun:          ['blasts', 'sears through', 'scorches', 'vaporises a section of'],
      stun_baton:       ['cracks against', 'jolts', 'connects with', 'drives into'],
      laser_sword:      ['slices through', 'cuts deep into', 'bisects', 'carves through'],
      unarmed:          ['smashes into', 'hammers', 'drives into', 'crashes against'],
    },

    classStyle: {
      Soldier:   ['with practiced military efficiency', 'in a textbook combat manoeuvre', 'with relentless trained aggression'],
      Scientist: ['targeting a biological weak point', 'with calculated anatomical precision', 'analysing the anatomy in real time'],
      Pilot:     ['with split-second combat reflexes', 'exploiting a half-second gap in its movement', 'with evasive fighting instincts'],
      Engineer:  ['using improvised combat technique', 'with brute mechanical force', 'adapting the approach on the fly'],
      Medic:     ['targeting the nervous system', 'with grim anatomical knowledge', 'applying clinical force'],
    },

    enemyReactions: {
      'Glob-Beast':     ['its membrane ruptures and re-seals', 'the mass sloshes violently', 'it gelatinises around the impact'],
      'Brain-Leech':    ['its psi-tendrils spasm', 'a psychic screech fills your mind', 'it writhes in telepathic agony'],
      'Chrome-Crawler': ['sparks fly from the chassis', 'its limbs lock momentarily', 'it shrieks on a metallic frequency'],
      'Void-Slug':      ['dark ichor weeps from the wound', 'gravity ripples around the impact', 'it folds in on itself'],
      'Zap-Moth':       ['antennae arc with static discharge', 'wing-beats become erratic', 'electricity bleeds from the wound'],
      'Slime-Wraith':   ['the ectoplasm scatters and reforms', 'it lets out a gurgling wail', 'viscous fluid sprays'],
      'Pod-Spawn':      ['the chitinous shell cracks', 'natal fluid seeps from the breach', 'it shrieks in its alien tongue'],
    },

    deathSaveStatus: {
      0: ['You are barely holding together...', 'Darkness laps at the edge of your vision...'],
      1: ['One foot in the void. Fight harder.', 'The void is pulling at you...'],
      2: ['Last chance. Do not let go.', 'Teetering on the edge — one roll left.'],
    },

    combatHit: {
      healthy: [
        'Great Galaxies! A solid hit! The {enemy} lets out an unearthly shriek!',
        'By the rings of Saturn! Direct hit! The {enemy} staggers, ichor spattering the deck!',
        'Suffering satellites! Textbook strike! The {enemy} screams in a register no human throat could produce!',
        'Bull\'s-eye! You find a weak point in the {enemy}\'s hide — it shrieks and writhes!',
      ],
      hurt: [
        'Gritting your teeth through the pain, you land a telling blow on the {enemy}!',
        'Bleeding and battered, you drive the attack home — the {enemy} staggers!',
        'Fighting through the haze, you connect solidly with the {enemy}!',
        'Wounded but unbroken, you land the strike on the {enemy}!',
      ],
      critical: [
        'On pure survival instinct, you lash out — and it lands! The {enemy} recoils!',
        'Barely standing, adrenaline drives your arm — you connect! The {enemy} screams!',
        'Against everything, you find the target — the {enemy} staggers as the blow lands!',
        'From somewhere deeper than fear, the strike comes — and it hits the {enemy}!',
      ],
    },

    combatMiss: {
      healthy: [
        'You swing wide — the {enemy} dodges with unnatural speed, its many eyes gleaming.',
        'Your attack goes wild! The {enemy} sidesteps effortlessly.',
        'A near-miss — the {enemy} shrieks as your strike skims past.',
        'The {enemy} is faster than it looks. Your strike meets nothing but air.',
      ],
      hurt: [
        'Your aim is off — pain is slowing you down. The {enemy} avoids it easily.',
        'The {enemy} reads your movement — too obvious! Your strike finds nothing.',
        'Fatigue betrays the attack. The {enemy} sidesteps without effort.',
        'You overcorrect through the pain and the blow goes wide.',
      ],
      critical: [
        'Your vision blurs and the attack goes wide — the {enemy} is still coming!',
        'You can barely lift your arm. The {enemy} steps through your guard.',
        'A desperate swing and nothing. The {enemy} dodges effortlessly.',
        'Everything you have left — and it misses. The {enemy} is relentless.',
      ],
    },

    enemyAttacks: [
      'The {enemy} retaliates with terrifying speed, dealing {dmg} damage!',
      'With a bloodcurdling shriek, the {enemy} rakes you for {dmg} damage!',
      'The {enemy} lashes out! You take {dmg} damage — that\'ll leave a mark!',
      'Before you can recover, the {enemy} strikes! {dmg} damage!',
    ],

    killShot: [
      'The {enemy} lets out one final, echoing shriek and collapses to the deck. Silence. You breathe. You survived. +{xp} XP!',
      'With a wet thud, the {enemy} falls. Its alien limbs twitch once, twice, then go still. +{xp} XP!',
      'The {enemy} shudders violently and goes limp. You\'ve done it! The beast is dead! +{xp} XP!',
    ],

    lootPickedUp: [
      'You snatch the {item} from the clutter. Never know when this\'ll come in handy.',
      'You grab the {item}. Not ideal equipment for this nightmare, but better than nothing.',
      'The {item} goes into your pack. A small victory on a very bad day.',
    ],

    noLoot: [
      'You search thoroughly. Nothing useful — whoever was here before cleaned it out. Or ate it.',
      'The room has been picked clean. Nothing left but bad memories and a faint alien odor.',
      'Empty-handed. Whatever came through here first left you nothing.',
    ],

    alreadyLooted: [
      'You already grabbed everything useful here. Nothing left.',
      'Checked this spot already. Still nothing.',
    ],

    noEnemy: [
      'You look around for trouble. The room is quiet — for now.',
      'No creature in sight. Either you\'re lucky, or it\'s hiding.',
    ],

    alreadyDead: [
      'The creature\'s corpse is right where you left it. Still dead. Good.',
      'The alien remains lie still on the deck. You give it a cautious kick. Very dead.',
    ],

    examineTemplates: [
      'You scan the {room} carefully. {desc} Exits lead to: {exits}.',
      'Taking stock of the {room}: {desc} You could move toward: {exits}.',
      'You survey the {room}. {desc} Pathways open to: {exits}.',
    ],

    sneakSuccess: [
      'You press yourself flat against the bulkhead and edge past the {enemy}, barely breathing.',
      'Somehow you slip past the {enemy} without it noticing. You don\'t look back.',
    ],

    sneakFail: [
      'The {enemy} spots you mid-sneak! It lunges before you can react — {dmg} damage!',
      'You\'re not as quiet as you hoped. The {enemy} wheels around and strikes for {dmg} damage!',
    ],

    deathLines: [
      'The {enemy} delivers a final blow. The stars go dark. Mission... failed.',
      'You collapse to the deck of the {world}. Your last thought: at least you made them work for it.',
      'Game over, operative. The {world} has claimed another victim.',
    ],

    escapeLines: [
      'You slam the launch button! The pod rockets free of the {world} with a thunderous roar! YOU ESCAPED!',
      'The pod launches! G-forces pin you to the seat as you streak away from the doomed vessel! YOU MADE IT!',
    ],

    enemyDeflected: [
      'The {enemy} strikes but your {armor} absorbs the blow!',
      'Your {armor} crackles as the {enemy}\'s attack glances off!',
      'The {enemy}\'s claws rake across your {armor} — no damage!',
    ],

    levelUp: 'LEVEL UP! Your experience has forged you into a better operative. +4 max HP!',

    noEscapeNearby: 'There are no escape pods here. You must reach the Escape Pod Bay first!',

    escapeBlocked: 'stands between you and the pods! Deal with it first!',
  },
};
