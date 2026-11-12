import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { cancelRender, continueRender, delayRender, staticFile } from "remotion";
import { MAP, MAP_H, MAP_W, WAVES } from "./config.js";

/**
 * 3D "diorama" map of Eurasia: real elevation (exaggerated), painted satellite
 * colours, a layered earth block underneath, and the Mongol Empire spreading
 * over the land like glowing paint.
 */

// How tall mountains are drawn (world units at the highest peak). Real scale would be ~0.08.
export const EXAGGERATION = 3.2;
export const LAND_LIFT = 0.06; // land sits slightly above the sea, like a model
const BASE_DEPTH = 6.5; // thickness of the block

export type MapTextures = { terrain: THREE.Texture; color: THREE.Texture; empire: THREE.Texture; khanates: THREE.Texture };

/** Load the map images. Call this OUTSIDE <ThreeCanvas> and only render the canvas once loaded. */
export const useMapTextures = (): MapTextures | null => {
  const [textures, setTextures] = useState<MapTextures | null>(null);
  const [handle] = useState(() => delayRender("Loading map textures"));
  useEffect(() => {
    const loader = new THREE.TextureLoader();
    const load = (file: string) => loader.loadAsync(staticFile(file));
    Promise.all([load("map/terrain.png"), load("map/color.png"), load("map/empire.png"), load("map/khanates.png")])
      .then(([terrain, color, empire, khanates]) => {
        for (const t of [terrain, empire]) {
          t.colorSpace = THREE.NoColorSpace;
          t.generateMipmaps = false;
          t.minFilter = THREE.LinearFilter;
          t.magFilter = THREE.LinearFilter;
        }
        color.colorSpace = THREE.SRGBColorSpace;
        color.anisotropy = 8;
        // which khanate each cell belongs to (ids must not blend)
        khanates.colorSpace = THREE.NoColorSpace;
        khanates.generateMipmaps = false;
        khanates.minFilter = THREE.NearestFilter;
        khanates.magFilter = THREE.NearestFilter;
        setTextures({ terrain, color, empire, khanates });
        continueRender(handle);
      })
      .catch((e) => cancelRender(e));
  }, [handle]);
  return textures;
};

/**
 * Ground height (world z) at a longitude/latitude, matching the shader.
 * Use it to place pins, models and labels exactly on the terrain.
 */
export const useHeightSampler = (textures: MapTextures | null) =>
  useMemo(() => {
    if (!textures) return null;
    const img = textures.terrain.image as HTMLImageElement;
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, img.width, img.height).data;
    const px = (x: number, y: number, c: number) => {
      const xx = Math.max(0, Math.min(img.width - 1, x));
      const yy = Math.max(0, Math.min(img.height - 1, y));
      return data[(yy * img.width + xx) * 4 + c] / 255;
    };
    const bilinear = (fx: number, fy: number, c: number) => {
      const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
      return (
        px(x0, y0, c) * (1 - tx) * (1 - ty) + px(x0 + 1, y0, c) * tx * (1 - ty) +
        px(x0, y0 + 1, c) * (1 - tx) * ty + px(x0 + 1, y0 + 1, c) * tx * ty
      );
    };
    return (lon: number, lat: number) => {
      const u = (lon - MAP.lon0) / (MAP.lon1 - MAP.lon0);
      const v = (lat - MAP.lat0) / (MAP.lat1 - MAP.lat0);
      const fx = u * img.width - 0.5;
      const fy = (1 - v) * img.height - 0.5;
      const g = bilinear(fx, fy, 1);
      const land = Math.min(1, Math.max(0, (g - 0.3) / 0.4));
      const smooth = land * land * (3 - 2 * land);
      const a = Math.min(1, Math.max(0, (bilinear(fx, fy, 3) - 0.82) / 0.1));
      const lake = 1 - a * a * (3 - 2 * a);
      const r = bilinear(fx, fy, 0);
      return (smooth * (LAND_LIFT + r * EXAGGERATION)) * (1 - lake) + r * EXAGGERATION * lake;
    };
  }, [textures]);

