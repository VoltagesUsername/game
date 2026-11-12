import { useMemo } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { ThreeCanvas } from "@remotion/three";
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Blob, Glow, Hat, Rect, Ridge, Rider, hills, mountains, seeded } from "./SteppeNight";

/**
 * Scene 2 - Background & rise to power (0:30-1:10). Parts 1 and 2 so far.
 *   Part 1 (0:30-0:42)  Five rival clans clash before dawn. At 1206 a golden shockwave
 *                       pulls them into one banner: Genghis Khan. The sun rises.
 *   Part 2 (0:42-0:55)  A new order: Royal Blood (X) vs Meritocracy (check);
 *                       people in the army pyramid get promoted upward.
 * Frames are local to this scene (30 fps). They get synced to the voiceover later.
 */

const UNIFY = 210; // the 1206 moment
const PART_2 = 360;
const END = 750;

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "'Avenir Next', 'Helvetica Neue', Helvetica, Arial, sans-serif";
const CREAM = "#fffaf0";
const GOLD = "#ffc94d";
const RED = "#c8332b";

// ======================================================================
// 3D landscape: pre-dawn steppe that turns into sunrise
// ======================================================================

const lerpColor = (a: string, b: string, t: number) => "#" + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString();

const NIGHT = {
  top: "#0d1230", mid: "#262a52", horizon: "#4d4370",
  far: "#2a2a4a", mid2: "#1f2340", ridge: "#191b33", near: "#121326", fg: "#0b0b18",
};
const SUNRISE = {
  top: "#4a76b8", mid: "#f0b48a", horizon: "#ffd890",
  far: "#9a86a8", mid2: "#6f8a63", ridge: "#4f7346", near: "#3b5d33", fg: "#24401f",
};
const palette = (t: number) =>
  Object.fromEntries(
    Object.keys(NIGHT).map((k) => [k, lerpColor(NIGHT[k as keyof typeof NIGHT], SUNRISE[k as keyof typeof NIGHT], t)]),
  ) as typeof NIGHT;

const FAR = mountains(31, -2.9, 3.4, 0.16);
const MID = hills(12, -2.6, 0.55, 0.2);
const RIDGE = hills(4, -2.35, 0.3, 0.3);
/** Near hill with a rounded top in the middle where Genghis Khan stands. */
const NEAR = (x: number) => -2.75 + 0.85 * Math.exp(-((x / 2.6) ** 2)) + 0.06 * Math.sin(x * 1.3);
const FG = hills(77, -2.95, 0.07, 0.8);

const SKY_VERT = /* glsl */ `
varying float vY;
void main() {
  vY = (modelMatrix * vec4(position, 1.0)).y;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const SKY_FRAG = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uMid;
uniform vec3 uHorizon;
varying float vY;
void main() {
  vec3 c = vY < 2.0
    ? mix(uHorizon, uMid, smoothstep(-4.0, 3.0, vY))
    : mix(uMid, uTop, smoothstep(3.0, 16.0, vY));
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`;

const Sky: React.FC<{ colors: { top: string; mid: string; horizon: string } }> = ({ colors }) => {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uTop: { value: new THREE.Color() }, uMid: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() } },
        vertexShader: SKY_VERT,
        fragmentShader: SKY_FRAG,
      }),
    [],
  );
  material.uniforms.uTop.value.set(colors.top);
  material.uniforms.uMid.value.set(colors.mid);
  material.uniforms.uHorizon.value.set(colors.horizon);
  return (
    <mesh position={[0, 4, -40]} material={material}>
      <planeGeometry args={[160, 90]} />
    </mesh>
  );
};

const Stars: React.FC<{ frame: number; opacity: number }> = ({ frame, opacity }) => {
  const stars = useMemo(() => {
    const r = seeded(17);
    return Array.from({ length: 80 }, () => ({
      x: (r() - 0.5) * 70, y: 2 + r() * 16, size: 0.04 + r() * 0.08, speed: 0.03 + r() * 0.08, phase: r() * 6.28,
    }));
  }, []);
  if (opacity <= 0.01) return null;
  return (
    <group position={[0, 0, -39]}>
      {stars.map((s, i) => (
        <mesh key={i} position={[s.x, s.y, 0]}>
          <circleGeometry args={[s.size, 8]} />
          <meshBasicMaterial color="#fff6e0" transparent opacity={opacity * (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(frame * s.speed + s.phase)))} />
        </mesh>
      ))}
    </group>
  );
};

