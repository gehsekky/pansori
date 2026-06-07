import React, { useEffect, useState } from 'react';
import { api } from '../lib/api.ts';
import styles from '../styles.module.css';

// ─── FACTIONS panel (campaign creator) ───────────────────────────────────────
//
// Structured editor for the `factions` section: per-faction name, the five
// ascending rep thresholds, and the optional per-tier shop price multipliers.
// Replace-all save, like every section panel. Faction ids are derived from
// the name at creation (the id is what quests' factionId, dialogue tier
// conditions and set_faction_rep reference — shown but not editable).

interface EditorFaction {
  id: string;
  name: string;
  thresholds: Record<string, number>;
  shopPriceModifiers: Record<string, number>;
  [key: string]: unknown;
}

const TIERS = ['hostile', 'unfriendly', 'neutral', 'friendly', 'exalted'] as const;

const slugify = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

function FactionsPanel({ campaignId }: { campaignId: string }) {
  const [factions, setFactions] = useState<EditorFaction[] | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setFactions(null);
    setLoadErr(null);
    setError(null);
    setSaved(false);
    setDirty(false);
    api
      .getCampaignSection(campaignId, 'factions')
      .then((s) =>
        // Normalize defensively — a malformed entry renders with default
        // thresholds instead of crashing the whole creator page.
        setFactions(
          (Array.isArray(s.value) ? (s.value as EditorFaction[]) : []).map((f) => ({
            ...f,
            thresholds: f.thresholds ?? {
              hostile: -20,
              unfriendly: -5,
              neutral: 0,
              friendly: 20,
              exalted: 50,
            },
            shopPriceModifiers: f.shopPriceModifiers ?? {},
          }))
        )
      )
      .catch(() => setLoadErr('Could not load this campaign’s factions.'));
  }, [campaignId]);

  const touch = (next: EditorFaction[]) => {
    setFactions(next);
    setDirty(true);
    setSaved(false);
  };

  async function handleSave() {
    if (!factions || busy) return;
    for (const f of factions) {
      if (!f.name.trim()) {
        setError('Every faction needs a name.');
        return;
      }
      const t = f.thresholds;
      if (
        !(
          t.hostile < t.unfriendly &&
          t.unfriendly < t.neutral &&
          t.neutral < t.friendly &&
          t.friendly < t.exalted
        )
      ) {
        setError(`"${f.name}": thresholds must ascend (hostile < … < exalted).`);
        return;
      }
    }
    setBusy(true);
    setError(null);
    const cleaned = factions.map((f) => ({ ...f, name: f.name.trim() }));
    try {
      await api.putCampaignSection(campaignId, 'factions', cleaned);
      setFactions(cleaned);
      setDirty(false);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.');
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
          FACTIONS
          {dirty && <span style={{ color: 'var(--t-hp-mid)' }}> · UNSAVED</span>}
          {saved && <span style={{ color: 'var(--t-hp-high)' }}> · SAVED</span>}
        </p>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            className={styles.ghostBtn}
            style={{ padding: '0.3rem 0.6rem', fontSize: '0.7rem' }}
            data-testid="add-faction-btn"
            disabled={!factions}
            onClick={() => {
              if (!factions) return;
              const taken = new Set(factions.map((f) => f.id));
              let n = factions.length + 1;
              while (taken.has(`faction-${n}`)) n++;
              touch([
                ...factions,
                {
                  id: `faction-${n}`,
                  name: '',
                  thresholds: {
                    hostile: -20,
                    unfriendly: -5,
                    neutral: 0,
                    friendly: 20,
                    exalted: 50,
                  },
                  shopPriceModifiers: {},
                },
              ]);
            }}
          >
            + NEW FACTION
          </button>
          <button
            className={styles.ghostBtn}
            style={{ padding: '0.3rem 0.6rem', fontSize: '0.7rem' }}
            disabled={!dirty || busy}
            data-testid="save-factions-btn"
            onClick={handleSave}
          >
            SAVE FACTIONS
          </button>
        </div>
      </div>
      {loadErr && <p style={{ color: 'var(--t-hp-low)', fontSize: '0.8rem' }}>{loadErr}</p>}
      {factions && factions.length === 0 && (
        <p style={{ color: 'var(--t-dim)', fontSize: '0.8rem' }}>
          No factions yet. Factions give dialogue + quests a reputation track: rep thresholds name
          the tiers, tiers gate conversations and price the shops.
        </p>
      )}
      {(factions ?? []).map((f, i) => (
        <div
          key={f.id}
          style={{ padding: '0.4rem 0', borderBottom: '1px solid var(--t-separator)' }}
        >
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: '2 1 160px' }}>
              <label className={styles.formLbl} htmlFor={`faction-name-${i}`}>
                NAME
              </label>
              <input
                id={`faction-name-${i}`}
                className={styles.formInp}
                value={f.name}
                onChange={(ev) => {
                  const name = ev.target.value;
                  // The id locks to the first non-empty name (it's the
                  // reference key everywhere) — derived once, then stable.
                  touch(
                    factions!.map((p, j) =>
                      j === i
                        ? {
                            ...p,
                            name,
                            id: p.id.startsWith('faction-') && slugify(name) ? slugify(name) : p.id,
                          }
                        : p
                    )
                  );
                }}
              />
            </div>
            <span style={{ fontSize: '0.7rem', color: 'var(--t-dim)', paddingBottom: 8 }}>
              id: {f.id}
            </span>
            <button
              className={styles.ghostBtn}
              style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', marginLeft: 'auto' }}
              aria-label={`Remove faction ${i + 1}`}
              onClick={() => touch(factions!.filter((_, j) => j !== i))}
            >
              <span aria-hidden="true">✕</span>
            </button>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: 6 }}>
            {TIERS.map((tier) => (
              <div key={tier} style={{ width: 92 }}>
                <label className={styles.formLbl} htmlFor={`faction-${i}-th-${tier}`}>
                  {tier.toUpperCase()} ≥
                </label>
                <input
                  id={`faction-${i}-th-${tier}`}
                  className={styles.formInp}
                  type="number"
                  value={f.thresholds[tier] ?? 0}
                  onChange={(ev) =>
                    touch(
                      factions!.map((p, j) =>
                        j === i
                          ? {
                              ...p,
                              thresholds: { ...p.thresholds, [tier]: Number(ev.target.value) },
                            }
                          : p
                      )
                    )
                  }
                />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: 6 }}>
            {TIERS.map((tier) => (
              <div key={tier} style={{ width: 92 }}>
                <label className={styles.formLbl} htmlFor={`faction-${i}-mod-${tier}`}>
                  {tier.toUpperCase()} ×
                </label>
                <input
                  id={`faction-${i}-mod-${tier}`}
                  className={styles.formInp}
                  type="number"
                  step={0.05}
                  min={0.1}
                  max={10}
                  placeholder="1.0"
                  value={f.shopPriceModifiers[tier] ?? ''}
                  onChange={(ev) => {
                    const v = ev.target.value;
                    touch(
                      factions!.map((p, j) => {
                        if (j !== i) return p;
                        const mods = { ...p.shopPriceModifiers };
                        if (v === '') delete mods[tier];
                        else mods[tier] = Number(v);
                        return { ...p, shopPriceModifiers: mods };
                      })
                    );
                  }}
                />
              </div>
            ))}
            <p style={{ fontSize: '0.65rem', color: 'var(--t-dim)', alignSelf: 'flex-end' }}>
              shop price multiplier per tier (empty = 1.0)
            </p>
          </div>
        </div>
      ))}
      {error && (
        <p role="alert" style={{ color: 'var(--t-hp-low)', fontSize: '0.8rem', marginTop: 6 }}>
          {error}
        </p>
      )}
    </div>
  );
}

export default FactionsPanel;
