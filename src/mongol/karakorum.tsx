import { useMemo } from "react";
import * as THREE from "three";
import { seeded } from "./SteppeNight";

/**
 * Karakorum, the Mongol capital, as a detailed miniature (three.js, lit + shadows).
 * Local units: x = east, y = north, z = up; ground = 0. The whole city is scaled by S.
 * Layout loosely follows the excavations: a walled rectangle longer north-south, the
 * Khan's palace compound in the south-west, crossing main streets, craft and market
 * quarters, temples of several faiths, and ger camps outside the walls.
 */

export const CITY_SCALE = 2.1;
const W = 0.62; // half width (east-west)
const H = 1.0; // half height (north-south)

type V3 = [number, number, number];

// ---------- shared geometry (z-up versions) ----------

const geo = (() => {
  const box = new THREE.BoxGeometry(1, 1, 1);
  box.translate(0, 0, 0.5); // sits on z = 0
  const cyl = new THREE.CylinderGeometry(1, 1, 1, 16);
  cyl.rotateX(Math.PI / 2);
  cyl.translate(0, 0, 0.5);
  const cone = new THREE.ConeGeometry(1, 1, 16);
  cone.rotateX(Math.PI / 2);
  cone.translate(0, 0, 0.5);
  // hip roof: square pyramid with a 1x1 base
  const hip = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1);
  hip.rotateY(Math.PI / 4);
  hip.rotateX(Math.PI / 2);
  hip.translate(0, 0, 0.5);
  // gable roof: triangular prism along x, 1 long, 1 deep, 1 tall, base on z = 0
  const gable = new THREE.CylinderGeometry(1, 1, 1, 3);
  gable.rotateZ(Math.PI / 2);
  gable.scale(1, 1 / 1.732, 1 / 1.5);
  gable.translate(0, 0, 1 / 3);
  const sphere = new THREE.SphereGeometry(1, 16, 12);
  const dome = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  dome.rotateX(Math.PI / 2);
  return { box, cyl, cone, hip, gable, sphere, dome };
})();

const mats = new Map<string, THREE.MeshStandardMaterial>();
const mat = (color: string, rough = 0.85, metal = 0) => {
  const k = `${color}-${rough}-${metal}`;
  if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }));
  return mats.get(k)!;
};

const Part: React.FC<{ g: THREE.BufferGeometry; p: V3; s: V3; c: string; r?: number; rough?: number; metal?: number; shadow?: boolean }> = ({
  g, p, s, c, r = 0, rough, metal, shadow = true,
}) => <mesh geometry={g} material={mat(c, rough, metal)} position={p} scale={s} rotation={[0, 0, r]} castShadow={shadow} receiveShadow />;

