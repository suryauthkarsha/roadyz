import { Suspense, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Entity, EntityKind, runtime } from "../runtime";
import {
  ConeModel,
  GoldenConeModel,
  hasConeModel,
  MotorcycleRig,
  VehicleKind,
  VehicleModel,
  VEHICLE_CONFIG,
} from "../models";
import { getBannerTexture, getSignTexture } from "../textures";
import { ONCOMING_LANES, ROAD_WIDTH } from "../constants";
import { nightMaterials } from "./CityScape";

/** Front/rear light anchor per vehicle kind (local, |z| = half length). */
const LIGHT_ANCHORS: Record<VehicleKind, { xs: number[]; y: number; z: number }> = {
  auto: { xs: [0], y: 0.74, z: 1.3 },
  bus: { xs: [-0.82, 0.82], y: 0.95, z: 4.5 },
  car: { xs: [-0.6, 0.6], y: 0.7, z: 1.9 },
  moto: { xs: [0], y: 0.82, z: 1.05 },
};

const FALLBACK_COLORS: Record<VehicleKind, string> = {
  auto: "#facc15",
  bus: "#2563eb",
  car: "#dc2626",
  moto: "#374151",
};

function FallbackVehicle({ kind }: { kind: VehicleKind }) {
  const { length } = VEHICLE_CONFIG[kind];
  const height = kind === "bus" ? 3 : kind === "auto" ? 1.8 : kind === "moto" ? 1.7 : 1.4;
  const width = kind === "bus" ? 2.3 : kind === "moto" ? 0.8 : 1.7;
  return (
    <mesh position={[0, height / 2, 0]}>
      <boxGeometry args={[width, height, length]} />
      <meshStandardMaterial color={FALLBACK_COLORS[kind]} />
    </mesh>
  );
}

/** Syncs a fixed list of group slots to the active entities of given kinds. */
function usePoolSync(
  kinds: EntityKind[],
  slots: React.MutableRefObject<(THREE.Group | null)[]>,
  onAssign?: (group: THREE.Group, entity: Entity, dt: number) => void,
) {
  const scratch = useRef<Entity[]>([]);
  useFrame((_, dt) => {
    const list = scratch.current;
    list.length = 0;
    for (const e of runtime.entities) {
      if (e.active && kinds.includes(e.kind)) list.push(e);
    }
    const groups = slots.current;
    for (let i = 0; i < groups.length; i++) {
      const group = groups[i];
      if (!group) continue;
      const entity = list[i];
      if (!entity) {
        group.visible = false;
        continue;
      }
      group.visible = true;
      group.position.set(entity.x, entity.y, entity.z);
      if (group.userData.entityId !== entity.id) {
        group.userData.entityId = entity.id;
        group.rotation.set(0, 0, 0);
      }
      if (onAssign) onAssign(group, entity, dt);
    }
  });
}

/**
 * Per-kind living motion so traffic never slides statically: motorcycles
 * weave, lean, pitch with the throttle and buzz on their suspension; autos
 * rattle, buses sway slowly, cars get a faint suspension shimmer. Applied
 * AFTER the pool sync sets the entity position, so collision truth
 * (entity.x/z) is untouched.
 */
function applyVehicleMotion(kind: VehicleKind, group: THREE.Group, entity: Entity, t: number): void {
  const seed = entity.id * 1.37;
  if (kind === "moto") {
    const weave = Math.sin(t * 1.7 + seed);
    const lean = -Math.cos(t * 1.7 + seed);
    group.position.x += weave * 0.22;
    group.position.y += Math.abs(Math.sin(t * 11 + seed)) * 0.02;
    // Lean into the weave + high-frequency handlebar shiver.
    group.rotation.z = lean * 0.13 + Math.sin(t * 9 + seed * 2) * 0.012;
    group.rotation.y = lean * 0.07;
    // Throttle pitch: nose lifts a touch on surges, dips on the roll-off.
    group.rotation.x = -0.015 + Math.sin(t * 2.4 + seed * 1.7) * 0.02;
  } else if (kind === "auto") {
    group.position.y += Math.abs(Math.sin(t * 10 + seed)) * 0.012;
    group.rotation.z = Math.sin(t * 3.1 + seed) * 0.016;
  } else if (kind === "bus") {
    group.position.y += Math.sin(t * 7 + seed) * 0.008;
    group.rotation.z = Math.sin(t * 1.2 + seed) * 0.009;
  } else {
    group.position.y += Math.sin(t * 9 + seed) * 0.008;
  }
}

