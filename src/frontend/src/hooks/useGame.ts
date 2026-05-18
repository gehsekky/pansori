import { type CharacterInput, api } from '../lib/api.ts';
import type {
  CampaignMeta,
  GameChoice,
  GameState,
  Seed,
  Session,
  StructuredAction,
} from '../types.ts';
import { useState } from 'react';

type HistoryEntry = { role: 'user' | 'assistant'; content: string };

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

  handleNewGame: (characters: CharacterInput[], contextId: string) => Promise<void>;
  handleResumeSession: (id: string) => Promise<void>;
  handleEquip: (itemId: string, characterId: string) => Promise<void>;
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

  async function handleNewGame(characters: CharacterInput[], contextId: string) {
    setLoading(true);
    try {
      const result = await api.newSession(characters, contextId);
      setSession(result.session);
      setGameState(result.state);
      setSeed(result.seed);
      setCampaignMeta(result.campaignMeta ?? null);
      setHistory([]);
      setEscaped(false);
      setRoomLog(result.state.room_log || []);
      setChoices(result.state.last_choices || []);
      window.history.pushState(null, '', `/${result.session.id}`);
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
      setRoomLog(s.state.room_log || []);
      setEscaped(s.status === 'escaped');
      setChoices(s.state.last_choices || []);
      window.history.pushState(null, '', `/${id}`);
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
      const result = await api.takeAction(sid, action, currentHistory);
      const newHistory: HistoryEntry[] = [
        ...currentHistory,
        { role: 'user', content: label },
        { role: 'assistant', content: result.narrative },
      ];
      setHistory(newHistory);
      setChoices(result.choices || []);
      setGameState(result.newState);
      setRoomLog(result.newState.room_log || []);
      if (result.escaped) setEscaped(true);
    } catch {
      setRoomLog((prev) => [...prev, 'Communications array offline... (error contacting server)']);
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
    handleNewGame,
    handleResumeSession,
    handleEquip,
    handleChoice,
    resetGame,
  };
}
