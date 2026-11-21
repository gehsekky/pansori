import type { AbilityKey, ItemCharges, ItemSpell, LootItem, WornEffect } from '../../types.js';
import { SRD_SPELLS } from './spells.js';

// Shared SRD 5.2.1 equipment definitions.
//
// SRD weapons, armor, and adventuring gear are universal — a Longsword in
// Vale of Shadows is the same Longsword as in Whispering Pines. Pansori
// previously duplicated these definitions across every campaign context,
// which drifted (different weights / descriptions / aliases for the same
// item). This registry is the single source of truth.
//
// Contexts compose their `lootTable` from this registry plus their own
// custom items, and limit which SRD items are available by selecting ids:
//
//   lootTable: [
//     ...srdItems('dagger', 'longsword', 'chain_mail', 'shield', 'healing_potion'),
//     myCampaignRelic,                       // custom item, campaign-only
//   ]
//
// A campaign can override an SRD item by placing its own entry with the same
// id AFTER the spread (last-wins on `lootTable.find`), but the default is to
// share the canonical definition so the mechanics stay consistent.
//
// Item IDs match the SRD 5.2.1 names. Mechanical fields (damage, mastery,
// armor class, etc.) follow RAW (Battleaxe = Topple, per the SRD weapon table).
// Mundane SRD gear (weapons, armor, adventuring items) — no magic items.
export const BASE_ITEMS: Record<string, LootItem> = {
  // ─── Simple melee weapons ──────────────────────────────────────────────────
  dagger: {
    id: 'dagger',
    value: 2,
    name: 'Dagger',
    desc: '1d4 piercing, finesse, light, thrown',
    weight: 5,
    type: 'weapon',
    slot: 'weapon',
    damage: '1d4',
    finesse: true,
    light: true,
    range: 'melee',
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['dagger', 'knife'],
    weaponType: 'simple',
    damageType: 'piercing',
    mastery: 'nick',
  },
  handaxe: {
    id: 'handaxe',
    value: 5,
    name: 'Handaxe',
    desc: '1d6 slashing, light, thrown',
    weight: 5,
    type: 'weapon',
    slot: 'weapon',
    damage: '1d6',
    light: true,
    range: 'melee',
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['handaxe', 'hand axe', 'hatchet'],
    weaponType: 'simple',
    damageType: 'slashing',
    mastery: 'vex',
  },
  quarterstaff: {
    id: 'quarterstaff',
    value: 1,
    name: 'Quarterstaff',
    desc: '1d6 bludgeoning one-handed (1d8 two-handed)',
    weight: 4,
    type: 'weapon',
    slot: 'weapon',
    damage: '1d6',
    versatileDamage: '1d8',
    range: 'melee',
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['quarterstaff', 'staff', 'quarter staff'],
    weaponType: 'simple',
    damageType: 'bludgeoning',
    mastery: 'topple',
  },
  mace: {
    id: 'mace',
    value: 5,
    name: 'Mace',
    desc: '1d6 bludgeoning',
    weight: 8,
    type: 'weapon',
    slot: 'weapon',
    damage: '1d6',
    range: 'melee',
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['mace'],
    weaponType: 'simple',
    damageType: 'bludgeoning',
    mastery: 'sap',
  },
  spear: {
    id: 'spear',
    value: 1,
    name: 'Spear',
    desc: '1d6 piercing one-handed (1d8 two-handed), thrown 20/60',
    weight: 3,
    type: 'weapon',
    slot: 'weapon',
    damage: '1d6',
    versatileDamage: '1d8',
    range: 'melee',
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['spear'],
    weaponType: 'simple',
    damageType: 'piercing',
    mastery: 'sap',
    thrown: { normalRange: 20, longRange: 60 },
  },
  dart: {
    id: 'dart',
    value: 1,
    name: 'Dart',
    desc: '1d4 piercing, finesse, thrown',
    weight: 1,
    type: 'weapon',
    slot: 'weapon',
    damage: '1d4',
    finesse: true,
    range: 'melee',
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['dart', 'darts'],
    weaponType: 'simple',
    damageType: 'piercing',
    mastery: 'vex',
  },

  club: {
    id: 'club',
    value: 1,
    name: 'Club',
    desc: '1d4 bludgeoning, light',
    weight: 2,
    type: 'weapon',
    slot: 'weapon',
    damage: '1d4',
    light: true,
    range: 'melee',
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['club', 'cudgel'],
    weaponType: 'simple',
    damageType: 'bludgeoning',
    mastery: 'slow',
  },
  greatclub: {
    id: 'greatclub',
    value: 1,
    name: 'Greatclub',
    desc: '1d8 bludgeoning, two-handed',
    weight: 10,
    type: 'weapon',
    slot: 'weapon',
    damage: '1d8',
    range: 'melee',
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['greatclub', 'great club'],
    weaponType: 'simple',
    damageType: 'bludgeoning',
    mastery: 'push',
  },
  javelin: {
    id: 'javelin',
    value: 1,
    name: 'Javelin',
    desc: '1d6 piercing, thrown 30/120',
    weight: 2,
    type: 'weapon',
    slot: 'weapon',
    damage: '1d6',
    range: 'melee',
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['javelin'],
    weaponType: 'simple',
    damageType: 'piercing',
    mastery: 'slow',
    thrown: { normalRange: 30, longRange: 120 },
  },
  light_hammer: {
    id: 'light_hammer',
    value: 2,
    name: 'Light Hammer',
    desc: '1d4 bludgeoning, light, thrown 20/60',
    weight: 2,
    type: 'weapon',
    slot: 'weapon',
    damage: '1d4',
    light: true,
    range: 'melee',
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['light hammer', 'light_hammer', 'throwing hammer'],
    weaponType: 'simple',
    damageType: 'bludgeoning',
    mastery: 'nick',
    thrown: { normalRange: 20, longRange: 60 },
  },
  sickle: {
    id: 'sickle',
    value: 1,
    name: 'Sickle',
    desc: '1d4 slashing, light',
    weight: 2,
    type: 'weapon',
    slot: 'weapon',
    damage: '1d4',
    light: true,
    range: 'melee',
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['sickle'],
    weaponType: 'simple',
    damageType: 'slashing',
    mastery: 'nick',
  },

  // ─── Simple ranged weapons ─────────────────────────────────────────────────
  shortbow: {
    id: 'shortbow',
    value: 25,
    name: 'Shortbow',
    desc: '1d6 piercing, ranged (80/320)',
    weight: 4,
    type: 'weapon',
    slot: 'weapon',
    damage: '1d6',
    range: 'ranged',
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['shortbow', 'short bow'],
    weaponType: 'simple',
    damageType: 'piercing',
    mastery: 'vex',
  },
  light_crossbow: {
    id: 'light_crossbow',
    value: 25,
    name: 'Light Crossbow',
    desc: '1d8 piercing, ranged (80/320), loading, two-handed',
    weight: 5,
    type: 'weapon',
    slot: 'weapon',
    damage: '1d8',
    range: 'ranged',
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['light crossbow', 'crossbow', 'light_crossbow'],
    weaponType: 'simple',
    damageType: 'piercing',
    mastery: 'slow',
    loading: true,
  },

  sling: {
    id: 'sling',
    value: 1,
    name: 'Sling',
    desc: '1d4 bludgeoning, ranged (30/120)',
    weight: 1,
    type: 'weapon',
    slot: 'weapon',
    damage: '1d4',
    range: 'ranged',
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['sling'],
    weaponType: 'simple',
    damageType: 'bludgeoning',
    mastery: 'slow',
  },

  // ─── Martial melee weapons ─────────────────────────────────────────────────
  shortsword: {
    id: 'shortsword',
    value: 10,
    name: 'Shortsword',
    desc: '1d6 piercing, finesse, light',
    weight: 6,
    type: 'weapon',
    slot: 'weapon',
    damage: '1d6',
    finesse: true,
    light: true,
    range: 'melee',
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['shortsword', 'short sword'],
    weaponType: 'martial',
    damageType: 'piercing',
    mastery: 'vex',
  },
  rapier: {
    id: 'rapier',
    value: 25,
    name: 'Rapier',
    desc: '1d8 piercing, finesse',
    weight: 6,
    type: 'weapon',
    slot: 'weapon',
    damage: '1d8',
    finesse: true,
    range: 'melee',
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['rapier'],
    weaponType: 'martial',
    damageType: 'piercing',
    mastery: 'vex',
  },
  longsword: {
    id: 'longsword',
    value: 15,
    name: 'Longsword',
    desc: '1d8 slashing (1d10 two-handed), versatile',
    weight: 6,
    type: 'weapon',
    slot: 'weapon',
    damage: '1d8',
    versatileDamage: '1d10',
    range: 'melee',
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['longsword', 'long sword', 'sword'],
    weaponType: 'martial',
    damageType: 'slashing',
    mastery: 'sap',
  },
  greatsword: {
    id: 'greatsword',
    value: 50,
    name: 'Greatsword',
    desc: '2d6 slashing, heavy, two-handed',
    weight: 10,
    type: 'weapon',
    slot: 'weapon',
    damage: '2d6',
    range: 'melee',
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['greatsword', 'great sword'],
    weaponType: 'martial',
    damageType: 'slashing',
    mastery: 'graze',
    heavy: true,
  },
  battleaxe: {
    id: 'battleaxe',
    value: 10,
    name: 'Battleaxe',
    desc: '1d8 slashing (1d10 two-handed), versatile, Topple mastery',
    weight: 4,
    type: 'weapon',
    slot: 'weapon',
    damage: '1d8',
    versatileDamage: '1d10',
    range: 'melee',
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['battleaxe', 'battle axe', 'axe'],
    weaponType: 'martial',
    damageType: 'slashing',
    mastery: 'topple',
  },
  greataxe: {
    id: 'greataxe',
    value: 30,
    name: 'Greataxe',
    desc: '1d12 slashing, heavy, two-handed, Cleave mastery',
    weight: 7,
    type: 'weapon',
    slot: 'weapon',
    damage: '1d12',
    range: 'melee',
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['greataxe', 'great axe'],
    weaponType: 'martial',
    damageType: 'slashing',
    mastery: 'cleave',
    heavy: true,
  },
  glaive: {
    id: 'glaive',
    value: 20,
    name: 'Glaive',
    desc: '1d10 slashing, heavy, two-handed, reach (10 ft)',
    weight: 6,
    type: 'weapon',
    slot: 'weapon',
    damage: '1d10',
    range: 'melee',
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['glaive'],
    weaponType: 'martial',
    damageType: 'slashing',
    mastery: 'graze',
    heavy: true,
    reach: true,
  },
  halberd: {
    id: 'halberd',
    value: 20,
    name: 'Halberd',
    desc: '1d10 slashing, heavy, two-handed, reach (10 ft), Cleave mastery',
    weight: 6,
    type: 'weapon',
    slot: 'weapon',
    damage: '1d10',
    range: 'melee',
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['halberd'],
    weaponType: 'martial',
    damageType: 'slashing',
    mastery: 'cleave',
    heavy: true,
    reach: true,
  },
  pike: {
    id: 'pike',
    value: 5,
    name: 'Pike',
    desc: '1d10 piercing, heavy, two-handed, reach (10 ft)',
    weight: 18,
    type: 'weapon',
    slot: 'weapon',
    damage: '1d10',
    range: 'melee',
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['pike'],
    weaponType: 'martial',
    damageType: 'piercing',
    mastery: 'push',
    heavy: true,
    reach: true,
  },
  warhammer: {
    id: 'warhammer',
    value: 15,
    name: 'Warhammer',
    desc: '1d8 bludgeoning (1d10 two-handed), versatile',
    weight: 5,
    type: 'weapon',
    slot: 'weapon',
    damage: '1d8',
    versatileDamage: '1d10',
    range: 'melee',
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['warhammer', 'hammer'],
    weaponType: 'martial',
    damageType: 'bludgeoning',
    mastery: 'push',
  },

  flail: {
    id: 'flail',
    value: 10,
    name: 'Flail',
    desc: '1d8 bludgeoning',
    weight: 2,
    type: 'weapon',
    slot: 'weapon',
    damage: '1d8',
    range: 'melee',
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['flail'],
    weaponType: 'martial',
    damageType: 'bludgeoning',
    mastery: 'sap',
  },
  lance: {
    id: 'lance',
    value: 10,
    name: 'Lance',
    desc: '1d10 piercing, heavy, reach (10 ft), two-handed unless mounted',
    weight: 6,
    type: 'weapon',
    slot: 'weapon',
    damage: '1d10',
    range: 'melee',
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['lance'],
    weaponType: 'martial',
    damageType: 'piercing',
    mastery: 'topple',
    heavy: true,
    reach: true,
  },
  maul: {
    id: 'maul',
    value: 10,
    name: 'Maul',
    desc: '2d6 bludgeoning, heavy, two-handed',
    weight: 10,
    type: 'weapon',
    slot: 'weapon',
    damage: '2d6',
    range: 'melee',
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['maul'],
    weaponType: 'martial',
    damageType: 'bludgeoning',
    mastery: 'topple',
    heavy: true,
  },
  morningstar: {
    id: 'morningstar',
    value: 15,
    name: 'Morningstar',
    desc: '1d8 piercing',
    weight: 4,
    type: 'weapon',
    slot: 'weapon',
    damage: '1d8',
    range: 'melee',
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['morningstar', 'morning star'],
    weaponType: 'martial',
    damageType: 'piercing',
    mastery: 'sap',
  },
  scimitar: {
    id: 'scimitar',
    value: 25,
    name: 'Scimitar',
    desc: '1d6 slashing, finesse, light',
    weight: 3,
    type: 'weapon',
    slot: 'weapon',
    damage: '1d6',
    finesse: true,
    light: true,
    range: 'melee',
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['scimitar'],
    weaponType: 'martial',
    damageType: 'slashing',
    mastery: 'nick',
  },
  trident: {
    id: 'trident',
    value: 5,
    name: 'Trident',
    desc: '1d8 piercing (1d10 two-handed), versatile, thrown 20/60',
    weight: 4,
    type: 'weapon',
    slot: 'weapon',
    damage: '1d8',
    versatileDamage: '1d10',
    range: 'melee',
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['trident'],
    weaponType: 'martial',
    damageType: 'piercing',
    mastery: 'topple',
    thrown: { normalRange: 20, longRange: 60 },
  },
  war_pick: {
    id: 'war_pick',
    value: 5,
    name: 'War Pick',
    desc: '1d8 piercing (1d10 two-handed), versatile',
    weight: 2,
    type: 'weapon',
    slot: 'weapon',
    damage: '1d8',
    versatileDamage: '1d10',
    range: 'melee',
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['war pick', 'war_pick', 'warpick'],
    weaponType: 'martial',
    damageType: 'piercing',
    mastery: 'sap',
  },
  whip: {
    id: 'whip',
    value: 2,
    name: 'Whip',
    desc: '1d4 slashing, finesse, reach (10 ft)',
    weight: 3,
    type: 'weapon',
    slot: 'weapon',
    damage: '1d4',
    finesse: true,
    range: 'melee',
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['whip'],
    weaponType: 'martial',
    damageType: 'slashing',
    mastery: 'slow',
    reach: true,
  },

  // ─── Martial ranged weapons ────────────────────────────────────────────────
  longbow: {
    id: 'longbow',
    value: 50,
    name: 'Longbow',
    desc: '1d8 piercing, heavy, ranged (150/600)',
    weight: 4,
    type: 'weapon',
    slot: 'weapon',
    damage: '1d8',
    range: 'ranged',
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['longbow', 'long bow'],
    weaponType: 'martial',
    damageType: 'piercing',
    mastery: 'slow',
    heavy: true,
  },
  hand_crossbow: {
    id: 'hand_crossbow',
    value: 75,
    name: 'Hand Crossbow',
    desc: '1d6 piercing, light, ranged (30/120), loading',
    weight: 3,
    type: 'weapon',
    slot: 'weapon',
    damage: '1d6',
    range: 'ranged',
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['hand crossbow', 'hand_crossbow', 'crossbow_hand'],
    weaponType: 'martial',
    damageType: 'piercing',
    mastery: 'vex',
    light: true,
    loading: true,
  },
  heavy_crossbow: {
    id: 'heavy_crossbow',
    value: 50,
    name: 'Heavy Crossbow',
    desc: '1d10 piercing, heavy, ranged (100/400), loading, two-handed',
    weight: 18,
    type: 'weapon',
    slot: 'weapon',
    damage: '1d10',
    range: 'ranged',
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['heavy crossbow', 'heavy_crossbow'],
    weaponType: 'martial',
    damageType: 'piercing',
    mastery: 'push',
    heavy: true,
    loading: true,
  },

  blowgun: {
    id: 'blowgun',
    value: 10,
    name: 'Blowgun',
    desc: '1 piercing, ranged (25/100), loading',
    weight: 1,
    type: 'weapon',
    slot: 'weapon',
    damage: '1',
    range: 'ranged',
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['blowgun', 'blow gun'],
    weaponType: 'martial',
    damageType: 'piercing',
    mastery: 'vex',
    loading: true,
  },
  musket: {
    id: 'musket',
    value: 500,
    name: 'Musket',
    desc: '1d12 piercing, ranged (40/120), loading, two-handed',
    weight: 10,
    type: 'weapon',
    slot: 'weapon',
    damage: '1d12',
    range: 'ranged',
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['musket'],
    weaponType: 'martial',
    damageType: 'piercing',
    mastery: 'slow',
    loading: true,
  },
  pistol: {
    id: 'pistol',
    value: 250,
    name: 'Pistol',
    desc: '1d10 piercing, ranged (30/90), loading',
    weight: 3,
    type: 'weapon',
    slot: 'weapon',
    damage: '1d10',
    range: 'ranged',
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['pistol', 'flintlock'],
    weaponType: 'martial',
    damageType: 'piercing',
    mastery: 'vex',
    loading: true,
  },

  // ─── Armor ─────────────────────────────────────────────────────────────────
  padded_armor: {
    id: 'padded_armor',
    value: 5,
    name: 'Padded Armor',
    desc: 'AC 11 + DEX modifier, light armor (stealth disadvantage)',
    weight: 8,
    type: 'armor',
    slot: 'armor',
    damage: null,
    armorAcBase: 11,
    armorCategory: 'light',
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['padded armor', 'padded'],
  },
  leather_armor: {
    id: 'leather_armor',
    value: 10,
    name: 'Leather Armor',
    desc: 'AC 11 + DEX modifier, light armor',
    weight: 10,
    type: 'armor',
    slot: 'armor',
    damage: null,
    armorAcBase: 11,
    armorCategory: 'light',
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['leather armor', 'leather'],
  },
  studded_leather: {
    id: 'studded_leather',
    value: 45,
    name: 'Studded Leather',
    desc: 'AC 12 + DEX modifier, light armor',
    weight: 13,
    type: 'armor',
    slot: 'armor',
    damage: null,
    armorAcBase: 12,
    armorCategory: 'light',
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['studded leather', 'studded'],
  },
  chain_shirt: {
    id: 'chain_shirt',
    value: 50,
    name: 'Chain Shirt',
    desc: 'AC 13 + DEX (max +2), medium armor',
    weight: 20,
    type: 'armor',
    slot: 'armor',
    damage: null,
    armorAcBase: 13,
    dexCapToAc: 2,
    armorCategory: 'medium',
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['chain shirt'],
  },
  scale_mail: {
    id: 'scale_mail',
    value: 50,
    name: 'Scale Mail',
    desc: 'AC 14 + DEX (max +2), medium armor',
    weight: 6,
    type: 'armor',
    slot: 'armor',
    damage: null,
    armorAcBase: 14,
    dexCapToAc: 2,
    armorCategory: 'medium',
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['scale mail', 'scale', 'scalemail'],
  },
  hide_armor: {
    id: 'hide_armor',
    value: 10,
    name: 'Hide Armor',
    desc: 'AC 12 + DEX (max +2), medium armor',
    weight: 12,
    type: 'armor',
    slot: 'armor',
    damage: null,
    armorAcBase: 12,
    dexCapToAc: 2,
    armorCategory: 'medium',
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['hide armor', 'hide'],
  },
  breastplate: {
    id: 'breastplate',
    value: 400,
    name: 'Breastplate',
    desc: 'AC 14 + DEX (max +2), medium armor',
    weight: 20,
    type: 'armor',
    slot: 'armor',
    damage: null,
    armorAcBase: 14,
    dexCapToAc: 2,
    armorCategory: 'medium',
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['breastplate', 'breast plate'],
  },
  half_plate: {
    id: 'half_plate',
    value: 750,
    name: 'Half Plate Armor',
    desc: 'AC 15 + DEX (max +2), medium armor (stealth disadvantage)',
    weight: 40,
    type: 'armor',
    slot: 'armor',
    damage: null,
    armorAcBase: 15,
    dexCapToAc: 2,
    armorCategory: 'medium',
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['half plate', 'half_plate', 'half plate armor'],
  },
  chain_mail: {
    id: 'chain_mail',
    value: 75,
    name: 'Chain Mail',
    desc: 'AC 16, heavy armor (STR 13 required)',
    weight: 55,
    type: 'armor',
    slot: 'armor',
    damage: null,
    armorAcBase: 16,
    dexCapToAc: 0,
    armorCategory: 'heavy',
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['chain mail', 'chainmail'],
  },
  plate_armor: {
    id: 'plate_armor',
    value: 1500,
    name: 'Plate Armor',
    desc: 'AC 18, heavy armor (STR 15 required)',
    weight: 65,
    type: 'armor',
    slot: 'armor',
    damage: null,
    armorAcBase: 18,
    dexCapToAc: 0,
    armorCategory: 'heavy',
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['plate armor', 'plate'],
  },
  ring_mail: {
    id: 'ring_mail',
    value: 30,
    name: 'Ring Mail',
    desc: 'AC 14, heavy armor (stealth disadvantage)',
    weight: 40,
    type: 'armor',
    slot: 'armor',
    damage: null,
    armorAcBase: 14,
    dexCapToAc: 0,
    armorCategory: 'heavy',
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['ring mail', 'ringmail'],
  },
  splint_armor: {
    id: 'splint_armor',
    value: 200,
    name: 'Splint Armor',
    desc: 'AC 17, heavy armor (STR 15 required, stealth disadvantage)',
    weight: 60,
    type: 'armor',
    slot: 'armor',
    damage: null,
    armorAcBase: 17,
    dexCapToAc: 0,
    armorCategory: 'heavy',
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['splint', 'splint armor', 'splint mail'],
  },
  shield: {
    id: 'shield',
    value: 10,
    name: 'Shield',
    desc: '+2 AC while equipped',
    weight: 12,
    type: 'armor',
    slot: 'shield',
    damage: null,
    armorCategory: 'shield',
    ac_bonus: 2,
    heal: null,
    effect: null,
    aliases: ['shield'],
  },

  // ─── Adventuring gear / consumables ─────────────────────────────────────────
  healing_potion: {
    id: 'healing_potion',
    value: 50,
    name: 'Healing Potion',
    desc: 'Restores 2d4+2 HP when consumed.',
    weight: 2,
    type: 'consumable',
    slot: null,
    damage: null,
    ac_bonus: null,
    heal: '2d4+2',
    effect: null,
    aliases: ['healing potion', 'potion', 'health potion'],
  },
  healers_kit: {
    // Healer's Kit (SRD) — bandages, splints, and salves. Used (an action) to
    // STABILIZE a dying creature: it stops rolling death saves. Reusable (RAW it
    // has 10 charges; pansori doesn't yet track per-use charges, so it isn't
    // consumed). Wired via the `stabilize` effect in handleUse.
    id: 'healers_kit',
    value: 5,
    name: "Healer's Kit",
    desc: 'Bag of bandages, splints, and salves. Use an action to stabilize a dying creature (stops its death saves).',
    weight: 3,
    type: 'consumable',
    slot: null,
    damage: null,
    ac_bonus: null,
    heal: null,
    effect: 'stabilize',
    aliases: ['healers kit', "healer's kit", 'healers_kit'],
  },
  holy_symbol: {
    id: 'holy_symbol',
    value: 5,
    name: 'Holy Symbol',
    desc: 'A holy symbol that serves as a divine spellcasting focus.',
    weight: 2,
    type: 'misc',
    slot: null,
    damage: null,
    ac_bonus: null,
    heal: null,
    effect: 'spellcasting_focus',
    aliases: ['holy symbol', 'symbol', 'holy focus'],
  },
  torch: {
    // SRD light source — held in the off hand. While equipped it sheds bright
    // light in a 20-ft radius (dim to 40 ft); wired into combat lighting via a
    // `light` worn effect synced onto the bearer's entity at combat start, so a
    // torch-bearer negates the darkness penalty around them. Mundane, so the
    // Darkness spell can't snuff it (it just can't pierce magical darkness).
    id: 'torch',
    value: 1,
    name: 'Torch',
    desc: 'Sheds bright light in a 20-foot radius and dim light for an additional 20 feet. Burns for 1 hour.',
    weight: 1,
    type: 'misc',
    slot: 'off_hand',
    damage: null,
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['torch'],
    wornEffects: [{ kind: 'light', radiusFt: 20 }],
  },
  hooded_lantern: {
    // SRD light source — a brighter, steadier alternative to the Torch. Bright
    // light 30 ft, dim to 60 ft. Same `light` worn-effect wiring.
    id: 'hooded_lantern',
    value: 5,
    name: 'Hooded Lantern',
    desc: 'Sheds bright light in a 30-foot radius and dim light for an additional 30 feet. Burns 6 hours on a flask of oil.',
    weight: 2,
    type: 'misc',
    slot: 'off_hand',
    damage: null,
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['hooded lantern', 'lantern'],
    wornEffects: [{ kind: 'light', radiusFt: 30 }],
  },
  component_pouch: {
    id: 'component_pouch',
    value: 25,
    name: 'Component Pouch',
    desc: 'A leather pouch of spellcasting components.',
    weight: 2,
    type: 'misc',
    slot: null,
    damage: null,
    ac_bonus: null,
    heal: null,
    effect: 'spellcasting_focus',
    aliases: ['component pouch', 'pouch', 'spell components'],
  },
  bullseye_lantern: {
    // SRD light source — a focused beam. Modeled as a 60-ft bright radius (the
    // RAW 60-ft cone simplified to a radius), dim to 120 ft. Same `light`
    // worn-effect wiring as the Torch / Hooded Lantern.
    id: 'bullseye_lantern',
    value: 10,
    name: 'Bullseye Lantern',
    desc: 'Casts bright light in a 60-foot cone and dim light for an additional 60 feet. Burns 6 hours on a flask of oil.',
    weight: 2,
    type: 'misc',
    slot: 'off_hand',
    damage: null,
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['bullseye lantern', 'bullseye'],
    wornEffects: [{ kind: 'light', radiusFt: 60 }],
  },

  // ─── Consumable gear ─────────────────────────────────────────────────────────
  antitoxin: {
    // SRD — drink to gain Advantage on the next save vs poison. Reuses the
    // consumable `con_advantage` effect (handleUse rolls a CON save w/ advantage).
    id: 'antitoxin',
    value: 50,
    name: 'Antitoxin',
    desc: 'Drink as an action to gain advantage on your next saving throw against poison for 1 hour.',
    weight: 0,
    type: 'consumable',
    slot: null,
    damage: null,
    ac_bonus: null,
    heal: null,
    effect: 'con_advantage',
    aliases: ['antitoxin', 'anti-toxin'],
  },
  rations: {
    id: 'rations',
    value: 1,
    name: 'Rations',
    desc: 'A day of dried food. Eat to stave off hunger on the road.',
    weight: 2,
    type: 'consumable',
    slot: null,
    damage: null,
    ac_bonus: null,
    heal: null,
    effect: null,
    useNarrative: 'You eat a day of trail rations — dry, but filling.',
    aliases: ['rations', 'trail rations', 'ration'],
  },
  oil_flask: {
    id: 'oil_flask',
    value: 1,
    name: 'Oil (flask)',
    desc: 'A flask of lamp oil. Refuels a lantern (6 hours) or can be poured out and set alight.',
    weight: 1,
    type: 'consumable',
    slot: null,
    damage: null,
    ac_bonus: null,
    heal: null,
    effect: null,
    useNarrative:
      'You ready the flask of oil — pour it to refuel a lantern, or spread it to be lit.',
    aliases: ['oil', 'oil flask', 'flask of oil', 'lamp oil'],
  },
  acid_vial: {
    // SRD thrown splash weapon — throw at a foe (DEX ranged attack); on a hit,
    // 2d6 acid. See the `throw_item` action.
    id: 'acid_vial',
    value: 25,
    name: 'Acid (vial)',
    desc: 'A vial of corrosive acid. Throw it at a creature (ranged attack) for 2d6 acid damage on a hit.',
    weight: 1,
    type: 'consumable',
    slot: null,
    damage: null,
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['acid', 'acid vial', 'vial of acid'],
    splash: { damage: '2d6', damageType: 'acid' },
  },
  alchemists_fire: {
    // SRD thrown splash weapon — 1d4 fire on a hit, then the target burns (1d4
    // fire at the start of each of its turns; DC 10 DEX to douse).
    id: 'alchemists_fire',
    value: 50,
    name: "Alchemist's Fire (flask)",
    desc: 'A sticky, volatile fluid. Throw it (ranged attack) for 1d4 fire on a hit; the target then burns for 1d4 fire each turn until it douses the flames (DC 10 DEX).',
    weight: 1,
    type: 'consumable',
    slot: null,
    damage: null,
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ["alchemist's fire", 'alchemists fire', 'alchemist fire'],
    splash: { damage: '1d4', damageType: 'fire', burn: '1d4' },
  },
  holy_water: {
    // SRD thrown splash weapon — 2d6 radiant, but ONLY to Fiends and Undead
    // (gated on Enemy.creatureType). Splashes harmlessly off anything else.
    id: 'holy_water',
    value: 25,
    name: 'Holy Water (flask)',
    desc: 'Blessed water. Throw it (ranged attack) at a Fiend or Undead for 2d6 radiant damage on a hit; harmless to other creatures.',
    weight: 1,
    type: 'consumable',
    slot: null,
    damage: null,
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['holy water', 'flask of holy water'],
    splash: { damage: '2d6', damageType: 'radiant', vsCreatureTypes: ['undead', 'fiend'] },
  },

  // ─── Tools ───────────────────────────────────────────────────────────────────
  // Physical tools. The mechanical edge is tool *proficiency* (a Character
  // trait granted by background/class — e.g. Thieves' Tools proficiency adds the
  // proficiency bonus to a trap-disarm check); these items represent the kit
  // itself so campaigns can grant, sell, or loot them.
  thieves_tools: {
    id: 'thieves_tools',
    value: 25,
    name: "Thieves' Tools",
    desc: 'Picks, a file, and small mirrors. Proficiency lets you pick locks and disarm traps.',
    weight: 1,
    type: 'misc',
    slot: null,
    damage: null,
    ac_bonus: null,
    heal: null,
    effect: null,
    useNarrative: 'You ready your thieves’ tools — picks and probes at hand.',
    aliases: ['thieves tools', "thieves' tools", 'lockpicks', 'lock picks'],
  },
  herbalism_kit: {
    id: 'herbalism_kit',
    value: 5,
    name: 'Herbalism Kit',
    desc: 'Pouches, clippers, and vials for identifying plants and brewing remedies.',
    weight: 3,
    type: 'misc',
    slot: null,
    damage: null,
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['herbalism kit', 'herbalist kit'],
  },
  disguise_kit: {
    id: 'disguise_kit',
    value: 25,
    name: 'Disguise Kit',
    desc: 'Cosmetics, props, and prosthetics for altering your appearance.',
    weight: 3,
    type: 'misc',
    slot: null,
    damage: null,
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['disguise kit'],
  },
  forgery_kit: {
    id: 'forgery_kit',
    value: 15,
    name: 'Forgery Kit',
    desc: 'Papers, inks, seals, and wax for producing convincing fake documents.',
    weight: 5,
    type: 'misc',
    slot: null,
    damage: null,
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['forgery kit'],
  },
  navigators_tools: {
    id: 'navigators_tools',
    value: 25,
    name: "Navigator's Tools",
    desc: 'Charts, a compass, and instruments for plotting a course and avoiding hazards.',
    weight: 2,
    type: 'misc',
    slot: null,
    damage: null,
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['navigators tools', "navigator's tools"],
  },
  poisoners_kit: {
    id: 'poisoners_kit',
    value: 50,
    name: "Poisoner's Kit",
    desc: 'Vials, chemicals, and gloves for crafting and applying poisons.',
    weight: 2,
    type: 'misc',
    slot: null,
    damage: null,
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['poisoners kit', "poisoner's kit"],
  },
  artisans_tools: {
    id: 'artisans_tools',
    value: 20,
    name: "Artisan's Tools",
    desc: "A tradesperson's implements (smith's, carpenter's, mason's, etc.) for crafting goods.",
    weight: 5,
    type: 'misc',
    slot: null,
    damage: null,
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['artisans tools', "artisan's tools", 'craftsman tools'],
  },
  gaming_set: {
    id: 'gaming_set',
    value: 1,
    name: 'Gaming Set',
    desc: 'Dice or cards for a game of chance — and the social leverage a friendly wager brings.',
    weight: 0,
    type: 'misc',
    slot: null,
    damage: null,
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['gaming set', 'dice set', 'playing cards'],
  },
  musical_instrument: {
    id: 'musical_instrument',
    value: 20,
    name: 'Musical Instrument',
    desc: 'A lute, flute, drum, or horn — a Bard’s focus and a fine way to earn coin.',
    weight: 2,
    type: 'misc',
    slot: null,
    damage: null,
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['musical instrument', 'instrument', 'lute', 'flute'],
  },

  // ─── Adventuring gear ────────────────────────────────────────────────────────
  backpack: {
    id: 'backpack',
    value: 2,
    name: 'Backpack',
    desc: 'A sturdy pack for hauling your gear.',
    weight: 5,
    type: 'misc',
    slot: null,
    damage: null,
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['backpack', 'pack', 'rucksack'],
  },
  bedroll: {
    id: 'bedroll',
    value: 1,
    name: 'Bedroll',
    desc: 'A padded roll for sleeping rough on the road.',
    weight: 7,
    type: 'misc',
    slot: null,
    damage: null,
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['bedroll', 'sleeping roll'],
  },
  rope_hempen: {
    id: 'rope_hempen',
    value: 1,
    name: 'Hempen Rope (50 ft)',
    desc: '50 feet of hempen rope. Climbing, binding, and a hundred other uses.',
    weight: 10,
    type: 'misc',
    slot: null,
    damage: null,
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['rope', 'hempen rope', 'rope (50 ft)'],
  },
  grappling_hook: {
    id: 'grappling_hook',
    value: 2,
    name: 'Grappling Hook',
    desc: 'An iron hook for anchoring a rope to a ledge or wall.',
    weight: 4,
    type: 'misc',
    slot: null,
    damage: null,
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['grappling hook', 'hook'],
  },
  climbers_kit: {
    id: 'climbers_kit',
    value: 25,
    name: "Climber's Kit",
    desc: 'Pitons, boot tips, gloves, and a harness for scaling sheer surfaces.',
    weight: 12,
    type: 'misc',
    slot: null,
    damage: null,
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['climbers kit', "climber's kit"],
  },
  crowbar: {
    id: 'crowbar',
    value: 2,
    name: 'Crowbar',
    desc: 'An iron bar for prying open doors, crates, and lids.',
    weight: 5,
    type: 'misc',
    slot: null,
    damage: null,
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['crowbar', 'pry bar'],
  },
  tinderbox: {
    id: 'tinderbox',
    value: 1,
    name: 'Tinderbox',
    desc: 'Flint, steel, and tinder for starting a fire — or lighting a torch or lantern.',
    weight: 1,
    type: 'misc',
    slot: null,
    damage: null,
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['tinderbox', 'tinder box', 'flint and steel'],
  },
  waterskin: {
    id: 'waterskin',
    value: 1,
    name: 'Waterskin',
    desc: 'A leather skin holding about a day of water.',
    weight: 5,
    type: 'misc',
    slot: null,
    damage: null,
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['waterskin', 'water skin'],
  },
  mess_kit: {
    id: 'mess_kit',
    value: 1,
    name: 'Mess Kit',
    desc: 'A tin cup, cutlery, and a pan that nest together for eating on the trail.',
    weight: 1,
    type: 'misc',
    slot: null,
    damage: null,
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['mess kit'],
  },

  // ─── Ammunition ──────────────────────────────────────────────────────────────
  // Stackable bundles (default 20) equipped into the `quiver` slot. A ranged
  // attack with a matching weapon spends one (preattack.ts); when the stack hits
  // 0 it's removed and the quiver slot cleared. Each id contains the substring
  // the weapon→ammo map keys on (arrow / bolt / sling_bullet / needle /
  // firearm_bullet) so the right ammo is matched to the right weapon.
  arrows: {
    id: 'arrows',
    value: 1,
    name: 'Arrows',
    desc: 'A bundle of arrows for a shortbow or longbow.',
    weight: 1,
    type: 'misc',
    slot: 'quiver',
    damage: null,
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['arrows', 'arrow', 'quiver of arrows'],
    count: 20,
  },
  crossbow_bolts: {
    id: 'crossbow_bolts',
    value: 1,
    name: 'Crossbow Bolts',
    desc: 'A case of bolts for a hand, light, or heavy crossbow.',
    weight: 1,
    type: 'misc',
    slot: 'quiver',
    damage: null,
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['crossbow bolts', 'bolts', 'bolt', 'case of bolts'],
    count: 20,
  },
  sling_bullets: {
    id: 'sling_bullets',
    value: 1,
    name: 'Sling Bullets',
    desc: 'A pouch of lead bullets for a sling.',
    weight: 1,
    type: 'misc',
    slot: 'quiver',
    damage: null,
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['sling bullets', 'sling bullet'],
    count: 20,
  },
  blowgun_needles: {
    id: 'blowgun_needles',
    value: 1,
    name: 'Blowgun Needles',
    desc: 'A tin of needles for a blowgun.',
    weight: 1,
    type: 'misc',
    slot: 'quiver',
    damage: null,
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['blowgun needles', 'needles', 'needle'],
    count: 50,
  },
  firearm_bullets: {
    id: 'firearm_bullets',
    value: 3,
    name: 'Firearm Bullets',
    desc: 'A pouch of bullets for a musket or pistol.',
    weight: 2,
    type: 'misc',
    slot: 'quiver',
    damage: null,
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['firearm bullets', 'firearm bullet', 'gun bullets'],
    count: 20,
  },

  // ─── Magic items ─────────────────────────────────────────────────────────────
  // The first attuned wondrous items in the catalog — they exercise the worn-
  // effect + attunement infra (worn AND attuned to take effect). Their AC bonus
  // is a `wornEffects` ac_bonus (folded into the stored `ac` on equip / attune);
  // the all-saves bonus rides `wornSaveBonus` (applied at condition saves, the
  // wired save path). Both stack with armor, a shield, and each other.
  cloak_of_protection: {
    // SRD Cloak of Protection — Wondrous Item, Uncommon (Requires Attunement).
    id: 'cloak_of_protection',
    value: 500,
    name: 'Cloak of Protection',
    desc: 'While worn and attuned, you gain a +1 bonus to Armor Class and to all saving throws. (Uncommon; requires attunement.)',
    weight: 1,
    type: 'misc',
    slot: 'cloak',
    damage: null,
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['cloak of protection', 'protective cloak'],
    requiresAttunement: true,
    wornEffects: [
      { kind: 'ac_bonus', bonus: 1 },
      { kind: 'save_bonus', ability: 'all', bonus: 1 },
    ],
  },
  ring_of_protection: {
    // SRD Ring of Protection — Ring, Rare (Requires Attunement). Mechanically
    // identical to the Cloak; a different body slot, so the two stack.
    id: 'ring_of_protection',
    value: 3500,
    name: 'Ring of Protection',
    desc: 'While worn and attuned, you gain a +1 bonus to Armor Class and to all saving throws. (Rare; requires attunement.)',
    weight: 0,
    type: 'misc',
    slot: 'ring',
    damage: null,
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['ring of protection', 'protection ring'],
    requiresAttunement: true,
    wornEffects: [
      { kind: 'ac_bonus', bonus: 1 },
      { kind: 'save_bonus', ability: 'all', bonus: 1 },
    ],
  },

  // ─── Stat-set wondrous items ─────────────────────────────────────────────────
  // While worn + attuned these SET an ability score (no effect if the base is
  // already that high) via a `set_ability` worn effect. syncSetAbilities keeps
  // the live score effective and restores the base on removal; a CON change
  // ripples into max HP. Different body slots, so they coexist.
  amulet_of_health: {
    // SRD Amulet of Health — Wondrous Item, Rare (Requires Attunement).
    id: 'amulet_of_health',
    value: 3500,
    name: 'Amulet of Health',
    desc: 'While worn and attuned, your Constitution is 19 (no effect if it is already 19+). Your hit point maximum adjusts to match. (Rare; requires attunement.)',
    weight: 1,
    type: 'misc',
    slot: 'neck',
    damage: null,
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['amulet of health', 'health amulet'],
    requiresAttunement: true,
    wornEffects: [{ kind: 'set_ability', ability: 'con', value: 19 }],
  },
  gauntlets_of_ogre_power: {
    // SRD Gauntlets of Ogre Power — Wondrous Item, Uncommon (Requires Attunement).
    id: 'gauntlets_of_ogre_power',
    value: 500,
    name: 'Gauntlets of Ogre Power',
    desc: 'While worn and attuned, your Strength is 19 (no effect if it is already 19+). (Uncommon; requires attunement.)',
    weight: 2,
    type: 'misc',
    slot: 'hands',
    damage: null,
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['gauntlets of ogre power', 'ogre power gauntlets', 'ogre gauntlets'],
    requiresAttunement: true,
    wornEffects: [{ kind: 'set_ability', ability: 'str', value: 19 }],
  },
  headband_of_intellect: {
    // SRD Headband of Intellect — Wondrous Item, Uncommon (Requires Attunement).
    id: 'headband_of_intellect',
    value: 500,
    name: 'Headband of Intellect',
    desc: 'While worn and attuned, your Intelligence is 19 (no effect if it is already 19+). (Uncommon; requires attunement.)',
    weight: 0,
    type: 'misc',
    slot: 'head',
    damage: null,
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['headband of intellect', 'intellect headband'],
    requiresAttunement: true,
    wornEffects: [{ kind: 'set_ability', ability: 'int', value: 19 }],
  },
  belt_of_hill_giant_strength: {
    // SRD Belt of Giant Strength (hill) — Wondrous Item, Rare (Requires Attunement).
    id: 'belt_of_hill_giant_strength',
    value: 3500,
    name: 'Belt of Hill Giant Strength',
    desc: 'While worn and attuned, your Strength is 21 (no effect if it is already 21+). (Rare; requires attunement.)',
    weight: 1,
    type: 'misc',
    slot: 'waist',
    damage: null,
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['belt of hill giant strength', 'hill giant belt'],
    requiresAttunement: true,
    wornEffects: [{ kind: 'set_ability', ability: 'str', value: 21 }],
  },
  belt_of_stone_giant_strength: {
    // SRD Belt of Giant Strength (stone/frost) — Wondrous Item, Very Rare.
    id: 'belt_of_stone_giant_strength',
    value: 15000,
    name: 'Belt of Stone Giant Strength',
    desc: 'While worn and attuned, your Strength is 23 (no effect if it is already 23+). (Very Rare; requires attunement.)',
    weight: 1,
    type: 'misc',
    slot: 'waist',
    damage: null,
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['belt of stone giant strength', 'belt of frost giant strength', 'stone giant belt'],
    requiresAttunement: true,
    wornEffects: [{ kind: 'set_ability', ability: 'str', value: 23 }],
  },
  belt_of_fire_giant_strength: {
    // SRD Belt of Giant Strength (fire) — Wondrous Item, Very Rare.
    id: 'belt_of_fire_giant_strength',
    value: 18000,
    name: 'Belt of Fire Giant Strength',
    desc: 'While worn and attuned, your Strength is 25 (no effect if it is already 25+). (Very Rare; requires attunement.)',
    weight: 1,
    type: 'misc',
    slot: 'waist',
    damage: null,
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['belt of fire giant strength', 'fire giant belt'],
    requiresAttunement: true,
    wornEffects: [{ kind: 'set_ability', ability: 'str', value: 25 }],
  },
  belt_of_cloud_giant_strength: {
    // SRD Belt of Giant Strength (cloud) — Wondrous Item, Legendary.
    id: 'belt_of_cloud_giant_strength',
    value: 36000,
    name: 'Belt of Cloud Giant Strength',
    desc: 'While worn and attuned, your Strength is 27 (no effect if it is already 27+). (Legendary; requires attunement.)',
    weight: 1,
    type: 'misc',
    slot: 'waist',
    damage: null,
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['belt of cloud giant strength', 'cloud giant belt'],
    requiresAttunement: true,
    wornEffects: [{ kind: 'set_ability', ability: 'str', value: 27 }],
  },
  belt_of_storm_giant_strength: {
    // SRD Belt of Giant Strength (storm) — Wondrous Item, Legendary.
    id: 'belt_of_storm_giant_strength',
    value: 48000,
    name: 'Belt of Storm Giant Strength',
    desc: 'While worn and attuned, your Strength is 29 (no effect if it is already 29+). (Legendary; requires attunement.)',
    weight: 1,
    type: 'misc',
    slot: 'waist',
    damage: null,
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['belt of storm giant strength', 'storm giant belt'],
    requiresAttunement: true,
    wornEffects: [{ kind: 'set_ability', ability: 'str', value: 29 }],
  },

  // ─── Healing potions (the SRD rarity ladder above the base 2d4+2) ────────────
  // ─── Worn magic items: resistances, senses, movement (SRD 5.2.1) ─────────────
  bracers_of_defense: {
    // SRD Bracers of Defense — Wondrous Item, Rare (Requires Attunement).
    id: 'bracers_of_defense',
    value: 3500,
    name: 'Bracers of Defense',
    desc: 'While worn and attuned, you gain a +2 bonus to Armor Class if you wear no armor and use no Shield. (Rare; requires attunement.)',
    weight: 1,
    type: 'misc',
    slot: 'arms',
    damage: null,
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['bracers of defense', 'defense bracers'],
    requiresAttunement: true,
    wornEffects: [{ kind: 'ac_bonus', bonus: 2, unarmoredOnly: true }],
  },
  ring_of_acid_resistance: {
    // SRD Ring of Resistance (acid, pearl) — Ring, Rare.
    id: 'ring_of_acid_resistance',
    value: 3500,
    name: 'Ring of Acid Resistance',
    desc: 'A ring set with a pearl. While worn, you have Resistance to Acid damage. (Rare.)',
    weight: 0,
    type: 'misc',
    slot: 'ring',
    damage: null,
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['ring of acid resistance', 'pearl ring'],
    wornEffects: [{ kind: 'resistance', damageType: 'acid' }],
  },
  ring_of_cold_resistance: {
    // SRD Ring of Resistance (cold, tourmaline) — Ring, Rare.
    id: 'ring_of_cold_resistance',
    value: 3500,
    name: 'Ring of Cold Resistance',
    desc: 'A ring set with a tourmaline. While worn, you have Resistance to Cold damage. (Rare.)',
    weight: 0,
    type: 'misc',
    slot: 'ring',
    damage: null,
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['ring of cold resistance', 'tourmaline ring'],
    wornEffects: [{ kind: 'resistance', damageType: 'cold' }],
  },
  ring_of_fire_resistance: {
    // SRD Ring of Resistance (fire, garnet) — Ring, Rare.
    id: 'ring_of_fire_resistance',
    value: 3500,
    name: 'Ring of Fire Resistance',
    desc: 'A ring set with a garnet. While worn, you have Resistance to Fire damage. (Rare.)',
    weight: 0,
    type: 'misc',
    slot: 'ring',
    damage: null,
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['ring of fire resistance', 'garnet ring'],
    wornEffects: [{ kind: 'resistance', damageType: 'fire' }],
  },
  ring_of_force_resistance: {
    // SRD Ring of Resistance (force, sapphire) — Ring, Rare.
    id: 'ring_of_force_resistance',
    value: 3500,
    name: 'Ring of Force Resistance',
    desc: 'A ring set with a sapphire. While worn, you have Resistance to Force damage. (Rare.)',
    weight: 0,
    type: 'misc',
    slot: 'ring',
    damage: null,
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['ring of force resistance', 'sapphire ring'],
    wornEffects: [{ kind: 'resistance', damageType: 'force' }],
  },
  ring_of_lightning_resistance: {
    // SRD Ring of Resistance (lightning, citrine) — Ring, Rare.
    id: 'ring_of_lightning_resistance',
    value: 3500,
    name: 'Ring of Lightning Resistance',
    desc: 'A ring set with a citrine. While worn, you have Resistance to Lightning damage. (Rare.)',
    weight: 0,
    type: 'misc',
    slot: 'ring',
    damage: null,
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['ring of lightning resistance', 'citrine ring'],
    wornEffects: [{ kind: 'resistance', damageType: 'lightning' }],
  },
  ring_of_necrotic_resistance: {
    // SRD Ring of Resistance (necrotic, jet) — Ring, Rare.
    id: 'ring_of_necrotic_resistance',
    value: 3500,
    name: 'Ring of Necrotic Resistance',
    desc: 'A ring set with a jet. While worn, you have Resistance to Necrotic damage. (Rare.)',
    weight: 0,
    type: 'misc',
    slot: 'ring',
    damage: null,
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['ring of necrotic resistance', 'jet ring'],
    wornEffects: [{ kind: 'resistance', damageType: 'necrotic' }],
  },
  ring_of_poison_resistance: {
    // SRD Ring of Resistance (poison, amethyst) — Ring, Rare.
    id: 'ring_of_poison_resistance',
    value: 3500,
    name: 'Ring of Poison Resistance',
    desc: 'A ring set with a amethyst. While worn, you have Resistance to Poison damage. (Rare.)',
    weight: 0,
    type: 'misc',
    slot: 'ring',
    damage: null,
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['ring of poison resistance', 'amethyst ring'],
    wornEffects: [{ kind: 'resistance', damageType: 'poison' }],
  },
  ring_of_psychic_resistance: {
    // SRD Ring of Resistance (psychic, jade) — Ring, Rare.
    id: 'ring_of_psychic_resistance',
    value: 3500,
    name: 'Ring of Psychic Resistance',
    desc: 'A ring set with a jade. While worn, you have Resistance to Psychic damage. (Rare.)',
    weight: 0,
    type: 'misc',
    slot: 'ring',
    damage: null,
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['ring of psychic resistance', 'jade ring'],
    wornEffects: [{ kind: 'resistance', damageType: 'psychic' }],
  },
  ring_of_radiant_resistance: {
    // SRD Ring of Resistance (radiant, topaz) — Ring, Rare.
    id: 'ring_of_radiant_resistance',
    value: 3500,
    name: 'Ring of Radiant Resistance',
    desc: 'A ring set with a topaz. While worn, you have Resistance to Radiant damage. (Rare.)',
    weight: 0,
    type: 'misc',
    slot: 'ring',
    damage: null,
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['ring of radiant resistance', 'topaz ring'],
    wornEffects: [{ kind: 'resistance', damageType: 'radiant' }],
  },
  ring_of_thunder_resistance: {
    // SRD Ring of Resistance (thunder, spinel) — Ring, Rare.
    id: 'ring_of_thunder_resistance',
    value: 3500,
    name: 'Ring of Thunder Resistance',
    desc: 'A ring set with a spinel. While worn, you have Resistance to Thunder damage. (Rare.)',
    weight: 0,
    type: 'misc',
    slot: 'ring',
    damage: null,
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['ring of thunder resistance', 'spinel ring'],
    wornEffects: [{ kind: 'resistance', damageType: 'thunder' }],
  },
  boots_of_the_winterlands: {
    // SRD Boots of the Winterlands — Wondrous Item, Uncommon (Requires Attunement). Simplification: ignoring ice / snow Difficult Terrain is not modeled.
    id: 'boots_of_the_winterlands',
    value: 500,
    name: 'Boots of the Winterlands',
    desc: 'While worn and attuned, you have Resistance to Cold damage and shrug off freezing temperatures. (Uncommon; requires attunement.)',
    weight: 1,
    type: 'misc',
    slot: 'feet',
    damage: null,
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['boots of the winterlands', 'winterlands boots'],
    requiresAttunement: true,
    wornEffects: [{ kind: 'resistance', damageType: 'cold' }],
  },
  ring_of_warmth: {
    // SRD Ring of Warmth — Ring, Uncommon (Requires Attunement).
    id: 'ring_of_warmth',
    value: 500,
    name: 'Ring of Warmth',
    desc: 'While worn and attuned, Cold damage you take is reduced by 2d8, and freezing temperatures leave you unharmed. (Uncommon; requires attunement.)',
    weight: 0,
    type: 'misc',
    slot: 'ring',
    damage: null,
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['ring of warmth', 'warmth ring'],
    requiresAttunement: true,
    wornEffects: [{ kind: 'damage_reduction', damageType: 'cold', dice: '2d8' }],
  },
  brooch_of_shielding: {
    // SRD Brooch of Shielding — Wondrous Item, Uncommon (Requires Attunement).
    id: 'brooch_of_shielding',
    value: 500,
    name: 'Brooch of Shielding',
    desc: 'While worn and attuned, you have Resistance to Force damage and take no damage from Magic Missile. (Uncommon; requires attunement.)',
    weight: 0,
    type: 'misc',
    slot: 'neck',
    damage: null,
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['brooch of shielding', 'shielding brooch'],
    requiresAttunement: true,
    wornEffects: [
      { kind: 'resistance', damageType: 'force' },
      { kind: 'spell_immunity', spellId: 'magic_missile' },
    ],
  },
  periapt_of_proof_against_poison: {
    // SRD Periapt of Proof against Poison — Wondrous Item, Rare (Requires Attunement).
    id: 'periapt_of_proof_against_poison',
    value: 3500,
    name: 'Periapt of Proof against Poison',
    desc: 'While worn and attuned, you have Immunity to Poison damage and to the Poisoned condition. (Rare; requires attunement.)',
    weight: 0,
    type: 'misc',
    slot: 'neck',
    damage: null,
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['periapt of proof against poison', 'poison periapt'],
    requiresAttunement: true,
    wornEffects: [
      { kind: 'damage_immunity', damageType: 'poison' },
      { kind: 'condition_immunity', condition: 'poisoned' },
    ],
  },
  mantle_of_spell_resistance: {
    // SRD Mantle of Spell Resistance — Wondrous Item, Rare (Requires Attunement). Applied to enemy spells' saves.
    id: 'mantle_of_spell_resistance',
    value: 3500,
    name: 'Mantle of Spell Resistance',
    desc: 'While worn and attuned, you have Advantage on saving throws against spells. (Rare; requires attunement.)',
    weight: 1,
    type: 'misc',
    slot: 'cloak',
    damage: null,
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['mantle of spell resistance', 'spell resistance mantle'],
    requiresAttunement: true,
    wornEffects: [{ kind: 'spell_save_advantage' }],
  },
  boots_of_striding_and_springing: {
    // SRD Boots of Striding and Springing — Wondrous Item, Uncommon (Requires Attunement). Simplification: the long jump isn't modeled.
    id: 'boots_of_striding_and_springing',
    value: 500,
    name: 'Boots of Striding and Springing',
    desc: "While worn and attuned, your Speed is at least 30 feet and carried weight doesn't slow you. (Uncommon; requires attunement.)",
    weight: 1,
    type: 'misc',
    slot: 'feet',
    damage: null,
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['boots of striding and springing', 'striding boots'],
    requiresAttunement: true,
    wornEffects: [{ kind: 'speed_floor', feet: 30 }],
  },
  ring_of_swimming: {
    // SRD Ring of Swimming — Ring, Uncommon.
    id: 'ring_of_swimming',
    value: 500,
    name: 'Ring of Swimming',
    desc: 'While worn, you have a Swim Speed of 40 feet. (Uncommon.)',
    weight: 0,
    type: 'misc',
    slot: 'ring',
    damage: null,
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['ring of swimming', 'swimming ring'],
    wornEffects: [{ kind: 'speed_mode', mode: 'swim', feet: 40 }],
  },
  gloves_of_swimming_and_climbing: {
    // SRD Gloves of Swimming and Climbing — Wondrous Item, Uncommon (Requires Attunement). Simplification: the +5 Athletics bonus isn't modeled.
    id: 'gloves_of_swimming_and_climbing',
    value: 500,
    name: 'Gloves of Swimming and Climbing',
    desc: 'While worn and attuned, you have a Climb Speed and a Swim Speed equal to your Speed. (Uncommon; requires attunement.)',
    weight: 0,
    type: 'misc',
    slot: 'hands',
    damage: null,
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['gloves of swimming and climbing', 'climbing gloves'],
    requiresAttunement: true,
    wornEffects: [
      { kind: 'speed_mode', mode: 'climb', feet: 'walk' },
      { kind: 'speed_mode', mode: 'swim', feet: 'walk' },
    ],
  },
  slippers_of_spider_climbing: {
    // SRD Slippers of Spider Climbing — Wondrous Item, Uncommon (Requires Attunement).
    id: 'slippers_of_spider_climbing',
    value: 500,
    name: 'Slippers of Spider Climbing',
    desc: 'While worn and attuned, you have a Climb Speed equal to your Speed. (Uncommon; requires attunement.)',
    weight: 0,
    type: 'misc',
    slot: 'feet',
    damage: null,
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['slippers of spider climbing', 'spider slippers'],
    requiresAttunement: true,
    wornEffects: [{ kind: 'speed_mode', mode: 'climb', feet: 'walk' }],
  },
  boots_of_elvenkind: {
    // SRD Boots of Elvenkind — Wondrous Item, Uncommon.
    id: 'boots_of_elvenkind',
    value: 500,
    name: 'Boots of Elvenkind',
    desc: 'While worn, your steps make no sound and you have Advantage on Dexterity (Stealth) checks. (Uncommon.)',
    weight: 1,
    type: 'misc',
    slot: 'feet',
    damage: null,
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['boots of elvenkind', 'elven boots'],
    wornEffects: [{ kind: 'skill_advantage', skill: 'stealth' }],
  },
  cloak_of_elvenkind: {
    // SRD Cloak of Elvenkind — Wondrous Item, Uncommon (Requires Attunement). Simplification: the Disadvantage on Perception to spot you isn't modeled.
    id: 'cloak_of_elvenkind',
    value: 500,
    name: 'Cloak of Elvenkind',
    desc: 'While worn and attuned, you have Advantage on Dexterity (Stealth) checks, and Perception checks to spot you have Disadvantage. (Uncommon; requires attunement.)',
    weight: 1,
    type: 'misc',
    slot: 'cloak',
    damage: null,
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['cloak of elvenkind', 'elven cloak'],
    requiresAttunement: true,
    wornEffects: [{ kind: 'skill_advantage', skill: 'stealth' }],
  },
  eyes_of_the_eagle: {
    // SRD Eyes of the Eagle — Wondrous Item, Uncommon.
    id: 'eyes_of_the_eagle',
    value: 500,
    name: 'Eyes of the Eagle',
    desc: 'While worn, you have Advantage on Wisdom (Perception) checks that rely on sight. (Uncommon.)',
    weight: 0,
    type: 'misc',
    slot: 'head',
    damage: null,
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['eyes of the eagle', 'eagle lenses'],
    wornEffects: [{ kind: 'skill_advantage', skill: 'perception' }],
  },
  goggles_of_night: {
    // SRD Goggles of Night — Wondrous Item, Uncommon.
    id: 'goggles_of_night',
    value: 500,
    name: 'Goggles of Night',
    desc: 'While worn, you have Darkvision out to 60 feet, or 60 feet more if you already have it. (Uncommon.)',
    weight: 0,
    type: 'misc',
    slot: 'head',
    damage: null,
    ac_bonus: null,
    heal: null,
    effect: null,
    aliases: ['goggles of night', 'night goggles'],
    wornEffects: [{ kind: 'darkvision', feet: 60 }],
  },
  sentinel_shield: {
    // SRD Sentinel Shield — Armor (Shield), Uncommon: a Shield (+2 AC) that
    // grants Advantage on Initiative and Wisdom (Perception) checks.
    id: 'sentinel_shield',
    value: 500,
    name: 'Sentinel Shield',
    desc: 'A Shield (+2 AC) emblazoned with an eye. While holding it, you have Advantage on Initiative rolls and Wisdom (Perception) checks. (Uncommon.)',
    weight: 6,
    type: 'armor',
    slot: 'shield',
    damage: null,
    armorCategory: 'shield',
    ac_bonus: 2,
    heal: null,
    effect: null,
    aliases: ['sentinel shield', 'eye shield'],
    wornEffects: [
      { kind: 'initiative_advantage' },
      { kind: 'skill_advantage', skill: 'perception' },
    ],
  },
  greater_healing_potion: {
    // SRD Potion of Healing (greater) — Uncommon. Drunk/administered as a Bonus
    // Action like the base potion (handleUse `heal`).
    id: 'greater_healing_potion',
    value: 150,
    name: 'Greater Healing Potion',
    desc: 'Restores 4d4+4 HP when consumed. (Uncommon.)',
    weight: 2,
    type: 'consumable',
    slot: null,
    damage: null,
    ac_bonus: null,
    heal: '4d4+4',
    effect: null,
    aliases: ['greater healing potion', 'potion of healing greater', 'greater potion'],
  },
  superior_healing_potion: {
    // SRD Potion of Healing (superior) — Rare.
    id: 'superior_healing_potion',
    value: 500,
    name: 'Superior Healing Potion',
    desc: 'Restores 8d4+8 HP when consumed. (Rare.)',
    weight: 2,
    type: 'consumable',
    slot: null,
    damage: null,
    ac_bonus: null,
    heal: '8d4+8',
    effect: null,
    aliases: ['superior healing potion', 'potion of healing superior', 'superior potion'],
  },
  supreme_healing_potion: {
    // SRD Potion of Healing (supreme) — Very Rare.
    id: 'supreme_healing_potion',
    value: 1350,
    name: 'Supreme Healing Potion',
    desc: 'Restores 10d4+20 HP when consumed. (Very Rare.)',
    weight: 2,
    type: 'consumable',
    slot: null,
    damage: null,
    ac_bonus: null,
    heal: '10d4+20',
    effect: null,
    aliases: ['supreme healing potion', 'potion of healing supreme', 'supreme potion'],
  },
};

