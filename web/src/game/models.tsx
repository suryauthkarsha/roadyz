import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { useAnimations, useGLTF } from "@react-three/drei";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import {
  analyzeHandlebarZ,
  analyzePoleModel,
  computeLongAxisNormalization,
  computeModelNormalization,
  computeNormalizedBounds,
  GeneratedModelAxis,
} from "./modelUtils";
import { getWheelBlurTexture } from "./textures";
import { runtime, PlayerAnim } from "./runtime";
import { MAX_SPEED } from "./constants";

const BASE = "https://r2-pub.rork.com/generated-3d-models/f882lg7uvkodz5desf4rl";

export const PLAYER_RIGGED_URL = `${BASE}/f0df3d85-fd2a-4920-a48d-d367087fbc21-rigged.glb`;
const ANIM_URLS = {
  idle: `${BASE}/f0df3d85-fd2a-4920-a48d-d367087fbc21-anim-idle.glb`,
  run: `${BASE}/f0df3d85-fd2a-4920-a48d-d367087fbc21-anim-runfast.glb`,
  jump: `${BASE}/f0df3d85-fd2a-4920-a48d-d367087fbc21-anim-jump-run.glb`,
  crash: `${BASE}/f0df3d85-fd2a-4920-a48d-d367087fbc21-anim-knock-down.glb`,
  victory: `${BASE}/f0df3d85-fd2a-4920-a48d-d367087fbc21-anim-victory.glb`,
} as const;

export type VehicleKind = "auto" | "bus" | "car" | "moto";

interface VehicleEntry {
  url: string;
  length: number;
  front: GeneratedModelAxis;
  up: GeneratedModelAxis;
}

/** Travel length (metres along the road) each vehicle is normalized to. */
export const VEHICLE_CONFIG: Record<VehicleKind, VehicleEntry> = {
  auto: { url: `${BASE}/6fdee39f-a2be-480f-b506-6d53fa34d199.glb`, length: 2.8, front: "negativeX", up: "positiveY" },
  bus: { url: `${BASE}/00f5396a-00db-4cc3-92fe-5f3f0af9cf59.glb`, length: 9.2, front: "negativeX", up: "positiveY" },
  car: { url: `${BASE}/852bb52e-f4c2-4aa1-85f4-c58887576e22.glb`, length: 4.0, front: "negativeX", up: "positiveY" },
  moto: { url: `${BASE}/23e04308-1c54-4671-b7d1-609281127944.glb`, length: 2.3, front: "positiveZ", up: "positiveY" },
};

/**
 * Cycle Sprint rider: the same kid in a helmet on a bicycle (single generated
 * model). URL + orientation metadata are filled in once generation completes;
 * an empty URL keeps the runner visible during the power-up instead.
 */
export const CYCLE_RIDER: { url: string; height: number; front: GeneratedModelAxis; up: GeneratedModelAxis } = {
  url: `${BASE}/d087b616-6f29-4c19-9663-e59e37506948.glb`,
  height: 1.62,
  front: "positiveZ",
  up: "positiveY",
};

export const hasCycleModel = (): boolean => CYCLE_RIDER.url.length > 0;

/**
 * Rider-less kids bicycle for the composed Cycle Sprint rig (the rigged kid
 * pedals on top of it procedurally). Generation reported no intrinsic front
 * axis, so facing is resolved from the mesh: long-axis normalization plus a
 * measured handlebar end (widest upper-band point) decides the 180° flip.
 */
export const BICYCLE_MODEL: { url: string; length: number } = {
  url: `${BASE}/78e599f3-30c2-4a4b-a9bd-92bf18f9a0fd.glb`,
  length: 1.62,
};

export const hasBicycleModel = (): boolean => BICYCLE_MODEL.url.length > 0;

/**
 * Generated realistic traffic cone (cloned 4× per slalom row + gold-skinned
 * for the Golden Cone collectible). Directionless per orientation metadata
 * (hasIntrinsicFront=false), so the identity forward applies no yaw.
 */
export const CONE_MODEL: { url: string; height: number; front: GeneratedModelAxis; up: GeneratedModelAxis } = {
  url: `${BASE}/ff1792fb-43e4-4ae5-8fee-75cf52759c8c.glb`,
  height: 0.74,
  front: "positiveZ",
  up: "positiveY",
};

export const hasConeModel = (): boolean => CONE_MODEL.url.length > 0;

/** Generated median garden strip (grass + bougainvillea) tiled along the divider. */
export const MEDIAN_GARDEN: { url: string; length: number } = {
  url: `${BASE}/b8fc0554-9c8f-47a8-b660-8869f92dbf0a.glb`,
  length: 6.6,
};

export const hasMedianGardenModel = (): boolean => MEDIAN_GARDEN.url.length > 0;

/** Generated 3-car Indian metro trainset running on the elevated viaduct. */
export const METRO_TRAIN: { url: string; length: number; front: GeneratedModelAxis; up: GeneratedModelAxis } = {
  url: "",
  length: 20,
  front: "positiveZ",
  up: "positiveY",
};

export const hasMetroTrainModel = (): boolean => METRO_TRAIN.url.length > 0;

/**
 * Generated street light (single curved arm + LED head). The model is
 * classified directionless (hasIntrinsicFront=false), so no authored yaw is
 * trusted — the arm direction is measured from the mesh instead.
 */
export const STREET_LIGHT: { url: string; front: GeneratedModelAxis; up: GeneratedModelAxis } = {
  url: `${BASE}/2a4629ec-6547-4acd-bdbd-91ca40027e86.glb`,
  front: "positiveZ",
  up: "positiveY",
};

export const hasStreetLightModel = (): boolean => STREET_LIGHT.url.length > 0;

/**
 * Generated roadside hoarding structure with a blank display board; safety
 * slogan posters are overlaid on the board at runtime. Orientation metadata:
 * hasIntrinsicFront=true, front=positiveZ, up=positiveY (signage).
 */
export const BILLBOARD_MODEL: { url: string; front: GeneratedModelAxis; up: GeneratedModelAxis } = {
  url: `${BASE}/dd8f3b84-3813-4305-8396-6526b0e48ff0.glb`,
  front: "positiveZ",
  up: "positiveY",
};

export const hasBillboardModel = (): boolean => BILLBOARD_MODEL.url.length > 0;

/**
 * Distant skyline towers replacing the old procedural window-boxes. Low-poly
 * generated models cloned along both sides of the corridor; empty URL keeps
 * the lit-window box fallback until generation completes.
 */
export type SkylineKind = "towerGlass" | "towerHome";

export const SKYLINE_CONFIG: Record<
  SkylineKind,
  { url: string; front: GeneratedModelAxis; up: GeneratedModelAxis }
