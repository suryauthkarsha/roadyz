import { Suspense, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { runtime } from "../runtime";
import {
  MEDIAN_W,
  MEDIAN_X,
  ONCOMING_ROAD_W,
  ONCOMING_ROAD_X,
  ROAD_WIDTH,
  SEGMENT_COUNT,
  SEGMENT_LENGTH,
} from "../constants";
import {
  applyGeneratedSurfaces,
  getArrowTexture,
  getBillboardTextures,
  getBusStopTexture,
  getDirectionSignTextures,
  getDrainTexture,
  getGlowTexture,
  getKerbStripeTexture,
  getOilTexture,
  getSkidTexture,
  getSlowTexture,
  getWindowTexture,
  getZebraTexture,
} from "../textures";
import {
  BillboardStructureModel,
  ElectricPoleModel,
  hasBillboardModel,
  hasElectricPoleModel,
  hasMedianGardenModel,
  hasMetroTrainModel,
  hasSkylineModel,
  hasStallModel,
  hasStreetLightModel,
  MedianGardenModel,
  MetroTrainModel,
  SceneryModel,
  SCENERY_CONFIG,
  SceneryKind,
  SKYLINE_CONFIG,
  SkylineKind,
  STALL_CONFIG,
  StallKind,
  StreetLightModel,
} from "../models";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

const TOTAL = SEGMENT_COUNT * SEGMENT_LENGTH;
const FRONT_MARGIN = 24;

const RIGHT_FOOTPATH_X = 7.65;
const RIGHT_FOOTPATH_W = 4.2;
const LEFT_FOOTPATH_X = -19.3;
const LEFT_FOOTPATH_W = 3.2;
const METRO_X = -19.3;

/** Electric pole line along the right footpath's outer edge. */
const POLE_X = 9.55;
/** One pole per segment at this local z — spacing is exactly SEGMENT_LENGTH. */
const POLE_Z = -11;
const POLE_H = 7.4;

/** Deterministic PRNG so recycled segments keep a stable look. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Shared night-driven emissive materials (updated once per frame in Scene). */
export const nightMaterials = {
  lampHead: new THREE.MeshStandardMaterial({ color: "#fef3c7", emissive: "#fbbf24", emissiveIntensity: 0 }),
  signalRed: new THREE.MeshStandardMaterial({ color: "#7f1d1d", emissive: "#ef4444", emissiveIntensity: 0.9 }),
  headlight: new THREE.MeshStandardMaterial({ color: "#fffbe8", emissive: "#ffedb3", emissiveIntensity: 0.4 }),
  taillight: new THREE.MeshStandardMaterial({ color: "#7f1d1d", emissive: "#f87171", emissiveIntensity: 0.5 }),
  /** Additive lamp halo sprite; opacity driven by night level each frame. */
  lampGlow: new THREE.SpriteMaterial({
    map: getGlowTexture(),
    color: "#ffd98a",
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }),
};

/** Shared static materials — one instance across every segment. */
const MAT = {
  asphalt: new THREE.MeshStandardMaterial({ color: "#2b2e33", roughness: 0.95 }),
  asphaltOld: new THREE.MeshStandardMaterial({ color: "#33363b", roughness: 0.97 }),
  curb: new THREE.MeshStandardMaterial({ color: "#c8c5bd", roughness: 0.9 }),
  paver: new THREE.MeshStandardMaterial({ color: "#99897a", roughness: 1 }),
  paverOld: new THREE.MeshStandardMaterial({ color: "#8d8478", roughness: 1 }),
  median: new THREE.MeshStandardMaterial({ color: "#b8b2a6", roughness: 0.95 }),
  hedge: new THREE.MeshStandardMaterial({ color: "#2f6b33", roughness: 1 }),
  pole: new THREE.MeshStandardMaterial({ color: "#475569", roughness: 0.7 }),
  steel: new THREE.MeshStandardMaterial({ color: "#9ca3af", metalness: 0.5, roughness: 0.5 }),
  white: new THREE.MeshBasicMaterial({ color: "#d6d3c8" }),
  yellow: new THREE.MeshBasicMaterial({ color: "#d9b13b" }),
  wood: new THREE.MeshStandardMaterial({ color: "#7c5230", roughness: 0.95 }),
  redCloth: new THREE.MeshStandardMaterial({ color: "#dc2626", roughness: 0.9, side: THREE.DoubleSide }),
  signalBox: new THREE.MeshStandardMaterial({ color: "#111827", roughness: 0.7 }),
  amberLight: new THREE.MeshStandardMaterial({ color: "#7c2d12", emissive: "#f59e0b", emissiveIntensity: 0.25 }),
  greenLight: new THREE.MeshStandardMaterial({ color: "#064e3b", emissive: "#22c55e", emissiveIntensity: 0.9 }),
  concrete: new THREE.MeshStandardMaterial({ color: "#a8a29e", roughness: 0.95 }),
  concreteLight: new THREE.MeshStandardMaterial({ color: "#b8b2ab", roughness: 0.95 }),
  darkSteel: new THREE.MeshStandardMaterial({ color: "#78716c", roughness: 0.8 }),
  bench: new THREE.MeshStandardMaterial({ color: "#334155", roughness: 0.8 }),
};

/** Road-surface detail materials (shared across all segments). */
const DETAIL_MAT = {
  manhole: new THREE.MeshStandardMaterial({ color: "#26282c", roughness: 0.8, metalness: 0.35 }),
  manholeRing: new THREE.MeshStandardMaterial({ color: "#17181b", roughness: 0.9 }),
  patch: new THREE.MeshBasicMaterial({ color: "#131417", transparent: true, opacity: 0.4, depthWrite: false }),
  wear: new THREE.MeshBasicMaterial({ color: "#0c0d0f", transparent: true, opacity: 0.14, depthWrite: false }),
  stud: new THREE.MeshStandardMaterial({
    color: "#d9dade",
    emissive: "#fef3c7",
    emissiveIntensity: 1.15,
    metalness: 0.45,
    roughness: 0.35,
  }),
};

/** Lazily-built decal materials (canvas textures need the DOM). */
let decalMats: {
  skid: THREE.MeshBasicMaterial;
  oil: THREE.MeshBasicMaterial;
  arrow: THREE.MeshBasicMaterial;
  slow: THREE.MeshBasicMaterial;
  drain: THREE.MeshBasicMaterial;
} | null = null;

function getDecalMats() {
  if (decalMats) return decalMats;
  const make = (map: THREE.Texture, opacity: number) =>
    new THREE.MeshBasicMaterial({ map, transparent: true, opacity, depthWrite: false });
  decalMats = {
    skid: make(getSkidTexture(), 0.85),
    oil: make(getOilTexture(), 0.9),
    arrow: make(getArrowTexture(), 0.92),
    slow: make(getSlowTexture(), 0.92),
    drain: make(getDrainTexture(), 1),
  };
  return decalMats;
}

/** Median kerb materials: striped black/yellow sides, concrete top. */
let medianMats: THREE.Material[] | null = null;

function getMedianMaterials(): THREE.Material[] {
  if (medianMats) return medianMats;
  const stripes = getKerbStripeTexture().clone();
  stripes.wrapS = THREE.RepeatWrapping;
  stripes.repeat.set(SEGMENT_LENGTH / 4.8, 1);
  stripes.needsUpdate = true;
  const stripeMat = new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.85 });
  const topMat = new THREE.MeshStandardMaterial({ color: "#b0aa9e", roughness: 0.95 });
  // Box face order: +x, -x, +y, -y, +z, -z
  medianMats = [stripeMat, stripeMat, topMat, topMat, stripeMat, stripeMat];
  return medianMats;
}

