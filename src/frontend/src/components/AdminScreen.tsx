import {
  type AuthUser,
  type CampaignListing,
  type CampaignMember,
  type CampaignRole,
  type CampaignVisibility,
  api,
} from '../lib/api.ts';
import { useCallback, useEffect, useState } from 'react';
import CampaignContentEditor from './CampaignContentEditor.tsx';
import styles from '../styles.module.css';

// Map the backend's mutation-failure reasons (routes/campaigns.ts) to
// player-readable text. Anything unrecognized falls through to a generic.
const ERROR_TEXT: Record<string, string> = {
  user_not_found: 'No account with that email — they need to sign in once first.',
  not_a_member: 'That user is not a member of this campaign.',
  last_owner: 'A campaign cannot lose its last owner — promote someone else first.',
};

function errorText(err: unknown): string {
  const reason = (err as { error?: string })?.error;
  return (reason && ERROR_TEXT[reason]) ?? 'Request failed — try again.';
}

// Campaign admin shell: campaign list + per-campaign member management.
// Owners (and site admins, who resolve to owner everywhere) manage members;
// editors get a read-only view. Campaign *content* editing will mount here
// as content tables move into the DB — see the placeholder card.
//
// Two modes share this screen:
//   'admin'   — the site-admin surface: every campaign the server lists
//               (global + memberships; admins see all), gated by canAdmin.
//   'creator' — the everyone-facing surface: only campaigns the user can
//               actually work on (owner/editor), with a creation-coming
//               empty state. Same member/content panes once selected.
function AdminScreen({
  user,
  onBack,
  mode = 'admin',
  initialCampaignId,
  onSelectCampaign,
  onEditRegion,
}: {
  user: AuthUser;
  onBack: () => void;
  mode?: 'admin' | 'creator';
  // Deep-link support (/creator/<campaign id>): pre-select this campaign
  // once the list loads, falling back to the usual auto-select when the
  // id is unknown or not workable by this user.
  initialCampaignId?: string | null;
  // Selection→URL sync: fired with the selected campaign id (null when
  // nothing is selected) so the parent can keep the address bar current.
  onSelectCampaign?: (id: string | null) => void;
  // Open the visual region painter for a region of the given campaign.
  onEditRegion?: (campaignId: string, regionId: string) => void;
}) {
  const [campaigns, setCampaigns] = useState<CampaignListing[]>([]);
  const [campaignsErr, setCampaignsErr] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [members, setMembers] = useState<CampaignMember[]>([]);
  const [membersErr, setMembersErr] = useState<string | null>(null);
  // One error slot for the mutation row (add / re-role / remove) — the
  // most recent failure is what the user needs to read.
  const [mutationErr, setMutationErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [addEmail, setAddEmail] = useState('');
  // Default to 'player' — inviting friends to play is the common case.
  const [addRole, setAddRole] = useState<CampaignRole>('player');

  // New-campaign form (creator mode): name → derived slug id.
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [createErr, setCreateErr] = useState<string | null>(null);
  const newId = newName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

  // Players can see/play a campaign but have nothing to do on this screen —
  // the member list itself is editor+.
  const adminRole = (r: CampaignRole | null) => r === 'owner' || r === 'editor';

  // Creator mode shows only the campaigns the user can work on; admin mode
  // shows everything the server listed (incl. global NO ACCESS rows).
  const visibleCampaigns =
    mode === 'creator' ? campaigns.filter((c) => adminRole(c.my_role)) : campaigns;

  const selected = visibleCampaigns.find((c) => c.id === selectedId) ?? null;
  // my_role is already 'owner' for site admins (backend resolves it).
  const canManage = selected?.my_role === 'owner';

  useEffect(() => {
    api
      .listCampaigns()
      .then((list) => {
        setCampaigns(list);
        // Deep-linked campaign first (if this user can work on it), then
        // the first campaign the user can administer.
        const workable = (c: CampaignListing) => c.my_role === 'owner' || c.my_role === 'editor';
        const initial = initialCampaignId
          ? list.find((c) => c.id === initialCampaignId && workable(c))
          : undefined;
        const first = initial ?? list.find(workable);
        if (first) setSelectedId(first.id);
      })
      .catch(() => setCampaignsErr('Could not load campaigns.'));
    // Mount-only by design: initialCampaignId only matters for the first
    // load — afterwards the user's clicks own the selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the parent (and so the URL) in sync with the selection — but only
  // once the campaign list has loaded. Before that, selectedId is still the
  // initial null and syncing would clobber a /creator/<id> deep link that
  // is about to resolve into a selection.
  useEffect(() => {
    if (campaigns.length === 0) return;
    onSelectCampaign?.(selectedId);
    // onSelectCampaign identity is unstable in the parent (inline arrow);
    // syncing on selection/load change only is the intent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, campaigns.length]);

  const loadMembers = useCallback((campaignId: string) => {
    setMembers([]);
    setMembersErr(null);
    setMutationErr(null);
    api
      .listCampaignMembers(campaignId)
      .then(setMembers)
      .catch(() => setMembersErr('Could not load members.'));
  }, []);

  useEffect(() => {
    if (selectedId) loadMembers(selectedId);
  }, [selectedId, loadMembers]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId || !addEmail.trim() || busy) return;
    setBusy(true);
    setMutationErr(null);
    try {
      await api.addCampaignMember(selectedId, addEmail.trim(), addRole);
      setAddEmail('');
      loadMembers(selectedId);
    } catch (err) {
      setMutationErr(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleRoleChange(userId: string, role: CampaignRole) {
    if (!selectedId || busy) return;
    setBusy(true);
    setMutationErr(null);
    try {
      await api.setCampaignMemberRole(selectedId, userId, role);
      loadMembers(selectedId);
    } catch (err) {
      setMutationErr(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(member: CampaignMember) {
    if (!selectedId || busy) return;
    if (!confirm(`Remove ${member.display_name} from this campaign?`)) return;
    setBusy(true);
    setMutationErr(null);
    try {
      await api.removeCampaignMember(selectedId, member.user_id);
      loadMembers(selectedId);
    } catch (err) {
      setMutationErr(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (busy || newId.length < 3) return;
    setBusy(true);
    setCreateErr(null);
    try {
      const created = await api.createCampaign(newId, newName.trim());
      setCampaigns((prev) => [...prev, created]);
      setSelectedId(created.id);
      setCreating(false);
      setNewName('');
    } catch (err) {
      const reason = (err as { error?: string })?.error;
      setCreateErr(
        reason === 'campaign_exists'
          ? `The id "${newId}" is taken — pick a different name.`
          : 'Could not create the campaign — try again.'
      );
    } finally {
      setBusy(false);
    }
  }

  // Site-admin only: promote to global / demote to private. The backend
  // enforces it too (requireAdmin) — the button simply isn't rendered for
  // non-admins.
  async function handleVisibility(visibility: CampaignVisibility) {
    if (!selectedId || busy) return;
    setBusy(true);
    setMutationErr(null);
    try {
      await api.setCampaignVisibility(selectedId, visibility);
      setCampaigns((prev) => prev.map((c) => (c.id === selectedId ? { ...c, visibility } : c)));
    } catch (err) {
      setMutationErr(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.pageFlex}>
      <div className={styles.sessionsInner}>
        <div className={styles.sessionsHeader}>
          <div>
            <h1 className={styles.title} style={{ fontSize: '1.1rem', marginBottom: 4 }}>
              {mode === 'admin' ? 'PANSORI ADMIN' : 'CAMPAIGN CREATOR'}
            </h1>
            <p className={styles.sub}>
              {user.display_name.toUpperCase()}
              {user.is_admin && <span style={{ color: 'var(--t-mid)' }}> · SITE ADMIN</span>}
            </p>
          </div>
          <div className={styles.sessionsActions}>
            {mode === 'creator' && (
              <button
                data-testid="new-campaign-btn"
                className={styles.submit}
                style={{ marginTop: 0, width: 'auto', padding: '0.5rem 1.25rem' }}
                onClick={() => {
                  setCreating((v) => !v);
                  setCreateErr(null);
                }}
              >
                + NEW CAMPAIGN
              </button>
            )}
            <button className={styles.ghostBtn} onClick={onBack}>
              BACK
            </button>
          </div>
        </div>

        {campaignsErr && (
          <div className={styles.card} role="alert" style={{ color: 'var(--t-hp-low)' }}>
            {campaignsErr}
          </div>
        )}

        {/* ── New-campaign form ─────────────────────────────────────────── */}
        {creating && mode === 'creator' && (
          <form className={styles.card} style={{ marginBottom: '1rem' }} onSubmit={handleCreate}>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <label className={styles.formLbl} htmlFor="new-campaign-name">
                  CAMPAIGN NAME
                </label>
                <input
                  id="new-campaign-name"
                  className={styles.formInp}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. The Mistwood"
                  autoFocus
                />
              </div>
              <button
                type="submit"
                className={styles.sendBtn}
                disabled={busy || newId.length < 3}
                data-testid="create-campaign-btn"
              >
                CREATE
              </button>
            </div>
            <p style={{ fontSize: '0.7rem', color: 'var(--t-dim)', marginTop: 6 }}>
              ID: {newId || '—'} · PRIVATE — ONLY MEMBERS SEE IT · STARTS ON THE BASE TEMPLATE
              (PLAYABLE IMMEDIATELY)
            </p>
            {createErr && (
              <p
                role="alert"
                style={{ color: 'var(--t-hp-low)', fontSize: '0.8rem', marginTop: 6 }}
              >
                {createErr}
              </p>
            )}
          </form>
        )}

        {/* ── Campaign list ─────────────────────────────────────────────── */}
        {mode === 'creator' && !campaignsErr && visibleCampaigns.length === 0 && (
          <div
            className={styles.card}
            style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--t-dim)' }}
          >
            <p style={{ fontSize: '0.8rem', letterSpacing: '0.12em', marginBottom: 8 }}>
              NO CAMPAIGNS YET
            </p>
            <p style={{ fontSize: '0.75rem' }}>
              You don&apos;t own or edit any campaigns. Hit + NEW CAMPAIGN to start one — it&apos;s
              private until you invite players, and playable immediately on the base template.
            </p>
          </div>
        )}
        <div className={styles.sessionList}>
          {visibleCampaigns.map((c) => {
            const manageable = adminRole(c.my_role);
            const isSelected = c.id === selectedId;
            return (
              <button
                key={c.id}
                className={styles.card}
                onClick={() => manageable && setSelectedId(c.id)}
                disabled={!manageable}
                aria-pressed={isSelected}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                  marginBottom: 0,
                  width: '100%',
                  textAlign: 'left',
                  cursor: manageable ? 'pointer' : 'default',
                  opacity: manageable ? 1 : 0.5,
                  borderColor: isSelected ? 'var(--t-primary)' : undefined,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      fontWeight: 'bold',
                      fontSize: '0.85rem',
                      letterSpacing: '0.06em',
                      color: 'var(--t-primary)',
                    }}
                  >
                    {c.name}
                  </p>
                  <p
                    style={{
                      fontSize: '0.75rem',
                      color: 'var(--t-dim)',
                      letterSpacing: '0.08em',
                      marginTop: 2,
                    }}
                  >
                    {c.id}
                  </p>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <p
                    style={{
                      fontSize: '0.75rem',
                      letterSpacing: '0.1em',
                      color: c.my_role ? 'var(--t-mid)' : 'var(--t-dim)',
                    }}
                  >
                    {c.my_role ? c.my_role.toUpperCase() : 'NO ACCESS'}
                  </p>
                  <p
                    style={{
                      fontSize: '0.7rem',
                      letterSpacing: '0.1em',
                      color: c.visibility === 'global' ? 'var(--t-hp-high)' : 'var(--t-dim)',
                      marginTop: 2,
                    }}
                  >
                    {c.visibility.toUpperCase()}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {/* ── Members panel ─────────────────────────────────────────────── */}
        {selected && (
          <div className={styles.card} style={{ marginTop: '1rem' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '0.75rem',
              }}
            >
              <p style={{ fontSize: '0.8rem', letterSpacing: '0.12em', color: 'var(--t-mid)' }}>
                MEMBERS — {selected.name.toUpperCase()}
              </p>
              {user.is_admin && (
                <button
                  className={styles.ghostBtn}
                  style={{ padding: '0.3rem 0.6rem', fontSize: '0.7rem' }}
                  disabled={busy}
                  onClick={() =>
                    handleVisibility(selected.visibility === 'global' ? 'private' : 'global')
                  }
                >
                  {selected.visibility === 'global' ? 'MAKE PRIVATE' : 'MAKE GLOBAL'}
                </button>
              )}
            </div>

            {membersErr && (
              <p role="alert" style={{ color: 'var(--t-hp-low)', fontSize: '0.8rem' }}>
                {membersErr}
              </p>
            )}

            {!membersErr && members.length === 0 && (
              <p style={{ color: 'var(--t-dim)', fontSize: '0.8rem' }}>
                No members yet{user.is_admin ? ' — add an owner below.' : '.'}
              </p>
            )}

            {members.map((m) => (
              <div
                key={m.user_id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.4rem 0',
                  borderBottom: '1px solid var(--t-separator)',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: '0.85rem', color: 'var(--t-primary)' }}>
                    {m.display_name}
                    {m.user_id === user.id && (
                      <span style={{ color: 'var(--t-mid)', fontSize: '0.75rem' }}> (YOU)</span>
                    )}
                  </p>
                  <p style={{ fontSize: '0.75rem', color: 'var(--t-dim)' }}>{m.email}</p>
                </div>
                {canManage ? (
                  <>
                    <select
                      className={styles.formInp}
                      style={{ width: 'auto', cursor: 'pointer' }}
                      value={m.role}
                      disabled={busy}
                      aria-label={`Role for ${m.display_name}`}
                      onChange={(e) => handleRoleChange(m.user_id, e.target.value as CampaignRole)}
                    >
                      <option value="owner">OWNER</option>
                      <option value="editor">EDITOR</option>
                      <option value="player">PLAYER</option>
                    </select>
                    <button
                      className={styles.ghostBtn}
                      style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                      disabled={busy}
                      onClick={() => handleRemove(m)}
                      aria-label={`Remove ${m.display_name}`}
                    >
                      <span aria-hidden="true">✕</span>
                    </button>
                  </>
                ) : (
                  <p style={{ fontSize: '0.75rem', letterSpacing: '0.1em', color: 'var(--t-mid)' }}>
                    {m.role.toUpperCase()}
                  </p>
                )}
              </div>
            ))}

            {canManage && (
              <form
                onSubmit={handleAdd}
                style={{
                  display: 'flex',
                  gap: '0.5rem',
                  alignItems: 'flex-end',
                  marginTop: '0.85rem',
                }}
              >
                <div style={{ flex: 1 }}>
                  <label className={styles.formLbl} htmlFor="admin-add-email">
                    ADD MEMBER BY EMAIL
                  </label>
                  <input
                    id="admin-add-email"
                    className={styles.formInp}
                    type="email"
                    value={addEmail}
                    onChange={(e) => setAddEmail(e.target.value)}
                    placeholder="user@example.com"
                  />
                </div>
                <select
                  className={styles.formInp}
                  style={{ width: 'auto', cursor: 'pointer' }}
                  value={addRole}
                  aria-label="Role for new member"
                  onChange={(e) => setAddRole(e.target.value as CampaignRole)}
                >
                  <option value="player">PLAYER</option>
                  <option value="editor">EDITOR</option>
                  <option value="owner">OWNER</option>
                </select>
                <button
                  type="submit"
                  className={styles.sendBtn}
                  disabled={busy || !addEmail.trim()}
                >
                  ADD
                </button>
              </form>
            )}

            {mutationErr && (
              <p
                role="alert"
                style={{ color: 'var(--t-hp-low)', fontSize: '0.8rem', marginTop: 8 }}
              >
                {mutationErr}
              </p>
            )}
          </div>
        )}

        {/* ── Content editing (DB-first sections, code supplement) ──────── */}
        {selected && (
          <CampaignContentEditor
            campaignId={selected.id}
            onEditRegion={
              onEditRegion ? (regionId) => onEditRegion(selected.id, regionId) : undefined
            }
          />
        )}
      </div>
    </div>
  );
}

export default AdminScreen;
