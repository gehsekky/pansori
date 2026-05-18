import styles from '../styles.module.css';

function LoginScreen() {
  return (
    <div className={styles.pageCenter}>
      <div className={styles.loginInner}>
        <p className={styles.title} style={{ marginBottom: '0.5rem' }}>
          PANSORI
        </p>
        <p className={styles.loginSub}>SIGN IN TO CONTINUE YOUR MISSION</p>
        <a href="/api/auth/google" className={styles.googleBtn}>
          SIGN IN WITH GOOGLE
        </a>
      </div>
    </div>
  );
}

export default LoginScreen;