/** Many copies of one shape in a single draw call. */
const Instanced: React.FC<{ g: THREE.BufferGeometry; c: string; items: { p: V3; s: V3; r?: number }[]; rough?: number; shadow?: boolean }> = ({
  g, c, items, rough, shadow = true,
}) => {
  const mesh = useMemo(() => {
    const m = new THREE.InstancedMesh(g, mat(c, rough), items.length);
    const o = new THREE.Object3D();
    items.forEach((it, i) => {
      o.position.set(...it.p);
      o.scale.set(...it.s);
      o.rotation.set(0, 0, it.r ?? 0);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
    m.castShadow = shadow;
    m.receiveShadow = true;
    return m;
  }, [g, c, items, rough, shadow]);
  return <primitive object={mesh} />;
};

// ---------- palette ----------
const EARTH_WALL = "#c4a77b";
const EARTH_DARK = "#a88c62";
const GROUND_IN = "#cbb894";
const STREET = "#e0d3b2";
const TILE_GREEN = "#2f7a5a";
const TILE_GRAY = "#5d666c";
const TILE_BROWN = "#7a4e36";
const LACQUER = "#a8302a";
const PLASTER = "#efe6d2";
const STONE = "#d6cdbb";
const GOLD = "#e6b84a";
const FELT = "#f1ebdf";

// ---------- pieces ----------

const Roof2: React.FC<{ p: V3; w: number; d: number; h: number; c: string }> = ({ p, w, d, h, c }) => (
  <>
    {/* double-eave roof: wide low lower tier + steeper upper tier */}
    <Part g={geo.hip} p={p} s={[w * 1.15, d * 1.2, h * 0.45]} c={c} rough={0.45} />
    <Part g={geo.box} p={[p[0], p[1], p[2] + h * 0.2]} s={[w * 0.6, d * 0.6, h * 0.12]} c={LACQUER} />
    <Part g={geo.hip} p={[p[0], p[1], p[2] + h * 0.3]} s={[w * 0.75, d * 0.8, h * 0.7]} c={c} rough={0.45} />
    <Part g={geo.box} p={[p[0], p[1], p[2] + h * 0.98]} s={[w * 0.4, 0.008, 0.012]} c={GOLD} metal={0.6} rough={0.3} />
  </>
);

const Flag: React.FC<{ p: V3; frame: number; c: string; seed: number }> = ({ p, frame, c, seed }) => {
  const wave = Math.sin(frame * 0.18 + seed) * 0.25;
  return (
    <group position={p}>
      <Part g={geo.cyl} p={[0, 0, 0]} s={[0.004, 0.004, 0.12]} c="#3a2414" />
      <mesh position={[0.025, 0, 0.1]} rotation={[0, 0, wave]} castShadow>
        <planeGeometry args={[0.05, 0.03]} />
        <meshStandardMaterial color={c} side={THREE.DoubleSide} roughness={0.8} />
      </mesh>
    </group>
  );
};

const Gatehouse: React.FC<{ p: V3; rot: number; frame: number; seed: number }> = ({ p, rot, frame, seed }) => (
  <group position={p} rotation={[0, 0, rot]}>
    <Part g={geo.box} p={[0, 0, 0]} s={[0.2, 0.12, 0.13]} c={EARTH_WALL} />
    <Part g={geo.box} p={[0, -0.061, 0]} s={[0.06, 0.004, 0.08]} c="#2a1c12" shadow={false} />
    <Part g={geo.box} p={[0, 0, 0.13]} s={[0.15, 0.08, 0.05]} c={LACQUER} />
    {[-0.06, -0.02, 0.02, 0.06].map((x) => (
      <Part key={x} g={geo.cyl} p={[x, -0.042, 0.13]} s={[0.006, 0.006, 0.05]} c="#7a1a14" />
    ))}
    <Roof2 p={[0, 0, 0.18]} w={0.17} d={0.1} h={0.08} c={TILE_GRAY} />
    <Flag p={[0.085, 0.045, 0.13]} frame={frame} c="#c8332b" seed={seed} />
    <Flag p={[-0.085, 0.045, 0.13]} frame={frame} c={GOLD} seed={seed + 1} />
  </group>
);

const CornerTower: React.FC<{ p: V3 }> = ({ p }) => (
  <group position={p}>
    <Part g={geo.cyl} p={[0, 0, 0]} s={[0.055, 0.055, 0.15]} c={EARTH_WALL} />
    <Part g={geo.cyl} p={[0, 0, 0.15]} s={[0.062, 0.062, 0.012]} c={EARTH_DARK} />
    <Part g={geo.cone} p={[0, 0, 0.162]} s={[0.06, 0.06, 0.06]} c={TILE_BROWN} />
  </group>
);

/** Courtyard house: three wings around a yard, with a tree. */
const House: React.FC<{ p: V3; r: number; roof: string; tree: boolean }> = ({ p, r, roof, tree }) => (
  <group position={p} rotation={[0, 0, r]}>
    <Part g={geo.box} p={[0, 0.03, 0]} s={[0.09, 0.028, 0.032]} c={PLASTER} />
    <Part g={geo.gable} p={[0, 0.03, 0.032]} s={[0.1, 0.038, 0.022]} c={roof} rough={0.5} />
    <Part g={geo.box} p={[-0.035, -0.01, 0]} s={[0.022, 0.05, 0.026]} c={PLASTER} />
    <Part g={geo.gable} p={[-0.035, -0.01, 0.026]} s={[0.06, 0.03, 0.016]} c={roof} r={Math.PI / 2} rough={0.5} />
    <Part g={geo.box} p={[0.035, -0.01, 0]} s={[0.022, 0.05, 0.026]} c={PLASTER} />
    <Part g={geo.gable} p={[0.035, -0.01, 0.026]} s={[0.06, 0.03, 0.016]} c={roof} r={Math.PI / 2} rough={0.5} />
    <Part g={geo.box} p={[0, -0.04, 0]} s={[0.09, 0.006, 0.014]} c={EARTH_WALL} />
    {tree && (
      <>
        <Part g={geo.cyl} p={[0, -0.012, 0]} s={[0.003, 0.003, 0.03]} c="#5a3a20" />
        <Part g={geo.sphere} p={[0, -0.012, 0.042]} s={[0.018, 0.018, 0.016]} c="#4f7a35" />
      </>
    )}
  </group>
);

const Yurt: React.FC<{ p: V3; r: number }> = ({ p, r }) => (
  <group position={p}>
    <Part g={geo.cyl} p={[0, 0, 0]} s={[r, r, r * 0.75]} c={FELT} />
    <Part g={geo.cone} p={[0, 0, r * 0.75]} s={[r * 1.06, r * 1.06, r * 0.55]} c="#e0d4bf" />
    <Part g={geo.box} p={[0, -r * 0.98, 0]} s={[r * 0.45, r * 0.06, r * 0.55]} c="#b8322a" shadow={false} />
    <Part g={geo.cyl} p={[0, 0, r * 1.25]} s={[r * 0.18, r * 0.18, r * 0.05]} c="#7a5a3a" shadow={false} />
  </group>
);

const Camel: React.FC<{ p: V3; r: number; step: number }> = ({ p, r, step }) => (
  <group position={p} rotation={[0, 0, r]} scale={0.05}>
    {[[-0.35, -0.12], [-0.35, 0.12], [0.35, -0.12], [0.35, 0.12]].map(([x, y], i) => (
      <Part key={i} g={geo.box} p={[x + Math.sin(step + i * 1.6) * 0.06, y, 0]} s={[0.1, 0.1, 0.75]} c="#b48a5a" />
    ))}
    <Part g={geo.sphere} p={[0, 0, 0.95]} s={[0.55, 0.28, 0.25]} c="#c49a6a" />
    <Part g={geo.sphere} p={[-0.1, 0, 1.18]} s={[0.22, 0.2, 0.22]} c="#b48a5a" />
    <Part g={geo.box} p={[0.5, 0, 0.9]} s={[0.12, 0.12, 0.55]} r={0} c="#c49a6a" />
    <Part g={geo.box} p={[0.62, 0, 1.4]} s={[0.3, 0.13, 0.13]} c="#c49a6a" />
    <Part g={geo.box} p={[-0.05, 0, 1.15]} s={[0.4, 0.34, 0.12]} c="#a8302a" />
  </group>
);

const OxCart: React.FC<{ p: V3; r: number }> = ({ p, r }) => (
  <group position={p} rotation={[0, 0, r]} scale={0.06}>
    <Part g={geo.box} p={[-0.3, 0, 0.35]} s={[0.8, 0.5, 0.25]} c="#7a5230" />
    <Part g={geo.cone} p={[-0.3, 0, 0.6]} s={[0.4, 0.3, 0.5]} c={FELT} />
    {[-0.3, 0.3].map((y) => (
      <mesh key={y} geometry={geo.cyl} material={mat("#4a3020")} position={[-0.3, y, 0.25]} rotation={[Math.PI / 2, 0, 0]} scale={[0.28, 0.28, 0.05]} castShadow />
    ))}
    <Part g={geo.box} p={[0.4, 0, 0.25]} s={[0.7, 0.04, 0.04]} c="#5a3a20" />
    <Part g={geo.box} p={[0.95, 0, 0.3]} s={[0.55, 0.28, 0.3]} c="#4a3a30" />
    <Part g={geo.box} p={[1.25, 0, 0.42]} s={[0.18, 0.18, 0.18]} c="#4a3a30" />
    {[[0.75, -0.1], [0.75, 0.1], [1.15, -0.1], [1.15, 0.1]].map(([x, y], i) => (
      <Part key={i} g={geo.box} p={[x, y, 0]} s={[0.07, 0.07, 0.32]} c="#3a2a20" />
    ))}
  </group>
);

// ======================================================================
// The walled city
// ======================================================================

export const KarakorumCity: React.FC<{ frame: number }> = ({ frame }) => {
  const r = useMemo(() => seeded(2024), []);

  // battlements along the walls
  const merlons = useMemo(() => {
    const items: { p: V3; s: V3 }[] = [];
    const add = (x0: number, y0: number, x1: number, y1: number) => {
      const len = Math.hypot(x1 - x0, y1 - y0);
      const n = Math.floor(len / 0.045);
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
        if (Math.abs(x) < 0.12 && Math.abs(Math.abs(y) - H) < 0.01) continue; // gates
        if (Math.abs(y) < 0.12 && Math.abs(Math.abs(x) - W) < 0.01) continue;
        items.push({ p: [x, y, 0.11], s: [0.022, 0.022, 0.022] });
      }
    };
    add(-W, -H, W, -H); add(-W, H, W, H); add(-W, -H, -W, H); add(W, -H, W, H);
    return items;
  }, []);

  // courtyard houses in the craft quarter (north-east) and around
  const houses = useMemo(() => {
    const list: { p: V3; r: number; roof: string; tree: boolean }[] = [];
    const roofs = [TILE_GRAY, TILE_GRAY, TILE_BROWN, "#6b5a4a"];
    const place = (x0: number, x1: number, y0: number, y1: number, step: number) => {
      for (let x = x0; x <= x1; x += step) {
        for (let y = y0; y <= y1; y += step * 0.9) {
          if (r() < 0.15) continue;
          list.push({ p: [x + (r() - 0.5) * 0.01, y, 0.004], r: r() < 0.5 ? 0 : Math.PI, roof: roofs[Math.floor(r() * roofs.length)], tree: r() < 0.5 });
        }
      }
    };
    place(0.08, 0.52, 0.14, 0.9, 0.115); // north-east craft quarter
    place(-0.52, -0.1, 0.42, 0.9, 0.12); // north-west (around the temples)
    place(0.08, 0.52, -0.9, -0.62, 0.115); // south-east beyond the market
    return list.filter((h) => !(h.p[0] < -0.2 && h.p[1] > 0.55 && h.p[1] < 0.85 && h.p[0] > -0.48)); // keep room for the temple
  }, [r]);

  // market stalls with coloured awnings (south-east)
  const stalls = useMemo(() => {
    const colors = ["#c8332b", "#e6b84a", "#2f6fa8", "#3d8a5a", "#d9732a", "#8a3d8a"];
    const list: { p: V3; c: string }[] = [];
    for (let row = 0; row < 4; row++) for (let i = 0; i < 7; i++) {
      list.push({ p: [0.12 + i * 0.055, -0.18 - row * 0.09, 0.004], c: colors[(row * 7 + i * 3) % colors.length] });
    }
    return list;
  }, []);

  const smoke = [[0.3, 0.5], [-0.3, 0.7], [0.4, -0.75], [0.2, 0.3]];

  return (
    <group>
      {/* ground inside the walls and the two main streets */}
      <mesh position={[0, 0, 0.003]} receiveShadow>
        <planeGeometry args={[W * 2, H * 2]} />
        <meshStandardMaterial color={GROUND_IN} roughness={1} />
      </mesh>
      <mesh position={[0, 0, 0.004]} receiveShadow>
        <planeGeometry args={[0.07, H * 2]} />
        <meshStandardMaterial color={STREET} roughness={1} />
      </mesh>
      <mesh position={[0, 0.06, 0.004]} receiveShadow>
        <planeGeometry args={[W * 2, 0.06]} />
        <meshStandardMaterial color={STREET} roughness={1} />
      </mesh>

      {/* rammed-earth walls with a darker base, battlements, towers and gates */}
      {[
        [0, -H, W * 2 + 0.05, 0.05], [0, H, W * 2 + 0.05, 0.05],
      ].map(([x, y, w, d], i) => (
        <group key={`h${i}`}>
          <Part g={geo.box} p={[x, y, 0]} s={[w, d + 0.02, 0.025]} c={EARTH_DARK} />
          <Part g={geo.box} p={[x, y, 0]} s={[w, d, 0.11]} c={EARTH_WALL} />
        </group>
      ))}
      {[
        [-W, 0, 0.05, H * 2 + 0.05], [W, 0, 0.05, H * 2 + 0.05],
      ].map(([x, y, w, d], i) => (
        <group key={`v${i}`}>
          <Part g={geo.box} p={[x, y, 0]} s={[w + 0.02, d, 0.025]} c={EARTH_DARK} />
          <Part g={geo.box} p={[x, y, 0]} s={[w, d, 0.11]} c={EARTH_WALL} />
        </group>
      ))}
      <Instanced g={geo.box} c={EARTH_WALL} items={merlons} />
      {[[-W, -H], [W, -H], [-W, H], [W, H]].map(([x, y], i) => <CornerTower key={i} p={[x, y, 0]} />)}
      <Gatehouse p={[0, -H, 0]} rot={0} frame={frame} seed={1} />
      <Gatehouse p={[0, H, 0]} rot={Math.PI} frame={frame} seed={2} />
      <Gatehouse p={[W, 0.06, 0]} rot={Math.PI / 2} frame={frame} seed={3} />
      <Gatehouse p={[-W, 0.06, 0]} rot={-Math.PI / 2} frame={frame} seed={4} />

      {/* the Khan's palace compound (south-west) */}
      <group position={[-0.3, -0.5, 0]}>
        {[
          [0, -0.24, 0.5, 0.02], [0, 0.24, 0.5, 0.02], [-0.25, 0, 0.02, 0.5], [0.25, 0, 0.02, 0.5],
        ].map(([x, y, w, d], i) => (
          <Part key={i} g={geo.box} p={[x, y, 0]} s={[w, d, 0.05]} c="#b8322a" />
        ))}
        <Part g={geo.box} p={[0, -0.24, 0.05]} s={[0.1, 0.03, 0.03]} c={TILE_GREEN} />
        <Part g={geo.box} p={[0, 0, 0.004]} s={[0.48, 0.46, 0.002]} c="#d8ccb0" shadow={false} />
        {/* stone terrace with steps */}
        <Part g={geo.box} p={[0, 0.06, 0]} s={[0.3, 0.22, 0.045]} c={STONE} />
        {[0, 1, 2].map((k) => (
          <Part key={k} g={geo.box} p={[0, -0.055 - k * 0.012, 0]} s={[0.08, 0.012, 0.035 - k * 0.012]} c={STONE} />
        ))}
        {/* main hall with red columns and a double green-glazed roof */}
        <Part g={geo.box} p={[0, 0.06, 0.045]} s={[0.21, 0.13, 0.075]} c={PLASTER} />
        {Array.from({ length: 8 }, (_, i) => (
          <Part key={i} g={geo.cyl} p={[-0.105 + i * 0.03, -0.012, 0.045]} s={[0.007, 0.007, 0.075]} c={LACQUER} />
        ))}
        <Roof2 p={[0, 0.06, 0.12]} w={0.24} d={0.16} h={0.13} c={TILE_GREEN} />
        {/* side halls */}
        {[-0.17, 0.17].map((x) => (
          <group key={x}>
            <Part g={geo.box} p={[x, 0.02, 0]} s={[0.07, 0.16, 0.05]} c={PLASTER} />
            <Part g={geo.gable} p={[x, 0.02, 0.05]} s={[0.18, 0.08, 0.04]} r={Math.PI / 2} c={TILE_GREEN} rough={0.45} />
          </group>
        ))}
        {/* the Silver Tree: a silver fountain-tree with four spouts, built by a captured Parisian goldsmith */}
        <group position={[0, -0.16, 0.004]}>
          <Part g={geo.cyl} p={[0, 0, 0]} s={[0.03, 0.03, 0.012]} c={STONE} />
          <Part g={geo.cyl} p={[0, 0, 0.012]} s={[0.005, 0.005, 0.09]} c="#dfe6ee" metal={0.9} rough={0.25} />
          {[0, 1, 2, 3].map((k) => {
            const a = (k / 4) * Math.PI * 2 + 0.4;
            return <Part key={k} g={geo.sphere} p={[Math.cos(a) * 0.02, Math.sin(a) * 0.02, 0.085 + (k % 2) * 0.012]} s={[0.012, 0.012, 0.012]} c="#e8eef4" metal={0.9} rough={0.2} />;
          })}
          <Part g={geo.sphere} p={[0, 0, 0.11]} s={[0.012, 0.012, 0.012]} c={GOLD} metal={0.8} rough={0.3} />
        </group>
      </group>

      {/* Buddhist temple: pagoda + white stupa (north-west) */}
      <group position={[-0.34, 0.7, 0]}>
        <Part g={geo.box} p={[0, 0, 0]} s={[0.2, 0.2, 0.012]} c={STONE} />
        {[0, 1, 2, 3, 4].map((k) => {
          const w = 0.09 - k * 0.012;
          return (
            <group key={k}>
              <Part g={geo.box} p={[-0.04, 0, 0.012 + k * 0.04]} s={[w * 0.7, w * 0.7, 0.03]} c={k % 2 ? "#e9dcc4" : "#b8322a"} />
              <Part g={geo.hip} p={[-0.04, 0, 0.04 + k * 0.04]} s={[w * 1.2, w * 1.2, 0.02]} c={TILE_GRAY} rough={0.5} />
            </group>
          );
        })}
        <Part g={geo.cyl} p={[-0.04, 0, 0.24]} s={[0.003, 0.003, 0.05]} c={GOLD} metal={0.7} rough={0.3} />
        <Part g={geo.cyl} p={[0.06, -0.04, 0.012]} s={[0.04, 0.04, 0.02]} c="#f7f3ea" />
        <Part g={geo.sphere} p={[0.06, -0.04, 0.05]} s={[0.035, 0.035, 0.03]} c="#f7f3ea" />
        <Part g={geo.cone} p={[0.06, -0.04, 0.075]} s={[0.012, 0.012, 0.06]} c={GOLD} metal={0.7} rough={0.3} />
      </group>

      {/* mosque with a minaret (by the market, south-east) */}
      <group position={[0.4, -0.5, 0]}>
        <Part g={geo.box} p={[0, 0, 0]} s={[0.12, 0.1, 0.05]} c={PLASTER} />
        <Part g={geo.dome} p={[0, 0, 0.05]} s={[0.045, 0.045, 0.045]} c="#3a9a9a" rough={0.4} />
        <Part g={geo.cyl} p={[0.07, 0.05, 0]} s={[0.012, 0.012, 0.15]} c={PLASTER} />
        <Part g={geo.cyl} p={[0.07, 0.05, 0.12]} s={[0.018, 0.018, 0.008]} c="#d6cdbb" />
        <Part g={geo.cone} p={[0.07, 0.05, 0.15]} s={[0.012, 0.012, 0.03]} c="#3a9a9a" />
      </group>

      {/* Nestorian Christian church with a bell tower (east) */}
      <group position={[0.42, 0.24, 0]}>
        <Part g={geo.box} p={[0, 0, 0]} s={[0.12, 0.06, 0.05]} c="#e8dcc4" />
        <Part g={geo.gable} p={[0, 0, 0.05]} s={[0.13, 0.07, 0.035]} c={TILE_BROWN} rough={0.5} />
        <Part g={geo.box} p={[0.07, 0, 0]} s={[0.03, 0.03, 0.11]} c="#e8dcc4" />
        <Part g={geo.hip} p={[0.07, 0, 0.11]} s={[0.04, 0.04, 0.03]} c={TILE_BROWN} />
        <Part g={geo.box} p={[0.07, 0, 0.14]} s={[0.003, 0.003, 0.03]} c={GOLD} metal={0.7} />
        <Part g={geo.box} p={[0.07, 0, 0.158]} s={[0.016, 0.003, 0.003]} c={GOLD} metal={0.7} />
      </group>

      {/* houses and market */}
      {houses.map((h, i) => <House key={i} {...h} />)}
      {stalls.map((s, i) => (
        <group key={i} position={s.p}>
          <Part g={geo.box} p={[0, 0, 0]} s={[0.04, 0.03, 0.02]} c="#d8c8a8" />
          <mesh position={[0, -0.022, 0.03]} rotation={[0.6, 0, 0]} castShadow>
            <planeGeometry args={[0.046, 0.03]} />
            <meshStandardMaterial color={s.c} side={THREE.DoubleSide} roughness={0.8} />
          </mesh>
        </group>
      ))}

      <CityPeople frame={frame} />

      {/* cooking smoke */}
      {smoke.map(([x, y], i) => (
        <group key={i}>
          {[0, 1, 2].map((k) => {
            const t = ((frame * 0.5 + i * 20 + k * 20) % 60) / 60;
            return (
              <mesh key={k} position={[x + t * 0.06, y + t * 0.03, 0.06 + t * 0.25]}>
                <sphereGeometry args={[0.015 + t * 0.035, 10, 8]} />
                <meshBasicMaterial color="#efeae2" transparent opacity={0.45 * (1 - t)} depthWrite={false} />
              </mesh>
            );
          })}
        </group>
      ))}
    </group>
  );
};

// ======================================================================
// Around the city (world units, placed on the terrain)
// ======================================================================

type HFn = (lon: number, lat: number) => number;

export type Surroundings = {
  /** world x, y of the city centre */
  cx: number;
  cy: number;
  /** world -> lon/lat */
  toLonLat: (x: number, y: number) => [number, number];
  /** flattened ground height (matches the terrain) */
  h: HFn;
  /** raw terrain height (for slopes) */
  raw: HFn;
};

const ground = (s: Surroundings, x: number, y: number) => s.h(...s.toLonLat(x, y));

/** Roads from the four gates out into the steppe. */
export const Roads: React.FC<{ s: Surroundings }> = ({ s }) => {
  const S = CITY_SCALE;
  const tubes = useMemo(() => {
    const paths = [
      [[0, -H * S], [0.4, -3.4], [1.6, -6.5], [3.4, -9.5]],
      [[0, H * S], [-0.5, 3.6], [-1.4, 6.2], [-2.6, 9.4]],
      [[W * S, 0.12], [3.2, 0.6], [6.4, 1.4], [9.6, 1.0]],
      [[-W * S, 0.12], [-2.4, -0.3], [-2.9, -0.8]], // to the river ford
    ];
    return paths.map((pts) => {
      const curve = new THREE.CatmullRomCurve3(pts.map(([x, y]) => new THREE.Vector3(s.cx + x, s.cy + y, 0)));
      const dense = curve.getSpacedPoints(160).map((q) => new THREE.Vector3(q.x, q.y, ground(s, q.x, q.y) + 0.03));
      return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(dense), 240, 0.05, 5, false);
    });
  }, [s]);
  return (
    <>
      {tubes.map((g, i) => (
        <mesh key={i} geometry={g} receiveShadow scale={[1, 1, 1]}>
          <meshStandardMaterial color="#cdb68a" roughness={1} />
        </mesh>
      ))}
    </>
  );
};

