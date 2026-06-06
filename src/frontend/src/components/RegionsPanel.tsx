import { useEffect, useState } from 'react';
import { api } from '../lib/api.ts';
import styles from '../styles.module.css';

// REGIONS panel on the campaign creator screen — the card-based way into
// the region painter. One card per defined region (click → painter);
// + NEW REGION appends a starter region to the section (first one becomes
// the starting region) and jumps straight to the painter. Bulk edits
// (sites, per-cell enc overrides) still live in the REGIONS JSON section
// of the CONTENT box above.

interface PanelRegion {
  id: string;
  name: string;
  isStartingRegion?: boolean;
  desc?: string;
  grid?: Array<Array<unknown>>;
  [key: string]: unknown;
}

function starterRegion(id: string, name: string, isFirst: boolean): PanelRegion {
  return {
    id,
    name,
    isStartingRegion: isFirst,
    feetPerSquare: 5280,
    grid: Array.from({ length: 8 }, () => Array.from({ length: 10 }, () => ({ t: 'plains' }))),
    startPos: { x: 1, y: 1 },
  };
}

function RegionsPanel({
  campaignId,
  onOpenRegion,
}: {
  campaignId: string;
  // Navigate to the painter (/creator/<campaign id>/region/<region id>).
  onOpenRegion?: (regionId: string) => void;
}) {
  const [regions, setRegions] = useState<PanelRegion[] | null>(null);
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
    setRegions(null);
    setLoadErr(null);
    setCreating(false);
    setNewName('');
    setCreateErr(null);
    api
      .getCampaignSection(campaignId, 'regions')
      .then((s) => setRegions(Array.isArray(s.value) ? (s.value as PanelRegion[]) : []))
      .catch(() => setLoadErr('Could not load this campaign’s regions.'));
  }, [campaignId]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !regions || newId.length === 0) return;
    if (regions.some((r) => r.id === newId)) {
      setCreateErr(`The id "${newId}" is taken — pick a different name.`);
      return;
    }
    setBusy(true);
    setCreateErr(null);
    const next = [...regions, starterRegion(newId, newName.trim(), regions.length === 0)];
    try {
      await api.putCampaignSection(campaignId, 'regions', next);
      setRegions(next);
      setCreating(false);
      setNewName('');
      onOpenRegion?.(newId);
    } catch {
      setCreateErr('Could not create the region — try again.');
    } finally {
      setBusy(false);
    }
  }

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
          REGIONS
        </p>
        <button
          data-testid="new-region-btn"
          className={styles.ghostBtn}
          style={{ padding: '0.3rem 0.6rem', fontSize: '0.7rem' }}
          onClick={() => {
            setCreating((v) => !v);
            setCreateErr(null);
          }}
        >
          + NEW REGION
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
            <label className={styles.formLbl} htmlFor="new-region-name">
              REGION NAME
            </label>
            <input
              id="new-region-name"
              className={styles.formInp}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. The Frost Reach"
              autoFocus
            />
          </div>
          <button
            type="submit"
            className={styles.sendBtn}
            disabled={busy || newId.length === 0}
            data-testid="create-region-btn"
          >
            CREATE
          </button>
        </form>
      )}
      {creating && (
        <p style={{ fontSize: '0.7rem', color: 'var(--t-dim)', marginTop: -6, marginBottom: 10 }}>
          ID: {newId || '—'} · 10×8 PLAINS STARTER — OPENS IN THE PAINTER
          {regions?.length === 0 ? ' · FIRST REGION BECOMES THE STARTING REGION' : ''}
        </p>
      )}
      {createErr && (
        <p role="alert" style={{ color: 'var(--t-hp-low)', fontSize: '0.8rem', marginBottom: 8 }}>
          {createErr}
        </p>
      )}

      {regions && regions.length === 0 && !creating && (
        <p style={{ color: 'var(--t-dim)', fontSize: '0.8rem' }}>
          No regions yet — hit + NEW REGION to lay down the first map.
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {regions?.map((r) => {
          const h = r.grid?.length ?? 0;
          const w = r.grid?.[0]?.length ?? 0;
          return (
            <button
              key={r.id}
              data-testid={`region-card-${r.id}`}
              className={styles.card}
              onClick={() => onOpenRegion?.(r.id)}
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
                  {r.name}
                  {r.isStartingRegion && (
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
                  {r.id}
                  {r.desc ? ` — ${r.desc}` : ''}
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
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default RegionsPanel;
