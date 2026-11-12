import { useMemo } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { ThreeCanvas } from "@remotion/three";
import { DetailedRider } from "./characters";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

/**
 * Test scene: a night on the Mongolian steppe.
 * Style: flat 2D shapes (no lighting, solid colours, warm glows) placed at
 * different depths in 3D, so a moving camera gives a parallax "2.5D" feel.
 *
 * Every animation is driven by useCurrentFrame() so renders are deterministic.
 */

const COLORS = {
  skyTop: "#140e28",
  skyMid: "#55325f",
  horizon: "#f0a05c",
  moon: "#fff3d6",
  farMountains: "#6a4370",
  midMountains: "#46305b",
  riderHill: "#2b1d3c",
  yurtGround: "#1c1329",
  foreground: "#0d0914",
  ink: "#09060e",
  warm: "#ffb35c",
  ember: "#ffd27f",
  red: "#d4473b",
  gold: "#f1c232",
  felt: "#3a2a4c",
  roof: "#2d1f3e",
  stripeA: "#a83f48",
  stripeB: "#d9c4a3",
};

// ---------- helpers ----------

/** Seeded random numbers, so the scene looks the same every render. */
export const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export type HeightFn = (x: number) => number;

/** Pointy mountain range. */
export const mountains = (seed: number, base: number, amp: number, freq: number): HeightFn => {
  const r = seeded(seed);
  const p = [r() * 6, r() * 6, r() * 6];
  const peak = (t: number) => 1 - Math.abs(Math.sin(t));
  return (x) =>
    base +
    amp * (0.55 * peak(x * freq + p[0]) + 0.3 * peak(x * freq * 2.1 + p[1]) + 0.15 * peak(x * freq * 4.3 + p[2]));
};

/** Soft rolling hills. */
export const hills = (seed: number, base: number, amp: number, freq: number): HeightFn => {
  const r = seeded(seed);
  const p = [r() * 6, r() * 6];
  return (x) => base + amp * (0.7 * Math.sin(x * freq + p[0]) + 0.3 * Math.sin(x * freq * 2.7 + p[1]));
};

// Ground layers, back to front (z = depth, more negative = further away)
const FAR_MOUNTAINS = mountains(3, -2.8, 4.2, 0.18);
const MID_MOUNTAINS = mountains(11, -3.2, 2.6, 0.28);
const RIDER_HILL = hills(5, -2.15, 0.25, 0.22);
const YURT_GROUND = hills(8, -2.35, 0.12, 0.35);
const FOREGROUND = hills(21, -2.72, 0.08, 0.9);

export const Ridge: React.FC<{ h: HeightFn; z: number; color: string }> = ({ h, z, color }) => {
  const geometry = useMemo(() => {
    const s = new THREE.Shape();
    const x0 = -60;
    const x1 = 60;
    s.moveTo(x0, -40);
    for (let i = 0; i <= 400; i++) {
      const x = x0 + ((x1 - x0) * i) / 400;
      s.lineTo(x, h(x));
    }
    s.lineTo(x1, -40);
    s.closePath();
    return new THREE.ShapeGeometry(s);
  }, [h]);
  return (
    <mesh geometry={geometry} position={[0, 0, z]}>
      <meshBasicMaterial color={color} />
    </mesh>
  );
};

/** A flat coloured circle/ellipse. */
export const Blob: React.FC<{
  position: [number, number, number];
  scale?: [number, number, number];
  rotation?: number;
  color: string;
  radius?: number;
}> = ({ position, scale = [1, 1, 1], rotation = 0, color, radius = 0.5 }) => (
  <mesh position={position} scale={scale} rotation={[0, 0, rotation]}>
    <circleGeometry args={[radius, 32]} />
    <meshBasicMaterial color={color} />
  </mesh>
);

/** A flat rectangle. */
export const Rect: React.FC<{
  position: [number, number, number];
  size: [number, number];
  rotation?: number;
  color: string;
  opacity?: number;
}> = ({ position, size, rotation = 0, color, opacity = 1 }) => (
  <mesh position={position} rotation={[0, 0, rotation]}>
    <planeGeometry args={size} />
    <meshBasicMaterial color={color} transparent={opacity < 1} opacity={opacity} />
  </mesh>
);

// ---------- glows & sky (small custom shaders) ----------