const SKYLINE_COLORS = ["#e7d8c3", "#d9a066", "#c96f4a", "#9db4a0", "#b9c4d1", "#e0b84c", "#a86b8f", "#8f9a6e"];
const TREE_KINDS: SceneryKind[] = ["rainTree", "gulmohar", "palm", "rainTree", "gulmohar"];
// Interleaved so an offset-stride pick never repeats a kind within a segment.
const RIGHT_BUILDING_KINDS: SceneryKind[] = [
  "shops",
  "apartment",
  "heritage",
  "mall",
  "office",
  "resiTower",
  "shops",
  "itTower",
];
const LEFT_BUILDING_KINDS: SceneryKind[] = [
  "itTower",
  "apartment",
  "resiTower",
  "office",
  "mall",
  "heritage",
  "apartment",
  "shops",
];

/** Kind for building slot `slot`, striding from a random base so neighbours differ. */
function pickBuildingKind(arr: SceneryKind[], base: number, slot: number): SceneryKind {
  return arr[(base + slot * 3) % arr.length];
}

interface TreeSpec {
  kind: SceneryKind;
  x: number;
  z: number;
  s: number;
  yaw: number;
}

interface BuildingSpec {
  kind: SceneryKind;
  x: number;
  z: number;
  s: number;
  facing: 1 | -1;
  /** Small yaw jitter so cloned facades never line up perfectly. */
  yaw: number;
}

interface SkylineSpec {
  kind: SkylineKind;
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  color: string;
}

interface SkidSpec {
  x: number;
  z: number;
  l: number;
  rot: number;
}

interface OilSpec {
  x: number;
  z: number;
  s: number;
  rot: number;
}

interface ManholeSpec {
  x: number;
  z: number;
}

interface PatchSpec {
  x: number;
  z: number;
  w: number;
  l: number;
  rot: number;
}

/** Footpath vendor placement: generated model kinds + the procedural tea stall. */
type StallPlacementKind = StallKind | "tea";

interface StallSpec {
  kind: StallPlacementKind;
  x: number;
  z: number;
  /** Small yaw jitter on top of the road-facing base orientation. */
  yaw: number;
  /** 1 = right footpath (faces -x), -1 = left footpath (faces +x). */
  side: 1 | -1;
}

interface SegmentSpec {
  trees: TreeSpec[];
  buildings: BuildingSpec[];
  skyline: SkylineSpec[];
  hedgeZ: number[];
  medianLampZ: number[];
  rightLampZ: number[];
  billboardIdx: number;
  hasZebra: boolean;
  hasShelter: boolean;
  stalls: StallSpec[];
  /** Local-z offset (from the pole) of a drooping pole→building service wire. */
  serviceDropZ: number | null;
  signIdx: number | null;
  manholes: ManholeSpec[];
  patches: PatchSpec[];
  skids: SkidSpec[];
  oils: OilSpec[];
  drainZ: number[];
}

/**
 * Stall kind cycle — strided picking (base + i*3 mod 8) never lands three
 * identical kinds in one segment while keeping flower vendors the most
 * frequent sight, as requested.
 */
const STALL_KINDS: StallPlacementKind[] = ["flower", "veg", "cart", "tea", "flower", "veg", "cart", "flower"];

function buildSegmentSpec(index: number): SegmentSpec {
  const rand = mulberry32(index * 7919 + 13);
  const half = SEGMENT_LENGTH / 2;

  const trees: TreeSpec[] = [];
  for (let i = 0; i < 2; i++) {
    trees.push({
      kind: TREE_KINDS[Math.floor(rand() * TREE_KINDS.length)],
      x: 9.35 + rand() * 0.5,
      z: -half + 6 + i * 14 + rand() * 5,
      s: 0.85 + rand() * 0.35,
      yaw: rand() * Math.PI * 2,
    });
  }
  // Left footpath palms between metro pillars
  trees.push({
    kind: "palm",
    x: -20.6 - rand() * 0.6,
    z: (rand() - 0.5) * SEGMENT_LENGTH * 0.7,
    s: 0.9 + rand() * 0.3,
    yaw: rand() * Math.PI * 2,
  });

  const buildings: BuildingSpec[] = [];
  // Right-side buildings sit clear of the segment's billboard bay at z=0.
  const rightBase = Math.floor(rand() * RIGHT_BUILDING_KINDS.length);
  for (let i = 0; i < 2; i++) {
    buildings.push({
      kind: pickBuildingKind(RIGHT_BUILDING_KINDS, rightBase, i),
      x: 14.2 + rand() * 2.6,
      z: (i === 0 ? -1 : 1) * (10.5 + rand() * 1.8),
      s: 0.85 + rand() * 0.4,
      facing: -1,
      yaw: (rand() - 0.5) * 0.09,
    });
  }
  // Occasional third building in a second row behind the billboard bay.
  if (rand() < 0.6) {
    buildings.push({
      kind: pickBuildingKind(RIGHT_BUILDING_KINDS, rightBase, 2),
      x: 17.6 + rand() * 2.8,
      z: (rand() - 0.5) * 7,
      s: 0.95 + rand() * 0.4,
      facing: -1,
      yaw: (rand() - 0.5) * 0.09,
    });
  }
  const leftBase = Math.floor(rand() * LEFT_BUILDING_KINDS.length);
  buildings.push({
    kind: pickBuildingKind(LEFT_BUILDING_KINDS, leftBase, 0),
    x: -(24.5 + rand() * 3),
    z: (rand() - 0.5) * SEGMENT_LENGTH * 0.6,
    s: 0.9 + rand() * 0.45,
    facing: 1,
    yaw: (rand() - 0.5) * 0.09,
  });
  if (rand() < 0.7) {
    buildings.push({
      kind: pickBuildingKind(LEFT_BUILDING_KINDS, leftBase, 1),
      x: -(24.5 + rand() * 3),
      z: (rand() < 0.5 ? -1 : 1) * (9 + rand() * 3),
      s: 0.9 + rand() * 0.4,
      facing: 1,
      yaw: (rand() - 0.5) * 0.09,
    });
  }

  const skyline: SkylineSpec[] = [];
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < 2; i++) {
      skyline.push({
        kind: rand() < 0.5 ? "towerGlass" : "towerHome",
        x: side * (side > 0 ? 26 + rand() * 9 : 33 + rand() * 10),
        z: (rand() - 0.5) * SEGMENT_LENGTH * 0.85,
        w: 7 + rand() * 5,
        d: 6 + rand() * 5,
        h: 13 + rand() * 24,
        color: SKYLINE_COLORS[Math.floor(rand() * SKYLINE_COLORS.length)],
      });
    }
  }

  const manholes: ManholeSpec[] = [];
  const manholeCount = 1 + Math.floor(rand() * 2);
  for (let i = 0; i < manholeCount; i++) {
    manholes.push({ x: -4.3 + rand() * 8.6, z: (rand() - 0.5) * (SEGMENT_LENGTH - 5) });
  }
  manholes.push({ x: ONCOMING_ROAD_X + (rand() - 0.5) * 7, z: (rand() - 0.5) * (SEGMENT_LENGTH - 5) });

  const patches: PatchSpec[] = [];
  const patchCount = 2 + Math.floor(rand() * 2);
  for (let i = 0; i < patchCount; i++) {
    patches.push({
      x: rand() < 0.68 ? -4.5 + rand() * 9 : ONCOMING_ROAD_X + (rand() - 0.5) * 8,
      z: (rand() - 0.5) * (SEGMENT_LENGTH - 6),
      w: 1.1 + rand() * 1.9,
      l: 1.8 + rand() * 3.2,
      rot: (rand() - 0.5) * 0.6,
    });
  }

  const skids: SkidSpec[] = [];
  const skidCount = 1 + Math.floor(rand() * 2);
  for (let i = 0; i < skidCount; i++) {
    skids.push({
      x: -3.6 + rand() * 7.2,
      z: (rand() - 0.5) * (SEGMENT_LENGTH - 8),
      l: 4.5 + rand() * 4,
      rot: (rand() - 0.5) * 0.22,
    });
  }
  skids.push({
    x: ONCOMING_ROAD_X + (rand() - 0.5) * 7,
    z: (rand() - 0.5) * (SEGMENT_LENGTH - 8),
    l: 4 + rand() * 3.5,
    rot: (rand() - 0.5) * 0.24,
  });

  const oils: OilSpec[] = [];
  const oilCount = 1 + Math.floor(rand() * 2);
  for (let i = 0; i < oilCount; i++) {
    oils.push({
      x: rand() < 0.7 ? -4 + rand() * 8 : ONCOMING_ROAD_X + (rand() - 0.5) * 7,
      z: (rand() - 0.5) * (SEGMENT_LENGTH - 5),
      s: 0.8 + rand() * 1.1,
      rot: rand() * Math.PI * 2,
    });
  }

  const drainZ: number[] = [-9 - rand() * 4, 6 + rand() * 5];

  const hasShelter = index % 4 === 1;

  // Footpath vendors — 2-3 per segment on the right kerb, clear of tree
  // trunks, the bus shelter, the street light bay and the electric pole.
  const stalls: StallSpec[] = [];
  const rightTreeZ = trees.filter((t) => t.x > 4).map((t) => t.z);
  const slots = [-12.5, -8.5, -3, 1.5, 9.5, 13]
    .map((z) => z + (rand() - 0.5) * 1.4)
    .filter((z) => {
      if (rightTreeZ.some((tz) => Math.abs(tz - z) < 2.4)) return false;
      if (hasShelter && Math.abs(z - 6) < 2.8) return false;
      if (Math.abs(z - POLE_Z) < 1.9) return false;
      return Math.abs(z) > 1.6; // street light bay at z=0
    });
  const stallCount = Math.min(slots.length, 2 + (rand() < 0.45 ? 1 : 0));
  const kindBase = Math.floor(rand() * STALL_KINDS.length);
  for (let i = 0; i < stallCount; i++) {
    const z = slots.splice(Math.floor(rand() * slots.length), 1)[0];
    const kind = STALL_KINDS[(kindBase + i * 3) % STALL_KINDS.length];
    // Bulky carts hug the outer band so the footpath running line stays clear.
    const bulky = kind === "cart" || kind === "tea";
    stalls.push({
      kind,
      x: bulky ? 8.85 + rand() * 0.3 : 8.55 + rand() * 0.5,
      z,
      yaw: (rand() - 0.5) * 0.3,
      side: 1,
    });
  }
  // Occasional ground-spread vendor on the far footpath for depth.
  if (rand() < 0.55) {
    const palmZ = trees.filter((t) => t.x < -4).map((t) => t.z);
    const lz = (rand() - 0.5) * 24;
    if (Math.abs(lz) > 3.5 && !palmZ.some((pz) => Math.abs(pz - lz) < 2.6)) {
      stalls.push({
        kind: rand() < 0.6 ? "flower" : "veg",
        x: -18.35 - rand() * 0.4,
        z: lz,
        yaw: (rand() - 0.5) * 0.4,
        side: -1,
      });
    }
  }

  // Drooping service wire from the pole to a building facade — endpoint kept
  // clear of the billboard bay at z≈0.
  const serviceDropZ = rand() < 0.7 ? (rand() < 0.5 ? -(5 + rand() * 4) : 4 + rand() * 4) : null;

  return {
    trees,
    buildings,
    skyline,
    hedgeZ: [-10, 0, 10],
    medianLampZ: [-6, 6],
    rightLampZ: [0],
    billboardIdx: Math.floor(rand() * 11),
    hasZebra: index % 2 === 0,
    hasShelter,
    stalls,
    serviceDropZ,
    signIdx: index % 5 === 0 ? (index / 5) % 3 : null,
    manholes,
    patches,
    skids,
    oils,
    drainZ,
  };
}

