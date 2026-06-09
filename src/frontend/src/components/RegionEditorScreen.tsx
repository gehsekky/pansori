import Breadcrumb, { type Crumb } from './Breadcrumb.tsx';
import DialogueEditor, { type DialogueNode } from './DialogueEditor.tsx';
import {
  MARKER_TILES,
  TERRAIN,
  TERRAIN_TILES,
  type TerrainType,
  clampCombatDim,
  crInTier,
} from '../shared-types.ts';

// ─── Site icon options (the SITES tool's ICON dropdown) ──────────────────────
//
// A site's icon is either '' (the default dungeon-gate glyph), a
// 'tile:<id>' painted tile — markers (location paintings) first, terrain
// tiles second — or a legacy game-icons glyph kept as a "(custom)" entry.
const siteIconOptions: Array<{ value: string; label: string; group: 'marker' | 'terrain' }> = [
  ...Object.entries(MARKER_TILES).map(([id, spec]) => ({
    value: `tile:${id}`,
    label: spec.label.toUpperCase(),
    group: 'marker' as const,
  })),
  ...Object.entries(TERRAIN_TILES).map(([id, spec]) => ({
    value: `tile:${id}`,
    label: spec.label.toUpperCase(),
    group: 'terrain' as const,
  })),
];

// The painted preview for a 'tile:<id>' icon (variant 1, matching what the
// overworld renderer pins landmarks to). Glyph / custom icons → null, and the
// free tier (no painted art) → null too, so the caller shows the glyph.
function siteIconPreview(icon: string | undefined): string | null {
  if (!icon?.startsWith('tile:') || !paintedArt()) return null;
  const id = icon.slice('tile:'.length);
  const marker = (MARKER_TILES as Partial<Record<string, { base: string }>>)[id];
  if (marker) return artUrl(`/art/markers/${marker.base}_1.png`);
  const terrain = (TERRAIN_TILES as Partial<Record<string, { base: string }>>)[id];
  if (terrain) return artUrl(`/art/tiles/${terrain.base}_1.png`);
  return null;
}
import { artUrl, markerGlyph, paintedArt } from '../lib/art.ts';
import { useCallback, useEffect, useState } from 'react';
import GameIcon from './GameIcon.tsx';
import MapsPanel from './MapsPanel.tsx';
import { api } from '../lib/api.ts';
import styles from '../styles.module.css';

// Visual map grid painter:
//   /creator/<campaign id>/region/<region id>   (kind 'region')
//   /creator/<campaign id>/town/<town id>       (kind 'town')
//   /creator/<campaign id>/room/<room id>       (kind 'room')
//
// Edits ONE map: its dense cell grid plus the non-map details (name,
// description, scale; region encounter chance / base tier / starting
// flag; town/room floor; room lighting + can-rest). Pick a terrain from
// the palette and click/drag to paint (rooms also have a MECHANICS brush
// — one obstacle/difficult/climb/swim/cover flag per cell); the TIER tool
// (regions only) paints per-cell tier overrides; the START/ENTRY tool
// relocates the party marker; the SITES/VENUES/EXITS tool places and
// edits the map's transition markers (◆) — click a cell to place, click a
// marker to select, with a form for name/kind/target and MOVE/DELETE.
// SAVE writes the whole section back through the normal content PUT —
// same validation, same live refresh.
//
// The grid model is the painter's data model on purpose (design call
// 2026-06-06): region/town cells are { t, tier?, enc? }; room cells are
// { t?, m? } (t absent = bare floor). `enc` overrides stay JSON-only here.

interface Cell {
  t?: string;
  ez?: string; // regions only — encounter-zone id (one per cell ⇒ no overlap)
  m?: string; // rooms only — one mechanical flag per cell
}

// A painted intra-region encounter zone (metadata; geometry is the cells' `ez`).
// The sole source of random encounters: tier + chance + table all live here.
interface EditorEncounterZone {
  id: string;
  name: string;
  tier: number; // 1–4 — gates which CRs the creature table may hold
  encounterChance: number; // 0–1 per square crossed
  encounterTable: string[];
  // Battleground rooms per triggering-square terrain type (engine EncounterZone).
  // No editor UI yet — carried through load/save so an API-set value isn't lost.
  arenaRooms?: Record<string, string[]>;
}

const MECH_FLAGS = ['obstacle', 'difficult', 'climb', 'swim', 'cover'] as const;
// Corner letter per mechanical flag, so painted mechanics read at a glance.
const MECH_LETTER: Record<string, string> = {
  obstacle: 'O',
  difficult: 'D',
  climb: 'C',
  swim: 'S',
  cover: 'V',
};

// A site (region), venue (town), or exit (room) — the map's transition
// cells, edited visually with the SITES/VENUES/EXITS tool. One shape
// covers all three: sites are kind 'town'|'local', venues
// 'interior'|'gate', exits 'room'|'ascend' (exits have no stored id —
// the editor synthesizes one and maps back to the exit shape on save).
interface EditorSite {
  id: string;
  name: string;
  pos: { x: number; y: number };
  kind: string;
  townId?: string;
  entryRoomId?: string;
  regionId?: string; // region gates only — target region
  entryPos?: { x: number; y: number }; // region gates — preserved, not edited
  toRoomId?: string; // rooms only — exit target
  entrancePos?: { x: number; y: number }; // rooms only — preserved, not edited
  desc?: string;
  onEnter?: string | string[]; // a variant pool (pick one)
  icon?: string;
  [key: string]: unknown;
}

interface EditorExit {
  pos: { x: number; y: number };
  toRoomId?: string;
  entrancePos?: { x: number; y: number };
  label?: string;
  ascends?: boolean;
}

interface EditorRegion {
  id: string;
  name: string;
  grid: Cell[][];
  startPos?: { x: number; y: number }; // regions/towns
  entryPos?: { x: number; y: number }; // rooms
  desc?: string;
  feetPerSquare?: number;
  isStartingRegion?: boolean; // regions only
  // Level narration hooks (all kinds) — each a VARIANT POOL (pick one); FIRST
  // overrides plain on the first scope entry/exit; region first-enter falls back
  // to desc. Multi-paragraph = newlines within a variant.
  onEnter?: string | string[];
  onFirstEnter?: string | string[];
  onExit?: string | string[];
  onFirstExit?: string | string[];
  encounterZones?: EditorEncounterZone[]; // regions only — the sole encounter source
  floor?: string; // towns + rooms
  lighting?: string; // rooms only
  canRest?: boolean; // rooms only
  sites?: EditorSite[];
  venues?: EditorSite[];
  exits?: EditorExit[]; // rooms only
  enemies?: Array<{ name: string; count?: number }>; // rooms only
  loot?: Array<{ itemId: string; pos?: { x: number; y: number } }>; // rooms only
  npcs?: EditorNpc[]; // rooms only
  objects?: EditorObject[]; // rooms only
  trap?: EditorTrap; // rooms only
  [key: string]: unknown;
}

// A searchable/interactable object as the painter edits it — including the
// flavor strings (desc + interact/search-result text).
interface EditorObject {
  id: string;
  name: string;
  // Narrative hooks — variant pools (string | string[]); edited via HookVariants.
  desc?: string | string[];
  interactText?: string | string[];
  foundText?: string | string[];
  emptyText?: string | string[];
  searchDC?: number;
  lootIds?: string[];
  pos?: { x: number; y: number };
  [key: string]: unknown;
}

// The room's (at most one) trap. The painter edits the mechanics AND the
// narrative overrides ({name} = the triggering character, {dmg} = rolled damage).
interface EditorTrap {
  name: string;
  dc: number;
  damage: string;
  damageType: string;
  condition?: string;
  // Narrative hooks — variant pools (string | string[]); edited via HookVariants.
  detectNarrative?: string | string[];
  triggerNarrative?: string | string[];
  disarmSuccess?: string | string[];
  disarmFail?: string | string[];
  [key: string]: unknown;
}

// A placed NPC, as the painter edits it. The dialogue tree edits through
// the structured DialogueEditor; shops and custom stat blocks are preserved
// on save but edited via the ROOMS JSON.
interface EditorNpc {
  id: string;
  name: string;
  attitude: string;
  // Greeting/goodbye hooks — variant pools (string | string[]); edited via
  // HookVariants. FIRST overrides the plain one once. greeting required.
  greeting: string | string[];
  firstGreeting?: string | string[];
  goodbye?: string | string[];
  firstGoodbye?: string | string[];
  pos?: { x: number; y: number };
  icon?: string;
  responses?: DialogueNode[];
  shop?: Array<{ itemId: string; price: number; qty?: number }>;
  shopGold?: number;
  factionId?: string;
  [key: string]: unknown;
}

// Room exits ↔ the marker-editing shape: exits carry no id, so the editor
// synthesizes exit-N keys on load and strips them again on save.
const exitsToSites = (exits?: EditorExit[]): EditorSite[] =>
  (exits ?? []).map((e, i) => ({
    id: `exit-${i + 1}`,
    name: e.label ?? '',
    pos: { ...e.pos },
    kind: e.ascends ? 'ascend' : 'room',
    ...(e.toRoomId ? { toRoomId: e.toRoomId } : {}),
    ...(e.entrancePos ? { entrancePos: { ...e.entrancePos } } : {}),
  }));

// The four narration hooks (every scope). Each is a VARIANT POOL — the engine
// picks one at random; multi-paragraph = newlines within a variant.
const HOOK_KEYS = ['onEnter', 'onFirstEnter', 'onExit', 'onFirstExit'] as const;
type HookKey = (typeof HOOK_KEYS)[number];

// Normalize a stored hook (string | string[] | undefined) to a variant list.
function toVariants(v: string | string[] | undefined): string[] {
  return Array.isArray(v) ? [...v] : v ? [v] : [];
}

// Trim + drop blank variants for save; undefined when the pool is empty (so the
// caller deletes the key rather than persisting an empty array / blank string).
function pruneVariants(v: string | string[] | undefined): string[] | undefined {
  const vs = toVariants(v)
    .map((s) => s.trim())
    .filter(Boolean);
  return vs.length ? vs : undefined;
}

// The non-map fields editable on this page. Scalars held as strings ('' = unset);
// the four narration hooks held as variant lists, parsed/pruned at save time.
interface Details {
  name: string;
  desc: string;
  feetPerSquare: string;
  onEnter: string[];
  onFirstEnter: string[];
  onExit: string[];
  onFirstExit: string[];
  floor: string; // towns + rooms
  lighting: string; // rooms only
}

function detailsFrom(r: EditorRegion): Details {
  return {
    name: r.name ?? '',
    desc: r.desc ?? '',
    feetPerSquare: r.feetPerSquare !== undefined ? String(r.feetPerSquare) : '',
    onEnter: toVariants(r.onEnter),
    onFirstEnter: toVariants(r.onFirstEnter),
    onExit: toVariants(r.onExit),
    onFirstExit: toVariants(r.onFirstExit),
    floor: r.floor ?? '',
    // An absent lighting key IS bright (the engine defaults it everywhere),
    // so the form shows BRIGHT rather than exposing the omitted-key detail.
    lighting: r.lighting ?? 'bright',
  };
}

const TERRAIN_COLORS: Record<TerrainType, string> = {
  plains: '#7a9e4f',
  road: '#b8a06a',
  forest: '#2e6b34',
  hills: '#8b7d4a',
  swamp: '#4e5e43',
  snow: '#dfe8ee',
  water: '#2c5a8c',
  mountain: '#6e6e72',
  cobblestone: '#9a9a9a',
  garden: '#5fae6e',
  town_wall: '#4a4038',
};

const TERRAIN_TYPES = Object.keys(TERRAIN) as TerrainType[];
// The TERRAIN brush panel splits by the scale a type belongs to: the
// settlement tiles are explicit, everything else (incl. future natural
// types) is regional.
const LOCAL_TERRAINS = ['cobblestone', 'garden', 'town_wall'].filter((t) =>
  TERRAIN_TYPES.includes(t as TerrainType)
) as TerrainType[];
const REGIONAL_TERRAINS = TERRAIN_TYPES.filter((t) => !LOCAL_TERRAINS.includes(t));
// Terrain types an encounter can actually trigger on (impassable squares are
// never crossed) — the arena-rooms editor only offers these.
const ARENA_TERRAINS = REGIONAL_TERRAINS.filter((t) => TERRAIN[t].passable);

// Drop terrain keys whose room list is empty (an empty list behaves like "no
// entry" — the default arena), so the saved arenaRooms map stays clean.
// Returns undefined when nothing is left.
function pruneArenaRooms(
  arenaRooms: Record<string, string[]> | undefined
): Record<string, string[]> | undefined {
  if (!arenaRooms) return undefined;
  const cleaned = Object.fromEntries(
    Object.entries(arenaRooms).filter(([, ids]) => ids.length > 0)
  );
  return Object.keys(cleaned).length > 0 ? cleaned : undefined;
}

type Tool = 'terrain' | 'start' | 'site' | 'mech' | 'size' | 'zone';

const CELL_PX = 30;

// Distinct overlay colors for painted encounter zones, assigned by index. The
// border/tint sits over the terrain fill so a zone's extent reads at a glance.
const ZONE_COLORS = [
  '#e2574c',
  '#4caf50',
  '#2196f3',
  '#ff9800',
  '#9c27b0',
  '#00bcd4',
  '#ffeb3b',
  '#8bc34a',
];
const zoneColor = (zones: { id: string }[], id: string | undefined): string | undefined =>
  id
    ? ZONE_COLORS[
        Math.max(
          0,
          zones.findIndex((z) => z.id === id)
        ) % ZONE_COLORS.length
      ]
    : undefined;

function describeError(err: unknown): string {
  const e = err as { error?: string; issues?: Array<{ path: string; message: string }> };
  if (e?.error === 'invalid_section_value' && e.issues?.length) {
    const first = e.issues
      .slice(0, 3)
      .map((i) => (i.path ? `${i.path}: ${i.message}` : i.message))
      .join('; ');
    return `Invalid shape — ${first}`;
  }
  return 'Request failed — try again.';
}

// One narration hook = a pool of variant entries. Each variant is a multi-line
// textarea (blank line = paragraph break); the engine picks one variant at
// random. A 1-variant pool serves as a plain string; 0 variants = hook unset.
function HookVariants({
  field,
  label,
  variants,
  onChange,
}: {
  field: string;
  label: string;
  variants: string[];
  onChange: (variants: string[]) => void;
}) {
  return (
    <div style={{ marginBottom: '0.75rem' }}>
      <label className={styles.formLbl}>{label}</label>
      {variants.length === 0 && (
        <p style={{ fontSize: '0.7rem', color: 'var(--t-dim)', margin: '2px 0' }}>none</p>
      )}
      {variants.map((v, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', marginBottom: 4 }}>
          <textarea
            id={`map-hook-${field}-${i}`}
            aria-label={`${label} variant ${i + 1}`}
            className={styles.formInp}
            rows={2}
            style={{ resize: 'vertical', flex: 1 }}
            placeholder="a variant (blank line = paragraph break)"
            value={v}
            onChange={(e) => onChange(variants.map((x, j) => (j === i ? e.target.value : x)))}
          />
          <button
            type="button"
            className={styles.ghostBtn}
            style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
            aria-label={`Remove ${label} variant ${i + 1}`}
            onClick={() => onChange(variants.filter((_, j) => j !== i))}
          >
            <span aria-hidden="true">✕</span>
          </button>
        </div>
      ))}
      <button
        type="button"
        className={styles.ghostBtn}
        style={{ padding: '0.25rem 0.6rem', fontSize: '0.7rem' }}
        aria-label={`Add ${label} variant`}
        onClick={() => onChange([...variants, ''])}
      >
        + ADD VARIANT
      </button>
    </div>
  );
}

