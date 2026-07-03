import * as THREE from "three";

export const GENERATED_MODEL_AXIS_VECTORS = {
  positiveX: new THREE.Vector3(1, 0, 0),
  negativeX: new THREE.Vector3(-1, 0, 0),
  positiveY: new THREE.Vector3(0, 1, 0),
  negativeY: new THREE.Vector3(0, -1, 0),
  positiveZ: new THREE.Vector3(0, 0, 1),
  negativeZ: new THREE.Vector3(0, 0, -1),
} as const;

export type GeneratedModelAxis = keyof typeof GENERATED_MODEL_AXIS_VECTORS;

/**
 * Bounds of the model as actually rendered, in the object's local frame.
 * Box3.setFromObject is wrong for skinned meshes — they must be measured
 * through their bones instead.
 */
export function measureGeneratedModel(object: THREE.Object3D): THREE.Box3 {
  object.updateMatrixWorld(true);
  const rootInverse = object.matrixWorld.clone().invert();
  const box = new THREE.Box3();
  const childBox = new THREE.Box3();
  const toRoot = new THREE.Matrix4();
  object.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const skinned = node as THREE.SkinnedMesh;
    if (skinned.isSkinnedMesh) {
      skinned.skeleton.update();
      skinned.computeBoundingBox();
      childBox.copy(skinned.boundingBox!);
    } else {
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      childBox.copy(mesh.geometry.boundingBox!);
    }
    toRoot.multiplyMatrices(rootInverse, mesh.matrixWorld);
    box.union(childBox.applyMatrix4(toRoot));
  });
  return box;
}

/** Quaternion mapping +Z onto `front` and +Y onto `up` (orthonormalized). */
function basisQuaternion(front: THREE.Vector3, up: THREE.Vector3): THREE.Quaternion {
  const f = front.clone().normalize();
  const r = new THREE.Vector3().crossVectors(up, f).normalize();
  const u = new THREE.Vector3().crossVectors(f, r).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(r, u, f));
}

/**
 * Full body-frame correction: rotates the model so its classified local front
 * axis points along desiredWorldForward while its local up axis stays world-up.
 */
export function generatedModelOrientationCorrection(options: {
  localFrontAxis: GeneratedModelAxis;
  localUpAxis: GeneratedModelAxis;
  desiredWorldForward: THREE.Vector3;
  worldUp?: THREE.Vector3;
}): THREE.Quaternion {
  const localBasis = basisQuaternion(
    GENERATED_MODEL_AXIS_VECTORS[options.localFrontAxis],
    GENERATED_MODEL_AXIS_VECTORS[options.localUpAxis],
  );
  const worldBasis = basisQuaternion(
    options.desiredWorldForward,
    options.worldUp ?? new THREE.Vector3(0, 1, 0),
  );
  return worldBasis.multiply(localBasis.invert());
}

export interface ModelNormalization {
  scale: number;
  quaternion: THREE.Quaternion;
  position: THREE.Vector3;
}

/**
 * Bounds of a model AFTER a normalization has been applied — in the wrapper
 * group's local space. Lets callers anchor overlays (lamp glow, posters) to
 * the real extents of a generated model without guessing proportions.
 */
export function computeNormalizedBounds(
  object: THREE.Object3D,
  norm: ModelNormalization,
): THREE.Box3 {
  const rawBox = measureGeneratedModel(object);
  const out = new THREE.Box3();
  const corner = new THREE.Vector3();
  for (let i = 0; i < 8; i++) {
    corner.set(
      i & 1 ? rawBox.max.x : rawBox.min.x,
      i & 2 ? rawBox.max.y : rawBox.min.y,
      i & 4 ? rawBox.max.z : rawBox.min.z,
    );
    corner.multiplyScalar(norm.scale).applyQuaternion(norm.quaternion).add(norm.position);
    out.expandByPoint(corner);
  }
  return out;
}

