import { useMemo } from "react";
import * as THREE from "three";

/**
 * Detailed flat-style characters (three.js). Black skin/silhouettes with little
 * faces, like the reference, but dressed in Mongol clothing:
 *   - deel (long robe) with gold trim and a coloured sash
 *   - boots with upturned toes
 *   - fur-brimmed hats with a tassel
 * Horses have a real silhouette, mane, tail, saddle and bending legs.
 */

type P = [number, number];

export const INK = "#09060e";
const HORSE = "#2b1d16";
const HORSE_DARK = "#140d0a";
const BOOT = "#3a2414";
const FUR = "#6b4a32";
const FUR_LIGHT = "#8c6a4c";
const TRIM = "#e8b64a";

// ---------- primitives ----------

/** Flat polygon (smooth = rounded spline outline). */
export const Poly: React.FC<{
  pts: P[];
  color: string;
  z?: number;
  smooth?: boolean;
  position?: [number, number, number];
  rotation?: number;
  scale?: [number, number, number];
}> = ({ pts, color, z = 0, smooth, position = [0, 0, 0], rotation = 0, scale }) => {
  const geometry = useMemo(() => {
    const s = new THREE.Shape();
    if (smooth) {
      s.moveTo(pts[0][0], pts[0][1]);
      s.splineThru([...pts.slice(1), pts[0]].map(([x, y]) => new THREE.Vector2(x, y)));
    } else {
      s.moveTo(pts[0][0], pts[0][1]);
      pts.slice(1).forEach(([x, y]) => s.lineTo(x, y));
      s.closePath();
    }
    return new THREE.ShapeGeometry(s, 16);
  }, [pts, smooth]);
  return (
    <mesh geometry={geometry} position={[position[0], position[1], position[2] + z]} rotation={[0, 0, rotation]} scale={scale}>
      <meshBasicMaterial color={color} />
    </mesh>
  );
};

const Circle: React.FC<{ x: number; y: number; r: number; color: string; z?: number; sx?: number }> = ({ x, y, r, color, z = 0, sx = 1 }) => (
  <mesh position={[x, y, z]} scale={[sx, 1, 1]}>
    <circleGeometry args={[r, 24]} />
    <meshBasicMaterial color={color} />
  </mesh>
);

/** A bar from point a to point b (for limbs, poles, reins). */
export const Bar: React.FC<{ a: P; b: P; w: number; color: string; z?: number }> = ({ a, b, w, color, z = 0 }) => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  return (
    <mesh position={[(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, z]} rotation={[0, 0, Math.atan2(dy, dx)]}>
      <planeGeometry args={[Math.hypot(dx, dy), w]} />
      <meshBasicMaterial color={color} />
    </mesh>
  );
};

const Arc: React.FC<{ x: number; y: number; r: number; w: number; start: number; len: number; color: string; z?: number }> = ({
  x, y, r, w, start, len, color, z = 0,
}) => (
  <mesh position={[x, y, z]}>
    <ringGeometry args={[r - w / 2, r + w / 2, 32, 1, start, len]} />
    <meshBasicMaterial color={color} />
  </mesh>
);

// ---------- hat ----------

const HAT_CROWN: P[] = [[-0.42, 0], [-0.36, 0.3], [-0.16, 0.52], [0, 0.58], [0.16, 0.52], [0.36, 0.3], [0.42, 0]];

/** Mongol hat: coloured crown, thick fur brim, earflaps, gold knot and red tassel. Size ~ head width. */
export const MongolHat: React.FC<{ position: [number, number, number]; size: number; color: string; frame?: number }> = ({
  position, size, color, frame = 0,
}) => (
  <group position={position} scale={size}>
    <Poly pts={HAT_CROWN} color={color} smooth />
    {/* crown seams */}
    <Bar a={[-0.18, 0.06]} b={[-0.08, 0.5]} w={0.03} color={TRIM} z={0.002} />
    <Bar a={[0.18, 0.06]} b={[0.08, 0.5]} w={0.03} color={TRIM} z={0.002} />
    {/* earflaps */}
    <Poly pts={[[-0.5, 0.02], [-0.36, 0.02], [-0.38, -0.36], [-0.5, -0.3]]} color={FUR} smooth z={0.003} />
    <Poly pts={[[0.5, 0.02], [0.36, 0.02], [0.38, -0.36], [0.5, -0.3]]} color={FUR} smooth z={0.003} />
    {/* fur brim */}
    <Poly pts={[[-0.56, -0.08], [0.56, -0.08], [0.6, 0.06], [0.54, 0.16], [-0.54, 0.16], [-0.6, 0.06]]} color={FUR} smooth z={0.004} />
    <Bar a={[-0.5, 0.12]} b={[0.5, 0.12]} w={0.035} color={FUR_LIGHT} z={0.005} />
    {/* knot + tassel */}
    {[-0.08, 0, 0.08].map((dx, i) => (
      <Bar key={i} a={[0, 0.6]} b={[dx * 2.2 - 0.18 + Math.sin(frame * 0.15 + i) * 0.03, 0.34]} w={0.045} color="#c8332b" z={0.006} />
    ))}
    <Circle x={0} y={0.62} r={0.08} color={TRIM} z={0.007} />
  </group>
);