function RegionEditorScreen({
  campaignId,
  regionId,
  kind = 'region',
  onBack,
  onOpenMap,
  breadcrumbBase,
}: {
  campaignId: string;
  regionId: string;
  // Which map level is being painted — picks the section ('regions' /
  // 'towns' / 'rooms'), the marker source (sites / venues / exits), and
  // tool availability.
  kind?: 'region' | 'town' | 'room';
  onBack: () => void;
  // Navigate to another map's painter — the region page hosts the TOWNS
  // panel (towns are reached through region sites), and its cards/creates
  // open the town painter through this.
  onOpenMap?: (kind: 'region' | 'town' | 'room', mapId: string) => void;
  // The clickable breadcrumb crumbs BEFORE this map (CREATOR › campaign ›
  // any ancestor maps), supplied by the parent which owns the navigation.
  // This screen appends the current map as the terminal crumb. When absent
  // the plain title is shown.
  breadcrumbBase?: Crumb[];
}) {
  const section = kind === 'region' ? 'regions' : kind === 'town' ? 'towns' : 'rooms';
  // The full regions list (the save unit) + the edited region's pieces.
  const [regions, setRegions] = useState<EditorRegion[] | null>(null);
  const [grid, setGrid] = useState<Cell[][]>([]);
  const [startPos, setStartPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [details, setDetails] = useState<Details>(detailsFrom({} as EditorRegion));
  // Regions only: flip THIS region to the starting region on save (the
  // others go false in the same write — exactly-one is a schema rule).
  const [makeStarter, setMakeStarter] = useState(false);
  // The map's sites (region) / venues (town), edited with the SITES tool.
  const [sites, setSites] = useState<EditorSite[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  // Armed by the MOVE button: the next cell click relocates the selected
  // site instead of creating a new one.
  const [moveArmed, setMoveArmed] = useState(false);
  // Region painter only: the campaign's town ids, for the site townId
  // picker — kept fresh by the hosted TOWNS panel below (onMaps fires on
  // load and after every create).
  const [townIds, setTownIds] = useState<string[]>([]);
  // The campaign's room ids, for the venue / local-site ENTRY ROOM picker.
  // Town pages get them live from the hosted ROOMS panel; region pages
  // fetch them once (their hosted panel is TOWNS).
  const [roomOptions, setRoomOptions] = useState<string[]>([]);
  // room id → painted grid cell count, kept fresh by the same hosted ROOMS
  // panel that feeds `roomOptions`. The encounter-zone ARENA picker shows each
  // room's combat-grid size (clamped, as combat derives it) next to its id.
  const [roomDims, setRoomDims] = useState<Record<string, { w: number; h: number }>>({});
  // Rooms only: enemy placements ({template name, count}) + the bestiary
  // names that feed the picker (ambient catalog + campaign customs).
  const [placedEnemies, setPlacedEnemies] = useState<Array<{ name: string; count: number }>>([]);
  const [monsterNames, setMonsterNames] = useState<string[]>([]);
  // Creature name → Challenge Rating, for filtering a zone's picker to its tier.
  const [monsterCr, setMonsterCr] = useState<Record<string, number>>({});
  // Region painted encounter zones + the currently-selected zone for the paint
  // tool (its id, or null = the eraser, which clears a cell's zone).
  const [zones, setZones] = useState<EditorEncounterZone[]>([]);
  const [activeZoneId, setActiveZoneId] = useState<string | null>(null);
  // Rooms only: loot placements ({item id, optional grid pos}) + the item
  // options that feed the picker (id + display name).
  const [placedLoot, setPlacedLoot] = useState<
    Array<{ itemId: string; pos?: { x: number; y: number } }>
  >([]);
  const [itemOptions, setItemOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [questOptions, setQuestOptions] = useState<Array<{ id: string; title: string }>>([]);
  const [factionOptions, setFactionOptions] = useState<Array<{ id: string; name: string }>>([]);
  // Which NPC's dialogue tree is expanded in the NPCS card (index or null).
  const [dialogueOpen, setDialogueOpen] = useState<number | null>(null);
  // Rooms only: bespoke placed NPCs.
  const [placedNpcs, setPlacedNpcs] = useState<EditorNpc[]>([]);
  // Rooms only: searchable/interactable objects + the (single) trap.
  const [placedObjects, setPlacedObjects] = useState<EditorObject[]>([]);
  const [trapDraft, setTrapDraft] = useState<EditorTrap | null>(null);
  // Armed by a loot/NPC/object row's PLACE button: the next grid click
  // drops that row's token on the clicked cell.
  const [placeArm, setPlaceArm] = useState<{ kind: 'loot' | 'npc' | 'object'; idx: number } | null>(
    null
  );
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const [tool, setTool] = useState<Tool>('terrain');
  // '' = the clear brush (rooms: erase the cosmetic paint back to bare floor).
  const [terrainBrush, setTerrainBrush] = useState<string>('plains');
  // Rooms only: the mechanical-flag brush ('' = clear the flag).
  const [mechBrush, setMechBrush] = useState<string>('obstacle');
  // Rooms only: SRD short-rest spot.
  const [canRest, setCanRest] = useState(false);
  const [painting, setPainting] = useState(false);

  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const region = regions?.find((r) => r.id === regionId) ?? null;
  const activeZone = zones.find((z) => z.id === activeZoneId) ?? null;

  useEffect(() => {
    // The painter can navigate map→map without unmounting (region page →
    // its TOWNS panel → town painter) — clear the previous map's
    // transient state before loading the next.
    setLoadErr(null);
    setError(null);
    setDirty(false);
    setSaved(false);
    setTool('terrain');
    setTerrainBrush('plains');
    api
      .getCampaignSection(campaignId, section)
      .then((s) => {
        const list = Array.isArray(s.value) ? (s.value as EditorRegion[]) : [];
        setRegions(list);
        const r = list.find((x) => x.id === regionId);
        if (!r) {
          setLoadErr(
            list.length === 0
              ? `This campaign has no ${section} yet — define one in the ${section.toUpperCase()} section first.`
              : `No ${kind} "${regionId}" in this campaign.`
          );
          return;
        }
        // Sanitize cells on load: keep only the live keys (t / ez / m), stripping
        // the retired `tier` / `enc` keys legacy grids may still carry so a
        // re-save validates against the now-strict cell schema.
        setGrid(
          r.grid.map((row) =>
            row.map((c) => {
              const cc = c as Cell & { tier?: unknown; enc?: unknown };
              const cell: Cell = {};
              if (cc.t !== undefined) cell.t = cc.t;
              if (cc.ez !== undefined) cell.ez = cc.ez;
              if (cc.m !== undefined) cell.m = cc.m;
              return cell;
            })
          )
        );
        const marker = (kind === 'room' ? r.entryPos : r.startPos) ?? { x: 0, y: 0 };
        setStartPos({ ...marker });
        setDetails(detailsFrom(r));
        setMakeStarter(false);
        setCanRest(!!r.canRest);
        setZones(
          (r.encounterZones ?? []).map((z) => ({ ...z, encounterTable: [...z.encounterTable] }))
        );
        setActiveZoneId(r.encounterZones?.[0]?.id ?? null);
        setSites(
          kind === 'room'
            ? exitsToSites(r.exits)
            : ((kind === 'region' ? r.sites : r.venues) ?? []).map((s) => ({ ...s }))
        );
        setPlacedEnemies((r.enemies ?? []).map((e) => ({ name: e.name, count: e.count ?? 1 })));
        setPlacedLoot((r.loot ?? []).map((l) => ({ ...l })));
        setPlacedNpcs((r.npcs ?? []).map((n) => ({ ...n })));
        setPlacedObjects((r.objects ?? []).map((o) => ({ ...o })));
        setTrapDraft(r.trap ? { ...r.trap } : null);
        setPlaceArm(null);
        setSelectedSiteId(null);
        setMoveArmed(false);
      })
      .catch(() => setLoadErr('Could not load this campaign’s regions.'));
    // Room pages need the bestiary names (enemy picker) and the item list
    // (loot picker); region pages need the bestiary too (the wilderness
    // ENCOUNTER TABLE picker). Ambient SRD catalogs + the campaign's customs.
    if (kind === 'room' || kind === 'region') {
      Promise.all([
        api.getMonsterCatalog().catch(() => []),
        api
          .getCampaignSection(campaignId, 'customMonsters')
          .catch(() => ({ value: null }) as { value: unknown }),
      ]).then(([catalog, customs]) => {
        // Build name → CR alongside the name list so a zone's picker can filter
        // the bestiary to its tier. Customs shadow the catalog by name.
        const crByName: Record<string, number> = {};
        for (const c of catalog) {
          const def = c.definition;
          if (def?.name) crByName[def.name] = typeof def.cr === 'number' ? def.cr : 0;
        }
        const customDefs = Array.isArray(customs.value)
          ? (customs.value as Array<{ name?: unknown; cr?: unknown }>)
          : [];
        for (const c of customDefs) {
          if (typeof c.name === 'string') crByName[c.name] = typeof c.cr === 'number' ? c.cr : 0;
        }
        const customNames = customDefs
          .map((c) => c.name)
          .filter((n): n is string => typeof n === 'string');
        const catalogNames = catalog
          .map((c) => c.definition?.name)
          .filter((n): n is string => typeof n === 'string');
        setMonsterNames([...new Set([...customNames, ...catalogNames])]);
        setMonsterCr(crByName);
      });
      Promise.all([
        api.getItemCatalog().catch(() => []),
        api
          .getCampaignSection(campaignId, 'customItems')
          .catch(() => ({ value: null }) as { value: unknown }),
      ]).then(([catalog, customs]) => {
        const customItems = Array.isArray(customs.value)
          ? (customs.value as Array<{ id?: unknown; name?: unknown }>).filter(
              (c): c is { id: string; name: string } =>
                typeof c.id === 'string' && typeof c.name === 'string'
            )
          : [];
        const seen = new Set(customItems.map((c) => c.id));
        const catalogItems = catalog.filter((c) => !seen.has(c.id));
        setItemOptions([...customItems, ...catalogItems]);
      });
      // Dialogue editor pickers: the campaign's quests (START QUEST effect,
      // quest-state conditions) and factions (tier conditions). Either list
      // may simply not exist yet — both default to empty.
      api
        .getCampaignSection(campaignId, 'quests')
        .then((s) => {
          const list = Array.isArray(s.value)
            ? (s.value as Array<{ id?: unknown; title?: unknown }>).filter(
                (q): q is { id: string; title: string } =>
                  typeof q.id === 'string' && typeof q.title === 'string'
              )
            : [];
          setQuestOptions(list.map((q) => ({ id: q.id, title: q.title })));
        })
        .catch(() => setQuestOptions([]));
      api
        .getCampaignSection(campaignId, 'factions')
        .then((s) => {
          const list = Array.isArray(s.value)
            ? (s.value as Array<{ id?: unknown; name?: unknown }>).filter(
                (f): f is { id: string; name: string } =>
                  typeof f.id === 'string' && typeof f.name === 'string'
              )
            : [];
          setFactionOptions(list.map((f) => ({ id: f.id, name: f.name })));
        })
        .catch(() => setFactionOptions([]));
    }
    // (Region pages used to one-shot-fetch the room pool here for the
    // local-site ENTRY ROOM picker; their hosted ROOMS panel feeds it live
    // now, same as town pages.)
  }, [campaignId, regionId, section, kind]);

  // Drag-paint ends wherever the mouse is released.
  useEffect(() => {
    const stop = () => setPainting(false);
    window.addEventListener('mouseup', stop);
    return () => window.removeEventListener('mouseup', stop);
  }, []);

  const applyTool = useCallback(
    (x: number, y: number) => {
      setSaved(false);
      // An armed loot/NPC/object PLACE wins the next click regardless of tool.
      if (placeArm !== null) {
        if (placeArm.kind === 'loot') {
          setPlacedLoot((prev) =>
            prev.map((l, i) => (i === placeArm.idx ? { ...l, pos: { x, y } } : l))
          );
        } else if (placeArm.kind === 'npc') {
          setPlacedNpcs((prev) =>
            prev.map((n, i) => (i === placeArm.idx ? { ...n, pos: { x, y } } : n))
          );
        } else {
          setPlacedObjects((prev) =>
            prev.map((o, i) => (i === placeArm.idx ? { ...o, pos: { x, y } } : o))
          );
        }
        setPlaceArm(null);
        setDirty(true);
        return;
      }
      if (tool === 'start') {
        setStartPos({ x, y });
        setDirty(true);
        return;
      }
      if (tool === 'site') {
        // Click a marker → select it. Click an empty cell → move the
        // selected site there (when MOVE is armed) or place a new one.
        const hit = sites.find((s) => s.pos.x === x && s.pos.y === y);
        if (hit) {
          setSelectedSiteId(hit.id);
          setMoveArmed(false);
          return;
        }
        if (moveArmed && selectedSiteId) {
          setSites((prev) =>
            prev.map((s) => (s.id === selectedSiteId ? { ...s, pos: { x, y } } : s))
          );
          setMoveArmed(false);
          setDirty(true);
          return;
        }
        const n = sites.length + 1;
        let id = `${kind === 'region' ? 'site' : kind === 'town' ? 'venue' : 'exit'}-${n}`;
        while (sites.some((s) => s.id === id)) id += 'x';
        const draft: EditorSite =
          kind === 'region'
            ? { id, name: 'New Site', pos: { x, y }, kind: 'local' }
            : kind === 'town'
              ? { id, name: 'New Venue', pos: { x, y }, kind: 'interior' }
              : // A fresh exit defaults to ascend — valid standalone (a room
                // exit needs a TO ROOM target before it can save).
                { id, name: 'Exit', pos: { x, y }, kind: 'ascend' };
        setSites((prev) => [...prev, draft]);
        setSelectedSiteId(id);
        setDirty(true);
        return;
      }
      setGrid((prev) => {
        const next = prev.map((row) => row.slice());
        const cell = { ...next[y][x] };
        if (tool === 'terrain') {
          if ((cell.t ?? '') === terrainBrush) return prev;
          if (terrainBrush === '')
            delete cell.t; // rooms: back to bare floor
          else cell.t = terrainBrush;
        } else if (tool === 'mech') {
          if ((cell.m ?? '') === mechBrush) return prev;
          if (mechBrush === '') delete cell.m;
          else cell.m = mechBrush;
        } else if (tool === 'zone') {
          // Paint the active zone onto the cell — a repaint reassigns it (one
          // `ez` per cell ⇒ zones never overlap). A null active zone erases.
          const target = activeZoneId ?? undefined;
          if ((cell.ez ?? undefined) === target) return prev;
          if (target === undefined) delete cell.ez;
          else cell.ez = target;
        }
        next[y] = next[y].slice();
        next[y][x] = cell;
        return next;
      });
      setDirty(true);
    },
    [tool, terrainBrush, mechBrush, activeZoneId, sites, selectedSiteId, moveArmed, kind, placeArm]
  );

  // Patch the selected site; clearing a kind's target also clears the
  // other kind's leftover (flipping town↔local shouldn't strand a stale id).
  function updateSite(id: string, patch: Partial<EditorSite>) {
    setSites((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        const next = { ...s, ...patch };
        if (patch.kind === 'town') {
          delete next.entryRoomId;
          delete next.regionId;
        }
        if (patch.kind === 'local' || patch.kind === 'interior' || patch.kind === 'gate') {
          delete next.townId;
          delete next.regionId;
        }
        if (patch.kind === 'region') {
          delete next.townId;
          delete next.entryRoomId;
        }
        if (patch.kind === 'ascend') delete next.toRoomId;
        return next;
      })
    );
    setDirty(true);
    setSaved(false);
  }

  function deleteSite(id: string) {
    setSites((prev) => prev.filter((s) => s.id !== id));
    if (selectedSiteId === id) setSelectedSiteId(null);
    setMoveArmed(false);
    setDirty(true);
    setSaved(false);
  }

  function resize(newW: number, newH: number) {
    const w = Math.max(1, Math.min(200, newW));
    const h = Math.max(1, Math.min(200, newH));
    setGrid((prev) => {
      const next: Cell[][] = [];
      for (let y = 0; y < h; y++) {
        const row: Cell[] = [];
        for (let x = 0; x < w; x++) {
          // New cells: bare floor for rooms ({}), plains elsewhere.
          row.push(prev[y]?.[x] ? { ...prev[y][x] } : kind === 'room' ? {} : { t: 'plains' });
        }
        next.push(row);
      }
      return next;
    });
    setStartPos((p) => ({ x: Math.min(p.x, w - 1), y: Math.min(p.y, h - 1) }));
    // Clamp markers too — a shrink must not strand a site off-grid (the
    // schema bounds-checks positions on save).
    setSites((prev) =>
      prev.map((s) => ({
        ...s,
        pos: { x: Math.min(s.pos.x, w - 1), y: Math.min(s.pos.y, h - 1) },
      }))
    );
    setPlacedLoot((prev) =>
      prev.map((l) =>
        l.pos ? { ...l, pos: { x: Math.min(l.pos.x, w - 1), y: Math.min(l.pos.y, h - 1) } } : l
      )
    );
    setPlacedNpcs((prev) =>
      prev.map((n) =>
        n.pos ? { ...n, pos: { x: Math.min(n.pos.x, w - 1), y: Math.min(n.pos.y, h - 1) } } : n
      )
    );
    setPlacedObjects((prev) =>
      prev.map((o) =>
        o.pos ? { ...o, pos: { x: Math.min(o.pos.x, w - 1), y: Math.min(o.pos.y, h - 1) } } : o
      )
    );
    setDirty(true);
    setSaved(false);
  }

  // Fold the edited sites/venues back in: optional fields prune when empty
  // ('' would fail the SLUG/min-length schemas); an empty list drops the key.
  // Rooms map their markers back to the exit shape (no ids, label/ascends).
  function mergeSites(next: EditorRegion) {
    if (kind === 'room') {
      const exits: EditorExit[] = sites.map((s) => ({
        pos: s.pos,
        ...(s.kind === 'ascend' ? { ascends: true } : { toRoomId: s.toRoomId }),
        ...(s.name.trim() ? { label: s.name.trim() } : {}),
        ...(s.entrancePos ? { entrancePos: s.entrancePos } : {}),
      }));
      if (exits.length > 0) next.exits = exits;
      else delete next.exits;
      return;
    }
    const cleaned = sites.map((s) => {
      const c: EditorSite = { ...s };
      // onEnter is a variant pool — prune blank variants; drop the hook if empty.
      if (Array.isArray(c.onEnter)) {
        const vs = c.onEnter.map((x) => x.trim()).filter(Boolean);
        if (vs.length) c.onEnter = vs;
        else delete c.onEnter;
      }
      for (const k of ['townId', 'entryRoomId', 'regionId', 'desc', 'onEnter', 'icon'] as const) {
        if (!c[k]) delete c[k];
      }
      return c;
    });
    const key = kind === 'region' ? 'sites' : 'venues';
    if (cleaned.length > 0) next[key] = cleaned;
    else delete next[key];
  }

  // Fold the details form back into the region: '' clears an optional
  // field, numbers parse client-side (the server re-validates shapes).
  function mergeDetails(r: EditorRegion): EditorRegion | { error: string } {
    const next: EditorRegion =
      kind === 'room' ? { ...r, grid, entryPos: startPos } : { ...r, grid, startPos };
    if (kind === 'room' && sites.some((s) => s.kind === 'room' && !s.toRoomId)) {
      return { error: 'Every room exit needs a TO ROOM target (or flip it to LEAVE).' };
    }
    if (kind === 'room' && placedEnemies.some((e) => !e.name)) {
      return { error: 'Every enemy placement needs a creature picked.' };
    }
    if (kind === 'room' && placedLoot.some((l) => !l.itemId)) {
      return { error: 'Every loot placement needs an item picked.' };
    }
    if (kind === 'room' && placedNpcs.some((n) => !n.name.trim() || !pruneVariants(n.greeting))) {
      return { error: 'Every NPC needs a name and a greeting.' };
    }
    if (
      kind === 'room' &&
      placedNpcs.some((n) => (n.shop ?? []).some((w) => !w.itemId || w.price < 0))
    ) {
      return { error: 'Every shop ware needs an item and a non-negative price.' };
    }
    // Dialogue trees: every node needs a player line; a check node needs both
    // outcome replies. Walked recursively across every NPC.
    if (kind === 'room') {
      const badNode = (nodes: DialogueNode[] | undefined): string | null => {
        for (const node of nodes ?? []) {
          if (!node.label.trim()) return 'Every dialogue option needs a PLAYER LINE.';
          if (node.check && (!node.check.successReply.trim() || !node.check.failReply.trim())) {
            return 'Every dialogue CHECK needs both outcome replies.';
          }
          const deeper = badNode(node.responses);
          if (deeper) return deeper;
        }
        return null;
      };
      for (const n of placedNpcs) {
        const err = badNode(n.responses);
        if (err) return { error: err };
      }
    }
    if (kind === 'room' && placedObjects.some((o) => !o.name.trim())) {
      return { error: 'Every object needs a name.' };
    }
    if (
      kind === 'room' &&
      trapDraft &&
      (!trapDraft.name.trim() || !trapDraft.damage.trim() || !trapDraft.damageType)
    ) {
      return { error: 'The trap needs a name, damage dice and a damage type.' };
    }
    if (kind === 'town' && sites.some((s) => s.kind === 'interior' && !s.entryRoomId)) {
      return { error: 'Every interior venue needs an ENTRY ROOM (or flip it to GATE).' };
    }
    if (kind === 'region' && sites.some((s) => s.kind === 'local' && !s.entryRoomId)) {
      return { error: 'Every local site needs an ENTRY ROOM (or flip it to TOWN).' };
    }
    if (kind === 'region' && sites.some((s) => s.kind === 'town' && !s.townId)) {
      return { error: 'Every town site needs a TOWN target (or flip it to LOCAL).' };
    }
    if (kind === 'region' && sites.some((s) => s.kind === 'region' && !s.regionId)) {
      return { error: 'Every region gate needs a TO REGION target.' };
    }
    mergeSites(next);
    next.name = details.name.trim() || r.name;
    if (kind === 'room' && !details.desc.trim()) {
      return { error: 'DESCRIPTION is required for rooms.' };
    }
    if (details.desc.trim()) next.desc = details.desc.trim();
    else delete next.desc;
    if (kind === 'room') {
      // Rooms are LOCKED to the SRD 5-ft tactical scale (combat math assumes
      // it) — no scale key is stored and the form doesn't offer the field.
      delete next.feetPerSquare;
    } else {
      const fps = Number(details.feetPerSquare);
      if (!Number.isFinite(fps) || fps <= 0) {
        return { error: 'FEET PER SQUARE must be a positive number.' };
      }
      next.feetPerSquare = fps;
    }
    // Level narration hooks — each a VARIANT POOL (engine picks one; multi-
    // paragraph = newlines within a variant). Prune blank variants; an empty
    // pool drops the hook. A 1-variant pool serializes as an array; the server
    // collapses it to a single string on read.
    for (const key of HOOK_KEYS) {
      const variants = details[key].map((v) => v.trim()).filter(Boolean);
      if (variants.length) next[key] = variants;
      else delete next[key];
    }
    if (kind === 'region') {
      // Encounter zones are the SOLE encounter source (tier + chance + table;
      // the cells' `ez` tags carry the geometry).
      if (zones.length > 0) {
        next.encounterZones = zones.map((z) => {
          const arenaRooms = pruneArenaRooms(z.arenaRooms);
          return {
            id: z.id,
            name: z.name,
            tier: z.tier,
            encounterChance: z.encounterChance,
            ...(z.encounterTable.length > 0 ? { encounterTable: z.encounterTable } : {}),
            // Battleground arena rooms per triggering-square terrain (empty
            // lists pruned away — they behave like the default arena).
            ...(arenaRooms ? { arenaRooms } : {}),
          };
        }) as EditorEncounterZone[];
      } else {
        delete next.encounterZones;
      }
      if (makeStarter) next.isStartingRegion = true;
    } else {
      if (details.floor === '') delete next.floor;
      else next.floor = details.floor;
      if (kind === 'room') {
        // BRIGHT is the engine default — save it as an omitted key so the
        // stored JSON stays minimal (round-trips back to BRIGHT in the form).
        if (details.lighting === 'bright' || details.lighting === '') delete next.lighting;
        else next.lighting = details.lighting;
        if (canRest) next.canRest = true;
        else delete next.canRest;
        if (placedEnemies.length > 0) {
          next.enemies = placedEnemies.map((e) => ({
            name: e.name,
            ...(e.count > 1 ? { count: e.count } : {}),
          }));
        } else {
          delete next.enemies;
        }
        if (placedLoot.length > 0) {
          next.loot = placedLoot.map((l) => ({
            itemId: l.itemId,
            ...(l.pos ? { pos: l.pos } : {}),
          }));
        } else {
          delete next.loot;
        }
        if (placedNpcs.length > 0) {
          // Preserve JSON-authored extras (dialogue / shop / stat block);
          // prune the painter-managed optionals when emptied.
          next.npcs = placedNpcs.map((n) => {
            const c: EditorNpc = { ...n, name: n.name.trim() };
            if (!c.icon) delete c.icon;
            if (!c.pos) delete c.pos;
            // Greeting/goodbye are variant pools — prune blank variants. greeting
            // is required (validated above), so it always survives.
            c.greeting = pruneVariants(n.greeting) ?? [];
            for (const k of ['firstGreeting', 'goodbye', 'firstGoodbye'] as const) {
              const vs = pruneVariants(c[k] as string | string[] | undefined);
              if (vs) c[k] = vs;
              else delete c[k];
            }
            if (!c.responses || c.responses.length === 0) delete c.responses;
            if (!c.shop || c.shop.length === 0) delete c.shop;
            else
              c.shop = c.shop.map((w) =>
                w.qty === undefined ? { itemId: w.itemId, price: w.price } : w
              );
            if (c.shopGold === undefined) delete c.shopGold;
            if (!c.factionId) delete c.factionId;
            return c;
          });
        } else {
          delete next.npcs;
        }
        if (placedObjects.length > 0) {
          next.objects = placedObjects.map((o) => {
            const c: EditorObject = { ...o, name: o.name.trim() };
            // Narrative hooks are variant pools — prune blank variants; an empty
            // pool drops the key (the schema rejects empties / the engine defaults).
            for (const k of ['desc', 'interactText', 'foundText', 'emptyText'] as const) {
              const vs = pruneVariants(c[k] as string | string[] | undefined);
              if (vs) c[k] = vs;
              else delete c[k];
            }
            if (c.searchDC === undefined) delete c.searchDC;
            if (!c.lootIds || c.lootIds.length === 0) delete c.lootIds;
            if (!c.pos) delete c.pos;
            return c;
          });
        } else {
          delete next.objects;
        }
        if (trapDraft) {
          const t: EditorTrap = { ...trapDraft, name: trapDraft.name.trim() };
          if (!t.condition) delete t.condition;
          for (const k of [
            'detectNarrative',
            'triggerNarrative',
            'disarmSuccess',
            'disarmFail',
          ] as const) {
            const vs = pruneVariants(t[k] as string | string[] | undefined);
            if (vs) t[k] = vs;
            else delete t[k];
          }
          next.trap = t;
        } else {
          delete next.trap;
        }
      }
    }
    return next;
  }

  async function handleSave() {
    if (!regions || !region || busy) return;
    const merged = mergeDetails(region);
    if ('error' in merged && typeof merged.error === 'string') {
      setError(merged.error);
      return;
    }
    setBusy(true);
    setError(null);
    setSaved(false);
    const updated = regions.map((r) => {
      if (r.id === regionId) return merged as EditorRegion;
      // Exactly one starting region: claiming the flag releases it elsewhere.
      return makeStarter && kind === 'region' ? { ...r, isStartingRegion: false } : r;
    });
    try {
      await api.putCampaignSection(campaignId, section, updated);
      setRegions(updated);
      setMakeStarter(false);
      setDirty(false);
      setSaved(true);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  // Scalar (string-valued) detail fields; the four narration hooks are variant
  // lists, updated via updateHook.
  function updateDetail(
    key: 'name' | 'desc' | 'feetPerSquare' | 'floor' | 'lighting',
    value: string
  ) {
    setDetails((d) => ({ ...d, [key]: value }));
    setDirty(true);
    setSaved(false);
  }

  function updateHook(key: HookKey, variants: string[]) {
    setDetails((d) => ({ ...d, [key]: variants }));
    setDirty(true);
    setSaved(false);
  }

  const height = grid.length;
  const width = grid[0]?.length ?? 0;
  // Markers render from the EDITED sites state (not the saved region), so
  // placements show immediately.
  const siteAt = (x: number, y: number) => sites.find((s) => s.pos.x === x && s.pos.y === y);
  const selectedSite = sites.find((s) => s.id === selectedSiteId) ?? null;
  const markerNoun = kind === 'region' ? 'SITE' : kind === 'town' ? 'VENUE' : 'EXIT';
  // Positioned loot tokens (rooms) — rendered as $ on the grid.
  const lootAt = (x: number, y: number) =>
    placedLoot.find((l) => l.pos && l.pos.x === x && l.pos.y === y);
  const itemName = (id: string) => itemOptions.find((o) => o.id === id)?.name ?? id;
  // Positioned NPC tokens (rooms) — rendered as ☺ on the grid.
  const npcAt = (x: number, y: number) =>
    placedNpcs.find((n) => n.pos && n.pos.x === x && n.pos.y === y);
  // Positioned object tokens (rooms) — rendered as ▣ on the grid.
  const objectAt = (x: number, y: number) =>
    placedObjects.find((o) => o.pos && o.pos.x === x && o.pos.y === y);
  const defaultScale = kind === 'region' ? 5280 : kind === 'town' ? 25 : 5;
  // Exit targets for the room form: every room in the section.
  const roomIds = kind === 'room' ? (regions ?? []).map((r) => r.id) : [];
  // Label a room for the ARENA picker as `id (W×H)`, where W×H is the combat
  // grid the fight will actually use — the room's painted cell count clamped to
  // the combat range, exactly as gameEngine.combatGridDims derives it. Falls
  // back to the bare id until the hosted ROOMS panel reports its dims.
  const roomSizeLabel = (id: string): string => {
    const d = roomDims[id];
    return d ? `${id} (${clampCombatDim(d.w)}×${clampCombatDim(d.h)})` : id;
  };

  return (
    <div className={styles.pageFlex}>
      <div className={styles.sessionsInner}>
        <div className={styles.sessionsHeader}>
          <div>
            {breadcrumbBase ? (
              <Breadcrumb crumbs={[...breadcrumbBase, { label: region?.name ?? regionId }]} />
            ) : (
              <h1 className={styles.title} style={{ fontSize: '1.1rem', marginBottom: 4 }}>
                {kind.toUpperCase()} MAP — {(region?.name ?? regionId).toUpperCase()}
              </h1>
            )}
            <p className={styles.sub}>
              {kind.toUpperCase()} MAP · {width}×{height} · 1 SQUARE ={' '}
              {String(region?.feetPerSquare ?? defaultScale)} FT
              {dirty && <span style={{ color: 'var(--t-hp-mid)' }}> · UNSAVED</span>}
            </p>
          </div>
          <div className={styles.sessionsActions}>
            <button
              className={styles.submit}
              style={{ marginTop: 0, width: 'auto', padding: '0.5rem 1.25rem' }}
              disabled={busy || !dirty || !region}
              onClick={handleSave}
            >
              SAVE
            </button>
            <button
              className={styles.ghostBtn}
              onClick={() => {
                if (dirty && !confirm('Discard unsaved map changes?')) return;
                onBack();
              }}
            >
              BACK
            </button>
          </div>
        </div>

        {loadErr && (
          <div className={styles.card} role="alert" style={{ color: 'var(--t-hp-low)' }}>
            {loadErr}
          </div>
        )}

        {region && (
          <>
            {/* ── Tools ─────────────────────────────────────────────────── */}
            <div className={styles.card} style={{ marginBottom: '1rem' }}>
              <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                <div>
                  <p className={styles.formLbl}>TOOL</p>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {(
                      [
                        ['terrain', 'TERRAIN'],
                        ...(kind === 'region' ? [['zone', 'ENC. ZONES'] as [Tool, string]] : []),
                        ...(kind === 'room' ? [['mech', 'MECHANICS'] as [Tool, string]] : []),
                        ['start', kind === 'room' ? 'ENTRY POS' : 'START POS'],
                        ['site', `${markerNoun}S`],
                        ['size', 'SIZE'],
                      ] as Array<[Tool, string]>
                    ).map(([t, label]) => (
                      <button
                        key={t}
                        className={styles.ghostBtn}
                        aria-pressed={tool === t}
                        style={{
                          padding: '0.25rem 0.6rem',
                          fontSize: '0.7rem',
                          borderColor: tool === t ? 'var(--t-primary)' : undefined,
                        }}
                        onClick={() => setTool(t)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {tool === 'terrain' &&
                  (() => {
                    const brushBtn = (t: TerrainType) => (
                      <button
                        key={t}
                        aria-pressed={terrainBrush === t}
                        title={`${TERRAIN[t].label}${TERRAIN[t].passable ? '' : ' (impassable)'} · travel ×${TERRAIN[t].travelMult} · encounters ×${TERRAIN[t].encounterMult}`}
                        style={{
                          padding: '0.25rem 0.55rem',
                          fontSize: '0.7rem',
                          letterSpacing: '0.04em',
                          fontFamily: 'inherit',
                          cursor: 'pointer',
                          background: terrainBrush === t ? 'var(--t-separator)' : 'transparent',
                          border: `1px solid ${terrainBrush === t ? 'var(--t-primary)' : 'var(--t-border)'}`,
                          color: terrainBrush === t ? 'var(--t-primary)' : 'var(--t-dim)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                        onClick={() => setTerrainBrush(t)}
                      >
                        <span
                          aria-hidden="true"
                          style={{
                            width: 12,
                            height: 12,
                            display: 'inline-block',
                            background: TERRAIN_COLORS[t],
                            border: '1px solid rgba(0,0,0,0.4)',
                          }}
                        />
                        {TERRAIN[t].label.toUpperCase()}
                      </button>
                    );
                    return (
                      <div>
                        <p className={styles.formLbl}>
                          TERRAIN{kind === 'room' ? ' (COSMETIC PAINT OVER THE FLOOR)' : ''}
                        </p>
                        <p className={styles.formLbl} style={{ color: 'var(--t-dim)' }}>
                          REGIONAL
                        </p>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                          {REGIONAL_TERRAINS.map(brushBtn)}
                        </div>
                        <p className={styles.formLbl} style={{ color: 'var(--t-dim)' }}>
                          TOWN / LOCAL
                        </p>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {kind === 'room' && (
                            <button
                              aria-pressed={terrainBrush === ''}
                              className={styles.ghostBtn}
                              style={{
                                padding: '0.25rem 0.6rem',
                                fontSize: '0.7rem',
                                borderColor: terrainBrush === '' ? 'var(--t-primary)' : undefined,
                              }}
                              onClick={() => setTerrainBrush('')}
                            >
                              NONE (FLOOR)
                            </button>
                          )}
                          {LOCAL_TERRAINS.map(brushBtn)}
                        </div>
                      </div>
                    );
                  })()}

                {tool === 'zone' && (
                  <div>
                    <p className={styles.formLbl}>
                      ENCOUNTER ZONES (PAINT NON-OVERLAPPING AREAS; EACH ROLLS ITS OWN CREATURES)
                    </p>
                    <div
                      style={{
                        display: 'flex',
                        gap: 6,
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        marginBottom: 8,
                      }}
                    >
                      {zones.map((z) => (
                        <button
                          key={z.id}
                          className={styles.ghostBtn}
                          aria-pressed={activeZoneId === z.id}
                          style={{
                            padding: '0.25rem 0.6rem',
                            fontSize: '0.7rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            borderColor: activeZoneId === z.id ? 'var(--t-primary)' : undefined,
                          }}
                          onClick={() => setActiveZoneId(z.id)}
                        >
                          <span
                            aria-hidden="true"
                            style={{
                              width: 12,
                              height: 12,
                              display: 'inline-block',
                              background: zoneColor(zones, z.id),
                              border: '1px solid rgba(0,0,0,0.4)',
                            }}
                          />
                          {z.name}
                        </button>
                      ))}
                      <button
                        className={styles.ghostBtn}
                        aria-pressed={activeZoneId === null}
                        title="Erase a cell's zone"
                        style={{
                          padding: '0.25rem 0.6rem',
                          fontSize: '0.7rem',
                          borderColor: activeZoneId === null ? 'var(--t-primary)' : undefined,
                        }}
                        onClick={() => setActiveZoneId(null)}
                      >
                        ERASER
                      </button>
                      <button
                        className={styles.ghostBtn}
                        style={{ padding: '0.25rem 0.6rem', fontSize: '0.7rem' }}
                        onClick={() => {
                          const used = new Set(zones.map((z) => z.id));
                          let n = zones.length + 1;
                          let id = `zone-${n}`;
                          while (used.has(id)) id = `zone-${++n}`;
                          setZones((prev) => [
                            ...prev,
                            {
                              id,
                              name: `Zone ${n}`,
                              tier: 1,
                              encounterChance: 0.1,
                              encounterTable: [],
                            },
                          ]);
                          setActiveZoneId(id);
                          setDirty(true);
                          setSaved(false);
                        }}
                      >
                        + NEW ZONE
                      </button>
                    </div>
                    {activeZone && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div
                          style={{
                            display: 'flex',
                            gap: 12,
                            flexWrap: 'wrap',
                            alignItems: 'flex-end',
                          }}
                        >
                          <div>
                            <label className={styles.formLbl} htmlFor="zone-name">
                              ZONE NAME
                            </label>
                            <input
                              id="zone-name"
                              className={styles.formInp}
                              value={activeZone.name}
                              onChange={(e) => {
                                const v = e.target.value;
                                setZones((prev) =>
                                  prev.map((z) => (z.id === activeZone.id ? { ...z, name: v } : z))
                                );
                                setDirty(true);
                                setSaved(false);
                              }}
                            />
                          </div>
                          <div style={{ flex: '0 0 90px' }}>
                            <label className={styles.formLbl} htmlFor="zone-tier">
                              TIER
                            </label>
                            <select
                              id="zone-tier"
                              className={styles.formInp}
                              style={{ cursor: 'pointer' }}
                              value={String(activeZone.tier)}
                              onChange={(e) => {
                                const t = Number(e.target.value);
                                setZones((prev) =>
                                  prev.map((z) => (z.id === activeZone.id ? { ...z, tier: t } : z))
                                );
                                setDirty(true);
                                setSaved(false);
                              }}
                            >
                              {[1, 2, 3, 4].map((t) => (
                                <option key={t} value={String(t)}>
                                  TIER {t}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div style={{ flex: '0 0 110px' }}>
                            <label className={styles.formLbl} htmlFor="zone-chance">
                              CHANCE (0–1)
                            </label>
                            <input
                              id="zone-chance"
                              className={styles.formInp}
                              type="number"
                              min={0}
                              max={1}
                              step={0.05}
                              value={activeZone.encounterChance}
                              onChange={(e) => {
                                const v = Math.max(0, Math.min(1, Number(e.target.value) || 0));
                                setZones((prev) =>
                                  prev.map((z) =>
                                    z.id === activeZone.id ? { ...z, encounterChance: v } : z
                                  )
                                );
                                setDirty(true);
                                setSaved(false);
                              }}
                            />
                          </div>
                          <button
                            className={styles.ghostBtn}
                            style={{
                              padding: '0.25rem 0.6rem',
                              fontSize: '0.7rem',
                              color: 'var(--t-hp-low)',
                            }}
                            title="Delete this zone and clear its painted cells"
                            onClick={() => {
                              const id = activeZone.id;
                              setGrid((prev) =>
                                prev.map((row) =>
                                  row.map((c) => {
                                    if (c.ez !== id) return c;
                                    const nextCell = { ...c };
                                    delete nextCell.ez;
                                    return nextCell;
                                  })
                                )
                              );
                              setZones((prev) => prev.filter((z) => z.id !== id));
                              setActiveZoneId((cur) => (cur === id ? null : cur));
                              setDirty(true);
                              setSaved(false);
                            }}
                          >
                            DELETE ZONE
                          </button>
                        </div>
                        <div>
                          <p className={styles.formLbl}>
                            ENCOUNTER TABLE (blank = use the region table)
                          </p>
                          <div
                            style={{
                              display: 'flex',
                              gap: 6,
                              alignItems: 'center',
                              flexWrap: 'wrap',
                            }}
                          >
                            {activeZone.encounterTable.map((name) => (
                              <button
                                key={name}
                                className={styles.ghostBtn}
                                style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem' }}
                                title="Remove from this zone's table"
                                onClick={() => {
                                  setZones((prev) =>
                                    prev.map((z) =>
                                      z.id === activeZone.id
                                        ? {
                                            ...z,
                                            encounterTable: z.encounterTable.filter(
                                              (nm) => nm !== name
                                            ),
                                          }
                                        : z
                                    )
                                  );
                                  setDirty(true);
                                  setSaved(false);
                                }}
                              >
                                {name} ✕
                              </button>
                            ))}
                            <select
                              className={styles.formInp}
                              style={{ width: 'auto', cursor: 'pointer', fontSize: '0.7rem' }}
                              aria-label="Add zone creature"
                              value=""
                              onChange={(ev) => {
                                const name = ev.target.value;
                                if (!name) return;
                                setZones((prev) =>
                                  prev.map((z) =>
                                    z.id === activeZone.id
                                      ? z.encounterTable.includes(name)
                                        ? z
                                        : { ...z, encounterTable: [...z.encounterTable, name] }
                                      : z
                                  )
                                );
                                setDirty(true);
                                setSaved(false);
                              }}
                            >
                              <option value="">+ ADD CREATURE (TIER {activeZone.tier})…</option>
                              {monsterNames
                                .filter((n) => crInTier(monsterCr[n] ?? 0, activeZone.tier))
                                .map((n) => (
                                  <option key={n} value={n}>
                                    {n}
                                  </option>
                                ))}
                            </select>
                          </div>
                        </div>
                        <div style={{ marginTop: 8 }}>
                          <p className={styles.formLbl}>
                            ENCOUNTER ARENAS (battleground per terrain)
                          </p>
                          <p
                            className={styles.formLbl}
                            style={{ color: 'var(--t-dim)', fontSize: '0.65rem', marginTop: 0 }}
                          >
                            Fight a rolled encounter on a chosen room’s map, by the terrain it
                            triggers on. No rooms for a terrain ⇒ the default bare arena.
                          </p>
                          {(() => {
                            const arenaRooms = activeZone.arenaRooms ?? {};
                            const keyed = Object.keys(arenaRooms);
                            const setArena = (next: Record<string, string[]>) => {
                              setZones((prev) =>
                                prev.map((z) =>
                                  z.id === activeZone.id ? { ...z, arenaRooms: next } : z
                                )
                              );
                              setDirty(true);
                              setSaved(false);
                            };
                            return (
                              <>
                                {keyed.map((terrain) => {
                                  const ids = arenaRooms[terrain] ?? [];
                                  return (
                                    <div key={terrain} style={{ marginBottom: 6 }}>
                                      <div
                                        style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                                      >
                                        <span
                                          className={styles.formLbl}
                                          style={{ minWidth: 70, textTransform: 'uppercase' }}
                                        >
                                          {terrain}
                                        </span>
                                        <button
                                          className={styles.ghostBtn}
                                          style={{
                                            padding: '0.15rem 0.4rem',
                                            fontSize: '0.65rem',
                                            color: 'var(--t-hp-low)',
                                          }}
                                          title={`Remove the ${terrain} arena mapping`}
                                          aria-label={`Remove ${terrain} arena`}
                                          onClick={() => {
                                            const next = { ...arenaRooms };
                                            delete next[terrain];
                                            setArena(next);
                                          }}
                                        >
                                          ✕
                                        </button>
                                      </div>
                                      <div
                                        style={{
                                          display: 'flex',
                                          gap: 6,
                                          alignItems: 'center',
                                          flexWrap: 'wrap',
                                          marginTop: 2,
                                        }}
                                      >
                                        {ids.map((rid) => (
                                          <button
                                            key={rid}
                                            className={styles.ghostBtn}
                                            style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem' }}
                                            title="Remove this room from the arena pool"
                                            onClick={() =>
                                              setArena({
                                                ...arenaRooms,
                                                [terrain]: ids.filter((r) => r !== rid),
                                              })
                                            }
                                          >
                                            {roomSizeLabel(rid)} ✕
                                          </button>
                                        ))}
                                        <select
                                          className={styles.formInp}
                                          style={{
                                            width: 'auto',
                                            cursor: 'pointer',
                                            fontSize: '0.7rem',
                                          }}
                                          aria-label={`Add ${terrain} arena room`}
                                          value=""
                                          onChange={(ev) => {
                                            const rid = ev.target.value;
                                            if (!rid || ids.includes(rid)) return;
                                            setArena({ ...arenaRooms, [terrain]: [...ids, rid] });
                                          }}
                                        >
                                          <option value="">+ ADD ROOM…</option>
                                          {roomOptions
                                            .filter((r) => !ids.includes(r))
                                            .map((r) => (
                                              <option key={r} value={r}>
                                                {roomSizeLabel(r)}
                                              </option>
                                            ))}
                                        </select>
                                      </div>
                                    </div>
                                  );
                                })}
                                {ARENA_TERRAINS.some((t) => !keyed.includes(t)) && (
                                  <select
                                    className={styles.formInp}
                                    style={{
                                      width: 'auto',
                                      cursor: 'pointer',
                                      fontSize: '0.7rem',
                                      marginTop: 4,
                                    }}
                                    aria-label="Add arena terrain"
                                    value=""
                                    onChange={(ev) => {
                                      const t = ev.target.value;
                                      if (!t || keyed.includes(t)) return;
                                      setArena({ ...arenaRooms, [t]: [] });
                                    }}
                                  >
                                    <option value="">+ ARENA FOR TERRAIN…</option>
                                    {ARENA_TERRAINS.filter((t) => !keyed.includes(t)).map((t) => (
                                      <option key={t} value={t}>
                                        {t.toUpperCase()}
                                      </option>
                                    ))}
                                  </select>
                                )}
                                {roomOptions.length === 0 && (
                                  <p
                                    className={styles.formLbl}
                                    style={{ color: 'var(--t-dim)', fontSize: '0.65rem' }}
                                  >
                                    No rooms in this campaign yet — author rooms to use them as
                                    arenas.
                                  </p>
                                )}
                              </>
                            );
                          })()}
                        </div>
                      </div>
                    )}
                    {!activeZone && zones.length === 0 && (
                      <p className={styles.formLbl} style={{ color: 'var(--t-dim)' }}>
                        No zones yet — add one, then paint cells. Unpainted cells use the region’s
                        ENCOUNTER TABLE.
                      </p>
                    )}
                  </div>
                )}

                {tool === 'mech' && (
                  <div>
                    <p className={styles.formLbl}>
                      MECHANICS (ONE FLAG PER CELL — RULES, NOT LOOKS)
                    </p>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {[...MECH_FLAGS, ''].map((m) => (
                        <button
                          key={m || 'clear'}
                          className={styles.ghostBtn}
                          aria-pressed={mechBrush === m}
                          title={
                            m === 'obstacle'
                              ? 'blocks movement; cover behind it'
                              : m === 'difficult'
                                ? '2× movement to enter'
                                : m === 'climb'
                                  ? '2× without a climb speed'
                                  : m === 'swim'
                                    ? '2× without a swim speed'
                                    : m === 'cover'
                                      ? 'half cover (+2 AC) to the occupant'
                                      : 'erase the flag'
                          }
                          style={{
                            padding: '0.25rem 0.6rem',
                            fontSize: '0.7rem',
                            borderColor: mechBrush === m ? 'var(--t-primary)' : undefined,
                          }}
                          onClick={() => setMechBrush(m)}
                        >
                          {m === '' ? 'CLEAR' : `${m.toUpperCase()} (${MECH_LETTER[m]})`}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {tool === 'site' && (
                  <div style={{ flexBasis: '100%' }}>
                    <p className={styles.formLbl}>
                      {markerNoun}S — CLICK AN EMPTY CELL TO PLACE · CLICK A ◆ TO SELECT
                      {moveArmed && (
                        <span style={{ color: 'var(--t-hp-mid)' }}>
                          {' '}
                          · CLICK THE DESTINATION CELL
                        </span>
                      )}
                    </p>
                    {/* Every existing marker, selectable — so the tool never
                        reads as "empty" while the map shows ◆ markers. */}
                    {sites.length > 0 && (
                      <div
                        style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}
                        data-testid="marker-list"
                      >
                        {sites.map((s) => (
                          <button
                            key={s.id}
                            className={styles.ghostBtn}
                            aria-pressed={s.id === selectedSiteId}
                            style={{
                              padding: '0.25rem 0.6rem',
                              fontSize: '0.7rem',
                              borderColor: s.id === selectedSiteId ? 'var(--t-primary)' : undefined,
                            }}
                            onClick={() => {
                              setSelectedSiteId(s.id);
                              setMoveArmed(false);
                            }}
                          >
                            ◆ {s.name || s.id} · {s.kind.toUpperCase()} ({s.pos.x},{s.pos.y})
                          </button>
                        ))}
                      </div>
                    )}
                    {selectedSite ? (
                      <div
                        style={{
                          display: 'flex',
                          gap: '0.75rem',
                          flexWrap: 'wrap',
                          alignItems: 'flex-end',
                        }}
                      >
                        <div style={{ flex: '2 1 160px' }}>
                          <label className={styles.formLbl} htmlFor="site-name">
                            {kind === 'room' ? 'LABEL' : 'NAME'}
                          </label>
                          <input
                            id="site-name"
                            className={styles.formInp}
                            value={selectedSite.name}
                            onChange={(e) => updateSite(selectedSite.id, { name: e.target.value })}
                          />
                        </div>
                        <div style={{ flex: '1 1 110px' }}>
                          <label className={styles.formLbl} htmlFor="site-kind">
                            KIND
                          </label>
                          <select
                            id="site-kind"
                            className={styles.formInp}
                            style={{ cursor: 'pointer' }}
                            value={selectedSite.kind}
                            onChange={(e) => updateSite(selectedSite.id, { kind: e.target.value })}
                          >
                            {(kind === 'region'
                              ? [
                                  ['local', 'LOCAL (DUNGEON)'],
                                  ['town', 'TOWN'],
                                  ['region', 'REGION GATE'],
                                ]
                              : kind === 'town'
                                ? [
                                    ['interior', 'INTERIOR'],
                                    ['gate', 'GATE (EXIT)'],
                                  ]
                                : [
                                    ['room', 'TO ANOTHER ROOM'],
                                    ['ascend', 'LEAVE (ASCEND)'],
                                  ]
                            ).map(([v, label]) => (
                              <option key={v} value={v}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </div>
                        {selectedSite.kind === 'room' && (
                          <div style={{ flex: '1 1 130px' }}>
                            <label className={styles.formLbl} htmlFor="site-to-room">
                              TO ROOM
                            </label>
                            <select
                              id="site-to-room"
                              className={styles.formInp}
                              style={{ cursor: 'pointer' }}
                              value={selectedSite.toRoomId ?? ''}
                              onChange={(e) =>
                                updateSite(selectedSite.id, { toRoomId: e.target.value })
                              }
                            >
                              <option value="">— PICK A ROOM —</option>
                              {roomIds
                                .filter((id) => id !== regionId)
                                .map((id) => (
                                  <option key={id} value={id}>
                                    {id}
                                  </option>
                                ))}
                            </select>
                          </div>
                        )}
                        {selectedSite.kind === 'town' && (
                          <div style={{ flex: '1 1 130px' }}>
                            <label className={styles.formLbl} htmlFor="site-town">
                              TOWN
                            </label>
                            <select
                              id="site-town"
                              className={styles.formInp}
                              style={{ cursor: 'pointer' }}
                              value={selectedSite.townId ?? ''}
                              onChange={(e) =>
                                updateSite(selectedSite.id, { townId: e.target.value })
                              }
                            >
                              <option value="">— PICK A TOWN —</option>
                              {townIds.map((id) => (
                                <option key={id} value={id}>
                                  {id}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                        {selectedSite.kind === 'region' && (
                          <div style={{ flex: '1 1 130px' }}>
                            <label className={styles.formLbl} htmlFor="site-region">
                              TO REGION
                            </label>
                            <select
                              id="site-region"
                              className={styles.formInp}
                              style={{ cursor: 'pointer' }}
                              value={selectedSite.regionId ?? ''}
                              onChange={(e) =>
                                updateSite(selectedSite.id, { regionId: e.target.value })
                              }
                            >
                              <option value="">— PICK A REGION —</option>
                              {(regions ?? [])
                                .filter((r) => r.id !== regionId)
                                .map((r) => (
                                  <option key={r.id} value={r.id}>
                                    {r.name}
                                  </option>
                                ))}
                            </select>
                          </div>
                        )}
                        {(selectedSite.kind === 'local' || selectedSite.kind === 'interior') && (
                          <div style={{ flex: '1 1 130px' }}>
                            <label className={styles.formLbl} htmlFor="site-room">
                              ENTRY ROOM
                            </label>
                            <select
                              id="site-room"
                              className={styles.formInp}
                              style={{ cursor: 'pointer' }}
                              value={selectedSite.entryRoomId ?? ''}
                              onChange={(e) =>
                                updateSite(selectedSite.id, { entryRoomId: e.target.value })
                              }
                            >
                              <option value="">— PICK A ROOM —</option>
                              {/* A reference outside the DB room pool (a code
                                  room like old_cave) stays editable — it's
                                  listed as unlisted, not silently dropped. */}
                              {selectedSite.entryRoomId &&
                                !roomOptions.includes(selectedSite.entryRoomId) && (
                                  <option value={selectedSite.entryRoomId}>
                                    {selectedSite.entryRoomId} (unlisted)
                                  </option>
                                )}
                              {roomOptions.map((id) => (
                                <option key={id} value={id}>
                                  {id}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                        {kind === 'region' && (
                          <div style={{ flex: '1 1 180px' }}>
                            {/* Bottom-align the label+select column with the
                                preview: the 2.5D tiles carry a transparent
                                overhang up top, so the geometric center reads
                                visually low — the painted ground sits at the
                                bottom edge, and that's what the select should
                                line up with. */}
                            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                              <div style={{ flex: 1 }}>
                                <label className={styles.formLbl} htmlFor="site-icon">
                                  ICON
                                </label>
                                <select
                                  id="site-icon"
                                  className={styles.formInp}
                                  style={{ cursor: 'pointer', flex: 1 }}
                                  value={selectedSite.icon ?? ''}
                                  onChange={(e) =>
                                    // '' (DEFAULT) stores undefined — the schema
                                    // rejects empty icon strings.
                                    updateSite(selectedSite.id, {
                                      icon: e.target.value || undefined,
                                    })
                                  }
                                >
                                  <option value="">
                                    {selectedSite.kind === 'town'
                                      ? '— DEFAULT (TOWN MARKER) —'
                                      : '— DEFAULT (DUNGEON GLYPH) —'}
                                  </option>
                                  {/* A legacy game-icons glyph (or any value not in the
                                    catalogs) stays editable — listed, not dropped. */}
                                  {selectedSite.icon &&
                                    !siteIconOptions.some((o) => o.value === selectedSite.icon) && (
                                      <option value={selectedSite.icon}>
                                        {selectedSite.icon} (custom)
                                      </option>
                                    )}
                                  <optgroup label="LOCATIONS">
                                    {siteIconOptions
                                      .filter((o) => o.group === 'marker')
                                      .map((o) => (
                                        <option key={o.value} value={o.value}>
                                          {o.label}
                                        </option>
                                      ))}
                                  </optgroup>
                                  <optgroup label="TERRAIN">
                                    {siteIconOptions
                                      .filter((o) => o.group === 'terrain')
                                      .map((o) => (
                                        <option key={o.value} value={o.value}>
                                          {o.label}
                                        </option>
                                      ))}
                                  </optgroup>
                                </select>
                              </div>
                              {/* Live preview — always rendered (fixed footprint,
                                  so the row doesn't reflow when the pick changes):
                                  a painted tile shows its variant-1 art; DEFAULT
                                  shows what the overworld actually draws (the
                                  village marker for towns, the dungeon-gate glyph
                                  otherwise); a legacy game-icons value shows its
                                  glyph. */}
                              <div
                                style={{
                                  width: 40,
                                  height: 60,
                                  flex: '0 0 40px',
                                  border: '1px solid var(--t-line)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  overflow: 'hidden',
                                }}
                              >
                                {(() => {
                                  const painted =
                                    siteIconPreview(selectedSite.icon) ??
                                    (paintedArt() &&
                                    !selectedSite.icon &&
                                    selectedSite.kind === 'town'
                                      ? artUrl('/art/markers/village_1.png')
                                      : null);
                                  if (painted) {
                                    return (
                                      <img
                                        src={painted}
                                        alt="site tile preview"
                                        width={40}
                                        height={60}
                                        style={{ display: 'block' }}
                                      />
                                    );
                                  }
                                  // A `tile:<id>` pick (free tier, or a glyph-only
                                  // build) previews as its marker-family glyph.
                                  const glyphName = selectedSite.icon?.startsWith('tile:')
                                    ? markerGlyph(selectedSite.icon.slice('tile:'.length))
                                    : selectedSite.icon ||
                                      (selectedSite.kind === 'town' ? 'village' : 'dungeon-gate');
                                  return (
                                    <GameIcon
                                      name={glyphName}
                                      aria-label="site glyph preview"
                                      style={{
                                        fontSize: '1.6rem',
                                        color: 'rgba(206, 198, 182, 0.95)',
                                      }}
                                    />
                                  );
                                })()}
                              </div>
                            </div>
                          </div>
                        )}
                        {kind === 'region' && (
                          // Sites only — venues/exits carry no narration hook
                          // (the schema would reject one). A variant pool, like
                          // the map-level NARRATION HOOKS.
                          <div style={{ flexBasis: '100%' }}>
                            <HookVariants
                              field="site-on-enter"
                              label="ON ENTER NARRATION"
                              variants={toVariants(selectedSite.onEnter)}
                              onChange={(v) =>
                                updateSite(selectedSite.id, {
                                  onEnter: v.length ? v : undefined,
                                })
                              }
                            />
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            className={styles.ghostBtn}
                            style={{ padding: '0.3rem 0.6rem', fontSize: '0.7rem' }}
                            aria-pressed={moveArmed}
                            data-testid="site-move-btn"
                            onClick={() => setMoveArmed((v) => !v)}
                          >
                            MOVE
                          </button>
                          <button
                            className={styles.ghostBtn}
                            style={{ padding: '0.3rem 0.6rem', fontSize: '0.7rem' }}
                            data-testid="site-delete-btn"
                            onClick={() => deleteSite(selectedSite.id)}
                          >
                            DELETE
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p style={{ color: 'var(--t-dim)', fontSize: '0.75rem' }}>
                        {sites.length === 0
                          ? `No ${markerNoun.toLowerCase()}s yet — click a cell to place the first one.`
                          : `Select a ◆ to edit it, or click an empty cell to place a new ${markerNoun.toLowerCase()}.`}
                      </p>
                    )}
                  </div>
                )}

                {tool === 'size' && (
                  <div>
                    <p className={styles.formLbl}>SIZE (CELLS) — SHRINKING TRIMS THE EDGES</p>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input
                        className={styles.formInp}
                        style={{ width: 64 }}
                        type="number"
                        min={1}
                        max={200}
                        aria-label="Grid width"
                        value={width}
                        onChange={(e) => resize(parseInt(e.target.value, 10) || width, height)}
                      />
                      <span style={{ color: 'var(--t-dim)' }}>×</span>
                      <input
                        className={styles.formInp}
                        style={{ width: 64 }}
                        type="number"
                        min={1}
                        max={200}
                        aria-label="Grid height"
                        value={height}
                        onChange={(e) => resize(width, parseInt(e.target.value, 10) || height)}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ── The grid ──────────────────────────────────────────────── */}
            <div className={styles.card} style={{ overflowX: 'auto' }}>
              <div
                data-testid="region-grid"
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${width}, ${CELL_PX}px)`,
                  gap: 1,
                  width: 'fit-content',
                  userSelect: 'none',
                }}
                onMouseLeave={() => setPainting(false)}
              >
                {grid.map((row, y) =>
                  row.map((cell, x) => {
                    const site = siteAt(x, y);
                    const cellLoot = lootAt(x, y);
                    const cellNpc = npcAt(x, y);
                    const cellObject = objectAt(x, y);
                    const isStart = startPos.x === x && startPos.y === y;
                    return (
                      <div
                        key={`${x},${y}`}
                        role="button"
                        tabIndex={0}
                        aria-label={`cell ${x},${y}: ${cell.t ?? 'floor'}${cell.m ? ` [${cell.m}]` : ''}${isStart ? ' (start)' : ''}${site ? ` (site: ${site.name})` : ''}${cellLoot ? ` (loot: ${itemName(cellLoot.itemId)})` : ''}${cellNpc ? ` (npc: ${cellNpc.name})` : ''}${cellObject ? ` (object: ${cellObject.name})` : ''}`}
                        data-testid={`cell-${x}-${y}`}
                        data-zone={cell.ez ?? undefined}
                        title={`(${x},${y}) ${cell.t ? (TERRAIN[cell.t as TerrainType]?.label ?? cell.t) : 'floor'}${cell.m ? ` [${cell.m}]` : ''}${cell.ez ? ` {zone: ${zones.find((z) => z.id === cell.ez)?.name ?? cell.ez}}` : ''}${site ? ` — ${site.name}` : ''}`}
                        style={{
                          width: CELL_PX,
                          height: CELL_PX,
                          background: cell.t
                            ? (TERRAIN_COLORS[cell.t as TerrainType] ?? '#000')
                            : kind === 'room'
                              ? '#5c5148' // bare room floor
                              : '#000',
                          position: 'relative',
                          cursor: 'crosshair',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 14,
                          outline: 'none',
                          // Encounter-zone overlay: an inset border tinted to the zone.
                          boxShadow: cell.ez
                            ? `inset 0 0 0 3px ${zoneColor(zones, cell.ez)}`
                            : undefined,
                        }}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          // Site placement is click-only — drag-painting
                          // markers would scatter one per cell crossed.
                          if (tool !== 'site') setPainting(true);
                          applyTool(x, y);
                        }}
                        onMouseEnter={() => {
                          if (painting) applyTool(x, y);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            applyTool(x, y);
                          }
                        }}
                      >
                        {cell.m && (
                          <span
                            aria-hidden="true"
                            style={{
                              position: 'absolute',
                              bottom: 0,
                              left: 2,
                              fontSize: 9,
                              fontWeight: 'bold',
                              color: '#ffd76a',
                              textShadow: '0 0 2px #000',
                            }}
                          >
                            {MECH_LETTER[cell.m]}
                          </span>
                        )}
                        {isStart && (
                          <span aria-hidden="true" style={{ textShadow: '0 0 3px #000' }}>
                            ★
                          </span>
                        )}
                        {cellLoot && !site && !isStart && (
                          <span
                            aria-hidden="true"
                            style={{
                              color: '#9be08a',
                              fontWeight: 'bold',
                              textShadow: '0 0 3px #000',
                            }}
                          >
                            $
                          </span>
                        )}
                        {cellNpc && !site && !isStart && !cellLoot && (
                          <span
                            aria-hidden="true"
                            style={{ color: '#e6c878', textShadow: '0 0 3px #000' }}
                          >
                            ☺
                          </span>
                        )}
                        {cellObject && !site && !isStart && !cellLoot && !cellNpc && (
                          <span
                            aria-hidden="true"
                            style={{ color: '#c8a06a', textShadow: '0 0 3px #000' }}
                          >
                            ▣
                          </span>
                        )}
                        {site && (
                          <span
                            aria-hidden="true"
                            style={{
                              color:
                                site.kind === 'town' ||
                                site.kind === 'gate' ||
                                site.kind === 'ascend'
                                  ? '#ffd76a'
                                  : '#ff8a8a',
                              textShadow:
                                site.id === selectedSiteId
                                  ? '0 0 6px #fff, 0 0 3px #000'
                                  : '0 0 3px #000',
                            }}
                          >
                            ◆
                          </span>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
              <p style={{ color: 'var(--t-dim)', fontSize: '0.7rem', marginTop: 8 }}>
                {kind === 'region'
                  ? 'CLICK / DRAG TO PAINT · ★ START · ◆ SITE (edit with the SITES tool) · CORNER NUMBER = TIER OVERRIDE'
                  : kind === 'town'
                    ? 'CLICK / DRAG TO PAINT · ★ START · ◆ VENUE (edit with the VENUES tool)'
                    : 'CLICK / DRAG TO PAINT · ★ ENTRY · ◆ EXIT (edit with the EXITS tool) · CORNER LETTER = MECHANICS FLAG'}
              </p>
            </div>

            {/* ── Details (the non-map fields; saved with the map) ────────── */}
            <div className={styles.card} style={{ marginTop: '1rem' }}>
              <p
                style={{
                  fontSize: '0.8rem',
                  letterSpacing: '0.12em',
                  color: 'var(--t-mid)',
                  marginBottom: '0.75rem',
                }}
              >
                DETAILS
              </p>
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                <div style={{ flex: '2 1 220px' }}>
                  <label className={styles.formLbl} htmlFor="map-detail-name">
                    NAME
                  </label>
                  <input
                    id="map-detail-name"
                    className={styles.formInp}
                    value={details.name}
                    onChange={(e) => updateDetail('name', e.target.value)}
                  />
                </div>
                {/* Rooms are locked to the SRD 5-ft tactical scale (the
                    header shows it); regions/towns carry a real scale. */}
                {kind !== 'room' && (
                  <div style={{ flex: '1 1 120px' }}>
                    <label className={styles.formLbl} htmlFor="map-detail-fps">
                      FEET PER SQUARE
                    </label>
                    <input
                      id="map-detail-fps"
                      className={styles.formInp}
                      type="number"
                      min={1}
                      value={details.feetPerSquare}
                      onChange={(e) => updateDetail('feetPerSquare', e.target.value)}
                    />
                  </div>
                )}
                {/* Region wilderness encounters are authored in the ENC. ZONES
                    tool (each zone has its own tier + chance + creature table). */}
                {kind !== 'region' && (
                  <div style={{ flex: '1 1 120px' }}>
                    <label className={styles.formLbl} htmlFor="map-detail-floor">
                      FLOOR
                    </label>
                    <select
                      id="map-detail-floor"
                      className={styles.formInp}
                      style={{ cursor: 'pointer' }}
                      value={details.floor}
                      onChange={(e) => updateDetail('floor', e.target.value)}
                    >
                      <option value="">—</option>
                      {['grass', 'dirt', 'cobblestone', 'sand'].map((f) => (
                        <option key={f} value={f}>
                          {f.toUpperCase()}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {kind === 'room' && (
                  <>
                    <div style={{ flex: '1 1 120px' }}>
                      <label className={styles.formLbl} htmlFor="map-detail-lighting">
                        LIGHTING
                      </label>
                      <select
                        id="map-detail-lighting"
                        className={styles.formInp}
                        style={{ cursor: 'pointer' }}
                        value={details.lighting}
                        onChange={(e) => updateDetail('lighting', e.target.value)}
                      >
                        {['bright', 'dim', 'dark', 'sunlight'].map((l) => (
                          <option key={l} value={l}>
                            {l.toUpperCase()}
                          </option>
                        ))}
                      </select>
                    </div>
                    {/* No label-above-input stack here, so bottom-align and pad
                        up to the neighbours' input centreline. */}
                    <div style={{ flex: '1 1 110px', alignSelf: 'flex-end', paddingBottom: 8 }}>
                      <label
                        style={{
                          display: 'flex',
                          gap: 6,
                          alignItems: 'center',
                          fontSize: '0.75rem',
                          color: 'var(--t-mid)',
                          cursor: 'pointer',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={canRest}
                          onChange={(e) => {
                            setCanRest(e.target.checked);
                            setDirty(true);
                            setSaved(false);
                          }}
                        />
                        CAN REST HERE
                      </label>
                    </div>
                  </>
                )}
              </div>
              <div style={{ marginTop: '0.75rem' }}>
                <label className={styles.formLbl} htmlFor="map-detail-desc">
                  DESCRIPTION
                </label>
                <textarea
                  id="map-detail-desc"
                  className={styles.formInp}
                  rows={2}
                  style={{ resize: 'vertical' }}
                  value={details.desc}
                  onChange={(e) => updateDetail('desc', e.target.value)}
                />
              </div>
              {kind === 'region' && (
                <div
                  style={{
                    display: 'flex',
                    gap: '0.75rem',
                    alignItems: 'center',
                    marginTop: '0.75rem',
                  }}
                >
                  {region.isStartingRegion && !makeStarter ? (
                    <span style={{ color: 'var(--t-hp-high)', fontSize: '0.75rem' }}>
                      ★ STARTING REGION
                    </span>
                  ) : makeStarter ? (
                    <span style={{ color: 'var(--t-hp-mid)', fontSize: '0.75rem' }}>
                      ★ BECOMES THE STARTING REGION ON SAVE
                    </span>
                  ) : (
                    <button
                      className={styles.ghostBtn}
                      style={{ padding: '0.25rem 0.6rem', fontSize: '0.7rem' }}
                      data-testid="make-starter-btn"
                      onClick={() => {
                        setMakeStarter(true);
                        setDirty(true);
                        setSaved(false);
                      }}
                    >
                      MAKE STARTING REGION
                    </button>
                  )}
                  <span style={{ fontSize: '0.7rem', color: 'var(--t-dim)' }}>
                    THE PARTY OPENS THE CAMPAIGN IN THE STARTING REGION
                  </span>
                </div>
              )}
            </div>

            {/* ── Narration hooks — one row per hook. ON FIRST overrides the
                plain one the first time; the plain one fires every other
                time. Region exits stay dormant until region travel exists. */}
            <div className={styles.card} style={{ marginTop: '1rem' }}>
              <p
                style={{
                  fontSize: '0.8rem',
                  letterSpacing: '0.12em',
                  color: 'var(--t-mid)',
                  marginBottom: '0.75rem',
                }}
              >
                NARRATION HOOKS — &quot;FIRST&quot; OVERRIDES THE PLAIN ONE ONCE
                {kind === 'region' ? ' · FIRST ENTER FALLS BACK TO DESCRIPTION' : ''}
              </p>
              <p style={{ fontSize: '0.68rem', color: 'var(--t-dim)', marginBottom: '0.5rem' }}>
                EACH HOOK IS A POOL — ADD VARIANTS AND THE ENGINE PICKS ONE AT RANDOM. A VARIANT MAY
                SPAN MULTIPLE PARAGRAPHS (BLANK LINE BETWEEN).
              </p>
              {(
                [
                  ['onEnter', 'ON ENTER'],
                  ['onFirstEnter', 'ON FIRST ENTER'],
                  ['onExit', 'ON EXIT'],
                  ['onFirstExit', 'ON FIRST EXIT'],
                ] as Array<[HookKey, string]>
              ).map(([key, label]) => (
                <HookVariants
                  key={key}
                  field={key}
                  label={label}
                  variants={details[key]}
                  onChange={(v) => updateHook(key, v)}
                />
              ))}
            </div>

            {/* ── Enemies (rooms only) — placement specs against the
                campaign's composed bestiary; combat starts when the party
                attacks them in play. Saved with the room. */}
            {kind === 'room' && (
              <div className={styles.card} style={{ marginTop: '1rem' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '0.75rem',
                  }}
                >
                  <p style={{ fontSize: '0.8rem', letterSpacing: '0.12em', color: 'var(--t-mid)' }}>
                    ENEMIES
                  </p>
                  <button
                    className={styles.ghostBtn}
                    style={{ padding: '0.3rem 0.6rem', fontSize: '0.7rem' }}
                    data-testid="add-enemy-btn"
                    onClick={() => {
                      setPlacedEnemies((prev) => [
                        ...prev,
                        { name: monsterNames[0] ?? '', count: 1 },
                      ]);
                      setDirty(true);
                      setSaved(false);
                    }}
                  >
                    + ADD ENEMY
                  </button>
                </div>
                {placedEnemies.length === 0 ? (
                  <p style={{ color: 'var(--t-dim)', fontSize: '0.8rem' }}>
                    No enemies here — a safe room. Placements come from the campaign&apos;s bestiary
                    (the full SRD catalog plus your custom monsters).
                  </p>
                ) : (
                  placedEnemies.map((e, i) => (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        gap: '0.5rem',
                        alignItems: 'center',
                        padding: '0.3rem 0',
                      }}
                    >
                      <select
                        className={styles.formInp}
                        style={{ flex: 1, cursor: 'pointer' }}
                        aria-label={`Enemy ${i + 1}`}
                        value={e.name}
                        onChange={(ev) => {
                          const name = ev.target.value;
                          setPlacedEnemies((prev) =>
                            prev.map((p, j) => (j === i ? { ...p, name } : p))
                          );
                          setDirty(true);
                          setSaved(false);
                        }}
                      >
                        <option value="">— PICK A CREATURE —</option>
                        {e.name && !monsterNames.includes(e.name) && (
                          <option value={e.name}>{e.name} (unlisted)</option>
                        )}
                        {monsterNames.map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                      <span style={{ fontSize: '0.7rem', color: 'var(--t-dim)' }}>×</span>
                      <input
                        className={styles.formInp}
                        style={{ width: 64 }}
                        type="number"
                        min={1}
                        max={8}
                        aria-label={`Enemy ${i + 1} count`}
                        value={e.count}
                        onChange={(ev) => {
                          const count = Math.max(
                            1,
                            Math.min(8, parseInt(ev.target.value, 10) || 1)
                          );
                          setPlacedEnemies((prev) =>
                            prev.map((p, j) => (j === i ? { ...p, count } : p))
                          );
                          setDirty(true);
                          setSaved(false);
                        }}
                      />
                      <button
                        className={styles.ghostBtn}
                        style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                        aria-label={`Remove enemy ${i + 1}`}
                        onClick={() => {
                          setPlacedEnemies((prev) => prev.filter((_, j) => j !== i));
                          setDirty(true);
                          setSaved(false);
                        }}
                      >
                        <span aria-hidden="true">✕</span>
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* ── Loot (rooms only) — item placements against the campaign's
                composed loot table. PLACE arms the next grid click to drop
                the token ($); without a pos it's a plain room pickup. */}
            {kind === 'room' && (
              <div className={styles.card} style={{ marginTop: '1rem' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '0.75rem',
                  }}
                >
                  <p style={{ fontSize: '0.8rem', letterSpacing: '0.12em', color: 'var(--t-mid)' }}>
                    LOOT
                    {placeArm?.kind === 'loot' && (
                      <span style={{ color: 'var(--t-hp-mid)' }}>
                        {' '}
                        — CLICK A GRID CELL TO PLACE THE TOKEN
                      </span>
                    )}
                  </p>
                  <button
                    className={styles.ghostBtn}
                    style={{ padding: '0.3rem 0.6rem', fontSize: '0.7rem' }}
                    data-testid="add-loot-btn"
                    onClick={() => {
                      setPlacedLoot((prev) => [...prev, { itemId: itemOptions[0]?.id ?? '' }]);
                      setDirty(true);
                      setSaved(false);
                    }}
                  >
                    + ADD LOOT
                  </button>
                </div>
                {placedLoot.length === 0 ? (
                  <p style={{ color: 'var(--t-dim)', fontSize: '0.8rem' }}>
                    Nothing to find here. Placements come from the campaign&apos;s loot table (the
                    full SRD catalog plus your custom items); placed tokens render as $ on the grid,
                    unplaced items are plain room pickups.
                  </p>
                ) : (
                  placedLoot.map((l, i) => (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        gap: '0.5rem',
                        alignItems: 'center',
                        padding: '0.3rem 0',
                      }}
                    >
                      <select
                        className={styles.formInp}
                        style={{ flex: 1, cursor: 'pointer' }}
                        aria-label={`Loot ${i + 1}`}
                        value={l.itemId}
                        onChange={(ev) => {
                          const itemId = ev.target.value;
                          setPlacedLoot((prev) =>
                            prev.map((p, j) => (j === i ? { ...p, itemId } : p))
                          );
                          setDirty(true);
                          setSaved(false);
                        }}
                      >
                        <option value="">— PICK AN ITEM —</option>
                        {l.itemId && !itemOptions.some((o) => o.id === l.itemId) && (
                          <option value={l.itemId}>{l.itemId} (unlisted)</option>
                        )}
                        {itemOptions.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.name}
                          </option>
                        ))}
                      </select>
                      <span style={{ fontSize: '0.7rem', color: 'var(--t-dim)', minWidth: 70 }}>
                        {l.pos ? `AT (${l.pos.x},${l.pos.y})` : 'UNPLACED'}
                      </span>
                      <button
                        className={styles.ghostBtn}
                        style={{ padding: '0.3rem 0.6rem', fontSize: '0.7rem' }}
                        aria-pressed={placeArm?.kind === 'loot' && placeArm.idx === i}
                        data-testid={`place-loot-${i}`}
                        onClick={() =>
                          setPlaceArm((v) =>
                            v?.kind === 'loot' && v.idx === i ? null : { kind: 'loot', idx: i }
                          )
                        }
                      >
                        PLACE
                      </button>
                      {l.pos && (
                        <button
                          className={styles.ghostBtn}
                          style={{ padding: '0.3rem 0.6rem', fontSize: '0.7rem' }}
                          aria-label={`Unplace loot ${i + 1}`}
                          onClick={() => {
                            setPlacedLoot((prev) =>
                              prev.map((p, j) => (j === i ? { itemId: p.itemId } : p))
                            );
                            setDirty(true);
                            setSaved(false);
                          }}
                        >
                          UNPLACE
                        </button>
                      )}
                      <button
                        className={styles.ghostBtn}
                        style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                        aria-label={`Remove loot ${i + 1}`}
                        onClick={() => {
                          setPlacedLoot((prev) => prev.filter((_, j) => j !== i));
                          setPlaceArm(null);
                          setDirty(true);
                          setSaved(false);
                        }}
                      >
                        <span aria-hidden="true">✕</span>
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* ── NPCs (rooms only) — bespoke characters: talk (greeting),
                trade and fight surfaces. Dialogue trees, shops and custom
                stat blocks are edited via the ROOMS JSON; the card covers
                the common fields and preserves the rest on save. */}
            {kind === 'room' && (
              <div className={styles.card} style={{ marginTop: '1rem' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '0.75rem',
                  }}
                >
                  <p style={{ fontSize: '0.8rem', letterSpacing: '0.12em', color: 'var(--t-mid)' }}>
                    NPCS
                    {placeArm?.kind === 'npc' && (
                      <span style={{ color: 'var(--t-hp-mid)' }}>
                        {' '}
                        — CLICK A GRID CELL TO PLACE THE TOKEN
                      </span>
                    )}
                  </p>
                  <button
                    className={styles.ghostBtn}
                    style={{ padding: '0.3rem 0.6rem', fontSize: '0.7rem' }}
                    data-testid="add-npc-btn"
                    onClick={() => {
                      // NPC ids are campaign-unique — derive against every
                      // room in the section, not just this one.
                      const taken = new Set(
                        (regions ?? []).flatMap((r) => (r.npcs ?? []).map((n) => n.id))
                      );
                      placedNpcs.forEach((n) => taken.add(n.id));
                      let i = taken.size + 1;
                      while (taken.has(`npc-${i}`)) i++;
                      setPlacedNpcs((prev) => [
                        ...prev,
                        { id: `npc-${i}`, name: '', attitude: 'indifferent', greeting: '' },
                      ]);
                      setDirty(true);
                      setSaved(false);
                    }}
                  >
                    + ADD NPC
                  </button>
                </div>
                {placedNpcs.length === 0 ? (
                  <p style={{ color: 'var(--t-dim)', fontSize: '0.8rem' }}>
                    Nobody home. NPCs talk (greeting + dialogue), trade (shop) and fight if provoked
                    (SRD Commoner stats unless overridden) — dialogue trees, shops and stat blocks
                    are edited in the ROOMS JSON.
                  </p>
                ) : (
                  placedNpcs.map((n, i) => (
                    // Each NPC is a bordered block — the card spans several
                    // rows (identity, narrative hooks, an open dialogue tree),
                    // so a box keeps neighbours visually apart.
                    <div
                      key={n.id}
                      style={{
                        padding: '0.5rem 0.6rem',
                        marginBottom: '0.6rem',
                        border: '1px solid var(--t-border)',
                        borderRadius: 4,
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          gap: '0.5rem',
                          alignItems: 'flex-end',
                          flexWrap: 'wrap',
                        }}
                      >
                        <div style={{ flex: '2 1 140px' }}>
                          <label className={styles.formLbl} htmlFor={`npc-name-${i}`}>
                            NAME
                          </label>
                          <input
                            id={`npc-name-${i}`}
                            className={styles.formInp}
                            value={n.name}
                            onChange={(ev) => {
                              const name = ev.target.value;
                              setPlacedNpcs((prev) =>
                                prev.map((p, j) => (j === i ? { ...p, name } : p))
                              );
                              setDirty(true);
                              setSaved(false);
                            }}
                          />
                        </div>
                        <div style={{ flex: '1 1 110px' }}>
                          <label className={styles.formLbl} htmlFor={`npc-attitude-${i}`}>
                            ATTITUDE
                          </label>
                          <select
                            id={`npc-attitude-${i}`}
                            className={styles.formInp}
                            style={{ cursor: 'pointer' }}
                            value={n.attitude}
                            onChange={(ev) => {
                              const attitude = ev.target.value;
                              setPlacedNpcs((prev) =>
                                prev.map((p, j) => (j === i ? { ...p, attitude } : p))
                              );
                              setDirty(true);
                              setSaved(false);
                            }}
                          >
                            {['friendly', 'indifferent', 'hostile'].map((a) => (
                              <option key={a} value={a}>
                                {a.toUpperCase()}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div style={{ flex: '1 1 90px' }}>
                          <label className={styles.formLbl} htmlFor={`npc-icon-${i}`}>
                            ICON
                          </label>
                          <input
                            id={`npc-icon-${i}`}
                            className={styles.formInp}
                            placeholder="default"
                            value={n.icon ?? ''}
                            onChange={(ev) => {
                              const icon = ev.target.value;
                              setPlacedNpcs((prev) =>
                                prev.map((p, j) => (j === i ? { ...p, icon } : p))
                              );
                              setDirty(true);
                              setSaved(false);
                            }}
                          />
                        </div>
                        <span
                          style={{
                            fontSize: '0.7rem',
                            color: 'var(--t-dim)',
                            minWidth: 70,
                            paddingBottom: 8,
                          }}
                        >
                          {n.pos ? `AT (${n.pos.x},${n.pos.y})` : 'UNPLACED'}
                        </span>
                        <div style={{ display: 'flex', gap: 6, paddingBottom: 4 }}>
                          <button
                            className={styles.ghostBtn}
                            style={{ padding: '0.3rem 0.6rem', fontSize: '0.7rem' }}
                            aria-pressed={placeArm?.kind === 'npc' && placeArm.idx === i}
                            data-testid={`place-npc-${i}`}
                            onClick={() =>
                              setPlaceArm((v) =>
                                v?.kind === 'npc' && v.idx === i ? null : { kind: 'npc', idx: i }
                              )
                            }
                          >
                            PLACE
                          </button>
                          <button
                            className={styles.ghostBtn}
                            style={{ padding: '0.3rem 0.6rem', fontSize: '0.7rem' }}
                            aria-pressed={dialogueOpen === i}
                            data-testid={`npc-dialogue-${i}`}
                            onClick={() => setDialogueOpen((v) => (v === i ? null : i))}
                          >
                            DIALOGUE ({(n.responses ?? []).length})
                          </button>
                          <button
                            className={styles.ghostBtn}
                            style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                            aria-label={`Remove NPC ${i + 1}`}
                            onClick={() => {
                              setPlacedNpcs((prev) => prev.filter((_, j) => j !== i));
                              setPlaceArm(null);
                              setDialogueOpen(null);
                              setDirty(true);
                              setSaved(false);
                            }}
                          >
                            <span aria-hidden="true">✕</span>
                          </button>
                        </div>
                      </div>
                      {/* NPC greeting/goodbye hooks — each a variant pool (FIRST
                          overrides the plain one once). Dialogue replies are
                          edited separately (the DIALOGUE tree, single lines).
                          Labels carry the NPC index for aria-uniqueness. */}
                      {(
                        [
                          ['greeting', 'GREETING'],
                          ['firstGreeting', 'FIRST GREETING'],
                          ['goodbye', 'GOODBYE'],
                          ['firstGoodbye', 'FIRST GOODBYE'],
                        ] as const
                      ).map(([key, label]) => (
                        <HookVariants
                          key={key}
                          field={`npc-${key}-${i}`}
                          label={`NPC ${i + 1} ${label}`}
                          variants={toVariants(n[key] as string | string[] | undefined)}
                          onChange={(variants) => {
                            setPlacedNpcs((prev) =>
                              prev.map((p, j) => (j === i ? { ...p, [key]: variants } : p))
                            );
                            setDirty(true);
                            setSaved(false);
                          }}
                        />
                      ))}
                      {/* Shop — wares from the composed item list, with a
                          faction tie so the tier price multipliers apply. */}
                      <div style={{ marginTop: 8 }}>
                        <div
                          style={{
                            display: 'flex',
                            gap: 12,
                            alignItems: 'flex-end',
                            flexWrap: 'wrap',
                          }}
                        >
                          <p className={styles.formLbl} style={{ marginBottom: 6 }}>
                            SHOP {(n.shop ?? []).length === 0 ? '— none (not a vendor)' : ''}
                          </p>
                          <button
                            className={styles.ghostBtn}
                            style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem' }}
                            data-testid={`npc-add-ware-${i}`}
                            onClick={() => {
                              setPlacedNpcs((prev) =>
                                prev.map((p, j) =>
                                  j === i
                                    ? {
                                        ...p,
                                        shop: [
                                          ...(p.shop ?? []),
                                          { itemId: itemOptions[0]?.id ?? '', price: 1 },
                                        ],
                                      }
                                    : p
                                )
                              );
                              setDirty(true);
                              setSaved(false);
                            }}
                          >
                            + ADD WARE
                          </button>
                          {(n.shop ?? []).length > 0 && (
                            <div>
                              <label className={styles.formLbl} htmlFor={`npc-shopgold-${i}`}>
                                VENDOR GOLD / DAY
                              </label>
                              <input
                                id={`npc-shopgold-${i}`}
                                className={styles.formInp}
                                style={{ width: 110 }}
                                type="number"
                                min={0}
                                placeholder="unlimited"
                                value={n.shopGold ?? ''}
                                onChange={(ev) => {
                                  const v = ev.target.value;
                                  const shopGold = v === '' ? undefined : Number(v);
                                  setPlacedNpcs((prev) =>
                                    prev.map((p, j) => (j === i ? { ...p, shopGold } : p))
                                  );
                                  setDirty(true);
                                  setSaved(false);
                                }}
                              />
                            </div>
                          )}
                          {(n.shop ?? []).length > 0 && (
                            <div>
                              <label className={styles.formLbl} htmlFor={`npc-faction-${i}`}>
                                FACTION (TIER PRICING)
                              </label>
                              <select
                                id={`npc-faction-${i}`}
                                className={styles.formInp}
                                style={{ cursor: 'pointer', width: 'auto' }}
                                value={n.factionId ?? ''}
                                onChange={(ev) => {
                                  const factionId = ev.target.value;
                                  setPlacedNpcs((prev) =>
                                    prev.map((p, j) => (j === i ? { ...p, factionId } : p))
                                  );
                                  setDirty(true);
                                  setSaved(false);
                                }}
                              >
                                <option value="">— NONE (FLAT PRICES) —</option>
                                {factionOptions.map((f) => (
                                  <option key={f.id} value={f.id}>
                                    {f.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                        </div>
                        {(n.shop ?? []).map((w, wi) => (
                          <div
                            key={wi}
                            style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}
                          >
                            <select
                              className={styles.formInp}
                              style={{ width: 'auto', cursor: 'pointer' }}
                              aria-label={`NPC ${i + 1} ware ${wi + 1} item`}
                              value={w.itemId}
                              onChange={(ev) => {
                                const itemId = ev.target.value;
                                setPlacedNpcs((prev) =>
                                  prev.map((p, j) =>
                                    j === i
                                      ? {
                                          ...p,
                                          shop: p.shop!.map((x, k) =>
                                            k === wi ? { ...x, itemId } : x
                                          ),
                                        }
                                      : p
                                  )
                                );
                                setDirty(true);
                                setSaved(false);
                              }}
                            >
                              {w.itemId && !itemOptions.some((o) => o.id === w.itemId) && (
                                <option value={w.itemId}>{w.itemId} (unlisted)</option>
                              )}
                              {itemOptions.map((o) => (
                                <option key={o.id} value={o.id}>
                                  {o.name}
                                </option>
                              ))}
                            </select>
                            <input
                              className={styles.formInp}
                              style={{ width: 90 }}
                              type="number"
                              min={0}
                              aria-label={`NPC ${i + 1} ware ${wi + 1} price`}
                              value={w.price}
                              onChange={(ev) => {
                                const price = Number(ev.target.value);
                                setPlacedNpcs((prev) =>
                                  prev.map((p, j) =>
                                    j === i
                                      ? {
                                          ...p,
                                          shop: p.shop!.map((x, k) =>
                                            k === wi ? { ...x, price } : x
                                          ),
                                        }
                                      : p
                                  )
                                );
                                setDirty(true);
                                setSaved(false);
                              }}
                            />
                            <span style={{ fontSize: '0.7rem', color: 'var(--t-dim)' }}>cr</span>
                            <input
                              className={styles.formInp}
                              style={{ width: 80 }}
                              type="number"
                              min={1}
                              placeholder="∞"
                              aria-label={`NPC ${i + 1} ware ${wi + 1} qty`}
                              value={w.qty ?? ''}
                              onChange={(ev) => {
                                const v = ev.target.value;
                                const qty = v === '' ? undefined : Number(v);
                                setPlacedNpcs((prev) =>
                                  prev.map((p, j) =>
                                    j === i
                                      ? {
                                          ...p,
                                          shop: p.shop!.map((x, k) =>
                                            k === wi ? { ...x, qty } : x
                                          ),
                                        }
                                      : p
                                  )
                                );
                                setDirty(true);
                                setSaved(false);
                              }}
                            />
                            <span style={{ fontSize: '0.7rem', color: 'var(--t-dim)' }}>/day</span>
                            <button
                              className={styles.ghostBtn}
                              style={{ padding: '0.2rem 0.45rem', fontSize: '0.7rem' }}
                              aria-label={`Remove NPC ${i + 1} ware ${wi + 1}`}
                              onClick={() => {
                                setPlacedNpcs((prev) =>
                                  prev.map((p, j) =>
                                    j === i ? { ...p, shop: p.shop!.filter((_, k) => k !== wi) } : p
                                  )
                                );
                                setDirty(true);
                                setSaved(false);
                              }}
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                      {dialogueOpen === i && (
                        <div style={{ marginTop: 6 }}>
                          <DialogueEditor
                            value={n.responses ?? []}
                            onChange={(responses) => {
                              setPlacedNpcs((prev) =>
                                prev.map((p, j) =>
                                  j === i
                                    ? {
                                        ...p,
                                        ...(responses.length
                                          ? { responses }
                                          : { responses: undefined }),
                                      }
                                    : p
                                )
                              );
                              setDirty(true);
                              setSaved(false);
                            }}
                            items={itemOptions}
                            quests={questOptions}
                            factions={factionOptions}
                            npcIds={placedNpcs.map((p) => p.id)}
                          />
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}

            {/* ── Objects (rooms only) — searchable chests / interactable
                fixtures. Loot inside comes from the campaign's loot table
                by id; desc / found / empty texts edit via the ROOMS JSON. */}
            {kind === 'room' && (
              <div className={styles.card} style={{ marginTop: '1rem' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '0.75rem',
                  }}
                >
                  <p style={{ fontSize: '0.8rem', letterSpacing: '0.12em', color: 'var(--t-mid)' }}>
                    OBJECTS
                    {placeArm?.kind === 'object' && (
                      <span style={{ color: 'var(--t-hp-mid)' }}>
                        {' '}
                        — CLICK A GRID CELL TO PLACE THE TOKEN
                      </span>
                    )}
                  </p>
                  <button
                    className={styles.ghostBtn}
                    style={{ padding: '0.3rem 0.6rem', fontSize: '0.7rem' }}
                    data-testid="add-object-btn"
                    onClick={() => {
                      const taken = new Set(placedObjects.map((o) => o.id));
                      let i = placedObjects.length + 1;
                      while (taken.has(`obj-${i}`)) i++;
                      setPlacedObjects((prev) => [...prev, { id: `obj-${i}`, name: '' }]);
                      setDirty(true);
                      setSaved(false);
                    }}
                  >
                    + ADD OBJECT
                  </button>
                </div>
                {placedObjects.length === 0 ? (
                  <p style={{ color: 'var(--t-dim)', fontSize: '0.8rem' }}>
                    Nothing to poke at. Objects with loot are searchable chests (Investigation check
                    vs the DC); without loot they&apos;re one-shot flavor.
                  </p>
                ) : (
                  placedObjects.map((o, i) => (
                    <div
                      key={o.id}
                      style={{ padding: '0.3rem 0', borderBottom: '1px solid var(--t-separator)' }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          gap: '0.5rem',
                          alignItems: 'flex-end',
                          flexWrap: 'wrap',
                        }}
                      >
                        <div style={{ flex: '2 1 140px' }}>
                          <label className={styles.formLbl} htmlFor={`obj-name-${i}`}>
                            NAME
                          </label>
                          <input
                            id={`obj-name-${i}`}
                            className={styles.formInp}
                            value={o.name}
                            onChange={(ev) => {
                              const name = ev.target.value;
                              setPlacedObjects((prev) =>
                                prev.map((p, j) => (j === i ? { ...p, name } : p))
                              );
                              setDirty(true);
                              setSaved(false);
                            }}
                          />
                        </div>
                        <div style={{ flex: '0 1 90px' }}>
                          <label className={styles.formLbl} htmlFor={`obj-dc-${i}`}>
                            SEARCH DC
                          </label>
                          <input
                            id={`obj-dc-${i}`}
                            className={styles.formInp}
                            type="number"
                            min={1}
                            max={30}
                            placeholder="—"
                            value={o.searchDC ?? ''}
                            onChange={(ev) => {
                              const v = ev.target.value;
                              const searchDC = v === '' ? undefined : Number(v);
                              setPlacedObjects((prev) =>
                                prev.map((p, j) => (j === i ? { ...p, searchDC } : p))
                              );
                              setDirty(true);
                              setSaved(false);
                            }}
                          />
                        </div>
                        <span
                          style={{
                            fontSize: '0.7rem',
                            color: 'var(--t-dim)',
                            minWidth: 70,
                            paddingBottom: 8,
                          }}
                        >
                          {o.pos ? `AT (${o.pos.x},${o.pos.y})` : 'UNPLACED'}
                        </span>
                        <div style={{ display: 'flex', gap: 6, paddingBottom: 4 }}>
                          <button
                            className={styles.ghostBtn}
                            style={{ padding: '0.3rem 0.6rem', fontSize: '0.7rem' }}
                            aria-pressed={placeArm?.kind === 'object' && placeArm.idx === i}
                            data-testid={`place-object-${i}`}
                            onClick={() =>
                              setPlaceArm((v) =>
                                v?.kind === 'object' && v.idx === i
                                  ? null
                                  : { kind: 'object', idx: i }
                              )
                            }
                          >
                            PLACE
                          </button>
                          <button
                            className={styles.ghostBtn}
                            style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                            aria-label={`Remove object ${i + 1}`}
                            onClick={() => {
                              setPlacedObjects((prev) => prev.filter((_, j) => j !== i));
                              setPlaceArm(null);
                              setDirty(true);
                              setSaved(false);
                            }}
                          >
                            <span aria-hidden="true">✕</span>
                          </button>
                        </div>
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          gap: 6,
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          marginTop: 6,
                        }}
                      >
                        <span style={{ fontSize: '0.7rem', color: 'var(--t-dim)' }}>LOOT:</span>
                        {(o.lootIds ?? []).map((id) => (
                          <button
                            key={id}
                            className={styles.ghostBtn}
                            style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem' }}
                            title="Remove from the object"
                            onClick={() => {
                              setPlacedObjects((prev) =>
                                prev.map((p, j) =>
                                  j === i
                                    ? { ...p, lootIds: (p.lootIds ?? []).filter((l) => l !== id) }
                                    : p
                                )
                              );
                              setDirty(true);
                              setSaved(false);
                            }}
                          >
                            {itemName(id)} ✕
                          </button>
                        ))}
                        <select
                          className={styles.formInp}
                          style={{ width: 'auto', cursor: 'pointer', fontSize: '0.7rem' }}
                          aria-label={`Add loot to object ${i + 1}`}
                          value=""
                          onChange={(ev) => {
                            const id = ev.target.value;
                            if (!id) return;
                            setPlacedObjects((prev) =>
                              prev.map((p, j) =>
                                j === i && !(p.lootIds ?? []).includes(id)
                                  ? { ...p, lootIds: [...(p.lootIds ?? []), id] }
                                  : p
                              )
                            );
                            setDirty(true);
                            setSaved(false);
                          }}
                        >
                          <option value="">+ ADD ITEM…</option>
                          {itemOptions.map((opt) => (
                            <option key={opt.id} value={opt.id}>
                              {opt.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      {/* Flavor hooks — each a variant pool (blank uses the engine
                          default). Labels carry the object index so the aria
                          labels stay unique across objects. */}
                      <div style={{ marginTop: 6 }}>
                        {(
                          [
                            ['interactText', 'INTERACT TEXT'],
                            ['desc', 'DESCRIPTION'],
                            ['foundText', 'FOUND TEXT (search hit)'],
                            ['emptyText', 'EMPTY TEXT (search miss)'],
                          ] as const
                        ).map(([field, label]) => (
                          <HookVariants
                            key={field}
                            field={`obj-${field}-${i}`}
                            label={`OBJECT ${i + 1} ${label}`}
                            variants={toVariants(o[field] as string | string[] | undefined)}
                            onChange={(variants) => {
                              setPlacedObjects((prev) =>
                                prev.map((p, j) => (j === i ? { ...p, [field]: variants } : p))
                              );
                              setDirty(true);
                              setSaved(false);
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* ── Trap (rooms only, at most one). The painter edits the
                mechanics + the narrative overrides ({name}/{dmg} substitution);
                blank fields default sensibly at overlay time. */}
            {kind === 'room' && (
              <div className={styles.card} style={{ marginTop: '1rem' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '0.75rem',
                  }}
                >
                  <p style={{ fontSize: '0.8rem', letterSpacing: '0.12em', color: 'var(--t-mid)' }}>
                    TRAP
                  </p>
                  <button
                    className={styles.ghostBtn}
                    style={{ padding: '0.3rem 0.6rem', fontSize: '0.7rem' }}
                    data-testid="toggle-trap-btn"
                    onClick={() => {
                      setTrapDraft((t) =>
                        t ? null : { name: '', dc: 12, damage: '1d6', damageType: 'piercing' }
                      );
                      setDirty(true);
                      setSaved(false);
                    }}
                  >
                    {trapDraft ? 'REMOVE TRAP' : '+ ADD TRAP'}
                  </button>
                </div>
                {!trapDraft ? (
                  <p style={{ color: 'var(--t-dim)', fontSize: '0.8rem' }}>
                    No trap. One per room: Perception (vs DC) to spot it, Dexterity to disarm,
                    damage + an optional condition on trigger, with optional narrative overrides.
                  </p>
                ) : (
                  <div
                    style={{
                      display: 'flex',
                      gap: '0.75rem',
                      alignItems: 'flex-end',
                      flexWrap: 'wrap',
                    }}
                  >
                    <div style={{ flex: '2 1 140px' }}>
                      <label className={styles.formLbl} htmlFor="trap-name">
                        NAME
                      </label>
                      <input
                        id="trap-name"
                        className={styles.formInp}
                        value={trapDraft.name}
                        onChange={(ev) => {
                          const name = ev.target.value;
                          setTrapDraft((t) => (t ? { ...t, name } : t));
                          setDirty(true);
                          setSaved(false);
                        }}
                      />
                    </div>
                    <div style={{ flex: '0 1 80px' }}>
                      <label className={styles.formLbl} htmlFor="trap-dc">
                        DC
                      </label>
                      <input
                        id="trap-dc"
                        className={styles.formInp}
                        type="number"
                        min={1}
                        max={30}
                        value={trapDraft.dc}
                        onChange={(ev) => {
                          const dc = Math.max(1, Math.min(30, parseInt(ev.target.value, 10) || 1));
                          setTrapDraft((t) => (t ? { ...t, dc } : t));
                          setDirty(true);
                          setSaved(false);
                        }}
                      />
                    </div>
                    <div style={{ flex: '0 1 100px' }}>
                      <label className={styles.formLbl} htmlFor="trap-damage">
                        DAMAGE
                      </label>
                      <input
                        id="trap-damage"
                        className={styles.formInp}
                        placeholder="2d6"
                        value={trapDraft.damage}
                        onChange={(ev) => {
                          const damage = ev.target.value;
                          setTrapDraft((t) => (t ? { ...t, damage } : t));
                          setDirty(true);
                          setSaved(false);
                        }}
                      />
                    </div>
                    <div style={{ flex: '1 1 120px' }}>
                      <label className={styles.formLbl} htmlFor="trap-damage-type">
                        DAMAGE TYPE
                      </label>
                      <select
                        id="trap-damage-type"
                        className={styles.formInp}
                        style={{ cursor: 'pointer' }}
                        value={trapDraft.damageType}
                        onChange={(ev) => {
                          const damageType = ev.target.value;
                          setTrapDraft((t) => (t ? { ...t, damageType } : t));
                          setDirty(true);
                          setSaved(false);
                        }}
                      >
                        {[
                          'acid',
                          'bludgeoning',
                          'cold',
                          'fire',
                          'force',
                          'lightning',
                          'necrotic',
                          'piercing',
                          'poison',
                          'psychic',
                          'radiant',
                          'slashing',
                          'thunder',
                        ].map((d) => (
                          <option key={d} value={d}>
                            {d.toUpperCase()}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div style={{ flex: '1 1 130px' }}>
                      <label className={styles.formLbl} htmlFor="trap-condition">
                        CONDITION
                      </label>
                      <select
                        id="trap-condition"
                        className={styles.formInp}
                        style={{ cursor: 'pointer' }}
                        value={trapDraft.condition ?? ''}
                        onChange={(ev) => {
                          const condition = ev.target.value || undefined;
                          setTrapDraft((t) => (t ? { ...t, condition } : t));
                          setDirty(true);
                          setSaved(false);
                        }}
                      >
                        <option value="">— NONE —</option>
                        {[
                          'blinded',
                          'charmed',
                          'deafened',
                          'frightened',
                          'grappled',
                          'incapacitated',
                          'paralyzed',
                          'petrified',
                          'poisoned',
                          'prone',
                          'restrained',
                          'stunned',
                          'unconscious',
                        ].map((c) => (
                          <option key={c} value={c}>
                            {c.toUpperCase()}
                          </option>
                        ))}
                      </select>
                    </div>
                    {/* Narrative overrides — each a variant pool (blank uses the
                        engine default). */}
                    {(
                      [
                        ['detectNarrative', 'DETECT TEXT'],
                        ['triggerNarrative', 'TRIGGER TEXT ({name}, {dmg})'],
                        ['disarmSuccess', 'DISARM SUCCESS'],
                        ['disarmFail', 'DISARM FAIL'],
                      ] as const
                    ).map(([field, label]) => (
                      <div key={field} style={{ flex: '1 1 240px' }}>
                        <HookVariants
                          field={`trap-${field}`}
                          label={label}
                          variants={toVariants(trapDraft[field] as string | string[] | undefined)}
                          onChange={(variants) => {
                            setTrapDraft((t) => (t ? { ...t, [field]: variants } : t));
                            setDirty(true);
                            setSaved(false);
                          }}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginTop: 8 }}>
              {saved && (
                <span style={{ color: 'var(--t-hp-high)', fontSize: '0.75rem' }} role="status">
                  SAVED — LIVE NOW
                </span>
              )}
              {error && (
                <p role="alert" style={{ color: 'var(--t-hp-low)', fontSize: '0.8rem' }}>
                  {error}
                </p>
              )}
            </div>

            {/* ── Child maps. Towns are authored on the region page (they're
                reached through its town sites); rooms on BOTH the region
                page (dungeon interiors — local sites point at rooms
                directly, no town needed) and the town page (venue
                interiors). The rooms pool is campaign-global either way.
                Each hosted panel also feeds the marker tool's target
                picker (onMaps), so a map created here is pickable
                immediately. */}
            {kind === 'region' && (
              <MapsPanel
                campaignId={campaignId}
                kind="town"
                onMaps={(maps) => setTownIds(maps.map((m) => m.id))}
                onOpenMap={
                  onOpenMap
                    ? (mapId) => {
                        if (dirty && !confirm('Discard unsaved map changes?')) return;
                        onOpenMap('town', mapId);
                      }
                    : undefined
                }
              />
            )}
            {kind === 'region' && (
              <MapsPanel
                campaignId={campaignId}
                kind="room"
                onMaps={(maps) => {
                  setRoomOptions(maps.map((m) => m.id));
                  setRoomDims(
                    Object.fromEntries(maps.map((m) => [m.id, { w: m.gridWidth, h: m.gridHeight }]))
                  );
                }}
                onOpenMap={
                  onOpenMap
                    ? (mapId) => {
                        if (dirty && !confirm('Discard unsaved map changes?')) return;
                        onOpenMap('room', mapId);
                      }
                    : undefined
                }
              />
            )}
            {kind === 'town' && (
              <MapsPanel
                campaignId={campaignId}
                kind="room"
                onMaps={(maps) => {
                  setRoomOptions(maps.map((m) => m.id));
                  setRoomDims(
                    Object.fromEntries(maps.map((m) => [m.id, { w: m.gridWidth, h: m.gridHeight }]))
                  );
                }}
                onOpenMap={
                  onOpenMap
                    ? (mapId) => {
                        if (dirty && !confirm('Discard unsaved map changes?')) return;
                        onOpenMap('room', mapId);
                      }
                    : undefined
                }
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default RegionEditorScreen;
