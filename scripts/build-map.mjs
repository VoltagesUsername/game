// Builds the textures for the 3D Eurasia map used in the Mongol scenes.
//
//   node scripts/build-map.mjs <elev_bump_4k.jpg> <water_4k.png> <satellite_4k.jpg>
//
// Inputs are NASA-derived global images (equirectangular, 4096x2048), e.g. from
// https://github.com/turban/webgl-earth/tree/master/images
// Outputs (committed, so you never need to run this yourself):
//   public/map/terrain.png  R = elevation, G = land mask, B = distance from coast (sea)
//   public/map/color.png    softened satellite colours (painted in the shader)
//   public/map/empire.png   when each place joins the Mongol Empire (see below)
import fs from "node:fs";
import jpeg from "jpeg-js";
import { PNG } from "pngjs";
import { MAP, WAVES, HAND_REGIONS, SONG_1260 } from "../src/mongol/map/config.js";

const [elevPath, waterPath, colorPath] = process.argv.slice(2);
if (!colorPath) {
  console.error("usage: node scripts/build-map.mjs <elev.jpg> <water.png> <color.jpg>");
  process.exit(1);
}

const readImage = (p) => {
  const buf = fs.readFileSync(p);
  return p.endsWith(".png") ? PNG.sync.read(buf) : jpeg.decode(buf, { useTArray: true, maxMemoryUsageInMB: 1024 });
};

const elev = readImage(elevPath);
const water = readImage(waterPath);
const sat = readImage(colorPath);

const { lon0, lon1, lat0, lat1, width: W, height: H } = MAP;
const lonAt = (i) => lon0 + ((i + 0.5) / W) * (lon1 - lon0);
const latAt = (j) => lat1 - ((j + 0.5) / H) * (lat1 - lat0);

/** Bilinear sample of channel c of a global equirectangular image. */
const sample = (img, lon, lat, c = 0) => {
  const x = ((lon + 180) / 360) * img.width - 0.5;
  const y = ((90 - lat) / 180) * img.height - 0.5;
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const px = (xx, yy) => {
    xx = (xx + img.width) % img.width;
    yy = Math.max(0, Math.min(img.height - 1, yy));
    return img.data[(yy * img.width + xx) * 4 + c];
  };
  return (
    px(x0, y0) * (1 - fx) * (1 - fy) + px(x0 + 1, y0) * fx * (1 - fy) +
    px(x0, y0 + 1) * (1 - fx) * fy + px(x0 + 1, y0 + 1) * fx * fy
  );
};

const N = W * H;
const height = new Float32Array(N);
const land = new Uint8Array(N);
const rgb = [new Float32Array(N), new Float32Array(N), new Float32Array(N)];

for (let j = 0; j < H; j++) {
  for (let i = 0; i < W; i++) {
    const k = j * W + i, lon = lonAt(i), lat = latAt(j);
    const isLand = sample(water, lon, lat) < 128;
    land[k] = isLand ? 255 : 0;
    height[k] = isLand ? sample(elev, lon, lat) : 0;
    for (let c = 0; c < 3; c++) rgb[c][k] = sample(sat, lon, lat, c);
  }
}

// Fill small lakes (they would look like pits in the 3D land). Big ones stay.
const MIN_LAKE_CELLS = 150;
{
  const seen = new Uint8Array(N);
  const filled = [];
  for (let start = 0; start < N; start++) {
    if (land[start] || seen[start]) continue;
    const comp = [start];
    seen[start] = 1;
    let touchesEdge = false;
    for (let q = 0; q < comp.length; q++) {
      const k = comp[q], i = k % W, j = (k - i) / W;
      if (i === 0 || j === 0 || i === W - 1 || j === H - 1) touchesEdge = true;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= W || jj >= H) continue;
        const kk = jj * W + ii;
        if (!land[kk] && !seen[kk]) { seen[kk] = 1; comp.push(kk); }
      }
    }
    if (!touchesEdge && comp.length < MIN_LAKE_CELLS) filled.push(...comp);
  }
  for (const k of filled) land[k] = 255;
  // give filled lakes the height of their surroundings
  for (let pass = 0; pass < 40; pass++) {
    for (const k of filled) {
      const i = k % W;
      height[k] = (height[k - 1] + height[k + 1] + height[k - W] + height[k + W]) / 4;
      if (i === 0) height[k] = height[k + 1];
    }
  }
}

