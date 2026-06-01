import type { ActiveGrid, GridPos, MapTransition } from '../types';
import styles from '../styles.module.css';

const CELL_PX = 32;

// Checkerboard tint for the "dark" squares — a low-alpha grey overlay
// composited over `--t-bg` (works on any theme). Layered via a flat gradient
// because a bare rgba() would blend with the board's gridline colour instead.
const CHECKER_TINT = 'linear-gradient(rgba(127, 127, 127, 0.16), rgba(127, 127, 127, 0.16))';

interface Props {
  grid: ActiveGrid;
  markerPos: GridPos;
  // A hostile is present in the current location but combat hasn't started.
  // Out of combat an enemy has no real grid position, so we surface a SINGLE
  // red marker near the party (mirroring the single party marker) — otherwise
  // an "Attack" option appears with nothing on the map to explain it.
  enemyPresent?: boolean;
  // Click-to-move: the parent dispatches a single `marker_move` action for the
  // clicked cell. The backend free-pathfinds out of combat (no movement budget)
  // and resolves any transition (site / venue / room exit / ascend) on arrival.
  onMarkerMove?: (to: GridPos) => void;
}

const LEVEL_LABEL: Record<ActiveGrid['level'], string> = {
  regional: 'REGION',
  town: 'TOWN',
  local: 'LOCAL',
};

// A short glyph per transition kind so the cell reads at a glance; the full
// label rides in the title / aria-label.
const TRANSITION_GLYPH: Record<MapTransition['kind'], string> = {
  site: '◈', // a place on the regional map (town or local site)
  venue: '⌂', // a building interior in a town
  room_exit: '⇲', // a passage to another local room
  ascend: '⤴', // leave the site / town back up a level
};

// Out of combat an enemy carries no grid position (positions are assigned only
// when combat deploys tokens). Pick a single cell near the party for the red
// "enemy here" marker: the first valid cell from a ring around the party
// (in-bounds, not the party, not an obstacle/transition), falling back to any
// in-bounds non-party cell on a cramped grid.
function nearbyEnemyCell(
  grid: ActiveGrid,
  marker: GridPos,
  obstacles: Set<string>,
  transitions: Map<string, MapTransition>
): GridPos {
  const ring = [
    { x: 2, y: 0 },
    { x: 0, y: 2 },
    { x: -2, y: 0 },
    { x: 0, y: -2 },
    { x: 1, y: 1 },
    { x: -1, y: 1 },
    { x: 1, y: -1 },
    { x: -1, y: -1 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
    { x: 0, y: -1 },
  ];
  for (const d of ring) {
    const x = marker.x + d.x;
    const y = marker.y + d.y;
    if (x < 0 || y < 0 || x >= grid.width || y >= grid.height) continue;
    const k = `${x},${y}`;
    if (obstacles.has(k) || transitions.has(k)) continue;
    return { x, y };
  }
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      if (x !== marker.x || y !== marker.y) return { x, y };
    }
  }
  return marker; // degenerate 1×1 grid
}

function scaleLabel(feetPerSquare: number): string {
  if (feetPerSquare % 5280 === 0) {
    const mi = feetPerSquare / 5280;
    return `${mi} mi/square`;
  }
  return `${feetPerSquare} ft/square`;
}

/**
 * The out-of-combat exploration view for the 3-level grid map. Renders the
 * active grid (regional / town / local) with the party as a SINGLE marker,
 * transition cells (sites / venues / room exits / ascents) the player can click
 * to travel to, and obstacles. (Local combat switches to GridCombatView, which
 * deploys the party into PC tokens.)
 */
