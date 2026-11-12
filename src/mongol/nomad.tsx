import { useMemo } from "react";
import { Easing, interpolate } from "remotion";
import { Bar, Poly } from "./characters";
import { seeded } from "./SteppeNight";

/**
 * Nomad life pieces in the flat style (three.js, front/side views):
 *   - a ger that can be taken apart piece by piece and loaded onto a cart
 *   - a yak cart with turning wheels
 *   - sheep and flat clouds
 * Units: ground at y = 0. The ger is ~2.4 wide.
 */

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
type P = [number, number];

const WOOD = "#b8643a";
const WOOD_LIGHT = "#d9893a";
const FELT = "#f1ebdf";
const FELT_SHADE = "#ddd2bf";
const ROPE = "#8a3a2a";
const DOOR = "#c8452a";
const GOLD = "#e8b64a";

const ease = Easing.inOut(Easing.cubic);

/** Packing schedule (frames) for each part: when it starts leaving and when it lands on the cart. */
export type PackPlan = { start: number };
const SCHEDULE = {
  ropes: [0, 20],
  roofFelt: [20, 100],
  wallFelt: [45, 125],
  poles: [105, 175],
  crown: [125, 185],
  columns: [140, 195],
  lattice: [150, 215],
  door: [175, 230],
} as const;
export const PACK_DURATION = 235;

type Pose = { x: number; y: number; sx: number; sy: number; rot: number };
const lerpPose = (a: Pose, b: Pose, t: number, arc: number): Pose => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t + Math.sin(Math.PI * t) * arc,
  sx: a.sx + (b.sx - a.sx) * t,
  sy: a.sy + (b.sy - a.sy) * t,
  rot: a.rot + (b.rot - a.rot) * t,
});
const ID: Pose = { x: 0, y: 0, sx: 1, sy: 1, rot: 0 };

/**
 * Packing progress for a part: 0 = standing ger, 1 = loaded on the cart.
 * Parts first "fold" in place (first 40%), then fly in an arc to the cart.
 */
const partT = (local: number, key: keyof typeof SCHEDULE) => {
  const [a, b] = SCHEDULE[key];
  return interpolate(local, [a, b], [0, 1], clamp);
};

const LatticeWall: React.FC = () => {
  const bars = useMemo(() => {
    const list: [P, P][] = [];
    for (let x0 = -1.2; x0 <= 0.21; x0 += 0.2) list.push([[x0, 0], [x0 + 1.0, 1.0]]);
    for (let x0 = 1.2; x0 >= -0.21; x0 -= 0.2) list.push([[x0, 0], [x0 - 1.0, 1.0]]);
    // partial diagonals near the edges
    for (let k = 1; k <= 4; k++) {
      list.push([[-1.2, k * 0.2], [-1.2 + 1 - k * 0.2, 1.0]]);
      list.push([[1.2, k * 0.2], [1.2 - (1 - k * 0.2), 1.0]]);
      list.push([[-1.2 + k * 0.2 - 0.2 + 0.2, 0], [-1.2, k * 0.2]]);
    }
    return list;
  }, []);
  return (
    <group>
      {bars.map(([a, b], i) => <Bar key={i} a={a} b={b} w={0.035} color={i % 2 ? WOOD : WOOD_LIGHT} />)}
      <Bar a={[-1.22, 1.0]} b={[1.22, 1.0]} w={0.05} color={WOOD} z={0.001} />
    </group>
  );
};

const RoofPoles: React.FC = () => (
  <group>
    {Array.from({ length: 13 }, (_, i) => {
      const x = -1.2 + (i * 2.4) / 12;
      return <Bar key={i} a={[x, 1.0]} b={[x * 0.22, 1.62]} w={0.035} color={i % 2 ? WOOD_LIGHT : WOOD} />;
    })}
  </group>
);

