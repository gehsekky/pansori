import type { ActiveGrid, GridPos, MapTransition, TerrainType } from '../types';
import GameIcon from './GameIcon';
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
  // Clicking the red enemy marker engages it — the parent dispatches the
  // out-of-combat "Attack" choice, dropping the party into combat. Without this
  // the dot would just be a travel target like any other empty cell.
  onEnemyClick?: () => void;
  // Click-to-move: the parent dispatches a single `marker_move` action for the
  // clicked cell. The backend free-pathfinds out of combat (no movement budget)
  // and resolves any transition (site / venue / room exit / ascend) on arrival.
  onMarkerMove?: (to: GridPos) => void;
  // The talkable NPCs standing on the grid (local room maps) — a room may hold
  // several. Renders a clickable token per NPC at its `pos`; clicking it (via
  // `onNpcClick(id)`) walks the party adjacent and opens that NPC's conversation,
  // the same as the "Talk to …" choice.
  npcs?: Array<{ id: string; pos: GridPos; name: string; icon?: string }>;
  onNpcClick?: (npcId: string) => void;
  // Fog of war — the set of revealed "x,y" cell keys. When provided, any cell
  // not in the set is hidden (obscured + non-travelable). Omit to disable fog
  // (towns / local maps render fully). The party + enemy markers are never
  // fogged.
  revealed?: ReadonlySet<string>;
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

// game-icons glyphs for typed terrain (drawn over the type's tint instead of a
// plain unicode glyph / bare tint). Applies on EVERY map level — overland, town,
// and local. Floor/ground types (plains, cobblestone) keep just their tint; only
// terrain "features" carry an icon.
const TERRAIN_ICON: Partial<Record<TerrainType, { name: string; color: string }>> = {
  forest: { name: 'forest', color: 'rgba(34, 92, 34, 0.92)' },
  water: { name: 'wave-crest', color: 'rgba(150, 205, 245, 0.95)' }, // light blue over the tint
  mountain: { name: 'peaks', color: 'rgba(214, 210, 202, 0.95)' }, // light stone over the dark tint
  hills: { name: 'hills', color: 'rgba(140, 165, 100, 0.92)' }, // grassy green over the tan tint
  road: { name: 'path-tile', color: 'rgba(214, 188, 140, 0.95)' }, // sandy path over the tan tint
  swamp: { name: 'high-grass', color: 'rgba(150, 170, 110, 0.9)' }, // reedy marsh
  snow: { name: 'snowflake-1', color: 'rgba(220, 235, 250, 0.95)' }, // icy north
  garden: { name: 'flowers', color: 'rgba(150, 200, 120, 0.95)' }, // tended town greenery
  town_wall: { name: 'brick-wall', color: 'rgba(150, 138, 120, 0.95)' }, // impassable masonry
};

// game-icons glyphs for non-site transitions (town venues + local room exits /
// ascents). Sites are handled separately (towns → village, dungeons → their
// authored icon, below).
const TRANSITION_ICON: Partial<Record<MapTransition['kind'], { name: string; color: string }>> = {
  venue: { name: 'house', color: 'rgba(222, 190, 120, 0.97)' }, // a building you can enter
  room_exit: { name: 'wooden-door', color: 'rgba(206, 198, 182, 0.95)' }, // passage to another room
  ascend: { name: 'return-arrow', color: 'rgba(206, 198, 182, 0.95)' }, // back up a level
};

// Local sites (dungeons) on the overland map: the game-icons glyph defaults to
// this and is overridden per site via MapSite.icon (carried on the transition).
const DEFAULT_SITE_ICON = 'dungeon-gate';
// Town settlement glyph (regional site carrying toTownId).
const TOWN_ICON = { name: 'village', color: 'rgba(222, 190, 120, 0.97)' };
// Stone tone shared by dungeon-site + room-exit glyphs.
const SITE_STONE = 'rgba(206, 198, 182, 0.95)';

// Talkable-NPC token: a warm gold glyph. Each NPC may override the glyph via
// PlacedNpc.icon (e.g. 'wood-axe'); this is the fallback when none is set.
const DEFAULT_NPC_ICON = 'conversation';
const NPC_GOLD = 'rgba(230, 200, 120, 1)';

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

