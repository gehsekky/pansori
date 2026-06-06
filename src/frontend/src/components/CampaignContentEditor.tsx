import { type CampaignSectionInfo, type CampaignSectionSource, api } from '../lib/api.ts';
import { useCallback, useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import styles from '../styles.module.css';

// Campaign content editor: one editable Context section at a time.
// Sections resolve DB-first with code supplement — the source badge says
// which version the engine is serving; SAVE writes the DB version (live
// immediately, no restart); REVERT TO CODE deletes the DB version so the
// campaignData files take over again.
//
// Most sections edit as raw JSON. Catalog-backed list sections (loot
// table, enemy templates) get a structured picker — the same idiom as the
// character screen's weapon-mastery badges: every catalog entry is a
// toggleable badge, selected = offered by this campaign. Campaign-custom
// entries survive the picker under a CAMPAIGN CUSTOM group (for monsters
// that includes rethemed SRD entries — anything not byte-identical to the
// catalog). EDIT AS JSON drops to the raw editor for authoring those.

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

// Key-order-insensitive structural equality — mirrors the server's
// matching rule for catalog entries.
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

// ─── Catalog picker plumbing ─────────────────────────────────────────────────

interface PickerEntry {
  key: string;
  label: string;
  group: string;
  title: string;
  definition: Record<string, unknown>;
}

function crLabel(cr: number): string {
  if (cr === 0.125) return '1/8';
  if (cr === 0.25) return '1/4';
  if (cr === 0.5) return '1/2';
  return String(cr);
}

function crBand(cr: number): string {
  if (cr < 1) return 'CR 0 – 1/2';
  if (cr <= 2) return 'CR 1 – 2';
  if (cr <= 5) return 'CR 3 – 5';
  return 'CR 6+';
}

interface PickerConfig {
  load: () => Promise<PickerEntry[]>;
  groups: string[];
  // Selection key of a stored (section-value) item: a catalog key when the
  // item corresponds to a catalog entry, else a custom: key.
  storedKey: (item: Record<string, unknown>, entries: PickerEntry[]) => string;
  customLabel: (item: Record<string, unknown>) => string;
}

const PICKER_SECTIONS: Record<string, PickerConfig> = {
  lootTable: {
    load: async () =>
      (await api.listItemCatalog()).map((i) => ({
        key: i.id,
        label: i.name,
        group: { weapon: 'WEAPONS', armor: 'ARMOR', consumable: 'CONSUMABLES', misc: 'MISC' }[
          i.type
        ],
        title: i.desc,
        definition: i as unknown as Record<string, unknown>,
      })),
    groups: ['WEAPONS', 'ARMOR', 'CONSUMABLES', 'MISC'],
    // Items carry ids — a stored item matches the catalog entry of the
    // same id even when its definition was tweaked.
    storedKey: (item, entries) =>
      entries.some((e) => e.key === item.id) ? (item.id as string) : `custom:${item.id}`,
    customLabel: (item) => String(item.name ?? item.id),
  },
  enemyTemplates: {
    load: async () =>
      (await api.listMonsterCatalog()).map((m) => ({
        key: m.id,
        label: `${m.definition.name} (CR ${crLabel(m.definition.cr)})`,
        group: crBand(m.definition.cr),
        title: `HP ${m.definition.hp} · AC ${m.definition.ac} · +${m.definition.toHit} to hit · ${m.definition.damage}`,
        definition: m.definition as unknown as Record<string, unknown>,
      })),
    groups: ['CR 0 – 1/2', 'CR 1 – 2', 'CR 3 – 5', 'CR 6+'],
    // Templates carry no ids — a stored template matches a catalog entry
    // only by deep equality; everything else (rethemes, bosses) is custom.
    storedKey: (item, entries) => {
      const eq = stableStringify(item);
      const match = entries.find((e) => stableStringify(e.definition) === eq);
      return match ? match.key : `custom:${item.name}`;
    },
    customLabel: (item) => String(item.name),
  },
};

function badgeStyle(on: boolean): CSSProperties {
  return {
    fontSize: '0.7rem',
    padding: '0.25rem 0.55rem',
    letterSpacing: '0.04em',
    background: on ? 'var(--t-separator)' : 'transparent',
    border: `1px solid ${on ? 'var(--t-primary)' : 'var(--t-border)'}`,
    color: on ? 'var(--t-primary)' : 'var(--t-dim)',
    cursor: 'pointer',
    fontFamily: 'inherit',
  };
}

function CampaignContentEditor({ campaignId }: { campaignId: string }) {
  const [sections, setSections] = useState<CampaignSectionInfo[]>([]);
  const [sectionsErr, setSectionsErr] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [activeSource, setActiveSource] = useState<CampaignSectionSource>('none');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Picker state (catalog-backed sections). `storedItems` is the section's
  // effective list as loaded — the source of stored custom/tweak
  // definitions; `selectedKeys` drives the badges; `jsonMode` flips raw.
  const [catalog, setCatalog] = useState<PickerEntry[] | null>(null);
  const [storedItems, setStoredItems] = useState<Record<string, unknown>[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [jsonMode, setJsonMode] = useState(false);

  const picker = active ? PICKER_SECTIONS[active] : undefined;
  const usingBadges = !!picker && !jsonMode;

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
      setJsonMode(false);
      setCatalog(null);
      const config = PICKER_SECTIONS[section];
      const loads: Promise<unknown>[] = [api.getCampaignSection(campaignId, section)];
      if (config) loads.push(config.load());
      Promise.all(loads)
        .then((results) => {
          const s = results[0] as { source: CampaignSectionSource; value: unknown };
          setActiveSource(s.source);
          setText(s.value === null ? '' : JSON.stringify(s.value, null, 2));
          if (config) {
            const entries = results[1] as PickerEntry[];
            const items = Array.isArray(s.value) ? (s.value as Record<string, unknown>[]) : [];
            setCatalog(entries);
            setStoredItems(items);
            setSelectedKeys(new Set(items.map((i) => config.storedKey(i, entries))));
          }
        })
        .catch(() => setError('Could not load this section.'));
    },
    [campaignId]
  );

  // Stored items keyed by their selection key (for preferring the stored
  // definition — item tweaks — and for custom definitions).
  function storedByKey(): Map<string, Record<string, unknown>> {
    if (!picker || !catalog) return new Map();
    return new Map(storedItems.map((i) => [picker.storedKey(i, catalog), i]));
  }

  // The list a badge selection represents: catalog entries in display
  // order (stored definition preferred), then selected customs in stored order.
  function badgesPayload(): unknown[] {
    if (!picker || !catalog) return [];
    const stored = storedByKey();
    const out: unknown[] = [];
    for (const entry of catalog) {
      if (selectedKeys.has(entry.key)) out.push(stored.get(entry.key) ?? entry.definition);
    }
    for (const item of storedItems) {
      const key = picker.storedKey(item, catalog);
      if (key.startsWith('custom:') && selectedKeys.has(key)) out.push(item);
    }
    return out;
  }

  async function handleSave() {
    if (!active || busy) return;
    let value: unknown;
    if (usingBadges) {
      value = badgesPayload();
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
      if (picker && catalog) {
        // The saved list is the new stored value — keep picker state in sync.
        const items = value as Record<string, unknown>[];
        setStoredItems(items);
        setSelectedKeys(new Set(items.map((i) => picker.storedKey(i, catalog))));
        setText(JSON.stringify(items, null, 2));
      }
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

  function toggleKey(key: string) {
    setSaved(false);
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // Switch picker ↔ JSON without losing unsaved work: to JSON serializes
  // the current selection; back from JSON parses the text into a new
  // selection (staying put on a syntax error).
  function toggleJsonMode() {
    setError(null);
    if (!jsonMode) {
      setText(JSON.stringify(badgesPayload(), null, 2));
      setJsonMode(true);
      return;
    }
    try {
      const items = JSON.parse(text) as Record<string, unknown>[];
      if (!Array.isArray(items)) throw new Error('not a list');
      if (picker && catalog) {
        setStoredItems(items);
        setSelectedKeys(new Set(items.map((i) => picker.storedKey(i, catalog))));
      }
      setJsonMode(false);
    } catch {
      setError('Not valid JSON — fix the syntax (or save) before switching back.');
    }
  }

  // Customs (and, for items, tweak flags) for the picker render.
  const stored = storedByKey();
  const customEntries = [...stored.entries()].filter(([key]) => key.startsWith('custom:'));
  const tweakedKeys = new Set(
    !picker || !catalog
      ? []
      : catalog
          .filter((e) => {
            const s = stored.get(e.key);
            return s && stableStringify(s) !== stableStringify(e.definition);
          })
          .map((e) => e.key)
  );

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
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 4,
            }}
          >
            <label className={styles.formLbl} htmlFor="content-section-editor">
              {active.toUpperCase()} — SERVING FROM {SOURCE_LABEL[activeSource]}
              {usingBadges && (
                <span style={{ color: 'var(--t-mid)' }}> ({selectedKeys.size} SELECTED)</span>
              )}
            </label>
            {picker && (
              <button
                className={styles.ghostBtn}
                style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem' }}
                onClick={toggleJsonMode}
              >
                {jsonMode ? 'BADGE PICKER' : 'EDIT AS JSON'}
              </button>
            )}
          </div>

          {usingBadges ? (
            catalog === null ? (
              <p style={{ color: 'var(--t-dim)', fontSize: '0.8rem' }}>Loading catalog…</p>
            ) : (
              <div>
                {picker.groups.map((group) => {
                  const entries = catalog.filter((e) => e.group === group);
                  if (entries.length === 0) return null;
                  return (
                    <div key={group} style={{ marginBottom: '0.75rem' }}>
                      <p
                        style={{
                          fontSize: '0.7rem',
                          letterSpacing: '0.12em',
                          color: 'var(--t-dim)',
                          marginBottom: 4,
                        }}
                      >
                        {group}
                      </p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {entries.map((entry) => {
                          const on = selectedKeys.has(entry.key);
                          return (
                            <button
                              key={entry.key}
                              type="button"
                              aria-pressed={on}
                              title={entry.title}
                              style={badgeStyle(on)}
                              onClick={() => toggleKey(entry.key)}
                            >
                              {on ? '✓ ' : ''}
                              {entry.label}
                              {tweakedKeys.has(entry.key) && (
                                <span style={{ opacity: 0.7 }}> (tweaked)</span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                {customEntries.length > 0 && (
                  <div style={{ marginBottom: '0.75rem' }}>
                    <p
                      style={{
                        fontSize: '0.7rem',
                        letterSpacing: '0.12em',
                        color: 'var(--t-hp-mid)',
                        marginBottom: 4,
                      }}
                    >
                      CAMPAIGN CUSTOM
                    </p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {customEntries.map(([key, item]) => {
                        const on = selectedKeys.has(key);
                        return (
                          <button
                            key={key}
                            type="button"
                            aria-pressed={on}
                            title={String(item.desc ?? '')}
                            style={badgeStyle(on)}
                            onClick={() => toggleKey(key)}
                          >
                            {on ? '✓ ' : ''}
                            {picker.customLabel(item)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )
          ) : (
            <textarea
              id="content-section-editor"
              className={styles.formInp}
              spellCheck={false}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setSaved(false);
              }}
              rows={16}
              style={{ fontFamily: 'inherit', fontSize: '0.75rem', resize: 'vertical' }}
            />
          )}

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: 8 }}>
            <button
              className={styles.sendBtn}
              disabled={busy || (usingBadges ? selectedKeys.size === 0 : !text.trim())}
              onClick={handleSave}
            >
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
