import { useMemo } from "react";
import { Easing, interpolate, spring, useVideoConfig } from "remotion";
import { Rider, seeded } from "./SteppeNight";

/**
 * Scene 2 part 3 (0:55-1:10): the army's three advantages.
 * Three cards slide up one after another, each with a looping animated icon:
 *   Mobility (galloping horse + spare horses), Composite Recurve Bow (draw & shoot),
 *   Adapted Siege Tech (trebuchet launch).
 * Behind them, horse archers gallop across the steppe.
 */

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "'Avenir Next', 'Helvetica Neue', Helvetica, Arial, sans-serif";
const CREAM = "#fff3df";
const ICON = "#f3e6cf";
const GOLD = "#ffc94d";

// ======================================================================
// 3D: horse archers galloping across the ridge, and flat clouds in the sky
// ======================================================================

export const ArcherBand: React.FC<{ frame: number; start: number; ridge: (x: number) => number }> = ({ frame, start, ridge }) => {
  const riders = useMemo(() => {
    const r = seeded(55);
    const robes = ["#2f5aa8", "#a8302a", "#3d7a4a", "#6a3d8a", "#c9892f", "#2f5aa8", "#a8302a"];
    return robes.map((robe, i) => ({ robe, delay: i * 14 + r() * 8, lane: r() * 0.4, offset: r() * 6, hat: i % 2 ? "#ffc94d" : "#c8332b" }));
  }, []);
  if (frame < start) return null;
  return (
    <>
      {riders.map((r, i) => {
        const t = (frame - start - r.delay) / 330;
        if (t < 0 || t > 1) return null;
        const x = interpolate(t, [0, 1], [-17, 19]);
        return (
          <group key={i} position={[x, ridge(x) - 0.05 - r.lane * 0.3, -8.4 + r.lane]} scale={0.66}>
            <Rider frame={frame} offset={r.offset} hat={r.hat} robe={r.robe} banner={i === 2} />
          </group>
        );
      })}
    </>
  );
};

/** Simple flat clouds (overlapping circles) high in the sky; the camera tilts up into them at the end. */
export const SkyClouds: React.FC<{ frame: number; opacity: number }> = ({ frame, opacity }) => {
  const clouds = useMemo(() => {
    const r = seeded(808);
    return Array.from({ length: 18 }, () => ({
      x: (r() - 0.5) * 70,
      y: 20 + r() * 38,
      z: -30 + r() * 6,
      s: 1.5 + r() * 2.5,
      puffs: Array.from({ length: 7 }, (_, k) => ({ dx: (k - 3) * 0.7 + (r() - 0.5) * 0.4, dy: (k % 2) * 0.35 + (r() - 0.5) * 0.3 - Math.abs(k - 3) * 0.12, r: 0.65 + r() * 0.5 })),
    }));
  }, []);
  if (opacity <= 0.01) return null;
  return (
    <>
      {clouds.map((c, i) => (
        <group key={i} position={[c.x + frame * 0.004 * (i % 3 + 1), c.y, c.z]} scale={c.s}>
          {c.puffs.map((p, k) => (
            <mesh key={k} position={[p.dx, p.dy, k * 0.001]}>
              <circleGeometry args={[p.r, 28]} />
              <meshBasicMaterial color="#fff8ee" transparent opacity={opacity * 0.92} depthWrite={false} />
            </mesh>
          ))}
        </group>
      ))}
    </>
  );
};

// ======================================================================
// Animated SVG icons (drawn in cream on dark glass cards)
// ======================================================================

