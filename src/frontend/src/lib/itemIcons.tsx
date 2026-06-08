import { type IconableItem, type ItemIconId, iconForItem } from '../types';
import GameIcon from '../components/GameIcon';

// ─── Item icon art registry ──────────────────────────────────────────────────
//
// Each visual bucket (see ITEM_ICONS / iconForItem in shared types) renders
// either a painted PNG (a purchased icon set) or a game-icons glyph as a
// swappable placeholder until painted art covers it. Resolution is
// centralized here: an item → its bucket (override-aware) → this entry → a
// node. Swapping a bucket from glyph to PNG (or vice versa) is one line.
//
// Painted (David Baumgart, "Medieval Arms & Armor" — weapons / armor / ammo):
//   /art/icons/<bucket>.png. Glyph buckets (consumables, light, tools, gear,
//   holy, sling, firearm, misc) await a matching set — the glyph names are
//   verified against the vendored game-icons font.
type IconArt = { png: string } | { glyph: string };

const ITEM_ICON_ART: Record<ItemIconId, IconArt> = {
  // Painted — the Medieval Arms & Armor set.
  blade: { png: '/art/icons/blade.png' },
  axe: { png: '/art/icons/axe.png' },
  dagger: { png: '/art/icons/dagger.png' },
  blunt: { png: '/art/icons/blunt.png' },
  polearm: { png: '/art/icons/polearm.png' },
  bow: { png: '/art/icons/bow.png' },
  crossbow: { png: '/art/icons/crossbow.png' },
  armor: { png: '/art/icons/armor.png' },
  shield: { png: '/art/icons/shield.png' },
  ammo: { png: '/art/icons/ammo.png' },
  // Glyph placeholders — buckets the weapons/armor set doesn't cover.
  sling: { glyph: 'slingshot' },
  firearm: { glyph: 'pistol-gun' },
  potion: { glyph: 'potion-ball' },
  flask: { glyph: 'round-bottom-flask' },
  food: { glyph: 'ham-shank' },
  light: { glyph: 'torch' },
  tools: { glyph: 'toolbox' },
  gear: { glyph: 'knapsack' },
  holy: { glyph: 'prayer-beads' },
  misc: { glyph: 'swap-bag' },
};

/** Which buckets currently render painted art (the rest are glyph placeholders). */
export const PAINTED_ICON_BUCKETS = (Object.keys(ITEM_ICON_ART) as ItemIconId[]).filter(
  (id) => 'png' in ITEM_ICON_ART[id]
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
  if ('png' in art) {
    return (
      <img
        src={art.png}
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