export interface PoleAnalysis {
  /** Pole axis position (normalized space) — anchor the model here. */
  poleX: number;
  poleZ: number;
  /** Lamp-arm tip in normalized space; equals the pole top for armless poles. */
  tip: THREE.Vector3;
  /** True when a clear horizontal arm was detected. */
  hasArm: boolean;
}

/**
 * Measures a lamp-post style model AFTER normalization: the averaged bottom
 * slice of vertices gives the pole axis (base plate), and the farthest
 * horizontal vertex in the upper half gives the arm tip. Lets placement code
 * anchor the pole exactly and aim the arm without trusting authored axes
 * (generated poles are classified directionless).
 */
export function analyzePoleModel(object: THREE.Object3D, norm: ModelNormalization): PoleAnalysis {
  object.updateMatrixWorld(true);
  const rootInverse = object.matrixWorld.clone().invert();
  const toRoot = new THREE.Matrix4();
  const v = new THREE.Vector3();
  const pts: THREE.Vector3[] = [];
  object.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const posAttr = mesh.geometry.getAttribute("position") as THREE.BufferAttribute | undefined;
    if (!posAttr) return;
    toRoot.multiplyMatrices(rootInverse, mesh.matrixWorld);
    const stride = Math.max(1, Math.floor(posAttr.count / 2500));
    for (let i = 0; i < posAttr.count; i += stride) {
      v.fromBufferAttribute(posAttr, i).applyMatrix4(toRoot);
      v.multiplyScalar(norm.scale).applyQuaternion(norm.quaternion).add(norm.position);
      pts.push(v.clone());
    }
  });
  if (pts.length === 0) {
    return { poleX: 0, poleZ: 0, tip: new THREE.Vector3(0, 1, 0), hasArm: false };
  }
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const h = Math.max(0.001, maxY - minY);

  let poleX = 0;
  let poleZ = 0;
  let baseCount = 0;
  for (let band = 0.1; band <= 0.3 && baseCount < 8; band += 0.1) {
    poleX = 0;
    poleZ = 0;
    baseCount = 0;
    for (const p of pts) {
      if (p.y <= minY + h * band) {
        poleX += p.x;
        poleZ += p.z;
        baseCount += 1;
      }
    }
  }
  if (baseCount > 0) {
    poleX /= baseCount;
    poleZ /= baseCount;
  }

  const tip = new THREE.Vector3(poleX, maxY, poleZ);
  let bestDist = 0;
  for (const p of pts) {
    if (p.y < minY + h * 0.5) continue;
    const dx = p.x - poleX;
    const dz = p.z - poleZ;
    const d = dx * dx + dz * dz;
    if (d > bestDist) {
      bestDist = d;
      tip.copy(p);
    }
  }
  return { poleX, poleZ, tip, hasArm: Math.sqrt(bestDist) > h * 0.08 };
}

/**
 * Normalization for directionless elongated models (garden strips, planters):
 * the LONGEST horizontal extent is measured from the mesh and rotated to run
 * along world Z, scaled to `targetLength`, centered on X/Z and grounded on Y.
 * Robust regardless of authored front-axis metadata. `flip180` adds a half
 * turn about Y for callers that resolve the front end from mesh landmarks.
 */
export function computeLongAxisNormalization(
  object: THREE.Object3D,
  targetLength: number,
  flip180 = false,
): ModelNormalization {
  const rawBox = measureGeneratedModel(object);
  const rawSize = rawBox.getSize(new THREE.Vector3());
  const longest = Math.max(rawSize.x, rawSize.z);
  const scale = longest > 0.0001 ? targetLength / longest : 1;
  const quaternion =
    rawSize.x > rawSize.z
      ? new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2)
      : new THREE.Quaternion();
  if (flip180) {
    quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI));
  }
  const transformed = new THREE.Box3();
  const corner = new THREE.Vector3();
  for (let i = 0; i < 8; i++) {
    corner.set(
      i & 1 ? rawBox.max.x : rawBox.min.x,
      i & 2 ? rawBox.max.y : rawBox.min.y,
      i & 4 ? rawBox.max.z : rawBox.min.z,
    );
    corner.multiplyScalar(scale).applyQuaternion(quaternion);
    transformed.expandByPoint(corner);
  }
  const center = transformed.getCenter(new THREE.Vector3());
  return {
    scale,
    quaternion,
    position: new THREE.Vector3(-center.x, -transformed.min.y, -center.z),
  };
}

