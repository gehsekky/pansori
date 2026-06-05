import type { ActiveGrid, GridPos, MapTransition, TerrainType } from '../types';
import GameIcon from './GameIcon';
import { TERRAIN } from '../types';
import { TERRAIN_STYLE } from '../lib/terrainStyle';
import styles from '../styles.module.css';

const CELL_PX = 32;
// Overland (regional) square size. Larger than town/local so the sparse map
// reads more like a map and the painted terrain tiles have room to breathe.
// Tweak to taste — glyph sizes scale off it automatically.
const REGIONAL_CELL_PX = 96;

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
  // Ground loot standing on the grid (local room maps). Renders a clickable
  // token per item at its `pos`; clicking it (via `onLootClick(key)`) walks the
  // party adjacent (the `approach` action), after which the "Pick up …" choice
  // surfaces. Items already taken aren't passed in (so they vanish on pickup).
  loot?: Array<{ key: string; pos: GridPos; name: string; icon?: string }>;
  onLootClick?: (lootKey: string) => void;
  // Interactable objects (chests / strongboxes) with a position. Same approach
  // flow as loot — clicking walks the party adjacent, then "Interact with …"
  // surfaces. Searched objects aren't passed in.
  objects?: Array<{ id: string; pos: GridPos; name: string; icon?: string }>;
  onObjectClick?: (objectId: string) => void;
  // Fog of war — the set of revealed "x,y" cell keys. When provided, any cell
  // not in the set is hidden (obscured + non-travelable). Omit to disable fog
  // (towns / local maps render fully). The party + enemy markers are never
  // fogged.
  revealed?: ReadonlySet<string>;
  // Read-only mode: render the map but make EVERY cell non-clickable. Used when
  // an alternate flow owns the action surface (post-combat Continue gate, an
  // open conversation, the leveling roster, a vendor) so a stray map click can't
  // dispatch a move / talk / pickup and break out of that flow.
  readOnly?: boolean;
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

// Hand-painted terrain tiles (David Baumgart). Each PNG is 256×384 and renders
// bottom-anchored at 150% cell height so the top third overhangs the row above
// (2.5D layered overland look). Terrains with no tile fall back to the tint +
// game-icons glyph below — chiefly the town/interior types (road, cobblestone,
// garden, town_wall) this terrain set doesn't cover.
const TERRAIN_TILE: Partial<Record<TerrainType, string>> = {
  plains: '/art/tiles/plains.png',
  road: '/art/tiles/road.png',
  forest: '/art/tiles/forest.png',
  hills: '/art/tiles/hills.png',
  swamp: '/art/tiles/swamp.png',
  snow: '/art/tiles/snow.png',
  water: '/art/tiles/water.png',
  mountain: '/art/tiles/mountain.png',
};

// A town site on the regional map renders as this hand-painted village tile
// (David Baumgart's dirtVillage) instead of the generic village glyph.
const TOWN_SITE_TILE = '/art/tiles/town.png';

// game-icons glyphs for non-site transitions (town venues + local room exits /
// ascents). Sites are handled separately (towns → village, dungeons → their
// authored icon, below).
const TRANSITION_ICON: Partial<Record<MapTransition['kind'], { name: string; color: string }>> = {
  venue: { name: 'house', color: 'rgba(222, 190, 120, 0.97)' }, // a building you can enter
  room_exit: { name: 'exit-door', color: 'rgba(206, 198, 182, 0.95)' }, // passage out to another room
  ascend: { name: 'exit-door', color: 'rgba(206, 198, 182, 0.95)' }, // leave back up a level
};

// Local sites (dungeons) on the overland map: the game-icons glyph defaults to
// this and is overridden per site via MapSite.icon (carried on the transition).
const DEFAULT_SITE_ICON = 'dungeon-gate';
// Stone tone shared by dungeon-site + room-exit glyphs.
const SITE_STONE = 'rgba(206, 198, 182, 0.95)';

// Talkable-NPC token: a warm gold glyph. Each NPC may override the glyph via
// PlacedNpc.icon (e.g. 'wood-axe'); this is the fallback when none is set.
const DEFAULT_NPC_ICON = 'conversation';
const NPC_GOLD = 'rgba(230, 200, 120, 1)';

