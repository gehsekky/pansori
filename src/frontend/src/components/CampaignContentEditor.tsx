import {
  type CampaignSectionInfo,
  type CampaignSectionSource,
  type CatalogItem,
  api,
} from '../lib/api.ts';
import { useCallback, useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import styles from '../styles.module.css';

// Campaign content editor: one editable Context section at a time.
// Sections resolve DB-first with code supplement — the source badge says
// which version the engine is serving; SAVE writes the DB version (live
// immediately, no restart); REVERT TO CODE deletes the DB version so the
// campaignData files take over again.
//
// Most sections edit as raw JSON. The loot table gets a structured picker
// (same idiom as the character screen's weapon-mastery badges): every
// catalog item is a toggleable badge, selected = offered by this campaign.
// Campaign-custom items (and catalog tweaks saved earlier) survive the
// picker — customs render as their own toggleable badges, and a selected
// catalog id whose stored definition differs keeps its stored version.
// EDIT AS JSON drops to the raw editor for authoring tweaks/customs.

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

const ITEM_TYPE_ORDER: Array<CatalogItem['type']> = ['weapon', 'armor', 'consumable', 'misc'];
const ITEM_TYPE_LABEL: Record<CatalogItem['type'], string> = {
  weapon: 'WEAPONS',
  armor: 'ARMOR',
  consumable: 'CONSUMABLES',
  misc: 'MISC',
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

  // Loot-table picker state. `lootValue` is the section's effective item
  // list as loaded (the source of stored tweak/custom definitions);
  // `selectedIds` drives the badges; `jsonMode` flips to the raw editor.
  const [catalog, setCatalog] = useState<CatalogItem[] | null>(null);
  const [lootValue, setLootValue] = useState<CatalogItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [jsonMode, setJsonMode] = useState(false);

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
      const loads: Promise<unknown>[] = [
        api.getCampaignSection(campaignId, section).then((s) => {
          setActiveSource(s.source);
          setText(s.value === null ? '' : JSON.stringify(s.value, null, 2));
          if (section === 'lootTable') {
            const items = Array.isArray(s.value) ? (s.value as CatalogItem[]) : [];
            setLootValue(items);
            setSelectedIds(new Set(items.map((i) => i.id)));
          }
        }),
      ];
      if (section === 'lootTable') {
        loads.push(api.listItemCatalog().then(setCatalog));
      }
      Promise.all(loads).catch(() => setError('Could not load this section.'));
    },
    [campaignId]
  );

  // The item list a badge selection represents: catalog items in display
  // order (using the stored definition when the campaign saved a tweak),
  // then selected customs in their stored order.
  function badgesPayload(): CatalogItem[] {
    const storedById = new Map(lootValue.map((i) => [i.id, i]));
    const catalogIds = new Set((catalog ?? []).map((c) => c.id));
    const out: CatalogItem[] = [];
    for (const c of catalog ?? []) {
      if (selectedIds.has(c.id)) out.push(storedById.get(c.id) ?? c);
    }
    for (const item of lootValue) {
      if (!catalogIds.has(item.id) && selectedIds.has(item.id)) out.push(item);
    }
    return out;
  }

  const usingBadges = active === 'lootTable' && !jsonMode;

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
      if (active === 'lootTable') {
        // The saved list is the new stored value — keep picker state in sync.
        const items = value as CatalogItem[];
        setLootValue(items);
        setSelectedIds(new Set(items.map((i) => i.id)));
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

  function toggleItem(id: string) {
    setSaved(false);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
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
      const items = JSON.parse(text) as CatalogItem[];
      if (!Array.isArray(items)) throw new Error('not a list');
      setLootValue(items);
      setSelectedIds(new Set(items.map((i) => i.id)));
      setJsonMode(false);
    } catch {
      setError('Not valid JSON — fix the syntax (or save) before switching back.');
    }
  }

  const catalogIdSet = new Set((catalog ?? []).map((c) => c.id));
  const customItems = lootValue.filter((i) => !catalogIdSet.has(i.id));
  const tweakedIds = new Set(
    lootValue
      .filter((i) => catalogIdSet.has(i.id))
      .filter((i) => {
        const c = (catalog ?? []).find((x) => x.id === i.id);
        return c && JSON.stringify(c) !== JSON.stringify(i);
      })
      .map((i) => i.id)
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
                <span style={{ color: 'var(--t-mid)' }}> ({selectedIds.size} SELECTED)</span>
              )}
            </label>
            {active === 'lootTable' && (
              <button
                className={styles.ghostBtn}
                style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem' }}
                onClick={toggleJsonMode}
              >
                {jsonMode ? 'ITEM PICKER' : 'EDIT AS JSON'}
              </button>
            )}
          </div>

          {usingBadges ? (
            catalog === null ? (
              <p style={{ color: 'var(--t-dim)', fontSize: '0.8rem' }}>Loading catalog…</p>
            ) : (
              <div>
                {ITEM_TYPE_ORDER.map((type) => {
                  const group = catalog.filter((c) => c.type === type);
                  if (group.length === 0) return null;
                  return (
                    <div key={type} style={{ marginBottom: '0.75rem' }}>
                      <p
                        style={{
                          fontSize: '0.7rem',
                          letterSpacing: '0.12em',
                          color: 'var(--t-dim)',
                          marginBottom: 4,
                        }}
                      >
                        {ITEM_TYPE_LABEL[type]}
                      </p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {group.map((item) => {
                          const on = selectedIds.has(item.id);
                          return (
                            <button
                              key={item.id}
                              type="button"
                              aria-pressed={on}
                              title={item.desc}
                              style={badgeStyle(on)}
                              onClick={() => toggleItem(item.id)}
                            >
                              {on ? '✓ ' : ''}
                              {item.name}
                              {tweakedIds.has(item.id) && (
                                <span style={{ opacity: 0.7 }}> (tweaked)</span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                {customItems.length > 0 && (
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
                      {customItems.map((item) => {
                        const on = selectedIds.has(item.id);
                        return (
                          <button
                            key={item.id}
                            type="button"
                            aria-pressed={on}
                            title={item.desc}
                            style={badgeStyle(on)}
                            onClick={() => toggleItem(item.id)}
                          >
                            {on ? '✓ ' : ''}
                            {item.name}
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
              disabled={busy || (usingBadges ? selectedIds.size === 0 : !text.trim())}
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