/**
 * Finds the Z (normalized space) of the widest point in the model's upper
 * band. On a bicycle the flat handlebar is far wider than the saddle, so this
 * reliably marks the FRONT end — used to resolve facing for two-wheelers
 * whose generation reported no intrinsic front axis.
 */
export function analyzeHandlebarZ(object: THREE.Object3D, norm: ModelNormalization): number {
  object.updateMatrixWorld(true);
  const rootInverse = object.matrixWorld.clone().invert();
  const toRoot = new THREE.Matrix4();
  const v = new THREE.Vector3();
  const pts: THREE.Vector3[] = [];
  object.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const posAttr = mesh.geometry.getAttribute("position") as THREE.BufferAttribute | undefined;
    if (!posAttr) return;
    toRoot.multiplyMatrices(rootInverse, mesh.matrixWorld);
    const stride = Math.max(1, Math.floor(posAttr.count / 3000));
    for (let i = 0; i < posAttr.count; i += stride) {
      v.fromBufferAttribute(posAttr, i).applyMatrix4(toRoot);
      v.multiplyScalar(norm.scale).applyQuaternion(norm.quaternion).add(norm.position);
      pts.push(v.clone());
    }
  });
  if (pts.length === 0) return 0;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const band = minY + (maxY - minY) * 0.6;
  let bestX = 0;
  let bestZ = 0;
  for (const p of pts) {
    if (p.y < band) continue;
    const ax = Math.abs(p.x);
    if (ax > bestX) {
      bestX = ax;
      bestZ = p.z;
    }
  }
  return bestZ;
}

/**
 * Computes the one-time normalization for a generated model per the placement
 * contract: scale to a target dimension, orientation correction, then center
 * X/Z and ground Y (all applied to a single wrapper group).
 */
export function computeModelNormalization(options: {
  object: THREE.Object3D;
  localFrontAxis: GeneratedModelAxis;
  localUpAxis: GeneratedModelAxis;
  desiredWorldForward: THREE.Vector3;
  /** Which raw-box dimension drives the scale factor. */
  sizeMode: "height" | "frontLength";
  targetSize: number;
  /** Vertical anchoring of the result. */
  anchor?: "ground" | "center";
}): ModelNormalization {
  const rawBox = measureGeneratedModel(options.object);
  const rawSize = rawBox.getSize(new THREE.Vector3());

  let driving: number;
  if (options.sizeMode === "height") {
    driving = rawSize.y;
  } else {
    const frontVec = GENERATED_MODEL_AXIS_VECTORS[options.localFrontAxis];
    driving = Math.abs(rawSize.x * frontVec.x) + Math.abs(rawSize.y * frontVec.y) + Math.abs(rawSize.z * frontVec.z);
  }
  const scale = driving > 0.0001 ? options.targetSize / driving : 1;

  const quaternion = generatedModelOrientationCorrection({
    localFrontAxis: options.localFrontAxis,
    localUpAxis: options.localUpAxis,
    desiredWorldForward: options.desiredWorldForward,
  });

  const transformed = new THREE.Box3();
  const corner = new THREE.Vector3();
  for (let i = 0; i < 8; i++) {
    corner.set(
      i & 1 ? rawBox.max.x : rawBox.min.x,
      i & 2 ? rawBox.max.y : rawBox.min.y,
      i & 4 ? rawBox.max.z : rawBox.min.z,
    );
    corner.multiplyScalar(scale).applyQuaternion(quaternion);
    transformed.expandByPoint(corner);
  }
  const center = transformed.getCenter(new THREE.Vector3());
  const y = options.anchor === "center" ? -center.y : -transformed.min.y;
  return { scale, quaternion, position: new THREE.Vector3(-center.x, y, -center.z) };
}
