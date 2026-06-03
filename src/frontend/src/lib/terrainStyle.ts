import type { TerrainType } from '../types';

// Shared visual language for typed terrain across both grid views (the overland
// GridMapView and the combat GridCombatView): a composited tint per type, plus a
// glyph for the impassable types that the overland map labels at a glance.
// PURELY VISUAL — mechanics live in the shared TERRAIN spec (overland) and the
// room's mechanical arrays (combat); this module paints, it never decides rules.
export const TERRAIN_STYLE: Record<TerrainType, { tint?: string; glyph?: string }> = {
  plains: { tint: 'rgba(208, 188, 146, 0.26)' }, // light tan ground

  road: { tint: 'rgba(198, 166, 104, 0.32)' },
  forest: { tint: 'rgba(70, 130, 70, 0.32)' },
  hills: { tint: 'rgba(150, 128, 86, 0.32)' },
  swamp: { tint: 'rgba(96, 112, 72, 0.4)' },
  snow: { tint: 'rgba(224, 234, 246, 0.55)' }, // pale icy white
  water: { tint: 'rgba(70, 110, 185, 0.45)', glyph: '≈' },
  mountain: { tint: 'rgba(95, 88, 70, 0.88)', glyph: '▲' },

  // Town cosmetics — settlement-map flavor.
  cobblestone: { tint: 'rgba(150, 140, 120, 0.34)' }, // grey-tan paving
  garden: { tint: 'rgba(90, 140, 80, 0.34)' }, // tended greenery
  town_wall: { tint: 'rgba(110, 100, 86, 0.9)', glyph: '▦' }, // impassable masonry
};
