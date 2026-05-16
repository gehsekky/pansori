import { useState, useEffect, useRef, ReactNode } from 'react';
import { api } from './lib/api.js';
import { context as scifiContext }   from './contexts/scifi-terror.js';
import { context as dungeonContext } from './contexts/dungeon-crawler.js';
import type { FrontendContext, GameState, Seed, Session } from './types.js';

const CONTEXTS: Record<string, FrontendContext> = {
  'scifi-terror':    scifiContext,
  'dungeon-crawler': dungeonContext,
};
function getCtx(seed: Seed | null): FrontendContext {
  return (seed?.context_id ? CONTEXTS[seed.context_id] : null) ?? scifiContext;
}

// ─── Static styles (colors via CSS custom properties) ────────────────────────
const S: Record<string, React.CSSProperties> = {
  page:     { minHeight: '100vh', background: 'var(--t-bg)', color: 'var(--t-primary)', fontFamily: 'var(--t-font)', padding: '1.5rem' },
  header:   { borderBottom: '1px solid var(--t-primary)', paddingBottom: '0.75rem', marginBottom: '1rem' },
  title:    { fontSize: '1.4rem', letterSpacing: '0.2em', margin: 0, textShadow: '0 0 8px var(--t-primary)' },
  sub:      { fontSize: '0.7rem', color: 'var(--t-dim)', letterSpacing: '0.15em', marginTop: 4 },
  card:     { border: '1px solid var(--t-border)', background: 'var(--t-card)', padding: '1rem', borderRadius: 2, marginBottom: '1rem' },
  statsRow: { display: 'flex', gap: '1.5rem', fontSize: '0.75rem', flexWrap: 'wrap', color: 'var(--t-mid)' },
  stat:     { display: 'flex', flexDirection: 'column', gap: 2 },
  statLbl:  { color: 'var(--t-dim)', fontSize: '0.65rem', letterSpacing: '0.1em' },
  statVal:  { fontWeight: 'bold' },
  narrative:{ fontSize: '0.95rem', lineHeight: 1.75, minHeight: 90, color: 'var(--t-primary)', fontStyle: 'italic' },
  choices:  { display: 'flex', flexDirection: 'column', gap: 8, marginTop: '1rem' },
  choiceBtn:{ background: 'transparent', color: 'var(--t-primary)', border: '1px solid var(--t-border)',
              padding: '0.5rem 0.875rem', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
              fontSize: '0.875rem', letterSpacing: '0.03em', transition: 'border-color 0.15s, background 0.15s' },
  input:    { background: 'var(--t-card)', color: 'var(--t-primary)', border: '1px solid var(--t-border)',
              padding: '0.5rem 0.75rem', fontFamily: 'inherit', fontSize: '0.875rem', flex: 1, outline: 'none' },
  sendBtn:  { background: 'var(--t-dim-dark)', color: 'var(--t-primary)', border: '1px solid var(--t-border)',
              padding: '0.5rem 1rem', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.875rem', whiteSpace: 'nowrap' },
  scanTxt:  { color: 'var(--t-dim)', fontStyle: 'italic', animation: 'blink 1s step-end infinite' },
  logEntry: { fontSize: '0.72rem', color: 'var(--t-dim-dark)', borderBottom: '1px solid var(--t-separator)', padding: '3px 0' },
  formLbl:  { display: 'block', fontSize: '0.7rem', letterSpacing: '0.15em', color: 'var(--t-dim)', marginBottom: 4, marginTop: 12 },
  formInp:  { display: 'block', width: '100%', background: 'var(--t-card)', color: 'var(--t-primary)',
              border: '1px solid var(--t-border)', padding: '0.5rem 0.75rem', fontFamily: 'inherit',
              fontSize: '0.875rem', boxSizing: 'border-box', outline: 'none' },
  submit:   { marginTop: 16, background: 'var(--t-dim-dark)', color: 'var(--t-primary)', border: '1px solid var(--t-primary)',
              padding: '0.6rem 1.5rem', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.875rem',
              letterSpacing: '0.1em', width: '100%' },
  err:      { color: 'var(--t-hp-low)', fontSize: '0.8rem', marginTop: 8 },
};

interface Theme { pageBg: string; cardBg: string; font: string; primary: string; mid: string; dim: string; dimDark: string; border: string; separator: string; itemColor: string; hpHigh: string; hpMid: string; hpLow: string; title: string; worldLabel: string; }

function applyTheme(theme: Theme) {
  const r = document.documentElement.style;
  r.setProperty('--t-bg',        theme.pageBg);
  r.setProperty('--t-card',      theme.cardBg);
  r.setProperty('--t-font',      theme.font);
  r.setProperty('--t-primary',   theme.primary);
  r.setProperty('--t-mid',       theme.mid);
  r.setProperty('--t-dim',       theme.dim);
  r.setProperty('--t-dim-dark',  theme.dimDark);
  r.setProperty('--t-border',    theme.border);
  r.setProperty('--t-separator', theme.separator);
  r.setProperty('--t-item',      theme.itemColor);
  r.setProperty('--t-hp-high',   theme.hpHigh);
  r.setProperty('--t-hp-mid',    theme.hpMid);
  r.setProperty('--t-hp-low',    theme.hpLow);
}

applyTheme(scifiContext.theme);

type View = 'loading' | 'char' | 'game';
type HistoryEntry = { role: 'user' | 'assistant'; content: string };

// ─── App shell ───────────────────────────────────────────────────────────────
export default function App() {
  const [view, setView]           = useState<View>('loading');
  const [session, setSession]     = useState<Session | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [seed, setSeed]           = useState<Seed | null>(null);
  const [choices, setChoices]     = useState<string[]>([]);
  const [history, setHistory]     = useState<HistoryEntry[]>([]);
  const [loading, setLoading]     = useState(false);
  const [escaped, setEscaped]     = useState(false);
  const [customAction, setCustomAction] = useState('');
  const [roomLog, setRoomLog]     = useState<string[]>([]);
  const logRef       = useRef<HTMLDivElement>(null);
  const narrativeRef = useRef<HTMLDivElement>(null);

  const ctx       = getCtx(seed);
  const worldName = seed?.world_name || seed?.ship_name || '???';

  useEffect(() => { applyTheme(ctx.theme); }, [ctx]);

  useEffect(() => {
    const uuidInPath = window.location.pathname.match(/^\/([0-9a-f-]{36})$/i)?.[1];
    if (uuidInPath) {
      api.getSessionById(uuidInPath)
        .then(s => {
          if (s) {
            setSession(s); setGameState(s.state); setSeed(s.seed);
            const log = s.state.run_log || [];
            if (log.length > 0) {
              setRoomLog([log[log.length - 1].narrative]);
              setChoices((s.state.last_choices || []).filter(c => !/^(equip|unequip)\b/i.test(c)));
            }
            setView('game');
          } else {
            window.history.replaceState(null, '', '/');
            setView('char');
          }
        })
        .catch(() => setView('char'));
    } else {
      setView('char');
    }
  }, []);

  async function handleNewGame(charName: string, charClass: string, contextId: string) {
    setLoading(true);
    try {
      const result = await api.newSession(charName, charClass, contextId);
      setSession(result.session); setGameState(result.state); setSeed(result.seed);
      setHistory([]); setEscaped(false); setView('game');
      window.history.pushState(null, '', `/${result.session.id}`);
      if (result.seed.intro) setRoomLog([result.seed.intro]);
      setChoices((result.state.last_choices || []).filter(c => !/^(equip|unequip)\b/i.test(c)));
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  async function act(action: string, currentHistory: HistoryEntry[]) {
    const sid     = session?.id;
    const state   = gameState;
    const preRoom = state?.current_room;
    if (!sid) return;
    setLoading(true);
    try {
      const result = await api.takeAction(sid, action, currentHistory);
      const newHistory: HistoryEntry[] = [
        ...currentHistory,
        { role: 'user',      content: action },
        { role: 'assistant', content: result.narrative },
      ];
      setHistory(newHistory);
      setChoices((result.choices || []).filter(c => !/^(equip|unequip)\b/i.test(c)));
      setGameState(result.newState);
      if (result.escaped) setEscaped(true);
      if (logRef.current) logRef.current.scrollTop = 0;
      const movedRoom = result.newState.current_room !== preRoom;
      setRoomLog(prev => (movedRoom || prev.length === 0) ? [result.narrative] : [...prev, result.narrative]);
    } catch {
      setRoomLog(prev => [...prev, 'Communications array offline... (error contacting server)']);
    }
    setLoading(false);
  }

  useEffect(() => {
    if (narrativeRef.current) narrativeRef.current.scrollTop = narrativeRef.current.scrollHeight;
  }, [roomLog]);

  async function handleEquip(itemId: string) {
    if (!session) return;
    try {
      const result = await api.equipItem(session.id, itemId);
      setGameState(result.newState);
    } catch (e) {
      const err = e as { error?: string };
      if (err?.error) setRoomLog(prev => [...prev, `⚠ ${err.error}`]);
    }
  }

  function handleChoice(c: string) { act(c, history); }
  function handleCustom() {
    const v = customAction.trim();
    if (!v) return;
    setCustomAction('');
    act(v, history);
  }

  return (
    <>
      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        button:hover { border-color: var(--t-primary) !important; background: var(--t-separator) !important; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
      `}</style>

      {view === 'loading' && (
        <div style={S.page}>
          <p style={{ color: 'var(--t-dim)' }}>SYSTEM BOOT...</p>
        </div>
      )}

      {view === 'char' && <CharScreen onStart={handleNewGame} loading={loading} availableContexts={Object.values(CONTEXTS)} />}

      {view === 'game' && (
        <div style={S.page}>
          <header style={S.header}>
            <p style={S.title}>{ctx.theme.title}</p>
            <p style={S.sub}>{ctx.theme.worldLabel}: {worldName}  ·  HERO: {session?.character_name}  [{session?.character_class}]</p>
          </header>

          <StatsBar state={gameState} ctx={ctx} seed={seed} onEquip={handleEquip}
            inCombat={!!gameState?.combat_active} />

          <div style={{ display: 'flex', gap: '1rem', alignItems: 'stretch' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ ...S.card, maxHeight: 320, overflowY: 'auto' }} ref={narrativeRef}>
                {loading && roomLog.length === 0
                  ? <p style={S.scanTxt}>Scanning sector...</p>
                  : roomLog.map((text, i) => (
                      <p key={i} style={{
                        ...S.narrative,
                        minHeight: 0, margin: 0,
                        paddingBottom: i < roomLog.length - 1 ? '0.75rem' : 0,
                        borderBottom:  i < roomLog.length - 1 ? '1px solid var(--t-separator)' : 'none',
                        marginBottom:  i < roomLog.length - 1 ? '0.75rem' : 0,
                        opacity: 0.4 + 0.6 * ((i + 1) / roomLog.length),
                      }}>{text}</p>
                    ))
                }
                {loading && roomLog.length > 0 && <p style={{ ...S.scanTxt, marginTop: '0.5rem' }}>Scanning sector...</p>}
              </div>

              {!loading && escaped ? (
                <div style={{ ...S.card, borderColor: 'var(--t-primary)', textAlign: 'center', padding: '1.5rem' }}>
                  <p style={{ color: 'var(--t-primary)', fontSize: '1.1rem', letterSpacing: '0.2em', marginBottom: '0.5rem', textShadow: '0 0 8px var(--t-primary)' }}>
                    ★ MISSION COMPLETE ★
                  </p>
                  <p style={{ color: 'var(--t-mid)', fontSize: '0.8rem', marginBottom: '1.25rem' }}>
                    You escaped the {worldName}. Well done, hero.
                  </p>
                  <button style={{ ...S.submit, width: 'auto', padding: '0.6rem 2rem' }}
                    onClick={() => { setEscaped(false); setView('char'); setHistory([]); }}>
                    START NEW MISSION
                  </button>
                </div>
              ) : !loading && gameState?.dead ? (
                <div style={{ ...S.card, borderColor: 'var(--t-hp-low)', textAlign: 'center', padding: '1.5rem' }}>
                  <p style={{ color: 'var(--t-hp-low)', fontSize: '1.1rem', letterSpacing: '0.2em', marginBottom: '0.5rem' }}>
                    ✖ HERO DECEASED ✖
                  </p>
                  <p style={{ color: 'var(--t-dim)', fontSize: '0.8rem', marginBottom: '1.25rem' }}>
                    The {worldName} has claimed another victim.
                  </p>
                  <button style={{ ...S.submit, width: 'auto', padding: '0.6rem 2rem' }}
                    onClick={() => { setView('char'); setHistory([]); }}>
                    START NEW MISSION
                  </button>
                </div>
              ) : (
                <>
                  <div style={S.choices}>
                    {!loading && choices.map((c, i) => (
                      <button key={i} style={S.choiceBtn} onClick={() => handleChoice(c)}>
                        [{i + 1}] {c}
                      </button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: '1rem' }}>
                    <input
                      style={S.input}
                      value={customAction}
                      onChange={e => setCustomAction(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleCustom()}
                      placeholder="Type your own action..."
                      disabled={loading}
                    />
                    <button style={S.sendBtn} onClick={handleCustom} disabled={loading}>TRANSMIT</button>
                  </div>
                </>
              )}

              {history.length > 0 && (
                <div style={{ ...S.card, marginTop: '1.5rem', maxHeight: 160, overflowY: 'auto' }} ref={logRef}>
                  <p style={{ fontSize: '0.65rem', letterSpacing: '0.1em', color: 'var(--t-dim-dark)', marginBottom: 6 }}>MISSION LOG</p>
                  {[...history].reverse().filter((_, i) => i % 2 === 0).slice(0, 20).map((m, i) => (
                    <p key={i} style={S.logEntry}>› {m.content}</p>
                  ))}
                </div>
              )}

              <div style={{ marginTop: '1rem', fontSize: '0.7rem', color: 'var(--t-dim-dark)', display: 'flex', gap: '1.5rem' }}>
                <button style={{ ...S.sendBtn, padding: '0.3rem 0.75rem', fontSize: '0.7rem' }}
                  onClick={() => { if (confirm('Abandon current run and start over?')) { setView('char'); setHistory([]); window.history.pushState(null, '', '/'); } }}>
                  ABORT MISSION
                </button>
              </div>
            </div>

            <RoomArtPanel roomId={gameState?.current_room ?? null} ctx={ctx} />
          </div>
        </div>
      )}
    </>
  );
}

// ─── Stats bar ───────────────────────────────────────────────────────────────
function StatsBar({ state, ctx, seed, onEquip, inCombat }: {
  state:    GameState | null;
  ctx:      FrontendContext;
  seed:     Seed | null;
  onEquip:  (id: string) => void;
  inCombat: boolean;
}) {
  const [activeItemIdx, setActiveItemIdx] = useState<number | null>(null);

  useEffect(() => {
    if (activeItemIdx === null) return;
    function close() { setActiveItemIdx(null); }
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [activeItemIdx]);

  if (!state) return null;
  const hpPct   = Math.round((state.hp / state.max_hp) * 100);
  const hpColor = hpPct > 50 ? 'var(--t-hp-high)' : hpPct > 25 ? 'var(--t-hp-mid)' : 'var(--t-hp-low)';

  return (
    <div style={{ ...S.card, marginBottom: '0.75rem' }}>
      <div style={S.statsRow}>
        <div style={S.stat}><span style={S.statLbl}>HP</span><span style={{ ...S.statVal, color: hpColor }}>{state.hp}/{state.max_hp}</span></div>
        <div style={S.stat}><span style={S.statLbl}>AC</span><span style={S.statVal}>{state.ac}</span></div>
        <div style={S.stat}><span style={S.statLbl}>LVL</span><span style={S.statVal}>{state.level}</span></div>
        <div style={S.stat}><span style={S.statLbl}>XP</span><span style={S.statVal}>{state.xp}</span></div>
        <div style={S.stat}><span style={S.statLbl}>GOLD</span><span style={S.statVal}>{state.gold}cr</span></div>
        <div style={S.stat}>
          <span style={S.statLbl}>ROOM</span>
          <span style={S.statVal}>{seed?.rooms?.find(r => r.id === state.current_room)?.name ?? state.current_room}</span>
        </div>
        <div style={S.stat}><span style={S.statLbl}>VISITED</span><span style={S.statVal}>{state.visited_rooms?.length ?? 0}</span></div>
        <div style={S.stat}>
          <span style={S.statLbl}>WEAPON</span>
          <span style={{ ...S.statVal, display: 'flex', alignItems: 'center', gap: 3 }}>
            {state.equipped_weapon
              ? <>{ctx.itemIcons[state.equipped_weapon] ?? null}{ctx.weaponNames[state.equipped_weapon] || state.equipped_weapon}</>
              : <span style={{ color: 'var(--t-dim)' }}>unarmed</span>}
          </span>
        </div>
        <div style={S.stat}>
          <span style={S.statLbl}>ARMOR</span>
          <span style={{ ...S.statVal, display: 'flex', alignItems: 'center', gap: 3 }}>
            {state.equipped_armor
              ? <>{ctx.itemIcons[state.equipped_armor] ?? null}{ctx.armorNames[state.equipped_armor] || state.equipped_armor}</>
              : <span style={{ color: 'var(--t-dim)' }}>none</span>}
          </span>
        </div>
        <div style={S.stat}>
          <span style={S.statLbl}>INVENTORY</span>
          <span style={{ ...S.statVal, display: 'flex', flexWrap: 'wrap', gap: '0.6rem', alignItems: 'center' }}>
            {state.inventory?.length
              ? state.inventory.map((item, idx) => {
                  const equipped    = item.id === state.equipped_weapon || item.id === state.equipped_armor;
                  const equippable  = !!(ctx.weaponNames[item.id] || ctx.armorNames[item.id]) && !inCombat;
                  const popoverOpen = activeItemIdx === idx;
                  return (
                    <Tooltip key={idx} text={equippable ? null : (item.desc ?? ctx.itemDescs[item.id])}>
                      <span
                        onMouseDown={e => {
                          if (!equippable) return;
                          e.stopPropagation();
                          setActiveItemIdx(popoverOpen ? null : idx);
                        }}
                        style={{
                          position: 'relative',
                          display: 'flex', alignItems: 'center', gap: 3,
                          cursor:      equippable ? 'pointer' : 'default',
                          color:       equipped ? 'var(--t-primary)' : 'var(--t-item)',
                          textShadow:  equipped ? '0 0 6px var(--t-primary)' : 'none',
                          borderBottom: equippable ? '1px dotted var(--t-dim)' : 'none',
                        }}
                      >
                        {ctx.itemIcons[item.id] ?? null}{item.name}
                        {popoverOpen && (
                          <span
                            onMouseDown={e => e.stopPropagation()}
                            style={{
                              position: 'absolute', bottom: 'calc(100% + 6px)', left: 0,
                              background: 'var(--t-card)', border: '1px solid var(--t-border)',
                              padding: '0.3rem 0.5rem', zIndex: 20, whiteSpace: 'nowrap',
                              display: 'flex', flexDirection: 'column', gap: 4,
                            }}
                          >
                            <span style={{ fontSize: '0.6rem', color: 'var(--t-dim)', letterSpacing: '0.1em', marginBottom: 2 }}>
                              {item.desc ?? ctx.itemDescs[item.id]}
                            </span>
                            <button
                              style={{ ...S.choiceBtn, padding: '0.2rem 0.5rem', fontSize: '0.65rem' }}
                              onClick={() => { onEquip(item.id); setActiveItemIdx(null); }}
                            >
                              {equipped ? 'UNEQUIP' : 'EQUIP'}
                            </button>
                          </span>
                        )}
                      </span>
                    </Tooltip>
                  );
                })
              : '—'}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Room art panel ──────────────────────────────────────────────────────────
const IMG_EXTS = ['webp', 'png', 'jpg', 'jpeg'];

function RoomArtPanel({ roomId, ctx }: { roomId: string | null; ctx: FrontendContext }) {
  const [extIdx, setExtIdx] = useState(0);
  const art = roomId ? ctx.art[roomId] : null;

  useEffect(() => { setExtIdx(0); }, [roomId, ctx.id]);

  const allFailed = extIdx >= IMG_EXTS.length;
  if (!art && allFailed) return null;

  return (
    <div style={{ ...S.card, flex: '0 0 20%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0.75rem', overflow: 'hidden' }}>
      {!allFailed
        ? <img
            src={`/art/${ctx.id}/${roomId}.${IMG_EXTS[extIdx]}`}
            alt={roomId ?? ''}
            onError={() => setExtIdx(i => i + 1)}
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }}
          />
        : <pre style={{
            margin: 0, fontSize: '0.78rem', lineHeight: 1.4,
            color: 'var(--t-mid)', textShadow: '0 0 4px var(--t-border)',
            fontFamily: 'var(--t-font)', userSelect: 'none',
          }}>{art}</pre>
      }
    </div>
  );
}

// ─── Tooltip ─────────────────────────────────────────────────────────────────
function Tooltip({ text, children }: { text: string | null | undefined; children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  if (!text) return <>{children}</>;
  return (
    <span
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && (
        <span style={{
          position: 'absolute', bottom: 'calc(100% + 6px)', left: '50%', transform: 'translateX(-50%)',
          background: 'var(--t-card)', border: '1px solid var(--t-border)', color: 'var(--t-mid)',
          fontSize: '0.65rem', lineHeight: 1.5, letterSpacing: '0.03em',
          padding: '0.3rem 0.5rem', whiteSpace: 'nowrap', zIndex: 10, pointerEvents: 'none',
        }}>
          {text}
        </span>
      )}
    </span>
  );
}

// ─── Character select ────────────────────────────────────────────────────────
function CharScreen({ onStart, loading, availableContexts }: {
  onStart:           (name: string, cls: string, contextId: string) => Promise<void>;
  loading:           boolean;
  availableContexts: FrontendContext[];
}) {
  const [name, setName]       = useState(() => localStorage.getItem('operative_name') || '');
  const [contextId, setContextId] = useState(
    () => localStorage.getItem('last_context_id') ?? availableContexts[0]?.id ?? ''
  );
  const [cls, setCls]         = useState(availableContexts[0]?.classes[0]?.id ?? '');
  const [error, setError]     = useState('');

  useEffect(() => {
    const c = availableContexts.find(c => c.id === contextId);
    if (c) {
      applyTheme(c.theme);
      setCls(c.classes[0]?.id ?? '');
      localStorage.setItem('last_context_id', contextId);
    }
  }, [contextId, availableContexts]);

  const selectedCtx = availableContexts.find(c => c.id === contextId);
  const classes = selectedCtx?.classes ?? [];

  async function handle() {
    if (!name.trim()) return setError('Enter your hero name');
    setError('');
    localStorage.setItem('operative_name', name.trim());
    try { await onStart(name.trim(), cls, contextId); }
    catch (e) { setError((e as { error?: string })?.error || 'Failed to start mission'); }
  }

  return (
    <div style={{ ...S.page, display: 'flex', alignItems: 'flex-start', justifyContent: 'center' }}>
      <div style={{ display: 'flex', gap: '2rem', alignItems: 'flex-start', width: '100%', maxWidth: 820, margin: '4rem auto' }}>

        <div style={{ flex: '0 0 340px' }}>
          <p style={{ ...S.title, fontSize: '1.1rem', marginBottom: 4 }}>HERO REGISTRY</p>
          <p style={{ ...S.sub, marginBottom: '2rem' }}>REGISTER YOUR HERO PROFILE</p>

          <label style={S.formLbl}>HERO NAME</label>
          <input style={S.formInp} value={name} onChange={e => setName(e.target.value)}
            placeholder="e.g. Buck Starling" autoFocus />

          <label style={S.formLbl}>CLASS</label>
          <select style={{ ...S.formInp, cursor: 'pointer' }} value={cls} onChange={e => setCls(e.target.value)}>
            {classes.map(c => <option key={c.id} value={c.id}>{c.id}</option>)}
          </select>

          <div style={{ marginTop: 12, fontSize: '0.72rem', color: 'var(--t-dim-dark)', lineHeight: 1.6 }}>
            {classes.find(c => c.id === cls)?.desc}
          </div>

          {error && <p style={S.err}>{error}</p>}

          <button style={S.submit} onClick={handle} disabled={loading}>
            {loading ? 'LAUNCHING MISSION...' : 'BEGIN MISSION'}
          </button>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ ...S.title, fontSize: '1.1rem', marginBottom: 4 }}>WORLD TYPE</p>
          <p style={{ ...S.sub, marginBottom: '2rem' }}>SELECT YOUR GAME WORLD</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {availableContexts.map(c => {
              const selected = c.id === contextId;
              return (
                <button
                  key={c.id}
                  onClick={() => setContextId(c.id)}
                  style={{
                    background:   selected ? 'var(--t-separator)' : 'var(--t-card)',
                    border:       `1px solid ${selected ? 'var(--t-primary)' : 'var(--t-border)'}`,
                    color:        'var(--t-primary)',
                    fontFamily:   'inherit',
                    padding:      '0.75rem 1rem',
                    cursor:       'pointer',
                    textAlign:    'left',
                    display:      'flex',
                    gap:          '1rem',
                    alignItems:   'flex-start',
                    transition:   'border-color 0.15s, background 0.15s',
                    boxShadow:    selected ? '0 0 8px var(--t-border)' : 'none',
                  }}
                >
                  <pre style={{
                    margin: 0, flexShrink: 0,
                    fontSize: '0.6rem', lineHeight: 1.35,
                    color: selected ? 'var(--t-primary)' : 'var(--t-dim)',
                    fontFamily: 'inherit', userSelect: 'none',
                    transition: 'color 0.15s',
                  }}>{c.previewArt}</pre>
                  <div>
                    <p style={{ fontSize: '0.85rem', letterSpacing: '0.12em', fontWeight: 'bold', marginBottom: 4, color: selected ? 'var(--t-primary)' : 'var(--t-mid)' }}>{c.displayName}</p>
                    <p style={{ fontSize: '0.7rem', color: 'var(--t-dim)', lineHeight: 1.5 }}>{c.tagline}</p>
                    {selected && <p style={{ marginTop: 6, fontSize: '0.65rem', color: 'var(--t-primary)', letterSpacing: '0.1em' }}>▶ SELECTED</p>}
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
