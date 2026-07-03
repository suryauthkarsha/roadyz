import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import { Scene } from "./Scene";

/** Full-screen 3D game canvas. */
export function GameCanvas() {
  return (
    <Canvas
      shadows
      dpr={[1, 1.75]}
      camera={{ fov: 57, near: 0.1, far: 340, position: [0, 5, 7.8] }}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}
      className="absolute inset-0"
      style={{ touchAction: "none" }}
    >
      <Scene />
    </Canvas>
  );
}
