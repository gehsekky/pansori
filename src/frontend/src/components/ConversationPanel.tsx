import type { GameChoice } from '../types';
import styles from '../styles.module.css';

interface Props {
  npcName: string;
  // The NPC's current line (greeting, or the reply to the last pick).
  prompt: string;
  // The active conversation's choices (kind === 'conversation') — the response
  // options at the current node, then Back (when nested), then End conversation.
  choices: GameChoice[];
  // seenKeys the player has already clicked (GameState.seen_choices) — a
  // response whose seenKey is in here renders dimmed, so previously-explored
  // dialogue branches read as "already asked".
  seenChoices: string[];
  onChoose: (c: GameChoice) => void;
}

/**
 * The dedicated NPC-dialogue panel. Shown (in place of the normal action area)
 * whenever a conversation is active: a header naming the NPC, their current
 * line, and the dialogue options. Back / End conversation arrive as ordinary
 * `kind:'conversation'` choices from the backend and render at the bottom.
 */
function ConversationPanel({ npcName, prompt, choices, seenChoices, onChoose }: Props) {
  // Split control choices (Back / End conversation) from the dialogue responses
  // so they can sit visually apart at the bottom.
  const isControl = (c: GameChoice) =>
    c.action.type === 'conversation_back' || c.action.type === 'end_conversation';
  const responses = choices.filter((c) => !isControl(c));
  const controls = choices.filter(isControl);
  const seenSet = new Set(seenChoices);

  return (
    <div className={styles.conversationPanel} data-testid="conversation-panel">
      <div className={styles.conversationHeader}>Talking to {npcName.toUpperCase()}</div>
      <p className={styles.conversationPrompt}>{prompt}</p>
      <ul className={styles.conversationChoices} aria-label={`Replies to ${npcName}`}>
        {responses.map((c, i) => {
          // A reply already picked (its seenKey recorded) renders dimmed — the
          // player can still re-ask, it just reads as "explored".
          const seen = !!c.seenKey && seenSet.has(c.seenKey);
          return (
            <li key={`r${i}`} style={{ listStyle: 'none' }}>
              <button
                data-testid="conversation-choice"
                data-action-type={c.action.type}
                data-seen={seen ? 'true' : undefined}
                className={`${styles.choiceBtn} ${seen ? styles.choiceBtnSeen : ''}`}
                onClick={() => onChoose(c)}
              >
                <span aria-hidden="true">[{i + 1}] </span>
                {c.label}
              </button>
            </li>
          );
        })}
      </ul>
      {controls.length > 0 && (
        <div className={styles.conversationControls}>
          {controls.map((c, i) => (
            <button
              key={`c${i}`}
              data-testid="conversation-choice"
              data-action-type={c.action.type}
              className={styles.conversationControlBtn}
              onClick={() => onChoose(c)}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default ConversationPanel;
