import {
  CLASS_NAMES,
  MULTICLASS_PREREQS,
  canMulticlassInto,
  formatPrereq,
} from '../lib/multiclass';
import type { Character } from '../types';
import Dialog from './Dialog.tsx';
import styles from '../styles.module.css';

interface Props {
  char: Character;
  onClose: () => void;
  onChoose: (className: string) => void;
}

// Manual level-up surface. Shown when the active PC's XP threshold is met
// AND combat is not active. Lists all 12 classes; the primary class is
// always eligible (continuing the existing class), every other class is
// gated by the 2024 PHB multiclass ability-score prereqs. Picking a class
// dispatches `level_up_class { className }`; the backend re-validates +
// applies the level (HP gain, slot recompute, per-class ASI gating,
// proficiency grants on first level in a new class).
function LevelUpDialog({ char, onClose, onChoose }: Props) {
  const primary = char.character_class.toLowerCase();
  const nextLevel = (char.level ?? 1) + 1;

  return (
    <Dialog
      title={`LEVEL UP — ${char.name.toUpperCase()}`}
      onClose={onClose}
      width="min(560px, calc(100vw - 1.5rem))"
      testId="level-up-dialog"
    >
      <p
        style={{
          color: 'var(--t-mid)',
          fontSize: '0.85rem',
          marginTop: 0,
          marginBottom: '0.75rem',
        }}
      >
        Advance to level {nextLevel}. Choose which class to add the level to. Continuing your
        primary class is always available; multiclassing into a new class requires the 2024 PHB
        ability-score minimum for that class.
      </p>
      <div className={styles.invBody}>
        {CLASS_NAMES.map((cls) => {
          const isPrimary = cls === primary;
          const reason = canMulticlassInto(char, cls);
          const eligible = reason === '';
          const req = MULTICLASS_PREREQS[cls];
          const label = cls.charAt(0).toUpperCase() + cls.slice(1);
          return (
            <div
              key={cls}
              className={styles.invItem}
              data-testid={`level-up-class-${cls}`}
              style={!eligible ? { opacity: 0.55 } : undefined}
            >
              <div className={styles.invItemHeader}>
                <span className={styles.invItemName}>
                  {label}
                  {isPrimary && (
                    <span
                      className={styles.invBadge}
                      style={{ color: 'var(--t-primary)', marginLeft: '0.5rem' }}
                    >
                      PRIMARY
                    </span>
                  )}
                </span>
                <span className={styles.invItemMeta}>{isPrimary ? '' : formatPrereq(req)}</span>
              </div>
              {!eligible && (
                <div className={styles.invItemDesc} style={{ color: 'var(--t-hp-low)' }}>
                  {reason}
                </div>
              )}
              <div className={styles.invItemActions}>
                <button
                  className={styles.invBtn}
                  disabled={!eligible}
                  onClick={() => {
                    onChoose(cls);
                    onClose();
                  }}
                  data-testid={`level-up-pick-${cls}`}
                  title={
                    eligible
                      ? `Take level ${nextLevel} in ${label}`
                      : `Cannot multiclass into ${label}: ${reason}`
                  }
                >
                  Level up — {label}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </Dialog>
  );
}

export default LevelUpDialog;
