import { AuthProvider, api } from '../lib/api';
import { useEffect, useState } from 'react';
import styles from '../styles.module.css';

function LoginScreen() {
  // Providers are advertised by the backend at /api/auth/providers — the
  // server only lists the ones it's configured for (env vars present). The
  // UI follows that source of truth instead of guessing.
  const [providers, setProviders] = useState<AuthProvider[] | null>(null);

  useEffect(() => {
    api
      .listProviders()
      .then(setProviders)
      .catch(() => setProviders([]));
  }, []);

  return (
    <div className={styles.pageCenter}>
      <main className={styles.loginInner}>
        <h1 className={styles.title} style={{ marginBottom: '0.5rem' }}>
          PANSORI
        </h1>
        <p className={styles.loginSub}>SIGN IN TO CONTINUE YOUR MISSION</p>
        {providers === null ? (
          <p className={styles.loginSub} style={{ marginTop: '1rem' }}>
            LOADING...
          </p>
        ) : providers.length === 0 ? (
          <p className={styles.loginSub} style={{ marginTop: '1rem' }}>
            NO AUTH PROVIDERS CONFIGURED
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {providers.map((p) => (
              <a
                key={p.id}
                href={`/api/auth/${p.id}`}
                className={styles.providerBtn}
                data-testid={`auth-provider-${p.id}`}
              >
                {p.label.toUpperCase()}
              </a>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export default LoginScreen;
