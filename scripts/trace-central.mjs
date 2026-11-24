// Builds data/paths.json (walkable network for the central campus).
// Roads and footpaths were traced by eye from Esri World Imagery at zoom 18 (tile origin below) — approximate, ~5-10 m.
// The covered walkway spine uses OSM building outlines ("Walkway") — OSM data © OpenStreetMap contributors, ODbL.
// Pixel coordinates are in a stitched mosaic whose top-left tile is (X0, Y0) at zoom Z. A string entry is a pin id.
// Usage: node scripts/trace-central.mjs
import { readFileSync, writeFileSync } from "node:fs";

const Z = 18, X0 = 134468, Y0 = 124864;
const pois = JSON.parse(readFileSync("data/pois.json", "utf8"));
const pinLL = (id) => { const p = pois.find((x) => x.id === id); if (!p) throw new Error("no pin " + id); return [p.lng, p.lat]; };
const px2ll = ([x, y]) => {
  const n = 2 ** Z, lng = ((X0 + x / 256) / n) * 360 - 180;
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (Y0 + y / 256)) / n))) * 180) / Math.PI;
  return [+lng.toFixed(6), +lat.toFixed(6)];
};
const conv = (pts) => pts.map((p) => (typeof p === "string" ? pinLL(p) : p.ll ? p.ll : px2ll(p)));

// Covered walkway spine (OSM building centrelines, north -> south), joined across the link blocks.
const walkway = [[4.674059, 8.484637], [4.673958, 8.483418], [4.673805, 8.483245], [4.67375, 8.48254], [4.673815, 8.482342], [4.673755, 8.481693], [4.673613, 8.48151], [4.673557, 8.480864]];

