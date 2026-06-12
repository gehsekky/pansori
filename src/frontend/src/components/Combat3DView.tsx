// 3D presentation of TURN-BASED combat — option 1 of the 3D-combat roadmap.
//
// A drop-in replacement for the 2D GridCombatView taking the SAME props: the
// battle stays exactly the engine's turn-based fight (same initiative, same
// choices, same action bar / spell bar / enemy selector below), but the
// battlefield renders as a 3D diorama with a pulled-back orbit camera. Click a
// highlighted cell to move (the same single grid_move the 2D grid dispatches);
// hovering an AoE spell previews its footprint on the floor — the math is
// shared with the 2D view (lib/combatPreview), which mirrors the backend.
//
// Deliberately NOT here yet (parity with the 2D view's extras, future polish):
// line-of-sight fog shading, attack arrows, painted floor art.

import * as THREE from 'three';
import {
  type AoePreview,
  SQUARE_SIZE_FT,
  chebyshev,
  computeAoeCells,
  enemyDisplayNames,
} from '../lib/combatPreview';
import { CHAR_MODEL, modelForClass, modelForEnemyName } from '../lib/characters3d';
import { Canvas, useFrame } from '@react-three/fiber';
import type { CombatEntity, GameState, GridPos, Seed } from '../types';
import { FLOOR_TEX_KEY, TEX3D, configureTexture } from '../lib/textures3d';
import { Html, OrbitControls, useTexture } from '@react-three/drei';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Character3D from './Character3D.tsx';

const C = 2; // world units per combat cell

// WebGL availability, probed once (jsdom returns null from getContext, so unit
// tests exercise the placeholder and never mount the r3f canvas).
let webglProbe: boolean | null = null;
function webglAvailable(): boolean {
  if (webglProbe !== null) return webglProbe;
  try {
    const c = document.createElement('canvas');
    webglProbe = !!(c.getContext('webgl2') ?? c.getContext('webgl'));
  } catch {
    webglProbe = false;
  }
  return webglProbe;
}

interface Props {
  state: GameState;
  seed: Seed;
  gridWidth?: number;
  gridHeight?: number;
  onMove?: (to: GridPos) => void;
  aoePreview?: AoePreview;
}

const nameTag: React.CSSProperties = {
  background: 'rgba(10, 14, 18, 0.85)',
  color: '#cfe3dd',
  padding: '1px 5px',
  borderRadius: 3,
  fontSize: 10,
  whiteSpace: 'nowrap',
  pointerEvents: 'none',
  textAlign: 'center',
};

function HpBar({ hp, maxHp, enemy }: { hp: number; maxHp: number; enemy: boolean }) {
  const pct = Math.max(0, Math.min(1, hp / Math.max(1, maxHp)));
  return (
    <div style={{ width: 44, height: 5, background: '#222', borderRadius: 2, overflow: 'hidden' }}>
      <div
        style={{
          width: `${pct * 100}%`,
          height: '100%',
          background: enemy
            ? '#c84b4b'
            : pct > 0.5
              ? '#4bc88a'
              : pct > 0.25
                ? '#d8b94b'
                : '#d86a4b',
        }}
      />
    </div>
  );
}

// ── Battlefield surfaces (planked slab + floor + obstacle blocks) ───────────
// MUST render INSIDE the Canvas: drei's useTexture grabs the renderer via
// useThree, which throws "R3F: Hooks can only be used within the Canvas
// component!" anywhere else — calling it in the screen component's body (above
// <Canvas>) crashed the app the moment a fight opened in 3D. The flat-color
// variant doubles as the Suspense fallback while the CC0 textures load.
interface BattlefieldMaps {
  floor: THREE.Texture;
  planks: THREE.Texture;
  brick: THREE.Texture;
}

