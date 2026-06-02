import type { Enemy, EnemyTemplate, PlacedNpc } from '../../types.js';
import { SRD_MONSTERS } from '../srd/index.js';

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

export const enemyTemplates: EnemyTemplate[] = [
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
];

export const enemies: Record<string, Enemy[]> = {
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
  old_road: [
    {
      id: 'old_road#0',
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
      id: 'old_road#1',
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
};

export const npcs: Record<string, PlacedNpc> = {
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
  millhaven_lantern: {
    roomId: 'millhaven_lantern',
    id: 'npc_dusk',
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
};
