import type { AuthUser, CharacterInput } from '../lib/api';
import { useEffect, useState } from 'react';
import type { FrontendContext } from '../types';
import { applyTheme } from '../App';
import styles from '../styles.module.css';

type StatBlock = { str: number; dex: number; con: number; int: number; wis: number; cha: number };
const STAT_KEYS: (keyof StatBlock)[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
const STAT_LABEL: Record<keyof StatBlock, string> = {
  str: 'STR',
  dex: 'DEX',
  con: 'CON',
  int: 'INT',
  wis: 'WIS',
  cha: 'CHA',
};
const mod = (s: number) => Math.floor((s - 10) / 2);
const fmtMod = (s: number) => {
  const m = mod(s);
  return m >= 0 ? `+${m}` : `${m}`;
};

function roll4d6DropLowest(): number {
  const rolls = Array.from({ length: 4 }, () => Math.floor(Math.random() * 6) + 1);
  rolls.sort((a, b) => a - b);
  return rolls.slice(1).reduce((a, b) => a + b, 0);
}

function rollStatBlock(): StatBlock {
  return {
    str: roll4d6DropLowest(),
    dex: roll4d6DropLowest(),
    con: roll4d6DropLowest(),
    int: roll4d6DropLowest(),
    wis: roll4d6DropLowest(),
    cha: roll4d6DropLowest(),
  };
}

// PHB p.13 — the deterministic alternative to rolling. Assign these six
// values to whichever ability scores the player prefers.
const STANDARD_ARRAY: StatBlock = {
  str: 15,
  dex: 14,
  con: 13,
  int: 12,
  wis: 10,
  cha: 8,
};

// PHB subclass timing: classes with the * here pick their subclass at L1
// (required at character creation) so they don't miss class features keyed
// on the subclass. The L2/L3 classes pick later via the in-game choice when
// they hit the appropriate level. The subclass IDs mirror what gameEngine.ts
// actually handles in its `case 'select_subclass'` dispatch + feature checks.
const L1_SUBCLASS_OPTIONS: Record<string, { id: string; label: string }[]> = {
  Cleric: [
    { id: 'life', label: 'Life Domain (Disciple of Life — bonus healing)' },
    { id: 'war', label: 'War Domain (War Priest + Guided Strike)' },
  ],
  Sorcerer: [
    { id: 'draconic', label: 'Draconic Bloodline (Draconic Resilience — +1 HP/level)' },
    { id: 'wild_magic', label: 'Wild Magic (Wild Magic Surge — chaotic effects on cast)' },
  ],
  Warlock: [
    { id: 'fiend', label: "The Fiend (Dark One's Blessing — temp HP on kill)" },
    { id: 'archfey', label: 'The Archfey (Fey Presence — frighten enemies in 10 ft)' },
  ],
};

// Fallback compositions when a campaign doesn't override. Mirrors the 5e
// "iconic four" — Fighter (tank), Cleric (heal), Wizard (magic), Rogue (utility).
// Roles taken from DMG p.83: Defender / Healer / Controller / Striker.
const DEFAULT_COMPOSITION_BY_SIZE: Record<number, string[]> = {
  1: ['Paladin'],
  2: ['Fighter', 'Cleric'],
  3: ['Fighter', 'Cleric', 'Rogue'],
  4: ['Fighter', 'Cleric', 'Wizard', 'Rogue'],
};

interface CharDraft {
  name: string;
  cls: string;
  backgroundId: string;
  stats: StatBlock;
  // PHB p.12-13 — 'roll' = 4d6-drop-lowest six times, 'array' = the
  // 15/14/13/12/10/8 standard array assigned to abilities. Either way the
  // player can swap values between ability slots.
  statMethod: 'roll' | 'array';
  portrait: string | null;
  rollCount: number;
  // Required for Cleric / Sorcerer / Warlock (when their subclasses are
  // authored); ignored for other classes (they pick later at level 2/3).
  subclass?: string;
}

function CharScreen({
  onStart,
  loading,
  availableContexts,
  user,
}: {
  onStart: (characters: CharacterInput[], contextId: string) => Promise<void>;
  loading: boolean;
  availableContexts: FrontendContext[];
  user: AuthUser | null;
}) {
  const [contextId, setContextId] = useState(
    () => localStorage.getItem('last_context_id') ?? availableContexts[0]?.id ?? ''
  );
  const selectedCtxForInit =
    availableContexts.find((c) => c.id === contextId) ?? availableContexts[0];
  const [party, setParty] = useState<CharDraft[]>([
    {
      name: localStorage.getItem('operative_name') || '',
      cls: selectedCtxForInit?.classes[0]?.id ?? '',
      backgroundId: selectedCtxForInit?.backgrounds?.[0]?.id ?? '',
      stats: rollStatBlock(),
      portrait: user?.avatar_url ?? null,
      rollCount: 1,
      statMethod: 'roll',
    },
  ]);
  const [error, setError] = useState('');
  // Two-click swap state — when the player clicks a stat box, we remember
  // it; clicking another stat box swaps the two values; clicking the same
  // box again cancels. Allows assigning rolled or array values to the right
  // abilities (PHB p.13: "Standard Method" assignment).
  const [swapFrom, setSwapFrom] = useState<{ partyIdx: number; key: keyof StatBlock } | null>(null);

  function swapStats(partyIdx: number, a: keyof StatBlock, b: keyof StatBlock) {
    if (a === b) return;
    setParty((prev) =>
      prev.map((d, i) =>
        i === partyIdx ? { ...d, stats: { ...d.stats, [a]: d.stats[b], [b]: d.stats[a] } } : d
      )
    );
  }

  function handleStatClick(partyIdx: number, key: keyof StatBlock) {
    if (!swapFrom) {
      setSwapFrom({ partyIdx, key });
      return;
    }
    if (swapFrom.partyIdx !== partyIdx || swapFrom.key === key) {
      // Cancel — or same-stat double-click clears the highlight
      setSwapFrom(null);
      return;
    }
    swapStats(partyIdx, swapFrom.key, key);
    setSwapFrom(null);
  }

  function setStatMethod(partyIdx: number, method: 'roll' | 'array') {
    setSwapFrom(null);
    setParty((prev) =>
      prev.map((d, i) =>
        i === partyIdx
          ? {
              ...d,
              statMethod: method,
              stats: method === 'array' ? { ...STANDARD_ARRAY } : rollStatBlock(),
              rollCount: 1,
            }
          : d
      )
    );
  }

  useEffect(() => {
    const c = availableContexts.find((c) => c.id === contextId);
    if (c) {
      applyTheme(c.theme);
      localStorage.setItem('last_context_id', contextId);
      setParty((prev) =>
        prev.map((d) => ({
          ...d,
          cls: c.classes[0]?.id ?? d.cls,
          backgroundId: c.backgrounds?.[0]?.id ?? '',
          stats: rollStatBlock(),
          rollCount: 1,
          statMethod: 'roll',
        }))
      );
    }
  }, [contextId, availableContexts]);

  const selectedCtx = availableContexts.find((c) => c.id === contextId);
  const classes = selectedCtx?.classes ?? [];

  function updateDraft(idx: number, patch: Partial<CharDraft>) {
    setParty((prev) => prev.map((d, i) => (i === idx ? { ...d, ...patch } : d)));
  }

  function addMember() {
    if (party.length >= 4) return;
    setParty((prev) => [
      ...prev,
      {
        name: '',
        cls: classes[0]?.id ?? '',
        backgroundId: selectedCtx?.backgrounds?.[0]?.id ?? '',
        stats: rollStatBlock(),
        portrait: null,
        rollCount: 1,
        statMethod: 'roll',
      },
    ]);
  }

  function removeMember(idx: number) {
    setParty((prev) => prev.filter((_, i) => i !== idx));
  }

  // Build the campaign's recommended party. Uses the campaign's authored
  // composition if present, else the size-based default (Fighter/Cleric/Rogue
  // for 3, etc.). Falls back to the first available class if any recommended
  // class isn't supported by the campaign.
  function autoFillParty() {
    if (!selectedCtxForInit) return;
    const validClasses = new Set(selectedCtxForInit.classes.map((c) => c.id));
    const size = selectedCtxForInit.recommendedPartySize ?? 1;
    const desired =
      selectedCtxForInit.recommendedComposition ?? DEFAULT_COMPOSITION_BY_SIZE[size] ?? [];
    const fallbackClass = selectedCtxForInit.classes[0]?.id ?? '';
    const composition = (desired.length ? desired : [fallbackClass])
      .map((cls) => (validClasses.has(cls) ? cls : fallbackClass))
      .slice(0, 4);
    setParty(
      composition.map((cls) => ({
        name: cls,
        cls,
        backgroundId: selectedCtxForInit.backgrounds?.[0]?.id ?? '',
        stats: rollStatBlock(),
        portrait: null,
        rollCount: 1,
        statMethod: 'roll',
        // Auto-pick the first L1-required subclass option (player can change
        // before starting). Without this, autofill creates an invalid Cleric.
        subclass: L1_SUBCLASS_OPTIONS[cls]?.[0]?.id,
      }))
    );
  }

  async function handle() {
    const leader = party[0];
    if (!leader.name.trim()) return setError('Enter a name for your first hero');
    if (party.some((d) => !d.name.trim())) return setError('All party members must have a name');
    // Cleric / Sorcerer / Warlock pick subclass at L1 (PHB). Block start
    // until they've made a selection.
    const missingSubclass = party.find((d) => L1_SUBCLASS_OPTIONS[d.cls]?.length && !d.subclass);
    if (missingSubclass) {
      return setError(
        `${missingSubclass.name || missingSubclass.cls} must choose a ${missingSubclass.cls} subclass before starting`
      );
    }
    setError('');
    localStorage.setItem('operative_name', leader.name.trim());
    try {
      await onStart(
        party.map((d) => ({
          name: d.name.trim(),
          character_class: d.cls,
          background_id: d.backgroundId || undefined,
          stats: d.stats,
          portrait_url: d.portrait ?? undefined,
          subclass: d.subclass || undefined,
        })),
        contextId
      );
    } catch (e) {
      setError((e as { error?: string })?.error || 'Failed to start mission');
    }
  }

  return (
    <div className={styles.pageFlex}>
      <div className={styles.charInner}>
        <div className={styles.charPartyCol}>
          <p className={styles.title} style={{ fontSize: '1.1rem', marginBottom: 4 }}>
            HERO REGISTRY
          </p>
          <p className={styles.sub} style={{ marginBottom: '2rem' }}>
            REGISTER YOUR PARTY — UP TO 4 HEROES
          </p>

          {party.map((draft, idx) => {
            const primaryStat = selectedCtx?.classPrimaryStats[draft.cls]?.toLowerCase() as
              | keyof StatBlock
              | undefined;
            const skills = selectedCtx?.classSkills[draft.cls] ?? [];
            const backgrounds = selectedCtx?.backgrounds ?? [];
            const selectedBg = backgrounds.find((b) => b.id === draft.backgroundId);
            const portraits = [
              ...(idx === 0 && user?.avatar_url ? [user.avatar_url] : []),
              `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" fill="#1a1a2e"/><circle cx="20" cy="14" r="7" fill="#4a9eff"/><ellipse cx="20" cy="34" rx="10" ry="7" fill="#4a9eff"/></svg>')}`,
              `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" fill="#1a1a2e"/><circle cx="20" cy="14" r="7" fill="#ff6b6b"/><ellipse cx="20" cy="34" rx="10" ry="7" fill="#ff6b6b"/></svg>')}`,
              `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" fill="#1a1a2e"/><circle cx="20" cy="14" r="7" fill="#ffd93d"/><ellipse cx="20" cy="34" rx="10" ry="7" fill="#ffd93d"/></svg>')}`,
              `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" fill="#1a1a2e"/><circle cx="20" cy="14" r="7" fill="#6bcb77"/><ellipse cx="20" cy="34" rx="10" ry="7" fill="#6bcb77"/></svg>')}`,
            ] as string[];

            return (
              <div
                key={idx}
                className={styles.card}
                style={{ marginBottom: '1rem', position: 'relative' }}
              >
                {party.length > 1 && (
                  <button
                    onClick={() => removeMember(idx)}
                    style={{
                      position: 'absolute',
                      top: 8,
                      right: 8,
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--t-dim)',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      padding: 2,
                    }}
                    title="Remove this hero"
                  >
                    ✕
                  </button>
                )}
                <p
                  style={{
                    fontSize: '0.75rem',
                    color: 'var(--t-dim)',
                    letterSpacing: '0.12em',
                    marginBottom: 8,
                  }}
                >
                  {idx === 0 ? 'PARTY LEADER' : `HERO ${idx + 1}`}
                </p>

                <label className={styles.formLbl}>HERO NAME</label>
                <input
                  className={styles.formInp}
                  value={draft.name}
                  onChange={(e) => updateDraft(idx, { name: e.target.value })}
                  placeholder="e.g. Buck Starling"
                  autoFocus={idx === 0}
                />

                <label className={styles.formLbl}>CLASS</label>
                <select
                  className={styles.formInp}
                  style={{ cursor: 'pointer' }}
                  value={draft.cls}
                  onChange={(e) => {
                    // Switching class clears any previously-chosen subclass —
                    // it only applies to the old class. The user re-picks if
                    // the new class is L1-required.
                    updateDraft(idx, { cls: e.target.value, subclass: undefined });
                  }}
                >
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.id}
                    </option>
                  ))}
                </select>

                {L1_SUBCLASS_OPTIONS[draft.cls]?.length && (
                  <>
                    <label className={styles.formLbl} style={{ marginTop: 12 }}>
                      SUBCLASS (required at level 1)
                    </label>
                    <select
                      className={styles.formInp}
                      style={{ cursor: 'pointer' }}
                      value={draft.subclass ?? ''}
                      onChange={(e) => updateDraft(idx, { subclass: e.target.value || undefined })}
                    >
                      <option value="">— pick a subclass —</option>
                      {L1_SUBCLASS_OPTIONS[draft.cls].map((sc) => (
                        <option key={sc.id} value={sc.id}>
                          {sc.label}
                        </option>
                      ))}
                    </select>
                  </>
                )}

                <div className={styles.classDesc}>
                  <span style={{ color: 'var(--t-mid)' }}>
                    {classes.find((c) => c.id === draft.cls)?.desc}
                  </span>
                  {primaryStat && (
                    <div style={{ marginTop: 4 }}>
                      <span style={{ color: 'var(--t-dim)', letterSpacing: '0.08em' }}>
                        PRIMARY STAT:{' '}
                      </span>
                      <span style={{ color: 'var(--t-primary)' }}>{primaryStat.toUpperCase()}</span>
                      {skills.length > 0 && (
                        <>
                          <span style={{ color: 'var(--t-dim)', letterSpacing: '0.08em' }}>
                            {' '}
                            · PROFICIENT:{' '}
                          </span>
                          <span style={{ color: 'var(--t-mid)' }}>{skills.join(', ')}</span>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {backgrounds.length > 0 && (
                  <>
                    <label className={styles.formLbl} style={{ marginTop: 12 }}>
                      BACKGROUND
                    </label>
                    <select
                      className={styles.formInp}
                      style={{ cursor: 'pointer' }}
                      value={draft.backgroundId}
                      onChange={(e) => updateDraft(idx, { backgroundId: e.target.value })}
                    >
                      {backgrounds.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                    {selectedBg && (
                      <div className={styles.classDesc}>
                        <span style={{ color: 'var(--t-mid)' }}>{selectedBg.desc}</span>
                        <div style={{ marginTop: 4 }}>
                          <span style={{ color: 'var(--t-dim)', letterSpacing: '0.08em' }}>
                            SKILLS:{' '}
                          </span>
                          <span style={{ color: 'var(--t-mid)' }}>
                            {selectedBg.skillProficiencies.join(', ')}
                          </span>
                          {selectedBg.toolProficiency && (
                            <>
                              <span style={{ color: 'var(--t-dim)' }}> · </span>
                              <span style={{ color: 'var(--t-mid)' }}>
                                {selectedBg.toolProficiency}
                              </span>
                            </>
                          )}
                        </div>
                        <div>
                          <span style={{ color: 'var(--t-dim)', letterSpacing: '0.08em' }}>
                            FEATURE:{' '}
                          </span>
                          <span style={{ color: 'var(--t-primary)' }}>{selectedBg.feature}</span>
                          <span style={{ color: 'var(--t-dim)' }}> — {selectedBg.featureDesc}</span>
                        </div>
                      </div>
                    )}
                  </>
                )}

                <label className={styles.formLbl} style={{ marginTop: 12 }}>
                  PORTRAIT
                </label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  {portraits.map((src, i) => {
                    const sel = draft.portrait === src;
                    return (
                      <button
                        key={i}
                        onClick={() => updateDraft(idx, { portrait: src })}
                        style={{
                          padding: 0,
                          border: `2px solid ${sel ? 'var(--t-primary)' : 'var(--t-border)'}`,
                          background: 'none',
                          cursor: 'pointer',
                          borderRadius: '50%',
                          boxShadow: sel ? '0 0 6px var(--t-primary)' : 'none',
                        }}
                      >
                        <img
                          src={src}
                          alt=""
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: '50%',
                            display: 'block',
                            objectFit: 'cover',
                          }}
                        />
                      </button>
                    );
                  })}
                  <button
                    onClick={() => updateDraft(idx, { portrait: null })}
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: '50%',
                      border: `2px solid ${draft.portrait === null ? 'var(--t-primary)' : 'var(--t-border)'}`,
                      background: 'var(--t-separator)',
                      cursor: 'pointer',
                      color: 'var(--t-dim)',
                      fontSize: '0.75rem',
                      letterSpacing: '0.05em',
                      fontFamily: 'inherit',
                    }}
                  >
                    NONE
                  </button>
                </div>

                <label className={styles.formLbl} style={{ marginTop: 12 }}>
                  ABILITY SCORES
                </label>
                {/* Method toggle: 4d6-drop-lowest (PHB p.12) vs the standard
                    array 15/14/13/12/10/8 (PHB p.13). */}
                <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                  {(['roll', 'array'] as const).map((m) => {
                    const active = draft.statMethod === m;
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setStatMethod(idx, m)}
                        style={{
                          fontSize: '0.7rem',
                          padding: '0.25rem 0.6rem',
                          letterSpacing: '0.08em',
                          background: active ? 'var(--t-separator)' : 'transparent',
                          border: `1px solid ${active ? 'var(--t-primary)' : 'var(--t-border)'}`,
                          color: active ? 'var(--t-primary)' : 'var(--t-dim)',
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                        }}
                      >
                        {m === 'roll' ? 'ROLL 4d6' : 'STANDARD ARRAY'}
                      </button>
                    );
                  })}
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  {STAT_KEYS.map((key) => {
                    const val = draft.stats[key];
                    const isPrimary = key === primaryStat;
                    const isSwapSelected = swapFrom?.partyIdx === idx && swapFrom?.key === key;
                    const borderColor = isSwapSelected
                      ? 'var(--t-hp-high)'
                      : isPrimary
                        ? 'var(--t-primary)'
                        : 'var(--t-border)';
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => handleStatClick(idx, key)}
                        title={
                          swapFrom?.partyIdx === idx && !isSwapSelected
                            ? `Click to swap with ${STAT_LABEL[swapFrom.key]} (${draft.stats[swapFrom.key]})`
                            : 'Click to swap with another ability'
                        }
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          padding: '4px 8px',
                          minWidth: 42,
                          border: `2px solid ${borderColor}`,
                          background: isPrimary ? 'var(--t-separator)' : 'transparent',
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                        }}
                      >
                        <span
                          style={{
                            fontSize: '0.75rem',
                            color: isPrimary ? 'var(--t-primary)' : 'var(--t-dim)',
                            letterSpacing: '0.1em',
                          }}
                        >
                          {STAT_LABEL[key]}
                        </span>
                        <span
                          style={{
                            fontSize: '0.95rem',
                            fontWeight: 'bold',
                            color: isPrimary ? 'var(--t-primary)' : 'var(--t-mid)',
                          }}
                        >
                          {val}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--t-dim)' }}>
                          {fmtMod(val)}
                        </span>
                      </button>
                    );
                  })}
                  {draft.statMethod === 'roll' && (
                    <button
                      className={styles.sendBtn}
                      style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem', alignSelf: 'center' }}
                      onClick={() =>
                        updateDraft(idx, { stats: rollStatBlock(), rollCount: draft.rollCount + 1 })
                      }
                    >
                      REROLL
                    </button>
                  )}
                </div>
                {swapFrom?.partyIdx === idx && (
                  <p
                    style={{
                      fontSize: '0.7rem',
                      color: 'var(--t-hp-high)',
                      marginTop: 4,
                      letterSpacing: '0.05em',
                    }}
                  >
                    Click another ability to swap its value with {STAT_LABEL[swapFrom.key]} (
                    {draft.stats[swapFrom.key]}). Click the highlighted box again to cancel.
                  </p>
                )}
              </div>
            );
          })}

          {party.length < 4 && (
            <button
              className={styles.submit}
              style={{
                marginTop: 0,
                marginBottom: '0.5rem',
                background: 'transparent',
                border: '1px dashed var(--t-border)',
                color: 'var(--t-dim)',
              }}
              onClick={addMember}
            >
              + ADD PARTY MEMBER
            </button>
          )}

          {selectedCtxForInit?.recommendedPartySize !== undefined && (
            <button
              className={styles.submit}
              style={{
                marginTop: 0,
                marginBottom: '1rem',
                background: 'transparent',
                border: '1px dashed var(--t-primary)',
                color: 'var(--t-primary)',
              }}
              onClick={autoFillParty}
              data-testid="auto-fill-party-btn"
              title={(
                selectedCtxForInit.recommendedComposition ??
                DEFAULT_COMPOSITION_BY_SIZE[selectedCtxForInit.recommendedPartySize] ??
                []
              ).join(' / ')}
            >
              ★ AUTO-FILL RECOMMENDED PARTY (
              {(
                selectedCtxForInit.recommendedComposition ??
                DEFAULT_COMPOSITION_BY_SIZE[selectedCtxForInit.recommendedPartySize] ??
                []
              ).join(' / ')}
              )
            </button>
          )}

          {selectedCtxForInit?.recommendedPartySize !== undefined &&
            party.length !== selectedCtxForInit.recommendedPartySize && (
              <p
                style={{
                  fontSize: '0.75rem',
                  color: 'var(--t-mid)',
                  marginBottom: '1rem',
                  letterSpacing: '0.05em',
                }}
              >
                ⚠ {selectedCtxForInit.displayName} is tuned for a party of{' '}
                {selectedCtxForInit.recommendedPartySize}. You can play with {party.length}, but
                encounters may feel{' '}
                {party.length < selectedCtxForInit.recommendedPartySize ? 'harder' : 'easier'} than
                intended.
              </p>
            )}

          {error && <p className={styles.err}>{error}</p>}

          <button
            data-testid="begin-mission-btn"
            className={styles.submit}
            onClick={handle}
            disabled={loading}
          >
            {loading ? 'LAUNCHING MISSION...' : 'BEGIN MISSION'}
          </button>
        </div>

        <div className={styles.charWorldCol}>
          <p className={styles.title} style={{ fontSize: '1.1rem', marginBottom: 4 }}>
            WORLD TYPE
          </p>
          <p className={styles.sub} style={{ marginBottom: '2rem' }}>
            SELECT YOUR GAME WORLD
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {availableContexts.map((c) => {
              const selected = c.id === contextId;
              return (
                <button
                  key={c.id}
                  data-testid={`world-picker-${c.id}`}
                  onClick={() => setContextId(c.id)}
                  style={{
                    background: selected ? 'var(--t-separator)' : 'var(--t-card)',
                    border: `1px solid ${selected ? 'var(--t-primary)' : 'var(--t-border)'}`,
                    color: 'var(--t-primary)',
                    fontFamily: 'inherit',
                    padding: '0.75rem 1rem',
                    cursor: 'pointer',
                    textAlign: 'left',
                    display: 'flex',
                    gap: '1rem',
                    alignItems: 'flex-start',
                    transition: 'border-color 0.15s, background 0.15s',
                    boxShadow: selected ? '0 0 8px var(--t-border)' : 'none',
                  }}
                >
                  <pre
                    style={{
                      margin: 0,
                      flexShrink: 0,
                      fontSize: '0.6rem',
                      lineHeight: 1.35,
                      color: selected ? 'var(--t-primary)' : 'var(--t-dim)',
                      fontFamily: 'inherit',
                      userSelect: 'none',
                      transition: 'color 0.15s',
                    }}
                  >
                    {c.previewArt}
                  </pre>
                  <div>
                    <p
                      style={{
                        fontSize: '0.85rem',
                        letterSpacing: '0.12em',
                        fontWeight: 'bold',
                        marginBottom: 4,
                        color: selected ? 'var(--t-primary)' : 'var(--t-mid)',
                      }}
                    >
                      {c.displayName}
                    </p>
                    <p style={{ fontSize: '0.75rem', color: 'var(--t-dim)', lineHeight: 1.5 }}>
                      {c.tagline}
                    </p>
                    {c.recommendedPartySize !== undefined && (
                      <p
                        style={{
                          marginTop: 6,
                          fontSize: '0.7rem',
                          color: 'var(--t-mid)',
                          letterSpacing: '0.08em',
                        }}
                      >
                        TUNED FOR PARTY OF {c.recommendedPartySize}
                      </p>
                    )}
                    {selected && (
                      <p
                        style={{
                          marginTop: 6,
                          fontSize: '0.75rem',
                          color: 'var(--t-primary)',
                          letterSpacing: '0.1em',
                        }}
                      >
                        ▶ SELECTED
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default CharScreen;
