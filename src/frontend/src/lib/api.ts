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
  // Site admin — will gate the campaign admin section. Mirrors AppUser
  // on the backend; flipped manually in the DB, never via the UI.
  is_admin: boolean;
}

export interface AuthProvider {
  id: string; // 'google', 'discord', etc.
  label: string; // human-readable button text
}

// ─── Campaign admin (owners/editors/players) ─────────────────────────────────
// Mirrors routes/campaigns.ts on the backend. Roles are a three-tier
// hierarchy (owner ⊃ editor ⊃ player — players can see/play a private
// campaign but not edit); site admins resolve to 'owner' everywhere.

export type CampaignRole = 'owner' | 'editor' | 'player';
export type CampaignVisibility = 'global' | 'private';

export interface CampaignListing {
  id: string;
  name: string;
  // 'global' = visible to every user; 'private' = members only. Only site
  // admins can change this.
  visibility: CampaignVisibility;
  my_role: CampaignRole | null;
}

export interface CampaignMember {
  user_id: string;
  role: CampaignRole;
  added_at: string;
  display_name: string;
  email: string;
  avatar_url: string | null;
}

// Content sections live DB-first with code supplement: 'db' = the DB
// version is what the engine serves; 'code' = falls through to the
// campaignData files; 'none' = the section exists nowhere yet.
export type CampaignSectionSource = 'db' | 'code' | 'none';

export interface CampaignSectionInfo {
  section: string;
  source: CampaignSectionSource;
}

export interface CampaignSectionValue extends CampaignSectionInfo {
  value: unknown;
}

export interface ActionResult {
  narrative: string;
  choices: GameChoice[];
  newState: GameState;
  escaped: boolean;
  dead: boolean;
  // Multiplayer race detection: the new server-side turn sequence number
  // after this action was applied. Clients send this back on their next
  // takeAction so the server can reject stale-state writes.
  turn_seq?: number;
  // The (possibly mutated) seed. Most actions don't change it, but a
  // wilderness encounter (marker_move) materializes the rolled enemy into
  // `seed.enemies[__encounter__]` — the client must adopt the returned seed so
  // the new combatant resolves its name (else the InitiativeStrip shows
  // "Enemy"). Omitted ⇒ unchanged.
  seed?: Seed;
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
  // No subclass at creation: the 2024 SRD picks subclasses at level 3, and
  // pansori's strict-SRD build has exactly one per class — auto-applied at L3.
  // SRD Species (formerly "race"). Optional — engine defaults to
  // Human when omitted.
  species?: string;
  // 2024 background ability-score increase. Omitted = +1 to all three of the
  // background's listed abilities; supplied = +2 to `plus2` and +1 to `plus1`.
  ability_bonus?: { plus2: string; plus1: string };
  // 2024 class skill proficiencies — the player's chosen "N from the class
  // list". Omitted/invalid = the curated default. Re-validated server-side.
  class_skills?: string[];
  // 2024 starting-equipment package id ('A' / 'B' / 'C'). Omitted = the default
  // package. Re-validated server-side.
  starting_equipment?: string;
  // 2024 Weapon Mastery picks (weapon ids). Omitted/invalid = the default.
  // Re-validated server-side.
  weapon_masteries?: string[];
  // 2024 Fighting Style for the class's level-1 slot (Fighter). Omitted/invalid
  // = the default. Re-validated server-side.
  fighting_style?: string;
  // SRD Cleric Divine Order (level 1): 'protector' or 'thaumaturge'. With
  // 'thaumaturge', `divine_order_cantrip` is the chosen Cleric cantrip. Omitted
  // = no order yet (the in-game prompt remains as a fallback).
  divine_order?: 'protector' | 'thaumaturge';
  divine_order_cantrip?: string;
  // SRD Expertise picks chosen at creation (Rogue's two level-1 slots). Each
  // must be one of the character's proficient skills. Omitted/invalid = the
  // first proficiencies. Re-validated server-side.
  rogue_expertise?: string[];
  // SRD caster spell picks at creation — chosen cantrips + level-1 spells.
  // Omitted/invalid = the curated default. Re-validated server-side.
  caster_spells?: { cantrips?: string[]; l1?: string[] };
  // Origin-feat choices that need player input at character creation.
  // Today only Magic Initiate variants populate this — the player picks
  // 2 cantrips + 1 L1 spell. BE validates the shape AND that each picked
  // spell exists + matches the feat's spellList tag.
  feat_choices?: {
    cantripChoices?: string[];
    l1Choice?: string;
  };
};

