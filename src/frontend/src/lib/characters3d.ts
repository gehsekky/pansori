// CC0 character models (KayKit Adventurers + Skeletons, committed under
// public/art/models3d — see LEGAL.md; animations stripped to a 7-clip set and
// mesh-quantized, ~0.45MB each). Pure mapping layer: which model stands in for
// a PC class, an authored NPC, or an enemy by name. The renderers (world screen
// + combat diorama) consume these; beasts and other non-humanoids return null
// and keep their primitive tokens until animal models land.

import { artUrl } from './art';

export const CHAR_MODEL = {
  knight: artUrl('/art/models3d/knight.glb'),
  mage: artUrl('/art/models3d/mage.glb'),
  rogue: artUrl('/art/models3d/rogue.glb'),
  rogueHooded: artUrl('/art/models3d/rogue_hooded.glb'),
  barbarian: artUrl('/art/models3d/barbarian.glb'),
  skeletonWarrior: artUrl('/art/models3d/skeleton_warrior.glb'),
  skeletonMinion: artUrl('/art/models3d/skeleton_minion.glb'),
  skeletonMage: artUrl('/art/models3d/skeleton_mage.glb'),
  skeletonRogue: artUrl('/art/models3d/skeleton_rogue.glb'),
};

/** PC class → adventurer model. */
export function modelForClass(cls: string | undefined): string {
  switch ((cls ?? '').toLowerCase()) {
    case 'fighter':
    case 'paladin':
    case 'cleric':
      return CHAR_MODEL.knight;
    case 'barbarian':
    case 'monk':
      return CHAR_MODEL.barbarian;
    case 'rogue':
    case 'ranger':
      return CHAR_MODEL.rogue;
    case 'wizard':
    case 'sorcerer':
    case 'warlock':
    case 'druid':
    case 'bard':
      return CHAR_MODEL.mage;
    default:
      return CHAR_MODEL.knight;
  }
}

/** Authored NPC icon (game-icons name) → model. Defaults to a plain rogue
 * (reads most like a commoner of the set). */
export function modelForNpcIcon(icon: string | undefined): string {
  const i = (icon ?? '').toLowerCase();
  if (/knight|helmet|orc|warrior|sword|guard/.test(i)) return CHAR_MODEL.knight;
  if (/hood|cowl|cloak|spy|thief/.test(i)) return CHAR_MODEL.rogueHooded;
  if (/blindfold|wizard|mage|robe|crystal|magic/.test(i)) return CHAR_MODEL.mage;
  if (/barbarian|axe/.test(i)) return CHAR_MODEL.barbarian;
  return CHAR_MODEL.rogue;
}

/**
 * Enemy display name → model, or null for non-humanoids (beasts, oozes,
 * swarms, constructs…) which keep the primitive token. Keyword-matched the
 * same way the 2D grid picks enemy glyphs — first match wins.
 */
export function modelForEnemyName(name: string | undefined): string | null {
  const n = (name ?? '').toLowerCase();
  if (!n) return null;
  // Undead (the marsh's risen dead read perfectly as skeletons).
  if (/skeleton/.test(n)) return CHAR_MODEL.skeletonWarrior;
  if (/lich|necromancer|crypt lord/.test(n)) return CHAR_MODEL.skeletonMage;
  if (/ghoul|ghast|zombie|wight|peat|risen|corpse/.test(n)) return CHAR_MODEL.skeletonMinion;
  if (/wraith|specter|spectre|shadow|ghost/.test(n)) return CHAR_MODEL.skeletonRogue;
  // Living humanoids by role.
  if (/archmage|magus|mage|wizard|sorcer|warlock|acolyte|adept|cult/.test(n))
    return CHAR_MODEL.mage;
  if (/rogue|scout|thief|assassin|spy|smuggler/.test(n)) return CHAR_MODEL.rogueHooded;
  if (/berserk|barbarian|savage/.test(n)) return CHAR_MODEL.barbarian;
  if (
    /trooper|veteran|guard|knight|vanguard|soldier|bandit|warrior|captain|pirate|mercenary/.test(n)
  )
    return CHAR_MODEL.knight;
  return null;
}