/** Camel caravan, ox-carts and riders travelling the roads. */
export const Traffic: React.FC<{ s: Surroundings; frame: number }> = ({ s, frame }) => {
  const S = CITY_SCALE;
  const east = useMemo(
    () => new THREE.CatmullRomCurve3([[9.6, 1.0], [6.4, 1.4], [3.2, 0.6], [W * S + 0.2, 0.12]].map(([x, y]) => new THREE.Vector3(s.cx + x, s.cy + y, 0))),
    [s],
  );
  const south = useMemo(
    () => new THREE.CatmullRomCurve3([[3.4, -9.5], [1.6, -6.5], [0.4, -3.4], [0, -H * S - 0.2]].map(([x, y]) => new THREE.Vector3(s.cx + x, s.cy + y, 0))),
    [s],
  );
  const at = (curve: THREE.CatmullRomCurve3, u: number) => {
    const p = curve.getPointAt(Math.min(0.999, Math.max(0, u)));
    const q = curve.getPointAt(Math.min(0.999, Math.max(0.001, u + 0.01)));
    return { p: [p.x, p.y, ground(s, p.x, p.y) + 0.035] as V3, r: Math.atan2(q.y - p.y, q.x - p.x) };
  };
  const u0 = ((frame * 0.0016) % 1) * 0.75;
  return (
    <>
      {[0, 1, 2, 3, 4].map((k) => {
        const { p, r } = at(east, 0.1 + u0 - k * 0.02);
        return <Camel key={k} p={p} r={r} step={frame * 0.3 + k} />;
      })}
      {[0, 1].map((k) => {
        const { p, r } = at(south, 0.25 + u0 * 0.8 - k * 0.12);
        return <OxCart key={k} p={p} r={r} />;
      })}
    </>
  );
};

