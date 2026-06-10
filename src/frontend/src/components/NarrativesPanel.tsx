import React, { useEffect, useState } from 'react';
import VariantListEditor from './VariantListEditor.tsx';
import { api } from '../lib/api.ts';
import styles from '../styles.module.css';

// string | string[] | null → an editable variant list for the game-start pool.
const poolToVariants = (v: unknown): string[] =>
  Array.isArray(v)
    ? (v.filter((x) => typeof x === 'string') as string[])
    : typeof v === 'string' && v
      ? [v]
      : [];

// ─── NARRATIVE panel (campaign creator) ──────────────────────────────────────
//
// Structured editor for the campaign-level `narratives` pools — the flavor
// lines the engine draws from at runtime (room arrivals, combat hit/miss,
// loot, rest, level-up, …). These are pure campaign flavor and apply
// everywhere, so they live here rather than on any one region/room. Other
// narrative hooks are authored where their entity is: NPC greetings on the
// region/room NPC cards, quest/step text in QUESTS, trap/object text in the
// room editor. This panel owns the ambient pools only.
//
// Each pool is edited as a textarea: ONE LINE = ONE ENTRY (the engine picks a
// random line each time). Blank lines are dropped on save — the schema rejects
// empty strings. Replace-all save, like every section panel. The section also
// still appears as raw JSON under CONTENT (the escape hatch); this is the
// friendly surface.

// {token} placeholders the engine substitutes at runtime. Shown per pool so an
// author knows what's available without reading the JSON. `optional` pools are
// omitted from the save when empty; the rest are REQUIRED by the schema (it's
// strict), so they're always emitted — empty as `[]` / `{}`.
type Pool = { key: string; label: string; tokens?: string; optional?: boolean };

// Flat pools: a single list of lines. Grouped for a navigable layout.
const FLAT_GROUPS: { title: string; pools: Pool[] }[] = [
  {
    title: 'ARRIVAL & EXPLORATION',
    pools: [
      {
        key: 'genericArrival',
        label: 'GENERIC ARRIVAL',
        tokens: 'fallback when a room has no ROOM ARRIVAL line',
      },
    ],
  },
  {
    title: 'COMBAT — OUTCOMES',
    pools: [
      { key: 'enemyAttacks', label: 'ENEMY ATTACKS', tokens: '{enemy} {dmg}' },
      { key: 'killShot', label: 'KILL SHOT', tokens: '{enemy} {xp}' },
      { key: 'enemyDeflected', label: 'ARMOR DEFLECTS', tokens: '{enemy} {armor}' },
      { key: 'sneakSuccess', label: 'SNEAK PAST', tokens: '{enemy}' },
      { key: 'deathLines', label: 'PLAYER DEATH', tokens: '{enemy}' },
    ],
  },
  {
    title: 'LOOT & INTERACTION',
    pools: [
      { key: 'lootPickedUp', label: 'LOOT PICKED UP', tokens: '{item}' },
      { key: 'noLoot', label: 'NOTHING TO TAKE' },
      { key: 'alreadyLooted', label: 'ALREADY LOOTED' },
      { key: 'noEnemy', label: 'NO ENEMY HERE' },
      { key: 'alreadyDead', label: 'ENEMY ALREADY DEAD' },
    ],
  },
  {
    title: 'PROGRESSION & REST',
    pools: [
      { key: 'levelUp', label: 'LEVEL UP' },
      { key: 'combatStart', label: 'COMBAT START', optional: true },
      { key: 'shortRest', label: 'SHORT REST', optional: true },
      { key: 'longRest', label: 'LONG REST', optional: true },
    ],
  },
];

// Tiered combat pools: high / mid / low buckets keyed by how good the roll was.
const TIERED_POOLS: Pool[] = [
  { key: 'combatHit', label: 'COMBAT HIT', tokens: '{enemy}' },
  { key: 'combatMiss', label: 'COMBAT MISS', tokens: '{enemy}' },
];
const HIT_TIERS = ['high', 'mid', 'low'] as const;

// Keyed maps: each key (room id / weapon / class / monster / status) owns a
// list of lines. The key column header + add-row placeholder differ per pool.
// (ROOM ARRIVAL moved onto each room's pooled `onEnter` — authored in the room
// editor now, not here.)
const KEYED_POOLS: (Pool & { keyLabel: string; keyHint: string })[] = [
  {
    key: 'weaponVerbs',
    label: 'WEAPON VERBS',
    keyLabel: 'WEAPON',
    keyHint: 'weapon id (e.g. dagger)',
    tokens: 'verb phrases — "stabs with", "cleaves with"',
  },
  {
    key: 'classStyle',
    label: 'CLASS STYLE',
    keyLabel: 'CLASS',
    keyHint: 'class (e.g. Fighter)',
    tokens: 'attack-flavor suffix — "with martial precision"',
  },
  {
    key: 'enemyReactions',
    label: 'ENEMY REACTIONS',
    keyLabel: 'MONSTER',
    keyHint: 'monster name (e.g. Goblin)',
    tokens: 'reaction verbs — "shrieks", "snarls"',
  },
  {
    key: 'deathSaveStatus',
    label: 'DEATH SAVE STATUS',
    keyLabel: 'FAILS',
    keyHint: '1, 2 or 3',
    tokens: 'lines by death-save state (1–3)',
  },
];