/** Genghis Khan: a simple standing figure with a gold hat, holding a tall war banner. */
const Khan: React.FC<{ frame: number; rise: number }> = ({ frame, rise }) => {
  const wave = (i: number) => Math.sin(frame * 0.12 - i * 0.7) * 0.07;
  return (
    <group position={[0, NEAR(0) - 3.4 * (1 - rise), -4.1]}>
      {/* legs */}
      <Rect position={[-0.09, 0.22, 0]} size={[0.11, 0.46]} color="#09060e" />
      <Rect position={[0.09, 0.22, 0]} size={[0.11, 0.46]} color="#09060e" />
      {/* body + cape */}
      <Blob position={[0, 0.72, 0.005]} scale={[0.5, 0.82, 1]} radius={0.5} color="#09060e" />
      <Rect position={[-0.2, 0.62, -0.01]} size={[0.24, 0.7]} rotation={0.12 + Math.sin(frame * 0.1) * 0.04} color="#7a1712" />
      {/* arm to the banner */}
      <Rect position={[0.27, 0.86, 0.01]} size={[0.34, 0.09]} rotation={0.5} color="#09060e" />
      {/* head */}
      <group position={[0, 1.27, 0.01]}>
        <Blob position={[0, 0, 0]} radius={0.19} color="#09060e" />
        <mesh position={[0.045, 0.02, 0.01]}>
          <circleGeometry args={[0.022, 12]} />
          <meshBasicMaterial color="#fff6e8" />
        </mesh>
        <mesh position={[0.115, 0.02, 0.01]}>
          <circleGeometry args={[0.022, 12]} />
          <meshBasicMaterial color="#fff6e8" />
        </mesh>
        <mesh position={[0.08, -0.06, 0.01]}>
          <ringGeometry args={[0.04, 0.052, 12, 1, Math.PI + 0.5, Math.PI - 1]} />
          <meshBasicMaterial color="#fff6e8" />
        </mesh>
        <Hat position={[0, 0.13, 0.012]} size={0.4} color={GOLD} />
      </group>
      {/* war banner */}
      <group position={[0.45, 0, 0]}>
        <Rect position={[0, 1.15, 0]} size={[0.05, 2.3]} color="#2a1810" />
        <Blob position={[0, 2.32, 0.002]} radius={0.07} color={GOLD} />
        {[0, 1, 2, 3].map((i) => (
          <Rect
            key={i}
            position={[0.14 + i * 0.22, 2.05 + wave(i) * (i + 1) * 0.6, 0.004]}
            size={[0.23, 0.46 - i * 0.04]}
            rotation={wave(i)}
            color={i % 2 ? "#b8261e" : RED}
          />
        ))}
        <Rect position={[0.47, 1.8 + wave(2) * 1.2, 0.006]} size={[0.9, 0.05]} color={GOLD} />
      </group>
    </group>
  );
};

