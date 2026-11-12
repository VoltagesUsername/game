import { useMemo } from "react";
import * as THREE from "three";
import { ThreeCanvas } from "@remotion/three";
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { EurasiaMap, SUN, useHeightSampler, useMapTextures } from "./map/EurasiaMap";
import { MAP, WAVES } from "./map/config.js";
import { CameraRig, Cloud, FOV, Key, Pose, poseAt, useProjector, worldAt } from "./map/mapScene";
import { seeded } from "./SteppeNight";
import { MAIN, Road, pathFrom } from "./Scene4";

/**
 * Scene 6 - Decline & fall (30 s)
 *   1259  Möngke dies with no clear heir: cracks run through the empire.
 *   1260  The empire breaks into four khanates (Yuan, Golden Horde, Ilkhanate, Chagatai).
 *         Their colours fade into the local lands (new religions and languages).
 *   1340s The Black Death spreads out from Central Asia; the trade routes go dark.
 *   1368  The Red Turban Rebellion: the Yuan shatters and the Mongols retreat to the steppe.
 * Opens from white (end of Scene 5) and fades to dark navy (Scene 7's end card).
 */

export const SCENE6_FRAMES = 900; // 30 s

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "'Avenir Next', 'Helvetica Neue', Helvetica, Arial, sans-serif";
const CREAM = "#fffaf0";
const GOLD = "#ffc94d";
const NAVY = "#0b1220";

// timeline (frames)
const NO_HEIR = 50;
const SPLIT = 160;
const ASSIM = 270;
const PLAGUE = 450;
const FALL = 640;

const KHANATES = [
  { name: "Yuan Dynasty", sub: "Kublai Khan · named Yuan in 1271", color: "#2e66d9", at: [108, 35.5] as [number, number], change: "Chinese ways & Buddhism", icon: "wheel" },
  { name: "Golden Horde", sub: "Russia & the western steppe", color: "#2a9a4c", at: [50, 52] as [number, number], change: "Islam · 1313", icon: "crescent" },
  { name: "Ilkhanate", sub: "Persia & the Middle East", color: "#8c48c0", at: [51, 33] as [number, number], change: "Islam · 1295", icon: "crescent" },
  { name: "Chagatai Khanate", sub: "Central Asia", color: "#f08a1e", at: [76, 41.5] as [number, number], change: "Islam & Turkic ways", icon: "crescent" },
];

const yearAt = (frame: number) =>
  Math.round(
    interpolate(frame, [0, SPLIT, SPLIT + 20, ASSIM, PLAGUE, PLAGUE + 40, FALL, FALL + 30, 820], [1259, 1259, 1260, 1260, 1330, 1340, 1350, 1351, 1368], clamp),
  );

const MapClouds: React.FC<{ frame: number; pose: Pose }> = ({ frame, pose }) => {
  const clouds = useMemo(() => {
    const r = seeded(606);
    return Array.from({ length: 22 }, (_, i) => {
      const a = (i / 22) * Math.PI * 2 + r() * 0.2;
      return { base: new THREE.Vector3(Math.cos(a) * 130 * (0.5 + r() * 0.25), Math.sin(a) * 73 * (0.55 + r() * 0.35), -16 + r() * 6), size: 34 + r() * 26, seed: r() * 50 };
    });
  }, []);
  return (
    <>
      {clouds.map((c, i) => (
        <Cloud key={i} position={c.base.clone().add(new THREE.Vector3(frame * 0.012, frame * 0.004, 0))} size={c.size} seed={c.seed} opacity={0.75 * interpolate(pose.dist, [70, 140], [0, 1], clamp)} />
      ))}
    </>
  );
};

