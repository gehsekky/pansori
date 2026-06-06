import { TERRAIN, type TerrainType } from '../shared-types.ts';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.ts';
import styles from '../styles.module.css';

// Visual map grid painter:
//   /creator/<campaign id>/region/<region id>   (kind 'region')
//   /creator/<campaign id>/town/<town id>       (kind 'town')
//
// Edits ONE map: its dense terrain grid plus the non-map details (name,
// description, scale; region encounter chance / base tier / starting
// flag; town floor). Pick a terrain from the palette and click/drag to
// paint; the TIER tool (regions only — towns carry no tiers) paints
// per-cell tier overrides (rendered as a corner number); the START tool
// relocates the party marker; the SITES/VENUES tool places and edits the
// map's transition markers (◆) — click a cell to place, click a marker to
// select, with a form for name/kind/target and MOVE/DELETE. SAVE writes
// the whole section back through the normal content PUT — same
// validation, same live refresh.
//
// The grid model is the painter's data model on purpose (design call
// 2026-06-06): cells are { t, tier?, enc? }; terrain BEHAVIOR derives
// from the shared TERRAIN registry. `enc` overrides stay JSON-only here.

interface Cell {
  t: string;
  tier?: number;
  enc?: number;
}

// A site (region) or venue (town) — the map's transition cells, edited
// visually with the SITES/VENUES tool. One shape covers both: sites are
// kind 'town'|'local' (+ townId/entryRoomId/icon/onEnter), venues are
// kind 'interior'|'gate' (+ entryRoomId).
interface EditorSite {
  id: string;
  name: string;
  pos: { x: number; y: number };
  kind: string;
  townId?: string;
  entryRoomId?: string;
  desc?: string;
  onEnter?: string;
  icon?: string;
  [key: string]: unknown;
}

interface EditorRegion {
  id: string;
  name: string;
  grid: Cell[][];
  startPos: { x: number; y: number };
  desc?: string;
  feetPerSquare?: number;
  isStartingRegion?: boolean; // regions only
  onEnter?: string; // regions only — first-entry narration (desc fallback)
  encounterChance?: number; // regions only
  baseTier?: number; // regions only
  floor?: string; // towns only
  sites?: EditorSite[];
  venues?: EditorSite[];
  [key: string]: unknown;
}

// The non-map fields editable on this page, held as strings ('' = unset)
// and parsed/pruned at save time.
interface Details {
  name: string;
  desc: string;
  feetPerSquare: string;
  onEnter: string; // regions only
  encounterChance: string; // regions only
  baseTier: string; // regions only
  floor: string; // towns only
}