// ---------- rider on horseback ----------

const HORSE_BODY: P[] = [[0.5, 0.82], [0.36, 0.98], [0.1, 0.96], [-0.2, 0.97], [-0.45, 0.99], [-0.6, 0.86], [-0.58, 0.67], [-0.38, 0.58], [0, 0.57], [0.3, 0.6], [0.48, 0.67]];
const HORSE_NECK: P[] = [[0.28, 0.94], [0.48, 1.22], [0.6, 1.42], [0.75, 1.36], [0.62, 1.1], [0.54, 0.76]];
const HORSE_HEAD: P[] = [[0.6, 1.45], [0.71, 1.47], [0.83, 1.3], [0.96, 1.14], [0.94, 1.06], [0.84, 1.03], [0.72, 1.15], [0.62, 1.3]];
const EAR: P[] = [[0.6, 1.42], [0.61, 1.58], [0.69, 1.45]];
const TAIL_STRAND: P[] = [[0, 0], [-0.08, -0.12], [-0.1, -0.32], [-0.06, -0.48], [-0.02, -0.5], [-0.03, -0.3], [0.02, -0.1]];
const SADDLE_CLOTH: P[] = [[-0.26, 0.96], [0.22, 0.96], [0.24, 0.7], [-0.28, 0.7]];
const SADDLE: P[] = [[-0.2, 0.97], [-0.25, 1.1], [-0.12, 1.04], [0.12, 1.04], [0.18, 1.1], [0.22, 0.97]];
const THIGH: P[] = [[-0.12, 1.02], [0.2, 1.06], [0.22, 0.9], [-0.06, 0.86]];
const BOOT_SHAPE: P[] = [[0.1, 0.94], [0.22, 0.94], [0.22, 0.68], [0.3, 0.66], [0.33, 0.6], [0.08, 0.6]];
const TORSO: P[] = [[-0.15, 1.0], [0.15, 1.0], [0.17, 1.24], [0.13, 1.46], [-0.08, 1.48], [-0.15, 1.3]];
const QUIVER: P[] = [[-0.22, 0.98], [-0.14, 0.98], [-0.07, 1.3], [-0.15, 1.32]];

/** Leg with a knee: hip at (x, y), upper + lower segment, small hoof. */
const HorseLeg: React.FC<{ x: number; y: number; upper: number; knee: number; z: number; shade?: boolean }> = ({ x, y, upper, knee, z, shade }) => {
  const color = shade ? HORSE_DARK : HORSE;
  return (
    <group position={[x, y, z]} rotation={[0, 0, upper]}>
      <Poly pts={[[-0.06, 0.04], [0.06, 0.04], [0.04, -0.3], [-0.04, -0.3]]} color={color} />
      <group position={[0, -0.29, 0]} rotation={[0, 0, knee]}>
        <Poly pts={[[-0.035, 0.02], [0.035, 0.02], [0.03, -0.28], [-0.03, -0.28]]} color={color} />
        <Poly pts={[[-0.04, -0.26], [0.05, -0.26], [0.06, -0.33], [-0.04, -0.33]]} color={HORSE_DARK} z={0.001} />
      </group>
    </group>
  );
};