> = {
  towerGlass: { url: "", front: "positiveZ", up: "positiveY" },
  towerHome: { url: "", front: "positiveZ", up: "positiveY" },
};

export const hasSkylineModel = (kind: SkylineKind): boolean => SKYLINE_CONFIG[kind].url.length > 0;

/**
 * Walking/standing pedestrian NPCs (rigged GLB + animation clip GLBs).
 * URLs are wired once the humanoid generations complete; empty rigged URL
 * simply renders no NPCs (never blocky stand-ins).
 */
export type NpcKind = "man" | "woman";

export interface NpcEntry {
  rigged: string;
  walk: string;
  idle: string;
  height: number;
  front: GeneratedModelAxis;
  up: GeneratedModelAxis;
}

export const NPC_CONFIG: Record<NpcKind, NpcEntry> = {
  man: { rigged: "", walk: "", idle: "", height: 1.74, front: "positiveZ", up: "positiveY" },
  woman: { rigged: "", walk: "", idle: "", height: 1.62, front: "positiveZ", up: "positiveY" },
};

export const hasNpcModel = (kind: NpcKind): boolean => NPC_CONFIG[kind].rigged.length > 0;

/**
 * Footpath vendor stalls (generated): flower vendor + veg vendor ground
 * spreads and a snack push cart. Empty URL keeps the procedural fallback
 * stall visible until the GLB streams in.
 */
export type StallKind = "flower" | "veg" | "cart";

interface StallEntry {
  url: string;
  height: number;
  front: GeneratedModelAxis;
  up: GeneratedModelAxis;
  /** True when generation reported no intrinsic front — place with identity yaw. */
  directionless?: boolean;
}

export const STALL_CONFIG: Record<StallKind, StallEntry> = {
  flower: {
    url: `${BASE}/6cb424d2-821b-476f-86fb-16f893cfed81.glb`,
    height: 1.05,
    front: "positiveZ",
    up: "positiveY",
  },
  veg: {
    url: `${BASE}/b7be3a89-122c-4569-af8e-20f9dfa5f885.glb`,
    height: 1.15,
    front: "positiveZ",
    up: "positiveY",
  },
  cart: {
    url: `${BASE}/197ea365-3535-4f42-bf8c-4273484248e3.glb`,
    height: 2.25,
    front: "positiveZ",
    up: "positiveY",
    directionless: true,
  },
};

export const hasStallModel = (kind: StallKind): boolean => STALL_CONFIG[kind].url.length > 0;

/**
 * Generated Indian concrete electric utility pole (cross-arms, insulators,
 * transformer). One per segment along the right footpath; the catenary wires
 * spanning pole to pole are procedural (they must tile the segment length
 * exactly, which a baked mesh cannot guarantee).
 */
export const ELECTRIC_POLE: { url: string; front: GeneratedModelAxis; up: GeneratedModelAxis } = {
  url: `${BASE}/4ac4fa43-ce50-42cc-b8d5-f4ac225871b0.glb`,
  front: "positiveZ",
  up: "positiveY",
};

export const hasElectricPoleModel = (): boolean => ELECTRIC_POLE.url.length > 0;

export type SceneryKind =
  | "rainTree"
  | "gulmohar"
  | "palm"
  | "apartment"
  | "shops"
  | "office"
  | "heritage"
  | "resiTower"
  | "itTower"
  | "mall";

interface SceneryEntry {
  /** GLB URL once generated; null keeps the procedural fallback. */
  url: string | null;
  height: number;
  front: GeneratedModelAxis;
  up: GeneratedModelAxis;
}

/** Generated scenery (trees + buildings) with persisted orientation metadata. */
export const SCENERY_CONFIG: Record<SceneryKind, SceneryEntry> = {
  rainTree: { url: `${BASE}/06db1c08-15f8-43c9-84f9-be0ae1f98f37.glb`, height: 7.2, front: "positiveZ", up: "positiveY" },
  gulmohar: { url: `${BASE}/131ddba0-76a6-44c7-999d-085f3cb0879e.glb`, height: 6.2, front: "positiveZ", up: "positiveY" },
  palm: { url: `${BASE}/2edbd0a9-587e-49ea-9923-99b138ee05a4.glb`, height: 8.0, front: "positiveZ", up: "positiveY" },
  apartment: { url: `${BASE}/8df7ab2d-5d5d-4ab9-aed0-eff55ace4c61.glb`, height: 16, front: "positiveZ", up: "positiveY" },
  shops: { url: `${BASE}/fd3d98dc-6f6f-42bd-b6ed-fadece57a88a.glb`, height: 10, front: "positiveZ", up: "positiveY" },
  office: { url: `${BASE}/5b4993a9-dd5a-492e-94a9-a37027739c34.glb`, height: 26, front: "positiveZ", up: "positiveY" },
  heritage: { url: `${BASE}/872c4aee-5616-4fbc-acb2-ed7324d20a97.glb`, height: 12, front: "positiveZ", up: "positiveY" },
  resiTower: { url: `${BASE}/ffc46fd7-a124-4e11-9b8a-681a33a54fee.glb`, height: 21, front: "positiveZ", up: "positiveY" },
  itTower: { url: `${BASE}/b0fb7dc1-e701-46f6-8fac-32de5de43c85.glb`, height: 30, front: "positiveZ", up: "positiveY" },
  mall: { url: `${BASE}/63892e9f-ce41-43c1-abc8-63d77652aba6.glb`, height: 10.5, front: "positiveZ", up: "positiveY" },
};

export const hasSceneryModel = (kind: SceneryKind): boolean => SCENERY_CONFIG[kind].url.length > 0;

useGLTF.preload(PLAYER_RIGGED_URL);
Object.values(ANIM_URLS).forEach((url) => useGLTF.preload(url));
Object.values(VEHICLE_CONFIG).forEach((v) => useGLTF.preload(v.url));
Object.values(SCENERY_CONFIG).forEach((s) => {
  if (s.url) useGLTF.preload(s.url);
});
if (CYCLE_RIDER.url) useGLTF.preload(CYCLE_RIDER.url);
if (STREET_LIGHT.url) useGLTF.preload(STREET_LIGHT.url);
if (BILLBOARD_MODEL.url) useGLTF.preload(BILLBOARD_MODEL.url);
if (BICYCLE_MODEL.url) useGLTF.preload(BICYCLE_MODEL.url);
if (CONE_MODEL.url) useGLTF.preload(CONE_MODEL.url);
if (MEDIAN_GARDEN.url) useGLTF.preload(MEDIAN_GARDEN.url);
if (METRO_TRAIN.url) useGLTF.preload(METRO_TRAIN.url);
Object.values(SKYLINE_CONFIG).forEach((s) => {
  if (s.url) useGLTF.preload(s.url);
});
Object.values(NPC_CONFIG).forEach((n) => {
  if (n.rigged) useGLTF.preload(n.rigged);
  if (n.walk) useGLTF.preload(n.walk);
  if (n.idle) useGLTF.preload(n.idle);
});
Object.values(STALL_CONFIG).forEach((s) => {
  if (s.url) useGLTF.preload(s.url);
});
if (ELECTRIC_POLE.url) useGLTF.preload(ELECTRIC_POLE.url);

