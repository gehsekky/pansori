import type { Character, GameState } from '../types.ts';
import { useEffect, useRef, useState } from 'react';
import Dialog from './Dialog.tsx';
import { api } from '../lib/api.ts';
import styles from '../styles.module.css';

interface ParticipantInfo {
  user_id: string;
  role: string;
  joined_at: string;
  display_name: string;
  avatar_url: string | null;
}

interface Props {
  sessionId: string;
  inviteToken: string | null;
  // Whether the current user is the host. Non-hosts see the invite link
  // and the participants list (read-only) but can't rotate the token or
  // reassign PC ownership. Host-only capability lives on the server too
  // (rotate-invite + assign-character check session.user_id).
  isHost: boolean;
  // Current game state — for the PC list + their owner_user_ids. Lives
  // outside the dialog (in useGame) so realtime Socket.IO broadcasts
  // keep the dropdowns in sync without a refetch.
  state: GameState | null;
  // Bumps every time the server emits a `participants` event. Used as
  // a useEffect dep so the dialog re-fetches the participants list
  // whenever someone joins, leaves, or has their PC ownership changed
  // by another participant. Provided by useGame.
  participantsVersion: number;
  onClose: () => void;
  // Called after a successful token rotation so the parent can update
  // its locally-stored session.invite_token without a refetch.
  onTokenRotated?: (newToken: string) => void;
  // Called after the non-host participant successfully leaves the
  // session. Parent typically resets game state + redirects to the
  // session list. Only invoked when isHost === false.
  onLeave?: () => void;
}

// Build the shareable URL from the invite token. Same-origin format —
// the SPA reads ?join=<token> on startup and POSTs it to /session/join.
function buildInviteUrl(token: string): string {
  const url = new URL(window.location.origin);
  url.searchParams.set('join', token);
  return url.toString();
}