const VERT = /* glsl */ `
varying vec2 vUv;
varying float vY;
void main() {
  vUv = uv;
  vY = (modelMatrix * vec4(position, 1.0)).y;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const GLOW_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uIntensity;
uniform float uFalloff;
varying vec2 vUv;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float a = pow(clamp(1.0 - d, 0.0, 1.0), uFalloff) * uIntensity;
  gl_FragColor = vec4(uColor, a);
  #include <colorspace_fragment>
}`;

const SKY_FRAG = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uMid;
uniform vec3 uHorizon;
varying float vY;
void main() {
  vec3 c = vY < 2.0
    ? mix(uHorizon, uMid, smoothstep(-4.0, 2.0, vY))
    : mix(uMid, uTop, smoothstep(2.0, 16.0, vY));
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`;

const RAYS_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
uniform float uIntensity;
varying vec2 vUv;
void main() {
  vec2 p = vUv - 0.5;
  float ang = atan(p.y, p.x);
  float r = length(p);
  float rays = pow(0.5 + 0.5 * sin(ang * 13.0 + uTime * 0.15), 10.0) * 0.6
             + pow(0.5 + 0.5 * sin(ang * 7.0 - uTime * 0.1 + 1.3), 14.0) * 0.5;
  float a = rays * exp(-r * 5.5) * uIntensity;
  gl_FragColor = vec4(uColor, a);
  #include <colorspace_fragment>
}`;

export const Glow: React.FC<{
  position: [number, number, number];
  size: number;
  color: string;
  intensity?: number;
  falloff?: number;
}> = ({ position, size, color, intensity = 1, falloff = 2 }) => {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: new THREE.Color(color) },
          uIntensity: { value: intensity },
          uFalloff: { value: falloff },
        },
        vertexShader: VERT,
        fragmentShader: GLOW_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [color, falloff],
  );
  material.uniforms.uIntensity.value = intensity;
  return (
    <mesh position={position} material={material}>
      <planeGeometry args={[size, size]} />
    </mesh>
  );
};

const Sky: React.FC = () => {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uTop: { value: new THREE.Color(COLORS.skyTop) },
          uMid: { value: new THREE.Color(COLORS.skyMid) },
          uHorizon: { value: new THREE.Color(COLORS.horizon) },
        },
        vertexShader: VERT,
        fragmentShader: SKY_FRAG,
      }),
    [],
  );
  return (
    <mesh position={[0, 4, -40]} material={material}>
      <planeGeometry args={[160, 90]} />
    </mesh>
  );
};

// ---------- sky details ----------

const MOON_POS: [number, number, number] = [15, 6.5, -38];

const Moon: React.FC<{ frame: number }> = ({ frame }) => {
  const rays = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: new THREE.Color(COLORS.moon) },
          uTime: { value: 0 },
          uIntensity: { value: 0.28 },
        },
        vertexShader: VERT,
        fragmentShader: RAYS_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  );
  rays.uniforms.uTime.value = frame / 30;
  const [x, y, z] = MOON_POS;
  return (
    <group>
      <mesh position={[x, y, z - 0.5]} material={rays}>
        <planeGeometry args={[70, 70]} />
      </mesh>
      <Glow position={[x, y, z - 0.3]} size={22} color="#ffd9a8" intensity={0.45} falloff={2.4} />
      <Glow position={[x, y, z - 0.2]} size={8} color={COLORS.moon} intensity={0.7} falloff={1.6} />
      <Blob position={[x, y, z]} radius={2.1} color={COLORS.moon} />
    </group>
  );
};

const Stars: React.FC<{ frame: number }> = ({ frame }) => {
  const stars = useMemo(() => {
    const r = seeded(42);
    return Array.from({ length: 90 }, () => ({
      x: (r() - 0.5) * 70,
      y: 1 + r() * 18,
      size: 0.04 + r() * 0.09,
      speed: 0.03 + r() * 0.08,
      phase: r() * 6.28,
    }));
  }, []);
  return (
    <group position={[0, 0, -39]}>
      {stars.map((s, i) => (
        <mesh key={i} position={[s.x, s.y, 0]}>
          <circleGeometry args={[s.size, 8]} />
          <meshBasicMaterial
            color="#fff6e0"
            transparent
            opacity={0.35 + 0.65 * (0.5 + 0.5 * Math.sin(frame * s.speed + s.phase))}
          />
        </mesh>
      ))}
    </group>
  );
};

// ---------- yurts ----------

