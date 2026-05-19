import type { GameState, Seed } from '../types.js';
import Dialog from './Dialog.tsx';
import styles from '../styles.module.css';

interface Props {
  seed: Seed;
  state: GameState;
  onClose: () => void;
}

export default function WorldMap({ seed, state, onClose }: Props) {
  const rooms = seed.rooms;
  const n = rooms.length;

  const svgW = 580;
  const svgH = 210;
  const padX = 46;
  const nodeY = 105;
  const R = 21;
  const step = n > 1 ? (svgW - padX * 2) / (n - 1) : 0;
  const cx = (i: number) => padX + i * step;

  const idxOf = Object.fromEntries(rooms.map((r, i) => [r.id, i]));

  const seen = new Set<string>();
  const edges: { a: number; b: number; cross: boolean }[] = [];
  for (const [fromId, targets] of Object.entries(seed.connections)) {
    const a = idxOf[fromId];
    for (const toId of targets) {
      const b = idxOf[toId];
      const key = `${Math.min(a, b)}-${Math.max(a, b)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ a: Math.min(a, b), b: Math.max(a, b), cross: Math.abs(b - a) > 1 });
    }
  }

  const visited = (id: string) => state.visited_rooms.includes(id);
  const current = (id: string) => state.current_room === id;
  const enemy = (id: string) => {
    const roomEnemies = seed.enemies?.[id] ?? [];
    return roomEnemies.some((e) => !state.enemies_killed.includes(e.id));
  };
  const loot = (id: string) => !!seed.loot?.[id] && !state.loot_taken.includes(id);
  const visitedSet = new Set(state.visited_rooms);
  const revealed = (id: string) =>
    visitedSet.has(id) ||
    (seed.connections[id] ?? []).some((adj) => visitedSet.has(adj)) ||
    Object.entries(seed.connections).some(
      ([from, targets]) => visitedSet.has(from) && targets.includes(id)
    );

  return (
    <Dialog
      title={`WORLD MAP — ${(seed.world_name || seed.ship_name || '').toUpperCase()}`}
      onClose={onClose}
      testId="world-map"
    >
      <svg width={svgW} height={svgH} style={{ display: 'block', overflow: 'visible' }}>
        {edges
          .filter(
            ({ a, b }) => rooms[a] && rooms[b] && revealed(rooms[a].id) && revealed(rooms[b].id)
          )
          .map(({ a, b, cross }) => {
            const x1 = cx(a),
              x2 = cx(b);
            if (cross) {
              const mx = (x1 + x2) / 2;
              const arc = nodeY - 52 - (b - a) * 6;
              return (
                <path
                  key={`e${a}-${b}`}
                  d={`M ${x1} ${nodeY} Q ${mx} ${arc} ${x2} ${nodeY}`}
                  fill="none"
                  stroke="var(--t-border)"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                />
              );
            }
            return (
              <line
                key={`e${a}-${b}`}
                x1={x1}
                y1={nodeY}
                x2={x2}
                y2={nodeY}
                stroke="var(--t-border)"
                strokeWidth={1.5}
              />
            );
          })}

        {rooms
          .filter((room) => revealed(room.id))
          .map((room) => {
            const i = idxOf[room.id];
            const x = cx(i);
            const isCur = current(room.id);
            const isVis = visited(room.id);
            const hasEnemy = isVis && enemy(room.id);
            const hasLoot = isVis && loot(room.id);
            const stroke = isCur ? 'var(--t-primary)' : isVis ? 'var(--t-mid)' : 'var(--t-border)';
            const fill = isCur ? 'var(--t-separator)' : 'var(--t-card)';
            const tColor = isCur ? 'var(--t-primary)' : isVis ? 'var(--t-mid)' : 'var(--t-dim)';
            const label =
              isVis || isCur
                ? (room.name.length > 11 ? room.name.slice(0, 10) + '…' : room.name).toUpperCase()
                : '???';

            return (
              <g key={room.id}>
                {isCur && (
                  <circle
                    cx={x}
                    cy={nodeY}
                    r={R + 6}
                    fill="none"
                    stroke="var(--t-primary)"
                    strokeWidth={1}
                    opacity={0.35}
                    style={{ filter: 'blur(3px)' }}
                  />
                )}
                <circle
                  cx={x}
                  cy={nodeY}
                  r={R}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={isCur ? 2 : 1.5}
                />
                {hasEnemy && (
                  <circle
                    cx={x + R - 4}
                    cy={nodeY - R + 4}
                    r={5}
                    fill="var(--t-hp-low)"
                    stroke="var(--t-card)"
                    strokeWidth={1.5}
                  />
                )}
                {hasLoot && (
                  <circle
                    cx={x - R + 4}
                    cy={nodeY - R + 4}
                    r={5}
                    fill="var(--t-hp-high)"
                    stroke="var(--t-card)"
                    strokeWidth={1.5}
                  />
                )}
                <text
                  x={x}
                  y={nodeY + R + 14}
                  textAnchor="middle"
                  fontSize={9}
                  fill={tColor}
                  fontFamily="var(--t-font)"
                  letterSpacing="0.06em"
                >
                  {label}
                </text>
              </g>
            );
          })}
      </svg>

      <div className={styles.mapLegend}>
        <span>
          <span aria-hidden="true" style={{ color: 'var(--t-primary)' }}>
            ●
          </span>{' '}
          YOU ARE HERE
        </span>
        <span>
          <span aria-hidden="true" style={{ color: 'var(--t-mid)' }}>
            ●
          </span>{' '}
          VISITED
        </span>
        <span>
          <span aria-hidden="true" style={{ color: 'var(--t-border)' }}>
            ●
          </span>{' '}
          UNKNOWN
        </span>
        <span>
          <span aria-hidden="true" style={{ color: 'var(--t-hp-low)' }}>
            ●
          </span>{' '}
          ENEMY
        </span>
        <span>
          <span aria-hidden="true" style={{ color: 'var(--t-hp-high)' }}>
            ●
          </span>{' '}
          LOOT
        </span>
      </div>
    </Dialog>
  );
}
