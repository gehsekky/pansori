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
} from './index.js';
import type { Context } from '../../types.js';

// The BASE CAMPAIGN TEMPLATE — the code-side foundation every DB-born
// campaign supplements from.
//
// Creator-built campaigns have no campaignData/ folder, so the resolver
// (services/campaignContent.ts) merges their DB sections over THIS context
// instead: all the engine machinery that isn't DB-editable yet (class
// config, spell/feat tables, backgrounds, narrative pools) comes from
// here; everything the creator edits (gameStart, narratives, regions,
// towns, customs) overlays it, and the ambient SRD catalogs compose the
// full loot table + bestiary in on top of the empty lists below.
//
// The stub world (a camp and a cave) keeps a freshly created campaign
// PLAYABLE from minute one — the engine's map model still runs on
// `campaign` data; DB-painted regions take over when that wiring lands.
//
// This file lives under srd/ so the context loader does NOT register it
// as a campaign of its own — it is reachable only through the resolver.

export const baseCampaignContext: Context = {
  id: '__base__', // replaced with the DB campaign's id by the resolver
  displayNoun: 'campaign',
  gridWidth: 8,
  gridHeight: 8,

  // ─── Classes (full SRD kit, same as the built-ins) ──────────────────────────
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
    Rogue: ['shortsword', 'dagger', 'leather_armor'],
    Wizard: ['quarterstaff', 'healing_potion'],
    Cleric: ['mace', 'chain_shirt', 'shield'],
    Ranger: ['longbow', 'shortsword', 'studded_leather'],
    Paladin: ['longsword', 'chain_mail', 'shield', 'healing_potion'],
    Bard: ['rapier', 'leather_armor', 'healing_potion'],
    Druid: ['quarterstaff', 'leather_armor', 'healing_potion'],
    Sorcerer: ['dagger', 'healing_potion'],
    Warlock: ['dagger', 'leather_armor', 'healing_potion'],
    Monk: ['shortsword', 'dart'],
    Barbarian: ['greataxe', 'handaxe', 'healing_potion'],
  },

  backgrounds: srdBackgrounds(),
  spellTable: { ...SRD_SPELLS },
  featTable: { ...SRD_FEATS },
  classSpells: {
    Wizard: ['fire_bolt', 'magic_missile', 'thunderwave', 'misty_step', 'fireball'],
    Cleric: ['sacred_flame', 'cure_wounds', 'guiding_bolt', 'hold_person', 'bless'],
    Druid: ['shillelagh', 'entangle', 'cure_wounds', 'healing_word'],
    Sorcerer: ['fire_bolt', 'sleep', 'burning_hands', 'misty_step'],
    Warlock: ['eldritch_blast', 'hex', 'charm_person'],
    Bard: ['charm_person', 'healing_word', 'sleep', 'hold_person'],
    Paladin: ['bless', 'cure_wounds', 'guiding_bolt'],
    Ranger: ['cure_wounds', 'entangle'],
  },
  spellcastingAbility: { ...SRD_SPELLCASTING_ABILITY },

  // Empty on purpose — the ambient SRD catalogs compose the full bestiary
  // and loot table in; campaign customs add to / shadow them.
  enemyTemplates: [],
  lootTable: [],

  // ─── The stub world ─────────────────────────────────────────────────────────
  campaign: {
    world_name: 'New Campaign',
    intro:
      'A fresh world, waiting to be written. A camp by the road, a cave in the hills — and everything else still to come.',
    rooms: [
      {
        id: 'base_camp',
        name: 'Camp',
        desc: 'A small camp beside a worn road: a fire ring, a bedroll, and open country in every direction.',
        // Arrival flavor (pooled — random pick per visit; was narratives.roomArrival).
        onEnter: ['The camp is quiet. The fire ring is cold but serviceable.'],
        canRest: true,
        gridWidth: 8,
        gridHeight: 8,
        entryPos: { x: 4, y: 7 },
        exits: [{ pos: { x: 4, y: 0 }, ascends: true, label: 'Back to the open road' }],
      },
      {
        id: 'old_cave',
        name: 'Old Cave',
        desc: 'A low cave mouth in the hillside. Something has been living here.',
        // Arrival flavor (pooled — was narratives.roomArrival).
        onEnter: ['The cave smells of damp stone and something animal.'],
        gridWidth: 8,
        gridHeight: 8,
        entryPos: { x: 0, y: 4 },
        exits: [{ pos: { x: 0, y: 0 }, ascends: true, label: 'Back outside' }],
      },
    ],
    regions: [
      {
        id: 'starting_region',
        name: 'The Wilds',
        desc: 'Unmapped country at the edge of a new world.',
        feetPerSquare: 5280,
        gridWidth: 6,
        gridHeight: 5,
        startPos: { x: 1, y: 2 },
        sites: [
          {
            id: 'site_camp',
            name: 'Camp',
            pos: { x: 2, y: 2 },
            kind: 'local',
            entryRoomId: 'base_camp',
          },
          {
            id: 'site_cave',
            name: 'Old Cave',
            pos: { x: 4, y: 1 },
            kind: 'local',
            entryRoomId: 'old_cave',
            icon: 'cave-entrance',
          },
        ],
      },
    ],
    enemies: {
      old_cave: [{ ...SRD_MONSTERS.goblin, id: 'old_cave#0' }],
    },
    recommendedPartySize: 1,
  },

  // ─── Neutral narrative pools (overlaid by the campaign's DB narratives) ──────
  // (Per-room arrival flavor lives on each room's pooled `onEnter` now.)
  narratives: {
    genericArrival: [
      'You move on, senses alert.',
      'The way opens before you.',
      'You press forward cautiously.',
    ],
    weaponVerbs: {
      dagger: ['stabs with', 'drives', 'flicks'],
      mace: ['bludgeons with', 'slams', 'swings'],
      shortsword: ['slashes with', 'drives', 'cuts with'],
      rapier: ['thrusts with', 'lunges with', 'drives'],
      longsword: ['swings', 'cleaves with', 'drives'],
      greataxe: ['cleaves with', 'brings down', 'sweeps'],
      longbow: ['fires', 'looses', 'shoots'],
      quarterstaff: ['strikes with', 'sweeps', 'thrusts'],
    },
    classStyle: {
      Fighter: ['with disciplined form', 'with martial precision'],
      Rogue: ['from the shadows', 'with practiced efficiency'],
      Wizard: ['channeling arcane energy', 'with calculated intent'],
      Cleric: ['invoking divine power', 'guided by faith'],
      Ranger: ["with hunter's instinct", 'with practiced aim'],
    },
    enemyReactions: {
      Goblin: ['shrieks', 'snarls', 'chatters angrily'],
    },
    deathSaveStatus: {
      1: ['Clinging to life.'],
      2: ['One foot in the grave.'],
      3: ['Stable — but unconscious.'],
    },
    // Article-aware tokens ({the_enemy}/{The_enemy}) so proper-named foes —
    // an NPC turned hostile, a titled boss — read "Lorien reels", never
    // "The Lorien reels". Bare {enemy} stays for unarticled mentions.
    combatHit: {
      high: ['A decisive strike — {the_enemy} staggers.', 'Clean hit. {The_enemy} reels.'],
      mid: ['Your attack connects. {The_enemy} is hurt.', 'You land a solid blow on {the_enemy}.'],
      low: ['A glancing blow, but it counts.', "You scrape past {the_enemy}'s guard."],
    },
    combatMiss: {
      high: ['Your attack goes wide. {The_enemy} is fast.', 'Near miss — {the_enemy} dodges.'],
      mid: ['Attack misses.', '{The_enemy} deflects your strike.'],
      low: ['You swing wide.', 'The attack fails to connect.'],
    },
    enemyAttacks: [
      '{The_enemy} strikes back for {dmg} damage.',
      '{The_enemy} retaliates — {dmg} damage.',
    ],
    killShot: ['{The_enemy} falls. +{xp} XP.', '{enemy} is defeated. +{xp} XP.'],
    lootPickedUp: ['You pick up the {item}.', 'You take the {item}.'],
    noLoot: ['Nothing here to take.'],
    alreadyLooted: ['Already taken.'],
    noEnemy: ['No enemy here.'],
    alreadyDead: ['The remains of your foe lie still.'],
    sneakSuccess: ['You slip past {the_enemy} undetected.'],
    deathLines: ['Slain by {enemy}. The world claims another soul.'],
    enemyDeflected: ["Your {armor} turns {the_enemy}'s blow."],
    levelUp: ['Level up! You grow stronger.'],
  },
};
