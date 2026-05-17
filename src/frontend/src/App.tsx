import { useState, useEffect, useRef } from 'react';
import { api, type AuthUser, type CharacterInput } from './lib/api.ts';
import { context as scifiContext } from './contexts/scifi-terror.tsx';
import { context as dungeonContext } from './contexts/dungeon-crawler.tsx';
import { context as zombieContext } from './contexts/high-school-zombie.tsx';
import { context as sunkenContext } from './contexts/sunken-below.tsx';
import LoginScreen from './components/LoginScreen.tsx';
import SessionsScreen from './components/SessionScreen.tsx';
import WorldMap from './components/WorldMap.tsx';
import PartyPanel from './components/PartyPanel.tsx';
import RoomArtPanel from './components/RoomArtPanel.tsx';
import CharScreen from './components/CharScreen.tsx';
import type {
  FrontendContext,
  GameState,
  Seed,
  Session,
  StructuredAction,
  GameChoice,
  SessionSummary,
} from './types.ts';

const CONTEXTS: Record<string, FrontendContext> = {
  'scifi-terror': scifiContext,
  'dungeon-crawler': dungeonContext,
  'high-school-zombie': zombieContext,
  'sunken-below': sunkenContext,
};
function getCtx(seed: Seed | null): FrontendContext {
  return (seed?.context_id ? CONTEXTS[seed.context_id] : null) ?? scifiContext;
}

// ─── Static styles (colors via CSS custom properties) ────────────────────────
export const S: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: 'var(--t-bg)',
    color: 'var(--t-primary)',
    fontFamily: 'var(--t-font)',
    padding: '1.5rem',
  },
  header: {
    borderBottom: '1px solid var(--t-primary)',
    paddingBottom: '0.75rem',
    marginBottom: '1rem',
  },
  title: {
    fontSize: '1.4rem',
    letterSpacing: '0.2em',
    margin: 0,
    textShadow: '0 0 8px var(--t-primary)',
  },
  sub: { fontSize: '0.8rem', color: 'var(--t-dim)', letterSpacing: '0.15em', marginTop: 4 },
  card: {
    border: '1px solid var(--t-border)',
    background: 'var(--t-card)',
    padding: '1rem',
    borderRadius: 2,
    marginBottom: '1rem',
  },
  statsRow: {
    display: 'flex',
    gap: '1.5rem',
    fontSize: '0.8rem',
    flexWrap: 'wrap',
    color: 'var(--t-mid)',
  },
  stat: { display: 'flex', flexDirection: 'column', gap: 2 },
  statLbl: { color: 'var(--t-dim)', fontSize: '0.75rem', letterSpacing: '0.1em' },
  statVal: { fontWeight: 'bold' },
  narrative: {
    fontSize: '0.95rem',
    lineHeight: 1.75,
    minHeight: 90,
    color: 'var(--t-primary)',
    fontStyle: 'italic',
  },
  choices: { display: 'flex', flexDirection: 'column', gap: 8, marginTop: '1rem' },
  choiceBtn: {
    background: 'transparent',
    color: 'var(--t-primary)',
    border: '1px solid var(--t-border)',
    padding: '0.5rem 0.875rem',
    cursor: 'pointer',
    textAlign: 'left',
    fontFamily: 'inherit',
    fontSize: '0.875rem',
    letterSpacing: '0.03em',
    transition: 'border-color 0.15s, background 0.15s',
  },
  sendBtn: {
    background: 'var(--t-dim-dark)',
    color: 'var(--t-primary)',
    border: '1px solid var(--t-border)',
    padding: '0.5rem 1rem',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: '0.875rem',
    whiteSpace: 'nowrap',
  },
  scanTxt: { color: 'var(--t-dim)', fontStyle: 'italic', animation: 'blink 1s step-end infinite' },
  logEntry: {
    fontSize: '0.8rem',
    color: 'var(--t-dim)',
    borderBottom: '1px solid var(--t-separator)',
    padding: '3px 0',
  },
  formLbl: {
    display: 'block',
    fontSize: '0.8rem',
    letterSpacing: '0.15em',
    color: 'var(--t-dim)',
    marginBottom: 4,
    marginTop: 12,
  },
  formInp: {
    display: 'block',
    width: '100%',
    background: 'var(--t-card)',
    color: 'var(--t-primary)',
    border: '1px solid var(--t-border)',
    padding: '0.5rem 0.75rem',
    fontFamily: 'inherit',
    fontSize: '0.875rem',
    boxSizing: 'border-box',
    outline: 'none',
  },
  submit: {
    marginTop: 16,
    background: 'var(--t-dim-dark)',
    color: 'var(--t-primary)',
    border: '1px solid var(--t-primary)',
    padding: '0.6rem 1.5rem',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: '0.875rem',
    letterSpacing: '0.1em',
    width: '100%',
  },
  err: { color: 'var(--t-hp-low)', fontSize: '0.8rem', marginTop: 8 },
};

