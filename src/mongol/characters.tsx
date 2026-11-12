import { useEffect, useMemo } from "react";
import * as THREE from "three";

/**
 * Detailed flat-style characters (three.js). Black skin/silhouettes with little
 * faces, like the reference, but dressed in Mongol clothing with shading and trim:
 *   - deel (long robe) with darker shaded side, gold trim, buttons and a sash
 *   - optional lamellar armour, bow case and quiver
 *   - boots with upturned toes and stitching
 *   - fur-brimmed hats with tassel and plume
 * Horses have shading, muscles, mane, tied tail, decorated bridle and a high saddle.
 */

type P = [number, number];

export const INK = "#09060e";
const HORSE = "#3b261a";
const HORSE_SHADE = "#24160f";
const HORSE_LIGHT = "#5a3a26";
const HORSE_DARK = "#140d0a";
const BOOT = "#3a2414";
const BOOT_LIGHT = "#5a3a20";
const FUR = "#6b4a32";
const FUR_LIGHT = "#8c6a4c";
const TRIM = "#e8b64a";
const EYE = "#fff6e8";
const HAIR = "#d8d0c4";

/** Darken a hex colour (for shading). */
const shade = (hex: string, k: number) => "#" + new THREE.Color(hex).multiplyScalar(k).getHexString();

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
  const key = JSON.stringify(pts);
  const geometry = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(pts[0][0], pts[0][1]);
    if (smooth) s.splineThru([...pts.slice(1), pts[0]].map(([x, y]) => new THREE.Vector2(x, y)));
    else {
      pts.slice(1).forEach(([x, y]) => s.lineTo(x, y));
      s.closePath();
    }
    return new THREE.ShapeGeometry(s, 16);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, smooth]);
  useEffect(() => () => geometry.dispose(), [geometry]);
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

/** A bar from point a to point b (for limbs, poles, straps). */
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

/** Limb with rounded ends. */
const Limb: React.FC<{ a: P; b: P; w: number; color: string; z?: number }> = ({ a, b, w, color, z = 0 }) => (
  <>
    <Bar a={a} b={b} w={w} color={color} z={z} />
    <Circle x={a[0]} y={a[1]} r={w / 2} color={color} z={z} />
    <Circle x={b[0]} y={b[1]} r={w / 2} color={color} z={z} />
  </>
);

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

/** Mongol hat: crown with seams, thick tufted fur brim, earflaps, jewel, tassel and optional plume. Size ~ head width. */
export const MongolHat: React.FC<{ position: [number, number, number]; size: number; color: string; frame?: number; plume?: boolean }> = ({
  position, size, color, frame = 0, plume,
}) => (
  <group position={position} scale={size}>
    {plume && (
      <Poly pts={[[0.04, 0.6], [0.2 + Math.sin(frame * 0.12) * 0.03, 1.05], [0.32, 1.12], [0.14, 0.62]]} color="#f3ead8" smooth z={-0.002} />
    )}
    <Poly pts={HAT_CROWN} color={color} smooth />
    <Poly pts={[[0.1, 0.02], [0.36, 0.28], [0.42, 0.02]]} color={shade(color, 0.78)} z={0.001} />
    <Bar a={[-0.18, 0.06]} b={[-0.08, 0.5]} w={0.03} color={TRIM} z={0.002} />
    <Bar a={[0.18, 0.06]} b={[0.08, 0.5]} w={0.03} color={TRIM} z={0.002} />
    <Bar a={[0, 0.06]} b={[0, 0.56]} w={0.03} color={TRIM} z={0.002} />
    {/* earflaps */}
    <Poly pts={[[-0.5, 0.02], [-0.36, 0.02], [-0.38, -0.36], [-0.5, -0.3]]} color={FUR} smooth z={0.003} />
    <Poly pts={[[0.5, 0.02], [0.36, 0.02], [0.38, -0.36], [0.5, -0.3]]} color={FUR} smooth z={0.003} />
    {/* fur brim with tufts */}
    <Poly pts={[[-0.56, -0.08], [0.56, -0.08], [0.6, 0.06], [0.54, 0.16], [-0.54, 0.16], [-0.6, 0.06]]} color={FUR} smooth z={0.004} />
    {[-0.46, -0.3, -0.14, 0.02, 0.18, 0.34, 0.5].map((x, i) => (
      <Circle key={i} x={x} y={0.13} r={0.07} color={i % 2 ? FUR_LIGHT : FUR} z={0.005} />
    ))}
    <Bar a={[-0.5, 0.0]} b={[0.5, 0.0]} w={0.025} color={shade(FUR, 0.7)} z={0.006} />
    {/* jewel on the front */}
    <Circle x={0} y={0.24} r={0.07} color={TRIM} z={0.006} />
    <Circle x={0} y={0.24} r={0.04} color="#3a8ac8" z={0.007} />
    {/* knot + tassel */}
    {[-0.08, 0, 0.08].map((dx, i) => (
      <Bar key={i} a={[0, 0.6]} b={[dx * 2.2 - 0.18 + Math.sin(frame * 0.15 + i) * 0.03, 0.34]} w={0.045} color="#c8332b" z={0.008} />
    ))}
    <Circle x={0} y={0.62} r={0.08} color={TRIM} z={0.009} />
  </group>
);

