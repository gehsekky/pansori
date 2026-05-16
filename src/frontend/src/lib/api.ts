import type { GameState, Seed, Session } from '../types.js';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

async function req<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...opts.headers },
  });
  const data = await res.json();
  if (!res.ok) throw data;
  return data as T;
}

export interface ActionResult {
  narrative: string;
  choices:   string[];
  newState:  GameState;
  escaped:   boolean;
  dead:      boolean;
}

export interface NewSessionResult {
  session: Session;
  state:   GameState;
  seed:    Seed;
}

export const api = {
  getSessionById: (id: string) =>
    req<Session & { state: GameState; seed: Seed }>(`/game/session/${id}`),

  newSession: (character_name: string, character_class: string, context_id: string) =>
    req<NewSessionResult>('/game/session/new', {
      method: 'POST',
      body: JSON.stringify({ character_name, character_class, context_id }),
    }),

  takeAction: (sessionId: string, action: string, history: unknown[]) =>
    req<ActionResult>(`/game/session/${sessionId}/action`, {
      method: 'POST',
      body: JSON.stringify({ action, history }),
    }),

  equipItem: (sessionId: string, item_id: string) =>
    req<{ newState: GameState }>(`/game/session/${sessionId}/equip`, {
      method: 'POST',
      body: JSON.stringify({ item_id }),
    }),
};
