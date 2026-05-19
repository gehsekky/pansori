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

interface AoePreview {
  shape: 'sphere' | 'cone' | 'cube' | 'line';
  radiusFt: number;
  targetEnemyId?: string;
  rangeKind?: 'self' | 'touch' | 'ranged';
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
  // When the player hovers a cast_spell choice for an AoE, the grid tints
  // the affected cells so they can preview the spell's footprint before
  // committing. Mirror of the backend's geometry helpers in gridEngine.ts.
  aoePreview?: AoePreview;
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

function GridCombatView({
  state,
  seed,
  gridWidth = 10,
  gridHeight = 10,
  onMove,
  aoePreview,
}: Props) {
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

  // Dead body still occupying a cell (engine no longer treats this as
  // blocking; rendered as a faded skull marker so the player can see where
  // corpses are).
  function corpseAt(x: number, y: number): CombatEntity | undefined {
    return entities.find((e) => e.pos.x === x && e.pos.y === y && e.hp <= 0);
  }

  function isReachable(x: number, y: number): boolean {
    if (!activeEntity || activeChar?.dead) return false;
    if (entityAt(x, y)) return false;
    const dist = chebyshev(activeEntity.pos, { x, y });
    return dist > 0 && dist <= remainingSquares;
  }

  // AoE preview — when the player hovers a spell choice with an AoE shape,
  // compute the affected cells. Mirrors the backend `entitiesInCone/Cube/
  // Line/Blast` math from gridEngine.ts so the preview is RAW-accurate.
  const aoeCells: Set<string> = (() => {
    const empty = new Set<string>();
    if (!aoePreview) return empty;
    const casterEnt = entities.find((e) => e.id === activeId);
    if (!casterEnt) return empty;
    const targetEnt = aoePreview.targetEnemyId
      ? entities.find((e) => e.id === aoePreview.targetEnemyId)
      : undefined;
    const epicenter = targetEnt?.pos ?? casterEnt.pos;
    const sq = Math.floor(aoePreview.radiusFt / SQUARE_SIZE_FT);
    const cells = new Set<string>();
    switch (aoePreview.shape) {
      case 'sphere':
        for (let dx = -sq; dx <= sq; dx++) {
          for (let dy = -sq; dy <= sq; dy++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) > sq) continue;
            cells.add(`${epicenter.x + dx},${epicenter.y + dy}`);
          }
        }
        break;
      case 'cone': {
        const dx = Math.sign(epicenter.x - casterEnt.pos.x);
        const dy = Math.sign(epicenter.y - casterEnt.pos.y);
        if (dx === 0 && dy === 0) break;
        for (let cx = 0; cx < gridWidth; cx++) {
          for (let cy = 0; cy < gridHeight; cy++) {
            const rx = cx - casterEnt.pos.x;
            const ry = cy - casterEnt.pos.y;
            const along = rx * dx + ry * dy;
            if (along <= 0 || along > sq) continue;
            const perp =
              dx !== 0 && dy !== 0 ? Math.abs(rx * dy - ry * dx) / 2 : Math.abs(rx * dy - ry * dx);
            if (perp <= along) cells.add(`${cx},${cy}`);
          }
        }
        break;
      }
      case 'cube': {
        const dx = Math.sign(epicenter.x - casterEnt.pos.x);
        const dy = Math.sign(epicenter.y - casterEnt.pos.y);
        const side = sq;
        const minX =
          dx >= 0
            ? casterEnt.pos.x + (dx === 0 ? -Math.floor(side / 2) : 1)
            : casterEnt.pos.x - side;
        const maxX = minX + side - 1;
        const minY =
          dy >= 0
            ? casterEnt.pos.y + (dy === 0 ? -Math.floor(side / 2) : 1)
            : casterEnt.pos.y - side;
        const maxY = minY + side - 1;
        for (let cx = minX; cx <= maxX; cx++)
          for (let cy = minY; cy <= maxY; cy++) cells.add(`${cx},${cy}`);
        break;
      }
      case 'line': {
        const dx = Math.sign(epicenter.x - casterEnt.pos.x);
        const dy = Math.sign(epicenter.y - casterEnt.pos.y);
        if (dx === 0 && dy === 0) break;
        for (let i = 1; i <= sq; i++) {
          cells.add(`${casterEnt.pos.x + dx * i},${casterEnt.pos.y + dy * i}`);
        }
        break;
      }
    }
    return cells;
  })();

  // Disambiguate same-name enemies in the current room: when two or more
  // share a name (e.g. 2× Bandit Ruffian), append #1, #2, ... so the grid
  // tooltip matches the "Attack Bandit #2" choice the player sees.
  const enemyDisplayName = (() => {
    const map = new Map<string, string>();
    const byName: Record<string, string[]> = {};
    for (const e of entities) {
      if (!e.isEnemy) continue;
      const name = enemyLookup.get(e.id)?.name ?? 'Enemy';
      (byName[name] ??= []).push(e.id);
    }
    for (const [name, ids] of Object.entries(byName)) {
      if (ids.length === 1) {
        map.set(ids[0], name);
      } else {
        ids.forEach((id, i) => map.set(id, `${name} #${i + 1}`));
      }
    }
    return (id: string) => map.get(id) ?? enemyLookup.get(id)?.name ?? 'Enemy';
  })();

  const cells: React.ReactNode[] = [];
  for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
      const ent = entityAt(x, y);
      const corpse = ent ? undefined : corpseAt(x, y);
      const reachable = isReachable(x, y);
      const isActive = ent && ent.id === activeId && !ent.isEnemy;
      const illum = cellLight(x, y);

      // Hide enemy tokens in cells the party can't see (heavily obscured).
      // Party + companion tokens always show — you know where your own side is.
      const hideEntity = ent?.isEnemy && illum === 'dark';
      const hideCorpse = corpse?.isEnemy && illum === 'dark';

      let bg = 'transparent';
      if (illum === 'dim') bg = 'rgba(0, 0, 0, 0.30)';
      else if (illum === 'dark') bg = 'rgba(0, 0, 0, 0.70)';
      if (reachable) bg = 'rgba(120, 200, 255, 0.10)';
      // AoE preview tint wins over reachable highlight.
      if (aoeCells.has(`${x},${y}`)) bg = 'rgba(255, 140, 50, 0.30)';

      const tokenBg = ent?.isEnemy
        ? 'rgba(220, 70, 70, 0.85)'
        : ent?.isCompanion
          ? 'rgba(110, 190, 110, 0.85)'
          : 'rgba(70, 140, 220, 0.85)';
      const displayName = (e: CombatEntity): string =>
        e.isEnemy
          ? enemyDisplayName(e.id)
          : e.isCompanion
            ? (e.companionName ?? 'Companion')
            : (state.characters.find((c) => c.id === e.id)?.name ?? 'PC');
      // Token letter: for enemies in a same-name group, append the
      // disambiguation digit (e.g., "B1", "B2") so duplicates aren't
      // indistinguishable on the grid.
      const tokenLetter = ((): string => {
        if (!ent) return '';
        const full = displayName(ent);
        const base = tokenLabel(full);
        const m = full.match(/#(\d+)$/);
        return m ? `${base}${m[1]}` : base;
      })();
      const tokenTitle = ent
        ? ent.isEnemy
          ? `${displayName(ent)} — HP ${ent.hp}/${ent.maxHp}, AC ${enemyLookup.get(ent.id)?.ac ?? '?'}`
          : ent.isCompanion
            ? `${displayName(ent)} — HP ${ent.hp}/${ent.maxHp}, AC ${ent.ac ?? '?'}`
            : `${displayName(ent)} — HP ${ent.hp}/${ent.maxHp}`
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
            <span className={styles.gridTokenLetter}>{tokenLetter}</span>
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
        ) : corpse && !hideCorpse ? (
          // Faded corpse marker — engine no longer blocks movement here, but
          // the player should know a body lies on this square.
          <div
            className={styles.gridToken}
            title={`${displayName(corpse)} — dead`}
            style={{
              background: 'rgba(80, 80, 80, 0.35)',
              border: '1px dashed rgba(255, 255, 255, 0.2)',
              opacity: 0.7,
            }}
          >
            <span className={styles.gridTokenLetter} style={{ fontSize: '0.9rem' }}>
              💀
            </span>
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
