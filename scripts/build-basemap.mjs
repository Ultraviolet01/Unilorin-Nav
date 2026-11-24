// Builds public/basemap.json — a small vector basemap (roads, buildings, water, green areas, campus boundary)
// from OpenStreetMap, used for the app's "Map" view when no Amazon Location map is configured. Works offline.
// Data © OpenStreetMap contributors, ODbL. Usage: node scripts/build-basemap.mjs   (~12 requests to the OSM API)
import { writeFileSync } from "node:fs";

const API = "https://api.openstreetmap.org/api/0.6", H = { "User-Agent": "unilorin-navigator-data-script" };
const get = async (u) => { const r = await fetch(u, { headers: H }); if (!r.ok) throw new Error(u + " " + r.status); return r.json(); };
const campus = await get(`${API}/way/1482800400/full.json`);
const cn = new Map(campus.elements.filter((e) => e.type === "node").map((e) => [e.id, e]));
const ring = campus.elements.find((e) => e.type === "way").nodes.map((i) => [cn.get(i).lon, cn.get(i).lat]);
const xs = ring.map((p) => p[0]), ys = ring.map((p) => p[1]), PAD = 0.004;
const box = [Math.min(...xs) - PAD, Math.min(...ys) - PAD, Math.max(...xs) + PAD, Math.max(...ys) + PAD];

const nodes = new Map(), ways = new Map();
for (let lng = box[0]; lng < box[2]; lng += 0.02) for (let lat = box[1]; lat < box[3]; lat += 0.02) {
  const j = await get(`${API}/map.json?bbox=${lng.toFixed(4)},${lat.toFixed(4)},${Math.min(lng + 0.02, box[2] + 0.02).toFixed(4)},${Math.min(lat + 0.02, box[3] + 0.02).toFixed(4)}`);
  for (const e of j.elements ?? []) { if (e.type === "node") nodes.set(e.id, e); else if (e.type === "way") ways.set(e.id, e); }
  await new Promise((r) => setTimeout(r, 1000));
}

const cls = { trunk: "major", primary: "major", secondary: "major", tertiary: "major", trunk_link: "major", primary_link: "major", secondary_link: "major", tertiary_link: "major",
  residential: "minor", unclassified: "minor", living_street: "minor", service: "service", track: "service", path: "path", footway: "path", pedestrian: "path", cycleway: "path" };
const round = (p) => [+p.lon.toFixed(6), +p.lat.toFixed(6)];
const inBox = (p) => p.lon > box[0] && p.lon < box[2] && p.lat > box[1] && p.lat < box[3];
const features = [{ type: "Feature", properties: { k: "campus" }, geometry: { type: "Polygon", coordinates: [ring.map((p) => [+p[0].toFixed(6), +p[1].toFixed(6)])] } }];
const counts = {};
for (const w of ways.values()) {
  const t = w.tags; if (!t) continue;
  const pts = (w.nodes ?? []).map((i) => nodes.get(i)).filter(Boolean); if (pts.length < 2 || !pts.some(inBox)) continue;
  const closed = pts.length > 3 && w.nodes[0] === w.nodes.at(-1), coords = pts.map(round);
  let k = null, c = null;
  if (t.highway && cls[t.highway]) { k = "road"; c = cls[t.highway]; }
  else if (t.building && closed) k = "building";
  else if (t.natural === "water" && closed) k = "water";
  else if (closed && (["forest", "grass", "meadow", "recreation_ground", "village_green"].includes(t.landuse) || ["wood", "scrub", "grassland"].includes(t.natural) || ["park", "pitch", "garden", "playground"].includes(t.leisure))) { k = "green"; c = t.leisure === "pitch" ? "pitch" : "veg"; }
  if (!k) continue;
  counts[k] = (counts[k] || 0) + 1;
  features.push({ type: "Feature", properties: c ? { k, c } : { k }, geometry: k === "road" ? { type: "LineString", coordinates: coords } : { type: "Polygon", coordinates: [coords] } });
}
writeFileSync("public/basemap.json", JSON.stringify({ type: "FeatureCollection", features }));
console.log("basemap:", JSON.stringify(counts), "->", (JSON.stringify({ features }).length / 1024).toFixed(0), "KB");
