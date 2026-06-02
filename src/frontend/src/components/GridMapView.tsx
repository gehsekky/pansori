import type { ActiveGrid, GridPos, MapTransition, TerrainType } from '../types';
import { TERRAIN } from '../types';
import { TERRAIN_STYLE } from '../lib/terrainStyle';
import styles from '../styles.module.css';

const CELL_PX = 32;

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
  site: '◈', // a local site / point of interest on the regional map (overridden for towns)
  venue: '⌂', // a building interior in a town
  room_exit: '⇲', // a passage to another local room
  ascend: '⤴', // leave the site / town back up a level
};

// A region "site" cell is either a town (carries `toTownId`) or a local point
// of interest (a ruin, road, grove). Towns read as a settlement (⌂), local
// sites as a place-marker (◈) — so the overland map distinguishes "a town you
// can enter" from "a spot something happens".
function transitionGlyph(t: MapTransition): string {
  if (t.kind === 'site') return t.toTownId ? '⌂' : '◈';
  return TRANSITION_GLYPH[t.kind];
}

// Destinations (towns, local sites, town venues) get an always-visible name
// caption; the dense room-to-room exits/ascents stay glyph-only (their labels
// ride in the tooltip) so local rooms don't get crowded.
const LABELLED_KINDS = new Set<MapTransition['kind']>(['site', 'venue']);

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
  // The overland (regional) map gets double-size squares so the larger, sparse
  // grid reads more like a map; town / local exploration stay compact.
  const cellPx = grid.level === 'regional' ? CELL_PX * 2 : CELL_PX;
  // Scale the cell glyphs up to match the larger regional squares; town / local
  // keep the CSS default (undefined ⇒ no inline override).
  const glyphFont = grid.level === 'regional' ? '2.7rem' : undefined;
  const obstacleSet = new Set(grid.obstacles.map((o) => `${o.x},${o.y}`));
  const transitionAt = new Map<string, MapTransition>();
  for (const t of grid.transitions) transitionAt.set(`${t.pos.x},${t.pos.y}`, t);
  // Typed terrain by cell key; absent ⇒ plains.
  const terrainAt = new Map<string, TerrainType>();
  for (const c of grid.terrain) terrainAt.set(`${c.pos.x},${c.pos.y}`, c.type);

  // Single red enemy marker near the party when a hostile is present out of combat.
  const enemyCell = enemyPresent
    ? nearbyEnemyCell(grid, markerPos, obstacleSet, transitionAt)
    : null;

  // Legend composition — only show swatches for things actually on this grid.
  const isRegionalGrid = grid.level === 'regional';
  const hasTown = grid.transitions.some((t) => t.kind === 'site' && t.toTownId);
  const hasLocalSite = grid.transitions.some((t) => t.kind === 'site' && !t.toTownId);
  const hasOtherTransition = grid.transitions.some((t) => t.kind !== 'site');
  // Unique terrain types present (excluding plains) for the legend.
  const presentTerrain = [...new Set(grid.terrain.map((c) => c.type))].filter(
    (t) => t !== 'plains'
  );
  // Untyped legacy obstacles still get a generic swatch (terrain-typed maps
  // surface their impassable cells via the terrain entries instead).
  const hasLegacyObstacle = grid.obstacles.length > 0 && grid.terrain.length === 0;

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
      const isRegional = grid.level === 'regional';
      const terrainType = terrainAt.get(key);
      const tStyle = terrainType ? TERRAIN_STYLE[terrainType] : undefined;
      // An unpainted cell on a terrain-bearing grid is plains (light tan). The
      // tints + the 1px gridlines separate squares, so no checkerboard needed.
      const plainsDefault = !terrainType && !isObstacle && grid.terrain.length > 0;
      const fillTint = tStyle?.tint ?? (plainsDefault ? TERRAIN_STYLE.plains.tint : undefined);
      let cellBg = fillTint
        ? `linear-gradient(${fillTint}, ${fillTint}), var(--t-bg)`
        : 'var(--t-bg)';
      if (transition) cellBg = 'rgba(150, 120, 60, 0.35)';
      else if (isObstacle && !tStyle?.tint)
        cellBg = isRegional ? 'rgba(95, 88, 70, 0.85)' : 'rgba(90, 85, 70, 0.7)';

      const ariaParts: string[] = [`${x},${y}`];
      if (isMarker) ariaParts.push('the party');
      if (isEnemyMarker) ariaParts.push('an enemy');
      if (terrainType) ariaParts.push(TERRAIN[terrainType].label);
      else if (isObstacle) ariaParts.push('impassable');
      if (transition) ariaParts.push(transition.label);

      // Hover tooltip: a destination shows its name; any other square shows its
      // terrain type so the player can read the map. Blank cells on a
      // terrain-bearing grid read as "plains"; grids with no authored terrain
      // (town / local) keep no tooltip on empty cells.
      const cellTitle = transition
        ? transition.label
        : terrainType
          ? TERRAIN[terrainType].label
          : isObstacle
            ? 'impassable'
            : grid.terrain.length > 0
              ? 'plains'
              : undefined;

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
        // A travel destination always shows its own glyph — even if terrain is
        // painted on the same cell — so a site never hides behind a tint glyph.
        token = (
          <>
            <span
              className={styles.gridMapGlyph}
              aria-hidden="true"
              style={{ fontSize: glyphFont }}
            >
              {transitionGlyph(transition)}
            </span>
            {LABELLED_KINDS.has(transition.kind) && (
              <span className={styles.gridMapLabel} aria-hidden="true">
                {transition.label}
              </span>
            )}
          </>
        );
      } else if (tStyle?.glyph) {
        // Impassable typed terrain (mountains ▲, water ≈).
        token = (
          <span
            className={styles.gridMapObstacleGlyph}
            aria-hidden="true"
            style={{ fontSize: glyphFont }}
          >
            {tStyle.glyph}
          </span>
        );
      } else if (isObstacle && isRegional) {
        // Legacy (untyped) regional obstacle reads as a mountain peak.
        token = (
          <span
            className={styles.gridMapObstacleGlyph}
            aria-hidden="true"
            style={{ fontSize: glyphFont }}
          >
            ▲
          </span>
        );
      }

      cells.push(
        <div
          key={key}
          className={[
            styles.gridCell,
            clickable ? styles.gridMapCellClickable : '',
            isMarker ? styles.gridMapCellCurrent : '',
          ]
            .filter(Boolean)
            .join(' ')}
          style={{
            background: cellBg,
            cursor: clickable ? 'pointer' : 'default',
            width: cellPx,
            height: cellPx,
          }}
          aria-label={ariaParts.join(', ')}
          aria-current={isMarker ? 'location' : undefined}
          role={clickable ? 'button' : 'gridcell'}
          tabIndex={clickable ? 0 : undefined}
          title={cellTitle}
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
            gridTemplateColumns: `repeat(${grid.width}, ${cellPx}px)`,
            gridTemplateRows: `repeat(${grid.height}, ${cellPx}px)`,
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
        {hasTown && (
          <span>
            <span className={styles.gridLegendGlyph}>⌂</span> town
          </span>
        )}
        {hasLocalSite && (
          <span>
            <span className={styles.gridLegendGlyph}>◈</span> site
          </span>
        )}
        {hasOtherTransition && (
          <span>
            <span className={styles.gridLegendTransition} /> travel point (click to go)
          </span>
        )}
        {presentTerrain.map((t) => (
          <span key={t}>
            <span
              className={styles.gridLegendTerrain}
              style={{ background: TERRAIN_STYLE[t].tint ?? 'var(--t-bg)' }}
            />{' '}
            {TERRAIN[t].label}
          </span>
        ))}
        {hasLegacyObstacle && (
          <span>
            <span className={styles.gridLegendObstacle} />{' '}
            {isRegionalGrid ? 'mountains' : 'impassable'}
          </span>
        )}
      </div>
    </div>
  );
}

export default GridMapView;
