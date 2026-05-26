import Dialog from './Dialog.tsx';
import styles from '../styles.module.css';
import { useState } from 'react';

export interface PickerOption {
  id: string;
  label: string;
  // Optional secondary line (e.g. "CR 1 · 37 HP").
  sub?: string;
}

interface Props {
  title: string;
  // Optional one-line instruction shown above the list.
  prompt?: string;
  options: PickerOption[];
  // Pre-selected id; defaults to the first option.
  initial?: string;
  onCancel: () => void;
  onConfirm: (id: string) => void;
}

// Single-select option picker for spells whose caster chooses one of a fixed
// set of effects/forms (Polymorph's beast form, Greater Restoration's effect).
// Surfaced when a GameChoice carries a `pickOption` hint; on confirm the chosen
// id rides back on the cast action under `pickOption.param`.
function OptionPickerDialog({ title, prompt, options, initial, onCancel, onConfirm }: Props) {
  const [selected, setSelected] = useState<string>(initial ?? options[0]?.id ?? '');

  return (
    <Dialog
      title={title}
      onClose={onCancel}
      width="min(520px, calc(100vw - 1.5rem))"
      testId="option-picker-dialog"
    >
      <div className={styles.spellPickerScroll}>
        {prompt ? (
          <p style={{ color: 'var(--t-mid)', fontSize: '0.85rem', marginTop: 0 }}>{prompt}</p>
        ) : null}
        <div className={styles.invBody}>
          {options.map((o) => {
            const picked = selected === o.id;
            return (
              <div key={o.id} className={styles.invItem} data-testid={`option-picker-item-${o.id}`}>
                <label
                  style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}
                  className={styles.invItemHeader}
                >
                  <input
                    type="radio"
                    name="option-picker"
                    checked={picked}
                    onChange={() => setSelected(o.id)}
                    data-testid={`option-picker-input-${o.id}`}
                  />
                  <span style={{ flex: 1 }}>
                    <span className={styles.invItemName}>{o.label}</span>
                    {o.sub ? <div className={styles.invItemDesc}>{o.sub}</div> : null}
                  </span>
                </label>
              </div>
            );
          })}
        </div>
        <button
          className={styles.choiceBtn}
          disabled={!selected}
          onClick={() => onConfirm(selected)}
          data-testid="option-picker-confirm"
          style={{ marginTop: '0.75rem' }}
        >
          Confirm
        </button>
      </div>
    </Dialog>
  );
}

export default OptionPickerDialog;
