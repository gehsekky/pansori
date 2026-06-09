// ─── Painted-art tier + URL resolver ─────────────────────────────────────────
//
// pansori ships a free GLYPH/COLOR tier (game-icons font + terrain tints — all
// redistributable) and an optional PAINTED tier (the licensed raster packs under
// /art/{tiles,markers,icons,sprites}). The painted packs live in a separate
// overlay; a public clone has none, so the build must render without them.
//
// `VITE_PAINTED_ART=1` turns the painted tier on (the dev box + production have
// the assets). Unset/empty ⇒ free tier: callers render the glyph/tint fallback
// instead of the painted PNGs. `VITE_ASSET_BASE_URL` optionally prefixes painted
// URLs (e.g. a CDN); default is same-origin `/art`.
//
// Both are read AT CALL TIME so tests can flip them per-case with vi.stubEnv.
// FLOORS (CC0) and per-campaign room art are NOT gated — they stay painted.

export function paintedArt(): boolean {
  const v = import.meta.env.VITE_PAINTED_ART;
  return v === '1' || v === 'true';
}

/** Prefix a `/art/...` path with the optional asset base (CDN). */
export function artUrl(path: string): string {
  const base = (import.meta.env.VITE_ASSET_BASE_URL ?? '').replace(/\/+$/, '');
  return `${base}${path}`;
}

// ─── Glyph fallbacks for the painted MAP art (game-icons names) ───────────────

// Site/location marker family id → a game-icons glyph (verified present in the
// vendored font). Unknown families fall back to the generic site glyph.
export const MARKER_GLYPH: Record<string, string> = {
  village: 'village',
  hamlet: 'village',
  village_dirt: 'village',
  castle: 'castle',
  castle_ruins: 'castle',
  stronghold: 'defensive-wall',
  mine: 'mining',
  monastery: 'church',
  tower: 'tower',
  dark_tower: 'wizard-staff',
  house: 'house',
  barrow: 'tombstone',
};
export const DEFAULT_MARKER_GLYPH = 'dungeon-gate';
export const TOWN_GLYPH = 'village';
/** Party marker + NPC token glyphs for the free tier (the sprite-art fallback). */
export const PARTY_GLYPH = 'person';
export const NPC_GLYPH = 'person';

/** A glyph for a marker family id (from a `tile:<id>` site or terrainArt town). */
export function markerGlyph(id: string | undefined): string {
  return (id && MARKER_GLYPH[id]) || DEFAULT_MARKER_GLYPH;
}
