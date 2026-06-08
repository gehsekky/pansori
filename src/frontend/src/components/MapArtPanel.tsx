import { FLOOR_TILES, MARKER_TILES, TERRAIN_TILES, compileTint } from '../types.ts';
import type { FloorType, TerrainTileId, TileChoice, TileTint } from '../types.ts';
import React, { useEffect, useState } from 'react';
import { api } from '../lib/api.ts';
import styles from '../styles.module.css';

// ─── MAP ART panel (campaign creator) ────────────────────────────────────────
//
// Structured editor for the `terrainArt` section — the campaign's visual
// skin over the shared tile set, split by map level:
//
//   REGIONAL — one row per overland terrain type (a live preview, a tile
//   pick from the TERRAIN_TILES catalog, hue / saturation / brightness
//   tint sliders layered over the tile's own recolor) plus the TOWN
//   MARKER row (the art every town site draws, from MARKER_TILES). The
//   terrain picks follow a painted cell onto EVERY map level — a water
//   square in a room renders the same skinned tile.
//
//   TOWN & LOCAL — the floor rows: the seamless ground textures town and
//   room maps draw under every walkable cell, keyed by the AUTHORED floor
//   type. A row remaps a family (grass → sand) and/or tints it.
//
// Saves the minimal map: an untinted default pick stores nothing, a bare
// tile pick stores the id, a tinted pick stores { tile, tint }. Entries
// for types this panel doesn't surface (authored via the raw JSON editor)
// are preserved untouched. PURELY VISUAL — mechanics stay on the type.

// The terrain types the panel surfaces: the 8 overland types with painted
// tiles (each type's default tile id is its own name in the catalog).
const OVERLAND_TYPES = [
  'plains',
  'road',
  'forest',
  'hills',
  'swamp',
  'snow',
  'water',
  'mountain',
] as const;

const FLOOR_TYPES = Object.keys(FLOOR_TILES) as FloorType[];

// Theme presets — pre-fill every terrain row's tile pick (tints cleared)
// and lay one shared tint over all four floor families so interiors match
// the overland mood; CLASSIC resets everything. Same recolor sets the raw
// JSON editor offers.
const PRESETS: Record<
  string,
  {
    tiles: Partial<Record<(typeof OVERLAND_TYPES)[number], TerrainTileId>>;
    floorTint?: TileTint;
  }
> = {
  CLASSIC: { tiles: {} },
  ASHLANDS: {
    tiles: {
      plains: 'plains-ash',
      road: 'road-cracked',
      forest: 'forest-dead',
      hills: 'hills-barren',
      swamp: 'swamp-blight',
      water: 'water-murk',
      mountain: 'mountain-char',
      snow: 'snow-ashfall',
    },
    floorTint: { saturate: 0.45, brightness: 0.75 },
  },
  FROSTBOUND: {
    tiles: {
      plains: 'plains-tundra',
      road: 'road-snowbound',
      forest: 'forest-frost',
      hills: 'hills-frost',
      swamp: 'swamp-frozen',
      water: 'water-ice',
    },
    floorTint: { saturate: 0.55, brightness: 1.2 },
  },
};

// A row's working value: the picked tile id + the raw tint knobs (identity
// values mean "no tint" and are dropped on save).
interface RowValue {
  tile: string;
  tint: Required<TileTint>;
}

const IDENTITY: Required<TileTint> = { hue: 0, saturate: 1, brightness: 1 };

const parseChoice = (c: unknown, fallback: string): RowValue => {
  if (typeof c === 'string') return { tile: c, tint: { ...IDENTITY } };
  if (c && typeof c === 'object' && 'tile' in c) {
    const o = c as { tile: string; tint?: TileTint };
    return { tile: o.tile, tint: { ...IDENTITY, ...o.tint } };
  }
  return { tile: fallback, tint: { ...IDENTITY } };
};

const cleanTint = (t: Required<TileTint>): TileTint | undefined => {
  const out: TileTint = {};
  if (t.hue !== 0) out.hue = t.hue;
  if (t.saturate !== 1) out.saturate = t.saturate;
  if (t.brightness !== 1) out.brightness = t.brightness;
  return Object.keys(out).length ? out : undefined;
};

