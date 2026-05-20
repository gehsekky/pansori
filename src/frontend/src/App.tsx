import { type AuthUser, type CharacterInput, api } from './lib/api.ts';
import { FactionsView, QuestsView } from './components/CampaignPanel.tsx';
import type { FrontendContext, GameChoice, Seed, SessionSummary } from './types.ts';
import { useEffect, useRef, useState } from 'react';
import CharScreen from './components/CharScreen.tsx';
import ClassAbilityBar from './components/ClassAbilityBar.tsx';
import CombatActionBar from './components/CombatActionBar.tsx';
import CombatLogPanel from './components/CombatLogPanel.tsx';
import ContextPanel from './components/ContextPanel.tsx';
import type { ContextTab } from './components/ContextPanel.tsx';
import DefaultActionBar from './components/DefaultActionBar.tsx';
import EnemySelector from './components/EnemySelector.tsx';
import GridCombatView from './components/GridCombatView.tsx';
import InventoryModal from './components/InventoryModal.tsx';
import LoginScreen from './components/LoginScreen.tsx';
import MissionLogPanel from './components/MissionLogPanel.tsx';
import MoveDPad from './components/MoveDPad.tsx';
import NarrativeText from './components/NarrativeText.tsx';
import PartyRail from './components/PartyRail.tsx';
import RoomArtPanel from './components/RoomArtPanel.tsx';
import SessionsScreen from './components/SessionScreen.tsx';
import SpellBar from './components/SpellBar.tsx';
import WorldMap from './components/WorldMap.tsx';
import { applyTheme } from './lib/theme.ts';
import artManifest from './art-manifest.json';
import { context as groveContext } from './contexts/grove_of_thorns.tsx';
import { context as sandboxContext } from './contexts/sandbox.tsx';
import styles from './styles.module.css';
import { useGame } from './hooks/useGame.ts';
import { context as valeContext } from './contexts/vale_of_shadows.tsx';
import { context as whisperingPinesContext } from './contexts/whispering_pines.tsx';

const CONTEXTS: Record<string, FrontendContext> = {
  sandbox: sandboxContext,
  vale_of_shadows: valeContext,
  whispering_pines: whisperingPinesContext,
  grove_of_thorns: groveContext,
};
// Choice kinds that get their own dedicated UI (D-pad / icon bar) and
// therefore drop out of the numbered text-button column and its 1-9
// keyboard shortcuts. Keep this list aligned with the components that
// consume each kind so a choice never renders twice.
const ICONIZED_KINDS = new Set<string>([
  'grid_move',
  'dash',
  'disengage',
  'dodge',
  'ready',
  'attack',
  'grapple',
  'shove',
  'two_weapon_attack',
  'class_feature',
]);
const DEFAULT_ACTION_KINDS = new Set<string>(['dash', 'disengage', 'dodge', 'ready']);
const COMBAT_ACTION_KINDS = new Set<string>(['attack', 'grapple', 'shove', 'two_weapon_attack']);

// SpellBar handles single-target offensive cast_spell choices (one
// button per unique spell at the lowest available slot). Multi-target
// variants (Magic Missile focus-fire / spread, Eldritch Blast multi-
// beam) and upcast slots stay in the text list. This computes the
// exact subset that goes to the SpellBar so the text list can filter
// them out without losing the upcast / multi-target variants.
function selectSpellBarChoices(choices: GameChoice[]): GameChoice[] {
  const single = choices.filter((c) => {
    if (c.kind !== 'cast_spell') return false;
    const action = c.action as { targetEnemyId?: string; targetEnemyIds?: string[] };
    return !!action.targetEnemyId && !Array.isArray(action.targetEnemyIds);
  });
  // One per spellId at lowest slot — match SpellBar's internal grouping.
  const lowestPerSpell = new Map<string, GameChoice>();
  for (const c of single) {
    const action = c.action as { spellId: string; slotLevel: number };
    const existing = lowestPerSpell.get(action.spellId);
    if (!existing) {
      lowestPerSpell.set(action.spellId, c);
      continue;
    }
    const existingSlot = (existing.action as { slotLevel: number }).slotLevel;
    if (action.slotLevel < existingSlot) lowestPerSpell.set(action.spellId, c);
  }
  return [...lowestPerSpell.values()];
}

