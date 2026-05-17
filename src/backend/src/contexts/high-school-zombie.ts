import type { Context } from '../types.js';

export const context: Context = {
  id:       'high-school-zombie',
  mapType:  'roguelike',
  worldNoun: 'school',
  startRoomId:  'gymnasium',
  escapeRoomId: 'rooftop',
  escapeTriggers: ['signal helicopter', 'evacuation helicopter', 'get to the roof', 'flare gun', 'get on helicopter', 'evacuate', 'climb to roof', 'rooftop'],
  escapeChoiceText: 'Signal the evacuation helicopter — GET TO THE ROOF',

  worldNames: [
    'Jefferson High', 'Lincoln High', 'Westview High',
    'Sunnydale High', 'Clearwater High', 'Roosevelt High',
  ],

  classPrimaryStats: {
    Jock:        'str',
    Nerd:        'int',
    Cheerleader: 'cha',
    Goth:        'dex',
    Teacher:     'wis',
  },

  classSkills: {
    Jock:        ['athletics', 'intimidation'],
    Nerd:        ['arcana', 'investigation'],
    Cheerleader: ['persuasion', 'deception'],
    Goth:        ['stealth', 'perception'],
    Teacher:     ['medicine', 'insight'],
  },

  enemyTemplates: [
    { name: 'Zombie Student',    cr: 0.25, hp:  13, ac:  8, damage: '1d4+1', toHit: 2, xp:   25, wis:  6 },
    { name: 'Zombie Jock',       cr:    1, hp:  26, ac: 10, damage: '1d8+3', toHit: 4, xp:  200, wis:  6 },
    { name: 'Zombie Teacher',    cr:    2, hp:  32, ac:  9, damage: '1d6+2', toHit: 3, xp:  450, wis: 10 },
    { name: 'Zombie Prom Queen', cr:    3, hp:  45, ac: 12, damage: '1d8+2', toHit: 4, xp:  700, dex: 14, wis: 12, onHitEffect: { condition: 'frightened', ability: 'wis', dc: 13 } },
    { name: 'Zombie Coach',      cr:    4, hp:  68, ac: 11, damage: '2d6+4', toHit: 6, xp: 1100, wis:  8 },
  ],

  introTexts: [
    "You wake up face-down on a desk in the gymnasium. The fluorescent lights are flickering. The PA system crackles to life: 'ATTENTION ALL REMAINING STUDENTS AND STAFF — THIS IS NOT A DRILL. MILITARY EVACUATION HELICOPTER INBOUND TO SCHOOL ROOFTOP. PROCEED IMMEDIATELY. DO NOT STOP. DO NOT HELP THE INFECTED.' Through the gym's high windows you can see the parking lot. It is full of things that used to be students. The helicopter is out there somewhere. The rooftop is six classrooms and a lifetime away.",
    "You don't remember falling asleep. You do remember the smell — hand sanitizer and something wrong underneath it. The PA shrieks: 'SURVIVORS — MILITARY ASSET BRAVO-7 WILL HOLD POSITION ON ROOFTOP FOR ELEVEN MINUTES. ELEVEN MINUTES ONLY. THAT IS ALL.' You check your phone. No signal. The clock on the wall says 2:47 PM. You were supposed to have a calc test today. Priorities have shifted.",
    "Something cold is on your cheek. You sit up. It's Gatorade from an overturned bottle — best news you've had today. The PA crackles: 'LISTEN CAREFULLY. ROOFTOP. HELICOPTER. NOW. THEY WILL NOT WAIT.' Outside the gymnasium door, something drags its feet across the linoleum. You know that sound. You know who it was. You grab the nearest thing that could be a weapon and remind yourself: they're not people anymore. They're not.",
  ],

  roomPool: [
    { id: 'gymnasium',         name: 'Gymnasium',          descs: ['The bleachers are knocked over. Coach Martinez\'s whistle hangs from something that is no longer Coach Martinez.', 'Basketball hoops intact. The basketball is not. You don\'t want to know what did that.'] },
    { id: 'cafeteria',         name: 'Cafeteria',           descs: ['Today\'s special: mystery meat. And also zombies. The lunch lady in the hairnet has a real commitment to dress code.', 'The sneeze guard is doing exactly nothing. The zombie behind the counter proves every cafeteria rumor you ever heard.'] },
    { id: 'library',           name: 'Library',             descs: ['Emergency lights only. "Quiet please" says the sign. The zombies are not honoring this request.', 'Mrs. Peterson\'s cardigan is on the floor. Mrs. Peterson is not far behind it. She\'s checking out books she has no business touching.'] },
    { id: 'science_lab',       name: 'Science Lab',         descs: ['Bunsen burners still glowing. Someone left in a hurry. A zombie in safety goggles shambles toward you — points for lab safety compliance.', 'Formaldehyde and something worse. The periodic table stares down at you. Zn. Zombie. Not actually on there. You check. You have time — they\'re slow.'] },
    { id: 'english_classroom', name: 'English Classroom',   descs: ['A zombie is still sitting at a desk, test paper in front of it. You check the grade. C+. Honestly not bad for undead.', '"SYMBOLISM IN LORD OF THE FLIES" is still on the whiteboard. A zombie shambles past it. You get it now. You finally get it.'] },
    { id: 'math_classroom',    name: 'Math Classroom',      descs: ['Quadratic equations on the projector. You couldn\'t solve them before. The zombie at the board has written the wrong answer. It was always wrong.', 'Math textbooks everywhere. You grab one. It\'s heavy. That\'s going to matter in about ten seconds.'] },
    { id: 'hallway',           name: 'Main Hallway',        descs: ['Lockers line both walls. Most are open. One is banging. You do not open that one. A sneaker lies in the middle of the floor. Just one.', 'The trophy case is intact — ALL-STATE CHAMPIONS 2019. The zombie pressed against the glass might have been in that photo. Hard to tell now.'] },
    { id: 'bathroom',          name: 'Bathroom',            descs: ['Someone wrote "HELP" on the mirror in lipstick. Below it, in permanent marker: "lol same". The stall doors are all open except one.', 'Smells like industrial soap and terror. The drain is making a sound. You tell yourself it\'s just the pipes. You know it\'s not just the pipes.'] },
    { id: 'locker_room',       name: 'Locker Room',         descs: ['Smells exactly like it always did. Worse, somehow. A zombie in a towel shuffles toward you. Dignity is the first casualty.', 'Athletic equipment everywhere. The emergency shower is running. Has been for a while. The zombie under it doesn\'t seem to mind.'] },
    { id: 'principal_office',  name: 'Principal\'s Office', descs: ['Vice Principal Donnelly\'s mug says "World\'s Okayest Administrator." His zombie form is not improving on that legacy.', 'Framed honor roll photos on the wall. One of the distinguished alumni is currently shuffling toward you, teeth first.'] },
    { id: 'auditorium',        name: 'Auditorium',          descs: ['Stage lights on. Red velvet curtains half-open. A lone zombie sits in row C, seat 7. Front row for the apocalypse. Bold choice.', '"GREASE — SPRING PRODUCTION" on the banner. A zombie in a poodle skirt proves lightning can strike twice.'] },
    { id: 'rooftop',           name: 'Rooftop',             descs: ['Grey sky and smoke, but there it is — a military helicopter banking toward the building. A soldier in tactical gear is pointing at you. You made it.', 'The HVAC units hum against the silence. Rotors in the distance, getting louder. A flare gun sits on a ventilation unit — someone left it for you.'] },
  ],

  lootTable: [
    { id: 'baseball_bat',      name: 'Baseball Bat',      desc: 'Aluminum. Good weight. Has seen one previous apocalypse.',                                 weight: 15, type: 'weapon',     slot: null,      damage: '1d6+2', ac_bonus: null, heal: null, effect: null, aliases: ['bat', 'baseball bat'] },
    { id: 'fire_extinguisher', name: 'Fire Extinguisher', desc: 'Blinding spray, then a very satisfying clunk.',                                           weight: 10, type: 'weapon',     slot: null,      damage: '1d8',   ac_bonus: null, heal: null, effect: null, aliases: ['extinguisher', 'fire extinguisher'], range: 'ranged' },
    { id: 'textbook',          name: 'Heavy Textbook',    desc: 'Pre-Calculus, 4th edition. 900 pages. Finally useful.',                                    weight: 12, type: 'weapon',     slot: null,      damage: '1d4',   ac_bonus: null, heal: null, effect: null, aliases: ['book', 'textbook', 'pre-calc'] },
    { id: 'cafeteria_tray',   name: 'Cafeteria Tray',    desc: '+2 AC while equipped. Industrial plastic. Surprisingly robust.',                            weight:  8, type: 'armor',      slot: 'shield',  damage: null,    ac_bonus: 2,    heal: null, effect: null, aliases: ['tray', 'cafeteria tray'] },
    { id: 'lab_coat',          name: 'Lab Coat',          desc: 'Heavy cotton. Not zombie-proof. But you feel more protected. Placebo? Sure.',               weight:  5, type: 'armor',      slot: 'armor',   damage: null,    ac_bonus: 1,    heal: null, effect: null, aliases: ['coat', 'lab coat'] },
    { id: 'letterman_jacket',  name: 'Letterman Jacket',  desc: 'Thick leather sleeves. Jefferson High, 2022. The owner is probably around here somewhere.', weight:  6, type: 'armor',      slot: 'armor',   damage: null,    ac_bonus: 2,    heal: null, effect: null, aliases: ['jacket', 'letterman', 'letterman jacket'] },
    { id: 'energy_drink',      name: 'Energy Drink',      desc: 'Questionable ingredients. Unquestionable desperation.',                                     weight:  2, type: 'consumable', slot: null,      damage: null,    ac_bonus: null, heal: '1d4', effect: null, aliases: ['drink', 'energy drink', 'red bull'] },
    { id: 'first_aid_kit',     name: 'First Aid Kit',     desc: 'From the nurse\'s office. Gauze, antiseptic, bandages. The good stuff.',                   weight:  4, type: 'consumable', slot: null,      damage: null,    ac_bonus: null, heal: '2d4', effect: null, aliases: ['first aid', 'kit', 'first aid kit', 'medkit'] },
    { id: 'chemistry_bomb',    name: 'Chemistry Bomb',    desc: 'A beaker of something volatile someone mixed before things went sideways. Use with hope.',  weight:  3, type: 'consumable', slot: null,      damage: null,    ac_bonus: null, heal: null,  effect: 'mystery', aliases: ['bomb', 'chemistry bomb', 'beaker'] },
    { id: 'hall_pass',         name: 'Hall Pass',         desc: 'Laminated. Mrs. Henderson\'s name on it. She\'s probably not going to need it back.',       weight:  1, type: 'misc',       slot: null,      damage: null,    ac_bonus: null, heal: null,  effect: null, aliases: ['hall pass', 'pass'] },
  ],

  narratives: {
    roomArrival: {
      gymnasium: [
        "The bleachers are knocked over. The PA crackles overhead: 'ROOFTOP. HELICOPTER. NOW.' Coach Martinez's whistle dangles from something that used to be Coach Martinez.",
        "You wake up on the gym floor. It smells like rubber and dread. The basketball scoreboard still reads HOME 47 — VISITORS 12. Nobody won.",
      ],
      cafeteria: [
        "The lunch line is still set up. Today's special is not on the menu you remember. A zombie in a hairnet shuffles behind the sneeze guard. You respect the commitment to hygiene.",
        "Chairs overturned, trays on the floor, Jell-O somehow untouched. The cafeteria smells like industrial cleaner and something it cannot clean.",
      ],
      library: [
        'Emergency lights paint everything amber. "Quiet please" says the laminated sign by the door. The zombies are not honoring this request.',
        "The returned books cart is overturned. Mrs. Peterson's reading glasses are on the floor in two pieces. You don't look for Mrs. Peterson.",
      ],
      science_lab: [
        'Bunsen burners still going. Someone left mid-experiment. A zombie in safety goggles and a splattered apron shuffles toward you. Procedural compliance to the last.',
        'The anatomy model is knocked over. The zombie near the supply cabinet is wearing the same blank expression the model had. You appreciate the symmetry.',
      ],
      english_classroom: [
        'Desks overturned — except one, where a zombie sits upright, a graded essay in front of it. B-minus. That tracks.',
        '"Lord of the Flies" is still written on the whiteboard, underlined twice. A zombie drags itself toward you beneath it. The symbolism is not subtle.',
      ],
      math_classroom: [
        'The projector is still running. Slide 14: quadratic formula. The zombie at the board has written something in chalk. The answer is wrong. It was always wrong.',
        'Textbooks everywhere — open, spine-up, splayed across every surface. You grab the heaviest one. Four hundred pages of pre-calc, finally earning its keep.',
      ],
      hallway: [
        'Lockers line both walls. Most hang open. One bangs rhythmically from the inside. You do not open that one. A single sneaker sits in the middle of the corridor.',
        'The trophy case is intact. ALL-STATE CHAMPIONS, 2019. The zombie pressed against the glass might have been in that photo. Impossible to tell now.',
      ],
      bathroom: [
        '"HELP" in lipstick on the mirror. Below it, in permanent marker: "lol same". Every stall is open except the last one. You move quickly.',
        'Industrial soap smell and something else. The fluorescent light buzzes and flickers. The drain makes a sound. You tell yourself it is the pipes. You move on.',
      ],
      locker_room: [
        'Smells exactly like it always did, and then worse. A zombie in a towel shuffles out of a changing stall. Some indignities survive everything.',
        'Equipment everywhere: cleats, pads, a lacrosse stick still in its netting. The emergency shower is running. Has been for a while. The zombie under it does not notice.',
      ],
      principal_office: [
        'The plaques are still straight on the wall. Vice Principal Donnelly\'s mug says "World\'s Okayest Administrator." His current form is not improving on that review.',
        'Honor roll photos framed along the wall. One of the faces is very familiar. It\'s currently coming through the door, jaw working, eyes blank.',
      ],
      auditorium: [
        'Stage lights still burning. A lone zombie sits in row C, seat 7. Front-row for the end of the world. Bold choice.',
        'The spring production banner reads "GREASE — COMING SOON." A zombie in a poodle skirt proves that timing is everything.',
      ],
      rooftop: [
        'You burst through the roof-access door. Smoke on the horizon. Then you hear it — rotors. Getting louder. A soldier in the helicopter door points at you and yells something. You start running.',
        'The HVAC units hum in the grey afternoon. A flare gun sits on the nearest vent — someone left it for exactly this moment. You grab it. You fire it. The helicopter banks hard toward the school.',
      ],
    },

    genericArrival: [
      "You push through the door. The hall monitor is conspicuously absent. A zombie near the far window is conspicuously not.",
      "Emergency lights. A fire alarm going off somewhere that nobody is responding to. Something drags its feet just out of sight.",
      "You check both ways before moving. Old habit. The zombie coming from the left doesn't share your caution.",
      "Quieter than the last room. That either means it's clear or it means something is waiting. You move carefully either way.",
      "The PA crackles: 'ROOFTOP. NOW. DO NOT STOP FOR ANYTHING.' You don't stop.",
    ],

    weaponVerbs: {
      baseball_bat:      ['swing at', 'crack across', 'club', 'bat at', 'crack over the head of'],
      fire_extinguisher: ['blast', 'spray at', 'slam into', 'discharge at', 'empty into the face of'],
      textbook:          ['hurl at', 'fling at', 'chuck at', 'throw at', 'bean'],
      unarmed:           ['punch', 'kick', 'shove', 'headbutt', 'elbow'],
    },

    classStyle: {
      Jock: [
        'Years of varsity drills kick in.',
        'Game time. No refs. No rules. No mercy.',
        'Coach always said: hit first, hit hard. Coach is a zombie now, but the lesson stands.',
        'You don\'t think. You react. That\'s what practice is for.',
      ],
      Nerd: [
        'You calculate the optimal strike angle in under a second.',
        'Statistically, this is your highest-probability option.',
        'You\'ve mentally simulated this exact scenario seventeen times.',
        'Biomechanically speaking, this is where the skull is thinnest.',
      ],
      Cheerleader: [
        'Spirit fingers, then this.',
        'You bring the same energy to this that you brought to regionals.',
        'Five, six, seven, eight — and destroy.',
        'You smile. It confuses the zombie just long enough.',
      ],
      Goth: [
        'You were ready for this. Emotionally, at least.',
        'The end of days. Finally.',
        'You\'ve been mentally rehearsing this since ninth grade.',
        'Bleak. Efficient. You don\'t need to enjoy it.',
      ],
      Teacher: [
        'Thirty years of classroom management prepared you for exactly nothing and somehow everything.',
        'You use your teacher voice. It works on the living. Less so on the undead.',
        'You grade their approach as you counter it. F. Solid F.',
        'You\'ve had worse Mondays.',
      ],
    },

    enemyReactions: {
      'Zombie Student': [
        '"That\'s Tyler from homeroom. Was Tyler. Still has his backpack on. The homework is due never."',
        '"The limited-edition sneakers. Someone waited in line for those. What a waste."',
        '"You recognize the hoodie. You borrowed it once sophomore year. Small world."',
      ],
      'Zombie Jock': [
        '"That\'s Big Mike. Was Big Mike. Still wearing the varsity jacket. Some things survive everything."',
        '"It still has the football grip. Muscle memory is a real and terrifying thing."',
        '"Letterman jacket. Three sport athlete. Now one sport. Technically."',
      ],
      'Zombie Teacher': [
        '"Mr. Harmon. You failed his class once. He is about to return the favor."',
        '"Mrs. Chen. You actually liked her. That\'s going to make this harder."',
        '"Still has the red pen. Of course it still has the red pen."',
      ],
      'Zombie Prom Queen': [
        '"Cindy. You used to have a crush on her. Now you have to crush her head."',
        '"The crown is still on. Tiara\'s tilted at a wrong angle now. The metaphor writes itself."',
        '"Homecoming Queen, 2023. The sash is ruined. The crown is indestructible, apparently."',
      ],
      'Zombie Coach': [
        '"COACH HENDERSON. HE MADE YOU RUN LAPS FOR BEING THREE SECONDS LATE. THAT ENERGY IS FULLY REDIRECTED NOW."',
        '"Still built like a truck. Runs like one. Directly at you."',
        '"The whistle is still around his neck. It goes off every time he moves. Every step. Like a warning. Like a nightmare."',
      ],
    },

    deathSaveStatus: {
      0: [
        "You're not ready to be a hall monitor for hell.",
        'The helicopter is still up there. Get. Up.',
        'One more. Just one more.',
      ],
      1: [
        "C'mon. You've failed pop quizzes worse than this.",
        'Your attendance record is too good for this.',
        'Not today. Not in gym class.',
      ],
      2: [
        'The edges are going dark. You\'ve seen worse Mondays. Barely.',
        'Keep it together. The roof is right there.',
        'You are absolutely failing this class and also possibly dying.',
      ],
    },

    combatHit: {
      healthy: [
        'Clean hit. It staggers.',
        'Right on target — dead center, pun absolutely intended.',
        'You connect solid. It lurches back.',
        'Exactly where you aimed. Good.',
      ],
      hurt: [
        'You find the opening. It lands.',
        'Desperation sharpens your aim. You connect.',
        'It hurts to swing but you land it anyway.',
        'Through the pain — contact.',
      ],
      critical: [
        'Perfect strike. Everything connects at once.',
        'You catch it exactly right — a hit that\'d stop anyone.',
        'That one mattered. You feel it.',
        'That\'s the one. Clean through.',
      ],
    },

    combatMiss: {
      healthy: [
        'It shuffles sideways. If that counts as dodging, it counts.',
        'You miss clean. Regroup.',
        'Wide. Too wide. You pull back.',
        'Off. The thing doesn\'t even notice.',
      ],
      hurt: [
        'Your hands are shaking. It shows in the swing.',
        'Pain throws your aim. You miss.',
        'Not your best. You know it. Keep going.',
        'The swing goes wide. Blood loss is not helping.',
      ],
      critical: [
        'Full swing, full miss. The momentum nearly takes you down.',
        'You stumble. You miss. You are very much not okay.',
        'Complete whiff. The zombie seems almost offended.',
        'You nearly fall. Catch yourself. Try again.',
      ],
    },

    enemyAttacks: [
      'It lunges with a wet, guttural moan.',
      'Hands outstretched, it surges forward with horrible purpose.',
      'It bites at the air between you, getting closer.',
      'A clumsy but completely committed charge.',
      'It swings both arms in a wild, sweeping arc.',
      'Shambling fast now — faster than it should be able to.',
    ],

    killShot: [
      'It drops. Finally.',
      'Down. You breathe. Try not to think about who it was.',
      'It stops moving. You don\'t.',
      'One less. Keep moving. The roof is still up there.',
      'It goes down and stays down. That\'s all you needed.',
      'Done. You look away before you can recognize the face.',
    ],

    lootPickedUp: [
      'You grab the {item}.',
      'You snatch the {item} off the floor.',
      'The {item} goes into your bag.',
      'You pocket the {item}. Could matter later.',
    ],

    noLoot: [
      'Nothing useful here.',
      'Already picked clean.',
      'Empty. Someone got here first.',
      'Nothing. Move on.',
    ],

    alreadyLooted: [
      'You already grabbed everything worth grabbing.',
      'Nothing left here.',
      'Cleaned it out already.',
    ],

    noEnemy: [
      'Clear. Too quiet, but clear.',
      'Nobody here. Nobody living. Nobody dead, either. For now.',
      'Nothing moving. Keep going.',
      'Empty. Take the second to breathe.',
    ],

    alreadyDead: [
      'Already put it down.',
      'You already handled that one.',
      'It\'s not getting back up.',
    ],

    sneakSuccess: [
      'You slip past the {enemy}. It keeps shuffling. It never knew.',
      'You hold your breath and slide by. The {enemy} turns the wrong way.',
      'Clear. The {enemy} never had you.',
      'You move like you\'re late for class. Silent. Purposeful. Gone.',
    ],

    sneakFail: [
      'Your sneaker squeaks on the linoleum. The {enemy} turns.',
      'You knock something off a desk. The {enemy} locks on immediately.',
      'Too much noise. The {enemy} found you.',
      'It hears you. Or smells you. Either way — it\'s coming.',
    ],

    deathLines: [
      "They'll find your locker. They'll clean it out. They'll wonder about the granola bars.",
      'Your GPA was not going to matter. Now nothing is going to matter.',
      'The helicopter waited. Not long enough.',
      'You were so close to the roof. The helicopter was right there.',
      'You failed to escape Jefferson High. Just like every other morning.',
    ],

    escapeLines: [
      'The helicopter lifts off. The school shrinks below you. You don\'t look back. You absolutely do not look back.',
      '"Name?" the soldier asks over the rotors. You tell them. They write it on a list. You made the list.',
      'Wind in your face. Rotors loud. Jefferson High getting smaller. You survived detention. You survived gym class. You survived everything.',
      'The pilot says something into her headset. "Survivor confirmed. One." Just one. But you\'re on it.',
    ],

    enemyDeflected: [
      'The {armor} takes it.',
      'Your {armor} absorbs the hit. Barely.',
      'It lands on the {armor}. You feel it but you\'re okay.',
      'Block. The {armor} holds.',
    ],

    levelUp:       'Something shifts. Sharper. Faster. Surviving does that to you.',
    noEscapeNearby: 'The rooftop isn\'t accessible from here. You need to find the right way up.',
    escapeBlocked:  'There\'s still a zombie between you and the roof access. Deal with it first.',
  },
};