/** Vehicles travel the same direction as the runner: toward -Z. */
const VEHICLE_FORWARD: [number, number, number] = [0, 0, -1];

/**
 * Normalized generated vehicle (placement contract): scale to travel length,
 * orientation-corrected from persisted metadata, centered on X/Z and grounded
 * on Y. `forward` lets the oncoming carriageway face traffic toward +Z.
 */
export function VehicleModel({
  kind,
  forward = VEHICLE_FORWARD,
}: {
  kind: VehicleKind;
  forward?: [number, number, number];
}) {
  const { url, length, front, up } = VEHICLE_CONFIG[kind];
  const gltf = useGLTF(url);
  const scene = useMemo(() => {
    const clone = SkeletonUtils.clone(gltf.scene);
    clone.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (mesh.isMesh) mesh.castShadow = true;
    });
    return clone;
  }, [gltf.scene]);
  const [fx, fy, fz] = forward;
  const norm = useMemo(
    () =>
      computeModelNormalization({
        object: scene,
        localFrontAxis: front,
        localUpAxis: up,
        desiredWorldForward: new THREE.Vector3(fx, fy, fz),
        sizeMode: "frontLength",
        targetSize: length,
      }),
    [scene, length, front, up, fx, fy, fz],
  );
  return (
    <group position={norm.position} quaternion={norm.quaternion} scale={norm.scale}>
      <primitive object={scene} />
    </group>
  );
}

/**
 * Normalized generated scenery model (tree/building) scaled to a target
 * height, rotated so its front faces `forward`, grounded at the group origin.
 * Clones share geometry + materials with the loaded GLTF unless
 * `instanceMaterials` is set, which deep-clones materials so callers can
 * fade THIS copy alone (camera-occlusion ghosting).
 */
export function SceneryModel({
  url,
  height,
  front,
  up,
  forward,
  castShadow = true,
  instanceMaterials = false,
}: {
  url: string;
  height: number;
  front: GeneratedModelAxis;
  up: GeneratedModelAxis;
  forward: [number, number, number];
  castShadow?: boolean;
  instanceMaterials?: boolean;
}) {
  const gltf = useGLTF(url);
  const scene = useMemo(() => {
    const clone = gltf.scene.clone(true);
    clone.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = castShadow;
        mesh.receiveShadow = false;
        if (instanceMaterials) {
          mesh.material = Array.isArray(mesh.material)
            ? mesh.material.map((m) => m.clone())
            : mesh.material.clone();
        }
      }
    });
    return clone;
  }, [gltf.scene, castShadow, instanceMaterials]);
  const [fx, fy, fz] = forward;
  const norm = useMemo(
    () =>
      computeModelNormalization({
        object: scene,
        localFrontAxis: front,
        localUpAxis: up,
        desiredWorldForward: new THREE.Vector3(fx, fy, fz),
        sizeMode: "height",
        targetSize: height,
      }),
    [scene, height, front, up, fx, fy, fz],
  );
  return (
    <group position={norm.position} quaternion={norm.quaternion} scale={norm.scale}>
      <primitive object={scene} />
    </group>
  );
}

/**
 * Boy-on-bicycle visual for Cycle Sprint: normalized to rider height, facing
 * down the road, grounded at the group origin. Wheel-bob and lean are applied
 * by the rig on the runtime parent, never on this normalized transform.
 */
export function CycleRiderModel() {
  const gltf = useGLTF(CYCLE_RIDER.url);
  const scene = useMemo(() => {
    const clone = gltf.scene.clone(true);
    clone.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (mesh.isMesh) mesh.castShadow = true;
    });
    return clone;
  }, [gltf.scene]);
  const norm = useMemo(
    () =>
      computeModelNormalization({
        object: scene,
        localFrontAxis: CYCLE_RIDER.front,
        localUpAxis: CYCLE_RIDER.up,
        desiredWorldForward: new THREE.Vector3(0, 0, -1),
        sizeMode: "height",
        targetSize: CYCLE_RIDER.height,
      }),
    [scene],
  );
  return (
    <group position={norm.position} quaternion={norm.quaternion} scale={norm.scale}>
      <primitive object={scene} />
    </group>
  );
}

/**
 * Generated street light pole, normalized to `height`. The model has no
 * intrinsic front, so the arm direction and the pole axis are MEASURED from
 * the mesh (analyzePoleModel): the group origin is the pole base, and a yaw
 * rotation aims the measured arm along `forward`. An emissive head cap +
 * additive glow sprite ride the measured arm tip so the lamp genuinely
 * lights up at night (materials shared, driven per-frame by the Scene).
 */
export function StreetLightModel({
  height,
  forward,
  headMaterial,
  glowMaterial,
}: {
  height: number;
  forward: [number, number, number];
  headMaterial: THREE.MeshStandardMaterial;
  glowMaterial: THREE.SpriteMaterial;
}) {
  const gltf = useGLTF(STREET_LIGHT.url);
  const scene = useMemo(() => {
    const clone = gltf.scene.clone(true);
    clone.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (mesh.isMesh) mesh.castShadow = true;
    });
    return clone;
  }, [gltf.scene]);
  // Directionless model: normalize with an identity-forward correction only.
  const norm = useMemo(
    () =>
      computeModelNormalization({
        object: scene,
        localFrontAxis: STREET_LIGHT.front,
        localUpAxis: STREET_LIGHT.up,
        desiredWorldForward: new THREE.Vector3(0, 0, 1),
        sizeMode: "height",
        targetSize: height,
      }),
    [scene, height],
  );
  const analysis = useMemo(() => analyzePoleModel(scene, norm), [scene, norm]);
  const [fx, , fz] = forward;
  const yaw = useMemo(() => {
    const dir = new THREE.Vector3(analysis.tip.x - analysis.poleX, 0, analysis.tip.z - analysis.poleZ);
    const target = new THREE.Vector3(fx, 0, fz);
    if (!analysis.hasArm || dir.lengthSq() < 0.001 || target.lengthSq() < 0.001) {
      return new THREE.Quaternion();
    }
    return new THREE.Quaternion().setFromUnitVectors(dir.normalize(), target.normalize());
  }, [analysis, fx, fz]);
  // Arm tip in pole-anchored space (before yaw), pulled slightly inward.
  const head = useMemo<[number, number, number]>(
    () => [
      (analysis.tip.x - analysis.poleX) * 0.88,
      analysis.tip.y - 0.12,
      (analysis.tip.z - analysis.poleZ) * 0.88,
    ],
    [analysis],
  );
  return (
    <group quaternion={yaw}>
      <group position={[-analysis.poleX, 0, -analysis.poleZ]}>
        <group position={norm.position} quaternion={norm.quaternion} scale={norm.scale}>
          <primitive object={scene} />
        </group>
      </group>
      <mesh position={head} material={headMaterial}>
        <boxGeometry args={[0.42, 0.1, 0.26]} />
      </mesh>
      <sprite position={[head[0], head[1] - 0.12, head[2]]} scale={[2.6, 2.6, 1]} material={glowMaterial} />
    </group>
  );
}

