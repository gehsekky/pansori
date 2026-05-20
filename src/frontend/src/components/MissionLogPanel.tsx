import { useState } from 'react';
import styles from '../styles.module.css';

interface Props {
  history: Array<{ content: string; [key: string]: unknown }>;
  // Optional metadata for the copy-to-clipboard header. The on-screen
  // panel still renders the same reverse-chronological list of last 20
  // assistant turns; the copy export covers the full log + this header.
  worldName?: string;
  party?: Array<{ name: string; character_class: string; hp: number; max_hp: number }>;
  currentRoom?: string;
}

// Reverse-chronological mission narrative — pulls every other entry from the
// `history` stream (assistant/user are interleaved) and renders the last 20.
// A "Copy log" button at the top serializes the FULL chronological log
// (oldest first) to the clipboard with a metadata header — formatted for
// pasting into a chat with the engine's author for analysis.

function MissionLogPanel({ history, worldName, party, currentRoom }: Props) {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle');

  // The assistant turns we display. The interleaved stream is
  // [user, assistant, user, assistant, ...] — every other entry starting
  // at index 0 is what the engine emitted. (The reversed view below
  // shows the most recent first; the copy view stays chronological.)
  const assistantEntries = history.filter((_, i) => i % 2 === 0);

  function buildCopyText(): string {
    const headerLines: string[] = ['=== Pansori Mission Log ==='];
    if (worldName) headerLines.push(`Campaign: ${worldName}`);
    if (party && party.length > 0) {
      const partyLine = party
        .map((p) => `${p.name} (${p.character_class}) ${p.hp}/${p.max_hp} HP`)
        .join(', ');
      headerLines.push(`Party: ${partyLine}`);
    }
    if (currentRoom) headerLines.push(`Current room: ${currentRoom}`);
    headerLines.push('');
    const entries = assistantEntries.map((m, i) => {
      const turn = i + 1;
      return `--- Turn ${turn} ---\n${m.content}`;
    });
    return [...headerLines, ...entries].join('\n');
  }

  async function handleCopy() {
    const text = buildCopyText();
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus('copied');
      setTimeout(() => setCopyStatus('idle'), 1500);
    } catch {
      setCopyStatus('error');
      setTimeout(() => setCopyStatus('idle'), 2500);
    }
  }

  if (history.length === 0) {
    return <p className={styles.campaignEmpty}>No actions taken yet.</p>;
  }
  const entries = [...assistantEntries].reverse().slice(0, 20);
  const label = copyStatus === 'copied' ? 'Copied!' : copyStatus === 'error' ? 'Copy failed' : 'Copy log';
  return (
    <>
      <div className={styles.missionLogToolbar}>
        <button
          type="button"
          className={styles.missionLogCopyBtn}
          onClick={handleCopy}
          aria-label="Copy full mission log to clipboard"
          data-testid="mission-log-copy-btn"
        >
          {label}
        </button>
      </div>
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