const COMMON = /* glsl */ `
uniform sampler2D uTerrain;
uniform float uExag;
uniform float uLift;
float landAt(vec2 uv) { return smoothstep(0.3, 0.7, texture2D(uTerrain, uv).g); }
float heightAt(vec2 uv) {
  vec4 t = texture2D(uTerrain, uv);
  float land = smoothstep(0.3, 0.7, t.g);
  float lake = 1.0 - smoothstep(0.82, 0.92, t.a); // inland lakes keep their own surface height
  return mix(land * (uLift + t.r * uExag), t.r * uExag, lake);
}
`;

const TERRAIN_VERT = /* glsl */ `
${COMMON}
uniform vec4 uFlat;     // x, y, radius, height: flatten the ground here (e.g. under a city)
uniform float uFlatAmt;
varying vec2 vUv;
varying float vFlat;
void main() {
  vUv = uv;
  vec3 p = position;
  float w = uFlatAmt * (1.0 - smoothstep(uFlat.z * 0.55, uFlat.z, distance(position.xy, uFlat.xy)));
  vFlat = w;
  p.z = mix(heightAt(uv), uFlat.w, w);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;

const TERRAIN_FRAG = /* glsl */ `
${COMMON}
uniform sampler2D uColor;
uniform sampler2D uEmpire;
uniform vec2 uTexel;      // 1 / texture size
uniform vec2 uWorldTexel; // world size of one texel
uniform vec3 uSun;
uniform float uProgress;  // 0..WAVES, how far the empire has spread
uniform float uWaves;
uniform float uGlow;      // 0..1, glow on the advancing front
uniform float uEmpireOpacity;
uniform float uShine;     // 0..1, whole empire glows amber
uniform float uDetail;    // 0..1, fine terrain detail for close-ups
uniform float uBorderGlow;// 0..1, empire border glows gold
// decline of the empire (Scene 6)
uniform sampler2D uKhanate;
uniform float uSplit;     // 0..1 recolour into the four khanates
uniform float uCrack;     // 0..1 glowing cracks between khanates, opening into gaps
uniform vec4 uAssim;      // per khanate 0..1: colour fades into the local land (Yuan, Horde, Ilkhanate, Chagatai)
uniform vec4 uPlague;     // uv centre x, y, radius, strength
uniform float uYuanFade;  // 0..1 the Yuan colour retreats north to Mongolia
uniform float uShatter;   // 0..1 cracks shatter the Yuan region
varying vec2 vUv;
varying float vFlat;

float kidAt(vec2 uv) { return floor(texture2D(uKhanate, uv).r * 255.0 / 60.0 + 0.5); }
vec3 khanColor(float k) {
  return k < 1.5 ? vec3(0.18, 0.4, 0.85) : k < 2.5 ? vec3(0.16, 0.6, 0.3) : k < 3.5 ? vec3(0.55, 0.28, 0.75) : vec3(0.95, 0.55, 0.12);
}
float assimOf(float k) { return k < 1.5 ? uAssim.x : k < 2.5 ? uAssim.y : k < 3.5 ? uAssim.z : uAssim.w; }

// --- small value-noise helpers for close-up detail ---
float hash2(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), u.x), mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return s;
}

float insideAt(vec2 uv) {
  float e = texture2D(uEmpire, uv).r * 255.0;
  if (e >= 252.0) return 0.0;
  return step(e / 250.0 * uWaves, uProgress) * landAt(uv);
}

vec3 saturateColor(vec3 c, float s) {
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  return mix(vec3(l), c, s);
}