// Single-target enemy filter — collapses the per-enemy variants of
// Attack / Cast Guiding Bolt / Grapple / etc. into one visible choice
// at a time, controlled by the EnemySelector's selection. Multi-target
// choices (Magic Missile spread, AoE) carry a `targetEnemyIds` array
// and bypass the filter so the player can still pick them. When no
// enemy is selected (out of combat, or an interstitial moment with no
// living hostiles), no choices are filtered out.
function filterByTarget(c: GameChoice, selectedEnemyId: string | null): boolean {
  if (!selectedEnemyId) return true;
  const action = c.action as { targetEnemyId?: string; targetEnemyIds?: string[] };
  if (Array.isArray(action.targetEnemyIds)) return true;
  if (!action.targetEnemyId) return true;
  return action.targetEnemyId === selectedEnemyId;
}
function getCtx(seed: Seed | null): FrontendContext {
  return (seed?.context_id ? CONTEXTS[seed.context_id] : null) ?? sandboxContext;
}

applyTheme(sandboxContext.theme);

type View = 'login' | 'loading' | 'sessions' | 'char' | 'game';

// ─── App shell ───────────────────────────────────────────────────────────────
export default function App() {
  const [view, setView] = useState<View>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [mapOpen, setMapOpen] = useState(false);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  // Which choice is currently hovered — used by GridCombatView to render an
  // AoE preview tint over the cells a hovered spell would affect.
  const [hoveredChoice, setHoveredChoice] = useState<GameChoice | null>(null);
  // Single-target enemy selection drives the choice list filter: target-
  // bearing choices (Attack, Cast Guiding Bolt, Grapple, etc.) are shown
  // only for the selected enemy, collapsing N target variants into 1
  // button per action. Defaults to the first living enemy; resets when
  // the enemy roster changes.
  const [selectedEnemyId, setSelectedEnemyId] = useState<string | null>(null);
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
    handleTransfer,
    handleDrop,
    handleChoice,
    resetGame,
  } = useGame();

  const ctx = getCtx(seed);
  const worldName = seed?.world_name || seed?.ship_name || '???';

  useEffect(() => {
    applyTheme(ctx.theme);
  }, [ctx]);

  // Keep the enemy selector pointed at a valid target. When the roster
  // changes (combat starts/ends, an enemy dies, the party moves rooms),
  // re-anchor on the first living enemy; clear when there's nothing to
  // target. Without this the selector can stick on a dead enemy id and
  // every targeted action becomes a no-op.
  useEffect(() => {
    const livingEnemies =
      gameState?.entities?.filter((e) => e.isEnemy && e.hp > 0) ?? [];
    if (livingEnemies.length === 0) {
      if (selectedEnemyId !== null) setSelectedEnemyId(null);
      return;
    }
    const stillValid = livingEnemies.some((e) => e.id === selectedEnemyId);
    if (!stillValid) setSelectedEnemyId(livingEnemies[0].id);
  }, [gameState?.entities, selectedEnemyId]);

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
    // Intentional mount-only init: re-running on every render-time
    // identity change of `handleResumeSession` / `loadSessions` would
    // re-fetch the user and re-request the resume target on each
    // re-render, which is both wasteful and would let an in-flight
    // resume fight with a fresh re-call. Keeping the dep list empty.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      // 'i' toggles inventory modal
      if (e.key === 'i' || e.key === 'I') {
        e.preventDefault();
        setInventoryOpen((v) => !v);
        return;
      }
      // Number keys pick choices when no modal blocks input. Choices that
      // get their own dedicated UI (grid move D-pad, default-action icon
      // row) drop out of the numbered list so the indices stay stable.
      if (inventoryOpen || mapOpen) return;
      const idx = parseInt(e.key, 10);
      const numbered = choices.filter((c) => !ICONIZED_KINDS.has(c.kind ?? ''));
      if (!isNaN(idx) && idx >= 1 && idx <= numbered.length) handleChoice(numbered[idx - 1]);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
    // handleChoice closes over `history` from the useGame hook; without
    // it in the dep list, a stale closure would dispatch with frozen
    // history after the player takes several non-keyboard actions.
    // Re-registering the listener on each render is cheap (one DOM op).
  }, [view, loading, escaped, gameState, choices, inventoryOpen, mapOpen, handleChoice]);

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
          // Build the right-rail tab list from current game state. Tabs only
          // appear when their data exists (e.g. quests + factions only with a
          // campaign, combat log only with events).
          const contextTabs: ContextTab[] = [];
          const roomId = gameState?.current_room ?? null;
          const artMap = artManifest as Record<string, Record<string, string>>;
          const hasRoomArt = !!roomId && (!!ctx.art[roomId] || !!artMap[ctx.id]?.[roomId]);
          if (hasRoomArt) {
            contextTabs.push({
              id: 'room',
              label: 'ROOM',
              render: () => <RoomArtPanel roomId={roomId} ctx={ctx} />,
            });
          }
          if (campaignMeta && gameState && campaignMeta.quests.length > 0) {
            contextTabs.push({
              id: 'quests',
              label: `QUESTS (${campaignMeta.quests.length})`,
              render: () => <QuestsView state={gameState} meta={campaignMeta} />,
            });
          }
          if (campaignMeta && gameState && campaignMeta.factions.length > 0) {
            contextTabs.push({
              id: 'factions',
              label: `FACTIONS (${campaignMeta.factions.length})`,
              render: () => <FactionsView state={gameState} meta={campaignMeta} />,
            });
          }
          if (gameState?.combat_log && gameState.combat_log.length > 0) {
            contextTabs.push({
              id: 'combat-log',
              label: 'COMBAT LOG',
              render: () => <CombatLogPanel events={gameState.combat_log} />,
            });
          }
          if (history.length > 0) {
            contextTabs.push({
              id: 'mission-log',
              label: 'MISSION LOG',
              render: () => <MissionLogPanel history={history} />,
            });
          }
          return (
            <div className={styles.page}>
              <header className={styles.header}>
                <div className={styles.headerRow}>
                  <div className={styles.headerLeft}>
                    {activeChar?.portrait_url && (
                      <img src={activeChar.portrait_url} alt="" className={styles.charPortrait} />
                    )}
                    <div>
                      <h1 className={styles.title}>{ctx.theme.title}</h1>
                      <p className={styles.sub}>
                        {ctx.theme.worldLabel}: {worldName} · ACTIVE: {activeChar?.name} [
                        {activeChar?.character_class}]
                      </p>
                    </div>
                  </div>
                  {user && (
                    <div className={styles.userInfoRow}>
                      <button
                        className={styles.invHeaderBtn}
                        onClick={() => setInventoryOpen(true)}
                        title="Inventory (I)"
                        aria-label="Open inventory"
                        aria-keyshortcuts="i"
                      >
                        <span aria-hidden="true">🎒 </span>INVENTORY
                      </button>
                      <button
                        className={styles.invHeaderBtn}
                        onClick={() => setMapOpen(true)}
                        title="World map"
                        aria-label="Open world map"
                      >
                        <span aria-hidden="true">🗺 </span>MAP
                      </button>
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

              <main className={styles.gameLayout}>
                {gameState && (
                  <PartyRail
                    state={gameState}
                    activeCharId={gameState.active_character_id ?? ''}
                    ctx={ctx}
                    seed={seed}
                    inCombat={!!gameState.combat_active}
                  />
                )}

                <div className={styles.gameMain}>
                  {gameState?.combat_active &&
                    gameState.entities &&
                    gameState.entities.length > 0 &&
                    seed && (
                      <GridCombatView
                        state={gameState}
                        seed={seed}
                        aoePreview={hoveredChoice?.aoePreview}
                        onMove={(to) => {
                          const activeId = gameState.active_character_id;
                          handleChoice({
                            label: `Move to (${to.x},${to.y})`,
                            action: { type: 'grid_move', entityId: activeId, to },
                          });
                        }}
                      />
                    )}
                  <div
                    data-testid="game-narrative-panel"
                    className={styles.card}
                    style={{ maxHeight: 320, overflowY: 'auto' }}
                    ref={narrativeRef}
                    role="log"
                    aria-live="polite"
                    aria-atomic="false"
                    aria-label="Game narrative"
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
                          <NarrativeText text={text} />
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
                      <h2
                        style={{
                          color: 'var(--t-primary)',
                          fontSize: '1.1rem',
                          letterSpacing: '0.2em',
                          marginBottom: '0.5rem',
                          marginTop: 0,
                          textShadow: '0 0 8px var(--t-primary)',
                          fontWeight: 'normal',
                        }}
                      >
                        <span aria-hidden="true">★ </span>MISSION COMPLETE
                        <span aria-hidden="true"> ★</span>
                      </h2>
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
                      <h2
                        style={{
                          color: 'var(--t-hp-low)',
                          fontSize: '1.1rem',
                          letterSpacing: '0.2em',
                          marginBottom: '0.5rem',
                          marginTop: 0,
                          fontWeight: 'normal',
                        }}
                      >
                        <span aria-hidden="true">✖ </span>HERO DECEASED
                        <span aria-hidden="true"> ✖</span>
                      </h2>
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
                    <>
                      {!loading &&
                        (() => {
                          const enemyFiltered = choices.filter((c) =>
                            filterByTarget(c, selectedEnemyId)
                          );
                          const spellBarChoices = selectSpellBarChoices(enemyFiltered);
                          const spellBarSet = new Set(spellBarChoices);
                          const classFeatureChoices = enemyFiltered.filter(
                            (c) => c.kind === 'class_feature'
                          );
                          const textListChoices = enemyFiltered
                            .filter((c) => !ICONIZED_KINDS.has(c.kind ?? ''))
                            .filter((c) => !spellBarSet.has(c));
                          // Combat-controls container should render whenever
                          // at least one inner bar will. EnemySelector +
                          // MoveDPad + Default/Combat action bars all live
                          // here; combat_active OR any iconized/spell choice
                          // is enough to surface the region.
                          const hasIconizedChoice = choices.some((c) =>
                            ICONIZED_KINDS.has(c.kind ?? '')
                          );
                          const hasSpellBar = spellBarChoices.length > 0;
                          const inCombat = !!gameState?.combat_active;
                          const hasCombatControls =
                            hasIconizedChoice || hasSpellBar || inCombat;
                          return (
                            <>
                              {hasCombatControls && (
                                /* Combat controls — one bordered region holding
                                   every icon-bar control (movement D-pad,
                                   targeting selector, default actions,
                                   combat verbs, spells, class features). */
                                <section
                                  className={styles.combatControls}
                                  aria-label="Combat controls"
                                  data-testid="combat-controls"
                                >
                                  <div className={styles.combatControlsTop}>
                                    <MoveDPad
                                      choices={choices.filter((c) => c.kind === 'grid_move')}
                                      onChoose={handleChoice}
                                    />
                                    <div className={styles.combatControlsCol}>
                                      {gameState && (
                                        <EnemySelector
                                          state={gameState}
                                          seed={seed}
                                          selectedId={selectedEnemyId}
                                          onSelect={setSelectedEnemyId}
                                        />
                                      )}
                                      <DefaultActionBar
                                        choices={choices.filter((c) =>
                                          DEFAULT_ACTION_KINDS.has(c.kind ?? '')
                                        )}
                                        onChoose={handleChoice}
                                      />
                                      <CombatActionBar
                                        // Combat verbs are target-bearing, so route them
                                        // through the same enemy filter as the text list —
                                        // the bar then sees at most one choice per kind
                                        // (matching the EnemySelector's pick).
                                        choices={choices
                                          .filter((c) => COMBAT_ACTION_KINDS.has(c.kind ?? ''))
                                          .filter((c) => filterByTarget(c, selectedEnemyId))}
                                        onChoose={handleChoice}
                                      />
                                    </div>
                                  </div>
                                  <SpellBar
                                    choices={spellBarChoices}
                                    onChoose={handleChoice}
                                  />
                                  <ClassAbilityBar
                                    choices={classFeatureChoices}
                                    onChoose={handleChoice}
                                  />
                                </section>
                              )}
                              <ul
                                className={styles.choices}
                                data-testid="choices-list"
                                aria-label="Available actions"
                                style={{ listStyle: 'none', margin: 0, padding: 0 }}
                              >
                                {textListChoices.map((c, i) => (
                                  <li key={i} style={{ listStyle: 'none' }}>
                                    <button
                                      data-testid="choice-btn"
                                      data-action-type={c.action.type}
                                      className={styles.choiceBtn}
                                      onClick={() => handleChoice(c)}
                                      onMouseEnter={() => c.aoePreview && setHoveredChoice(c)}
                                      onMouseLeave={() => setHoveredChoice(null)}
                                      aria-keyshortcuts={i < 9 ? `${i + 1}` : undefined}
                                    >
                                      <span aria-hidden="true">[{i + 1}] </span>
                                      {c.label}
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            </>
                          );
                        })()}
                    </>
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

                {contextTabs.length > 0 && <ContextPanel tabs={contextTabs} />}
              </main>

              {mapOpen && seed && gameState && (
                <WorldMap seed={seed} state={gameState} onClose={() => setMapOpen(false)} />
              )}

              {inventoryOpen && gameState && (
                <InventoryModal
                  state={gameState}
                  ctx={ctx}
                  onClose={() => setInventoryOpen(false)}
                  onEquip={handleEquip}
                  onTransfer={handleTransfer}
                  onDrop={handleDrop}
                />
              )}
            </div>
          );
        })()}
    </>
  );
}
