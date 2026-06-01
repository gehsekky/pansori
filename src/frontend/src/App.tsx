import { type AuthUser, type CharacterInput, api } from './lib/api.ts';
import { FactionsView, QuestsView } from './components/CampaignPanel.tsx';
import type { FrontendContext, GameChoice, Seed, SessionSummary } from './types.ts';
import { useCallback, useEffect, useRef, useState } from 'react';
import AdventureLogPanel from './components/AdventureLogPanel.tsx';
import CharScreen from './components/CharScreen.tsx';
import ClassAbilityBar from './components/ClassAbilityBar.tsx';
import CombatActionBar from './components/CombatActionBar.tsx';
import CombatLogPanel from './components/CombatLogPanel.tsx';
import ContextPanel from './components/ContextPanel.tsx';
import type { ContextTab } from './components/ContextPanel.tsx';
import ConversationPanel from './components/ConversationPanel.tsx';
import DefaultActionBar from './components/DefaultActionBar.tsx';
import EnemySelector from './components/EnemySelector.tsx';
import GridCombatView from './components/GridCombatView.tsx';
import GridMapView from './components/GridMapView.tsx';
import InventoryModal from './components/InventoryModal.tsx';
import InviteDialog from './components/InviteDialog.tsx';
import LevelUpDialog from './components/LevelUpDialog.tsx';
import LoginScreen from './components/LoginScreen.tsx';
import MoveDPad from './components/MoveDPad.tsx';
import NarrativeText from './components/NarrativeText.tsx';
import OptionPickerDialog from './components/OptionPickerDialog.tsx';
import PartyRail from './components/PartyRail.tsx';
import RoomArtPanel from './components/RoomArtPanel.tsx';
import SessionsScreen from './components/SessionScreen.tsx';
import SpellBar from './components/SpellBar.tsx';
import TargetPickerDialog from './components/TargetPickerDialog.tsx';
import WaitingForPlayer from './components/WaitingForPlayer.tsx';
import WorldMap from './components/WorldMap.tsx';
import { activeGrid } from './lib/activeGrid.ts';
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