/* ---------- Procedural fallbacks (used until GLBs stream in) ---------- */

function FallbackTree({ s }: { s: number }) {
  return (
    <group scale={s}>
      <mesh position={[0, 0.9, 0]} material={MAT.wood}>
        <cylinderGeometry args={[0.12, 0.18, 1.8, 7]} />
      </mesh>
      <mesh position={[0, 2.3, 0]} material={MAT.hedge} castShadow>
        <sphereGeometry args={[1.05, 10, 10]} />
      </mesh>
    </group>
  );
}

const FALLBACK_BUILDING_COLORS: Partial<Record<SceneryKind, string>> = {
  office: "#7fa8c9",
  itTower: "#8fb7d4",
  heritage: "#dcb8a1",
  resiTower: "#e3c98f",
  mall: "#d9a081",
  shops: "#d9c3a3",
  apartment: "#d9c3a3",
};

function FallbackBuilding({ kind, s }: { kind: SceneryKind; s: number }) {
  const h = SCENERY_CONFIG[kind].height * s;
  const w = kind === "office" || kind === "itTower" ? 9 : 8;
  return (
    <mesh position={[0, h / 2, 0]}>
      <boxGeometry args={[w, h, 8]} />
      <meshStandardMaterial color={FALLBACK_BUILDING_COLORS[kind] ?? "#d9c3a3"} roughness={0.85} />
    </mesh>
  );
}

/* ---------- Generated scenery wrappers ---------- */

interface TreeFadeMat {
  mat: THREE.Material;
  opacity: number;
  transparent: boolean;
  depthWrite: boolean;
}

/** Trunk-z window (world space) where a kerbside canopy can sit between the
 * Footpath Mode camera (z≈7.3) and the boy (z=0). */
const TREE_FADE_Z_MIN = -5;
const TREE_FADE_Z_MAX = 12.5;
const TREE_FADE_OPACITY = 0.1;

/**
 * Kerbside tree with camera-occlusion handling: while Footpath Mode has the
 * chase camera following the boy along the footpath, any right-side tree
 * passing through the camera corridor ghosts out (and stops casting its
 * shadow) so it never hides him, then restores the moment it clears.
 * Materials are per-instance clones — fading one tree never touches siblings.
 */