/**
 * Generated Indian electric pole, normalized to `height` and anchored on its
 * measured pole axis (base-plate vertex average) so the trunk stands exactly
 * on the group origin. The measured arm/transformer side is yawed toward
 * `forward` — wires attach at fixed heights relative to the pole top.
 */
export function ElectricPoleModel({
  height,
  forward,
}: {
  height: number;
  forward: [number, number, number];
}) {
  const gltf = useGLTF(ELECTRIC_POLE.url);
  const scene = useMemo(() => {
    const clone = gltf.scene.clone(true);
    clone.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (mesh.isMesh) mesh.castShadow = true;
    });
    return clone;
  }, [gltf.scene]);
  const norm = useMemo(
    () =>
      computeModelNormalization({
        object: scene,
        localFrontAxis: ELECTRIC_POLE.front,
        localUpAxis: ELECTRIC_POLE.up,
        desiredWorldForward: new THREE.Vector3(0, 0, 1),
        sizeMode: "height",
        targetSize: height,
      }),
    [scene, height],
  );
  const analysis = useMemo(() => analyzePoleModel(scene, norm), [scene, norm]);
  const [fx, , fz] = forward;
  const yaw = useMemo(() => {
    const dir = new THREE.Vector3(analysis.tip.x - analysis.poleX, 0, analysis.tip.z - analysis.poleZ);
    const target = new THREE.Vector3(fx, 0, fz);
    if (!analysis.hasArm || dir.lengthSq() < 0.001 || target.lengthSq() < 0.001) {
      return new THREE.Quaternion();
    }
    return new THREE.Quaternion().setFromUnitVectors(dir.normalize(), target.normalize());
  }, [analysis, fx, fz]);
  return (
    <group quaternion={yaw}>
      <group position={[-analysis.poleX, 0, -analysis.poleZ]}>
        <group position={norm.position} quaternion={norm.quaternion} scale={norm.scale}>
          <primitive object={scene} />
        </group>
      </group>
    </group>
  );
}

/**
 * Generated hoarding structure with a runtime safety-slogan poster pasted
 * onto the measured front of its display board. Poster keeps the 2:1 canvas
 * aspect and never exceeds the board's real width.
 */
export function BillboardStructureModel({
  height,
  poster,
}: {
  height: number;
  poster: THREE.Texture;
}) {
  const gltf = useGLTF(BILLBOARD_MODEL.url);
  const scene = useMemo(() => {
    const clone = gltf.scene.clone(true);
    clone.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (mesh.isMesh) mesh.castShadow = true;
    });
    return clone;
  }, [gltf.scene]);
  const norm = useMemo(
    () =>
      computeModelNormalization({
        object: scene,
        localFrontAxis: BILLBOARD_MODEL.front,
        localUpAxis: BILLBOARD_MODEL.up,
        desiredWorldForward: new THREE.Vector3(0, 0, 1),
        sizeMode: "height",
        targetSize: height,
      }),
    [scene, height],
  );
  const poster3 = useMemo(() => {
    const bounds = computeNormalizedBounds(scene, norm);
    const width = bounds.max.x - bounds.min.x;
    const posterW = Math.min(height * 0.72, width * 0.9);
    const posterH = posterW / 2;
    const y = bounds.max.y - posterH / 2 - height * 0.07;
    return { posterW, posterH, y, z: bounds.max.z + 0.07 };
  }, [scene, norm, height]);
  return (
    <group>
      <group position={norm.position} quaternion={norm.quaternion} scale={norm.scale}>
        <primitive object={scene} />
      </group>
      <mesh position={[0, poster3.y, poster3.z]}>
        <planeGeometry args={[poster3.posterW, poster3.posterH]} />
        <meshBasicMaterial map={poster} />
      </mesh>
    </group>
  );
}

/* ---------- Wheel motion + cycle sprint rig ---------- */

/** Pedal/crank phase advanced per metre of travel — shared by legs + cranks. */
export const PEDAL_PHASE_PER_M = 0.55;

/**
 * Spinning spoke-blur discs for fast wheels. Rendered as radial-streak
 * textures rotating with run speed — reads as motion blur on cycle + moto
 * wheels without needing separable wheel meshes in the generated GLBs.
 */
export function WheelBlur({
  radius,
  positions,
  opacity = 0.85,
}: {
  radius: number;
  positions: [number, number, number][];
  opacity?: number;
}) {
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: getWheelBlurTexture(),
        transparent: true,
        opacity,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    [opacity],
  );
  useFrame((_, dt) => {
    const omega = ((6 + runtime.speed) / Math.max(0.12, radius)) * Math.min(dt, 0.05);
    for (const m of refs.current) {
      if (m) m.rotation.z -= omega;
    }
  });
  return (
    <>
      {positions.map((p, i) => (
        <group key={i} position={p} rotation={[0, Math.PI / 2, 0]}>
          <mesh ref={(m) => (refs.current[i] = m)} material={material}>
            <circleGeometry args={[radius, 24]} />
          </mesh>
        </group>
      ))}
    </>
  );
}

/**
 * Fully-animated motorcycle: the generated bike+rider GLB with spinning
 * spoke-blur discs anchored at the MEASURED wheel hubs (radius and axle
 * positions come from the normalized bounds, not guessed constants). Body
 * motion — lean, weave, suspension, throttle pitch — is applied by the pools
 * on the runtime parent, never on this normalized transform.
 */
