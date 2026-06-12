// First-person GRID CRAWLER for local rooms — 3D experiment v2, old-school
// dungeon-crawler style (Eye of the Beholder / gold box): the party moves as
// one blob, cell to cell, with 90° turns. The viewport sits in the classic
// layout's map slot — narrative, choices, party rail, and conversations all
// keep working around it.
//
// THE ENGINE IS THE MOVEMENT MODEL. One keypress = one marker_move; the camera
// tweens to wherever the marker actually is, so a refused step simply doesn't
// move (no reconciliation layer, no snap-backs — the v1 lesson). Facing is
// pure view state: the engine never cares which way the party looks.
//
// Controls: W/S step forward/back · A/D turn 90° · Q/E strafe · F interact
// with the faced cell. Stepping onto an exit cell IS the room transition
// (resolved by the engine like any 2D map click), covered by a doorway fade.

import * as THREE from 'three';
import { Canvas, useFrame } from '@react-three/fiber';
import { FLOOR_TEX_KEY, TEX3D, configureTexture } from '../lib/textures3d';
import { type GameChoice, type GameState, type GridPos, type Seed } from '../types';
import {
  HEADING_LABEL,
  type Heading,
  initialHeading,
  isBlocked,
  stepTarget,
  turn,
  yawForHeading,
} from '../lib/gridStep';
import { Html, useTexture } from '@react-three/drei';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ActiveGrid } from '../types';
import Character3D from './Character3D.tsx';
import { availableLootIn } from '../lib/placedLoot.ts';
import { modelForNpcIcon } from '../lib/characters3d';
import { placeRoomObjects } from '../lib/roomPlacement.ts';

/** World units per room cell (corridor scale) and the party's eye height. */
export const CRAWL_CELL = 3;
const EYE = 1.7;
const WALL_H = 3.2;

interface Props {
  gameState: GameState;
  seed: Seed;
  grid: ActiveGrid;
  choices: GameChoice[];
  loading: boolean;
  /** Same gate as the 2D map: a Continue/conversation/vendor flow owns the
   * action surface, so steps must not dispatch. */
  readOnly: boolean;
  onChoice: (c: GameChoice) => void;
  height?: number;
}

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

const labelStyle: React.CSSProperties = {
  background: 'rgba(10, 14, 18, 0.85)',
  color: '#cfe3dd',
  padding: '2px 7px',
  borderRadius: 3,
  fontSize: 12,
  whiteSpace: 'nowrap',
  pointerEvents: 'none',
  border: '1px solid rgba(120, 200, 180, 0.35)',
};

const hudBox: React.CSSProperties = {
  position: 'absolute',
  background: 'rgba(8, 11, 14, 0.78)',
  border: '1px solid rgba(120, 200, 180, 0.25)',
  borderRadius: 6,
  color: '#cfe3dd',
  padding: '4px 8px',
  fontSize: '0.72rem',
  pointerEvents: 'none',
};

// ── Camera rig: tweens position to the marker's cell and yaw to the facing.
// Yaw target is ACCUMULATED (±π/2 per turn, never normalized) so the tween
// always takes the short way around. A torch light rides along. ─────────────
function CameraRig({ target, yawTarget }: { target: { x: number; z: number }; yawTarget: number }) {
  const light = useRef<THREE.PointLight>(null);
  // The rig OWNS the camera. r3f's default camera arrives with a lookAt-style
  // orientation whose YXZ reinterpretation carries a nonzero ROLL — leaving z
  // untouched baked a permanent horizon tilt into the view (varying with the
  // spawn cell, so every re-entry tilted differently). Snap to a clean frame
  // on the first tick, then keep pitch and roll pinned at zero.
  const initialized = useRef(false);
  useFrame(({ camera }, dt) => {
    if (!initialized.current) {
      initialized.current = true;
      camera.rotation.set(0, yawTarget, 0, 'YXZ');
      camera.position.set(target.x, EYE, target.z);
    }
    const k = Math.min(1, dt * 7);
    camera.position.x += (target.x - camera.position.x) * k;
    camera.position.z += (target.z - camera.position.z) * k;
    camera.position.y = EYE;
    camera.rotation.y += (yawTarget - camera.rotation.y) * Math.min(1, dt * 9);
    camera.rotation.x = 0;
    camera.rotation.z = 0;
    if (light.current) {
      light.current.position.set(camera.position.x, EYE + 0.5, camera.position.z);
    }
  });
  return (
    <pointLight
      ref={light}
      intensity={2.2}
      distance={CRAWL_CELL * 4.5}
      decay={1.4}
      color="#ffd9a0"
    />
  );
}