// ─── +1/+2/+3 magic weapons & armor ──────────────────────────────────────────
// Generated by cloning a base item and stamping `magicBonus` (no stat drift —
// the base's damage / mastery / armorAcBase / ac_bonus carry through). A +N
// weapon adds the bonus to attack + damage and counts as magical (bypasses
// nonmagical resistance); +N armor / shields add it to AC. Generic +N items
// don't require attunement (SRD). Rarity is flavor in the desc + the value band.
function magicVariant(
  baseId: string,
  bonus: 1 | 2 | 3,
  value: number,
  rarity: string,
  kind: 'weapon' | 'armor'
): [string, LootItem] {
  const base = BASE_ITEMS[baseId];
  if (!base) throw new Error(`magicVariant: unknown base item "${baseId}"`);
  const id = `${baseId}_plus_${bonus}`;
  const name = `${base.name} +${bonus}`;
  const lower = base.name.toLowerCase();
  const effect =
    kind === 'weapon'
      ? `+${bonus} to attack and damage rolls, and counts as magical`
      : `+${bonus} bonus to Armor Class`;
  return [
    id,
    {
      ...base,
      id,
      name,
      value,
      magicBonus: bonus,
      desc: `${base.desc} A magic item: ${effect}. (${rarity}.)`,
      aliases: [`${lower} +${bonus}`, `+${bonus} ${lower}`],
    },
  ];
}