/** Ger camps with fenced corrals around the city, and herds grazing further out. */
export const CampsAndHerds: React.FC<{ s: Surroundings; frame: number }> = ({ s, frame }) => {
  const S = CITY_SCALE;
  const data = useMemo(() => {
    const r = seeded(77);
    const camps: { x: number; y: number }[] = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + r() * 0.4;
      const d = 2.2 + r() * 1.3;
      const c = { x: Math.cos(a) * d * 1.05, y: Math.sin(a) * d * 1.25 };
      if (c.x < -1.5 && Math.abs(c.y) < 6) continue; // river and fields are on the west side
      camps.push(c);
    }
    const yurts: { p: V3; r: number }[] = [];
    const fence: { p: V3; s: V3; r: number }[] = [];
    camps.forEach((c) => {
      const n = 6 + Math.floor(r() * 6);
      for (let k = 0; k < n; k++) {
        const a = r() * Math.PI * 2;
        const d = 0.1 + r() * 0.35;
        const x = s.cx + c.x + Math.cos(a) * d, y = s.cy + c.y + Math.sin(a) * d;
        if (Math.abs(x - s.cx) < W * S + 0.25 && Math.abs(y - s.cy) < H * S + 0.25) continue;
        yurts.push({ p: [x, y, ground(s, x, y)], r: 0.045 + r() * 0.02 });
      }
      // corral: ring of fence posts
      const fx = s.cx + c.x + 0.45, fy = s.cy + c.y - 0.2;
      for (let k = 0; k < 18; k++) {
        const a = (k / 18) * Math.PI * 2;
        const x = fx + Math.cos(a) * 0.18, y = fy + Math.sin(a) * 0.13;
        fence.push({ p: [x, y, ground(s, x, y)], s: [0.008, 0.008, 0.04], r: a });
      }
    });
    const herds: { sheep: { p: V3; s: V3 }[]; horses: { p: V3; s: V3; r: number }[] } = { sheep: [], horses: [] };
    for (let i = 0; i < 14; i++) {
      const a = r() * Math.PI * 2;
      const d = 3.4 + r() * 4.5;
      const hx = s.cx + Math.cos(a) * d * 1.1, hy = s.cy + Math.sin(a) * d;
      const horses = r() < 0.35;
      const n = horses ? 10 + Math.floor(r() * 8) : 25 + Math.floor(r() * 25);
      for (let k = 0; k < n; k++) {
        const x = hx + (r() - 0.5) * 0.7, y = hy + (r() - 0.5) * 0.5;
        const z = ground(s, x, y);
        if (horses) herds.horses.push({ p: [x, y, z], s: [0.04, 0.014, 0.03], r: r() * Math.PI });
        else herds.sheep.push({ p: [x, y, z + 0.008], s: [0.014, 0.011, 0.01] });
      }
    }
    return { yurts, fence, herds };
  }, [s, S]);
  return (
    <>
      {data.yurts.map((y, i) => <Yurt key={i} p={y.p} r={y.r} />)}
      <Instanced g={geo.box} c="#7a5a3a" items={data.fence} />
      <Instanced g={geo.sphere} c="#f4efe4" items={data.herds.sheep} shadow={false} />
      <Instanced g={geo.sphere} c="#5a3a24" items={data.herds.horses.map((h) => ({ p: [h.p[0], h.p[1], h.p[2] + 0.014] as V3, s: [0.02, 0.009, 0.012] as V3, r: h.r }))} />
      {/* a little smoke from the camps */}
      {data.yurts.filter((_, i) => i % 7 === 0).map((y, i) => {
        const t = ((frame * 0.45 + i * 13) % 60) / 60;
        return (
          <mesh key={i} position={[y.p[0] + t * 0.08, y.p[1] + t * 0.04, y.p[2] + 0.1 + t * 0.3]}>
            <sphereGeometry args={[0.02 + t * 0.04, 10, 8]} />
            <meshBasicMaterial color="#efeae2" transparent opacity={0.4 * (1 - t)} depthWrite={false} />
          </mesh>
        );
      })}
    </>
  );
};

