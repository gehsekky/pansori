import type {
  CampaignMeta,
  GameChoice,
  GameState,
  Seed,
  Session,
  StructuredAction,
} from '../types.ts';
import { type CharacterInput, api } from '../lib/api.ts';
import { type Socket, io as socketIO } from 'socket.io-client';
import { useEffect, useRef, useState } from 'react';

type HistoryEntry = { role: 'user' | 'assistant'; content: string };

// Rebuild the in-memory adventure-log transcript from the persisted `run_log`
// so the Adventure Log survives reloads / resumes (the transcript itself isn't
// persisted — it's a client-side mirror). Each run_log entry becomes a user
// (action) + assistant (narrative) pair, matching the interleaved shape
// AdventureLogPanel expects ([user_0, assistant_0, user_1, ...]).
export function historyFromRunLog(state: GameState): HistoryEntry[] {
  return (state.run_log ?? []).flatMap((e) => [
    { role: 'user' as const, content: e.action },
    { role: 'assistant' as const, content: e.narrative },
  ]);
}

export interface UseGameReturn {
  session: Session | null;
  gameState: GameState | null;
  seed: Seed | null;
  campaignMeta: CampaignMeta | null;
  choices: GameChoice[];
  history: HistoryEntry[];
  loading: boolean;
  escaped: boolean;
  roomLog: string[];
  // Bumps every time the server emits a `participants` event (join /
  // leave / ownership-changed). InviteDialog uses it as a useEffect
  // dep so it can re-fetch the participants list without polling.
  participantsVersion: number;
  // The game-start narration (the first run_log entry — gameStart pool pick
  // + act opening + starter quests), set ONLY by handleNewGame so the
  // narrative modal opens once per new adventure, not on resume/reload.
  // The same text stays in the narrative pane; this is presentation only.
  introText: string | null;
  dismissIntro: () => void;

  handleNewGame: (characters: CharacterInput[], contextId: string) => Promise<void>;
  handleResumeSession: (id: string) => Promise<void>;
  handleEquip: (itemId: string, characterId: string) => Promise<void>;
  handleTransfer: (itemInstanceId: string, fromCharId: string, toCharId: string) => Promise<void>;
  handleDrop: (itemInstanceId: string, charId: string) => Promise<void>;
  handleChoice: (c: GameChoice) => void;
  resetGame: () => void;
}

