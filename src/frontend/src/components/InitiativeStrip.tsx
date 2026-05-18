import type { GameState, Seed } from '../types';
import styles from '../styles.module.css';

function InitiativeStrip({ state, seed }: { state: GameState; seed: Seed | null }) {
  const order = state.initiative_order;
  if (!order?.length) return null;

  const currentIdx = state.initiative_idx ?? 0;

  return (
    <div className={styles.initiativeStrip}>
      <span className={styles.initiativeLabel}>INITIATIVE:</span>
      {order.map((entry, idx) => {
        const isCurrent = idx === currentIdx;
        const isPast = idx < currentIdx;
        const name = entry.is_enemy
          ? ((seed?.enemies?.[state.current_room] as { name?: string } | undefined)?.name ??
            'Enemy')
          : (state.characters.find((c) => c.id === entry.id)?.name ?? 'Hero');
        return (
          <span
            key={`${entry.id}-${idx}`}
            style={{
              fontSize: '0.7rem',
              letterSpacing: '0.05em',
              padding: '2px 6px',
              border: `1px solid ${isCurrent ? 'var(--t-primary)' : 'var(--t-border)'}`,
              color: isCurrent ? 'var(--t-primary)' : isPast ? 'var(--t-dim)' : 'var(--t-mid)',
              background: isCurrent ? 'var(--t-separator)' : 'transparent',
              opacity: isPast ? 0.5 : 1,
              textDecoration: isPast ? 'line-through' : 'none',
              textShadow: isCurrent ? '0 0 4px var(--t-primary)' : 'none',
            }}
          >
            {isCurrent ? '▶ ' : ''}
            {name} ({entry.roll})
          </span>
        );
      })}
    </div>
  );
}

export default InitiativeStrip;
