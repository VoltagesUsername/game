import { useMemo } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { ThreeCanvas } from "@remotion/three";
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { EurasiaMap, SUN, useHeightSampler, useMapTextures } from "./map/EurasiaMap";
import { MAP_H, MAP_W, WAVES, project } from "./map/config.js";
import { Glow, seeded } from "./SteppeNight";

/**
 * Scene 3 - Base & geographic reach (1:10-1:50, 40 s)
 *   Part A 0-15 s   Drop through clouds onto the map, zoom sharply into the Mongolian
 *                   steppe. A pin drops on Karakorum (a little 3D city model).
 *   Part B 15-30 s  Pull back to the whole empire at its height; callouts pop up.
 *   Part C 30-40 s  Dashed routes draw from Karakorum to Beijing, Baghdad and Moscow,
 *                   with pulses travelling along them.
 * Ends on the full map (no fade) so Scene 4 can continue on the same map.
 */

export const SCENE3_FRAMES = 1200;
const PART_B = 450;
const PART_C = 900;
const PIN = 205; // pin lands on Karakorum

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "'Avenir Next', 'Helvetica Neue', Helvetica, Arial, sans-serif";
const CREAM = "#fffaf0";
const GOLD = "#ffc94d";

const KARAKORUM: [number, number] = [102.8, 47.2];

type HeightFn = (lon: number, lat: number) => number;

// ======================================================================
// Camera
// ======================================================================

type Key = { f: number; lon: number; lat: number; z: number; dist: number; tilt: number; turn: number; ease?: (t: number) => number };
type Pose = { position: THREE.Vector3; target: THREE.Vector3; dist: number };

const makeKeys = (kz: number): Key[] => [
  { f: 0, lon: 80, lat: 44, z: 0, dist: 245, tilt: 26, turn: -8 },
  { f: 45, lon: 82, lat: 44.5, z: 0, dist: 228, tilt: 29, turn: -7 },
  { f: PIN, lon: KARAKORUM[0], lat: KARAKORUM[1] + 0.2, z: kz + 0.2, dist: 11.5, tilt: 46, turn: -28, ease: Easing.inOut(Easing.cubic) },
  { f: PART_B, lon: KARAKORUM[0] + 0.3, lat: KARAKORUM[1] + 0.2, z: kz + 0.2, dist: 10.2, tilt: 49, turn: 12, ease: Easing.inOut(Easing.sin) },
  { f: 690, lon: 76, lat: 43.5, z: 0, dist: 165, tilt: 38, turn: 2, ease: Easing.inOut(Easing.cubic) },
  { f: PART_C, lon: 76, lat: 43.5, z: 0, dist: 157, tilt: 38, turn: 5, ease: Easing.inOut(Easing.sin) },
  { f: SCENE3_FRAMES, lon: 78, lat: 45, z: 0, dist: 138, tilt: 44, turn: 9, ease: Easing.inOut(Easing.sin) },
];