// ── Shell: textured floor + obstacle blocks; indoors adds ceiling and full-
// height perimeter walls, outdoors (towns) a low boundary wall under open sky.
function RoomShell({
  w,
  h,
  floor,
  obstacles,
  outdoor,
}: {
  w: number;
  h: number;
  floor?: string;
  obstacles: GridPos[];
  outdoor?: boolean;
}) {
  const floorKey = FLOOR_TEX_KEY[floor ?? 'cobblestone'] ?? 'cobblestone';
  const tex = useTexture({
    floor: TEX3D[floorKey],
    brick: TEX3D.bricks,
    planks: TEX3D.planks,
    rock: TEX3D.rock,
  });
  const maps = useMemo(() => {
    const f = configureTexture(tex.floor.clone());
    f.repeat.set(w, h);
    f.needsUpdate = true;
    const ceil = configureTexture(tex.planks.clone());
    ceil.repeat.set(w, h);
    ceil.needsUpdate = true;
    const wallX = configureTexture(tex.brick.clone());
    wallX.repeat.set(w * 1.5, 1.6);
    wallX.needsUpdate = true;
    const wallZ = configureTexture(tex.brick.clone());
    wallZ.repeat.set(h * 1.5, 1.6);
    wallZ.needsUpdate = true;
    return {
      f,
      ceil,
      wallX,
      wallZ,
      brick: configureTexture(tex.brick),
      rock: configureTexture(tex.rock),
    };
  }, [tex, w, h]);
  useEffect(
    () => () => {
      maps.f.dispose();
      maps.ceil.dispose();
      maps.wallX.dispose();
      maps.wallZ.dispose();
    },
    [maps]
  );
  const cx = ((w - 1) * CRAWL_CELL) / 2;
  const cz = ((h - 1) * CRAWL_CELL) / 2;
  const spanX = w * CRAWL_CELL;
  const spanZ = h * CRAWL_CELL;
  // Outdoors the boundary is a knee wall (the engine blocks off-grid steps;
  // the wall communicates it without blotting out the sky). Obstacle cells —
  // town walls, debris — rise as stone, full height.
  const wallH = outdoor ? 1.1 : WALL_H;
  const walls = [
    {
      p: [cx, wallH / 2, -CRAWL_CELL / 2] as const,
      s: [spanX + 1, wallH, 0.5] as const,
      m: outdoor ? maps.rock : maps.wallX,
    },
    {
      p: [cx, wallH / 2, spanZ - CRAWL_CELL / 2] as const,
      s: [spanX + 1, wallH, 0.5] as const,
      m: outdoor ? maps.rock : maps.wallX,
    },
    {
      p: [-CRAWL_CELL / 2, wallH / 2, cz] as const,
      s: [0.5, wallH, spanZ + 1] as const,
      m: outdoor ? maps.rock : maps.wallZ,
    },
    {
      p: [spanX - CRAWL_CELL / 2, wallH / 2, cz] as const,
      s: [0.5, wallH, spanZ + 1] as const,
      m: outdoor ? maps.rock : maps.wallZ,
    },
  ];
  return (
    <>
      <mesh position={[cx, 0, cz]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[spanX, spanZ]} />
        <meshStandardMaterial map={maps.f} />
      </mesh>
      {/* Interiors get a ceiling — it sells the crawler; towns get the sky. */}
      {!outdoor && (
        <mesh position={[cx, WALL_H, cz]} rotation={[Math.PI / 2, 0, 0]}>
          <planeGeometry args={[spanX, spanZ]} />
          <meshStandardMaterial map={maps.ceil} color="#6e6256" />
        </mesh>
      )}
      {walls.map((wall, i) => (
        <mesh key={i} position={wall.p as unknown as THREE.Vector3Tuple}>
          <boxGeometry args={wall.s as unknown as THREE.Vector3Tuple} />
          <meshStandardMaterial map={wall.m} />
        </mesh>
      ))}
      {obstacles.map((o) => (
        <mesh key={`${o.x},${o.y}`} position={[o.x * CRAWL_CELL, WALL_H / 2, o.y * CRAWL_CELL]}>
          <boxGeometry args={[CRAWL_CELL, WALL_H, CRAWL_CELL]} />
          <meshStandardMaterial map={outdoor ? maps.rock : maps.brick} />
        </mesh>
      ))}
    </>
  );
}

