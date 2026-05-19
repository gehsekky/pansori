import styles from '../styles.module.css';

interface Props {
  history: Array<{ content: string; [key: string]: unknown }>;
}

// Reverse-chronological mission narrative — pulls every other entry from the
// `history` stream (assistant/user are interleaved) and renders the last 20.
// Used as a tab body inside ContextPanel.

function MissionLogPanel({ history }: Props) {
  if (history.length === 0) {
    return <p className={styles.campaignEmpty}>No actions taken yet.</p>;
  }
  const entries = [...history]
    .reverse()
    .filter((_, i) => i % 2 === 0)
    .slice(0, 20);
  return (
    <>
      {entries.map((m, i) => (
        <p key={i} className={styles.logEntry}>
          <span aria-hidden="true">› </span>
          {m.content}
        </p>
      ))}
    </>
  );
}

export default MissionLogPanel;