function GenTree({ spec }: { spec: TreeSpec }) {
  const entry = SCENERY_CONFIG[spec.kind];
  const groupRef = useRef<THREE.Group>(null);
  const fadeMats = useRef<TreeFadeMat[]>([]);
  const meshes = useRef<THREE.Mesh[]>([]);
  const collected = useRef(false);
  const fade = useRef(1);
  const wasFaded = useRef(false);
  const worldPos = useRef(new THREE.Vector3());
  // Only right-footpath trees can ever block the footpath follow camera.
  const canBlockCamera = spec.x > 4;

  useFrame((_, dt) => {
    if (!canBlockCamera) return;
    const g = groupRef.current;
    if (!g) return;
    if (!collected.current) {
      // Lazily gather the GLB's per-instance materials once Suspense mounts
      // the real model (shared procedural fallback materials are skipped).
      g.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (!mesh.isMesh) return;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        let real = false;
        for (const m of mats) {
          if (!m || m === MAT.wood || m === MAT.hedge) continue;
          real = true;
          fadeMats.current.push({
            mat: m,
            opacity: m.opacity,
            transparent: m.transparent,
            depthWrite: m.depthWrite,
          });
        }
        if (real) meshes.current.push(mesh);
      });
      if (fadeMats.current.length === 0) return;
      collected.current = true;
    }
    g.getWorldPosition(worldPos.current);
    const z = worldPos.current.z;
    const blocking =
      runtime.phase === "playing" &&
      runtime.power.type === "footpath" &&
      z > TREE_FADE_Z_MIN &&
      z < TREE_FADE_Z_MAX;
    const target = blocking ? TREE_FADE_OPACITY : 1;
    fade.current += (target - fade.current) * Math.min(1, 9 * dt);
    if (Math.abs(fade.current - target) < 0.012) fade.current = target;
    if (fade.current < 0.999) {
      for (const e of fadeMats.current) {
        e.mat.transparent = true;
        e.mat.depthWrite = false;
        e.mat.opacity = e.opacity * fade.current;
      }
      if (!wasFaded.current) {
        for (const m of meshes.current) m.castShadow = false;
        wasFaded.current = true;
      }
    } else if (wasFaded.current) {
      for (const e of fadeMats.current) {
        e.mat.opacity = e.opacity;
        e.mat.transparent = e.transparent;
        e.mat.depthWrite = e.depthWrite;
      }
      for (const m of meshes.current) m.castShadow = true;
      wasFaded.current = false;
    }
  });

  return (
    <group ref={groupRef} position={[spec.x, 0, spec.z]} rotation={[0, spec.yaw, 0]}>
      {entry.url ? (
        <Suspense fallback={<FallbackTree s={spec.s} />}>
          <SceneryModel
            url={entry.url}
            height={entry.height * spec.s}
            front={entry.front}
            up={entry.up}
            forward={[0, 0, 1]}
            instanceMaterials={canBlockCamera}
          />
        </Suspense>
      ) : (
        <FallbackTree s={spec.s} />
      )}
    </group>
  );
}

function GenBuilding({ spec }: { spec: BuildingSpec }) {
  const entry = SCENERY_CONFIG[spec.kind];
  return (
    <group position={[spec.x, 0, spec.z]} rotation={[0, spec.yaw, 0]}>
      {entry.url ? (
        <Suspense fallback={<FallbackBuilding kind={spec.kind} s={spec.s} />}>
          <SceneryModel
            url={entry.url}
            height={entry.height * spec.s}
            front={entry.front}
            up={entry.up}
            forward={[spec.facing, 0, 0]}
            castShadow={false}
          />
        </Suspense>
      ) : (
        <FallbackBuilding kind={spec.kind} s={spec.s} />
      )}
    </group>
  );
}

/** Distant procedural tower with lit windows — fallback while GLBs stream. */
function SkylineBlock({ spec }: { spec: SkylineSpec }) {
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  const windowTex = useMemo(() => {
    const t = getWindowTexture().clone();
    t.repeat.set(Math.max(1, Math.round(spec.w / 3)), Math.max(1, Math.round(spec.h / 4)));
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.needsUpdate = true;
    return t;
  }, [spec.w, spec.h]);

  useFrame(() => {
    if (matRef.current) matRef.current.emissiveIntensity = runtime.night * 1.1;
  });

  return (
    <mesh position={[spec.x, spec.h / 2, spec.z]}>
      <boxGeometry args={[spec.w, spec.h, spec.d]} />
      <meshStandardMaterial
        ref={matRef}
        color={spec.color}
        emissive="#ffffff"
        emissiveMap={windowTex}
        emissiveIntensity={0}
        roughness={0.9}
      />
    </mesh>
  );
}

/**
 * Skyline slot: generated low-poly tower model once available, lit-window
 * box until then. Towers face the road corridor from whichever side they're on.
 */
function GenSkyline({ spec }: { spec: SkylineSpec }) {
  // If only one tower model exists, it covers both skyline kinds — no boxes.
  const other: SkylineKind = spec.kind === "towerGlass" ? "towerHome" : "towerGlass";
  const kind = hasSkylineModel(spec.kind) ? spec.kind : hasSkylineModel(other) ? other : null;
  const entry = kind ? SKYLINE_CONFIG[kind] : null;
  if (!entry) return <SkylineBlock spec={spec} />;
  return (
    <group position={[spec.x, 0, spec.z]}>
      <Suspense fallback={null}>
        <SceneryModel
          url={entry.url}
          height={spec.h}
          front={entry.front}
          up={entry.up}
          forward={[spec.x > 0 ? -1 : 1, 0, 0]}
          castShadow={false}
        />
      </Suspense>
    </group>
  );
}

/* ---------- Street furniture ---------- */

