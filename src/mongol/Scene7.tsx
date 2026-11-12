import { useMemo } from "react";
import { ThreeCanvas } from "@remotion/three";
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Rider, Ridge, hills, seeded } from "./SteppeNight";
import empire from "./data/empire1279.json";

/**
 * Scene 7 - Outro (13 s): a dark end card.
 * A gold outline of the empire at its height draws itself, three stat counters slide in
 * (1206-1368 CE · 23M km² · Pax Mongolica), then the title "The Mongol Empire".
 * Riders cross the moonlit horizon; fade to black.
 */

export const SCENE7_FRAMES = 390;

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "'Avenir Next', 'Helvetica Neue', Helvetica, Arial, sans-serif";
const CREAM = "#fff6e6";
const GOLD = "#ffc94d";

const HORIZON = hills(12, -2.55, 0.35, 0.22);
const NEAR = hills(4, -2.95, 0.18, 0.4);

/** Stars twinkling in the night sky (HTML, behind everything). */
const Stars: React.FC<{ frame: number }> = ({ frame }) => {
  const stars = useMemo(() => {
    const r = seeded(7007);
    return Array.from({ length: 140 }, () => ({ x: r() * 1920, y: r() * 760, s: 1 + r() * 2.4, p: r() * 6, v: 0.03 + r() * 0.08 }));
  }, []);
  return (
    <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
      {stars.map((st, i) => (
        <circle key={i} cx={st.x} cy={st.y} r={st.s} fill="#fff6e0" opacity={0.3 + 0.7 * (0.5 + 0.5 * Math.sin(frame * st.v + st.p))} />
      ))}
    </svg>
  );
};

/** The empire at its height, drawn as glowing gold outlines. */
const EmpireOutline: React.FC<{ draw: number; glow: number }> = ({ draw, glow }) => {
  const paths = useMemo(
    () => (empire.rings as number[][][]).map((ring) => "M " + ring.map(([x, y]) => `${(x * 1500 + 210).toFixed(1)} ${(y * 640 + 150).toFixed(1)}`).join(" L ") + " Z"),
    [],
  );
  return (
    <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
      <defs>
        <filter id="goldGlow7" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="6" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <g filter="url(#goldGlow7)" opacity={0.55 * glow}>
        {paths.map((d, i) => (
          <path key={i} d={d} fill="rgba(255,201,77,0.05)" stroke={GOLD} strokeWidth={2.2} pathLength={1} strokeDasharray={`${draw} 1`} strokeLinejoin="round" />
        ))}
      </g>
    </svg>
  );
};