export function MotorcycleRig({ forward = VEHICLE_FORWARD }: { forward?: [number, number, number] }) {
  const { url, length, front, up } = VEHICLE_CONFIG.moto;
  const gltf = useGLTF(url);
  const scene = useMemo(() => {
    const clone = SkeletonUtils.clone(gltf.scene);
    clone.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (mesh.isMesh) mesh.castShadow = true;
    });
    return clone;
  }, [gltf.scene]);
  const [fx, fy, fz] = forward;
  const norm = useMemo(
    () =>
      computeModelNormalization({
        object: scene,
        localFrontAxis: front,
        localUpAxis: up,
        desiredWorldForward: new THREE.Vector3(fx, fy, fz),
        sizeMode: "frontLength",
        targetSize: length,
      }),
    [scene, length, front, up, fx, fy, fz],
  );
  const wheels = useMemo(() => {
    const b = computeNormalizedBounds(scene, norm);
    const h = b.max.y;
    const halfLen = (b.max.z - b.min.z) / 2;
    const r = THREE.MathUtils.clamp(h * 0.21, 0.22, 0.34);
    const hubZ = Math.max(0.32, halfLen - r * 1.02);
    return { r, hubZ };
  }, [scene, norm]);
  return (
    <group>
      <group position={norm.position} quaternion={norm.quaternion} scale={norm.scale}>
        <primitive object={scene} />
      </group>
      <WheelBlur
        radius={wheels.r * 0.82}
        positions={[
          [0, wheels.r, -wheels.hubZ],
          [0, wheels.r, wheels.hubZ],
        ]}
        opacity={0.78}
      />
    </group>
  );
}

interface RiderBone {
  bone: THREE.Object3D;
  rest: THREE.Quaternion;
}

const normBoneName = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Finds the skeleton joints needed for the procedural pedaling pose. Matches
 * Mixamo-style names first (Meshy auto-rig), then looser keyword fallbacks.
 */
function collectRiderBones(root: THREE.Object3D): Map<string, RiderBone> {
  const bones: THREE.Bone[] = [];
  root.traverse((node) => {
    if ((node as THREE.Bone).isBone) bones.push(node as THREE.Bone);
  });
  const map = new Map<string, RiderBone>();
  const grab = (key: string, preds: ((n: string) => boolean)[]) => {
    for (const pred of preds) {
      const bone = bones.find((b) => pred(normBoneName(b.name)));
      if (bone) {
        map.set(key, { bone, rest: bone.quaternion.clone() });
        return;
      }
    }
  };
  grab("hips", [(n) => n.endsWith("hips"), (n) => n.includes("pelvis")]);
  grab("spine", [(n) => n.endsWith("spine"), (n) => n.includes("spine")]);
  grab("spine2", [(n) => n.endsWith("spine2"), (n) => n.endsWith("spine1"), (n) => n.includes("chest")]);
  grab("head", [(n) => n.endsWith("head")]);
  grab("lUpLeg", [(n) => n.endsWith("leftupleg"), (n) => n.includes("left") && (n.includes("upleg") || n.includes("thigh") || n.includes("upperleg"))]);
  grab("rUpLeg", [(n) => n.endsWith("rightupleg"), (n) => n.includes("right") && (n.includes("upleg") || n.includes("thigh") || n.includes("upperleg"))]);
  grab("lLeg", [(n) => n.endsWith("leftleg"), (n) => n.includes("left") && !n.includes("upleg") && !n.includes("upperleg") && (n.includes("shin") || n.includes("calf") || n.includes("lowerleg") || n.endsWith("leg"))]);
  grab("rLeg", [(n) => n.endsWith("rightleg"), (n) => n.includes("right") && !n.includes("upleg") && !n.includes("upperleg") && (n.includes("shin") || n.includes("calf") || n.includes("lowerleg") || n.endsWith("leg"))]);
  grab("lFoot", [(n) => n.endsWith("leftfoot"), (n) => n.includes("left") && n.includes("foot")]);
  grab("rFoot", [(n) => n.endsWith("rightfoot"), (n) => n.includes("right") && n.includes("foot")]);
  grab("lArm", [(n) => n.endsWith("leftarm"), (n) => n.includes("left") && !n.includes("forearm") && !n.includes("lowerarm") && (n.includes("upperarm") || n.endsWith("arm"))]);
  grab("rArm", [(n) => n.endsWith("rightarm"), (n) => n.includes("right") && !n.includes("forearm") && !n.includes("lowerarm") && (n.includes("upperarm") || n.endsWith("arm"))]);
  grab("lForeArm", [(n) => n.endsWith("leftforearm"), (n) => n.includes("left") && (n.includes("forearm") || n.includes("lowerarm") || n.includes("elbow"))]);
  grab("rForeArm", [(n) => n.endsWith("rightforearm"), (n) => n.includes("right") && (n.includes("forearm") || n.includes("lowerarm") || n.includes("elbow"))]);
  return map;
}

const AXIS_X = new THREE.Vector3(1, 0, 0);
const AXIS_Y = new THREE.Vector3(0, 1, 0);
const AXIS_Z = new THREE.Vector3(0, 0, 1);
const poseParentQ = new THREE.Quaternion();
const poseAxis = new THREE.Vector3();
const poseRot = new THREE.Quaternion();

/**
 * Rebuilds a bone's local rotation as rest + a stack of WORLD-axis rotations
 * (converted through the parent's current world orientation), so the pose
 * math stays independent of the rig's authored local bone axes.
 */
function poseBone(entry: RiderBone | undefined, rotations: [THREE.Vector3, number][]): void {
  if (!entry || !entry.bone.parent) return;
  entry.bone.parent.getWorldQuaternion(poseParentQ).invert();
  entry.bone.quaternion.copy(entry.rest);
  for (const [axis, angle] of rotations) {
    poseAxis.copy(axis).applyQuaternion(poseParentQ).normalize();
    poseRot.setFromAxisAngle(poseAxis, angle);
    entry.bone.quaternion.premultiply(poseRot);
  }
}

interface LegChain {
  hip: RiderBone;
  knee: RiderBone;
  foot: RiderBone;
  /** Hip joint position in kid-root space (hips bone is never translated). */
  hipPos: THREE.Vector3;
  /** Thigh (hip→knee) and shin (knee→ankle) lengths in kid-root space. */
  l1: number;
  l2: number;
}

/** Converts a rest-pose bone position into normalized kid-root space. */
function boneRootPosition(bone: THREE.Object3D, norm: ReturnType<typeof computeModelNormalization>): THREE.Vector3 {
  const v = new THREE.Vector3();
  bone.getWorldPosition(v);
  return v.multiplyScalar(norm.scale).applyQuaternion(norm.quaternion).add(norm.position);
}

