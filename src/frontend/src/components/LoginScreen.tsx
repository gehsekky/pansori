import { S } from '../App';

// ─── Login screen ────────────────────────────────────────────────────────────
function LoginScreen() {
  const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';
  return (
    <div
      style={{
        ...S.page,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
      }}
    >
      <div style={{ textAlign: 'center', maxWidth: 360 }}>
        <p style={{ ...S.title, marginBottom: '0.5rem' }}>PANSORI</p>
        <p
          style={{
            fontSize: '0.75rem',
            color: 'var(--t-dim)',
            letterSpacing: '0.15em',
            marginBottom: '2.5rem',
          }}
        >
          SIGN IN TO CONTINUE YOUR MISSION
        </p>
        <a
          href={`${BASE}/api/auth/google`}
          style={{
            display: 'inline-block',
            background: 'var(--t-dim-dark)',
            color: 'var(--t-primary)',
            border: '1px solid var(--t-primary)',
            padding: '0.65rem 1.75rem',
            fontFamily: 'inherit',
            fontSize: '0.8rem',
            letterSpacing: '0.12em',
            textDecoration: 'none',
          }}
        >
          SIGN IN WITH GOOGLE
        </a>
      </div>
    </div>
  );
}

export default LoginScreen;
