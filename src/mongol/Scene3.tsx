import { useMemo } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { ThreeCanvas } from "@remotion/three";
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Bed, Cue, SceneSounds } from "./sfx";
import { remapTime } from "./timeRemap";
import { EurasiaMap, SUN, useHeightSampler, useMapTextures } from "./map/EurasiaMap";
import { MAP_H, MAP_W, WAVES, project } from "./map/config.js";
import { Glow, seeded } from "./SteppeNight";
import { CameraRig, Cloud, FOV, Key, Label, Pose, poseAt, useProjector, worldAt } from "./map/mapScene";
import { CITY_SCALE, CampsAndHerds, Countryside, CountryPeople, KarakorumCity, Roads, Surroundings, Traffic } from "./karakorum";

/**
 * Scene 3 - Base & geographic reach (1:10-1:50, 40 s)
 *   Part A 0-15 s   Drop through clouds onto the map, zoom sharply into the Mongolian
 *                   steppe. A pin drops on Karakorum (a little 3D city model).
 *   Part B 15-30 s  Pull back to the whole empire at its height; callouts pop up.
 *   Part C 30-40 s  Dashed routes draw from Karakorum to Beijing, Baghdad and Moscow,
 *                   with pulses travelling along them.
 * Ends on the full map (no fade) so Scene 4 can continue on the same map.
 */

// Internal animation timeline (frames). The scene is played back faster to fit the
// 3-minute video: see TIME_MAP / remapTime.
const SCENE3_TIMELINE = 1200;
export const SCENE3_FRAMES = 750; // 25 s in the final video
const TIME_MAP: [number, number][] = [[0, 0], [150, 205], [300, 450], [560, 900], [750, 1200]];
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

const makeKeys = (kz: number): Key[] => [
  { f: 0, lon: 80, lat: 44, z: 0, dist: 245, tilt: 26, turn: -8 },
  { f: 45, lon: 82, lat: 44.5, z: 0, dist: 228, tilt: 29, turn: -7 },
  { f: PIN, lon: KARAKORUM[0], lat: KARAKORUM[1] + 0.4, z: kz + 0.2, dist: 17, tilt: 47, turn: -28, ease: Easing.inOut(Easing.cubic) },
  { f: 330, lon: KARAKORUM[0] + 0.4, lat: KARAKORUM[1] - 0.2, z: kz + 0.15, dist: 9.5, tilt: 57, turn: -6, ease: Easing.inOut(Easing.sin) },
  { f: PART_B, lon: KARAKORUM[0] + 0.3, lat: KARAKORUM[1] + 0.4, z: kz + 0.2, dist: 14, tilt: 50, turn: 14, ease: Easing.inOut(Easing.sin) },
  { f: 690, lon: 76, lat: 43.5, z: 0, dist: 165, tilt: 38, turn: 2, ease: Easing.inOut(Easing.cubic) },
  { f: PART_C, lon: 76, lat: 43.5, z: 0, dist: 157, tilt: 38, turn: 5, ease: Easing.inOut(Easing.sin) },
  { f: SCENE3_TIMELINE, lon: 78, lat: 45, z: 0, dist: 138, tilt: 44, turn: 9, ease: Easing.inOut(Easing.sin) },
];

// ======================================================================
// Clouds
// ======================================================================

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
    const below = Array.from({ length: 22 }, (_, i) => {
      const a = (i / 22) * Math.PI * 2 + r() * 0.2;
      return {
        base: new THREE.Vector3(Math.cos(a) * MAP_W * (0.5 + r() * 0.25), Math.sin(a) * MAP_H * (0.55 + r() * 0.35), -16 + r() * 6),
        size: 34 + r() * 26,
        seed: r() * 50,
        high: false,
        under: true,
      };
    });
    return [...near.map((c) => ({ ...c, under: false })), ...far.map((c) => ({ ...c, under: false })), ...below];
  }, []);
  return (
    <>
      {clouds.map((c, i) => {
        const p = c.base.clone().add(new THREE.Vector3(frame * 0.012, frame * 0.004, 0));
        const camDist = p.distanceTo(pose.position);
        // fade clouds that are right in front of the lens, and thin them out in close-ups
        let o = (c.high ? 0.35 : 0.85) * interpolate(camDist, [2, 9], [0, 1], clamp);
        if (c.under) o = 0.8 * interpolate(pose.dist, [70, 140], [0, 1], clamp);
        else if (c.high) o *= interpolate(pose.dist, [60, 140], [0, 1], clamp);
        else o *= interpolate(pose.dist, [14, 28, 110, 170], [0, 1, 1, 0], clamp);
        return <Cloud key={i} position={p} size={c.size} seed={c.seed} opacity={o} />;
      })}
    </>
  );
};

