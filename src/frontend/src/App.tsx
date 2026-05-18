import { type AuthUser, type CharacterInput, api } from './lib/api.ts';
import type { FrontendContext, Seed, SessionSummary } from './types.ts';
import { useEffect, useRef, useState } from 'react';
import CampaignPanel from './components/CampaignPanel.tsx';
import CharScreen from './components/CharScreen.tsx';
import GridCombatView from './components/GridCombatView.tsx';
import LoginScreen from './components/LoginScreen.tsx';
import PartyPanel from './components/PartyPanel.tsx';
import RoomArtPanel from './components/RoomArtPanel.tsx';
import SessionsScreen from './components/SessionScreen.tsx';
import WorldMap from './components/WorldMap.tsx';
import { context as sandboxContext } from './contexts/sandbox.tsx';
import styles from './styles.module.css';
import { useGame } from './hooks/useGame.ts';

const CONTEXTS: Record<string, FrontendContext> = {
  sandbox: sandboxContext,
};
function getCtx(seed: Seed | null): FrontendContext {
  return (seed?.context_id ? CONTEXTS[seed.context_id] : null) ?? sandboxContext;
}

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

applyTheme(sandboxContext.theme);

type View = 'login' | 'loading' | 'sessions' | 'char' | 'game';

// ─── App shell ───────────────────────────────────────────────────────────────
export default function App() {
  const [view, setView] = useState<View>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [mapOpen, setMapOpen] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const narrativeRef = useRef<HTMLDivElement>(null);

  const {
    gameState,
    seed,
    campaignMeta,
    choices,
    history,
    loading,
    escaped,
    roomLog,
    handleNewGame,
    handleResumeSession,
    handleEquip,
    handleChoice,
    resetGame,
  } = useGame();

  const ctx = getCtx(seed);
  const worldName = seed?.world_name || seed?.ship_name || '???';

  useEffect(() => {
    applyTheme(ctx.theme);
  }, [ctx]);

  useEffect(() => {
    api
      .getMe()
      .then((me) => {
        setUser(me);
        const uuidInPath = window.location.pathname.match(/^\/([0-9a-f-]{36})$/i)?.[1];
        if (uuidInPath) {
          return handleResumeSession(uuidInPath)
            .then(() => setView('game'))
            .catch(() => {
              window.history.replaceState(null, '', '/');
              return loadSessions();
            });
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
    resetGame();
    window.history.replaceState(null, '', '/');
    setView('login');
  }

  useEffect(() => {
    if (narrativeRef.current) narrativeRef.current.scrollTop = narrativeRef.current.scrollHeight;
  }, [roomLog]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const allDead = !!gameState && gameState.characters.every((c) => c.dead);
      if (view !== 'game' || loading || escaped || allDead) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const idx = parseInt(e.key, 10);
      if (!isNaN(idx) && idx >= 1 && idx <= choices.length) handleChoice(choices[idx - 1]);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [view, loading, escaped, gameState, choices]);

  async function wrappedResumeSession(id: string) {
    await handleResumeSession(id);
    setView('game');
  }

  async function wrappedNewGame(characters: CharacterInput[], contextId: string) {
    await handleNewGame(characters, contextId);
    setView('game');
  }

  function startNewMission() {
    resetGame();
    window.history.replaceState(null, '', '/');
    loadSessions();
  }

  return (
    <>
      {view === 'loading' && (
        <div className={styles.page}>
          <p style={{ color: 'var(--t-dim)' }}>SYSTEM BOOT...</p>
        </div>
      )}

      {view === 'login' && <LoginScreen />}

      {view === 'sessions' && (
        <SessionsScreen
          sessions={sessions}
          user={user}
          loading={loading}
          onResume={wrappedResumeSession}
          onNewGame={() => setView('char')}
          onLogout={handleLogout}
          onDelete={handleDeleteSession}
          onClearCompleted={handleClearCompleted}
          contexts={CONTEXTS}
        />
      )}

      {view === 'char' && (
        <CharScreen
          onStart={(chars, ctxId) => wrappedNewGame(chars, ctxId)}
          loading={loading}
          availableContexts={Object.values(CONTEXTS)}
          user={user}
        />
      )}

      {view === 'game' &&
        (() => {
          const activeChar =
            gameState?.characters.find((c) => c.id === gameState.active_character_id) ??
            gameState?.characters[0] ??
            null;
          const allDead = !!gameState && gameState.characters.every((c) => c.dead);
          return (
            <div className={styles.page}>
              <header className={styles.header}>
                <div className={styles.headerRow}>
                  <div className={styles.headerLeft}>
                    {activeChar?.portrait_url && (
                      <img src={activeChar.portrait_url} alt="" className={styles.charPortrait} />
                    )}
                    <div>
                      <p className={styles.title}>{ctx.theme.title}</p>
                      <p className={styles.sub}>
                        {ctx.theme.worldLabel}: {worldName} · ACTIVE: {activeChar?.name} [
                        {activeChar?.character_class}]
                      </p>
                    </div>
                  </div>
                  {user && (
                    <div className={styles.userInfoRow}>
                      {user.avatar_url && (
                        <img src={user.avatar_url} alt="" className={styles.userAvatar} />
                      )}
                      <span>{user.display_name.toUpperCase()}</span>
                      <button className={styles.signOutBtn} onClick={handleLogout}>
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

              {gameState?.combat_active &&
                gameState.entities &&
                gameState.entities.length > 0 &&
                seed && <GridCombatView state={gameState} seed={seed} />}

              {campaignMeta && gameState && <CampaignPanel state={gameState} meta={campaignMeta} />}

              <div className={styles.contentRow}>
                <div className={styles.contentMain}>
                  <div
                    className={styles.card}
                    style={{ maxHeight: 320, overflowY: 'auto' }}
                    ref={narrativeRef}
                  >
                    {loading && roomLog.length === 0 ? (
                      <p className={styles.scanTxt}>Scanning sector...</p>
                    ) : (
                      roomLog.map((text, i) => (
                        <p
                          key={i}
                          className={styles.narrative}
                          style={{
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
                      <p className={styles.scanTxt} style={{ marginTop: '0.5rem' }}>
                        Scanning sector...
                      </p>
                    )}
                  </div>

                  {!loading && escaped ? (
                    <div
                      className={styles.card}
                      style={{
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
                        className={styles.submit}
                        style={{ width: 'auto', padding: '0.6rem 2rem' }}
                        onClick={startNewMission}
                      >
                        START NEW MISSION
                      </button>
                    </div>
                  ) : !loading && allDead ? (
                    <div
                      className={styles.card}
                      style={{
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
                        className={styles.submit}
                        style={{ width: 'auto', padding: '0.6rem 2rem' }}
                        onClick={startNewMission}
                      >
                        START NEW MISSION
                      </button>
                    </div>
                  ) : (
                    <div className={styles.choices}>
                      {!loading &&
                        choices.map((c, i) => (
                          <button
                            key={i}
                            className={styles.choiceBtn}
                            onClick={() => handleChoice(c)}
                          >
                            [{i + 1}] {c.label}
                          </button>
                        ))}
                    </div>
                  )}

                  {history.length > 0 && (
                    <div
                      className={styles.card}
                      style={{ marginTop: '1.5rem', maxHeight: 160, overflowY: 'auto' }}
                      ref={logRef}
                    >
                      <p className={styles.missionLogLabel}>MISSION LOG</p>
                      {[...history]
                        .reverse()
                        .filter((_, i) => i % 2 === 0)
                        .slice(0, 20)
                        .map((m, i) => (
                          <p key={i} className={styles.logEntry}>
                            › {m.content}
                          </p>
                        ))}
                    </div>
                  )}

                  <div className={styles.abortRow}>
                    <button
                      className={styles.sendBtn}
                      style={{ padding: '0.3rem 0.75rem', fontSize: '0.75rem' }}
                      onClick={() => {
                        if (confirm('Abandon current run and start over?')) startNewMission();
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