/** Fields by the river, trees along the banks, larch forest on north-facing slopes, the stone turtle. */
export const Countryside: React.FC<{ s: Surroundings; river: THREE.Vector3[] }> = ({ s, river }) => {
  const data = useMemo(() => {
    const r = seeded(4242);
    // larch forest: north-facing hillsides
    const larches: { p: V3; s: V3 }[] = [];
    const d = 0.08;
    for (let tries = 0; tries < 9000 && larches.length < 1400; tries++) {
      const a = r() * Math.PI * 2;
      const dist = 4.4 + r() * 10;
      const x = s.cx + Math.cos(a) * dist * 1.2, y = s.cy + Math.sin(a) * dist;
      const [lon, lat] = s.toLonLat(x, y);
      const z = s.raw(lon, lat);
      const dzdy = (s.raw(lon, lat + d) - s.raw(lon, lat - d)) / (2 * d);
      const facingNorth = dzdy < -0.12;
      if (!facingNorth || z < 0.5) continue;
      const k = 0.7 + r() * 0.6;
      larches.push({ p: [x, y, ground(s, x, y) - 0.01], s: [0.05 * k, 0.05 * k, 0.2 * k] });
    }
    // trees along the river banks
    const willows: { p: V3; s: V3 }[] = [];
    river.forEach((q, i) => {
      if (i % 3 !== 0) return;
      for (const side of [-1, 1]) {
        if (r() < 0.4) continue;
        const x = q.x + side * (0.12 + r() * 0.12), y = q.y + (r() - 0.5) * 0.1;
        willows.push({ p: [x, y, ground(s, x, y) + 0.05], s: [0.06, 0.06, 0.055] });
      }
    });
    // strip fields between city and river
    const fields: { p: V3; s: V3; c: string; r: number }[] = [];
    const greens = ["#7d9450", "#9a9a62", "#6c8a4a", "#a8a070", "#86985a"];
    for (let i = 0; i < 26; i++) {
      const x = s.cx - 2.05 - r() * 0.2, y = s.cy - 2.6 + i * 0.2 + (r() - 0.5) * 0.05;
      fields.push({ p: [x, y, ground(s, x, y) + 0.006], s: [0.42 + r() * 0.18, 0.17, 0.004], c: greens[i % greens.length], r: 0.08 });
    }
    return { larches, willows, fields };
  }, [s, river]);
  const tz = ground(s, s.cx - 1.55, s.cy + 2.35);
  return (
    <>
      <Instanced g={geo.cone} c="#2f4a2c" items={data.larches} rough={0.95} />
      <Instanced g={geo.sphere} c="#5d8a3a" items={data.willows} rough={0.95} />
      {data.fields.map((f, i) => (
        <mesh key={i} position={f.p} rotation={[0, 0, f.r]} receiveShadow>
          <planeGeometry args={[f.s[0], f.s[1]]} />
          <meshStandardMaterial color={f.c} roughness={1} />
        </mesh>
      ))}
      {/* Karakorum's granite turtle (it still stands there today) */}
      <group position={[s.cx - 1.55, s.cy + 2.35, tz]} scale={0.09}>
        <Part g={geo.box} p={[0, 0, 0]} s={[1.3, 0.9, 0.18]} c="#8a8a84" />
        <Part g={geo.sphere} p={[0, 0, 0.32]} s={[0.55, 0.4, 0.25]} c="#9a9a92" />
        <Part g={geo.sphere} p={[0.62, 0, 0.3]} s={[0.16, 0.12, 0.11]} c="#9a9a92" />
      </group>
    </>
  );
};