// ── Venue building: a facade the party walks INTO — stepping on its cell IS
// the engine's room entry, the doorway fade covers the crossing. ────────────
function VenueBuilding({ label }: { label: string }) {
  const tex = useTexture({ wall: TEX3D.plaster, roof: TEX3D.rooftiles });
  const maps = useMemo(
    () => ({ wall: configureTexture(tex.wall), roof: configureTexture(tex.roof) }),
    [tex]
  );
  const bw = CRAWL_CELL * 0.96;
  return (
    <group>
      <mesh position={[0, 1.6, 0]}>
        <boxGeometry args={[bw, 3.2, bw]} />
        <meshStandardMaterial map={maps.wall} />
      </mesh>
      <mesh position={[0, 4.1, 0]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[bw * 0.82, 1.8, 4]} />
        <meshStandardMaterial map={maps.roof} />
      </mesh>
      {/* The door glow on every face — approach from any side reads as entry. */}
      {[0, 1, 2, 3].map((i) => (
        <mesh
          key={i}
          position={[
            Math.sin((i * Math.PI) / 2) * (bw / 2 + 0.04),
            1.1,
            Math.cos((i * Math.PI) / 2) * (bw / 2 + 0.04),
          ]}
          rotation={[0, (i * Math.PI) / 2, 0]}
        >
          <boxGeometry args={[1.2, 2.2, 0.08]} />
          <meshStandardMaterial color="#1f4f46" emissive="#2dd4bf" emissiveIntensity={0.6} />
        </mesh>
      ))}
      <Html position={[0, 5.4, 0]} center distanceFactor={14}>
        <div style={labelStyle}>⌂ {label}</div>
      </Html>
    </group>
  );
}

// The town gate — an arch back out to the region map.
function GateArch({ label }: { label: string }) {
  const tex = useTexture({ stone: TEX3D.rock });
  const stone = useMemo(() => configureTexture(tex.stone), [tex]);
  return (
    <group>
      {[-1.1, 1.1].map((dx) => (
        <mesh key={dx} position={[dx, 1.5, 0]}>
          <boxGeometry args={[0.6, 3.0, 0.6]} />
          <meshStandardMaterial map={stone} />
        </mesh>
      ))}
      <mesh position={[0, 3.2, 0]}>
        <boxGeometry args={[2.9, 0.5, 0.7]} />
        <meshStandardMaterial map={stone} />
      </mesh>
      <Html position={[0, 4.1, 0]} center distanceFactor={14}>
        <div style={labelStyle}>⤴ {label}</div>
      </Html>
    </group>
  );
}

// Flat-color fallback while the CC0 textures load.
function RoomShellFallback({ w, h, obstacles }: { w: number; h: number; obstacles: GridPos[] }) {
  const cx = ((w - 1) * CRAWL_CELL) / 2;
  const cz = ((h - 1) * CRAWL_CELL) / 2;
  return (
    <>
      <mesh position={[cx, 0, cz]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[w * CRAWL_CELL, h * CRAWL_CELL]} />
        <meshStandardMaterial color="#42382a" />
      </mesh>
      {obstacles.map((o) => (
        <mesh key={`${o.x},${o.y}`} position={[o.x * CRAWL_CELL, WALL_H / 2, o.y * CRAWL_CELL]}>
          <boxGeometry args={[CRAWL_CELL, WALL_H, CRAWL_CELL]} />
          <meshStandardMaterial color="#303439" />
        </mesh>
      ))}
    </>
  );
}

interface Interactable {
  id: string;
  kind: 'npc' | 'object' | 'loot';
  pos: GridPos;
  name: string;
  icon?: string;
}