/** Horse in profile with jointed legs; phase drives the gallop. */
const HorseIcon: React.FC<{ phase: number; x?: number; y?: number; s?: number; opacity?: number }> = ({ phase, x = 0, y = 0, s = 1, opacity = 1 }) => {
  const leg = (hx: number, hy: number, d: number, front: boolean) => {
    const upper = Math.sin(phase + d) * (front ? 0.55 : 0.5);
    const knee = front ? -0.9 * Math.max(0, Math.sin(phase + d + 0.9)) : 0.75 * Math.max(0, Math.sin(phase + Math.PI + d + 0.9));
    const a = upper;
    const kx = hx + Math.sin(a) * 26;
    const ky = hy + Math.cos(a) * 26;
    const b = a + knee;
    const fx = kx + Math.sin(b) * 26;
    const fy = ky + Math.cos(b) * 26;
    return <polyline points={`${hx},${hy} ${kx},${ky} ${fx},${fy}`} fill="none" stroke={ICON} strokeWidth={front ? 8 : 7} strokeLinecap="round" strokeLinejoin="round" />;
  };
  const bob = Math.abs(Math.sin(phase)) * 4;
  const tail = Math.sin(phase * 0.5) * 6;
  return (
    <g transform={`translate(${x} ${y - bob}) scale(${s})`} opacity={opacity}>
      {/* far legs, slightly dimmer */}
      <g opacity={0.6}>
        {leg(140, 84, 0.6, true)}
        {leg(78, 84, Math.PI + 0.6, false)}
      </g>
      <path d={`M 64 64 Q 40 ${70 + tail} 34 ${92 + tail} Q 48 ${82 + tail} 60 74 Z`} fill={ICON} />
      <ellipse cx={110} cy={70} rx={52} ry={22} fill={ICON} />
      <path d="M 140 58 L 170 26 L 186 34 L 160 82 Z" fill={ICON} />
      <path d="M 168 22 Q 186 18 204 36 Q 212 46 206 52 Q 196 54 186 46 Q 176 40 166 36 Z" fill={ICON} />
      <polygon points="170,22 172,8 180,22" fill={ICON} />
      {[0, 1, 2, 3].map((i) => (
        <polygon key={i} points={`${164 - i * 7},${30 + i * 9} ${152 - i * 7 + Math.sin(phase + i) * 2},${28 + i * 9} ${160 - i * 7},${38 + i * 9}`} fill={GOLD} />
      ))}
      <circle cx={192} cy={34} r={2.6} fill="#1a2a3a" />
      {leg(150, 84, 0, true)}
      {leg(86, 84, Math.PI, false)}
      {/* saddle cloth */}
      <path d="M 92 50 L 128 50 L 130 76 L 90 76 Z" fill="#c8332b" />
      <path d="M 92 50 L 128 50" stroke={GOLD} strokeWidth={4} />
    </g>
  );
};

const MobilityIcon: React.FC<{ f: number }> = ({ f }) => {
  const phase = f * 0.42;
  return (
    <svg viewBox="0 0 260 150" width={260} height={150}>
      {/* speed lines */}
      {[0, 1, 2, 3].map((i) => {
        const t = ((f * 3 + i * 23) % 70) / 70;
        return <line key={i} x1={20 + (1 - t) * 60} y1={40 + i * 18} x2={20 + (1 - t) * 60 - 34} y2={40 + i * 18} stroke={GOLD} strokeWidth={4} strokeLinecap="round" opacity={(1 - t) * 0.7} />;
      })}
      {/* spare horses behind */}
      <HorseIcon phase={phase + 1.7} x={-14} y={8} s={0.8} opacity={0.32} />
      <HorseIcon phase={phase + 0.9} x={14} y={14} s={0.85} opacity={0.5} />
      <HorseIcon phase={phase} x={44} y={20} s={0.88} />
      {/* dust puffs */}
      {[0, 1, 2].map((i) => {
        const t = ((f * 2 + i * 31) % 60) / 60;
        return <circle key={i} cx={100 - t * 80} cy={136 - t * 10} r={4 + t * 10} fill={ICON} opacity={(1 - t) * 0.35} />;
      })}
    </svg>
  );
};

const BowIcon: React.FC<{ f: number }> = ({ f }) => {
  const cycle = 80;
  const t = f % cycle;
  const pull = t < 34 ? Easing.inOut(Easing.cubic)(t / 34) * 46 : t < 42 ? 46 : 0;
  const released = t >= 42;
  const twang = released ? Math.sin((t - 42) * 2.2) * Math.max(0, 8 - (t - 42)) : 0;
  const arrowX = released ? (t - 42) * 22 : 0;
  const arrowO = released ? Math.max(0, 1 - (t - 42) / 14) : interpolate(t, [0, 8], [0, 1], clamp);
  const nockX = 104 - pull + twang;
  return (
    <svg viewBox="0 0 260 150" width={260} height={150}>
      {/* bow: wood core, horn belly, sinew back - with curled (recurve) tips */}
      <path d="M 106 16 C 136 30, 140 58, 128 75 C 140 92, 136 120, 106 134" fill="none" stroke="#8a5a2a" strokeWidth={13} strokeLinecap="round" />
      <path d="M 106 16 C 136 30, 140 58, 128 75 C 140 92, 136 120, 106 134" fill="none" stroke={ICON} strokeWidth={6} strokeLinecap="round" />
      <path d="M 106 16 C 136 30, 140 58, 128 75 C 140 92, 136 120, 106 134" fill="none" stroke="#2a1a10" strokeWidth={1.6} strokeDasharray="2 5" />
      <path d="M 106 16 Q 96 12 98 2" fill="none" stroke={ICON} strokeWidth={6} strokeLinecap="round" />
      <path d="M 106 134 Q 96 138 98 148" fill="none" stroke={ICON} strokeWidth={6} strokeLinecap="round" />
      <rect x={124} y={66} width={12} height={18} rx={4} fill={GOLD} />
      {/* string */}
      <polyline points={`100,6 ${nockX},75 100,144`} fill="none" stroke={ICON} strokeWidth={2.5} />
      {/* arrow */}
      <g transform={`translate(${(released ? 104 : nockX) + arrowX} 75)`} opacity={arrowO}>
        <line x1={0} y1={0} x2={120} y2={0} stroke={ICON} strokeWidth={4} strokeLinecap="round" />
        <polygon points="120,-7 136,0 120,7" fill={GOLD} />
        <polygon points="0,0 -10,-8 6,-2" fill="#c8332b" />
        <polygon points="0,0 -10,8 6,2" fill="#c8332b" />
        {released && <line x1={-10} y1={0} x2={-60} y2={0} stroke={GOLD} strokeWidth={3} opacity={0.5} strokeLinecap="round" />}
      </g>
    </svg>
  );
};

