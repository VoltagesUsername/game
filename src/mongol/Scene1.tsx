import { useMemo } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { ThreeCanvas } from "@remotion/three";
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Bed, Cue, SceneSounds } from "./sfx";
import { remapTime } from "./timeRemap";
import { EurasiaMap, useMapTextures } from "./map/EurasiaMap";
import { MAP_H, MAP_W, WAVES, project } from "./map/config.js";

/**
 * Scene 1 (0:00-0:30)
 *   Part A 0:00-0:10  The empire spreads across a 3D map, year counter 1206 -> 1279.
 *   Part B 0:10-0:22  Map shifts left; Rome vs Mongol size bars + 1206-1368 timeline.
 *   Part C 0:22-0:30  Map centred and glowing; "HOW DID THEY DO IT?"
 * Timings are in frames (30 fps). Once the voiceover is recorded these get
 * synced to the words.
 */

// Part boundaries (frames)
const PART_B = 300;
const PART_C = 660;
// Internal animation timeline (frames). The scene is played back faster to fit the
// 3-minute video: see TIME_MAP / remapTime.
const SCENE1_TIMELINE = 900;
export const SCENE1_FRAMES = 660; // 22 s in the final video
const TIME_MAP: [number, number][] = [[0, 0], [240, 300], [470, 660], [660, 900]];
const END = SCENE1_TIMELINE;
// Ending: dive toward Mongolia and fade into the night sky Scene 2 opens with
const DIVE = 830;
export const SCENE2_NIGHT = "#0d1230";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

// Each wave spreads between these frames. Wave 0 = the 1206 homeland appearing.
const WAVE_FRAMES: [number, number][] = [
  [20, 58],
  [72, 110],
  [116, 154],
  [160, 214],
  [220, 260],
];

const ease = Easing.inOut(Easing.cubic);

/** How far the empire has spread (0..5) at a given frame. */
const progressAt = (frame: number) => {
  let p = 0;
  WAVE_FRAMES.forEach(([a, b], i) => {
    if (frame >= b) p = i + 1;
    else if (frame > a) p = i + ease((frame - a) / (b - a));
  });
  return p;
};

/** Year shown on the counter for a given spread value. */
const yearAt = (p: number) => {
  if (p <= 1) return WAVES[0].year;
  const n = Math.min(Math.floor(p), WAVES.length - 1);
  const f = p - n;
  if (p >= WAVES.length) return WAVES[WAVES.length - 1].year;
  return WAVES[n - 1].year + (WAVES[n].year - WAVES[n - 1].year) * f;
};

// ---------- camera ----------

type CameraPose = { position: THREE.Vector3; target: THREE.Vector3 };

