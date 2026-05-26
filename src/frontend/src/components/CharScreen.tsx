import { type AuthUser, type BackendContextSummary, type CharacterInput, api } from '../lib/api';
import {
  MANUAL_MAX,
  MANUAL_MIN,
  POINT_BUY_BUDGET,
  POINT_BUY_COST,
  POINT_BUY_MAX,
  POINT_BUY_MIN,
  STANDARD_ARRAY,
  pointBuySpent,
} from '../lib/pointBuy';
import { useEffect, useState } from 'react';
import type { FrontendContext } from '../types';
import { SPECIES } from '../data/species';
import SpellPickerDialog from './SpellPickerDialog';
import { applyTheme } from '../lib/theme';
import styles from '../styles.module.css';

const MAGIC_INITIATE_FEAT_IDS: ReadonlySet<string> = new Set([
  'magic_initiate_arcane',
  'magic_initiate_divine',
  'magic_initiate_primal',
]);

// Extract the picker inputs (feat shape + filtered spells) for a given
// background id from the BE context summary. Returns null if the
// background isn't found, doesn't have an originFeat, the feat is
// unknown, or the feat doesn't need a chooser. Defense-in-depth: even
// if the BE adds a new chooser feat shape later, we explicitly gate
// on the `extra-cantrips-and-l1` discriminator here so unrelated feats
// don't open the spell picker.
function getMagicInitiatePickerInputs(
  beCtx: BackendContextSummary | undefined,
  backgroundId: string
): {
  featId: string;
  featName: string;
  spellList: 'arcane' | 'divine' | 'primal';
  cantripCount: number;
  l1Count: number;
} | null {
  if (!beCtx) return null;
  const bg = beCtx.backgrounds.find((b) => b.id === backgroundId);
  if (!bg?.originFeat) return null;
  if (!MAGIC_INITIATE_FEAT_IDS.has(bg.originFeat)) return null;
  const feat = beCtx.featTable[bg.originFeat];
  if (!feat) return null;
  const effect = feat.effect as {
    kind: string;
    spellList?: 'arcane' | 'divine' | 'primal';
    cantripCount?: number;
    l1Count?: number;
  };
  if (effect.kind !== 'extra-cantrips-and-l1') return null;
  if (!effect.spellList || effect.cantripCount === undefined || effect.l1Count === undefined) {
    return null;
  }
  return {
    featId: bg.originFeat,
    featName: feat.name,
    spellList: effect.spellList,
    cantripCount: effect.cantripCount,
    l1Count: effect.l1Count,
  };
}

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

// Rearrange a rolled stat block so the highest score lands on the class's
// primary ability and the second-highest on CON (the always-useful
// secondary). The rest fill the remaining slots in descending order. This
// mirrors what a player would normally do by hand after a roll — putting
// 17s on the stat that actually matters.
function assignStatsForClass(rolled: StatBlock, ctx: FrontendContext, cls: string): StatBlock {
  const values = Object.values(rolled).sort((a, b) => b - a);
  const primary = (ctx.classPrimaryStats[cls] ?? 'STR').toLowerCase() as keyof StatBlock;
  // Assignment order: primary → con → everything else in the canonical
  // STAT_KEYS order, skipping duplicates.
  const targets: (keyof StatBlock)[] = [primary];
  if (primary !== 'con') targets.push('con');
  for (const s of STAT_KEYS) {
    if (!targets.includes(s)) targets.push(s);
  }
  const out: StatBlock = { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 };
  targets.forEach((slot, i) => {
    out[slot] = values[i];
  });
  return out;
}

// The four stat-generation methods offered at creation: 4d6-drop-lowest,
// the standard array, 27-point buy, and free manual entry.
type StatMethod = 'roll' | 'array' | 'pointbuy' | 'manual';

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
  speciesId: string;
  backgroundId: string;
  stats: StatBlock;
  // PHB p.12-13 — 'roll' = 4d6-drop-lowest six times, 'array' = the
  // 15/14/13/12/10/8 standard array assigned to abilities. Either way the
  // player can swap values between ability slots.
  statMethod: StatMethod;
  portrait: string | null;
  rollCount: number;
  // Origin-feat picks for backgrounds whose feat needs player input
  // (currently only Magic Initiate variants). Persisted in the per-
  // context party draft so the player doesn't lose picks on reload.
  // Cleared when the background changes to one whose feat doesn't
  // need picks.
  featChoices?: {
    cantripChoices?: string[];
    l1Choice?: string;
  };
}

