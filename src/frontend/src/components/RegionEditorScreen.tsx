import DialogueEditor, { type DialogueNode } from './DialogueEditor.tsx';
import { TERRAIN, type TerrainType } from '../shared-types.ts';
import { useCallback, useEffect, useState } from 'react';
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
  tier?: number;
  enc?: number;
  m?: string; // rooms only — one mechanical flag per cell
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
  onEnter?: string;
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
  // Level narration hooks (all kinds): FIRST variant overrides plain on
  // the first scope entry/exit; region first-enter falls back to desc.
  onEnter?: string;
  onFirstEnter?: string;
  onExit?: string;
  onFirstExit?: string;
  encounterChance?: number; // regions only
  encounterTable?: string[]; // regions only — wilderness creature names
  baseTier?: number; // regions only
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

// A searchable/interactable object as the painter edits it. desc/found/
// empty texts are preserved on save but edited via the ROOMS JSON.
interface EditorObject {
  id: string;
  name: string;
  interactText?: string;
  searchDC?: number;
  lootIds?: string[];
  pos?: { x: number; y: number };
  [key: string]: unknown;
}

// The room's (at most one) trap. The painter edits the mechanics; the
// narrative overrides live in the ROOMS JSON and are preserved on save.
interface EditorTrap {
  name: string;
  dc: number;
  damage: string;
  damageType: string;
  condition?: string;
  [key: string]: unknown;
}