const cameraAt = (frame: number): CameraPose => {
  const t = interpolate(frame, [30, 230], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });
  const [mx, my] = project(104, 46.5);
  const target = new THREE.Vector3(
    interpolate(t, [0, 1], [mx, 2]),
    interpolate(t, [0, 1], [my, 4]),
    interpolate(t, [0, 1], [1.2, 0]),
  );
  // Part B: slide the map to the left half of the screen; Part C: back to centre, a bit closer
  const shiftIn = interpolate(frame, [PART_B, PART_B + 50], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const shiftOut = interpolate(frame, [PART_C - 20, PART_C + 40], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const shift = shiftIn * (1 - shiftOut);
  target.x += shift * 27;
  target.y -= shift * 9 + shiftOut * 4;
  let distance =
    Math.exp(interpolate(t, [0, 1], [Math.log(40), Math.log(185)])) * (1 + shift * 0.3 - shiftOut * 0.02);
  const dive = interpolate(frame, [DIVE, END], [0, 1], { ...clamp, easing: Easing.in(Easing.cubic) });
  const [hx, hy] = project(106, 47.5);
  target.lerp(new THREE.Vector3(hx, hy, 1.5), dive);
  distance *= 1 - 0.82 * dive;
  const tilt = (interpolate(t, [0, 1], [46, 40]) * Math.PI) / 180; // angle from straight down
  const turn = (interpolate(frame, [0, 300, END], [-9, 2, 6]) * Math.PI) / 180; // slow orbit
  const offset = new THREE.Vector3(0, -distance * Math.sin(tilt), distance * Math.cos(tilt));
  offset.applyAxisAngle(new THREE.Vector3(0, 0, 1), turn);
  return { position: target.clone().add(offset), target };
};

const FOV = 30;

const CameraRig: React.FC<{ pose: CameraPose }> = ({ pose }) => {
  const { camera } = useThree();
  camera.up.set(0, 0, 1);
  camera.position.copy(pose.position);
  camera.lookAt(pose.target);
  return null;
};

/** Where a map point appears on screen (for HTML labels). */
const useScreenPoint = (pose: CameraPose, world: THREE.Vector3) => {
  const { width, height } = useVideoConfig();
  return useMemo(() => {
    const cam = new THREE.PerspectiveCamera(FOV, width / height, 0.1, 2000);
    cam.up.set(0, 0, 1);
    cam.position.copy(pose.position);
    cam.lookAt(pose.target);
    cam.updateMatrixWorld();
    const v = world.clone().project(cam);
    return { x: ((v.x + 1) / 2) * width, y: ((1 - v.y) / 2) * height };
  }, [pose, world, width, height]);
};

// ---------- soft shadow under the floating block ----------

const SHADOW_FRAG = /* glsl */ `
varying vec2 vUv;
void main() {
  vec2 q = abs(vUv - 0.5) * 2.0;
  float d = max(q.x, q.y);
  float a = (1.0 - smoothstep(0.72, 1.0, d)) * 0.42;
  gl_FragColor = vec4(0.02, 0.08, 0.16, a);
}`;

const BlockShadow: React.FC = () => {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: SHADOW_FRAG,
        transparent: true,
        depthWrite: false,
      }),
    [],
  );
  return (
    <mesh position={[4, -5, -12]} material={material}>
      <planeGeometry args={[MAP_W * 1.25, MAP_H * 1.4]} />
    </mesh>
  );
};

// ---------- scene ----------

// ---------- sound effects (see sfx.tsx) ----------
const SOUND_BEDS: Bed[] = [["wind", 0, 900, 0.08]];
const SOUND_CUES: Cue[] = [
  [10, "swell", 0.22],
  [20, "whoosh", 0.16], [30, "pop", 0.25],
  [72, "swell", 0.2], [116, "swell", 0.2], [160, "swell", 0.24], [220, "swell", 0.24],
  [PART_B + 28, "whoosh", 0.22], [PART_B + 60, "swell", 0.16], [PART_B + 100, "swell", 0.18], [PART_B + 150, "chime", 0.14],
  ...[0, 1, 2, 3, 4].map((i): Cue => [PART_C + 50 + i * 7, "drum", i === 4 ? 0.42 : 0.3]),
  [DIVE, "whoosh-down", 0.28],
];