const Crown: React.FC = () => (
  <group>
    <Poly pts={[[-0.32, 1.6], [0.32, 1.6], [0.3, 1.7], [-0.3, 1.7]]} color={WOOD_LIGHT} />
    {[-0.2, -0.07, 0.07, 0.2].map((x) => <Bar key={x} a={[x, 1.61]} b={[x * 0.6, 1.69]} w={0.02} color={WOOD} z={0.001} />)}
    <Bar a={[-0.3, 1.7]} b={[0.3, 1.7]} w={0.03} color={GOLD} z={0.002} />
  </group>
);

const RoofFelt: React.FC = () => (
  <group>
    <Poly pts={[[-1.3, 0.98], [-0.9, 1.3], [-0.34, 1.62], [0.34, 1.62], [0.9, 1.3], [1.3, 0.98]]} color={FELT_SHADE} smooth />
    <Poly pts={[[-0.36, 1.6], [0.36, 1.6], [0.36, 1.74], [-0.36, 1.74]]} color="#cfc3ad" z={0.001} />
    {/* decorative roof band */}
    <Bar a={[-1.18, 1.06]} b={[1.18, 1.06]} w={0.06} color={ROPE} z={0.002} />
    {Array.from({ length: 9 }, (_, i) => {
      const x = -0.96 + i * 0.24;
      return <Poly key={i} pts={[[x, 1.03], [x + 0.06, 1.1], [x + 0.12, 1.03], [x + 0.06, 0.98]]} color={GOLD} z={0.003} />;
    })}
  </group>
);

const WallFelt: React.FC<{ side: -1 | 1 }> = ({ side }) => (
  <group>
    <Poly pts={side < 0 ? [[-1.26, 0], [-0.21, 0], [-0.21, 1.02], [-1.26, 1.02]] : [[0.21, 0], [1.26, 0], [1.26, 1.02], [0.21, 1.02]]} color={FELT} />
    <Poly pts={side < 0 ? [[-1.26, 0], [-1.0, 0], [-1.0, 1.02], [-1.26, 1.02]] : [[1.0, 0], [1.26, 0], [1.26, 1.02], [1.0, 1.02]]} color={FELT_SHADE} z={0.001} />
    <Bar a={side < 0 ? [-1.26, 0.06] : [0.21, 0.06]} b={side < 0 ? [-0.21, 0.06] : [1.26, 0.06]} w={0.08} color="#cfc3ad" z={0.002} />
  </group>
);

const Ropes: React.FC = () => (
  <group>
    {[0.3, 0.62, 0.9].map((y) => <Bar key={y} a={[-1.27, y]} b={[1.27, y]} w={0.04} color={ROPE} />)}
    {[-0.9, 0.9].map((x) => <Bar key={x} a={[x, 1.0]} b={[x * 0.35, 1.6]} w={0.03} color={ROPE} />)}
  </group>
);

const Door: React.FC = () => (
  <group>
    <Poly pts={[[-0.22, 0], [0.22, 0], [0.22, 0.8], [-0.22, 0.8]]} color={DOOR} />
    <Poly pts={[[-0.17, 0.06], [0.17, 0.06], [0.17, 0.72], [-0.17, 0.72]]} color="#a8302a" z={0.001} />
    {[0.22, 0.4, 0.58].map((y) => (
      <Poly key={y} pts={[[0, y + 0.07], [0.08, y], [0, y - 0.07], [-0.08, y]]} color={GOLD} z={0.002} />
    ))}
    <Bar a={[-0.22, 0.8]} b={[0.22, 0.8]} w={0.05} color={GOLD} z={0.003} />
  </group>
);

/** Where each part lands on the cart (relative to the cart's position). */
const SLOTS: Record<string, Pose> = {
  // offsets from the cart position; each part's pivot lands at cart + slot + pivot
  lattice: { x: -0.6, y: 0.44, sx: 0.16, sy: 0.55, rot: 0 },
  wallL: { x: 0.6, y: 0.315, sx: 0.3, sy: 0.3, rot: 0 },
  wallR: { x: -0.55, y: 0.315, sx: 0.3, sy: 0.3, rot: 0 },
  roofFelt: { x: 0.0, y: -0.18, sx: 0.36, sy: 0.4, rot: 0 },
  poles: { x: 0.0, y: 0.02, sx: 0.5, sy: 0.12, rot: 0 },
  crown: { x: 0.25, y: -0.25, sx: 0.55, sy: 0.55, rot: 0 },
  columns: { x: 0.55, y: -0.08, sx: 0.4, sy: 0.4, rot: Math.PI / 2 },
  door: { x: -0.95, y: 0.55, sx: 0.7, sy: 0.7, rot: -0.25 },
};