// Fold a row back to its stored shape; undefined = the all-default row
// stores no entry at all.
const buildChoice = (v: RowValue, defaultTile: string): TileChoice | undefined => {
  const tint = cleanTint(v.tint);
  if (v.tile === defaultTile && !tint) return undefined;
  return tint ? { tile: v.tile as TerrainTileId, tint } : (v.tile as TerrainTileId);
};

const lbl: React.CSSProperties = { fontSize: '0.65rem', color: 'var(--t-dim)' };

// A live tile preview: the picked tile's base PNG with its catalog recolor
// + the row tint. Terrain/marker tiles keep their own 2:3 (256×384) ratio;
// floor textures are square.
function Preview({ src, filter, square }: { src: string; filter?: string; square?: boolean }) {
  return (
    <img
      src={src}
      alt=""
      width={40}
      height={square ? 40 : 60}
      style={{ display: 'block', filter, border: '1px solid var(--t-line)' }}
    />
  );
}

function TintSliders({
  name,
  tint,
  onChange,
}: {
  name: string;
  tint: Required<TileTint>;
  onChange: (tint: Required<TileTint>) => void;
}) {
  const slider = (
    key: keyof TileTint,
    label: string,
    min: number,
    max: number,
    step: number,
    show: string
  ) => (
    <label style={{ ...lbl, display: 'flex', alignItems: 'center', gap: 4 }}>
      {label}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={tint[key]}
        aria-label={`${name} ${label.toLowerCase()}`}
        style={{ width: 72 }}
        onChange={(e) => onChange({ ...tint, [key]: Number(e.target.value) })}
      />
      <span style={{ width: 30, textAlign: 'right' }}>{show}</span>
    </label>
  );
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
      {slider('hue', 'HUE', -180, 180, 5, `${tint.hue}°`)}
      {slider('saturate', 'SAT', 0, 3, 0.05, `×${tint.saturate}`)}
      {slider('brightness', 'BRI', 0, 2, 0.05, `×${tint.brightness}`)}
    </div>
  );
}

