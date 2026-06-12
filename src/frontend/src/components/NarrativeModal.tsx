// Reusable NARRATIVE MODAL — long-form story text presented front and center
// in the shared Dialog primitive, with a single CONTINUE affordance. First
// use: the game-start narration (the gameStart pool pick + act opening +
// starter quests). The same text always remains in the center narrative
// pane — this modal is a presentation layer over a moment, never the only
// place the prose lives.

import Dialog from './Dialog.tsx';
import NarrativeText from './NarrativeText.tsx';
import styles from '../styles.module.css';

interface Props {
  title: string;
  text: string;
  onClose: () => void;
  // Test hook + label override so future uses (act transitions, chapter
  // epigraphs) can keep their own identity.
  testId?: string;
  continueLabel?: string;
}

function NarrativeModal({
  title,
  text,
  onClose,
  testId = 'narrative-modal',
  continueLabel = 'CONTINUE',
}: Props) {
  return (
    <Dialog title={title} onClose={onClose} width="640px" testId={testId}>
      <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
        <p className={styles.narrative} style={{ minHeight: 0, margin: 0 }}>
          <NarrativeText text={text} />
        </p>
      </div>
      <button
        className={styles.submit}
        style={{ marginTop: '1.25rem' }}
        onClick={onClose}
        data-testid="narrative-modal-continue"
      >
        {continueLabel}
      </button>
    </Dialog>
  );
}

export default NarrativeModal;
