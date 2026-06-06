import { TERRAIN, type TerrainType } from '../shared-types.ts';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.ts';
import styles from '../styles.module.css';

// Visual map grid painter:
//   /creator/<campaign id>/region/<region id>   (kind 'region')
//   /creator/<campaign id>/town/<town id>       (kind 'town')
//
// Edits ONE map's dense terrain grid: pick a terrain from the palette
// and click/drag to paint; the TIER tool (regions only — towns carry no
// tiers) paints per-cell tier overrides (rendered as a corner number);
// the START tool relocates the party marker. Sites/venues render as ◆
// markers (edited via the section JSON for now). SAVE writes the whole
// section back through the normal content PUT — same validation, same
// live refresh.
//
// The grid model is the painter's data model on purpose (design call
// 2026-06-06): cells are { t, tier?, enc? }; terrain BEHAVIOR derives
// from the shared TERRAIN registry. `enc` overrides stay JSON-only here.

interface Cell {
  t: string;
  tier?: number;
  enc?: number;
}

interface EditorRegion {
  id: string;
  name: string;
  grid: Cell[][];
  startPos: { x: number; y: number };
  sites?: Array<{ id: string; name: string; pos: { x: number; y: number }; kind: string }>;
  venues?: Array<{ id: string; name: string; pos: { x: number; y: number }; kind: string }>;
  [key: string]: unknown;
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

type Tool = 'terrain' | 'tier' | 'start';

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
      })
      .catch(() => setLoadErr('Could not load this campaign’s regions.'));
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
    [tool, terrainBrush, tierBrush]
  );

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
    setDirty(true);
    setSaved(false);
  }

  async function handleSave() {
    if (!regions || !region || busy) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    const updated = regions.map((r) => (r.id === regionId ? { ...r, grid, startPos } : r));
    try {
      await api.putCampaignSection(campaignId, section, updated);
      setRegions(updated);
      setDirty(false);
      setSaved(true);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  const height = grid.length;
  const width = grid[0]?.length ?? 0;
  const markers = (kind === 'region' ? region?.sites : region?.venues) ?? [];
  const siteAt = (x: number, y: number) => markers.find((s) => s.pos.x === x && s.pos.y === y);

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
                          setPainting(true);
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
                              textShadow: '0 0 3px #000',
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
                  ? 'CLICK / DRAG TO PAINT · ★ START · ◆ SITE (edit sites in the REGIONS JSON) · CORNER NUMBER = TIER OVERRIDE'
                  : 'CLICK / DRAG TO PAINT · ★ START · ◆ VENUE (edit venues in the TOWNS JSON)'}
              </p>
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