function VehiclePool({ kind, count }: { kind: VehicleKind; count: number }) {
  const slots = useRef<(THREE.Group | null)[]>([]);
  const anchor = LIGHT_ANCHORS[kind];
  const timeRef = useRef(0);
  useFrame((_, dt) => {
    timeRef.current += Math.min(dt, 0.05);
  });
  usePoolSync([kind], slots, (group, entity, dt) => {
    if (entity.bouncing) {
      group.rotation.y += entity.spin * dt;
      group.rotation.z += entity.spin * 0.4 * dt;
      return;
    }
    applyVehicleMotion(kind, group, entity, timeRef.current);
  });
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <group key={i} ref={(g) => (slots.current[i] = g)} visible={false}>
          <Suspense fallback={<FallbackVehicle kind={kind} />}>
            {kind === "moto" ? <MotorcycleRig /> : <VehicleModel kind={kind} />}
          </Suspense>
          {/* Tail lights face the player (vehicles travel away, toward -Z) */}
          {anchor.xs.map((x) => (
            <mesh key={x} position={[x, anchor.y, anchor.z]} material={nightMaterials.taillight}>
              <sphereGeometry args={[0.07, 8, 8]} />
            </mesh>
          ))}
        </group>
      ))}
    </>
  );
}

const ONCOMING_KINDS: VehicleKind[] = ["car", "auto", "moto", "bus", "car", "auto", "moto"];

interface OncomingState {
  z: number;
  lane: number;
  own: number;
}

/**
 * Visual-only traffic on the opposite carriageway, flowing toward the camera.
 * Separated by the median — never collides, sells the divided main road.
 */
function OncomingTraffic() {
  const slots = useRef<(THREE.Group | null)[]>([]);
  const states = useRef<OncomingState[]>(
    ONCOMING_KINDS.map((_, i) => ({
      z: -40 - i * 44 - Math.random() * 24,
      lane: i % 3,
      own: 8 + Math.random() * 9,
    })),
  );

  useFrame(({ clock }, dt) => {
    const clamped = Math.min(dt, 0.05);
    const worldFlow = runtime.phase === "playing" ? runtime.speed : 5;
    const t = clock.getElapsedTime();
    states.current.forEach((s, i) => {
      const group = slots.current[i];
      if (!group) return;
      s.z += (worldFlow + s.own) * clamped;
      if (s.z > 26) {
        s.z = -300 - Math.random() * 90;
        s.lane = Math.floor(Math.random() * 3);
        s.own = 8 + Math.random() * 10;
      }
      group.position.set(ONCOMING_LANES[s.lane], 0, s.z);
      const kind = ONCOMING_KINDS[i];
      const seed = i * 2.63;
      if (kind === "moto") {
        const lean = -Math.cos(t * 1.5 + seed);
        group.position.x += Math.sin(t * 1.5 + seed) * 0.16;
        group.position.y = Math.abs(Math.sin(t * 10.5 + seed)) * 0.02;
        group.rotation.z = lean * 0.11 + Math.sin(t * 8.5 + seed) * 0.01;
        group.rotation.y = lean * 0.05;
        group.rotation.x = -0.012 + Math.sin(t * 2.2 + seed) * 0.018;
      } else if (kind === "auto") {
        group.position.y = Math.abs(Math.sin(t * 10 + seed)) * 0.012;
        group.rotation.z = Math.sin(t * 3 + seed) * 0.014;
      } else {
        group.position.y = Math.sin(t * 8 + seed) * 0.008;
      }
    });
  });

  return (
    <>
      {ONCOMING_KINDS.map((kind, i) => {
        const anchor = LIGHT_ANCHORS[kind];
        return (
          <group key={i} ref={(g) => (slots.current[i] = g)}>
            <Suspense fallback={<FallbackVehicle kind={kind} />}>
              {kind === "moto" ? (
                <MotorcycleRig forward={[0, 0, 1]} />
              ) : (
                <VehicleModel kind={kind} forward={[0, 0, 1]} />
              )}
            </Suspense>
            {/* Headlights face the player (oncoming, toward +Z) */}
            {anchor.xs.map((x) => (
              <mesh key={x} position={[x, anchor.y, anchor.z]} material={nightMaterials.headlight}>
                <sphereGeometry args={[0.09, 8, 8]} />
              </mesh>
            ))}
          </group>
        );
      })}
    </>
  );
}

