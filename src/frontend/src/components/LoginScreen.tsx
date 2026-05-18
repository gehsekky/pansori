import styles from '../styles.module.css';

function LoginScreen() {
  const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';
  return (
    <div className={styles.pageCenter}>
      <div className={styles.loginInner}>
        <p className={styles.title} style={{ marginBottom: '0.5rem' }}>
          PANSORI
        </p>
        <p className={styles.loginSub}>SIGN IN TO CONTINUE YOUR MISSION</p>
        <a href={`${BASE}/api/auth/google`} className={styles.googleBtn}>
          SIGN IN WITH GOOGLE
        </a>
      </div>
    </div>
  );
}

export default LoginScreen;
