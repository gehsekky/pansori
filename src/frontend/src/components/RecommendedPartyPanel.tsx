import { useEffect, useState } from 'react';
import { SRD_CLASSES } from '../types.ts';
import { api } from '../lib/api.ts';
import styles from '../styles.module.css';

// ─── RECOMMENDED PARTY panel (campaign creator) ──────────────────────────────
//
// Structured editor for the `recommendedParty` section — the size + class
// composition the character-creation screen shows as a balance hint and the
// auto-fill button builds. One control: a size stepper (1–8) and one class
// dropdown per slot (the composition tracks the size). Saving folds into
// campaign.recommendedPartySize / recommendedComposition.

const lbl: React.CSSProperties = { fontSize: '0.65rem', color: 'var(--t-dim)' };

interface RequiredMember {
  name: string;
  cls: string;
}

function RecommendedPartyPanel({ campaignId }: { campaignId: string }) {
  const [size, setSize] = useState(4);
  const [composition, setComposition] = useState<string[]>([]);
  // Fixed members auto-seeded + locked at new-game start. Each needs a name.
  const [requiredMembers, setRequiredMembers] = useState<RequiredMember[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setLoaded(false);
    setLoadErr(null);
    setError(null);
    setSaved(false);
    setDirty(false);
    api
      .getCampaignSection(campaignId, 'recommendedParty')
      .then((s) => {
        const v =
          s.value && typeof s.value === 'object' && !Array.isArray(s.value)
            ? (s.value as { size?: unknown; composition?: unknown; requiredMembers?: unknown })
            : {};
        const sz = typeof v.size === 'number' ? Math.max(1, Math.min(8, v.size)) : 4;
        const raw = Array.isArray(v.composition)
          ? (v.composition as unknown[]).filter((c): c is string => typeof c === 'string')
          : [];
        // Pad/trim to the size so every slot dropdown is backed by a real
        // array entry (slot edits would no-op against a short array).
        const comp = Array.from({ length: sz }, (_, i) => raw[i] ?? SRD_CLASSES[0]);
        const req = Array.isArray(v.requiredMembers)
          ? (v.requiredMembers as unknown[]).flatMap((m) => {
              if (!m || typeof m !== 'object') return [];
              const rm = m as { name?: unknown; cls?: unknown };
              const cls =
                typeof rm.cls === 'string' && (SRD_CLASSES as readonly string[]).includes(rm.cls)
                  ? rm.cls
                  : SRD_CLASSES[0];
              return [{ name: typeof rm.name === 'string' ? rm.name : '', cls }];
            })
          : [];
        setSize(sz);
        setComposition(comp);
        setRequiredMembers(req);
        setLoaded(true);
      })
      .catch(() => setLoadErr('Could not load this campaign’s recommended party.'));
  }, [campaignId]);

  const touchSize = (n: number) => {
    const sz = Math.max(1, Math.min(8, n));
    setSize(sz);
    // Keep the composition length in step: trim extras, pad new slots with
    // the first class as a sensible default.
    setComposition((prev) => {
      if (sz <= prev.length) return prev.slice(0, sz);
      return [...prev, ...Array(sz - prev.length).fill(SRD_CLASSES[0])];
    });
    setDirty(true);
    setSaved(false);
  };

  const setSlot = (i: number, cls: string) => {
    setComposition((prev) => prev.map((c, j) => (j === i ? cls : c)));
    setDirty(true);
    setSaved(false);
  };

  const touchRequired = (next: RequiredMember[]) => {
    setRequiredMembers(next);
    setDirty(true);
    setSaved(false);
  };
  const addRequired = () => touchRequired([...requiredMembers, { name: '', cls: SRD_CLASSES[0] }]);
  const setRequiredField = (i: number, patch: Partial<RequiredMember>) =>
    touchRequired(requiredMembers.map((m, j) => (j === i ? { ...m, ...patch } : m)));
  const removeRequired = (i: number) => touchRequired(requiredMembers.filter((_, j) => j !== i));

  async function handleSave() {
    if (busy) return;
    // A required member must have a name (you can't yet leave it for the player).
    const reqClean = requiredMembers.map((m) => ({ name: m.name.trim(), cls: m.cls }));
    if (reqClean.some((m) => !m.name)) {
      setError('Every required member needs a name (or remove the blank one).');
      return;
    }
    setBusy(true);
    setError(null);
    // Composition is sized to match (slots default to the first class).
    const comp = Array.from({ length: size }, (_, i) => composition[i] ?? SRD_CLASSES[0]);
    try {
      await api.putCampaignSection(campaignId, 'recommendedParty', {
        size,
        composition: comp,
        ...(reqClean.length ? { requiredMembers: reqClean } : {}),
      });
      setComposition(comp);
      setRequiredMembers(reqClean);
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
          marginBottom: '0.5rem',
        }}
      >
        <p style={{ fontSize: '0.8rem', letterSpacing: '0.12em', color: 'var(--t-mid)' }}>
          RECOMMENDED PARTY
          {dirty && <span style={{ color: 'var(--t-hp-mid)' }}> · UNSAVED</span>}
          {saved && <span style={{ color: 'var(--t-hp-high)' }}> · SAVED</span>}
        </p>
        <button
          className={styles.ghostBtn}
          style={{ padding: '0.3rem 0.6rem', fontSize: '0.7rem' }}
          disabled={!dirty || busy}
          data-testid="save-recommended-party-btn"
          onClick={handleSave}
        >
          SAVE PARTY
        </button>
      </div>
      <p style={{ ...lbl, marginBottom: '0.5rem' }}>
        THE BALANCE HINT + AUTO-FILL COMPOSITION SHOWN AT CHARACTER CREATION.
      </p>
      {loadErr && <p style={{ color: 'var(--t-hp-low)', fontSize: '0.8rem' }}>{loadErr}</p>}
      {loaded && (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ width: 90 }}>
            <label className={styles.formLbl} htmlFor="rec-party-size">
              SIZE
            </label>
            <input
              id="rec-party-size"
              className={styles.formInp}
              type="number"
              min={1}
              max={8}
              value={size}
              onChange={(e) => touchSize(Number(e.target.value))}
            />
          </div>
          {Array.from({ length: size }, (_, i) => (
            <div key={i} style={{ width: 130 }}>
              <label className={styles.formLbl} htmlFor={`rec-party-slot-${i}`}>
                SLOT {i + 1}
              </label>
              <select
                id={`rec-party-slot-${i}`}
                className={styles.formInp}
                style={{ cursor: 'pointer' }}
                value={composition[i] ?? SRD_CLASSES[0]}
                onChange={(e) => setSlot(i, e.target.value)}
              >
                {SRD_CLASSES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}
      {loaded && (
        <div style={{ marginTop: '1rem' }}>
          <p style={{ ...lbl, letterSpacing: '0.1em', marginBottom: 4 }}>
            REQUIRED MEMBERS
            <span style={{ textTransform: 'none' }}>
              {' '}
              · auto-added to every new party + locked (the player edits their stats, not name or
              class)
            </span>
          </p>
          {requiredMembers.map((m, i) => (
            <div
              key={i}
              style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 6 }}
            >
              <div style={{ flex: 1, minWidth: 140 }}>
                <label className={styles.formLbl} htmlFor={`req-name-${i}`}>
                  NAME
                </label>
                <input
                  id={`req-name-${i}`}
                  aria-label={`Required member ${i + 1} name`}
                  className={styles.formInp}
                  value={m.name}
                  placeholder="e.g. Roland"
                  onChange={(e) => setRequiredField(i, { name: e.target.value })}
                />
              </div>
              <div style={{ width: 130 }}>
                <label className={styles.formLbl} htmlFor={`req-cls-${i}`}>
                  CLASS
                </label>
                <select
                  id={`req-cls-${i}`}
                  aria-label={`Required member ${i + 1} class`}
                  className={styles.formInp}
                  style={{ cursor: 'pointer' }}
                  value={m.cls}
                  onChange={(e) => setRequiredField(i, { cls: e.target.value })}
                >
                  {SRD_CLASSES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <button
                className={styles.ghostBtn}
                style={{ padding: '0.3rem 0.5rem', fontSize: '0.7rem' }}
                aria-label={`Remove required member ${i + 1}`}
                onClick={() => removeRequired(i)}
              >
                ✕
              </button>
            </div>
          ))}
          <button
            className={styles.ghostBtn}
            style={{ fontSize: '0.7rem', marginTop: 4 }}
            data-testid="add-required-member-btn"
            onClick={addRequired}
          >
            + ADD REQUIRED MEMBER
          </button>
        </div>
      )}
      {error && (
        <p role="alert" style={{ color: 'var(--t-hp-low)', fontSize: '0.8rem', marginTop: 8 }}>
          {error}
        </p>
      )}
    </div>
  );
}

export default RecommendedPartyPanel;