const Yurt: React.FC<{ x: number; z: number; scale?: number; frame: number; seed: number }> = ({
  x,
  z,
  scale = 1,
  frame,
  seed,
}) => {
  const roof = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-0.95, 0.58);
    s.quadraticCurveTo(-0.55, 1.02, 0, 1.16);
    s.quadraticCurveTo(0.55, 1.02, 0.95, 0.58);
    s.closePath();
    return new THREE.ShapeGeometry(s);
  }, []);
  const flicker = 0.85 + 0.1 * Math.sin(frame * 0.35 + seed) + 0.05 * Math.sin(frame * 1.1 + seed * 2);
  const stripes = 9;
  return (
    <group position={[x, YURT_GROUND(x), z]} scale={scale}>
      {/* warm light spilling onto the ground */}
      <Glow position={[0, 0.15, -0.02]} size={3.6} color={COLORS.warm} intensity={0.35 * flicker} falloff={2.2} />
      {/* felt wall */}
      <Rect position={[0, 0.3, 0]} size={[1.7, 0.62]} color={COLORS.felt} />
      {/* decorative band */}
      {Array.from({ length: stripes }, (_, i) => (
        <Rect
          key={i}
          position={[-0.85 + (1.7 / stripes) * (i + 0.5), 0.55, 0.005]}
          size={[1.7 / stripes, 0.09]}
          color={i % 2 ? COLORS.stripeA : COLORS.stripeB}
          opacity={0.85}
        />
      ))}
      {/* roof + crown */}
      <mesh geometry={roof} position={[0, 0, 0.004]}>
        <meshBasicMaterial color={COLORS.roof} />
      </mesh>
      <Rect position={[0, 1.17, 0.006]} size={[0.22, 0.06]} color={COLORS.stripeA} />
      {/* glowing doorway */}
      <Rect position={[0, 0.22, 0.01]} size={[0.34, 0.44]} color={COLORS.warm} />
      <Glow position={[0, 0.25, 0.02]} size={1.4} color={COLORS.warm} intensity={0.55 * flicker} falloff={2} />
    </group>
  );
};

// ---------- hats ----------

/** Round Mongol-style hat: coloured dome, dark fur brim and a little top knot. */
export const Hat: React.FC<{ position: [number, number, number]; size: number; color: string }> = ({
  position,
  size,
  color,
}) => (
  <group position={position} scale={size}>
    <mesh position={[0, 0, 0]}>
      <circleGeometry args={[0.5, 24, 0, Math.PI]} />
      <meshBasicMaterial color={color} />
    </mesh>
    <Rect position={[0, 0.02, 0.002]} size={[1.25, 0.24]} color="#5a3b2a" />
    <Blob position={[0, 0.52, 0.002]} radius={0.09} color={color} />
  </group>
);

// ---------- riders ----------

/** Rider on horseback (detailed version lives in characters.tsx). */
export const Rider: React.FC<{
  frame: number;
  offset: number;
  hat: string;
  banner?: boolean;
  robe?: string;
  pose?: "reins" | "draw";
  armor?: boolean;
  mustache?: boolean;
  female?: boolean;
  rider?: boolean;
}> = ({ frame, offset, hat, banner, robe, pose, armor, mustache, female, rider }) => (
  <DetailedRider
    frame={frame}
    offset={offset}
    hat={hat}
    banner={banner}
    robe={robe ?? (hat === COLORS.gold ? "#a8302a" : "#2f5aa8")}
    pose={pose}
    armor={armor}
    mustache={mustache}
    female={female}
    rider={rider}
  />
);

// ---------- campfire + people ----------

const FIRE_X = -1.6;
const FIRE_Z = 0.4;

