import { useMemo } from "react";
import * as THREE from "three";
import { ThreeCanvas } from "@remotion/three";
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { remapTime } from "./timeRemap";
import { EurasiaMap, SUN, useHeightSampler, useMapTextures } from "./map/EurasiaMap";
import { MAP_H, MAP_W, WAVES, project } from "./map/config.js";
import { CameraRig, Cloud, FOV, Key, Label, Pose, poseAt, useProjector } from "./map/mapScene";
import { Glow, seeded } from "./SteppeNight";
import { TinyRider } from "./karakorum";

/**
 * Scene 4 - Achievements & Pax Mongolica (1:50-2:30, 40 s)
 *   Part A 0-15 s   The Silk Road lights up from China to Europe; coins, silk and
 *                   scrolls travel along it.
 *   Part B 15-28 s  Zoom onto Almaliq -> Samarkand: Yam relay stations every ~40 km,
 *                   a courier dashes station to station, his horse's stamina resetting.
 *   Part C 28-40 s  Badges: the Yassa legal code, and religious tolerance.
 * Starts on the same map view Scene 3 ends on (they crossfade in MongolVideo).
 */

// Internal animation timeline (frames). The scene is played back faster to fit the
// 3-minute video: see TIME_MAP / remapTime.
const SCENE4_TIMELINE = 1200;
export const SCENE4_FRAMES = 900; // 30 s in the final video
const TIME_MAP: [number, number][] = [[0, 0], [330, 450], [620, 840], [900, 1200]];
const PART_B = 450;
const PART_C = 840;
const YAM_START = 480;

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "'Avenir Next', 'Helvetica Neue', Helvetica, Arial, sans-serif";
const CREAM = "#fffaf0";
const GOLD = "#ffc94d";

type HeightFn = (lon: number, lat: number) => number;
type LL = [number, number];

// ---------- the routes (east -> west) ----------

const MAIN: { at: LL; name?: string; sub?: string }[] = [
  { at: [116.4, 39.9], name: "Khanbaliq", sub: "Beijing" },
  { at: [112.6, 37.9] },
  { at: [108.9, 34.3], name: "Xi'an" },
  { at: [103.8, 36.1] },
  { at: [100.4, 38.9] },
  { at: [94.7, 40.1], name: "Dunhuang" },
  { at: [89.2, 42.9] },
  { at: [85.5, 44.2] },
  { at: [80.9, 44.0], name: "Almaliq" },
  { at: [76.9, 43.2] },
  { at: [71.4, 42.9] },
  { at: [69.2, 41.3] },
  { at: [66.97, 39.65], name: "Samarkand" },
  { at: [64.4, 39.8] },
  { at: [61.8, 37.6], name: "Merv" },
  { at: [59.6, 36.3] },
  { at: [51.4, 35.7] },
  { at: [46.3, 38.1], name: "Tabriz" },
  { at: [42.5, 39.9] },
  { at: [39.7, 41.0] },
  { at: [34.5, 41.4] },
  { at: [28.97, 41.0], name: "Constantinople" },
];
const SEA_TO_VENICE: LL[] = [[28.97, 41.0], [26.4, 40.2], [24.6, 38.4], [21.6, 37.2], [19.4, 39.4], [17.2, 41.6], [14.6, 43.6], [12.3, 45.4]];
const NORTH: { at: LL; name?: string }[] = [
  { at: [66.97, 39.65] },
  { at: [62.8, 41.0] },
  { at: [60.6, 41.55] },
  { at: [55.8, 44.6] },
  { at: [51.5, 47.4] },
  { at: [47.4, 47.9], name: "Sarai" },
  { at: [43.5, 47.6] },
  { at: [39.3, 47.1] },
  { at: [35.4, 45.0], name: "Caffa" },
];
const SEA_CAFFA: LL[] = [[35.4, 45.0], [33.6, 43.2], [30.6, 41.9], [28.97, 41.0]];

const pathFrom = (h: HeightFn, pts: LL[], lift: number, samples = 600) => {
  const rough = new THREE.CatmullRomCurve3(pts.map(([lon, lat]) => new THREE.Vector3(...project(lon, lat), 0)), false, "centripetal");
  const dense = rough.getSpacedPoints(samples).map((q) => {
    const lon = (q.x / Math.cos((40 * Math.PI) / 180)) + 70;
    const lat = q.y + 41.5;
    return new THREE.Vector3(q.x, q.y, Math.max(0, h(lon, lat)) + lift);
  });
  return new THREE.CatmullRomCurve3(dense);
};

/** u (0..1 along the curve) of the point closest to a lon/lat. */
const uOf = (curve: THREE.CatmullRomCurve3, ll: LL) => {
  const [x, y] = project(...ll);
  let best = 0, bestD = Infinity;
  for (let i = 0; i <= 800; i++) {
    const p = curve.getPointAt(i / 800);
    const d = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d < bestD) { bestD = d; best = i / 800; }
  }
  return best;
};

// ---------- glowing road shader ----------