void main() {
  vec4 t = texture2D(uTerrain, vUv);
  float land = landAt(vUv);

  // Surface normal from the height map (a bit stronger than the geometry, for crisp relief)
  float hL = texture2D(uTerrain, vUv - vec2(uTexel.x, 0.0)).r;
  float hR = texture2D(uTerrain, vUv + vec2(uTexel.x, 0.0)).r;
  float hD = texture2D(uTerrain, vUv - vec2(0.0, uTexel.y)).r;
  float hU = texture2D(uTerrain, vUv + vec2(0.0, uTexel.y)).r;
  float relief = uExag * 2.0;
  vec3 n = normalize(vec3(-(hR - hL) * relief / (2.0 * uWorldTexel.x), -(hU - hD) * relief / (2.0 * uWorldTexel.y), 1.0));
  // close-up detail: rocky ridges in the mountains, gentle ripples on the plains
  vec2 dp = vUv * vec2(${MAP.width}.0, ${MAP.height}.0) * 0.9;
  float rough = (0.25 + 1.6 * smoothstep(0.08, 0.5, t.r)) * uDetail * landAt(vUv);
  if (rough > 0.001) {
    float e0 = fbm(dp), ex = fbm(dp + vec2(0.35, 0.0)), ey = fbm(dp + vec2(0.0, 0.35));
    n = normalize(n + vec3(-(ex - e0), -(ey - e0), 0.0) * 2.4 * rough);
  }
  n = normalize(mix(n, vec3(0.0, 0.0, 1.0), vFlat));
  float diffuse = max(dot(n, normalize(uSun)), 0.0);
  float shade = 0.5 + 0.62 * diffuse;

  // Painted land: softened satellite colours, a little richer, with snow on high peaks
  vec3 sat = texture2D(uColor, vUv).rgb;
  vec3 landCol = saturateColor(sat, 1.35) * 1.18 + vec3(0.012, 0.01, 0.0);
  // high plateaus: dry tan/brown; only the highest, steepest peaks get snow
  landCol = mix(landCol, vec3(0.52, 0.42, 0.31), smoothstep(0.4, 0.58, t.r) * 0.8);
  landCol = mix(landCol, vec3(0.93, 0.95, 0.98), smoothstep(0.7, 0.88, t.r) * smoothstep(0.02, 0.06, abs(hR - hL) + abs(hU - hD)));
  // close-up colour variation: patches of greener/drier grass and darker rock
  float patchN = fbm(vUv * vec2(${MAP.width}.0, ${MAP.height}.0) * 0.25 + 3.7);
  landCol *= mix(1.0, 0.86 + 0.28 * patchN, uDetail);
  // close-ups: summer steppe greens on the lower ground, a green valley floor where flattened
  landCol = mix(landCol, vec3(0.38, 0.52, 0.24) * (0.85 + 0.3 * patchN), uDetail * 0.38 * (1.0 - smoothstep(0.22, 0.5, t.r)));
  landCol = mix(landCol, vec3(0.42, 0.56, 0.26) * (0.9 + 0.2 * patchN), vFlat * 0.6);
  // forest-steppe: dark larch forest on north-facing slopes, as in real Mongolia
  float forest = smoothstep(0.05, 0.2, n.y) * smoothstep(0.1, 0.18, t.r) * (1.0 - smoothstep(0.5, 0.65, t.r)) * uDetail * (1.0 - vFlat);
  float speck = vnoise(vUv * vec2(${MAP.width}.0, ${MAP.height}.0) * 4.5);
  landCol = mix(landCol, vec3(0.16, 0.26, 0.14) * (0.7 + 0.6 * speck), forest * 0.75);
  landCol = mix(landCol, landCol * vec3(0.92, 1.06, 0.9), uDetail * smoothstep(0.55, 0.75, patchN) * (1.0 - smoothstep(0.15, 0.4, t.r)));
  landCol *= shade;

  // Sea: light near the coast, deeper further out, with a soft bright edge at the shore
  float coast = t.b * 6.0; // degrees from the nearest coast
  vec3 shallow = vec3(0.27, 0.60, 0.74);
  vec3 mid = vec3(0.12, 0.38, 0.58);
  vec3 deep = vec3(0.07, 0.24, 0.42);
  vec3 seaCol = mix(shallow, mid, smoothstep(0.0, 1.2, coast));
  seaCol = mix(seaCol, deep, smoothstep(1.2, 5.0, coast));
  seaCol = mix(seaCol, vec3(0.62, 0.85, 0.90), (1.0 - smoothstep(0.0, 0.18, coast)) * 0.5);

  vec3 col = mix(seaCol, landCol, land);

  // Mongol Empire: tint the land red where it has arrived, glowing amber at the front
  float e = texture2D(uEmpire, vUv).r * 255.0;
  if (e < 252.0) {
    float p = e / 250.0 * uWaves;
    float ahead = uProgress - p;
    float w = max(fwidth(p) * 1.2, 0.003);
    float inside = smoothstep(-w, w, ahead) * land;
    vec3 baseC = vec3(0.72, 0.09, 0.06);
    float tint = uEmpireOpacity;
    float kid = kidAt(vUv);
    if (uSplit > 0.0 && kid > 0.5) {
      baseC = mix(baseC, khanColor(kid), uSplit);
      tint *= 1.0 - assimOf(kid) * 0.8;
      if (kid < 1.5) {
        float lat = ${MAP.lat0}.0 + vUv.y * ${MAP.lat1 - MAP.lat0}.0;
        float line = mix(10.0, 43.5, uYuanFade);
        tint *= smoothstep(line - 0.8, line + 0.8, lat);
      }
    }
    vec3 empire = baseC * (0.6 + 0.62 * diffuse);
    col = mix(col, empire, inside * tint);
    float front = exp(-max(ahead, 0.0) / 0.05) * inside;
    col += vec3(1.0, 0.68, 0.25) * front * uGlow * 0.9;
    col = mix(col, vec3(1.0, 0.62, 0.2) * (0.55 + 0.6 * diffuse), inside * uShine * 0.55);

    // border line where the empire meets land it hasn't reached yet
    vec2 o = uTexel * 2.2;
    // water next to the empire doesn't count as a border (only land it hasn't reached)
    #define NB(off) max(insideAt(vUv + off), 1.0 - landAt(vUv + off))
    float nIn = min(min(NB(vec2(o.x, 0.0)), NB(-vec2(o.x, 0.0))), min(NB(vec2(0.0, o.y)), NB(-vec2(0.0, o.y))));
    float border = inside * (1.0 - nIn) * landAt(vUv);
    col = mix(col, mix(vec3(0.42, 0.04, 0.03), vec3(1.0, 0.78, 0.3), uBorderGlow), border * 0.9);

    // cracks between khanates: glowing, then opening into dark gaps
    if (uCrack > 0.0 && kid > 0.5) {
      vec2 off = uTexel * (1.5 + uCrack * 2.5);
      vec2 jit = (vec2(vnoise(vUv * 900.0), vnoise(vUv * 900.0 + 7.0)) - 0.5) * uTexel * 6.0;
      float k1 = kidAt(vUv + jit + vec2(off.x, 0.0)), k2 = kidAt(vUv + jit - vec2(off.x, 0.0));
      float k3 = kidAt(vUv + jit + vec2(0.0, off.y)), k4 = kidAt(vUv + jit - vec2(0.0, off.y));
      float edge = (abs(k1 - kid) + abs(k2 - kid) + abs(k3 - kid) + abs(k4 - kid)) > 0.5 ? 1.0 : 0.0;
      edge *= step(0.5, min(min(k1, k2), min(k3, k4))) * inside;
      float gap = smoothstep(0.6, 1.0, uCrack);
      col = mix(col, vec3(1.0, 0.5, 0.15) * 1.25, edge * (1.0 - gap) * smoothstep(0.0, 0.2, uCrack));
      col = mix(col, vec3(0.07, 0.02, 0.02), edge * gap);
    }
    // the Yuan shatters (1368)
    if (uShatter > 0.0 && kid > 0.5 && kid < 1.5) {
      float n = fbm(vUv * vec2(${MAP.width}.0, ${MAP.height}.0) * 0.04);
      float lines = 1.0 - smoothstep(0.0, 0.055, abs(fract(n * 7.0) - 0.5));
      col = mix(col, vec3(1.0, 0.62, 0.25) * 1.3, lines * uShatter * inside);
    }
  }

  // the Black Death spreading out from Central Asia
  if (uPlague.w > 0.0) {
    vec2 pp = vec2(vUv.x * ${(MAP_W / MAP_H).toFixed(4)}, vUv.y);
    vec2 pc = vec2(uPlague.x * ${(MAP_W / MAP_H).toFixed(4)}, uPlague.y);
    float d = distance(pp, pc) + (fbm(vUv * 60.0) - 0.5) * 0.08;
    float m = smoothstep(uPlague.z, uPlague.z - 0.07, d) * uPlague.w * mix(0.35, 1.0, landAt(vUv));
    vec3 grey = vec3(dot(col, vec3(0.3, 0.5, 0.2)));
    col = mix(col, grey * vec3(0.6, 0.36, 0.36), m * 0.85);
    float front = exp(-pow((d - uPlague.z) / 0.01, 2.0)) * uPlague.w * step(0.01, uPlague.z) * landAt(vUv);
    col += vec3(0.45, 0.04, 0.03) * front * 0.7;
  }

  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

const SIDE_VERT = /* glsl */ `
${COMMON}
attribute float aTop; // 1 = top edge (follows the terrain), 0 = bottom of the block
uniform float uBase;
varying float vZ;
varying float vLand;
void main() {
  vec3 p = position;
  float h = heightAt(uv);
  p.z = aTop > 0.5 ? h : -uBase;
  vZ = p.z;
  vLand = landAt(uv);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;

const SIDE_FRAG = /* glsl */ `
uniform float uBase;
uniform float uSideShade;
varying float vZ;
varying float vLand;
void main() {
  // Layers of earth, like a cut-away model. Sea edges get a band of water on top.
  float d = -vZ; // depth below sea level
  vec3 grass = vec3(0.42, 0.55, 0.26);
  vec3 soil = vec3(0.69, 0.53, 0.35);
  vec3 clay = vec3(0.55, 0.40, 0.26);
  vec3 rock = vec3(0.36, 0.27, 0.19);
  vec3 col = mix(soil, clay, smoothstep(0.6, 1.4, d));
  col = mix(col, rock, smoothstep(2.0, 3.2, d));
  col *= 0.94 + 0.06 * sin(d * 18.0);                 // faint strata lines
  col = mix(col, grass, (1.0 - smoothstep(-0.05, 0.12, d)) * vLand);
  vec3 water = vec3(0.34, 0.62, 0.78);
  col = mix(col, water, (1.0 - smoothstep(0.35, 0.45, d)) * (1.0 - vLand));
  col *= uSideShade;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

const makeSide = (axis: "x" | "y", fixed: number, segments: number) => {
  // A vertical strip along one edge of the map; uv matches the terrain uv at that edge.
  const pos: number[] = [], uv: number[] = [], top: number[] = [], idx: number[] = [];
  for (let s = 0; s <= segments; s++) {
    const f = s / segments;
    const along = axis === "x" ? (f - 0.5) * MAP_W : (f - 0.5) * MAP_H;
    const x = axis === "x" ? along : fixed;
    const y = axis === "x" ? fixed : along;
    const u = axis === "x" ? f : fixed > 0 ? 0.9995 : 0.0005;
    const v = axis === "x" ? (fixed > 0 ? 0.9995 : 0.0005) : f;
    for (const t of [1, 0]) {
      pos.push(x, y, 0);
      uv.push(u, v);
      top.push(t);
    }
    if (s < segments) {
      const a = s * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute("aTop", new THREE.Float32BufferAttribute(top, 1));
  g.setIndex(idx);
  return g;
};

export const SUN = new THREE.Vector3(-0.55, 0.45, 0.7);

export const EurasiaMap: React.FC<{
  textures: MapTextures;
  /** 0..WAVES.length: how far the empire has spread */
  progress: number;
  /** 0..1 glow on the advancing edge */
  glow: number;
  empireOpacity?: number;
  /** 0..1 make the whole empire glow amber */
  shine?: number;
  /** 0..1 fine terrain detail (use when the camera is close) */
  detail?: number;
  /** 0..1 make the empire's border glow gold */
  borderGlow?: number;
  /** flatten the ground in a circle (world x, y, radius, height, amount 0..1) */
  flat?: { x: number; y: number; radius: number; height: number; amount: number };
  /** Scene 6: break-up of the empire */
  decline?: {
    split: number;
    crack: number;
    assim: [number, number, number, number];
    plague: [number, number, number, number];
    yuanFade: number;
    shatter: number;
  };
}> = ({ textures, progress, glow, empireOpacity = 0.66, shine = 0, detail = 0, borderGlow = 0, flat, decline }) => {
  const terrainGeometry = useMemo(() => new THREE.PlaneGeometry(MAP_W, MAP_H, 1024, 440), []);

  const terrainMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTerrain: { value: textures.terrain },
        uColor: { value: textures.color },
        uEmpire: { value: textures.empire },
        uExag: { value: EXAGGERATION },
        uLift: { value: LAND_LIFT },
        uTexel: { value: new THREE.Vector2(1 / MAP.width, 1 / MAP.height) },
        uWorldTexel: { value: new THREE.Vector2(MAP_W / MAP.width, MAP_H / MAP.height) },
        uSun: { value: SUN },
        uProgress: { value: 0 },
        uWaves: { value: WAVES.length },
        uGlow: { value: 0 },
        uShine: { value: 0 },
        uEmpireOpacity: { value: 0.66 },
        uDetail: { value: 0 },
        uBorderGlow: { value: 0 },
        uFlat: { value: new THREE.Vector4(0, 0, 1, 0) },
        uFlatAmt: { value: 0 },
        uKhanate: { value: textures.khanates },
        uSplit: { value: 0 },
        uCrack: { value: 0 },
        uAssim: { value: new THREE.Vector4() },
        uPlague: { value: new THREE.Vector4() },
        uYuanFade: { value: 0 },
        uShatter: { value: 0 },
      },
      vertexShader: TERRAIN_VERT,
      fragmentShader: TERRAIN_FRAG,
    });
  }, [textures]);

  const sides = useMemo(() => {
    const mk = (geometry: THREE.BufferGeometry, shade: number) => ({
      geometry,
      material: new THREE.ShaderMaterial({
        uniforms: {
          uTerrain: { value: textures.terrain },
          uExag: { value: EXAGGERATION },
          uLift: { value: LAND_LIFT },
          uBase: { value: BASE_DEPTH },
          uSideShade: { value: shade },
        },
        vertexShader: SIDE_VERT,
        fragmentShader: SIDE_FRAG,
        side: THREE.DoubleSide,
      }),
    });
    return [
      mk(makeSide("x", -MAP_H / 2, 800), 1.0), // south face (towards camera)
      mk(makeSide("x", MAP_H / 2, 800), 0.7),
      mk(makeSide("y", -MAP_W / 2, 400), 0.82), // west face
      mk(makeSide("y", MAP_W / 2, 400), 0.82),
    ];
  }, [textures]);

  terrainMaterial.uniforms.uProgress.value = progress;
  terrainMaterial.uniforms.uGlow.value = glow;
  terrainMaterial.uniforms.uShine.value = shine;
  terrainMaterial.uniforms.uEmpireOpacity.value = empireOpacity;
  terrainMaterial.uniforms.uDetail.value = detail;
  terrainMaterial.uniforms.uBorderGlow.value = borderGlow;
  if (flat) terrainMaterial.uniforms.uFlat.value.set(flat.x, flat.y, flat.radius, flat.height);
  terrainMaterial.uniforms.uFlatAmt.value = flat ? flat.amount : 0;
  const u = terrainMaterial.uniforms;
  u.uSplit.value = decline?.split ?? 0;
  u.uCrack.value = decline?.crack ?? 0;
  u.uAssim.value.set(...(decline?.assim ?? [0, 0, 0, 0]));
  u.uPlague.value.set(...(decline?.plague ?? [0, 0, 0, 0]));
  u.uYuanFade.value = decline?.yuanFade ?? 0;
  u.uShatter.value = decline?.shatter ?? 0;

  return (
    <group>
      <mesh geometry={terrainGeometry} material={terrainMaterial} />
      {sides.map((s, i) => (
        <mesh key={i} geometry={s.geometry} material={s.material} />
      ))}
      {/* bottom of the block */}
      <mesh position={[0, 0, -BASE_DEPTH]} rotation={[Math.PI, 0, 0]}>
        <planeGeometry args={[MAP_W, MAP_H]} />
        <meshBasicMaterial color="#3b2c20" />
      </mesh>
    </group>
  );
};