// Hover-tooltip description for a (non-POI) terrain square: the capitalized
// label, plus — on the overland regional map — what the square costs to cross
// (travel-time and random-encounter modifiers from the shared TERRAIN spec) so
// the player can read the map before moving. Town / local maps show the label
// only, since those modifiers apply only to regional overland travel.
// Impassable terrain always notes it can't be crossed.
function describeTerrain(type: TerrainType, withModifiers: boolean): string {
  const t = TERRAIN[type];
  const label = t.label.charAt(0).toUpperCase() + t.label.slice(1);
  if (!t.passable) return `${label} · impassable`;
  if (!withModifiers) return label;
  const parts = [label];
  if (t.travelMult < 1) parts.push('quick travel');
  else if (t.travelMult > 1) parts.push(`slow going (${t.travelMult}× travel time)`);
  if (t.encounterMult === 0) parts.push('safe');
  else if (t.encounterMult < 1) parts.push('safer');
  else if (t.encounterMult > 1) parts.push('encounters more likely');
  return parts.join(' · ');
}

/**
 * The out-of-combat exploration view for the 3-level grid map. Renders the
 * active grid (regional / town / local) with the party as a SINGLE marker,
 * transition cells (sites / venues / room exits / ascents) the player can click
 * to travel to, and obstacles. (Local combat switches to GridCombatView, which
 * deploys the party into PC tokens.)
 */