function detailsFrom(r: EditorRegion): Details {
  return {
    name: r.name ?? '',
    desc: r.desc ?? '',
    feetPerSquare: r.feetPerSquare !== undefined ? String(r.feetPerSquare) : '',
    onEnter: r.onEnter ?? '',
    encounterChance: r.encounterChance !== undefined ? String(r.encounterChance) : '',
    baseTier: r.baseTier !== undefined ? String(r.baseTier) : '',
    floor: r.floor ?? '',
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

type Tool = 'terrain' | 'tier' | 'start' | 'site';

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
}: {
  campaignId: string;
  regionId: string;
  // Which map level is being painted — picks the section ('regions' /
  // 'towns'), the marker source (sites / venues), and tool availability.
  kind?: 'region' | 'town';
  onBack: () => void;
}) {
  const section = kind === 'region' ? 'regions' : 'towns';
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
  // Region painter only: the campaign's town ids, for the site townId picker.
  const [townIds, setTownIds] = useState<string[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const [tool, setTool] = useState<Tool>('terrain');
  const [terrainBrush, setTerrainBrush] = useState<TerrainType>('plains');
  const [tierBrush, setTierBrush] = useState<number>(1); // 0 = clear override
  const [painting, setPainting] = useState(false);

  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const region = regions?.find((r) => r.id === regionId) ?? null;

  useEffect(() => {
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
        setStartPos({ ...r.startPos });
        setDetails(detailsFrom(r));
        setMakeStarter(false);
        setSites(((kind === 'region' ? r.sites : r.venues) ?? []).map((s) => ({ ...s })));
        setSelectedSiteId(null);
        setMoveArmed(false);
      })
      .catch(() => setLoadErr('Could not load this campaign’s regions.'));
    // Region sites can point at the campaign's towns — load their ids for
    // the picker. Best-effort: an empty list just means no town options.
    if (kind === 'region') {
      api
        .getCampaignSection(campaignId, 'towns')
        .then((s) => {
          const list = Array.isArray(s.value) ? (s.value as Array<{ id?: unknown }>) : [];
          setTownIds(list.map((t) => t.id).filter((id): id is string => typeof id === 'string'));
        })
        .catch(() => setTownIds([]));
    }
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
        let id = `${kind === 'region' ? 'site' : 'venue'}-${n}`;
        while (sites.some((s) => s.id === id)) id += 'x';
        const draft: EditorSite =
          kind === 'region'
            ? { id, name: 'New Site', pos: { x, y }, kind: 'local' }
            : { id, name: 'New Venue', pos: { x, y }, kind: 'interior' };
        setSites((prev) => [...prev, draft]);
        setSelectedSiteId(id);
        setDirty(true);
        return;
      }
      setGrid((prev) => {
        const next = prev.map((row) => row.slice());
        const cell = { ...next[y][x] };
        if (tool === 'terrain') {
          if (cell.t === terrainBrush) return prev;
          cell.t = terrainBrush;
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
    [tool, terrainBrush, tierBrush, sites, selectedSiteId, moveArmed, kind]
  );

  // Patch the selected site; clearing a kind's target also clears the
  // other kind's leftover (flipping town↔local shouldn't strand a stale id).
  function updateSite(id: string, patch: Partial<EditorSite>) {
    setSites((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        const next = { ...s, ...patch };
        if (patch.kind === 'town') delete next.entryRoomId;
        if (patch.kind === 'local' || patch.kind === 'interior' || patch.kind === 'gate') {
          delete next.townId;
        }
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
          row.push(prev[y]?.[x] ? { ...prev[y][x] } : { t: 'plains' });
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
    setDirty(true);
    setSaved(false);
  }

  // Fold the edited sites/venues back in: optional fields prune when empty
  // ('' would fail the SLUG/min-length schemas); an empty list drops the key.
  function mergeSites(next: EditorRegion) {
    const cleaned = sites.map((s) => {
      const c: EditorSite = { ...s };
      for (const k of ['townId', 'entryRoomId', 'desc', 'onEnter', 'icon'] as const) {
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
    const next: EditorRegion = { ...r, grid, startPos };
    mergeSites(next);
    next.name = details.name.trim() || r.name;
    if (details.desc.trim()) next.desc = details.desc.trim();
    else delete next.desc;
    const fps = Number(details.feetPerSquare);
    if (!Number.isFinite(fps) || fps <= 0) {
      return { error: 'FEET PER SQUARE must be a positive number.' };
    }
    next.feetPerSquare = fps;
    if (kind === 'region') {
      if (details.onEnter.trim()) next.onEnter = details.onEnter.trim();
      else delete next.onEnter;
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
      if (makeStarter) next.isStartingRegion = true;
    } else if (details.floor === '') delete next.floor;
    else next.floor = details.floor;
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
  const markerNoun = kind === 'region' ? 'SITE' : 'VENUE';

  return (
    <div className={styles.pageFlex}>
      <div className={styles.sessionsInner}>
        <div className={styles.sessionsHeader}>
          <div>
            <h1 className={styles.title} style={{ fontSize: '1.1rem', marginBottom: 4 }}>
              {kind === 'region' ? 'REGION' : 'TOWN'} MAP —{' '}
              {(region?.name ?? regionId).toUpperCase()}
            </h1>
            <p className={styles.sub}>
              {width}×{height} · 1 SQUARE = {String(region?.feetPerSquare ?? 5280)} FT
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
                        ['start', 'START POS'],
                        ['site', kind === 'region' ? 'SITES' : 'VENUES'],
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

                {tool === 'terrain' && (
                  <div>
                    <p className={styles.formLbl}>TERRAIN</p>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {TERRAIN_TYPES.map((t) => (
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
                      ))}
                    </div>
                  </div>
                )}

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
                            NAME
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
                                ]
                              : [
                                  ['interior', 'INTERIOR'],
                                  ['gate', 'GATE (EXIT)'],
                                ]
                            ).map(([v, label]) => (
                              <option key={v} value={v}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </div>
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
                        {(selectedSite.kind === 'local' || selectedSite.kind === 'interior') && (
                          <div style={{ flex: '1 1 130px' }}>
                            <label className={styles.formLbl} htmlFor="site-room">
                              ENTRY ROOM ID
                            </label>
                            <input
                              id="site-room"
                              className={styles.formInp}
                              placeholder="e.g. old_cave"
                              value={selectedSite.entryRoomId ?? ''}
                              onChange={(e) =>
                                updateSite(selectedSite.id, { entryRoomId: e.target.value })
                              }
                            />
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

                <div>
                  <p className={styles.formLbl}>SIZE</p>
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
                    const isStart = startPos.x === x && startPos.y === y;
                    return (
                      <div
                        key={`${x},${y}`}
                        role="button"
                        tabIndex={0}
                        aria-label={`cell ${x},${y}: ${cell.t}${cell.tier ? ` tier ${cell.tier}` : ''}${isStart ? ' (start)' : ''}${site ? ` (site: ${site.name})` : ''}`}
                        data-testid={`cell-${x}-${y}`}
                        title={`(${x},${y}) ${TERRAIN[cell.t as TerrainType]?.label ?? cell.t}${site ? ` — ${site.name}` : ''}`}
                        style={{
                          width: CELL_PX,
                          height: CELL_PX,
                          background: TERRAIN_COLORS[cell.t as TerrainType] ?? '#000',
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
                        {isStart && (
                          <span aria-hidden="true" style={{ textShadow: '0 0 3px #000' }}>
                            ★
                          </span>
                        )}
                        {site && (
                          <span
                            aria-hidden="true"
                            style={{
                              color:
                                site.kind === 'town' || site.kind === 'gate'
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
                  : 'CLICK / DRAG TO PAINT · ★ START · ◆ VENUE (edit with the VENUES tool)'}
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
                  </>
                )}
                {kind === 'town' && (
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
                <div style={{ marginTop: '0.75rem' }}>
                  <label className={styles.formLbl} htmlFor="map-detail-on-enter">
                    ON ENTER NARRATION (FIRST ENTRY — FALLS BACK TO DESCRIPTION)
                  </label>
                  <textarea
                    id="map-detail-on-enter"
                    className={styles.formInp}
                    rows={2}
                    style={{ resize: 'vertical' }}
                    placeholder="Narrated the first time the party enters this region — game start counts."
                    value={details.onEnter}
                    onChange={(e) => updateDetail('onEnter', e.target.value)}
                  />
                </div>
              )}
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
          </>
        )}
      </div>
    </div>
  );
}

export default RegionEditorScreen;