// ======================================================================
// People
// ======================================================================

const personGeo = (() => {
  const robe = new THREE.CylinderGeometry(0.62, 1, 1, 10);
  robe.rotateX(Math.PI / 2);
  robe.translate(0, 0, 0.5);
  return { robe };
})();

const SKIN = "#3a2a20";

/** A tiny 3D person (about 0.05 city units tall): deel, sash, arms, head and hat, optional spear. */
const TinyPerson: React.FC<{
  p: V3;
  heading: number;
  robe: string;
  hat?: string;
  /** walk phase (radians) or undefined to stand */
  walk?: number;
  spear?: boolean;
  scale?: number;
  bareHead?: boolean;
}> = ({ p, heading, robe, hat = "#c8332b", walk, spear, scale = 0.62, bareHead }) => {
  const swing = walk === undefined ? 0 : Math.sin(walk) * 0.5;
  const bob = walk === undefined ? 0 : Math.abs(Math.cos(walk)) * 0.002;
  return (
    <group position={p} rotation={[0, 0, heading]} scale={scale}>
      <group position={[0, 0, bob]}>
        {/* legs + boots */}
        {[-1, 1].map((side) => (
          <group key={side} position={[0, side * 0.004, 0.016]} rotation={[0, side * swing, 0]}>
            <Part g={geo.box} p={[0, 0, -0.016]} s={[0.005, 0.005, 0.016]} c={BOOT_C} shadow={false} />
          </group>
        ))}
        {/* deel: flared skirt + torso, sash, collar trim */}
        <Part g={personGeo.robe} p={[0, 0, 0.012]} s={[0.011, 0.011, 0.022]} c={robe} />
        <Part g={geo.cyl} p={[0, 0, 0.032]} s={[0.0075, 0.0068, 0.012]} c={robe} />
        <Part g={geo.cyl} p={[0, 0, 0.03]} s={[0.0082, 0.0082, 0.0035]} c="#e08a2a" shadow={false} />
        <Part g={geo.box} p={[0.006, 0.002, 0.034]} s={[0.002, 0.006, 0.008]} r={0.5} c={GOLD} shadow={false} />
        {/* arms swing opposite the legs */}
        {[-1, 1].map((side) => (
          <group key={side} position={[0, side * 0.0095, 0.043]} rotation={[0, -side * swing * 0.8, 0]}>
            <Part g={geo.box} p={[0, 0, -0.016]} s={[0.0045, 0.0045, 0.016]} c={robe} shadow={false} />
            <Part g={geo.sphere} p={[0, 0, -0.017]} s={[0.0028, 0.0028, 0.0028]} c={SKIN} shadow={false} />
          </group>
        ))}
        {/* head + hat */}
        <Part g={geo.sphere} p={[0, 0, 0.05]} s={[0.0062, 0.0062, 0.0066]} c={SKIN} />
        {!bareHead && (
          <>
            <Part g={geo.cyl} p={[0, 0, 0.053]} s={[0.0085, 0.0085, 0.0028]} c="#6b4a32" shadow={false} />
            <Part g={geo.cone} p={[0, 0, 0.0555]} s={[0.0068, 0.0068, 0.008]} c={hat} />
          </>
        )}
        {spear && (
          <group position={[0.004, -0.012, 0]}>
            <Part g={geo.cyl} p={[0, 0, 0]} s={[0.0012, 0.0012, 0.085]} c="#5a3a20" shadow={false} />
            <Part g={geo.cone} p={[0, 0, 0.085]} s={[0.0025, 0.0025, 0.01]} c="#dfe6ee" metal={0.8} rough={0.3} shadow={false} />
            <mesh position={[0, -0.006, 0.075]}>
              <planeGeometry args={[0.001, 0.012]} />
              <meshStandardMaterial color="#c8332b" side={THREE.DoubleSide} />
            </mesh>
          </group>
        )}
      </group>
    </group>
  );
};
const BOOT_C = "#3a2414";