function buildLegChain(
  bones: Map<string, RiderBone>,
  side: "l" | "r",
  norm: ReturnType<typeof computeModelNormalization>,
): LegChain | null {
  const hip = bones.get(`${side}UpLeg`);
  const knee = bones.get(`${side}Leg`);
  const foot = bones.get(`${side}Foot`);
  if (!hip || !knee || !foot) return null;
  const hipPos = boneRootPosition(hip.bone, norm);
  const kneePos = boneRootPosition(knee.bone, norm);
  const footPos = boneRootPosition(foot.bone, norm);
  const l1 = hipPos.distanceTo(kneePos);
  const l2 = kneePos.distanceTo(footPos);
  if (l1 < 0.05 || l2 < 0.05) return null;
  return { hip, knee, foot, hipPos, l1, l2 };
}

interface LegSolve {
  t1: number;
  t2: number;
}

/**
 * 2-bone IK in the sagittal (Y/Z) plane: returns the thigh and shin WORLD
 * pitch angles (0 = straight down, positive = swung toward the travel
 * direction -Z) that put the ankle on the pedal target.
 */
function solveLeg(chain: LegChain, targetY: number, targetZ: number, out: LegSolve): void {
  const dy = targetY - chain.hipPos.y;
  const dz = targetZ - chain.hipPos.z;
  let d = Math.hypot(dy, dz);
  d = THREE.MathUtils.clamp(d, Math.abs(chain.l1 - chain.l2) + 0.02, chain.l1 + chain.l2 - 0.015);
  const phiD = Math.atan2(-dz, -dy);
  const cosA = THREE.MathUtils.clamp(
    (chain.l1 * chain.l1 + d * d - chain.l2 * chain.l2) / (2 * chain.l1 * d),
    -1,
    1,
  );
  const t1 = phiD + Math.acos(cosA);
  const kneeY = chain.hipPos.y - chain.l1 * Math.cos(t1);
  const kneeZ = chain.hipPos.z - chain.l1 * Math.sin(t1);
  out.t1 = t1;
  out.t2 = Math.atan2(-(targetZ - kneeZ), -(targetY - kneeY));
}

/**
 * The runner kid, seated and GENUINELY pedaling: each ankle is placed on the
 * rotating pedal with 2-bone IK (thigh + shin world pitch solved per frame),
 * so the knees pump exactly with the crank circle. The pelvis rocks with the
 * strokes, the torso leans to the handlebar with a cadence sway, arms make
 * micro steering corrections, and a bright safety helmet tracks the head
 * bone. No animation clips involved — pure procedural skeleton pose.
 */
export function CyclingKid({
  saddleY,
  saddleZ,
  crankY,
  crankZ,
  crankR,
}: {
  saddleY: number;
  saddleZ: number;
  crankY: number;
  crankZ: number;
  crankR: number;
}) {
  const base = useGLTF(PLAYER_RIGGED_URL);
  const scene = useMemo(() => {
    const clone = SkeletonUtils.clone(base.scene);
    clone.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (mesh.isMesh) mesh.castShadow = true;
    });
    return clone;
  }, [base.scene]);

  const norm = useMemo(
    () =>
      computeModelNormalization({
        object: scene,
        localFrontAxis: "positiveZ",
        localUpAxis: "positiveY",
        desiredWorldForward: new THREE.Vector3(0, 0, -1),
        sizeMode: "height",
        targetSize: 1.5,
      }),
    [scene],
  );

  const bones = useMemo(() => collectRiderBones(scene), [scene]);

  /** Rest-pose skeleton measurements in kid-root space (legs + hip anchor). */
  const anatomy = useMemo(() => {
    scene.updateMatrixWorld(true);
    const hips = bones.get("hips");
    const hipY = hips ? boneRootPosition(hips.bone, norm).y : 0.74;
    return {
      hipY,
      left: buildLegChain(bones, "l", norm),
      right: buildLegChain(bones, "r", norm),
    };
  }, [bones, scene, norm]);

  /** Kid-root Y offset within the rig — needed to express crank targets locally. */
  const rootY = saddleY - anatomy.hipY + 0.02;

  const rootRef = useRef<THREE.Group>(null);
  const helmetRef = useRef<THREE.Group>(null);
  const headWorld = useRef(new THREE.Vector3());
  const solve = useRef<LegSolve>({ t1: 0, t2: 0 });

  useFrame(() => {
    const phase = runtime.distance * PEDAL_PHASE_PER_M;
    const sinP = Math.sin(phase);

    // Pelvis rocks gently with the strokes; torso leans to the bar with a
    // cadence sway; head stays up watching the road.
    const rock = sinP * 0.05;
    poseBone(bones.get("hips"), [[AXIS_Z, rock]]);
    poseBone(bones.get("spine"), [[AXIS_X, -0.4], [AXIS_Z, -rock * 0.6]]);
    poseBone(bones.get("spine2"), [[AXIS_X, -0.15]]);
    poseBone(bones.get("head"), [[AXIS_X, 0.35], [AXIS_Z, -rock * 0.4]]);

    // Pedal targets in kid-root space (crank params arrive in rig space).
    const cy = crankY - rootY;
    const cz = crankZ - saddleZ;
    const pedalLY = cy + crankR * Math.sin(phase);
    const pedalLZ = cz + crankR * Math.cos(phase);
    const pedalRY = cy - crankR * Math.sin(phase);
    const pedalRZ = cz - crankR * Math.cos(phase);

    const left = anatomy.left;
    const right = anatomy.right;
    if (left && right) {
      const s = solve.current;
      solveLeg(left, pedalLY + 0.03, pedalLZ, s);
      poseBone(left.hip, [[AXIS_X, s.t1]]);
      poseBone(left.knee, [[AXIS_X, s.t2 - s.t1]]);
      poseBone(left.foot, [[AXIS_X, -s.t2 + 0.16 + 0.12 * Math.sin(phase - 0.9)]]);
      solveLeg(right, pedalRY + 0.03, pedalRZ, s);
      poseBone(right.hip, [[AXIS_X, s.t1]]);
      poseBone(right.knee, [[AXIS_X, s.t2 - s.t1]]);
      poseBone(right.foot, [[AXIS_X, -s.t2 + 0.16 - 0.12 * Math.sin(phase - 0.9)]]);
    } else {
      // Bone names unmatched — fall back to the sinusoidal approximation.
      poseBone(bones.get("lUpLeg"), [[AXIS_X, 1.02 + 0.4 * sinP]]);
      poseBone(bones.get("rUpLeg"), [[AXIS_X, 1.02 - 0.4 * sinP]]);
      poseBone(bones.get("lLeg"), [[AXIS_X, -(0.72 + 0.18 * sinP)]]);
      poseBone(bones.get("rLeg"), [[AXIS_X, -(0.72 - 0.18 * sinP)]]);
      poseBone(bones.get("lFoot"), [[AXIS_X, -0.24 - 0.16 * sinP]]);
      poseBone(bones.get("rFoot"), [[AXIS_X, -0.24 + 0.16 * sinP]]);
    }

    // Arms: reach forward-down to the grips with micro steering corrections.
    const steer = Math.sin(phase * 0.5) * 0.05;
    poseBone(bones.get("lArm"), [[AXIS_Y, -1.02], [AXIS_X, -0.34 - steer]]);
    poseBone(bones.get("rArm"), [[AXIS_Y, 1.02], [AXIS_X, -0.34 + steer]]);
    poseBone(bones.get("lForeArm"), [[AXIS_Y, -0.28]]);
    poseBone(bones.get("rForeArm"), [[AXIS_Y, 0.28]]);

    // Helmet rides the head bone (kept upright — it's strapped on).
    const head = bones.get("head");
    const root = rootRef.current;
    const helmet = helmetRef.current;
    if (head && root && helmet) {
      head.bone.getWorldPosition(headWorld.current);
      root.worldToLocal(headWorld.current);
      helmet.position.set(headWorld.current.x, headWorld.current.y + 0.1, headWorld.current.z);
    }
  });

  return (
    <group ref={rootRef} position={[0, rootY, saddleZ]}>
      <group position={norm.position} quaternion={norm.quaternion} scale={norm.scale}>
        <primitive object={scene} />
      </group>
      <group ref={helmetRef}>
        <mesh castShadow>
          <sphereGeometry args={[0.145, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.58]} />
          <meshStandardMaterial color="#ef4444" roughness={0.32} />
        </mesh>
        <mesh position={[0, 0.028, -0.125]} rotation={[0.4, 0, 0]}>
          <boxGeometry args={[0.13, 0.024, 0.09]} />
          <meshStandardMaterial color="#f8fafc" roughness={0.4} />
        </mesh>
      </group>
    </group>
  );
}

