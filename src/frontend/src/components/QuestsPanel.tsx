import {
  ConditionRowsEditor,
  type DialogueConsequence,
  EffectList,
  type RowPickers,
} from './conditionEffectRows.tsx';
import React, { useEffect, useState } from 'react';
import { api } from '../lib/api.ts';
import styles from '../styles.module.css';

// ─── QUESTS panel (campaign creator) ─────────────────────────────────────────
//
// Structured editor for the `quests` section. Per quest: title / desc /
// giver NPC / faction + rep gain / STARTING QUEST flag, a step list (each
// step a desc + a condition built from the shared template rows — REACHED
// ROOM, IN TOWN, KILLED, FLAG, PARTY HAS ITEM, other-quest state…) and a
// rewards list (the same safe consequence subset dialogue fires). Replace-
// all save. Quest ids derive from the title at creation and then stay
// stable (dialogue start_quest + condition facts reference them).

interface EditorQuestStep {
  id: string;
  desc: string;
  condition: unknown;
  [key: string]: unknown;
}

interface EditorQuest {
  id: string;
  title: string;
  desc: string;
  giverNpcId?: string;
  steps: EditorQuestStep[];
  rewards: DialogueConsequence[];
  factionId?: string;
  repGain?: number;
  startActive?: boolean;
  [key: string]: unknown;
}

const slugify = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

const lbl: React.CSSProperties = { fontSize: '0.65rem', color: 'var(--t-dim)' };