const CONE_XS = [-1.05, -0.35, 0.35, 1.05];

function ProceduralCone() {
  return (
    <group>
      <mesh position={[0, 0.36, 0]} castShadow>
        <coneGeometry args={[0.26, 0.72, 12]} />
        <meshStandardMaterial color="#f97316" />
      </mesh>
      <mesh position={[0, 0.34, 0]}>
        <cylinderGeometry args={[0.19, 0.21, 0.12, 12]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
      <mesh position={[0, 0.02, 0]}>
        <boxGeometry args={[0.42, 0.05, 0.42]} />
        <meshStandardMaterial color="#ea580c" />
      </mesh>
    </group>
  );
}

/** Row of 4 cones — generated realistic cone model with procedural fallback. */
function ConeRow() {
  return (
    <group>
      {CONE_XS.map((x, i) => (
        <group key={x} position={[x, 0, 0]} rotation={[0, (i * 37) % 6, 0]}>
          {hasConeModel() ? (
            <Suspense fallback={<ProceduralCone />}>
              <ConeModel />
            </Suspense>
          ) : (
            <ProceduralCone />
          )}
        </group>
      ))}
    </group>
  );
}

function ConePool({ count }: { count: number }) {
  const slots = useRef<(THREE.Group | null)[]>([]);
  usePoolSync(["cones"], slots);
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <group key={i} ref={(g) => (slots.current[i] = g)} visible={false}>
          <ConeRow />
        </group>
      ))}
    </>
  );
}

/** Procedural golden cone fallback (until the generated cone model exists). */
function ProceduralGoldenCone() {
  return (
    <group>
      <mesh position={[0, 0.4, 0]} castShadow>
        <coneGeometry args={[0.28, 0.8, 14]} />
        <meshStandardMaterial color="#fbbf24" metalness={0.92} roughness={0.22} emissive="#b45309" emissiveIntensity={0.55} />
      </mesh>
      <mesh position={[0, 0.02, 0]}>
        <boxGeometry args={[0.46, 0.05, 0.46]} />
        <meshStandardMaterial color="#f59e0b" metalness={0.85} roughness={0.3} />
      </mesh>
    </group>
  );
}

/**
 * Rare Golden Cone collectible: the cone model in polished gold, slowly
 * spinning and bobbing with a halo ring — unmissable treasure on the road.
 */