// Every SRD Simple / Martial weapon and every suit of armor gets its +1 / +2 / +3
// variant ("Weapon, +1, +2, or +3" and "Armor, +1, +2, or +3" apply to any).
const WEAPON_RARITY: Array<[1 | 2 | 3, number, string]> = [
  [1, 400, 'Uncommon'],
  [2, 2000, 'Rare'],
  [3, 12000, 'Very Rare'],
];
const ARMOR_RARITY: Array<[1 | 2 | 3, number, string]> = [
  [1, 2000, 'Rare'],
  [2, 12000, 'Very Rare'],
  [3, 50000, 'Legendary'],
];
const BASE_WEAPON_IDS = Object.values(BASE_ITEMS)
  .filter((i) => i.type === 'weapon')
  .map((i) => i.id);
const BASE_ARMOR_IDS = Object.values(BASE_ITEMS)
  .filter((i) => i.type === 'armor' && i.armorCategory !== 'shield')
  .map((i) => i.id);

// SRD Ammunition, +1 / +2 / +3 — the bonus applies to the shot fired with it
// (folded into the weapon's bonus in runPreattack). Found in bundles of ten.
function magicAmmo(baseId: string, bonus: 1 | 2 | 3, value: number, rarity: string) {
  const base = BASE_ITEMS[baseId];
  const id = `${baseId}_plus_${bonus}`;
  const lower = base.name.toLowerCase();
  return [
    id,
    {
      ...base,
      id,
      name: `${base.name} +${bonus}`,
      value,
      count: 10,
      magicBonus: bonus,
      desc: `${base.desc} Magic ammunition: +${bonus} to the attack and damage rolls of a shot fired with it. (${rarity}.)`,
      aliases: [`${lower} +${bonus}`, `+${bonus} ${lower}`],
    } as LootItem,
  ] as [string, LootItem];
}

/**
 * A named magic weapon / armor / shield built on a base item (the base's
 * damage, properties, mastery and AC carry through). `desc` is our own summary.
 */
function namedMagic(
  baseId: string,
  id: string,
  name: string,
  value: number,
  desc: string,
  extra: Partial<LootItem>
): [string, LootItem] {
  const base = BASE_ITEMS[baseId];
  if (!base) throw new Error(`namedMagic: unknown base item "${baseId}"`);
  return [
    id,
    { ...base, id, name, value, desc, aliases: [name.toLowerCase()], ...extra } as LootItem,
  ];
}

const named = (ids: string[], f: (b: LootItem) => [string, LootItem]) =>
  ids.map((b) => f(BASE_ITEMS[b]));

const RESIST_TYPES = [
  'acid',
  'cold',
  'fire',
  'force',
  'lightning',
  'necrotic',
  'poison',
  'psychic',
  'radiant',
  'thunder',
];
// SRD Dragon Scale Mail — the dragon kind sets the Resistance.
const DRAGON_SCALES: Record<string, string> = {
  black: 'acid',
  blue: 'lightning',
  brass: 'fire',
  bronze: 'lightning',
  copper: 'acid',
  gold: 'fire',
  green: 'poison',
  red: 'fire',
  silver: 'cold',
  white: 'cold',
};
const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);

// ─── Potions (SRD 5.2.1) ─────────────────────────────────────────────────────
// SRD Magic Item Rarities and Values — a consumable is worth half its rarity's
// value. Drinking or administering one is a Bonus Action (handleUse); each
// potion's effect is data (`potion`, resolved in services/potions.ts).
const POTION_VALUE = {
  Common: 50,
  Uncommon: 200,
  Rare: 2000,
  'Very Rare': 20000,
  Legendary: 100000,
} as const;

function potionItem(
  id: string,
  name: string,
  rarity: keyof typeof POTION_VALUE,
  desc: string,
  potion: NonNullable<LootItem['potion']>,
  aliases: string[] = []
): [string, LootItem] {
  return [
    id,
    {
      id,
      name,
      value: POTION_VALUE[rarity],
      desc: `${desc} (${rarity}.)`,
      weight: 0.5,
      type: 'consumable',
      slot: null,
      damage: null,
      ac_bonus: null,
      heal: null,
      effect: null,
      potion,
      aliases: [name.toLowerCase(), ...aliases],
    },
  ];
}

const HOUR = 600; // rounds
const GIANT_STRENGTH: [string, number, keyof typeof POTION_VALUE][] = [
  ['hill', 21, 'Uncommon'],
  ['frost', 23, 'Rare'],
  ['stone', 23, 'Rare'],
  ['fire', 25, 'Rare'],
  ['cloud', 27, 'Very Rare'],
  ['storm', 29, 'Legendary'],
];

const POTIONS: [string, LootItem][] = [
  potionItem(
    'potion_of_climbing',
    'Potion of Climbing',
    'Common',
    'A banded brown-and-silver draught: a Climb Speed equal to your Speed for 1 hour.',
    { kind: 'condition', conditions: ['potion_climbing'], rounds: HOUR }
  ),
  potionItem(
    'potion_of_flying',
    'Potion of Flying',
    'Very Rare',
    'A clear, cloud-flecked draught: a Fly Speed equal to your Speed (and hover) for 1 hour.',
    { kind: 'condition', conditions: ['potion_flying'], rounds: HOUR }
  ),
  ...GIANT_STRENGTH.map(([giant, score, rarity]) =>
    potionItem(
      `potion_of_giant_strength_${giant}`,
      `Potion of Giant Strength (${giant})`,
      rarity,
      `Your Strength becomes ${score} for 1 hour (no effect if it is already that high).`,
      { kind: 'giant_strength', score },
      [`${giant} giant strength potion`]
    )
  ),
  potionItem(
    'potion_of_growth',
    'Potion of Growth',
    'Uncommon',
    'You gain the "enlarge" effect of Enlarge/Reduce for 10 minutes, no Concentration needed.',
    { kind: 'condition', conditions: ['enlarged'], rounds: 100 }
  ),
  potionItem(
    'potion_of_diminution',
    'Potion of Diminution',
    'Rare',
    'You gain the "reduce" effect of Enlarge/Reduce for 1d4 hours, no Concentration needed.',
    { kind: 'condition', conditions: ['reduced'], rounds: '1d4h' }
  ),
  potionItem(
    'potion_of_heroism',
    'Potion of Heroism',
    'Rare',
    'A boiling blue draught: 10 Temporary Hit Points and the effect of Bless for 1 hour, no Concentration needed.',
    { kind: 'condition', conditions: ['blessed'], rounds: HOUR, tempHp: 10 }
  ),
  potionItem(
    'potion_of_invisibility',
    'Potion of Invisibility',
    'Rare',
    'You are Invisible for 1 hour; it ends early if you attack, deal damage, or cast a spell.',
    { kind: 'condition', conditions: ['invisible'], rounds: HOUR }
  ),
  potionItem(
    'potion_of_invulnerability',
    'Potion of Invulnerability',
    'Rare',
    'A syrupy, iron-grey draught: Resistance to all damage for 1 minute.',
    { kind: 'condition', conditions: ['potion_invulnerable'], rounds: 10 }
  ),
  ...RESIST_TYPES.map((t) =>
    potionItem(
      `potion_of_resistance_${t}`,
      `Potion of Resistance (${t})`,
      'Uncommon',
      `Resistance to ${t} damage for 1 hour.`,
      { kind: 'resistance', damageType: t },
      [`${t} resistance potion`]
    )
  ),
  potionItem(
    'potion_of_speed',
    'Potion of Speed',
    'Very Rare',
    'A black-streaked yellow draught: the effect of Haste for 1 minute, no Concentration needed and no lethargy when it ends.',
    { kind: 'condition', conditions: ['hasted'], rounds: 10 }
  ),
  potionItem(
    'potion_of_vitality',
    'Potion of Vitality',
    'Very Rare',
    'Removes all Exhaustion and ends Poisoned; for 24 hours every Hit Point Die you spend heals its maximum.',
    { kind: 'cure', conditions: ['poisoned'], exhaustion: true, vitality: true }
  ),
  potionItem(
    'potion_of_water_breathing',
    'Potion of Water Breathing',
    'Uncommon',
    'A sea-smelling green draught: you can breathe underwater for 24 hours.',
    { kind: 'condition', conditions: ['water_breathing'], rounds: 24 * HOUR }
  ),
  potionItem(
    'elixir_of_health',
    'Elixir of Health',
    'Rare',
    'A bubbling red elixir that ends the Blinded, Deafened, Paralyzed, and Poisoned conditions on you.',
    { kind: 'cure', conditions: ['blinded', 'deafened', 'paralyzed', 'poisoned'] }
  ),
  // SRD Potion of Poison — illusion-masked as a beneficial potion. Simplification:
  // it is listed under its true name (no unidentified-item system).
  potionItem(
    'potion_of_poison',
    'Potion of Poison',
    'Uncommon',
    'Poison disguised as a helpful potion: 4d6 Poison damage, and a DC 13 Constitution save or Poisoned for 1 hour.',
    { kind: 'poison', damage: '4d6', dc: 13 }
  ),
  potionItem(
    'oil_of_sharpness',
    'Oil of Sharpness',
    'Very Rare',
    'Coats a nonmagical slashing or piercing melee weapon (the one in your main hand), or twenty pieces of piercing ammunition, making it +3. Takes a minute to apply.',
    { kind: 'sharpness' }
  ),
  // SRD Oil of Slipperiness — Simplification: the Freedom of Movement
  // immunities only (no Grease pour, no movement-cost or escape effects).
  potionItem(
    'oil_of_slipperiness',
    'Oil of Slipperiness',
    'Uncommon',
    "For 8 hours you can't be Paralyzed, Restrained, or Grappled (Freedom of Movement). Takes minutes to apply.",
    { kind: 'condition', conditions: ['slippery'], rounds: 8 * HOUR }
  ),
  // Narrative potions — the effect is described and adjudicated at the table.
  potionItem(
    'potion_of_animal_friendship',
    'Potion of Animal Friendship',
    'Uncommon',
    'Lets you cast the level 3 Animal Friendship (save DC 13) once.',
    {
      kind: 'narrative',
      text: 'feels a kinship with beasts — you may charm up to three Beasts with Animal Friendship (DC 13)',
    }
  ),
  potionItem(
    'potion_of_clairvoyance',
    'Potion of Clairvoyance',
    'Rare',
    'Grants the effect of Clairvoyance, no Concentration needed.',
    { kind: 'narrative', text: 'sends their senses to a distant place they know (Clairvoyance)' }
  ),
  potionItem(
    'potion_of_mind_reading',
    'Potion of Mind Reading',
    'Rare',
    'Grants the effect of Detect Thoughts (save DC 13) for 10 minutes, no Concentration needed.',
    {
      kind: 'narrative',
      text: 'hears the surface thoughts of those nearby (Detect Thoughts, DC 13)',
    }
  ),
  potionItem(
    'potion_of_gaseous_form',
    'Potion of Gaseous Form',
    'Rare',
    'Grants the effect of Gaseous Form for 1 hour, no Concentration needed.',
    { kind: 'narrative', text: 'dissolves into drifting mist (Gaseous Form, 1 hour)' }
  ),
  potionItem(
    'potion_of_longevity',
    'Potion of Longevity',
    'Very Rare',
    'Makes you 1d6 + 6 years younger — though repeated doses risk the reverse.',
    { kind: 'narrative', text: 'feels years fall away' }
  ),
  potionItem(
    'oil_of_etherealness',
    'Oil of Etherealness',
    'Rare',
    'Grants the effect of Etherealness for 1 hour. Takes minutes to apply.',
    { kind: 'narrative', text: 'fades half a step into the Ethereal Plane (Etherealness, 1 hour)' }
  ),
  potionItem(
    'philter_of_love',
    'Philter of Love',
    'Uncommon',
    'You are Charmed for 1 hour by the next creature you see within 10 minutes of drinking it.',
    { kind: 'narrative', text: 'will be smitten with the next creature they lay eyes on' }
  ),
];

// ─── Wands, staffs and Spell Scrolls (SRD 5.2.1) ─────────────────────────────
// Spells cast from these items spend charges (or the scroll) instead of a slot
// — see services/chargedItems.ts. A wand or staff works only while held (a
// wand in the off hand, a staff wielded as a Quarterstaff). SRD Magic Item
// Rarities and Values set the prices; a Spell Scroll is worth twice its
// scribing cost. Simplification: charges come back at the Long Rest ("dawn").
const RARITY_VALUE = {
  Common: 100,
  Uncommon: 400,
  Rare: 4000,
  'Very Rare': 40000,
  Legendary: 200000,
} as const;
type Rarity = keyof typeof RARITY_VALUE;
const WAND_CHARGES: ItemCharges = { max: 7, regain: '1d6+1', destroyOnLast: true };
const sp = (spellId: string, charges: number, more: Partial<ItemSpell> = {}): ItemSpell => ({
  spellId,
  charges,
  ...more,
});

function wand(
  id: string,
  name: string,
  rarity: Rarity,
  desc: string,
  extra: Partial<LootItem>
): [string, LootItem] {
  const attune = extra.requiresAttunement
    ? extra.attuneBy?.includes('spellcaster')
      ? '; requires attunement by a spellcaster'
      : '; requires attunement'
    : '';
  return [
    id,
    {
      id,
      name,
      value: RARITY_VALUE[rarity],
      desc: `${desc} Hold it in your off hand to use it. (${rarity}${attune}.)`,
      weight: 1,
      type: 'misc',
      slot: 'off_hand',
      damage: null,
      ac_bonus: null,
      heal: null,
      effect: null,
      aliases: [name.toLowerCase()],
      ...extra,
    },
  ];
}

