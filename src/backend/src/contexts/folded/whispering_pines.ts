// Whispering Pines — a frozen mountain pass campaign.
//
// Authored as the second campaign module to validate the campaign authoring
// format is general-purpose (not tailored to Vale of Shadows). Themes that
// exercise rules we already implemented but Vale doesn't lean on hard:
//   - cold-damage enemies + fire-vulnerable mages (resist/vuln ordering)
//   - a wilderness encounter table with non-Vale enemies
//   - a kidnapping plot rather than crypt/heist (different quest condition shapes)
//   - a boss with paralyzing onHitEffect to exercise the SRD auto-fail STR/DEX
//     saves we added in the audit pass.

import {
  SRD_CLASS_ARMOR_PROFICIENCIES,
  SRD_CLASS_FEATURES,
  SRD_CLASS_HIT_DIE,
  SRD_CLASS_PRIMARY_STATS,
  SRD_CLASS_SAVING_THROWS,
  SRD_CLASS_SKILLS,
  SRD_CLASS_SKILL_CHOICES,
  SRD_CLASS_STARTING_EQUIPMENT,
  SRD_CLASS_WEAPON_PROFICIENCIES,
  SRD_FEATS,
  SRD_MONSTERS,
  SRD_SPELLCASTING_ABILITY,
  SRD_SPELLS,
  srdBackgrounds,
  srdItems,
} from '../srd/index.js';
import type { Context } from '../../types.js';

