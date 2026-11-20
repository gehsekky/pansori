import type { ItemCharges, ItemSpell, LootItem, WornEffect } from '../../types.js';
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