// ---------- rider on horseback ----------

const HORSE_BODY: P[] = [[0.5, 0.82], [0.36, 0.98], [0.1, 0.96], [-0.2, 0.97], [-0.45, 0.99], [-0.6, 0.86], [-0.58, 0.67], [-0.38, 0.58], [0, 0.57], [0.3, 0.6], [0.48, 0.67]];
const BELLY_SHADE: P[] = [[0.42, 0.66], [0.3, 0.6], [0, 0.57], [-0.38, 0.58], [-0.55, 0.68], [-0.4, 0.7], [0, 0.66], [0.3, 0.68]];
const SHOULDER: P[] = [[0.42, 0.84], [0.32, 0.92], [0.22, 0.86], [0.24, 0.72], [0.36, 0.7]];
const HAUNCH: P[] = [[-0.3, 0.92], [-0.48, 0.94], [-0.56, 0.84], [-0.5, 0.72], [-0.34, 0.76]];
const HORSE_NECK: P[] = [[0.28, 0.94], [0.48, 1.22], [0.6, 1.42], [0.75, 1.36], [0.62, 1.1], [0.54, 0.76]];
const NECK_CREST: P[] = [[0.34, 0.96], [0.5, 1.22], [0.6, 1.38], [0.56, 1.22], [0.42, 1.0]];
const HORSE_HEAD: P[] = [[0.6, 1.45], [0.71, 1.47], [0.83, 1.3], [0.96, 1.14], [0.94, 1.06], [0.84, 1.03], [0.72, 1.15], [0.62, 1.3]];
const EAR: P[] = [[0.6, 1.42], [0.61, 1.58], [0.69, 1.45]];
const TAIL_STRAND: P[] = [[0, 0], [-0.08, -0.12], [-0.1, -0.32], [-0.06, -0.5], [-0.02, -0.52], [-0.03, -0.3], [0.02, -0.1]];
const SADDLE_CLOTH: P[] = [[-0.26, 0.96], [0.22, 0.96], [0.24, 0.7], [-0.28, 0.7]];
const SADDLE: P[] = [[-0.2, 0.97], [-0.26, 1.13], [-0.14, 1.05], [0.12, 1.05], [0.2, 1.14], [0.22, 0.97]];
const THIGH: P[] = [[-0.12, 1.02], [0.2, 1.06], [0.22, 0.9], [-0.06, 0.86]];
const BOOT_SHAPE: P[] = [[0.1, 0.94], [0.22, 0.94], [0.22, 0.68], [0.3, 0.66], [0.34, 0.6], [0.08, 0.6]];
const TORSO: P[] = [[-0.15, 1.0], [0.15, 1.0], [0.17, 1.24], [0.13, 1.46], [-0.08, 1.48], [-0.15, 1.3]];
const TORSO_SHADE: P[] = [[-0.15, 1.0], [-0.02, 1.0], [-0.04, 1.3], [-0.08, 1.48], [-0.15, 1.3]];
const QUIVER: P[] = [[-0.22, 0.98], [-0.14, 0.98], [-0.07, 1.3], [-0.15, 1.32]];
const BOW_CASE: P[] = [[0.02, 0.9], [0.22, 0.88], [0.28, 0.76], [0.2, 0.7], [0.06, 0.78]];