function Battlefield({
  gridWidth,
  gridHeight,
  baseFloor,
  obstacleSet,
  onClickCell,
  maps,
}: {
  gridWidth: number;
  gridHeight: number;
  /** Tint multiplied over the floor texture — near-neutral, slightly moody. */
  baseFloor: string;
  obstacleSet: ReadonlySet<string>;
  onClickCell: (x: number, y: number) => void;
  maps?: BattlefieldMaps;
}) {
  const cx = ((gridWidth - 1) * C) / 2;
  const cz = ((gridHeight - 1) * C) / 2;
  return (
    <>
      {/* Battlefield base slab — a planked "game table" under the field. */}
      <mesh position={[cx, -0.12, cz]}>
        <boxGeometry args={[gridWidth * C + 1.2, 0.2, gridHeight * C + 1.2]} />
        {maps ? (
          <meshStandardMaterial map={maps.planks} color="#9a8a76" />
        ) : (
          <meshStandardMaterial color="#6e6253" />
        )}
      </mesh>
      {/* Battlefield floor — one continuous plane; a click resolves the cell
          from the hit point and dispatches the same grid_move. */}
      <mesh
        position={[cx, 0.002, cz]}
        rotation={[-Math.PI / 2, 0, 0]}
        onClick={(e) => {
          e.stopPropagation();
          onClickCell(Math.round(e.point.x / C), Math.round(e.point.z / C));
        }}
      >
        <planeGeometry args={[gridWidth * C, gridHeight * C]} />
        {maps ? (
          <meshStandardMaterial map={maps.floor} color={baseFloor} />
        ) : (
          <meshStandardMaterial color="#3c3f45" />
        )}
      </mesh>
      {[...obstacleSet].map((key) => {
        const [x, y] = key.split(',').map(Number);
        return (
          <mesh key={key} position={[x * C, 0.8, y * C]}>
            <boxGeometry args={[C * 0.96, 1.6, C * 0.96]} />
            {maps ? (
              <meshStandardMaterial map={maps.brick} />
            ) : (
              <meshStandardMaterial color="#303439" />
            )}
          </mesh>
        );
      })}
    </>
  );
}

// Suspends on the CC0 texture fetch; the flat-color battlefield renders
// beneath the Suspense boundary until the maps arrive.
function BattlefieldTextured({
  floorKey,
  ...rest
}: {
  gridWidth: number;
  gridHeight: number;
  baseFloor: string;
  obstacleSet: ReadonlySet<string>;
  onClickCell: (x: number, y: number) => void;
  floorKey: keyof typeof TEX3D;
}) {
  const tex = useTexture({ floor: TEX3D[floorKey], planks: TEX3D.planks, brick: TEX3D.bricks });
  const maps = useMemo(() => {
    const floor = configureTexture(tex.floor.clone());
    floor.repeat.set((rest.gridWidth * C) / 3, (rest.gridHeight * C) / 3);
    floor.needsUpdate = true;
    const planks = configureTexture(tex.planks.clone());
    planks.repeat.set((rest.gridWidth * C) / 4, (rest.gridHeight * C) / 4);
    planks.needsUpdate = true;
    return { floor, planks, brick: configureTexture(tex.brick) };
  }, [tex, rest.gridWidth, rest.gridHeight]);
  useEffect(
    () => () => {
      maps.floor.dispose();
      maps.planks.dispose();
    },
    [maps]
  );
  return <Battlefield {...rest} maps={maps} />;
}