function MapArtPanel({ campaignId }: { campaignId: string }) {
  const [tab, setTab] = useState<'regional' | 'interior'>('regional');
  const [rows, setRows] = useState<Record<string, RowValue> | null>(null);
  const [marker, setMarker] = useState<RowValue>({ tile: 'village', tint: { ...IDENTITY } });
  const [floors, setFloors] = useState<Record<string, RowValue>>({});
  // Entries the panel doesn't surface (other terrain types authored via the
  // raw JSON editor) — carried through saves untouched.
  const [extras, setExtras] = useState<Record<string, unknown>>({});
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setRows(null);
    setLoadErr(null);
    setError(null);
    setSaved(false);
    setDirty(false);
    api
      .getCampaignSection(campaignId, 'terrainArt')
      .then((s) => {
        // Normalize defensively — anything not a plain object reads as {}.
        const art =
          s.value && typeof s.value === 'object' && !Array.isArray(s.value)
            ? (s.value as Record<string, unknown>)
            : {};
        const next: Record<string, RowValue> = {};
        for (const t of OVERLAND_TYPES) next[t] = parseChoice(art[t], t);
        const markers = art.markers as { town?: unknown } | undefined;
        setMarker(parseChoice(markers?.town, 'village'));
        const storedFloors = (
          art.floors && typeof art.floors === 'object' ? art.floors : {}
        ) as Record<string, unknown>;
        setFloors(Object.fromEntries(FLOOR_TYPES.map((f) => [f, parseChoice(storedFloors[f], f)])));
        setExtras(
          Object.fromEntries(
            Object.entries(art).filter(
              ([k]) =>
                k !== 'markers' &&
                k !== 'floors' &&
                !(OVERLAND_TYPES as readonly string[]).includes(k)
            )
          )
        );
        setRows(next);
      })
      .catch(() => setLoadErr('Could not load this campaign’s map art.'));
  }, [campaignId]);

  const touch = () => {
    setDirty(true);
    setSaved(false);
  };
  const patchRow = (t: string, patch: Partial<RowValue>) => {
    setRows((prev) => (prev ? { ...prev, [t]: { ...prev[t], ...patch } } : prev));
    touch();
  };
  const patchFloor = (f: string, patch: Partial<RowValue>) => {
    setFloors((prev) => ({ ...prev, [f]: { ...prev[f], ...patch } }));
    touch();
  };

  async function handleSave() {
    if (!rows || busy) return;
    setBusy(true);
    setError(null);
    const out: Record<string, unknown> = { ...extras };
    for (const t of OVERLAND_TYPES) {
      const c = buildChoice(rows[t], t);
      if (c !== undefined) out[t] = c;
    }
    const m = buildChoice(marker, 'village');
    if (m !== undefined) out.markers = { town: m };
    const floorsOut: Record<string, unknown> = {};
    for (const f of FLOOR_TYPES) {
      const c = buildChoice(floors[f], f);
      if (c !== undefined) floorsOut[f] = c;
    }
    if (Object.keys(floorsOut).length) out.floors = floorsOut;
    try {
      await api.putCampaignSection(campaignId, 'terrainArt', out);
      setDirty(false);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setBusy(false);
    }
  }

  // One editable row: preview + tile pick + tint sliders + reset.
  const artRow = (
    name: string,
    value: RowValue,
    catalog: Record<string, { base: string; label: string; filter?: string; variants?: number }>,
    dir: string,
    defaultTile: string,
    onPatch: (patch: Partial<RowValue>) => void,
    square = false
  ) => {
    const spec = catalog[value.tile] ?? catalog[defaultTile];
    const tintFilter = compileTint(cleanTint(value.tint));
    const filter = [spec.filter, tintFilter].filter(Boolean).join(' ') || undefined;
    const isDefault = value.tile === defaultTile && !tintFilter;
    // Tile + marker families live at <base>_<n>.png — preview the first
    // painting. Floor catalog bases already embed their variant suffix.
    const previewSrc = `${dir}/${spec.base}${dir === '/art/floors' ? '' : '_1'}.png`;
    return (
      // Bottom-aligned: the 2.5D tile previews carry a transparent overhang
      // up top, so the painted ground sits at the bottom edge — controls
      // line up with THAT, not the geometric center (same fix as the sites
      // editor's ICON preview).
      <div
        key={name}
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: 12,
          flexWrap: 'wrap',
          padding: '0.4rem 0',
          borderTop: '1px solid var(--t-line)',
        }}
      >
        <span style={{ ...lbl, width: 96, letterSpacing: '0.08em' }}>{name.toUpperCase()}</span>
        <Preview src={previewSrc} filter={filter} square={square} />
        <select
          className={styles.formInp}
          aria-label={`${name} tile`}
          value={value.tile}
          style={{ width: 'auto', fontSize: '0.75rem' }}
          onChange={(e) => onPatch({ tile: e.target.value })}
        >
          {Object.entries(catalog).map(([id, s]) => (
            <option key={id} value={id}>
              {s.label}
              {id === defaultTile ? ' (default)' : ''}
            </option>
          ))}
        </select>
        <TintSliders name={name} tint={value.tint} onChange={(tint) => onPatch({ tint })} />
        {!isDefault && (
          <button
            className={styles.ghostBtn}
            style={{ padding: '0.2rem 0.5rem', fontSize: '0.65rem' }}
            aria-label={`${name} reset`}
            onClick={() => onPatch({ tile: defaultTile, tint: { ...IDENTITY } })}
          >
            RESET
          </button>
        )}
      </div>
    );
  };

  return (
    <div className={styles.card} style={{ marginTop: '1rem' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '0.5rem',
        }}
      >
        <p style={{ fontSize: '0.8rem', letterSpacing: '0.12em', color: 'var(--t-mid)' }}>
          MAP ART
          {dirty && <span style={{ color: 'var(--t-hp-mid)' }}> · UNSAVED</span>}
          {saved && <span style={{ color: 'var(--t-hp-high)' }}> · SAVED</span>}
        </p>
        <button
          className={styles.ghostBtn}
          style={{ padding: '0.3rem 0.6rem', fontSize: '0.7rem' }}
          disabled={!dirty || busy}
          data-testid="save-map-art-btn"
          onClick={handleSave}
        >
          SAVE MAP ART
        </button>
      </div>
      <p style={{ ...lbl, marginBottom: '0.5rem' }}>
        THE CAMPAIGN’S VISUAL SKIN — TILE PICKS AND TINTS ARE PURELY COSMETIC; TERRAIN MECHANICS
        DON’T CHANGE.
      </p>
      {loadErr && <p style={{ color: 'var(--t-hp-low)', fontSize: '0.8rem' }}>{loadErr}</p>}
      {rows && (
        <>
          <div
            style={{
              display: 'flex',
              gap: 6,
              flexWrap: 'wrap',
              alignItems: 'center',
              marginBottom: '0.5rem',
            }}
          >
            <span style={lbl}>THEME PRESET:</span>
            {Object.keys(PRESETS).map((preset) => (
              <button
                key={preset}
                className={styles.ghostBtn}
                style={{ padding: '0.25rem 0.6rem', fontSize: '0.7rem' }}
                data-testid={`map-art-preset-${preset.toLowerCase()}`}
                onClick={() => {
                  // A preset themes the WHOLE skin: terrain tile picks plus
                  // one shared mood tint over every floor family.
                  const next: Record<string, RowValue> = {};
                  for (const t of OVERLAND_TYPES)
                    next[t] = { tile: PRESETS[preset].tiles[t] ?? t, tint: { ...IDENTITY } };
                  setRows(next);
                  const floorTint = PRESETS[preset].floorTint;
                  setFloors(
                    Object.fromEntries(
                      FLOOR_TYPES.map((f) => [f, { tile: f, tint: { ...IDENTITY, ...floorTint } }])
                    )
                  );
                  touch();
                }}
              >
                {preset}
              </button>
            ))}
          </div>
          {/* Map-level tabs: terrain + the town marker live on the regional
              view; floors are the town/local ground. */}
          <div style={{ display: 'flex', gap: 6, marginBottom: '0.25rem' }}>
            {(
              [
                ['regional', 'REGIONAL'],
                ['interior', 'TOWN & LOCAL'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                className={styles.ghostBtn}
                aria-pressed={tab === id}
                data-testid={`map-art-tab-${id}`}
                style={{
                  padding: '0.3rem 0.6rem',
                  fontSize: '0.7rem',
                  borderColor: tab === id ? 'var(--t-primary)' : undefined,
                }}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </div>
          {tab === 'regional' && (
            <>
              <p style={{ ...lbl, margin: '0.25rem 0 0.25rem' }}>
                TERRAIN PICKS FOLLOW A PAINTED CELL ONTO EVERY MAP LEVEL — A WATER SQUARE IN A ROOM
                RENDERS THE SAME SKINNED TILE.
              </p>
              {OVERLAND_TYPES.map((t) =>
                artRow(t, rows[t], TERRAIN_TILES, '/art/tiles', t, (patch) => patchRow(t, patch))
              )}
              {artRow('town marker', marker, MARKER_TILES, '/art/markers', 'village', (patch) => {
                setMarker((prev) => ({ ...prev, ...patch }));
                touch();
              })}
            </>
          )}
          {tab === 'interior' && (
            <>
              <p style={{ ...lbl, margin: '0.25rem 0 0.25rem' }}>
                THE GROUND TEXTURES TOWN + ROOM MAPS DRAW UNDER EVERY WALKABLE CELL, KEYED BY THE
                FLOOR THE MAP&#39;S AUTHOR PICKED — REMAP A FAMILY AND/OR TINT IT.
              </p>
              {FLOOR_TYPES.map((f) =>
                artRow(
                  `${f} floor`,
                  floors[f],
                  FLOOR_TILES,
                  '/art/floors',
                  f,
                  (patch) => patchFloor(f, patch),
                  true
                )
              )}
            </>
          )}
        </>
      )}
      {error && (
        <p role="alert" style={{ color: 'var(--t-hp-low)', fontSize: '0.8rem', marginTop: 8 }}>
          {error}
        </p>
      )}
    </div>
  );
}

export default MapArtPanel;
