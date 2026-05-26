import Dialog from './Dialog.tsx';
import styles from '../styles.module.css';
import { useState } from 'react';

export interface TargetCandidate {
  id: string;
  name: string;
  // Optional secondary line (e.g. "Cleric · HP 11/11").
  sub?: string;
}

interface Props {
  title: string;
  // One-line instruction shown above the list.
  prompt: string;
  candidates: TargetCandidate[];
  // Max selectable (e.g. Bless = 3, +1 per slot above 1st).
  max: number;
  // Pre-selected ids; defaults to the first `max` candidates (mirrors the
  // backend's prior auto-pick, so confirming without changes is a no-op).
  initial?: string[];
  onCancel: () => void;
  onConfirm: (ids: string[]) => void;
}

// Generic 1..max target picker for spells whose caster chooses recipients
// (Bless allies; Bane enemies follow). Surfaced when a GameChoice carries a
// `pickTargets` hint; on confirm the chosen ids ride back on the cast action.
function TargetPickerDialog({
  title,
  prompt,
  candidates,
  max,
  initial,
  onCancel,
  onConfirm,
}: Props) {
  const [selected, setSelected] = useState<string[]>(() =>
    (initial ?? candidates.map((c) => c.id)).slice(0, max)
  );

  function toggle(id: string) {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((p) => p !== id);
      if (prev.length >= max) return prev; // cap reached — ignore
      return [...prev, id];
    });
  }

  const canConfirm = selected.length >= 1 && selected.length <= max;

  return (
    <Dialog
      title={title}
      onClose={onCancel}
      width="min(520px, calc(100vw - 1.5rem))"
      testId="target-picker-dialog"
    >
      <div className={styles.spellPickerScroll}>
        <p style={{ color: 'var(--t-mid)', fontSize: '0.85rem', marginTop: 0 }}>
          {prompt} — choose up to {max} ({selected.length}/{max}).
        </p>
        <div className={styles.invBody}>
          {candidates.map((c) => {
            const picked = selected.includes(c.id);
            const limitHit = !picked && selected.length >= max;
            return (
              <div
                key={c.id}
                className={styles.invItem}
                data-testid={`target-picker-item-${c.id}`}
                style={limitHit ? { opacity: 0.55 } : undefined}
              >
                <label
                  style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}
                  className={styles.invItemHeader}
                >
                  <input
                    type="checkbox"
                    checked={picked}
                    disabled={limitHit}
                    onChange={() => toggle(c.id)}
                    data-testid={`target-picker-input-${c.id}`}
                  />
                  <span style={{ flex: 1 }}>
                    <span className={styles.invItemName}>{c.name}</span>
                    {c.sub ? <div className={styles.invItemDesc}>{c.sub}</div> : null}
                  </span>
                </label>
              </div>
            );
          })}
        </div>
        <button
          className={styles.choiceBtn}
          disabled={!canConfirm}
          onClick={() => onConfirm(selected)}
          data-testid="target-picker-confirm"
          style={{ marginTop: '0.75rem' }}
        >
          Cast on {selected.length} target{selected.length === 1 ? '' : 's'}
        </button>
      </div>
    </Dialog>
  );
}

export default TargetPickerDialog;