function GoldenSlot({ slotRef }: { slotRef: (g: THREE.Group | null) => void }) {
  const inner = useRef<THREE.Group>(null);
  const halo = useRef<THREE.Mesh>(null);
  const groupRef = useRef<THREE.Group | null>(null);

  useFrame(({ clock }) => {
    const group = groupRef.current;
    if (!group || !group.visible) return;
    const t = clock.getElapsedTime();
    if (inner.current) {
      inner.current.rotation.y = t * 2.6;
      inner.current.position.y = Math.sin(t * 3.2) * 0.1 + 0.08;
    }
    if (halo.current) {
      halo.current.rotation.z = t * 1.8;
      const mat = halo.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.55 + Math.sin(t * 5) * 0.25;
    }
  });

  return (
    <group
      ref={(g) => {
        groupRef.current = g;
        slotRef(g);
      }}
      visible={false}
    >
      <group ref={inner}>
        {hasConeModel() ? (
          <Suspense fallback={<ProceduralGoldenCone />}>
            <GoldenConeModel />
          </Suspense>
        ) : (
          <ProceduralGoldenCone />
        )}
      </group>
      <mesh ref={halo} position={[0, 0.45, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.62, 0.035, 8, 36]} />
        <meshBasicMaterial color="#fde047" transparent opacity={0.7} depthWrite={false} />
      </mesh>
    </group>
  );
}

function GoldenPool({ count }: { count: number }) {
  const slots = useRef<(THREE.Group | null)[]>([]);
  usePoolSync(["golden"], slots);
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <GoldenSlot key={i} slotRef={(g) => (slots.current[i] = g)} />
      ))}
    </>
  );
}

function GantryVisual() {
  const banner = getBannerTexture();
  const half = ROAD_WIDTH / 2 + 0.4;
  return (
    <group>
      {[-half, half].map((x) => (
        <mesh key={x} position={[x, 0.95, 0]} castShadow>
          <cylinderGeometry args={[0.09, 0.11, 1.9, 8]} />
          <meshStandardMaterial color="#9ca3af" />
        </mesh>
      ))}
      <mesh position={[0, 1.5, 0]} castShadow>
        <boxGeometry args={[ROAD_WIDTH + 1.2, 0.78, 0.14]} />
        <meshStandardMaterial map={banner} />
      </mesh>
      <mesh position={[0, 1.94, 0]}>
        <boxGeometry args={[ROAD_WIDTH + 1.2, 0.1, 0.18]} />
        <meshStandardMaterial color="#f59e0b" emissive="#f59e0b" emissiveIntensity={0.4} />
      </mesh>
    </group>
  );
}

function GantryPool({ count }: { count: number }) {
  const slots = useRef<(THREE.Group | null)[]>([]);
  // Hide the banner once it passes the player — it would otherwise sweep
  // straight through the chase camera before despawning.
  usePoolSync(["gantry"], slots, (group, entity) => {
    group.visible = entity.z < 3.2;
  });
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <group key={i} ref={(g) => (slots.current[i] = g)} visible={false}>
          <GantryVisual />
        </group>
      ))}
    </>
  );
}

const TOKEN_COUNT = 48;

function TokenField() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const baseTilt = useMemo(() => new THREE.Euler(Math.PI / 2, 0, 0), []);

  useFrame(({ clock }) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const t = clock.getElapsedTime();
    let i = 0;
    for (const e of runtime.entities) {
      if (!e.active || e.kind !== "token") continue;
      if (i >= TOKEN_COUNT) break;
      dummy.position.set(e.x, e.y + 0.8 + Math.sin(t * 3 + e.id) * 0.08, e.z);
      dummy.rotation.set(baseTilt.x, t * 2.4 + e.id * 0.7, 0, "YXZ");
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      i += 1;
    }
    for (; i < TOKEN_COUNT; i++) {
      dummy.position.set(0, -50, 0);
      dummy.scale.setScalar(0.001);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, TOKEN_COUNT]} frustumCulled={false}>
      <cylinderGeometry args={[0.4, 0.4, 0.1, 20]} />
      <meshStandardMaterial
        color="#fbbf24"
        metalness={0.85}
        roughness={0.25}
        emissive="#b45309"
        emissiveIntensity={0.5}
      />
    </instancedMesh>
  );
}

const POWER_COLORS: Record<string, string> = {
  p_footpath: "#34d399",
  p_cycle: "#38bdf8",
  p_jacket: "#fbbf24",
};

