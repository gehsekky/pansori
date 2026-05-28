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

// Every grid cell the straight segment from `a` to `b` passes through, endpoints
// included. Mirror of the backend `cellsOnLine` (supercover walk) so the FE
// line-of-sight fog matches the engine's `hasLineOfSight` targeting/vision rule.
function cellsOnLine(a: GridPos, b: GridPos): GridPos[] {
  const cells: GridPos[] = [];
  let x = a.x;
  let y = a.y;
  let dx = Math.abs(b.x - a.x);
  let dy = Math.abs(b.y - a.y);
  const xInc = b.x > a.x ? 1 : -1;
  const yInc = b.y > a.y ? 1 : -1;
  let n = 1 + dx + dy;
  let error = dx - dy;
  dx *= 2;
  dy *= 2;
  for (; n > 0; n--) {
    cells.push({ x, y });
    if (error > 0) {
      x += xInc;
      error -= dy;
    } else {
      y += yInc;
      error += dx;
    }
  }
  return cells;
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
    commanded: 'Cmd',
    confused: 'Cf',
    compelled: 'Cp',
    dominated: 'Dm',
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

  // Last-attacker arrows — pluck the most recent attack events from
  // combat_log and render an arrow from each attacker's cell to its
  // target's cell. Drawn as an SVG overlay on top of the board. Fades
  // older events; solid for hits, dashed for misses. Helps players track
  // multi-attacker rounds without rescanning the combat log.
  const RECENT_ATTACK_LIMIT = 3;
  const recentAttacks = (() => {
    const log = state.combat_log ?? [];
    const out: Array<{ from: GridPos; to: GridPos; hit: boolean; index: number }> = [];
    for (let i = log.length - 1; i >= 0 && out.length < RECENT_ATTACK_LIMIT; i--) {
      const ev = log[i];
      if (ev.kind !== 'attack_hit' && ev.kind !== 'attack_miss') continue;
      const attacker = entities.find((e) => e.id === ev.attackerId);
      const target = entities.find((e) => e.id === ev.targetId);
      if (!attacker || !target) continue;
      if (attacker.pos.x === target.pos.x && attacker.pos.y === target.pos.y) continue;
      out.push({
        from: attacker.pos,
        to: target.pos,
        hit: ev.kind === 'attack_hit',
        index: out.length,
      });
    }
    return out;
  })();

  // ── Lighting / fog-of-war (SRD 5.2.1 p.11 Vision and Light) ──────────────
  // Determine the current room's ambient lighting from the seed. Default
  // 'bright' (no fog of war) when unspecified.
  const currentRoom = seed.rooms.find((r) => r.id === state.current_room);
  // 'sunlight' is Bright Light for vision (it only differs from 'bright' for
  // Sunlight Sensitivity, a backend-only combat rule), so collapse it here.
  const rawLighting = currentRoom?.lighting ?? 'bright';
  const roomLighting: Illum = rawLighting === 'sunlight' ? 'bright' : rawLighting;
  // Static obstacles (columns/walls/debris) — block movement, render as
  // distinct cell content, contribute to cover on the backend.
  const obstacleSet = new Set<string>((currentRoom?.obstacles ?? []).map((o) => `${o.x},${o.y}`));
  function isObstacle(x: number, y: number): boolean {
    return obstacleSet.has(`${x},${y}`);
  }
  // Difficult terrain — 2× movement cost. Engine enforces the cost; FE
  // tints the cell so the player can see why a path may eat extra
  // movement and adds an info marker in the tooltip / aria-label.
  const difficultSet = new Set<string>(
    (currentRoom?.difficultTerrain ?? []).map((p) => `${p.x},${p.y}`)
  );
  function isDifficult(x: number, y: number): boolean {
    return difficultSet.has(`${x},${y}`);
  }

  // SRD 5.2.1 "Cover" — line of sight from `a` to `b` is blocked only when a
  // solid obstacle (wall) lies STRICTLY between them; endpoints never block.
  // Mirror of the backend `hasLineOfSight` so the fog matches what the engine
  // lets a creature see / target. Creatures don't block sight (only Total Cover
  // does), so only static obstacles are consulted.
  function hasLoS(a: GridPos, b: GridPos): boolean {
    if ((a.x === b.x && a.y === b.y) || obstacleSet.size === 0) return true;
    for (const c of cellsOnLine(a, b)) {
      if ((c.x === a.x && c.y === a.y) || (c.x === b.x && c.y === b.y)) continue;
      if (obstacleSet.has(`${c.x},${c.y}`)) return false;
    }
    return true;
  }

  // Per-cell illumination from the party's collective vision. PCs (not
  // companions, not enemies) carry torches and contribute light + darkvision.
  // When `respectLoS` is set, a PC only lights a cell it has unobstructed line
  // of sight to — so walls cast shadow/fog. Passing `false` yields the "lit if
  // you could see it" level, used to ghost-tint cells hidden only by a wall.
  function cellLight(x: number, y: number, respectLoS: boolean): Illum {
    const target = { x, y };
    let best: Illum = roomLighting === 'bright' ? 'dark' : roomLighting === 'dim' ? 'dim' : 'dark';
    // In a dim/dark room the AMBIENT (dim/dark) already fills cells regardless of
    // any PC — but a wall still blocks sight of what's beyond it. So the ambient
    // floor only stands for cells some living PC can see; otherwise it's unseen.
    let anyLoS = false;

    for (const pc of entities) {
      if (pc.isEnemy || pc.isCompanion) continue;
      if (pc.hp <= 0) continue;
      if (respectLoS && !hasLoS(pc.pos, target)) continue;
      anyLoS = true;
      const dist = chebyshev(pc.pos, target);
      // PC's own square always counts as bright (sight from their hex).
      if (dist === 0) return 'bright';

      let here: Illum = 'dark';
      if (roomLighting === 'bright') {
        here = 'bright';
      } else if (roomLighting === 'dim') {
        // Whole room is dim ambient; a torch still creates a bright pool.
        here = dist <= TORCH_BRIGHT_SQ ? 'bright' : 'dim';
      } else {
        // roomLighting === 'dark'
        const charDef = state.characters.find((c) => c.id === pc.id);
        const dvSq = (charDef?.darkvision_ft ?? 0) / SQUARE_SIZE_FT;
        if (dist <= TORCH_BRIGHT_SQ) here = 'bright';
        else if (dist <= TORCH_DIM_SQ) here = 'dim';
        // Darkvision bumps Darkness → Dim within the radius (PHB/SRD).
        else if (dvSq > 0 && dist <= dvSq) here = 'dim';
      }
      best = brighter(best, here);
    }
    // No PC can see this cell → it's unseen (fogged), whatever the ambient.
    return anyLoS ? best : 'dark';
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
    if (isObstacle(x, y)) return false;
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
      const obstacle = !ent && !corpse && isObstacle(x, y);
      const difficult = !obstacle && isDifficult(x, y);
      const reachable = isReachable(x, y);
      const isActive = ent && ent.id === activeId && !ent.isEnemy;
      // `illum` respects line of sight (walls cast shadow); `illum` 'dark' means
      // the party can't see the cell. `litIllum` ignores walls — when a cell is
      // unseen ONLY because a wall blocks it (it would otherwise be lit), we
      // ghost-tint it to distinguish "around the corner" from "dark/empty".
      const illum = cellLight(x, y, true);
      const litIllum = cellLight(x, y, false);
      const visible = illum !== 'dark';
      const losBlocked = !visible && litIllum !== 'dark';

      // Hide enemy tokens in cells the party can't see (heavily obscured OR out
      // of line of sight). Party + companion tokens always show — you know where
      // your own side is. The active PC's own cell is always visible.
      const hideEntity = ent?.isEnemy && !visible && !isActive;
      const hideCorpse = corpse?.isEnemy && !visible;

      let bg = 'transparent';
      if (illum === 'dim') bg = 'rgba(0, 0, 0, 0.30)';
      else if (illum === 'dark') bg = 'rgba(0, 0, 0, 0.70)';
      // Out-of-sight ("ghost") cells: a cool blue-grey haze over the dark fog so
      // the player reads them as "unknown / around a corner" rather than unlit.
      if (losBlocked) bg = 'rgba(70, 90, 120, 0.55)';
      if (reachable) bg = 'rgba(120, 200, 255, 0.10)';
      // AoE preview tint wins over reachable highlight.
      if (aoeCells.has(`${x},${y}`)) bg = 'rgba(255, 140, 50, 0.30)';
      // Difficult terrain: stipple pattern layered above the cell bg so
      // the player can see the texture in any state (idle, reachable, AoE).
      const DIFFICULT_STIPPLE =
        'radial-gradient(circle, rgba(170, 140, 90, 0.55) 1.2px, transparent 1.6px) 0 0 / 4px 4px';
      const cellBg = difficult ? `${DIFFICULT_STIPPLE}, ${bg}` : bg;
      const cellHoverBg = difficult
        ? `${DIFFICULT_STIPPLE}, rgba(120, 200, 255, 0.35)`
        : 'rgba(120, 200, 255, 0.35)';

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
            <span
              className={styles.gridTokenLetter}
              style={{ fontSize: '0.9rem' }}
              aria-hidden="true"
            >
              💀
            </span>
          </div>
        ) : obstacle ? (
          // Static obstacle marker — blocks movement and grants cover. Rendered
          // as a distinct stone-grey block so it reads as scenery, not a token.
          <div
            className={styles.gridObstacle}
            title="Obstacle — blocks movement, grants cover"
            aria-hidden="true"
          />
        ) : null;

      const clickable = reachable && !!onMove;
      // Build a useful aria-label so a SR user can navigate the grid.
      // Coordinates first, then content (occupant, lighting, reachability).
      const ariaParts: string[] = [`Cell ${x}, ${y}`];
      if (ent && !hideEntity) {
        const occName = displayName(ent);
        if (ent.isEnemy) {
          ariaParts.push(`${occName}, enemy, HP ${ent.hp} of ${ent.maxHp}`);
        } else if (ent.isCompanion) {
          ariaParts.push(`${occName}, companion, HP ${ent.hp} of ${ent.maxHp}`);
        } else {
          ariaParts.push(`${occName}, party, HP ${ent.hp} of ${ent.maxHp}`);
        }
      } else if (corpse && !hideCorpse) {
        ariaParts.push(`${displayName(corpse)}, corpse`);
      } else if (obstacle) {
        ariaParts.push('obstacle, blocks movement');
      } else if (losBlocked) {
        ariaParts.push('out of line of sight');
      } else if (illum === 'dark') {
        ariaParts.push('heavily obscured');
      } else if (illum === 'dim') {
        ariaParts.push('dim light');
      }
      if (difficult && !obstacle) {
        ariaParts.push('difficult terrain, double movement cost');
      }
      if (clickable) {
        ariaParts.push(
          `reachable, ${chebyshev(activeEntity!.pos, { x, y }) * SQUARE_SIZE_FT} feet`
        );
      }
      const ariaLabel = ariaParts.join(', ');

      cells.push(
        <div
          key={`${x},${y}`}
          className={styles.gridCell}
          style={{
            background: cellBg,
            cursor: clickable ? 'pointer' : 'default',
          }}
          aria-label={ariaLabel}
          aria-current={isActive ? 'location' : undefined}
          role={clickable ? 'button' : 'gridcell'}
          tabIndex={clickable ? 0 : undefined}
          onClick={clickable ? () => onMove?.({ x, y }) : undefined}
          onKeyDown={
            clickable
              ? (e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onMove?.({ x, y });
                  }
                }
              : undefined
          }
          onMouseEnter={
            clickable
              ? (e) => {
                  (e.currentTarget as HTMLDivElement).style.background = cellHoverBg;
                }
              : undefined
          }
          onMouseLeave={
            clickable
              ? (e) => {
                  (e.currentTarget as HTMLDivElement).style.background = cellBg;
                }
              : undefined
          }
          title={
            clickable
              ? `Move here (${chebyshev(activeEntity!.pos, { x, y }) * SQUARE_SIZE_FT} ft${difficult ? ', includes difficult terrain — 2× cost' : ''})`
              : difficult
                ? 'Difficult terrain — 2× movement cost'
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
      <div className={styles.gridBoardWrap}>
        <div
          className={styles.gridBoard}
          style={{
            gridTemplateColumns: `repeat(${gridWidth}, ${CELL_PX}px)`,
            gridTemplateRows: `repeat(${gridHeight}, ${CELL_PX}px)`,
          }}
        >
          {cells}
        </div>
        {recentAttacks.length > 0 &&
          (() => {
            // Cells gap of 1px between each, plus 1px outer padding.
            // Center of cell (x, y) = 1 + x*(32+1) + 16 = 17 + x*33.
            const STRIDE = CELL_PX + 1;
            const OFFSET = 1 + CELL_PX / 2;
            const boardW = gridWidth * STRIDE + 1;
            const boardH = gridHeight * STRIDE + 1;
            return (
              <svg
                className={styles.gridArrows}
                width={boardW}
                height={boardH}
                viewBox={`0 0 ${boardW} ${boardH}`}
                aria-hidden="true"
              >
                <defs>
                  <marker
                    id="grid-arrow-hit"
                    viewBox="0 0 10 10"
                    refX="9"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--t-hp-low)" />
                  </marker>
                  <marker
                    id="grid-arrow-miss"
                    viewBox="0 0 10 10"
                    refX="9"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--t-mid)" />
                  </marker>
                </defs>
                {recentAttacks.map((a, i) => {
                  const fromX = OFFSET + a.from.x * STRIDE;
                  const fromY = OFFSET + a.from.y * STRIDE;
                  const toX = OFFSET + a.to.x * STRIDE;
                  const toY = OFFSET + a.to.y * STRIDE;
                  // Pull line endpoints in slightly so they don't end at
                  // the dead center of the token (which obscures it).
                  const dx = toX - fromX;
                  const dy = toY - fromY;
                  const len = Math.hypot(dx, dy);
                  const inset = 10;
                  const ux = dx / len;
                  const uy = dy / len;
                  const sx = fromX + ux * inset;
                  const sy = fromY + uy * inset;
                  const ex = toX - ux * inset;
                  const ey = toY - uy * inset;
                  const opacity = 1 - a.index * 0.3;
                  return (
                    <line
                      key={i}
                      x1={sx}
                      y1={sy}
                      x2={ex}
                      y2={ey}
                      stroke={a.hit ? 'var(--t-hp-low)' : 'var(--t-mid)'}
                      strokeWidth={2}
                      strokeDasharray={a.hit ? undefined : '4 3'}
                      opacity={opacity}
                      markerEnd={`url(#grid-arrow-${a.hit ? 'hit' : 'miss'})`}
                    />
                  );
                })}
              </svg>
            );
          })()}
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
        {(currentRoom?.obstacles?.length ?? 0) > 0 && (
          <>
            <span>
              <span className={styles.gridLegendObstacle} /> obstacle (blocks movement)
            </span>
            <span>
              <span className={styles.gridLegendFog} /> out of sight (behind a wall)
            </span>
          </>
        )}
        {(currentRoom?.difficultTerrain?.length ?? 0) > 0 && (
          <span>
            <span className={styles.gridLegendDifficult} /> difficult terrain (2× cost)
          </span>
        )}
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