/** Separable box blur, repeated = soft painterly smoothing. */
const blur = (src, r, passes) => {
  let a = Float32Array.from(src), b = new Float32Array(N);
  for (let p = 0; p < passes; p++) {
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      let s = 0, n = 0;
      for (let d = -r; d <= r; d++) { const ii = i + d; if (ii >= 0 && ii < W) { s += a[j * W + ii]; n++; } }
      b[j * W + i] = s / n;
    }
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      let s = 0, n = 0;
      for (let d = -r; d <= r; d++) { const jj = j + d; if (jj >= 0 && jj < H) { s += b[jj * W + i]; n++; } }
      a[j * W + i] = s / n;
    }
  }
  return a;
};

// Inland lakes (water not connected to the map edge): give each a flat surface at the
// height of its shore, so lakes sit in the land instead of dropping to sea level.
const lakeLevel = new Float32Array(N).fill(-1);
{
  const seen = new Uint8Array(N);
  for (let start = 0; start < N; start++) {
    if (land[start] || seen[start]) continue;
    const comp = [start];
    seen[start] = 1;
    let touchesEdge = false;
    const shore = [];
    for (let q = 0; q < comp.length; q++) {
      const k = comp[q], i = k % W, j = (k - i) / W;
      if (i === 0 || j === 0 || i === W - 1 || j === H - 1) touchesEdge = true;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= W || jj >= H) continue;
        const kk = jj * W + ii;
        if (land[kk]) shore.push(height[kk]);
        else if (!seen[kk]) { seen[kk] = 1; comp.push(kk); }
      }
    }
    if (touchesEdge || shore.length === 0) continue;
    shore.sort((a, b) => a - b);
    const level = shore[Math.floor(shore.length * 0.1)];
    for (const k of comp) lakeLevel[k] = level;
  }
  for (let k = 0; k < N; k++) if (lakeLevel[k] >= 0) height[k] = lakeLevel[k];
}

// Smooth the JPEG height noise a little, and the colours more (painted look).
const heightSmooth = blur(height, 1, 2);
const colorSmooth = rgb.map((ch) => blur(ch, 2, 2));

/** Chamfer distance transform (in degrees, corrected for latitude). */
const distanceFrom = (isSource) => {
  const d = new Float32Array(N).fill(1e9);
  for (let k = 0; k < N; k++) if (isSource(k)) d[k] = 0;
  const cell = (lon1 - lon0) / W;
  const pass = (forward) => {
    const js = forward ? [...Array(H).keys()] : [...Array(H).keys()].reverse();
    const is = forward ? [...Array(W).keys()] : [...Array(W).keys()].reverse();
    const s = forward ? -1 : 1;
    for (const j of js) {
      const dx = cell * Math.cos((latAt(j) * Math.PI) / 180), dy = cell, dd = Math.hypot(dx, dy);
      for (const i of is) {
        const k = j * W + i;
        let v = d[k];
        const ii = i + s, jj = j + s;
        if (ii >= 0 && ii < W) v = Math.min(v, d[j * W + ii] + dx);
        if (jj >= 0 && jj < H) {
          v = Math.min(v, d[jj * W + i] + dy);
          if (i - 1 >= 0) v = Math.min(v, d[jj * W + i - 1] + dd);
          if (i + 1 < W) v = Math.min(v, d[jj * W + i + 1] + dd);
        }
        d[k] = v;
      }
    }
  };
  pass(true); pass(false); pass(true); pass(false);
  return d;
};

const coastDist = blur(distanceFrom((k) => land[k] > 0), 3, 3);

// ---------- terrain.png ----------
let maxH = 0;
for (let k = 0; k < N; k++) maxH = Math.max(maxH, heightSmooth[k]);
const terrain = new PNG({ width: W, height: H });
const colorPng = new PNG({ width: W, height: H });
for (let k = 0; k < N; k++) {
  terrain.data[k * 4] = Math.round((heightSmooth[k] / maxH) * 255);
  terrain.data[k * 4 + 1] = land[k];
  terrain.data[k * 4 + 2] = Math.round(Math.min(1, coastDist[k] / 6) * 255);
  terrain.data[k * 4 + 3] = lakeLevel[k] >= 0 ? 200 : 255; // alpha 200 marks inland lakes
  for (let c = 0; c < 3; c++) colorPng.data[k * 4 + c] = Math.round(colorSmooth[c][k]);
  colorPng.data[k * 4 + 3] = 255;
}