// Per-context localStorage key for the saved party draft. We key on the
// context id (vale_of_shadows / whispering_pines / sandbox / etc.) so
// each campaign carries its own "last party" — switching to Pines
// doesn't clobber the Vale party setup, and coming back to Vale
// restores names/classes/stats the player tuned for that campaign.
const PARTY_DRAFT_KEY = (ctxId: string) => `pansori:party_draft:${ctxId}`;

function loadPartyDraft(ctxId: string): CharDraft[] | null {
  if (!ctxId) return null;
  try {
    const raw = localStorage.getItem(PARTY_DRAFT_KEY(ctxId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > 4) return null;
    return parsed as CharDraft[];
  } catch {
    return null;
  }
}

function savePartyDraft(ctxId: string, party: CharDraft[]): void {
  if (!ctxId || party.length === 0) return;
  try {
    localStorage.setItem(PARTY_DRAFT_KEY(ctxId), JSON.stringify(party));
  } catch {
    // localStorage may be unavailable (private mode quota, etc.); silent fail.
  }
}

// Coerce a saved draft into something the current context can render
// without crashing. If the saved class / background don't exist in this
// context (e.g. the campaign authoring removed them since last save),
// fall back to the context's first available value. Stats + names +
// species are left alone.
function sanitizeDraft(d: CharDraft, ctx: FrontendContext): CharDraft {
  const classIds = new Set(ctx.classes.map((c) => c.id));
  const bgIds = new Set((ctx.backgrounds ?? []).map((b) => b.id));
  const validCls = classIds.has(d.cls) ? d.cls : (ctx.classes[0]?.id ?? d.cls);
  const validBg = bgIds.has(d.backgroundId) ? d.backgroundId : (ctx.backgrounds?.[0]?.id ?? '');
  return { ...d, cls: validCls, backgroundId: validBg };
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
  // Try to restore the per-context saved party. If none exists, fall
  // back to a single-member default seeded with the legacy
  // `operative_name` localStorage value + the user's avatar (so the
  // first-ever character-creation visit isn't completely blank).
  const [party, setParty] = useState<CharDraft[]>(() => {
    const saved = loadPartyDraft(contextId);
    if (saved && selectedCtxForInit) {
      return saved.map((d) => sanitizeDraft(d, selectedCtxForInit));
    }
    return [
      {
        name: localStorage.getItem('operative_name') || '',
        cls: selectedCtxForInit?.classes[0]?.id ?? '',
        speciesId: 'human',
        backgroundId: selectedCtxForInit?.backgrounds?.[0]?.id ?? '',
        stats: rollStatBlock(),
        portrait: user?.avatar_url ?? null,
        rollCount: 1,
        statMethod: 'roll',
      },
    ];
  });
  const [error, setError] = useState('');
  // Two-click swap state — when the player clicks a stat box, we remember
  // it; clicking another stat box swaps the two values; clicking the same
  // box again cancels. Allows assigning rolled or array values to the right
  // abilities (PHB p.13: "Standard Method" assignment).
  const [swapFrom, setSwapFrom] = useState<{ partyIdx: number; key: keyof StatBlock } | null>(null);
  // BE context summaries (originFeat per background, feat shapes, spell
  // catalog) drive the Magic Initiate spell picker. Lazy-loaded on mount;
  // empty until the request resolves. The picker trigger button stays
  // hidden until the data is ready so players can't open an empty dialog.
  const [beContexts, setBeContexts] = useState<Record<string, BackendContextSummary>>({});
  // Which party-member index has the spell picker open. null = closed.
  const [spellPickerIdx, setSpellPickerIdx] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.listContexts().then(
      (list) => {
        if (cancelled) return;
        const map: Record<string, BackendContextSummary> = {};
        for (const c of list) map[c.id] = c;
        setBeContexts(map);
      },
      // Silent failure — picker just stays hidden. Character creation
      // still works for backgrounds without choice-requiring feats.
      () => {}
    );
    return () => {
      cancelled = true;
    };
  }, []);

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

  function setStatMethod(partyIdx: number, method: StatMethod) {
    setSwapFrom(null);
    const ctxForMethod = availableContexts.find((c) => c.id === contextId) ?? availableContexts[0];
    setParty((prev) =>
      prev.map((d, i) => {
        if (i !== partyIdx) return d;
        // roll → fresh 4d6 spread; array / point buy → the standard array
        // arranged for the class (a valid 27-point build the player can then
        // redistribute under point buy); manual → keep the current scores so
        // the player edits from where they are.
        const stats =
          method === 'roll'
            ? rollStatBlock()
            : method === 'manual'
              ? { ...d.stats }
              : ctxForMethod
                ? assignStatsForClass(STANDARD_ARRAY, ctxForMethod, d.cls)
                : { ...STANDARD_ARRAY };
        return { ...d, statMethod: method, stats, rollCount: 1 };
      })
    );
  }

  // Step one ability up/down for the point-buy and manual methods. Point buy
  // clamps to 8–15 and rejects an increment the budget can't afford; manual
  // clamps to MANUAL_MIN..MANUAL_MAX.
  function adjustStat(partyIdx: number, key: keyof StatBlock, delta: number) {
    setParty((prev) =>
      prev.map((d, i) => {
        if (i !== partyIdx) return d;
        const cur = d.stats[key];
        if (d.statMethod === 'pointbuy') {
          const next = cur + delta;
          if (next < POINT_BUY_MIN || next > POINT_BUY_MAX) return d;
          const candidate = { ...d.stats, [key]: next };
          if (pointBuySpent(candidate) > POINT_BUY_BUDGET) return d; // can't afford
          return { ...d, stats: candidate };
        }
        if (d.statMethod === 'manual') {
          const next = Math.max(MANUAL_MIN, Math.min(MANUAL_MAX, cur + delta));
          return { ...d, stats: { ...d.stats, [key]: next } };
        }
        return d;
      })
    );
  }

  useEffect(() => {
    const c = availableContexts.find((c) => c.id === contextId);
    if (!c) return;
    applyTheme(c.theme);
    localStorage.setItem('last_context_id', contextId);
    // If the new context has a saved party draft, restore it (sanitized
    // against the current campaign's classes / backgrounds). Otherwise
    // fall back to a fresh single-member party for this context.
    const saved = loadPartyDraft(contextId);
    if (saved) {
      setParty(saved.map((d) => sanitizeDraft(d, c)));
    } else {
      setParty([
        {
          name: localStorage.getItem('operative_name') || '',
          cls: c.classes[0]?.id ?? '',
          speciesId: 'human',
          backgroundId: c.backgrounds?.[0]?.id ?? '',
          stats: rollStatBlock(),
          portrait: user?.avatar_url ?? null,
          rollCount: 1,
          statMethod: 'roll',
        },
      ]);
    }
  }, [contextId, availableContexts, user]);

  // Persist the current party draft to localStorage whenever it changes
  // (debouncing isn't necessary — writes are sync but cheap, and the
  // state changes on discrete user actions like name typing).
  useEffect(() => {
    savePartyDraft(contextId, party);
  }, [contextId, party]);

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
        speciesId: 'human',
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
        speciesId: 'human',
        backgroundId: selectedCtxForInit.backgrounds?.[0]?.id ?? '',
        // Roll 4d6-drop-lowest x6, then assign the highest to the class's
        // primary stat and the 2nd-highest to CON. The rest fill in any
        // order. Without this, a Cleric auto-filled with rolls in raw
        // order often ended up with WIS 10 and one prepared spell.
        stats: assignStatsForClass(rollStatBlock(), selectedCtxForInit, cls),
        portrait: null,
        rollCount: 1,
        statMethod: 'roll',
      }))
    );
  }

  async function handle() {
    const leader = party[0];
    if (!leader.name.trim()) return setError('Enter a name for your first hero');
    if (party.some((d) => !d.name.trim())) return setError('All party members must have a name');
    // Magic Initiate backgrounds need the player to have completed the
    // spell picker. Without choices, BE silently emits a "may learn..."
    // narrative + grants nothing — block start so the player notices.
    const beCtx = beContexts[contextId];
    const missingSpellPicks = party.findIndex((d) => {
      const inputs = getMagicInitiatePickerInputs(beCtx, d.backgroundId);
      if (!inputs) return false;
      const picks = d.featChoices ?? {};
      const cantripsOk = (picks.cantripChoices?.length ?? 0) === inputs.cantripCount;
      const l1Ok = inputs.l1Count === 0 || !!picks.l1Choice;
      return !(cantripsOk && l1Ok);
    });
    if (missingSpellPicks >= 0) {
      const d = party[missingSpellPicks];
      return setError(
        `${d.name || `Hero ${missingSpellPicks + 1}`} must finish picking Magic Initiate spells before starting`
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
          species: d.speciesId || undefined,
          feat_choices: d.featChoices,
        })),
        contextId
      );
    } catch (e) {
      setError((e as { error?: string })?.error || 'Failed to start adventure');
    }
  }

  return (
    <div className={styles.pageFlex}>
      <div className={styles.charInner}>
        <div className={styles.charPartyCol}>
          <h1 className={styles.title} style={{ fontSize: '1.1rem', marginBottom: 4 }}>
            HERO REGISTRY
          </h1>
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
                    aria-label="Remove this hero"
                  >
                    <span aria-hidden="true">✕</span>
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

                <label className={styles.formLbl} htmlFor={`char-${idx}-name`}>
                  HERO NAME
                </label>
                <input
                  id={`char-${idx}-name`}
                  className={styles.formInp}
                  value={draft.name}
                  onChange={(e) => updateDraft(idx, { name: e.target.value })}
                  placeholder="e.g. Buck Starling"
                  autoFocus={idx === 0}
                />

                <label className={styles.formLbl} htmlFor={`char-${idx}-class`}>
                  CLASS
                </label>
                <select
                  id={`char-${idx}-class`}
                  className={styles.formInp}
                  style={{ cursor: 'pointer' }}
                  value={draft.cls}
                  onChange={(e) => updateDraft(idx, { cls: e.target.value })}
                >
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.id}
                    </option>
                  ))}
                </select>

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

                <label
                  className={styles.formLbl}
                  style={{ marginTop: 12 }}
                  htmlFor={`char-${idx}-species`}
                >
                  SPECIES
                </label>
                <select
                  id={`char-${idx}-species`}
                  className={styles.formInp}
                  style={{ cursor: 'pointer' }}
                  value={draft.speciesId}
                  onChange={(e) => updateDraft(idx, { speciesId: e.target.value })}
                  data-testid={`species-select-${idx}`}
                >
                  {SPECIES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                {(() => {
                  const sp = SPECIES.find((s) => s.id === draft.speciesId);
                  if (!sp) return null;
                  return (
                    <div className={styles.classDesc}>
                      <span style={{ color: 'var(--t-mid)' }}>{sp.desc}</span>
                      <div style={{ marginTop: 4, fontSize: '0.7rem' }}>
                        <span style={{ color: 'var(--t-dim)', letterSpacing: '0.08em' }}>
                          SIZE:{' '}
                        </span>
                        <span style={{ color: 'var(--t-mid)' }}>{sp.size.toUpperCase()}</span>
                        <span style={{ color: 'var(--t-dim)' }}> · </span>
                        <span style={{ color: 'var(--t-dim)' }}>SPEED: </span>
                        <span style={{ color: 'var(--t-mid)' }}>{sp.speedFt} ft</span>
                        {sp.darkvisionFt && (
                          <>
                            <span style={{ color: 'var(--t-dim)' }}> · </span>
                            <span style={{ color: 'var(--t-dim)' }}>DARKVISION: </span>
                            <span style={{ color: 'var(--t-mid)' }}>{sp.darkvisionFt} ft</span>
                          </>
                        )}
                        {sp.resistances && sp.resistances.length > 0 && (
                          <>
                            <span style={{ color: 'var(--t-dim)' }}> · </span>
                            <span style={{ color: 'var(--t-dim)' }}>RESIST: </span>
                            <span style={{ color: 'var(--t-mid)' }}>
                              {sp.resistances.join(', ')}
                            </span>
                          </>
                        )}
                      </div>
                      {sp.traits.length > 0 && (
                        <ul
                          style={{
                            margin: '4px 0 0',
                            paddingLeft: '1rem',
                            color: 'var(--t-mid)',
                            fontSize: '0.7rem',
                          }}
                        >
                          {sp.traits.map((t, i) => (
                            <li key={i}>{t}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })()}

                {backgrounds.length > 0 && (
                  <>
                    <label
                      className={styles.formLbl}
                      style={{ marginTop: 12 }}
                      htmlFor={`char-${idx}-background`}
                    >
                      BACKGROUND
                    </label>
                    <select
                      id={`char-${idx}-background`}
                      className={styles.formInp}
                      style={{ cursor: 'pointer' }}
                      value={draft.backgroundId}
                      onChange={(e) =>
                        // Clear feat picks on background swap — the next
                        // background's origin feat may not need them, or
                        // may need a different spell list.
                        updateDraft(idx, {
                          backgroundId: e.target.value,
                          featChoices: undefined,
                        })
                      }
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
                    {(() => {
                      const inputs = getMagicInitiatePickerInputs(
                        beContexts[contextId],
                        draft.backgroundId
                      );
                      if (!inputs) return null;
                      const picks = draft.featChoices ?? {};
                      const cantripsPicked = picks.cantripChoices?.length ?? 0;
                      const l1Picked = !!picks.l1Choice;
                      const complete =
                        cantripsPicked === inputs.cantripCount &&
                        (inputs.l1Count === 0 || l1Picked);
                      return (
                        <button
                          type="button"
                          className={styles.formInp}
                          style={{
                            cursor: 'pointer',
                            marginTop: 8,
                            color: complete ? 'var(--t-primary)' : 'var(--t-hp-mid)',
                            borderColor: complete ? 'var(--t-primary)' : 'var(--t-hp-mid)',
                            textAlign: 'left',
                          }}
                          onClick={() => setSpellPickerIdx(idx)}
                          data-testid={`magic-initiate-trigger-${idx}`}
                        >
                          {complete
                            ? `✓ ${inputs.featName} — ${cantripsPicked} cantrips + ${l1Picked ? '1' : '0'} L1 chosen (click to change)`
                            : `⚠ ${inputs.featName} — pick ${inputs.cantripCount} cantrips${inputs.l1Count > 0 ? ' + 1 L1 spell' : ''}`}
                        </button>
                      );
                    })()}
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
                {/* Generation method: 4d6-drop-lowest (PHB p.12), the standard
                    array 15/14/13/12/10/8 (PHB p.13), 27-point buy, or free
                    manual entry. */}
                <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                  {(['roll', 'array', 'pointbuy', 'manual'] as const).map((m) => {
                    const active = draft.statMethod === m;
                    const label =
                      m === 'roll'
                        ? 'ROLL 4d6'
                        : m === 'array'
                          ? 'ARRAY'
                          : m === 'pointbuy'
                            ? 'POINT BUY'
                            : 'MANUAL';
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
                        {label}
                      </button>
                    );
                  })}
                </div>
                {draft.statMethod === 'pointbuy' &&
                  (() => {
                    const remaining = POINT_BUY_BUDGET - pointBuySpent(draft.stats);
                    return (
                      <p
                        style={{
                          fontSize: '0.7rem',
                          marginBottom: 6,
                          letterSpacing: '0.05em',
                          color: 'var(--t-mid)',
                        }}
                        data-testid={`point-buy-remaining-${idx}`}
                      >
                        POINTS:{' '}
                        <span style={{ color: 'var(--t-primary)', fontWeight: 'bold' }}>
                          {remaining}
                        </span>{' '}
                        / {POINT_BUY_BUDGET} remaining · scores 8–15
                      </p>
                    );
                  })()}
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  {STAT_KEYS.map((key) => {
                    const val = draft.stats[key];
                    const isPrimary = key === primaryStat;
                    const usesSteppers =
                      draft.statMethod === 'pointbuy' || draft.statMethod === 'manual';

                    if (usesSteppers) {
                      const isPb = draft.statMethod === 'pointbuy';
                      const canDec = val > (isPb ? POINT_BUY_MIN : MANUAL_MIN);
                      const canInc = isPb
                        ? val < POINT_BUY_MAX &&
                          pointBuySpent({ ...draft.stats, [key]: val + 1 }) <= POINT_BUY_BUDGET
                        : val < MANUAL_MAX;
                      const stepBtn = (enabled: boolean) => ({
                        fontFamily: 'inherit',
                        fontSize: '0.85rem',
                        lineHeight: 1,
                        width: 20,
                        height: 18,
                        padding: 0,
                        background: 'transparent',
                        border: `1px solid ${enabled ? 'var(--t-border)' : 'var(--t-separator)'}`,
                        color: enabled ? 'var(--t-primary)' : 'var(--t-separator)',
                        cursor: enabled ? 'pointer' : 'default',
                      });
                      return (
                        <div
                          key={key}
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            padding: '4px 6px',
                            minWidth: 42,
                            border: `2px solid ${isPrimary ? 'var(--t-primary)' : 'var(--t-border)'}`,
                            background: isPrimary ? 'var(--t-separator)' : 'transparent',
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
                          <div style={{ display: 'flex', gap: 3, marginTop: 3 }}>
                            <button
                              type="button"
                              aria-label={`Decrease ${STAT_LABEL[key]}`}
                              disabled={!canDec}
                              onClick={() => adjustStat(idx, key, -1)}
                              style={stepBtn(canDec)}
                            >
                              −
                            </button>
                            <button
                              type="button"
                              aria-label={`Increase ${STAT_LABEL[key]}`}
                              disabled={!canInc}
                              onClick={() => adjustStat(idx, key, +1)}
                              style={stepBtn(canInc)}
                            >
                              +
                            </button>
                          </div>
                        </div>
                      );
                    }

                    // roll / array — click-to-swap to rearrange the fixed values.
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
                {(draft.statMethod === 'pointbuy' || draft.statMethod === 'manual') && (
                  <p
                    style={{
                      fontSize: '0.7rem',
                      color: 'var(--t-dim)',
                      marginTop: 4,
                      letterSpacing: '0.05em',
                    }}
                  >
                    {draft.statMethod === 'pointbuy'
                      ? 'Spend up to 27 points across your abilities (8–15 each).'
                      : `Set any score from ${MANUAL_MIN} to ${MANUAL_MAX}.`}
                  </p>
                )}
                {(draft.statMethod === 'roll' || draft.statMethod === 'array') &&
                  swapFrom?.partyIdx === idx && (
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
              <span aria-hidden="true">★ </span>AUTO-FILL RECOMMENDED PARTY (
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
            data-testid="begin-adventure-btn"
            className={styles.submit}
            onClick={handle}
            disabled={loading}
          >
            {loading ? 'LAUNCHING ADVENTURE...' : 'BEGIN ADVENTURE'}
          </button>
        </div>

        <div className={styles.charWorldCol}>
          <h2 className={styles.title} style={{ fontSize: '1.1rem', marginBottom: 4 }}>
            WORLD TYPE
          </h2>
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
                        <span aria-hidden="true">▶ </span>SELECTED
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
      {spellPickerIdx !== null &&
        (() => {
          const draft = party[spellPickerIdx];
          if (!draft) return null;
          const inputs = getMagicInitiatePickerInputs(beContexts[contextId], draft.backgroundId);
          if (!inputs) return null;
          const beCtx = beContexts[contextId];
          return (
            <SpellPickerDialog
              featName={inputs.featName}
              spellList={inputs.spellList}
              cantripCount={inputs.cantripCount}
              l1Count={inputs.l1Count}
              spells={beCtx?.spells ?? []}
              initialCantrips={draft.featChoices?.cantripChoices ?? []}
              initialL1={draft.featChoices?.l1Choice ?? null}
              onClose={() => setSpellPickerIdx(null)}
              onSave={(cantripChoices, l1Choice) => {
                updateDraft(spellPickerIdx, {
                  featChoices: {
                    cantripChoices,
                    l1Choice: l1Choice ?? undefined,
                  },
                });
              }}
            />
          );
        })()}
    </div>
  );
}

export default CharScreen;
