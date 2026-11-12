// Shared by the map build script (Node) and the video (browser).
// Coordinates are [longitude, latitude] in degrees.

export const MAP = {
  lon0: -15,
  lon1: 155,
  lat0: 5,
  lat1: 78,
  width: 2048,
  height: 880,
  // Where the empire starts spreading from (Khentii mountains, Genghis Khan's homeland)
  seed: [110.5, 48.5],
};

// Map projection: simple equirectangular, longitudes squeezed by cos(40°).
export const LON_SCALE = Math.cos((40 * Math.PI) / 180);
export const MAP_W = (MAP.lon1 - MAP.lon0) * LON_SCALE;
export const MAP_H = MAP.lat1 - MAP.lat0;
const LON_C = (MAP.lon0 + MAP.lon1) / 2;
const LAT_C = (MAP.lat0 + MAP.lat1) / 2;

/** Longitude/latitude -> flat map coordinates (x east, y north). */
export const project = (lon, lat) => [(lon - LON_C) * LON_SCALE, lat - LAT_C];

// The expansion, wave by wave. Each wave spreads outward from the previous territory.
// 1206-1227 are drawn by hand (approximate); 1260/1279 come from historical-basemaps.
export const WAVES = [
  { year: 1206, from: "y1206" },
  { year: 1215, from: "y1215" },
  { year: 1227, from: "y1227" },
  { year: 1260, from: "peak-minus-song" },
  { year: 1279, from: "peak" },
];

export const HAND_REGIONS = {
  // Mongol homeland after Temüjin unites the tribes
  y1206: [
    [[88, 49.5], [90, 51], [94, 52], [98, 52.5], [102, 52], [106, 53.5], [110, 55], [114, 54], [117, 52.5],
     [119.5, 50.5], [118.5, 47.5], [116, 45.5], [112, 44], [108, 42.5], [104, 42], [100, 42.5], [96, 43],
     [92, 44.5], [90, 46.5]],
  ],
  // + Northern Jin (Beijing falls 1215), Western Xia submits, Uyghurs and forest peoples join
  y1215: [
    [[107, 42.5], [110, 41], [112, 40], [114.5, 39.5], [116.5, 39.5], [118.5, 39.5], [121, 40.5], [123.5, 42],
     [124.5, 44.5], [123, 46.5], [120, 47.5], [118.5, 47.5], [116, 45.5], [112, 44]],
    [[96, 40.5], [98, 39], [100.5, 37.5], [103, 36], [105.5, 35.5], [107, 36.5], [107.5, 38.5], [108, 40.5],
     [107, 42.5], [104, 42], [100, 42.5], [96, 43]],
    [[82, 47], [84, 44.5], [87, 42.5], [90, 42], [94, 42], [96, 43], [92, 44.5], [90, 46.5], [88, 49.5], [85, 49.5]],
    [[86, 50], [88, 49.5], [90, 51], [94, 52], [98, 52.5], [102, 52], [106, 53.5], [110, 55], [114, 54],
     [117, 52.5], [118, 55], [112, 57], [104, 56.5], [96, 55.5], [89, 54]],
  ],
  // + Qara Khitai (1218), Khwarezmian Empire (1219-21), Manchuria and more of northern China
  y1227: [
    [[59, 44], [63, 47], [68, 49], [74, 50.5], [80, 50.5], [85, 49.5], [82, 47], [84, 44.5], [87, 42.5], [90, 42],
     [94, 42], [96, 40.5], [94, 38.5], [89, 37], [83, 36.5], [77, 36.5], [73, 37.5], [70, 38.5], [66, 39.5],
     [62, 41.5]],
    [[51.5, 37], [53, 39.5], [53.5, 41.5], [55, 44], [59, 44], [62, 41.5], [66, 39.5], [70, 38.5], [73, 37.5],
     [74.5, 35], [72, 33], [69.5, 31.5], [66, 30.5], [62, 30.5], [59, 32.5], [56, 34.5], [53.5, 35.5]],
    [[114.5, 39.5], [113, 37], [114, 35], [116, 35.5], [118.5, 36.5], [119.5, 37.5], [121, 40.5], [118.5, 39.5],
     [116.5, 39.5]],
    [[110, 41], [110.5, 38], [111, 36], [113, 35], [114, 35], [113, 37], [114.5, 39.5], [112, 40]],
    [[123.5, 42], [125, 40.5], [127.5, 41.5], [129.5, 42.5], [131, 43.5], [133, 45.5], [135, 48], [134, 50],
     [128, 52.5], [122, 53], [119.5, 50.5], [120, 47.5], [123, 46.5], [124.5, 44.5]],
  ],
};

// Southern Song China, still unconquered in 1260 (falls 1279).
export const SONG_1260 = [
  [103.5, 29.5], [105, 31.5], [106.5, 32.8], [109, 33], [111, 32.8], [113.5, 32.5], [115.5, 32.5], [117.5, 33.2],
  [119.5, 34], [121, 32.5], [122.5, 30.5], [121.8, 28], [120, 26], [118, 24], [116, 22.6], [113.5, 21.8],
  [110.5, 20], [109.5, 18], [108, 18.5], [108.5, 21.5], [106.8, 22.5], [105.5, 23.3], [104.5, 24.5],
  [103.8, 26.5], [103.3, 28],
];