// ======================================================================
// Karakorum: a small 3D model of the capital
// ======================================================================

/** Orkhon River running past the capital (points already sit on the ground). */
const OrkhonRiver: React.FC<{ points: THREE.Vector3[]; appear: number }> = ({ points, appear }) => {
  const geometry = useMemo(() => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 400, 0.085, 6, false), [points]);
  if (appear <= 0.01) return null;
  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial color="#4fa6cf" roughness={0.25} metalness={0.1} transparent opacity={appear} />
    </mesh>
  );
};

/** Gold map pin that drops onto Karakorum, with ripples on the ground. */
const Pin: React.FC<{ frame: number; base: THREE.Vector3; visible: number }> = ({ frame, base, visible }) => {
  const { fps } = useVideoConfig();
  const drop = spring({ frame: frame - (PIN - 18), fps, config: { damping: 9, stiffness: 140 } });
  if (frame < PIN - 18 || visible <= 0.01) return null;
  const height = 1.5 + (1 - drop) * 7;
  // ripples only right after the pin lands
  const ripples = [0, 1, 2].map((i) => (frame - PIN - i * 14 > 70 ? 1 : ((frame - PIN - i * 14) % 42) / 42));
  return (
    <group position={base} scale={visible * 1.3}>
      {ripples.map((t, i) =>
        frame - PIN - i * 14 >= 0 ? (
          <mesh key={i} position={[0, 0, 0.12]}>
            <ringGeometry args={[0.3 + t * 3.4, 0.38 + t * 3.4, 64]} />
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

// ---------- sound effects (see sfx.tsx) ----------
const SOUND_BEDS: Bed[] = [["wind", 0, SCENE3_TIMELINE, 0.07]];
const SOUND_CUES: Cue[] = [
  [0, "whoosh-down", 0.24], [60, "whoosh", 0.24], [125, "whoosh", 0.18],
  [PIN - 6, "thunk", 0.32], [PIN - 4, "chime", 0.22], [PIN + 12, "pop", 0.24], [PIN + 60, "birds", 0.12],
  [PART_B + 20, "whoosh", 0.22],
  ...CALLOUTS.map((c): Cue => [c.f, "pop", 0.18]),
  [850, "whoosh", 0.1],
  ...CITIES.map((c): Cue => [c.start, "shimmer", 0.15]),
];

export const Scene3: React.FC = () => {
  const frame = remapTime(useCurrentFrame(), TIME_MAP);
  const { width, height, fps } = useVideoConfig();
  const textures = useMapTextures();
  const h = useHeightSampler(textures);

  const kzRaw = h ? h(...KARAKORUM) : 1;
  const kz = kzRaw;
  const [kxw, kyw] = project(...KARAKORUM);
  const FLAT_R = 6.0;
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
  const pinWorld = useMemo(() => new THREE.Vector3(kxw, kyw + 2.3, kz + 0.6), [kxw, kyw, kz]); // just beyond the north gate

  // everything around the city, placed on the (flattened) terrain
  const surroundings = useMemo<Surroundings | null>(() => {
    if (!h || !hFlat) return null;
    const c40 = Math.cos((40 * Math.PI) / 180);
    return {
      cx: kxw,
      cy: kyw,
      toLonLat: (x: number, y: number) => [KARAKORUM[0] + (x - kxw) / c40, KARAKORUM[1] + (y - kyw)],
      h: hFlat,
      raw: h,
    };
  }, [h, hFlat, kxw, kyw]);
  const river = useMemo(() => {
    if (!surroundings) return [];
    const rough = new THREE.CatmullRomCurve3(
      [[-4.4, -8], [-3.7, -5], [-3.2, -2.4], [-2.95, 0], [-2.75, 2.3], [-2.2, 4.1], [-1.1, 5.7], [0.7, 7.2], [2.6, 8.4], [4.8, 9.6]].map(
        ([dx, dy]) => new THREE.Vector3(kxw + dx, kyw + dy, 0),
      ),
    );
    return rough.getSpacedPoints(300).map((q) => new THREE.Vector3(q.x, q.y, surroundings.h(...surroundings.toLonLat(q.x, q.y)) + 0.06));
  }, [surroundings, kxw, kyw]);
  const showCountry = frame > PIN - 90 && frame < PART_B + 140;
  const sunTarget = useMemo(() => new THREE.Object3D(), []);
  sunTarget.position.set(kxw, kyw, kz);
  sunTarget.updateMatrixWorld();
  const pinLabel = project2D(pinWorld);
  const pinLabelS = spring({ frame: frame - (PIN + 12), fps, config: { damping: 12 } }) * interpolate(frame, [PART_B - 10, PART_B + 15], [1, 0], clamp);

  return (
    <AbsoluteFill
      style={{ background: "radial-gradient(circle at 12% 8%, #fffbe8 0%, #d9f0ef 14%, #7fc0d6 34%, #3a7fa8 62%, #1d4a6e 100%)" }}
    >
      {textures && h && (
        <ThreeCanvas width={width} height={height} flat shadows camera={{ fov: FOV, near: 0.1, far: 3000 }}>
          <CameraRig pose={pose} />
          <hemisphereLight args={["#e4f1ff", "#6f7f4a", 1.15]} />
          <primitive object={sunTarget} />
          <directionalLight
            position={[kxw + SUN.x * 30, kyw + SUN.y * 30, kz + SUN.z * 30]}
            target={sunTarget}
            intensity={2.4}
            color="#fff1dc"
            castShadow
            shadow-mapSize={[2048, 2048]}
            shadow-bias={-0.0004}
            shadow-camera-left={-7}
            shadow-camera-right={7}
            shadow-camera-top={7}
            shadow-camera-bottom={-7}
            shadow-camera-near={1}
            shadow-camera-far={80}
          />
          <EurasiaMap
            textures={textures}
            progress={WAVES.length}
            glow={0}
            empireOpacity={empireOpacity}
            detail={detail}
            borderGlow={borderGlow}
            flat={{ x: kxw, y: kyw, radius: FLAT_R, height: kz, amount: flatAmt }}
          />
          <OrkhonRiver points={river} appear={cityAppear} />
          {cityAppear > 0.01 && (
            <group position={[kxw, kyw, kz]} scale={CITY_SCALE * cityAppear}>
              <KarakorumCity frame={frame} />
            </group>
          )}
          {showCountry && surroundings && (
            <group scale={[1, 1, Math.max(0.001, Math.min(1, cityAppear * 1.2))]}>
              <Roads s={surroundings} />
              <Traffic s={surroundings} frame={frame} />
              <CampsAndHerds s={surroundings} frame={frame} />
              <Countryside s={surroundings} river={river} />
              <CountryPeople s={surroundings} frame={frame} />
            </group>
          )}
          {/* catches building shadows on the valley floor */}
          {cityAppear > 0.01 && (
            <mesh position={[kxw, kyw, kz + 0.004]} receiveShadow>
              <circleGeometry args={[3.3, 64]} />
              <shadowMaterial opacity={0.28} />
            </mesh>
          )}
          <Pin frame={frame} base={new THREE.Vector3(kxw, kyw, kz + 0.05)} visible={interpolate(frame, [PIN + 50, PIN + 85], [1, 0], clamp)} />
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
        <Label x={pinLabel.x} y={Math.max(150, pinLabel.y)} title="Karakorum" sub="Imperial Capital · Orkhon Valley" s={pinLabelS} lift={30} dot={false} />
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
      <SceneSounds cues={SOUND_CUES} beds={SOUND_BEDS} map={TIME_MAP} />
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