const ROAD_VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const ROAD_FRAG = /* glsl */ `
uniform float uProgress;
uniform float uTime;
uniform float uDashed;
uniform float uOpacity;
uniform float uHalo;
varying vec2 vUv;
void main() {
  float along = vUv.x;
  if (along > uProgress) discard;
  if (uDashed > 0.5 && fract(along * 40.0) > 0.55) discard;
  float rim = abs(cos(vUv.y * 6.2831));          // brighter core, darker edges around the tube
  vec3 base = mix(vec3(0.85, 0.52, 0.12), vec3(1.0, 0.85, 0.42), rim);
  float flow = smoothstep(0.85, 1.0, fract(along * 18.0 - uTime * 0.5));
  vec3 col = base + vec3(1.0, 0.95, 0.75) * flow * 0.6;
  float tip = smoothstep(0.03, 0.0, uProgress - along) * step(uProgress, 0.999);
  col += vec3(1.0, 0.9, 0.6) * tip;
  float a = uOpacity;
  if (uHalo > 0.5) { col = vec3(1.0, 0.75, 0.3); a *= 0.25 + 0.15 * flow; }
  gl_FragColor = vec4(col, a);
  #include <colorspace_fragment>
}`;

const roadMaterial = (halo: boolean) =>
  new THREE.ShaderMaterial({
    uniforms: { uProgress: { value: 0 }, uTime: { value: 0 }, uDashed: { value: 0 }, uOpacity: { value: 1 }, uHalo: { value: halo ? 1 : 0 } },
    vertexShader: ROAD_VERT,
    fragmentShader: ROAD_FRAG,
    transparent: true,
    depthWrite: !halo,
    blending: halo ? THREE.AdditiveBlending : THREE.NormalBlending,
  });

const Road: React.FC<{ curve: THREE.CatmullRomCurve3; radius: number; progress: number; frame: number; dashed?: boolean; opacity?: number }> = ({
  curve, radius, progress, frame, dashed, opacity = 1,
}) => {
  const { core, halo, coreMat, haloMat } = useMemo(
    () => ({
      core: new THREE.TubeGeometry(curve, 900, radius, 10, false),
      halo: new THREE.TubeGeometry(curve, 900, radius * 2.6, 10, false),
      coreMat: roadMaterial(false),
      haloMat: roadMaterial(true),
    }),
    [curve, radius],
  );
  for (const m of [coreMat, haloMat]) {
    m.uniforms.uProgress.value = progress;
    m.uniforms.uTime.value = frame / 10;
    m.uniforms.uDashed.value = dashed ? 1 : 0;
    m.uniforms.uOpacity.value = opacity;
  }
  if (progress <= 0 || opacity <= 0.01) return null;
  return (
    <>
      <mesh geometry={core} material={coreMat} />
      <mesh geometry={halo} material={haloMat} />
    </>
  );
};

// ---------- trade goods travelling the road ----------

const goldMat = new THREE.MeshStandardMaterial({ color: "#f2c14e", metalness: 0.8, roughness: 0.3, emissive: "#6a4300" });
const coinGeo = new THREE.CylinderGeometry(0.6, 0.6, 0.12, 28);
const Coin: React.FC = () => (
  <group>
    <mesh geometry={coinGeo} material={goldMat} />
    <mesh position={[0, -0.07, 0]}>
      <boxGeometry args={[0.22, 0.02, 0.22]} />
      <meshStandardMaterial color="#8a5a10" />
    </mesh>
  </group>
);
const SilkRoll: React.FC<{ color: string }> = ({ color }) => (
  <group rotation={[0, 0, Math.PI / 2]}>
    <mesh>
      <cylinderGeometry args={[0.38, 0.38, 1.3, 20]} />
      <meshStandardMaterial color={color} roughness={0.45} emissive={color} emissiveIntensity={0.15} />
    </mesh>
    {[-0.45, 0.45].map((y) => (
      <mesh key={y} position={[0, y, 0]}>
        <cylinderGeometry args={[0.4, 0.4, 0.1, 20]} />
        <meshStandardMaterial color="#e8b64a" metalness={0.6} roughness={0.35} />
      </mesh>
    ))}
  </group>
);
const Scroll: React.FC = () => (
  <group rotation={[0, 0, Math.PI / 2]}>
    <mesh>
      <cylinderGeometry args={[0.26, 0.26, 1.2, 18]} />
      <meshStandardMaterial color="#f1e6cc" roughness={0.8} emissive="#f1e6cc" emissiveIntensity={0.1} />
    </mesh>
    {[-0.66, 0.66].map((y) => (
      <mesh key={y} position={[0, y, 0]}>
        <sphereGeometry args={[0.16, 12, 10]} />
        <meshStandardMaterial color="#6b3b1e" />
      </mesh>
    ))}
    <mesh>
      <cylinderGeometry args={[0.28, 0.28, 0.14, 18]} />
      <meshStandardMaterial color="#c8332b" />
    </mesh>
  </group>
);

