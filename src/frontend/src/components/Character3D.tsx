// An animated CC0 character model (KayKit — see lib/characters3d). Shared by
// the 3D world (room NPCs) and the combat diorama (PC/enemy tokens).
//
// - SkeletonUtils.clone so several instances of the same GLB animate
//   independently (a plain .clone() breaks skinned meshes).
// - Auto-normalized: the model's bounding box scales to `height` and its feet
//   sit at the group origin, so callers just position the group on the ground.
// - Plays a named clip from the stripped 7-clip set (Idle, Walking_A,
//   Running_A, 1H_Melee_Attack_Slice_Diagonal, Spellcast_Shoot, Hit_A,
//   Death_A), cross-fading on change; unknown names fall back to Idle.

import * as THREE from 'three';
import { useEffect, useMemo, useRef } from 'react';
import { SkeletonUtils } from 'three-stdlib';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';

interface Props {
  url: string;
  /** World height the model is normalized to. */
  height?: number;
  /** Facing (radians, +y axis). */
  yaw?: number;
  /** Clip name to play (defaults to Idle). */
  anim?: string;
}

function Character3D({ url, height = 1.7, yaw = 0, anim = 'Idle' }: Props) {
  const gltf = useGLTF(url);
  const cloned = useMemo(() => SkeletonUtils.clone(gltf.scene), [gltf.scene]);
  const norm = useMemo(() => {
    const box = new THREE.Box3().setFromObject(gltf.scene);
    const h = Math.max(0.0001, box.max.y - box.min.y);
    return { scale: height / h, minY: box.min.y };
  }, [gltf.scene, height]);

  const mixer = useMemo(() => new THREE.AnimationMixer(cloned), [cloned]);
  const actionRef = useRef<THREE.AnimationAction | null>(null);
  useEffect(() => {
    const clip =
      gltf.animations.find((a) => a.name === anim) ??
      gltf.animations.find((a) => /idle/i.test(a.name)) ??
      gltf.animations[0];
    if (!clip) return;
    const action = mixer.clipAction(clip);
    // One-shot clips (death/hit/attack) clamp on their last frame; loops loop.
    if (/death|hit|attack|spellcast/i.test(clip.name)) {
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
    }
    actionRef.current?.fadeOut(0.2);
    action.reset().fadeIn(0.2).play();
    actionRef.current = action;
    return () => {
      action.fadeOut(0.15);
    };
  }, [anim, mixer, gltf.animations]);
  useFrame((_, dt) => mixer.update(dt));

  return (
    <group rotation={[0, yaw, 0]} scale={[norm.scale, norm.scale, norm.scale]}>
      <primitive object={cloned} position={[0, -norm.minY, 0]} />
    </group>
  );
}

export default Character3D;