/** A tiny horse with rider for the roads and the herds. */
export const TinyRider: React.FC<{ p: V3; heading: number; robe: string; hat: string; frame: number; seed: number; moving?: boolean }> = ({
  p, heading, robe, hat, frame, seed, moving = true,
}) => {
  const ph = moving ? frame * 0.5 + seed : 0;
  return (
    <group position={p} rotation={[0, 0, heading]} scale={0.62}>
      {/* horse */}
      {[[0.018, -0.005, 0], [0.018, 0.005, 1.6], [-0.018, -0.005, Math.PI], [-0.018, 0.005, Math.PI + 1.6]].map(([x, y, d], i) => (
        <group key={i} position={[x, y, 0.024]} rotation={[0, Math.sin(ph + d) * 0.5, 0]}>
          <Part g={geo.box} p={[0, 0, -0.024]} s={[0.005, 0.005, 0.024]} c="#3b261a" shadow={false} />
        </group>
      ))}
      <Part g={geo.sphere} p={[0, 0, 0.032]} s={[0.026, 0.011, 0.011]} c="#4a301f" />
      <Part g={geo.box} p={[0.026, 0, 0.034]} s={[0.012, 0.007, 0.02]} r={0} c="#4a301f" />
      <Part g={geo.box} p={[0.034, 0, 0.05]} s={[0.016, 0.007, 0.008]} c="#4a301f" />
      <Part g={geo.box} p={[-0.028, 0, 0.022]} s={[0.006, 0.003, 0.016]} c="#1a120c" shadow={false} />
      <Part g={geo.box} p={[0, 0, 0.04]} s={[0.018, 0.024, 0.004]} c="#b8322a" shadow={false} />
      {/* rider */}
      <Part g={geo.cyl} p={[0, 0, 0.042]} s={[0.0075, 0.0068, 0.02]} c={robe} />
      <Part g={geo.box} p={[0.002, -0.009, 0.034]} s={[0.012, 0.004, 0.006]} c={robe} shadow={false} />
      <Part g={geo.box} p={[0.002, 0.009, 0.034]} s={[0.012, 0.004, 0.006]} c={robe} shadow={false} />
      <Part g={geo.sphere} p={[0, 0, 0.068]} s={[0.006, 0.006, 0.0065]} c={SKIN} />
      <Part g={geo.cyl} p={[0, 0, 0.071]} s={[0.0082, 0.0082, 0.0026]} c="#6b4a32" shadow={false} />
      <Part g={geo.cone} p={[0, 0, 0.0735]} s={[0.0065, 0.0065, 0.008]} c={hat} />
    </group>
  );
};

const ROBES = ["#2f5aa8", "#a8302a", "#3d7a4a", "#6a3d8a", "#c9892f", "#2a6a8a", "#8a4a2a"];
const HATS = ["#c8332b", "#e6b84a", "#2f5aa8", "#3d7a4a"];

/** People inside the walls: wall guards, gate guards, palace guards, street traffic, market crowd, monks. */
export const CityPeople: React.FC<{ frame: number }> = ({ frame }) => {
  const data = useMemo(() => {
    const r = seeded(515);
    const guards: { p: V3; h: number }[] = [];
    // guards walking the wall tops (z = 0.11), facing outward
    const wallSpots: [number, number, number][] = [];
    for (const t of [-0.75, -0.4, 0.35, 0.72]) wallSpots.push([t * W, -H, -Math.PI / 2], [t * W, H, Math.PI / 2]);
    for (const t of [-0.7, -0.35, 0.4, 0.75]) wallSpots.push([-W, t * H, Math.PI], [W, t * H, 0]);
    wallSpots.forEach(([x, y, h]) => guards.push({ p: [x, y, 0.11], h }));
    // two guards outside every gate
    const gateGuards: { p: V3; h: number }[] = [];
    [[0, -H - 0.09, -Math.PI / 2], [0, H + 0.09, Math.PI / 2], [W + 0.09, 0.06, 0], [-W - 0.09, 0.06, Math.PI]].forEach(([x, y, h]) => {
      const nx = Math.cos(h + Math.PI / 2) * 0.05, ny = Math.sin(h + Math.PI / 2) * 0.05;
      gateGuards.push({ p: [x + nx, y + ny, 0.004], h }, { p: [x - nx, y - ny, 0.004], h });
    });
    // palace guards in red at the compound gate and the terrace steps
    const palace: { p: V3; h: number }[] = [
      { p: [-0.34, -0.77, 0.004], h: -Math.PI / 2 }, { p: [-0.26, -0.77, 0.004], h: -Math.PI / 2 },
      { p: [-0.35, -0.6, 0.004], h: -Math.PI / 2 }, { p: [-0.25, -0.6, 0.004], h: -Math.PI / 2 },
    ];
    // street walkers: along the two main streets, in both directions
    const walkers = Array.from({ length: 26 }, (_, i) => ({
      ns: i % 2 === 0,
      lane: (r() < 0.5 ? -1 : 1) * (0.012 + r() * 0.014),
      start: r(),
      speed: (0.0011 + r() * 0.0009) * (r() < 0.5 ? -1 : 1),
      robe: ROBES[Math.floor(r() * ROBES.length)],
      hat: HATS[Math.floor(r() * HATS.length)],
      phase: r() * 6,
    }));
    // market crowd milling between the stall rows
    const market = Array.from({ length: 22 }, () => ({
      x: 0.12 + r() * 0.36,
      y: -0.225 - Math.floor(r() * 3) * 0.09 + (r() - 0.5) * 0.02,
      robe: ROBES[Math.floor(r() * ROBES.length)],
      hat: HATS[Math.floor(r() * HATS.length)],
      phase: r() * 6,
      h: r() * Math.PI * 2,
    }));
    // monks by the temple, people at the mosque and church
    const others = [
      ...[0, 1, 2, 3].map((k) => ({ p: [-0.3 + k * 0.025, 0.6, 0.004] as V3, h: Math.PI / 2, robe: "#e08a2a", hat: "#a8302a", bare: k % 2 === 0 })),
      ...[0, 1, 2].map((k) => ({ p: [0.36 + k * 0.025, -0.58, 0.004] as V3, h: Math.PI / 2, robe: "#efe6d2", hat: "#efe6d2", bare: false })),
      ...[0, 1].map((k) => ({ p: [0.4 + k * 0.025, 0.18, 0.004] as V3, h: Math.PI / 2, robe: "#3a3a4a", hat: "#3a3a4a", bare: true })),
    ];
    return { guards, gateGuards, palace, walkers, market, others };
  }, []);

  return (
    <group>
      {data.guards.map((g, i) => (
        <TinyPerson key={`w${i}`} p={g.p} heading={g.h} robe="#5f6b78" hat="#8a95a2" spear />
      ))}
      {data.gateGuards.map((g, i) => (
        <TinyPerson key={`g${i}`} p={g.p} heading={g.h} robe="#5f6b78" hat="#8a95a2" spear />
      ))}
      {data.palace.map((g, i) => (
        <TinyPerson key={`p${i}`} p={g.p} heading={g.h} robe="#a8302a" hat={GOLD} spear />
      ))}
      {data.walkers.map((w, i) => {
        const span = w.ns ? H * 1.9 : W * 1.9;
        const u = ((((w.start + frame * w.speed) % 1) + 1) % 1) * span - span / 2;
        const p: V3 = w.ns ? [w.lane, u, 0.004] : [u, 0.06 + w.lane, 0.004];
        const heading = w.ns ? (w.speed > 0 ? Math.PI / 2 : -Math.PI / 2) : w.speed > 0 ? 0 : Math.PI;
        return <TinyPerson key={`s${i}`} p={p} heading={heading} robe={w.robe} hat={w.hat} walk={frame * 0.35 + w.phase} />;
      })}
      {data.market.map((m, i) => {
        const dx = Math.sin(frame * 0.02 + m.phase) * 0.012;
        return <TinyPerson key={`m${i}`} p={[m.x + dx, m.y, 0.004]} heading={m.h + Math.sin(frame * 0.03 + m.phase) * 0.5} robe={m.robe} hat={m.hat} walk={Math.abs(Math.cos(frame * 0.02 + m.phase)) > 0.5 ? frame * 0.3 + m.phase : undefined} />;
      })}
      {data.others.map((o, i) => (
        <TinyPerson key={`o${i}`} p={o.p} heading={o.h} robe={o.robe} hat={o.hat} bareHead={o.bare} />
      ))}
    </group>
  );
};

