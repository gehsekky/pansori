import { useEffect, useState } from 'react';
import { api } from '../lib/api.ts';
import styles from '../styles.module.css';

// REGIONS / TOWNS / ROOMS panels on the campaign creator screen — the
// card-based way into the map painter. One card per defined map (click →
// painter); + NEW REGION/TOWN/ROOM appends a starter to the section (the
// first region of a campaign becomes the starting region; a starter town
// ships with a gate venue; a starter room ships with an ascend exit so
// the party can always leave) and jumps straight to the painter. Bulk
// edits still live in the section JSON of the CONTENT box above.

interface PanelMap {
  id: string;
  name: string;
  isStartingRegion?: boolean; // regions only
  desc?: string;
  grid?: Array<Array<unknown>>;
  sites?: Array<unknown>; // regions only
  venues?: Array<unknown>; // towns only
  exits?: Array<unknown>; // rooms only
  [key: string]: unknown;
}

const SECTION = { region: 'regions', town: 'towns', room: 'rooms' } as const;
const MARKER_NOUN = { region: 'SITE', town: 'VENUE', room: 'EXIT' } as const;

function starterMap(
  kind: 'region' | 'town' | 'room',
  id: string,
  name: string,
  isFirst: boolean
): PanelMap {
  if (kind === 'room') {
    // Room cells are {t?, m?} — bare {} = floor. Always leavable: the
    // starter ships with an ascend exit.
    return {
      id,
      name,
      desc: 'An empty room, waiting to be furnished.',
      grid: Array.from({ length: 6 }, () => Array.from({ length: 8 }, () => ({}))),
      entryPos: { x: 1, y: 1 },
      exits: [{ pos: { x: 0, y: 1 }, ascends: true, label: 'Way out' }],
      floor: 'cobblestone',
    };
  }
  const grid = Array.from({ length: 8 }, () => Array.from({ length: 10 }, () => ({ t: 'plains' })));
  if (kind === 'region') {
    return {
      id,
      name,
      isStartingRegion: isFirst,
      feetPerSquare: 5280,
      grid,
      startPos: { x: 1, y: 1 },
    };
  }
  return {
    id,
    name,
    feetPerSquare: 25,
    grid,
    startPos: { x: 1, y: 1 },
    floor: 'dirt',
    venues: [{ id: 'gate', name: 'Town Gate', pos: { x: 0, y: 1 }, kind: 'gate' }],
  };
}

