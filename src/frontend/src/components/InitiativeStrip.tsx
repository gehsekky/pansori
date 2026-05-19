import type { GameState, Seed } from '../types';
import styles from '../styles.module.css';

function InitiativeStrip({ state, seed }: { state: GameState; seed: Seed | null }) {
  const order = state.initiative_order;
  if (!order?.length) return null;

  const currentIdx = state.initiative_idx ?? 0;

  return (
    <div className={styles.initiativeStrip}>
      <span className={styles.initiativeLabel} aria-hidden="true">
        INITIATIVE:
      </span>
      <ol
        aria-label="Initiative order"
        style={{
          display: 'contents',
          listStyle: 'none',
          margin: 0,
          padding: 0,
        }}
      >
        {order.map((entry, idx) => {
          const isCurrent = idx === currentIdx;
          const isPast = idx < currentIdx;
          const enemyName = entry.is_enemy
            ? (Object.values(seed?.enemies ?? {})
                .flat()
                .find((e) => e.id === entry.id)?.name ??
              seed?.enemies?.[state.current_room]?.[0]?.name ??
              'Enemy')
            : null;
          const name = entry.is_enemy
            ? enemyName
            : (state.characters.find((c) => c.id === entry.id)?.name ?? 'Hero');
          return (
            <li
              key={`${entry.id}-${idx}`}
              aria-current={isCurrent ? 'true' : undefined}
              style={{
                listStyle: 'none',
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
              {isCurrent && <span aria-hidden="true">▶ </span>}
              {name} ({entry.roll})
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export default InitiativeStrip;
