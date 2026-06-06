import type { ActiveGrid, GameState, GridPos, MapLevel, Seed } from '../types.js';
import Dialog from './Dialog.tsx';
import GridMapView from './GridMapView.tsx';
import { activeGrid } from '../lib/activeGrid.ts';
import styles from '../styles.module.css';
import { useState } from 'react';

interface Props {
  seed: Seed;
  state: GameState;
  onClose: () => void;
}

// The levels the party can view, from where they stand UP to the region — i.e.
// the zoom-out chain. In a local room you can step out to the town (if you're
// inside one) and then the region; in a town, out to the region. Each entry
// carries the marker cell to highlight on that level (the parent-grid bookmarks
// set on descent), falling back to the grid's start.
function zoomChain(st: GameState): { level: MapLevel; markerPos?: GridPos }[] {
  if (!st.map_level) return [];
  if (st.map_level === 'local') {
    const chain: { level: MapLevel; markerPos?: GridPos }[] = [
      { level: 'local', markerPos: st.marker_pos },
    ];
    if (st.current_town_id) chain.push({ level: 'town', markerPos: st.town_marker_pos });
    chain.push({ level: 'regional', markerPos: st.region_marker_pos });
    return chain;
  }
  if (st.map_level === 'town') {
    return [
      { level: 'town', markerPos: st.marker_pos },
      { level: 'regional', markerPos: st.region_marker_pos },
    ];
  }
  return [{ level: 'regional', markerPos: st.marker_pos }];
}

// Resolve the grid for an arbitrary level by feeding `activeGrid` a state pinned
// to that level (clearing the room when above local, dropping the town when at
// the region) — so we can render a parent map the party isn't standing on.
function gridForLevel(seed: Seed, st: GameState, level: MapLevel): ActiveGrid | null {
  return activeGrid(seed, {
    ...st,
    map_level: level,
    current_room: level === 'local' ? st.current_room : '',
    current_town_id: level === 'regional' ? undefined : st.current_town_id,
  });
}

/**
 * The map overlay. The inline view always shows the grid the party stands on;
 * this overlay adds ZOOM-OUT — step from a local room up to its town and then
 * the region (read-only), so you can see where you are in the wider vale
 * mid-dungeon. Falls back to a note in a transient area with no resolvable grid
 * (e.g. a wilderness encounter).
 */
export default function WorldMap({ seed, state, onClose }: Props) {
  const chain = zoomChain(state);
  const [idx, setIdx] = useState(0);
  const entry = chain[idx];
  const grid = entry ? gridForLevel(seed, state, entry.level) : null;
  const markerPos = entry?.markerPos ?? grid?.startPos;
  const canZoomOut = idx < chain.length - 1;
  const canZoomIn = idx > 0;

  return (
    <Dialog
      title={`MAP — ${(seed.world_name || seed.ship_name || '').toUpperCase()}`}
      onClose={onClose}
      testId="world-map"
    >
      {chain.length === 0 ? (
        <p className={styles.mapEmptyNote}>
          No map to show here — you&apos;re in the thick of it. The map returns once you&apos;re
          back on open ground.
        </p>
      ) : (
        <div className={styles.mapZoomWrap}>
          {/* Zoom controls stay available even when THIS level has no grid (a
              transient encounter room) — so you can still step out to the region. */}
          {chain.length > 1 && (
            <div className={styles.mapZoomControls}>
              <button
                type="button"
                className={styles.mapZoomBtn}
                onClick={() => setIdx((i) => i - 1)}
                disabled={!canZoomIn}
                data-testid="map-zoom-in"
              >
                ＋ Zoom in
              </button>
              <button
                type="button"
                className={styles.mapZoomBtn}
                onClick={() => setIdx((i) => i + 1)}
                disabled={!canZoomOut}
                data-testid="map-zoom-out"
              >
                Zoom out －
              </button>
            </div>
          )}
          {grid && markerPos ? (
            // Read-only (no onMarkerMove) — this is an overview, not a control.
            <GridMapView grid={grid} markerPos={markerPos} terrainArt={seed.terrain_art} />
          ) : (
            <p className={styles.mapEmptyNote}>
              No map to show for this level — zoom out to find your bearings.
            </p>
          )}
        </div>
      )}
    </Dialog>
  );
}
