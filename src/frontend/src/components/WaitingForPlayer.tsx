import styles from '../styles.module.css';

interface Props {
  // Display name of the player or PC the current user is waiting on.
  name: string;
  // Optional flavor — "is acting", "is choosing a reaction", "is in
  // dialogue", etc. Lets the caller customize the wait copy without
  // hardcoding strings in this component.
  reason?: string;
}

// Rendered in place of the action panel when the active character's
// owner isn't the current user. Solo mode never sees this — every PC
// is owned by the host so the check always passes.
//
// Multiplayer MVP behavior: every participant gets the full narrative
// chat via Socket.IO state broadcasts; only the player whose PC is
// currently active sees the action buttons. This component is the
// "you don't have the talking stick" affordance for the rest.
function WaitingForPlayer({ name, reason }: Props) {
  return (
    <div
      className={styles.waitingForPlayer}
      role="status"
      aria-live="polite"
      data-testid="waiting-for-player"
    >
      <span className={styles.waitingForPlayerSpinner} aria-hidden="true">
        ◐
      </span>
      <span>
        Waiting for <strong>{name}</strong> {reason ?? 'to finish their turn'}…
      </span>
    </div>
  );
}

export default WaitingForPlayer;