const WANDS: Array<[string, LootItem]> = [
  wand(
    'wand_of_binding',
    'Wand of Binding',
    'Rare',
    '7 charges (regains 1d6+1 at dawn). Cast Hold Person (2 charges) or Hold Monster (5) at save DC 17.',
    {
      requiresAttunement: true,
      charges: WAND_CHARGES,
      itemSpellDc: 17,
      itemSpells: [sp('hold_person', 2), sp('hold_monster', 5)],
    }
  ),
  // Simplification: Command isn't limited to "flee" / "grovel", and Fear keeps
  // its usual cone rather than the wand's 60-foot one.
  wand(
    'wand_of_fear',
    'Wand of Fear',
    'Rare',
    '7 charges (regains 1d6+1 at dawn). Cast Command (1 charge) or Fear (3) at save DC 15.',
    {
      requiresAttunement: true,
      charges: WAND_CHARGES,
      itemSpellDc: 15,
      itemSpells: [sp('command', 1), sp('fear', 3)],
    }
  ),
  wand(
    'wand_of_fireballs',
    'Wand of Fireballs',
    'Rare',
    '7 charges (regains 1d6+1 at dawn). Cast Fireball at save DC 15: 1 charge for level 3, +1 charge per level up to 5.',
    {
      requiresAttunement: true,
      attuneBy: ['spellcaster'],
      charges: WAND_CHARGES,
      itemSpellDc: 15,
      itemSpells: [sp('fireball', 1, { maxLevel: 5 })],
    }
  ),
  wand(
    'wand_of_lightning_bolts',
    'Wand of Lightning Bolts',
    'Rare',
    '7 charges (regains 1d6+1 at dawn). Cast Lightning Bolt at save DC 15: 1 charge for level 3, +1 charge per level up to 5.',
    {
      requiresAttunement: true,
      attuneBy: ['spellcaster'],
      charges: WAND_CHARGES,
      itemSpellDc: 15,
      itemSpells: [sp('lightning_bolt', 1, { maxLevel: 5 })],
    }
  ),
  wand(
    'wand_of_magic_detection',
    'Wand of Magic Detection',
    'Uncommon',
    '3 charges (regains 1d3 at dawn). Cast Detect Magic for 1 charge.',
    {
      charges: { max: 3, regain: '1d3' },
      itemSpells: [sp('detect_magic', 1)],
    }
  ),
  wand(
    'wand_of_magic_missiles',
    'Wand of Magic Missiles',
    'Uncommon',
    '7 charges (regains 1d6+1 at dawn). Cast Magic Missile: 1 charge for level 1, +1 charge per level up to 3.',
    {
      charges: WAND_CHARGES,
      itemSpells: [sp('magic_missile', 1, { maxLevel: 3 })],
    }
  ),
  wand(
    'wand_of_polymorph',
    'Wand of Polymorph',
    'Very Rare',
    '7 charges (regains 1d6+1 at dawn). Cast Polymorph for 1 charge at save DC 15.',
    {
      requiresAttunement: true,
      attuneBy: ['spellcaster'],
      charges: WAND_CHARGES,
      itemSpellDc: 15,
      itemSpells: [sp('polymorph', 1)],
    }
  ),
  wand(
    'wand_of_web',
    'Wand of Web',
    'Uncommon',
    '7 charges (regains 1d6+1 at dawn). Cast Web for 1 charge at save DC 13.',
    {
      requiresAttunement: true,
      attuneBy: ['spellcaster'],
      charges: WAND_CHARGES,
      itemSpellDc: 13,
      itemSpells: [sp('web', 1)],
    }
  ),
  ...(
    [
      [1, 'Uncommon'],
      [2, 'Rare'],
      [3, 'Very Rare'],
    ] as Array<[number, Rarity]>
  ).map(([n, r]) =>
    wand(
      `wand_of_the_war_mage_plus_${n}`,
      `Wand of the War Mage +${n}`,
      r,
      `While held, +${n} to spell attack rolls, and your spell attacks ignore Half Cover.`,
      {
        requiresAttunement: true,
        attuneBy: ['spellcaster'],
        wornEffects: [{ kind: 'spell_attack_bonus', bonus: n, ignoreHalfCover: true }],
        aliases: [`wand of the war mage +${n}`, `war mage wand +${n}`],
      }
    )
  ),
];

// A staff is also a Quarterstaff, wielded in the main hand.
function staff(
  id: string,
  name: string,
  rarity: Rarity,
  by: string[],
  desc: string,
  extra: Partial<LootItem> & { held?: WornEffect[] }
): [string, LootItem] {
  const { held, ...rest } = extra;
  const who = by.map((b) => b.charAt(0).toUpperCase() + b.slice(1));
  const attune = by.length
    ? `requires attunement by a ${who.slice(0, -1).join(', ')}${who.length > 1 ? ' or ' : ''}${who[who.length - 1]}`
    : 'requires attunement';
  return namedMagic(
    'quarterstaff',
    id,
    name,
    RARITY_VALUE[rarity],
    `${desc} (${rarity}; ${attune}.)`,
    {
      requiresAttunement: true,
      ...(by.length ? { attuneBy: by } : {}),
      ...(held ? { wornEffects: held } : {}),
      ...rest,
    }
  );
}
const STAFF_CHARGES: ItemCharges = { max: 10, regain: '1d6+4', destroyOnLast: true };
const ARCANE = ['sorcerer', 'warlock', 'wizard'];
const ELEMENTAL = ['druid', 'sorcerer', 'warlock', 'wizard'];
const ALL_CASTERS = ['bard', 'cleric', 'druid', 'sorcerer', 'warlock', 'wizard'];

const STAFFS: Array<[string, LootItem]> = [
  // Simplification: Reflect / Resist Enchantment aren't modeled.
  staff(
    'staff_of_charming',
    'Staff of Charming',
    'Rare',
    ALL_CASTERS,
    'A Quarterstaff with 10 charges (regains 1d8+2 at dawn). Cast Charm Person, Command or Comprehend Languages for 1 charge, with your spell save DC.',
    {
      charges: { max: 10, regain: '1d8+2', destroyOnLast: true },
      itemSpells: [sp('charm_person', 1), sp('command', 1), sp('comprehend_languages', 1)],
    }
  ),
  staff(
    'staff_of_fire',
    'Staff of Fire',
    'Very Rare',
    ELEMENTAL,
    'A Quarterstaff with 10 charges (regains 1d6+4 at dawn). While held you resist Fire damage. Cast Burning Hands (1 charge), Fireball (3) or Wall of Fire (4) with your spell save DC.',
    {
      held: [{ kind: 'resistance', damageType: 'fire' }],
      charges: STAFF_CHARGES,
      itemSpells: [sp('burning_hands', 1), sp('fireball', 3), sp('wall_of_fire', 4)],
    }
  ),
  staff(
    'staff_of_frost',
    'Staff of Frost',
    'Very Rare',
    ELEMENTAL,
    'A Quarterstaff with 10 charges (regains 1d6+4 at dawn). While held you resist Cold damage. Cast Fog Cloud (1 charge), Ice Storm (4), Wall of Ice (4) or Cone of Cold (5) with your spell save DC.',
    {
      held: [{ kind: 'resistance', damageType: 'cold' }],
      charges: STAFF_CHARGES,
      itemSpells: [
        sp('fog_cloud', 1),
        sp('ice_storm', 4),
        sp('wall_of_ice', 4),
        sp('cone_of_cold', 5),
      ],
    }
  ),
  staff(
    'staff_of_healing',
    'Staff of Healing',
    'Rare',
    ['bard', 'cleric', 'druid'],
    'A Quarterstaff with 10 charges (regains 1d6+4 at dawn). Cast Cure Wounds (1 charge per spell level, up to level 4), Lesser Restoration (2) or Mass Cure Wounds (5) with your spellcasting modifier.',
    {
      charges: STAFF_CHARGES,
      itemSpells: [
        sp('cure_wounds', 1, { maxLevel: 4 }),
        sp('lesser_restoration', 2),
        sp('mass_cure_wounds', 5),
      ],
    }
  ),
  // Simplification: Retributive Strike isn't modeled.
  staff(
    'staff_of_power',
    'Staff of Power',
    'Very Rare',
    ARCANE,
    'A +2 Quarterstaff with 20 charges (regains 2d8+4 at dawn). While held: +2 to AC, saving throws and spell attack rolls. Cast Magic Missile (1 charge), Ray of Enfeeblement (1), Levitate (2), Cone of Cold, Hold Monster, Wall of Force, level-5 Fireball or Lightning Bolt (5 each) or Globe of Invulnerability (6) with your spell save DC. Spending the last charge risks leaving only a +2 Quarterstaff.',
    {
      magicBonus: 2,
      held: [
        { kind: 'ac_bonus', bonus: 2 },
        { kind: 'save_bonus', ability: 'all', bonus: 2 },
        { kind: 'spell_attack_bonus', bonus: 2 },
      ],
      charges: { max: 20, regain: '2d8+4', destroyOnLast: true, becomes: 'quarterstaff_plus_2' },
      itemSpells: [
        sp('magic_missile', 1),
        sp('ray_of_enfeeblement', 1),
        sp('levitate', 2),
        sp('cone_of_cold', 5),
        sp('fireball', 5, { level: 5 }),
        sp('hold_monster', 5),
        sp('lightning_bolt', 5, { level: 5 }),
        sp('wall_of_force', 5),
        sp('globe_of_invulnerability', 6),
      ],
    }
  ),
  // Simplification: the Insect Cloud property isn't modeled.
  staff(
    'staff_of_swarming_insects',
    'Staff of Swarming Insects',
    'Rare',
    ALL_CASTERS,
    'A Quarterstaff with 10 charges (regains 1d6+4 at dawn). Cast Giant Insect (4 charges) or Insect Plague (5) with your spell save DC.',
    {
      charges: STAFF_CHARGES,
      itemSpells: [sp('giant_insect', 4), sp('insect_plague', 5)],
    }
  ),
  // Simplification: Spell Absorption's Reaction and Retributive Strike aren't modeled.
  staff(
    'staff_of_the_magi',
    'Staff of the Magi',
    'Legendary',
    ARCANE,
    'A +2 Quarterstaff with 50 charges (regains 4d6+2 at dawn). While held: +2 to spell attack rolls and Advantage on saves against spells. Casts a long list of spells, some at no cost (Light, Mage Hand, Detect Magic, Arcane Lock, Enlarge/Reduce, Protection from Evil and Good), with your spell save DC.',
    {
      magicBonus: 2,
      held: [{ kind: 'spell_attack_bonus', bonus: 2 }, { kind: 'spell_save_advantage' }],
      charges: { max: 50, regain: '4d6+2' },
      itemSpells: [
        sp('arcane_lock', 0),
        sp('detect_magic', 0),
        sp('enlarge_reduce', 0),
        sp('light', 0),
        sp('mage_hand', 0),
        sp('protection_from_evil_and_good', 0),
        sp('flaming_sphere', 2),
        sp('invisibility', 2),
        sp('knock', 2),
        sp('web', 2),
        sp('dispel_magic', 3),
        sp('ice_storm', 4),
        sp('wall_of_fire', 4),
        sp('passwall', 5),
        sp('telekinesis', 5),
        sp('conjure_elemental', 7),
        sp('fireball', 7, { level: 7 }),
        sp('lightning_bolt', 7, { level: 7 }),
        sp('plane_shift', 7),
      ],
    }
  ),
  // Simplification: Tree Form isn't modeled.
  staff(
    'staff_of_the_woodlands',
    'Staff of the Woodlands',
    'Rare',
    ['druid'],
    'A +2 Quarterstaff with 6 charges (regains 1d6 at dawn). While held: +2 to spell attack rolls. Cast Animal Friendship or Speak with Animals (1 charge), Barkskin, Locate Animals or Plants or Pass without Trace (2), Speak with Plants (3), Awaken (5) or Wall of Thorns (6) with your spell save DC. Spending the last charge risks leaving a plain Quarterstaff.',
    {
      magicBonus: 2,
      held: [{ kind: 'spell_attack_bonus', bonus: 2 }],
      charges: { max: 6, regain: '1d6', destroyOnLast: true, becomes: 'quarterstaff' },
      itemSpells: [
        sp('animal_friendship', 1),
        sp('speak_with_animals', 1),
        sp('barkskin', 2),
        sp('locate_animals_or_plants', 2),
        sp('pass_without_trace', 2),
        sp('speak_with_plants', 3),
        sp('awaken', 5),
        sp('wall_of_thorns', 6),
      ],
    }
  ),
];

// SRD Spell Scroll — one per SRD spell. Value: twice the scribing cost.
const SCROLL_VALUE = [30, 50, 200, 300, 2000, 3000, 20000, 25000, 30000, 100000];
const SCROLL_RARITY = [
  'Common',
  'Common',
  'Uncommon',
  'Uncommon',
  'Rare',
  'Rare',
  'Very Rare',
  'Very Rare',
  'Very Rare',
  'Legendary',
];
const SPELL_SCROLLS: Array<[string, LootItem]> = Object.values(SRD_SPELLS).map((spell) => {
  const id = `spell_scroll_${spell.id}`;
  const name = `Spell Scroll (${spell.name})`;
  const lvl = spell.level === 0 ? 'cantrip' : `level ${spell.level}`;
  return [
    id,
    {
      id,
      name,
      value: SCROLL_VALUE[spell.level],
      desc: `A scroll holding ${spell.name} (${lvl}). If the spell is on your spell list you can cast it from the scroll, without Material components; a spell above the level you can cast needs a spellcasting check (DC 10 + its level). The scroll crumbles once used. (${SCROLL_RARITY[spell.level]}.)`,
      weight: 0,
      type: 'consumable',
      slot: null,
      damage: null,
      ac_bonus: null,
      heal: null,
      effect: null,
      spellScroll: spell.id,
      aliases: [name.toLowerCase(), `scroll of ${spell.name.toLowerCase()}`],
    },
  ];
});

// ─── Activated magic weapons and armor (SRD 5.2.1) ───────────────────────────
// Powers resolved in services/actions/attack/weaponPowers.ts: armed on-hit
// powers (`weaponPowers`), rider saves, natural-20 death effects (`critSlay`),
// the Oathbow's sworn enemy and the Hammer of Thunderbolts' charged throw.
// "Any weapon" items are generated on a few representative bases.
const SLAYING_TYPES = [
  'aberration',
  'beast',
  'celestial',
  'construct',
  'dragon',
  'elemental',
  'fey',
  'fiend',
  'giant',
  'humanoid',
  'monstrosity',
  'ooze',
  'plant',
  'undead',
];
const GIANT_GEAR = ['belt_of_', 'gauntlets_of_ogre_power'];
const ARMOR_FOR_METAL = [
  'chain_shirt',
  'scale_mail',
  'breastplate',
  'half_plate',
  'ring_mail',
  'chain_mail',
  'splint_armor',
  'plate_armor',
];

const ACTIVATED_WEAPONS: Array<[string, LootItem]> = [
  namedMagic(
    'javelin',
    'javelin_of_lightning',
    'Javelin of Lightning',
    RARITY_VALUE.Uncommon,
    'A magic javelin whose hits can deal Lightning instead of Piercing damage (the better of the two is used). Once per dawn, hurl it as a bolt of lightning: a Line to the target, 4d6 Lightning (DC 13 Dexterity save for half). (Uncommon.)',
    {
      altDamageType: 'lightning',
      itemSpells: [sp('lightning_bolt', 0, { dc: 13, damage: '4d6', daily: true })],
    }
  ),
  // SRD Dagger of Venom (Rare) — +1; a Bonus Action coats the blade once per dawn.
  namedMagic(
    'dagger',
    'dagger_of_venom',
    'Dagger of Venom',
    RARITY_VALUE.Rare,
    'A +1 dagger. Once per dawn, coat it with poison as a Bonus Action: the next creature it hits makes a DC 15 Constitution save or takes 2d10 Poison damage and is Poisoned for 1 minute. (Rare.)',
    {
      magicBonus: 1,
      weaponPowers: [
        {
          id: 'venom',
          label: 'Coat the blade with poison',
          cost: 'bonus_action',
          daily: true,
          rider: {
            label: 'Venom',
            dice: '2d10',
            damageType: 'poison',
            save: { ability: 'con', dc: 15, condition: 'poisoned', rounds: 10, onSave: 'none' },
          },
        },
      ],
    }
  ),
  // SRD Mace of Terror (Rare, attunement). Simplification: the wave uses the
  // Fear spell (its cone, without Concentration) rather than a 30-ft area of
  // creatures you choose.
  namedMagic(
    'mace',
    'mace_of_terror',
    'Mace of Terror',
    RARITY_VALUE.Rare,
    'A magic mace with 3 charges (regains 1d3 at dawn). Spend 1 to release a wave of terror: creatures in it make a DC 15 Wisdom save or are Frightened for 1 minute. (Rare; requires attunement.)',
    {
      requiresAttunement: true,
      charges: { max: 3, regain: '1d3' },
      itemSpells: [sp('fear', 1, { dc: 15, noConcentration: true })],
    }
  ),
  // SRD Nine Lives Stealer (Very Rare, attunement). Simplification: it starts
  // with 5 charges (the average of 1d8 + 1).
  ...named(['longsword', 'greatsword', 'rapier'], (b) =>
    namedMagic(
      b.id,
      `nine_lives_stealer_${b.id}`,
      `Nine Lives Stealer ${b.name}`,
      RARITY_VALUE['Very Rare'],
      `${b.desc} A +2 magic weapon with 5 charges. On a natural 20 against a creature with fewer than 100 Hit Points, it makes a DC 15 Constitution save or is slain (Constructs and Undead always succeed); each slaying spends a charge. (Very Rare; requires attunement.)`,
      {
        requiresAttunement: true,
        magicBonus: 2,
        charges: { max: 5, regain: '0' },
        critSlay: {
          label: 'Life Stealing',
          dc: 15,
          maxHp: 100,
          immuneTypes: ['construct', 'undead'],
          spendsCharge: true,
        },
      }
    )
  ),
  // SRD Oathbow (Very Rare, attunement).
  ...named(['longbow', 'shortbow'], (b) =>
    namedMagic(
      b.id,
      `oathbow_${b.id}`,
      `Oathbow (${b.name})`,
      RARITY_VALUE['Very Rare'],
      `${b.desc} Your first ranged attack with it swears the target as your sworn enemy (one at a time; once one dies, a new oath waits for dawn). Against it you have Advantage, it gets no benefit from Half or Three-Quarters Cover, and a hit deals +3d6 Piercing. While it lives, you have Disadvantage with other weapons. (Very Rare; requires attunement.)`,
      {
        requiresAttunement: true,
        swornEnemy: true,
        magicRiders: [
          { label: 'Oathbow', dice: '3d6', damageType: 'piercing', vsSwornEnemy: true },
        ],
      }
    )
  ),
  // SRD Hammer of Thunderbolts (Legendary, attunement). Simplification: the
  // thunderclap stuns only enemies, not the wielder's allies in the area.
  ...named(['maul', 'warhammer'], (b) =>
    namedMagic(
      b.id,
      `hammer_of_thunderbolts_${b.id}`,
      `Hammer of Thunderbolts (${b.name})`,
      RARITY_VALUE.Legendary,
      `${b.desc} A +1 magic weapon with 5 charges (regains 1d4+1 at dawn). Spend a charge to throw it (20/60 ft; it flies back): a hit forces the target and every enemy within 30 ft of it to make a DC 17 Constitution save or be Stunned until the end of your next turn. While you also wear an attuned Belt of Giant Strength or Gauntlets of Ogre Power, their Strength is 4 higher (max 30), and a natural 20 against a Giant forces a DC 17 Constitution save or it dies. (Legendary; requires attunement.)`,
      {
        requiresAttunement: true,
        magicBonus: 1,
        charges: { max: 5, regain: '1d4+1' },
        thrown: { normalRange: 20, longRange: 60 },
        throwCharge: { dc: 17, radiusFt: 30 },
        mightOfGiants: GIANT_GEAR,
        critSlay: { label: "Giants' Bane", dc: 17, vsTypes: ['giant'], needsWorn: GIANT_GEAR },
      }
    )
  ),
  // SRD Trident of Fish Command (Uncommon, attunement). Simplification: the
  // Beast needn't have a Swim Speed.
  namedMagic(
    'trident',
    'trident_of_fish_command',
    'Trident of Fish Command',
    RARITY_VALUE.Uncommon,
    'A magic trident with 3 charges (regains 1d3 at dawn). While you carry it, spend 1 to cast Dominate Beast (save DC 15). (Uncommon; requires attunement.)',
    {
      requiresAttunement: true,
      castWhileCarried: true,
      charges: { max: 3, regain: '1d3' },
      itemSpells: [sp('dominate_beast', 1, { dc: 15 })],
    }
  ),
  // SRD Quarterstaff of the Acrobat (Very Rare, attunement). Simplification:
  // the light and the rod / 10-foot-pole forms aren't modeled.
  namedMagic(
    'quarterstaff',
    'quarterstaff_of_the_acrobat',
    'Quarterstaff of the Acrobat',
    RARITY_VALUE['Very Rare'],
    'A +2 quarterstaff that can be thrown (30/120 ft) and flies back to your hand. While held you have Advantage on Dexterity (Acrobatics) checks, and once per Short or Long Rest you can take a Reaction to twirl it, gaining +5 AC against an attack that hits you. (Very Rare; requires attunement.)',
    {
      requiresAttunement: true,
      magicBonus: 2,
      thrown: { normalRange: 30, longRange: 120 },
      deflect: true,
      wornEffects: [{ kind: 'skill_advantage', skill: 'acrobatics' }],
    }
  ),
  // SRD Scimitar of Speed (Very Rare, attunement).
  namedMagic(
    'scimitar',
    'scimitar_of_speed',
    'Scimitar of Speed',
    RARITY_VALUE['Very Rare'],
    'A +2 scimitar. On each of your turns you can make one attack with it as a Bonus Action. (Very Rare; requires attunement.)',
    { requiresAttunement: true, magicBonus: 2, bonusAttack: true }
  ),
  // SRD Frost Brand (Very Rare, attunement). Simplification: the light in
  // freezing temperatures and the flame-quenching draw aren't modeled.
  ...named(['longsword', 'greatsword', 'rapier', 'scimitar'], (b) =>
    namedMagic(
      b.id,
      `frost_brand_${b.id}`,
      `Frost Brand ${b.name}`,
      RARITY_VALUE['Very Rare'],
      `${b.desc} A magic weapon: +1d6 Cold damage on a hit, and while you hold it you have Resistance to Fire damage. (Very Rare; requires attunement.)`,
      {
        requiresAttunement: true,
        magicRiders: [{ label: 'Frost Brand', dice: '1d6', damageType: 'cold' }],
        wornEffects: [{ kind: 'resistance', damageType: 'fire' }],
      }
    )
  ),
  // SRD Vorpal Sword (Legendary, attunement). Simplification: Oozes,
  // Elementals and Plants count as having no head to lose; size never saves it.
  ...named(['longsword', 'greatsword', 'scimitar'], (b) =>
    namedMagic(
      b.id,
      `vorpal_sword_${b.id}`,
      `Vorpal ${b.name}`,
      RARITY_VALUE.Legendary,
      `${b.desc} A +3 magic weapon that ignores Resistance to Slashing damage. On a natural 20 it cuts off the target's head, killing it — a creature without a head to lose (or that spends a Legendary Resistance) takes an extra 30 Slashing damage instead. (Legendary; requires attunement.)`,
      {
        requiresAttunement: true,
        magicBonus: 3,
        ignoresResistance: 'slashing',
        critSlay: { label: 'Vorpal', immuneTypes: ['ooze', 'elemental', 'plant'], elseDamage: 30 },
      }
    )
  ),
  // SRD Sword of Sharpness (Very Rare, attunement). Simplification: the
  // Exhaustion level and maximized damage against objects aren't modeled.
  ...named(['longsword', 'greatsword', 'scimitar'], (b) =>
    namedMagic(
      b.id,
      `sword_of_sharpness_${b.id}`,
      `Sword of Sharpness (${b.name})`,
      RARITY_VALUE['Very Rare'],
      `${b.desc} A magic weapon: on a natural 20 the target takes an extra 14 Slashing damage. (Very Rare; requires attunement.)`,
      {
        requiresAttunement: true,
        magicRiders: [{ label: 'Sharpness', dice: '14', damageType: 'slashing', onCrit: true }],
      }
    )
  ),
  // SRD Sword of Wounding (Rare, attunement). The wound blocks Regeneration.
  ...named(['longsword', 'rapier', 'scimitar'], (b) =>
    namedMagic(
      b.id,
      `sword_of_wounding_${b.id}`,
      `Sword of Wounding (${b.name})`,
      RARITY_VALUE.Rare,
      `${b.desc} A magic weapon: a hit deals +2d6 Necrotic damage, and the target makes a DC 15 Constitution save or can't regain Hit Points (it repeats the save at the end of each of its turns). (Rare; requires attunement.)`,
      {
        requiresAttunement: true,
        magicRiders: [
          {
            label: 'Wounding',
            dice: '2d6',
            damageType: 'necrotic',
            save: {
              ability: 'con',
              dc: 15,
              condition: 'festering_wound',
              rounds: 600,
              saveEnds: true,
            },
          },
        ],
      }
    )
  ),
  // SRD Sword of Life Stealing (Rare, attunement).
  ...named(['longsword', 'rapier', 'scimitar'], (b) =>
    namedMagic(
      b.id,
      `sword_of_life_stealing_${b.id}`,
      `Sword of Life Stealing (${b.name})`,
      RARITY_VALUE.Rare,
      `${b.desc} A magic weapon: on a natural 20 a creature that isn't a Construct or Undead takes an extra 15 Necrotic damage, and you gain that many Temporary Hit Points. (Rare; requires attunement.)`,
      {
        requiresAttunement: true,
        magicRiders: [
          {
            label: 'Life Stealing',
            dice: '15',
            damageType: 'necrotic',
            onCrit: true,
            notVsCreatureTypes: ['construct', 'undead'],
            tempHpFromDamage: true,
          },
        ],
      }
    )
  ),
  // SRD Luck Blade (Legendary, attunement). Simplifications: the save bonus
  // needs it wielded (not just carried); the Luck reroll isn't modeled; it holds
  // 2 Wish charges (the average of 1d3).
  ...named(['longsword', 'rapier', 'shortsword'], (b) =>
    namedMagic(
      b.id,
      `luck_blade_${b.id}`,
      `Luck Blade (${b.name})`,
      RARITY_VALUE.Legendary,
      `${b.desc} A +1 magic weapon that gives +1 to saving throws while wielded. It holds 2 charges of Wish: spend one to cast Wish from it, no more than once per dawn. (Legendary; requires attunement.)`,
      {
        requiresAttunement: true,
        magicBonus: 1,
        wornEffects: [{ kind: 'save_bonus', ability: 'all', bonus: 1 }],
        charges: { max: 2, regain: '0' },
        itemSpells: [sp('wish', 1, { daily: true })],
      }
    )
  ),
  // SRD Staff of Striking (Very Rare, attunement).
  staff(
    'staff_of_striking',
    'Staff of Striking',
    'Very Rare',
    [],
    'A +3 Quarterstaff with 10 charges (regains 1d6+4 at dawn). When you hit with a melee attack you can spend up to 3 charges: +1d6 Force damage each. Spending the last charge risks leaving a plain Quarterstaff.',
    {
      magicBonus: 3,
      charges: { max: 10, regain: '1d6+4', destroyOnLast: true, becomes: 'quarterstaff' },
      weaponPowers: [
        {
          id: 'strike',
          label: 'Striking',
          cost: 'free',
          maxCharges: 3,
          rider: { label: 'Striking', dice: '1d6', damageType: 'force', meleeOnly: true },
        },
      ],
    }
  ),
  // SRD Staff of Withering (Rare, attunement). Simplification: the
  // Disadvantage covers Strength / Constitution saves (checks are narrated).
  staff(
    'staff_of_withering',
    'Staff of Withering',
    'Rare',
    [],
    'A Quarterstaff with 3 charges (regains 1d3 at dawn). On a hit you can spend 1: +2d10 Necrotic damage, and the target makes a DC 15 Constitution save or has Disadvantage on Strength and Constitution checks and saves for 1 hour.',
    {
      charges: { max: 3, regain: '1d3' },
      weaponPowers: [
        {
          id: 'wither',
          label: 'Withering',
          cost: 'free',
          charges: 1,
          rider: {
            label: 'Withering',
            dice: '2d10',
            damageType: 'necrotic',
            save: { ability: 'con', dc: 15, condition: 'withered', rounds: 600 },
          },
        },
      ],
    }
  ),
  // SRD Staff of Thunder and Lightning (Very Rare, attunement).
  // Simplifications: only one property can be armed at a time (no combined
  // Bonus Action use), and Thunderclap isn't modeled.
  staff(
    'staff_of_thunder_and_lightning',
    'Staff of Thunder and Lightning',
    'Very Rare',
    [],
    'A +2 Quarterstaff. Each once per dawn: Lightning (a melee hit deals +2d6 Lightning), Thunder (a melee hit forces a DC 17 Constitution save or Stunned until the end of your next turn), and Lightning Strike (a 120-ft Line, 9d6 Lightning, DC 17 Dexterity save for half).',
    {
      magicBonus: 2,
      weaponPowers: [
        {
          id: 'lightning',
          label: 'Lightning',
          cost: 'free',
          daily: true,
          rider: { label: 'Lightning', dice: '2d6', damageType: 'lightning', meleeOnly: true },
        },
        {
          id: 'thunder',
          label: 'Thunder',
          cost: 'free',
          daily: true,
          rider: {
            label: 'Thunder',
            dice: '0',
            meleeOnly: true,
            save: { ability: 'con', dc: 17, condition: 'stunned', rounds: 1 },
          },
        },
      ],
      itemSpells: [sp('lightning_bolt', 0, { dc: 17, damage: '9d6', daily: true })],
    }
  ),
];