/** Leg with a knee: hip at (x, y), upper + lower segment, hoof, optional white sock. */
const HorseLeg: React.FC<{ x: number; y: number; upper: number; knee: number; z: number; far?: boolean; sock?: boolean }> = ({
  x, y, upper, knee, z, far, sock,
}) => {
  const color = far ? HORSE_SHADE : HORSE;
  return (
    <group position={[x, y, z]} rotation={[0, 0, upper]}>
      <Poly pts={[[-0.07, 0.06], [0.07, 0.06], [0.045, -0.3], [-0.045, -0.3]]} color={color} smooth />
      <group position={[0, -0.29, 0]} rotation={[0, 0, knee]}>
        <Circle x={0} y={0} r={0.04} color={color} z={0.0005} />
        <Poly pts={[[-0.035, 0.02], [0.035, 0.02], [0.03, -0.27], [-0.03, -0.27]]} color={color} />
        {sock && !far && <Poly pts={[[-0.032, -0.17], [0.032, -0.17], [0.035, -0.27], [-0.035, -0.27]]} color="#e9e2d4" z={0.0008} />}
        <Poly pts={[[-0.042, -0.26], [0.05, -0.26], [0.065, -0.335], [-0.042, -0.335]]} color={HORSE_DARK} z={0.001} />
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
  /** "reins" = riding; "draw" = shooting the bow at full gallop */
  pose?: "reins" | "draw";
  armor?: boolean;
  mustache?: boolean;
}> = ({ frame, offset, hat, robe = "#2f5aa8", banner, bow = true, pose = "reins", armor, mustache }) => {
  const ph = frame * 0.42 + offset;
  const bob = Math.abs(Math.sin(ph)) * 0.06;
  const pitch = Math.sin(ph) * 0.035;
  const front = (d: number) => ({ upper: Math.sin(ph + d) * 0.55, knee: -0.9 * Math.max(0, Math.sin(ph + d + 0.9)) });
  const hind = (d: number) => ({ upper: Math.sin(ph + Math.PI + d) * 0.5, knee: 0.75 * Math.max(0, Math.sin(ph + Math.PI + d + 0.9)) });
  const f1 = front(0), f2 = front(0.6), h1 = hind(0), h2 = hind(0.6);
  const flutter = (i: number) => Math.sin(frame * 0.5 + i * 1.3 + offset) * 0.12;
  const tailSway = 0.35 + Math.sin(ph * 0.5) * 0.15;
  const robeShade = shade(robe, 0.72);
  const drawCycle = ((frame + offset * 20) % 50) / 50; // draw, hold, release
  const pull = pose === "draw" ? (drawCycle < 0.6 ? drawCycle / 0.6 : drawCycle < 0.8 ? 1 : 0) : 0;

  return (
    <group position={[0, bob, 0]} rotation={[0, 0, pitch]}>
      {/* far-side legs */}
      <HorseLeg x={0.26} y={0.66} {...f2} z={-0.01} far />
      <HorseLeg x={-0.42} y={0.68} {...h2} z={-0.01} far />
      {/* tail, tied with a red ribbon */}
      <group position={[-0.58, 0.9, -0.005]} rotation={[0, 0, tailSway]}>
        {[0, 1, 2, 3].map((i) => (
          <Poly key={i} pts={TAIL_STRAND} color={i % 2 ? HORSE_DARK : HORSE_SHADE} rotation={(i - 1.5) * 0.14 + flutter(i) * 0.5} z={i * 0.001} smooth />
        ))}
        <Bar a={[-0.04, -0.06]} b={[0.04, -0.02]} w={0.04} color="#c8332b" z={0.005} />
      </group>
      {/* body with shading and muscles */}
      <Poly pts={HORSE_BODY} color={HORSE} smooth />
      <Poly pts={BELLY_SHADE} color={HORSE_SHADE} smooth z={0.0004} />
      <Poly pts={SHOULDER} color={HORSE_LIGHT} smooth z={0.0005} />
      <Poly pts={HAUNCH} color={HORSE_LIGHT} smooth z={0.0005} />
      <Poly pts={HORSE_NECK} color={HORSE} smooth z={0.001} />
      <Poly pts={NECK_CREST} color={HORSE_LIGHT} smooth z={0.0012} />
      <Poly pts={HORSE_HEAD} color={HORSE} smooth z={0.002} />
      <Poly pts={EAR} color={HORSE} z={0.002} />
      <Poly pts={[[0.8, 1.3], [0.92, 1.12], [0.9, 1.08], [0.78, 1.22]]} color={HORSE_LIGHT} z={0.0025} />
      {/* eye, nostril, mouth, forelock */}
      <Circle x={0.76} y={1.32} r={0.022} color="#f3e6d0" z={0.004} />
      <Circle x={0.765} y={1.318} r={0.012} color={HORSE_DARK} z={0.0045} />
      <Circle x={0.925} y={1.1} r={0.014} color={HORSE_DARK} z={0.004} />
      <Bar a={[0.86, 1.05]} b={[0.93, 1.06]} w={0.01} color={HORSE_DARK} z={0.004} />
      <Poly pts={[[0.62, 1.44], [0.74, 1.4 + flutter(9) * 0.2], [0.66, 1.36]]} color={HORSE_DARK} z={0.0042} />
      {/* mane */}
      {[0, 1, 2, 3, 4, 5, 6].map((i) => {
        const t = i / 6;
        const x = 0.6 - t * 0.3;
        const y = 1.42 - t * 0.44;
        return <Poly key={i} pts={[[x, y], [x - 0.15, y - 0.01 + flutter(i) * 0.5], [x - 0.02, y - 0.08]]} color={i % 2 ? HORSE_DARK : HORSE_SHADE} z={0.003} />;
      })}
      {/* bridle with gold studs */}
      <Bar a={[0.64, 1.4]} b={[0.86, 1.08]} w={0.025} color="#8a2a20" z={0.0046} />
      <Bar a={[0.73, 1.21]} b={[0.9, 1.18]} w={0.022} color="#8a2a20" z={0.0046} />
      <Bar a={[0.62, 1.38]} b={[0.66, 1.18]} w={0.022} color="#8a2a20" z={0.0046} />
      {[[0.7, 1.31], [0.78, 1.2], [0.84, 1.18]].map(([x, y], i) => (
        <Circle key={i} x={x} y={y} r={0.016} color={TRIM} z={0.0048} />
      ))}
      <Circle x={0.88} y={1.08} r={0.022} color={TRIM} z={0.0048} />
      {/* breast collar with tassel */}
      <Bar a={[0.26, 0.92]} b={[0.5, 0.74]} w={0.03} color="#8a2a20" z={0.005} />
      <Poly pts={[[0.46, 0.76], [0.42, 0.62], [0.5, 0.62]]} color="#c8332b" z={0.0052} />
      {/* near-side legs */}
      <HorseLeg x={0.34} y={0.66} {...f1} z={0.006} sock={offset % 2 < 1} />
      <HorseLeg x={-0.34} y={0.68} {...h1} z={0.006} />
      {/* saddle blanket with border + pattern, high wooden saddle */}
      <Poly pts={[[-0.29, 0.98], [0.25, 0.98], [0.27, 0.67], [-0.31, 0.67]]} color={TRIM} z={0.007} />
      <Poly pts={SADDLE_CLOTH} color="#b8322a" z={0.008} />
      {[-0.17, -0.03, 0.11].map((x, i) => (
        <Poly key={i} pts={[[x, 0.83], [x + 0.06, 0.88], [x + 0.12, 0.83], [x + 0.06, 0.78]]} color={TRIM} z={0.0085} />
      ))}
      <Poly pts={SADDLE} color="#7a1e16" smooth z={0.009} />
      <Bar a={[-0.18, 1.0]} b={[0.18, 1.0]} w={0.02} color={TRIM} z={0.0092} />
      <Circle x={-0.22} y={1.1} r={0.02} color={TRIM} z={0.0093} />
      <Circle x={0.18} y={1.11} r={0.02} color={TRIM} z={0.0093} />

      {/* rider: quiver and bow case */}
      <Poly pts={QUIVER} color="#7a4a24" z={0.0094} />
      <Bar a={[-0.2, 1.05]} b={[-0.1, 1.06]} w={0.02} color={TRIM} z={0.0095} />
      {[0, 1, 2].map((i) => (
        <Poly key={i} pts={[[-0.12 + i * 0.03, 1.31], [-0.15 + i * 0.03, 1.42], [-0.09 + i * 0.03, 1.33]]} color={i === 1 ? "#c8332b" : "#e9dcc4"} z={0.0095} />
      ))}
      {bow && pose === "reins" && (
        <>
          <Poly pts={BOW_CASE} color="#6b3b1e" smooth z={0.0151} />
          <Bar a={[0.04, 0.86]} b={[0.24, 0.83]} w={0.018} color={TRIM} z={0.0152} />
          <Arc x={0.14} y={0.98} r={0.16} w={0.02} start={-0.2} len={1.4} color="#4a2a14" z={0.015} />
        </>
      )}
      {/* robe with shaded back, trim, armour */}
      <Poly pts={TORSO} color={robe} smooth z={0.01} />
      <Poly pts={TORSO_SHADE} color={robeShade} smooth z={0.0102} />
      {armor &&
        [0, 1, 2, 3].map((row) =>
          [0, 1, 2, 3].map((col) => (
            <Poly
              key={`${row}-${col}`}
              pts={[[-0.1 + col * 0.06, 1.12 + row * 0.07], [-0.05 + col * 0.06, 1.12 + row * 0.07], [-0.05 + col * 0.06, 1.18 + row * 0.07], [-0.1 + col * 0.06, 1.18 + row * 0.07]]}
              color={(row + col) % 2 ? "#7d8a96" : "#5f6b78"}
              z={0.0104}
            />
          )),
        )}
      <Bar a={[0.12, 1.42]} b={[0.02, 1.16]} w={0.03} color={TRIM} z={0.011} />
      {[1.36, 1.28, 1.2].map((y, i) => (
        <Circle key={i} x={0.1 - i * 0.03} y={y} r={0.012} color={TRIM} z={0.0112} />
      ))}
      <Bar a={[-0.15, 1.1]} b={[0.16, 1.1]} w={0.07} color="#e08a2a" z={0.012} />
      <Poly pts={[[-0.1, 1.08], [-0.06, 1.08], [-0.08, 0.96 + flutter(3) * 0.1]]} color="#c9741f" z={0.0122} />
      <Poly pts={THIGH} color={robe} z={0.013} />
      <Poly pts={[[-0.12, 1.02], [0.2, 1.06], [0.21, 1.0], [-0.1, 0.96]]} color={robeShade} z={0.0131} />
      <Bar a={[0.04, 0.88]} b={[0.22, 0.9]} w={0.025} color={TRIM} z={0.0132} />
      {/* boot with stitching and stirrup */}
      <Poly pts={BOOT_SHAPE} color={BOOT} z={0.014} />
      <Bar a={[0.12, 0.88]} b={[0.2, 0.88]} w={0.015} color={BOOT_LIGHT} z={0.0142} />
      <Bar a={[0.16, 0.86]} b={[0.16, 0.66]} w={0.008} color={TRIM} z={0.0142} />
      <Bar a={[0.14, 0.9]} b={[0.16, 0.62]} w={0.012} color="#4a2a14" z={0.0139} />
      <Bar a={[0.1, 0.59]} b={[0.32, 0.59]} w={0.03} color={TRIM} z={0.015} />
      {/* arms */}
      {pose === "reins" ? (
        <>
          <Limb a={[0.06, 1.38]} b={[0.22, 1.2]} w={0.085} color={robe} z={0.016} />
          <Limb a={[0.22, 1.2]} b={[0.38, 1.22]} w={0.07} color={robe} z={0.0161} />
          <Bar a={[0.35, 1.22]} b={[0.4, 1.22]} w={0.078} color={TRIM} z={0.017} />
          <Circle x={0.43} y={1.22} r={0.04} color={INK} z={0.018} />
          <Bar a={[0.43, 1.22]} b={[0.9, 1.16]} w={0.015} color="#8a2a20" z={0.003} />
        </>
      ) : (
        (() => {
          // shooting: front arm holds the bow out, back hand draws the string to the cheek
          const grip: P = [0.46, 1.44];
          const drawHand: P = [0.32 - pull * 0.26, 1.46];
          const bowC: P = [grip[0] - 0.3, grip[1]];
          const tipT: P = [bowC[0] + Math.cos(1.15) * 0.3, bowC[1] + Math.sin(1.15) * 0.3];
          const tipB: P = [bowC[0] + Math.cos(-1.15) * 0.3, bowC[1] + Math.sin(-1.15) * 0.3];
          const flying = drawCycle >= 0.8;
          const arrowX = flying ? (drawCycle - 0.8) * 8 : 0;
          return (
            <>
              <Limb a={[0.02, 1.36]} b={[-0.08 + pull * 0.0, 1.44]} w={0.08} color={robeShade} z={0.0155} />
              <Limb a={[-0.08, 1.44]} b={drawHand} w={0.065} color={robeShade} z={0.0156} />
              <Arc x={bowC[0]} y={bowC[1]} r={0.3} w={0.03} start={-1.15} len={2.3} color="#6b3b1e" z={0.0165} />
              <Arc x={bowC[0]} y={bowC[1]} r={0.3} w={0.012} start={-1.15} len={2.3} color="#e9dcc4" z={0.0166} />
              <Bar a={tipT} b={drawHand} w={0.008} color="#f3ead8" z={0.0167} />
              <Bar a={tipB} b={drawHand} w={0.008} color="#f3ead8" z={0.0167} />
              {!flying ? (
                <Bar a={drawHand} b={[grip[0] + 0.12, grip[1]]} w={0.014} color="#e9dcc4" z={0.0168} />
              ) : (
                <Bar a={[grip[0] + arrowX, grip[1]]} b={[grip[0] + arrowX + 0.4, grip[1]]} w={0.014} color="#e9dcc4" z={0.0168} />
              )}
              <Limb a={[0.08, 1.38]} b={[0.26, 1.42]} w={0.08} color={robe} z={0.0169} />
              <Limb a={[0.26, 1.42]} b={grip} w={0.068} color={robe} z={0.017} />
              <Circle x={grip[0]} y={grip[1]} r={0.04} color={INK} z={0.0172} />
              <Circle x={drawHand[0]} y={drawHand[1]} r={0.036} color={INK} z={0.0172} />
            </>
          );
        })()
      )}
      {/* head in profile: nose, eye with pupil, brow, optional mustache */}
      <Circle x={0.06} y={1.6} r={0.12} color={INK} z={0.019} />
      <Circle x={0.17} y={1.585} r={0.03} color={INK} z={0.0191} />
      <Circle x={0.12} y={1.62} r={0.02} color={EYE} z={0.02} />
      <Circle x={0.127} y={1.618} r={0.01} color="#2a1a10" z={0.0201} />
      <Bar a={[0.09, 1.66]} b={[0.15, 1.655]} w={0.012} color={EYE} z={0.02} />
      {mustache && <Poly pts={[[0.16, 1.55], [0.1, 1.53], [0.07, 1.48], [0.11, 1.52]]} color={HAIR} z={0.0202} />}
      <MongolHat position={[0.06, 1.66, 0.021]} size={0.27} color={hat} frame={frame} plume={armor} />
      {banner && (
        <group position={[-0.2, 1.0, 0.0]}>
          <Bar a={[0, 0]} b={[0, 1.6]} w={0.035} color="#2a1810" />
          <Poly pts={[[0, 1.55], [-0.16, 1.5 + flutter(0)], [-0.32, 1.52 + flutter(1)], [-0.3, 1.36 + flutter(1)], [-0.14, 1.36 + flutter(0)], [0, 1.4]]}
            color="#c8332b" z={0.001} />
          <Bar a={[0, 1.4]} b={[-0.3, 1.36 + flutter(1)]} w={0.02} color={TRIM} z={0.0015} />
          <Poly pts={[[-0.03, 1.6], [0.03, 1.6], [0, 1.72]]} color="#dfe6ee" z={0.002} />
        </group>
      )}
    </group>
  );
};

// ---------- standing leader (Genghis Khan) ----------

const DEEL: P[] = [[-0.2, 1.06], [0.2, 1.06], [0.25, 0.7], [0.33, 0.18], [-0.33, 0.18], [-0.25, 0.7]];
const DEEL_SHADE_L: P[] = [[-0.2, 1.06], [-0.12, 1.06], [-0.18, 0.7], [-0.24, 0.18], [-0.33, 0.18], [-0.25, 0.7]];
const SHOULDERS: P[] = [[-0.36, 0.98], [-0.24, 1.13], [0.24, 1.13], [0.36, 0.98], [0.26, 0.72], [-0.26, 0.72]];
const CAPE: P[] = [[-0.3, 1.08], [0.3, 1.08], [0.42, 0.16], [-0.46, 0.14]];
const BOOT_L: P[] = [[-0.2, 0.2], [-0.04, 0.2], [-0.04, 0.03], [-0.02, 0.0], [-0.24, 0.0], [-0.3, 0.06]];
const BOOT_R: P[] = BOOT_L.map(([x, y]) => [-x, y]);

/** Front-facing leader with detailed deel, sash, sword, cape, face, hat and a horsehair war banner (sulde). */
export const StandingLeader: React.FC<{ frame: number; robe?: string; hat?: string }> = ({ frame, robe = "#23408e", hat = "#f1c232" }) => {
  const sway = Math.sin(frame * 0.1) * 0.03;
  const wave = (i: number) => Math.sin(frame * 0.14 - i * 0.8) * 0.06;
  const robeShade = shade(robe, 0.7);
  const blink = frame % 90 > 86;
  return (
    <group>
      {/* cape: red outside, darker lining at the edges */}
      <Poly pts={CAPE} color="#5a0f0b" z={-0.021} rotation={sway} />
      <Poly pts={[[-0.28, 1.06], [0.28, 1.06], [0.38, 0.2], [-0.42, 0.18]]} color="#8a1a14" z={-0.02} rotation={sway} />
      {/* boots with stitching and upturned toes */}
      <Poly pts={BOOT_L} color={BOOT} z={0.0} />
      <Poly pts={BOOT_R} color={BOOT} z={0.0} />
      <Bar a={[-0.28, 0.03]} b={[-0.04, 0.03]} w={0.025} color="#1e120a" z={0.0005} />
      <Bar a={[0.28, 0.03]} b={[0.04, 0.03]} w={0.025} color="#1e120a" z={0.0005} />
      <Bar a={[-0.12, 0.18]} b={[-0.12, 0.06]} w={0.012} color={TRIM} z={0.0006} />
      <Bar a={[0.12, 0.18]} b={[0.12, 0.06]} w={0.012} color={TRIM} z={0.0006} />
      {/* robe with shaded side */}
      <Poly pts={DEEL} color={robe} z={0.002} />
      <Poly pts={DEEL_SHADE_L} color={robeShade} z={0.0022} />
      {/* patterned hem */}
      <Poly pts={[[-0.33, 0.18], [0.33, 0.18], [0.32, 0.27], [-0.32, 0.27]]} color={TRIM} z={0.003} />
      {[-0.27, -0.18, -0.09, 0, 0.09, 0.18, 0.27].map((x, i) => (
        <Poly key={i} pts={[[x, 0.2], [x + 0.03, 0.225], [x, 0.25], [x - 0.03, 0.225]]} color="#a8302a" z={0.0032} />
      ))}
      {/* closure with buttons */}
      <Bar a={[-0.14, 1.04]} b={[0.17, 0.66]} w={0.045} color={TRIM} z={0.004} />
      <Bar a={[0.17, 0.66]} b={[0.2, 0.27]} w={0.04} color={TRIM} z={0.004} />
      <Poly pts={SHOULDERS} color={robe} smooth z={0.005} />
      <Poly pts={[[-0.36, 0.98], [-0.24, 1.13], [-0.14, 1.12], [-0.2, 0.72], [-0.26, 0.72]]} color={robeShade} smooth z={0.0052} />
      <Bar a={[-0.14, 1.1]} b={[0.2, 0.74]} w={0.045} color={TRIM} z={0.006} />
      {[[0.08, 0.92], [0.14, 0.84], [0.19, 0.48], [0.195, 0.36]].map(([x, y], i) => (
        <Circle key={i} x={x} y={y} r={0.016} color="#fff1c4" z={0.0062} />
      ))}
      {/* gold roundel on the chest */}
      <Circle x={-0.08} y={0.9} r={0.075} color={TRIM} z={0.0063} />
      <Circle x={-0.08} y={0.9} r={0.055} color="#a8302a" z={0.0064} />
      <Poly pts={[[-0.08, 0.95], [-0.065, 0.905], [-0.03, 0.9], [-0.065, 0.895], [-0.08, 0.85], [-0.095, 0.895], [-0.13, 0.9], [-0.095, 0.905]]} color={TRIM} z={0.0065} />
      {/* fur collar with tufts */}
      <Poly pts={[[-0.22, 1.06], [0, 0.98], [0.22, 1.06], [0.18, 1.18], [-0.18, 1.18]]} color={FUR} smooth z={0.007} />
      {[-0.17, -0.08, 0.01, 0.1, 0.18].map((x, i) => (
        <Circle key={i} x={x} y={1.12 + (i % 2) * 0.02} r={0.04} color={i % 2 ? FUR_LIGHT : FUR} z={0.0072} />
      ))}
      {/* sash with buckle, tassels, knife and pouch */}
      <Bar a={[-0.26, 0.7]} b={[0.26, 0.7]} w={0.1} color="#e08a2a" z={0.008} />
      <Bar a={[-0.26, 0.66]} b={[0.26, 0.66]} w={0.015} color="#b8651a" z={0.0082} />
      <Poly pts={[[-0.05, 0.75], [0.05, 0.75], [0.05, 0.65], [-0.05, 0.65]]} color={TRIM} z={0.0085} />
      <Circle x={0} y={0.7} r={0.025} color="#3a8ac8" z={0.0086} />
      {[-0.14, -0.11, -0.08].map((x, i) => (
        <Bar key={i} a={[x, 0.66]} b={[x - 0.01 + Math.sin(frame * 0.1 + i) * 0.01, 0.48]} w={0.018} color="#c9741f" z={0.0087} />
      ))}
      <Poly pts={[[0.12, 0.65], [0.2, 0.65], [0.19, 0.53], [0.13, 0.53]]} color="#7a4a24" smooth z={0.0088} />
      <Bar a={[0.22, 0.66]} b={[0.25, 0.46]} w={0.025} color="#4a2a14" z={0.0088} />
      <Bar a={[0.22, 0.66]} b={[0.225, 0.62]} w={0.03} color={TRIM} z={0.0089} />
      {/* sword at the left hip: scabbard with gold fittings */}
      <Bar a={[-0.32, 0.72]} b={[-0.12, 0.2]} w={0.05} color="#3b2414" z={0.01} />
      {[0.6, 0.4, 0.24].map((y, i) => {
        const t = (0.72 - y) / 0.52;
        return <Bar key={i} a={[-0.32 + t * 0.2 - 0.03, y + 0.012]} b={[-0.32 + t * 0.2 + 0.03, y - 0.012]} w={0.02} color={TRIM} z={0.0101} />;
      })}
      <Bar a={[-0.37, 0.8]} b={[-0.27, 0.75]} w={0.06} color={TRIM} z={0.011} />
      <Bar a={[-0.36, 0.84]} b={[-0.34, 0.8]} w={0.035} color="#2a1810" z={0.0111} />
      {/* left arm resting on the sword, horse-hoof cuff */}
      <Limb a={[-0.32, 1.0]} b={[-0.38, 0.8]} w={0.12} color={robe} z={0.012} />
      <Bar a={[-0.32, 1.0]} b={[-0.34, 0.86]} w={0.05} color={robeShade} z={0.0121} />
      <Poly pts={[[-0.44, 0.84], [-0.32, 0.84], [-0.3, 0.76], [-0.38, 0.73], [-0.46, 0.77]]} color={TRIM} smooth z={0.013} />
      <Circle x={-0.35} y={0.74} r={0.055} color={INK} z={0.014} />
      {/* right arm holding the banner pole */}
      <Limb a={[0.32, 1.0]} b={[0.44, 0.84]} w={0.12} color={robe} z={0.012} />
      <Limb a={[0.44, 0.84]} b={[0.5, 0.96]} w={0.1} color={robe} z={0.0122} />
      <Poly pts={[[0.44, 0.94], [0.54, 0.92], [0.55, 0.98], [0.45, 1.0]]} color={TRIM} z={0.013} />
      <Circle x={0.5} y={1.0} r={0.055} color={INK} z={0.016} />
      {/* head: eyes with pupils, determined brows, long mustache and goatee */}
      <Circle x={0} y={1.35} r={0.2} color={INK} z={0.015} />
      {!blink ? (
        <>
          <Circle x={-0.07} y={1.37} r={0.028} color={EYE} z={0.016} sx={1.25} />
          <Circle x={0.07} y={1.37} r={0.028} color={EYE} z={0.016} sx={1.25} />
          <Circle x={-0.066} y={1.366} r={0.014} color="#2a1a10" z={0.0161} />
          <Circle x={0.074} y={1.366} r={0.014} color="#2a1a10" z={0.0161} />
        </>
      ) : (
        <>
          <Bar a={[-0.1, 1.37]} b={[-0.04, 1.37]} w={0.012} color={EYE} z={0.016} />
          <Bar a={[0.04, 1.37]} b={[0.1, 1.37]} w={0.012} color={EYE} z={0.016} />
        </>
      )}
      <Bar a={[-0.115, 1.43]} b={[-0.03, 1.41]} w={0.02} color={HAIR} z={0.016} />
      <Bar a={[0.03, 1.41]} b={[0.115, 1.43]} w={0.02} color={HAIR} z={0.016} />
      <Poly pts={[[-0.012, 1.33], [-0.11, 1.3], [-0.14, 1.22], [-0.09, 1.28], [0, 1.305]]} color={HAIR} smooth z={0.0162} />
      <Poly pts={[[0.012, 1.33], [0.11, 1.3], [0.14, 1.22], [0.09, 1.28], [0, 1.305]]} color={HAIR} smooth z={0.0162} />
      <Poly pts={[[-0.035, 1.24], [0.035, 1.24], [0.0, 1.13]]} color={HAIR} z={0.0162} />
      <MongolHat position={[0, 1.47, 0.017]} size={0.42} color={hat} frame={frame} plume />
      {/* war banner (sulde): trident tip, disc, horsehair tassel, flag with emblem */}
      <group position={[0.5, 0, 0.003]}>
        <Bar a={[0, 0]} b={[0, 2.5]} w={0.05} color="#2a1810" />
        {[-0.07, 0, 0.07].map((dx, i) => (
          <Poly key={i} pts={[[dx - 0.02, 2.52], [dx + 0.02, 2.52], [dx, i === 1 ? 2.8 : 2.68]]} color="#dfe6ee" z={0.0005} />
        ))}
        <Bar a={[-0.08, 2.52]} b={[0.08, 2.52]} w={0.03} color="#dfe6ee" z={0.0006} />
        <Circle x={0} y={2.48} r={0.06} color={TRIM} z={0.0007} />
        {[-0.12, -0.08, -0.04, 0, 0.04, 0.08, 0.12].map((dx, i) => (
          <Bar key={i} a={[dx * 0.5, 2.44]} b={[dx * 1.5 + Math.sin(frame * 0.12 + i) * 0.035, 2.06]} w={0.028} color={i % 2 ? "#f3ead8" : "#1a1210"} z={0.001} />
        ))}
        {[0, 1, 2, 3].map((i) => (
          <Poly key={i} z={0.002 + i * 0.0005} color={i % 2 ? "#b8261e" : "#c8332b"}
            pts={[[0.03 + i * 0.2, 2.0 + wave(i) * (i + 1) * 0.5], [0.24 + i * 0.2, 2.0 + wave(i + 1) * (i + 2) * 0.5],
                  [0.24 + i * 0.2, 1.57 + wave(i + 1) * (i + 2) * 0.5], [0.03 + i * 0.2, 1.57 + wave(i) * (i + 1) * 0.5]]} />
        ))}
        <Bar a={[0.03, 1.61 + wave(0) * 0.5]} b={[0.83, 1.61 + wave(4) * 2.5]} w={0.04} color={TRIM} z={0.004} />
        <Bar a={[0.03, 1.97 + wave(0) * 0.5]} b={[0.83, 1.97 + wave(4) * 2.5]} w={0.03} color={TRIM} z={0.004} />
        {/* emblem: gold flame-like symbol on the flag */}
        <Circle x={0.33} y={1.79 + wave(2) * 1.2} r={0.09} color={TRIM} z={0.0045} />
        <Poly pts={[[0.33, 1.87 + wave(2) * 1.2], [0.37, 1.77 + wave(2) * 1.2], [0.33, 1.73 + wave(2) * 1.2], [0.29, 1.77 + wave(2) * 1.2]]} color="#a8302a" z={0.0046} />
      </group>
    </group>
  );
};
