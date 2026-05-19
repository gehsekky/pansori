import { CombatEvent } from '../types';
import styles from '../styles.module.css';

// Renders the structured combat event log alongside the prose narrative.
// Events are styled per kind so the mechanical content (rolls, damage,
// kills) is scannable at a glance — different from the immersive narrative
// panel. Hidden when there's nothing to show.

interface Props {
  events: CombatEvent[] | undefined;
}

// Decorative glyph + screen-reader text are returned separately so the glyph
// can be marked aria-hidden — otherwise SR reads "skull" or "high voltage"
// alongside the real event description.
function formatEvent(e: CombatEvent): {
  glyph: string | null;
  label: string;
  color: string;
} {
  switch (e.kind) {
    case 'attack_hit': {
      const crit = e.isCrit ? ' CRIT' : '';
      return {
        glyph: null,
        label: `${e.attackerName} → ${e.targetName}: HIT${crit} ${e.damage} ${e.damageType} (${e.toHit} vs AC ${e.targetAc})`,
        color: e.isCrit ? 'var(--t-warn, #ff9)' : 'var(--t-primary)',
      };
    }
    case 'attack_miss':
      return {
        glyph: null,
        label: `${e.attackerName} → ${e.targetName}: MISS (${e.toHit} vs AC ${e.targetAc})`,
        color: 'var(--t-dim)',
      };
    case 'kill':
      return {
        glyph: '💀',
        label: `${e.victimName} falls (${e.attackerName}) +${e.xp} XP`,
        color: 'var(--t-warn, #ff9)',
      };
    case 'condition_applied':
      return {
        glyph: null,
        label: `${e.targetName}: ${e.condition.toUpperCase()} (${e.source})`,
        color: 'var(--t-primary)',
      };
    case 'save':
      return {
        glyph: null,
        label: `${e.characterName}: ${e.ability.toUpperCase()} save ${e.roll} vs DC ${e.dc} — ${e.success ? 'SUCCESS' : 'FAIL'} (${e.vs})`,
        color: e.success ? 'var(--t-primary)' : 'var(--t-dim)',
      };
    case 'phase_transition':
      return {
        glyph: '⚡',
        label: `${e.bossName} — ${e.phaseName.toUpperCase()}: ${e.narrative}`,
        color: 'var(--t-warn, #ff9)',
      };
  }
}

function CombatLogPanel({ events }: Props) {
  if (!events || events.length === 0) return null;
  // Show newest first, capped at 12 visible entries (the buffer caps at 30
  // on the backend; we render the most recent slice for compactness).
  const recent = [...events].slice(-12).reverse();
  return (
    <div
      data-testid="combat-log-panel"
      className={styles.card}
      style={{ marginTop: '1rem', maxHeight: 220, overflowY: 'auto' }}
      role="log"
      aria-live="polite"
      aria-atomic="false"
      aria-label="Combat log"
    >
      {recent.map((e, i) => {
        const { glyph, label, color } = formatEvent(e);
        return (
          <p
            key={`${e.round}-${i}-${e.kind}`}
            className={styles.logEntry}
            data-testid="combat-log-entry"
            data-event-kind={e.kind}
            style={{ color, fontFamily: 'monospace', fontSize: '0.78rem' }}
          >
            R{e.round}: {glyph && <span aria-hidden="true">{glyph} </span>}
            {label}
          </p>
        );
      })}
    </div>
  );
}

export default CombatLogPanel;
