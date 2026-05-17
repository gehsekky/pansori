import { useState, useEffect, useRef, ReactNode } from 'react';
import { api, type AuthUser } from './lib/api.js';
import type { SessionSummary } from './types.js';
import { context as scifiContext }   from './contexts/scifi-terror.js';
import { context as dungeonContext } from './contexts/dungeon-crawler.js';
import { context as zombieContext }  from './contexts/high-school-zombie.js';
import { context as sunkenContext }  from './contexts/sunken-below.js';
import WorldMap from './components/WorldMap.js';
import type { FrontendContext, GameState, Seed, Session, StructuredAction, GameChoice } from './types.js';

const CONTEXTS: Record<string, FrontendContext> = {
  'scifi-terror':       scifiContext,
  'dungeon-crawler':    dungeonContext,
  'high-school-zombie': zombieContext,
  'sunken-below':       sunkenContext,
};
function getCtx(seed: Seed | null): FrontendContext {
  return (seed?.context_id ? CONTEXTS[seed.context_id] : null) ?? scifiContext;
}

// ─── Static styles (colors via CSS custom properties) ────────────────────────
const S: Record<string, React.CSSProperties> = {
  page:     { minHeight: '100vh', background: 'var(--t-bg)', color: 'var(--t-primary)', fontFamily: 'var(--t-font)', padding: '1.5rem' },
  header:   { borderBottom: '1px solid var(--t-primary)', paddingBottom: '0.75rem', marginBottom: '1rem' },
  title:    { fontSize: '1.4rem', letterSpacing: '0.2em', margin: 0, textShadow: '0 0 8px var(--t-primary)' },
  sub:      { fontSize: '0.8rem', color: 'var(--t-dim)', letterSpacing: '0.15em', marginTop: 4 },
  card:     { border: '1px solid var(--t-border)', background: 'var(--t-card)', padding: '1rem', borderRadius: 2, marginBottom: '1rem' },
  statsRow: { display: 'flex', gap: '1.5rem', fontSize: '0.8rem', flexWrap: 'wrap', color: 'var(--t-mid)' },
  stat:     { display: 'flex', flexDirection: 'column', gap: 2 },
  statLbl:  { color: 'var(--t-dim)', fontSize: '0.75rem', letterSpacing: '0.1em' },
  statVal:  { fontWeight: 'bold' },
  narrative:{ fontSize: '0.95rem', lineHeight: 1.75, minHeight: 90, color: 'var(--t-primary)', fontStyle: 'italic' },
  choices:  { display: 'flex', flexDirection: 'column', gap: 8, marginTop: '1rem' },
  choiceBtn:{ background: 'transparent', color: 'var(--t-primary)', border: '1px solid var(--t-border)',
              padding: '0.5rem 0.875rem', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
              fontSize: '0.875rem', letterSpacing: '0.03em', transition: 'border-color 0.15s, background 0.15s' },
  sendBtn:  { background: 'var(--t-dim-dark)', color: 'var(--t-primary)', border: '1px solid var(--t-border)',
              padding: '0.5rem 1rem', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.875rem', whiteSpace: 'nowrap' },
  scanTxt:  { color: 'var(--t-dim)', fontStyle: 'italic', animation: 'blink 1s step-end infinite' },
  logEntry: { fontSize: '0.8rem', color: 'var(--t-dim)', borderBottom: '1px solid var(--t-separator)', padding: '3px 0' },
  formLbl:  { display: 'block', fontSize: '0.8rem', letterSpacing: '0.15em', color: 'var(--t-dim)', marginBottom: 4, marginTop: 12 },
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

type View = 'login' | 'loading' | 'sessions' | 'char' | 'game';
type HistoryEntry = { role: 'user' | 'assistant'; content: string };

// ─── App shell ───────────────────────────────────────────────────────────────
export default function App() {
  const [view, setView]           = useState<View>('loading');
  const [user, setUser]           = useState<AuthUser | null>(null);
  const [sessions, setSessions]   = useState<SessionSummary[]>([]);
  const [session, setSession]     = useState<Session | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [seed, setSeed]           = useState<Seed | null>(null);
  const [choices, setChoices]     = useState<GameChoice[]>([]);
  const [history, setHistory]     = useState<HistoryEntry[]>([]);
  const [loading, setLoading]     = useState(false);
  const [escaped, setEscaped]     = useState(false);
  const [roomLog, setRoomLog]     = useState<string[]>([]);
  const [mapOpen, setMapOpen]     = useState(false);
  const logRef       = useRef<HTMLDivElement>(null);
  const narrativeRef = useRef<HTMLDivElement>(null);

  const ctx       = getCtx(seed);
  const worldName = seed?.world_name || seed?.ship_name || '???';

  useEffect(() => { applyTheme(ctx.theme); }, [ctx]);

  // Check auth first; if logged in, then try to restore a session from the URL
  useEffect(() => {
    api.getMe()
      .then(me => {
        setUser(me);
        const uuidInPath = window.location.pathname.match(/^\/([0-9a-f-]{36})$/i)?.[1];
        if (uuidInPath) {
          return api.getSessionById(uuidInPath)
            .then(s => {
              if (s) {
                setSession(s); setGameState(s.state); setSeed(s.seed);
                setRoomLog(s.state.room_log || []);
                setEscaped(s.status === 'escaped');
                setChoices((s.state.last_choices || []));
                setView('game');
              } else {
                window.history.replaceState(null, '', '/');
                return loadSessions();
              }
            })
            .catch(() => loadSessions());
        } else {
          return loadSessions();
        }
      })
      .catch(() => setView('login'));
  }, []);

  async function loadSessions() {
    const list = await api.listSessions();
    setSessions(list);
    setView('sessions');
  }

  async function handleDeleteSession(id: string) {
    await api.deleteSession(id);
    await loadSessions();
  }

  async function handleClearCompleted() {
    await api.clearCompleted();
    await loadSessions();
  }

  async function handleLogout() {
    await api.logout();
    setUser(null);
    setSession(null); setGameState(null); setSeed(null);
    window.history.replaceState(null, '', '/');
    setView('login');
  }

  async function handleResumeSession(id: string) {
    setLoading(true);
    try {
      const s = await api.getSessionById(id);
      setSession(s); setGameState(s.state); setSeed(s.seed);
      setRoomLog(s.state.room_log || []);
      setEscaped(s.status === 'escaped');
      setChoices((s.state.last_choices || []));
      window.history.pushState(null, '', `/${id}`);
      setView('game');
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  async function handleNewGame(
    charName: string,
    charClass: string,
    contextId: string,
    stats?: { str: number; dex: number; con: number; int: number; wis: number; cha: number },
    portraitUrl?: string,
  ) {
    setLoading(true);
    try {
      const result = await api.newSession(charName, charClass, contextId, stats, portraitUrl);
      setSession(result.session); setGameState(result.state); setSeed(result.seed);
      setHistory([]); setEscaped(false); setView('game');
      window.history.pushState(null, '', `/${result.session.id}`);
      setRoomLog(result.state.room_log || []);
      setChoices((result.state.last_choices || []));
    } catch (e) {
      console.error(e);
      throw e;
    } finally {
      setLoading(false);
    }
  }

  async function act(action: StructuredAction, label: string, currentHistory: HistoryEntry[]) {
    const sid = session?.id;
    if (!sid) return;
    setLoading(true);
    try {
      const result = await api.takeAction(sid, action, currentHistory);
      const newHistory: HistoryEntry[] = [
        ...currentHistory,
        { role: 'user',      content: label },
        { role: 'assistant', content: result.narrative },
      ];
      setHistory(newHistory);
      setChoices((result.choices || []));
      setGameState(result.newState);
      if (result.escaped) setEscaped(true);
      if (logRef.current) logRef.current.scrollTop = 0;
      setRoomLog(result.newState.room_log || []);
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

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (view !== 'game' || loading || escaped || gameState?.dead) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const idx = parseInt(e.key, 10);
      if (!isNaN(idx) && idx >= 1 && idx <= choices.length) {
        const c = choices[idx - 1];
        act(c.action, c.label, history);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [view, loading, escaped, gameState?.dead, choices]);

  function handleChoice(c: GameChoice) { act(c.action, c.label, history); }

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

      {view === 'login' && (
        <LoginScreen />
      )}

      {view === 'sessions' && (
        <SessionsScreen
          sessions={sessions}
          user={user}
          loading={loading}
          onResume={handleResumeSession}
          onNewGame={() => setView('char')}
          onLogout={handleLogout}
          onDelete={handleDeleteSession}
          onClearCompleted={handleClearCompleted}
          contexts={CONTEXTS}
        />
      )}

      {view === 'char' && <CharScreen onStart={handleNewGame} loading={loading} availableContexts={Object.values(CONTEXTS)} user={user} />}

      {view === 'game' && (
        <div style={S.page}>
          <header style={S.header}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                {session?.portrait_url && (
                  <img src={session.portrait_url} alt="" style={{ width: 36, height: 36, borderRadius: '50%', border: '1px solid var(--t-border)', objectFit: 'cover' }} />
                )}
                <div>
                  <p style={S.title}>{ctx.theme.title}</p>
                  <p style={S.sub}>{ctx.theme.worldLabel}: {worldName}  ·  HERO: {session?.character_name}  [{session?.character_class}]</p>
                </div>
              </div>
              {user && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.75rem', color: 'var(--t-dim)', letterSpacing: '0.1em' }}>
                  {user.avatar_url && (
                    <img src={user.avatar_url} alt="" style={{ width: 22, height: 22, borderRadius: '50%', opacity: 0.7 }} />
                  )}
                  <span>{user.display_name.toUpperCase()}</span>
                  <button
                    onClick={handleLogout}
                    style={{ background: 'transparent', border: 'none', color: 'var(--t-dim)', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.75rem', letterSpacing: '0.1em', padding: 0 }}
                  >SIGN OUT</button>
                </div>
              )}
            </div>
          </header>

          <StatsBar state={gameState} ctx={ctx} seed={seed} onEquip={handleEquip}
            inCombat={!!gameState?.combat_active} onOpenMap={() => setMapOpen(true)} />

          {mapOpen && seed && gameState && (
            <WorldMap seed={seed} state={gameState} onClose={() => setMapOpen(false)} />
          )}

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
                    onClick={() => { setEscaped(false); setHistory([]); window.history.replaceState(null, '', '/'); loadSessions(); }}>
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
                    onClick={() => { setHistory([]); window.history.replaceState(null, '', '/'); loadSessions(); }}>
                    START NEW MISSION
                  </button>
                </div>
              ) : (
                <>
                  <div style={S.choices}>
                    {!loading && choices.map((c, i) => (
                      <button key={i} style={S.choiceBtn} onClick={() => handleChoice(c)}>
                        [{i + 1}] {c.label}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {history.length > 0 && (
                <div style={{ ...S.card, marginTop: '1.5rem', maxHeight: 160, overflowY: 'auto' }} ref={logRef}>
                  <p style={{ fontSize: '0.75rem', letterSpacing: '0.1em', color: 'var(--t-dim)', marginBottom: 6 }}>MISSION LOG</p>
                  {[...history].reverse().filter((_, i) => i % 2 === 0).slice(0, 20).map((m, i) => (
                    <p key={i} style={S.logEntry}>› {m.content}</p>
                  ))}
                </div>
              )}

              <div style={{ marginTop: '1rem', fontSize: '0.75rem', color: 'var(--t-dim)', display: 'flex', gap: '1.5rem' }}>
                <button style={{ ...S.sendBtn, padding: '0.3rem 0.75rem', fontSize: '0.75rem' }}
                  onClick={() => { if (confirm('Abandon current run and start over?')) { setHistory([]); window.history.replaceState(null, '', '/'); loadSessions(); } }}>
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

// ─── Login screen ────────────────────────────────────────────────────────────
function LoginScreen() {
  const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';
  return (
    <div style={{ ...S.page, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <div style={{ textAlign: 'center', maxWidth: 360 }}>
        <p style={{ ...S.title, marginBottom: '0.5rem' }}>PANSORI</p>
        <p style={{ fontSize: '0.75rem', color: 'var(--t-dim)', letterSpacing: '0.15em', marginBottom: '2.5rem' }}>
          SIGN IN TO CONTINUE YOUR MISSION
        </p>
        <a
          href={`${BASE}/api/auth/google`}
          style={{
            display: 'inline-block',
            background: 'var(--t-dim-dark)', color: 'var(--t-primary)',
            border: '1px solid var(--t-primary)',
            padding: '0.65rem 1.75rem',
            fontFamily: 'inherit', fontSize: '0.8rem',
            letterSpacing: '0.12em', textDecoration: 'none',
          }}
        >
          SIGN IN WITH GOOGLE
        </a>
      </div>
    </div>
  );
}

// ─── Sessions screen ─────────────────────────────────────────────────────────
function SessionsScreen({ sessions, user, loading, onResume, onNewGame, onLogout, onDelete, onClearCompleted, contexts }: {
  sessions:          SessionSummary[];
  user:              AuthUser | null;
  loading:           boolean;
  onResume:          (id: string) => void;
  onNewGame:         () => void;
  onLogout:          () => void;
  onDelete:          (id: string) => void;
  onClearCompleted:  () => void;
  contexts:          Record<string, FrontendContext>;
}) {
  const statusColor = (s: string) =>
    s === 'escaped' ? 'var(--t-hp-high)' : s === 'dead' ? 'var(--t-hp-low)' : 'var(--t-mid)';
  const hasCompleted = sessions.some(s => s.status !== 'active');

  return (
    <div style={{ ...S.page, display: 'flex', alignItems: 'flex-start', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 620, margin: '4rem auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2rem' }}>
          <div>
            <p style={{ ...S.title, fontSize: '1.1rem', marginBottom: 4 }}>PANSORI</p>
            {user && <p style={S.sub}>{user.display_name.toUpperCase()}</p>}
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            {hasCompleted && (
              <button
                onClick={() => { if (confirm('Delete all completed and failed runs?')) onClearCompleted(); }}
                style={{ background: 'transparent', border: '1px solid var(--t-border)', color: 'var(--t-dim)', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.75rem', letterSpacing: '0.1em', padding: '0.5rem 1rem' }}
              >CLEAR OLD</button>
            )}
            <button style={{ ...S.submit, marginTop: 0, width: 'auto', padding: '0.5rem 1.25rem' }} onClick={onNewGame}>
              + NEW MISSION
            </button>
            <button
              onClick={onLogout}
              style={{ background: 'transparent', border: '1px solid var(--t-border)', color: 'var(--t-dim)', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.75rem', letterSpacing: '0.1em', padding: '0.5rem 1rem' }}
            >SIGN OUT</button>
          </div>
        </div>

        {sessions.length === 0 ? (
          <div style={{ ...S.card, textAlign: 'center', padding: '2.5rem', color: 'var(--t-dim)' }}>
            <p style={{ fontSize: '0.8rem', letterSpacing: '0.12em', marginBottom: '1.25rem' }}>NO MISSIONS ON RECORD</p>
            <button style={{ ...S.submit, marginTop: 0, width: 'auto', padding: '0.5rem 1.5rem' }} onClick={onNewGame}>
              BEGIN FIRST MISSION
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {sessions.map(s => {
              const ctx = contexts[s.context_id];
              const isActive = s.status === 'active';
              return (
                <div key={s.id} style={{ ...S.card, display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: 0, opacity: isActive ? 1 : 0.6 }}>
                  {s.portrait_url
                    ? <img src={s.portrait_url} alt="" style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--t-border)', flexShrink: 0 }} />
                    : <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--t-separator)', border: '1px solid var(--t-border)', flexShrink: 0 }} />
                  }
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontWeight: 'bold', fontSize: '0.85rem', letterSpacing: '0.06em', color: 'var(--t-primary)' }}>
                      {s.character_name}
                    </p>
                    <p style={{ fontSize: '0.8rem', color: 'var(--t-dim)', letterSpacing: '0.08em', marginTop: 2 }}>
                      {s.character_class.toUpperCase()} · {ctx?.displayName ?? s.context_id}
                    </p>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <p style={{ fontSize: '0.8rem', color: statusColor(s.status), letterSpacing: '0.1em', marginBottom: 4 }}>
                      {s.status.toUpperCase()}
                    </p>
                    <p style={{ fontSize: '0.75rem', color: 'var(--t-dim)' }}>
                      {new Date(s.updated_at).toLocaleDateString()}
                    </p>
                  </div>
                  {isActive && (
                    <button
                      style={{ ...S.sendBtn, flexShrink: 0 }}
                      onClick={() => onResume(s.id)}
                      disabled={loading}
                    >RESUME</button>
                  )}
                  <button
                    onClick={() => {
                      const msg = isActive
                        ? `Delete active run "${s.character_name}"? This cannot be undone.`
                        : `Delete "${s.character_name}"?`;
                      if (confirm(msg)) onDelete(s.id);
                    }}
                    style={{ background: 'transparent', border: '1px solid var(--t-border)', color: 'var(--t-dim)', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.75rem', letterSpacing: '0.08em', padding: '0.3rem 0.6rem', flexShrink: 0 }}
                  >✕</button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Stats bar ───────────────────────────────────────────────────────────────
function StatsBar({ state, ctx, seed, onEquip, inCombat, onOpenMap }: {
  state:      GameState | null;
  ctx:        FrontendContext;
  seed:       Seed | null;
  onEquip:    (id: string) => void;
  inCombat:   boolean;
  onOpenMap:  () => void;
}) {
  const [activeItemIdx, setActiveItemIdx] = useState<number | null>(null);

  useEffect(() => {
    if (activeItemIdx === null) return;
    function close() { setActiveItemIdx(null); }
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [activeItemIdx]);

  if (!state) return null;
  const hpPct         = Math.round((state.hp / state.max_hp) * 100);
  const hpColor       = hpPct > 50 ? 'var(--t-hp-high)' : hpPct > 25 ? 'var(--t-hp-mid)' : 'var(--t-hp-low)';
  const equippedWeapon = state.inventory?.find(i => i.instance_id === state.equipped_weapon) ?? null;
  const equippedArmor  = state.inventory?.find(i => i.instance_id === state.equipped_armor)  ?? null;

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
          <span style={S.statLbl}>&nbsp;</span>
          <button
            onClick={onOpenMap}
            style={{
              background: 'transparent', border: '1px solid var(--t-border)',
              color: 'var(--t-dim)', cursor: 'pointer', fontFamily: 'inherit',
              fontSize: '0.75rem', letterSpacing: '0.12em', padding: '2px 8px',
            }}
          >MAP</button>
        </div>
        <div style={S.stat}>
          <span style={S.statLbl}>WEAPON</span>
          <span style={{ ...S.statVal, display: 'flex', alignItems: 'center', gap: 3 }}>
            {equippedWeapon
              ? <>{ctx.itemIcons[equippedWeapon.id] ?? null}{equippedWeapon.name}</>
              : <span style={{ color: 'var(--t-dim)' }}>unarmed</span>}
          </span>
        </div>
        <div style={S.stat}>
          <span style={S.statLbl}>ARMOR</span>
          <span style={{ ...S.statVal, display: 'flex', alignItems: 'center', gap: 3 }}>
            {equippedArmor
              ? <>{ctx.itemIcons[equippedArmor.id] ?? null}{equippedArmor.name}</>
              : <span style={{ color: 'var(--t-dim)' }}>none</span>}
          </span>
        </div>
        <div style={S.stat}>
          <span style={S.statLbl}>INVENTORY</span>
          <span style={{ ...S.statVal, display: 'flex', flexWrap: 'wrap', gap: '0.6rem', alignItems: 'center' }}>
            {state.inventory?.length
              ? state.inventory.map((item, idx) => {
                  const equipped    = item.instance_id === state.equipped_weapon || item.instance_id === state.equipped_armor || item.instance_id === state.equipped_shield;
                  const equippable  = !!(item.damage || item.slot === 'armor' || item.slot === 'shield') && !inCombat;
                  const popoverOpen = activeItemIdx === idx;
                  return (
                    <Tooltip key={item.instance_id} text={equippable ? null : (item.desc ?? ctx.itemDescs[item.id])}>
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
                            <span style={{ fontSize: '0.75rem', color: 'var(--t-dim)', letterSpacing: '0.1em', marginBottom: 2 }}>
                              {item.desc ?? ctx.itemDescs[item.id]}
                            </span>
                            <button
                              style={{ ...S.choiceBtn, padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
                              onClick={() => { onEquip(item.instance_id); setActiveItemIdx(null); }}
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
          fontSize: '0.75rem', lineHeight: 1.5, letterSpacing: '0.03em',
          padding: '0.3rem 0.5rem', whiteSpace: 'nowrap', zIndex: 10, pointerEvents: 'none',
        }}>
          {text}
        </span>
      )}
    </span>
  );
}

// ─── Character select ────────────────────────────────────────────────────────
type StatBlock = { str: number; dex: number; con: number; int: number; wis: number; cha: number };
const STAT_KEYS: (keyof StatBlock)[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
const STAT_LABEL: Record<keyof StatBlock, string> = { str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA' };
const mod = (s: number) => Math.floor((s - 10) / 2);
const fmtMod = (s: number) => { const m = mod(s); return m >= 0 ? `+${m}` : `${m}`; };

function roll4d6DropLowest(): number {
  const rolls = Array.from({ length: 4 }, () => Math.floor(Math.random() * 6) + 1);
  rolls.sort((a, b) => a - b);
  return rolls.slice(1).reduce((a, b) => a + b, 0);
}

function rollStatBlock(): StatBlock {
  return { str: roll4d6DropLowest(), dex: roll4d6DropLowest(), con: roll4d6DropLowest(),
           int: roll4d6DropLowest(), wis: roll4d6DropLowest(), cha: roll4d6DropLowest() };
}

function CharScreen({ onStart, loading, availableContexts, user }: {
  onStart:           (name: string, cls: string, contextId: string, stats?: StatBlock, portraitUrl?: string) => Promise<void>;
  loading:           boolean;
  availableContexts: FrontendContext[];
  user:              AuthUser | null;
}) {
  const [name, setName]       = useState(() => localStorage.getItem('operative_name') || '');
  const [contextId, setContextId] = useState(
    () => localStorage.getItem('last_context_id') ?? availableContexts[0]?.id ?? ''
  );
  const [cls, setCls]         = useState(availableContexts[0]?.classes[0]?.id ?? '');
  const [error, setError]     = useState('');
  const [rolledStats, setRolledStats] = useState<StatBlock>(() => rollStatBlock());
  const [rollCount, setRollCount]     = useState(1);
  const [portrait, setPortrait]       = useState<string | null>(user?.avatar_url ?? null);

  useEffect(() => {
    const c = availableContexts.find(c => c.id === contextId);
    if (c) {
      applyTheme(c.theme);
      setCls(c.classes[0]?.id ?? '');
      localStorage.setItem('last_context_id', contextId);
      setRolledStats(rollStatBlock());
      setRollCount(1);
    }
  }, [contextId, availableContexts]);

  const selectedCtx   = availableContexts.find(c => c.id === contextId);
  const classes        = selectedCtx?.classes ?? [];
  const primaryStat    = selectedCtx?.classPrimaryStats[cls]?.toLowerCase() as keyof StatBlock | undefined;
  const skills         = selectedCtx?.classSkills[cls] ?? [];

  function handleRoll() {
    setRolledStats(rollStatBlock());
    setRollCount(c => c + 1);
  }

  async function handle() {
    if (!name.trim()) return setError('Enter your hero name');
    setError('');
    localStorage.setItem('operative_name', name.trim());
    try { await onStart(name.trim(), cls, contextId, rolledStats, portrait ?? undefined); }
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

          {/* Class ability preview */}
          <div style={{ marginTop: 8, fontSize: '0.75rem', color: 'var(--t-dim)', lineHeight: 1.7 }}>
            <span style={{ color: 'var(--t-mid)' }}>
              {classes.find(c => c.id === cls)?.desc}
            </span>
            {primaryStat && (
              <div style={{ marginTop: 4 }}>
                <span style={{ color: 'var(--t-dim)', letterSpacing: '0.08em' }}>PRIMARY STAT: </span>
                <span style={{ color: 'var(--t-primary)' }}>{primaryStat.toUpperCase()}</span>
                {skills.length > 0 && (
                  <>
                    <span style={{ color: 'var(--t-dim)', letterSpacing: '0.08em' }}> · PROFICIENT: </span>
                    <span style={{ color: 'var(--t-mid)' }}>{skills.join(', ')}</span>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Portrait picker */}
          <label style={{ ...S.formLbl, marginTop: 16 }}>PORTRAIT</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {([
              ...(user?.avatar_url ? [user.avatar_url] : []),
              `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" fill="#1a1a2e"/><circle cx="20" cy="14" r="7" fill="#4a9eff"/><ellipse cx="20" cy="34" rx="10" ry="7" fill="#4a9eff"/></svg>')}`,
              `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" fill="#1a1a2e"/><circle cx="20" cy="14" r="7" fill="#ff6b6b"/><ellipse cx="20" cy="34" rx="10" ry="7" fill="#ff6b6b"/></svg>')}`,
              `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" fill="#1a1a2e"/><circle cx="20" cy="14" r="7" fill="#ffd93d"/><ellipse cx="20" cy="34" rx="10" ry="7" fill="#ffd93d"/></svg>')}`,
              `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" fill="#1a1a2e"/><circle cx="20" cy="14" r="7" fill="#6bcb77"/><ellipse cx="20" cy="34" rx="10" ry="7" fill="#6bcb77"/></svg>')}`,
            ] as string[]).map((src, i) => {
              const sel = portrait === src;
              return (
                <button
                  key={i}
                  onClick={() => setPortrait(src)}
                  style={{
                    padding: 0, border: `2px solid ${sel ? 'var(--t-primary)' : 'var(--t-border)'}`,
                    background: 'none', cursor: 'pointer', borderRadius: '50%',
                    boxShadow: sel ? '0 0 6px var(--t-primary)' : 'none',
                  }}
                >
                  <img src={src} alt="" style={{ width: 36, height: 36, borderRadius: '50%', display: 'block', objectFit: 'cover' }} />
                </button>
              );
            })}
            <button
              onClick={() => setPortrait(null)}
              style={{
                width: 40, height: 40, borderRadius: '50%', border: `2px solid ${portrait === null ? 'var(--t-primary)' : 'var(--t-border)'}`,
                background: 'var(--t-separator)', cursor: 'pointer', color: 'var(--t-dim)',
                fontSize: '0.75rem', letterSpacing: '0.05em', fontFamily: 'inherit',
              }}
            >NONE</button>
          </div>

          {/* Ability score roller */}
          <label style={{ ...S.formLbl, marginTop: 16 }}>ABILITY SCORES</label>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            {STAT_KEYS.map(key => {
              const val       = rolledStats[key];
              const isPrimary = key === primaryStat;
              return (
                <div key={key} style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  padding: '4px 8px',
                  border: `1px solid ${isPrimary ? 'var(--t-primary)' : 'var(--t-border)'}`,
                  background: isPrimary ? 'var(--t-separator)' : 'transparent',
                  minWidth: 42,
                }}>
                  <span style={{ fontSize: '0.75rem', color: isPrimary ? 'var(--t-primary)' : 'var(--t-dim)', letterSpacing: '0.1em' }}>
                    {STAT_LABEL[key]}
                  </span>
                  <span style={{ fontSize: '0.95rem', fontWeight: 'bold', color: isPrimary ? 'var(--t-primary)' : 'var(--t-mid)' }}>
                    {val}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--t-dim)' }}>
                    {fmtMod(val)}
                  </span>
                </div>
              );
            })}
            {rollCount < 2 && (
              <button
                style={{ ...S.sendBtn, fontSize: '0.75rem', padding: '0.3rem 0.6rem', alignSelf: 'center' }}
                onClick={handleRoll}
              >
                REROLL
              </button>
            )}
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
                    <p style={{ fontSize: '0.75rem', color: 'var(--t-dim)', lineHeight: 1.5 }}>{c.tagline}</p>
                    {selected && <p style={{ marginTop: 6, fontSize: '0.75rem', color: 'var(--t-primary)', letterSpacing: '0.1em' }}>▶ SELECTED</p>}
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
