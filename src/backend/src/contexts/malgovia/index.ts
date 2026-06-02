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
import type { MapSite } from '../../types.js';
import { groveContent } from '../folded/grove_of_thorns.js';
import { whisperingPinesContent } from '../folded/whispering_pines.js';

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
    // Three quests + 8-room crypt with a multi-attack lich boss — tuned for 3 PCs.
    recommendedPartySize: 3,
    // Charnel Hall blade trap + Garrison strongbox favor Rogue's Stealth /
    // Investigation / Cunning Action over a Wizard's blast spells here.
    recommendedComposition: ['Fighter', 'Cleric', 'Rogue'],
    intro:
      'Malgovia stretches before you — a shadow of its former self. Years ago an arrogant mage thought he could control a powerful gateway spell but failed, leaving behind a shadowed frontier of dread-filled tombs, frozen spires, and silent groves, where suspicious folk eye every stranger who walks the pine-dark roads.',

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

// ── Folded-in campaigns ──────────────────────────────────────────────────────
// Whispering Pines (and Grove of Thorns) are no longer standalone campaigns —
// their content is folded into Malgovia as additional areas of the same world,
// reached via new sites on the regional map. Their data modules live under
// contexts/folded/ (the context loader only scans top-level files in
// contexts/, so the folded modules aren't registered as separate campaigns).
//
// Each fold appends the campaign's enemy templates, loot, NPC templates, rules,
// rooms, NPCs, towns, quests, and factions onto Malgovia, and drops new sites
// onto the Malgovia's regional map that lead into the folded content. IDs are
// already disjoint between campaigns (only `venue_gate` is renamed per town);
// the opening-quest flag is stripped in the folded module so the Malgovia's own
// "Missing Shipment" stays the sole starter and the others are discovered on
// arrival.
function foldCampaign(into: Context, content: Context, sites: MapSite[], dropRooms: string[] = []) {
  const intoCamp = into.campaign!;
  const fromCamp = content.campaign!;
  const lootIds = new Set(into.lootTable.map((i) => i.id));
  into.enemyTemplates.push(...content.enemyTemplates);
  into.lootTable.push(...content.lootTable.filter((i) => !lootIds.has(i.id)));
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

// Whispering Pines — three new sites on the Malgovia's regional map. The town opens
// the Pines village; the local sites drop into the frozen pass and the Iceshard
// Spire.
foldCampaign(context, whisperingPinesContent, [
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
]);

// Grove of Thorns — Pinegate village + the Silent Grove, on free Malgovia-grid
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
