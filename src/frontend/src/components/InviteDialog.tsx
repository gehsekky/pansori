import { useEffect, useRef, useState } from 'react';
import Dialog from './Dialog.tsx';
import { api } from '../lib/api.ts';
import styles from '../styles.module.css';

interface Props {
  sessionId: string;
  inviteToken: string | null;
  // Whether the current user is the host. Non-hosts see the link too
  // (so they can re-share) but can't rotate the token. Host-only
  // capability lives on the server (rotate-invite checks user_id).
  isHost: boolean;
  onClose: () => void;
  // Called after a successful token rotation so the parent can update
  // its locally-stored session.invite_token without a refetch.
  onTokenRotated?: (newToken: string) => void;
}

// Build the shareable URL from the invite token. Same-origin format —
// the SPA reads ?join=<token> on startup and POSTs it to /session/join.
function buildInviteUrl(token: string): string {
  const url = new URL(window.location.origin);
  url.searchParams.set('join', token);
  return url.toString();
}

function InviteDialog({ sessionId, inviteToken, isHost, onClose, onTokenRotated }: Props) {
  // Local mirror of the token so a successful rotate updates the URL
  // without waiting for a parent re-render.
  const [token, setToken] = useState<string | null>(inviteToken);
  useEffect(() => {
    setToken(inviteToken);
  }, [inviteToken]);

  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle');
  const [rotating, setRotating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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
      // Surface failure in the copy status pill so the host sees that
      // nothing changed — keeps the dialog state self-contained.
      setCopyStatus('error');
      setTimeout(() => setCopyStatus('idle'), 2500);
    } finally {
      setRotating(false);
    }
  }

  return (
    <Dialog title="Invite players" onClose={onClose} testId="invite-dialog">
      <div className={styles.inviteDialogBody}>
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
      </div>
    </Dialog>
  );
}

export default InviteDialog;