function PowerUpSlot({ slotRef }: { slotRef: (g: THREE.Group | null) => void }) {
  const orbMat = useRef<THREE.MeshStandardMaterial>(null);
  const ringMat = useRef<THREE.MeshBasicMaterial>(null);
  const inner = useRef<THREE.Group>(null);
  const groupRef = useRef<THREE.Group | null>(null);

  useFrame(({ clock }) => {
    const group = groupRef.current;
    if (!group || !group.visible) return;
    const id = group.userData.entityId as number | undefined;
    const entity = runtime.entities.find((e) => e.id === id);
    const color = entity ? POWER_COLORS[entity.kind] ?? "#ffffff" : "#ffffff";
    if (orbMat.current) {
      orbMat.current.color.set(color);
      orbMat.current.emissive.set(color);
    }
    if (ringMat.current) ringMat.current.color.set(color);
    if (inner.current) {
      const t = clock.getElapsedTime();
      inner.current.rotation.y = t * 2;
      inner.current.position.y = Math.sin(t * 3) * 0.12;
    }
  });

  return (
    <group
      ref={(g) => {
        groupRef.current = g;
        slotRef(g);
      }}
      visible={false}
    >
      <group ref={inner}>
        <mesh castShadow>
          <icosahedronGeometry args={[0.42, 1]} />
          <meshStandardMaterial ref={orbMat} emissiveIntensity={0.7} metalness={0.3} roughness={0.3} />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.68, 0.045, 10, 40]} />
          <meshBasicMaterial ref={ringMat} transparent opacity={0.85} />
        </mesh>
      </group>
    </group>
  );
}

function PowerUpPool({ count }: { count: number }) {
  const slots = useRef<(THREE.Group | null)[]>([]);
  usePoolSync(["p_footpath", "p_cycle", "p_jacket"], slots);
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <PowerUpSlot key={i} slotRef={(g) => (slots.current[i] = g)} />
      ))}
    </>
  );
}

/**
 * Phone trap: a ringing smartphone hovering at grab height. Cyan glow, pulse
 * rings and a wiggle sell the temptation — grabbing it costs points and
 * blurs the screen, so kids learn to leave it alone.
 */