function GridMapView({ grid, markerPos, enemyPresent, onMarkerMove }: Props) {
  const obstacleSet = new Set(grid.obstacles.map((o) => `${o.x},${o.y}`));
  const transitionAt = new Map<string, MapTransition>();
  for (const t of grid.transitions) transitionAt.set(`${t.pos.x},${t.pos.y}`, t);

  // Single red enemy marker near the party when a hostile is present out of combat.
  const enemyCell = enemyPresent
    ? nearbyEnemyCell(grid, markerPos, obstacleSet, transitionAt)
    : null;

  const cells: React.ReactNode[] = [];
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const key = `${x},${y}`;
      const isMarker = markerPos.x === x && markerPos.y === y;
      const isEnemyMarker = !!enemyCell && enemyCell.x === x && enemyCell.y === y && !isMarker;
      const isObstacle = obstacleSet.has(key);
      const transition = transitionAt.get(key);
      // Out of combat the party moves freely (the backend pathfinds), so every
      // non-obstacle cell that isn't the marker's own square is a valid target.
      const clickable = !isObstacle && !isMarker && !!onMarkerMove;

      // Checkerboard the plain cells so the grid squares read clearly on the
      // large, sparse region/town maps — a single flat fill was
      // indistinguishable from the 1px gridlines. Obstacle / transition cells
      // keep their own tint (they already stand out + carry a glyph). The tint
      // is a theme-agnostic grey overlay composited over the page background,
      // so it works on light and dark themes alike.
      const dark = (x + y) % 2 === 1;
      let cellBg = dark ? `${CHECKER_TINT}, var(--t-bg)` : 'var(--t-bg)';
      if (isObstacle) cellBg = 'rgba(90, 85, 70, 0.7)';
      else if (transition) cellBg = 'rgba(150, 120, 60, 0.35)';

      const ariaParts: string[] = [`${x},${y}`];
      if (isMarker) ariaParts.push('the party');
      if (isEnemyMarker) ariaParts.push('an enemy');
      if (isObstacle) ariaParts.push('impassable');
      if (transition) ariaParts.push(transition.label);

      let token: React.ReactNode = null;
      if (isMarker) {
        token = (
          <span className={styles.gridToken} style={{ background: 'rgba(70, 140, 220, 0.9)' }}>
            <span className={styles.gridTokenLetter}>@</span>
          </span>
        );
      } else if (isEnemyMarker) {
        token = (
          <span className={styles.gridToken} style={{ background: 'rgba(220, 70, 70, 0.9)' }}>
            <span className={styles.gridTokenLetter}>!</span>
          </span>
        );
      } else if (transition) {
        token = (
          <span className={styles.gridMapGlyph} aria-hidden="true">
            {TRANSITION_GLYPH[transition.kind]}
          </span>
        );
      }

      cells.push(
        <div
          key={key}
          className={
            clickable ? `${styles.gridCell} ${styles.gridMapCellClickable}` : styles.gridCell
          }
          style={{ background: cellBg, cursor: clickable ? 'pointer' : 'default' }}
          aria-label={ariaParts.join(', ')}
          aria-current={isMarker ? 'location' : undefined}
          role={clickable ? 'button' : 'gridcell'}
          tabIndex={clickable ? 0 : undefined}
          title={transition ? transition.label : undefined}
          onClick={clickable ? () => onMarkerMove?.({ x, y }) : undefined}
          onKeyDown={
            clickable
              ? (e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onMarkerMove?.({ x, y });
                  }
                }
              : undefined
          }
        >
          {token}
        </div>
      );
    }
  }

  return (
    <div className={styles.gridCombatCard}>
      <div className={styles.gridHeader}>
        <span className={styles.gridHeaderLabel}>
          {LEVEL_LABEL[grid.level]} · {grid.name}
        </span>
        <span className={styles.gridHeaderInfo}>
          {grid.width}×{grid.height} · {scaleLabel(grid.feetPerSquare)}
        </span>
      </div>
      <div className={styles.gridBoardWrap}>
        <div
          className={styles.gridBoard}
          style={{
            gridTemplateColumns: `repeat(${grid.width}, ${CELL_PX}px)`,
            gridTemplateRows: `repeat(${grid.height}, ${CELL_PX}px)`,
          }}
        >
          {cells}
        </div>
      </div>
      <div className={styles.gridLegend}>
        <span>
          <span className={styles.gridLegendPC} /> party
        </span>
        {enemyCell && (
          <span>
            <span className={styles.gridLegendEnemy} /> enemy
          </span>
        )}
        {grid.transitions.length > 0 && (
          <span>
            <span className={styles.gridLegendTransition} /> travel point (click to go)
          </span>
        )}
        {grid.obstacles.length > 0 && (
          <span>
            <span className={styles.gridLegendObstacle} /> impassable
          </span>
        )}
      </div>
    </div>
  );
}

export default GridMapView;