// ── Minimap: the genre-essential corner map, as plain DOM ───────────────────
function Minimap({
  w,
  h,
  obstacleKeys,
  exits,
  things,
  marker,
  heading,
}: {
  w: number;
  h: number;
  obstacleKeys: Set<string>;
  exits: GridPos[];
  things: Interactable[];
  marker: GridPos;
  heading: Heading;
}) {
  const px = Math.max(6, Math.min(12, Math.floor(120 / Math.max(w, h))));
  const exitKeys = new Set(exits.map((e) => `${e.x},${e.y}`));
  const thingAt = new Map(things.map((t) => [`${t.pos.x},${t.pos.y}`, t.kind]));
  const rows = [];
  for (let y = 0; y < h; y++) {
    const cells = [];
    for (let x = 0; x < w; x++) {
      const key = `${x},${y}`;
      const isMarker = marker.x === x && marker.y === y;
      const bg = obstacleKeys.has(key) ? '#11161b' : exitKeys.has(key) ? '#1f4f46' : '#2c3138';
      const kind = thingAt.get(key);
      cells.push(
        <div
          key={key}
          style={{
            width: px,
            height: px,
            background: bg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: px - 1,
            lineHeight: 1,
            color: kind === 'npc' ? '#e6c878' : kind === 'loot' ? '#9be08a' : '#c8a06a',
          }}
        >
          {isMarker ? (
            <span
              style={{
                color: '#7dd3c8',
                transform: `rotate(${heading * 90}deg)`,
                fontSize: px + 1,
              }}
            >
              ▲
            </span>
          ) : kind === 'npc' ? (
            '●'
          ) : kind ? (
            '▪'
          ) : (
            ''
          )}
        </div>
      );
    }
    rows.push(
      <div key={y} style={{ display: 'flex', gap: 1 }}>
        {cells}
      </div>
    );
  }
  return (
    <div
      data-testid="crawler-minimap"
      style={{
        position: 'absolute',
        right: 8,
        top: 8,
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        padding: 4,
        background: 'rgba(8, 11, 14, 0.78)',
        border: '1px solid rgba(120, 200, 180, 0.25)',
        borderRadius: 4,
      }}
    >
      {rows}
    </div>
  );
}