function PhoneSlot({ slotRef }: { slotRef: (g: THREE.Group | null) => void }) {
  const inner = useRef<THREE.Group>(null);
  const ringA = useRef<THREE.Mesh>(null);
  const ringB = useRef<THREE.Mesh>(null);
  const groupRef = useRef<THREE.Group | null>(null);

  useFrame(({ clock }) => {
    const group = groupRef.current;
    if (!group || !group.visible) return;
    const t = clock.getElapsedTime();
    if (inner.current) {
      inner.current.position.y = 1.05 + Math.sin(t * 3.4) * 0.1;
      // Ringing wiggle — the phone shivers side to side.
      inner.current.rotation.z = Math.sin(t * 26) * 0.09;
      inner.current.rotation.y = t * 1.6;
    }
    const pulse = (t * 1.4) % 1;
    if (ringA.current) {
      ringA.current.scale.setScalar(0.6 + pulse * 1.1);
      (ringA.current.material as THREE.MeshBasicMaterial).opacity = 0.65 * (1 - pulse);
    }
    if (ringB.current) {
      const p2 = (pulse + 0.5) % 1;
      ringB.current.scale.setScalar(0.6 + p2 * 1.1);
      (ringB.current.material as THREE.MeshBasicMaterial).opacity = 0.65 * (1 - p2);
    }
  });

  return (
    <group
      ref={(g) => {
        groupRef.current = g;
        slotRef(g);
      }}
      visible={false}
    >
      <group ref={inner} position={[0, 1.05, 0]}>
        <mesh castShadow>
          <boxGeometry args={[0.36, 0.66, 0.07]} />
          <meshStandardMaterial color="#0f172a" metalness={0.5} roughness={0.35} />
        </mesh>
        <mesh position={[0, 0, 0.041]}>
          <planeGeometry args={[0.3, 0.56]} />
          <meshStandardMaterial color="#67e8f9" emissive="#22d3ee" emissiveIntensity={1.6} />
        </mesh>
      </group>
      {[ringA, ringB].map((ref, i) => (
        <mesh key={i} ref={ref} position={[0, 1.05, 0]}>
          <torusGeometry args={[0.55, 0.03, 8, 32]} />
          <meshBasicMaterial color="#22d3ee" transparent opacity={0.6} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

function PhonePool({ count }: { count: number }) {
  const slots = useRef<(THREE.Group | null)[]>([]);
  usePoolSync(["phone"], slots);
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <PhoneSlot key={i} slotRef={(g) => (slots.current[i] = g)} />
      ))}
    </>
  );
}

/**
 * Collectible road-sign sticker: a mini sign on a short pole with a teal
 * halo. The face texture swaps to whichever sign the entity carries.
 */
function SignPickupSlot({ slotRef }: { slotRef: (g: THREE.Group | null) => void }) {
  const faceRef = useRef<THREE.Mesh>(null);
  const halo = useRef<THREE.Mesh>(null);
  const inner = useRef<THREE.Group>(null);
  const groupRef = useRef<THREE.Group | null>(null);

  useFrame(({ clock }) => {
    const group = groupRef.current;
    if (!group || !group.visible) return;
    const t = clock.getElapsedTime();
    if (inner.current) {
      inner.current.rotation.y = Math.sin(t * 1.8) * 0.35;
      inner.current.position.y = Math.sin(t * 2.6) * 0.06;
    }
    if (halo.current) {
      halo.current.rotation.z = t * 2;
      (halo.current.material as THREE.MeshBasicMaterial).opacity = 0.5 + Math.sin(t * 5) * 0.2;
    }
    // Swap the sign face when this slot is recycled onto a new entity.
    const id = group.userData.entityId as number | undefined;
    if (id !== undefined && faceRef.current) {
      const entity = runtime.entities.find((e) => e.id === id);
      if (entity && group.userData.signVariant !== entity.variant) {
        group.userData.signVariant = entity.variant;
        const mat = faceRef.current.material as THREE.MeshBasicMaterial;
        mat.map = getSignTexture(entity.variant);
        mat.needsUpdate = true;
      }
    }
  });

  return (
    <group
      ref={(g) => {
        groupRef.current = g;
        slotRef(g);
      }}
      visible={false}
    >
      <group ref={inner}>
        <mesh position={[0, 0.62, 0]} castShadow>
          <cylinderGeometry args={[0.035, 0.045, 1.24, 8]} />
          <meshStandardMaterial color="#9ca3af" metalness={0.6} roughness={0.4} />
        </mesh>
        <mesh position={[0, 1.42, -0.02]}>
          <planeGeometry args={[0.82, 0.82]} />
          <meshBasicMaterial color="#4b5563" side={THREE.BackSide} />
        </mesh>
        <mesh ref={faceRef} position={[0, 1.42, 0]}>
          <planeGeometry args={[0.8, 0.8]} />
          <meshBasicMaterial map={getSignTexture(0)} transparent alphaTest={0.15} />
        </mesh>
        <mesh ref={halo} position={[0, 1.42, 0.05]}>
          <torusGeometry args={[0.58, 0.028, 8, 36]} />
          <meshBasicMaterial color="#5eead4" transparent opacity={0.6} depthWrite={false} />
        </mesh>
      </group>
    </group>
  );
}

function SignPickupPool({ count }: { count: number }) {
  const slots = useRef<(THREE.Group | null)[]>([]);
  usePoolSync(["sign"], slots);
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <SignPickupSlot key={i} slotRef={(g) => (slots.current[i] = g)} />
      ))}
    </>
  );
}