// Slim BE-context data the FE picker needs at character creation. The
// shape mirrors the response of `GET /api/game/contexts` — backgrounds
// carry `originFeat`, the feat table identifies cantrip + L1 counts +
// spell list for Magic Initiate variants, and `spells` is filtered
// client-side by the feat's spellList tag.
export interface BackendContextSummary {
  id: string;
  displayName: string;
  classes: string[];
  // Per-class "choose N from options" skill proficiencies + the curated
  // default selection, for the creation-screen skill picker.
  classSkillChoices: Record<string, { count: number; options: string[]; default: string[] }>;
  // Per-class starting-equipment packages (item display names + GP) for the
  // creation-screen picker.
  classStartingEquipment: Record<
    string,
    Array<{ id: string; label: string; gold: number; items: string[] }>
  >;
  // Per-class Weapon Mastery options (masterable weapons + slot count + default
  // picks) for the creation-screen picker. Only classes with the feature appear.
  weaponMasteryChoices: Record<
    string,
    {
      count: number;
      options: Array<{ id: string; name: string; mastery: string }>;
      default: string[];
    }
  >;
  // Per-class Fighting Style options for classes that grant one at level 1
  // (Fighter), for the creation-screen picker.
  fightingStyleChoices: Record<
    string,
    { count: number; options: Array<{ id: string; label: string }>; default: string }
  >;
  // SRD Cleric Divine Order — the Cleric cantrips a Thaumaturge can learn at
  // creation, for the creation-screen dropdown. Populated only when a Cleric is
  // castable in the context.
  divineOrderCantrips?: Array<{ id: string; name: string }>;
  // Caster spell picks at creation — per full-caster class, the spell-list tag,
  // how many cantrips / level-1 spells to choose, and the default pre-selection.
  // The picker filters the `spells` array below by `spellList`.
  casterSpellChoices?: Record<
    string,
    {
      spellList: 'arcane' | 'divine' | 'primal';
      cantripCount: number;
      l1Count: number;
      defaultCantrips: string[];
      defaultL1: string[];
    }
  >;
  // Per-class Expertise slot count at level 1 (Rogue: 2), for the creation
  // picker. The eligible skills are the character's own proficiencies, so the
  // screen assembles the options from the live draft rather than the server.
  expertiseChoices: Record<string, { count: number }>;
  backgrounds: Array<{
    id: string;
    name: string;
    desc: string;
    skillProficiencies: string[];
    toolProficiency: string | null;
    feature: string;
    featureDesc: string;
    originFeat: string | null;
    // The three abilities this background can boost (for the +2/+1 split UI).
    abilityScoreIncreases: string[];
  }>;
  featTable: Record<
    string,
    {
      id: string;
      name: string;
      desc: string;
      effect: { kind: string; [k: string]: unknown };
    }
  >;
  spells: Array<{
    id: string;
    name: string;
    level: number;
    desc: string;
    spellList: Array<'arcane' | 'divine' | 'primal'>;
  }>;
}

export const api = {
  getMe: () => req<AuthUser>('/auth/me'),

  // ─── Campaign admin ────────────────────────────────────────────────────────

  listCampaigns: () => req<CampaignListing[]>('/campaigns'),

  listCampaignMembers: (campaignId: string) =>
    req<CampaignMember[]>(`/campaigns/${campaignId}/members`),

  addCampaignMember: (campaignId: string, email: string, role: CampaignRole) =>
    req<CampaignMember>(`/campaigns/${campaignId}/members`, {
      method: 'POST',
      body: JSON.stringify({ email, role }),
    }),

  setCampaignMemberRole: (campaignId: string, userId: string, role: CampaignRole) =>
    req<CampaignMember>(`/campaigns/${campaignId}/members/${userId}`, {
      method: 'PUT',
      body: JSON.stringify({ role }),
    }),

  removeCampaignMember: (campaignId: string, userId: string) =>
    req<{ ok: boolean }>(`/campaigns/${campaignId}/members/${userId}`, {
      method: 'DELETE',
    }),

  // Site-admin only — promote to global / demote to private.
  setCampaignVisibility: (campaignId: string, visibility: CampaignVisibility) =>
    req<{ ok: boolean; visibility: CampaignVisibility }>(`/campaigns/${campaignId}/visibility`, {
      method: 'PUT',
      body: JSON.stringify({ visibility }),
    }),

  // Content sections (editor+). PUT writes the DB version (live immediately);
  // DELETE reverts the section to the code-defined version.
  listCampaignSections: (campaignId: string) =>
    req<CampaignSectionInfo[]>(`/campaigns/${campaignId}/data`),

  getCampaignSection: (campaignId: string, section: string) =>
    req<CampaignSectionValue>(`/campaigns/${campaignId}/data/${section}`),

  putCampaignSection: (campaignId: string, section: string, value: unknown) =>
    req<{ ok: boolean; section: string; source: CampaignSectionSource }>(
      `/campaigns/${campaignId}/data/${section}`,
      { method: 'PUT', body: JSON.stringify({ value }) }
    ),

  deleteCampaignSection: (campaignId: string, section: string) =>
    req<{ ok: boolean; section: string; source: CampaignSectionSource }>(
      `/campaigns/${campaignId}/data/${section}`,
      { method: 'DELETE' }
    ),

  listContexts: () => req<BackendContextSummary[]>('/game/contexts'),

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

  takeAction: (
    sessionId: string,
    action: StructuredAction,
    history: unknown[],
    turn_seq?: number
  ) =>
    req<ActionResult>(`/game/session/${sessionId}/action`, {
      method: 'POST',
      body: JSON.stringify({ action, history, turn_seq }),
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

  // Multiplayer endpoints (PR 4)
  joinSession: (invite_token: string) =>
    req<{ ok: boolean; session_id: string }>('/game/session/join', {
      method: 'POST',
      body: JSON.stringify({ invite_token }),
    }),

  listParticipants: (sessionId: string) =>
    req<{
      host_user_id: string;
      participants: Array<{
        user_id: string;
        role: string;
        joined_at: string;
        display_name: string;
        avatar_url: string | null;
      }>;
    }>(`/game/session/${sessionId}/participants`),

  rotateInvite: (sessionId: string) =>
    req<{ invite_token: string }>(`/game/session/${sessionId}/rotate-invite`, {
      method: 'POST',
    }),

  assignCharacter: (sessionId: string, character_id: string, owner_user_id: string) =>
    req<{ ok: boolean; character_id: string; owner_user_id: string }>(
      `/game/session/${sessionId}/assign-character`,
      {
        method: 'POST',
        body: JSON.stringify({ character_id, owner_user_id }),
      }
    ),

  // Non-host voluntary leave. Server transfers any PCs the caller
  // owned to the host before removing the participant row.
  leaveSession: (sessionId: string) =>
    req<{ ok: boolean }>(`/game/session/${sessionId}/participant`, { method: 'DELETE' }),
};