/** Crank arms + pedals orbiting the bottom bracket, phase-locked to the legs. */
function CrankSet({ y, z, radius }: { y: number; z: number; radius: number }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    if (ref.current) ref.current.rotation.x = -runtime.distance * PEDAL_PHASE_PER_M;
  });
  return (
    <group position={[0, y, z]} ref={ref}>
      {[1, -1].map((side) => (
        <group key={side} rotation={[side === 1 ? 0 : Math.PI, 0, 0]}>
          <mesh position={[side * 0.055, 0, radius / 2]}>
            <boxGeometry args={[0.022, 0.022, radius + 0.02]} />
            <meshStandardMaterial color="#64748b" metalness={0.6} roughness={0.4} />
          </mesh>
          <mesh position={[side * 0.1, 0, radius]}>
            <boxGeometry args={[0.085, 0.022, 0.06]} />
            <meshStandardMaterial color="#1f2937" roughness={0.7} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/**
 * Full Cycle Sprint assembly: generated rider-less bicycle + pedaling kid +
 * spinning wheel blur + rotating cranks. The bike is directionless metadata-
 * wise, so its travel axis comes from the longest horizontal extent and the
 * FRONT end from the measured handlebar (widest upper-band point) — flipped
 * 180° when the bars land on the +Z half. Saddle/bottom-bracket anchors are
 * measured from the normalized bounds, not guessed constants.
 */
export function CycleSprintRig() {
  const gltf = useGLTF(BICYCLE_MODEL.url);
  const scene = useMemo(() => {
    const clone = gltf.scene.clone(true);
    clone.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (mesh.isMesh) mesh.castShadow = true;
    });
    return clone;
  }, [gltf.scene]);
  const norm = useMemo(() => {
    const base = computeLongAxisNormalization(scene, BICYCLE_MODEL.length);
    const handleZ = analyzeHandlebarZ(scene, base);
    return handleZ > 0.01 ? computeLongAxisNormalization(scene, BICYCLE_MODEL.length, true) : base;
  }, [scene]);
  const frame = useMemo(() => {
    const b = computeNormalizedBounds(scene, norm);
    const h = b.max.y;
    const len = b.max.z - b.min.z;
    const wheelR = h * 0.3;
    return {
      wheelR,
      wheelZ: len / 2 - wheelR,
      saddleY: h * 0.74,
      saddleZ: len * 0.19,
      bbY: Math.max(0.15, wheelR * 0.9),
      bbZ: len * 0.05,
      crankR: Math.min(0.16, Math.max(0.11, h * 0.17)),
    };
  }, [scene, norm]);
  return (
    <group>
      <group position={norm.position} quaternion={norm.quaternion} scale={norm.scale}>
        <primitive object={scene} />
      </group>
      <WheelBlur
        radius={frame.wheelR * 0.76}
        positions={[
          [0, frame.wheelR, -frame.wheelZ],
          [0, frame.wheelR, frame.wheelZ],
        ]}
      />
      <CrankSet y={frame.bbY} z={frame.bbZ} radius={frame.crankR} />
      <CyclingKid
        saddleY={frame.saddleY}
        saddleZ={frame.saddleZ}
        crankY={frame.bbY}
        crankZ={frame.bbZ}
        crankR={frame.crankR}
      />
    </group>
  );
}

/** Shared gold-plated material for the Golden Cone collectible. */
const goldenConeMaterial = new THREE.MeshStandardMaterial({
  color: "#fbbf24",
  metalness: 0.92,
  roughness: 0.22,
  emissive: "#b45309",
  emissiveIntensity: 0.55,
});

/**
 * Golden Cone collectible: the generated cone mesh re-skinned in polished
 * gold (all materials swapped for the shared golden material). Spin/bob is
 * applied by the pool on the runtime parent.
 */
export function GoldenConeModel() {
  const gltf = useGLTF(CONE_MODEL.url);
  const scene = useMemo(() => {
    const clone = gltf.scene.clone(true);
    clone.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.material = goldenConeMaterial;
      }
    });
    return clone;
  }, [gltf.scene]);
  const norm = useMemo(
    () =>
      computeModelNormalization({
        object: scene,
        localFrontAxis: CONE_MODEL.front,
        localUpAxis: CONE_MODEL.up,
        desiredWorldForward: new THREE.Vector3(0, 0, 1),
        sizeMode: "height",
        targetSize: 0.8,
      }),
    [scene],
  );
  return (
    <group position={norm.position} quaternion={norm.quaternion} scale={norm.scale}>
      <primitive object={scene} />
    </group>
  );
}