const poseAt = (frame: number, keys: Key[]): Pose => {
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

const FOV = 30;

const CameraRig: React.FC<{ pose: Pose }> = ({ pose }) => {
  const { camera } = useThree();
  camera.up.set(0, 0, 1);
  camera.position.copy(pose.position);
  camera.lookAt(pose.target);
  (camera as THREE.PerspectiveCamera).near = Math.max(0.05, pose.dist * 0.01);
  (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
  return null;
};

/** Screen position of world points for this frame's camera. */
const useProjector = (pose: Pose) => {
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

const worldAt = (h: HeightFn, lon: number, lat: number, lift = 0) => {
  const [x, y] = project(lon, lat);
  return new THREE.Vector3(x, y, h(lon, lat) + lift);
};

// ======================================================================
// Clouds
// ======================================================================

const CLOUD_FRAG = /* glsl */ `
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

const Cloud: React.FC<{ position: THREE.Vector3; size: number; seed: number; opacity: number }> = ({ position, size, seed, opacity }) => {
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

/** Clouds around Mongolia (the camera dives through them) plus a few over the whole map. */
const Clouds: React.FC<{ frame: number; pose: Pose }> = ({ frame, pose }) => {
  const clouds = useMemo(() => {
    const r = seeded(303);
    const [kx, ky] = project(...KARAKORUM);
    const near = Array.from({ length: 11 }, () => ({
      base: new THREE.Vector3(kx + (r() - 0.5) * 34, ky - 6 + (r() - 0.5) * 26, 6 + r() * 12),
      size: 9 + r() * 9,
      seed: r() * 50,
      high: false,
    }));
    const far = Array.from({ length: 8 }, () => ({
      base: new THREE.Vector3((r() - 0.5) * MAP_W * 0.9, (r() - 0.5) * MAP_H * 0.8, 14 + r() * 8),
      size: 16 + r() * 14,
      seed: r() * 50,
      high: true,
    }));
    return [...near, ...far];
  }, []);
  return (
    <>
      {clouds.map((c, i) => {
        const p = c.base.clone().add(new THREE.Vector3(frame * 0.012, frame * 0.004, 0));
        const camDist = p.distanceTo(pose.position);
        // fade clouds that are right in front of the lens, and thin them out in close-ups
        let o = (c.high ? 0.35 : 0.85) * interpolate(camDist, [2, 9], [0, 1], clamp);
        if (c.high) o *= interpolate(pose.dist, [60, 140], [0, 1], clamp);
        else o *= interpolate(pose.dist, [14, 28, 110, 170], [0, 1, 1, 0], clamp);
        return <Cloud key={i} position={p} size={c.size} seed={c.seed} opacity={o} />;
      })}
    </>
  );
};

// ======================================================================
// Karakorum: a small 3D model of the capital
// ======================================================================

const Box: React.FC<{ p: [number, number, number]; s: [number, number, number]; color: string; rot?: number }> = ({ p, s, color, rot = 0 }) => (
  <mesh position={[p[0], p[1], p[2] + s[2] / 2]} rotation={[0, 0, rot]}>
    <boxGeometry args={s} />
    <meshLambertMaterial color={color} />
  </mesh>
);

/** Four-sided hip roof. */
const Roof: React.FC<{ p: [number, number, number]; w: number; h: number; color: string }> = ({ p, w, h, color }) => (
  <mesh position={[p[0], p[1], p[2] + h / 2]} rotation={[Math.PI / 2, Math.PI / 4, 0]}>
    <coneGeometry args={[w * 0.75, h, 4]} />
    <meshLambertMaterial color={color} />
  </mesh>
);

const Yurt: React.FC<{ p: [number, number, number]; r: number }> = ({ p, r }) => (
  <group position={p}>
    <mesh position={[0, 0, r * 0.4]} rotation={[Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[r, r, r * 0.8, 14]} />
      <meshLambertMaterial color="#f3ece0" />
    </mesh>
    <mesh position={[0, 0, r * 0.8 + r * 0.3]} rotation={[Math.PI / 2, 0, 0]}>
      <coneGeometry args={[r * 1.05, r * 0.6, 14]} />
      <meshLambertMaterial color="#e2d6c2" />
    </mesh>
    <mesh position={[0, -r * 0.98, r * 0.28]}>
      <planeGeometry args={[r * 0.45, r * 0.55]} />
      <meshBasicMaterial color="#b8322a" />
    </mesh>
  </group>
);

const KarakorumModel: React.FC<{ frame: number; z: number; appear: number }> = ({ frame, z, appear }) => {
  const [kx, ky] = project(...KARAKORUM);
  const yurts = useMemo(() => {
    const r = seeded(91);
    return Array.from({ length: 34 }, () => {
      const a = r() * Math.PI * 2;
      const d = 0.62 + r() * 0.5;
      return { x: Math.cos(a) * d * 1.15, y: Math.sin(a) * d, r: 0.028 + r() * 0.012 };
    }).filter((y) => !(Math.abs(y.x) < 0.5 && Math.abs(y.y) < 0.42));
  }, []);
  const buildings = useMemo(() => {
    const r = seeded(17);
    return Array.from({ length: 16 }, () => ({
      x: -0.32 + r() * 0.5, y: -0.2 + r() * 0.42, w: 0.05 + r() * 0.04, d: 0.04 + r() * 0.03,
      roof: ["#6b5a4a", "#7a3a2a", "#4a5a6a"][Math.floor(r() * 3)],
    })).filter((b) => !(b.x < -0.1 && b.y < -0.05)); // leave room for the palace
  }, []);
  const s = 2.0 * appear;
  if (s <= 0.01) return null;
  const wall = "#d6b98c";
  const W = 0.46, H = 0.34, T = 0.025, WH = 0.06;
  return (
    <group position={[kx, ky, z - 0.055]} scale={[s, s, s]}>
      {/* packed-earth ground the city sits on */}
      <mesh position={[0, 0, 0.062]}>
        <planeGeometry args={[W * 2 + 0.1, H * 2 + 0.1]} />
        <meshLambertMaterial color="#c8b48a" />
      </mesh>
      {/* walls + corner towers + gates */}
      <Box p={[0, H, 0.06]} s={[W * 2, T, WH]} color={wall} />
      <Box p={[0, -H, 0.06]} s={[W * 2, T, WH]} color={wall} />
      <Box p={[W, 0, 0.06]} s={[T, H * 2, WH]} color={wall} />
      <Box p={[-W, 0, 0.06]} s={[T, H * 2, WH]} color={wall} />
      {[[-W, -H], [W, -H], [-W, H], [W, H]].map(([x, y], i) => (
        <Box key={i} p={[x, y, 0.06]} s={[0.06, 0.06, WH * 1.6]} color="#c9a978" />
      ))}
      {[[0, -H], [0, H], [-W, 0], [W, 0]].map(([x, y], i) => (
        <group key={i}>
          <Box p={[x, y, 0.06]} s={[0.09, 0.07, WH * 1.9]} color="#c9a978" />
          <Roof p={[x, y, 0.06 + WH * 1.9]} w={0.09} h={0.05} color="#7a3a2a" />
        </group>
      ))}
      {/* palace of the Great Khan on a raised platform */}
      <Box p={[-0.24, -0.16, 0.06]} s={[0.24, 0.17, 0.03]} color="#cfc2a8" />
      <Box p={[-0.24, -0.16, 0.09]} s={[0.18, 0.12, 0.07]} color="#a8302a" />
      <Roof p={[-0.24, -0.16, 0.16]} w={0.24} h={0.14} color="#2f7a5a" />
      <Box p={[-0.24, -0.16, 0.3]} s={[0.012, 0.012, 0.05]} color={GOLD} />
      {/* houses and workshops */}
      {buildings.map((b, i) => (
        <group key={i}>
          <Box p={[b.x, b.y, 0.06]} s={[b.w, b.d, 0.04]} color="#efe4cf" />
          <Roof p={[b.x, b.y, 0.1]} w={Math.max(b.w, b.d)} h={0.03} color={b.roof} />
        </group>
      ))}
      {/* temples of different faiths side by side: stupa, mosque, church */}
      <group position={[0.26, 0.2, 0.06]}>
        <mesh position={[0, 0, 0.035]}><sphereGeometry args={[0.035, 16, 12]} /><meshLambertMaterial color="#f7f3ea" /></mesh>
        <mesh position={[0, 0, 0.085]} rotation={[Math.PI / 2, 0, 0]}><coneGeometry args={[0.012, 0.06, 8]} /><meshLambertMaterial color={GOLD} /></mesh>
      </group>
      <group position={[0.06, 0.22, 0.06]}>
        <Box p={[0, 0, 0]} s={[0.07, 0.07, 0.04]} color="#efe4cf" />
        <mesh position={[0, 0, 0.055]}><sphereGeometry args={[0.03, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshLambertMaterial color="#3a9a9a" /></mesh>
        <Box p={[0.045, 0.03, 0]} s={[0.015, 0.015, 0.1]} color="#efe4cf" />
      </group>
      <group position={[0.3, -0.12, 0.06]}>
        <Box p={[0, 0, 0]} s={[0.08, 0.05, 0.045]} color="#e8dcc4" />
        <Roof p={[0, 0, 0.045]} w={0.08} h={0.03} color="#5a4a3a" />
        <Box p={[0.045, 0, 0]} s={[0.025, 0.025, 0.09]} color="#e8dcc4" />
      </group>
      {/* the famous Silver Tree fountain in front of the palace */}
      <mesh position={[-0.05, -0.12, 0.09]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.004, 0.008, 0.06, 6]} />
        <meshLambertMaterial color="#dfe6ee" />
      </mesh>
      <mesh position={[-0.05, -0.12, 0.125]}>
        <sphereGeometry args={[0.018, 10, 8]} />
        <meshLambertMaterial color="#dfe6ee" />
      </mesh>
      {/* ger camps around the walls, with cooking smoke */}
      {yurts.map((y, i) => (
        <Yurt key={i} p={[y.x, y.y, 0.06]} r={y.r} />
      ))}
      {yurts.slice(0, 6).map((y, i) => {
        const t = ((frame * 0.6 + i * 17) % 60) / 60;
        return (
          <mesh key={`s${i}`} position={[y.x + t * 0.05, y.y + t * 0.02, 0.12 + t * 0.18]}>
            <sphereGeometry args={[0.012 + t * 0.03, 8, 6]} />
            <meshBasicMaterial color="#e9e6e0" transparent opacity={0.5 * (1 - t)} depthWrite={false} />
          </mesh>
        );
      })}
    </group>
  );
};

/** Orkhon River running past the capital. */
const OrkhonRiver: React.FC<{ h: HeightFn; appear: number }> = ({ h, appear }) => {
  const geometry = useMemo(() => {
    const [kx, ky] = project(...KARAKORUM);
    const pts = [
      [-2.8, -3.2], [-2.2, -1.9], [-1.75, -0.9], [-1.55, 0.2], [-1.35, 1.3], [-0.9, 2.3], [-0.2, 3.2], [0.8, 4.1], [2.0, 4.8], [3.2, 5.6],
    ].map(([dx, dy]) => {
      const x = kx + dx, y = ky + dy;
      // world -> lon/lat for the height lookup
      const lon = KARAKORUM[0] + dx / Math.cos((40 * Math.PI) / 180);
      const lat = KARAKORUM[1] + dy;
      return new THREE.Vector3(x, y, h(lon, lat) + 0.05);
    });
    const rough = new THREE.CatmullRomCurve3(pts);
    const dense = rough.getSpacedPoints(220).map((q) => {
      const lon = KARAKORUM[0] + (q.x - kx) / Math.cos((40 * Math.PI) / 180);
      const lat = KARAKORUM[1] + (q.y - ky);
      return new THREE.Vector3(q.x, q.y, h(lon, lat) + 0.07);
    });
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(dense), 300, 0.05, 6, false);
  }, [h]);
  if (appear <= 0.01) return null;
  return (
    <mesh geometry={geometry}>
      <meshBasicMaterial color="#5fb4d8" transparent opacity={appear} />
    </mesh>
  );
};

/** Little caravans heading for the capital. */
const Caravans: React.FC<{ frame: number; h: HeightFn; appear: number }> = ({ frame, h, appear }) => {
  const routes = useMemo(
    () =>
      [
        [[6, -4], [3, -2.2], [1.2, -0.9]],
        [[-6, 3], [-3.4, 1.8], [-1.1, 0.6]],
        [[4, 5], [2.2, 2.6], [0.9, 0.9]],
      ].map((r) => new THREE.CatmullRomCurve3(r.map(([dx, dy]) => {
        const [kx, ky] = project(...KARAKORUM);
        const lon = KARAKORUM[0] + dx / Math.cos((40 * Math.PI) / 180);
        return new THREE.Vector3(kx + dx, ky + dy, h(lon, KARAKORUM[1] + dy) + 0.06);
      }))),
    [h],
  );
  if (appear <= 0.01) return null;
  return (
    <>
      {routes.map((curve, i) => (
        <group key={i}>
          {[0, 1, 2, 3].map((j) => {
            const u = (((frame - PIN) * 0.0022 + i * 0.3 - j * 0.025) % 1 + 1) % 1;
            const p = curve.getPointAt(u);
            return (
              <mesh key={j} position={p} scale={appear}>
                <boxGeometry args={[0.06, 0.06, 0.06]} />
                <meshLambertMaterial color={j === 0 ? "#3a2414" : "#8a6a4a"} />
              </mesh>
            );
          })}
        </group>
      ))}
    </>
  );
};

/** Gold map pin that drops onto Karakorum, with ripples on the ground. */
const Pin: React.FC<{ frame: number; base: THREE.Vector3; visible: number }> = ({ frame, base, visible }) => {
  const { fps } = useVideoConfig();
  const drop = spring({ frame: frame - (PIN - 18), fps, config: { damping: 9, stiffness: 140 } });
  if (frame < PIN - 18 || visible <= 0.01) return null;
  const height = 0.9 + (1 - drop) * 6;
  const ripples = [0, 1, 2].map((i) => ((frame - PIN - i * 14) % 42) / 42);
  return (
    <group position={base} scale={visible}>
      {ripples.map((t, i) =>
        frame - PIN - i * 14 >= 0 ? (
          <mesh key={i} position={[0, 0, 0.12]}>
            <ringGeometry args={[0.2 + t * 2.2, 0.26 + t * 2.2, 48]} />
            <meshBasicMaterial color={GOLD} transparent opacity={(1 - t) * 0.8} depthWrite={false} />
          </mesh>
        ) : null,
      )}
      <group position={[0, 0, height]}>
        <mesh position={[0, 0, -0.32]} rotation={[-Math.PI / 2, 0, 0]}>
          <coneGeometry args={[0.13, 0.55, 20]} />
          <meshLambertMaterial color="#e2a92a" />
        </mesh>
        <mesh>
          <sphereGeometry args={[0.2, 24, 18]} />
          <meshLambertMaterial color={GOLD} emissive="#7a4a00" />
        </mesh>
        <mesh position={[0.06, -0.12, 0.08]}>
          <sphereGeometry args={[0.06, 12, 10]} />
          <meshBasicMaterial color="#fff6d8" />
        </mesh>
        <Glow position={[0, 0, 0]} size={1.8} color="#ffd27a" intensity={0.7} falloff={2} />
      </group>
    </group>
  );
};

// ======================================================================
// Part C: routes from Karakorum
// ======================================================================

const ROUTE_FRAG = /* glsl */ `
uniform float uProgress;
uniform float uTime;
varying vec2 vUv;
void main() {
  float along = vUv.x;
  if (along > uProgress) discard;
  float dash = step(0.45, fract(along * 26.0 - uTime * 0.6));
  vec3 col = mix(vec3(1.0, 0.72, 0.25), vec3(1.0, 0.92, 0.6), dash);
  float a = mix(0.35, 1.0, dash);
  gl_FragColor = vec4(col, a);
  #include <colorspace_fragment>
}`;

const CITIES = [
  { name: "Beijing", sub: "Khanbaliq", lon: 116.4, lat: 39.9, start: PART_C + 20 },
  { name: "Baghdad", sub: "", lon: 44.4, lat: 33.3, start: PART_C + 60 },
  { name: "Moscow", sub: "", lon: 37.6, lat: 55.75, start: PART_C + 100 },
];
const ROUTE_LEN = 70;

const routeCurve = (h: HeightFn, lon: number, lat: number) => {
  const a = worldAt(h, ...KARAKORUM, 0.3);
  const b = worldAt(h, lon, lat, 0.3);
  const len = a.distanceTo(b);
  const pts = Array.from({ length: 24 }, (_, i) => {
    const t = i / 23;
    const p = a.clone().lerp(b, t);
    p.z += Math.sin(Math.PI * t) * (2 + len * 0.1);
    return p;
  });
  return new THREE.CatmullRomCurve3(pts);
};

const Routes: React.FC<{ frame: number; h: HeightFn }> = ({ frame, h }) => {
  const routes = useMemo(
    () =>
      CITIES.map((c) => {
        const curve = routeCurve(h, c.lon, c.lat);
        const material = new THREE.ShaderMaterial({
          uniforms: { uProgress: { value: 0 }, uTime: { value: 0 } },
          vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
          fragmentShader: ROUTE_FRAG,
          transparent: true,
          depthWrite: false,
        });
        return { curve, geometry: new THREE.TubeGeometry(curve, 200, 0.2, 8, false), material };
      }),
    [h],
  );
  if (frame < PART_C) return null;
  return (
    <>
      {routes.map((r, i) => {
        const c = CITIES[i];
        const progress = interpolate(frame, [c.start, c.start + ROUTE_LEN], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
        r.material.uniforms.uProgress.value = progress;
        r.material.uniforms.uTime.value = frame / 6;
        if (progress <= 0) return null;
        const end = worldAt(h, c.lon, c.lat, 0.25);
        return (
          <group key={c.name}>
            <mesh geometry={r.geometry} material={r.material} />
            {/* pulses travelling along the finished route */}
            {[0, 1, 2].map((k) => {
              const u = ((frame - c.start) * 0.008 + k / 3) % 1;
              if (u > progress) return null;
              return <Glow key={k} position={r.curve.getPointAt(u).toArray() as [number, number, number]} size={3.2} color="#ffe2a0" intensity={1.1} falloff={1.6} />;
            })}
            {/* city marker */}
            {progress >= 1 && (
              <Glow position={end.toArray() as [number, number, number]} size={6 + Math.sin(frame * 0.2 + i) * 0.8} color="#ffd27a" intensity={1} falloff={1.8} />
            )}
          </group>
        );
      })}
      <Glow position={worldAt(h, ...KARAKORUM, 0.3).toArray() as [number, number, number]} size={7 + Math.sin(frame * 0.15) * 1} color="#ffd27a" intensity={1.1} falloff={1.7} />
    </>
  );
};

// ======================================================================
// HTML labels
// ======================================================================

const Label: React.FC<{ x: number; y: number; title: string; sub?: string; s: number; lift?: number; dot?: boolean; small?: boolean }> = ({
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

const CALLOUTS = [
  { title: "Sea of Japan", sub: "Eastern edge", lon: 135.5, lat: 40.5, f: 600, lift: 46 },
  { title: "Eastern Europe", sub: "Kyiv · Rus' principalities", lon: 30.5, lat: 50.4, f: 650, lift: 30 },
  { title: "China", sub: "", lon: 112, lat: 31, f: 700, lift: 46 },
  { title: "Russia", sub: "", lon: 50, lat: 58.5, f: 740, lift: 60 },
  { title: "Persia", sub: "", lon: 57, lat: 31.5, f: 780, lift: 40 },
  { title: "Middle East", sub: "", lon: 42.5, lat: 33.5, f: 820, lift: 92 },
];

// ======================================================================
// Scene
// ======================================================================

export const Scene3: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const textures = useMapTextures();
  const h = useHeightSampler(textures);

  const kzRaw = h ? h(...KARAKORUM) : 1;
  const kz = kzRaw;
  const [kxw, kyw] = project(...KARAKORUM);
  const FLAT_R = 3.0;
  const flatAmt = interpolate(frame, [PIN - 70, PIN - 25, PART_B + 80, PART_B + 150], [0, 1, 1, 0], clamp);
  // height lookup that matches the flattened valley under the city (used for river, caravans, pin)
  const hFlat = useMemo(() => {
    if (!h) return null;
    return (lon: number, lat: number) => {
      const [x, y] = project(lon, lat);
      const d = Math.hypot(x - kxw, y - kyw);
      const e = Math.min(1, Math.max(0, (d - FLAT_R * 0.55) / (FLAT_R * 0.45)));
      const w = 1 - e * e * (3 - 2 * e);
      return h(lon, lat) * (1 - w) + kz * w;
    };
  }, [h, kz, kxw, kyw]);
  const keys = useMemo(() => makeKeys(kz), [kz]);
  const pose = useMemo(() => poseAt(frame, keys), [frame, keys]);
  const project2D = useProjector(pose);

  const detail = interpolate(pose.dist, [25, 70], [1, 0], clamp);
  const empireOpacity = interpolate(frame, [150, 230, PART_B + 40, 640], [0.66, 0.06, 0.06, 0.66], clamp);
  const borderGlow = interpolate(frame, [560, 620, 860, 900], [0, 1, 1, 0.35], clamp) * (0.75 + 0.25 * Math.sin(frame * 0.12));
  const cityAppear = interpolate(frame, [PIN - 40, PIN - 5], [0, 1], { ...clamp, easing: Easing.out(Easing.back(1.4)) }) *
    interpolate(frame, [PART_B + 60, PART_B + 130], [1, 0], clamp);
  const opening = interpolate(frame, [0, 40], [1, 0], { ...clamp, easing: Easing.out(Easing.quad) });

  // label positions
  const pinWorld = useMemo(() => new THREE.Vector3(kxw, kyw, kz + 1.45), [kxw, kyw, kz]);
  const pinLabel = project2D(pinWorld);
  const pinLabelS = spring({ frame: frame - (PIN + 12), fps, config: { damping: 12 } }) * interpolate(frame, [PART_B - 10, PART_B + 15], [1, 0], clamp);

  return (
    <AbsoluteFill
      style={{ background: "radial-gradient(circle at 12% 8%, #fffbe8 0%, #d9f0ef 14%, #7fc0d6 34%, #3a7fa8 62%, #1d4a6e 100%)" }}
    >
      {textures && h && (
        <ThreeCanvas width={width} height={height} flat camera={{ fov: FOV, near: 0.1, far: 3000 }}>
          <CameraRig pose={pose} />
          <ambientLight intensity={1.1} />
          <directionalLight position={SUN.clone().multiplyScalar(50).toArray()} intensity={1.6} />
          <EurasiaMap
            textures={textures}
            progress={WAVES.length}
            glow={0}
            empireOpacity={empireOpacity}
            detail={detail}
            borderGlow={borderGlow}
            flat={{ x: kxw, y: kyw, radius: FLAT_R, height: kz, amount: flatAmt }}
          />
          <OrkhonRiver h={hFlat!} appear={cityAppear} />
          <KarakorumModel frame={frame} z={kz} appear={cityAppear} />
          <Pin frame={frame} base={new THREE.Vector3(kxw, kyw, kz + 0.05)} visible={interpolate(frame, [PART_B + 40, PART_B + 90], [1, 0], clamp)} />
          <Routes frame={frame} h={h} />
          <Clouds frame={frame} pose={pose} />
        </ThreeCanvas>
      )}

      {/* atmospheric haze toward the horizon in close-ups */}
      <AbsoluteFill style={{ opacity: detail, background: "linear-gradient(rgba(214,232,238,0.92) 0%, rgba(214,232,238,0.55) 16%, rgba(214,232,238,0) 42%)" }} />
      {/* soft vignette */}
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 45%, transparent 60%, rgba(8,25,45,0.42) 100%)" }} />

      {/* Karakorum label */}
      {pinLabelS > 0.01 && (
        <Label x={pinLabel.x} y={pinLabel.y} title="Karakorum" sub="Imperial Capital · Orkhon Valley" s={pinLabelS} lift={30} dot={false} />
      )}

      {/* Part B: callouts */}
      {h &&
        CALLOUTS.map((c) => {
          const s = spring({ frame: frame - c.f, fps, config: { damping: 12 } }) * interpolate(frame, [PART_C - 20, PART_C + 5], [1, 0], clamp);
          if (s <= 0.01) return null;
          const p = project2D(worldAt(h, c.lon, c.lat, 0.3));
          return <Label key={c.title} x={p.x} y={p.y} title={c.title} sub={c.sub || undefined} s={s} lift={c.lift} small />;
        })}
      {h && <HungaryRaid frame={frame} h={h} project2D={project2D} />}

      {/* Part C: city labels */}
      {h &&
        [{ name: "Karakorum", sub: "", lon: KARAKORUM[0], lat: KARAKORUM[1], start: PART_C - ROUTE_LEN + 10 }, ...CITIES].map((c) => {
          const s = spring({ frame: frame - (c.start + ROUTE_LEN - 5), fps, config: { damping: 12 } });
          if (frame < PART_C || s <= 0.01) return null;
          const p = project2D(worldAt(h, c.lon, c.lat, 0.3));
          return <Label key={c.name} x={p.x} y={p.y} title={c.name} sub={c.sub || undefined} s={s} lift={34} small dot={false} />;
        })}

      <Titles frame={frame} />

      {/* opening: drop out of the clouds */}
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 50%, rgba(255,255,255,0.85), #f4f1ea)", opacity: opening }} />
    </AbsoluteFill>
  );
};

/** Dashed arrow for the 1241 raid into Hungary (raided, never held). */
const HungaryRaid: React.FC<{ frame: number; h: HeightFn; project2D: (p: THREE.Vector3) => { x: number; y: number } }> = ({
  frame, h, project2D,
}) => {
  const start = 850;
  const t = interpolate(frame, [start, start + 35], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const out = interpolate(frame, [PART_C - 20, PART_C + 5], [1, 0], clamp);
  if (t <= 0 || out <= 0) return null;
  const a = project2D(worldAt(h, 26.5, 48.6, 0.3));
  const b = project2D(worldAt(h, 19.5, 47.3, 0.3));
  const c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - 40 };
  const at = (u: number) => ({
    x: (1 - u) ** 2 * a.x + 2 * (1 - u) * u * c.x + u ** 2 * b.x,
    y: (1 - u) ** 2 * a.y + 2 * (1 - u) * u * c.y + u ** 2 * b.y,
  });
  const pts = Array.from({ length: 30 }, (_, i) => at((i / 29) * t));
  const tip = at(t);
  const prev = at(Math.max(0, t - 0.05));
  const ang = (Math.atan2(tip.y - prev.y, tip.x - prev.x) * 180) / Math.PI;
  return (
    <svg width="100%" height="100%" style={{ position: "absolute", inset: 0, opacity: out }}>
      <polyline points={pts.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="#ffe08a" strokeWidth={4}
        strokeDasharray="10 8" strokeDashoffset={-frame} strokeLinecap="round" />
      <g transform={`translate(${tip.x} ${tip.y}) rotate(${ang})`}>
        <polygon points="2,0 -14,-8 -14,8" fill="#ffe08a" />
      </g>
      <text x={b.x - 30} y={b.y + 36} textAnchor="middle" fill={CREAM} fontFamily={SANS} fontSize={20} fontWeight={700} opacity={t}
        stroke="rgba(10,25,45,0.8)" strokeWidth={4} paintOrder="stroke">
        Raid on Hungary, 1241
      </text>
    </svg>
  );
};

const Titles: React.FC<{ frame: number }> = ({ frame }) => {
  const peak = interpolate(frame, [560, 600, PART_C - 20, PART_C + 10], [0, 1, 1, 0], clamp);
  const routes = interpolate(frame, [PART_C + 10, PART_C + 40], [0, 1], clamp);
  const box = (o: number, top: string, main: string) =>
    o > 0 && (
      <div style={{ position: "absolute", left: 80, top: 64, opacity: o, color: CREAM, textShadow: "0 4px 24px rgba(0,30,60,0.6)" }}>
        <div style={{ fontFamily: SANS, fontSize: 24, letterSpacing: "0.4em", opacity: 0.85 }}>{top}</div>
        <div style={{ fontFamily: SERIF, fontSize: 64, marginTop: 6 }}>{main}</div>
      </div>
    );
  return (
    <>
      <AbsoluteFill
        style={{ opacity: Math.max(peak, routes), background: "radial-gradient(ellipse 34% 26% at 14% 12%, rgba(10,35,60,0.55), transparent 70%)" }}
      />
      {box(peak, "AT ITS HEIGHT · 1279", "From the Sea of Japan to Europe")}
      {box(routes, "ONE CONNECTED EMPIRE", "Ruled from Karakorum")}
    </>
  );
};
