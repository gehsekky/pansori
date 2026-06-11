import { ConditionRowsEditor, type RowPickers } from './conditionEffectRows.tsx';
import LootEffectEditor, { type LootEffectValue, cleanLootEffect } from './LootEffectEditor.tsx';
import React, { useEffect, useState } from 'react';
import { api } from '../lib/api.ts';
import styles from '../styles.module.css';

// ─── ACTS panel (campaign creator) ───────────────────────────────────────────
//
// Structured editor for the `acts` section — a campaign is a sequence of acts
// (like a play). Per act: name, starting region + coords (where the party lands
// on entering the act), onStart/onEnd narration, start/end loot effects (grant
// /revoke items to required members) and the trigger quest whose completion
// advances to the NEXT act. Act ids derive from the name and then stay stable
// (quests' actId references them). Replace-all save.

interface EditorAct {
  id: string;
  name: string;
  startingRegionId: string;
  startPos: { x: number; y: number };
  onStart?: string;
  onEnd?: string;
  startEffect?: LootEffectValue;
  endEffect?: LootEffectValue;
  trigger?: { questId: string; stepId?: string };
  transitions?: { when: unknown; to: string }[];
  ending?: { outcome: string; text?: string };
  [key: string]: unknown;
}

const lbl: React.CSSProperties = { fontSize: '0.65rem', color: 'var(--t-dim)' };

const slugify = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

const asStr = (v: unknown): string =>
  typeof v === 'string' ? v : Array.isArray(v) ? (v[0] ?? '') : '';

