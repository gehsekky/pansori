import { type CampaignSectionInfo, type CampaignSectionSource, api } from '../lib/api.ts';
import { MARKER_TILES, TERRAIN_TILES, type TerrainArtMap } from '../types.ts';
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

// Sections whose value is a plain string (gameStart): edited as raw text —
// no JSON quoting in the textarea. The API request body is JSON, so
// escaping happens on the wire automatically; on load the string value
// displays verbatim.
const PLAIN_TEXT_SECTIONS = new Set(['gameStart', 'worldName', 'tagline', 'previewArt']);

// Curated terrain-art themes: each pre-fills the terrainArt JSON with a
// per-type override map (the author can hand-tweak entries after). CLASSIC
// is the empty map — every type renders its default tile. All tile ids
// come from the shared TERRAIN_TILES catalog (recolors of the same
// hand-painted set, so themes cost no new assets).
const TERRAIN_THEMES: Record<string, TerrainArtMap> = {
  CLASSIC: {},
  ASHLANDS: {
    plains: 'plains-ash',
    road: 'road-cracked',
    forest: 'forest-dead',
    hills: 'hills-barren',
    swamp: 'swamp-blight',
    water: 'water-murk',
    mountain: 'mountain-char',
    snow: 'snow-ashfall',
  },
  FROSTBOUND: {
    plains: 'plains-tundra',
    road: 'road-snowbound',
    forest: 'forest-frost',
    hills: 'hills-frost',
    swamp: 'swamp-frozen',
    water: 'water-ice',
  },
};

function CampaignContentEditor({ campaignId }: { campaignId: string }) {
  const [sections, setSections] = useState<CampaignSectionInfo[]>([]);
  const [sectionsErr, setSectionsErr] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [activeSource, setActiveSource] = useState<CampaignSectionSource>('none');
  const [text, setText] = useState('');
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
      api
        .getCampaignSection(campaignId, section)
        .then((s) => {
          setActiveSource(s.source);
          if (PLAIN_TEXT_SECTIONS.has(section)) {
            setText(typeof s.value === 'string' ? s.value : '');
          } else {
            setText(s.value === null ? '' : JSON.stringify(s.value, null, 2));
          }
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
      setSaved(true);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
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
          {/* Terrain-art theme presets — pre-fill the per-type override map;
              hand-tweak entries in the JSON after. The tile list below the
              buttons is the catalog of valid ids. */}
          {active === 'terrainArt' && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: '0.7rem', color: 'var(--t-dim)' }}>THEME PRESET:</span>
                {Object.keys(TERRAIN_THEMES).map((theme) => (
                  <button
                    key={theme}
                    className={styles.ghostBtn}
                    style={{ padding: '0.25rem 0.6rem', fontSize: '0.7rem' }}
                    data-testid={`terrain-theme-${theme.toLowerCase()}`}
                    onClick={() => {
                      setText(JSON.stringify(TERRAIN_THEMES[theme], null, 2));
                      setSaved(false);
                    }}
                  >
                    {theme}
                  </button>
                ))}
                <span style={{ fontSize: '0.7rem', color: 'var(--t-dim)' }}>
                  THEN SAVE — OR HAND-TWEAK ENTRIES FIRST
                </span>
              </div>
              <p style={{ fontSize: '0.68rem', color: 'var(--t-dim)', marginTop: 6 }}>
                TILES: {Object.keys(TERRAIN_TILES).join(' · ')}
              </p>
              <p style={{ fontSize: '0.68rem', color: 'var(--t-dim)', marginTop: 4 }}>
                TOWN MARKERS (&#34;markers&#34;: {'{'}&#34;town&#34;: …{'}'}):{' '}
                {Object.keys(MARKER_TILES).join(' · ')} — ANY ENTRY MAY ALSO BE {'{'}&#34;tile&#34;:
                …, &#34;tint&#34;: {'{'}&#34;hue&#34;, &#34;saturate&#34;, &#34;brightness&#34;{'}'}
                {'}'}
              </p>
            </div>
          )}
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
