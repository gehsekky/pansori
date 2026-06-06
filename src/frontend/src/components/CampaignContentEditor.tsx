import { type CampaignSectionInfo, type CampaignSectionSource, api } from '../lib/api.ts';
import { useCallback, useEffect, useState } from 'react';
import styles from '../styles.module.css';

// Campaign content editor: one editable Context section at a time — raw
// JSON for structured sections, raw text for the plain-string ones
// (PLAIN_TEXT_SECTIONS — no quoting needed). Sections resolve DB-first
// with code supplement — the source badge says which version the engine
// is serving; SAVE writes the DB version (live immediately, no restart);
// REVERT TO CODE deletes the DB version so the campaignData files take
// over again.
//
// CUSTOMITEMS / CUSTOMMONSTERS hold only the campaign's OWN content — the
// full SRD item + monster catalogs are ambient (every campaign gets them
// automatically; the engine resolves entries by id/name, so unreferenced
// catalog entries never surface in play). A custom sharing a catalog id
// (items) or name (monsters) shadows the catalog entry.

function describeError(err: unknown): string {
  const e = err as { error?: string; issues?: Array<{ path: string; message: string }> };
  if (e?.error === 'invalid_section_value' && e.issues?.length) {
    const first = e.issues
      .slice(0, 3)
      .map((i) => (i.path ? `${i.path}: ${i.message}` : i.message))
      .join('; ');
    return `Invalid shape — ${first}`;
  }
  if (e?.error === 'unknown_section') return 'This section is not editable yet.';
  return 'Request failed — try again.';
}

const SOURCE_LABEL: Record<CampaignSectionSource, string> = {
  db: 'DATABASE',
  code: 'CODE',
  none: 'EMPTY',
};

// Sections whose value is a plain string (displayNoun, gameStart): edited
// as raw text — no JSON quoting in the textarea. The API request body is
// JSON, so escaping happens on the wire automatically; on load the string
// value displays verbatim.
const PLAIN_TEXT_SECTIONS = new Set(['displayNoun', 'gameStart']);

