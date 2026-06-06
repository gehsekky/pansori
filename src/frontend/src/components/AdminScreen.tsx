import {
  type AuthUser,
  type CampaignListing,
  type CampaignMember,
  type CampaignRole,
  api,
} from '../lib/api.ts';
import { useCallback, useEffect, useState } from 'react';
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
function AdminScreen({ user, onBack }: { user: AuthUser; onBack: () => void }) {
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
  const [addRole, setAddRole] = useState<CampaignRole>('editor');

  const selected = campaigns.find((c) => c.id === selectedId) ?? null;
  // my_role is already 'owner' for site admins (backend resolves it).
  const canManage = selected?.my_role === 'owner';

  useEffect(() => {
    api
      .listCampaigns()
      .then((list) => {
        setCampaigns(list);
        // Auto-select the first campaign the user has a role on.
        const first = list.find((c) => c.my_role);
        if (first) setSelectedId(first.id);
      })
      .catch(() => setCampaignsErr('Could not load campaigns.'));
  }, []);

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

  return (
    <div className={styles.pageFlex}>
      <div className={styles.sessionsInner}>
        <div className={styles.sessionsHeader}>
          <div>
            <h1 className={styles.title} style={{ fontSize: '1.1rem', marginBottom: 4 }}>
              PANSORI ADMIN
            </h1>
            <p className={styles.sub}>
              {user.display_name.toUpperCase()}
              {user.is_admin && <span style={{ color: 'var(--t-mid)' }}> · SITE ADMIN</span>}
            </p>
          </div>
          <div className={styles.sessionsActions}>
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

        {/* ── Campaign list ─────────────────────────────────────────────── */}
        <div className={styles.sessionList}>
          {campaigns.map((c) => {
            const manageable = c.my_role !== null;
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
                <p
                  style={{
                    fontSize: '0.75rem',
                    letterSpacing: '0.1em',
                    color: c.my_role ? 'var(--t-mid)' : 'var(--t-dim)',
                    flexShrink: 0,
                  }}
                >
                  {c.my_role ? c.my_role.toUpperCase() : 'NO ACCESS'}
                </p>
              </button>
            );
          })}
        </div>

        {/* ── Members panel ─────────────────────────────────────────────── */}
        {selected && (
          <div className={styles.card} style={{ marginTop: '1rem' }}>
            <p
              style={{
                fontSize: '0.8rem',
                letterSpacing: '0.12em',
                color: 'var(--t-mid)',
                marginBottom: '0.75rem',
              }}
            >
              MEMBERS — {selected.name.toUpperCase()}
            </p>

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

        {/* ── Content editing placeholder ───────────────────────────────── */}
        {selected && (
          <div
            className={styles.card}
            style={{ marginTop: '1rem', color: 'var(--t-dim)', textAlign: 'center' }}
          >
            <p style={{ fontSize: '0.8rem', letterSpacing: '0.12em' }}>CONTENT</p>
            <p style={{ fontSize: '0.75rem', marginTop: 6 }}>
              Campaign content editing lands here as it moves from code into the database.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminScreen;