const TrebuchetIcon: React.FC<{ f: number }> = ({ f }) => {
  const cycle = 96;
  const t = f % cycle;
  // arm angle (degrees from pointing right, counter-clockwise): loaded -> thrown -> settles back
  const loaded = 205;
  const thrown = 70;
  let ang = loaded;
  if (t >= 26 && t < 40) ang = interpolate(t, [26, 40], [loaded, thrown], { easing: Easing.in(Easing.quad) });
  else if (t >= 40 && t < 50) ang = thrown - Math.sin((t - 40) * 0.9) * 8 * (1 - (t - 40) / 10);
  else if (t >= 50) ang = interpolate(t, [50, 96], [thrown, loaded], { easing: Easing.inOut(Easing.sin) });
  const rad = (ang * Math.PI) / 180;
  const px = 110, py = 46;
  const L = 92, S = 28;
  const tip = { x: px + Math.cos(rad) * L, y: py - Math.sin(rad) * L };
  const back = { x: px - Math.cos(rad) * S, y: py + Math.sin(rad) * S };
  // stone: sits in the sling, then flies in an arc after release
  const flying = t >= 38 && t < 80;
  const ft = (t - 38) / 42;
  const stone = flying ? { x: 140 + ft * 150, y: 18 - Math.sin(Math.PI * ft) * 30 + ft * 20 } : { x: tip.x, y: tip.y + 8 };
  return (
    <svg viewBox="0 0 260 150" width={260} height={150}>
      <line x1={30} y1={128} x2={196} y2={128} stroke={ICON} strokeWidth={9} strokeLinecap="round" />
      <line x1={70} y1={128} x2={110} y2={46} stroke={ICON} strokeWidth={8} strokeLinecap="round" />
      <line x1={150} y1={128} x2={110} y2={46} stroke={ICON} strokeWidth={8} strokeLinecap="round" />
      <line x1={86} y1={96} x2={134} y2={96} stroke={ICON} strokeWidth={5} />
      {[52, 176].map((wx) => (
        <g key={wx}>
          <circle cx={wx} cy={136} r={11} fill="#2a3a4a" stroke={ICON} strokeWidth={4} />
          <circle cx={wx} cy={136} r={2.5} fill={ICON} />
        </g>
      ))}
      {/* throwing arm */}
      <line x1={back.x} y1={back.y} x2={tip.x} y2={tip.y} stroke="#c9a978" strokeWidth={7} strokeLinecap="round" />
      {/* counterweight hangs straight down from the short end */}
      <line x1={back.x} y1={back.y} x2={back.x} y2={back.y + 14} stroke={ICON} strokeWidth={3} />
      <rect x={back.x - 15} y={back.y + 12} width={30} height={26} rx={4} fill={GOLD} stroke="#7a4a00" strokeWidth={3} />
      <circle cx={px} cy={py} r={6} fill={GOLD} />
      {/* sling */}
      {!flying && <line x1={tip.x} y1={tip.y} x2={stone.x} y2={stone.y} stroke={ICON} strokeWidth={2} />}
      <circle cx={stone.x} cy={stone.y} r={8} fill="#a89a8a" stroke={ICON} strokeWidth={2} opacity={t >= 80 ? 0 : 1} />
      {flying &&
        [1, 2, 3].map((k) => {
          const tt = Math.max(0, ft - k * 0.05);
          return <circle key={k} cx={140 + tt * 150} cy={18 - Math.sin(Math.PI * tt) * 30 + tt * 20} r={8 - k * 2} fill={GOLD} opacity={0.35 - k * 0.08} />;
        })}
    </svg>
  );
};