const circle = (cx, cy, r, n) => Array.from({ length: n + 1 }, (_, i) => [Math.round(cx + r * Math.cos((2 * Math.PI * i) / n)), Math.round(cy + r * Math.sin((2 * Math.PI * i) / n))]);
const L = (kind, name, pts) => ({ kind, name, ll: conv(pts) });
const lines = [
  // --- tarred roads ---
  L("road", "Main spine road", [[2027,750],[2073,835],[2119,927],[2150,988],[2188,1065],[2212,1119],[2218,1181],[2218,1288],[2217,1404],[2214,1519],[2212,1619],[2212,1700],[2207,1850],[2171,1993],[2143,2100],[2121,2221],[2107,2307],[2082,2407],[2050,2493],[2039,2564],[2021,2636],[2000,2743],[1979,2850]]),
  L("road", "North east-west road", [[1693,1643],[1779,1653],[1850,1668],[1907,1682],[1979,1664],[2040,1662],[2096,1676],[2150,1688],[2212,1698]]),
  L("road", "Arts ring road", [[1350,1893],[1443,1868],[1500,1854],[1593,1836],[1686,1818],[1771,1793],[1821,1757],[1871,1714],[1907,1682]]),
  L("road", "Arts road north branch", [[1593,1836],[1636,1736],[1664,1679],[1693,1643]]),
  L("road", "Central north-south road", [[1333,2138],[1331,2050],[1325,1980],[1322,1920],[1350,1893]]),
  L("road", "South ring road", [[921,2221],[975,2204],[1100,2183],[1225,2154],[1333,2138],[1400,2142],[1467,2167],[1533,2208],[1592,2258],[1625,2312],[1636,2350]]),
  L("road", "West road", [[1331,388],[1254,365],[1154,342],[1077,342],[1031,358],[1000,396],[977,450],[962,519],[962,596],[969,681],[975,742],[969,804],[965,865],[950,927],[923,973],[900,1019],[885,1050],[870,1130],[855,1215],[844,1300],[875,1550],[900,1862],[904,2050],[908,2175],[913,2242],[929,2325],[946,2408],[962,2483],[979,2550],[1017,2608],[1083,2667],[1167,2692],[1217,2733],[1258,2800],[1258,2842],[1317,2825],[1383,2812],[1450,2825],[1517,2837],[1583,2854],[1612,2874]]),
  // --- south: roundabout, roads to the Mosque / Stadium area ---
  L("road", "Roundabout", circle(1650, 2879, 46, 12)),
  L("road", "Roundabout east road", [[1696,2879],[1717,2896],[1783,2908],[1850,2900],[1950,2896],[1975,2870],[1979,2850]]),
  L("road", "Stadium road (south)", [[1640,2925],[1633,2950],[1625,3033],[1608,3133],[1583,3233],[1566,3290],[1545,3340],[1518,3386],[1473,3477],[1418,3559],[1364,3623],[1300,3677],[1227,3723],[1164,3768],[1109,3805]]),
  L("road", "Stadium west road", [[1125,2958],[1067,3000],[1042,3092],[1017,3200],[1005,3250],[1018,3341],[1045,3423],[1082,3523],[1118,3595],[1127,3659],[1114,3741],[1105,3795]]),
  // --- covered walkway ---
  { kind: "covered", name: "Covered walkway", ll: walkway },
  // --- footpaths / shortcuts (traced from imagery) ---
  L("footpath", "Library to lecture theatres", ["university-library",[1665,2062],[1720,2052],[1790,2015],[1845,1965],"lt-3"]),
  L("footpath", "Library to LT 2", ["university-library",[1643,2093],[1736,2164],[1786,2207],"lt-2"]),
  L("footpath", "Library to Arts road", ["university-library",[1620,1990],[1600,1925],[1580,1880],[1593,1836]]),
  L("footpath", "LT 1 to south ring road", ["lt-1",[1790,2318],[1720,2330],[1636,2350]]),
  L("footpath", "LT 2 to walkway", ["lt-2",[1884,2262]]),
  L("footpath", "LT 1 to walkway", ["lt-1",[1884,2318]]),
  L("footpath", "LT 3 to walkway", ["lt-3",[1913,1960]]),
  L("footpath", "LT 4 to walkway", ["lt-4",[1916,1900]]),
  L("footpath", "LT 3 to LT 4", ["lt-3","lt-4"]),
  L("footpath", "Walkway north end to Arts road", [{ ll: [4.674059, 8.484637] },[1925,1745],[1900,1735],[1875,1718]]),
  L("footpath", "Walkway south end to Senate", [[1845,2498],[1860,2550],[1870,2600],"senate-building"]),
  L("footpath", "Walkway south end to main road", [[1845,2498],[1870,2535],[1960,2540],[2043,2547]]),
  L("footpath", "Senate plaza to main road", ["senate-building",[1930,2648],[1985,2640],[2021,2636]]),
  L("footpath", "Main Auditorium to Senate", ["main-auditorium",[1870,2700],"senate-building"]),
  L("footpath", "Faculty of Arts to road", ["faculty-of-arts",[1570,1690],[1620,1700],[1664,1679]]),
  L("footpath", "Art Theatre to road", ["art-theatre",[1745,1775],[1771,1793]]),
  L("footpath", "SUB to west road", ["students-union-building-sub",[708,2217],[808,2258],[904,2246],[913,2242]]),
  L("footpath", "Market to west road", ["campus-market",[825,2450],[958,2442]]),
  L("footpath", "School Clinic to west road", ["school-clinic",[960,2010],[904,2020]]),
  L("footpath", "Dental Clinic to west road", ["school-dental-clinic",[950,1905],[901,1900]]),
  L("footpath", "Hostels path", [[929,2325],[979,2308],[1054,2300],[1062,2383],[1067,2442],[1121,2517],[1183,2558],[1250,2583],[1308,2592],[1400,2583],"lagos-male-hostel"]),
  L("footpath", "Lagos Female Hostel access", [[1062,2383],[1130,2372],"lagos-female-hostel"]),
  L("footpath", "SLT to main road", ["slt",[2150,2305],[2107,2307]]),
  L("footpath", "CIS to main road", [[2150,990],[2081,1019],[2042,1035],[2000,1030],"faculty-of-communication-and-information-sciences"]),
  L("footpath", "CIS Lecture Theatre path", ["faculty-of-communication-and-information-sciences",[1980,900],"cis-lecture-theatre"]),
  L("footpath", "CIS to Social Sciences blocks", [[2042,1035],[2058,1096],[2070,1170],[2082,1240],[2060,1292],[2030,1325],[1996,1340]]),
  L("footpath", "Social Sciences north-south track", [[1996,1340],[1992,1420],[1990,1480],[1985,1540],[1988,1596],[1981,1650],[1979,1664]]),
  L("footpath", "Economics/Psychology access", [[1992,1366],"economics-psychology-block"]),
  L("footpath", "Accounting/Finance access", [[1992,1440],"accounting-finance-block"]),
  L("footpath", "Geography access", ["accounting-finance-block","geography-block"]),
  L("footpath", "Political Science/Sociology to main road", [[1990,1500],"political-science-sociology-block",[2119,1519],[2181,1504],[2212,1519]]),
  L("footpath", "Mosque to south ring road", ["university-central-mosque",[1418,2975],[1433,2917],[1467,2879],[1495,2854],[1517,2837]]),
  L("footpath", "Stadium west road link (unverified)", [[1125,2958],[1180,2910],[1230,2870],[1258,2842]]),
  L("footpath", "Stadium to road", ["university-stadium",[1010,3640],[1062,3632],[1112,3606]]),
  L("footpath", "Main Auditorium south path", ["main-auditorium",[1860,2840],[1850,2900]]),
  L("footpath", "Atlantic Heights Hostel to ring road", ["atlantic-heights-hostel",[1138,380],[1140,345]]),
  L("footpath", "SSLT access", ["sslt",[1990,1480]]),
  L("footpath", "Lecture Rooms access", ["lecture-rooms-lr",[1985,1540]]),
];