// ── The crawler ──────────────────────────────────────────────────────────────
function Crawler3DView({
  gameState,
  seed,
  grid,
  choices,
  loading,
  readOnly,
  onChoice,
  height = 440,
}: Props) {
  const marker = gameState.marker_pos ?? grid.startPos;
  const outdoor = grid.level === 'town';
  const roomDef = useMemo(
    () => seed.rooms.find((r) => r.id === gameState.current_room),
    [seed.rooms, gameState.current_room]
  );

  // Facing — pure view state, reset to "look into the room" per grid change
  // (room ↔ room, room ↔ town — the key covers every crawled level).
  const [heading, setHeading] = useState<Heading>(() => initialHeading(marker, grid));
  // Accumulated yaw target (±π/2 per turn, never normalized → shortest tween).
  const yawRef = useRef(yawForHeading(heading));
  const roomKey = `${gameState.map_level}:${gameState.current_town_id ?? ''}:${gameState.current_room}`;
  const lastRoom = useRef(roomKey);
  // Doorway fade across room changes.
  const [fading, setFading] = useState(false);
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (lastRoom.current === roomKey) return;
    lastRoom.current = roomKey;
    const h0 = initialHeading(gameState.marker_pos ?? grid.startPos, grid);
    setHeading(h0);
    yawRef.current = yawForHeading(h0);
    setFading(true);
    if (fadeTimer.current) clearTimeout(fadeTimer.current);
    fadeTimer.current = setTimeout(() => setFading(false), 80);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomKey]);
  useEffect(
    () => () => {
      if (fadeTimer.current) clearTimeout(fadeTimer.current);
    },
    []
  );

  // Interactables: NPCs standing here, unsearched objects (auto-placed when
  // authored without a pos), ground loot.
  const npcGone = useCallback(
    (id: string) =>
      gameState.npc_attitudes?.[id] === 'hostile' ||
      (gameState.enemies_killed ?? []).includes(`npc:${id}`),
    [gameState.npc_attitudes, gameState.enemies_killed]
  );
  const interactables: Interactable[] = useMemo(() => {
    const list: Interactable[] = [];
    const occupied = new Set<string>(grid.obstacles.map((o) => `${o.x},${o.y}`));
    if (roomDef?.entryPos) occupied.add(`${roomDef.entryPos.x},${roomDef.entryPos.y}`);
    for (const t of grid.transitions) occupied.add(`${t.pos.x},${t.pos.y}`);
    for (const n of Object.values(seed.npcs ?? {})) {
      if (n.roomId === gameState.current_room && n.pos && !npcGone(n.id)) {
        list.push({ id: n.id, kind: 'npc', pos: n.pos, name: n.name, icon: n.icon });
        occupied.add(`${n.pos.x},${n.pos.y}`);
      }
    }
    const loot = availableLootIn(gameState, seed, gameState.current_room);
    for (const l of loot) if (l.pos) occupied.add(`${l.pos.x},${l.pos.y}`);
    const autoPos = placeRoomObjects(roomDef?.objects ?? [], grid.width, grid.height, occupied);
    const searched = new Set(gameState.objects_searched ?? []);
    for (const o of roomDef?.objects ?? []) {
      const pos = o.pos ?? autoPos.get(o.id);
      if (pos && !searched.has(`${gameState.current_room}:${o.id}`)) {
        list.push({ id: o.id, kind: 'object', pos, name: o.name });
      }
    }
    for (const l of loot) {
      if (l.pos && l.key) list.push({ id: l.key, kind: 'loot', pos: l.pos, name: l.name });
    }
    return list;
  }, [gameState, seed, grid, roomDef, npcGone]);

  // The faced cell's interactable (or one underfoot) — the F target. A faced
  // TRANSITION gets a "step ahead to enter" hint instead (no key needed).
  const facedCell = stepTarget(marker, heading, 'forward');
  const facing =
    interactables.find((it) => it.pos.x === facedCell.x && it.pos.y === facedCell.y) ??
    interactables.find((it) => it.pos.x === marker.x && it.pos.y === marker.y) ??
    null;
  const facingDoor =
    grid.transitions.find((t) => t.pos.x === facedCell.x && t.pos.y === facedCell.y) ?? null;

  const interact = useCallback(() => {
    if (!facing) return;
    if (facing.kind === 'npc') {
      const talk = choices.find(
        (c) => c.action.type === 'talk' && (c.action as { npcId?: string }).npcId === facing.id
      );
      if (talk) onChoice(talk);
      return;
    }
    if (facing.kind === 'object') {
      const it = choices.find(
        (c) =>
          c.action.type === 'interact_object' &&
          (c.action as { objectId?: string }).objectId === facing.id
      );
      onChoice(
        it ?? {
          label: `Approach the ${facing.name}`,
          action: { type: 'approach', pos: facing.pos },
        }
      );
      return;
    }
    const pick = choices.find(
      (c) => c.action.type === 'loot' && (c.action as { lootKey?: string }).lootKey === facing.id
    );
    onChoice(
      pick ?? {
        label: `Approach the ${facing.name}`,
        action: { type: 'approach', pos: facing.pos },
      }
    );
  }, [facing, choices, onChoice]);

  // ── Keys: one press = one step (a real marker_move) or one 90° turn ──────
  const stateRef = useRef({ marker, heading, loading, readOnly, grid });
  stateRef.current = { marker, heading, loading, readOnly, grid };
  const interactRef = useRef(interact);
  interactRef.current = interact;
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const s = stateRef.current;
      if (s.readOnly) return;
      const k = e.key.toLowerCase();
      if (k === 'a' || k === 'arrowleft' || k === 'd' || k === 'arrowright') {
        e.preventDefault();
        const dir = k === 'a' || k === 'arrowleft' ? 'left' : 'right';
        setHeading((prev) => {
          yawRef.current += dir === 'left' ? Math.PI / 2 : -Math.PI / 2;
          return turn(prev, dir);
        });
        return;
      }
      const move =
        k === 'w' || k === 'arrowup'
          ? ('forward' as const)
          : k === 's' || k === 'arrowdown'
            ? ('back' as const)
            : k === 'q'
              ? ('left' as const)
              : k === 'e'
                ? ('right' as const)
                : null;
      if (move) {
        e.preventDefault();
        if (s.loading) return; // one engine step at a time
        const to = stepTarget(s.marker, s.heading, move);
        // Pre-check walls/bounds so a bump doesn't round-trip the server;
        // everything else (exits, traps, encounters) is the engine's call.
        if (isBlocked(s.grid, to)) return;
        onChoice({ label: `Step to (${to.x},${to.y})`, action: { type: 'marker_move', to } });
        return;
      }
      if (k === 'f') {
        e.preventDefault();
        interactRef.current();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onChoice]);

  // Auto-engage hostiles on room entry (same call as v1, same guards): the
  // enemies aren't world tokens pre-combat, so a stand-and-stare prompt has
  // nothing to look at. Talk choices suppress it; once per room.
  const attackChoice = choices.find((c) => c.kind === 'attack');
  const autoEngaged = useRef('');
  useEffect(() => {
    if (!attackChoice || loading || readOnly) return;
    if (choices.some((c) => c.action.type === 'talk')) return;
    if (autoEngaged.current === roomKey) return;
    const t = setTimeout(() => {
      autoEngaged.current = roomKey;
      onChoice(attackChoice);
    }, 600);
    return () => clearTimeout(t);
  }, [attackChoice, loading, readOnly, choices, roomKey, onChoice]);

  // Indoors: the room's authored lighting. Outdoors: the engine clock IS the
  // light — sunUp swings ambience and the sky color through the day.
  const lighting = roomDef?.lighting ?? 'bright';
  const minute = (gameState.world_minute ?? 480) % 1440;
  const sunUp = Math.max(0, Math.sin(((minute - 360) / 720) * Math.PI));
  const ambient = outdoor
    ? 0.35 + 0.45 * sunUp
    : lighting === 'dark'
      ? 0.12
      : lighting === 'dim'
        ? 0.28
        : 0.55;
  const sky = outdoor
    ? `rgb(${Math.round(24 + 96 * sunUp)}, ${Math.round(30 + 116 * sunUp)}, ${Math.round(44 + 136 * sunUp)})`
    : '#05070a';
  const fogFar = outdoor ? 24 : lighting === 'dark' ? 5 : 9;
  const obstacleKeys = useMemo(
    () => new Set(grid.obstacles.map((o) => `${o.x},${o.y}`)),
    [grid.obstacles]
  );

  if (!webglAvailable()) {
    return (
      <div
        data-testid="crawler-3d-unavailable"
        style={{
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--t-dim)',
          fontSize: '0.78rem',
          border: '1px solid var(--t-border)',
          borderRadius: 6,
        }}
      >
        3D VIEW NEEDS WEBGL — USE THE 2D TOGGLE.
      </div>
    );
  }

  return (
    <div
      data-testid="crawler-3d-view"
      style={{
        position: 'relative',
        height,
        borderRadius: 6,
        overflow: 'hidden',
        border: '1px solid var(--t-border)',
      }}
    >
      <Canvas
        // No `position` here: the rig owns the camera entirely (it snaps to
        // the marker on the first frame). A position prop would be re-applied
        // on re-renders, teleport-fighting the step tween.
        camera={{ fov: 70, near: 0.1, far: 80 }}
        dpr={[1, 1.75]}
      >
        <color attach="background" args={[sky]} />
        <fog attach="fog" args={[sky, CRAWL_CELL * 2, CRAWL_CELL * fogFar]} />
        <ambientLight intensity={ambient} />
        {outdoor && (
          <directionalLight
            position={[30, 25 + 50 * sunUp, 20]}
            intensity={0.3 + 0.8 * sunUp}
            color={sunUp > 0.25 ? '#fff4dc' : '#7d8bb5'}
          />
        )}
        <CameraRig
          target={{ x: marker.x * CRAWL_CELL, z: marker.y * CRAWL_CELL }}
          yawTarget={yawRef.current}
        />
        <Suspense
          fallback={<RoomShellFallback w={grid.width} h={grid.height} obstacles={grid.obstacles} />}
        >
          <RoomShell
            w={grid.width}
            h={grid.height}
            floor={grid.floor}
            obstacles={grid.obstacles}
            outdoor={outdoor}
          />
        </Suspense>
        {/* Transitions: in a town, venues are BUILDINGS you walk into and the
            gate is an arch; indoors they're glowing doorways. Either way,
            stepping on the cell IS the engine transition. */}
        {grid.transitions.map((t, i) => (
          <group key={i} position={[t.pos.x * CRAWL_CELL, 0, t.pos.y * CRAWL_CELL]}>
            {outdoor && t.kind === 'venue' ? (
              <Suspense fallback={null}>
                <VenueBuilding label={t.label} />
              </Suspense>
            ) : outdoor && t.kind === 'ascend' ? (
              <Suspense fallback={null}>
                <GateArch label={t.label} />
              </Suspense>
            ) : (
              <>
                <mesh position={[0, 1.3, 0]}>
                  <boxGeometry args={[1.4, 2.6, 0.16]} />
                  <meshStandardMaterial
                    color="#1f4f46"
                    emissive="#2dd4bf"
                    emissiveIntensity={0.6}
                    transparent
                    opacity={0.85}
                  />
                </mesh>
                <Html position={[0, 2.9, 0]} center distanceFactor={10}>
                  <div style={labelStyle}>
                    {t.kind === 'ascend' ? '⤴ ' : '⇲ '}
                    {t.label}
                  </div>
                </Html>
              </>
            )}
          </group>
        ))}
        {/* NPCs / objects / loot at their cells. */}
        {interactables.map((it) => (
          <group
            key={`${it.kind}:${it.id}`}
            position={[it.pos.x * CRAWL_CELL, 0, it.pos.y * CRAWL_CELL]}
          >
            {it.kind === 'npc' ? (
              <Suspense
                fallback={
                  <mesh position={[0, 0.95, 0]}>
                    <capsuleGeometry args={[0.35, 1.0, 6, 12]} />
                    <meshStandardMaterial color="#7dd3c8" />
                  </mesh>
                }
              >
                <Character3D
                  url={modelForNpcIcon(it.icon)}
                  height={1.75}
                  yaw={Math.atan2(marker.x - it.pos.x, marker.y - it.pos.y)}
                />
              </Suspense>
            ) : it.kind === 'object' ? (
              <mesh position={[0, 0.4, 0]}>
                <boxGeometry args={[1.0, 0.8, 0.9]} />
                <meshStandardMaterial color="#7a5b34" />
              </mesh>
            ) : (
              <mesh position={[0, 0.45, 0]}>
                <octahedronGeometry args={[0.3]} />
                <meshStandardMaterial color="#e0b341" emissive="#9a7218" emissiveIntensity={0.6} />
              </mesh>
            )}
            <Html position={[0, 2.3, 0]} center distanceFactor={9}>
              <div style={labelStyle}>{it.name}</div>
            </Html>
          </group>
        ))}
      </Canvas>

      {/* Doorway fade across room changes. */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          background: '#000',
          opacity: fading ? 1 : 0,
          transition: fading ? 'none' : 'opacity 600ms ease',
          pointerEvents: 'none',
        }}
      />

      {/* HUD: compass, minimap, interact prompt, controls hint. */}
      <div style={{ ...hudBox, left: 8, top: 8 }} data-testid="crawler-compass">
        {grid.name} · {HEADING_LABEL[heading]}
      </div>
      <Minimap
        w={grid.width}
        h={grid.height}
        obstacleKeys={obstacleKeys}
        exits={grid.transitions.map((t) => t.pos)}
        things={interactables}
        marker={marker}
        heading={heading}
      />
      {facing && !readOnly ? (
        <div
          style={{ ...hudBox, left: '50%', bottom: 34, transform: 'translateX(-50%)' }}
          data-testid="crawler-prompt"
        >
          <b style={{ color: '#9fe8da' }}>F</b>{' '}
          {facing.kind === 'npc'
            ? `Talk to ${facing.name}`
            : facing.kind === 'object'
              ? `Search the ${facing.name}`
              : `Pick up the ${facing.name}`}
        </div>
      ) : facingDoor && !readOnly ? (
        <div
          style={{ ...hudBox, left: '50%', bottom: 34, transform: 'translateX(-50%)' }}
          data-testid="crawler-prompt"
        >
          <b style={{ color: '#9fe8da' }}>W</b>{' '}
          {facingDoor.kind === 'ascend' ? 'Leave — ' : 'Enter — '}
          {facingDoor.label}
        </div>
      ) : null}
      <div style={{ ...hudBox, left: 8, bottom: 8, color: 'var(--t-dim)' }}>
        W/S move · A/D turn · Q/E strafe · F interact
      </div>
    </div>
  );
}

export default Crawler3DView;