/** People and riders outside the walls (world units). */
export const CountryPeople: React.FC<{ s: Surroundings; frame: number }> = ({ s, frame }) => {
  const S = CITY_SCALE;
  const data = useMemo(() => {
    const r = seeded(919);
    // villagers near the ger camps around the walls
    const folk: { p: V3; h: number; robe: string; hat: string; walk: boolean; phase: number }[] = [];
    for (let i = 0; i < 40; i++) {
      const a = r() * Math.PI * 2;
      const d = 2.0 + r() * 1.8;
      const x = s.cx + Math.cos(a) * d * 1.05, y = s.cy + Math.sin(a) * d * 1.25;
      if (x - s.cx < -1.5) continue; // river side
      if (Math.abs(x - s.cx) < W * S + 0.2 && Math.abs(y - s.cy) < H * S + 0.2) continue;
      folk.push({ p: [x, y, ground(s, x, y)], h: r() * Math.PI * 2, robe: ROBES[Math.floor(r() * ROBES.length)], hat: HATS[Math.floor(r() * HATS.length)], walk: r() < 0.4, phase: r() * 6 });
    }
    // herders riding around the herds
    const herders = Array.from({ length: 8 }, () => {
      const a = r() * Math.PI * 2;
      const d = 3.6 + r() * 4.2;
      return { cx: s.cx + Math.cos(a) * d * 1.1, cy: s.cy + Math.sin(a) * d, rad: 0.35 + r() * 0.3, phase: r() * 6, robe: ROBES[Math.floor(r() * ROBES.length)], hat: HATS[Math.floor(r() * HATS.length)] };
    });
    return { folk, herders };
  }, [s, S]);
  // riders on the roads (east road and north road)
  const roads = useMemo(
    () => [
      new THREE.CatmullRomCurve3([[W * S + 0.2, 0.12], [3.2, 0.6], [6.4, 1.4], [9.6, 1.0]].map(([x, y]) => new THREE.Vector3(s.cx + x, s.cy + y, 0))),
      new THREE.CatmullRomCurve3([[0, H * S + 0.2], [-0.5, 3.6], [-1.4, 6.2], [-2.6, 9.4]].map(([x, y]) => new THREE.Vector3(s.cx + x, s.cy + y, 0))),
    ],
    [s, S],
  );
  return (
    <group>
      {data.folk.map((f, i) => {
        const dx = f.walk ? Math.cos(f.h) * Math.sin(frame * 0.01 + f.phase) * 0.08 : 0;
        const dy = f.walk ? Math.sin(f.h) * Math.sin(frame * 0.01 + f.phase) * 0.08 : 0;
        return (
          <TinyPerson key={`f${i}`} p={[f.p[0] + dx, f.p[1] + dy, f.p[2]]} heading={f.h} robe={f.robe} hat={f.hat}
            walk={f.walk ? frame * 0.35 + f.phase : undefined} scale={S * 0.62} />
        );
      })}
      {data.herders.map((h, i) => {
        const a = frame * 0.006 + h.phase;
        const x = h.cx + Math.cos(a) * h.rad, y = h.cy + Math.sin(a) * h.rad * 0.7;
        return <TinyRider key={`h${i}`} p={[x, y, ground(s, x, y)]} heading={a + Math.PI / 2} robe={h.robe} hat={h.hat} frame={frame} seed={i} />;
      })}
      {roads.map((curve, k) =>
        [0, 1, 2].map((j) => {
          const u = (((frame * 0.0012 + j * 0.3 + k * 0.15) % 1) + 1) % 1;
          const p = curve.getPointAt(u);
          const q = curve.getPointAt(Math.min(0.999, u + 0.01));
          // alternate directions: some ride into the city, some out
          const outbound = (j + k) % 2 === 0;
          const heading = Math.atan2(q.y - p.y, q.x - p.x) + (outbound ? 0 : Math.PI);
          return (
            <group key={`r${k}${j}`} scale={S}>
              <TinyRider p={[p.x / S, p.y / S, (ground(s, p.x, p.y) + 0.01) / S]} heading={heading} robe={ROBES[(j + k * 2) % ROBES.length]} hat={HATS[j % HATS.length]} frame={frame} seed={j + k} />
            </group>
          );
        }),
      )}
    </group>
  );
};
