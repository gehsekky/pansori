import type { ChoiceKind, GameChoice } from '../types.ts';
import RaIcon from './RaIcon.tsx';
import styles from '../styles.module.css';

// Horizontal icon row for the target-bearing combat verbs the engine
// surfaces today: Attack / Grapple / Shove / Two-Weapon Attack. Each
// pairs with the EnemySelector — the player picks a target there, the
// CombatActionBar picks the verb. The wiring is: App.tsx already
// filters choices to the selected enemy, so any choice with the right
// `kind` that reaches this component is the right one to dispatch.
//
// Cast Spell intentionally stays in the numbered text list — it varies
// by spell + slot level, so collapsing to one button would lose the
// choice. Same for non-target combat verbs like Cunning Action /
// Channel Divinity / class features — they each have their own niche.

interface ActionDef {
  kind: ChoiceKind;
  icon: string; // rpg-awesome name (without the `ra-` prefix)
  shortLabel: string;
}

const ACTIONS: ActionDef[] = [
  { kind: 'attack', icon: 'crossed-swords', shortLabel: 'Attack' },
  { kind: 'two_weapon_attack', icon: 'dervish-swords', shortLabel: 'Off-hand' },
  { kind: 'grapple', icon: 'grappling-hook', shortLabel: 'Grapple' },
  { kind: 'shove', icon: 'sideswipe', shortLabel: 'Shove' },
];

interface Props {
  choices: GameChoice[];
  onChoose: (choice: GameChoice) => void;
  disabled?: boolean;
}

function CombatActionBar({ choices, onChoose, disabled }: Props) {
  // After the EnemySelector filter upstream, at most one choice per
  // combat kind should remain. Keep the first if duplicates ever slip
  // through (defensive — multiple grapple variants would mean the
  // engine emitted unfiltered choices).
  const byKind = new Map<ChoiceKind, GameChoice>();
  for (const c of choices) {
    if (c.kind && !byKind.has(c.kind)) byKind.set(c.kind, c);
  }
  const anyAvailable = ACTIONS.some((a) => byKind.has(a.kind));
  if (!anyAvailable) return null;
  return (
    <div
      data-testid="combat-action-bar"
      className={styles.inlineActionBar}
      role="group"
      aria-label="Combat actions"
    >
      {ACTIONS.map((def) => {
        const choice = byKind.get(def.kind);
        const enabled = !!choice && !disabled;
        return (
          <button
            key={def.kind}
            type="button"
            className={`${styles.inlineActionBtn} ${enabled ? '' : styles.inlineActionBtnDisabled}`}
            disabled={!enabled}
            aria-label={choice?.label ?? `${def.shortLabel} — not available`}
            title={choice?.label ?? `${def.shortLabel} — not available`}
            data-action-kind={def.kind}
            data-testid={`combat-${def.kind}`}
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

export default CombatActionBar;