function FxPool() {
  const slots = useRef<(THREE.Mesh | null)[]>([]);
  useFrame(() => {
    runtime.fx.forEach((fx, i) => {
      const mesh = slots.current[i];
      if (!mesh) return;
      if (!fx.active) {
        mesh.visible = false;
        return;
      }
      mesh.visible = true;
      mesh.position.set(fx.x, fx.y, fx.z);
      const s = 0.3 + fx.t * 1.6;
      mesh.scale.setScalar(s);
      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.color.set(fx.color);
      mat.opacity = Math.max(0, 1 - fx.t);
    });
  });
  return (
    <>
      {runtime.fx.map((_, i) => (
        <mesh key={i} ref={(m) => (slots.current[i] = m)} visible={false} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.5, 0.68, 24]} />
          <meshBasicMaterial transparent opacity={1} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      ))}
    </>
  );
}

const CONFETTI_COUNT = 56;
const CONFETTI_COLORS = ["#fbbf24", "#34d399", "#38bdf8", "#f472b6", "#fb923c", "#a78bfa"];
const CONFETTI_LIFE = 1.5;

interface ConfettiSeed {
  vx: number;
  vy: number;
  vz: number;
  spin: number;
  phase: number;
}

/**
 * Milestone celebration: a burst of spinning confetti quads from the runner.
 * Fired whenever runtime.celebrationToken increments; one instanced mesh.
 */
function ConfettiBurst() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const lastToken = useRef(0);
  const startAt = useRef(-100);
  const origin = useRef(new THREE.Vector3());
  const seeds = useMemo<ConfettiSeed[]>(
    () =>
      Array.from({ length: CONFETTI_COUNT }, () => {
        const a = Math.random() * Math.PI * 2;
        const r = 1.6 + Math.random() * 3.4;
        return {
          vx: Math.cos(a) * r,
          vy: 4.5 + Math.random() * 4,
          vz: Math.sin(a) * r - 1.5,
          spin: (Math.random() - 0.5) * 14,
          phase: Math.random() * Math.PI * 2,
        };
      }),
    [],
  );

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const color = new THREE.Color();
    for (let i = 0; i < CONFETTI_COUNT; i++) {
      mesh.setColorAt(i, color.set(CONFETTI_COLORS[i % CONFETTI_COLORS.length]));
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, []);

  useFrame(({ clock }) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    if (runtime.celebrationToken !== lastToken.current) {
      lastToken.current = runtime.celebrationToken;
      startAt.current = clock.getElapsedTime();
      origin.current.set(runtime.player.x, runtime.player.y + 1.3, 0);
    }
    const age = clock.getElapsedTime() - startAt.current;
    if (age > CONFETTI_LIFE) {
      mesh.visible = false;
      return;
    }
    mesh.visible = true;
    const fade = 1 - age / CONFETTI_LIFE;
    for (let i = 0; i < CONFETTI_COUNT; i++) {
      const s = seeds[i];
      dummy.position.set(
        origin.current.x + s.vx * age,
        origin.current.y + s.vy * age - 5.5 * age * age,
        origin.current.z + s.vz * age,
      );
      dummy.rotation.set(s.spin * age + s.phase, s.spin * 0.7 * age, s.phase);
      dummy.scale.setScalar(Math.max(0.001, fade));
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, CONFETTI_COUNT]} visible={false} frustumCulled={false}>
      <planeGeometry args={[0.14, 0.22]} />
      <meshBasicMaterial side={THREE.DoubleSide} depthWrite={false} />
    </instancedMesh>
  );
}

/** All pooled dynamic world objects: traffic, obstacles, tokens, power-ups, FX. */
export function EntityPools() {
  return (
    <>
      <VehiclePool kind="auto" count={5} />
      <VehiclePool kind="car" count={5} />
      <VehiclePool kind="bus" count={3} />
      <VehiclePool kind="moto" count={4} />
      <OncomingTraffic />
      <ConePool count={8} />
      <GantryPool count={4} />
      <TokenField />
      <GoldenPool count={3} />
      <PowerUpPool count={3} />
      <PhonePool count={2} />
      <SignPickupPool count={2} />
      <FxPool />
      <ConfettiBurst />
    </>
  );
}
