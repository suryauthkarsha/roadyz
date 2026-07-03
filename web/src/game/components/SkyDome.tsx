import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useLoader } from "@react-three/fiber";
import { runtime } from "../runtime";
import { IMAGE_URLS } from "../assets";

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAG = /* glsl */ `
uniform sampler2D dayTex;
uniform sampler2D duskTex;
uniform sampler2D nightTex;
uniform float duskMix;
uniform float nightMix;
uniform float brightness;
varying vec2 vUv;
void main() {
  vec3 day = texture2D(dayTex, vUv).rgb;
  vec3 dusk = texture2D(duskTex, vUv).rgb;
  vec3 night = texture2D(nightTex, vUv).rgb;
  vec3 col = mix(mix(day, dusk, duskMix), night, nightMix);
  gl_FragColor = vec4(col * brightness, 1.0);
}
`;

/** Smooth 0..1 bump centered at c with half-width w. */
function bump(t: number, c: number, w: number): number {
  const v = Math.max(0, 1 - Math.abs(t - c) / w);
  return v * v * (3 - 2 * v);
}

/**
 * Photoreal sky: three generated equirectangular panoramas (day / golden hour /
 * night) crossfaded on a giant inward-facing sphere following runtime.dayT.
 * Drifts slowly for cloud motion. Fog never touches it, so the horizon haze
 * baked into the panoramas reads as real atmospheric depth.
 */
export function SkyDome() {
  const meshRef = useRef<THREE.Mesh>(null);
  const [dayTex, duskTex, nightTex] = useLoader(THREE.TextureLoader, [
    IMAGE_URLS.skyDay,
    IMAGE_URLS.skySunset,
    IMAGE_URLS.skyNight,
  ]);

  const material = useMemo(() => {
    [dayTex, duskTex, nightTex].forEach((tex) => {
      tex.wrapS = THREE.RepeatWrapping;
      tex.mapping = THREE.EquirectangularReflectionMapping;
      tex.anisotropy = 4;
    });
    return new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        dayTex: { value: dayTex },
        duskTex: { value: duskTex },
        nightTex: { value: nightTex },
        duskMix: { value: 0 },
        nightMix: { value: 0 },
        brightness: { value: 1 },
      },
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
  }, [dayTex, duskTex, nightTex]);

  useFrame((_, dt) => {
    const t = runtime.dayT;
    const night = runtime.night;
    // Golden-hour panorama peaks with the late-cycle sunset stop.
    const dusk = Math.max(bump(t, 0.71, 0.08), bump(t, 0, 0.06), bump(t, 1, 0.06));
    material.uniforms.duskMix.value = dusk;
    material.uniforms.nightMix.value = night;
    material.uniforms.brightness.value = 1 - night * 0.12;
    if (meshRef.current) meshRef.current.rotation.y += dt * 0.0022;
  });

  return (
    <mesh ref={meshRef} material={material} frustumCulled={false} renderOrder={-10} rotation={[0, Math.PI, 0]}>
      <sphereGeometry args={[315, 48, 32]} />
    </mesh>
  );
}
