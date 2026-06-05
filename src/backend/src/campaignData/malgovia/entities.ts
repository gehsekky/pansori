import type { Enemy, EnemyTemplate, PlacedNpc } from '../../types.js';
import { SRD_MONSTERS } from '../srd/index.js';

// Build a per-room placement from a shared template: spread the base stat
// block, apply the room-specific overrides (id, goldDrop, drops, tweaked
// hp, etc.), then drop any key set to `undefined`. Setting a key to
// `undefined` in the override is how a placement opts OUT of a base field it
// historically never carried (e.g. SRD ability scores on a minion), keeping
// the assembled data identical to the hand-written placements it replaces.
function place(base: EnemyTemplate, overrides: Partial<EnemyTemplate> & { id: string }): Enemy {
  const merged: Record<string, unknown> = { ...base, ...overrides };
  for (const key of Object.keys(merged)) {
    if (merged[key] === undefined) delete merged[key];
  }
  return merged as unknown as Enemy;
}

// Shared Crypt Lord stat block. Used both as the `enemyTemplates` entry and
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

// SRD skeleton with a sword + tomb-themed name. Piercing resist
// because they're already bony, slashing dmg from the longsword.
const SKELETON_WARRIOR_BASE: EnemyTemplate = {
  ...SRD_MONSTERS.skeleton,
  name: 'Skeleton Warrior',
  resistances: ['piercing'],
  damageType: 'slashing',
};

// SRD ghoul reskinned as a crypt-dweller.
const CRYPT_GHOUL_BASE: EnemyTemplate = { ...SRD_MONSTERS.ghoul, name: 'Crypt Ghoul' };

// SRD bandit renamed for the local Lantern District flavor.
const BANDIT_RUFFIAN_BASE: EnemyTemplate = { ...SRD_MONSTERS.bandit, name: 'Bandit Ruffian' };

// SRD wolf with a cold-resist coat.
const FROST_WOLF_BASE: EnemyTemplate = {
  ...SRD_MONSTERS.wolf,
  name: 'Frost Wolf',
  // Endgame pack hunter (the frozen north is the late-game tier): bigger and
  // faster than a wild wolf, with a frostbite bite.
  cr: 2,
  hp: 36,
  ac: 14,
  damage: '2d6+2',
  toHit: 5,
  xp: 450,
  bonusDamage: '1d4',
  bonusDamageType: 'cold',
  resistances: ['cold'],
};

const FROST_CULTIST_BASE: EnemyTemplate = {
  name: 'Frost Cultist',
  // Endgame mook — Malgovia's ice realm is the late-game tier, so the spire's
  // rank-and-file hit harder than the beginner grove / mid crypt fodder.
  cr: 1,
  hp: 32,
  ac: 13,
  damage: '1d8+3',
  toHit: 5,
  xp: 200,
  str: 11,
  dex: 12,
  con: 12,
  int: 10,
  wis: 13,
  cha: 11,
  resistances: ['cold'],
  damageType: 'cold',
};

const FROST_ACOLYTE_BASE: EnemyTemplate = {
  name: 'Frost Acolyte',
  // ENDGAME boss — the Iceshard Spire is Malgovia's final tier, so this fight
  // outweighs the mid-tier Crypt Lord (base 97). An Ice Mage: vulnerable to fire
  // to reward Burning Hands / Fire Bolt parties; multiattack of 2; paralyzing
  // onHitEffect leans on the SRD STR/DEX auto-fail rule from §9.2.
  cr: 7,
  hp: 130,
  ac: 15,
  damage: '2d6+4',
  toHit: 7,
  xp: 2900,
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
  onHitEffect: { condition: 'paralyzed', ability: 'con', dc: 14 },
  damageType: 'cold',
  // Spell-caster — the Acolyte sometimes hurls fire_bolt instead of
  // melee, opening a Counterspell window for any L5+ caster in the party.
  spells: ['fire_bolt'],
  castChance: 0.4,
  spellAttackBonus: 7,
  spellSaveDC: 15,
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
        { kind: 'set_damage', dice: '2d10+4' },
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
          effect: { condition: 'paralyzed', ability: 'con', dc: 16 },
        },
      ],
    },
  ],
};