function InviteDialog({
  sessionId,
  inviteToken,
  isHost,
  state,
  participantsVersion,
  onClose,
  onTokenRotated,
  onLeave,
}: Props) {
  // Local mirror of the token so a successful rotate updates the URL
  // without waiting for a parent re-render.
  const [token, setToken] = useState<string | null>(inviteToken);
  useEffect(() => {
    setToken(inviteToken);
  }, [inviteToken]);

  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle');
  const [rotating, setRotating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Participants list. Fetched on dialog open; refreshed on any
  // ownership change. We don't subscribe to Socket.IO 'participants'
  // events here for MVP — assigning a PC triggers a re-fetch inline,
  // and the dialog isn't open often enough for stale participant
  // lists to matter. Polish: add a socket listener if it bites.
  const [participants, setParticipants] = useState<ParticipantInfo[]>([]);
  const [participantsErr, setParticipantsErr] = useState<string | null>(null);
  // Per-character "is the dropdown busy waiting for a response" so the
  // UI doesn't let the host triple-click during a slow assign.
  const [assigning, setAssigning] = useState<Record<string, boolean>>({});
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .listParticipants(sessionId)
      .then((r) => {
        if (!cancelled) setParticipants(r.participants);
      })
      .catch((e: { error?: string }) => {
        if (!cancelled) setParticipantsErr(e?.error ?? 'Failed to load participants');
      });
    return () => {
      cancelled = true;
    };
    // participantsVersion bumps on every server `participants` event so
    // the host sees joins/leaves/ownership-changes in realtime instead
    // of having to close + reopen the dialog.
  }, [sessionId, participantsVersion]);

  const url = token ? buildInviteUrl(token) : '';

  async function handleCopy() {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopyStatus('copied');
      setTimeout(() => setCopyStatus('idle'), 1500);
    } catch {
      setCopyStatus('error');
      setTimeout(() => setCopyStatus('idle'), 2500);
    }
  }

  async function handleRotate() {
    setRotating(true);
    try {
      const result = await api.rotateInvite(sessionId);
      setToken(result.invite_token);
      onTokenRotated?.(result.invite_token);
    } catch {
      setCopyStatus('error');
      setTimeout(() => setCopyStatus('idle'), 2500);
    } finally {
      setRotating(false);
    }
  }

  async function handleLeave() {
    if (
      !confirm(
        'Leave this session? Any PCs you control will return to the host. You can rejoin later if the host re-shares the invite link.'
      )
    ) {
      return;
    }
    setLeaving(true);
    try {
      await api.leaveSession(sessionId);
      onLeave?.();
    } catch (e) {
      const err = e as { error?: string };
      setParticipantsErr(err?.error ?? 'Leave failed.');
      setLeaving(false);
    }
  }

  async function handleAssign(charId: string, newOwnerId: string) {
    setAssigning((prev) => ({ ...prev, [charId]: true }));
    try {
      await api.assignCharacter(sessionId, charId, newOwnerId);
      // The state update comes back via Socket.IO 'state' broadcast,
      // so the dropdown's `value` prop will reflect the new owner on
      // the next re-render of this dialog. No local refetch needed.
    } catch (e) {
      const err = e as { error?: string };
      setParticipantsErr(err?.error ?? 'Assignment failed.');
    } finally {
      setAssigning((prev) => ({ ...prev, [charId]: false }));
    }
  }

  const characters: Character[] = state?.characters ?? [];

  return (
    <Dialog title="Players & invites" onClose={onClose} testId="invite-dialog">
      <div className={styles.inviteDialogBody}>
        {/* ── Invite link section ──────────────────────────────────── */}
        <p className={styles.inviteDialogHint}>
          Share this link. Anyone with it can join your session.
        </p>
        <div className={styles.inviteDialogRow}>
          <input
            ref={inputRef}
            type="text"
            value={url}
            readOnly
            className={styles.inviteDialogInput}
            onClick={() => inputRef.current?.select()}
            aria-label="Invite link"
            data-testid="invite-link"
          />
          <button
            type="button"
            className={styles.submit}
            onClick={handleCopy}
            disabled={!token}
            data-testid="invite-copy-btn"
          >
            {copyStatus === 'copied' ? 'Copied!' : copyStatus === 'error' ? 'Failed' : 'Copy'}
          </button>
        </div>
        {isHost && (
          <div className={styles.inviteDialogRow}>
            <p className={styles.inviteDialogHint}>
              If the link leaks, rotate it — the old link will stop working.
            </p>
            <button
              type="button"
              className={styles.ghostBtn}
              onClick={handleRotate}
              disabled={rotating}
              data-testid="invite-rotate-btn"
            >
              {rotating ? 'Rotating…' : 'Rotate link'}
            </button>
          </div>
        )}

        {/* ── Participants + character ownership section ──────────── */}
        <div className={styles.partyMgrDivider} aria-hidden="true" />
        <h3 className={styles.partyMgrHeading}>Players in this session</h3>
        {participantsErr && (
          <p className={styles.partyMgrError} role="alert">
            {participantsErr}
          </p>
        )}
        <ul className={styles.partyMgrList} data-testid="participants-list">
          {participants.length === 0 ? (
            <li className={styles.inviteDialogHint}>(loading…)</li>
          ) : (
            participants.map((p) => (
              <li key={p.user_id} className={styles.partyMgrRow}>
                {p.avatar_url ? (
                  <img
                    src={p.avatar_url}
                    alt={`${p.display_name}'s avatar`}
                    className={styles.partyMgrAvatar}
                  />
                ) : (
                  <span className={styles.partyMgrAvatarPlaceholder} aria-hidden="true">
                    ◍
                  </span>
                )}
                <span className={styles.partyMgrName}>{p.display_name}</span>
                <span className={styles.partyMgrRole}>{p.role}</span>
              </li>
            ))
          )}
        </ul>

        {characters.length > 0 && (
          <>
            <h3 className={styles.partyMgrHeading}>Character control</h3>
            {!isHost && (
              <p className={styles.inviteDialogHint}>Only the host can reassign PC ownership.</p>
            )}
            <ul className={styles.partyMgrList} data-testid="party-mgr-list">
              {characters.map((c) => {
                const owner = participants.find((p) => p.user_id === c.owner_user_id);
                const selectId = `party-mgr-${c.id}`;
                return (
                  <li key={c.id} className={styles.partyMgrRow}>
                    <span className={styles.partyMgrName}>{c.name}</span>
                    <label htmlFor={selectId} className={styles.partyMgrInlineLabel}>
                      Controlled by
                    </label>
                    {isHost && participants.length > 0 ? (
                      <select
                        id={selectId}
                        className={styles.partyMgrSelect}
                        value={c.owner_user_id ?? ''}
                        disabled={!!assigning[c.id] || participants.length === 0}
                        onChange={(e) => handleAssign(c.id, e.target.value)}
                        data-testid={`party-mgr-select-${c.id}`}
                      >
                        {participants.map((p) => (
                          <option key={p.user_id} value={p.user_id}>
                            {p.display_name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className={styles.partyMgrName}>
                        {owner?.display_name ?? '— unassigned —'}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}

        {/* Leave-session — non-host only. The host removes the session
            entirely via the RESIGN button on the header. PCs the leaver
            owned auto-transfer to the host on the server side. */}
        {!isHost && onLeave && (
          <>
            <div className={styles.partyMgrDivider} aria-hidden="true" />
            <div className={styles.inviteDialogRow}>
              <p className={styles.inviteDialogHint}>
                Leave the session. Any PCs you control return to the host; you can rejoin later from
                the invite link.
              </p>
              <button
                type="button"
                className={styles.ghostBtn}
                onClick={handleLeave}
                disabled={leaving}
                data-testid="leave-session-btn"
              >
                {leaving ? 'Leaving…' : 'Leave session'}
              </button>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}

export default InviteDialog;