export function useGame(): UseGameReturn {
  const [session, setSession] = useState<Session | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [seed, setSeed] = useState<Seed | null>(null);
  const [campaignMeta, setCampaignMeta] = useState<CampaignMeta | null>(null);
  const [choices, setChoices] = useState<GameChoice[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [escaped, setEscaped] = useState(false);
  const [roomLog, setRoomLog] = useState<string[]>([]);
  const [introText, setIntroText] = useState<string | null>(null);
  const [participantsVersion, setParticipantsVersion] = useState(0);
  // Local mirror of game_sessions.turn_seq — included with every
  // takeAction so the server can detect stale writes (multiplayer
  // race detection). Updated from REST responses, session loads,
  // and Socket.IO `state` broadcasts.
  const [turnSeq, setTurnSeq] = useState<number | undefined>(undefined);

  // Socket.IO subscription per session. When session.id changes (new
  // session created, resumed, or reset), tear down the previous socket
  // and open a fresh one. Server emits `state` after every successful
  // takeAction; we replace local state on receipt. The participant who
  // initiated the action gets the broadcast too — same data as the
  // REST response, applied idempotently (setState with the same shape
  // is a no-op render).
  const socketRef = useRef<Socket | null>(null);
  useEffect(() => {
    if (!session?.id) return;
    // Default to same-origin in dev (Vite proxies WS); honor an explicit
    // VITE_SOCKET_URL override for staging/production where the API is
    // on a different host than the SPA.
    const url = import.meta.env.VITE_SOCKET_URL ?? window.location.origin;
    const socket = socketIO(url, {
      withCredentials: true,
      // Long-poll fallback ensures the socket works behind tighter
      // proxies that drop the WebSocket upgrade; cost is one extra
      // round-trip on first connection.
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;
    socket.on('connect', () => {
      socket.emit('join-session', session.id);
    });
    socket.on('state', (payload: { state: GameState; narrative?: string; turn_seq?: number }) => {
      // The server emits the full post-action state. Replace
      // wholesale — partial diffing isn't worth the complexity for
      // the once-per-action cadence we get from D&D rounds.
      setGameState(payload.state);
      setChoices(payload.state.last_choices ?? []);
      setRoomLog(payload.state.room_log ?? []);
      if (payload.state.flags?._rule_escape) setEscaped(true);
      if (typeof payload.turn_seq === 'number') setTurnSeq(payload.turn_seq);
    });
    // Participants events (joined / left / ownership-changed). We don't
    // care about the payload shape here — consumers (InviteDialog) react
    // to the version bump and re-fetch listParticipants for fresh data.
    socket.on('participants', () => {
      setParticipantsVersion((v) => v + 1);
    });
    // The campaign was edited in the creator. The server has already
    // re-resolved this session's seed against the live campaign, so re-fetch
    // and adopt ONLY the seed + campaign meta (the live map, theme, room text,
    // and not-yet-reached encounters) — the game state is unchanged, so we
    // leave it (and the player's in-progress turn) untouched.
    socket.on('campaign-updated', async () => {
      try {
        const s = await api.getSessionById(session.id);
        setSeed(s.seed);
        setCampaignMeta(s.campaignMeta ?? null);
      } catch (e) {
        console.error('campaign-updated refresh failed', e);
      }
    });
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [session?.id]);

  async function handleNewGame(characters: CharacterInput[], contextId: string) {
    setLoading(true);
    try {
      const result = await api.newSession(characters, contextId);
      setSession(result.session);
      setGameState(result.state);
      setSeed(result.seed);
      setCampaignMeta(result.campaignMeta ?? null);
      setHistory(historyFromRunLog(result.state));
      setEscaped(false);
      setRoomLog(result.state.room_log || []);
      setChoices(result.state.last_choices || []);
      setTurnSeq(result.session.turn_seq ?? 0);
      setIntroText(result.state.run_log?.[0]?.narrative ?? null);
      window.history.pushState(null, '', `/game/${result.session.id}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleResumeSession(id: string) {
    setLoading(true);
    try {
      const s = await api.getSessionById(id);
      setSession(s);
      setGameState(s.state);
      setSeed(s.seed);
      setCampaignMeta(s.campaignMeta ?? null);
      setHistory(historyFromRunLog(s.state));
      setRoomLog(s.state.room_log || []);
      setEscaped(s.status === 'escaped');
      setChoices(s.state.last_choices || []);
      setTurnSeq(s.turn_seq ?? 0);
      window.history.pushState(null, '', `/game/${id}`);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function act(action: StructuredAction, label: string, currentHistory: HistoryEntry[]) {
    const sid = session?.id;
    if (!sid) return;
    setLoading(true);
    try {
      const result = await api.takeAction(sid, action, currentHistory, turnSeq);
      const newHistory: HistoryEntry[] = [
        ...currentHistory,
        { role: 'user', content: label },
        { role: 'assistant', content: result.narrative },
      ];
      setHistory(newHistory);
      setChoices(result.choices || []);
      setGameState(result.newState);
      setRoomLog(result.newState.room_log || []);
      // Adopt the returned seed when present — a marker_move encounter
      // materializes the rolled enemy into the seed, and the InitiativeStrip
      // resolves enemy names from it (else the ambusher renders as "Enemy").
      if (result.seed) setSeed(result.seed);
      if (result.escaped) setEscaped(true);
      if (typeof result.turn_seq === 'number') setTurnSeq(result.turn_seq);
    } catch (e) {
      // 409 Conflict from race detection — another participant acted
      // first. Refetch the session to resync state instead of
      // surfacing a generic error. The Socket.IO 'state' broadcast
      // from the winning action SHOULD have already updated local
      // state, but refetching here is the belt-and-suspenders safety.
      const err = e as { error?: string; turn_seq?: number };
      if (err?.error?.toLowerCase().includes('out of sync')) {
        setRoomLog((prev) => [...prev, `⚠ ${err.error}`]);
        if (typeof err.turn_seq === 'number') setTurnSeq(err.turn_seq);
        // Resume to pick up fresh state; safe even when the broadcast
        // already arrived (idempotent setState).
        await handleResumeSession(sid);
      } else {
        setRoomLog((prev) => [
          ...prev,
          'Communications array offline... (error contacting server)',
        ]);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleEquip(itemId: string, characterId: string) {
    if (!session) return;
    try {
      const result = await api.equipItem(session.id, itemId, characterId);
      setGameState(result.newState);
    } catch (e) {
      const err = e as { error?: string };
      if (err?.error) setRoomLog((prev) => [...prev, `⚠ ${err.error}`]);
    }
  }

  async function handleTransfer(itemInstanceId: string, fromCharId: string, toCharId: string) {
    if (!session) return;
    try {
      const result = await api.transferItem(session.id, itemInstanceId, fromCharId, toCharId);
      setGameState(result.newState);
    } catch (e) {
      const err = e as { error?: string };
      if (err?.error) setRoomLog((prev) => [...prev, `⚠ ${err.error}`]);
    }
  }

  async function handleDrop(itemInstanceId: string, charId: string) {
    if (!session) return;
    try {
      const result = await api.dropItem(session.id, itemInstanceId, charId);
      setGameState(result.newState);
    } catch (e) {
      const err = e as { error?: string };
      if (err?.error) setRoomLog((prev) => [...prev, `⚠ ${err.error}`]);
    }
  }

  function handleChoice(c: GameChoice) {
    act(c.action, c.label, history);
  }

  function resetGame() {
    setSession(null);
    setGameState(null);
    setSeed(null);
    setCampaignMeta(null);
    setChoices([]);
    setHistory([]);
    setEscaped(false);
    setRoomLog([]);
    setIntroText(null);
  }

  return {
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
    introText,
    dismissIntro: () => setIntroText(null),
    handleNewGame,
    handleResumeSession,
    handleEquip,
    handleTransfer,
    handleDrop,
    handleChoice,
    resetGame,
  };
}