// ---- geometry helpers (metres, local equirectangular) ----
const kx = 111320 * Math.cos((8.48 * Math.PI) / 180), ky = 110574;
const m = ([x, y]) => [x * kx, y * ky];
const dist = (a, b) => Math.hypot(...m(a).map((v, i) => v - m(b)[i]));
function project(p, a, b) { // nearest point on segment a-b to p
  const [px, py] = m(p), [ax, ay] = m(a), [bx, by] = m(b), dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, dx || dy ? ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy) : 0));
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}
const pinSet = new Set(pois.map((p) => p.lng + "," + p.lat));
const isPin = (p) => pinSet.has(p[0] + "," + p[1]);

// ---- snap free endpoints onto other lines (insert a shared vertex) ----
// Roads/walkway are preferred hosts; footpaths only host other footpaths when no road/walkway is within range.
const SNAP_M = 10;
function nearest(p, line, wantFootpath) {
  let best = null;
  for (const host of lines) {
    if (host === line || (host.kind === "footpath") !== wantFootpath) continue;
    for (let i = 0; i < host.ll.length - 1; i++) {
      const q = project(p, host.ll[i], host.ll[i + 1]), d = dist(p, q);
      if (d <= SNAP_M && (!best || d < best.d)) best = { d, q, host, i };
    }
  }
  return best;
}
for (const line of lines) {
  for (const end of [0, line.ll.length - 1]) {
    const p = line.ll[end];
    if (isPin(p)) continue;
    const best = nearest(p, line, false) ?? nearest(p, line, true);
    if (!best) { if (line.kind === "footpath" || line.kind === "road") console.warn(`  note: "${line.name}" end ${end ? "B" : "A"} is free (no line within ${SNAP_M} m)`); continue; }
    const q = best.q.map((v) => +v.toFixed(6)), h = best.host.ll;
    const near = [h[best.i], h[best.i + 1]].find((v) => dist(v, q) < 1.5);
    const target = near ?? q;
    if (!near) h.splice(best.i + 1, 0, target);
    line.ll[end] = target;
  }
}

const fc = { type: "FeatureCollection", features: lines.map((l) => ({ type: "Feature", properties: { name: l.name, kind: l.kind }, geometry: { type: "LineString", coordinates: l.ll } })) };
writeFileSync("data/paths.json", JSON.stringify(fc) + "\n");
const total = lines.reduce((s, l) => s + l.ll.slice(1).reduce((a, p, i) => a + dist(l.ll[i], p), 0), 0);
console.log(`Wrote ${lines.length} lines, ${(total / 1000).toFixed(2)} km, to data/paths.json`);