/** Riders from the five clans gather on the ridge after unification. */
const GatheringRiders: React.FC<{ frame: number }> = ({ frame }) => {
  const riders = [
    { stop: -6.2, from: -14, start: UNIFY + 45, hat: RED },
    { stop: -3.8, from: -14, start: UNIFY + 60, hat: GOLD },
    { stop: 3.8, from: 14, start: UNIFY + 52, hat: RED },
    { stop: 6.2, from: 14, start: UNIFY + 68, hat: GOLD },
    { stop: -8.4, from: -14, start: UNIFY + 75, hat: RED },
  ];
  return (
    <>
      {riders.map((r, i) => {
        const t = interpolate(frame, [r.start, r.start + 60], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
        if (t <= 0) return null;
        const x = interpolate(t, [0, 1], [r.from, r.stop]);
        const dir = r.from < r.stop ? 1 : -1;
        const offset = i * 1.3;
        // gallop while moving, then stand still with legs straight
        const still = (Math.round((frame * 0.42 + offset) / Math.PI) * Math.PI - offset) / 0.42;
        const f = t < 0.98 ? frame : still;
        return (
          <group key={i} position={[x, RIDGE(x) - 0.05, -8.9 + i * 0.02]} scale={[0.7 * dir, 0.7, 0.7]}>
            <Rider frame={f} offset={offset} hat={r.hat} banner={i === 0} />
          </group>
        );
      })}
    </>
  );
};

const CameraRig: React.FC<{ frame: number }> = ({ frame }) => {
  const { camera } = useThree();
  const t = interpolate(frame, [0, END], [0, 1], { easing: Easing.inOut(Easing.sin) });
  camera.position.set(interpolate(t, [0, 1], [-0.8, 0.8]), interpolate(t, [0, 1], [0.1, 0.35]), interpolate(t, [0, 1], [10, 9.2]));
  camera.lookAt(camera.position.x * 0.5, -0.2, 0);
  return null;
};

const Landscape: React.FC<{ frame: number; dawn: number; khanRise: number }> = ({ frame, dawn, khanRise }) => {
  const c = palette(dawn);
  const sunY = interpolate(dawn, [0, 1], [-7, 1.2]);
  return (
    <>
      <CameraRig frame={frame} />
      <Sky colors={c} />
      <Stars frame={frame} opacity={1 - dawn * 1.4} />
      {/* rising sun */}
      <group position={[-5, sunY, -38]}>
        <Glow position={[0, 0, -0.3]} size={34} color="#ffc070" intensity={0.55 * dawn} falloff={2.2} />
        <Glow position={[0, 0, -0.2]} size={10} color="#fff1c4" intensity={0.8 * dawn} falloff={1.5} />
        <Blob position={[0, 0, 0]} radius={2.4} color="#fff1c4" />
      </group>
      <Ridge h={FAR} z={-26} color={c.far} />
      <Ridge h={MID} z={-16} color={c.mid2} />
      <Ridge h={RIDGE} z={-9} color={c.ridge} />
      <GatheringRiders frame={frame} />
      <Khan frame={frame} rise={khanRise} />
      <Ridge h={NEAR} z={-4} color={c.near} />
      <Glow position={[0, NEAR(0) + 0.8, -3.9]} size={5} color="#ffd890" intensity={0.25 * khanRise * dawn} falloff={2} />
      <Ridge h={FG} z={1} color={c.fg} />
    </>
  );
};

// ======================================================================
// Part 1 overlay: five clan emblems clash, then unite
// ======================================================================

const CLANS = [
  { name: "Mongols", symbol: "sun" },
  { name: "Tatars", symbol: "moon" },
  { name: "Merkits", symbol: "arrow" },
  { name: "Keraites", symbol: "cross" },
  { name: "Naimans", symbol: "mountain" },
] as const;

type SymbolName = (typeof CLANS)[number]["symbol"];

const ClanSymbol: React.FC<{ name: SymbolName; color?: string }> = ({ name, color = CREAM }) => {
  switch (name) {
    case "sun":
      return (
        <g fill={color} stroke={color} strokeWidth={6} strokeLinecap="round">
          <circle r={12} />
          {Array.from({ length: 8 }, (_, i) => {
            const a = (i / 8) * Math.PI * 2;
            return <line key={i} x1={Math.cos(a) * 19} y1={Math.sin(a) * 19} x2={Math.cos(a) * 27} y2={Math.sin(a) * 27} />;
          })}
        </g>
      );
    case "moon":
      return <path d="M 8 -24 A 25 25 0 1 0 8 24 A 19 19 0 1 1 8 -24 Z" fill={color} />;
    case "arrow":
      return (
        <g stroke={color} strokeWidth={6} strokeLinecap="round" fill={color}>
          <line x1={-20} y1={20} x2={14} y2={-14} />
          <polygon points="24,-24 4,-18 18,-4" strokeWidth={2} strokeLinejoin="round" />
          <line x1={-20} y1={20} x2={-26} y2={8} />
          <line x1={-20} y1={20} x2={-8} y2={26} />
        </g>
      );
    case "cross":
      return <path d="M -7 -26 H 7 V -7 H 26 V 7 H 7 V 26 H -7 V 7 H -26 V -7 H -7 Z" fill={color} />;
    case "mountain":
      return <path d="M -28 20 L -6 -20 L 4 -4 L 12 -14 L 28 20 Z" fill={color} />;
  }
};

/** Jagged shield outline (teeth around a circle). */
const jagged = (r: number, teeth: number, depth: number, seed: number) => {
  const rnd = seeded(seed);
  const pts: string[] = [];
  for (let i = 0; i < teeth * 2; i++) {
    const a = (i / (teeth * 2)) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 ? r - depth * (0.6 + rnd() * 0.6) : r + rnd() * depth * 0.3;
    pts.push(`${(Math.cos(a) * rr).toFixed(1)},${(Math.sin(a) * rr).toFixed(1)}`);
  }
  return pts.join(" ");
};

const CENTER = { x: 960, y: 500 }; // middle of the clan ring
const BANNER = { x: 1390, y: 300, scale: 0.75 }; // where the unified banner appears
const clanBase = (k: number) => {
  const a = -Math.PI / 2 + (k / 5) * Math.PI * 2;
  return { x: CENTER.x + Math.cos(a) * 480, y: CENTER.y + Math.sin(a) * 230 };
};

const CLASHES: [number, number, number][] = [
  [0, 1, 30], [2, 3, 56], [1, 4, 82], [0, 2, 106], [3, 4, 130], [1, 3, 154], [0, 4, 178],
];
const CLASH_LEN = 24;

const clanPosition = (k: number, frame: number) => {
  const b = clanBase(k);
  let x = b.x + Math.sin(frame * 0.07 + k * 1.9) * 26;
  let y = b.y + Math.cos(frame * 0.09 + k * 2.3) * 18;
  for (const [a, c, start] of CLASHES) {
    if (k !== a && k !== c) continue;
    const t = (frame - start) / CLASH_LEN;
    if (t < 0 || t > 1) continue;
    const other = clanBase(k === a ? c : a);
    const lunge = Math.sin(Math.PI * t) ** 2 * 0.36;
    x += (other.x - b.x) * lunge;
    y += (other.y - b.y) * lunge;
  }
  return { x, y };
};

const ClanEmblems: React.FC<{ frame: number }> = ({ frame }) => {
  const { fps } = useVideoConfig();
  const pull = spring({ frame: frame - (UNIFY + 6), fps, config: { damping: 15, stiffness: 90 } });
  const appear = (k: number) => spring({ frame: frame - (8 + k * 5), fps, config: { damping: 11 } });
  if (pull > 0.995) return null;
  return (
    <g>
      {CLANS.map((c, k) => {
        const p = clanPosition(k, Math.min(frame, UNIFY + 6));
        const x = interpolate(pull, [0, 1], [p.x, BANNER.x]);
        const y = interpolate(pull, [0, 1], [p.y, BANNER.y]);
        const rot = Math.sin(frame * 0.15 + k) * 8 * (1 - pull);
        const s = appear(k) * interpolate(pull, [0, 1], [1, 0.35]);
        return (
          <g key={c.name} transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`} opacity={1 - pull ** 3}>
            <polygon points={jagged(78, 14, 16, k + 3)} fill={RED} stroke="#5c0f0b" strokeWidth={6} strokeLinejoin="round" />
            <polygon points={jagged(60, 14, 8, k + 9)} fill="#a6231c" />
            <ClanSymbol name={c.symbol} />
            <text y={118} textAnchor="middle" fill={CREAM} fontFamily={SANS} fontWeight={700} fontSize={30} letterSpacing="0.08em">
              {c.name.toUpperCase()}
            </text>
          </g>
        );
      })}
    </g>
  );
};

const ClashSparks: React.FC<{ frame: number }> = ({ frame }) => (
  <g>
    {CLASHES.map(([a, c, start], i) => {
      const t = (frame - (start + CLASH_LEN / 2 - 2)) / 12;
      if (t < 0 || t > 1) return null;
      const pa = clanPosition(a, start + CLASH_LEN / 2);
      const pc = clanPosition(c, start + CLASH_LEN / 2);
      const mx = (pa.x + pc.x) / 2;
      const my = (pa.y + pc.y) / 2;
      return (
        <g key={i} transform={`translate(${mx} ${my})`} opacity={1 - t}>
          <circle r={20 + t * 70} fill="none" stroke="#ffb347" strokeWidth={6 * (1 - t)} />
          {Array.from({ length: 10 }, (_, j) => {
            const ang = (j / 10) * Math.PI * 2 + i;
            const r0 = 18 + t * 40;
            const r1 = r0 + 30 * (1 - t);
            return (
              <line key={j} x1={Math.cos(ang) * r0} y1={Math.sin(ang) * r0} x2={Math.cos(ang) * r1} y2={Math.sin(ang) * r1}
                stroke="#ffe08a" strokeWidth={5} strokeLinecap="round" />
            );
          })}
        </g>
      );
    })}
  </g>
);

const Shockwave: React.FC<{ frame: number }> = ({ frame }) => (
  <g>
    {[0, 9, 18].map((d, i) => {
      const t = (frame - UNIFY - d) / 45;
      if (t < 0 || t > 1) return null;
      const e = Easing.out(Easing.cubic)(t);
      return (
        <circle key={i} cx={BANNER.x} cy={BANNER.y} r={30 + e * 1300} fill="none" stroke={GOLD}
          strokeWidth={(i === 0 ? 34 : 14) * (1 - t)} opacity={(1 - t) * (i === 0 ? 1 : 0.6)} />
      );
    })}
    {(() => {
      const t = (frame - UNIFY) / 30;
      if (t < 0 || t > 1) return null;
      return <circle cx={BANNER.x} cy={BANNER.y} r={260} fill="url(#flash)" opacity={Math.sin(Math.PI * t)} />;
    })()}
  </g>
);

const UnifiedBanner: React.FC<{ frame: number }> = ({ frame }) => {
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - (UNIFY + 28), fps, config: { damping: 10, stiffness: 120 } });
  const exit = interpolate(frame, [PART_2 - 25, PART_2], [0, 1], clamp);
  if (s <= 0.001 || exit >= 1) return null;
  const spin = interpolate(frame, [UNIFY + 28, PART_2], [-20, 0], clamp);
  return (
    <g transform={`translate(${BANNER.x} ${BANNER.y - exit * 60}) scale(${BANNER.scale * s * (1 - exit * 0.2)})`} opacity={1 - exit}>
      <circle r={200} fill="url(#bannerGlow)" />
      <g transform={`rotate(${spin})`}>
        <polygon points={jagged(150, 20, 18, 42)} fill={GOLD} stroke="#7a4a00" strokeWidth={6} strokeLinejoin="round" />
        <polygon points={jagged(128, 20, 10, 43)} fill={RED} />
        <circle r={104} fill="#a6231c" stroke={GOLD} strokeWidth={4} />
        {CLANS.map((c, k) => {
          const a = -Math.PI / 2 + (k / 5) * Math.PI * 2;
          return (
            <g key={c.name} transform={`translate(${Math.cos(a) * 66} ${Math.sin(a) * 66}) scale(0.62)`}>
              <ClanSymbol name={c.symbol} color={GOLD} />
            </g>
          );
        })}
        <polygon points="0,-24 7,-8 24,-8 10,3 15,20 0,10 -15,20 -10,3 -24,-8 -7,-8" fill={CREAM} />
      </g>
      <text y={218} textAnchor="middle" fill={CREAM} fontFamily={SERIF} fontWeight={700} fontSize={70} letterSpacing="0.08em"
        stroke="rgba(40,15,5,0.75)" strokeWidth={8} paintOrder="stroke" strokeLinejoin="round">
        GENGHIS KHAN
      </text>
      <text y={270} textAnchor="middle" fill={CREAM} fontFamily={SANS} fontWeight={700} fontSize={34} letterSpacing="0.06em"
        stroke="rgba(40,15,5,0.75)" strokeWidth={7} paintOrder="stroke" strokeLinejoin="round">
        Temüjin unites the tribes
      </text>
    </g>
  );
};

const Part1Text: React.FC<{ frame: number }> = ({ frame }) => {
  const { fps } = useVideoConfig();
  const before = interpolate(frame, [10, 30], [0, 1], clamp) * interpolate(frame, [UNIFY - 10, UNIFY + 5], [1, 0], clamp);
  const yearS = spring({ frame: frame - UNIFY, fps, config: { damping: 12 } });
  const yearExit = interpolate(frame, [PART_2 - 25, PART_2], [1, 0], clamp);
  return (
    <>
      <div style={{ position: "absolute", top: 60, width: "100%", textAlign: "center", color: CREAM, opacity: before }}>
        <div style={{ fontFamily: SANS, fontSize: 26, letterSpacing: "0.4em", opacity: 0.8 }}>BEFORE 1206</div>
        <div style={{ fontFamily: SERIF, fontSize: 54, marginTop: 8 }}>Rival tribes, endless feuds</div>
      </div>
      <div
        style={{
          position: "absolute", top: 40, width: "100%", textAlign: "center",
          opacity: Math.min(1, yearS) * yearExit,
          transform: `scale(${0.6 + 0.4 * yearS})`,
        }}
      >
        <span style={{ fontFamily: SERIF, fontSize: 120, color: GOLD, textShadow: "0 0 40px rgba(255,190,80,0.8), 0 6px 20px rgba(0,0,0,0.5)" }}>
          1206
        </span>
      </div>
    </>
  );
};

// ======================================================================
// Part 2 overlay: Royal Blood vs Meritocracy, and the promotion pyramid
// ======================================================================

const Crown: React.FC = () => (
  <g>
    <path d="M -46 22 L -52 -22 L -26 0 L 0 -34 L 26 0 L 52 -22 L 46 22 Z" fill={GOLD} stroke="#7a4a00" strokeWidth={4} strokeLinejoin="round" />
    <rect x={-48} y={22} width={96} height={16} rx={4} fill={GOLD} stroke="#7a4a00" strokeWidth={4} />
    <circle cx={0} cy={-34} r={7} fill={RED} />
    <circle cx={-52} cy={-22} r={6} fill={RED} />
    <circle cx={52} cy={-22} r={6} fill={RED} />
  </g>
);

const SwordStar: React.FC = () => (
  <g>
    <g transform="rotate(-35)">
      <rect x={-6} y={-58} width={12} height={78} rx={3} fill="#dfe6ee" stroke="#5a6470" strokeWidth={3} />
      <polygon points="-6,-58 6,-58 0,-70" fill="#dfe6ee" stroke="#5a6470" strokeWidth={3} strokeLinejoin="round" />
      <rect x={-24} y={20} width={48} height={10} rx={4} fill={GOLD} stroke="#7a4a00" strokeWidth={3} />
      <rect x={-5} y={30} width={10} height={24} rx={3} fill="#5a3418" />
    </g>
    <polygon transform="translate(34 -30) scale(1.1)"
      points="0,-20 6,-6 21,-6 9,3 13,18 0,9 -13,18 -9,3 -21,-6 -6,-6" fill={GOLD} stroke="#7a4a00" strokeWidth={3} strokeLinejoin="round" />
  </g>
);

const Badge: React.FC<{ x: number; y: number; s: number; dim: number; glow: number; title: string; sub?: string; children: React.ReactNode }> = ({
  x, y, s, dim, glow, title, sub, children,
}) => (
  <g transform={`translate(${x} ${y}) scale(${s})`} opacity={1 - dim * 0.55}>
    <circle r={130} fill="url(#badgeGlow)" opacity={glow} />
    <circle r={92} fill="rgba(255,250,240,0.12)" stroke={glow > 0.5 ? GOLD : "rgba(255,250,240,0.45)"} strokeWidth={5} />
    <g filter={dim > 0.5 ? "url(#gray)" : undefined}>{children}</g>
    <text y={140} textAnchor="middle" fill={CREAM} fontFamily={SERIF} fontWeight={700} fontSize={44}>{title}</text>
    {sub && (
      <text y={182} textAnchor="middle" fill={CREAM} opacity={0.85} fontFamily={SANS} fontSize={28}>{sub}</text>
    )}
  </g>
);

/** Animated pen stroke: draws a polyline from 0..progress. */
const Stroke: React.FC<{ d: string; length: number; progress: number; color: string; width: number }> = ({ d, length, progress, color, width }) => (
  <path d={d} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round"
    strokeDasharray={length} strokeDashoffset={length * (1 - progress)} />
);

// Pyramid: rows of people (top = the Khan)
const ROWS = [
  { n: 1, label: "Khan" },
  { n: 3, label: "Commanders of 10,000" },
  { n: 5, label: "Commanders of 1,000" },
  { n: 7, label: "Leaders of 100" },
];
const PY_TOP = 520;
const PY_ROW_H = 125;
const PY_GAP = 150;
const slot = (row: number, idx: number) => ({
  x: 960 + (idx - (ROWS[row].n - 1) / 2) * PY_GAP,
  y: PY_TOP + row * PY_ROW_H,
});

// [promoted person (row, idx), person they swap with (row, idx), start frame]
const PROMOTIONS: [[number, number], [number, number], number][] = [
  [[2, 3], [1, 2], PART_2 + 200],
  [[3, 1], [2, 0], PART_2 + 250],
  [[3, 5], [2, 4], PART_2 + 300],
];
const PROMO_LEN = 40;

const HATS = [GOLD, RED, "#3f7fc4", RED, GOLD, "#3f7fc4", RED];

const Person: React.FC<{ x: number; y: number; s: number; hat: string; star: number; dim: number; isKhan?: boolean }> = ({
  x, y, s, hat, star, dim, isKhan,
}) => (
  <g transform={`translate(${x} ${y}) scale(${s})`} opacity={1 - dim * 0.45}>
    {star > 0 && <circle r={64} fill="url(#badgeGlow)" opacity={star} />}
    <ellipse cy={40} rx={30} ry={22} fill="#09060e" />
    <circle r={30} fill="#09060e" stroke={star > 0.5 ? GOLD : "none"} strokeWidth={4} />
    <circle cx={-9} cy={0} r={3.5} fill="#fff6e8" />
    <circle cx={9} cy={0} r={3.5} fill="#fff6e8" />
    <path d="M -8 10 Q 0 17 8 10" stroke="#fff6e8" strokeWidth={3} fill="none" strokeLinecap="round" />
    <path d={isKhan ? "M -30 -16 A 30 26 0 0 1 30 -16 Z" : "M -26 -16 A 26 22 0 0 1 26 -16 Z"} fill={hat} />
    <rect x={-34} y={-20} width={68} height={10} rx={5} fill="#5a3b2a" />
    {star > 0 && (
      <polygon transform={`translate(30 -34) scale(${0.9 * star})`}
        points="0,-14 4,-4 15,-4 6,2 9,13 0,6 -9,13 -6,2 -15,-4 -4,-4" fill={GOLD} stroke="#7a4a00" strokeWidth={2} />
    )}
  </g>
);

const Pyramid: React.FC<{ frame: number }> = ({ frame }) => {
  const { fps } = useVideoConfig();
  const f = frame;
  const people: { row: number; idx: number }[] = [];
  ROWS.forEach((r, row) => {
    for (let idx = 0; idx < r.n; idx++) people.push({ row, idx });
  });
  const baseAppear = (row: number) => spring({ frame: f - (PART_2 + 120 + row * 10), fps, config: { damping: 13 } });
  const triS = interpolate(f, [PART_2 + 110, PART_2 + 140], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });

  return (
    <g>
      {/* pyramid shape + tier lines */}
      <g opacity={triS}>
        <polygon points={`960,${PY_TOP - 90} ${960 + 640},${PY_TOP + 3 * PY_ROW_H + 70} ${960 - 640},${PY_TOP + 3 * PY_ROW_H + 70}`}
          fill="rgba(255,250,240,0.07)" stroke="rgba(255,250,240,0.25)" strokeWidth={3} />
        {ROWS.map((r, row) => (
          <text key={r.label} x={960 + ((r.n - 1) / 2) * PY_GAP + 70 + (row === 0 ? 20 : 0)} y={PY_TOP + row * PY_ROW_H + 10}
            fill={CREAM} opacity={0.8} fontFamily={SANS} fontSize={26} textAnchor="start">
            {r.label}
          </text>
        ))}
      </g>
      {people.map(({ row, idx }) => {
        let pos = slot(row, idx);
        let star = 0;
        let dim = 0;
        let lift = 0;
        for (const [up, down, start] of PROMOTIONS) {
          const t = interpolate(f, [start, start + PROMO_LEN], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
          const glowIn = interpolate(f, [start - 15, start], [0, 1], clamp);
          if (up[0] === row && up[1] === idx) {
            const a = slot(...up);
            const b = slot(...down);
            pos = { x: interpolate(t, [0, 1], [a.x, b.x]), y: interpolate(t, [0, 1], [a.y, b.y]) };
            lift = Math.sin(Math.PI * t) * 40;
            star = glowIn;
          }
          if (down[0] === row && down[1] === idx) {
            const a = slot(...down);
            const b = slot(...up);
            pos = { x: interpolate(t, [0, 1], [a.x, b.x]), y: interpolate(t, [0, 1], [a.y, b.y]) };
            dim = t;
          }
        }
        const s = baseAppear(row) * (row === 0 ? 1.25 : 1);
        return (
          <Person key={`${row}-${idx}`} x={pos.x} y={pos.y - lift} s={s} hat={row === 0 ? GOLD : HATS[(idx + row) % HATS.length]}
            star={star} dim={dim} isKhan={row === 0} />
        );
      })}
      {/* "PROMOTED" tags */}
      {PROMOTIONS.map(([, down, start], i) => {
        const t = interpolate(f, [start + PROMO_LEN - 5, start + PROMO_LEN + 10, start + PROMO_LEN + 45, start + PROMO_LEN + 60], [0, 1, 1, 0], clamp);
        if (t <= 0) return null;
        const p = slot(...down);
        return (
          <g key={i} transform={`translate(${p.x} ${p.y - 72 - t * 10})`} opacity={t}>
            <rect x={-82} y={-24} width={164} height={40} rx={20} fill={GOLD} />
            <text y={6} textAnchor="middle" fontFamily={SANS} fontWeight={800} fontSize={22} fill="#4a2a00" letterSpacing="0.1em">
              PROMOTED
            </text>
          </g>
        );
      })}
    </g>
  );
};

const Part2: React.FC<{ frame: number }> = ({ frame }) => {
  const { fps } = useVideoConfig();
  if (frame < PART_2 - 5) return null;
  const f = frame;
  const left = spring({ frame: f - (PART_2 + 20), fps, config: { damping: 12 } });
  const right = spring({ frame: f - (PART_2 + 32), fps, config: { damping: 12 } });
  const xDraw = interpolate(f, [PART_2 + 70, PART_2 + 92], [0, 1], clamp);
  const checkDraw = interpolate(f, [PART_2 + 100, PART_2 + 122], [0, 1], clamp);
  return (
    <g>
      <Badge x={640} y={235} s={left} dim={xDraw} glow={0} title="Royal Blood">
        <Crown />
      </Badge>
      <Badge x={1280} y={235} s={right} dim={0} glow={checkDraw} title="Meritocracy" sub="Skill & Loyalty">
        <SwordStar />
      </Badge>
      {/* red X over Royal Blood */}
      <g transform="translate(640 235)">
        <Stroke d="M -70 -70 L 70 70" length={200} progress={Math.min(1, xDraw * 2)} color="#e2382c" width={18} />
        <Stroke d="M 70 -70 L -70 70" length={200} progress={Math.max(0, xDraw * 2 - 1)} color="#e2382c" width={18} />
      </g>
      {/* green check on Meritocracy */}
      <g transform="translate(1365 160)">
        <circle r={38} fill="#2fa65a" opacity={checkDraw > 0 ? 1 : 0} transform={`scale(${Math.min(1, checkDraw * 3)})`} />
        <Stroke d="M -17 1 L -5 14 L 18 -12" length={60} progress={checkDraw} color="#ffffff" width={9} />
      </g>
      <Pyramid frame={frame} />
    </g>
  );
};

// ======================================================================
// Scene
// ======================================================================

export const Scene2: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();

  const dawn = interpolate(frame, [UNIFY, UNIFY + 100], [0, 1], { ...clamp, easing: Easing.inOut(Easing.sin) });
  const khanRise = spring({ frame: frame - (UNIFY + 50), fps, config: { damping: 16, stiffness: 60 } });
  const fadeIn = interpolate(frame, [0, 15], [0, 1], clamp);
  const part2Dim = interpolate(frame, [PART_2 - 10, PART_2 + 20], [0, 1], clamp);

  // little screen shake on each clash
  let shake = 0;
  for (const [, , start] of CLASHES) {
    const t = frame - (start + CLASH_LEN / 2 - 2);
    if (t >= 0 && t < 8) shake += Math.sin(t * 2.4) * (8 - t) * 1.2;
  }
  if (frame >= UNIFY && frame < UNIFY + 14) shake += Math.sin((frame - UNIFY) * 2.2) * (14 - (frame - UNIFY)) * 1.6;

  return (
    <AbsoluteFill style={{ backgroundColor: NIGHT.top, opacity: fadeIn }}>
      <AbsoluteFill style={{ transform: `translate(${shake}px, ${shake * 0.4}px)` }}>
        <ThreeCanvas width={width} height={height} flat camera={{ fov: 35, position: [0, 0, 10] }}>
          <Landscape frame={frame} dawn={dawn} khanRise={khanRise} />
        </ThreeCanvas>
      </AbsoluteFill>

      {/* darken the landscape for part 2's diagrams */}
      <AbsoluteFill style={{ background: "rgba(8,16,30,0.62)", backdropFilter: `blur(${part2Dim * 6}px)`, opacity: part2Dim }} />
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 45%, transparent 55%, rgba(5,10,25,0.55) 100%)" }} />

      <svg width={width} height={height} viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0, transform: `translate(${shake}px, 0)` }}>
        <defs>
          <radialGradient id="flash">
            <stop offset="0%" stopColor="#fff3c4" stopOpacity={1} />
            <stop offset="100%" stopColor="#ffc94d" stopOpacity={0} />
          </radialGradient>
          <radialGradient id="bannerGlow">
            <stop offset="0%" stopColor="#ffd27a" stopOpacity={0.7} />
            <stop offset="100%" stopColor="#ffd27a" stopOpacity={0} />
          </radialGradient>
          <radialGradient id="badgeGlow">
            <stop offset="0%" stopColor="#ffd27a" stopOpacity={0.55} />
            <stop offset="100%" stopColor="#ffd27a" stopOpacity={0} />
          </radialGradient>
          <filter id="gray">
            <feColorMatrix type="saturate" values="0.1" />
          </filter>
        </defs>
        <ClashSparks frame={frame} />
        <ClanEmblems frame={frame} />
        <Shockwave frame={frame} />
        <UnifiedBanner frame={frame} />
        <Part2 frame={frame} />
      </svg>

      <Part1Text frame={frame} />
      <Part2Title frame={frame} />
    </AbsoluteFill>
  );
};

const Part2Title: React.FC<{ frame: number }> = ({ frame }) => {
  const t = interpolate(frame, [PART_2 + 5, PART_2 + 30], [0, 1], clamp);
  if (t <= 0) return null;
  return (
    <div style={{ position: "absolute", top: 34, width: "100%", textAlign: "center", color: CREAM, opacity: t }}>
      <div style={{ fontFamily: SANS, fontSize: 24, letterSpacing: "0.45em", opacity: 0.8 }}>A NEW ORDER</div>
    </div>
  );
};