const Goods: React.FC<{ curve: THREE.CatmullRomCurve3; frame: number; progress: number; opacity: number }> = ({ curve, frame, progress, opacity }) => {
  const items = useMemo(() => {
    const r = seeded(12);
    return Array.from({ length: 20 }, (_, i) => ({ start: r(), dir: i % 2 ? 1 : -1, speed: 0.0011 + r() * 0.0006, type: i % 3, color: ["#c8332b", "#2f6fa8", "#2f8a7a"][i % 3], phase: r() * 6 }));
  }, []);
  if (opacity <= 0.01) return null;
  return (
    <>
      {items.map((it, i) => {
        const u = (((it.start + frame * it.speed * it.dir) % 1) + 1) % 1;
        if (u > progress - 0.01) return null;
        const p = curve.getPointAt(u);
        const z = p.z + 1.1 + Math.sin(frame * 0.12 + it.phase) * 0.15;
        const s = interpolate(progress - u, [0, 0.03], [0, 1], clamp) * opacity * 1.15;
        return (
          <group key={i} position={[p.x, p.y, z]} scale={s}>
            <group rotation={[0, 0, it.type === 0 ? Math.sin(frame * 0.05 + it.phase) * 0.6 : 0]}>
              {it.type === 0 ? <Coin /> : it.type === 1 ? <SilkRoll color={it.color} /> : <Scroll />}
            </group>
            <Glow position={[0, 0, -0.4]} size={3.4} color="#ffd27a" intensity={0.45} falloff={2} />
          </group>
        );
      })}
    </>
  );
};

// ---------- Yam relay ----------

const STATIONS = 31; // Almaliq -> Samarkand, about 1,250 km: one every ~40 km (25 miles)
const LEG_KM = 40;

/** Courier timeline: slow first legs (to explain), then a fast time-lapse. */
const LEGS = Array.from({ length: STATIONS - 1 }, (_, i) => (i < 3 ? { move: 24, pause: 6 } : { move: 7, pause: 2 }));
const courierAt = (frame: number) => {
  let t = frame - YAM_START;
  if (t < 0) return { leg: 0, move: 0, pausing: false, pauseT: 0, done: false };
  for (let i = 0; i < LEGS.length; i++) {
    const L = LEGS[i];
    if (t < L.move) return { leg: i, move: Easing.inOut(Easing.quad)(t / L.move), pausing: false, pauseT: 0, done: false };
    t -= L.move;
    if (t < L.pause) return { leg: i, move: 1, pausing: true, pauseT: t / L.pause, done: false };
    t -= L.pause;
  }
  return { leg: LEGS.length - 1, move: 1, pausing: true, pauseT: 1, done: true };
};

const Station: React.FC<{ p: THREE.Vector3; heading: number; lit: number; appear: number }> = ({ p, heading, lit, appear }) => (
  <group position={p} rotation={[0, 0, heading]} scale={appear}>
    <mesh position={[0, 0, 0.02]}>
      <ringGeometry args={[0.07, 0.095, 32]} />
      <meshBasicMaterial color={lit > 0 ? "#fff1b0" : GOLD} transparent opacity={0.7 + lit * 0.3} />
    </mesh>
    {lit > 0 && <Glow position={[0, 0, 0.05]} size={0.8 + lit * 0.8} color="#ffd27a" intensity={lit} falloff={1.8} />}
    <group position={[0, 0.2, 0]}>
      <mesh position={[0, 0, 0.025]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 0.05, 12]} />
        <meshStandardMaterial color="#f1ebdf" />
      </mesh>
      <mesh position={[0, 0, 0.065]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.054, 0.035, 12]} />
        <meshStandardMaterial color="#e0d4bf" />
      </mesh>
    </group>
    <mesh position={[0.1, 0.16, 0.06]}>
      <boxGeometry args={[0.008, 0.008, 0.12]} />
      <meshStandardMaterial color="#5a3a20" />
    </mesh>
    <mesh position={[0.125, 0.16, 0.105]} rotation={[Math.PI / 2, 0, 0]}>
      <planeGeometry args={[0.05, 0.03]} />
      <meshStandardMaterial color="#c8332b" side={THREE.DoubleSide} />
    </mesh>
    {/* spare horses waiting */}
    {[-0.08, -0.13].map((x, i) => (
      <mesh key={i} position={[x, 0.22 + i * 0.03, 0.025]}>
        <boxGeometry args={[0.045, 0.014, 0.018]} />
        <meshStandardMaterial color={i ? "#6a4a2a" : "#3b261a"} />
      </mesh>
    ))}
  </group>
);

// ---------- clouds around the floating map ----------

const MapClouds: React.FC<{ frame: number; pose: Pose }> = ({ frame, pose }) => {
  const clouds = useMemo(() => {
    const r = seeded(404);
    const below = Array.from({ length: 22 }, (_, i) => {
      const a = (i / 22) * Math.PI * 2 + r() * 0.2;
      return { base: new THREE.Vector3(Math.cos(a) * MAP_W * (0.5 + r() * 0.25), Math.sin(a) * MAP_H * (0.55 + r() * 0.35), -16 + r() * 6), size: 34 + r() * 26, seed: r() * 50, high: false };
    });
    const high = Array.from({ length: 8 }, () => ({
      base: new THREE.Vector3((r() - 0.5) * MAP_W * 0.9, (r() - 0.5) * MAP_H * 0.8, 14 + r() * 8), size: 16 + r() * 14, seed: r() * 50, high: true,
    }));
    return [...below, ...high];
  }, []);
  return (
    <>
      {clouds.map((c, i) => {
        const p = c.base.clone().add(new THREE.Vector3(frame * 0.012, frame * 0.004, 0));
        const o = c.high ? 0.35 * interpolate(pose.dist, [60, 140], [0, 1], clamp) * interpolate(p.distanceTo(pose.position), [2, 9], [0, 1], clamp)
          : 0.8 * interpolate(pose.dist, [70, 140], [0, 1], clamp);
        return <Cloud key={i} position={p} size={c.size} seed={c.seed} opacity={o} />;
      })}
    </>
  );
};