interface Theme {
  pageBg: string;
  cardBg: string;
  font: string;
  primary: string;
  mid: string;
  dim: string;
  dimDark: string;
  border: string;
  separator: string;
  itemColor: string;
  hpHigh: string;
  hpMid: string;
  hpLow: string;
  title: string;
  worldLabel: string;
}

export function applyTheme(theme: Theme) {
  const r = document.documentElement.style;
  r.setProperty('--t-bg', theme.pageBg);
  r.setProperty('--t-card', theme.cardBg);
  r.setProperty('--t-font', theme.font);
  r.setProperty('--t-primary', theme.primary);
  r.setProperty('--t-mid', theme.mid);
  r.setProperty('--t-dim', theme.dim);
  r.setProperty('--t-dim-dark', theme.dimDark);
  r.setProperty('--t-border', theme.border);
  r.setProperty('--t-separator', theme.separator);
  r.setProperty('--t-item', theme.itemColor);
  r.setProperty('--t-hp-high', theme.hpHigh);
  r.setProperty('--t-hp-mid', theme.hpMid);
  r.setProperty('--t-hp-low', theme.hpLow);
}

applyTheme(scifiContext.theme);

type View = 'login' | 'loading' | 'sessions' | 'char' | 'game';
type HistoryEntry = { role: 'user' | 'assistant'; content: string };

