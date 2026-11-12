import { useMemo } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { useVideoConfig } from "remotion";
import { project } from "./config.js";

/**
 * Shared tools for scenes that take place on the 3D Eurasia map:
 * camera keyframes, the camera rig, projecting 3D points to the screen,
 * soft clouds and the cream callout labels.
 */

type HeightFn = (lon: number, lat: number) => number;
const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "'Avenir Next', 'Helvetica Neue', Helvetica, Arial, sans-serif";
const GOLD = "#ffc94d";

export type Key = { f: number; lon: number; lat: number; z: number; dist: number; tilt: number; turn: number; ease?: (t: number) => number };
export type Pose = { position: THREE.Vector3; target: THREE.Vector3; dist: number };

export const poseAt = (frame: number, keys: Key[]): Pose => {
  let a = keys[0], b = keys[0], t = 0;
  for (let i = 0; i < keys.length - 1; i++) {
    if (frame >= keys[i].f && frame <= keys[i + 1].f) {
      a = keys[i];
      b = keys[i + 1];
      t = (b.ease ?? ((x: number) => x))((frame - a.f) / (b.f - a.f));
      break;
    }
    if (frame > keys[keys.length - 1].f) a = b = keys[keys.length - 1];
  }
  const lerp = (x: number, y: number) => x + (y - x) * t;
  const [ax, ay] = project(a.lon, a.lat);
  const [bx, by] = project(b.lon, b.lat);
  const target = new THREE.Vector3(lerp(ax, bx), lerp(ay, by), lerp(a.z, b.z));
  const dist = Math.exp(lerp(Math.log(a.dist), Math.log(b.dist)));
  const tilt = (lerp(a.tilt, b.tilt) * Math.PI) / 180;
  const turn = (lerp(a.turn, b.turn) * Math.PI) / 180;
  const offset = new THREE.Vector3(0, -dist * Math.sin(tilt), dist * Math.cos(tilt)).applyAxisAngle(new THREE.Vector3(0, 0, 1), turn);
  return { position: target.clone().add(offset), target, dist };
};

export const FOV = 30;

export const CameraRig: React.FC<{ pose: Pose }> = ({ pose }) => {
  const { camera } = useThree();
  camera.up.set(0, 0, 1);
  camera.position.copy(pose.position);
  camera.lookAt(pose.target);
  (camera as THREE.PerspectiveCamera).near = Math.max(0.05, pose.dist * 0.01);
  (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
  return null;
};

/** Screen position of world points for this frame's camera. */
export const useProjector = (pose: Pose) => {
  const { width, height } = useVideoConfig();
  return useMemo(() => {
    const cam = new THREE.PerspectiveCamera(FOV, width / height, 0.05, 3000);
    cam.up.set(0, 0, 1);
    cam.position.copy(pose.position);
    cam.lookAt(pose.target);
    cam.updateMatrixWorld();
    return (p: THREE.Vector3) => {
      const v = p.clone().project(cam);
      return { x: ((v.x + 1) / 2) * width, y: ((1 - v.y) / 2) * height, visible: v.z < 1 };
    };
  }, [pose, width, height]);
};

export const worldAt = (h: HeightFn, lon: number, lat: number, lift = 0) => {
  const [x, y] = project(lon, lat);
  return new THREE.Vector3(x, y, h(lon, lat) + lift);
};

export const CLOUD_FRAG = /* glsl */ `
uniform float uOpacity;
uniform float uSeed;
varying vec2 vUv;
float hash2(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), u.x), mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * vnoise(p); p *= 2.1; a *= 0.5; } return s; }
void main() {
  vec2 q = vUv - 0.5;
  float d = length(q * vec2(1.0, 1.35)) * 2.0;
  float n = fbm(vUv * 3.5 + uSeed);
  float a = smoothstep(1.0, 0.35, d + (n - 0.5) * 0.9) * uOpacity;
  vec3 col = mix(vec3(0.80, 0.85, 0.92), vec3(1.0), smoothstep(0.2, 0.75, n + vUv.y * 0.3));
  gl_FragColor = vec4(col, a);
  #include <colorspace_fragment>
}`;

export const Cloud: React.FC<{ position: THREE.Vector3; size: number; seed: number; opacity: number }> = ({ position, size, seed, opacity }) => {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uOpacity: { value: 0 }, uSeed: { value: seed } },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: CLOUD_FRAG,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    [seed],
  );
  material.uniforms.uOpacity.value = opacity;
  if (opacity <= 0.005) return null;
  return (
    <group position={position}>
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[i * size * 0.12 - size * 0.12, (i - 1) * size * 0.05, i * 0.25]} material={material}>
          <planeGeometry args={[size * (1 - i * 0.15), size * 0.75 * (1 - i * 0.15)]} />
        </mesh>
      ))}
    </group>
  );
};

export const Label: React.FC<{ x: number; y: number; title: string; sub?: string; s: number; lift?: number; dot?: boolean; small?: boolean }> = ({
  x, y, title, sub, s, lift = 60, dot = true, small,
}) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      transform: `translate(-50%, -100%) scale(${s})`,
      transformOrigin: "50% 100%",
      opacity: Math.min(1, s * 1.4),
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      pointerEvents: "none",
    }}
  >
    <div
      style={{
        padding: small ? "6px 16px" : "10px 22px",
        borderRadius: 999,
        background: "rgba(255, 248, 235, 0.95)",
        color: "#3a1a10",
        fontFamily: SERIF,
        fontSize: small ? 26 : 34,
        boxShadow: "0 8px 30px rgba(0,0,0,0.35), 0 0 0 3px rgba(255,201,77,0.6)",
        whiteSpace: "nowrap",
        textAlign: "center",
        lineHeight: 1.15,
      }}
    >
      <b>{title}</b>
      {sub && <div style={{ fontFamily: SANS, fontSize: small ? 18 : 22, opacity: 0.75, marginTop: 2 }}>{sub}</div>}
    </div>
    <div style={{ width: 3, height: lift, background: "linear-gradient(rgba(255,248,235,0.95), rgba(255,201,77,0.9))" }} />
    {dot && (
      <div style={{ width: 16, height: 16, borderRadius: "50%", background: GOLD, boxShadow: "0 0 18px 6px rgba(255,201,77,0.7)", marginTop: -8 }} />
    )}
  </div>
);

