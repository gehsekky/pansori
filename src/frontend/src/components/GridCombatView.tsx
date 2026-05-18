import type { CombatEntity, GameState, GridPos, Seed } from '../types';
import styles from '../styles.module.css';

const SQUARE_SIZE_FT = 5;
const CELL_PX = 32;
// SRD 5.2.1 — equipment chapter: torch sheds Bright Light 20 ft, Dim Light 20
// ft beyond. We assume the party carries lit torches; future work: gate this
// on actual inventory + a 'lit' state.
const TORCH_BRIGHT_SQ = 20 / SQUARE_SIZE_FT; // 4
const TORCH_DIM_SQ = (20 + 20) / SQUARE_SIZE_FT; // 8

type Illum = 'bright' | 'dim' | 'dark';

// Brightest of two illumination levels wins (party-collective vision).
function brighter(a: Illum, b: Illum): Illum {
  if (a === 'bright' || b === 'bright') return 'bright';
  if (a === 'dim' || b === 'dim') return 'dim';
  return 'dark';
}

interface Props {
  state: GameState;
  seed: Seed;
  gridWidth?: number;
  gridHeight?: number;
  // Click-to-move: when the player clicks a reachable cell, the parent
  // dispatches a single `grid_move` action targeting that cell. The backend
  // already pathfinds (BFS) + computes terrain-aware cost + triggers OAs, so
  // one HTTP round-trip handles the whole multi-square move.
  onMove?: (to: GridPos) => void;
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

function GridCombatView({ state, seed, gridWidth = 10, gridHeight = 10, onMove }: Props) {
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

  // ── Lighting / fog-of-war (SRD 5.2.1 p.11 Vision and Light) ──────────────
  // Determine the current room's ambient lighting from the seed. Default
  // 'bright' (no fog of war) when unspecified.
  const currentRoom = seed.rooms.find((r) => r.id === state.current_room);
  const roomLighting: Illum = currentRoom?.lighting ?? 'bright';

  // Per-cell illumination from the party's collective vision. PCs (not
  // companions, not enemies) carry torches and contribute light + darkvision.
  function cellLight(x: number, y: number): Illum {
    if (roomLighting === 'bright') return 'bright';

    // Base ambient
    let best: Illum = roomLighting === 'dim' ? 'dim' : 'dark';

    for (const pc of entities) {
      if (pc.isEnemy || pc.isCompanion) continue;
      if (pc.hp <= 0) continue;
      const dist = chebyshev(pc.pos, { x, y });
      // PC's own square always counts as bright (sight from their hex)
      if (dist === 0) return 'bright';

      if (roomLighting === 'dim') {
        // Whole room is dim ambient; nothing dims it further. Torch still
        // creates a bright pool around each PC.
        if (dist <= TORCH_BRIGHT_SQ) best = brighter(best, 'bright');
        continue;
      }

      // roomLighting === 'dark'
      const charDef = state.characters.find((c) => c.id === pc.id);
      const dvFt = charDef?.darkvision_ft ?? 0;
      const dvSq = dvFt / SQUARE_SIZE_FT;
      let here: Illum = 'dark';
      if (dist <= TORCH_BRIGHT_SQ) here = 'bright';
      else if (dist <= TORCH_DIM_SQ) here = 'dim';
      // Darkvision bumps Darkness → Dim within the radius (PHB/SRD).
      else if (dvSq > 0 && dist <= dvSq) here = 'dim';
      best = brighter(best, here);
    }
    return best;
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
      const illum = cellLight(x, y);

      // Hide enemy tokens in cells the party can't see (heavily obscured).
      // Party + companion tokens always show — you know where your own side is.
      const hideEntity = ent?.isEnemy && illum === 'dark';

      let bg = 'transparent';
      if (illum === 'dim') bg = 'rgba(0, 0, 0, 0.30)';
      else if (illum === 'dark') bg = 'rgba(0, 0, 0, 0.70)';
      if (reachable) bg = 'rgba(120, 200, 255, 0.10)';

      const tokenBg = ent?.isEnemy
        ? 'rgba(220, 70, 70, 0.85)'
        : ent?.isCompanion
          ? 'rgba(110, 190, 110, 0.85)'
          : 'rgba(70, 140, 220, 0.85)';
      const tokenLabelText = ent
        ? ent.isEnemy
          ? (enemyLookup.get(ent.id)?.name ?? 'E')
          : ent.isCompanion
            ? (ent.companionName ?? 'C')
            : (state.characters.find((c) => c.id === ent.id)?.name ?? 'P')
        : '';
      const tokenTitle = ent
        ? ent.isEnemy
          ? `${enemyLookup.get(ent.id)?.name ?? 'Enemy'} — HP ${ent.hp}/${ent.maxHp}, AC ${enemyLookup.get(ent.id)?.ac ?? '?'}`
          : ent.isCompanion
            ? `${ent.companionName ?? 'Companion'} — HP ${ent.hp}/${ent.maxHp}, AC ${ent.ac ?? '?'}`
            : `${state.characters.find((c) => c.id === ent.id)?.name ?? 'PC'} — HP ${ent.hp}/${ent.maxHp}`
        : '';
      const token =
        ent && !hideEntity ? (
          <div
            className={styles.gridToken}
            title={tokenTitle}
            style={{
              background: tokenBg,
              boxShadow: isActive ? '0 0 6px 2px var(--t-primary)' : 'none',
              border: isActive
                ? '1px solid var(--t-primary)'
                : '1px solid rgba(255, 255, 255, 0.25)',
            }}
          >
            <span className={styles.gridTokenLetter}>{tokenLabel(tokenLabelText)}</span>
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

      const clickable = reachable && !!onMove;
      cells.push(
        <div
          key={`${x},${y}`}
          className={styles.gridCell}
          style={{
            background: bg,
            cursor: clickable ? 'pointer' : 'default',
          }}
          aria-label={`(${x},${y})`}
          role={clickable ? 'button' : undefined}
          tabIndex={clickable ? 0 : undefined}
          onClick={clickable ? () => onMove?.({ x, y }) : undefined}
          onMouseEnter={
            clickable
              ? (e) => {
                  (e.currentTarget as HTMLDivElement).style.background =
                    'rgba(120, 200, 255, 0.35)';
                }
              : undefined
          }
          onMouseLeave={
            clickable
              ? (e) => {
                  (e.currentTarget as HTMLDivElement).style.background = bg;
                }
              : undefined
          }
          title={
            clickable
              ? `Move here (${chebyshev(activeEntity!.pos, { x, y }) * SQUARE_SIZE_FT} ft)`
              : undefined
          }
        >
          {token}
        </div>
      );
    }
  }

  const lightingNote =
    roomLighting === 'dark'
      ? ' · DARK (torch: 20/40 ft)'
      : roomLighting === 'dim'
        ? ' · DIM LIGHT'
        : '';

  return (
    <div className={styles.gridCombatCard}>
      <div className={styles.gridHeader}>
        <span className={styles.gridHeaderLabel}>BATTLEFIELD</span>
        <span className={styles.gridHeaderInfo}>
          {gridWidth}×{gridHeight} squares · move: {remainingFt}/{speedFt}ft
          {lightingNote}
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
          <span className={styles.gridLegendCompanion} /> companion
        </span>
        <span>
          <span className={styles.gridLegendEnemy} /> hostile
        </span>
        <span>
          <span className={styles.gridLegendReach} /> reachable this turn
        </span>
        {roomLighting !== 'bright' && (
          <>
            <span>
              <span className={styles.gridLegendDim} /> dim (disadv. perception)
            </span>
            <span>
              <span className={styles.gridLegendDark} /> dark (heavily obscured)
            </span>
          </>
        )}
      </div>
    </div>
  );
}

export default GridCombatView;