const ACTIVATED_ARMOR: Array<[string, LootItem]> = [
  // SRD Adamantine Armor (Uncommon). Enemy weapon attacks don't score Critical
  // Hits in pansori, so this matters against enemy spell attacks.
  ...ARMOR_FOR_METAL.map((id) =>
    namedMagic(
      id,
      `adamantine_${id}`,
      `Adamantine ${BASE_ITEMS[id].name}`,
      RARITY_VALUE.Uncommon + (BASE_ITEMS[id].value ?? 0),
      `${BASE_ITEMS[id].desc}. Reinforced with adamantine: a Critical Hit against you becomes a normal hit. (Uncommon.)`,
      { wornEffects: [{ kind: 'no_crits' }] }
    )
  ),
  // SRD Mithral Armor (Uncommon). pansori doesn't enforce Stealth
  // Disadvantage or Strength requirements, so this is the same armor, lighter.
  ...ARMOR_FOR_METAL.map((id) =>
    namedMagic(
      id,
      `mithral_${id}`,
      `Mithral ${BASE_ITEMS[id].name}`,
      RARITY_VALUE.Uncommon + (BASE_ITEMS[id].value ?? 0),
      `${BASE_ITEMS[id].desc}. Made of mithral: no Stealth Disadvantage and no Strength requirement. (Uncommon.)`,
      {}
    )
  ),
  // SRD Animated Shield (Very Rare, attunement). Simplification: hands aren't
  // tracked, so it works as a normal Shield.
  namedMagic(
    'shield',
    'animated_shield',
    'Animated Shield',
    RARITY_VALUE['Very Rare'],
    'A magic shield that can hover in your space as a Bonus Action, protecting you with your hands free. (Very Rare; requires attunement.)',
    { requiresAttunement: true }
  ),
  // SRD Plate Armor of Etherealness (Legendary, attunement).
  ...['half_plate', 'plate_armor'].map((id) =>
    namedMagic(
      id,
      `${id}_of_etherealness`,
      `${BASE_ITEMS[id].name} of Etherealness`,
      RARITY_VALUE.Legendary,
      `${BASE_ITEMS[id].desc}. While you wear it, once per dawn you can gain the effect of the Etherealness spell. (Legendary; requires attunement.)`,
      { requiresAttunement: true, itemSpells: [sp('etherealness', 0, { daily: true })] }
    )
  ),
];

// SRD Ammunition of Slaying (Very Rare) — one piece per creature type and
// ammunition kind. Worth a tenth of a Very Rare potion each, like +N ammunition.
const SLAYING_AMMO: Array<[string, LootItem]> = [
  'arrows',
  'crossbow_bolts',
  'sling_bullets',
  'blowgun_needles',
  'firearm_bullets',
].flatMap((ammo) =>
  SLAYING_TYPES.map((t) => {
    const base = BASE_ITEMS[ammo];
    const id = `${ammo}_of_${t}_slaying`;
    const name = `${base.name} of ${cap(t)} Slaying`;
    return [
      id,
      {
        ...base,
        id,
        name,
        value: 2000,
        count: 1,
        desc: `Magic ammunition meant for ${t}s: a ${cap(t)} it damages makes a DC 17 Constitution save, taking an extra 6d10 Force damage on a failure or half as much on a success. (Very Rare.)`,
        magicRiders: [
          {
            label: `${cap(t)} Slaying`,
            dice: '6d10',
            damageType: 'force',
            vsCreatureTypes: [t],
            save: { ability: 'con', dc: 17, onSave: 'half' },
          },
        ],
        aliases: [name.toLowerCase()],
      } as LootItem,
    ] as [string, LootItem];
  })
);

// ─── Cursed items (SRD 5.2.1) ────────────────────────────────────────────────
// The curse reveals on attunement (`curseDesc`); attunement can't then be ended
// by choice, and the bearer won't give the item away. `curseEffects` apply
// while attuned, worn or not — only Remove Curse (which breaks the attunement)
// ends them. "Any armor" items are generated on a few representative bases.
const CURSED_ARMOR_BASES = ['studded_leather', 'chain_mail', 'plate_armor'];
const PHYSICAL_TYPES = ['bludgeoning', 'piercing', 'slashing'];

const CURSED_ITEMS: Array<[string, LootItem]> = [
  // SRD Berserker Axe (Rare, attunement). Simplification: berserk, the bearer
  // only attacks the nearest enemy (never an ally).
  ...named(['battleaxe', 'greataxe', 'halberd'], (b) =>
    namedMagic(
      b.id,
      `berserker_axe_${b.id}`,
      `Berserker ${b.name}`,
      RARITY_VALUE.Rare,
      `${b.desc} A +1 magic weapon. While you are attuned to it, your Hit Point maximum rises by 1 per level. (Rare; requires attunement.)`,
      {
        requiresAttunement: true,
        magicBonus: 1,
        cursed: true,
        curseDesc:
          "You won't part with the axe, and you have Disadvantage on attacks with any other weapon. When another creature damages you, make a DC 15 Wisdom save or go berserk — attacking the nearest foe each turn until none is within 60 feet.",
        curseEffects: [{ kind: 'hp_per_level' }, { kind: 'berserker' }],
      }
    )
  ),
  // SRD Demon Armor (Very Rare, attunement). Simplification: knowing Abyssal
  // isn't modeled; the save Disadvantage covers Demons' condition effects.
  ...CURSED_ARMOR_BASES.map((id) =>
    namedMagic(
      id,
      `demon_armor_${id}`,
      `Demon ${BASE_ITEMS[id].name}`,
      RARITY_VALUE['Very Rare'],
      `${BASE_ITEMS[id].desc}. Fiendish armor: +1 AC, and its clawed gauntlets make your Unarmed Strikes deal 1d8 Slashing damage with +1 to attack and damage. (Very Rare; requires attunement.)`,
      {
        requiresAttunement: true,
        magicBonus: 1,
        cursed: true,
        curseLocksSlot: true,
        curseDesc:
          "Once donned, the armor can't be taken off until Remove Curse frees you. You have Disadvantage on attacks against Demons and on saves against their spells and abilities.",
        wornEffects: [{ kind: 'clawed_unarmed', dice: '1d8', damageType: 'slashing', bonus: 1 }],
        curseEffects: [{ kind: 'demon_bane' }],
      }
    )
  ),
  // SRD Armor of Vulnerability (Rare, attunement) — one per resisted type.
  ...CURSED_ARMOR_BASES.flatMap((id) =>
    PHYSICAL_TYPES.map((t) =>
      namedMagic(
        id,
        `${id}_of_vulnerability_${t}`,
        `${BASE_ITEMS[id].name} of ${cap(t)} Resistance`,
        RARITY_VALUE.Rare,
        `${BASE_ITEMS[id].desc}. While you wear it, you have Resistance to ${cap(t)} damage. (Rare; requires attunement.)`,
        {
          requiresAttunement: true,
          cursed: true,
          curseDesc: `This is an Armor of Vulnerability. Until Remove Curse ends it — even with the armor off — you have Vulnerability to ${PHYSICAL_TYPES.filter((x) => x !== t).join(' and ')} damage.`,
          wornEffects: [{ kind: 'resistance', damageType: t }],
          curseEffects: PHYSICAL_TYPES.filter((x) => x !== t).map((x) => ({
            kind: 'vulnerability' as const,
            damageType: x,
          })),
        }
      )
    )
  ),
  // SRD Shield of Missile Attraction (Rare, attunement).
  namedMagic(
    'shield',
    'shield_of_missile_attraction',
    'Shield of Missile Attraction',
    RARITY_VALUE.Rare,
    'A magic shield: while you hold it, you have Resistance to damage from attacks made with ranged weapons. (Rare; requires attunement.)',
    {
      requiresAttunement: true,
      cursed: true,
      curseDesc:
        'Until Remove Curse ends it — even with the shield set down — any ranged weapon attack aimed at a creature within 10 feet of you targets you instead.',
      wornEffects: [{ kind: 'ranged_weapon_resistance' }],
      curseEffects: [{ kind: 'missile_attraction', radiusFt: 10 }],
    }
  ),
];

// ─── Wondrous items, round 2 (SRD 5.2.1) ─────────────────────────────────────
// Passive boosts, carried stones, timed flight, and the Manuals / Tomes.
// `carried` items work from the pack while attuned (an attuned Ioun Stone is
// treated as orbiting your head — attunement already caps them at three).
function wondrous(
  id: string,
  name: string,
  rarity: Rarity,
  desc: string,
  slot: LootItem['slot'],
  extra: Partial<LootItem>
): [string, LootItem] {
  const attune = extra.requiresAttunement
    ? extra.attuneBy?.length
      ? `; requires attunement by a ${extra.attuneBy.map(cap).join(' or ')}`
      : '; requires attunement'
    : '';
  return [
    id,
    {
      id,
      name,
      value: RARITY_VALUE[rarity],
      desc: `${desc} (${rarity}${attune}.)`,
      weight: 1,
      type: 'misc',
      slot,
      damage: null,
      ac_bonus: null,
      heal: null,
      effect: null,
      aliases: [name.toLowerCase()],
      ...extra,
    },
  ];
}
const IOUN_ABILITY: Array<[string, string, AbilityKey]> = [
  ['agility', 'Agility', 'dex'],
  ['fortitude', 'Fortitude', 'con'],
  ['insight', 'Insight', 'wis'],
  ['intellect', 'Intellect', 'int'],
  ['leadership', 'Leadership', 'cha'],
  ['strength', 'Strength', 'str'],
];
const STUDY_BOOKS: Array<[string, string, AbilityKey]> = [
  ['manual_of_bodily_health', 'Manual of Bodily Health', 'con'],
  ['manual_of_gainful_exercise', 'Manual of Gainful Exercise', 'str'],
  ['manual_of_quickness_of_action', 'Manual of Quickness of Action', 'dex'],
  ['tome_of_clear_thought', 'Tome of Clear Thought', 'int'],
  ['tome_of_leadership_and_influence', 'Tome of Leadership and Influence', 'cha'],
  ['tome_of_understanding', 'Tome of Understanding', 'wis'],
];
const ABILITY_NAME: Record<AbilityKey, string> = {
  str: 'Strength',
  dex: 'Dexterity',
  con: 'Constitution',
  int: 'Intelligence',
  wis: 'Wisdom',
  cha: 'Charisma',
};

const WONDROUS_2: Array<[string, LootItem]> = [
  wondrous(
    'stone_of_good_luck',
    'Stone of Good Luck (Luckstone)',
    'Uncommon',
    'While this polished agate is on your person, you gain +1 to ability checks (Initiative included) and saving throws.',
    null,
    {
      requiresAttunement: true,
      carried: true,
      weight: 0,
      wornEffects: [
        { kind: 'save_bonus', ability: 'all', bonus: 1 },
        { kind: 'check_bonus', bonus: 1 },
      ],
    }
  ),
  // SRD Ioun Stones. Deferred: Absorption, Greater Absorption, Mastery, Reserve.
  ...IOUN_ABILITY.map(([key, label, ab]) =>
    wondrous(
      `ioun_stone_of_${key}`,
      `Ioun Stone of ${label}`,
      'Very Rare',
      `While it orbits your head, your ${ABILITY_NAME[ab]} increases by 2, to a maximum of 20.`,
      null,
      {
        requiresAttunement: true,
        carried: true,
        weight: 0,
        wornEffects: [{ kind: 'ability_increase', ability: ab, amount: 2, max: 20 }],
      }
    )
  ),
  wondrous(
    'ioun_stone_of_awareness',
    'Ioun Stone of Awareness',
    'Rare',
    'While it orbits your head, you have Advantage on Initiative rolls and Wisdom (Perception) checks.',
    null,
    {
      requiresAttunement: true,
      carried: true,
      weight: 0,
      wornEffects: [
        { kind: 'initiative_advantage' },
        { kind: 'skill_advantage', skill: 'perception' },
      ],
    }
  ),
  wondrous(
    'ioun_stone_of_protection',
    'Ioun Stone of Protection',
    'Rare',
    'While it orbits your head, you gain +1 to Armor Class.',
    null,
    {
      requiresAttunement: true,
      carried: true,
      weight: 0,
      wornEffects: [{ kind: 'ac_bonus', bonus: 1 }],
    }
  ),
  wondrous(
    'ioun_stone_of_regeneration',
    'Ioun Stone of Regeneration',
    'Legendary',
    'While it orbits your head, you regain 15 Hit Points at the end of each hour if you have at least 1 Hit Point.',
    null,
    {
      requiresAttunement: true,
      carried: true,
      weight: 0,
      wornEffects: [{ kind: 'regeneration', dice: '15', everyMinutes: 60 }],
    }
  ),
  wondrous(
    'ioun_stone_of_sustenance',
    'Ioun Stone of Sustenance',
    'Rare',
    "While it orbits your head, you don't need to eat or drink.",
    null,
    { requiresAttunement: true, carried: true, weight: 0 }
  ),
  // SRD Belt of Dwarvenkind. Simplification: the non-dwarf benefits apply to
  // every wearer (a dwarf already has them), and Dwarvish / the Persuasion
  // Advantage with dwarves aren't modeled.
  wondrous(
    'belt_of_dwarvenkind',
    'Belt of Dwarvenkind',
    'Rare',
    'While worn: your Constitution increases by 2 (max 20), you have Darkvision 60 ft, Resistance to Poison damage, and Advantage on saves to avoid or end the Poisoned condition.',
    'waist',
    {
      requiresAttunement: true,
      wornEffects: [
        { kind: 'ability_increase', ability: 'con', amount: 2, max: 20 },
        { kind: 'darkvision', feet: 60, atLeast: true },
        { kind: 'resistance', damageType: 'poison' },
        { kind: 'poison_save_advantage' },
      ],
    }
  ),
  // SRD Manuals and Tomes (Very Rare).
  ...STUDY_BOOKS.map(([id, name, ab]) =>
    wondrous(
      id,
      name,
      'Very Rare',
      `Studying this book (out of combat) raises your ${ABILITY_NAME[ab]} by 2, to a maximum of 30. The book then loses its magic.`,
      null,
      { weight: 5, studyIncrease: ab }
    )
  ),
  wondrous(
    'winged_boots',
    'Winged Boots',
    'Uncommon',
    '4 charges (regains 1d4 at dawn). While wearing them, spend a charge as a Magic action to gain a Fly Speed of 30 feet for 1 hour.',
    'feet',
    {
      requiresAttunement: true,
      charges: { max: 4, regain: '1d4' },
      activate: {
        label: 'Fly for 1 hour',
        charges: 1,
        effect: { kind: 'condition', conditions: ['winged_boots'], rounds: HOUR },
      },
    }
  ),
  // Simplification: the wings recover at dawn rather than after 1d12 hours.
  wondrous(
    'wings_of_flying',
    'Wings of Flying',
    'Rare',
    'While wearing this cloak, as a Magic action it becomes wings: a Fly Speed of 60 feet for 1 hour, then not again until dawn.',
    'cloak',
    {
      requiresAttunement: true,
      activate: {
        label: 'Spread the wings (1 hour)',
        daily: true,
        effect: { kind: 'condition', conditions: ['wings_of_flying'], rounds: HOUR },
      },
    }
  ),
  wondrous(
    'cloak_of_the_manta_ray',
    'Cloak of the Manta Ray',
    'Uncommon',
    'While wearing it, you can breathe underwater and have a Swim Speed of 60 feet.',
    'cloak',
    { requiresAttunement: true, wornEffects: [{ kind: 'speed_mode', mode: 'swim', feet: 60 }] }
  ),
  wondrous(
    'bracers_of_archery',
    'Bracers of Archery',
    'Uncommon',
    'While wearing them, you are proficient with the Longbow and Shortbow and deal +2 damage with them.',
    'arms',
    {
      requiresAttunement: true,
      wornEffects: [{ kind: 'weapon_bonus', weapons: ['longbow', 'shortbow'], damage: 2 }],
    }
  ),
  wondrous(
    'robe_of_the_archmagi',
    'Robe of the Archmagi',
    'Legendary',
    'While worn: without armor your base AC is 15 + your Dexterity modifier; Advantage on saves against spells; +2 to your spell save DC and spell attack bonus.',
    'cloak',
    {
      requiresAttunement: true,
      attuneBy: ['sorcerer', 'warlock', 'wizard'],
      wornEffects: [
        { kind: 'unarmored_base_ac', base: 15 },
        { kind: 'spell_save_advantage' },
        { kind: 'spell_dc_bonus', bonus: 2 },
        { kind: 'spell_attack_bonus', bonus: 2 },
      ],
    }
  ),
  // SRD Rod of Alertness. Simplification: the Protective Aura isn't modeled.
  wondrous(
    'rod_of_alertness',
    'Rod of Alertness',
    'Very Rare',
    'While held: Advantage on Wisdom (Perception) checks and Initiative rolls, and you can cast Detect Evil and Good, Detect Magic, Detect Poison and Disease, or See Invisibility from it. Hold it in your off hand.',
    'off_hand',
    {
      requiresAttunement: true,
      weight: 2,
      wornEffects: [
        { kind: 'initiative_advantage' },
        { kind: 'skill_advantage', skill: 'perception' },
      ],
      itemSpells: [
        sp('detect_evil_and_good', 0),
        sp('detect_magic', 0),
        sp('detect_poison_and_disease', 0),
        sp('see_invisibility', 0),
      ],
    }
  ),
  // SRD Talismans. Simplification: the touch damage and the charged fissure
  // (Pure Rebuke / Ultimate End) aren't modeled.
  wondrous(
    'talisman_of_pure_good',
    'Talisman of Pure Good',
    'Legendary',
    'A holy symbol: while you wear it, you gain +2 to spell attack rolls.',
    'neck',
    {
      requiresAttunement: true,
      attuneBy: ['cleric', 'paladin'],
      wornEffects: [{ kind: 'spell_attack_bonus', bonus: 2 }],
    }
  ),
  wondrous(
    'talisman_of_ultimate_evil',
    'Talisman of Ultimate Evil',
    'Legendary',
    'An unholy symbol: while you wear it, you gain +2 to spell attack rolls.',
    'neck',
    { requiresAttunement: true, wornEffects: [{ kind: 'spell_attack_bonus', bonus: 2 }] }
  ),
  // SRD Scarab of Protection. Simplification: Preservation's charges aren't modeled.
  wondrous(
    'scarab_of_protection',
    'Scarab of Protection',
    'Legendary',
    'While it is on your person: +1 to Armor Class and Advantage on saving throws against spells.',
    null,
    {
      requiresAttunement: true,
      carried: true,
      weight: 0,
      wornEffects: [{ kind: 'ac_bonus', bonus: 1 }, { kind: 'spell_save_advantage' }],
    }
  ),
  wondrous(
    'periapt_of_health',
    'Periapt of Health',
    'Uncommon',
    'While worn: Advantage on saves to avoid or end the Poisoned condition, and once per dawn a Magic action restores 2d4 + 2 Hit Points.',
    'neck',
    {
      requiresAttunement: true,
      wornEffects: [{ kind: 'poison_save_advantage' }],
      activate: {
        label: 'Regain 2d4 + 2 HP',
        daily: true,
        effect: { kind: 'heal', dice: '2d4+2' },
      },
    }
  ),
  wondrous(
    'periapt_of_wound_closure',
    'Periapt of Wound Closure',
    'Uncommon',
    'While worn: a Death Saving Throw of 9 or lower counts as a 10, and each Hit Point Die you spend restores double.',
    'neck',
    { requiresAttunement: true, wornEffects: [{ kind: 'wound_closure' }] }
  ),
  wondrous(
    'ring_of_regeneration',
    'Ring of Regeneration',
    'Very Rare',
    'While worn, you regain 1d6 Hit Points every 10 minutes if you have at least 1 Hit Point.',
    'ring',
    {
      requiresAttunement: true,
      weight: 0,
      wornEffects: [{ kind: 'regeneration', dice: '1d6', everyMinutes: 10 }],
    }
  ),
  wondrous(
    'cloak_of_displacement',
    'Cloak of Displacement',
    'Rare',
    'While worn, attacks against you have Disadvantage — until you take damage, which suppresses it until the start of your next turn. It also fails while your Speed is 0.',
    'cloak',
    { requiresAttunement: true, wornEffects: [{ kind: 'displacement' }] }
  ),
];

// ── SRD wondrous items, round 3 — items that cast spells ────────────────────
// Each casts through the Spells Cast from Items path (`itemSpells`): no slot,
// no components, at the spell's lowest level unless stated.
const CRYSTAL_BALL_DESC =
  'While holding this orb, you can cast Scrying (save DC 17) from it. Hold it in your off hand.';
const crystalBall = (
  id: string,
  name: string,
  rarity: Rarity,
  extraDesc: string,
  more: ItemSpell[] = []
) =>
  wondrous(id, name, rarity, `${CRYSTAL_BALL_DESC}${extraDesc}`, 'off_hand', {
    requiresAttunement: true,
    weight: 3,
    itemSpellDc: 17,
    itemSpells: [sp('scrying', 0), ...more],
  });