// SpellBar surfaces one icon per cast_spell choice the active PC has
// available — including buffs (Bless), heals (Cure Wounds, Healing
// Word), utility (Misty Step), AND single-target offensive (Sacred
// Flame, Guiding Bolt). Dedup'd by spellId at the lowest available
// slot; upcast variants stay in the text list. Multi-target focus-
// fire / spread variants (Magic Missile, Eldritch Blast L5+) also
// stay in the text list — their shape (multiple distinct dart/beam
// targets) doesn't collapse to one icon button.
function selectSpellBarChoices(choices: GameChoice[]): GameChoice[] {
  const single = choices.filter((c) => {
    if (c.kind !== 'cast_spell') return false;
    const action = c.action as { targetEnemyIds?: string[] };
    // Drop only the multi-target variants — everything else (offensive
    // single-target, buff, heal, utility) gets a button.
    return !Array.isArray(action.targetEnemyIds);
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
  // Picker choices (Bless allies, Bane enemies) open their own target dialog —
  // they're not bound to the EnemySelector's single selection, so never hide
  // them. Their `targetEnemyId` is only a placeholder for the auto-pick path.
  if (c.pickTargets) return true;
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
  const [inviteOpen, setInviteOpen] = useState(false);
  // CharId of the PC whose LevelUpDialog is open. Null = dialog closed.
  // The PC must meet the XP threshold + be out of combat; the rail won't
  // surface the trigger button otherwise. The dialog still re-checks
  // prereqs per-class so a stat change between trigger + selection
  // doesn't sneak through.
  const [levelUpCharId, setLevelUpCharId] = useState<string | null>(null);
  // Which choice is currently hovered — used by GridCombatView to render an
  // AoE preview tint over the cells a hovered spell would affect.
  const [hoveredChoice, setHoveredChoice] = useState<GameChoice | null>(null);
  // Single-target enemy selection drives the choice list filter: target-
  // bearing choices (Attack, Cast Guiding Bolt, Grapple, etc.) are shown
  // only for the selected enemy, collapsing N target variants into 1
  // button per action. Defaults to the first living enemy; resets when
  // the enemy roster changes.
  const [selectedEnemyId, setSelectedEnemyId] = useState<string | null>(null);
  // A cast choice waiting on a target pick (GameChoice.pickTargets) — e.g.
  // Bless. The TargetPickerDialog collects the targets and re-sends the action.
  const [targetPicker, setTargetPicker] = useState<GameChoice | null>(null);
  // A cast choice waiting on an option pick (GameChoice.pickOption) — e.g.
  // Polymorph's beast form, Greater Restoration's effect.
  const [optionPicker, setOptionPicker] = useState<GameChoice | null>(null);
  const narrativeRef = useRef<HTMLDivElement>(null);

  const {
    session,
    gameState,
    seed,
    campaignMeta,
    choices,
    history,
    loading,
    escaped,
    roomLog,
    participantsVersion,
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

  // Choice dispatch with picker interception: a choice carrying a `pickTargets`
  // hint (Bless/Bane) opens the target dialog, `pickOption` (Polymorph / Greater
  // Restoration) the option dialog; everything else casts directly.
  const chooseWithPicker = useCallback(
    (c: GameChoice) => {
      if (c.pickTargets) setTargetPicker(c);
      else if (c.pickOption) setOptionPicker(c);
      else handleChoice(c);
    },
    [handleChoice]
  );

  useEffect(() => {
    applyTheme(ctx.theme);
  }, [ctx]);

  // Keep the enemy selector pointed at a valid target. When the roster
  // changes (combat starts/ends, an enemy dies, the party moves rooms),
  // re-anchor on the first living enemy; clear when there's nothing to
  // target. Without this the selector can stick on a dead enemy id and
  // every targeted action becomes a no-op.
  useEffect(() => {
    const livingEnemies = gameState?.entities?.filter((e) => e.isEnemy && e.hp > 0) ?? [];
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
      .then(async (me) => {
        setUser(me);
        // Multiplayer invite handler: ?join=<token> means a friend
        // clicked our shareable link. POST the token to /session/join
        // (adds them to session_participants) and resume the returned
        // session. The token is stripped from the URL on success so
        // a refresh doesn't re-join (idempotent at the server too,
        // but cleaner URL).
        const params = new URLSearchParams(window.location.search);
        const joinToken = params.get('join');
        if (joinToken) {
          try {
            const { session_id } = await api.joinSession(joinToken);
            window.history.replaceState(null, '', `/${session_id}`);
            await handleResumeSession(session_id);
            setView('game');
            return;
          } catch {
            // Invalid / expired token — fall through to the normal
            // session-list view so the user can see they're logged
            // in even if the link didn't work.
            window.history.replaceState(null, '', '/');
            return loadSessions();
          }
        }
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
      if (!isNaN(idx) && idx >= 1 && idx <= numbered.length) chooseWithPicker(numbered[idx - 1]);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
    // handleChoice closes over `history` from the useGame hook; without
    // it in the dep list, a stale closure would dispatch with frozen
    // history after the player takes several non-keyboard actions.
    // Re-registering the listener on each render is cheap (one DOM op).
  }, [view, loading, escaped, gameState, choices, inventoryOpen, mapOpen, chooseWithPicker]);

  async function wrappedResumeSession(id: string) {
    await handleResumeSession(id);
    setView('game');
  }

  async function wrappedNewGame(characters: CharacterInput[], contextId: string) {
    await handleNewGame(characters, contextId);
    setView('game');
  }

  function startNewAdventure() {
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
            // Count only DISCOVERED quests (those with a progress entry) — the
            // log hides quests the player hasn't found yet.
            const discovered = gameState.quest_progress?.length ?? 0;
            contextTabs.push({
              id: 'quests',
              label: `QUESTS (${discovered})`,
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
              id: 'adventure-log',
              label: 'ADVENTURE LOG',
              render: () => (
                <AdventureLogPanel
                  history={history}
                  worldName={worldName}
                  state={gameState ?? undefined}
                  seed={seed ?? undefined}
                  campaignMeta={campaignMeta}
                />
              ),
            });
          }
          return (
            <div className={styles.page}>
              {/* Skip link: hidden until keyboard-focused, jumps past the
                  header + party rail and lands on the action area. WCAG
                  2.1 2.4.1 (Bypass Blocks). */}
              <a href="#main-content" className={styles.skipLink}>
                Skip to main content
              </a>
              <header className={styles.header}>
                <div className={styles.headerRow}>
                  <div className={styles.headerLeft}>
                    {activeChar?.portrait_url && (
                      <img
                        src={activeChar.portrait_url}
                        alt={`${activeChar.name}'s portrait`}
                        className={styles.charPortrait}
                      />
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
                      {gameState && !escaped && !allDead && (
                        <button
                          className={styles.signOutBtn}
                          onClick={() => setInviteOpen(true)}
                          title="Share an invite link so friends can join"
                          aria-label="Invite players"
                          data-testid="invite-btn"
                        >
                          INVITE
                        </button>
                      )}
                      {gameState && !escaped && !allDead && (
                        <button
                          className={styles.signOutBtn}
                          onClick={() => {
                            if (confirm('Resign from this adventure and start over?'))
                              startNewAdventure();
                          }}
                          title="Resign from this adventure (returns to session list)"
                          aria-label="Resign from current adventure"
                        >
                          RESIGN
                        </button>
                      )}
                      <button className={styles.signOutBtn} onClick={handleLogout}>
                        SIGN OUT
                      </button>
                    </div>
                  )}
                </div>
              </header>

              <main className={styles.gameLayout} id="main-content">
                {gameState && (
                  <PartyRail
                    state={gameState}
                    activeCharId={gameState.active_character_id ?? ''}
                    ctx={ctx}
                    seed={seed}
                    inCombat={!!gameState.combat_active}
                    onSetActive={(charId) => {
                      const target = gameState.characters.find((c) => c.id === charId);
                      handleChoice({
                        label: `Hand the lead to ${target?.name ?? charId}`,
                        action: { type: 'set_active_character', characterId: charId },
                      });
                    }}
                    onLevelUp={(charId) => setLevelUpCharId(charId)}
                  />
                )}

                <div className={styles.gameMain}>
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

                  {(() => {
                    // Turn ownership — does the current user own the active
                    // character (or one of the eligible reaction PCs)? Solo
                    // mode: every PC's owner_user_id === user.id, so this
                    // is always true. Multi: false when it's a friend's
                    // turn, and we render <WaitingForPlayer /> instead.
                    const pending = gameState?.pending_reaction;
                    const isMyTurn = (() => {
                      if (!gameState || !user) return true;
                      if (pending && pending.eligibleCharIds.length > 0) {
                        return pending.eligibleCharIds.some((cid) => {
                          const c = gameState.characters.find((ch) => ch.id === cid);
                          return !c?.owner_user_id || c.owner_user_id === user.id;
                        });
                      }
                      const active = gameState.characters.find(
                        (c) => c.id === gameState.active_character_id
                      );
                      return !active?.owner_user_id || active.owner_user_id === user.id;
                    })();
                    const waitingName = (() => {
                      if (isMyTurn || !gameState) return null;
                      if (pending && pending.eligibleCharIds.length > 0) {
                        const c = gameState.characters.find((ch) =>
                          pending.eligibleCharIds.includes(ch.id)
                        );
                        return c?.name ?? 'another player';
                      }
                      const active = gameState.characters.find(
                        (c) => c.id === gameState.active_character_id
                      );
                      return active?.name ?? 'another player';
                    })();
                    const actionPanel =
                      !isMyTurn && waitingName ? (
                        <WaitingForPlayer
                          name={waitingName}
                          reason={
                            pending && pending.eligibleCharIds.length > 0
                              ? 'to resolve a reaction'
                              : 'to finish their turn'
                          }
                        />
                      ) : !loading && escaped ? (
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
                            <span aria-hidden="true">★ </span>ADVENTURE COMPLETE
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
                            onClick={startNewAdventure}
                          >
                            START NEW ADVENTURE
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
                            onClick={startNewAdventure}
                          >
                            START NEW ADVENTURE
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
                                .filter((c) => !spellBarSet.has(c))
                                // Dialogue choices render in the ConversationPanel, not the list.
                                .filter((c) => c.kind !== 'conversation');
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
                                          {(() => {
                                            // Default + Combat actions live in one
                                            // bordered toolbar with a thicker vertical
                                            // separator between the two groups. Each
                                            // group self-hides when it has no choices;
                                            // the separator only renders when BOTH
                                            // groups have something to show.
                                            const defaultChoices = choices.filter((c) =>
                                              DEFAULT_ACTION_KINDS.has(c.kind ?? '')
                                            );
                                            const combatChoices = choices
                                              .filter((c) => COMBAT_ACTION_KINDS.has(c.kind ?? ''))
                                              .filter((c) => filterByTarget(c, selectedEnemyId));
                                            const hasDefault = defaultChoices.length > 0;
                                            const hasCombat = combatChoices.length > 0;
                                            if (!hasDefault && !hasCombat) return null;
                                            return (
                                              <div
                                                className={styles.combinedActionBar}
                                                role="group"
                                                aria-label="Combat and default actions"
                                                data-testid="combined-action-bar"
                                              >
                                                <CombatActionBar
                                                  choices={combatChoices}
                                                  onChoose={handleChoice}
                                                />
                                                {hasDefault && hasCombat && (
                                                  <span
                                                    className={styles.combinedActionBarSep}
                                                    aria-hidden="true"
                                                  />
                                                )}
                                                <DefaultActionBar
                                                  choices={defaultChoices}
                                                  onChoose={handleChoice}
                                                />
                                              </div>
                                            );
                                          })()}
                                          {(() => {
                                            // Spells + class abilities share one
                                            // bordered toolbar with a thicker
                                            // separator between the groups, parallel
                                            // to the Combat/Default action toolbar.
                                            // Spells go first (left), abilities second.
                                            // Lives inside combatControlsCol so it
                                            // sits alongside the other toolbars
                                            // rather than below the MoveDPad.
                                            const hasSpells = spellBarChoices.length > 0;
                                            const hasAbilities = classFeatureChoices.length > 0;
                                            if (!hasSpells && !hasAbilities) return null;
                                            return (
                                              <div
                                                className={styles.combinedActionBar}
                                                role="group"
                                                aria-label="Spells and class abilities"
                                                data-testid="combined-spell-ability-bar"
                                              >
                                                <SpellBar
                                                  choices={spellBarChoices}
                                                  onChoose={chooseWithPicker}
                                                />
                                                {hasSpells && hasAbilities && (
                                                  <span
                                                    className={styles.combinedActionBarSep}
                                                    aria-hidden="true"
                                                  />
                                                )}
                                                <ClassAbilityBar
                                                  choices={classFeatureChoices}
                                                  onChoose={handleChoice}
                                                />
                                              </div>
                                            );
                                          })()}
                                        </div>
                                      </div>
                                    </section>
                                  )}
                                  <ul
                                    className={styles.choices}
                                    data-testid="choices-list"
                                    aria-label="Available actions"
                                    style={{ listStyle: 'none', margin: 0, padding: 0 }}
                                  >
                                    {textListChoices.map((c, i) => {
                                      // Choice is dimmed when the backend
                                      // stamped a seenKey and that key has
                                      // already been recorded this adventure.
                                      // Player can still click — it's a hint,
                                      // not a lockout.
                                      const seen =
                                        !!c.seenKey &&
                                        (gameState?.seen_choices ?? []).includes(c.seenKey);
                                      return (
                                        <li key={i} style={{ listStyle: 'none' }}>
                                          <button
                                            data-testid="choice-btn"
                                            data-action-type={c.action.type}
                                            data-seen={seen ? 'true' : undefined}
                                            className={`${styles.choiceBtn} ${seen ? styles.choiceBtnSeen : ''}`}
                                            onClick={() => chooseWithPicker(c)}
                                            onMouseEnter={() => c.aoePreview && setHoveredChoice(c)}
                                            onMouseLeave={() => setHoveredChoice(null)}
                                            aria-keyshortcuts={i < 9 ? `${i + 1}` : undefined}
                                            aria-label={
                                              seen ? `${c.label} (already used)` : undefined
                                            }
                                          >
                                            <span aria-hidden="true">[{i + 1}] </span>
                                            {c.label}
                                          </button>
                                        </li>
                                      );
                                    })}
                                  </ul>
                                </>
                              );
                            })()}
                        </>
                      );
                    // Active conversation: the dedicated dialogue panel replaces the
                    // normal action area (only dialogue options + Back/End show).
                    if (
                      !gameState?.combat_active &&
                      gameState?.active_conversation &&
                      gameState.active_conversation.roomId === gameState.current_room &&
                      seed
                    ) {
                      const conv = gameState.active_conversation;
                      return (
                        <ConversationPanel
                          npcName={seed.npcs?.[conv.roomId]?.name ?? 'Someone'}
                          prompt={conv.prompt}
                          choices={choices.filter((c) => c.kind === 'conversation')}
                          seenChoices={gameState.seen_choices ?? []}
                          onChoose={handleChoice}
                        />
                      );
                    }
                    // Out-of-combat exploration on the 3-level grid map: a single
                    // party marker the player clicks to travel (marker_move). Local
                    // combat falls through to GridCombatView below (PC tokens).
                    if (!gameState?.combat_active && gameState?.map_level && seed) {
                      const grid = activeGrid(seed, gameState);
                      if (grid && gameState.marker_pos) {
                        return (
                          <div className={styles.combatRow}>
                            <GridMapView
                              grid={grid}
                              markerPos={gameState.marker_pos}
                              // A surfaced Attack choice means a hostile is here
                              // pre-combat — show the red enemy marker.
                              enemyPresent={choices.some((c) => c.kind === 'attack')}
                              onMarkerMove={(to) =>
                                handleChoice({
                                  label: `Travel to (${to.x},${to.y})`,
                                  action: { type: 'marker_move', to },
                                })
                              }
                            />
                            <div className={styles.combatActionCol}>{actionPanel}</div>
                          </div>
                        );
                      }
                    }
                    if (
                      gameState?.combat_active &&
                      gameState.entities &&
                      gameState.entities.length > 0 &&
                      seed
                    ) {
                      return (
                        <div className={styles.combatRow}>
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
                          <div className={styles.combatActionCol}>{actionPanel}</div>
                        </div>
                      );
                    }
                    return actionPanel;
                  })()}
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

              {levelUpCharId &&
                gameState &&
                (() => {
                  const target = gameState.characters.find((c) => c.id === levelUpCharId);
                  if (!target) return null;
                  return (
                    <LevelUpDialog
                      char={target}
                      onClose={() => setLevelUpCharId(null)}
                      onChoose={(className) => {
                        handleChoice({
                          label: `${target.name} levels up: ${className.charAt(0).toUpperCase() + className.slice(1)}`,
                          action: { type: 'level_up_class', className },
                        });
                      }}
                    />
                  );
                })()}

              {targetPicker &&
                targetPicker.pickTargets &&
                gameState &&
                (() => {
                  const { side, max } = targetPicker.pickTargets;
                  let candidates;
                  if (side === 'ally') {
                    candidates = gameState.characters
                      .filter((c) => !c.dead)
                      .map((c) => ({
                        id: c.id,
                        name: c.name,
                        sub: `${c.character_class} · HP ${c.hp}/${c.max_hp}`,
                      }));
                  } else {
                    const names = new Map<string, string>();
                    for (const e of seed?.enemies?.[gameState.current_room] ?? [])
                      names.set(e.id, e.name);
                    candidates = (gameState.entities ?? [])
                      .filter((e) => e.isEnemy && e.hp > 0)
                      .map((e) => ({
                        id: e.id,
                        name: names.get(e.id) ?? 'Enemy',
                        sub: `HP ${e.hp}/${e.maxHp}`,
                      }));
                  }
                  return (
                    <TargetPickerDialog
                      title={targetPicker.label.replace(/\s*\(.*$/, '')}
                      prompt={
                        side === 'ally' ? 'Choose allies to affect' : 'Choose enemies to affect'
                      }
                      candidates={candidates}
                      max={max}
                      onCancel={() => setTargetPicker(null)}
                      onConfirm={(ids) => {
                        handleChoice({
                          ...targetPicker,
                          action: {
                            ...targetPicker.action,
                            ...(side === 'ally' ? { targetCharIds: ids } : { targetEnemyIds: ids }),
                          },
                        });
                        setTargetPicker(null);
                      }}
                    />
                  );
                })()}

              {optionPicker &&
                optionPicker.pickOption &&
                (() => {
                  const { param, title, options } = optionPicker.pickOption;
                  return (
                    <OptionPickerDialog
                      title={title}
                      options={options}
                      onCancel={() => setOptionPicker(null)}
                      onConfirm={(id) => {
                        handleChoice({
                          ...optionPicker,
                          action: { ...optionPicker.action, [param]: id },
                        });
                        setOptionPicker(null);
                      }}
                    />
                  );
                })()}

              {inviteOpen && session && (
                <InviteDialog
                  sessionId={session.id}
                  inviteToken={session.invite_token ?? null}
                  isHost={!session.user_id || session.user_id === user?.id}
                  state={gameState}
                  participantsVersion={participantsVersion}
                  onClose={() => setInviteOpen(false)}
                  onLeave={() => {
                    // Voluntary leave for a non-host. Server already
                    // transferred their PCs to the host; here we just
                    // tear down local game state and surface the
                    // session list.
                    setInviteOpen(false);
                    resetGame();
                    window.history.pushState(null, '', '/');
                    loadSessions().then(() => setView('sessions'));
                  }}
                />
              )}
            </div>
          );
        })()}
    </>
  );
}
