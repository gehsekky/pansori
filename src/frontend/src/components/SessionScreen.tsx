import { SessionSummary, FrontendContext } from '../types';
import { AuthUser } from '../lib/api';
import { S } from '../App';

// ─── Sessions screen ─────────────────────────────────────────────────────────
function SessionsScreen({
  sessions,
  user,
  loading,
  onResume,
  onNewGame,
  onLogout,
  onDelete,
  onClearCompleted,
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
  contexts: Record<string, FrontendContext>;
}) {
  const statusColor = (s: string) =>
    s === 'escaped' ? 'var(--t-hp-high)' : s === 'dead' ? 'var(--t-hp-low)' : 'var(--t-mid)';
  const hasCompleted = sessions.some(s => s.status !== 'active');

  return (
    <div style={{ ...S.page, display: 'flex', alignItems: 'flex-start', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 620, margin: '4rem auto' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            marginBottom: '2rem',
          }}
        >
          <div>
            <p style={{ ...S.title, fontSize: '1.1rem', marginBottom: 4 }}>PANSORI</p>
            {user && <p style={S.sub}>{user.display_name.toUpperCase()}</p>}
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            {hasCompleted && (
              <button
                onClick={() => {
                  if (confirm('Delete all completed and failed runs?')) onClearCompleted();
                }}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--t-border)',
                  color: 'var(--t-dim)',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontSize: '0.75rem',
                  letterSpacing: '0.1em',
                  padding: '0.5rem 1rem',
                }}
              >
                CLEAR OLD
              </button>
            )}
            <button
              style={{ ...S.submit, marginTop: 0, width: 'auto', padding: '0.5rem 1.25rem' }}
              onClick={onNewGame}
            >
              + NEW MISSION
            </button>
            <button
              onClick={onLogout}
              style={{
                background: 'transparent',
                border: '1px solid var(--t-border)',
                color: 'var(--t-dim)',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: '0.75rem',
                letterSpacing: '0.1em',
                padding: '0.5rem 1rem',
              }}
            >
              SIGN OUT
            </button>
          </div>
        </div>

        {sessions.length === 0 ? (
          <div style={{ ...S.card, textAlign: 'center', padding: '2.5rem', color: 'var(--t-dim)' }}>
            <p style={{ fontSize: '0.8rem', letterSpacing: '0.12em', marginBottom: '1.25rem' }}>
              NO MISSIONS ON RECORD
            </p>
            <button
              style={{ ...S.submit, marginTop: 0, width: 'auto', padding: '0.5rem 1.5rem' }}
              onClick={onNewGame}
            >
              BEGIN FIRST MISSION
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {sessions.map(s => {
              const ctx = contexts[s.context_id];
              const isActive = s.status === 'active';
              return (
                <div
                  key={s.id}
                  style={{
                    ...S.card,
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
                      alt=""
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: '50%',
                        objectFit: 'cover',
                        border: '1px solid var(--t-border)',
                        flexShrink: 0,
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: '50%',
                        background: 'var(--t-separator)',
                        border: '1px solid var(--t-border)',
                        flexShrink: 0,
                      }}
                    />
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
                      style={{ ...S.sendBtn, flexShrink: 0 }}
                      onClick={() => onResume(s.id)}
                      disabled={loading}
                    >
                      RESUME
                    </button>
                  )}
                  <button
                    onClick={() => {
                      const msg = isActive
                        ? `Delete active run "${s.character_name}"? This cannot be undone.`
                        : `Delete "${s.character_name}"?`;
                      if (confirm(msg)) onDelete(s.id);
                    }}
                    style={{
                      background: 'transparent',
                      border: '1px solid var(--t-border)',
                      color: 'var(--t-dim)',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      fontSize: '0.75rem',
                      letterSpacing: '0.08em',
                      padding: '0.3rem 0.6rem',
                      flexShrink: 0,
                    }}
                  >
                    ✕
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
