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
// Two painted sets cover the catalog:
//   - Weapons / armor / ammo: David Baumgart, "Medieval Arms & Armor".
//   - Consumables + gear buckets: Vivid Motion, "Animated RPG Icons Ultimate
//     Kit" (the static single-frame variants) — fills the buckets the arms set
//     doesn't (potion, flask, food, light, tools, gear, holy, sling, misc).
// Both live at /art/icons/<bucket>.png (128x128 RGBA). The only remaining glyph
// is `firearm` — neither set has a gun and SRD 5.2.1 core carries no firearms.
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
  // Painted — the Vivid Motion kit (static variants).
  sling: { png: '/art/icons/sling.png' },
  potion: { png: '/art/icons/potion.png' },
  flask: { png: '/art/icons/flask.png' },
  food: { png: '/art/icons/food.png' },
  light: { png: '/art/icons/light.png' },
  tools: { png: '/art/icons/tools.png' },
  gear: { png: '/art/icons/gear.png' },
  holy: { png: '/art/icons/holy.png' },
  misc: { png: '/art/icons/misc.png' },
  // Glyph placeholder — no painted gun in either set (SRD core has no firearms).
  firearm: { glyph: 'pistol-gun' },
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