// ======================================================================
// Cards
// ======================================================================

const CARDS = [
  { title: "Mobility", sub: "Horse archers covered huge distances fast", chip: "3–5 spare horses per rider", Icon: MobilityIcon },
  { title: "Composite Recurve Bow", sub: "Layers of horn, wood & sinew", chip: "Shot accurately at full gallop", Icon: BowIcon },
  { title: "Adapted Siege Tech", sub: "Built with Chinese & Persian engineers", chip: "Trebuchets & catapults", Icon: TrebuchetIcon },
];

export const Part3Cards: React.FC<{ frame: number; start: number; exit: number }> = ({ frame, start, exit }) => {
  const { fps } = useVideoConfig();
  if (frame < start) return null;
  const header = interpolate(frame, [start + 10, start + 35], [0, 1], clamp) * interpolate(frame, [exit, exit + 25], [1, 0], clamp);
  return (
    <>
      <div style={{ position: "absolute", top: 70, width: "100%", textAlign: "center", color: CREAM, opacity: header, textShadow: "0 4px 24px rgba(0,20,40,0.6)" }}>
        <div style={{ fontFamily: SANS, fontSize: 24, letterSpacing: "0.45em", opacity: 0.85 }}>AN UNSTOPPABLE FORCE</div>
        <div style={{ fontFamily: SERIF, fontSize: 60, marginTop: 8 }}>Three advantages</div>
      </div>
      {CARDS.map((c, i) => {
        const inS = spring({ frame: frame - (start + 20 + i * 50), fps, config: { damping: 16, stiffness: 110 } });
        const outT = interpolate(frame, [exit + i * 8, exit + 30 + i * 8], [0, 1], { ...clamp, easing: Easing.in(Easing.cubic) });
        if (inS <= 0.001) return null;
        const local = frame - (start + 20 + i * 50);
        const x = 960 + (i - 1) * 590;
        // card lights up while the voiceover talks about it, then stays bright
        const active = interpolate(local, [0, 20], [0, 1], clamp);
        return (
          <div
            key={c.title}
            style={{
              position: "absolute",
              left: x - 270,
              top: 330,
              width: 540,
              height: 520,
              borderRadius: 30,
              background: "linear-gradient(180deg, rgba(14,36,60,0.78), rgba(8,22,40,0.82))",
              backdropFilter: "blur(16px)",
              boxShadow: `0 30px 80px rgba(0,10,25,0.5), 0 0 0 2px rgba(255,201,77,${0.25 + 0.35 * active})`,
              transform: `translateY(${(1 - inS) * 700 + outT * 900}px) rotate(${(1 - inS) * (i - 1) * 4}deg)`,
              opacity: Math.min(1, inS * 1.5) * (1 - outT),
              color: CREAM,
              overflow: "hidden",
            }}
          >
            <div style={{ height: 6, background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)`, opacity: 0.8 }} />
            <div style={{ position: "absolute", top: 22, left: 26, fontFamily: SANS, fontWeight: 800, fontSize: 22, letterSpacing: "0.2em", color: GOLD }}>
              0{i + 1}
            </div>
            <div style={{ display: "flex", justifyContent: "center", marginTop: 48, transform: "scale(1.45)", transformOrigin: "50% 0%" }}>
              <c.Icon f={Math.max(0, local)} />
            </div>
            <div style={{ position: "absolute", left: 0, right: 0, top: 300, textAlign: "center", padding: "0 30px" }}>
              <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 44, lineHeight: 1.1 }}>{c.title}</div>
              <div style={{ fontFamily: SANS, fontSize: 25, marginTop: 14, opacity: 0.85, lineHeight: 1.3 }}>{c.sub}</div>
              <div
                style={{
                  display: "inline-block",
                  marginTop: 22,
                  padding: "8px 20px",
                  borderRadius: 999,
                  background: "rgba(255,201,77,0.16)",
                  border: "2px solid rgba(255,201,77,0.6)",
                  fontFamily: SANS,
                  fontWeight: 700,
                  fontSize: 21,
                  color: GOLD,
                  opacity: interpolate(local, [25, 40], [0, 1], clamp),
                }}
              >
                {c.chip}
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
};
