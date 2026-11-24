// Builds data/buildings.json: footprint polygons for every pin sourced from an OpenStreetMap way.
// Reads the OSM way ids from each pin's `source` field in data/pois.json and fetches their outlines from the OSM API.
// Data © OpenStreetMap contributors, ODbL. Usage: node scripts/build-buildings.mjs
import { readFileSync, writeFileSync } from "node:fs";

const pois = JSON.parse(readFileSync("data/pois.json", "utf8"));
const features = [];
for (const p of pois) {
  for (const id of (p.source?.match(/\bw\d+|way \d+/g) ?? []).map((s) => s.replace(/\D/g, ""))) {
    const r = await fetch(`https://api.openstreetmap.org/api/0.6/way/${id}/full.json`, { headers: { "User-Agent": "unilorin-navigator-data-script" } });
    if (!r.ok) { console.warn("skip way", id, r.status); continue; }
    const j = await r.json(), way = j.elements.find((e) => e.type === "way");
    const nodes = new Map(j.elements.filter((e) => e.type === "node").map((e) => [e.id, e]));
    const ring = way.nodes.map((n) => [+nodes.get(n).lon.toFixed(6), +nodes.get(n).lat.toFixed(6)]);
    if (ring.length < 4 || ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1]) continue; // not a closed area
    features.push({ type: "Feature", properties: { id: p.id, name: p.name, category: p.category, osm: "way/" + id }, geometry: { type: "Polygon", coordinates: [ring] } });
    await new Promise((res) => setTimeout(res, 800));
  }
}
writeFileSync("data/buildings.json", JSON.stringify({ type: "FeatureCollection", features }) + "\n");
console.log(`Wrote ${features.length} footprints for ${new Set(features.map((f) => f.properties.id)).size} pins`);
