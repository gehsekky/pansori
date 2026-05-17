import { useState, useEffect, useRef, ReactNode } from 'react';
import { api, type AuthUser } from './lib/api.js';
import type { SessionSummary } from './types.js';
import { context as scifiContext }   from './contexts/scifi-terror.js';
import { context as dungeonContext } from './contexts/dungeon-crawler.js';
import { context as zombieContext }  from './contexts/high-school-zombie.js';
import { context as sunkenContext }  from './contexts/sunken-below.js';
import WorldMap from './components/WorldMap.js';
import type { FrontendContext, GameState, Character, Seed, Session, StructuredAction, GameChoice } from './types.js';
import type { CharacterInput } from './lib/api.js';

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

  async function handleNewGame(characters: CharacterInput[], contextId: string) {
    setLoading(true);
    try {
      const result = await api.newSession(characters, contextId);
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

  async function handleEquip(itemId: string, characterId: string) {
    if (!session) return;
    try {
      const result = await api.equipItem(session.id, itemId, characterId);
      setGameState(result.newState);
    } catch (e) {
      const err = e as { error?: string };
      if (err?.error) setRoomLog(prev => [...prev, `⚠ ${err.error}`]);
    }
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const allDead = !!gameState && gameState.characters.every(c => c.dead);
      if (view !== 'game' || loading || escaped || allDead) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const idx = parseInt(e.key, 10);
      if (!isNaN(idx) && idx >= 1 && idx <= choices.length) {
        const c = choices[idx - 1];
        act(c.action, c.label, history);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [view, loading, escaped, gameState, choices]);

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

      {view === 'char' && <CharScreen onStart={(chars, ctxId) => handleNewGame(chars, ctxId)} loading={loading} availableContexts={Object.values(CONTEXTS)} user={user} />}

      {view === 'game' && (() => {
        const activeChar = gameState?.characters.find(c => c.id === gameState.active_character_id) ?? gameState?.characters[0] ?? null;
        const allDead    = !!gameState && gameState.characters.every(c => c.dead);
        return (
        <div style={S.page}>
          <header style={S.header}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                {activeChar?.portrait_url && (
                  <img src={activeChar.portrait_url} alt="" style={{ width: 36, height: 36, borderRadius: '50%', border: '1px solid var(--t-border)', objectFit: 'cover' }} />
                )}
                <div>
                  <p style={S.title}>{ctx.theme.title}</p>
                  <p style={S.sub}>{ctx.theme.worldLabel}: {worldName}  ·  ACTIVE: {activeChar?.name}  [{activeChar?.character_class}]</p>
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

          <PartyPanel state={gameState} activeCharId={gameState?.active_character_id ?? ''} ctx={ctx} seed={seed} onEquip={handleEquip}
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
              ) : !loading && allDead ? (
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
        );
      })()}
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

// ─── Party panel ─────────────────────────────────────────────────────────────

function CharStatsCard({ char, state, ctx, seed, onEquip, inCombat, onOpenMap }: {
  char:      Character;
  state:     GameState;
  ctx:       FrontendContext;
  seed:      Seed | null;
  onEquip:   (instanceId: string) => void;
  inCombat:  boolean;
  onOpenMap: () => void;
}) {
  const [activeItemIdx, setActiveItemIdx] = useState<number | null>(null);

  useEffect(() => {
    if (activeItemIdx === null) return;
    function close() { setActiveItemIdx(null); }
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [activeItemIdx]);

  const hpPct         = Math.round((char.hp / char.max_hp) * 100);
  const hpColor       = hpPct > 50 ? 'var(--t-hp-high)' : hpPct > 25 ? 'var(--t-hp-mid)' : 'var(--t-hp-low)';
  const equippedWeapon = char.inventory?.find(i => i.instance_id === char.equipped_weapon) ?? null;
  const equippedArmor  = char.inventory?.find(i => i.instance_id === char.equipped_armor)  ?? null;

  return (
    <div style={S.statsRow}>
      <div style={S.stat}><span style={S.statLbl}>HP</span><span style={{ ...S.statVal, color: hpColor }}>{char.hp}/{char.max_hp}</span></div>
      <div style={S.stat}><span style={S.statLbl}>AC</span><span style={S.statVal}>{char.ac}</span></div>
      <div style={S.stat}><span style={S.statLbl}>LVL</span><span style={S.statVal}>{char.level}</span></div>
      <div style={S.stat}><span style={S.statLbl}>XP</span><span style={S.statVal}>{char.xp}</span></div>
      <div style={S.stat}><span style={S.statLbl}>GOLD</span><span style={S.statVal}>{char.gold}cr</span></div>
      <div style={S.stat}>
        <span style={S.statLbl}>ROOM</span>
        <span style={S.statVal}>{seed?.rooms?.find(r => r.id === state.current_room)?.name ?? state.current_room}</span>
      </div>
      <div style={S.stat}><span style={S.statLbl}>VISITED</span><span style={S.statVal}>{state.visited_rooms?.length ?? 0}</span></div>
      <div style={S.stat}>
        <span style={S.statLbl}>&nbsp;</span>
        <button onClick={onOpenMap} style={{ background: 'transparent', border: '1px solid var(--t-border)', color: 'var(--t-dim)', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.75rem', letterSpacing: '0.12em', padding: '2px 8px' }}>MAP</button>
      </div>
      <div style={S.stat}>
        <span style={S.statLbl}>WEAPON</span>
        <span style={{ ...S.statVal, display: 'flex', alignItems: 'center', gap: 3 }}>
          {equippedWeapon ? <>{ctx.itemIcons[equippedWeapon.id] ?? null}{equippedWeapon.name}</> : <span style={{ color: 'var(--t-dim)' }}>unarmed</span>}
        </span>
      </div>
      <div style={S.stat}>
        <span style={S.statLbl}>ARMOR</span>
        <span style={{ ...S.statVal, display: 'flex', alignItems: 'center', gap: 3 }}>
          {equippedArmor ? <>{ctx.itemIcons[equippedArmor.id] ?? null}{equippedArmor.name}</> : <span style={{ color: 'var(--t-dim)' }}>none</span>}
        </span>
      </div>
      <div style={S.stat}>
        <span style={S.statLbl}>INVENTORY</span>
        <span style={{ ...S.statVal, display: 'flex', flexWrap: 'wrap', gap: '0.6rem', alignItems: 'center' }}>
          {char.inventory?.length
            ? char.inventory.map((item, idx) => {
                const equipped   = item.instance_id === char.equipped_weapon || item.instance_id === char.equipped_armor || item.instance_id === char.equipped_shield;
                const equippable = !!(item.damage || item.slot === 'armor' || item.slot === 'shield') && !inCombat;
                const popoverOpen = activeItemIdx === idx;
                return (
                  <Tooltip key={item.instance_id} text={equippable ? null : (item.desc ?? ctx.itemDescs[item.id])}>
                    <span
                      onMouseDown={e => { if (!equippable) return; e.stopPropagation(); setActiveItemIdx(popoverOpen ? null : idx); }}
                      style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 3, cursor: equippable ? 'pointer' : 'default', color: equipped ? 'var(--t-primary)' : 'var(--t-item)', textShadow: equipped ? '0 0 6px var(--t-primary)' : 'none', borderBottom: equippable ? '1px dotted var(--t-dim)' : 'none' }}
                    >
                      {ctx.itemIcons[item.id] ?? null}{item.name}
                      {popoverOpen && (
                        <span onMouseDown={e => e.stopPropagation()} style={{ position: 'absolute', bottom: 'calc(100% + 6px)', left: 0, background: 'var(--t-card)', border: '1px solid var(--t-border)', padding: '0.3rem 0.5rem', zIndex: 20, whiteSpace: 'nowrap', display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <span style={{ fontSize: '0.75rem', color: 'var(--t-dim)', letterSpacing: '0.1em', marginBottom: 2 }}>{item.desc ?? ctx.itemDescs[item.id]}</span>
                          <button style={{ ...S.choiceBtn, padding: '0.2rem 0.5rem', fontSize: '0.75rem' }} onClick={() => { onEquip(item.instance_id); setActiveItemIdx(null); }}>
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
  );
}

// ─── Initiative order strip ───────────────────────────────────────────────────

function InitiativeStrip({ state, seed }: { state: GameState; seed: Seed | null }) {
  const order = state.initiative_order;
  if (!order?.length) return null;

  const currentIdx = state.initiative_idx ?? 0;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
      <span style={{ fontSize: '0.7rem', color: 'var(--t-dim)', letterSpacing: '0.12em', marginRight: 4 }}>INITIATIVE:</span>
      {order.map((entry, idx) => {
        const isCurrent = idx === currentIdx;
        const isPast    = idx < currentIdx;
        const name = entry.is_enemy
          ? (seed?.enemies?.[state.current_room] as { name?: string } | undefined)?.name ?? 'Enemy'
          : (state.characters.find(c => c.id === entry.id)?.name ?? 'Hero');
        return (
          <span
            key={`${entry.id}-${idx}`}
            style={{
              fontSize: '0.7rem',
              letterSpacing: '0.05em',
              padding: '2px 6px',
              border: `1px solid ${isCurrent ? 'var(--t-primary)' : 'var(--t-border)'}`,
              color: isCurrent ? 'var(--t-primary)' : isPast ? 'var(--t-dim)' : 'var(--t-mid)',
              background: isCurrent ? 'var(--t-separator)' : 'transparent',
              opacity: isPast ? 0.5 : 1,
              textDecoration: isPast ? 'line-through' : 'none',
              textShadow: isCurrent ? '0 0 4px var(--t-primary)' : 'none',
            }}
          >
            {isCurrent ? '▶ ' : ''}{name} ({entry.roll})
          </span>
        );
      })}
    </div>
  );
}

function PartyPanel({ state, activeCharId, ctx, seed, onEquip, inCombat, onOpenMap }: {
  state:       GameState | null;
  activeCharId: string;
  ctx:         FrontendContext;
  seed:        Seed | null;
  onEquip:     (instanceId: string, characterId: string) => void;
  inCombat:    boolean;
  onOpenMap:   () => void;
}) {
  const [selectedCharId, setSelectedCharId] = useState<string>('');

  // Keep selectedCharId in sync when state changes
  useEffect(() => {
    if (!state) return;
    const exists = state.characters.some(c => c.id === selectedCharId);
    if (!exists) setSelectedCharId(state.characters[0]?.id ?? '');
  }, [state]);

  if (!state) return null;

  const selectedChar = state.characters.find(c => c.id === selectedCharId) ?? state.characters[0];
  if (!selectedChar) return null;

  const initiativeOrder  = state.initiative_order ?? [];
  const initiativeIdx    = state.initiative_idx ?? 0;

  // In combat: characters before current initiative index have already acted this round
  function hasActedThisRound(charId: string): boolean {
    if (!inCombat || !initiativeOrder.length) return false;
    const charInitIdx = initiativeOrder.findIndex(e => e.id === charId);
    return charInitIdx >= 0 && charInitIdx < initiativeIdx;
  }

  return (
    <div style={{ ...S.card, marginBottom: '0.75rem' }}>
      {/* Initiative order strip (only shown during combat) */}
      {inCombat && <InitiativeStrip state={state} seed={seed} />}

      {/* Character tabs */}
      {state.characters.length > 1 && (
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
          {state.characters.map(c => {
            const isActive   = c.id === activeCharId;
            const isSelected = c.id === selectedCharId;
            const hasActed   = hasActedThisRound(c.id);
            const hpPct      = c.max_hp > 0 ? c.hp / c.max_hp : 0;
            const hpColor    = c.dead ? 'var(--t-hp-low)' : hpPct > 0.5 ? 'var(--t-hp-high)' : hpPct > 0.25 ? 'var(--t-hp-mid)' : 'var(--t-hp-low)';
            return (
              <button
                key={c.id}
                onClick={() => setSelectedCharId(c.id)}
                style={{
                  background: isSelected ? 'var(--t-separator)' : 'transparent',
                  border: `1px solid ${isActive ? 'var(--t-primary)' : 'var(--t-border)'}`,
                  color: isActive ? 'var(--t-primary)' : 'var(--t-mid)',
                  fontFamily: 'inherit', fontSize: '0.75rem', letterSpacing: '0.08em',
                  padding: '0.3rem 0.75rem', cursor: 'pointer', textAlign: 'left',
                  boxShadow: isActive ? '0 0 4px var(--t-border)' : 'none',
                  opacity: hasActed ? 0.55 : 1,
                }}
              >
                {c.portrait_url && <img src={c.portrait_url} alt="" style={{ width: 16, height: 16, borderRadius: '50%', objectFit: 'cover', verticalAlign: 'middle', marginRight: 4 }} />}
                {hasActed && <span style={{ color: 'var(--t-dim)', marginRight: 3 }}>✓</span>}
                {c.name} [{c.character_class}]
                {' · '}<span style={{ color: hpColor }}>{c.dead ? 'DEAD' : c.stable ? 'zzz' : `HP ${c.hp}/${c.max_hp}`}</span>
                {c.conditions?.length > 0 && (
                  <span style={{ marginLeft: 4 }}>
                    {c.conditions.map(cond => (
                      <span key={cond} style={{ fontSize: '0.65rem', padding: '1px 4px', marginLeft: 2, border: '1px solid var(--t-hp-mid)', color: 'var(--t-hp-mid)', letterSpacing: '0.05em' }}>
                        {cond.toUpperCase()}
                      </span>
                    ))}
                  </span>
                )}
                {isActive && <span style={{ color: 'var(--t-primary)', marginLeft: 4 }}>◀ ACTIVE</span>}
              </button>
            );
          })}
        </div>
      )}

      {/* Single-character: show conditions inline in stats area */}
      {state.characters.length === 1 && selectedChar.conditions?.length > 0 && (
        <div style={{ display: 'flex', gap: 4, marginBottom: '0.5rem', flexWrap: 'wrap' }}>
          {selectedChar.conditions.map(cond => (
            <span key={cond} style={{ fontSize: '0.7rem', padding: '2px 6px', border: '1px solid var(--t-hp-mid)', color: 'var(--t-hp-mid)', letterSpacing: '0.08em' }}>
              {cond.toUpperCase()}
            </span>
          ))}
        </div>
      )}

      <CharStatsCard
        char={selectedChar}
        state={state}
        ctx={ctx}
        seed={seed}
        onEquip={(iid) => onEquip(iid, selectedChar.id)}
        inCombat={inCombat}
        onOpenMap={onOpenMap}
      />
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

interface CharDraft {
  name:       string;
  cls:        string;
  stats:      StatBlock;
  portrait:   string | null;
  rollCount:  number;
}

function CharScreen({ onStart, loading, availableContexts, user }: {
  onStart:           (characters: CharacterInput[], contextId: string) => Promise<void>;
  loading:           boolean;
  availableContexts: FrontendContext[];
  user:              AuthUser | null;
}) {
  const [contextId, setContextId] = useState(
    () => localStorage.getItem('last_context_id') ?? availableContexts[0]?.id ?? ''
  );
  const selectedCtxForInit = availableContexts.find(c => c.id === contextId) ?? availableContexts[0];
  const [party, setParty]  = useState<CharDraft[]>([{
    name:      localStorage.getItem('operative_name') || '',
    cls:       selectedCtxForInit?.classes[0]?.id ?? '',
    stats:     rollStatBlock(),
    portrait:  user?.avatar_url ?? null,
    rollCount: 1,
  }]);
  const [error, setError] = useState('');

  useEffect(() => {
    const c = availableContexts.find(c => c.id === contextId);
    if (c) {
      applyTheme(c.theme);
      localStorage.setItem('last_context_id', contextId);
      setParty(prev => prev.map(d => ({ ...d, cls: c.classes[0]?.id ?? d.cls, stats: rollStatBlock(), rollCount: 1 })));
    }
  }, [contextId, availableContexts]);

  const selectedCtx = availableContexts.find(c => c.id === contextId);
  const classes     = selectedCtx?.classes ?? [];

  function updateDraft(idx: number, patch: Partial<CharDraft>) {
    setParty(prev => prev.map((d, i) => i === idx ? { ...d, ...patch } : d));
  }

  function addMember() {
    if (party.length >= 4) return;
    setParty(prev => [...prev, {
      name: '', cls: classes[0]?.id ?? '', stats: rollStatBlock(), portrait: null, rollCount: 1,
    }]);
  }

  function removeMember(idx: number) {
    setParty(prev => prev.filter((_, i) => i !== idx));
  }

  async function handle() {
    const leader = party[0];
    if (!leader.name.trim()) return setError('Enter a name for your first hero');
    if (party.some(d => !d.name.trim())) return setError('All party members must have a name');
    setError('');
    localStorage.setItem('operative_name', leader.name.trim());
    try {
      await onStart(
        party.map(d => ({ name: d.name.trim(), character_class: d.cls, stats: d.stats, portrait_url: d.portrait ?? undefined })),
        contextId,
      );
    } catch (e) { setError((e as { error?: string })?.error || 'Failed to start mission'); }
  }

  return (
    <div style={{ ...S.page, display: 'flex', alignItems: 'flex-start', justifyContent: 'center' }}>
      <div style={{ display: 'flex', gap: '2rem', alignItems: 'flex-start', width: '100%', maxWidth: 900, margin: '4rem auto' }}>

        <div style={{ flex: '0 0 360px' }}>
          <p style={{ ...S.title, fontSize: '1.1rem', marginBottom: 4 }}>HERO REGISTRY</p>
          <p style={{ ...S.sub, marginBottom: '2rem' }}>REGISTER YOUR PARTY — UP TO 4 HEROES</p>

          {party.map((draft, idx) => {
            const primaryStat = selectedCtx?.classPrimaryStats[draft.cls]?.toLowerCase() as keyof StatBlock | undefined;
            const skills      = selectedCtx?.classSkills[draft.cls] ?? [];
            const portraits   = [
              ...(idx === 0 && user?.avatar_url ? [user.avatar_url] : []),
              `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" fill="#1a1a2e"/><circle cx="20" cy="14" r="7" fill="#4a9eff"/><ellipse cx="20" cy="34" rx="10" ry="7" fill="#4a9eff"/></svg>')}`,
              `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" fill="#1a1a2e"/><circle cx="20" cy="14" r="7" fill="#ff6b6b"/><ellipse cx="20" cy="34" rx="10" ry="7" fill="#ff6b6b"/></svg>')}`,
              `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" fill="#1a1a2e"/><circle cx="20" cy="14" r="7" fill="#ffd93d"/><ellipse cx="20" cy="34" rx="10" ry="7" fill="#ffd93d"/></svg>')}`,
              `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" fill="#1a1a2e"/><circle cx="20" cy="14" r="7" fill="#6bcb77"/><ellipse cx="20" cy="34" rx="10" ry="7" fill="#6bcb77"/></svg>')}`,
            ] as string[];

            return (
              <div key={idx} style={{ ...S.card, marginBottom: '1rem', position: 'relative' }}>
                {party.length > 1 && (
                  <button
                    onClick={() => removeMember(idx)}
                    style={{ position: 'absolute', top: 8, right: 8, background: 'transparent', border: 'none', color: 'var(--t-dim)', cursor: 'pointer', fontSize: '0.85rem', padding: 2 }}
                    title="Remove this hero"
                  >✕</button>
                )}
                <p style={{ fontSize: '0.75rem', color: 'var(--t-dim)', letterSpacing: '0.12em', marginBottom: 8 }}>
                  {idx === 0 ? 'PARTY LEADER' : `HERO ${idx + 1}`}
                </p>

                <label style={S.formLbl}>HERO NAME</label>
                <input style={S.formInp} value={draft.name} onChange={e => updateDraft(idx, { name: e.target.value })}
                  placeholder="e.g. Buck Starling" autoFocus={idx === 0} />

                <label style={S.formLbl}>CLASS</label>
                <select style={{ ...S.formInp, cursor: 'pointer' }} value={draft.cls} onChange={e => updateDraft(idx, { cls: e.target.value })}>
                  {classes.map(c => <option key={c.id} value={c.id}>{c.id}</option>)}
                </select>

                <div style={{ marginTop: 8, fontSize: '0.75rem', color: 'var(--t-dim)', lineHeight: 1.7 }}>
                  <span style={{ color: 'var(--t-mid)' }}>{classes.find(c => c.id === draft.cls)?.desc}</span>
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

                <label style={{ ...S.formLbl, marginTop: 12 }}>PORTRAIT</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  {portraits.map((src, i) => {
                    const sel = draft.portrait === src;
                    return (
                      <button key={i} onClick={() => updateDraft(idx, { portrait: src })}
                        style={{ padding: 0, border: `2px solid ${sel ? 'var(--t-primary)' : 'var(--t-border)'}`, background: 'none', cursor: 'pointer', borderRadius: '50%', boxShadow: sel ? '0 0 6px var(--t-primary)' : 'none' }}
                      >
                        <img src={src} alt="" style={{ width: 36, height: 36, borderRadius: '50%', display: 'block', objectFit: 'cover' }} />
                      </button>
                    );
                  })}
                  <button onClick={() => updateDraft(idx, { portrait: null })}
                    style={{ width: 40, height: 40, borderRadius: '50%', border: `2px solid ${draft.portrait === null ? 'var(--t-primary)' : 'var(--t-border)'}`, background: 'var(--t-separator)', cursor: 'pointer', color: 'var(--t-dim)', fontSize: '0.75rem', letterSpacing: '0.05em', fontFamily: 'inherit' }}
                  >NONE</button>
                </div>

                <label style={{ ...S.formLbl, marginTop: 12 }}>ABILITY SCORES</label>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  {STAT_KEYS.map(key => {
                    const val = draft.stats[key];
                    const isPrimary = key === primaryStat;
                    return (
                      <div key={key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '4px 8px', border: `1px solid ${isPrimary ? 'var(--t-primary)' : 'var(--t-border)'}`, background: isPrimary ? 'var(--t-separator)' : 'transparent', minWidth: 42 }}>
                        <span style={{ fontSize: '0.75rem', color: isPrimary ? 'var(--t-primary)' : 'var(--t-dim)', letterSpacing: '0.1em' }}>{STAT_LABEL[key]}</span>
                        <span style={{ fontSize: '0.95rem', fontWeight: 'bold', color: isPrimary ? 'var(--t-primary)' : 'var(--t-mid)' }}>{val}</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--t-dim)' }}>{fmtMod(val)}</span>
                      </div>
                    );
                  })}
                  {draft.rollCount < 2 && (
                    <button style={{ ...S.sendBtn, fontSize: '0.75rem', padding: '0.3rem 0.6rem', alignSelf: 'center' }}
                      onClick={() => updateDraft(idx, { stats: rollStatBlock(), rollCount: draft.rollCount + 1 })}
                    >REROLL</button>
                  )}
                </div>
              </div>
            );
          })}

          {party.length < 4 && (
            <button style={{ ...S.submit, marginTop: 0, marginBottom: '1rem', background: 'transparent', border: '1px dashed var(--t-border)', color: 'var(--t-dim)' }}
              onClick={addMember}>
              + ADD PARTY MEMBER
            </button>
          )}

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