function GridMapView({
  grid,
  markerPos,
  enemyPresent,
  onEnemyClick,
  onMarkerMove,
  npcs,
  onNpcClick,
  revealed,
}: Props) {
  // The overland (regional) map gets double-size squares so the larger, sparse
  // grid reads more like a map; the town map uses mid-size 48 px squares; local
  // exploration stays compact (CELL_PX).
  const cellPx = grid.level === 'regional' ? CELL_PX * 2 : grid.level === 'town' ? 48 : CELL_PX;
  // Scale the cell glyphs up to match the larger squares (proportional to the
  // CSS default of 1.35rem at 32 px); local keeps the CSS default
  // (undefined ⇒ no inline override).
  const glyphFont =
    grid.level === 'regional' ? '2.7rem' : grid.level === 'town' ? '2rem' : undefined;
  // game-icons read a touch small vs a plain glyph, so size them ~25% over the
  // cell glyph font (shared by terrain / site / transition / marker icons).
  const iconFontSize = glyphFont ? `calc(${glyphFont} * 1.25)` : undefined;
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
      // A talkable NPC token sits here (and the party isn't standing on it).
      const cellNpc = npcs?.find((n) => n.pos.x === x && n.pos.y === y);
      const isNpc = !!cellNpc && !isMarker;
      // Fog of war — an undiscovered cell is hidden and can't be travelled to.
      // The party + the (always-nearby) enemy marker are never fogged.
      const fogged = !!revealed && !revealed.has(key) && !isMarker && !isEnemyMarker;
      // Out of combat the party moves freely (the backend pathfinds), so every
      // non-obstacle cell that isn't the marker's own square is a valid target.
      // The enemy marker engages (attack); the NPC's own cell talks (walks
      // adjacent); everything else travels. Fogged cells are never clickable.
      const clickable = fogged
        ? false
        : isEnemyMarker
          ? !!onEnemyClick
          : isNpc
            ? !!onNpcClick
            : !isObstacle && !isMarker && !!onMarkerMove;

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
      // Fog covers the cell's terrain/sites entirely with an unexplored fill.
      if (fogged) cellBg = 'rgba(6, 8, 14, 0.94)';

      const ariaParts: string[] = [`${x},${y}`];
      if (fogged) {
        ariaParts.push('unexplored');
      } else {
        if (isMarker) ariaParts.push('the party');
        if (isEnemyMarker) ariaParts.push('an enemy');
        if (isNpc) ariaParts.push(`${cellNpc!.name}, talk`);
        if (terrainType) ariaParts.push(TERRAIN[terrainType].label);
        else if (isObstacle) ariaParts.push('impassable');
        if (transition) ariaParts.push(transition.label);
      }

      // Hover tooltip: a destination (POI) shows its name; any other square
      // shows its terrain type + what it costs to cross (travel time / encounter
      // risk) so the player can read the map. Blank cells on a terrain-bearing
      // grid read as "plains"; grids with no authored terrain (town / local)
      // keep no tooltip on empty cells.
      // Travel / encounter modifiers apply only to overland (regional) travel,
      // so town / local maps tooltip the bare terrain label.
      const showTerrainModifiers = grid.level === 'regional';
      const cellTitle = fogged
        ? 'Unexplored'
        : isEnemyMarker
          ? 'Attack'
          : isNpc
            ? `Talk to ${cellNpc!.name}`
            : transition
              ? transition.label
              : terrainType
                ? describeTerrain(terrainType, showTerrainModifiers)
                : isObstacle
                  ? 'Impassable'
                  : grid.terrain.length > 0
                    ? describeTerrain('plains', showTerrainModifiers)
                    : undefined;

      let token: React.ReactNode = null;
      if (fogged) {
        // Hidden cell — render no terrain/site/marker glyph.
      } else if (isMarker) {
        // The party marker — the swords-emblem glyph, drawn at the map-glyph
        // size (the small token circle clipped it). The party cell is already
        // highlighted via gridMapCellCurrent, so no backing circle is needed.
        token = (
          <GameIcon
            name="swords-emblem"
            className={styles.gridMapGlyph}
            style={{ fontSize: iconFontSize, color: 'rgba(100, 170, 250, 1)' }} // party blue
          />
        );
      } else if (isEnemyMarker) {
        // The "hostile here" marker (out of combat) — a red threat glyph.
        token = (
          <GameIcon
            name="daemon-skull"
            className={styles.gridMapGlyph}
            style={{ fontSize: iconFontSize, color: 'rgba(230, 80, 80, 1)' }}
          />
        );
      } else if (isNpc) {
        // A talkable NPC: a gold game-icons glyph (per-NPC override, else the
        // default NPC glyph) + a name label.
        token = (
          <>
            <GameIcon
              name={cellNpc!.icon ?? DEFAULT_NPC_ICON}
              className={styles.gridMapGlyph}
              style={{ fontSize: iconFontSize, color: NPC_GOLD }}
            />
            <span className={styles.gridMapLabel} aria-hidden="true">
              {cellNpc!.name}
            </span>
          </>
        );
      } else if (transition) {
        // A travel destination always shows its own glyph — even if terrain is
        // painted on the same cell — so it never hides behind a tint glyph.
        // Towns → village; local dungeon sites → their authored icon (default);
        // town venues / local room exits / ascents → their TRANSITION_ICON glyph.
        const isTown = transition.kind === 'site' && !!transition.toTownId;
        const isLocalSite = transition.kind === 'site' && !transition.toTownId;
        const transIcon = isTown
          ? TOWN_ICON
          : isLocalSite
            ? { name: transition.icon ?? DEFAULT_SITE_ICON, color: SITE_STONE }
            : (TRANSITION_ICON[transition.kind] ?? null);
        token = (
          <>
            {transIcon ? (
              <GameIcon
                name={transIcon.name}
                className={styles.gridMapGlyph}
                style={{ fontSize: iconFontSize, color: transIcon.color }}
              />
            ) : (
              <span
                className={styles.gridMapGlyph}
                aria-hidden="true"
                style={{ fontSize: glyphFont }}
              >
                {transitionGlyph(transition)}
              </span>
            )}
            {LABELLED_KINDS.has(transition.kind) && (
              <span className={styles.gridMapLabel} aria-hidden="true">
                {transition.label}
              </span>
            )}
          </>
        );
      } else if (terrainType && TERRAIN_ICON[terrainType]) {
        // game-icons glyph for a typed terrain feature (drawn over the tint),
        // on every map level.
        const ic = TERRAIN_ICON[terrainType]!;
        token = (
          <GameIcon
            name={ic.name}
            className={styles.gridMapGlyph}
            style={{ fontSize: iconFontSize, color: ic.color }}
          />
        );
      } else if (tStyle?.glyph) {
        // Impassable typed terrain not yet iconified (mountains ▲).
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
          onClick={
            clickable
              ? () =>
                  isEnemyMarker
                    ? onEnemyClick?.()
                    : isNpc
                      ? onNpcClick?.(cellNpc!.id)
                      : onMarkerMove?.({ x, y })
              : undefined
          }
          onKeyDown={
            clickable
              ? (e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    if (isEnemyMarker) onEnemyClick?.();
                    else if (isNpc) onNpcClick?.(cellNpc!.id);
                    else onMarkerMove?.({ x, y });
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