function ActsPanel({ campaignId }: { campaignId: string }) {
  const [acts, setActs] = useState<EditorAct[] | null>(null);
  const [regions, setRegions] = useState<Array<{ id: string; name: string }>>([]);
  const [quests, setQuests] = useState<Array<{ id: string; title: string }>>([]);
  const [members, setMembers] = useState<string[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setActs(null);
    setLoadErr(null);
    setError(null);
    setSaved(false);
    setDirty(false);
    api
      .getCampaignSection(campaignId, 'acts')
      .then((s) => {
        const list = (Array.isArray(s.value) ? (s.value as EditorAct[]) : []).map((a) => ({
          ...a,
          startPos: a.startPos ?? { x: 0, y: 0 },
          onStart: asStr(a.onStart),
          onEnd: asStr(a.onEnd),
        }));
        setActs(list);
      })
      .catch(() => setLoadErr('Could not load this campaign’s acts.'));
    // Dropdown sources — regions (starting region), quests (trigger), required
    // members (loot targets). Best-effort; empty lists just narrow the choices.
    api
      .getCampaignSection(campaignId, 'regions')
      .then((s) => {
        const list = Array.isArray(s.value) ? (s.value as Array<{ id: string; name: string }>) : [];
        setRegions(list.map((r) => ({ id: r.id, name: r.name })));
      })
      .catch(() => setRegions([]));
    api
      .getCampaignSection(campaignId, 'quests')
      .then((s) => {
        const list = Array.isArray(s.value)
          ? (s.value as Array<{ id: string; title: string }>)
          : [];
        setQuests(list.map((q) => ({ id: q.id, title: q.title })));
      })
      .catch(() => setQuests([]));
    api
      .getCampaignSection(campaignId, 'recommendedParty')
      .then((s) => {
        const rm =
          s.value && typeof s.value === 'object' && !Array.isArray(s.value)
            ? (s.value as { requiredMembers?: Array<{ name?: unknown }> }).requiredMembers
            : undefined;
        setMembers((rm ?? []).map((m) => String(m.name ?? '')).filter(Boolean));
      })
      .catch(() => setMembers([]));
  }, [campaignId]);

  const touch = (next: EditorAct[]) => {
    setActs(next);
    setDirty(true);
    setSaved(false);
  };
  const patch = (i: number, p: Partial<EditorAct>) =>
    touch((acts ?? []).map((a, j) => (j === i ? { ...a, ...p } : a)));

  async function handleSave() {
    if (!acts || busy) return;
    for (const a of acts) {
      if (!a.name.trim()) {
        setError('Every act needs a name.');
        return;
      }
      if (!a.startingRegionId) {
        setError(`"${a.name}": pick a starting region.`);
        return;
      }
    }
    setBusy(true);
    setError(null);
    // Serialize: trimmed prose, cleaned loot effects, an omitted trigger when no
    // quest is chosen. Ids derive from the name once, then stay stable.
    const payload = acts.map((a) => ({
      id: a.id,
      name: a.name.trim(),
      startingRegionId: a.startingRegionId,
      startPos: { x: Number(a.startPos.x) || 0, y: Number(a.startPos.y) || 0 },
      ...(a.onStart?.trim() ? { onStart: a.onStart.trim() } : {}),
      ...(a.onEnd?.trim() ? { onEnd: a.onEnd.trim() } : {}),
      ...(cleanLootEffect(a.startEffect) ? { startEffect: cleanLootEffect(a.startEffect) } : {}),
      ...(cleanLootEffect(a.endEffect) ? { endEffect: cleanLootEffect(a.endEffect) } : {}),
      ...(a.trigger?.questId ? { trigger: { questId: a.trigger.questId } } : {}),
      // Edges with a target only; an ending only when an outcome is named.
      ...(() => {
        const edges = (a.transitions ?? []).filter((t) => t.to);
        return edges.length ? { transitions: edges } : {};
      })(),
      ...(a.ending?.outcome.trim()
        ? {
            ending: {
              outcome: a.ending.outcome.trim(),
              ...(a.ending.text?.trim() ? { text: a.ending.text.trim() } : {}),
            },
          }
        : {}),
    }));
    try {
      await api.putCampaignSection(campaignId, 'acts', payload);
      setDirty(false);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setBusy(false);
    }
  }

  // Edges branch on campaign progress — flags (counters / set state) and quest
  // completion are the relevant levers; items/factions/npcs aren't act-level.
  const edgePickers: RowPickers = { items: [], quests, factions: [], npcIds: [] };

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
          ACTS
          {dirty && <span style={{ color: 'var(--t-hp-mid)' }}> · UNSAVED</span>}
          {saved && <span style={{ color: 'var(--t-hp-high)' }}> · SAVED</span>}
        </p>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            className={styles.ghostBtn}
            style={{ padding: '0.3rem 0.6rem', fontSize: '0.7rem' }}
            data-testid="add-act-btn"
            disabled={!acts}
            onClick={() => {
              if (!acts) return;
              const taken = new Set(acts.map((a) => a.id));
              let n = acts.length + 1;
              while (taken.has(`act-${n}`)) n++;
              touch([
                ...acts,
                { id: `act-${n}`, name: '', startingRegionId: '', startPos: { x: 0, y: 0 } },
              ]);
            }}
          >
            + NEW ACT
          </button>
          <button
            className={styles.ghostBtn}
            style={{ padding: '0.3rem 0.6rem', fontSize: '0.7rem' }}
            disabled={!dirty || busy}
            data-testid="save-acts-btn"
            onClick={handleSave}
          >
            SAVE ACTS
          </button>
        </div>
      </div>
      <p style={{ ...lbl, marginBottom: '0.5rem' }}>
        A CAMPAIGN IS A SEQUENCE OF ACTS. ACT 1 IS THE START; COMPLETING AN ACT’S TRIGGER QUEST
        ADVANCES TO THE NEXT.
      </p>
      {loadErr && <p style={{ color: 'var(--t-hp-low)', fontSize: '0.8rem' }}>{loadErr}</p>}
      {acts && acts.length === 0 && (
        <p style={{ color: 'var(--t-dim)', fontSize: '0.8rem' }}>No acts yet.</p>
      )}
      {(acts ?? []).map((a, i) => (
        <div
          key={a.id}
          style={{
            padding: '0.5rem 0.6rem',
            marginBottom: '0.6rem',
            border: '1px solid var(--t-border)',
            borderRadius: 4,
          }}
        >
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: '2 1 160px' }}>
              <label className={styles.formLbl} htmlFor={`act-name-${i}`}>
                ACT {i + 1} NAME
              </label>
              <input
                id={`act-name-${i}`}
                className={styles.formInp}
                value={a.name}
                placeholder="e.g. The Gathering Storm"
                onChange={(e) => {
                  const name = e.target.value;
                  patch(i, {
                    name,
                    id: a.id.startsWith('act-') && slugify(name) ? slugify(name) : a.id,
                  });
                }}
              />
            </div>
            <span style={{ fontSize: '0.7rem', color: 'var(--t-dim)', paddingBottom: 8 }}>
              id: {a.id}
            </span>
            <button
              className={styles.ghostBtn}
              style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', marginLeft: 'auto' }}
              aria-label={`Remove act ${i + 1}`}
              onClick={() => touch((acts ?? []).filter((_, j) => j !== i))}
            >
              ✕
            </button>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: 6 }}>
            <div style={{ width: 200 }}>
              <label className={styles.formLbl} htmlFor={`act-region-${i}`}>
                STARTING REGION
              </label>
              <select
                id={`act-region-${i}`}
                aria-label={`Act ${i + 1} starting region`}
                className={styles.formInp}
                style={{ cursor: 'pointer' }}
                value={a.startingRegionId}
                onChange={(e) => patch(i, { startingRegionId: e.target.value })}
              >
                <option value="">— region —</option>
                {regions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.id})
                  </option>
                ))}
              </select>
            </div>
            <div style={{ width: 70 }}>
              <label className={styles.formLbl} htmlFor={`act-x-${i}`}>
                START X
              </label>
              <input
                id={`act-x-${i}`}
                className={styles.formInp}
                type="number"
                min={0}
                value={a.startPos.x}
                onChange={(e) =>
                  patch(i, { startPos: { ...a.startPos, x: Number(e.target.value) } })
                }
              />
            </div>
            <div style={{ width: 70 }}>
              <label className={styles.formLbl} htmlFor={`act-y-${i}`}>
                START Y
              </label>
              <input
                id={`act-y-${i}`}
                className={styles.formInp}
                type="number"
                min={0}
                value={a.startPos.y}
                onChange={(e) =>
                  patch(i, { startPos: { ...a.startPos, y: Number(e.target.value) } })
                }
              />
            </div>
            <div style={{ width: 220 }}>
              <label className={styles.formLbl} htmlFor={`act-trigger-${i}`}>
                ADVANCE WHEN QUEST COMPLETES
              </label>
              <select
                id={`act-trigger-${i}`}
                aria-label={`Act ${i + 1} trigger quest`}
                className={styles.formInp}
                style={{ cursor: 'pointer' }}
                value={a.trigger?.questId ?? ''}
                onChange={(e) =>
                  patch(i, { trigger: e.target.value ? { questId: e.target.value } : undefined })
                }
              >
                <option value="">— none (final act) —</option>
                {quests.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.title} ({q.id})
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: 6 }}>
            <div style={{ flex: '1 1 240px' }}>
              <label className={styles.formLbl} htmlFor={`act-onstart-${i}`}>
                ON START
              </label>
              <textarea
                id={`act-onstart-${i}`}
                aria-label={`Act ${i + 1} onStart`}
                className={styles.formInp}
                rows={2}
                style={{ fontFamily: 'inherit', fontSize: '0.75rem', resize: 'vertical' }}
                value={a.onStart ?? ''}
                onChange={(e) => patch(i, { onStart: e.target.value })}
              />
            </div>
            <div style={{ flex: '1 1 240px' }}>
              <label className={styles.formLbl} htmlFor={`act-onend-${i}`}>
                ON END
              </label>
              <textarea
                id={`act-onend-${i}`}
                aria-label={`Act ${i + 1} onEnd`}
                className={styles.formInp}
                rows={2}
                style={{ fontFamily: 'inherit', fontSize: '0.75rem', resize: 'vertical' }}
                value={a.onEnd ?? ''}
                onChange={(e) => patch(i, { onEnd: e.target.value })}
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: 6 }}>
            <div style={{ flex: '1 1 240px' }}>
              <p style={{ ...lbl, letterSpacing: '0.08em' }}>START LOOT</p>
              <LootEffectEditor
                value={a.startEffect ?? {}}
                members={members}
                onChange={(v) => patch(i, { startEffect: v })}
              />
            </div>
            <div style={{ flex: '1 1 240px' }}>
              <p style={{ ...lbl, letterSpacing: '0.08em' }}>END LOOT</p>
              <LootEffectEditor
                value={a.endEffect ?? {}}
                members={members}
                onChange={(v) => patch(i, { endEffect: v })}
              />
            </div>
          </div>

          {/* Branches — the first edge whose condition holds advances to its
              target act (else the trigger quest above → next act). */}
          <div style={{ marginTop: 6 }}>
            <p style={{ ...lbl, letterSpacing: '0.08em' }}>
              BRANCHES
              <span style={{ textTransform: 'none' }}> · first matching condition wins</span>
            </p>
            {(a.transitions ?? []).map((t, ti) => (
              <div
                key={ti}
                style={{
                  border: '1px dashed var(--t-border)',
                  borderRadius: 4,
                  padding: 6,
                  marginBottom: 6,
                }}
              >
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                  <span style={lbl}>WHEN → GO TO</span>
                  <select
                    aria-label={`Act ${i + 1} branch ${ti + 1} target`}
                    className={styles.formInp}
                    style={{ cursor: 'pointer', width: 'auto' }}
                    value={t.to}
                    onChange={(e) =>
                      patch(i, {
                        transitions: (a.transitions ?? []).map((x, j) =>
                          j === ti ? { ...x, to: e.target.value } : x
                        ),
                      })
                    }
                  >
                    <option value="">— act —</option>
                    {(acts ?? [])
                      .filter((x) => x.id !== a.id)
                      .map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name || x.id} ({x.id})
                        </option>
                      ))}
                  </select>
                  <button
                    className={styles.ghostBtn}
                    aria-label={`Remove act ${i + 1} branch ${ti + 1}`}
                    style={{ padding: '0.2rem 0.5rem', marginLeft: 'auto' }}
                    onClick={() =>
                      patch(i, { transitions: (a.transitions ?? []).filter((_, j) => j !== ti) })
                    }
                  >
                    ✕
                  </button>
                </div>
                <ConditionRowsEditor
                  value={t.when}
                  where={`act ${i + 1} branch ${ti + 1}`}
                  pickers={edgePickers}
                  onChange={(when) =>
                    patch(i, {
                      transitions: (a.transitions ?? []).map((x, j) =>
                        j === ti ? { ...x, when } : x
                      ),
                    })
                  }
                />
              </div>
            ))}
            <button
              className={styles.ghostBtn}
              style={{ fontSize: '0.65rem' }}
              aria-label={`Add act ${i + 1} branch`}
              onClick={() =>
                patch(i, { transitions: [...(a.transitions ?? []), { when: undefined, to: '' }] })
              }
            >
              + BRANCH
            </button>
          </div>

          {/* Ending — a terminal act resolves the campaign. */}
          <div style={{ marginTop: 6 }}>
            <label style={{ ...lbl, display: 'flex', alignItems: 'center', gap: 4 }}>
              <input
                type="checkbox"
                aria-label={`Act ${i + 1} is an ending`}
                checked={!!a.ending}
                onChange={(e) =>
                  patch(i, {
                    ending: e.target.checked
                      ? { outcome: a.ending?.outcome ?? '', text: a.ending?.text }
                      : undefined,
                  })
                }
              />
              THIS ACT ENDS THE CAMPAIGN
            </label>
            {a.ending && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                <input
                  aria-label={`Act ${i + 1} ending outcome`}
                  className={styles.formInp}
                  style={{ width: 180 }}
                  placeholder="outcome (e.g. Victory)"
                  value={a.ending.outcome}
                  onChange={(e) => patch(i, { ending: { ...a.ending!, outcome: e.target.value } })}
                />
                <textarea
                  aria-label={`Act ${i + 1} ending text`}
                  className={styles.formInp}
                  rows={2}
                  style={{
                    flex: '1 1 240px',
                    fontFamily: 'inherit',
                    fontSize: '0.75rem',
                    resize: 'vertical',
                  }}
                  placeholder="closing narration"
                  value={a.ending.text ?? ''}
                  onChange={(e) =>
                    patch(i, { ending: { ...a.ending!, text: e.target.value || undefined } })
                  }
                />
              </div>
            )}
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

export default ActsPanel;
