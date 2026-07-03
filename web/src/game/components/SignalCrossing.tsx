import { Suspense, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { runtime } from "../runtime";
import { MEDIAN_X, ROAD_WIDTH, SIGNAL_WAIT } from "../constants";
import { getGlowTexture, getKerbStripeTexture, getZebraTexture } from "../textures";
import { hasNpcModel, NpcKind } from "../models";
import { NpcFigure, NpcSlot } from "./Npcs";

const HEAD_LAMPS: { key: "red" | "amber" | "green"; y: number; color: string }[] = [
  { key: "red", y: 0.38, color: "#ff3b30" },
  { key: "amber", y: 0, color: "#ffb020" },
  { key: "green", y: -0.38, color: "#2ee06a" },
];

interface LampRefs {
  mats: (THREE.MeshStandardMaterial | null)[];
  glows: (THREE.Sprite | null)[];
}

/** One signal head: black housing, visors and three switchable lamps. */
function SignalHead({
  scale = 1,
  refs,
}: {
  scale?: number;
  refs: LampRefs;
}) {
  return (
    <group scale={scale}>
      <mesh castShadow>
        <boxGeometry args={[0.42, 1.28, 0.3]} />
        <meshStandardMaterial color="#15181d" roughness={0.6} />
      </mesh>
      {/* white target board behind the housing — classic junction visibility */}
      <mesh position={[0, 0, -0.17]}>
        <boxGeometry args={[0.6, 1.5, 0.04]} />
        <meshStandardMaterial color="#22252b" roughness={0.7} />
      </mesh>
      {HEAD_LAMPS.map((lamp, i) => (
        <group key={lamp.key} position={[0, lamp.y, 0.16]}>
          {/* visor hood */}
          <mesh position={[0, 0.1, 0.05]} rotation={[0.35, 0, 0]}>
            <cylinderGeometry args={[0.15, 0.15, 0.16, 10, 1, true, Math.PI, Math.PI]} />
            <meshStandardMaterial color="#101318" side={THREE.DoubleSide} roughness={0.6} />
          </mesh>
          <mesh>
            <circleGeometry args={[0.125, 20]} />
            <meshStandardMaterial
              ref={(m) => (refs.mats[i] = m)}
              color={lamp.color}
              emissive={lamp.color}
              emissiveIntensity={0.05}
              roughness={0.4}
            />
          </mesh>
          <sprite ref={(s) => (refs.glows[i] = s)} position={[0, 0, 0.12]} scale={[0.9, 0.9, 1]}>
            <spriteMaterial
              map={getGlowTexture()}
              color={lamp.color}
              transparent
              opacity={0}
              depthWrite={false}
            />
          </sprite>
        </group>
      ))}
    </group>
  );
}

/** Pole with striped base; arm optional (main pole carries the overhead head). */
function SignalPole({ x, height, arm }: { x: number; height: number; arm: boolean }) {
  const stripes = getKerbStripeTexture();
  return (
    <group position={[x, 0, 0]}>
      <mesh position={[0, 0.55, 0]} castShadow>
        <cylinderGeometry args={[0.09, 0.11, 1.1, 10]} />
        <meshStandardMaterial map={stripes} color="#e8e0cf" roughness={0.7} />
      </mesh>
      <mesh position={[0, height / 2 + 1.1, 0]} castShadow>
        <cylinderGeometry args={[0.07, 0.09, height, 10]} />
        <meshStandardMaterial color="#2f3d33" roughness={0.55} metalness={0.35} />
      </mesh>
      {arm && (
        <mesh position={[x > 0 ? -2.6 : 2.6, height + 1.02, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.055, 0.065, 5.2, 8]} />
          <meshStandardMaterial color="#2f3d33" roughness={0.55} metalness={0.35} />
        </mesh>
      )}
    </group>
  );
}

interface CrosserState {
  x: number;
  dir: 1 | -1;
  active: boolean;
  eventId: number;
}

const CROSSER_DEFS: { kind: NpcKind; startX: number; dir: 1 | -1; z: number; speed: number }[] = [
  { kind: "woman", startX: 8.8, dir: -1, z: -3.4, speed: 5.2 },
  { kind: "man", startX: -7.6, dir: 1, z: -5.2, speed: 4.6 },
];

/**
 * Pedestrians who hurry across the zebra while the runner waits at red —
 * the payoff moment that shows WHY stopping matters.
 */
function ZebraCrosser({
  def,
  zebraZ,
}: {
  def: { kind: NpcKind; startX: number; dir: 1 | -1; z: number; speed: number };
  zebraZ: number;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const state = useRef<CrosserState>({ x: def.startX, dir: def.dir, active: false, eventId: -1 });

  useFrame((_, dt) => {
    const g = groupRef.current;
    if (!g) return;
    const sig = runtime.signal;
    const s = state.current;
    // A fresh stop event re-arms the crosser at its kerb.
    if (sig.active && sig.stopped && s.eventId !== sig.eventId) {
      s.eventId = sig.eventId;
      s.x = def.startX;
      s.active = true;
    }
    if (!sig.active) s.active = false;
    if (!s.active) {
      g.visible = false;
      return;
    }
    // Hurry across; finish the walk even after the light flips green.
    s.x += def.dir * def.speed * Math.min(dt, 0.05);
    const doneRight = def.dir === 1 && s.x > 8.8;
    const doneLeft = def.dir === -1 && s.x < -7.8;
    if (doneRight || doneLeft) {
      s.active = false;
      g.visible = false;
      return;
    }
    g.visible = true;
    g.position.set(s.x, 0.18, zebraZ + def.z);
    g.rotation.y = def.dir === 1 ? Math.PI / 2 : -Math.PI / 2;
  });

  const slot: NpcSlot = useMemo(
    () => ({ kind: def.kind, mode: "walk", x: 0, z: 0, dir: 1, walkSpeed: def.speed, timeScale: 2.1 }),
    [def],
  );

  if (!hasNpcModel(def.kind)) return null;
  return (
    <group ref={groupRef} visible={false}>
      <Suspense fallback={null}>
        <NpcFigure slot={slot} />
      </Suspense>
    </group>
  );
}

/**
 * The whole junction: zebra paint, stop line, twin signal poles with an
 * overhead head, live lamp switching and red-wait countdown ring. Anchored
 * to runtime.signal.z every frame; hidden when no event is active.
 */
export function SignalCrossing() {
  const rootRef = useRef<THREE.Group>(null);
  const polesRef = useRef<THREE.Group>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const mainRefs = useMemo<LampRefs>(() => ({ mats: [], glows: [] }), []);
  const medianRefs = useMemo<LampRefs>(() => ({ mats: [], glows: [] }), []);

  useFrame(() => {
    const root = rootRef.current;
    if (!root) return;
    const sig = runtime.signal;
    if (!sig.active) {
      root.visible = false;
      return;
    }
    root.visible = true;
    root.position.z = sig.z;
    // Hide the tall furniture once it sweeps past the player so it never
    // clips through the chase camera (road paint can stay).
    if (polesRef.current) polesRef.current.visible = sig.z < 3.4;

    const lampOn = (key: "red" | "amber" | "green"): boolean => {
      if (sig.state === "red") return key === "red";
      if (sig.state === "amber") return key === "amber";
      return key === "green"; // green + go
    };
    for (const refs of [mainRefs, medianRefs]) {
      HEAD_LAMPS.forEach((lamp, i) => {
        const on = lampOn(lamp.key);
        const mat = refs.mats[i];
        if (mat) mat.emissiveIntensity = on ? 2.6 : 0.05;
        const glow = refs.glows[i];
        if (glow) (glow.material as THREE.SpriteMaterial).opacity = on ? 0.75 : 0;
      });
    }
    // Countdown ring shrinks while the runner waits at red.
    if (ringRef.current) {
      const waiting = sig.stopped;
      ringRef.current.visible = waiting;
      if (waiting) {
        const f = Math.max(0.02, sig.waitT / SIGNAL_WAIT);
        ringRef.current.scale.setScalar(0.6 + f * 0.9);
        (ringRef.current.material as THREE.MeshBasicMaterial).opacity = 0.35 + f * 0.4;
      }
    }
  });

  const zebra = getZebraTexture();
  const half = ROAD_WIDTH / 2;

  return (
    <group ref={rootRef} visible={false}>
      {/* stop line just before the crossing */}
      <mesh position={[0, 0.017, 0.9]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[ROAD_WIDTH, 0.45]} />
        <meshStandardMaterial color="#e6e3da" roughness={0.8} />
      </mesh>
      {/* zebra belt */}
      <mesh position={[0, 0.016, -2.6]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[ROAD_WIDTH + 0.8, 3.6]} />
        <meshStandardMaterial map={zebra} roughness={0.85} />
      </mesh>
      {/* waiting countdown ring around the runner's stop spot */}
      <mesh ref={ringRef} position={[0, 0.02, 2.2]} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[0.85, 1.02, 40]} />
        <meshBasicMaterial color="#ff5148" transparent opacity={0.6} depthWrite={false} />
      </mesh>

      <group ref={polesRef}>
        {/* kerbside main pole with the overhead arm + hanging head */}
        <SignalPole x={half + 1.15} height={4.6} arm />
        <group position={[half + 1.15 - 2.6, 4.9, 0]}>
          <SignalHead refs={mainRefs} />
        </group>
        {/* median repeater pole, smaller head at driver eye level */}
        <SignalPole x={MEDIAN_X + 0.9} height={2.5} arm={false} />
        <group position={[MEDIAN_X + 0.9, 3.15, 0]}>
          <SignalHead scale={0.72} refs={medianRefs} />
        </group>
      </group>

      {CROSSER_DEFS.map((def, i) => (
        <ZebraCrosser key={i} def={def} zebraZ={-2.6} />
      ))}
    </group>
  );
}