// The active entity's turn marker — a slowly spinning ring at its feet.
function ActiveRing({ x, z }: { x: number; z: number }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.z += dt * 1.2;
  });
  return (
    <mesh ref={ref} position={[x, 0.06, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[C * 0.4, C * 0.5, 24, 1, 0, Math.PI * 1.6]} />
      <meshStandardMaterial
        color="#9fe8da"
        emissive="#2dd4bf"
        emissiveIntensity={0.8}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

// One battlefield figure with MOVEMENT TWEENING: the engine teleports the
// entity's cell, the token glides there — playing Walking_A (Running_A for
// long moves) and facing the travel direction, then settling back to its base
// anim facing the nearest foe. Module-level so re-renders never remount it
// (a remount would replay Death_A and reset the tween).
const MOVE_SPEED = 8.5; // world units / second

function CombatToken({
  e,
  url,
  name,
  isActive,
  baseAnim,
  foeYaw,
}: {
  e: CombatEntity;
  url: string | null;
  name: string;
  isActive: boolean;
  baseAnim: string;
  foeYaw: number;
}) {
  const group = useRef<THREE.Group>(null);
  // The DISPLAYED position; chases the engine cell each frame.
  const shown = useRef({ x: e.pos.x * C, z: e.pos.y * C });
  const movingRef = useRef(false);
  const [move, setMove] = useState<{ yaw: number; run: boolean } | null>(null);
  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    const tx = e.pos.x * C;
    const tz = e.pos.y * C;
    const p = shown.current;
    const dx = tx - p.x;
    const dz = tz - p.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.02) {
      if (!movingRef.current) {
        movingRef.current = true;
        setMove({ yaw: Math.atan2(dx, dz), run: d > C * 2.5 });
      }
      const step = Math.min(d, MOVE_SPEED * dt);
      p.x += (dx / d) * step;
      p.z += (dz / d) * step;
    } else if (movingRef.current) {
      movingRef.current = false;
      setMove(null);
      p.x = tx;
      p.z = tz;
    }
    g.position.set(p.x, 0, p.z);
  });

  const dead = e.hp <= 0;
  const anim = dead ? 'Death_A' : move ? (move.run ? 'Running_A' : 'Walking_A') : baseAnim;
  const yaw = move ? move.yaw : foeYaw;
  const capsule = (
    <mesh position={[0, e.isCompanion ? 0.55 : 0.95, 0]}>
      <capsuleGeometry args={[e.isCompanion ? 0.28 : 0.38, e.isCompanion ? 0.5 : 1.0, 6, 12]} />
      <meshStandardMaterial
        color={e.isEnemy ? '#b14a4a' : e.isCompanion ? '#8fb98a' : '#6fc7bb'}
        emissive={isActive ? '#2dd4bf' : '#000000'}
        emissiveIntensity={isActive ? 0.25 : 0}
      />
    </mesh>
  );
  return (
    <group ref={group} position={[shown.current.x, 0, shown.current.z]}>
      {dead && !url ? (
        <mesh position={[0, 0.12, 0]}>
          <sphereGeometry args={[0.45, 8, 5]} />
          <meshStandardMaterial color="#26282b" />
        </mesh>
      ) : !url ? (
        capsule
      ) : (
        <Suspense fallback={dead ? null : capsule}>
          <Character3D url={url} height={1.9} yaw={yaw} anim={anim} />
        </Suspense>
      )}
      {!dead && (
        <Html position={[0, 2.3, 0]} center distanceFactor={14}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <div style={nameTag}>{name}</div>
            <HpBar hp={e.hp} maxHp={e.maxHp} enemy={e.isEnemy} />
          </div>
        </Html>
      )}
      {isActive && !dead && <ActiveRing x={0} z={0} />}
    </group>
  );
}