const Campfire: React.FC<{ frame: number }> = ({ frame }) => {
  const flame = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.quadraticCurveTo(0.22, 0.05, 0.16, 0.25);
    s.quadraticCurveTo(0.08, 0.45, 0, 0.7);
    s.quadraticCurveTo(-0.08, 0.45, -0.16, 0.25);
    s.quadraticCurveTo(-0.22, 0.05, 0, 0);
    return new THREE.ShapeGeometry(s);
  }, []);
  const embers = useMemo(() => {
    const r = seeded(7);
    return Array.from({ length: 16 }, () => ({ off: r() * 70, life: 45 + r() * 35, dx: r() - 0.5, p: r() * 6 }));
  }, []);
  const f = (i: number) => 0.8 + 0.18 * Math.sin(frame * 0.9 + i * 2) + 0.08 * Math.sin(frame * 2.3 + i);
  const y = FOREGROUND(FIRE_X);
  return (
    <group position={[FIRE_X, y, FIRE_Z]}>
      <Glow position={[0, 0.3, -0.05]} size={5.5} color={COLORS.warm} intensity={0.45 * f(0)} falloff={2.3} />
      <Rect position={[0, 0.04, 0]} size={[0.6, 0.07]} rotation={0.25} color="#2a1810" />
      <Rect position={[0, 0.04, 0.001]} size={[0.6, 0.07]} rotation={-0.25} color="#22140c" />
      {[
        { c: "#e5512e", s: 1.0, x: -0.06 },
        { c: "#ff9a3d", s: 0.78, x: 0.05 },
        { c: "#ffe08a", s: 0.48, x: 0 },
      ].map((fl, i) => (
        <mesh key={i} geometry={flame} position={[fl.x, 0.05, 0.01 + i * 0.002]} scale={[fl.s, fl.s * f(i + 1), 1]}>
          <meshBasicMaterial color={fl.c} />
        </mesh>
      ))}
      <Glow position={[0, 0.3, 0.02]} size={1.4} color={COLORS.ember} intensity={0.8 * f(1)} falloff={1.8} />
      {embers.map((e, i) => {
        const t = ((frame + e.off) % e.life) / e.life;
        return (
          <Glow
            key={i}
            position={[e.dx * 0.3 + Math.sin(t * 6 + e.p) * 0.18, 0.3 + t * 2.0, 0.03]}
            size={0.14}
            color={COLORS.ember}
            intensity={(1 - t) * 1.2}
            falloff={1.5}
          />
        );
      })}
    </group>
  );
};

/** A simple sitting person with a tiny happy face. facing = 1 looks right, -1 looks left. */
const SittingPerson: React.FC<{ x: number; facing: 1 | -1; hat: string; frame: number; seed: number }> = ({
  x,
  facing,
  hat,
  frame,
  seed,
}) => {
  const breathe = 1 + Math.sin(frame * 0.08 + seed) * 0.02;
  const nod = Math.sin(frame * 0.05 + seed) * 0.05;
  return (
    <group position={[x, FOREGROUND(x), FIRE_Z + 0.05]} scale={[facing, 1, 1]}>
      {/* body */}
      <Blob position={[0, 0.28, 0]} scale={[0.36, 0.56 * breathe, 1]} radius={0.5} color={COLORS.ink} />
      {/* arm reaching to the fire */}
      <Rect position={[0.17, 0.3, 0.005]} size={[0.3, 0.07]} rotation={-0.35} color={COLORS.ink} />
      {/* head */}
      <group position={[0.02, 0.68, 0.01]} rotation={[0, 0, nod]}>
        <Blob position={[0, 0, 0]} radius={0.15} color={COLORS.ink} />
        {/* happy closed eyes (^ ^) and smile, turned toward the fire */}
        <mesh position={[0.03, 0.02, 0.01]}>
          <ringGeometry args={[0.018, 0.027, 12, 1, 0, Math.PI]} />
          <meshBasicMaterial color="#fff6e8" />
        </mesh>
        <mesh position={[0.1, 0.02, 0.01]}>
          <ringGeometry args={[0.018, 0.027, 12, 1, 0, Math.PI]} />
          <meshBasicMaterial color="#fff6e8" />
        </mesh>
        <mesh position={[0.065, -0.03, 0.01]}>
          <ringGeometry args={[0.035, 0.045, 12, 1, Math.PI + 0.5, Math.PI - 1]} />
          <meshBasicMaterial color="#fff6e8" />
        </mesh>
        {/* hat */}
        <Hat position={[0, 0.1, 0.012]} size={0.3} color={hat} />
      </group>
    </group>
  );
};

const Grass: React.FC<{ frame: number }> = ({ frame }) => {
  const blades = useMemo(() => {
    const r = seeded(99);
    return Array.from({ length: 140 }, () => ({ x: (r() - 0.5) * 22, h: 0.12 + r() * 0.3, p: r() * 6, lean: (r() - 0.5) * 0.4 }));
  }, []);
  return (
    <group position={[0, 0, 1.2]}>
      {blades.map((b, i) => (
        <group key={i} position={[b.x, FOREGROUND(b.x) - 0.12, 0]} rotation={[0, 0, b.lean + Math.sin(frame * 0.05 + b.p) * 0.08]}>
          <mesh position={[0, b.h / 2, 0]}>
            <planeGeometry args={[0.03, b.h]} />
            <meshBasicMaterial color={COLORS.foreground} />
          </mesh>
        </group>
      ))}
      <Ridge h={(x) => FOREGROUND(x) - 0.1} z={0} color={COLORS.foreground} />
    </group>
  );
};

