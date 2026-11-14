import { useMemo } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { ThreeCanvas } from "@remotion/three";
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Bed, Cue, SceneSounds } from "./sfx";
import { remapTime } from "./timeRemap";
import { Glow, Ridge, Rider, hills, mountains, seeded } from "./SteppeNight";
import { StandingWoman } from "./characters";
import { FlatClouds, GerFootprint, PACK_DURATION, PackingGer, Sheep, YakCart } from "./nomad";

/**
 * Scene 5 - Daily life & the role of women (2:30-3:15, 45 s)
 *   Part A 0-20 s   Midday steppe. A ger is taken apart (felt, poles, crown, lattice) and
 *                   loaded on a yak cart; the family migrates with their herds. Icons:
 *                   sheep, horses, airag.
 *   Part B 20-35 s  Split screen: women in medieval Europe/China (locks) vs Mongol women
 *                   (unlocked: property, livestock trade, camp management).
 *   Part C 35-45 s  Khatuns -> throne: regents & political advisors.
 * Opens from white and ends on white (soft cloud transitions between scenes).
 */

// Internal animation timeline (frames). The scene is played back faster to fit the
// 3-minute video: see TIME_MAP / remapTime.
const SCENE5_TIMELINE = 1350;
export const SCENE5_FRAMES = 900; // 30 s in the final video
const TIME_MAP: [number, number][] = [[0, 0], [420, 600], [690, 1050], [900, 1350]];
const PACK_START = 90;
const PACK_END = PACK_START + PACK_DURATION;
const MOVE_START = PACK_END + 10;
const MOVE_END = MOVE_START + 230;
const ICONS = 470;
const PART_B = 600;
const PART_C = 1050;

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "'Avenir Next', 'Helvetica Neue', Helvetica, Arial, sans-serif";
const CREAM = "#fffaf0";
const GOLD = "#ffc94d";

// ---------- landscape ----------

const FAR = mountains(61, -1.6, 3.2, 0.14);
const MID = hills(23, -1.9, 0.6, 0.18);
const BACK = hills(44, -2.05, 0.35, 0.26);
const NEAR = (x: number) => -2.0 + 0.1 * Math.sin(x * 0.25 + 0.4) + 0.05 * Math.sin(x * 0.7);
const FG = hills(91, -3.0, 0.08, 0.7);
const GER_Z = -4.05;

