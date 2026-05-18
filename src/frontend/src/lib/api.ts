import type {
  GameChoice,
  GameState,
  Seed,
  Session,
  SessionSummary,
  StructuredAction,
} from '../types.js';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

async function req<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    ...opts,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...opts.headers },
  });
  const data = await res.json();
  if (!res.ok) throw data;
  return data as T;
}

export interface AuthUser {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
}

export interface ActionResult {
  narrative: string;
  choices: GameChoice[];
  newState: GameState;
  escaped: boolean;
  dead: boolean;
}

export interface NewSessionResult {
  session: Session;
  state: GameState;
  seed: Seed;
}

export type StatBlock = {
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
};

export type Background = {
  id: string;
  name: string;
  desc: string;
  skillProficiencies: string[];
  toolProficiency: string | null;
  feature: string;
  featureDesc: string;
};

export type CharacterInput = {
  name: string;
  character_class: string;
  background_id?: string;
  stats?: StatBlock;
  portrait_url?: string;
};

export const api = {
  getMe: () => req<AuthUser>('/auth/me'),

  logout: () => req<{ ok: boolean }>('/auth/logout', { method: 'POST' }),

  listSessions: () => req<SessionSummary[]>('/game/sessions'),

  getSessionById: (id: string) =>
    req<Session & { state: GameState; seed: Seed }>(`/game/session/${id}`),

  newSession: (characters: CharacterInput[], context_id: string) =>
    req<NewSessionResult>('/game/session/new', {
      method: 'POST',
      body: JSON.stringify({ characters, context_id }),
    }),

  takeAction: (sessionId: string, action: StructuredAction, history: unknown[]) =>
    req<ActionResult>(`/game/session/${sessionId}/action`, {
      method: 'POST',
      body: JSON.stringify({ action, history }),
    }),

  equipItem: (sessionId: string, item_id: string, character_id: string) =>
    req<{ newState: GameState }>(`/game/session/${sessionId}/equip`, {
      method: 'POST',
      body: JSON.stringify({ item_id, character_id }),
    }),

  deleteSession: (id: string) => req<{ ok: boolean }>(`/game/session/${id}`, { method: 'DELETE' }),

  clearCompleted: () =>
    req<{ ok: boolean; deleted: number }>('/game/sessions/completed', { method: 'DELETE' }),
};