function CampaignContentEditor({
  campaignId,
  onEditMap,
}: {
  campaignId: string;
  // Open the visual painter for one of this campaign's regions/towns —
  // offered under the REGIONS / TOWNS sections when provided.
  onEditMap?: (kind: 'region' | 'town', mapId: string) => void;
}) {
  const [sections, setSections] = useState<CampaignSectionInfo[]>([]);
  const [sectionsErr, setSectionsErr] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [activeSource, setActiveSource] = useState<CampaignSectionSource>('none');
  const [text, setText] = useState('');
  // The section's last SAVED value — what the server (and so the region
  // painter) actually has. The PAINT MAP buttons derive from this, not from
  // the live textarea: painting an unsaved region would dead-end.
  const [savedValue, setSavedValue] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setActive(null);
    setSections([]);
    setSectionsErr(null);
    api
      .listCampaignSections(campaignId)
      .then(setSections)
      .catch(() => setSectionsErr('Could not load content sections.'));
  }, [campaignId]);

  const openSection = useCallback(
    (section: string) => {
      setActive(section);
      setError(null);
      setSaved(false);
      setText('');
      setSavedValue(null);
      api
        .getCampaignSection(campaignId, section)
        .then((s) => {
          setActiveSource(s.source);
          if (PLAIN_TEXT_SECTIONS.has(section)) {
            setText(typeof s.value === 'string' ? s.value : '');
          } else {
            setText(s.value === null ? '' : JSON.stringify(s.value, null, 2));
          }
          setSavedValue(s.value);
        })
        .catch(() => setError('Could not load this section.'));
    },
    [campaignId]
  );

  async function handleSave() {
    if (!active || busy) return;
    let value: unknown;
    if (PLAIN_TEXT_SECTIONS.has(active)) {
      // Plain-text sections store the textarea verbatim — quotes, newlines
      // and all. JSON escaping happens in the request body, not by hand.
      value = text;
    } else {
      try {
        value = JSON.parse(text);
      } catch {
        setError('Not valid JSON — fix the syntax and try again.');
        return;
      }
    }
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await api.putCampaignSection(campaignId, active, value);
      setActiveSource('db');
      setSections((prev) => prev.map((s) => (s.section === active ? { ...s, source: 'db' } : s)));
      setSavedValue(value);
      setSaved(true);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  // A minimal valid town to get a campaign onto the map painter in one
  // click: insert → SAVE → its PAINT button appears. (Regions get their
  // own card-based panel below the content box, so no starter here.)
  function starterTownJson(): string {
    const grid = Array.from({ length: 8 }, () =>
      Array.from({ length: 10 }, () => ({ t: 'plains' }))
    );
    const starter = {
      id: 'town-1',
      name: 'New Town',
      feetPerSquare: 25,
      grid,
      startPos: { x: 1, y: 1 },
      floor: 'dirt',
      venues: [{ id: 'gate', name: 'Town Gate', pos: { x: 0, y: 1 }, kind: 'gate' }],
    };
    return JSON.stringify([starter], null, 2);
  }

  async function handleRevert() {
    if (!active || busy) return;
    if (!confirm(`Revert "${active}" to the code-defined version?`)) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const result = await api.deleteCampaignSection(campaignId, active);
      setSections((prev) =>
        prev.map((s) => (s.section === active ? { ...s, source: result.source } : s))
      );
      // Reload what the engine now serves (the code version, or empty).
      openSection(active);
    } catch (err) {
      setError(describeError(err));
      setBusy(false);
      return;
    }
    setBusy(false);
  }

  return (
    <div className={styles.card} style={{ marginTop: '1rem' }}>
      <p
        style={{
          fontSize: '0.8rem',
          letterSpacing: '0.12em',
          color: 'var(--t-mid)',
          marginBottom: '0.75rem',
        }}
      >
        CONTENT
      </p>

      {sectionsErr && (
        <p role="alert" style={{ color: 'var(--t-hp-low)', fontSize: '0.8rem' }}>
          {sectionsErr}
        </p>
      )}

      {/* Section tabs with source badges */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
        {sections.map((s) => (
          <button
            key={s.section}
            className={styles.ghostBtn}
            aria-pressed={s.section === active}
            style={{
              padding: '0.3rem 0.6rem',
              fontSize: '0.75rem',
              borderColor: s.section === active ? 'var(--t-primary)' : undefined,
            }}
            onClick={() => openSection(s.section)}
          >
            {s.section.toUpperCase()}{' '}
            <span
              style={{
                color: s.source === 'db' ? 'var(--t-hp-high)' : 'var(--t-dim)',
                fontSize: '0.7rem',
              }}
            >
              {SOURCE_LABEL[s.source]}
            </span>
          </button>
        ))}
      </div>

      {active && (
        <>
          {/* Map painter shortcuts — one per SAVED town (the painter loads
              from the server, so unsaved maps can't be painted yet). With
              nothing saved, offer a one-click starter. Regions navigate
              through the REGIONS card panel below the content box instead. */}
          {active === 'towns' &&
            onEditMap &&
            (() => {
              const savedMaps = (Array.isArray(savedValue) ? savedValue : []).filter(
                (r): r is { id: string; name?: string } =>
                  typeof (r as { id?: unknown }).id === 'string'
              );
              return (
                <div
                  style={{
                    display: 'flex',
                    gap: 6,
                    flexWrap: 'wrap',
                    marginBottom: 8,
                    alignItems: 'center',
                  }}
                >
                  {savedMaps.length > 0 ? (
                    <>
                      <span style={{ fontSize: '0.7rem', color: 'var(--t-dim)' }}>PAINT MAP:</span>
                      {savedMaps.map((r) => (
                        <button
                          key={r.id}
                          className={styles.ghostBtn}
                          style={{ padding: '0.25rem 0.6rem', fontSize: '0.7rem' }}
                          onClick={() => onEditMap('town', r.id)}
                        >
                          🗺 {r.name ?? r.id}
                        </button>
                      ))}
                      <span style={{ fontSize: '0.7rem', color: 'var(--t-dim)' }}>
                        (NEW TOWNS NEED A SAVE FIRST)
                      </span>
                    </>
                  ) : (
                    <>
                      <span style={{ fontSize: '0.7rem', color: 'var(--t-dim)' }}>
                        NO SAVED TOWNS YET —
                      </span>
                      <button
                        className={styles.ghostBtn}
                        style={{ padding: '0.25rem 0.6rem', fontSize: '0.7rem' }}
                        onClick={() => {
                          setText(starterTownJson());
                          setSaved(false);
                        }}
                      >
                        INSERT STARTER TOWN
                      </button>
                      <span style={{ fontSize: '0.7rem', color: 'var(--t-dim)' }}>
                        THEN SAVE TO UNLOCK THE MAP PAINTER
                      </span>
                    </>
                  )}
                </div>
              );
            })()}
          <label className={styles.formLbl} htmlFor="content-section-editor">
            {active.toUpperCase()} — SERVING FROM {SOURCE_LABEL[activeSource]}
            {PLAIN_TEXT_SECTIONS.has(active) && ' · PLAIN TEXT'}
          </label>
          <textarea
            id="content-section-editor"
            className={styles.formInp}
            spellCheck={PLAIN_TEXT_SECTIONS.has(active)}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setSaved(false);
            }}
            rows={PLAIN_TEXT_SECTIONS.has(active) ? 5 : 16}
            style={{ fontFamily: 'inherit', fontSize: '0.75rem', resize: 'vertical' }}
          />
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: 8 }}>
            <button className={styles.sendBtn} disabled={busy || !text.trim()} onClick={handleSave}>
              SAVE TO DATABASE
            </button>
            {activeSource === 'db' && (
              <button className={styles.ghostBtn} disabled={busy} onClick={handleRevert}>
                REVERT TO CODE
              </button>
            )}
            {saved && (
              <span style={{ color: 'var(--t-hp-high)', fontSize: '0.75rem' }} role="status">
                SAVED — LIVE NOW
              </span>
            )}
          </div>
          {error && (
            <p role="alert" style={{ color: 'var(--t-hp-low)', fontSize: '0.8rem', marginTop: 8 }}>
              {error}
            </p>
          )}
        </>
      )}
    </div>
  );
}

export default CampaignContentEditor;