/** Procedural twin-arm mast — fallback while the generated GLB streams in. */
function MedianLampFallback() {
  return (
    <group>
      <mesh position={[0, 3.5, 0]} material={MAT.pole}>
        <cylinderGeometry args={[0.08, 0.12, 7, 8]} />
      </mesh>
      {[-1, 1].map((dir) => (
        <group key={dir}>
          <mesh position={[dir * 0.85, 6.85, 0]} rotation={[0, 0, dir * -0.55]} material={MAT.pole}>
            <cylinderGeometry args={[0.05, 0.06, 1.8, 8]} />
          </mesh>
          <mesh position={[dir * 1.6, 7.1, 0]} material={nightMaterials.lampHead}>
            <boxGeometry args={[0.6, 0.15, 0.26]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/**
 * Median mast: two generated street lights back-to-back, one arm over each
 * carriageway — the classic Indian divided-road twin mast.
 */
function MedianLamp({ z }: { z: number }) {
  return (
    <group position={[MEDIAN_X, 0.3, z]}>
      {hasStreetLightModel() ? (
        <Suspense fallback={<MedianLampFallback />}>
          <group position={[0.14, 0, 0]}>
            <StreetLightModel
              height={6.9}
              forward={[1, 0, 0]}
              headMaterial={nightMaterials.lampHead}
              glowMaterial={nightMaterials.lampGlow}
            />
          </group>
          <group position={[-0.14, 0, 0]}>
            <StreetLightModel
              height={6.9}
              forward={[-1, 0, 0]}
              headMaterial={nightMaterials.lampHead}
              glowMaterial={nightMaterials.lampGlow}
            />
          </group>
        </Suspense>
      ) : (
        <MedianLampFallback />
      )}
    </group>
  );
}

function RightLampFallback() {
  return (
    <group>
      <mesh position={[0, 2.6, 0]} material={MAT.pole}>
        <cylinderGeometry args={[0.07, 0.1, 5.2, 8]} />
      </mesh>
      <mesh position={[-0.75, 5.05, 0]} rotation={[0, 0, 0.52]} material={MAT.pole}>
        <cylinderGeometry args={[0.05, 0.06, 1.6, 8]} />
      </mesh>
      <mesh position={[-1.4, 5.3, 0]} material={nightMaterials.lampHead}>
        <boxGeometry args={[0.55, 0.14, 0.24]} />
      </mesh>
    </group>
  );
}

/** Footpath street light — generated pole, arm reaching over the carriageway. */
function RightLamp({ z }: { z: number }) {
  return (
    <group position={[5.85, 0.18, z]}>
      {hasStreetLightModel() ? (
        <Suspense fallback={<RightLampFallback />}>
          <StreetLightModel
            height={5.7}
            forward={[-1, 0, 0]}
            headMaterial={nightMaterials.lampHead}
            glowMaterial={nightMaterials.lampGlow}
          />
        </Suspense>
      ) : (
        <RightLampFallback />
      )}
    </group>
  );
}

function TrafficSignal({ z }: { z: number }) {
  return (
    <group position={[5.75, 0.18, z]}>
      <mesh position={[0, 1.7, 0]} material={MAT.pole}>
        <cylinderGeometry args={[0.06, 0.08, 3.4, 8]} />
      </mesh>
      <mesh position={[0, 3.05, 0]} material={MAT.signalBox}>
        <boxGeometry args={[0.34, 1.0, 0.26]} />
      </mesh>
      <mesh position={[0, 3.36, 0.14]} rotation={[Math.PI / 2, 0, 0]} material={nightMaterials.signalRed}>
        <cylinderGeometry args={[0.09, 0.09, 0.05, 12]} />
      </mesh>
      <mesh position={[0, 3.05, 0.14]} rotation={[Math.PI / 2, 0, 0]} material={MAT.amberLight}>
        <cylinderGeometry args={[0.09, 0.09, 0.05, 12]} />
      </mesh>
      <mesh position={[0, 2.74, 0.14]} rotation={[Math.PI / 2, 0, 0]} material={MAT.greenLight}>
        <cylinderGeometry args={[0.09, 0.09, 0.05, 12]} />
      </mesh>
    </group>
  );
}

function BusShelter({ z }: { z: number }) {
  const tex = getBusStopTexture();
  return (
    <group position={[9.0, 0.18, z]}>
      {[-1.55, 1.55].map((pz) => (
        <mesh key={pz} position={[0, 1.3, pz]} material={MAT.steel}>
          <cylinderGeometry args={[0.05, 0.05, 2.6, 8]} />
        </mesh>
      ))}
      <mesh position={[0, 2.66, 0]} rotation={[0, 0, 0.07]} material={MAT.steel}>
        <boxGeometry args={[1.7, 0.08, 3.8]} />
      </mesh>
      <mesh position={[0.62, 1.5, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[3.4, 1.15]} />
        <meshBasicMaterial map={tex} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0.1, 0.55, 0]} material={MAT.bench}>
        <boxGeometry args={[0.48, 0.08, 2.7]} />
      </mesh>
      {[-1.1, 1.1].map((pz) => (
        <mesh key={pz} position={[0.1, 0.27, pz]} material={MAT.bench}>
          <boxGeometry args={[0.4, 0.46, 0.1]} />
        </mesh>
      ))}
    </group>
  );
}

/** Procedural tea stall — origin-anchored so the Stall wrapper can place it. */
function TeaStall() {
  return (
    <group>
      <mesh position={[0, 0.55, 0]} material={MAT.wood}>
        <boxGeometry args={[1.1, 1.1, 1.7]} />
      </mesh>
      <mesh position={[0, 1.45, 0]} rotation={[0, 0, 0.16]} material={MAT.redCloth}>
        <boxGeometry args={[1.6, 0.06, 2]} />
      </mesh>
      <mesh position={[-0.3, 1.21, -0.5]}>
        <boxGeometry args={[0.25, 0.32, 0.25]} />
        <meshStandardMaterial color="#e5e7eb" />
      </mesh>
      <mesh position={[-0.35, 1.14, 0.4]}>
        <boxGeometry args={[0.3, 0.18, 0.4]} />
        <meshStandardMaterial color="#f59e0b" />
      </mesh>
    </group>
  );
}

/** Procedural push cart — fallback while the generated food cart streams in. */
function FruitCart() {
  return (
    <group>
      <mesh position={[0, 0.8, 0]} material={MAT.wood}>
        <boxGeometry args={[0.95, 0.14, 1.5]} />
      </mesh>
      {[-0.55, 0.55].map((pz) => (
        <mesh key={pz} position={[0, 0.34, pz]} rotation={[0, 0, Math.PI / 2]} material={MAT.darkSteel}>
          <cylinderGeometry args={[0.3, 0.3, 0.08, 14]} />
        </mesh>
      ))}
      {[
        { pz: -0.42, color: "#f97316" },
        { pz: 0, color: "#65a30d" },
        { pz: 0.42, color: "#facc15" },
      ].map((f) => (
        <mesh key={f.pz} position={[0, 0.98, f.pz]}>
          <boxGeometry args={[0.72, 0.22, 0.36]} />
          <meshStandardMaterial color={f.color} roughness={0.85} />
        </mesh>
      ))}
      {[-0.35, 0.35].map((px) => (
        <mesh key={px} position={[px, 1.35, 0]} material={MAT.steel}>
          <cylinderGeometry args={[0.025, 0.025, 0.9, 6]} />
        </mesh>
      ))}
      <mesh position={[0, 1.82, 0]} rotation={[0.14, 0, 0]} material={MAT.redCloth}>
        <planeGeometry args={[1.1, 1.7]} />
      </mesh>
    </group>
  );
}

/** Shared materials for the procedural vendor ground-spread fallbacks. */
const SPREAD_MAT = {
  jute: new THREE.MeshStandardMaterial({ color: "#8a6f4d", roughness: 1, side: THREE.DoubleSide }),
  blueTarp: new THREE.MeshStandardMaterial({ color: "#1d4ed8", roughness: 0.9, side: THREE.DoubleSide }),
  marigold: new THREE.MeshStandardMaterial({ color: "#f59e0b", roughness: 0.9 }),
  rose: new THREE.MeshStandardMaterial({ color: "#dc2626", roughness: 0.9 }),
  jasmine: new THREE.MeshStandardMaterial({ color: "#f1f5f9", roughness: 0.9 }),
  tomato: new THREE.MeshStandardMaterial({ color: "#ef4444", roughness: 0.85 }),
  potato: new THREE.MeshStandardMaterial({ color: "#92400e", roughness: 1 }),
  greens: new THREE.MeshStandardMaterial({ color: "#16a34a", roughness: 1 }),
  sareeTeal: new THREE.MeshStandardMaterial({ color: "#0d9488", roughness: 0.95 }),
  shirt: new THREE.MeshStandardMaterial({ color: "#e7e5e4", roughness: 0.95 }),
  skin: new THREE.MeshStandardMaterial({ color: "#8d5a3b", roughness: 0.9 }),
};

/**
 * Procedural vendor-with-ground-spread fallback (tarp + produce piles +
 * seated figure). Local front (customer side) faces -z; the Stall wrapper
 * yaws it toward the road.
 */
function GroundSpreadFallback({ kind }: { kind: "flower" | "veg" }) {
  const piles =
    kind === "flower"
      ? [SPREAD_MAT.marigold, SPREAD_MAT.rose, SPREAD_MAT.jasmine, SPREAD_MAT.marigold, SPREAD_MAT.rose, SPREAD_MAT.marigold]
      : [SPREAD_MAT.tomato, SPREAD_MAT.greens, SPREAD_MAT.potato, SPREAD_MAT.greens, SPREAD_MAT.tomato, SPREAD_MAT.potato];
  return (
    <group>
      <mesh position={[0, 0.02, -0.1]} rotation={[-Math.PI / 2, 0, 0]} material={kind === "flower" ? SPREAD_MAT.jute : SPREAD_MAT.blueTarp}>
        <planeGeometry args={[1.7, 1.35]} />
      </mesh>
      {piles.map((m, i) => (
        <mesh key={i} position={[-0.5 + (i % 3) * 0.5, 0.1, -0.45 + Math.floor(i / 3) * 0.5]} material={m} castShadow>
          <sphereGeometry args={[0.15, 8, 6]} />
        </mesh>
      ))}
      <mesh position={[0, 0.3, 0.72]} material={kind === "flower" ? SPREAD_MAT.sareeTeal : SPREAD_MAT.shirt} castShadow>
        <capsuleGeometry args={[0.19, 0.28, 4, 8]} />
      </mesh>
      <mesh position={[0, 0.64, 0.72]} material={SPREAD_MAT.skin}>
        <sphereGeometry args={[0.11, 8, 8]} />
      </mesh>
    </group>
  );
}

/**
 * Footpath vendor slot: generated stall model once available (facing the
 * carriageway from whichever footpath it sits on), procedural stand-in until
 * then. The kerb-side runner lane stays clear — stalls hug the outer band.
 */
function Stall({ spec }: { spec: StallSpec }) {
  const modelKind: StallKind | null = spec.kind === "tea" ? null : spec.kind;
  const entry = modelKind !== null && hasStallModel(modelKind) ? STALL_CONFIG[modelKind] : null;
  // Vendors with an intrinsic front face the carriageway; directionless
  // models (no reported front) keep identity yaw per orientation metadata.
  const forward: [number, number, number] = entry?.directionless
    ? [0, 0, 1]
    : [spec.side === 1 ? -1 : 1, 0, 0];
  // Fallbacks are authored with their customer side on local -z.
  const fallbackYaw = spec.side === 1 ? Math.PI / 2 : -Math.PI / 2;
  const fallback =
    spec.kind === "cart" ? (
      <FruitCart />
    ) : spec.kind === "tea" ? (
      <TeaStall />
    ) : (
      <group rotation={[0, fallbackYaw, 0]}>
        <GroundSpreadFallback kind={spec.kind} />
      </group>
    );
  return (
    <group position={[spec.x, 0.18, spec.z]} rotation={[0, spec.yaw, 0]}>
      {entry ? (
        <Suspense fallback={fallback}>
          <SceneryModel url={entry.url} height={entry.height} front={entry.front} up={entry.up} forward={forward} />
        </Suspense>
      ) : (
        fallback
      )}
    </group>
  );
}

/* ---------- Electric pole line + hanging wires ---------- */

/** Procedural concrete pole — fallback while the generated GLB streams in. */
function ElectricPoleFallback() {
  return (
    <group>
      <mesh position={[0, POLE_H / 2, 0]} material={MAT.concrete} castShadow>
        <cylinderGeometry args={[0.09, 0.17, POLE_H, 8]} />
      </mesh>
      {[POLE_H - 0.5, POLE_H - 1.05].map((y) => (
        <mesh key={y} position={[0, y, 0]} material={MAT.darkSteel}>
          <boxGeometry args={[1.15, 0.09, 0.09]} />
        </mesh>
      ))}
      <mesh position={[-0.24, POLE_H - 2.1, 0]} material={MAT.signalBox} castShadow>
        <boxGeometry args={[0.42, 0.62, 0.4]} />
      </mesh>
    </group>
  );
}

/** One Indian electric pole per segment, transformer side facing the road. */
function ElectricPole({ z }: { z: number }) {
  return (
    <group position={[POLE_X, 0.18, z]}>
      {hasElectricPoleModel() ? (
        <Suspense fallback={<ElectricPoleFallback />}>
          <ElectricPoleModel height={POLE_H} forward={[-1, 0, 0]} />
        </Suspense>
      ) : (
        <ElectricPoleFallback />
      )}
    </group>
  );
}

interface WireStrand {
  dx: number;
  y: number;
  /** Visible mid-span droop in metres (control point sits 2× lower). */
  sag: number;
}

/** Four power conductors up top + one slack telecom bundle below. */
const WIRE_STRANDS: WireStrand[] = [
  { dx: -0.36, y: 7.06, sag: 0.85 },
  { dx: -0.13, y: 6.94, sag: 1.1 },
  { dx: 0.13, y: 6.94, sag: 0.95 },
  { dx: 0.36, y: 7.06, sag: 0.8 },
  { dx: 0.04, y: 6.02, sag: 1.55 },
];

const WIRE_MAT = new THREE.MeshBasicMaterial({ color: "#16171b" });

let wireSpanGeom: THREE.BufferGeometry | null = null;

/**
 * One merged geometry holding every pole→pole strand for a full segment
 * span. Poles sit at the same local z in every segment, so each segment
 * drawing its own span chains into a seamless sagging line down the road.
 */
function getWireSpanGeometry(): THREE.BufferGeometry {
  if (wireSpanGeom) return wireSpanGeom;
  const tubes = WIRE_STRANDS.map((s) => {
    const start = new THREE.Vector3(POLE_X + s.dx, s.y, POLE_Z);
    const end = new THREE.Vector3(POLE_X + s.dx, s.y, POLE_Z + SEGMENT_LENGTH);
    const mid = new THREE.Vector3(POLE_X + s.dx, s.y - s.sag * 2, POLE_Z + SEGMENT_LENGTH / 2);
    const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
    return new THREE.TubeGeometry(curve, 22, 0.021, 4, false);
  });
  wireSpanGeom = mergeGeometries(tubes, false) ?? tubes[0];
  return wireSpanGeom;
}

/**
 * The hanging wires: the shared pole→pole span plus this segment's optional
 * drooping service wire from the pole across to a building facade — the
 * classic tangled Indian streetside look.
 */
function PowerLines({ dropZ }: { dropZ: number | null }) {
  const dropGeom = useMemo(() => {
    if (dropZ === null) return null;
    const start = new THREE.Vector3(POLE_X, 6.55, POLE_Z);
    const end = new THREE.Vector3(13.9, 4.6, POLE_Z + dropZ);
    const mid = new THREE.Vector3(
      (start.x + end.x) / 2,
      Math.min(start.y, end.y) - 1.6,
      (start.z + end.z) / 2,
    );
    return new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(start, mid, end), 16, 0.02, 4, false);
  }, [dropZ]);
  return (
    <group>
      <mesh geometry={getWireSpanGeometry()} material={WIRE_MAT} dispose={null} />
      {dropGeom && <mesh geometry={dropGeom} material={WIRE_MAT} />}
    </group>
  );
}

function BillboardFallback({ tex }: { tex: THREE.Texture }) {
  return (
    <group>
      <mesh position={[0, 3.6, 0]} material={MAT.pole}>
        <cylinderGeometry args={[0.11, 0.14, 7.2, 8]} />
      </mesh>
      <mesh position={[0, 7.4, 0]}>
        <boxGeometry args={[5.6, 2.9, 0.18]} />
        <meshBasicMaterial map={tex} />
      </mesh>
    </group>
  );
}

/**
 * Roadside hoarding in its own bay at the segment centre (buildings are kept
 * clear of z≈0) so the structure never intersects the architecture.
 */
function Billboard({ idx, z }: { idx: number; z: number }) {
  const textures = getBillboardTextures();
  const tex = textures[idx % textures.length];
  return (
    <group position={[12.4, 0, z]} rotation={[0, -0.3, 0]}>
      {hasBillboardModel() ? (
        <Suspense fallback={<BillboardFallback tex={tex} />}>
          <BillboardStructureModel height={8.4} poster={tex} />
        </Suspense>
      ) : (
        <BillboardFallback tex={tex} />
      )}
    </group>
  );
}

/**
 * Overhead green direction gantry spanning the carriageway (visual only).
 * Raised well above the chase camera's highest point so the boards never
 * clip through the view as the gantry passes overhead.
 */
function SignGantry({ idx, z }: { idx: number; z: number }) {
  const tex = getDirectionSignTextures()[idx % 3];
  return (
    <group position={[0, 0, z]}>
      {[-(ROAD_WIDTH / 2 + 0.9), ROAD_WIDTH / 2 + 0.9].map((x) => (
        <mesh key={x} position={[x, 4.1, 0]} material={MAT.steel}>
          <cylinderGeometry args={[0.12, 0.14, 8.2, 8]} />
        </mesh>
      ))}
      <mesh position={[0, 8.25, 0]} material={MAT.steel}>
        <boxGeometry args={[ROAD_WIDTH + 2.6, 0.32, 0.3]} />
      </mesh>
      <mesh position={[-1.2, 7.35, 0.18]}>
        <planeGeometry args={[4.6, 1.55]} />
        <meshBasicMaterial map={tex} />
      </mesh>
      <mesh position={[3.4, 7.5, 0.18]}>
        <planeGeometry args={[1.9, 1.1]} />
        <meshBasicMaterial color="#1e3a8a" />
      </mesh>
    </group>
  );
}

function ZebraCrossing({ z }: { z: number }) {
  const tex = getZebraTexture();
  return (
    <mesh position={[0, 0.015, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[ROAD_WIDTH, 2.8]} />
      <meshStandardMaterial map={tex} roughness={0.9} />
    </mesh>
  );
}

function MetroStructure() {
  return (
    <group position={[METRO_X, 0, 0]}>
      <mesh position={[0, 3.7, 0]} material={MAT.concrete}>
        <cylinderGeometry args={[0.62, 0.8, 7.4, 10]} />
      </mesh>
      <mesh position={[0, 7.55, 0]} material={MAT.concrete}>
        <boxGeometry args={[2.4, 0.5, 2.2]} />
      </mesh>
      <mesh position={[0, 8.15, 0]} material={MAT.concreteLight}>
        <boxGeometry args={[3.3, 0.9, SEGMENT_LENGTH + 0.5]} />
      </mesh>
      {[-1.5, 1.5].map((x) => (
        <mesh key={x} position={[x, 8.8, 0]} material={MAT.darkSteel}>
          <boxGeometry args={[0.14, 0.4, SEGMENT_LENGTH + 0.5]} />
        </mesh>
      ))}
    </group>
  );
}

function MetroTrainFallback() {
  return (
    <group>
      {[-1, 0, 1].map((i) => (
        <mesh key={i} position={[0, 0.65, i * 6.4]}>
          <boxGeometry args={[2.5, 1.3, 6]} />
          <meshStandardMaterial color={i === -1 ? "#0d9488" : "#14b8a6"} metalness={0.4} roughness={0.4} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * The elevated metro service: generated 3-car trainset gliding along the
 * viaduct with genuine rail motion — micro bogie shudder + a slow carriage
 * sway — nose pointed along its +Z travel direction.
 */
function MetroTrain() {
  const ref = useRef<THREE.Group>(null);
  const swayRef = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.getElapsedTime();
    const z = ((t * 34) % 480) - 350;
    ref.current.position.set(METRO_X, 8.6, z);
    ref.current.visible = z > -280 && z < 60;
    const sway = swayRef.current;
    if (sway) {
      sway.rotation.z = Math.sin(t * 5.1) * 0.006 + Math.sin(t * 1.7) * 0.004;
      sway.position.y = Math.abs(Math.sin(t * 8.3)) * 0.016;
    }
  });
  return (
    <group ref={ref}>
      <group ref={swayRef}>
        {hasMetroTrainModel() ? (
          <Suspense fallback={<MetroTrainFallback />}>
            <MetroTrainModel />
          </Suspense>
        ) : (
          <MetroTrainFallback />
        )}
      </group>
    </group>
  );
}

/**
 * Median greenery: generated garden strip (grass bed + bougainvillea) sitting
 * on the raised divider, hedge-box fallback until the GLB streams in.
 */
function MedianGarden({ z }: { z: number }) {
  const fallback = (
    <mesh position={[0, 0.28, 0]} material={MAT.hedge}>
      <boxGeometry args={[1.0, 0.55, 4.2]} />
    </mesh>
  );
  return (
    <group position={[MEDIAN_X, 0.3, z]}>
      {hasMedianGardenModel() ? (
        <Suspense fallback={fallback}>
          <MedianGardenModel />
        </Suspense>
      ) : (
        fallback
      )}
    </group>
  );
}

/* ---------- Road deck ---------- */

function Manhole({ spec }: { spec: ManholeSpec }) {
  return (
    <group position={[spec.x, 0, spec.z]}>
      <mesh position={[0, 0.012, 0]} material={DETAIL_MAT.manholeRing}>
        <cylinderGeometry args={[0.47, 0.47, 0.024, 20]} />
      </mesh>
      <mesh position={[0, 0.028, 0]} material={DETAIL_MAT.manhole}>
        <cylinderGeometry args={[0.36, 0.36, 0.026, 20]} />
      </mesh>
    </group>
  );
}

/** Darkened wheel-path strips that sell years of traffic on each lane. */
const WEAR_XS = [-3.75, -2.65, -0.55, 0.55, 2.65, 3.75, -11.15, -10.05];

function RoadDeck({ spec }: { spec: SegmentSpec }) {
  return (
    <group>
      {/* Player carriageway */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow material={MAT.asphalt}>
        <planeGeometry args={[ROAD_WIDTH, SEGMENT_LENGTH]} />
      </mesh>
      {/* Oncoming carriageway */}
      <mesh
        position={[ONCOMING_ROAD_X, 0, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
        material={MAT.asphaltOld}
      >
        <planeGeometry args={[ONCOMING_ROAD_W, SEGMENT_LENGTH]} />
      </mesh>
      {/* Solid edge lines */}
      <mesh position={[ROAD_WIDTH / 2 - 0.25, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]} material={MAT.white}>
        <planeGeometry args={[0.16, SEGMENT_LENGTH]} />
      </mesh>
      <mesh position={[-(ROAD_WIDTH / 2 - 0.25), 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]} material={MAT.yellow}>
        <planeGeometry args={[0.16, SEGMENT_LENGTH]} />
      </mesh>
      <mesh
        position={[ONCOMING_ROAD_X + ONCOMING_ROAD_W / 2 - 0.25, 0.012, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        material={MAT.yellow}
      >
        <planeGeometry args={[0.16, SEGMENT_LENGTH]} />
      </mesh>
      <mesh
        position={[ONCOMING_ROAD_X - ONCOMING_ROAD_W / 2 + 0.25, 0.012, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        material={MAT.white}
      >
        <planeGeometry args={[0.16, SEGMENT_LENGTH]} />
      </mesh>
      {/* Median divider — black/yellow striped kerb sides, concrete top */}
      <mesh position={[MEDIAN_X, 0.16, 0]} material={getMedianMaterials()} castShadow>
        <boxGeometry args={[MEDIAN_W, 0.32, SEGMENT_LENGTH]} />
      </mesh>
      {spec.hedgeZ.map((z) => (
        <MedianGarden key={z} z={z} />
      ))}
      {/* Right curb + footpath */}
      <mesh position={[ROAD_WIDTH / 2 + 0.14, 0.1, 0]} material={MAT.curb}>
        <boxGeometry args={[0.3, 0.2, SEGMENT_LENGTH]} />
      </mesh>
      <mesh position={[RIGHT_FOOTPATH_X, 0.09, 0]} receiveShadow material={MAT.paver}>
        <boxGeometry args={[RIGHT_FOOTPATH_W, 0.18, SEGMENT_LENGTH]} />
      </mesh>
      {/* Left far curb + footpath (beyond oncoming) */}
      <mesh position={[ONCOMING_ROAD_X - ONCOMING_ROAD_W / 2 - 0.14, 0.1, 0]} material={MAT.curb}>
        <boxGeometry args={[0.3, 0.2, SEGMENT_LENGTH]} />
      </mesh>
      <mesh position={[LEFT_FOOTPATH_X, 0.09, 0]} material={MAT.paverOld}>
        <boxGeometry args={[LEFT_FOOTPATH_W, 0.18, SEGMENT_LENGTH]} />
      </mesh>
      {spec.hasZebra && <ZebraCrossing z={-SEGMENT_LENGTH / 2 + 2} />}
      {WEAR_XS.map((x) => (
        <mesh key={x} position={[x, 0.013, 0]} rotation={[-Math.PI / 2, 0, 0]} material={DETAIL_MAT.wear}>
          <planeGeometry args={[0.52, SEGMENT_LENGTH]} />
        </mesh>
      ))}
      {spec.manholes.map((m, i) => (
        <Manhole key={i} spec={m} />
      ))}
      {spec.patches.map((pt, i) => (
        <mesh
          key={i}
          position={[pt.x, 0.016, pt.z]}
          rotation={[-Math.PI / 2, 0, pt.rot]}
          material={DETAIL_MAT.patch}
        >
          <planeGeometry args={[pt.w, pt.l]} />
        </mesh>
      ))}
      {/* Tire skid streaks */}
      {spec.skids.map((s, i) => (
        <mesh
          key={`sk${i}`}
          position={[s.x, 0.0145, s.z]}
          rotation={[-Math.PI / 2, 0, s.rot]}
          material={getDecalMats().skid}
        >
          <planeGeometry args={[0.95, s.l]} />
        </mesh>
      ))}
      {/* Oil / diesel stains */}
      {spec.oils.map((o, i) => (
        <mesh
          key={`oil${i}`}
          position={[o.x, 0.017, o.z]}
          rotation={[-Math.PI / 2, 0, o.rot]}
          material={getDecalMats().oil}
        >
          <planeGeometry args={[o.s, o.s]} />
        </mesh>
      ))}
      {/* Storm drains along both gutter lines */}
      {spec.drainZ.map((z, i) => (
        <group key={`dr${i}`}>
          <mesh position={[4.55, 0.014, z]} rotation={[-Math.PI / 2, 0, 0]} material={getDecalMats().drain}>
            <planeGeometry args={[0.42, 0.9]} />
          </mesh>
          <mesh position={[-4.55, 0.014, z + 4]} rotation={[-Math.PI / 2, 0, 0]} material={getDecalMats().drain}>
            <planeGeometry args={[0.42, 0.9]} />
          </mesh>
        </group>
      ))}
      {/* Painted lane arrows + SLOW ahead of every zebra crossing */}
      {spec.hasZebra && (
        <>
          {[-3.2, 0, 3.2].map((x) => (
            <mesh
              key={`ar${x}`}
              position={[x, 0.018, -5]}
              rotation={[-Math.PI / 2, 0, 0]}
              material={getDecalMats().arrow}
            >
              <planeGeometry args={[0.8, 3.2]} />
            </mesh>
          ))}
          <mesh position={[0, 0.018, 2]} rotation={[-Math.PI / 2, 0, 0]} material={getDecalMats().slow}>
            <planeGeometry args={[2.6, 1.3]} />
          </mesh>
        </>
      )}
    </group>
  );
}

function Segment({ index }: { index: number }) {
  const groupRef = useRef<THREE.Group>(null);
  const spec = useMemo(() => buildSegmentSpec(index), [index]);

  useFrame(() => {
    if (!groupRef.current) return;
    const z = ((index * SEGMENT_LENGTH + runtime.scroll) % TOTAL) - (TOTAL - FRONT_MARGIN);
    groupRef.current.position.z = z;
  });

  return (
    <group ref={groupRef}>
      <RoadDeck spec={spec} />
      {spec.medianLampZ.map((z) => (
        <MedianLamp key={z} z={z} />
      ))}
      {spec.rightLampZ.map((z) => (
        <RightLamp key={z} z={z} />
      ))}
      {spec.hasZebra && <TrafficSignal z={-SEGMENT_LENGTH / 2 + 4.2} />}
      {spec.trees.map((t, i) => (
        <GenTree key={i} spec={t} />
      ))}
      {spec.buildings.map((b, i) => (
        <GenBuilding key={i} spec={b} />
      ))}
      {spec.skyline.map((s, i) => (
        <GenSkyline key={i} spec={s} />
      ))}
      {spec.hasShelter && <BusShelter z={6} />}
      {spec.stalls.map((s, i) => (
        <Stall key={`st${i}`} spec={s} />
      ))}
      <ElectricPole z={POLE_Z} />
      <PowerLines dropZ={spec.serviceDropZ} />
      {index % 2 === 0 && <Billboard idx={spec.billboardIdx + index} z={0} />}
      {spec.signIdx !== null && <SignGantry idx={spec.signIdx} z={-4} />}
      <MetroStructure />
    </group>
  );
}

/** Instanced lane dashes + reflective road studs, scrolling with the world. */
function LaneDashes() {
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const studRef = useRef<THREE.InstancedMesh>(null);
  const dashColumns = useMemo(() => [-1.6, 1.6, -10.2, -13.2], []);
  // Studs also trace the kerb and median edges — reflective at night.
  const studColumns = useMemo(() => [-1.6, 1.6, -10.2, -13.2, 5.08, -5.08, -7.12], []);
  const rows = useMemo(() => {
    const arr: number[] = [];
    for (let z = 20; z > -230; z -= 6) arr.push(z);
    return arr;
  }, []);
  const dashCount = dashColumns.length * rows.length;
  const studCount = studColumns.length * rows.length;

  useEffect(() => {
    const mesh = meshRef.current;
    const studs = studRef.current;
    if (!mesh || !studs) return;
    const dummy = new THREE.Object3D();
    let i = 0;
    for (const x of dashColumns) {
      for (const z of rows) {
        dummy.position.set(x, 0.011, z);
        dummy.rotation.set(-Math.PI / 2, 0, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        i += 1;
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    let j = 0;
    dummy.rotation.set(0, 0, 0);
    for (const x of studColumns) {
      for (const z of rows) {
        dummy.position.set(x, 0.032, z - 3);
        dummy.updateMatrix();
        studs.setMatrixAt(j, dummy.matrix);
        j += 1;
      }
    }
    studs.instanceMatrix.needsUpdate = true;
  }, [dashColumns, studColumns, rows]);

  useFrame(() => {
    if (groupRef.current) groupRef.current.position.z = runtime.scroll % 6;
  });

  return (
    <group ref={groupRef}>
      <instancedMesh ref={meshRef} args={[undefined, undefined, dashCount]} frustumCulled={false}>
        <planeGeometry args={[0.16, 2.6]} />
        <meshBasicMaterial color="#d6d3c8" />
      </instancedMesh>
      <instancedMesh
        ref={studRef}
        args={[undefined, undefined, studCount]}
        frustumCulled={false}
        material={DETAIL_MAT.stud}
      >
        <boxGeometry args={[0.1, 0.05, 0.2]} />
      </instancedMesh>
    </group>
  );
}

/** The recycled endless Indian arterial road. */
export function CityScape() {
  useEffect(() => {
    applyGeneratedSurfaces({
      asphalt: MAT.asphalt,
      asphaltOld: MAT.asphaltOld,
      paver: MAT.paver,
      paverOld: MAT.paverOld,
    });
  }, []);

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, -110]} receiveShadow>
        <planeGeometry args={[300, 480]} />
        <meshStandardMaterial color="#45423d" roughness={1} />
      </mesh>
      <LaneDashes />
      {Array.from({ length: SEGMENT_COUNT }, (_, i) => (
        <Segment key={i} index={i} />
      ))}
      <MetroTrain />
    </group>
  );
}