// SRD wolf, magically awakened — int 10 (vs base 3) + stronger bite
// (2d4+2 vs 1d6+1). Reads as a wolf that thinks like a person.
const AWAKENED_WOLF_BASE: EnemyTemplate = {
  ...SRD_MONSTERS.wolf,
  name: 'Awakened Wolf',
  damage: '2d4+2',
  int: 10,
};

// Right-sized as the climax of the Silent Grove — a starter quest for a level-1
// party. NOTE: room enemies are HP-scaled ×(0.5 + partySize·0.5) at seed time,
// so a 4-PC party faces ~2.5× these numbers (hp 18 → ~45). A single attack +
// the charm rider keeps it threatening but winnable for four level-1 heroes.
const FEY_TRICKSTER_BASE: EnemyTemplate = {
  name: 'Fey Trickster',
  cr: 2,
  hp: 18,
  ac: 13,
  damage: '1d6+2',
  toHit: 4,
  xp: 450,
  str: 10,
  dex: 16,
  con: 12,
  int: 14,
  wis: 13,
  cha: 16,
  // Charms instead of paralyzes — boss flavor: it's not killing you, it's
  // seducing you into the grove. Its one melee touch carries the charm rider.
  // (Hex is dropped: enemy spellcasting only resolves damage spells, so the
  // Trickster's debuff spell never fired — the charm IS its signature now.)
  onHitEffect: { condition: 'charmed', ability: 'wis', dc: 12 },
  damageType: 'piercing',
};

export const enemyTemplates: EnemyTemplate[] = [
  SKELETON_WARRIOR_BASE,
  CRYPT_GHOUL_BASE,
  // SRD shadow — already themed for this campaign.
  SRD_MONSTERS.shadow,
  BANDIT_RUFFIAN_BASE,
  CRYPT_LORD_BASE,

  // ── Whispering Pines (folded) ────────────────────────────────────────────
  FROST_WOLF_BASE,
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
  FROST_CULTIST_BASE,
  FROST_ACOLYTE_BASE,

  // ── Grove of Thorns (folded) ─────────────────────────────────────────────
  AWAKENED_WOLF_BASE,
  // Pure SRD entries — already themed for a fey grove.
  SRD_MONSTERS.giant_spider,
  SRD_MONSTERS.brown_bear,
  FEY_TRICKSTER_BASE,
];