// ─── App shell ───────────────────────────────────────────────────────────────
export default function App() {
  const [view, setView] = useState<View>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [seed, setSeed] = useState<Seed | null>(null);
  const [choices, setChoices] = useState<GameChoice[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [escaped, setEscaped] = useState(false);
  const [roomLog, setRoomLog] = useState<string[]>([]);
  const [mapOpen, setMapOpen] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const narrativeRef = useRef<HTMLDivElement>(null);

  const ctx = getCtx(seed);
  const worldName = seed?.world_name || seed?.ship_name || '???';

  useEffect(() => {
    applyTheme(ctx.theme);
  }, [ctx]);

  // Check auth first; if logged in, then try to restore a session from the URL
  useEffect(() => {
    api
      .getMe()
      .then(me => {
        setUser(me);
        const uuidInPath = window.location.pathname.match(/^\/([0-9a-f-]{36})$/i)?.[1];
        if (uuidInPath) {
          return api
            .getSessionById(uuidInPath)
            .then(s => {
              if (s) {
                setSession(s);
                setGameState(s.state);
                setSeed(s.seed);
                setRoomLog(s.state.room_log || []);
                setEscaped(s.status === 'escaped');
                setChoices(s.state.last_choices || []);
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
    setSession(null);
    setGameState(null);
    setSeed(null);
    window.history.replaceState(null, '', '/');
    setView('login');
  }

  async function handleResumeSession(id: string) {
    setLoading(true);
    try {
      const s = await api.getSessionById(id);
      setSession(s);
      setGameState(s.state);
      setSeed(s.seed);
      setRoomLog(s.state.room_log || []);
      setEscaped(s.status === 'escaped');
      setChoices(s.state.last_choices || []);
      window.history.pushState(null, '', `/${id}`);
      setView('game');
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }

  async function handleNewGame(characters: CharacterInput[], contextId: string) {
    setLoading(true);
    try {
      const result = await api.newSession(characters, contextId);
      setSession(result.session);
      setGameState(result.state);
      setSeed(result.seed);
      setHistory([]);
      setEscaped(false);
      setView('game');
      window.history.pushState(null, '', `/${result.session.id}`);
      setRoomLog(result.state.room_log || []);
      setChoices(result.state.last_choices || []);
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
        { role: 'user', content: label },
        { role: 'assistant', content: result.narrative },
      ];
      setHistory(newHistory);
      setChoices(result.choices || []);
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

  function handleChoice(c: GameChoice) {
    act(c.action, c.label, history);
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

      {view === 'login' && <LoginScreen />}

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

      {view === 'char' && (
        <CharScreen
          onStart={(chars, ctxId) => handleNewGame(chars, ctxId)}
          loading={loading}
          availableContexts={Object.values(CONTEXTS)}
          user={user}
        />
      )}

      {view === 'game' &&
        (() => {
          const activeChar =
            gameState?.characters.find(c => c.id === gameState.active_character_id) ??
            gameState?.characters[0] ??
            null;
          const allDead = !!gameState && gameState.characters.every(c => c.dead);
          return (
            <div style={S.page}>
              <header style={S.header}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    {activeChar?.portrait_url && (
                      <img
                        src={activeChar.portrait_url}
                        alt=""
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: '50%',
                          border: '1px solid var(--t-border)',
                          objectFit: 'cover',
                        }}
                      />
                    )}
                    <div>
                      <p style={S.title}>{ctx.theme.title}</p>
                      <p style={S.sub}>
                        {ctx.theme.worldLabel}: {worldName} · ACTIVE: {activeChar?.name} [
                        {activeChar?.character_class}]
                      </p>
                    </div>
                  </div>
                  {user && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        fontSize: '0.75rem',
                        color: 'var(--t-dim)',
                        letterSpacing: '0.1em',
                      }}
                    >
                      {user.avatar_url && (
                        <img
                          src={user.avatar_url}
                          alt=""
                          style={{ width: 22, height: 22, borderRadius: '50%', opacity: 0.7 }}
                        />
                      )}
                      <span>{user.display_name.toUpperCase()}</span>
                      <button
                        onClick={handleLogout}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--t-dim)',
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                          fontSize: '0.75rem',
                          letterSpacing: '0.1em',
                          padding: 0,
                        }}
                      >
                        SIGN OUT
                      </button>
                    </div>
                  )}
                </div>
              </header>

              <PartyPanel
                state={gameState}
                activeCharId={gameState?.active_character_id ?? ''}
                ctx={ctx}
                seed={seed}
                onEquip={handleEquip}
                inCombat={!!gameState?.combat_active}
                onOpenMap={() => setMapOpen(true)}
              />

              {mapOpen && seed && gameState && (
                <WorldMap seed={seed} state={gameState} onClose={() => setMapOpen(false)} />
              )}

              <div style={{ display: 'flex', gap: '1rem', alignItems: 'stretch' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ ...S.card, maxHeight: 320, overflowY: 'auto' }} ref={narrativeRef}>
                    {loading && roomLog.length === 0 ? (
                      <p style={S.scanTxt}>Scanning sector...</p>
                    ) : (
                      roomLog.map((text, i) => (
                        <p
                          key={i}
                          style={{
                            ...S.narrative,
                            minHeight: 0,
                            margin: 0,
                            paddingBottom: i < roomLog.length - 1 ? '0.75rem' : 0,
                            borderBottom:
                              i < roomLog.length - 1 ? '1px solid var(--t-separator)' : 'none',
                            marginBottom: i < roomLog.length - 1 ? '0.75rem' : 0,
                            opacity: 0.4 + 0.6 * ((i + 1) / roomLog.length),
                          }}
                        >
                          {text}
                        </p>
                      ))
                    )}
                    {loading && roomLog.length > 0 && (
                      <p style={{ ...S.scanTxt, marginTop: '0.5rem' }}>Scanning sector...</p>
                    )}
                  </div>

                  {!loading && escaped ? (
                    <div
                      style={{
                        ...S.card,
                        borderColor: 'var(--t-primary)',
                        textAlign: 'center',
                        padding: '1.5rem',
                      }}
                    >
                      <p
                        style={{
                          color: 'var(--t-primary)',
                          fontSize: '1.1rem',
                          letterSpacing: '0.2em',
                          marginBottom: '0.5rem',
                          textShadow: '0 0 8px var(--t-primary)',
                        }}
                      >
                        ★ MISSION COMPLETE ★
                      </p>
                      <p
                        style={{
                          color: 'var(--t-mid)',
                          fontSize: '0.8rem',
                          marginBottom: '1.25rem',
                        }}
                      >
                        You escaped the {worldName}. Well done, hero.
                      </p>
                      <button
                        style={{ ...S.submit, width: 'auto', padding: '0.6rem 2rem' }}
                        onClick={() => {
                          setEscaped(false);
                          setHistory([]);
                          window.history.replaceState(null, '', '/');
                          loadSessions();
                        }}
                      >
                        START NEW MISSION
                      </button>
                    </div>
                  ) : !loading && allDead ? (
                    <div
                      style={{
                        ...S.card,
                        borderColor: 'var(--t-hp-low)',
                        textAlign: 'center',
                        padding: '1.5rem',
                      }}
                    >
                      <p
                        style={{
                          color: 'var(--t-hp-low)',
                          fontSize: '1.1rem',
                          letterSpacing: '0.2em',
                          marginBottom: '0.5rem',
                        }}
                      >
                        ✖ HERO DECEASED ✖
                      </p>
                      <p
                        style={{
                          color: 'var(--t-dim)',
                          fontSize: '0.8rem',
                          marginBottom: '1.25rem',
                        }}
                      >
                        The {worldName} has claimed another victim.
                      </p>
                      <button
                        style={{ ...S.submit, width: 'auto', padding: '0.6rem 2rem' }}
                        onClick={() => {
                          setHistory([]);
                          window.history.replaceState(null, '', '/');
                          loadSessions();
                        }}
                      >
                        START NEW MISSION
                      </button>
                    </div>
                  ) : (
                    <>
                      <div style={S.choices}>
                        {!loading &&
                          choices.map((c, i) => (
                            <button key={i} style={S.choiceBtn} onClick={() => handleChoice(c)}>
                              [{i + 1}] {c.label}
                            </button>
                          ))}
                      </div>
                    </>
                  )}

                  {history.length > 0 && (
                    <div
                      style={{ ...S.card, marginTop: '1.5rem', maxHeight: 160, overflowY: 'auto' }}
                      ref={logRef}
                    >
                      <p
                        style={{
                          fontSize: '0.75rem',
                          letterSpacing: '0.1em',
                          color: 'var(--t-dim)',
                          marginBottom: 6,
                        }}
                      >
                        MISSION LOG
                      </p>
                      {[...history]
                        .reverse()
                        .filter((_, i) => i % 2 === 0)
                        .slice(0, 20)
                        .map((m, i) => (
                          <p key={i} style={S.logEntry}>
                            › {m.content}
                          </p>
                        ))}
                    </div>
                  )}

                  <div
                    style={{
                      marginTop: '1rem',
                      fontSize: '0.75rem',
                      color: 'var(--t-dim)',
                      display: 'flex',
                      gap: '1.5rem',
                    }}
                  >
                    <button
                      style={{ ...S.sendBtn, padding: '0.3rem 0.75rem', fontSize: '0.75rem' }}
                      onClick={() => {
                        if (confirm('Abandon current run and start over?')) {
                          setHistory([]);
                          window.history.replaceState(null, '', '/');
                          loadSessions();
                        }
                      }}
                    >
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