function QuestsPanel({ campaignId }: { campaignId: string }) {
  const [quests, setQuests] = useState<EditorQuest[] | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<number | null>(null);

  // Picker data for the condition / reward rows.
  const [items, setItems] = useState<Array<{ id: string; name: string }>>([]);
  const [factions, setFactions] = useState<Array<{ id: string; name: string }>>([]);
  const [rooms, setRooms] = useState<Array<{ id: string; name: string }>>([]);
  const [towns, setTowns] = useState<Array<{ id: string; name: string }>>([]);
  const [npcIds, setNpcIds] = useState<string[]>([]);

  useEffect(() => {
    setQuests(null);
    setLoadErr(null);
    setError(null);
    setSaved(false);
    setDirty(false);
    setOpen(null);
    api
      .getCampaignSection(campaignId, 'quests')
      .then((s) =>
        // Normalize defensively — malformed entries render editable instead
        // of crashing the creator page.
        setQuests(
          (Array.isArray(s.value) ? (s.value as EditorQuest[]) : []).map((q) => ({
            ...q,
            title: q.title ?? q.id ?? '',
            desc: q.desc ?? '',
            steps: Array.isArray(q.steps) ? q.steps : [],
            rewards: Array.isArray(q.rewards) ? q.rewards : [],
          }))
        )
      )
      .catch(() => setLoadErr('Could not load this campaign’s quests.'));
    api
      .getCampaignSection(campaignId, 'factions')
      .then((s) => {
        const list = Array.isArray(s.value) ? (s.value as Array<{ id: string; name: string }>) : [];
        setFactions(list.map((f) => ({ id: f.id, name: f.name })));
      })
      .catch(() => setFactions([]));
    // Rooms feed three pickers: REACHED ROOM conditions, the giver-NPC list
    // and KILLED enemy hints (ids are room placements).
    api
      .getCampaignSection(campaignId, 'rooms')
      .then((s) => {
        const list = Array.isArray(s.value)
          ? (s.value as Array<{ id: string; name: string; npcs?: Array<{ id: string }> }>)
          : [];
        setRooms(list.map((r) => ({ id: r.id, name: r.name })));
        setNpcIds(list.flatMap((r) => (r.npcs ?? []).map((n) => n.id)));
      })
      .catch(() => {
        setRooms([]);
        setNpcIds([]);
      });
    api
      .getCampaignSection(campaignId, 'towns')
      .then((s) => {
        const list = Array.isArray(s.value) ? (s.value as Array<{ id: string; name: string }>) : [];
        setTowns(list.map((t) => ({ id: t.id, name: t.name })));
      })
      .catch(() => setTowns([]));
    Promise.all([
      api.getItemCatalog().catch(() => []),
      api.getCampaignSection(campaignId, 'customItems').catch(() => ({ value: null })),
    ]).then(([catalog, customs]) => {
      const customItems = Array.isArray(customs.value)
        ? (customs.value as Array<{ id?: unknown; name?: unknown }>).filter(
            (c): c is { id: string; name: string } =>
              typeof c.id === 'string' && typeof c.name === 'string'
          )
        : [];
      const seen = new Set(customItems.map((c) => c.id));
      setItems([...customItems, ...catalog.filter((c) => !seen.has(c.id))]);
    });
  }, [campaignId]);

  const touch = (next: EditorQuest[]) => {
    setQuests(next);
    setDirty(true);
    setSaved(false);
  };
  const patchQuest = (i: number, patch: Partial<EditorQuest>) => {
    const next = quests!.map((q, j) => {
      if (j !== i) return q;
      const merged = { ...q, ...patch };
      for (const k of Object.keys(merged))
        if ((merged as Record<string, unknown>)[k] === undefined)
          delete (merged as Record<string, unknown>)[k];
      return merged;
    });
    touch(next);
  };

  const pickers: RowPickers = {
    items,
    // A quest's own conditions can reference OTHER quests' states.
    quests: (quests ?? []).map((q) => ({ id: q.id, title: q.title || q.id })),
    factions,
    npcIds,
    rooms,
    towns,
  };

  async function handleSave() {
    if (!quests || busy) return;
    for (const q of quests) {
      if (!q.title.trim()) return setError('Every quest needs a TITLE.');
      if (!q.desc.trim()) return setError(`"${q.title}": a DESCRIPTION is required.`);
      if (q.steps.length === 0) return setError(`"${q.title}": at least one step is required.`);
      for (const s of q.steps) {
        if (!s.desc.trim()) return setError(`"${q.title}": every step needs a description.`);
        if (s.condition === undefined || s.condition === null) {
          return setError(`"${q.title}": every step needs at least one condition.`);
        }
      }
    }
    setBusy(true);
    setError(null);
    const cleaned = quests.map((q) => ({
      ...q,
      title: q.title.trim(),
      desc: q.desc.trim(),
      steps: q.steps.map((s) => ({ ...s, desc: s.desc.trim() })),
    }));
    try {
      await api.putCampaignSection(campaignId, 'quests', cleaned);
      setQuests(cleaned);
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
          QUESTS
          {dirty && <span style={{ color: 'var(--t-hp-mid)' }}> · UNSAVED</span>}
          {saved && <span style={{ color: 'var(--t-hp-high)' }}> · SAVED</span>}
        </p>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            className={styles.ghostBtn}
            style={{ padding: '0.3rem 0.6rem', fontSize: '0.7rem' }}
            data-testid="add-quest-btn"
            disabled={!quests}
            onClick={() => {
              if (!quests) return;
              const taken = new Set(quests.map((q) => q.id));
              let n = quests.length + 1;
              while (taken.has(`quest-${n}`)) n++;
              touch([
                ...quests,
                {
                  id: `quest-${n}`,
                  title: '',
                  desc: '',
                  steps: [{ id: 'step-1', desc: '', condition: undefined }],
                  rewards: [],
                },
              ]);
              setOpen(quests.length);
            }}
          >
            + NEW QUEST
          </button>
          <button
            className={styles.ghostBtn}
            style={{ padding: '0.3rem 0.6rem', fontSize: '0.7rem' }}
            disabled={!dirty || busy}
            data-testid="save-quests-btn"
            onClick={handleSave}
          >
            SAVE QUESTS
          </button>
        </div>
      </div>
      {loadErr && <p style={{ color: 'var(--t-hp-low)', fontSize: '0.8rem' }}>{loadErr}</p>}
      {quests && quests.length === 0 && (
        <p style={{ color: 'var(--t-dim)', fontSize: '0.8rem' }}>
          No quests yet. A quest is a titled thread of steps — each step completes when its
          condition holds — plus rewards on completion. Dialogue options can start quests (START
          QUEST effect) and gate on their state.
        </p>
      )}
      {(quests ?? []).map((q, i) => (
        <div
          key={q.id}
          style={{ padding: '0.4rem 0', borderBottom: '1px solid var(--t-separator)' }}
        >
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: '2 1 180px' }}>
              <label className={styles.formLbl} htmlFor={`quest-title-${i}`}>
                TITLE
              </label>
              <input
                id={`quest-title-${i}`}
                className={styles.formInp}
                value={q.title}
                onChange={(ev) => {
                  const title = ev.target.value;
                  // Same once-derived id rule as factions: the slug locks in
                  // while the id is still a quest-N placeholder.
                  patchQuest(i, {
                    title,
                    id: q.id.startsWith('quest-') && slugify(title) ? slugify(title) : q.id,
                  });
                }}
              />
            </div>
            <span style={{ fontSize: '0.7rem', color: 'var(--t-dim)', paddingBottom: 8 }}>
              id: {q.id}
            </span>
            <label
              style={{ ...lbl, display: 'flex', alignItems: 'center', gap: 4, paddingBottom: 8 }}
            >
              <input
                type="checkbox"
                aria-label={`Quest ${i + 1} starts active`}
                checked={!!q.startActive}
                onChange={(ev) => patchQuest(i, { startActive: ev.target.checked || undefined })}
              />
              STARTS ACTIVE
            </label>
            <div style={{ display: 'flex', gap: 6, paddingBottom: 4, marginLeft: 'auto' }}>
              <button
                className={styles.ghostBtn}
                style={{ padding: '0.3rem 0.6rem', fontSize: '0.7rem' }}
                aria-pressed={open === i}
                data-testid={`quest-open-${i}`}
                onClick={() => setOpen((v) => (v === i ? null : i))}
              >
                {open === i ? 'CLOSE' : 'EDIT'}
              </button>
              <button
                className={styles.ghostBtn}
                style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                aria-label={`Remove quest ${i + 1}`}
                onClick={() => {
                  touch(quests!.filter((_, j) => j !== i));
                  setOpen(null);
                }}
              >
                <span aria-hidden="true">✕</span>
              </button>
            </div>
          </div>
          {open === i && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
              <div>
                <label className={styles.formLbl} htmlFor={`quest-desc-${i}`}>
                  DESCRIPTION (shown in the quest log)
                </label>
                <input
                  id={`quest-desc-${i}`}
                  className={styles.formInp}
                  value={q.desc}
                  onChange={(ev) => patchQuest(i, { desc: ev.target.value })}
                />
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <div>
                  <label className={styles.formLbl} htmlFor={`quest-giver-${i}`}>
                    GIVER NPC
                  </label>
                  <select
                    id={`quest-giver-${i}`}
                    className={styles.formInp}
                    style={{ cursor: 'pointer', width: 'auto' }}
                    value={q.giverNpcId ?? ''}
                    onChange={(ev) => patchQuest(i, { giverNpcId: ev.target.value || undefined })}
                  >
                    <option value="">— NONE —</option>
                    {npcIds.map((id) => (
                      <option key={id} value={id}>
                        {id}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={styles.formLbl} htmlFor={`quest-faction-${i}`}>
                    FACTION
                  </label>
                  <select
                    id={`quest-faction-${i}`}
                    className={styles.formInp}
                    style={{ cursor: 'pointer', width: 'auto' }}
                    value={q.factionId ?? ''}
                    onChange={(ev) =>
                      patchQuest(i, {
                        factionId: ev.target.value || undefined,
                        ...(ev.target.value ? {} : { repGain: undefined }),
                      })
                    }
                  >
                    <option value="">— NONE —</option>
                    {factions.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </div>
                {q.factionId && (
                  <div style={{ width: 90 }}>
                    <label className={styles.formLbl} htmlFor={`quest-rep-${i}`}>
                      REP GAIN
                    </label>
                    <input
                      id={`quest-rep-${i}`}
                      className={styles.formInp}
                      type="number"
                      min={-100}
                      max={100}
                      value={q.repGain ?? 0}
                      onChange={(ev) => patchQuest(i, { repGain: Number(ev.target.value) })}
                    />
                  </div>
                )}
              </div>

              <p style={lbl}>STEPS (each completes when its condition holds)</p>
              {q.steps.map((s, si) => (
                <div
                  key={si}
                  style={{
                    borderLeft: '2px solid var(--t-separator)',
                    paddingLeft: 10,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                  }}
                >
                  <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
                    <div style={{ flex: 1 }}>
                      <label className={styles.formLbl} htmlFor={`quest-${i}-step-${si}-desc`}>
                        STEP {si + 1}
                      </label>
                      <input
                        id={`quest-${i}-step-${si}-desc`}
                        className={styles.formInp}
                        placeholder="What the player must do"
                        value={s.desc}
                        onChange={(ev) =>
                          patchQuest(i, {
                            steps: q.steps.map((x, sj) =>
                              sj === si ? { ...x, desc: ev.target.value } : x
                            ),
                          })
                        }
                      />
                    </div>
                    {q.steps.length > 1 && (
                      <button
                        className={styles.ghostBtn}
                        style={{ padding: '0.2rem 0.45rem', fontSize: '0.7rem' }}
                        aria-label={`Remove quest ${i + 1} step ${si + 1}`}
                        onClick={() =>
                          patchQuest(i, { steps: q.steps.filter((_, sj) => sj !== si) })
                        }
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <ConditionRowsEditor
                    value={s.condition}
                    where={`quest ${i + 1} step ${si + 1}`}
                    pickers={pickers}
                    onChange={(condition) =>
                      patchQuest(i, {
                        steps: q.steps.map((x, sj) => (sj === si ? { ...x, condition } : x)),
                      })
                    }
                  />
                </div>
              ))}
              {q.steps.length < 12 && (
                <button
                  className={styles.ghostBtn}
                  style={{
                    padding: '0.2rem 0.45rem',
                    fontSize: '0.7rem',
                    alignSelf: 'flex-start',
                  }}
                  data-testid={`quest-${i}-add-step`}
                  onClick={() => {
                    const taken = new Set(q.steps.map((s) => s.id));
                    let n = q.steps.length + 1;
                    while (taken.has(`step-${n}`)) n++;
                    patchQuest(i, {
                      steps: [...q.steps, { id: `step-${n}`, desc: '', condition: undefined }],
                    });
                  }}
                >
                  + ADD STEP
                </button>
              )}

              <p style={lbl}>REWARDS (on completion)</p>
              <EffectList
                effects={q.rewards}
                where={`quest ${i + 1} reward`}
                pickers={pickers}
                max={8}
                onChange={(rewards) => patchQuest(i, { rewards })}
              />
            </div>
          )}
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

export default QuestsPanel;