type Tiered = Record<string, string[]>;
interface NarrativesShape {
  [key: string]: string[] | Tiered;
}

const splitLines = (s: string): string[] => s.split('\n');
const cleanLines = (arr: string[]): string[] => arr.map((l) => l.trim()).filter(Boolean);

// The flat-array form of a tiered pool is a rare legacy shape; fold it into the
// MID tier so nothing is lost when it's first edited here.
function asTiered(v: string[] | Tiered | undefined): Tiered {
  if (Array.isArray(v)) return { high: [], mid: v, low: [] };
  return { high: v?.high ?? [], mid: v?.mid ?? [], low: v?.low ?? [] };
}

function NarrativesPanel({ campaignId }: { campaignId: string }) {
  const [nar, setNar] = useState<NarrativesShape | null>(null);
  // The game-start opening — a separate `gameStart` section (campaign_narratives
  // pool), edited here at the top since it's the campaign's first narrative.
  const [gameStart, setGameStart] = useState<string[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setNar(null);
    setGameStart([]);
    setLoadErr(null);
    setError(null);
    setSaved(false);
    setDirty(false);
    Promise.all([
      api.getCampaignSection(campaignId, 'narratives'),
      api.getCampaignSection(campaignId, 'gameStart'),
    ])
      .then(([nSec, gSec]) => {
        const v = (
          nSec.value && typeof nSec.value === 'object' ? nSec.value : {}
        ) as NarrativesShape;
        // Normalize: every pool exists with its expected shape, so the UI
        // renders all of them even when the loaded value omits some.
        const next: NarrativesShape = {};
        for (const g of FLAT_GROUPS) for (const p of g.pools) next[p.key] = asFlat(v[p.key]);
        for (const p of KEYED_POOLS) next[p.key] = asMap(v[p.key]);
        for (const p of TIERED_POOLS) next[p.key] = asTiered(v[p.key]);
        setNar(next);
        setGameStart(poolToVariants(gSec.value));
      })
      .catch(() => setLoadErr('Could not load this campaign’s narrative pools.'));
  }, [campaignId]);

  const touch = (next: NarrativesShape) => {
    setNar(next);
    setDirty(true);
    setSaved(false);
  };

  async function handleSave() {
    if (!nar || busy) return;
    // Drop blank lines / empty keys; the schema rejects empty strings. The
    // NarrativesSchema is strict and most pools are REQUIRED, so a required
    // pool is always emitted (empty as `[]` / `{}`) — only the `optional` ones
    // (rest + combat-start lines) are omitted when empty.
    const cleaned: NarrativesShape = {};
    for (const g of FLAT_GROUPS)
      for (const p of g.pools) {
        const lines = cleanLines(nar[p.key] as string[]);
        if (lines.length || !p.optional) cleaned[p.key] = lines;
      }
    for (const p of KEYED_POOLS) {
      const src = nar[p.key] as Tiered;
      const map: Tiered = {};
      for (const k of Object.keys(src)) {
        const lines = cleanLines(src[k]);
        if (k.trim() && lines.length) map[k.trim()] = lines;
      }
      cleaned[p.key] = map; // required — emit even when empty
    }
    for (const p of TIERED_POOLS) {
      const src = nar[p.key] as Tiered;
      const tiers: Tiered = {};
      for (const t of HIT_TIERS) {
        const lines = cleanLines(src[t] ?? []);
        if (lines.length) tiers[t] = lines;
      }
      cleaned[p.key] = tiers; // required — emit even when empty ({} is a valid pool)
    }
    // The game-start opening is its own section: one variant collapses to a
    // string, several stay a pool; cleared entirely ⇒ delete it (fall back to
    // the base template intro).
    const openings = gameStart.map((v) => v.trim()).filter(Boolean);
    setBusy(true);
    setError(null);
    try {
      await api.putCampaignSection(campaignId, 'narratives', cleaned);
      if (openings.length === 0) await api.deleteCampaignSection(campaignId, 'gameStart');
      else
        await api.putCampaignSection(
          campaignId,
          'gameStart',
          openings.length === 1 ? openings[0] : openings
        );
      setDirty(false);
      setSaved(true);
    } catch (err) {
      setError(describeSaveError(err));
    } finally {
      setBusy(false);
    }
  }

  // ── Flat-pool textarea (one line = one entry). ──
  const flatField = (p: Pool) => (
    <div key={p.key} style={{ flex: '1 1 280px' }}>
      <label className={styles.formLbl} htmlFor={`nar-${p.key}`}>
        {p.label}
        {p.tokens && (
          <span style={{ color: 'var(--t-dim)', fontWeight: 'normal' }}> · {p.tokens}</span>
        )}
      </label>
      <textarea
        id={`nar-${p.key}`}
        aria-label={p.label}
        className={styles.formInp}
        rows={3}
        style={{ fontFamily: 'inherit', fontSize: '0.75rem', resize: 'vertical' }}
        value={(nar![p.key] as string[]).join('\n')}
        onChange={(ev) => touch({ ...nar!, [p.key]: splitLines(ev.target.value) })}
      />
    </div>
  );

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
          NARRATIVE
          {dirty && <span style={{ color: 'var(--t-hp-mid)' }}> · UNSAVED</span>}
          {saved && <span style={{ color: 'var(--t-hp-high)' }}> · SAVED</span>}
        </p>
        <button
          className={styles.ghostBtn}
          style={{ padding: '0.3rem 0.6rem', fontSize: '0.7rem' }}
          disabled={!dirty || busy}
          data-testid="save-narratives-btn"
          onClick={handleSave}
        >
          SAVE NARRATIVE
        </button>
      </div>

      {loadErr && <p style={{ color: 'var(--t-hp-low)', fontSize: '0.8rem' }}>{loadErr}</p>}

      {nar && (
        <>
          <p style={{ fontSize: '0.7rem', color: 'var(--t-dim)', marginBottom: '0.75rem' }}>
            ONE LINE = ONE ENTRY. The engine picks a random line each time; blank lines are dropped
            on save. {'{tokens}'} are filled in at runtime.
          </p>

          {/* Game-start opening — its own section (gameStart), a variant pool the
              seed picks from once per new game. Each box is a full opening (may be
              multi-paragraph), unlike the one-line-per-entry pools below. */}
          <div style={{ marginBottom: '0.9rem' }}>
            <p
              style={{
                fontSize: '0.7rem',
                letterSpacing: '0.1em',
                color: 'var(--t-dim)',
                marginBottom: '0.4rem',
              }}
            >
              GAME-START OPENING
              <span style={{ textTransform: 'none', letterSpacing: 0 }}>
                {' '}
                · one is picked per new game · blank ⇒ the base template opening
              </span>
            </p>
            <VariantListEditor
              variants={gameStart}
              ariaPrefix="Opening variant"
              rows={4}
              onChange={(next) => {
                setGameStart(next);
                setDirty(true);
                setSaved(false);
              }}
            />
          </div>

          {/* Flat pools, grouped. */}
          {FLAT_GROUPS.map((g) => (
            <div key={g.title} style={{ marginBottom: '0.9rem' }}>
              <p
                style={{
                  fontSize: '0.7rem',
                  letterSpacing: '0.1em',
                  color: 'var(--t-dim)',
                  marginBottom: '0.4rem',
                }}
              >
                {g.title}
              </p>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                {g.pools.map(flatField)}
              </div>
            </div>
          ))}

          {/* Tiered combat pools. */}
          <div style={{ marginBottom: '0.9rem' }}>
            <p
              style={{
                fontSize: '0.7rem',
                letterSpacing: '0.1em',
                color: 'var(--t-dim)',
                marginBottom: '0.4rem',
              }}
            >
              COMBAT — HIT / MISS BY ROLL QUALITY
            </p>
            {TIERED_POOLS.map((p) => (
              <div key={p.key} style={{ marginBottom: '0.5rem' }}>
                <p style={{ fontSize: '0.72rem', color: 'var(--t-mid)', marginBottom: '0.3rem' }}>
                  {p.label}
                  {p.tokens && <span style={{ color: 'var(--t-dim)' }}> · {p.tokens}</span>}
                </p>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  {HIT_TIERS.map((t) => (
                    <div key={t} style={{ flex: '1 1 200px' }}>
                      <label className={styles.formLbl} htmlFor={`nar-${p.key}-${t}`}>
                        {t.toUpperCase()}
                      </label>
                      <textarea
                        id={`nar-${p.key}-${t}`}
                        aria-label={`${p.label} ${t}`}
                        className={styles.formInp}
                        rows={3}
                        style={{ fontFamily: 'inherit', fontSize: '0.75rem', resize: 'vertical' }}
                        value={((nar[p.key] as Tiered)[t] ?? []).join('\n')}
                        onChange={(ev) =>
                          touch({
                            ...nar,
                            [p.key]: {
                              ...(nar[p.key] as Tiered),
                              [t]: splitLines(ev.target.value),
                            },
                          })
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Keyed maps. */}
          {KEYED_POOLS.map((p) => (
            <KeyedPoolEditor
              key={p.key}
              pool={p}
              value={nar[p.key] as Tiered}
              onChange={(map) => touch({ ...nar, [p.key]: map })}
            />
          ))}
        </>
      )}

      {error && (
        <p role="alert" style={{ color: 'var(--t-hp-low)', fontSize: '0.8rem', marginTop: 6 }}>
          {error}
        </p>
      )}
    </div>
  );
}

// One keyed-map pool: a row per key (key input + lines textarea + remove) and
// an add-key control. Keys are free-form text — the engine matches them against
// room ids / weapon ids / class names / monster names / death-save counts.
function KeyedPoolEditor({
  pool,
  value,
  onChange,
}: {
  pool: Pool & { keyLabel: string; keyHint: string };
  value: Tiered;
  onChange: (map: Tiered) => void;
}) {
  const [newKey, setNewKey] = useState('');
  const keys = Object.keys(value);

  return (
    <div
      style={{
        padding: '0.5rem 0.6rem',
        marginBottom: '0.6rem',
        border: '1px solid var(--t-border)',
        borderRadius: 4,
      }}
    >
      <p style={{ fontSize: '0.72rem', color: 'var(--t-mid)', marginBottom: '0.4rem' }}>
        {pool.label}
        {pool.tokens && <span style={{ color: 'var(--t-dim)' }}> · {pool.tokens}</span>}
      </p>
      {keys.length === 0 && (
        <p style={{ fontSize: '0.7rem', color: 'var(--t-dim)', marginBottom: '0.4rem' }}>
          No entries — add a {pool.keyHint}.
        </p>
      )}
      {keys.map((k) => (
        <div
          key={k}
          style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', marginBottom: 6 }}
        >
          <div style={{ width: 130 }}>
            <label className={styles.formLbl} htmlFor={`nar-${pool.key}-key-${k}`}>
              {pool.keyLabel}
            </label>
            <input
              id={`nar-${pool.key}-key-${k}`}
              className={styles.formInp}
              value={k}
              aria-label={`${pool.label} key ${k}`}
              onChange={(ev) => {
                // Rename the key, preserving order + value.
                const nk = ev.target.value;
                const next: Tiered = {};
                for (const ek of keys) next[ek === k ? nk : ek] = value[ek];
                onChange(next);
              }}
            />
          </div>
          <div style={{ flex: '1 1 240px' }}>
            <label className={styles.formLbl} htmlFor={`nar-${pool.key}-lines-${k}`}>
              LINES
            </label>
            <textarea
              id={`nar-${pool.key}-lines-${k}`}
              aria-label={`${pool.label} lines ${k}`}
              className={styles.formInp}
              rows={2}
              style={{ fontFamily: 'inherit', fontSize: '0.75rem', resize: 'vertical' }}
              value={(value[k] ?? []).join('\n')}
              onChange={(ev) => onChange({ ...value, [k]: splitLines(ev.target.value) })}
            />
          </div>
          <button
            className={styles.ghostBtn}
            style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', marginTop: 18 }}
            aria-label={`Remove ${pool.label} ${k}`}
            onClick={() => {
              const next = { ...value };
              delete next[k];
              onChange(next);
            }}
          >
            <span aria-hidden="true">✕</span>
          </button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', marginTop: 4 }}>
        <input
          className={styles.formInp}
          style={{ width: 160 }}
          placeholder={pool.keyHint}
          aria-label={`Add ${pool.label} key`}
          value={newKey}
          onChange={(ev) => setNewKey(ev.target.value)}
        />
        <button
          className={styles.ghostBtn}
          style={{ padding: '0.3rem 0.6rem', fontSize: '0.7rem' }}
          aria-label={`Add ${pool.label} entry`}
          disabled={!newKey.trim() || keys.includes(newKey.trim())}
          onClick={() => {
            onChange({ ...value, [newKey.trim()]: [] });
            setNewKey('');
          }}
        >
          + ADD
        </button>
      </div>
    </div>
  );
}

function asFlat(v: string[] | Tiered | undefined): string[] {
  return Array.isArray(v) ? v : [];
}
function asMap(v: string[] | Tiered | undefined): Tiered {
  return v && !Array.isArray(v) ? { ...v } : {};
}

function describeSaveError(err: unknown): string {
  const e = err as { error?: string; issues?: Array<{ path: string; message: string }> };
  if (e?.error === 'invalid_section_value' && e.issues?.length) {
    const first = e.issues[0];
    return `Invalid shape — ${first.path ? `${first.path}: ` : ''}${first.message}`;
  }
  return err instanceof Error ? err.message : 'Save failed.';
}

export default NarrativesPanel;
