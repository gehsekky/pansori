import type { ChoiceKind, GameChoice } from '../types.ts';
import RaIcon from './RaIcon.tsx';
import styles from '../styles.module.css';

// Horizontal row of icon buttons for the universal 5.5e action choices
// the engine surfaces today (Dash / Disengage / Dodge / Ready). Each is a
// no-target action so the button can dispatch the choice directly; multi-
// target actions (Attack, Cast, Help, Grapple, Shove) stay in the regular
// numbered list until we ship a target-picker UX.
//
// Icons sourced from rpg-awesome (loaded globally via main.tsx).
// Button display order is fixed regardless of choice-list ordering so the
// row stays predictable across turns.

interface ActionDef {
  kind: ChoiceKind;
  icon: string; // rpg-awesome name (without the `ra-` prefix)
  shortLabel: string; // visible label under the glyph
}

const ACTIONS: ActionDef[] = [
  { kind: 'dash', icon: 'boot-stomp', shortLabel: 'Dash' },
  { kind: 'disengage', icon: 'player-teleport', shortLabel: 'Disengage' },
  { kind: 'dodge', icon: 'player-dodge', shortLabel: 'Dodge' },
  { kind: 'ready', icon: 'stopwatch', shortLabel: 'Ready' },
];

interface Props {
  choices: GameChoice[];
  onChoose: (choice: GameChoice) => void;
  disabled?: boolean;
}

function DefaultActionBar({ choices, onChoose, disabled }: Props) {
  // Index available choices by kind so each action's button can light up
  // (and dispatch) only when the engine has actually offered it this turn.
  const byKind = new Map<ChoiceKind, GameChoice>();
  for (const c of choices) {
    if (c.kind && !byKind.has(c.kind)) byKind.set(c.kind, c);
  }
  // Hide the bar entirely if no default actions are available — out of
  // combat there's nothing to render and the empty row would just be
  // wasted vertical space.
  const anyAvailable = ACTIONS.some((a) => byKind.has(a.kind));
  if (!anyAvailable) return null;

  return (
    <div
      data-testid="default-action-bar"
      className={styles.actionBar}
      role="group"
      aria-label="Default actions"
    >
      {ACTIONS.map((def) => {
        const choice = byKind.get(def.kind);
        const enabled = !!choice && !disabled;
        return (
          <button
            key={def.kind}
            type="button"
            className={`${styles.actionBtn} ${enabled ? '' : styles.actionBtnDisabled}`}
            disabled={!enabled}
            // Full original label powers the screen-reader announcement
            // and a hover tooltip (so the icon's meaning + the engine's
            // contextual detail are both accessible).
            aria-label={choice?.label ?? `${def.shortLabel} — not available`}
            title={choice?.label ?? `${def.shortLabel} — not available`}
            data-action-kind={def.kind}
            data-testid={`action-${def.kind}`}
            onClick={() => choice && onChoose(choice)}
          >
            <RaIcon name={def.icon} />
            <span className={styles.actionBtnLabel}>{def.shortLabel}</span>
          </button>
        );
      })}
    </div>
  );
}

export default DefaultActionBar;
