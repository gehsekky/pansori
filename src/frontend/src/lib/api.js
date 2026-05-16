const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

async function req(path, opts = {}) {
  const res = await fetch(`${BASE}/api${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...opts.headers },
  });
  const data = await res.json();
  if (!res.ok) throw data;
  return data;
}

export const api = {
  getSessionById: (id) => req(`/game/session/${id}`),

  newSession: (character_name, character_class, context_id) =>
    req('/game/session/new', { method: 'POST', body: JSON.stringify({ character_name, character_class, context_id }) }),

  takeAction: (sessionId, action, history) =>
    req(`/game/session/${sessionId}/action`, {
      method: 'POST',
      body: JSON.stringify({ action, history }),
    }),

  equipItem: (sessionId, item_id) =>
    req(`/game/session/${sessionId}/equip`, {
      method: 'POST',
      body: JSON.stringify({ item_id }),
    }),
};