export const enemies: Record<string, Enemy[]> = {
  dungeon_antechamber: [
    place(SKELETON_WARRIOR_BASE, {
      id: 'dungeon_antechamber#0',
      goldDrop: 3,
      cr: undefined,
      str: undefined,
      dex: undefined,
      con: undefined,
      int: undefined,
      wis: undefined,
      cha: undefined,
      damageType: undefined,
    }),
  ],
  dungeon_charnel_hall: [
    place(SKELETON_WARRIOR_BASE, {
      id: 'dungeon_charnel_hall#0',
      goldDrop: 3,
      cr: undefined,
      str: undefined,
      dex: undefined,
      con: undefined,
      int: undefined,
      wis: undefined,
      cha: undefined,
      damageType: undefined,
    }),
    place(SKELETON_WARRIOR_BASE, {
      id: 'dungeon_charnel_hall#1',
      goldDrop: 3,
      cr: undefined,
      str: undefined,
      dex: undefined,
      con: undefined,
      int: undefined,
      wis: undefined,
      cha: undefined,
      damageType: undefined,
    }),
  ],
  dungeon_offering_chamber: [
    place(CRYPT_GHOUL_BASE, {
      id: 'dungeon_offering_chamber#0',
      goldDrop: 8,
      cr: undefined,
      str: undefined,
      dex: undefined,
      con: undefined,
      int: undefined,
      wis: undefined,
      cha: undefined,
      damageType: undefined,
    }),
  ],
  dungeon_shadow_gallery: [
    place(SRD_MONSTERS.shadow, {
      id: 'dungeon_shadow_gallery#0',
      cr: undefined,
      str: undefined,
      dex: undefined,
      con: undefined,
      int: undefined,
      wis: undefined,
      cha: undefined,
      damageType: undefined,
    }),
  ],
  dungeon_ossuary: [
    place(CRYPT_GHOUL_BASE, {
      id: 'dungeon_ossuary#0',
      goldDrop: 8,
      cr: undefined,
      str: undefined,
      dex: undefined,
      con: undefined,
      int: undefined,
      wis: undefined,
      cha: undefined,
      damageType: undefined,
    }),
  ],
  dungeon_crypt_throne: [
    { ...CRYPT_LORD_BASE, id: 'dungeon_crypt_throne#0' },
    // Boss-room minion. A single Skeleton Warrior flanks the Crypt Lord
    // — two was over-tuned for an L4 party of 3 (the boss alone deals
    // 3× 2d6+4 with frighten-on-hit; adding two minions made the math
    // unwinnable). One minion still gives the fight texture.
    place(SKELETON_WARRIOR_BASE, {
      id: 'dungeon_crypt_throne#minion_a',
      goldDrop: 3,
      cr: undefined,
      str: undefined,
      dex: undefined,
      con: undefined,
      int: undefined,
      wis: undefined,
      cha: undefined,
      damageType: undefined,
    }),
  ],
  old_road: [
    place(BANDIT_RUFFIAN_BASE, {
      id: 'old_road#0',
      goldDrop: 8,
      drops: ['dagger'],
      darkvision_ft: undefined,
      cr: undefined,
      str: undefined,
      dex: undefined,
      con: undefined,
      int: undefined,
      wis: undefined,
      cha: undefined,
      damageType: undefined,
    }),
    place(BANDIT_RUFFIAN_BASE, {
      id: 'old_road#1',
      goldDrop: 8,
      drops: ['dagger'],
      darkvision_ft: undefined,
      cr: undefined,
      str: undefined,
      dex: undefined,
      con: undefined,
      int: undefined,
      wis: undefined,
      cha: undefined,
      damageType: undefined,
    }),
  ],

  // Bandit camp — a three-ruffian skirmish, then the Captain + a guard.
  bandit_camp: [
    place(BANDIT_RUFFIAN_BASE, {
      id: 'bandit_camp#0',
      goldDrop: 9,
      drops: ['dagger'],
      darkvision_ft: undefined,
      cr: undefined,
      str: undefined,
      dex: undefined,
      con: undefined,
      int: undefined,
      wis: undefined,
      cha: undefined,
      damageType: undefined,
    }),
    place(BANDIT_RUFFIAN_BASE, {
      id: 'bandit_camp#1',
      goldDrop: 9,
      drops: ['dagger'],
      darkvision_ft: undefined,
      cr: undefined,
      str: undefined,
      dex: undefined,
      con: undefined,
      int: undefined,
      wis: undefined,
      cha: undefined,
      damageType: undefined,
    }),
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
    place(BANDIT_RUFFIAN_BASE, {
      id: 'bandit_tent#1',
      goldDrop: 9,
      drops: ['dagger'],
      darkvision_ft: undefined,
      cr: undefined,
      str: undefined,
      dex: undefined,
      con: undefined,
      int: undefined,
      wis: undefined,
      cha: undefined,
      damageType: undefined,
    }),
  ],

  // ── Whispering Pines (folded) ────────────────────────────────────────────
  pass_climb: [
    place(FROST_WOLF_BASE, {
      id: 'pass_climb#0',
      cr: undefined,
      str: undefined,
      dex: undefined,
      con: undefined,
      int: undefined,
      wis: undefined,
      cha: undefined,
      packTactics: undefined,
      damageType: undefined,
    }),
    place(FROST_WOLF_BASE, {
      id: 'pass_climb#1',
      cr: undefined,
      str: undefined,
      dex: undefined,
      con: undefined,
      int: undefined,
      wis: undefined,
      cha: undefined,
      packTactics: undefined,
      damageType: undefined,
    }),
  ],
  spire_frozen_hall: [
    place(SRD_MONSTERS.ice_mephit, {
      id: 'spire_frozen_hall#0',
      cr: undefined,
      str: undefined,
      dex: undefined,
      con: undefined,
      int: undefined,
      wis: undefined,
      cha: undefined,
      damageType: undefined,
    }),
    place(SRD_MONSTERS.ice_mephit, {
      id: 'spire_frozen_hall#1',
      cr: undefined,
      str: undefined,
      dex: undefined,
      con: undefined,
      int: undefined,
      wis: undefined,
      cha: undefined,
      damageType: undefined,
    }),
  ],
  spire_cult_chamber: [
    place(FROST_CULTIST_BASE, {
      id: 'spire_cult_chamber#0',
      cr: undefined,
      str: undefined,
      dex: undefined,
      con: undefined,
      int: undefined,
      wis: undefined,
      cha: undefined,
      damageType: undefined,
    }),
    place(FROST_CULTIST_BASE, {
      id: 'spire_cult_chamber#1',
      cr: undefined,
      str: undefined,
      dex: undefined,
      con: undefined,
      int: undefined,
      wis: undefined,
      cha: undefined,
      damageType: undefined,
    }),
  ],
  spire_ritual_apex: [
    place(FROST_ACOLYTE_BASE, {
      id: 'spire_ritual_apex#boss',
      cr: undefined,
      str: undefined,
      dex: undefined,
      con: undefined,
      int: undefined,
      wis: undefined,
      cha: undefined,
      damageType: undefined,
      spells: undefined,
      castChance: undefined,
      spellAttackBonus: undefined,
      spellSaveDC: undefined,
    }),
  ],

  // ── Grove of Thorns (folded) ─────────────────────────────────────────────
  grove_entrance: [
    place(AWAKENED_WOLF_BASE, {
      id: 'grove_entrance#0',
      cha: 8,
      cr: undefined,
      packTactics: undefined,
      damageType: undefined,
    }),
    place(AWAKENED_WOLF_BASE, {
      id: 'grove_entrance#1',
      cha: 8,
      cr: undefined,
      packTactics: undefined,
      damageType: undefined,
    }),
  ],
  thornwood_maze: [
    place(SRD_MONSTERS.giant_spider, {
      id: 'thornwood_maze#0',
      cr: undefined,
      damageType: undefined,
    }),
    place(SRD_MONSTERS.giant_spider, {
      id: 'thornwood_maze#1',
      cr: undefined,
      damageType: undefined,
    }),
  ],
  ancient_oak: [
    place(FEY_TRICKSTER_BASE, {
      id: 'ancient_oak#0',
      cr: undefined,
    }),
    // A single savage grove-beast minion — right-sized for a level-1 party
    // (the old Brown Bear, 34 hp → ~85 scaled with two 2d6+4 attacks, made the
    // starter encounter an auto-wipe). A wolf reads as a "beast gone savage".
    place(SRD_MONSTERS.wolf, {
      id: 'ancient_oak#1',
      name: 'Thornbound Wolf',
      cr: undefined,
      damageType: undefined,
    }),
  ],
};