const Stat: React.FC<{ frame: number; start: number; label: string; children: React.ReactNode }> = ({ frame, start, label, children }) => {
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - start, fps, config: { damping: 16, stiffness: 110 } });
  return (
    <div style={{ width: 460, textAlign: "center", opacity: Math.min(1, s * 1.4), transform: `translateX(${(1 - s) * 120}px)` }}>
      <div style={{ fontFamily: SERIF, fontSize: 82, color: CREAM, lineHeight: 1.05, fontVariantNumeric: "tabular-nums", textShadow: "0 0 30px rgba(255,201,77,0.35)" }}>{children}</div>
      <div style={{ height: 3, width: 120 * s, margin: "16px auto 12px", background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)` }} />
      <div style={{ fontFamily: SANS, fontSize: 24, letterSpacing: "0.3em", color: GOLD }}>{label}</div>
    </div>
  );
};

export const Scene7: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();

  const draw = interpolate(frame, [10, 140], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const outlineGlow = interpolate(frame, [0, 30, 180, 240], [0, 1, 1, 0.45], clamp);
  const yearEnd = Math.round(interpolate(frame, [55, 105], [1206, 1368], { ...clamp, easing: Easing.out(Easing.cubic) }));
  const area = interpolate(frame, [85, 135], [0, 23], { ...clamp, easing: Easing.out(Easing.cubic) });
  const pax = "Pax Mongolica";
  const paxShown = Math.floor(interpolate(frame, [115, 150], [0, pax.length], clamp));
  const statsUp = interpolate(frame, [175, 215], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const title = "The Mongol Empire";
  const fadeIn = interpolate(frame, [0, 25], [0, 1], clamp);
  const fadeOut = interpolate(frame, [SCENE7_FRAMES - 35, SCENE7_FRAMES], [0, 1], { ...clamp, easing: Easing.in(Easing.quad) });

  return (
    <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 120%, #1c2a4a 0%, #0f1830 45%, #0b1220 100%)" }}>
      <AbsoluteFill style={{ opacity: fadeIn }}>
        <Stars frame={frame} />
        {/* moon glow low on the horizon */}
        <div style={{ position: "absolute", left: 1500, top: 800, width: 520, height: 520, marginLeft: -260, marginTop: -260, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,240,205,0.5) 0%, rgba(255,220,160,0.12) 35%, transparent 70%)" }} />
        <div style={{ position: "absolute", left: 1500, top: 800, width: 120, height: 120, marginLeft: -60, marginTop: -60, borderRadius: "50%", background: "#fff3d6", boxShadow: "0 0 60px rgba(255,236,190,0.8)" }} />
        <EmpireOutline draw={draw} glow={outlineGlow} />

        {/* riders crossing the moonlit horizon (silhouettes) */}
        <AbsoluteFill style={{ filter: "brightness(0.3) saturate(0.5)" }}>
          <ThreeCanvas width={width} height={height} flat camera={{ fov: 35, position: [0, 0, 10] }}>
            <Ridge h={HORIZON} z={-8} color="#2a3550" />
            {[0, 1, 2].map((i) => {
              const x = interpolate(frame, [0, SCENE7_FRAMES], [9 + i * 1.6, -6 + i * 1.6]);
              return (
                <group key={i} position={[x, HORIZON(x) - 0.05, -7.9 + i * 0.01]} scale={[-0.62, 0.62, 0.62]}>
                  <Rider frame={frame * 0.6} offset={i * 1.4} hat="#c8332b" banner={i === 0} />
                </group>
              );
            })}
            <Ridge h={NEAR} z={-3} color="#1a2238" />
          </ThreeCanvas>
        </AbsoluteFill>

        {/* stats */}
        <div style={{ position: "absolute", top: 230 - statsUp * 90, width: "100%", display: "flex", justifyContent: "center", gap: 30, transform: `scale(${1 - statsUp * 0.12})` }}>
          <Stat frame={frame} start={45} label="YEARS">1206–{yearEnd}</Stat>
          <Stat frame={frame} start={75} label="SQUARE KILOMETERS">{area.toFixed(area >= 23 ? 0 : 1)}M km²</Stat>
          <Stat frame={frame} start={105} label="THE MONGOL PEACE">
            <span style={{ fontSize: 66 }}>{pax.slice(0, paxShown)}</span>
            <span style={{ fontSize: 66, opacity: 0 }}>{pax.slice(paxShown)}</span>
          </Stat>
        </div>

        {/* final title */}
        <div style={{ position: "absolute", top: 470, width: "100%", textAlign: "center" }}>
          <div style={{ display: "inline-flex" }}>
            {title.split("").map((ch, i) => {
              const s = spring({ frame: frame - (185 + i * 3), fps, config: { damping: 14 } });
              return (
                <span key={i} style={{
                  fontFamily: SERIF, fontSize: 130, letterSpacing: "0.04em", whiteSpace: "pre",
                  background: "linear-gradient(180deg, #fff3cf 10%, #ffc94d 60%, #c98a1e 100%)", WebkitBackgroundClip: "text", color: "transparent",
                  opacity: Math.min(1, s * 1.3), transform: `translateY(${(1 - s) * 40}px)`, display: "inline-block",
                  filter: `drop-shadow(0 0 ${18 * s}px rgba(255,190,80,0.45))`,
                }}>
                  {ch}
                </span>
              );
            })}
          </div>
          <div style={{
            fontFamily: SANS, fontSize: 30, color: CREAM, marginTop: 18, letterSpacing: "0.04em",
            opacity: interpolate(frame, [250, 280], [0, 0.9], clamp), transform: `translateY(${interpolate(frame, [250, 280], [12, 0], clamp)}px)`,
          }}>
            From scattered tribes to the largest connected land empire in history
          </div>
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ background: "#000", opacity: fadeOut }} />
    </AbsoluteFill>
  );
};