export const DetailedRider: React.FC<{
  frame: number;
  offset: number;
  hat: string;
  robe?: string;
  banner?: boolean;
  bow?: boolean;
}> = ({ frame, offset, hat, robe = "#2f5aa8", banner, bow = true }) => {
  const ph = frame * 0.42 + offset;
  const bob = Math.abs(Math.sin(ph)) * 0.06;
  const pitch = Math.sin(ph) * 0.035;
  const front = (d: number) => ({ upper: Math.sin(ph + d) * 0.55, knee: -0.9 * Math.max(0, Math.sin(ph + d + 0.9)) });
  const hind = (d: number) => ({ upper: Math.sin(ph + Math.PI + d) * 0.5, knee: 0.75 * Math.max(0, Math.sin(ph + Math.PI + d + 0.9)) });
  const f1 = front(0), f2 = front(0.6), h1 = hind(0), h2 = hind(0.6);
  const flutter = (i: number) => Math.sin(frame * 0.5 + i * 1.3 + offset) * 0.12;
  const tailSway = 0.35 + Math.sin(ph * 0.5) * 0.15;

  return (
    <group position={[0, bob, 0]} rotation={[0, 0, pitch]}>
      {/* far-side legs (darker) */}
      <HorseLeg x={0.26} y={0.66} {...f2} z={-0.01} shade />
      <HorseLeg x={-0.42} y={0.68} {...h2} z={-0.01} shade />
      {/* tail */}
      <group position={[-0.58, 0.9, -0.005]} rotation={[0, 0, tailSway]}>
        {[0, 1, 2].map((i) => (
          <Poly key={i} pts={TAIL_STRAND} color={i === 1 ? HORSE_DARK : HORSE} rotation={(i - 1) * 0.18 + flutter(i) * 0.5} z={i * 0.001} smooth />
        ))}
      </group>
      {/* body, neck, head */}
      <Poly pts={HORSE_BODY} color={HORSE} smooth />
      <Poly pts={HORSE_NECK} color={HORSE} smooth z={0.001} />
      <Poly pts={HORSE_HEAD} color={HORSE} smooth z={0.002} />
      <Poly pts={EAR} color={HORSE} z={0.002} />
      <Circle x={0.76} y={1.32} r={0.018} color="#f3e6d0" z={0.004} />
      <Circle x={0.92} y={1.1} r={0.012} color={HORSE_DARK} z={0.004} />
      {/* mane */}
      {[0, 1, 2, 3, 4].map((i) => {
        const t = i / 4;
        const x = 0.6 - t * 0.3;
        const y = 1.42 - t * 0.44;
        return <Poly key={i} pts={[[x, y], [x - 0.16, y - 0.02 + flutter(i) * 0.5], [x - 0.02, y - 0.1]]} color={HORSE_DARK} z={0.003} />;
      })}
      {/* bridle */}
      <Bar a={[0.66, 1.4]} b={[0.86, 1.08]} w={0.025} color="#8a5a2a" z={0.004} />
      <Bar a={[0.74, 1.2]} b={[0.9, 1.18]} w={0.022} color="#8a5a2a" z={0.004} />
      {/* near-side legs */}
      <HorseLeg x={0.34} y={0.66} {...f1} z={0.006} />
      <HorseLeg x={-0.34} y={0.68} {...h1} z={0.006} />
      {/* saddle */}
      <Poly pts={[[-0.29, 0.98], [0.25, 0.98], [0.27, 0.67], [-0.31, 0.67]]} color={TRIM} z={0.007} />
      <Poly pts={SADDLE_CLOTH} color="#b8322a" z={0.008} />
      <Poly pts={SADDLE} color="#4a2a16" smooth z={0.009} />

      {/* rider */}
      {bow && (
        <group position={[-0.1, 1.28, 0.009]} rotation={[0, 0, -0.5]}>
          <Arc x={0} y={0} r={0.3} w={0.03} start={-1.2} len={2.4} color="#6b3b1e" />
          <Bar a={[Math.cos(-1.2) * 0.3, Math.sin(-1.2) * 0.3]} b={[Math.cos(1.2) * 0.3, Math.sin(1.2) * 0.3]} w={0.008} color="#e9dcc4" />
        </group>
      )}
      <Poly pts={QUIVER} color="#7a4a24" z={0.0095} />
      {[0, 1, 2].map((i) => (
        <Poly key={i} pts={[[-0.12 + i * 0.03, 1.31], [-0.15 + i * 0.03, 1.41], [-0.09 + i * 0.03, 1.33]]} color="#e9dcc4" z={0.0095} />
      ))}
      <Poly pts={TORSO} color={robe} smooth z={0.01} />
      <Bar a={[0.12, 1.42]} b={[0.02, 1.16]} w={0.03} color={TRIM} z={0.011} />
      <Bar a={[-0.15, 1.1]} b={[0.16, 1.1]} w={0.07} color="#e08a2a" z={0.012} />
      <Poly pts={THIGH} color={robe} z={0.013} />
      <Poly pts={BOOT_SHAPE} color={BOOT} z={0.014} />
      <Bar a={[0.12, 0.6]} b={[0.3, 0.6]} w={0.025} color={TRIM} z={0.015} />
      {/* arm holding the reins */}
      <Bar a={[0.06, 1.38]} b={[0.22, 1.2]} w={0.085} color={robe} z={0.016} />
      <Bar a={[0.22, 1.2]} b={[0.4, 1.22]} w={0.07} color={robe} z={0.016} />
      <Bar a={[0.36, 1.22]} b={[0.4, 1.22]} w={0.075} color={TRIM} z={0.017} />
      <Circle x={0.43} y={1.22} r={0.04} color={INK} z={0.018} />
      <Bar a={[0.43, 1.22]} b={[0.9, 1.16]} w={0.015} color="#8a5a2a" z={0.003} />
      {/* head */}
      <Circle x={0.06} y={1.6} r={0.12} color={INK} z={0.019} />
      <Circle x={0.12} y={1.62} r={0.017} color="#fff6e8" z={0.02} />
      <MongolHat position={[0.06, 1.66, 0.021]} size={0.27} color={hat} frame={frame} />
      {banner && (
        <group position={[-0.2, 1.0, 0.0]}>
          <Bar a={[0, 0]} b={[0, 1.6]} w={0.035} color="#2a1810" />
          <Poly pts={[[0, 1.55], [-0.16, 1.5 + flutter(0)], [-0.32, 1.52 + flutter(1)], [-0.3, 1.36 + flutter(1)], [-0.14, 1.36 + flutter(0)], [0, 1.4]]}
            color="#c8332b" z={0.001} />
          <Circle x={0} y={1.62} r={0.035} color={TRIM} z={0.002} />
        </group>
      )}
    </group>
  );
};