// Ground-loot token: a green item glyph. Interactable objects (chests) use a
// distinct chest glyph in a warmer tone so they read apart from loose loot.
const DEFAULT_LOOT_ICON = 'swap-bag';
const LOOT_GREEN = 'rgba(120, 210, 140, 1)';
const DEFAULT_OBJECT_ICON = 'locked-chest';
const OBJECT_BROWN = 'rgba(205, 170, 110, 1)';

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
  loot,
  onLootClick,
  objects,
  onObjectClick,
  revealed,
  readOnly,
}: Props) {
  // The overland (regional) map gets double-size squares so the larger, sparse
  // grid reads more like a map; the town map uses mid-size 48 px squares; local
  // exploration stays compact (CELL_PX).
  const cellPx =
    grid.level === 'regional' ? REGIONAL_CELL_PX : grid.level === 'town' ? 48 : CELL_PX;
  // Scale the cell glyphs proportionally to the square (the CSS default is
  // 1.35rem at CELL_PX); local keeps the default (undefined ⇒ no inline
  // override), so a change to REGIONAL_CELL_PX re-sizes its glyphs automatically.
  const glyphFont = cellPx === CELL_PX ? undefined : `${((1.35 * cellPx) / CELL_PX).toFixed(2)}rem`;
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
      const isTownSite = transition?.kind === 'site' && !!transition.toTownId;
      // A site can opt into a painted tile via an `icon: 'tile:<name>'` value
      // (e.g. 'tile:forest' → /art/tiles/forest.png) instead of a game-icons glyph.
      const siteTileName =
        transition?.kind === 'site' && transition.icon?.startsWith('tile:')
          ? transition.icon.slice('tile:'.length)
          : undefined;
      // A talkable NPC token sits here (and the party isn't standing on it).
      const cellNpc = npcs?.find((n) => n.pos.x === x && n.pos.y === y);
      const isNpc = !!cellNpc && !isMarker;
      // Ground loot / interactable object tokens (mutually exclusive with the
      // higher-priority marker / enemy / NPC tokens on the same cell).
      const cellLoot = loot?.find((l) => l.pos.x === x && l.pos.y === y);
      const isLoot = !!cellLoot && !isMarker && !isEnemyMarker && !isNpc;
      const cellObject = objects?.find((o) => o.pos.x === x && o.pos.y === y);
      const isObject = !!cellObject && !isMarker && !isEnemyMarker && !isNpc && !isLoot;
      // Fog of war — an undiscovered cell is hidden and can't be travelled to.
      // The party + the (always-nearby) enemy marker are never fogged.
      const fogged = !!revealed && !revealed.has(key) && !isMarker && !isEnemyMarker;
      // Out of combat the party moves freely (the backend pathfinds), so every
      // non-obstacle cell that isn't the marker's own square is a valid target.
      // The enemy marker engages (attack); the NPC's own cell talks (walks
      // adjacent); everything else travels. Fogged cells are never clickable.
      const clickable = readOnly
        ? false
        : fogged
          ? false
          : isEnemyMarker
            ? !!onEnemyClick
            : isNpc
              ? !!onNpcClick
              : isLoot
                ? !!onLootClick
                : isObject
                  ? !!onObjectClick
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
      // Hand-painted terrain tile for this cell, if the terrain type has one.
      // Explicitly-painted terrain gets its tile on every map level; an
      // unpainted "plains" cell only tiles on the regional map (so interior
      // rooms don't sprout grass where they're just bare floor). Fogged cells
      // never show a tile.
      const tileSrc = fogged
        ? undefined
        : isTownSite
          ? TOWN_SITE_TILE
          : siteTileName
            ? `/art/tiles/${siteTileName}.png`
            : terrainType
              ? TERRAIN_TILE[terrainType]
              : isRegional && plainsDefault
                ? TERRAIN_TILE.plains
                : undefined;
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
        if (isLoot) ariaParts.push(`${cellLoot!.name}, pick up`);
        if (isObject) ariaParts.push(`${cellObject!.name}, search`);
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
            : isLoot
              ? `Approach the ${cellLoot!.name}`
              : isObject
                ? `Approach the ${cellObject!.name}`
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
        // The party marker. On the overworld + town maps it's the animated
        // Tiny Swords warrior sprite (sized ~1.5× the cell via the --mk var);
        // local rooms keep the compact swords-emblem glyph. The party cell is
        // already highlighted via gridMapCellCurrent, so no backing circle.
        if (grid.level === 'regional' || grid.level === 'town') {
          // Feet-anchored idle strip rendered larger than the cell (~1.6×) so the
          // warrior stands on the tile and overhangs upward (CSS bottom-anchors
          // him). The strip is already cropped left-of-centre with sword margin,
          // so no positioning nudge is needed.
          const markerPx = Math.round(cellPx * 1.6);
          token = (
            <div
              className={styles.gridMapMarkerSprite}
              style={
                {
                  width: markerPx,
                  height: markerPx,
                  '--mk': `${markerPx}px`,
                } as React.CSSProperties
              }
              aria-hidden="true"
            />
          );
        } else {
          token = (
            <GameIcon
              name="swords-emblem"
              className={styles.gridMapGlyph}
              style={{ fontSize: iconFontSize, color: 'rgba(100, 170, 250, 1)' }} // party blue
            />
          );
        }
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
      } else if (isLoot) {
        // Ground loot — a green item glyph + name label. Clicking walks the
        // party adjacent; the "Pick up …" choice then surfaces.
        token = (
          <>
            <GameIcon
              name={cellLoot!.icon ?? DEFAULT_LOOT_ICON}
              className={styles.gridMapGlyph}
              style={{ fontSize: iconFontSize, color: LOOT_GREEN }}
            />
            <span className={styles.gridMapLabel} aria-hidden="true">
              {cellLoot!.name}
            </span>
          </>
        );
      } else if (isObject) {
        // An interactable object (chest / strongbox) — a chest glyph + label.
        token = (
          <>
            <GameIcon
              name={cellObject!.icon ?? DEFAULT_OBJECT_ICON}
              className={styles.gridMapGlyph}
              style={{ fontSize: iconFontSize, color: OBJECT_BROWN }}
            />
            <span className={styles.gridMapLabel} aria-hidden="true">
              {cellObject!.name}
            </span>
          </>
        );
      } else if (transition) {
        // A travel destination always shows its own glyph — even if terrain is
        // painted on the same cell — so it never hides behind a tint glyph.
        // Towns → painted village tile (set as tileSrc above; the glyph is
        // suppressed so the tile carries the visual). Local dungeon sites →
        // their authored icon (default); town venues / local room exits /
        // ascents → their TRANSITION_ICON glyph.
        const isLocalSite = transition.kind === 'site' && !transition.toTownId;
        const transIcon = isLocalSite
          ? { name: transition.icon ?? DEFAULT_SITE_ICON, color: SITE_STONE }
          : (TRANSITION_ICON[transition.kind] ?? null);
        token = (
          <>
            {isTownSite || siteTileName ? null : transIcon ? (
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
      } else if (!tileSrc && terrainType && TERRAIN_ICON[terrainType]) {
        // game-icons glyph for a typed terrain feature (drawn over the tint),
        // on every map level. Suppressed when a painted tile covers the cell.
        const ic = TERRAIN_ICON[terrainType]!;
        token = (
          <GameIcon
            name={ic.name}
            className={styles.gridMapGlyph}
            style={{ fontSize: iconFontSize, color: ic.color }}
          />
        );
      } else if (!tileSrc && tStyle?.glyph) {
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

      // Cells carrying a token (party / enemy / NPC / loot / object / transition)
      // are lifted above neighbouring tile overhangs so the tile rising from the
      // row below can't occlude them.
      const elevated = isMarker || isEnemyMarker || isNpc || isLoot || isObject || !!transition;
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
            ...(elevated ? { zIndex: 2 } : {}),
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
                      : isLoot
                        ? onLootClick?.(cellLoot!.key)
                        : isObject
                          ? onObjectClick?.(cellObject!.id)
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
                    else if (isLoot) onLootClick?.(cellLoot!.key);
                    else if (isObject) onObjectClick?.(cellObject!.id);
                    else onMarkerMove?.({ x, y });
                  }
                }
              : undefined
          }
        >
          {tileSrc && (
            <img
              src={tileSrc}
              alt=""
              aria-hidden="true"
              draggable={false}
              className={styles.gridMapTile}
            />
          )}
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
      <div className={styles.gridBoardWrap} style={{ padding: Math.round(cellPx * 0.65) }}>
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