/**
 * A ger that packs itself onto a cart.
 * local = frames since packing started (negative = still standing).
 * cartX/cartY = where the cart is, in the same coordinates as the ger.
 */
export const PackingGer: React.FC<{ local: number; cartX: number; cartY: number; frame: number }> = ({ local, cartX, cartY, frame }) => {
  const at = (key: keyof typeof SCHEDULE, slot: Pose, fold: Partial<Pose>, arc = 1.2) => {
    const t = partT(local, key);
    const foldT = ease(Math.min(1, t / 0.4));
    const flyT = ease(Math.max(0, (t - 0.4) / 0.6));
    const folded: Pose = { ...ID, ...fold };
    const inPlace = lerpPose(ID, folded, foldT, 0);
    const target: Pose = { ...slot, x: cartX + slot.x, y: cartY + slot.y };
    return t <= 0.4 ? inPlace : lerpPose(inPlace, target, flyT, arc);
  };
  const tr = (p: Pose, z: number, children: React.ReactNode, pivot: P = [0, 0]) => (
    <group position={[p.x + pivot[0], p.y + pivot[1], z]} rotation={[0, 0, p.rot]} scale={[p.sx, p.sy, 1]}>
      <group position={[-pivot[0], -pivot[1], 0]}>{children}</group>
    </group>
  );
  const ropesO = 1 - partT(local, "ropes");
  const smokeOn = local < 20;
  return (
    <group>
      {/* columns and lattice (behind) */}
      {tr(at("columns", SLOTS.columns, { sx: 0.6 }), 0.0, (
        <>
          <Bar a={[-0.12, 0]} b={[-0.12, 1.62]} w={0.06} color="#d9732a" />
          <Bar a={[0.12, 0]} b={[0.12, 1.62]} w={0.06} color="#d9732a" />
        </>
      ), [0, 0.8])}
      {tr(at("lattice", SLOTS.lattice, { sx: 0.16 }), 0.002, <LatticeWall />, [0, 0.5])}
      {tr(at("poles", SLOTS.poles, { sx: 0.25, sy: 0.9 }), 0.004, <RoofPoles />, [0, 1.3])}
      {tr(at("crown", SLOTS.crown, { y: 0.25 }, 0.6), 0.006, <Crown />, [0, 1.65])}
      {/* felt covers */}
      {tr(at("wallFelt", SLOTS.wallL, { sx: 0.35 }), 0.01, <WallFelt side={-1} />, [-0.75, 0.5])}
      {tr(at("wallFelt", SLOTS.wallR, { sx: 0.35 }), 0.011, <WallFelt side={1} />, [0.75, 0.5])}
      {tr(at("roofFelt", SLOTS.roofFelt, { sy: 0.4, y: 0.2 }), 0.012, <RoofFelt />, [0, 1.3])}
      {ropesO > 0.01 && (
        <group position={[0, (1 - ropesO) * 0.3, 0.013]} scale={[1, 1, 1]}>
          <group visible={ropesO > 0.5}>
            <Ropes />
          </group>
        </group>
      )}
      {tr(at("door", SLOTS.door, {}), 0.014, <Door />, [0, 0.4])}
      {/* stove pipe + smoke while the ger stands */}
      {local < 30 && (
        <group>
          <Bar a={[0.18, 1.62]} b={[0.18, 1.98]} w={0.07} color="#3a3a3a" z={0.0005} />
          {smokeOn &&
            [0, 1, 2].map((k) => {
              const t = ((frame * 0.4 + k * 20) % 60) / 60;
              return (
                <mesh key={k} position={[0.2 + t * 0.4, 2.0 + t * 0.8, 0.0006]}>
                  <circleGeometry args={[0.06 + t * 0.12, 16]} />
                  <meshBasicMaterial color="#f4f1ea" transparent opacity={0.7 * (1 - t)} />
                </mesh>
              );
            })}
        </group>
      )}
    </group>
  );
};

