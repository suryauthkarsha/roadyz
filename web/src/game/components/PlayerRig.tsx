import { Suspense, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { runtime } from "../runtime";
import { useGameUI } from "../store";
import { gearById } from "../shop";
import {
  CycleRiderModel,
  CycleSprintRig,
  PEDAL_PHASE_PER_M,
  PlayerCharacter,
  hasBicycleModel,
  hasCycleModel,
} from "../models";

function FallbackKid() {
  return (
    <group>
      <mesh position={[0, 0.62, 0]} castShadow>
        <capsuleGeometry args={[0.28, 0.62, 6, 12]} />
        <meshStandardMaterial color="#14b8a6" />
      </mesh>
      <mesh position={[0, 1.32, 0]} castShadow>
        <sphereGeometry args={[0.22, 16, 16]} />
        <meshStandardMaterial color="#c98d5f" />
      </mesh>
    </group>
  );
}

const AURA_STARS = 5;

/** Golden stars orbiting the runner (shop gear). */
function StarAuraGear() {
  const group = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const g = group.current;
    if (!g) return;
    const t = clock.getElapsedTime();
    g.rotation.y = t * 2.2;
    g.children.forEach((child, i) => {
      child.position.y = 0.95 + Math.sin(t * 3 + i * 1.7) * 0.28;
      child.rotation.y = t * 4 + i;
    });
  });
  return (
    <group ref={group}>
      {Array.from({ length: AURA_STARS }, (_, i) => {
        const a = (i / AURA_STARS) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.cos(a) * 0.58, 0.95, Math.sin(a) * 0.58]}>
            <octahedronGeometry args={[0.055, 0]} />
            <meshStandardMaterial color="#fde047" emissive="#f59e0b" emissiveIntensity={1.4} />
          </mesh>
        );
      })}
    </group>
  );
}

const HALO_SIGNS = 6;
/** Plate shapes: 3 = triangle sign, 32 = circle sign, 8 = octagon (STOP). */
const HALO_SEGMENTS: number[] = [3, 32, 8, 3, 32, 8];

/**
 * Sticker Book master reward: a slow-orbiting golden ring of tiny glowing
 * road-sign plates. Pure light effect — no costume geometry on the kid.
 */
function SignHaloGear() {
  const group = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const g = group.current;
    if (!g) return;
    const t = clock.getElapsedTime();
    g.rotation.y = t * 1.7;
    g.children.forEach((child, i) => {
      child.position.y = 1.02 + Math.sin(t * 2.6 + i * 1.3) * 0.22;
    });
  });
  return (
    <group ref={group}>
      {Array.from({ length: HALO_SIGNS }, (_, i) => {
        const a = (i / HALO_SIGNS) * Math.PI * 2;
        return (
          <group key={i} position={[Math.cos(a) * 0.6, 1.02, Math.sin(a) * 0.6]} rotation={[0, -a, 0]}>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.07, 0.07, 0.014, HALO_SEGMENTS[i]]} />
              <meshStandardMaterial
                color="#fbbf24"
                emissive="#b45309"
                emissiveIntensity={1.2}
                metalness={0.55}
                roughness={0.3}
              />
            </mesh>
          </group>
        );
      })}
      <pointLight color="#fbbf24" intensity={0.9} distance={3.4} position={[0, 1.15, 0]} />
    </group>
  );
}

const TRAIL_COUNT = 26;
const TRAIL_LIFE = 0.5;

interface TrailParticle {
  x: number;
  y: number;
  z: number;
  life: number;
}

/**
 * Golden speed streaks that stream off the runner while a hot combo (×3+),
 * Badge Rush or Cycle Sprint is active — pure feel, no gameplay effect.
 * One instanced mesh; particles fly toward the camera with the world flow.
 */
function SpeedTrail() {
  const ui = useGameUI();
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const matRef = useRef<THREE.MeshBasicMaterial>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const particles = useMemo<TrailParticle[]>(
    () => Array.from({ length: TRAIL_COUNT }, () => ({ x: 0, y: 0, z: 0, life: 0 })),
    [],
  );
  const spawnTimer = useRef(0);
  const cursor = useRef(0);
  const rainbow = ui.gearEquipped.trail === "rainbow_trail";

  useFrame(({ clock }, dt) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const clamped = Math.min(dt, 0.05);
    const hot =
      runtime.phase === "playing" &&
      (runtime.multiplier >= 3 ||
        runtime.rushOn ||
        runtime.power.type === "cycle" ||
        (rainbow && runtime.speed > 16));
    if (matRef.current) {
      if (rainbow) matRef.current.color.setHSL((clock.getElapsedTime() * 0.35) % 1, 0.85, 0.6);
      else matRef.current.color.set("#ffd166");
    }

    if (hot) {
      spawnTimer.current -= clamped;
      while (spawnTimer.current <= 0) {
        spawnTimer.current += 0.035;
        const p = particles[cursor.current];
        cursor.current = (cursor.current + 1) % TRAIL_COUNT;
        const side = Math.random() < 0.5 ? -1 : 1;
        p.x = runtime.player.x + side * (0.3 + Math.random() * 0.55);
        p.y = runtime.player.y + 0.25 + Math.random() * 1.1;
        p.z = 0.3 + Math.random() * 0.4;
        p.life = TRAIL_LIFE;
      }
    }

    let visibleAny = false;
    for (let i = 0; i < TRAIL_COUNT; i++) {
      const p = particles[i];
      if (p.life > 0) {
        p.life -= clamped;
        p.z += (runtime.speed * 0.9 + 6) * clamped;
      }
      const f = Math.max(0, p.life / TRAIL_LIFE);
      if (f > 0) visibleAny = true;
      dummy.position.set(p.x, p.y, p.z);
      dummy.scale.set(Math.max(0.001, f), Math.max(0.001, f), Math.max(0.001, f * (1 + runtime.speed * 0.04)));
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.visible = visibleAny;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, TRAIL_COUNT]} visible={false} frustumCulled={false}>
      <boxGeometry args={[0.045, 0.045, 0.85]} />
      <meshBasicMaterial
        ref={matRef}
        color="#ffd166"
        transparent
        opacity={0.85}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </instancedMesh>
  );
}