// A placed NPC, as the painter edits it. The dialogue tree edits through
// the structured DialogueEditor; shops and custom stat blocks are preserved
// on save but edited via the ROOMS JSON.
interface EditorNpc {
  id: string;
  name: string;
  attitude: string;
  greeting: string;
  // NPC narrative hooks — FIRST overrides the plain one once (first talk /
  // first explicit end of conversation).
  firstGreeting?: string;
  goodbye?: string;
  firstGoodbye?: string;
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

// The non-map fields editable on this page, held as strings ('' = unset)
// and parsed/pruned at save time.
interface Details {
  name: string;
  desc: string;
  feetPerSquare: string;
  onEnter: string;
  onFirstEnter: string;
  onExit: string;
  onFirstExit: string;
  encounterChance: string; // regions only
  baseTier: string; // regions only
  floor: string; // towns + rooms
  lighting: string; // rooms only
}

function detailsFrom(r: EditorRegion): Details {
  return {
    name: r.name ?? '',
    desc: r.desc ?? '',
    feetPerSquare: r.feetPerSquare !== undefined ? String(r.feetPerSquare) : '',
    onEnter: r.onEnter ?? '',
    onFirstEnter: r.onFirstEnter ?? '',
    onExit: r.onExit ?? '',
    onFirstExit: r.onFirstExit ?? '',
    encounterChance: r.encounterChance !== undefined ? String(r.encounterChance) : '',
    baseTier: r.baseTier !== undefined ? String(r.baseTier) : '',
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

type Tool = 'terrain' | 'tier' | 'start' | 'site' | 'mech' | 'size';

const CELL_PX = 30;

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

function RegionEditorScreen({
  campaignId,
  regionId,
  kind = 'region',
  onBack,
  onOpenMap,
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
  // Rooms only: enemy placements ({template name, count}) + the bestiary
  // names that feed the picker (ambient catalog + campaign customs).
  const [placedEnemies, setPlacedEnemies] = useState<Array<{ name: string; count: number }>>([]);
  const [monsterNames, setMonsterNames] = useState<string[]>([]);
  // Region wilderness encounter table (creature names), edited as chips.
  const [encounterTable, setEncounterTable] = useState<string[]>([]);
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
  const [tierBrush, setTierBrush] = useState<number>(1); // 0 = clear override
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
        setGrid(r.grid.map((row) => row.map((c) => ({ ...c }))));
        const marker = (kind === 'room' ? r.entryPos : r.startPos) ?? { x: 0, y: 0 };
        setStartPos({ ...marker });
        setDetails(detailsFrom(r));
        setMakeStarter(false);
        setCanRest(!!r.canRest);
        setEncounterTable([...(r.encounterTable ?? [])]);
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
        const customNames = Array.isArray(customs.value)
          ? (customs.value as Array<{ name?: unknown }>)
              .map((c) => c.name)
              .filter((n): n is string => typeof n === 'string')
          : [];
        const catalogNames = catalog
          .map((c) => c.definition?.name)
          .filter((n): n is string => typeof n === 'string');
        setMonsterNames([...new Set([...customNames, ...catalogNames])]);
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
        } else {
          // tier tool: 0 clears the override.
          if (tierBrush === 0) delete cell.tier;
          else cell.tier = tierBrush;
        }
        next[y] = next[y].slice();
        next[y][x] = cell;
        return next;
      });
      setDirty(true);
    },
    [tool, terrainBrush, tierBrush, mechBrush, sites, selectedSiteId, moveArmed, kind, placeArm]
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
    if (kind === 'room' && placedNpcs.some((n) => !n.name.trim() || !n.greeting.trim())) {
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
    // Level narration hooks — every kind.
    for (const key of ['onEnter', 'onFirstEnter', 'onExit', 'onFirstExit'] as const) {
      if (details[key].trim()) next[key] = details[key].trim();
      else delete next[key];
    }
    if (kind === 'region') {
      if (details.encounterChance.trim() === '') delete next.encounterChance;
      else {
        const enc = Number(details.encounterChance);
        if (!Number.isFinite(enc) || enc < 0 || enc > 1) {
          return { error: 'ENCOUNTER CHANCE must be between 0 and 1.' };
        }
        next.encounterChance = enc;
      }
      if (details.baseTier === '') delete next.baseTier;
      else next.baseTier = Number(details.baseTier);
      if (encounterTable.length > 0) next.encounterTable = encounterTable;
      else delete next.encounterTable;
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
            const c: EditorNpc = { ...n, name: n.name.trim(), greeting: n.greeting.trim() };
            if (!c.icon) delete c.icon;
            if (!c.pos) delete c.pos;
            if (!c.firstGreeting) delete c.firstGreeting;
            if (!c.goodbye) delete c.goodbye;
            if (!c.firstGoodbye) delete c.firstGoodbye;
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
            if (!c.interactText) delete c.interactText;
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

  function updateDetail(key: keyof Details, value: string) {
    setDetails((d) => ({ ...d, [key]: value }));
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

  return (
    <div className={styles.pageFlex}>
      <div className={styles.sessionsInner}>
        <div className={styles.sessionsHeader}>
          <div>
            <h1 className={styles.title} style={{ fontSize: '1.1rem', marginBottom: 4 }}>
              {kind.toUpperCase()} MAP — {(region?.name ?? regionId).toUpperCase()}
            </h1>
            <p className={styles.sub}>
              {width}×{height} · 1 SQUARE = {String(region?.feetPerSquare ?? defaultScale)} FT
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
                        ...(kind === 'region' ? [['tier', 'TIER'] as [Tool, string]] : []),
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

                {tool === 'tier' && (
                  <div>
                    <p className={styles.formLbl}>TIER (PAINTS A PER-CELL OVERRIDE)</p>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {[1, 2, 3, 4, 0].map((t) => (
                        <button
                          key={t}
                          className={styles.ghostBtn}
                          aria-pressed={tierBrush === t}
                          style={{
                            padding: '0.25rem 0.6rem',
                            fontSize: '0.7rem',
                            borderColor: tierBrush === t ? 'var(--t-primary)' : undefined,
                          }}
                          onClick={() => setTierBrush(t)}
                        >
                          {t === 0 ? 'CLEAR' : `TIER ${t}`}
                        </button>
                      ))}
                    </div>
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
                          <div style={{ flex: '1 1 110px' }}>
                            <label className={styles.formLbl} htmlFor="site-icon">
                              ICON
                            </label>
                            <input
                              id="site-icon"
                              className={styles.formInp}
                              placeholder="default"
                              value={selectedSite.icon ?? ''}
                              onChange={(e) =>
                                updateSite(selectedSite.id, { icon: e.target.value })
                              }
                            />
                          </div>
                        )}
                        {kind === 'region' && (
                          // Sites only — venues/exits carry no narration hook
                          // (the schema would reject one).
                          <div style={{ flex: '2 1 200px' }}>
                            <label className={styles.formLbl} htmlFor="site-on-enter">
                              ON ENTER NARRATION
                            </label>
                            <input
                              id="site-on-enter"
                              className={styles.formInp}
                              placeholder="none"
                              value={selectedSite.onEnter ?? ''}
                              onChange={(e) =>
                                updateSite(selectedSite.id, { onEnter: e.target.value })
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
                        aria-label={`cell ${x},${y}: ${cell.t ?? 'floor'}${cell.m ? ` [${cell.m}]` : ''}${cell.tier ? ` tier ${cell.tier}` : ''}${isStart ? ' (start)' : ''}${site ? ` (site: ${site.name})` : ''}${cellLoot ? ` (loot: ${itemName(cellLoot.itemId)})` : ''}${cellNpc ? ` (npc: ${cellNpc.name})` : ''}${cellObject ? ` (object: ${cellObject.name})` : ''}`}
                        data-testid={`cell-${x}-${y}`}
                        title={`(${x},${y}) ${cell.t ? (TERRAIN[cell.t as TerrainType]?.label ?? cell.t) : 'floor'}${cell.m ? ` [${cell.m}]` : ''}${site ? ` — ${site.name}` : ''}`}
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
                        {cell.tier !== undefined && (
                          <span
                            aria-hidden="true"
                            style={{
                              position: 'absolute',
                              top: 0,
                              right: 2,
                              fontSize: 9,
                              color: '#fff',
                              textShadow: '0 0 2px #000',
                            }}
                          >
                            {cell.tier}
                          </span>
                        )}
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
                {kind === 'region' && (
                  <>
                    <div style={{ flex: '1 1 120px' }}>
                      <label className={styles.formLbl} htmlFor="map-detail-enc">
                        ENCOUNTER CHANCE (0–1)
                      </label>
                      <input
                        id="map-detail-enc"
                        className={styles.formInp}
                        type="number"
                        min={0}
                        max={1}
                        step={0.05}
                        placeholder="none"
                        value={details.encounterChance}
                        onChange={(e) => updateDetail('encounterChance', e.target.value)}
                      />
                    </div>
                    <div style={{ flex: '1 1 100px' }}>
                      <label className={styles.formLbl} htmlFor="map-detail-tier">
                        BASE TIER
                      </label>
                      <select
                        id="map-detail-tier"
                        className={styles.formInp}
                        style={{ cursor: 'pointer' }}
                        value={details.baseTier}
                        onChange={(e) => updateDetail('baseTier', e.target.value)}
                      >
                        <option value="">—</option>
                        {[1, 2, 3, 4].map((t) => (
                          <option key={t} value={String(t)}>
                            TIER {t}
                          </option>
                        ))}
                      </select>
                    </div>
                    {/* Wilderness encounter table — the creatures the
                        per-square ENCOUNTER CHANCE rolls materialize. */}
                    <div style={{ flexBasis: '100%' }}>
                      <p className={styles.formLbl}>ENCOUNTER TABLE (rolled by ENCOUNTER CHANCE)</p>
                      <div
                        style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}
                      >
                        {encounterTable.map((name) => (
                          <button
                            key={name}
                            className={styles.ghostBtn}
                            style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem' }}
                            title="Remove from the table"
                            onClick={() => {
                              setEncounterTable((prev) => prev.filter((n) => n !== name));
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
                          aria-label="Add encounter creature"
                          value=""
                          onChange={(ev) => {
                            const name = ev.target.value;
                            if (!name) return;
                            setEncounterTable((prev) =>
                              prev.includes(name) ? prev : [...prev, name]
                            );
                            setDirty(true);
                            setSaved(false);
                          }}
                        >
                          <option value="">+ ADD CREATURE…</option>
                          {monsterNames.map((n) => (
                            <option key={n} value={n}>
                              {n}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </>
                )}
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
              {(
                [
                  ['onEnter', 'ON ENTER'],
                  ['onFirstEnter', 'ON FIRST ENTER'],
                  ['onExit', 'ON EXIT'],
                  ['onFirstExit', 'ON FIRST EXIT'],
                ] as Array<[keyof Details, string]>
              ).map(([key, label]) => (
                <div key={key} style={{ marginBottom: '0.75rem' }}>
                  <label className={styles.formLbl} htmlFor={`map-hook-${key}`}>
                    {label}
                  </label>
                  <textarea
                    id={`map-hook-${key}`}
                    className={styles.formInp}
                    rows={3}
                    style={{ resize: 'vertical' }}
                    placeholder="none"
                    value={details[key]}
                    onChange={(e) => updateDetail(key, e.target.value)}
                  />
                </div>
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
                      {/* NPC narrative fields — one full-width row each, like
                          the room NARRATION HOOKS card. FIRST overrides the
                          plain one once (first talk / first end). */}
                      {(
                        [
                          ['greeting', 'GREETING', 'What they say when the party talks to them'],
                          ['firstGreeting', 'FIRST GREETING', 'defaults to greeting'],
                          ['goodbye', 'GOODBYE', 'none'],
                          ['firstGoodbye', 'FIRST GOODBYE', 'defaults to goodbye'],
                        ] as const
                      ).map(([key, label, ph]) => (
                        <div key={key} style={{ marginTop: 6 }}>
                          <label className={styles.formLbl} htmlFor={`npc-${key}-${i}`}>
                            {label}
                          </label>
                          <textarea
                            id={`npc-${key}-${i}`}
                            className={styles.formInp}
                            rows={3}
                            style={{ resize: 'vertical' }}
                            placeholder={ph}
                            value={(n[key] as string) ?? ''}
                            onChange={(ev) => {
                              const v = ev.target.value;
                              setPlacedNpcs((prev) =>
                                prev.map((p, j) => (j === i ? { ...p, [key]: v } : p))
                              );
                              setDirty(true);
                              setSaved(false);
                            }}
                          />
                        </div>
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
                        <div style={{ flex: '3 1 200px' }}>
                          <label className={styles.formLbl} htmlFor={`obj-interact-${i}`}>
                            INTERACT TEXT
                          </label>
                          <input
                            id={`obj-interact-${i}`}
                            className={styles.formInp}
                            placeholder="default"
                            value={o.interactText ?? ''}
                            onChange={(ev) => {
                              const interactText = ev.target.value;
                              setPlacedObjects((prev) =>
                                prev.map((p, j) => (j === i ? { ...p, interactText } : p))
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
                    </div>
                  ))
                )}
              </div>
            )}

            {/* ── Trap (rooms only, at most one). The painter edits the
                mechanics; narrative overrides ({name}/{dmg} substitution)
                live in the ROOMS JSON and default sensibly. */}
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
                    damage + an optional condition on trigger. Narrative overrides edit via the
                    ROOMS JSON.
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
                onMaps={(maps) => setRoomOptions(maps.map((m) => m.id))}
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
                onMaps={(maps) => setRoomOptions(maps.map((m) => m.id))}
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