/** The pale circle of flattened grass left where the ger stood. */
export const GerFootprint: React.FC<{ opacity: number }> = ({ opacity }) => (
  <mesh position={[0, 0.02, -0.02]} scale={[1, 0.22, 1]}>
    <circleGeometry args={[1.35, 40]} />
    <meshBasicMaterial color="#b9c48a" transparent opacity={opacity} />
  </mesh>
);

// ---------- yak cart ----------

const Wheel: React.FC<{ x: number; y: number; r: number; spin: number; z: number }> = ({ x, y, r, spin, z }) => (
  <group position={[x, y, z]} rotation={[0, 0, spin]}>
    <mesh>
      <ringGeometry args={[r * 0.82, r, 32]} />
      <meshBasicMaterial color="#5a3418" />
    </mesh>
    {Array.from({ length: 8 }, (_, i) => {
      const a = (i / 8) * Math.PI;
      return <Bar key={i} a={[Math.cos(a) * r * 0.85, Math.sin(a) * r * 0.85]} b={[-Math.cos(a) * r * 0.85, -Math.sin(a) * r * 0.85]} w={0.04} color="#7a4a24" z={0.001} />;
    })}
    <mesh position={[0, 0, 0.002]}>
      <circleGeometry args={[r * 0.18, 16]} />
      <meshBasicMaterial color="#3a2414" />
    </mesh>
  </group>
);

/** Yak pulling a two-wheeled cart (faces right). moving = walk cycle on. */
export const YakCart: React.FC<{ frame: number; moving: boolean; distance: number }> = ({ frame, moving, distance }) => {
  const ph = moving ? frame * 0.3 : 0;
  const spin = -distance / 0.45;
  return (
    <group>
      {/* cart bed and shafts */}
      <Poly pts={[[-1.0, 0.5], [0.9, 0.5], [0.95, 0.66], [-1.05, 0.66]]} color="#7a4a24" z={0.001} />
      <Bar a={[0.9, 0.56]} b={[1.9, 0.72]} w={0.06} color="#5a3418" z={0.0005} />
      {/* yak */}
      <group position={[2.35, 0, -0.01]}>
        {[[-0.35, 0], [-0.2, 1.3], [0.35, Math.PI], [0.5, Math.PI + 1.3]].map(([x, d], i) => (
          <group key={i} position={[x, 0.55, i % 2 ? -0.002 : 0.002]} rotation={[0, 0, Math.sin(ph + d) * 0.35]}>
            <Bar a={[0, 0]} b={[0, -0.55]} w={0.09} color={i % 2 ? "#1e1612" : "#2e221a"} />
          </group>
        ))}
        <Poly pts={[[-0.6, 0.62], [-0.55, 0.95], [-0.2, 1.08], [0.25, 1.2], [0.55, 1.0], [0.62, 0.7], [0.4, 0.45], [-0.45, 0.45]]} color="#3a2a20" smooth z={0.003} />
        {/* shaggy skirt */}
        {Array.from({ length: 9 }, (_, i) => (
          <Poly key={i} pts={[[-0.5 + i * 0.12, 0.55], [-0.44 + i * 0.12, 0.3 + Math.sin(ph + i) * 0.02], [-0.38 + i * 0.12, 0.55]]} color="#2a1e16" z={0.004} />
        ))}
        <Poly pts={[[0.5, 1.0], [0.85, 0.95], [0.95, 0.75], [0.85, 0.62], [0.6, 0.72]]} color="#2e221a" smooth z={0.005} />
        <Poly pts={[[0.62, 0.98], [0.55, 1.18], [0.7, 1.02]]} color="#e9dcc4" z={0.006} />
        <Poly pts={[[0.74, 0.98], [0.86, 1.15], [0.8, 0.97]]} color="#e9dcc4" z={0.006} />
        <mesh position={[0.82, 0.86, 0.007]}>
          <circleGeometry args={[0.025, 12]} />
          <meshBasicMaterial color="#f3e6d0" />
        </mesh>
        <Bar a={[0.4, 1.0]} b={[0.62, 0.85]} w={0.05} color="#c8332b" z={0.006} />
      </group>
      <Wheel x={-0.1} y={0.45} r={0.45} spin={spin} z={0.02} />
    </group>
  );
};