// ======================================================================
// Scene
// ======================================================================

export const Scene4: React.FC = () => {
  const frame = remapTime(useCurrentFrame(), TIME_MAP);
  const { width, height, fps } = useVideoConfig();
  const textures = useMapTextures();
  const h = useHeightSampler(textures);

  const geo = useMemo(() => {
    if (!h) return null;
    const main = pathFrom(h, MAIN.map((m) => m.at), 0.35, 900);
    const north = pathFrom(h, NORTH.map((m) => m.at), 0.3, 500);
    const seaV = pathFrom(h, SEA_TO_VENICE, 0.25, 200);
    const seaC = pathFrom(h, SEA_CAFFA, 0.25, 120);
    const uA = uOf(main, [80.9, 44.0]);
    const uB = uOf(main, [66.97, 39.65]);
    // the Yam stretch as its own, thinner road
    const yamPts = Array.from({ length: 300 }, (_, i) => main.getPointAt(uA + ((uB - uA) * i) / 299).clone().setZ(0));
    const yamCurve = new THREE.CatmullRomCurve3(yamPts.map((p) => {
      const lon = p.x / Math.cos((40 * Math.PI) / 180) + 70;
      return new THREE.Vector3(p.x, p.y, Math.max(0, h(lon, p.y + 41.5)) + 0.04);
    }));
    const stations = Array.from({ length: STATIONS }, (_, k) => {
      const u = k / (STATIONS - 1);
      const p = yamCurve.getPointAt(u);
      const q = yamCurve.getPointAt(Math.min(1, u + 0.002));
      const o = yamCurve.getPointAt(Math.max(0, u - 0.002));
      return { u, p, heading: Math.atan2(q.y - o.y, q.x - o.x) };
    });
    const cityU = MAIN.filter((m) => m.name).map((m) => ({ ...m, u: uOf(main, m.at) }));
    const northU = NORTH.filter((m) => m.name).map((m) => ({ ...m, u: uOf(north, m.at) }));
    const yamTarget = (lonlat: LL) => {
      const [x, y] = project(...lonlat);
      return h(...lonlat) + 0.3 + x * 0 + y * 0;
    };
    return { main, north, seaV, seaC, yamCurve, stations, cityU, northU, zA: yamTarget([76, 43]), zB: yamTarget([69.5, 41.4]) };
  }, [h]);

  // camera targets on the Yam road itself (u = 0..1 from Almaliq to Samarkand)
  const yamView = (u: number) => {
    if (!geo) return { lon: 74, lat: 42.5, z: 1 };
    const p = geo.yamCurve.getPointAt(u);
    return { lon: p.x / Math.cos((40 * Math.PI) / 180) + 70, lat: p.y + 41.5, z: p.z };
  };
  const keys: Key[] = useMemo(
    () => [
      { f: 0, lon: 78, lat: 45, z: 0, dist: 138, tilt: 44, turn: 9 },
      { f: 130, lon: 68, lat: 41, z: 0, dist: 118, tilt: 40, turn: 2, ease: Easing.inOut(Easing.cubic) },
      { f: 430, lon: 66, lat: 41.5, z: 0, dist: 110, tilt: 42, turn: -2, ease: Easing.inOut(Easing.sin) },
      { f: YAM_START + 20, ...yamView(0.42), dist: 30, tilt: 36, turn: -4, ease: Easing.inOut(Easing.cubic) },
      { f: PART_C - 30, ...yamView(0.6), dist: 27, tilt: 40, turn: 4, ease: Easing.inOut(Easing.sin) },
      { f: PART_C + 70, lon: 74, lat: 44, z: 0, dist: 150, tilt: 40, turn: 4, ease: Easing.inOut(Easing.cubic) },
      { f: SCENE4_TIMELINE, lon: 75, lat: 44, z: 0, dist: 165, tilt: 38, turn: 7, ease: Easing.inOut(Easing.sin) },
    ],
    [geo],
  );
  // during the relay, the camera follows the courier (smoothed so the stop-start rhythm doesn't jolt it)
  const pose = useMemo(() => {
    const base = poseAt(frame, keys);
    const w = interpolate(frame, [YAM_START - 30, YAM_START + 10, PART_C - 40, PART_C + 10], [0, 1, 1, 0], { ...clamp, easing: Easing.inOut(Easing.sin) });
    if (!geo || w <= 0) return base;
    let uSum = 0;
    for (let k = -12; k <= 12; k++) {
      const c = courierAt(frame + k);
      uSum += (c.leg + c.move) / (STATIONS - 1);
    }
    const u = Math.min(1, Math.max(0, uSum / 25));
    const c = geo.yamCurve.getPointAt(u);
    const target = base.target.clone().lerp(new THREE.Vector3(c.x, c.y, c.z + 0.2), w);
    const followDir = new THREE.Vector3(0, -Math.sin((34 * Math.PI) / 180), Math.cos((34 * Math.PI) / 180)).applyAxisAngle(new THREE.Vector3(0, 0, 1), -0.25);
    const dir = base.position.clone().sub(base.target).normalize().lerp(followDir, w).normalize();
    const dist = Math.exp(Math.log(base.dist) + (Math.log(8.5) - Math.log(base.dist)) * w);
    return { position: target.clone().add(dir.multiplyScalar(dist)), target, dist };
  }, [frame, keys, geo]);
  const project2D = useProjector(pose);

  // timings
  const mainProgress = interpolate(frame, [30, 200], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const northProgress = interpolate(frame, [120, 240], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const seaProgress = interpolate(frame, [190, 250], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const bigRoad = interpolate(frame, [PART_B + 10, PART_B + 60, PART_C + 30, PART_C + 80], [1, 0, 0, 0.55], clamp);
  const yamRoad = interpolate(frame, [PART_B + 20, PART_B + 70, PART_C - 20, PART_C + 30], [0, 1, 1, 0], clamp);
  const detail = interpolate(pose.dist, [25, 70], [1, 0], clamp);
  const empireOpacity = interpolate(frame, [PART_B, PART_B + 60, PART_C, PART_C + 60], [0.66, 0.18, 0.18, 0.55], clamp);
  const sceneIn = interpolate(frame, [0, 30], [0, 1], clamp);
  const courier = courierAt(frame);

  return (
    <AbsoluteFill style={{ opacity: sceneIn, background: "radial-gradient(circle at 12% 8%, #fffbe8 0%, #d9f0ef 14%, #7fc0d6 34%, #3a7fa8 62%, #1d4a6e 100%)" }}>
      {textures && h && geo && (
        <ThreeCanvas width={width} height={height} flat camera={{ fov: FOV, near: 0.1, far: 3000 }}>
          <CameraRig pose={pose} />
          <hemisphereLight args={["#e4f1ff", "#6f7f4a", 1.2]} />
          <directionalLight position={SUN.clone().multiplyScalar(60).toArray()} intensity={2.2} color="#fff1dc" />
          <EurasiaMap textures={textures} progress={WAVES.length} glow={0} empireOpacity={empireOpacity} detail={detail} borderGlow={0.15} />
          {/* Part A: the Silk Road */}
          <Road curve={geo.main} radius={0.32} progress={mainProgress} frame={frame} opacity={bigRoad} />
          <Road curve={geo.north} radius={0.22} progress={northProgress} frame={frame} opacity={bigRoad * 0.85} />
          <Road curve={geo.seaV} radius={0.22} progress={seaProgress} frame={frame} dashed opacity={bigRoad} />
          <Road curve={geo.seaC} radius={0.18} progress={seaProgress} frame={frame} dashed opacity={bigRoad * 0.85} />
          <Goods curve={geo.main} frame={frame} progress={mainProgress} opacity={interpolate(frame, [80, 140, PART_B, PART_B + 30], [0, 1, 1, 0], clamp)} />
          {geo.cityU.map((c, i) =>
            mainProgress >= c.u && bigRoad > 0.05 ? (
              <Glow key={i} position={geo.main.getPointAt(c.u).toArray() as [number, number, number]} size={4 + Math.sin(frame * 0.15 + i) * 0.5} color="#ffd27a" intensity={bigRoad} falloff={1.8} />
            ) : null,
          )}

          {/* Part B: the Yam relay */}
          <Road curve={geo.yamCurve} radius={0.045} progress={1} frame={frame} opacity={yamRoad} />
          {yamRoad > 0.01 &&
            geo.stations.map((st, k) => {
              const arrived = courier.leg + (courier.move >= 1 ? 1 : 0);
              const flash = k === arrived && courier.pausing ? 1 - courier.pauseT * 0.5 : k < arrived ? 0.25 : 0;
              const appear = interpolate(frame, [PART_B + 30 + k * 2, PART_B + 45 + k * 2], [0, 1], { ...clamp, easing: Easing.out(Easing.back(2)) }) * yamRoad;
              return <Station key={k} p={st.p} heading={st.heading} lit={frame >= YAM_START ? flash : 0} appear={appear * 1.6} />;
            })}
          {yamRoad > 0.01 && frame >= YAM_START - 20 && (() => {
            const u0 = geo.stations[courier.leg].u;
            const u1 = geo.stations[Math.min(STATIONS - 1, courier.leg + 1)].u;
            const u = u0 + (u1 - u0) * courier.move;
            const p = geo.yamCurve.getPointAt(Math.min(1, u));
            const q = geo.yamCurve.getPointAt(Math.min(1, u + 0.003));
            const o = geo.yamCurve.getPointAt(Math.max(0, u - 0.003));
            const heading = Math.atan2(q.y - o.y, q.x - o.x);
            return (
              <>
                {[1, 2, 3, 4, 5, 6].map((k) => {
                  const uu = Math.max(0, u - k * 0.004);
                  return courier.pausing ? null : <Glow key={k} position={geo.yamCurve.getPointAt(uu).clone().setZ(geo.yamCurve.getPointAt(uu).z + 0.1).toArray() as [number, number, number]} size={0.8 - k * 0.09} color="#ffe2a0" intensity={0.8 - k * 0.12} falloff={1.6} />;
                })}
                <group position={[p.x, p.y, p.z]}>
                  <group scale={12}>
                    <TinyRider p={[0, 0, 0]} heading={heading} robe="#a8302a" hat={GOLD} frame={courier.pausing ? 0 : frame} seed={3} moving={!courier.pausing} />
                  </group>
                  <Glow position={[0, 0, 0.25]} size={1.8} color="#ffd27a" intensity={0.9} falloff={1.8} />
                </group>
              </>
            );
          })()}
          <MapClouds frame={frame} pose={pose} />
        </ThreeCanvas>
      )}

      {/* haze in close-ups, vignette */}
      <AbsoluteFill style={{ opacity: detail * 0.7, background: "linear-gradient(rgba(214,232,238,0.85) 0%, rgba(214,232,238,0.4) 14%, rgba(214,232,238,0) 34%)" }} />
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 45%, transparent 60%, rgba(8,25,45,0.42) 100%)" }} />

      {/* city labels along the Silk Road */}
      {geo &&
        [...geo.cityU.map((c) => ({ ...c, p: geo.main.getPointAt(c.u), prog: mainProgress })), ...geo.northU.map((c) => ({ ...c, sub: undefined, p: geo.north.getPointAt(c.u), prog: northProgress })),
          { name: "Venice", sub: undefined, u: 0.999, p: geo.seaV.getPointAt(1), prog: seaProgress }].map((c, i) => {
          const s = (c.prog >= c.u ? spring({ frame: frame - (30 + i * 4), fps, config: { damping: 14 } }) : 0) * interpolate(frame, [PART_B, PART_B + 25], [1, 0], clamp);
          if (s <= 0.01) return null;
          const sp = project2D(c.p.clone().setZ(c.p.z + 0.5));
          return <Label key={c.name} x={sp.x} y={sp.y} title={c.name!} sub={c.sub} s={s} lift={26} small dot={false} />;
        })}

      <SilkTitle frame={frame} />
      <YamHud frame={frame} courier={courier} />
      <Badges frame={frame} />
      {/* end on soft white: Scene 5 opens from it */}
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 50%, rgba(255,255,255,0.85), #f4f1ea)", opacity: interpolate(frame, [SCENE4_TIMELINE - 45, SCENE4_TIMELINE], [0, 1], { ...clamp, easing: Easing.in(Easing.quad) }) }} />
    </AbsoluteFill>
  );
};

// ======================================================================
// HTML overlays
// ======================================================================

const TitleBlock: React.FC<{ o: number; top: string; main: string; chips?: string[] }> = ({ o, top, main, chips = [] }) =>
  o > 0.01 ? (
    <>
      <AbsoluteFill style={{ opacity: o, background: "radial-gradient(ellipse 40% 28% at 16% 12%, rgba(10,35,60,0.6), transparent 70%)" }} />
      <div style={{ position: "absolute", left: 80, top: 60, opacity: o, color: CREAM, textShadow: "0 4px 24px rgba(0,30,60,0.6)" }}>
        <div style={{ fontFamily: SANS, fontSize: 24, letterSpacing: "0.4em", opacity: 0.85 }}>{top}</div>
        <div style={{ fontFamily: SERIF, fontSize: 64, marginTop: 6 }}>{main}</div>
        <div style={{ display: "flex", gap: 12, marginTop: 14 }}>
          {chips.map((c) => (
            <span key={c} style={{
              padding: "6px 16px", borderRadius: 999, border: "2px solid rgba(255,201,77,0.7)", background: "rgba(255,201,77,0.14)",
              fontFamily: SANS, fontWeight: 700, fontSize: 21, color: GOLD,
            }}>{c}</span>
          ))}
        </div>
      </div>
    </>
  ) : null;

const SilkTitle: React.FC<{ frame: number }> = ({ frame }) => {
  const o = interpolate(frame, [50, 80, PART_B - 20, PART_B + 5], [0, 1, 1, 0], clamp);
  const chips = ["Safe from bandits", "Trade", "Technology", "Ideas"].filter((_, i) => frame > 160 + i * 25);
  return <TitleBlock o={o} top="PAX MONGOLICA · THE MONGOL PEACE" main="The Silk Road" chips={chips} />;
};

const YamHud: React.FC<{ frame: number; courier: ReturnType<typeof courierAt> }> = ({ frame, courier }) => {
  const o = interpolate(frame, [PART_B + 40, PART_B + 70, PART_C - 10, PART_C + 15], [0, 1, 1, 0], clamp);
  if (o <= 0.01) return null;
  const started = frame >= YAM_START;
  const stamina = !started ? 1 : courier.pausing ? interpolate(courier.pauseT, [0, 0.6, 1], [0.15, 1, 1]) : 1 - courier.move * 0.85;
  const km = started ? Math.round((courier.leg + courier.move) * LEG_KM) : 0;
  const day = 1 + Math.floor(km / 250);
  const refill = courier.pausing && started;
  return (
    <>
      <TitleBlock o={o} top="THE MONGOL POST" main="The Yam Relay System" />
      <div
        style={{
          position: "absolute", left: 80, bottom: 70, width: 560, padding: "26px 30px", borderRadius: 26, opacity: o,
          background: "linear-gradient(180deg, rgba(14,36,60,0.82), rgba(8,22,40,0.86))", boxShadow: "0 24px 70px rgba(0,10,25,0.5), 0 0 0 2px rgba(255,201,77,0.35)",
          color: CREAM, fontFamily: SANS,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ fontSize: 22, letterSpacing: "0.25em", color: GOLD, fontWeight: 800 }}>COURIER</span>
          <span style={{ fontSize: 22, opacity: 0.85 }}>Fresh horse every ~40 km (25 mi)</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 18 }}>
          <span style={{ fontSize: 22, width: 92 }}>Horse</span>
          <div style={{ flex: 1, height: 24, borderRadius: 12, background: "rgba(255,255,255,0.1)", overflow: "hidden" }}>
            <div style={{
              height: "100%", width: `${stamina * 100}%`, borderRadius: 12,
              background: stamina > 0.4 ? "linear-gradient(90deg, #ffcf6b, #8fd16a)" : "linear-gradient(90deg, #e2382c, #ffb347)",
              boxShadow: refill ? "0 0 24px rgba(255,220,120,0.9)" : "none",
            }} />
          </div>
        </div>
        <div style={{ height: 26, marginTop: 6, fontSize: 20, fontWeight: 700, color: GOLD, opacity: refill ? 1 : 0 }}>Station! Fresh horse →</div>
        <div style={{ display: "flex", gap: 40, marginTop: 6, alignItems: "flex-end" }}>
          <div>
            <div style={{ fontSize: 18, opacity: 0.7, letterSpacing: "0.15em" }}>DISTANCE</div>
            <div style={{ fontFamily: SERIF, fontSize: 46, fontVariantNumeric: "tabular-nums" }}>{km.toLocaleString("en-US")} km</div>
          </div>
          <div>
            <div style={{ fontSize: 18, opacity: 0.7, letterSpacing: "0.15em" }}>TIME</div>
            <div style={{ fontFamily: SERIF, fontSize: 46 }}>Day {day}</div>
          </div>
          {/* paiza: the courier's gold passport tablet */}
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
            <svg width={44} height={70} viewBox="0 0 44 70">
              <rect x={4} y={10} width={36} height={56} rx={12} fill="#e8b64a" stroke="#7a4a00" strokeWidth={3} />
              <circle cx={22} cy={8} r={6} fill="none" stroke="#e8b64a" strokeWidth={4} />
              {[24, 34, 44, 54].map((y) => <line key={y} x1={14} y1={y} x2={30} y2={y} stroke="#7a4a00" strokeWidth={3} strokeLinecap="round" />)}
            </svg>
            <div style={{ fontSize: 17, lineHeight: 1.25, opacity: 0.85, width: 110 }}>Paiza: the rider&apos;s gold pass</div>
          </div>
        </div>
      </div>
    </>
  );
};

