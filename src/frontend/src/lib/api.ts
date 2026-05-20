import type {
  CampaignMeta,
  GameChoice,
  GameState,
  Seed,
  Session,
  SessionSummary,
  StructuredAction,
} from '../types.js';

async function req<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
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

export interface AuthProvider {
  id: string; // 'google', 'discord', etc.
  label: string; // human-readable button text
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
  campaignMeta?: CampaignMeta | null;
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
  // PHB: Cleric/Sorcerer/Warlock pick subclass at level 1 — required at
  // creation. Other classes pick later (L2 Wizard/Druid, L3 the rest) so
  // this stays optional and is supplied via the in-game choice for them.
  subclass?: string;
  // 2024 PHB Species (formerly "race"). Optional — engine defaults to
  // Human when omitted.
  species?: string;
};

export const api = {
  getMe: () => req<AuthUser>('/auth/me'),

  listProviders: () => req<AuthProvider[]>('/auth/providers'),

  logout: () => req<{ ok: boolean }>('/auth/logout', { method: 'POST' }),

  listSessions: () => req<SessionSummary[]>('/game/sessions'),

  getSessionById: (id: string) =>
    req<Session & { state: GameState; seed: Seed; campaignMeta?: CampaignMeta | null }>(
      `/game/session/${id}`
    ),

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

  transferItem: (
    sessionId: string,
    item_instance_id: string,
    from_character_id: string,
    to_character_id: string
  ) =>
    req<{ newState: GameState }>(`/game/session/${sessionId}/transfer`, {
      method: 'POST',
      body: JSON.stringify({ item_instance_id, from_character_id, to_character_id }),
    }),

  dropItem: (sessionId: string, item_instance_id: string, character_id: string) =>
    req<{ newState: GameState }>(`/game/session/${sessionId}/drop`, {
      method: 'POST',
      body: JSON.stringify({ item_instance_id, character_id }),
    }),

  deleteSession: (id: string) => req<{ ok: boolean }>(`/game/session/${id}`, { method: 'DELETE' }),

  clearCompleted: () =>
    req<{ ok: boolean; deleted: number }>('/game/sessions/completed', { method: 'DELETE' }),
};
