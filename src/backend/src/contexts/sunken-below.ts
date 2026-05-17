import type { Context } from '../types.js';

export const context: Context = {
  id:           'sunken-below',
  mapType:      'campaign',
  worldNoun:    'station',
  startRoomId:  'airlock',
  escapeRoomId: 'submersible_bay',
  escapeTriggers: [
    'launch submersible', 'start submersible', 'submersible', 'launch nereid',
    'nereid', 'launch sequence', 'evacuate', 'escape pod', 'launch',
  ],
  escapeChoiceText: 'Launch the Nereid-2 — DIVE FOR THE SURFACE',

  worldNames: ['Hadal Station Erebus'],

  classPrimaryStats: {
    Biologist: 'wis',
    Diver:     'con',
    Salvager:  'str',
    Engineer:  'int',
    Medic:     'wis',
  },

  classHitDie: {
    Biologist:  8,
    Diver:     10,
    Salvager:  10,
    Engineer:   8,
    Medic:      8,
  },

  classSkills: {
    Biologist: ['medicine', 'perception'],
    Diver:     ['athletics', 'survival'],
    Salvager:  ['athletics', 'intimidation'],
    Engineer:  ['investigation', 'arcana'],
    Medic:     ['medicine', 'survival'],
  },

  // Not used for campaign contexts — procgen skips these.
  enemyTemplates: [],
  introTexts:    [],
  roomPool:      [],

  lootTable: [
    {
      id: 'pressure_suit', name: 'Pressure Suit', desc: '+3 AC while equipped. Rated to 700 ATM.',
      weight: 10, type: 'armor', slot: 'armor', damage: null, ac_bonus: 3,
      heal: null, effect: null, aliases: ['suit', 'pressure suit'],
    },
    {
      id: 'diving_knife', name: 'Diving Knife', desc: '1d4+1 damage. Standard-issue station equipment.',
      weight: 5, type: 'weapon', slot: null, damage: '1d4+1', ac_bonus: null,
      heal: null, effect: null, aliases: ['knife', 'diving knife', 'blade'],
    },
    {
      id: 'flare_pistol', name: 'Flare Pistol', desc: '1d6 damage, ranged.',
      weight: 4, type: 'weapon', slot: null, damage: '1d6', ac_bonus: null,
      heal: null, effect: null, aliases: ['flare', 'pistol', 'flare gun', 'flare pistol'],
      range: 'ranged',
    },
    {
      id: 'oxygen_canister', name: 'Oxygen Canister', desc: 'Restores 2d4 HP. Emergency O2 supply.',
      weight: 6, type: 'consumable', slot: null, damage: null, ac_bonus: null,
      heal: '2d4', effect: null, aliases: ['oxygen', 'o2', 'canister', 'oxygen canister'],
    },
    {
      id: 'research_notes', name: "Dr. Vasquez's Notes", desc: "Field notes. Answers more questions than you wanted.",
      weight: 1, type: 'misc', slot: null, damage: null, ac_bonus: null,
      heal: null, effect: null, aliases: ['notes', 'research notes', 'journal', 'vasquez'],
    },
  ],

  campaign: {
    world_name: 'Hadal Station Erebus',

    intro: "You wake up on the grating of Airlock A-7. You don't remember lying down. The outer door is sealed — pressure-rated, holding against 340 atmospheres of black water. The inner door is open. Emergency lights paint everything red. Your wrist-mounted O2 reader says 18%. Station air. Something is still running in this station. The PA system is not one of those things. You try it. Static. You try the crew channel. Static. You find a diving knife on the equipment rack and tell yourself it's precautionary. The airlock door to the rest of the station is open. The station is six thousand, eight hundred meters below the surface. The research team drilled a core sample from the trench floor four days ago. You were on the drill team. Something came up with the sample. You need to reach the submersible bay.",

    rooms: [
      { id: 'airlock',          name: 'Airlock A-7',       desc: 'Emergency lights. Outer door sealed. Water on the grating — not much. The equipment rack is half-stripped.' },
      { id: 'flooded_lab',      name: 'Research Laboratory', desc: 'Knee-deep black water. Specimen tanks line the walls — all intact except the largest. That one is empty.' },
      { id: 'pressure_corridor', name: 'Pressure Corridor C', desc: 'Forty meters of narrow corridor. A hairline crack runs the seam above you. The hull groans like a struck bell.' },
      { id: 'crew_quarters',    name: 'Crew Quarters',     desc: 'Six bunks, all slept in. A meal on the common table, half-eaten. Still fresh. Nobody here.' },
      { id: 'specimen_vault',   name: 'Specimen Vault',    desc: 'Containment field offline. The core sample case is open — latched from the inside. Scratches on the floor in a radial pattern.' },
      { id: 'submersible_bay',  name: 'Submersible Bay',   desc: 'The Nereid-2 sits in her cradle, pressurized and ready. The launch panel is live. Someone prepped her and never came back.' },
    ],

    connections: {
      airlock:           ['flooded_lab'],
      flooded_lab:       ['airlock', 'pressure_corridor', 'crew_quarters'],
      pressure_corridor: ['flooded_lab', 'specimen_vault'],
      crew_quarters:     ['flooded_lab', 'specimen_vault'],
      specimen_vault:    ['pressure_corridor', 'crew_quarters', 'submersible_bay'],
      submersible_bay:   ['specimen_vault'],
    },

    enemies: {
      flooded_lab: {
        name: 'Trench Crawler', hp: 22, ac: 12, damage: '1d6+1', toHit: 3, xp: 200, wis: 8,
      },
      pressure_corridor: {
        name: 'Deep Specimen', hp: 35, ac: 13, damage: '1d8+2', toHit: 4, xp: 450, wis: 10,
        onHitEffect: { condition: 'poisoned', ability: 'con', dc: 13 },
      },
      specimen_vault: {
        name: 'Alpha Specimen', hp: 68, ac: 14, damage: '2d6+3', toHit: 6, xp: 1100, wis: 12,
        onHitEffect: { condition: 'paralyzed', ability: 'str', dc: 15 },
      },
    },

    startingLoot: ['diving_knife'],

    loot: {
      airlock: {
        id: 'pressure_suit', name: 'Pressure Suit', desc: '+3 AC while equipped. Rated to 700 ATM.',
        weight: 10, type: 'armor', slot: 'armor', damage: null, ac_bonus: 3,
        heal: null, effect: null, aliases: ['suit', 'pressure suit'],
      },
      flooded_lab: {
        id: 'diving_knife', name: 'Diving Knife', desc: '1d4+1 damage. Standard-issue station equipment.',
        weight: 5, type: 'weapon', slot: null, damage: '1d4+1', ac_bonus: null,
        heal: null, effect: null, aliases: ['knife', 'diving knife', 'blade'],
      },
      pressure_corridor: {
        id: 'flare_pistol', name: 'Flare Pistol', desc: '1d6 damage, ranged.',
        weight: 4, type: 'weapon', slot: null, damage: '1d6', ac_bonus: null,
        heal: null, effect: null, aliases: ['flare', 'pistol', 'flare gun', 'flare pistol'],
        range: 'ranged',
      },
      crew_quarters: {
        id: 'oxygen_canister', name: 'Oxygen Canister', desc: 'Restores 2d4 HP. Emergency O2 supply.',
        weight: 6, type: 'consumable', slot: null, damage: null, ac_bonus: null,
        heal: '2d4', effect: null, aliases: ['oxygen', 'o2', 'canister', 'oxygen canister'],
      },
      specimen_vault: {
        id: 'research_notes', name: "Dr. Vasquez's Notes", desc: "Field notes. Answers more questions than you wanted.",
        weight: 1, type: 'misc', slot: null, damage: null, ac_bonus: null,
        heal: null, effect: null, aliases: ['notes', 'research notes', 'journal', 'vasquez'],
      },
    },
  },

  narratives: {
    roomArrival: {
      airlock: [
        "Emergency lights only. The outer door is sealed — pressure-rated, holding against the weight of six thousand meters of ocean. The inner door is open. Water on the grating. Not much. Not yet. Something black is smeared on the pressure gauge. You tell yourself it's grease.",
        "The airlock hisses with each micro-pressure fluctuation. Whatever happened here happened fast — the emergency kit is still sealed on the wall. Your O2 reader says 18%. Station air. Something is still running.",
      ],
      flooded_lab: [
        "Knee-deep water. Black, not blue — no light reaches this depth without help. The specimen tanks are intact except for one. The largest one. The containment water is still warm. That's wrong. This deep, it should be near-freezing. The warmth is coming from the far end of the room.",
        "The core sample log is open on the desk, pages soaked but legible. Last entry: six hours ago. Entry 847: initial contact. The rest is water-damaged. The tank that matters is empty.",
      ],
      pressure_corridor: [
        "Forty meters of corridor, two meters wide. The hull groans with a sound like a struck bell — deep, resonant, wrong. A hairline crack runs the seam above you. You check it. Not catastrophic. Not yet. The lights flicker in sequence down the corridor. Not a power issue. Something is walking past the sensor strips.",
        "The structural stress readings on the wall panel are all in yellow. One is trending toward red. You move quickly. The corridor groans again. Something at the far end stops moving when you do.",
      ],
      crew_quarters: [
        "Six bunks, all of them slept in. One meal on the common table, half-eaten, still fresh. A book left spine-up on a pillow. Headphones around a chair back. Six people lived here. You have not seen one person. A photo on Dr. Vasquez's locker: a dog, a yard, sunlight. One locker is sealed from the inside.",
        "Personal effects, undisturbed. Whoever left, left fast and didn't expect to be gone long. The emergency beacon is in the safety cabinet, still armed. Someone didn't take it. You take it.",
      ],
      specimen_vault: [
        "CAUTION: BIOHAZARD on every surface. The containment field is offline — field collapsed, the panel reads, at 14:32. The core sample case is open. Latched from the inside. Scratches radiate from it across the floor. Something unfolded itself. Oriented. Left. The research notes are scattered everywhere. You read three pages. You understand now why the crew is gone.",
        "SPECIMEN ZERO — RECOVERY DEPTH: 6,831m. The case it came up in is on the floor, open, empty. The smell in here is wrong — not rot, something older. Something that hasn't been near air in ten thousand years. You read Dr. Vasquez's notes. You wish you hadn't.",
      ],
      submersible_bay: [
        "The Nereid-2 is in her cradle, pressurized, fueled, ready. Launch panel: green. Ascent time: 47 minutes. Someone prepped her for launch and didn't make it here. The bay is quiet except for the hull and the thing you can hear moving somewhere behind the bulkhead. Ninety seconds to launch sequence. You move to the panel.",
        "NEREID-2. Capacity: 4. You are 1. The launch console is live — green across every indicator. Someone wanted this submersible ready. You are going to use it. The bulkhead behind you makes a sound. You do not look. You start the sequence.",
      ],
    },

    genericArrival: [
      "Pressure differential whistles through a failing seal nearby. The station breathes. You breathe with it.",
      "Something moves in the water. Then stops. Then: nothing. You move.",
      "Emergency lights, black water, the groan of steel under six thousand meters of ocean. This is the situation. You move.",
      "The station is not empty. You have known this since the lab. You move carefully.",
      "Your O2 reader ticks. The depth gauge does not. You are still here. You keep moving.",
    ],

    weaponVerbs: {
      diving_knife:  ['drive into', 'plunge into', 'drag across', 'tear at', 'slash at'],
      flare_pistol:  ['fire at', 'shoot', 'blast', 'discharge at', 'fire point-blank into'],
      unarmed:       ['strike', 'slam', 'drive your elbow into', 'punch', 'headbutt'],
    },

    classStyle: {
      Biologist: [
        'You note the morphology even as you fight it.',
        'Specimen behavior, recorded. Involuntarily.',
        'You understand exactly what it is. That does not make this easier.',
        'Taxonomy later. Survival now.',
      ],
      Diver: [
        'Six hundred dives. This one is different.',
        'Muscle memory. Stay calm. Control your breathing.',
        "You've faced pressure before. Not like this. Same principles.",
        'Steady. Steady.',
      ],
      Salvager: [
        "You've pulled things out of worse places than this. Debatable, but it helps to believe it.",
        'Hit first, identify later.',
        "No hesitation. That's the rule.",
        "You didn't come six thousand meters down to die to something wet.",
      ],
      Engineer: [
        'Structural weak point. Obvious once you see it.',
        'Force equals mass times acceleration. Applied.',
        'You identify the failure mode and exploit it.',
        'Systems thinking applies to everything, it turns out.',
      ],
      Medic: [
        'You know exactly how much damage a body can sustain. Yours and theirs.',
        'Controlled. Clinical. Effective.',
        'Neutralize the threat first. Treat wounds second. Standard triage.',
        "You've kept people alive in worse. This is just a different kind of worse.",
      ],
    },

    enemyReactions: {
      'Trench Crawler': [
        '"It moved like it has done this before. Not instinct — practice."',
        '"No eyes. It does not need them. It found you by something else entirely."',
        '"The bioluminescence pulses in a pattern. It is communicating. With something."',
      ],
      'Deep Specimen': [
        '"Larger than the crawler. More deliberate. It waited for you to move first."',
        '"The lateral line runs the full length of its body. It felt you breathing from across the room."',
        '"You recognize it from the research notes. The notes said: do not engage. The notes were correct."',
      ],
      'Alpha Specimen': [
        '"This is what came up with the core sample. This is why the crew is gone."',
        '"Seven appendages. No existing taxonomy covers this. You are the first researcher to observe it alive. You may be the last."',
        '"It is bigger than the containment field was rated for. Someone knew that. They drilled anyway."',
      ],
    },

    deathSaveStatus: {
      0: [
        'Think about the surface. Think about the surface.',
        'Ninety seconds to launch. Get up.',
        'Not here. Not this deep.',
      ],
      1: [
        'One more. The submersible is right there.',
        "You descended 6,800 meters to die on a grating. Get. Up.",
        'Close. You are very close.',
      ],
      2: [
        'The black is coming in at the edges.',
        'The O2 is not the problem yet. Get up before it becomes the problem.',
        'You can feel the pressure now. Through everything. Get up.',
      ],
    },

    combatHit: {
      healthy: [
        'Clean contact. The thing recoils.',
        'You connect. It registers — they feel it.',
        'Solid hit. It staggers, trailing something dark into the water.',
        'That one landed. It adjusts.',
      ],
      hurt: [
        'You hit through the pain. It costs you, but it connects.',
        'Adrenaline compensates for blood loss. For now.',
        "Slower than you'd like, but it lands.",
        "You're running low on everything, including restraint. The hit connects.",
      ],
      critical: [
        'Perfect strike. Whatever weak point you found — you found it.',
        "That's the spot. Everything you had, placed exactly right.",
        'Critical contact. The thing makes a sound you did not know it could make.',
        'You hit something vital. It shows.',
      ],
    },

    combatMiss: {
      healthy: [
        'It moves faster than it should be able to.',
        'Miss. The current shifts it just enough.',
        'You swing wide. Regroup.',
        "Nothing. It's reading you.",
      ],
      hurt: [
        'Your hands are shaking. The swing goes wide.',
        'Blood loss is affecting your aim. You miss.',
        'Too slow. Recalibrate.',
        "Miss. You can't afford many more of those.",
      ],
      critical: [
        'You stumble. Full miss. The water drags at your legs.',
        'Complete whiff. It watches you recover without moving.',
        'You nearly go down. The bulkhead catches you. Try again.',
        'Everything into the swing. None of it connects.',
      ],
    },

    enemyAttacks: [
      'It moves through the water with horrible, boneless efficiency.',
      'Multiple appendages reach simultaneously from different angles.',
      'It strikes without telegraphing — no wind-up, no warning.',
      'The bioluminescence pulses once. Then it surges.',
      'It flows around your guard like water around a rock.',
      'The lateral line finds you before the appendages do.',
    ],

    killShot: [
      'It goes still. It sinks.',
      'Down. The water takes it.',
      'Dark fluid blooms around it. Then nothing.',
      'The bioluminescence fades out. Done.',
      'Still. Finally still.',
      "It goes under. You watch until you're certain.",
    ],

    lootPickedUp: [
      'You take the {item}.',
      'The {item} goes into your kit.',
      'You secure the {item}.',
      'You grab the {item}.',
    ],

    noLoot: [
      'Nothing useful here.',
      'Already stripped, or never stocked.',
      'Nothing. Move on.',
      'Empty.',
    ],

    alreadyLooted: [
      'You already took everything from here.',
      'Nothing left.',
      'You cleared this one.',
    ],

    noEnemy: [
      "Clear. You don't trust it, but it's clear.",
      'Nothing moving. The water is still.',
      'Empty. Take the moment. Just a moment.',
      'No contact. Keep moving.',
    ],

    alreadyDead: [
      'You already handled that one.',
      "It's not getting up.",
      'Down and staying down.',
    ],

    sneakSuccess: [
      "You hold still in the dark. The {enemy} passes within arm's reach. Its lateral line never finds you.",
      'Slow. No sudden movement. The {enemy} orients elsewhere. You breathe again.',
      'You control your breathing to nothing. The {enemy} moves on.',
      'Still as a bulkhead. The {enemy} does not distinguish you from the station.',
    ],

    sneakFail: [
      'A ripple in the water. The {enemy}\'s bioluminescence pulses. It has you.',
      'You disturb the surface tension. The {enemy} turns instantly.',
      'Your boot catches the grating. The {enemy} orients on the sound.',
      'Something gives you away — vibration, displacement, heat. The {enemy} locks on.',
    ],

    deathLines: [
      'The station log will record one additional entry: casualty, unrecovered.',
      'The Nereid-2 launches on autopilot. Station protocol. You are not on it.',
      '6,800 meters is a long way down. It is a longer way to not come back up.',
      'Entry 848: contact lost with final researcher. No recovery attempt authorized at depth.',
      'The specimen will be waiting when the next team arrives. It has learned patience.',
    ],

    escapeLines: [
      "The Nereid-2 locks out of the cradle and begins ascent. The station falls away below you, dark against darker water. Something watches from the viewport as the depth increases. It does not follow. Not this time.",
      "Forty-seven minutes to surface. You sit with your back against the hull and your knees to your chest. You do not think about what you left down there. You don't.",
      '"Nereid-2, this is surface control — we\'ve lost contact with Erebus Station, please advise." You advise them. For a long time. The signal stays clear all the way up.',
      'The pressure gauge climbs. The depth gauge falls. You watch them both until the numbers mean something again. Surface. You made it to the surface.',
    ],

    enemyDeflected: [
      'The {armor} absorbs it.',
      'Hit on the {armor}. You feel it but you hold.',
      'The {armor} takes the blow.',
      'Your {armor} holds. Just.',
    ],

    levelUp:        "You're still here. Everything that didn't kill you just made you more dangerous at this depth.",
    noEscapeNearby: "The submersible bay isn't accessible from here. Find another route through the station.",
    escapeBlocked:  'is between you and the launch panel. Deal with it first.',
  },
};
