import { Suspense, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { useAnimations, useGLTF } from "@react-three/drei";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import { runtime } from "../runtime";
import { computeModelNormalization } from "../modelUtils";
import { hasNpcModel, NPC_CONFIG, NpcKind } from "../models";

export interface NpcSlot {
  kind: NpcKind;
  mode: "walk" | "idle";
  /** Footpath lane (right footpath outer edge or far-left footpath). */
  x: number;
  z: number;
  /** +1 strolls toward the camera (faces +Z), -1 walks away with the runner. */
  dir: 1 | -1;
  walkSpeed: number;
  timeScale: number;
}

/**
 * A handful of pedestrians scattered along both footpaths — walkers keep to
 * the outer edge so the Footpath power-up lane (x≈7.1) stays clear.
 */
const SLOTS: NpcSlot[] = [
  { kind: "man", mode: "walk", x: 8.55, z: -55, dir: 1, walkSpeed: 1.35, timeScale: 1 },
  { kind: "woman", mode: "walk", x: 9.2, z: -135, dir: -1, walkSpeed: 1.15, timeScale: 0.94 },
  { kind: "woman", mode: "walk", x: 8.8, z: -205, dir: 1, walkSpeed: 1.25, timeScale: 1.02 },
  { kind: "man", mode: "walk", x: -19.2, z: -95, dir: 1, walkSpeed: 1.3, timeScale: 1.05 },
  { kind: "man", mode: "idle", x: 8.62, z: -32, dir: 1, walkSpeed: 0, timeScale: 0.9 },
  { kind: "woman", mode: "idle", x: -19.55, z: -165, dir: 1, walkSpeed: 0, timeScale: 1 },
];

/**
 * One skinned pedestrian: rigged GLB clone playing its in-place walk or idle
 * clip on its own mixer, normalized to real human height and facing +Z
 * (the actor group yaws it for away-facing walkers).
 */
export function NpcFigure({ slot }: { slot: NpcSlot }) {
  const entry = NPC_CONFIG[slot.kind];
  const rigged = useGLTF(entry.rigged);
  const clipGltf = useGLTF(slot.mode === "walk" ? entry.walk : entry.idle);

  const scene = useMemo(() => {
    const clone = SkeletonUtils.clone(rigged.scene);
    clone.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (mesh.isMesh) mesh.castShadow = true;
    });
    return clone;
  }, [rigged.scene]);

  const norm = useMemo(
    () =>
      computeModelNormalization({
        object: scene,
        localFrontAxis: entry.front,
        localUpAxis: entry.up,
        desiredWorldForward: new THREE.Vector3(0, 0, 1),
        sizeMode: "height",
        targetSize: entry.height,
      }),
    [scene, entry],
  );

  const clips = useMemo(() => {
    const src = clipGltf.animations[0];
    if (!src) return [];
    const clip = src.clone();
    clip.name = "motion";
    return [clip];
  }, [clipGltf]);

  const { actions } = useAnimations(clips, scene);

  useEffect(() => {
    const action = actions.motion;
    if (!action) return;
    action.reset().play();
    action.timeScale = slot.timeScale;
    // De-sync clones so the crowd never moves in lockstep.
    action.time = Math.random() * action.getClip().duration;
  }, [actions, slot.timeScale]);

  return (
    <group position={norm.position} quaternion={norm.quaternion} scale={norm.scale}>
      <primitive object={scene} />
    </group>
  );
}

/** Moves one pedestrian with the scrolling world and recycles them endlessly. */
function NpcActor({ slot }: { slot: NpcSlot }) {
  const groupRef = useRef<THREE.Group>(null);
  const state = useRef({ x: slot.x, z: slot.z, dir: slot.dir });

  useFrame((_, dt) => {
    const g = groupRef.current;
    if (!g) return;
    const clamped = Math.min(dt, 0.05);
    const s = state.current;
    const flow = runtime.phase === "playing" ? runtime.speed : 0;
    s.z += (flow + s.dir * slot.walkSpeed) * clamped;
    if (s.z > 24) {
      s.z = -200 - Math.random() * 80;
      s.x = slot.x + (Math.random() - 0.5) * 0.7;
      if (slot.mode === "walk" && Math.random() < 0.5) s.dir = (s.dir * -1) as 1 | -1;
    } else if (s.z < -300) {
      // Menu-time strollers walking away never leave the corridor for good.
      s.z = 22;
    }
    g.position.set(s.x, 0.18, s.z);
    g.rotation.y = s.dir === 1 ? 0 : Math.PI;
  });

  return (
    <group ref={groupRef} position={[slot.x, 0.18, slot.z]}>
      <Suspense fallback={null}>
        <NpcFigure slot={slot} />
      </Suspense>
    </group>
  );
}

/** Picks the requested NPC model, or the other one if only one is wired. */
function resolveKind(kind: NpcKind): NpcKind | null {
  if (hasNpcModel(kind)) return kind;
  const other: NpcKind = kind === "man" ? "woman" : "man";
  return hasNpcModel(other) ? other : null;
}

/** All footpath pedestrians. Renders nothing until the NPC models are wired. */
export function NpcCrowd() {
  return (
    <>
      {SLOTS.map((slot, i) => {
        const kind = resolveKind(slot.kind);
        return kind ? <NpcActor key={i} slot={{ ...slot, kind }} /> : null;
      })}
    </>
  );
}
