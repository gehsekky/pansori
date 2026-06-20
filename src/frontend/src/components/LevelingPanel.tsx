import type { GameChoice } from '../types';
import styles from '../styles.module.css';

interface Props {
  // 'roster' lists the party members who can level (enter_leveling entries);
  // 'cascade' drives one member's level-up step (class pick / ASI / mastery).
  mode: 'roster' | 'cascade';
  // The member being leveled (cascade mode only) — for the header.
  memberName?: string;
  // The `kind:'leveling'` choices for the current view (incl. the Back control
  // in cascade mode).
  choices: GameChoice[];
  onChoose: (c: GameChoice) => void;
}

// A short label for the current cascade step, from the choices on offer.
function stepLabel(choices: GameChoice[]): string {
  const t = choices.find((c) => c.action.type !== 'exit_leveling')?.action.type;
  if (t === 'level_up_class') return 'Choose a class to advance';
  if (t === 'apply_asi' || t === 'take_feat') return 'Ability Score Improvement';
  if (t === 'choose_weapon_mastery') return 'Weapon Mastery';
  if (t === 'learn_spell') return 'CHOOSE A SPELL TO LEARN';
  return 'Leveling';
}

/**
 * The leveling pane. Shown (in place of the normal action area) out of combat
 * while the party can level. In ROSTER mode it lists a "Level up X" button per
 * eligible member; clicking one switches to CASCADE mode for that member — the
 * class pick → ASI/feat → weapon-mastery steps, with a Back control at the
 * bottom that returns to the roster. Mirrors the conversation / vendor panes.
 */
function LevelingPanel({ mode, memberName, choices, onChoose }: Props) {
  const isBack = (c: GameChoice) => c.action.type === 'exit_leveling';
  const steps = choices.filter((c) => !isBack(c));
  const back = choices.find(isBack);

  return (
    <div className={styles.levelingPanel} data-testid="leveling-panel">
      {mode === 'roster' ? (
        <div className={styles.levelingHeader}>✨ Level up your party</div>
      ) : (
        <>
          <div className={styles.levelingHeader}>
            Leveling up {(memberName ?? '').toUpperCase()}
          </div>
          <p className={styles.levelingStep}>{stepLabel(steps)}</p>
        </>
      )}
      <ul className={styles.levelingChoices} aria-label="Leveling options">
        {steps.map((c, i) => (
          <li key={`s${i}`} style={{ listStyle: 'none' }}>
            <button
              data-testid="leveling-choice"
              data-action-type={c.action.type}
              className={styles.choiceBtn}
              onClick={() => onChoose(c)}
              style={c.rationale ? { display: 'flex', flexDirection: 'column' } : undefined}
            >
              <span>
                {c.recommended && (
                  // The ★ glyph carries the accent; the visible word
                  // "Recommended" carries the meaning for screen readers
                  // (UI-SPEC accessibility — don't rely on the glyph alone).
                  <span style={{ color: 'var(--t-primary)' }}>★ Recommended </span>
                )}
                {c.label}
              </span>
              {c.rationale && (
                <small style={{ color: 'var(--t-dim)', fontSize: '0.7rem', fontWeight: 400 }}>
                  {c.rationale}
                </small>
              )}
            </button>
          </li>
        ))}
      </ul>
      {back && (
        <div className={styles.conversationControls}>
          <button
            data-testid="leveling-back"
            className={styles.conversationControlBtn}
            onClick={() => onChoose(back)}
          >
            {back.label}
          </button>
        </div>
      )}
    </div>
  );
}

export default LevelingPanel;