export const Scene1: React.FC = () => {
  const frame = remapTime(useCurrentFrame(), TIME_MAP);
  const { width, height } = useVideoConfig();
  const textures = useMapTextures();

  const progress = progressAt(frame);
  const moving = progressAt(frame + 2) - progressAt(frame - 2);
  const glow = Math.min(1, moving * 12) * 0.85 + 0.15;
  const year = Math.floor(yearAt(progress));

  const pose = useMemo(() => cameraAt(frame), [frame]);
  const [lx, ly] = project(106.5, 47.2);
  const labelWorld = useMemo(() => new THREE.Vector3(lx, ly, 2.4), [lx, ly]);
  const label = useScreenPoint(pose, labelWorld);

  const labelOpacity =
    interpolate(frame, [28, 44], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) *
    interpolate(frame, [76, 92], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const labelPop = interpolate(frame, [28, 40], [0.8, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.back(2)),
  });
  const pulse = (frame % 30) / 30;

  const fadeIn = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });
  const counterIn =
    interpolate(frame, [10, 28], [0, 1], clamp) * interpolate(frame, [PART_B + 10, PART_B + 40], [1, 0], clamp);
  const shine = interpolate(frame, [PART_C + 10, PART_C + 70], [0, 1], { ...clamp, easing: Easing.inOut(Easing.sin) }) *
    (0.85 + 0.15 * Math.sin(frame * 0.12));
  const tick = year !== Math.floor(yearAt(progressAt(frame - 1)));

  return (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(circle at 12% 8%, #fffbe8 0%, #d9f0ef 14%, #7fc0d6 34%, #3a7fa8 62%, #1d4a6e 100%)",
      }}
    >
      <AbsoluteFill style={{ opacity: fadeIn }}>
        {textures && (
        <ThreeCanvas width={width} height={height} flat camera={{ fov: FOV, near: 0.1, far: 2000 }}>
          <CameraRig pose={pose} />
          <BlockShadow />
          <EurasiaMap textures={textures} progress={progress} glow={frame > PART_B ? 0 : glow} shine={shine} />
        </ThreeCanvas>
        )}
      </AbsoluteFill>

      {/* soft vignette */}
      <AbsoluteFill
        style={{ background: "radial-gradient(ellipse at 50% 45%, transparent 60%, rgba(8,25,45,0.45) 100%)" }}
      />

      {/* "1206 CE" pin over Mongolia */}
      <div
        style={{
          position: "absolute",
          left: label.x,
          top: label.y,
          transform: `translate(-50%, -100%) scale(${labelPop})`,
          transformOrigin: "50% 100%",
          opacity: labelOpacity,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <div
          style={{
            padding: "10px 22px",
            borderRadius: 999,
            background: "rgba(255, 248, 235, 0.95)",
            color: "#5a1d12",
            fontFamily: "Georgia, 'Times New Roman', serif",
            fontSize: 34,
            letterSpacing: "0.06em",
            boxShadow: "0 8px 30px rgba(0,0,0,0.35)",
            whiteSpace: "nowrap",
          }}
        >
          Mongolia · <b>1206 CE</b>
        </div>
        <div style={{ width: 3, height: 34, background: "rgba(255,248,235,0.95)" }} />
        <div style={{ position: "relative", width: 16, height: 16 }}>
          <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "#ffcf6b" }} />
          <div
            style={{
              position: "absolute",
              inset: -12 * pulse * 2,
              borderRadius: "50%",
              border: "3px solid #ffcf6b",
              opacity: 1 - pulse,
            }}
          />
        </div>
      </div>

      {/* soft shade behind the counter so it stays readable */}
      <AbsoluteFill
        style={{
          opacity: counterIn,
          background: "radial-gradient(ellipse 34% 30% at 12% 12%, rgba(10,35,60,0.55), transparent 70%)",
        }}
      />

      {/* year counter (top-left) */}
      <div
        style={{
          position: "absolute",
          left: 80,
          top: 64,
          opacity: counterIn,
          color: "#fffaf0",
          fontFamily: "Georgia, 'Times New Roman', serif",
          textShadow: "0 4px 24px rgba(0,30,60,0.55)",
        }}
      >
        <div style={{ fontSize: 26, letterSpacing: "0.4em", opacity: 0.85 }}>THE MONGOL EMPIRE</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
          <span
            style={{
              fontSize: 132,
              lineHeight: 1,
              fontVariantNumeric: "tabular-nums",
              transform: `scale(${tick ? 1.04 : 1})`,
              display: "inline-block",
            }}
          >
            {year}
          </span>
          <span style={{ fontSize: 40, opacity: 0.85 }}>CE</span>
        </div>
      </div>

      {/* fade into the night sky (Scene 2 starts on this colour) */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse at 50% 45%, ${SCENE2_NIGHT}cc, ${SCENE2_NIGHT})`,
          opacity: interpolate(frame, [DIVE + 25, END], [0, 1], { ...clamp, easing: Easing.in(Easing.quad) }),
        }}
      />

      <SizeComparison frame={frame} />
      <Timeline frame={frame} />
      <HowDidTheyDoIt frame={frame} />
      <SceneSounds cues={SOUND_CUES} beds={SOUND_BEDS} map={TIME_MAP} />
    </AbsoluteFill>
  );
};

// ---------- Part B: size comparison ----------

const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "'Avenir Next', 'Helvetica Neue', Helvetica, Arial, sans-serif";
const CREAM = "#fffaf0";

const SizeComparison: React.FC<{ frame: number }> = ({ frame }) => {
  const { fps } = useVideoConfig();
  const enter = spring({ frame: frame - (PART_B + 30), fps, config: { damping: 200 } });
  const exit = interpolate(frame, [PART_C - 30, PART_C], [0, 1], clamp);
  if (frame < PART_B + 25 || exit >= 1) return null;

  const bars = [
    { label: "Roman Empire", value: 4.4, color: "#4f8fd6", glow: "rgba(79,143,214,0.6)", start: PART_B + 60 },
    { label: "Mongol Empire", value: 23, color: "#e8692f", glow: "rgba(255,170,70,0.75)", start: PART_B + 100 },
  ];
  const maxW = 560;

  return (
    <div
      style={{
        position: "absolute",
        right: 90,
        top: 210,
        width: 680,
        padding: "44px 48px 40px",
        borderRadius: 28,
        background: "rgba(10, 32, 54, 0.62)",
        backdropFilter: "blur(14px)",
        boxShadow: "0 24px 80px rgba(0,15,35,0.45)",
        color: CREAM,
        transform: `translateX(${(1 - enter) * 760 + exit * 760}px)`,
        opacity: 1 - exit,
      }}
    >
      <div style={{ fontFamily: SANS, fontSize: 24, letterSpacing: "0.32em", opacity: 0.75 }}>SIZE AT ITS PEAK</div>
      {bars.map((b) => {
        const grow = interpolate(frame, [b.start, b.start + 45], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
        const appear = interpolate(frame, [b.start - 10, b.start + 5], [0, 1], clamp);
        const shown = b.value * grow;
        return (
          <div key={b.label} style={{ marginTop: 38, opacity: appear }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontFamily: SERIF, fontSize: 40 }}>{b.label}</span>
              <span style={{ fontFamily: SANS, fontSize: 34, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                {shown.toFixed(1)}M km²
              </span>
            </div>
            <div style={{ marginTop: 14, height: 46, width: maxW, borderRadius: 12, background: "rgba(255,255,255,0.08)" }}>
              <div
                style={{
                  height: "100%",
                  width: (b.value / 23) * maxW * grow,
                  borderRadius: 12,
                  background: `linear-gradient(90deg, ${b.color}, ${b.color}dd)`,
                  boxShadow: `0 0 28px ${b.glow}`,
                }}
              />
            </div>
          </div>
        );
      })}
      <div
        style={{
          marginTop: 30,
          fontFamily: SANS,
          fontSize: 28,
          lineHeight: 1.4,
          opacity: interpolate(frame, [PART_B + 150, PART_B + 175], [0, 1], clamp),
        }}
      >
        <b style={{ color: "#ffc46b" }}>5× bigger than Rome</b> · about <b>16% of Earth&apos;s land</b>
      </div>
    </div>
  );
};

// ---------- Part B: timeline 1206 - 1368 ----------

const Timeline: React.FC<{ frame: number }> = ({ frame }) => {
  const appear = interpolate(frame, [PART_B + 60, PART_B + 85], [0, 1], clamp);
  const exit = interpolate(frame, [PART_C - 30, PART_C], [0, 1], clamp);
  if (appear <= 0 || exit >= 1) return null;
  const fill = interpolate(frame, [PART_B + 80, PART_B + 200], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });

  const x0 = 140;
  const x1 = 1780;
  const span = 1368 - 1206;
  const xAt = (y: number) => x0 + ((y - 1206) / span) * (x1 - x0);
  const marks = [
    { year: 1206, text: "Genghis Khan unites the tribes" },
    { year: 1279, text: "Largest extent" },
    { year: 1368, text: "Mongols driven out of China" },
  ];

  return (
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 70, height: 130, opacity: appear * (1 - exit) }}>
      <div
        style={{
          position: "absolute",
          left: x0,
          width: x1 - x0,
          top: 54,
          height: 8,
          borderRadius: 4,
          background: "rgba(255,250,240,0.25)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: x0,
          width: (x1 - x0) * fill,
          top: 54,
          height: 8,
          borderRadius: 4,
          background: "linear-gradient(90deg, #ffcf6b, #e8692f)",
          boxShadow: "0 0 20px rgba(255,170,70,0.7)",
        }}
      />
      {marks.map((m, i) => {
        const reached = (xAt(m.year) - x0) / (x1 - x0) <= fill + 0.001;
        const pop = reached ? 1 : 0.6;
        const align = i === 0 ? "flex-start" : i === marks.length - 1 ? "flex-end" : "center";
        const shiftX = i === 0 ? 0 : i === marks.length - 1 ? -100 : -50;
        return (
          <div key={m.year}>
            <div
              style={{
                position: "absolute",
                left: xAt(m.year) - 13,
                top: 45,
                width: 26,
                height: 26,
                borderRadius: "50%",
                background: reached ? "#ffcf6b" : "rgba(255,250,240,0.5)",
                boxShadow: reached ? "0 0 18px rgba(255,200,100,0.9)" : "none",
                transform: `scale(${pop})`,
              }}
            />
            <div
              style={{
                position: "absolute",
                left: xAt(m.year),
                top: 0,
                transform: `translateX(${shiftX}%)`,
                display: "flex",
                flexDirection: "column",
                alignItems: align,
                color: CREAM,
                opacity: reached ? 1 : 0.4,
                whiteSpace: "nowrap",
                textShadow: "0 3px 14px rgba(0,20,40,0.7)",
              }}
            >
              <span style={{ fontFamily: SERIF, fontSize: 38, fontWeight: 700 }}>{m.year} CE</span>
              <span style={{ fontFamily: SANS, fontSize: 24, marginTop: 50, opacity: 0.9 }}>{m.text}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ---------- Part C: kinetic title ----------

const HowDidTheyDoIt: React.FC<{ frame: number }> = ({ frame }) => {
  const { fps, height } = useVideoConfig();
  const start = PART_C + 50;
  if (frame < start - 10) return null;
  const words = ["HOW", "DID", "THEY", "DO", "IT?"];
  const out = interpolate(frame, [DIVE - 5, DIVE + 25], [1, 0], clamp);
  const shade = interpolate(frame, [start - 10, start + 20], [0, 1], clamp) * out;

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <AbsoluteFill
        style={{
          opacity: shade,
          background: "radial-gradient(ellipse 55% 30% at 50% 50%, rgba(8,20,36,0.62), transparent 75%)",
        }}
      />
      <div style={{ display: "flex", gap: height * 0.03, opacity: out, transform: `scale(${1 + (1 - out) * 0.15})` }}>
        {words.map((w, i) => {
          const s = spring({ frame: frame - (start + i * 7), fps, config: { damping: 12, stiffness: 160 } });
          const last = i === words.length - 1;
          return (
            <span
              key={w}
              style={{
                fontFamily: SANS,
                fontWeight: 900,
                fontSize: height * 0.12,
                letterSpacing: "0.02em",
                color: last ? "#ffc46b" : CREAM,
                opacity: Math.min(1, s * 1.5),
                transform: `translateY(${(1 - s) * 60}px) scale(${0.7 + 0.3 * s})`,
                filter: `blur(${(1 - Math.min(1, s)) * 8}px)`,
                textShadow: last ? "0 0 40px rgba(255,170,70,0.7), 0 6px 30px rgba(0,0,0,0.5)" : "0 6px 30px rgba(0,0,0,0.55)",
                display: "inline-block",
              }}
            >
              {w}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