const WONDROUS_3: Array<[string, LootItem]> = [
  // SRD Necklace of Fireballs. Simplification: a fixed 6 beads (1d6 + 3 on
  // average); throwing extra beads is upcasting (+1d6 each, to 12d6).
  wondrous(
    'necklace_of_fireballs',
    'Necklace of Fireballs',
    'Rare',
    '6 beads. Detach and throw a bead to cast Fireball (level 3, save DC 15); throw more beads at once for +1d6 each (up to 12d6). Once the beads are gone, so is the necklace.',
    null,
    {
      castWhileCarried: true,
      charges: { max: 6, regain: '0', consumable: true },
      itemSpellDc: 15,
      itemSpells: [sp('fireball', 1, { maxLevel: 7 })],
    }
  ),
  // SRD Necklace of Prayer Beads. Simplification: one bead of each of the six
  // kinds, each cast at the spell's own casting time (not a Bonus Action).
  wondrous(
    'necklace_of_prayer_beads',
    'Necklace of Prayer Beads',
    'Rare',
    'While wearing it, each of its six beads casts its spell once per dawn, using your own save DC: Bless, Cure Wounds (level 2), Greater Restoration, Shining Smite, Guardian of Faith and Wind Walk.',
    'neck',
    {
      requiresAttunement: true,
      attuneBy: ['cleric', 'druid', 'paladin'],
      itemSpells: [
        sp('bless', 0, { daily: true }),
        sp('cure_wounds', 0, { level: 2, daily: true }),
        sp('greater_restoration', 0, { daily: true }),
        sp('shining_smite', 0, { daily: true }),
        sp('guardian_of_faith', 0, { daily: true }),
        sp('wind_walk', 0, { daily: true }),
      ],
    }
  ),
  // SRD Ring of Animal Influence. Simplification: its Fear isn't limited to Beasts.
  wondrous(
    'ring_of_animal_influence',
    'Ring of Animal Influence',
    'Rare',
    '3 charges (regains 1d3 at dawn). While wearing it, spend 1 charge to cast Animal Friendship, Fear or Speak with Animals (save DC 13).',
    'ring',
    {
      weight: 0,
      charges: { max: 3, regain: '1d3' },
      itemSpellDc: 13,
      itemSpells: [sp('animal_friendship', 1), sp('fear', 1), sp('speak_with_animals', 1)],
    }
  ),
  // SRD Ring of Shooting Stars. Simplification: the Lightning Spheres aren't
  // modeled, every Shooting Stars mote lands on one point, and the ring works
  // in any light.
  wondrous(
    'ring_of_shooting_stars',
    'Ring of Shooting Stars',
    'Very Rare',
    '6 charges (regains 1d6 at dawn). While wearing it, cast Dancing Lights or Light at will, spend 1 charge to cast Faerie Fire, or 1 to 3 charges for Shooting Stars: a 15-foot cube within 60 feet, DC 15 Dexterity save, 5d4 Radiant per charge (half on a success).',
    'ring',
    {
      requiresAttunement: true,
      weight: 0,
      charges: { max: 6, regain: '1d6' },
      itemSpells: [
        sp('dancing_lights', 0),
        sp('light', 0),
        sp('faerie_fire', 1),
        sp('shooting_stars', 1, { maxLevel: 3, dc: 15 }),
      ],
    }
  ),
  wondrous(
    'ring_of_telekinesis',
    'Ring of Telekinesis',
    'Very Rare',
    'While wearing it, you can cast Telekinesis from it at will.',
    'ring',
    { requiresAttunement: true, weight: 0, itemSpells: [sp('telekinesis', 0)] }
  ),
  wondrous(
    'ring_of_jumping',
    'Ring of Jumping',
    'Uncommon',
    'While wearing it, you can cast Jump from it at will, on yourself only.',
    'ring',
    { requiresAttunement: true, weight: 0, itemSpells: [sp('jump', 0, { selfOnly: true })] }
  ),
  wondrous(
    'ring_of_water_walking',
    'Ring of Water Walking',
    'Uncommon',
    'While wearing it, you can cast Water Walk from it at will, on yourself only.',
    'ring',
    { weight: 0, itemSpells: [sp('water_walk', 0, { selfOnly: true })] }
  ),
  wondrous(
    'circlet_of_blasting',
    'Circlet of Blasting',
    'Uncommon',
    'While wearing it, you can cast Scorching Ray from it (+5 to hit), once per dawn.',
    'head',
    { itemSpells: [sp('scorching_ray', 0, { attack: 5, daily: true })] }
  ),
  wondrous(
    'helm_of_teleportation',
    'Helm of Teleportation',
    'Rare',
    '3 charges (regains 1d3 at dawn). While wearing it, spend 1 charge to cast Teleport.',
    'head',
    {
      requiresAttunement: true,
      weight: 3,
      charges: { max: 3, regain: '1d3' },
      itemSpells: [sp('teleport', 1)],
    }
  ),
  // SRD Helm of Telepathy. Simplification: the 30-foot telepathy is flavor.
  wondrous(
    'helm_of_telepathy',
    'Helm of Telepathy',
    'Uncommon',
    'While wearing it, you can cast Detect Thoughts and Suggestion (save DC 13) from it, each once per dawn.',
    'head',
    {
      requiresAttunement: true,
      weight: 3,
      itemSpellDc: 13,
      itemSpells: [sp('detect_thoughts', 0, { daily: true }), sp('suggestion', 0, { daily: true })],
    }
  ),
  wondrous(
    'helm_of_comprehending_languages',
    'Helm of Comprehending Languages',
    'Uncommon',
    'While wearing it, you can cast Comprehend Languages from it at will.',
    'head',
    { weight: 3, itemSpells: [sp('comprehend_languages', 0)] }
  ),
  wondrous(
    'medallion_of_thoughts',
    'Medallion of Thoughts',
    'Uncommon',
    '5 charges (regains 1d4 at dawn). While wearing it, spend 1 charge to cast Detect Thoughts (save DC 13).',
    'neck',
    {
      requiresAttunement: true,
      charges: { max: 5, regain: '1d4' },
      itemSpellDc: 13,
      itemSpells: [sp('detect_thoughts', 1)],
    }
  ),
  wondrous(
    'eyes_of_charming',
    'Eyes of Charming',
    'Uncommon',
    '3 charges (all regained at dawn). While wearing these lenses, cast Charm Person (save DC 13): 1 charge for level 1, +1 charge per level up to 3.',
    'head',
    {
      requiresAttunement: true,
      weight: 0,
      charges: { max: 3, regain: '3' },
      itemSpellDc: 13,
      itemSpells: [sp('charm_person', 1, { maxLevel: 3 })],
    }
  ),
  // SRD Cape of the Mountebank. Simplification: the smoke left behind is flavor.
  wondrous(
    'cape_of_the_mountebank',
    'Cape of the Mountebank',
    'Rare',
    'While wearing it, you can cast Dimension Door from it, once per dawn, leaving a puff of smoke behind.',
    'cloak',
    { itemSpells: [sp('dimension_door', 0, { daily: true })] }
  ),
  wondrous(
    'boots_of_levitation',
    'Boots of Levitation',
    'Rare',
    'While wearing them, you can cast Levitate from them at will, on yourself only.',
    'feet',
    { requiresAttunement: true, itemSpells: [sp('levitate', 0, { selfOnly: true })] }
  ),
  wondrous(
    'hat_of_disguise',
    'Hat of Disguise',
    'Uncommon',
    'While wearing it, you can cast Disguise Self from it at will.',
    'head',
    { requiresAttunement: true, itemSpells: [sp('disguise_self', 0)] }
  ),
  wondrous(
    'rod_of_resurrection',
    'Rod of Resurrection',
    'Legendary',
    '5 charges (regains 1 at dawn). While holding it, cast Heal (1 charge) or Resurrection (5 charges). Spending the last charge rolls a d20 — on a 1 the rod vanishes. Hold it in your off hand.',
    'off_hand',
    {
      requiresAttunement: true,
      weight: 2,
      charges: { max: 5, regain: '1', destroyOnLast: true },
      itemSpells: [sp('heal', 1), sp('resurrection', 5)],
    }
  ),
  crystalBall('crystal_ball', 'Crystal Ball', 'Very Rare', ''),
  // Simplification: the extra spell isn't tied to the Scrying sensor.
  crystalBall(
    'crystal_ball_of_mind_reading',
    'Crystal Ball of Mind Reading',
    'Legendary',
    ' You can also cast Detect Thoughts (save DC 17) without Concentration.',
    [sp('detect_thoughts', 0, { noConcentration: true })]
  ),
  crystalBall(
    'crystal_ball_of_telepathy',
    'Crystal Ball of Telepathy',
    'Legendary',
    ' You can also cast Suggestion (save DC 17) without Concentration, once per dawn.',
    [sp('suggestion', 0, { noConcentration: true, daily: true })]
  ),
  // Simplification: the Truesight around the sensor is flavor.
  crystalBall(
    'crystal_ball_of_true_seeing',
    'Crystal Ball of True Seeing',
    'Legendary',
    ' You also see through the sensor with Truesight out to 120 feet.'
  ),
  // SRD Robe of Stars. Simplification: the stars return at dawn (a Long Rest),
  // not dusk, and the trip to the Astral Plane isn't modeled.
  wondrous(
    'robe_of_stars',
    'Robe of Stars',
    'Very Rare',
    '+1 to saving throws while worn. 6 stars (1d6 return daily): spend one to cast Magic Missile at level 5.',
    'cloak',
    {
      requiresAttunement: true,
      charges: { max: 6, regain: '1d6' },
      wornEffects: [{ kind: 'save_bonus', ability: 'all', bonus: 1 }],
      itemSpells: [sp('magic_missile', 1, { level: 5 })],
    }
  ),
  // SRD Cloak of Arachnida. Simplification: Spider Walk (webs) and the Web's
  // doubled area aren't modeled.
  wondrous(
    'cloak_of_arachnida',
    'Cloak of Arachnida',
    'Very Rare',
    'While worn: Resistance to Poison damage, a Climb Speed equal to your Speed, and once per dawn you can cast Web (save DC 13).',
    'cloak',
    {
      requiresAttunement: true,
      wornEffects: [
        { kind: 'resistance', damageType: 'poison' },
        { kind: 'speed_mode', mode: 'climb', feet: 'walk' },
      ],
      itemSpells: [sp('web', 0, { dc: 13, daily: true })],
    }
  ),
  wondrous(
    'chime_of_opening',
    'Chime of Opening',
    'Rare',
    'Strike it to cast Knock. It rings 10 times, then cracks and is useless. Hold it in your off hand.',
    'off_hand',
    {
      charges: { max: 10, regain: '0', consumable: true },
      itemSpells: [sp('knock', 1)],
    }
  ),
  // SRD Wind Fan. Simplification: one safe use per dawn instead of the
  // cumulative 20 percent chance of tearing on repeat uses.
  wondrous(
    'wind_fan',
    'Wind Fan',
    'Uncommon',
    'While holding it, you can cast Gust of Wind (save DC 13) from it, once per dawn. Hold it in your off hand.',
    'off_hand',
    { itemSpells: [sp('gust_of_wind', 0, { dc: 13, daily: true })] }
  ),
  wondrous(
    'pearl_of_power',
    'Pearl of Power',
    'Uncommon',
    'While it is on your person, a Magic action restores one expended spell slot of level 3 or lower, once per dawn.',
    null,
    {
      requiresAttunement: true,
      attuneBy: ['spellcaster'],
      carried: true,
      weight: 0,
      activate: {
        label: 'Regain a spell slot (level 3 or lower)',
        daily: true,
        effect: { kind: 'regain_slot', maxLevel: 3 },
      },
    }
  ),
  wondrous(
    'necklace_of_adaptation',
    'Necklace of Adaptation',
    'Uncommon',
    'While worn, you can breathe in any environment and have Advantage on saves to avoid or end the Poisoned condition.',
    'neck',
    { requiresAttunement: true, wornEffects: [{ kind: 'poison_save_advantage' }] }
  ),
  // SRD Robe of Eyes. Simplification: the Light / Daylight blinding drawback
  // isn't modeled.
  wondrous(
    'robe_of_eyes',
    'Robe of Eyes',
    'Rare',
    'While worn: Advantage on Wisdom (Perception) checks, and Darkvision and Truesight out to 120 feet.',
    'cloak',
    {
      requiresAttunement: true,
      wornEffects: [
        { kind: 'skill_advantage', skill: 'perception' },
        { kind: 'darkvision', feet: 120, atLeast: true },
        { kind: 'truesight', feet: 120 },
      ],
    }
  ),
];

// ── SRD activated items, round 2 — effects that aren't spells ──────────────
// Item powers (campaignData/srd/itemPowers.ts) resolve through the spell
// engine; the rest are reactions, a Bonus Action toggle and invisibility.
const WONDROUS_4: Array<[string, LootItem]> = [
  wand(
    'wand_of_paralysis',
    'Wand of Paralysis',
    'Rare',
    '7 charges (regains 1d6+1 at dawn). Spend 1 charge to fire a ray at a creature within 60 feet: DC 15 Constitution save or Paralyzed for 1 minute (it saves again at the end of each turn).',
    {
      requiresAttunement: true,
      attuneBy: ['spellcaster'],
      charges: WAND_CHARGES,
      itemSpellDc: 15,
      itemSpells: [sp('paralysis_ray', 1)],
    }
  ),
  // Simplification: the push and the object-breaking use aren't modeled.
  wondrous(
    'ring_of_the_ram',
    'Ring of the Ram',
    'Rare',
    '3 charges (regains 1d3 at dawn). While wearing it, spend 1 to 3 charges: a spectral ram makes a ranged attack (+7) against a creature within 60 feet, dealing 2d10 Force per charge.',
    'ring',
    {
      requiresAttunement: true,
      weight: 0,
      charges: { max: 3, regain: '1d3' },
      itemSpells: [sp('ram_strike', 1, { maxLevel: 3, attack: 7 })],
    }
  ),
  wondrous(
    'horn_of_blasting',
    'Horn of Blasting',
    'Rare',
    'Blow it for a 30-foot cone of sound: DC 15 Constitution save, 5d8 Thunder and Deafened for 1 minute (half damage only on a success). Each use has a 20 percent chance to explode, dealing 10d6 Force to you and destroying the horn. Hold it in your off hand.',
    'off_hand',
    {
      weight: 2,
      itemSpellDc: 15,
      itemSpells: [
        sp('horn_blast', 0, { backfire: { chancePct: 20, damage: '10d6', damageType: 'force' } }),
      ],
    }
  ),
  // SRD Bead of Force — 1d4 + 4 are found together. Simplification: a pouch of
  // 6, and the trapping sphere of force isn't modeled.
  wondrous(
    'bead_of_force',
    'Bead of Force',
    'Rare',
    'A pouch of 6 beads. Throw one up to 60 feet: it bursts in a 10-foot-radius sphere, and each creature there makes a DC 15 Dexterity save or takes 5d4 Force damage.',
    null,
    {
      weight: 0,
      castWhileCarried: true,
      charges: { max: 6, regain: '0', consumable: true },
      itemSpellDc: 15,
      itemSpells: [sp('force_bead', 1)],
    }
  ),
  // Simplification: the 24-hour immunity after a successful save isn't tracked.
  wondrous(
    'pipes_of_haunting',
    'Pipes of Haunting',
    'Uncommon',
    '3 charges (regains 1d3 at dawn). Spend 1 to play an eerie tune: each enemy within 30 feet makes a DC 15 Wisdom save or is Frightened for 1 minute (saving again at the end of each turn). Hold them in your off hand.',
    'off_hand',
    {
      weight: 2,
      charges: { max: 3, regain: '1d3' },
      itemSpellDc: 15,
      itemSpells: [sp('haunting_tune', 1)],
    }
  ),
  // Simplification: the charm doesn't break early when the party harms a target.
  wondrous(
    'rod_of_rulership',
    'Rod of Rulership',
    'Rare',
    'Once per dawn, present the rod: each enemy within 120 feet makes a DC 15 Wisdom save or is Charmed by you for 8 hours. Hold it in your off hand.',
    'off_hand',
    {
      requiresAttunement: true,
      weight: 2,
      itemSpellDc: 15,
      itemSpells: [sp('rulership', 0, { daily: true })],
    }
  ),
  // SRD Boots of Speed. Simplification: one 10-minute use per Long Rest (the
  // boots can't be switched off early to save the rest of the time).
  wondrous(
    'boots_of_speed',
    'Boots of Speed',
    'Rare',
    'While wearing them, click your heels as a Bonus Action: your Speed doubles and Opportunity Attacks against you have Disadvantage for 10 minutes. Then not again until you finish a Long Rest.',
    'feet',
    {
      requiresAttunement: true,
      activate: {
        label: 'Click the heels (10 minutes)',
        daily: true,
        bonusAction: true,
        effect: { kind: 'condition', conditions: ['boots_of_speed'], rounds: 100 },
      },
    }
  ),
  // SRD Gloves of Missile Snaring. Simplification: resolved automatically,
  // and the free hand isn't checked.
  wondrous(
    'gloves_of_missile_snaring',
    'Gloves of Missile Snaring',
    'Uncommon',
    'While wearing them, when a Ranged or thrown weapon hits you, your Reaction cuts the damage by 1d10 + your Dexterity modifier — down to 0, you catch it.',
    'hands',
    { requiresAttunement: true, wornEffects: [{ kind: 'missile_snaring' }] }
  ),
  wondrous(
    'ring_of_evasion',
    'Ring of Evasion',
    'Rare',
    '3 charges (regains 1d3 at dawn). While wearing it, when you fail a Dexterity save, your Reaction and 1 charge turn it into a success.',
    'ring',
    {
      requiresAttunement: true,
      weight: 0,
      charges: { max: 3, regain: '1d3' },
      evasionRing: true,
    }
  ),
  // SRD Ring of Invisibility. Simplification: each use lasts 1 hour (use it
  // again to stay unseen), and ending it early isn't modeled.
  wondrous(
    'ring_of_invisibility',
    'Ring of Invisibility',
    'Legendary',
    'While wearing it, a Magic action makes you Invisible; attacking or casting does not end it.',
    'ring',
    {
      requiresAttunement: true,
      weight: 0,
      activate: {
        label: 'Turn Invisible (1 hour)',
        effect: { kind: 'condition', conditions: ['invisible', 'item_invisibility'], rounds: HOUR },
      },
    }
  ),
  wondrous(
    'cloak_of_invisibility',
    'Cloak of Invisibility',
    'Legendary',
    '3 charges (regains 1d3 at dawn). While wearing it, pull up the hood as a Magic action and spend 1 charge to be Invisible for 1 hour; attacking or casting does not end it.',
    'cloak',
    {
      requiresAttunement: true,
      charges: { max: 3, regain: '1d3' },
      activate: {
        label: 'Pull up the hood (Invisible, 1 hour)',
        charges: 1,
        effect: { kind: 'condition', conditions: ['invisible', 'item_invisibility'], rounds: HOUR },
      },
    }
  ),
];

// ── SRD summoning items ─────────────────────────────────────────────────────
// Each calls a creature (an item power with a `summon` block) out of combat;
// it fights beside the party from the next battle, reverts at the next Long
// Rest, and is replaced if the item is used again. Simplification: the
// creature lasts until that Long Rest rather than its listed hours.
const FIGURINES: Array<[string, string, Rarity, number, string]> = [
  ['bronze_griffon', 'Bronze Griffon', 'Rare', 5, 'a Griffon'],
  ['ebony_fly', 'Ebony Fly', 'Rare', 2, 'a Giant Fly you can ride (it has no attacks)'],
  ['golden_lions', 'Golden Lions', 'Rare', 7, 'a pair of Lions'],
  ['marble_elephant', 'Marble Elephant', 'Rare', 7, 'an Elephant'],
  [
    'obsidian_steed',
    'Obsidian Steed',
    'Very Rare',
    5,
    'a Nightmare you can ride (it fights only to defend itself)',
  ],
  ['onyx_dog', 'Onyx Dog', 'Rare', 7, 'a Mastiff'],
  ['serpentine_owl', 'Serpentine Owl', 'Rare', 2, 'a Giant Owl'],
  ['silver_raven', 'Silver Raven', 'Uncommon', 2, 'a Raven'],
];
const VALHALLA: Array<[string, Rarity, number]> = [
  ['silver', 'Rare', 2],
  ['brass', 'Rare', 3],
  ['bronze', 'Very Rare', 4],
  ['iron', 'Legendary', 5],
];
const ELEMENT_VESSELS: Array<[string, string, string, string]> = [
  [
    'bowl_of_commanding_water_elementals',
    'Bowl of Commanding Water Elementals',
    'water',
    'Fill it with water and',
  ],
  [
    'brazier_of_commanding_fire_elementals',
    'Brazier of Commanding Fire Elementals',
    'fire',
    'Kindle it and',
  ],
  [
    'censer_of_controlling_air_elementals',
    'Censer of Controlling Air Elementals',
    'air',
    'Swing it and',
  ],
  [
    'stone_of_controlling_earth_elementals',
    'Stone of Controlling Earth Elementals',
    'earth',
    'Touch it to the ground and',
  ],
];
const ELEMENTAL_GEMS: Array<[string, string, string]> = [
  ['blue_sapphire', 'Blue Sapphire', 'air'],
  ['emerald', 'Emerald', 'water'],
  ['red_corundum', 'Red Corundum', 'fire'],
  ['yellow_diamond', 'Yellow Diamond', 'earth'],
];
const anEl = (el: string) => `${el === 'air' || el === 'earth' ? 'an' : 'a'} ${cap(el)} Elemental`;

const SUMMONING_ITEMS: Array<[string, LootItem]> = [
  ...FIGURINES.map(([key, name, rarity, days, what]) =>
    wondrous(
      `figurine_of_wondrous_power_${key}`,
      `Figurine of Wondrous Power (${name})`,
      rarity,
      `Out of combat, throw the statuette to turn it into ${what} that joins the party until the next Long Rest. Then it can't be used again for ${days} days (Long Rests).`,
      null,
      {
        weight: 0,
        castWhileCarried: true,
        itemSpells: [sp(`figurine_${key}`, 0, { rechargeDays: days })],
      }
    )
  ),
  // Simplification: the horn's requirement (proficiency with Simple weapons,
  // Medium armor or Martial weapons) isn't checked, and the spirits'
  // Charmed / Frightened immunity isn't modeled.
  ...VALHALLA.map(([metal, rarity, n]) =>
    wondrous(
      `horn_of_valhalla_${metal}`,
      `Horn of Valhalla (${cap(metal)})`,
      rarity,
      `Out of combat, blow it to call ${n} Berserker spirits from Ysgard to fight beside you until the next Long Rest. Then it can't be used again for 7 days (Long Rests).`,
      null,
      {
        weight: 2,
        castWhileCarried: true,
        itemSpells: [sp(`valhalla_${metal}`, 0, { rechargeDays: 7 })],
      }
    )
  ),
  ...ELEMENT_VESSELS.map(([id, name, el, how]) =>
    wondrous(
      id,
      name,
      'Rare',
      `${how} summon ${anEl(el)} (out of combat) that fights beside you until the next Long Rest. Once per dawn.`,
      null,
      {
        weight: id.startsWith('stone') ? 5 : 3,
        castWhileCarried: true,
        itemSpells: [sp(`summon_${el}_elemental`, 0, { daily: true })],
      }
    )
  ),
  ...ELEMENTAL_GEMS.map(([key, name, el]) =>
    wondrous(
      `elemental_gem_${key}`,
      `Elemental Gem (${name})`,
      'Uncommon',
      `Break the gem (out of combat) to summon ${anEl(el)} that fights beside you until the next Long Rest. The gem is then spent.`,
      null,
      {
        weight: 0,
        castWhileCarried: true,
        charges: { max: 1, regain: '0', consumable: true },
        itemSpells: [sp(`summon_${el}_elemental`, 1)],
      }
    )
  ),
  wondrous(
    'ring_of_djinni_summoning',
    'Ring of Djinni Summoning',
    'Legendary',
    'While wearing it, once per dawn (out of combat) summon a Djinni that serves you until the next Long Rest.',
    'ring',
    {
      requiresAttunement: true,
      weight: 0,
      itemSpells: [sp('djinni_summoning', 0, { daily: true })],
    }
  ),
  staff(
    'staff_of_the_python',
    'Staff of the Python',
    'Uncommon',
    [],
    'Out of combat, throw the staff to turn it into a Giant Constrictor Snake that fights beside you until the next Long Rest.',
    { itemSpells: [sp('python_staff', 0)] }
  ),
];

// ─── Utility and travel items (SRD 5.2.1, batch 11) ──────────────────────────
// Extradimensional containers (`holds`: their contents don't weigh on the
// bearer), flight and mounts, senses, and the many items whose use is
// described and adjudicated at the table (a `narrative` activation).
const tell = (
  label: string,
  text: string,
  more: Partial<NonNullable<LootItem['activate']>> = {}
) => ({
  label,
  effect: { kind: 'narrative' as const, text },
  ...more,
});
// One-use (or few-use) consumables: the charges are the item.
const uses = (n: number): ItemCharges => ({ max: n, regain: '0', consumable: true });
// SRD Carpet of Flying — four sizes, each with its own Fly Speed.
const CARPETS: Array<[string, number, string]> = [
  ['3x5', 80, '3 by 5 feet; carries 200 lb.'],
  ['4x6', 60, '4 by 6 feet; carries 400 lb.'],
  ['5x7', 40, '5 by 7 feet; carries 600 lb.'],
  ['6x9', 30, '6 by 9 feet; carries 800 lb.'],
];
// SRD Feather Tokens whose single use is table color.
const FEATHER_TOKENS: Array<[string, string, Rarity, string, string]> = [
  [
    'anchor',
    'Anchor',
    'Uncommon',
    'Touch it to a boat or ship: for 24 hours the vessel can’t be moved by any means.',
    'touches the token to the vessel — it holds fast, as if anchored to the world, for 24 hours',
  ],
  [
    'fan',
    'Fan',
    'Uncommon',
    'Toss it aboard a boat or ship: a giant fan fills the sails, adding 5 miles per hour for 8 hours.',
    'tosses the token aloft — a giant flapping fan fills the sails for 8 hours',
  ],
  [
    'swan_boat',
    'Swan Boat',
    'Rare',
    'Touch it to a body of water: a 50-foot swan-shaped boat appears, moving at 6 miles per hour at your command for 24 hours.',
    'touches the token to the water — a great swan-shaped boat rises from the waves, ready for 24 hours',
  ],
  [
    'tree',
    'Tree',
    'Uncommon',
    'Outdoors, touch it to the ground: a 60-foot oak springs up in its place.',
    'touches the token to the ground — a 60-foot oak tree springs up',
  ],
];