const SKY_FRAG = /* glsl */ `
varying float vY;
void main() {
  vec3 top = vec3(0.24, 0.52, 0.85), mid = vec3(0.55, 0.77, 0.93), hor = vec3(0.9, 0.95, 0.92);
  vec3 c = vY < 3.0 ? mix(hor, mid, smoothstep(-3.0, 3.0, vY)) : mix(mid, top, smoothstep(3.0, 16.0, vY));
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`;
const Sky: React.FC = () => {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: `varying float vY; void main(){ vY = (modelMatrix * vec4(position,1.0)).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: SKY_FRAG,
      }),
    [],
  );
  return (
    <mesh position={[0, 10, -40]} material={material}>
      <planeGeometry args={[220, 100]} />
    </mesh>
  );
};

const Flowers: React.FC = () => {
  const items = useMemo(() => {
    const r = seeded(31);
    return Array.from({ length: 70 }, () => ({ x: (r() - 0.5) * 50, dy: -0.05 - r() * 0.6, c: ["#f3d34a", "#ffffff", "#c88ad9", "#f08a5a"][Math.floor(r() * 4)], s: 0.03 + r() * 0.03 }));
  }, []);
  return (
    <group position={[0, 0, -3.9]}>
      {items.map((f, i) => (
        <mesh key={i} position={[f.x, NEAR(f.x) + f.dy, 0.3]}>
          <circleGeometry args={[f.s, 8]} />
          <meshBasicMaterial color={f.c} />
        </mesh>
      ))}
    </group>
  );
};

const Grass: React.FC<{ frame: number }> = ({ frame }) => {
  const blades = useMemo(() => {
    const r = seeded(19);
    return Array.from({ length: 160 }, () => ({ x: (r() - 0.5) * 40, h: 0.12 + r() * 0.28, p: r() * 6, lean: (r() - 0.5) * 0.4, c: r() < 0.5 ? "#3f7a2e" : "#4f8a38" }));
  }, []);
  return (
    <group position={[0, 0, 1.2]}>
      {blades.map((b, i) => (
        <group key={i} position={[b.x, FG(b.x) - 0.1, 0]} rotation={[0, 0, b.lean + Math.sin(frame * 0.05 + b.p) * 0.1]}>
          <mesh position={[0, b.h / 2, 0]}>
            <planeGeometry args={[0.035, b.h]} />
            <meshBasicMaterial color={b.c} />
          </mesh>
        </group>
      ))}
    </group>
  );
};

// ---------- camera ----------

const cartDistance = (frame: number) => interpolate(frame, [MOVE_START, MOVE_END], [0, 14], { ...clamp, easing: Easing.inOut(Easing.sin) });
const CART_X0 = 3.0;

const camAt = (frame: number) => {
  const push = interpolate(frame, [0, 110], [1, 0], { ...clamp, easing: Easing.out(Easing.cubic) });
  // follow the cart once the family sets off
  const pan = cartDistance(frame) * 0.92;
  const pos = new THREE.Vector3(pan + 1.3, -0.1 + push * 2.2, 5.4 + push * 3);
  const look = new THREE.Vector3(pan + 1.25, -1.15 + push * 1.0, -4);
  return { pos, look };
};

const CameraRig: React.FC<{ frame: number }> = ({ frame }) => {
  const { camera } = useThree();
  const { pos, look } = camAt(frame);
  camera.position.copy(pos);
  camera.lookAt(look);
  return null;
};

const useProject = (frame: number) => {
  const { width, height } = useVideoConfig();
  return useMemo(() => {
    const cam = new THREE.PerspectiveCamera(35, width / height, 0.1, 500);
    const { pos, look } = camAt(frame);
    cam.position.copy(pos);
    cam.lookAt(look);
    cam.updateMatrixWorld();
    return (x: number, y: number, z: number) => {
      const v = new THREE.Vector3(x, y, z).project(cam);
      return { x: ((v.x + 1) / 2) * width, y: ((1 - v.y) / 2) * height };
    };
  }, [frame, width, height]);
};

// ---------- the scene's 3D world ----------


const World: React.FC<{ frame: number }> = ({ frame }) => {
  const dist = cartDistance(frame);
  const moving = frame > MOVE_START && frame < MOVE_END - 5;
  const cartX = CART_X0 + dist;
  const local = frame - PACK_START;
  const flock = useMemo(() => {
    const r = seeded(808);
    return Array.from({ length: 14 }, (_, i) => ({ x: -3.2 + r() * 5.5 - (i % 3) * 0.3, z: -3.0 - r() * 0.6, seed: i, s: 0.85 + r() * 0.25 }));
  }, []);
  const womanStanding = interpolate(frame, [MOVE_START - 30, MOVE_START - 10], [1, 0], clamp);
  const ridersIn = interpolate(frame, [MOVE_START - 30, MOVE_START], [0, 1], clamp);

  return (
    <>
      <CameraRig frame={frame} />
      <Sky />
      <group position={[-14, 10, -38]}>
        <Glow position={[0, 0, -0.3]} size={30} color="#fff6d8" intensity={0.55} falloff={2.4} />
        <mesh>
          <circleGeometry args={[1.8, 32]} />
          <meshBasicMaterial color="#fffbe8" />
        </mesh>
      </group>
      <FlatClouds frame={frame} />
      <Ridge h={FAR} z={-26} color="#8fa6c6" />
      <Ridge h={(x) => FAR(x) + 0.0} z={-25.9} color="#8fa6c6" />
      <Ridge h={MID} z={-16} color="#a2c46c" />
      <Ridge h={BACK} z={-9} color="#86b356" />
      <Ridge h={NEAR} z={-4.2} color="#6fa548" />
      <Flowers />

      {/* the ger site */}
      <group position={[0, NEAR(0), GER_Z]}>
        <GerFootprint opacity={interpolate(frame, [PACK_END - 40, PACK_END], [0, 0.85], clamp)} />
        <PackingGer local={local} cartX={cartX} cartY={NEAR(cartX) - NEAR(0)} frame={frame} />
      </group>
      {/* yak cart */}
      <group position={[cartX, NEAR(cartX), GER_Z - 0.06]}>
        <YakCart frame={frame} moving={moving} distance={dist} />
      </group>

      {/* woman with a bowl of airag by the door, while the ger stands */}
      {womanStanding > 0.01 && (
        <group position={[-1.75, NEAR(-1.75) - 0.02, -3.7]} scale={[0.95 * womanStanding, 0.95, 1]}>
          <StandingWoman frame={frame} />
        </group>
      )}

      {/* riders: a woman herding behind, a man leading in front, spare horses */}
      {ridersIn > 0.01 && (
        <>
          <group position={[cartX - 2.6 - (1 - ridersIn) * 6, NEAR(cartX - 2.6) - 0.05, -3.5]} scale={0.85}>
            <Rider frame={moving ? frame : 0} offset={1.1} hat="#c8332b" robe="#6a3d8a" female />
          </group>
          <group position={[cartX + 1.2 + (1 - ridersIn) * 6, NEAR(cartX + 1.2) - 0.12, -3.3]} scale={0.85}>
            <Rider frame={moving ? frame : 0} offset={2.3} hat="#ffc94d" robe="#2f5aa8" mustache />
          </group>
          {[0, 1, 2].map((k) => (
            <group key={k} position={[cartX - 4.3 - k * 1.1 - (1 - ridersIn) * 6, NEAR(cartX - 4.3 - k * 1.1) - 0.05, -4.4 - k * 0.05]} scale={0.75}>
              <Rider frame={moving ? frame : 0} offset={k * 1.7} hat="#c8332b" rider={false} />
            </group>
          ))}
        </>
      )}

      {/* the flock grazes, then follows the cart */}
      {flock.map((sh) => {
        const x = sh.x + dist * 0.97;
        return (
          <group key={sh.seed} position={[x, NEAR(x) - 0.25 - (sh.z + 3) * 0.4, sh.z]} scale={sh.s}>
            <Sheep frame={frame} walking={moving} seed={sh.seed} grazing />
          </group>
        );
      })}

      <Ridge h={FG} z={1} color="#4c8636" />
      <Grass frame={frame} />
    </>
  );
};

// ======================================================================
// Overlays
// ======================================================================

const PART_LABELS = [
  { t: "Felt covers", sub: "sheep's wool, pressed", at: [0.9, 1.25], f: PACK_START + 20 },
  { t: "Roof poles · uni", sub: "", at: [-0.7, 1.35], f: PACK_START + 105 },
  { t: "Crown · toono", sub: "", at: [0, 1.9], f: PACK_START + 125 },
  { t: "Lattice walls · khana", sub: "fold like an accordion", at: [0.0, 1.15], f: PACK_START + 150 },
];

const PartLabels: React.FC<{ frame: number }> = ({ frame }) => {
  const { fps } = useVideoConfig();
  const project = useProject(frame);
  return (
    <>
      {PART_LABELS.map((l) => {
        const s = spring({ frame: frame - l.f, fps, config: { damping: 13 } }) * interpolate(frame, [l.f + 55, l.f + 70], [1, 0], clamp);
        if (s <= 0.01) return null;
        const p = project(l.at[0], NEAR(0) + l.at[1], GER_Z);
        return (
          <div key={l.t} style={{
            position: "absolute", left: p.x, top: p.y, transform: `translate(-50%, -100%) scale(${s})`, transformOrigin: "50% 100%",
            opacity: Math.min(1, s * 1.5), padding: "8px 18px", borderRadius: 999, background: "rgba(255,248,235,0.95)",
            boxShadow: "0 8px 26px rgba(0,0,0,0.3), 0 0 0 3px rgba(255,201,77,0.55)", textAlign: "center", whiteSpace: "nowrap",
          }}>
            <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 30, color: "#3a1a10" }}>{l.t}</div>
            {l.sub && <div style={{ fontFamily: SANS, fontSize: 19, color: "#5a3a2a" }}>{l.sub}</div>}
          </div>
        );
      })}
    </>
  );
};

const Title: React.FC<{ o: number; top: string; main: string; chip?: string }> = ({ o, top, main, chip }) =>
  o > 0.01 ? (
    <div style={{ position: "absolute", left: 80, top: 60, opacity: o, color: CREAM, textShadow: "0 4px 24px rgba(0,30,60,0.55)" }}>
      <div style={{ fontFamily: SANS, fontSize: 24, letterSpacing: "0.4em", opacity: 0.9 }}>{top}</div>
      <div style={{ fontFamily: SERIF, fontSize: 64, marginTop: 6 }}>{main}</div>
      {chip && (
        <div style={{ display: "inline-block", marginTop: 12, padding: "6px 16px", borderRadius: 999, border: "2px solid rgba(255,201,77,0.8)", background: "rgba(20,40,60,0.45)", fontFamily: SANS, fontWeight: 700, fontSize: 22, color: GOLD }}>
          {chip}
        </div>
      )}
    </div>
  ) : null;

// ---------- icon cards: sheep, horses, airag ----------

const SheepIcon = () => (
  <svg viewBox="0 0 120 90" width={150} height={112}>
    {[[38, 44, 20], [58, 38, 22], [78, 44, 20], [48, 56, 18], [70, 56, 18], [30, 52, 14]].map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} fill="#f3e6cf" />)}
    <ellipse cx={96} cy={42} rx={13} ry={10} fill="#1a1410" />
    <path d="M 88 36 L 80 30 L 86 40 Z" fill="#1a1410" />
    {[40, 52, 68, 80].map((x) => <rect key={x} x={x - 2.5} y={66} width={5} height={18} rx={2} fill="#1a1410" />)}
  </svg>
);
const HorseIcon = () => (
  <svg viewBox="0 0 120 90" width={150} height={112}>
    <ellipse cx={56} cy={46} rx={30} ry={14} fill="#f3e6cf" />
    <path d="M 74 40 L 92 18 L 102 24 L 86 52 Z" fill="#f3e6cf" />
    <path d="M 90 14 Q 104 12 112 26 Q 114 32 108 34 Q 100 34 94 28 Z" fill="#f3e6cf" />
    <path d="M 26 40 Q 12 46 10 64 Q 18 56 28 50 Z" fill="#f3e6cf" />
    {[[36, 0], [44, 0], [68, 0], [76, 0]].map(([x], i) => <rect key={i} x={x - 2.5} y={56} width={5} height={28} rx={2} fill="#f3e6cf" />)}
    {[0, 1, 2].map((i) => <polygon key={i} points={`${90 - i * 6},${18 + i * 7} ${82 - i * 6},${16 + i * 7} ${86 - i * 6},${24 + i * 7}`} fill={GOLD} />)}
  </svg>
);
const AiragIcon: React.FC<{ frame: number }> = ({ frame }) => (
  <svg viewBox="0 0 120 90" width={150} height={112}>
    {[0, 1, 2].map((k) => {
      const t = ((frame * 0.6 + k * 20) % 60) / 60;
      return <circle key={k} cx={50 + k * 10 + Math.sin(t * 6) * 3} cy={34 - t * 24} r={4 + t * 5} fill="#fbf6ea" opacity={1 - t} />;
    })}
    <path d="M 22 42 L 98 42 Q 94 76 60 80 Q 26 76 22 42 Z" fill="#d9b47a" />
    <path d="M 22 42 L 98 42" stroke="#8a5a2a" strokeWidth={6} strokeLinecap="round" />
    <ellipse cx={60} cy={44} rx={34} ry={5} fill="#fbf6ea" />
    <path d="M 34 56 Q 60 64 86 56" stroke="#8a5a2a" strokeWidth={3} fill="none" />
    {[44, 60, 76].map((x) => <circle key={x} cx={x} cy={64} r={3} fill={GOLD} />)}
  </svg>
);

const IconCards: React.FC<{ frame: number }> = ({ frame }) => {
  const { fps } = useVideoConfig();
  const cards = [
    { title: "Sheep", sub: "meat, wool & felt", I: () => <SheepIcon /> },
    { title: "Horses", sub: "travel, war & milk", I: () => <HorseIcon /> },
    { title: "Airag", sub: "fermented mare's milk", I: () => <AiragIcon frame={frame} /> },
  ];
  const out = interpolate(frame, [PART_B - 25, PART_B], [1, 0], clamp);
  if (frame < ICONS || out <= 0) return null;
  return (
    <div style={{ position: "absolute", top: 200, width: "100%", display: "flex", justifyContent: "center", gap: 46, opacity: out }}>
      {cards.map((c, i) => {
        const s = spring({ frame: frame - (ICONS + i * 22), fps, config: { damping: 12 } });
        const bob = Math.sin(frame * 0.06 + i) * 4;
        return (
          <div key={c.title} style={{
            width: 300, padding: "18px 20px 22px", borderRadius: 26, textAlign: "center", color: CREAM,
            background: "linear-gradient(180deg, rgba(14,36,60,0.8), rgba(8,22,40,0.85))", boxShadow: "0 22px 60px rgba(0,10,25,0.45), 0 0 0 2px rgba(255,201,77,0.5)",
            transform: `translateY(${(1 - s) * -120 + bob}px) scale(${0.7 + 0.3 * s})`, opacity: Math.min(1, s * 1.5),
          }}>
            <c.I />
            <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 42 }}>{c.title}</div>
            <div style={{ fontFamily: SANS, fontSize: 22, opacity: 0.85, marginTop: 4 }}>{c.sub}</div>
          </div>
        );
      })}
    </div>
  );
};

// ---------- Part B: comparison ----------

const Padlock: React.FC<{ locked: number; color: string; shake: number }> = ({ locked, color, shake }) => {
  // locked: 0 = open (shackle up & swung), 1 = closed
  const lift = (1 - locked) * 14;
  const swing = (1 - locked) * -28;
  return (
    <g transform={`translate(${Math.sin(shake * 30) * shake * 4} 0)`}>
      <g transform={`translate(0 ${-lift}) rotate(${swing} -13 -8)`}>
        <path d="M -13 -6 V -20 A 13 13 0 0 1 13 -20 V -6" fill="none" stroke={color} strokeWidth={6} strokeLinecap="round" />
      </g>
      <rect x={-20} y={-8} width={40} height={32} rx={7} fill={color} />
      <circle cx={0} cy={5} r={4.5} fill="rgba(0,0,0,0.45)" />
      <rect x={-1.6} y={6} width={3.2} height={9} rx={1.5} fill="rgba(0,0,0,0.45)" />
    </g>
  );
};

const Check: React.FC<{ t: number }> = ({ t }) => (
  <g opacity={t} transform={`scale(${0.6 + 0.4 * t})`}>
    <circle r={22} fill="#2fa65a" />
    <path d="M -10 1 L -3 9 L 11 -8" fill="none" stroke="#fff" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={34} strokeDashoffset={34 * (1 - t)} />
  </g>
);

/** Woman head-and-shoulders (SVG). mongol = braids, fur hat, colour; otherwise a grey veiled figure. */
const WomanBust: React.FC<{ mongol: boolean; boqta?: boolean; frame: number }> = ({ mongol, boqta, frame }) => {
  const skin = mongol ? "#09060e" : "#4a4a52";
  const robe = boqta ? "#a8302a" : mongol ? "#6a3d8a" : "#6a6a72";
  const trim = mongol ? "#e8b64a" : "#8a8a92";
  const blink = frame % 100 > 96;
  return (
    <g>
      <path d="M -70 120 Q -70 52 -26 44 L 26 44 Q 70 52 70 120 Z" fill={robe} />
      <path d="M -24 44 L 22 110" stroke={trim} strokeWidth={8} strokeLinecap="round" />
      {boqta && [[-40, 80], [36, 92]].map(([x, y], i) => (
        <g key={i}><circle cx={x} cy={y} r={11} fill="#e8b64a" /><circle cx={x} cy={y} r={6} fill="#a8302a" /></g>
      ))}
      {mongol && (
        <>
          <path d="M -30 0 Q -40 40 -34 86" stroke="#120c0a" strokeWidth={11} fill="none" strokeLinecap="round" />
          <path d="M 30 0 Q 40 40 34 86" stroke="#120c0a" strokeWidth={11} fill="none" strokeLinecap="round" />
          {[40, 62].map((y) => (
            <g key={y}><circle cx={-37} cy={y} r={7} fill="#dfe6ee" /><circle cx={37} cy={y} r={7} fill="#dfe6ee" /></g>
          ))}
        </>
      )}
      {!mongol && <path d="M -44 10 Q -44 -50 0 -54 Q 44 -50 44 10 L 50 60 L -50 60 Z" fill="#8a8a92" />}
      <circle r={36} fill={skin} />
      {!blink ? (
        <>
          <ellipse cx={-12} cy={2} rx={5} ry={6} fill="#fff6e8" />
          <ellipse cx={12} cy={2} rx={5} ry={6} fill="#fff6e8" />
          <circle cx={-11} cy={3} r={2.6} fill="#2a1a10" />
          <circle cx={13} cy={3} r={2.6} fill="#2a1a10" />
        </>
      ) : (
        <path d="M -17 3 L -7 3 M 7 3 L 17 3" stroke="#fff6e8" strokeWidth={2.5} strokeLinecap="round" />
      )}
      <path d={mongol ? "M -9 16 Q 0 23 9 16" : "M -8 18 L 8 18"} stroke="#fff6e8" strokeWidth={3} fill="none" strokeLinecap="round" />
      {mongol && <><circle cx={-20} cy={13} r={5} fill="#a8404a" /><circle cx={20} cy={13} r={5} fill="#a8404a" /></>}
      {mongol && <><circle cx={-36} cy={10} r={5} fill="#e8b64a" /><circle cx={36} cy={10} r={5} fill="#e8b64a" /></>}
      {mongol && !boqta && (
        <g>
          <path d="M -34 -18 Q -30 -64 0 -70 Q 30 -64 34 -18 Z" fill="#c8332b" />
          <path d="M -14 -22 L -6 -62 M 14 -22 L 6 -62" stroke="#e8b64a" strokeWidth={3} />
          <rect x={-42} y={-28} width={84} height={16} rx={8} fill="#6b4a32" />
          <circle cy={-72} r={6} fill="#e8b64a" />
        </g>
      )}
      {boqta && (
        // the boqta: tall headdress of royal Mongol women, topped with feathers
        <g>
          <path d="M -30 -20 Q -34 -36 -16 -40 L -12 -130 Q 0 -138 12 -130 L 16 -40 Q 34 -36 30 -20 Z" fill="#a8302a" />
          <path d="M -12 -130 L -26 -150 L 26 -150 L 12 -130 Z" fill="#c8452a" />
          <path d="M -26 -150 L 26 -150" stroke="#e8b64a" strokeWidth={5} />
          {[-80, -100, -60].map((y) => <rect key={y} x={-14} y={y} width={28} height={6} fill="#e8b64a" />)}
          {[-8, 0, 8].map((dx, i) => (
            <path key={i} d={`M ${dx} -150 Q ${dx * 3 + Math.sin(frame * 0.08 + i) * 4} -190 ${dx * 4 + 10} -212`} stroke="#f3ead8" strokeWidth={5} fill="none" strokeLinecap="round" />
          ))}
          <circle cy={-60} r={7} fill="#3a8ac8" stroke="#e8b64a" strokeWidth={3} />
          <path d="M -40 -18 Q 0 -30 40 -18" stroke="#e8b64a" strokeWidth={6} fill="none" />
        </g>
      )}
    </g>
  );
};

const Comparison: React.FC<{ frame: number }> = ({ frame }) => {
  const { fps } = useVideoConfig();
  const f = frame - PART_B;
  const exit = interpolate(frame, [PART_C - 25, PART_C], [0, 1], clamp);
  if (f < 0 || exit >= 1) return null;
  const leftIn = spring({ frame: f - 10, fps, config: { damping: 16 } });
  const rightIn = spring({ frame: f - 22, fps, config: { damping: 16 } });
  const leftRows = [{ t: "Own property", f: 50 }, { t: "Trade", f: 85 }];
  const rightRows = [{ t: "Property Rights", f: 140 }, { t: "Livestock Trade", f: 185 }, { t: "Camp Management", f: 230 }];
  return (
    <svg width={1920} height={1080} viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0, opacity: 1 - exit }}>
      <defs>
        <linearGradient id="goldPanel" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2a2414" stopOpacity={0.92} />
          <stop offset="100%" stopColor="#1a1608" stopOpacity={0.94} />
        </linearGradient>
        <radialGradient id="goldGlow">
          <stop offset="0%" stopColor="#ffd27a" stopOpacity={0.35} />
          <stop offset="100%" stopColor="#ffd27a" stopOpacity={0} />
        </radialGradient>
      </defs>
      {/* left: grey, locked */}
      <g transform={`translate(${(1 - leftIn) * -900} 0)`} opacity={leftIn}>
        <rect x={110} y={190} width={800} height={720} rx={30} fill="rgba(52,54,62,0.9)" stroke="rgba(200,200,210,0.35)" strokeWidth={3} />
        <text x={510} y={262} textAnchor="middle" fill="#c9c9d1" fontFamily={SANS} fontSize={24} letterSpacing="0.3em">IN MOST OF THE WORLD</text>
        <text x={510} y={318} textAnchor="middle" fill="#e1e1e8" fontFamily={SERIF} fontSize={50}>Medieval Europe / China</text>
        <g transform="translate(270 560) scale(1.5)"><WomanBust mongol={false} frame={frame} /></g>
        {leftRows.map((r, i) => {
          const s = interpolate(f, [r.f, r.f + 12], [0, 1], clamp);
          const lockT = interpolate(f, [r.f + 14, r.f + 22], [0, 1], { ...clamp, easing: Easing.in(Easing.quad) });
          const shake = interpolate(f, [r.f + 22, r.f + 32], [1, 0], clamp) * (lockT >= 1 ? 1 : 0);
          return (
            <g key={r.t} transform={`translate(480 ${480 + i * 130})`} opacity={s}>
              <rect x={0} y={-46} width={390} height={92} rx={20} fill="rgba(255,255,255,0.06)" />
              <g transform="translate(52 0)"><Padlock locked={lockT} color="#9a9aa4" shake={shake} /></g>
              <text x={100} y={11} fill="#d1d1d8" fontFamily={SANS} fontSize={34} fontWeight={700}>{r.t}</text>
            </g>
          );
        })}
      </g>
      {/* right: gold, unlocked */}
      <g transform={`translate(${(1 - rightIn) * 900} 0)`} opacity={rightIn}>
        <rect x={1010} y={190} width={800} height={720} rx={30} fill="url(#goldPanel)" stroke={GOLD} strokeWidth={4} />
        <circle cx={1170} cy={560} r={260} fill="url(#goldGlow)" />
        <text x={1410} y={262} textAnchor="middle" fill={GOLD} fontFamily={SANS} fontSize={24} letterSpacing="0.3em">ON THE STEPPE</text>
        <text x={1410} y={318} textAnchor="middle" fill={CREAM} fontFamily={SERIF} fontSize={54} fontWeight={700}>Mongol Women</text>
        <g transform="translate(1170 560) scale(1.5)"><WomanBust mongol frame={frame} /></g>
        {rightRows.map((r, i) => {
          const s = interpolate(f, [r.f, r.f + 12], [0, 1], clamp);
          const open = interpolate(f, [r.f + 12, r.f + 22], [1, 0], { ...clamp, easing: Easing.out(Easing.back(2)) });
          const check = interpolate(f, [r.f + 24, r.f + 36], [0, 1], clamp);
          return (
            <g key={r.t} transform={`translate(1330 ${430 + i * 120})`} opacity={s}>
              <rect x={0} y={-44} width={455} height={88} rx={20} fill="rgba(255,201,77,0.12)" stroke="rgba(255,201,77,0.5)" strokeWidth={2} />
              <g transform="translate(50 0)">
                <g opacity={1 - check}><Padlock locked={open} color={GOLD} shake={0} /></g>
                <Check t={check} />
              </g>
              <text x={96} y={11} fill={CREAM} fontFamily={SANS} fontSize={34} fontWeight={700}>{r.t}</text>
            </g>
          );
        })}
        <text x={1410} y={870} textAnchor="middle" fill={CREAM} opacity={interpolate(f, [270, 300], [0, 0.9], clamp)} fontFamily={SANS} fontSize={24}>
          While men were away on campaign, women ran the economy
        </text>
      </g>
      {/* divider */}
      <line x1={960} y1={210} x2={960} y2={210 + 680 * interpolate(f, [5, 40], [0, 1], clamp)} stroke={GOLD} strokeWidth={3} strokeDasharray="10 10" opacity={0.7} />
    </svg>
  );
};

// ---------- Part C: Khatuns ----------

const Throne = () => (
  <g>
    <path d="M -46 -90 Q -46 -120 0 -126 Q 46 -120 46 -90 L 46 10 L -46 10 Z" fill="#a8302a" stroke={GOLD} strokeWidth={5} />
    <path d="M -30 -84 Q 0 -100 30 -84 L 30 0 L -30 0 Z" fill="#c8452a" />
    <circle cy={-60} r={14} fill={GOLD} />
    <rect x={-66} y={0} width={132} height={26} rx={8} fill={GOLD} stroke="#7a4a00" strokeWidth={3} />
    <rect x={-74} y={-30} width={22} height={56} rx={6} fill="#a8302a" stroke={GOLD} strokeWidth={4} />
    <rect x={52} y={-30} width={22} height={56} rx={6} fill="#a8302a" stroke={GOLD} strokeWidth={4} />
    <rect x={-58} y={26} width={12} height={46} fill="#7a4a24" />
    <rect x={46} y={26} width={12} height={46} fill="#7a4a24" />
    <path d="M -60 72 L 60 72" stroke={GOLD} strokeWidth={6} strokeLinecap="round" />
  </g>
);

const Khatuns: React.FC<{ frame: number }> = ({ frame }) => {
  const { fps } = useVideoConfig();
  const f = frame - PART_C;
  if (f < -10) return null;
  const a = spring({ frame: f - 5, fps, config: { damping: 13 } });
  const b = spring({ frame: f - 60, fps, config: { damping: 13 } });
  const lineT = interpolate(f, [30, 70], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const names = [
    { n: "Töregene Khatun", d: "Regent 1241–1246" },
    { n: "Oghul Qaimish", d: "Regent 1248–1251" },
    { n: "Sorghaghtani Beki", d: "Advisor · mother of Möngke & Kublai Khan" },
  ];
  return (
    <svg width={1920} height={1080} viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0 }}>
      <defs>
        <radialGradient id="kGlow">
          <stop offset="0%" stopColor="#ffd27a" stopOpacity={0.45} />
          <stop offset="100%" stopColor="#ffd27a" stopOpacity={0} />
        </radialGradient>
      </defs>
      <text x={960} y={110} textAnchor="middle" fill={GOLD} fontFamily={SANS} fontSize={24} letterSpacing="0.45em" opacity={a}>ROYAL WOMEN OF THE COURT</text>
      {/* khatun emblem */}
      <g transform={`translate(560 470) scale(${a})`} opacity={Math.min(1, a * 1.4)}>
        <circle r={260} fill="url(#kGlow)" />
        <circle r={190} fill="rgba(14,36,60,0.9)" stroke={GOLD} strokeWidth={6} />
        <g transform="translate(0 60) scale(1.15)"><WomanBust mongol boqta frame={frame} /></g>
        <text y={250} textAnchor="middle" fill={CREAM} fontFamily={SERIF} fontWeight={700} fontSize={64}>Khatuns</text>
      </g>
      {/* leadership lines */}
      {[-40, 0, 40].map((dy, i) => (
        <path key={i} d={`M 760 ${470 + dy} C 900 ${470 + dy * 2}, 1020 ${470 - dy}, 1160 ${470 + dy * 0.5}`} fill="none" stroke={GOLD}
          strokeWidth={i === 1 ? 6 : 3} opacity={i === 1 ? 1 : 0.6} pathLength={1} strokeDasharray={`${lineT} 1`} strokeLinecap="round" />
      ))}
      {[0, 1, 2].map((k) => {
        const t = ((frame * 0.012 + k / 3) % 1);
        const x = 760 + t * 400;
        return lineT >= 1 ? <circle key={k} cx={x} cy={470 + Math.sin(t * Math.PI) * -18} r={8} fill="#fff1c4" opacity={0.9} /> : null;
      })}
      {/* throne */}
      <g transform={`translate(1360 470) scale(${b})`} opacity={Math.min(1, b * 1.4)}>
        <circle r={260} fill="url(#kGlow)" />
        <circle r={190} fill="rgba(14,36,60,0.9)" stroke={GOLD} strokeWidth={6} />
        <g transform="translate(0 10) scale(1.3)"><Throne /></g>
        <text y={250} textAnchor="middle" fill={CREAM} fontFamily={SERIF} fontWeight={700} fontSize={50}>Regents &amp; Political Advisors</text>
      </g>
      {/* real examples */}
      {names.map((nm, i) => {
        const s = spring({ frame: f - (110 + i * 18), fps, config: { damping: 14 } });
        const x = 960 + (i - 1) * 520;
        return (
          <g key={nm.n} transform={`translate(${x} ${905 + (1 - s) * 60})`} opacity={s}>
            <rect x={-240} y={-50} width={480} height={100} rx={22} fill="rgba(14,36,60,0.85)" stroke="rgba(255,201,77,0.6)" strokeWidth={2} />
            <text y={-6} textAnchor="middle" fill={CREAM} fontFamily={SERIF} fontWeight={700} fontSize={34}>{nm.n}</text>
            <text y={30} textAnchor="middle" fill={GOLD} fontFamily={SANS} fontSize={22}>{nm.d}</text>
          </g>
        );
      })}
    </svg>
  );
};

// ======================================================================
// Scene
// ======================================================================

// ---------- sound effects (see sfx.tsx) ----------
const SOUND_BEDS: Bed[] = [["wind", 0, PART_B + 20, 0.08], ["walk", MOVE_START, MOVE_END, 0.2]];
const SOUND_CUES: Cue[] = [
  [20, "birds", 0.16], [300, "birds", 0.12],
  ...[52, 77, 133, 149, 162, 176, 197].map((t): Cue => [PACK_START + t, "whoosh", 0.1]),
  ...[100, 125, 175, 185, 195, 215, 230].map((t): Cue => [PACK_START + t, "thunk", 0.18]),
  ...PART_LABELS.map((l): Cue => [l.f, "pop", 0.16]),
  ...[0, 1, 2].map((i): Cue => [ICONS + i * 22, "pop", 0.22]),
  [PART_B, "whoosh", 0.16],
  [PART_B + 72, "lock", 0.32], [PART_B + 107, "lock", 0.32],
  ...[140, 185, 230].map((t): Cue => [PART_B + t + 12, "unlock", 0.28]),
  ...[140, 185, 230].map((t): Cue => [PART_B + t + 24, "chime", 0.1]),
  [PART_C + 5, "shimmer", 0.22], [PART_C + 60, "drum", 0.26],
  ...[110, 128, 146].map((t): Cue => [PART_C + t, "pop", 0.14]),
  [SCENE5_TIMELINE - 45, "swell", 0.2],
];

export const Scene5: React.FC = () => {
  const frame = remapTime(useCurrentFrame(), TIME_MAP);
  const { width, height } = useVideoConfig();
  const fromWhite = interpolate(frame, [0, 40], [1, 0], { ...clamp, easing: Easing.out(Easing.quad) });
  const toWhite = interpolate(frame, [SCENE5_TIMELINE - 45, SCENE5_TIMELINE], [0, 1], { ...clamp, easing: Easing.in(Easing.quad) });
  const dim = interpolate(frame, [PART_B - 10, PART_B + 25], [0, 1], clamp);
  const lifeTitle = interpolate(frame, [30, 60, PACK_START + 60, PACK_START + 80], [0, 1, 1, 0], clamp);
  const moveTitle = interpolate(frame, [MOVE_START, MOVE_START + 25, ICONS - 10, ICONS + 10], [0, 1, 1, 0], clamp);

  return (
    <AbsoluteFill style={{ backgroundColor: "#cfe6f2" }}>
      <ThreeCanvas width={width} height={height} flat camera={{ fov: 35, position: [0, 0.5, 8], near: 0.1, far: 500 }}>
        <World frame={frame} />
      </ThreeCanvas>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 45%, transparent 60%, rgba(20,40,40,0.35) 100%)" }} />

      <Title o={lifeTitle} top="DAILY LIFE ON THE STEPPE" main="A home that moves" />
      <Title o={moveTitle} top="FOLLOWING THE SEASONS" main="To fresh pastures" chip="A ger packs up in a few hours" />
      <PartLabels frame={frame} />
      <IconCards frame={frame} />

      {/* parts B and C sit on a dimmed, blurred steppe */}
      <AbsoluteFill style={{ opacity: dim, background: "rgba(10,20,32,0.66)", backdropFilter: `blur(${dim * 6}px)` }} />
      <Comparison frame={frame} />
      <Khatuns frame={frame} />

      <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 50%, rgba(255,255,255,0.85), #f4f1ea)", opacity: Math.max(fromWhite, toWhite) }} />
      <SceneSounds cues={SOUND_CUES} beds={SOUND_BEDS} map={TIME_MAP} />
    </AbsoluteFill>
  );
};
