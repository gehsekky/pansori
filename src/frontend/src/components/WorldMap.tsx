import type { GameState, Seed } from '../types.js';
import Dialog from './Dialog.tsx';
import GridMapView from './GridMapView.tsx';
import { activeGrid } from '../lib/activeGrid.ts';
import styles from '../styles.module.css';

interface Props {
  seed: Seed;
  state: GameState;
  onClose: () => void;
}

/**
 * The map overlay. On the 3-level grid model it shows the grid the party is
 * currently on (region / town / local) read-only — a quick "where am I" check
 * that's handy mid-dungeon, when the inline exploration grid is replaced by the
 * combat view. Falls back to a note in a transient area with no resolvable grid
 * (e.g. a wilderness encounter).
 */
export default function WorldMap({ seed, state, onClose }: Props) {
  const grid = activeGrid(seed, state);
  return (
    <Dialog
      title={`MAP — ${(seed.world_name || seed.ship_name || '').toUpperCase()}`}
      onClose={onClose}
      testId="world-map"
    >
      {grid && state.marker_pos ? (
        // Read-only (no onMarkerMove) — this is an overview, not a control.
        <GridMapView grid={grid} markerPos={state.marker_pos} />
      ) : (
        <p className={styles.mapEmptyNote}>
          No map to show here — you&apos;re in the thick of it. The map returns once you&apos;re
          back on open ground.
        </p>
      )}
    </Dialog>
  );
}
