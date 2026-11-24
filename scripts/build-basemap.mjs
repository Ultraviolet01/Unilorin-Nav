// Builds public/basemap.json, a vector basemap (roads with names, buildings, water, green areas, place names, named POIs)
// from OpenStreetMap, used for the app's "Map"/"Dark" views when no Amazon Location map is configured. Works offline.
// Covers the Main Campus and the UITH / Oja Oba area. Data © OpenStreetMap contributors, ODbL.
// Usage: node scripts/build-basemap.mjs   (several dozen requests to the OSM API; takes a few minutes)
import { writeFileSync } from "node:fs";

const API = "https://api.openstreetmap.org/api/0.6", H = { "User-Agent": "unilorin-navigator-data-script" };
const get = async (u) => { const r = await fetch(u, { headers: H }); if (!r.ok) throw new Error(u + " " + r.status); return r.json(); };
const campus = await get(`${API}/way/1482800400/full.json`);
const cn = new Map(campus.elements.filter((e) => e.type === "node").map((e) => [e.id, e]));
const ring = campus.elements.find((e) => e.type === "way").nodes.map((i) => [cn.get(i).lon, cn.get(i).lat]);
const xs = ring.map((p) => p[0]), ys = ring.map((p) => p[1]), PAD = 0.004;
const BOXES = [[Math.min(...xs) - PAD, Math.min(...ys) - PAD, Math.max(...xs) + PAD, Math.max(...ys) + PAD], [4.512, 8.463, 4.552, 8.497]]; // campus, UITH area
const inRing = (x, y) => { let c = false; for (let i = 0, k = ring.length - 1; i < ring.length; k = i++) { const [xi, yi] = ring[i], [xk, yk] = ring[k]; if ((yi > y) !== (yk > y) && x < ((xk - xi) * (y - yi)) / (yk - yi) + xi) c = !c; } return c; };

const nodes = new Map(), ways = new Map();
for (const box of BOXES) for (let lng = box[0]; lng < box[2]; lng += 0.02) for (let lat = box[1]; lat < box[3]; lat += 0.02) {
  const j = await get(`${API}/map.json?bbox=${lng.toFixed(4)},${lat.toFixed(4)},${Math.min(lng + 0.02, box[2] + 0.02).toFixed(4)},${Math.min(lat + 0.02, box[3] + 0.02).toFixed(4)}`);
  for (const e of j.elements ?? []) { if (e.type === "node") nodes.set(e.id, e); else if (e.type === "way") ways.set(e.id, e); }
  await new Promise((r) => setTimeout(r, 1000));
}

const cls = { trunk: "major", primary: "major", secondary: "major", tertiary: "major", trunk_link: "major", primary_link: "major", secondary_link: "major", tertiary_link: "major",
  residential: "minor", unclassified: "minor", living_street: "minor", service: "service", track: "service", path: "path", footway: "path", pedestrian: "path", cycleway: "path" };
const r5 = (p) => [+p.lon.toFixed(5), +p.lat.toFixed(5)];
// OSM names from address imports are messy ("Oja Tuntun, Oko Erin, Nigeria", plus-codes like "FJHH+V7Q"), keep only a clean first part.
const clean = (s) => { if (!s) return undefined; const n = s.split(",")[0].trim(); return n.length < 2 || /^[A-Z0-9]{4}\+[A-Z0-9]{2,}/.test(n) ? undefined : n.slice(0, 40); };
const inBox = (p) => BOXES.some((b) => p.lon > b[0] && p.lon < b[2] && p.lat > b[1] && p.lat < b[3]);
const features = [{ type: "Feature", properties: { k: "campus", n: "University of Ilorin" }, geometry: { type: "Polygon", coordinates: [ring.map((p) => [+p[0].toFixed(6), +p[1].toFixed(6)])] } }];
const counts = {}, add = (k, props, geometry) => { counts[k] = (counts[k] || 0) + 1; features.push({ type: "Feature", properties: { k, ...props }, geometry }); };

for (const w of ways.values()) {
  const t = w.tags; if (!t) continue;
  const pts = (w.nodes ?? []).map((i) => nodes.get(i)).filter(Boolean); if (pts.length < 2 || !pts.some(inBox)) continue;
  const closed = pts.length > 3 && w.nodes[0] === w.nodes.at(-1), coords = pts.map(r5), name = clean(t.name);
  if (t.highway && cls[t.highway]) add("road", { c: cls[t.highway], ...(name && cls[t.highway] !== "path" ? { n: name } : {}) }, { type: "LineString", coordinates: coords });
  else if (t.building && closed) { if (pts.some((p) => p.lon > BOXES[0][0] && p.lon < BOXES[0][2] && p.lat > BOXES[0][1] && p.lat < BOXES[0][3])) add("building", {}, { type: "Polygon", coordinates: [coords] }); } // footprints for the campus only (the city has ~23k, too heavy)
  else if (t.natural === "water" && closed) add("water", name ? { n: name } : {}, { type: "Polygon", coordinates: [coords] });
  else if (closed && (["forest", "grass", "meadow", "recreation_ground", "village_green", "cemetery"].includes(t.landuse) || ["wood", "scrub", "grassland"].includes(t.natural) || ["park", "pitch", "garden", "playground", "stadium"].includes(t.leisure)))
    add("green", { c: t.leisure === "pitch" || t.leisure === "stadium" ? "pitch" : "veg", ...(name ? { n: name } : {}) }, { type: "Polygon", coordinates: [coords] });
}

const poiClass = (t) => t.amenity === "restaurant" || t.amenity === "cafe" || t.amenity === "fast_food" || t.amenity === "bar" || t.amenity === "food_court" ? "food"
  : t.shop || t.amenity === "marketplace" ? "shop" : ["hospital", "clinic", "pharmacy", "doctors", "dentist"].includes(t.amenity) ? "health"
  : ["school", "university", "college", "kindergarten"].includes(t.amenity) ? "edu" : t.amenity === "place_of_worship" ? "worship" : ["bank", "atm"].includes(t.amenity) ? "bank"
  : t.tourism === "hotel" || t.tourism === "guest_house" || t.tourism === "hostel" ? "lodging" : t.leisure === "park" || t.leisure === "pitch" || t.leisure === "stadium" ? "park" : t.amenity === "fuel" ? "fuel" : null;
for (const n of nodes.values()) {
  const t = n.tags, nm = clean(t?.name); if (!nm || !inBox(n)) continue;
  if (t.place && ["suburb", "neighbourhood", "quarter", "village", "hamlet", "town", "city", "locality"].includes(t.place)) { add("place", { n: nm, c: t.place }, { type: "Point", coordinates: r5(n) }); continue; }
  const c = poiClass(t); if (!c || inRing(n.lon, n.lat)) continue; // pins inside the campus are our own
  add("poi", { n: nm, c }, { type: "Point", coordinates: r5(n) });
}
const out = JSON.stringify({ type: "FeatureCollection", features });
writeFileSync("public/basemap.json", out);
console.log("basemap:", JSON.stringify(counts), "->", (out.length / 1024).toFixed(0), "KB");
