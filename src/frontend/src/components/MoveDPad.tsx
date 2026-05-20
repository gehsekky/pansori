import {
  ArrowDown,
  ArrowDownLeft,
  ArrowDownRight,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpLeft,
  ArrowUpRight,
} from '@phosphor-icons/react';
import type { ChoiceDirection, GameChoice } from '../types.ts';
import type { ComponentType } from 'react';
import styles from '../styles.module.css';

// Renders the 8 cardinal/ordinal movement choices as a compact 3x3 grid —
// big UX win over an 8-row vertical text list. The center cell shows
// remaining movement so the player can see their budget at a glance.
//
// Choices are placed into cells by their `direction` tag (set on the
// backend). Directions without a legal choice render as disabled
// placeholders so the grid stays a stable 3x3 (less layout flicker as
// adjacent enemies / map edges open and close cells).

const ICONS: Record<ChoiceDirection, ComponentType<{ size?: number; weight?: 'bold' }>> = {
  NW: ArrowUpLeft,
  N: ArrowUp,
  NE: ArrowUpRight,
  W: ArrowLeft,
  E: ArrowRight,
  SW: ArrowDownLeft,
  S: ArrowDown,
  SE: ArrowDownRight,
};

// Visual order, top-to-bottom + left-to-right. The center cell (index 4)
// is the movement readout, not a button.
const CELLS: Array<ChoiceDirection | 'center'> = [
  'NW', 'N', 'NE',
  'W', 'center', 'E',
  'SW', 'S', 'SE',
];

interface Props {
  choices: GameChoice[];
  onChoose: (choice: GameChoice) => void;
  disabled?: boolean;
}

// Pull the "[Nft left]" tail out of the backend label so we can show
// remaining feet in the center cell. Falls back to a generic glyph if
// the format changes.
function extractRemaining(label: string): string | null {
  const m = label.match(/\[(\d+)ft left\]/);
  return m ? `${m[1]} ft` : null;
}

function MoveDPad({ choices, onChoose, disabled }: Props) {
  const byDir = new Map<ChoiceDirection, GameChoice>();
  for (const c of choices) {
    if (c.direction) byDir.set(c.direction, c);
  }
  if (byDir.size === 0) return null;
  // Any one choice's "N ft left" tail is the current remaining budget.
  const remaining = extractRemaining(choices[0]?.label ?? '');

  return (
    <div
      data-testid="move-dpad"
      className={styles.dpad}
      role="group"
      aria-label="Movement"
    >
      {CELLS.map((cell, i) => {
        if (cell === 'center') {
          return (
            <div key={i} className={styles.dpadCenter} aria-hidden="true">
              {remaining ?? '—'}
            </div>
          );
        }
        const choice = byDir.get(cell);
        const Icon = ICONS[cell];
        if (!choice) {
          return (
            <button
              key={i}
              type="button"
              className={`${styles.dpadBtn} ${styles.dpadBtnDisabled}`}
              disabled
              aria-label={`Move ${cell} — not available`}
              data-direction={cell}
            >
              <Icon size={20} />
            </button>
          );
        }
        return (
          <button
            key={i}
            type="button"
            className={styles.dpadBtn}
            onClick={() => onChoose(choice)}
            disabled={disabled}
            aria-label={choice.label}
            data-direction={cell}
            data-testid={`move-dpad-${cell}`}
          >
            <Icon size={20} weight="bold" />
          </button>
        );
      })}
    </div>
  );
}

export default MoveDPad;