// ---------- empire.png ----------
// Polygon rasteriser (even-odd scanline fill), lon/lat rings -> grid mask.
const rasterise = (polygons) => {
  const m = new Uint8Array(N);
  for (const rings of polygons) {
    for (let j = 0; j < H; j++) {
      const lat = latAt(j);
      const xs = [];
      for (const ring of rings) {
        for (let a = 0, b = ring.length - 1; a < ring.length; b = a++) {
          const [x1, y1] = ring[a], [x2, y2] = ring[b];
          if ((y1 > lat) !== (y2 > lat)) xs.push(x1 + ((lat - y1) / (y2 - y1)) * (x2 - x1));
        }
      }
      xs.sort((p, q) => p - q);
      for (let n = 0; n + 1 < xs.length; n += 2) {
        const i0 = Math.max(0, Math.ceil(((xs[n] - lon0) / (lon1 - lon0)) * W - 0.5));
        const i1 = Math.min(W - 1, Math.floor(((xs[n + 1] - lon0) / (lon1 - lon0)) * W - 0.5));
        for (let i = i0; i <= i1; i++) m[j * W + i] ^= 1;
      }
    }
  }
  return m;
};

/** Smoothly wobble a mask so hand-drawn borders look natural (amplitude in cells). */
const warp = (m, amp, seed) => {
  const out = new Uint8Array(N);
  const ph = [seed * 1.7, seed * 2.9, seed * 4.3, seed * 5.1];
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const dx = amp * (0.6 * Math.sin(i * 0.031 + j * 0.017 + ph[0]) + 0.4 * Math.sin(i * 0.083 - j * 0.061 + ph[1]));
    const dy = amp * (0.6 * Math.sin(j * 0.029 - i * 0.021 + ph[2]) + 0.4 * Math.sin(j * 0.077 + i * 0.054 + ph[3]));
    const ii = Math.min(W - 1, Math.max(0, Math.round(i + dx)));
    const jj = Math.min(H - 1, Math.max(0, Math.round(j + dy)));
    out[j * W + i] = m[jj * W + ii];
  }
  return out;
};

/** Morphological closing: fills gaps and notches narrower than ~2r degrees. */
const close = (m, r) => {
  const dOut = distanceFrom((k) => m[k] > 0);
  const dil = dOut.map((d) => (d <= r ? 1 : 0));
  const dIn = distanceFrom((k) => !dil[k]);
  return Uint8Array.from(dIn, (d) => (d > r ? 1 : 0));
};

const geo = JSON.parse(fs.readFileSync(new URL("../data/mongol_1279.geojson", import.meta.url)));
const peakPolys = geo.features.flatMap((f) =>
  f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates,
);
const peak = rasterise(peakPolys);
const song = warp(rasterise([[SONG_1260]]), 6, 9);

// Cumulative territory per wave (never shrinks).
const masks = [];
let prev = new Uint8Array(N);
WAVES.forEach((w, idx) => {
  let m;
  if (w.from === "peak-minus-song") m = peak.map((v, k) => (v && !song[k] ? 1 : 0));
  else if (w.from === "peak") m = peak;
  else m = warp(rasterise(HAND_REGIONS[w.from].map((ring) => [ring])), 6, idx + 1);
  let cum = new Uint8Array(N);
  for (let k = 0; k < N; k++) cum[k] = prev[k] || m[k] ? 1 : 0;
  cum = close(cum, 0.8);
  for (let k = 0; k < N; k++) if (prev[k]) cum[k] = 1;
  masks.push(cum);
  prev = cum;
});

// Progress value p: wave n spreads outward over p in [n, n+1],
// starting from the previous territory (or the seed point for wave 0).
const progress = new Float32Array(N).fill(-1);
masks.forEach((cum, n) => {
  const before = n === 0 ? null : masks[n - 1];
  let dist;
  if (n === 0) {
    const [slon, slat] = MAP.seed;
    const si = Math.round(((slon - lon0) / (lon1 - lon0)) * W - 0.5);
    const sj = Math.round(((lat1 - slat) / (lat1 - lat0)) * H - 0.5);
    dist = distanceFrom((k) => k === sj * W + si);
  } else {
    dist = distanceFrom((k) => before[k] > 0);
  }
  let dmax = 0;
  for (let k = 0; k < N; k++) if (cum[k] && progress[k] < 0) dmax = Math.max(dmax, dist[k]);
  for (let k = 0; k < N; k++) if (cum[k] && progress[k] < 0) progress[k] = n + dist[k] / Math.max(dmax, 1e-6);
});

const empire = new PNG({ width: W, height: H });
for (let k = 0; k < N; k++) {
  const v = progress[k] < 0 ? 255 : Math.round((progress[k] / WAVES.length) * 250);
  empire.data[k * 4] = empire.data[k * 4 + 1] = empire.data[k * 4 + 2] = v;
  empire.data[k * 4 + 3] = 255;
}

fs.mkdirSync("public/map", { recursive: true });
fs.writeFileSync("public/map/terrain.png", PNG.sync.write(terrain));
fs.writeFileSync("public/map/color.png", PNG.sync.write(colorPng));
fs.writeFileSync("public/map/empire.png", PNG.sync.write(empire));
console.log(`Wrote public/map/*.png (${W}x${H})`);
