// Builds public/map/khanates.png: which of the four khanates each map cell belongs to
// (R channel: 60 = Yuan, 120 = Golden Horde, 180 = Ilkhanate, 240 = Chagatai, 0 = none).
// Uses the 1279 borders in data/mongol_1279.geojson; cells inside the empire mask
// (public/map/empire.png) that no polygon covers take the nearest khanate.
//
//   node scripts/build-khanates.mjs
import fs from "node:fs";
import { PNG } from "pngjs";
import { MAP } from "../src/mongol/map/config.js";

const { lon0, lon1, lat0, lat1, width: W, height: H } = MAP;
const N = W * H;
const latAt = (j) => lat1 - ((j + 0.5) / H) * (lat1 - lat0);

const GROUP = {
  "Great Khanate": 1, Tibet: 1, // -> Yuan
  "Khanate of the Golden Horde": 2, Novgorod: 2, Ryazan: 2,
  Ilkhanate: 3, "Seljuk Caliphate": 3,
  "Chagatai Khanate": 4,
};

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

const geo = JSON.parse(fs.readFileSync(new URL("../data/mongol_1279.geojson", import.meta.url)));
const id = new Uint8Array(N);
for (const f of geo.features) {
  const g = GROUP[f.properties.name];
  if (!g) continue;
  const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
  const m = rasterise(polys);
  for (let k = 0; k < N; k++) if (m[k] && !id[k]) id[k] = g;
}

// fill gaps inside the empire with the nearest khanate (multi-source BFS)
const empire = PNG.sync.read(fs.readFileSync("public/map/empire.png"));
const inEmpire = (k) => empire.data[k * 4] < 252;
const queue = [];
for (let k = 0; k < N; k++) if (id[k]) queue.push(k);
for (let q = 0; q < queue.length; q++) {
  const k = queue[q], i = k % W, j = (k - i) / W;
  for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const ii = i + di, jj = j + dj;
    if (ii < 0 || jj < 0 || ii >= W || jj >= H) continue;
    const kk = jj * W + ii;
    if (!id[kk] && inEmpire(kk)) { id[kk] = id[k]; queue.push(kk); }
  }
}

const out = new PNG({ width: W, height: H });
for (let k = 0; k < N; k++) {
  const v = id[k] * 60;
  out.data[k * 4] = out.data[k * 4 + 1] = out.data[k * 4 + 2] = v;
  out.data[k * 4 + 3] = 255;
}
fs.writeFileSync("public/map/khanates.png", PNG.sync.write(out));
console.log("Wrote public/map/khanates.png");