export const npcs: Record<string, PlacedNpc> = {
  npc_aldric: {
    roomId: 'millhaven_market',
    id: 'npc_aldric',
    pos: { x: 3, y: 2 },
    name: 'Aldric the Merchant',
    icon: 'shop',
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
    ],
    persuasionDC: 12,
    shop: [{ itemId: 'healing_potion', price: 50 }],
  },
  npc_sister_maren: {
    roomId: 'millhaven_temple',
    id: 'npc_sister_maren',
    pos: { x: 3, y: 2 },
    name: 'Sister Maren',
    icon: 'prayer',
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
  npc_dusk: {
    roomId: 'millhaven_lantern',
    id: 'npc_dusk',
    pos: { x: 5, y: 2 },
    name: 'Dusk',
    attitude: 'indifferent',
    hp: 14,
    ac: 13,
    damage: '1d6+2',
    toHit: 4,
    xp: 0,
    greeting: "Eyes down, stranger. If it's trouble with the Watch, we might have common cause.",
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

  // ── Whispering Pines (folded) ────────────────────────────────────────────
  npc_brann: {
    roomId: 'pines_tavern',
    id: 'npc_brann',
    pos: { x: 2, y: 2 },
    name: 'Innkeeper Brann',
    icon: 'beer-stein',
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
    ],
    persuasionDC: 10,
    shop: [
      { itemId: 'elixir_of_warmth', price: 20 },
      { itemId: 'fur_cloak', price: 40 },
    ],
  },
  npc_marta: {
    roomId: 'pines_lodge',
    id: 'npc_marta',
    pos: { x: 4, y: 2 },
    name: 'Marta the Trapper',
    icon: 'backpack',
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
  npc_riese: {
    roomId: 'pines_warden',
    id: 'npc_riese',
    pos: { x: 3, y: 2 },
    name: 'Captain Riese',
    icon: 'spartan-helmet',
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

  // ── Grove of Thorns (folded) ─────────────────────────────────────────────
  npc_elise_elder: {
    roomId: 'pinegate_square',
    id: 'npc_elise_elder',
    pos: { x: 3, y: 2 },
    name: 'Old Elise (village elder)',
    icon: 'sprite:pawn_yellow_idle', // animated Tiny Swords pawn (yellow, idle)
    attitude: 'friendly',
    factionId: 'faction_verdant',
    hp: 6,
    ac: 10,
    damage: '1d4',
    toHit: 0,
    xp: 0,
    greeting:
      'Mother Mareth went into the grove two weeks ago and never returned. The beasts have gone savage. We need someone — anyone — to walk the path she walked.',
    responses: [
      {
        label: "We'll find Mareth and the grove's heart.",
        reply:
          'Bless you. Take her charm from the lodge — it will let the Oak know you are no enemy. Defeat the Fey Trickster at the heart and the grove will mend.',
        consequences: [
          { type: 'advance_quest', questId: 'quest_silent_grove', stepId: 'step_talk_elise' },
        ],
      },
      {
        label: 'What do you know about this Fey Trickster?',
        reply:
          "A Sidhe creature. It charms first, kills second. Don't look it in the eye. Mareth must have refused its bargain. Hex magic is its mark.",
      },
      {
        label: 'Mareth made deals with fey before?',
        reply:
          'The Verdant Circle works with old powers, but this one came uninvited. Whatever pact it offered, Mareth refused — that is why the grove is in pain.',
      },
    ],
    persuasionDC: 10,
  },
  // A SECOND NPC sharing Pinegate square with Old Elise — demonstrates multiple
  // NPCs in one room (each is independently talkable, with its own attitude).
  npc_bram_woodcutter: {
    roomId: 'pinegate_square',
    id: 'npc_bram_woodcutter',
    pos: { x: 5, y: 4 },
    name: 'Bram the Woodcutter',
    icon: 'sprite:pawn_blue_axe_idle', // animated Tiny Swords pawn (axe idle)
    attitude: 'friendly',
    hp: 10,
    ac: 11,
    damage: '1d6',
    toHit: 2,
    xp: 0,
    greeting:
      'Mind the treeline, friend — the pines have gone wrong of late. I keep my axe close and my eyes closer.',
    responses: [
      {
        label: 'What have you seen in the woods?',
        reply:
          "Shapes that don't cast shadows. Thorns where the path was. I won't go past the old marker stone anymore.",
      },
      {
        label: 'Safe travels, then.',
        reply: 'Aye. Keep to the light.',
      },
    ],
    persuasionDC: 10,
  },
  npc_tamsin_herbalist: {
    roomId: 'pinegate_lodge',
    id: 'npc_tamsin_herbalist',
    pos: { x: 4, y: 2 },
    name: 'Tamsin the Herbalist',
    icon: 'health-potion',
    attitude: 'friendly',
    factionId: 'faction_verdant',
    hp: 8,
    ac: 11,
    damage: '1d4',
    toHit: 1,
    xp: 0,
    greeting:
      'Welcome. The grove has not yielded medicine in weeks — what I have left, I sell. Circle-members get a fair price.',
    responses: [
      {
        label: 'What can you tell me about the grove?',
        reply:
          'The Ancient Oak is at the heart. Mareth used to commune with it. If you reach it and the Oak still lives, plant her charm at its roots — the grove will know.',
      },
    ],
    persuasionDC: 10,
    shop: [{ itemId: 'healing_potion', price: 50 }],
  },
};
