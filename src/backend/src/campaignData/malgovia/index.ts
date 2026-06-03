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
  SRD_SPELLCASTING_ABILITY,
  SRD_SPELLS,
  srdBackgrounds,
} from '../srd/index.js';
import { enemies, enemyTemplates, npcs } from './entities.js';
import { factions, narratives, quests, rules } from './game.js';
import { loot, lootTable } from './items.js';
import { regions, rooms, towns } from './map.js';
import type { Context } from '../../types.js';

// ─── Malgovia — First Adventure Module ─────────────────────────────────
//
// 3-level grid map (regional → town → local):
//   region `vale_region` — the overland map; the party is a single marker.
//     sites: Millhaven (town), The Old Road, Bandit Camp, Shattered Crypt.
//   town `millhaven_town` — venues: Temple, Merchant/Lantern districts,
//     Garrison, and the gate back to the region.
//   local rooms — the crypt (8 rooms), the camp (2 rooms), the road skirmish;
//     connected by per-cell room `exits`.
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
  id: 'malgovia',
  displayNoun: 'vale',

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

  // ─── Enemy templates ──────────────────────────────────────────────────────────

  enemyTemplates,

  // ─── Loot table ───────────────────────────────────────────────────────────────

  lootTable,

  // ─── Narratives ───────────────────────────────────────────────────────────────

  narratives,

  // ─── Campaign data ────────────────────────────────────────────────────────────

  campaign: {
    world_name: 'Malgovia',
    // Tuned for the standard 5e party of 4: a martial front line, divine + arcane
    // casters, and a Rogue for the Charnel Hall blade trap + Garrison strongbox
    // (Stealth / Investigation / Cunning Action).
    recommendedPartySize: 4,
    recommendedComposition: ['Fighter', 'Cleric', 'Rogue', 'Wizard'],
    intro:
      "The pine-dark road brings you to Pinegate, a lantern-lit village on Malgovia's southern edge. Beyond it the Silent Grove has gone wrong — beasts turned savage, the Verdant Circle's warden vanished into the trees. Set the grove right and the wider vale opens before you: east to the market town of Millhaven and the restless crypt beneath it, and north — when you are ready — to the frozen passes and the cult festering in Iceshard Spire. Start small. The vale grows colder, and crueler, the farther you walk.",

    // ── Rooms (local grids) ──────────────────────────────────────────────────
    // 3-level map model: navigation is by the party marker on the regional /
    // town grids (see `regions` / `towns` below) and per-cell room `exits` on
    // local grids. Each
    // local room is a self-contained grid; `entryPos` is where the marker
    // arrives, `exits` are the transition cells (room→room, or `ascends` to
    // leave the site). Combat is unchanged — it deploys on the context combat
    // grid, independent of these exploration-grid dims.
    rooms,

    // Navigation is by the marker + room `exits` (3-level map), so the old
    // room-adjacency graph is intentionally empty.

    // Enemy placements (roomId → Enemy[])
    enemies,

    // Loot placements
    loot,

    // Author-placed NPCs, bound to specific rooms in the campaign. Without this,
    // the engine's seed.npcs[roomId] lookup would return undefined and nothing
    // would talk to the player.
    npcs,

    defaultStartingLoot: ['healing_potion'],

    // ─── 3-level grid map (regional → town → local) ───────────────────────────
    // The party starts on the regional grid as a single marker (see
    // initMapState). Sites open a town (Millhaven) or drop the party into a
    // local site (the Old Road skirmish, the Bandit Camp, the Shattered Crypt).
    // Wandering the road risks a per-square Bandit Ruffian ambush.

    regions,

    towns,

    // ─── Quests ─────────────────────────────────────────────────────────────────

    quests,

    // ─── Factions ────────────────────────────────────────────────────────────────

    factions,
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

  rules,
};

export { context };