function PowerAura() {
  const ui = useGameUI();
  const glowRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (glowRef.current) {
      const pulse = 1 + Math.sin(t * 6) * 0.08;
      glowRef.current.scale.setScalar(pulse);
      const mat = glowRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.16 + Math.sin(t * 6) * 0.05;
    }
    if (ringRef.current) {
      ringRef.current.rotation.z = t * 2.4;
    }
  });

  if (!ui.power) return null;
  const color =
    ui.power.type === "jacket" ? "#fbbf24" : ui.power.type === "cycle" ? "#38bdf8" : "#34d399";

  return (
    <group>
      {ui.power.type === "jacket" && (
        <mesh ref={glowRef} position={[0, 0.85, 0]}>
          <sphereGeometry args={[0.95, 20, 20]} />
          <meshBasicMaterial color={color} transparent opacity={0.18} depthWrite={false} />
        </mesh>
      )}
      <mesh ref={ringRef} position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.62, 0.82, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.75} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <pointLight color={color} intensity={ui.power.type === "jacket" ? 2.4 : 1.2} distance={6} position={[0, 1.4, 0]} />
    </group>
  );
}

/**
 * Gameplay container for the runner. Container tracks lane/jump position;
 * the runtime child handles slide squash and lane lean without touching the
 * normalized visual transform. During Cycle Sprint the runner visual swaps
 * to the pedaling-kid-on-bicycle rig (or the static combined model as a
 * fallback) with a scale pop + ride bob.
 */
export function PlayerRig() {
  const ui = useGameUI();
  const containerRef = useRef<THREE.Group>(null);
  const runtimeChildRef = useRef<THREE.Group>(null);
  const runnerRef = useRef<THREE.Group>(null);
  const cycleRef = useRef<THREE.Group>(null);
  const crouch = useRef(0);
  const swap = useRef(0);

  const auraGear = ui.gearEquipped.aura ? gearById(ui.gearEquipped.aura) : undefined;

  useFrame((_, dt) => {
    const p = runtime.player;
    const container = containerRef.current;
    const child = runtimeChildRef.current;
    if (!container || !child) return;
    container.position.set(p.x, p.y, 0);

    const cycleAvailable = hasBicycleModel() || hasCycleModel();
    const cycleActive = runtime.power.type === "cycle" && cycleAvailable;
    swap.current += ((cycleActive ? 1 : 0) - swap.current) * Math.min(1, 10 * dt);
    const s = swap.current;

    // Cyclists duck instead of the full slide squash.
    const targetCrouch = p.slideTimer > 0 && !p.jumping ? (cycleActive ? 0.32 : 1) : 0;
    crouch.current += (targetCrouch - crouch.current) * Math.min(1, 14 * dt);
    child.scale.y = 1 - crouch.current * 0.45;
    child.rotation.x = crouch.current * 0.5;

    const laneTargetX = p.x;
    const lean = THREE.MathUtils.clamp((laneTargetX - container.position.x) * 0.4, -0.3, 0.3);
    child.rotation.z += (lean - child.rotation.z) * Math.min(1, 10 * dt);

    const runner = runnerRef.current;
    if (runner) {
      runner.visible = s < 0.55;
      const rs = THREE.MathUtils.clamp(1 - s * 1.7, 0.05, 1);
      runner.scale.setScalar(rs);
    }
    const cycleG = cycleRef.current;
    if (cycleG) {
      cycleG.visible = s > 0.45;
      const cs = THREE.MathUtils.clamp((s - 0.45) * 1.9, 0.05, 1);
      cycleG.scale.setScalar(cs);
      // Ride motion locked to the SAME pedal phase as the legs/cranks: the
      // bike surges and rocks with each downstroke plus a subtle steering
      // wander — the pedaling itself happens inside the rig on the skeleton.
      const pedal = runtime.distance * PEDAL_PHASE_PER_M;
      cycleG.position.y = Math.abs(Math.sin(pedal)) * 0.022;
      cycleG.rotation.z = Math.sin(pedal) * 0.024;
      cycleG.rotation.y = Math.sin(pedal * 0.5) * 0.016;
    }
  });

  return (
    <group ref={containerRef}>
      <group ref={runtimeChildRef} name="generated_model_runtime">
        <group ref={runnerRef}>
          <Suspense fallback={<FallbackKid />}>
            <PlayerCharacter />
          </Suspense>
        </group>
        {(hasBicycleModel() || hasCycleModel()) && (
          <group ref={cycleRef} visible={false}>
            <Suspense fallback={null}>
              {hasBicycleModel() ? <CycleSprintRig /> : <CycleRiderModel />}
            </Suspense>
          </group>
        )}
      </group>
      {auraGear && (auraGear.id === "sign_master_halo" ? <SignHaloGear /> : <StarAuraGear />)}
      <PowerAura />
      <SpeedTrail />
    </group>
  );
}