function Combat3DView({ state, seed, gridWidth = 8, gridHeight = 8, onMove, aoePreview }: Props) {
  const entities = useMemo(() => state.entities ?? [], [state.entities]);
  const active = !!state.combat_active || !!state.combat_over_pending;

  const activeId = state.active_character_id;
  const activeChar = state.characters.find((c) => c.id === activeId);
  const activeEntity = entities.find((e) => e.id === activeId && !e.isEnemy);
  const speedFt = activeChar?.speed ?? 30;
  const remainingFt = Math.max(0, speedFt - (state.movement_used?.[activeId] ?? 0));
  const remainingSquares = Math.floor(remainingFt / SQUARE_SIZE_FT);

  const currentRoom = seed.rooms.find((r) => r.id === state.current_room);
  const lighting = currentRoom?.lighting ?? 'bright';
  const obstacleSet = useMemo(
    () => new Set((currentRoom?.obstacles ?? []).map((o) => `${o.x},${o.y}`)),
    [currentRoom]
  );
  const difficultSet = useMemo(
    () => new Set((currentRoom?.difficultTerrain ?? []).map((p) => `${p.x},${p.y}`)),
    [currentRoom]
  );

  const enemyLookup = useMemo(() => {
    const map = new Map<string, { name: string; ac: number }>();
    for (const list of Object.values(seed.enemies ?? {})) {
      for (const e of list) map.set(e.id, { name: e.name, ac: e.ac });
    }
    return map;
  }, [seed.enemies]);
  const displayName = useMemo(
    () => enemyDisplayNames(entities, (id) => enemyLookup.get(id)?.name),
    [entities, enemyLookup]
  );

  // Which character model an entity renders as (null = primitive token).
  const urlFor = useCallback(
    (e: CombatEntity): string | null =>
      e.isEnemy
        ? modelForEnemyName(enemyLookup.get(e.id)?.name)
        : e.isCompanion
          ? null
          : modelForClass(state.characters.find((c) => c.id === e.id)?.character_class),
    [enemyLookup, state.characters]
  );

  // ── Combat-log → animation events ───────────────────────────────────────
  // New attack events play the attacker's swing (spellcast for mage-model
  // attackers) and the struck target's flinch; the clips clear back to Idle
  // after the one-shot's length. Deaths aren't transient — a dead entity with
  // a model renders Death_A permanently (clamped on its final frame).
  const [animOverride, setAnimOverride] = useState<Record<string, string>>({});
  const processedLog = useRef(-1);
  const timers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  useEffect(() => {
    const log = state.combat_log ?? [];
    // First sight of the log (view opened mid-fight) — don't replay history.
    if (processedLog.current === -1 || processedLog.current > log.length) {
      processedLog.current = log.length;
      return;
    }
    const fresh = log.slice(processedLog.current);
    processedLog.current = log.length;
    if (fresh.length === 0) return;
    const set = (id: string, clip: string, ms: number) => {
      setAnimOverride((prev) => ({ ...prev, [id]: clip }));
      const t = setTimeout(() => {
        timers.current.delete(t);
        setAnimOverride((prev) => {
          if (prev[id] !== clip) return prev;
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }, ms);
      timers.current.add(t);
    };
    for (const ev of fresh) {
      if (ev.kind !== 'attack_hit' && ev.kind !== 'attack_miss') continue;
      const attacker = entities.find((e) => e.id === ev.attackerId);
      const attackerUrl = attacker ? urlFor(attacker) : null;
      if (attackerUrl) {
        const caster = attackerUrl === CHAR_MODEL.mage || attackerUrl === CHAR_MODEL.skeletonMage;
        set(ev.attackerId, caster ? 'Spellcast_Shoot' : '1H_Melee_Attack_Slice_Diagonal', 1100);
      }
      if (ev.kind === 'attack_hit') {
        const target = entities.find((e) => e.id === ev.targetId);
        // The flinch only when they survived — Death_A owns the kill.
        if (target && target.hp > 0 && urlFor(target)) set(ev.targetId, 'Hit_A', 750);
      }
    }
  }, [state.combat_log, entities, urlFor]);
  useEffect(() => {
    const t = timers.current;
    return () => t.forEach(clearTimeout);
  }, []);

  const aoeCells = useMemo(() => {
    if (!aoePreview) return new Set<string>();
    const caster = entities.find((e) => e.id === activeId);
    if (!caster) return new Set<string>();
    const target = aoePreview.targetEnemyId
      ? entities.find((e) => e.id === aoePreview.targetEnemyId)
      : undefined;
    return computeAoeCells(
      aoePreview,
      caster.pos,
      target?.pos ?? caster.pos,
      gridWidth,
      gridHeight
    );
  }, [aoePreview, entities, activeId, gridWidth, gridHeight]);

  // CC0 surfaces — battlefield floor by the room's authored floor type, a
  // planks "game table" slab, brick obstacle blocks. Loaded by
  // BattlefieldTextured INSIDE the Canvas (useTexture needs the r3f store).
  const floorKey = FLOOR_TEX_KEY[currentRoom?.floor ?? ''] ?? (currentRoom ? 'cobblestone' : 'mud');

  // Hooks above; the render gate mirrors GridCombatView's.
  if (!active || entities.length === 0) return null;

  if (!webglAvailable()) {
    return (
      <div
        data-testid="combat-3d-unavailable"
        style={{
          height: 440,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--t-dim)',
          fontSize: '0.78rem',
          border: '1px solid var(--t-border)',
          borderRadius: 6,
        }}
      >
        3D BATTLEFIELD NEEDS WEBGL — USE THE 2D TOGGLE.
      </div>
    );
  }

  const occupied = (x: number, y: number) =>
    entities.some((e) => e.pos.x === x && e.pos.y === y && e.hp > 0);
  const reachable = (x: number, y: number): boolean => {
    if (!activeEntity || activeChar?.dead || !state.combat_active) return false;
    if (occupied(x, y) || obstacleSet.has(`${x},${y}`)) return false;
    const dist = chebyshev(activeEntity.pos, { x, y });
    return dist > 0 && dist <= remainingSquares;
  };
  const onClickCell = (x: number, y: number) => {
    if (reachable(x, y) && onMove) onMove({ x, y });
  };

  const cx = ((gridWidth - 1) * C) / 2;
  const cz = ((gridHeight - 1) * C) / 2;
  const dist = Math.max(gridWidth, gridHeight) * C;
  // Tint multiplied over the floor texture — near-neutral, slightly moody.
  const baseFloor = currentRoom?.floor === 'cobblestone' || !currentRoom ? '#b9bcc4' : '#c4b49a';
  const ambient = lighting === 'dark' ? 0.25 : lighting === 'dim' ? 0.45 : 0.85;

  // Status overlays (reachable / AoE / difficult) float just above the textured
  // floor; they're pointer-transparent so clicks land on the floor plane, which
  // resolves the cell from the hit point.
  const overlays: React.ReactNode[] = [];
  for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
      const key = `${x},${y}`;
      if (obstacleSet.has(key)) continue;
      const inAoe = aoeCells.has(key);
      const canGo = reachable(x, y);
      const difficult = difficultSet.has(key);
      if (!inAoe && !canGo && !difficult) continue;
      overlays.push(
        <mesh
          key={key}
          position={[x * C, 0.015, y * C]}
          rotation={[-Math.PI / 2, 0, 0]}
          raycast={() => null}
        >
          <planeGeometry args={[C * 0.94, C * 0.94]} />
          <meshStandardMaterial
            color={inAoe ? '#a04018' : canGo ? '#2a6ea8' : '#5a4a28'}
            emissive={inAoe ? '#c2410c' : canGo ? '#1d4ed8' : '#000000'}
            emissiveIntensity={inAoe ? 0.4 : canGo ? 0.22 : 0}
            transparent
            opacity={inAoe ? 0.55 : canGo ? 0.42 : 0.35}
          />
        </mesh>
      );
    }
  }

  // Per-entity base anim (death/log-override/idle) + facing toward the
  // nearest living foe; CombatToken layers movement tweening on top.
  const tokenFor = (e: CombatEntity) => {
    const dead = e.hp <= 0;
    const name = e.isEnemy
      ? displayName(e.id)
      : e.isCompanion
        ? (e.companionName ?? 'Companion')
        : (state.characters.find((c) => c.id === e.id)?.name ?? '—');
    const foes = entities.filter((o) => o.isEnemy !== e.isEnemy && o.hp > 0);
    let foeYaw = e.isEnemy ? Math.PI : 0;
    if (foes.length > 0) {
      const nearest = foes.reduce((a, b) =>
        Math.hypot(a.pos.x - e.pos.x, a.pos.y - e.pos.y) <
        Math.hypot(b.pos.x - e.pos.x, b.pos.y - e.pos.y)
          ? a
          : b
      );
      foeYaw = Math.atan2(nearest.pos.x - e.pos.x, nearest.pos.y - e.pos.y);
    }
    return (
      <CombatToken
        key={e.id}
        e={e}
        url={urlFor(e)}
        name={name}
        isActive={e.id === activeId}
        baseAnim={dead ? 'Death_A' : (animOverride[e.id] ?? 'Idle')}
        foeYaw={foeYaw}
      />
    );
  };

  return (
    <div
      data-testid="combat-3d-view"
      style={{
        width: '100%',
        height: 440,
        borderRadius: 6,
        overflow: 'hidden',
        border: '1px solid var(--t-border)',
        position: 'relative',
      }}
    >
      <Canvas camera={{ fov: 50, position: [cx, dist * 0.95, cz + dist * 0.85] }} dpr={[1, 1.75]}>
        <color attach="background" args={['#0a0d10']} />
        <fog attach="fog" args={['#0a0d10', dist * 1.4, dist * 3.2]} />
        <ambientLight intensity={ambient} />
        <directionalLight position={[cx + 8, 18, cz - 6]} intensity={0.7} />
        {lighting !== 'bright' && activeEntity && (
          <pointLight
            position={[activeEntity.pos.x * C, 2.4, activeEntity.pos.y * C]}
            intensity={1.4}
            distance={12}
            decay={1.5}
            color="#ffd9a0"
          />
        )}
        <Suspense
          fallback={
            <Battlefield
              gridWidth={gridWidth}
              gridHeight={gridHeight}
              baseFloor={baseFloor}
              obstacleSet={obstacleSet}
              onClickCell={onClickCell}
            />
          }
        >
          <BattlefieldTextured
            gridWidth={gridWidth}
            gridHeight={gridHeight}
            baseFloor={baseFloor}
            obstacleSet={obstacleSet}
            onClickCell={onClickCell}
            floorKey={floorKey}
          />
        </Suspense>
        {overlays}
        {entities.map(tokenFor)}
        <OrbitControls
          target={[cx, 0, cz]}
          enablePan={false}
          minDistance={6}
          maxDistance={dist * 2}
          minPolarAngle={0.25}
          maxPolarAngle={1.25}
        />
      </Canvas>
      <div
        style={{
          position: 'absolute',
          left: 8,
          bottom: 8,
          color: 'var(--t-dim)',
          fontSize: '0.66rem',
          background: 'rgba(8,10,12,0.6)',
          padding: '3px 7px',
          borderRadius: 4,
          pointerEvents: 'none',
        }}
      >
        drag to orbit · wheel to zoom · click a lit cell to move
      </div>
    </div>
  );
}

export default Combat3DView;
