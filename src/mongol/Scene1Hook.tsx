import { useMemo } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { ThreeCanvas } from "@remotion/three";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { EurasiaMap, useMapTextures } from "./map/EurasiaMap";
import { MAP_H, MAP_W, WAVES, project } from "./map/config.js";

/**
 * Scene 1 hook (0:00-0:10): the Mongol Empire spreading across a 3D map of Eurasia,
 * with a year counter ticking from 1206 to 1279.
 * Timings are in frames (30 fps). Once the voiceover is recorded these get
 * synced to the words.
 */

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
  const distance = Math.exp(interpolate(t, [0, 1], [Math.log(40), Math.log(185)]));
  const tilt = (interpolate(t, [0, 1], [46, 40]) * Math.PI) / 180; // angle from straight down
  const turn = (interpolate(frame, [0, 300], [-9, 2]) * Math.PI) / 180; // slow orbit
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

export const Scene1Hook: React.FC = () => {
  const frame = useCurrentFrame();
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
  const counterIn = interpolate(frame, [10, 28], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
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
          <EurasiaMap textures={textures} progress={progress} glow={glow} />
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
    </AbsoluteFill>
  );
};