/** Normalized generated traffic cone, grounded at the group origin. */
export function ConeModel() {
  const gltf = useGLTF(CONE_MODEL.url);
  const scene = useMemo(() => {
    const clone = gltf.scene.clone(true);
    clone.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (mesh.isMesh) mesh.castShadow = true;
    });
    return clone;
  }, [gltf.scene]);
  const norm = useMemo(
    () =>
      computeModelNormalization({
        object: scene,
        localFrontAxis: CONE_MODEL.front,
        localUpAxis: CONE_MODEL.up,
        desiredWorldForward: new THREE.Vector3(0, 0, 1),
        sizeMode: "height",
        targetSize: CONE_MODEL.height,
      }),
    [scene],
  );
  return (
    <group position={norm.position} quaternion={norm.quaternion} scale={norm.scale}>
      <primitive object={scene} />
    </group>
  );
}

/**
 * Median garden strip normalized by its LONGEST horizontal axis (runs along
 * the road) and width-clamped so foliage never overhangs the carriageways.
 */
export function MedianGardenModel() {
  const gltf = useGLTF(MEDIAN_GARDEN.url);
  const scene = useMemo(() => {
    const clone = gltf.scene.clone(true);
    clone.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (mesh.isMesh) mesh.castShadow = true;
    });
    return clone;
  }, [gltf.scene]);
  const norm = useMemo(() => {
    const base = computeLongAxisNormalization(scene, MEDIAN_GARDEN.length);
    const bounds = computeNormalizedBounds(scene, base);
    const width = bounds.max.x - bounds.min.x;
    const clamp = width > 1.55 ? 1.55 / width : 1;
    return {
      scale: base.scale * clamp,
      quaternion: base.quaternion,
      position: base.position.clone().multiplyScalar(clamp),
    };
  }, [scene]);
  return (
    <group position={norm.position} quaternion={norm.quaternion} scale={norm.scale}>
      <primitive object={scene} />
    </group>
  );
}

/** Normalized generated metro trainset, nose facing its +Z travel direction. */
export function MetroTrainModel() {
  const gltf = useGLTF(METRO_TRAIN.url);
  const scene = useMemo(() => gltf.scene.clone(true), [gltf.scene]);
  const norm = useMemo(
    () =>
      computeModelNormalization({
        object: scene,
        localFrontAxis: METRO_TRAIN.front,
        localUpAxis: METRO_TRAIN.up,
        desiredWorldForward: new THREE.Vector3(0, 0, 1),
        sizeMode: "frontLength",
        targetSize: METRO_TRAIN.length,
      }),
    [scene],
  );
  return (
    <group position={norm.position} quaternion={norm.quaternion} scale={norm.scale}>
      <primitive object={scene} />
    </group>
  );
}

const CROSSFADE = 0.18;

/**
 * The animated kid runner: Rigged GLB visual with clips from the animation
 * GLBs played on one mixer. Follows runtime.player.anim via animToken polling.
 * Root-motion clips get their hips locked on X/Z so the character stays put.
 */
export function PlayerCharacter() {
  const base = useGLTF(PLAYER_RIGGED_URL);
  const idleGltf = useGLTF(ANIM_URLS.idle);
  const runGltf = useGLTF(ANIM_URLS.run);
  const jumpGltf = useGLTF(ANIM_URLS.jump);
  const crashGltf = useGLTF(ANIM_URLS.crash);

  const scene = useMemo(() => {
    const clone = SkeletonUtils.clone(base.scene);
    clone.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (mesh.isMesh) mesh.castShadow = true;
    });
    return clone;
  }, [base.scene]);

  const norm = useMemo(
    () =>
      computeModelNormalization({
        object: scene,
        localFrontAxis: "positiveZ",
        localUpAxis: "positiveY",
        desiredWorldForward: new THREE.Vector3(0, 0, -1),
        sizeMode: "height",
        targetSize: 1.55,
      }),
    [scene],
  );

  const clips = useMemo(() => {
    const named: { source: THREE.AnimationClip | undefined; name: PlayerAnim }[] = [
      { source: idleGltf.animations[0], name: "idle" },
      { source: runGltf.animations[0], name: "run" },
      { source: jumpGltf.animations[0], name: "jump" },
      { source: crashGltf.animations[0], name: "crash" },
    ];
    return named
      .filter((n) => n.source)
      .map((n) => {
        const clip = n.source!.clone();
        clip.name = n.name;
        return clip;
      });
  }, [idleGltf, runGltf, jumpGltf, crashGltf]);

  const { actions, mixer } = useAnimations(clips, scene);
  const currentAnim = useRef<PlayerAnim | null>(null);
  const lastToken = useRef(-1);
  const hipsRef = useRef<THREE.Object3D | null>(null);
  const hipsRest = useRef(new THREE.Vector3());

  useEffect(() => {
    let hips: THREE.Object3D | null = null;
    scene.traverse((node) => {
      if (hips) return;
      const bone = node as THREE.Bone;
      if (bone.isBone && /hips|pelvis|root/i.test(node.name)) hips = node;
    });
    if (!hips) {
      scene.traverse((node) => {
        if (!hips && (node as THREE.Bone).isBone) hips = node;
      });
    }
    hipsRef.current = hips;
    if (hips) hipsRest.current.copy((hips as THREE.Object3D).position);
  }, [scene]);

  useEffect(() => {
    const jump = actions.jump;
    const crash = actions.crash;
    if (jump) {
      jump.setLoop(THREE.LoopOnce, 1);
      jump.clampWhenFinished = true;
    }
    if (crash) {
      crash.setLoop(THREE.LoopOnce, 1);
      crash.clampWhenFinished = true;
    }
  }, [actions]);

  useFrame(() => {
    const target = runtime.phase === "menu" ? "idle" : runtime.player.anim;
    const token = runtime.player.animToken;
    if (token !== lastToken.current || currentAnim.current === null) {
      lastToken.current = token;
      const mapped: PlayerAnim = target === "slide" ? "run" : target;
      if (mapped !== currentAnim.current) {
        const next = actions[mapped];
        const prev = currentAnim.current ? actions[currentAnim.current] : null;
        if (next) {
          next.reset().fadeIn(CROSSFADE).play();
          if (prev && prev !== next) prev.fadeOut(CROSSFADE);
          currentAnim.current = mapped;
        }
      }
    }
    const runAction = actions.run;
    if (runAction && currentAnim.current === "run") {
      runAction.timeScale = 0.9 + (runtime.speed / MAX_SPEED) * 0.75;
    }
    const hips = hipsRef.current;
    if (hips) {
      hips.position.x = hipsRest.current.x;
      hips.position.z = hipsRest.current.z;
    }
    void mixer;
  });

  return (
    <group position={norm.position} quaternion={norm.quaternion} scale={norm.scale}>
      <primitive object={scene} />
    </group>
  );
}