// ---------- standing leader (Genghis Khan) ----------

const DEEL: P[] = [[-0.2, 1.06], [0.2, 1.06], [0.25, 0.7], [0.33, 0.18], [-0.33, 0.18], [-0.25, 0.7]];
const SHOULDERS: P[] = [[-0.36, 0.98], [-0.24, 1.13], [0.24, 1.13], [0.36, 0.98], [0.26, 0.72], [-0.26, 0.72]];
const CAPE: P[] = [[-0.3, 1.08], [0.3, 1.08], [0.42, 0.16], [-0.46, 0.14]];
const BOOT_L: P[] = [[-0.2, 0.2], [-0.04, 0.2], [-0.04, 0.03], [-0.02, 0.0], [-0.24, 0.0], [-0.3, 0.06]];
const BOOT_R: P[] = BOOT_L.map(([x, y]) => [-x, y]);

/** Front-facing leader with deel, sash, sword, cape, hat and a horsehair war banner (sulde). */
export const StandingLeader: React.FC<{ frame: number; robe?: string; hat?: string }> = ({ frame, robe = "#23408e", hat = "#f1c232" }) => {
  const sway = Math.sin(frame * 0.1) * 0.03;
  const wave = (i: number) => Math.sin(frame * 0.14 - i * 0.8) * 0.06;
  return (
    <group>
      {/* cape behind */}
      <Poly pts={CAPE} color="#7a1712" z={-0.02} rotation={sway} />
      {/* boots */}
      <Poly pts={BOOT_L} color={BOOT} z={0.0} />
      <Poly pts={BOOT_R} color={BOOT} z={0.0} />
      {/* robe */}
      <Poly pts={DEEL} color={robe} z={0.002} />
      <Poly pts={[[-0.33, 0.18], [0.33, 0.18], [0.32, 0.26], [-0.32, 0.26]]} color={TRIM} z={0.003} />
      <Bar a={[-0.14, 1.04]} b={[0.17, 0.66]} w={0.045} color={TRIM} z={0.004} />
      <Bar a={[0.17, 0.66]} b={[0.2, 0.2]} w={0.04} color={TRIM} z={0.004} />
      <Poly pts={SHOULDERS} color={robe} smooth z={0.005} />
      <Bar a={[-0.14, 1.1]} b={[0.2, 0.74]} w={0.045} color={TRIM} z={0.006} />
      {/* fur collar */}
      <Poly pts={[[-0.2, 1.06], [0, 1.0], [0.2, 1.06], [0.16, 1.16], [-0.16, 1.16]]} color={FUR} smooth z={0.007} />
      {/* sash with hanging end */}
      <Bar a={[-0.26, 0.7]} b={[0.26, 0.7]} w={0.09} color="#e08a2a" z={0.008} />
      <Poly pts={[[-0.16, 0.68], [-0.08, 0.68], [-0.06, 0.45], [-0.14, 0.43]]} color="#c9741f" z={0.009} />
      {/* sword at the left hip */}
      <Bar a={[-0.32, 0.72]} b={[-0.12, 0.2]} w={0.05} color="#3b2414" z={0.01} />
      <Bar a={[-0.36, 0.78]} b={[-0.28, 0.74]} w={0.08} color={TRIM} z={0.011} />
      {/* left arm resting on the sword */}
      <Bar a={[-0.32, 1.0]} b={[-0.38, 0.8]} w={0.12} color={robe} z={0.012} />
      <Bar a={[-0.38, 0.82]} b={[-0.36, 0.78]} w={0.12} color={TRIM} z={0.013} />
      <Circle x={-0.35} y={0.76} r={0.055} color={INK} z={0.014} />
      {/* right arm holding the banner pole */}
      <Bar a={[0.32, 1.0]} b={[0.44, 0.84]} w={0.12} color={robe} z={0.012} />
      <Bar a={[0.44, 0.84]} b={[0.5, 0.98]} w={0.1} color={robe} z={0.012} />
      <Circle x={0.5} y={1.0} r={0.055} color={INK} z={0.016} />
      {/* head */}
      <Circle x={0} y={1.35} r={0.2} color={INK} z={0.015} />
      <Circle x={-0.07} y={1.37} r={0.026} color="#fff6e8" z={0.016} sx={1.2} />
      <Circle x={0.07} y={1.37} r={0.026} color="#fff6e8" z={0.016} sx={1.2} />
      <Bar a={[-0.11, 1.43]} b={[-0.03, 1.415]} w={0.018} color="#fff6e8" z={0.016} />
      <Bar a={[0.03, 1.415]} b={[0.11, 1.43]} w={0.018} color="#fff6e8" z={0.016} />
      <Arc x={0} y={1.31} r={0.05} w={0.014} start={Math.PI + 0.6} len={Math.PI - 1.2} color="#fff6e8" z={0.016} />
      <MongolHat position={[0, 1.47, 0.017]} size={0.42} color={hat} frame={frame} />
      {/* war banner: pole, spear tip, horsehair tassel, red flag */}
      <group position={[0.5, 0, 0.003]}>
        <Bar a={[0, 0]} b={[0, 2.5]} w={0.05} color="#2a1810" />
        <Poly pts={[[-0.05, 2.5], [0.05, 2.5], [0, 2.72]]} color="#dfe6ee" />
        <Poly pts={[[-0.12, 2.48], [0.12, 2.48], [0.1, 2.52], [-0.1, 2.52]]} color={TRIM} />
        {[-0.1, -0.05, 0, 0.05, 0.1].map((dx, i) => (
          <Bar key={i} a={[dx * 0.6, 2.48]} b={[dx * 1.4 + Math.sin(frame * 0.12 + i) * 0.03, 2.12]} w={0.03} color={i % 2 ? "#f3ead8" : "#1a1210"} z={0.001} />
        ))}
        {[0, 1, 2, 3].map((i) => (
          <Poly key={i} z={0.002 + i * 0.0005} color={i % 2 ? "#b8261e" : "#c8332b"}
            pts={[[0.03 + i * 0.2, 2.05 + wave(i) * (i + 1) * 0.5], [0.24 + i * 0.2, 2.05 + wave(i + 1) * (i + 2) * 0.5],
                  [0.24 + i * 0.2, 1.62 + wave(i + 1) * (i + 2) * 0.5], [0.03 + i * 0.2, 1.62 + wave(i) * (i + 1) * 0.5]]} />
        ))}
        <Bar a={[0.03, 1.66 + wave(0) * 0.5]} b={[0.83, 1.66 + wave(4) * 2.5]} w={0.04} color={TRIM} z={0.004} />
      </group>
    </group>
  );
};