// ---------- sheep ----------

/** A sheep in profile (faces right); walking = leg cycle. */
export const Sheep: React.FC<{ frame: number; walking: boolean; seed: number; grazing?: boolean }> = ({ frame, walking, seed, grazing }) => {
  const ph = frame * 0.4 + seed * 2;
  const bob = walking ? Math.abs(Math.sin(ph)) * 0.02 : 0;
  const headDown = grazing && !walking ? 0.12 + Math.sin(frame * 0.05 + seed) * 0.03 : 0;
  return (
    <group position={[0, bob, 0]}>
      {[[-0.14, 0], [-0.08, 1.4], [0.12, Math.PI], [0.18, Math.PI + 1.4]].map(([x, d], i) => (
        <group key={i} position={[x, 0.2, i % 2 ? -0.002 : 0.002]} rotation={[0, 0, walking ? Math.sin(ph + d) * 0.4 : 0]}>
          <Bar a={[0, 0]} b={[0, -0.2]} w={0.035} color="#1a1410" />
        </group>
      ))}
      {[[-0.12, 0.3, 0.13], [0.0, 0.34, 0.15], [0.12, 0.3, 0.13], [-0.05, 0.24, 0.12], [0.08, 0.24, 0.12], [-0.18, 0.26, 0.09]].map(([x, y, r], i) => (
        <mesh key={i} position={[x, y, 0.003 + i * 0.0002]}>
          <circleGeometry args={[r, 18]} />
          <meshBasicMaterial color={i % 2 ? "#f3ede0" : "#e8e0cf"} />
        </mesh>
      ))}
      <group position={[0.24, 0.34 - headDown, 0.005]} rotation={[0, 0, -headDown * 2]}>
        <Poly pts={[[-0.04, 0.05], [0.08, 0.04], [0.12, -0.04], [0.02, -0.06], [-0.05, -0.02]]} color="#1a1410" smooth />
        <Poly pts={[[-0.03, 0.04], [-0.1, 0.02], [-0.03, 0.0]]} color="#1a1410" />
      </group>
    </group>
  );
};

// ---------- flat clouds ----------

export const FlatClouds: React.FC<{ frame: number; color?: string }> = ({ frame, color = "#ffffff" }) => {
  const clouds = useMemo(() => {
    const r = seeded(77);
    return Array.from({ length: 10 }, () => ({
      x: (r() - 0.5) * 80,
      y: 6.5 + r() * 9,
      z: -32 + r() * 4,
      s: 0.8 + r() * 1.3,
      speed: 0.004 + r() * 0.006,
      puffs: Array.from({ length: 6 }, (_, k) => ({ dx: (k - 2.5) * 0.7 + (r() - 0.5) * 0.3, dy: (k % 2) * 0.3 - Math.abs(k - 2.5) * 0.1, r: 0.6 + r() * 0.5 })),
    }));
  }, []);
  return (
    <>
      {clouds.map((c, i) => (
        <group key={i} position={[c.x + frame * c.speed, c.y, c.z]} scale={c.s}>
          {c.puffs.map((p, k) => (
            <mesh key={k} position={[p.dx, p.dy, k * 0.001]}>
              <circleGeometry args={[p.r, 28]} />
              <meshBasicMaterial color={color} transparent opacity={0.95} />
            </mesh>
          ))}
        </group>
      ))}
    </>
  );
};
