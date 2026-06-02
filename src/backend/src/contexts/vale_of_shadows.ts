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
} from './srd/index.js';
import type { TerrainCell, TerrainType } from '../types.js';
import type { Context } from '../types.js';
import type { EnemyTemplate } from '../types.js';
import type { MapSite } from '../types.js';
import { groveContent } from './folded/grove_of_thorns.js';
import { whisperingPinesContent } from './folded/whispering_pines.js';

// Overland-map authoring sugar: build terrain cells of one type from [x,y] pairs.
const terr = (type: TerrainType, ...cells: [number, number][]): TerrainCell[] =>
  cells.map(([x, y]) => ({ pos: { x, y }, type }));

// Shared Crypt Lord stat block. Used both as the roguelike-pool template and
// (spread with an `id`) as the campaign throne boss, so a balance change can't
// silently diverge between the two copies again. `multiattack: 2` is the
// L4-party-tuned value — the third attack pushed the boss's DPR past the
// party's effective HP/round, especially with the frighten-on-hit cascade.
const CRYPT_LORD_BASE: EnemyTemplate = {
  name: 'Crypt Lord',
  cr: 5,
  hp: 97,
  ac: 17,
  damage: '2d6+4',
  toHit: 7,
  xp: 1800,
  str: 18,
  dex: 10,
  con: 18,
  int: 11,
  wis: 10,
  cha: 16,
  multiattack: 2,
  resistances: ['bludgeoning', 'piercing', 'slashing'],
  immunities: ['poison', 'necrotic'],
  condition_immunities: ['charmed', 'exhaustion', 'frightened', 'paralyzed', 'poisoned'],
  onHitEffect: { condition: 'frightened', ability: 'wis', dc: 13 },
  damageType: 'necrotic',
  // The lich's grave-hoard — gold + a couple of potions for the victors. (The
  // Moonstone Amulet is placed as room loot on the throne dais.)
  goldDrop: 120,
  drops: ['healing_potion', 'healing_potion'],
  // Two-phase fight. At 50% hp the lich shifts to a darker rage — higher
  // to-hit, harder fear DC. At 25% hp it cracks open its phylactery for a
  // one-shot heal + crit-grade damage.
  phases: [
    {
      hpPct: 50,
      name: 'Wrath of the Sealed Tomb',
      narrative:
        "Bone splinters erupt from the floor around the Crypt Lord — its eye-sockets blaze. 'You will not silence me again!'",
      effects: [
        { kind: 'set_to_hit', value: 9 },
        { kind: 'set_damage', dice: '2d8+4' },
        {
          kind: 'set_on_hit_effect',
          effect: { condition: 'frightened', ability: 'wis', dc: 15 },
        },
      ],
    },
    {
      hpPct: 25,
      name: 'Phylactery Crack',
      narrative:
        'A black gem in its breastplate fractures. Necrotic light pours into the Crypt Lord — its wounds knit closed and it lunges with renewed fury.',
      effects: [
        { kind: 'heal', amount: 25 },
        { kind: 'set_damage', dice: '3d6+4' },
        { kind: 'set_ac', value: 18 },
      ],
    },
  ],
};

// ─── Duskenvale — First Adventure Module ─────────────────────────────────
//
// 3-level grid map (regional → town → local):
//   region `vale_region` — the overland map; the party is a single marker.
//     sites: Millhaven (town), The Old Road, Bandit Camp, Shattered Crypt.
//   town `millhaven_town` — venues: Temple, Merchant/Lantern districts,
//     Garrison, and the gate back to the region.
//   local rooms — the crypt (8 rooms), the camp (2 rooms), the road skirmish;
//     connected by per-cell room `exits` (no more `connections` graph).
//
// Quests:
//   quest_shipment   — The Missing Shipment  (Merchant Guild)
//   quest_crypt      — Beneath the Surface   (Temple of Selûne)
//   quest_shadow     — Shadow Dealings       (Slums contact)
//
// Factions:
//   faction_guild    — Merchant Guild   (shop prices)
//   faction_watch    — City Watch       (encounter frequency)