// ---------- camera ----------

const CameraRig: React.FC<{ frame: number; duration: number }> = ({ frame, duration }) => {
  const { camera } = useThree();
  const t = interpolate(frame, [0, duration], [0, 1], { easing: Easing.inOut(Easing.sin) });
  camera.position.set(interpolate(t, [0, 1], [-1.8, 1.8]), interpolate(t, [0, 1], [-0.1, 0.15]), interpolate(t, [0, 1], [10, 8.6]));
  camera.lookAt(camera.position.x * 0.6, -0.4, 0);
  return null;
};

// ---------- the scene ----------

export const SteppeNight: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height, durationInFrames } = useVideoConfig();

  // riders gallop across from left to right
  const ridersX = interpolate(frame, [0, durationInFrames], [-13, 9]);

  const titleIn = interpolate(frame, [35, 75], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const titleOut = interpolate(frame, [durationInFrames - 50, durationInFrames - 20], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.skyTop }}>
      <ThreeCanvas width={width} height={height} flat camera={{ fov: 35, position: [0, 0, 10] }}>
        <CameraRig frame={frame} duration={durationInFrames} />
        <Sky />
        <Stars frame={frame} />
        <Moon frame={frame} />

        <Ridge h={FAR_MOUNTAINS} z={-26} color={COLORS.farMountains} />
        <Ridge h={MID_MOUNTAINS} z={-16} color={COLORS.midMountains} />

        {/* riders on the hill */}
        <Ridge h={RIDER_HILL} z={-8} color={COLORS.riderHill} />
        {[
          { dx: 0, off: 0, hat: COLORS.red, banner: true },
          { dx: -1.5, off: 1.7, hat: COLORS.gold },
          { dx: -2.9, off: 3.1, hat: COLORS.red },
        ].map((r, i) => {
          const x = ridersX + r.dx;
          return (
            <group key={i} position={[x, RIDER_HILL(x) - 0.05, -7.9 + i * 0.05]} scale={0.75}>
              <Rider frame={frame} offset={r.off} hat={r.hat} banner={r.banner} />
            </group>
          );
        })}

        {/* camp */}
        <Ridge h={YURT_GROUND} z={-3} color={COLORS.yurtGround} />
        <Yurt x={-4.6} z={-2.95} scale={0.95} frame={frame} seed={1} />
        <Yurt x={1.4} z={-2.9} scale={1.1} frame={frame} seed={2} />
        <Yurt x={4.3} z={-2.94} scale={0.8} frame={frame} seed={3} />

        {/* foreground: campfire, two friends, grass */}
        <Ridge h={FOREGROUND} z={0.3} color={COLORS.foreground} />
        <Campfire frame={frame} />
        <SittingPerson x={FIRE_X - 0.75} facing={1} hat={COLORS.gold} frame={frame} seed={1} />
        <SittingPerson x={FIRE_X + 0.75} facing={-1} hat={COLORS.red} frame={frame} seed={4} />
        <Grass frame={frame} />
      </ThreeCanvas>

      {/* soft vignette */}
      <AbsoluteFill
        style={{ background: "radial-gradient(ellipse at 50% 45%, transparent 55%, rgba(8,4,16,0.55) 100%)" }}
      />

      {/* title */}
      <AbsoluteFill
        style={{
          justifyContent: "flex-start",
          alignItems: "center",
          paddingTop: height * 0.12,
          opacity: titleIn * titleOut,
          transform: `translateY(${(1 - titleIn) * 20}px)`,
          color: "#fff3df",
          fontFamily: "Georgia, 'Times New Roman', serif",
          textShadow: "0 4px 30px rgba(0,0,0,0.5)",
        }}
      >
        <div style={{ fontSize: height * 0.022, letterSpacing: "0.5em", opacity: 0.8 }}>MONGOLIAN STEPPE · 1206</div>
        <div style={{ fontSize: height * 0.075, letterSpacing: "0.12em", marginTop: height * 0.01 }}>
          The Mongol Empire
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
