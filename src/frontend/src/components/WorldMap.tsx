import { useEffect } from 'react';
import type { GameState, Seed } from '../types.js';

interface Props {
  seed: Seed;
  state: GameState;
  onClose: () => void;
}

export default function WorldMap({ seed, state, onClose }: Props) {
  const rooms = seed.rooms;
  const n = rooms.length;

  // Layout constants
  const svgW = 580;
  const svgH = 210;
  const padX = 46;
  const nodeY = 105;
  const R = 21;
  const step = n > 1 ? (svgW - padX * 2) / (n - 1) : 0;
  const cx = (i: number) => padX + i * step;

  // Index lookup for edge rendering
  const idxOf = Object.fromEntries(rooms.map((r, i) => [r.id, i]));

  // Deduplicate and classify edges
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

  // Node state helpers
  const visited = (id: string) => state.visited_rooms.includes(id);
  const current = (id: string) => state.current_room === id;
  const enemy = (id: string) => !!seed.enemies?.[id] && !state.enemies_killed.includes(id);
  const loot = (id: string) => !!seed.loot?.[id] && !state.loot_taken.includes(id);

  // Fog of war: a room is revealed if visited OR adjacent to a visited room
  const visitedSet = new Set(state.visited_rooms);
  const revealed = (id: string) => {
    if (visitedSet.has(id)) return true;
    return (
      (seed.connections[id] ?? []).some(adj => visitedSet.has(adj)) ||
      Object.entries(seed.connections).some(
        ([from, targets]) => visitedSet.has(from) && targets.includes(id)
      )
    );
  };

  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', fn);
    return () => document.removeEventListener('keydown', fn);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.78)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 200,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--t-card)',
          border: '1px solid var(--t-border)',
          padding: '1.25rem 1.5rem',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1rem',
          }}
        >
          <p
            style={{
              fontSize: '0.7rem',
              letterSpacing: '0.18em',
              color: 'var(--t-dim)',
              margin: 0,
            }}
          >
            WORLD MAP — {(seed.world_name || seed.ship_name || '').toUpperCase()}
          </p>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--t-dim)',
              cursor: 'pointer',
              fontSize: '1rem',
              fontFamily: 'inherit',
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        {/* SVG map */}
        <svg width={svgW} height={svgH} style={{ display: 'block', overflow: 'visible' }}>
          {/* Edges — only draw if both endpoints are revealed */}
          {edges
            .filter(({ a, b }) => rooms[a] && rooms[b] && revealed(rooms[a].id) && revealed(rooms[b].id))
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

          {/* Nodes — only draw if revealed */}
          {rooms
            .filter(room => revealed(room.id))
            .map((room, _i) => {
              const i = idxOf[room.id];
              const x = cx(i);
              const isCur = current(room.id);
              const isVis = visited(room.id);
              // Enemy/loot dots only appear after you've visited (can't scout from outside)
              const hasEnemy = isVis && enemy(room.id);
              const hasLoot = isVis && loot(room.id);

              const stroke = isCur
                ? 'var(--t-primary)'
                : isVis
                  ? 'var(--t-mid)'
                  : 'var(--t-border)';
              const fill = isCur ? 'var(--t-separator)' : 'var(--t-card)';
              const tColor = isCur ? 'var(--t-primary)' : isVis ? 'var(--t-mid)' : 'var(--t-dim)';
              const label =
                isVis || isCur
                  ? (room.name.length > 11 ? room.name.slice(0, 10) + '…' : room.name).toUpperCase()
                  : '???';

              return (
                <g key={room.id}>
                  {/* Glow ring for current room */}
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

                  {/* Room circle */}
                  <circle
                    cx={x}
                    cy={nodeY}
                    r={R}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={isCur ? 2 : 1.5}
                  />

                  {/* Enemy dot (top-right) */}
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

                  {/* Loot dot (top-left) */}
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

                  {/* Room label */}
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

        {/* Legend */}
        <div
          style={{
            display: 'flex',
            gap: '1.25rem',
            marginTop: '1rem',
            fontSize: '0.62rem',
            color: 'var(--t-dim)',
            letterSpacing: '0.08em',
          }}
        >
          <span>
            <span style={{ color: 'var(--t-primary)' }}>●</span> YOU ARE HERE
          </span>
          <span>
            <span style={{ color: 'var(--t-mid)' }}>●</span> VISITED
          </span>
          <span>
            <span style={{ color: 'var(--t-border)' }}>●</span> UNKNOWN
          </span>
          <span>
            <span style={{ color: 'var(--t-hp-low)' }}>●</span> ENEMY
          </span>
          <span>
            <span style={{ color: 'var(--t-hp-high)' }}>●</span> LOOT
          </span>
        </div>
      </div>
    </div>
  );
}