const context: Context = {
  id: 'vale_of_shadows',
  worldNoun: 'vale',
  mapType: 'campaign',
  startRoomId: 'millhaven_square',

  worldNames: [
    'Duskenvale',
    'The Darkened Vale',
    'Millhaven, the Frozen Pass, and the Silent Grove',
  ],

  // ─── Classes ─────────────────────────────────────────────────────────────────

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
    Druid: ['quarterstaff', 'leather_armor', 'healing_potion'],
    Sorcerer: ['dagger', 'component_pouch', 'healing_potion'],
    Warlock: ['dagger', 'leather_armor', 'healing_potion'],
    Monk: ['shortsword', 'dart'],
    Barbarian: ['greataxe', 'handaxe', 'healing_potion'],
  },

  spellcastingAbility: { ...SRD_SPELLCASTING_ABILITY },

  // ─── Backgrounds ──────────────────────────────────────────────────────────────

  backgrounds: srdBackgrounds({
    soldier: {
      desc: 'You served in a regional militia or under a noble banner.',
      featureDesc: 'Local watchmen and veterans recognise your authority.',
    },
    criminal: {
      desc: 'You have a history of breaking the law.',
      featureDesc: 'A reliable contact in the Lantern District handles fences and rumour.',
    },
    sage: {
      desc: 'You spent years studying lore and arcane history.',
      featureDesc: 'If you do not know information, you know where to find it.',
    },
    acolyte: {
      desc: 'You served at the Temple of Selûne before taking up the road.',
      featureDesc: 'You and your companions receive healing and care at temples.',
    },
  }),

  // ─── Intro texts ──────────────────────────────────────────────────────────────

  introTexts: [
    `You arrive in Millhaven, a market town nestled at the edge of Duskenvale. Merchants hawk their wares in the square, but unease hangs in the air — the old crypt beyond the hills has been making sounds at night, and two of the Guild's supply wagons have gone missing on the Old Road.`,
    `The sun is setting over Millhaven as you ride in. The innkeeper greets you with a worried look — there's trouble in the vale, and coin to be made for those with sword or spell.`,
    `Rain patters on the cobblestones of Millhaven's market square. A priest from the Temple of Selûne approaches you the moment you dismount — they need capable adventurers, and word travels fast in small towns.`,
  ],

  // ─── Room pool (roguelike — not used in campaign mode, but required by type) ─

  // ─── Enemy templates ──────────────────────────────────────────────────────────

  enemyTemplates: [
    // SRD skeleton with a sword + tomb-themed name. Piercing resist
    // because they're already bony, slashing dmg from the longsword.
    {
      ...SRD_MONSTERS.skeleton,
      name: 'Skeleton Warrior',
      resistances: ['piercing'],
      damageType: 'slashing',
    },
    // SRD ghoul reskinned as a crypt-dweller.
    { ...SRD_MONSTERS.ghoul, name: 'Crypt Ghoul' },
    // SRD shadow — already themed for this campaign.
    SRD_MONSTERS.shadow,
    // SRD bandit renamed for the local Lantern District flavor.
    { ...SRD_MONSTERS.bandit, name: 'Bandit Ruffian' },
    CRYPT_LORD_BASE,
  ],

  // ─── Loot table ───────────────────────────────────────────────────────────────

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
      'quarterstaff',
      'longbow',
      'leather_armor',
      'studded_leather',
      'scale_mail',
      'chain_mail',
      'shield',
      'healing_potion',
      'holy_symbol',
      'component_pouch'
    ),
    // Campaign-specific quest items.
    {
      id: 'guild_ledger',
      name: 'Guild Ledger',
      weight: 3,
      desc: "A waterlogged ledger bearing the Merchant Guild's stamp — evidence of the missing shipment.",
      type: 'misc',
      slot: null,
      damage: null,
      ac_bonus: null,
      heal: null,
      effect: null,
      aliases: ['ledger', 'book', 'shipping records'],
    },
    {
      id: 'shadow_evidence',
      name: 'Incriminating Letter',
      weight: 1,
      desc: "A letter bearing Captain Vane's seal, arranging bribes with the bandits.",
      type: 'misc',
      slot: null,
      damage: null,
      ac_bonus: null,
      heal: null,
      effect: null,
      aliases: ['letter', 'evidence'],
    },
    {
      id: 'moonstone_amulet',
      name: 'Moonstone Amulet',
      weight: 2,
      desc: 'A silver amulet set with a glowing moonstone. Grants +1 to Wisdom saving throws.',
      type: 'misc',
      slot: null,
      damage: null,
      ac_bonus: null,
      heal: null,
      effect: '+1_wis_save',
      requiresAttunement: true,
      aliases: ['amulet', 'moonstone'],
    },
    {
      id: 'stolen_shipment',
      name: 'Stolen Guild Cargo',
      weight: 6,
      desc: "A crate stamped with the Merchant Guild's mark — part of the shipment raided from the Old Road. Aldric will want this back.",
      type: 'misc',
      slot: null,
      damage: null,
      ac_bonus: null,
      heal: null,
      effect: null,
      aliases: ['cargo', 'crate', 'shipment', 'goods'],
    },
  ],

  // ─── NPC templates ───────────────────────────────────────────────────────────

  npcTemplates: [
    {
      id: 'npc_aldric',
      name: 'Aldric the Merchant',
      attitude: 'friendly',
      factionId: 'faction_guild',
      hp: 4,
      ac: 10,
      damage: '1d4',
      toHit: 0,
      xp: 0,
      greeting:
        "Thank the gods — capable folk! Two of our supply wagons vanished on the Old Road three days past. I'll pay well for anyone who finds what happened to them and recovers the shipping ledger.",
      responses: [
        {
          label: "I'll look into the missing shipment.",
          reply:
            'Wonderful! The ledger would prove our goods were never delivered — the Guild needs it to claim compensation. Last seen near the old crypt road.',
          consequences: [
            { type: 'advance_quest', questId: 'quest_shipment', stepId: 'step_talk_aldric' },
          ],
        },
        {
          label: 'What do you know about the crypt?',
          reply:
            "Nothing good. Locals avoid it. Word is, something stirs within — lights at night, groaning sounds. An old wizard sealed it years ago, but seals don't last forever.",
        },
        {
          label: "I'll need supplies.",
          reply: 'Of course. Browse what I have — Guild members get a fair price.',
        },
      ],
      persuasionDC: 12,
      shop: [
        { itemId: 'healing_potion', price: 50 },
        { itemId: 'rope', price: 1 },
        { itemId: 'torch', price: 1 },
      ],
    },
    {
      id: 'npc_sister_maren',
      name: 'Sister Maren',
      attitude: 'friendly',
      hp: 8,
      ac: 11,
      damage: '1d4',
      toHit: 2,
      xp: 0,
      greeting:
        "Selûne's blessing upon you, traveler. I am Sister Maren of the Temple. The crypt to the north — something evil has taken root there. I need brave souls to descend and cleanse it.",
      responses: [
        {
          label: 'Tell me about the crypt.',
          reply:
            'It is the Shattered Crypt — an old noble tomb from the Third Age. A lich was sealed within, long ago. We fear the seal has weakened. The Crypt Lord must be destroyed.',
          consequences: [
            { type: 'advance_quest', questId: 'quest_crypt', stepId: 'step_learn_crypt' },
          ],
        },
        {
          label: 'I will clear the crypt.',
          reply:
            'Bless you. Destroy the Crypt Lord at the lowest level. The moonstone amulet within is sacred to Selûne — please return it to the temple.',
          consequences: [
            { type: 'advance_quest', questId: 'quest_crypt', stepId: 'step_learn_crypt' },
          ],
        },
        {
          label: 'Can you heal my wounds?',
          reply: 'For a small donation to the temple, yes.',
          consequences: [{ type: 'modify_hp', amount: 8 }],
        },
      ],
      persuasionDC: 10,
    },
    {
      id: 'npc_dusk',
      name: 'Dusk',
      attitude: 'indifferent',
      hp: 14,
      ac: 13,
      damage: '1d6+2',
      toHit: 4,
      xp: 0,
      greeting:
        "Eyes down, stranger. What brings you to the Lantern District? If it's trouble with the Watch, we might have common cause.",
      responses: [
        {
          label: 'Tell me about the City Watch.',
          reply:
            "Captain Vane's rotten from the boots up. Taking coin from the road bandits to look the other way. I have proof — or I will, if you can get into his office.",
          consequences: [
            { type: 'advance_quest', questId: 'quest_shadow', stepId: 'step_meet_dusk' },
          ],
        },
        {
          label: 'What do you need me to do?',
          reply:
            "Vane keeps a letter in his strongbox at the garrison. Get it. It ties him to the bandit raids. Bring it to me and I'll make sure the right people see it.",
          consequences: [
            { type: 'advance_quest', questId: 'quest_shadow', stepId: 'step_meet_dusk' },
          ],
        },
        {
          label: 'Not interested.',
          reply: "Your loss. Don't say I didn't offer.",
        },
      ],
      persuasionDC: 14,
    },
  ],

  // ─── Narratives ───────────────────────────────────────────────────────────────

  narratives: {
    roomArrival: {
      // Opening frame only — the party begins on the regional grid (see
      // initMapState), so this describes the vale map, not a room.
      millhaven_square: [
        "The Old Road brings you to the edge of Duskenvale. Millhaven's lantern-lit walls stand to the west; the wooded hills to the north and east hide the bandit camp and the Shattered Crypt. Your map of the vale lies open before you.",
      ],
      dungeon_crypt_entrance: [
        'Mossy steps lead down into the Shattered Crypt. Cold air breathes from the darkness below.',
        'The iron doors of the crypt hang ajar, groaning softly. Torchlight flickers from within.',
      ],
      dungeon_crypt_exit: [
        'A shaft of pale light falls from above — the entrance to the crypt, and freedom beyond.',
      ],
    },
    genericArrival: [
      'The shadows shift as you enter.',
      'Dust motes drift in the pale torchlight.',
      'Something skitters in the darkness.',
      'An eerie silence greets you.',
    ],
    weaponVerbs: {
      longsword: ['cleaves', 'slashes', 'cuts'],
      shortsword: ['thrusts', 'stabs', 'jabs'],
      rapier: ['pierces', 'lunges', 'skewers'],
      mace: ['smashes', 'bludgeons', 'cracks'],
      quarterstaff: ['strikes', 'sweeps', 'clubs'],
      longbow: ['pins', 'skewers', 'pierces'],
      unarmed: ['punches', 'strikes', 'slams'],
    },
    classStyle: {
      Fighter: [
        'with disciplined precision',
        'using superior technique',
        'exploiting a gap in their guard',
      ],
      Rogue: ['from the shadows', 'finding the weak point', 'with practiced ease'],
      Wizard: ['channeling arcane energy through the strike', 'with focused concentration'],
      Cleric: ['invoking divine strength', 'guided by faith'],
      Ranger: ["with ranger's instinct", "reading the enemy's stance"],
      Paladin: ['with holy conviction', 'driven by sacred oath'],
      Bard: ['with unexpected flair', "using the enemy's own momentum"],
    },
    enemyReactions: {
      'Skeleton Warrior': [
        'Its bones rattle with the impact.',
        'Ancient dust shakes from its frame.',
        'It staggers but keeps fighting.',
      ],
      'Crypt Ghoul': [
        'It shrieks with unnatural fury.',
        'The wound steams with cold ichor.',
        'It snaps its jaws in pain.',
      ],
      Shadow: [
        'It writhes and contracts.',
        'The darkness disperses briefly.',
        'A hollow wail echoes.',
      ],
      'Bandit Ruffian': [
        'It curses under its breath.',
        'Blood soaks its tunic.',
        'It stumbles back a step.',
      ],
      'Crypt Lord': [
        'THAT is merely an annoyance to me.',
        'The lich king laughs — a sound like cracking ice.',
        'Ancient power radiates from its wounds.',
      ],
    },
    deathSaveStatus: {
      1: ['You cling to life by a thread.', 'Darkness crowds the edges of your vision.'],
      2: ['Death whispers your name.', 'The world grows very cold.'],
      3: ['You are beyond help now.'],
    },
    combatHit: {
      healthy: [
        'With fluid confidence, {enemy} reels from the blow.',
        'Your attack connects cleanly — {enemy} staggers.',
        'A solid strike lands on {enemy}.',
      ],
      hurt: [
        'Despite your wounds, you land a telling blow on {enemy}.',
        'Gritting through the pain, your attack finds {enemy}.',
        'Desperate and determined, your strike connects with {enemy}.',
      ],
      critical: [
        'Barely standing, you somehow find the strength to strike {enemy}.',
        'On sheer will alone, your blow hammers {enemy}.',
      ],
    },
    combatMiss: {
      healthy: [
        "Your strike glances off {enemy}'s guard.",
        '{enemy} sidesteps neatly.',
        'Your blow goes wide.',
      ],
      hurt: [
        'Pain throws off your aim — {enemy} avoids it.',
        'Your wounded arm betrays you; {enemy} steps aside.',
      ],
      critical: [
        'You can barely lift your weapon — the attack fails entirely.',
        '{enemy} brushes aside your feeble attempt.',
      ],
    },
    enemyAttacks: [
      'The {enemy} attacks!',
      '{enemy} strikes at you!',
      '{enemy} presses the assault!',
    ],
    killShot: [
      '{enemy} collapses, broken and still.',
      '{enemy} falls — the threat is ended.',
      'With a final blow, {enemy} is destroyed.',
    ],
    lootPickedUp: [
      'You pocket the {item}.',
      'The {item} joins your inventory.',
      'You take the {item}.',
    ],
    noLoot: ['There is nothing of value here.', 'The area has already been stripped clean.'],
    alreadyLooted: ['You have already taken what was here.'],
    noEnemy: ['There is no enemy here to fight.', 'The area is clear.'],
    alreadyDead: ['That foe is already defeated.'],
    sneakSuccess: [
      'You slip into the shadows undetected.',
      'Moving like a ghost, you disappear from sight.',
    ],
    sneakFail: [
      'Your boot catches on a loose stone — the element of surprise is lost!',
      'A creak of leather betrays you.',
    ],
    deathLines: ['{name} falls, life fading...', '{name} collapses — not long now...'],
    enemyDeflected: [
      "{enemy}'s blow glances off your armor.",
      '{enemy} attacks but finds no opening.',
      "You turn aside {enemy}'s strike.",
    ],
    levelUp: [
      'Your trials have made you stronger — you have reached level {level}!',
      'Experience crystallizes into power — you advance to level {level}!',
    ],
    combatStart: [
      '{enemy} bars your path — initiative is drawn!',
      'Combat begins! {enemy} readies for battle.',
    ],
    shortRest: ['You tend your wounds and catch your breath.'],
    longRest: ['The party makes camp and rests through the night.'],
  },

  // ─── Campaign data ────────────────────────────────────────────────────────────

  campaign: {
    world_name: 'Duskenvale',
    // Three quests + 8-room crypt with a multi-attack lich boss — tuned for 3 PCs.
    recommendedPartySize: 3,
    // Charnel Hall blade trap + Garrison strongbox favor Rogue's Stealth /
    // Investigation / Cunning Action over a Wizard's blast spells here.
    recommendedComposition: ['Fighter', 'Cleric', 'Rogue'],
    intro:
      'Duskenvale stretches before you — a shadowed frontier of ancient tombs, frozen spires, and silent groves, where suspicious folk eye every stranger who walks the pine-dark roads.',

    // ── Rooms (local grids) ──────────────────────────────────────────────────
    // 3-level map model: navigation is by the party marker on the regional /
    // town grids (see `regions` / `towns` below) and per-cell room `exits` on
    // local grids — NOT the old room `connections` graph (now empty). Each
    // local room is a self-contained grid; `entryPos` is where the marker
    // arrives, `exits` are the transition cells (room→room, or `ascends` to
    // leave the site). Combat is unchanged — it deploys on the context combat
    // grid, independent of these exploration-grid dims.
    rooms: [
      // `millhaven_square` survives only as the opening-arrival frame: the party
      // starts on the regional grid (current_room is cleared), so this room is
      // never entered — its `roomArrival` text frames the vale map.
      {
        id: 'millhaven_square',
        name: 'Duskenvale',
        desc: 'The Old Road brings you into Duskenvale. Millhaven lies to the west; the pine-dark hills hide darker places — and the pass and grove lie beyond.',
      },

      // Millhaven interiors (town venues open these; each ascends back to town).
      {
        id: 'millhaven_temple',
        name: 'Temple of Selûne',
        desc: 'A modest stone temple, its silver crescent glinting above the door. Candles burn within.',
        canRest: true,
        gridWidth: 7,
        gridHeight: 7,
        entryPos: { x: 3, y: 6 },
        exits: [{ pos: { x: 3, y: 0 }, ascends: true, label: 'Step back into Millhaven' }],
      },
      {
        id: 'millhaven_market',
        name: 'Merchant District',
        desc: 'Guild warehouses and market stalls. Aldric the Merchant holds court here.',
        gridWidth: 7,
        gridHeight: 7,
        entryPos: { x: 3, y: 6 },
        exits: [{ pos: { x: 3, y: 0 }, ascends: true, label: 'Step back into Millhaven' }],
      },
      {
        id: 'millhaven_slums',
        name: 'Lantern District',
        desc: 'Narrow alleys and shuttered windows. Someone is watching from the shadows.',
        gridWidth: 7,
        gridHeight: 7,
        entryPos: { x: 3, y: 6 },
        exits: [{ pos: { x: 3, y: 0 }, ascends: true, label: 'Step back into Millhaven' }],
      },
      {
        id: 'millhaven_garrison',
        name: 'Garrison Office',
        desc: 'A stone building bearing the City Watch crest. A strongbox sits behind the desk.',
        gridWidth: 7,
        gridHeight: 7,
        entryPos: { x: 3, y: 6 },
        exits: [{ pos: { x: 3, y: 0 }, ascends: true, label: 'Step back into Millhaven' }],
        objects: [
          {
            id: 'captain_strongbox',
            name: "Captain's Strongbox",
            desc: "An iron strongbox bolted under the captain's desk. The lock is intricate.",
            interactText: 'You crouch beside the strongbox and work the lock.',
            searchable: true,
            searchDC: 15,
            lootIds: ['shadow_evidence'],
            foundText:
              "The lock clicks. Inside, the incriminating letter — proof Captain Vane was on the bandits' payroll.",
            emptyText: 'The lock resists you. Reset your tools and try again.',
          },
        ],
      },

      // The Old Road — a regional site: a bandit skirmish on the way through.
      {
        id: 'road_north',
        name: 'The Old Road',
        desc: 'A rutted track through the hills. Fresh wagon tracks veer off near a stand of dead trees — and the men who made them are still here.',
        gridWidth: 10,
        gridHeight: 8,
        entryPos: { x: 0, y: 4 },
        exits: [{ pos: { x: 9, y: 4 }, ascends: true, label: 'Press on down the road' }],
        // Cosmetic terrain paint only (no mechanics): the rutted road runs west
        // to east; a stand of dead trees and hill-shoulders frame it.
        terrain: [
          ...terr(
            'road',
            [0, 4],
            [1, 4],
            [2, 4],
            [3, 4],
            [4, 4],
            [5, 4],
            [6, 4],
            [7, 4],
            [8, 4],
            [9, 4]
          ),
          ...terr('forest', [3, 1], [4, 1], [4, 2], [7, 6], [8, 6]),
          ...terr('hills', [0, 0], [9, 0], [0, 7], [9, 7]),
        ],
      },

      // Shattered Crypt (8 rooms). The regional site drops the party at the
      // entrance; exits chain the dungeon, and the Hidden Passage ascends out.
      {
        id: 'dungeon_crypt_entrance',
        name: 'Crypt Entrance',
        desc: 'Crumbling stone steps lead down. Crude graffiti warns: "Abandon hope." Torch brackets line the walls.',
        canRest: false,
        lighting: 'dim',
        gridWidth: 10,
        gridHeight: 10,
        entryPos: { x: 0, y: 0 },
        exits: [
          {
            pos: { x: 9, y: 0 },
            toRoomId: 'dungeon_antechamber',
            entrancePos: { x: 0, y: 0 },
            label: 'Into the antechamber',
          },
          { pos: { x: 0, y: 9 }, ascends: true, label: 'Climb out to the Old Road' },
        ],
      },
      {
        id: 'dungeon_antechamber',
        name: 'Antechamber',
        desc: 'A vaulted chamber of black stone. Funeral urns line the alcoves, some shattered. Bones litter the floor.',
        lighting: 'dark',
        gridWidth: 10,
        gridHeight: 10,
        entryPos: { x: 0, y: 0 },
        exits: [
          {
            pos: { x: 0, y: 9 },
            toRoomId: 'dungeon_crypt_entrance',
            entrancePos: { x: 9, y: 0 },
            label: 'Back to the entrance',
          },
          {
            pos: { x: 9, y: 0 },
            toRoomId: 'dungeon_charnel_hall',
            entrancePos: { x: 0, y: 0 },
            label: 'Charnel Hall',
          },
          {
            pos: { x: 9, y: 9 },
            toRoomId: 'dungeon_offering_chamber',
            entrancePos: { x: 0, y: 0 },
            label: 'Chamber of Offerings',
          },
        ],
        objects: [
          {
            id: 'funeral_urns',
            name: 'Funeral Urns',
            desc: 'Black ceramic urns sealed with wax. Most are cracked open.',
            interactText: 'You sift through the urns, brushing aside dust and ash.',
            searchable: true,
            searchDC: 10,
            lootIds: ['healing_potion'],
            foundText: 'Beneath the ashes — a small vial wrapped in cloth. A healing potion!',
            emptyText: 'Ashes drift through your fingers. Steady your hand and search again.',
          },
        ],
      },
      {
        id: 'dungeon_charnel_hall',
        name: 'Charnel Hall',
        desc: 'A long corridor flanked by sealed burial niches. The seals on several niches have been broken from within. Loose flagstones in the middle of the hall give you pause.',
        lighting: 'dark',
        gridWidth: 10,
        gridHeight: 10,
        entryPos: { x: 0, y: 0 },
        exits: [
          {
            pos: { x: 0, y: 9 },
            toRoomId: 'dungeon_antechamber',
            entrancePos: { x: 9, y: 0 },
            label: 'Back to the antechamber',
          },
          {
            pos: { x: 9, y: 9 },
            toRoomId: 'dungeon_shadow_gallery',
            entrancePos: { x: 0, y: 0 },
            label: 'Shadow Gallery',
          },
        ],
        trap: {
          id: 'charnel_hall_blade',
          name: 'Hidden Blade Plate',
          desc: 'A subtle depression in the flagstones, connected to a spring-loaded blade in the wall.',
          dc: 13,
          damage: '2d6',
          damageType: 'slashing',
          triggerNarrative:
            'A blade scythes from the niche-wall! {name} takes {dmg} slashing damage.',
          detectNarrative:
            'You notice scoring in the wall opposite a worn flagstone — a blade trap, set to scythe across the corridor.',
          disarmSuccess: 'You wedge a fragment of bone into the mechanism. The blade is jammed.',
          disarmFail: 'You misjudge the angle — the mechanism trips and the blade scythes anyway!',
        },
      },
      {
        id: 'dungeon_offering_chamber',
        name: 'Chamber of Offerings',
        desc: 'An altar to a forgotten death deity stands at the center. Coins and grave goods have been disturbed.',
        lighting: 'dark',
        gridWidth: 10,
        gridHeight: 10,
        entryPos: { x: 0, y: 0 },
        exits: [
          {
            pos: { x: 0, y: 9 },
            toRoomId: 'dungeon_antechamber',
            entrancePos: { x: 9, y: 9 },
            label: 'Back to the antechamber',
          },
          {
            pos: { x: 9, y: 9 },
            toRoomId: 'dungeon_ossuary',
            entrancePos: { x: 0, y: 0 },
            label: 'Ossuary',
          },
        ],
      },
      {
        id: 'dungeon_shadow_gallery',
        name: 'Shadow Gallery',
        desc: 'Torchlight barely penetrates here. Paintings on the wall shift when you look away.',
        lighting: 'dark',
        gridWidth: 10,
        gridHeight: 10,
        entryPos: { x: 0, y: 0 },
        exits: [
          {
            pos: { x: 0, y: 9 },
            toRoomId: 'dungeon_charnel_hall',
            entrancePos: { x: 9, y: 9 },
            label: 'Back to the Charnel Hall',
          },
          {
            pos: { x: 9, y: 9 },
            toRoomId: 'dungeon_crypt_throne',
            entrancePos: { x: 1, y: 1 },
            label: 'Throne of the Dead',
          },
        ],
      },
      {
        id: 'dungeon_ossuary',
        name: 'Ossuary',
        desc: 'Bones are stacked floor to ceiling in ornate patterns. The artistry is almost beautiful.',
        lighting: 'dark',
        gridWidth: 10,
        gridHeight: 10,
        entryPos: { x: 0, y: 0 },
        exits: [
          {
            pos: { x: 0, y: 9 },
            toRoomId: 'dungeon_offering_chamber',
            entrancePos: { x: 9, y: 9 },
            label: 'Back to the Chamber of Offerings',
          },
          {
            pos: { x: 9, y: 9 },
            toRoomId: 'dungeon_crypt_throne',
            entrancePos: { x: 1, y: 1 },
            label: 'Throne of the Dead',
          },
        ],
      },
      {
        id: 'dungeon_crypt_throne',
        name: 'Throne of the Dead',
        desc: 'A massive chamber with a raised dais. An ancient throne of black stone dominates the room. Broken funeral pillars and piles of bone offer fragile cover. Something powerful waits here.',
        lighting: 'dim',
        gridWidth: 10,
        gridHeight: 10,
        // Marker arrives top-left, clear of the mid-room pillars.
        entryPos: { x: 1, y: 1 },
        exits: [
          {
            pos: { x: 0, y: 9 },
            toRoomId: 'dungeon_shadow_gallery',
            entrancePos: { x: 9, y: 9 },
            label: 'Back to the Shadow Gallery',
          },
          {
            pos: { x: 9, y: 0 },
            toRoomId: 'dungeon_ossuary',
            entrancePos: { x: 9, y: 9 },
            label: 'Back to the Ossuary',
          },
          {
            pos: { x: 9, y: 9 },
            toRoomId: 'dungeon_crypt_exit',
            entrancePos: { x: 0, y: 0 },
            label: 'A hidden passage in the dais',
          },
        ],
        // Broken pillars flanking the central approach + bone-rubble corners.
        // PCs spawn at row 1, enemies at row 8 — obstacles cluster mid-room
        // so the boss has to path around and the rogue gets LoS breaks.
        obstacles: [
          { x: 3, y: 4 },
          { x: 7, y: 4 },
          { x: 4, y: 6 },
          { x: 6, y: 6 },
        ],
        // Bone shards underfoot near the dais — slows approach.
        difficultTerrain: [
          { x: 4, y: 5 },
          { x: 5, y: 5 },
          { x: 6, y: 5 },
        ],
      },
      {
        id: 'dungeon_crypt_exit',
        name: 'Hidden Passage',
        desc: 'A narrow shaft cuts upward through the rock, emerging near the crypt entrance above.',
        gridWidth: 8,
        gridHeight: 8,
        entryPos: { x: 0, y: 0 },
        exits: [
          {
            pos: { x: 0, y: 1 },
            toRoomId: 'dungeon_crypt_throne',
            entrancePos: { x: 9, y: 9 },
            label: 'Back down to the throne',
          },
          { pos: { x: 7, y: 7 }, ascends: true, label: 'Climb out to the surface' },
        ],
      },

      // Bandit Camp (a regional site — the raiders behind the missing wagons).
      {
        id: 'bandit_camp',
        name: 'Bandit Camp',
        desc: 'A clearing ringed with crude tents and a smoldering cookfire. A half-stripped merchant wagon lists against a stump, Guild crates scattered around it. Lookouts turn at your approach.',
        lighting: 'dim',
        gridWidth: 10,
        gridHeight: 10,
        entryPos: { x: 0, y: 0 },
        exits: [
          {
            pos: { x: 9, y: 9 },
            toRoomId: 'bandit_tent',
            entrancePos: { x: 0, y: 0 },
            label: "The Captain's Tent",
          },
          { pos: { x: 0, y: 9 }, ascends: true, label: 'Leave the camp' },
        ],
      },
      {
        id: 'bandit_tent',
        name: "Captain's Tent",
        desc: "A larger oilcloth tent at the camp's heart. A war-map and a strongbox sit on a crate table. The Bandit Captain rises, hand on hilt.",
        lighting: 'dim',
        canRest: false,
        gridWidth: 8,
        gridHeight: 8,
        entryPos: { x: 0, y: 0 },
        exits: [
          {
            pos: { x: 7, y: 7 },
            toRoomId: 'bandit_camp',
            entrancePos: { x: 9, y: 9 },
            label: 'Back out to the camp',
          },
        ],
      },
    ],

    // Navigation is by the marker + room `exits` (3-level map), so the old
    // room-adjacency graph is intentionally empty.

    // Enemy placements (roomId → Enemy[])
    enemies: {
      dungeon_antechamber: [
        {
          id: 'dungeon_antechamber#0',
          name: 'Skeleton Warrior',
          hp: 13,
          ac: 13,
          damage: '1d6+2',
          toHit: 4,
          xp: 50,
          resistances: ['piercing'],
          vulnerabilities: ['bludgeoning'],
          immunities: ['poison'],
          condition_immunities: ['poisoned', 'exhaustion'],
          goldDrop: 3,
        },
      ],
      dungeon_charnel_hall: [
        {
          id: 'dungeon_charnel_hall#0',
          name: 'Skeleton Warrior',
          hp: 13,
          ac: 13,
          damage: '1d6+2',
          toHit: 4,
          xp: 50,
          resistances: ['piercing'],
          vulnerabilities: ['bludgeoning'],
          immunities: ['poison'],
          condition_immunities: ['poisoned', 'exhaustion'],
          goldDrop: 3,
        },
        {
          id: 'dungeon_charnel_hall#1',
          name: 'Skeleton Warrior',
          hp: 13,
          ac: 13,
          damage: '1d6+2',
          toHit: 4,
          xp: 50,
          resistances: ['piercing'],
          vulnerabilities: ['bludgeoning'],
          immunities: ['poison'],
          condition_immunities: ['poisoned', 'exhaustion'],
          goldDrop: 3,
        },
      ],
      dungeon_offering_chamber: [
        {
          id: 'dungeon_offering_chamber#0',
          name: 'Crypt Ghoul',
          hp: 22,
          ac: 13,
          damage: '2d6+2',
          toHit: 4,
          xp: 200,
          onHitEffect: { condition: 'paralyzed', ability: 'con', dc: 10 },
          condition_immunities: ['poisoned', 'charmed'],
          goldDrop: 8,
        },
      ],
      dungeon_shadow_gallery: [
        {
          id: 'dungeon_shadow_gallery#0',
          name: 'Shadow',
          hp: 16,
          ac: 12,
          damage: '2d6+2',
          toHit: 4,
          xp: 100,
          resistances: [
            'acid',
            'fire',
            'thunder',
            'lightning',
            'cold',
            'bludgeoning',
            'piercing',
            'slashing',
          ],
          immunities: ['necrotic', 'poison'],
          condition_immunities: [
            'exhaustion',
            'frightened',
            'grappled',
            'paralyzed',
            'petrified',
            'poisoned',
            'prone',
            'restrained',
          ],
        },
      ],
      dungeon_ossuary: [
        {
          id: 'dungeon_ossuary#0',
          name: 'Crypt Ghoul',
          hp: 22,
          ac: 13,
          damage: '2d6+2',
          toHit: 4,
          xp: 200,
          onHitEffect: { condition: 'paralyzed', ability: 'con', dc: 10 },
          condition_immunities: ['poisoned', 'charmed'],
          goldDrop: 8,
        },
      ],
      dungeon_crypt_throne: [
        { ...CRYPT_LORD_BASE, id: 'dungeon_crypt_throne#0' },
        // Boss-room minion. A single Skeleton Warrior flanks the Crypt Lord
        // — two was over-tuned for an L4 party of 3 (the boss alone deals
        // 3× 2d6+4 with frighten-on-hit; adding two minions made the math
        // unwinnable). One minion still gives the fight texture.
        {
          id: 'dungeon_crypt_throne#minion_a',
          name: 'Skeleton Warrior',
          hp: 13,
          ac: 13,
          damage: '1d6+2',
          toHit: 4,
          xp: 50,
          resistances: ['piercing'],
          vulnerabilities: ['bludgeoning'],
          immunities: ['poison'],
          condition_immunities: ['poisoned', 'exhaustion'],
          goldDrop: 3,
        },
      ],
      road_north: [
        {
          id: 'road_north#0',
          name: 'Bandit Ruffian',
          hp: 11,
          ac: 12,
          damage: '1d6+1',
          toHit: 3,
          xp: 25,
          goldDrop: 8,
          drops: ['dagger'],
        },
        {
          id: 'road_north#1',
          name: 'Bandit Ruffian',
          hp: 11,
          ac: 12,
          damage: '1d6+1',
          toHit: 3,
          xp: 25,
          goldDrop: 8,
          drops: ['dagger'],
        },
      ],

      // Bandit camp — a three-ruffian skirmish, then the Captain + a guard.
      bandit_camp: [
        {
          id: 'bandit_camp#0',
          name: 'Bandit Ruffian',
          hp: 11,
          ac: 12,
          damage: '1d6+1',
          toHit: 3,
          xp: 25,
          goldDrop: 9,
          drops: ['dagger'],
        },
        {
          id: 'bandit_camp#1',
          name: 'Bandit Ruffian',
          hp: 11,
          ac: 12,
          damage: '1d6+1',
          toHit: 3,
          xp: 25,
          goldDrop: 9,
          drops: ['dagger'],
        },
        {
          id: 'bandit_camp#2',
          name: 'Bandit Bowman',
          hp: 11,
          ac: 13,
          damage: '1d8+1',
          toHit: 4,
          xp: 50,
          attackReachFt: 80,
          goldDrop: 10,
          drops: ['shortsword'],
        },
      ],
      bandit_tent: [
        {
          // Sub-boss: the raid leader on Captain Vane's payroll. Multiattack +
          // solid HP make this a step up from the road skirmishers, but well
          // short of the Crypt Lord — a mid-campaign spike.
          id: 'bandit_tent#0',
          name: 'Bandit Captain',
          hp: 52,
          ac: 15,
          damage: '1d8+3',
          toHit: 5,
          xp: 450,
          str: 15,
          dex: 16,
          con: 14,
          multiattack: 2,
          goldDrop: 60,
          drops: ['studded_leather', 'healing_potion'],
        },
        {
          id: 'bandit_tent#1',
          name: 'Bandit Ruffian',
          hp: 11,
          ac: 12,
          damage: '1d6+1',
          toHit: 3,
          xp: 25,
          goldDrop: 9,
          drops: ['dagger'],
        },
      ],
    },

    // Loot placements
    loot: {
      dungeon_antechamber: {
        id: 'healing_potion',
        name: 'Healing Potion',
        weight: 4,
        desc: 'A crimson vial.',
        type: 'consumable',
        slot: null,
        damage: null,
        ac_bonus: null,
        heal: '2d4+2',
        effect: null,
        aliases: ['potion'],
      },
      dungeon_offering_chamber: {
        id: 'guild_ledger',
        name: 'Guild Ledger',
        weight: 3,
        desc: "A waterlogged ledger bearing the Guild's stamp.",
        type: 'misc',
        slot: null,
        damage: null,
        ac_bonus: null,
        heal: null,
        effect: null,
        aliases: ['ledger'],
      },
      dungeon_ossuary: {
        id: 'healing_potion',
        name: 'Healing Potion',
        weight: 4,
        desc: 'A crimson vial.',
        type: 'consumable',
        slot: null,
        damage: null,
        ac_bonus: null,
        heal: '2d4+2',
        effect: null,
        aliases: ['potion'],
      },
      dungeon_crypt_throne: {
        id: 'moonstone_amulet',
        name: 'Moonstone Amulet',
        weight: 2,
        desc: 'A glowing moonstone amulet, sacred to Selûne.',
        type: 'misc',
        slot: null,
        damage: null,
        ac_bonus: null,
        heal: null,
        effect: '+1_wis_save',
        requiresAttunement: true,
        aliases: ['amulet'],
      },
      bandit_camp: {
        id: 'healing_potion',
        name: 'Healing Potion',
        weight: 4,
        desc: 'A crimson vial, looted from the wagon.',
        type: 'consumable',
        slot: null,
        damage: null,
        ac_bonus: null,
        heal: '2d4+2',
        effect: null,
        aliases: ['potion'],
      },
      bandit_tent: {
        id: 'stolen_shipment',
        name: 'Stolen Guild Cargo',
        weight: 6,
        desc: "A crate stamped with the Merchant Guild's mark — the raided Old Road shipment.",
        type: 'misc',
        slot: null,
        damage: null,
        ac_bonus: null,
        heal: null,
        effect: null,
        aliases: ['cargo', 'crate', 'shipment', 'goods'],
      },
    },

    // Author-placed NPCs. Templates above live in `npcTemplates`; these entries
    // bind them to specific rooms in the campaign. Without this, the engine's
    // seed.npcs[roomId] lookup would return undefined and nothing would talk
    // to the player.
    npcs: {
      millhaven_market: {
        roomId: 'millhaven_market',
        id: 'npc_aldric',
        name: 'Aldric the Merchant',
        attitude: 'friendly',
        factionId: 'faction_guild',
        hp: 4,
        ac: 10,
        damage: '1d4',
        toHit: 0,
        xp: 0,
        greeting:
          "Thank the gods — capable folk! Two of our supply wagons vanished on the Old Road three days past. I'll pay well for anyone who finds what happened to them and recovers the shipping ledger.",
        responses: [
          {
            label: "I'll look into the missing shipment.",
            reply:
              'Wonderful! The ledger would prove our goods were never delivered — the Guild needs it to claim compensation.',
            consequences: [
              { type: 'advance_quest', questId: 'quest_shipment', stepId: 'step_talk_aldric' },
            ],
          },
          {
            label: 'What do you know about the crypt?',
            reply:
              'Nothing good. Locals avoid it. Word is, something stirs within — lights at night, groaning sounds.',
          },
          {
            label: "I'll need supplies.",
            reply: 'Of course. Browse what I have — Guild members get a fair price.',
          },
        ],
        persuasionDC: 12,
        shop: [{ itemId: 'healing_potion', price: 50 }],
      },
      millhaven_temple: {
        roomId: 'millhaven_temple',
        id: 'npc_sister_maren',
        name: 'Sister Maren',
        attitude: 'friendly',
        hp: 8,
        ac: 11,
        damage: '1d4',
        toHit: 2,
        xp: 0,
        greeting:
          "Selûne's blessing upon you, traveler. The crypt to the north — something evil has taken root there. I need brave souls to descend and cleanse it.",
        responses: [
          {
            label: 'Tell me about the crypt.',
            reply:
              'It is the Shattered Crypt. A lich was sealed within long ago. The Crypt Lord must be destroyed.',
            consequences: [
              { type: 'advance_quest', questId: 'quest_crypt', stepId: 'step_learn_crypt' },
            ],
            // A nested branch — these follow-ups open a sub-conversation (with a
            // Back option) rather than cluttering the top-level dialogue.
            responses: [
              {
                label: 'Who was the lich in life?',
                reply:
                  'A noble of the Third Age who bargained with death to outlive his line. The bargain kept his body — not his soul.',
              },
              {
                label: 'How do I destroy it?',
                reply:
                  "Strike down its body and the phylactery shatters with it. Bring radiance — the dead fear Selûne's light.",
              },
            ],
          },
          {
            label: 'I will clear the crypt.',
            reply: 'Bless you. The moonstone amulet within is sacred to Selûne — please return it.',
            consequences: [
              { type: 'advance_quest', questId: 'quest_crypt', stepId: 'step_learn_crypt' },
            ],
          },
          {
            label: 'Can you heal my wounds?',
            reply: 'For a small donation to the temple, yes.',
            consequences: [{ type: 'modify_hp', amount: 8 }],
          },
        ],
        persuasionDC: 10,
      },
      millhaven_slums: {
        roomId: 'millhaven_slums',
        id: 'npc_dusk',
        name: 'Dusk',
        attitude: 'indifferent',
        hp: 14,
        ac: 13,
        damage: '1d6+2',
        toHit: 4,
        xp: 0,
        greeting:
          "Eyes down, stranger. If it's trouble with the Watch, we might have common cause.",
        responses: [
          {
            label: 'Tell me about the City Watch.',
            reply:
              "Captain Vane's rotten from the boots up. I have proof — or I will, if you can get into his office.",
            consequences: [
              { type: 'advance_quest', questId: 'quest_shadow', stepId: 'step_meet_dusk' },
            ],
          },
          {
            label: 'What do you need me to do?',
            reply: 'Vane keeps a letter in his strongbox at the garrison. Bring it to me.',
            consequences: [
              { type: 'advance_quest', questId: 'quest_shadow', stepId: 'step_meet_dusk' },
            ],
          },
          {
            label: 'Not interested.',
            reply: "Your loss. Don't say I didn't offer.",
          },
        ],
        persuasionDC: 14,
      },
    },

    startingLoot: ['healing_potion'],

    // ─── 3-level grid map (regional → town → local) ───────────────────────────
    // The party starts on the regional grid as a single marker (see
    // initMapState). Sites open a town (Millhaven) or drop the party into a
    // local site (the Old Road skirmish, the Bandit Camp, the Shattered Crypt).
    // Wandering the road risks a per-square Bandit Ruffian ambush.

    regions: [
      {
        id: 'vale_region',
        name: 'Duskenvale',
        desc: 'The borderland of Duskenvale — a shadowed vale of old tombs, the frozen pass beneath the Iceshard Spire, and the silent grove beyond Pinegate, all ringed by pine-dark hills.',
        feetPerSquare: 5280, // 1 square = 1 mile (SRD Travel Pace scale)
        gridWidth: 12,
        gridHeight: 8,
        startPos: { x: 0, y: 7 }, // the southern road, bottom-left of the vale
        // A linear horseshoe: the party starts bottom-left, a frozen sea floods
        // in from the west across the middle (impassable), so they must arc
        // EAST along the southern road, up the open eastern lane, then WEST
        // across the top into the snowy frozen north (the Frozen Pass + Iceshard
        // Spire). Passability / travel time / encounter rate all derive from
        // terrain type; unlisted cells are plains.
        terrain: [
          // The sea pushing in from the west edge, covering the middle and
          // blocking any straight northern route — the reason the road arcs east.
          // Its eastern edge reaches x7 and its southern shore comes down to y6,
          // right up against the y7 road; the start, road tiles, and Silent Grove
          // (6,6) stay clear so the arc still works.
          ...terr('water', [0, 2], [1, 2], [2, 2], [3, 2]),
          ...terr('water', [0, 3], [1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [7, 3]),
          ...terr('water', [0, 4], [1, 4], [2, 4], [3, 4], [4, 4], [5, 4], [6, 4], [7, 4]),
          ...terr('water', [0, 5], [1, 5], [2, 5], [3, 5], [4, 5], [5, 5]),
          ...terr('water', [0, 6], [1, 6], [2, 6], [3, 6]),
          // The southern road from the start east past the early sites.
          ...terr('road', [2, 7], [4, 7], [6, 7], [7, 7], [8, 7], [9, 7], [10, 7]),
          // Snowy frozen north (top band) — the Frozen Pass + Iceshard Spire sit
          // in it; a couple of impassable peaks give the Spire its teeth.
          ...terr('snow', [0, 0], [1, 0], [4, 0], [5, 0], [7, 0]),
          ...terr('snow', [0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1]),
          ...terr('mountain', [2, 0], [3, 0], [6, 0]),
          // Hilly approach to the frozen north on the east shoulder.
          ...terr('hills', [8, 0], [9, 0], [10, 0], [10, 1], [11, 1]),
          // Woods along the south-east.
          ...terr('forest', [7, 6], [8, 6], [9, 6], [8, 5], [9, 5]),
        ],
        sites: [
          {
            id: 'site_millhaven',
            name: 'Millhaven',
            pos: { x: 1, y: 7 }, // hub town, by the start
            kind: 'town',
            townId: 'millhaven_town',
          },
          {
            id: 'site_old_road',
            name: 'The Old Road',
            pos: { x: 3, y: 7 }, // early, along the southern road
            kind: 'local',
            entryRoomId: 'road_north',
          },
          {
            id: 'site_bandit_camp',
            name: 'Bandit Camp',
            pos: { x: 10, y: 4 }, // up the eastern lane
            kind: 'local',
            entryRoomId: 'bandit_camp',
          },
          {
            id: 'site_crypt',
            name: 'Shattered Crypt',
            pos: { x: 10, y: 3 }, // up the eastern lane
            kind: 'local',
            entryRoomId: 'dungeon_crypt_entrance',
          },
        ],
        encounterTable: ['Bandit Ruffian'],
        encounterChance: 0.1, // per mile-square crossed
      },
    ],

    towns: [
      {
        id: 'millhaven_town',
        name: 'Millhaven',
        desc: "A market town at the vale's edge — temple, guild market, lantern-lit slums, and the Watch garrison.",
        feetPerSquare: 25, // settlement scale
        gridWidth: 8,
        gridHeight: 8,
        startPos: { x: 4, y: 6 }, // just inside the gate
        venues: [
          {
            id: 'venue_temple',
            name: 'Temple of Selûne',
            pos: { x: 1, y: 2 },
            kind: 'interior',
            entryRoomId: 'millhaven_temple',
          },
          {
            id: 'venue_market',
            name: 'Merchant District',
            pos: { x: 6, y: 2 },
            kind: 'interior',
            entryRoomId: 'millhaven_market',
          },
          {
            id: 'venue_lantern',
            name: 'Lantern District',
            pos: { x: 1, y: 5 },
            kind: 'interior',
            entryRoomId: 'millhaven_slums',
          },
          {
            id: 'venue_garrison',
            name: 'Garrison Office',
            pos: { x: 6, y: 5 },
            kind: 'interior',
            entryRoomId: 'millhaven_garrison',
          },
          { id: 'venue_gate', name: 'Town Gate', pos: { x: 4, y: 7 }, kind: 'gate' },
        ],
      },
    ],

    // ─── Quests ─────────────────────────────────────────────────────────────────

    quests: [
      {
        id: 'quest_shipment',
        title: 'The Missing Shipment',
        desc: "The Merchant Guild's supply wagons vanished on the Old Road. Find the Guild Ledger in the crypt and return it to Aldric.",
        startActive: true, // the Vale's opening quest — active from the start
        giverNpcId: 'npc_aldric',
        factionId: 'faction_guild',
        repGain: 20,
        steps: [
          {
            id: 'step_talk_aldric',
            desc: 'Speak with Aldric the Merchant to learn about the missing shipment.',
            // Scoped to Aldric's room so a talk_response in any other room
            // doesn't auto-accept this quest under the new auto-acceptance
            // model. The any-of inside still matches both the new
            // talk_response path and the legacy accept_quest action.
            condition: {
              all: [
                { fact: 'room_id', operator: 'equal', value: 'millhaven_market' },
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
            id: 'step_find_ledger',
            desc: 'Find the Guild Ledger in the Shattered Crypt.',
            condition: {
              all: [{ fact: 'loot_taken', operator: 'contains', value: 'guild_ledger' }],
            },
          },
          {
            id: 'step_return_ledger',
            desc: 'Return the ledger to Aldric in the Merchant District.',
            // 3-level map: "back in Millhaven" is now "in Aldric's venue room"
            // (the old location_id fact is retired with the Location model).
            condition: {
              all: [
                { fact: 'loot_taken', operator: 'contains', value: 'guild_ledger' },
                { fact: 'room_id', operator: 'equal', value: 'millhaven_market' },
              ],
            },
          },
        ],
        rewards: [
          {
            type: 'add_narrative',
            text: 'Aldric leafs through the waterlogged pages. "This is it — proof the wagons were never delivered." He presses a purse into your hand and marks the Guild\'s books with your name.',
          },
          { type: 'consume_item', itemId: 'guild_ledger' },
          { type: 'give_gold', amount: 150 },
          { type: 'give_xp', amount: 300 },
          // Faction rep is bumped by the quest's `repGain` field above;
          // we surface a narrative line in route/game.ts when that fires.
        ],
      },
      {
        id: 'quest_crypt',
        title: 'Beneath the Surface',
        desc: 'Sister Maren of the Temple of Selûne needs the Crypt Lord destroyed and the Moonstone Amulet recovered.',
        giverNpcId: 'npc_sister_maren',
        factionId: 'faction_guild',
        repGain: 0,
        steps: [
          {
            id: 'step_learn_crypt',
            desc: 'Learn about the threat in the Shattered Crypt from Sister Maren.',
            condition: {
              all: [
                { fact: 'room_id', operator: 'equal', value: 'millhaven_temple' },
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
            id: 'step_kill_lord',
            desc: 'Defeat the Crypt Lord in the Throne of the Dead.',
            condition: {
              all: [
                {
                  fact: 'enemies_killed',
                  operator: 'contains',
                  value: 'dungeon_crypt_throne#0',
                },
              ],
            },
          },
          {
            id: 'step_recover_amulet',
            desc: 'Recover the Moonstone Amulet from the crypt.',
            condition: {
              all: [{ fact: 'loot_taken', operator: 'contains', value: 'moonstone_amulet' }],
            },
          },
        ],
        rewards: [
          { type: 'give_gold', amount: 200 },
          { type: 'give_xp', amount: 1500 },
          { type: 'modify_hp', amount: 20 },
          {
            type: 'add_narrative',
            text: 'Sister Maren places her hands on your shoulders and speaks a blessing of Selûne. You feel wounds close and strength return.',
          },
        ],
      },
      {
        id: 'quest_shadow',
        title: 'Shadow Dealings',
        desc: 'Dusk in the Lantern District has evidence that Captain Vane is corrupt. Find the incriminating letter in the garrison strongbox.',
        giverNpcId: 'npc_dusk',
        factionId: 'faction_watch',
        repGain: -10,
        steps: [
          {
            id: 'step_meet_dusk',
            desc: 'Meet Dusk in the Lantern District.',
            condition: {
              all: [
                { fact: 'room_id', operator: 'equal', value: 'millhaven_slums' },
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
            id: 'step_find_letter',
            desc: 'Retrieve the incriminating letter from the garrison.',
            condition: {
              all: [{ fact: 'loot_taken', operator: 'contains', value: 'shadow_evidence' }],
            },
          },
          {
            id: 'step_deliver_letter',
            desc: 'Deliver the letter to Dusk.',
            condition: {
              all: [
                { fact: 'loot_taken', operator: 'contains', value: 'shadow_evidence' },
                { fact: 'room_id', operator: 'equal', value: 'millhaven_slums' },
              ],
            },
          },
        ],
        rewards: [
          { type: 'give_gold', amount: 75 },
          { type: 'give_xp', amount: 200 },
          // Faction rep penalty is applied via `repGain: -10` above;
          // route surfaces the narrative line. Don't duplicate via a
          // set_faction_rep reward (would double-count).
          {
            type: 'add_narrative',
            text: 'Dusk takes the letter with a tight smile. "Captain Vane\'s days are numbered. You\'ve made some useful friends today."',
          },
        ],
      },
    ],

    // ─── Factions ────────────────────────────────────────────────────────────────

    factions: [
      {
        id: 'faction_guild',
        name: 'Merchant Guild',
        thresholds: { hostile: -50, unfriendly: -10, neutral: 0, friendly: 20, exalted: 60 },
        shopPriceModifiers: {
          hostile: 1.5,
          unfriendly: 1.2,
          neutral: 1.0,
          friendly: 0.9,
          exalted: 0.75,
        },
      },
      {
        id: 'faction_watch',
        name: 'City Watch',
        thresholds: { hostile: -50, unfriendly: -10, neutral: 0, friendly: 20, exalted: 60 },
        shopPriceModifiers: {
          hostile: 1.0,
          unfriendly: 1.0,
          neutral: 1.0,
          friendly: 1.0,
          exalted: 1.0,
        },
      },
    ],
  },

  // ─── Spell table ──────────────────────────────────────────────────────────────

  spellTable: { ...SRD_SPELLS },
  featTable: { ...SRD_FEATS },

  classSpells: {
    Cleric: [
      'sacred_flame',
      'cure_wounds',
      'guiding_bolt',
      'hold_person',
      'bless',
      'spiritual_weapon',
      'healing_word',
      'animate_dead',
    ],
    Wizard: [
      'fire_bolt',
      'magic_missile',
      'hold_person',
      'thunderwave',
      'misty_step',
      'fireball',
      'animate_dead',
    ],
    Paladin: ['divine_smite_spell', 'cure_wounds', 'bless'],
    Bard: ['bardic_inspiration_spell', 'cure_wounds', 'healing_word', 'charm_person', 'sleep'],
    Druid: ['shillelagh', 'entangle', 'cure_wounds', 'healing_word'],
    Sorcerer: ['fire_bolt', 'sleep', 'burning_hands', 'misty_step', 'fireball'],
    Warlock: ['eldritch_blast', 'hex', 'charm_person'],
  },

  // ─── Game rules (script engine) ──────────────────────────────────────────────

  rules: [
    {
      name: 'guild_ledger_found',
      once: true,
      priority: 5,
      conditions: {
        all: [
          { fact: 'loot_taken', operator: 'contains', value: 'guild_ledger' },
          { fact: 'flags', operator: 'doesNotContain', value: 'rule_fired_guild_ledger_found' },
        ],
      },
      consequences: [
        { type: 'advance_quest', questId: 'quest_shipment', stepId: 'step_find_ledger' },
        {
          type: 'add_narrative',
          text: "You recognise the Guild's stamp on the waterlogged ledger — this is what Aldric was looking for.",
        },
      ],
    },
  ],
};

// ── Folded-in campaigns ──────────────────────────────────────────────────────
// Whispering Pines (and Grove of Thorns) are no longer standalone campaigns —
// their content is folded into the Vale as additional areas of the same world,
// reached via new sites on the regional map. Their data modules live under
// contexts/folded/ (the context loader only scans top-level files in
// contexts/, so the folded modules aren't registered as separate campaigns).
//
// Each fold appends the campaign's enemy templates, loot, NPC templates, rules,
// rooms, NPCs, towns, quests, and factions onto the Vale, and drops new sites
// onto the Vale's regional map that lead into the folded content. IDs are
// already disjoint between campaigns (only `venue_gate` is renamed per town);
// the opening-quest flag is stripped in the folded module so the Vale's own
// "Missing Shipment" stays the sole starter and the others are discovered on
// arrival.
function foldCampaign(into: Context, content: Context, sites: MapSite[], dropRooms: string[] = []) {
  const intoCamp = into.campaign!;
  const fromCamp = content.campaign!;
  const lootIds = new Set(into.lootTable.map((i) => i.id));
  into.enemyTemplates.push(...content.enemyTemplates);
  into.lootTable.push(...content.lootTable.filter((i) => !lootIds.has(i.id)));
  (into.npcTemplates ??= []).push(...(content.npcTemplates ?? []));
  (into.rules ??= []).push(...(content.rules ?? []));
  const drop = new Set(dropRooms);
  intoCamp.rooms.push(...fromCamp.rooms.filter((r) => !drop.has(r.id)));
  intoCamp.npcs = { ...(intoCamp.npcs ?? {}), ...(fromCamp.npcs ?? {}) };
  // Per-room enemy + loot placement maps (keyed by room id, disjoint across
  // campaigns) — generateSeed reads these to populate the run seed.
  intoCamp.enemies = { ...(intoCamp.enemies ?? {}), ...(fromCamp.enemies ?? {}) };
  intoCamp.loot = { ...(intoCamp.loot ?? {}), ...(fromCamp.loot ?? {}) };
  (intoCamp.towns ??= []).push(...(fromCamp.towns ?? []));
  (intoCamp.quests ??= []).push(...(fromCamp.quests ?? []));
  (intoCamp.factions ??= []).push(...(fromCamp.factions ?? []));
  const region = intoCamp.regions![0];
  region.sites.push(...sites);
  region.encounterTable = [
    ...(region.encounterTable ?? []),
    ...(fromCamp.regions?.[0]?.encounterTable ?? []),
  ];
}

// Whispering Pines — three new sites on the Vale's 12×8 regional map (clear of
// the obstacles {6,6},{7,6} and the existing Vale sites). The town opens the
// Pines village; the local sites drop into the frozen pass and the Iceshard
// Spire. The old WP `pines_square` start-frame room is unreachable here.
foldCampaign(
  context,
  whisperingPinesContent,
  [
    {
      id: 'site_pines',
      name: 'Whispering Pines',
      pos: { x: 9, y: 1 }, // gateway town into the frozen north
      kind: 'town',
      townId: 'pines_village',
    },
    {
      id: 'site_pass',
      name: 'The Frozen Pass',
      pos: { x: 5, y: 1 }, // snowy north, on the way west to the Spire
      kind: 'local',
      entryRoomId: 'pass_climb',
    },
    {
      id: 'site_spire',
      name: 'Iceshard Spire',
      pos: { x: 1, y: 0 }, // climax, the frozen NW corner
      kind: 'local',
      entryRoomId: 'spire_entrance',
    },
  ],
  ['pines_square']
);

// Grove of Thorns — Pinegate village + the Silent Grove, on free Vale-grid
// cells. pinegate_square is kept (it's the village-square venue interior, not
// just a start frame), so no rooms are dropped here.
foldCampaign(context, groveContent, [
  {
    id: 'site_pinegate',
    name: 'Pinegate',
    pos: { x: 5, y: 7 }, // early, along the southern road
    kind: 'town',
    townId: 'pinegate_town',
  },
  {
    id: 'site_grove',
    name: 'The Silent Grove',
    pos: { x: 6, y: 6 }, // just off the road, south-centre
    kind: 'local',
    entryRoomId: 'thornwater_bridge',
  },
]);

export { context };
