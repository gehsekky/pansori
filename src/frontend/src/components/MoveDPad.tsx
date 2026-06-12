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
import { type ComponentType, useEffect, useRef, useState } from 'react';
import styles from '../styles.module.css';

// Renders the 8 cardinal/ordinal movement choices as a compact 3x3 grid —
// big UX win over an 8-row vertical text list. The center cell shows
// remaining movement so the player can see their budget at a glance.
//
// Choices are placed into cells by their `direction` tag (set on the
// backend). Directions without a legal choice render as disabled
// placeholders so the grid stays a stable 3x3 (less layout flicker as
// adjacent enemies / map edges open and close cells).
//
// Keyboard navigation: roving tabindex (only one cell holds tabindex=0
// at a time) + arrow-key movement between cells. Matches the WAI-ARIA
// Composite Widget pattern — pressing Tab into the grid lands on the
// most-recently-focused cell, and arrow keys move spatially from there.
// Enter / Space on the focused cell dispatches the move.

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
  'NW',
  'N',
  'NE',
  'W',
  'center',
  'E',
  'SW',
  'S',
  'SE',
];

// Arrow-key → target cell maps. For each (current cell, direction) pair,
// where does focus move? The grid is row-major:
//   [NW N  NE]
//   [W  ·  E ]
//   [SW S  SE]
// We skip the center cell on traversal — focus jumps over it.
const ARROW_NEXT: Record<
  ChoiceDirection,
  Partial<Record<'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight', ChoiceDirection>>
> = {
  NW: { ArrowRight: 'N', ArrowDown: 'W' },
  N: { ArrowLeft: 'NW', ArrowRight: 'NE', ArrowDown: 'S' },
  NE: { ArrowLeft: 'N', ArrowDown: 'E' },
  W: { ArrowUp: 'NW', ArrowDown: 'SW', ArrowRight: 'E' },
  E: { ArrowUp: 'NE', ArrowDown: 'SE', ArrowLeft: 'W' },
  SW: { ArrowUp: 'W', ArrowRight: 'S' },
  S: { ArrowUp: 'N', ArrowLeft: 'SW', ArrowRight: 'SE' },
  SE: { ArrowUp: 'E', ArrowLeft: 'S' },
};

interface Props {
  choices: GameChoice[];
  onChoose: (choice: GameChoice) => void;
  disabled?: boolean;
  /** Camera quadrant (0–3) when the battlefield is the 3D diorama: how many
   * 90° steps the orbit camera sits from its default south-side view. The pad
   * rotates its LAYOUT to match, so the up arrow always moves "away from the
   * camera" — what the player sees, not grid-absolute north. 0/undefined = the
   * 2D grid (and the diorama's default view), where layout = grid directions. */
  cameraQuadrant?: number;
}

// Clockwise compass cycle for the layout rotation.
const CYCLE: ChoiceDirection[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

/** The VISUAL cell a grid direction lands in, given the camera quadrant. */
export function visualCellFor(dir: ChoiceDirection, cameraQuadrant: number): ChoiceDirection {
  const q = ((cameraQuadrant % 4) + 4) % 4;
  return CYCLE[(CYCLE.indexOf(dir) + 2 * q) % 8];
}

// Pull the "[Nft left]" tail out of the backend label so we can show
// remaining feet in the center cell. Falls back to a generic glyph if
// the format changes.
function extractRemaining(label: string): string | null {
  const m = label.match(/\[(\d+)ft left\]/);
  return m ? `${m[1]} ft` : null;
}

function MoveDPad({ choices, onChoose, disabled, cameraQuadrant = 0 }: Props) {
  // Keyed by VISUAL cell — placement, focus traversal, and testids all speak
  // screen positions; each button still dispatches its true grid choice.
  const byDir = new Map<ChoiceDirection, GameChoice>();
  for (const c of choices) {
    if (c.direction) byDir.set(visualCellFor(c.direction, cameraQuadrant), c);
  }
  // Track the currently-focused cell so we can roving-tabindex it. Initial
  // focus lands on the first available direction (skip disabled cells so
  // a Tab into the grid never lands on a non-actionable button).
  const directionsInOrder: ChoiceDirection[] = ['NW', 'N', 'NE', 'W', 'E', 'SW', 'S', 'SE'];
  const firstAvailable = directionsInOrder.find((d) => byDir.has(d)) ?? 'N';
  const [focusedCell, setFocusedCell] = useState<ChoiceDirection>(firstAvailable);
  const cellRefs = useRef<Partial<Record<ChoiceDirection, HTMLButtonElement | null>>>({});

  // Restore focus to whichever cell the user just moved to. This runs only
  // when focusedCell changes (i.e. via the keyboard handler), so it doesn't
  // steal focus on every render — only when the player navigates.
  const lastFocusedRef = useRef<ChoiceDirection>(focusedCell);
  useEffect(() => {
    if (lastFocusedRef.current !== focusedCell) {
      cellRefs.current[focusedCell]?.focus();
      lastFocusedRef.current = focusedCell;
    }
  }, [focusedCell]);

  if (byDir.size === 0) return null;
  // Any one choice's "N ft left" tail is the current remaining budget.
  const remaining = extractRemaining(choices[0]?.label ?? '');

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const key = e.key;
    if (key !== 'ArrowUp' && key !== 'ArrowDown' && key !== 'ArrowLeft' && key !== 'ArrowRight') {
      return;
    }
    const next = ARROW_NEXT[focusedCell]?.[key];
    if (!next) return;
    e.preventDefault();
    // Skip past disabled cells in the chosen direction so arrow keys
    // never strand focus on an unactionable button. Keep walking until
    // we hit an available choice or run out of grid.
    let cursor: ChoiceDirection | undefined = next;
    const visited = new Set<ChoiceDirection>();
    while (cursor && !byDir.has(cursor) && !visited.has(cursor)) {
      visited.add(cursor);
      cursor = ARROW_NEXT[cursor]?.[key];
    }
    if (cursor && byDir.has(cursor)) setFocusedCell(cursor);
  }

  return (
    <div
      data-testid="move-dpad"
      className={styles.dpad}
      role="group"
      aria-label="Movement"
      onKeyDown={handleKeyDown}
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
        const isFocused = cell === focusedCell;
        if (!choice) {
          return (
            <button
              key={i}
              type="button"
              className={`${styles.dpadBtn} ${styles.dpadBtnDisabled}`}
              disabled
              tabIndex={-1}
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
            ref={(el) => {
              cellRefs.current[cell] = el;
            }}
            type="button"
            className={styles.dpadBtn}
            onClick={() => onChoose(choice)}
            onFocus={() => setFocusedCell(cell)}
            disabled={disabled}
            // Roving tabindex: only the focused cell is reachable via Tab;
            // arrow keys move focus among the others.
            tabIndex={isFocused ? 0 : -1}
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
