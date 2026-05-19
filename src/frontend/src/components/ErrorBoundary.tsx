import React from 'react';
import styles from '../styles.module.css';

// Top-level React error boundary. Wraps <App /> so an uncaught render
// error doesn't produce a white screen. The recovery action just reloads
// the page — the session is server-side so state is preserved.

interface State {
  error: Error | null;
}

interface Props {
  children: React.ReactNode;
}

class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Log to console for dev; in production this would also forward to a
    // tracker like Sentry. See docs/TODO.md → observability item.
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary] uncaught render error', error, info);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.error) {
      return (
        <div className={styles.pageCenter}>
          <div className={styles.loginInner}>
            <p className={styles.title} style={{ marginBottom: '0.5rem' }}>
              PANSORI
            </p>
            <p className={styles.loginSub}>SOMETHING WENT WRONG</p>
            <p
              className={styles.loginSub}
              style={{ marginTop: '1rem', maxWidth: 480, lineHeight: 1.5 }}
            >
              The UI crashed unexpectedly. Your session is safe — it lives on the server.
            </p>
            <pre
              style={{
                marginTop: '1rem',
                padding: '0.75rem',
                fontSize: '0.7rem',
                color: 'var(--t-dim)',
                background: 'var(--t-dim-dark)',
                border: '1px solid var(--t-border)',
                maxWidth: 480,
                overflowX: 'auto',
              }}
            >
              {this.state.error.message}
            </pre>
            <button
              type="button"
              onClick={this.handleReload}
              className={styles.providerBtn}
              style={{ marginTop: '1.5rem' }}
            >
              RELOAD
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