export const whisperingPinesContent: Context = {
  id: 'whispering_pines',
  displayNoun: 'pass',

  // ─── Classes (shared with Vale; copied to keep contexts self-contained) ──────

  classPrimaryStats: { ...SRD_CLASS_PRIMARY_STATS },

  classHitDie: { ...SRD_CLASS_HIT_DIE },

  classSkills: { ...SRD_CLASS_SKILLS },
  classSkillChoices: { ...SRD_CLASS_SKILL_CHOICES },

  classArmorProficiencies: { ...SRD_CLASS_ARMOR_PROFICIENCIES },

  classWeaponProficiencies: { ...SRD_CLASS_WEAPON_PROFICIENCIES },

  classSavingThrows: { ...SRD_CLASS_SAVING_THROWS },

  classFeatures: { ...SRD_CLASS_FEATURES },

  classStartingEquipment: { ...SRD_CLASS_STARTING_EQUIPMENT },
  classStartingLoot: {
    Fighter: ['longsword', 'chain_mail', 'shield'],
    Rogue: ['shortsword', 'leather_armor'],
    Wizard: ['quarterstaff', 'component_pouch'],
    Cleric: ['mace', 'scale_mail', 'shield', 'holy_symbol'],
    Ranger: ['shortsword', 'longbow', 'leather_armor'],
    Paladin: ['longsword', 'chain_mail', 'shield'],
    Bard: ['rapier', 'leather_armor'],
    Druid: ['quarterstaff', 'leather_armor', 'elixir_of_warmth'],
    Sorcerer: ['dagger', 'component_pouch', 'elixir_of_warmth'],
    Warlock: ['dagger', 'leather_armor', 'elixir_of_warmth'],
    Monk: ['shortsword', 'dart'],
    Barbarian: ['greataxe', 'handaxe', 'fur_cloak'],
  },

  spellcastingAbility: { ...SRD_SPELLCASTING_ABILITY },

  // ─── Backgrounds ──────────────────────────────────────────────────────────────

  backgrounds: srdBackgrounds({
    soldier: {
      desc: 'You served with the Pine Wardens or another mountain garrison.',
      featureDesc: 'Wardens and ex-soldiers recognise your authority.',
    },
    criminal: {
      desc: 'You have a history of breaking the law — smuggling, perhaps, in the high passes.',
      featureDesc: 'A reliable contact across the snow line handles rumour and fenced goods.',
    },
    sage: {
      desc: 'You spent years studying lore — particularly cold-weather magic and ancient cults.',
      featureDesc: 'If you do not know information, you know where to find it.',
    },
    acolyte: {
      desc: 'You once served at a Selûnite shrine before taking up the pass road.',
      featureDesc: 'You and your companions receive healing and care at temples.',
    },
  }),

  // ─── Enemy templates ──────────────────────────────────────────────────────────

  enemyTemplates: [
    // SRD wolf with a cold-resist coat.
    { ...SRD_MONSTERS.wolf, name: 'Frost Wolf', resistances: ['cold'] },
    // Pure SRD ice mephit.
    SRD_MONSTERS.ice_mephit,
    // SRD bandit with cold resist + slightly tougher kit. Higher AC + dmg
    // than the baseline bandit reflects the harsher pass — they're better
    // armed than a Lantern District ruffian.
    {
      ...SRD_MONSTERS.bandit,
      name: 'Snowshrouded Bandit',
      cr: 0.25,
      hp: 11,
      ac: 13,
      damage: '1d6+2',
      toHit: 4,
      xp: 50,
      str: 13,
      dex: 13,
      resistances: ['cold'],
    },
    {
      name: 'Frost Cultist',
      cr: 0.5,
      hp: 17,
      ac: 12,
      damage: '1d8+1',
      toHit: 3,
      xp: 100,
      str: 11,
      dex: 12,
      con: 12,
      int: 10,
      wis: 13,
      cha: 11,
      resistances: ['cold'],
      damageType: 'cold',
    },
    {
      name: 'Frost Acolyte',
      // Boss — an Ice Mage. Vulnerable to fire to reward Burning Hands /
      // Fire Bolt parties; multiattack of 2; paralyzing onHitEffect leans on
      // the SRD STR/DEX auto-fail rule from §9.2.
      cr: 4,
      hp: 78,
      ac: 15,
      damage: '2d6+3',
      toHit: 6,
      xp: 1100,
      str: 12,
      dex: 14,
      con: 16,
      int: 17,
      wis: 14,
      cha: 13,
      multiattack: 2,
      resistances: ['cold'],
      immunities: ['poison'],
      vulnerabilities: ['fire'],
      condition_immunities: ['frightened', 'paralyzed'],
      onHitEffect: { condition: 'paralyzed', ability: 'con', dc: 13 },
      damageType: 'cold',
      // Spell-caster — the Acolyte sometimes hurls fire_bolt instead of
      // melee, opening a Counterspell window for any L5+ caster in the party.
      spells: ['fire_bolt'],
      castChance: 0.4,
      spellAttackBonus: 5,
      spellSaveDC: 13,
      // Two-phase fight. At 60% the Acolyte buys time with an ice-armor +
      // ramped damage. At 30% it strips its frost cloak and casts more
      // aggressively — castChance can't be raised through effects, but the
      // damage spike compensates.
      phases: [
        {
          hpPct: 60,
          name: 'Ice Armor',
          narrative:
            'The Acolyte hisses a hard syllable and frost rimes their robes — blows skid off. Around them the ritual flame burns colder.',
          effects: [
            { kind: 'set_ac', value: 17 },
            { kind: 'set_damage', dice: '2d8+3' },
          ],
        },
        {
          hpPct: 30,
          name: 'Frostbinding',
          narrative:
            'The Acolyte tears off their frost cloak. Black ice spreads beneath their feet. Their staff lashes with bone-cold speed.',
          effects: [
            { kind: 'set_to_hit', value: 8 },
            { kind: 'set_multiattack', value: 3 },
            {
              kind: 'set_on_hit_effect',
              effect: { condition: 'paralyzed', ability: 'con', dc: 15 },
            },
          ],
        },
      ],
    },
  ],

  // ─── Loot table ───────────────────────────────────────────────────────────────
  // Most items are shared with Vale's vocabulary. New items: warhammer, fur
  // cloak, elixir of warmth, halden_locket, cult_idol.

  lootTable: [
    // Shared SRD equipment available in this campaign.
    ...srdItems(
      'dagger',
      'dart',
      'handaxe',
      'greataxe',
      'longsword',
      'shortsword',
      'rapier',
      'mace',
      'warhammer',
      'quarterstaff',
      'longbow',
      'leather_armor',
      'scale_mail',
      'chain_mail',
      'shield',
      'healing_potion',
      'holy_symbol',
      'component_pouch'
    ),
    // Campaign-specific items.
    {
      id: 'fur_cloak',
      name: 'Fur Cloak',
      weight: 3,
      desc: 'A thick bearskin cloak — warm enough to ride the pass at night.',
      type: 'misc',
      slot: null,
      damage: null,
      ac_bonus: null,
      heal: null,
      effect: 'cold_warmth',
      aliases: ['cloak', 'pelt'],
    },
    {
      id: 'elixir_of_warmth',
      name: 'Elixir of Warmth',
      weight: 1,
      desc: 'A clay vial of mulled spirits brewed by the trappers. Restores 1d4+2 HP and steadies the body against cold.',
      type: 'consumable',
      slot: null,
      damage: null,
      ac_bonus: null,
      heal: '1d4+2',
      effect: null,
      aliases: ['elixir', 'mulled spirit'],
    },
    {
      id: 'halden_locket',
      name: "Halden's Locket",
      weight: 1,
      desc: "A trapper's silver locket — proof Old Halden was here. His daughter's portrait inside.",
      type: 'misc',
      slot: null,
      damage: null,
      ac_bonus: null,
      heal: null,
      effect: null,
      aliases: ['locket', "halden's locket"],
    },
    {
      id: 'cult_idol',
      name: 'Frostspire Idol',
      weight: 4,
      desc: "A black ironwood idol carved with the cult's rune. Captain Riese will want to see this.",
      type: 'misc',
      slot: null,
      damage: null,
      ac_bonus: null,
      heal: null,
      effect: null,
      aliases: ['idol', 'rune', 'cult idol'],
    },
  ],

  // ─── Narratives ───────────────────────────────────────────────────────────────

  narratives: {
    roomArrival: {
      pass_climb: [
        'The trail switches back along the cliff face. Wind cuts through every gap in your cloak.',
        'Hoarfrost glitters on the boulders. The pass narrows ahead.',
      ],
      spire_entrance: [
        'A black stone arch leans against the cliff — the entrance to Iceshard Spire. Frost rimes the lintel even in shelter.',
        'Wind moans through the spire arch. Inside, the air goes still and far colder.',
      ],
      spire_egress: [
        'Sunlight cuts the cliff face. The descent to Whispering Pines opens below you.',
      ],
    },
    genericArrival: [
      'Your breath fogs in the cold.',
      'Frost crunches beneath your boots.',
      'A wind hisses through the dark.',
      'Something glitters at the edge of your torchlight.',
    ],
    weaponVerbs: {
      longsword: ['cleaves', 'slashes', 'cuts'],
      shortsword: ['thrusts', 'stabs', 'jabs'],
      rapier: ['pierces', 'lunges', 'skewers'],
      mace: ['smashes', 'bludgeons', 'cracks'],
      warhammer: ['hammers', 'crushes', 'shatters'],
      quarterstaff: ['strikes', 'sweeps', 'clubs'],
      longbow: ['pins', 'skewers', 'pierces'],
      unarmed: ['punches', 'strikes', 'slams'],
    },
    classStyle: {
      Fighter: ['with disciplined precision', 'using superior technique'],
      Rogue: ['from the shadows', 'finding the weak point'],
      Wizard: ['channeling arcane energy through the strike', 'with focused concentration'],
      Cleric: ['invoking divine strength', 'guided by faith'],
      Ranger: ["with ranger's instinct", "reading the enemy's stance"],
      Paladin: ['with holy conviction', 'driven by sacred oath'],
      Bard: ['with unexpected flair', "using the enemy's own momentum"],
    },
    enemyReactions: {
      'Frost Wolf': [
        'It yelps and circles wider.',
        'Frozen blood drips into the snow.',
        'It bares its teeth, undaunted.',
      ],
      'Ice Mephit': [
        'It shrieks — shards of ice splinter from its frame.',
        'Steam hisses from the wound.',
        'It chuckles, a tinkling laugh of cracking ice.',
      ],
      'Snowshrouded Bandit': [
        'It curses through frozen lips.',
        'Blood freezes on its leathers.',
        'It stumbles back into the drift.',
      ],
      'Frost Cultist': [
        'It chants louder, unfazed.',
        'A rune flares on its forehead.',
        'It bares teeth blue with ritual paint.',
      ],
      'Frost Acolyte': [
        'I HAVE WALKED THE COLD ABOVE THE STARS, the Acolyte hisses.',
        'Its breath crystallises in the air between you.',
        'The runes on its robe burn bluer.',
      ],
    },
    deathSaveStatus: {
      1: ['Cold creeps into your fingers.', 'Your vision narrows to a tunnel.'],
      2: ['The snow looks warm now.', 'You feel yourself sinking.'],
      3: ['No more breath to give.'],
    },
    combatHit: {
      healthy: [
        'Your strike lands cleanly on {enemy}.',
        '{enemy} reels from the impact.',
        'A solid blow connects with {enemy}.',
      ],
      hurt: [
        'Despite the cold in your hands, you connect with {enemy}.',
        'You drive the strike home through gritted teeth — {enemy} staggers.',
      ],
      critical: [
        'Almost finished, you still find one good hit on {enemy}.',
        'By sheer will, your weapon meets {enemy}.',
      ],
    },
    combatMiss: {
      healthy: [
        "Your strike glances off {enemy}'s guard.",
        '{enemy} sidesteps neatly.',
        'Your blow goes wide.',
      ],
      hurt: ['Pain throws off your aim — {enemy} avoids it.'],
      critical: ['You can barely lift your weapon — the attack fails entirely.'],
    },
    enemyAttacks: ['{enemy} lunges at you!', 'The {enemy} strikes!', '{enemy} presses the attack!'],
    killShot: [
      '{enemy} drops into the snow, still.',
      '{enemy} falls — the cold takes the rest.',
      'With a final blow, {enemy} is destroyed.',
    ],
    lootPickedUp: ['You pocket the {item}.', 'The {item} joins your pack.', 'You take the {item}.'],
    noLoot: ['Nothing of value here.', 'Picked clean already.'],
    alreadyLooted: ['You have already taken what was here.'],
    noEnemy: ['No enemy here.', 'The way is clear.'],
    alreadyDead: ['That foe is already defeated.'],
    sneakSuccess: ['You slip past, silent as falling snow.', 'The wind covers your footfalls.'],
    deathLines: ['{name} sinks into the drift, fading...', '{name} falls — the cold takes them.'],
    enemyDeflected: [
      "{enemy}'s strike skids off your guard.",
      '{enemy} swings but finds no opening.',
    ],
    levelUp: [
      'The cold tempered you — you are level {level} now.',
      'Hard-won experience crystallises — level {level}!',
    ],
    combatStart: [
      '{enemy} bars your path — initiative is drawn!',
      'Combat begins — {enemy} ready!',
    ],
    shortRest: ['You take shelter, tend your wounds, and warm your hands.'],
    longRest: ['The party makes camp under furs and rests until the wind dies.'],
  },

  // ─── Campaign data ────────────────────────────────────────────────────────────

  campaign: {
    world_name: 'Whispering Pines',
    // Frost Acolyte boss (multiattack 2, paralyzing onHitEffect) plus mephit
    // and cultist rooms — tuned for 3 PCs.
    recommendedPartySize: 3,
    // Boss + mephits are fire-vulnerable — Wizard's Burning Hands / Fire Bolt
    // pays huge dividends here, more than Rogue utility.
    recommendedComposition: ['Fighter', 'Cleric', 'Wizard'],
    intro:
      'A frozen pass village where a missing trapper, a frost cult, and an ancient spire wait above the snow line.',

    // ── Rooms (local grids) ──────────────────────────────────────────────────
    // 3-level map model: the Pines is a town (tavern/lodge/warden as venues);
    // the Frozen Pass and the Iceshard Spire are regional sites whose rooms
    // chain via per-cell `exits`. Navigation is by the party marker.
    rooms: [
      // Village interiors (town venues open these; each ascends back to town).
      {
        id: 'pines_tavern',
        name: 'Pine Tavern',
        desc: 'A low-beamed inn smelling of woodsmoke and mulled spirits. Innkeeper Brann tends the bar.',
        canRest: true,
        gridWidth: 7,
        gridHeight: 7,
        entryPos: { x: 3, y: 6 },
        exits: [{ pos: { x: 3, y: 0 }, ascends: true, label: 'Back into the village' }],
      },
      {
        id: 'pines_lodge',
        name: "Trapper's Lodge",
        desc: "Marta's lodge — pelts hanging in racks, snowshoes and warhammers along the wall. A locked supply locker stands by the door.",
        gridWidth: 7,
        gridHeight: 7,
        entryPos: { x: 3, y: 6 },
        exits: [{ pos: { x: 3, y: 0 }, ascends: true, label: 'Back into the village' }],
        objects: [
          {
            id: 'trapper_locker',
            name: "Trapper's Locker",
            desc: "Marta's supply locker, kept off the floor. The lock looks honest, not warded.",
            interactText: 'You crouch by the locker and pick at the latch.',
            searchable: true,
            searchDC: 12,
            lootIds: ['elixir_of_warmth'],
            foundText: 'Inside: a wax-stoppered vial. An elixir of warmth.',
            emptyText: 'The latch sticks. Brace it properly and try the lock again.',
          },
        ],
      },
      {
        id: 'pines_warden',
        name: 'Warden Post',
        desc: "Captain Riese's command — a stone hut warmed by a single brazier. A war map covers one wall.",
        gridWidth: 7,
        gridHeight: 7,
        entryPos: { x: 3, y: 6 },
        exits: [{ pos: { x: 3, y: 0 }, ascends: true, label: 'Back into the village' }],
      },

      // The Frozen Pass — a regional site (a Frost Wolf prowls the trail).
      {
        id: 'pass_climb',
        name: 'Frozen Pass',
        desc: 'A switchback trail along the cliff face. Wind carries the scent of woodsmoke from below and something colder from above.',
        gridWidth: 10,
        gridHeight: 8,
        entryPos: { x: 0, y: 4 },
        exits: [{ pos: { x: 9, y: 4 }, ascends: true, label: 'Back down the pass' }],
      },

      // Iceshard Spire — a regional site; rooms chain entrance → hall → cult →
      // apex → egress, and the Hidden Descent ascends out.
      {
        id: 'spire_entrance',
        name: 'Spire Entrance',
        desc: 'A black stone arch leans against the cliff. Old cult sigils mark the lintel. The air inside is colder than the wind.',
        canRest: false,
        lighting: 'dim',
        gridWidth: 10,
        gridHeight: 10,
        entryPos: { x: 0, y: 0 },
        exits: [
          {
            pos: { x: 9, y: 0 },
            toRoomId: 'spire_frozen_hall',
            entrancePos: { x: 0, y: 0 },
            label: 'Into the Frozen Hall',
          },
          { pos: { x: 0, y: 9 }, ascends: true, label: 'Back out to the pass' },
        ],
      },
      {
        id: 'spire_frozen_hall',
        name: 'Frozen Hall',
        desc: 'A long pillared hall sheathed in ice. Frost mephits glitter in the air like motes of dust. Heavy icicles hang from the vaulted ceiling — some look ready to fall.',
        lighting: 'dark',
        gridWidth: 10,
        gridHeight: 10,
        entryPos: { x: 0, y: 0 },
        exits: [
          {
            pos: { x: 0, y: 1 },
            toRoomId: 'spire_entrance',
            entrancePos: { x: 9, y: 0 },
            label: 'Back to the entrance',
          },
          {
            pos: { x: 9, y: 9 },
            toRoomId: 'spire_cult_chamber',
            entrancePos: { x: 0, y: 0 },
            label: 'Into the Cult Chamber',
          },
        ],
        trap: {
          id: 'frozen_hall_icicle',
          name: 'Falling Icicle',
          desc: 'A spear-length icicle hangs over the hall, threaded with a thawing rune. Disturbance below shakes it loose.',
          dc: 12,
          damage: '2d6',
          damageType: 'piercing',
          triggerNarrative:
            'The icicle plunges from the ceiling — {name} takes {dmg} piercing damage and a faceful of frost.',
          detectNarrative:
            'You spot the rune carved at the base of the icicle — pure ice, set to drop if the hall is disturbed.',
          disarmSuccess: 'You snap the rune cleanly. The icicle slumps harmlessly.',
          disarmFail: 'Your hand slips on the rime — the icicle plummets early!',
        },
      },
      {
        id: 'spire_cult_chamber',
        name: 'Cult Chamber',
        desc: 'A circular vault with a low altar of black ironwood. Frostspire cultists chant in unison around a captive form. (Old Halden lies bound near the altar, unconscious.)',
        lighting: 'dim',
        gridWidth: 10,
        gridHeight: 10,
        entryPos: { x: 0, y: 0 },
        exits: [
          {
            pos: { x: 0, y: 1 },
            toRoomId: 'spire_frozen_hall',
            entrancePos: { x: 9, y: 9 },
            label: 'Back to the Frozen Hall',
          },
          {
            pos: { x: 9, y: 9 },
            toRoomId: 'spire_ritual_apex',
            entrancePos: { x: 1, y: 1 },
            label: 'Up to the Ritual Apex',
          },
        ],
      },
      {
        id: 'spire_ritual_apex',
        name: 'Ritual Apex',
        desc: "The spire's top chamber. A green flame burns above the broken vault. Shattered ice columns and frozen statuary line the approach. The Frost Acolyte stands at the apex, hands raised, runes blazing.",
        lighting: 'bright',
        gridWidth: 10,
        gridHeight: 10,
        entryPos: { x: 1, y: 1 },
        exits: [
          {
            pos: { x: 0, y: 9 },
            toRoomId: 'spire_cult_chamber',
            entrancePos: { x: 9, y: 9 },
            label: 'Back to the Cult Chamber',
          },
          {
            pos: { x: 9, y: 9 },
            toRoomId: 'spire_egress',
            entrancePos: { x: 0, y: 0 },
            label: 'A hidden descent',
          },
        ],
        // Ice columns + frozen ritual statuary clustered around the approach
        // to the apex dais. Symmetric so neither flank is "the right side".
        obstacles: [
          { x: 2, y: 4 },
          { x: 8, y: 4 },
          { x: 4, y: 6 },
          { x: 6, y: 6 },
          { x: 5, y: 3 },
        ],
        // Slick ice in the centre — slows the approach to the dais.
        difficultTerrain: [
          { x: 4, y: 4 },
          { x: 5, y: 4 },
          { x: 6, y: 4 },
        ],
      },
      {
        id: 'spire_egress',
        name: 'Hidden Descent',
        desc: 'A narrow stair cuts through the cliff back to the lower trail. Daylight shows below.',
        gridWidth: 8,
        gridHeight: 8,
        entryPos: { x: 0, y: 0 },
        exits: [
          {
            pos: { x: 0, y: 1 },
            toRoomId: 'spire_ritual_apex',
            entrancePos: { x: 9, y: 9 },
            label: 'Back up to the apex',
          },
          { pos: { x: 7, y: 7 }, ascends: true, label: 'Descend to the pass' },
        ],
      },
    ],

    // Navigation is by the marker + room `exits` (3-level map); the old
    // room-adjacency graph is retired.

    enemies: {
      pass_climb: [
        {
          id: 'pass_climb#0',
          name: 'Frost Wolf',
          hp: 11,
          ac: 13,
          damage: '1d6+1',
          toHit: 4,
          xp: 50,
          resistances: ['cold'],
        },
        {
          id: 'pass_climb#1',
          name: 'Frost Wolf',
          hp: 11,
          ac: 13,
          damage: '1d6+1',
          toHit: 4,
          xp: 50,
          resistances: ['cold'],
        },
      ],
      spire_frozen_hall: [
        {
          id: 'spire_frozen_hall#0',
          name: 'Ice Mephit',
          hp: 21,
          ac: 11,
          damage: '1d4+2',
          toHit: 4,
          xp: 100,
          immunities: ['cold'],
          vulnerabilities: ['fire'],
          condition_immunities: ['poisoned'],
        },
        {
          id: 'spire_frozen_hall#1',
          name: 'Ice Mephit',
          hp: 21,
          ac: 11,
          damage: '1d4+2',
          toHit: 4,
          xp: 100,
          immunities: ['cold'],
          vulnerabilities: ['fire'],
          condition_immunities: ['poisoned'],
        },
      ],
      spire_cult_chamber: [
        {
          id: 'spire_cult_chamber#0',
          name: 'Frost Cultist',
          hp: 17,
          ac: 12,
          damage: '1d8+1',
          toHit: 3,
          xp: 100,
          resistances: ['cold'],
        },
        {
          id: 'spire_cult_chamber#1',
          name: 'Frost Cultist',
          hp: 17,
          ac: 12,
          damage: '1d8+1',
          toHit: 3,
          xp: 100,
          resistances: ['cold'],
        },
      ],
      spire_ritual_apex: [
        {
          id: 'spire_ritual_apex#boss',
          name: 'Frost Acolyte',
          hp: 78,
          ac: 15,
          damage: '2d6+3',
          toHit: 6,
          xp: 1100,
          multiattack: 2,
          resistances: ['cold'],
          immunities: ['poison'],
          vulnerabilities: ['fire'],
          condition_immunities: ['frightened', 'paralyzed'],
          onHitEffect: { condition: 'paralyzed', ability: 'con', dc: 13 },
          phases: [
            {
              hpPct: 60,
              name: 'Ice Armor',
              narrative:
                'The Acolyte hisses a hard syllable and frost rimes their robes — blows skid off. Around them the ritual flame burns colder.',
              effects: [
                { kind: 'set_ac', value: 17 },
                { kind: 'set_damage', dice: '2d8+3' },
              ],
            },
            {
              hpPct: 30,
              name: 'Frostbinding',
              narrative:
                'The Acolyte tears off their frost cloak. Black ice spreads beneath their feet. Their staff lashes with bone-cold speed.',
              effects: [
                { kind: 'set_to_hit', value: 8 },
                { kind: 'set_multiattack', value: 3 },
                {
                  kind: 'set_on_hit_effect',
                  effect: { condition: 'paralyzed', ability: 'con', dc: 15 },
                },
              ],
            },
          ],
        },
      ],
    },

    loot: {
      spire_entrance: {
        id: 'fur_cloak',
        name: 'Fur Cloak',
        weight: 3,
        desc: 'A discarded fur cloak — Halden was here.',
        type: 'misc',
        slot: null,
        damage: null,
        ac_bonus: null,
        heal: null,
        effect: 'cold_warmth',
        aliases: ['cloak'],
      },
      spire_frozen_hall: {
        id: 'elixir_of_warmth',
        name: 'Elixir of Warmth',
        weight: 1,
        desc: 'A clay vial of mulled spirits — restores 1d4+2 HP.',
        type: 'consumable',
        slot: null,
        damage: null,
        ac_bonus: null,
        heal: '1d4+2',
        effect: null,
        aliases: ['elixir'],
      },
      spire_cult_chamber: {
        id: 'halden_locket',
        name: "Halden's Locket",
        weight: 1,
        desc: "Old Halden's silver locket — proof he was here.",
        type: 'misc',
        slot: null,
        damage: null,
        ac_bonus: null,
        heal: null,
        effect: null,
        aliases: ['locket'],
      },
      spire_ritual_apex: {
        id: 'cult_idol',
        name: 'Frostspire Idol',
        weight: 4,
        desc: 'A black ironwood idol carved with the cult rune. Captain Riese will want this.',
        type: 'misc',
        slot: null,
        damage: null,
        ac_bonus: null,
        heal: null,
        effect: null,
        aliases: ['idol', 'rune'],
      },
    },

    npcs: {
      pines_tavern: {
        roomId: 'pines_tavern',
        id: 'npc_brann',
        name: 'Innkeeper Brann',
        attitude: 'friendly',
        factionId: 'faction_wardens',
        hp: 6,
        ac: 10,
        damage: '1d4',
        toHit: 0,
        xp: 0,
        greeting:
          "Thank the gods you're here. Old Halden the trapper went up the pass three days back — never came down. Bring him back, or proof. I'll pay.",
        responses: [
          {
            label: "I'll search the pass for Halden.",
            reply:
              "Bless you. His daughter's been crying herself to sleep. He carries a silver locket — bring it back if you find him.",
          },
          {
            label: 'What about the spire?',
            reply:
              'Iceshard Spire. Cultists. Green fire in the topmost window. Captain Riese knows more.',
          },
          {
            label: 'Supplies?',
            reply: 'Mulled elixirs, fur cloaks. Anything heavier, ask Marta at the lodge.',
          },
        ],
        persuasionDC: 10,
        shop: [
          { itemId: 'elixir_of_warmth', price: 20 },
          { itemId: 'fur_cloak', price: 40 },
        ],
      },
      pines_lodge: {
        roomId: 'pines_lodge',
        id: 'npc_marta',
        name: 'Marta the Trapper',
        attitude: 'friendly',
        factionId: 'faction_wardens',
        hp: 12,
        ac: 13,
        damage: '1d6+2',
        toHit: 3,
        xp: 0,
        greeting:
          'Halden was a friend. Take what you need — warhammers work better than blades on the mephits. Carry torches.',
        responses: [
          {
            label: 'Show me your goods.',
            reply: "Everything's marked. Warden discount if Riese's vouched for you.",
          },
          {
            label: 'Tell me about the mephits.',
            reply: 'Cold breath. Wear your cloak. They flee fire like cats from water.',
          },
        ],
        persuasionDC: 11,
        shop: [
          { itemId: 'warhammer', price: 30 },
          { itemId: 'longbow', price: 50 },
          { itemId: 'leather_armor', price: 45 },
          { itemId: 'elixir_of_warmth', price: 18 },
        ],
      },
      pines_warden: {
        roomId: 'pines_warden',
        id: 'npc_riese',
        name: 'Captain Riese',
        attitude: 'indifferent',
        hp: 22,
        ac: 16,
        damage: '1d8+3',
        toHit: 5,
        xp: 0,
        greeting:
          "Listen — the trapper's a sideshow. The real problem is the cult at Iceshard. Bring back their idol so I know how bad it's gotten. Kill their leader and we end this for a generation.",
        responses: [
          {
            label: "I'll end the cult at the spire.",
            reply: 'Good. The Acolyte will be at the top. Bring back the idol.',
          },
          {
            label: 'What about the cult?',
            reply: 'They worship something old in the ice. Take fire if you have it.',
          },
          {
            label: 'A healer?',
            reply: "We've a field medic, yes. It'll cost you, mind.",
            consequences: [{ type: 'modify_hp', amount: 6 }],
          },
        ],
        persuasionDC: 13,
      },
    },

    defaultStartingLoot: ['elixir_of_warmth'],

    // ── Regional map (standalone-only — when folded into Malgovia, the host
    // re-declares these sites; only `encounterTable` is merged) ──────────────
    regions: [
      {
        id: 'frostpass_region',
        name: 'The Frozen Pass',
        desc: 'A snow-bound vale below the Iceshard Spire — the village, the cliff trail, and the cult-haunted tower above.',
        feetPerSquare: 5280,
        gridWidth: 10,
        gridHeight: 6,
        startPos: { x: 1, y: 3 },
        sites: [
          {
            id: 'site_pines',
            name: 'Whispering Pines',
            pos: { x: 2, y: 3 },
            kind: 'town',
            townId: 'pines_village',
          },
          {
            id: 'site_pass',
            name: 'The Frozen Pass',
            pos: { x: 6, y: 1 },
            kind: 'local',
            entryRoomId: 'pass_climb',
          },
          {
            id: 'site_spire',
            name: 'Iceshard Spire',
            pos: { x: 9, y: 4 },
            kind: 'local',
            entryRoomId: 'spire_entrance',
          },
        ],
        encounterTable: ['Snowshrouded Bandit', 'Frost Wolf'],
        encounterChance: 0.1,
      },
    ],

    towns: [
      {
        id: 'pines_village',
        name: 'Whispering Pines',
        desc: 'A snow-shrouded square — the Pine Tavern, the Trapper’s Lodge, and the Warden Post.',
        feetPerSquare: 25,
        gridWidth: 6,
        gridHeight: 6,
        startPos: { x: 3, y: 3 },
        venues: [
          {
            id: 'venue_tavern',
            name: 'Pine Tavern',
            pos: { x: 1, y: 1 },
            kind: 'interior',
            entryRoomId: 'pines_tavern',
          },
          {
            id: 'venue_lodge',
            name: "Trapper's Lodge",
            pos: { x: 4, y: 1 },
            kind: 'interior',
            entryRoomId: 'pines_lodge',
          },
          {
            id: 'venue_warden',
            name: 'Warden Post',
            pos: { x: 1, y: 4 },
            kind: 'interior',
            entryRoomId: 'pines_warden',
          },
          { id: 'venue_gate_pines', name: 'Village Edge', pos: { x: 3, y: 5 }, kind: 'gate' },
        ],
      },
    ],

    // ─── Quests ─────────────────────────────────────────────────────────────────

    quests: [
      {
        id: 'quest_trapper',
        title: 'The Missing Trapper',
        desc: 'Old Halden the trapper has been missing three days. Innkeeper Brann wants him back — or proof of his fate. His silver locket should be enough.',
        giverNpcId: 'npc_brann',
        factionId: 'faction_wardens',
        repGain: 10,
        steps: [
          {
            id: 'step_talk_brann',
            desc: 'Speak with Innkeeper Brann about the missing trapper.',
            condition: {
              all: [
                { fact: 'room_id', operator: 'equal', value: 'pines_tavern' },
                {
                  any: [
                    { fact: 'action', operator: 'equal', value: 'talk_response' },
                    { fact: 'action', operator: 'equal', value: 'accept_quest' },
                  ],
                },
              ],
            },
          },
          {
            id: 'step_find_locket',
            desc: "Find Halden's locket in the Iceshard Spire.",
            condition: {
              all: [{ fact: 'loot_taken', operator: 'contains', value: 'halden_locket' }],
            },
          },
          {
            id: 'step_return_locket',
            desc: 'Return the locket to Innkeeper Brann at the Pine Tavern.',
            // Completes when the party is back in Brann's venue room with the locket.
            condition: {
              all: [
                { fact: 'loot_taken', operator: 'contains', value: 'halden_locket' },
                { fact: 'room_id', operator: 'equal', value: 'pines_tavern' },
              ],
            },
          },
        ],
        rewards: [
          { type: 'give_gold', amount: 80 },
          { type: 'give_xp', amount: 250 },
          // Faction rep bumped via `repGain: 10` above — route surfaces
          // the narrative line.
          {
            type: 'add_narrative',
            text: 'Brann presses a purse of 80 gold into your hand and bows his head. "His daughter will rest easier knowing."',
          },
        ],
      },
      {
        id: 'quest_cult',
        title: 'Silence the Spire',
        desc: 'Captain Riese has charged you with breaking the Frostspire Cult: kill the Frost Acolyte and bring back their idol.',
        giverNpcId: 'npc_riese',
        factionId: 'faction_wardens',
        repGain: 30,
        steps: [
          {
            id: 'step_meet_riese',
            desc: 'Speak with Captain Riese at the Warden Post.',
            condition: {
              all: [
                { fact: 'room_id', operator: 'equal', value: 'pines_warden' },
                {
                  any: [
                    { fact: 'action', operator: 'equal', value: 'talk_response' },
                    { fact: 'action', operator: 'equal', value: 'accept_quest' },
                  ],
                },
              ],
            },
          },
          {
            id: 'step_kill_acolyte',
            desc: 'Defeat the Frost Acolyte at the Ritual Apex.',
            condition: {
              all: [
                {
                  fact: 'enemies_killed',
                  operator: 'contains',
                  value: 'spire_ritual_apex#boss',
                },
              ],
            },
          },
          {
            id: 'step_recover_idol',
            desc: 'Recover the Frostspire Idol.',
            condition: {
              all: [{ fact: 'loot_taken', operator: 'contains', value: 'cult_idol' }],
            },
          },
        ],
        rewards: [
          { type: 'give_gold', amount: 250 },
          { type: 'give_xp', amount: 1500 },
          { type: 'modify_hp', amount: 15 },
          // Faction rep bumped via `repGain: 30` above.
          {
            type: 'add_narrative',
            text: 'Captain Riese turns the idol in her hands, then drops it into the brazier. "For a generation, then. Drink with us tonight."',
          },
        ],
      },
    ],

    // ─── Factions ────────────────────────────────────────────────────────────────

    factions: [
      {
        id: 'faction_wardens',
        name: 'Pine Wardens',
        thresholds: { hostile: -50, unfriendly: -10, neutral: 0, friendly: 20, exalted: 60 },
        shopPriceModifiers: {
          hostile: 1.5,
          unfriendly: 1.2,
          neutral: 1.0,
          friendly: 0.85,
          exalted: 0.7,
        },
      },
    ],
  },

  // ─── Spell table (subset — same vocabulary as Vale plus Fire Bolt + Burning Hands) ──

  spellTable: { ...SRD_SPELLS },
  featTable: { ...SRD_FEATS },

  classSpells: {
    Cleric: [
      'sacred_flame',
      'cure_wounds',
      'guiding_bolt',
      'bless',
      'spiritual_weapon',
      'healing_word',
      'hold_person',
      'animate_dead',
    ],
    Wizard: [
      'fire_bolt',
      'magic_missile',
      'burning_hands',
      'thunderwave',
      'misty_step',
      'fireball',
      'hold_person',
      'animate_dead',
    ],
    Paladin: ['divine_smite_spell', 'cure_wounds', 'bless'],
    Bard: ['bardic_inspiration_spell', 'cure_wounds', 'healing_word', 'charm_person', 'sleep'],
    Druid: ['shillelagh', 'entangle', 'cure_wounds', 'healing_word'],
    Sorcerer: ['fire_bolt', 'sleep', 'burning_hands', 'misty_step', 'fireball'],
    Warlock: ['eldritch_blast', 'hex', 'charm_person'],
  },

  // ─── Script-engine rules ─────────────────────────────────────────────────────

  rules: [
    {
      name: 'halden_locket_found',
      once: true,
      priority: 5,
      conditions: {
        all: [
          { fact: 'loot_taken', operator: 'contains', value: 'halden_locket' },
          { fact: 'flags', operator: 'doesNotContain', value: 'rule_fired_halden_locket_found' },
        ],
      },
      consequences: [
        { type: 'advance_quest', questId: 'quest_trapper', stepId: 'step_find_locket' },
        {
          type: 'add_narrative',
          text: "You recognise the engraving — Halden's daughter's name. The cult had him here.",
        },
      ],
    },
    {
      name: 'cult_idol_recovered',
      once: true,
      priority: 5,
      conditions: {
        all: [
          { fact: 'loot_taken', operator: 'contains', value: 'cult_idol' },
          { fact: 'flags', operator: 'doesNotContain', value: 'rule_fired_cult_idol_recovered' },
        ],
      },
      consequences: [
        { type: 'advance_quest', questId: 'quest_cult', stepId: 'step_recover_idol' },
        {
          type: 'add_narrative',
          text: 'The idol grows cold in your hand. Captain Riese will want to see this immediately.',
        },
      ],
    },
  ],
};