const UTILITY_ITEMS: Array<[string, LootItem]> = [
  // ── Extradimensional containers ─────────────────────────────────────────
  // Simplification: weight limits only (no volume), and nesting one container
  // in another (an Astral gate) can't happen — containers don't hold each other.
  wondrous(
    'bag_of_holding',
    'Bag of Holding',
    'Uncommon',
    'A bag far larger inside than out: it holds up to 500 pounds of your gear and always weighs 5 pounds.',
    null,
    { weight: 5, holds: { lb: 500 } }
  ),
  wondrous(
    'handy_haversack',
    'Handy Haversack',
    'Rare',
    'A backpack of three extradimensional pouches (two of 200 pounds, one of 500): its contents don’t weigh on you, it always weighs 5 pounds, and whatever you reach for is on top.',
    null,
    { weight: 5, holds: { lb: 900 } }
  ),
  // Simplification: treated as holding 5,000 pounds of gear while folded.
  wondrous(
    'portable_hole',
    'Portable Hole',
    'Rare',
    'A black cloth that unfolds into a 10-foot-deep extradimensional hole. Folded up, it weighs next to nothing, whatever is inside.',
    null,
    {
      weight: 0,
      holds: { lb: 5000 },
      carried: true,
      activate: tell(
        'Unfold the hole',
        'spreads the cloth on the ground — a 10-foot-deep hole opens where it lies'
      ),
    }
  ),
  wondrous(
    'efficient_quiver',
    'Efficient Quiver',
    'Uncommon',
    'A quiver of three extradimensional compartments — up to 60 arrows or bolts, 18 javelins and 6 long objects such as bows or spears — that never weighs more than 2 pounds.',
    null,
    { weight: 2, holds: { lb: 60, ammoAndWeapons: true } }
  ),

  // ── Flight, travel and mounts ───────────────────────────────────────────
  // Simplification: the rider flies (the carpet's other passengers aren't
  // modeled), for an hour at a time; the carrying limits aren't checked.
  ...CARPETS.map(([size, ft, note]) =>
    wondrous(
      `carpet_of_flying_${size}`,
      `Carpet of Flying (${size.replace('x', ' × ')} ft)`,
      'Very Rare',
      `Speak its command word to make it hover and fly: you ride it with a Fly Speed of ${ft} feet. ${note}`,
      null,
      {
        carried: true,
        activate: {
          label: 'Fly the carpet',
          effect: { kind: 'condition', conditions: [`carpet_flying_${ft}`], rounds: HOUR },
        },
      }
    )
  ),
  // Simplification: the 30-foot speed over 200 pounds and sending the broom off
  // alone aren't modeled.
  wondrous(
    'broom_of_flying',
    'Broom of Flying',
    'Uncommon',
    'Stand astride it and it hovers: you ride it through the air with a Fly Speed of 50 feet.',
    null,
    {
      weight: 3,
      requiresAttunement: true,
      carried: true,
      activate: {
        label: 'Ride the broom',
        effect: { kind: 'condition', conditions: ['broom_of_flying'], rounds: HOUR },
      },
    }
  ),
  // Simplification: the horseshoes are fitted to whichever mount their bearer rides.
  wondrous(
    'horseshoes_of_speed',
    'Horseshoes of Speed',
    'Rare',
    'A set of four horseshoes: fitted to your mount, they increase its Speed by 30 feet.',
    null,
    { weight: 4, carried: true, wornEffects: [{ kind: 'mount_speed', feet: 30 }] }
  ),
  wondrous(
    'horseshoes_of_a_zephyr',
    'Horseshoes of a Zephyr',
    'Very Rare',
    'A set of four horseshoes: fitted to your mount, it floats just above the ground — ignoring Difficult Terrain, crossing water or lava, leaving no tracks, and traveling 12 hours a day without Exhaustion.',
    null,
    { weight: 4, carried: true, wornEffects: [{ kind: 'mount_float' }] }
  ),
  wondrous(
    'folding_boat',
    'Folding Boat',
    'Rare',
    'A small wooden box that unfolds into a Rowboat or a Keelboat at a command word, and folds back up when empty.',
    null,
    {
      weight: 4,
      carried: true,
      activate: tell('Unfold the boat', 'speaks a command word — the box unfolds into a boat'),
    }
  ),
  wondrous(
    'rope_of_climbing',
    'Rope of Climbing',
    'Uncommon',
    'A 60-foot rope that moves at your command: it slithers to a spot you choose, fastens or unfastens itself, and knots itself for an easier climb.',
    null,
    {
      weight: 3,
      carried: true,
      activate: tell(
        'Command the rope',
        'commands the rope — it slithers toward its destination and fastens itself'
      ),
    }
  ),
  wondrous(
    'rope_of_entanglement',
    'Rope of Entanglement',
    'Rare',
    'Hold one end and command the other to entangle a creature within 20 feet: DC 15 Dexterity save or Restrained (DC 15 to break free). Hold it in your off hand.',
    'off_hand',
    { weight: 3, itemSpellDc: 15, itemSpells: [sp('entangle_rope', 0)] }
  ),
  wondrous(
    'ring_of_feather_falling',
    'Ring of Feather Falling',
    'Rare',
    'When you fall, you drift down 60 feet per round and take no falling damage.',
    'ring',
    { requiresAttunement: true, weight: 0, wornEffects: [{ kind: 'feather_fall' }] }
  ),
  // Simplification: the immunity covers every source, not just magic.
  wondrous(
    'ring_of_free_action',
    'Ring of Free Action',
    'Rare',
    'Difficult Terrain costs you no extra movement, and magic can’t reduce your Speed or make you Paralyzed or Restrained.',
    'ring',
    {
      requiresAttunement: true,
      weight: 0,
      wornEffects: [
        { kind: 'free_action' },
        { kind: 'condition_immunity', condition: 'paralyzed' },
        { kind: 'condition_immunity', condition: 'restrained' },
      ],
    }
  ),
  // Simplification: the Polymorph into a bat isn't modeled.
  wondrous(
    'cloak_of_the_bat',
    'Cloak of the Bat',
    'Rare',
    'Advantage on Dexterity (Stealth) checks, and in Dim Light or Darkness you can grip its edges to fly (Fly Speed 40 feet).',
    'cloak',
    {
      requiresAttunement: true,
      wornEffects: [
        { kind: 'skill_advantage', skill: 'stealth' },
        { kind: 'dark_flight', feet: 40 },
      ],
    }
  ),
  wondrous(
    'amulet_of_the_planes',
    'Amulet of the Planes',
    'Very Rare',
    'Name a familiar place on another plane and cast Plane Shift to go there.',
    'neck',
    // Simplification: the DC 15 Arcana check (and its random destinations on a
    // failure) isn't rolled.
    { requiresAttunement: true, itemSpells: [sp('plane_shift', 0)] }
  ),
  wondrous(
    'cubic_gate',
    'Cubic Gate',
    'Legendary',
    '3 charges (regains 1d3 at dawn). Press a side to cast Gate, or press it twice to cast Plane Shift, to the plane keyed to that side.',
    null,
    {
      castWhileCarried: true,
      charges: { max: 3, regain: '1d3' },
      itemSpells: [sp('gate', 1), sp('plane_shift', 1)],
    }
  ),
  // Simplification: once a day instead of after 1d8 hours.
  wondrous(
    'well_of_many_worlds',
    'Well of Many Worlds',
    'Legendary',
    'A black cloth that unfolds into a two-way portal to another world or plane, open until someone folds it up.',
    null,
    {
      weight: 0,
      carried: true,
      activate: tell(
        'Open a portal',
        'unfolds the cloth — a shimmering portal to another world opens',
        { daily: true }
      ),
    }
  ),
  wondrous(
    'instant_fortress',
    'Instant Fortress',
    'Rare',
    'Set the statuette down and speak its command word: it grows into a 20-foot-square, 30-foot-high adamantine tower with arrow slits and a door that opens only for you.',
    null,
    {
      requiresAttunement: true,
      weight: 0,
      carried: true,
      activate: tell(
        'Raise the fortress',
        'sets the statuette down — it grows into an adamantine tower'
      ),
    }
  ),

  // ── Senses and detection ────────────────────────────────────────────────
  wondrous(
    'gem_of_seeing',
    'Gem of Seeing',
    'Rare',
    '3 charges (regains 1d3 at dawn). Spend 1 to peer through it: Truesight out to 120 feet for 10 minutes. Hold it in your off hand.',
    'off_hand',
    {
      requiresAttunement: true,
      weight: 0,
      charges: { max: 3, regain: '1d3' },
      activate: {
        label: 'Peer through the gem',
        charges: 1,
        effect: { kind: 'condition', conditions: ['gem_of_seeing'], rounds: 100 },
      },
    }
  ),
  // Simplification: it reveals Invisible creatures to its bearer's attacks (within
  // 30 feet), not to everyone in its light.
  wondrous(
    'lantern_of_revealing',
    'Lantern of Revealing',
    'Uncommon',
    'A hooded lantern: Bright Light in a 30-foot radius (Dim Light 30 feet beyond), and Invisible creatures in its Bright Light can be seen. Hold it in your off hand.',
    'off_hand',
    {
      weight: 2,
      wornEffects: [
        { kind: 'light', radiusFt: 30 },
        { kind: 'reveal_invisible', feet: 30 },
      ],
    }
  ),
  wondrous(
    'eyes_of_minute_seeing',
    'Eyes of Minute Seeing',
    'Uncommon',
    'Crystal lenses: Advantage on Intelligence (Investigation) checks to examine things up close.',
    'head',
    { weight: 0, wornEffects: [{ kind: 'skill_advantage', skill: 'investigation' }] }
  ),
  // No mechanical effect yet — the engine rolls no Sleight of Hand checks.
  wondrous(
    'gloves_of_thievery',
    'Gloves of Thievery',
    'Uncommon',
    'Imperceptible while worn: +5 to Dexterity (Sleight of Hand) checks.',
    'hands',
    { weight: 0 }
  ),
  wondrous(
    'ring_of_mind_shielding',
    'Ring of Mind Shielding',
    'Uncommon',
    'Magic can’t read your thoughts, tell whether you lie, or learn your alignment or creature type, and others speak to you telepathically only if you allow it. If you die wearing it, your soul may dwell in the ring.',
    'ring',
    {
      requiresAttunement: true,
      weight: 0,
      activate: tell('Hide the ring', 'turns the ring imperceptible'),
    }
  ),
  wondrous(
    'ring_of_x_ray_vision',
    'Ring of X-ray Vision',
    'Rare',
    'See through solid matter within 30 feet for 1 minute. Using it again before a Long Rest takes a DC 15 Constitution save or a level of Exhaustion.',
    'ring',
    {
      requiresAttunement: true,
      weight: 0,
      activate: tell(
        'X-ray vision',
        'gazes through stone, metal and wood out to 30 feet for 1 minute',
        { reuseExhaustionDc: 15 }
      ),
    }
  ),
  wondrous(
    'sending_stones',
    'Sending Stones',
    'Uncommon',
    'A matched pair: touching one, you cast Sending to the bearer of the other. Then neither works again until dawn.',
    null,
    { weight: 0, castWhileCarried: true, itemSpells: [sp('sending', 0, { daily: true })] }
  ),
  wand(
    'wand_of_secrets',
    'Wand of Secrets',
    'Uncommon',
    '3 charges (regains 1d3 at dawn). Spend 1: the wand points to the nearest secret door or trap within 60 feet.',
    {
      charges: { max: 3, regain: '1d3' },
      activate: tell(
        'Seek secrets',
        'sweeps the wand around — it pulses toward the nearest secret door or trap within 60 feet, if there is one',
        { charges: 1 }
      ),
    }
  ),
  wand(
    'wand_of_enemy_detection',
    'Wand of Enemy Detection',
    'Rare',
    '7 charges (regains 1d6+1 at dawn). Spend 1: for 1 minute you know the direction of the nearest hostile creature within 60 feet, even invisible or hidden.',
    {
      requiresAttunement: true,
      charges: WAND_CHARGES,
      activate: tell(
        'Sense enemies',
        'feels the wand tug toward the nearest hostile creature within 60 feet',
        { charges: 1 }
      ),
    }
  ),

  // ── Dusts, smoke, water and light ───────────────────────────────────────
  wondrous(
    'dust_of_disappearance',
    'Dust of Disappearance',
    'Uncommon',
    'Toss it into the air: you and everyone within 10 feet turn Invisible for 2d4 minutes (ending for a creature when it attacks, deals damage or casts a spell). One use.',
    null,
    {
      weight: 0,
      carried: true,
      charges: uses(1),
      activate: {
        label: 'Throw the dust',
        charges: 1,
        effect: { kind: 'condition', conditions: ['invisible'], rounds: '2d4m', party: 10 },
      },
    }
  ),
  // Simplification: a fixed 7 pinches (1d6 + 4 found).
  wondrous(
    'dust_of_dryness',
    'Dust of Dryness',
    'Uncommon',
    '7 pinches. A pinch turns a 15-foot cube of water into a pellet; sprinkled on a creature made mostly of water (a Water Elemental) within 5 feet, it makes a DC 13 Constitution save or takes 10d6 Necrotic (half on a success).',
    null,
    {
      weight: 0,
      castWhileCarried: true,
      charges: uses(7),
      itemSpellDc: 13,
      itemSpells: [sp('dryness_dust', 1)],
    }
  ),
  wondrous(
    'decanter_of_endless_water',
    'Decanter of Endless Water',
    'Uncommon',
    'Pours fresh or salt water on command — a splash, a fountain, or a geyser that knocks one creature in a 30-foot line Prone (DC 13 Strength save, 1d4 Bludgeoning). Hold it in your off hand.',
    'off_hand',
    { weight: 2, itemSpellDc: 13, itemSpells: [sp('geyser', 0)] }
  ),
  wondrous(
    'eversmoking_bottle',
    'Eversmoking Bottle',
    'Uncommon',
    'Unstopper it and thick smoke billows out, Heavily Obscuring a 60-foot Emanation that grows to 120 feet; closed again, the cloud lingers 10 minutes.',
    null,
    {
      carried: true,
      activate: tell(
        'Open the bottle',
        'unstoppers the bottle — thick smoke billows out and swallows the area from sight'
      ),
    }
  ),
  // Simplification: once spent, it keeps its name (a 50 GP jewel at the table).
  wondrous(
    'gem_of_brightness',
    'Gem of Brightness',
    'Uncommon',
    '50 charges (no recharge). Shed light (no charge), fire a beam at one creature within 60 feet (1 charge), or flare in a 30-foot cone (5 charges): DC 15 Constitution save or Blinded for 1 minute. Hold it in your off hand.',
    'off_hand',
    {
      weight: 0,
      charges: { max: 50, regain: '0' },
      itemSpellDc: 15,
      itemSpells: [sp('light', 0), sp('brightness_beam', 1), sp('brightness_flare', 5)],
    }
  ),
  wondrous(
    'iron_bands',
    'Iron Bands',
    'Rare',
    'Throw the sphere at a creature within 60 feet (ranged attack, Dexterity + Proficiency Bonus): on a hit it’s Restrained by iron bands until it breaks free (DC 20 Strength). Then not again until dawn.',
    null,
    {
      weight: 1,
      castWhileCarried: true,
      itemSpells: [sp('iron_bands', 0, { daily: true, attack: 'dex' })],
    }
  ),
  wondrous(
    'dimensional_shackles',
    'Dimensional Shackles',
    'Rare',
    'Shackles for an Incapacitated creature of Small to Large size: while bound, it can’t teleport or travel to another plane. It can try to break free (DC 30 Strength) once every 30 days.',
    null,
    {
      carried: true,
      activate: tell(
        'Shackle a captive',
        'clamps the shackles on an Incapacitated captive — it can no longer teleport or leave the plane'
      ),
    }
  ),
  wondrous(
    'immovable_rod',
    'Immovable Rod',
    'Uncommon',
    'Press its button and the rod is fixed in place, holding up to 8,000 pounds, until the button is pressed again.',
    null,
    {
      weight: 2,
      carried: true,
      activate: tell('Press the button', 'presses the button — the rod locks fast in midair'),
    }
  ),
  wondrous(
    'bead_of_nourishment',
    'Bead of Nourishment',
    'Common',
    'A flavorless bead that nourishes like a day of Rations. One use.',
    null,
    {
      weight: 0,
      carried: true,
      charges: uses(1),
      activate: tell('Eat the bead', 'swallows the bead — a full day of nourishment', {
        charges: 1,
      }),
    }
  ),
  // Simplification: a fixed 4 ounces (1d6 + 1 found).
  wondrous(
    'sovereign_glue',
    'Sovereign Glue',
    'Legendary',
    '4 ounces. An ounce bonds two objects (a 1-foot square) permanently once it sets — only Universal Solvent, Oil of Etherealness or Wish breaks the bond.',
    null,
    {
      weight: 0,
      carried: true,
      charges: uses(4),
      activate: tell(
        'Apply an ounce',
        'spreads an ounce of the glue — in a minute the bond is unbreakable',
        {
          charges: 1,
        }
      ),
    }
  ),
  wondrous(
    'universal_solvent',
    'Universal Solvent',
    'Legendary',
    '4 ounces. Each ounce dissolves a square foot of adhesive, Sovereign Glue included.',
    null,
    {
      weight: 0,
      carried: true,
      charges: uses(4),
      activate: tell('Pour an ounce', 'pours out an ounce — the adhesive dissolves', {
        charges: 1,
      }),
    }
  ),
  // Simplification: a fixed 2 pots (1d4 found).
  wondrous(
    'marvelous_pigments',
    'Marvelous Pigments',
    'Very Rare',
    '2 pots of pigment. Ten minutes of painting with one pot makes real objects and terrain (doors, pits, trees) within a 20-foot cube, none worth more than 25 GP.',
    null,
    {
      weight: 1,
      carried: true,
      charges: uses(2),
      activate: tell('Paint', 'paints for ten minutes — the painted things become real', {
        charges: 1,
      }),
    }
  ),
  ...FEATHER_TOKENS.map(([kind, name, rarity, desc, text]) =>
    wondrous(`feather_token_${kind}`, `Feather Token (${name})`, rarity, `${desc} One use.`, null, {
      weight: 0,
      carried: true,
      charges: uses(1),
      activate: tell(`Use the ${name} token`, text, { charges: 1 }),
    })
  ),
  wondrous(
    'feather_token_bird',
    'Feather Token (Bird)',
    'Rare',
    'Toss it into the air: it becomes an enormous bird (a Roc that can’t attack) that carries you. One use.',
    null,
    { weight: 0, castWhileCarried: true, charges: uses(1), itemSpells: [sp('feather_bird', 1)] }
  ),
  wondrous(
    'feather_token_whip',
    'Feather Token (Whip)',
    'Rare',
    'Throw it: a floating whip lashes a creature (+9 to hit, 1d6 + 5 Force) and keeps striking as a Bonus Action for 1 hour. One use.',
    null,
    {
      weight: 0,
      castWhileCarried: true,
      charges: uses(1),
      itemSpells: [sp('feather_whip', 1, { attack: 9 })],
    }
  ),
];

// ─── Unique items (SRD 5.2.1, batch 12) ──────────────────────────────────────
// Spell-canceling and spell-storing items, the Dancing Sword, the Helm of
// Brilliance, the Rods of Lordly Might and Security, the Rings of Three
// Wishes, Spell Turning and Elemental Command, the Candle of Invocation and
// the Manuals of Golems.
const ELEMENTAL_RINGS: Array<[string, string, WornEffect[], ItemSpell[], string]> = [
  [
    'air',
    'Air',
    [
      { kind: 'resistance', damageType: 'lightning' },
      { kind: 'speed_mode', mode: 'fly', feet: 'walk' },
    ],
    [sp('chain_lightning', 3), sp('feather_fall', 0), sp('gust_of_wind', 2), sp('wind_wall', 1)],
    'Resistance to Lightning damage and a Fly Speed equal to your Speed. Spells: Chain Lightning (3), Feather Fall (0), Gust of Wind (2), Wind Wall (1).',
  ],
  [
    'earth',
    'Earth',
    [{ kind: 'resistance', damageType: 'acid' }, { kind: 'ignore_difficult_terrain' }],
    [sp('earthquake', 5), sp('stone_shape', 2), sp('stoneskin', 3), sp('wall_of_stone', 3)],
    'Resistance to Acid damage, and rubble, rock and dirt aren’t Difficult Terrain for you. Spells: Earthquake (5), Stone Shape (2), Stoneskin (3), Wall of Stone (3).',
  ],
  [
    'fire',
    'Fire',
    [{ kind: 'damage_immunity', damageType: 'fire' }],
    [sp('burning_hands', 1), sp('fireball', 2), sp('fire_storm', 4), sp('wall_of_fire', 3)],
    'Immunity to Fire damage. Spells: Burning Hands (1), Fireball (2), Fire Storm (4), Wall of Fire (3).',
  ],
  [
    'water',
    'Water',
    [{ kind: 'speed_mode', mode: 'swim', feet: 60 }],
    [
      sp('create_or_destroy_water', 1),
      sp('ice_storm', 2),
      sp('tsunami', 5),
      sp('wall_of_ice', 3),
      sp('water_walk', 2),
    ],
    'A Swim Speed of 60 feet and you can breathe underwater. Spells: Create or Destroy Water (1), Ice Storm (2), Tsunami (5), Wall of Ice (3), Water Walk (2).',
  ],
];
const GOLEMS: Array<[string, string, number]> = [
  ['clay', 'Clay', 65000],
  ['flesh', 'Flesh', 50000],
  ['iron', 'Iron', 100000],
  ['stone', 'Stone', 80000],
];