// ---------- Part C: Yassa + religious tolerance ----------

const Badges: React.FC<{ frame: number }> = ({ frame }) => {
  const { fps } = useVideoConfig();
  const dim = interpolate(frame, [PART_C, PART_C + 40], [0, 1], clamp);
  if (dim <= 0) return null;
  const left = spring({ frame: frame - (PART_C + 30), fps, config: { damping: 13 } });
  const right = spring({ frame: frame - (PART_C + 90), fps, config: { damping: 13 } });
  // scale pans swing, then settle level ("justice")
  const tLocal = Math.max(0, frame - (PART_C + 45));
  const tilt = Math.sin(tLocal * 0.18) * 16 * Math.exp(-tLocal / 45);
  const ringDraw = interpolate(frame, [PART_C + 150, PART_C + 200], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const symbols = [
    { name: "Christianity", f: PART_C + 100 },
    { name: "Islam", f: PART_C + 112 },
    { name: "Buddhism", f: PART_C + 124 },
    { name: "Daoism", f: PART_C + 136 },
  ];
  const rot = frame * 0.4;
  return (
    <>
      <AbsoluteFill style={{ opacity: dim, background: "rgba(8,18,32,0.6)", backdropFilter: `blur(${dim * 5}px)` }} />
      <div style={{ position: "absolute", top: 70, width: "100%", textAlign: "center", color: CREAM, opacity: dim }}>
        <div style={{ fontFamily: SANS, fontSize: 24, letterSpacing: "0.45em", opacity: 0.85 }}>HOLDING IT ALL TOGETHER</div>
        <div style={{ fontFamily: SERIF, fontSize: 60, marginTop: 8 }}>Law &amp; Faith</div>
      </div>
      <svg width={1920} height={1080} viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0 }}>
        <defs>
          <radialGradient id="bg4">
            <stop offset="0%" stopColor="#ffd27a" stopOpacity={0.45} />
            <stop offset="100%" stopColor="#ffd27a" stopOpacity={0} />
          </radialGradient>
        </defs>
        {/* Yassa: balance scale */}
        <g transform={`translate(600 560) scale(${left})`} opacity={Math.min(1, left * 1.4)}>
          <circle r={260} fill="url(#bg4)" />
          <circle r={200} fill="rgba(14,36,60,0.85)" stroke={GOLD} strokeWidth={6} />
          <circle r={184} fill="none" stroke="rgba(255,201,77,0.35)" strokeWidth={2} />
          <g stroke="#f3e6cf" strokeWidth={8} strokeLinecap="round" fill="none">
            <line x1={0} y1={-110} x2={0} y2={100} />
            <path d="M -60 110 L 60 110" />
            <circle cx={0} cy={-120} r={10} fill="#f3e6cf" />
          </g>
          <g transform={`rotate(${tilt} 0 -96)`}>
            <line x1={-120} y1={-96} x2={120} y2={-96} stroke={GOLD} strokeWidth={10} strokeLinecap="round" />
            {[-1, 1].map((side) => (
              <g key={side} transform={`translate(${side * 112} -96) rotate(${-tilt})`}>
                <line x1={0} y1={0} x2={-34} y2={70} stroke="#f3e6cf" strokeWidth={3} />
                <line x1={0} y1={0} x2={34} y2={70} stroke="#f3e6cf" strokeWidth={3} />
                <path d="M -46 70 Q 0 108 46 70 Z" fill={GOLD} stroke="#7a4a00" strokeWidth={3} />
              </g>
            ))}
          </g>
          <text y={262} textAnchor="middle" fill={CREAM} fontFamily={SERIF} fontWeight={700} fontSize={52}>Yassa Legal Code</text>
          <text y={304} textAnchor="middle" fill={CREAM} opacity={0.85} fontFamily={SANS} fontSize={28}>One law across the empire</text>
        </g>
        {/* Religious tolerance: four symbols inside a protective circle */}
        <g transform={`translate(1320 560) scale(${right})`} opacity={Math.min(1, right * 1.4)}>
          <circle r={260} fill="url(#bg4)" />
          <circle r={200} fill="rgba(14,36,60,0.85)" stroke={GOLD} strokeWidth={6} />
          {/* protective ring draws around them, then slowly turns */}
          <circle r={172} fill="none" stroke={GOLD} strokeWidth={8} strokeDasharray={`${1081 * ringDraw} 1081`} transform="rotate(-90)" />
          <g transform={`rotate(${rot})`} opacity={ringDraw}>
            {Array.from({ length: 24 }, (_, i) => (
              <circle key={i} cx={Math.cos((i / 24) * Math.PI * 2) * 186} cy={Math.sin((i / 24) * Math.PI * 2) * 186} r={3.5} fill="#ffe2a0" />
            ))}
          </g>
          {symbols.map((sy, i) => {
            const s = spring({ frame: frame - sy.f, fps, config: { damping: 11 } });
            const x = i % 2 ? 62 : -62;
            const y = i < 2 ? -62 : 62;
            return (
              <g key={sy.name} transform={`translate(${x} ${y}) scale(${s})`}>
                <circle r={50} fill="rgba(255,250,240,0.1)" stroke="rgba(255,250,240,0.35)" strokeWidth={2} />
                {sy.name === "Christianity" && (
                  // flared cross of the Church of the East, common in Mongol lands
                  <path d="M -6 -32 L 6 -32 L 4 -6 L 30 -6 L 30 6 L 4 6 L 6 32 L -6 32 L -4 6 L -30 6 L -30 -6 L -4 -6 Z" fill="#f3e6cf" />
                )}
                {sy.name === "Islam" && (
                  <g fill="#f3e6cf">
                    <path d="M 8 -28 A 30 30 0 1 0 8 28 A 23 23 0 1 1 8 -28 Z" />
                    <polygon transform="translate(16 0) scale(0.55)" points="0,-20 6,-6 21,-6 9,3 13,18 0,9 -13,18 -9,3 -21,-6 -6,-6" />
                  </g>
                )}
                {sy.name === "Buddhism" && (
                  <g stroke="#f3e6cf" strokeWidth={5} fill="none">
                    <circle r={28} />
                    <circle r={8} fill="#f3e6cf" />
                    {Array.from({ length: 8 }, (_, k) => {
                      const a = (k / 8) * Math.PI * 2;
                      return <line key={k} x1={Math.cos(a) * 8} y1={Math.sin(a) * 8} x2={Math.cos(a) * 34} y2={Math.sin(a) * 34} />;
                    })}
                  </g>
                )}
                {sy.name === "Daoism" && (
                  <g>
                    <circle r={30} fill="#1a2a3a" stroke="#f3e6cf" strokeWidth={3} />
                    <path d="M 0 -30 A 30 30 0 0 1 0 30 A 15 15 0 0 1 0 0 A 15 15 0 0 0 0 -30 Z" fill="#f3e6cf" />
                    <circle cy={-15} r={5} fill="#1a2a3a" />
                    <circle cy={15} r={5} fill="#f3e6cf" />
                  </g>
                )}
              </g>
            );
          })}
          <text y={262} textAnchor="middle" fill={CREAM} fontFamily={SERIF} fontWeight={700} fontSize={52}>Religious Tolerance</text>
          <text y={304} textAnchor="middle" fill={CREAM} opacity={0.85} fontFamily={SANS} fontSize={28}>Christians, Muslims, Buddhists, Daoists</text>
        </g>
      </svg>
    </>
  );
};