export const Scene6: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const textures = useMapTextures();
  const h = useHeightSampler(textures);

  const keys: Key[] = useMemo(
    () => [
      { f: 0, lon: 76, lat: 44, z: 0, dist: 168, tilt: 38, turn: 6 },
      { f: SPLIT, lon: 78, lat: 44, z: 0, dist: 150, tilt: 42, turn: 3, ease: Easing.inOut(Easing.sin) },
      { f: PLAGUE, lon: 74, lat: 44, z: 0, dist: 148, tilt: 40, turn: 0, ease: Easing.inOut(Easing.sin) },
      { f: FALL, lon: 70, lat: 44, z: 0, dist: 158, tilt: 38, turn: -2, ease: Easing.inOut(Easing.sin) },
      { f: FALL + 110, lon: 108, lat: 37, z: 0, dist: 72, tilt: 46, turn: 4, ease: Easing.inOut(Easing.cubic) },
      { f: SCENE6_FRAMES, lon: 108, lat: 38.5, z: 0, dist: 66, tilt: 48, turn: 6, ease: Easing.inOut(Easing.sin) },
    ],
    [],
  );
  // a short shudder when the empire breaks apart
  const pose = useMemo(() => {
    const p = poseAt(frame, keys);
    const t = frame - SPLIT;
    if (t >= 0 && t < 18) {
      const k = (18 - t) / 18;
      p.position.x += Math.sin(t * 2.7) * 0.9 * k;
      p.position.y += Math.cos(t * 3.1) * 0.6 * k;
    }
    return p;
  }, [frame, keys]);
  const project2D = useProjector(pose);

  const silk = useMemo(() => (h ? pathFrom(h, MAIN.map((m) => m.at), 0.35, 900) : null), [h]);

  // decline parameters
  const crackFlicker = 0.9 + 0.1 * Math.sin(frame * 1.7);
  const crack =
    interpolate(frame, [NO_HEIR + 10, SPLIT - 10, SPLIT + 10, SPLIT + 60, ASSIM + 60, PLAGUE], [0, 0.55, 0.62, 1, 1, 0.7], clamp) *
    (frame < SPLIT ? crackFlicker : 1);
  const split = interpolate(frame, [SPLIT + 10, SPLIT + 60], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const assimOne = (start: number) => interpolate(frame, [start, start + 90], [0, 1], { ...clamp, easing: Easing.inOut(Easing.sin) });
  // the Yuan's colour comes back up for its fall in 1368
  const yuanAssim = assimOne(ASSIM + 60) * interpolate(frame, [FALL + 10, FALL + 80], [1, 0.1], clamp);
  const assim: [number, number, number, number] = [yuanAssim, assimOne(ASSIM + 20), assimOne(ASSIM), assimOne(ASSIM + 40)];
  const plagueR = interpolate(frame, [PLAGUE + 50, FALL], [0, 0.85], { ...clamp, easing: Easing.out(Easing.quad) });
  const plagueS = interpolate(frame, [PLAGUE + 40, PLAGUE + 60, FALL + 10, FALL + 70], [0, 1, 1, 0], clamp);
  const plague: [number, number, number, number] = [(77 - MAP.lon0) / (MAP.lon1 - MAP.lon0), (42.4 - MAP.lat0) / (MAP.lat1 - MAP.lat0), plagueR, plagueS];
  const shatter = interpolate(frame, [FALL + 90, FALL + 120, FALL + 170, FALL + 210], [0, 1, 1, 0], clamp);
  const yuanFade = interpolate(frame, [FALL + 130, FALL + 220], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const roadIn = interpolate(frame, [PLAGUE, PLAGUE + 45], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const roadDark = interpolate(frame, [PLAGUE + 70, FALL - 20], [0, 1], clamp);
  const roadOut = interpolate(frame, [FALL + 20, FALL + 60], [1, 0], clamp);

  const fromWhite = interpolate(frame, [0, 35], [1, 0], { ...clamp, easing: Easing.out(Easing.quad) });
  const toNavy = interpolate(frame, [SCENE6_FRAMES - 40, SCENE6_FRAMES], [0, 1], { ...clamp, easing: Easing.in(Easing.quad) });
  const year = yearAt(frame);

  const titles = [
    { from: 20, to: SPLIT - 10, top: "DECLINE & FALL", main: "No clear heir" },
    { from: SPLIT, to: ASSIM, top: "1260", main: "One empire becomes four" },
    { from: ASSIM, to: PLAGUE, top: "OVER TIME", main: "Losing a shared identity" },
    { from: PLAGUE, to: FALL, top: "THE 1340s", main: "The Black Death" },
    { from: FALL, to: SCENE6_FRAMES, top: "1368", main: "The Red Turban Rebellion" },
  ];

  return (
    <AbsoluteFill style={{ background: "radial-gradient(circle at 12% 8%, #fffbe8 0%, #d9f0ef 14%, #7fc0d6 34%, #3a7fa8 62%, #1d4a6e 100%)" }}>
      {textures && h && (
        <ThreeCanvas width={width} height={height} flat camera={{ fov: FOV, near: 0.1, far: 3000 }}>
          <CameraRig pose={pose} />
          <hemisphereLight args={["#e4f1ff", "#6f7f4a", 1.2]} />
          <directionalLight position={SUN.clone().multiplyScalar(60).toArray()} intensity={2.2} />
          <EurasiaMap
            textures={textures}
            progress={WAVES.length}
            glow={0}
            empireOpacity={0.7}
            borderGlow={0}
            decline={{ split, crack, assim, plague, yuanFade, shatter }}
          />
          {silk && roadIn > 0 && <Road curve={silk} radius={0.3} progress={roadIn} frame={frame} opacity={roadOut} dark={roadDark} />}
          <MapClouds frame={frame} pose={pose} />
        </ThreeCanvas>
      )}

      <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 45%, transparent 58%, rgba(8,18,32,0.5) 100%)" }} />
      {/* the mood darkens as the empire falls */}
      <AbsoluteFill style={{ background: "rgba(10,14,24,1)", opacity: interpolate(frame, [PLAGUE, FALL, FALL + 60, SCENE6_FRAMES], [0, 0.18, 0.08, 0.15], clamp) }} />

      {/* "no clear heir" at Karakorum */}
      {h && (() => {
        const s = spring({ frame: frame - NO_HEIR, fps, config: { damping: 12 } }) * interpolate(frame, [SPLIT - 5, SPLIT + 10], [1, 0], clamp);
        if (s <= 0.01) return null;
        const p = project2D(worldAt(h, 102.8, 47.2, 0.4));
        return (
          <div style={{ position: "absolute", left: p.x, top: p.y, transform: `translate(-50%, -100%) scale(${s})`, transformOrigin: "50% 100%", display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ padding: "12px 24px", borderRadius: 20, background: "rgba(255,248,235,0.96)", boxShadow: "0 10px 30px rgba(0,0,0,0.35), 0 0 0 3px rgba(200,60,40,0.6)", textAlign: "center" }}>
              <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 32, color: "#3a1a10" }}>1259 · Möngke Khan dies</div>
              <div style={{ fontFamily: SANS, fontSize: 22, color: "#8a2a1a", fontWeight: 700 }}>No rule for who comes next → civil war</div>
            </div>
            <div style={{ width: 3, height: 40, background: "rgba(255,248,235,0.95)" }} />
            <div style={{ width: 16, height: 16, borderRadius: "50%", background: "#e2382c", boxShadow: "0 0 16px 6px rgba(226,56,44,0.6)" }} />
          </div>
        );
      })()}

      {/* the four khanates */}
      {h &&
        KHANATES.map((k, i) => {
          const s = spring({ frame: frame - (SPLIT + 40 + i * 14), fps, config: { damping: 12 } }) * interpolate(frame, [PLAGUE - 10, PLAGUE + 15], [1, 0], clamp);
          if (s <= 0.01) return null;
          const p = project2D(worldAt(h, k.at[0], k.at[1], 0.4));
          const changeT = interpolate(frame, [ASSIM + i * 20, ASSIM + 30 + i * 20], [0, 1], clamp);
          return (
            <div key={k.name} style={{ position: "absolute", left: p.x, top: p.y, transform: `translate(-50%, -50%) scale(${s})`, opacity: Math.min(1, s * 1.5), textAlign: "center" }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "8px 18px", borderRadius: 999, background: "rgba(255,248,235,0.95)", boxShadow: `0 8px 26px rgba(0,0,0,0.35), 0 0 0 4px ${k.color}` }}>
                <span style={{ width: 16, height: 16, borderRadius: "50%", background: k.color }} />
                <span style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 30, color: "#2a1a10", whiteSpace: "nowrap" }}>{k.name}</span>
              </div>
              <div style={{ fontFamily: SANS, fontSize: 19, color: CREAM, marginTop: 6, textShadow: "0 2px 10px rgba(0,0,0,0.8)", whiteSpace: "nowrap", fontWeight: 700 }}>{k.sub}</div>
              {changeT > 0 && (
                <div style={{
                  display: "inline-flex", alignItems: "center", gap: 8, marginTop: 8, padding: "5px 14px", borderRadius: 999,
                  background: "rgba(14,36,60,0.85)", border: `2px solid ${k.color}`, color: CREAM, fontFamily: SANS, fontSize: 19, fontWeight: 700,
                  opacity: changeT, transform: `translateY(${(1 - changeT) * 10}px)`, whiteSpace: "nowrap",
                }}>
                  <svg width={22} height={22} viewBox="-12 -12 24 24">
                    {k.icon === "crescent" ? (
                      <g fill={GOLD}><path d="M 3 -10 A 10 10 0 1 0 3 10 A 7.5 7.5 0 1 1 3 -10 Z" /><circle cx={6} cy={0} r={2.2} /></g>
                    ) : (
                      <g stroke={GOLD} strokeWidth={2} fill="none"><circle r={9} /><circle r={2.5} fill={GOLD} />{Array.from({ length: 8 }, (_, a) => <line key={a} x1={0} y1={0} x2={Math.cos((a / 8) * Math.PI * 2) * 11} y2={Math.sin((a / 8) * Math.PI * 2) * 11} />)}</g>
                    )}
                  </svg>
                  {k.change}
                </div>
              )}
            </div>
          );
        })}

      {/* plague label */}
      {h && (() => {
        const s = spring({ frame: frame - (PLAGUE + 60), fps, config: { damping: 12 } }) * interpolate(frame, [FALL - 10, FALL + 15], [1, 0], clamp);
        if (s <= 0.01) return null;
        const p = project2D(worldAt(h, 77, 42.4, 0.4));
        return (
          <div style={{ position: "absolute", left: p.x, top: p.y - 30, transform: `translate(-50%, -100%) scale(${s})`, padding: "12px 24px", borderRadius: 20, background: "rgba(30,8,8,0.9)", boxShadow: "0 0 0 3px rgba(200,40,30,0.8), 0 0 40px rgba(200,30,20,0.6)", textAlign: "center", color: CREAM }}>
            <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 34 }}>The Black Death</div>
            <div style={{ fontFamily: SANS, fontSize: 21, opacity: 0.9 }}>Plague spreads along the trade routes</div>
          </div>
        );
      })()}

      {/* 1368 */}
      {h && (() => {
        const s = spring({ frame: frame - (FALL + 120), fps, config: { damping: 12 } });
        if (s <= 0.01) return null;
        const p = project2D(worldAt(h, 116.4, 39.9, 0.4));
        const m = project2D(worldAt(h, 104, 46.5, 0.4));
        const ming = interpolate(frame, [FALL + 170, FALL + 200], [0, 1], clamp);
        return (
          <>
            <div style={{ position: "absolute", left: p.x, top: p.y, transform: `translate(-20%, 20%) scale(${s})`, padding: "12px 24px", borderRadius: 20, background: "rgba(255,248,235,0.96)", boxShadow: "0 10px 30px rgba(0,0,0,0.35), 0 0 0 3px rgba(200,60,40,0.7)" }}>
              <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 32, color: "#3a1a10" }}>Red Turban Rebellion</div>
              <div style={{ fontFamily: SANS, fontSize: 21, color: "#8a2a1a", fontWeight: 700 }}>1368 · Mongols driven out of China</div>
              <div style={{ fontFamily: SANS, fontSize: 20, color: "#3a2a1a", opacity: ming, marginTop: 4 }}>The Ming Dynasty begins</div>
            </div>
            <div style={{
              position: "absolute", left: m.x, top: m.y, transform: "translate(-50%, -50%)", opacity: interpolate(frame, [FALL + 210, FALL + 240], [0, 1], clamp),
              fontFamily: SANS, fontWeight: 700, fontSize: 22, color: CREAM, textShadow: "0 2px 10px rgba(0,0,0,0.9)", whiteSpace: "nowrap",
            }}>
              ↑ back to the steppe
            </div>
          </>
        );
      })()}

      {/* title + year */}
      <AbsoluteFill style={{ background: "radial-gradient(ellipse 36% 28% at 14% 12%, rgba(10,25,45,0.6), transparent 70%)", opacity: 1 - toNavy }} />
      <div style={{ position: "absolute", left: 80, top: 56, color: CREAM, textShadow: "0 4px 24px rgba(0,20,40,0.6)" }}>
        {titles.map((t) => {
          const o = interpolate(frame, [t.from, t.from + 20, t.to - 15, t.to], [0, 1, 1, 0], clamp);
          if (o <= 0) return null;
          return (
            <div key={t.main} style={{ position: "absolute", top: 0, left: 0, opacity: o, whiteSpace: "nowrap", transform: `translateY(${(1 - o) * 10}px)` }}>
              <div style={{ fontFamily: SANS, fontSize: 24, letterSpacing: "0.4em", opacity: 0.85 }}>{t.top}</div>
              <div style={{ fontFamily: SERIF, fontSize: 60, marginTop: 4 }}>{t.main}</div>
            </div>
          );
        })}
      </div>
      <div style={{ position: "absolute", right: 80, top: 50, color: CREAM, textAlign: "right", textShadow: "0 4px 24px rgba(0,20,40,0.6)", opacity: interpolate(frame, [20, 45], [0, 1], clamp) * (1 - toNavy) }}>
        <span style={{ fontFamily: SERIF, fontSize: 110, fontVariantNumeric: "tabular-nums" }}>{frame >= PLAGUE + 20 && frame < FALL ? "1340s" : year}</span>
        <span style={{ fontFamily: SERIF, fontSize: 36, opacity: 0.85, marginLeft: 10 }}>CE</span>
      </div>

      <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 50%, rgba(255,255,255,0.85), #f4f1ea)", opacity: fromWhite }} />
      <AbsoluteFill style={{ background: NAVY, opacity: toNavy }} />
    </AbsoluteFill>
  );
};