const UNIQUE_ITEMS: Array<[string, LootItem]> = [
  wondrous(
    'ring_of_three_wishes',
    'Ring of Three Wishes',
    'Legendary',
    '3 charges. Spend 1 to cast Wish; the ring loses its magic with the last.',
    'ring',
    { weight: 0, charges: uses(3), itemSpells: [sp('wish', 1)] }
  ),
  // Simplification: Shield (a Reaction) isn't offered from the cube.
  wondrous(
    'cube_of_force',
    'Cube of Force',
    'Rare',
    '10 charges (regains 1d6 at dawn). Press a face to cast its spell (save DC 17): Mage Armor (1), Shield (1), Tiny Hut (3), Private Sanctum (4), Resilient Sphere (4), Wall of Force (5).',
    null,
    {
      requiresAttunement: true,
      weight: 0,
      castWhileCarried: true,
      charges: { max: 10, regain: '1d6' },
      itemSpellDc: 17,
      itemSpells: [
        sp('mage_armor', 1),
        sp('shield', 1),
        sp('tiny_hut', 3),
        sp('private_sanctum', 4),
        sp('resilient_sphere', 4),
        sp('wall_of_force', 5),
      ],
    }
  ),
  // Simplification: deflecting a spell back at its caster isn't modeled.
  wondrous(
    'ring_of_spell_turning',
    'Ring of Spell Turning',
    'Legendary',
    'Advantage on saving throws against spells, and a spell of level 7 or lower that you save against has no effect on you.',
    'ring',
    { requiresAttunement: true, weight: 0, wornEffects: [{ kind: 'spell_turning' }] }
  ),
  // Simplification: found with 5 levels stored (1d10); converting energy to a
  // slot restores an expended slot at no action cost.
  wondrous(
    'rod_of_absorption',
    'Rod of Absorption',
    'Very Rare',
    'While you hold it, your Reaction absorbs a spell aimed at you alone (no area): it has no effect and its levels are stored (50 in the rod’s lifetime). A spellcaster can turn stored levels into spell slots of up to level 5. Hold it in your off hand.',
    'off_hand',
    {
      requiresAttunement: true,
      weight: 2,
      absorbSpells: { maxLevel: 9, lifetime: 50, targetedOnly: true, startEnergy: 5 },
      activate: {
        label: 'Draw stored energy',
        effect: { kind: 'energy_slot', maxLevel: 5 },
      },
    }
  ),
  wondrous(
    'ioun_stone_of_absorption',
    'Ioun Stone of Absorption',
    'Very Rare',
    'While it orbits your head, your Reaction cancels a spell of level 4 or lower cast by a creature you can see. It burns out after canceling 20 levels of spells.',
    null,
    {
      requiresAttunement: true,
      weight: 0,
      carried: true,
      absorbSpells: { maxLevel: 4, lifetime: 20 },
    }
  ),
  wondrous(
    'ioun_stone_of_greater_absorption',
    'Ioun Stone of Greater Absorption',
    'Legendary',
    'While it orbits your head, your Reaction cancels a spell of level 8 or lower cast by a creature you can see. It burns out after canceling 20 levels of spells.',
    null,
    {
      requiresAttunement: true,
      weight: 0,
      carried: true,
      absorbSpells: { maxLevel: 8, lifetime: 20 },
    }
  ),
  // Simplification: found empty (no 1d6 − 1 levels chosen by the GM), and only
  // the bearer casts spells into it.
  wondrous(
    'ring_of_spell_storing',
    'Ring of Spell Storing',
    'Rare',
    'Holds up to 5 levels of spells (each of level 1 to 5) cast into it. While wearing it, you cast a stored spell with its original slot level, save DC and attack bonus.',
    'ring',
    { requiresAttunement: true, weight: 0, spellStore: { levels: 5, maxLevel: 5 } }
  ),
  wondrous(
    'ioun_stone_of_reserve',
    'Ioun Stone of Reserve',
    'Rare',
    'While it orbits your head it holds up to 4 levels of spells (each of level 1 to 4) cast into it, and you can cast them with their original slot level, save DC and attack bonus.',
    null,
    {
      requiresAttunement: true,
      weight: 0,
      carried: true,
      castWhileCarried: true,
      spellStore: { levels: 4, maxLevel: 4 },
    }
  ),
  // SRD Dancing Sword (Very Rare, attunement). Simplification: the hovering
  // blade's strike is a Bonus Action attack with the sword in hand, made each
  // turn (it returns after four, ready to be tossed again).
  ...named(['greatsword', 'longsword', 'rapier', 'scimitar', 'shortsword'], (b) =>
    namedMagic(
      b.id,
      `dancing_sword_${b.id}`,
      `Dancing ${b.name}`,
      RARITY_VALUE['Very Rare'],
      `${b.desc} A magic weapon you can toss into the air as a Bonus Action: it flies to a creature and attacks it with your attack roll and ability modifier. (Very Rare; requires attunement.)`,
      { requiresAttunement: true, bonusAttack: true }
    )
  ),
  // Simplification: a fixed 5 diamonds, 10 rubies, 15 fire opals and 20 opals;
  // the Diamond Light against Undead, losing the Fire Resistance with the last
  // ruby, and the helm bursting when it fails a save against fire aren't
  // modeled. The blazing weapon lasts the fight.
  wondrous(
    'helm_of_brilliance',
    'Helm of Brilliance',
    'Very Rare',
    'Set with gems: Resistance to Fire damage; a Magic action sets your weapon ablaze (+1d6 Fire on a hit); and each gem can be spent to cast a spell (save DC 18) — Daylight (20 opals), Fireball (15 fire opals), Prismatic Spray (5 diamonds) or Wall of Fire (10 rubies).',
    'head',
    {
      requiresAttunement: true,
      wornEffects: [{ kind: 'resistance', damageType: 'fire' }],
      itemSpellDc: 18,
      itemSpells: [
        sp('helm_flames', 0),
        sp('daylight', 0, { uses: 20 }),
        sp('fireball', 0, { uses: 15 }),
        sp('prismatic_spray', 0, { uses: 5 }),
        sp('wall_of_fire', 0, { uses: 10 }),
      ],
    }
  ),
  // SRD Rod of Lordly Might (Legendary, attunement) — a +3 Mace. Simplification:
  // Drain Life and Paralyze are armed before the attack (a free choice), and
  // the six buttons' other forms (flame blade, axe, spear, pole, ram, compass)
  // aren't modeled.
  namedMagic(
    'mace',
    'rod_of_lordly_might',
    'Rod of Lordly Might',
    RARITY_VALUE.Legendary,
    'A +3 mace with six buttons that change its form. Once per dawn each: Drain Life (a hit forces a DC 17 Constitution save or 4d6 extra Necrotic, and you regain half), Paralyze (a hit forces a DC 17 Constitution save or Paralyzed for 1 minute), and Terrify (each creature within 30 feet makes a DC 17 Wisdom save or is Frightened for 1 minute). (Legendary; requires attunement.)',
    {
      requiresAttunement: true,
      magicBonus: 3,
      itemSpellDc: 17,
      itemSpells: [sp('lordly_terrify', 0, { daily: true })],
      weaponPowers: [
        {
          id: 'drain_life',
          label: 'Drain Life',
          cost: 'free',
          daily: true,
          rider: {
            label: 'Drain Life',
            dice: '4d6',
            damageType: 'necrotic',
            healHalf: true,
            save: { ability: 'con', dc: 17, onSave: 'none' },
          },
        },
        {
          id: 'paralyze',
          label: 'Paralyze',
          cost: 'free',
          daily: true,
          rider: {
            label: 'Paralyze',
            dice: '0',
            save: { ability: 'con', dc: 17, condition: 'paralyzed', rounds: 10, saveEnds: true },
          },
        },
      ],
    }
  ),
  wand(
    'rod_of_security',
    'Rod of Security',
    'Very Rare',
    'Take yourself and up to 199 willing creatures to a demiplane of your design, with food and water, where each hour heals like a spent Hit Point Die. Then not again for 10 days.',
    {
      weight: 2,
      activate: {
        label: 'Open the demiplane',
        effect: {
          kind: 'narrative',
          text: 'raises the rod — the party steps into a safe demiplane of their choosing',
        },
        rechargeDays: 10,
      },
    }
  ),
  ...ELEMENTAL_RINGS.map(([plane, name, focus, spells, desc]) =>
    wondrous(
      `ring_of_elemental_command_${plane}`,
      `Ring of Elemental Command (${name})`,
      'Legendary',
      `Advantage on attack rolls against Elementals and they have Disadvantage against you; a Magic action compels an Elemental within 60 feet (DC 18 Wisdom save or Charmed until your next turn). ${desc} 5 charges (regains 1d4 + 1 at dawn); spells have save DC 18.`,
      'ring',
      {
        requiresAttunement: true,
        weight: 0,
        wornEffects: [{ kind: 'creature_bane', creatureType: 'elemental' }, ...focus],
        charges: { max: 5, regain: '1d4+1' },
        itemSpellDc: 18,
        itemSpells: [sp('elemental_compulsion', 0), ...spells],
      }
    )
  ),
  // Simplification: the candle burns all 4 hours at once (no snuffing it out),
  // its Advantage covers attack rolls and saving throws (not ability checks),
  // and a Cleric's or Druid's free level 1 spells aren't modeled.
  wondrous(
    'candle_of_invocation',
    'Candle of Invocation',
    'Very Rare',
    'Light it: for 4 hours you and those within 30 feet have Advantage on D20 Tests. Or, the first time it’s lit, cast Gate with it (which destroys the candle).',
    null,
    {
      requiresAttunement: true,
      weight: 0,
      carried: true,
      castWhileCarried: true,
      charges: uses(1),
      activate: {
        label: 'Light the candle',
        charges: 1,
        effect: {
          kind: 'condition',
          conditions: ['candle_of_invocation'],
          rounds: 4 * HOUR,
          party: 30,
        },
      },
      itemSpells: [sp('gate', 1)],
    }
  ),
  // Simplification: building takes no in-world time, and a creature that can't
  // use the manual is simply refused (no Psychic damage).
  ...GOLEMS.map(([kind, name, gold]) =>
    wondrous(
      `manual_of_golems_${kind}`,
      `Manual of Golems (${name})`,
      'Very Rare',
      `A spellcaster with two level 5 spell slots can build a ${name} Golem with it (${gold.toLocaleString('en-US')} GP of supplies); the book burns, and the golem obeys you.`,
      null,
      {
        weight: 5,
        castWhileCarried: true,
        charges: uses(1),
        itemSpells: [sp(`build_${kind}_golem`, 1, { requires: { slotLevel: 5, slots: 2, gold } })],
      }
    )
  ),
  // Simplification: a trap item with no mechanics yet — nothing is devoured.
  wondrous(
    'bag_of_devouring',
    'Bag of Devouring',
    'Very Rare',
    'It looks like a Bag of Holding, but it is the mouth of a vast extradimensional creature: it devours animal or vegetable matter put in it and may drag in a creature that reaches inside.',
    null,
    { weight: 5 }
  ),
];

// ─── Random-table items (SRD 5.2.1, batch 13) ────────────────────────────────
// Items whose use is decided by a roll on their own table: the Wand of Wonder
// (`itemEffect`), the Bags of Tricks (a summon's `randomForms`), the Bag of
// Beans, and the Ivory Goats (three figurines, each with its own recharge).
const BAGS_OF_TRICKS: Array<[string, string]> = [
  ['gray', 'Weasel, Giant Rat, Badger, Boar, Panther, Giant Badger, Dire Wolf or Giant Elk'],
  ['rust', 'Rat, Owl, Mastiff, Goat, Giant Goat, Giant Boar, Lion or Brown Bear'],
  ['tan', 'Jackal, Ape, Baboon, Axe Beak, Black Bear, Giant Weasel, Giant Hyena or Tiger'],
];
const RANDOM_ITEMS: Array<[string, LootItem]> = [
  wand(
    'wand_of_wonder',
    'Wand of Wonder',
    'Rare',
    '7 charges (regains 1d6+1 at dawn; spending the last one risks crumbling it to dust). Spend a charge to point it at a spot within 120 feet, then roll 1d100 to see what happens — a Fireball, Lightning Bolt, a cloud of butterflies, a stream of gems, or something stranger. Its spells have save DC 15.',
    {
      requiresAttunement: true,
      charges: WAND_CHARGES,
      itemSpellDc: 15,
      itemSpells: [sp('wand_of_wonder', 1)],
    }
  ),
  ...BAGS_OF_TRICKS.map(([color, table]) =>
    wondrous(
      `bag_of_tricks_${color}`,
      `Bag of Tricks (${cap(color)})`,
      'Uncommon',
      `Out of combat, pull a fuzzy ball from the bag and toss it: it becomes a random creature (1d8: ${table}) that joins the party until the next Long Rest. Three balls per dawn.`,
      null,
      {
        weight: 0.5,
        castWhileCarried: true,
        charges: { max: 3, regain: '3' },
        itemSpells: [sp(`bag_of_tricks_${color}`, 1)],
      }
    )
  ),
  // Simplification: the bag holds a fixed 7 beans rather than 3d4.
  wondrous(
    'bag_of_beans',
    'Bag of Beans',
    'Rare',
    'Holds 7 dry beans. Dump some out and they explode around you (DC 15 Dexterity save, 5d4 Force damage, half on a success; you are caught too). Or, out of combat, plant one and water it: a minute later something springs from the ground (roll 1d100).',
    null,
    {
      weight: 0.5,
      castWhileCarried: true,
      charges: uses(7),
      itemSpellDc: 15,
      itemSpells: [sp('beans_dump', 1), sp('beans_plant', 1)],
    }
  ),
  wondrous(
    'figurine_of_wondrous_power_ivory_goats',
    'Figurine of Wondrous Power (Ivory Goats)',
    'Rare',
    "Three goat statuettes. Out of combat, throw one to turn it into a goat that joins the party until the next Long Rest: the Goat of Travail becomes a Giant Goat that fights (then not again for 30 days), the Goat of Traveling a large goat you can ride (as often as you like), and the Goat of Terror a Giant Goat you can ride that doesn't attack (then not again for 15 days).",
    null,
    {
      weight: 0,
      castWhileCarried: true,
      itemSpells: [
        sp('goat_of_travail', 0, { rechargeDays: 30 }),
        sp('goat_of_traveling', 0),
        sp('goat_of_terror', 0, { rechargeDays: 15 }),
      ],
    }
  ),
];

const MAGIC_ITEMS: Record<string, LootItem> = Object.fromEntries([
  ...BASE_WEAPON_IDS.flatMap((b) =>
    WEAPON_RARITY.map(([n, v, r]) => magicVariant(b, n, v, r, 'weapon'))
  ),
  ...BASE_ARMOR_IDS.flatMap((b) =>
    ARMOR_RARITY.map(([n, v, r]) => magicVariant(b, n, v, r, 'armor'))
  ),
  // Shields — +N adds to the shield's normal +2 AC. Uncommon / Rare / Very Rare.
  ...WEAPON_RARITY.map(([n, v, r]) => magicVariant('shield', n, v, r, 'armor')),
  ...['arrows', 'crossbow_bolts', 'sling_bullets', 'blowgun_needles', 'firearm_bullets'].flatMap(
    (b) =>
      (
        [
          [1, 100, 'Uncommon'],
          [2, 500, 'Rare'],
          [3, 2500, 'Very Rare'],
        ] as const
      ).map(([n, v, r]) => magicAmmo(b, n, v, r))
  ),

  // ── Named magic weapons (SRD 5.2.1) ────────────────────────────────────────
  // SRD Vicious Weapon (Rare) — +2d6 of the weapon's type on every hit.
  ...named(['longsword', 'greataxe', 'rapier', 'longbow', 'dagger'], (b) =>
    namedMagic(
      b.id,
      `vicious_${b.id}`,
      `Vicious ${b.name}`,
      3500,
      `${b.desc} A magic weapon: every hit deals an extra 2d6 damage of its type. (Rare.)`,
      { magicRiders: [{ label: 'Vicious', dice: '2d6' }] }
    )
  ),
  // SRD Dragon Slayer (Rare) — +1; +3d6 of its type against Dragons.
  ...named(['longsword', 'greatsword', 'longbow'], (b) =>
    namedMagic(
      b.id,
      `dragon_slayer_${b.id}`,
      `Dragon Slayer ${b.name}`,
      3500,
      `${b.desc} A magic weapon: +1 to attack and damage, and +3d6 damage against Dragons. (Rare.)`,
      {
        magicBonus: 1,
        magicRiders: [{ label: 'Dragon Slayer', dice: '3d6', vsCreatureTypes: ['dragon'] }],
      }
    )
  ),
  // SRD Giant Slayer (Rare) — +1; +2d6 of its type against Giants.
  // Simplification: the DC 15 STR save against Prone isn't modeled.
  ...named(['greataxe', 'longsword', 'longbow'], (b) =>
    namedMagic(
      b.id,
      `giant_slayer_${b.id}`,
      `Giant Slayer ${b.name}`,
      3500,
      `${b.desc} A magic weapon: +1 to attack and damage, and +2d6 damage against Giants. (Rare.)`,
      {
        magicBonus: 1,
        magicRiders: [{ label: 'Giant Slayer', dice: '2d6', vsCreatureTypes: ['giant'] }],
      }
    )
  ),
  // SRD Flame Tongue (Rare, attunement) — +2d6 Fire while ablaze; sheds light.
  // Simplification: always ablaze while wielded (no Bonus Action toggle).
  ...named(['longsword', 'greatsword', 'scimitar', 'rapier'], (b) =>
    namedMagic(
      b.id,
      `flame_tongue_${b.id}`,
      `Flame Tongue ${b.name}`,
      3500,
      `${b.desc} A magic weapon wreathed in flame: +2d6 Fire damage on a hit, and bright light out to 40 ft. (Rare; requires attunement.)`,
      {
        requiresAttunement: true,
        magicRiders: [{ label: 'Flame Tongue', dice: '2d6', damageType: 'fire' }],
        wornEffects: [{ kind: 'light', radiusFt: 40 }],
      }
    )
  ),
  // SRD Holy Avenger (Legendary, attunement by a Paladin) — +3; +2d10 Radiant
  // vs Fiends and Undead. Simplification: the save aura isn't modeled.
  ...named(['longsword', 'greatsword'], (b) =>
    namedMagic(
      b.id,
      `holy_avenger_${b.id}`,
      `Holy Avenger ${b.name}`,
      50000,
      `${b.desc} A holy weapon: +3 to attack and damage, and +2d10 Radiant damage against Fiends and Undead. (Legendary; requires attunement by a Paladin.)`,
      {
        requiresAttunement: true,
        magicBonus: 3,
        magicRiders: [
          {
            label: 'Holy Avenger',
            dice: '2d10',
            damageType: 'radiant',
            vsCreatureTypes: ['fiend', 'undead'],
          },
        ],
      }
    )
  ),
  // SRD Weapon of Warning (Uncommon, attunement) — you and nearby allies have
  // Advantage on Initiative.
  ...named(['longsword', 'shortsword', 'longbow'], (b) =>
    namedMagic(
      b.id,
      `weapon_of_warning_${b.id}`,
      `${b.name} of Warning`,
      500,
      `${b.desc} A magic weapon: you and your allies have Advantage on Initiative rolls. (Uncommon; requires attunement.)`,
      {
        requiresAttunement: true,
        magicRiders: [],
        wornEffects: [{ kind: 'initiative_advantage', party: true }],
      }
    )
  ),
  // SRD Defender (Legendary, attunement) — +3. Simplification: moving the bonus
  // to AC isn't modeled.
  ...named(['longsword', 'greatsword'], (b) =>
    namedMagic(
      b.id,
      `defender_${b.id}`,
      `Defender ${b.name}`,
      50000,
      `${b.desc} A magic weapon: +3 to attack and damage. (Legendary; requires attunement.)`,
      { requiresAttunement: true, magicBonus: 3 }
    )
  ),
  // SRD Energy Bow (Very Rare, attunement) — +1; conjures Force arrows.
  ...named(['longbow', 'shortbow'], (b) =>
    namedMagic(
      b.id,
      `energy_bow_${b.id}`,
      `Energy ${b.name}`,
      15000,
      `${b.desc} A stringless magic bow: +1 to attack and damage, and it conjures arrows of Force — no ammunition needed. (Very Rare; requires attunement.)`,
      { requiresAttunement: true, magicBonus: 1, damageType: 'force', conjuresAmmo: true }
    )
  ),
  // SRD Mace of Disruption (Rare, attunement) — +2d6 Radiant vs Fiends and
  // Undead; sheds light. Simplification: the destroy-at-25-HP save isn't modeled.
  namedMagic(
    'mace',
    'mace_of_disruption',
    'Mace of Disruption',
    3500,
    'A magic mace: +2d6 Radiant damage against Fiends and Undead, and bright light out to 20 ft. (Rare; requires attunement.)',
    {
      requiresAttunement: true,
      wornEffects: [{ kind: 'light', radiusFt: 20 }],
      magicRiders: [
        {
          label: 'Disruption',
          dice: '2d6',
          damageType: 'radiant',
          vsCreatureTypes: ['fiend', 'undead'],
        },
      ],
    }
  ),
  // SRD Mace of Smiting (Rare) — +1 (+3 vs Constructs); a 20 deals +7 (+14 vs
  // Constructs). Simplification: the extra +2 to hit Constructs and the
  // destroy-at-25-HP rider aren't modeled (the +2 damage is).
  namedMagic(
    'mace',
    'mace_of_smiting',
    'Mace of Smiting',
    3500,
    'A magic mace: +1 to attack and damage (+3 against Constructs); a natural 20 deals an extra 7 Bludgeoning damage (14 against Constructs). (Rare.)',
    {
      magicBonus: 1,
      magicRiders: [
        { label: 'Smiting', dice: '2', vsCreatureTypes: ['construct'] },
        { label: 'Smiting (20)', dice: '7', onCrit: true },
        { label: 'Smiting (20)', dice: '7', onCrit: true, vsCreatureTypes: ['construct'] },
      ],
    }
  ),
  // SRD Sun Blade (Rare, attunement) — a +2 finesse Longsword of Radiant
  // damage; +1d8 Radiant vs Undead; sheds sunlight.
  namedMagic(
    'longsword',
    'sun_blade',
    'Sun Blade',
    3500,
    'A hilt that sprouts a blade of radiance: a +2 Longsword with Finesse that deals Radiant damage, +1d8 Radiant against Undead, and sheds bright light. (Rare; requires attunement.)',
    {
      requiresAttunement: true,
      magicBonus: 2,
      finesse: true,
      damageType: 'radiant',
      wornEffects: [{ kind: 'light', radiusFt: 15 }],
      magicRiders: [
        { label: 'Sun Blade', dice: '1d8', damageType: 'radiant', vsCreatureTypes: ['undead'] },
      ],
    }
  ),
  // SRD Thunderous Greatclub (Very Rare, attunement) — Strength 20; +1d8
  // Thunder on a hit. Simplification: Clap of Thunder / Earthquake not modeled.
  namedMagic(
    'greatclub',
    'thunderous_greatclub',
    'Thunderous Greatclub',
    15000,
    'A magic greatclub: while attuned, your Strength is 20, and every hit deals an extra 1d8 Thunder damage. (Very Rare; requires attunement.)',
    {
      requiresAttunement: true,
      wornEffects: [{ kind: 'set_ability', ability: 'str', value: 20 }],
      magicRiders: [{ label: 'Thunderous', dice: '1d8', damageType: 'thunder' }],
    }
  ),
  // SRD Dwarven Thrower (Very Rare, attunement) — +3 Warhammer, Thrown 20/60;
  // a ranged hit adds 1d8 Force (2d8 vs Giants).
  namedMagic(
    'warhammer',
    'dwarven_thrower',
    'Dwarven Thrower',
    15000,
    'A +3 magic warhammer that can be thrown (20/60 ft) and returns to your hand; a thrown hit deals an extra 1d8 Force damage (2d8 against Giants). (Very Rare; requires attunement.)',
    {
      requiresAttunement: true,
      magicBonus: 3,
      thrown: { normalRange: 20, longRange: 60 },
      magicRiders: [
        { label: 'Dwarven Thrower', dice: '1d8', damageType: 'force', rangedOnly: true },
        {
          label: 'Dwarven Thrower (Giant)',
          dice: '1d8',
          damageType: 'force',
          rangedOnly: true,
          vsCreatureTypes: ['giant'],
        },
      ],
    }
  ),

  // ── Named magic armor and shields (SRD 5.2.1) ─────────────────────────────
  // SRD Armor of Resistance (Rare, attunement) — Resistance to one type.
  ...['studded_leather', 'half_plate', 'plate_armor'].flatMap((b) =>
    RESIST_TYPES.map((t) =>
      namedMagic(
        b,
        `${b}_of_${t}_resistance`,
        `${BASE_ITEMS[b].name} of ${cap(t)} Resistance`,
        3500,
        `${BASE_ITEMS[b].desc} Magic armor: while worn and attuned, you have Resistance to ${cap(t)} damage. (Rare; requires attunement.)`,
        { requiresAttunement: true, wornEffects: [{ kind: 'resistance', damageType: t }] }
      )
    )
  ),
  // SRD Armor of Invulnerability (Legendary, attunement) — Resistance to
  // Bludgeoning, Piercing and Slashing. Simplification: Metal Shell not modeled.
  namedMagic(
    'plate_armor',
    'armor_of_invulnerability',
    'Armor of Invulnerability',
    50000,
    'Magic plate: while worn and attuned, you have Resistance to Bludgeoning, Piercing, and Slashing damage. (Legendary; requires attunement.)',
    {
      requiresAttunement: true,
      wornEffects: [
        { kind: 'resistance', damageType: 'bludgeoning' },
        { kind: 'resistance', damageType: 'piercing' },
        { kind: 'resistance', damageType: 'slashing' },
      ],
    }
  ),
  // SRD Dragon Scale Mail (Very Rare, attunement) — +1 AC and Resistance to the
  // dragon's damage type. Simplification: Advantage vs breath weapons and the
  // dragon-sensing property aren't modeled.
  ...Object.entries(DRAGON_SCALES).map(([color, t]) =>
    namedMagic(
      'scale_mail',
      `dragon_scale_mail_${color}`,
      `${cap(color)} Dragon Scale Mail`,
      15000,
      `Scale mail of ${color} dragon scales: +1 AC and, while attuned, Resistance to ${cap(t)} damage. (Very Rare; requires attunement.)`,
      {
        requiresAttunement: true,
        magicBonus: 1,
        wornEffects: [{ kind: 'resistance', damageType: t }],
      }
    )
  ),
  // SRD Dwarven Plate (Very Rare) — +2 AC. Simplification: the push reduction
  // isn't modeled.
  ...named(['plate_armor', 'half_plate'], (b) =>
    namedMagic(
      b.id,
      `dwarven_${b.id}`,
      `Dwarven ${b.name}`,
      15000,
      `${b.desc} Dwarven-forged magic armor: +2 bonus to Armor Class. (Very Rare.)`,
      { magicBonus: 2 }
    )
  ),
  // SRD Elven Chain (Rare) — +1 AC, wearable without armor training.
  ...named(['chain_shirt', 'chain_mail'], (b) =>
    namedMagic(
      b.id,
      `elven_${b.id}`,
      `Elven ${b.name}`,
      3500,
      `${b.desc} Elven magic mail: +1 bonus to Armor Class, and you can wear it without armor training. (Rare.)`,
      { magicBonus: 1, noArmorTrainingNeeded: true }
    )
  ),
  // SRD Glamoured Studded Leather (Rare) — +1 AC. Simplification: the
  // appearance-changing illusion is narrative.
  namedMagic(
    'studded_leather',
    'glamoured_studded_leather',
    'Glamoured Studded Leather',
    3500,
    'Magic studded leather: +1 bonus to Armor Class, and it can look like any clothing you choose. (Rare.)',
    { magicBonus: 1 }
  ),
  // SRD Arrow-Catching Shield (Rare, attunement) — +2 AC against ranged
  // attacks. Simplification: redirecting attacks at adjacent allies isn't modeled.
  namedMagic(
    'shield',
    'arrow_catching_shield',
    'Arrow-Catching Shield',
    3500,
    'A magic shield: +2 AC against ranged attacks, on top of its normal +2. (Rare; requires attunement.)',
    { requiresAttunement: true, wornEffects: [{ kind: 'ranged_ac_bonus', bonus: 2 }] }
  ),
  // SRD Spellguard Shield (Very Rare, attunement) — Advantage on saves against
  // spells; spell attacks against you have Disadvantage.
  namedMagic(
    'shield',
    'spellguard_shield',
    'Spellguard Shield',
    15000,
    'A magic shield: Advantage on saving throws against spells, and spell attack rolls against you have Disadvantage. (Very Rare; requires attunement.)',
    {
      requiresAttunement: true,
      wornEffects: [{ kind: 'spell_save_advantage' }, { kind: 'spell_attack_disadvantage' }],
    }
  ),
  // SRD Shield of the Cavalier (Very Rare, attunement) — +2 AC on top of the
  // Shield's. Simplification: Forceful Bash / Protective Field not modeled.
  namedMagic(
    'shield',
    'shield_of_the_cavalier',
    'Shield of the Cavalier',
    15000,
    'A magic shield: +2 AC on top of its normal +2. (Very Rare; requires attunement.)',
    { requiresAttunement: true, magicBonus: 2 }
  ),
  ...POTIONS,
  ...WANDS,
  ...STAFFS,
  ...SPELL_SCROLLS,
  ...ACTIVATED_WEAPONS,
  ...ACTIVATED_ARMOR,
  ...SLAYING_AMMO,
  ...CURSED_ITEMS,
  ...WONDROUS_2,
  ...WONDROUS_3,
  ...WONDROUS_4,
  ...SUMMONING_ITEMS,
  ...UTILITY_ITEMS,
  ...UNIQUE_ITEMS,
  ...RANDOM_ITEMS,
]);

export const SRD_ITEMS: Record<string, LootItem> = { ...BASE_ITEMS, ...MAGIC_ITEMS };

/** Every SRD item id, for contexts that want the full catalog. */
export const ALL_SRD_ITEM_IDS: string[] = Object.keys(SRD_ITEMS);

/**
 * Select canonical SRD items by id for a context's `lootTable`. This is how a
 * campaign limits which SRD equipment is available — it lists only the ids it
 * wants. Throws on an unknown id so a typo (or a since-removed item) fails
 * loudly at load time instead of silently dropping gear.
 */
export function srdItems(...ids: string[]): LootItem[] {
  return ids.map((id) => {
    const item = SRD_ITEMS[id];
    if (!item) {
      throw new Error(
        `srdItems: unknown SRD item id "${id}". Known ids: ${ALL_SRD_ITEM_IDS.join(', ')}`
      );
    }
    return item;
  });
}
