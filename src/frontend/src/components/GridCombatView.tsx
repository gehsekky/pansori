import type { CombatEntity, GameState, GridPos, Seed } from '../types';
import styles from '../styles.module.css';

const SQUARE_SIZE_FT = 5;
const CELL_PX = 32;

interface Props {
  state: GameState;
  seed: Seed;
  gridWidth?: number;
  gridHeight?: number;
}

function chebyshev(a: GridPos, b: GridPos): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

function tokenLabel(name: string): string {
  const first = name.trim()[0] ?? '?';
  return first.toUpperCase();
}

function hpColor(hp: number, maxHp: number): string {
  const pct = maxHp > 0 ? hp / maxHp : 0;
  if (pct <= 0.3) return 'var(--t-hp-low)';
  if (pct <= 0.6) return 'var(--t-hp-mid)';
  return 'var(--t-hp-high)';
}

function conditionBadges(conditions: string[]): string {
  // Compact letter codes for conditions
  const codes: Record<string, string> = {
    prone: 'P',
    grappled: 'G',
    restrained: 'R',
    stunned: 'S',
    paralyzed: 'P!',
    frightened: 'F',
    charmed: 'C',
    poisoned: 'Po',
    blinded: 'Bl',
    deafened: 'D',
    unconscious: 'U',
    incapacitated: 'I',
    raging: 'RG',
    dodging: 'Dg',
  };
  return conditions
    .map((c) => codes[c] ?? c.slice(0, 2).toUpperCase())
    .filter(Boolean)
    .join(' ');
}

function GridCombatView({ state, seed, gridWidth = 10, gridHeight = 10 }: Props) {
  if (!state.combat_active || !state.entities?.length) return null;

  const entities = state.entities;
  const activeId = state.active_character_id;
  const activeChar = state.characters.find((c) => c.id === activeId);
  const activeEntity = entities.find((e) => e.id === activeId && !e.isEnemy);
  const speedFt = activeChar?.speed ?? 30;
  const usedFt = state.movement_used?.[activeId] ?? 0;
  const remainingFt = Math.max(0, speedFt - usedFt);
  const remainingSquares = Math.floor(remainingFt / SQUARE_SIZE_FT);

  // Find enemy lookup map (id → name, ac) from seed for tooltips
  const enemyLookup = new Map<string, { name: string; ac: number }>();
  for (const list of Object.values(seed.enemies ?? {})) {
    for (const e of list) enemyLookup.set(e.id, { name: e.name, ac: e.ac });
  }

  function entityAt(x: number, y: number): CombatEntity | undefined {
    return entities.find((e) => e.pos.x === x && e.pos.y === y && e.hp > 0);
  }

  function isReachable(x: number, y: number): boolean {
    if (!activeEntity || activeChar?.dead) return false;
    if (entityAt(x, y)) return false;
    const dist = chebyshev(activeEntity.pos, { x, y });
    return dist > 0 && dist <= remainingSquares;
  }

  const cells: React.ReactNode[] = [];
  for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
      const ent = entityAt(x, y);
      const reachable = isReachable(x, y);
      const isActive = ent && ent.id === activeId && !ent.isEnemy;

      let bg = 'transparent';
      if (reachable) bg = 'rgba(120, 200, 255, 0.10)';

      const token = ent ? (
        <div
          className={styles.gridToken}
          title={
            ent.isEnemy
              ? `${enemyLookup.get(ent.id)?.name ?? 'Enemy'} — HP ${ent.hp}/${ent.maxHp}, AC ${enemyLookup.get(ent.id)?.ac ?? '?'}`
              : `${state.characters.find((c) => c.id === ent.id)?.name ?? 'PC'} — HP ${ent.hp}/${ent.maxHp}`
          }
          style={{
            background: ent.isEnemy ? 'rgba(220, 70, 70, 0.85)' : 'rgba(70, 140, 220, 0.85)',
            boxShadow: isActive ? '0 0 6px 2px var(--t-primary)' : 'none',
            border: isActive ? '1px solid var(--t-primary)' : '1px solid rgba(255, 255, 255, 0.25)',
          }}
        >
          <span className={styles.gridTokenLetter}>
            {tokenLabel(
              ent.isEnemy
                ? (enemyLookup.get(ent.id)?.name ?? 'E')
                : (state.characters.find((c) => c.id === ent.id)?.name ?? 'P')
            )}
          </span>
          <div
            className={styles.gridHpBar}
            style={{
              background: hpColor(ent.hp, ent.maxHp),
              width: `${Math.max(0, Math.min(100, (ent.hp / Math.max(1, ent.maxHp)) * 100))}%`,
            }}
          />
          {ent.conditions.length > 0 && (
            <span className={styles.gridCondLabel} title={ent.conditions.join(', ')}>
              {conditionBadges(ent.conditions)}
            </span>
          )}
        </div>
      ) : null;

      cells.push(
        <div
          key={`${x},${y}`}
          className={styles.gridCell}
          style={{ background: bg }}
          aria-label={`(${x},${y})`}
        >
          {token}
        </div>
      );
    }
  }

  return (
    <div className={styles.gridCombatCard}>
      <div className={styles.gridHeader}>
        <span className={styles.gridHeaderLabel}>BATTLEFIELD</span>
        <span className={styles.gridHeaderInfo}>
          {gridWidth}×{gridHeight} squares · move: {remainingFt}/{speedFt}ft
        </span>
      </div>
      <div
        className={styles.gridBoard}
        style={{
          gridTemplateColumns: `repeat(${gridWidth}, ${CELL_PX}px)`,
          gridTemplateRows: `repeat(${gridHeight}, ${CELL_PX}px)`,
        }}
      >
        {cells}
      </div>
      <div className={styles.gridLegend}>
        <span>
          <span className={styles.gridLegendPC} /> party
        </span>
        <span>
          <span className={styles.gridLegendEnemy} /> hostile
        </span>
        <span>
          <span className={styles.gridLegendReach} /> reachable this turn
        </span>
      </div>
    </div>
  );
}

export default GridCombatView;
