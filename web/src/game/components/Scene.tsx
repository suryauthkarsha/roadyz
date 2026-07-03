import { Suspense, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { runtime, updateRuntime } from "../runtime";
import { CityScape, nightMaterials } from "./CityScape";
import { EntityPools } from "./EntityPools";
import { NpcCrowd } from "./Npcs";
import { PlayerRig } from "./PlayerRig";
import { SignalCrossing } from "./SignalCrossing";
import { SkyDome } from "./SkyDome";
import { MAX_SPEED } from "../constants";

interface LightStop {
  t: number;
  sky: string;
  horizon: string;
  sun: string;
  sunIntensity: number;
  ambient: number;
  night: number;
}

/**
 * Daylight owns ~70% of the cycle: a short dawn, a long bright plateau, a
 * late golden hour, and a brief night before sunrise returns. Paired with
 * DAY_CYCLE_SECONDS this keeps the sky bright for minutes at a time.
 */
const STOPS: LightStop[] = [
  { t: 0.0, sky: "#ffb27d", horizon: "#ffd9a0", sun: "#ffbb77", sunIntensity: 1.1, ambient: 0.55, night: 0.15 },
  { t: 0.1, sky: "#7fc2f2", horizon: "#dceefc", sun: "#fff6e0", sunIntensity: 1.7, ambient: 0.95, night: 0 },
  { t: 0.42, sky: "#82bdf0", horizon: "#e3f0fb", sun: "#fff3d6", sunIntensity: 1.65, ambient: 0.92, night: 0 },
  { t: 0.58, sky: "#8fb8e8", horizon: "#f7e3bd", sun: "#ffedc4", sunIntensity: 1.4, ambient: 0.85, night: 0 },
  { t: 0.68, sky: "#f2925c", horizon: "#ffc98a", sun: "#ff9d4d", sunIntensity: 1.0, ambient: 0.6, night: 0.2 },
  { t: 0.76, sky: "#3d3566", horizon: "#8a5a7a", sun: "#8a7ab8", sunIntensity: 0.45, ambient: 0.4, night: 0.7 },
  { t: 0.84, sky: "#0b1026", horizon: "#1d2440", sun: "#7a8fc4", sunIntensity: 0.22, ambient: 0.3, night: 1 },
  { t: 0.94, sky: "#0b1026", horizon: "#1d2440", sun: "#7a8fc4", sunIntensity: 0.22, ambient: 0.3, night: 1 },
  { t: 1.0, sky: "#ffb27d", horizon: "#ffd9a0", sun: "#ffbb77", sunIntensity: 1.1, ambient: 0.55, night: 0.15 },
];

function sampleStops(t: number, outA: THREE.Color, outB: THREE.Color, outSun: THREE.Color) {
  let i = 0;
  while (i < STOPS.length - 2 && STOPS[i + 1].t < t) i++;
  const a = STOPS[i];
  const b = STOPS[i + 1];
  const f = THREE.MathUtils.clamp((t - a.t) / Math.max(0.0001, b.t - a.t), 0, 1);
  outA.set(a.sky).lerp(new THREE.Color(b.sky), f);
  outB.set(a.horizon).lerp(new THREE.Color(b.horizon), f);
  outSun.set(a.sun).lerp(new THREE.Color(b.sun), f);
  return {
    sunIntensity: THREE.MathUtils.lerp(a.sunIntensity, b.sunIntensity, f),
    ambient: THREE.MathUtils.lerp(a.ambient, b.ambient, f),
    night: THREE.MathUtils.lerp(a.night, b.night, f),
  };
}

export function Scene() {
  const { scene, camera } = useThree();
  const sunRef = useRef<THREE.DirectionalLight>(null);
  const hemiRef = useRef<THREE.HemisphereLight>(null);
  const skyColor = useMemo(() => new THREE.Color(), []);
  const horizonColor = useMemo(() => new THREE.Color(), []);
  const sunColor = useMemo(() => new THREE.Color(), []);
  const fog = useMemo(() => new THREE.Fog("#8fb8e8", 40, 205), []);
  const lookTarget = useMemo(() => new THREE.Vector3(), []);
  const camRoll = useRef(0);
  const prevPlayerX = useRef(0);
  /** 0→1 blend into the Footpath Mode follow rig. */
  const footBlend = useRef(0);

  useFrame((_, dt) => {
    updateRuntime(dt);

    const sample = sampleStops(runtime.dayT, skyColor, horizonColor, sunColor);
    runtime.night = sample.night;

    scene.background = skyColor;
    scene.fog = fog;
    fog.color.copy(horizonColor).lerp(skyColor, 0.5);
    fog.near = 48 - sample.night * 14;
    fog.far = 205 - sample.night * 55;

    if (sunRef.current) {
      sunRef.current.color.copy(sunColor);
      sunRef.current.intensity = sample.sunIntensity;
      sunRef.current.position.set(14, 22 - sample.night * 8, 8);
    }
    if (hemiRef.current) {
      hemiRef.current.intensity = sample.ambient;
      hemiRef.current.color.copy(skyColor);
    }

    nightMaterials.lampHead.emissiveIntensity = sample.night * 2.4;
    nightMaterials.headlight.emissiveIntensity = 0.5 + sample.night * 2.8;
    nightMaterials.taillight.emissiveIntensity = 0.6 + sample.night * 1.6;
    nightMaterials.lampGlow.opacity = sample.night * 0.85;

    const p = runtime.player;
    const speedNorm = runtime.speed / MAX_SPEED;
    const shakeX = (Math.random() - 0.5) * runtime.shake * 0.4;
    const shakeY = (Math.random() - 0.5) * runtime.shake * 0.3;

    let rollTarget = 0;

    if (runtime.phase === "menu") {
      const t = performance.now() / 1000;
      footBlend.current = 0;
      camera.position.x += (Math.sin(t * 0.18) * 3.6 - camera.position.x) * Math.min(1, 2.5 * dt);
      camera.position.y += (3.15 + Math.sin(t * 0.4) * 0.25 - camera.position.y) * Math.min(1, 2.5 * dt);
      camera.position.z += (8.2 - camera.position.z) * Math.min(1, 2.5 * dt);
      lookTarget.set(-1, 1.6, -10);
    } else {
      // Dynamic chase camera: hugs the runner's lane, banks into lane
      // changes, bobs with footfalls, dips on slides and drops low + tight
      // during Cycle Sprint for a speed rush.
      const cycle = runtime.power.type === "cycle";
      // Footpath Mode rig: the camera swings to the boy's road side and
      // tracks him 1:1 from over the open carriageway edge, so the kerbside
      // tree canopies never sit between the lens and him.
      footBlend.current +=
        ((runtime.power.type === "footpath" ? 1 : 0) - footBlend.current) * Math.min(1, 3.4 * dt);
      const fb = footBlend.current;
      const vx = dt > 0 ? (p.x - prevPlayerX.current) / dt : 0;
      const grounded = !p.jumping;
      const bob = grounded && runtime.phase === "playing" ? Math.sin(runtime.distance * 1.85) * 0.042 * (0.35 + speedNorm) : 0;
      const slideDip = p.slideTimer > 0 && grounded ? 0.55 : 0;
      const targetY = 4.65 + p.y * 0.3 + bob - slideDip - (cycle ? 0.5 : 0) - fb * 0.55;
      const targetZ = 7.9 + speedNorm * 0.9 - (cycle ? 0.85 : 0) - fb * 0.6;
      const camX = THREE.MathUtils.lerp(p.x * 0.86, p.x - 2.7, fb);

      camera.position.x += (camX + shakeX - camera.position.x) * Math.min(1, (9.5 + fb * 3) * dt);
      camera.position.y += (targetY + shakeY - camera.position.y) * Math.min(1, 7 * dt);
      camera.position.z += (targetZ - camera.position.z) * Math.min(1, 3.5 * dt);
      lookTarget.set(
        THREE.MathUtils.lerp(p.x * 0.94, p.x + 0.3, fb),
        1.3 + p.y * 0.5 + fb * 0.2,
        -10.5 - speedNorm * 5,
      );
      rollTarget = THREE.MathUtils.clamp(vx * 0.014, -0.085, 0.085);
    }

    camRoll.current += (rollTarget - camRoll.current) * Math.min(1, 6 * dt);
    prevPlayerX.current = p.x;
    camera.lookAt(lookTarget);
    camera.rotateZ(camRoll.current);

    const cam = camera as THREE.PerspectiveCamera;
    const targetFov =
      57 + speedNorm * 15 + (runtime.power.type === "cycle" ? 7 : 0) + (runtime.rushOn ? 6 : 0);
    if (Math.abs(cam.fov - targetFov) > 0.05) {
      cam.fov += (targetFov - cam.fov) * Math.min(1, 4 * dt);
      cam.updateProjectionMatrix();
    }
  });

  return (
    <>
      <hemisphereLight ref={hemiRef} args={["#bcd7f5", "#57534e", 0.9]} />
      <directionalLight
        ref={sunRef}
        position={[14, 22, 8]}
        intensity={1.6}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-22}
        shadow-camera-right={22}
        shadow-camera-top={22}
        shadow-camera-bottom={-18}
        shadow-camera-far={70}
        shadow-bias={-0.0003}
        shadow-normalBias={0.02}
      />
      <Suspense fallback={null}>
        <SkyDome />
      </Suspense>
      <CityScape />
      <EntityPools />
      <SignalCrossing />
      <NpcCrowd />
      <PlayerRig />
    </>
  );
}
