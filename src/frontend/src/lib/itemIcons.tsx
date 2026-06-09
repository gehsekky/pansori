import { type IconableItem, type ItemIconId, iconForItem } from '../types';
import { artUrl, paintedArt } from './art';
import GameIcon from '../components/GameIcon';

// ─── Item icon art registry ──────────────────────────────────────────────────
//
// Each visual bucket (see ITEM_ICONS / iconForItem in shared types) carries a
// game-icons `glyph` (the free tier — redistributable font) and optionally a
// painted `png` (a licensed icon set). The painted PNG renders only in the
// painted tier (VITE_PAINTED_ART); otherwise the glyph does. Resolution is
// centralized here: an item → its bucket (override-aware) → this entry → a node.
//
// Two painted sets cover the catalog:
//   - Weapons / armor / ammo: David Baumgart, "Medieval Arms & Armor".
//   - Consumables + gear buckets: Vivid Motion, "Animated RPG Icons Ultimate
//     Kit" (the static single-frame variants) — fills the buckets the arms set
//     doesn't (potion, flask, food, light, tools, gear, holy, sling, misc).
// Both live at /art/icons/<bucket>.png (128x128 RGBA). `firearm` has no painted
// art in either set (SRD 5.2.1 core carries no firearms) — glyph only.
type IconArt = { glyph: string; png?: string };

const ITEM_ICON_ART: Record<ItemIconId, IconArt> = {
  // Painted — the Medieval Arms & Armor set (+ glyph fallback).
  blade: { glyph: 'broadsword', png: '/art/icons/blade.png' },
  axe: { glyph: 'battle-axe', png: '/art/icons/axe.png' },
  dagger: { glyph: 'plain-dagger', png: '/art/icons/dagger.png' },
  blunt: { glyph: 'flanged-mace', png: '/art/icons/blunt.png' },
  polearm: { glyph: 'halberd', png: '/art/icons/polearm.png' },
  bow: { glyph: 'pocket-bow', png: '/art/icons/bow.png' },
  crossbow: { glyph: 'crossbow', png: '/art/icons/crossbow.png' },
  armor: { glyph: 'breastplate', png: '/art/icons/armor.png' },
  shield: { glyph: 'round-shield', png: '/art/icons/shield.png' },
  ammo: { glyph: 'arrows', png: '/art/icons/ammo.png' },
  // Painted — the Vivid Motion kit (static variants) (+ glyph fallback).
  sling: { glyph: 'slingshot', png: '/art/icons/sling.png' },
  potion: { glyph: 'potion-ball', png: '/art/icons/potion.png' },
  flask: { glyph: 'round-bottom-flask', png: '/art/icons/flask.png' },
  food: { glyph: 'meat', png: '/art/icons/food.png' },
  light: { glyph: 'torch', png: '/art/icons/light.png' },
  tools: { glyph: 'hammer-nails', png: '/art/icons/tools.png' },
  gear: { glyph: 'backpack', png: '/art/icons/gear.png' },
  holy: { glyph: 'holy-symbol', png: '/art/icons/holy.png' },
  misc: { glyph: 'swap-bag', png: '/art/icons/misc.png' },
  // Glyph only — no painted gun in either set.
  firearm: { glyph: 'pistol-gun' },
};

/** Which buckets carry painted art (a glyph fallback always exists too). */
export const PAINTED_ICON_BUCKETS = (Object.keys(ITEM_ICON_ART) as ItemIconId[]).filter(
  (id) => ITEM_ICON_ART[id].png !== undefined
);

/**
 * The inventory icon for an item — its override-aware bucket rendered as a
 * painted PNG or a game-icons glyph. `size` is the px box (default 24).
 */
export function ItemIcon({
  item,
  size = 24,
  className,
}: {
  item: IconableItem;
  size?: number;
  className?: string;
}) {
  const art = ITEM_ICON_ART[iconForItem(item)];
  if (art.png && paintedArt()) {
    return (
      <img
        src={artUrl(art.png)}
        alt=""
        aria-hidden="true"
        width={size}
        height={size}
        draggable={false}
        className={className}
        style={{ display: 'inline-block', verticalAlign: 'middle', objectFit: 'contain' }}
      />
    );
  }
  return (
    <GameIcon
      name={art.glyph}
      aria-label=""
      className={className}
      style={{ fontSize: `${size}px`, verticalAlign: 'middle' }}
    />
  );
}
