import { FrontendContext, SessionSummary } from '../types';
import { AuthUser } from '../lib/api';
import styles from '../styles.module.css';

function SessionsScreen({
  sessions,
  user,
  loading,
  onResume,
  onNewGame,
  onLogout,
  onDelete,
  onClearCompleted,
  onAbout,
  contexts,
}: {
  sessions: SessionSummary[];
  user: AuthUser | null;
  loading: boolean;
  onResume: (id: string) => void;
  onNewGame: () => void;
  onLogout: () => void;
  onDelete: (id: string) => void;
  onClearCompleted: () => void;
  onAbout: () => void;
  contexts: Record<string, FrontendContext>;
}) {
  const statusColor = (s: string) =>
    s === 'escaped' ? 'var(--t-hp-high)' : s === 'dead' ? 'var(--t-hp-low)' : 'var(--t-mid)';
  const hasCompleted = sessions.some((s) => s.status !== 'active');

  return (
    <div className={styles.pageFlex}>
      <div className={styles.sessionsInner}>
        <div className={styles.sessionsHeader}>
          <div>
            <h1 className={styles.title} style={{ fontSize: '1.1rem', marginBottom: 4 }}>
              PANSORI
            </h1>
            {user && <p className={styles.sub}>{user.display_name.toUpperCase()}</p>}
          </div>
          <div className={styles.sessionsActions}>
            {hasCompleted && (
              <button
                className={styles.ghostBtn}
                onClick={() => {
                  if (confirm('Delete all completed and failed runs?')) onClearCompleted();
                }}
              >
                CLEAR OLD
              </button>
            )}
            <button
              data-testid="new-adventure-btn"
              className={styles.submit}
              style={{ marginTop: 0, width: 'auto', padding: '0.5rem 1.25rem' }}
              onClick={onNewGame}
            >
              + NEW ADVENTURE
            </button>
            <button className={styles.ghostBtn} onClick={onAbout}>
              ABOUT
            </button>
            <button className={styles.ghostBtn} onClick={onLogout}>
              SIGN OUT
            </button>
          </div>
        </div>

        {sessions.length === 0 ? (
          <div
            className={styles.card}
            style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--t-dim)' }}
          >
            <p style={{ fontSize: '0.8rem', letterSpacing: '0.12em', marginBottom: '1.25rem' }}>
              NO ADVENTURES ON RECORD
            </p>
            <button
              className={styles.submit}
              style={{ marginTop: 0, width: 'auto', padding: '0.5rem 1.5rem' }}
              onClick={onNewGame}
            >
              BEGIN FIRST ADVENTURE
            </button>
          </div>
        ) : (
          <div className={styles.sessionList}>
            {sessions.map((s) => {
              const ctx = contexts[s.context_id];
              const isActive = s.status === 'active';
              return (
                <div
                  key={s.id}
                  className={styles.card}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem',
                    marginBottom: 0,
                    opacity: isActive ? 1 : 0.6,
                  }}
                >
                  {s.portrait_url ? (
                    <img
                      src={s.portrait_url}
                      alt={s.character_name ? `${s.character_name}'s portrait` : ''}
                      className={styles.sessionPortrait}
                    />
                  ) : (
                    <div className={styles.sessionPortraitPlaceholder} />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p
                      style={{
                        fontWeight: 'bold',
                        fontSize: '0.85rem',
                        letterSpacing: '0.06em',
                        color: 'var(--t-primary)',
                      }}
                    >
                      {s.character_name}
                      {s.party_size > 1 && (
                        <span style={{ color: 'var(--t-mid)', fontWeight: 'normal' }}>
                          {' '}
                          & {s.party_size - 1} companion{s.party_size > 2 ? 's' : ''}
                        </span>
                      )}
                    </p>
                    <p
                      style={{
                        fontSize: '0.8rem',
                        color: 'var(--t-dim)',
                        letterSpacing: '0.08em',
                        marginTop: 2,
                      }}
                    >
                      {s.character_class.toUpperCase()} · {ctx?.displayName ?? s.context_id}
                    </p>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <p
                      style={{
                        fontSize: '0.8rem',
                        color: statusColor(s.status),
                        letterSpacing: '0.1em',
                        marginBottom: 4,
                      }}
                    >
                      {s.status.toUpperCase()}
                    </p>
                    <p style={{ fontSize: '0.75rem', color: 'var(--t-dim)' }}>
                      {new Date(s.updated_at).toLocaleDateString()}
                    </p>
                  </div>
                  {isActive && (
                    <button
                      className={styles.sendBtn}
                      style={{ flexShrink: 0 }}
                      onClick={() => onResume(s.id)}
                      disabled={loading}
                    >
                      RESUME
                    </button>
                  )}
                  <button
                    className={styles.ghostBtn}
                    style={{
                      padding: '0.3rem 0.6rem',
                      fontSize: '0.75rem',
                      letterSpacing: '0.08em',
                      flexShrink: 0,
                    }}
                    onClick={() => {
                      const msg = isActive
                        ? `Delete active run "${s.character_name}"? This cannot be undone.`
                        : `Delete "${s.character_name}"?`;
                      if (confirm(msg)) onDelete(s.id);
                    }}
                    aria-label={`Delete session "${s.character_name}"`}
                  >
                    <span aria-hidden="true">✕</span>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default SessionsScreen;