function MapsPanel({
  campaignId,
  kind,
  onOpenMap,
}: {
  campaignId: string;
  kind: 'region' | 'town' | 'room';
  // Navigate to the painter (/creator/<campaign id>/<kind>/<map id>).
  onOpenMap?: (mapId: string) => void;
}) {
  const section = SECTION[kind];
  const [maps, setMaps] = useState<PanelMap[] | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [createErr, setCreateErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Same name→slug derivation as campaign creation (SLUG: a-z 0-9 - _).
  const newId = newName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

  useEffect(() => {
    setMaps(null);
    setLoadErr(null);
    setCreating(false);
    setNewName('');
    setCreateErr(null);
    api
      .getCampaignSection(campaignId, section)
      .then((s) => setMaps(Array.isArray(s.value) ? (s.value as PanelMap[]) : []))
      .catch(() => setLoadErr(`Could not load this campaign’s ${section}.`));
  }, [campaignId, section]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !maps || newId.length === 0) return;
    if (maps.some((m) => m.id === newId)) {
      setCreateErr(`The id "${newId}" is taken — pick a different name.`);
      return;
    }
    setBusy(true);
    setCreateErr(null);
    const next = [...maps, starterMap(kind, newId, newName.trim(), maps.length === 0)];
    try {
      await api.putCampaignSection(campaignId, section, next);
      setMaps(next);
      setCreating(false);
      setNewName('');
      onOpenMap?.(newId);
    } catch {
      setCreateErr(`Could not create the ${kind} — try again.`);
    } finally {
      setBusy(false);
    }
  }

  const KIND_LABEL = kind.toUpperCase();
  return (
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
          {section.toUpperCase()}
        </p>
        <button
          data-testid={`new-${kind}-btn`}
          className={styles.ghostBtn}
          style={{ padding: '0.3rem 0.6rem', fontSize: '0.7rem' }}
          onClick={() => {
            setCreating((v) => !v);
            setCreateErr(null);
          }}
        >
          + NEW {KIND_LABEL}
        </button>
      </div>

      {loadErr && (
        <p role="alert" style={{ color: 'var(--t-hp-low)', fontSize: '0.8rem' }}>
          {loadErr}
        </p>
      )}

      {creating && (
        <form
          onSubmit={handleCreate}
          style={{
            display: 'flex',
            gap: '0.5rem',
            alignItems: 'flex-end',
            marginBottom: '0.85rem',
          }}
        >
          <div style={{ flex: 1 }}>
            <label className={styles.formLbl} htmlFor={`new-${kind}-name`}>
              {KIND_LABEL} NAME
            </label>
            <input
              id={`new-${kind}-name`}
              className={styles.formInp}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={
                kind === 'region'
                  ? 'e.g. The Frost Reach'
                  : kind === 'town'
                    ? 'e.g. Oakvale'
                    : 'e.g. The Taproom'
              }
              autoFocus
            />
          </div>
          <button
            type="submit"
            className={styles.sendBtn}
            disabled={busy || newId.length === 0}
            data-testid={`create-${kind}-btn`}
          >
            CREATE
          </button>
        </form>
      )}
      {creating && (
        <p style={{ fontSize: '0.7rem', color: 'var(--t-dim)', marginTop: -6, marginBottom: 10 }}>
          ID: {newId || '—'} · {kind === 'room' ? '8×6 BARE-FLOOR' : '10×8 PLAINS'} STARTER — OPENS
          IN THE PAINTER
          {kind === 'region' && maps?.length === 0
            ? ' · FIRST REGION BECOMES THE STARTING REGION'
            : ''}
          {kind === 'town' ? ' · SHIPS WITH A GATE VENUE' : ''}
          {kind === 'room' ? ' · SHIPS WITH A WAY OUT' : ''}
        </p>
      )}
      {createErr && (
        <p role="alert" style={{ color: 'var(--t-hp-low)', fontSize: '0.8rem', marginBottom: 8 }}>
          {createErr}
        </p>
      )}

      {maps && maps.length === 0 && !creating && (
        <p style={{ color: 'var(--t-dim)', fontSize: '0.8rem' }}>
          No {section} yet — hit + NEW {KIND_LABEL} to lay down the first map.
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {maps?.map((m) => {
          const h = m.grid?.length ?? 0;
          const w = m.grid?.[0]?.length ?? 0;
          const markers = kind === 'region' ? m.sites : kind === 'town' ? m.venues : m.exits;
          return (
            <button
              key={m.id}
              data-testid={`${kind}-card-${m.id}`}
              className={styles.card}
              onClick={() => onOpenMap?.(m.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
                marginBottom: 0,
                width: '100%',
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <p
                  style={{
                    fontWeight: 'bold',
                    fontSize: '0.85rem',
                    letterSpacing: '0.06em',
                    color: 'var(--t-primary)',
                  }}
                >
                  {m.name}
                  {m.isStartingRegion && (
                    <span style={{ color: 'var(--t-hp-high)', fontSize: '0.7rem' }}>
                      {' '}
                      · STARTING REGION
                    </span>
                  )}
                </p>
                <p
                  style={{
                    fontSize: '0.75rem',
                    color: 'var(--t-dim)',
                    letterSpacing: '0.08em',
                    marginTop: 2,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {m.id}
                  {m.desc ? ` — ${m.desc}` : ''}
                </p>
              </div>
              <p
                style={{
                  fontSize: '0.75rem',
                  letterSpacing: '0.1em',
                  color: 'var(--t-mid)',
                  flexShrink: 0,
                }}
              >
                {w}×{h}
                {markers && markers.length > 0
                  ? ` · ${markers.length} ${MARKER_NOUN[kind]}${markers.length > 1 ? 'S' : ''}`
                  : ''}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default MapsPanel;
